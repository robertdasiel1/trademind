
import { Env, getCookie, PagesFunction } from "../../utils";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const sessionId = getCookie(request, "tm_session");

  if (sessionId) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `tm_session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`
  );

  return new Response("Logged out", { headers });
};
