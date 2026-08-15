import type { Env } from "../../../_lib/types";

const VALID_STATUS = ["pending", "read", "replied"];

interface UpdateBody {
  status?: string;
  episode?: string;
}

export const onRequestPatch: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return json({ ok: false, error: "無效的 ID" }, 400);
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "請求格式錯誤" }, 400);
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) {
      return json({ ok: false, error: "狀態值不正確" }, 400);
    }
    updates.push("status = ?");
    values.push(body.status);
  }

  if (body.episode !== undefined) {
    const episode = body.episode.trim();
    updates.push("episode = ?");
    values.push(episode || null);
  }

  if (!updates.length) {
    return json({ ok: false, error: "沒有要更新的欄位" }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(
    `UPDATE submissions SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return json({ ok: false, error: "無效的 ID" }, 400);
  }

  // 軟刪除：僅標記為隱藏，資料仍保留在資料庫中
  await env.DB.prepare(
    `UPDATE submissions SET hidden = 1, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(id)
    .run();

  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
