# Browser Agent — Autonomous Webview Automation

## TL;DR

> **Quick Summary**: Build a general-purpose browser agent chat that replaces the existing Solver tab. Users describe what they want done on the page, and the AI carries out actions on the embedded webview — either one-at-a-time with approval (review mode) or fully autonomous (auto mode).
> 
> **Deliverables**:
> - `AgentChat.svelte` — New chat UI component replacing SolverChat
> - `browser-actions.ts` — Action executor library (9 actions: click, type, scroll, readText, screenshot, waitFor, navigate, runJS, done)
> - `agent-loop.ts` — Client-side agent loop with review/auto modes
> - `agent-api.ts` — Client API for the new server endpoint
> - `POST /api/agent` — Server endpoint for AI reasoning with tool schemas
> - `agent-dom.ts` — Interactive-only DOM snapshot for agent context
> - Updated `GradingPanel.svelte` — Tab renamed from "Solver" to "Agent"
> - Tests for browser-actions, agent-loop, and agent-api
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Types → Browser Actions → Agent Loop → AgentChat UI

---

## Context

### Original Request
User wants a chat window where they describe how the AI should interact with the page in the embedded webview. Two modes: review (step-by-step approval) and auto (fully autonomous).

### Interview Summary
**Key Discussions**:
- **UI Placement**: Replace SolverChat entirely → new AgentChat in "Agent" tab
- **AI Approach**: Hybrid — structured tool actions + runJS() escape hatch
- **Page Understanding**: Vision (screenshot) + DOM (interactive-only snapshot)
- **Agent Loop Location**: Client-side in Svelte (server is AI reasoning proxy only)
- **Server Endpoint**: New `POST /api/agent` (not extending `/api/chat`)
- **Review Mode UX**: One action at a time → Approve/Skip → execute → next
- **Scope**: General-purpose browser agent, any page, any task

**Research Findings**:
- `evalScript()`/`evalScriptJSON()` already work for executing JS in webview and returning results
- `captureWebviewScreenshot()` works via html2canvas
- `discover.ts` proves the "screenshot + DOM → AI → structured response" pattern
- `SolverChat.svelte` is a working multi-turn chat template with SSE streaming
- `confirmation-flow.ts` has step-by-step approval pattern (precedent for review mode)
- BatchPanel has auto/review toggle pattern
- `providers.js` has NO tool-use support — must use JSON-in-prompt approach

### Metis Review
**Identified Gaps** (addressed):
- **Tool-calling approach**: `providers.js` has zero tool-use support → Using JSON-in-prompt (matches discover.ts pattern)
- **DOM snapshot**: Full 500-node tree too noisy for agent → Building interactive-only snapshot (buttons, inputs, links only)
- **Loop detection**: Must prevent infinite loops → Max 30 steps, 5min timeout, same-action-3x abort
- **runJS safety**: Escape hatch needs guards → Always requires approval even in auto mode, block dangerous patterns
- **Edge cases**: Page navigation mid-task, cross-origin iframes, webview not open → Handled in action executor error returns
- **Solver subsumption**: Agent tab handles general chat too (user chats without browser instructions → text-only response)
- **Provider vision compatibility**: Not all models support vision → Fallback to DOM-only when screenshot fails

---

## Work Objectives

### Core Objective
Build a browser agent that lets users automate webview interaction through natural language chat, with review mode (step-by-step approval) and auto mode (fully autonomous execution).

### Concrete Deliverables
- `ogre-desktop/src/components/grading/AgentChat.svelte` — Chat UI with mode toggle and action cards
- `ogre-desktop/src/lib/browser-actions.ts` — 9 action executors (click, type, scroll, readText, screenshot, waitFor, navigate, runJS, done)
- `ogre-desktop/src/lib/agent-loop.ts` — Client-side agent loop with async generator pattern
- `ogre-desktop/src/lib/agent-api.ts` — Client API for POST /api/agent
- `ogre-desktop/src/lib/agent-dom.ts` — Interactive-only DOM snapshot script
- `ogre-desktop/src/lib/agent-types.ts` — Shared TypeScript types
- `grading-server/agent.js` — Server-side agent endpoint handler
- Updated `GradingPanel.svelte` — "Solver" → "Agent" tab, imports AgentChat
- Test files for browser-actions, agent-loop, agent-api

### Definition of Done
- [x] User can type a natural language instruction in the Agent tab and see the AI execute actions on the webview
- [x] Review mode shows each proposed action with Approve/Skip buttons before execution
- [x] Auto mode executes all actions automatically, reporting results in chat
- [x] Agent handles errors gracefully (element not found, timeout, invalid selector)
- [x] Agent loop terminates on: done() action, max steps (30), max time (5min), loop detection (3x same action)
- [x] `npm run build` succeeds with zero TypeScript errors
- [x] All existing tabs (Grader, Discovery) still work after changes
- [x] Tests pass for browser-actions, agent-loop, and agent-api

### Must Have
- 9 structured browser actions: click, type, scroll, readText, screenshot, waitFor, navigate, runJS, done
- Review mode (one action at a time with Approve/Skip)
- Auto mode (execute all automatically)
- Mode toggle in chat UI
- Vision + DOM page context sent to AI
- Safety limits (max steps, time cap, loop detection)
- runJS always requires approval even in auto mode
- Error handling for all actions (never throw, always return ActionResult)

