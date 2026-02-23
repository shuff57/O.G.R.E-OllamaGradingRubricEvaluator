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
- [ ] `npm run build` in ogre-desktop succeeds without playwright-core
- [ ] `npm run test` in ogre-desktop passes — all existing + new tests green
- [ ] `grep -r "playwright-executor" ogre-desktop/src/lib/` returns zero matches
- [ ] `grep "playwright-core" ogre-desktop/package.json` returns zero matches
- [ ] New CDP modules have zero npm dependencies (browser-native WebSocket only)
- [ ] `cdp-client.ts` + `cdp-actions.ts` combined ≤ 400 lines
- [ ] `captureWebviewScreenshot()` still works when CDP is not connected (html2canvas fallback)
- [ ] `cargo check` succeeds in `ogre-desktop/src-tauri/`

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

- [ ] 1. Build `cdp-client.ts` — Thin CDP WebSocket Client

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

- [ ] 2. Modify `lib.rs` — Dynamic CDP Port Allocation + Tauri Command

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
---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction. Verify `executeAction` signature unchanged. Verify `ActionResult` contract preserved.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Build + Test Verification** — `unspecified-high`
  Run `npm run build` (vite) — must succeed without playwright-core. Run `npm run test` — all tests pass. Run `cargo check` in src-tauri. Verify `grep -r "playwright-executor" ogre-desktop/src/lib/` returns zero. Verify `grep "playwright-core" ogre-desktop/package.json` returns zero.
  Output: `Build [PASS/FAIL] | Tests [N/N] | Playwright refs [N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
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
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All existing tests still pass
- [ ] New CDP modules have zero npm dependencies
- [ ] Agent Mode uses real input events via CDP when connected
- [ ] Screenshots use native CDP capture when available, html2canvas fallback otherwise
- [ ] evalScript fallback works when CDP is not connected
- [ ] No playwright references remain in source code
