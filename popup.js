// Komplex AI — Hallucination Check
// Popup: paste text, check it, show the result.

const textEl = document.getElementById("text");
const countEl = document.getElementById("count");
const checkBtn = document.getElementById("check");
const resultEl = document.getElementById("result");
const optionsLink = document.getElementById("openOptions");

const MAX_CHARS = 2048;

function updateCount() {
  const n = textEl.value.length;
  countEl.textContent = `${n} / ${MAX_CHARS}`;
}
textEl.addEventListener("input", updateCount);
updateCount();

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
});

checkBtn.addEventListener("click", runCheck);
textEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runCheck();
});

function runCheck() {
  const text = textEl.value.trim();
  if (!text) {
    showError("Paste some text first.");
    return;
  }

  setBusy(true);
  showInfo("Checking… (first call after idle can take 10–30s)");

  chrome.runtime.sendMessage({ type: "komplexai-detect", text, prompt: "" }, (resp) => {
    setBusy(false);
    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message || "Extension messaging error.");
      return;
    }
    if (!resp) {
      showError("No response from the extension.");
      return;
    }
    if (resp.ok) {
      showResult(resp.result);
    } else {
      showError((resp.error && resp.error.message) || "Something went wrong.");
    }
  });
}

function setBusy(busy) {
  checkBtn.disabled = busy;
  checkBtn.textContent = busy ? "Checking…" : "Check";
}

function showResult(r) {
  const pct = Math.round((Number(r.p_hallucination) || 0) * 100);
  const flagged = !!r.flag;
  const regime = r.top_regime || "—";

  resultEl.hidden = false;
  resultEl.className = "result " + (flagged ? "flag" : "clean");
  resultEl.innerHTML = "";

  const score = document.createElement("div");
  score.className = "score";
  score.textContent = flagged
    ? `⚠️ ${pct}% likely hallucinated`
    : `✓ ${pct}% — looks clean`;
  resultEl.appendChild(score);

  const meta = document.createElement("div");
  meta.className = "meta";
  const bits = [`Top signal: ${regime}`];
  if (r.model_version) bits.push(`model ${r.model_version}`);
  if (typeof r.latency_ms === "number") bits.push(`${r.latency_ms} ms`);
  meta.textContent = bits.join(" · ");
  resultEl.appendChild(meta);
}

function showInfo(msg) {
  resultEl.hidden = false;
  resultEl.className = "result";
  resultEl.textContent = msg;
}

function showError(msg) {
  resultEl.hidden = false;
  resultEl.className = "result error";
  resultEl.textContent = msg;
}
