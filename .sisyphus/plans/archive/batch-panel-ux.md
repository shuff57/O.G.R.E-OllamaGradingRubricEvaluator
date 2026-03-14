# Batch Panel UX Enhancements

## TL;DR

> **Quick Summary**: Three focused UX improvements to the batch grader: auto-extract rubric on page load, convert grading instruction checkboxes to toggle buttons that populate the textarea, and add a stop/cancel button across all active batch phases.
> 
> **Deliverables**:
> - Auto-rubric extraction on page load (no manual "Start Batch" needed to see rubric)
> - Toggle-style instruction buttons that append/remove preset text in the instructions textarea
> - Stop/Cancel button visible during extracting, review, and grading phases
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (toggle buttons) → Task 3 (auto-pull, uses stop infra from Task 2)

---

## Context

### Original Request
User wants three enhancements to the batch grader panel:
1. Auto-pull rubric/question text into the textarea on page load
2. Convert grading instruction checkboxes to toggle buttons that load instructions into the textarea
3. Add a stop button visible after clicking Start Batch (all active phases)

### Interview Summary
**Key Discussions**:
- Auto-pull timing: On page load, auto-extract as soon as grading page loads in embedded browser
- Button behavior: Toggle append/remove — clicking appends preset text, clicking again removes it, multiple can be active
- Stop button scope: All active phases (extracting, review, grading)

**Research Findings**:
- `extractRubric(selectors)` is a standalone exported function in `batch-grader.ts:277` — can be called independently of `BatchGrader.start()`
- `doRefreshPageData()` already runs on page load but only detects profile + saved session, NOT rubric
- Existing `.btn-preset` CSS styles in BatchPanel (lines 1119-1155) are defined but UNUSED — ready to reuse
- `handleContinueGrading()` lines 391-395 separately injects preset booleans — must be updated to avoid double-adding

### Metis Review
**Identified Gaps** (addressed):
- Auto-extraction can overwrite library rubric selection → guarded with `sourceRubricId` check
- `extractRubric()` throws on non-grading pages → wrapped in try/catch with silent failure
- Preset text removal fragility when user manually edits → derive toggle state from `.includes()` check
- No AbortController for extraction cancel → use cancellation flag pattern
- `handleStopBatch()` always returns to `review` → made phase-aware (extracting → idle)
- `handleContinueGrading()` double-adds presets if text is in textarea AND booleans checked → textarea becomes single source of truth

---

## Work Objectives

### Core Objective
Improve the batch grader UX by making rubric data instantly visible, grading instructions more interactive, and providing escape-hatch controls at all times.

### Concrete Deliverables
- Modified `BatchPanel.svelte`: toggle buttons replacing checkboxes, stop button in all active phases, auto-extraction effect
- Modified `handleContinueGrading()`: reads instructions only from textarea (single source of truth)

### Definition of Done
- [x] Rubric textarea auto-populates when a grading page loads (without clicking Start Batch)
- [x] Grading Instructions section has toggle buttons instead of checkboxes
- [x] Clicking a toggle button appends/removes its preset text in the instructions textarea
- [x] Stop/Cancel button is visible during extracting, review, and grading phases
- [x] `npm run build` passes with zero errors

### Must Have
- Toggle buttons must support multiple active simultaneously
- Auto-extraction must silently fail on non-grading pages (no error messages)
- Auto-extraction must NOT overwrite a library-selected rubric
- Stop during extraction must reset to `idle` phase (not `review`)

### Must NOT Have (Guardrails)
- No new files or modules
- No changes to `batch-grader.ts` engine logic
- No changes to `RubricCard.svelte` (its tiered logic already works correctly)
- No changes to `GradingPanel.svelte` component hierarchy or props
- No mutual exclusivity between Lenient and Strict buttons (not requested)
- No loading spinners or new phase states for auto-extraction
- No unit tests for Svelte UI (QA via build verification + visual spot-check)
- No changes to the PRESETS text content

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (Svelte UI changes, no unit-testable logic)
- **Framework**: N/A

