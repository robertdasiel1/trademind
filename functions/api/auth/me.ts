
import { Env, getUserFromSession, PagesFunction } from "../../utils";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getUserFromSession(context.request, context.env);

  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ 
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  }), { 
    headers: { "Content-Type": "application/json" }
  });
};
