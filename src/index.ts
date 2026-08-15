import type { Env } from "./lib/types";
import {
  verifyGoogleIdToken,
  isWhitelisted,
  createSessionCookie,
  clearSessionCookie,
  verifySessionCookie,
} from "./lib/auth";

const MAX_CONTENT_LENGTH = 500;
const MAX_NICKNAME_LENGTH = 50;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX = 5;
const DUPLICATE_WINDOW_MINUTES = 5;
const VALID_STATUS = ["pending", "read", "replied"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/config" && request.method === "GET") {
        return handleConfig(env);
      }

      if (path === "/api/submissions" && request.method === "POST") {
        return handleCreateSubmission(request, env);
      }

      if (path === "/api/submissions" && request.method === "GET") {
        return handlePublicListSubmissions(request, env);
      }

      const likeMatch = path.match(/^\/api\/submissions\/(\d+)\/like$/);
      if (likeMatch && request.method === "POST") {
        return handleLikeSubmission(request, env, Number(likeMatch[1]));
      }

      if (path === "/api/admin/login" && request.method === "POST") {
        return handleAdminLogin(request, env);
      }

      if (path === "/api/admin/logout" && request.method === "POST") {
        return handleAdminLogout();
      }

      if (path.startsWith("/api/admin/")) {
        const authError = await requireAdmin(request, env, url);
        if (authError) return authError;

        if (path === "/api/admin/submissions" && request.method === "GET") {
          return handleListSubmissions(request, env);
        }

        const match = path.match(/^\/api\/admin\/submissions\/(\d+)$/);
        if (match) {
          const id = Number(match[1]);
          if (request.method === "PATCH") {
            return handleUpdateSubmission(request, env, id);
          }
          if (request.method === "DELETE") {
            return handleHideSubmission(env, id);
          }
        }

        return json({ ok: false, error: "Not Found" }, 404);
      }

      if (path.startsWith("/admin/")) {
        const isPublicAdminAsset =
          path === "/admin/login.html" || path.endsWith(".css") || path.endsWith(".js");

        if (!isPublicAdminAsset) {
          const session = await verifySessionCookie(
            request.headers.get("Cookie"),
            env.SESSION_SECRET
          );
          if (!session || !isWhitelisted(session.email, env.ADMIN_EMAILS)) {
            return Response.redirect(new URL("/admin/login.html", url), 302);
          }
        }
      }

      return env.ASSETS.fetch(request);
    } catch {
      return json({ ok: false, error: "伺服器錯誤" }, 500);
    }
  },
};

// ---------- /api/config ----------

function handleConfig(env: Env): Response {
  return json({ googleClientId: env.GOOGLE_CLIENT_ID });
}

// ---------- /api/submissions ----------

interface SubmissionBody {
  content?: string;
  nickname?: string;
  website?: string; // honeypot 欄位，一般使用者看不到
}

