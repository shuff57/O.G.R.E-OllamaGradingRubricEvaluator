# Auto-Compute Rubric Target Points from Weights

## TL;DR

> **Quick Summary**: When a scraped rubric has `points: 0` on all criteria, automatically derive effective point values from category weights (or explicit pts in category names) and pass them silently to the AI grading prompt — no user input required.
>
> **Deliverables**:
> - `parseCheckboxFormat()` extracts integer pts from category name strings (e.g. `"CLT Statement (2 pts)"`)
> - `buildRubricFromText()` forwards `points` into the `checklistItems` array sent to the server
> - `effectivePoints()` falls back to `Math.round(maxScore × (weight/100) × 10) / 10` when `item.points === 0`
> - Existing unit tests pass; new test cases verify the fix
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
Automatically compute rubric target points (Pts column) from category/checklist weights and pass them silently to the AI grading prompt — without requiring the user to manually enter Pts values.

### Interview Summary
**Key Discussions**:
- Fix must be fully silent — no new UI fields, no user action required
- Weights already set by the user for categories/criteria must drive the effective pts sent to AI
- Category names in scraped rubrics encode max pts: `"CLT Statement (2 pts)"` → 2 pts

**Research Findings**:
- Root cause: `parseCheckboxFormat()` hardcodes `points: 0`; `effectivePoints()` multiplies by `item.points`, so always produces 0
- Two complementary fix locations: `rubric-utils.ts` (parse pts early) and `grading.js` (fallback when pts is still 0)
- `buildRubricFromText()` mapping in BatchProgress.svelte also strips `points` from checklistItems — must be fixed to forward it

### Metis Review
**Identified Gaps** (addressed):
- `buildRubricFromText()` maps `parsed` criteria to checklistItems but never forwards `c.points` — this is a required fix even if Option A works, because checklistItems must carry `points` to the server
- The indented-category format (`parseIndentedCategoryFormat`) has the same `points: 0` problem — fix should apply there too for consistency
- Allocation rows (`rowType: 'allocation'`) use `Full/Partial/Minimal/Missing` with pts baked into their names already — these parse through the standard `LINE_RE` pattern and will have correct pts; no special handling needed in the fallback
- `categoryMaxPoints` on the server (lines 1594–1603) reads `item.points` from checklistItems; if that field is missing, the map stays empty — forwarding `points` from Task 2 fixes this as a side benefit
- `effectivePoints()` fallback must use `maxScore` (already in closure as `const maxScore = parseFloat(rubric.maxScore) || 10` at line 1606) — BUT `maxScore` is declared AFTER `effectivePoints` is defined (line 98 uses `rubric.maxScore` as string; the parsed `maxScore` const is at line 1606). Must use `parseFloat(rubric.maxScore) || 10` directly in the fallback, not the `maxScore` const.

---

## Work Objectives

### Core Objective
When a rubric's criteria all have `points: 0` (as scraped from an LMS), use weights and/or pts encoded in category names to automatically compute and inject the correct point values into the AI grading prompt — transparently.

### Concrete Deliverables
- `ogre-desktop/src/lib/rubric-utils.ts` — `parseCheckboxFormat()` extracts pts from category names
- `ogre-desktop/src/lib/rubric-utils.ts` — `parseIndentedCategoryFormat()` same treatment for consistency
- `ogre-desktop/src/components/grading/batch/BatchProgress.svelte` — `buildRubricFromText()` forwards `points` into checklistItems
- `grading-server/grading.js` — `effectivePoints()` fallback when `item.points === 0`

### Definition of Done
- [ ] Grading a rubric with category names like `"CLT Statement (2 pts)"` and `categoryWeight: 20` sends `"CLT Statement: 2 points total"` in the AI prompt (not `0`)
- [ ] Grading a rubric with only weights (no pts in name) and `maxScore: 10` sends `"Category: 2 points total"` (= 10 × 20/100) when weight is 20%
- [ ] Existing vitest tests in `grading-server/test/` and `ogre-desktop/src/lib/` pass with no regressions
- [ ] No new UI controls added

