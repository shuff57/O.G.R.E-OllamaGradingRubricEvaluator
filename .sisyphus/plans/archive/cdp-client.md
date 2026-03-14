# Replace Playwright with Thin CDP WebSocket Client

## TL;DR

> **Quick Summary**: Remove the `playwright-core` dependency (dead code in production builds) and replace it with a zero-dependency CDP WebSocket client (~300 lines) that bundles natively into the Tauri app. Agent Mode gets real browser input events (`Input.dispatchMouseEvent`) and native screenshots (`Page.captureScreenshot`) in production for the first time.
> 
> **Deliverables**:
> - `cdp-client.ts` — Thin CDP WebSocket JSON-RPC client (~150 lines, zero npm deps)
> - `cdp-actions.ts` — CDP action implementations matching existing `playwright-executor.ts` API surface
> - Native CDP screenshot path in `browser.ts` (with html2canvas fallback preserved)
> - Dynamic CDP port allocation in `lib.rs` with Tauri command to expose port
> - Playwright dependency + files fully removed
> - Tests for all new modules
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (cdp-client) → Task 3 (cdp-actions) → Task 5 (swap integration) → Task 7 (verification)

---

## Context

### Original Request
User asked: "Is the GraderPanel using Playwright to control the webview? Can we optimize it or move it so it can be bundled?" After analysis, we discovered:
- Batch grading uses `evalScript` (Tauri IPC → Rust → `wv.eval()`), NOT Playwright
- Playwright is ONLY used in Agent Mode for 5 actions, as a devDependency that can't be bundled
- Agent Mode's CDP path is **dead code in production** — `connectCDP()` has no caller in the app
- User chose: replace with a thin CDP WebSocket client that bundles natively

### Interview Summary
**Key Discussions**:
- Three options evaluated: (1) drop Playwright entirely, (2) thin CDP client, (3) keep Playwright optional
- User chose Option 2 for reliable AI agent control with real input events
- CDP `Input.dispatchMouseEvent` pierces cross-origin iframes and shadow DOM — critical for grading sites
- Native `Page.captureScreenshot` replaces html2canvas CDN dependency (with fallback preserved)
- Accessibility tree (`getFullAXTree`) discussed but deferred — separate follow-up task
- extensibility story: adding new interactions = one CDP call, no library updates

**Research Findings**:
- WebView2 CDP works (spike confirmed: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=PORT`)
- CDP target filtering documented: filter by URL, exclude `tauri://localhost`
- Reference implementations: extension-js CDPClient (~100 lines), devtools-mcp (~60 lines)
- Stagehand click flow: `DOM.resolveNode → DOM.scrollIntoViewIfNeeded → DOM.getBoxModel → Input.dispatchMouseEvent`
- Integration surface is surgically narrow: 6 files, ~20 lines of integration code

### Metis Review
**Identified Gaps** (addressed):
- **CRITICAL — `connectCDP()` has no caller**: Plan defines connection lifecycle — agent loop's `start()` calls `connect()`, cleanup calls `disconnect()`
- **CRITICAL — Screenshot dual consumers**: Batch grading uses html2canvas without CDP. Plan keeps html2canvas as fallback, CDP screenshot as enhancement when connected
- **CRITICAL — Random port discovery**: `--remote-debugging-port=0` not reliably supported by WebView2. Plan uses sequential port-try pattern (9222-9242) matching existing OAuth server pattern in `lib.rs:538-549`
- **Behavioral regression risk**: Playwright `click()` has actionability checks (visibility, stability, overlap). Plan adds explicit `DOM.scrollIntoViewIfNeeded` + `DOM.getBoxModel` before dispatching, plus AI agent's screenshot retry acts as adaptive fallback
- **Accessibility tree scope**: Excluded from this plan. Separate follow-up task.
- **CDP target invalidation**: On page navigation, target URL changes. Plan listens for URL changes and re-discovers target.
- **iframe content**: CDP operates on main frame by default. Coordinate-based clicks pierce iframes. Documented as known limitation for frame-specific JS evaluation.

---

## Work Objectives

### Core Objective
Replace `playwright-core` with a bundleable, zero-dependency CDP WebSocket client so Agent Mode has real browser input events and native screenshots in production builds.

### Concrete Deliverables
- `ogre-desktop/src/lib/cdp-client.ts` — CDP WebSocket JSON-RPC client
- `ogre-desktop/src/lib/cdp-actions.ts` — CDP action implementations (same API as playwright-executor.ts)
- `ogre-desktop/src/lib/cdp-client.test.ts` — unit tests
- `ogre-desktop/src/lib/cdp-actions.test.ts` — unit tests
- Modified `ogre-desktop/src/lib/browser-actions.ts` — import swap
- Modified `ogre-desktop/src/lib/browser.ts` — CDP screenshot path
- Modified `ogre-desktop/src-tauri/src/lib.rs` — dynamic CDP port + Tauri command
- Modified `ogre-desktop/vite.config.js` — remove playwright-core exclusion
- Modified `ogre-desktop/package.json` — remove playwright-core dependency
- Deleted `ogre-desktop/src/lib/playwright-executor.ts`
- Deleted `ogre-desktop/src/lib/playwright-executor.test.ts`

### Definition of Done
- [x] `npm run build` in ogre-desktop succeeds without playwright-core
- [x] `npm run test` in ogre-desktop passes — all existing + new tests green
- [x] `grep -r "playwright-executor" ogre-desktop/src/lib/` returns zero matches
- [x] `grep "playwright-core" ogre-desktop/package.json` returns zero matches
- [x] New CDP modules have zero npm dependencies (browser-native WebSocket only)
- [x] `cdp-client.ts` + `cdp-actions.ts` combined ≤ 400 lines
- [x] `captureWebviewScreenshot()` still works when CDP is not connected (html2canvas fallback)
- [x] `cargo check` succeeds in `ogre-desktop/src-tauri/`

### Must Have
- CDP WebSocket client with `connect`, `disconnect`, `send`, `isConnected` API
- CDP-based action implementations matching existing `pw*` function signatures exactly
- Dynamic CDP port allocation in `lib.rs` with `get_cdp_port` Tauri command
- html2canvas kept as screenshot fallback when CDP is unavailable
- `evalScript` fallback preserved when CDP is not connected
- `ActionResult` return type contract preserved for all actions
- `DANGEROUS_JS_PATTERNS` check on any `Runtime.evaluate` calls
- Every exported function from cdp-actions.ts has matching unit test

### Must NOT Have (Guardrails)
- Must NOT include Accessibility tree (`getFullAXTree`) changes to `agent-dom.ts` — separate follow-up
- Must NOT add new agent actions beyond existing 5 CDP-routed ones + screenshot
- Must NOT remove html2canvas CDN loading or `ensureHtml2CanvasLoaded()` — it's the fallback path
- Must NOT replace `evalScript` / `evalScriptJSON` in browser.ts with CDP `Runtime.evaluate` — they serve different purposes
- Must NOT implement auto-reconnect — simple connect/disconnect lifecycle; reconnect is follow-up
- Must NOT use `--remote-debugging-port=0` — unreliable with WebView2; use sequential port-try
- Must NOT remove spike files (`ogre-desktop/spike/*`) — they're reference material, not in build
- Must NOT change batch grading code (`batch-grader.ts`) — it uses evalScript, not CDP

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest with comprehensive mocks)
- **Automated tests**: Tests-after
- **Framework**: vitest (existing)
- **Pattern**: Follow mock structure from `agent-loop.test.ts:3-22` and `playwright-executor.test.ts`

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (`vitest run`, `tsc --noEmit`, `npm run build`)
- **Backend (Rust)**: Use Bash (`cargo check`, `cargo build`)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — no dependencies):
├── Task 1: cdp-client.ts — Thin CDP WebSocket client [deep]
└── Task 2: lib.rs — Dynamic CDP port allocation + Tauri command [deep]

