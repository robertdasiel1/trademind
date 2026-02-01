// functions/api/admin/change-password.ts
import {
  Env,
  PagesFunction,
  getUserFromSession,
  hashPassword,
  generateSalt,
} from "../../utils";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function isStrongPassword(pw: string) {
  // mínimo 12 chars, 1 minúscula, 1 mayúscula, 1 número, 1 símbolo
  return (
    typeof pw === "string" &&
    pw.length >= 12 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    // 1) validar sesión
    const authedUser = await getUserFromSession(request, env);
    if (!authedUser) return json({ error: "Not authenticated" }, 401);

    // 2) solo admin
    if (authedUser.role !== "admin") return json({ error: "Forbidden" }, 403);

    // 3) body
    const body = (await request.json().catch(() => ({}))) as any;
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return json({ error: "Missing fields" }, 400);
    }
    if (newPassword !== confirmPassword) {
      return json({ error: "Passwords do not match" }, 400);
    }
    if (!isStrongPassword(newPassword)) {
      return json(
        {
          error:
            "Weak password. Use 12+ chars with uppercase, lowercase, number and symbol.",
        },
        400
      );
    }

    // 4) obtener user actual desde DB
    const dbUser = await env.DB.prepare(
      "SELECT id, username, role, is_active, salt, password_hash FROM users WHERE id = ?"
    )
      .bind(authedUser.id)
      .first<any>();

    if (!dbUser) return json({ error: "User not found" }, 404);
    if (dbUser.is_active === 0) return json({ error: "Account disabled" }, 403);

    // 5) validar password actual
    const currentHash = await hashPassword(currentPassword, dbUser.salt);
    if (currentHash !== dbUser.password_hash) {
      return json({ error: "Invalid current password" }, 401);
    }

    // 6) guardar nuevo hash + salt
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);

    // Intento #1: si tienes must_change_password
    const updateWithFlag = await env.DB.prepare(
      "UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0 WHERE id = ?"
    )
      .bind(newHash, newSalt, dbUser.id)
      .run()
      .catch(() => null);

    if (!updateWithFlag || updateWithFlag.success === false) {
      // Fallback: si NO existe must_change_password
      const updateBasic = await env.DB.prepare(
        "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?"
      )
        .bind(newHash, newSalt, dbUser.id)
        .run();

      if (!updateBasic.success) {
        return json({ error: "Failed to update password" }, 500);
      }
    }

    return json({ ok: true });
  } catch (err: any) {
    // Devuelve error en JSON para debug rápido (sin filtrar detalles sensibles)
    return json({ error: "Internal Server Error" }, 500);
  }
};
