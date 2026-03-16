# Spike: playwright-core CDP Integration

**Date:** 2026-02-22
**Status:** PASS - Proceed with Playwright CDP integration

## Summary

`playwright-core` (v1.58.2) installs cleanly as a devDependency and has **zero impact** on the Vite frontend bundle. It is safe to use for CDP-based WebView2 automation in the Tauri backend/script context.

## Findings

### 1. Does playwright-core import without error?

**YES** - `playwright-core` installed with `npm install --save-dev playwright-core` with no errors.

- Added 1 package (no transitive dependencies)
- Package size on disk: ~8.9 MB in `node_modules/playwright-core/`
- Unlike full `playwright`, `playwright-core` does NOT download browser binaries

### 2. Bundle Size Impact

**ZERO** - No bundle size change.

| Metric | Value |
|--------|-------|
| JS bundle (`index-*.js`) | 1,440.17 kB (unchanged) |
| CSS bundle (`index-*.css`) | 127.85 kB (unchanged) |
| Total `dist/` size | ~2,719 KB (unchanged) |
| `node_modules/playwright-core` | ~8.9 MB (dev only) |

`playwright-core` is a **devDependency** and is not imported by any frontend source file, so Vite correctly tree-shakes / excludes it from the production bundle entirely.

### 3. Vite Config Changes Needed

**NONE** - No Vite configuration changes required.

The current `vite.config.js` works as-is:
```js
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
})
```

**Important caveat:** `playwright-core` should ONLY be used in:
- Node.js/Bun scripts (like this spike script)
- Tauri Rust backend via `evalScript` or sidecar processes
- Test files

It should **NOT** be imported in any `src/` frontend code. If it were, Vite would attempt to bundle Node.js APIs (`net`, `fs`, `child_process`, etc.) and fail. This is expected and correct - CDP connections are a backend/tooling concern.

### 4. Spike Script

`playwright-bun-spike.ts` demonstrates:
- Importing `chromium` from `playwright-core`
- Connecting via `chromium.connectOverCDP('http://127.0.0.1:9222')`
- Listing browser contexts and pages
- Raw CDP target enumeration via `Target.getTargets`

The script is designed to run with `npx tsx` or `bun run`, NOT in the browser.

### 5. Pre-existing Warnings

The Vite build shows two pre-existing warnings (unrelated to this spike):
- `db.ts` mixed static/dynamic import warning
- `browser.ts` mixed static/dynamic import warning
- Chunk size > 500 kB warning (from katex/mathlive, not playwright)

## Recommendation

**PROCEED** with Feature 3 (Playwright CDP). The integration path is:

1. `playwright-core` stays as devDependency (no production impact)
2. CDP connection code lives in Node/Bun scripts or Tauri backend
3. Frontend communicates with the CDP layer via Tauri commands (IPC)
4. No Vite config changes needed
5. WebView2 needs `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` at launch

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Accidental frontend import | Low | Keep imports in `spike/` or backend only |
| WebView2 CDP compatibility | Medium | Test with actual WebView2 in Task 2 |
| Version conflicts | Low | playwright-core has zero transitive deps |


---

## CDP + WebView2 Targeting Spike

**Date:** 2026-02-22
**Status:** ✅ FEASIBLE — Feature 3 (Agent Mode / CDP automation) is viable.

---

### 1. Enabling CDP on WebView2

**Environment Variable:**

```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
```

This env var instructs the WebView2 runtime to start its Chromium browser process with CDP enabled on the specified port. It exposes **all** WebView2 instances (webviews) in the process via a single CDP endpoint.

**Recommended Port:** `9222` (standard CDP convention; any unused port works).

**Critical Constraint:** The env var MUST be set **before** the WebView2 runtime creates its first browser process. In Tauri, this happens during `tauri::Builder::default().build()`.

---

### 2. Required Rust Code Change in `lib.rs`

**File:** `ogre-desktop/src-tauri/src/lib.rs`
**Location:** At the very start of `pub fn run()` (line 607), BEFORE the `tauri::Builder::default()` chain (line 721).

The env var must be set before any WebView2 process is created. The `.build()` call at line 858 triggers WebView2 initialization, but the builder chain starting at line 721 may also trigger early WebView2 setup. Setting it at the top of `run()` is the safest approach.

**Exact code change — insert at line 608 (after `pub fn run() {`):**

```rust
pub fn run() {
    // === CDP: Enable Chrome DevTools Protocol for embedded browser automation ===
    // MUST be set before WebView2 creates its browser process (before .build()).
    // Only enable in debug builds or when explicitly requested via feature flag.
    #[cfg(debug_assertions)]
    {
        if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--remote-debugging-port=9222",
            );
            eprintln!("[ogre] CDP enabled on port 9222 (debug build)");
        }
    }

    // Production: only set if OGRE_CDP_PORT is explicitly configured
    #[cfg(not(debug_assertions))]
    {
        if let Ok(port) = std::env::var("OGRE_CDP_PORT") {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                format!("--remote-debugging-port={}", port),
            );
            eprintln!("[ogre] CDP enabled on port {} (production)", port);
        }
    }

    let migrations = vec![
        // ... existing migration code ...
```