### Must Have
- Points silently derived — never shown as a new field requiring user action
- Allocation rows (`Full/Partial/Minimal/Missing`) unaffected — they already have correct pts from standard parsing
- Works for both `weightMode: 'category'` and `weightMode: 'criterion'`

### Must NOT Have (Guardrails)
- No new UI input fields for pts
- No changes to the rubric text serialization format (`criteriaToText`) — do not alter how rubrics are displayed or saved
- Do not modify the `RubricCriterion` interface — only populate the existing `points` field that already exists
- Do not touch grading scoring logic, score normalization, or the outlier detection pass
- Do not alter `categoryMaxPoints` building logic on the server beyond what falls out naturally from forwarding `points`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (`vitest` in both `grading-server/` and `ogre-desktop/`)
- **Automated tests**: Tests after (add regression test cases after each task)
- **Framework**: vitest

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Bun REPL or vitest — import, call functions, compare output
- **End-to-end**: Inspect the prompt string that would be built by `buildBatchPrompt()` with a fixture rubric

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — independent fixes):
├── Task 1: Fix parseCheckboxFormat() + parseIndentedCategoryFormat() [quick]
└── Task 2: Fix buildRubricFromText() to forward points [quick]

Wave 2 (After Wave 1 — server fix + tests):
├── Task 3: Fix effectivePoints() fallback in grading.js [quick]
└── Task 4: Add/run regression tests [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real QA execution [unspecified-high]
└── Task F4: Scope fidelity check [deep]
→ Present results → Get explicit user okay
```

### Dependency Matrix
- **1**: none → 2, 3
- **2**: none → 3
- **3**: 1, 2 → 4
- **4**: 3 → F1–F4

### Agent Dispatch Summary
- **Wave 1**: 2 × `quick` — T1 and T2 are independent file changes
- **Wave 2**: 2 × `quick` — T3 is the server fix; T4 is test-writing
- **FINAL**: `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [ ] 1. Extract pts from category names in `parseCheckboxFormat()` and `parseIndentedCategoryFormat()`

  **What to do**:
  - In `parseCheckboxFormat()` (`ogre-desktop/src/lib/rubric-utils.ts`, lines 179–230):
    - When a tab-line is matched and `currentCategory` is set, try to parse an integer from a `(N pts)` or `(Npts)` pattern in the category name string using: `/\((\d+(?:\.\d+)?)\s*pts?\)/i`
    - If a match is found, store the parsed float as `categoryPts` for the current category
    - Assign `points: categoryPts ?? 0` to each criterion created under that category (both tab-line match and continuation checkbox-match paths)
    - When the category changes, reset/update `categoryPts` for the new category
  - Apply the same extraction logic to `parseIndentedCategoryFormat()` (lines 127–166):
    - When a category header is found (CATEGORY_HDR_RE match), extract pts from the category name string the same way
    - Assign to criteria created under that category

  **Must NOT do**:
  - Do not modify the `category` field stored on the criterion — it should stay as the full original string (e.g. `"CLT Statement (2 pts)"`), since the server strips the pts annotation with its own regex at line 1599
  - Do not change `criteriaToText()` serialization
  - Do not change `isAllocationCriterion()` or allocation row tagging logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, surgical addition of a regex extraction and variable threading through existing loops
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3 (effectivePoints fallback is secondary; this fix makes it cleaner)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-utils.ts:179-230` — `parseCheckboxFormat()` full function; the tab-line and checkbox-match paths both need `points` set
  - `ogre-desktop/src/lib/rubric-utils.ts:127-166` — `parseIndentedCategoryFormat()` — same treatment
  - `ogre-desktop/src/lib/rubric-utils.ts:232-241` — `textToCriteria()` dispatch; no changes here, just context
  - `grading-server/server.js:1599` — Server already strips `(N pts)` from category name with `/\s*\(\d+\s*pts?\)/i`; the client-side category string should be preserved as-is

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts` — `RubricCriterion.points: number` already exists; we're just populating it correctly instead of hardcoding 0

  **Acceptance Criteria**:

  - [ ] `textToCriteria("CLT Statement (2 pts)\t☐ Identifies the CLT")` returns `[{ criteria: "Identifies the CLT", points: 2, category: "CLT Statement (2 pts)" }]`
  - [ ] `textToCriteria("Standard Error (3 pts)\t☐ Computes SE correctly")` returns `[{ criteria: "Computes SE correctly", points: 3, category: "Standard Error (3 pts)" }]`
  - [ ] A continuation checkbox line `☐ Another criterion` under the same category also gets `points: 3`
  - [ ] A category with no pts annotation (e.g. `"General\t☐ Some item"`) still returns `points: 0` (graceful fallback)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Checkbox format with pts in category name — happy path
    Tool: Bash (bun/vitest REPL or test file)
    Preconditions: rubric-utils.ts fix applied
    Steps:
      1. Call textToCriteria("CLT Statement (2 pts)\t☐ Identifies the CLT\n☐ States assumptions correctly")
      2. Assert result[0].points === 2
      3. Assert result[1].points === 2  (continuation line inherits category pts)
      4. Assert result[0].category === "CLT Statement (2 pts)"  (category name unchanged)
    Expected Result: Both criteria have points: 2; category string is preserved
    Evidence: .sisyphus/evidence/task-1-checkbox-pts-happy.txt

  Scenario: Checkbox format with no pts in category name — graceful fallback
    Tool: Bash (bun/vitest)
    Steps:
      1. Call textToCriteria("General\t☐ Some criterion")
      2. Assert result[0].points === 0
    Expected Result: points is 0, no crash
    Evidence: .sisyphus/evidence/task-1-checkbox-pts-no-annotation.txt

  Scenario: Indented-category format with pts in category name
    Tool: Bash (bun/vitest)
    Steps:
      1. Construct text: "CLT Statement (2 pts)\t\n  Identifies the CLT\n  States assumptions"
      2. Call textToCriteria(text)
      3. Assert result[0].points === 2 and result[1].points === 2
    Expected Result: Both criteria have points: 2
    Evidence: .sisyphus/evidence/task-1-indented-pts-happy.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-checkbox-pts-happy.txt — console output or test results
  - [ ] task-1-checkbox-pts-no-annotation.txt
  - [ ] task-1-indented-pts-happy.txt

  **Commit**: YES (group with Task 2)
  - Message: `fix(rubric-utils): extract pts from category names in checkbox and indented parsers`
  - Files: `ogre-desktop/src/lib/rubric-utils.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/`

---

- [ ] 2. Forward `points` from parsed criteria into `checklistItems` in `buildRubricFromText()`

  **What to do**:
  - In `BatchProgress.svelte` (line 276–279), the `parsed.map()` call currently produces:
    ```ts
    { category: c.criteria, items: c.description ? [c.description] : [], categoryWeight?: ... }
    ```
  - Add `points: c.points` to this object:
    ```ts
    {
      category: c.criteria,
      items: c.description ? [c.description] : [],
      points: c.points,
      ...(c.categoryWeight !== undefined ? { categoryWeight: c.categoryWeight } : {}),
    }
    ```
  - This ensures the server receives `item.points` in checklistItems, so:
    - `effectivePoints(item)` has a non-zero `item.points` to multiply against
    - `categoryMaxPoints` on the server (lines 1594–1603) can build the map correctly

  **Must NOT do**:
  - Do not change the second code path (lines 287–318) that handles `[Category] / - item` format; that path does not go through `textToCriteria` and would need separate attention only if the user uses that format (out of scope here)
  - Do not add UI rendering of the `points` field

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One-line addition in a map() call
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (this fix is independent of Task 1, though Task 1 makes it meaningful)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/batch/BatchProgress.svelte:264-285` — `buildRubricFromText()` function; the map at line 276 is the exact fix location
  - `grading-server/server.js:1594-1603` — server reads `item.points` from checklistItems to build `categoryMaxPoints`; this confirms `points` must be forwarded

  **API/Type References**:
  - `ogre-desktop/src/lib/grading-api.ts:546` — `BatchGradingRequest` interface; check if checklistItems type needs updating to include `points?: number`. If the type is `{ category: string; items: string[]; categoryWeight?: number }[]`, add `points?: number` to remain compatible

  **Acceptance Criteria**:

  - [ ] After fix, calling `buildRubricFromText()` with a parsed rubric that has `c.points = 2` produces `checklistItems[0].points === 2`
  - [ ] TypeScript compiles without errors (`npx tsc --noEmit` passes)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: buildRubricFromText forwards points — happy path
    Tool: Bash (bun test or tsc --noEmit)
    Preconditions: Task 1 fix applied (so textToCriteria returns non-zero points)
    Steps:
      1. In a test or REPL context, set rubricText to checkbox-format rubric with "CLT Statement (2 pts)\t☐ Identifies the CLT"
      2. Call buildRubricFromText()
      3. Assert checklistItems[0].points === 2
    Expected Result: points is forwarded correctly
    Evidence: .sisyphus/evidence/task-2-forwarded-points.txt

  Scenario: TypeScript type check passes
    Tool: Bash (tsc --noEmit)
    Steps:
      1. cd ogre-desktop && npx tsc --noEmit
    Expected Result: Exit code 0, no type errors
    Evidence: .sisyphus/evidence/task-2-tsc-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-forwarded-points.txt
  - [ ] task-2-tsc-clean.txt

  **Commit**: YES (group with Task 1)
  - Message: `fix(rubric-utils): extract pts from category names in checkbox and indented parsers`
  - Files: `ogre-desktop/src/lib/rubric-utils.ts`, `ogre-desktop/src/components/grading/batch/BatchProgress.svelte`, `ogre-desktop/src/lib/grading-api.ts` (if type update needed)
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

---

- [ ] 3. Fix `effectivePoints()` fallback in `grading.js` when `item.points === 0`

  **What to do**:
  - In `grading-server/grading.js`, inside `buildBatchPrompt()`, update `effectivePoints()` (lines 103–111):
  
  **Current**:
  ```js
  function effectivePoints(item) {
    if (weightMode === 'category' && item.categoryWeight != null) {
      return Math.round(item.points * (item.categoryWeight / 100) * 10) / 10;
    }
    if (weightMode === 'criterion' && item.criterionWeight != null) {
      return Math.round(item.points * (item.criterionWeight / 100) * 10) / 10;
    }
    return item.points ?? 10;
  }
  ```
  
  **Updated**:
  ```js
  function effectivePoints(item) {
    const pts = item.points || 0;
    const mxScore = parseFloat(rubric.maxScore) || 10;
    if (weightMode === 'category' && item.categoryWeight != null) {
      const base = pts > 0 ? pts : mxScore * (item.categoryWeight / 100);
      return Math.round(base * 10) / 10;
    }
    if (weightMode === 'criterion' && item.criterionWeight != null) {
      const base = pts > 0 ? pts : mxScore * (item.criterionWeight / 100);
      return Math.round(base * 10) / 10;
    }
    return pts > 0 ? pts : 10;
  }
  ```
  
  - Note: `rubric` is in scope (parameter of `buildBatchPrompt`). `maxScore` as a `const` is declared at line 1606 — which is OUTSIDE `buildBatchPrompt`. Use `parseFloat(rubric.maxScore) || 10` directly inside the function to be safe.
  - This provides a double safety net: if Task 1+2 correctly populate `item.points`, the branch `pts > 0` is taken and the formula is `pts × 1` (unchanged behavior). If `pts` is still 0 (e.g. old saved rubrics, the `[Category] / - item` format path), the fallback correctly computes from maxScore × weight.

  **Must NOT do**:
  - Do not change the behavior when `item.points > 0` — multiply exactly as before
  - Do not touch the `categoryWeights` block (lines 162–172) which is separate from `effectivePoints`
  - Do not change how the final score is computed or normalized

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: ~10-line function replacement with backward-compatible logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1–F4 verification
  - **Blocked By**: Tasks 1 and 2 (conceptually — but can be written in parallel since it's independent code)

  **References**:

  **Pattern References**:
  - `grading-server/grading.js:97-111` — `buildBatchPrompt()` function header and `effectivePoints()` definition
  - `grading-server/grading.js:140-154` — where `effectivePoints(item)` is called in prompt construction (line 153): `prompt += \`- ${item.category}: ${effectivePoints(item)} points total\n\``
  - `grading-server/server.js:1606` — `const maxScore = parseFloat(rubric.maxScore) || 10` — this is after `buildBatchPrompt` returns; do NOT use this variable; recalculate inside the function

  **Acceptance Criteria**:

  - [ ] `effectivePoints({ points: 2, categoryWeight: 20 })` with `maxScore=10` and `weightMode='category'` returns `2` (pts > 0 path, not the weight formula)
  - [ ] `effectivePoints({ points: 0, categoryWeight: 20 })` with `maxScore=10` returns `2` (fallback: 10 × 0.20)
  - [ ] `effectivePoints({ points: 0, criterionWeight: 30 })` with `maxScore=10` and `weightMode='criterion'` returns `3`
  - [ ] `effectivePoints({ points: 0 })` with no weight returns `10` (default fallback unchanged)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: effectivePoints with pts=0 and category weight — fallback
    Tool: Bash (bun test grading-server/test/)
    Preconditions: effectivePoints fix applied
    Steps:
      1. In test or direct call context: rubric.maxScore = "10", weightMode = "category"
      2. Call effectivePoints({ points: 0, categoryWeight: 20 })
      3. Assert return value === 2
    Expected Result: 2 (= 10 × 0.20)
    Evidence: .sisyphus/evidence/task-3-effective-pts-fallback.txt

  Scenario: effectivePoints with pts > 0 — no regression
    Tool: Bash (bun test)
    Steps:
      1. rubric.maxScore = "10", weightMode = "category"
      2. Call effectivePoints({ points: 3, categoryWeight: 30 })
      3. Assert return value === 3  (pts > 0, uses pts directly not maxScore formula)
    Expected Result: 3 (not 3 × 0.3 = 0.9)
    Evidence: .sisyphus/evidence/task-3-effective-pts-no-regression.txt

  Scenario: Full prompt string includes correct point values
    Tool: Bash (bun test or Node REPL import)
    Steps:
      1. Build a test rubric: checklistItems=[{ category: "CLT Statement (2 pts)", items: ["Identifies CLT"], points: 2, categoryWeight: 20 }], maxScore: "10", weightMode: "category"
      2. Call buildBatchPrompt(rubric, [{index:0, name:"Test", response:"Test answer"}], anchors)
      3. Assert the prompt string contains "CLT Statement (2 pts): 2 points total" (or similar)
      4. Assert it does NOT contain "CLT Statement (2 pts): 0 points total"
    Expected Result: Non-zero point value appears in SCORING BY CATEGORY section
    Evidence: .sisyphus/evidence/task-3-prompt-has-pts.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-effective-pts-fallback.txt
  - [ ] task-3-effective-pts-no-regression.txt
  - [ ] task-3-prompt-has-pts.txt

  **Commit**: YES (separate commit for server-side fix)
  - Message: `fix(grading): effectivePoints falls back to maxScore×weight when item.points is 0`
  - Files: `grading-server/grading.js`
  - Pre-commit: `cd grading-server && bun test`

---

- [ ] 4. Add regression test cases to the existing test suite

  **What to do**:
  - In `ogre-desktop/src/lib/` (check for existing rubric-utils test files, e.g. `rubric-utils.test.ts`):
    - Add test cases for checkbox-format category name pts extraction (mirrors Task 1 QA scenarios)
    - Add test cases for the `points: 0` graceful fallback (no annotation)
  - In `grading-server/test/grading.test.js`:
    - Add test cases for `effectivePoints()` with `pts=0` + weight fallback
    - Add test cases for `effectivePoints()` with `pts>0` (no-regression)
  - If no existing test file covers `rubric-utils.ts`, create `ogre-desktop/src/lib/rubric-utils.test.ts` following the patterns in any nearby `.test.ts` file

  **Must NOT do**:
  - Do not add tests for unrelated parts of the codebase
  - Do not add integration tests that require a running server or browser
  - Keep tests fast and unit-level

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Writing test cases that mirror already-verified QA scenarios
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1–F4
  - **Blocked By**: Tasks 1 and 2 must be done first (tests must pass against the fixed code)

  **References**:

  **Pattern References**:
  - `grading-server/test/grading.test.js` — existing test file; match its import style and describe/it structure
  - `ogre-desktop/src/lib/` — look for any `.test.ts` files to match vitest patterns

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-utils.ts:232` — `textToCriteria()` is the public export to test against

  **Acceptance Criteria**:

  - [ ] `cd grading-server && bun test` — all tests pass, including new regression tests
  - [ ] `cd ogre-desktop && npx vitest run src/lib/` — all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Run full test suites — all pass
    Tool: Bash
    Steps:
      1. cd grading-server && bun test
      2. Assert exit code 0
      3. cd ../ogre-desktop && npx vitest run src/lib/
      4. Assert exit code 0
    Expected Result: All tests pass with 0 failures
    Failure Indicators: Any non-zero exit code or "FAILED" in output
    Evidence: .sisyphus/evidence/task-4-test-run.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-test-run.txt — full test output

  **Commit**: YES (group with Task 3 or separate)
  - Message: `test(rubric-utils,grading): add regression tests for auto-pts fallback`
  - Files: `grading-server/test/grading.test.js`, `ogre-desktop/src/lib/rubric-utils.test.ts` (new or existing)
  - Pre-commit: `cd grading-server && bun test && cd ../ogre-desktop && npx vitest run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file). For each "Must NOT Have": search codebase for forbidden patterns (new UI fields, changes to criteriaToText, interface mutations). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cd ogre-desktop && npx tsc --noEmit`. Check all changed files for: type errors, `as any`, empty catches, console.log in non-test code. Verify `parseCheckboxFormat` regex is correct for the pts-in-category-name pattern. Check the `effectivePoints` fallback arithmetic is correct for all four weight/pts combinations.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA Execution** — `unspecified-high`
  Run both test suites (`bun test` + `npx vitest run`). Execute ALL QA scenarios from Tasks 1–4. Specifically: verify the prompt string built by `buildBatchPrompt()` for the user's sample rubric (CLT=2pts@20%, SE=3pts@30%, MOE=3pts@30%, PI=2pts@20%, maxScore=10) contains correct non-zero point values in the SCORING BY CATEGORY section. Save evidence.
  Output: `Scenarios [N/N pass] | Test suites [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check Must NOT do compliance: no new UI, no criteriaToText changes, no interface mutations. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1 commit**: `fix(rubric-utils): extract pts from category names in checkbox and indented parsers` — `rubric-utils.ts`, `BatchProgress.svelte`, `grading-api.ts` (if type updated)
- **Wave 2 commit**: `fix(grading): effectivePoints falls back to maxScore×weight when item.points is 0` — `grading.js`
- **Wave 2 commit**: `test(rubric-utils,grading): add regression tests for auto-pts fallback` — test files

---

## Success Criteria

### Verification Commands
```bash
cd grading-server && bun test              # Expected: all pass
cd ogre-desktop && npx tsc --noEmit        # Expected: exit 0
cd ogre-desktop && npx vitest run src/lib/ # Expected: all pass
```

### Final Checklist
- [ ] `effectivePoints()` never returns 0 when a weight is set and maxScore > 0
- [ ] Category names like `"CLT Statement (2 pts)"` correctly produce `points: 2` in parsed criteria
- [ ] `checklistItems` sent to server include `points` field
- [ ] No new UI fields added anywhere
- [ ] No regressions in existing test suites
