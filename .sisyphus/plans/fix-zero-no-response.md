# Fix: Grading Filter Behaviors — Zero for No Response, Score-0 Regrade, Regrade All

## TL;DR

> **Quick Summary**: The `applyZeroToNoResponseStudents()` method exists and works correctly but is never called. Add a "Give 0 for No Response" toggle to the Grading Options panel and wire it up, then add 3 missing tests covering all three filter scenarios.
>
> **Deliverables**:
> - New `zeroNoResponse` prop/state added to `BatchInstructions.svelte`, `BatchPanel.svelte`, and `BatchProgress.svelte`
> - `applyZeroToNoResponseStudents()` called in `BatchProgress.handleExtract()` when toggle is ON
> - 3 new tests in `batch-grader.test.ts` covering empty-response skipping, score-0 regrading, and forceRegrade
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — tasks are sequential (tests → toggle UI → wiring → verify)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
> "if the student response is empty they are skipped and given a 0 while everybody else will be graded and given feedback. If the student responds, then the student with a 0 is regraded but not everyone else. Then if I tick the regrade all then regardless of score or student responses all students will be graded from scratch as if its the first time"

### Interview Summary
**Key Discussions**:
- User wants a **toggle** for the "give 0 to no-response students" behavior — not always-on
- Toggle should live in **Grading Options** panel (in `BatchInstructions.svelte`) alongside the existing "Regrade All" toggle
- Feedback field for no-response students should remain **empty** (no "No response submitted" text)
- Zeros should be written **immediately after extraction** (when toggle is ON)

**Research Findings**:
- `applyZeroToNoResponseStudents()` at `batch-grader.ts:1542` — public, correct, **never called**
- Filter logic at lines 1483–1524 — already correct for all 3 scenarios
- `BatchInstructions.svelte` already has a toggle pattern (the "Regrade All" toggle) — mirror it exactly
- `forceRegrade` prop is correctly wired: `BatchPanel.svelte` → `BatchInstructions.svelte` (bind) → `BatchProgress.svelte`
- 1298 tests pass, 0 failures — existing test suite is healthy

### Metis Review
**Identified Gaps** (addressed):
- *Timing ambiguity*: Resolved — zeros written immediately after extraction when toggle is ON
- *Feedback content*: Resolved — leave empty (no text written)
- *Edge case: score=0 with manual feedback*: Documented below as known behavior; not changed
- *`fillGrade` return value not checked*: Accepted — `applyZeroToNoResponseStudents()` loop does not check return value; this is existing behavior, not changing in this plan

---

## Work Objectives

### Core Objective
Add a "Give 0 for No Response" toggle to the Grading Options panel and wire it so that after extraction, empty-response students receive a score of 0 on the page when the toggle is enabled.

### Concrete Deliverables
- `BatchInstructions.svelte`: new `zeroNoResponse` bindable prop with toggle UI (mirrors "Regrade All")
- `BatchPanel.svelte`: new `zeroNoResponse` state variable, passed down via bind
- `BatchProgress.svelte`: new `zeroNoResponse` prop, call `batchGrader.applyZeroToNoResponseStudents()` after `updateBatchState()` when `zeroNoResponse` is true
- `batch-grader.test.ts`: 3 new tests in a new `describe('BatchGrader - Filter Logic')` block

### Definition of Done
- [ ] Toggle appears in Grading Options panel and toggles visually
- [ ] When toggle is ON and extraction runs, score=0 is written to empty-response students
- [ ] When toggle is OFF, empty-response students are skipped with no score written
- [ ] Test suite passes: `npm test -- --run` in `ogre-desktop/` shows ≥1301 passing, 0 failures
- [ ] All 3 new filter-logic tests pass

### Must Have
- `zeroNoResponse` defaults to `true` (opt-out rather than opt-in — teacher expectation is that blanks get zeros)
- Toggle disabled while batch is running (same pattern as "Regrade All")
- Call to `applyZeroToNoResponseStudents()` only fires when `zeroNoResponse` is `true`

### Must NOT Have (Guardrails)
- Do NOT modify the filter logic in `batch-grader.ts` lines 1483–1524 — it is correct
- Do NOT modify `applyZeroToNoResponseStudents()` implementation
- Do NOT add any text to the feedback field (leave as empty string `''`)
- Do NOT touch `grading-pipeline.ts`
- Do NOT change `BatchPanel.svelte`'s `forceRegrade` wiring — it already works
- Do NOT write more than 3 new tests (stay in scope)
- Do NOT add JSDoc comments everywhere (AI slop)
- Do NOT abstract or extract helper functions unless they already exist

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (filter logic is already correct; tests verify existing behavior)
- **Framework**: vitest via `npm test`
- **TDD note**: Tests for filter logic (Task 1) will PASS immediately since logic already works. Task 2/3 wiring can't be unit-tested at the component level without Svelte test setup — verify via grep and full test run.

