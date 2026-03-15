# Learnings — linux-embedded-browser

## [2026-03-14] Session ses_3116b57e4ffe30PAofQORrQEwd — CRITICAL: Actual Worktree State

### ACTUAL CURRENT CODE STATE (differs from plan's research)
The worktree HEAD is "chore: sync working state for device transfer".
**There are NO existing Linux-specific `#[cfg(target_os = "linux")]` blocks** in the browser commands.

The current code uses `add_child()` for ALL platforms unconditionally.
This means we ADD new Linux paths rather than REPLACE existing ones.

Key changes needed per function:
- Line 6: `use tauri::webview::WebviewBuilder;` → must become `#[cfg(not(target_os = "linux"))]`
- `create_embedded_browser` (lines 216-295): 
  - Wrap existing `add_child()` block in `#[cfg(not(target_os = "linux"))]`
  - ADD new `#[cfg(target_os = "linux")]` block using wry GtkFixed
- All other commands (`navigate_embedded`, `go_back`, `go_forward`, `reload_browser`,
  `set_webview_bounds`, `hide_webview`, `show_webview`, `get_embedded_url`, 
  `destroy_webview`, `inject_autofill`, `eval_webview_script`, `inject_webview_script`):
  - ADD `#[cfg(target_os = "linux")]` blocks before the existing code
  - Wrap existing code in `#[cfg(not(target_os = "linux"))]`

### Current line numbers (lib.rs, 1134 lines total)
- Imports: lines 1-11
- WebviewState struct: lines 19-22
- create_embedded_browser: lines 216-295
- navigate_embedded: lines 297-308
- go_back: lines 310-321
- go_forward: lines 323-334
- reload_browser: lines 336-347
- set_webview_bounds: lines 349-366
- hide_webview: lines 368-378
- show_webview: lines 380-390
- get_embedded_url: lines 392-402
- destroy_webview: lines 404-420
- inject_autofill: lines 422-433
- eval_webview_script: lines 435-512
- inject_webview_script: lines 520-533
- wry version: 0.54.1 (from Cargo.lock)

## [2026-03-14] Session ses_3116b57e4ffe30PAofQORrQEwd — Initial Research

### Architecture
- lib.rs is 1245 lines in the worktree (based on research, line numbers will shift as we add code)
- WebviewState { tabs: HashMap<String, String> } maps tab_id → webview label
- All browser commands are between lines ~215-660 in lib.rs
- setup() closure is around line 870-920

### wry API Facts (confirmed by research)
- wry version in Cargo.lock: need to check (Task 1 will do this)
- `WebViewBuilderExtUnix` provides `build_gtk(&container)` 
- `WebView::load_url(&str)` = navigate
- `WebView::evaluate_script(&str)` = eval (fire-and-forget, no return value)
- `WebView::set_bounds(Rect)` = set position+size (only works when `is_in_fixed_parent` = true)
- NO `url()` getter on wry::WebView
- `wry::WebView` is `!Send` — GTK widgets are main-thread only

### Tauri v2 API Facts
- `window.default_vbox()` returns `Result<gtk::Box>` — public API, works with `unstable` feature
- `window.gtk_window()` returns `Result<gtk::ApplicationWindow>` — public API
- `app.run_on_main_thread(closure)` — required for all GTK operations from async command handlers

