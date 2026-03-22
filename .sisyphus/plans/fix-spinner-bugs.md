# Fix Infinite Spinner Bugs in Grader Tab

## TL;DR

> **Quick Summary**: Fix two infinite spinner bugs in the sidepanel grader tab — the embed model loading spinner that never resolves on failure, and the grading anchors spinner that persists even after grading begins.
> 
> **Deliverables**:
> - Embed model polling with timeout/max-retry and user-visible error feedback
> - Anchor generation spinner that dismisses on phase transition with AbortController cleanup
> - Server-side error exposure for embed model init failures
> 
> **Estimated Effort**: Short (2-3 focused tasks, ~30-45 min total)
> **Parallel Execution**: YES - 2 waves (Bug 1 + Bug 2 parallel, then server hardening)
> **Critical Path**: Tasks 1 & 2 can run in parallel → Task 3 depends on Task 1

---

## Context

### Original Request
"In the sidepanel in the grader tab, the embed model loading just spins forever, also after I start a grading session the grading anchors loading wheel never stops spinning even if I'm grading."

### Interview Summary
**Key Discussions**:
- Both bugs are purely frontend logic issues — all server endpoints confirmed working
- Bug 1 root cause: embed-status polling has no timeout/max-retry; server swallows init errors
- Bug 2 root cause: `anchorGenerating` stays true when phase transitions during pending API call

**Research Findings**:
- All 6 relevant files fully read and analyzed (3 Svelte components, server.js, local-embedder.js, grading-api.ts)
- Server endpoints all return correct data — the issue is how the frontend handles slow/failed responses
- `local-embedder.js` resets `initPromise` on error, so subsequent warm-embed calls retry from scratch — but frontend never learns about the failure

### Metis Review
Metis consultation timed out. Gap analysis performed manually based on thorough investigation of all relevant source files.

---

## Work Objectives

### Core Objective
Eliminate two infinite spinner conditions so the grader tab UI always reaches a settled state within a reasonable timeframe, with clear feedback when something goes wrong.

### Concrete Deliverables
- `BatchProfileSelector.svelte`: Polling with max-retry (30 attempts / 60s), timeout fallback with warning toast
- `BatchProgress.svelte`: `anchorGenerating` reset on phase transition + AbortController for cancelling pending API call
- `server.js`: `/api/embed-status` returns error info when init has failed

### Definition of Done
- [ ] Embed model spinner resolves within 60 seconds (either model loads or warning shown)
- [ ] Anchor spinner dismisses immediately when grading phase begins
- [ ] No regressions in happy-path flows (model loads successfully, anchors generate successfully)

### Must Have
- Max-retry mechanism for embed polling (not infinite)
- Phase-aware anchor spinner dismissal
- Graceful fallback UI when embed model fails to load

### Must NOT Have (Guardrails)
- Do NOT change the actual embed model loading logic in `local-embedder.js` (that's a separate concern)
- Do NOT modify the `generateAnchors()` API contract or server response shape
- Do NOT add new dependencies or libraries
- Do NOT refactor unrelated component logic
- Do NOT change `batchPhase` state machine transitions
- Do NOT suppress errors silently — always surface them to the user

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest configured)
- **Automated tests**: NO — these are UI state bugs best verified by behavioral observation
- **Framework**: vitest (available but not needed for these fixes)

### QA Policy
Every task includes agent-executed QA scenarios using Playwright (playwriter skill).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwriter skill) — Navigate, interact, assert DOM state, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both bugs in parallel):
├── Task 1: Fix embed model spinner timeout [quick]
├── Task 2: Fix anchor generation spinner phase-awareness [quick]

