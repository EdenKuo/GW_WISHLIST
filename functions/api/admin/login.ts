import type { Env } from "../../_lib/types";
import { verifyGoogleIdToken, isWhitelisted, createSessionCookie } from "../../_lib/auth";

interface LoginBody {
  credential?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
