# Rubric Table with Editable Cells and Weighting Modes

## TL;DR

> **Quick Summary**: Replace the plain rubric textarea in RubricCard and extend the Rubrics library editor with a fully editable table that supports two mutually exclusive weighting modes — category-level (categories sum to 100%) and criterion-level (criteria within each category sum to 100%). Effective weighted point totals are pre-computed server-side and injected into the grading prompt, so the AI model never generates its own weights.
>
> **Deliverables**:
> - Extended `RubricCriterion` and `SavedRubric` types with `category?`, `categoryWeight?`, `criterionWeight?`, `weightMode?`
> - Extended `rubric-utils.ts` serialization with backward-compatible weight parsing
> - Pure `validateWeights()` utility with full test coverage
> - Updated `Rubrics.svelte` library editor with weight column + mode toggle
> - New table view in `RubricCard.svelte` (replaces textarea for structured editing)
> - Extended `buildBatchPrompt()` in `grading.js` to pre-compute effective points when weights are active
> - Wire weight data through `BatchProgress.svelte` → `startBatchGrading()` → grading server
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (types) → Task 2 (serialization) → Task 3 (validation) → Task 5 (RubricCard UI) → Task 7 (prompt injection) → Task 8 (integration)

---

## Context

### Original Request
Add an editable rubric table with togglable category/criterion-level weighting to the O.G.R.E grading app. Weights should be passed to the grading model, stopping it from generating its own weights.

### Interview Summary
**Key Discussions**:
- **Table locations**: Both RubricCard (grading view) and Rubrics library page editor
- **All columns editable**: criteria name, description, points, and weight columns
- **Two mutually exclusive weight modes**: category-level (sum to 100% across categories) and criterion-level (sum to 100% within each category)
- **Hard lock**: Cannot grade until active weights sum to 100%. Saving is always allowed.
- **Weight format**: Percentage of total (for category mode) or percentage of category (for criterion mode). Effective points = raw_points × weight; pre-computed before model sees them.
- **Category bridging**: Add `category?: string` to `RubricCriterion` so library rubrics can also do category-level weighting
- **Leniency**: Leaves weights completely untouched
- **RubricImport.svelte**: OUT OF SCOPE for v1
- **Backward compatibility**: Old rubrics without weights must parse correctly

### Research Findings
- **Two disconnected rubric models**: `SavedRubric.criteria[]` (flat, `rubric-api.ts`) vs `Rubric.checklistItems[]` (nested, `batch-grader.ts`). These use different shapes and flow through different paths.
- **Existing table pattern**: `Rubrics.svelte` already has a criteria table with add/remove row, reactive `formCriteria` copy. Extend this exact pattern.
- **Text serialization**: `rubric-utils.ts` uses `Name (10pts): Description`. Must extend to `Name (10pts, 25%): Description`. Old format must still parse.
- **Prompt injection point**: `grading.js:buildBatchPrompt():128-148` — category point totals and criterion scoring template. Pre-compute effective points here.
- **Tests exist**: `rubric-utils.test.ts` (252 lines), `grading.test.js` (396 lines), `grading-api.test.ts` (907 lines). All must be extended.

### Metis Review
**Identified Gaps** (addressed):
- Two-model impedance mismatch: Resolved by adding `category?` to `RubricCriterion` and a conversion layer, not touching `Rubric` batch-grader interface
- Backward compatibility risk: Addressed via optional weight in text format and tolerant parser
- AI weight confusion: Mitigated by pre-computing effective points server-side; AI never sees weight percentages
- 100% sum UX friction: Block Grade button only, allow saving with incomplete weights
- RubricImport.svelte scope: Explicitly excluded from v1
- Leniency interaction: Explicitly clarified — weights untouched by leniency

---

## Work Objectives

### Core Objective
Add structured editable rubric tables and a weighting system that lets teachers control how much each category or criterion contributes to the final grade — and pass those adjusted point values cleanly to the grading model.

### Concrete Deliverables
- `ogre-desktop/src/lib/rubric-api.ts` — extended type interfaces
- `ogre-desktop/src/lib/rubric-utils.ts` — weight serialization + validation
- `ogre-desktop/src/lib/rubric-utils.test.ts` — extended tests
- `ogre-desktop/src/pages/Rubrics.svelte` — weight column + mode toggle in library editor
- `ogre-desktop/src/components/grading/RubricCard.svelte` — table view with weight columns
- `grading-server/grading.js` — `buildBatchPrompt()` effective-points injection
- `grading-server/grading.test.js` — regression + weighted-prompt tests
- `grading-server/rubric-store.js` — accept `weightMode` in `updateRubric()`
- `ogre-desktop/src/lib/grading-api.ts` — weight fields on request interface

### Definition of Done
- [ ] `bun test` in `grading-server/` — all tests pass including new weighted-prompt tests
- [ ] `npm test` in `ogre-desktop/` — all tests pass including weight serialization and validation tests
- [ ] Saving a rubric with `weightMode: 'category'` persists and reloads weights correctly
- [ ] Grade button is disabled when weights don't sum to 100%; enabled when they do
- [ ] A graded prompt with weights active contains pre-computed effective points, not raw points
- [ ] A graded prompt with `weightMode: 'off'` is byte-identical to pre-change output