### QA Policy
Every task includes agent-executed verification. Evidence paths: `.sisyphus/evidence/task-{N}-{slug}.txt`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Task 1 only — tests first):
└── Task 1: Write 3 filter-logic tests in batch-grader.test.ts [quick]

Wave 2 (After Task 1 — UI + wiring):
├── Task 2: Add zeroNoResponse toggle to BatchInstructions.svelte [quick]
├── Task 3: Thread zeroNoResponse through BatchPanel → BatchProgress [quick]
└── Task 4: Call applyZeroToNoResponseStudents() in handleExtract() [quick]

Wave FINAL:
└── Task F1: Full test suite + grep verification + atomic commits
```

> Tasks 2, 3, 4 can run in parallel (different files) but are small enough to do sequentially for simplicity.

---

## TODOs

- [x] 1. Write 3 filter-logic tests in `batch-grader.test.ts`

  **What to do**:
  - Open `ogre-desktop/src/lib/batch-grader.test.ts`
  - Read lines 178–225 to understand the existing mock pattern (mock `evalScriptJSON`, student array, rubric null)
  - Add a new `describe('BatchGrader - Filter Logic', () => { ... })` block after the existing describes
  - Write **Test A — Empty response skip**:
    - Create students array with one student: `response: '  '` (whitespace only), `currentScore: ''`, `hasFeedback: false`
    - Mock `evalScriptJSON` to return the student array for `.length` selector and `scrollIntoView`, null for rubric
    - After `grader.start(profile, null, false)`, assert:
      - `grader.noResponseStudents.length === 1`
      - `grader.studentsToGrade.length === 0`
      - `grader.log` contains an entry with `status: 'skipped'` and `feedback: 'No response submitted'`
  - Write **Test B — Score-0 student with response gets regraded**:
    - Student: `response: 'My answer'`, `currentScore: '0'`, `hasFeedback: false`
    - After `grader.start(profile, null, false)`, assert `grader.studentsToGrade.length === 1`
  - Write **Test C — forceRegrade puts all-with-responses in toGrade**:
    - Students: two students, both `response: 'answer'`, one with `currentScore: '8'` and `hasFeedback: true`, one with `currentScore: '0'`
    - After `grader.start(profile, null, true)` (forceRegrade=true), assert `grader.studentsToGrade.length === 2`

  **Must NOT do**:
  - Do NOT test DOM writing (no mock for `fillGrade`) — test filter state only
  - Do NOT add more than 3 tests
  - Do NOT change any existing tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 3, 4 (logically — want green tests before touching UI)
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/lib/batch-grader.test.ts:178-225` — existing mock pattern to copy exactly
  - `ogre-desktop/src/lib/batch-grader.test.ts:1-30` — imports to understand what's available
  - `ogre-desktop/src/lib/batch-grader.ts:1483-1524` — filter logic being tested
  - `ogre-desktop/src/lib/batch-grader.ts:1315` — `get noResponseStudents()` public getter
  - `ogre-desktop/src/lib/batch-grader.ts:1` — `get studentsToGrade()` public getter (find it)

  **Acceptance Criteria**:
  - [ ] `npm test -- --run` in `ogre-desktop/` passes: all 3 new tests PASS, total ≥ 1301, 0 failures
  - [ ] New `describe('BatchGrader - Filter Logic')` block exists in the test file

  ```
  Scenario: All 3 filter-logic tests pass
    Tool: Bash
    Steps:
      1. Run: npm test -- --run (in ogre-desktop/)
      2. Assert output contains "1301 passed" or higher (was 1298)
      3. Assert output contains "0 failed"
      4. Assert output does NOT contain "Filter Logic" in any failure block
    Evidence: .sisyphus/evidence/task-1-tests-pass.txt
  ```

  **Commit**: YES (separate commit)
  - Message: `test: add filter-logic tests for empty response, score-0 regrade, and forceRegrade`
  - Files: `ogre-desktop/src/lib/batch-grader.test.ts`
  - Pre-commit: `npm test -- --run` in `ogre-desktop/`

---

