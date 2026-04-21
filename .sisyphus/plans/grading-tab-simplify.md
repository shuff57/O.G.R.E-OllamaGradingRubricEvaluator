# Simplify Grading Tab Single/Batch Selection UI

## TL;DR

> **Quick Summary**: Replace the current equal-peers pill toggle on the Grading tab with batch-default mode, a simple checkbox to opt into "Single student mode", and a text input for the student's name that flows to both the AI prompt and the result display.
>
> **Deliverables**:
> - `GradingPanel.svelte` — new default, new toggle UI, new name input, new state variable
> - `StudentWorkCard.svelte` — new `studentName` prop, name in prompt, name in result heading
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — Task 2 depends on Task 1 interface contract; tasks are sequential
> **Critical Path**: Task 1 → Task 2

---

## Context

### Original Request
"Simplify the single/batch selection on the grading tab. It should be batch by default with a grading option toggle for single student mode and a text box to enter the name."
Student name destination: "Both: label + prompt"

### Interview Summary
**Key Discussions**:
- Batch is the default, single mode is an opt-in overlay
- Student name goes to BOTH result display AND the AI grading prompt
- No other behavioral changes requested — scope is intentionally narrow

**Research Findings**:
- App is Svelte 5 runes-mode (`$state`, `$derived`, `$props`, `$bindable`)
- `graderSubMode` lives only in `GradingPanel.svelte`, no persistence or IPC involved
- `StudentWorkCard.svelte` has no student name concept today
- `gradeStudent()` in `grading-api.ts` accepts `{ studentWork, rubric, provider, model }` — name embedded in prompt at call site

### Metis Review
**Identified Gaps** (addressed inline):
- Edge case: student name is empty when single mode is on — handled with conditional logic (only append name if non-empty)
- CSS cleanup: old pill toggle styles should be removed, not just orphaned
- Pre-existing LSP error on GradingPanel.svelte line 518 — must NOT be touched

---

## Work Objectives

### Core Objective
Replace the pill toggle UI with a batch-first checkbox/toggle UI and a student name input that flows through to both the AI prompt and the result display.

### Concrete Deliverables
- `GradingPanel.svelte`: `graderSubMode` defaults to `'batch'`, old pill toggle replaced, single-mode checkbox + name input added
- `StudentWorkCard.svelte`: accepts `studentName?: string` prop, name embedded in prompt and shown in result heading

### Definition of Done
- [ ] App loads with Batch mode active by default (no toggle needed)
- [ ] A checkbox/toggle labeled "Single student mode" is visible on the Grading tab
- [ ] Checking it reveals a text input for student name
- [ ] The student name appears in the graded result heading
- [ ] The student name appears in the prompt sent to the AI model

### Must Have
- Batch is the default mode (no user action required)
- Compact single-mode toggle (checkbox or small toggle — not a pill)
- Text input for student name, visible only when single mode is active
- Student name in AI prompt (embedded into the text sent to `gradeStudent()`)
- Student name in result display heading

### Must NOT Have (Guardrails)
- Do NOT change any batch mode behavior or UI
- Do NOT touch the pre-existing LSP error on GradingPanel.svelte line 518 (`activeProfileName` prop)
- Do NOT refactor `grading-api.ts` signature — embed name at call site only
- Do NOT add persistence (localStorage, IPC) for any of these new fields
- Do NOT add validation errors, required-field enforcement, or form submission logic
- Do NOT add animations, transitions, or fancy styling beyond what matches the existing panel aesthetic
- Do NOT rename or restructure `graderSubMode` — keep the variable and its downstream conditionals intact

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None — this is a UI-only change in a Svelte component; no unit tests exist for this component today and adding them is out of scope
- **Framework**: vitest (available but not used here)

### QA Policy
Every task includes agent-executed QA scenarios using Playwright (webapp-testing skill).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Task 1 — GradingPanel changes):
└── Task 1: Update GradingPanel.svelte [quick]

Wave 2 (Task 2 — depends on Task 1 prop contract):
└── Task 2: Update StudentWorkCard.svelte [quick]

Wave FINAL (after both tasks):
├── Task F1: Plan compliance + code quality audit [oracle]
└── Task F2: Manual QA via Playwright [unspecified-high + webapp-testing]
→ Present results → Get explicit user okay
```

### Dependency Matrix
- **1**: none → blocks 2
- **2**: 1 → blocks F1, F2

### Agent Dispatch Summary
- **Wave 1**: T1 → `quick`
- **Wave 2**: T2 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high` (+ `webapp-testing` skill)