### Must Have
- `category?` field on `RubricCriterion` for grouping in library rubrics
- `weightMode?: 'off' | 'category' | 'criterion'` on `SavedRubric` and request types
- `categoryWeight?: number` and `criterionWeight?: number` on `RubricCriterion`
- Hard validation: category weights must sum to 100% (±0.5% tolerance) before grading
- Hard validation: criterion weights within each category must sum to 100% (±0.5% tolerance) before grading
- All rubric table columns editable: name, description, points, weight
- Weight mode toggle in both Rubrics.svelte and RubricCard.svelte
- Live sum indicator per mode (e.g., "Category weights: 85% / 100%")
- Effective points pre-computed in `buildBatchPrompt()` when weights active
- `weightMode: 'off'` path produces byte-identical prompt output (regression guard)

### Must NOT Have (Guardrails)
- NO shared `<EditableRubricTable>` component — extend each view independently
- NO auto-redistribute, auto-normalize, or preset weight buttons
- NO changes to `RubricImport.svelte`
- NO changes to `Rubric` interface in `batch-grader.ts` — add conversion layer instead
- NO weight percentages visible to the AI model in prompts — only pre-computed effective points
- NO modification of leniency behavior — leniency leaves weights untouched
- NO changes to code paths where `weightMode` is `'off'` or absent — backward compatibility absolute

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest in ogre-desktop, bun test in grading-server)
- **Automated tests**: TDD — tests first, then implementation
- **Framework**: vitest (frontend), bun test (backend)
- **TDD cycle**: Each task follows RED → GREEN → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.
- **Backend logic**: Bash (bun test / node assertions)
- **Frontend logic**: Bash (npm test)
- **UI behavior**: Playwright — navigate, fill inputs, assert DOM state, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Type definitions (rubric-api.ts + grading-api.ts) [quick]
└── Task 2: Text serialization + tests (rubric-utils.ts) [unspecified-high]

Wave 2 (After Wave 1 — logic + UI, MAX PARALLEL):
├── Task 3: Weight validation utility + tests [unspecified-high]
├── Task 4: Rubrics.svelte library editor table [visual-engineering]
└── Task 5: RubricCard.svelte table view [visual-engineering]

Wave 3 (After Wave 2 — server + wiring):
├── Task 6: Backend storage update (rubric-store.js) [quick]
├── Task 7: Prompt injection (grading.js) + tests [unspecified-high]
└── Task 8: Integration wiring (BatchProgress + grading-api.ts) [unspecified-high]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — Playwright (unspecified-high + playwright skill)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → Task 5 → Task 7 → Task 8 → FINAL
Parallel Speedup: ~65% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | None | 2, 3, 4, 5, 6, 7, 8 |
| 2 | 1 | 3, 4, 5, 8 |
| 3 | 1, 2 | 4, 5, 8 |
| 4 | 1, 2, 3 | 8 |
| 5 | 1, 2, 3 | 8 |
| 6 | 1 | 8 |
| 7 | 1, 2, 3 | 8 |
| 8 | 3, 4, 5, 6, 7 | FINAL |

