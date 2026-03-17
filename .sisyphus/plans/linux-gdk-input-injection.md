# GDK Event Injection — Real Input Simulation on Linux

## TL;DR

> **Quick Summary**: Add real mouse/keyboard input simulation on Linux by synthesizing GDK events and injecting them into the embedded WebKitGTK widget. On Windows, CDP `Input.dispatchMouseEvent`/`Input.dispatchKeyEvent` provides trusted input. On Linux, CDP doesn't exist. This plan adds Tauri commands that create native GDK events and dispatch them to the correct wry webview, giving `event.isTrusted === true` input on any site.
>
> **Deliverables**:
> - Rust `simulate_mouse_event` Tauri command — click, move, down, up at (x, y)
> - Rust `simulate_key_event` Tauri command — keyDown, keyUp with key code + modifiers
> - TypeScript `gdkClick()`, `gdkType()`, `gdkPressKey()` in new `gdk-actions.ts`
> - Updated `browser-actions.ts` dispatcher — 3-tier: CDP → GDK → evalScript
> - `gdk` crate added as direct Linux dependency
>
> **Estimated Effort**: Medium (3 waves, ~7 tasks)
> **Parallel Execution**: YES — within waves
> **Critical Path**: T1 (spike) → T3 (Rust commands) → T5 (TS integration) → T6 (wire dispatcher)

---

## Context

### Why This Is Needed

The O.G.R.E. desktop app currently has two input paths:

1. **CDP** (Windows only): `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` — real browser-level input, `event.isTrusted === true`. Works on any site.
2. **evalScript** (universal): JavaScript `element.click()` / `element.dispatchEvent(new MouseEvent(...))` — synthetic events, `event.isTrusted === false`. Most sites accept these, but some don't.

