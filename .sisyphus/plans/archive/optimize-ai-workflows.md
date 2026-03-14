# Optimize AI Workflows & Prompt Injections

## TL;DR

> **Quick Summary**: Add retry/resilience to all non-batch AI call paths in the **desktop app** (`ogre-desktop`), optimize the remaining prompt templates in `discover.ts` and `grading-api.ts`, fix the server-side single-grade prompt, wire the shared grading philosophy constant into the server (already done — verify), and write tests.
>
> **Scope**: Desktop app (`ogre-desktop/src/lib/`) + grading server (`grading-server/`). Chrome extension (`sidepanel.js`, `prompts.js`) is OUT OF SCOPE.
>
> **Deliverables**:
> - `ogre-desktop/src/lib/ai-retry.ts` — TypeScript retry wrapper with exponential backoff
> - Retry wired into `gradeStudent()`, `sendSolverMessage()`, `callDiscoveryAI()`, `parseRubricFromScreenshot()` in `grading-api.ts` and `discover.ts`
> - `RUBRIC_EXTRACTION_PROMPT` in `discover.ts` improved with 1 few-shot example
> - `buildSingleGradePrompt` in `grading-server/grading.js` verified/optimized + retry
> - Test suite covering retry logic, `parseRubricExtractionResponse`, and prompt content
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 → T2 → T3 → T5 → T6 → F1-F3

---

## Context

### Original Request
Optimize each AI workflow and injection across the O.G.R.E project targeting the **desktop app** (`ogre-desktop`) and the **grading server** — NOT the Chrome extension.

### Architecture Summary

**Desktop app** (`ogre-desktop/src/lib/`) — Svelte 5 + TypeScript + Tauri:
- All AI calls go through the local grading server at `http://localhost:3456`
- `grading-api.ts` — `gradeStudent()`, `sendSolverMessage()`, `startBatchGrading()` (SSE)
- `discover.ts` — `callDiscoveryAI()` (selector discovery), `parseRubricFromScreenshot()` (rubric extraction from image)
- No retry on any of these call sites — transient server errors fail silently
- `runDiscovery()` has a manual retry loop for **parse failures** only (not HTTP errors)

**Grading server** (`grading-server/`):
- Already has `grading-constants.js` with `GRADING_PHILOSOPHY` imported everywhere — DONE
- `ai-retry.js` exists at root level — **does NOT exist in grading-server/ yet**
- `buildSingleGradePrompt` is in scope for optimization

**Chrome extension** (`sidepanel.js`, `prompts.js`) — **OUT OF SCOPE**:
- The desktop app replaces the Chrome extension as the primary target
- Extension files remain unchanged

### What's Already Done (Desktop App)
- `discover.ts` has excellent `DISCOVERY_SYSTEM_PROMPT` with explicit JSON-only instructions
- `discover.ts` has `RUBRIC_EXTRACTION_PROMPT` with "no code fences" instruction
- `discover.ts` `parseRubricExtractionResponse()` handles markdown fences, think-blocks, type coercion
- `discover.ts` `runDiscovery()` retries parse failures (not HTTP errors)
- `grading-server/grading-constants.js` exists and is imported by `grading.js`

### What's Missing
1. **Retry wrapper** for `gradeStudent()` and `sendSolverMessage()` in `grading-api.ts`
2. **HTTP-level retry** in `callDiscoveryAI()` (currently only parse failures retry)
3. **Retry** in `parseRubricFromScreenshot()` — currently no retry at all
4. **Few-shot example** in `RUBRIC_EXTRACTION_PROMPT` (has no-fences instruction but no example)
5. **`grading-server/ai-retry.js`** — doesn't exist yet in the server directory
6. **Server-side prompt optimization** — `buildSingleGradePrompt` missing half-point instruction
7. **Tests** for retry logic and parsers in the desktop app (vitest configured)

### Must Have
- Retry on transient HTTP errors (429, 500, 502, 503) in `gradeStudent`, `sendSolverMessage`, `callDiscoveryAI`, `parseRubricFromScreenshot`
- `ai-retry.ts` in `ogre-desktop/src/lib/` as TypeScript module
- `grading-server/ai-retry.js` — server version
- Few-shot example in `RUBRIC_EXTRACTION_PROMPT`
- Half-point score instruction in `buildSingleGradePrompt`
- Test suite using vitest (desktop) and bun test (server)