### Agent Dispatch Summary
- **Wave 1**: T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: T3 → `unspecified-high`, T4 → `visual-engineering`, T5 → `visual-engineering`
- **Wave 3**: T6 → `quick`, T7 → `unspecified-high`, T8 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Extend type definitions in `rubric-api.ts` and `grading-api.ts`

  **What to do**:
  - In `ogre-desktop/src/lib/rubric-api.ts`, extend `RubricCriterion` interface to add:
    - `category?: string` — grouping label (e.g. "Mathematical Reasoning")
    - `categoryWeight?: number` — weight % for this criterion's category (0–100)
    - `criterionWeight?: number` — weight % for this criterion within its category (0–100)
  - In `ogre-desktop/src/lib/rubric-api.ts`, extend `SavedRubric` interface to add:
    - `weightMode?: 'off' | 'category' | 'criterion'` — which weighting mode is active
  - In `ogre-desktop/src/lib/grading-api.ts`, find the `GradeRubric` or equivalent request interface and add the same four fields so weight data can be sent from frontend to server
  - Write a TypeScript test (in a new `rubric-api.test.ts` or extend nearest test file) that:
    - Constructs a `RubricCriterion` with all new fields and verifies no type errors
    - Constructs a `SavedRubric` WITHOUT new fields and verifies it still satisfies the interface (backward compat)
    - Constructs a grading request with weight fields and verifies no type errors

  **Must NOT do**:
  - Do NOT change or add any fields to `RubricItem` or `Rubric` in `batch-grader.ts`
  - Do NOT make `category`, `categoryWeight`, `criterionWeight`, or `weightMode` required fields
  - Do NOT add any logic here — types only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type additions to two files, no logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Task is too small; manual TDD approach specified inline

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-16` — `RubricCriterion` interface to extend
  - `ogre-desktop/src/lib/rubric-api.ts:18-27` — `SavedRubric` interface to extend
  - `ogre-desktop/src/lib/grading-api.ts` — find `GradeRubric` or batch request interface to extend

  **API/Type References**:
  - `ogre-desktop/src/lib/batch-grader.ts:37-57` — the `RubricItem` and `Rubric` interfaces that MUST NOT be changed

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` in `ogre-desktop/` passes with no new errors
  - [ ] `RubricCriterion` has `category?`, `categoryWeight?`, `criterionWeight?`
  - [ ] `SavedRubric` has `weightMode?`
  - [ ] Grading request interface has weight fields
  - [ ] A `RubricCriterion` without new fields still satisfies the interface (backward compat)

  **QA Scenarios**:
  ```
  Scenario: New fields are optional (backward compatibility)
    Tool: Bash (npx tsc --noEmit)
    Preconditions: Type changes applied
    Steps:
      1. Run: cd ogre-desktop && npx tsc --noEmit
      2. Assert: exit code 0, no new type errors introduced by this task
    Expected Result: TypeScript compilation succeeds
    Evidence: .sisyphus/evidence/task-1-tsc-pass.txt

  Scenario: Weight fields accepted in type
    Tool: Bash (npm test)
    Preconditions: Type changes applied, test file created
    Steps:
      1. Run: cd ogre-desktop && npm test -- --reporter=verbose rubric-api
      2. Assert: new type tests pass
    Expected Result: All type tests pass
    Evidence: .sisyphus/evidence/task-1-type-tests.txt
  ```

  **Commit**: YES (group 1)
  - Message: `feat(types): add category, weightMode, categoryWeight, criterionWeight to rubric types`
  - Files: `ogre-desktop/src/lib/rubric-api.ts`, `ogre-desktop/src/lib/grading-api.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

- [x] 2. Extend text serialization in `rubric-utils.ts` with backward-compatible weight parsing

  **What to do**:
  - In `ogre-desktop/src/lib/rubric-utils.ts`, extend `criteriaToText()`:
    - When `criterionWeight` is set, output: `Name (10pts, 25%): Description`
    - When `category` is set, output a category header line before grouped criteria
    - When no weight fields, output current format unchanged: `Name (10pts): Description`
  - In `ogre-desktop/src/lib/rubric-utils.ts`, extend `textToCriteria()` / `LINE_RE` regex:
    - New format: `Name (10pts, 25%): Description` — parses `criterionWeight: 25`
    - Old format: `Name (10pts): Description` — parses with `criterionWeight: undefined`
    - Both formats must produce valid `RubricCriterion` objects
  - In `ogre-desktop/src/lib/rubric-utils.test.ts`, add test cases:
    - Round-trip test: criteria with weights → text → criteria, weights preserved
    - Backward compat test: old-format text parses correctly with new code
    - Edge cases: 0% weight, 100% weight, missing description, decimal points

  **Must NOT do**:
  - Do NOT change the behavior of old-format parsing — it must produce identical output
  - Do NOT make the weight part mandatory in text format
  - Do NOT remove or rename any existing exported functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Regex extension + backward-compat logic requires careful TDD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 5, 8
  - **Blocked By**: Task 1 (needs new type fields)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-utils.ts:1-80` — full file; `LINE_RE` at line 49, `criteriaToText()`, `textToCriteria()` — extend these
  - `ogre-desktop/src/lib/rubric-utils.test.ts:1-252` — existing test patterns; follow the same vitest describe/it structure

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-16` — `RubricCriterion` with new fields from Task 1

  **Acceptance Criteria**:
  - [ ] `npm test -- --reporter=verbose rubric-utils` passes with all new tests
  - [ ] `criteriaToText(textToCriteria(text)) === text` round-trip holds for new format
  - [ ] Old-format text parses identically before/after change (backward compat test passes)
  - [ ] Criterion with weight serializes to `Name (Xpts, Y%): Desc` format

  **QA Scenarios**:
  ```
  Scenario: Round-trip with weights preserved
    Tool: Bash (npm test)
    Preconditions: Task 1 types applied, serialization code updated
    Steps:
      1. Run: cd ogre-desktop && npm test -- rubric-utils
      2. Assert: round-trip test passes — criterion with criterionWeight: 30 serializes to "Name (10pts, 30%): Desc" and parses back to criterionWeight: 30
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-2-roundtrip.txt

  Scenario: Old format parses correctly after change
    Tool: Bash (npm test)
    Preconditions: Serialization code updated
    Steps:
      1. Input: "Mathematical Reasoning (10pts): Shows correct setup"
      2. Assert: parses with criterionWeight: undefined, points: 10, criteria: "Mathematical Reasoning"
    Expected Result: PASS — no weight field on old-format criteria
    Evidence: .sisyphus/evidence/task-2-backward-compat.txt
  ```

  **Commit**: YES (group 2)
  - Message: `feat(rubric-utils): extend text serialization with backward-compatible weight parsing`
  - Files: `ogre-desktop/src/lib/rubric-utils.ts`, `ogre-desktop/src/lib/rubric-utils.test.ts`
  - Pre-commit: `cd ogre-desktop && npm test -- rubric-utils`

- [x] 3. Add `validateWeights()` pure utility function with full test suite

  **What to do**:
  - In `ogre-desktop/src/lib/rubric-utils.ts`, add a new exported function:
    ```typescript
    export function validateWeights(
      criteria: RubricCriterion[],
      mode: 'category' | 'criterion'
    ): { valid: boolean; sum?: number; errors: string[] }
    ```
  - For `mode: 'category'`:
    - Group criteria by `category`
    - Sum `categoryWeight` values across all unique categories
    - `valid = true` if sum is within 99.5–100.5 (tolerance for floating point)
    - `errors[]` describes what's wrong (e.g., `"Category weights sum to 85%, must be 100%"`)
  - For `mode: 'criterion'`:
    - Group criteria by `category`
    - For each category group, sum `criterionWeight` values
    - `valid = true` if ALL category groups sum to 99.5–100.5
    - `errors[]` lists which categories don't sum to 100%
  - In `ogre-desktop/src/lib/rubric-utils.test.ts`, add test cases:
    - Category mode: exactly 100% → valid
    - Category mode: 99% → invalid with descriptive error
    - Category mode: no weights set → invalid
    - Criterion mode: all categories sum to 100% → valid
    - Criterion mode: one category at 90% → invalid with that category named in error
    - Criterion mode: single item per category at 100% → valid
    - Edge: empty criteria array → valid (no weights needed)
    - Edge: 0.3 + 0.3 + 0.4 = 1.0 (floating point tolerance)

  **Must NOT do**:
  - Do NOT mutate the `criteria` array
  - Do NOT add auto-normalization or redistribution logic
  - This is a pure function — no side effects, no UI, no store access

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Pure logic with edge cases; TDD-first
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2, with Tasks 4 and 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 4, 5, 8
  - **Blocked By**: Tasks 1 and 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-utils.ts:1-80` — add alongside existing exports
  - `ogre-desktop/src/lib/rubric-utils.test.ts:1-252` — follow existing vitest structure

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-16` — `RubricCriterion` with weight fields from Task 1

  **Acceptance Criteria**:
  - [ ] `npm test -- rubric-utils` passes all new validateWeights tests
  - [ ] `validateWeights([], 'category')` returns `{ valid: true, errors: [] }`
  - [ ] `validateWeights(criteria, 'category')` where weights sum to 100% returns `valid: true`
  - [ ] `validateWeights(criteria, 'category')` where weights sum to 85% returns `valid: false` with error containing "85%"

  **QA Scenarios**:
  ```
  Scenario: Category mode sums to 100%
    Tool: Bash (npm test)
    Preconditions: validateWeights implemented
    Steps:
      1. Run test: criteria has 3 categories with weights 40, 35, 25
      2. Assert: validateWeights(criteria, 'category') returns { valid: true, errors: [] }
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-3-valid-100.txt

  Scenario: Criterion mode one category fails
    Tool: Bash (npm test)
    Preconditions: validateWeights implemented
    Steps:
      1. Run test: 2 categories, first sums to 100%, second sums to 90%
      2. Assert: valid: false, errors contains category name that failed
    Expected Result: PASS — errors array names the failing category
    Evidence: .sisyphus/evidence/task-3-criterion-fail.txt
  ```

  **Commit**: YES (group 3)
  - Message: `feat(rubric-utils): add validateWeights() pure utility with full test suite`
  - Files: `ogre-desktop/src/lib/rubric-utils.ts`, `ogre-desktop/src/lib/rubric-utils.test.ts`
  - Pre-commit: `cd ogre-desktop && npm test -- rubric-utils`

- [ ] 4. Extend `Rubrics.svelte` library editor with weight column and mode toggle

  **What to do**:
  - In `ogre-desktop/src/pages/Rubrics.svelte`, extend the existing criteria editing table:
    - Add a "Category" column (text input) to the existing table row
    - Add a "Weight %" column (number input, 0–100) to the existing table row
    - Above the table, add a **Weight Mode** toggle control:
      - Three options: Off | By Category | By Criterion (radio buttons or segmented button)
      - Default: Off
    - When mode is **Off**: hide weight column, category column still visible (categories are useful for organization even without weighting)
    - When mode is **By Category**: show weight column, display a live sum badge: "Category weights: XX% / 100%". Add an error message if sum ≠ 100%: "Weights must sum to 100% before saving as active weights"
    - When mode is **By Criterion**: show weight column, display per-category sum badges. Error for any category not summing to 100%
    - Wire `weightMode` and new fields to the save/update form payload
    - When loading a saved rubric with `weightMode`, restore the toggle state and weight values
  - Use `validateWeights()` from Task 3 to drive the live sum display and error state
  - Follow existing `formCriteria` reactive copy pattern — do NOT directly mutate the store

  **Must NOT do**:
  - Do NOT touch `RubricImport.svelte`
  - Do NOT add preset weight buttons or auto-redistribute
  - Do NOT change how the table saves/loads other than adding the new columns

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Svelte UI extension with reactive state, form controls, live validation feedback
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2, with Tasks 3 and 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Rubrics.svelte:250-274` — existing criteria table with add/remove row pattern to follow exactly
  - `ogre-desktop/src/pages/Rubrics.svelte:151-153` — `totalPoints()` function — follow same reactive pattern for weight sum
  - `ogre-desktop/src/lib/rubric-utils.ts` — import `validateWeights()` from Task 3

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-27` — `RubricCriterion` and `SavedRubric` with new fields from Task 1

  **Acceptance Criteria**:
  - [ ] Weight mode toggle renders with 3 options; default is Off
  - [ ] Weight column hidden when mode is Off
  - [ ] Live sum shows "40% / 100%" when two of three category weights are set
  - [ ] Save is allowed regardless of weight sum (no hard lock on save, only on grade)
  - [ ] Loading a rubric with `weightMode: 'category'` and existing `categoryWeight` values restores the toggle and inputs
  - [ ] `npm test` passes (no new TypeScript errors)

  **QA Scenarios**:
  ```
  Scenario: Weight mode toggle shows/hides weight column
    Tool: Playwright
    Preconditions: Rubrics page loaded, a rubric is open for editing
    Steps:
      1. Navigate to /rubrics or Rubrics page in app
      2. Open a rubric for editing
      3. Assert: weight column NOT visible (mode = Off by default)
      4. Click "By Category" radio/button
      5. Assert: weight column IS visible (selector: th or td with "Weight" label)
      6. Screenshot: .sisyphus/evidence/task-4-weight-column-visible.png
    Expected Result: Column appears when mode toggled on
    Evidence: .sisyphus/evidence/task-4-weight-column-visible.png

  Scenario: Live sum displays correctly
    Tool: Playwright
    Preconditions: Rubrics page, rubric with 3 criteria in 2 categories
    Steps:
      1. Enable "By Category" mode
      2. Enter 40 in weight field for Category A
      3. Assert: sum indicator shows "40% / 100%" or similar
      4. Enter 60 in weight field for Category B
      5. Assert: sum indicator shows "100% / 100%" and no error message
      6. Screenshot: .sisyphus/evidence/task-4-sum-100.png
    Expected Result: Live sum updates on input change
    Evidence: .sisyphus/evidence/task-4-sum-100.png

  Scenario: Save still works with incomplete weights
    Tool: Playwright
    Preconditions: Category mode enabled, weights sum to 50%
    Steps:
      1. Click Save button
      2. Assert: save succeeds (no hard block, rubric saved)
      3. Assert: error message visible explaining weights don't sum to 100%
    Expected Result: Save succeeds; error shown but not blocking
    Evidence: .sisyphus/evidence/task-4-save-incomplete.png
  ```

  **Commit**: YES (group 4)
  - Message: `feat(rubrics-page): add weight column and mode toggle to library editor table`
  - Files: `ogre-desktop/src/pages/Rubrics.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

