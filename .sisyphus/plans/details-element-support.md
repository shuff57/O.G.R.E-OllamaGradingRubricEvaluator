# Add `<details>/<summary>` Support to Agent DOM Capture

## TL;DR

> **Quick Summary**: Add `<summary>` to the agent's interactive element selector list so the desktop app's agent mode can see, click, and expand `<details>` elements containing rubric checklists. After expanding, inner checkboxes become visible on the next DOM capture cycle.
> 
> **Deliverables**:
> - `<summary>` elements appear in agent DOM snapshots with `[collapsed]`/`[expanded]` state
> - Agent can click `<summary>` to toggle `<details>` open/closed
> - Inner `<input type="checkbox">` elements become visible after expanding
> - Unit tests covering the new behavior
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (TDD red→green→verify)
> **Critical Path**: Task 1 (fixtures) → Task 2 (tests) → Task 3 (implementation) → Task 4 (verify)

---

## Context

### Original Request
Make the desktop app's agent mode able to click and expand `<details>` HTML elements so the agent can interact with rubric checklists (checkboxes) inside.

### Interview Summary
**Key Discussions**:
- The `INTERACTIVE_DOM_SCRIPT` in `agent-dom.ts` captures only elements matching a fixed CSS selector list that currently excludes `<summary>`
- The `isVisible()` filter removes zero-dimension elements — content inside collapsed `<details>` is hidden, but `<summary>` itself is always visible
- User wants the agent to click `<summary>` to expand (not auto-expand)
- This is the desktop app agent mode (Tauri webview), not the `/grade` Playwriter command

**Research Findings**:
- `el.click()` on `<summary>` toggles the parent `<details>` per WHATWG spec — no special action handler needed
- `getText()` on `<summary>` returns only the summary's own text, not sibling content — safe
- The `InteractiveElement.type` field (`string | undefined`) can carry `expanded`/`collapsed` state
- `formatDomForPrompt` already appends `[type]` to tag names (line 170-172), giving `summary[collapsed]` output for free
- `MAX_ELEMENTS = 200` budget is safe — only viewport-visible summaries are captured (2-6 typical)
- No dedicated `agent-dom.test.ts` exists currently

### Metis Review
**Identified Gaps** (addressed):
- Mock HTML may not match production `<details>` structure → validated against user's actual HTML (has real `<input type="checkbox">`)
- Agent needs expanded/collapsed state to know when clicking is needed → added via `type` field
- `<details open>` pre-expanded case → handled naturally by `hasAttribute('open')` check

---

## Work Objectives

### Core Objective
Enable the agent to see `<summary>` elements in its DOM snapshot, click them to expand `<details>`, and interact with the newly-visible content inside.

### Concrete Deliverables
- Modified `ogre-desktop/src/lib/agent-dom.ts`: `<summary>` in selector list + expanded/collapsed type
- New test file `ogre-desktop/src/lib/agent-dom.test.ts`
- Updated fixtures in `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`

### Definition of Done
- [ ] `npx vitest run src/lib/agent-dom.test.ts` passes all tests (in `ogre-desktop/`)
- [ ] `npx vitest run` passes full suite with zero regressions (in `ogre-desktop/`)
- [ ] `summary` appears in INTERACTIVE_DOM_SCRIPT selector list

### Must Have
- `<summary>` in the CSS selector array
- Expanded/collapsed state via `type` field (`'expanded'` when parent has `open` attribute, `'collapsed'` otherwise)
- `formatDomForPrompt` renders as `[N] summary[collapsed] "text" (selector)` or `[N] summary[expanded] "text" (selector)`
- Unit tests for the new behavior

### Must NOT Have (Guardrails)
- Do NOT add `'details'` to the selector list — `<details>` is a container, `<summary>` is the interactive toggle
- Do NOT touch `browser-actions.ts` — `el.click()` already works on any element
- Do NOT touch `batch-grader.ts` — separate code path for `/grade` command
- Do NOT touch `dom-snapshot-types.ts` — separate priority classification system
- Do NOT modify the `InteractiveElement` interface in `agent-types.ts` — existing `type` field works
- Do NOT add auto-expand logic — the agent decides when to click
- Do NOT add ARIA role handling — inconsistent across browsers, not needed

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest configured in ogre-desktop)
- **Automated tests**: TDD (red → green)
- **Framework**: vitest
- **Pattern**: Write failing tests first, then implement to make them pass

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (`npx vitest run`) — run tests, compare output
- **Code verification**: Use `grep` / `ast_grep_search` — verify selector list change

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — TDD cycle):
├── Task 1: Add summary element fixtures [quick]
├── Task 2: Create agent-dom.test.ts with failing tests [quick]  
├── Task 3: Implement summary support in agent-dom.ts [quick]
└── Task 4: Full regression test run [quick]

