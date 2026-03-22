# E2E Grading Server Tests — Real Ollama + LFM2

## TL;DR

> **Quick Summary**: Create an automated Vitest E2E test suite that exercises the full grading pipeline — from Ollama connectivity through auth handshake, provider config, single-student chat grading, to full 30-student batch grading with SSE stream parsing — all using a real Ollama instance with the LFM2 model against the demo CLT statistics assignment.
> 
> **Deliverables**:
> - `grading-server/test/e2e-ollama.test.js` — Complete E2E test suite
> - `grading-server/test/fixtures/demo-clt-data.json` — Extracted demo page data (rubric + 30 students) as reusable test fixture
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential (single test file + single fixture file, tightly coupled)
> **Critical Path**: Extract fixture data → Write test suite → Run tests → Debug failures

---

## Context

### Original Request
"Test the grading server end to end with the demo grading page using Ollama LFM2 model and make sure everything is wired up correctly."

### Interview Summary
**Key Discussions**:
- User chose **automated Vitest E2E tests** over manual testing
- User chose **real Ollama + LFM2** over mocked responses — these tests require a running Ollama instance with LFM2 loaded
- All source code has been fully read and architecture mapped during discovery

**Research Findings**:
- Server is Hono-based on port 3456 with UUID Bearer token auth
- Auth flow: `GET /api/handshake` → token → `POST /internal/providers` (token in body) → push Ollama config
- `/api/grade` returns SSE stream: `progress → chunk → [sweep] → [outlier] → done`
- `/api/chat` with rubric present returns JSON `{score, feedback}` (not SSE)
- Virtual 0-10 scoring scale; for this rubric maxScore=10, so virtual = real
- Demo page: 30 students, CLT statistics rubric, 4 categories totaling 10 points
- 30 students at chunkSize=20 → 2 chunks → 2 LLM calls minimum
- Existing tests are all unit-level (12 files), zero E2E tests exist
- `providerConfigs` is an in-memory array — must be populated via `/internal/providers` before grading works
- Ollama request format: `POST /api/chat` with `{model, messages, stream:false, keep_alive:'60m', options:{temperature:0.2, num_ctx:8192}}`

### Self-Identified Gaps (Metis timed out — applied own analysis)
**Addressed in plan**:
- **Port conflicts**: Server may already be running on 3456 — test must handle both "start fresh" and "already running" scenarios
- **LFM2 model tag**: Exact name unknown (`lfm2`, `lfm-2`, `lfm2:latest`, `liquid/lfm2`) — test must auto-detect from `/api/tags`
- **Timeout calibration**: LLM inference on 30 students is slow. Batch grading could take 3-10+ minutes depending on hardware. Tests need very generous timeouts.
- **Server lifecycle**: Starting server in test setup + killing it in teardown. Must handle graceful startup wait and cleanup.
- **SSE parsing complexity**: Need robust EventSource-like parsing of `text/event-stream` response from `fetch`
- **Score validation bounds**: Virtual scale is 0-10, maxScore is 10, so scores should be in [0, 10]. Need to validate granularity (0.5 increments for maxScore≥5).

---

## Work Objectives

### Core Objective
Create a Vitest E2E test suite that proves the grading server correctly handles the full pipeline from auth through batch grading with a real Ollama/LFM2 backend, using the demo CLT statistics assignment data.

### Concrete Deliverables
- `grading-server/test/fixtures/demo-clt-data.json` — Rubric + 30 students extracted from `demo/demo-grading-page.html`
- `grading-server/test/e2e-ollama.test.js` — Vitest E2E test suite covering:
  - Ollama connectivity and LFM2 availability check
  - Auth handshake
  - Provider config push
  - Single-student grading via `/api/chat`
  - Full 30-student batch grading via `/api/grade` with SSE stream validation
  - Score range and feedback validation for all 30 students

### Definition of Done
- [ ] `cd grading-server && bun test test/e2e-ollama.test.js` passes with all tests green
- [ ] All 30 students receive scores in valid range [0, 10]
- [ ] All 30 students receive non-empty feedback strings
- [ ] SSE event stream is correctly parsed and validated
- [ ] Tests skip gracefully (not fail) when Ollama/LFM2 is unavailable

