// Komplex AI — Hallucination Check
// Background service worker (Manifest V3).
// Registers the context menu, calls the detector API, and surfaces results.

const DEFAULT_BASE_URL = "https://api.komplexai.io";
const MAX_CHARS = 2048;
const MENU_ID = "komplexai-check";
const REQUEST_TIMEOUT_MS = 45000; // cold start can be ~10-30s; allow headroom

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Check for hallucination with Komplex AI",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText || "").trim();
  if (!text) {
    notify("Komplex AI", "No text selected.");
    return;
  }
  handleCheck(text, tab);
});

// ---------------------------------------------------------------------------
// Popup / options messaging bridge
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "komplexai-detect") {
    detect(msg.text, msg.prompt)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: toErrorInfo(err) }));
    return true; // async response
  }
  if (msg && msg.type === "komplexai-test-key") {
    detect("This is a short connectivity test.", "", msg.apiKey, msg.baseUrl)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: toErrorInfo(err) }));
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Core flow for the context-menu path
// ---------------------------------------------------------------------------

async function handleCheck(text, tab) {
  const canInject = tab && typeof tab.id === "number" && tab.id >= 0;

  if (canInject) {
    await showBadge(tab.id, { state: "loading" }).catch(() => {});
  } else {
    notify("Komplex AI", "Checking selected text…");
  }

  try {
    const result = await detect(text, "");
    if (canInject) {
      const shown = await showBadge(tab.id, { state: "result", result }).catch(() => false);
      if (!shown) notify("Komplex AI", formatResultText(result));
    } else {
      notify("Komplex AI", formatResultText(result));
    }
  } catch (err) {
    const info = toErrorInfo(err);
    if (canInject) {
      const shown = await showBadge(tab.id, { state: "error", message: info.message }).catch(() => false);
      if (!shown) notify("Komplex AI — error", info.message);
    } else {
      notify("Komplex AI — error", info.message);
    }
  }
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ apiKey: "", baseUrl: DEFAULT_BASE_URL }, (items) => {
      resolve({
        apiKey: (items.apiKey || "").trim(),
        baseUrl: (items.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "")
      });
    });
  });
}

async function detect(text, prompt, overrideKey, overrideBaseUrl) {
  const settings = await getSettings();
  const apiKey = (overrideKey != null ? overrideKey : settings.apiKey).trim();
  const baseUrl = (overrideBaseUrl || settings.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

  if (!apiKey) {
    throw new ApiError("No API key set. Open the extension options and paste your key (sk_…).", { code: "no_key" });
  }

  const response = String(text || "").slice(0, MAX_CHARS);
  const body = { response, task: "multiclass" };
  if (prompt && String(prompt).trim()) {
    body.prompt = String(prompt).slice(0, MAX_CHARS);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${baseUrl}/api/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === "AbortError") {
      throw new ApiError("Request timed out. The service may be cold-starting (first call after idle can take 10–30s). Try again.", { code: "timeout" });
    }
    throw new ApiError("Network error — could not reach api.komplexai.io. Check your connection.", { code: "network" });
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw await httpError(res);
  }

  let data;
  try {
    data = await res.json();
  } catch (_e) {
    throw new ApiError("Unexpected response from the API (not valid JSON).", { code: "bad_json" });
  }
  return data;
}

async function httpError(res) {
  let detail = "";
  try {
    const j = await res.json();
    detail = j && (j.error || j.message || j.detail) ? ` (${j.error || j.message || j.detail})` : "";
  } catch (_e) { /* ignore */ }

  switch (res.status) {
    case 401:
    case 403:
      return new ApiError("Invalid or missing API key. Set your key in the extension options." + detail, { code: "auth", status: res.status });
    case 402:
      return new ApiError("Quota exceeded on your plan. Check your usage at detector.komplexai.io." + detail, { code: "quota", status: res.status });
    case 429:
      return new ApiError("Rate limited (429). Slow down and try again shortly." + detail, { code: "rate_limit", status: res.status });
    case 413:
      return new ApiError("Text too large. Max 2,048 characters." + detail, { code: "too_large", status: res.status });
    case 503:
    case 504:
      return new ApiError("Service unavailable — likely cold-starting (10–30s). Try again in a moment." + detail, { code: "cold_start", status: res.status });
    default:
      return new ApiError(`API error (${res.status}).` + detail, { code: "http", status: res.status });
  }
}

class ApiError extends Error {
  constructor(message, meta) {
    super(message);
    this.name = "ApiError";
    this.meta = meta || {};
  }
}

function toErrorInfo(err) {
  if (err instanceof ApiError) {
    return { message: err.message, code: err.meta.code || "error", status: err.meta.status || null };
  }
  return { message: (err && err.message) ? err.message : "Unknown error.", code: "error", status: null };
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatResultText(result) {
  const pct = Math.round((Number(result.p_hallucination) || 0) * 100);
  const regime = result.top_regime || "—";
  if (result.flag) {
    return `⚠️ ${pct}% likely hallucinated — ${regime}`;
  }
  return `✓ ${pct}% — looks clean (${regime})`;
}

// ---------------------------------------------------------------------------
// Notifications (fallback surface)
// ---------------------------------------------------------------------------

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon.svg",
      title,
      message: String(message || "")
    }, () => {
      // Some Chrome builds reject SVG iconUrl for notifications; ignore errors.
      void chrome.runtime.lastError;
    });
  } catch (_e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Inject the badge/toast into the active tab
// ---------------------------------------------------------------------------

async function showBadge(tabId, payload) {
  // Inject CSS + content script on demand (activeTab granted by the menu click).
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  } catch (_e) { /* CSS may already be present or blocked */ }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (_e) {
    // Cannot inject here (e.g. chrome:// page, PDF viewer, store pages).
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: "komplexai-badge", payload });
    return true;
  } catch (_e) {
    return false;
  }
}
