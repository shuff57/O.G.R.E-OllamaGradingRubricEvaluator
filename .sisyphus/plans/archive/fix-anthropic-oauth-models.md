# Fix Anthropic OAuth Model Fetch 401 & Svelte Reactivity

## TL;DR

> **Quick Summary**: Anthropic OAuth tokens (from copy-paste PKCE flow) cannot access `/v1/models` — the endpoint returns 401. OpenCode (reference implementation using the same client ID) handles this by never hitting the models endpoint and using pre-defined model lists. Additionally, Svelte reactivity bugs in `Settings.svelte` prevent the model dropdown and login status from updating properly.
> 
> **Deliverables**:
> - Hardcoded `ANTHROPIC_KNOWN_MODELS` fallback in `oauth.ts` (skips `/v1/models` for OAuth tokens)
> - Fixed Svelte 4 reactivity in `Settings.svelte` (`fetchModels`, `handleSignOut`)
> - Login status properly displays "Signed in" after OAuth auth
> - Model dropdown populates immediately after sign-in
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
User reported: "Copy and paste code works, but doesn't fetch models or change login status in the console logs." After Anthropic OAuth copy-paste auth succeeds, the model fetch fails with 401 and the UI doesn't properly reflect the signed-in state.

### Interview Summary
**Key Discussions**:
- Bug location: Settings page in the desktop app (Settings.svelte)
- Provider: Anthropic (Claude) copy-paste OAuth flow
- Console output: 401 error when fetching models after successful token exchange
- Reference: OpenCode (anomalyco/opencode-anthropic-auth) uses same OAuth flow but NEVER hits /v1/models

**Research Findings**:
- OpenCode sets `autoload: false` for Anthropic — models are pre-defined, not fetched from API
- OpenCode's `opencode-anthropic-auth` plugin uses same client ID (`9d1c250a...`), same scopes (`org:create_api_key user:profile user:inference`), same token exchange URL
- The required OAuth headers are: `anthropic-beta: oauth-2025-04-20,interleaved-thinking-2025-05-14`, `user-agent: claude-cli/2.1.2 (external, cli)`, `Authorization: Bearer <token>`
- The scope `user:inference` covers inference calls but NOT model listing — confirmed by 401 response
- Svelte 4 reactivity requires `obj = {...obj}` after property mutation; `Settings.svelte` misses this in 7+ places

### Metis Review
**Identified Gaps** (addressed):
- `handleSignOut()` line 308 also has reactivity bug → included in fix
- `provider.model = models[0]` (line 331) mutates providers array without reassignment → included
- Pre-existing bug: Anthropic case doesn't check provider config for API key → noted but OUT OF SCOPE (separate concern)
- User with BOTH API key and OAuth token → OAuth wins (current behavior preserved)
- Hardcoded model list goes stale when Anthropic releases new models → acceptable tradeoff; easy to update

---

## Work Objectives

### Core Objective
Fix Anthropic OAuth login so that: (1) model dropdown populates after sign-in, and (2) UI properly reflects signed-in state.

### Concrete Deliverables
- Modified `ogre-desktop/src/lib/oauth.ts` with `ANTHROPIC_KNOWN_MODELS` constant and OAuth short-circuit
- Modified `ogre-desktop/src/pages/Settings.svelte` with fixed Svelte reactivity in `fetchModels()` and `handleSignOut()`

### Definition of Done
- [x] Anthropic OAuth sign-in → model dropdown shows models (no 401 error)
- [x] "✅ Signed in" status appears after code submission
- [x] Sign-out clears model dropdown reactively
- [x] Other providers (Ollama, OpenAI, etc.) unaffected

### Must Have
- Hardcoded Anthropic model fallback for OAuth tokens
- Svelte reactivity fixes for all mutation sites
- Login status decoupled from model fetch success/failure

