# Draft: Fix CDP / Script Evaluation on Linux

## Problem
`evalScript()` in `browser.ts` throws "Cannot evaluate script: CDP not connected" on Linux.

Root cause: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var (lib.rs:1294) is Windows-specific. WebKitGTK on Linux ignores it entirely, so no CDP server starts.

Additionally, the Linux `eval_webview_script` Rust command (lib.rs:963) is fire-and-forget — it always returns `"null"`, so even the Tauri IPC path can't return values from external-URL webviews.

## Impact
All features that rely on `evalScript`/`evalScriptJSON` are broken on Linux:
- Page discovery (selector detection)
- Screenshot capture (CDP or html2canvas fallback)
- DOM snapshot
- Batch grading actions
- Element picker
- Profile tester
- Markdown extraction

**189 call sites across 22 files** — all funnel through `browser.ts:evalScript()`.

## Key Files
- `ogre-desktop/src-tauri/src/lib.rs:1279-1301` — CDP port allocation (Windows-only)
- `ogre-desktop/src-tauri/src/lib.rs:961-982` — Linux eval_webview_script (fire-and-forget)
- `ogre-desktop/src/lib/cdp-client.ts` — CDP WebSocket client
- `ogre-desktop/src/lib/cdp-actions.ts:51-68` — connectCDP() auto-connect
- `ogre-desktop/src/lib/browser.ts:161-165` — evalScript() that throws the error

## Technical Environment
- **Tauri**: v2 (with "unstable" feature)
- **wry**: 0.54.1
- **gtk**: 0.18 with v3_24
- **Linux**: Pop!_OS 24.04 (WebKitGTK)

## Potential Approaches
### Option A: wry `evaluate_script_with_callback()` on Linux
- wry may support returning values from JS eval on WebKitGTK
- Would bypass CDP entirely for `evalScript` calls
- Uses `webkit_web_view_evaluate_javascript()` under the hood

### Option B: Enable WebKitGTK Inspector Server
- Set `WEBKIT_INSPECTOR_SERVER=127.0.0.1:{port}` env var
- Different protocol from Chrome CDP (may not be compatible)
- Would need to adapt cdp-client.ts

### Option C: Message channel workaround
- Inject a listener in the webview that posts results back via window.postMessage
- Capture results in Rust through a custom scheme handler
- More complex but works regardless of platform

### Option D: Hybrid approach
- Use wry's callback for simple eval (Option A)
- Keep CDP for advanced features (screenshot, DOM APIs) with WebKitGTK inspector

## Research Complete

### wry `evaluate_script_with_callback` — VIABLE ✅
- wry 0.54.1 (project's version) supports `evaluate_script_with_callback()` on Linux
- Uses `webkit_web_view_run_javascript()` under the hood
- Returns JSON-serialized results via callback
- **GOTCHA**: Callbacks silently dropped if called before `LoadEvent::Committed`
- **Tauri v2 does NOT expose this** — must use `with_webview()` to access raw wry handle

### WebKitGTK CDP — NOT compatible ❌
- WebKitGTK does NOT implement Chrome DevTools Protocol
- `WEBKIT_INSPECTOR_HTTP_SERVER` speaks WebKit Inspector Protocol (different from CDP)
- `Runtime.evaluate` exists (similar params) but `Page.captureScreenshot` does NOT exist
- Cannot reuse existing CDP client code without a translation layer
- Playwright on Linux uses WebDriver, not CDP

### Decision: wry callback approach (Option A)
- Fix `evalScript` via wry's `evaluate_script_with_callback()` accessed through `with_webview()`
- Screenshots: html2canvas fallback already exists (browser.ts:301-336) — works once evalScript is fixed
- CDP actions (pwClick etc): all have evalScript fallback paths in browser-actions.ts:532-570

## Requirements (confirmed)
- Linux is a FIRST-CLASS platform
- All evalScript features needed: page discovery, batch grading, element picker, etc.
- User runs the Tauri app on Pop!_OS 24.04

## Scope Boundaries
- IN: Fix evalScript/evalScriptJSON to return values on Linux
- IN: Make screenshot capture work on Linux (via html2canvas, not CDP)
- IN: Ensure all 189 call sites work through the fixed evalScript
- OUT: WebKit Inspector Protocol translation layer (too complex, unnecessary)
- OUT: CDP parity on Linux (not achievable — use wry callback instead)
- OUT: Input.dispatchMouseEvent on Linux (evalScript fallback handles actions)
