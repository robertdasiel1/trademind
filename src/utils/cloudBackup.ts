// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: any; // puede venir string u objeto
  updated_at: number;
  version: number;
};

type BackupPayload = {
  version: number;
  timestamp: string; // ISO
  data: Record<string, any>;
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

const KEY_LOCAL_LAST_CHANGE = "tm_local_last_change_at";
const KEY_LOCAL_LAST_HASH = "tm_local_last_hash";
const KEY_CLOUD_LAST_RESTORE = "tm_cloud_last_restore_at";
const KEY_SESSION_RESTORE_DONE = "tm_cloud_restore_done";

let isRestoring = false;

// stringify estable para comparar contenido
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

// hash simple
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
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

/**
 * Marca cambio local REAL antes de subir.
 */
function markLocalChangeIfContentChanged(): void {
  if (isRestoring) return;

  const built = buildLocalBackupPayload();
  if (!built) return;

  const { hash } = built;
  const lastHash = localStorage.getItem(KEY_LOCAL_LAST_HASH);

  if (lastHash !== hash) {
    localStorage.setItem(KEY_LOCAL_LAST_HASH, hash);
    localStorage.setItem(KEY_LOCAL_LAST_CHANGE, String(Date.now()));
  }
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

function applyBackupPayloadToLocal(payload: BackupPayload) {
  isRestoring = true;
  try {
    for (const [key, value] of Object.entries(payload.data || {})) {
      if (typeof value === "string") localStorage.setItem(key, value);
      else localStorage.setItem(key, JSON.stringify(value));
    }
  } finally {
    isRestoring = false;
  }

  // actualiza hash local al contenido restaurado
  const built = buildLocalBackupPayload();
  if (built) localStorage.setItem(KEY_LOCAL_LAST_HASH, built.hash);
}

export async function uploadLocalBackupToCloud(): Promise<void> {
  const built = buildLocalBackupPayload();
  if (!built) return;

  const { payload } = built;
  const now = Date.now();

  const res = await fetch("/api/backup", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backup_json: JSON.stringify(payload),
      updated_at: now,
      version: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`PUT /api/backup failed (${res.status})`);
  }

  // ✅ CLAVE: si yo acabo de subir, cloud ya tiene mi versión
  // Esto evita restores repetidos + recargas que se ven como “me saca al login”.
  localStorage.setItem(KEY_CLOUD_LAST_RESTORE, String(now));
  sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
}

// Debounce PUT
let syncTimer: number | null = null;

export function scheduleCloudUploadDebounced(delayMs = 1500): void {
  if (isRestoring) return;

  markLocalChangeIfContentChanged();

  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    uploadLocalBackupToCloud().catch(err => console.error("uploadLocalBackupToCloud error:", err));
  }, delayMs);
}

/**
 * Restore desde cloud si cloud es más nuevo que:
 * - el último restore
 * - y que el último cambio local REAL
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    if (sessionStorage.getItem(KEY_SESSION_RESTORE_DONE) === "1") return;

    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    let cloudPayload: BackupPayload | null = null;
    if (typeof cloud.backup_json === "string") cloudPayload = safeParse<BackupPayload>(cloud.backup_json);
    else if (cloud.backup_json && typeof cloud.backup_json === "object") cloudPayload = cloud.backup_json as BackupPayload;

    if (!cloudPayload?.data) return;

    const cloudUpdatedAt = Number(cloud.updated_at ?? 0);
    const lastRestoreAt = Number(localStorage.getItem(KEY_CLOUD_LAST_RESTORE) ?? 0);
    const localLastChangeAt = Number(localStorage.getItem(KEY_LOCAL_LAST_CHANGE) ?? 0);

    // Si local es más nuevo, NO pises
    if (localLastChangeAt > cloudUpdatedAt) {
      sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
      return;
    }

    // Si ya restauramos algo igual o más nuevo, no hagas nada
    if (cloudUpdatedAt <= lastRestoreAt) {
      sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
      return;
    }

    applyBackupPayloadToLocal(cloudPayload);

    localStorage.setItem(KEY_CLOUD_LAST_RESTORE, String(cloudUpdatedAt));
    sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");

    // ✅ NO recargamos la página (eso rompe la sesión en muchos móviles).
    // Avisamos a la app para que rehidrate estado desde localStorage.
    window.dispatchEvent(new CustomEvent("tm_cloud_restored", { detail: { updatedAt: cloudUpdatedAt } }));
  } catch (err) {
    console.error("syncFromCloudOnStartup error:", err);
  }
}

/**
 * Hook completo:
 * - patch localStorage setItem/removeItem
 * - schedule upload con debounce
 * - restore en focus/visibility
 */
export function initCloudSync(): (() => void) | void {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  const shouldSyncKey = (k: string) => (STORAGE_KEYS as readonly string[]).includes(k);

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (!isRestoring && shouldSyncKey(key)) scheduleCloudUploadDebounced(1200);
  };

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);
    if (!isRestoring && shouldSyncKey(key)) scheduleCloudUploadDebounced(1200);
  };

  // restore inicial
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

  // ⚠️ beforeunload no es confiable en móviles → agregamos pagehide y hidden
  const flush = () => {
    uploadLocalBackupToCloud().catch(() => {});
  };
  const onBeforeUnload = () => flush();
  const onPageHide = () => flush();
  const onHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };

  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onHidden);

  return () => {
    localStorage.setItem = originalSetItem;
    localStorage.removeItem = originalRemoveItem;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onHidden);
  };
}
