import { Env, hashPassword, createSessionCookie, PagesFunction } from "../../utils";

// In-memory rate limiting (per Cloudflare isolate)
const failedLoginAttempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempts = failedLoginAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= MAX_ATTEMPTS) return false;

  if (recentAttempts.length !== attempts.length) {
    failedLoginAttempts.set(ip, recentAttempts);
  }
  return true;
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const attempts = failedLoginAttempts.get(ip) || [];
  attempts.push(now);
  failedLoginAttempts.set(ip, attempts);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const clientIP =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(clientIP)) {
    return new Response(
      JSON.stringify({ error: "Too many login attempts. Try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 1) Verify D1 binding exists
    if (!env?.DB) {
      console.error("LOGIN_ERROR: env.DB is missing. Check D1 binding name = DB in Pages Settings.");
      return new Response(
        JSON.stringify({
          error: "Server misconfigured",
          detail: "D1 binding DB is missing. Go to Pages -> Settings -> Bindings and add D1 binding named DB."
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2) Parse JSON safely
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const username = (body?.username ?? "").toString().trim();
    const password = (body?.password ?? "").toString();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing credentials" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3) Fetch user
    const user = await env.DB
      .prepare("SELECT id, username, password_hash, salt, role, is_active FROM users WHERE username = ?")
      .bind(username)
      .first<any>();

    if (!user) {
      recordFailedAttempt(clientIP);
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (user.is_active === 0) {
      return new Response(
        JSON.stringify({ error: "Account disabled. Contact admin." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4) Verify password
    const inputHash = await hashPassword(password, user.salt as string);

    if (inputHash !== user.password_hash) {
      recordFailedAttempt(clientIP);
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5) Create session
    const sessionId = crypto.randomUUID();
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

    await env.DB
      .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(sessionId, user.id, expiresAt)
      .run();

    // 6) Set cookie and return user
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.append("Set-Cookie", createSessionCookie(sessionId, maxAge));

    failedLoginAttempts.delete(clientIP);

    return new Response(
      JSON.stringify({
        user: { id: user.id, username: user.username, role: user.role }
      }),
      { status: 200, headers }
    );

  } catch (e: any) {
    // IMPORTANT: do not swallow error — expose detail for debugging
    console.error("LOGIN_ERROR:", e?.message || e, e?.stack);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        detail: e?.message || String(e),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
