
export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: any;
  error?: string;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface Env {
  DB: D1Database;
}

export interface User {
  id: string;
  username: string;
  role: string;
  is_active: number;
  created_at?: number;
}

export type PagesFunction<Env = unknown, Params extends string = any, Data extends Record<string, unknown> = Record<string, unknown>> = (
  context: EventContext<Env, Params, Data>
) => Response | Promise<Response>;

interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<any>) => void;
  passThroughOnException: () => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

// --- SECURITY & CRYPTO ---

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const key = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(key))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- COOKIES (Requirement: tm_session) ---

export function getCookie(request: Request, name: string): string | null {
  const cookieString = request.headers.get("Cookie");
  if (!cookieString) return null;
  const cookies = cookieString.split(";");
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) return value;
  }
  return null;
}

export function createSessionCookie(sessionId: string, maxAgeSeconds: number): string {
  // HttpOnly: JS cannot read it (XSS protection)
  // Secure: Only sent over HTTPS
  // SameSite=Lax: Good balance for UX/Security
  return `tm_session=${sessionId}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

// --- MIDDLEWARE LOGIC ---

export async function getUserFromSession(request: Request, env: Env): Promise<User | null> {
  const sessionId = getCookie(request, "tm_session");
  if (!sessionId) return null;

  const session = await env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > ?"
  )
  .bind(sessionId, Math.floor(Date.now() / 1000))
  .first<{ user_id: string }>();

  if (!session) return null;

  const user = await env.DB.prepare(
    "SELECT id, username, role, is_active FROM users WHERE id = ?"
  )
  .bind(session.user_id)
  .first<User>();

  if (!user || user.is_active === 0) return null;

  return user;
}
