# Fix "Failed to Fetch" on Rubrics Tab

## TL;DR

> **Quick Summary**: The Rubrics tab fails because `pushOnStartup()` (which fetches the auth token from the grading server) is never called after the Tauri→Electron port. All `/api/*` requests fail with 401. Fix by wiring the server-status listener to trigger the handshake, align the config directory fallback, and improve error messages.
> 
> **Deliverables**:
> - Rubrics tab loads successfully after app startup
> - All `/api/*` endpoints authenticated via handshake token
> - Config directory fallback aligned between Electron and standalone server
> - API error messages include response body for easier debugging
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (handshake wiring) → Task 4 (QA verification)

---

## Context

### Original Request
User reported "Failed to fetch" error on the Rubrics tab after the loading spinner completes. Suspected DB or embedding model issue. Investigation revealed the true root cause is a missing auth token handshake after the Tauri→Electron port.

### Interview Summary
**Key Discussions**:
- Rubrics tab shows spinner → "Failed to fetch" — confirmed by user
- App was ported from Tauri to Electron — the handshake call existed in Tauri but was lost during migration
- Ollama IS running, server status uncertain
- User wants: primary fix + config dir alignment + better error logging
- User wants: QA verification only, no unit tests

**Research Findings**:
- Full data flow traced across 8 files — Rubrics.svelte → rubric-api.ts → server.js auth middleware → rubric-store.js
- Rubrics use flat-file storage (`ogre-rubrics.json`), NOT SQLite. Embedding model is irrelevant.
- `pushOnStartup()` in `provider-sync.ts` has **ZERO callers** in the entire codebase
- `listenServerStatus()` wrapper exists in `server.ts` but is never used
- `App.svelte` already imports from `./lib/server` — adding the status listener is minimal change
- Server auth middleware (`server.js:295-312`) rejects requests without valid `Bearer` token → returns 401
- `rubric-api.ts:42` throws opaque error "Failed to list rubrics: 401" without including response body

### Metis Review
Metis consultation timed out, but root cause analysis is thorough and confirmed via direct code reading of all files in the chain. No gaps remain.

---

## Work Objectives

### Core Objective
Wire the server-status→handshake flow so the Electron renderer acquires the auth token at startup, enabling all `/api/*` endpoints including rubrics.

### Concrete Deliverables
- `ogre-desktop/src/App.svelte` — adds server-status listener that calls `pushOnStartup()`
- `grading-server/config.js` — aligns fallback config dir name with Electron's `userData` path
- `ogre-desktop/src/lib/rubric-api.ts` — includes response body in error messages
- `ogre-desktop/src/lib/grading-api.ts` — same error improvement (if Bearer auth is used)
- `ogre-desktop/src/lib/agent-api.ts` — same error improvement (if Bearer auth is used)

### Definition of Done
- [ ] App launches → server starts → handshake completes → Rubrics tab loads without errors
- [ ] All `/api/*` endpoints return 200 with valid token
- [ ] Config dir fallback matches Electron's `app.getPath('userData')` directory name
- [ ] API errors include HTTP status AND response body text

### Must Have
- `pushOnStartup()` called when server-status becomes `'running'`
- Handshake token stored in `provider-sync.ts` module state
- Error messages include response body for debugging
- Existing behavior of other pages/features preserved

### Must NOT Have (Guardrails)
- Do NOT change the grading server's auth middleware logic
- Do NOT modify the handshake token generation mechanism
- Do NOT refactor the provider-sync module beyond what's needed
- Do NOT add new dependencies
- Do NOT touch the database schema or SQLite layer
- Do NOT change the rubric-store file format
- Do NOT add unit tests (user chose QA-only verification)
- Do NOT over-abstract the error handling — keep changes minimal and focused

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest configured)
- **Automated tests**: None (user chose QA-only)
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwriter skill) — Launch app, navigate to Rubrics, assert content loads
- **Backend API**: Use Bash (curl) — Hit `/api/rubrics` with token, verify 200 response

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent fixes):
├── Task 1: Wire pushOnStartup in App.svelte [quick]
├── Task 2: Align config dir fallback in config.js [quick]
└── Task 3: Improve API error messages in rubric-api.ts + others [quick]

Wave FINAL (After Wave 1 — integration QA):
└── Task 4: End-to-end QA verification [quick]

Critical Path: Task 1 → Task 4
Parallel Speedup: Tasks 1-3 run simultaneously
Max Concurrent: 3
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 4 |
| 2 | — | 4 |
| 3 | — | 4 |
| 4 | 1, 2, 3 | — |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave FINAL**: **1** — T4 → `quick` (+ `playwriter` skill)

