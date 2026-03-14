# Fix Embedded Browser on Linux — GtkFixed Bypass

## TL;DR

> **Quick Summary**: The embedded browser opens as a separate OS window on Linux because Tauri v2's `add_child()` is broken on GTK (uses GtkBox instead of GtkFixed for child webview layout). Fix by bypassing Tauri's broken path and using wry's `build_gtk(&fixed)` directly with a GtkFixed container, achieving true embedded rendering on Linux while keeping Windows unchanged.
> 
> **Deliverables**:
> - Embedded browser renders INSIDE the app on Linux (not as a separate window)
> - All 12 webview commands work on Linux via wry direct API
> - Windows/macOS code paths completely unchanged
> - GtkFixed + wry integration with proper thread safety
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 7 → F1-F4

---

## Context

### Original Request
The embedded browser on Linux opens as a separate OS window instead of rendering inside the app's embedded browser section. On Windows, it embeds correctly. The current Linux code in `lib.rs` uses `WebviewWindowBuilder` (creates a standalone window) as a workaround because Tauri v2's `add_child()` is broken on GTK.

### Interview Summary
**Key Discussions**:
- Tauri v2's `add_child()` uses GtkBox internally, which stacks webviews vertically instead of positioning them absolutely — this is a known upstream bug (tauri-apps/tauri #11376, #10011)
- User wants TRUE embedding, not a fake-window workaround (decorations off + positioning)
- URLs are arbitrary (rules out iframe approach)
- Test strategy: manual verification only

**Research Findings**:
- `window.default_vbox()` is a public Tauri v2 API exposing the GTK container
- wry's `WebViewBuilderExtUnix::build_gtk(&fixed)` creates properly embedded webviews in a GtkFixed container
- wry's `gtk_multiwebview.rs` example proves this pattern works
- All webviews MUST share a single GtkFixed instance (wry PR #1504)
- wry webviews bypass Tauri IPC — but the embedded browser loads external URLs that don't need `invoke()`
- CDP (Chrome DevTools Protocol) is already non-functional on Linux — pre-existing limitation, out of scope

### Metis Review
**Identified Gaps** (addressed):
- Scope was underestimated: 12 commands need Linux paths, not 5 — all enumerated below
- Thread safety: `wry::WebView` wraps GTK widgets that are `!Send` — must use `app.run_on_main_thread()`
- No `url()` getter on wry — must track URLs via `with_navigation_handler` callback
- wry version pinning: should try `tauri::wry` re-export first, only add direct dep if needed
- State struct must store `wry::WebView` handles directly (not just label strings)
- Drop order: webviews must be dropped before GtkFixed to avoid GTK crashes on exit

---

## Work Objectives

### Core Objective
Make the embedded browser render inside the app's embedded browser section on Linux by using wry's GtkFixed-based webview creation, bypassing Tauri's broken `add_child()` path.

### Concrete Deliverables
- Modified `ogre-desktop/src-tauri/Cargo.toml` with Linux-only gtk/wry dependencies
- Modified `ogre-desktop/src-tauri/src/lib.rs` with wry-based Linux webview implementation for all 12 commands
- Zero changes to Windows/macOS code paths
- Zero changes to frontend TypeScript/Svelte files

### Definition of Done
- [ ] App launches on Linux, embedded browser renders inside the main window (not a separate window)
- [ ] `xdotool search --name "O.G.R.E" | wc -l` returns `1` (single window)
- [ ] Navigate, back, forward, reload, show, hide, destroy, bounds all work on Linux
- [ ] `cargo build` passes on Linux
- [ ] Windows build is not broken (CI or cross-check)

### Must Have
- Embedded browser renders inside the app window on Linux
- All existing browser commands functional on Linux (create, navigate, back, forward, reload, show, hide, destroy, bounds, get_url, inject scripts)
- Shared GtkFixed container for all webview tabs
- Thread-safe state management with `run_on_main_thread()`
- URL tracking via navigation handler (since wry has no `url()` getter)

### Must NOT Have (Guardrails)
- **NO changes to `#[cfg(not(target_os = "linux"))]` blocks** — Windows/macOS code stays identical
- **NO changes to frontend TypeScript/Svelte files** — command signatures stay the same
- **NO CDP fix on Linux** — pre-existing limitation, out of scope
- **NO abstraction layers** — don't create `WebviewBackend` traits to unify wry and Tauri APIs; `#[cfg]` blocks are the right pattern
- **NO new dependencies beyond gtk and wry** — don't add gtk-layer-shell or similar
- **NO error type refactoring** — keep `Result<T, String>` for all commands
- **NO new commands or events** — only change the Linux implementation of existing commands

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest for frontend, cargo test for Rust)
- **Automated tests**: None for this change — it's a platform-specific GUI change
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Rust compilation**: Use Bash — `cargo build`, `cargo check`, `cargo clippy`
- **Runtime behavior**: Use interactive_bash (tmux) — launch app, verify window count, test navigation
- **Frontend regression**: Use Bash — `npm run build` in ogre-desktop to verify frontend still compiles

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Add Linux-only dependencies + validate wry re-export [quick]
├── Task 2: Create GtkFixed container in setup() + restructure Linux state [deep]

