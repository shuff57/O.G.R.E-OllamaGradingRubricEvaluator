> **SUPERSEDED** — The underlying problem (drawer visibility alongside webview) was solved via
> the webview bounds approach in `fix-drawer-webview-bounds` and `drawer-resize-perf` plans.
> The overlay-drawer design proposed here was never implemented; instead, the GradingPanel
> adjusts webview bounds when opened/closed. Archived March 2026.

# Desktop Drawer UI — Convert Grading Panel to Overlay Drawer with Floating Button

## TL;DR

> **Quick Summary**: Convert the desktop app's GradingPanel from a layout-constrained side panel into an overlay drawer that floats on top of the webview content. Add a floating O.G.R.E toggle button that appears over the webview. The drawer slides in from the right, is user-resizable, and doesn't affect webview layout/bounds when opened/closed.
> 
> **Deliverables**:
> - Floating toggle button injected into webview (using `inject_script` or Svelte overlay)
> - GradingPanel converted to absolute-positioned overlay (z-index layering)
> - Webview bounds fixed to full viewport (ignore grading panel state)
> - Drawer state persistence (width + open/closed)
> - Screenshot coordination (hide drawer during webview captures)
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Final

---

## Context

### Original Request
User wants the desktop app's webview to have a drawer-style grading panel that overlays on top of the browser content instead of being part of the layout. The drawer should have a floating O.G.R.E button visible in the webview for toggling, be resizable, and not affect the webview bounds when opened/closed.

### Current Architecture
**Desktop App Structure**:
- `Browser.svelte` — Main page with navigation bar, presets panel, embedded Tauri webview
- `GradingPanel.svelte` — Currently a sidebar that's part of the layout (affects webview bounds)
- `browser.ts` — Tauri commands for webview management (`createEmbeddedBrowser`, `setWebviewBounds`, etc.)
- **Current behavior**: When grading panel opens, `updateWebviewBounds()` in Browser.svelte recalculates and shrinks the webview width to accommodate the panel

**Key Files**:
- `ogre-desktop/src/pages/Browser.svelte` — Manages webview, grading panel state, bound calculations (lines 68-99)
- `ogre-desktop/src/pages/GradingPanel.svelte` — Grading UI component (currently in layout flow)
- `ogre-desktop/src/lib/browser.ts` — Webview Tauri command wrappers
- `ogre-desktop/src-tauri/src/lib.rs` — Rust Tauri commands for webview control

### Research Findings
- **Webview bounds**: Currently dynamic based on sidebar + grading panel state (Browser.svelte:68-99)
- **Grading panel**: Absolute positioned but constrained within layout, affects `updateWebviewBounds()`
- **No floating button**: No UI element overlaid on webview to toggle panel
- **State persistence**: Already exists via Tauri storage (`getSetting`, `setSetting` in lib/db.ts)
- **Screenshot capture**: `captureWebviewScreenshot()` in browser.ts captures webview content

### Key Differences from Chrome Extension Plan
- **No content scripts**: Desktop app doesn't inject scripts into webview (unless we add it explicitly)
- **Svelte-first**: Can use Svelte components for overlay UI instead of vanilla JS Shadow DOM
- **Tauri webview**: Different from iframe — webview is a separate OS window, not DOM element
- **Z-index layering**: Svelte overlays naturally layer above Tauri webview via CSS

---

## Work Objectives

### Core Objective
Convert GradingPanel from a layout-constrained sidebar into an overlay drawer that floats on top of the webview. Add a floating toggle button visible over the webview. The webview bounds remain fixed (full viewport minus nav/sidebar) regardless of drawer state.

### Concrete Deliverables
- Floating O.G.R.E toggle button (Svelte component overlaid on webview position)
- GradingPanel with `position: fixed` overlay styling (z-index above webview)
- Browser.svelte updated: webview bounds ignore grading panel state
- Drawer state persistence (width + open/closed via Tauri storage)
- Screenshot coordination (hide drawer before webview capture)

### Definition of Done
- [ ] Floating button appears over webview (bottom-right)
- [ ] Clicking button toggles drawer open/closed with slide animation
- [ ] Drawer overlays webview without changing webview bounds
- [ ] Drawer is resizable by dragging left edge
- [ ] Drawer width and open/closed state persist across app restarts
- [ ] Screenshots exclude the drawer overlay
- [ ] All grading modes work in drawer (grader, solver, batch, discover)

