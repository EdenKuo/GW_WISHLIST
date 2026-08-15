# 財鯨動向｜聽眾投稿平台

對應工單：#10 站內投稿頁面（2026-08-12 開單）

一個公開的聽眾投稿頁面，讓聽眾免登入留言、許願、給回饋；站主本人透過受保護的後台（Google 登入 + email 白名單）檢視、標記狀態、分類集數、篩選與隱藏留言。

技術棧：**Cloudflare Workers + Static Assets（前台 + 後台頁 + API）+ Cloudflare D1（資料庫）**，全程不需要自架伺服器。

> 註：Cloudflare 已把舊版「Pages」產品整合進「Workers」，新專案一律走 Workers + Static Assets 這條路線，介面上會看到 Bindings、Deployments、Edit code 等分頁，不會再看到獨立的「Pages」入口。

---

## 一、專案結構

```
public/                  靜態網頁（打包進 Worker 的 Static Assets）
  index.html, style.css, app.js       前台投稿頁
  admin/
    login.html, login.js              後台登入頁（Google 登入）
    index.html, admin.js, admin.css   後台管理頁

src/                      Worker 程式碼（API + /admin 保護邏輯）
  index.ts                          唯一進入點，處理所有 /api/* 路由與 /admin/* 保護，其餘請求交給 Static Assets
  lib/
    auth.ts                          Google ID Token 驗證、後台 session 簽發與驗證
    types.ts                         共用型別定義（含 Env 綁定）

schema.sql                D1 資料表結構（用 Cloudflare Dashboard 的 D1 Console 執行）
wrangler.toml              Worker 設定（main、assets、D1 綁定；正式環境的 D1 綁定與環境變數以 Cloudflare Dashboard 為準）
```

---

## 二、部署步驟（第一次上線，全程在網頁介面操作，不需要裝任何工具）

### 步驟 1：建立 D1 資料庫

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左側選單找到 **Storage & Databases > D1 SQL Database**
3. 點 **Create Database**，命名建議：`gw-wishlist-db`
4. 建立完成後，點進資料庫 > **Console** 分頁
5. 打開專案裡的 `schema.sql`，複製全部內容，貼到 Console 裡執行
6. 確認 `/tables` 或左側列表出現一張 `submissions` 資料表即完成

### 步驟 2：建立 Worker 專案並連接 GitHub

1. 在 Cloudflare Dashboard 左側選單找 **Compute**（Build 分類底下）
2. 選擇建立 Worker、連接 Git repository 的選項
3. 選擇這個 GitHub repository（`EdenKuo/GW_WISHLIST`）、branch 選 `claude/audience-submission-platform-p1prjl`
4. 設定建置參數：
   - **Build command**：留空
   - **Deploy command**：`npx wrangler deploy`（這是本專案 `wrangler.toml` 設定所對應的正確指令）
5. 先不用管環境變數，直接部署（第一次部署會因為缺少環境變數而功能不完整，屬正常現象，下面步驟會補上）

### 步驟 3：把 D1 資料庫綁到 Worker 專案

1. 進入剛建立的專案 > **Bindings** 分頁
2. 新增 D1 database 綁定，Variable name 填：`DB`（必須完全一致，程式碼裡是用這個名字讀取資料庫）
3. D1 database 選剛剛建立的 `gw-wishlist-db`

### 步驟 4：申請 Google OAuth Client ID（讓後台可以用 Google 帳號登入）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) > 建立一個新專案（或使用現有專案）
2. 左側選單 **APIs & Services > OAuth consent screen**，設定基本資訊（User Type 選 External 即可，應用程式名稱填「財鯨動向後台」）
3. 左側選單 **APIs & Services > Credentials** > **Create Credentials > OAuth client ID**
4. Application type 選 **Web application**
5. **Authorized JavaScript origins** 加入你的 Worker 網址，例如：
   - `https://gw-wishlist.<你的帳號>.workers.dev`（實際網址在專案的 Overview / Domains 分頁可以看到）
   - 之後若綁自訂網域，也要把自訂網域加進來
