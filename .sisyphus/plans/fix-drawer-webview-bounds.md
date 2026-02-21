# Fix Drawer Webview Bounds + Remove FloatingDrawerButton

## TL;DR

> **Quick Summary**: Fix two visual bugs — the GradingPanel drawer renders under the native Tauri webview (invisible/unclickable) and the floating icon button is also hidden. Root cause: Tauri webviews are native OS windows that CSS z-index cannot control. Fix: subtract drawer width from webview bounds. Also remove FloatingDrawerButton (nav-bar toggle is sufficient).
> 
> **Deliverables**:
> - Webview bounds correctly account for drawer width (visible, clickable drawer)
> - FloatingDrawerButton component removed entirely
> - Nav-bar toggle properly persists drawer state
> - Dead code cleaned up (onBeforeCapture/onAfterCapture callbacks)
> 
> **Estimated Effort**: Quick (15-20 min implementation + verification)
> **Parallel Execution**: NO — single task, all changes interdependent
> **Critical Path**: Task 1 → Done

---

## Context

### Original Request
User reported: "In the desktop on the webview the drawer is under the webview loaded page and the icon button is missing too"

### Interview Summary
**Key Discussions**:
- Root cause well-documented in existing analysis docs (DRAWER_ZINDEX_SUMMARY.md, TAURI_ZINDEX_ANALYSIS.md)
- Tauri webviews are native OS windows (HWND) — CSS z-index is irrelevant
- Fix (Option A: adjust webview bounds) was identified months ago but never implemented
- User chose to remove FloatingDrawerButton entirely (nav-bar toggle is sufficient)

**Research Findings**:
- `Browser.svelte:88` calculates `const width = window.innerWidth - sidebarWidth` — never subtracts drawer width
- The reactive block at lines 99-107 already watches `showGradingPanel`, `gradingPanelCollapsed`, and `gradingPanelWidth` — bounds auto-update on state changes
- FloatingDrawerButton at `position: fixed; bottom: 20px; right: 20px` is also hidden behind native webview

### Metis Review
**Identified Gaps** (addressed):
- **CRITICAL: Nav-bar toggle doesn't persist state** — `on:click={() => showGradingPanel = !showGradingPanel}` (line 333) skips `setSetting()`. After removing FloatingDrawerButton (which called `toggleDrawer()`), no toggle persists state. Fix: change nav-bar to call `toggleDrawer()`.
- **CRITICAL: IMPLEMENTATION_GUIDE.md is stale** — recommends DOM queries + custom events, but reactive block already handles this. DOM query approach is BUGGY (getBoundingClientRect returns 400px even when panel is collapsed via translateX).
- **Dead code: `onBeforeCapture`/`onAfterCapture`** — Only existed to hide FloatingDrawerButton during screenshots. Must be cleaned up from both files.
- **Stale z-index comment** — GradingPanel.svelte lines 327-338 references FloatingDrawerButton.

---

## Work Objectives

### Core Objective
Fix the webview bounds calculation to account for the GradingPanel drawer width, so the drawer is visible and clickable alongside the native webview. Remove the FloatingDrawerButton component.

### Concrete Deliverables
- `Browser.svelte` — bounds fix + nav-bar toggle fix + FloatingDrawerButton removal
- `GradingPanel.svelte` — dead callback cleanup + stale comment update
- `FloatingDrawerButton.svelte` — deleted

### Definition of Done
- [ ] `cd ogre-desktop && npm run build` succeeds with zero errors
- [ ] `grep -r "FloatingDrawerButton" ogre-desktop/src/` returns 0 matches
- [ ] `grep -r "hideFloatingButton" ogre-desktop/src/` returns 0 matches
- [ ] `FloatingDrawerButton.svelte` file does not exist

### Must Have
- Webview width subtracts drawer width when drawer is open/expanded
- Webview expands to full width when drawer is closed or collapsed
- Nav-bar toggle persists drawer state to storage
- Build compiles cleanly

### Must NOT Have (Guardrails)
- **DO NOT follow IMPLEMENTATION_GUIDE.md** — it's stale, recommends DOM queries + custom events that are unnecessary and buggy
- **DO NOT use DOM queries for drawer width** — `getBoundingClientRect().width` returns 400px even when collapsed via `translateX(100%)`. Use Svelte state variables instead.
- **DO NOT add custom events** (`ogre:drawer-resized`, `ogre:drawer-toggled`) — the reactive block already handles bounds updates via bound state variables
- **DO NOT add ResizeObserver, RAF animation for drawer, or DOM caching** — premature optimization, out of scope
- **DO NOT touch the screenshot flow logic** beyond removing the dead `onBeforeCapture`/`onAfterCapture` calls
- **DO NOT update/delete the analysis docs** (DRAWER_ZINDEX_SUMMARY.md, TAURI_ZINDEX_ANALYSIS.md, IMPLEMENTATION_GUIDE.md) — separate PR

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest in ogre-desktop/)
- **Automated tests**: None needed — no existing tests cover this area, and bounds logic is visual/Tauri-specific
- **Framework**: vitest (but not used for this fix)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| Build compilation | Bash | `npm run build` exit code 0 |
| Code cleanup | Bash (grep) | Search for stale references, expect 0 matches |
| File deletion | Bash | Confirm file doesn't exist |