On Linux, CDP is unavailable (WebKitGTK doesn't support Chrome DevTools Protocol). The evalScript fallback works for MyOpenMath grading pages today, but as the app scales to arbitrary sites (Canvas, Blackboard, etc.), `isTrusted` checking will cause failures.

### Architecture Decision

GDK event injection is the correct approach because:
- WebKitGTK IS a GTK widget — GDK events are the native input mechanism
- `gdk` 0.18.2 is already a transitive dependency (via `gtk` 0.18)
- `webkit2gtk` 2.0.2 is already a transitive dependency (via `wry`)
- `LINUX_WEBVIEWS` thread-local already stores wry `WebView` handles on the main thread
- WebKit's own WebDriver automation internally uses the same GDK event synthesis

### Research Findings

- **WebKit Inspector Protocol has NO Input domain** — inspector only covers DOM, CSS, Runtime, Page
- **WebKit Automation domain has input** (`performMouseInteraction`, `performKeyboardInteractions`) but requires WebDriver session setup — too heavy
- **Playwright patches WebKit** with custom `Input.dispatch*` methods — can't reuse system WebKitGTK
- **GDK test utilities** (`gdk::test::simulate_button`, `gdk::test::simulate_key`) exist but require a realized `GdkWindow`
- **WebKit's own WebDriver implementation** (`WebAutomationSessionGtk.cpp`) calls `webkitWebViewBaseSynthesizeMouseEvent` which creates GDK events — confirming this is the sanctioned approach

### Dependencies Available

```toml
# Direct
gtk = { version = "0.18", features = ["v3_24"] }
wry = "0.54.1"

# Transitive (in Cargo.lock)
gdk = "0.18.2"          # GDK event system — needs to become direct dep
gdk-sys = "0.18.2"      # Low-level GDK FFI
webkit2gtk = "2.0.2"    # Full WebKitGTK bindings
```

### Metis-Identified Risks

1. **Widget handle access**: wry doesn't expose the underlying GTK widget. Must find the WebKitWebView inside the GtkFixed container children, or use wry's internal representation.
2. **GDK window availability**: `widget.window()` returns `None` if the widget isn't realized/mapped. Must verify widget state before event injection.
3. **Coordinate mapping**: GDK events use widget-local coordinates. Must ensure element coordinates from `getBoundingClientRect()` (via evalScript) map correctly to GDK widget coordinates.
4. **Main thread requirement**: GTK operations MUST run on the main thread. All event injection goes through `app.run_on_main_thread()`.
5. **Focus handling**: GDK keyboard events require the widget to have keyboard focus. May need `widget.grab_focus()` first.

---

## Work Objectives

### Core Objective
Add native GDK mouse and keyboard event injection for the Linux embedded browser, providing `event.isTrusted === true` input simulation on any website loaded in the wry webview.

### Concrete Deliverables
- `ogre-desktop/src-tauri/Cargo.toml`: Add `gdk` as direct Linux dependency
- `ogre-desktop/src-tauri/src/lib.rs`: New commands `simulate_mouse_event`, `simulate_key_event`
- `ogre-desktop/src/lib/gdk-actions.ts` + `.test.ts`: TypeScript wrappers matching cdp-actions API
- `ogre-desktop/src/lib/browser-actions.ts`: Updated dispatcher with GDK middle tier
- Spike evidence: `.sisyphus/evidence/gdk-input-spike.md`

### Definition of Done
- [ ] `cargo check` — zero errors
- [ ] `npx vitest run` — all tests pass (no regressions)
- [ ] GDK click at coordinates triggers real click on embedded browser page
- [ ] GDK key events produce text input in focused form fields
- [ ] `browser-actions.ts` dispatcher routes: CDP (Windows) → GDK (Linux) → evalScript (fallback)
- [ ] No `as any` casts in new TypeScript files

### Must Have
- `simulate_mouse_event` Tauri command: click, mousedown, mouseup, mousemove at (x, y)
- `simulate_key_event` Tauri command: keyDown, keyUp with GDK key code + modifiers
- TypeScript `gdkClick(selector)` that resolves selector → coordinates → GDK click
- TypeScript `gdkType(selector, text)` that focuses element → GDK key sequence
- TypeScript `gdkPressKey(key)` for special keys (Enter, Tab, Escape)
- 3-tier dispatcher: CDP → GDK → evalScript (transparent fallback)
- Main thread safety: all GDK calls via `run_on_main_thread()`

### Must NOT Have (Guardrails)
- **No `webkit2gtk` direct dependency** — keep it as transitive only; access widget through GTK container hierarchy
- **No Playwright dependency** — pure GDK approach
- **No changes to Windows code paths** — Linux-only additions
- **No `as any` casts** — explicit typing throughout
- **No removing evalScript fallback** — GDK is middle tier, evalScript remains as universal backup
- **No changes to `cdp-client.ts` or `cdp-actions.ts`** — those are Windows/CDP only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest for TS, cargo check/clippy for Rust)
- **Automated tests**: TDD (RED-GREEN-REFACTOR) for TypeScript; cargo check + clippy for Rust
- **Framework**: vitest

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 — Spike (gate condition):
└── T0: Spike — Can we get the GdkWindow from wry WebView? [deep]

Wave 1 — Foundation (2 parallel tasks after spike PASS):
├── T1: Add gdk dependency + Rust simulate_mouse_event command [quick]
└── T2: Add Rust simulate_key_event command [quick]

Wave 2 — TypeScript Integration (2 parallel tasks):
├── T3: Create gdk-actions.ts with gdkClick, gdkType, gdkPressKey [deep]
└── T4: Write tests for gdk-actions.ts [quick]

Wave 3 — Wire Dispatcher (1 task):
└── T5: Update browser-actions.ts dispatcher with 3-tier routing [deep]

