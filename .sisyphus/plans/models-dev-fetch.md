# Fetch Anthropic Models from models.dev (like OpenCode)

## TL;DR

> **Quick Summary**: Instead of returning a hardcoded `ANTHROPIC_KNOWN_MODELS` list for OAuth users,
> fetch the live model list from `https://models.dev/api.json` at runtime, filter to active/beta models,
> cache for 1 hour, and fall back to the hardcoded list if the fetch fails.
> This is exactly how OpenCode works — their model list is always current with zero maintenance.
>
> **Deliverables**:
> - New `fetchAnthropicModelsFromModelsDev()` function in `oauth.ts`
> - In-memory cache with 1-hour TTL (matches OpenCode)
> - Fallback to `ANTHROPIC_KNOWN_MODELS` if models.dev is unreachable
> - OAuth short-circuit updated to call the new function instead of returning hardcoded list
>
> **Estimated Effort**: Quick (single file, ~40 lines)
> **Parallel Execution**: NO — single task, single file

---

## Context

### Original Request
After fixing the Anthropic OAuth 401 error, the hardcoded model list (`ANTHROPIC_KNOWN_MODELS`) is
stale and incomplete. OpenCode (the reference implementation) fetches from `https://models.dev/api.json`
dynamically and filters by status. We should do the same.

### Research Findings
- **models.dev** hosts `https://models.dev/api.json` — a JSON registry of all AI provider models
- **OpenCode's approach** (`models.ts`): fetches the API, caches locally, refreshes every hour
- **Anthropic block in models.dev**: key `"anthropic"`, sub-key `"models"` is a record of `{ [id]: ModelObject }`
- **Filtering**: each model has an optional `status` field — values are `"alpha"`, `"beta"`, `"deprecated"`, or absent (= active)
  - OpenCode **excludes** `alpha` and `deprecated` by default
  - `beta` models ARE shown (e.g. claude-3-7-sonnet)
- **Current live stable models** (from models.dev, 2026-02-22):
  ```
  claude-opus-4-20250514
  claude-sonnet-4-20250514
  claude-3-7-sonnet-20250219
  claude-3-7-sonnet-latest
  claude-3-5-sonnet-20241022
  claude-3-5-sonnet-20240620
  claude-3-5-haiku-20241022
  claude-3-5-haiku-latest
  claude-3-opus-20240229
  claude-3-haiku-20240307
  claude-3-sonnet-20240229
  ```
- **Alpha models** (hidden by default): `claude-opus-4-0`, `claude-opus-4-1`, `claude-opus-4-5`,
  `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-sonnet-4-6`, `claude-haiku-4-5`, etc.

### Key Code Locations
- `ogre-desktop/src/lib/oauth.ts:253-262` — `ANTHROPIC_KNOWN_MODELS` constant (keep as fallback)
- `ogre-desktop/src/lib/oauth.ts:560-563` — OAuth short-circuit (`case "anthropic"` → return hardcoded)
- `ogre-desktop/src/lib/oauth.ts:1` — imports: `tauriFetch` already imported from `@tauri-apps/plugin-http`

---

## Work Objectives

### Core Objective
Replace the static `ANTHROPIC_KNOWN_MODELS` early-return with a dynamic fetch from models.dev,
so the Anthropic model dropdown is always current without any code changes.

### Concrete Deliverables
- `ogre-desktop/src/lib/oauth.ts` modified with:
  - `modelsDevCache` module-level cache variable
  - `fetchAnthropicModelsFromModelsDev()` async function
  - Updated `case "anthropic"` OAuth short-circuit to call it with fallback

### Definition of Done
- [x] Anthropic OAuth sign-in → model dropdown shows live models from models.dev
- [x] If models.dev is offline → dropdown still shows `ANTHROPIC_KNOWN_MODELS` fallback
- [x] Cache is used on second call within 1 hour (no redundant fetches)
- [x] Alpha and deprecated models are excluded
- [x] API key users still fall through to existing `/v1/models` fetch path (unchanged)

### Must Have
- In-memory cache with 1-hour TTL
- Graceful fallback to `ANTHROPIC_KNOWN_MODELS` on any fetch/parse failure
- Filter: exclude `status === 'alpha'` and `status === 'deprecated'`

### Must NOT Have
- Do NOT touch any other provider cases in `fetchAvailableModels`
- Do NOT modify the token exchange, refresh, or auth flow
- Do NOT add a disk/DB cache — in-memory is sufficient
- Do NOT make the fetch blocking for non-OAuth users (API key path unchanged)
- Do NOT remove `ANTHROPIC_KNOWN_MODELS` — keep it as the fallback

---

## Verification Strategy

### QA Policy
- **Code review**: Grep to verify cache variable, function, and updated short-circuit exist
- **Type safety**: `svelte-check` on `oauth.ts` — no new errors
- **Regression**: `git diff --stat` confirms only `oauth.ts` changed

---

## Execution Strategy

Single task, single wave. No parallelization needed.