async function handleCreateSubmission(request: Request, env: Env): Promise<Response> {
  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "請求格式錯誤" }, 400);
  }

  if (body.website) {
    return json({ ok: true });
  }

  const content = (body.content ?? "").trim();
  const nickname = (body.nickname ?? "").trim();

  if (!content) {
    return json({ ok: false, error: "請輸入留言內容" }, 400);
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return json({ ok: false, error: `留言內容請勿超過 ${MAX_CONTENT_LENGTH} 字` }, 400);
  }
  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return json({ ok: false, error: `暱稱請勿超過 ${MAX_NICKNAME_LENGTH} 字` }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashIp(ip, env.SESSION_SECRET);

  const rateCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM submissions WHERE client_ip_hash = ? AND created_at > datetime('now', ?)`
  )
    .bind(ipHash, `-${RATE_LIMIT_WINDOW_MINUTES} minutes`)
    .first<{ count: number }>();

  if (rateCount && rateCount.count >= RATE_LIMIT_MAX) {
    return json({ ok: false, error: "留言有點頻繁，請稍後再試" }, 429);
  }

  const duplicate = await env.DB.prepare(
    `SELECT id FROM submissions WHERE client_ip_hash = ? AND content = ? AND created_at > datetime('now', ?)`
  )
    .bind(ipHash, content, `-${DUPLICATE_WINDOW_MINUTES} minutes`)
    .first();

  if (duplicate) {
    return json({ ok: false, error: "這則留言剛剛已經收到囉，謝謝你！" }, 409);
  }

  await env.DB.prepare(
    `INSERT INTO submissions (content, nickname, client_ip_hash) VALUES (?, ?, ?)`
  )
    .bind(content, nickname || null, ipHash)
    .run();

  return json({ ok: true });
}

async function handlePublicListSubmissions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const sort = url.searchParams.get("sort") === "popular" ? "popular" : "recent";

  const conditions: string[] = ["hidden = 0"];
  const params: unknown[] = [];

  if (q) {
    conditions.push("(content LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(q)}%`;
    params.push(like, like);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const orderBy =
    sort === "popular" ? "ORDER BY likes_count DESC, created_at DESC" : "ORDER BY created_at DESC";

  const result = await env.DB.prepare(
    `SELECT id, content, nickname, likes_count, status, created_at
     FROM submissions
     ${where}
     ${orderBy}
     LIMIT 200`
  )
    .bind(...params)
    .all();

  return json({ ok: true, submissions: result.results });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function handleLikeSubmission(request: Request, env: Env, id: number): Promise<Response> {
  const submission = await env.DB.prepare(
    `SELECT id FROM submissions WHERE id = ? AND hidden = 0`
  )
    .bind(id)
    .first();

  if (!submission) {
    return json({ ok: false, error: "找不到這則留言" }, 404);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashIp(ip, env.SESSION_SECRET);

  const insertResult = await env.DB.prepare(
    `INSERT INTO likes (submission_id, ip_hash) VALUES (?, ?) ON CONFLICT DO NOTHING`
  )
    .bind(id, ipHash)
    .run();

  if (insertResult.meta.changes > 0) {
    await env.DB.prepare(`UPDATE submissions SET likes_count = likes_count + 1 WHERE id = ?`)
      .bind(id)
      .run();
  }

  const updated = await env.DB.prepare(`SELECT likes_count FROM submissions WHERE id = ?`)
    .bind(id)
    .first<{ likes_count: number }>();

  return json({ ok: true, likes_count: updated?.likes_count ?? 0 });
}

async function hashIp(ip: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- /api/admin/login, /api/admin/logout ----------

interface LoginBody {
  credential?: string;
}

async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "請求格式錯誤" }, 400);
  }

  if (!body.credential) {
    return json({ ok: false, error: "缺少登入憑證" }, 400);
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
  } catch {
    return json({ ok: false, error: "Google 登入驗證失敗" }, 401);
  }

  if (!profile.email_verified || !isWhitelisted(profile.email, env.ADMIN_EMAILS)) {
    return json({ ok: false, error: "此帳號沒有後台管理權限" }, 403);
  }

  const cookie = await createSessionCookie(profile.email, env.SESSION_SECRET);

  return new Response(JSON.stringify({ ok: true, email: profile.email }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

function handleAdminLogout(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

// ---------- /api/admin/* 保護 ----------

async function requireAdmin(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method !== "GET") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return json({ ok: false, error: "請求來源不允許" }, 403);
    }
  }

  const session = await verifySessionCookie(
    request.headers.get("Cookie"),
    env.SESSION_SECRET
  );

  if (!session || !isWhitelisted(session.email, env.ADMIN_EMAILS)) {
    return json({ ok: false, error: "請重新登入" }, 401);
  }

  return null;
}

// ---------- /api/admin/submissions ----------

async function handleListSubmissions(request: Request, env: Env): Promise<Response> {
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

  return json({ ok: true, submissions: result.results });
}

// ---------- /api/admin/submissions/:id ----------

interface UpdateBody {
  status?: string;
  episode?: string;
}

async function handleUpdateSubmission(request: Request, env: Env, id: number): Promise<Response> {
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

  await env.DB.prepare(`UPDATE submissions SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}

async function handleHideSubmission(env: Env, id: number): Promise<Response> {
  await env.DB.prepare(
    `UPDATE submissions SET hidden = 1, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(id)
    .run();

  return json({ ok: true });
}

// ---------- 共用 ----------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
