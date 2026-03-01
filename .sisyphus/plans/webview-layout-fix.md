# Fix Webview Layout on Browser Tab Switch + Lifecycle Hardening

## TL;DR

> **Quick Summary**: Fix a race condition where the embedded browser webview renders at wrong bounds when switching back to the Browser tab, and harden the entire webview layout lifecycle against 6 identified timing issues.
> 
> **Deliverables**:
> - Browser tab webview correctly sized on every tab switch (no more toggling GradingPanel as workaround)
> - Webview layout resilient to sidebar animation, window resize while away, modal show/hide
> - No visible flash of stale webview position on tab return
> - TDD test coverage for all new pure-function logic
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (tests) -> Task 2 (Browser.svelte core fix) -> Task 5 (App.svelte ordering) -> Task 7 (integration QA)

---

## Context

### Original Request
The user reported that when on the Browser tab, if they leave and come back, the page doesn't always load properly — the webview doesn't fit correctly and they have to toggle the GradingPanel open/close to force a re-layout.

### Interview Summary
**Key Discussions**:
- User wants a broader lifecycle audit, not just the primary race condition fix
- User chose TDD strategy with vitest (existing infrastructure)
- SiteProfiles.svelte confirmed NOT affected (doesn't use webview bounds)

**Research Findings**:
- **Root cause**: `ogre:sidebar-changed` event dispatched by App.svelte BEFORE new Browser component mounts — event lost, no post-animation recalculation happens
- **Rust side**: No mutex on webview ops, `show_webview` is pure visibility toggle (no position reset), `set_webview_bounds` makes two separate IPC calls (position + size)
- **6 timing issues identified** ranging from CRITICAL to LOW-MEDIUM
- **Svelte patterns**: Browser.svelte uses Svelte 4 `$:` reactivity; GradingPanel.svelte uses Svelte 5 runes (`$state`, `$effect`). Must match existing pattern per file.
- **vitest runs in Node** (no DOM) — new logic must be structured as testable pure functions

### Metis Review
**Identified Gaps** (addressed):
- **showWebview ownership**: Removing `showWebview()` from App.svelte requires adding it to Browser.svelte's return path (lines 217-228 currently do NOT call showWebview)
- **7th scenario**: The `showUpdateModal` reactive block (App.svelte:45-50) also dispatches `ogre:sidebar-changed` and needs review
- **Rapid tab switching**: Browser.svelte could be destroyed while async onMount is mid-flight — need cancellation guard
- **Svelte version consistency**: Match `$:` in Browser.svelte, `$state`/`$effect` in GradingPanel — don't mix within a file
- **Test boundary**: vitest is Node-only — DOM/lifecycle tests are out of scope, pure-function logic is testable

---

## Work Objectives

### Core Objective
Eliminate the webview layout bug on tab switch by fixing the event timing race condition and hardening the entire webview show/hide/bounds lifecycle against all 6 identified timing issues.

### Concrete Deliverables
- Modified `Browser.svelte` — self-manages sidebar animation on mount, handles stale-bounds scenarios
- Modified `App.svelte` — corrected show/hide ordering, removed premature showWebview call
- New/updated pure-function logic in `webview-layout.ts` or new `webview-lifecycle.ts` for testable timing logic
- Updated `webview-layout.test.ts` + new test file(s) for lifecycle logic
- All existing tests still pass

### Definition of Done
- [ ] Switching away from Browser tab and back: webview renders at correct bounds immediately
- [ ] No visible flash of stale webview position on tab return
- [ ] Toggling GradingPanel is no longer required as a workaround
- [ ] Window resize while on another tab: correct bounds on return to Browser
- [ ] Modal open/close while on Browser: correct bounds after modal dismissal
- [ ] Rapid tab switching: no crashes, no orphaned listeners, no stale state
- [ ] All vitest tests pass: `npx vitest run`

### Must Have
- Fix the lost `ogre:sidebar-changed` event (Issue 1)
- Post-sidebar-animation bounds recalculation (Issues 2, 3)
- Correct show/bounds ordering — no flash (Issue 5)
- Handle window resize on return (Issue 4)
- Rapid tab switch guard (Metis finding)
- TDD: tests written before implementation for pure-function logic

### Must NOT Have (Guardrails)
- Do NOT add Rust-side mutex (Issue 6 — low severity, separate concern)
- Do NOT change Svelte version patterns within a file — use `$:` in Browser.svelte, runes in GradingPanel
- Do NOT introduce new npm dependencies
- Do NOT change the webview creation flow (Rust-side `create_embedded_browser`)
- Do NOT touch GradingPanel screenshot flow (it has its own show/hide lifecycle that works)
- Do NOT add artificial delays/sleeps as a fix — use proper event-driven timing (transitionend, RAF)
- Do NOT over-comment or add JSDoc to existing functions that don't have it

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest with `node` environment)
- **Automated tests**: TDD — write failing tests first, then implement
- **Framework**: vitest (existing config at `ogre-desktop/vitest.config.ts`)
- **TDD scope**: Pure-function logic only (scheduling, bounds calculation, state management). DOM/lifecycle timing verified via QA scenarios.

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — not applicable (native Tauri webview, not browser-testable)
- **TUI/CLI**: Use interactive_bash (tmux) — for running the dev app and observing behavior
- **Unit tests**: Use Bash (`npx vitest run`) — verify all tests pass
- **Build**: Use Bash (`npm run build` or equivalent) — verify no TypeScript errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types, pure functions, tests):
├── Task 1: Extract testable lifecycle logic + write TDD tests [deep]
├── Task 2: Write TDD tests for sidebar animation scheduling [quick]
└── Task 3: Write TDD test for destroy-guard / cancellation token [quick]

