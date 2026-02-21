# Batch Grader Rubric Enhancement — Library Integration + Always-Visible Editor

## TL;DR

> **Quick Summary**: Enhance the batch grader's rubric section so the textarea is always visible, saved rubrics can be loaded from the library, edited inline, and saved back (new or update existing). Currently the RubricCard selection is ignored in batch mode and the textarea is cosmetic — this plan connects everything end-to-end.
> 
> **Deliverables**:
> - Always-visible rubric textarea in batch mode (before and after extraction)
> - Library rubric import: select from dropdown → pre-fills textarea immediately
> - "Update" button when a library rubric is loaded + "Save as New" always available
> - Textarea edits reflected in actual grading (not cosmetic)
> - Existing `rubric-utils.ts` conversions used for round-trip fidelity
> - RubricCard dropdown refresh after save/update
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6 → F1-F4

---

## Context

### Original Request
User wants the batch grader's rubric section in the desktop app to have a textarea that displays the rubric, can import from saved rubrics, edit inline, and save/update back to the library.

### Interview Summary
**Key Discussions**:
- Library rubric pre-fills textarea immediately on selection (before Start Batch)
- Both "Update" and "Save as New" options (Update only when library rubric loaded)
- Rubric textarea always visible in batch mode, not just post-extraction
- Enhancement scoped to BatchPanel + RubricCard, NOT the Rubrics page

**Research Findings**:
- `rubricText` in BatchPanel is currently cosmetic — grading uses `extractedRubric` object, ignoring textarea edits
- `handleSaveRubric()` is lossy — sets all points to 0, drops `essayPrompt`/`modelText`
- Three type systems: `SavedRubric` (library), `Rubric` (batch-grader), `GradeRubric` (API)
- `rubric-utils.ts` already has `criteriaToText()`/`textToCriteria()` for round-trip conversion
- `hasUnsavedChanges()` in rubric-utils.ts was pre-built for the "Update" button feature but never wired up
- `selectedRubric` prop exists in GradingPanel but is NOT passed to BatchPanel
- RubricCard has no deselect ("None") option

### Metis Review
**Identified Gaps** (addressed):
- Textarea edits being cosmetic → Plan includes parsing textarea back to structured data before grading
- Lossy save function → Plan fixes `handleSaveRubric` to use `textToCriteria()` with real point values
- Missing prop wiring → Plan adds `selectedRubric` prop to BatchPanel
- No deselect option → Plan adds "None" option to RubricCard dropdown
- RubricCard stale after save → Plan adds refresh event mechanism
- Library rubric overwritten by extraction → Plan preserves library rubric if extraction fails
- Text format decision → Using `criteriaToText()` format for round-trip safety (over `formatRubricForDisplay()`)

---

## Work Objectives

### Core Objective
Make the batch grader's rubric section a fully functional rubric editor that integrates bidirectionally with the rubric library — load, edit, grade with, and save/update rubrics without leaving the batch workflow.

### Concrete Deliverables
- Modified `RubricCard.svelte` — deselect option, refresh trigger
- Modified `BatchPanel.svelte` — always-visible textarea, library import, update flow, fixed save, textarea→grading connection
- Modified `GradingPanel.svelte` — pass `selectedRubric` prop to BatchPanel
- Updated conversion logic using existing `rubric-utils.ts` functions

### Definition of Done
- [ ] Selecting a library rubric populates the batch textarea immediately
- [ ] Textarea edits are used in actual grading (not cosmetic)
- [ ] "Update" button appears when library rubric is loaded and modified
- [ ] "Save as New" creates a new rubric with correct point values (not all 0)
- [ ] RubricCard dropdown refreshes after save/update
- [ ] All existing tests pass: `npx vitest run`
- [ ] TypeScript type-check passes: `npx tsc --noEmit`

### Must Have
- Always-visible rubric textarea in batch mode
- Library rubric import via dropdown selection
- Textarea edits affect actual grading results
- Both Save as New and Update existing rubric
- Point values preserved in save round-trip