### Must NOT Have (Guardrails)
- Do NOT touch other providers' cases in `fetchAvailableModels` (GitHub, OpenAI, Google, Ollama)
- Do NOT modify the Anthropic OAuth token exchange or refresh logic
- Do NOT add API key fallback for Anthropic `/v1/models` (separate concern, pre-existing)
- Do NOT refactor to Svelte 5 runes — just fix the Svelte 4 `= {...obj}` pattern
- Do NOT add model categories, filtering UI, loading spinners, or retry logic
- Do NOT fetch model list from a remote config URL
- Do NOT create any new files — edits only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest configured)
- **Automated tests**: None for this fix (UI/reactivity bugs are best verified by manual QA scenarios)
- **Framework**: vitest (existing)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code changes**: Grep/AST search to verify patterns applied correctly
- **Type safety**: `tsc --noEmit` to verify no new type errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both files can be edited in parallel):
├── Task 1: Add ANTHROPIC_KNOWN_MODELS + OAuth short-circuit in oauth.ts [quick]
├── Task 2: Fix Svelte reactivity in Settings.svelte fetchModels() + handleSignOut() [quick]

Wave 2 (After Wave 1 — verification):
├── Task 3: Verify build + type-check pass, no regressions [quick]

Critical Path: Task 1 + Task 2 (parallel) → Task 3
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | 3      |
| 2    | —         | 3      |
| 3    | 1, 2      | —      |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **1** — T3 → `quick`

---

## TODOs
> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + QA Scenarios.

