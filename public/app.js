const form = document.getElementById("submission-form");
const contentEl = document.getElementById("content");
const charCount = document.getElementById("char-count");
const resultEl = document.getElementById("result");
const submitBtn = document.getElementById("submit-btn");

const searchEl = document.getElementById("search");
const sortTabs = document.querySelectorAll(".sort-tab");
const wallLoading = document.getElementById("wall-loading");
const wallEmpty = document.getElementById("wall-empty");
const wallList = document.getElementById("wall-list");

const LIKED_STORAGE_KEY = "gw-wishlist-liked";
const AVATAR_COLORS = ["#1f4b5f", "#8a5a44", "#5a6b8a", "#6b7a3f", "#8a4a6b", "#4a7a7a"];
const STATUS_LABELS = { read: "被唸過", replied: "已回覆" };

let currentSort = "recent";

function getLikedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveLikedIds(set) {
  try {
    localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage 不可用時忽略即可，不影響核心功能
  }
}

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
      setSort("recent");
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

sortTabs.forEach((tab) => {
  tab.addEventListener("click", () => setSort(tab.dataset.sort));
});

function setSort(sort) {
  currentSort = sort;
  sortTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.sort === sort);
  });
  loadWall();
}

async function loadWall() {
  wallLoading.hidden = false;
  wallEmpty.hidden = true;
  wallList.innerHTML = "";

  const params = new URLSearchParams();
  if (searchEl.value.trim()) params.set("q", searchEl.value.trim());
  if (currentSort === "popular") params.set("sort", "popular");

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

    const likedIds = getLikedIds();
    for (const item of data.submissions) {
      wallList.appendChild(renderWallItem(item, likedIds));
    }
  } catch {
    wallLoading.hidden = true;
    wallEmpty.hidden = false;
    wallEmpty.textContent = "載入失敗，請重新整理";
  }
}

function renderWallItem(item, likedIds) {
  const displayName = item.nickname || "匿名";
  const alreadyLiked = likedIds.has(item.id);

  const card = document.createElement("article");
  card.className = "wall-item";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = displayName.slice(0, 1);
  avatar.style.background = avatarColor(displayName);

  const body = document.createElement("div");
  body.className = "wall-item-body";

  const topRow = document.createElement("div");
  topRow.className = "wall-item-top";

  const nameEl = document.createElement("span");
  nameEl.className = "wall-item-name";
  nameEl.textContent = displayName;

  const timeEl = document.createElement("span");
  timeEl.className = "wall-item-time";
  timeEl.textContent = formatTime(item.created_at);

  topRow.appendChild(nameEl);

  if (item.status && item.status !== "pending") {
    const statusEl = document.createElement("span");
    statusEl.className = "status-badge";
    statusEl.textContent = STATUS_LABELS[item.status] || item.status;
    topRow.appendChild(statusEl);
  }

  topRow.appendChild(timeEl);

  const bodyContentEl = document.createElement("div");
  bodyContentEl.className = "wall-item-content";
  bodyContentEl.textContent = item.content;

  const likeBtn = document.createElement("button");
  likeBtn.type = "button";
  likeBtn.className = "like-btn";
  if (alreadyLiked) likeBtn.classList.add("liked");
  likeBtn.disabled = alreadyLiked;
  likeBtn.innerHTML = `<span class="like-icon">${alreadyLiked ? "❤" : "♡"}</span><span class="like-count">${item.likes_count || 0}</span>`;
  likeBtn.addEventListener("click", () => handleLike(item.id, likeBtn));

  body.appendChild(topRow);
  body.appendChild(bodyContentEl);
  body.appendChild(likeBtn);

  card.appendChild(avatar);
  card.appendChild(body);
  return card;
}

async function handleLike(id, button) {
  button.disabled = true;
  try {
    const res = await fetch(`/api/submissions/${id}/like`, { method: "POST" });
    const data = await res.json();

    if (res.ok && data.ok) {
      button.classList.add("liked");
      button.innerHTML = `<span class="like-icon">❤</span><span class="like-count">${data.likes_count}</span>`;
      const likedIds = getLikedIds();
      likedIds.add(id);
      saveLikedIds(likedIds);
    } else {
      button.disabled = false;
    }
  } catch {
    button.disabled = false;
  }
}

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatTime(rawCreatedAt) {
  return new Date(rawCreatedAt.replace(" ", "T") + "Z").toLocaleString("zh-TW");
}

loadWall();