### GtkFixed Pattern (from wry PR #1504 and gtk_multiwebview.rs)
- ONE shared gtk::Fixed must be created at startup
- ALL webviews must use the SAME GtkFixed instance
- Creating per-webview Fixed BREAKS layout (the bug that was fixed in PR #1504)
- Pattern: vbox.pack_start(&fixed, true, true, 0) → fixed.show_all() → WebViewBuilder::build_gtk(&fixed)

### Thread Safety Pattern
- thread_local! storage for GTK/wry handles (since they are !Send)
- LINUX_WEBVIEWS: RefCell<HashMap<String, wry::WebView>>
- GTK_FIXED: RefCell<Option<gtk::Fixed>>
- WEBVIEW_URLS: RefCell<HashMap<String, String>>
- Access from commands: app.run_on_main_thread(move || { THREAD_LOCAL.with(...) })

### Known Limitations (Out of Scope)
- CDP is already non-functional on Linux (WebKitGTK vs WebView2)
- eval_webview_script returns Null on Linux (wry evaluate_script is fire-and-forget)
- This is pre-existing, not a regression

### Guardrails
- NEVER modify #[cfg(not(target_os = "linux"))] blocks
- NEVER modify frontend TypeScript/Svelte files
- NEVER create abstraction layers
- NEVER add dependencies beyond gtk and wry

## [2026-03-14] Task 2 — Linux thread-local + GtkFixed foundation

- Added Linux-only `thread_local!` state in `ogre-desktop/src-tauri/src/lib.rs`:
  - `LINUX_WEBVIEWS: RefCell<HashMap<String, wry::WebView>>`
  - `GTK_FIXED: RefCell<Option<gtk::Fixed>>`
  - `WEBVIEW_URLS: RefCell<HashMap<String, String>>`
- Added Linux-only `setup()` block (immediately before `Ok(())`) to:
  - resolve main webview window
  - fetch `default_vbox()`
  - create and pack one shared `gtk::Fixed`
  - store it in `GTK_FIXED` thread-local state
- Verification:
  - `cargo check` passed with zero errors (one expected unused-import warning)
  - `cargo build` succeeded
  - build evidence captured at `.sisyphus/evidence/task-2-build.txt`

## [2026-03-14] Task 3 — Linux create_embedded_browser via wry::build_gtk

- Added `#[cfg(target_os = "linux")]` `create_embedded_browser` immediately after the existing non-Linux function in `ogre-desktop/src-tauri/src/lib.rs`.
- Linux implementation now:
  - runs all GTK/wry work in `app.run_on_main_thread(...)`
  - builds webview with `wry::WebViewBuilder::new().with_url(...).with_bounds(...).build_gtk(&fixed)`
  - emits `browser-url-changed` from navigation handler with payload `{ tabId, url }`
  - emits `browser-page-loaded` from page-load finished with payload `{ tabId, url }`
  - intercepts new-window requests and redirects to same webview via `load_url`, returning `wry::NewWindowResponse::Deny`
  - stores webview handle in `LINUX_WEBVIEWS`, URL in `WEBVIEW_URLS`, and `tab_id -> label` in `WebviewState.tabs`
- Updated invoke registration to include `create_embedded_browser` on Linux by removing non-Linux guard for this command in `generate_handler!`.
- Verified wry 0.54.1 closure signature for `with_new_window_req_handler` is `(String, NewWindowFeatures) -> NewWindowResponse`.
- Verification output captured at `.sisyphus/evidence/task-3-compile.txt` (`cargo check` passed, zero errors).


## [2026-03-14] Task 4+5 — Linux bounds + visibility lifecycle

- Added Linux-only `set_webview_bounds` in `ogre-desktop/src-tauri/src/lib.rs` immediately after the existing non-Linux command.
- Linux bounds implementation resolves the embedded label from `WebviewState`, hops to the GTK main thread via `app.run_on_main_thread(...)`, and calls `wry::WebView::set_bounds(wry::Rect { ... })` on the stored handle in `LINUX_WEBVIEWS`.
- Updated `generate_handler!` registration so `set_webview_bounds` is available on Linux (removed the non-Linux invoke guard for this command).
- Added Linux branches at the top of `hide_webview` / `show_webview` using `wry::WebView::set_visible(false/true)` on the stored Linux handle instead of Tauri child-webview APIs.
- Added Linux branch in `destroy_webview` that removes the handle from `LINUX_WEBVIEWS`, removes cached URL state from `WEBVIEW_URLS`, and then removes the tab mapping from `WebviewState`.
- Verification:
  - `.sisyphus/evidence/task-4-compile.txt` captured successful `cargo check`
  - `.sisyphus/evidence/task-5-destroy.txt` captured successful `cargo check`
