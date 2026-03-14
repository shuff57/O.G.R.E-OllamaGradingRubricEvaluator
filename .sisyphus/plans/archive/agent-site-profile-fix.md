# Fix Agent to Use Site Profile Knowledge Instead of Guessing

## TL;DR

> **Quick Summary**: The browser agent ignores its injected site profile knowledge (300-line MOM guide with exact selectors and workflows) and instead guesses CSS selectors, spams screenshots, and enters failure spirals. Fix by restructuring the agent prompt to prioritize site guide knowledge, adding task decomposition for complex requests, fixing a navigate action bug, and improving loop detection.
> 
> **Deliverables**:
> - Restructured agent system prompt with site guide prioritization rules
> - Task decomposition instruction for multi-step tasks
> - Fixed `navigateEmbedded` signature bug
> - Failure window detection for death spirals
> - Site context refresh when agent navigates to new pages
> - TDD tests for all changes
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves + final
> **Critical Path**: Task 1 (navigate fix) -> Task 4 (context refresh) -> Final Verification

---

## Context

### Original Request
Agent was asked: "Create a Unit 1 Quiz with proportionate questions from weeks 1-5 and 2 FRQs from week 1-5 FRQ." The agent had review mode on and a comprehensive MOM site profile with assignment creation selectors, question management workflows, and URL patterns. Instead of using this knowledge, the agent guessed selectors (`a[href*='assessment']`, `a.essen:nth-child(1)`, `#dropdownMenuCtrl2`), spam-clicked, spam-screenshotted (18+ times), and entered a death spiral.

### Interview Summary
**Key Discussions**:
- MOM profile (`myopenmath.md`, 300 lines) covers: home nav, course page, gradebook, assignment creation (Priority 3), question authoring (Priority 4) with exact selectors
- Profile IS injected via `buildSiteContextInjection()` when URL matches `myopenmath.com`
- Agent prompt Rule 3 says "Use the DOM element list to find accurate CSS selectors" - actively points AWAY from the site guide
- No task decomposition exists - agent tries to click immediately on complex multi-step tasks
- `navigateEmbedded` has a P0 signature bug (1 arg vs 2 required)
- Loop detection only catches exact consecutive repeats - alternating failures reset counter
- Site context is built once at loop start, never refreshed on navigation

**Research Findings**:
- Model is Claude (Anthropic) - not a capability issue
- `getSkillsWithUrlPattern()` returns ALL skills regardless of `is_active` - profile injection works
- MOM profile uses `role=link[name="..."]` notation which is NOT valid CSS - prompt must teach agent to treat these as descriptive and map to DOM list selectors
- CDP path has no `case 'navigate'` - all navigate calls go through evalScript path

### Metis Review
**Identified Gaps** (addressed):
- **Profile selector notation mismatch**: MOM profile uses `role=button[name="Save"]` (invalid CSS). Prompt must teach agent these are descriptive, not literal selectors.
- **Navigate bug is P0**: Isolate as Wave 1 before other changes depend on it.
- **Site context refresh strategy**: Use supplementary user messages, NOT system message modification (system is anchored/never-pruned).
- **Multiple navigate edge case**: Agent may navigate 3+ times, creating stale guide messages. Strategy: keep only latest refresh message.
- **Navigate to non-profiled site**: Must handle gracefully with "No site guide available" message.

---

## Work Objectives

### Core Objective
Make the browser agent intelligently use its injected site profile knowledge for navigation and task execution, with explicit task decomposition for complex multi-step requests, instead of blindly guessing selectors and spamming screenshots.

### Concrete Deliverables
- Modified `agent-prompt.ts` with 3 new rules (site guide priority, task decomposition, selector notation)
- Fixed `browser-actions.ts` navigateAction with correct tabId
- Enhanced `agent-loop.ts` with failure window detection and site context refresh
- TDD tests in `agent-loop.test.ts`, `browser-actions.test.ts`, and new prompt test file

### Definition of Done
- [x] `npx vitest run` - ALL tests pass, 0 failures
- [x] Agent prompt contains site guide prioritization instructions
- [x] Agent prompt contains task decomposition instructions
- [x] Agent prompt contains selector notation translation guidance
- [x] Navigate action correctly passes tabId and url
- [x] Agent loop detects alternating failure spirals within a sliding window
- [x] Agent loop refreshes site context after successful navigate actions

