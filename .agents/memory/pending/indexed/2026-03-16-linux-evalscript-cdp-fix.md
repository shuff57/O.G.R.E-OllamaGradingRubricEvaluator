# Linux evalScript CDP Fix — Session Reflection

## What Was Done
- Diagnosed "Cannot evaluate script: CDP not connected" error in O.G.R.E desktop app on Linux
- Root cause: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var is Windows-only; WebKitGTK ignores it, so no CDP server starts. Linux `eval_webview_script` was fire-and-forget (always returned "null").
- Implemented fix: Rust `eval_webview_script` on Linux now uses wry's `evaluate_script_with_callback()` with `Arc<Mutex<Option<Sender>>>` pattern to return actual values
- TypeScript `evalScript()` transparently falls back to Tauri IPC when CDP unavailable
- CDP connection failures cached to avoid repeated 3s timeouts
- All 1193 tests pass, cargo check/clippy clean

## Patterns Noticed
- **Platform-specific divergence in Tauri**: Windows (WebView2) and Linux (WebKitGTK) have fundamentally different capabilities. CDP works on Windows via env var; Linux needs wry's native callback API. Always check both paths when touching webview code.
- **`LINUX_WEBVIEWS` thread-local**: On Linux, Tauri embedded browser webviews must be accessed via the `LINUX_WEBVIEWS` thread-local in lib.rs — NOT via `app.get_webview()` or `with_webview()`. Those only work for the main app webview.
- **wry callback is `Fn`, not `FnOnce`**: Must use `Mutex<Option<Sender>>` + `take()` pattern to consume a oneshot sender inside a wry callback.
- **wry callback-drop before `LoadEvent::Committed`**: wry silently drops callbacks if called before page commits. Accepted risk — 120s timeout handles worst case, and evalScript is only called after page load in practice.
- **Choke-point fix pattern**: 189 call sites across 22 files all funneled through `evalScript()`. Fixing that one function unblocked everything with zero downstream changes.
- **WebKitGTK does NOT support CDP**: WebKit Inspector Protocol is a different protocol. `WEBKIT_INSPECTOR_HTTP_SERVER` uses WebSocket transport but speaks WebKit protocol, not Chrome DevTools Protocol. `Runtime.evaluate` exists in both but `Page.captureScreenshot` does not exist in WebKit.

## Corrections Received
- Metis caught that `with_webview()` is wrong approach on Linux — must use `LINUX_WEBVIEWS` thread-local directly
- Metis identified that wry's `Fn` callback bound needs `Mutex<Option<Sender>>` workaround
- F2 review caught test-specific `maybeMock` logic leaking into production code — cleaned up by adding `resetEvalScriptCache()` export

## Skill Suggestions
- Consider a `tauri-platform-compat` skill that documents Windows vs Linux divergence for webview APIs, CDP availability, and script evaluation patterns in this codebase