Wave 2 (After Wave 1 — core implementation, MAX PARALLEL):
├── Task 3: Rewrite create_embedded_browser Linux path (depends: 1, 2) [deep]
├── Task 4: Rewrite set_webview_bounds Linux path (depends: 2) [quick]
├── Task 5: Rewrite show/hide/destroy Linux paths (depends: 2) [unspecified-high]

Wave 3 (After Wave 2 — command adaptation):
├── Task 6: Rewrite navigation commands Linux paths (depends: 3) [unspecified-high]
├── Task 7: Rewrite URL tracking + script injection Linux paths (depends: 3) [unspecified-high]
├── Task 8: End-to-end integration test on Linux (depends: 3-7) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Task 3 → Task 5 → Task 7 → Task 8 → F1-F4
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

- **1**: — → 2, 3, 1
- **2**: 1 → 3, 4, 5, 1
- **3**: 1, 2 → 6, 7, 8, 2
- **4**: 2 → 8, 2
- **5**: 2 → 8, 2
- **6**: 3 → 8, 3
- **7**: 3 → 8, 3
- **8**: 3, 4, 5, 6, 7 → F1-F4, 3

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `deep`
- **Wave 2**: **3** — T3 → `deep`, T4 → `quick`, T5 → `unspecified-high`
- **Wave 3**: **3** — T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Add Linux-Only Dependencies + Validate wry Re-export

  **What to do**:
  - Add `gtk` crate as a Linux-only dependency in `Cargo.toml`:
    ```toml
    [target.'cfg(target_os = "linux")'.dependencies]
    gtk = { version = "0.18", features = ["v3_24"] }
    ```
  - Check if `tauri::wry` re-exports `WebViewBuilderExtUnix`. Try: `use tauri_runtime_wry::wry;` or check if the `tauri` crate re-exports wry types
  - If re-export doesn't expose `WebViewBuilderExtUnix`, add `wry` directly:
    ```toml
    [target.'cfg(target_os = "linux")'.dependencies]
    wry = "0.54"
    ```
  - **IMPORTANT**: Match the wry version that Tauri v2 uses internally. Check `Cargo.lock` for the exact version: `grep "name = \"wry\"" Cargo.lock -A 2`
  - Add conditional imports at the top of `lib.rs`:
    ```rust
    #[cfg(target_os = "linux")]
    use gtk::prelude::*;
    #[cfg(target_os = "linux")]
    use wry::{WebViewBuilder as WryWebViewBuilder, Rect, dpi::{LogicalPosition, LogicalSize}};
    #[cfg(target_os = "linux")]
    use wry::WebViewBuilderExtUnix;
    ```
  - Run `cargo check` to verify it compiles

  **Must NOT do**:
  - Don't add non-Linux dependencies
  - Don't modify any existing imports or code — only ADD Linux-specific imports
  - Don't change `tauri` features

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding dependencies and imports is straightforward
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — no git operations required

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before all other tasks)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/Cargo.toml` — Current dependency structure, add Linux-specific section
  - `ogre-desktop/src-tauri/src/lib.rs:1-12` — Current imports, add Linux-specific conditional imports below

  **API/Type References**:
  - wry crate: `WebViewBuilderExtUnix` trait provides `build_gtk()` method
  - gtk crate: `gtk::prelude::*` provides `ContainerExt`, `WidgetExt`, `BoxExt`, `FixedExt`

  **External References**:
  - wry gtk_multiwebview example: `https://github.com/tauri-apps/wry/blob/dev/examples/gtk_multiwebview.rs` — Shows exact imports needed

  **WHY Each Reference Matters**:
  - Cargo.toml: Need to match existing dependency style and add Linux-specific section
  - lib.rs imports: Must add conditional imports without disturbing existing ones
  - Cargo.lock: Must check the exact wry version Tauri uses to avoid version conflicts

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Linux build compiles with new dependencies
    Tool: Bash
    Preconditions: Working directory is ogre-desktop/src-tauri
    Steps:
      1. Run `cargo check` in ogre-desktop/src-tauri
      2. Check exit code is 0
      3. Verify no compilation errors in output
    Expected Result: `cargo check` exits with code 0, no errors
    Failure Indicators: Compilation error mentioning gtk, wry, or version conflicts
    Evidence: .sisyphus/evidence/task-1-linux-compile.txt

  Scenario: wry version matches Tauri's internal version
    Tool: Bash
    Preconditions: Cargo.lock exists
    Steps:
      1. Run `grep "name = \"wry\"" Cargo.lock -A 2` in ogre-desktop/src-tauri
      2. Verify only ONE version of wry appears in the lock file
    Expected Result: Single wry version, no duplicate entries
    Failure Indicators: Two different wry versions listed (version conflict)
    Evidence: .sisyphus/evidence/task-1-wry-version.txt
  ```

  **Commit**: YES
  - Message: `build(linux): add gtk and wry Linux-only dependencies`
  - Files: `ogre-desktop/src-tauri/Cargo.toml`, `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo check` in ogre-desktop/src-tauri

- [ ] 2. Create GtkFixed Container in setup() + Restructure Linux State

  **What to do**:
  - Create a new state struct for Linux webview handles. Since `wry::WebView` is `!Send` on Linux (GTK widgets are main-thread-only), use a main-thread-only storage pattern:
    ```rust
    #[cfg(target_os = "linux")]
    use std::cell::RefCell;
    
    #[cfg(target_os = "linux")]
    thread_local! {
        static LINUX_WEBVIEWS: RefCell<HashMap<String, wry::WebView>> = RefCell::new(HashMap::new());
        static GTK_FIXED: RefCell<Option<gtk::Fixed>> = RefCell::new(None);
        static WEBVIEW_URLS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
    }
    ```
  - In the Tauri `setup()` closure (around line 880 in lib.rs), add Linux-specific GtkFixed initialization:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let window = app.get_window("main").expect("main window must exist");
        let vbox = window.default_vbox().expect("default vbox must exist");
        let fixed = gtk::Fixed::new();
        vbox.pack_start(&fixed, true, true, 0);
        fixed.show_all();
        GTK_FIXED.with(|f| { *f.borrow_mut() = Some(fixed); });
    }
    ```
  - The `thread_local!` pattern solves the `!Send` problem — GTK handles stay on the main thread, and Tauri commands use `app.run_on_main_thread()` to access them
  - Keep the existing `WebviewState { tabs: HashMap<String, String> }` — it still maps tab_id → label for lookup. The Linux path additionally stores the wry::WebView handle in `LINUX_WEBVIEWS`
  - Add `WEBVIEW_URLS` to track current URL per webview (wry has no `url()` getter)

  **Must NOT do**:
  - Don't modify `WebviewState` struct — it's used by Windows too
  - Don't remove existing state management code
  - Don't call `gtk::init()` — Tauri already does this

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Thread-safety design with GTK requires careful thought about ownership and lifetimes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1 if deps already added)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Tasks 3, 4, 5, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:20-23` — Current `WebviewState` struct
  - `ogre-desktop/src-tauri/src/lib.rs:870-920` — Current `setup()` closure where GtkFixed initialization should go

  **API/Type References**:
  - `window.default_vbox()` — Returns `Result<gtk::Box>`, Tauri v2 public API
  - `gtk::Fixed::new()` — Creates a GtkFixed container for absolute positioning
  - `vbox.pack_start(&fixed, true, true, 0)` — Adds GtkFixed to the window's vbox with expand/fill

  **External References**:
  - wry gtk_multiwebview.rs: `https://github.com/tauri-apps/wry/blob/dev/examples/gtk_multiwebview.rs` — Shows GtkFixed setup pattern
  - wry PR #1504: Fixed the "one GtkFixed per webview" bug — ALL webviews must share ONE GtkFixed

  **WHY Each Reference Matters**:
  - lib.rs:20-23: Must understand current state struct to extend without breaking Windows
  - lib.rs:870-920: The setup closure is where we initialize GtkFixed before any webviews are created
  - wry example: Proves the GtkFixed → pack_start → show_all → build_gtk pattern works

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: App launches on Linux without crash
    Tool: Bash
    Preconditions: App is built with `cargo build`
    Steps:
      1. Run `cargo build` in ogre-desktop/src-tauri
      2. Verify build succeeds (exit code 0)
      3. Check for any warnings about unused GTK_FIXED or LINUX_WEBVIEWS (acceptable if webview creation not yet done)
    Expected Result: Build succeeds, no errors
    Failure Indicators: GTK initialization panic, thread safety errors
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: GtkFixed initialization doesn't panic
    Tool: Bash
    Preconditions: App binary exists
    Steps:
      1. Run the app binary with `RUST_LOG=debug` for 3 seconds then kill
      2. Check stderr for any GTK-related panics or errors
    Expected Result: No panics in first 3 seconds of startup
    Failure Indicators: "thread 'main' panicked", GTK assertion failures
    Evidence: .sisyphus/evidence/task-2-startup.txt
  ```

  **Commit**: YES
  - Message: `feat(linux): create GtkFixed container and Linux webview state`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo build` in ogre-desktop/src-tauri

