# Agent Mode Rebuild — Fix Action Execution + Skill Integration

## TL;DR

> **Quick Summary**: Diagnose and fix the broken agent action execution pipeline (UI loads but actions fail), wire skill injection into the agent loop, and add minor UI tweaks (skill dropdown, profile indicator, auto-discovery banner).
> 
> **Deliverables**:
> - Working agent action pipeline (all 15 existing action types execute on profiled sites)
> - Skill dropdown in AgentChat UI for selecting site-relevant workflows
> - Profile indicator badge showing active site profile
> - Auto-discovery banner when URL has no matching profile
> - Dead code cleanup (duplicate parseAgentResponse)
> - Full TDD test coverage for all changes
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (diagnose) → Task 2 (fix) → Task 4 (skill wiring) → Task 6 (UI tweaks) → Task 8 (integration test)

---

## Context

### Original Request
"Now that the page discovery is working, let's move onto the agent mode where I tell the agent what to do and it executes on the page."

### Interview Summary
**Key Discussions**:
- Agent mode exists (agent-loop.ts, AgentChat.svelte, etc.) but is broken — UI loads, AI responds, but action execution returns errors in chat
- Agent should use **site profiles** (selectors, navigation, workflows) as the HOW, and **user instructions** or **loaded skills** as the WHAT
- Agent should ONLY work on profiled sites; auto-trigger page discovery for unknown sites
- Skills loaded via dropdown UI; follow SKILL.md format (like gb-sync)
- TDD approach with vitest
- Minor UI tweaks only — not a major redesign

**Research Findings**:
- All 1202 existing tests pass — codebase is stable
- Execution chain is structurally intact (all imports resolve, no broken links) — problem is **runtime**
- `buildSkillInjection()` exists in skills-api.ts but is **never called from agent-loop.ts** — skills aren't injected
- Duplicate `parseAgentResponse()` in agent-prompt.ts is dead code (diverges from agent-api.ts version)
- `buildSiteContextInjection(url)` is already wired into agent-loop.ts and refreshes on navigate
- browser-actions.ts CDP→evalScript fallback with fuzzy retry is architecturally sound
- evalScript/CDP infrastructure works (proven by page discovery)

### Metis Review
**Identified Gaps** (addressed):
- Must start with diagnostic task before writing fix code — can't fix blind
- Must capture exact error output to determine root cause
- Skills injection is missing from agent-loop.ts — needs wiring
- Dead code parseAgentResponse in agent-prompt.ts creates maintenance hazard
- Text-only AI response kills entire session (line 272-274 returns) — needs resilience
- Empty profile DB after fresh install means no site guide — UI should handle this
- Skill injection could blow context budget — need size awareness

---

## Work Objectives

### Core Objective
Make the agent mode functional end-to-end: user types instruction → AI proposes action → action executes on page → results displayed — with site profiles providing page understanding and skills providing workflow knowledge.

### Concrete Deliverables
- Fixed action execution pipeline in `agent-loop.ts` / `browser-actions.ts`
- Skill injection wired into agent loop (`buildSkillInjection()` called)
- Skill dropdown component in `AgentChat.svelte`
- Profile indicator badge in `AgentChat.svelte`
- Auto-discovery banner in `AgentChat.svelte` when no profile matches
- Dead `parseAgentResponse()` removed from `agent-prompt.ts`
- TDD test coverage for all changes

### Definition of Done
- [ ] Agent executes click, type, scroll, readText, navigate, done actions successfully on a profiled site
- [ ] Skills appear in dropdown based on URL match
- [ ] Selecting a skill injects its content into agent context
- [ ] Profile name shows in the UI when a matching profile exists
- [ ] "No profile" banner with Discover button appears for unmatched URLs
- [ ] All existing 1202 tests still pass + new tests green
- [ ] `npx vitest run` from ogre-desktop/ returns 0 failures

### Must Have
- All 15 existing action types work via the evalScript fallback path
- Site profile injection works end-to-end (URL → DB lookup → JSON → system prompt)
- Skill content injected into agent system prompt when selected
- TDD: test first, implement second

### Must NOT Have (Guardrails)
- **Do NOT** change `AGENT_SYSTEM_PROMPT` constant — only append site context / skill content dynamically
- **Do NOT** change server-side `agent.js` response format (`{ response: aiText }`)
- **Do NOT** change `browser-actions.ts` dispatch logic (CDP → evalScript fallback) — it's architecturally sound
- **Do NOT** add, remove, or rename any of the 15 existing action types
- **Do NOT** add new Tauri commands or Rust-side changes
- **Do NOT** add new npm/bun dependencies
- **Do NOT** touch any file outside: `ogre-desktop/src/lib/agent-*.ts`, `ogre-desktop/src/lib/browser-actions.ts`, `ogre-desktop/src/lib/skills-api.ts`, `ogre-desktop/src/components/grading/AgentChat.svelte`, and their test files
- **Do NOT** rewrite the agent loop architecture — fix, don't replace
- **Do NOT** build a skill management/marketplace UI — just a simple `<select>` dropdown
- **Do NOT** make auto-discovery autonomous — just a banner with a button
- **Do NOT** create acceptance criteria requiring "user manually tests in the browser"

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: vitest (already configured in ogre-desktop/)
- **Baseline**: 55 test files, 1202 tests passing — must remain green throughout

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: vitest with vi.mock for evalScript, CDP, DB, tauriFetch
- **Test patterns**: Follow existing `agent-loop.test.ts`, `browser-actions.test.ts`, `skills-api.test.ts` mock patterns
- **Regression**: `npx vitest run` after every task — 0 failures required

