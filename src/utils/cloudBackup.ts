// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: any;      // puede venir string u objeto según backend
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
  "trademind_backup",
] as const;

type BackupPayload = {
  version: number;
  timestamp: string; // ISO
  data: Record<string, any>;
};

const KEY_LOCAL_LAST_CHANGE = "tm_local_last_change_at";
const KEY_LOCAL_LAST_HASH = "tm_local_last_hash";
const KEY_CLOUD_LAST_RESTORE = "tm_cloud_last_restore_at";
const KEY_SESSION_RESTORE_DONE = "tm_cloud_restore_done";

let isRestoring = false;

// stringify estable (para comparar contenido y evitar “cambios fantasma”)
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

function hashString(s: string): string {
  // hash simple (djb2) suficiente para detectar cambios
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

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

function buildLocalBackupPayload(): { payload: BackupPayload; hash: string } | null {
  const data: Record<string, any> = {};
  let hasAny = false;

  for (const key of STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw == null) continue;

    hasAny = true;
    const parsed = safeParse<any>(raw);
    data[key] = parsed ?? raw; // si no parsea, guardamos string
  }

  if (!hasAny) return null;

  const payload: BackupPayload = {
    version: 1,
    timestamp: new Date().toISOString(),
    data,
  };

  const stable = stableStringify(payload.data);
  const hash = hashString(stable);

  return { payload, hash };
}

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
  const built = buildLocalBackupPayload();
  if (!built) return;

  const { payload, hash } = built;
  const lastHash = localStorage.getItem(KEY_LOCAL_LAST_HASH);

  // Si el contenido no cambió, no subas y NO marques “cambio local”
  if (lastHash && lastHash === hash) return;

  const res = await fetch("/api/backup", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // SIEMPRE string (backend consistente)
      backup_json: JSON.stringify(payload),
      updated_at: Date.now(),
      version: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`PUT /api/backup failed (${res.status})`);
  }

  // Solo aquí marcamos cambio local “real”
  localStorage.setItem(KEY_LOCAL_LAST_HASH, hash);
  localStorage.setItem(KEY_LOCAL_LAST_CHANGE, String(Date.now()));
}

// Debounce para no spamear PUT /api/backup
let syncTimer: number | null = null;

export function scheduleCloudUploadDebounced(delayMs = 1500): void {
  if (isRestoring) return;
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    uploadLocalBackupToCloud().catch((err) => {
      console.error("uploadLocalBackupToCloud error:", err);
    });
  }, delayMs);
}

/**
 * Restaura desde la nube si la nube es más nueva que el último restore
 * y también más nueva que los cambios locales.
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    if (sessionStorage.getItem(KEY_SESSION_RESTORE_DONE) === "1") return;

    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    // backup_json puede venir como string u objeto (compatibilidad)
    let cloudPayload: BackupPayload | null = null;

    if (typeof cloud.backup_json === "string") {
      cloudPayload = safeParse<BackupPayload>(cloud.backup_json);
    } else if (cloud.backup_json && typeof cloud.backup_json === "object") {
      // ya es objeto
      cloudPayload = cloud.backup_json as BackupPayload;
    }

    if (!cloudPayload?.data) return;

    const cloudUpdatedAt = Number(cloud.updated_at ?? 0);
    const lastRestoreAt = Number(localStorage.getItem(KEY_CLOUD_LAST_RESTORE) ?? 0);
    const localLastChangeAt = Number(localStorage.getItem(KEY_LOCAL_LAST_CHANGE) ?? 0);

    // Si el usuario hizo cambios locales más recientes que la nube, NO sobre-escribas.
    // (con el hash fix, esto ya no se dispara “por accidente”)
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

    // Recarga para que React re-lea localStorage
    window.location.reload();
  } catch (err) {
    console.error("syncFromCloudOnStartup error:", err);
  }
}

/**
 * Inicializa el sync completo:
 * - patch localStorage setItem/removeItem (solo para keys que importan)
 * - sube cambios con debounce
 * - restore al entrar y al volver (visibility/focus)
 */
export function initCloudSync(): (() => void) | void {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  const shouldSyncKey = (k: string) => (STORAGE_KEYS as readonly string[]).includes(k);

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);

    if (!isRestoring && shouldSyncKey(key)) {
      // No marques “cambio” aquí: solo agenda upload;
      // el upload decide si realmente cambió (hash).
      scheduleCloudUploadDebounced(1500);
    }
  };

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);

    if (!isRestoring && shouldSyncKey(key)) {
      scheduleCloudUploadDebounced(1500);
    }
  };

  // Primer restore
  syncFromCloudOnStartup().catch(console.error);

  const onVisible = () => {
    if (document.visibilityState === "visible") {
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

  const onBeforeUnload = () => {
    uploadLocalBackupToCloud().catch(() => {});
  };
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    localStorage.setItem = originalSetItem;
    localStorage.removeItem = originalRemoveItem;

    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
