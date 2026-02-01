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

// Usamos onRequest (no onRequestGet) para evitar cualquier tema de métodos/build.
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const user = await getUserFromSession(request, env);

  // Esta marca te dice 100% si este archivo está deployado o no
  const MARK = "ME_ENDPOINT_V2";

  if (!user) {
    return json({ mark: MARK, user: null }, 401);
  }

  return json({ mark: MARK, user }, 200);
};