- [ ] 5. Add editable table view with weight columns to `RubricCard.svelte`

  **What to do**:
  - In `ogre-desktop/src/components/grading/RubricCard.svelte`, add a structured **table view** alongside or replacing the current textarea:
    - The table shows the current rubric criteria as editable rows
    - Columns: Category (text) | Criteria Name (text) | Description (text) | Points (number) | Weight % (number)
    - If a rubric has `category` set on criteria, group rows under category header rows
    - Add a **Weight Mode** toggle (same as Rubrics.svelte: Off | By Category | By Criterion)
    - When mode is not Off: show Weight % column, live sum badge, and error message if sum ≠ 100%
    - **Hard lock**: If weights are active and weights don't sum to 100%, the **Grade button is disabled** and shows "Weights must sum to 100% to grade"
    - Leniency slider must NOT be removed or altered — it continues to function independently
    - When a saved rubric is loaded from library into RubricCard, populate the table from `criteria[]`
    - Use `validateWeights()` from Task 3 to drive sum validation
    - Changes in the table must propagate to the grading payload (rubric state used in `startBatchGrading`)

  **Must NOT do**:
  - Do NOT remove the leniency slider or change its behavior
  - Do NOT create a shared component with Rubrics.svelte — implement independently in RubricCard
  - Do NOT disable the Save/Library functionality
  - Do NOT hard-lock Saving — only Grade action is locked

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex Svelte component modification with reactive table, validation, and Grade button gating
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2, with Tasks 3 and 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/RubricCard.svelte:1-822` — full component; understand existing state (leniency, library dropdown, textarea) before touching
  - `ogre-desktop/src/pages/Rubrics.svelte:250-274` — table editing pattern to replicate (same style)
  - `ogre-desktop/src/lib/rubric-utils.ts` — import `validateWeights()` from Task 3

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-27` — `RubricCriterion` / `SavedRubric` with new fields from Task 1

  **External References**:
  - Where RubricCard's rubric state is consumed by BatchProgress — trace `startBatchGrading` call site to ensure table changes propagate

  **Acceptance Criteria**:
  - [ ] Table renders with all 5 columns (Category, Name, Description, Points, Weight)
  - [ ] Weight column hidden when mode is Off
  - [ ] Grade button disabled when active weight mode has sum ≠ 100%
  - [ ] Grade button enabled when weights sum to 100% (or mode is Off)
  - [ ] Leniency slider still renders and functions
  - [ ] Loading a library rubric with weights populates the table correctly
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Grade button gated by weight validation
    Tool: Playwright
    Preconditions: Grading session open, rubric loaded in RubricCard
    Steps:
      1. Enable "By Category" weight mode
      2. Enter 50 in one category weight field (sum = 50%)
      3. Assert: Grade button has disabled attribute or aria-disabled="true"
      4. Assert: tooltip or label says "Weights must sum to 100%"
      5. Enter 50 in second category weight field (sum = 100%)
      6. Assert: Grade button is enabled
      7. Screenshot: .sisyphus/evidence/task-5-grade-gated.png
    Expected Result: Grade gating works correctly
    Evidence: .sisyphus/evidence/task-5-grade-gated.png

  Scenario: Leniency slider unaffected
    Tool: Playwright
    Preconditions: Weight mode active
    Steps:
      1. Enable "By Category" weight mode, set weights to 100%
      2. Locate leniency slider
      3. Drag slider to 80
      4. Assert: slider value changes, weights unchanged
    Expected Result: Leniency and weights are independent
    Evidence: .sisyphus/evidence/task-5-leniency-independent.png
  ```

  **Commit**: YES (group 5)
  - Message: `feat(rubric-card): add editable table view with weight columns and grade gating`
  - Files: `ogre-desktop/src/components/grading/RubricCard.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

