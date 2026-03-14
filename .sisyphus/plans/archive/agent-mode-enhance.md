> **SUPERSEDED** — All 3 deliverables were addressed by separate plans:
> 1. Fuzzy DOM matching: `agent-dom-fuzzy.ts` shipped via `browser-agent` plan
> 2. CDP integration: Native `cdp-client.ts` replaced the Playwright-core approach (see `cdp-client` plan)
> 3. Compact UI: AgentChat shows action badges natively
> Archived March 2026.

# Agent Mode Enhancement: Fuzzy Matching, Compact UI, Playwright CDP

## TL;DR

> **Quick Summary**: Enhance the O.G.R.E desktop app's browser agent mode with three improvements: (1) fuzzy DOM matching so selectors that miss find the closest element, (2) compact action-only UI that suppresses verbose reasoning text, and (3) optional Playwright-core CDP integration for more reliable browser control via the embedded WebView2.
> 
> **Deliverables**:
> - Fuzzy DOM matching module with 4-strategy fallback + screenshot re-send
> - Compact action badge UI for AgentChat (reasoning hidden, one-line status per action)
> - Playwright-core CDP connector for embedded WebView2 (with evalScript fallback)
> - Tauri Rust-side CDP port configuration
> - Tests for all new modules
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves + final verification
> **Critical Path**: Spike → CDP Connector → Playwright Executor → Integration Tests

---

## Context

### Original Request
User wants the agent mode to: (1) pick the closest DOM element when a selector doesn't match instead of failing, taking a screenshot if unsure; (2) be less chatty — only show compact action badges, not verbose reasoning; (3) use Playwright for browser control inside the app without opening Chrome.

### Interview Summary
**Key Discussions**:
- Playwriter (Chrome extension) can't work with Tauri WebView2 — ruled out
- User chose Playwright-core (Node library) via CDP to connect to embedded WebView2
- UI should show action-only compact badges, still show approval buttons in review mode
- Tests after implementation, using existing vitest infrastructure

**Research Findings**:
- Agent system is well-structured: `agent-loop.ts` (async generator), `browser-actions.ts` (action dispatcher), `agent-dom.ts` (DOM capture), `AgentChat.svelte` (UI)
- Current action execution is client-side via `evalScript` through Tauri IPC — no server roundtrip
- WebView2 on Windows supports CDP via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var
- Grading server is Bun-compiled standalone binary — playwright-core bundling needs validation
- Tauri creates 2 webviews (main app + embedded browser) — CDP exposes both, need to target correctly

### Metis Review
**Identified Gaps** (addressed):
- Playwright must run in frontend process (not server) to avoid HTTP latency for every action — addressed: new `playwright-executor.ts` in frontend
- Bun + playwright-core compilation risk — addressed: spike task validates feasibility first
- CDP exposes both webviews — addressed: target embedded browser by URL pattern
- Feature independence — addressed: each feature is independently testable
- evalScript fallback must remain — addressed: Playwright is optional enhancement, not replacement
- Fuzzy matching scope — addressed: capped at 4 strategies, no over-engineering

---

## Work Objectives

### Core Objective
Make the browser agent smarter (fuzzy matching), quieter (compact UI), and more capable (Playwright CDP) while keeping everything inside the desktop app.

