// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: string; // viene como string JSON desde tu API
  updated_at: number;  // ms (según como lo estás guardando)
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
 * Descarga el backup del usuario desde /api/backup.
 * Devuelve null si no hay backup todavía.
 */
export async function fetchCloudBackup(): Promise<CloudBackupRow> {
  const res = await fetch("/api/backup", { method: "GET" });
  if (!res.ok) {
    // Si no estás logueado o hay fallo, no rompas la app
    return null;
  }
  return (await res.json()) as CloudBackupRow;
}

/**
 * Sube el backup local actual (trademind_backup) a /api/backup.
 */
export async function uploadLocalBackupToCloud(): Promise<void> {
  const localStr = localStorage.getItem("trademind_backup");
  if (!localStr) return;

  const localObj = safeParse<any>(localStr);
  if (!localObj) return;

  await fetch("/api/backup", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backup_json: localObj,
      updated_at: Date.now(),
      version: 1,
    }),
  });
}

/**
 * Al iniciar la app:
 * - baja el backup cloud
 * - compara timestamps (cloud.updated_at vs local.timestamp)
 * - si cloud es más nuevo, reemplaza local y recarga la app
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    const cloudObj = safeParse<any>(cloud.backup_json);
    if (!cloudObj) return;

    const cloudTs = Number(cloud.updated_at ?? cloudObj?.timestamp ?? 0);

    const localStr = localStorage.getItem("trademind_backup");
    const localObj = localStr ? safeParse<any>(localStr) : null;
    const localTs = Number(localObj?.timestamp ?? 0);

    if (cloudTs > localTs) {
      localStorage.setItem("trademind_backup", JSON.stringify(cloudObj));
      // Fuerza a tu app a re-cargar desde localStorage
      window.location.reload();
    }
  } catch (err) {
    console.error("syncFromCloudOnStartup error:", err);
  }
}

// Debounce para no spamear PUT /api/backup
let syncTimer: number | null = null;

/**
 * Llama esto cada vez que tu app actualice/sobrescriba "trademind_backup".
 * Ejemplo: justo después de localStorage.setItem("trademind_backup", ...)
 */
export function scheduleCloudUploadDebounced(delayMs = 1500): void {
  if (syncTimer) window.clearTimeout(syncTimer);

  syncTimer = window.setTimeout(() => {
    uploadLocalBackupToCloud().catch((err) => {
      console.error("uploadLocalBackupToCloud error:", err);
    });
  }, delayMs);
}
