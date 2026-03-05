# Review Mode: Editable Score & Feedback Override

## TL;DR

> **Quick Summary**: Add editable score and feedback fields to the batch grader's review mode so the user can override AI-generated grades before they're applied. The original AI ("auto") score is shown as a read-only label for reference.
> 
> **Deliverables**:
> - Editable score input (number) in review panel, pre-filled with AI score
> - Editable feedback textarea in review panel, pre-filled with AI feedback
> - Read-only "Auto: X/Y" label showing original AI score
> - Edited values flow through to `applyGrade()` on Approve
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single task
> **Critical Path**: Task 1 (only task)

---

## Context

### Original Request
User wants to edit and override score and feedback in the batch grader's review mode before grades are applied to the page. The Auto fill mode stays unchanged.

### Interview Summary
**Key Discussions**:
- "auto stays the same" — the Auto/Review toggle behavior is unchanged; only Review mode gets editing capability
- Currently review mode is approve/skip only — no way to modify AI grades

**Research Findings**:
- `BatchPanel.svelte` lines 1294-1311: Review panel renders score as read-only `<span>` and feedback as read-only `<div>`
- `reviewResolve` callback (line 119): resolves with only `{ action: 'approve' | 'skip' }` — no room for edited values
- `applyResult` (line 623): passes original `result.score` and `result.feedback` to `applyGrade()` regardless of review
- `applyGrade()` in `batch-grader.ts` (line 1479) already accepts `(studentIndex, score, feedback)` — no backend changes needed
- `handleApprove` (line 901-904) sets `pendingReview = null` immediately after resolving — edited values must be captured BEFORE nulling

### Metis Review
**Identified Gaps** (addressed):
- Score validation bounds: clamp to `[0, maxScore]` on approve
- `pendingReview` is nulled before `applyResult` can read it: resolution object must carry values (Option A)
- Need `autoScore` field on `ReviewData` to preserve original AI score since `pendingReview.score` will be mutated by input binding
- Empty feedback is acceptable (consistent with "Non-Zero Only" preset behavior)
- Decimal scores: use `step="0.5"` on number input
- Outlier adjustments also go through review gate — this is correct/expected behavior

---

## Work Objectives

### Core Objective
Make the review panel's score and feedback editable so the user can override AI grades before they're applied to the grading page.

### Concrete Deliverables
- Modified `ogre-desktop/src/components/grading/BatchPanel.svelte` with editable review panel

### Definition of Done
- [x] `npm run build` in `ogre-desktop/` succeeds
- [x] Review mode shows editable score input + feedback textarea + "Auto: X/Y" label
- [x] Edited values are what get applied to the page on Approve
- [x] Skip still skips entirely regardless of edits
- [x] Auto mode is completely unchanged

### Must Have
- Editable number input for score, pre-filled with AI score
- Editable textarea for feedback, pre-filled with AI feedback
- Read-only "Auto: X/Y" label showing original AI score
- Score clamped to [0, maxScore] on approve
- Decimal score support (step 0.5)

### Must NOT Have (Guardrails)
- NO changes to `batch-grader.ts` — only `BatchPanel.svelte`
- NO changes to Auto mode behavior (line 1048 auto-continue effect)
- NO new Svelte component files
- NO undo/revert buttons
- NO keyboard shortcuts for approve/skip
- NO rich text editor for feedback
- NO analytics/tracking of which scores were edited
- NO "Reset to Auto" button per field

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — This is a pure UI interaction change within a single Svelte component's template and handlers. The logic changes are minimal (adding fields to a resolution object, clamping). Build + type-check verification is sufficient.

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build verification**: `npm run build` in `ogre-desktop/`
- **Type checking**: `npx svelte-check` in `ogre-desktop/`

---

## Execution Strategy

### Single Task (No Parallelism Needed)

This is a single-file, single-concern change. One task, one wave.

```
Wave 1:
└── Task 1: Add editable score/feedback to review panel [quick]

Wave FINAL:
└── Task F1: Build + type-check verification [quick]
```

### Agent Dispatch Summary
- **Wave 1**: 1 task — T1 → `quick`
- **FINAL**: 1 task — F1 → `quick`

---

## TODOs