- [ ] 3. Rewrite create_embedded_browser Linux Path to Use wry build_gtk

  **What to do**:
  - Replace the Linux `#[cfg(target_os = "linux")]` block in `create_embedded_browser` (lines 232-288) to use wry's `build_gtk()` instead of `WebviewWindowBuilder`
  - The new Linux path should:
    1. Parse the URL
    2. Create a `wry::WebViewBuilder` with:
       - `.with_url(&url_string)` — load the external URL
       - `.with_bounds(Rect { position: LogicalPosition::new(0, 60), size: LogicalSize::new(800, 600) })` — initial position matching Windows default
       - `.with_navigation_handler(move |url| { ... })` — replicate `on_navigation` behavior (emit `browser-url-changed` event + update WEBVIEW_URLS)
       - `.with_new_window_req_handler(move |url| { ... })` — replicate `on_new_window` behavior (navigate same webview instead of opening new window)
    3. Get the GtkFixed from `GTK_FIXED` thread_local
    4. Call `.build_gtk(&fixed)` to create the webview embedded in the GtkFixed
    5. Store the `wry::WebView` in `LINUX_WEBVIEWS` thread_local
    6. Store the tab_id → label mapping in `WebviewState.tabs` (same as Windows)
    7. Store the initial URL in `WEBVIEW_URLS`
  - **CRITICAL**: All GTK/wry operations must happen on the main thread. Since `create_embedded_browser` is a `#[tauri::command]`, wrap the Linux block in `app.run_on_main_thread(move || { ... }).unwrap()` — OR check if Tauri commands already run on the main thread (the Windows path doesn't use `run_on_main_thread`, so they likely do run on an async thread)
  - Map the Tauri event emission: use `app.emit("browser-url-changed", ...)` and `app.emit("browser-page-loaded", ...)` inside the wry handlers (capture `app.clone()` in closures)
  - For `with_new_window_req_handler`: return `false` to prevent opening new windows, and instead navigate the current webview to the new URL (need to store a way to trigger navigation — e.g., use a channel or just load the URL)
  - Handle the `on_page_load` equivalent: wry's `WebViewBuilder` has `.with_on_page_load_handler()` — use it to emit `browser-page-loaded` events

  **Must NOT do**:
  - Don't modify the `#[cfg(not(target_os = "linux"))]` block (Windows path)
  - Don't change the command signature
  - Don't use `WebviewWindowBuilder` — that's what we're replacing

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core implementation requiring careful API mapping between Tauri and wry, closure capture, thread safety
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2 state setup)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7, 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:232-288` — Current Linux `create_embedded_browser` block to REPLACE
  - `ogre-desktop/src-tauri/src/lib.rs:290-353` — Windows `create_embedded_browser` block — DO NOT TOUCH but use as reference for event handler behavior

  **API/Type References**:
  - wry `WebViewBuilder`: `.with_url()`, `.with_bounds()`, `.with_navigation_handler()`, `.with_new_window_req_handler()`, `.with_on_page_load_handler()`
  - wry `WebViewBuilderExtUnix`: `.build_gtk(&container)` — builds into a GTK container
  - `tauri::Emitter::emit()` — emit events to frontend

  **External References**:
  - wry WebViewBuilder docs: `https://docs.rs/wry/latest/wry/struct.WebViewBuilder.html`
  - wry gtk_multiwebview.rs: `https://github.com/tauri-apps/wry/blob/dev/examples/gtk_multiwebview.rs`

  **WHY Each Reference Matters**:
  - lib.rs:232-288: This is the exact block being replaced — understand current event handler logic
  - lib.rs:290-353: Windows path shows what events are emitted and what behavior to replicate
  - wry docs: Need exact method signatures for the wry API

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Embedded browser creates inside app window (not separate window)
    Tool: Bash / interactive_bash
    Preconditions: App is built and can be launched
    Steps:
      1. Build with `cargo build`
      2. Launch the app
      3. Navigate to a URL in the embedded browser (e.g., https://example.com)
      4. Run `xdotool search --name "O.G.R.E" | wc -l`
      5. Verify only 1 window exists (no separate "O.G.R.E Browser" window)
    Expected Result: Window count is 1, browser content visible inside the app
    Failure Indicators: Window count is 2 (separate window still created), or webview not visible
    Evidence: .sisyphus/evidence/task-3-embedded-browser.txt

  Scenario: Build compiles without errors
    Tool: Bash
    Preconditions: Dependencies from Task 1 are installed
    Steps:
      1. Run `cargo build` in ogre-desktop/src-tauri
      2. Run `cargo clippy -- -D warnings` to check for issues
    Expected Result: Both commands exit with code 0
    Failure Indicators: Compilation errors, lifetime/borrow issues, Send/Sync violations
    Evidence: .sisyphus/evidence/task-3-compile.txt
  ```

  **Commit**: YES
  - Message: `feat(linux): rewrite create_embedded_browser to use wry build_gtk`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo build`

- [ ] 4. Rewrite set_webview_bounds Linux Path Using wry set_bounds

  **What to do**:
  - Replace the Linux no-op in `set_webview_bounds` (lines 417-421) with actual bounds management:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let label = format!("browser-{}", tab_id);
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    wv.set_bounds(wry::Rect {
                        position: wry::dpi::LogicalPosition::new(x as i32, y as i32).into(),
                        size: wry::dpi::LogicalSize::new(width as u32, height as u32).into(),
                    }).unwrap_or_else(|e| eprintln!("Failed to set bounds: {}", e));
                }
            });
        }).map_err(|e| format!("Failed to run on main thread: {}", e))?;
        return Ok(());
    }
    ```
  - The frontend already calls `setWebviewBounds()` on resize, sidebar toggle, and grading panel open/close — this is the function that positions the webview correctly within the embedded browser section
  - Note: The `x, y, width, height` values come from `webview-layout.ts`'s `calculateWebviewBounds()` which accounts for sidebar width, nav bar height, and panel width

  **Must NOT do**:
  - Don't modify the Windows/macOS bounds path
  - Don't change `calculateWebviewBounds()` in webview-layout.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused change — replace a no-op with a working implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:412-437` — Current `set_webview_bounds` with Linux no-op
  - `ogre-desktop/src/lib/webview-layout.ts:67-85` — `calculateWebviewBounds()` that provides the x, y, width, height values

  **API/Type References**:
  - `wry::WebView::set_bounds(Rect)` — sets position and size when webview is in a GtkFixed container
  - `wry::Rect`, `wry::dpi::LogicalPosition`, `wry::dpi::LogicalSize`

  **WHY Each Reference Matters**:
  - lib.rs:412-437: Exact block to replace — see how Windows path uses `set_position` + `set_size` separately; wry combines them into `set_bounds`
  - webview-layout.ts: Understanding what values the frontend sends helps verify bounds are correct

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Webview resizes with main window
    Tool: interactive_bash
    Preconditions: App running with embedded browser showing a page
    Steps:
      1. Resize the main window by dragging the edge
      2. Observe that the webview content area adjusts to fill the available space
      3. Verify no gaps between sidebar and webview, no overflow beyond window edge
    Expected Result: Webview fills the content area correctly after resize
    Failure Indicators: Webview stays at original size, gaps appear, content overflows
    Evidence: .sisyphus/evidence/task-4-bounds-resize.txt

  Scenario: Build compiles
    Tool: Bash
    Preconditions: Task 2 state setup is in place
    Steps:
      1. Run `cargo check` in ogre-desktop/src-tauri
    Expected Result: Exit code 0
    Failure Indicators: Type mismatch on Rect/Position/Size types
    Evidence: .sisyphus/evidence/task-4-compile.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(linux): implement set_webview_bounds via wry set_bounds`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo check`