Wave 2 (After Task 1 — server hardening):
└── Task 3: Expose embed init error state from server [quick]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → F1-F4 → user okay
Parallel Speedup: Tasks 1 & 2 run concurrently
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | 3      |
| 2    | —         | —      |
| 3    | 1         | —      |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **1** — T3 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Fix embed model spinner — add max-retry timeout and user feedback

  **What to do**:
  - In `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte`, modify the polling logic (lines 168-184) to:
    1. Add a retry counter variable (e.g., `let embedPollAttempts = 0; const MAX_EMBED_POLL_ATTEMPTS = 30;`)
    2. Inside the `setInterval` callback, increment the counter each iteration
    3. When counter reaches MAX (30 attempts = 60 seconds), clear the interval AND set `localModelLoaded = true` to dismiss the spinner
    4. Also set a new reactive variable `embedLoadFailed = true` that the template can use to show a warning message instead of the normal "model ready" state
  - In the template section (around line 206-211 where the spinner is shown), add a conditional: if `embedLoadFailed`, show a brief warning text like "Embedding model failed to load — local embedding disabled" instead of the spinner
  - Set `localEmbedEnabled = false` when giving up, so the rest of the grading flow proceeds without local embedding (graceful degradation)
  - Ensure the interval is still properly cleaned up in the existing `onDestroy` / `$effect` cleanup (line 186-189 area)

  **Must NOT do**:
  - Do NOT modify `local-embedder.js` or the server-side init logic
  - Do NOT change the polling interval (2s is fine)
  - Do NOT remove the existing happy-path logic (when model loads, spinner clears)
  - Do NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Svelte component edit, adding a counter and conditional to existing logic
  - **Skills**: []
    - No specialized skills needed — straightforward reactive state addition
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed for implementation, only for QA (executor handles QA separately)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte:37` — `localModelLoaded = $bindable(true)` — the bindable prop pattern; new `embedLoadFailed` should follow same style
  - `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte:150-186` — Full polling logic block. Lines 168-184 are the `setInterval` to modify. Line 166 is the `warm-embed` POST. Lines 186-189 clean up the interval on destroy.
  - `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte:206-211` — Template section showing the spinner when `localEmbedEnabled && !localModelLoaded`. Add the `embedLoadFailed` conditional branch here.

  **API/Type References**:
  - `grading-server/server.js:495` — `GET /api/embed-status` returns `{ modelLoaded: boolean }` — this is what the polling reads
  - `grading-server/server.js:499-502` — `POST /api/warm-embed` fires `initLocalEmbedder().catch(() => {})` — note the swallowed error

  **External References**:
  - Svelte 5 reactivity: `$bindable()` props and `$effect()` cleanup patterns are already used in this file

  **WHY Each Reference Matters**:
  - Lines 168-184 are the EXACT code to modify — the `setInterval` callback needs the counter check
  - Lines 206-211 are the EXACT template to add the error state branch
  - The `$bindable(true)` pattern on line 37 shows how to declare the new `embedLoadFailed` variable

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — embed model loads successfully
    Tool: Playwright (playwriter skill)
    Preconditions: Grading server running on localhost:3456 with Ollama running and embed model available. App loaded in Chrome.
    Steps:
      1. Navigate to sidepanel grader tab
      2. Ensure "use local embedding" setting is enabled
      3. Open a grading profile that triggers embed model loading
      4. Observe the embed model loading spinner appears
      5. Wait up to 30 seconds for the spinner to resolve
      6. Assert: spinner disappears and model status shows as loaded
    Expected Result: Spinner disappears within normal model loading time (5-15s), UI shows model ready state
    Failure Indicators: Spinner still visible after 30s, no model status indicator
    Evidence: .sisyphus/evidence/task-1-embed-happy-path.png

  Scenario: Failure path — embed model fails to load (simulate by stopping Ollama)
    Tool: Playwright (playwriter skill) + Bash
    Preconditions: App loaded, grading server running, Ollama STOPPED (to simulate failure)
    Steps:
      1. Stop Ollama service: `ollama stop` or kill process
      2. Navigate to sidepanel grader tab with local embedding enabled
      3. Observe embed model loading spinner appears
      4. Wait 65 seconds (past the 60s timeout threshold)
      5. Assert: spinner disappears
      6. Assert: warning message is visible (text contains "failed" or "disabled")
      7. Assert: grading flow can still proceed (local embedding gracefully disabled)
    Expected Result: After ~60 seconds, spinner replaced by warning message. Grading remains functional.
    Failure Indicators: Spinner still spinning after 65s, no warning message, grading flow blocked
    Evidence: .sisyphus/evidence/task-1-embed-failure-timeout.png
  ```

  **Evidence to Capture:**
  - [ ] task-1-embed-happy-path.png — Screenshot of successful model load
  - [ ] task-1-embed-failure-timeout.png — Screenshot of timeout warning state

  **Commit**: YES (groups with Task 3)
  - Message: `fix(grader): add timeout and error feedback to embed model spinner`
  - Files: `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [ ] 2. Fix anchor generation spinner — dismiss on phase transition with AbortController

  **What to do**:
  - In `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`, modify the anchor generation `$effect` (lines 216-267) to:
    1. Create an `AbortController` at the start of the effect, and pass its signal to the fetch call inside `generateAnchors()` (or wrap the await with an abort check)
    2. In the `$effect`'s cleanup/teardown (Svelte 5 `$effect` returns a cleanup function), abort the controller — this ensures that when `batchPhase` changes away from `'review'`, the pending API call is cancelled
    3. Add a SEPARATE `$effect` that watches `batchPhase`: when `batchPhase !== 'review'` AND `anchorGenerating` is still `true`, force-set `anchorGenerating = false`. This is the defensive safety net.
  - The key insight: Svelte 5 `$effect` re-runs when its tracked dependencies change. When `batchPhase` changes from `'review'` to `'grading'`, the effect re-runs. The cleanup from the PREVIOUS run should abort the controller. The NEW run sees `batchPhase !== 'review'` and does nothing (the `if (phase === 'review')` guard on line 217).
  - **IMPORTANT**: Check if `generateAnchors()` in `grading-api.ts` accepts an AbortSignal parameter. If not, the simplest approach is to NOT pass AbortSignal to the fetch (modifying grading-api.ts is more invasive), and instead just add the defensive `$effect` that resets `anchorGenerating` when phase leaves `'review'`. The abort is a nice-to-have; the defensive reset is the must-have.

  **Must NOT do**:
  - Do NOT modify the `generateAnchors()` function in `grading-api.ts` (keep changes minimal)
  - Do NOT change the `batchPhase` state machine or transitions
  - Do NOT alter the anchor data format or display logic
  - Do NOT remove the existing `finally` block logic (it's still useful for normal completion)
  - Do NOT modify `BatchInstructions.svelte` (the spinner display component is fine — the bug is in the state management)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Svelte component edit, adding a defensive $effect and optional AbortController
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed for implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:216-267` — The ENTIRE `$effect` block to modify. Lines 216-218 are the phase check and setup. Lines 222-230 are pre-call guards. Line 232 is the `generateAnchors()` call. Lines 234-249 process the response. Lines 250-258 are the catch block (fallback to static anchors). Lines 259-264 are the `finally` block that sets `anchorGenerating = false`.
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:14-15` — `anchorGenerating` prop declaration (bindable)
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:10` — `batchPhase` prop declaration

  **API/Type References**:
  - `ogre-desktop/src/lib/grading-api.ts` — `generateAnchors(request)` function. Check if it accepts an `options` or `signal` parameter. If not, skip AbortController and use defensive $effect only.

  **Template References** (for understanding spinner display):
  - `ogre-desktop/src/components/grading/batch/BatchInstructions.svelte:97-127` — Shows anchor spinner when `anchorGenerating` is true. This file is NOT modified; understanding it confirms that setting `anchorGenerating = false` is sufficient to dismiss the spinner.

  **WHY Each Reference Matters**:
  - Lines 216-267 are the EXACT effect to modify — the executor needs to see the full async IIFE structure to add cleanup correctly
  - The `batchPhase` prop declaration shows the type and how it's used reactively
  - `grading-api.ts` needs to be checked for AbortSignal support before deciding implementation approach

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — anchors generate before user starts grading
    Tool: Playwright (playwriter skill)
    Preconditions: App loaded, grading server running, AI provider configured
    Steps:
      1. Start a new grading session (select rubric, configure provider)
      2. Reach the review phase where anchor generation begins
      3. Observe anchor loading spinner appears
      4. Wait for anchors to generate (typically 5-15s)
      5. Assert: spinner disappears, anchor text is displayed
      6. Click "Continue to Grading"
      7. Assert: grading phase begins normally, no spinner visible
    Expected Result: Spinner shows during generation, disappears when anchors arrive, grading proceeds cleanly
    Failure Indicators: Spinner persists after anchors displayed, anchor text missing
    Evidence: .sisyphus/evidence/task-2-anchor-happy-path.png

  Scenario: Phase transition — user starts grading while anchors still generating
    Tool: Playwright (playwriter skill)
    Preconditions: App loaded, grading server running, AI provider configured (use a slow model or slow network to make anchors take longer)
    Steps:
      1. Start a grading session and reach the review phase
      2. Observe anchor loading spinner appears
      3. IMMEDIATELY click "Continue to Grading" or "Skip" (before anchors finish)
      4. Assert: grading phase begins
      5. Assert: anchor spinner is NOT visible in the grading view
      6. Assert: grading UI is fully functional (can grade students)
    Expected Result: Spinner dismissed immediately on phase transition, grading works normally
    Failure Indicators: Spinner still visible during grading, UI blocked
    Evidence: .sisyphus/evidence/task-2-anchor-phase-transition.png

  Scenario: Error path — anchor generation fails (e.g., AI provider unreachable)
    Tool: Playwright (playwriter skill) + Bash
    Preconditions: App loaded, grading server running, AI provider intentionally misconfigured or unreachable
    Steps:
      1. Start a grading session with an invalid provider/model
      2. Reach review phase
      3. Observe anchor loading spinner appears
      4. Wait for the API call to fail (should hit catch block)
      5. Assert: spinner disappears (finally block fires)
      6. Assert: fallback anchor text is shown (from catch block's static anchors)
    Expected Result: Spinner resolves on error, fallback content displayed
    Failure Indicators: Spinner spins forever on error, no fallback content
    Evidence: .sisyphus/evidence/task-2-anchor-error-fallback.png
  ```

  **Evidence to Capture:**
  - [ ] task-2-anchor-happy-path.png — Screenshot of successful anchor generation
  - [ ] task-2-anchor-phase-transition.png — Screenshot confirming no spinner during grading after skip
  - [ ] task-2-anchor-error-fallback.png — Screenshot of fallback content after error

  **Commit**: YES
  - Message: `fix(grader): dismiss anchor spinner on phase transition`
  - Files: `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [ ] 3. Expose embed init error state from server

  **What to do**:
  - In `grading-server/server.js`, modify the `GET /api/embed-status` endpoint (line 495) to return additional error information:
    1. Import or access an `embedError` variable from `local-embedder.js` that captures the last init failure
    2. Return `{ modelLoaded: isModelLoaded(), error: getEmbedError() }` (or similar) so the frontend can distinguish "still loading" from "failed"
  - In `grading-server/local-embedder.js`, add error tracking:
    1. Add a module-level variable: `let lastError = null;`
    2. In the `catch` block of `initLocalEmbedder()` (around line 99), set `lastError = err.message || 'Unknown error'` before resetting `initPromise`
    3. Export a `getEmbedError()` function that returns `lastError`
    4. Clear `lastError = null` at the start of a successful `initLocalEmbedder()` call
  - In `BatchProfileSelector.svelte`, enhance the polling to check for `data.error`:
    1. If `data.error` is present in the response, immediately stop polling, set `embedLoadFailed = true`, dismiss spinner
    2. This gives instant failure feedback (instead of waiting for the 60s timeout from Task 1) when the server knows the init failed

  **Must NOT do**:
  - Do NOT change the `initLocalEmbedder()` core logic (download, ONNX session loading)
  - Do NOT change the `POST /api/warm-embed` endpoint behavior
  - Do NOT add logging that exposes sensitive paths or system info
  - Do NOT modify the error recovery behavior (resetting `initPromise` to allow retries)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small additions to two backend files and a minor frontend enhancement
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 1 (needs the `embedLoadFailed` variable to exist in BatchProfileSelector)

  **References**:

  **Pattern References**:
  - `grading-server/server.js:495-497` — Current `GET /api/embed-status` endpoint: `app.get('/api/embed-status', (c) => c.json({ modelLoaded: isModelLoaded() }))`. Modify to include error field.
  - `grading-server/server.js:499-502` — `POST /api/warm-embed` endpoint with `.catch(() => {})` — shows the error swallowing pattern this task addresses
  - `grading-server/local-embedder.js:78-101` — `initLocalEmbedder()` function. Lines 99-101 are the catch block where `lastError` should be set.
  - `grading-server/local-embedder.js:157-161` — Current exports: `isModelLoaded`, `initLocalEmbedder`, `embedText`. Add `getEmbedError` here.
  - `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte:170-180` — Polling callback that checks `data.modelLoaded`. Add `data.error` check here.

  **WHY Each Reference Matters**:
  - Line 495 is the exact endpoint to modify — add error field to response
  - Lines 99-101 in local-embedder.js are where errors occur but aren't captured — add error tracking here
  - Lines 157-161 show current exports — add `getEmbedError` to the export list
  - Lines 170-180 in BatchProfileSelector are where the frontend reads the response — add error detection

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Server reports embed error — frontend detects immediately
    Tool: Bash (curl) + Playwright (playwriter skill)
    Preconditions: Grading server running, Ollama stopped to cause init failure
    Steps:
      1. Stop Ollama: ensure model loading will fail
      2. POST to http://localhost:3456/api/warm-embed to trigger init
      3. Wait 5 seconds for init to fail
      4. GET http://localhost:3456/api/embed-status
      5. Assert: response contains `"error"` field with non-null value
      6. Assert: response contains `"modelLoaded": false`
      7. In the app UI, observe that the spinner resolves quickly (within one poll cycle = 2s) after the server knows about the error
    Expected Result: `GET /api/embed-status` returns `{ "modelLoaded": false, "error": "..." }`, frontend stops polling immediately
    Failure Indicators: No error field in response, frontend keeps polling despite server knowing about failure
    Evidence: .sisyphus/evidence/task-3-embed-error-api.txt (curl output), .sisyphus/evidence/task-3-embed-error-ui.png

  Scenario: Error clears on successful retry
    Tool: Bash (curl)
    Preconditions: Server running, previous init had failed (error state set)
    Steps:
      1. Start Ollama (make model available)
      2. POST to http://localhost:3456/api/warm-embed
      3. Wait for init to complete (up to 30s for model download)
      4. GET http://localhost:3456/api/embed-status
      5. Assert: `"modelLoaded": true`
      6. Assert: `"error"` field is null or absent
    Expected Result: After successful init, error state is cleared
    Failure Indicators: Error field persists after successful model load
    Evidence: .sisyphus/evidence/task-3-embed-error-clears.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-embed-error-api.txt — curl output showing error field
  - [ ] task-3-embed-error-ui.png — Screenshot of immediate error detection in UI
  - [ ] task-3-embed-error-clears.txt — curl output showing error cleared after success

  **Commit**: YES (groups with Task 1)
  - Message: `fix(grader): add timeout and error feedback to embed model spinner`
  - Files: `grading-server/server.js`, `grading-server/local-embedder.js`, `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read files, check for max-retry in BatchProfileSelector, phase-aware dismiss in BatchProgress). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Review all changed files for: proper cleanup of intervals/AbortControllers on component destroy, no memory leaks from orphaned timers, no `as any`/`@ts-ignore`, no empty catches without user feedback, no console.log in prod paths. Check Svelte reactivity correctness (no accidental effect re-triggers).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwriter` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (embed model loading while anchor generation runs). Test edge cases: rapid phase transitions, network errors during polling. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1 + Task 3**: `fix(grader): add timeout and error feedback to embed model spinner` — `BatchProfileSelector.svelte`, `server.js`
- **Task 2**: `fix(grader): dismiss anchor spinner on phase transition` — `BatchProgress.svelte`

---

## Success Criteria

### Verification Commands
```bash
# Build check (no TypeScript/Svelte errors)
cd ogre-desktop && npm run build  # Expected: successful build, no errors
```

### Final Checklist
- [ ] Embed model spinner resolves within 60 seconds on failure
- [ ] Embed model spinner clears normally when model loads successfully
- [ ] Anchor spinner dismisses when user transitions to grading
- [ ] Anchor spinner clears normally when anchors generate successfully
- [ ] No interval/timer leaks on component destroy
- [ ] No regressions in happy-path grading flow
- [ ] All "Must NOT Have" items absent from diff