Wave 2 (Core fixes — MAX PARALLEL after Wave 1):
├── Task 4: Fix Browser.svelte — self-trigger sidebar animation on mount [deep]
├── Task 5: Fix App.svelte — correct show/hide ordering [quick]
└── Task 6: Fix Browser.svelte — destroy guard for rapid tab switching [quick]

Wave 3 (Verification):
└── Task 7: Integration QA + build verification [unspecified-high]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 4 → Task 5 → Task 7 → F1-F4
Parallel Speedup: Wave 1 has 3 parallel tasks, Wave 2 has 3 parallel tasks
Max Concurrent: 3 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5, 6 | 1 |
| 2 | — | 4 | 1 |
| 3 | — | 6 | 1 |
| 4 | 1, 2 | 7 | 2 |
| 5 | 1 | 7 | 2 |
| 6 | 3 | 7 | 2 |
| 7 | 4, 5, 6 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `deep`, T2 `quick`, T3 `quick`
- **Wave 2**: 3 tasks — T4 `deep`, T5 `quick`, T6 `quick`
- **Wave 3**: 1 task — T7 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Extract testable webview lifecycle logic + write TDD tests (RED phase)

  **What to do**:
  - Create `ogre-desktop/src/lib/webview-lifecycle.ts` with pure functions:
    - `shouldTriggerSidebarAnimation(browserCreated: boolean): boolean` — returns true when browser exists on mount (meaning we need to self-trigger the sidebar animation tracking that the lost event would have provided)
    - `calculatePostAnimationDelay(sidebarTransitionMs: number, elapsedSinceNavigate: number): number` — returns remaining ms to wait before final bounds recalc (0 if animation already finished)
    - `createDestroyGuard()` — returns `{ destroyed: boolean, markDestroyed(): void }` pattern for cancelling async operations when component unmounts during flight
  - Create `ogre-desktop/src/lib/webview-lifecycle.test.ts` with RED tests:
    - Test `shouldTriggerSidebarAnimation(true)` returns `true`
    - Test `shouldTriggerSidebarAnimation(false)` returns `false`
    - Test `calculatePostAnimationDelay(300, 0)` returns `300` (just navigated)
    - Test `calculatePostAnimationDelay(300, 150)` returns `150` (halfway through)
    - Test `calculatePostAnimationDelay(300, 400)` returns `0` (already finished)
    - Test `createDestroyGuard()` starts with `destroyed === false`
    - Test `createDestroyGuard().markDestroyed()` sets `destroyed === true`
  - Run `npx vitest run` — all NEW tests should FAIL (RED). Existing tests should still pass.

  **Must NOT do**:
  - Do NOT implement the functions yet (only type stubs that throw or return wrong values)
  - Do NOT import Svelte, Tauri, or DOM APIs in this file — pure TypeScript only
  - Do NOT modify any existing files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD requires careful test design to capture the exact timing semantics
  - **Skills**: []
    - No special skills needed — pure TypeScript/vitest
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — these are unit tests, not browser tests

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/webview-layout.ts` — Follow the same pure-function, no-DOM pattern (imports nothing from Svelte/Tauri)
  - `ogre-desktop/src/lib/webview-layout.test.ts` — Follow the same vitest test structure and assertion patterns
  - `ogre-desktop/src/lib/page-refresh.ts` — Another example of extracted pure logic with factory functions (createDebouncedRefresh)

  **API/Type References**:
  - `ogre-desktop/src/lib/constants.ts` — `ICON_STRIP_WIDTH = 48` (may be useful for type references)
  - `ogre-desktop/src/app.css:60` — `--sidebar-transition: 0.3s ease` — the 300ms value the delay calculation must respect

  **External References**:
  - vitest docs: https://vitest.dev/api/ — describe/it/expect API

  **WHY Each Reference Matters**:
  - `webview-layout.ts` shows the exact file/module pattern to follow: JSDoc comments, exported interface + function, zero side effects
  - `webview-layout.test.ts` shows the project's testing conventions: import style, describe blocks, assertion patterns
  - `page-refresh.ts` shows the factory-function pattern used for stateful utilities (createDebouncedRefresh), which `createDestroyGuard` should follow

  **Acceptance Criteria**:
  - [ ] File created: `ogre-desktop/src/lib/webview-lifecycle.ts` with type stubs
  - [ ] File created: `ogre-desktop/src/lib/webview-lifecycle.test.ts` with 7+ test cases
  - [ ] `npx vitest run webview-lifecycle` -> 7+ FAILURES (RED phase)
  - [ ] `npx vitest run webview-layout` -> all PASS (existing tests unaffected)

  **QA Scenarios:**

  ```
  Scenario: New test file runs and fails (TDD RED)
    Tool: Bash
    Preconditions: ogre-desktop directory, vitest configured
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/webview-lifecycle.test.ts
      2. Capture exit code and output
      3. Assert exit code !== 0 (tests should fail)
      4. Assert output contains 7 or more test names
      5. Assert output contains "FAIL" for each test
    Expected Result: All 7+ tests fail (functions not implemented yet)
    Failure Indicators: Any test passes, or file not found
    Evidence: .sisyphus/evidence/task-1-tdd-red.txt

  Scenario: Existing tests unaffected
    Tool: Bash
    Preconditions: ogre-desktop directory
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/webview-layout.test.ts
      2. Assert exit code === 0
      3. Assert output shows all existing tests pass
    Expected Result: All existing webview-layout tests pass
    Failure Indicators: Any existing test fails
    Evidence: .sisyphus/evidence/task-1-existing-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-tdd-red.txt — vitest output showing RED failures
  - [ ] task-1-existing-tests.txt — vitest output showing existing tests pass

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `test(webview): add TDD RED tests for webview lifecycle logic`
  - Files: `src/lib/webview-lifecycle.ts`, `src/lib/webview-lifecycle.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/webview-layout.test.ts`