- [x] 2. Add `zeroNoResponse` toggle to `BatchInstructions.svelte`

  **What to do**:
  - Open `ogre-desktop/src/components/grading/batch/BatchInstructions.svelte`
  - In the `$props()` destructure (lines 8–22), add `zeroNoResponse = $bindable(true)` alongside `forceRegrade = $bindable(false)`
  - In the Grading Options `<details>` section (lines 33–42), add a second toggle row below the "Regrade All" row — mirror the exact same HTML structure:
    ```svelte
    <label class="toggle-switch-row" class:disabled={isBatchRunning}>
      <span class="toggle-switch-label">Give 0 for No Response</span>
      <span class="toggle-switch" class:on={zeroNoResponse}>
        <input type="checkbox" bind:checked={zeroNoResponse} disabled={isBatchRunning} />
        <span class="toggle-thumb"></span>
      </span>
    </label>
    ```
  - No new CSS needed — reuses existing `.toggle-switch-row`, `.toggle-switch`, `.toggle-thumb` classes

  **Must NOT do**:
  - Do NOT change existing "Regrade All" toggle
  - Do NOT add new CSS classes
  - Do NOT add JSDoc or block comments

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3 and 4 — different files)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task F1
  - **Blocked By**: Task 1

  **References**:
  - `ogre-desktop/src/components/grading/batch/BatchInstructions.svelte:8-42` — existing props and toggle to mirror
  - `ogre-desktop/src/components/grading/batch/BatchInstructions.svelte:159-213` — existing toggle CSS (reuse, don't add)

  **Acceptance Criteria**:
  - [ ] "Give 0 for No Response" toggle appears in the Grading Options section
  - [ ] Toggle defaults to ON (`zeroNoResponse = $bindable(true)`)
  - [ ] Toggle is disabled when `isBatchRunning` is true (same as Regrade All)

  ```
  Scenario: Toggle UI exists in component
    Tool: Bash (grep)
    Steps:
      1. Run: Select-String -Path "ogre-desktop/src/components/grading/batch/BatchInstructions.svelte" -Pattern "Give 0 for No Response"
      2. Assert: returns 1 match
      3. Run: Select-String -Path "ogre-desktop/src/components/grading/batch/BatchInstructions.svelte" -Pattern "zeroNoResponse"
      4. Assert: returns at least 3 matches (prop, bind, class:on)
    Evidence: .sisyphus/evidence/task-2-toggle-exists.txt
  ```

  **Commit**: Groups with Task 3 and 4
  - Message: `fix: add Give-0-for-No-Response toggle and wire applyZeroToNoResponseStudents`

---

- [x] 3. Thread `zeroNoResponse` through `BatchPanel.svelte`

  **What to do**:
  - Open `ogre-desktop/src/components/grading/batch/BatchPanel.svelte`
  - Find where `forceRegrade` is declared as state (e.g. `let forceRegrade = $state(false)`)
  - Add alongside it: `let zeroNoResponse = $state(true)`
  - Find where `BatchInstructions` is used and `bind:forceRegrade` is passed — add `bind:zeroNoResponse` there
  - Find where `BatchProgress` is used and `{forceRegrade}` is passed — add `{zeroNoResponse}` there

  **Must NOT do**:
  - Do NOT change any other props or bindings
  - Do NOT change the `forceRegrade` wiring — it already works

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2 and 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task F1
  - **Blocked By**: Task 1

  **References**:
  - `ogre-desktop/src/components/grading/batch/BatchPanel.svelte:58` — `forceRegrade` state declaration (add `zeroNoResponse` right after)
  - `ogre-desktop/src/components/grading/batch/BatchPanel.svelte:~128` — where `{forceRegrade}` is passed to `BatchProgress`
  - `ogre-desktop/src/components/grading/batch/BatchPanel.svelte` — where `bind:forceRegrade` is passed to `BatchInstructions`

  **Acceptance Criteria**:
  - [ ] `zeroNoResponse` declared as `$state(true)` in `BatchPanel.svelte`
  - [ ] `bind:zeroNoResponse` passed to `BatchInstructions`
  - [ ] `{zeroNoResponse}` passed to `BatchProgress`

  ```
  Scenario: zeroNoResponse threaded through BatchPanel
    Tool: Bash (grep)
    Steps:
      1. Select-String -Path "ogre-desktop/src/components/grading/batch/BatchPanel.svelte" -Pattern "zeroNoResponse"
      2. Assert: at least 3 matches (state declaration, bind to Instructions, pass to Progress)
    Evidence: .sisyphus/evidence/task-3-panel-threading.txt
  ```

  **Commit**: Groups with Tasks 2 and 4

---

- [x] 4. Call `applyZeroToNoResponseStudents()` in `BatchProgress.svelte`

  **What to do**:
  - Open `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`
  - Find the props section and add `zeroNoResponse = false` (or wherever other props like `forceRegrade` are declared)
  - In `handleExtract()`, after line 415 (`updateBatchState();`), add exactly:
    ```typescript
    if (zeroNoResponse) {
      await batchGrader.applyZeroToNoResponseStudents();
    }
    ```
  - That's the only change to this file

  **Must NOT do**:
  - Do NOT change `handleContinueGrading()`
  - Do NOT call `applyZeroToNoResponseStudents()` anywhere else
  - Do NOT change the `forceRegrade` prop or any existing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2 and 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task F1
  - **Blocked By**: Task 1

  **References**:
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:394-464` — `handleExtract()` function; insertion point is after line 415
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte` — find where props/let declarations are for `forceRegrade` to add `zeroNoResponse` alongside
  - `ogre-desktop/src/lib/batch-grader.ts:1542-1547` — `applyZeroToNoResponseStudents()` signature (no args, returns `Promise<void>`)

  **Acceptance Criteria**:
  - [ ] `applyZeroToNoResponseStudents()` called exactly once in the file, inside `handleExtract()`
  - [ ] Call is guarded by `if (zeroNoResponse)`

  ```
  Scenario: Call-site exists and is guarded
    Tool: Bash (grep)
    Steps:
      1. Select-String -Path "ogre-desktop/src/components/grading/batch/BatchProgress.svelte" -Pattern "applyZeroToNoResponseStudents"
      2. Assert: returns 1 match
    Evidence: .sisyphus/evidence/task-4-callsite.txt
  ```

  **Commit**: Groups with Tasks 2 and 3
  - Message: `fix: add Give-0-for-No-Response toggle and wire applyZeroToNoResponseStudents`
  - Files: `BatchInstructions.svelte`, `BatchPanel.svelte`, `BatchProgress.svelte`
  - Pre-commit: `npm test -- --run` in `ogre-desktop/`

---

## Final Verification Wave

- [x] F1. **Full Verification** — `quick`

  Run these checks in order:
  1. `npm test -- --run` in `ogre-desktop/` — assert ≥1301 passing, 0 failures
  2. `Select-String -Path "ogre-desktop/src/components/grading/batch/BatchProgress.svelte" -Pattern "applyZeroToNoResponseStudents"` — assert 1 match
  3. `Select-String -Path "ogre-desktop/src/components/grading/batch/BatchInstructions.svelte" -Pattern "Give 0 for No Response"` — assert 1 match
  4. `Select-String -Path "ogre-desktop/src/lib/batch-grader.test.ts" -Pattern "Filter Logic"` — assert 1 match
  5. Git log: verify exactly 2 new commits since the pre-fix HEAD

  Output: `Tests [PASS/FAIL] | Call-site [FOUND/MISSING] | Toggle UI [FOUND/MISSING] | Tests exist [FOUND/MISSING] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Commit 1** (Task 1 only): `test: add filter-logic tests for empty response, score-0 regrade, and forceRegrade`
  - File: `ogre-desktop/src/lib/batch-grader.test.ts`
  - Pre-commit: `npm test -- --run` in `ogre-desktop/`

- **Commit 2** (Tasks 2, 3, 4): `fix: add Give-0-for-No-Response toggle and wire applyZeroToNoResponseStudents`
  - Files: `ogre-desktop/src/components/grading/batch/BatchInstructions.svelte`, `ogre-desktop/src/components/grading/batch/BatchPanel.svelte`, `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`
  - Pre-commit: `npm test -- --run` in `ogre-desktop/`

---

## Success Criteria

### Verification Commands (run in `ogre-desktop/`)
```bash
npm test -- --run   # Expected: ≥1301 passed, 0 failed
```

```powershell
Select-String -Path "src/components/grading/batch/BatchProgress.svelte" -Pattern "applyZeroToNoResponseStudents"
# Expected: 1 match
Select-String -Path "src/components/grading/batch/BatchInstructions.svelte" -Pattern "Give 0 for No Response"
# Expected: 1 match
```

### Final Checklist
- [ ] All "Must Have" present (toggle defaults to true, disabled while running, zeros only when ON)
- [ ] All "Must NOT Have" absent (filter logic untouched, no text in feedback field)
- [ ] All 3 new filter-logic tests pass
- [ ] Full test suite passes (≥1301, 0 failures)
- [ ] Exactly 2 new commits
