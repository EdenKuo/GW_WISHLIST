const STATUS_LABELS = { pending: "未處理", read: "已念過", replied: "已回覆" };

const listEl = document.getElementById("list");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const filterStatus = document.getElementById("filter-status");
const filterEpisode = document.getElementById("filter-episode");

document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("refresh-btn").addEventListener("click", loadSubmissions);
filterStatus.addEventListener("change", loadSubmissions);

let episodeDebounce;
filterEpisode.addEventListener("input", () => {
  clearTimeout(episodeDebounce);
  episodeDebounce = setTimeout(loadSubmissions, 400);
});

async function loadSubmissions() {
  loadingEl.hidden = false;
  emptyEl.hidden = true;
  listEl.innerHTML = "";

  const params = new URLSearchParams();
  if (filterStatus.value) params.set("status", filterStatus.value);
  if (filterEpisode.value.trim()) params.set("episode", filterEpisode.value.trim());

  try {
    const res = await fetch(`/api/admin/submissions?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login.html";
      return;
    }
    const data = await res.json();
    loadingEl.hidden = true;

    if (!data.ok || !data.submissions.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = "目前沒有符合條件的投稿";
      return;
    }

    for (const item of data.submissions) {
      listEl.appendChild(renderCard(item));
    }
  } catch {
    loadingEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = "載入失敗，請重新整理";
  }
}

function renderCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = String(item.id);

  const time = new Date(item.created_at.replace(" ", "T") + "Z").toLocaleString("zh-TW");

  card.innerHTML = `
    <div class="card-content"></div>
    <div class="card-meta">
      <span class="card-nickname"></span>
      <span>時間：${time}</span>
    </div>
    <div class="card-actions">
      <label>
        狀態
        <select class="status-select">
          ${Object.entries(STATUS_LABELS)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${value === item.status ? "selected" : ""}>${label}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>
        集數
        <input type="text" class="episode-input" placeholder="例如 EP.45">
      </label>
      <button type="button" class="btn-danger hide-btn">隱藏</button>
    </div>
  `;

  card.querySelector(".card-content").textContent = item.content;
  card.querySelector(".card-nickname").textContent = `暱稱：${item.nickname || "匿名"}`;

  const episodeInput = card.querySelector(".episode-input");
  episodeInput.value = item.episode || "";

  card.querySelector(".status-select").addEventListener("change", (event) => {
    updateSubmission(item.id, { status: event.target.value });
  });

  episodeInput.addEventListener("blur", () => {
    updateSubmission(item.id, { episode: episodeInput.value.trim() });
  });
  episodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") episodeInput.blur();
  });

  card.querySelector(".hide-btn").addEventListener("click", () => {
    if (confirm("確定要隱藏這則投稿嗎？")) hideSubmission(item.id, card);
  });

  return card;
}

async function updateSubmission(id, patch) {
  try {
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.status === 401) {
      window.location.href = "/admin/login.html";
      return;
    }
    const data = await res.json();
    if (!data.ok) alert(data.error || "更新失敗");
  } catch {
    alert("網路連線異常，請稍後再試");
  }
}

async function hideSubmission(id, card) {
  try {
    const res = await fetch(`/api/admin/submissions/${id}`, { method: "DELETE" });
    if (res.status === 401) {
      window.location.href = "/admin/login.html";
      return;
    }
    const data = await res.json();
    if (data.ok) {
      card.remove();
    } else {
      alert(data.error || "隱藏失敗");
    }
  } catch {
    alert("網路連線異常，請稍後再試");
  }
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "/admin/login.html";
}

loadSubmissions();