---

## TODOs
> Implementation + Test = ONE Task. Never separate.

- [x] 1. Add `fetchAnthropicModelsFromModelsDev()` with cache and update OAuth short-circuit in `oauth.ts`

  **What to do**:

  **Step 1** — Add cache variable and fetcher function after the `ANTHROPIC_KNOWN_MODELS` constant
  (after line 262, before `export async function startClaudeOAuthFlow`):

  ```typescript
  // ── models.dev live model fetch (with 1-hour in-memory cache) ────────────
  let _modelsDevCache: { models: string[]; fetchedAt: number } | null = null;
  const MODELS_DEV_TTL_MS = 60 * 60 * 1000; // 1 hour

  async function fetchAnthropicModelsFromModelsDev(): Promise<string[]> {
    if (_modelsDevCache && Date.now() - _modelsDevCache.fetchedAt < MODELS_DEV_TTL_MS) {
      return _modelsDevCache.models;
    }
    const res = await tauriFetch('https://models.dev/api.json');
    if (!res.ok) throw new Error(`models.dev fetch failed: ${res.status}`);
    const data: Record<string, any> = await res.json();
    const anthropicModels: Record<string, any> = data['anthropic']?.models ?? {};
    const models = Object.entries(anthropicModels)
      .filter(([_, m]) => m.status !== 'alpha' && m.status !== 'deprecated')
      .map(([id]) => id);
    if (models.length === 0) throw new Error('models.dev returned empty anthropic model list');
    _modelsDevCache = { models, fetchedAt: Date.now() };
    return models;
  }
  ```

  **Step 2** — Update the OAuth short-circuit in `case "anthropic"` (currently line 562-563):

  Change:
  ```typescript
  if (oauthData?.token_type === 'Bearer') return ANTHROPIC_KNOWN_MODELS;
  ```

  To:
  ```typescript
  if (oauthData?.token_type === 'Bearer') {
    try {
      return await fetchAnthropicModelsFromModelsDev();
    } catch {
      return ANTHROPIC_KNOWN_MODELS;
    }
  }
  ```

  **Must NOT do**:
  - Do NOT remove `ANTHROPIC_KNOWN_MODELS` — it's the fallback
  - Do NOT modify any other case in the switch (github, openai, google, ollama)
  - Do NOT modify `startClaudeOAuthFlow`, `refreshAnthropicToken`, or `getValidAnthropicToken`
  - Do NOT add disk/DB caching

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: NO (single task)

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts:1-3` — `tauriFetch` already imported, use it directly
  - `ogre-desktop/src/lib/oauth.ts:253-262` — `ANTHROPIC_KNOWN_MODELS` (keep, use as fallback)
  - `ogre-desktop/src/lib/oauth.ts:560-563` — the short-circuit to update

  **QA Scenarios**:

  ```
  Scenario: fetchAnthropicModelsFromModelsDev function exists
    Tool: Bash (grep)
    Steps:
      1. grep -n 'fetchAnthropicModelsFromModelsDev' ogre-desktop/src/lib/oauth.ts
    Expected Result: Function definition + call site both found (2+ lines)

  Scenario: Cache variable exists with correct TTL
    Tool: Bash (grep)
    Steps:
      1. grep -n '_modelsDevCache\|MODELS_DEV_TTL' ogre-desktop/src/lib/oauth.ts
    Expected Result: Both found, TTL = 3600000

  Scenario: Short-circuit uses try/catch with fallback
    Tool: Bash (grep -A)
    Steps:
      1. grep -A 5 "token_type === 'Bearer'" ogre-desktop/src/lib/oauth.ts
    Expected Result: try { return await fetchAnthropicModelsFromModelsDev() } catch { return ANTHROPIC_KNOWN_MODELS }

  Scenario: models.dev URL is correct
    Tool: Bash (grep)
    Steps:
      1. grep "models.dev" ogre-desktop/src/lib/oauth.ts
    Expected Result: https://models.dev/api.json found

  Scenario: Only oauth.ts changed
    Tool: Bash (git diff)
    Steps:
      1. git diff --stat
    Expected Result: Only ogre-desktop/src/lib/oauth.ts listed
  ```

  **Commit**: YES
  - Message: `feat(desktop): fetch Anthropic models from models.dev with 1-hour cache and fallback`
  - Files: `ogre-desktop/src/lib/oauth.ts`

---

## Success Criteria

```bash
cd ogre-desktop && npx svelte-check 2>&1 | grep -E "oauth|Error" | grep -v "drawer-injection\|discovery-picker"
# Expected: no errors from oauth.ts
```

### Final Checklist
- [x] `fetchAnthropicModelsFromModelsDev` function present in oauth.ts
- [x] Cache with 1-hour TTL present
- [x] `try/catch` fallback to `ANTHROPIC_KNOWN_MODELS` present
- [x] Filter excludes alpha and deprecated status models
- [x] Only `oauth.ts` modified
- [x] No TypeScript errors in changed file