Wave 2 (After Wave 1 — core module + tests):
├── Task 3: cdp-actions.ts — CDP action implementations [deep]
└── Task 4: Tests for cdp-client + cdp-actions [unspecified-high]

Wave 3 (After Wave 2 — integration + cleanup):
├── Task 5: Swap integration — browser-actions.ts + remove Playwright [quick]
└── Task 6: CDP screenshot path in browser.ts [quick]

Wave FINAL (After Wave 3 — verification):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Build + test verification [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 3 → Task 5 → F1-F4
Parallel Speedup: ~40% (Wave 1 parallelizes Rust + TS, Wave 3 parallelizes swap + screenshot)
Max Concurrent: 2 per wave
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3, 4 | 1 |
| 2 | — | 3 | 1 |
| 3 | 1 | 4, 5, 6 | 2 |
| 4 | 1, 3 | 5 | 2 |
| 5 | 3, 4 | F1-F4 | 3 |
| 6 | 3, 5 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `deep`, T2 → `deep`
- **Wave 2**: **2** — T3 → `deep`, T4 → `unspecified-high`
- **Wave 3**: **2** — T5 → `quick`, T6 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### Wave 1 — Foundation (Start Immediately)

- [x] 1. Build `cdp-client.ts` — Thin CDP WebSocket Client

  **What to do**:
  - Create `ogre-desktop/src/lib/cdp-client.ts` (~150 lines)
  - Implement a `CDPClient` class (or module-level singleton) with:
    1. `connect(port: number): Promise<boolean>` — Fetches `http://127.0.0.1:{port}/json` to discover targets, filters out main app targets (`tauri://localhost`, `https://tauri.localhost`, dev server URLs, `about:blank`), connects WebSocket to embedded browser's `webSocketDebuggerUrl`. Returns `true` on success, `false` on failure (never throws).
    2. `disconnect(): Promise<void>` — Closes WebSocket, clears state. Safe to call when not connected.
    3. `send(method: string, params?: object): Promise<any>` — JSON-RPC over WebSocket. Assigns incrementing `id`, stores Promise in pending Map, sends `{id, method, params}`, resolves when response with matching `id` arrives. Rejects with timeout after 30s.
    4. `isConnected(): boolean` — Returns `true` if WebSocket is open and page target is attached.
    5. `on(event: string, callback: Function): void` — Listen for CDP events (e.g., `Page.frameNavigated`). Filters incoming messages where `method` field matches.
  - Target discovery: `GET http://127.0.0.1:{port}/json` returns array of `{ id, type, title, url, webSocketDebuggerUrl }`. Filter: `type === 'page'`, exclude URLs matching `MAIN_APP_PATTERNS` from `playwright-executor.ts:103-108`.
  - WebSocket message routing: incoming messages with `id` → resolve pending Promise. Messages without `id` (events) → dispatch to event listeners.
  - Error handling: all public methods catch internally, `connect` returns false, `send` rejects with descriptive error, `disconnect` is always safe.
  - Zero npm dependencies — browser-native `WebSocket` only.
  - Export singleton: `export const cdp = new CDPClient()` or module-level functions (match pattern from `playwright-executor.ts`).

  **Must NOT do**:
  - Do NOT implement auto-reconnect — simple lifecycle only
  - Do NOT add npm dependencies — browser-native WebSocket only
  - Do NOT use Node.js `ws` library — this runs in Tauri frontend (browser context)
  - Do NOT import from `playwright-core` or `playwright-executor`
  - Do NOT add CDP domain enable calls yet (that's cdp-actions.ts)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core networking module requiring careful WebSocket lifecycle management, Promise-based request/response tracking, and error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/playwright-executor.ts:96-119` — `connectCDP()` function showing target discovery pattern: fetch `/json`, filter by `MAIN_APP_PATTERNS`, match embedded browser by URL exclusion. Copy this filtering logic exactly.
  - `ogre-desktop/src/lib/playwright-executor.ts:103-108` — `MAIN_APP_PATTERNS` array: `['tauri://localhost', 'https://tauri.localhost', 'http://localhost:1420', 'http://localhost:5173', 'http://localhost:4173']`. Reuse these patterns.
  - `ogre-desktop/spike/cdp-targeting-spike.ts` — Spike script showing CDP `/json` endpoint usage and target identification.

  **External References**:
  - Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
  - CDP WebSocket format: JSON-RPC with `{id, method, params}` requests, `{id, result}` or `{id, error}` responses, `{method, params}` events

  **WHY Each Reference Matters**:
  - `playwright-executor.ts:96-119`: Contains the exact target filtering logic we need to preserve — same URL patterns, same exclusion strategy
  - `cdp-targeting-spike.ts`: Real-world validation of CDP target discovery on this specific WebView2 setup

  **Acceptance Criteria**:
  - [ ] File `ogre-desktop/src/lib/cdp-client.ts` exists
  - [ ] Exports: `connect`, `disconnect`, `isConnected`, `send`, `on`
  - [ ] Zero npm imports (only browser-native WebSocket)
  - [ ] File is ≤ 200 lines
  - [ ] `connect(99999)` returns `false` (no server at that port), does NOT throw
  - [ ] `disconnect()` when not connected does NOT throw
  - [ ] `isConnected()` returns `false` initially
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: CDP client connects gracefully to non-existent port
    Tool: Bash (vitest)
    Preconditions: cdp-client.ts exists
    Steps:
      1. Import connect, isConnected from cdp-client
      2. Call connect(99999)
      3. Assert return value is false
      4. Assert isConnected() returns false
    Expected Result: Returns false, no thrown exception, no unhandled rejection
    Failure Indicators: Thrown exception, returns true, or process hangs
    Evidence: .sisyphus/evidence/task-1-connect-fail.txt

  Scenario: Module has zero npm dependencies
    Tool: Bash
    Preconditions: cdp-client.ts exists
    Steps:
      1. Read cdp-client.ts
      2. Grep for import statements
      3. Verify no imports from node_modules (only relative ./)
    Expected Result: Zero external package imports
    Failure Indicators: import from 'ws', 'playwright-core', or any npm package
    Evidence: .sisyphus/evidence/task-1-no-deps.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-connect-fail.txt — connection failure test output
  - [ ] task-1-no-deps.txt — dependency check output

  **Commit**: YES (grouped with Wave 1)
  - Message: `feat(agent): add thin CDP WebSocket client`
  - Files: `ogre-desktop/src/lib/cdp-client.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

- [x] 2. Modify `lib.rs` — Dynamic CDP Port Allocation + Tauri Command

  **What to do**:
  - Modify `ogre-desktop/src-tauri/src/lib.rs` to:
    1. Replace hardcoded `--remote-debugging-port=9222` with dynamic port allocation
    2. In the `run()` function (before `tauri::Builder::default().build()`), try ports 9222-9242 sequentially:
       - For each port, attempt TCP bind (`TcpListener::bind("127.0.0.1:{port}")`) → if success, the port is available → release the listener → set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port={port}`
       - Store the allocated port in managed state
    3. Add a new managed state struct: `CdpPortState { port: Option<u16> }`
    4. Add a new Tauri command: `get_cdp_port(state: State<CdpPortState>) -> Result<Option<u16>, String>`
    5. Register in `invoke_handler` macro and `manage()` call
  - The port allocation should match the existing OAuth server pattern at `lib.rs:538-549` for consistency.
  - If ALL ports 9222-9242 are busy, set `port: None` (CDP unavailable) — don't fail the app.

  **Must NOT do**:
  - Do NOT use `--remote-debugging-port=0` — behavior undefined with WebView2
  - Do NOT break existing Tauri commands or their signatures
  - Do NOT modify sidecar, tray, or update logic
  - Do NOT add new Rust crate dependencies unless absolutely necessary
  - Do NOT enable CDP unconditionally in release builds without the env var gate

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Rust modification with careful initialization order, port allocation, and Tauri managed state
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3 (needs port to connect)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:538-549` — OAuth local server port-try pattern. Follow this exact pattern for CDP port allocation.
  - `ogre-desktop/src-tauri/src/lib.rs:607-631` — `run()` function entry point. The env var MUST be set before line 721 (`tauri::Builder::default()`).
  - `ogre-desktop/src-tauri/src/lib.rs:201-270` — `create_embedded_browser()` command showing how WebView2 is created. CDP only exposes targets after this is called.
  - `ogre-desktop/spike/SPIKE-RESULTS.md` — CDP section documenting exact env var and initialization order.

  **WHY Each Reference Matters**:
  - `lib.rs:538-549`: The port-try pattern is proven and already works in this codebase
  - `lib.rs:607-631`: Initialization order is CRITICAL — env var after `.build()` has no effect
  - `SPIKE-RESULTS.md`: Contains validated findings from the Task 2 spike

  **Acceptance Criteria**:
  - [ ] `get_cdp_port` Tauri command exists and is registered
  - [ ] `CdpPortState` managed state struct exists
  - [ ] Port allocation tries 9222-9242 sequentially
  - [ ] Env var set BEFORE `tauri::Builder::default().build()`
  - [ ] `cargo check` succeeds in `ogre-desktop/src-tauri/`
  - [ ] App still starts normally when all ports are busy (graceful degradation)

  **QA Scenarios:**

  ```
  Scenario: Rust builds successfully with dynamic CDP port
    Tool: Bash
    Preconditions: lib.rs modified
    Steps:
      1. Run `cargo check` in ogre-desktop/src-tauri
      2. Check exit code is 0
    Expected Result: Compilation succeeds with no errors
    Failure Indicators: Compilation errors, undefined variables
    Evidence: .sisyphus/evidence/task-2-cargo-check.txt

  Scenario: get_cdp_port command is registered
    Tool: Bash
    Preconditions: lib.rs modified
    Steps:
      1. grep 'get_cdp_port' ogre-desktop/src-tauri/src/lib.rs
      2. Verify it appears in both the function definition AND the invoke_handler macro
    Expected Result: Command defined and registered
    Failure Indicators: Missing from invoke_handler, or function not defined
    Evidence: .sisyphus/evidence/task-2-command-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-cargo-check.txt — Rust build output
  - [ ] task-2-command-check.txt — command registration verification

  **Commit**: YES (grouped with Wave 1)
  - Message: `feat(agent): dynamic CDP port allocation with get_cdp_port command`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cd ogre-desktop/src-tauri && cargo check`

### Wave 2 — Core Module + Tests (After Wave 1)

- [x] 3. Build `cdp-actions.ts` — CDP Action Implementations

  **What to do**:
  - Create `ogre-desktop/src/lib/cdp-actions.ts`
  - Import the thin CDP client from `./cdp-client` (Task 1)
  - Import `ActionResult` and `DANGEROUS_JS_PATTERNS` from `./agent-types`
  - Import `invoke` from `@tauri-apps/api/core` (for `get_cdp_port` Tauri command)
  - Implement these exported functions with EXACT same signatures as `playwright-executor.ts`:
    1. `connectCDP(port?: number): Promise<boolean>` — If no port given, call `invoke('get_cdp_port')` to get the dynamic port from Rust. Then call `cdp.connect(port)`. After connecting, send `Page.enable` to receive navigation events. Returns `true`/`false`, never throws.
    2. `disconnectCDP(): Promise<void>` — Call `cdp.disconnect()`. Safe when not connected.
    3. `isConnected(): boolean` — Return `cdp.isConnected()`.
    4. `pwClick(selector: string): Promise<ActionResult>` — CDP click flow:
       - `Runtime.evaluate` with expression `document.querySelector('${selector}')` using `returnByValue: false` to get `objectId`
       - `DOM.scrollIntoViewIfNeeded({ objectId })`
       - `DOM.getBoxModel({ objectId })` → extract `content` quad → compute center x = (quad[0]+quad[4])/2, y = (quad[1]+quad[5])/2
       - `Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })`
       - `Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })`
       - Return `{ success: true }` on success, `{ success: false, error }` on failure
    5. `pwType(selector: string, text: string, clear?: boolean): Promise<ActionResult>` — CDP type flow:
       - Focus the element: `Runtime.evaluate` with `document.querySelector('${selector}')?.focus()`
       - If `clear`: `Runtime.evaluate` → `el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true}))`
       - Insert text: `Input.insertText({ text })` (sends whole string at once, simplest approach)
       - Return `{ success: true }` on success
    6. `pwReadText(selector?: string): Promise<ActionResult>` — CDP read flow:
       - If selector: `Runtime.evaluate` with `document.querySelector('${selector}')?.textContent ?? ''`
       - If no selector: `Runtime.evaluate` with `(document.body.innerText || '').substring(0, 5000)`
       - Check `DANGEROUS_JS_PATTERNS` on expressions containing dynamic content before `Runtime.evaluate`
       - Return `{ success: true, data: text }`
    7. `pwWaitFor(selector: string, timeoutMs?: number): Promise<ActionResult>` — Polling wait:
       - Cap timeout at `Math.min(timeoutMs ?? 5000, 10000)`
       - Poll every 200ms: `Runtime.evaluate` with `!!document.querySelector('${selector}')`
       - If found within timeout: return `{ success: true }`
       - If timeout: return `{ success: false, error: 'Timeout waiting for ...' }`
    8. `pwScroll(direction: string, amount: number): Promise<ActionResult>` — CDP scroll:
       - Map direction to (x,y): up=`(0,-amount)`, down=`(0,amount)`, left=`(-amount,0)`, right=`(amount,0)`
       - `Runtime.evaluate` with `window.scrollBy(x, y); ({scrollX: window.scrollX, scrollY: window.scrollY})`
       - Return `{ success: true, data: { scrollX, scrollY } }` (match existing behavior from `playwright-executor.ts:315-323`)
    9. `cdpScreenshot(): Promise<string>` — NEW function (not in playwright-executor):
       - `Page.captureScreenshot({ format: 'jpeg', quality: 80 })`
       - Return `'data:image/jpeg;base64,' + result.data`
  - Safety: Create a local `checkDangerousPatterns(code: string): string | null` helper (copy pattern from `playwright-executor.ts:51-58`). Call before ANY `Runtime.evaluate` that includes user-provided content (selectors are safe — they're CSS, not JS — but `readText` body-text expressions need checking).
  - All functions catch internally and return `ActionResult` — NEVER throw.
  - The selector-escaping for `querySelector` calls: use the `escapeSelector` pattern or simple single-quote escaping to prevent CSS injection.

  **Must NOT do**:
  - Do NOT add new action types beyond the existing 5 + screenshot
  - Do NOT import from `playwright-core` or `playwright-executor`
  - Do NOT implement auto-reconnect logic
  - Do NOT modify `agent-types.ts` or add new action params
  - Do NOT skip `DANGEROUS_JS_PATTERNS` check on `Runtime.evaluate` calls
  - Do NOT use `Runtime.evaluate` with `.click()` for clicking — use DOM/Input domains for real input events

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core module with complex CDP protocol interactions, careful error handling, and exact API surface matching
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Task 1 complete)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4, Task 5, Task 6
  - **Blocked By**: Task 1 (cdp-client.ts), Task 2 (get_cdp_port command)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/playwright-executor.ts` — FULL FILE. This is the module being replaced. Copy exact function signatures: `connectCDP` (line 101), `disconnectCDP` (line 165), `isConnected` (line 181), `pwClick` (line 192), `pwType` (line 212), `pwReadText` (line 239), `pwWaitFor` (line 266), `pwScroll` (line 289). Copy `MAIN_APP_PATTERNS` from lines 28-32. Copy `checkDangerousPatterns` from lines 51-58.
  - `ogre-desktop/src/lib/browser-actions.ts:20` — Import line: `import { isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll } from './playwright-executor'`. cdp-actions.ts MUST export these exact names.
  - `ogre-desktop/src/lib/browser-actions.ts:362-376` — The `isConnected()` check and 5 case arms. These are the EXACT function calls this module must satisfy.
  - `ogre-desktop/src/lib/agent-types.ts:49-53` — `ActionResult` interface: `{ success: boolean; error?: string; data?: unknown }`.
  - `ogre-desktop/src/lib/agent-types.ts:171-182` — `DANGEROUS_JS_PATTERNS` array.
  - `ogre-desktop/src/lib/cdp-client.ts` — The thin CDP client from Task 1. Use its `connect()`, `disconnect()`, `isConnected()`, `send()` API.

  **External References**:
  - Stagehand click flow: `DOM.scrollIntoViewIfNeeded → DOM.getBoxModel → Input.dispatchMouseEvent`
  - CDP Input domain: https://chromedevtools.github.io/devtools-protocol/tot/Input/
  - CDP DOM domain: https://chromedevtools.github.io/devtools-protocol/tot/DOM/
  - CDP Runtime domain: https://chromedevtools.github.io/devtools-protocol/tot/Runtime/
  - CDP Page domain: https://chromedevtools.github.io/devtools-protocol/tot/Page/

  **WHY Each Reference Matters**:
  - `playwright-executor.ts`: Exact API contract to replicate — same function names, param types, return types, error handling
  - `browser-actions.ts:362-376`: The integration point calling these functions — signatures MUST match exactly
  - `agent-types.ts:49-53`: Return type contract — must return ActionResult, not raw CDP responses
  - Stagehand click flow: Proven production pattern for coordinate-based clicks through CDP

  **Acceptance Criteria**:
  - [ ] File `ogre-desktop/src/lib/cdp-actions.ts` exists
  - [ ] Exports exactly: `connectCDP`, `disconnectCDP`, `isConnected`, `pwClick`, `pwType`, `pwReadText`, `pwWaitFor`, `pwScroll`, `cdpScreenshot`
  - [ ] All `pw*` functions return `Promise<ActionResult>` and NEVER throw
  - [ ] `cdpScreenshot` returns `Promise<string>` (data URL)
  - [ ] `connectCDP` calls `invoke('get_cdp_port')` when no port argument given
  - [ ] `pwClick` uses `DOM.scrollIntoViewIfNeeded` + `DOM.getBoxModel` + `Input.dispatchMouseEvent`
  - [ ] `DANGEROUS_JS_PATTERNS` check exists before `Runtime.evaluate` calls
  - [ ] TypeScript compiles: `npx tsc --noEmit`
  - [ ] Zero npm dependencies beyond `./cdp-client`, `./agent-types`, `@tauri-apps/api/core`

  **QA Scenarios:**

  ```
  Scenario: All action functions return ActionResult when not connected
    Tool: Bash (vitest)
    Preconditions: cdp-actions.ts exists, cdp-client mocked as disconnected
    Steps:
      1. Mock cdp-client: isConnected() returns false
      2. Call each: pwClick('#btn'), pwType('#input', 'text'), pwReadText('#el'), pwWaitFor('#el'), pwScroll('down', 300)
      3. Assert each returns { success: false, error: <descriptive string> }
    Expected Result: All 5 functions return failure ActionResult, none throw
    Failure Indicators: Any function throws, or returns success:true when disconnected
    Evidence: .sisyphus/evidence/task-3-actions-disconnected.txt

  Scenario: connectCDP calls Tauri invoke for port discovery
    Tool: Bash (vitest)
    Preconditions: Mock @tauri-apps/api/core invoke, mock cdp-client connect
    Steps:
      1. vi.mock @tauri-apps/api/core: invoke('get_cdp_port') returns 9222
      2. vi.mock ./cdp-client: connect(9222) returns true, send() resolves
      3. Call connectCDP() (no port argument)
      4. Assert invoke was called with 'get_cdp_port'
      5. Assert cdp.connect was called with 9222
    Expected Result: connectCDP orchestrates port discovery through Tauri
    Failure Indicators: invoke not called, wrong port, cdp.connect not called
    Evidence: .sisyphus/evidence/task-3-connect-invoke.txt

  Scenario: cdpScreenshot returns valid JPEG data URL
    Tool: Bash (vitest)
    Preconditions: Mock cdp.send('Page.captureScreenshot') to return { data: 'base64data' }
    Steps:
      1. Mock cdp as connected, send resolves { data: 'base64data' }
      2. Call cdpScreenshot()
      3. Assert result === 'data:image/jpeg;base64,base64data'
    Expected Result: Returns properly formatted data URL
    Failure Indicators: Missing prefix, wrong format, undefined result
    Evidence: .sisyphus/evidence/task-3-screenshot.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-actions-disconnected.txt — disconnected action test output
  - [ ] task-3-connect-invoke.txt — Tauri invoke integration test
  - [ ] task-3-screenshot.txt — screenshot function test

  **Commit**: YES (grouped with Wave 2)
  - Message: `feat(agent): CDP action implementations replacing playwright-executor`
  - Files: `ogre-desktop/src/lib/cdp-actions.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