Wave FINAL (After ALL tasks — review):
├── Task F1: Plan compliance audit [oracle]
└── Task F2: Code quality + regression check [unspecified-high]

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → F1+F2
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2 |
| 2 | 1 | 3 |
| 3 | 2 | 4 |
| 4 | 3 | F1, F2 |
| F1 | 4 | — |
| F2 | 4 | — |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks → T1-T2 `quick`, T3 `quick`, T4 `quick`
- **Wave FINAL**: 2 tasks → F1 `oracle`, F2 `unspecified-high`

---

## TODOs

- [x] 1. Add summary element fixtures to test utils

  **What to do**:
  - Add two new `InteractiveElement` fixtures to `createTestDomElements()` in `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`
  - One collapsed summary: `{ index: 2, tag: 'summary', type: 'collapsed', text: 'Click to View Grading Checklist', disabled: false, visible: true, selector: 'summary' }`
  - One expanded summary: `{ index: 3, tag: 'summary', type: 'expanded', text: 'Click to View Rubric Targets', disabled: false, visible: true, selector: 'details:nth-child(2)>summary' }`
  - Add a new export `createTestSummaryElements()` that returns a focused array of just summary elements for targeted tests

  **Must NOT do**:
  - Do not modify the `InteractiveElement` interface
  - Do not add non-summary fixtures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file fixture addition, straightforward data
  - **Skills**: []
    - No domain skills needed for fixture creation
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Not needed — this task IS the test prep, not test-writing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, sequential position 1
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts:83-107` — Existing `createTestDomElements()` function. Follow the exact same structure: array of `InteractiveElement` objects with index, tag, type, text, disabled, visible, selector fields. New summary elements should be appended after the existing button and input fixtures.

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/agent-types.ts:124-150` — `InteractiveElement` interface. The `type` field is `string | undefined`. Use `'collapsed'` or `'expanded'` for summary elements.

  **WHY Each Reference Matters**:
  - `agent-fixtures.ts:83-107`: Copy the exact fixture structure so tests using `createTestDomElements()` get summary elements alongside existing button/input ones
  - `agent-types.ts:124-150`: Verify the type field accepts strings (it does) — no interface change needed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fixtures include summary elements
    Tool: Bash (vitest)
    Preconditions: ogre-desktop dependencies installed
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/__test-utils__/agent-fixtures.test.ts
      2. Verify test passes (existing fixture tests still work)
      3. Run: grep -n "summary" src/lib/__test-utils__/agent-fixtures.ts
      4. Verify output shows summary fixtures with 'collapsed' and 'expanded' types
    Expected Result: Existing fixture tests pass; grep shows summary elements in fixtures
    Failure Indicators: Test failures; grep returns no matches
    Evidence: .sisyphus/evidence/task-1-fixtures-added.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `test: add summary element fixtures for details/summary support`
  - Files: `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/__test-utils__/agent-fixtures.test.ts`