6. 不需要填 Authorized redirect URIs（這裡用的是 Google Identity Services 登入按鈕，不是導轉流程）
7. 建立完成後複製 **Client ID**（一長串以 `.apps.googleusercontent.com` 結尾的字串）

### 步驟 5：設定環境變數

在專案的 **Bindings** 或 **Settings** 分頁（依畫面而定，通常會有 Variables/Secrets 相關區塊），新增以下三個變數：

| 變數名稱 | 值 | 說明 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | 步驟 4 拿到的 Client ID | 用來驗證登入者是否為合法 Google 帳號 |
| `ADMIN_EMAILS` | `caring841111@gmail.com` | 白名單，只有這裡列出的 email 能進後台；多個 email 用逗號分隔（例如 `caring841111@gmail.com,other@example.com`） |
| `SESSION_SECRET` | 自訂一長串隨機字串（例如 32 個以上的英數字），並設為 **Secret**（加密） | 用來加密簽署後台登入的憑證，請妥善保管、不要外流 |

日後若要新增其他管理員帳號，直接把新 email 加進 `ADMIN_EMAILS`（用逗號分隔多個），存檔後重新部署即可，不需要改任何程式碼。

設定完成後，回到 **Deployments** 分頁，重新觸發一次部署（Retry 或推一次新的 commit），讓新的環境變數與 D1 綁定生效。

### 步驟 6：驗收（工單第一階段標準）

1. 打開 Worker 網址（前台），送出一則測試留言，應看到「收到囉，謝謝你的分享！」
2. 打開 `/admin/login.html`，用 `ADMIN_EMAILS` 裡的 Google 帳號登入
3. 登入後應能在後台列表看到剛剛的測試留言
4. 把它的狀態改成「已念過」，填入集數（例如 `EP.45`）
5. 用篩選功能，依狀態或集數篩出這則留言
6. 全部走通即代表第一階段驗收通過

---

## 三、前台留言牆（設計變更說明）

原始工單設計是「投稿先進後台審核，只有站主看得到」。開發過程中站主確認要改成**公開留言牆**：任何人送出投稿後，立即會出現在前台頁面，所有訪客都能看到全部留言內容並用搜尋列查詢，不需要等站主先審過。

取捨：這代表沒有「上稿前審核」的把關機制，不當或洗版內容會先公開曝光，站主只能事後用後台的「隱藏」功能下架。前台既有的防濫用機制（見下方第四節）是目前唯一在內容公開前的防線。

---

## 四、後台操作說明（給站主）

- **登入**：開啟 `/admin/login.html`，用授權的 Google 帳號登入即可，沒有密碼要記
- **狀態**：每則投稿可標記「未處理 / 已念過 / 已回覆」，直接在下拉選單切換即會自動儲存
- **集數**：在「集數」欄位輸入（例如 `EP.45`），打完按 Enter 或點掉輸入框即自動儲存
- **篩選**：上方可依狀態、集數篩選要看的投稿
- **隱藏**：點「隱藏」可移除不當或洗版留言，同時會從前台留言牆下架（資料庫仍會保留紀錄，如需徹底救回可請開發者協助從 D1 Console 還原）
- **登出**：右上角「登出」按鈕

---

## 五、防濫用機制（前台）

- 留言內容必填、上限 500 字；暱稱選填、上限 50 字
- 隱藏欄位（honeypot）攔截機器人自動送出
- 同一來源 10 分鐘內最多送出 5 則留言，超過會提示「留言有點頻繁，請稍後再試」
- 同一來源 5 分鐘內送出完全相同內容會被視為重複，不會重複寫入

---

## 六、範圍聲明（呼應工單「明確不做」）

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

本地部署可用 `npm run deploy`（等同 `wrangler deploy`），需要先用 `npx wrangler login` 登入 Cloudflare 帳號。

---

## 七、與其他專案的關聯

- 技術骨架（表單 → D1 → Google 登入白名單後台）可直接沿用於專案 #8 積分系統
- 收集到的聽眾回饋可作為專案 #5 內容數據分析的質化資料來源
