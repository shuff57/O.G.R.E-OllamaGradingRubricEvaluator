# Agent Mode: Page Scraping & Interaction Bug Fixes

## TL;DR

> **Quick Summary**: Fix 9 identified bugs in O.G.R.E.'s agent mode CDP-based page scraping and browser interaction system, ordered by ascending risk to build test confidence before tackling high-impact changes.
> 
> **Deliverables**:
> - 9 bug fixes across 5 core files with tests-first approach
> - New `agent-api.test.ts` test file for previously untested module
> - All existing 63+ vitest tests passing with zero regressions
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (test baseline) -> Task 2 (dead code) -> Tasks 3-6 (parallel low/med risk) -> Task 7 (navigate wait) -> Task 8 (selector escaping) -> Task 9 (fuzzy classList) -> Task 10 (visibility) -> Task 11 (AX merge) -> Final Verification

---

## Context

### Original Request
User reviewed agent mode code review findings (9 bugs/weaknesses, prioritized High/Medium/Low) and said "build a plan" to fix all identified issues.

### Interview Summary
**Key Discussions**:
- Full code review completed across 7 core agent mode files
- 9 bugs identified: 3 High Impact, 3 Medium Impact, 3 Low Impact
- No Playwright migration — fixing in-place within existing CDP architecture
- browser-use and agent-browser libraries were evaluated and ruled out

**Research Findings**:
- All bugs confirmed at line-level precision by Metis exploration
- Bug #1/#6/#8 are in `browser-actions.ts`, NOT `cdp-actions.ts` (corrected from initial review)
- `agent-api.ts` has NO test file — must create before modifying
- Bugs #4 and #5 are coupled — selector format changes affect fuzzy matching
- `INTERACTIVE_DOM_SCRIPT` in agent-dom.ts runs as eval'd string — must remain ES5-compatible

### Metis Review
**Identified Gaps** (addressed):
- File location correction: 3 bugs reassigned to correct file (`browser-actions.ts`)
- Missing test file: `agent-api.test.ts` must be created before Bug #9 fix
- Coupling between Bug #4 and #5: planned as sequential pair
- ES5 constraint for inline DOM script: noted in guardrails
- CDP event listener cleanup: one-shot pattern required for Bug #1
- `findFuzzyMatch` return type change is breaking API: all call sites must be updated

---

## Work Objectives

### Core Objective
Fix 9 bugs in agent mode's page scraping and interaction pipeline to improve reliability on grading pages, eliminate stale DOM reads after navigation, and improve selector quality/recovery.

