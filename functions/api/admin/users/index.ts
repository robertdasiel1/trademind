import {
  Env,
  getUserFromSession,
  PagesFunction,
  generateSalt,
  hashPassword,
} from "../../../utils";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidUsername(u: string) {
  // 3–32 chars, letras/números/._-
  return /^[a-zA-Z0-9._-]{3,32}$/.test(u);
}

function isStrongPassword(pw: string) {
  // mínimo 12, 1 mayúscula, 1 minúscula, 1 número, 1 símbolo
  return (
    typeof pw === "string" &&
    pw.length >= 12 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

// GET /api/admin/users  -> lista usuarios
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const currentUser = await getUserFromSession(request, env);
  if (!currentUser || currentUser.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  const result = await env.DB.prepare(
    "SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at DESC"
  ).all();

  return json({ users: result.results });
};

// POST /api/admin/users -> crea usuario (admin only)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const currentUser = await getUserFromSession(request, env);
  if (!currentUser) return json({ error: "Not authenticated" }, 401);
  if (currentUser.role !== "admin") return json({ error: "Forbidden" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const role = String(body?.role || "user");

  if (!username || !password) return json({ error: "Missing fields" }, 400);
  if (!isValidUsername(username)) return json({ error: "Invalid username" }, 400);
  if (!isStrongPassword(password)) {
    return json(
      { error: "Weak password: min 12 + upper + lower + number + symbol" },
      400
    );
  }
  if (role !== "user" && role !== "admin") return json({ error: "Invalid role" }, 400);

  // username único
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();

  if (existing) return json({ error: "Username already exists" }, 409);

  const id = crypto.randomUUID();
  const salt = generateSalt();
  const password_hash = await hashPassword(password, salt);

  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, salt, role, is_active) VALUES (?, ?, ?, ?, ?, 1)"
  )
    .bind(id, username, password_hash, salt, role)
    .run();

  return json({ ok: true, user: { id, username, role, is_active: 1 } }, 200);
};
