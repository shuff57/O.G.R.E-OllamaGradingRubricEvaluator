# Fix Drawer Resize Performance on Webview Page

## TL;DR

> **Quick Summary**: Fix sluggish GradingPanel drawer resize by adding RAF batching to the drag handler and disabling CSS transitions during drag. Single-file fix in GradingPanel.svelte (~30 lines changed).
> 
> **Deliverables**:
> - Smooth 60fps drawer resize drag with no IPC flood
> - No visual gap between webview and panel after drag ends
> - Ctrl+B toggle guarded during active drag
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - single task
> **Critical Path**: Task 1 → Final Verification

---

## Context

### Original Request
User reports: "when I resize the extension on the webview page, its slow to adjust"

### Interview Summary
**Key Discussions**:
- Root cause identified: every mousemove during drag triggers an unthrottled chain of Svelte reactive update, DOM measurements, async IPC to Rust, and two separate Tauri webview operations
- CSS `transition: width 0.3s` on `.grading-panel` conflicts with programmatic width changes during drag
- User confirmed scope: just fix the resize perf, no window resize handler optimization needed

**Research Findings**:
- `handleResizeMove` (GradingPanel.svelte:180) updates `width` directly on every mousemove with no RAF batching
- Browser.svelte reactive block (lines 101-109) fires `tick().then(updateWebviewBounds)` on every width change
- The 300ms debounced `setSetting` for DB writes actually works correctly during drag (keeps resetting, only fires after mouseup) - NOT a problem
- The 3x `getBoundingClientRect()` calls are consecutive reads with no interleaving writes, so browser batches them - NOT layout thrashing. Real bottleneck is IPC call frequency
- `drawer-injection.js` (Chrome extension version) already has a `.resizing` class pattern (lines 262-265) that disables transitions during resize - proven pattern to port
- **Critical finding**: GradingPanel uses Svelte 5 runes (`$state`, `$props`), Browser.svelte uses Svelte 4 syntax (`$:` blocks). Must not mix syntaxes across files

### Metis Review
**Identified Gaps** (addressed):
- Cross-component signal for resize state: Resolved by keeping RAF batching entirely within GradingPanel.svelte - Browser.svelte's reactive block naturally fires at RAF rate since the binding only updates at RAF rate
- Ctrl+B during drag edge case: Added guard to prevent toggleCollapse during active resize
- DB write during drag concern: Debunked - existing 300ms debounce already handles this correctly
- Browser.svelte changes: None needed - RAF batching in GradingPanel handles IPC throttling implicitly via the Svelte binding
- Build verification: Added as acceptance criterion due to mixed Svelte 4/5 syntax

---

## Work Objectives

### Core Objective
Eliminate resize lag by throttling width updates to animation frame rate and removing CSS transition conflicts during drag.

### Concrete Deliverables
- Modified `ogre-desktop/src/pages/GradingPanel.svelte` with RAF-batched resize and `.resizing` CSS class

### Definition of Done
- [ ] `npm run build` in `ogre-desktop/` exits with code 0
- [ ] Drawer resize updates at RAF rate (max ~60 calls/sec) instead of unbounded mousemove rate
- [ ] CSS transition disabled during active drag via `.resizing` class
- [ ] Final webview bounds match panel width exactly after mouseup
- [ ] Non-drag interactions (toggle collapse, panel visibility) still trigger immediate bounds updates

### Must Have
- RAF batching in `handleResizeMove` so width updates only propagate at display refresh rate
- `.resizing` CSS class that disables width transition during drag
- Final bounds flush in `handleResizeEnd` (cancelAnimationFrame + apply final width)
- RAF cleanup in `onDestroy` if drag is interrupted by component destruction
- `toggleCollapse` guarded by `isResizing` to prevent conflicts

