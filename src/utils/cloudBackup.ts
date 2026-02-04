// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: string;
  updated_at: number;
  version: number;
};

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Keys reales que tu app guarda en localStorage y que queremos sincronizar.
 * (Si agregas nuevos keys en el futuro, añádelos aquí.)
 */
const STORAGE_KEYS = [
  "trading_journal_trades",
  "trading_journal_global_notes",
  "trading_journal_accounts",
  "trading_journal_active_account",
  "trading_journal_profile",
  "trading_journal_playbook",
  "trading_journal_chat_history",
  "trading_journal_milestones",
  // Compatibilidad con backups antiguos (si existe en tu app)
  "trademind_backup",
] as const;

type BackupPayload = {
  version: number;
  timestamp: string; // ISO
  data: Record<string, any>;
};

const KEY_LOCAL_LAST_CHANGE = "tm_local_last_change_at";
const KEY_CLOUD_LAST_RESTORE = "tm_cloud_last_restore_at";
const KEY_SESSION_RESTORE_DONE = "tm_cloud_restore_done";

export async function fetchCloudBackup(): Promise<CloudBackupRow> {
  const res = await fetch("/api/backup", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  return (await res.json()) as CloudBackupRow;
}

function buildLocalBackupPayload(): BackupPayload | null {
  const data: Record<string, any> = {};
  let hasAny = false;

  for (const key of STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw == null) continue;

    hasAny = true;
    const parsed = safeParse<any>(raw);
    // si no parsea, guardamos el string tal cual
    data[key] = parsed ?? raw;
  }

  if (!hasAny) return null;

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    data,
  };
}

let isRestoring = false;

function applyBackupPayloadToLocal(payload: BackupPayload) {
  isRestoring = true;
  try {
    for (const [key, value] of Object.entries(payload.data || {})) {
      if (typeof value === "string") {
        localStorage.setItem(key, value);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }
  } finally {
    isRestoring = false;
  }
}

export async function uploadLocalBackupToCloud(): Promise<void> {
  const payload = buildLocalBackupPayload();
  if (!payload) return;

  await fetch("/api/backup", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backup_json: payload,
      updated_at: Date.now(),
      version: 1,
    }),
  });
}

// Debounce para no spamear PUT /api/backup
let syncTimer: number | null = null;

export function scheduleCloudUploadDebounced(delayMs = 1500): void {
  if (isRestoring) return; // evita subir mientras restauramos
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    uploadLocalBackupToCloud()
      .then(() => {
        // marca último upload/cambio (útil para decidir si cloud es más nuevo)
        localStorage.setItem(KEY_LOCAL_LAST_CHANGE, String(Date.now()));
      })
      .catch((err) => {
        console.error("uploadLocalBackupToCloud error:", err);
      });
  }, delayMs);
}

/**
 * Restaura desde la nube si la nube es más nueva que el último restore
 * y también más nueva que los cambios locales.
 *
 * IMPORTANTE: Esto solo debe correr cuando el usuario ya está autenticado
 * (por eso lo llamamos desde App.tsx cuando authStatus === 'authenticated').
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    // Evita loops por sesión
    if (sessionStorage.getItem(KEY_SESSION_RESTORE_DONE) === "1") return;

    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    const cloudPayload = safeParse<BackupPayload>(cloud.backup_json);
    if (!cloudPayload?.data) return;

    const cloudUpdatedAt = Number(cloud.updated_at ?? 0);
    const lastRestoreAt = Number(localStorage.getItem(KEY_CLOUD_LAST_RESTORE) ?? 0);
    const localLastChangeAt = Number(localStorage.getItem(KEY_LOCAL_LAST_CHANGE) ?? 0);

    // Si el usuario hizo cambios locales más recientes que la nube, NO sobre-escribas.
    if (localLastChangeAt > cloudUpdatedAt) {
      sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
      return;
    }

    // Si ya restauramos algo igual o más nuevo, no hagas nada.
    if (cloudUpdatedAt <= lastRestoreAt) {
      sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
      return;
    }

    applyBackupPayloadToLocal(cloudPayload);

    localStorage.setItem(KEY_CLOUD_LAST_RESTORE, String(cloudUpdatedAt));
    sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");

    // Recarga para que React re-lea localStorage y actualice estados iniciales
    window.location.reload();
  } catch (err) {
    console.error("syncFromCloudOnStartup error:", err);
  }
}

/**
 * Inicializa el sync completo:
 * - instala un hook para detectar cambios en localStorage (setItem/removeItem)
 * - sube cambios con debounce
 * - intenta restaurar desde cloud al entrar
 * - intenta restaurar al volver a la pestaña (visibilitychange/focus)
 *
 * Devuelve una función cleanup para desinstalar los hooks.
 */
export function initCloudSync(): (() => void) | void {
  // 1) Patch localStorage.setItem/removeItem para auto-upload
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  const shouldSyncKey = (k: string) => (STORAGE_KEYS as readonly string[]).includes(k);

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);

    if (!isRestoring && shouldSyncKey(key)) {
      // marca que hubo cambio local
      originalSetItem(KEY_LOCAL_LAST_CHANGE, String(Date.now()));
      scheduleCloudUploadDebounced(1500);
    }
  };

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);

    if (!isRestoring && shouldSyncKey(key)) {
      originalSetItem(KEY_LOCAL_LAST_CHANGE, String(Date.now()));
      scheduleCloudUploadDebounced(1500);
    }
  };

  // 2) Primer intento de restore al iniciar
  syncFromCloudOnStartup().catch(console.error);

  // 3) Reintenta restore cuando vuelves a la app/pestaña
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      // permite 1 restore más por sesión cuando vuelves (sin loop)
      sessionStorage.removeItem(KEY_SESSION_RESTORE_DONE);
      syncFromCloudOnStartup().catch(console.error);
    }
  };

  const onFocus = () => {
    sessionStorage.removeItem(KEY_SESSION_RESTORE_DONE);
    syncFromCloudOnStartup().catch(console.error);
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);

  // 4) Best-effort: antes de salir, intenta subir lo último
  const onBeforeUnload = () => {
    uploadLocalBackupToCloud().catch(() => {});
  };
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    // restore originals
    localStorage.setItem = originalSetItem;
    localStorage.removeItem = originalRemoveItem;

    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