### Must NOT Have (Guardrails)
- DO NOT change batch grading functions (`buildBatchPrompt`, `buildOutlierReviewPrompt`, `buildCompactSweepPrompt`, `buildPairwiseSweepPrompts`) — UNTOUCHABLE
- DO NOT change batch grading flow in desktop `BatchPanel.svelte` or `batch-grader.ts`
- DO NOT wrap `startBatchGrading()` with retry — batch handles its own flow
- DO NOT change Chrome extension files (`sidepanel.js`, `prompts.js`, `sidepanel.html`)
- DO NOT add circuit breaker, health check, or provider fallback patterns
- DO NOT change the `DISCOVERY_SYSTEM_PROMPT` — it is already optimal
- DO NOT change `runDiscovery()` parse-failure retry loop — only ADD HTTP retry to `callDiscoveryAI`
- DO NOT mock Chrome APIs or Tauri APIs in tests — only test pure functions
- DO NOT change the grading-constants.js or grading philosophy text — already correct
- DO NOT add chain-of-thought restructuring or tool-use conversion to prompts

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

- **Retry wrapper**: `vitest run` (desktop) — call with mock functions returning 503 then success
- **Parsing**: `vitest run` — call `parseRubricExtractionResponse` with test inputs
- **Server retry**: `bun test` (grading-server) — identical retry tests
- **Prompt content**: node/vitest — call prompt builder, grep for expected strings
- **No regression**: `vitest run` in ogre-desktop must pass all pre-existing tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Prerequisites — independent, parallel):
├── Task 1: Create ai-retry.ts for desktop app [quick]
└── Task 2: Create grading-server/ai-retry.js [quick]

Wave 1 (Wire Retry — after Wave 0):
├── Task 3: Wire retry into grading-api.ts (gradeStudent + sendSolverMessage) [unspecified-high]
└── Task 4: Wire HTTP retry into callDiscoveryAI + parseRubricFromScreenshot [unspecified-high]

Wave 2 (Prompt Optimization — after Wave 0, parallel with Wave 1):
├── Task 5: Add few-shot example to RUBRIC_EXTRACTION_PROMPT in discover.ts [quick]
└── Task 6: Optimize buildSingleGradePrompt (server) + wire server retry [quick]

Wave 3 (Tests — after Waves 1+2):
├── Task 7: Test suite for retry wrapper and parseRubricExtractionResponse [unspecified-high]
└── Task 8: Prompt snapshot tests for desktop + server prompts [quick]

Wave FINAL (After ALL tasks — parallel):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
└── Task F3: Real QA — run vitest + bun test [unspecified-high]

Critical Path: T1 → T3 → T7 → F1-F3
Parallel Speedup: ~55% faster than sequential
Max Concurrent: 4 (Waves 1+2 together)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 3, 4, 7 |
| 2 | — | 6, 7 |
| 3 | 1 | 7 |
| 4 | 1 | 7 |
| 5 | — | 8 |
| 6 | 2 | 8 |
| 7 | 1, 2, 3, 4 | F1-F3 |
| 8 | 5, 6 | F1-F3 |

### Agent Dispatch Summary

