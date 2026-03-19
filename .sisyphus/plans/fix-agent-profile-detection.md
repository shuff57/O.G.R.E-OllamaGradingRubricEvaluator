# Fix Agent Mode Site Profile Detection

## TL;DR

> **Quick Summary**: Agent mode's "No site profile found" banner appears because GradingPanel.svelte passes `pageLoadedUrl` to BatchPanel and DiscoveryPanel but not to AgentChat. Fix by passing the prop and making the `$effect` reactive to it, plus adding error logging to silent catch blocks.
> 
> **Deliverables**:
> - AgentChat receives and reacts to `pageLoadedUrl` prop changes
> - Silent catch blocks in profile detection pipeline log warnings
> - All existing tests pass with new test coverage added
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (tests) → Task 2 (prop fix) + Task 3 (error logging) → Task 4 (verification)

---

## Context

### Original Request
User reported: "On MOM grading page, the site profile is auto detected and used, but when I switch to agent mode it says there is no site profile." Asked whether this was fixed — investigation confirmed it is NOT.

### Investigation Summary
**Root Cause**: `GradingPanel.svelte` line 410 renders `<AgentChat />` with NO props. Lines 396 and 418 pass `{pageLoadedUrl}` to BatchPanel and DiscoveryPanel respectively, but AgentChat was omitted.

**Secondary Issue**: AgentChat's `$effect` (line 344) calls async functions (`getEmbeddedUrl()` via Tauri IPC) which are not Svelte 5 reactive state — so the effect has zero tracked dependencies and runs only once on mount. Even if `getEmbeddedUrl()` returned the correct URL on that one mount, the profile badge never updates when the user navigates.

**Important Context**: The actual agent-loop (`agent-loop.ts` lines 172-178) independently calls `buildSiteContextInjection()` at loop start and DOES work correctly. The bug is UI-only — the badge and discovery banner don't reflect the detected profile.

### Metis Review
**Identified Gaps** (addressed):
- Fix is a prop pass, not a new event listener: Confirmed by checking existing patterns in GradingPanel
- `myopenmath.com` pattern already matches all MOM pages via substring: No pattern additions needed
- Svelte 5 `$effect` requires synchronous reads for dependency tracking: Must read prop before async call
- Agent-loop site context is separate: Out of scope, works independently

---

## Work Objectives

### Core Objective
Make the Agent Mode profile badge and discovery banner correctly detect and display the active site profile when navigating to a matched page, following the same prop-passing pattern already used by BatchPanel and DiscoveryPanel.

### Concrete Deliverables
- `GradingPanel.svelte` passes `pageLoadedUrl` to `<AgentChat />`
- `AgentChat.svelte` accepts `pageLoadedUrl` prop and uses it in a reactive `$effect`
- Silent catch blocks in `skills-api.ts` and `AgentChat.svelte` log `console.warn`
- New tests covering the fix

### Definition of Done
- [ ] `npm test` in `ogre-desktop/` → 0 failures
- [ ] AgentChat source contains `pageLoadedUrl` prop declaration
- [ ] GradingPanel source passes `pageLoadedUrl` to AgentChat
- [ ] `$effect` reads `pageLoadedUrl` synchronously before async calls

### Must Have
- Reactive profile detection in AgentChat when URL changes
- Error logging for debuggability in the detection pipeline
- Zero test regressions

### Must NOT Have (Guardrails)
- DO NOT add `listenBrowserUrlChanged` inside AgentChat — use the prop chain pattern
- DO NOT modify bundled MOM profile urlPatterns — `myopenmath.com` already covers all MOM pages via substring
- DO NOT merge or unify the SiteProfile and Skill detection systems — they serve different purposes
- DO NOT change `agent-loop.ts` — its detection works independently and correctly
- DO NOT change `site-profiles.ts`, `browser.ts`, `profile-precedence.ts`, or `Browser.svelte`
- DO NOT add debouncing to AgentChat's profile check — Svelte batched effects handle rapid changes
- DO NOT refactor Browser.svelte from `$:` to `$derived` — out of scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest 4.x)
- **Automated tests**: YES (TDD — write failing tests first)
- **Framework**: vitest in `ogre-desktop/`
- **Run command**: `npm test` or `npx vitest run`

