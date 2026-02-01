import { Env, hashPassword, createSessionCookie, PagesFunction } from "../../utils";

// In-memory rate limiting (Per Cloudflare Isolate)
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

function json(status: number, body: any, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

  if (!checkRateLimit(clientIP)) {
    return json(429, { error: "Too many login attempts. Please try again later." });
  }

  try {
    // Validate binding
    if (!env?.DB) {
      console.error("Missing D1 binding env.DB");
      return json(500, { error: "Server misconfigured: missing DB binding." });
    }

    // Parse body safely
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!username || !password) {
      return json(400, { error: "Missing credentials" });
    }

    const user = await env.DB
      .prepare("SELECT id, username, password_hash, salt, role, is_active FROM users WHERE username = ?")
      .bind(username)
      .first<any>();

    if (!user) {
      recordFailedAttempt(clientIP);
      return json(401, { error: "Invalid credentials" });
    }

    if (user.is_active === 0) {
      return json(403, { error: "Account disabled. Contact admin." });
    }

    const inputHash = await hashPassword(password, String(user.salt));
    if (inputHash !== user.password_hash) {
      recordFailedAttempt(clientIP);
      return json(401, { error: "Invalid credentials" });
    }

    const sessionId = crypto.randomUUID();
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

    await env.DB
      .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(sessionId, user.id, expiresAt)
      .run();

    failedLoginAttempts.delete(clientIP);

    const headers = new Headers();
    headers.append("Set-Cookie", createSessionCookie(sessionId, maxAge));

    return json(200, {
      user: { id: user.id, username: user.username, role: user.role }
    }, headers);

  } catch (e: any) {
    console.error("Login error:", e?.stack || e);
    return json(500, { error: "Internal Server Error" });
  }
};
