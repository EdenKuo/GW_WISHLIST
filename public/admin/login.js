async function init() {
  const configRes = await fetch("/api/config");
  const config = await configRes.json();

  window.google.accounts.id.initialize({
    client_id: config.googleClientId,
    callback: handleCredential,
  });

  window.google.accounts.id.renderButton(
    document.getElementById("g_id_signin"),
    { theme: "outline", size: "large", text: "signin_with" }
  );
}

async function handleCredential(response) {
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      window.location.href = "/admin/index.html";
    } else {
      errorEl.textContent = data.error || "登入失敗";
      errorEl.hidden = false;
    }
  } catch {
    errorEl.textContent = "網路連線異常，請稍後再試";
    errorEl.hidden = false;
  }
}

window.addEventListener("load", () => {
  const check = setInterval(() => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      clearInterval(check);
      init();
    }
  }, 100);
});