### Must NOT Have (Guardrails)
- **DO NOT modify `providers.js` request builders or response parsers** — use JSON-in-prompt, not native tool calling
- **DO NOT add tool-calling support to existing `/api/chat` endpoint** — keep `/api/agent` separate
- **DO NOT build persistent automation scripts/macros** — in-memory only
- **DO NOT add multi-tab or multi-window agent control** — single webview only
- **DO NOT add markdown rendering or code syntax highlighting in chat** — plain text with pre-wrap
- **DO NOT add conversation persistence to disk** — clears on tab switch or clear button
- **DO NOT create abstract base classes for actions** — plain functions in one file
- **DO NOT use streaming/SSE for the agent endpoint** — simple JSON request/response
- **DO NOT add custom system prompt editing UI** — hardcoded prompt for v1

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest found via `.test.ts` files pattern, `bun test` runner)
- **Automated tests**: YES — tests after implementation
- **Framework**: bun test (matching existing test file patterns like `browser.test.ts`, `discover.test.ts`)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun test) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types, DOM snapshot, action library):
├── Task 1: Agent types + constants [quick]
├── Task 2: Interactive-only DOM snapshot [quick]
├── Task 3: Browser action executor library [deep]
└── Task 4: Agent API client [quick]

Wave 2 (Server endpoint + Agent loop — depends on Wave 1):
├── Task 5: Server POST /api/agent endpoint [unspecified-high]
├── Task 6: Agent loop with review/auto modes [deep]
└── Task 7: System prompt + JSON response parser [unspecified-high]

Wave 3 (UI — depends on Wave 2):
├── Task 8: AgentChat.svelte component [visual-engineering]
└── Task 9: GradingPanel integration (tab rename + wiring) [quick]

Wave 4 (Tests + QA — depends on Wave 3):
├── Task 10: Unit tests for browser-actions + agent-loop [unspecified-high]
├── Task 11: Integration test for server /api/agent endpoint [unspecified-high]
└── Task 12: End-to-end QA [deep]