### Must NOT Have (Guardrails)
- **No changes to Browser.svelte** - RAF batching in GradingPanel handles the throttling implicitly via Svelte binding propagation
- **No changes to lib.rs** - the Rust backend is not the bottleneck, call frequency is
- **No changes to browser.ts** - the IPC wrapper is a thin passthrough
- **No changes to drawer-injection.js** - that's the Chrome extension version, not Tauri desktop
- **No Svelte syntax mixing** - use Svelte 5 runes (`$state`, `$effect`, `onclick={}`) in GradingPanel.svelte only
- **No throttling of non-drag interactions** - collapse toggle, panel visibility, presets changes must remain immediate
- **No keyboard resize optimization** - deferred as fast-follow
- **No over-abstraction** - this is a ~30-line targeted fix, not a utility library

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO - this is a performance/UX fix affecting native webview IPC timing; not meaningfully unit-testable
- **Framework**: vitest exists but not applicable here

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build verification**: Bash (`npm run build`)
- **Static code verification**: Bash (grep for RAF calls, CSS rules)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task — the fix):
└── Task 1: RAF-batch drawer resize + disable CSS transition during drag [quick]

Wave FINAL (After Task 1 — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Build + static verification (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → F1-F4
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | F1-F4  |
| F1   | 1         | —      |
| F2   | 1         | —      |
| F3   | 1         | —      |
| F4   | 1         | —      |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. RAF-batch drawer resize and disable CSS transition during drag

  **What to do**:
  - Add local (non-reactive) variables `rafId` and `pendingWidth` to hold the pending resize state outside of Svelte's reactive system
  - Modify `handleResizeMove` to store the calculated width in `pendingWidth` and schedule a `requestAnimationFrame` callback that sets `width = pendingWidth` (only one RAF pending at a time — skip scheduling if `rafId` is already set)
  - Modify `handleResizeEnd` to: cancel any pending RAF via `cancelAnimationFrame(rafId)`, flush the final width (`width = pendingWidth`), reset `rafId`, then run existing cleanup (remove listeners, reset cursor/userSelect)
  - Add `class:resizing={isResizing}` to the `.grading-panel` div element (line 216)
  - Add CSS rule `.grading-panel.resizing { transition: none !important; }` in the scoped `<style>` block
  - Guard `toggleCollapse()` with `if (isResizing) return;` at the top of the function (line 60-62)
  - Add `cancelAnimationFrame(rafId)` to the `onDestroy` cleanup block (inside the `if (isResizing)` guard, line 207)

  **Must NOT do**:
  - Do NOT use `$state()` for `rafId` or `pendingWidth` — these are intentionally non-reactive local variables
  - Do NOT modify Browser.svelte — the RAF batching in GradingPanel naturally throttles binding propagation
  - Do NOT modify the keyboard resize handler (`handleResizeKeydown`) — that's a separate fast-follow
  - Do NOT use Svelte 4 syntax (`$:`, `on:click={}`) — this file uses Svelte 5 runes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, ~30 lines modified, well-defined implementation steps
  - **Skills**: []
    - No special skills needed — straightforward DOM/JS performance fix
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not applicable — no visual design changes, purely performance
    - `playwright`: Not applicable — Tauri desktop app can't be tested via browser automation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (only task)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/pages/GradingPanel.svelte:144-199` — Current resize logic: `isResizing` state, `handleResizeStart`, `handleResizeMove`, `handleResizeEnd`. This is the code being modified. Note Svelte 5 runes syntax (`$state`, `$props`, `$bindable`, `onclick={}`)
  - `ogre-desktop/src/pages/GradingPanel.svelte:205-213` — Existing `onDestroy` cleanup for resize listeners. Add RAF cleanup here
  - `ogre-desktop/src/pages/GradingPanel.svelte:60-62` — `toggleCollapse()` function. Add `isResizing` guard here
  - `ogre-desktop/src/pages/GradingPanel.svelte:216` — Template div with `class:collapsed={isCollapsed}`. Add `class:resizing={isResizing}` here
  - `ogre-desktop/src/pages/GradingPanel.svelte:333-342` — `.grading-panel` CSS rules including the `transition: width 0.3s` that needs to be overridden. Add `.resizing` rule nearby
  - `ogre-desktop/src/pages/Browser.svelte:132-152` — `handleSidebarChanged()` uses RAF animation loop pattern. Follow this pattern for the RAF batching approach (requestAnimationFrame + cancelAnimationFrame)
  - `ogre-desktop/src/drawer-injection.js:262-265` — `.resizing` class pattern that disables transitions during resize. Port this proven pattern

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/pages/GradingPanel.svelte:15-21` — `$bindable()` props: `isCollapsed` and `width`. The `width` prop is what gets throttled by the RAF batching
  - `ogre-desktop/src/pages/Browser.svelte:101-109` — Reactive block watching `gradingPanelWidth`. This fires whenever GradingPanel's `width` binding updates. By throttling width updates to RAF rate in GradingPanel, this block naturally fires at RAF rate too — no changes needed here

  **External References**:
  - `requestAnimationFrame` / `cancelAnimationFrame` — standard Web API for frame-rate-limited updates

  **WHY Each Reference Matters**:
  - GradingPanel.svelte:144-199 — This IS the code being modified. Read it to understand current flow before making changes
  - Browser.svelte:132-152 — Shows the RAF pattern already used in this codebase. Follow it for consistency
  - Browser.svelte:101-109 — Understand WHY no changes are needed here: the reactive block fires when `width` changes, and RAF-batching `width` updates in GradingPanel naturally limits how often this fires
  - drawer-injection.js:262-265 — Proven `.resizing` class pattern. Copy the CSS approach
  - GradingPanel.svelte:333-342 — The CSS `transition: width 0.3s` that causes the visual conflict during drag. The new `.resizing` rule overrides this

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds with modified GradingPanel
    Tool: Bash
    Preconditions: ogre-desktop/node_modules exists (npm install if needed)
    Steps:
      1. Run `npm run build` in ogre-desktop/
      2. Check exit code is 0
      3. Check stderr for no Svelte compilation errors
    Expected Result: Build completes with exit code 0, no errors
    Failure Indicators: Non-zero exit code, "Error" in output, Svelte syntax errors
    Evidence: .sisyphus/evidence/task-1-build-succeeds.txt

  Scenario: RAF batching is present in handleResizeMove
    Tool: Bash (grep)
    Preconditions: GradingPanel.svelte has been modified
    Steps:
      1. Search for `requestAnimationFrame` in ogre-desktop/src/pages/GradingPanel.svelte
      2. Verify it appears inside or near handleResizeMove function
      3. Search for `cancelAnimationFrame` in the same file
      4. Verify it appears in both handleResizeEnd and onDestroy
    Expected Result: 
      - `requestAnimationFrame` found at least 1 time (in handleResizeMove)
      - `cancelAnimationFrame` found at least 2 times (in handleResizeEnd + onDestroy)
    Failure Indicators: Zero matches for either API
    Evidence: .sisyphus/evidence/task-1-raf-present.txt

  Scenario: CSS resizing class disables transition
    Tool: Bash (grep)
    Preconditions: GradingPanel.svelte has been modified
    Steps:
      1. Search for `.resizing` or `class:resizing` in GradingPanel.svelte
      2. Verify CSS rule contains `transition: none` or `transition-property: none`
      3. Verify template has `class:resizing={isResizing}` on the .grading-panel div
    Expected Result: 
      - `.grading-panel.resizing` CSS rule exists with transition override
      - `class:resizing={isResizing}` present in template
    Failure Indicators: Missing CSS rule or missing class binding
    Evidence: .sisyphus/evidence/task-1-resizing-css.txt

  Scenario: toggleCollapse guarded during drag — error path
    Tool: Bash (grep)
    Preconditions: GradingPanel.svelte has been modified
    Steps:
      1. Search for `toggleCollapse` function in GradingPanel.svelte
      2. Verify it contains an early return guard checking `isResizing`
    Expected Result: `toggleCollapse` contains `if (isResizing) return` or equivalent guard
    Failure Indicators: No guard present in toggleCollapse
    Evidence: .sisyphus/evidence/task-1-toggle-guard.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-build-succeeds.txt — npm run build output
  - [ ] task-1-raf-present.txt — grep results for RAF APIs
  - [ ] task-1-resizing-css.txt — grep results for .resizing class
  - [ ] task-1-toggle-guard.txt — grep results for toggleCollapse guard

  **Commit**: YES
  - Message: `fix(desktop): throttle drawer resize with RAF batching to eliminate lag`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

---

## Final Verification Wave (MANDATORY - after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection -> fix -> re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (grep for RAF calls, .resizing class, toggleCollapse guard, onDestroy cleanup). For each "Must NOT Have": search codebase for forbidden changes — reject with file:line if Browser.svelte, lib.rs, browser.ts, or drawer-injection.js were modified. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build` in ogre-desktop/. Review GradingPanel.svelte for: correct Svelte 5 syntax (no $: blocks, no on:click), no `$state()` on rafId/pendingWidth (must be plain let), proper RAF lifecycle (request in move, cancel in end+destroy), no memory leaks. Check for AI slop: excessive comments, unnecessary abstractions, dead code.
  Output: `Build [PASS/FAIL] | Syntax [CORRECT/WRONG] | RAF Lifecycle [COMPLETE/INCOMPLETE] | VERDICT`

- [x] F3. **Build + Static Verification** — `unspecified-high`
  Run `npm run build` in ogre-desktop/. Execute ALL grep-based QA scenarios from Task 1. Verify: requestAnimationFrame in handleResizeMove, cancelAnimationFrame in handleResizeEnd AND onDestroy, .grading-panel.resizing CSS rule with transition override, class:resizing binding, toggleCollapse isResizing guard. Save all evidence.
  Output: `Build [PASS/FAIL] | RAF [FOUND/MISSING] | CSS [FOUND/MISSING] | Guard [FOUND/MISSING] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Run `git diff` to see ALL changed files. Verify ONLY `ogre-desktop/src/pages/GradingPanel.svelte` was modified. Check that NO other files were touched (especially Browser.svelte, lib.rs, browser.ts, drawer-injection.js). Verify no new files were created (except evidence). Check that handleResizeKeydown was NOT modified (out of scope). Flag any unaccounted changes.
  Output: `Files Changed [N — expected 1] | Forbidden Files [CLEAN/N issues] | Scope Creep [CLEAN/N items] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files | Pre-commit Check |
|------|---------------|-------|-----------------|
| 1    | `fix(desktop): throttle drawer resize with RAF batching to eliminate lag` | `ogre-desktop/src/pages/GradingPanel.svelte` | `cd ogre-desktop && npm run build` |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build  # Expected: exit code 0

# RAF batching present
grep -n "requestAnimationFrame" src/pages/GradingPanel.svelte  # Expected: >=1 match
grep -n "cancelAnimationFrame" src/pages/GradingPanel.svelte   # Expected: >=2 matches

# CSS transition override
grep -n "\.resizing" src/pages/GradingPanel.svelte  # Expected: CSS rule + class binding

# toggleCollapse guard  
grep -A2 "toggleCollapse" src/pages/GradingPanel.svelte  # Expected: isResizing guard

# Scope check - only GradingPanel changed
git diff --name-only  # Expected: only ogre-desktop/src/pages/GradingPanel.svelte
```

### Final Checklist
- [ ] All "Must Have" present (RAF batching, .resizing CSS, final flush, onDestroy cleanup, toggleCollapse guard)
- [ ] All "Must NOT Have" absent (no Browser.svelte changes, no lib.rs changes, no Svelte 4 syntax in GradingPanel)
- [ ] Build passes (`npm run build` exit 0)
- [ ] Only GradingPanel.svelte modified
