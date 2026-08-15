const form = document.getElementById("submission-form");
const contentEl = document.getElementById("content");
const charCount = document.getElementById("char-count");
const resultEl = document.getElementById("result");
const submitBtn = document.getElementById("submit-btn");

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
