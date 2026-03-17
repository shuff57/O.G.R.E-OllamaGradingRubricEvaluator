# Learnings — linux-gdk-input-injection

## Session: ses_306461fcbffeuFY8EX58Nfwe7x | 2026-03-17

### Initial Context
- Plan started fresh (0/11 tasks)
- Worktree: .worktrees/linux-gdk-input-injection (branch: linux-gdk-input-injection)
- This is a Linux-only feature: GDK event injection into wry/WebKitGTK embedded browser
- Gate condition: T0 spike must PASS before T1/T2 can proceed

### Pre-existing LSP warnings (not from this plan)
- browser-actions.ts:215-216 — var declarations inside function (pre-existing)
- batch-grader.ts:718 — forEach callback returns value (pre-existing)
- grading-server/server.js — unreachable code (pre-existing)
- These are NOT blocking for cargo check / vitest

### Key Architecture Facts
- `gdk` 0.18.2 already transitive dep (via `gtk` 0.18)
- `LINUX_WEBVIEWS` thread-local stores wry WebView handles on main thread
- `GTK_FIXED` thread-local stores the GtkFixed container widget
- All GTK operations MUST run on main thread via `app.run_on_main_thread()`
- NO `webkit2gtk` direct dep (keep transitive only)
- NO `as any` casts in TypeScript
- evalScript fallback MUST remain (GDK is middle tier, not replacement)

## T0 Spike Findings — 2026-03-17

### CRITICAL: Correct GDK API in 0.18.2
- `gdk::test::simulate_button` does NOT exist — use `gtk::gdk::test_simulate_button` (top-level re-export)
- `gdk::test::simulate_key` does NOT exist — use `gtk::gdk::test_simulate_key` (top-level re-export)
- Signatures confirmed from source:
  - `test_simulate_button(window: &Window, x: i32, y: i32, button: u32, modifiers: ModifierType, button_pressrelease: EventType) -> bool`
  - `test_simulate_key(window: &Window, x: i32, y: i32, keyval: u32, modifiers: ModifierType, key_pressrelease: EventType) -> bool`
- GDK key constants are `Key` type — must dereference: `*gtk::gdk::keys::constants::Return` to get `u32`

### Accessing the WebView GTK Widget
- Must add `use wry::WebViewExtUnix;` import
- `webview.webview()` returns the underlying WebKit widget
- Cast to Widget: `webview.webview().upcast::<gtk::Widget>()`
- Get window: `widget.window()` returns `Option<gdk::Window>` (None if unrealized)

### cargo check result
- PASS — 0 errors after T0 spike code added to lib.rs
- `use wry::WebViewExtUnix` import added at line 19-20

### T1/T2 Implementation Pattern
1. Get webview from LINUX_WEBVIEWS by label
2. In run_on_main_thread: `webview.webview().upcast::<gtk::Widget>().window()` → `Option<gdk::Window>`
3. Guard: if window is None → return Err("Widget not realized")
4. Call `gtk::gdk::test_simulate_button(&window, x as i32, y as i32, button, ModifierType::empty(), EventType::ButtonPress)` then ButtonRelease for clicks
5. Call `gtk::gdk::test_simulate_key(&window, x as i32, y as i32, *keyval, modifiers, EventType::KeyPress)` then KeyRelease

## T2 Completion (2026-03-16)

**Task:** Add `simulate_key_event` and `simulate_text_input` Tauri commands to `lib.rs`.

**Implementation:**
- Added `simulate_key_event` command (lines ~1533-1573) supporting "keydown", "keyup", "keypress" event types
- Added `simulate_text_input` command (lines ~1575-1620) for character-by-character text input
- Both commands use `gtk::gdk::test_simulate_key()` with proper window/modifier handling
- Registered both in `tauri::generate_handler![]` with `#[cfg(target_os = "linux")]` guards

**Key Finding:**
- `gtk::gdk::unicode_to_keyval()` does NOT exist in gdk 0.18.2
- **Fallback:** For ASCII chars, keyval = Unicode codepoint directly (ch as u32)
- This works for standard text input; non-ASCII may need future enhancement

**Verification:**
- `cargo check` → Finished with 0 errors, 0 warnings ✓
- Both commands properly integrated into handler ✓
- Linux-only guards in place ✓


## T4 — gdk-actions.test.ts Unit Tests (COMPLETED)

### Summary
Created comprehensive unit tests for `gdk-actions.ts` with 10 test cases covering all public functions.

### Key Learnings

1. **resolveElementCenter returns center coords directly**
   - The evalScript in `resolveElementCenter` computes center as `{ x: r.x + r.width/2, y: r.y + r.height/2, ... }`
   - The returned rect's `x` and `y` are ALREADY center coordinates, not top-left
   - Mock return values should use center coords directly, not raw rect values

2. **Mock setup order is critical**
   - `vi.mock()` calls MUST come before imports
   - Mocks are hoisted by vitest, but explicit ordering prevents confusion
   - Pattern: mock → import → cast to `ReturnType<typeof vi.fn>` for type safety

3. **Test structure for multi-step functions**
   - `gdkType` calls `gdkClick` internally, then `evalScriptJSON` for clear, then `invoke` for text
   - Mock queue: `mockResolvedValueOnce()` chains handle sequential calls
   - Verify both the internal call (click) and final call (text_input) with `expect.objectContaining()`

4. **GDK keyval mapping**
   - Special keys map to X11 keysyms (e.g., Enter = 0xff0d)
   - Single-char keys use Unicode codepoint (e.g., 'a' = 0x61)
   - Multi-char unknown keys (e.g., 'F13') return error

5. **Test coverage achieved**
   - gdkClick: selector resolution, error handling
   - gdkType: click + type flow, clear option
   - gdkPressKey: special key mapping, unknown key error
   - isGdkAvailable: test environment detection
   - setGdkActiveTab: tab ID state management
   - gdkScroll: direction handling (up/down)

### Test Results
✅ All 10 tests PASS
✅ No LSP errors
✅ No trivial assertions (all test meaningful behavior)

### Files Created
- `ogre-desktop/src/lib/gdk-actions.test.ts` — 130 lines, 10 test cases

