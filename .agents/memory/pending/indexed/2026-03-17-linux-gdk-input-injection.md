# Session: linux-gdk-input-injection
Date: 2026-03-17

## What Was Done
Completed the full linux-gdk-input-injection plan (T0–T5 + quality fixes):
- T0 Spike: confirmed gdk 0.18.2 API — use `gtk::gdk::test_simulate_button` (NOT `gdk::test::`)
- T1: Added `simulate_mouse_event`, `simulate_key_event`, `simulate_text_input` Tauri commands with Linux `#[cfg]` guards and `run_on_main_thread` safety
- T2: TypeScript gdk-actions.ts with gdkClick, gdkType, gdkPressKey, gdkScroll, isGdkAvailable, setGdkActiveTab
- T3: 10 unit tests for gdk-actions covering all public functions
- T4: 3-tier dispatcher in browser-actions.ts: CDP → GDK → evalScript
- Quality fixes: oneshot error propagation, real mousemove via gdk_test_simulate_motion FFI, check bool returns from test_simulate_button/test_simulate_key

## Key Technical Patterns — GDK 0.18.2

### Correct API path
- `gtk::gdk::test_simulate_button(window, x, y, button, mods, event_type) -> bool`
- `gtk::gdk::test_simulate_key(window, x, y, keyval: u32, mods, event_type) -> bool`
- These are TOP-LEVEL functions re-exported from `auto::functions` — NOT in a `gdk::test` submodule
- GDK key constants are `Key` type — dereference to get u32: `*gtk::gdk::keys::constants::Return`

### mousemove requires extern "C" FFI
- `gdk_test_simulate_motion` exists in the C library but is NOT in the Rust gdk-sys bindings
- Must declare manually:
  ```rust
  extern "C" {
      fn gdk_test_simulate_motion(window: *mut gtk::gdk::ffi::GdkWindow, x: i32, y: i32, modifiers: gtk::gdk::ffi::GdkModifierType) -> gtk::glib::ffi::gboolean;
  }
  ```
- Call with: `window.to_glib_none().0` and `mods.bits()`

### Accessing the webview widget
- Need `use wry::WebViewExtUnix;` import
- `wv.webview()` returns the underlying WebKit widget
- Cast: `wv.webview().upcast::<gtk::Widget>()`
- Get GDK window: `widget.window()` → `Option<gdk::Window>` (None if unrealized)

### Error propagation from run_on_main_thread
- Use `oneshot::channel::<Result<(), String>>()` to bridge `run_on_main_thread` → async
- Pattern: closure returns `Result`, sends via `tx.send(result)`, async fn awaits `rx.await`
- Reference: `get_embedded_url` in lib.rs uses the same pattern

### gdk crate re-exports gdk-sys
- `gdk` crate does `pub use ffi;` making gdk-sys accessible as `gtk::gdk::ffi::`
- No need to add `gdk-sys` as a direct dependency

### TypeScript: isGdkAvailable
- Check `window.__TAURI_INTERNALS__` exists AND `navigator.platform.includes('linux')`
- Returns false in test environment (no __TAURI_INTERNALS__ in jsdom)

## Final Wave Patterns (for future orchestration)
- Oracle scope issue: oracle compared against `main` instead of HEAD~N — always scope diff to `HEAD~N` when asking oracle to review plan-specific changes
- Cargo.lock changes are ALWAYS expected when adding deps — tell reviewers not to flag this
- F2 lesson: GDK bool return values from test_simulate_* MUST be checked — discarding them creates silent failures
- eprintln! in Rust is standard stderr logging, NOT equivalent to console.log in JS — don't flag it
- Pre-existing issues: always explicitly tell reviewers which issues are pre-existing so they don't get re-flagged

## Branch & Test Results
- Branch: linux-gdk-input-injection
- Worktree: .worktrees/linux-gdk-input-injection
- Commits: 5 (feat + 2 fix)
- Test results: 1212/1212 tests pass — zero regressions
- cargo check: 0 errors