- [x] 1. Add ANTHROPIC_KNOWN_MODELS constant and OAuth short-circuit in oauth.ts

  **What to do**:
  - Add a `ANTHROPIC_KNOWN_MODELS` constant array near line 248 of `oauth.ts` (after the existing Anthropic constants like `ANTHROPIC_CLIENT_ID`, `ANTHROPIC_SCOPE`, etc.)
  - The array should contain current production Anthropic model IDs. Reference the models that OpenCode and the Anthropic API currently support:
    ```typescript
    const ANTHROPIC_KNOWN_MODELS: string[] = [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-20250414',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ];
    ```
  - In the `fetchAvailableModels` function, inside the `case "anthropic"` block (lines 550-569), add an early return BEFORE the `/v1/models` fetch:
    - Check if the token is an OAuth Bearer token: `const oauthData = await getOAuthToken('anthropic'); if (oauthData?.token_type === 'Bearer') return ANTHROPIC_KNOWN_MODELS;`
    - This short-circuits the API call entirely for OAuth users
    - API key users (who don't have an OAuth token, or have token_type !== 'Bearer') still fall through to the existing `/v1/models` fetch
  - Do NOT modify any other provider case (github, openai, google, ollama)
  - Do NOT modify the token exchange, refresh, or auth header logic

  **Must NOT do**:
  - Touch any other `case` in the `switch (provider)` block
  - Modify `startClaudeOAuthFlow`, `refreshAnthropicToken`, or `getValidAnthropicToken`
  - Add remote config fetching or dynamic model discovery

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, ~15 lines added, straightforward constant + conditional
  - **Skills**: []
    - No special skills needed — this is a simple TypeScript edit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts:248-252` — Existing Anthropic constants (`ANTHROPIC_CLIENT_ID`, `ANTHROPIC_SCOPE`, `ANTHROPIC_REDIRECT_URI`) — place `ANTHROPIC_KNOWN_MODELS` here, following same naming convention
  - `ogre-desktop/src/lib/oauth.ts:550-569` — The `case "anthropic"` block in `fetchAvailableModels` — add the OAuth short-circuit at the TOP of this case, before the existing `/v1/models` fetch logic
  - `ogre-desktop/src/lib/oauth.ts:504-522` — How `fetchAvailableModels` resolves tokens for non-Anthropic providers — shows the `getOAuthToken` pattern to follow

  **External References**:
  - OpenCode's `opencode-anthropic-auth/index.mjs` (https://github.com/anomalyco/opencode-anthropic-auth) — Lines 117-128: `autoload: false` pattern. OpenCode never hits `/v1/models` for Anthropic OAuth tokens
  - OpenCode's `provider.ts` — `anthropic()` custom loader: `autoload: false` with hardcoded headers

  **WHY Each Reference Matters**:
  - `oauth.ts:248-252`: Follow naming convention for the new constant (SCREAMING_SNAKE_CASE, near related constants)
  - `oauth.ts:550-569`: This is the exact code path that triggers the 401 — the short-circuit goes here
  - `oauth.ts:504-522`: Shows how `getOAuthToken()` is called to check for stored tokens — reuse same pattern
  - OpenCode reference: Proves that NOT hitting `/v1/models` is the correct approach for OAuth tokens

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: ANTHROPIC_KNOWN_MODELS constant exists and is correct
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied to oauth.ts
    Steps:
      1. Run: grep -n 'ANTHROPIC_KNOWN_MODELS' ogre-desktop/src/lib/oauth.ts
      2. Verify constant is declared as string[] with at least 3 model IDs
      3. Verify it includes 'claude-sonnet-4-20250514' and 'claude-opus-4-20250514'
    Expected Result: Constant found near line 248-260 with correct model IDs
    Failure Indicators: Constant not found, or contains display names instead of API IDs
    Evidence: .sisyphus/evidence/task-1-models-constant.txt

  Scenario: OAuth short-circuit returns hardcoded list (no API call)
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: grep -A 5 'token_type.*Bearer.*ANTHROPIC_KNOWN_MODELS' ogre-desktop/src/lib/oauth.ts
      2. Verify the short-circuit check exists in the anthropic case
      3. Verify it returns ANTHROPIC_KNOWN_MODELS directly
    Expected Result: Early return found in anthropic case before /v1/models fetch
    Failure Indicators: No short-circuit, or short-circuit after the fetch call
    Evidence: .sisyphus/evidence/task-1-oauth-shortcircuit.txt

  Scenario: Other provider cases unchanged (regression check)
    Tool: Bash (git diff)
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: git diff ogre-desktop/src/lib/oauth.ts
      2. Verify diff only touches lines near ANTHROPIC_KNOWN_MODELS and the anthropic case
      3. Verify no changes to github, openai, google, or ollama cases
    Expected Result: Diff confined to Anthropic constant + Anthropic case block only
    Failure Indicators: Changes in other provider cases
    Evidence: .sisyphus/evidence/task-1-regression-check.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `fix(desktop): resolve Anthropic OAuth model fetch 401 and Svelte reactivity bugs`
  - Files: `ogre-desktop/src/lib/oauth.ts`, `ogre-desktop/src/pages/Settings.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 2. Fix Svelte 4 reactivity in Settings.svelte fetchModels() and handleSignOut()

  **What to do**:
  - In `fetchModels()` function (around line 318-339), add object reassignment after EVERY property mutation to trigger Svelte 4 reactivity:
    - After `fetchingModels[providerId] = true;` (line 319) → add `fetchingModels = { ...fetchingModels };`
    - After `modelFetchErrors[providerId] = '';` (line 320) → add `modelFetchErrors = { ...modelFetchErrors };`
    - After `fetchedModels[providerId] = models;` (line 326) → add `fetchedModels = { ...fetchedModels };`
    - After `provider.model = models[0];` (line 331) → add `providers = [...providers];` to trigger providers array reactivity
    - After `modelFetchErrors[providerId] = ...` in catch block (line 335) → add `modelFetchErrors = { ...modelFetchErrors };`
    - After `fetchingModels[providerId] = false;` in finally block (line 337) → add `fetchingModels = { ...fetchingModels };`
  - In `handleSignOut()` function (around line 301-316):
    - After `fetchedModels[providerId] = [];` (line 308) → add `fetchedModels = { ...fetchedModels };`
  - Follow the EXACT same pattern used in `handleDeviceFlow()` (line 261: `oauthStatus = { ...oauthStatus };`), `startAuth()`, and `cancelAuth()` — all of which already use this `= {...obj}` pattern correctly

  **Must NOT do**:
  - Refactor to Svelte 5 runes (`$state()`, `$derived()`, etc.)
  - Change the function signatures or logic — ONLY add reactivity triggers
  - Touch `startAuth()`, `cancelAuth()`, or `handleDeviceFlow()` — they already have correct reactivity
  - Add loading spinners, animations, or UI changes beyond the reactivity fix

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, ~7 lines added, all following identical pattern
  - **Skills**: []
    - No special skills needed — repetitive `= {...obj}` insertions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Settings.svelte:261` — `oauthStatus = { ...oauthStatus };` — The CORRECT pattern to follow. Used in `handleDeviceFlow()` after `oauthStatus[providerId] = true`
  - `ogre-desktop/src/pages/Settings.svelte:224-225` — `authErrors = { ...authErrors }; authLoading = { ...authLoading };` — Another correct example from `startAuth()` showing the required reassignment after mutation
  - `ogre-desktop/src/pages/Settings.svelte:297-298` — `authLoading = { ...authLoading }; authErrors = { ...authErrors };` — Same pattern in `cancelAuth()`

  **Anti-pattern to fix (what's currently broken):**
  - `ogre-desktop/src/pages/Settings.svelte:319` — `fetchingModels[providerId] = true;` — MISSING the `= {...}` reassignment
  - `ogre-desktop/src/pages/Settings.svelte:320` — `modelFetchErrors[providerId] = '';` — MISSING reassignment
  - `ogre-desktop/src/pages/Settings.svelte:326` — `fetchedModels[providerId] = models;` — MISSING reassignment
  - `ogre-desktop/src/pages/Settings.svelte:331` — `provider.model = models[0];` — MISSING `providers = [...providers]`
  - `ogre-desktop/src/pages/Settings.svelte:335` — `modelFetchErrors[providerId] = ...` — MISSING reassignment
  - `ogre-desktop/src/pages/Settings.svelte:337` — `fetchingModels[providerId] = false;` — MISSING reassignment
  - `ogre-desktop/src/pages/Settings.svelte:308` — `fetchedModels[providerId] = [];` — MISSING reassignment in `handleSignOut()`

  **WHY Each Reference Matters**:
  - Lines 261, 224-225, 297-298: These WORKING examples prove the pattern. Copy their style exactly for the broken sites
  - Lines 319-337 (broken): These are the exact lines causing the model dropdown to not update after fetch
  - Line 308 (broken): This causes the model dropdown to not clear after sign-out
  - Line 331 (broken): This causes the auto-selected model to not appear in the input field

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All reactivity triggers added in fetchModels()
    Tool: Bash (grep)
    Preconditions: Task 2 edits applied to Settings.svelte
    Steps:
      1. Run: grep -n 'fetchingModels = {' ogre-desktop/src/pages/Settings.svelte
      2. Count occurrences — should be at least 2 (true + false)
      3. Run: grep -n 'fetchedModels = {' ogre-desktop/src/pages/Settings.svelte
      4. Count occurrences — should be at least 2 (set + clear in signOut)
      5. Run: grep -n 'modelFetchErrors = {' ogre-desktop/src/pages/Settings.svelte
      6. Count occurrences — should be at least 2 (clear + set)
      7. Run: grep -n 'providers = ' ogre-desktop/src/pages/Settings.svelte
      8. Verify at least one occurrence in fetchModels after provider.model assignment
    Expected Result: All 7 mutation sites have corresponding reassignment lines
    Failure Indicators: Any mutation site missing its `= {...}` or `= [...]` line
    Evidence: .sisyphus/evidence/task-2-reactivity-grep.txt

  Scenario: handleSignOut() clears fetchedModels reactively
    Tool: Bash (grep)
    Preconditions: Task 2 edits applied
    Steps:
      1. Run: grep -A 2 'fetchedModels\[providerId\] = \[\]' ogre-desktop/src/pages/Settings.svelte
      2. Verify the line immediately after the mutation includes fetchedModels reassignment
    Expected Result: `fetchedModels = { ...fetchedModels };` follows `fetchedModels[providerId] = [];`
    Failure Indicators: No reassignment line after the mutation
    Evidence: .sisyphus/evidence/task-2-signout-reactivity.txt

  Scenario: No unrelated changes (regression check)
    Tool: Bash (git diff)
    Preconditions: Task 2 edits applied
    Steps:
      1. Run: git diff ogre-desktop/src/pages/Settings.svelte
      2. Verify diff only contains added `= { ...obj }` and `= [...arr]` lines
      3. Verify no logic changes, no function signature changes, no UI changes
    Expected Result: Diff shows only reactivity trigger additions (~7 new lines)
    Failure Indicators: Logic changes, deleted lines, or UI modifications
    Evidence: .sisyphus/evidence/task-2-regression-check.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `fix(desktop): resolve Anthropic OAuth model fetch 401 and Svelte reactivity bugs`
  - Files: `ogre-desktop/src/lib/oauth.ts`, `ogre-desktop/src/pages/Settings.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

 [x] 3. Type-check and verify no regressions

  **What to do**:
  - Run `npx tsc --noEmit` in `ogre-desktop/` to verify TypeScript compiles without errors
  - Run `git diff --stat` to confirm only 2 files were modified: `oauth.ts` and `Settings.svelte`
  - Verify the `ANTHROPIC_KNOWN_MODELS` constant is used (grep for it in oauth.ts)
  - Verify no other provider cases in `fetchAvailableModels` were modified
  - If TypeScript errors exist, fix them (likely type annotation issues)

  **Must NOT do**:
  - Run the full test suite (vitest) — not needed for this UI bug fix
  - Make any logic changes beyond fixing TypeScript errors

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run 2-3 commands, check output, done
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/tsconfig.json` — TypeScript configuration for the project
  - `ogre-desktop/package.json` — Scripts and dependencies

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete
    Steps:
      1. Run: cd ogre-desktop && npx tsc --noEmit
      2. Check exit code is 0
      3. Check stdout/stderr for errors
    Expected Result: Exit code 0, no error output
    Failure Indicators: Non-zero exit code, type errors in output
    Evidence: .sisyphus/evidence/task-3-typecheck.txt

  Scenario: Only expected files were modified
    Tool: Bash (git diff)
    Preconditions: Tasks 1 and 2 complete
    Steps:
      1. Run: git diff --stat
      2. Verify only 2 files listed: src/lib/oauth.ts and src/pages/Settings.svelte
      3. Verify no unexpected files appear
    Expected Result: Exactly 2 files changed
    Failure Indicators: More than 2 files, or unexpected file paths
    Evidence: .sisyphus/evidence/task-3-diff-stat.txt
  ```

  **Commit**: NO (verification only — commit happens in Tasks 1+2)

---

## Final Verification Wave

> 1 review agent runs after all tasks complete. Must APPROVE.

 [x] F1. **Build + Type-Check + Regression Scan** — `quick`
  Run `tsc --noEmit` in `ogre-desktop/`. Grep for any remaining reactivity anti-patterns in Settings.svelte (property mutations without reassignment). Verify `ANTHROPIC_KNOWN_MODELS` constant exists and is used. Check that no other provider cases in `fetchAvailableModels` were modified.
  Output: `Build [PASS/FAIL] | Types [PASS/FAIL] | Reactivity [N sites fixed] | Regression [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **1**: `fix(oauth): use hardcoded model list for Anthropic OAuth tokens` — `ogre-desktop/src/lib/oauth.ts`
- **2**: `fix(settings): fix Svelte reactivity for model fetch and sign-out` — `ogre-desktop/src/pages/Settings.svelte`
- **Combined alternative**: `fix(desktop): resolve Anthropic OAuth model fetch 401 and Svelte reactivity bugs` — both files

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx tsc --noEmit  # Expected: no errors
```

### Final Checklist
- [x] Anthropic OAuth sign-in → model dropdown populates with known models
- [x] No 401 error in console after Anthropic sign-in
- [x] "✅ Signed in" badge appears immediately after auth
- [x] Sign-out clears model list from dropdown
- [x] Other providers still fetch models from their APIs
- [x] No TypeScript compilation errors