### QA Policy
Every task includes agent-executed QA scenarios verified via vitest.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — tests):
└── Task 1: Write failing tests for prop reactivity and error logging [quick]

Wave 2 (After Wave 1 — parallel fixes):
├── Task 2: Pass pageLoadedUrl prop and make $effect reactive [quick]
└── Task 3: Add console.warn to silent catch blocks [quick]

Wave FINAL (After Wave 2 — verification):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Full test suite verification [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 2 → F1-F4
Parallel Speedup: Task 2 + Task 3 run simultaneously
Max Concurrent: 2 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3 |
| 2 | 1 | F1-F4 |
| 3 | 1 | F1-F4 |
| F1-F4 | 2, 3 | — |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 2 tasks — T2 → `quick`, T3 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Write Failing Tests for URL Reactivity and Error Logging

  **What to do**:
  - In `ogre-desktop/src/components/grading/AgentChat.test.ts`, add a new `describe('AgentChat URL reactivity')` block with source-code assertion tests (following the existing pattern of reading the `.svelte` file as a string):
    - Test that `pageLoadedUrl` prop declaration exists: `componentSource` contains `pageLoadedUrl`
    - Test that `$effect` reads `pageLoadedUrl` synchronously: `componentSource` contains the prop name inside the `$effect` block (before async calls)
    - Test that `console.warn` is used in catch blocks: `componentSource` contains `console.warn`
  - In `ogre-desktop/src/lib/skills-api.test.ts`, add a new `describe('getMatchingSkillsForUrl error logging')` block:
    - Test that when `getSkillsWithUrlPattern` throws, `console.warn` is called (mock `console.warn`, mock DB to throw, call `getMatchingSkillsForUrl`, assert `console.warn` was called)
    - Test that even with DB failure, bundled profiles still match MOM URLs (call with `'https://myopenmath.com/gradeallq2.php'`, expect non-empty results)
  - Run tests — expect NEW tests to FAIL (existing tests should still pass)

  **Must NOT do**:
  - Do not modify any `.svelte` or `.ts` source files (only test files)
  - Do not write tests that require manual browser interaction

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Source-code assertion tests following established patterns — straightforward additions
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Pattern is well-established in the existing test files; no framework guidance needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/AgentChat.test.ts:1-42` — Existing source-code assertion pattern using `readFileSync` + `componentSource.toContain()`
  - `ogre-desktop/src/lib/skills-api.test.ts:400-444` — Existing `getMatchingSkillsForUrl` tests with DB mocking patterns

  **API/Type References**:
  - `ogre-desktop/src/lib/skills-api.ts:250-261` — `getMatchingSkillsForUrl()` function to test error paths
  - `ogre-desktop/src/lib/db.ts:594-599` — `getSkillsWithUrlPattern()` function being mocked

  **Test References**:
  - `ogre-desktop/src/lib/skills-api.test.ts:6-15` — Mock setup pattern for `@tauri-apps/plugin-http` and DB
  - `ogre-desktop/src/lib/agent-loop.test.ts:37-50` — `beforeEach` + `vi.resetAllMocks()` pattern

  **Acceptance Criteria**:
  - [ ] New tests added to `AgentChat.test.ts` in `describe('AgentChat URL reactivity')`
  - [ ] New tests added to `skills-api.test.ts` in `describe('getMatchingSkillsForUrl error logging')`
  - [ ] `npx vitest run src/components/grading/AgentChat.test.ts` → existing tests PASS, new tests FAIL
  - [ ] `npx vitest run src/lib/skills-api.test.ts` → existing tests PASS, new tests FAIL

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New AgentChat tests fail before implementation
    Tool: Bash (npx vitest)
    Preconditions: No changes to AgentChat.svelte source yet
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/components/grading/AgentChat.test.ts --reporter=verbose`
      2. Check output for test results
      3. Assert new "URL reactivity" tests show FAIL status
      4. Assert existing "compact mode" tests show PASS status
    Expected Result: Mix of PASS (existing) and FAIL (new) tests
    Failure Indicators: All tests pass (means tests aren't testing the right thing) or existing tests fail (means test setup broke something)
    Evidence: .sisyphus/evidence/task-1-agentchat-tests-fail.txt

  Scenario: New skills-api error logging tests fail before implementation
    Tool: Bash (npx vitest)
    Preconditions: No changes to skills-api.ts source yet
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts --reporter=verbose`
      2. Check output for error logging test results
      3. Assert new "error logging" tests show FAIL status
    Expected Result: New error logging tests fail, existing tests pass
    Evidence: .sisyphus/evidence/task-1-skillsapi-tests-fail.txt
  ```

  **Commit**: YES
  - Message: `test: add failing tests for AgentChat URL reactivity and error logging`
  - Files: `src/components/grading/AgentChat.test.ts`, `src/lib/skills-api.test.ts`
  - Pre-commit: `npx vitest run src/components/grading/AgentChat.test.ts src/lib/skills-api.test.ts` (new tests expected to FAIL)

- [x] 2. Pass `pageLoadedUrl` Prop to AgentChat and Make `$effect` Reactive

  **What to do**:
  - In `ogre-desktop/src/pages/GradingPanel.svelte`, change line 410 from `<AgentChat />` to `<AgentChat {pageLoadedUrl} />` — matching the exact pattern used on line 396 for BatchPanel and line 418 for DiscoveryPanel
  - In `ogre-desktop/src/components/grading/AgentChat.svelte`:
    1. Add `pageLoadedUrl` to the props section: `let { pageLoadedUrl = '' } = $props<{ pageLoadedUrl?: string }>();` (or equivalent Svelte 5 pattern matching existing props like `$state`)
    2. Modify the `$effect()` on line 344 to read `pageLoadedUrl` **synchronously** before calling async functions, creating a Svelte 5 reactive dependency:
       ```typescript
       $effect(() => {
         const url = pageLoadedUrl; // synchronous read → creates dependency
         checkActiveProfile(url);
         refreshMatchingSkills(url);
       });
       ```
    3. Update `checkActiveProfile()` to accept an optional URL parameter and use it instead of calling `getEmbeddedUrl()` when provided:
       ```typescript
       async function checkActiveProfile(urlHint?: string) {
         try {
           const url = urlHint || await getEmbeddedUrl();
           if (!url) { ... }
           ...
         }
       }
       ```
    4. Similarly update `refreshMatchingSkills()` to accept and use a URL parameter
  - Run AgentChat tests — expect all (old + new) to PASS

  **Must NOT do**:
  - Do not add `listenBrowserUrlChanged` event listener inside AgentChat
  - Do not change the agent-loop.ts detection (it works independently)
  - Do not change Browser.svelte or any other component

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small prop additions following existing patterns — 2 files, ~10 lines changed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte:396` — `{pageLoadedUrl}` passed to BatchPanel (exact pattern to replicate)
  - `ogre-desktop/src/pages/GradingPanel.svelte:418` — `pageLoadedUrl={pageLoadedUrl}` passed to DiscoveryPanel
  - `ogre-desktop/src/pages/GradingPanel.svelte:410` — Current `<AgentChat />` line to modify
  - `ogre-desktop/src/components/grading/AgentChat.svelte:80-101` — `checkActiveProfile()` function to modify
  - `ogre-desktop/src/components/grading/AgentChat.svelte:299-318` — `refreshMatchingSkills()` function to modify
  - `ogre-desktop/src/components/grading/AgentChat.svelte:344-347` — `$effect()` to make reactive

  **API/Type References**:
  - `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte:21-47` — Example of Svelte 5 `$props` pattern with `$bindable` and typed props
  - `ogre-desktop/src/lib/browser.ts:83-85` — `getEmbeddedUrl()` function (used as fallback when no prop)

  **Acceptance Criteria**:
  - [ ] `GradingPanel.svelte` line 410 passes `pageLoadedUrl` to AgentChat
  - [ ] `AgentChat.svelte` declares `pageLoadedUrl` prop
  - [ ] `$effect` reads `pageLoadedUrl` synchronously (creating reactive dependency)
  - [ ] `checkActiveProfile` uses URL hint when provided, falls back to `getEmbeddedUrl()`
  - [ ] `npx vitest run src/components/grading/AgentChat.test.ts` → ALL tests PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AgentChat URL reactivity tests pass after prop fix
    Tool: Bash (npx vitest)
    Preconditions: Task 1 tests written, Task 2 implementation complete
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/components/grading/AgentChat.test.ts --reporter=verbose`
      2. Check all tests pass including new "URL reactivity" tests
      3. Verify prop declaration test passes (confirms `pageLoadedUrl` in source)
      4. Verify $effect dependency test passes (confirms synchronous read)
    Expected Result: ALL tests PASS (0 failures)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-agentchat-tests-pass.txt

  Scenario: GradingPanel passes pageLoadedUrl to AgentChat
    Tool: Bash (grep)
    Preconditions: GradingPanel.svelte modified
    Steps:
      1. Run `grep -n 'AgentChat' ogre-desktop/src/pages/GradingPanel.svelte`
      2. Verify the AgentChat line includes `pageLoadedUrl`
      3. Compare pattern with BatchPanel line (should match)
    Expected Result: AgentChat line contains `pageLoadedUrl` prop
    Evidence: .sisyphus/evidence/task-2-grading-panel-prop.txt
  ```

  **Commit**: YES
  - Message: `fix(agent): pass pageLoadedUrl prop to AgentChat for reactive profile detection`
  - Files: `src/pages/GradingPanel.svelte`, `src/components/grading/AgentChat.svelte`
  - Pre-commit: `npx vitest run src/components/grading/AgentChat.test.ts`

- [x] 3. Add `console.warn` to Silent Catch Blocks in Detection Pipeline

  **What to do**:
  - In `ogre-desktop/src/lib/skills-api.ts`, add `console.warn` to the catch blocks that currently swallow errors silently:
    1. `getMatchingSkillsForUrl()` inner DB catch (line ~253): `catch (e) { console.warn('getMatchingSkillsForUrl: DB query failed, using bundled profiles only', e); }`
    2. `getMatchingSkillsForUrl()` outer catch (line ~258): `catch (e) { console.warn('getMatchingSkillsForUrl: profile matching failed', e); return []; }`
    3. `buildSiteContextInjection()` inner DB catch (line ~222): `catch (e) { console.warn('buildSiteContextInjection: DB query failed', e); }`
    4. `buildSiteContextInjection()` outer catch (line ~237): `catch (e) { console.warn('buildSiteContextInjection: site context build failed', e); return ''; }`
  - In `ogre-desktop/src/components/grading/AgentChat.svelte`, add `console.warn` to:
    1. `checkActiveProfile()` catch block (line ~97): `catch (e) { console.warn('checkActiveProfile: detection failed', e); ... }`
    2. `refreshMatchingSkills()` catch block (line ~314): `catch (e) { console.warn('refreshMatchingSkills: failed', e); ... }`
  - Run skills-api tests — expect all (old + new) to PASS

  **Must NOT do**:
  - Do not remove the try/catch blocks — they serve a purpose (graceful degradation)
  - Do not add `console.log` — use `console.warn` specifically
  - Do not change any logic, only add logging

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding 6 `console.warn` lines to existing catch blocks — pure additions, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/skills-api.ts:217-240` — `buildSiteContextInjection()` with silent catches
  - `ogre-desktop/src/lib/skills-api.ts:250-261` — `getMatchingSkillsForUrl()` with silent catches
  - `ogre-desktop/src/components/grading/AgentChat.svelte:80-101` — `checkActiveProfile()` catch block
  - `ogre-desktop/src/components/grading/AgentChat.svelte:299-318` — `refreshMatchingSkills()` catch block

  **Test References**:
  - `ogre-desktop/src/lib/skills-api.test.ts:400-444` — Existing `getMatchingSkillsForUrl` tests (verify no regressions)

  **Acceptance Criteria**:
  - [ ] 6 `console.warn` calls added to catch blocks (4 in skills-api.ts, 2 in AgentChat.svelte)
  - [ ] No catch blocks removed or modified beyond adding the warn
  - [ ] `npx vitest run src/lib/skills-api.test.ts` → ALL tests PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Error logging tests pass after adding console.warn
    Tool: Bash (npx vitest)
    Preconditions: Task 1 tests written, Task 3 implementation complete
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts --reporter=verbose`
      2. Check all tests pass including new "error logging" tests
      3. Verify the console.warn mock assertion passes
    Expected Result: ALL tests PASS (0 failures)
    Failure Indicators: Error logging test still fails
    Evidence: .sisyphus/evidence/task-3-skillsapi-tests-pass.txt

  Scenario: AgentChat source contains console.warn in catches
    Tool: Bash (grep)
    Preconditions: AgentChat.svelte modified
    Steps:
      1. Run `grep -n 'console.warn' ogre-desktop/src/components/grading/AgentChat.svelte`
      2. Verify at least 2 occurrences found
      3. Verify they're inside catch blocks (check surrounding context)
    Expected Result: 2+ console.warn calls in AgentChat.svelte catch blocks
    Evidence: .sisyphus/evidence/task-3-agentchat-warns.txt
  ```

  **Commit**: YES
  - Message: `fix(agent): add console.warn to silent catches in skills detection pipeline`
  - Files: `src/lib/skills-api.ts`, `src/components/grading/AgentChat.svelte`
  - Pre-commit: `npx vitest run src/lib/skills-api.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` in `ogre-desktop/`. Review all changed files for: unused imports, console.log in prod (console.warn is intentional), commented-out code. Check that prop passing follows exact GradingPanel patterns (compare lines 396 and 418 with new AgentChat line). Verify Svelte 5 `$effect` reads `pageLoadedUrl` synchronously before async calls.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Full Test Suite Verification** — `unspecified-high`
  Run `npx vitest run --reporter=verbose` in `ogre-desktop/`. Capture full output. Verify 0 failures across all test files. Specifically verify new tests in `AgentChat.test.ts` and `skills-api.test.ts` pass.
  Output: `Total [N tests] | Pass [N] | Fail [N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT Have" compliance: no changes to agent-loop.ts, site-profiles.ts, browser.ts, profile-precedence.ts, Browser.svelte. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| # | Commit Message | Files | Pre-commit |
|---|---------------|-------|------------|
| 1 | `test: add failing tests for AgentChat URL reactivity and error logging` | `AgentChat.test.ts`, `skills-api.test.ts` | `npx vitest run src/components/grading/AgentChat.test.ts src/lib/skills-api.test.ts` (new tests FAIL) |
| 2 | `fix(agent): pass pageLoadedUrl prop to AgentChat for reactive profile detection` | `GradingPanel.svelte`, `AgentChat.svelte` | `npx vitest run src/components/grading/AgentChat.test.ts` (PASS) |
| 3 | `fix(agent): add console.warn to silent catches in skills detection pipeline` | `skills-api.ts`, `AgentChat.svelte` | `npx vitest run src/lib/skills-api.test.ts` (PASS) |
| 4 | `chore: verify full test suite passes after agent profile detection fix` | (none) | `npx vitest run` (0 failures) |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run  # Expected: 0 failures
```

### Final Checklist
- [ ] AgentChat accepts and uses `pageLoadedUrl` prop
- [ ] GradingPanel passes `pageLoadedUrl` to AgentChat (matching BatchPanel/DiscoveryPanel pattern)
- [ ] `$effect` reads prop synchronously for Svelte 5 dependency tracking
- [ ] Silent catches log `console.warn` with context
- [ ] All existing tests pass
- [ ] New tests cover the fix scenarios
- [ ] No changes to agent-loop.ts, site-profiles.ts, browser.ts, Browser.svelte
