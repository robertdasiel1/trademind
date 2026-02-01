
import { Env, PagesFunction, getUserFromSession } from "../../utils";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const user = await getUserFromSession(request, env);

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