- [x] 2. Create agent-dom.test.ts with tests for formatDomForPrompt

  **What to do**:
  - Create new test file `ogre-desktop/src/lib/agent-dom.test.ts`
  - Import `formatDomForPrompt` from `./agent-dom`
  - Import `createTestDomElements`, `createTestSummaryElements` from `./__test-utils__/agent-fixtures`
  - Write these test cases:
    1. `formatDomForPrompt renders collapsed summary` — input a summary element with `type: 'collapsed'`, assert output contains `summary[collapsed]`
    2. `formatDomForPrompt renders expanded summary` — same with `type: 'expanded'`, assert output contains `summary[expanded]`
    3. `formatDomForPrompt renders mixed elements with summaries` — pass full array from `createTestDomElements()`, assert output includes button, input, AND summary lines
    4. `formatDomForPrompt returns no-elements message for empty array` — assert returns `'No interactive elements found.'`
  - These tests should all PASS because `formatDomForPrompt` already handles the `type` field generically (line 170-172 appends `[type]` to tag name)

  **Must NOT do**:
  - Do not test `captureInteractiveDom` (requires browser context)
  - Do not modify `agent-dom.ts` yet
  - Do not add tests for the inline script (that's verified in Task 3)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple test file creation following established vitest patterns
  - **Skills**: []
    - No domain skills needed
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Task IS test writing, skill would be circular

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, sequential position 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/agent-dom.ts:158-192` — The `formatDomForPrompt()` function being tested. Study lines 170-172: when `el.type` exists and is not `'text'`, it appends `[type]` to the tag name. This means `type: 'collapsed'` on a summary element will render as `summary[collapsed]` automatically — the formatting already works.
  - `ogre-desktop/src/lib/agent-loop.test.ts` — Example vitest test patterns in this project (imports, describe blocks, assertion style)

  **Test References** (testing patterns to follow):
  - `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts:83-107` — Test data source. Import `createTestDomElements()` and use the array directly as input to `formatDomForPrompt()`.

  **WHY Each Reference Matters**:
  - `agent-dom.ts:158-192`: Understanding the exact formatting logic is essential to write assertions that match the real output format. The `[type]` appending pattern means no special summary handling is needed in the formatter.
  - `agent-loop.test.ts`: Copy the import/describe/it structure for consistency with existing tests.

  **Acceptance Criteria**:

  - [ ] Test file created: `ogre-desktop/src/lib/agent-dom.test.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts` → PASS (4 tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All formatDomForPrompt tests pass
    Tool: Bash (vitest)
    Preconditions: Task 1 completed (fixtures exist)
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts
      2. Check output for "4 passed" (or expected test count)
      3. Verify no failures or errors
    Expected Result: All tests pass — formatDomForPrompt handles summary[collapsed] and summary[expanded]
    Failure Indicators: Any test failure; import errors; "0 tests"
    Evidence: .sisyphus/evidence/task-2-format-tests-pass.txt

  Scenario: Test output format matches expected pattern
    Tool: Bash (grep)
    Preconditions: Test file exists
    Steps:
      1. Run: grep -n "summary\[collapsed\]\|summary\[expanded\]" ogre-desktop/src/lib/agent-dom.test.ts
      2. Verify both assertion patterns exist in test file
    Expected Result: Both collapsed and expanded assertion patterns found
    Failure Indicators: grep returns no matches
    Evidence: .sisyphus/evidence/task-2-test-assertions-verified.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `test: add agent-dom unit tests for summary/details element support`
  - Files: `ogre-desktop/src/lib/agent-dom.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts`

- [x] 3. Add summary to INTERACTIVE_DOM_SCRIPT selector list and set type field

  **What to do**:
  - In `ogre-desktop/src/lib/agent-dom.ts`, add `'summary'` to the CSS selectors array (line 24-28)
  - In the element-building block (line 109-123), add conditional `type` assignment for summary elements:
    ```js
    type: tag === 'summary' 
      ? (el.parentElement && el.parentElement.hasAttribute('open') ? 'expanded' : 'collapsed') 
      : (el.type || undefined),
    ```
  - This replaces the existing `type: el.type || undefined` on line 113

  **Must NOT do**:
  - Do NOT add `'details'` to selectors — only `<summary>` is interactive
  - Do NOT touch `browser-actions.ts`
  - Do NOT touch `batch-grader.ts`
  - Do NOT touch `dom-snapshot-types.ts`
  - Do NOT modify `InteractiveElement` interface
  - Do NOT add auto-expand logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small edits to a single file (~5 changed lines)
  - **Skills**: []
    - No domain skills needed
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Tests already written in Task 2, this is the green phase

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, sequential position 3
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/agent-dom.ts:19-129` — The full `INTERACTIVE_DOM_SCRIPT`. Lines 24-28 contain the selector array to modify. Lines 109-123 contain the element-building block where `type` is assigned. The change is surgical: add one string to the array, replace one line in the element builder.

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/agent-types.ts:130-131` — `type?: string` on `InteractiveElement`. Accepts any string including `'expanded'` and `'collapsed'`.

  **External References**:
  - WHATWG HTML spec §4.11.2: `<summary>` click toggles parent `<details>` `open` attribute. Confirms `el.click()` is sufficient.

  **WHY Each Reference Matters**:
  - `agent-dom.ts:24-28`: Exact location of the selector array. Add `'summary'` after `'select'` (or at the end). This is the line that determines which elements the agent can see.
  - `agent-dom.ts:109-123`: Exact location of element property mapping. The `type` field assignment on line 113 (`type: el.type || undefined`) must be replaced with a conditional that checks `tag === 'summary'`.

  **Acceptance Criteria**:

  - [ ] `grep "'summary'" ogre-desktop/src/lib/agent-dom.ts` returns a match in the selector array
  - [ ] `cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts` → PASS (all tests green)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Summary selector added to INTERACTIVE_DOM_SCRIPT
    Tool: Bash (grep)
    Preconditions: Task 2 completed
    Steps:
      1. Run: grep -n "'summary'" ogre-desktop/src/lib/agent-dom.ts
      2. Verify the match is inside the selectors array (around line 24-28)
    Expected Result: 'summary' found in the CSS selector list
    Failure Indicators: No match found; match is outside the selector array
    Evidence: .sisyphus/evidence/task-3-selector-added.txt

  Scenario: Type field uses expanded/collapsed for summary
    Tool: Bash (grep)
    Preconditions: agent-dom.ts modified
    Steps:
      1. Run: grep -n "expanded\|collapsed" ogre-desktop/src/lib/agent-dom.ts
      2. Verify lines show conditional type assignment checking tag === 'summary' and parentElement.hasAttribute('open')
    Expected Result: Conditional type logic found in the element builder
    Failure Indicators: No match; hardcoded type value instead of conditional
    Evidence: .sisyphus/evidence/task-3-type-conditional.txt

  Scenario: All agent-dom tests pass after implementation
    Tool: Bash (vitest)
    Preconditions: Both selector and type changes applied
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts
      2. Verify all tests pass
    Expected Result: All tests pass (green phase of TDD)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-tests-green.txt
  ```

  **Commit**: YES
  - Message: `feat: add summary element support to agent DOM capture for details expansion`
  - Files: `ogre-desktop/src/lib/agent-dom.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts`

- [x] 4. Full regression test run

  **What to do**:
  - Run the complete vitest suite in `ogre-desktop/` to verify no regressions
  - Fix any failures caused by the changes (unlikely — changes are additive)

  **Must NOT do**:
  - Do not skip any failing tests
  - Do not modify tests to make them pass unless the test was wrong

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution + verification
  - **Skills**: [`verification-before-completion`]
    - `verification-before-completion`: Ensures evidence-based verification before claiming success
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: Only needed if tests fail

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, sequential position 4
  - **Blocks**: F1, F2
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/package.json` — Contains the `test` script configuration for vitest

  **WHY Each Reference Matters**:
  - `package.json`: Confirms the correct test command (`npx vitest run` or `npm test`)

  **Acceptance Criteria**:

  - [ ] `cd ogre-desktop && npx vitest run` → all tests pass, zero failures

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes with zero regressions
    Tool: Bash (vitest)
    Preconditions: All prior tasks completed
    Steps:
      1. Run: cd ogre-desktop && npx vitest run 2>&1
      2. Check output for total pass/fail counts
      3. Verify zero failures
    Expected Result: All tests pass; zero failures; zero errors
    Failure Indicators: Any test failure or error
    Evidence: .sisyphus/evidence/task-4-full-suite.txt

  Scenario: No unrelated files were modified
    Tool: Bash (git)
    Preconditions: All changes committed
    Steps:
      1. Run: git diff --name-only HEAD~3
      2. Verify only these files changed:
         - ogre-desktop/src/lib/agent-dom.ts
         - ogre-desktop/src/lib/agent-dom.test.ts
         - ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts
    Expected Result: Only the 3 expected files appear in diff
    Failure Indicators: Additional unexpected files in the diff
    Evidence: .sisyphus/evidence/task-4-files-changed.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 2 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (grep for `'summary'` in selector list, grep for `expanded`/`collapsed` in type logic, verify test file exists). For each "Must NOT Have": search codebase for forbidden changes (`browser-actions.ts`, `batch-grader.ts`, `dom-snapshot-types.ts` should be untouched). Check evidence files exist in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Regression Check** — `unspecified-high`
  Run `cd ogre-desktop && npx vitest run`. Review changed files for: hardcoded values, missing edge cases, inconsistent patterns with existing code. Verify the inline script is valid ES5 (no arrow functions, no const/let, no template literals inside the string). Check that `formatDomForPrompt` output matches documented format.
  Output: `Tests [N pass/N fail] | Code Review [PASS/FAIL] | ES5 Compliance [PASS/FAIL] | VERDICT`

---

## Commit Strategy

| Order | Message | Files | Pre-commit |
|-------|---------|-------|------------|
| 1 | `test: add summary element fixtures and agent-dom unit tests` | `agent-fixtures.ts`, `agent-dom.test.ts` | `cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts` |
| 2 | `feat: add summary element support to agent DOM capture` | `agent-dom.ts` | `cd ogre-desktop && npx vitest run` |

---

## Success Criteria

### Verification Commands
```bash
# Test the new feature
cd ogre-desktop && npx vitest run src/lib/agent-dom.test.ts  # Expected: all pass

# Full regression
cd ogre-desktop && npx vitest run  # Expected: all pass, zero failures

# Verify selector change
grep "'summary'" ogre-desktop/src/lib/agent-dom.ts  # Expected: match in selector array

# Verify type logic
grep -A2 "summary" ogre-desktop/src/lib/agent-dom.ts | grep "expanded\|collapsed"  # Expected: conditional assignment
```

### Final Checklist
- [ ] `<summary>` in INTERACTIVE_DOM_SCRIPT selector list
- [ ] `type` field set to `expanded`/`collapsed` for summary elements
- [ ] `formatDomForPrompt` renders `summary[collapsed]` and `summary[expanded]`
- [ ] Unit tests covering both states
- [ ] Full test suite passes
- [ ] No forbidden files modified
