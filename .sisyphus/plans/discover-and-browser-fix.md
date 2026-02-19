# Fix GradingPanel 2x2 Grid + Webview Bounds Misalignment

## TL;DR

> **Quick Summary**: Fix two bugs in the desktop app — mode tabs overflow at panel width (need 2x2 grid), and the embedded webview is misaligned because two competing bounds calculators fight each other (App.svelte with simplified math vs Browser.svelte with accurate DOM measurements).
> 
> **Deliverables**:
> - GradingPanel mode tabs rendered as 2x2 grid (Grader/Solver top, Batch/Discover bottom)
> - Webview properly aligned and sized by consolidating all bounds management in Browser.svelte
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - Task 2 depends on Task 1 for clean commit, and Task 2 touches App.svelte
> **Critical Path**: Task 1 → Task 2 → Final Verification

---

## Context

### Original Request
The page loads in the desktop app browser but isn't fitting the screen properly (webview is offset/misaligned). Also, the mode tabs (Grader/Solver/Batch/Discover) in the GradingPanel weren't stacked in a 2x2 grid as previously discussed.

### Interview Summary
**Key Discussions**:
- Mode tabs are still `display: flex` (single row) — the planned 2x2 grid was never applied
- Webview misalignment has TWO root causes:
  1. `hideWebview()` race condition at Browser.svelte line 137 — hides webview on creation, nothing re-shows it
  2. App.svelte has simplified bounds math (hardcoded constants, no grading panel, no presets panel) that overwrites Browser.svelte's accurate DOM-based bounds during sidebar animation and window resize

### Metis Review
**Identified Gaps** (addressed):
- **Window resize handler**: App.svelte's `handleWindowResize` calls `recalculateWebviewBounds()` with simplified math — overwrites accurate bounds whenever window is resized while grading panel is open
- **Animation frames override**: App.svelte fires 8 `setTimeout` frames over 300ms that overwrite Browser.svelte's correct `onMount` bounds
- **Rust initial position**: Webview is created at `x=0, y=60, 800x600` — must set bounds BEFORE showing to avoid flash
- **State reset on navigation**: Browser.svelte is destroyed/recreated on page switches — `showPresets` resets to `true`, `showGradingPanel` resets to `false`
- **Screenshot overlay interaction**: Must preserve GradingPanel's hide→show flow for screenshot capture
- **Rapid sidebar toggle**: No animation cancellation — overlapping animations produce jitter

---

## Work Objectives

### Core Objective
Fix GradingPanel tab layout and consolidate webview bounds management to eliminate misalignment.

### Concrete Deliverables
- Modified CSS in `ogre-desktop/src/pages/GradingPanel.svelte` — mode tabs as 2x2 grid
- Modified JS in `ogre-desktop/src/pages/Browser.svelte` — owns ALL bounds management
- Modified JS in `ogre-desktop/src/App.svelte` — delegates bounds to Browser.svelte via events

### Definition of Done
- [ ] Mode tabs display as 2x2 grid when GradingPanel is expanded
- [ ] Mode tabs display as single-column icons when GradingPanel is collapsed
- [ ] Webview properly fills the area between sidebar, URL bar, and grading panel
- [ ] Window resize correctly recalculates webview bounds
- [ ] Navigating away from Browser and back shows webview at correct position
- [ ] Screenshot capture flow still works (hide → overlay → show)

### Must Have
- 2x2 grid for mode tabs in expanded state
- Single source of truth for webview bounds (Browser.svelte)
- Correct bounds when grading panel is open/closed
- Correct bounds on window resize
- Set bounds BEFORE showing webview (avoid flash at x=0,y=60)

### Must NOT Have (Guardrails)
- No changes to `lib.rs` (Rust backend) — the webview creation API is correct
- No changes to `browser.ts` — the TypeScript API wrappers are correct
- No new Svelte stores, signals, or global state management
- No GradingPanel template changes — CSS only for Task 1
- No changes to GradingPanel's screenshot capture flow (lines 73-98)
- No fixing the "navigated-away-during-creation" edge case (pre-existing, out of scope)
- No CSS transitions or animations on the grid change

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (UI fixes requiring visual/runtime verification)
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios run in the actual Tauri dev environment.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Desktop App UI**: Use `npm run tauri:dev` in tmux, then MCPControl screenshot to verify visual changes
- **Webview behavior**: Navigate to Browser page, enter URL, verify via screenshot that page renders at correct position

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — Task 2 modifies App.svelte which Task 1 doesn't touch, but clean git history):
├── Task 1: Fix mode tabs to 2x2 grid layout (CSS-only) [quick]
└── Task 2: Consolidate webview bounds in Browser.svelte [deep]

