# Handoff: Criterion Weighting UI

## What was done (this session)

### Category weight mode — fully reworked
1. **BatchProgress.svelte** (~line 568): builds `rubric.categoryWeights` from `textToCriteria(rubricText)` when `weightMode === 'category'`, sends it in the grading API request. Previously `categoryWeights` was never included — the server code existed but frontend never populated it.

2. **RubricCard.svelte** — table rebuild:
   - **Weight % column moved left** of Category in category mode (between Criteria and Pts in criterion mode)
   - **Rowspan** for weight input: one input per category group, spanning all rows vertically
   - **Allocation rows hidden** (Full/Partial/Minimal/Missing) when `weightMode === 'category'` — filtered via `displayRows` / `displayIndexMap`
   - **Pts column hidden** in category mode — points are internal detail the AI uses, not user-facing when weighting by category
   - `updateCategoryWeight(i, value)` propagates weight to ALL rows in same category
   - `displayRows` = filtered view (hides allocations in category mode)
   - `displayIndexMap` maps display indices → original `tableRows` indices for edits
   - `categoryRowCounts` = Map<category, count> for rowspan values
   - `isFirstInCategoryDisplay` = boolean[] for which display rows show the weight cell
   - CSS: `.weight-cell` (vertical-align middle, border-right for visual separation), `.weight-input` (centered, 55px), `.category-first-row` (thicker top border)

3. **rubric-utils.ts** — `textToCriteria()` bugfix: parser was reading `currentCategoryWeight` from `## Category [N%]` headers but never assigning it to parsed criterion objects. Added `if (currentCategoryWeight !== undefined) { criterion.categoryWeight = currentCategoryWeight; }`. Round-trip verified: `criteriaToText → textToCriteria` now preserves `categoryWeight`.

4. **All 95 existing tests pass.**

## What's next: Criterion weighting UI

### Current behavior
- `weightMode === 'criterion'` shows a per-row "Weight %" input — each criterion gets its own weight value (`criterionWeight`)
- `validateWeights(criteria, 'criterion')` requires each category group's `criterionWeight` values to sum to 100%
- The grading API doesn't have a `criterionWeights` field yet — only `categoryWeights`

### Needed changes

1. **Visual grouping for criterion mode too** — same kind of visual separation per category (thicker border at group boundaries). The `isFirstInCategory` array already exists based on `tableRows`. Consider reusing `displayRows` pattern but without hiding allocation rows in criterion mode.

2. **Validation UX feedback** — currently shows `⚠ ≠ 100%` badge. Per-category breakdown would be more helpful: "Writing: 85%, Math: 110%" instead of just "≠ 100%". The errors from `validateWeights` already contain this info — surface them.

3. **Consider hiding allocation rows in criterion mode too** — Full/Partial/Minimal/Missing rows make the weight table noisy. They're internal point allocations, not criteria the user assigns weights to.

4. **BatchProgress.svelte** — decide how `criterionWeight` flows into the grading prompt. Two options:
   - Add a `criterionWeights` field to the grading API (new)
   - Convert `criterionWeight` per-row into a prompt instruction (e.g. "Criterion X is worth 25% of the Writing category")
   - The server `grading.js` currently only understands `categoryWeights` at the rubric level

### Key files
- `ogre-desktop/src/components/grading/RubricCard.svelte` — table UI, weight mode toggle, validation
- `ogre-desktop/src/components/grading/batch/BatchProgress.svelte` — builds grading API request (line ~560)
- `ogre-desktop/src/lib/rubric-utils.ts` — `criteriaToText`, `textToCriteria`, `validateWeights`, `isAllocationCriterion`
- `ogre-desktop/src/lib/grading-api.ts` — `BatchGradingRequest` type (line ~551)
- `ogre-desktop/src/lib/rubric-api.ts` — `RubricCriterion` type (has `categoryWeight`, `criterionWeight`)
- `grading-server/grading.js` — server-side prompt building (line ~166 for `categoryWeights`, line ~346 for `parseBatchResponse`)

### Patterns to follow
- `displayRows` / `displayIndexMap` pattern for filtered views
- `categoryRowCounts` for rowspan calculations
- `$derived.by()` for computed arrays
- Always map display indices back to original `tableRows` indices via `displayIndexMap.toOriginal`