### Must Have
- Real Ollama calls — no mocking, no stubbing, no faking
- All 30 demo students processed through the batch pipeline
- SSE stream parsing that validates the event sequence
- Graceful skip when Ollama or LFM2 is not available (CI-friendly)
- Generous timeouts for LLM inference (at least 5 minutes for batch grading)
- Auth flow exercised (handshake → token → provider push)
- Score validation: every score in [0, maxScore], non-empty feedback

### Must NOT Have (Guardrails)
- **No mocking** — Tests must hit real Ollama, not mock responses
- **No new dependencies** — Use only what's in `grading-server/package.json` already (Vitest, Hono, etc.)
- **No modifying existing code** — Tests only, no changes to server.js/grading.js/providers.js
- **No flaky timing assumptions** — Use proper wait/retry patterns, not hardcoded `sleep(N)`
- **No port conflicts** — Detect if server is already running before trying to start one
- **No test pollution** — Tests must not leave server processes running after completion

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest already configured in package.json)
- **Automated tests**: YES (Tests-after — the deliverable IS the test suite)
- **Framework**: `bun test` (Vitest via bun runtime, per package.json scripts)

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Test file**: Use Bash (bun test) — Run test suite, validate pass/fail, capture output
- **Fixture file**: Use Bash (bun/node REPL) — Import fixture, validate structure, count students

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — fixture before tests):
├── Task 1: Extract demo page data into test fixture [quick]
└── Task 2: Create E2E test suite (depends: 1) [deep]

