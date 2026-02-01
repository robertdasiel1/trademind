
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

  if (!checkRateLimit(clientIP)) {
    return new Response("Too many login attempts. Please try again later.", { status: 429 });
  }

  try {
    const { username, password } = await request.json() as any;

    if (!username || !password) {
      return new Response("Missing credentials", { status: 400 });
    }

    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<any>();

    if (!user) {
      recordFailedAttempt(clientIP);
      return new Response("Invalid credentials", { status: 401 });
    }

    if (user.is_active === 0) {
      return new Response("Account disabled. Contact admin.", { status: 403 });
    }

    const inputHash = await hashPassword(password, user.salt as string);
    if (inputHash !== user.password_hash) {
      recordFailedAttempt(clientIP);
      return new Response("Invalid credentials", { status: 401 });
    }

    const sessionId = crypto.randomUUID();
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    const expiresAt = Math.floor(Date.now() / 1000) + maxAge; 

    await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(sessionId, user.id, expiresAt)
      .run();

    const headers = new Headers();
    headers.append("Set-Cookie", createSessionCookie(sessionId, maxAge));
    headers.append("Content-Type", "application/json");

    failedLoginAttempts.delete(clientIP);

    return new Response(JSON.stringify({ 
      user: { id: user.id, username: user.username, role: user.role } 
    }), { headers });

  } catch (e) {
    return new Response("Internal Server Error", { status: 500 });
  }
};