- [x] 1. Add editable score and feedback override to review panel

  **What to do**:

  **Step A — Expand `ReviewData` type** (line 109-117):
  Add `autoScore: number` field to preserve the original AI score before input binding mutates `score`:
  ```typescript
  type ReviewData = {
    studentIndex: number;
    score: number;       // editable — bound to input
    autoScore: number;   // original AI score — read-only label
    feedback: string;    // editable — bound to textarea
    studentName: string;
    maxScore: number;
    chunkIndex: number;
    chunkTotal: number;
  };
  ```

  **Step B — Expand review resolution type** (line 119):
  Change the `reviewResolve` type to carry edited values:
  ```typescript
  let reviewResolve: ((decision: { action: 'approve' | 'skip'; score?: number; feedback?: string }) => void) | null = null;
  ```

  **Step C — Update `requestStudentReview`** (lines 888-899):
  Set `autoScore` in the `pendingReview` object:
  ```typescript
  pendingReview = { ...result, autoScore: result.score, studentName, maxScore, chunkIndex: index, chunkTotal: total };
  ```

  **Step D — Update `handleApprove`** (lines 901-907):
  Read edited values from `pendingReview` BEFORE nulling it, and pass them in the resolution:
  ```typescript
  function handleApprove() {
    if (reviewResolve && pendingReview) {
      const editedScore = Math.max(0, Math.min(pendingReview.maxScore, pendingReview.score));
      const editedFeedback = pendingReview.feedback;
      reviewResolve({ action: 'approve', score: editedScore, feedback: editedFeedback });
      pendingReview = null;
      reviewResolve = null;
    }
  }
  ```
  Note: clamping happens here on submit, not on every keystroke.

  **Step E — Update `applyResult`** (lines 614-618):
  Use the decision's edited values when available:
  ```typescript
  if (isReviewMode) {
    const maxScore = parseInt(rubricMaxScore) || 10;
    const decision = await requestStudentReview(result, studentName, maxScore, chunkIndex, chunkTotal);
    if (decision.action === 'skip') {
      updateBatchState();
      return;
    }
    // Use edited values from review, falling back to original AI values
    result = {
      ...result,
      score: decision.score ?? result.score,
      feedback: decision.feedback ?? result.feedback,
    };
  }
  ```
  This way line 623 (`batchGrader.applyGrade(result.studentIndex, result.score, result.feedback)`) naturally picks up the edited values.

  **Step F — Replace review panel UI** (lines 1294-1311):
  Replace the read-only score span and feedback div with editable inputs:
  ```svelte
  {#if pendingReview}
    <div class="review-panel">
      <div class="review-header">
        <span class="review-title">Review</span>
        <span class="review-counter">{pendingReview.chunkIndex + 1} of {pendingReview.chunkTotal}</span>
      </div>
      <div class="review-summary">
        <div class="review-student-row">
          <strong>{pendingReview.studentName}</strong>
          <small class="auto-score-label">Auto: {pendingReview.autoScore}/{pendingReview.maxScore}</small>
        </div>
        <div class="review-score-row">
          <label class="review-score-label" for="review-score-input">Score:</label>
          <input
            id="review-score-input"
            class="review-score-input"
            type="number"
            min="0"
            max={pendingReview.maxScore}
            step="0.5"
            bind:value={pendingReview.score}
          />
          <span class="review-score-max">/ {pendingReview.maxScore}</span>
        </div>
        <textarea
          class="review-feedback-edit"
          rows="4"
          bind:value={pendingReview.feedback}
        ></textarea>
      </div>
      <div class="review-actions">
        <button class="btn-primary" onclick={handleApprove}>Approve</button>
        <button class="btn-secondary" onclick={handleSkip}>Skip</button>
      </div>
    </div>
  {/if}
  ```

  **Step G — Add CSS** (after line 2153, inside `<style>`):
  ```css
  .auto-score-label {
    font-size: 0.78em;
    color: var(--color-text-secondary);
    font-weight: 400;
  }
  .review-score-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .review-score-label {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .review-score-input {
    width: 70px;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.9em;
    font-weight: 600;
  }
  .review-score-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
  .review-score-max {
    font-size: 0.85em;
    color: var(--color-text-secondary);
  }
  .review-feedback-edit {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.82em;
    resize: vertical;
    max-height: 150px;
    line-height: 1.4;
  }
  .review-feedback-edit:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
  ```

  **Must NOT do**:
  - Touch `batch-grader.ts`
  - Touch the auto-continue effect (line 1048)
  - Create new component files
  - Add undo/revert/reset buttons
  - Add keyboard shortcuts
  - Refactor existing CSS classes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, well-defined edits with exact line numbers and code snippets
  - **Skills**: []
    - No external skills needed — pure Svelte component editing
  - **Skills Evaluated but Omitted**:
    - `visual-engineering`: Not needed — CSS is minimal and follows existing patterns
    - `playwright`: Not needed for implementation — only for QA

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1 (final verification)
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:109-117` — Current `ReviewData` type to extend with `autoScore`
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:119` — Current `reviewResolve` type to expand
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:888-899` — `requestStudentReview` where `pendingReview` is set (add `autoScore` here)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:901-907` — `handleApprove` to capture edited values before nulling
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:606-633` — `applyResult` to use edited values from decision
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1294-1311` — Current review panel UI to replace
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:2103-2153` — Existing `.review-*` CSS patterns to follow

  **Critical Flow References** (understand before modifying):
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:807-812` — `handleStopBatch` cleanup resolves with `{ action: 'skip' }` — no change needed (skip doesn't read score/feedback)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:827-832` — `handleCancelBatch` cleanup — same, no change needed
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1048` — Auto-continue effect — DO NOT TOUCH
  - `ogre-desktop/src/lib/batch-grader.ts:1479-1538` — `applyGrade()` already accepts arbitrary score/feedback — DO NOT MODIFY this file

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after changes
    Tool: Bash
    Preconditions: Working directory is ogre-desktop/
    Steps:
      1. Run `npm run build` in ogre-desktop/
      2. Check exit code is 0
      3. Run `npx svelte-check` in ogre-desktop/
      4. Check exit code is 0
    Expected Result: Both commands exit 0 with no errors
    Failure Indicators: Non-zero exit code, TypeScript errors, Svelte compilation errors
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: ReviewData type includes autoScore field
    Tool: Bash (grep)
    Preconditions: Changes applied
    Steps:
      1. grep for `autoScore` in BatchPanel.svelte
      2. Verify it appears in the ReviewData type definition
      3. Verify it appears in the requestStudentReview function where pendingReview is set
      4. Verify it appears in the template as `pendingReview.autoScore`
    Expected Result: autoScore field exists in type, is set during review creation, and displayed in template
    Failure Indicators: grep returns no matches, or field missing from any of the three locations
    Evidence: .sisyphus/evidence/task-1-autoScore-grep.txt

  Scenario: Review resolution carries edited values
    Tool: Bash (grep)
    Preconditions: Changes applied
    Steps:
      1. grep for `decision.score` in BatchPanel.svelte
      2. Verify applyResult uses `decision.score ?? result.score`
      3. grep for `decision.feedback` in BatchPanel.svelte
      4. Verify applyResult uses `decision.feedback ?? result.feedback`
    Expected Result: Both edited score and feedback flow from handleApprove through decision to applyResult
    Failure Indicators: Original result.score/result.feedback still hardcoded on line 623
    Evidence: .sisyphus/evidence/task-1-decision-flow.txt

  Scenario: Score clamping on approve
    Tool: Bash (grep)
    Preconditions: Changes applied
    Steps:
      1. grep for `Math.max.*Math.min` or `Math.min.*Math.max` in handleApprove
      2. Verify clamping uses 0 as minimum and pendingReview.maxScore as maximum
    Expected Result: Score is clamped to [0, maxScore] in handleApprove before passing to resolution
    Failure Indicators: No clamping logic found in handleApprove
    Evidence: .sisyphus/evidence/task-1-score-clamp.txt

  Scenario: Review panel has editable inputs (not read-only)
    Tool: Bash (grep)
    Preconditions: Changes applied
    Steps:
      1. grep for `bind:value={pendingReview.score}` — confirms score input is bound
      2. grep for `bind:value={pendingReview.feedback}` — confirms feedback textarea is bound
      3. grep for `type="number"` near `review-score` — confirms number input
      4. Verify NO remaining read-only `{pendingReview.score}/{pendingReview.maxScore}` span pattern
    Expected Result: Score uses bound number input, feedback uses bound textarea, no read-only remnants
    Failure Indicators: Old read-only span/div patterns still present, or bind:value missing
    Evidence: .sisyphus/evidence/task-1-editable-inputs.txt
  ```

  **Commit**: YES
  - Message: `feat(batch): add editable score/feedback override in review mode`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `npm run build` (in `ogre-desktop/`)

---

## Final Verification Wave

- [x] F1. **Build + Type Verification** — `quick`
  Run `npm run build` and `npx svelte-check` in `ogre-desktop/`. Verify both exit 0. Grep for the key patterns: `autoScore`, `decision.score`, `bind:value={pendingReview.score}`, `review-score-input`, `review-feedback-edit`. Confirm no TypeScript errors.
  Output: `Build [PASS/FAIL] | svelte-check [PASS/FAIL] | Patterns [N/N found] | VERDICT`

---

## Commit Strategy

- **Task 1**: `feat(batch): add editable score/feedback override in review mode` — `ogre-desktop/src/components/grading/BatchPanel.svelte`, `npm run build`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build     # Expected: exit 0, no errors
cd ogre-desktop && npx svelte-check  # Expected: exit 0, no errors
```

### Final Checklist
- [x] ReviewData type has autoScore field
- [x] Review panel shows editable score input + feedback textarea
- [x] "Auto: X/Y" label visible with original AI score
- [x] handleApprove captures edited values + clamps score
- [x] applyResult uses decision.score/decision.feedback
- [x] Auto mode (isReviewMode=false) completely unchanged
- [x] Skip resolves without reading score/feedback
- [x] No changes to batch-grader.ts
- [x] Build succeeds
