# Batch Mode → Guided Discovery Flow

## TL;DR

> **Quick Summary**: When Batch mode has no matching site profile, replace the "Start Batch" button with a "Discover This Page" CTA that transitions to an AI-powered discovery flow with step-by-step selector confirmation. After confirming critical selectors (Accept/Refine per selector), the profile saves automatically and the user is returned to Batch mode with the new profile pre-selected.
> 
> **Deliverables**:
> - New `confirmation-flow.ts` — pure state machine for step-by-step selector confirmation (TDD)
> - Enhanced `DiscoveryPanel.svelte` — new "confirming" phase with per-selector Accept/Refine UI
> - Enhanced `BatchPanel.svelte` — "Discover This Page" CTA when no profile found
> - Enhanced `GradingPanel.svelte` — callback props + `returnToBatch`/`preselectedProfileId` state
> - Tests for confirmation state machine, required selector logic, and round-trip profile matching
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 6 → F1-F4

---

## Context

### Original Request
When Batch mode has no profile, point the user to Discover mode so the page can be discovered and a profile built. As it discovers different relevant selectors, it should stop and confirm with the user so the profile is built accurately.

### Interview Summary
**Key Discussions**:
- **Discovery trigger**: CTA card in BatchPanel replacing "Start Batch" when no profile matches. Clicking auto-switches to Discovery tab.
- **Confirmation approach**: AI discovers ALL selectors at once (existing `runDiscovery()` flow), then present each required selector one-by-one. User can Accept or Refine (element picker).
- **Confirmation scope**: Required selectors only — mode-dependent (batch: studentSection, studentName, scoreInput; sequential: studentName, scoreInput). FeedbackBox optional.
- **Confirmation UI**: Highlight matching elements on page (orange dashed outline already exists), show match count + sample text, 2-button flow.
- **Post-discovery**: Auto-switch back to Batch tab with new profile pre-selected.
- **Mode communication**: Callback props via GradingPanel (parent mediates). No Svelte stores.
- **Test strategy**: TDD with vitest.

**Research Findings**:
- Panels mount/unmount on tab switch — no state persistence between tabs (GradingPanel uses `{#if activeMode === ...}`)
- Two selector type systems: `SelectorMap` (discover.ts, required fields) vs `SiteSelectors` (batch-grader.ts, all nullable)
- `batchRefineSelectors()` exists but always opens element picker — need new Accept/Refine logic
- `setMode()` accepts no context/payload — need parent state for return context
- Existing `onProfileSaved` callback on DiscoveryPanel (GradingPanel line 329)

### Metis Review
**Identified Gaps** (addressed):
- **Panel mount/unmount**: Store `returnToBatch` and `preselectedProfileId` in GradingPanel state (parent survives tab switches)
- **Profile auto-detect on return**: Pass profile ID explicitly via GradingPanel state, don't rely solely on `findProfilesByUrl()` auto-detect
- **Required selectors are mode-dependent**: Determine from `navigation.mode`, not hardcoded list
- **Partial cancel behavior**: Cancel mid-confirmation → return to review phase, not idle
- **Entry point agnostic**: "Auto-switch back to Batch" only fires when `returnToBatch` context exists
- **feedbackBox null case**: Show "Not detected — skip" in confirmation flow, don't block

---

## Work Objectives

### Core Objective
Bridge the gap between "no profile in Batch mode" and the existing Discovery capability by creating a guided, step-by-step selector confirmation flow that produces accurate profiles.

### Concrete Deliverables
- `ogre-desktop/src/lib/confirmation-flow.ts` — Pure state machine (new file)
- `ogre-desktop/src/lib/confirmation-flow.test.ts` — Full test coverage (new file)
- `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` — Enhanced with "confirming" phase
- `ogre-desktop/src/components/grading/BatchPanel.svelte` — CTA card for no-profile state
- `ogre-desktop/src/pages/GradingPanel.svelte` — Callback plumbing + parent state

### Definition of Done
- [x] `npx vitest run` passes all new + existing tests
- [x] Batch mode with no matching profile shows "Discover This Page" CTA
- [x] Discovery flow presents required selectors step-by-step with Accept/Refine
- [x] Saved profile auto-selected when returning to Batch tab
- [x] Clicking Discovery tab directly (not from Batch) still works normally

### Must Have
- "Discover This Page" CTA card in BatchPanel when no profile matches
- Step-by-step confirmation of required selectors (Accept / Refine)
- Page-level highlight of matching elements during each confirmation step
- Match count + sample text displayed per selector
- Profile save with auto-return to Batch tab
- New profile pre-selected on return
- TDD tests for confirmation state machine

