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
 * Base keys (sin prefijo), se guardan como:
 * trading_journal_<userId>_<baseKey>
 */
const BASE_STORAGE_KEYS = [
  "trades",
  "global_notes",
  "accounts",
  "active_account",
  "profile",
  "playbook",
  "chat_history",
  "milestones",
  "trademind_backup",
] as const;

/**
 * Scope actual (userId) para evitar mezclar usuarios.
 * Lo setea App.tsx con setCloudSyncUserScope(userId).
 */
let scopedUserId: string | null = null;

function userPrefix(userId: string): string {
  return `trading_journal_${userId}_`;
}

function scopedKey(userId: string, baseKey: string): string {
  return userPrefix(userId) + baseKey;
}

export function setCloudSyncUserScope(userId: string) {
  scopedUserId = userId;
}

export function clearCloudSyncUserScope() {
  scopedUserId = null;
}

function requireUserId(): string {
  if (!scopedUserId) throw new Error("cloudBackup: user scope not set (userId missing)");
  return scopedUserId;
}

export function getUserScopedStorageKeys(userId: string): string[] {
  return BASE_STORAGE_KEYS.map(k => scopedKey(userId, k));
}

/**
 * Meta keys también deben ser por usuario (si no, un restore del user A afecta al user B)
 */
function metaKey(userId: string, name: string): string {
  return `tm_${userId}_${name}`;
}

export function getUserScopedMetaKeys(userId: string): string[] {
  return [
    metaKey(userId, "local_last_change_at"),
    metaKey(userId, "local_last_hash"),
    metaKey(userId, "cloud_last_restore_at"),
    metaKey(userId, "cloud_restore_done"),
  ];
}

function getMetaKeys(userId: string) {
  return {
    KEY_LOCAL_LAST_CHANGE: metaKey(userId, "local_last_change_at"),
    KEY_LOCAL_LAST_HASH: metaKey(userId, "local_last_hash"),
    KEY_CLOUD_LAST_RESTORE: metaKey(userId, "cloud_last_restore_at"),
    KEY_SESSION_RESTORE_DONE: metaKey(userId, "cloud_restore_done"),
  } as const;
}

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

function buildLocalBackupPayload(userId: string): { payload: BackupPayload; hash: string } | null {
  const data: Record<string, any> = {};
  let hasAny = false;

  for (const baseKey of BASE_STORAGE_KEYS) {
    const fullKey = scopedKey(userId, baseKey);
    const raw = localStorage.getItem(fullKey);
    if (raw == null) continue;

    hasAny = true;
    const parsed = safeParse<any>(raw);
    data[fullKey] = parsed ?? raw; // guardamos con la key completa (scoped)
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
function markLocalChangeIfContentChanged(userId: string): void {
  if (isRestoring) return;

  const built = buildLocalBackupPayload(userId);
  if (!built) return;

  const { KEY_LOCAL_LAST_HASH, KEY_LOCAL_LAST_CHANGE } = getMetaKeys(userId);

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

function applyBackupPayloadToLocal(userId: string, payload: BackupPayload) {
  isRestoring = true;
  try {
    for (const [key, value] of Object.entries(payload.data || {})) {
      // key ya viene scoped (ej: trading_journal_<userId>_trades)
      // seguridad extra: no aplicar keys que no correspondan al user
      if (!key.startsWith(userPrefix(userId))) continue;

      if (typeof value === "string") localStorage.setItem(key, value);
      else localStorage.setItem(key, JSON.stringify(value));
    }
  } finally {
    isRestoring = false;
  }

  const built = buildLocalBackupPayload(userId);
  if (built) {
    const { KEY_LOCAL_LAST_HASH } = getMetaKeys(userId);
    localStorage.setItem(KEY_LOCAL_LAST_HASH, built.hash);
  }
}

export async function uploadLocalBackupToCloud(): Promise<void> {
  const userId = requireUserId();
  const built = buildLocalBackupPayload(userId);
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

  const { KEY_CLOUD_LAST_RESTORE, KEY_SESSION_RESTORE_DONE } = getMetaKeys(userId);

  localStorage.setItem(KEY_CLOUD_LAST_RESTORE, String(now));
  sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
}

// Debounce PUT
let syncTimer: number | null = null;

export function scheduleCloudUploadDebounced(delayMs = 1500): void {
  if (isRestoring) return;

  const userId = scopedUserId;
  if (!userId) return;

  markLocalChangeIfContentChanged(userId);

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
  const userId = scopedUserId;
  if (!userId) return;

  const { KEY_CLOUD_LAST_RESTORE, KEY_SESSION_RESTORE_DONE, KEY_LOCAL_LAST_CHANGE } = getMetaKeys(userId);

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

    if (localLastChangeAt > cloudUpdatedAt) {
      sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
      return;
    }

    if (cloudUpdatedAt <= lastRestoreAt) {
      sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");
      return;
    }

    applyBackupPayloadToLocal(userId, cloudPayload);

    localStorage.setItem(KEY_CLOUD_LAST_RESTORE, String(cloudUpdatedAt));
    sessionStorage.setItem(KEY_SESSION_RESTORE_DONE, "1");

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

  const shouldSyncKey = (k: string) => {
    const userId = scopedUserId;
    if (!userId) return false;
    return k.startsWith(userPrefix(userId));
  };

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
    if (!scopedUserId) return;
    const { KEY_SESSION_RESTORE_DONE } = getMetaKeys(scopedUserId);
    if (document.visibilityState === "visible") {
      sessionStorage.removeItem(KEY_SESSION_RESTORE_DONE);
      syncFromCloudOnStartup().catch(console.error);
    }
  };

  const onFocus = () => {
    if (!scopedUserId) return;
    const { KEY_SESSION_RESTORE_DONE } = getMetaKeys(scopedUserId);
    sessionStorage.removeItem(KEY_SESSION_RESTORE_DONE);
    syncFromCloudOnStartup().catch(console.error);
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);

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