Wave FINAL — Verification (parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + test run (unspecified-high)
└── F3: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T0   | —         | T1, T2 |
| T1   | T0 PASS   | T3     |
| T2   | T0 PASS   | T3     |
| T3   | T1, T2    | T5     |
| T4   | T3        | T5     |
| T5   | T3, T4    | F1-F3  |

---

## T0 — Spike: Access GdkWindow from wry WebView

> **Gate condition**: If this fails, the entire GDK approach is blocked. Must find alternative.

**What**: Verify we can obtain a `gdk::Window` from the wry `WebView` stored in `LINUX_WEBVIEWS`, then successfully call `gdk::test::simulate_button()` on it.

**Approach**:
```rust
// Inside run_on_main_thread:
LINUX_WEBVIEWS.with(|webviews| {
    if let Some(wv) = webviews.borrow().get(&label) {
        // Approach A: wry may expose a gtk_widget() or inner() method
        // Approach B: iterate GTK_FIXED children to find the WebKitWebView
        // Approach C: use gdk::Display::default() to find the window
        
        GTK_FIXED.with(|f| {
            let fixed = f.borrow();
            let fixed = fixed.as_ref().unwrap();
            // fixed.children() returns all child widgets
            for child in fixed.children() {
                // The wry WebView adds a widget to GtkFixed
                // Find the one that is a WebKitWebView or its container
                if let Some(gdk_window) = child.window() {
                    // SUCCESS: we have a GdkWindow
                    // Test: gdk::test::simulate_button(&gdk_window, x, y, ...)
                }
            }
        });
    }
});
```

**Acceptance Criteria**:
```bash
# Spike evidence must contain PASS/FAIL for:
# 1. Can enumerate GTK_FIXED children and find the webview widget
# 2. Can obtain GdkWindow from that widget
# 3. gdk::test::simulate_button() compiles and doesn't panic
# 4. A click event fires on the web page (verified via evalScript checking document.activeElement)
```

**Evidence file**: `.sisyphus/evidence/gdk-input-spike.md`

---

## T1 — Rust: simulate_mouse_event Command

**What**: Add a Tauri command that injects GDK mouse events into the embedded browser widget.

**File**: `ogre-desktop/src-tauri/Cargo.toml` (add gdk dep) + `ogre-desktop/src-tauri/src/lib.rs`

**Cargo.toml change**:
```toml
[target.'cfg(target_os = "linux")'.dependencies]
gtk = { version = "0.18", features = ["v3_24"] }
gdk = { version = "0.18", features = ["v3_24"] }   # NEW
wry = "0.54.1"
```

**Command signature**:
```rust
#[cfg(target_os = "linux")]
#[tauri::command]
async fn simulate_mouse_event(
    app: tauri::AppHandle,
    tab_id: String,
    event_type: String,    // "click" | "mousedown" | "mouseup" | "mousemove"
    x: f64,
    y: f64,
    button: Option<u32>,   // 1=left, 2=middle, 3=right (default: 1)
    modifiers: Option<u32>, // GDK modifier mask (default: 0)
) -> Result<(), String>
```

**Implementation pattern**:
```rust
app.run_on_main_thread(move || {
    // 1. Find the webview widget in GTK_FIXED children
    // 2. Get its GdkWindow
    // 3. Match event_type to create appropriate GDK event
    // 4. For "click": simulate_button press + release
    // 5. For "mousemove": simulate motion event
}).map_err(|_| "Failed to run on main thread")?;
```

**Acceptance Criteria**:
```bash
cargo check --manifest-path ogre-desktop/src-tauri/Cargo.toml
# Assert: 0 errors

cargo clippy --manifest-path ogre-desktop/src-tauri/Cargo.toml
# Assert: 0 warnings in new code
```

---

## T2 — Rust: simulate_key_event Command

**What**: Add a Tauri command that injects GDK keyboard events into the embedded browser widget.

**File**: `ogre-desktop/src-tauri/src/lib.rs`

**Command signature**:
```rust
#[cfg(target_os = "linux")]
#[tauri::command]
async fn simulate_key_event(
    app: tauri::AppHandle,
    tab_id: String,
    event_type: String,    // "keydown" | "keyup" | "keypress" (keydown+keyup)
    key_code: u32,         // GDK key code (e.g. gdk::keys::constants::Return)
    modifiers: Option<u32>, // GDK modifier mask
) -> Result<(), String>
```

**Key code mapping** (TypeScript key names → GDK constants):
```rust
fn key_name_to_gdk_keyval(name: &str) -> Option<u32> {
    match name {
        "Enter" | "Return" => Some(gdk::keys::constants::Return.into()),
        "Tab" => Some(gdk::keys::constants::Tab.into()),
        "Escape" => Some(gdk::keys::constants::Escape.into()),
        "Backspace" => Some(gdk::keys::constants::BackSpace.into()),
        "ArrowUp" => Some(gdk::keys::constants::Up.into()),
        "ArrowDown" => Some(gdk::keys::constants::Down.into()),
        "ArrowLeft" => Some(gdk::keys::constants::Left.into()),
        "ArrowRight" => Some(gdk::keys::constants::Right.into()),
        // Single character → gdk_unicode_to_keyval
        s if s.len() == 1 => Some(gdk::keys::constants::from_unicode(s.chars().next().unwrap())),
        _ => None,
    }
}
```

**Also add**: `simulate_text_input` command for typing strings (series of key events):
```rust
#[cfg(target_os = "linux")]
#[tauri::command]
async fn simulate_text_input(
    app: tauri::AppHandle,
    tab_id: String,
    text: String,
) -> Result<(), String>
// For each character in text: keyDown + keyUp with appropriate GDK keyval
```

**Acceptance Criteria**:
```bash
cargo check --manifest-path ogre-desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path ogre-desktop/src-tauri/Cargo.toml
# Assert: 0 errors, 0 warnings
```

---

## T3 — TypeScript: gdk-actions.ts

**What**: Create TypeScript wrappers that match the cdp-actions API surface, calling the Rust GDK commands.

**File**: `ogre-desktop/src/lib/gdk-actions.ts`

**Exports** (matching cdp-actions.ts naming):
```typescript
import { invoke } from '@tauri-apps/api/core';
import type { ActionResult } from './agent-types';
import { evalScript, evalScriptJSON } from './browser';

let _activeTabId = 'default';
export function setGdkActiveTab(tabId: string): void { _activeTabId = tabId; }

/**
 * Click element at selector via GDK event injection.
 * 1. Resolve selector → bounding rect via evalScript
 * 2. Calculate center coordinates
 * 3. Invoke simulate_mouse_event Tauri command
 */
export async function gdkClick(selector: string): Promise<ActionResult>

/**
 * Type text into element via GDK key events.
 * 1. Click element to focus (via gdkClick)
 * 2. Optionally clear existing value
 * 3. Invoke simulate_text_input for the string
 */
export async function gdkType(selector: string, text: string, clear?: boolean): Promise<ActionResult>

/**
 * Press a special key via GDK key event.
 * Maps W3C key names to GDK key codes.
 */
export async function gdkPressKey(key: string): Promise<ActionResult>

/**
 * Scroll via GDK (or JS fallback since scroll doesn't need isTrusted).
 */
export async function gdkScroll(direction: string, amount: number): Promise<ActionResult>

/**
 * Check if GDK input is available (Linux only, not in test environment).
 */
export function isGdkAvailable(): boolean
```

**Key pattern** — selector → coordinates → GDK:
```typescript
async function resolveElementCenter(selector: string): Promise<{x: number, y: number} | null> {
  const rect = await evalScriptJSON<{x: number, y: number, width: number, height: number} | null>(`
    (function() {
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2, width: r.width, height: r.height };
    })()
  `);
  return rect ? { x: rect.x, y: rect.y } : null;
}
```