---

## Execution Strategy

### Single Task (No Waves Needed)

All changes are interdependent — removing FloatingDrawerButton requires simultaneously cleaning up its consumers in Browser.svelte and GradingPanel.svelte. The bounds fix is a single line change that goes alongside the cleanup.

```
Wave 1 (Single Task):
└── Task 1: Fix webview bounds + remove FloatingDrawerButton + fix nav-bar toggle [quick]

Critical Path: Task 1 → Done
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | — | — | 1 |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **1** | T1 → `quick` |

---

## TODOs

- [x] 1. Fix webview bounds, remove FloatingDrawerButton, fix nav-bar toggle persistence

  **What to do**:

  **FILE 1: `ogre-desktop/src/pages/Browser.svelte`**

  A) **Fix bounds calculation** — In `updateWebviewBounds()` at line 88, replace:
  ```typescript
  const width = window.innerWidth - sidebarWidth;
  ```
  with:
  ```typescript
  const drawerWidth = (showGradingPanel && !gradingPanelCollapsed) ? gradingPanelWidth : 0;
  const width = window.innerWidth - sidebarWidth - drawerWidth;
  ```
  This uses Svelte state variables (already watched by the reactive block at lines 99-107) instead of DOM queries. The drawer width is 0 when the panel is hidden OR collapsed, so the webview fills the available space correctly.

  B) **Fix nav-bar toggle persistence** — At line 333, change:
  ```svelte
  <button class="toggle-btn" on:click={() => showGradingPanel = !showGradingPanel} title="Toggle Grading Panel" class:active={showGradingPanel}>
  ```
  to:
  ```svelte
  <button class="toggle-btn" on:click={toggleDrawer} title="Toggle Grading Panel" class:active={showGradingPanel}>
  ```
  This ensures the `toggleDrawer()` function (lines 293-300) is called, which persists the open/close state to storage via `setSetting()`.

  C) **Remove FloatingDrawerButton** — Delete these lines:
  - Line 22: `import FloatingDrawerButton from '../components/FloatingDrawerButton.svelte';`
  - Line 34: `let hideFloatingButton = false;`
  - Lines 395-396: the `onBeforeCapture` and `onAfterCapture` callback props on the `<GradingPanel>` component
  - Line 400: `<FloatingDrawerButton onclick={toggleDrawer} hidden={hideFloatingButton} />`

  **FILE 2: `ogre-desktop/src/pages/GradingPanel.svelte`**

  A) **Remove dead callback props** — Remove `onBeforeCapture` and `onAfterCapture` from:
  - Props destructure (lines 17-18): remove both from the `let { ... } = $props();` block
  - Type declarations (lines 22-23): remove both from the type object
  - Invocation in `handleScreenshot()` (line 91): remove `onBeforeCapture?.();`
  - Invocation in `handleScreenshot()` finally block (line 103): remove `onAfterCapture?.();`

  B) **Update stale z-index comment** — In the comment block at lines 327-338, remove the line:
  ```
   * - FloatingDrawerButton: 9998 (FAB to toggle drawer)
   ```

  **FILE 3: DELETE `ogre-desktop/src/components/FloatingDrawerButton.svelte`**

  **Must NOT do**:
  - DO NOT follow IMPLEMENTATION_GUIDE.md (stale, buggy DOM query approach)
  - DO NOT use `document.querySelector('.grading-panel').getBoundingClientRect().width` — returns 400px even when collapsed via translateX(100%)
  - DO NOT add custom events (ogre:drawer-resized, etc.) — reactive block already handles this
  - DO NOT restructure the screenshot flow beyond removing the dead callbacks

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file-edit-level task across 3 files. All changes are small, surgical, well-specified line-by-line edits.
  - **Skills**: `[]`
    - No specialized skills needed — straightforward Svelte file edits and deletion.
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — verification is build-based, not browser-based
    - `frontend-ui-ux`: Not needed — no design work, just bounds math fix

  **Parallelization**:
  - **Can Run In Parallel**: NO (single task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Nothing
  - **Blocked By**: None

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/pages/Browser.svelte:71-96` — The `updateWebviewBounds()` function to modify. Note how sidebar width is already queried at line 76 — drawer width follows same pattern but uses state variables.
  - `ogre-desktop/src/pages/Browser.svelte:99-107` — Reactive block that triggers bounds update. Already watches `showGradingPanel`, `gradingPanelCollapsed`, `gradingPanelWidth`. No changes needed here.
  - `ogre-desktop/src/pages/Browser.svelte:293-300` — The `toggleDrawer()` function. This calls `setSetting()` to persist state. The nav-bar toggle must call this.

  **API/Type References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:14-24` — Props interface. Remove `onBeforeCapture`/`onAfterCapture` from here.
  - `ogre-desktop/src/pages/GradingPanel.svelte:80-106` — `handleScreenshot()` function where dead callbacks are invoked.

  **WHY Each Reference Matters**:
  - `Browser.svelte:88` — THE line to change. Currently `window.innerWidth - sidebarWidth`, needs `- drawerWidth` added.
  - `Browser.svelte:333` — THE nav-bar toggle. Currently inline handler that doesn't persist, must switch to `toggleDrawer`.
  - `GradingPanel.svelte:91,103` — THE dead callback invocations to remove.
  - `FloatingDrawerButton.svelte` — THE file to delete.

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after all changes
    Tool: Bash
    Preconditions: All file edits complete, FloatingDrawerButton.svelte deleted
    Steps:
      1. cd ogre-desktop && npm run build
      2. Check exit code is 0
      3. Check stderr for "error" (case-insensitive)
    Expected Result: Exit code 0, no error lines in output
    Failure Indicators: Non-zero exit code, TypeScript errors about missing imports/types
    Evidence: .sisyphus/evidence/task-1-build-succeeds.txt

  Scenario: No stale FloatingDrawerButton references
    Tool: Bash (grep)
    Preconditions: All file edits complete
    Steps:
      1. grep -r "FloatingDrawerButton" ogre-desktop/src/
      2. Check output is empty (0 matches)
    Expected Result: No matches found
    Failure Indicators: Any line of output = missed a reference
    Evidence: .sisyphus/evidence/task-1-no-stale-refs-button.txt

  Scenario: No stale hideFloatingButton references
    Tool: Bash (grep)
    Preconditions: All file edits complete
    Steps:
      1. grep -r "hideFloatingButton" ogre-desktop/src/
      2. Check output is empty (0 matches)
    Expected Result: No matches found
    Failure Indicators: Any line of output = missed a reference
    Evidence: .sisyphus/evidence/task-1-no-stale-refs-hidden.txt

  Scenario: No stale onBeforeCapture/onAfterCapture references
    Tool: Bash (grep)
    Preconditions: All file edits complete
    Steps:
      1. grep -r "onBeforeCapture\|onAfterCapture" ogre-desktop/src/
      2. Check output is empty (0 matches)
    Expected Result: No matches found
    Failure Indicators: Any line of output = missed a reference
    Evidence: .sisyphus/evidence/task-1-no-stale-refs-callbacks.txt

  Scenario: FloatingDrawerButton.svelte file deleted
    Tool: Bash
    Preconditions: File deletion step complete
    Steps:
      1. test ! -f ogre-desktop/src/components/FloatingDrawerButton.svelte && echo "DELETED" || echo "STILL EXISTS"
    Expected Result: Output is "DELETED"
    Failure Indicators: Output is "STILL EXISTS"
    Evidence: .sisyphus/evidence/task-1-file-deleted.txt

  Scenario: Bounds calculation uses state variables not DOM queries
    Tool: Bash (grep)
    Preconditions: Browser.svelte edited
    Steps:
      1. grep -n "querySelector.*grading-panel" ogre-desktop/src/pages/Browser.svelte
      2. Check output is empty (0 matches)
      3. grep -n "drawerWidth" ogre-desktop/src/pages/Browser.svelte
      4. Check output shows the new state-based calculation
    Expected Result: No DOM query for grading panel; drawerWidth variable present using state
    Failure Indicators: DOM query found = used wrong approach from stale IMPLEMENTATION_GUIDE.md
    Evidence: .sisyphus/evidence/task-1-state-not-dom.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-1-{scenario-slug}.txt
  - [ ] Build output for compilation check
  - [ ] Grep output for stale reference checks

  **Commit**: YES
  - Message: `fix(desktop): adjust webview bounds for drawer + remove FloatingDrawerButton`
  - Files: `ogre-desktop/src/pages/Browser.svelte`, `ogre-desktop/src/pages/GradingPanel.svelte`, `ogre-desktop/src/components/FloatingDrawerButton.svelte` (deleted)
  - Pre-commit: `cd ogre-desktop && npm run build`

---

## Final Verification Wave

> Not needed for this single-task fix. The QA scenarios above provide complete verification.
> If desired, a quick manual smoke test: `npm run tauri:dev` → navigate to URL → toggle drawer → verify visible.

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(desktop): adjust webview bounds for drawer + remove FloatingDrawerButton` | Browser.svelte, GradingPanel.svelte, FloatingDrawerButton.svelte (deleted) | `npm run build` |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build  # Expected: exit 0, no errors
grep -r "FloatingDrawerButton" ogre-desktop/src/  # Expected: 0 matches
grep -r "hideFloatingButton" ogre-desktop/src/    # Expected: 0 matches
grep -r "onBeforeCapture\|onAfterCapture" ogre-desktop/src/  # Expected: 0 matches
test ! -f ogre-desktop/src/components/FloatingDrawerButton.svelte  # Expected: exit 0
```

### Final Checklist
- [ ] Webview width calculation subtracts drawer width (using state variables)
- [ ] Nav-bar toggle calls `toggleDrawer()` (persists state)
- [ ] FloatingDrawerButton component fully removed (import, usage, file)
- [ ] Dead callbacks cleaned up (onBeforeCapture/onAfterCapture)
- [ ] Z-index comment updated
- [ ] Build passes cleanly
