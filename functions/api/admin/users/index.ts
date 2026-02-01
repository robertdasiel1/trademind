import {
  Env,
  PagesFunction,
  getUserFromSession,
  hashPassword,
  generateSalt,
} from "../../../utils";

function isStrongPassword(pw: string) {
  // Mínimo 12 chars, 1 mayúscula, 1 minúscula, 1 número, 1 símbolo
  return (
    typeof pw === "string" &&
    pw.length >= 12 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

// POST /api/admin/users -> crea usuario
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const currentUser = await getUserFromSession(request, env);
  if (!currentUser || currentUser.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const role = String(body?.role || "user").trim(); // por defecto user

  if (!username || !password) {
    return json({ error: "Missing fields: username, password" }, 400);
  }

  // Username básico (evita cosas raras)
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return json({
      error: "Invalid username. Use 3-32 chars: letters, numbers, . _ -",
    }, 400);
  }

  if (!isStrongPassword(password)) {
    return json({
      error:
        "Weak password. Min 12 chars with upper, lower, number, symbol.",
    }, 400);
  }

  // Seguridad: solo permitimos crear 'user' por ahora (recomendado)
  // Si quieres permitir crear admins, cambia esta regla conscientemente.
  if (role !== "user") {
    return json({ error: "Only role 'user' can be created here" }, 400);
  }

  // Verifica si ya existe
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  )
    .bind(username)
    .first<{ id: string }>();

  if (existing) {
    return json({ error: "Username already exists" }, 409);
  }

  const salt = generateSalt();
  const password_hash = await hashPassword(password, salt);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, salt, role, is_active) VALUES (?, ?, ?, ?, ?, 1)"
  )
    .bind(id, username, password_hash, salt, role)
    .run();

  return json({ ok: true, user: { id, username, role, is_active: 1 } }, 201);
};
