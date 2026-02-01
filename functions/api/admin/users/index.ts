
import { Env, getUserFromSession, PagesFunction } from "../../../utils";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const currentUser = await getUserFromSession(request, env);
  if (!currentUser || currentUser.role !== 'admin') {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await env.DB.prepare(
    "SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at DESC"
  ).all();

  return new Response(JSON.stringify({ users: result.results }), {
    headers: { "Content-Type": "application/json" }
  });
};