### Must Have
- Floating button: circular, bottom-right over webview, shows O.G.R.E logo
- Drawer: position fixed, right-aligned, slides in/out with CSS transition
- Resize handle: left edge drag interaction (min 360px, max 80% viewport)
- State persistence: `ogreDrawerState` in Tauri storage (`{ open: boolean, width: number }`)
- Screenshot coordination: hide drawer before `captureWebviewScreenshot()`, show after
- Z-index layering: drawer above webview, below screenshot overlay

### Must NOT Have (Guardrails)
- DO NOT modify GradingPanel child components (ProviderSelector, RubricCard, StudentWorkCard, etc.)
- DO NOT change webview Tauri commands in lib.rs (unless necessary for overlay coordination)
- DO NOT add keyboard shortcuts (separate follow-up)
- DO NOT modify grading logic, API calls, or batch grading flow
- DO NOT add complex animations — simple CSS slide transition
- DO NOT make floating button elaborate — simple circle with logo

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest for TS/Svelte, Tauri dev mode for manual QA)
- **Automated tests**: YES (tests-after for utility functions where feasible)
- **Framework**: vitest
- **QA Method**: Tauri dev mode (`npm run tauri:dev`), manual interaction verification via screenshots/logs

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Visual verification**: Screenshots of drawer states (collapsed, expanded, resizing)
- **Bounds verification**: Confirm webview bounds don't change when drawer opens/closes
- **State verification**: Check Tauri storage for persisted drawer state
- **Screenshot testing**: Capture webview with drawer open, verify drawer excluded

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 2 parallel):
├── Task 1: Floating button component (Svelte overlay on webview position) [visual-engineering]
└── Task 2: Convert GradingPanel to fixed overlay with slide animation [visual-engineering]

Wave 2 (Integration — 3 parallel, after Wave 1):
├── Task 3: Remove grading panel from webview bounds calculation [quick]
├── Task 4: Resize handle + drag interaction [visual-engineering]
└── Task 5: State persistence (width + open/closed) [quick]