- **Wave 0**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 1**: 2 tasks — T3 → `unspecified-high`, T4 → `unspecified-high`
- **Wave 2**: 2 tasks — T5 → `quick`, T6 → `quick`
- **Wave 3**: 2 tasks — T7 → `unspecified-high`, T8 → `quick`
- **FINAL**: 3 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`

---

## TODOs

- [ ] 1. Create ai-retry.ts for desktop app

  **What to do**:
  - Create `ogre-desktop/src/lib/ai-retry.ts` as a TypeScript module
  - Export a `withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>` function
  - `RetryOptions`: `{ maxRetries?: number; baseDelay?: number; onRetry?: (attempt: number, error: Error) => void }`
  - Defaults: `maxRetries = 3`, `baseDelay = 1000` (ms)
  - Retryable: HTTP status 429, 500, 502, 503, and network errors (no `.status` property)
  - NOT retryable: 400, 401, 403, 404 (client errors — don't retry)
  - Exponential backoff: delay = `baseDelay * 3^(attempt-1)` → 1s, 3s, 9s
  - Error detection: check `(error as any).status`, or `error.message` includes the status code string
  - On final failure, throw the last error unchanged
  - The wrapper is generic — wraps any async function

  **Must NOT do**:
  - Do NOT use Chrome APIs
  - Do NOT add circuit breaker or provider fallback
  - Do NOT make retry specific to any provider

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Task 2)
  - **Blocks**: Tasks 3, 4, 7
  - **Blocked By**: None

  **References**:
  - `ai-retry.js` (repo root) — Existing JS version with identical logic to port to TypeScript
  - `ogre-desktop/src/lib/grading-api.ts` — Example of TypeScript module style in this project
  - `ogre-desktop/src/lib/constants.ts` — Example of how constants/types are exported

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/src/lib/ai-retry.ts` exists and exports `withRetry`
  - [ ] Retries on 429, 500, 502, 503 and network errors
  - [ ] Does NOT retry on 400, 401, 403, 404
  - [ ] Exponential backoff: 1s, 3s, 9s (default)
  - [ ] `onRetry` callback called with attempt number and error
  - [ ] TypeScript: no type errors, no `any` suppressions

  **QA Scenarios**:

  ```
  Scenario: Retry on 503 then succeed
    Tool: vitest (mock function)
    Steps:
      1. Create test: call withRetry with fn that throws 503 twice then returns 'ok'
      2. Assert return value is 'ok', fn called 3 times
    Expected Result: Retries twice then returns on third call
    Evidence: .sisyphus/evidence/task-1-retry-success.txt

  Scenario: No retry on 401
    Tool: vitest
    Steps:
      1. Create test: call withRetry with fn that always throws 401
      2. Assert fn called exactly 1 time, error propagated
    Expected Result: Fails immediately without retrying
    Evidence: .sisyphus/evidence/task-1-no-retry-auth.txt
  ```

  **Commit**: YES (group with Wave 0)
  - Message: `feat(desktop): add TypeScript retry wrapper for AI calls`
  - Files: `ogre-desktop/src/lib/ai-retry.ts`

- [ ] 2. Create grading-server/ai-retry.js

  **What to do**:
  - Check if `grading-server/ai-retry.js` already exists — if YES, verify it matches spec and skip creation
  - If NO: copy `ai-retry.js` (repo root) to `grading-server/ai-retry.js`
  - Ensure it works in Bun/Node (no browser APIs)
  - Logic must be identical to Task 1: same retryable codes, same backoff, same `onRetry` callback

  **Must NOT do**:
  - Do NOT create a cross-runtime shared import
  - Do NOT change batch grading flow to use this

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Task 1)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:
  - `ai-retry.js` (repo root) — Source to copy from
  - `grading-server/` — Target directory

  **Acceptance Criteria**:
  - [ ] `grading-server/ai-retry.js` exists and exports `withRetry`
  - [ ] Works in Bun environment: `bun -e "import('./ai-retry.js').then(m => console.log(typeof m.withRetry))"`

  **QA Scenarios**:

  ```
  Scenario: Server retry module loads
    Tool: Bash (bun)
    Steps:
      1. Run (from grading-server/): bun -e "import('./ai-retry.js').then(m => console.log(typeof m.withRetry))"
      2. Assert output is "function"
    Expected Result: Module exports correctly
    Evidence: .sisyphus/evidence/task-2-server-retry.txt
  ```

  **Commit**: YES (group with Wave 0)
  - Message: `feat(server): add retry wrapper for server AI calls`
  - Files: `grading-server/ai-retry.js`