Wave 2 (After tests written):
└── Task 3: Run tests and verify everything passes (depends: 2) [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3 | 1 |
| 2 | 1 | 3 | 1 |
| 3 | 2 | F1-F4 | 2 |
| F1-F4 | 3 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `deep`
- **Wave 2**: T3 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Extract demo page data into test fixture

  **What to do**:
  - Parse `demo/demo-grading-page.html` to extract the rubric object and all 30 student objects
  - Create `grading-server/test/fixtures/demo-clt-data.json` with the extracted data
  - Structure must match what `/api/grade` expects:
    ```json
    {
      "rubric": {
        "essayPrompt": "...",
        "checklistItems": [...],
        "rubricItems": [...],
        "modelText": "...",
        "maxScore": "10"
      },
      "students": [
        {"index": 0, "name": "Anderson, Marcus", "response": "..."},
        ...
      ]
    }
    ```
  - The demo HTML stores data in JavaScript variables inside `<script>` tags — look for `window.rubricData` or similar assignment patterns, OR parse the HTML elements directly (student cards, rubric sections)
  - Verify exactly 30 students are extracted
  - Verify rubric has 4 categories: CLT Statement (2pts), Standard Error (3pts), MOE Connection (3pts), Practical Implications (2pts)
  - Verify maxScore = "10" (string, as the server expects)

  **Must NOT do**:
  - Do NOT modify the demo HTML file
  - Do NOT hardcode data — extract it programmatically or manually copy from the HTML source
  - Do NOT change the student names, responses, or rubric content

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation, straightforward data extraction from known HTML structure
  - **Skills**: `[]`
    - No specialized skills needed — this is basic data extraction
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — we're reading static HTML source, not browsing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, sequential start
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `demo/demo-grading-page.html` — Source HTML containing all 30 students and rubric. Read the `<script>` sections to find where rubric data and student responses are defined as JS variables. The page embeds rubric categories in structured HTML elements and student responses in card-like elements.

  **API/Type References**:
  - `grading-server/server.js:1050-1110` — The `/api/grade` endpoint handler. Shows exact shape of `req.body` it expects: `{provider, model, rubric, students}`. The `rubric` object must have `essayPrompt`, `checklistItems`, `rubricItems`, `modelText`, `maxScore`.
  - `grading-server/grading.js:40-80` — `buildBatchPrompt()` function shows how it reads `rubric.essayPrompt`, `rubric.checklistItems[].category`, `rubric.checklistItems[].items[]`, `rubric.modelText`, `rubric.maxScore`.

  **Test References**:
  - `grading-server/test/grading.test.js:1-30` — Shows how existing tests import fixture data. Follow similar JSON structure conventions.

  **WHY Each Reference Matters**:
  - `demo-grading-page.html`: This is the SOURCE of truth for the 30 students and rubric. Must extract exactly what's there.
  - `server.js` handler: The fixture must match the exact shape the API expects, or the E2E tests will fail with 400 errors.
  - `grading.js buildBatchPrompt`: Shows which rubric fields are actually READ by the grading logic — ensures we don't miss a required field.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fixture file has correct structure
    Tool: Bash (bun/node)
    Preconditions: Task 1 complete, fixture file exists
    Steps:
      1. Run: cd grading-server && node -e "const d = require('./test/fixtures/demo-clt-data.json'); console.log('students:', d.students.length); console.log('rubric keys:', Object.keys(d.rubric).join(', ')); console.log('maxScore:', d.rubric.maxScore); console.log('categories:', d.rubric.checklistItems.length); console.log('first student:', d.students[0].name); console.log('last student:', d.students[29].name);"
      2. Assert output contains: students: 30
      3. Assert output contains: rubric keys: essayPrompt, checklistItems, rubricItems, modelText, maxScore
      4. Assert output contains: maxScore: 10
      5. Assert output contains: categories: 4
      6. Assert first student name is "Anderson, Marcus"
    Expected Result: All 6 assertions pass — 30 students, correct rubric shape, maxScore 10, 4 categories
    Failure Indicators: Wrong student count, missing rubric keys, wrong maxScore
    Evidence: .sisyphus/evidence/task-1-fixture-structure.txt

  Scenario: All student responses are non-empty
    Tool: Bash (bun/node)
    Preconditions: Fixture file exists
    Steps:
      1. Run: cd grading-server && node -e "const d = require('./test/fixtures/demo-clt-data.json'); const empty = d.students.filter(s => !s.response || s.response.trim().length === 0); console.log('empty responses:', empty.length); console.log('min response length:', Math.min(...d.students.map(s => s.response.length))); console.log('all have index:', d.students.every(s => typeof s.index === 'number'));"
      2. Assert: empty responses: 0
      3. Assert: min response length > 10
      4. Assert: all have index: true
    Expected Result: Zero empty responses, all responses have meaningful content, all have numeric index
    Failure Indicators: Any empty response, missing index field
    Evidence: .sisyphus/evidence/task-1-student-responses.txt
  ```

  **Evidence to Capture:**
  - [ ] `task-1-fixture-structure.txt` — Node REPL output showing structure validation
  - [ ] `task-1-student-responses.txt` — Node REPL output showing response validation

  **Commit**: YES (group with Task 2)
  - Message: `test(grading-server): add E2E test suite for Ollama/LFM2 grading pipeline`
  - Files: `grading-server/test/fixtures/demo-clt-data.json`
  - Pre-commit: validation script above

- [ ] 2. Create E2E test suite for Ollama/LFM2 grading pipeline

  **What to do**:
  Create `grading-server/test/e2e-ollama.test.js` — a comprehensive Vitest E2E test suite. This is the main deliverable.

  **Test file structure** (describe blocks):

  ```
  describe('E2E: Ollama LFM2 Grading Pipeline')
    ├── beforeAll: Check Ollama running + LFM2 available, start server, get auth token
    ├── afterAll: Kill server process if we started it
    │
    ├── describe('Prerequisites')
    │   ├── it('Ollama is reachable')
    │   └── it('LFM2 model is available')
    │
    ├── describe('Auth & Provider Setup')
    │   ├── it('handshake returns valid token')
    │   └── it('provider config push succeeds')
    │
    ├── describe('Single Student Grading — /api/chat')
    │   └── it('grades a single student with rubric and returns score + feedback')
    │
    └── describe('Batch Grading — /api/grade (30 students)')
        ├── it('streams SSE events in correct sequence')
        ├── it('returns results for all 30 students')
        ├── it('all scores are in valid range [0, 10]')
        ├── it('all students receive non-empty feedback')
        └── it('done event contains stats (mean, stdDev)')
  ```

  **Key implementation details**:

  1. **Ollama check + model detection** (beforeAll):
     - `fetch('http://localhost:11434/api/tags')` → parse response → find model matching `lfm2` (case-insensitive, check `name` field)
     - If Ollama unreachable OR LFM2 not found → `describe.skip()` the entire suite (not fail)
     - Store detected model name (e.g., `lfm2:latest`) for use in test requests

  2. **Server lifecycle** (beforeAll/afterAll):
     - Try `fetch('http://localhost:3456/health')` — if reachable, reuse existing server (set flag `startedServer = false`)
     - If not reachable, spawn `bun run start` in `grading-server/` as child process, wait for health endpoint to respond (poll with 500ms interval, 15s timeout)
     - afterAll: if `startedServer === true`, kill the child process (process.kill with SIGTERM)

  3. **Auth flow**:
     - `GET http://localhost:3456/api/handshake` → `{token}` — store token for all subsequent requests
     - `POST http://localhost:3456/internal/providers` with body:
       ```json
       { "token": "<token>", "providers": [{ "id": "ollama", "api_url": "http://localhost:11434", "model": "<detected-lfm2-tag>", "is_active": true, "credentials": {} }] }
       ```

  4. **Single student grading** (`/api/chat` grader mode):
     - Pick first student from fixture
     - `POST /api/chat` with `Authorization: Bearer <token>` and body:
       ```json
       { "message": "Grade this student's work", "rubric": <fixture.rubric>, "studentWork": "<student.response>", "provider": "ollama", "model": "<detected-lfm2-tag>" }
       ```
     - Assert response is JSON with `score` (number, 0-10) and `feedback` (non-empty string)
     - Timeout: 120s (single student, single LLM call)

  5. **Batch grading** (`/api/grade` SSE stream):
     - `POST /api/grade` with `Authorization: Bearer <token>` and body:
       ```json
       { "provider": "ollama", "model": "<detected-lfm2-tag>", "rubric": <fixture.rubric>, "students": <fixture.students> }
       ```
     - Parse SSE response manually:
       - Read response body as text stream (ReadableStream)
       - Split on `\n\n` boundaries
       - Parse each block: `event: <type>\ndata: <json>` → extract type and JSON payload
     - Collect all events into arrays by type
     - **Validate SSE sequence**: at least 1 `progress` event before first `chunk`, at least 1 `chunk` event, exactly 1 `done` event at the end
     - **Validate chunk results**: flatten all `chunk` event results → should have exactly 30 entries
     - **Validate scores**: every result has `score` as number in [0, 10], respecting 0.5 granularity (score * 2 should be an integer)
     - **Validate feedback**: every result has `feedback` as non-empty string (length > 10 chars)
     - **Validate done event**: `done.data` has `stats` with `mean` (number) and `stdDev` (number ≥ 0)
     - Timeout: 600s (10 minutes — 30 students across 2 chunks, each chunk needs full LLM inference)

  6. **Helper functions** (within the test file):
     - `parseSSEStream(response)` → `{events: [{type, data}]}` — robust SSE parser
     - `waitForServer(url, timeoutMs, intervalMs)` → polls until reachable
     - `findLfm2Model(tags)` → scans Ollama tags for lfm2 variant

  **Must NOT do**:
  - Do NOT mock or stub any HTTP calls — all requests go to real Ollama and real grading server
  - Do NOT add new npm dependencies (no `eventsource` library — parse SSE manually with fetch)
  - Do NOT modify any existing source files
  - Do NOT hardcode the Ollama model tag — auto-detect it
  - Do NOT use `setTimeout` for waiting — use proper poll loops with condition checks
  - Do NOT make tests that FAIL when Ollama is unavailable — they should SKIP

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex test file requiring SSE stream parsing, server lifecycle management, robust error handling, and understanding of the full grading pipeline. Needs to reason about timing, concurrency, and integration patterns.
  - **Skills**: `[]`
    - No specialized skills needed — this is pure Vitest + fetch + SSE parsing
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — these are server-side HTTP tests, no browser involved
    - `testing-patterns`: Could help but the existing test files already show clear Vitest patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, after Task 1
  - **Blocks**: Task 3
  - **Blocked By**: Task 1 (needs fixture file)

  **References**:

  **Pattern References**:
  - `grading-server/test/grading.test.js:1-50` — Vitest import pattern, describe/it structure, how existing tests are organized. Follow same style: `import { describe, it, expect, beforeAll, afterAll } from 'vitest'`
  - `grading-server/test/providers.test.js:1-60` — Shows how provider-related tests validate request/response shapes. Use similar assertion patterns.

  **API/Type References**:
  - `grading-server/server.js:45-70` — Health endpoint (`GET /health`), handshake endpoint (`GET /api/handshake`). Shows exact response shapes.
  - `grading-server/server.js:75-115` — `/internal/providers` endpoint. Shows exact request body shape: `{token, providers: [{id, api_url, model, is_active, credentials}]}`
  - `grading-server/server.js:360-420` — `/api/chat` endpoint. Shows how it detects grader mode (rubric present), calls `buildSingleGradePrompt`, returns `{score, feedback, provider, model}`.
  - `grading-server/server.js:1050-1200` — `/api/grade` endpoint. Shows SSE stream setup, chunking, event emission pattern. Events emitted: `progress` (with phase field), `chunk` (with results array), `sweep`, `outlier`, `done` (with stats), `error`.
  - `grading-server/server.js:1085-1095` — SSE helper function `sendSSE(controller, event, data)` — shows format: `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  - `grading-server/providers.js:85-130` — `buildOllamaRequest()` shows exact Ollama API format. Important: the test's provider push must match what `resolveProviderConfig` expects.
  - `grading-server/grading.js:830-870` — `detectOutliers()` function. Outlier detection happens after all chunks complete — SSE may or may not emit `outlier` events depending on score distribution.

  **Test References**:
  - `grading-server/test/grading.test.js:1-396` — Full test file shows Vitest patterns: how to use `describe.skip`, `beforeAll`, fixture imports, assertion chaining. This is the style to follow.

  **External References**:
  - Ollama API: `GET http://localhost:11434/api/tags` returns `{models: [{name: "model:tag", ...}]}` — use to detect LFM2 model name
  - SSE spec: Events are `event: <type>\ndata: <json>\n\n` — the server uses this exact format (see `sendSSE` helper in server.js)

  **WHY Each Reference Matters**:
  - `server.js` endpoints: The test must construct requests that exactly match what the server expects, or it'll get 400/401 errors
  - `server.js` SSE format: Must parse the exact SSE format the server emits — custom format, not standard EventSource
  - `providers.js buildOllamaRequest`: Shows what provider config fields are actually used — ensures our provider push includes everything needed
  - `grading.js detectOutliers`: Explains why outlier events may or may not appear — test must handle both cases
  - Existing test files: Style consistency is important — follow same import patterns and describe/it organization

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test suite runs and all tests pass with Ollama/LFM2
    Tool: Bash (bun test)
    Preconditions: Ollama running with LFM2 model loaded, grading server either running or will be auto-started by test
    Steps:
      1. Run: cd grading-server && bun test test/e2e-ollama.test.js --reporter=verbose 2>&1
      2. Capture full output
      3. Assert: output contains "✓" or "pass" markers for all test cases
      4. Assert: output does NOT contain "FAIL" or "✗" markers
      5. Assert: exit code is 0
    Expected Result: All tests pass — Ollama check, handshake, provider push, chat grading, batch grading
    Failure Indicators: Any test failure, timeout, connection refused, 401 auth error
    Evidence: .sisyphus/evidence/task-2-test-run.txt

  Scenario: Test suite skips gracefully when Ollama is unavailable
    Tool: Bash (bun test)
    Preconditions: Ollama NOT running (or LFM2 not loaded)
    Steps:
      1. Temporarily stop Ollama (or rename the model)
      2. Run: cd grading-server && bun test test/e2e-ollama.test.js --reporter=verbose 2>&1
      3. Assert: output shows "skipped" for the E2E tests (not "FAIL")
      4. Assert: exit code is 0 (skipped tests don't fail the suite)
    Expected Result: Suite skips with informative message, exit code 0
    Failure Indicators: Tests fail instead of skip, non-zero exit code
    Evidence: .sisyphus/evidence/task-2-skip-test.txt

  Scenario: Batch grading returns valid scores for all 30 students
    Tool: Bash (bun test) — this is validated WITHIN the test suite, but verify via output
    Preconditions: Full test suite passing
    Steps:
      1. Check test output from Scenario 1
      2. Assert: "30 students" or "all 30" appears in test output or assertions
      3. Assert: no score validation failures in output
    Expected Result: All 30 students have scores in [0, 10] and non-empty feedback
    Failure Indicators: Score out of range, missing feedback, student count mismatch
    Evidence: .sisyphus/evidence/task-2-batch-validation.txt (captured from Scenario 1 output)
  ```

  **Evidence to Capture:**
  - [ ] `task-2-test-run.txt` — Full test output showing all passes
  - [ ] `task-2-skip-test.txt` — Output showing graceful skip behavior
  - [ ] `task-2-batch-validation.txt` — Extracted batch grading validation details

  **Commit**: YES (group with Task 1)
  - Message: `test(grading-server): add E2E test suite for Ollama/LFM2 grading pipeline`
  - Files: `grading-server/test/e2e-ollama.test.js`, `grading-server/test/fixtures/demo-clt-data.json`
  - Pre-commit: `cd grading-server && bun test test/e2e-ollama.test.js`

- [ ] 3. Run E2E tests and debug any failures

  **What to do**:
  - Ensure Ollama is running: check `GET http://localhost:11434/api/tags` is reachable
  - Verify LFM2 model is loaded: check tags response for lfm2 variant
  - If Ollama not running, start it: `ollama serve` (or the appropriate command for this system)
  - If LFM2 not loaded, pull it: `ollama pull lfm2` (or the correct model tag)
  - Run: `cd grading-server && bun test test/e2e-ollama.test.js --reporter=verbose`
  - If tests pass → capture output, done
  - If tests fail → read error output, diagnose:
    - **Connection refused on 11434**: Ollama not running → start it
    - **Connection refused on 3456**: Server didn't start → check server startup logic in test
    - **401 Unauthorized**: Token not passed correctly → fix auth header
    - **400 Bad Request**: Request body shape mismatch → fix fixture or request construction
    - **Timeout**: LLM too slow → increase timeout values
    - **Score validation**: LLM returned unexpected format → check response parsing
    - **SSE parse error**: Stream format mismatch → check SSE parser against actual server output
  - Fix any issues found in the test file (NOT in source code)
  - Re-run until all tests pass
  - Capture final passing output as evidence

  **Must NOT do**:
  - Do NOT modify server source code to make tests pass — fix only the test file
  - Do NOT reduce test coverage to make tests pass (don't delete assertions)
  - Do NOT increase timeouts beyond 15 minutes for any single test
  - Do NOT use `test.skip()` on failing tests as a "fix"

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Debugging E2E test failures requires reading server logs, analyzing SSE streams, potentially adjusting timeouts and request shapes. Moderate complexity but needs careful reasoning about integration behavior.
  - **Skills**: `[]`
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — server-side debugging, no browser

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2, sequential after Task 2
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `grading-server/test/e2e-ollama.test.js` — The test file just created in Task 2 (read it to understand what's being tested)
  - `grading-server/server.js:1050-1200` — Server's `/api/grade` handler — if SSE parsing fails, compare what server actually emits vs what test expects
  - `grading-server/server.js:360-420` — Server's `/api/chat` handler — if chat grading fails, check request shape

  **API/Type References**:
  - `grading-server/providers.js:85-130` — Ollama request builder — if provider calls fail, verify the provider config push matches what resolveProviderConfig expects
  - `grading-server/grading.js:480-550` — `parseBatchResponse()` — if score parsing seems wrong, understand the 4 fallback parsing strategies

  **External References**:
  - Ollama API: `GET http://localhost:11434/api/tags` — verify model availability
  - Ollama API: `POST http://localhost:11434/api/chat` — if Ollama itself returns errors, test directly

  **WHY Each Reference Matters**:
  - `e2e-ollama.test.js`: The primary file being debugged — must read it to understand failures
  - `server.js` handlers: When tests fail, need to compare expected vs actual server behavior
  - `providers.js`: If Ollama calls fail, need to verify the provider config chain
  - `grading.js parseBatchResponse`: If scores are wrong, need to understand the parsing pipeline

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All E2E tests pass on final run
    Tool: Bash (bun test)
    Preconditions: Ollama running with LFM2, test file debugged and fixed
    Steps:
      1. Run: cd grading-server && bun test test/e2e-ollama.test.js --reporter=verbose 2>&1 | tee .sisyphus/evidence/task-3-final-run.txt
      2. Assert: exit code is 0
      3. Assert: output shows all test cases passing
      4. Assert: output shows 30 students graded in batch test
      5. Assert: no warnings about skipped tests (Ollama should be available)
    Expected Result: Clean pass — all tests green, 30 students graded, valid scores and feedback
    Failure Indicators: Any test failure, any skipped test (when Ollama should be available)
    Evidence: .sisyphus/evidence/task-3-final-run.txt

  Scenario: Server process cleanup — no orphaned processes after test
    Tool: Bash
    Preconditions: Test run completed
    Steps:
      1. Run: tasklist /FI "WINDOWTITLE eq bun" 2>nul || ps aux | grep "bun.*server" (Windows/Linux)
      2. Check that no grading-server bun process was left running by the test
      3. If test started a server, verify it was properly killed in afterAll
    Expected Result: No orphaned bun/node processes from the test run
    Failure Indicators: Leftover server process on port 3456
    Evidence: .sisyphus/evidence/task-3-process-cleanup.txt
  ```

  **Evidence to Capture:**
  - [ ] `task-3-final-run.txt` — Full verbose test output showing all passes
  - [ ] `task-3-process-cleanup.txt` — Process list showing no orphaned servers

  **Commit**: YES (same commit as Tasks 1 & 2 if no changes needed, or separate fix commit)
  - Message: `test(grading-server): add E2E test suite for Ollama/LFM2 grading pipeline`
  - Files: `grading-server/test/e2e-ollama.test.js` (if debugged/fixed)
  - Pre-commit: `cd grading-server && bun test test/e2e-ollama.test.js`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read test file, check assertions). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Review `grading-server/test/e2e-ollama.test.js` and `grading-server/test/fixtures/demo-clt-data.json` for: proper Vitest patterns, correct SSE parsing, no hardcoded secrets, no `as any`/`@ts-ignore`, clean test organization, proper describe/it nesting, meaningful assertion messages.
  Output: `Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start Ollama (verify LFM2 available), start grading server, run `cd grading-server && bun test test/e2e-ollama.test.js`. Capture full output. Verify all tests pass. If any fail, capture error details. Save output to `.sisyphus/evidence/final-qa/`.
  Output: `Tests [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify only 2 files were created (`test/e2e-ollama.test.js`, `test/fixtures/demo-clt-data.json`). Verify no existing files were modified. Verify no extra files were added. Check "Must NOT do" compliance.
  Output: `Files created [2/2] | Files modified [0] | Unaccounted [CLEAN] | VERDICT`

---

## Commit Strategy

- **1**: `test(grading-server): add E2E test suite for Ollama/LFM2 grading pipeline` — `grading-server/test/e2e-ollama.test.js`, `grading-server/test/fixtures/demo-clt-data.json`
  - Pre-commit: `cd grading-server && bun test test/e2e-ollama.test.js`

---

## Success Criteria

### Verification Commands
```bash
cd grading-server && bun test test/e2e-ollama.test.js  # Expected: all tests PASS
```

### Final Checklist
- [ ] Test fixture contains exactly 30 students with correct rubric structure
- [ ] E2E test suite covers: Ollama check, handshake, provider push, chat grading, batch grading
- [ ] All tests pass with real Ollama/LFM2
- [ ] Tests skip gracefully when Ollama is unavailable
- [ ] No existing files modified
- [ ] No new dependencies added