### QA Policy
Every task includes build verification (`npm run build`) and DOM-structure assertions.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build**: Use Bash — `npm run build` in ogre-desktop/
- **Type check**: Use Bash — `npx svelte-check` in ogre-desktop/
- **DOM structure**: Use Grep to verify expected markup patterns in compiled output or source

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent UI changes):
├── Task 1: Convert instruction checkboxes to toggle buttons [quick]
├── Task 2: Add stop/cancel button to all active phases [quick]

Wave 2 (After Wave 1 — depends on stop infrastructure):
├── Task 3: Auto-extract rubric on page load [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Build verification + scope fidelity check [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | F1     |
| 2    | —         | 3, F1  |
| 3    | 2         | F1     |
| F1   | 1, 2, 3   | —      |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 1 task — T3 → `quick`
- **FINAL**: 1 task — F1 → `quick`

---

## TODOs


 [x] 1. Convert Grading Instruction Checkboxes to Toggle Buttons

  **What to do**:
  - In `BatchPanel.svelte`, replace the three `<label class="preset-label">` + `<input type="checkbox">` elements (lines 703-727) with `<button class="btn-preset">` toggle buttons.
  - Remove the `isNonZeroOnly`, `isLenient`, `isStrict` boolean `$state` variables (lines 84-86). These are no longer needed as separate state.
  - Instead, derive active state from the textarea content: each button is "active" when `customInstructions.includes(PRESETS.xxx)` is true. Use `$derived` for this:
    ```ts
    let isNonZeroActive = $derived(customInstructions.includes(PRESETS.nonZero));
    let isLenientActive = $derived(customInstructions.includes(PRESETS.lenient));
    let isStrictActive = $derived(customInstructions.includes(PRESETS.strict));
    ```
  - Create a toggle handler function:
    ```ts
    function togglePreset(key: 'nonZero' | 'lenient' | 'strict') {
      const text = PRESETS[key];
      if (customInstructions.includes(text)) {
        customInstructions = customInstructions.replace(text, '').replace(/\n{3,}/g, '\n\n').trim();
      } else {
        customInstructions = customInstructions.trim()
          ? customInstructions.trim() + '\n\n' + text
          : text;
      }
    }
    ```
  - Replace the checkbox markup with buttons using the existing `.btn-preset` CSS class (already defined at lines 1119-1155 but currently unused):
    ```svelte
    <div class="preset-buttons">
      <button class="btn-preset" class:active={isNonZeroActive}
        onclick={() => togglePreset('nonZero')} disabled={isBatchRunning}>
        Non-Zero Only
      </button>
      <button class="btn-preset" class:active={isLenientActive}
        onclick={() => togglePreset('lenient')} disabled={isBatchRunning}>
        Lenient
      </button>
      <button class="btn-preset" class:active={isStrictActive}
        onclick={() => togglePreset('strict')} disabled={isBatchRunning}>
        Strict
      </button>
    </div>
    ```
  - **CRITICAL**: Update `handleContinueGrading()` (lines 391-395) to ONLY read from `customInstructions`. Remove the separate boolean checks that append PRESETS text. The textarea is now the single source of truth:
    ```ts
    // BEFORE (remove this):
    // if (isNonZeroOnly) instructionsParts.push(PRESETS.nonZero);
    // if (isLenient) instructionsParts.push(PRESETS.lenient);
    // if (isStrict) instructionsParts.push(PRESETS.strict);
    
    // AFTER (just use customInstructions directly):
    const instructionsParts = [];
    if (customInstructions.trim()) instructionsParts.push(customInstructions.trim());
    ```
  - Remove the `.preset-checkboxes` and `.preset-label` CSS rules (lines 1157-1180) — they are no longer needed.

  **Must NOT do**:
  - Do NOT change the `PRESETS` object text content
  - Do NOT make Lenient and Strict mutually exclusive
  - Do NOT modify RubricCard.svelte
  - Do NOT add new state variables for toggle tracking — derive from `customInstructions.includes()`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
    - No special skills needed — straightforward Svelte template + script changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:77-86` — PRESETS object and current boolean states to replace
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:702-727` — Current checkbox markup to replace
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:391-395` — `handleContinueGrading()` preset injection to update
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1119-1155` — Existing `.btn-preset` CSS styles to reuse (currently unused in markup)

  **WHY Each Reference Matters**:
  - Lines 77-86: Contains PRESETS text and the boolean states (`isNonZeroOnly`, etc.) that must be removed and replaced with `$derived` from textarea content
  - Lines 702-727: The checkbox HTML that gets replaced with `<button class="btn-preset">` elements
  - Lines 391-395: The grading function that double-adds presets — must be simplified to only read `customInstructions`
  - Lines 1119-1155: Ready-made CSS for toggle buttons including `.active` state — just wire up the markup

  **Acceptance Criteria**:

  - [ ] No `<input type="checkbox">` elements in the Grading Instructions section
  - [ ] Three `<button class="btn-preset">` elements exist with labels "Non-Zero Only", "Lenient", "Strict"
  - [ ] `isNonZeroOnly`, `isLenient`, `isStrict` boolean `$state` variables are removed
  - [ ] `handleContinueGrading()` only reads `customInstructions`, does not reference preset booleans
  - [ ] `npm run build` passes in `ogre-desktop/`

  **QA Scenarios:**

  ```
  Scenario: Toggle button appends preset text to textarea
    Tool: Grep (source verification)
    Preconditions: BatchPanel.svelte saved with changes
    Steps:
      1. Grep for 'btn-preset' in BatchPanel.svelte — expect 3+ matches (the buttons)
      2. Grep for 'togglePreset' in BatchPanel.svelte — expect function definition + 3 onclick references
      3. Grep for 'isNonZeroOnly' in BatchPanel.svelte — expect 0 matches (removed)
      4. Grep for 'isLenient' in BatchPanel.svelte — expect 0 matches (removed)
      5. Grep for 'isStrict' in BatchPanel.svelte — expect 0 matches (removed)
    Expected Result: Toggle button markup present, old checkbox booleans fully removed
    Evidence: .sisyphus/evidence/task-1-toggle-buttons-grep.txt

  Scenario: handleContinueGrading uses textarea only
    Tool: Grep (source verification)
    Preconditions: BatchPanel.svelte saved with changes
    Steps:
      1. Grep for 'PRESETS.nonZero' in handleContinueGrading — should NOT appear in the instruction-building block
      2. Grep for 'customInstructions.trim()' in handleContinueGrading — should be the only instruction source
    Expected Result: No preset boolean references in grading function
    Evidence: .sisyphus/evidence/task-1-grading-func-grep.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run `npm run build` in ogre-desktop/
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES
  - Message: `feat(batch): convert instruction checkboxes to toggle buttons`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

 [x] 2. Add Stop/Cancel Button to All Active Phases

  **What to do**:
  - In `BatchPanel.svelte`, create a new phase-aware stop handler that resets to the correct phase:
    ```ts
    function handleCancelBatch() {
      // Clean up any pending review
      if (reviewResolve) {
        reviewResolve({ action: 'skip' });
        pendingReview = null;
        reviewResolve = null;
      }
      if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
      if (batchGrader) { batchGrader.stop(); batchGrader = null; }
      stopTimer();
      isBatchRunning = false;
      isBatchPaused = false;
      currentStudentName = '';
      phaseMessage = '';
      pausedResultBuffer = [];
      batchError = '';
      // Phase-aware reset: extracting/review go to idle, grading goes to review
      if (batchPhase === 'grading') {
        batchPhase = 'review';
      } else {
        batchPhase = 'idle';
      }
      updateBatchState();
    }
    ```
  - Add a cancellation flag for extraction. At the top of the script, add:
    ```ts
    let extractionCancelled = false;
    ```
  - In `handleExtract()`, set `extractionCancelled = false` at the start and check after each await:
    ```ts
    async function handleExtract() {
      extractionCancelled = false;
      // ... existing setup ...
      try {
        batchGrader = new BatchGrader();
        await batchGrader.start(activeProfile, resumeAfter || null);
        if (extractionCancelled) return; // User hit stop
        // ... rest of extraction logic ...
      }
    }
    ```
  - In `handleCancelBatch()`, also set `extractionCancelled = true`.
  - Update the footer template (lines 942-994) to show a Stop/Cancel button during ALL active phases. Replace the existing conditional rendering with:
    ```svelte
    {#if batchPhase === 'idle' && !savedSessionStudent}
      <!-- existing Start Batch / Discover logic unchanged -->
    {:else if batchPhase === 'extracting'}
      <button class="btn-danger full-width" onclick={handleCancelBatch}>
        Cancel
      </button>
    {:else if batchPhase === 'grading' && isBatchRunning}
      <div class="batch-controls">
        <button class="btn-secondary" onclick={handlePauseBatch}>
          {isBatchPaused ? 'Resume' : 'Pause'}
        </button>
        <button class="btn-danger" onclick={handleCancelBatch}>
          Stop
        </button>
      </div>
    {:else if batchPhase === 'done'}
      <button class="btn-secondary full-width" onclick={handleReset}>
        New Batch
      </button>
    {:else if batchPhase === 'review'}
      <div class="batch-controls">
        <button class="btn-secondary" onclick={handleCancelBatch}>
          Cancel
        </button>
        <button class="btn-primary"
          onclick={handleContinueGrading}
          disabled={!batchGrader || batchGrader.studentsToGrade.length === 0}>
          Start Grading
        </button>
      </div>
    {/if}
    ```
  - Keep the existing `handleStopBatch()` as-is (it's referenced by the Stop button during grading). The new `handleCancelBatch()` adds phase-aware behavior and the extraction cancellation flag.

  **Must NOT do**:
  - Do NOT add AbortController to `extractRubric()` or `evalScriptJSON()` — they don't support it
  - Do NOT show stop button during `done` or `idle` phases
  - Do NOT modify `handleStopBatch()` — create the new `handleCancelBatch()` alongside it, or refactor `handleStopBatch()` to be phase-aware (either approach is fine)
  - Do NOT add loading spinners or new phase states

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, F1
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:570-587` — Existing `handleStopBatch()` cleanup pattern to follow
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:605-618` — `handleReset()` for reference on idle reset
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:288-331` — `handleExtract()` where cancellation flag check goes
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:942-994` — Footer template with current phase conditionals to modify

  **WHY Each Reference Matters**:
  - Lines 570-587: Shows the cleanup pattern (cancel handle, stop grader, reset state) that `handleCancelBatch()` must replicate plus phase-awareness
  - Lines 605-618: Shows how `handleReset()` returns to idle — demonstrates what extracting/review cancel should do
  - Lines 288-331: The async extraction flow where `extractionCancelled` flag must be checked after awaits
  - Lines 942-994: The footer rendering — shows exactly which `{#if}` blocks to modify for new button placement

  **Acceptance Criteria**:

  - [ ] A "Cancel" button is visible and clickable during `batchPhase === 'extracting'`
  - [ ] A "Cancel" button is visible during `batchPhase === 'review'` (alongside "Start Grading")
  - [ ] Existing "Pause" + "Stop" buttons remain during `batchPhase === 'grading'`
  - [ ] Clicking Cancel during extracting resets `batchPhase` to `'idle'` (not `'review'`)
  - [ ] `npm run build` passes in `ogre-desktop/`

  **QA Scenarios:**

  ```
  Scenario: Cancel button exists in extracting phase template
    Tool: Grep (source verification)
    Preconditions: BatchPanel.svelte saved with changes
    Steps:
      1. Grep for 'handleCancelBatch' in BatchPanel.svelte — expect function definition + 3 onclick references (extracting, review, grading)
      2. Grep for 'extractionCancelled' in BatchPanel.svelte — expect flag declaration + set to true in cancel + set to false in extract + check after await
      3. Search for 'batchPhase === .extracting.' in the template section — verify a btn-danger element nearby
    Expected Result: Cancel/stop button wired to all active phases
    Evidence: .sisyphus/evidence/task-2-stop-button-grep.txt

  Scenario: Phase-aware reset logic is correct
    Tool: Grep (source verification)
    Steps:
      1. Read `handleCancelBatch` function body
      2. Verify it contains phase-conditional: extracting/review → 'idle', grading → 'review'
    Expected Result: Phase-aware branching present
    Evidence: .sisyphus/evidence/task-2-phase-logic.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run `npm run build` in ogre-desktop/
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES
  - Message: `feat(batch): add stop/cancel button to all active phases`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

 [x] 3. Auto-Extract Rubric on Page Load

  **What to do**:
  - In `BatchPanel.svelte`, add a new async function `autoExtractRubric()` that extracts rubric data from the page without creating a full `BatchGrader` instance:
    ```ts
    import { extractRubric, extractPageContent, isRubricSufficient } from '../../lib/batch-grader';
    // (extractRubric and extractPageContent are already importable — add them to the existing import)
    
    async function autoExtractRubric() {
      // Guard: don't extract if batch is active or library rubric is selected
      if (batchPhase !== 'idle') return;
      if (sourceRubricId !== null) return;
      
      try {
        const rubric = await extractRubric(activeProfile.selectors);
        if (extractionCancelled) return;
        if (isRubricSufficient(rubric)) {
          extractedRubric = rubric;
          rubricText = formatRubricForDisplay(rubric);
          rubricMaxScore = rubric.maxScore || '10';
          essayPrompt = rubric.essayPrompt || '';
        } else {
          // Rubric not sufficient — try fallback page content extraction
          const pageContent = await extractPageContent();
          if (pageContent.content) {
            essayPrompt = pageContent.content;
            // Don't set rubricText — let RubricCard's Tier 3 handle it via fallbackText
          }
        }
      } catch {
        // Silent failure — page is not a grading page or selectors don't match
        // Try extractPageContent as fallback
        try {
          const pageContent = await extractPageContent();
          if (pageContent.content) {
            essayPrompt = pageContent.content;
          }
        } catch {
          // Completely silent — nothing to extract
        }
      }
    }
    ```
  - Add a new `$effect` that triggers auto-extraction after profile detection completes. Place it AFTER the existing `doRefreshPageData()` effects (after line 234). This effect should watch `detectedProfile` and `currentPageUrl`:
    ```ts
    // Auto-extract rubric when a page loads (after profile detection)
    $effect(() => {
      const profile = detectedProfile;
      const url = currentPageUrl;
      if (!profile || !url) return;
      // Only auto-extract when idle and no library rubric selected
      if (batchPhase !== 'idle') return;
      if (sourceRubricId !== null) return;
      autoExtractRubric();
    });
    ```
  - Update the existing import from `batch-grader` (line 14) to also import `extractRubric`, `extractPageContent`, and `isRubricSufficient`:
    ```ts
    import {
      BatchGrader,
      DEFAULT_MYOPENMATH_PROFILE,
      CANVAS_SPEEDGRADER_PROFILE,
      BUILT_IN_PROFILES,
      detectProfile,
      extractRubric,
      extractPageContent,
      isRubricSufficient,
    } from '../../lib/batch-grader';
    ```
  - In the existing `$effect` that watches `pageLoadedUrl` (lines 200-227), after the auto-stop block resets state, the new auto-extract effect will naturally re-fire because `detectedProfile` and `currentPageUrl` change. No additional wiring needed.

  **Must NOT do**:
  - Do NOT create a `BatchGrader` instance for auto-extraction — use standalone `extractRubric()` directly
  - Do NOT set `batchPhase` during auto-extraction — it's a background operation, phase stays `idle`
  - Do NOT show errors or spinners during auto-extraction
  - Do NOT overwrite rubricText if `sourceRubricId !== null` (library rubric selected)
  - Do NOT modify `doRefreshPageData()` — add a SEPARATE effect
  - Do NOT modify `GradingPanel.svelte` or `RubricCard.svelte`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1
  - **Blocked By**: Task 2 (uses `extractionCancelled` flag from Task 2)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:277-343` — Standalone `extractRubric(selectors)` function to call
  - `ogre-desktop/src/lib/batch-grader.ts:358-454` — `extractPageContent()` fallback for non-rubric pages
  - `ogre-desktop/src/lib/batch-grader.ts:469-475` — `isRubricSufficient(rubric)` helper to check extraction quality
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:200-234` — Existing `$effect` patterns for page load triggers
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:256-284` — `formatRubricForDisplay()` function already exists
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:288-331` — `handleExtract()` shows how rubric data flows to state after extraction

  **WHY Each Reference Matters**:
  - batch-grader.ts 277-343: The standalone extraction function — call this directly with `activeProfile.selectors`, no BatchGrader needed
  - batch-grader.ts 358-454: Fallback when formal rubric extraction fails — catches pages with content but no formal rubric structure
  - batch-grader.ts 469-475: Determines if extracted rubric has enough data to be useful — prevents setting empty rubric text
  - BatchPanel 200-234: Shows the existing `$effect` on `pageLoadedUrl` pattern — new effect should follow same structure
  - BatchPanel 256-284: Reuse this function to convert rubric object to display text (same as handleExtract uses)
  - BatchPanel 288-331: Shows the exact state assignments (extractedRubric, rubricText, rubricMaxScore, essayPrompt) to replicate

  **Acceptance Criteria**:

  - [ ] `autoExtractRubric()` function exists in BatchPanel.svelte
  - [ ] `$effect` watching `detectedProfile` and `currentPageUrl` triggers auto-extraction
  - [ ] Auto-extraction is guarded by `batchPhase === 'idle'` and `sourceRubricId === null`
  - [ ] `extractRubric`, `extractPageContent`, `isRubricSufficient` are imported from batch-grader
  - [ ] Silent failure: no `batchError` set, no phase changes, no spinners
  - [ ] `npm run build` passes in `ogre-desktop/`

  **QA Scenarios:**

  ```
  Scenario: Auto-extraction function and effect exist
    Tool: Grep (source verification)
    Preconditions: BatchPanel.svelte saved with changes
    Steps:
      1. Grep for 'autoExtractRubric' in BatchPanel.svelte — expect function definition + call in $effect
      2. Grep for 'extractRubric' in BatchPanel.svelte import section — expect it in the import list from batch-grader
      3. Grep for 'extractPageContent' in BatchPanel.svelte — expect import + usage in autoExtractRubric
      4. Grep for 'isRubricSufficient' in BatchPanel.svelte — expect import + usage in autoExtractRubric
    Expected Result: All auto-extraction code present and properly imported
    Evidence: .sisyphus/evidence/task-3-auto-extract-grep.txt

  Scenario: Guards prevent overwrite of library rubric
    Tool: Grep (source verification)
    Steps:
      1. Read `autoExtractRubric` function body
      2. Verify it contains `if (sourceRubricId !== null) return;` guard
      3. Verify it contains `if (batchPhase !== 'idle') return;` guard
    Expected Result: Both guards present in function body
    Evidence: .sisyphus/evidence/task-3-guards.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run `npm run build` in ogre-desktop/
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES
  - Message: `feat(batch): auto-extract rubric on page load`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`
---

## Final Verification Wave

 [x] F1. **Build + Scope Fidelity Check** — `quick`
  Run `npm run build` in `ogre-desktop/`. Verify zero errors. Run `npx svelte-check` for type errors.
  Then read `BatchPanel.svelte` and verify:
  1. No `<input type="checkbox">` elements remain in the Grading Instructions section
  2. Stop/cancel button markup exists in extracting and review phase conditionals
  3. Auto-extraction `$effect` exists and is guarded by `batchPhase === 'idle'` and `sourceRubricId === null`
  4. `handleContinueGrading()` does NOT reference `isNonZeroOnly`, `isLenient`, or `isStrict` booleans
  5. No files outside `BatchPanel.svelte` were modified (scope fidelity)
  Output: `Build [PASS/FAIL] | TypeCheck [PASS/FAIL] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **1**: `feat(batch): convert instruction checkboxes to toggle buttons` — BatchPanel.svelte
- **2**: `feat(batch): add stop/cancel button to all active phases` — BatchPanel.svelte
- **3**: `feat(batch): auto-extract rubric on page load` — BatchPanel.svelte
- **Final**: `chore: verify build passes after batch panel UX changes` — (no files, verification only)

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build   # Expected: zero errors, successful build
cd ogre-desktop && npx svelte-check # Expected: zero errors
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Build passes cleanly
