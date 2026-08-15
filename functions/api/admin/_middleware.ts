import type { Env } from "../../_lib/types";
import { verifySessionCookie, isWhitelisted } from "../../_lib/auth";

// 保護所有 /api/admin/* 路由（登入、登出端點除外）。
export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);

  if (
    url.pathname === "/api/admin/login" ||
    url.pathname === "/api/admin/logout"
  ) {
    return next();
  }

  // 簡單的 CSRF 防護：非 GET 的請求必須是同源
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

  return next();
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