- [ ] 3. Wire retry into grading-api.ts (gradeStudent + sendSolverMessage)

  **What to do**:
  - Import `withRetry` from `./ai-retry` in `ogre-desktop/src/lib/grading-api.ts`
  - In `gradeStudent()` (line 187): wrap the `tauriFetch` call with `withRetry`
    - The entire fetch + response check + json parse should be inside the retry fn
    - On retry, the `onRetry` callback should be passed but is optional — callers can ignore it
    - Make `gradeStudent` accept an optional `onRetry?: (attempt: number, error: Error) => void` in its `GradeRequest` type
  - In `sendSolverMessage()` (line 243): wrap the `tauriFetch` call with `withRetry`
    - Only the initial fetch should be retried — NOT the SSE stream reading
    - Make `sendSolverMessage` accept an optional `onRetry` in `SolverMessageOptions`
  - Do NOT wrap `startBatchGrading()` — that uses SSE streaming and manages its own error handling

  **Must NOT do**:
  - Do NOT retry the SSE stream reading — only the initial POST
  - Do NOT wrap `startBatchGrading()`
  - Do NOT change the SSE parsing logic
  - Do NOT suppress TypeScript errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:
  - `ogre-desktop/src/lib/grading-api.ts:187-225` — `gradeStudent()` — wrap tauriFetch call
  - `ogre-desktop/src/lib/grading-api.ts:243-279` — `sendSolverMessage()` — wrap initial tauriFetch
  - `ogre-desktop/src/lib/grading-api.ts:566-653` — `startBatchGrading()` — DO NOT touch
  - `ogre-desktop/src/lib/ai-retry.ts` — Retry wrapper (Task 1)

  **Acceptance Criteria**:
  - [ ] `withRetry` imported in `grading-api.ts`
  - [ ] `gradeStudent()` fetch is wrapped with retry
  - [ ] `sendSolverMessage()` fetch is wrapped with retry (only the POST, not the stream)
  - [ ] `startBatchGrading()` is NOT wrapped
  - [ ] `GradeRequest` and `SolverMessageOptions` have optional `onRetry` field
  - [ ] TypeScript compiles with no errors

  **QA Scenarios**:

  ```
  Scenario: Retry imported in grading-api
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "withRetry" ogre-desktop/src/lib/grading-api.ts
      2. Assert output >= 2 (at least 2 usages)
    Expected Result: withRetry used for both gradeStudent and sendSolverMessage
    Evidence: .sisyphus/evidence/task-3-retry-wired.txt

  Scenario: startBatchGrading untouched
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "withRetry" ogre-desktop/src/lib/grading-api.ts
      2. Assert no matches within the startBatchGrading function body
    Expected Result: Batch grading call site has no retry wrapper
    Evidence: .sisyphus/evidence/task-3-batch-untouched.txt

  Scenario: TypeScript compiles
    Tool: Bash (tsc)
    Steps:
      1. Run (from ogre-desktop/): npx tsc --noEmit
      2. Assert exit code 0 and no errors mentioning grading-api.ts
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-3-tsc.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `feat(desktop): wire retry into grading-api AI call paths`
  - Files: `ogre-desktop/src/lib/grading-api.ts`

- [ ] 4. Wire HTTP retry into callDiscoveryAI + parseRubricFromScreenshot

  **What to do**:
  - Import `withRetry` from `./ai-retry` in `ogre-desktop/src/lib/discover.ts`
  - In `callDiscoveryAI()` (around line 626): wrap the `tauriFetch` call with `withRetry`
    - Only retry HTTP errors — the parse-failure retry loop in `runDiscovery()` is SEPARATE and handles parse issues
    - Do NOT add another retry loop — just wrap the `tauriFetch` call inside `callDiscoveryAI`
  - In `parseRubricFromScreenshot()` (around line 1135): wrap the `callDiscoveryAI()` call with `withRetry`
    - This adds HTTP retry to the rubric-from-screenshot path which currently has none

  **Must NOT do**:
  - Do NOT change `runDiscovery()`'s parse-failure retry loop
  - Do NOT change the `DISCOVERY_SYSTEM_PROMPT` — it is already optimal
  - Do NOT change `parseDiscoveryResponse` or `parseRubricExtractionResponse`
  - Do NOT suppress TypeScript errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:
  - `ogre-desktop/src/lib/discover.ts:626-671` — `callDiscoveryAI()` — wrap tauriFetch
  - `ogre-desktop/src/lib/discover.ts:1135-1158` — `parseRubricFromScreenshot()` — wrap callDiscoveryAI
  - `ogre-desktop/src/lib/discover.ts:846-902` — `runDiscovery()` parse-failure retry loop — DO NOT change
  - `ogre-desktop/src/lib/ai-retry.ts` — Retry wrapper (Task 1)

  **Acceptance Criteria**:
  - [ ] `withRetry` imported in `discover.ts`
  - [ ] `callDiscoveryAI()` tauriFetch wrapped with retry
  - [ ] `parseRubricFromScreenshot()` callDiscoveryAI wrapped with retry
  - [ ] `runDiscovery()` parse-failure loop unchanged
  - [ ] TypeScript compiles with no errors

  **QA Scenarios**:

  ```
  Scenario: Retry used in discover.ts
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "withRetry" ogre-desktop/src/lib/discover.ts
      2. Assert output >= 2
    Expected Result: withRetry used in both callDiscoveryAI and parseRubricFromScreenshot
    Evidence: .sisyphus/evidence/task-4-discover-retry.txt

  Scenario: TypeScript compiles
    Tool: Bash (tsc)
    Steps:
      1. Run (from ogre-desktop/): npx tsc --noEmit
      2. Assert exit code 0
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-4-tsc.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `feat(desktop): wire HTTP retry into discovery and rubric extraction`
  - Files: `ogre-desktop/src/lib/discover.ts`