### Must NOT Have (Guardrails)
- Do NOT modify `element-picker.ts` (386 lines of battle-tested injection JS)
- Do NOT modify `discover.ts` `runDiscovery()` function (AI pipeline works)
- Do NOT modify `BatchGrader` class in `batch-grader.ts`
- Do NOT modify `SelectorMap` or `SiteSelectors` TypeScript interfaces
- Do NOT modify existing test files
- Do NOT add Svelte stores — maintain props/callback architecture
- Do NOT add sequential mode confirmation (batch-mode confirmation only for now)
- Do NOT add ProfileManager integration
- Do NOT add URL pattern editing UI
- Do NOT add "re-discover" button mid-confirmation flow
- Do NOT add animations or scroll-to for highlights
- Do NOT over-abstract — no generic "wizard framework"

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD (Red-Green-Refactor)
- **Framework**: vitest with `vi.mock('./browser')` and `vi.mock('./element-picker')`
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Pure logic**: Use Bash (`npx vitest run <file>`) — run tests, assert pass counts
- **Svelte components**: Use Bash (`npx vitest run`) — verify no regressions. Agent reads component code for structural verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — pure logic + type helpers):
├── Task 1: confirmation-flow.ts TDD — state machine [deep]
├── Task 2: getRequiredSelectors() helper TDD [quick]
└── Task 3: GradingPanel.svelte callback plumbing [quick]

Wave 2 (UI — components consume Wave 1):
├── Task 4: BatchPanel.svelte CTA card (depends: 3) [quick]
├── Task 5: DiscoveryPanel.svelte confirmation phase (depends: 1, 2, 3) [deep]

Wave 3 (Integration — everything together):
├── Task 6: Round-trip integration + profile pre-select (depends: 4, 5) [unspecified-high]
└── Task 7: Edge cases + polish (depends: 6) [unspecified-high]

