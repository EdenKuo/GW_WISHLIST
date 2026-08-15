# 財鯨動向｜聽眾投稿平台

對應工單：#10 站內投稿頁面（2026-08-12 開單）

一個公開的聽眾投稿頁面，讓聽眾免登入留言、許願、給回饋；站主本人透過受保護的後台（Google 登入 + email 白名單）檢視、標記狀態、分類集數、篩選與隱藏留言。

技術棧：**Cloudflare Pages（前台 + 後台頁 + API）+ Cloudflare D1（資料庫）**，全程不需要自架伺服器。

---

## 一、專案結構

```
public/                  靜態網頁（Cloudflare Pages 直接服務這個資料夾）
  index.html, style.css, app.js       前台投稿頁
  admin/
    login.html, login.js              後台登入頁（Google 登入）
    index.html, admin.js, admin.css   後台管理頁

functions/                Cloudflare Pages Functions（API，跑在 Workers 執行環境）
  api/
    config.ts                        GET  提供前端登入頁所需的 Google Client ID
    submissions.ts                   POST 聽眾投稿（公開，含防洗版機制）
    admin/
      _middleware.ts                 保護所有 /api/admin/* API（需登入 + 白名單）
      login.ts                       POST 驗證 Google 登入、核發後台 session
      logout.ts                      POST 登出
      submissions.ts                 GET  投稿列表（可依狀態／集數篩選）
      submissions/[id].ts            PATCH 更新狀態／集數；DELETE 隱藏
  admin/
    _middleware.ts                   保護所有 /admin/* 靜態頁面（登入頁除外）
  _lib/
    auth.ts                          Google ID Token 驗證、後台 session 簽發與驗證
    types.ts                         共用型別定義

schema.sql                D1 資料表結構（用 Cloudflare Dashboard 的 D1 Console 執行）
wrangler.toml              本地開發設定（正式環境綁定在 Cloudflare Dashboard 設定，不靠這個檔案）
```

---

## 二、部署步驟（第一次上線，全程在網頁介面操作，不需要裝任何工具）

### 步驟 1：建立 D1 資料庫

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左側選單找到 **Storage & Databases > D1 SQL Database**
3. 點 **Create Database**，命名建議：`gw-wishlist-db`
4. 建立完成後，點進資料庫 > **Console** 分頁
5. 打開專案裡的 `schema.sql`，複製全部內容，貼到 Console 裡執行
6. 確認左側「Tables」出現一張 `submissions` 資料表即完成

### 步驟 2：建立 Cloudflare Pages 專案並連接 GitHub

1. 在 Cloudflare Dashboard 左側選單找到 **Workers & Pages**
2. 點 **Create > Pages > Connect to Git**
3. 選擇這個 GitHub repository（`EdenKuo/GW_WISHLIST`）
4. 設定建置參數：
   - **Framework preset**：None
   - **Build command**：留空
   - **Build output directory**：`public`
5. 先不用管環境變數，點 **Save and Deploy**（第一次部署會因為缺少環境變數而功能不完整，屬正常現象，下面步驟會補上）

### 步驟 3：把 D1 資料庫綁到 Pages 專案

1. 進入剛建立的 Pages 專案 > **Settings > Functions**
2. 找到 **D1 database bindings**，點 **Add binding**
3. Variable name 填：`DB`（必須完全一致，程式碼裡是用這個名字讀取資料庫）
4. D1 database 選剛剛建立的 `gw-wishlist-db`
5. 分別在 **Production** 和 **Preview** 都加上這個綁定

### 步驟 4：申請 Google OAuth Client ID（讓後台可以用 Google 帳號登入）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) > 建立一個新專案（或使用現有專案）
2. 左側選單 **APIs & Services > OAuth consent screen**，設定基本資訊（User Type 選 External 即可，應用程式名稱填「財鯨動向後台」）
3. 左側選單 **APIs & Services > Credentials** > **Create Credentials > OAuth client ID**
4. Application type 選 **Web application**
5. **Authorized JavaScript origins** 加入你的 Pages 網址，例如：
   - `https://gw-wishlist.pages.dev`（Cloudflare 預設網址，實際名稱依你的專案而定）
   - 之後若綁自訂網域，也要把自訂網域加進來