- [ ] 6. Update `rubric-store.js` to accept `weightMode` in `updateRubric()`

  **What to do**:
  - In `grading-server/rubric-store.js`, find the `updateRubric()` function (around line 96-101)
  - Add `weightMode` to the list of accepted fields when updating a rubric
  - Since `criteria` is stored as `Array`, the new fields on each criterion (`category`, `categoryWeight`, `criterionWeight`) are already persisted through the existing `criteria` passthrough — just verify this is the case
  - Also ensure `createRubric()` (around line 62-78) passes through `weightMode` from the input object
  - Write a quick test (extend nearest test file or add inline) that:
    - Creates a rubric with `weightMode: 'category'`
    - Updates it with `weightMode: 'off'`
    - Verifies the stored value reflects the update

  **Must NOT do**:
  - Do NOT add a JSON schema migration or validation layer for existing rubrics
  - Do NOT change how `criteria` array fields are stored — they're already stored as-is

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted change to one function, trivial
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3, with Tasks 7 and 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `grading-server/rubric-store.js:62-101` — `createRubric()` and `updateRubric()` functions to modify
  - `grading-server/rubric-store.js:1-30` — file structure and existing field list

  **Acceptance Criteria**:
  - [ ] `updateRubric({ weightMode: 'category' })` persists the new value
  - [ ] `createRubric({ ..., weightMode: 'criterion' })` stores `weightMode`
  - [ ] Existing rubrics without `weightMode` still load without errors
  - [ ] `bun test` in grading-server passes

  **QA Scenarios**:
  ```
  Scenario: weightMode persists through save/reload
    Tool: Bash (bun test)
    Preconditions: rubric-store.js updated
    Steps:
      1. Create rubric with weightMode: 'category'
      2. Read it back
      3. Assert: weightMode === 'category'
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-6-persist.txt

  Scenario: Old rubric without weightMode loads cleanly
    Tool: Bash (bun test)
    Preconditions: rubric-store updated
    Steps:
      1. Load a rubric object that has no weightMode field
      2. Assert: no error thrown, returned object has weightMode === undefined or omitted
    Expected Result: PASS — backward compatible
    Evidence: .sisyphus/evidence/task-6-backward-compat.txt
  ```

  **Commit**: YES (group 6)
  - Message: `fix(rubric-store): accept weightMode in createRubric() and updateRubric()`
  - Files: `grading-server/rubric-store.js`
  - Pre-commit: `cd grading-server && bun test`