Wave FINAL (Verification — after ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 5 → Task 6 → Task 7 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1 | — | 5 |
| 2 | — | 5 |
| 3 | — | 4, 5 |
| 4 | 3 | 6 |
| 5 | 1, 2, 3 | 6 |
| 6 | 4, 5 | 7 |
| 7 | 6 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2 tasks** — T4 → `quick`, T5 → `deep`
- **Wave 3**: **2 tasks** — T6 → `unspecified-high`, T7 → `unspecified-high`
- **Wave FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Confirmation Flow State Machine (TDD)

  **What to do**:
  - RED: Create `ogre-desktop/src/lib/confirmation-flow.test.ts` with failing tests for:
    - `getRequiredSelectorKeys('batch')` returns `['studentSection', 'studentName', 'scoreInput']`
    - `getRequiredSelectorKeys('sequential')` returns `['studentName', 'scoreInput']`
    - `createConfirmationFlow()` initializes with correct first step
    - `accept()` advances to next step, stores confirmed selector
    - `refine()` replaces selector for current step and advances
    - `cancel()` sets phase to `'cancelled'`
    - `getState()` returns current step info (key, selector, validation, progress)
    - Completing all steps sets phase to `'complete'` and returns confirmed selectors map
    - Optional selectors (feedbackBox with null value) show "Not detected" and auto-skip
    - State machine rejects invalid transitions (accept when complete, etc.)
  - GREEN: Create `ogre-desktop/src/lib/confirmation-flow.ts` implementing:
    - `getRequiredSelectorKeys(mode: 'batch' | 'sequential'): SelectorKey[]`
    - `createConfirmationFlow(selectors: SelectorMap, validation: ValidationResults, mode: NavigationMode)` returning a `ConfirmationFlow` object
    - `ConfirmationFlow` interface: `accept()`, `refine(newSelector: string)`, `cancel()`, `back()`, `getState()`, `getConfirmedSelectors()`, `phase` getter
    - Phase type: `'pending' | 'confirming' | 'complete' | 'cancelled'`
    - Step state: `{ key: SelectorKey, selector: string | null, matchCount: number, sampleText: string, stepIndex: number, totalSteps: number }`
  - REFACTOR: Clean up, ensure types are exported, add JSDoc comments

  **Must NOT do**:
  - Do NOT import from browser.ts or element-picker.ts (this is pure logic, no DOM/webview)
  - Do NOT add Svelte-specific code
  - Do NOT modify existing type interfaces (SelectorMap, SiteSelectors)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core state machine logic requiring careful TDD discipline and thorough edge case handling
  - **Skills**: []
    - No special skills needed — pure TypeScript logic + vitest
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction in pure logic tests

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/discovery-picker-integration.ts:228-268` — `identifyAmbiguousSelectors()` function — pattern for iterating selectors and checking validation. Use this as reference for how to determine which selectors need attention.
  - `ogre-desktop/src/lib/discovery-picker-integration.ts:34-63` — `RefinementRequest` and `RefinementResult` types — follow this typing pattern for confirmation flow types
  - `ogre-desktop/src/lib/discovery-picker-integration.test.ts` — Test file — follow the mock patterns (`vi.mock('./browser')`, `vi.mock('./element-picker')`) and test structure

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/discover.ts:42-57` — `SelectorMap` interface — the selector structure the flow operates on
  - `ogre-desktop/src/lib/discover.ts:82-91` — `SelectorValidation` and `ValidationResults` types — validation data for each selector
  - `ogre-desktop/src/lib/discover.ts:20` — `NavigationMode` type (`'batch' | 'sequential'`)
  - `ogre-desktop/src/lib/discover.ts:37` — `SelectorKey` is `keyof SelectorMap`

  **External References**:
  - None needed — pure internal logic

  **WHY Each Reference Matters**:
  - `identifyAmbiguousSelectors()`: Shows how to iterate SelectorMap keys and check ValidationResults — exact same data shapes your state machine consumes
  - `RefinementRequest`/`RefinementResult`: Your state machine's step info has the same shape (key, selector, source)
  - Test file: Shows the exact `vi.mock` setup pattern to follow — mock browser, mock element-picker, test pure logic

  **Acceptance Criteria**:

  - [ ] Test file created: `ogre-desktop/src/lib/confirmation-flow.test.ts`
  - [ ] Implementation file created: `ogre-desktop/src/lib/confirmation-flow.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/confirmation-flow.test.ts` → PASS (10+ tests, 0 failures)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: State machine completes happy path for batch mode
    Tool: Bash (npx vitest run)
    Preconditions: confirmation-flow.test.ts exists with test for batch mode flow
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/confirmation-flow.test.ts --reporter=verbose`
      2. Assert output contains "✓" for test: "batch mode requires studentSection, studentName, scoreInput"
      3. Assert output contains "✓" for test: "accept() advances to next step"
      4. Assert output contains "✓" for test: "completing all steps sets phase to complete"
      5. Assert exit code is 0
    Expected Result: All tests pass with 0 failures
    Failure Indicators: Exit code non-zero, "FAIL" or "✗" in output
    Evidence: .sisyphus/evidence/task-1-confirmation-flow-tests.txt

  Scenario: State machine handles null feedbackBox gracefully
    Tool: Bash (npx vitest run)
    Preconditions: Test for null optional selector exists
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/confirmation-flow.test.ts --reporter=verbose`
      2. Assert output contains "✓" for test about null/optional selector handling
    Expected Result: Null feedbackBox is auto-skipped, flow completes without blocking
    Failure Indicators: Test fails or flow throws on null selector
    Evidence: .sisyphus/evidence/task-1-null-selector-handling.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-confirmation-flow-tests.txt — full vitest output
  - [ ] task-1-null-selector-handling.txt — vitest verbose output for null case

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(discovery): add confirmation flow state machine with TDD tests`
  - Files: `ogre-desktop/src/lib/confirmation-flow.ts`, `ogre-desktop/src/lib/confirmation-flow.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/confirmation-flow.test.ts`

- [x] 2. GradingPanel Callback Plumbing + Parent State

  **What to do**:
  - Add new state variables in `GradingPanel.svelte`:
    - `let returnToBatch = $state(false)` — tracks whether discovery was triggered from Batch CTA
    - `let preselectedProfileId = $state<string | null>(null)` — profile ID to pre-select when returning to Batch
  - Add `onRequestDiscovery` callback prop to BatchPanel:
    - When called, sets `returnToBatch = true` and switches to discovery mode via `activeMode = 'discovery'`
  - Enhance existing `onProfileSaved` callback on DiscoveryPanel:
    - When profile is saved AND `returnToBatch === true`:
      1. Store `preselectedProfileId = profile.id`
      2. Set `returnToBatch = false`
      3. Switch to batch mode: `activeMode = 'batch'`
    - When profile is saved AND `returnToBatch === false`: keep existing behavior (stay on discovery)
  - Pass `preselectedProfileId` as new prop to BatchPanel
  - Pass `returnToBatch` as prop to DiscoveryPanel so it knows to show "auto-return" messaging
  - Clear `preselectedProfileId` after BatchPanel mounts and consumes it

  **Must NOT do**:
  - Do NOT add Svelte stores
  - Do NOT modify the MODES array or tab structure
  - Do NOT change the mode tab component rendering logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple prop wiring in one component — adding state variables and passing callbacks
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No visual design changes, just prop plumbing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:23-38` — Existing state declarations pattern (`let activeMode = $state(...)`, `let batchRunning = $state(...)`)
  - `ogre-desktop/src/pages/GradingPanel.svelte:53-58` — MODES array (reference only, do not modify)
  - `ogre-desktop/src/pages/GradingPanel.svelte:65-69` — `setMode()` function — shows how mode switching works. The new `onRequestDiscovery` callback will follow this pattern
  - `ogre-desktop/src/pages/GradingPanel.svelte:317-322` — Current BatchPanel rendering with props — where to add new callback prop
  - `ogre-desktop/src/pages/GradingPanel.svelte:326-334` — Current DiscoveryPanel rendering with `onProfileSaved` callback — where to enhance

  **API/Type References**:
  - `ogre-desktop/src/lib/site-profiles.ts:29` — `SiteProfile` type re-export (profile.id is string)

  **WHY Each Reference Matters**:
  - Lines 23-38: Follow exact `$state()` pattern for new state variables
  - Lines 317-322: Shows the prop passing convention — new props go here
  - Lines 326-334: The `onProfileSaved` callback already exists and logs to console. Enhance it, don't replace it

  **Acceptance Criteria**:

  - [ ] GradingPanel has `returnToBatch` and `preselectedProfileId` state variables
  - [ ] BatchPanel receives `onRequestDiscovery` callback prop
  - [ ] DiscoveryPanel receives `returnToBatch` boolean prop
  - [ ] Saving a profile with `returnToBatch=true` auto-switches to batch mode
  - [ ] `cd ogre-desktop && npx vitest run` → all existing tests still pass (no regressions)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: No regression in existing tests
    Tool: Bash (npx vitest run)
    Preconditions: GradingPanel.svelte modified with new state and props
    Steps:
      1. Run `cd ogre-desktop && npx vitest run --reporter=verbose`
      2. Assert exit code is 0
      3. Assert no "FAIL" lines in output
    Expected Result: All existing tests pass unchanged
    Failure Indicators: Non-zero exit code, any test failures
    Evidence: .sisyphus/evidence/task-2-no-regression.txt

  Scenario: Verify callback props are wired in GradingPanel source
    Tool: Bash (grep)
    Preconditions: GradingPanel.svelte has been modified
    Steps:
      1. Run grep for "onRequestDiscovery" in GradingPanel.svelte — must appear in both BatchPanel usage and as a function definition
      2. Run grep for "preselectedProfileId" in GradingPanel.svelte — must appear as state and as BatchPanel prop
      3. Run grep for "returnToBatch" in GradingPanel.svelte — must appear as state and as DiscoveryPanel prop
    Expected Result: All three patterns found in the source
    Failure Indicators: Any grep returns empty
    Evidence: .sisyphus/evidence/task-2-callback-wiring.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-no-regression.txt — vitest output showing no failures
  - [ ] task-2-callback-wiring.txt — grep output confirming prop wiring

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(discovery): add cross-panel callback plumbing for batch-discovery round trip`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 3. BatchPanel "Discover This Page" CTA Card

  **What to do**:
  - Add `onRequestDiscovery` callback prop to BatchPanel's `$props()` (default: no-op function)
  - Modify the `{#if batchPhase === 'idle'}` section in the panel footer:
    - When `profileWarning` is non-empty (no profile found) AND no saved session AND NOT `batchRunning`:
      - Replace "Start Batch" button with a CTA card containing:
        - Icon: magnifying glass or discover icon
        - Title: "No profile found for this page"
        - Description: "Use AI to discover the grading page structure and create a profile"
        - Button: "Discover This Page" → calls `onRequestDiscovery()`
      - Below the CTA card, keep a smaller secondary link: "Or use default profile anyway" → calls existing `handleExtract()`
    - When profile IS found: keep existing "Start Batch" button unchanged
  - Also add `preselectedProfileId` string prop (optional). In `onMount()`:
    - If `preselectedProfileId` is provided, set `selectedProfileId` to that value instead of `'auto'`
    - This handles the return-from-discovery flow where the new profile should be pre-selected

  **Must NOT do**:
  - Do NOT change the batch grading logic (handleExtract, handleContinueGrading, etc.)
  - Do NOT change the profile selection dropdown
  - Do NOT remove the "Start Batch" button for cases where a profile IS found
  - Do NOT change the resume session card rendering

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Conditional rendering in one Svelte file — add props, modify one `{#if}` block, add CSS for CTA card
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: CTA card styling should match existing section-card pattern, no design work needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2 (needs onRequestDiscovery callback wired in GradingPanel)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:36-41` — Current `$props()` declaration — add new props here following same pattern
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:509-517` — Profile warning display — reference for how `profileWarning` is currently shown
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:627-655` — Resume/idle conditional rendering section — this is the area to modify for CTA card
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:763-799` — Panel footer buttons — where "Start Batch" is rendered, conditional on phase/state
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1096-1136` — `.resume-session-card` CSS — follow this card styling pattern for the CTA card

  **API/Type References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:43-51` — `selectedProfileId`, `detectedProfile`, `profileWarning` state — these control what's shown

  **WHY Each Reference Matters**:
  - Lines 36-41: Props pattern — add `onRequestDiscovery` and `preselectedProfileId` following existing style
  - Lines 627-655: The exact spot where CTA card should appear (idle phase, no saved session)
  - Lines 763-799: Panel footer — the "Start Batch" button lives here, need conditional for no-profile state
  - Lines 1096-1136: CSS for `.resume-session-card` — CTA card should follow same visual pattern

  **Acceptance Criteria**:

  - [ ] BatchPanel accepts `onRequestDiscovery` callback prop
  - [ ] BatchPanel accepts `preselectedProfileId` string prop
  - [ ] When `profileWarning` is non-empty + idle + no saved session: CTA card renders instead of "Start Batch"
  - [ ] CTA card has "Discover This Page" button that calls `onRequestDiscovery()`
  - [ ] "Or use default profile anyway" secondary action exists below CTA
  - [ ] When profile IS found: "Start Batch" renders normally (unchanged behavior)
  - [ ] `preselectedProfileId` pre-selects profile in dropdown on mount
  - [ ] `cd ogre-desktop && npx vitest run` → no regressions

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: CTA card renders when no profile matched
    Tool: Bash (grep for source structure)
    Preconditions: BatchPanel.svelte modified
    Steps:
      1. Grep BatchPanel.svelte for "Discover This Page" — must exist in template
      2. Grep BatchPanel.svelte for "onRequestDiscovery" — must exist in props and in onclick handler
      3. Grep BatchPanel.svelte for "default profile anyway" — secondary action must exist
      4. Grep BatchPanel.svelte for "preselectedProfileId" — must exist in props
    Expected Result: All four patterns found
    Failure Indicators: Any pattern missing
    Evidence: .sisyphus/evidence/task-3-cta-structure.txt

  Scenario: Existing Start Batch still renders for matched profiles
    Tool: Bash (grep)
    Preconditions: BatchPanel.svelte modified
    Steps:
      1. Grep for "Start Batch" in BatchPanel.svelte — must still exist
      2. Verify it's inside a conditional block (not removed)
    Expected Result: "Start Batch" text still present and conditionally rendered
    Failure Indicators: "Start Batch" removed entirely
    Evidence: .sisyphus/evidence/task-3-start-batch-preserved.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-cta-structure.txt — grep results confirming CTA structure
  - [ ] task-3-start-batch-preserved.txt — grep confirming Start Batch preserved

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): add discover CTA in batch panel when no profile matches`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 4. DiscoveryPanel Step-by-Step Confirmation Phase

  **What to do**:
  - Import `createConfirmationFlow`, `getRequiredSelectorKeys`, `type ConfirmationFlow` from `confirmation-flow.ts`
  - Import `refineSelector`, `clearRefinementHighlights` from `discovery-picker-integration.ts`
  - Import evaluation helpers: `evalScript` from `browser.ts` and the `buildValidationScript` pattern from `discover.ts` (or re-implement inline)
  - Add `returnToBatch` boolean prop (default: false)
  - Add new phase `'confirming'` to the `DiscoveryPhase` type union: `'idle' | 'running' | 'review' | 'confirming' | 'saving' | 'error'`
  - Add state: `let confirmationFlow = $state<ConfirmationFlow | null>(null)`
  - Add state: `let isRefining = $state(false)` (tracks whether picker is active)
  - **Transition from review → confirming**:
    - In the review phase, replace the "Save as Profile" button with "Confirm Selectors" when `returnToBatch` is true
    - When `returnToBatch` is false (direct discovery), keep existing "Save as Profile" behavior
    - On "Confirm Selectors" click:
      1. Create confirmation flow: `confirmationFlow = createConfirmationFlow(discoveryResult.selectors, validationResults, discoveryResult.navigation.mode)`
      2. Set `phase = 'confirming'`
      3. Highlight current step's selector matches on page using `evalScript` with the highlight script from `discovery-picker-integration.ts`
  - **Confirming phase UI** (new `{#if phase === 'confirming'}` block):
    - Progress indicator: "Step {n} of {total}"
    - Current selector key name (e.g., "Student Name Selector")
    - Match count badge (e.g., "3 matches")
    - Sample text from matched element
    - The current CSS selector in a monospace code block
    - Two buttons:
      - **Accept** → calls `confirmationFlow.accept()`, highlights next step's matches, clear old highlights
      - **Refine** → sets `isRefining = true`, calls `refineSelector(currentSelector)`, on result calls `confirmationFlow.refine(newSelector)`, sets `isRefining = false`, highlights next step
    - **Back** button → calls `confirmationFlow.back()`, highlights previous step's matches
    - **Cancel** button → calls `confirmationFlow.cancel()`, clears highlights, sets `phase = 'review'`
  - **Transition confirming → saving**:
    - When `confirmationFlow.phase === 'complete'`:
      1. Get confirmed selectors: `confirmationFlow.getConfirmedSelectors()`
      2. Merge confirmed selectors back into `discoveryResult.selectors` (overwrite confirmed keys)
      3. Clear highlights
      4. If `returnToBatch`: auto-trigger save with generated profile name (skip save dialog)
      5. If NOT `returnToBatch`: show save dialog as before
  - **Highlight management**:
    - When entering each confirmation step, highlight matching elements using existing `HIGHLIGHT_MATCHES_JS` from discovery-picker-integration.ts
    - When leaving a step (accept/refine/back/cancel), clear highlights using `CLEAR_HIGHLIGHTS_JS`
  - Friendly labels for selector keys: `{ studentSection: 'Student Section', studentName: 'Student Name', scoreInput: 'Score Input', feedbackBox: 'Feedback Area' }`

  **Must NOT do**:
  - Do NOT modify `runDiscovery()` or the AI pipeline
  - Do NOT modify element-picker.ts
  - Do NOT change the idle or running phases
  - Do NOT break the existing "direct discovery" flow (when `returnToBatch` is false)
  - Do NOT add animations or scroll-to behaviors

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex Svelte component changes — new phase, state management, async picker integration, highlight lifecycle, multiple UI states
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Styling follows existing patterns, no design innovation needed
    - `playwright`: No browser testing — verification via code reading + vitest

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1 (confirmation-flow.ts), 2 (GradingPanel plumbing for returnToBatch prop)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:39` — `DiscoveryPhase` type — add `'confirming'` here
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:57-89` — `handleStartDiscovery()` — reference for how phases transition and state updates
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:92-129` — `handleRefine()` — shows how picker is invoked and selectors updated. This is the pattern to adapt for the Refine button in confirmation
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:258-296` — Review phase UI — the confirming phase UI sits at the same level, render conditionally
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:131-209` — `handleSaveProfile()` — profile save logic. Confirmation auto-save (for returnToBatch) reuses this

  **API/Type References**:
  - `ogre-desktop/src/lib/confirmation-flow.ts` (from Task 1) — `createConfirmationFlow()`, `ConfirmationFlow`, `getRequiredSelectorKeys()`
  - `ogre-desktop/src/lib/discovery-picker-integration.ts:89-116` — `HIGHLIGHT_MATCHES_JS` script — for highlighting matches during confirmation
  - `ogre-desktop/src/lib/discovery-picker-integration.ts:119-128` — `CLEAR_HIGHLIGHTS_JS` script — for clearing highlights
  - `ogre-desktop/src/lib/discovery-picker-integration.ts:146-167` — `refineSelector()` function — call this on "Refine" button click

  **WHY Each Reference Matters**:
  - DiscoveryPanel lines 92-129: The exact async picker pattern to reuse — try/catch for cancel, update state on success
  - HIGHLIGHT_MATCHES_JS: Inject into webview to show orange outlines on matching elements. Call it when entering each confirmation step
  - `refineSelector()`: High-level function that highlights + starts picker + cleans up. Use for the Refine action
  - `handleSaveProfile()`: The save logic to reuse/adapt for auto-save when `returnToBatch` is true

  **Acceptance Criteria**:

  - [ ] DiscoveryPhase type includes `'confirming'`
  - [ ] `returnToBatch` prop accepted on DiscoveryPanel
  - [ ] "Confirm Selectors" button appears in review phase when `returnToBatch` is true
  - [ ] Confirming phase shows step progress, selector info, match count, Accept/Refine buttons
  - [ ] Accept advances to next step, Refine opens picker then advances
  - [ ] Back returns to previous step
  - [ ] Cancel returns to review phase
  - [ ] Completing all steps auto-saves profile when `returnToBatch` is true
  - [ ] Direct discovery (returnToBatch=false) still works identically to before
  - [ ] `cd ogre-desktop && npx vitest run` → no regressions

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Confirming phase renders with correct structure
    Tool: Bash (grep for component structure)
    Preconditions: DiscoveryPanel.svelte modified
    Steps:
      1. Grep for "'confirming'" in DiscoveryPanel.svelte — must appear in phase type and conditional rendering
      2. Grep for "confirmationFlow" — must appear as state and in event handlers
      3. Grep for "Accept" and "Refine" — must appear as button labels
      4. Grep for "returnToBatch" — must appear as prop and in conditionals
      5. Grep for "Step" — must appear in progress indicator
    Expected Result: All patterns found in the source
    Failure Indicators: Any pattern missing
    Evidence: .sisyphus/evidence/task-4-confirming-structure.txt

  Scenario: Direct discovery still works (no returnToBatch)
    Tool: Bash (grep)
    Preconditions: DiscoveryPanel.svelte modified
    Steps:
      1. Grep for "Save as Profile" in DiscoveryPanel.svelte — must still exist
      2. Verify it renders when returnToBatch is false (inside conditional)
    Expected Result: Existing save-as-profile behavior preserved
    Failure Indicators: "Save as Profile" removed or no longer conditional
    Evidence: .sisyphus/evidence/task-4-direct-discovery-preserved.txt

  Scenario: No test regressions
    Tool: Bash (npx vitest run)
    Preconditions: All Wave 2 changes applied
    Steps:
      1. Run `cd ogre-desktop && npx vitest run --reporter=verbose`
      2. Assert exit code is 0
    Expected Result: All tests pass
    Failure Indicators: Non-zero exit, any failures
    Evidence: .sisyphus/evidence/task-4-no-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-confirming-structure.txt — grep results for confirming phase
  - [ ] task-4-direct-discovery-preserved.txt — grep results for direct discovery
  - [ ] task-4-no-regression.txt — vitest output

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): add step-by-step selector confirmation phase`
  - Files: `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 5. Round-Trip Integration + Profile Pre-Select

  **What to do**:
  - **Verify end-to-end data flow**: Trace the full round-trip in code:
    1. BatchPanel: `onRequestDiscovery()` → GradingPanel: sets `returnToBatch = true`, switches to discovery
    2. DiscoveryPanel: runs discovery, enters confirming phase, user confirms selectors
    3. DiscoveryPanel: `onProfileSaved(profile)` → GradingPanel: stores `preselectedProfileId = profile.id`, sets `returnToBatch = false`, switches to batch
    4. BatchPanel remounts: `onMount()` reads `preselectedProfileId` prop, sets `selectedProfileId` to it
  - **Fix profile pre-selection in BatchPanel**:
    - In `onMount()`, after loading profiles: if `preselectedProfileId` is provided AND exists in `allProfiles`, set `selectedProfileId = preselectedProfileId`
    - If profile was just saved via discovery, it should be in the DB and loaded by `storage.listProfiles()`
  - **URL pattern validation**: Ensure the auto-generated URL pattern in DiscoveryPanel's `handleSaveProfile()` will match `findProfilesByUrl()`:
    - Read the current pattern generation logic (DiscoveryPanel lines 157-162: `u.hostname + u.pathname`)
    - Test that `findProfilesByUrl(currentUrl, [savedProfile])` returns the profile
    - If pattern is too specific (includes query params), simplify
  - **Add TDD test for round-trip profile matching**:
    - RED: In a new test or in `confirmation-flow.test.ts`: test that a URL pattern generated from a URL matches back via `findProfilesByUrl()`
    - GREEN: Implement any fix needed
    - REFACTOR: Clean up
  - **Clear preselectedProfileId after consumption**: In BatchPanel, after using the prop to set `selectedProfileId`, emit a callback to clear it in GradingPanel (or GradingPanel clears it after a tick/transition)

  **Must NOT do**:
  - Do NOT modify `findProfilesByUrl()` in site-profiles.ts
  - Do NOT change the profile storage schema
  - Do NOT add Svelte stores

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work requiring understanding of data flow across 3 components + testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 3, 4

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:104-147` — `onMount()` — where profile loading and auto-detect happens. Add preselect logic here
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:131-209` — `handleSaveProfile()` — URL pattern generation on lines 157-162
  - `ogre-desktop/src/lib/site-profiles.ts:231-255` — `findProfilesByUrl()` — the matching function that must work with generated patterns

  **API/Type References**:
  - `ogre-desktop/src/lib/site-profiles.ts:231` — `findProfilesByUrl(url: string, profiles: SiteProfile[]): SiteProfile[]`

  **WHY Each Reference Matters**:
  - BatchPanel `onMount()`: Exact location to add pre-selection logic
  - DiscoveryPanel URL generation: Must verify this produces patterns that `findProfilesByUrl` can match
  - `findProfilesByUrl()`: The matching algorithm — substring matching with specificity sort

  **Acceptance Criteria**:

  - [ ] Full round-trip works: Batch (no profile) → CTA → Discovery → Confirm → Save → auto-return to Batch → new profile selected
  - [ ] `selectedProfileId` in BatchPanel matches saved profile's ID when returning from discovery
  - [ ] URL pattern round-trip test passes: pattern generated from URL matches back via `findProfilesByUrl()`
  - [ ] `cd ogre-desktop && npx vitest run` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: URL pattern round-trip matching
    Tool: Bash (npx vitest run)
    Preconditions: Test exists for URL pattern → findProfilesByUrl round-trip
    Steps:
      1. Run `cd ogre-desktop && npx vitest run --reporter=verbose`
      2. Assert test for URL pattern matching passes
    Expected Result: Generated pattern matches original URL
    Failure Indicators: Test fails, pattern too specific
    Evidence: .sisyphus/evidence/task-5-url-pattern-roundtrip.txt

  Scenario: preselectedProfileId consumed on mount
    Tool: Bash (grep)
    Preconditions: BatchPanel.svelte modified
    Steps:
      1. Grep for "preselectedProfileId" in BatchPanel's onMount — must exist
      2. Grep for "selectedProfileId = preselectedProfileId" or similar assignment
    Expected Result: Pre-selection logic present in onMount
    Failure Indicators: No pre-selection logic found
    Evidence: .sisyphus/evidence/task-5-preselect-logic.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-url-pattern-roundtrip.txt — test output
  - [ ] task-5-preselect-logic.txt — grep output

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(discovery): wire round-trip integration with profile pre-selection`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`, `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`, `ogre-desktop/src/lib/confirmation-flow.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 6. Edge Cases + Polish

  **What to do**:
  - **feedbackBox null case**: In DiscoveryPanel's confirming phase, when the current step has a null/empty selector:
    - Show "Not detected" with a muted badge instead of match count
    - Offer only "Skip" button (not Accept/Refine) — or auto-advance with a brief message
    - Verify confirmation-flow.ts handles this (optional selectors auto-skip)
  - **Cancel mid-confirmation**: Verify that clicking Cancel at any step:
    - Clears all page highlights (calls `clearRefinementHighlights()`)
    - Returns to review phase with all selectors visible
    - Does NOT lose AI discovery results (discoveryResult preserved)
  - **batchRunning blocks CTA**: When `batchRunning` is true, the CTA should not render (batch is active, even if no profile matched). Verify the conditional in BatchPanel's footer handles this edge case
  - **Direct discovery entry**: Verify that clicking "Discover" tab directly (not from Batch) still shows the existing flow:
    - "Discover Selectors" button → runs discovery → review phase → "Save as Profile" (no confirmation step)
    - `returnToBatch` is false by default
  - **Picker cancel during Refine**: When user starts Refine but presses Escape in the element picker:
    - `refineSelector()` throws (existing behavior)
    - Catch the error, set `isRefining = false`, stay on current step (don't advance)
  - **Add any missing CSS**: Ensure the confirming phase card, progress indicator, and buttons are styled consistently with existing components

  **Must NOT do**:
  - Do NOT add new features beyond what's specified
  - Do NOT refactor existing code
  - Do NOT change test patterns

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple small edge cases across several files, requires careful attention to existing behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` — All confirming phase code from Task 4
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:764-768` — Panel footer idle condition — verify CTA handles batchRunning
  - `ogre-desktop/src/lib/discovery-picker-integration.ts:173-175` — `clearRefinementHighlights()` — call on cancel

  **WHY Each Reference Matters**:
  - DiscoveryPanel confirming phase: All edge case fixes go here
  - BatchPanel footer: Verify CTA conditional includes batchRunning guard
  - `clearRefinementHighlights()`: Must be called on every exit from confirming phase

  **Acceptance Criteria**:

  - [ ] Null feedbackBox shows "Not detected" and skips automatically
  - [ ] Cancel mid-confirmation returns to review phase with highlights cleared
  - [ ] CTA doesn't render when batchRunning is true
  - [ ] Direct discovery (click Discover tab) still works without confirmation step
  - [ ] Picker cancel during Refine stays on current step (no advance)
  - [ ] `cd ogre-desktop && npx vitest run` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full test suite passes with all changes
    Tool: Bash (npx vitest run)
    Preconditions: All tasks 1-6 complete
    Steps:
      1. Run `cd ogre-desktop && npx vitest run --reporter=verbose`
      2. Count total tests and assert 0 failures
    Expected Result: All tests pass including new confirmation-flow tests
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-6-final-test-suite.txt

  Scenario: Edge case coverage in confirmation flow tests
    Tool: Bash (npx vitest run)
    Preconditions: confirmation-flow.test.ts includes edge case tests
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/confirmation-flow.test.ts --reporter=verbose`
      2. Assert tests exist for: null selector skip, cancel mid-flow, back navigation
    Expected Result: Edge case tests present and passing
    Failure Indicators: Missing edge case coverage
    Evidence: .sisyphus/evidence/task-6-edge-case-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-final-test-suite.txt — full vitest output
  - [ ] task-6-edge-case-tests.txt — confirmation flow test output

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(discovery): handle edge cases in guided discovery flow`
  - Files: `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`, `ogre-desktop/src/components/grading/BatchPanel.svelte`, `ogre-desktop/src/lib/confirmation-flow.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

---

## Final Verification Wave (MANDATORY)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` in `ogre-desktop/`. Review all changed files for: `as any` (minimize), empty catches, console.log in prod, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify new files follow existing mock patterns (`vi.mock('./browser')`).
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Read each Svelte component to verify: conditional rendering logic matches spec, callback props wired correctly, phase transitions cover all states, no dead code paths. Run `npx vitest run` for full suite. Verify no existing tests broken.
  Output: `Scenarios [N/N pass] | Regressions [CLEAN/N issues] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual implementation. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance — verify forbidden files not modified. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1 commit**: `feat(discovery): add confirmation flow state machine and required selector helpers` — `confirmation-flow.ts`, `confirmation-flow.test.ts`, `GradingPanel.svelte`
- **Wave 2 commit**: `feat(discovery): add guided discovery CTA and step-by-step confirmation UI` — `BatchPanel.svelte`, `DiscoveryPanel.svelte`
- **Wave 3 commit**: `feat(discovery): wire round-trip integration and edge case handling` — all touched files

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run  # Expected: all tests pass, 0 failures
cd ogre-desktop && npx vitest run src/lib/confirmation-flow.test.ts  # Expected: 10+ tests pass
```

### Final Checklist
- [x] All "Must Have" features present and functional
- [x] All "Must NOT Have" guardrails respected (no forbidden file modifications)
- [x] All existing tests still pass (no regressions)
- [x] New test file created and passing for confirmation-flow.ts
- [x] Batch → Discovery → Batch round-trip works end-to-end