---

## TODOs

- [ ] 1. Update `GradingPanel.svelte` — batch default, checkbox toggle, name input

  **What to do**:
  - Change line 32: `let graderSubMode = $state('single');` → `let graderSubMode = $state('batch');`
  - Add a new state variable immediately after: `let singleStudentName = $state('');`
  - Locate the pill toggle block in the template (the `<div class="sub-mode-toggle">` block, approximately lines 444–460). Remove it entirely and replace it with:
    ```svelte
    <label class="single-mode-toggle">
      <input
        type="checkbox"
        checked={graderSubMode === 'single'}
        onchange={(e) => { graderSubMode = e.currentTarget.checked ? 'single' : 'batch'; }}
      />
      Single student mode
    </label>
    {#if graderSubMode === 'single'}
      <input
        type="text"
        class="student-name-input"
        placeholder="Student name"
        bind:value={singleStudentName}
      />
    {/if}
    ```
  - In the `<style>` block, remove the CSS rules for: `.sub-mode-toggle`, `.toggle-track`, `.toggle-slider`, `.toggle-option` (all of them)
  - Add minimal CSS for the new elements:
    ```css
    .single-mode-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      cursor: pointer;
      user-select: none;
    }
    .student-name-input {
      margin-top: 0.4rem;
      padding: 0.3rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--border-color, #ccc);
      font-size: 0.9rem;
      width: 100%;
      max-width: 260px;
    }
    ```
  - When passing `<StudentWorkCard>` in single mode (the existing `{#if graderSubMode === 'single'}` block, ~line 483), add `studentName={singleStudentName}` to the component props

  **Must NOT do**:
  - Do NOT touch line 518 or the `activeProfileName` prop (pre-existing LSP error — leave it alone)
  - Do NOT change any batch mode rendering or logic
  - Do NOT add persistence or IPC for `singleStudentName`
  - Do NOT change the `graderSubMode` variable name or its downstream `{#if}` conditionals

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file UI change with clear before/after; no architecture decisions needed
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Svelte 5 runes-mode component editing with correct binding syntax

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sole task)
  - **Blocks**: Task 2 (needs to know the `studentName` prop name)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:32` — existing `$state()` variable declarations pattern
  - `ogre-desktop/src/pages/GradingPanel.svelte:444-460` — the pill toggle block to REPLACE entirely
  - `ogre-desktop/src/pages/GradingPanel.svelte:482-515` — the `{#if graderSubMode === 'single'}` block where `<StudentWorkCard>` is rendered; add `studentName` prop here

  **API/Type References**:
  - `ogre-desktop/src/components/grading/StudentWorkCard.svelte` — read to verify the current props interface before adding `studentName`

  **WHY Each Reference Matters**:
  - Line 32 shows exactly where to insert `singleStudentName` state variable
  - Lines 444–460 is the complete block to remove — reading it ensures no stray closing tags are left
  - Lines 482–515 is where `<StudentWorkCard>` is instantiated — add the new prop here

  **Acceptance Criteria**:

  - [ ] `graderSubMode` initial value is `'batch'`
  - [ ] `singleStudentName` state variable exists and is `$state('')`
  - [ ] The `.sub-mode-toggle` div and all its children are gone from the template
  - [ ] A `<label class="single-mode-toggle">` with a checkbox is present
  - [ ] The text input for student name is conditionally rendered inside `{#if graderSubMode === 'single'}`
  - [ ] `<StudentWorkCard>` in single mode receives `studentName={singleStudentName}`
  - [ ] Old CSS rules for `.sub-mode-toggle`, `.toggle-track`, `.toggle-slider`, `.toggle-option` are removed
  - [ ] New CSS for `.single-mode-toggle` and `.student-name-input` is present

  **QA Scenarios**:

  ```
  Scenario: Grading tab loads with batch mode as default
    Tool: Playwright (webapp-testing skill)
    Preconditions: App running via `npm run dev` in ogre-desktop/; navigate to Grading tab
    Steps:
      1. Open app in browser (http://localhost:5173 or equivalent)
      2. Click the "Grading" tab in the navigation
      3. Assert: no pill toggle visible (no element matching `.sub-mode-toggle`)
      4. Assert: a checkbox labeled "Single student mode" is visible
      5. Assert: the student name text input is NOT visible (single mode is off)
      6. Assert: the Batch grading UI is visible without any user action
    Expected Result: Batch mode is active on load, no pill toggle, checkbox is unchecked
    Failure Indicators: Pill toggle still present, single mode UI showing on load, batch UI hidden
    Evidence: .sisyphus/evidence/task-1-batch-default.png

  Scenario: Activating single mode shows name input
    Tool: Playwright (webapp-testing skill)
    Preconditions: Same as above; app on Grading tab in default batch mode
    Steps:
      1. Find the checkbox labeled "Single student mode"
      2. Click the checkbox to check it
      3. Assert: a text input with placeholder "Student name" is now visible
      4. Type "Alice Johnson" into the student name input
      5. Assert: input value is "Alice Johnson"
    Expected Result: Name input appears when single mode is toggled on and accepts text
    Failure Indicators: Input not visible after checking, value not retained
    Evidence: .sisyphus/evidence/task-1-single-mode-active.png

  Scenario: Unchecking single mode hides name input
    Tool: Playwright (webapp-testing skill)
    Preconditions: Single mode is active with "Alice Johnson" typed
    Steps:
      1. Uncheck the "Single student mode" checkbox
      2. Assert: student name input is no longer visible
      3. Assert: Batch UI is shown again
    Expected Result: Name input disappears, batch mode resumes
    Failure Indicators: Input still visible after unchecking
    Evidence: .sisyphus/evidence/task-1-single-mode-off.png
  ```

  **Evidence to Capture**:
  - [ ] `task-1-batch-default.png`
  - [ ] `task-1-single-mode-active.png`
  - [ ] `task-1-single-mode-off.png`

  **Commit**: NO (commit after Task 2)

---

- [ ] 2. Update `StudentWorkCard.svelte` — accept `studentName` prop, use in prompt and result

  **What to do**:
  - Add `studentName?: string` to the component's props destructuring (the `let { ... } = $props()` block, approximately lines 13–29)
  - In the `gradeStudent()` call (approximately lines 91–96), embed the student name into the `studentWork` string before passing it. If `studentName` is non-empty:
    ```ts
    const workWithName = studentName
      ? `Student: ${studentName}\n\n${studentWork}`
      : studentWork;
    // then pass workWithName instead of studentWork
    ```
  - In `formatGradeResponse()` (approximately lines 63–76) OR wherever the grading result is displayed in the template, prepend the student name as a heading in the output. If `studentName` is non-empty, show something like:
    ```svelte
    {#if studentName}
      <p class="student-name-label"><strong>{studentName}</strong></p>
    {/if}
    ```
    Place this immediately above the grade result display block.
  - Add minimal CSS for `.student-name-label` if needed (e.g., `margin-bottom: 0.25rem; font-size: 1rem;`)

  **Must NOT do**:
  - Do NOT make `studentName` required — it must be optional (`?:`) so batch mode still works without it
  - Do NOT change `grading-api.ts` function signature — embed name at call site only
  - Do NOT change any other props, logic, or UI in `StudentWorkCard`
  - Do NOT add validation or error states for empty student name

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change with clear prop interface; no architecture decisions needed
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Svelte 5 runes-mode component editing with correct `$props()` syntax

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sole task)
  - **Blocks**: F1, F2
  - **Blocked By**: Task 1 (needs the `studentName` prop name confirmed)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/StudentWorkCard.svelte:13-29` — current props destructuring block; add `studentName` here
  - `ogre-desktop/src/components/grading/StudentWorkCard.svelte:91-96` — the `gradeStudent()` call site; embed name in `studentWork` here
  - `ogre-desktop/src/components/grading/StudentWorkCard.svelte:63-76` — `formatGradeResponse()` and result display; add name label here

  **API/Type References**:
  - `ogre-desktop/src/lib/grading-api.ts` — `gradeStudent()` signature to confirm field names (do NOT change it)

  **WHY Each Reference Matters**:
  - Lines 13–29 show the exact props pattern to follow for adding a new optional prop in Svelte 5 runes
  - Lines 91–96 is where name must be embedded into the work string before the API call
  - Lines 63–76 is where the result text is prepared/displayed — name label goes immediately before it

  **Acceptance Criteria**:

  - [ ] `studentName?: string` is present in the props destructuring
  - [ ] When `studentName` is non-empty, it is prepended to `studentWork` as `"Student: {name}\n\n{work}"` before the API call
  - [ ] When `studentName` is empty or undefined, `studentWork` is passed unchanged (no regression for batch)
  - [ ] A `{#if studentName}` block renders the name as a visible label above the grade result
  - [ ] `grading-api.ts` is NOT modified

  **QA Scenarios**:

  ```
  Scenario: Student name appears in graded result heading
    Tool: Playwright (webapp-testing skill)
    Preconditions: App running; Grading tab open; single mode active with name "Bob Smith" entered; rubric and student work pasted
    Steps:
      1. Check "Single student mode", type "Bob Smith" in name input
      2. Paste a rubric and paste sample student work text
      3. Click the grade/submit button
      4. Wait for the result to render (timeout: 30s)
      5. Assert: result area contains the text "Bob Smith" as a visible label
    Expected Result: "Bob Smith" appears in the result heading/label
    Failure Indicators: Name not visible in result, result shows without any name label
    Evidence: .sisyphus/evidence/task-2-name-in-result.png

  Scenario: Student name is embedded in the AI prompt
    Tool: Bash (check gradeStudent call site in source)
    Preconditions: Source code updated per task
    Steps:
      1. Read the gradeStudent() call site in StudentWorkCard.svelte
      2. Confirm the work string passed to gradeStudent() begins with "Student: {name}\n\n" when name is non-empty
    Expected Result: Source code shows name prepended to work string
    Failure Indicators: gradeStudent() receives raw studentWork without name prefix
    Evidence: .sisyphus/evidence/task-2-prompt-embed.txt (grep output)

  Scenario: Batch mode not affected (no name, no regression)
    Tool: Playwright (webapp-testing skill)
    Preconditions: App running; Grading tab in default batch mode (single mode unchecked)
    Steps:
      1. Confirm single mode checkbox is unchecked
      2. Use the batch grading flow normally (upload/paste multiple works)
      3. Grade one item
      4. Assert: no "Student:" label appears in result
      5. Assert: no errors in browser console
    Expected Result: Batch flow unchanged; no student name label in results
    Failure Indicators: Errors thrown, undefined showing in results, batch UI broken
    Evidence: .sisyphus/evidence/task-2-batch-no-regression.png
  ```

  **Evidence to Capture**:
  - [ ] `task-2-name-in-result.png`
  - [ ] `task-2-prompt-embed.txt`
  - [ ] `task-2-batch-no-regression.png`

  **Commit**: YES
  - Message: `feat(grading): batch-default mode with single student toggle and name field`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`, `ogre-desktop/src/components/grading/StudentWorkCard.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build` (or `npm run check` if build is slow)

---

## Final Verification Wave

> 2 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance + Code Quality Audit** — `oracle`
  Read `GradingPanel.svelte` and `StudentWorkCard.svelte` in full. Verify:
  - `graderSubMode` defaults to `'batch'`
  - Old pill toggle block (`.sub-mode-toggle`, `.toggle-track`, `.toggle-slider`, `.toggle-option`) is fully removed from both template and `<style>`
  - A checkbox/toggle labeled "Single student mode" is present
  - A text input for student name is present and conditionally shown only when single mode is active
  - `singleStudentName` state variable exists and is bound to the text input
  - `StudentWorkCard` receives `studentName` prop when rendered in single mode
  - `StudentWorkCard.svelte` has `studentName?: string` in props
  - Student name is embedded in the prompt string in `gradeStudent()` call
  - Student name appears in `formatGradeResponse()` output or equivalent display heading
  - Pre-existing line 518 LSP error is UNCHANGED (no new errors introduced around it)
  - No batch mode logic was altered
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Real Manual QA** — `unspecified-high` (+ `webapp-testing` skill)
  Start the dev server (`npm run dev` in `ogre-desktop/`). Open the app. Navigate to the Grading tab.
  Execute ALL QA scenarios from Tasks 1 and 2. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **After Task 2 complete**: `feat(grading): batch-default mode with single student toggle and name field`
  - Files: `ogre-desktop/src/pages/GradingPanel.svelte`, `ogre-desktop/src/components/grading/StudentWorkCard.svelte`

---

## Success Criteria

### Verification Commands
```bash
# In ogre-desktop/
npm run dev   # Expected: app starts without new errors
```

### Final Checklist
- [ ] Batch is the default mode on app load
- [ ] Single mode toggle is visible and functional
- [ ] Student name input appears/disappears with single mode
- [ ] Student name appears in result heading
- [ ] Student name appears in AI prompt
- [ ] No batch behavior changed
- [ ] Pre-existing LSP error on line 518 unchanged