- [ ] 7. Extend `buildBatchPrompt()` in `grading.js` to pre-compute effective points when weights are active

  **What to do**:
  - In `grading-server/grading.js`, find `buildBatchPrompt()` (lines 97-309)
  - Add logic that checks if `rubric.weightMode` is `'category'` or `'criterion'` on the incoming request
  - **Category mode**: For each category in `checklistItems`, compute `effectivePoints = rawCategoryPoints × (categoryWeight / 100)`. Replace the raw point total with `effectivePoints` in the "SCORING BY CATEGORY" section of the prompt. Round to 1 decimal.
  - **Criterion mode**: For each item within a category, compute `effectivePoints = rawItemPoints × (criterionWeight / 100)`. Replace raw points in item listings.
  - **Off mode**: No changes to the prompt whatsoever — branch early and return exact same output as today
  - Update the `criterion_scores` JSON template (lines 252-259) to use effective points per category/criterion when weights are active
  - In `grading-server/grading.test.js`, add tests:
    - **Regression test**: `buildBatchPrompt()` with `weightMode: undefined` produces byte-identical output to pre-change snapshot (use a fixed rubric object, capture expected string)
    - **Weighted category test**: With `weightMode: 'category'` and a 40/60 split, verify effective points appear in prompt (not raw points)
    - **Off test**: Same rubric with `weightMode: 'off'` produces same output as baseline

  **Must NOT do**:
  - Do NOT let weight percentages appear in the prompt text — the AI should only see effective point totals
  - Do NOT change the `weightMode: 'off'` or `weightMode: undefined` code path AT ALL — branch before any changes
  - Do NOT change `buildSingleGradePrompt()` in this task (out of scope unless it reuses the same function)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful server-side logic with regression tests; must not break existing grading behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3, with Tasks 6 and 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8 (via integration test confirmation)
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `grading-server/grading.js:97-309` — `buildBatchPrompt()` full function; specifically lines 128-148 (SCORING BY CATEGORY) and lines 252-259 (criterion_scores template)
  - `grading-server/grading.test.js:1-396` — existing test structure using vitest/bun test style

  **API/Type References**:
  - `grading-server/schemas.md` — current request schema; understand how `rubric.checklistItems` arrives
  - `ogre-desktop/src/lib/rubric-api.ts:11-27` — weight fields on `RubricCriterion` (for understanding what's available)

  **Acceptance Criteria**:
  - [ ] `bun test` passes all new tests including regression test
  - [ ] Regression test: `buildBatchPrompt(rubricWithoutWeights)` === known-good baseline string (snapshot)
  - [ ] Weighted test: prompt contains `"Category A: 4 points total"` when raw=10pts, categoryWeight=40%
  - [ ] Weight % values do NOT appear anywhere in the prompt string when mode is active

  **QA Scenarios**:
  ```
  Scenario: Off-mode prompt is byte-identical to baseline
    Tool: Bash (bun test)
    Preconditions: buildBatchPrompt() modified with weight branching
    Steps:
      1. Run regression test: buildBatchPrompt(fixture, weightMode: undefined)
      2. Assert: output === snapshot string (byte-identical)
    Expected Result: PASS — no behavioral change for non-weighted grading
    Evidence: .sisyphus/evidence/task-7-regression-pass.txt

  Scenario: Category weights pre-computed in prompt
    Tool: Bash (bun test)
    Preconditions: buildBatchPrompt() updated, fixture has weightMode: 'category'
    Steps:
      1. fixture: category "Math" with raw 10pts, categoryWeight: 40
      2. Run: buildBatchPrompt(fixture) with weightMode: 'category'
      3. Assert: prompt contains "Math: 4 points" (10 * 0.40 = 4.0)
      4. Assert: prompt does NOT contain "40%" anywhere
    Expected Result: PASS — effective points injected, weights hidden from model
    Evidence: .sisyphus/evidence/task-7-weighted-prompt.txt
  ```

  **Commit**: YES (group 7)
  - Message: `feat(grading): pre-compute effective points in buildBatchPrompt() when weights active`
  - Files: `grading-server/grading.js`, `grading-server/grading.test.js`
  - Pre-commit: `cd grading-server && bun test`

- [ ] 8. Wire weight data through `BatchProgress.svelte` → `startBatchGrading()` → grading server

  **What to do**:
  - Trace the full data path from `RubricCard.svelte` → `BatchProgress.svelte` → `grading-api.ts` → `POST /api/grade`
  - Ensure that `weightMode`, `categoryWeight`, and `criterionWeight` fields on `RubricCriterion` objects are included in the batch grading request payload
  - In `ogre-desktop/src/lib/grading-api.ts`, confirm the request interface (updated in Task 1) is used correctly when serializing the request
  - In `ogre-desktop/src/lib/batch-grader.ts`, if there is a step that converts `SavedRubric.criteria[]` → `Rubric.checklistItems[]` (or builds the payload), add conversion logic that attaches `categoryWeight`/`criterionWeight` from `criteria[]` to the `checklistItems` or passes them as a separate field
  - If no conversion exists (library rubric and extracted rubric flow separately), add `weightMode` + weight fields as a separate top-level field on the `BatchGradingRequest` so the server always receives them
  - In `grading-server/grading.js`, update the request handler (`POST /api/grade`) to read `weightMode` and pass it into `buildBatchPrompt()` (already updated in Task 7)
  - Write an integration test in `grading-api.test.ts`:
    - Mock a batch grading request with `weightMode: 'category'` and `categoryWeight` values
    - Assert the mocked server receives the weight fields in the request body

  **Must NOT do**:
  - Do NOT change the `Rubric` interface in `batch-grader.ts` — pass weights as a parallel field
  - Do NOT merge the two rubric data models — keep them separate and add a bridge only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work touching multiple files; must trace a non-obvious data path
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Wave 2
  - **Parallel Group**: Wave 3
  - **Blocks**: FINAL
  - **Blocked By**: Tasks 3, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:336-444` — `extractRubric()` and how the rubric is assembled before being sent to server
  - `ogre-desktop/src/lib/grading-api.ts` — `startBatchGrading()` or equivalent; find where the request object is built
  - `ogre-desktop/src/lib/grading-api.test.ts:1-907` — existing test structure to follow for new integration test

  **API/Type References**:
  - `grading-server/schemas.md` — current API schema; understand what the server expects
  - `grading-server/grading.js` — `POST /api/grade` handler; find where `buildBatchPrompt()` is called and add `weightMode` passthrough

  **Acceptance Criteria**:
  - [ ] A batch grading request with weight fields set includes those fields in the HTTP body (confirmed via test mock)
  - [ ] The grading server reads `weightMode` from the request and passes it to `buildBatchPrompt()`
  - [ ] `npm test` in ogre-desktop passes new integration test
  - [ ] `bun test` in grading-server passes
  - [ ] End-to-end: grading with weights active produces a prompt with effective points (verified via task-7 test helpers or log output)

  **QA Scenarios**:
  ```
  Scenario: Weight fields present in grading request
    Tool: Bash (npm test)
    Preconditions: All previous tasks complete, integration wiring done
    Steps:
      1. Run integration test: mock startBatchGrading() with weightMode: 'category'
      2. Capture intercepted request body
      3. Assert: body.weightMode === 'category'
      4. Assert: body criteria items have categoryWeight fields
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-8-request-payload.txt

  Scenario: Server receives and uses weightMode
    Tool: Bash (bun test)
    Preconditions: grading.js handler updated
    Steps:
      1. POST /api/grade with weightMode: 'category' and weighted criteria
      2. Capture response or internal log of buildBatchPrompt output
      3. Assert: effective points appear in prompt, not raw points
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-8-server-uses-weights.txt
  ```

  **Commit**: YES (group 8)
  - Message: `feat(integration): wire weight data through BatchProgress and grading-api to server`
  - Files: `ogre-desktop/src/lib/grading-api.ts`, `ogre-desktop/src/lib/batch-grader.ts`, `ogre-desktop/src/lib/grading-api.test.ts`, `grading-server/grading.js`
  - Pre-commit: `cd ogre-desktop && npm test && cd ../grading-server && bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks) (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test). For each "Must NOT Have": search codebase for forbidden patterns (shared component, auto-redistribute, leniency changes, RubricImport changes). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `npm test` in `ogre-desktop/` and `bun test` in `grading-server/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Playwright: (1) open Rubrics library, set category weights summing to 95%, verify save is allowed but Grade button is disabled. (2) Adjust to 100%, verify Grade is enabled. (3) Switch to criterion mode, verify category mode weights are cleared. (4) In RubricCard, load a saved rubric with weights, verify weight columns appear. (5) Set `weightMode: 'off'`, grade a student, capture prompt and confirm it is byte-for-byte equal to a pre-weights baseline. (6) Set `weightMode: 'category'`, grade, capture prompt, confirm effective points appear (not raw × weight fractions).
  Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual git diff. Verify 1:1. Check: RubricImport.svelte NOT modified. `Rubric` interface in `batch-grader.ts` NOT modified. Leniency logic NOT modified. `weightMode: 'off'` path NOT modified from baseline. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Forbidden files [CLEAN/N touched] | VERDICT`

