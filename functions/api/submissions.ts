import type { Env } from "../_lib/types";

const MAX_CONTENT_LENGTH = 500;
const MAX_NICKNAME_LENGTH = 50;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX = 5;
const DUPLICATE_WINDOW_MINUTES = 5;

interface SubmissionBody {
  content?: string;
  nickname?: string;
  website?: string; // honeypot 欄位，一般使用者看不到
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("請求格式錯誤", 400);
  }

  // honeypot：機器人才會填這個隱藏欄位，假裝成功即可，不需告知被擋
  if (body.website) {
    return jsonSuccess();
  }

  const content = (body.content ?? "").trim();
  const nickname = (body.nickname ?? "").trim();

  if (!content) {
    return jsonError("請輸入留言內容", 400);
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return jsonError(`留言內容請勿超過 ${MAX_CONTENT_LENGTH} 字`, 400);
  }
  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return jsonError(`暱稱請勿超過 ${MAX_NICKNAME_LENGTH} 字`, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashIp(ip, env.SESSION_SECRET);

  const rateCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM submissions WHERE client_ip_hash = ? AND created_at > datetime('now', ?)`
  )
    .bind(ipHash, `-${RATE_LIMIT_WINDOW_MINUTES} minutes`)
    .first<{ count: number }>();

  if (rateCount && rateCount.count >= RATE_LIMIT_MAX) {
    return jsonError("留言有點頻繁，請稍後再試", 429);
  }

  const duplicate = await env.DB.prepare(
    `SELECT id FROM submissions WHERE client_ip_hash = ? AND content = ? AND created_at > datetime('now', ?)`
  )
    .bind(ipHash, content, `-${DUPLICATE_WINDOW_MINUTES} minutes`)
    .first();

  if (duplicate) {
    return jsonError("這則留言剛剛已經收到囉，謝謝你！", 409);
  }

  await env.DB.prepare(
    `INSERT INTO submissions (content, nickname, client_ip_hash) VALUES (?, ?, ?)`
  )
    .bind(content, nickname || null, ipHash)
    .run();

  return jsonSuccess();
};

async function hashIp(ip: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonSuccess() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