- [x] 2. Write TDD tests for sidebar animation scheduling helper (RED phase)

  **What to do**:
  - Add to `ogre-desktop/src/lib/webview-lifecycle.ts`:
    - `scheduleBoundsUpdateAfterAnimation(opts: { sidebarTransitionMs: number, updateFn: () => void, guard: { destroyed: boolean } }): () => void` — schedules an update after the sidebar animation completes, using a `setTimeout` (not RAF, since we need the FINAL position, not intermediate frames). Returns a cleanup function to cancel the timeout.
  - Add tests to `ogre-desktop/src/lib/webview-lifecycle.test.ts`:
    - Test: calling the function returns a cleanup function (typeof === 'function')
    - Test: after `sidebarTransitionMs` elapses, `updateFn` is called (use `vi.useFakeTimers`)
    - Test: if `guard.destroyed` is true when timeout fires, `updateFn` is NOT called
    - Test: calling the cleanup function before timeout prevents `updateFn` from being called
    - Test: calling with `sidebarTransitionMs = 0` calls `updateFn` immediately (or next tick)
  - Run `npx vitest run` — new tests should FAIL (RED)

  **Must NOT do**:
  - Do NOT implement the scheduling function yet — only stubs
  - Do NOT use RAF for this scheduler — the point is to wait UNTIL animation is done, not track frames during
  - Do NOT import DOM APIs — use `setTimeout` (available in Node for tests)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward stub + test cases, builds on Task 1's file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/page-refresh.ts:createDebouncedRefresh` (lines 156-173) — Factory function that returns a cleanup-capable timer. Follow this exact pattern: outer function returns inner function, uses setTimeout, captures timer reference.

  **Test References**:
  - vitest fake timers: `vi.useFakeTimers()`, `vi.advanceTimersByTime(ms)`, `vi.useRealTimers()`

  **WHY Each Reference Matters**:
  - `createDebouncedRefresh` is the project's established pattern for timer-based scheduling with cleanup. The new scheduler should follow the same shape.

  **Acceptance Criteria**:
  - [ ] 5+ new test cases added to webview-lifecycle.test.ts
  - [ ] `npx vitest run webview-lifecycle` -> all tests FAIL (RED)

  **QA Scenarios:**

  ```
  Scenario: Scheduling tests exist and fail (RED)
    Tool: Bash
    Preconditions: Task 1 completed (test file exists)
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/webview-lifecycle.test.ts 2>&1
      2. Assert output contains "scheduleBoundsUpdateAfterAnimation" describe block
      3. Assert all scheduling tests show FAIL
    Expected Result: 5+ new scheduling tests fail
    Evidence: .sisyphus/evidence/task-2-tdd-red.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `test(webview): add TDD RED tests for webview lifecycle logic`
  - Files: `src/lib/webview-lifecycle.ts`, `src/lib/webview-lifecycle.test.ts`

- [x] 3. Write TDD test for destroy-guard cancellation token (RED phase)

  **What to do**:
  - Add to `ogre-desktop/src/lib/webview-lifecycle.ts`:
    - Enhance `createDestroyGuard()` to also return `onDestroy(callbacks: Array<() => void>): void` — calls all cleanup callbacks AND sets `destroyed = true`. This is the one-shot cleanup for Browser.svelte's `onDestroy`.
  - Add tests to `ogre-desktop/src/lib/webview-lifecycle.test.ts`:
    - Test: `onDestroy` calls all provided callbacks
    - Test: `onDestroy` sets `destroyed` to true
    - Test: `onDestroy` is safe to call multiple times (idempotent)
    - Test: Empty callback array doesn't throw
  - Run `npx vitest run` — new tests should FAIL (RED)

  **Must NOT do**:
  - Do NOT implement yet — stubs only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small addition to existing file, straightforward test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/page-refresh.ts:stopActiveBatch` (lines 127-144) — Example of a cleanup function that safely handles null values and calls multiple cleanup operations

  **Acceptance Criteria**:
  - [ ] 4+ new test cases added to webview-lifecycle.test.ts
  - [ ] `npx vitest run webview-lifecycle` -> all tests FAIL (RED)

  **QA Scenarios:**

  ```
  Scenario: Destroy guard tests exist and fail (RED)
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/webview-lifecycle.test.ts 2>&1
      2. Assert output contains "onDestroy" or "destroy guard" describe block
      3. Assert new tests show FAIL
    Expected Result: 4+ new destroy-guard tests fail
    Evidence: .sisyphus/evidence/task-3-tdd-red.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `test(webview): add TDD RED tests for webview lifecycle logic`
  - Files: `src/lib/webview-lifecycle.ts`, `src/lib/webview-lifecycle.test.ts`

---

- [ ] 4. Fix Browser.svelte — self-trigger sidebar animation on mount + implement lifecycle functions (GREEN phase)

  **What to do**:
  This is the core fix. Three changes to Browser.svelte and one to webview-lifecycle.ts:

  **A) Implement webview-lifecycle.ts functions (GREEN phase):**
  - Implement ALL functions stubbed in Tasks 1-3 so their tests pass
  - `shouldTriggerSidebarAnimation`, `calculatePostAnimationDelay`, `createDestroyGuard`, `scheduleBoundsUpdateAfterAnimation`
  - Run `npx vitest run webview-lifecycle` — all tests should now PASS (GREEN)

  **B) Self-trigger sidebar animation on mount (fixes Issues 1, 2, 3):**
  - In Browser.svelte `onMount`, AFTER the existing webview check (line 224 area), add:
    - Call `shouldTriggerSidebarAnimation(browserCreated)` — if true, call `handleSidebarChanged()` directly (don't rely on the lost event)
    - This triggers the RAF loop that continuously updates bounds during the 300ms sidebar animation
    - ALSO schedule a final recalculation after the sidebar transition completes using `scheduleBoundsUpdateAfterAnimation({ sidebarTransitionMs: 350, updateFn: updateWebviewBounds, guard })` (use 350ms = 300ms transition + 50ms buffer)
  - Register the `ogre:sidebar-changed` event listener EARLIER in onMount — move it before the async DB calls, right after the synchronous setup

  **C) Handle window resize on return (fixes Issue 4):**
  - The existing `updateWebviewBounds()` call at line 224 already handles this, but it runs mid-animation
  - The fix from (B) covers this: the post-animation recalculation ensures final bounds are correct

  **D) Handle the `showUpdateModal` reactive block (Metis finding — 7th scenario):**
  - In App.svelte lines 45-50, the reactive block dispatches `ogre:sidebar-changed` when modal closes and browser is active
  - This is fine as-is because Browser.svelte IS mounted when this fires (modal doesn't destroy it)
  - No change needed, but verify in QA

  **Must NOT do**:
  - Do NOT change Svelte reactivity from `$:` to `$effect` in Browser.svelte
  - Do NOT add artificial `setTimeout(300)` delays without the destroy guard
  - Do NOT modify the webview creation flow or the `listenBrowserStatus` callback
  - Do NOT touch GradingPanel.svelte

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core fix requires understanding the full timing model, Svelte lifecycle, and careful integration of the new functions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Browser.svelte:159-235` — The full `onMount` function. The fix adds code AFTER line 228 (after the existing webview check) and moves the event listener registration BEFORE the async calls
  - `ogre-desktop/src/pages/Browser.svelte:137-157` — `handleSidebarChanged()` RAF loop. This function already works correctly; we just need to call it directly on mount instead of relying on the lost event
  - `ogre-desktop/src/pages/Browser.svelte:106-114` — Reactive `$:` block that tracks panel visibility changes. No changes needed here, but understand it because it also calls `updateWebviewBounds()`
  - `ogre-desktop/src/pages/Browser.svelte:237-246` — `onDestroy`. Must add cleanup for the new scheduled timeout.

  **API/Type References**:
  - `ogre-desktop/src/lib/webview-lifecycle.ts` — The new functions created in Tasks 1-3 that this task implements and integrates

  **WHY Each Reference Matters**:
  - The onMount at lines 159-235 is where ALL the timing issues originate. Understanding its full async sequence is critical to placing the fix correctly.
  - `handleSidebarChanged` is the existing RAF loop that already does exactly what we need (animate bounds during sidebar transition). We're not reinventing it — just calling it when the event is missed.

  **Acceptance Criteria**:
  - [ ] `npx vitest run webview-lifecycle` -> all tests PASS (GREEN phase)
  - [ ] `npx vitest run` -> all project tests PASS
  - [ ] Browser.svelte onMount calls `handleSidebarChanged()` when returning to existing webview
  - [ ] Post-animation timeout scheduled with destroy guard
  - [ ] Timeout cleanup added to `onDestroy`

  **QA Scenarios:**

  ```
  Scenario: TDD GREEN — all lifecycle tests pass
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/webview-lifecycle.test.ts 2>&1
      2. Assert exit code === 0
      3. Assert ALL tests show PASS
    Expected Result: 16+ tests pass (7 from Task 1 + 5 from Task 2 + 4 from Task 3)
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-4-tdd-green.txt

  Scenario: All project tests still pass
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run 2>&1
      2. Assert exit code === 0
      3. Assert no test failures
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-4-all-tests.txt
  ```

  **Commit**: YES (groups with Tasks 5, 6)
  - Message: `fix(webview): resolve layout race condition on browser tab switch`
  - Files: `src/lib/webview-lifecycle.ts`, `src/pages/Browser.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [ ] 5. Fix App.svelte — correct show/hide ordering (fixes Issue 5)

  **What to do**:
  Fix the premature `showWebview()` call that causes the webview to flash at stale bounds before Browser.svelte calculates correct ones.

  **A) Remove premature showWebview from navigate():**
  - In `App.svelte` `navigate()` function (line 118-129), REMOVE the `showWebview().catch(() => {})` call at line 122
  - Keep `sidebarCollapsed = true` and the `ogre:sidebar-changed` dispatch (the dispatch is still useful for when Browser IS mounted, e.g., sidebar toggle)
  - Browser.svelte's onMount will handle showing the webview AFTER bounds are set (it already does this at line 208 via `showWebview()` after `updateWebviewBounds()`)

  **B) Fix the reactive block for modal close:**
  - In `App.svelte` lines 45-50, the reactive block also calls `showWebview()` when modal closes and browser is active
  - This one is FINE to keep — when the modal closes, Browser.svelte IS mounted and its bounds ARE correct
  - No change needed here

  **C) Verify Browser.svelte's return path shows webview:**
  - In Browser.svelte onMount, the existing webview check (lines 216-228) calls `updateWebviewBounds()` but does NOT call `showWebview()`
  - Add `await showWebview().catch(() => {})` AFTER `updateWebviewBounds()` at line 224 (similar to line 208 which does this for new creation)
  - This ensures: bounds set FIRST, then show — no flash

  **Must NOT do**:
  - Do NOT remove the `showWebview` from the modal reactive block (lines 45-50) — it's correct there
  - Do NOT remove the `ogre:sidebar-changed` dispatch from navigate() — it's still useful for sidebar toggle
  - Do NOT change the `hideWebview` call when navigating AWAY from browser

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused changes in 2 files with clear before/after
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/App.svelte:118-129` — The `navigate()` function. Line 122 has the premature `showWebview()` to remove.
  - `ogre-desktop/src/App.svelte:45-50` — The `showUpdateModal` reactive block. Review but do NOT change.
  - `ogre-desktop/src/pages/Browser.svelte:204-208` — The `browser-status: embedded-open` handler that correctly does bounds-then-show. The return path (lines 216-228) should follow this same pattern.
  - `ogre-desktop/src/pages/Browser.svelte:216-228` — The existing webview detection on mount. Needs `showWebview()` added after `updateWebviewBounds()`.

  **WHY Each Reference Matters**:
  - Line 122 is THE specific line to remove — it causes the flash by showing the webview before bounds are calculated
  - Lines 204-208 show the CORRECT pattern (bounds first, show second) that line 224 should follow

  **Acceptance Criteria**:
  - [ ] App.svelte `navigate('browser')` no longer calls `showWebview()`
  - [ ] Browser.svelte return path (existing webview check) calls `showWebview()` after bounds
  - [ ] `npx vitest run` -> all tests PASS
  - [ ] `npx tsc --noEmit` -> no TypeScript errors (in ogre-desktop dir)

  **QA Scenarios:**

  ```
  Scenario: No premature showWebview in navigate()
    Tool: Bash (grep)
    Steps:
      1. Search App.svelte navigate function for showWebview
      2. The only showWebview calls should be in the modal reactive block (line ~48) and NOT in navigate()
    Expected Result: navigate() function does not contain showWebview
    Evidence: .sisyphus/evidence/task-5-no-premature-show.txt

  Scenario: TypeScript compiles clean
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx tsc --noEmit 2>&1
      2. Assert exit code === 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-5-tsc.txt
  ```

  **Commit**: YES (groups with Tasks 4, 6)
  - Message: `fix(webview): resolve layout race condition on browser tab switch`
  - Files: `src/App.svelte`, `src/pages/Browser.svelte`

