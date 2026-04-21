# Rubric Allocation Rows — Read-Only Rendering

## TL;DR

> **Quick Summary**: Point allocation rows (Full/Partial/Missing scoring tiers) scraped from MyOpenMath rubrics currently show up in both rubric editors with editable point inputs and delete buttons. This plan adds a `rowType` field to distinguish them from checklist rows, and conditionally hides editing controls for allocation rows in both the import staging UI and the library editor.
>
> **Deliverables**:
> - `RubricCriterion.rowType?: 'checklist' | 'allocation'` field added to interface
> - `format.ts` tags rows by source array on merge
> - `textToCriteria()` re-detects allocation rows after text round-trip
> - `RubricImport.svelte` renders allocation rows as read-only (no points input, no delete button)
> - `Rubrics.svelte` renders allocation rows as read-only (no points input, no delete button)
> - Tests updated in `rubric-utils.test.ts`
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (interface + utils) → Task 2 (format.ts) → Tasks 3+4 (UI components, parallel)

---

## Context

### Original Request
"Here is what is scraped for the rubric: `CLT Statement \t ☐ States sampling distribution…` (checklist items) and `CLT Statement (2 pts) \n Full (2): Clearly states…` (point allocation tiers). The first part is correct, with the category and the checklist point. But the other separate point allocations don't need to be adjusted by the user."

### Interview Summary
**Key Discussions**:
- Checklist rows (☐ items) = user-graded items → KEEP editable
- Point allocation rows (Full/Partial/Missing) = reference tiers → make READ-ONLY
- Scraper is working correctly — no changes to scraping logic
- Grading server uses both arrays for AI prompts — no changes there

**Research Findings**:
- `format.ts:formatRubricForDisplay()` merges `checklistItems` + `rubricItems` into one flat list with no type distinction — this is the merge point
- Round-trip problem: `criteriaToText()` + `textToCriteria()` don't preserve `rowType` — solved by re-detecting allocation rows in `textToCriteria()` via pattern match
- Detection pattern: criteria name matches `/^(Full|Partial|Minimal|Missing)\s*\(\d/i` — unambiguous given rubric scoring vocabulary

### Self-Identified Gaps (addressed in plan)
- **Round-trip**: `rowType` not serialized to text. Fixed by adding detection in `textToCriteria()`.
- **Existing saved rubrics**: Rubrics already in the library DB have no `rowType`. Fixed by the same detection logic — they'll be re-tagged at parse time.
- **Edge case**: What if a teacher legitimately names a criterion "Full Credit" or "Partial Score"? Detection regex is conservative: requires the word PLUS a `(N` point value immediately following, matching only the scraper's exact output format. This is a known acceptable tradeoff.
- **`criteriaToText()` serialization**: Allocation rows currently serialize as `"Full (2pts)"` — they round-trip fine for display. We're not changing the text format; just tagging them on parse.

---

## Work Objectives

### Core Objective
Prevent users from accidentally editing or deleting point allocation rows (Full/Partial/Missing scoring tiers) in both the import staging view and the library editor.

### Concrete Deliverables
- `ogre-desktop/src/lib/rubric-api.ts` — `RubricCriterion` gets `rowType?: 'checklist' | 'allocation'`
- `ogre-desktop/src/lib/rubric-utils.ts` — `textToCriteria()` tags allocation rows on parse
- `ogre-desktop/src/components/grading/batch/format.ts` — `rubricItemsToCriteria()` tags rows by source
- `ogre-desktop/src/components/grading/RubricImport.svelte` — allocation rows render as read-only label
- `ogre-desktop/src/pages/Rubrics.svelte` — allocation rows render as read-only row
- `ogre-desktop/src/lib/rubric-utils.test.ts` — tests covering detection of allocation rows

### Definition of Done
- [ ] A scraped rubric with Full/Partial/Missing rows shows them in `RubricImport.svelte` staging area without editable points input or delete button
- [ ] Same rubric saved to library and reopened in `Rubrics.svelte` shows the same read-only rendering for those rows
- [ ] Checklist (☐) rows in both views still have editable inputs and delete buttons
- [ ] No TypeScript errors (`npx tsc --noEmit` passes)
- [ ] `vitest` suite passes (no regressions)