### Must NOT Have (Guardrails)
- NO changes to the Rubrics page (`pages/Rubrics.svelte`)
- NO changes to StudentWorkCard, SolverChat, or DiscoveryPanel
- NO new type definitions — use existing `SavedRubric`, `Rubric`, `RubricCriterion`
- NO merge logic for library + extracted rubrics — extraction replaces library rubric
- NO confirmation dialogs beyond the single "Update will overwrite" confirm
- NO structured form editor in BatchPanel — textarea is plain text, period
- NO changes to `toGradeRubric()` in GradingPanel.svelte
- DO NOT add toast/notification systems — use existing `saveStatus` string pattern
- DO NOT refactor the batch phase system (idle/extracting/review/grading/done)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest + existing `.test.ts` files)
- **Automated tests**: Tests-after (add tests for new conversion wiring)
- **Framework**: vitest (already configured)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate desktop app, interact with rubric components, assert DOM state, screenshot
- **Unit Tests**: Use Bash (vitest) — run specific test files, verify pass counts
- **Type Safety**: Use Bash (tsc) — run `npx tsc --noEmit` to verify no type errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation utilities + prop wiring):
├── Task 1: Wire selectedRubric prop from GradingPanel → BatchPanel [quick]
├── Task 2: Add deselect option to RubricCard + refresh event [quick]
└── Task 3: Add SavedRubric→textarea conversion + sourceRubricId tracking to BatchPanel [unspecified-high]

Wave 2 (After Wave 1 — core UI + logic):
├── Task 4: Always-visible rubric textarea + library pre-fill on selection [visual-engineering]
├── Task 5: Fix save flow + add Update button with hasUnsavedChanges [unspecified-high]
└── Task 6: Connect textarea edits to grading pipeline [deep]

