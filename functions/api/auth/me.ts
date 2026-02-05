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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const user = await getUserFromSession(request, env);

  const MARK = "ME_ENDPOINT_V3";

  // ✅ App.tsx espera { authenticated: boolean, user: ... }
  if (!user) {
    return json({ mark: MARK, authenticated: false, user: null }, 401);
  }

  return json({ mark: MARK, authenticated: true, user }, 200);
};
