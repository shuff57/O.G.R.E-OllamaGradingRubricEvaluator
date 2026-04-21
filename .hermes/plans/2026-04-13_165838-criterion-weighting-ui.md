# Plan: Criterion Weighting UI

## Goal

Complete the criterion weighting mode (`weightMode === 'criterion'`) in the rubric table so it has the same visual quality and API integration that category weighting mode received in the previous session.

## Current State

Category weight mode is fully working:
- Visual grouping with rowspan, thicker borders at group boundaries
- Allocation rows hidden, Pts column hidden
- `categoryWeights` flows from `textToCriteria` → `BatchProgress` → grading API → server prompt

Criterion weight mode is partial:
- Per-row weight % input exists (line 476 of RubricCard.svelte)
- `validateWeights()` validates per-category-group sums
- No visual grouping, no allocation row hiding, no server-side prompt integration

## Changes

### 1. RubricCard.svelte — Extend `displayRows`/`displayIndexMap` to criterion mode

**Current:** `displayRows` only filters when `weightMode === 'category'`.
**Change:** Also filter allocation rows when `weightMode === 'criterion'`. Same pattern — `isAllocationCriterion` check. Both modes benefit from hiding Full/Partial/Minimal/Missing rows.

Update `displayRows`, `displayIndexMap`, `categoryRowCounts`, `isFirstInCategoryDisplay` to apply when `weightMode !== 'off'` instead of only `'category'`.

Files: `ogre-desktop/src/components/grading/RubricCard.svelte` (lines 200-248)

### 2. RubricCard.svelte — Visual grouping for criterion mode

**Current:** Thick border at category group boundaries (`category-first-row` class) only in category mode.
**Change:** Show category group visual separation (thicker top border) in criterion mode too. The `isFirstInCategoryDisplay` already uses `displayRows`, so extending step 1 fixes this automatically.

Also: column order. In criterion mode, the weight column should appear between Criteria and Pts (already does at line 456-477). Keep Pts column visible in criterion mode (unlike category mode where it's hidden). No structural change needed, just verify the conditional at line 459/480.

Files: `ogre-desktop/src/components/grading/RubricCard.svelte` (lines 451-480, 468)

### 3. RubricCard.svelte — Surface per-category validation errors

**Current:** Shows generic `⚠ ≠ 100%` badge. `validateWeights` in criterion mode returns per-category errors like `Category 'Writing' criteria weights sum to 85%, must be 100%`.
**Change:** Display the `errors` array from `internalWeightsValid` in the validation badge area (line 523+). Show each per-category error on its own line or as a tooltip.

Files: `ogre-desktop/src/components/grading/RubricCard.svelte` (lines 515-530)

### 4. BatchGradingRequest type — Add `criterionWeights` field

**Current:** `BatchGradingRequest.rubric` has `categoryWeights?: Record<string, number>`.
**Change:** Add `criterionWeights?: Record<string, Record<string, number>>` — nested map of `{ category: { criterion: weight } }`.

Files: `ogre-desktop/src/lib/grading-api.ts` (line ~558-566)

### 5. BatchProgress.svelte — Build `criterionWeights` from rubric text

**Current:** IIFE at line 571-582 only builds `categoryWeights` when `weightMode === 'category'`.
**Change:** Add parallel IIFE for `weightMode === 'criterion'` that builds `criterionWeights` from `textToCriteria(rubricText)`. Group by category, then map each criterion's `criterionWeight` into nested structure.

Files: `ogre-desktop/src/components/grading/batch/BatchProgress.svelte` (lines 571-592)

### 6. grading-server/grading.js — Add criterion weights to prompt

**Current:** Lines 165-174 add `CATEGORY WEIGHTS` section when `rubric.categoryWeights` exists.
**Change:** Add parallel `CRITERION WEIGHTS` section when `rubric.criterionWeights` exists. Format:

```
CRITERION WEIGHTS (within each category, criteria % must sum to 100%):
- Writing:
  - Thesis Statement: 30%
  - Evidence: 40%
  - Grammar: 30%
- Math:
  - Setup: 50%
  - Calculation: 50%
```

Files: `grading-server/grading.js` (after line 174)

### 7. Tests

- Verify `validateWeights` in criterion mode returns per-category errors (already tested? check test files)
- Add test: `criterionWeights` round-trip through `textToCriteria` → `criteriaToText`
- Run full suite: `bun run vitest run` from project root (95 existing tests must still pass)

## Risks / Open Questions

1. **Criterion weight prompt effectiveness** — The AI needs clear instructions that `criterionWeight` is intra-category (sums to 100% per group), not global. The prompt formatting above makes this explicit.
2. **Should Pts column be hidden in criterion mode?** Allocation rows will be hidden. Pts column still shows per-criterion point values, which are useful in criterion mode. Recommend keeping Pts visible.
3. **`criterionWeights` nested structure vs flat** — Alternative: `Record<string, number>` with composite keys like `"Writing: Thesis"`. Nested is cleaner for the server-side prompt builder. Using nested.
4. **SavedRubric type** — `SavedRubric` already has `categoryWeights` but no `criterionWeights`. Should add for library rubrics that save their weight config. Low priority — can add when rubric library save is tested.

## Verification

1. Switch RubricCard to criterion mode → allocation rows hidden, category group borders visible
2. Enter weights that don't sum to 100% per group → per-category error messages shown
3. Enter valid weights → start batch grading → check server logs that `CRITERION WEIGHTS` section appears in prompt
4. Run `bun run vitest run` — all existing tests pass