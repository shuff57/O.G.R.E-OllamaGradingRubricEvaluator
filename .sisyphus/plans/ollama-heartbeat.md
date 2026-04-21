# Ollama Cloud Keepalive Heartbeat + Silent Failure Fixes

## TL;DR

> **Quick Summary**: Add periodic SSE `heartbeat` events emitted every 30s during Ollama AI waits so the teacher sees "AI is thinking... (Xs elapsed)" during cold-start delays. Also fix a silent hang in `response.text()` which has no timeout and can hang indefinitely after the initial fetch succeeds.
>
> **Deliverables**:
> - `server.js`: `Promise.race` timeout on `response.text()` + `setInterval` keepalive at every `callProviderDirect` call site
> - `sse-parser.ts`: New `heartbeat` event dispatch case
> - `grading-api.ts`: New `onHeartbeat` callback in `BatchGradingCallbacks` interface
> - `BatchProgress.svelte`: `onHeartbeat` handler that updates the phase message with elapsed time
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — edits are sequential (each file builds on previous)
> **Critical Path**: server.js → sse-parser.ts → grading-api.ts → BatchProgress.svelte

---

## Context

### Original Request
Batch grading hangs silently for ~4 minutes when using Ollama Cloud (RunPod) due to model cold-start. User sees no feedback during this wait. User requested: *"lets add a callout so every couple of minutes so I know the connection is alive. Capture anything that might fail silently?"*

### Research Findings
- **Full call chain**: `BatchProgress.svelte` → `grading-api.ts:startBatchGrading()` → `POST /api/grade` → `server.js` → `callProviderDirect()` → `fetch()` to Ollama
- **Root cause of hang**: Ollama Cloud cold model loading (~4 min for large models). The fetch headers resolve immediately, but `response.text()` (body read) then blocks.
- **Silent failure #1**: `response.text()` at `server.js:212` has NO timeout. `AbortController` at line 167–168 only guards `fetch()` headers, NOT body read.
- **Silent failure #2**: The `setInterval` keepalive will also catch cases where the Ollama inference is slow (not just cold-start).
- **Root cause of timeout**: `ollama-cloud` `timeoutMs` is 120,000ms (2 min). `glm-4.1v-9b-thinking` is a reasoning/thinking model and legitimately needs longer — cold-start + chain-of-thought inference can easily exceed 2 min. Increasing to 300,000ms (5 min).
- `timeoutMs` = **was** 120,000ms for ollama-cloud (too short for thinking models), 600,000ms for local. Will be changed to 300,000ms (5 min) for ollama-cloud. Body-read timeout reuses same value.
- `stream.writeSSE()` is Hono's SSE writer — available in the route handler scope at all call sites.
- `sseId` is a running integer counter used for all SSE events in the handler.
- No `heartbeat` event or `onHeartbeat` callback exists anywhere today.
- `BatchProgress.svelte` uses `phaseMessage` (`.phase-message` div, line 997) for status text — this is where heartbeat messages will appear.
- `startBatchGrading` callbacks block is at `BatchProgress.svelte:604–611`.

### Key Line Numbers (Confirmed)
- `server.js:212` — `const responseText = await response.text();`
- `server.js:1652` — serial loop main `callProviderDirect`
- `server.js:1659` — serial loop retry `callProviderDirect`
- `server.js:1700` — parallel calibration `callProviderDirect`
- `server.js:1735–1739` — parallel wave `Promise.all(wave.map(... callProviderDirect ...))`
- `sse-parser.ts` — switch/case event dispatch (unknown events silently ignored)
- `grading-api.ts:609` — `startBatchGrading()` with `BatchGradingCallbacks`
- `BatchProgress.svelte:604–611` — `startBatchGrading` call with callbacks

---

## Work Objectives

### Core Objective
Surface long Ollama waits to the teacher via periodic SSE heartbeat events, and prevent `response.text()` from hanging indefinitely by adding a body-read timeout that matches the existing fetch timeout.

