// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: string; // viene como string JSON desde tu API
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

/**
 * Convierte un timestamp local que puede venir como:
 * - number (ms)
 * - string tipo "2026-02-02T22:52:03.739Z_84_first_win"
 * - string ISO normal "2026-02-02T22:52:03.739Z"
 * a ms (number). Si no se puede, retorna 0.
 */
function parseLocalTimestampToMs(t: unknown): number {
  if (typeof t === "number" && Number.isFinite(t)) return t;

  if (typeof t === "string") {
    // en tu caso viene con sufijo "_84_first_win", nos quedamos con la parte ISO
    const iso = t.split("_")[0];
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

/**
 * Descarga el backup del usuario desde /api/backup.
 * Devuelve null si no hay backup todavía o si no estás autenticado.
 */
export async function fetchCloudBackup(): Promise<CloudBackupRow> {
  const res = await fetch("/api/backup", { method: "GET" });
  if (!res.ok) {
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
 * Al iniciar la app (y ya autenticado):
 * - baja el backup cloud
 * - compara (cloud.updated_at) vs (local timestamp parseado)
 * - si cloud es más nuevo, reemplaza local y recarga la app
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    const cloudObj = safeParse<any>(cloud.backup_json);
    if (!cloudObj) return;

    // En cloud el timestamp confiable es updated_at (ms)
    const cloudTs = Number(cloud.updated_at ?? 0);

    // En local tu timestamp es string con sufijo, lo parseamos bien
    const localStr = localStorage.getItem("trademind_backup");
    const localObj = localStr ? safeParse<any>(localStr) : null;
    const localTs = parseLocalTimestampToMs(localObj?.timestamp);

    // Si no hay local o el cloud es más nuevo, restaurar
    if (cloudTs > localTs) {
      localStorage.setItem("trademind_backup", JSON.stringify(cloudObj));
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