**Acceptance Criteria**:
```bash
npx tsc --noEmit
# Assert: 0 errors

npx vitest run src/lib/gdk-actions.test.ts
# Assert: all tests pass
```

---

## T4 — Tests for gdk-actions.ts

**What**: Unit tests that mock the Tauri `invoke` calls and verify the selector→coordinate→GDK flow.

**File**: `ogre-desktop/src/lib/gdk-actions.test.ts`

**Test cases**:
1. `gdkClick resolves selector to coordinates and invokes simulate_mouse_event`
2. `gdkClick returns error when element not found`
3. `gdkType clicks element first, then invokes simulate_text_input`
4. `gdkType with clear=true invokes evalScript to clear before typing`
5. `gdkPressKey maps Enter to correct GDK key name and invokes simulate_key_event`
6. `gdkPressKey maps unknown key and returns error`
7. `isGdkAvailable returns false in test environment`

---

## T5 — Wire 3-Tier Dispatcher in browser-actions.ts

**What**: Update the `dispatch()` function in `browser-actions.ts` to try GDK actions as a middle tier between CDP and evalScript.

**File**: `ogre-desktop/src/lib/browser-actions.ts`

**Current flow** (lines 506-567):
```
if (isConnected()) → CDP actions
else → evalScript actions
```