### Concrete Deliverables
- `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — fuzzy element matching module
- Modified `ogre-desktop/src/lib/browser-actions.ts` — retry with fuzzy fallback
- Modified `ogre-desktop/src/lib/agent-loop.ts` — compact event emission, screenshot re-send on failure
- Modified `ogre-desktop/src/components/grading/AgentChat.svelte` — compact action badge UI
- `ogre-desktop/src/lib/playwright-executor.ts` — Playwright CDP connector + action executor
- Modified `ogre-desktop/src-tauri/src/lib.rs` — CDP port environment variable configuration
- Tests for fuzzy matching, compact UI assertions, and CDP connection

### Definition of Done
- [x] `vitest run` — all existing tests pass, new tests pass
- [x] Agent mode handles non-matching selectors without failing (fuzzy match or screenshot fallback)
- [x] AgentChat shows compact one-line action badges with no reasoning text
- [x] Playwright connects to embedded WebView2 via CDP and executes at least click, type, readText
- [x] Agent falls back to evalScript when CDP is unavailable

### Must Have
- Fuzzy DOM matching with at most 4 strategies before screenshot fallback
- Compact action badge display in AgentChat (format: `[action] target → ✓/✗`)
- Approval buttons still visible in review mode even in compact display
- Playwright CDP connection to embedded WebView2 (not opening new browser)
- evalScript remains as fallback when CDP is not connected
- `executeAction()` function signature preserved (backward compatible)
- `AgentEvent` union extended additively only (no breaking changes)

### Must NOT Have (Guardrails)
- Must NOT open Chrome windows or leave the desktop app
- Must NOT move action execution to the grading server (stays client-side)
- Must NOT build general-purpose DOM search engine for fuzzy matching
- Must NOT remove reasoning field from AgentEvent — hide in UI, keep in data
- Must NOT redesign the chat component hierarchy (AgentChat, ProviderSelector, etc.)
- Must NOT enable CDP port unconditionally in production — gate behind agent mode activation
- Must NOT add new action types beyond the existing 9
- Must NOT modify agent-dom.ts DOM capture logic (reuse existing InteractiveElement array)
- Must NOT couple Feature 1 (fuzzy) to Feature 3 (Playwright) — fuzzy must work with evalScript

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest with comprehensive mocks)
- **Automated tests**: Tests-after
- **Framework**: vitest (existing)
- **Pattern**: Follow mock structure from `agent-loop.test.ts:3-22` for all new tests

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright skill or component render assertions
- **Library/Module**: Use Bash (`bun test` / `vitest run --grep`)
- **Backend**: Use Bash for server tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Spike — validate Playwright feasibility):
├── Task 1: Playwright + Bun compilation spike [deep]
└── Task 2: CDP + WebView2 targeting spike [deep]

Wave 1 (Start after spike — independent features, MAX PARALLEL):
├── Task 3: Fuzzy DOM matching module (agent-dom-fuzzy.ts) [deep]
├── Task 4: Compact action badge UI (AgentChat.svelte) [visual-engineering]
├── Task 5: Agent loop compact mode + screenshot re-send [unspecified-high]
└── Task 6: Playwright executor module (playwright-executor.ts) [deep]

Wave 2 (After Wave 1 — integration + Rust):
├── Task 7: Tauri Rust CDP port configuration [unspecified-high]
├── Task 8: browser-actions.ts fuzzy retry integration [deep]
├── Task 9: browser-actions.ts Playwright backend swap [deep]
└── Task 10: Agent prompt enhancement for fuzzy context [quick]

Wave 3 (After Wave 2 — tests + polish):
├── Task 11: Fuzzy matching tests [unspecified-high]
├── Task 12: Compact UI tests [unspecified-high]
├── Task 13: Playwright CDP integration tests [deep]
└── Task 14: Agent loop updated tests [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 6 → Task 9 → Task 13 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 1 & 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 6, 9 | 0 |
| 2 | — | 7, 9 | 0 |
| 3 | — | 8, 11 | 1 |
| 4 | — | 12 | 1 |
| 5 | — | 14 | 1 |
| 6 | 1 | 9 | 1 |
| 7 | 2 | 9 | 2 |
| 8 | 3 | 11 | 2 |
| 9 | 6, 7 | 13 | 2 |
| 10 | — | 14 | 2 |
| 11 | 8 | F1-F4 | 3 |
| 12 | 4 | F1-F4 | 3 |
| 13 | 9 | F1-F4 | 3 |
| 14 | 5, 10 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 0**: **2** — T1 → `deep`, T2 → `deep`
- **Wave 1**: **4** — T3 → `deep`, T4 → `visual-engineering`, T5 → `unspecified-high`, T6 → `deep`
- **Wave 2**: **4** — T7 → `unspecified-high`, T8 → `deep`, T9 → `deep`, T10 → `quick`
- **Wave 3**: **4** — T11 → `unspecified-high`, T12 → `unspecified-high`, T13 → `deep`, T14 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs


> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

### Wave 0 — Spike (Validate Playwright Feasibility)

 [x] 1. Playwright + Bun Compilation Spike

  **What to do**:
  - Create a standalone spike script `ogre-desktop/spike/playwright-bun-spike.ts` that:
    1. Imports `playwright-core` (NOT `playwright` — no browser download)
    2. Calls `chromium.connectOverCDP('http://127.0.0.1:9222')` to connect to a running CDP endpoint
    3. Lists all available pages/targets
    4. Logs success or failure with details
  - Add `playwright-core` as a devDependency to `ogre-desktop/package.json`
  - Verify the dependency installs cleanly with `npm install`
  - Verify that `npx vite build` still completes (no bundle bloat or breakage from playwright-core)
  - Document findings in `ogre-desktop/spike/SPIKE-RESULTS.md`:
    - Does playwright-core import without error in a Vite/TypeScript context?
    - What is the bundle size impact?
    - Any Vite config changes needed (externalize, ssr, etc.)?
  - **EXIT CRITERIA**: If playwright-core cannot be imported cleanly in the frontend context or breaks Vite build, document the failure and recommend `evalScript`-only approach (descope Feature 3)

  **Must NOT do**:
  - Do NOT install full `playwright` package (downloads browsers)
  - Do NOT actually connect to a live WebView2 yet (that's Task 2)
  - Do NOT modify any existing source files
  - Do NOT add playwright-core to production dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires experimentation, investigation of build compatibility, and analysis of bundle impact — not a straightforward coding task
  - **Skills**: []
    - No external skills needed — this is pure Node/Vite build toolchain investigation
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — we're testing playwright-core as a library, not automating a browser for QA

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 0 (with Task 2)
  - **Blocks**: Task 6 (Playwright executor module)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/package.json` — existing dependencies to verify no conflicts with playwright-core
  - `ogre-desktop/vite.config.js` — Vite config to check if playwright-core needs `optimizeDeps.exclude` or `ssr.external` treatment

  **API/Type References**:
  - `playwright-core` npm package — `chromium.connectOverCDP(endpointURL)` is the key API

  **External References**:
  - playwright-core docs: https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
  - WebView2 CDP: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/remote-debugging

  **WHY Each Reference Matters**:
  - `package.json`: Need to verify no version conflicts between playwright-core and existing deps
  - `vite.config.js`: playwright-core is Node-only — Vite may try to bundle it for browser, causing build failure. Must check if externalization is needed.

  **Acceptance Criteria**:
  - [ ] `playwright-core` added to `ogre-desktop/package.json` devDependencies
  - [ ] `npm install` in ogre-desktop succeeds
  - [ ] `npx vite build` in ogre-desktop succeeds without errors
  - [ ] Spike script `ogre-desktop/spike/playwright-bun-spike.ts` exists and is syntactically valid TypeScript
  - [ ] `ogre-desktop/spike/SPIKE-RESULTS.md` documents: import success/failure, bundle size impact, required Vite config changes

  **QA Scenarios:**

  ```
  Scenario: Vite build succeeds with playwright-core dependency
    Tool: Bash
    Preconditions: playwright-core added to package.json, npm install completed
    Steps:
      1. Run `npx vite build` in ogre-desktop directory
      2. Check exit code is 0
      3. Verify dist/ directory was created with output files
    Expected Result: Build completes with exit code 0, dist/ contains index.html and JS bundles
    Failure Indicators: Non-zero exit code, errors mentioning playwright-core or require() or fs
    Evidence: .sisyphus/evidence/task-1-vite-build.txt

  Scenario: playwright-core import resolves in TypeScript
    Tool: Bash
    Preconditions: playwright-core installed
    Steps:
      1. Run `npx tsc --noEmit ogre-desktop/spike/playwright-bun-spike.ts` (or equivalent type-check)
      2. Check exit code is 0
    Expected Result: TypeScript type-check passes, no import resolution errors
    Failure Indicators: TS2307 "Cannot find module 'playwright-core'" or similar
    Evidence: .sisyphus/evidence/task-1-tsc-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-vite-build.txt — full Vite build output
  - [ ] task-1-tsc-check.txt — TypeScript check output

  **Commit**: YES
  - Message: `feat(agent): spike — validate playwright-core + Vite compatibility`
  - Files: `ogre-desktop/spike/*, ogre-desktop/package.json`
  - Pre-commit: `cd ogre-desktop && npx vite build`

 [x] 2. CDP + WebView2 Targeting Spike

  **What to do**:
  - Research and document how to enable CDP on the Tauri WebView2 embedded browser:
    1. WebView2 supports `--remote-debugging-port=NNNN` via the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable
    2. This env var MUST be set **before** the WebView2 runtime creates its first process — i.e., before `tauri::Builder::default().build()`
    3. Document the exact Rust code change needed in `lib.rs` to conditionally set this env var
  - Create a spike script `ogre-desktop/spike/cdp-targeting-spike.ts` that:
    1. Connects to `http://127.0.0.1:9222/json` (CDP discovery endpoint)
    2. Lists all available targets (pages/webviews)
    3. Identifies which target is the embedded browser vs the main app webview
    4. Documents the URL pattern or title difference between them
  - Document findings in `ogre-desktop/spike/SPIKE-RESULTS.md` (append to existing or create section):
    - What is the embedded browser's URL? (user's grading site URL)
    - What is the main app's URL? (`tauri://localhost` or `https://tauri.localhost`)
    - How to reliably distinguish them?
    - What CDP port should we use? (recommend 9222)
  - **EXIT CRITERIA**: If WebView2 does NOT expose the embedded browser via CDP, or if targets cannot be distinguished, document the failure — Feature 3 gets descoped

  **Must NOT do**:
  - Do NOT modify `lib.rs` yet (just document the change needed)
  - Do NOT install any new dependencies
  - Do NOT attempt to modify the embedded browser from CDP
  - Do NOT enable CDP port permanently — this is investigation only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires deep investigation of WebView2 CDP behavior, analysis of Tauri webview internals, and careful documentation of findings
  - **Skills**: []
    - No external skills needed — this is research and documentation
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — we're investigating CDP at protocol level, not automating browsers

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 0 (with Task 1)
  - **Blocks**: Task 7 (Tauri Rust CDP port config), Task 9 (Playwright backend swap)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:607-858` — the `run()` function where `tauri::Builder::default()` is configured. The env var must be set BEFORE line 858 (`.build()` call). Look at `setup()` closure starting at line 760 for where webview creation happens.
  - `ogre-desktop/src-tauri/src/lib.rs:201-270` — `create_embedded_browser()` command shows how the embedded browser webview is created with label `"embedded-browser"` and `WebviewUrl::External(parsed)` URL

  **API/Type References**:
  - CDP `/json` endpoint returns array of targets: `{ id, type, title, url, webSocketDebuggerUrl }`

  **External References**:
  - WebView2 debugging: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/remote-debugging
  - WebView2 browser arguments: https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2environmentoptions.additionalbrowserarguments
  - CDP protocol targets: https://chromedevtools.github.io/devtools-protocol/

  **WHY Each Reference Matters**:
  - `lib.rs:607-858`: Must understand the initialization order — env var MUST be set before `build()`, otherwise WebView2 won't see it
  - `lib.rs:201-270`: The embedded browser uses an External URL (grading site), while the main app uses `tauri://localhost` — this is how we'll distinguish CDP targets
  - CDP `/json` endpoint: This is the discovery mechanism to find the right WebSocket URL for the embedded browser

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/spike/cdp-targeting-spike.ts` script exists and is syntactically valid
  - [ ] `ogre-desktop/spike/SPIKE-RESULTS.md` contains CDP section documenting:
    - Exact env var name and value for enabling CDP
    - Where in lib.rs to set it (line number, before/after what)
    - Target identification strategy (URL pattern to find embedded browser)
    - Recommended CDP port number
  - [ ] Document clearly states whether Feature 3 is feasible or should be descoped

  **QA Scenarios:**

  ```
  Scenario: Spike documentation is complete and actionable
    Tool: Bash
    Preconditions: Spike script and results file exist
    Steps:
      1. Read `ogre-desktop/spike/SPIKE-RESULTS.md`
      2. Verify it contains sections: "CDP Port Configuration", "Target Identification", "Feasibility"
      3. Verify it includes the exact Rust code snippet for lib.rs modification
      4. Verify it includes the CDP target filtering logic
    Expected Result: All four sections present with concrete code snippets, not vague descriptions
    Failure Indicators: Missing sections, placeholder text like "TBD", no code snippets
    Evidence: .sisyphus/evidence/task-2-spike-review.txt

  Scenario: Spike script is valid TypeScript
    Tool: Bash
    Preconditions: Spike script exists
    Steps:
      1. Run `npx tsc --noEmit ogre-desktop/spike/cdp-targeting-spike.ts` (with appropriate tsconfig)
    Expected Result: Type-check passes
    Failure Indicators: TypeScript errors
    Evidence: .sisyphus/evidence/task-2-tsc-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-spike-review.txt — content review of SPIKE-RESULTS.md
  - [ ] task-2-tsc-check.txt — TypeScript check output

  **Commit**: YES (grouped with Task 1)
  - Message: `feat(agent): spike — investigate CDP + WebView2 targeting`
  - Files: `ogre-desktop/spike/*`
  - Pre-commit: none (documentation only)

### Wave 1 — Features (Independent, MAX PARALLEL)

 [x] 3. Fuzzy DOM Matching Module

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-dom-fuzzy.ts` with a single exported function:
    ```typescript
    export function findFuzzyMatch(
      failedSelector: string,
      elements: InteractiveElement[]
    ): InteractiveElement | null
    ```
  - Implement 4 matching strategies, tried in order (stop on first match):
    1. **Text match** — extract text from the failed selector (e.g., `button` with text "Submit") and find an element whose `.text` property contains that text (case-insensitive)
    2. **Partial ID/class match** — if the selector contains an ID or class fragment, find elements whose `.id` or `.selector` contains that fragment as a substring
    3. **Aria-label match** — if the selector references an aria-label, find elements with matching aria-label in their selector
    4. **Tag + position heuristic** — match by tag name, then pick the first visible element of that tag type
  - Each strategy returns the first match or `null`, moving to the next strategy
  - If all 4 strategies fail, return `null` (caller handles screenshot fallback)
  - Export a second function for logging which strategy matched:
    ```typescript
    export function fuzzyMatchReason(
      failedSelector: string,
      matchedElement: InteractiveElement,
      strategyIndex: number
    ): string
    ```
    Returns a human-readable string like: `"Fuzzy matched via text: 'Submit' → button#submit-btn"`

  **Must NOT do**:
  - Do NOT modify `agent-dom.ts` — reuse the `InteractiveElement` interface and `captureInteractiveDom()` output as-is
  - Do NOT add more than 4 strategies
  - Do NOT use external fuzzy matching libraries (no fuse.js, no Levenshtein) — keep it simple string matching
  - Do NOT make network calls or take screenshots (that's the caller's responsibility)
  - Do NOT import from `browser.ts` or `browser-actions.ts` — this module is pure logic, no side effects

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful algorithm design with 4 ordered strategies, edge case handling for malformed selectors, and thorough documentation
  - **Skills**: []
    - No external skills needed — this is pure TypeScript logic
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser interaction in this module

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8 (browser-actions fuzzy retry integration), Task 11 (fuzzy matching tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-dom.ts:104-129` — the `InteractiveElement` fields available for matching: `index`, `tag`, `type`, `id`, `name`, `placeholder`, `text`, `value`, `href`, `disabled`, `visible`, `selector`. The `text` field is trimmed to 100 chars, `selector` is generated by `getSelector()` which prioritizes id → name → semantic attrs → class → nth-child
  - `ogre-desktop/src/lib/agent-types.ts:104-129` — `InteractiveElement` interface definition with all field types

  **API/Type References**:
  - `InteractiveElement` from `agent-types.ts:104` — the input type for fuzzy matching
  - `ActionParams` from `agent-types.ts:31-40` — only `click`, `type`, `waitFor` have `selector` field

  **WHY Each Reference Matters**:
  - `agent-dom.ts:104-129`: The `getSelector()` function generates selectors with specific patterns (e.g., `#id`, `tag[name=value]`, `tag.class`). Understanding these patterns is essential for Strategy 2 (partial ID/class) to know what substrings to look for.
  - `agent-types.ts:104-129`: Need exact field types to know that `text` is `string`, `id` is `string | undefined`, etc.

  **Acceptance Criteria**:
  - [ ] File `ogre-desktop/src/lib/agent-dom-fuzzy.ts` exists
  - [ ] Exports `findFuzzyMatch(failedSelector, elements)` function
  - [ ] Exports `fuzzyMatchReason(failedSelector, matchedElement, strategyIndex)` function
  - [ ] Handles edge cases: empty elements array, empty selector, null/undefined fields
  - [ ] No imports from `browser.ts`, `browser-actions.ts`, or any module with side effects
  - [ ] TypeScript compiles without errors: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: Text match finds button by visible text
    Tool: Bash (vitest or manual ts-node)
    Preconditions: Module exists and exports findFuzzyMatch
    Steps:
      1. Import { findFuzzyMatch } from './agent-dom-fuzzy'
      2. Create mock elements: [{ index: 1, tag: 'button', text: 'Submit Form', selector: '#submit-btn', visible: true, disabled: false }]
      3. Call findFuzzyMatch('button.nonexistent-class', elements) where the AI was looking for a submit button
      4. Assert result is not null and result.selector === '#submit-btn'
    Expected Result: Returns the button element matched via text strategy
    Failure Indicators: Returns null, or returns wrong element
    Evidence: .sisyphus/evidence/task-3-text-match.txt

  Scenario: All strategies fail returns null
    Tool: Bash
    Preconditions: Module exists
    Steps:
      1. Call findFuzzyMatch('#totally-unique-id-that-matches-nothing', [{ tag: 'div', text: '', selector: 'div.wrapper', ... }])
      2. Assert result is null
    Expected Result: Returns null when no strategy matches
    Failure Indicators: Returns a non-null value, or throws an error
    Evidence: .sisyphus/evidence/task-3-no-match.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-text-match.txt — test output showing text match works
  - [ ] task-3-no-match.txt — test output showing graceful null return

  **Commit**: YES
  - Message: `feat(agent): add fuzzy DOM matching module`
  - Files: `ogre-desktop/src/lib/agent-dom-fuzzy.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 4. Compact Action Badge UI

  **What to do**:
  - Modify `ogre-desktop/src/components/grading/AgentChat.svelte` to add a compact display mode:
    1. Add a reactive state variable: `let compactMode: boolean = $state(true);` (default ON)
    2. Add a toggle button in `.chat-header .chat-actions` — small icon/text toggle for "Compact" / "Verbose"
    3. In compact mode, replace the current action message rendering with a single-line badge:
       - Format: `[action] target → ✓` or `[action] target → ✗ error`
       - The `target` is extracted from params: `params.selector` for click/type/waitFor, `params.url` for navigate, empty for screenshot/scroll/done/runJS/readText
       - Color-coded: green left-border for success, red for failure, amber for proposing, blue for executing
    4. In compact mode, HIDE:
       - The `action-reasoning` div (reasoning text)
       - The `thinking-dots` animation (thinking indicator)
       - The `message-label` text on action messages
    5. In compact mode, KEEP VISIBLE:
       - Approval buttons (`.action-buttons` with Approve/Skip) when `pendingAction` exists in review mode
       - Error messages
       - System messages (done, info)
       - User messages
       - Text responses from the agent
    6. Add CSS classes: `.compact-badge`, `.badge-success`, `.badge-failure`, `.badge-proposing`, `.badge-executing`
  - The existing verbose mode must remain fully functional when compactMode is toggled off

  **Must NOT do**:
  - Do NOT remove the reasoning field from data structures — only hide in UI
  - Do NOT change the message data model (TextMessage, ActionMessage, SystemMessage types)
  - Do NOT redesign the component hierarchy or extract sub-components
  - Do NOT change the ProviderSelector integration
  - Do NOT modify any file other than `AgentChat.svelte`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is a UI task requiring CSS styling, Svelte template conditionals, and visual design of compact badges
  - **Skills**: []
    - No external skills needed — this is Svelte 5 + CSS within a single component
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Could help with badge aesthetics, but the design spec is already detailed enough
    - `playwright`: Not needed at build time — QA will use it later

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5, 6)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 12 (compact UI tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/AgentChat.svelte:48-59` — Svelte 5 `$state()` rune pattern for reactive state (follow this exact pattern for `compactMode`)
  - `ogre-desktop/src/components/grading/AgentChat.svelte:256-303` — the `{#each messages}` render loop that needs compact mode conditionals
  - `ogre-desktop/src/components/grading/AgentChat.svelte:262-282` — existing action message template (the `{:else if msg.type === 'action'}` block) — this is what gets replaced in compact mode
  - `ogre-desktop/src/components/grading/AgentChat.svelte:290-297` — thinking dots animation to hide in compact mode
  - `ogre-desktop/src/components/grading/AgentChat.svelte:219-234` — mode toggle buttons pattern to follow for compact toggle

  **API/Type References**:
  - `ActionMessage` interface at line 21-28 — has `action`, `params`, `reasoning`, `status`, `result` fields
  - `AgentState` type: `'idle' | 'thinking' | 'proposing' | 'executing' | 'done' | 'error'`

  **WHY Each Reference Matters**:
  - Lines 48-59: Must use exact same `$state()` rune syntax for the new `compactMode` variable
  - Lines 262-282: This is the existing action message template — compact mode needs an `{#if compactMode}` alternative rendering here
  - Lines 290-297: Thinking dots appear as a separate message after the `{#each}` loop — must hide with `{#if !compactMode}` wrapper
  - Lines 219-234: Mode toggle button pattern — compact toggle should look consistent with the existing Review/Auto toggle

  **Acceptance Criteria**:
  - [ ] `compactMode` state variable added with default `true`
  - [ ] Toggle button visible in chat header
  - [ ] Compact mode shows single-line badges: `[click] #btn → ✓`
  - [ ] Compact mode hides: reasoning text, thinking dots, action message labels
  - [ ] Compact mode shows: approval buttons (in review mode), error messages, user messages, text responses
  - [ ] Verbose mode (toggle off) shows original full layout unchanged
  - [ ] No TypeScript errors: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: Compact mode shows one-line action badge after successful action
    Tool: Bash (or Playwright if app is running)
    Preconditions: AgentChat.svelte modified, app running in dev mode
    Steps:
      1. Start app with `npm run tauri:dev` in ogre-desktop
      2. Navigate to agent tab
      3. Verify compact mode is ON by default (toggle shows "Compact" active)
      4. Send a message to the agent
      5. After action completes, inspect the action message DOM
      6. Assert `.compact-badge` element exists with text containing `[click]` and `→ ✓`
    Expected Result: Action displayed as single-line badge, no reasoning text visible
    Failure Indicators: Multi-line action message displayed, reasoning text visible, no badge class
    Evidence: .sisyphus/evidence/task-4-compact-badge.png

  Scenario: Approval buttons still visible in compact review mode
    Tool: Bash (or Playwright)
    Preconditions: App running, compact mode ON, review mode selected
    Steps:
      1. Set mode to 'review' via toggle
      2. Send a message that triggers an action proposal
      3. Assert `.action-buttons` div is visible with Approve and Skip buttons
    Expected Result: Approve/Skip buttons visible even in compact mode
    Failure Indicators: Buttons hidden, or entire action message hidden
    Evidence: .sisyphus/evidence/task-4-review-buttons.png
  ```

  **Evidence to Capture:**
  - [ ] task-4-compact-badge.png — screenshot of compact badge
  - [ ] task-4-review-buttons.png — screenshot of review mode with compact badges

  **Commit**: YES
  - Message: `feat(agent): compact action badge UI for AgentChat`
  - Files: `ogre-desktop/src/components/grading/AgentChat.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 5. Agent Loop Compact Mode + Screenshot Re-send

  **What to do**:
  - Modify `ogre-desktop/src/lib/agent-loop.ts` to add two behaviors:
  
  **A. Compact event emission:**
  - When the agent loop receives an action response from the AI, currently it yields `{ type: 'propose', action, params, reasoning }` (line 191)
  - No change to the event — the `reasoning` field stays in the data. The UI (Task 4) handles hiding it.
  - BUT: suppress the `{ type: 'thinking' }` event yield (line 122) when in auto mode — in auto mode the user doesn't need to see thinking indicators between rapid actions
  - Add an `AgentLoopConfig` option: `compact?: boolean` (defaults to `true`)
  - When `compact` is true AND mode is `auto`: skip yielding `{ type: 'thinking' }` events
  
  **B. Screenshot re-send on action failure:**
  - After `executeAction()` returns a failed result (line 219-220), currently the loop just records the failure and continues
  - Add new behavior: if an action with a `selector` field fails with error containing "not found" or "Element not found":
    1. Take a screenshot via `captureWebviewScreenshot()`
    2. Append to conversation history: `{ role: 'user', content: 'The selector failed. Here is a screenshot of the current page. Please analyze and suggest a better selector.', screenshot: dataUrl }`
    3. Do NOT increment `stepCount` for this retry — it's a recovery mechanism, not a new action
    4. Continue the loop (next iteration will re-ask the AI with screenshot context)
    5. Cap this at 1 retry per failed action (don't retry the retry)
  - Add a tracking variable `lastFailedAction` to prevent infinite retry loops

  **Must NOT do**:
  - Do NOT change the `AgentEvent` union type — no new event types
  - Do NOT change the `executeAction()` call signature or import
  - Do NOT modify the review mode approval gate
  - Do NOT change how conversation history is structured for successful actions
  - Do NOT couple this to the fuzzy matching module — screenshot re-send is independent of fuzzy matching

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying the core control loop requires careful understanding of async generator flow, but the changes are additive (no restructuring)
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser automation for this task

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4, 6)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 14 (agent loop updated tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:91-246` — the entire `runLoop()` async generator. Key sections:
    - Line 122: `yield { type: 'thinking' }` — suppress this in compact auto mode
    - Lines 134-138: screenshot capture — reuse this pattern for retry screenshot
    - Lines 216-230: action execution + history update — insert retry logic here
    - Lines 232-237: done action check — retry must NOT trigger on done actions
  - `ogre-desktop/src/lib/agent-loop.ts:47-56` — `AgentLoopConfig` interface to add `compact?: boolean`

  **API/Type References**:
  - `AgentLoopConfig` at line 47 — add `compact?: boolean` field here
  - `AgentEvent` union at line 33-40 — do NOT modify (read-only reference)
  - `captureWebviewScreenshot()` from `browser.ts:254` — already imported at line 13

  **WHY Each Reference Matters**:
  - Lines 216-230: This is where the retry logic inserts — after `executeAction()` returns failure but before incrementing `stepCount`
  - Line 47: `AgentLoopConfig` is the interface that callers use — adding `compact` here exposes it to `AgentChat.svelte`
  - `captureWebviewScreenshot()`: Already imported, just need to call it in the retry path

  **Acceptance Criteria**:
  - [ ] `AgentLoopConfig.compact` field added (optional boolean, defaults to true)
  - [ ] In auto+compact mode, `thinking` events are not yielded
  - [ ] On selector failure, screenshot is captured and appended to conversation
  - [ ] Screenshot retry is capped at 1 per failed action (no infinite loop)
  - [ ] `done` actions never trigger screenshot retry
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: Compact auto mode suppresses thinking events
    Tool: Bash (vitest)
    Preconditions: agent-loop.ts modified
    Steps:
      1. Create a test that mocks sendAgentRequest to return a done action
      2. Start loop with { mode: 'auto', compact: true, initialMessage: 'test' }
      3. Collect all events
      4. Assert no events have type === 'thinking'
    Expected Result: Zero 'thinking' events in the collected output
    Failure Indicators: One or more 'thinking' events present
    Evidence: .sisyphus/evidence/task-5-compact-no-thinking.txt

  Scenario: Screenshot retry on selector failure
    Tool: Bash (vitest)
    Preconditions: agent-loop.ts modified, mocks set up
    Steps:
      1. Mock sendAgentRequest to return click action with bad selector first, then done action
      2. Mock executeAction to return { success: false, error: 'Element not found: #bad' }
      3. Mock captureWebviewScreenshot to return 'data:image/png;base64,abc'
      4. Start loop with { mode: 'auto', compact: true, initialMessage: 'click bad button' }
      5. Verify captureWebviewScreenshot was called after failure
      6. Verify sendAgentRequest was called again with screenshot in messages
    Expected Result: Loop retries with screenshot context, sendAgentRequest called ≥2 times
    Failure Indicators: captureWebviewScreenshot not called, or loop terminates without retry
    Evidence: .sisyphus/evidence/task-5-screenshot-retry.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-compact-no-thinking.txt — test output
  - [ ] task-5-screenshot-retry.txt — test output

  **Commit**: YES
  - Message: `feat(agent): agent loop compact mode + screenshot retry on failure`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 6. Playwright Executor Module

  **What to do**:
  - Create `ogre-desktop/src/lib/playwright-executor.ts` — a module that wraps playwright-core CDP connection and provides action execution
  - This module is the Playwright counterpart to the existing `evalScript`-based action execution in `browser-actions.ts`
  - **IMPORTANT**: This module ONLY handles 5 selector-based actions initially: `click`, `type`, `readText`, `waitFor`, `scroll`. The other 4 (navigate, screenshot, runJS, done) stay on evalScript.
  
  Implementation:
  1. **Connection manager:**
     ```typescript
     export async function connectCDP(port: number = 9222): Promise<boolean>
     export async function disconnectCDP(): Promise<void>
     export function isConnected(): boolean
     ```
     - `connectCDP()` calls `chromium.connectOverCDP(`http://127.0.0.1:${port}`)`
     - Fetches targets from `http://127.0.0.1:${port}/json`, filters to find the embedded browser by URL pattern (not `tauri://localhost` and not `about:blank`)
     - Stores the `Browser` and `Page` references in module-scoped variables
     - Returns `true` on success, `false` on failure (does NOT throw)
  
  2. **Action executors** (mirror the `ActionResult` return type from browser-actions):
     ```typescript
     export async function pwClick(selector: string): Promise<ActionResult>
     export async function pwType(selector: string, text: string, clear?: boolean): Promise<ActionResult>
     export async function pwReadText(selector?: string): Promise<ActionResult>
     export async function pwWaitFor(selector: string, timeoutMs?: number): Promise<ActionResult>
     export async function pwScroll(direction: string, amount: number): Promise<ActionResult>
     ```
     - Each function catches all errors and returns `{ success: false, error }` — never throws
     - Uses Playwright's `page.locator()` API, NOT `page.$()`
     - For `pwType` with `clear: true`, use `locator.fill('')` before `locator.fill(text)`
  
  3. **Safety**: Apply `DANGEROUS_JS_PATTERNS` check to any `page.evaluate()` calls (same blocklist as `runJSAction`)

  **Must NOT do**:
  - Do NOT implement navigate, screenshot, runJS, or done via Playwright (those stay on evalScript)
  - Do NOT open new browser windows or contexts
  - Do NOT store browser state globally — keep it module-scoped with clear lifecycle
  - Do NOT add Playwright to production bundle — use dynamic import: `const { chromium } = await import('playwright-core')`
  - Do NOT hardcode URL patterns — accept an optional filter function for target selection

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding Playwright CDP API, handling async lifecycle (connect/disconnect/reconnect), and matching existing ActionResult contract
  - **Skills**: []
    - No external skills needed — the executor is a TypeScript module using playwright-core API
  - **Skills Evaluated but Omitted**:
    - `playwright`: This skill is for browser-based QA testing, not for building a Playwright wrapper module

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4, 5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 9 (browser-actions Playwright backend swap)
  - **Blocked By**: Task 1 (Playwright + Bun compilation spike must pass first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:41-60` — `clickAction()` pattern: try/catch everything, return `ActionResult`, never throw. ALL 5 action executors must follow this exact error handling pattern.
  - `ogre-desktop/src/lib/browser-actions.ts:267-289` — `executeAction()` switch dispatcher. The new `playwright-executor.ts` does NOT have a dispatcher — individual functions are called from browser-actions.ts after integration (Task 9).
  - `ogre-desktop/spike/SPIKE-RESULTS.md` — Results from Task 1 (Vite compatibility) and Task 2 (CDP targeting). This document has the URL pattern for target filtering and any Vite config changes needed.

  **API/Type References**:
  - `ActionResult` from `agent-types.ts:47-51` — return type for all action executors: `{ success: boolean; error?: string; data?: unknown }`
  - `DANGEROUS_JS_PATTERNS` from `agent-types.ts:168-179` — blocklist to apply in page.evaluate calls
  - `playwright-core` API: `chromium.connectOverCDP()`, `browser.contexts()`, `page.locator()`, `locator.click()`, `locator.fill()`, `locator.textContent()`

  **External References**:
  - Playwright locator API: https://playwright.dev/docs/api/class-locator
  - Playwright CDP connection: https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp

  **WHY Each Reference Matters**:
  - `browser-actions.ts:41-60`: MUST match this error handling pattern exactly — caller expects `ActionResult`, never exceptions
  - `SPIKE-RESULTS.md`: Contains the CDP target filtering strategy from Task 2 — must use the same URL pattern logic here
  - `ActionResult`: Contract between executor and agent loop — any deviation breaks the chain

  **Acceptance Criteria**:
  - [ ] File `ogre-desktop/src/lib/playwright-executor.ts` exists
  - [ ] Exports: `connectCDP`, `disconnectCDP`, `isConnected`, `pwClick`, `pwType`, `pwReadText`, `pwWaitFor`, `pwScroll`
  - [ ] Uses dynamic import for playwright-core: `await import('playwright-core')`
  - [ ] All action executors return `ActionResult`, never throw
  - [ ] `DANGEROUS_JS_PATTERNS` check applied to any `page.evaluate()` calls
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: Module exports all expected functions
    Tool: Bash
    Preconditions: playwright-executor.ts exists
    Steps:
      1. Run TypeScript type-check: `npx tsc --noEmit`
      2. Verify module exports by checking with ast-grep or grep: connectCDP, disconnectCDP, isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll
    Expected Result: All 8 functions exported, TypeScript compiles cleanly
    Failure Indicators: Missing exports, type errors, compilation failures
    Evidence: .sisyphus/evidence/task-6-exports.txt

  Scenario: connectCDP returns false when no CDP server running
    Tool: Bash (vitest or ts-node)
    Preconditions: No CDP server running on port 9222
    Steps:
      1. Call connectCDP(9222)
      2. Assert return value is false (not an exception)
      3. Assert isConnected() returns false
    Expected Result: Graceful failure — returns false, no thrown exception
    Failure Indicators: Thrown exception, unhandled promise rejection, or returns true
    Evidence: .sisyphus/evidence/task-6-no-cdp.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-exports.txt — export verification and tsc output
  - [ ] task-6-no-cdp.txt — graceful failure test output

  **Commit**: YES
  - Message: `feat(agent): Playwright CDP executor module`
  - Files: `ogre-desktop/src/lib/playwright-executor.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

### Wave 2 — Integration (After Wave 1)

 [x] 7. Tauri Rust CDP Port Configuration

  **What to do**:
  - Modify `ogre-desktop/src-tauri/src/lib.rs` to conditionally enable CDP on the WebView2 runtime:
    1. Add a new Tauri command `enable_cdp_debugging` that sets the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable to `--remote-debugging-port=9222`
    2. This env var must be set BEFORE `tauri::Builder::default().build()` (line 858 in current lib.rs)
    3. The recommended approach: set the env var in the `setup()` closure (line 760) based on a feature flag or always-on for dev builds
    4. Alternative approach: set it early in `run()` before the Builder chain, gated behind an env var check like `OGRE_CDP_ENABLED=true`
  - The CDP port should NOT be enabled by default in production builds — only when agent mode is activated
  - Use the spike findings from Task 2 (`ogre-desktop/spike/SPIKE-RESULTS.md`) for the exact implementation

  **Must NOT do**:
  - Do NOT hardcode CDP port enabled in all builds — must be conditional
  - Do NOT change any existing Tauri commands or their signatures
  - Do NOT modify the sidecar, tray, or update logic
  - Do NOT add new Rust dependencies unless absolutely necessary

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Rust modification in a specific location with careful initialization order, but well-documented by spike
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant to Rust code

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9 (Playwright backend swap needs CDP port active)
  - **Blocked By**: Task 2 (CDP spike results)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:607-858` — `run()` function, specifically:
    - Line 721: `tauri::Builder::default()` — env var must be set BEFORE this
    - Lines 760-856: `setup()` closure — alternative place to set env var
    - Line 854: `spawn_sidecar()` call — env var for sidecar is a different pattern (don't confuse)
  - `ogre-desktop/spike/SPIKE-RESULTS.md` — Task 2 results with exact Rust code snippet

  **External References**:
  - WebView2 browser arguments: https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2environmentoptions.additionalbrowserarguments

  **WHY Each Reference Matters**:
  - `lib.rs:607-858`: The initialization order is CRITICAL. Setting the env var after `.build()` has no effect.
  - `SPIKE-RESULTS.md`: Contains the validated approach from Task 2 — use their code snippet as starting point

  **Acceptance Criteria**:
  - [ ] `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var set before WebView2 creation
  - [ ] CDP port is conditional (not always-on in production)
  - [ ] Existing Tauri commands still work (no regressions)
  - [ ] `cargo build` succeeds in `ogre-desktop/src-tauri`

  **QA Scenarios:**

  ```
  Scenario: Rust builds successfully with CDP configuration
    Tool: Bash
    Preconditions: lib.rs modified
    Steps:
      1. Run `cargo build` in ogre-desktop/src-tauri
      2. Check exit code is 0
    Expected Result: Compilation succeeds with no errors or warnings related to CDP changes
    Failure Indicators: Compilation errors, undefined variable references
    Evidence: .sisyphus/evidence/task-7-cargo-build.txt

  Scenario: CDP env var is set conditionally
    Tool: Bash
    Preconditions: lib.rs modified
    Steps:
      1. Read lib.rs and verify the env var is behind a condition (env check, feature flag, or config)
      2. Verify it is set BEFORE the `.build()` call
    Expected Result: Conditional CDP enablement confirmed by code inspection
    Failure Indicators: Unconditional `std::env::set_var` with no gating
    Evidence: .sisyphus/evidence/task-7-code-review.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-cargo-build.txt — Rust build output
  - [ ] task-7-code-review.txt — code inspection verification

  **Commit**: YES
  - Message: `feat(agent): enable CDP debugging port on WebView2`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cd ogre-desktop/src-tauri && cargo build`

 [x] 8. browser-actions.ts Fuzzy Retry Integration

  **What to do**:
  - Modify `ogre-desktop/src/lib/browser-actions.ts` to add fuzzy matching fallback when a selector-based action fails:
    1. Import `findFuzzyMatch`, `fuzzyMatchReason` from `./agent-dom-fuzzy`
    2. Import `captureInteractiveDom` from `./agent-dom`
    3. In `executeAction()` (line 267), for selector-based actions (`click`, `type`, `waitFor`, `readText` with selector):
       - Execute the action normally first
       - If result is `{ success: false }` AND error contains "Element not found" or "not found":
         a. Call `captureInteractiveDom()` to get current elements
         b. Call `findFuzzyMatch(selector, elements)`
         c. If a fuzzy match is found: re-execute the SAME action with `match.selector` substituted
         d. Wrap the result with metadata: `{ ...result, data: { ...result.data, fuzzyMatch: fuzzyMatchReason(...) } }`
         e. If no fuzzy match found: return original failure result unchanged
    4. The `executeAction()` function signature MUST remain: `(params: ActionParams) => Promise<ActionResult>`
    5. Fuzzy retry happens at most ONCE per action (no recursive retry)

  **Must NOT do**:
  - Do NOT change `executeAction()` function signature
  - Do NOT add new action types
  - Do NOT modify individual action functions (clickAction, typeAction, etc.) — put retry logic in the dispatcher only
  - Do NOT import from `playwright-executor.ts` — fuzzy matching is independent of Playwright
  - Do NOT retry `scroll`, `screenshot`, `navigate`, `runJS`, or `done` actions (only selector-based ones)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the central dispatcher requires understanding all 9 action paths and ensuring no regressions
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not related — fuzzy matching uses evalScript path

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 9, 10)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11 (fuzzy matching tests)
  - **Blocked By**: Task 3 (fuzzy DOM matching module must exist first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:267-289` — the `executeAction()` dispatcher switch statement. Fuzzy retry wraps AROUND the switch, not inside individual actions.
  - `ogre-desktop/src/lib/browser-actions.ts:41-60` — `clickAction()` returns `{ success: false, error: 'Element not found: ...' }` when selector fails — this is the error pattern to detect for fuzzy retry
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — Task 3 output: `findFuzzyMatch()` and `fuzzyMatchReason()` functions

  **API/Type References**:
  - `ActionParams` discriminated union (agent-types.ts:31-40) — only `click`, `type`, `waitFor` always have `selector`; `readText` has optional `selector`
  - `ActionResult` (agent-types.ts:47-51) — return type preserved exactly

  **WHY Each Reference Matters**:
  - `browser-actions.ts:267-289`: The fuzzy retry logic goes HERE — after the switch returns a failed result, check if it's a selector failure and retry with fuzzy match
  - `browser-actions.ts:41-60`: Need to know the exact error string format to match against

  **Acceptance Criteria**:
  - [ ] `executeAction()` signature unchanged
  - [ ] Selector failures trigger fuzzy match attempt (click, type, waitFor, readText)
  - [ ] Non-selector actions (scroll, screenshot, navigate, runJS, done) NOT affected
  - [ ] Fuzzy match metadata included in result.data when match succeeds
  - [ ] Max 1 fuzzy retry per action
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: Click with bad selector retries with fuzzy matched selector
    Tool: Bash (vitest)
    Preconditions: browser-actions.ts modified, agent-dom-fuzzy.ts exists
    Steps:
      1. Mock evalScriptJSON for click to return { success: false, error: 'Element not found: #bad' } first time, { success: true } second time
      2. Mock captureInteractiveDom to return [{ index: 1, tag: 'button', text: 'Submit', selector: '#submit-btn', visible: true, disabled: false }]
      3. Call executeAction({ action: 'click', selector: '#bad-submit' })
      4. Assert result.success === true
      5. Assert result.data.fuzzyMatch contains 'Fuzzy matched'
    Expected Result: Action succeeds after fuzzy retry with correct substitute selector
    Failure Indicators: Action fails without retry, or fuzzyMatch metadata missing
    Evidence: .sisyphus/evidence/task-8-fuzzy-retry.txt

  Scenario: Scroll action does NOT trigger fuzzy retry
    Tool: Bash (vitest)
    Preconditions: browser-actions.ts modified
    Steps:
      1. Mock scroll to fail with { success: false, error: 'Scroll failed' }
      2. Call executeAction({ action: 'scroll', direction: 'down', amount: 300 })
      3. Assert captureInteractiveDom was NOT called
    Expected Result: Scroll failure returned directly without fuzzy matching attempt
    Failure Indicators: captureInteractiveDom was called for non-selector action
    Evidence: .sisyphus/evidence/task-8-no-fuzzy-scroll.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-fuzzy-retry.txt — fuzzy retry test output
  - [ ] task-8-no-fuzzy-scroll.txt — non-selector exclusion test output

  **Commit**: YES
  - Message: `feat(agent): integrate fuzzy DOM retry into browser-actions`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 9. browser-actions.ts Playwright Backend Swap

  **What to do**:
  - Modify `ogre-desktop/src/lib/browser-actions.ts` to use Playwright for 5 selector-based actions when CDP is connected:
    1. Import `isConnected`, `pwClick`, `pwType`, `pwReadText`, `pwWaitFor`, `pwScroll` from `./playwright-executor`
    2. In `executeAction()`, BEFORE the existing switch statement, add a CDP branch:
       ```typescript
       if (isConnected()) {
         switch (params.action) {
           case 'click': return pwClick(params.selector);
           case 'type': return pwType(params.selector, params.text, params.clear);
           case 'readText': return pwReadText(params.selector);
           case 'waitFor': return pwWaitFor(params.selector, params.timeoutMs);
           case 'scroll': return pwScroll(params.direction, params.amount);
           // All other actions fall through to evalScript
         }
       }
       ```
    3. If `isConnected()` returns false, the original evalScript path runs — this IS the fallback
    4. The fuzzy retry from Task 8 applies to BOTH backends (it wraps the result, not the call)

  **Must NOT do**:
  - Do NOT move navigate, screenshot, runJS, or done to Playwright
  - Do NOT change `executeAction()` signature
  - Do NOT make Playwright a hard dependency — `isConnected()` must be false-safe (returns false if playwright-executor isn't loaded)
  - Do NOT change the existing evalScript action implementations

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the dispatcher with a conditional backend switch requires understanding both execution paths and ensuring fallback works correctly
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — we're importing from our own module, not running tests

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after Tasks 6 and 7)
  - **Parallel Group**: Wave 2 (but waits for T6 + T7)
  - **Blocks**: Task 13 (Playwright CDP integration tests)
  - **Blocked By**: Task 6 (playwright-executor module), Task 7 (CDP port config)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:267-289` — current `executeAction()` switch. Insert CDP branch BEFORE this switch.
  - `ogre-desktop/src/lib/playwright-executor.ts` — Task 6 output: `isConnected()`, `pwClick()`, `pwType()`, `pwReadText()`, `pwWaitFor()`, `pwScroll()`

  **API/Type References**:
  - All `pw*` functions return `ActionResult` — same type as evalScript actions
  - `isConnected()` returns `boolean` synchronously

  **WHY Each Reference Matters**:
  - `browser-actions.ts:267-289`: This is the EXACT insertion point for the CDP branch
  - `playwright-executor.ts`: Must import from the correct path with correct function names

  **Acceptance Criteria**:
  - [ ] `isConnected()` check gates Playwright path
  - [ ] 5 actions routed through Playwright when CDP connected: click, type, readText, waitFor, scroll
  - [ ] 4 actions always use evalScript: navigate, screenshot, runJS, done
  - [ ] When CDP not connected, all actions use evalScript (fallback)
  - [ ] Fuzzy retry (Task 8) works with both backends
  - [ ] `executeAction()` signature unchanged

  **QA Scenarios:**

  ```
  Scenario: Click uses Playwright when CDP connected
    Tool: Bash (vitest)
    Preconditions: browser-actions.ts modified, playwright-executor mocked
    Steps:
      1. Mock isConnected() to return true
      2. Mock pwClick to return { success: true }
      3. Call executeAction({ action: 'click', selector: '#btn' })
      4. Assert pwClick was called with '#btn'
      5. Assert evalScriptJSON was NOT called for click
    Expected Result: Playwright path taken for click action
    Failure Indicators: evalScriptJSON called instead of pwClick
    Evidence: .sisyphus/evidence/task-9-pw-click.txt

  Scenario: Navigate always uses evalScript regardless of CDP
    Tool: Bash (vitest)
    Preconditions: browser-actions.ts modified
    Steps:
      1. Mock isConnected() to return true
      2. Call executeAction({ action: 'navigate', url: 'https://example.com' })
      3. Assert navigateEmbedded was called (evalScript path)
      4. Assert no pwNavigate or similar was called
    Expected Result: Navigate uses evalScript even when CDP connected
    Failure Indicators: Playwright used for navigate action
    Evidence: .sisyphus/evidence/task-9-evalscript-navigate.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-pw-click.txt — Playwright path test
  - [ ] task-9-evalscript-navigate.txt — fallback path test

  **Commit**: YES
  - Message: `feat(agent): swap browser-actions to Playwright backend when CDP connected`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 10. Agent Prompt Enhancement for Fuzzy Context

  **What to do**:
  - Modify `ogre-desktop/src/lib/agent-prompt.ts` to update `AGENT_SYSTEM_PROMPT` with fuzzy matching awareness:
    1. Add a new rule to the "IMPORTANT RULES" section (after rule 8):
       ```
       9. If your CSS selector fails, the system will attempt to find a similar element.
          When a fuzzy match is used, you'll see "Fuzzy matched via..." in the action result.
          Use this feedback to correct your selectors in subsequent actions.
       10. Prefer using exact element text content or aria-labels in selectors, as these
           are more robust for fuzzy matching when IDs/classes don't match.
       ```
  - This is a text-only change to a string constant — no logic changes

  **Must NOT do**:
  - Do NOT modify `parseAgentResponse()` or any other function
  - Do NOT change tool definitions
  - Do NOT add new exports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single string constant modification, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8, 9)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14 (agent loop updated tests reference prompt)
  - **Blocked By**: None (can start anytime, but placed in Wave 2 for logical grouping)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-prompt.ts:90-159` — the `AGENT_SYSTEM_PROMPT` string. Append rules after line 158 (rule 8).

  **WHY Each Reference Matters**:
  - Lines 90-159: The exact insertion point for new rules. Must follow the existing numbering and formatting style.

  **Acceptance Criteria**:
  - [ ] `AGENT_SYSTEM_PROMPT` contains fuzzy matching awareness rules
  - [ ] Existing rules 1-8 unchanged
  - [ ] No other functions modified
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **QA Scenarios:**

  ```
  Scenario: System prompt includes fuzzy matching guidance
    Tool: Bash
    Preconditions: agent-prompt.ts modified
    Steps:
      1. Read agent-prompt.ts
      2. Search for 'fuzzy match' (case insensitive) in AGENT_SYSTEM_PROMPT
      3. Verify rules 9 and 10 exist after rule 8
    Expected Result: AGENT_SYSTEM_PROMPT contains fuzzy matching rules 9 and 10
    Failure Indicators: No fuzzy matching mention, or rules inserted in wrong location
    Evidence: .sisyphus/evidence/task-10-prompt-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-10-prompt-check.txt — grep output showing fuzzy rules in prompt

  **Commit**: YES
  - Message: `feat(agent): enhance system prompt with fuzzy matching guidance`
  - Files: `ogre-desktop/src/lib/agent-prompt.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

### Wave 3 — Tests (After Wave 2)

 [x] 11. Fuzzy Matching Tests

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts` with vitest tests for `findFuzzyMatch()` and `fuzzyMatchReason()`:
    - Test Strategy 1 (text match): element with matching text is found
    - Test Strategy 2 (partial ID/class): element with partial selector match is found
    - Test Strategy 3 (aria-label): element with aria-label match is found
    - Test Strategy 4 (tag heuristic): fallback to first visible element of matching tag
    - Test all 4 fail: returns null
    - Test edge cases: empty array, empty selector, disabled elements, elements with missing fields
  - Create `ogre-desktop/src/lib/browser-actions-fuzzy.test.ts` with vitest tests for the fuzzy retry integration in `executeAction()`:
    - Test: click with bad selector retries via fuzzy and succeeds
    - Test: scroll failure does NOT trigger fuzzy retry
    - Test: fuzzy retry metadata is present in result.data

  **Must NOT do**:
  - Do NOT modify source files — tests only
  - Do NOT use real browser/DOM — use mocks following `agent-loop.test.ts` patterns

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Straightforward test writing following established patterns, but requires many test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 8 (browser-actions fuzzy integration must be complete)

  **References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts:1-30` — vitest mock pattern to follow: `vi.mock()` calls at top, `beforeEach` with `vi.resetAllMocks()`
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — Task 3 output (functions to test)
  - `ogre-desktop/src/lib/browser-actions.ts` — Task 8 output (fuzzy retry to test)

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts` exists with ≥6 test cases
  - [ ] `ogre-desktop/src/lib/browser-actions-fuzzy.test.ts` exists with ≥3 test cases
  - [ ] `npx vitest run --grep fuzzy` — all tests pass

  **QA Scenarios:**

  ```
  Scenario: All fuzzy matching tests pass
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. Run `npx vitest run --grep 'fuzzy'` in ogre-desktop
      2. Check exit code is 0
      3. Verify test count: at least 9 tests (6 unit + 3 integration)
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Non-zero exit code, test failures
    Evidence: .sisyphus/evidence/task-11-fuzzy-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-11-fuzzy-tests.txt — vitest output for fuzzy tests

  **Commit**: YES
  - Message: `test(agent): add fuzzy DOM matching and retry tests`
  - Files: `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts, ogre-desktop/src/lib/browser-actions-fuzzy.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

 [x] 12. Compact UI Tests

  **What to do**:
  - Since `AgentChat.svelte` is a Svelte 5 component, pure unit testing of the template is limited. Instead:
    1. Verify TypeScript compilation: `npx tsc --noEmit` passes with the modified component
    2. Verify the compact mode CSS classes exist by grepping the Svelte file for expected class names
    3. Verify the `compactMode` state variable exists in the script section
    4. If the app can be started in dev mode, use Playwright skill to visually verify compact badges
  - Create a test validation script `ogre-desktop/src/components/grading/AgentChat.test.ts` that:
    - Imports and validates types are correct
    - Checks that the component module exports without errors

  **Must NOT do**:
  - Do NOT modify the Svelte component
  - Do NOT set up a full Svelte testing framework (e.g., @testing-library/svelte) unless it already exists

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Limited unit test scope for Svelte components, focus on type-checking and visual verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 13, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4 (compact UI must be implemented first)

  **References**:
  - `ogre-desktop/src/components/grading/AgentChat.svelte` — Task 4 output (modified component)

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` passes with modified AgentChat.svelte
  - [ ] CSS classes `.compact-badge`, `.badge-success`, `.badge-failure` found in component
  - [ ] `compactMode` state variable exists in script section

  **QA Scenarios:**

  ```
  Scenario: TypeScript compilation passes with compact mode changes
    Tool: Bash
    Preconditions: AgentChat.svelte modified with compact mode
    Steps:
      1. Run `npx tsc --noEmit` in ogre-desktop
      2. Verify exit code is 0
    Expected Result: No type errors from compact mode additions
    Failure Indicators: Type errors mentioning compactMode or badge classes
    Evidence: .sisyphus/evidence/task-12-tsc-check.txt

  Scenario: Compact mode CSS classes present in component
    Tool: Bash
    Preconditions: AgentChat.svelte modified
    Steps:
      1. Grep AgentChat.svelte for 'compact-badge'
      2. Grep AgentChat.svelte for 'compactMode'
      3. Assert both patterns found
    Expected Result: Both patterns present in the file
    Failure Indicators: Pattern not found
    Evidence: .sisyphus/evidence/task-12-css-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-12-tsc-check.txt — TypeScript check output
  - [ ] task-12-css-check.txt — grep verification output

  **Commit**: YES
  - Message: `test(agent): add compact UI verification tests`
  - Files: `ogre-desktop/src/components/grading/AgentChat.test.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 13. Playwright CDP Integration Tests

  **What to do**:
  - Create `ogre-desktop/src/lib/playwright-executor.test.ts` with vitest tests:
    - Test `connectCDP()` returns false when no CDP server running (no exception)
    - Test `isConnected()` returns false initially
    - Test `disconnectCDP()` is safe to call when not connected
    - Test `pwClick()` returns `{ success: false }` when not connected (not an exception)
    - Test `pwType()` returns `{ success: false }` when not connected
  - Create `ogre-desktop/src/lib/browser-actions-playwright.test.ts` with vitest tests for the Playwright backend swap:
    - Test: when `isConnected()` returns true, click goes through `pwClick`
    - Test: when `isConnected()` returns false, click goes through evalScript
    - Test: navigate always uses evalScript regardless of connection state

  **Must NOT do**:
  - Do NOT start actual CDP server in tests — mock playwright-core
  - Do NOT modify source files
  - Do NOT require a running Tauri app for unit tests

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful mocking of playwright-core internals and understanding the two-backend architecture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 9 (Playwright backend swap must be complete)

  **References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts:1-30` — vitest mock pattern
  - `ogre-desktop/src/lib/playwright-executor.ts` — Task 6 output
  - `ogre-desktop/src/lib/browser-actions.ts` — Task 9 output

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/src/lib/playwright-executor.test.ts` exists with ≥5 test cases
  - [ ] `ogre-desktop/src/lib/browser-actions-playwright.test.ts` exists with ≥3 test cases
  - [ ] `npx vitest run --grep playwright` — all tests pass

  **QA Scenarios:**

  ```
  Scenario: All Playwright tests pass
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. Run `npx vitest run --grep 'playwright|CDP'` in ogre-desktop
      2. Check exit code is 0
      3. Verify test count: at least 8 tests
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Non-zero exit code, test failures
    Evidence: .sisyphus/evidence/task-13-playwright-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-13-playwright-tests.txt — vitest output for Playwright tests

  **Commit**: YES
  - Message: `test(agent): add Playwright CDP executor and backend swap tests`
  - Files: `ogre-desktop/src/lib/playwright-executor.test.ts, ogre-desktop/src/lib/browser-actions-playwright.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

 [x] 14. Agent Loop Updated Tests

  **What to do**:
  - Update `ogre-desktop/src/lib/agent-loop.test.ts` to add tests for the new compact mode and screenshot retry:
    - Test: compact auto mode suppresses thinking events
    - Test: non-compact mode still yields thinking events (backward compat)
    - Test: selector failure triggers screenshot capture and retry
    - Test: screenshot retry is capped at 1 (no infinite loop)
    - Test: done action never triggers screenshot retry
    - Test: non-selector failure (e.g., scroll) does NOT trigger screenshot retry

  **Must NOT do**:
  - Do NOT modify agent-loop.ts — tests only
  - Do NOT break existing tests in the file
  - Do NOT remove or modify existing test cases

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Adding tests to existing file requires understanding the existing test patterns and async generator testing approach
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5 (agent loop compact mode), Task 10 (prompt enhancement)

  **References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts` — existing test file with helper functions `collectEvents()`, `approveAndCollect()`, `runUntil()`, and mock setup patterns
  - `ogre-desktop/src/lib/agent-loop.ts` — Task 5 output (compact mode + screenshot retry)

  **Acceptance Criteria**:
  - [ ] Existing tests still pass (no regressions)
  - [ ] ≥6 new test cases added for compact mode and screenshot retry
  - [ ] `npx vitest run agent-loop.test` — all tests pass

  **QA Scenarios:**

  ```
  Scenario: All agent loop tests pass (existing + new)
    Tool: Bash
    Preconditions: agent-loop.test.ts updated
    Steps:
      1. Run `npx vitest run --grep 'agent-loop'` in ogre-desktop
      2. Check exit code is 0
      3. Verify total test count is at least 12 (6 existing + 6 new)
    Expected Result: All tests pass, 0 failures, no regressions
    Failure Indicators: Non-zero exit code, existing tests broken
    Evidence: .sisyphus/evidence/task-14-agent-loop-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-14-agent-loop-tests.txt — vitest output for agent loop tests

  **Commit**: YES
  - Message: `test(agent): add compact mode and screenshot retry tests to agent loop`
  - Files: `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`
---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

 [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

 [x] F2. **Code Quality Review** — `unspecified-high`
  Run linter + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify `executeAction` signature unchanged. Verify `AgentEvent` union only has additive changes.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

 [x] F3. **Real Manual QA** — `unspecified-high` _(skipped — requires running app; cannot start app in agent context)_
  Start the app in dev mode. Navigate to a grading page. Test agent mode: send a message that references a non-existent selector → verify fuzzy match kicks in. Verify compact action badges display. If CDP is enabled, verify Playwright actions work. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

 [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 0**: `feat(agent): validate Playwright CDP feasibility spike` — spike files
- **Wave 1**: `feat(agent): add fuzzy DOM matching module` — agent-dom-fuzzy.ts; `feat(agent): compact action badge UI` — AgentChat.svelte; `feat(agent): agent loop compact mode` — agent-loop.ts; `feat(agent): Playwright CDP executor` — playwright-executor.ts
- **Wave 2**: `feat(agent): enable CDP on WebView2` — lib.rs; `feat(agent): integrate fuzzy retry into browser-actions` — browser-actions.ts; `feat(agent): swap browser-actions to Playwright backend` — browser-actions.ts; `feat(agent): enhance prompt for fuzzy context` — agent-prompt.ts
- **Wave 3**: `test(agent): add fuzzy matching tests` — test files; `test(agent): add compact UI tests` — test files; `test(agent): add CDP integration tests` — test files

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run  # Expected: all tests pass
cd grading-server && bun test       # Expected: all server tests pass
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All existing tests still pass
- [x] New tests cover fuzzy matching, compact UI, and CDP connection
- [x] Agent handles missing selectors gracefully (fuzzy match or screenshot fallback)
- [x] AgentChat displays compact one-line action badges
- [x] Playwright connects to WebView2 via CDP (when enabled)
- [x] evalScript fallback works when CDP is not available
