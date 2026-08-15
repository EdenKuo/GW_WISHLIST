import type { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const episode = url.searchParams.get("episode");

  const conditions: string[] = ["hidden = 0"];
  const params: unknown[] = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (episode) {
    conditions.push("episode = ?");
    params.push(episode);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const result = await env.DB.prepare(
    `SELECT id, content, nickname, status, episode, created_at
     FROM submissions
     ${where}
     ORDER BY created_at DESC
     LIMIT 500`
  )
    .bind(...params)
    .all();

  return new Response(
    JSON.stringify({ ok: true, submissions: result.results }),
    { headers: { "Content-Type": "application/json" } }
  );
};