**Why this location:**
- Line 607 is `pub fn run() {`
- Line 608+ currently starts `let migrations = vec![...]`
- The env var insert goes between the function signature and the migrations vec
- This guarantees the var is set before `tauri::Builder::default()` at line 721 and `.build()` at line 858

**Alternative (simpler, always-on for agent mode feature):**

```rust
pub fn run() {
    // Enable CDP for agent mode automation
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--remote-debugging-port=9222",
    );

    let migrations = vec![
```

---

### 3. CDP Discovery Endpoint

**URL:** `http://127.0.0.1:9222/json`

**Response format** (JSON array of targets):

```json
[
  {
    "description": "",
    "devtoolsFrontendUrl": "/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/ABCDEF123",
    "id": "ABCDEF123",
    "title": "O.G.R.E Desktop",
    "type": "page",
    "url": "https://tauri.localhost/",
    "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/ABCDEF123"
  },
  {
    "description": "",
    "devtoolsFrontendUrl": "/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/789XYZ456",
    "id": "789XYZ456",
    "title": "MyOpenMath - Grading",
    "type": "page",
    "url": "https://www.myopenmath.com/course/gradeallq2.php?cid=12345&qsetid=67890",
    "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/789XYZ456"
  }
]
```

**Important:** Use `127.0.0.1` NOT `localhost` — WebView2 may bind to IPv4 only, and `localhost` could resolve to IPv6 `[::1]` on some systems (see [WebView2Feedback#4709](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4709)).

---

### 4. Target Identification Strategy

| Target | URL Pattern | How to Identify |
|--------|-------------|-----------------|
| **Main app webview** | `tauri://localhost/*` or `https://tauri.localhost/*` | URL starts with `tauri://` or `https://tauri.localhost` |
| **Main app (dev mode)** | `http://localhost:1420/*` or `http://localhost:5173/*` | URL matches Vite dev server port |
| **Embedded browser** | `https://www.myopenmath.com/*` (or any external URL) | URL does NOT match any Tauri/dev pattern |
| **Blank/empty** | `about:blank` or `""` | Ignore these |

**Reliable identification algorithm:**

```typescript
const MAIN_APP_PATTERNS = [
  /^tauri:\/\/localhost/,
  /^https:\/\/tauri\.localhost/,
  /^http:\/\/localhost:(1420|5173)/,  // dev mode
];

function findEmbeddedBrowser(targets: CDPTarget[]): CDPTarget | undefined {
  return targets.find(t =>
    t.type === "page" &&
    t.url !== "about:blank" &&
    t.url !== "" &&
    !MAIN_APP_PATTERNS.some(p => p.test(t.url))
  );
}
```

The embedded browser is created with label `"embedded-browser"` in Tauri (see `lib.rs:217-219`), but CDP does not expose Tauri's internal webview labels. We must identify targets by URL pattern instead.

---

### 5. Key Findings

1. **All WebView2 instances share one CDP endpoint.** Setting the env var once exposes both the main app webview and the embedded browser through the same port.

2. **The embedded browser only appears as a target AFTER it has been created.** The `create_embedded_browser` command (lib.rs:201) creates it on-demand when the user navigates to a grading site. Before that, only the main app target will be visible.

3. **Playwright can connect via `connectOverCDP`.** Confirmed by Playwright's official WebView2 documentation. The existing `playwright-bun-spike.ts` already validates this connection path.

4. **No new dependencies needed for discovery.** The `/json` endpoint is a standard HTTP GET — plain `fetch()` is sufficient for target discovery.

5. **IPv4 vs IPv6 gotcha.** Always use `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues on Windows.

6. **Security consideration.** CDP gives full access to page content and execution. In production, the port should only be enabled when agent mode is active, and ideally bound only to localhost (which WebView2 does by default).

---

### 6. Feasibility Verdict

**✅ Feature 3 (Agent Mode) is FEASIBLE.**

- WebView2 fully supports CDP via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`
- Both the main app and embedded browser are exposed as separate CDP targets
- Targets are reliably distinguishable by URL pattern
- Playwright can connect and automate the embedded browser target specifically
- The Rust code change is minimal (2-5 lines at the top of `run()`)

**Next steps:**
1. Implement the env var setting in `lib.rs` (Task 3 or later)
2. Use `playwright.chromium.connectOverCDP()` to connect
3. Filter targets to find the embedded browser by URL pattern
4. Execute grading automation scripts against that specific target