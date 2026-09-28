// Komplex AI — Hallucination Check
// Content script: renders a small, dismissible result toast in the corner.
// Injected on demand by the background service worker.

(function () {
  if (window.__komplexaiInjected) return;
  window.__komplexaiInjected = true;

  const TOAST_ID = "komplexai-toast";
  let hideTimer = null;

  function removeToast() {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function buildToast() {
    removeToast();
    const el = document.createElement("div");
    el.id = TOAST_ID;
    el.className = "komplexai-toast";
    // Shadow-ish isolation via a dedicated class namespace + !important CSS.
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.documentElement.appendChild(el);
    return el;
  }

  function render(payload) {
    const el = buildToast();

    const header = document.createElement("div");
    header.className = "komplexai-toast__header";

    const brand = document.createElement("span");
    brand.className = "komplexai-toast__brand";
    brand.textContent = "Komplex AI";

    const close = document.createElement("button");
    close.className = "komplexai-toast__close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", removeToast);

    header.appendChild(brand);
    header.appendChild(close);
    el.appendChild(header);

    const bodyEl = document.createElement("div");
    bodyEl.className = "komplexai-toast__body";
    el.appendChild(bodyEl);

    if (payload.state === "loading") {
      el.classList.add("komplexai-toast--loading");
      bodyEl.textContent = "Checking selected text…";
      const hint = document.createElement("div");
      hint.className = "komplexai-toast__hint";
      hint.textContent = "First call after idle can take 10–30s.";
      el.appendChild(hint);
      return;
    }

    if (payload.state === "error") {
      el.classList.add("komplexai-toast--error");
      const title = document.createElement("div");
      title.className = "komplexai-toast__title";
      title.textContent = "Couldn’t check";
      bodyEl.appendChild(title);
      const msg = document.createElement("div");
      msg.className = "komplexai-toast__msg";
      msg.textContent = payload.message || "Unknown error.";
      bodyEl.appendChild(msg);
      scheduleAutoHide(12000);
      return;
    }

    // Result
    const r = payload.result || {};
    const pct = Math.round((Number(r.p_hallucination) || 0) * 100);
    const flagged = !!r.flag;
    const regime = r.top_regime || "—";

    el.classList.add(flagged ? "komplexai-toast--flag" : "komplexai-toast--clean");

    const scoreRow = document.createElement("div");
    scoreRow.className = "komplexai-toast__score";
    scoreRow.textContent = flagged
      ? `⚠️ ${pct}% likely hallucinated`
      : `✓ ${pct}% — looks clean`;
    bodyEl.appendChild(scoreRow);

    const regimeRow = document.createElement("div");
    regimeRow.className = "komplexai-toast__regime";
    regimeRow.textContent = `Top signal: ${regime}`;
    bodyEl.appendChild(regimeRow);

    const foot = document.createElement("div");
    foot.className = "komplexai-toast__hint";
    foot.textContent = "Probabilistic signal, not a fact-checker.";
    el.appendChild(foot);

    scheduleAutoHide(12000);
  }

  function scheduleAutoHide(ms) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(removeToast, ms);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "komplexai-badge") {
      render(msg.payload || {});
    }
  });
})();