### Must Have
- Site guide prioritization rules added to AGENT_SYSTEM_PROMPT
- Task decomposition instruction for multi-step tasks
- navigateEmbedded called with correct (tabId, url) signature
- Failure window detection (consecutive failures across different actions)
- Site context refresh after navigate actions

### Must NOT Have (Guardrails)
- **NO new action types** in `agent-types.ts` (no `plan` action)
- **NO modifications** to `agent-dom-fuzzy.ts`, `agent-dom.ts`, or `skills-api.ts`
- **NO changes** to pruneHistory anchoring logic
- **NO fixes** to selector notation in `.md` profile files (separate task)
- **NO modifications** to the JSON action response format
- **NO refactoring** of `buildSiteContextInjection()` itself
- **NO replacement** of existing exact-repeat loop detection (extend, don't replace)
- **NO modification** of the system message mid-conversation (use supplementary user messages for context refresh)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest with existing tests for all target files)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: vitest
- **Each task follows**: RED (write failing test) -> GREEN (minimal implementation) -> REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: Use vitest with vi.mock for dependencies
- **Integration**: Bash - run full test suite
- **Prompt assertions**: Test content of AGENT_SYSTEM_PROMPT string

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - P0 bug fix):
+-- Task 1: Fix navigateEmbedded signature bug [quick, TDD]

Wave 2 (After Wave 1 - core improvements, MAX PARALLEL):
+-- Task 2: Restructure agent prompt (site guide + decomposition + selectors) [deep, TDD]
+-- Task 3: Add failure window loop detection [deep, TDD]

Wave 3 (After Wave 2 Task 3 - depends on agent-loop.ts changes):
+-- Task 4: Add site context refresh after navigate [deep, TDD]

Wave FINAL (After ALL tasks):
+-- F1: Plan compliance audit (oracle)
+-- F2: Code quality review (unspecified-high)
+-- F3: Real QA - full test suite (unspecified-high)
+-- F4: Scope fidelity check (deep)

Critical Path: Task 1 -> Task 3 -> Task 4 -> Final
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1   | None      | T4     | 1    |
| T2   | None      | Final  | 2    |
| T3   | None      | T4     | 2    |
| T4   | T1, T3    | Final  | 3    |
| F1-4 | T1-T4     | None   | Final|

### Agent Dispatch Summary

- **Wave 1**: 1 task - T1 -> `quick`
- **Wave 2**: 2 tasks - T2 -> `deep`, T3 -> `deep`
- **Wave 3**: 1 task - T4 -> `deep`
- **FINAL**: 4 tasks - F1 -> `oracle`, F2 -> `unspecified-high`, F3 -> `unspecified-high`, F4 -> `deep`

---

## TODOs

