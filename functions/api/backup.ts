import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  DB: D1Database;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)tm_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getUserIdFromSession(env: Env, sessionId: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000); // seconds

  const sessionRow = await env.DB
    .prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > ? LIMIT 1")
    .bind(sessionId, now)
    .first<{ user_id: string }>();

  return sessionRow?.user_id ?? null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const sessionId = getSessionId(request);
  if (!sessionId) return json({ ok: false, error: "Unauthorized" }, 401);

  const userId = await getUserIdFromSession(env, sessionId);
  if (!userId) return json({ ok: false, error: "Unauthorized" }, 401);

  const row = await env.DB
    .prepare(
      `SELECT backup_json, updated_at, version
       FROM trading_journal_backups
       WHERE user_id = ? LIMIT 1`
    )
    .bind(userId)
    .first<{ backup_json: string; updated_at: number; version: number }>();

  return json(row ?? null, 200);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const sessionId = getSessionId(request);
  if (!sessionId) return json({ ok: false, error: "Unauthorized" }, 401);

  const userId = await getUserIdFromSession(env, sessionId);
  if (!userId) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = (await request.json().catch(() => null)) as
    | { backup_json: unknown; updated_at?: number; version?: number }
    | null;

  if (!body || body.backup_json == null) {
    return json({ ok: false, error: "Bad Request" }, 400);
  }

  const updatedAt = typeof body.updated_at === "number" ? body.updated_at : Date.now(); // ms
  const version = typeof body.version === "number" ? body.version : 1;

  const backupStr =
    typeof body.backup_json === "string" ? body.backup_json : JSON.stringify(body.backup_json);

  await env.DB
    .prepare(
      `INSERT INTO trading_journal_backups (user_id, backup_json, updated_at, version)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         backup_json = excluded.backup_json,
         updated_at = excluded.updated_at,
         version = excluded.version`
    )
    .bind(userId, backupStr, updatedAt, version)
    .run();

  return json({ ok: true, updated_at: updatedAt }, 200);
};