Wave FINAL (Independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 6 → Task 8 → Task 12 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (Types) | — | 2, 3, 4, 5, 6, 7, 8 |
| 2 (DOM snapshot) | 1 | 6, 7 |
| 3 (Actions) | 1 | 6, 10 |
| 4 (API client) | 1 | 6, 8, 11 |
| 5 (Server endpoint) | 1 | 6, 7, 11 |
| 6 (Agent loop) | 1, 2, 3, 4, 5 | 8, 10, 12 |
| 7 (System prompt) | 1, 2, 5 | 6, 8 |
| 8 (AgentChat UI) | 1, 4, 6 | 9, 12 |
| 9 (GradingPanel) | 8 | 12 |
| 10 (Unit tests) | 3, 6 | 12 |
| 11 (API tests) | 4, 5 | 12 |
| 12 (E2E QA) | 8, 9, 10, 11 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `deep`, T4 → `quick`
- **Wave 2**: **3 tasks** — T5 → `unspecified-high`, T6 → `deep`, T7 → `unspecified-high`
- **Wave 3**: **2 tasks** — T8 → `visual-engineering`, T9 → `quick`
- **Wave 4**: **3 tasks** — T10 → `unspecified-high`, T11 → `unspecified-high`, T12 → `deep`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Agent Types & Constants

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-types.ts` with all shared TypeScript types:
    - `AgentAction` union type: `'click' | 'type' | 'scroll' | 'readText' | 'screenshot' | 'waitFor' | 'navigate' | 'runJS' | 'done'`
    - `ActionParams` discriminated union (each action's params shape)
    - `ActionResult`: `{ success: boolean; error?: string; data?: unknown }`
    - `AgentMessage`: `{ role: 'user' | 'assistant' | 'action' | 'result'; content: string; action?: ActionRequest; result?: ActionResult }`
    - `AgentMode`: `'review' | 'auto'`
    - `AgentState`: `'idle' | 'thinking' | 'proposing' | 'executing' | 'done' | 'error'`
    - `AgentConfig`: `{ maxSteps: number; maxTimeMs: number; maxSameAction: number; actionDelayMs: number }`
  - Create constants: `DEFAULT_AGENT_CONFIG = { maxSteps: 30, maxTimeMs: 300000, maxSameAction: 3, actionDelayMs: 500 }`
  - Export `DANGEROUS_JS_PATTERNS` array: `['eval(', 'Function(', '__proto__', 'import(', 'fetch(', '__lookupGetter__']`

  **Must NOT do**:
  - Do NOT create abstract classes or base class hierarchies
  - Do NOT add runtime validation (types are compile-time only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file of TypeScript types and constants, no logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:20-21` — `BatchProgress`, `Rubric`, `SiteProfile` type pattern. Follow same export style.
  - `ogre-desktop/src/lib/sse-parser.ts:1-30` — `BatchGradingCallbacks`, `CancellationToken` type patterns. Shows how to define callback interfaces.

  **API/Type References**:
  - `ogre-desktop/src/lib/grading-api.ts:24-80` — Existing SSEEvent, GradeRubric, GradeRequest types. Match naming conventions (`PascalCase` for types).

  **WHY Each Reference Matters**:
  - `batch-grader.ts` types show the naming convention and export pattern used across the codebase
  - `grading-api.ts` types show how to structure discriminated unions and result types

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/agent-types.ts`
  - [ ] `bun test` passes (no regressions)
  - [ ] TypeScript compiles: `npx tsc --noEmit --project ogre-desktop/tsconfig.json` succeeds

  **QA Scenarios:**
  ```
  Scenario: Types file compiles without errors
    Tool: Bash
    Steps:
      1. Run `npx tsc --noEmit --project ogre-desktop/tsconfig.json`
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-1-types-compile.txt

  Scenario: Types are importable from another module
    Tool: Bash
    Steps:
      1. Create temp file that imports all exports from agent-types.ts
      2. Run tsc on it
    Expected Result: All exports resolve correctly
    Evidence: .sisyphus/evidence/task-1-types-import.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add shared types and constants for browser agent`
  - Files: `ogre-desktop/src/lib/agent-types.ts`
  - Pre-commit: `bun test`

- [x] 2. Interactive-Only DOM Snapshot

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-dom.ts`
  - Build a DOM snapshot script that captures ONLY interactive elements:
    - `button`, `a[href]`, `input`, `textarea`, `select`, `[role="button"]`, `[role="link"]`, `[role="textbox"]`, `[onclick]`, `[contenteditable]`
  - For each element, capture: `{ index: number, tag: string, type?: string, id?: string, name?: string, placeholder?: string, text: string, value?: string, href?: string, disabled: boolean, visible: boolean, selector: string }`
  - Generate a minimal CSS selector for each element (id > name > unique class + tag > nth-child)
  - Cap at 200 elements max
  - Export `captureInteractiveDom(): Promise<InteractiveElement[]>` that uses `evalScriptJSON()` from browser.ts
  - Export `formatDomForPrompt(elements: InteractiveElement[]): string` that creates a compact text representation for the AI:
    ```
    [1] button "Sign In" (#login-btn)
    [2] input[email] placeholder="Enter email" (#email)
    [3] input[password] placeholder="Password" (#pass)
    [4] a "Forgot password?" (href=/reset)
    ```

  **Must NOT do**:
  - Do NOT reuse discover.ts `DOM_SNAPSHOT_SCRIPT` (it captures all 500 nodes, too noisy)
  - Do NOT capture non-interactive elements (divs, spans, paragraphs)
  - Do NOT capture hidden/invisible elements (display:none, visibility:hidden, zero size)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file with evalScript wrapper and formatting function
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Task 1 (needs InteractiveElement type)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:532-586` — `DOM_SNAPSHOT_SCRIPT`. Shows how to walk the DOM inside evalScript. Your script is similar but filtered to interactive elements only.
  - `ogre-desktop/src/lib/element-picker.ts:50-90` — `generateSelector()`. Shows CSS selector generation priority: id > semantic attrs > data attrs > classes.
  - `ogre-desktop/src/lib/browser.ts:149-179` — `evalScript()`/`evalScriptJSON()`. These are the APIs you'll use.

  **WHY Each Reference Matters**:
  - discover.ts DOM script shows the `evalScriptJSON` wrapper pattern for complex DOM extraction
  - element-picker.ts shows how to generate reliable CSS selectors (reuse same priority logic)
  - browser.ts is the API you'll call

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/agent-dom.ts`
  - [ ] `captureInteractiveDom()` returns only interactive elements
  - [ ] `formatDomForPrompt()` produces readable text with index, tag, text, and selector
  - [ ] Hidden elements are excluded
  - [ ] Max 200 elements captured

  **QA Scenarios:**
  ```
  Scenario: DOM snapshot captures interactive elements from a real page
    Tool: Bash
    Preconditions: Embedded webview is open on any page with forms/buttons
    Steps:
      1. Call captureInteractiveDom() via evalScript
      2. Check returned array contains objects with tag, text, selector fields
      3. Verify no non-interactive elements (div, span, p without roles)
    Expected Result: Array of 1+ elements, all interactive, all have selectors
    Evidence: .sisyphus/evidence/task-2-dom-snapshot.json

  Scenario: Format function produces readable prompt text
    Tool: Bash
    Steps:
      1. Call formatDomForPrompt with sample data
      2. Verify output contains indexed elements like [1] button "text"
    Expected Result: Compact text with one line per element
    Evidence: .sisyphus/evidence/task-2-dom-format.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add interactive-only DOM snapshot for agent context`
  - Files: `ogre-desktop/src/lib/agent-dom.ts`
  - Pre-commit: `bun test`

- [x] 3. Browser Action Executor Library

  **What to do**:
  - Create `ogre-desktop/src/lib/browser-actions.ts`
  - Creates 9 action executors, each wrapping evalScript/evalScriptJSON from browser.ts
  - Every action returns `ActionResult` (`{ success, error?, data? }`), NEVER throws
  - Actions:
    - `click(selector)` — querySelector → el.click() → return { success, tagName, text snippet }
    - `type(selector, text, clear?)` — querySelector → set value → dispatch input+change events → return { success }
    - `scroll(direction, amount)` — window.scrollBy → return { success, scrollX, scrollY }
    - `readText(selector?)` — querySelector or document.body → return { success, data: text }
    - `screenshot()` — call captureWebviewScreenshot() from browser.ts → return { success, data: base64DataUrl }
    - `waitFor(selector, timeoutMs=5000)` — poll every 200ms → return { success } or { success: false, error: 'Timeout' }. Cap timeout at 10000ms regardless of AI request.
    - `navigate(url)` — call navigateEmbedded() from browser.ts → return { success }
    - `runJS(code)` — validate code against DANGEROUS_JS_PATTERNS → evalScript(code) → return result
    - `done(success, message)` — no-op action, just returns { success, data: { message } }
  - Export `executeAction(request: ActionRequest): Promise<ActionResult>` as the single entry point (switch on action type)
  - Each evalScript call wraps in try/catch IIFE returning structured result

  **Must NOT do**:
  - Do NOT create abstract base classes
  - Do NOT add retry logic (agent loop handles retries)
  - Do NOT modify browser.ts

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex action logic with many edge cases, DOM manipulation, event dispatching
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 6, 10
  - **Blocked By**: Task 1 (needs types)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/autofill.ts:30-80` — evalScript injection with dispatchEvent for React compatibility
  - `ogre-desktop/src/lib/browser.ts:149-179` — evalScript/evalScriptJSON API
  - `ogre-desktop/src/lib/browser.ts:254-280` — captureWebviewScreenshot pattern

  **WHY Each Reference Matters**:
  - autofill.ts shows how to inject values and dispatch events for React compatibility
  - browser.ts evalScript APIs are what actions will use
  - browser.ts screenshot pattern shows how to call captureWebviewScreenshot

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/browser-actions.ts`
  - [ ] All 9 actions implemented and exported
  - [ ] Each action returns ActionResult structure
  - [ ] Unknown action returns error, never throws
  - [ ] runJS blocks DANGEROUS_JS_PATTERNS

  **QA Scenarios:**
  ```
  Scenario: Click action finds and clicks element
    Tool: Bash
    Steps:
      1. Call executeAction({ action: 'click', params: { selector: 'button' } })
    Expected Result: { success: true, tagName: 'BUTTON', data: { text: 'Click me' } }
    Evidence: .sisyphus/evidence/task-3-click-action.json

  Scenario: Type action sets value and dispatches events
    Tool: Bash
    Steps:
      1. Call executeAction({ action: 'type', params: { selector: '#input', text: 'hello' } })
    Expected Result: { success: true }
    Evidence: .sisyphus/evidence/task-3-type-action.json

  Scenario: runJS blocks dangerous patterns
    Tool: Bash
    Steps:
      1. Call executeAction({ action: 'runJS', params: { code: 'eval(1)' } })
    Expected Result: { success: false, error: 'Blocked dangerous pattern' }
    Evidence: .sisyphus/evidence/task-3-runjs-block.json
  ```

  **Commit**: YES
  - Message: `feat(agent): add browser action executor library (9 actions)`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`
  - Pre-commit: `bun test`

- [x] 4. Agent API Client

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-api.ts`
  - Client for the new `POST /api/agent` server endpoint
  - Export `sendAgentRequest(request: AgentApiRequest): Promise<AgentApiResponse>`
    - `AgentApiRequest`: `{ messages: AgentMessage[], dom?: string, screenshot?: string }`
    - `AgentApiResponse`: `{ action: AgentAction, params: ActionParams, reasoning?: string }` OR `{ text: string }` (for text-only responses)
  - Uses `tauriFetch` from `@tauri-apps/plugin-http` (same pattern as grading-api.ts)
  - Uses `authHeaders()` pattern from grading-api.ts for Bearer token
  - Robust JSON extraction from AI response: strip code fences, find first `{...}`, handle trailing commas (reuse parseDiscoveryResponse pattern from discover.ts)

  **Must NOT do**:
  - Do NOT add retry logic
  - Do NOT modify grading-api.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single fetch wrapper with JSON parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 6, 8, 11
  - **Blocked By**: Task 1 (needs types)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/grading-api.ts:192-238` — gradeStudent fetch pattern with authHeaders
  - `ogre-desktop/src/lib/discover.ts:280-350` — JSON extraction from AI response

  **WHY Each Reference Matters**:
  - grading-api.ts shows tauriFetch pattern and authHeaders usage
  - discover.ts shows robust JSON extraction from AI text

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/agent-api.ts`
  - [ ] sendAgentRequest returns proper AgentApiResponse
  - [ ] Auth headers are included
  - [ ] JSON extraction handles code fences and malformed JSON

  **QA Scenarios:**
  ```
  Scenario: API client sends request with auth
    Tool: Bash
    Steps:
      1. Mock tauriFetch
      2. Call sendAgentRequest with messages
    Expected Result: Request includes Authorization header
    Evidence: .sisyphus/evidence/task-4-auth-headers.json

  Scenario: JSON extraction from fenced response
    Tool: Bash
    Steps:
      1. Pass AI response with ```json ... ``` wrapper
      2. Verify extracted JSON is valid
    Evidence: .sisyphus/evidence/task-4-json-extract.json
  ```

  **Commit**: YES
  - Message: `feat(agent): add agent API client for POST /api/agent`
  - Files: `ogre-desktop/src/lib/agent-api.ts`
  - Pre-commit: `bun test`

- [x] 5. Server POST /api/agent Endpoint

  **What to do**:
  - Create `grading-server/agent.js` (new) + update `grading-server/server.js` to register route
  - New endpoint: `POST /api/agent`
  - Request body: `{ messages: [{role, content}], dom?: string, screenshot?: string }`
  - Auth: same Bearer token validation as existing endpoints
  - Implementation:
    - Build a messages array for the AI provider: system prompt (from Task 7) + conversation history + current page context
    - If screenshot provided, include as vision content (base64 image) in the last user message (same pattern as discover.ts vision requests)
    - If dom provided, include as text in the last user message
    - Call `callProviderDirect()` from existing providers.js (NO modifications to providers.js)
    - Return raw AI text response (client-side parsing handles JSON extraction)
  - Validation: 400 if missing `messages` field. 401 if bad token.

  **Must NOT do**:
  - Do NOT modify providers.js
  - Do NOT add tool-calling to request builders
  - Do NOT use SSE/streaming

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Server-side endpoint with auth, request building, and AI provider integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Tasks 6, 7, 11
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `grading-server/bundle.js:2938-3004` — extractGradingData pattern showing server-side automation
  - server.js POST /api/chat handler — routing pattern

  **WHY Each Reference Matters**:
  - bundle.js shows how to call AI providers from server-side
  - server.js shows routing and auth pattern for POST endpoints

  **Acceptance Criteria**:
  - [ ] POST /api/agent returns 200 with AI response
  - [ ] POST /api/agent without messages returns 400
  - [ ] POST /api/agent without auth returns 401
  - [ ] Screenshot included in AI request when provided
  - [ ] DOM included in AI request when provided

  **QA Scenarios:**
  ```
  Scenario: Endpoint rejects missing messages
    Tool: Bash
    Steps:
      1. curl -X POST http://localhost:3456/api/agent -H "Content-Type: application/json" -d '{}'
    Expected Result: 400 status
    Evidence: .sisyphus/evidence/task-5-missing-messages.json

  Scenario: Endpoint rejects bad auth
    Tool: Bash
    Steps:
      1. curl -X POST http://localhost:3456/api/agent -H "Content-Type: application/json" -H "Authorization: Bearer invalid" -d '{"messages":[]}'
    Expected Result: 401 status
    Evidence: .sisyphus/evidence/task-5-bad-auth.json

  Scenario: Endpoint accepts valid request
    Tool: Bash
    Steps:
      1. curl -X POST http://localhost:3456/api/agent -H "Content-Type: application/json" -H "Authorization: Bearer valid" -d '{"messages":[{"role":"user","content":"test"}]}'
    Expected Result: 200 status with response
    Evidence: .sisyphus/evidence/task-5-valid-request.json
  ```

  **Commit**: YES
  - Message: `feat(agent): add POST /api/agent endpoint to grading server`
  - Files: `grading-server/agent.js`, `grading-server/server.js`
  - Pre-commit: `bun test`

- [x] 6. Agent Loop with Review/Auto Modes

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-loop.ts`
  - Core agent loop as async generator: `async function* runAgentLoop(config: AgentLoopConfig): AsyncGenerator<AgentEvent>`
  - `AgentLoopConfig`: `{ mode: AgentMode, initialMessage: string, config?: AgentConfig, signal?: AbortSignal }`
  - `AgentEvent` types:
    - `{ type: 'thinking' }` — AI is being called
    - `{ type: 'propose', action: AgentAction, params: ActionParams, reasoning: string }` — AI proposed an action (review mode pauses here)
    - `{ type: 'executing', action: AgentAction, params: ActionParams }` — action being executed
    - `{ type: 'result', action: AgentAction, result: ActionResult }` — action completed
    - `{ type: 'text', content: string }` — AI responded with plain text (no action)
    - `{ type: 'done', message: string }` — agent completed task
    - `{ type: 'error', message: string }` — agent encountered fatal error
  - Loop logic:
    1. Capture page state: `captureInteractiveDom()` + `captureWebviewScreenshot()` (fall back to DOM-only if screenshot fails)
    2. Call `sendAgentRequest()` with messages + dom + screenshot
    3. Parse response: if action → yield propose event. If text → yield text event.
    4. In review mode: yield propose and WAIT for external `approve()` or `skip()` call via callback
    5. In auto mode: auto-approve all actions EXCEPT runJS (always requires explicit approval even in auto mode)
    6. Execute action via `executeAction()`
    7. Yield result event
    8. Add action + result to conversation history
    9. If action was `done` → yield done event, exit
    10. Check safety: max steps, max time, loop detection (same action+params 3x in a row)
    11. Wait `actionDelayMs` between actions
    12. Go to step 1
  - Export `createAgentController()` that returns `{ start(), approve(), skip(), stop(), events: AsyncGenerator }`

  **Must NOT do**:
  - Do NOT add persistence
  - Do NOT modify other files
  - Do NOT use streaming

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex async generator with state machine, approval callbacks, safety checks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Tasks 8, 10, 12
  - **Blocked By**: Tasks 1, 2, 3, 4, 5, 7

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/confirmation-flow.ts` — Promise-resolve pattern for user approval
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:441-448` — requestStudentReview Promise-based gate pattern

  **WHY Each Reference Matters**:
  - confirmation-flow.ts shows how to pause execution and wait for external approve/skip
  - BatchPanel shows Promise-based gating pattern for review mode

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/agent-loop.ts`
  - [ ] Async generator yields all event types
  - [ ] Review mode pauses at propose events
  - [ ] Auto mode auto-approves except runJS
  - [ ] Safety limits enforced (max steps, time, loop detection)
  - [ ] createAgentController returns correct interface

  **QA Scenarios:**
  ```
  Scenario: Review mode pauses at propose
    Tool: Bash
    Steps:
      1. Start agent in review mode
      2. Verify 'propose' event is yielded
      3. Verify execution pauses until approve() called
    Expected Result: Execution pauses at propose
    Evidence: .sisyphus/evidence/task-6-review-pause.json

  Scenario: Auto mode executes without pausing
    Tool: Bash
    Steps:
      1. Start agent in auto mode
      2. Verify actions execute without waiting for approval
    Expected Result: Actions execute automatically
    Evidence: .sisyphus/evidence/task-6-auto-execute.json

  Scenario: Max steps terminates loop
    Tool: Bash
    Steps:
      1. Set maxSteps to 3
      2. Start agent
    Expected Result: Loop terminates after 3 actions
    Evidence: .sisyphus/evidence/task-6-max-steps.json
  ```

  **Commit**: YES
  - Message: `feat(agent): add client-side agent loop with review/auto modes`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`
  - Pre-commit: `bun test`

- [x] 7. System Prompt + JSON Response Parser

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-prompt.ts`
  - Export `buildAgentSystemPrompt(tools: ToolDefinition[]): string` that generates the system prompt
  - System prompt must:
    - Describe the agent's role: "You are a browser automation agent..."
    - List all 9 available actions with their parameters in a structured format
    - Instruct AI to respond with EXACTLY ONE action per turn as JSON: `{ "action": "click", "params": { "selector": "#btn" }, "reasoning": "Clicking the login button" }`
    - Instruct AI to respond with `{ "text": "..." }` for conversational responses (no browser action needed)
    - Include examples of correct responses
    - Include error handling instructions: "If an action fails, analyze the error and try a different approach"
  - Export `parseAgentResponse(rawText: string): AgentApiResponse` that extracts JSON from AI text
    - Strip markdown code fences (```json ... ```)
    - Find first `{` to last matching `}`
    - Handle trailing commas, single quotes, unquoted keys
    - Fallback: if no valid JSON found, treat entire response as `{ text: rawText }`
  - Export `ToolDefinition[]` constant with all 9 tools defined

  **Must NOT do**:
  - Do NOT add prompt editing UI
  - Do NOT make dynamic prompts (system prompt is hardcoded for v1)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering + robust JSON parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: Tasks 1, 2, 5

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:100-200` — DISCOVERY_SYSTEM_PROMPT pattern
  - `ogre-desktop/src/lib/discover.ts:280-350` — parseDiscoveryResponse JSON extraction logic

  **WHY Each Reference Matters**:
  - discover.ts shows how to write structured system prompts
  - discover.ts shows JSON extraction from AI text

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/agent-prompt.ts`
  - [ ] buildAgentSystemPrompt returns valid prompt string
  - [ ] parseAgentResponse extracts JSON from fenced/unfenced responses
  - [ ] parseAgentResponse handles malformed JSON gracefully
  - [ ] ToolDefinition array has all 9 tools

  **QA Scenarios:**
  ```
  Scenario: Parse extracts JSON from code fence
    Tool: Bash
    Steps:
      1. Call parseAgentResponse with ```json { "action": "click" } ```
    Expected Result: { action: 'click', params: {}, reasoning: '' }
    Evidence: .sisyphus/evidence/task-7-parse-fenced.json

  Scenario: Parse falls back to text on invalid JSON
    Tool: Bash
    Steps:
      1. Call parseAgentResponse with 'Hello, I can help you with that'
    Expected Result: { text: 'Hello, I can help you with that' }
    Evidence: .sisyphus/evidence/task-7-parse-fallback.json
  ```

  **Commit**: YES
  - Message: `feat(agent): add system prompt and JSON response parser`
  - Files: `ogre-desktop/src/lib/agent-prompt.ts`
  - Pre-commit: `bun test`

- [x] 8. AgentChat.svelte Component

  **What to do**:
  - Create `ogre-desktop/src/components/grading/AgentChat.svelte`
  - Replace SolverChat.svelte entirely. Match its CSS patterns/variables but new structure.
  - UI layout (top to bottom):
    - Header: "Agent" title + mode toggle (⚡ Auto / 👁 Review radio buttons — same pattern as BatchPanel) + Clear button
    - Status bar: shows agent state (idle/thinking/executing/done) + step counter "Step 3/30" + stop button
    - Message area (scrollable):
      - User messages (right-aligned, blue — same as SolverChat)
      - AI text responses (left-aligned, card bg — same as SolverChat)
      - Action proposal cards: colored card showing `action(params)` + reasoning + Approve/Skip buttons (review mode only)
      - Action result cards: green (success) or red (error) showing result summary
      - Thinking indicator (animated dots — same as SolverChat)
    - Input area: textarea + Send button (same as SolverChat)
  - Svelte 5 runes ($state, $derived, $effect) — match existing component patterns
  - On send: auto-capture page context (screenshot + DOM), start agent loop
  - On tab switch away: stop agent loop if running
  - Wire `approve()` and `skip()` from agent controller to Approve/Skip button clicks
  - Disable send button when agent is running or webview is not open
  - Show "Navigate to a page first" message if webview not open

  **Must NOT do**:
  - Do NOT add markdown rendering
  - Do NOT persist conversations
  - Do NOT use complex component hierarchy

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex UI with state management, animations, approval buttons
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: Tasks 9, 12
  - **Blocked By**: Tasks 1, 4, 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/SolverChat.svelte` — ENTIRE FILE for chat UI, message styling, input area
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:750-774` — auto/review mode toggle pattern

  **WHY Each Reference Matters**:
  - SolverChat is the base template to replace
  - BatchPanel shows mode toggle radio button pattern

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/components/grading/AgentChat.svelte`
  - [ ] Header shows mode toggle
  - [ ] Status bar shows step counter
  - [ ] Message area displays all message types
  - [ ] Action cards have Approve/Skip in review mode
  - [ ] Input area sends messages
  - [ ] Component disables when webview not open

  **QA Scenarios:**
  ```
  Scenario: Mode toggle switches between Auto and Review
    Tool: Playwright
    Steps:
      1. Navigate to Agent tab
      2. Click Auto radio button
      3. Click Review radio button
    Expected Result: Toggle switches modes
    Evidence: .sisyphus/evidence/task-8-mode-toggle.png

  Scenario: Send message starts agent loop
    Tool: Playwright
    Steps:
      1. Type message in input
      2. Click Send
    Expected Result: Thinking indicator appears
    Evidence: .sisyphus/evidence/task-8-send-message.png
  ```

  **Commit**: YES
  - Message: `feat(agent): add AgentChat.svelte component`
  - Files: `ogre-desktop/src/components/grading/AgentChat.svelte`
  - Pre-commit: `npm run build`

- [x] 9. GradingPanel Integration

  **What to do**:
  - Update `ogre-desktop/src/pages/GradingPanel.svelte`
  - Remove SolverChat import, add AgentChat import
  - Rename "Solver" tab label to "Agent" in the mode tabs
  - Replace `<SolverChat />` component usage with `<AgentChat />`
  - Verify all existing props/bindings still work (grader mode, discovery mode, batch mode)

  **Must NOT do**:
  - Do NOT change any other tab's behavior
  - Do NOT modify grader or discovery modes
  - Do NOT change component hierarchy beyond the Solver→Agent swap

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple import and prop changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 12
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte` — the file being modified

  **WHY Each Reference Matters**:
  - Need to understand current tab structure and SolverChat usage

  **Acceptance Criteria**:
  - [ ] "Solver" tab renamed to "Agent"
  - [ ] AgentChat imported and used
  - [ ] SolverChat no longer imported
  - [ ] Other tabs still work

  **QA Scenarios:**
  ```
  Scenario: Tab shows "Agent" label
    Tool: Playwright
    Steps:
      1. Navigate to GradingPanel
      2. Check tab labels
    Expected Result: "Agent" tab visible, no "Solver" tab
    Evidence: .sisyphus/evidence/task-9-tab-label.png
  ```

  **Commit**: YES
  - Message: `feat(agent): rename Solver tab to Agent and wire AgentChat`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`
  - Pre-commit: `npm run build`

- [x] 10. Unit Tests for browser-actions + agent-loop

  **What to do**:
  - Create `ogre-desktop/src/lib/browser-actions.test.ts`
  - Create `ogre-desktop/src/lib/agent-loop.test.ts`
  - browser-actions tests:
    - Each action returns ActionResult (success case + error case)
    - Unknown action returns error, not crash
    - runJS blocks DANGEROUS_JS_PATTERNS
    - executeAction dispatches to correct handler
  - agent-loop tests:
    - Auto mode executes without pausing
    - Max steps terminates
    - Same-action-3x loop detection terminates
    - done() action terminates
    - Cancellation via AbortController
  - Mock evalScript/evalScriptJSON and sendAgentRequest for unit testing

  **Must NOT do**:
  - Do NOT make real API calls
  - Do NOT test with actual webview

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test file creation with comprehensive coverage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Tasks 11, 12)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 3, 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.test.ts` — test file pattern
  - `ogre-desktop/src/lib/browser.test.ts` — browser module test patterns

  **WHY Each Reference Matters**:
  - discover.test.ts shows test file patterns
  - browser.test.ts shows how to mock browser functions

  **Acceptance Criteria**:
  - [ ] browser-actions.test.ts exists and passes
  - [ ] agent-loop.test.ts exists and passes
  - [ ] All action handlers tested
  - [ ] Safety limits tested

  **QA Scenarios:**
  ```
  Scenario: All browser-actions tests pass
    Tool: Bash
    Steps:
      1. cd ogre-desktop && bun test browser-actions.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-10-browser-actions.txt

  Scenario: All agent-loop tests pass
    Tool: Bash
    Steps:
      1. cd ogre-desktop && bun test agent-loop.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-10-agent-loop.txt
  ```

  **Commit**: YES
  - Message: `test(agent): add unit tests for browser-actions and agent-loop`
  - Files: `ogre-desktop/src/lib/browser-actions.test.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `bun test`

- [x] 11. Integration Tests for /api/agent

  **What to do**:
  - Create `grading-server/test/agent.test.js`
  - Tests:
    - POST /api/agent with valid messages → 200 with response
    - POST /api/agent without messages → 400
    - POST /api/agent without auth → 401
    - POST /api/agent with screenshot field → request includes image in AI call
    - POST /api/agent with dom field → request includes DOM text in AI call
  - Mock the AI provider call (don't make real API calls in tests)

  **Must NOT do**:
  - Do NOT make real API calls to AI provider

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Server-side integration tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Tasks 10, 12)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `grading-server/test/` — existing test directory and patterns

  **WHY Each Reference Matters**:
  - Need to match existing test patterns in grading-server

  **Acceptance Criteria**:
  - [ ] File exists: `grading-server/test/agent.test.js`
  - [ ] All test cases pass
  - [ ] Valid request returns 200
  - [ ] Missing messages returns 400
  - [ ] Bad auth returns 401

  **QA Scenarios:**
  ```
  Scenario: API tests pass
    Tool: Bash
    Steps:
      1. cd grading-server && bun test agent.test.js
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-11-agent-api.txt
  ```

  **Commit**: YES
  - Message: `test(agent): add integration tests for POST /api/agent`
  - Files: `grading-server/test/agent.test.js`
  - Pre-commit: `bun test`

- [x] 12. End-to-End QA

  **What to do**:
  - No new files — verification task only
  - Run full build: `cd ogre-desktop && npm run build` → must succeed
  - Run all tests: `cd ogre-desktop && bun test` → all pass
  - Start the app and verify:
    - Browser page loads, webview works
    - GradingPanel drawer opens, shows "Agent" tab (not "Solver")
    - Grader tab still works
    - Discovery tab still works
    - Agent tab shows chat UI with mode toggle
    - Typing a message and sending shows thinking state
    - If grading server running with valid provider: verify actual agent interaction works
  - Capture screenshots as evidence

  **Must NOT do**:
  - Do NOT skip any verification step

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Comprehensive end-to-end verification
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Tasks 10, 11)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: All previous tasks

  **References**:

  **Pattern References**:

  **WHY Each Reference Matters**:

  **Acceptance Criteria**:
  - [ ] npm run build succeeds
  - [ ] bun test passes
  - [ ] Agent tab visible and working
  - [ ] All existing tabs still work
  - [ ] Agent can execute actions on webview

  **QA Scenarios:**
  ```
  Scenario: Full build succeeds
    Tool: Bash
    Steps:
      1. cd ogre-desktop && npm run build
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-12-build.txt

  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. cd ogre-desktop && bun test
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-12-tests.txt

  Scenario: Agent tab loads and shows mode toggle
    Tool: Playwright
    Steps:
      1. Start app
      2. Open GradingPanel
      3. Click Agent tab
    Expected Result: Mode toggle visible
    Evidence: .sisyphus/evidence/task-12-agent-tab.png
  ```

  **Commit**: NO
  - Message: N/A (verification task, evidence only)
  - Files: `.sisyphus/evidence/`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` (or build equivalent). Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message | Files | Pre-commit |
|---|---|---|---|
| 1 | `feat(agent): add shared types and constants for browser agent` | `agent-types.ts` | `bun test` |
| 2 | `feat(agent): add interactive-only DOM snapshot for agent context` | `agent-dom.ts` | `bun test` |
| 3 | `feat(agent): add browser action executor library (9 actions)` | `browser-actions.ts` | `bun test` |
| 4 | `feat(agent): add agent API client for POST /api/agent` | `agent-api.ts` | `bun test` |
| 5 | `feat(agent): add POST /api/agent endpoint to grading server` | `grading-server/agent.js`, `grading-server/server.js` | `bun test` |
| 6 | `feat(agent): add client-side agent loop with review/auto modes` | `agent-loop.ts` | `bun test` |
| 7 | `feat(agent): add system prompt and JSON response parser` | `agent-prompt.ts` | `bun test` |
| 8 | `feat(agent): add AgentChat.svelte component` | `AgentChat.svelte` | `npm run build` |
| 9 | `feat(agent): rename Solver tab to Agent and wire AgentChat` | `GradingPanel.svelte` | `npm run build` |
| 10-11 | `test(agent): add unit and API integration tests` | `*.test.ts` | `bun test` |
| 12 | `chore(agent): add E2E QA evidence` | `.sisyphus/evidence/` | — |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build         # Expected: exit code 0
cd ogre-desktop && bun test              # Expected: all tests pass
curl -s http://localhost:3456/api/agent -X POST -H "Content-Type: application/json" -d '{"messages":[]}' -w "%{http_code}" # Expected: 400 (validation)
curl -s http://localhost:3456/health     # Expected: {"status":"ok"}
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Build succeeds
- [x] Agent tab visible in GradingPanel
- [x] SolverChat no longer imported
- [x] Agent executes actions on webview
- [x] Review mode shows Approve/Skip
- [x] Auto mode runs without pausing
- [x] Safety limits enforced (max steps, time, loop detection)