**New flow**:
```
if (isConnected()) → CDP actions (Windows)
else if (isGdkAvailable()) → GDK actions (Linux)  ← NEW
else → evalScript actions (universal fallback)
```

**Only route these actions through GDK** (others stay evalScript):
- `click` → `gdkClick` (real mouse event)
- `type` → `gdkType` (real keyboard input)
- `pressKey` → `gdkPressKey` (real key event)

**Keep on evalScript** (don't need isTrusted):
- `readText` — pure DOM query
- `waitFor` — pure DOM query
- `scroll` — works fine via JS
- `navigate` — uses Tauri command already
- `screenshot` — uses html2canvas
- `writeCodeMirror` — uses JS CM API
- `discover_page` — pure DOM analysis

**Acceptance Criteria**:
```bash
npx vitest run
# Assert: all 1193+ tests pass (no regressions)

npx tsc --noEmit
# Assert: 0 errors
```

---

## Task Summary

| Task | Wave | Parallel? | Depends On | Description |
|------|------|-----------|------------|-------------|
| T0   | 0    | No (gate) | —          | Spike: GdkWindow access from wry WebView |
| T1   | 1    | Yes       | T0 PASS    | Rust simulate_mouse_event command |
| T2   | 1    | Yes       | T0 PASS    | Rust simulate_key_event + simulate_text_input |
| T3   | 2    | Yes       | T1, T2     | TypeScript gdk-actions.ts wrappers |
| T4   | 2    | Yes       | T3         | Tests for gdk-actions.ts |
| T5   | 3    | No        | T3, T4     | Wire 3-tier dispatcher |
| F1   | FINAL | Yes      | T5         | Plan compliance audit |
| F2   | FINAL | Yes      | T5         | Code quality + test run |
| F3   | FINAL | Yes      | T5         | Scope fidelity check |

---

## Key Reference: CDP Actions That Need GDK Equivalents

| CDP Action | cdp-actions.ts Method | GDK Equivalent | Notes |
|-----------|----------------------|----------------|-------|
| `Input.dispatchMouseEvent` (mousePressed+Released) | `pwClick()` | `gdk::test::simulate_button()` | Need element → coordinates first |
| `Input.insertText` | `pwType()` | `simulate_text_input` (char-by-char GDK keys) | Focus element via gdkClick first |
| `Input.dispatchKeyEvent` | `pwPressKey()` | `gdk::test::simulate_key()` | Map W3C key names → GDK keycodes |
| `DOM.scrollIntoViewIfNeeded` | (in pwClick) | evalScript `el.scrollIntoView()` | JS is fine for scroll |
| `Page.captureScreenshot` | `cdpScreenshot()` | html2canvas (existing) | Already handled |
| `Runtime.evaluate` | (in pwReadText etc.) | evalScript (existing) | Already handled |

---

## Commit Strategy

- **T0**: No commit (spike only, evidence file)
- **T1+T2**: `feat(linux): add GDK mouse and keyboard event injection commands`
- **T3+T4**: `feat(linux): add gdk-actions.ts with CDP-equivalent input simulation`
- **T5**: `feat(browser): add 3-tier input dispatch — CDP → GDK → evalScript`