---

## TODOs

- [ ] 1. Wire `pushOnStartup()` to server-status listener in App.svelte

  **What to do**:
  - In `ogre-desktop/src/App.svelte`:
    1. Add imports: `import { pushOnStartup } from './lib/provider-sync'` and `import { listenServerStatus } from './lib/server'`
    2. Add a new state variable: `let unlistenServerStatus = $state<(() => void) | undefined>(undefined)`
    3. Inside the existing `onMount` block (after the `listenProviderChanged` setup around line 105), add:
       ```ts
       unlistenServerStatus = await listenServerStatus(async (status) => {
         if (status === 'running') {
           await pushOnStartup();
         }
       });
       ```
    4. In the existing `onDestroy` block, add: `if (unlistenServerStatus) unlistenServerStatus();`
  - This is the **critical fix**. When the server emits `server-status: running`, the renderer will:
    1. Wait for the server to become healthy (health check loop in `waitForServerHealth`)
    2. Fetch the handshake token via `GET /api/handshake`
    3. Push provider configs via `POST /internal/providers`
    4. Store the token in module state — making it available to `getHandshakeToken()`

  **Must NOT do**:
  - Do NOT modify `provider-sync.ts` internals
  - Do NOT change the handshake token mechanism
  - Do NOT add any new IPC channels — the existing `server-status` event from `server-manager.ts` is already being emitted

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file edit, clear instructions, ~10 lines of code
  - **Skills**: `[]`
    - No special skills needed — straightforward Svelte/TS edit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4 (QA verification)
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/App.svelte:78-96` — Existing `listenSessionComplete` pattern: shows exactly how to subscribe to an IPC event in onMount, store the unlisten function, and clean up in onDestroy. **Follow this exact pattern for the new server-status listener.**
  - `ogre-desktop/src/App.svelte:100-105` — Existing `listenProviderChanged` pattern: same subscribe/unlisten approach. The new code goes after this block.
  - `ogre-desktop/src/App.svelte:124-128` — Existing `onDestroy` cleanup: add the new unlisten call here following the same pattern.

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/server.ts:42-44` — `listenServerStatus()` function signature: takes a callback `(status: ServerStatus) => void`, returns an unlisten function. `ServerStatus` is `'running' | 'stopped' | 'crashed' | 'failed'`.
  - `ogre-desktop/src/lib/provider-sync.ts:136-141` — `pushOnStartup()` function: async, returns `Promise<void>`, waits for health then pushes providers. This is what must be called when status is `'running'`.

  **WHY Each Reference Matters**:
  - App.svelte lines 78-96: The **exact pattern** to copy — same IPC event subscription style, same state variable for unlisten, same cleanup in onDestroy
  - server.ts:42-44: Confirms the function exists and its signature so the executor doesn't need to look it up
  - provider-sync.ts:136-141: Confirms pushOnStartup exists and what it does internally (health check → handshake → push providers)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: App startup triggers handshake and rubrics load
    Tool: Bash (npm run electron:dev from ogre-desktop/)
    Preconditions: Ollama running, no other instance of the app
    Steps:
      1. Run `npm run electron:dev` from ogre-desktop/ directory
      2. Wait 10 seconds for server to start and handshake to complete
      3. Run `curl -s http://localhost:3456/health` — expect `{"status":"ok"}`
      4. Run `curl -s http://localhost:3456/api/handshake` — capture the token value
      5. Run `curl -s -H "Authorization: Bearer <token>" http://localhost:3456/api/rubrics` — expect 200 with `{"rubrics":[...]}`
    Expected Result: Health returns ok, handshake returns token, rubrics returns 200
    Failure Indicators: curl returns connection refused (server not running), handshake returns error, rubrics returns 401
    Evidence: .sisyphus/evidence/task-1-server-health.txt

  Scenario: Missing server produces no crash
    Tool: Bash (curl)
    Preconditions: App NOT running, server NOT running
    Steps:
      1. Run `curl -s http://localhost:3456/health` — expect connection refused
    Expected Result: Connection refused (server not running — this is expected baseline)
    Failure Indicators: Unexpected response (another server is running on 3456)
    Evidence: .sisyphus/evidence/task-1-no-server-baseline.txt
  ```

  **Commit**: YES
  - Message: `fix(desktop): wire server handshake on startup to fix rubrics auth`
  - Files: `ogre-desktop/src/App.svelte`
  - Pre-commit: `npx tsc --noEmit` (from ogre-desktop/)

- [ ] 2. Align config directory fallback in config.js

  **What to do**:
  - In `grading-server/config.js`, line 27:
    - Change `'com.ogre.desktop'` to `'ogre-desktop'` (Windows path)
  - Line 29:
    - Change `'com.ogre.desktop'` to `'ogre-desktop'` (macOS path)
  - Line 31:
    - Change `'com.ogre.desktop'` to `'ogre-desktop'` (Linux path)
  - This aligns the server's standalone fallback directory with Electron's `app.getPath('userData')` which returns a directory named after the app name in `package.json` (`ogre-desktop`)

  **Must NOT do**:
  - Do NOT change the `OGRE_CONFIG_DIR` env var mechanism — that's the primary path and works correctly
  - Do NOT rename any existing config files on disk
  - Do NOT change the config file format or schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 simple string replacements in one file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `grading-server/config.js:22-33` — `getConfigDir()` function: the 3 platform branches that need updating. The function checks `OGRE_CONFIG_DIR` first (set by Electron), then falls back to platform-specific defaults. **Only change the fallback strings.**
  - `ogre-desktop/electron-main/server-manager.ts:83` — `app.getPath('userData')` returns the Electron user data path. On Windows this is `%APPDATA%/ogre-desktop` (derived from package.json `name` field). **This is the truth — the fallback must match.**

  **WHY Each Reference Matters**:
  - config.js:22-33: The exact lines to edit — shows the 3 platform branches
  - server-manager.ts:83: Proves what the correct directory name should be — it's `ogre-desktop` not `com.ogre.desktop`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Config dir fallback matches Electron userData
    Tool: Bash (grep)
    Preconditions: Task 2 changes applied
    Steps:
      1. Read `grading-server/config.js` and check `getConfigDir()` function
      2. Verify all 3 platform branches use `'ogre-desktop'` not `'com.ogre.desktop'`
    Expected Result: All platforms use `'ogre-desktop'` in the fallback path
    Failure Indicators: Any branch still contains `'com.ogre.desktop'`
    Evidence: .sisyphus/evidence/task-2-config-dir-check.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `fix(desktop): wire server handshake on startup to fix rubrics auth`
  - Files: `grading-server/config.js`

- [ ] 3. Improve API error messages to include response body

  **What to do**:
  - In `ogre-desktop/src/lib/rubric-api.ts`:
    1. In `listRubrics()` (line 42): Change error throw to include response body:
       ```ts
       if (!res.ok) {
         const body = await res.text().catch(() => '');
         throw new Error(`Failed to list rubrics: ${res.status} ${body}`);
       }
       ```
    2. Apply the same pattern to `createRubric()` (line 55), `updateRubric()` (line 69), and `deleteRubric()` (line 79)
  - In `ogre-desktop/src/lib/grading-api.ts` — check if it has similar opaque errors, apply same improvement if Bearer auth is used
  - In `ogre-desktop/src/lib/agent-api.ts` — same check and improvement

  **Must NOT do**:
  - Do NOT change error handling logic (try/catch structure)
  - Do NOT add console.log statements
  - Do NOT modify the success paths
  - Do NOT change the Error class type — keep as plain `Error`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find-and-improve across 1-3 files, same pattern each time
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-api.ts:37-44` — `listRubrics()`: current error at line 42 just shows status code. **Add `res.text()` to include body.** Apply same to `createRubric` (line 55), `updateRubric` (line 69), `deleteRubric` (line 79).
  - `ogre-desktop/src/lib/grading-api.ts` — Check for similar opaque `throw new Error(...)` patterns with just status code
  - `ogre-desktop/src/lib/agent-api.ts` — Same check

  **WHY Each Reference Matters**:
  - rubric-api.ts:37-44: The primary file — all 4 functions need the same improvement
  - grading-api.ts and agent-api.ts: May have same pattern — check and fix if present

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Error messages include response body text
    Tool: Bash (grep)
    Preconditions: Task 3 changes applied
    Steps:
      1. Read `ogre-desktop/src/lib/rubric-api.ts`
      2. Verify each `throw new Error(...)` includes `res.text()` call
      3. Verify pattern: `await res.text().catch(() => '')` used for safe body extraction
    Expected Result: All 4 functions (list, create, update, delete) include body in error
    Failure Indicators: Any function still has just `${res.status}` without body
    Evidence: .sisyphus/evidence/task-3-error-messages.txt

  Scenario: Auth failure shows descriptive message
    Tool: Bash (curl)
    Preconditions: Server running, app NOT yet started (no handshake done)
    Steps:
      1. Run `curl -s http://localhost:3456/api/rubrics` (no auth header)
      2. Capture response body — should contain "Missing Authorization header" or similar
    Expected Result: Response body explains the auth failure
    Failure Indicators: Empty body or generic error
    Evidence: .sisyphus/evidence/task-3-auth-error-body.txt
  ```

  **Commit**: YES (group with Tasks 1, 2)
  - Message: `fix(desktop): wire server handshake on startup to fix rubrics auth`
  - Files: `ogre-desktop/src/lib/rubric-api.ts`, possibly `grading-api.ts`, `agent-api.ts`

- [ ] 4. End-to-end QA verification

  **What to do**:
  - Launch the app in dev mode
  - Verify the complete flow: server starts → handshake completes → Rubrics tab loads
  - Test creating a rubric if the list is empty
  - Check Activity Log for server status events
  - Verify no regressions on Dashboard and other pages

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Manual QA verification, no code changes
  - **Skills**: [`playwriter`]
    - `playwriter`: Needed to interact with the Electron app UI, navigate pages, verify content

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave FINAL (after all fixes)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  - `ogre-desktop/src/pages/Rubrics.svelte` — The page being tested. On successful load, displays rubric cards or an empty state message.
  - `ogre-desktop/src/App.svelte` — Navigation: click "Rubrics" in sidebar (`nav button` with title="Rubrics")
  - `ogre-desktop/src/pages/Logs.svelte` — Activity Log page: check for server startup and handshake log entries

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rubrics tab loads without error
    Tool: Playwriter (browser automation of Electron app)
    Preconditions: App launched with `npm run electron:dev`, waited 10s for server
    Steps:
      1. Navigate to http://localhost:5173 (Vite dev server)
      2. Click the "Rubrics" button in the sidebar navigation
      3. Wait for loading spinner to disappear (max 10s)
      4. Assert: No "Failed to fetch" error message visible
      5. Assert: Either rubric cards are shown OR empty state message is shown
      6. Take screenshot
    Expected Result: Rubrics page loads with content or empty state — no error
    Failure Indicators: "Failed to fetch" text visible, loading spinner stuck, console errors
    Evidence: .sisyphus/evidence/task-4-rubrics-loaded.png

  Scenario: Dashboard still works (regression check)
    Tool: Playwriter
    Preconditions: Same app session
    Steps:
      1. Click "Dashboard" in sidebar
      2. Wait for page to render
      3. Assert: Dashboard content visible, no errors
      4. Take screenshot
    Expected Result: Dashboard renders normally
    Failure Indicators: Errors, blank page, missing components
    Evidence: .sisyphus/evidence/task-4-dashboard-regression.png

  Scenario: Server health and API accessible
    Tool: Bash (curl)
    Preconditions: App running with dev server
    Steps:
      1. curl -s http://localhost:3456/health → expect {"status":"ok"}
      2. curl -s http://localhost:3456/api/handshake → capture token
      3. curl -s -H "Authorization: Bearer <token>" http://localhost:3456/api/rubrics → expect 200
    Expected Result: All 3 endpoints respond successfully
    Failure Indicators: Connection refused, 401, 500
    Evidence: .sisyphus/evidence/task-4-api-health.txt
  ```

  **Commit**: NO (QA only — no code changes)

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `quick`
  Verify: pushOnStartup is called, config dir aligned, error messages improved. Check each "Must Have" against actual code changes.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [ ] F2. **End-to-End QA** — `quick` (+ `playwriter` skill)
  Launch app in dev mode, wait for server, navigate to Rubrics tab, verify rubrics load (or empty state if none exist). Check Activity Log for server status events. Test creating a rubric if empty.
  Output: `Scenarios [N/N pass] | VERDICT`

---

## Commit Strategy

- **Single commit**: `fix(desktop): wire server handshake on startup to fix rubrics auth` — App.svelte, config.js, rubric-api.ts, grading-api.ts, agent-api.ts

---

## Success Criteria

### Verification Commands
```bash
# Dev mode launch (from ogre-desktop/)
npm run electron:dev  # Expected: app launches, server starts, rubrics tab works

# Direct API test (after server is running)
curl -s http://localhost:3456/health  # Expected: {"status":"ok"}
curl -s http://localhost:3456/api/handshake  # Expected: {"token":"<uuid>"}
curl -s -H "Authorization: Bearer <token>" http://localhost:3456/api/rubrics  # Expected: {"rubrics":[...]}
```

### Final Checklist
- [ ] Rubrics tab loads without "Failed to fetch"
- [ ] Handshake token acquired on server start
- [ ] Config dir fallback consistent across Electron and standalone
- [ ] API errors show status + body for debugging
- [ ] No regressions on Dashboard, History, Settings, or other tabs
