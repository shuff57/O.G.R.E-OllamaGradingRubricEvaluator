# Draft: Rubric Point Allocation Row Fix

## Requirements (confirmed)
- **Problem**: Scraped rubric data contains two types of rows mixed together:
  1. **Checklist rows** — category + checkbox item (e.g., "CLT Statement / ☐ States sampling distribution...")
  2. **Point allocation rows** — category + scoring tiers (e.g., "CLT Statement (2 pts) / Full (2): ...", "Partial (1): ...", "Missing (0): ...")
- **User complaint**: The point allocation rows show up with adjustable score inputs (the `0 × ` pattern), but they should NOT be user-adjustable — they are reference rubric tiers, not graded items.
- **Desired behavior**: Only checklist rows should have user-adjustable point inputs. Point allocation rows should be read-only or rendered differently (as reference/description only).

## Technical Observations from Scraped Data
- Checklist rows: `Category Name \n ☐ [item description]`
- Point allocation rows: `Category Name (N pts) \n Full (N): [desc]` / `Partial (N): [desc]` / `Minimal (N): [desc]` / `Missing (0): [desc]`
- Both currently render with `0 ×` (score input + delete button)
- Pattern to distinguish: point allocation rows have "(N pts)" in category name OR start with "Full", "Partial", "Minimal", "Missing" in item text

## Open Questions
- ~~How are rubric rows stored?~~ → `RubricCriterion[]` in rubric-api.ts — no `rowType` field
- ~~Where does the score input widget come from?~~ → Two places: `Rubrics.svelte:312-329` (library editor) and `RubricImport.svelte:189-220` (staging area)
- ~~Is there a `type` field on rubric rows already?~~ → No, needs to be added
- ~~Should point allocation rows be hidden or read-only?~~ → DECISION NEEDED (see below)

## Research Findings
- **Data flow**: `batch-grader.ts:extractRubric()` produces two separate arrays: `checklistItems` (☐ rows) and `rubricItems` (Full/Partial/Missing rows). Both have `category` + `items[]` shape.
- **Merge point**: `format.ts:formatRubricForDisplay()` line 44-46 concatenates BOTH arrays into a single `RubricCriterion[]` via `rubricItemsToCriteria()`. All criteria get `points: 0` and no type distinction.
- **Serialization**: The merged list is serialized via `criteriaToText()` into the `## Category\nName (0pts)\n...` format, which `textToCriteria()` then parses back. Point allocation rows survive as criteria named "Full (2)", "Partial (1)", "Missing (0)" — these match `LINE_RE` (they contain `(Npts)` pattern!) and parse as valid criteria with points 2, 1, 0.
- **Render**: `Rubrics.svelte` and `RubricImport.svelte` render EVERY criterion row with editable points + delete button — no distinction exists.
- **Key insight**: The `(2pts)`, `(1pts)`, `(0pts)` in "Full (2):", "Partial (1):", "Missing (0):" is what `LINE_RE` captures as the point value. So these rows round-trip through the text serializer as named criteria with points.

## Technical Decision: How to Mark Allocation Rows

**Option A — Add `rowType?: 'checklist' | 'allocation'` to `RubricCriterion`**
- Tag at source in `rubricItemsToCriteria()` inside `format.ts`
- Requires interface change; clean separation; survives round-trips only if persisted

**Option B — Detect at render time by pattern matching `criteria` field**
- `criteria` starts with "Full", "Partial", "Minimal", "Missing" + has " (N):" pattern
- No interface change needed; fragile if rubric uses those words for real criteria

**Option C — Don't mix the arrays; keep them separate in the display**
- Show checklist items only in the staging/library editor; show rubric items as a separate read-only reference section
- Cleanest architecturally; bigger change

**Decided: Option A** — add `rowType?: 'checklist' | 'allocation'` to `RubricCriterion`, tag at source in `format.ts`, render conditionally in both components.

## Scope Boundaries
- INCLUDE: Add `rowType` field to `RubricCriterion` interface
- INCLUDE: Tag rows in `format.ts:rubricItemsToCriteria()` based on source array
- INCLUDE: Hide points input + delete button for `rowType === 'allocation'` in `RubricImport.svelte`
- INCLUDE: Hide points input + delete button for `rowType === 'allocation'` in `Rubrics.svelte`
- INCLUDE: Preserve `rowType` through `criteriaToText()` / `textToCriteria()` round-trip (or accept it's lost and retag on re-import)
- EXCLUDE: Changing how rubric data is scraped
- EXCLUDE: Changing the grading server prompt logic
- EXCLUDE: Changing how allocation rows are used in the AI grading context

## Scope Boundaries
- INCLUDE: Distinguishing checklist rows from point allocation rows in rendering
- INCLUDE: Making point allocation rows read-only / non-adjustable
- EXCLUDE: Changing how rubric data is scraped (scraper is working correctly)
- EXCLUDE: Changing the actual scoring logic
