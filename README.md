# Komplex AI — Hallucination Check (browser extension)

A Manifest V3 extension for Chrome / Edge that scores how likely a chunk of LLM
output is to be hallucinated, using the [Komplex AI](https://detector.komplexai.io)
detector API.

## What it does

- **Right-click any selected text** on any page (a ChatGPT / Claude / Gemini
  answer, a doc, an email) → **“Check for hallucination with Komplex AI.”** The
  extension sends the selection to the API and shows a small dismissible result
  toast in the top-right corner, e.g.
  `⚠️ 87% likely hallucinated — FABRICATED` or `✓ 4% — looks clean`.
- **Toolbar popup** — paste text, click **Check**, see the score, top regime,
  and a link to get a free API key.
- **Options page** — store your API key (and, optionally, an API base-URL
  override) and run a **Test key** check.

## Honest scope & limits

- English **natural-language** only.
- Up to **2,048 characters** per check (longer selections are truncated).
- A **probabilistic signal, not a fact-checker** — it estimates the likelihood
  of hallucination; it does not verify claims against sources.
- The **first call after idle can cold-start (~10–30s)**; later calls are fast.
- **No data retention** by the API.

## Install (load unpacked, for testing)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder
   (`halu-extension/`).
4. The Komplex AI icon appears in the toolbar.

## Set your API key

1. Get a free key at
   [detector.komplexai.io/account/keys](https://detector.komplexai.io/account/keys)
   (looks like `sk_…`).
2. Right-click the extension icon → **Options** (or click **Set API key** in the
   popup).
3. Paste the key, click **Save**, then **Test key** to confirm it works.

The key is stored in `chrome.storage.sync` (synced to your Chrome profile). It
is only ever sent to `https://api.komplexai.io`.

## Permissions (why each is requested)

| Permission | Why |
|---|---|
| `contextMenus` | Adds the right-click “Check for hallucination” item. |
| `storage` | Saves your API key and settings. |
| `activeTab` + `scripting` | Injects the result toast into the current tab **only when you invoke the menu** — no standing content script, no broad page access. |
| `notifications` | Fallback result surface on pages where a toast can’t be injected (e.g. `chrome://` pages, the PDF viewer). |
| host: `https://api.komplexai.io/*` | The only host the extension talks to. **No broad host permissions are requested.** |

## API contract used

```
POST https://api.komplexai.io/api/detect
Authorization: Bearer sk_...
Content-Type: application/json

{ "response": "<text>", "prompt": "<optional>", "task": "multiclass" }
```

Response:

```
{ "p_hallucination": 0.87, "flag": true, "top_regime": "FABRICATED",
  "regime_scores": [ {"regime": "...", "p": 0.0}, ... ],
  "model_version": "...", "latency_ms": 1234, "request_id": "..." }
```

Regimes: `NORMAL`, `FABRICATED`, `NEAR_FALSE`, `CF_AUTH` (fake / misattributed
citation), `FALSE_REFUSAL`, `Other`.

## Files

```
manifest.json     MV3 manifest
background.js      service worker: context menu, API call, error handling
content.js         injected toast renderer
content.css        self-contained toast styling
popup.html/js/css  toolbar popup (paste & check)
options.html/js    settings (API key + base-URL override + test)
icons/icon.svg     placeholder icon (purple rounded square + white check)
```

## Before Chrome Web Store submission (hold for the founder)

This build is **loadable unpacked as-is** for testing. It is **not** ready to
publish, and per instruction nothing here is published, pushed, or committed —
a human reviews first. To submit later:

1. **Generate PNG icons** at 16 / 48 / 128 px from `icons/icon.svg` and switch
   `manifest.json` to reference the PNGs. The Chrome Web Store requires raster
   PNG icons; SVG is accepted for loading unpacked but not for store listing
   assets. Example (needs a converter such as `rsvg-convert` or Inkscape):
   ```
   rsvg-convert -w 16  -h 16  icons/icon.svg -o icons/icon16.png
   rsvg-convert -w 48  -h 48  icons/icon.svg -o icons/icon48.png
   rsvg-convert -w 128 -h 128 icons/icon.svg -o icons/icon128.png
   ```
   Also note: `chrome.notifications` on some Chrome builds will not render an
   SVG `iconUrl`; a PNG makes the notification icon reliable too.
2. A Chrome Web Store **developer account ($5 one-time fee)** is required.
3. The listing goes through **review** (privacy disclosures, permission
   justifications, store images). Prepare a privacy statement noting the
   extension sends selected text to the Komplex AI API and stores only the key
   locally.