---

## Commit Strategy

1. `feat(types): add category, weightMode, categoryWeight, criterionWeight to rubric types` — `rubric-api.ts`, `grading-api.ts`
2. `feat(rubric-utils): extend text serialization with backward-compatible weight parsing` — `rubric-utils.ts`, `rubric-utils.test.ts`
3. `feat(rubric-utils): add validateWeights() pure utility with full test suite` — `rubric-utils.ts`, `rubric-utils.test.ts`
4. `feat(rubrics-page): add weight column and mode toggle to library editor table` — `Rubrics.svelte`
5. `feat(rubric-card): add editable table view with weight columns` — `RubricCard.svelte`
6. `fix(rubric-store): accept weightMode in updateRubric()` — `rubric-store.js`
7. `feat(grading): pre-compute effective points in buildBatchPrompt() when weights active` — `grading.js`, `grading.test.js`
8. `feat(integration): wire weight data through BatchProgress and grading-api` — `BatchProgress.svelte`, `grading-api.ts`

---

## Success Criteria

### Verification Commands
```bash
# Frontend tests (run in ogre-desktop/)
npm test -- --reporter=verbose
# Expected: All existing tests pass + new weight tests pass

# Backend tests (run in grading-server/)
bun test
# Expected: All existing tests pass + new weighted-prompt + regression tests pass

# Type check (run in ogre-desktop/)
npx tsc --noEmit
# Expected: No errors
```

### Final Checklist
- [ ] All "Must Have" features present and tested
- [ ] All "Must NOT Have" guardrails respected (verifiable via git diff)
- [ ] `weightMode: 'off'` produces byte-identical prompt output (regression test passes)
- [ ] Weight sum validation blocks Grade, allows Save
- [ ] Weights persist through save/reload cycle
- [ ] All existing tests still pass (no regressions)
