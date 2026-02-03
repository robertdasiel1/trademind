// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: string; // en tu API viene como string JSON
  updated_at: number;  // ms
  version: number;
};

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Keys reales que tu App guarda en localStorage (las que estás sincronizando)
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

// Marcadores locales (no tocan tus datos, solo controlan sync)
const LS_LOCAL_UPDATED_AT = "tm_local_updated_at";         // "último cambio local" (ms)
const LS_CLOUD_LAST_PULL_AT = "tm_cloud_last_pull_at";     // último updated_at cloud aplicado (ms)
const LS_CLOUD_LAST_PUSH_AT = "tm_cloud_last_push_at";     // último push hecho (ms)

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

/**
 * Sube el estado local actual (las STORAGE_KEYS) a la nube.
 * Marca tm_cloud_last_push_at.
 */
export async function uploadLocalBackupToCloud(): Promise<void> {
  const payload = buildLocalBackupPayload();
  if (!payload) return;

  const res = await fetch("/api/backup", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backup_json: payload,
      updated_at: Date.now(),
      version: 1,
    }),
  });

  if (res.ok) {
    localStorage.setItem(LS_CLOUD_LAST_PUSH_AT, String(Date.now()));
  }
}

// Debounce para no spamear PUT /api/backup
let syncTimer: number | null = null;

/**
 * Llama esto cada vez que tu app cambie datos (trades/notas/etc).
 * Ideal: llamarlo justo después de guardar en localStorage las keys reales.
 */
export function scheduleCloudUploadDebounced(delayMs = 1200): void {
  // Marca “hubo cambios locales”
  localStorage.setItem(LS_LOCAL_UPDATED_AT, String(Date.now()));

  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    uploadLocalBackupToCloud().catch((err) => {
      console.error("uploadLocalBackupToCloud error:", err);
    });
  }, delayMs);
}

/**
 * Sync principal (bidireccional):
 * 1) PULL: si cloud.updated_at > localUpdatedAt  => baja cloud y aplica
 * 2) PUSH: si localUpdatedAt > cloud.updated_at  => sube local a cloud
 *
 * Esto hace que:
 * - al abrir en el teléfono, se traiga lo último del PC
 * - si el teléfono fue el último en editar, empuja su versión a la nube
 *
 * Llamar en startup (después de estar autenticado) y también en refresh.
 */
let inFlightSync: Promise<void> | null = null;

export async function syncFromCloudOnStartup(): Promise<void> {
  // evita múltiples llamadas simultáneas en el mismo render/refresco
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    try {
      const cloud = await fetchCloudBackup();
      if (!cloud) return;

      const cloudPayload = safeParse<BackupPayload>(cloud.backup_json);
      if (!cloudPayload?.data) return;

      const cloudUpdatedAt = Number(cloud.updated_at ?? 0);

      // “último cambio local”
      const localUpdatedAt = Number(localStorage.getItem(LS_LOCAL_UPDATED_AT) ?? 0);

      // Si nunca has marcado local changes pero tienes data local, asumimos que local existe:
      // (esto ayuda cuando vienes de versiones viejas)
      const localHasData = STORAGE_KEYS.some((k) => localStorage.getItem(k) != null);
      const effectiveLocalUpdatedAt = localUpdatedAt || (localHasData ? 1 : 0);

      // 1) PULL si cloud es más nuevo
      if (cloudUpdatedAt > effectiveLocalUpdatedAt) {
        applyBackupPayloadToLocal(cloudPayload);

        localStorage.setItem(LS_LOCAL_UPDATED_AT, String(cloudUpdatedAt));
        localStorage.setItem(LS_CLOUD_LAST_PULL_AT, String(cloudUpdatedAt));

        // No hagas reload obligatorio: si tu App lee desde localStorage con useEffect,
        // esto ya debería reflejarse. Pero si tu App solo carga una vez,
        // descomenta el reload.
        window.location.reload();
        return;
      }

      // 2) PUSH si local es más nuevo que cloud
      if (effectiveLocalUpdatedAt > cloudUpdatedAt) {
        await uploadLocalBackupToCloud();
        return;
      }

      // Si están iguales, no hacemos nada.
    } catch (err) {
      console.error("syncFromCloudOnStartup error:", err);
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}