- [ ] 6. Fix Browser.svelte — destroy guard for rapid tab switching (Metis finding)

  **What to do**:
  Prevent crashes/orphaned state when user rapidly switches tabs (Browser created, onMount starts async work, user switches away before onMount completes, Browser destroyed).

  **A) Add destroy guard to onMount:**
  - At the START of `onMount`, create a guard: `const guard = createDestroyGuard()`
  - Before each `await` in onMount, check `if (guard.destroyed) return`
  - Specifically guard:
    - After `await getSetting('browser_saved_urls')` (line 161)
    - After `await getSetting('ogreDrawerState')` (line 167)
    - After `await listenBrowserUrlChanged(...)` (line 186)
    - After `await getEmbeddedUrl()` (line 218)
    - After `await tick()` (line 223)

  **B) Clean up in onDestroy:**
  - In `onDestroy`, call `guard.markDestroyed()` (or `guard.onDestroy([...cleanup callbacks])`)
  - Also cancel any scheduled post-animation timeout from Task 4

  **Must NOT do**:
  - Do NOT change the logic of any existing operation — only add guard checks
  - Do NOT make guard checks overly verbose — a simple `if (guard.destroyed) return;` line after each await

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical insertion of guard checks at known await points
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Browser.svelte:159-246` — Full onMount + onDestroy. Every `await` keyword in onMount is an insertion point for a guard check.
  - `ogre-desktop/src/lib/webview-lifecycle.ts:createDestroyGuard()` — The guard factory from Tasks 1/4.

  **WHY Each Reference Matters**:
  - The onMount has 5 `await` points. Each is a suspension point where the component could be destroyed before the next line runs. The guard prevents post-destroy side effects.

  **Acceptance Criteria**:
  - [ ] `guard.destroyed` checked after each await in onMount
  - [ ] `guard.markDestroyed()` called in onDestroy
  - [ ] Scheduled timeout cleanup added to onDestroy
  - [ ] `npx vitest run` -> all tests PASS

  **QA Scenarios:**

  ```
  Scenario: Guard checks present at all await points
    Tool: Bash (grep)
    Steps:
      1. Search Browser.svelte for 'guard.destroyed' occurrences
      2. Count occurrences (should be 5+)
      3. Search for 'markDestroyed' in onDestroy block
    Expected Result: 5+ guard checks, 1 markDestroyed in onDestroy
    Evidence: .sisyphus/evidence/task-6-guard-checks.txt

  Scenario: All tests still pass
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run 2>&1
      2. Assert exit code === 0
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-6-tests.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5)
  - Message: `fix(webview): resolve layout race condition on browser tab switch`
  - Files: `src/pages/Browser.svelte`

