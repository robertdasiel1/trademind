import { Env, PagesFunction, getUserFromSession } from "../../utils";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const user = await getUserFromSession(request, env);

  // Si NO hay sesión válida, devuelve 401 (no 200 con {})
  if (!user) {
    return json({ user: null }, 401);
  }

  // Debug para confirmar deploy (puedes borrar luego)
  return json({
    user,
    deployedAt: new Date().toISOString(),
  });
};
