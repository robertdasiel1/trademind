
import { Env, getUserFromSession, PagesFunction } from "../../../../utils";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const targetUserId = params.id as string;

  const currentUser = await getUserFromSession(request, env);
  if (!currentUser || currentUser.role !== 'admin') {
    return new Response("Forbidden", { status: 403 });
  }

  if (targetUserId === currentUser.id) {
    return new Response("Cannot disable self", { status: 400 });
  }

  const targetUser = await env.DB.prepare("SELECT is_active FROM users WHERE id = ?").bind(targetUserId).first<{ is_active: number }>();
  
  if (!targetUser) return new Response("User not found", { status: 404 });

  const newStatus = targetUser.is_active === 1 ? 0 : 1;

  await env.DB.prepare("UPDATE users SET is_active = ? WHERE id = ?").bind(newStatus, targetUserId).run();

  if (newStatus === 0) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetUserId).run();
  }

  return new Response(JSON.stringify({ success: true, new_status: newStatus }), {
    headers: { "Content-Type": "application/json" }
  });
};
