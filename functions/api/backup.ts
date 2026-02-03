export const onRequestGet: PagesFunction<{
  DB: D1Database;
}> = async (context) => {
  const { request, env } = context;

  // 1) Leer cookie de sesión (tm_session)
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)tm_session=([^;]+)/);
  const sessionId = match ? decodeURIComponent(match[1]) : null;

  if (!sessionId) return new Response("Unauthorized", { status: 401 });

  // 2) Validar sesión y obtener user_id
  const now = Math.floor(Date.now() / 1000); // seconds

  const sessionRow = await env.DB
    .prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > ? LIMIT 1")
    .bind(sessionId, now)
    .first<{ user_id: string }>();

  if (!sessionRow?.user_id) return new Response("Unauthorized", { status: 401 });

  // 3) Leer backup del usuario
  const row = await env.DB
    .prepare(
      `SELECT backup_json, updated_at, version
       FROM trading_journal_backups
       WHERE user_id = ? LIMIT 1`
    )
    .bind(sessionRow.user_id)
    .first<{ backup_json: string; updated_at: number; version: number }>();

  return Response.json(row ?? null);
};

export const onRequestPut: PagesFunction<{
  DB: D1Database;
}> = async (context) => {
  const { request, env } = context;

  // 1) Leer cookie de sesión (tm_session)
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)tm_session=([^;]+)/);
  const sessionId = match ? decodeURIComponent(match[1]) : null;

  if (!sessionId) return new Response("Unauthorized", { status: 401 });

  // 2) Validar sesión y obtener user_id
  const now = Math.floor(Date.now() / 1000); // seconds

  const sessionRow = await env.DB
    .prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > ? LIMIT 1")
    .bind(sessionId, now)
    .first<{ user_id: string }>();

  if (!sessionRow?.user_id) return new Response("Unauthorized", { status: 401 });

  // 3) Leer body
  const body = (await request.json().catch(() => null)) as
    | { backup_json: unknown; updated_at?: number; version?: number }
    | null;

  if (!body || body.backup_json == null) {
    return new Response("Bad Request", { status: 400 });
  }

  const updatedAt =
    typeof body.updated_at === "number" ? body.updated_at : Date.now(); // ms
  const version = typeof body.version === "number" ? body.version : 1;

  const backupStr =
    typeof body.backup_json === "string"
      ? body.backup_json
      : JSON.stringify(body.backup_json);

  // 4) Upsert (insert o update)
  await env.DB
    .prepare(
      `INSERT INTO trading_journal_backups (user_id, backup_json, updated_at, version)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         backup_json = excluded.backup_json,
         updated_at = excluded.updated_at,
         version = excluded.version`
    )
    .bind(sessionRow.user_id, backupStr, updatedAt, version)
    .run();

  return Response.json({ ok: true });
};
