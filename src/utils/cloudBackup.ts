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

// Keys reales que tu App.tsx usa
const STORAGE_KEYS = [
  "trading_journal_trades",
  "trading_journal_global_notes",
  "trading_journal_accounts",
  "trading_journal_active_account",
  "trading_journal_profile",
  "trading_journal_playbook",
  "trading_journal_chat_history",
  "trading_journal_milestones",
] as const;

type BackupPayload = {
  version: number;
  timestamp: string; // ISO
  data: Record<string, any>;
};

export async function fetchCloudBackup(): Promise<CloudBackupRow> {
  const res = await fetch("/api/backup", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as CloudBackupRow;
}

function buildLocalBackupPayload(): BackupPayload | null {
  const data: Record<string, any> = {};
  let hasAny = false;

  for (const key of STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      hasAny = true;
      const parsed = safeParse<any>(raw);
      data[key] = parsed ?? raw; // si no parsea, guardamos string
    }
  }

  if (!hasAny) return null;

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    data,
  };
}

function applyBackupPayloadToLocal(payload: BackupPayload) {
  for (const [key, value] of Object.entries(payload.data || {})) {
    if (typeof value === "string") {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
}

export async function uploadLocalBackupToCloud(): Promise<void> {
  const payload = buildLocalBackupPayload();
  if (!payload) return;

  await fetch("/api/backup", {
    method: "PUT",
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
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    uploadLocalBackupToCloud().catch((err) => {
      console.error("uploadLocalBackupToCloud error:", err);
    });
  }, delayMs);
}

export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    // Evita loops por sesión
    if (sessionStorage.getItem("tm_cloud_restore_done") === "1") return;

    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    const cloudPayload = safeParse<BackupPayload>(cloud.backup_json);
    if (!cloudPayload?.data) return;

    const cloudUpdatedAt = Number(cloud.updated_at ?? 0);
    const localUpdatedAt = Number(localStorage.getItem("tm_cloud_last_restore_at") ?? 0);

    if (cloudUpdatedAt > localUpdatedAt) {
      applyBackupPayloadToLocal(cloudPayload);

      localStorage.setItem("tm_cloud_last_restore_at", String(cloudUpdatedAt));
      sessionStorage.setItem("tm_cloud_restore_done", "1");

      window.location.reload();
    } else {
      sessionStorage.setItem("tm_cloud_restore_done", "1");
    }
  } catch (err) {
    console.error("syncFromCloudOnStartup error:", err);
  }
}