Wave 3 (After Wave 2 — integration + verification):
├── Task 7: Handle extraction vs library rubric interaction + edge cases [unspecified-high]
└── Task 8: Add vitest tests for new conversion paths + round-trip [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 5 → Task 6 → Task 7 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3, 4 | 1 |
| 2 | — | 4, 5 | 1 |
| 3 | 1 | 4, 5, 6 | 1 |
| 4 | 1, 2, 3 | 7 | 2 |
| 5 | 2, 3 | 7 | 2 |
| 6 | 3 | 7, 8 | 2 |
| 7 | 4, 5, 6 | F1-F4 | 3 |
| 8 | 6 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: **3 tasks** — T4 → `visual-engineering`, T5 → `unspecified-high`, T6 → `deep`
- **Wave 3**: **2 tasks** — T7 → `unspecified-high`, T8 → `unspecified-high`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Wire `selectedRubric` prop from GradingPanel → BatchPanel

  **What to do**:
  - In `GradingPanel.svelte`, pass the existing `selectedRubric` state as a prop to `<BatchPanel>` (line ~361-369)
  - Add `bind:selectedRubric={selectedRubric}` to the BatchPanel component invocation
  - In `BatchPanel.svelte`, add `selectedRubric` to the props interface (type `SavedRubric | null`, default `null`)
  - Import the `SavedRubric` type from `../../lib/rubric-api`
  - This is prop wiring only — no behavioral changes yet

  **Must NOT do**:
  - Do NOT add any behavior/effects that react to selectedRubric changes — that's Task 4
  - Do NOT modify any other component props
  - Do NOT change the BatchPanel's internal rubric state variables

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - No special skills needed — simple prop wiring across 2 files

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:54` — `selectedRubric` state declaration (`$state<SavedRubric | null>(null)`)
  - `ogre-desktop/src/pages/GradingPanel.svelte:342` — Current `<RubricCard bind:selectedRubric={selectedRubric} />` showing how the prop is already bound
  - `ogre-desktop/src/pages/GradingPanel.svelte:360-370` — `<BatchPanel>` component invocation where the new prop must be added

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:18-27` — `SavedRubric` interface definition (import this in BatchPanel)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:36-45` — Current props destructuring in BatchPanel (add `selectedRubric` here)

  **WHY Each Reference Matters**:
  - GradingPanel:54 — Shows the source state that needs to flow to BatchPanel
  - GradingPanel:342 — Shows the existing binding pattern to follow for consistency
  - GradingPanel:360-370 — This is the exact location where you add the new prop binding
  - rubric-api.ts:18-27 — The type definition to import in BatchPanel
  - BatchPanel:36-45 — The exact location where you add the new prop in the destructuring

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds with new prop
    Tool: Bash
    Preconditions: ogre-desktop directory exists with node_modules
    Steps:
      1. Run `cd ogre-desktop && npx tsc --noEmit`
      2. Verify exit code is 0
      3. Verify no errors mentioning "selectedRubric" or "BatchPanel"
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Non-zero exit code, "Type error" in output mentioning the prop
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: Prop exists in BatchPanel but doesn't break existing behavior
    Tool: Bash
    Preconditions: ogre-desktop codebase compiles
    Steps:
      1. Run `cd ogre-desktop && npx vitest run`
      2. Verify all existing tests pass
    Expected Result: All tests pass, no regressions
    Failure Indicators: Test failures mentioning BatchPanel or rubric
    Evidence: .sisyphus/evidence/task-1-tests.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(rubric): wire selectedRubric prop from GradingPanel to BatchPanel`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`, `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [x] 2. Add deselect option to RubricCard + refresh event mechanism

  **What to do**:
  - In `RubricCard.svelte`, add a selectable "None (use page rubric)" option to the `<select>` dropdown (after the disabled placeholder, before the rubric list). When selected, set `selectedRubric = null` and fire `onRubricChange?.(null)`.
  - Add a public `refresh()` method or listen for a custom DOM event (`ogre:rubric-saved`) to trigger `fetchRubrics()` re-fetch. This allows BatchPanel to tell RubricCard to refresh its list after a save/update.
  - The event pattern is already used in the codebase: see `handleManageLibrary()` at line 52 which dispatches `ogre:navigate`. Follow this same pattern.

  **Must NOT do**:
  - Do NOT add search/filter to the dropdown
  - Do NOT change the preview section layout
  - Do NOT modify the "Manage Library" link behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - Simple UI changes to existing component

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/RubricCard.svelte:80-91` — Current `<select>` dropdown with disabled placeholder. Add a selectable "None" option here.
  - `ogre-desktop/src/components/grading/RubricCard.svelte:44-49` — `handleChange()` function. Extend to handle empty value → `selectedRubric = null`.
  - `ogre-desktop/src/components/grading/RubricCard.svelte:52-55` — `handleManageLibrary()` uses `CustomEvent('ogre:navigate')`. Follow this exact pattern for the refresh event listener.

  **WHY Each Reference Matters**:
  - Lines 80-91 — Exact HTML location to add the "None" option
  - Lines 44-49 — The handler function that maps select value → rubric object. Must handle empty string → null
  - Lines 52-55 — The existing custom event pattern to replicate for refresh

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Deselect option exists and works
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search RubricCard.svelte for an option with value="" that is NOT disabled
      2. Verify the handleChange function handles empty string → null
      3. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Option exists, handler works, types pass
    Failure Indicators: No selectable "None" option, type errors
    Evidence: .sisyphus/evidence/task-2-deselect.txt

  Scenario: Refresh event listener is registered
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search RubricCard.svelte for `ogre:rubric-saved` event listener
      2. Verify the listener calls fetchRubrics()
      3. Verify the listener is cleaned up in onDestroy
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Event listener registered on mount, removed on destroy, triggers refresh
    Failure Indicators: Missing listener, missing cleanup (memory leak)
    Evidence: .sisyphus/evidence/task-2-refresh.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(rubric): add deselect option and refresh event to RubricCard`
  - Files: `ogre-desktop/src/components/grading/RubricCard.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [x] 3. Add SavedRubric→textarea conversion + sourceRubricId tracking to BatchPanel

  **What to do**:
  - Import `criteriaToText` from `../../lib/rubric-utils` in BatchPanel.svelte
  - Add a new state variable: `let sourceRubricId = $state<string | null>(null)` — tracks the library rubric ID currently loaded (null = none/extracted)
  - Create a helper function `loadLibraryRubric(rubric: SavedRubric)` that:
    1. Sets `sourceRubricId = rubric.id`
    2. Converts `rubric.criteria` to text via `criteriaToText(rubric.criteria)` → sets `rubricText`
    3. Sets `rubricMaxScore = String(rubric.maxScore)`
    4. Creates an `extractedRubric` from the SavedRubric: map `criteria` → `checklistItems` format, set `maxScore`
  - Create a helper function `clearLibraryRubric()` that resets `sourceRubricId = null`, clears `rubricText`, clears `extractedRubric`
  - Add `sourceRubricId` reset to `handleReset()` (line 514) and ensure `buildBatchResetState()` in `page-refresh.ts` includes it
  - This task sets up the data plumbing. The actual UI trigger (selecting from dropdown) is Task 4.

  **Must NOT do**:
  - Do NOT add UI elements — that's Task 4 and 5
  - Do NOT modify `handleContinueGrading` — that's Task 6
  - Do NOT modify `handleSaveRubric` — that's Task 5
  - Do NOT write new conversion utilities — use existing `criteriaToText` from `rubric-utils.ts`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Data plumbing with type conversions requires careful attention

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Task 1 (needs selectedRubric prop to exist, though behavior isn't wired yet)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-utils.ts` — `criteriaToText()` function. Read the full file to understand the text format: `"CriteriaName (Npts): Description"` per line. This is the format the textarea will display.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:73-81` — Existing rubric state variables (`rubricText`, `rubricMaxScore`, `extractedRubric`, `sourceRubricId` goes here)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:204-232` — `formatRubricForDisplay()` — understand this format but DO NOT use it for library rubrics. Use `criteriaToText` instead.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:514-523` — `handleReset()` where `sourceRubricId` must be added to the reset

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-16` — `RubricCriterion` interface: `{ criteria, description, points, question? }`
  - `ogre-desktop/src/lib/rubric-api.ts:18-27` — `SavedRubric` interface: `{ id, name, criteria: RubricCriterion[], maxScore, ... }`
  - `ogre-desktop/src/lib/batch-grader.ts:43` — `Rubric` type definition (the batch grader's internal format)
  - `ogre-desktop/src/lib/batch-grader.ts:35-42` — `RubricItem` type (used in `Rubric.checklistItems`)

  **External References**:
  - `ogre-desktop/src/lib/rubric-utils.ts` (full file) — Read `criteriaToText` signature and output format. Also read `textToCriteria` to understand the parsing counterpart (used in Task 5/6).

  **WHY Each Reference Matters**:
  - rubric-utils.ts — The conversion function you MUST use. Don't reinvent.
  - BatchPanel:73-81 — Where to add the new state variable
  - BatchPanel:204-232 — Shows the OLD text format. Library rubrics use the NEW format from criteriaToText instead.
  - batch-grader.ts:43 — The `Rubric` type you need to create from `SavedRubric.criteria[]`
  - batch-grader.ts:35-42 — `RubricItem` shape: `{ category, items: string[], points? }`. Map `RubricCriterion` → `RubricItem`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: loadLibraryRubric correctly converts SavedRubric to textarea text
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte for the `loadLibraryRubric` function definition
      2. Verify it calls `criteriaToText` (imported from rubric-utils)
      3. Verify it sets sourceRubricId, rubricText, rubricMaxScore, and extractedRubric
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Function exists, uses criteriaToText, sets all 4 state variables, types pass
    Failure Indicators: Missing function, manual text formatting instead of criteriaToText, type errors
    Evidence: .sisyphus/evidence/task-3-load-function.txt

  Scenario: sourceRubricId is reset properly
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte for `sourceRubricId` in `handleReset()`
      2. Verify sourceRubricId is set to null in the reset function
      3. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: sourceRubricId cleared on reset, no type errors
    Failure Indicators: sourceRubricId not found in handleReset
    Evidence: .sisyphus/evidence/task-3-reset.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(rubric): add library rubric conversion and sourceRubricId tracking`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [x] 4. Always-visible rubric textarea + library pre-fill on selection

  **What to do**:
  - In `BatchPanel.svelte`, move the "Rubric Review" `<details>` section (lines 604-673) so it is ALWAYS visible — not gated behind `batchPhase === 'review' || batchPhase === 'grading' || batchPhase === 'done'`. Show it in ALL phases including `idle` and `extracting`.
  - Change the section from a collapsible `<details>` to an always-open section when in `idle` phase. Keep the `<details>` collapsible behavior for `review`/`grading`/`done` phases.
  - Add a `$effect` that reacts to `selectedRubric` changes: when `selectedRubric` is set (not null) AND `batchPhase === 'idle'`, call `loadLibraryRubric(selectedRubric)` (from Task 3). When `selectedRubric` becomes null, call `clearLibraryRubric()`.
  - Update the "review hint" text to be context-aware: "Rubric loaded from library: [name]" when a library rubric is active, "Type a rubric or click Start Batch to extract from page" when idle with no rubric, and keep existing hints for post-extraction states.
  - The textarea should be editable in `idle` phase (user can type/paste a rubric manually before extraction).

  **Must NOT do**:
  - Do NOT change the textarea styling or add a rich editor
  - Do NOT add the Save/Update buttons here — that's Task 5
  - Do NOT modify the extraction logic — that's Task 7
  - Do NOT change the grading connection — that's Task 6

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
    - UI restructuring that must maintain visual consistency with the existing design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:604-673` — Current "Rubric Review" section. This entire block needs to be restructured to show in all phases.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:569-602` — "Grading Instructions" `<details>` section. Follow this pattern for the collapsible behavior.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:73-81` — State variables `rubricText`, `rubricMaxScore`, `batchPhase`. Understand which states gate visibility.

  **API/Type References**:
  - Task 3's `loadLibraryRubric()` and `clearLibraryRubric()` functions — call these from the `$effect`

  **WHY Each Reference Matters**:
  - Lines 604-673 — The exact HTML block to restructure. Currently gated by phase checks.
  - Lines 569-602 — The pattern for `<details>` styling to match (same CSS classes, same chevron icon).
  - Lines 73-81 — Understand `batchPhase` to conditionally show open vs collapsible.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rubric textarea visible in idle phase
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte for the rubric textarea element
      2. Verify it is NOT inside a condition that requires batchPhase !== 'idle'
      3. Verify the textarea is editable (no disabled attribute) in idle phase
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Textarea renders in idle phase, is editable, types pass
    Failure Indicators: Textarea still gated behind review/grading/done check
    Evidence: .sisyphus/evidence/task-4-visible.txt

  Scenario: Library rubric selection populates textarea
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte for a `$effect` that references `selectedRubric`
      2. Verify the effect calls `loadLibraryRubric` when selectedRubric is set
      3. Verify the effect calls `clearLibraryRubric` when selectedRubric is null
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: $effect exists, calls correct functions, types pass
    Failure Indicators: No $effect for selectedRubric, wrong function calls
    Evidence: .sisyphus/evidence/task-4-prefill.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(rubric): always-visible rubric textarea with library pre-fill`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [x] 5. Fix save flow + add Update button with hasUnsavedChanges

  **What to do**:
  - **Fix `handleSaveRubric()`** (line 345-368): Replace the lossy conversion with `textToCriteria(rubricText)` from `rubric-utils.ts`. This properly parses "CriteriaName (Npts): Description" format back into `RubricCriterion[]` with correct point values. Import `textToCriteria` from `../../lib/rubric-utils`.
  - **Add `handleUpdateRubric()`**: New function that calls `updateRubric(sourceRubricId!, { ... })` from `rubric-api.ts` to overwrite the loaded library rubric. Use `textToCriteria(rubricText)` for the criteria. Show a `confirm()` dialog: "Update will overwrite '[rubric name]' in library. Continue?"
  - **Add Update button**: In the rubric-actions div (line 637-649), add an "Update [Name]" button that:
    - Only shows when `sourceRubricId !== null`
    - Uses `hasUnsavedChanges()` from rubric-utils.ts to determine if the button should be enabled/highlighted (optional: always show when sourceRubricId is set, highlight when changes detected)
  - **Dispatch refresh event**: After successful save or update, dispatch `window.dispatchEvent(new CustomEvent('ogre:rubric-saved'))` so RubricCard refreshes its list.
  - **Keep "Save as New" always available**: The existing save dialog stays, works alongside Update.

  **Must NOT do**:
  - Do NOT add toast/notification systems — use existing `saveStatus` string
  - Do NOT add more than one confirmation dialog (the Update confirm)
  - Do NOT change the save dialog UI structure (name + tags inputs)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Requires careful wiring of API calls, state management, and event dispatch

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:345-368` — Current `handleSaveRubric()`. This is the BUGGY function to fix. Points are all 0, drops essayPrompt/modelText.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:637-649` — Current rubric-actions div with "Save to Library" button. Add "Update" button here.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:654-671` — Save dialog (name + tags + save/cancel). Keep this, it works.

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-utils.ts` — `textToCriteria(text: string): RubricCriterion[]` — parses the textarea text back to structured criteria. MUST use this.
  - `ogre-desktop/src/lib/rubric-utils.ts` — `hasUnsavedChanges(original, current): boolean` — checks if criteria changed. Use for Update button state.
  - `ogre-desktop/src/lib/rubric-api.ts:60-72` — `updateRubric(id, updates)` — existing API function for updating a library rubric. Use this for the Update flow.

  **External References**:
  - `ogre-desktop/src/lib/rubric-utils.ts` (full file) — Read the complete `textToCriteria` implementation to understand the regex pattern it expects: `"Name (Npts): Description"`. Rubric text MUST be in this format for parsing to work.
  - `ogre-desktop/src/lib/rubric-utils.test.ts` — Read existing tests for `textToCriteria` to understand expected input/output formats.

  **WHY Each Reference Matters**:
  - BatchPanel:345-368 — The buggy function. Fix by replacing `extractedRubric?.checklistItems` mapping with `textToCriteria(rubricText)`.
  - rubric-utils.ts `textToCriteria` — The correct parser. Handles the `criteriaToText` format. Already tested.
  - rubric-utils.ts `hasUnsavedChanges` — Pre-built for exactly this. The JSDoc mentions "Update Library button."
  - rubric-api.ts:60-72 — `updateRubric(id, updates)` — the API call for Update. Already tested.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Save as New preserves point values (bug fix verification)
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte handleSaveRubric for `textToCriteria`
      2. Verify it uses `textToCriteria(rubricText)` NOT `extractedRubric?.checklistItems`
      3. Verify point values come from the parsed criteria, not hardcoded 0
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: handleSaveRubric uses textToCriteria, no hardcoded zero points
    Failure Indicators: Still uses extractedRubric.checklistItems, still has `points: 0`
    Evidence: .sisyphus/evidence/task-5-save-fix.txt

  Scenario: Update button exists and calls updateRubric API
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte for `handleUpdateRubric` function
      2. Verify it calls `updateRubric(sourceRubricId, ...)` from rubric-api
      3. Verify it uses `textToCriteria(rubricText)` for criteria
      4. Verify it dispatches 'ogre:rubric-saved' event on success
      5. Search for the Update button in the template, verify it's gated by sourceRubricId
      6. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Update function and button exist, properly wired, types pass
    Failure Indicators: Missing function, missing event dispatch, button not gated
    Evidence: .sisyphus/evidence/task-5-update.txt

  Scenario: Refresh event dispatched on save/update
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte for `ogre:rubric-saved` dispatch
      2. Verify it appears in BOTH handleSaveRubric and handleUpdateRubric
    Expected Result: Event dispatched in both save paths
    Failure Indicators: Event missing from either function
    Evidence: .sisyphus/evidence/task-5-refresh-event.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(rubric): fix lossy save and add Update button for library rubrics`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [x] 6. Connect textarea edits to grading pipeline

  **What to do**:
  - In `BatchPanel.svelte`, modify `handleContinueGrading()` (line 272-341) to parse the textarea content before grading.
  - At the beginning of the function (after the early returns), add: parse `rubricText` via `textToCriteria(rubricText)` and update `extractedRubric.checklistItems` with the parsed criteria. This ensures any textarea edits are reflected in the actual grading.
  - Specifically, before line 287 (`const rubric = extractedRubric ?? batchGrader.rubric;`), add logic to:
    1. Parse `textToCriteria(rubricText)` → `parsedCriteria`
    2. If `parsedCriteria.length > 0`, update `extractedRubric` (or create one if null) with checklistItems mapped from parsedCriteria
    3. Update `rubric.maxScore = rubricMaxScore` (already done at line 294)
  - This is the critical fix that makes textarea edits non-cosmetic.

  **Must NOT do**:
  - Do NOT change the SSE event handlers or batch progress logic
  - Do NOT modify the rubric data sent to the API beyond the parsed textarea content
  - Do NOT add a "parse" button — parsing happens automatically on "Continue Grading"

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Critical data flow change that connects the edit surface to the grading pipeline

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:272-341` — `handleContinueGrading()` — The exact function to modify. Focus on lines 287-295 where the rubric is consumed.
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:308-334` — The `startBatchGrading()` call showing what rubric fields are sent to the server API. This is the downstream consumer.

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-utils.ts` — `textToCriteria()` — the parser to use. Returns `RubricCriterion[]`.
  - `ogre-desktop/src/lib/batch-grader.ts:35-50` — `RubricItem` and `Rubric` types — understand the shape of `extractedRubric.checklistItems` (it's `RubricItem[]`, not `RubricCriterion[]`). Conversion: `RubricCriterion.criteria → RubricItem.category`, `RubricCriterion.description → RubricItem.items[0]`, `RubricCriterion.points → RubricItem.points`.

  **WHY Each Reference Matters**:
  - BatchPanel:272-341 — THE function to modify. Currently uses `extractedRubric` directly, ignoring textarea.
  - BatchPanel:308-334 — Shows what the API expects. Verifies the conversion output shape is correct.
  - rubric-utils.ts textToCriteria — The parser that makes textarea edits meaningful.
  - batch-grader.ts:35-50 — The target type (`RubricItem`) that `RubricCriterion` must be mapped to.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: handleContinueGrading parses textarea before grading
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search BatchPanel.svelte handleContinueGrading for `textToCriteria`
      2. Verify textToCriteria(rubricText) is called BEFORE the rubric is consumed
      3. Verify the parsed criteria are mapped to the extractedRubric's checklistItems format
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: textToCriteria called in handleContinueGrading, results applied to extractedRubric
    Failure Indicators: No textToCriteria call, or called after rubric is consumed
    Evidence: .sisyphus/evidence/task-6-grading-parse.txt

  Scenario: Textarea edits with no library rubric still work
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Verify handleContinueGrading handles the case where extractedRubric is null but rubricText has content
      2. Verify a new Rubric object is created from the parsed textarea in this case
      3. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Manual textarea content (no library, no extraction) is still parsed and used for grading
    Failure Indicators: Null reference error when extractedRubric is null, or rubricText ignored
    Evidence: .sisyphus/evidence/task-6-manual-text.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(rubric): connect textarea edits to grading pipeline via textToCriteria`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [ ] 7. Handle extraction vs library rubric interaction + edge cases

  **What to do**:
  - In `BatchPanel.svelte`, modify `handleExtract()` (line 235-269) to handle the case where a library rubric is already loaded:
    - If extraction succeeds AND a library rubric was loaded (`sourceRubricId !== null`): overwrite the textarea with the extracted rubric (using `formatRubricForDisplay`). Set `sourceRubricId = null` (extraction replaces library rubric). This is the agreed behavior.
    - If extraction FAILS (no rubric found) AND a library rubric was loaded: PRESERVE the library rubric. Don't overwrite `rubricText` with "(Could not extract rubric from page)". Instead keep the library content and show a message like "No rubric found on page. Using loaded library rubric."
  - Handle the "deselect" edge case: when the user selects "None" in RubricCard during `idle` phase, clear `rubricText`, `extractedRubric`, and `sourceRubricId`.
  - Handle page navigation: verify that `buildBatchResetState()` in `page-refresh.ts` properly returns a `sourceRubricId: null` field. If `buildBatchResetState` is in a separate file, add the field there. If it's inline, update accordingly.
  - Handle the edge case where the textarea is empty when "Continue Grading" is clicked: show `batchError = 'No rubric text. Load a rubric from the library or type one manually.'` and return early.

  **Must NOT do**:
  - Do NOT implement merge logic between library and extracted rubrics
  - Do NOT add more than one warning/confirmation dialog
  - Do NOT change the extraction logic itself (how it reads the page DOM)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Edge case handling requires careful state management

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:235-269` — `handleExtract()` — the extraction function to modify for library rubric interaction
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:151-177` — `$effect` on page navigation that calls `buildBatchResetState()`. Verify `sourceRubricId` is included.
  - `ogre-desktop/src/lib/page-refresh.ts` — `buildBatchResetState()` function. Read this file to understand the reset state shape and add `sourceRubricId: null`.

  **WHY Each Reference Matters**:
  - BatchPanel:235-269 — The extraction flow that must gracefully handle pre-loaded library rubrics
  - BatchPanel:151-177 — The page navigation effect that resets state. Must include sourceRubricId.
  - page-refresh.ts — The reset state factory. Must return sourceRubricId to prevent stale state.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Extraction replaces library rubric when extraction succeeds
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search handleExtract in BatchPanel.svelte
      2. Verify that when rubric is found AND sourceRubricId is not null, sourceRubricId is set to null
      3. Verify rubricText is overwritten with the extracted rubric
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: sourceRubricId cleared on successful extraction, textarea overwritten
    Failure Indicators: sourceRubricId preserved after extraction, or library content preserved
    Evidence: .sisyphus/evidence/task-7-extract-replaces.txt

  Scenario: Library rubric preserved when extraction fails
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search handleExtract for the case where rubric is null/empty
      2. Verify that when extraction fails AND sourceRubricId is set, rubricText is NOT overwritten
      3. Verify a message indicates extraction failed but library rubric is active
      4. Run `cd ogre-desktop && npx tsc --noEmit`
    Expected Result: Library rubric preserved on extraction failure
    Failure Indicators: rubricText overwritten with error message despite loaded library rubric
    Evidence: .sisyphus/evidence/task-7-extract-fails.txt

  Scenario: Empty textarea prevented from grading
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search handleContinueGrading for empty rubricText check
      2. Verify it sets batchError and returns early when rubricText is empty/whitespace
    Expected Result: Early return with error message when textarea is empty
    Failure Indicators: Grading proceeds with empty rubric
    Evidence: .sisyphus/evidence/task-7-empty-textarea.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(rubric): handle extraction/library interaction and edge cases`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`, `ogre-desktop/src/lib/page-refresh.ts`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

- [ ] 8. Add vitest tests for new conversion paths + round-trip fidelity

  **What to do**:
  - In `ogre-desktop/src/lib/rubric-utils.test.ts`, add new test cases:
    1. **SavedRubric→text→SavedRubric round-trip**: Create a SavedRubric with 3 criteria (with names, descriptions, various point values). Convert to text via `criteriaToText()`, then parse back via `textToCriteria()`. Assert all criteria names, descriptions, and point values are preserved.
    2. **Empty/edge cases**: Test `criteriaToText([])` → empty string. Test `textToCriteria('')` → empty array. Test `textToCriteria('random text without format')` → empty array (no parseable criteria).
    3. **hasUnsavedChanges correctness**: Test that `hasUnsavedChanges(original, modified)` returns true when point values differ, false when identical.
  - Run `cd ogre-desktop && npx vitest run rubric-utils` to verify all tests pass.

  **Must NOT do**:
  - Do NOT modify the rubric-utils.ts source file — only add tests
  - Do NOT add component tests for BatchPanel (that's covered by QA scenarios)
  - Do NOT add tests that require a running grading server

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Test writing for existing utility functions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/rubric-utils.test.ts` — Existing test file. Read the ENTIRE file to understand test structure, describe blocks, assertion patterns, and existing test data.
  - `ogre-desktop/src/lib/rubric-utils.ts` — The source being tested. Read `criteriaToText`, `textToCriteria`, `hasUnsavedChanges` signatures and implementations.

  **API/Type References**:
  - `ogre-desktop/src/lib/rubric-api.ts:11-16` — `RubricCriterion` interface — the type for test data construction

  **WHY Each Reference Matters**:
  - rubric-utils.test.ts — Follow existing test patterns exactly. Don't introduce new assertion libraries or testing patterns.
  - rubric-utils.ts — Understand what each function does to write accurate assertions.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: ogre-desktop has node_modules installed
    Steps:
      1. Run `cd ogre-desktop && npx vitest run rubric-utils`
      2. Verify exit code is 0
      3. Verify the output shows the new test descriptions passing
    Expected Result: All tests pass including new round-trip and edge case tests
    Failure Indicators: Test failures, exit code non-zero
    Evidence: .sisyphus/evidence/task-8-tests.txt

  Scenario: Round-trip fidelity test exists and passes
    Tool: Bash
    Preconditions: ogre-desktop compiles
    Steps:
      1. Search rubric-utils.test.ts for "round-trip" or "round trip" test
      2. Verify it creates criteria with varying point values (not all same)
      3. Verify it asserts point values are preserved (not all 0)
      4. Run `cd ogre-desktop && npx vitest run rubric-utils`
    Expected Result: Round-trip test exists and passes with correct point values
    Failure Indicators: No round-trip test, or points are 0 after round-trip
    Evidence: .sisyphus/evidence/task-8-roundtrip.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(rubric): add round-trip and edge case tests for rubric-utils`
  - Files: `ogre-desktop/src/lib/rubric-utils.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run rubric-utils`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start the desktop app. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (load rubric → edit → grade → save → verify). Test edge cases: empty textarea, deselect rubric, page navigation during edit.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(rubric): wire selectedRubric prop and add RubricCard deselect + refresh` — RubricCard.svelte, GradingPanel.svelte, BatchPanel.svelte (prop only)
- **Wave 2**: `feat(rubric): always-visible textarea with library import, update flow, and grading connection` — BatchPanel.svelte
- **Wave 3**: `feat(rubric): handle extraction/library interaction and add round-trip tests` — BatchPanel.svelte, rubric-utils.test.ts
- Pre-commit for all: `cd ogre-desktop && npx tsc --noEmit && npx vitest run`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx tsc --noEmit        # Expected: no errors
cd ogre-desktop && npx vitest run           # Expected: all tests pass
cd ogre-desktop && npx vitest run rubric-utils  # Expected: all round-trip tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Library rubric → batch textarea → grade → save round-trip works end-to-end
- [ ] Point values preserved through save/load cycle (no more all-zero bug)