### Concrete Deliverables
- Modified `grading-server/server.js`
- Modified `ogre-desktop/src/lib/sse-parser.ts`
- Modified `ogre-desktop/src/lib/grading-api.ts`
- Modified `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`

### Definition of Done
- [ ] `response.text()` times out with a clear error message if body read exceeds `timeoutMs`
- [ ] Every `callProviderDirect` call site emits SSE `heartbeat` events every 30 seconds while waiting
- [ ] `sse-parser.ts` dispatches `heartbeat` events to `onHeartbeat` callback (no silent drop)
- [ ] `BatchProgress.svelte` shows "AI is thinking... (Xs elapsed)" in the phase message area during a heartbeat
- [ ] `clearInterval` is called in `finally` blocks — no interval leak if the call throws
- [ ] `stream.writeSSE` errors in the keepalive are silently caught (don't abort the grading run)

### Must Have
- Heartbeat interval: **30 seconds** (fires 3× during a 90s wait, 8× during a 4-min cold-start)
- Timeout on `response.text()` reuses the existing `timeoutMs` variable (no new magic numbers)
- `clearInterval` in `finally` at every keepalive site
- `onHeartbeat` is **optional** in the callback interface (won't break callers that don't provide it)
- Elapsed seconds in heartbeat data so UI can display time

### Must NOT Have (Guardrails)
- **No changes to grading logic** — rubric parsing, scoring, chunking, consistency sweep are untouched
- **No changes to existing SSE events** — `progress`, `chunk`, `outlier`, `sweep`, `done`, `error` shapes are frozen
- **No new dependencies** — use only existing Bun/Hono/Svelte APIs
- **No keepalive during non-AI work** — intervals only around `callProviderDirect` calls, not during prompt building or result parsing
- **No keepalive for the error-path `response.text()` at line 206** — that's an error body read, intentionally left as-is (it's in an error branch and already `.catch(() => '')`-guarded)
- **Do not change `timeoutMs` values** — these are correctly set per-provider
- **Do not add keepalive to consistency sweep or outlier review calls** — those are fast internal calls, not user-facing cold-start points

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest in grading-server/test/)
- **Automated tests**: NO — these are small surgical edits to error handling and SSE event plumbing; QA scenarios via curl + server log inspection are sufficient
- **Agent-Executed QA**: MANDATORY for all tasks

### QA Policy
- **Backend**: Bash (curl + live server logs) — start grading server, hit `/api/grade`, observe SSE stream
- **Frontend**: Playwright — open app, trigger a batch grade, observe phase message area
- Evidence saved to `.sisyphus/evidence/`

---

## Execution Strategy

### Sequential Execution (these edits have hard dependencies)

```
Step 1: server.js — response.text() timeout fix (standalone, no dependencies)
Step 2: server.js — keepalive setInterval at all callProviderDirect call sites (depends on: understanding of step 1 pattern)
Step 3: sse-parser.ts — add heartbeat dispatch case (depends on: heartbeat SSE shape from step 2)
Step 4: grading-api.ts — add onHeartbeat to BatchGradingCallbacks (depends on: step 3)
Step 5: BatchProgress.svelte — add onHeartbeat handler (depends on: step 4)
```

All 5 steps can go in a single commit since they're one logical feature. Or split server-side (steps 1–3) and client-side (steps 4–5) into two commits.

---

## TODOs