- [x] 1. Fix navigateEmbedded Signature Bug (TDD)

  **What to do**:
  - RED: Write failing test in `browser-actions.test.ts` that verifies `navigateEmbedded` is called with `(tabId, url)` not just `(url)`
  - RED: Write failing test that `navigateAction('https://example.com')` calls `navigateEmbedded` with the active tab ID as first arg
  - GREEN: In `browser-actions.ts`, import `getActiveTabId` from `./browser`
  - GREEN: Change `navigateAction` (around line 315-322) to call `navigateEmbedded(getActiveTabId(), url)` instead of `navigateEmbedded(url)`
  - REFACTOR: Verify no other callers of navigateEmbedded have the same bug
  - Also add `case 'navigate'` to the CDP dispatch switch in `executeAction` so navigate works on the CDP path too (call `cdp.send('Page.navigate', { url })` then return success)

  **Must NOT do**:
  - Do not change the navigateEmbedded function signature in browser.ts
  - Do not modify any other action handlers
  - Do not change agent-types.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file bug fix with clear fix path (add import + change 1 line + add 1 switch case)
  - **Skills**: []
    - No external skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 1 foundation)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 4 (context refresh depends on working navigate)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:315-322` - The broken navigateAction function. Line 317 calls `navigateEmbedded(url)` with 1 arg instead of 2.
  - `ogre-desktop/src/lib/browser-actions.ts:425-449` - The CDP dispatch switch. Note there is NO `case 'navigate'` - it falls through to evalScript path. Add a navigate case here.
  - `ogre-desktop/src/lib/browser.ts:30-36` - The navigateEmbedded function signature: `navigateEmbedded(tabId: string, url: string)`. Do NOT change this.
  - `ogre-desktop/src/lib/browser.ts:83-85` - `getEmbeddedUrl` uses `tabId ?? _activeTabId` pattern. Follow same pattern for navigate.
  - `ogre-desktop/src/lib/browser.ts:12-13` - `getActiveTabId()` export. Import this in browser-actions.ts.

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts:44` - `{ action: 'navigate'; url: string }` ActionParams type. Navigate only has `url`, no `tabId`.

  **Test References**:
  - `ogre-desktop/src/lib/browser-actions.test.ts` - Existing test patterns. Uses vi.mock for browser.ts imports.
  - `ogre-desktop/src/lib/browser-actions-fuzzy.test.ts` - Additional test pattern reference for how executeAction dispatch is tested.

  **WHY Each Reference Matters**:
  - `browser-actions.ts:315-322`: This is THE bug. The URL is passed as tabId param, url param becomes undefined, causing Tauri invoke to fail or navigate the wrong webview.
  - `browser.ts:12-13`: getActiveTabId() is the established pattern for getting the current tab. Consistent with how other browser.ts functions handle missing tabId.
  - `browser-actions.ts:425-449`: CDP dispatch gap means navigate NEVER uses CDP even when connected. Adding a case makes navigate work on both paths.

  **Acceptance Criteria**:

  **TDD:**
  - [x] Test file: `ogre-desktop/src/lib/browser-actions.test.ts` (add to existing)
  - [x] `npx vitest run src/lib/browser-actions.test.ts` -> PASS (new + existing tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: navigateAction passes correct arguments
    Tool: Bash (npx vitest run)
    Preconditions: Test mocks getActiveTabId to return 'test-tab-1' and navigateEmbedded to resolve
    Steps:
      1. Call navigateAction('https://www.myopenmath.com')
      2. Assert navigateEmbedded was called with ('test-tab-1', 'https://www.myopenmath.com')
      3. Assert result is { success: true }
    Expected Result: navigateEmbedded receives both tabId and url
    Failure Indicators: navigateEmbedded called with 1 arg, or url passed as tabId
    Evidence: .sisyphus/evidence/task-1-navigate-args.txt

  Scenario: CDP path handles navigate action
    Tool: Bash (npx vitest run)
    Preconditions: Test mocks isConnected() to return true, cdp.send to resolve
    Steps:
      1. Call executeAction({ action: 'navigate', url: 'https://example.com' }) with CDP connected
      2. Assert cdp.send('Page.navigate', { url: 'https://example.com' }) was called
    Expected Result: Navigate uses CDP when connected
    Failure Indicators: Navigate falls through to evalScript path when CDP is connected
    Evidence: .sisyphus/evidence/task-1-cdp-navigate.txt
  ```

  **Commit**: YES
  - Message: `fix(browser-actions): pass tabId to navigateEmbedded and add CDP navigate`
  - Files: `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/browser-actions.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/browser-actions.test.ts`

- [x] 2. Restructure Agent Prompt: Site Guide Priority + Task Decomposition + Selector Notation (TDD)

  **What to do**:
  - RED: Write tests (new file `agent-prompt.test.ts` or add to existing) that assert:
    - `AGENT_SYSTEM_PROMPT` contains text about prioritizing SITE GUIDE selectors
    - `AGENT_SYSTEM_PROMPT` contains task decomposition instruction for multi-step tasks
    - `AGENT_SYSTEM_PROMPT` contains selector notation translation guidance (role= notation)
  - GREEN: Add 3 new rules to the IMPORTANT RULES section of `AGENT_SYSTEM_PROMPT` in `agent-prompt.ts`:
  - **Rule 11 (Site Guide Priority)**: When a SITE GUIDE is present, it contains authoritative navigation knowledge for the current site. ALWAYS consult the SITE GUIDE first to understand the site's structure, available pages, and workflows. The SITE GUIDE's documented selectors describe elements by their role and name (e.g., `role=button[name="Save"]`). Match these descriptions to elements in the DOM element list, then use the DOM list's CSS selector. Do NOT invent selectors - if an element is not in the DOM list, it may not be on the current page.
  - **Rule 12 (Task Decomposition)**: For complex multi-step tasks (creating assignments, managing questions, multi-page workflows), ALWAYS decompose the task before acting. In your first response, use the reasoning field to outline numbered steps. Then execute each step sequentially. If you need to gather information first (e.g., count questions per week), use readText before taking modification actions. Never start clicking without a plan.
  - **Rule 13 (Selector Translation)**: Site guide selectors like `role=link[name="Home"]` or `role=button[name="Save"]` are DESCRIPTIVE, not literal CSS. Translate them: find the matching element in the DOM element list by text content and element type, then use that element's CSS selector. For example, if the guide says `role=link[name="Gradebook"]` and the DOM list shows `[5] a "Gradebook" (nav a.gb-link)`, use `nav a.gb-link` as your selector.
  - REFACTOR: Verify the rules read naturally in the full prompt context and don't contradict existing rules

  **Must NOT do**:
  - Do not modify the existing 10 rules (only ADD rules 11-13)
  - Do not change the ACTION FORMAT or AVAILABLE ACTIONS sections
  - Do not modify agent-types.ts or add new action types
  - Do not modify the parseAgentResponse function
  - Do not change how SITE GUIDE blocks are formatted/injected (that's in skills-api.ts, out of scope)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt engineering requires careful wording that balances precision with brevity. Rules must be clear enough for Claude to follow reliably without being so long they get ignored.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Final verification
  - **Blocked By**: None (can start in Wave 2)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-prompt.ts:110-198` - The complete AGENT_SYSTEM_PROMPT string. Rules 1-10 are at lines 186-198. Add rules 11-13 AFTER rule 10, before the closing backtick.
  - `ogre-desktop/src/lib/agent-prompt.ts:24-103` - TOOL_DEFINITIONS array. Do NOT modify this.
  - `ogre-desktop/src/assets/profiles/myopenmath.md:271-280` - CSS Selectors Quick Reference section showing both valid CSS and `role=` notation. This is what agents will receive in the SITE GUIDE block.

  **External References**:
  - `ogre-desktop/src/assets/profiles/myopenmath.md` - Full MOM profile (300 lines). Read to understand what site guide content the agent receives.
  - `ogre-desktop/src/assets/profiles/aeries.md` - Aeries profile (324 lines). Read to verify rules work for non-MOM profiles too.

  **WHY Each Reference Matters**:
  - `agent-prompt.ts:110-198`: This is the ONLY file to modify. The new rules go at the end of the IMPORTANT RULES section.
  - `myopenmath.md:271-280`: Shows the `role=link[name="..."]` notation that Rule 13 must teach the agent to translate.
  - `aeries.md`: Contains different selector patterns (Kendo UI, `data-` attributes). Verifies Rule 11 is generic enough for any profile.

  **Acceptance Criteria**:

  **TDD:**
  - [x] Test file: `ogre-desktop/src/lib/agent-prompt.test.ts` (create new or add to existing)
  - [x] `npx vitest run src/lib/agent-prompt.test.ts` -> PASS (all new tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Prompt contains site guide prioritization
    Tool: Bash (npx vitest run)
    Preconditions: None
    Steps:
      1. Import AGENT_SYSTEM_PROMPT from agent-prompt.ts
      2. Assert it contains 'SITE GUIDE' (case-sensitive)
      3. Assert it contains instruction to consult guide FIRST
      4. Assert it contains instruction to match guide descriptions to DOM list selectors
    Expected Result: All 4 assertions pass
    Failure Indicators: AGENT_SYSTEM_PROMPT missing site guide instructions
    Evidence: .sisyphus/evidence/task-2-site-guide-priority.txt

  Scenario: Prompt contains task decomposition instruction
    Tool: Bash (npx vitest run)
    Preconditions: None
    Steps:
      1. Import AGENT_SYSTEM_PROMPT from agent-prompt.ts
      2. Assert it contains instruction to decompose multi-step tasks
      3. Assert it mentions outlining steps in reasoning field before acting
    Expected Result: Task decomposition instruction present
    Failure Indicators: No decomposition guidance in prompt
    Evidence: .sisyphus/evidence/task-2-decomposition.txt

  Scenario: Prompt contains selector notation translation
    Tool: Bash (npx vitest run)
    Preconditions: None
    Steps:
      1. Import AGENT_SYSTEM_PROMPT from agent-prompt.ts
      2. Assert it contains guidance about role= notation being descriptive, not literal CSS
      3. Assert it contains example of translating role= to DOM list selector
    Expected Result: Selector translation guidance present with example
    Failure Indicators: No mention of role= notation or translation
    Evidence: .sisyphus/evidence/task-2-selector-notation.txt
  ```

  **Commit**: YES
  - Message: `feat(agent-prompt): add site guide priority, task decomposition, selector notation rules`
  - Files: `ogre-desktop/src/lib/agent-prompt.ts`, `ogre-desktop/src/lib/agent-prompt.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/agent-prompt.test.ts`

- [x] 3. Add Failure Window Loop Detection (TDD)

  **What to do**:
  - RED: Write failing tests in `agent-loop.test.ts` that verify:
    - Consecutive failures across DIFFERENT actions trigger loop termination (e.g., click A fails, click B fails, click C fails = 3 consecutive failures)
    - A successful action resets the failure counter
    - Failure threshold is configurable (default: 5 consecutive failures)
  - GREEN: In `agent-loop.ts`, add a `consecutiveFailures` counter alongside the existing `lastActionRepeatCount`:
    - After Step 5 (execute action), check `result.success`
    - If `!result.success`: increment `consecutiveFailures`
    - If `result.success`: reset `consecutiveFailures = 0`
    - After incrementing, if `consecutiveFailures >= maxConsecutiveFailures` (new config field, default 5), yield `{ type: 'done', message: 'Too many consecutive failures...' }` and return
  - GREEN: Add `maxConsecutiveFailures: number` to `AgentConfig` interface and `DEFAULT_AGENT_CONFIG` in `agent-types.ts`
  - REFACTOR: Ensure the failure message is descriptive (include count and last error)

  **Must NOT do**:
  - Do not remove or replace the existing `maxSameAction` exact-repeat detection
  - Do not modify pruneHistory or context management
  - Do not add new action types
  - Do not modify the screenshot retry logic (Step 6b)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the core agent loop requires careful understanding of the async generator pattern and state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4 (site context refresh also modifies agent-loop.ts)
  - **Blocked By**: None (can start in Wave 2)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:192-298` - The while loop with existing safety checks and loop detection. Lines 284-298 show `lastActionKey`/`lastActionRepeatCount` pattern to follow.
  - `ogre-desktop/src/lib/agent-loop.ts:329-384` - Post-action handling (Step 5-7). The failure counter check should go after line 330 (`const result = await executeAction(actionParams)`) and its yield.
  - `ogre-desktop/src/lib/agent-loop.ts:343-371` - Screenshot retry on selector failure. The consecutiveFailures counter should NOT count this as a failure (it's a free retry).

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts:91-108` - `AgentConfig` interface and `DEFAULT_AGENT_CONFIG`. Add `maxConsecutiveFailures` here.

  **Test References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts` - Existing test patterns. Uses vi.mock, collectEvents helper, beforeEach reset. Follow these patterns.
  - `ogre-desktop/src/lib/agent-loop-compact.test.ts` - Additional test patterns for the agent loop.

  **WHY Each Reference Matters**:
  - `agent-loop.ts:284-298`: The existing loop detection pattern. Your new `consecutiveFailures` counter follows the same structural pattern but checks `result.success` instead of action key equality.
  - `agent-loop.ts:343-371`: The screenshot retry section. When `selectorFailed` triggers a retry with `continue`, the failure counter should NOT increment (it's a free retry, line 369 says 'Do NOT increment stepCount').
  - `agent-types.ts:91-108`: Config interface where the new threshold goes. This is the ONE exception to the 'do not modify agent-types.ts' guardrail - adding a config field is allowed, adding action types is not.

  **Acceptance Criteria**:

  **TDD:**
  - [x] Test file: `ogre-desktop/src/lib/agent-loop.test.ts` (add to existing)
  - [x] `npx vitest run src/lib/agent-loop.test.ts` -> PASS (new + existing, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Consecutive failures across different actions trigger termination
    Tool: Bash (npx vitest run)
    Preconditions: Mock sendAgentRequest to return different failing actions each turn, mock executeAction to return { success: false, error: '...' }
    Steps:
      1. Create agent loop with maxConsecutiveFailures: 3
      2. Mock returns: click A (fail) -> click B (fail) -> click C (fail)
      3. Collect events from async generator
      4. Assert final event is { type: 'done', message: contains 'consecutive failures' }
    Expected Result: Loop terminates after 3rd failure
    Failure Indicators: Loop continues past 3 failures, or uses wrong termination message
    Evidence: .sisyphus/evidence/task-3-consecutive-failures.txt

  Scenario: Successful action resets failure counter
    Tool: Bash (npx vitest run)
    Preconditions: Mock alternating success/failure responses
    Steps:
      1. Create agent loop with maxConsecutiveFailures: 3
      2. Mock returns: click A (fail) -> click B (fail) -> click C (success) -> click D (fail) -> click E (fail) -> done
      3. Collect events from async generator
      4. Assert loop does NOT terminate from failures (success at step 3 reset counter)
    Expected Result: Loop continues past 5 total failures because counter was reset
    Failure Indicators: Loop terminates prematurely due to accumulated failure count
    Evidence: .sisyphus/evidence/task-3-reset-counter.txt

  Scenario: Screenshot retry does not count as failure
    Tool: Bash (npx vitest run)
    Preconditions: Mock a selector-not-found failure followed by screenshot retry success
    Steps:
      1. Create agent loop with maxConsecutiveFailures: 2
      2. Mock: click (selector not found) -> screenshot retry -> click (success)
      3. Assert loop did not terminate from failures
    Expected Result: Free retry on selector failure doesn't increment counter
    Failure Indicators: Screenshot retry counted as failure, loop terminates
    Evidence: .sisyphus/evidence/task-3-screenshot-retry.txt
  ```

  **Commit**: YES
  - Message: `feat(agent-loop): add failure window detection for death spirals`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`, `ogre-desktop/src/lib/agent-types.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/agent-loop.test.ts`

- [x] 4. Add Site Context Refresh After Navigate Actions (TDD)

  **What to do**:
  - RED: Write failing tests in `agent-loop.test.ts` that verify:
    - After a successful navigate action, a supplementary user message containing updated site guide is added to conversationHistory
    - When navigating to a URL matching a DIFFERENT profile, the new profile content is injected
    - When navigating to a URL with NO matching profile, a message saying 'No site guide available for this URL. Use DOM elements only.' is injected
    - When navigating to a URL matching the SAME profile, no duplicate injection occurs
  - GREEN: In `agent-loop.ts`, after the navigate action result handling (around Step 7 area, after checking `action === 'done'`):
    - Add a check: if `action === 'navigate' && result.success`
    - Call `getEmbeddedUrl()` to get the new URL
    - Call `buildSiteContextInjection(newUrl)` to get updated site guide
    - Compare new site guide to previous site guide (track `lastSiteContext` variable)
    - If different: push a supplementary user message to conversationHistory:
      `[System: Navigated to {newUrl}. {newSiteGuide || 'No site guide available for this URL. Use DOM elements only.'}]`
    - Update `lastSiteContext = newSiteGuide`
  - GREEN: Initialize `lastSiteContext = siteContext` (the initial context from loop start) before the while loop
  - REFACTOR: Ensure the supplementary message is concise but complete

  **Must NOT do**:
  - Do not modify the system message (index 0 in conversationHistory) mid-conversation
  - Do not modify buildSiteContextInjection() in skills-api.ts
  - Do not add new action types
  - Do not modify the pruneHistory logic (the supplementary message will be pruned like any other)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must understand the agent loop's async generator pattern, conversation history management, and interaction with the skills injection system
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 navigate fix and Task 3 loop changes)
  - **Parallel Group**: Wave 3 (solo, after Wave 2)
  - **Blocks**: Final verification
  - **Blocked By**: Task 1 (navigate must work), Task 3 (both modify agent-loop.ts)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:172-184` - Initial site context building. The `siteContext` variable and `buildSiteContextInjection` call pattern to follow.
  - `ogre-desktop/src/lib/agent-loop.ts:377-389` - Post-action area near Step 7 (done check) and Step 8 (delay). The navigate refresh check goes BEFORE the done check at line 378.
  - `ogre-desktop/src/lib/agent-loop.ts:333-340` - How conversation history messages are pushed. Follow the same `{ role: 'user', content: ... }` pattern.

  **API/Type References**:
  - `ogre-desktop/src/lib/skills-api.ts:205-212` - `buildSiteContextInjection(url)` function signature and return type (string, empty string if no match).
  - `ogre-desktop/src/lib/browser.ts:83-85` - `getEmbeddedUrl()` function to get current URL after navigate.
  - `ogre-desktop/src/lib/agent-types.ts:68-74` - `AgentMessage` type for the supplementary message format.

  **Test References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts` - Existing mock patterns for sendAgentRequest, executeAction, captureInteractiveDom, captureWebviewScreenshot.

  **WHY Each Reference Matters**:
  - `agent-loop.ts:172-184`: Shows how site context is initially built. The refresh must use the SAME function (`buildSiteContextInjection`) to ensure consistent behavior.
  - `agent-loop.ts:377-389`: The exact insertion point for the navigate refresh. Must go AFTER result yield but BEFORE done check so the context is available for the next iteration.
  - `skills-api.ts:205-212`: The function returns empty string for no match. The code must handle empty string -> 'No site guide available' message.

  **Acceptance Criteria**:

  **TDD:**
  - [x] Test file: `ogre-desktop/src/lib/agent-loop.test.ts` (add to existing)
  - [x] `npx vitest run src/lib/agent-loop.test.ts` -> PASS (new + existing, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Navigate to profiled site injects updated context
    Tool: Bash (npx vitest run)
    Preconditions: Mock navigate to myopenmath.com, mock buildSiteContextInjection to return MOM guide content
    Steps:
      1. Start agent loop on non-profiled URL
      2. Agent executes navigate to myopenmath.com (success)
      3. Assert conversationHistory contains supplementary message with MOM site guide
    Expected Result: New site guide injected as user message after navigate
    Failure Indicators: No supplementary message added, or old guide persists
    Evidence: .sisyphus/evidence/task-4-navigate-context-refresh.txt

  Scenario: Navigate to non-profiled site shows no-guide message
    Tool: Bash (npx vitest run)
    Preconditions: Mock navigate to google.com, mock buildSiteContextInjection to return empty string
    Steps:
      1. Start agent loop on myopenmath.com (MOM guide injected)
      2. Agent executes navigate to google.com (success)
      3. Assert conversationHistory contains message with 'No site guide available'
    Expected Result: Agent told no guide is available for new URL
    Failure Indicators: Old MOM guide stays without any update message, or no message at all
    Evidence: .sisyphus/evidence/task-4-no-profile-message.txt

  Scenario: Navigate to same-profile site does not duplicate
    Tool: Bash (npx vitest run)
    Preconditions: Mock navigate from one MOM page to another MOM page
    Steps:
      1. Start agent loop on myopenmath.com/course.php (MOM guide injected)
      2. Agent executes navigate to myopenmath.com/addassessment.php (success)
      3. Assert NO supplementary site guide message added (same profile)
    Expected Result: No duplicate injection when profile hasn't changed
    Failure Indicators: Duplicate MOM guide messages in history
    Evidence: .sisyphus/evidence/task-4-no-duplicate.txt
  ```

  **Commit**: YES
  - Message: `feat(agent-loop): refresh site context after navigate actions`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/agent-loop.test.ts`

---

## Final Verification Wave (MANDATORY - after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection -> fix -> re-run.

- [x] F1. **Plan Compliance Audit** - `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test). For each "Must NOT Have": search codebase for forbidden patterns - reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** - `unspecified-high`
  Run `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no changes to forbidden files (agent-dom-fuzzy.ts, agent-dom.ts, skills-api.ts, agent-types.ts action types).
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | Forbidden [CLEAN/N violations] | VERDICT`

- [x] F3. **Real QA - Full Test Suite** - `unspecified-high`
  Run `npx vitest run` from ogre-desktop directory. Verify ALL existing tests still pass (no regressions). Run new tests individually. Check test coverage of new code paths.
  Output: `Tests [N/N pass] | Regressions [CLEAN/N] | Coverage [assessed] | VERDICT`

- [x] F4. **Scope Fidelity Check** - `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 - everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `fix(browser-actions): pass tabId to navigateEmbedded` - browser-actions.ts, browser-actions.test.ts
- **T2**: `feat(agent-prompt): add site guide priority, task decomposition, selector notation rules` - agent-prompt.ts, agent-prompt.test.ts
- **T3**: `feat(agent-loop): add failure window detection for death spirals` - agent-loop.ts, agent-loop.test.ts
- **T4**: `feat(agent-loop): refresh site context after navigate actions` - agent-loop.ts, agent-loop.test.ts

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run  # Expected: ALL tests pass
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All vitest tests pass (0 failures, 0 regressions)
- [x] navigateEmbedded correctly called with (tabId, url)
- [x] AGENT_SYSTEM_PROMPT contains site guide prioritization
- [x] AGENT_SYSTEM_PROMPT contains task decomposition instruction
- [x] AGENT_SYSTEM_PROMPT contains selector notation guidance
- [x] Loop detection catches alternating failure spirals
- [x] Site context refreshes on navigate
