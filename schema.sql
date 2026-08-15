-- 財鯨動向 聽眾投稿平台 — D1 資料表結構
-- 使用方式：到 Cloudflare Dashboard 的 D1 資料庫頁面，開啟「Console」，
-- 貼上這個檔案的全部內容並執行即可（不需要安裝任何工具）。

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  nickname TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending=未處理 / read=已念過 / replied=已回覆
  episode TEXT,                            -- 例如 'EP.45'
  hidden INTEGER NOT NULL DEFAULT 0,       -- 0=顯示 / 1=已隱藏（軟刪除）
  client_ip_hash TEXT,                     -- 投稿來源 IP 的雜湊值，僅用於防洗版，不存原始 IP
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_episode ON submissions(episode);
CREATE INDEX IF NOT EXISTS idx_submissions_hidden ON submissions(hidden);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_ip_hash ON submissions(client_ip_hash);