- [ ] 5. Rewrite show/hide/destroy Linux Paths with wry WebView Handles

  **What to do**:
  - **`hide_webview`** (lines 439-462): Replace the Linux block. Instead of `app.get_webview_window(&label)?.hide()`, use:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let label = format!("browser-{}", tab_id);
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    wv.set_visible(false);  // or use GTK widget hide
                }
            });
        }).map_err(|e| format!("{}", e))?;
        return Ok(());
    }
    ```
  - **`show_webview`** (lines 464-487): Same pattern but with `wv.set_visible(true)`
  - **`destroy_webview`** (lines 499-530): Remove the wry::WebView from `LINUX_WEBVIEWS` (dropping it removes it from the GtkFixed). Also remove the URL from `WEBVIEW_URLS` and the label from `WebviewState.tabs`:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let label = format!("browser-{}", tab_id);
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                webviews.borrow_mut().remove(&label);  // drop removes from GTK
            });
            WEBVIEW_URLS.with(|urls| {
                urls.borrow_mut().remove(&label);
            });
        }).map_err(|e| format!("{}", e))?;
        // Also remove from WebviewState.tabs
        let state = app.state::<Mutex<WebviewState>>();
        let mut state = state.lock().map_err(|e| format!("{}", e))?;
        state.tabs.remove(&tab_id);
        return Ok(());
    }
    ```
  - **Note**: Check if `wry::WebView` has `set_visible()`. If not, access the underlying `webkit2gtk::WebView` via GTK widget methods: `use gtk::prelude::WidgetExt; wv.as_ref().hide()` — need to check wry's API for visibility control

  **Must NOT do**:
  - Don't modify Windows show/hide/destroy paths
  - Don't leak webview handles (ensure `remove` from HashMap drops them)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Three related commands with similar patterns but careful drop semantics
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:439-530` — Current show/hide/destroy commands with Linux blocks to replace
  - `ogre-desktop/src-tauri/src/lib.rs:447-452` — Current Linux hide: uses `get_webview_window().hide()`
  - `ogre-desktop/src-tauri/src/lib.rs:470-475` — Current Linux show: uses `get_webview_window().show()`
  - `ogre-desktop/src-tauri/src/lib.rs:505-515` — Current Linux destroy: uses `get_webview_window().close()`

  **API/Type References**:
  - wry `WebView`: Check for `set_visible(bool)` method or GTK `WidgetExt::hide()`/`show()`
  - Dropping a `wry::WebView` removes it from the GTK container

  **WHY Each Reference Matters**:
  - Current Linux blocks show the exact pattern to replace — each currently uses `get_webview_window()` which creates separate windows; replace with `LINUX_WEBVIEWS` thread_local access

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tab switching shows/hides webviews correctly
    Tool: interactive_bash
    Preconditions: App running, 2 browser tabs open with different URLs
    Steps:
      1. Open tab 1 with https://example.com
      2. Open tab 2 with https://httpbin.org
      3. Switch to tab 1 — verify example.com is visible
      4. Switch to tab 2 — verify httpbin.org is visible, example.com is hidden
      5. Run `xdotool search --name "O.G.R.E" | wc -l` — verify still 1 window
    Expected Result: Switching tabs shows/hides content, always 1 window
    Failure Indicators: Both visible at same time, separate windows appearing
    Evidence: .sisyphus/evidence/task-5-tab-switch.txt

  Scenario: Closing tab destroys webview cleanly
    Tool: interactive_bash
    Preconditions: App running with 1 browser tab open
    Steps:
      1. Open a browser tab, navigate to a page
      2. Close the tab
      3. Verify no orphaned GTK widgets (app doesn't crash, memory stable)
      4. Open a new tab — verify it works (no stale state)
    Expected Result: Tab closes cleanly, new tab can be created after
    Failure Indicators: App crash on close, new tab creation fails after destroy
    Evidence: .sisyphus/evidence/task-5-destroy.txt
  ```

  **Commit**: YES
  - Message: `feat(linux): rewrite show/hide/destroy with wry WebView handles`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo check`

- [ ] 6. Rewrite Navigation Commands Linux Paths via wry API

  **What to do**:
  - **`navigate_embedded`** (line 366): Replace the Linux block. Instead of `app.get_webview(&label)?.navigate(url)`, use:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let label = format!("browser-{}", tab_id);
        let url_str = url.clone();
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    wv.load_url(&url_str).unwrap_or_else(|e| eprintln!("Navigate failed: {}", e));
                }
            });
            WEBVIEW_URLS.with(|urls| {
                urls.borrow_mut().insert(label.clone(), url_str);
            });
        }).map_err(|e| format!("{}", e))?;
        return Ok(());
    }
    ```
  - **`go_back`** (line 380): Use `wv.evaluate_script("history.back()")` instead of `wv.eval("history.back()")`
  - **`go_forward`** (line 392): Use `wv.evaluate_script("history.forward()")` instead of `wv.eval("history.forward()")`
  - **`reload_browser`** (line 405): Use `wv.evaluate_script("location.reload()")` instead of `wv.eval("location.reload()")`
  - All four commands follow the same pattern: look up webview from `LINUX_WEBVIEWS` thread_local, perform operation via wry API, wrap in `run_on_main_thread`

  **Must NOT do**:
  - Don't modify Windows navigation commands
  - Don't change command signatures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Four related commands with similar patterns, need careful API mapping
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 3 (need webview creation working first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:360-410` — Current navigate/back/forward/reload commands
  - `ogre-desktop/src-tauri/src/lib.rs:366` — `navigate_embedded`: `wv.navigate(url)`
  - `ogre-desktop/src-tauri/src/lib.rs:380` — `go_back`: `wv.eval("history.back()")`
  - `ogre-desktop/src-tauri/src/lib.rs:392` — `go_forward`: `wv.eval("history.forward()")`
  - `ogre-desktop/src-tauri/src/lib.rs:405` — `reload_browser`: `wv.eval("location.reload()")`

  **API/Type References**:
  - wry `WebView::load_url(&str)` — equivalent to Tauri's `navigate(Url)`
  - wry `WebView::evaluate_script(&str)` — equivalent to Tauri's `eval(&str)`

  **WHY Each Reference Matters**:
  - Each line number shows the exact Tauri API call to replace with wry equivalent

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: URL bar navigation works
    Tool: interactive_bash
    Preconditions: App running with embedded browser
    Steps:
      1. Enter https://example.com in the URL bar
      2. Verify the page loads in the embedded browser area
      3. Enter https://httpbin.org in the URL bar
      4. Verify the new page loads, replacing the previous one
    Expected Result: Both pages load correctly in the embedded area
    Failure Indicators: Page doesn't load, blank screen, navigation error
    Evidence: .sisyphus/evidence/task-6-navigate.txt

  Scenario: Back/forward/reload work
    Tool: interactive_bash
    Preconditions: App running, navigated to 2+ different URLs
    Steps:
      1. Navigate to https://example.com then https://httpbin.org
      2. Click Back button — verify example.com shows
      3. Click Forward button — verify httpbin.org shows
      4. Click Reload button — verify page refreshes (no crash)
    Expected Result: History navigation and reload all function correctly
    Failure Indicators: Buttons do nothing, app crashes, wrong page shown
    Evidence: .sisyphus/evidence/task-6-history.txt
  ```

  **Commit**: YES
  - Message: `feat(linux): rewrite navigate/back/forward/reload via wry API`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo check`

- [ ] 7. Rewrite URL Tracking + Script Injection Linux Paths

  **What to do**:
  - **`get_embedded_url`** (line 492): On Linux, wry has no `url()` getter. Read from `WEBVIEW_URLS` thread_local instead:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let label = format!("browser-{}", tab_id);
        let url = WEBVIEW_URLS.with(|urls| {
            urls.borrow().get(&label).cloned().unwrap_or_default()
        });
        return Ok(url);
    }
    ```
  - **URL tracking in navigation handler** (set up in Task 3): The `with_navigation_handler` closure in `create_embedded_browser` must update `WEBVIEW_URLS` on every navigation:
    ```rust
    .with_navigation_handler(move |url| {
        let label = label_for_nav.clone();
        WEBVIEW_URLS.with(|urls| {
            urls.borrow_mut().insert(label, url.to_string());
        });
        // Also emit event to frontend
        app_for_nav.emit("browser-url-changed", /* payload */).ok();
        true  // allow navigation
    })
    ```
    - If this was already set up in Task 3, just verify it's working. If not, add it now.
  - **`inject_autofill`** (line 533): Use `wv.evaluate_script(&script)` instead of `wv.eval(&script)`:
    ```rust
    #[cfg(target_os = "linux")]
    {
        let label = format!("browser-{}", tab_id);
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    wv.evaluate_script(&script).unwrap_or_else(|e| eprintln!("Inject failed: {}", e));
                }
            });
        }).map_err(|e| format!("{}", e))?;
        return Ok(());
    }
    ```
  - **`inject_webview_script`** (line 635): Same pattern as `inject_autofill`
  - **`eval_webview_script`** (line 555): This is the most complex one. The current implementation uses `__TAURI_INTERNALS__.invoke()` which doesn't exist on external URLs. On Linux with wry, use `evaluate_script()` but note it returns no value (wry's evaluate_script is fire-and-forget). For external URLs, this is best-effort. Implement a graceful fallback:
    ```rust
    #[cfg(target_os = "linux")]
    {
        // eval_webview_script is best-effort on Linux - external URLs don't have Tauri IPC
        // Use wry's evaluate_script which is fire-and-forget (no return value)
        let label = format!("browser-{}", tab_id);
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    wv.evaluate_script(&script).unwrap_or_else(|e| eprintln!("Eval failed: {}", e));
                }
            });
        }).map_err(|e| format!("{}", e))?;
        return Ok(serde_json::Value::Null);  // Can't get return values on Linux
    }
    ```

  **Must NOT do**:
  - Don't try to implement CDP on Linux — out of scope
  - Don't modify Windows script injection paths
  - Don't promise return values from `eval_webview_script` on Linux (it's fire-and-forget)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple commands with varying complexity, URL tracking integration, eval limitations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:492-498` — Current `get_embedded_url` command
  - `ogre-desktop/src-tauri/src/lib.rs:533-552` — Current `inject_autofill` command
  - `ogre-desktop/src-tauri/src/lib.rs:555-633` — Current `eval_webview_script` command
  - `ogre-desktop/src-tauri/src/lib.rs:635-660` — Current `inject_webview_script` command

  **API/Type References**:
  - wry `WebView::evaluate_script(&str)` — fire-and-forget script execution (no return value)
  - wry has NO `url()` getter — must track via `WEBVIEW_URLS` + navigation handler

  **WHY Each Reference Matters**:
  - Each command reference shows the Tauri API to replace and the expected behavior to replicate
  - eval_webview_script:555-633 is the most complex — it wraps scripts in a Tauri IPC callback pattern that doesn't work on external URLs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: URL bar shows current page URL after navigation
    Tool: interactive_bash
    Preconditions: App running with embedded browser
    Steps:
      1. Navigate to https://example.com
      2. Check that the URL bar in the app shows "https://example.com" (or the final redirected URL)
      3. Click a link on the page that navigates to a new URL
      4. Verify the URL bar updates to the new URL
    Expected Result: URL bar always reflects current page URL
    Failure Indicators: URL bar shows blank, stale URL, or wrong URL
    Evidence: .sisyphus/evidence/task-7-url-tracking.txt

  Scenario: Script injection doesn't crash on external URLs
    Tool: interactive_bash
    Preconditions: App running, browser showing external page
    Steps:
      1. Navigate to https://example.com
      2. Trigger inject_webview_script (e.g., via autofill or grading action)
      3. Verify the app doesn't crash
      4. Verify eval_webview_script returns gracefully (even if result is null)
    Expected Result: No crash, graceful degradation for script eval
    Failure Indicators: App crash, panic, unhandled error dialog
    Evidence: .sisyphus/evidence/task-7-script-inject.txt
  ```

  **Commit**: YES
  - Message: `feat(linux): add URL tracking and script injection via wry`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo check`

- [ ] 8. End-to-End Integration Test on Linux

  **What to do**:
  - Build the complete app: `cargo build` in ogre-desktop/src-tauri
  - Run `cargo clippy --all-targets` and fix any warnings
  - Launch the app and perform a full integration test cycle:
    1. App starts without crash
    2. Open embedded browser tab, navigate to https://example.com
    3. Verify browser renders INSIDE the app (not separate window): `xdotool search --name "O.G.R.E" | wc -l` = 1
    4. Resize main window → webview follows (no gaps, no overflow)
    5. Open a second tab with a different URL → switch between tabs
    6. Close a tab → webview destroyed cleanly
    7. Open a new tab after closing → works (no stale state)
    8. Navigate: URL bar entry, back, forward, reload all work
    9. URL bar shows current URL after navigation and link clicks
    10. Repeat create/destroy cycle 5 times → no memory leak (check with `top` or `ps`)
  - Verify frontend still builds: `npm run build` in ogre-desktop
  - Capture evidence for each scenario

  **Must NOT do**:
  - Don't fix bugs discovered here — log them and file as follow-up tasks
  - Don't modify any code (this is a test/verification task only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: End-to-end verification requiring interactive browser testing, multiple scenarios
  - **Skills**: [`playwright`]
    - `playwright`: Useful for visual verification if needed, though primary testing is via tmux

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration test of all prior work)
  - **Parallel Group**: Wave 3 (after Tasks 3-7)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - All prior tasks' QA scenarios — this task runs ALL of them end-to-end

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full integration cycle
    Tool: Bash + interactive_bash
    Preconditions: All prior tasks completed, app built
    Steps:
      1. cargo build — verify success
      2. cargo clippy --all-targets — verify 0 warnings
      3. npm run build (in ogre-desktop) — verify frontend builds
      4. Launch app, navigate to URL, verify embedded (xdotool count = 1)
      5. Resize window, verify bounds follow
      6. Open 2 tabs, switch between them, close one, open new one
      7. Navigate, back, forward, reload
      8. Verify URL bar tracking
      9. Create/destroy 5 tabs sequentially — check memory with ps
    Expected Result: All 9 sub-scenarios pass
    Failure Indicators: Any crash, separate window, bounds error, stale state
    Evidence: .sisyphus/evidence/task-8-integration.txt

  Scenario: No Windows regression (cross-check)
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `cargo check` (default target) — should compile
      2. Verify no changes to `#[cfg(not(target_os = "linux"))]` blocks: `git diff HEAD -- ogre-desktop/src-tauri/src/lib.rs | grep "cfg(not(target_os"` — should be empty
      3. Verify no frontend changes: `git diff HEAD -- ogre-desktop/src/` — should be empty
    Expected Result: No Windows code modified, no frontend changes
    Failure Indicators: Diff shows changes in non-Linux blocks or frontend files
    Evidence: .sisyphus/evidence/task-8-windows-regression.txt
  ```

  **Commit**: YES
  - Message: `test(linux): verify end-to-end embedded browser integration`
  - Files: `.sisyphus/evidence/*`
  - Pre-commit: `cargo clippy --all-targets`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo clippy --all-targets` + `cargo build`. Review all changed files for: `unsafe` blocks, empty error handlers, `unwrap()` in command handlers, dead code behind `#[cfg]`. Verify no Windows code was modified (`git diff` of `#[cfg(not(target_os = "linux"))]` blocks must be empty).
  Output: `Build [PASS/FAIL] | Clippy [PASS/FAIL] | Windows unchanged [YES/NO] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Run `cargo build` then launch the app. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test multi-tab create/switch/destroy. Test window resize → webview follows. Test navigation. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Verify no frontend files were modified. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Frontend files [CLEAN/N modified] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `build(linux): add gtk and wry Linux-only dependencies` — Cargo.toml
- **2**: `feat(linux): create GtkFixed container and Linux webview state` — lib.rs
- **3**: `feat(linux): rewrite create_embedded_browser to use wry build_gtk` — lib.rs
- **4**: `feat(linux): implement set_webview_bounds via wry set_bounds` — lib.rs
- **5**: `feat(linux): rewrite show/hide/destroy with wry WebView handles` — lib.rs
- **6**: `feat(linux): rewrite navigate/back/forward/reload via wry API` — lib.rs
- **7**: `feat(linux): add URL tracking and script injection via wry` — lib.rs
- **8**: `test(linux): verify end-to-end embedded browser integration` — evidence files

---

## Success Criteria

### Verification Commands
```bash
# Linux build passes
cargo build  # Expected: Compiling and Finished successfully

# Single window (no separate browser window)
xdotool search --name "O.G.R.E" | wc -l  # Expected: 1

# Clippy clean
cargo clippy --all-targets  # Expected: 0 warnings/errors

# Frontend still builds
npm run build  # Expected: success (in ogre-desktop/)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Browser renders INSIDE app window on Linux
- [ ] All 12 commands work on Linux
- [ ] Windows code paths unchanged
- [ ] No frontend files modified