Wave FINAL (After Wave 1 — verification):
├── Task F1: Visual regression check [quick]
└── Task F2: Scope fidelity check [quick]

Critical Path: Task 1 → Task 2 → F1 ∥ F2
Max Concurrent: 1 (Wave 1), 2 (Wave FINAL)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, F1, F2 |
| 2 | 1 | F1, F2 |
| F1 | 1, 2 | — |
| F2 | 1, 2 | — |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `deep`
- **Wave FINAL**: F1 → `quick`, F2 → `quick`

---

## TODOs

- [x] 1. Fix GradingPanel mode tabs to 2x2 grid layout

  **What to do**:
  - In `ogre-desktop/src/pages/GradingPanel.svelte`, modify the `<style>` section only (no template changes)
  - Change `.mode-tabs` from `display: flex` to `display: grid; grid-template-columns: 1fr 1fr`
  - Keep gap at `var(--spacing-1)` and other properties unchanged
  - Update `.grading-panel.collapsed .mode-tabs` to use `grid-template-columns: 1fr` (single column for collapsed state, preserving current vertical icon layout)
  - Remove `flex: 1` from `.mode-tab` (dead CSS property in grid context)
  - Ensure `.mode-tab` active/hover/disabled states still work visually in the grid

  **Must NOT do**:
  - Do NOT change the Svelte template (`{#each MODES as mode}`) — CSS only
  - Do NOT touch `.panel-content` or any styling below the tabs
  - Do NOT change the MODES array order or content
  - Do NOT add CSS transitions or animations
  - Do NOT refactor tabs into a separate component

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure CSS change in a single file, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1, first)
  - **Blocks**: Task 2, F1, F2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:254-258` — Current `.mode-tabs` CSS: `display: flex; padding: var(--spacing-2); gap: var(--spacing-1)` — change `display: flex` to `display: grid; grid-template-columns: 1fr 1fr`
  - `ogre-desktop/src/pages/GradingPanel.svelte:259-261` — Collapsed override: `.grading-panel.collapsed .mode-tabs { flex-direction: column; ... }` — change to `grid-template-columns: 1fr` and remove `flex-direction`
  - `ogre-desktop/src/pages/GradingPanel.svelte:262-268` — `.mode-tab` base styles with `flex: 1` — remove `flex: 1` (meaningless in grid)

  **Template References** (do NOT change):
  - `ogre-desktop/src/pages/GradingPanel.svelte:49-54` — MODES array: Grader, Solver, Batch, Discover
  - `ogre-desktop/src/pages/GradingPanel.svelte:154-169` — Template `{#each MODES}` renders tabs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 2x2 grid layout when GradingPanel expanded
    Tool: Bash (npm run tauri:dev in ogre-desktop/) + MCPControl screenshot
    Preconditions: App running in dev mode, on Browser page, GradingPanel open
    Steps:
      1. Navigate to Browser page via sidebar
      2. Click GradingPanel toggle to open it
      3. Verify mode tabs show 2 rows x 2 columns:
         Top row: "Grader" and "Solver"
         Bottom row: "Batch" and "Discover"
      4. Take screenshot of the GradingPanel header and tabs area
    Expected Result: All 4 tab labels fully visible, no clipping, 2x2 grid
    Failure Indicators: Any tab label truncated, tabs in single row, grid not forming
    Evidence: .sisyphus/evidence/task-1-grid-expanded.png

  Scenario: Vertical column when GradingPanel collapsed
    Tool: MCPControl screenshot
    Preconditions: GradingPanel expanded on Browser page
    Steps:
      1. Click collapse toggle on GradingPanel header
      2. Verify mode tabs show as single vertical column of emoji icons only
      3. Take screenshot
    Expected Result: 4 icons stacked vertically, no text labels
    Failure Indicators: Labels visible when collapsed, icons in grid instead of column
    Evidence: .sisyphus/evidence/task-1-grid-collapsed.png

  Scenario: Active/hover states work in grid
    Tool: MCPControl
    Preconditions: GradingPanel expanded
    Steps:
      1. Click each of the 4 mode tabs in sequence
      2. Verify active tab gets highlighted
    Expected Result: Active tab has primary-bg background, hover works
    Evidence: .sisyphus/evidence/task-1-grid-active.png
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `fix(desktop): 2x2 tab grid + consolidated webview bounds management`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`

- [x] 2. Consolidate webview bounds management in Browser.svelte

  **What to do**:

  **Part A — Fix Browser.svelte status listener (lines 128-143)**:
  - Replace the `hideWebview()` call at line 137 with the correct sequence:
    ```
    browserCreated = true;
    showPresets = false;
    isLoading = false;
    await tick();                    // Wait for DOM update (presets hidden)
    updateWebviewBounds();           // Set correct position FIRST (avoids flash at x=0,y=60)
    await showWebview();             // THEN reveal
    ```
  - Remove the misleading "Race condition fix" comments (lines 134-136)
  - Replace with accurate comment: "Webview created — set correct bounds before revealing to avoid flash at initial Rust position (x=0,y=60)"

  **Part B — Move resize handler to Browser.svelte**:
  - Add `window.addEventListener('resize', handleResize)` in Browser.svelte's `onMount`
  - Remove in `onDestroy`
  - `handleResize` should debounce (100ms) and call `updateWebviewBounds()`
  - This replaces App.svelte's `handleWindowResize` (which uses simplified math)

  **Part C — Add sidebar-changed listener in Browser.svelte**:
  - In `onMount`, add: `window.addEventListener('ogre:sidebar-changed', handleSidebarChanged)`
  - `handleSidebarChanged` runs a requestAnimationFrame loop for ~300ms querying DOM each frame to animate bounds smoothly during sidebar transitions
  - Include animation cancellation: if a new sidebar-changed fires during animation, cancel the previous one
  - Remove in `onDestroy`

  **Part D — Simplify App.svelte (remove direct bounds calls)**:
  - Remove `recalculateWebviewBounds()` function entirely
  - Remove `animateWebviewBounds()` function entirely
  - Remove `handleWindowResize()` and its `window.addEventListener('resize', ...)` from onMount/onDestroy
  - Remove `resizeTimeout` variable
  - Remove `URL_BAR_HEIGHT` constant (no longer needed)
  - In `navigate('browser')`: Keep `showWebview()`, replace `animateWebviewBounds()` with `window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'))`
  - In `toggleSidebar()`: Replace `animateWebviewBounds()` with `window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'))`
  - In reactive block (lines 69-74): Keep `hideWebview()` on modal show. On modal close: keep `showWebview()`, replace `recalculateWebviewBounds()` with `window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'))`
  - Keep the `SIDEBAR_EXPANDED_WIDTH`, `SIDEBAR_COLLAPSED_WIDTH`, `SIDEBAR_TRANSITION_MS` constants (used elsewhere)
  - Remove `RESIZE_DEBOUNCE_MS` constant (moved to Browser.svelte)

  **Must NOT do**:
  - Do NOT change `ogre-desktop/src-tauri/src/lib.rs` — Rust backend is correct
  - Do NOT change `ogre-desktop/src/lib/browser.ts` — TypeScript API wrappers are correct
  - Do NOT change GradingPanel.svelte's screenshot capture flow (lines 73-98)
  - Do NOT add new Svelte stores, signals, or global state management
  - Do NOT fix the "navigated-away-during-creation" edge case (pre-existing, out of scope)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-file refactoring with timing-sensitive interactions between components, animation logic, and event coordination. Requires understanding the full lifecycle of webview creation and bounds management across App.svelte and Browser.svelte.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1, second)
  - **Blocks**: F1, F2
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (CRITICAL — read ALL of these):
  - `ogre-desktop/src/pages/Browser.svelte:128-143` — Status listener with the hideWebview() bug at line 137
  - `ogre-desktop/src/pages/Browser.svelte:65-96` — `updateWebviewBounds()` — the CORRECT bounds calculator using DOM queries. This is the single source of truth going forward.
  - `ogre-desktop/src/pages/Browser.svelte:98-107` — Reactive block tracking `showPresets`, `showGradingPanel`, `gradingPanelCollapsed`, `gradingPanelWidth`
  - `ogre-desktop/src/pages/Browser.svelte:109-158` — `onMount` with existing event listeners and webview detection
  - `ogre-desktop/src/pages/Browser.svelte:146-157` — `onMount` check for existing webview — the correct pattern: detect → set state → tick → updateWebviewBounds
  - `ogre-desktop/src/App.svelte:19-24` — Constants to keep/remove
  - `ogre-desktop/src/App.svelte:42` — `resizeTimeout` variable to remove
  - `ogre-desktop/src/App.svelte:47-59` — `recalculateWebviewBounds()` to REMOVE (simplified math, doesn't account for panels)
  - `ogre-desktop/src/App.svelte:62-65` — `handleWindowResize()` to REMOVE (uses recalculateWebviewBounds)
  - `ogre-desktop/src/App.svelte:69-74` — Reactive block for modal — keep hide/show, replace bounds call with event dispatch
  - `ogre-desktop/src/App.svelte:123` — `window.addEventListener('resize', handleWindowResize)` to REMOVE
  - `ogre-desktop/src/App.svelte:142` — `window.removeEventListener('resize', handleWindowResize)` to REMOVE
  - `ogre-desktop/src/App.svelte:144` — `clearTimeout(resizeTimeout)` to REMOVE
  - `ogre-desktop/src/App.svelte:152-170` — `navigate()` — keep showWebview/hideWebview, replace animateWebviewBounds with event
  - `ogre-desktop/src/App.svelte:172-182` — `toggleSidebar()` — replace animateWebviewBounds with event
  - `ogre-desktop/src/App.svelte:185-205` — `animateWebviewBounds()` to REMOVE

  **Show/Hide Call Site Inventory** (CRITICAL — verify no regressions):
  | # | File | Line | Action | Keep/Change |
  |---|------|------|--------|-------------|
  | 1 | App.svelte | 70 | hide | KEEP (modal showing) |
  | 2 | App.svelte | 72 | show | KEEP (modal closed) |
  | 3 | App.svelte | 158 | show | KEEP (navigate TO browser) |
  | 4 | App.svelte | 168 | hide | KEEP (navigate AWAY) |
  | 5 | **Browser.svelte** | **137** | **hide** | **CHANGE → show (after bounds set)** |
  | 6 | GradingPanel.svelte | 80 | hide | KEEP (screenshot capture) |
  | 7 | GradingPanel.svelte | 98 | show | KEEP (close screenshot overlay) |

  **Rust Reference** (context only — do NOT modify):
  - `ogre-desktop/src-tauri/src/lib.rs:234-238` — Webview created at `LogicalPosition(0, 60)` and `LogicalSize(800, 600)`. This is why bounds must be set BEFORE showWebview — otherwise user sees brief flash at wrong position.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Webview appears at correct position on first URL entry
    Tool: Bash (npm run tauri:dev in ogre-desktop/) + MCPControl screenshot
    Preconditions: Fresh app start, no previous browser session
    Steps:
      1. Click "Browser" in left sidebar
      2. Type "https://example.com" in URL bar, press Enter
      3. Wait 5 seconds for webview creation + page load
      4. Take screenshot of entire app window
    Expected Result: Webview fills area between collapsed sidebar (left), URL bar (top), and right edge. No gap, no overlap with sidebar. Content of example.com visible.
    Failure Indicators: Webview at x=0 (covering sidebar), blank area, gap between sidebar and webview
    Evidence: .sisyphus/evidence/task-2-first-load-aligned.png

  Scenario: Webview resizes when grading panel opens
    Tool: MCPControl screenshot
    Preconditions: Webview showing a page on Browser page
    Steps:
      1. Click the GradingPanel toggle button (right side of nav bar)
      2. Wait 1 second for panel to appear
      3. Take screenshot
    Expected Result: Webview shrinks to make room for grading panel on the right. No overlap between webview and panel.
    Failure Indicators: Webview extends behind grading panel, panel overlaps webview content
    Evidence: .sisyphus/evidence/task-2-panel-open.png

  Scenario: Webview resizes correctly on window resize
    Tool: MCPControl resize_window + screenshot
    Preconditions: Webview active, grading panel open
    Steps:
      1. Resize app window (e.g., make it wider by 200px)
      2. Wait 0.5 seconds
      3. Take screenshot
    Expected Result: Webview expands to fill new space, still correctly positioned between sidebar and grading panel
    Failure Indicators: Webview stays old size, extends past window, overlaps panel
    Evidence: .sisyphus/evidence/task-2-window-resize.png

  Scenario: Webview persists across page switches
    Tool: MCPControl screenshot
    Preconditions: Webview showing example.com
    Steps:
      1. Click "Dashboard" in sidebar (webview hides)
      2. Wait 1 second
      3. Click "Browser" in sidebar (webview re-shows)
      4. Take screenshot
    Expected Result: Webview reappears showing same URL, correctly aligned
    Failure Indicators: Blank area, webview at wrong position, need to re-enter URL
    Evidence: .sisyphus/evidence/task-2-page-switch.png

  Scenario: Screenshot capture flow still works (regression)
    Tool: MCPControl
    Preconditions: Webview active, GradingPanel open
    Steps:
      1. Select "Grader" mode tab
      2. Click screenshot button in StudentWorkCard
      3. Verify overlay appears (webview hidden)
      4. Close overlay (Escape or X)
      5. Verify webview reappears at correct position
    Expected Result: Screenshot flow works end-to-end, webview returns correctly after overlay
    Evidence: .sisyphus/evidence/task-2-screenshot-regression.png
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(desktop): 2x2 tab grid + consolidated webview bounds management`
  - Files: `ogre-desktop/src/pages/Browser.svelte`, `ogre-desktop/src/App.svelte`

---

## Final Verification Wave

- [x] F1. **Visual Regression Check** — `quick`
  Run `npm run tauri:dev` in ogre-desktop/. Navigate to Browser page, open GradingPanel. Verify: (1) mode tabs show as 2x2 grid when expanded, (2) mode tabs show as vertical column when collapsed, (3) all tab labels visible and not clipped, (4) active/hover states work, (5) enter a URL and verify the page renders aligned within the webview area (not offset), (6) open grading panel — webview should resize to make room, (7) resize the window — webview should stay correctly aligned, (8) navigate to Dashboard and back to Browser — webview should reappear correctly aligned.
  Output: `Grid layout [PASS/FAIL] | Collapsed [PASS/FAIL] | Webview aligned [PASS/FAIL] | Panel resize [PASS/FAIL] | Window resize [PASS/FAIL] | Page switch [PASS/FAIL] | VERDICT`

- [x] F2. **Scope Fidelity Check** — `quick`
  Verify only GradingPanel.svelte, Browser.svelte, and App.svelte were modified. Check no changes to: lib.rs, browser.ts, GradingPanel.svelte template markup. Verify no new files created. Check git diff for unexpected changes.
  Output: `Files changed [N expected/N actual] | Scope [CLEAN/VIOLATION] | VERDICT`

---

## Commit Strategy

- **1**: `fix(desktop): 2x2 tab grid + consolidated webview bounds management` — `ogre-desktop/src/pages/GradingPanel.svelte`, `ogre-desktop/src/pages/Browser.svelte`, `ogre-desktop/src/App.svelte`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run tauri:dev  # Launch app, test manually
```

### Final Checklist
- [x] Mode tabs show as 2x2 grid in expanded GradingPanel
- [x] Mode tabs show as single-column icons in collapsed GradingPanel
- [x] Entering URL in Browser page shows webpage at correct position
- [x] Webview resizes when grading panel opens/closes
- [x] Webview resizes correctly on window resize
- [x] Navigating away and back re-shows the webview correctly
- [x] Screenshot capture flow unaffected
- [x] Only GradingPanel.svelte, Browser.svelte, and App.svelte modified
