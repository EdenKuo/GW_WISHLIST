const form = document.getElementById("submission-form");
const contentEl = document.getElementById("content");
const charCount = document.getElementById("char-count");
const resultEl = document.getElementById("result");
const submitBtn = document.getElementById("submit-btn");

const searchEl = document.getElementById("search");
const wallLoading = document.getElementById("wall-loading");
const wallEmpty = document.getElementById("wall-empty");
const wallList = document.getElementById("wall-list");

contentEl.addEventListener("input", () => {
  charCount.textContent = String(contentEl.value.length);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = "送出中…";

  const formData = new FormData(form);
  const payload = {
    content: (formData.get("content") || "").toString(),
    nickname: (formData.get("nickname") || "").toString(),
    website: (formData.get("website") || "").toString(),
  };

  try {
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      showResult("收到囉，謝謝你的分享！", "success");
      form.reset();
      charCount.textContent = "0";
      searchEl.value = "";
      loadWall();
    } else {
      showResult(data.error || "送出失敗，請稍後再試", "error");
    }
  } catch {
    showResult("網路連線異常，請稍後再試", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "送出投稿";
  }
});

function showResult(message, type) {
  resultEl.textContent = message;
  resultEl.hidden = false;
  resultEl.className = `result ${type}`;
  resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

let searchDebounce;
searchEl.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadWall, 300);
});

async function loadWall() {
  wallLoading.hidden = false;
  wallEmpty.hidden = true;
  wallList.innerHTML = "";

  const params = new URLSearchParams();
  if (searchEl.value.trim()) params.set("q", searchEl.value.trim());

  try {
    const res = await fetch(`/api/submissions?${params}`);
    const data = await res.json();
    wallLoading.hidden = true;

    if (!data.ok || !data.submissions.length) {
      wallEmpty.hidden = false;
      wallEmpty.textContent = searchEl.value.trim()
        ? "找不到符合的留言"
        : "還沒有留言，來當第一個吧！";
      return;
    }

    for (const item of data.submissions) {
      wallList.appendChild(renderWallItem(item));
    }
  } catch {
    wallLoading.hidden = true;
    wallEmpty.hidden = false;
    wallEmpty.textContent = "載入失敗，請重新整理";
  }
}

function renderWallItem(item) {
  const card = document.createElement("article");
  card.className = "wall-item";

  const time = new Date(item.created_at.replace(" ", "T") + "Z").toLocaleString("zh-TW");

  const contentEl = document.createElement("div");
  contentEl.className = "wall-item-content";
  contentEl.textContent = item.content;

  const metaEl = document.createElement("div");
  metaEl.className = "wall-item-meta";
  metaEl.textContent = `${item.nickname || "匿名"} · ${time}`;

  card.appendChild(contentEl);
  card.appendChild(metaEl);
  return card;
}

loadWall();