- [ ] 5. Add few-shot example to RUBRIC_EXTRACTION_PROMPT

  **What to do**:
  - In `ogre-desktop/src/lib/discover.ts`, find `RUBRIC_EXTRACTION_PROMPT` (around line 964)
  - The prompt already has "Return ONLY a valid JSON object" and the JSON schema — keep those
  - Add 1 concrete few-shot example AFTER the RULES list and BEFORE the JSON schema:
    - Show input description: "Example rubric text: 'Writing Quality (10 pts): Grammar, style, and clarity'"
    - Show expected JSON output for that example
  - The example should demonstrate: criteria name, description, numeric points, and optional question field

  **Must NOT do**:
  - Do NOT change the JSON output schema
  - Do NOT add chain-of-thought or multi-step reasoning
  - Do NOT change the "no code fences" instruction (already present and correct)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run during Wave 1)
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/lib/discover.ts:964-985` — `RUBRIC_EXTRACTION_PROMPT` constant

  **Acceptance Criteria**:
  - [ ] Prompt contains a few-shot example with input text and expected JSON
  - [ ] Existing "no code fences" instruction unchanged
  - [ ] Existing JSON schema structure unchanged
  - [ ] TypeScript compiles

  **QA Scenarios**:

  ```
  Scenario: Prompt has few-shot example
    Tool: Bash (node/grep)
    Steps:
      1. Run: grep -c "Example" ogre-desktop/src/lib/discover.ts
      2. Assert >= 1 match in the RUBRIC_EXTRACTION_PROMPT section
    Expected Result: Example section present in prompt
    Evidence: .sisyphus/evidence/task-5-few-shot.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(prompts): add few-shot example to rubric extraction prompt`
  - Files: `ogre-desktop/src/lib/discover.ts`

- [ ] 6. Optimize buildSingleGradePrompt (server) + wire server retry

  **What to do**:
  - In `grading-server/grading.js:buildSingleGradePrompt` (around lines 652-727):
    - Verify `GRADING_PHILOSOPHY` is already imported and used (it should be — check line 84/421/647 from grep)
    - Add explicit instruction: "Half-point scores are allowed (e.g., 7.5)"
    - Verify "No markdown, no code fences" is in the response format section — if missing, add it
  - In `grading-server/server.js`: find the `/api/chat` route handler that calls the single-grade path
    - Import `withRetry` from `./ai-retry.js`
    - Wrap the AI provider call (inside the route handler, not the prompt builder) with `withRetry`

  **Must NOT do**:
  - Do NOT change batch grading functions
  - Do NOT change response schema
  - Do NOT change `parseSingleGradeResponse`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 2

  **References**:
  - `grading-server/grading.js:652-727` — `buildSingleGradePrompt`
  - `grading-server/grading.js:6` — existing `GRADING_PHILOSOPHY` import
  - `grading-server/server.js` — HTTP routes, find `/api/chat` single-grade handler
  - `grading-server/ai-retry.js` — Retry wrapper (Task 2)

  **Acceptance Criteria**:
  - [ ] `GRADING_PHILOSOPHY` confirmed imported in `grading.js` (verified, not assumed)
  - [ ] Half-point instruction present in `buildSingleGradePrompt`
  - [ ] "No markdown/code fences" instruction present
  - [ ] `withRetry` used in server route for single-grade AI call
  - [ ] `bun test` (grading-server) still passes

  **QA Scenarios**:

  ```
  Scenario: Server prompt has half-point instruction
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "half" grading-server/grading.js
      2. Assert match found in buildSingleGradePrompt section
    Expected Result: Half-point scoring instruction present
    Evidence: .sisyphus/evidence/task-6-half-point.txt

  Scenario: Grading server tests pass
    Tool: Bash (bun)
    Steps:
      1. Run (from grading-server/): bun test
      2. Assert all tests pass
    Expected Result: No test regressions
    Evidence: .sisyphus/evidence/task-6-server-tests.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat(server): optimize single-grade prompt + wire retry`
  - Files: `grading-server/grading.js`, `grading-server/server.js`

- [ ] 7. Test suite for retry wrapper and parseRubricExtractionResponse

  **What to do**:
  - Create `ogre-desktop/src/lib/ai-retry.test.ts` with vitest tests for `withRetry`:
    - Succeeds on first try → returns result, fn called once
    - Throws 503 twice then succeeds → returns result, fn called 3 times
    - Throws 401 → fails immediately, fn called once
    - Exhausts all retries → throws last error
    - `onRetry` called with correct attempt number (1, 2, 3)
    - Uses `baseDelay: 0` to skip actual waiting in tests
  - Create `ogre-desktop/src/lib/discover.test.ts` additions (or new file) for `parseRubricExtractionResponse`:
    - Valid JSON (no fences): parses correctly
    - JSON with ```json fences: strips and parses
    - JSON with ``` fences (no json tag): strips and parses
    - `<think>...</think>` block before JSON: stripped correctly
    - String points (e.g. `"points": "5"`): coerced to number
    - Invalid JSON: throws descriptive error
    - Check if `discover.test.ts` already exists — if so, ADD to it rather than replace

  **Must NOT do**:
  - Do NOT mock Tauri APIs or Chrome APIs
  - Do NOT test actual AI responses (pure function tests only)
  - Do NOT replace existing tests in discover.test.ts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F3
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:
  - `ogre-desktop/src/lib/ai-retry.ts` — Retry wrapper (Task 1)
  - `ogre-desktop/src/lib/discover.ts:1000-1107` — `parseRubricExtractionResponse` function
  - `ogre-desktop/src/lib/discover.test.ts` — Existing test file (check what's already there)
  - `ogre-desktop/vitest.config.ts` — Test config
  - `ogre-desktop/src/lib/grading-api.test.ts` — Example test file for style reference

  **Acceptance Criteria**:
  - [ ] `ai-retry.test.ts` created with all listed test cases
  - [ ] `parseRubricExtractionResponse` tests cover all listed input scenarios
  - [ ] `npx vitest run` (from ogre-desktop/) passes all new tests
  - [ ] No Tauri/Chrome API mocks

  **QA Scenarios**:

  ```
  Scenario: All new tests pass
    Tool: Bash (vitest)
    Steps:
      1. Run (from ogre-desktop/): npx vitest run
      2. Assert all tests pass, 0 failures
    Expected Result: All parser and retry tests pass
    Evidence: .sisyphus/evidence/task-7-test-results.txt
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `test(desktop): add retry wrapper and parser test suites`
  - Files: `ogre-desktop/src/lib/ai-retry.test.ts`, `ogre-desktop/src/lib/discover.test.ts`