- [x] 4. Tests for `cdp-client.ts` + `cdp-actions.ts`

  **What to do**:
  - Create `ogre-desktop/src/lib/cdp-client.test.ts` — unit tests for the thin CDP client
  - Create `ogre-desktop/src/lib/cdp-actions.test.ts` — unit tests for all CDP actions
  - Follow the exact mock structure from `playwright-executor.test.ts` (lines 1-17)
  - **cdp-client.test.ts** must test:
    - `isConnected()` returns `false` initially
    - `connect(99999)` returns `false` when no CDP server (no throw)
    - `isConnected()` returns `false` after failed connection
    - `disconnect()` does not throw when not connected
    - `send()` rejects when not connected
  - **cdp-actions.test.ts** must test:
    - All 5 `pw*` functions return `{ success: false, error: string }` when not connected (never throw)
    - `connectCDP()` without port argument calls `invoke('get_cdp_port')`
    - `cdpScreenshot()` returns data URL format when mocked connected
    - `pwClick`, `pwType`, `pwReadText`, `pwWaitFor`, `pwScroll` all return `ActionResult`
  - Mock strategy:
    - `vi.mock('@tauri-apps/api/core')` for invoke
    - `vi.mock('./cdp-client')` for the CDP client singleton
    - Use `beforeEach` to clear mocks and disconnect
  - Test naming: follow existing `describe('module: category')` + `test('descriptive name')` pattern from `playwright-executor.test.ts`

  **Must NOT do**:
  - Do NOT test against a real CDP server — all tests use mocks
  - Do NOT import `playwright-core` in any test file
  - Do NOT modify existing test files (only create new ones)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test writing with careful mocking of WebSocket, Tauri invoke, and CDP protocol — needs precision but not deep architecture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, after Task 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5 (tests must pass before integration swap)
  - **Blocked By**: Task 1 (cdp-client.ts), Task 3 (cdp-actions.ts)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/playwright-executor.test.ts` — FULL FILE (80 lines). Copy this exact testing structure: mock setup at top, `beforeEach` with `vi.clearAllMocks()`, `describe` groups for connection state + actions when not connected. Mirror every test for the new CDP modules.
  - `ogre-desktop/src/lib/agent-loop.test.ts:3-22` — Mock pattern for browser module. Shows how to mock Tauri IPC (`vi.mock('./browser')`) and validate mock calls.
  - `ogre-desktop/src/lib/browser-actions.test.ts:1-20` — Mock setup for browser-actions tests. Shows the pattern for mocking multiple modules and setting up mock return values.

  **WHY Each Reference Matters**:
  - `playwright-executor.test.ts`: This is the test file being REPLACED. New tests must cover the same scenarios with same rigor.
  - `agent-loop.test.ts:3-22`: Shows the project's standard mock pattern for Tauri API calls.
  - `browser-actions.test.ts:1-20`: Shows how multiple module mocks are combined in this project.

  **Acceptance Criteria**:
  - [ ] File `ogre-desktop/src/lib/cdp-client.test.ts` exists
  - [ ] File `ogre-desktop/src/lib/cdp-actions.test.ts` exists
  - [ ] `npx vitest run src/lib/cdp-client.test.ts` — all tests pass
  - [ ] `npx vitest run src/lib/cdp-actions.test.ts` — all tests pass
  - [ ] cdp-client tests cover: connect-fail, disconnect-safe, isConnected-initial, send-when-disconnected
  - [ ] cdp-actions tests cover: all 5 pw* functions when disconnected, connectCDP invoke call, cdpScreenshot format
  - [ ] Tests use `vi.mock` (not real network calls)

  **QA Scenarios:**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: cdp-client.test.ts and cdp-actions.test.ts exist
    Steps:
      1. Run `npx vitest run src/lib/cdp-client.test.ts` in ogre-desktop/
      2. Run `npx vitest run src/lib/cdp-actions.test.ts` in ogre-desktop/
      3. Assert both exit with code 0 and show all tests passing
    Expected Result: Both test suites pass with 0 failures
    Failure Indicators: Non-zero exit code, test failures, import errors
    Evidence: .sisyphus/evidence/task-4-tests-pass.txt

  Scenario: Full test suite still passes (no regressions)
    Tool: Bash
    Preconditions: All new test files exist
    Steps:
      1. Run `npm run test` in ogre-desktop/
      2. Assert exit code 0
      3. Verify no existing tests broke
    Expected Result: All tests pass including new ones
    Failure Indicators: Any test failure in existing suites
    Evidence: .sisyphus/evidence/task-4-full-suite.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-tests-pass.txt — individual test suite output
  - [ ] task-4-full-suite.txt — full npm test output

  **Commit**: YES (grouped with Wave 2)
  - Message: `test(agent): add unit tests for CDP client and actions`
  - Files: `ogre-desktop/src/lib/cdp-client.test.ts`, `ogre-desktop/src/lib/cdp-actions.test.ts`
  - Pre-commit: `cd ogre-desktop && npm run test`

### Wave 3 — Integration + Cleanup (After Wave 2)

- [x] 5. Swap Integration — Replace Playwright with CDP in `browser-actions.ts`

  **What to do**:
  - Modify `ogre-desktop/src/lib/browser-actions.ts` line 20:
    - Change: `import { isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll } from './playwright-executor'`
    - To: `import { isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll } from './cdp-actions'`
    - This is the ONLY change needed in browser-actions.ts — the function signatures are identical
  - Modify `ogre-desktop/src/lib/browser-actions.test.ts`:
    - Update any `vi.mock('./playwright-executor')` to `vi.mock('./cdp-actions')`
    - Update any import references from `playwright-executor` to `cdp-actions`
  - Remove `playwright-core` from `ogre-desktop/package.json`:
    - Delete the `playwright-core` entry from `devDependencies`
    - Run `npm install` to update `package-lock.json`
  - Remove playwright-core exclusion from `ogre-desktop/vite.config.js`:
    - Delete the `optimizeDeps: { exclude: ['playwright-core'] }` block
    - Resulting config: just `plugins: [svelte()]`
  - Delete old Playwright files:
    - Delete `ogre-desktop/src/lib/playwright-executor.ts`
    - Delete `ogre-desktop/src/lib/playwright-executor.test.ts`
  - Verify: `grep -r 'playwright-executor' ogre-desktop/src/lib/` returns zero matches
  - Verify: `grep 'playwright-core' ogre-desktop/package.json` returns zero matches

  **Must NOT do**:
  - Do NOT change ANY function signatures in browser-actions.ts
  - Do NOT modify the `executeAction` dispatcher logic — only the import path changes
  - Do NOT modify `agent-types.ts`
  - Do NOT touch batch grading code
  - Do NOT remove html2canvas or ensureHtml2CanvasLoaded

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Import path swap + file deletion + config cleanup. No logic changes. Purely mechanical.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Tasks 3, 4 complete)
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 3 (cdp-actions.ts), Task 4 (tests pass)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:20` — The import line to change. ONLY this line changes in browser-actions.ts.
  - `ogre-desktop/src/lib/browser-actions.ts:362-376` — The dispatch logic. Read it to confirm it only calls: `isConnected()`, `pwClick()`, `pwType()`, `pwReadText()`, `pwWaitFor()`, `pwScroll()`. These are the exact exports from cdp-actions.ts.
  - `ogre-desktop/src/lib/browser-actions.test.ts:1-20` — Mock references to update from playwright-executor to cdp-actions.
  - `ogre-desktop/vite.config.js` — Full file (9 lines). Remove the `optimizeDeps` block.
  - `ogre-desktop/package.json` — Find `playwright-core` in devDependencies. Remove it.

  **WHY Each Reference Matters**:
  - `browser-actions.ts:20`: This is THE integration point. One import line change swaps the entire executor.
  - `browser-actions.test.ts`: Test mocks reference playwright-executor — must update to cdp-actions.
  - `vite.config.js`: The exclude was only needed because playwright-core can't be bundled. No longer needed.

  **Acceptance Criteria**:
  - [ ] `browser-actions.ts` line 20 imports from `./cdp-actions` (not `./playwright-executor`)
  - [ ] `playwright-executor.ts` and `playwright-executor.test.ts` are DELETED
  - [ ] `grep -r 'playwright-executor' ogre-desktop/src/lib/` returns zero matches
  - [ ] `grep 'playwright-core' ogre-desktop/package.json` returns zero matches
  - [ ] `vite.config.js` has no `optimizeDeps.exclude` for playwright-core
  - [ ] `npm run test` passes in ogre-desktop/ (all tests still green)
  - [ ] `npm run build` succeeds in ogre-desktop/ (no bundling errors)

  **QA Scenarios:**

  ```
  Scenario: Build succeeds without playwright-core
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run `npm run build` in ogre-desktop/
      2. Assert exit code 0
      3. Verify no 'playwright' in build output warnings/errors
    Expected Result: Clean build with no playwright references
    Failure Indicators: Build error mentioning playwright, missing module
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: Zero playwright references remain
    Tool: Bash
    Preconditions: Files deleted, imports swapped
    Steps:
      1. Run `grep -r 'playwright-executor' ogre-desktop/src/lib/`
      2. Run `grep -r 'playwright-core' ogre-desktop/src/lib/`
      3. Run `grep 'playwright-core' ogre-desktop/package.json`
      4. Assert all return zero matches
    Expected Result: No trace of playwright in source or config
    Failure Indicators: Any grep returning matches
    Evidence: .sisyphus/evidence/task-5-no-playwright.txt

  Scenario: All tests still pass after swap
    Tool: Bash
    Preconditions: Import swapped, old files deleted
    Steps:
      1. Run `npm run test` in ogre-desktop/
      2. Assert exit code 0
    Expected Result: All tests pass (existing + new CDP tests)
    Failure Indicators: Test failures, import errors
    Evidence: .sisyphus/evidence/task-5-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-build.txt — build output
  - [ ] task-5-no-playwright.txt — grep verification
  - [ ] task-5-tests.txt — test output

  **Commit**: YES (Wave 3)
  - Message: `refactor(agent): swap browser-actions to CDP client, remove playwright dependency`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/browser-actions.test.ts`, `ogre-desktop/vite.config.js`, `ogre-desktop/package.json`, deleted `playwright-executor.ts`, deleted `playwright-executor.test.ts`
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`

- [x] 6. CDP Screenshot Path in `browser.ts`

  **What to do**:
  - Modify `ogre-desktop/src/lib/browser.ts` function `captureWebviewScreenshot()` (line 254):
    - Import `isConnected` and `cdpScreenshot` from `./cdp-actions` at the top of the file
    - Add a CDP-first path at the beginning of `captureWebviewScreenshot()`:
      ```
      // Try CDP screenshot first (native, no CDN dependency)
      if (isConnected()) {
        try {
          return await cdpScreenshot();
        } catch {
          // Fall through to html2canvas
        }
      }
      ```
    - The existing html2canvas path below remains UNTOUCHED as fallback
    - This means: when CDP is connected, screenshots are native (no CDN needed). When not connected, html2canvas works as before.
  - This is a small, surgical change: ~8 lines added at the top of one function, plus 1 import line.

  **Must NOT do**:
  - Do NOT remove `ensureHtml2CanvasLoaded()` or the html2canvas fallback path
  - Do NOT modify `captureWebviewArea()` or `cropImageData()`
  - Do NOT replace `evalScript`/`evalScriptJSON` with CDP calls
  - Do NOT modify any other function in browser.ts
  - Do NOT change the return type — still returns `Promise<string>` (data URL)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 8 lines of code added to one function + 1 import. Purely additive. No logic changes to existing code.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5, after Task 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 3 (cdp-actions.ts — needs `cdpScreenshot` export), Task 5 (must complete first since it removes playwright-executor which browser.ts doesn't depend on, but cleanup order matters)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser.ts:254-280` — `captureWebviewScreenshot()` function. The CDP try-catch block goes at lines 255-261 (before `ensureHtml2CanvasLoaded()`). Do NOT modify lines 256-280 (the html2canvas path).
  - `ogre-desktop/src/lib/cdp-actions.ts` — Task 3 output. Import `cdpScreenshot` and `isConnected` from here.
  - `ogre-desktop/src/lib/browser.ts:223-238` — `ensureHtml2CanvasLoaded()`. Must be PRESERVED. The CDP path is an optimization, not a replacement.

  **WHY Each Reference Matters**:
  - `browser.ts:254-280`: This is the exact function to modify. Adding CDP at the top preserves the entire fallback chain.
  - `cdp-actions.ts`: Source of `cdpScreenshot()` — returns same format (`data:image/jpeg;base64,...`).

  **Acceptance Criteria**:
  - [ ] `captureWebviewScreenshot()` tries CDP screenshot first when `isConnected()` is true
  - [ ] Falls back to html2canvas when CDP is not connected
  - [ ] Falls back to html2canvas when CDP screenshot throws
  - [ ] `ensureHtml2CanvasLoaded()` is NOT removed
  - [ ] Return type unchanged: `Promise<string>`
  - [ ] TypeScript compiles: `npx tsc --noEmit`
  - [ ] `npm run test` passes

  **QA Scenarios:**

  ```
  Scenario: html2canvas fallback preserved when CDP unavailable
    Tool: Bash (vitest)
    Preconditions: browser.ts modified, cdp-actions mocked as disconnected
    Steps:
      1. Mock isConnected() to return false
      2. Mock evalScript/evalScriptJSON for html2canvas path
      3. Call captureWebviewScreenshot()
      4. Assert html2canvas path was used (evalScript called)
      5. Assert cdpScreenshot was NOT called
    Expected Result: Falls back to html2canvas when CDP unavailable
    Failure Indicators: cdpScreenshot called when not connected, or function throws
    Evidence: .sisyphus/evidence/task-6-fallback.txt

  Scenario: TypeScript compiles with browser.ts changes
    Tool: Bash
    Preconditions: browser.ts modified
    Steps:
      1. Run `npx tsc --noEmit` in ogre-desktop/
      2. Assert exit code 0
    Expected Result: No type errors
    Failure Indicators: Type errors in browser.ts
    Evidence: .sisyphus/evidence/task-6-typecheck.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-fallback.txt — fallback test output
  - [ ] task-6-typecheck.txt — TypeScript compilation output

  **Commit**: YES (grouped with Wave 3)
  - Message: `feat(agent): CDP screenshot path with html2canvas fallback`
  - Files: `ogre-desktop/src/lib/browser.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction. Verify `executeAction` signature unchanged. Verify `ActionResult` contract preserved.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Build + Test Verification** — `unspecified-high`
  Run `npm run build` (vite) — must succeed without playwright-core. Run `npm run test` — all tests pass. Run `cargo check` in src-tauri. Verify `grep -r "playwright-executor" ogre-desktop/src/lib/` returns zero. Verify `grep "playwright-core" ogre-desktop/package.json` returns zero.
  Output: `Build [PASS/FAIL] | Tests [N/N] | Playwright refs [N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance (no accessibility tree, no auto-reconnect, no batch-grader changes, html2canvas preserved). Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1+2**: `feat(agent): add thin CDP WebSocket client replacing playwright-core` — cdp-client.ts, cdp-actions.ts, tests, lib.rs
- **Wave 3**: `refactor(agent): swap browser-actions to CDP client, remove playwright dependency` — browser-actions.ts, browser.ts, vite.config.js, package.json, deleted files

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run test   # Expected: all tests pass
cd ogre-desktop && npm run build  # Expected: build succeeds, no playwright references
cd ogre-desktop/src-tauri && cargo check  # Expected: compiles clean
grep -r "playwright-executor" ogre-desktop/src/lib/  # Expected: zero matches
grep "playwright-core" ogre-desktop/package.json      # Expected: zero matches
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All existing tests still pass
- [x] New CDP modules have zero npm dependencies
- [x] Agent Mode uses real input events via CDP when connected
- [x] Screenshots use native CDP capture when available, html2canvas fallback otherwise
- [x] evalScript fallback works when CDP is not connected
- [x] No playwright references remain in source code