### Concrete Deliverables
- Fixed `navigateAction` with page-load wait + configurable timeout (Bug #1)
- Fixed `isVisible()` to include below-fold elements with `inViewport` flag (Bug #2)
- Merged AX tree + DOM instead of full replacement (Bug #3)
- Fixed `getSelector()` CSS escaping and multi-class support (Bug #4)
- Fixed `matchByIdOrClass` to check actual classList, not selector string (Bug #5)
- Fixed `scrollIntoViewAction` to use TreeWalker instead of `querySelectorAll('*')` (Bug #6)
- Fixed `fuzzyMatchReason()` to report actual strategy used (Bug #7)
- Fixed `tripleClickAction` to dispatch proper mouse event sequence (Bug #8)
- Removed dead regex fallback parser from `parseAgentResponse` (Bug #9)
- New `agent-api.test.ts` with full `parseAgentResponse` coverage

### Definition of Done
- [ ] `npx vitest run` from `ogre-desktop/` — all tests pass, zero regressions
- [ ] Each bug fix has at least one test that FAILS before fix and PASSES after
- [ ] No `querySelectorAll('*')` in scrollIntoView implementation
- [ ] navigateAction waits for page load with timeout (never hangs)
- [ ] Below-fold elements appear in interactive DOM extraction
- [ ] AX tree merges with DOM instead of replacing

### Must Have
- Tests first for every bug fix
- ES5 compatibility maintained in `INTERACTIVE_DOM_SCRIPT` (agent-dom.ts inline eval)
- CDP event listeners cleaned up (one-shot pattern) for navigate wait
- Configurable max-wait timeout on navigate (default 10s, never hang)
- `findFuzzyMatch` return type updated at ALL call sites

### Must NOT Have (Guardrails)
- Do NOT reorder `getSelector()` priority levels (Bug #4 — fix escaping only)
- Do NOT add new fuzzy matching strategies (Bug #7 — fix return type only)
- Do NOT modify `cdp-bridge.ts` `formatAXTree` output format
- Do NOT refactor `parseAgentResponse` pipeline structure (Bug #9 — remove dead code only)
- Do NOT add retry/redirect logic to navigateAction (Bug #1 — add wait only)
- Do NOT change `scrollIntoViewAction` text matching semantics (Bug #6 — fix performance only)
- Do NOT add `data-attribute` priority to selector generation
- Do NOT use arrow functions, const/let, or template literals in inline DOM scripts

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, 63+ test files)
- **Automated tests**: YES (Tests-first: write failing test, then implement fix)
- **Framework**: vitest (`npx vitest run` from `ogre-desktop/`)
- **Pattern**: RED (failing test) -> GREEN (minimal fix) -> verify no regressions

### QA Policy
Every task includes vitest-based acceptance criteria.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: vitest with existing mock patterns (`vi.mock('./cdp-client')`, etc.)
- **Regression**: Full suite `npx vitest run` from `ogre-desktop/` after each fix
- **Integration**: `npx vitest run src/lib/agent-*.test.ts src/lib/browser-actions*.test.ts src/lib/cdp-actions.test.ts`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — test baseline + isolated low-risk fixes):
├── Task 1: Create agent-api.test.ts baseline [quick]
├── Task 2: Remove dead regex parser - Bug #9 (depends: 1) [quick]
├── Task 3: Fix fuzzyMatchReason strategy index - Bug #7 [quick]
├── Task 4: Fix scrollIntoView performance - Bug #6 [quick]
└── Task 5: Fix tripleClick event sequence - Bug #8 [quick]

Wave 2 (After Wave 1 — high-impact fixes):
├── Task 6: Add page-load wait to navigateAction - Bug #1 [deep]
├── Task 7: Fix getSelector escaping + multi-class - Bug #4 [deep]
├── Task 8: Fix fuzzy matchByIdOrClass classList - Bug #5 (depends: 7) [deep]
├── Task 9: Include below-fold elements in isVisible - Bug #2 [unspecified-high]
└── Task 10: Merge AX tree with DOM - Bug #3 [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Full test suite verification (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 -> Task 2 -> Task 6 -> Task 7 -> Task 8 -> F1-F4 -> user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2 | 1 |
| 2 | 1 | — | 1 |
| 3 | — | — | 1 |
| 4 | — | — | 1 |
| 5 | — | — | 1 |
| 6 | — | — | 2 |
| 7 | — | 8 | 2 |
| 8 | 7 | — | 2 |
| 9 | — | — | 2 |
| 10 | — | — | 2 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** — T1 `quick`, T2 `quick`, T3 `quick`, T4 `quick`, T5 `quick`
- **Wave 2**: **5 tasks** — T6 `deep`, T7 `deep`, T8 `deep`, T9 `unspecified-high`, T10 `unspecified-high`
- **FINAL**: **4 tasks** — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Create agent-api.test.ts baseline coverage

  **What to do**:
  - Create `ogre-desktop/src/lib/agent-api.test.ts` with tests for `parseAgentResponse`
  - Test cases to cover:
    - Valid JSON action object → returns parsed action correctly
    - JSON wrapped in markdown fences (```json ... ```) → strips fences, returns parsed action
    - JSON with `<think>...</think>` blocks → strips think blocks, returns parsed action
    - JSON with trailing commas → tolerant parsing succeeds
    - JSON with HTML entities (`&quot;`) → decodes and parses
    - Nested `{ response: JSON.stringify({...}) }` wrapper → unwraps and parses
    - Plain text `click(#selector)` regex pattern → test current behavior (document what happens)
    - Completely invalid input → returns appropriate fallback/error
  - Follow existing mock pattern: `vi.mock('./electron-bridge')` if needed
  - Use vitest `describe`/`test`/`expect` pattern matching other test files

  **Must NOT do**:
  - Do NOT modify `agent-api.ts` itself — tests only
  - Do NOT refactor test utilities or shared fixtures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single test file creation, following established patterns
  - **Skills**: []
    - No special skills needed — straightforward vitest test writing

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before Task 2)
  - **Parallel Group**: Wave 1 (start first, blocks Task 2)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/browser-actions.test.ts:1-50` — Mock setup pattern with `vi.mock()` and typed mock casts
  - `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts:1-14` — Clean `describe`/`test` structure with helper factory function
  - `ogre-desktop/src/lib/cdp-actions.test.ts:1-48` — Multi-module mock setup pattern

  **API/Type References** (contracts to test against):
  - `ogre-desktop/src/lib/agent-api.ts` — `parseAgentResponse` function signature and all parsing branches
  - `ogre-desktop/src/lib/agent-types.ts` — `AgentAction` type definition for expected return shape

  **Test References** (testing patterns to follow):
  - `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts` — Shared test fixtures (`createMockAgentServer`, `collectEvents`)

  **WHY Each Reference Matters**:
  - `browser-actions.test.ts` shows how to mock dependencies and cast vi.fn() for TypeScript
  - `agent-dom-fuzzy.test.ts` shows clean pure-function test structure (parseAgentResponse is mostly pure)
  - `agent-api.ts` is the module under test — read it to understand all parsing branches
  - `agent-types.ts` defines the `AgentAction` return type to assert against

  **Acceptance Criteria**:

  - [ ] Test file created: `ogre-desktop/src/lib/agent-api.test.ts`
  - [ ] `npx vitest run src/lib/agent-api.test.ts` → PASS (8+ tests, 0 failures)
  - [ ] Tests cover: valid JSON, markdown fences, think blocks, trailing commas, HTML entities, wrapper unwrap, regex fallback, invalid input

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All parseAgentResponse tests pass
    Tool: Bash
    Preconditions: ogre-desktop/ has all dependencies installed
    Steps:
      1. Run `npx vitest run src/lib/agent-api.test.ts` from ogre-desktop/
      2. Assert exit code is 0
      3. Assert output contains "Tests  8" or more (8+ tests)
      4. Assert output contains "0 failed"
    Expected Result: All tests pass, 8+ test cases, 0 failures
    Failure Indicators: Non-zero exit code, any "FAIL" in output
    Evidence: .sisyphus/evidence/task-1-agent-api-tests.txt

  Scenario: New tests don't break existing suite
    Tool: Bash
    Preconditions: ogre-desktop/ has all dependencies installed
    Steps:
      1. Run `npx vitest run` from ogre-desktop/
      2. Assert exit code is 0
      3. Assert output shows 0 failed tests
    Expected Result: Full suite passes with 0 regressions
    Failure Indicators: Any test failure not present before this change
    Evidence: .sisyphus/evidence/task-1-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(agent-api): add parseAgentResponse test coverage`
  - Files: `ogre-desktop/src/lib/agent-api.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-api.test.ts`

- [x] 2. Remove dead regex action fallback parser — Bug #9

  **What to do**:
  - In `ogre-desktop/src/lib/agent-api.ts`, locate the regex fallback parser (lines ~158-173)
  - The pattern `^(click|type|...)\\s*\\(` with `JSON.parse('{' + paramsStr + '}')` is dead code
  - Remove the entire regex fallback branch
  - Ensure `parseAgentResponse` still handles all valid inputs (JSON, fenced JSON, think blocks, etc.)
  - Update `agent-api.test.ts` to assert that `click(#foo)` text input is NOT parsed as an action (returns text fallback)

  **Must NOT do**:
  - Do NOT refactor the rest of `parseAgentResponse` — remove dead code only
  - Do NOT change the JSON parsing pipeline
  - Do NOT add new parsing strategies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small deletion of dead code, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 1 (needs test baseline first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-api.ts:158-173` — The dead regex fallback code to remove

  **Test References**:
  - `ogre-desktop/src/lib/agent-api.test.ts` — Tests created in Task 1 (update the regex fallback test case)

  **WHY Each Reference Matters**:
  - `agent-api.ts:158-173` is the exact code to delete
  - `agent-api.test.ts` must be updated to assert the removed path no longer parses

  **Acceptance Criteria**:

  - [ ] Regex fallback parser removed from `agent-api.ts`
  - [ ] `npx vitest run src/lib/agent-api.test.ts` → PASS
  - [ ] No `^(click|type|scroll` regex pattern exists in agent-api.ts
  - [ ] `parseAgentResponse('click(#foo)')` returns text fallback, not a parsed action

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dead regex code is removed
    Tool: Bash (grep)
    Preconditions: Bug #9 fix applied
    Steps:
      1. Run `grep -n "click|type|scroll" ogre-desktop/src/lib/agent-api.ts` 
      2. Assert no regex action pattern match exists (the fallback parser regex is gone)
      3. Run `npx vitest run src/lib/agent-api.test.ts` from ogre-desktop/
      4. Assert all tests pass including the updated regex fallback test
    Expected Result: Regex removed, all tests pass
    Failure Indicators: Regex pattern still present, or any test failure
    Evidence: .sisyphus/evidence/task-2-dead-code-removed.txt

  Scenario: Existing parsing paths still work
    Tool: Bash
    Preconditions: Bug #9 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-api.test.ts` from ogre-desktop/
      2. Assert valid JSON, fenced JSON, think blocks, and wrapper cases all pass
    Expected Result: All non-regex parsing paths work identically
    Failure Indicators: Any test that passed before now fails
    Evidence: .sisyphus/evidence/task-2-parsing-intact.txt
  ```

  **Commit**: YES
  - Message: `fix(agent-api): remove dead regex action fallback parser [#9]`
  - Files: `ogre-desktop/src/lib/agent-api.ts`, `ogre-desktop/src/lib/agent-api.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-api.test.ts`

- [x] 3. Fix fuzzyMatchReason strategy index reporting — Bug #7

  **What to do**:
  - In `ogre-desktop/src/lib/agent-dom-fuzzy.ts`, modify `findFuzzyMatch` to return BOTH the matched element AND the strategy index that found it (currently returns only the element)
  - Update return type: `{ element: InteractiveElement, strategyIndex: number } | null`
  - In `ogre-desktop/src/lib/browser-actions.ts`, update the call site at line ~444 where `fuzzyMatchReason(originalSelector, match, 0)` hardcodes `0`
  - Use the actual `strategyIndex` from `findFuzzyMatch` return value instead of hardcoded `0`
  - Use `lsp_find_references` on `findFuzzyMatch` BEFORE changing return type to find ALL call sites
  - Update ALL call sites to destructure the new return type
  - Update tests in `agent-dom-fuzzy.test.ts` to assert correct strategy index per match type
  - Update tests in `browser-actions-fuzzy.test.ts` for the updated call pattern

  **Must NOT do**:
  - Do NOT add new fuzzy matching strategies
  - Do NOT change the order of existing strategies
  - Do NOT modify the matching logic itself — only the return value

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Return type change + call site updates, small surface area
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (parallel with Tasks 4, 5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — Full file, especially `findFuzzyMatch` function and the 4 strategy functions
  - `ogre-desktop/src/lib/browser-actions.ts:444` — The hardcoded `fuzzyMatchReason(originalSelector, match, 0)` call

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts` — `InteractiveElement` type definition
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — `fuzzyMatchReason` function that consumes strategy index

  **Test References**:
  - `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts` — Existing tests for all 4 strategies (13 tests)
  - `ogre-desktop/src/lib/browser-actions-fuzzy.test.ts` — Tests for fuzzy fallback integration in browser-actions

  **WHY Each Reference Matters**:
  - `agent-dom-fuzzy.ts` is the module being modified — need full context of all strategies
  - `browser-actions.ts:444` is the broken call site with hardcoded `0`
  - Both test files need updates to match new return type

  **Acceptance Criteria**:

  - [ ] `findFuzzyMatch` returns `{ element, strategyIndex }` or `null`
  - [ ] `browser-actions.ts` uses actual `strategyIndex` from `findFuzzyMatch` (no hardcoded `0`)
  - [ ] All call sites of `findFuzzyMatch` updated (verify with `lsp_find_references`)
  - [ ] `npx vitest run src/lib/agent-dom-fuzzy.test.ts` → PASS with strategy index assertions
  - [ ] `npx vitest run src/lib/browser-actions-fuzzy.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Strategy index correctly reported for each match type
    Tool: Bash
    Preconditions: Bug #7 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-dom-fuzzy.test.ts` from ogre-desktop/
      2. Assert tests include strategy index verification per strategy type
      3. Assert text-content match returns strategyIndex 0
      4. Assert id/class match returns strategyIndex 1
      5. Assert aria-label match returns strategyIndex 2
      6. Assert position match returns strategyIndex 3
    Expected Result: Each strategy reports correct index
    Failure Indicators: Any test failure, wrong strategy index
    Evidence: .sisyphus/evidence/task-3-strategy-index.txt

  Scenario: No hardcoded strategy 0 in browser-actions
    Tool: Bash (grep)
    Preconditions: Bug #7 fix applied
    Steps:
      1. Search `browser-actions.ts` for `fuzzyMatchReason` calls
      2. Assert no call passes literal `0` as the strategy parameter
      3. Run `npx vitest run src/lib/browser-actions-fuzzy.test.ts`
      4. Assert all fuzzy integration tests pass
    Expected Result: Dynamic strategy index used, all tests pass
    Failure Indicators: Hardcoded `0` still present, test failures
    Evidence: .sisyphus/evidence/task-3-no-hardcode.txt
  ```

  **Commit**: YES
  - Message: `fix(browser-actions): report correct fuzzy match strategy index [#7]`
  - Files: `ogre-desktop/src/lib/agent-dom-fuzzy.ts`, `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts`, `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/browser-actions-fuzzy.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-dom-fuzzy.test.ts src/lib/browser-actions-fuzzy.test.ts`

- [x] 4. Fix scrollIntoView performance — Bug #6

  **What to do**:
  - In `ogre-desktop/src/lib/browser-actions.ts`, locate `scrollIntoViewAction` (lines ~245-271)
  - Replace `document.querySelectorAll('*')` with a `TreeWalker` using `NodeFilter.SHOW_TEXT`
  - The TreeWalker should walk text nodes, check `textContent.includes(text)` (same matching semantics as current)
  - When a matching text node is found, scroll its parent element into view
  - Keep the same behavior: finds first text match, scrolls it into view
  - Note: this runs inside `evalScript()` — the JS is eval'd in the webview page context

  **Must NOT do**:
  - Do NOT change text matching semantics (case sensitivity, partial matching behavior)
  - Do NOT add regex or fuzzy matching to scrollIntoView
  - Do NOT change what happens after the element is found (scroll behavior stays the same)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function replacement, same interface, perf improvement only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (parallel with Tasks 3, 5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:245-271` — Current `scrollIntoViewAction` implementation with `querySelectorAll('*')`

  **Test References**:
  - `ogre-desktop/src/lib/browser-actions.test.ts` — Existing tests for `executeAction` including scroll actions

  **WHY Each Reference Matters**:
  - `browser-actions.ts:245-271` is the exact function to modify — understand current matching logic before replacing
  - `browser-actions.test.ts` has existing scroll tests to verify no regressions

  **Acceptance Criteria**:

  - [ ] No `querySelectorAll('*')` in `scrollIntoViewAction`
  - [ ] `TreeWalker` with `NodeFilter.SHOW_TEXT` used instead
  - [ ] Same text matching behavior (case, partial match)
  - [ ] `npx vitest run src/lib/browser-actions.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: scrollIntoView finds text using TreeWalker
    Tool: Bash
    Preconditions: Bug #6 fix applied
    Steps:
      1. Search browser-actions.ts for `querySelectorAll('*')` — assert NOT found in scrollIntoView
      2. Search browser-actions.ts for `TreeWalker` or `createTreeWalker` — assert found
      3. Run `npx vitest run src/lib/browser-actions.test.ts`
      4. Assert all scroll-related tests pass
    Expected Result: TreeWalker used, querySelectorAll('*') removed, tests pass
    Failure Indicators: querySelectorAll('*') still present, test failures
    Evidence: .sisyphus/evidence/task-4-treewalker.txt

  Scenario: No regressions in browser-actions suite
    Tool: Bash
    Preconditions: Bug #6 fix applied
    Steps:
      1. Run `npx vitest run src/lib/browser-actions.test.ts` from ogre-desktop/
      2. Assert 0 failed tests
    Expected Result: All existing tests pass
    Failure Indicators: Any previously-passing test now fails
    Evidence: .sisyphus/evidence/task-4-no-regression.txt
  ```

  **Commit**: YES
  - Message: `fix(browser-actions): replace querySelectorAll(*) with TreeWalker in scrollIntoView [#6]`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/browser-actions.test.ts`
  - Pre-commit: `npx vitest run src/lib/browser-actions.test.ts`

- [x] 5. Fix tripleClick event sequence — Bug #8

  **What to do**:
  - In `ogre-desktop/src/lib/browser-actions.ts`, locate `tripleClickAction` (lines ~111-138)
  - Current implementation dispatches a single `MouseEvent('click', { detail: 3 })` which doesn't properly simulate triple-click in React/Angular controlled inputs
  - Fix: dispatch the full mouse event sequence via CDP `Input.dispatchMouseEvent` with `clickCount` incrementing 1→2→3:
    - mousedown (clickCount: 1) → mouseup → click
    - mousedown (clickCount: 2) → mouseup → click  
    - mousedown (clickCount: 3) → mouseup → click
  - Use `cdp.send('Input.dispatchMouseEvent')` for each event (consistent with `pwClick` pattern)
  - Keep the existing `.select()` fallback for input/textarea elements
  - Keep the existing `createRange`/`getSelection` path for contenteditable as a backup after the CDP events

  **Must NOT do**:
  - Do NOT remove the `.select()` fallback for input/textarea
  - Do NOT change when/where tripleClickAction is called
  - Do NOT modify other click actions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function fix, well-scoped
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (parallel with Tasks 3, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:111-138` — Current `tripleClickAction` implementation
  - `ogre-desktop/src/lib/cdp-actions.ts` — `pwClick` function showing `Input.dispatchMouseEvent` pattern with `DOM.getBoxModel` for coordinates

  **Test References**:
  - `ogre-desktop/src/lib/browser-actions.test.ts` — Existing tests for triple_click action
  - `ogre-desktop/src/lib/cdp-actions.test.ts` — Tests showing CDP mock patterns for `Input.dispatchMouseEvent`

  **WHY Each Reference Matters**:
  - `browser-actions.ts:111-138` is the function to fix
  - `cdp-actions.ts` shows the correct `Input.dispatchMouseEvent` pattern with `DOM.scrollIntoViewIfNeeded` + `DOM.getBoxModel` for getting click coordinates
  - Both test files show how to mock CDP sends for mouse events

  **Acceptance Criteria**:

  - [ ] `tripleClickAction` dispatches 3 pairs of mousedown/mouseup via CDP `Input.dispatchMouseEvent`
  - [ ] `clickCount` increments 1→2→3 across the 3 click sequences
  - [ ] `.select()` fallback preserved for input/textarea
  - [ ] `npx vitest run src/lib/browser-actions.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Triple-click dispatches proper event sequence
    Tool: Bash
    Preconditions: Bug #8 fix applied
    Steps:
      1. Run `npx vitest run src/lib/browser-actions.test.ts -t "triple"` from ogre-desktop/
      2. Assert tests verify 3 mousedown + 3 mouseup dispatches
      3. Assert tests verify clickCount increments 1, 2, 3
    Expected Result: Full mouse event sequence dispatched, tests pass
    Failure Indicators: Missing events, wrong clickCount, test failures
    Evidence: .sisyphus/evidence/task-5-triple-click.txt

  Scenario: Select fallback still works for inputs
    Tool: Bash
    Preconditions: Bug #8 fix applied
    Steps:
      1. Run `npx vitest run src/lib/browser-actions.test.ts -t "triple"` from ogre-desktop/
      2. Assert input/textarea select() path is still tested and passes
    Expected Result: .select() fallback preserved and working
    Failure Indicators: Test failure on input/textarea triple-click
    Evidence: .sisyphus/evidence/task-5-select-fallback.txt
  ```

  **Commit**: YES
  - Message: `fix(browser-actions): dispatch full mouse event sequence in tripleClick [#8]`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/browser-actions.test.ts`
  - Pre-commit: `npx vitest run src/lib/browser-actions.test.ts`

- [x] 6. Add page-load wait to navigateAction — Bug #1 (HIGH IMPACT)

  **What to do**:
  - In `ogre-desktop/src/lib/browser-actions.ts`, locate `navigateAction` (lines ~183-190)
  - Currently sends `Page.navigate` via CDP and returns immediately — next action reads stale/blank DOM
  - Add a post-navigate wait: after `Page.navigate` resolves, wait for `Page.loadEventFired` from CDP
  - Implementation:
    1. First enable page events: `cdp.send('Page.enable')`
    2. Register a one-shot listener for `Page.loadEventFired` BEFORE sending `Page.navigate`
    3. Send `Page.navigate` — check for `errorText` in response (indicates navigation failure)
    4. Await the load event with a configurable max-wait timeout (default 10 seconds)
    5. If timeout expires, resolve with `{ success: true, warning: 'Page load timed out after 10s' }` (don't throw)
    6. Clean up the listener (one-shot pattern — remove after first fire or timeout)
  - Edge cases to handle:
    - Navigation to same URL: `Page.navigate` may not fire `loadEventFired` — use timeout as fallback
    - Navigation error (404, network failure): `Page.navigate` returns `{ errorText }` — return failure immediately, don't wait for load
    - Hash-only navigation (`#section`): may not fire full load — use timeout as fallback

  **Must NOT do**:
  - Do NOT add retry logic for failed navigations
  - Do NOT add redirect following
  - Do NOT change the function signature (add timeout as optional param with default)
  - Do NOT leak event listeners — MUST clean up on both success and timeout paths

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful async event handling, timeout management, edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (parallel with Tasks 7, 9, 10; after Wave 1)
  - **Blocks**: None
  - **Blocked By**: Wave 1 completion (test confidence built)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:183-190` — Current `navigateAction` implementation
  - `ogre-desktop/src/lib/cdp-actions.ts` — Shows CDP `cdp.send()` pattern and how `cdp` client is used
  - `ogre-desktop/src/lib/cdp-client.ts` — CDP client's `on()`/`off()` event listener API for receiving CDP events

  **API/Type References**:
  - CDP `Page.navigate` docs: returns `{ frameId, loaderId, errorText? }` — `errorText` means navigation failed
  - CDP `Page.loadEventFired` event: fires when page load completes
  - CDP `Page.enable` method: must be called to receive Page domain events

  **Test References**:
  - `ogre-desktop/src/lib/browser-actions.test.ts` — Existing mock setup for navigate
  - `ogre-desktop/src/lib/cdp-actions.test.ts` — Mock patterns for `cdp.send()` and `cdp.on()`

  **WHY Each Reference Matters**:
  - `browser-actions.ts:183-190` is the exact function to modify
  - `cdp-client.ts` — need to understand event listener API to add one-shot `Page.loadEventFired` listener
  - `cdp-actions.test.ts` shows how to mock CDP events in tests

  **Acceptance Criteria**:

  - [ ] `navigateAction` waits for `Page.loadEventFired` after `Page.navigate`
  - [ ] Configurable timeout (default 10s) — never hangs indefinitely
  - [ ] Timeout resolves with success + warning (not error)
  - [ ] Navigation errors (errorText) return failure immediately without waiting
  - [ ] Event listener cleaned up on both success and timeout paths (no leaks)
  - [ ] `npx vitest run src/lib/browser-actions.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Navigate waits for page load
    Tool: Bash
    Preconditions: Bug #1 fix applied
    Steps:
      1. Run `npx vitest run src/lib/browser-actions.test.ts -t "navigate"` from ogre-desktop/
      2. Assert test exists that verifies navigateAction awaits Page.loadEventFired
      3. Assert test shows navigateAction does NOT resolve before the load event fires
    Expected Result: Navigate waits for load event before resolving
    Failure Indicators: Navigate resolves immediately, test failure
    Evidence: .sisyphus/evidence/task-6-navigate-wait.txt

  Scenario: Navigate times out gracefully
    Tool: Bash
    Preconditions: Bug #1 fix applied
    Steps:
      1. Run `npx vitest run src/lib/browser-actions.test.ts -t "timeout"` from ogre-desktop/
      2. Assert test exists where Page.loadEventFired never fires
      3. Assert navigateAction resolves with { success: true, warning: ... } after timeout
      4. Assert it does NOT throw or hang
    Expected Result: Graceful timeout with warning, not hang or error
    Failure Indicators: Hangs forever, throws error, no warning in response
    Evidence: .sisyphus/evidence/task-6-navigate-timeout.txt

  Scenario: Navigate handles error immediately
    Tool: Bash
    Preconditions: Bug #1 fix applied
    Steps:
      1. Run `npx vitest run src/lib/browser-actions.test.ts -t "navigate.*error"` from ogre-desktop/
      2. Assert test mocks Page.navigate to return { errorText: "net::ERR_NAME_NOT_RESOLVED" }
      3. Assert navigateAction returns failure immediately without waiting for load
    Expected Result: Immediate failure on navigation error
    Failure Indicators: Waits for load despite error, no error returned
    Evidence: .sisyphus/evidence/task-6-navigate-error.txt
  ```

  **Commit**: YES
  - Message: `fix(browser-actions): wait for page load after navigate with configurable timeout [#1]`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/browser-actions.test.ts`
  - Pre-commit: `npx vitest run src/lib/browser-actions.test.ts`

- [x] 7. Fix getSelector CSS escaping and multi-class support — Bug #4

  **What to do**:
  - In `ogre-desktop/src/lib/agent-dom.ts`, locate `getSelector()` function (within `INTERACTIVE_DOM_SCRIPT` inline eval string)
  - **CRITICAL**: This code runs as an eval'd string inside the target page's context. MUST remain ES5 compatible:
    - No arrow functions, no const/let, no template literals, no destructuring, no `CSS.escape()`
    - Use `var` for all declarations
  - Fix priority 4 (class-based selector):
    - Currently uses only `className.split(/\\s+/)[0]` (first class only)
    - Change to use up to 2-3 classes joined: `tag.class1.class2` for better uniqueness
    - Verify the generated selector matches only one element — if multiple matches, fall through to nth-child
  - Fix attribute value quoting:
    - Ensure `name` attribute values are quoted in selectors: `[name="value"]` not `[name=value]`
    - Escape special characters in attribute values (quotes, brackets)
  - For CSS identifier escaping (IDs and class names with special characters like `:`, `.`, `[`):
    - Write a minimal ES5-compatible escape function inline (since `CSS.escape()` may not be available in all webview contexts)
    - Only needs to handle the common problematic characters: `\\.`, `\\:`, `\\[`, `\\]`, `\\(`, `\\)`
  - After generating any selector, test uniqueness: `document.querySelectorAll(sel).length === 1` — if not unique, fall through to next priority

  **Must NOT do**:
  - Do NOT reorder getSelector() priority levels (id → name → semantic → class → nth-child)
  - Do NOT add new priority levels (e.g., data-attribute)
  - Do NOT use ES6+ syntax in the inline script (arrow functions, const, let, template literals)
  - Do NOT use `CSS.escape()` — write inline ES5 polyfill for needed cases only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Tricky ES5 constraint, inline script context, selector uniqueness verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but Task 8 depends on this)
  - **Parallel Group**: Wave 2 (parallel with Tasks 6, 9, 10)
  - **Blocks**: Task 8
  - **Blocked By**: Wave 1 completion

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-dom.ts:55-72` — Current `getSelector()` function within `INTERACTIVE_DOM_SCRIPT`
  - `ogre-desktop/src/lib/agent-dom.ts:79-95` — `isVisible()` function (shows inline script style/constraints)

  **Test References**:
  - `ogre-desktop/src/lib/agent-dom.test.ts` — Existing tests for `formatDomForPrompt`
  - `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts` — Fuzzy tests depend on selector format — run after changes

  **External References**:
  - CSS Selectors spec: `#foo\:bar` for escaping colons, `#foo\.bar` for escaping dots

  **WHY Each Reference Matters**:
  - `agent-dom.ts:55-72` is the exact function to modify — read current priority chain carefully
  - `agent-dom.ts:79-95` shows the inline script style (ES5, var declarations)
  - `agent-dom-fuzzy.test.ts` — fuzzy strategies depend on selector format; changes here propagate

  **Acceptance Criteria**:

  - [ ] Selectors for elements with special chars in ID produce valid CSS: `#foo\\:bar` not `#foo:bar`
  - [ ] Class-based selectors use 2-3 classes for better uniqueness: `button.btn.primary` not `button.btn`
  - [ ] Attribute values properly quoted: `[name="my field"]` not `[name=my field]`
  - [ ] Non-unique selectors fall through to nth-child
  - [ ] ALL code in `INTERACTIVE_DOM_SCRIPT` uses ES5 syntax only (no arrow functions, const, let, template literals)
  - [ ] `npx vitest run src/lib/agent-dom.test.ts` → PASS
  - [ ] `npx vitest run src/lib/agent-dom-fuzzy.test.ts` → PASS (no regressions)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Selectors with special characters are valid CSS
    Tool: Bash
    Preconditions: Bug #4 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-dom.test.ts` from ogre-desktop/
      2. Assert new test exists for element with id "foo:bar" → selector escapes colon
      3. Assert new test exists for element with class "btn primary" → multi-class selector
      4. Assert new test exists for element with name="my field" → quoted attribute value
    Expected Result: All selector generation tests pass with proper escaping
    Failure Indicators: Invalid CSS selectors, test failures
    Evidence: .sisyphus/evidence/task-7-selector-escaping.txt

  Scenario: ES5 compliance maintained
    Tool: Bash (grep)
    Preconditions: Bug #4 fix applied
    Steps:
      1. Extract INTERACTIVE_DOM_SCRIPT content from agent-dom.ts
      2. Search for arrow functions `=>` — assert NOT found within the script string
      3. Search for `const ` or `let ` — assert NOT found within the script string
      4. Search for template literals backtick — assert NOT found within the script string
    Expected Result: All code in inline script is ES5 compatible
    Failure Indicators: ES6+ syntax found in inline script
    Evidence: .sisyphus/evidence/task-7-es5-compliance.txt

  Scenario: Fuzzy matching not broken by selector changes
    Tool: Bash
    Preconditions: Bug #4 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-dom-fuzzy.test.ts` from ogre-desktop/
      2. Assert all 13 existing fuzzy tests pass
      3. Run `npx vitest run src/lib/browser-actions-fuzzy.test.ts`
      4. Assert all fuzzy integration tests pass
    Expected Result: Zero regressions in fuzzy matching
    Failure Indicators: Any previously-passing fuzzy test now fails
    Evidence: .sisyphus/evidence/task-7-fuzzy-compat.txt
  ```

  **Commit**: YES
  - Message: `fix(agent-dom): fix getSelector CSS escaping and multi-class support [#4]`
  - Files: `ogre-desktop/src/lib/agent-dom.ts`, `ogre-desktop/src/lib/agent-dom.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-dom.test.ts src/lib/agent-dom-fuzzy.test.ts`

- [x] 8. Fix fuzzy matchByIdOrClass to check element classList — Bug #5

  **What to do**:
  - In `ogre-desktop/src/lib/agent-dom-fuzzy.ts`, locate `matchByIdOrClass` function (lines ~97-103)
  - Currently checks `el.selector?.includes('.${cls}')` — searches the CSS selector string for class name
  - This fails when `getSelector()` used the nth-child fallback (priority 5) — no class info in selector string
  - Fix: check actual element metadata instead of selector string:
    - The `InteractiveElement` type should have `classList` or `className` available — check the type definition
    - If `classList` is available: check `el.classList?.includes(cls)` or iterate
    - If only `className` string: split on whitespace and check membership
    - If neither exists: fall through (return null for this strategy)
  - IMPORTANT: Run AFTER Task 7 (getSelector changes) — verify the new selector format works with the new matching logic
  - Use `lsp_find_references` on `matchByIdOrClass` to verify no other call sites

  **Must NOT do**:
  - Do NOT add new matching strategies
  - Do NOT change the order of strategies in `findFuzzyMatch`
  - Do NOT modify other fuzzy strategy functions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must coordinate with Task 7 selector changes, type-aware fix
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 7)
  - **Parallel Group**: Wave 2 (sequential after Task 7)
  - **Blocks**: None
  - **Blocked By**: Task 7 (selector format changes)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts:97-103` — Current `matchByIdOrClass` checking `el.selector?.includes('.${cls}')`
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — Other strategy functions showing pattern for element property access

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts` — `InteractiveElement` type — check what class-related properties exist (classList? className? classes?)
  - `ogre-desktop/src/lib/agent-dom.ts` — Where `InteractiveElement` objects are created — see what class data is populated

  **Test References**:
  - `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts:45-65` — Existing Strategy 2 tests for id/class matching
  - `ogre-desktop/src/lib/browser-actions-fuzzy.test.ts` — Integration tests for fuzzy in browser-actions

  **WHY Each Reference Matters**:
  - `agent-dom-fuzzy.ts:97-103` is the exact broken code — need to see what's available on `el`
  - `agent-types.ts` defines what properties `InteractiveElement` has for class data
  - `agent-dom.ts` shows what class data is actually populated during extraction
  - Existing fuzzy tests need updating to cover the nth-child+class edge case

  **Acceptance Criteria**:

  - [ ] `matchByIdOrClass` checks actual element class metadata, not selector string
  - [ ] Element with classList `['btn', 'primary']` but selector `div:nth-child(3)` matches when searching for class `btn`
  - [ ] Element with no class data returns null (no false positive)
  - [ ] `npx vitest run src/lib/agent-dom-fuzzy.test.ts` → PASS with new edge case tests
  - [ ] `npx vitest run src/lib/browser-actions-fuzzy.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fuzzy class match works with nth-child selectors
    Tool: Bash
    Preconditions: Bug #5 fix applied (after Bug #4)
    Steps:
      1. Run `npx vitest run src/lib/agent-dom-fuzzy.test.ts` from ogre-desktop/
      2. Assert new test: element with classList=['btn','primary'] and selector='div:nth-child(3)' → matches for class 'btn'
      3. Assert new test: element with no classList and selector='div:nth-child(3)' → returns null
    Expected Result: Class matching works regardless of selector format
    Failure Indicators: Match fails for elements with class data but nth-child selector
    Evidence: .sisyphus/evidence/task-8-classlist-match.txt

  Scenario: Combined Bug #4 + #5 integration
    Tool: Bash
    Preconditions: Both Bug #4 and #5 fixes applied
    Steps:
      1. Run `npx vitest run src/lib/agent-dom-fuzzy.test.ts src/lib/browser-actions-fuzzy.test.ts src/lib/agent-dom.test.ts` from ogre-desktop/
      2. Assert ALL tests pass across selector generation + fuzzy matching
    Expected Result: Full selector+fuzzy pipeline works end-to-end
    Failure Indicators: Any test failure in the combined suite
    Evidence: .sisyphus/evidence/task-8-integration.txt
  ```

  **Commit**: YES
  - Message: `fix(agent-dom-fuzzy): check element classList instead of selector string [#5]`
  - Files: `ogre-desktop/src/lib/agent-dom-fuzzy.ts`, `ogre-desktop/src/lib/agent-dom-fuzzy.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-dom-fuzzy.test.ts src/lib/browser-actions-fuzzy.test.ts`

- [x] 9. Include below-fold elements in isVisible — Bug #2 (HIGH IMPACT)

  **What to do**:
  - In `ogre-desktop/src/lib/agent-dom.ts`, locate `isVisible()` function within `INTERACTIVE_DOM_SCRIPT` (lines ~79-95)
  - Currently checks `rect.top > viewHeight` and excludes elements below the viewport fold
  - This means on grading pages, student sections below the visible area are invisible to the agent
  - Fix approach: Keep all visibility checks EXCEPT viewport position:
    - Keep: `display:none` → excluded
    - Keep: `visibility:hidden` → excluded
    - Keep: zero width/height → excluded
    - Keep: `opacity:0` → excluded
    - **Remove**: `rect.top > viewHeight` check (below fold)
    - **Remove**: `rect.bottom < 0` check (above fold / scrolled past) if present
  - Add an `inViewport` boolean property to `InteractiveElement`:
    - `true` if the element is within the current viewport bounds
    - `false` if it exists but is above/below the fold
    - This lets the agent know which elements need scrolling before interaction
  - Update `formatDomForPrompt` to include the `inViewport` indicator (e.g., `[offscreen]` tag for elements outside viewport)
  - **CRITICAL**: All inline script changes MUST remain ES5 compatible
  - Cap total extracted elements at 200 (existing limit) — the viewport removal shouldn't exceed this since elements are capped regardless

  **Must NOT do**:
  - Do NOT remove non-viewport visibility checks (display:none, visibility:hidden, etc.)
  - Do NOT change the 200-element cap
  - Do NOT use ES6+ syntax in inline script
  - Do NOT change element extraction order or sorting

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Behavioral change with potential token impact, needs careful testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (parallel with Tasks 6, 7, 10)
  - **Blocks**: None
  - **Blocked By**: Wave 1 completion

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-dom.ts:79-95` — Current `isVisible()` function with viewport checks
  - `ogre-desktop/src/lib/agent-dom.ts` — `INTERACTIVE_DOM_SCRIPT` full context showing extraction pipeline and 200-element cap
  - `ogre-desktop/src/lib/agent-dom.ts` — `formatDomForPrompt()` function that formats elements for LLM consumption

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts` — `InteractiveElement` type — needs `inViewport` boolean added

  **Test References**:
  - `ogre-desktop/src/lib/agent-dom.test.ts` — Existing tests for `formatDomForPrompt`
  - `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts` — Test element fixtures

  **WHY Each Reference Matters**:
  - `agent-dom.ts:79-95` is the exact visibility function to modify
  - `agent-types.ts` needs the `inViewport` property added to the type
  - `agent-dom.test.ts` needs new tests for below-fold element inclusion
  - `formatDomForPrompt` needs to render the `[offscreen]` indicator

  **Acceptance Criteria**:

  - [ ] Elements below the viewport fold ARE included in extraction results
  - [ ] Elements with `display:none` are still excluded
  - [ ] Elements with `visibility:hidden` are still excluded
  - [ ] `InteractiveElement` has `inViewport: boolean` property
  - [ ] `formatDomForPrompt` shows `[offscreen]` for elements outside viewport
  - [ ] 200-element cap still enforced
  - [ ] ES5 syntax only in `INTERACTIVE_DOM_SCRIPT`
  - [ ] `npx vitest run src/lib/agent-dom.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Below-fold elements included
    Tool: Bash
    Preconditions: Bug #2 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-dom.test.ts` from ogre-desktop/
      2. Assert new test: element with rect.top > viewHeight IS included
      3. Assert new test: element with display:none is NOT included
      4. Assert new test: element with rect.top < viewHeight has inViewport=true
      5. Assert new test: element with rect.top > viewHeight has inViewport=false
    Expected Result: Viewport position no longer filters out elements
    Failure Indicators: Below-fold elements still excluded, or hidden elements now included
    Evidence: .sisyphus/evidence/task-9-below-fold.txt

  Scenario: formatDomForPrompt shows offscreen indicator
    Tool: Bash
    Preconditions: Bug #2 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-dom.test.ts -t "offscreen"` from ogre-desktop/
      2. Assert output contains '[offscreen]' for elements with inViewport=false
      3. Assert output does NOT contain '[offscreen]' for elements with inViewport=true
    Expected Result: LLM can distinguish viewport vs offscreen elements
    Failure Indicators: No indicator present, or indicator on wrong elements
    Evidence: .sisyphus/evidence/task-9-offscreen-format.txt
  ```

  **Commit**: YES
  - Message: `fix(agent-dom): include below-fold elements with inViewport flag [#2]`
  - Files: `ogre-desktop/src/lib/agent-dom.ts`, `ogre-desktop/src/lib/agent-dom.test.ts`, `ogre-desktop/src/lib/agent-types.ts`
  - Pre-commit: `npx vitest run src/lib/agent-dom.test.ts`

- [x] 10. Merge AX tree with DOM instead of replacing — Bug #3 (HIGH IMPACT)

  **What to do**:
  - In `ogre-desktop/src/lib/agent-loop.ts`, locate the AX tree decision (lines ~242-246)
  - Currently: `if (countAccessibilityNodes(axTree) > 20)` → `dom = axTree` (full replacement)
  - The replacement means the LLM gets AX tree role locators (like `role=button[name="Submit"]`) but `cdp-actions.ts` only supports CSS selectors — the LLM generates unusable locators
  - Fix approach: MERGE both instead of replacing:
    1. Always include the interactive DOM extraction first (compact CSS-selector-based elements)
    2. When AX tree has >20 nodes, APPEND the AX tree as a supplementary context section
    3. Format: `## Interactive Elements\n{dom}\n\n## Page Structure (Accessibility Tree)\n{axTree}`
    4. Update the system prompt section (if needed) to tell the LLM: "Use CSS selectors from Interactive Elements for actions. Use Accessibility Tree for understanding page structure only."
  - Consider token budget: if combined DOM + AX tree exceeds a reasonable limit (e.g., 8000 tokens estimated), truncate the AX tree rather than the DOM
  - Handle edge case: if AX tree is empty or malformed, don't append garbage

  **Must NOT do**:
  - Do NOT modify `formatAXTree` in `cdp-bridge.ts` — the formatting is fine, the merge logic is the issue
  - Do NOT change the 20-node threshold
  - Do NOT add a role-locator resolver to `cdp-actions.ts` (that's a separate feature)
  - Do NOT modify `captureAccessibilityTree` behavior

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Changes LLM prompt composition, needs careful token management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (parallel with Tasks 6, 7, 9)
  - **Blocks**: None
  - **Blocked By**: Wave 1 completion

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:242-246` — Current AX tree replacement logic with `countAccessibilityNodes(axTree) > 20`
  - `ogre-desktop/src/lib/agent-loop.ts` — `pruneHistory()` and `estimateTokens()` showing token management patterns
  - `ogre-desktop/src/lib/agent-prompt.ts` — System prompt that tells LLM about DOM structure format

  **API/Type References**:
  - `ogre-desktop/electron-main/cdp-bridge.ts` — `formatAXTree()` output format (indented role/name/value tree with [DOM=N] annotations)
  - `ogre-desktop/src/lib/agent-dom.ts` — `formatDomForPrompt()` output format (compact interactive element list)

  **Test References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts` — Core loop tests
  - `ogre-desktop/src/lib/agent-loop.integration.test.ts` — Integration tests
  - `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts` — `createMockAgentServer`, `collectEvents`

  **WHY Each Reference Matters**:
  - `agent-loop.ts:242-246` is the exact decision point to change
  - `agent-prompt.ts` may need a small update to explain the merged format to the LLM
  - `agent-loop.test.ts` has 6 test files that exercise the loop — need to verify none break
  - `estimateTokens()` shows how token budget is managed — relevant for truncation logic

  **Acceptance Criteria**:

  - [ ] When AX tree has >20 nodes, BOTH DOM and AX tree appear in the prompt
  - [ ] Interactive DOM elements listed first (with CSS selectors)
  - [ ] AX tree appended as supplementary structure section
  - [ ] When AX tree has ≤20 nodes, only DOM appears (no change from current behavior for small pages)
  - [ ] Empty/malformed AX tree is not appended (graceful handling)
  - [ ] `npx vitest run src/lib/agent-loop*.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DOM and AX tree merge for complex pages
    Tool: Bash
    Preconditions: Bug #3 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-loop.test.ts -t "accessibility"` from ogre-desktop/
      2. Assert new test: when AX tree > 20 nodes, prompt contains BOTH interactive elements AND accessibility tree sections
      3. Assert interactive elements section appears BEFORE AX tree section
      4. Assert CSS selectors are present in the interactive elements section
    Expected Result: Both sources merged, DOM first, AX tree supplementary
    Failure Indicators: AX tree replaces DOM, or DOM missing from merged output
    Evidence: .sisyphus/evidence/task-10-ax-merge.txt

  Scenario: Small pages unchanged
    Tool: Bash
    Preconditions: Bug #3 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-loop.test.ts` from ogre-desktop/
      2. Assert: when AX tree ≤ 20 nodes, output contains ONLY interactive elements (no AX tree section)
    Expected Result: Behavior unchanged for simple pages
    Failure Indicators: AX tree appears on simple pages
    Evidence: .sisyphus/evidence/task-10-simple-page.txt

  Scenario: Empty AX tree handled gracefully
    Tool: Bash
    Preconditions: Bug #3 fix applied
    Steps:
      1. Run `npx vitest run src/lib/agent-loop.test.ts` from ogre-desktop/
      2. Assert: when AX tree is empty string or null, only DOM appears (no crash, no empty section)
    Expected Result: Graceful degradation, no garbage appended
    Failure Indicators: Crash, empty "## Page Structure" header with no content
    Evidence: .sisyphus/evidence/task-10-empty-ax.txt
  ```

  **Commit**: YES
  - Message: `fix(agent-loop): merge AX tree with DOM instead of replacing [#3]`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-loop*.test.ts`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run vitest). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` from `ogre-desktop/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify ES5 compliance in `INTERACTIVE_DOM_SCRIPT`.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | ES5 [PASS/FAIL] | VERDICT`

- [x] F3. **Full Test Suite Verification** — `unspecified-high`
  Run `npx vitest run` from `ogre-desktop/` — capture full output. Verify zero regressions vs baseline. Run each new test file individually. Verify test count increased (new tests added). Check coverage of each bug fix — at minimum 1 test per bug that exercises the fixed behavior.
  Output: `Total [N pass/N fail] | New Tests [N] | Bug Coverage [N/9] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message | Files | Pre-commit |
|-------|---------|-------|------------|
| 1 | `test(agent-api): add parseAgentResponse test coverage` | `agent-api.test.ts` | `npx vitest run src/lib/agent-api.test.ts` |
| 2 | `fix(agent-api): remove dead regex action fallback parser [#9]` | `agent-api.ts`, `agent-api.test.ts` | `npx vitest run src/lib/agent-api.test.ts` |
| 3 | `fix(browser-actions): report correct fuzzy match strategy index [#7]` | `agent-dom-fuzzy.ts`, `agent-dom-fuzzy.test.ts`, `browser-actions.ts`, `browser-actions-fuzzy.test.ts` | `npx vitest run src/lib/agent-dom-fuzzy.test.ts src/lib/browser-actions-fuzzy.test.ts` |
| 4 | `fix(browser-actions): replace querySelectorAll(*) with TreeWalker in scrollIntoView [#6]` | `browser-actions.ts`, `browser-actions.test.ts` | `npx vitest run src/lib/browser-actions.test.ts` |
| 5 | `fix(browser-actions): dispatch full mouse event sequence in tripleClick [#8]` | `browser-actions.ts`, `browser-actions.test.ts` | `npx vitest run src/lib/browser-actions.test.ts` |
| 6 | `fix(browser-actions): wait for page load after navigate with configurable timeout [#1]` | `browser-actions.ts`, `browser-actions.test.ts` | `npx vitest run src/lib/browser-actions.test.ts` |
| 7 | `fix(agent-dom): fix getSelector CSS escaping and multi-class support [#4]` | `agent-dom.ts`, `agent-dom.test.ts` | `npx vitest run src/lib/agent-dom.test.ts src/lib/agent-dom-fuzzy.test.ts` |
| 8 | `fix(agent-dom-fuzzy): check element classList instead of selector string [#5]` | `agent-dom-fuzzy.ts`, `agent-dom-fuzzy.test.ts` | `npx vitest run src/lib/agent-dom-fuzzy.test.ts src/lib/browser-actions-fuzzy.test.ts` |
| 9 | `fix(agent-dom): include below-fold elements with inViewport flag [#2]` | `agent-dom.ts`, `agent-dom.test.ts` | `npx vitest run src/lib/agent-dom.test.ts` |
| 10 | `fix(agent-loop): merge AX tree with DOM instead of replacing [#3]` | `agent-loop.ts`, `agent-loop.test.ts` | `npx vitest run src/lib/agent-loop*.test.ts` |

---

## Success Criteria

### Verification Commands
```bash
# Full test suite (must pass with 0 failures)
npx vitest run

# Agent-specific tests (must pass with 0 failures)  
npx vitest run src/lib/agent-*.test.ts src/lib/browser-actions*.test.ts src/lib/cdp-actions.test.ts

# New test file exists and passes
npx vitest run src/lib/agent-api.test.ts
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass — `npx vitest run` from `ogre-desktop/`
- [ ] 9 bugs fixed with 9+ new tests
- [ ] No ES5 violations in `INTERACTIVE_DOM_SCRIPT`
- [ ] No CDP event listener leaks
- [ ] `agent-api.test.ts` created and passing
