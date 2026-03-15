# Issues & Gotchas — linux-embedded-browser

## [2026-03-14] Session ses_3116b57e4ffe30PAofQORrQEwd — Known Gotchas

### Issue: wry::WebView visibility API
- wry may not have `set_visible(bool)` directly
- Alternative: `use gtk::prelude::WidgetExt; wv.as_ref().hide() / show()`
- Need to verify during Task 5

### Issue: with_new_window_req_handler closure re-entrant navigation
- When new_window is requested, we want to navigate the SAME webview
- But we're inside a closure that borrows the webview state
- Possible solution: use a mpsc channel to send navigation requests back to main thread
- Or: capture a clone of the wry::WebView in the closure (if it implements Clone, which it may not)
- Task 3 must handle this carefully

### Issue: run_on_main_thread return value for get_embedded_url
- get_embedded_url needs to READ from thread_local (not write)
- WEBVIEW_URLS is thread_local on main thread
- Command runs on async thread — need to cross back
- But thread_local::with() is fine as long as we're on the same thread
- For GET operations, can use run_on_main_thread + channel pattern to get value back

### Issue: wry version pinning
- Tauri v2 bundles wry internally
- Adding wry as a direct dep risks version conflicts
- Must match Cargo.lock's wry version EXACTLY
- OR: try `use tauri_runtime_wry::wry` as a re-export path

### Issue: EventLoopProxy needed for wry?
- In standalone wry apps, you need an event loop
- In Tauri, the event loop is managed by Tauri/tao
- build_gtk() adds webviews to GTK directly — should not need explicit event loop
- Verify this works during Task 3

### Issue: Closure lifetime for wry navigation handler
- The navigation handler closure in with_navigation_handler must be 'static
- Any captures must be owned (Arc<T>) or static references
- app.clone() is fine (AppHandle is Clone + Send + Sync)
- label string clone is fine

## [2026-03-14] Task 2 follow-up notes

- `cargo check` and `cargo build` both compile Linux additions cleanly; only warning is currently-unused `wry::WebViewBuilderExtUnix` import from Task 1 scaffolding.
- The inserted Linux thread-local state introduces no cross-thread borrow errors.
- `GTK_FIXED` initialization in `setup()` succeeds type-checking with existing `unstable` feature (`default_vbox()` available).

## [2026-03-14] Task 3 findings

- `with_new_window_req_handler` in wry 0.54.1 requires closure signature `(String, NewWindowFeatures) -> NewWindowResponse`.
  - A one-argument closure does not compile.
  - Returning `wry::NewWindowResponse::Deny` is required (not bool).
- New-window redirection to same embedded view works by looking up the existing handle in `LINUX_WEBVIEWS` and calling `load_url(&url)` before returning `Deny`.
- `run_on_main_thread` error mapping is safest with a generic string conversion (`map_err(|_| ...)`) to avoid formatter/trait mismatches across versions.


## [2026-03-14] Task 4+5 findings

- `wry` 0.54.1 already exposes cross-platform `WebView::set_visible(bool)` and Linux `webkitgtk` implements it, so direct GTK widget access was unnecessary for `hide_webview` / `show_webview`.
- `wry::WebView::set_bounds(Rect)` is available on Linux `webkitgtk` and compiles cleanly when called from `run_on_main_thread` against the stored thread-local handle.
- Dropping the Linux webview by removing it from `LINUX_WEBVIEWS` is sufficient for the destroy path here; removing the cached URL entry from `WEBVIEW_URLS` avoids stale URL reads later.