- [ ] 0. Increase `ollama-cloud` timeout from 120s → 300s

  **What to do**:
  - In `grading-server/server.js`, locate line 166:
    ```javascript
    const timeoutMs = providerLc === 'ollama-cloud' ? 120000 : providerLc === 'ollama' || providerLc === 'ollama-local' ? 600000 : 30000;
    ```
  - Change `120000` to `300000`
  - Update the comment on line 164 from `120s for cloud` to `300s for cloud`
  - No other changes to the timeout logic

  **Why**: `glm-4.1v-9b-thinking` is a reasoning/thinking model. It generates a full chain-of-thought before producing its answer. Cold-start (model load from disk, ~2–4 min on RunPod) plus thinking inference can easily exceed the old 2-minute (120s) limit. 5 minutes (300s) gives headroom for a cold start + full inference on a large thinking model.

  **Exact replacement**:
  ```javascript
  // Timeout: 600s for local Ollama (large batches can take minutes), 300s for cloud (thinking models need time)
  const timeoutMs = providerLc === 'ollama-cloud' ? 300000 : providerLc === 'ollama' || providerLc === 'ollama-local' ? 600000 : 30000;
  ```

  **Must NOT do**:
  - Do not change local Ollama timeout (600000) or other-provider timeout (30000)
  - Do not change the AbortController logic or how `timeoutId` is used
  - Do not change the `timeoutMs` variable name

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (touches only line 166, independent of Tasks 1–5)
  - **Parallel Group**: Step 0 (can run alongside or before Task 1 — same file pass preferred)
  - **Blocks**: Nothing (but do in same file edit pass as Task 1 to avoid double-edit conflicts)
  - **Blocked By**: None

  **References**:
  - `grading-server/server.js:164–166` — the timeout comment and `timeoutMs` declaration

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: ollama-cloud timeout is 300000
    Tool: Bash (grep)
    Preconditions: Edit applied
    Steps:
      1. grep -n "timeoutMs" grading-server/server.js | head -5
      2. Confirm the ollama-cloud branch reads 300000 (not 120000)
      3. Confirm local Ollama still reads 600000
      4. Confirm other providers still read 30000
    Expected Result: timeoutMs = 300000 for ollama-cloud; other values unchanged
    Evidence: .sisyphus/evidence/task-0-timeout-check.txt
  ```

  **Commit**: YES (group with Tasks 1 and 2 — all server.js edits)
  - Message: `fix(server): increase ollama-cloud timeout to 300s for thinking models`

---

- [ ] 1. Fix `response.text()` silent hang — add body-read timeout

  **What to do**:
  - In `grading-server/server.js`, locate line 212: `const responseText = await response.text();`
  - Replace with a `Promise.race` that races `response.text()` against a timeout using the existing `timeoutMs` variable
  - The timeout rejection message should be: `` `${provider} response body read timed out after ${timeoutMs / 1000}s` ``
  - Leave the error-path `response.text()` at line 206 **unchanged** (it's already `.catch(() => '')`-guarded and is in an error branch)

  **Exact replacement** (replace only the `response.text()` line, keep the `let data; try { JSON.parse... }` block intact):
  ```javascript
  // Guard: response.text() can hang indefinitely if the server stalls mid-body-read.
  // The AbortController above only covers the initial fetch() connection, not body streaming.
  // Wrap with Promise.race so we surface a clear error instead of hanging forever.
  const responseText = await Promise.race([
    response.text(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${provider} response body read timed out after ${timeoutMs / 1000}s`)),
        timeoutMs
      )
    ),
  ]);
  ```

  **Must NOT do**:
  - Do not touch line 206 (`const errorText = await response.text().catch(() => '');`)
  - Do not change `timeoutMs` values or the AbortController logic above
  - Do not add any new variables outside the race pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Step 1
  - **Blocks**: Step 2 (establishes the pattern)
  - **Blocked By**: None

  **References**:
  - `grading-server/server.js:167–212` — full `callProviderDirect` function body; `timeoutMs` is in scope at line 212
  - `grading-server/server.js:205–210` — the error-path `response.text()` that must NOT be touched

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Body-read timeout fires with clear error message
    Tool: Bash (inspection)
    Preconditions: No running server needed — static code inspection
    Steps:
      1. Read grading-server/server.js lines 210–225
      2. Confirm Promise.race wraps response.text() with a timeout rejection
      3. Confirm the timeout uses the variable `timeoutMs` (not a hardcoded value)
      4. Confirm error message includes provider name and timeout in seconds
      5. Confirm line 206 (error-path response.text()) is UNCHANGED
    Expected Result: Promise.race present; line 206 unchanged; no magic numbers
    Evidence: .sisyphus/evidence/task-1-body-timeout-inspection.txt

  Scenario: Error-path response.text() is unchanged (regression check)
    Tool: Bash (grep)
    Preconditions: Edit applied
    Steps:
      1. Search for `errorText` assignment in server.js
      2. Confirm it still reads: const errorText = await response.text().catch(() => '');
    Expected Result: Line 206 unchanged
    Evidence: .sisyphus/evidence/task-1-errorpath-unchanged.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `fix(server): add body-read timeout to prevent response.text() silent hang`

---

- [ ] 2. Add keepalive `setInterval` at every `callProviderDirect` call site

  **What to do**:
  Wrap each of the 4 `callProviderDirect` call sites in `server.js` with a keepalive pattern. The pattern:
  1. Capture start time
  2. Start a `setInterval` that emits a `heartbeat` SSE event every 30,000ms
  3. `await` the `callProviderDirect` call
  4. `clearInterval` in a `finally` block

  **Exact pattern to apply at each site**:
  ```javascript
  const _kaStart = Date.now();
  const _kaInterval = setInterval(async () => {
    try {
      await stream.writeSSE({
        event: 'heartbeat',
        data: JSON.stringify({ phase: 'waiting', elapsed: Math.round((Date.now() - _kaStart) / 1000) }),
        id: String(sseId++),
      });
    } catch (_kaErr) {
      // SSE write failed (client disconnected) — ignore, don't abort grading
    }
  }, 30_000);
  let <resultVar>;
  try {
    <resultVar> = await callProviderDirect(...existing args...);
  } finally {
    clearInterval(_kaInterval);
  }
  ```

  **Apply at these 4 sites** (use unique variable names at each site):

  **Site A — serial loop main (line 1652)**:
  - `_kaStart` → `_kaStartA`, `_kaInterval` → `_kaIntervalA`, result var `aiText`
  - After: `const aiText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: prompt }], timestamp(), fallbackOptions);`
  - Wrap in pattern above

  **Site B — serial loop retry (line 1659)**:
  - `_kaStart` → `_kaStartB`, `_kaInterval` → `_kaIntervalB`, result var `_retryText`
  - After: `const _retryText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: _retryPrompt }], timestamp(), fallbackOptions);`

  **Site C — parallel calibration (line 1700)**:
  - `_kaStart` → `_kaStartC`, `_kaInterval` → `_kaIntervalC`, result var `calText`
  - After: `const calText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: calPrompt }], timestamp(), fallbackOptions);`

  **Site D — parallel wave Promise.all (lines 1735–1739)**:
  - This is a `Promise.all(wave.map(...))` — wrap the entire `Promise.all` in the pattern
  - `_kaStart` → `_kaStartD`, `_kaInterval` → `_kaIntervalD`, result var `waveTexts`
  - After:
    ```javascript
    const waveTexts = await Promise.all(
      wave.map(chunk => {
        const prompt = buildBatchPrompt(...);
        return callProviderDirect(...);
      })
    );
    ```

  **Must NOT do**:
  - Do not add keepalive around consistency sweep or outlier calls (those are fast)
  - Do not modify the arguments to `callProviderDirect` — only wrap the await
  - Do not use the same variable names across sites (would conflict in scope)
  - Do not put `clearInterval` anywhere except `finally`
  - Do not let SSE write errors in the interval propagate — they must be swallowed

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (do after Task 1 — use same file pass)
  - **Parallel Group**: Step 2 (continue editing server.js from Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `grading-server/server.js:1642–1682` — serial grading loop (sites A and B)
  - `grading-server/server.js:1691–1770` — parallel strategy section (sites C and D)
  - `grading-server/server.js:1644–1648` — example of `stream.writeSSE()` call to follow for format
  - `grading-server/server.js:1` — `sseId` is declared as `let sseId = 0` near the handler start; confirm exact declaration location

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Keepalive intervals present at all 4 call sites
    Tool: Bash (inspection)
    Preconditions: Edit applied
    Steps:
      1. Read server.js lines 1640–1770
      2. Confirm setInterval + clearInterval in finally appears 4 times
      3. Confirm each site uses unique variable names (_kaStartA/_kaIntervalA, etc.)
      4. Confirm event name is 'heartbeat' and data has {phase, elapsed} shape
      5. Confirm SSE write error is caught and swallowed in each interval callback
    Expected Result: 4 keepalive patterns present, all with unique names and finally cleanup
    Evidence: .sisyphus/evidence/task-2-keepalive-inspection.txt

  Scenario: Live heartbeat fires during a slow AI call (integration)
    Tool: Bash (curl + server logs)
    Preconditions: Grading server running (bun run start in grading-server/); use a provider
      configured with a short timeout for testing OR just verify via log observation
    Steps:
      1. Start grading server: cd grading-server && bun run start
      2. Send a POST /api/grade request with valid rubric and students
      3. Pipe SSE stream to stdout: curl -N -X POST http://localhost:3456/api/grade -H "Content-Type: application/json" -d @test-payload.json
      4. Observe SSE output — within 30s of each AI call starting, a heartbeat event should appear
      5. Confirm heartbeat event shape: event: heartbeat, data: {"phase":"waiting","elapsed":<N>}
    Expected Result: At least one heartbeat event visible in SSE stream
    Evidence: .sisyphus/evidence/task-2-live-heartbeat.txt
  ```

  **Commit**: YES (with Task 1)
  - Message: `feat(server): emit SSE heartbeat every 30s during callProviderDirect waits`

---

- [ ] 3. Add `heartbeat` case to `sse-parser.ts` event dispatch

  **What to do**:
  - Open `ogre-desktop/src/lib/sse-parser.ts`
  - Find the switch/case block that dispatches SSE events by name
  - Add a new case for `'heartbeat'` that calls `callbacks.onHeartbeat?.(data)` (optional chaining — safe if caller doesn't provide it)
  - The `data` object has shape `{ phase: string; elapsed: number }` — no parsing needed beyond `JSON.parse(event.data)` which already happens for all events

  **Must NOT do**:
  - Do not change any existing cases (`progress`, `chunk`, `outlier`, `sweep`, `done`, `error`)
  - Do not make `onHeartbeat` required — it must be optional
  - Do not add any logging or side effects in the parser

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Step 3
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `ogre-desktop/src/lib/sse-parser.ts:1–262` — full file; find the switch/case dispatch block
  - The existing event case pattern to follow (e.g., the `'chunk'` case) — copy its structure exactly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: heartbeat case dispatches to onHeartbeat callback
    Tool: Bash (inspection)
    Preconditions: Edit applied
    Steps:
      1. Read sse-parser.ts and find the switch/case block
      2. Confirm case 'heartbeat' exists
      3. Confirm it calls callbacks.onHeartbeat?.(data) with optional chaining
      4. Confirm no existing cases were modified
    Expected Result: heartbeat case present with optional-chaining call; all other cases unchanged
    Evidence: .sisyphus/evidence/task-3-sse-parser-inspection.txt
  ```

  **Commit**: YES (group with Tasks 4–5 as client-side commit)
  - Message: `feat(sse-parser): dispatch heartbeat events to onHeartbeat callback`

---

- [ ] 4. Add `onHeartbeat` to `BatchGradingCallbacks` interface in `grading-api.ts`

  **What to do**:
  - Open `ogre-desktop/src/lib/grading-api.ts`
  - Find the `BatchGradingCallbacks` interface (or type) definition
  - Add: `onHeartbeat?: (data: { phase: string; elapsed: number }) => void;`
  - Find the `guardedCallbacks` object construction (~line 663) where each callback is wrapped with a cancel-token check
  - Add `onHeartbeat` forwarding to `guardedCallbacks`:
    ```typescript
    onHeartbeat: callbacks.onHeartbeat
      ? (data) => { if (!token.cancelled) callbacks.onHeartbeat!(data); }
      : undefined,
    ```

  **Must NOT do**:
  - Do not make `onHeartbeat` required — it must be optional in the interface
  - Do not change any other callbacks or the cancel-token logic
  - Do not add any logging or transformation of the heartbeat data

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Step 4
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `ogre-desktop/src/lib/grading-api.ts:609` — `startBatchGrading()` function start
  - `ogre-desktop/src/lib/grading-api.ts:~663` — `guardedCallbacks` construction; study its pattern for existing callbacks (e.g., `onProgress`, `onChunk`) to match the style exactly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: onHeartbeat present in interface and guardedCallbacks
    Tool: Bash (inspection)
    Preconditions: Edit applied
    Steps:
      1. Read grading-api.ts and find BatchGradingCallbacks interface
      2. Confirm onHeartbeat?: (data: { phase: string; elapsed: number }) => void is present
      3. Find guardedCallbacks construction
      4. Confirm onHeartbeat is forwarded with cancel-token check
      5. Run TypeScript check: cd ogre-desktop && npx tsc --noEmit
    Expected Result: Interface has optional onHeartbeat; guardedCallbacks forwards it; tsc passes
    Evidence: .sisyphus/evidence/task-4-grading-api-inspection.txt
  ```

  **Commit**: YES (group with Tasks 3 and 5)

---

- [ ] 5. Add `onHeartbeat` handler in `BatchProgress.svelte`

  **What to do**:
  - Open `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`
  - Find the `startBatchGrading` callbacks block at lines 604–611
  - Add `onHeartbeat` callback:
    ```typescript
    onHeartbeat: (data) => {
      phaseMessage = `AI is thinking... (${data.elapsed}s elapsed)`;
    },
    ```
  - Place it after `onProgress` and before or after `onChunk` — order within the object does not matter

  **Must NOT do**:
  - Do not modify `handleSSEProgress`, `handleSSEChunk`, or any other existing SSE handler
  - Do not change `phaseMessage` from any other place than this new callback
  - Do not add any new reactive state variables — just update the existing `phaseMessage`
  - Do not add an import — `onHeartbeat` flows through the existing `startBatchGrading` call

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Step 5 (final)
  - **Blocks**: Nothing
  - **Blocked By**: Task 4

  **References**:
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:604–611` — `startBatchGrading` callbacks block; add `onHeartbeat` here
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:997` — `.phase-message` div that displays `phaseMessage` — verify it's still the right target
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:679–718` — `handleSSEProgress` as a style reference (how phaseMessage is set in existing code)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: onHeartbeat callback updates phaseMessage
    Tool: Bash (inspection)
    Preconditions: Edit applied
    Steps:
      1. Read BatchProgress.svelte lines 600–620
      2. Confirm onHeartbeat callback is present in startBatchGrading call
      3. Confirm it sets phaseMessage = `AI is thinking... (${data.elapsed}s elapsed)`
      4. Confirm no other existing callbacks were changed
    Expected Result: onHeartbeat present; phaseMessage updated correctly; no other changes
    Evidence: .sisyphus/evidence/task-5-batchprogress-inspection.txt

  Scenario: TypeScript build passes after all edits
    Tool: Bash
    Preconditions: All 5 tasks complete
    Steps:
      1. cd ogre-desktop && npx tsc --noEmit
      2. Confirm exit code 0 and no type errors
    Expected Result: TypeScript compilation succeeds with no errors
    Evidence: .sisyphus/evidence/task-5-tsc-check.txt

  Scenario: Full end-to-end SSE heartbeat flows from server to UI (smoke test)
    Tool: Bash (curl to verify server side)
    Preconditions: Grading server running
    Steps:
      1. Start grading server: cd grading-server && bun run start
      2. Send a grade request and observe raw SSE output
      3. Confirm heartbeat event appears in stream with correct shape
      4. Confirm other events (progress, chunk, done) still appear normally
    Expected Result: heartbeat events present; no regression to existing events
    Evidence: .sisyphus/evidence/task-5-e2e-sse-stream.txt
  ```

  **Commit**: YES (with Tasks 3 and 4)
  - Message: `feat(ui): show "AI is thinking... (Xs elapsed)" heartbeat during Ollama cold-start`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify all 5 tasks were implemented. Check `response.text()` is wrapped. Check all 4 keepalive sites present. Check `sse-parser.ts` has heartbeat case. Check `grading-api.ts` interface and guardedCallbacks updated. Check `BatchProgress.svelte` has onHeartbeat. Verify no grading logic was touched.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` in ogre-desktop. Scan all changed files for: `as any`, empty catches without comment, console.log not already present. Check keepalive `finally` blocks are all present. Check no interval leaks.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Scope Fidelity Check** — `quick`
  Read git diff of all changed files. Verify only the 4 target files were touched. Verify no grading logic, rubric parsing, scoring, chunking, sweep, or outlier code was modified.
  Output: `Files changed [4/4 expected] | No grading logic touched [YES/NO] | VERDICT`

---

## Commit Strategy

- **Commit 1** (server-side): `fix(server): increase cloud timeout + response.text() timeout + SSE heartbeat keepalive`
  - Files: `grading-server/server.js`
  - Covers Tasks 0, 1, and 2

- **Commit 2** (client-side): `feat(grading): wire SSE heartbeat to UI phase message`
  - Files: `ogre-desktop/src/lib/sse-parser.ts`, `ogre-desktop/src/lib/grading-api.ts`, `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`
  - Covers Tasks 3, 4, 5

---

## Success Criteria

### Verification Commands
```bash
# TypeScript check (ogre-desktop/)
cd ogre-desktop && npx tsc --noEmit
# Expected: exit 0, no errors

# Confirm response.text() is wrapped (grading-server/)
grep -n "Promise.race" grading-server/server.js
# Expected: 1 match at line ~212

# Confirm 4 keepalive setIntervals (grading-server/)
grep -n "setInterval" grading-server/server.js
# Expected: 4 matches in the grading route handler

# Confirm heartbeat case in parser
grep -n "heartbeat" ogre-desktop/src/lib/sse-parser.ts
# Expected: 1 match

# Confirm onHeartbeat in interface
grep -n "onHeartbeat" ogre-desktop/src/lib/grading-api.ts
# Expected: 2 matches (interface + guardedCallbacks)

# Confirm handler in BatchProgress
grep -n "onHeartbeat" ogre-desktop/src/components/grading/batch/BatchProgress.svelte
# Expected: 1 match
```

### Final Checklist
- [ ] `ollama-cloud` `timeoutMs` changed from 120000 to 300000 on line 166
- [ ] Timeout comment on line 164 updated to say `300s for cloud`
- [ ] `response.text()` wrapped with `Promise.race` timeout using existing `timeoutMs`
- [ ] 4 `setInterval` keepalives in server.js — serial main, serial retry, calibration, parallel wave
- [ ] Each keepalive has `clearInterval` in a `finally` block
- [ ] Each keepalive swallows SSE write errors silently
- [ ] `sse-parser.ts` dispatches `heartbeat` to `onHeartbeat?.(data)` with optional chaining
- [ ] `grading-api.ts` has `onHeartbeat?` in `BatchGradingCallbacks` and `guardedCallbacks`
- [ ] `BatchProgress.svelte` shows "AI is thinking... (Xs elapsed)" on heartbeat
- [ ] `npx tsc --noEmit` passes
- [ ] No grading logic changed
- [ ] No existing SSE event shapes changed
