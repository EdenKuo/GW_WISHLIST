import type { Env } from "../_lib/types";

// 提供前端登入頁需要的公開設定（Google Client ID 本身不是機密資訊）。
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return new Response(
    JSON.stringify({ googleClientId: env.GOOGLE_CLIENT_ID }),
    { headers: { "Content-Type": "application/json" } }
  );
};
