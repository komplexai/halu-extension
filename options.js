// Komplex AI — Hallucination Check
// Options: store the API key (and optional base URL) in chrome.storage.sync.

const DEFAULT_BASE_URL = "https://api.komplexai.io";

const apiKeyEl = document.getElementById("apiKey");
const baseUrlEl = document.getElementById("baseUrl");
const showEl = document.getElementById("show");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const statusEl = document.getElementById("status");

// Load existing settings.
chrome.storage.sync.get({ apiKey: "", baseUrl: DEFAULT_BASE_URL }, (items) => {
  apiKeyEl.value = items.apiKey || "";
  baseUrlEl.value = items.baseUrl || DEFAULT_BASE_URL;
});

showEl.addEventListener("change", () => {
  apiKeyEl.type = showEl.checked ? "text" : "password";
});

function readSettings() {
  const apiKey = apiKeyEl.value.trim();
  let baseUrl = baseUrlEl.value.trim().replace(/\/+$/, "");
  if (!baseUrl) baseUrl = DEFAULT_BASE_URL;
  return { apiKey, baseUrl };
}

saveBtn.addEventListener("click", () => {
  const { apiKey, baseUrl } = readSettings();
  chrome.storage.sync.set({ apiKey, baseUrl }, () => {
    if (chrome.runtime.lastError) {
      setStatus("Could not save: " + chrome.runtime.lastError.message, "err");
    } else {
      setStatus("Saved.", "ok");
    }
  });
});

testBtn.addEventListener("click", () => {
  const { apiKey, baseUrl } = readSettings();
  if (!apiKey) {
    setStatus("Enter an API key first.", "err");
    return;
  }
  // Save first so the tested settings are what's stored.
  chrome.storage.sync.set({ apiKey, baseUrl }, () => {
    testBtn.disabled = true;
    setStatus("Testing… (first call can cold-start ~10–30s)", "");
    chrome.runtime.sendMessage({ type: "komplexai-test-key", apiKey, baseUrl }, (resp) => {
      testBtn.disabled = false;
      if (chrome.runtime.lastError) {
        setStatus("Messaging error: " + chrome.runtime.lastError.message, "err");
        return;
      }
      if (resp && resp.ok) {
        setStatus("Key works. API reachable and authenticated.", "ok");
      } else {
        const msg = (resp && resp.error && resp.error.message) || "Test failed.";
        setStatus(msg, "err");
      }
    });
  });
});

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = kind || "";
}
