// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: string; // viene como string JSON desde tu API
  updated_at: number; // ms
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
 * Convierte un timestamp que puede venir como:
 * - number (ms)
 * - string tipo "2026-02-02T22:52:03.739Z_84_first_win"
 * - string ISO normal "2026-02-02T22:52:03.739Z"
 * a ms (number). Si no se puede, retorna 0.
 */
function parseTimestampToMs(t: unknown): number {
  if (typeof t === "number" && Number.isFinite(t)) return t;

  if (typeof t === "string") {
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
  if (!res.ok) return null;
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
 * Al iniciar la app (ya autenticado):
 * - baja el backup cloud
 * - compara timestamps del BACKUP (cloud.backup_json.timestamp vs local.timestamp)
 * - si cloud es más nuevo, reemplaza local y recarga la app
 *
 * Importante: NO comparamos cloud.updated_at contra local.timestamp porque eso puede causar reload infinito.
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  try {
    // Protección extra contra loops en la misma sesión del navegador
    if (sessionStorage.getItem("tm_cloud_sync_done") === "1") return;

    const cloud = await fetchCloudBackup();
    if (!cloud) return;

    const cloudObj = safeParse<any>(cloud.backup_json);
    if (!cloudObj) return;

    // ✅ Lo correcto: comparar timestamp interno del backup
    const cloudTs = parseTimestampToMs(cloudObj?.timestamp) || Number(cloud.updated_at ?? 0);

    const localStr = localStorage.getItem("trademind_backup");
    const localObj = localStr ? safeParse<any>(localStr) : null;
    const localTs = parseTimestampToMs(localObj?.timestamp) || 0;

    // Si no hay nada local, o cloud es más nuevo, restauramos
    if (cloudTs > localTs) {
      localStorage.setItem("trademind_backup", JSON.stringify(cloudObj));

      // Marca como hecho para evitar loops si por alguna razón el timestamp quedara raro
      sessionStorage.setItem("tm_cloud_sync_done", "1");

      window.location.reload();
    } else {
      // Aunque no restauremos, marcamos como hecho para no reintentar en loop por re-renders
      sessionStorage.setItem("tm_cloud_sync_done", "1");
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
