# Fix Anchor Score Rounding for Small maxScore

## TL;DR

> **Quick Summary**: BatchPanel.svelte uses bare `Math.round()` for anchor scores, collapsing them to integers when maxScore < 6 (e.g. maxScore=1 gives 1,1,1,0 instead of 0.9,0.7,0.5,0.3). The server-side `grading.js` already has the fix — just port it.
> 
> **Deliverables**: 
> - Fixed `computeScoringAnchors` in BatchPanel.svelte
> 
> **Estimated Effort**: Quick (< 5 minutes)
> **Parallel Execution**: NO — single task
> **Critical Path**: Task 1 only

---

## Context

### Original Request
Anchor responses showing 1,1,1,0 instead of proportional decimals for maxScore=1.

### Root Cause
`ogre-desktop/src/components/grading/BatchPanel.svelte` line 882-885 uses `Math.round()` directly:
```javascript
const excellent    = Math.round(maxScore * 0.9);   // 0.9 → 1
const adequate     = Math.round(maxScore * 0.65);  // 0.65 → 1
const belowAverage = Math.round(maxScore * 0.5);   // 0.5 → 1
const minimal      = Math.round(maxScore * 0.3);   // 0.3 → 0
```

The server's `grading-server/grading.js:18` already has the correct logic:
```javascript
const roundScore = (s) => maxScore < 6 ? Math.round(s * 10) / 10 : Math.round(s);
```

---

## Work Objectives

### Core Objective
Port the `roundScore` helper from the server to the desktop UI.

### Must Have
- Proportional decimal anchors for maxScore < 6

### Must NOT Have
- Changes to any other file
- Changes to the server-side grading.js (already correct)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### QA Policy
Vite HMR will pick up the change automatically if the dev server is running.

---

## Execution Strategy

```
Wave 1:
└── Task 1: Fix computeScoringAnchors rounding [quick]

Wave FINAL:
└── Task F1: Verify the fix via LSP diagnostics
```

### Agent Dispatch Summary
- **1**: **1** — T1 → `quick`
- **FINAL**: **1** — F1 → `quick`

---

## TODOs

- [x] 1. Fix `computeScoringAnchors` rounding in BatchPanel.svelte — DONE (already applied in prior session)

  **What to do**:
  - Open `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Find the `computeScoringAnchors` function (around line 878)
  - Replace lines 882-885 (the four `Math.round` lines) with:
    ```typescript
    // Round to 1 decimal place for small max scores (< 6) so anchors stay
    // proportionate rather than collapsing to the same integer value.
    const roundScore = (s: number) => maxScore < 6 ? Math.round(s * 10) / 10 : Math.round(s);
    const excellent    = roundScore(maxScore * 0.9);
    const adequate     = roundScore(maxScore * 0.65);
    const belowAverage = roundScore(maxScore * 0.5);
    const minimal      = roundScore(maxScore * 0.3);
    ```

  **Must NOT do**:
  - Do NOT touch any other function or file
  - Do NOT modify the server-side grading.js

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:878-885` — The broken function to fix
  - `grading-server/grading.js:16-23` — The reference implementation with the correct `roundScore` logic

  **Acceptance Criteria**:
  - [ ] `computeScoringAnchors` uses `roundScore` helper with `maxScore < 6` decimal preservation
  - [ ] No LSP errors in BatchPanel.svelte

  **QA Scenarios**:

  ```
  Scenario: Verify no TypeScript errors after edit
    Tool: Bash (lsp_diagnostics)
    Steps:
      1. Run lsp_diagnostics on BatchPanel.svelte
      2. Assert no errors (warnings OK)
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-1-lsp-check.txt
  ```

  **Commit**: YES
  - Message: `fix(grading): preserve decimal anchor scores for small maxScore values`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`

---

## Final Verification Wave

- [x] F1. **LSP Check** — PASSED (build completed with no errors)
  Run lsp_diagnostics on the edited file. Confirm zero errors.

---

## Commit Strategy

- **1**: `fix(grading): preserve decimal anchor scores for small maxScore values` — BatchPanel.svelte

---

## Success Criteria

### Final Checklist
- [x] `computeScoringAnchors(1, ...)` produces scores 0.9, 0.7, 0.5, 0.3 (not 1, 1, 1, 0)
- [x] `computeScoringAnchors(10, ...)` still produces 9, 7, 5, 3 (unchanged behavior for large maxScore)
- [x] No TypeScript errors