6. 不需要填 Authorized redirect URIs（這裡用的是 Google Identity Services 登入按鈕，不是導轉流程）
7. 建立完成後複製 **Client ID**（一長串以 `.apps.googleusercontent.com` 結尾的字串）

### 步驟 5：設定 Pages 專案的環境變數

回到 Pages 專案 > **Settings > Environment variables**，新增以下三個變數（Production 和 Preview 都要各設一次）：

| 變數名稱 | 值 | 說明 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | 步驟 4 拿到的 Client ID | 用來驗證登入者是否為合法 Google 帳號 |
| `ADMIN_EMAILS` | `caring841111@gmail.com` | 白名單，只有這裡列出的 email 能進後台；多個 email 用逗號分隔（例如 `caring841111@gmail.com,other@example.com`） |
| `SESSION_SECRET` | 自訂一長串隨機字串（例如 32 個以上的英數字），並設為 **Encrypt** | 用來加密簽署後台登入的憑證，請妥善保管、不要外流 |

日後若要新增其他管理員帳號，直接把新 email 加進 `ADMIN_EMAILS`（用逗號分隔多個），存檔後照下面步驟重新部署即可，不需要改任何程式碼。

設定完成後，回到 **Deployments** 分頁，對最新的部署點 **Retry deployment**（或直接推一次新的 commit），讓新的環境變數與 D1 綁定生效。

### 步驟 6：驗收（工單第一階段標準）

1. 打開 Pages 網址（前台），送出一則測試留言，應看到「收到囉，謝謝你的分享！」
2. 打開 `/admin/login.html`，用 `ADMIN_EMAILS` 裡的 Google 帳號登入
3. 登入後應能在後台列表看到剛剛的測試留言
4. 把它的狀態改成「已念過」，填入集數（例如 `EP.45`）
5. 用篩選功能，依狀態或集數篩出這則留言
6. 全部走通即代表第一階段驗收通過

---

## 三、後台操作說明（給站主）

- **登入**：開啟 `/admin/login.html`，用授權的 Google 帳號登入即可，沒有密碼要記
- **狀態**：每則投稿可標記「未處理 / 已念過 / 已回覆」，直接在下拉選單切換即會自動儲存
- **集數**：在「集數」欄位輸入（例如 `EP.45`），打完按 Enter 或點掉輸入框即自動儲存
- **篩選**：上方可依狀態、集數篩選要看的投稿
- **隱藏**：點「隱藏」可移除不當或洗版留言（資料庫仍會保留紀錄，只是不再顯示於列表，如需徹底救回可請開發者協助從 D1 Console 還原）
- **登出**：右上角「登出」按鈕

---

## 四、防濫用機制（前台）

- 留言內容必填、上限 500 字；暱稱選填、上限 50 字
- 隱藏欄位（honeypot）攔截機器人自動送出
- 同一來源 10 分鐘內最多送出 5 則留言，超過會提示「留言有點頻繁，請稍後再試」
- 同一來源 5 分鐘內送出完全相同內容會被視為重複，不會重複寫入

---

## 五、範圍聲明（呼應工單「明確不做」）

本版本**不包含**以下項目，未來如需要請另開工單：

- 跨平台留言彙整（YouTube／Spotify／Apple）
- Google 表單串接
- 聽眾會員系統／登入投稿
- 通知信、自動回覆
- 華麗視覺設計，以乾淨好讀、手機順暢投稿為原則

---

## 六、本地開發（選用，開發者用）

僅供工程師在本機測試使用，站主日常操作不需要這個步驟。

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入你自己的測試值
npm run dev
```

`wrangler.toml` 裡的 `database_id` 預設是佔位字串，本機測試如需連本機模擬的 D1，需先跑：

```bash
npx wrangler d1 create gw-wishlist-db
```

並把產生的 `database_id` 貼回 `wrangler.toml`。正式環境的 D1 綁定與這個檔案無關，一律以 Cloudflare Dashboard 的設定為準（見上方步驟 3）。

---

## 七、與其他專案的關聯

- 技術骨架（表單 → D1 → Google 登入白名單後台）可直接沿用於專案 #8 積分系統
- 收集到的聽眾回饋可作為專案 #5 內容數據分析的質化資料來源
