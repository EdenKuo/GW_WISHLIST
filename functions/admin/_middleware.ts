import type { Env } from "../_lib/types";
import { verifySessionCookie, isWhitelisted } from "../_lib/auth";

// 保護所有 /admin/* 靜態頁面，未登入或不在白名單者導向登入頁。
// 登入頁本身及其所需的靜態資源（.css / .js）不受保護。
export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/admin/login.html" || path.endsWith(".css") || path.endsWith(".js")) {
    return next();
  }

  const session = await verifySessionCookie(
    request.headers.get("Cookie"),
    env.SESSION_SECRET
  );

  if (!session || !isWhitelisted(session.email, env.ADMIN_EMAILS)) {
    return Response.redirect(new URL("/admin/login.html", url), 302);
  }

  return next();
};