Wave 3 (Coordination — 2 parallel, after Wave 2):
├── Task 6: Screenshot coordination (hide drawer during capture) [unspecified-high]
└── Task 7: Z-index layering + integration QA [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA in Tauri dev mode (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → Final
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3, 7 | 1 |
| 2 | — | 4, 6, 7 | 1 |
| 3 | 1 | 7 | 2 |
| 4 | 2 | 5, 7 | 2 |
| 5 | 4 | 7 | 2 |
| 6 | 2 | 7 | 3 |
| 7 | 3, 4, 5, 6 | Final | 3 |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `visual-engineering`, T2 → `visual-engineering`
- **Wave 2**: 3 tasks — T3 → `quick`, T4 → `visual-engineering`, T5 → `quick`
- **Wave 3**: 2 tasks — T6 → `unspecified-high`, T7 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

### Wave 1 — Foundation

- [ ] 1. Floating Button Component — Svelte Overlay on Webview Position

  **What to do**:
  - Create new Svelte component `FloatingDrawerButton.svelte` in `ogre-desktop/src/components/`
  - Position: `position: fixed`, `bottom: 20px`, `right: 20px`, `z-index: 10` (above webview, below drawer)
  - Style: Circular button (40px diameter), shows O.G.R.E logo (use existing `favicon.png` or inline SVG)
  - Props: `{onclick}` callback function
  - Hover effect: subtle scale/shadow change, `cursor: pointer`
  - In `Browser.svelte`, import and render `<FloatingDrawerButton onclick={toggleDrawer} />` after the webview area
  - The button should appear over the webview position (use CSS positioning relative to viewport)
  - Add click handler that calls a `toggleDrawer()` function (will wire to grading panel in Task 2)

  **Must NOT do**:
  - Do NOT modify GradingPanel yet (Task 2)
  - Do NOT add complex animations
  - Do NOT make button draggable

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with positioning, styling, hover effects
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: For crafting polished button UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/ScreenshotOverlay.svelte` — Example of fixed-position Svelte overlay component
  - `ogre-desktop/src/pages/Browser.svelte:24-37` — State management pattern for boolean toggles

  **WHY Each Reference Matters**:
  - ScreenshotOverlay shows how to create a full-viewport fixed overlay in this codebase
  - Browser.svelte state pattern is what we'll use for `showGradingPanel` toggle

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Floating button component exists
    Tool: Bash
    Steps:
      1. Verify file exists: ogre-desktop/src/components/FloatingDrawerButton.svelte
      2. Read component, verify: position: fixed, bottom: 20px, right: 20px
      3. Verify: onclick prop is defined and called on button click
      4. Verify: button shows logo (favicon.png or SVG)
    Expected Result: Component structure correct
    Evidence: .sisyphus/evidence/task-1-button-component.txt

  Scenario: Button renders in Browser.svelte
    Tool: Bash
    Steps:
      1. Read Browser.svelte
      2. Verify: FloatingDrawerButton is imported
      3. Verify: <FloatingDrawerButton> is rendered in template
      4. Verify: onclick={toggleDrawer} is passed (toggleDrawer function exists)
    Expected Result: Button integrated into Browser page
    Evidence: .sisyphus/evidence/task-1-button-integration.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(desktop): add floating drawer toggle button`
  - Files: `ogre-desktop/src/components/FloatingDrawerButton.svelte`, `ogre-desktop/src/pages/Browser.svelte`

- [ ] 2. Convert GradingPanel to Fixed Overlay with Slide Animation

  **What to do**:
  - In `GradingPanel.svelte`, change positioning strategy:
    - Add CSS: `position: fixed; top: 0; right: 0; height: 100vh; z-index: 20;`
    - Remove any layout flow styles (flex, grid parent constraints)
  - Implement slide animation:
    - Closed state: `transform: translateX(100%)` (offscreen right)
    - Open state: `transform: translateX(0)`
    - CSS transition: `transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
  - Update `isCollapsed` prop to control slide state (rename to `isOpen` for clarity if desired)
  - Ensure panel width is controlled by `width` prop (default 400px)
  - Background: dark theme to match app (`#0d1117` or from CSS variables)
  - Border-left: `1px solid rgba(255,255,255,0.1)`
  - Box-shadow: `-4px 0 20px rgba(0,0,0,0.3)`

  **Must NOT do**:
  - Do NOT modify child components (ProviderSelector, RubricCard, etc.)
  - Do NOT change grading logic or mode switching
  - Do NOT add resize handle (Task 4)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS positioning, animations, visual transitions
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 4, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-100` — Current component structure to modify
  - `ogre-desktop/src/components/ScreenshotOverlay.svelte` — Fixed overlay positioning pattern

  **WHY Each Reference Matters**:
  - GradingPanel is the file being modified — need to see current structure
  - ScreenshotOverlay shows the fixed overlay pattern used in this codebase

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GradingPanel has fixed overlay positioning
    Tool: Bash
    Steps:
      1. Read GradingPanel.svelte
      2. Verify: position: fixed, top: 0, right: 0, height: 100vh
      3. Verify: z-index: 20 (above webview)
      4. Verify: transform transition for slide animation
      5. Verify: closed state uses translateX(100%)
    Expected Result: Overlay positioning correct
    Evidence: .sisyphus/evidence/task-2-overlay-positioning.txt

  Scenario: Slide animation works with isCollapsed prop
    Tool: Bash
    Steps:
      1. Read GradingPanel.svelte
      2. Verify: isCollapsed prop controls transform value
      3. Verify: CSS transition applied to transform
    Expected Result: Animation logic correct
    Evidence: .sisyphus/evidence/task-2-slide-animation.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(desktop): convert GradingPanel to fixed overlay with slide animation`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`

### Wave 2 — Integration

- [ ] 3. Remove Grading Panel from Webview Bounds Calculation

  **What to do**:
  - In `Browser.svelte`, update `updateWebviewBounds()` function (lines 68-99):
    - Remove `gradingPanelCurrentWidth` calculation (lines 84-87)
    - Remove grading panel width from webview width calculation (line 91)
    - Webview should now occupy: `x: sidebarWidth, width: window.innerWidth - sidebarWidth`
    - The webview bounds should ONLY account for: sidebar width, nav bar height, presets panel height
    - Grading panel overlay does NOT affect webview bounds
  - Test: Toggle grading panel open/closed → webview bounds should NOT change

  **Must NOT do**:
  - Do NOT remove `showGradingPanel` state (still needed for rendering grading panel)
  - Do NOT modify sidebar or nav bar bounds logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small focused change to bounds calculation logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Browser.svelte:68-99` — Current `updateWebviewBounds()` function to modify

  **WHY Each Reference Matters**:
  - This is the exact function being changed — need to see current logic

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Webview bounds exclude grading panel
    Tool: Bash
    Steps:
      1. Read Browser.svelte updateWebviewBounds() function
      2. Verify: gradingPanelCurrentWidth calculation is removed
      3. Verify: width calculation is: window.innerWidth - sidebarWidth (no grading panel subtraction)
      4. Verify: showGradingPanel is NOT used in bounds calculation
    Expected Result: Grading panel removed from bounds logic
    Evidence: .sisyphus/evidence/task-3-bounds-calculation.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [ ] 4. Resize Handle + Drag Interaction

  **What to do**:
  - In `GradingPanel.svelte`, add resize handle to left edge:
    - `<div class="resize-handle">` positioned `absolute; left: 0; top: 0; width: 6px; height: 100%; cursor: ew-resize;`
    - Transparent by default, subtle highlight on hover (`background: rgba(88, 166, 255, 0.3)`)
  - Implement drag-to-resize:
    - `mousedown` on handle: start resize mode
    - `mousemove` on document: update width (`newWidth = window.innerWidth - e.clientX`)
    - `mouseup` on document: end resize mode
  - Constraints:
    - Min width: `360px`
    - Max width: `80%` of viewport width
  - Update the `width` prop bindable to reflect new width during resize
  - Store final width for Task 5 to persist

  **Must NOT do**:
  - Do NOT persist width to storage (Task 5)
  - Do NOT add vertical resize

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Drag interaction, pointer events, visual feedback
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-17` — Current component props (width is bindable)

  **WHY Each Reference Matters**:
  - Need to understand the current width prop binding pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Resize handle exists with correct styling
    Tool: Bash
    Steps:
      1. Read GradingPanel.svelte
      2. Verify: resize handle element with cursor: ew-resize
      3. Verify: positioned absolute, left: 0, full height
      4. Verify: hover highlight style exists
    Expected Result: Handle structure correct
    Evidence: .sisyphus/evidence/task-4-resize-handle.txt

  Scenario: Drag interaction respects constraints
    Tool: Bash
    Steps:
      1. Verify: mousedown/mousemove/mouseup event handlers exist
      2. Verify: min width 360px constraint
      3. Verify: max width 80% viewport constraint
      4. Verify: width prop is updated during drag
    Expected Result: Constraints and binding correct
    Evidence: .sisyphus/evidence/task-4-resize-logic.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [ ] 5. State Persistence — Width + Open/Closed in Tauri Storage

  **What to do**:
  - In `Browser.svelte`, use existing Tauri storage functions (`getSetting`, `setSetting` from lib/db.ts):
    - Key: `'ogreDrawerState'`
    - Value: `{ open: boolean, width: number }`
  - On drawer toggle (in `toggleDrawer()` or wherever `showGradingPanel` is set): save state
  - On resize end (from Task 4): save width
  - On component mount (`onMount`): load saved state and apply:
    - If `open: true`, set `showGradingPanel = true` (drawer opens immediately, no animation on restore)
    - Apply saved `width` to `gradingPanelWidth`
  - Default state if none saved: `{ open: false, width: 400 }`

  **Must NOT do**:
  - Do NOT persist other state (provider config, mode) — already handled elsewhere

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple Tauri storage get/set calls
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/db.ts` — `getSetting`, `setSetting` functions (Tauri storage wrappers)
  - `ogre-desktop/src/pages/Browser.svelte:24-37` — Current state variables to persist

  **WHY Each Reference Matters**:
  - db.ts shows the storage API pattern used in this codebase
  - Browser.svelte has the state variables that need persistence

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: State is saved on toggle and resize
    Tool: Bash
    Steps:
      1. Read Browser.svelte
      2. Verify: toggleDrawer() or showGradingPanel setter calls setSetting('ogreDrawerState', ...)
      3. Verify: resize end handler calls setSetting with updated width
      4. Verify: default state is { open: false, width: 400 }
    Expected Result: Save logic present
    Evidence: .sisyphus/evidence/task-5-state-save.txt

  Scenario: State is restored on mount
    Tool: Bash
    Steps:
      1. Read Browser.svelte
      2. Verify: onMount calls getSetting('ogreDrawerState')
      3. Verify: if open: true, showGradingPanel is set to true
      4. Verify: saved width is applied to gradingPanelWidth
    Expected Result: Restore logic present
    Evidence: .sisyphus/evidence/task-5-state-restore.txt
  ```

  **Commit**: YES
  - Message: `feat(desktop): add drawer resize handle and state persistence`
  - Files: `ogre-desktop/src/pages/Browser.svelte`, `ogre-desktop/src/pages/GradingPanel.svelte`

### Wave 3 — Coordination

- [ ] 6. Screenshot Coordination — Hide Drawer During Capture

  **What to do**:
  - In `Browser.svelte` or `GradingPanel.svelte`, coordinate drawer visibility with webview screenshot capture:
    - When screenshot is triggered (in `GradingPanel.handleScreenshot()` at line 73):
      1. Before calling `captureWebviewScreenshot()`, hide the drawer (set `showGradingPanel = false` or add `hidden` class)
      2. Call `captureWebviewScreenshot()`
      3. After capture completes, restore drawer visibility
    - Alternative: Add a `hideForScreenshot` prop/state to GradingPanel that hides it via CSS (display: none or opacity: 0) temporarily
  - Ensure the floating button is ALSO hidden during screenshot capture
  - Test: Captured screenshot should NOT include drawer or floating button

  **Must NOT do**:
  - Do NOT modify GradingPanel's grading logic
  - Do NOT change screenshot quality or format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-component timing coordination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:73-88` — Current `handleScreenshot()` function
  - `ogre-desktop/src/lib/browser.ts` — `captureWebviewScreenshot()` function

  **WHY Each Reference Matters**:
  - handleScreenshot is where the coordination needs to happen
  - Need to understand the screenshot capture flow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Drawer hides before screenshot capture
    Tool: Bash
    Steps:
      1. Read GradingPanel.svelte handleScreenshot() function
      2. Verify: drawer visibility is toggled off BEFORE captureWebviewScreenshot()
      3. Verify: drawer visibility is restored AFTER capture completes
      4. Verify: floating button is also hidden during capture
    Expected Result: Hide/show timing correct
    Evidence: .sisyphus/evidence/task-6-screenshot-coordination.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [ ] 7. Z-Index Layering + Integration QA

  **What to do**:
  - Verify z-index layering across all UI elements:
    - ScreenshotOverlay: z-index `9999` or higher (highest)
    - GradingPanel drawer: z-index `20`
    - FloatingDrawerButton: z-index `10`
    - Webview: z-index `0` (default)
  - Add comment block in GradingPanel.svelte documenting the z-index hierarchy
  - **Integration QA** — Run the app in dev mode (`npm run tauri:dev`):
    1. Verify floating button appears over webview
    2. Click button → drawer slides in
    3. Resize drawer by dragging left edge
    4. Close app, reopen → drawer state persists (width + open/closed)
    5. Take screenshot → verify drawer excluded
    6. Switch modes (grader, solver, batch, discover) → all work in drawer
    7. Test webview navigation → floating button persists across page loads
  - Take screenshots at each step, save to evidence folder

  **Must NOT do**:
  - Do NOT fix bugs found during QA — document as issues
  - This is verification only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive integration testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final integration task)
  - **Parallel Group**: Wave 3
  - **Blocks**: Final
  - **Blocked By**: Tasks 3, 4, 5, 6

  **References**:

  **Pattern References**:
  - All previous tasks — consolidated verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Z-index hierarchy is correct
    Tool: Bash
    Steps:
      1. Read GradingPanel.svelte for z-index value (should be 20)
      2. Read FloatingDrawerButton.svelte for z-index (should be 10)
      3. Read ScreenshotOverlay.svelte for z-index (should be 9999+)
      4. Verify: comment documenting hierarchy exists
    Expected Result: Layering correct
    Evidence: .sisyphus/evidence/task-7-zindex.txt

  Scenario: Full drawer workflow in dev mode
    Tool: Manual (run tauri:dev, interact, screenshot)
    Steps:
      1. Run npm run tauri:dev
      2. Navigate to a test page in webview
      3. Verify floating button visible over webview
      4. Click button → drawer slides in
      5. Resize drawer
      6. Close and reopen app → state persists
      7. Take webview screenshot → drawer excluded
    Expected Result: All interactions work as expected
    Evidence: .sisyphus/evidence/task-7-integration-qa-{step}.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): complete drawer overlay with floating button, screenshot coordination`
  - Files: `ogre-desktop/src/pages/Browser.svelte`, `ogre-desktop/src/pages/GradingPanel.svelte`, `ogre-desktop/src/components/FloatingDrawerButton.svelte`

### Wave FINAL — Verification

- [ ] F1. Plan Compliance Audit (Oracle)

  **What to do**:
  - Consult Oracle to verify all plan requirements were met
  - Review all deliverables against "Definition of Done" checklist
  - Identify any gaps or deviations from the plan

  **Recommended Agent Profile**:
  - **Category**: `oracle`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final (with F2, F3, F4)
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - Oracle confirms all "Must Have" items implemented
  - Oracle confirms all "Must NOT Have" guardrails respected
  - Evidence: .sisyphus/evidence/f1-compliance-audit.txt

  **Commit**: NO

- [ ] F2. Code Quality Review

  **What to do**:
  - Review all changed files for:
    - TypeScript type safety (no `any`, proper interfaces)
    - Svelte best practices (proper reactivity, lifecycle usage)
    - CSS organization (no inline styles where avoidable)
    - Error handling (try/catch around Tauri calls)
  - Run linter if configured
  - Verify no console errors in dev mode

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - No type errors in changed files
  - No linter violations
  - Evidence: .sisyphus/evidence/f2-code-quality.txt

  **Commit**: NO

- [ ] F3. Real Manual QA

  **What to do**:
  - Run full app workflow in Tauri dev mode:
    1. Launch app, navigate to grading sites
    2. Test all drawer interactions (open, close, resize, persist)
    3. Test all grading modes through the drawer
    4. Test screenshot capture with drawer open
    5. Test webview navigation with drawer open
  - Document any bugs or issues found (for follow-up)
  - Take screenshots of final working state

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - All core workflows verified functional
  - Evidence: .sisyphus/evidence/f3-manual-qa-report.md

  **Commit**: NO

- [ ] F4. Scope Fidelity Check

  **What to do**:
  - Deep review: does the implementation match the original user request?
  - Verify: floating button over webview, drawer overlay, no layout shift
  - Confirm: all "Definition of Done" items checked off

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - Implementation matches user's original vision
  - No scope creep or missing features
  - Evidence: .sisyphus/evidence/f4-scope-fidelity.txt

  **Commit**: NO

---

## Notes

### Key Differences from Chrome Extension Version

1. **No content script injection**: Desktop app doesn't need `drawer.js` injected into webview — floating button is a Svelte component overlaid via CSS
2. **Svelte-first approach**: Use Svelte components and reactivity instead of vanilla JS Shadow DOM
3. **Tauri storage**: Use `getSetting`/`setSetting` instead of `chrome.storage.local`
4. **Webview is separate window**: Z-index layering works via Svelte overlays naturally appearing above the webview
5. **No manifest.json**: No need for web_accessible_resources or content_scripts config

### Risks & Mitigations

**Risk**: Floating button might not appear over Tauri webview (webview is OS-level window)
**Mitigation**: Use CSS fixed positioning in Svelte — should work as webview is embedded in app layout

**Risk**: Screenshot capture timing — drawer might appear in captured image
**Mitigation**: Explicit hide/show coordination in handleScreenshot() (Task 6)

**Risk**: Webview resize on drawer open/close (old behavior)
**Mitigation**: Task 3 explicitly removes grading panel from bounds calculation

---

## Success Criteria

- [ ] Floating button visible over webview in all states
- [ ] Drawer slides in/out smoothly without webview resize
- [ ] All grading modes work identically to current implementation
- [ ] State persists across app restarts
- [ ] Screenshots exclude drawer and floating button
- [ ] No regressions in existing functionality

---

## Follow-Up Work (Out of Scope)

- Keyboard shortcut to toggle drawer (e.g., Ctrl+D)
- Drawer position (left vs right) user preference
- Multiple drawer tabs (grading, history, settings)
- Drawer animations (spring physics, parallax)
- Mobile/touch support (not applicable for desktop app)