### Test Patterns to Follow
- `agent-loop.test.ts:1-48` — mock setup for browser, agent-dom, agent-api, browser-actions, skills-api
- `browser-actions.test.ts:1-46` — mock evalScriptJSON, isConnected, CDP
- `skills-api.test.ts` — URL-based profile matching, skill injection

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — diagnose + dead code + test infra):
├── Task 1: Diagnose agent action failure (capture exact errors) [deep]
├── Task 2: Remove dead parseAgentResponse from agent-prompt.ts [quick]
└── Task 3: Add agent-loop integration test fixtures [quick]

Wave 2 (After Wave 1 — core fixes + skill wiring):
├── Task 4: Fix agent action execution pipeline [deep]
├── Task 5: Wire skill injection into agent-loop.ts [unspecified-high]
├── Task 6: Add text-response resilience to agent loop [quick]
└── Task 7: Add getMatchingSkillsForUrl() helper to skills-api.ts [quick]

Wave 3 (After Wave 2 — UI tweaks):
├── Task 8: Add skill dropdown to AgentChat.svelte [visual-engineering]
├── Task 9: Add profile indicator badge to AgentChat.svelte [quick]
└── Task 10: Add auto-discovery banner for unmatched URLs [quick]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — exercise agent end-to-end with mocked server (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 5 → Task 8 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4 | 1 |
| 2 | — | — | 1 |
| 3 | — | 4, 5, 6 | 1 |
| 4 | 1, 3 | 5, 8 | 2 |
| 5 | 3, 4 | 8 | 2 |
| 6 | 3 | — | 2 |
| 7 | — | 8 | 2 |
| 8 | 5, 7 | — | 3 |
| 9 | — | — | 3 |
| 10 | — | — | 3 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 4 tasks — T4 → `deep`, T5 → `unspecified-high`, T6 → `quick`, T7 → `quick`
- **Wave 3**: 3 tasks — T8 → `visual-engineering`, T9 → `quick`, T10 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Diagnose Agent Action Failure — Capture Exact Errors

  **What to do**:
  - RED: Write a vitest test in `agent-loop.test.ts` (or new `agent-loop.diagnostic.test.ts`) that:
    1. Mocks `sendAgentRequest` to return `{ response: '{"action":"click","params":{"selector":"#test"},"reasoning":"test click"}' }` (the exact format server returns)
    2. Mocks `executeAction` to return `{ success: true }`
    3. Mocks `captureInteractiveDom` and `captureWebviewScreenshot`
    4. Mocks `buildSiteContextInjection` to return a sample site guide
    5. Creates an agent controller, starts with `{ mode: 'auto', initialMessage: 'Click the test button' }`
    6. Collects all yielded events and asserts the sequence: `thinking → propose → executing → result → done` (or wherever it breaks)
  - GREEN: Trace through the existing code to find where the event sequence breaks. The test will reveal whether:
    - `sendAgentRequest` returns data in unexpected format
    - `parseAgentResponse` fails to parse the server response
    - `executeAction` throws instead of returning ActionResult
    - The loop itself has a control flow bug
  - Document the exact failure in a test comment for Task 4 to fix
  - Also test the **text response path**: mock server returning `{ response: '{"text":"I can help with that!"}' }` and verify `text` event is emitted

  **Must NOT do**:
  - Do NOT fix the bug yet — this task is diagnostic only
  - Do NOT change any production code
  - Do NOT add new action types

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful tracing through async generator control flow and understanding multiple mock layers
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Methodical root-cause analysis of the failure chain

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/agent-loop.test.ts` — Existing test file with mock setup patterns for all agent-loop dependencies
  - `ogre-desktop/src/lib/agent-loop.ts:168-428` — The `runLoop()` async generator — trace the full event sequence here

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/agent-types.ts:63-67` — `ActionResult` type that executeAction must return
  - `ogre-desktop/src/lib/agent-types.ts:168-180` — `AgentApiResponse` union type (action or text)
  - `ogre-desktop/src/lib/agent-loop.ts:104-115` — `AgentEvent` type — the exact events the generator yields

  **External References**:
  - `ogre-desktop/src/lib/agent-api.ts:101-176` — `parseAgentResponse()` — the REAL parser (not the dead one in agent-prompt.ts). This is where server `{ response: aiText }` gets parsed into action/text.

  **WHY Each Reference Matters**:
  - `agent-loop.test.ts` — Copy the exact mock setup pattern (vi.mock calls, mock factories) to ensure test isolation matches existing tests
  - `agent-loop.ts:168-428` — This is the code under test. Trace through each step to understand where events should be emitted
  - `agent-api.ts:101-176` — The parser handles `{ response: "..." }` from server. The test must verify this parsing chain works

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file created: `ogre-desktop/src/lib/agent-loop.diagnostic.test.ts`
  - [ ] `npx vitest run agent-loop.diagnostic` → tests document the exact failure point
  - [ ] Test comment describes root cause: "Failure occurs at [step] because [reason]"

  **QA Scenarios:**

  ```
  Scenario: Action response parsing chain
    Tool: Bash (vitest)
    Preconditions: Fresh test file with mocked dependencies
    Steps:
      1. Run `cd ogre-desktop && npx vitest run agent-loop.diagnostic`
      2. Verify test output shows which step in the event sequence fails
      3. Verify test comments document the root cause
    Expected Result: Test file exists with documented failure analysis. May have intentionally failing tests (RED phase) that Task 4 will make green.
    Failure Indicators: Test file doesn't exist, or no diagnostic comments, or tests pass trivially without exercising the real code path
    Evidence: .sisyphus/evidence/task-1-diagnostic-output.txt

  Scenario: Text response path verification
    Tool: Bash (vitest)
    Preconditions: Same test file
    Steps:
      1. Mock sendAgentRequest to return { response: '{"text":"Hello"}' }
      2. Start agent loop and collect events
      3. Assert 'text' event is emitted with content "Hello"
    Expected Result: Text response path either works or failure is documented
    Failure Indicators: No test for text response path
    Evidence: .sisyphus/evidence/task-1-text-path.txt
  ```

  **Commit**: YES
  - Message: `test(agent): add diagnostic test fixtures for action pipeline`
  - Files: `ogre-desktop/src/lib/agent-loop.diagnostic.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 2. Remove Dead parseAgentResponse from agent-prompt.ts

  **What to do**:
  - RED: Write a test asserting that `agent-prompt.ts` does NOT export `parseAgentResponse` (import check test)
  - GREEN: Delete lines 243-291 from `agent-prompt.ts` (the duplicate `parseAgentResponse` function and its import of `AgentActionResponse`, `AgentApiResponse`, `AgentTextResponse` from agent-types if only used there)
  - REFACTOR: Verify `agent-api.ts` `parseAgentResponse` still passes all its existing tests
  - Use `lsp_find_references` on `parseAgentResponse` in agent-prompt.ts to confirm zero callers before deletion

  **Must NOT do**:
  - Do NOT touch `agent-api.ts` parseAgentResponse — that's the REAL one
  - Do NOT change any exports that other files depend on

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple deletion of dead code with verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-prompt.ts:243-291` — The dead code to remove. Note the import on line 10 may also be dead.
  - `ogre-desktop/src/lib/agent-api.ts:101-176` — The REAL parseAgentResponse that must NOT be touched

  **WHY Each Reference Matters**:
  - `agent-prompt.ts:243-291` — This is the dead code. Verify no imports reference it, then delete.
  - `agent-api.ts:101-176` — Verify this version has all the parsing logic needed (nested params extraction, code fence handling, etc.)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run` → all existing tests pass (no regressions)
  - [ ] `parseAgentResponse` is NOT exported from agent-prompt.ts

  **QA Scenarios:**

  ```
  Scenario: Dead code removal verification
    Tool: Bash (vitest + grep)
    Preconditions: agent-prompt.ts still has the duplicate function
    Steps:
      1. Use lsp_find_references on parseAgentResponse in agent-prompt.ts — confirm 0 external callers
      2. Delete the function and unused type imports
      3. Run `cd ogre-desktop && npx vitest run`
      4. Grep for "parseAgentResponse" in agent-prompt.ts to confirm removal
    Expected Result: 0 external references found; function deleted; all 1202+ tests still pass
    Failure Indicators: lsp_find_references shows callers (DO NOT delete if so); test failures after deletion
    Evidence: .sisyphus/evidence/task-2-dead-code-removal.txt

  Scenario: Real parser still works
    Tool: Bash (vitest)
    Preconditions: Dead code removed
    Steps:
      1. Run `cd ogre-desktop && npx vitest run agent-api`
      2. Verify all agent-api tests pass (parseAgentResponse edge cases: plain text, JSON, code fences, think blocks)
    Expected Result: agent-api.test.ts passes completely
    Failure Indicators: Any test failure in agent-api tests
    Evidence: .sisyphus/evidence/task-2-real-parser-ok.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent): remove dead parseAgentResponse from agent-prompt`
  - Files: `ogre-desktop/src/lib/agent-prompt.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 3. Add Agent Loop Integration Test Fixtures

  **What to do**:
  - Create reusable test helpers for agent-loop testing in `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`:
    1. `createMockAgentServer(responses: AgentApiResponse[])` — returns a mocked `sendAgentRequest` that cycles through predefined responses
    2. `createMockBrowserEnv()` — sets up mocked `captureInteractiveDom`, `captureWebviewScreenshot`, `executeAction`, `getEmbeddedUrl`
    3. `collectEvents(gen: AsyncGenerator<AgentEvent>)` — consumes an async generator and returns all events as an array
    4. `createTestSiteProfile()` — returns a sample SiteGuideJSON for testing
    5. `createTestSkillContent()` — returns sample SKILL.md content for injection testing
  - Write tests for each fixture to ensure they work correctly
  - These fixtures will be used by Tasks 4, 5, 6, and F3

  **Must NOT do**:
  - Do NOT modify any production code
  - Do NOT duplicate existing test utilities if they exist

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating test utilities with known patterns; no complex logic
  - **Skills**: [`test-driven-development`]
    - `test-driven-development`: Following TDD patterns for the test infrastructure itself

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts` — Existing mock setup to extract patterns from (vi.mock factories)
  - `ogre-desktop/src/lib/browser-actions.test.ts:1-46` — Mock patterns for evalScriptJSON, isConnected

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts` — All types needed for fixtures (AgentApiResponse, ActionResult, InteractiveElement, etc.)
  - `ogre-desktop/src/lib/agent-loop.ts:104-115` — AgentEvent union type for collectEvents helper
  - `ogre-desktop/src/lib/site-guide-types.ts:8-25` — SiteGuideJSON interface for createTestSiteProfile

  **WHY Each Reference Matters**:
  - `agent-loop.test.ts` — Extract existing mock patterns so fixtures are consistent with how the codebase already tests
  - `agent-types.ts` — Type-safe fixtures require importing the correct interfaces
  - `site-guide-types.ts` — SiteGuideJSON shape for the test profile fixture

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file created: `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`
  - [ ] Tests for fixtures: `ogre-desktop/src/lib/__test-utils__/agent-fixtures.test.ts`
  - [ ] `npx vitest run agent-fixtures` → PASS

  **QA Scenarios:**

  ```
  Scenario: Fixture helpers work correctly
    Tool: Bash (vitest)
    Preconditions: Fixture file created
    Steps:
      1. Run `cd ogre-desktop && npx vitest run agent-fixtures`
      2. Verify createMockAgentServer returns a function that cycles through responses
      3. Verify collectEvents consumes an async generator and returns array
      4. Verify createTestSiteProfile returns valid SiteGuideJSON
    Expected Result: All fixture tests pass; fixtures are importable and type-safe
    Failure Indicators: Type errors in fixtures; tests fail; fixtures don't match real interfaces
    Evidence: .sisyphus/evidence/task-3-fixtures-pass.txt
  ```

  **Commit**: YES
  - Message: `test(agent): add integration test fixtures for agent loop`
  - Files: `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`, `ogre-desktop/src/lib/__test-utils__/agent-fixtures.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 4. Fix Agent Action Execution Pipeline

  **What to do**:
  - RED: Using the diagnostic findings from Task 1 and fixtures from Task 3, write tests that reproduce the exact failure:
    1. Test: Full agent loop with mocked server returning action JSON → assert `executeAction` is called with correct `ActionParams`
    2. Test: Agent loop handles `{ response: '{"action":"click","params":{"selector":"#btn"},"reasoning":"test"}' }` format (the actual server response wrapper)
    3. Test: Agent loop handles direct `{ action: "click", params: {...} }` response (no wrapper)
    4. Test: Failed action triggers fuzzy retry path and continues loop
    5. Test: `done` action terminates loop with correct message
  - GREEN: Fix the identified breakage. Based on Metis analysis, likely candidates:
    - **Response format mismatch**: Server returns `{ response: aiText }`, client at `agent-api.ts:74-76` handles this, but the parsed result may not reconstruct `ActionParams` correctly (the `{ action, ...params }` spread in agent-loop.ts:284)
    - **Auto-approve timing**: In auto mode, `setTimeout(() => controller.approve(), 300)` in AgentChat.svelte may race with the async generator's `await new Promise` gate
    - **CDP not connected**: If `isConnected()` returns false AND evalScript fallback also fails, the error propagates
  - REFACTOR: Ensure error messages from failed actions are clear and actionable (not generic "failed")
  - Run full test suite to verify no regressions

  **Must NOT do**:
  - Do NOT change the 15 action types
  - Do NOT change browser-actions.ts dispatch logic (CDP → evalScript fallback)
  - Do NOT change the server response format
  - Do NOT change AGENT_SYSTEM_PROMPT

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core bug fix requiring careful async control flow understanding and multiple failure mode handling
  - **Skills**: [`systematic-debugging`]
    - `systematic-debugging`: Systematic approach to fixing the diagnosed issues

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Tasks 5, 8
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:278-284` — ActionParams reconstruction: `const actionParams = { action, ...params } as ActionParams` — verify this produces valid discriminated union
  - `ogre-desktop/src/lib/agent-api.ts:58-86` — Response handling chain: checks for `data.action`, `data.text`, `data.content`, `data.response`, raw string
  - `ogre-desktop/src/lib/agent-api.ts:130-156` — Nested params extraction in parseAgentResponse: `const { action, params: nestedParams, reasoning, ...flatParams } = parsed`

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts:39-56` — ActionParams discriminated union — each variant requires `action` field
  - `ogre-desktop/src/lib/agent-types.ts:63-67` — ActionResult interface

  **Test References**:
  - `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts` — Fixtures from Task 3
  - `ogre-desktop/src/lib/agent-loop.diagnostic.test.ts` — Diagnostic findings from Task 1

  **WHY Each Reference Matters**:
  - `agent-loop.ts:278-284` — This is where the action response is reconstructed into an ActionParams for executeAction. If `params` doesn't match the discriminated union shape, executeAction will get garbage.
  - `agent-api.ts:130-156` — The nested params extraction handles `{ action: "click", params: { selector: "#btn" } }` vs `{ action: "click", selector: "#btn" }`. Both formats must work.

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Tests pass: `npx vitest run agent-loop` → all action execution tests GREEN
  - [ ] Tests pass: `npx vitest run` → all 1202+ existing tests still GREEN
  - [ ] Agent loop correctly dispatches click, type, readText, scroll, navigate, done actions to executeAction

  **QA Scenarios:**

  ```
  Scenario: Full action execution round-trip (happy path)
    Tool: Bash (vitest)
    Preconditions: Task 1 diagnostic and Task 3 fixtures complete
    Steps:
      1. Create test: mock server returns click action → mock executeAction returns success
      2. Start agent loop in auto mode with mocked approve
      3. Collect all events from generator
      4. Assert events include: thinking, propose(click), executing(click), result(success)
      5. Assert executeAction was called with { action: 'click', selector: '#btn' }
    Expected Result: Full event sequence fires correctly; executeAction receives properly typed ActionParams
    Failure Indicators: executeAction not called; wrong params; events missing or out of order
    Evidence: .sisyphus/evidence/task-4-action-roundtrip.txt

  Scenario: Server response wrapper parsing
    Tool: Bash (vitest)
    Preconditions: Same setup
    Steps:
      1. Mock server to return { response: '{"action":"type","params":{"selector":"#input","text":"hello"},"reasoning":"typing"}' }
      2. Start agent loop, collect events
      3. Assert executeAction called with { action: 'type', selector: '#input', text: 'hello' }
    Expected Result: The { response: rawText } wrapper is correctly unwrapped and parsed
    Failure Indicators: parseAgentResponse fails; params aren't extracted from nested format
    Evidence: .sisyphus/evidence/task-4-response-wrapper.txt

  Scenario: Failed action error propagation
    Tool: Bash (vitest)
    Preconditions: Same setup
    Steps:
      1. Mock executeAction to return { success: false, error: 'Element not found: #missing' }
      2. Start agent loop
      3. Assert result event contains the error
      4. Assert loop continues (doesn't terminate on first failure)
    Expected Result: Error propagated in result event; loop continues for retry
    Failure Indicators: Loop terminates on first failure; error message lost
    Evidence: .sisyphus/evidence/task-4-error-propagation.txt
  ```

  **Commit**: YES
  - Message: `fix(agent): fix action execution pipeline for post-GTK runtime`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 5. Wire Skill Injection into Agent Loop

  **What to do**:
  - RED: Write tests:
    1. Test: When skills are active, agent loop system prompt includes skill content
    2. Test: `buildSkillInjection()` output is appended after AGENT_SYSTEM_PROMPT and before site context
    3. Test: When no skills are active, system prompt is unchanged
    4. Test: Skill content + site context combined doesn't exceed reasonable size (add warning threshold)
  - GREEN: In `agent-loop.ts:runLoop()`:
    1. Import `buildSkillInjection` from `./skills-api`
    2. After building `siteContext` (line ~177), call `const skillContent = await buildSkillInjection()`
    3. Build system prompt: `AGENT_SYSTEM_PROMPT + skillContent + siteContext`
    4. Ensure ordering: base prompt → skills → site guide (so site guide has highest priority)
  - REFACTOR: Add token estimate for skill content and emit a warning event if combined context is large (>50% of budget)

  **Must NOT do**:
  - Do NOT modify AGENT_SYSTEM_PROMPT constant
  - Do NOT change how buildSkillInjection works (it already returns formatted strings)
  - Do NOT add skill selection logic here (that's Task 7/8)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work connecting existing modules; needs understanding of token budgets and prompt assembly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 4 fixing the pipeline)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:172-184` — Where siteContext is built and system prompt assembled. Skill injection goes here.
  - `ogre-desktop/src/lib/skills-api.ts:171-177` — `buildSkillInjection()` — already returns formatted `"--- SKILL: name ---\ncontent\n--- END SKILL ---"` blocks

  **API/Type References**:
  - `ogre-desktop/src/lib/skills-api.ts:183-187` — `getSkillInjectionSize()` — returns `{ charCount, skillCount }` for size awareness

  **WHY Each Reference Matters**:
  - `agent-loop.ts:172-184` — This is the exact insertion point. The system prompt is assembled here and stored in `conversationHistory[0]`.
  - `skills-api.ts:171-177` — buildSkillInjection already handles the formatting. Just call it and concatenate.

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run agent-loop` → skill injection tests GREEN
  - [ ] System prompt contains skill content when skills are active
  - [ ] System prompt unchanged when no skills are active

  **QA Scenarios:**

  ```
  Scenario: Skill content injected into system prompt
    Tool: Bash (vitest)
    Preconditions: Mock buildSkillInjection to return "--- SKILL: TestSkill ---\nDo XYZ\n--- END SKILL ---"
    Steps:
      1. Start agent loop
      2. Inspect conversationHistory[0].content (system message)
      3. Assert it contains "--- SKILL: TestSkill ---"
      4. Assert it contains AGENT_SYSTEM_PROMPT text
      5. Assert skill content appears AFTER base prompt and BEFORE site guide
    Expected Result: System prompt = base + skills + site guide in correct order
    Failure Indicators: Skill content missing; wrong order; base prompt modified
    Evidence: .sisyphus/evidence/task-5-skill-injection.txt

  Scenario: No skills active — system prompt unchanged
    Tool: Bash (vitest)
    Preconditions: Mock buildSkillInjection to return ""
    Steps:
      1. Start agent loop
      2. Assert system prompt equals AGENT_SYSTEM_PROMPT + siteContext (no skill block)
    Expected Result: Empty skill injection doesn't add any content or separators
    Failure Indicators: Extra whitespace, empty skill blocks, or missing site context
    Evidence: .sisyphus/evidence/task-5-no-skills.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): wire skill injection into agent loop`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 6. Add Text-Response Resilience to Agent Loop

  **What to do**:
  - RED: Write tests:
    1. Test: When AI returns a text-only response, loop emits `text` event but does NOT terminate — it continues to the next iteration
    2. Test: After a text response, the agent re-captures DOM and asks AI again
    3. Test: After 3 consecutive text-only responses, loop terminates with a helpful message
  - GREEN: Modify `agent-loop.ts:270-275`:
    - Currently: text response → `yield { type: 'text' }` → `return` (terminal)
    - Change to: text response → `yield { type: 'text' }` → add text to history → `continue` (non-terminal)
    - Add a counter for consecutive text responses: after 3, yield `done` with message "Agent provided text responses without taking action. Please rephrase your request."
  - REFACTOR: Ensure text responses are added to conversation history (they currently aren't in the loop context for AI to build on)

  **Must NOT do**:
  - Do NOT change how text responses are displayed in the UI
  - Do NOT change the response parsing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-scoped change to control flow with clear before/after behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of Task 4's fix, only needs Task 3 fixtures)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:267-275` — Current text response handling (terminal return)
  - `ogre-desktop/src/lib/agent-loop.ts:286-300` — Loop detection pattern (same action repeat counter) — use similar pattern for consecutive text counter

  **WHY Each Reference Matters**:
  - `agent-loop.ts:267-275` — This is the exact code to change. Currently `return` on text; change to `continue` with counter.
  - `agent-loop.ts:286-300` — Copy this counter pattern for consecutive text detection.

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run agent-loop` → text resilience tests GREEN
  - [ ] Text responses don't terminate the loop
  - [ ] 3 consecutive text responses trigger graceful termination

  **QA Scenarios:**

  ```
  Scenario: Text response is non-terminal
    Tool: Bash (vitest)
    Preconditions: Task 3 fixtures
    Steps:
      1. Mock server: first response = text, second response = click action, third = done
      2. Start agent loop, collect all events
      3. Assert events include: text("..."), then thinking, then propose(click), then result, then done
    Expected Result: Loop continues after text response and processes subsequent action
    Failure Indicators: Loop terminates after first text response
    Evidence: .sisyphus/evidence/task-6-text-resilience.txt

  Scenario: Consecutive text limit
    Tool: Bash (vitest)
    Steps:
      1. Mock server: returns 4 text responses in a row
      2. Start agent loop, collect events
      3. Assert 3 text events emitted, then done event with "rephrase" message
    Expected Result: Loop terminates gracefully after 3 text-only responses
    Failure Indicators: Loop runs forever; no termination; wrong message
    Evidence: .sisyphus/evidence/task-6-text-limit.txt
  ```

  **Commit**: YES
  - Message: `fix(agent): make text-only AI responses non-terminal`
  - Files: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-loop.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 7. Add getMatchingSkillsForUrl Helper to skills-api.ts

  **What to do**:
  - RED: Write tests:
    1. Test: `getMatchingSkillsForUrl("https://myopenmath.com/course/view.php")` returns skills with matching url_pattern
    2. Test: Returns empty array for URL with no matching skills
    3. Test: Excludes skills without url_pattern
    4. Test: Handles comma-separated url_pattern values
  - GREEN: Add `getMatchingSkillsForUrl(url: string): Promise<Skill[]>` to `skills-api.ts`:
    1. Call `getSkillsWithUrlPattern()` from db
    2. Filter using existing `findMatchingProfiles()` logic (already a pure function at line 200)
    3. Return matched skills
  - This is a thin wrapper around existing `findMatchingProfiles` but exposed as a public async API for the UI to call

  **Must NOT do**:
  - Do NOT change `findMatchingProfiles` logic
  - Do NOT add new DB queries

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Thin wrapper around existing functions with simple test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/skills-api.ts:200-207` — `findMatchingProfiles()` — pure function doing the URL matching
  - `ogre-desktop/src/lib/skills-api.ts:217-236` — `buildSiteContextInjection()` — uses the same pattern (getSkillsWithUrlPattern → findMatchingProfiles)

  **API/Type References**:
  - `ogre-desktop/src/lib/db.ts` — `getSkillsWithUrlPattern()` returns `Promise<Skill[]>`, `Skill` type with url_pattern field

  **WHY Each Reference Matters**:
  - `skills-api.ts:200-207` — Reuse this matching logic directly (it's already a pure function)
  - `skills-api.ts:217-236` — Follow this exact pattern: get from DB → filter by URL → return

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run skills-api` → new tests GREEN
  - [ ] Function exported and callable from components

  **QA Scenarios:**

  ```
  Scenario: URL matching returns correct skills
    Tool: Bash (vitest)
    Preconditions: Mock getSkillsWithUrlPattern to return 3 skills (2 match myopenmath.com, 1 doesn't)
    Steps:
      1. Call getMatchingSkillsForUrl("https://myopenmath.com/course/view.php")
      2. Assert result contains exactly 2 skills
      3. Assert both have url_pattern containing "myopenmath.com"
    Expected Result: Only matching skills returned
    Failure Indicators: Wrong count; non-matching skills included; matching skills excluded
    Evidence: .sisyphus/evidence/task-7-url-matching.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add getMatchingSkillsForUrl helper`
  - Files: `ogre-desktop/src/lib/skills-api.ts`, `ogre-desktop/src/lib/skills-api.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 8. Add Skill Dropdown to AgentChat.svelte

  **What to do**:
  - Import `getMatchingSkillsForUrl` from Task 7 and `getEmbeddedUrl` from browser module
  - Add reactive state: `matchingSkills: Skill[]`, `selectedSkillId: string | null`
  - On component mount (or when agent is idle), call `getEmbeddedUrl()` → `getMatchingSkillsForUrl(url)` to populate dropdown
  - Add a `<select>` dropdown near the mode toggle showing matched skills:
    - Default option: "No skill" (selectedSkillId = null)
    - Each matched skill: skill.name as label, skill.id as value
  - When a skill is selected, toggle its `is_active` flag in DB via `saveSkill()` (so `buildSkillInjection()` picks it up in the agent loop)
  - Disable dropdown while agent is running (agentState !== 'idle')
  - Style to match existing `.mode-toggle` pattern (compact, fits in header row)

  **Must NOT do**:
  - Do NOT build a full skill management panel (no search, install, edit)
  - Do NOT add skill content preview or editing
  - Do NOT change the agent loop — it already calls buildSkillInjection (from Task 5)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component work in Svelte with styling that matches existing design system
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Tasks 5 and 7 complete)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/AgentChat.svelte:260-329` — Header row with mode toggle, compact toggle, context pill — skill dropdown goes here
  - `ogre-desktop/src/components/grading/AgentChat.svelte:699-717` — `.mode-toggle` CSS pattern to match for skill dropdown styling
  - `ogre-desktop/src/components/grading/ProviderSelector.svelte` — Example of a dropdown component with bind patterns in this codebase

  **API/Type References**:
  - `ogre-desktop/src/lib/skills-api.ts` — `getMatchingSkillsForUrl(url)` from Task 7
  - `ogre-desktop/src/lib/db.ts` — `saveSkill()`, `Skill` type with `is_active` field
  - `ogre-desktop/src/lib/browser.ts` — `getEmbeddedUrl()` for current page URL

  **WHY Each Reference Matters**:
  - `AgentChat.svelte:260-329` — The dropdown must visually fit in this header. Follow the spacing and sizing patterns.
  - `ProviderSelector.svelte` — Copy the bind:value / on:change pattern for Svelte 5 select components
  - `getMatchingSkillsForUrl` — The data source for populating the dropdown

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run` → all tests pass
  - [ ] Dropdown renders with matching skills when URL has matches
  - [ ] Selecting a skill updates is_active in DB

  **QA Scenarios:**

  ```
  Scenario: Skill dropdown populates from URL match
    Tool: Bash (vitest)
    Preconditions: Mock getMatchingSkillsForUrl to return 2 skills, mock getEmbeddedUrl to return "https://myopenmath.com"
    Steps:
      1. Render AgentChat component
      2. Assert select element exists with 3 options (No skill + 2 skills)
      3. Assert skill names appear as option labels
    Expected Result: Dropdown shows matched skills
    Failure Indicators: No select element; wrong options; type errors
    Evidence: .sisyphus/evidence/task-8-skill-dropdown.txt

  Scenario: Skill selection toggles is_active
    Tool: Bash (vitest)
    Steps:
      1. Select a skill from dropdown
      2. Assert saveSkill was called with is_active: 1 for selected skill
      3. Select "No skill"
      4. Assert saveSkill was called with is_active: 0
    Expected Result: DB updated on selection change
    Failure Indicators: saveSkill not called; wrong is_active value
    Evidence: .sisyphus/evidence/task-8-skill-toggle.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add skill dropdown to AgentChat`
  - Files: `ogre-desktop/src/components/grading/AgentChat.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 9. Add Profile Indicator Badge to AgentChat.svelte

  **What to do**:
  - Add reactive state: `activeProfileName: string | null`
  - On mount / URL change, call `buildSiteContextInjection(url)` and extract the profile name (or use `findMatchingProfiles` + `selectBestProfile` to get the name directly)
  - Display a small badge/pill next to the "Agent" title showing the matched profile name:
    - When profile found: `<span class="profile-badge">MyOpenMath</span>` (green border, like the context pill)
    - When no profile: show nothing here (the auto-discovery banner from Task 10 handles this)
  - Style to match the existing `.ctx-pill` pattern (compact, color-coded)

  **Must NOT do**:
  - Do NOT add profile editing or management
  - Do NOT change how profiles are matched

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small UI addition with existing CSS patterns to copy
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: None
  - **Blocked By**: None (uses existing functions)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/AgentChat.svelte:276-286` — `.ctx-pill` styling pattern to copy
  - `ogre-desktop/src/components/grading/AgentChat.svelte:462-493` — `.ctx-pill` CSS

  **API/Type References**:
  - `ogre-desktop/src/lib/skills-api.ts:200-236` — `findMatchingProfiles` + `selectBestProfile` to get the profile name
  - `ogre-desktop/src/lib/browser.ts` — `getEmbeddedUrl()`

  **WHY Each Reference Matters**:
  - `.ctx-pill` — Copy this exact visual pattern for the profile badge (compact, color-coded, rounded)
  - `findMatchingProfiles/selectBestProfile` — Already exist and return the profile; just extract `.name`

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run` → all tests pass
  - [ ] Badge shows profile name when URL matches a profile

  **QA Scenarios:**

  ```
  Scenario: Profile badge shows matched profile name
    Tool: Bash (vitest)
    Preconditions: Mock getEmbeddedUrl → "https://myopenmath.com", mock findMatchingProfiles → [{ name: "MyOpenMath" }]
    Steps:
      1. Render AgentChat
      2. Assert element with class "profile-badge" contains text "MyOpenMath"
    Expected Result: Badge visible with correct profile name
    Failure Indicators: No badge element; wrong name; badge shown when no profile
    Evidence: .sisyphus/evidence/task-9-profile-badge.txt
  ```

  **Commit**: YES (groups with Task 10)
  - Message: `feat(agent): add profile indicator badge to AgentChat`
  - Files: `ogre-desktop/src/components/grading/AgentChat.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 10. Add Auto-Discovery Banner for Unmatched URLs

  **What to do**:
  - When `activeProfileName` is null (no profile matches current URL), show a banner above the chat messages:
    - Text: "No site profile found for this page"
    - Button: "Discover Page" that dispatches the `discover_page` action or navigates to the discovery panel
    - Style: Amber/warning color, similar to `.message.system.info` pattern but as a persistent banner
  - Banner should disappear when:
    - A profile is found (URL changes to a profiled site)
    - User clicks "Discover Page" (transition to discovery mode)
    - User dismisses the banner
  - Keep this simple — a banner with text and a button, NOT autonomous discovery

  **Must NOT do**:
  - Do NOT auto-start page discovery without user action
  - Do NOT block the agent from working (just show the banner as informational)
  - Do NOT add complex discovery flow logic here

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple conditional banner UI with one button
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/AgentChat.svelte:374-378` — System message styling patterns
  - `ogre-desktop/src/components/grading/AgentChat.svelte:874-900` — `.message.system` CSS variants (info, error, done)
  - `ogre-desktop/src/pages/GradingPanel.svelte` — Mode switching pattern (if "Discover" button should switch modes)

  **WHY Each Reference Matters**:
  - System message CSS — Use the `.info` variant as the banner styling basis (blue/amber border, light background)
  - GradingPanel.svelte — If the Discover button should switch to the DiscoveryPanel mode, check how mode switching works here

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `npx vitest run` → all tests pass
  - [ ] Banner shows when no profile matches; hidden when profile found

  **QA Scenarios:**

  ```
  Scenario: Banner appears on unmatched URL
    Tool: Bash (vitest)
    Preconditions: Mock getEmbeddedUrl → "https://unknown-site.com", mock findMatchingProfiles → []
    Steps:
      1. Render AgentChat
      2. Assert banner element visible with text "No site profile found"
      3. Assert "Discover Page" button exists
    Expected Result: Banner visible with discover button
    Failure Indicators: No banner; banner on profiled site; no button
    Evidence: .sisyphus/evidence/task-10-discovery-banner.txt

  Scenario: Banner hidden on profiled site
    Tool: Bash (vitest)
    Preconditions: Mock getEmbeddedUrl → "https://myopenmath.com", mock findMatchingProfiles → [profile]
    Steps:
      1. Render AgentChat
      2. Assert NO banner element visible
    Expected Result: Banner not rendered when profile matches
    Failure Indicators: Banner still showing on profiled site
    Evidence: .sisyphus/evidence/task-10-no-banner.txt
  ```

  **Commit**: YES (groups with Task 9)
  - Message: `feat(agent): add auto-discovery banner for unmatched URLs`
  - Files: `ogre-desktop/src/components/grading/AgentChat.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check for AI slop: excessive comments, over-abstraction, generic names. Verify dead `parseAgentResponse` was removed from agent-prompt.ts.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real QA — Agent Loop Exercise** — `unspecified-high`
  Write and run a vitest integration test that exercises the full agent loop with mocked server responses. Verify: action proposal → execution → result → history update. Test with at least 3 different action types (click, type, readText). Verify skill injection appears in system prompt. Save output to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag any file changes outside the allowed file list. Verify no new dependencies added.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Task(s) | Commit Message | Files | Pre-commit |
|---------|---------------|-------|------------|
| 1 | `test(agent): add diagnostic test fixtures for action pipeline` | agent-loop test files | `npx vitest run` |
| 2 | `refactor(agent): remove dead parseAgentResponse from agent-prompt` | agent-prompt.ts, agent-prompt.test.ts | `npx vitest run` |
| 3 | `test(agent): add integration test fixtures for agent loop` | test fixtures | `npx vitest run` |
| 4 | `fix(agent): fix action execution pipeline for post-GTK runtime` | agent-loop.ts, browser-actions.ts, tests | `npx vitest run` |
| 5 | `feat(agent): wire skill injection into agent loop` | agent-loop.ts, skills-api.ts, tests | `npx vitest run` |
| 6 | `fix(agent): make text-only AI responses non-terminal` | agent-loop.ts, tests | `npx vitest run` |
| 7 | `feat(agent): add getMatchingSkillsForUrl helper` | skills-api.ts, tests | `npx vitest run` |
| 8 | `feat(agent): add skill dropdown to AgentChat` | AgentChat.svelte, tests | `npx vitest run` |
| 9 | `feat(agent): add profile indicator badge to AgentChat` | AgentChat.svelte | `npx vitest run` |
| 10 | `feat(agent): add auto-discovery banner for unmatched URLs` | AgentChat.svelte | `npx vitest run` |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run  # Expected: all tests pass (1202+ existing + new)
```

### Final Checklist
- [ ] All "Must Have" items present and tested
- [ ] All "Must NOT Have" items absent (verified by F4)
- [ ] All existing 1202 tests still pass
- [ ] New tests cover: action execution, skill injection, URL matching, text resilience
- [ ] Dead parseAgentResponse removed from agent-prompt.ts
- [ ] No files outside allowed list were modified