### Must Have
- `rowType` field is optional (backward compatible — undefined = editable, per current behavior)
- Allocation rows clearly visually distinct from checklist rows (even if subtle)
- Both `RubricImport.svelte` AND `Rubrics.svelte` updated

### Must NOT Have (Guardrails)
- DO NOT change grading server logic or how `checklistItems`/`rubricItems` are used in AI prompts
- DO NOT change the scraper in `batch-grader.ts`
- DO NOT modify how saved rubric data is stored or the DB schema
- DO NOT hide allocation rows entirely — they should still be visible as reference information
- DO NOT add editing controls that only appear on hover for allocation rows (keep the UX simple)
- DO NOT over-engineer: no new components, no new files beyond what's listed

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (update existing `rubric-utils.test.ts`)
- **Framework**: vitest

### QA Policy
Each task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — must complete first):
└── Task 1: Interface + Utils (rubric-api.ts + rubric-utils.ts + tests) [quick]

Wave 2 (After Wave 1 — three parallel UI/logic changes):
├── Task 2: format.ts tagging [quick]
├── Task 3: RubricImport.svelte read-only rendering [quick]
└── Task 4: Rubrics.svelte read-only rendering [quick]

Critical Path: Task 1 → Tasks 2+3+4
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix
- **Task 1**: No deps — can start immediately. Blocks Tasks 2, 3, 4.
- **Task 2**: Depends on Task 1 (needs `rowType` field). Blocks nothing.
- **Task 3**: Depends on Task 1 (needs `rowType` field). Blocks nothing.
- **Task 4**: Depends on Task 1 (needs `rowType` field). Blocks nothing.

### Agent Dispatch Summary
- **Wave 1**: 1 task — Task 1 → `quick`
- **Wave 2**: 3 tasks — Tasks 2, 3, 4 → `quick` each (parallel)

---

## TODOs

