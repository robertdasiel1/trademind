// src/utils/cloudBackup.ts

type CloudBackupRow = null | {
  backup_json: string; // JSON string desde tu API
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

type StorageKey = (typeof STORAGE_KEYS)[number];

type BackupPayload = {
  version: number;
  timestamp: string; // ISO
  data: Record<string, any>;
};

// Marcadores locales (no tocan tus datos, solo controlan sync)
const LS_LOCAL_UPDATED_AT = "tm_local_updated_at";     // “último cambio local” (ms)
const LS_CLOUD_LAST_PULL_AT = "tm_cloud_last_pull_at"; // último updated_at cloud aplicado (ms)
const LS_CLOUD_LAST_PUSH_AT = "tm_cloud_last_push_at"; // último push hecho (ms)

// ========= Fetch / Upload =========

/**
 * Descarga el backup del usuario desde /api/backup.
 * Devuelve null si no hay backup todavía o si no estás autenticado.
 */
export async function fetchCloudBackup(): Promise<CloudBackupRow> {
  const res = await fetch("/api/backup", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!res.ok) return null;
  return (await res.json()) as CloudBackupRow;
}

/**
 * Construye un payload desde tus STORAGE_KEYS actuales en localStorage.
 */
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

/**
 * Garantiza coherencia básica de cuentas al aplicar backup:
 * - Si active_account no existe dentro de accounts, se ajusta a una cuenta válida
 */
function normalizeAccountsAfterApply() {
  try {
    const accountsRaw = localStorage.getItem("trading_journal_accounts");
    const activeRaw = localStorage.getItem("trading_journal_active_account");

    const accounts = accountsRaw ? safeParse<any[]>(accountsRaw) : null;
    const active = activeRaw ? safeParse<any>(activeRaw) : null;

    const activeId = active?.id ?? active?.value ?? active; // por si guardas string o objeto
    const firstAccount = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;

    if (!Array.isArray(accounts) || accounts.length === 0) {
      // no hay cuentas, no forzamos nada
      return;
    }

    const exists = accounts.some((a) => a?.id === activeId);
    if (!exists) {
      // set active a la primera cuenta válida
      localStorage.setItem("trading_journal_active_account", JSON.stringify(firstAccount));
    }
  } catch {
    // no rompas nada
  }
}

/**
 * Aplica un payload a localStorage (solo keys conocidas) y normaliza cuentas.
 */
function applyBackupPayloadToLocal(payload: BackupPayload) {
  const data = payload?.data || {};
  for (const key of STORAGE_KEYS) {
    if (!(key in data)) continue;

    const value = (data as any)[key];
    if (typeof value === "string") {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  normalizeAccountsAfterApply();
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
    cache: "no-store",
    credentials: "include",
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

// ========= Auto-upload (debounced) =========

let syncTimer: number | null = null;

/**
 * Llama esto cada vez que tu app cambie datos (trades/notas/etc).
 * Ideal: justo después de guardar en localStorage las keys reales.
 *
 * NOTA: Además, este archivo instala un hook que lo hace automático cuando
 * se hace setItem/removeItem sobre STORAGE_KEYS.
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

// ========= Sync principal (bidireccional) =========

let inFlightSync: Promise<void> | null = null;

/**
 * Sync principal (bidireccional):
 * 1) PULL: si cloud.updated_at > localUpdatedAt  => baja cloud y aplica
 * 2) PUSH: si localUpdatedAt > cloud.updated_at  => sube local a cloud
 *
 * Llamar en startup (después de estar autenticado) y también en refresh.
 */
export async function syncFromCloudOnStartup(): Promise<void> {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    try {
      const cloud = await fetchCloudBackup();
      if (!cloud) return;

      const cloudPayload = safeParse<BackupPayload>(cloud.backup_json);
      if (!cloudPayload?.data) return;

      const cloudUpdatedAt = Number(cloud.updated_at ?? 0);

      // “último cambio local” (cuando tu app cambia algo, esto debe subir)
      const localUpdatedAt = Number(localStorage.getItem(LS_LOCAL_UPDATED_AT) ?? 0);

      // fallback: si nunca marcaste localUpdatedAt, pero existe data local, asumimos “existe”
      const localHasData = STORAGE_KEYS.some((k) => localStorage.getItem(k) != null);
      const effectiveLocalUpdatedAt = localUpdatedAt || (localHasData ? 1 : 0);

      // 1) PULL si cloud es más nuevo
      if (cloudUpdatedAt > effectiveLocalUpdatedAt) {
        applyBackupPayloadToLocal(cloudPayload);

        // Igualamos marcadores para evitar que inmediatamente empuje de vuelta
        localStorage.setItem(LS_LOCAL_UPDATED_AT, String(cloudUpdatedAt));
        localStorage.setItem(LS_CLOUD_LAST_PULL_AT, String(cloudUpdatedAt));

        // Si tu app carga el state desde localStorage solo una vez,
        // necesitas reload para que se refleje:
        window.location.reload();
        return;
      }

      // 2) PUSH si local es más nuevo que cloud
      if (effectiveLocalUpdatedAt > cloudUpdatedAt) {
        await uploadLocalBackupToCloud();
        return;
      }

      // iguales: no hacemos nada
    } catch (err) {
      console.error("syncFromCloudOnStartup error:", err);
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

// ========= Hook automático para detectar cambios en localStorage =========

/**
 * Instala un hook que detecta cuando tu app hace:
 * - localStorage.setItem(KEY, ...)
 * - localStorage.removeItem(KEY)
 * y si KEY es una de STORAGE_KEYS, programa upload debounced.
 *
 * Llamar una vez (ej: al iniciar la app, después de login).
 */
export function installCloudBackupAutoSyncHook(): void {
  const w = window as any;
  if (w.__tm_cloud_ls_hook_installed) return;
  w.__tm_cloud_ls_hook_installed = true;

  const keySet = new Set<string>(STORAGE_KEYS);

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function (key: string, value: string) {
    originalSetItem.call(this, key, value);

    if (this === localStorage && keySet.has(key)) {
      // marca cambio local + programa push
      scheduleCloudUploadDebounced(1200);
    }
  };

  Storage.prototype.removeItem = function (key: string) {
    originalRemoveItem.call(this, key);

    if (this === localStorage && keySet.has(key)) {
      scheduleCloudUploadDebounced(1200);
    }
  };

  // Extra: cuando vuelves a la pestaña/app, intenta pull/push por si hubo cambios en otro dispositivo
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncFromCloudOnStartup().catch(console.error);
    }
  });
}

/**
 * Helper: úsalo si quieres un “sync completo” fácil:
 * - instala hook
 * - ejecuta sync bidireccional
 */
export async function initCloudSync(): Promise<void> {
  installCloudBackupAutoSyncHook();
  await syncFromCloudOnStartup();
}