- [ ] 8. Prompt snapshot tests

  **What to do**:
  - Create/extend test file in `ogre-desktop/` for prompt content assertions:
    - `RUBRIC_EXTRACTION_PROMPT` in `discover.ts`:
      - Contains "JSON"
      - Does NOT contain "```" (code fence)
      - Contains "Example" (few-shot from Task 5)
      - Contains "suggestedName"
    - `DISCOVERY_SYSTEM_PROMPT` in `discover.ts`:
      - Contains "FORBIDDEN"
      - Does NOT contain "markdown code fences" as permitted text (it forbids them)
      - Contains "confidence"
  - Create test in `grading-server/test/` for `buildSingleGradePrompt`:
    - Contains "half" or "0.5" (half-point instruction from Task 6)
    - Contains "No markdown" or "no code fences"
    - Contains `GRADING_PHILOSOPHY` text (spot-check one phrase from the constant)

  **Must NOT do**:
  - Do NOT test actual AI responses
  - Do NOT snapshot full prompt text (fragile) — test key patterns only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F3
  - **Blocked By**: Tasks 5, 6

  **References**:
  - `ogre-desktop/src/lib/discover.ts` — `RUBRIC_EXTRACTION_PROMPT`, `DISCOVERY_SYSTEM_PROMPT`
  - `grading-server/grading.js:buildSingleGradePrompt` — Server prompt
  - `grading-server/test/chat.test.js` — Existing server test file (add to it)

  **Acceptance Criteria**:
  - [ ] Desktop prompt content tests pass under vitest
  - [ ] Server prompt tests pass under bun test
  - [ ] Key patterns verified, forbidden patterns checked

  **QA Scenarios**:

  ```
  Scenario: All prompt tests pass
    Tool: Bash (vitest + bun test)
    Steps:
      1. Run (from ogre-desktop/): npx vitest run
      2. Assert all prompt snapshot tests pass
      3. Run (from grading-server/): bun test
      4. Assert all tests pass
    Expected Result: Prompt content assertions all green
    Evidence: .sisyphus/evidence/task-8-snapshot-results.txt
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `test(prompts): add prompt content snapshot tests`
  - Files: test files in `ogre-desktop/` and `grading-server/test/`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` in ogre-desktop. Run `bun test` in grading-server. Review all changed files for: dead code, empty catches, console.log in prod, commented-out code, unused imports. Check TypeScript: no `any` suppressions, proper types on retry options. Verify retry is NOT in `startBatchGrading`.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Scope Fidelity Check** — `unspecified-high`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Confirm Chrome extension files (`sidepanel.js`, `prompts.js`, `sidepanel.html`) were NOT modified. Confirm `startBatchGrading` and batch grading server functions were NOT modified. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Extension [UNTOUCHED/MODIFIED] | Batch [UNTOUCHED/MODIFIED] | VERDICT`

---

## Commit Strategy

- **Wave 0**: `feat(desktop,server): add retry wrappers` — ai-retry.ts, grading-server/ai-retry.js
- **Wave 1**: `feat(desktop): wire HTTP retry into AI call paths` — grading-api.ts, discover.ts
- **Wave 2**: `feat(prompts,server): optimize prompts + wire server retry` — discover.ts, grading.js, server.js
- **Wave 3**: `test(desktop,server): add retry and prompt tests` — test files

---

## Success Criteria

### Verification Commands
```bash
# Desktop: TypeScript compiles
cd ogre-desktop && npx tsc --noEmit
# Expected: exit 0, no errors

# Desktop: all tests pass
cd ogre-desktop && npx vitest run
# Expected: all tests pass including new retry + prompt tests

# Server: all tests pass
cd grading-server && bun test
# Expected: all tests pass

# Retry wired in grading-api
grep -c "withRetry" ogre-desktop/src/lib/grading-api.ts
# Expected: >= 2

# Batch untouched
grep -c "withRetry" ogre-desktop/src/lib/batch-grader.ts
# Expected: 0

# Chrome extension untouched
git diff --name-only HEAD | grep -E "sidepanel|prompts\.js"
# Expected: empty (no extension files changed)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `npx vitest run` passes (ogre-desktop)
- [ ] `bun test` passes (grading-server)
- [ ] TypeScript compiles with no errors
- [ ] Batch grading flow unmodified (grading-api.ts `startBatchGrading`, batch-grader.ts)
- [ ] Chrome extension files unmodified