- [ ] 7. Integration QA + build verification

  **What to do**:
  - Run the full test suite: `cd ogre-desktop && npx vitest run`
  - Run TypeScript check: `cd ogre-desktop && npx tsc --noEmit`
  - Verify no regressions in existing functionality
  - Run the dev app (`npm run tauri:dev`) and execute manual QA scenarios

  **Must NOT do**:
  - Do NOT make code changes in this task — only verify and capture evidence

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs to run the actual Tauri dev server and interact with the app
  - **Skills**: [`playwriter`]
    - `playwriter`: For browser-level interaction with the running Tauri app if possible; otherwise fall back to visual inspection via tmux

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5, 6

  **References**:
  - All QA scenarios from Tasks 1-6
  - `ogre-desktop/package.json` — for build/dev scripts

  **Acceptance Criteria**:
  - [ ] `npx vitest run` -> 0 failures
  - [ ] `npx tsc --noEmit` -> 0 errors
  - [ ] App launches with `npm run tauri:dev`
  - [ ] Tab switch Browser -> Settings -> Browser: webview renders correctly
  - [ ] Rapid tab switching (5+ clicks): no crash, no orphaned state
  - [ ] Window resize while on Settings, switch to Browser: correct bounds
  - [ ] Open GradingPanel, switch away, come back: panel and webview both correct
  - [ ] Update modal (if triggerable): webview hidden during modal, correct after dismiss

  **QA Scenarios:**

  ```
  Scenario: Basic tab switch (the primary bug)
    Tool: interactive_bash (tmux) / visual inspection
    Preconditions: App running via npm run tauri:dev, browser webview open with a URL loaded
    Steps:
      1. Navigate to a URL in the Browser tab (e.g., https://www.google.com)
      2. Wait for page to fully load
      3. Click Settings tab in sidebar
      4. Wait 2 seconds
      5. Click Browser tab in sidebar
      6. Observe webview position and size
    Expected Result: Webview fills the content area correctly, no gap at left/right/top/bottom, no overlap with sidebar or nav bar
    Failure Indicators: Webview has wrong size, positioned behind sidebar, extends beyond window, or is invisible
    Evidence: .sisyphus/evidence/task-7-basic-switch.png

  Scenario: Rapid tab switching
    Tool: interactive_bash (tmux)
    Steps:
      1. With browser webview open, rapidly click: Settings, Browser, Dashboard, Browser, History, Browser (6 clicks in ~2 seconds)
      2. End on Browser tab
      3. Wait 1 second for animations to settle
      4. Observe webview
    Expected Result: Webview renders correctly, no crash, app responsive
    Failure Indicators: App freezes, webview invisible, console errors about destroyed components
    Evidence: .sisyphus/evidence/task-7-rapid-switch.png

  Scenario: Window resize while away
    Tool: interactive_bash (tmux)
    Steps:
      1. With browser webview open, switch to Settings tab
      2. Resize window (make it significantly smaller or larger)
      3. Switch back to Browser tab
      4. Observe webview bounds
    Expected Result: Webview matches new window size correctly
    Evidence: .sisyphus/evidence/task-7-resize-away.png

  Scenario: GradingPanel + tab switch
    Tool: interactive_bash (tmux)
    Steps:
      1. Open Browser tab, load a URL
      2. Open GradingPanel (click the panel toggle button)
      3. Switch to Dashboard tab
      4. Switch back to Browser tab
      5. Observe: both GradingPanel and webview should be correctly positioned
    Expected Result: GradingPanel visible at correct width, webview fills remaining space
    Evidence: .sisyphus/evidence/task-7-panel-switch.png

  Scenario: All tests and build pass
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run 2>&1
      2. Run: cd ogre-desktop && npx tsc --noEmit 2>&1
      3. Assert both exit with code 0
    Expected Result: Zero test failures, zero TS errors
    Evidence: .sisyphus/evidence/task-7-tests.txt, .sisyphus/evidence/task-7-tsc.txt
  ```

  **Commit**: YES
  - Message: `chore(webview): verify integration and capture QA evidence`
  - Files: `.sisyphus/evidence/*`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection -> fix -> re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify Svelte pattern consistency (`$:` in Browser.svelte, runes in GradingPanel).
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start the app with `npm run tauri:dev`. Execute EVERY QA scenario from EVERY task — follow exact steps. Test rapid tab switching (5+ rapid clicks). Test window resize while on another tab. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| After Task | Message | Key Files |
|-----------|---------|-----------|
| Wave 1 complete | `test(webview): add TDD tests for layout lifecycle logic` | test files |
| Wave 2 complete | `fix(webview): resolve layout race condition on browser tab switch` | Browser.svelte, App.svelte, new/modified .ts files |
| Wave 3 complete | `chore(webview): verify integration and clean up` | evidence files |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run           # Expected: all tests pass, 0 failures
cd ogre-desktop && npx tsc --noEmit         # Expected: no TypeScript errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All vitest tests pass
- [ ] Browser tab switch renders correctly (no GradingPanel toggle needed)
- [ ] No flash of stale webview position
- [ ] Window resize while away handled
- [ ] Rapid tab switching doesn't crash