- [x] 1. Add `rowType` to `RubricCriterion` and re-detect allocation rows in `textToCriteria()`

  **What to do**:
  - In `ogre-desktop/src/lib/rubric-api.ts`, add `rowType?: 'checklist' | 'allocation'` to the `RubricCriterion` interface (after `criterionWeight?`).
  - In `ogre-desktop/src/lib/rubric-utils.ts`, after `textToCriteria()` produces each criterion via `LINE_RE`, check if the criterion name matches the allocation pattern: `/^(Full|Partial|Minimal|Missing)\s*\(\d/i`. If yes, set `criterion.rowType = 'allocation'`. Otherwise leave `rowType` undefined (meaning editable/checklist by default).
  - Apply this detection in ALL three parse paths (`parseCheckboxFormat`, `parseIndentedCategoryFormat`, standard `LINE_RE`) — add a helper `isAllocationCriterion(name: string): boolean` that runs the regex, and call it after every `results.push(criterion)` to conditionally set `rowType`.
  - In `ogre-desktop/src/lib/rubric-utils.test.ts`, add tests:
    - `textToCriteria('Full (2pts)')` → returns criterion with `rowType: 'allocation'`
    - `textToCriteria('Partial (1pts): Partial description')` → `rowType: 'allocation'`
    - `textToCriteria('Missing (0pts)')` → `rowType: 'allocation'`
    - `textToCriteria('Minimal (1pts)')` → `rowType: 'allocation'`
    - `textToCriteria('States the CLT (0pts)')` → `rowType` is `undefined`
    - `textToCriteria('Full Credit (2pts)')` → `rowType` is `undefined` (name has extra words after "Full")
    - Checkbox format with "Full (2):" in a rubric item text → `rowType: 'allocation'`

  **Must NOT do**:
  - Do NOT change `criteriaToText()` — the text format stays the same
  - Do NOT add `rowType` to the serialized text output
  - Do NOT modify any other files in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small interface/utility changes in well-understood files, with targeted test additions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential, must complete first)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-19` — `RubricCriterion` interface, add field here
  - `ogre-desktop/src/lib/rubric-utils.ts:167-212` — `parseCheckboxFormat()` — add rowType detection after each `results.push(criterion)`
  - `ogre-desktop/src/lib/rubric-utils.ts:118-154` — `parseIndentedCategoryFormat()` — same
  - `ogre-desktop/src/lib/rubric-utils.ts:240-274` — standard `LINE_RE` parse path — same

  **Test References**:
  - `ogre-desktop/src/lib/rubric-utils.test.ts` — existing test file, add new `describe` block for allocation detection

  **Acceptance Criteria**:
  - [ ] `rubric-api.ts` has `rowType?: 'checklist' | 'allocation'` in `RubricCriterion`
  - [ ] `rubric-utils.ts` has `isAllocationCriterion()` helper with regex `/^(Full|Partial|Minimal|Missing)\s*\(\d/i`
  - [ ] All three parse paths in `textToCriteria` call the helper
  - [ ] New tests pass: `npx vitest run rubric-utils` → 0 failures

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Allocation row detection via standard parse
    Tool: Bash (bun/node REPL or vitest)
    Preconditions: rubric-utils.ts updated
    Steps:
      1. Run: npx vitest run src/lib/rubric-utils.test.ts
      2. Confirm new tests in "allocation row detection" describe block all pass
      3. Confirm total test count increases by at least 6 new tests
    Expected Result: All tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-1-vitest-output.txt

  Scenario: Non-allocation row not falsely tagged
    Tool: Bash (inline node eval)
    Preconditions: rubric-utils.ts updated
    Steps:
      1. node -e "const {textToCriteria} = require('./src/lib/rubric-utils'); console.log(JSON.stringify(textToCriteria('States the CLT (0pts)')[0]))"
      2. Verify output does NOT contain "rowType"
    Expected Result: Object has no rowType field
    Evidence: .sisyphus/evidence/task-1-no-false-positive.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-1-vitest-output.txt` — vitest run showing new tests passing
  - [ ] `task-1-no-false-positive.txt` — confirmation non-allocation row has no `rowType`

  **Commit**: YES (groups with Task 2)
  - Message: `feat(rubric): add rowType field to RubricCriterion, re-detect allocation rows in textToCriteria`
  - Files: `rubric-api.ts`, `rubric-utils.ts`, `rubric-utils.test.ts`
  - Pre-commit: `npx vitest run`

- [x] 2. Tag rows by source in `format.ts`

  **What to do**:
  - In `ogre-desktop/src/components/grading/batch/format.ts`, update `rubricItemsToCriteria()` to accept a second parameter `rowType: RubricCriterion['rowType']` and set it on every criterion it creates.
  - In `formatRubricForDisplay()`, call it as:
    - `rubricItemsToCriteria(rubric.checklistItems, 'checklist')`
    - `rubricItemsToCriteria(rubric.rubricItems, 'allocation')`
  - Import `RubricCriterion` type from `rubric-api` (already imported).

  **Must NOT do**:
  - Do NOT change any other logic in `format.ts`
  - Do NOT touch `normalizeAnchorTextToVirtual10()` or any other function in the file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tiny, surgical change — add one parameter and two call-site updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3 and 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Nothing
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/batch/format.ts:13-24` — `rubricItemsToCriteria()` function — add parameter here
  - `ogre-desktop/src/components/grading/batch/format.ts:44-47` — call sites to update

  **Acceptance Criteria**:
  - [ ] `rubricItemsToCriteria` signature is `(items: RubricItem[], rowType?: RubricCriterion['rowType']): RubricCriterion[]`
  - [ ] Checklist items get `rowType: 'checklist'`, rubric items get `rowType: 'allocation'`
  - [ ] `npx tsc --noEmit` passes (no type errors)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tagging propagates through formatRubricForDisplay
    Tool: Bash (tsc check)
    Preconditions: format.ts updated, Task 1 complete
    Steps:
      1. Run: cd ogre-desktop && npx tsc --noEmit
      2. Verify zero new errors in format.ts or its callers
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-2-tsc-output.txt

  Scenario: Allocation rows get correct rowType
    Tool: Bash (grep/read)
    Preconditions: format.ts updated
    Steps:
      1. Read format.ts lines 13-47
      2. Verify the two rubricItemsToCriteria calls pass 'checklist' and 'allocation' respectively
      3. Verify the function body assigns rowType to each criterion
    Expected Result: Code inspection confirms correct tagging
    Evidence: .sisyphus/evidence/task-2-code-review.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-2-tsc-output.txt` — TypeScript compilation clean
  - [ ] `task-2-code-review.txt` — brief note confirming tagging logic correct

  **Commit**: YES (groups with Task 1)
  - Message: (same commit as Task 1)
  - Files: `format.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 3. Make allocation rows read-only in `RubricImport.svelte`

  **What to do**:
  - In `ogre-desktop/src/components/grading/RubricImport.svelte`, find the criterion row rendering loop (lines 189-220).
  - For each `criterion` row, check `criterion.rowType === 'allocation'`.
  - If it IS an allocation row:
    - Replace the points `<input type="number">` (lines 205-211) with a read-only `<span class="crit-points-readonly">{criterion.points}</span>`
    - Hide the delete `<button class="remove-btn">` (lines 212-218) — use `{#if criterion.rowType !== 'allocation'}...{/if}`
    - Optionally add a subtle visual indicator (a CSS class `allocation-row` on the `.criterion-row` div, with slightly muted text color) to help teachers distinguish them
  - Add CSS for `.crit-points-readonly` (match the width/layout of the input it replaces) and `.allocation-row` (e.g., `opacity: 0.75` or `color: var(--text-muted)`) in the `<style>` block.

  **Must NOT do**:
  - Do NOT hide allocation rows entirely
  - Do NOT disable the name/description inputs — teachers should be able to edit the description if needed; only points and delete are locked
  - Do NOT add new state variables or reactive declarations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Conditional rendering change in a single Svelte component loop
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2 and 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Nothing
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/RubricImport.svelte:189-220` — criterion row loop, modify here
  - `ogre-desktop/src/components/grading/RubricImport.svelte:243+` — `<style>` block, add new CSS here

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:RubricCriterion` — `rowType` field added in Task 1

  **Acceptance Criteria**:
  - [ ] Allocation rows in staging view have no points `<input>` — replaced with `<span>`
  - [ ] Allocation rows have no delete button
  - [ ] Checklist rows still have full editable inputs and delete button
  - [ ] Visual distinction present (CSS class on allocation rows)
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Points input absent for allocation rows
    Tool: Bash (grep on file)
    Preconditions: RubricImport.svelte updated
    Steps:
      1. Read RubricImport.svelte lines 189-230
      2. Verify the {#if criterion.rowType !== 'allocation'} guard exists around the points input
      3. Verify the remove-btn is inside an {#if} guard
    Expected Result: Both guards present in source
    Evidence: .sisyphus/evidence/task-3-code-review.txt

  Scenario: Checklist rows still fully editable
    Tool: Bash (code inspection)
    Preconditions: RubricImport.svelte updated
    Steps:
      1. Verify the name input (crit-name) and description input (crit-desc) are NOT inside any rowType guard
      2. Confirm only points input and remove-btn are conditionally hidden
    Expected Result: Only points + delete are gated
    Evidence: .sisyphus/evidence/task-3-checklist-editable.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-3-code-review.txt` — confirms guards present for points input and delete button
  - [ ] `task-3-checklist-editable.txt` — confirms name/desc inputs unguarded

  **Commit**: YES (separate commit, groups with Task 4)
  - Message: `feat(rubric-ui): render allocation rows as read-only in import staging and library editor`
  - Files: `RubricImport.svelte`, `Rubrics.svelte`
  - Pre-commit: `npx tsc --noEmit`

- [x] 4. Make allocation rows read-only in `Rubrics.svelte`

  **What to do**:
  - In `ogre-desktop/src/pages/Rubrics.svelte`, find the criteria table body loop (lines 312-329).
  - For each `row`, check `row.rowType === 'allocation'`.
  - If it IS an allocation row:
    - Replace the points `<input type="number" bind:value={row.points}...>` (line 322) with a read-only `<span style="display:inline-block;width:60px;text-align:center">{row.points}</span>`
    - Hide the delete `<button class="btn-icon-danger">` (lines 323-327) — use `{#if row.rowType !== 'allocation'}...{/if}`
    - Add a CSS class `allocation-row` to the `<tr>` for allocation rows (using `class:allocation-row={row.rowType === 'allocation'}`) with muted styling in the component's `<style>` block.
  - Note: `Rubrics.svelte` uses `formCriteria` which comes from the library save/load cycle. These rows will have `rowType` set via `textToCriteria()` detection (from Task 1).

  **Must NOT do**:
  - Do NOT hide allocation rows in the table
  - Do NOT make category, criteria name, or description inputs read-only
  - Do NOT change the weight mode inputs or any other table columns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Same pattern as Task 3, different component
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2 and 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Nothing
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Rubrics.svelte:312-329` — criteria table row loop, modify here
  - `ogre-desktop/src/pages/Rubrics.svelte` — `<style>` block (search end of file), add `.allocation-row` CSS

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:RubricCriterion` — `rowType` field from Task 1

  **Acceptance Criteria**:
  - [ ] Allocation rows in library editor have no editable points input — replaced with static span
  - [ ] Allocation rows have no delete button
  - [ ] Checklist rows still have full editable inputs and delete button
  - [ ] `class:allocation-row` directive present on `<tr>` for allocation rows
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Points read-only for allocation rows in library editor
    Tool: Bash (code inspection)
    Preconditions: Rubrics.svelte updated
    Steps:
      1. Read Rubrics.svelte lines 311-332
      2. Verify {#if row.rowType !== 'allocation'} guard wraps points input on line 322
      3. Verify {#if row.rowType !== 'allocation'} guard wraps btn-icon-danger button
    Expected Result: Both guards present
    Evidence: .sisyphus/evidence/task-4-code-review.txt

  Scenario: Weight mode columns unaffected
    Tool: Bash (code inspection)
    Preconditions: Rubrics.svelte updated
    Steps:
      1. Verify the weight mode inputs (categoryWeight, criterionWeight on lines 318-320) are NOT inside any new rowType guard
    Expected Result: Weight inputs unaffected
    Evidence: .sisyphus/evidence/task-4-weight-unaffected.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-4-code-review.txt` — confirms guards on points + delete for allocation rows
  - [ ] `task-4-weight-unaffected.txt` — confirms weight columns not touched

  **Commit**: YES (groups with Task 3)
  - Message: (same commit as Task 3)
  - Files: `Rubrics.svelte`
  - Pre-commit: `npx tsc --noEmit`

---

## Final Verification Wave

> 4 review agents run in PARALLEL after all implementation tasks. ALL must APPROVE.
> Present results and wait for explicit user okay before marking complete.
>
> Do NOT auto-proceed. Rejection or user feedback → fix → re-run → present again → wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. For each "Must Have": verify implementation exists (read file). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
  Output: `Must Have [13/13] | Must NOT Have [6/6] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` in `ogre-desktop/`. Run `vitest run` (or the project's test command). Review all changed files for: `as any`/`@ts-ignore`, empty catches, unused imports, AI slop patterns.
  Output: `Build [PASS] | Tests [1371 pass/0 fail] | Files [6 clean/0 issues] | VERDICT: APPROVE`

- [x] F3. **Real QA** — `unspecified-high` (+ Playwright if browser available)
  Simulate the full import flow by reading `RubricImport.svelte` and tracing data flow from scraped checklist+rubric items → `formatRubricForDisplay()` → `textToCriteria()` → rendered criteria rows. Verify the render condition logic for allocation rows is triggered correctly. Check `Rubrics.svelte` for the same. Save analysis to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [5/5 pass] | Integration [13/13] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond spec built. Check "Must NOT do" compliance. Flag any unaccounted changes.
  Output: `Tasks [4/4 compliant] | Unaccounted [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

- **Tasks 1+2**: `feat(rubric): add rowType field to RubricCriterion and tag allocation rows` — `rubric-api.ts`, `rubric-utils.ts`, `format.ts`, `rubric-utils.test.ts`
- **Tasks 3+4**: `feat(rubric-ui): render allocation rows as read-only in import and library editor` — `RubricImport.svelte`, `Rubrics.svelte`

---

## Success Criteria

### Verification Commands
```bash
# In ogre-desktop/
npx tsc --noEmit          # Expected: no errors
npx vitest run            # Expected: all tests pass (0 failures)
```

### Final Checklist
- [ ] `rowType` field present in `RubricCriterion`
- [ ] `format.ts` tags checklist items as `'checklist'` and rubric items as `'allocation'`
- [ ] `textToCriteria()` re-detects allocation rows after round-trip
- [ ] `RubricImport.svelte` hides points input + delete button for `rowType === 'allocation'`
- [ ] `Rubrics.svelte` hides points input + delete button for `rowType === 'allocation'`
- [ ] All existing tests pass, new tests added for allocation detection
