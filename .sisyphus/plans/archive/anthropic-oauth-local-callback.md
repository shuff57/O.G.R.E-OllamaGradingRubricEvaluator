# Anthropic OAuth: Local Callback Server + Token Refresh

## TL;DR

> **Quick Summary**: Replace the manual code-paste Anthropic OAuth flow with an automatic localhost callback server, add token refresh so users don't get logged out, and add the missing `anthropic-beta` header.
> 
> **Deliverables**:
> - Rust Tauri command that spins up a one-shot HTTP listener to catch OAuth callbacks
> - Rewritten `oauth.ts` Claude flow using `DeviceFlowResult`-like interface (no more code pasting)
> - Token refresh logic that auto-refreshes before API calls
> - `anthropic-beta: oauth-2025-04-20` header on all Bearer-auth Anthropic API calls
> - Simplified UI in Settings.svelte and SetupWizard.svelte (Claude uses same flow as other providers)
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves + verification
> **Critical Path**: Task 1 (Rust server) → Task 2 (oauth.ts rewrite) → Task 3 (UI cleanup) → Task 5 (verification)

---

## Context

### Original Request
Replace the Anthropic OAuth "code-paste" flow with a local HTTP server that automatically catches the auth code from the browser redirect. Also add missing token refresh and `anthropic-beta` header.

### Interview Summary
**Key Discussions**:
- Current flow requires user to manually copy an auth code from the browser and paste into a text input — friction
- Ecosystem analysis: 10+ OSS projects (KiloCode, Codebuff, Plandex, DeepChat, etc.) all use the same Claude Code client_id (`9d1c250a-e61b-44d9-88ed-5944d1962f5e`) with either localhost callback or code-paste
- User confirmed: add token refresh, add beta header, use temporary listener approach

**Research Findings**:
- Port 54545 is the de-facto standard for Claude OAuth localhost callbacks
- `http://localhost:54545/callback` confirmed working as redirect_uri with this client_id
- Token refresh uses `grant_type=refresh_token` to `console.anthropic.com/v1/oauth/token`

### Metis Review
**Identified Gaps** (addressed):
- **Tauri WebView cannot create TCP servers from TypeScript** — must use Rust-side Tauri command instead. This overrides user's initial preference for "TypeScript listener" which is architecturally impossible in Tauri.
- **Grading server also needs changes** — `buildAnthropicRequest()` in the grading server hardcodes `x-api-key` and won't work with Bearer tokens from OAuth. Added as Task 4.
- **Race condition risk** — callback server must be listening BEFORE browser opens. Plan enforces sequential: bind port → confirm → open browser.
- **Port conflict handling** — fallback to port range 54545-54554 if primary port busy.
- **`code=true` param removal** — must be removed when using localhost redirect (it tells Anthropic's console page to display code for manual copying).

---

## Work Objectives

### Core Objective
Eliminate the manual code-paste step in Anthropic OAuth by catching the browser redirect automatically via a local HTTP server, and ensure token longevity via refresh.

### Concrete Deliverables
- `src-tauri/src/lib.rs` — New `start_oauth_callback_server` / `stop_oauth_callback_server` Tauri commands
- `ogre-desktop/src/lib/oauth.ts` — Rewritten `startClaudeOAuthFlow()`, new `refreshAnthropicToken()`, `getValidAnthropicToken()`, anthropic-beta header
- `ogre-desktop/src/pages/Settings.svelte` — Simplified auth flow (no code-paste UI)
- `ogre-desktop/src/pages/SetupWizard.svelte` — Same simplification
- `grading-server/providers.js` (and bundle.js) — Bearer token support + beta header for Anthropic

### Definition of Done
- [ ] `cargo build` succeeds in `src-tauri/` with 0 errors
- [ ] `npm run build` succeeds in `ogre-desktop/` with 0 errors
- [ ] `CodePasteFlowResult` type completely removed from codebase
- [ ] `claudeCodeInput` and `submitClaudeCode` removed from both Svelte files
- [ ] `anthropic-beta` header present in oauth.ts and grading server
- [ ] Token refresh function exists and is wired into model fetching

### Must Have
- Automatic OAuth callback capture (no user paste)
- Token refresh before expiry
- `anthropic-beta: oauth-2025-04-20` on Bearer-auth API calls
- Success page served to browser ("Authentication successful! You can close this tab.")
- 5-minute timeout on callback server with clean shutdown
- Port fallback if 54545 is busy

### Must NOT Have (Guardrails)
- DO NOT touch GitHub, OpenAI, or Google device flows — they work fine as-is
- DO NOT modify the `DeviceFlowResult` interface — 3 other providers use it
- DO NOT add token refresh for non-Anthropic providers
- DO NOT add new Cargo dependencies (tokio already available)
- DO NOT change Tauri capability permissions (localhost already allowed)
- DO NOT add background token refresh timers — on-demand only
- DO NOT over-abstract: build for Anthropic only, no generic OAuth framework

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: Limited (grading-api.test.ts only)
- **Automated tests**: None for this change — OAuth flow requires human browser interaction
- **Framework**: N/A
- **Strategy**: Build verification + grep-based artifact removal checks + QA scenarios

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Rust code**: `cargo build` / `cargo check` in src-tauri
- **TypeScript code**: `npm run build` in ogre-desktop
- **Grading server**: `bun build` or direct grep verification
- **Artifact removal**: `grep -r` to verify old code is gone

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — no dependencies):
├── Task 1: Rust OAuth callback server command [unspecified-high]
└── Task 4: Grading server Bearer token + beta header [quick]

Wave 2 (After Wave 1 — sequential chain):
├── Task 2: Rewrite oauth.ts Claude flow (depends: 1) [unspecified-high]
└── Task 3: Update Settings.svelte + SetupWizard.svelte (depends: 2) [quick]
    └── Task 2b: Add token refresh to oauth.ts (part of Task 2) [included in 2]

Wave FINAL (After ALL tasks):
└── Task 5: Full build verification [quick]

Critical Path: Task 1 → Task 2 → Task 3 → Task 5
Parallel Speedup: Wave 1 runs 2 tasks in parallel
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1    | —         | 2      | 1    |
| 4    | —         | 5      | 1    |
| 2    | 1         | 3, 5   | 2    |
| 3    | 2         | 5      | 2    |
| 5    | 1-4       | —      | FINAL|

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `unspecified-high`, T4 → `quick`
- **Wave 2**: 2 tasks — T2 → `unspecified-high`, T3 → `quick`
- **FINAL**: 1 task — T5 → `quick`

---

## TODOs

- [ ] 1. Add Rust OAuth Callback Server Command

  **What to do**:
  - In `ogre-desktop/src-tauri/src/lib.rs`, add two new Tauri commands:
    - `start_oauth_callback_server(port: u16)` — Uses `tokio::net::TcpListener` to bind `0.0.0.0:{port}`, waits for a single GET request to `/callback`, extracts `code` and `state` query parameters, serves an HTML success page ("Authentication successful! You can close this tab."), then shuts down and returns `{code, state}` to the frontend.
    - `stop_oauth_callback_server()` — Cancels the listener if still waiting (use a `tokio::sync::oneshot` or `CancellationToken` pattern).
  - Register both commands in the `.invoke_handler(tauri::generate_handler![...])` call.
  - Port binding: try port 54545 first. If `AddrInUse`, try 54546-54554. Return the actual bound port to the frontend so it can construct the correct `redirect_uri`.
  - Timeout: if no callback arrives within 5 minutes (300s), return an error.
  - Error handling: parse `?error=X&error_description=Y` query params from OAuth error responses.
  - DO NOT add new Cargo dependencies — `tokio` is already available with `time` features. Parse the raw HTTP request manually (it's a single GET with query params — no need for a web framework).

  **Must NOT do**:
  - Do not use `hyper`, `actix-web`, `warp`, or any HTTP framework — raw `TcpListener` + manual HTTP parsing is sufficient for a single-request handler.
  - Do not persist port number — it's ephemeral.
  - Do not leave the listener running after receiving the callback.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Rust async networking with Tauri command integration requires careful implementation.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser automation needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 4)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs` — Existing Tauri commands (look at the invoke_handler registration pattern and how commands return results to frontend)
  - `ogre-desktop/src-tauri/Cargo.toml:26` — `tokio = { version = "1", features = ["time"] }` confirms tokio availability

  **API/Type References**:
  - Tauri v2 command pattern: `#[tauri::command] async fn name() -> Result<ReturnType, String>`
  - `tokio::net::TcpListener::bind()` for the TCP server
  - `tokio::time::timeout()` for the 5-minute deadline

  **External References**:
  - KiloCode implementation (TypeScript but same HTTP pattern): `https://github.com/Kilo-Org/kilocode/blob/main/src/integrations/claude-code/oauth.ts` — shows the expected HTTP GET format from Anthropic's redirect
  - Plandex implementation (Go): `https://github.com/plandex-ai/plandex/blob/main/app/cli/lib/claude_max.go` — shows the callback server pattern

  **WHY Each Reference Matters**:
  - `lib.rs` existing commands show how to wire async Rust functions into Tauri's invoke system
  - The external implementations show exactly what HTTP request Anthropic sends to the callback URL (GET with ?code=X&state=Y query string)

  **Acceptance Criteria**:
  - [ ] `cargo check` in `src-tauri/` succeeds with 0 errors
  - [ ] `grep "start_oauth_callback" src-tauri/src/lib.rs` returns 2+ matches (function def + handler registration)
  - [ ] `grep "stop_oauth_callback" src-tauri/src/lib.rs` returns 2+ matches

  **QA Scenarios:**

  ```
  Scenario: Rust compilation succeeds with new commands
    Tool: Bash
    Preconditions: Rust toolchain installed, src-tauri/Cargo.toml unchanged
    Steps:
      1. Run `cargo check` in `ogre-desktop/src-tauri/`
      2. Check exit code is 0
      3. Grep for `start_oauth_callback_server` in lib.rs — expect 2+ matches (fn def + invoke_handler)
      4. Grep for `stop_oauth_callback_server` in lib.rs — expect 2+ matches
    Expected Result: Compilation succeeds, both commands registered
    Failure Indicators: `cargo check` exits non-zero; grep returns 0 matches
    Evidence: .sisyphus/evidence/task-1-rust-build.txt

  Scenario: Command returns correct structure
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Grep for `struct.*OAuthCallback` or similar return type in lib.rs
      2. Verify it has `code: String` and `state: String` fields
      3. Verify timeout constant is approximately 300 seconds
    Expected Result: Return type has code and state fields, timeout is 5 min
    Failure Indicators: Missing fields or no timeout
    Evidence: .sisyphus/evidence/task-1-structure-check.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add Rust OAuth callback server Tauri commands`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo check` in src-tauri/

- [ ] 2. Rewrite oauth.ts Claude Flow + Add Token Refresh

  **What to do**:
  - **Replace `startClaudeCodePasteFlow()`** with `startClaudeOAuthFlow()` that:
    1. Calls `invoke('start_oauth_callback_server', { port: 54545 })` to start the Rust listener. The command returns a Promise that resolves when the callback arrives.
    2. Updates `ANTHROPIC_REDIRECT_URI` to `http://localhost:{actualPort}/callback` using the port returned by the Rust command.
    3. Builds the auth URL WITHOUT `code=true` param (remove line 270 `authUrl.searchParams.set("code", "true")`)
    4. Calls `open(authUrl)` to launch the browser.
    5. Returns a `DeviceFlowResult`-like object where:
       - `userCode` = empty string (not applicable)
       - `verificationUrl` = the auth URL
       - `poll()` = awaits the `invoke` promise from step 1, then exchanges the code for tokens using the existing token exchange logic (lines 286-318)
       - `cancel()` = calls `invoke('stop_oauth_callback_server')` to kill the listener
  - **Remove `CodePasteFlowResult` interface** (lines 14-18) — no longer needed.
  - **Add `anthropic-beta` header** to `fetchAvailableModels` anthropic case (around line 502):
    ```typescript
    headers: {
      ...anthropicAuthHeader,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
    }
    ```
  - **Add `refreshAnthropicToken()` function**:
    ```typescript
    async function refreshAnthropicToken(refreshToken: string): Promise<{access_token: string, refresh_token?: string, expires_in?: number}> {
      const res = await tauriFetch(ANTHROPIC_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: ANTHROPIC_CLIENT_ID,
        }),
      });
      if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
      return await res.json();
    }
    ```
  - **Add `getValidAnthropicToken()` function** that:
    1. Gets token from DB via `getOAuthToken('anthropic')`
    2. Checks if `expires_at` is within 5 minutes of now
    3. If expired/expiring: calls `refreshAnthropicToken()`, saves new tokens via `saveOAuthToken()`, calls `pushProvidersToServer()` to sync with grading server
    4. Returns the valid access token
  - **Wire into `fetchAvailableModels`** anthropic case: call `getValidAnthropicToken()` before using the token.
  - **Update `ANTHROPIC_REDIRECT_URI`** constant from `https://console.anthropic.com/oauth/code/callback` to `http://localhost:54545/callback`.

  **Must NOT do**:
  - Do not modify `DeviceFlowResult` interface — return a compatible object.
  - Do not add background refresh timers.
  - Do not touch GitHub/OpenAI/Google flows.
  - Do not remove `generateCodeVerifier()`, `generateCodeChallenge()`, `generateState()` — still needed for PKCE.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex OAuth flow rewrite with multiple interconnected changes (redirect URI, PKCE, token exchange, refresh, Tauri invoke).
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts:59-150` — `startGitHubDeviceFlow()` is the EXACT pattern to follow. The new Claude flow should return a `DeviceFlowResult` matching this structure.
  - `ogre-desktop/src/lib/oauth.ts:251-323` — Current `startClaudeCodePasteFlow()` to be replaced. Reuse the PKCE generation and token exchange logic, just change how the code arrives.
  - `ogre-desktop/src/lib/oauth.ts:497-511` — Current `fetchAvailableModels` anthropic case where beta header must be added.

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts:7-12` — `DeviceFlowResult` interface that the new flow must return.
  - `ogre-desktop/src/lib/db.ts` — `saveOAuthToken()`, `getOAuthToken()` signatures for token persistence.
  - `ogre-desktop/src/lib/provider-sync.ts:73` — `pushProvidersToServer()` must be called after token refresh.

  **External References**:
  - Cherry Studio implementation: `https://github.com/CherryHQ/cherry-studio/blob/main/src/main/services/AnthropicService.ts` — shows the complete token exchange and refresh pattern.
  - Anomalyco opencode-anthropic-auth: `https://github.com/anomalyco/opencode-anthropic-auth/blob/master/index.mjs` — shows refresh_token grant_type usage.

  **WHY Each Reference Matters**:
  - The GitHub device flow is the target pattern — Claude flow should look identical from the UI's perspective
  - The current code-paste flow contains the PKCE + token exchange logic we'll reuse
  - Cherry Studio shows the refresh flow we're implementing

  **Acceptance Criteria**:
  - [ ] `npm run build` in ogre-desktop succeeds with 0 errors
  - [ ] `grep "CodePasteFlowResult" ogre-desktop/src/lib/oauth.ts` returns 0 matches
  - [ ] `grep "code.*true" ogre-desktop/src/lib/oauth.ts` returns 0 matches (code=true param removed)
  - [ ] `grep "anthropic-beta" ogre-desktop/src/lib/oauth.ts` returns 1+ matches
  - [ ] `grep "refreshAnthropicToken\|getValidAnthropicToken" ogre-desktop/src/lib/oauth.ts` returns 2+ matches
  - [ ] `grep "localhost.*callback" ogre-desktop/src/lib/oauth.ts` returns 1+ matches
  - [ ] `grep "start_oauth_callback_server" ogre-desktop/src/lib/oauth.ts` returns 1+ matches (Tauri invoke call)

  **QA Scenarios:**

  ```
  Scenario: TypeScript compilation succeeds after rewrite
    Tool: Bash
    Preconditions: Task 1 complete (Rust commands available)
    Steps:
      1. Run `npm run build` in ogre-desktop/
      2. Check exit code is 0
      3. Grep for removed artifacts: CodePasteFlowResult, code=true
      4. Grep for new artifacts: anthropic-beta, refreshAnthropicToken, getValidAnthropicToken, localhost.*callback
    Expected Result: Build succeeds, old artifacts gone, new artifacts present
    Failure Indicators: Build errors; grep finds removed artifacts; grep misses new artifacts
    Evidence: .sisyphus/evidence/task-2-build-check.txt

  Scenario: New Claude flow returns DeviceFlowResult-compatible object
    Tool: Bash (grep)
    Preconditions: Task 2 code changes complete
    Steps:
      1. Grep for `startClaudeOAuthFlow` in oauth.ts — expect exported function
      2. Verify return type mentions `DeviceFlowResult` or has `poll` and `cancel` methods
      3. Verify function calls `invoke('start_oauth_callback_server'` 
      4. Verify `open(authUrl)` is called AFTER invoke (sequential, not before)
    Expected Result: Function exists, returns correct shape, correct sequencing
    Failure Indicators: Missing function; wrong return type; browser opens before server starts
    Evidence: .sisyphus/evidence/task-2-flow-structure.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(auth): replace code-paste with localhost OAuth callback + token refresh`
  - Files: `ogre-desktop/src/lib/oauth.ts`
  - Pre-commit: `npm run build`

- [ ] 3. Update Settings.svelte + SetupWizard.svelte (Remove Code-Paste UI)

  **What to do**:
  - **In `ogre-desktop/src/pages/Settings.svelte`**:
    1. Remove `CodePasteFlowResult` import (line 19) — it no longer exists in oauth.ts.
    2. Remove `claudeFlow` state variable (line 64) and `claudeCodeInput` state variable (line 65).
    3. Update the `startAuth()` function's anthropic case (lines 237-241): instead of calling `startClaudeCodePasteFlow()`, call `startClaudeOAuthFlow()` and pass the result to `handleDeviceFlow()` — same as GitHub/Google cases.
    4. Remove `submitClaudeCode()` function entirely (lines 289-317).
    5. Remove the `cancelAuth()` anthropic-specific clause that references `claudeFlow` (lines 320-322) — cancellation is now handled via `DeviceFlowResult.cancel()` like other providers.
    6. Remove the "CLAUDE CODE PASTE ACTIVE" template block (lines 580-592) — the code paste input, submit button, and cancel button.
  - **In `ogre-desktop/src/pages/SetupWizard.svelte`** (same changes, different line numbers):
    1. Remove `CodePasteFlowResult` import (line 8).
    2. Remove `claudeFlow` state variable (line 28) and `claudeCodeInput` state variable (line 29).
    3. Update `startAuth()` anthropic case (lines 131-134): call `startClaudeOAuthFlow()` → `handleDeviceFlow()`.
    4. Remove `submitClaudeCode()` function (lines 177-204).
    5. Remove `cancelAuth()` claude-specific clause (lines 207-209).
    6. Remove the code paste UI template block (lines 477-485).
  - **Verify**: After changes, both files should import `startClaudeOAuthFlow` from oauth.ts and treat Anthropic auth exactly like GitHub/Google (call startAuth → handleDeviceFlow → done).

  **Must NOT do**:
  - Do not touch the GitHub, Google, or OpenAI auth cases in either file.
  - Do not modify `handleDeviceFlow()` — the new Claude flow returns a compatible object.
  - Do not add any new UI for Claude auth — the existing device flow polling UI covers it.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward removal of old code and one-line replacement. No complex logic — just deleting dead code and changing one function call.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing needed — build verification is sufficient.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 2)
  - **Blocks**: Task 5 (Final Verification)
  - **Blocked By**: Task 2 (needs `startClaudeOAuthFlow` to exist in oauth.ts)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Settings.svelte:237-241` — Current anthropic case in `startAuth()` to be rewritten.
  - `ogre-desktop/src/pages/Settings.svelte:242-254` — GitHub case in `startAuth()` — this is the EXACT pattern Claude should follow after the change.
  - `ogre-desktop/src/pages/SetupWizard.svelte:131-134` — Current anthropic case (same change as Settings).
  - `ogre-desktop/src/pages/SetupWizard.svelte:135-147` — GitHub case (pattern to follow).

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts` — New `startClaudeOAuthFlow()` export that returns `DeviceFlowResult`.
  - `ogre-desktop/src/pages/Settings.svelte:260-288` — `handleDeviceFlow()` function that the Claude result will be passed to.

  **WHY Each Reference Matters**:
  - The GitHub auth case in `startAuth()` shows the exact 3-line pattern: call start function → get result → pass to handleDeviceFlow. Claude's case should become identical.
  - The `handleDeviceFlow()` function shows what shape of object it expects (DeviceFlowResult with poll/cancel).

  **Acceptance Criteria**:
  - [ ] `npm run build` in ogre-desktop succeeds with 0 errors
  - [ ] `grep -r "CodePasteFlowResult" ogre-desktop/src/pages/` returns 0 matches
  - [ ] `grep -r "claudeCodeInput" ogre-desktop/src/pages/` returns 0 matches
  - [ ] `grep -r "submitClaudeCode" ogre-desktop/src/pages/` returns 0 matches
  - [ ] `grep -r "claudeFlow" ogre-desktop/src/pages/` returns 0 matches
  - [ ] `grep "startClaudeOAuthFlow" ogre-desktop/src/pages/Settings.svelte` returns 1+ matches
  - [ ] `grep "startClaudeOAuthFlow" ogre-desktop/src/pages/SetupWizard.svelte` returns 1+ matches

  **QA Scenarios:**

  ```
  Scenario: All code-paste artifacts removed from Svelte files
    Tool: Bash (grep)
    Preconditions: Task 3 code changes complete
    Steps:
      1. Run `grep -rn "CodePasteFlowResult\|claudeCodeInput\|submitClaudeCode\|claudeFlow" ogre-desktop/src/pages/`
      2. Expect 0 matches
      3. Run `grep -c "startClaudeOAuthFlow" ogre-desktop/src/pages/Settings.svelte`
      4. Expect 1+
      5. Run `grep -c "startClaudeOAuthFlow" ogre-desktop/src/pages/SetupWizard.svelte`
      6. Expect 1+
    Expected Result: Zero old artifacts, new function referenced in both files
    Failure Indicators: Any grep match for removed artifacts; missing startClaudeOAuthFlow references
    Evidence: .sisyphus/evidence/task-3-artifact-removal.txt

  Scenario: Svelte build succeeds after UI cleanup
    Tool: Bash
    Preconditions: Task 2 complete (oauth.ts exports startClaudeOAuthFlow)
    Steps:
      1. Run `npm run build` in ogre-desktop/
      2. Check exit code is 0
    Expected Result: Build succeeds with 0 errors
    Failure Indicators: Build errors referencing removed imports or missing exports
    Evidence: .sisyphus/evidence/task-3-build-check.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(auth): replace code-paste with localhost OAuth callback + token refresh`
  - Files: `ogre-desktop/src/pages/Settings.svelte`, `ogre-desktop/src/pages/SetupWizard.svelte`
  - Pre-commit: `npm run build`

- [ ] 4. Grading Server Bearer Token + Beta Header

  **What to do**:
  - In `grading-server/providers.js`, modify `buildAnthropicRequest()` to:
    1. **Detect Bearer vs API-key auth**: Check if the credentials object has a `token_type` of `"bearer"` (or if the key starts with a known pattern). Currently the function hardcodes `"x-api-key": credentials.key` — this only works for API keys, not OAuth Bearer tokens.
    2. **Use correct auth header**: If Bearer token, use `"Authorization": "Bearer ${credentials.key}"`. If API key, keep existing `"x-api-key": credentials.key`.
    3. **Add beta header for Bearer auth**: When using Bearer token, add `"anthropic-beta": "oauth-2025-04-20"` to the request headers. This header is REQUIRED for OAuth-based API access.
    4. **Do NOT add beta header for API keys** — it's only needed for OAuth Bearer tokens.
  - In `grading-server/bundle.js`, apply the SAME changes to the `buildAnthropicRequest()` function (it's a compiled copy around lines 2737-2764).
  - The credential sync from `provider-sync.ts` already pushes `key` and `token_type` to the grading server — no changes needed on the sync side.

  **Must NOT do**:
  - Do not touch non-Anthropic request builders (OpenAI, Google, GitHub, Ollama).
  - Do not change the overall request/response shape — only the headers.
  - Do not add token refresh to the grading server — that's handled in oauth.ts (Task 2) and synced via `pushProvidersToServer()`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused header change in a single function — two files but identical change.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5 (Final Verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `grading-server/providers.js` — `buildAnthropicRequest()` function, currently hardcodes `"x-api-key"`. This is the target function.
  - `grading-server/bundle.js:2737-2764` — Compiled copy of `buildAnthropicRequest()` (same changes needed).

  **API/Type References**:
  - `ogre-desktop/src/lib/provider-sync.ts` — `pushProvidersToServer()` sends credential objects with `key` and `token_type` fields. The grading server receives these.
  - Anthropic API docs: Bearer auth requires `Authorization: Bearer <token>` + `anthropic-beta: oauth-2025-04-20` header.

  **WHY Each Reference Matters**:
  - `providers.js` shows the current hardcoded header pattern that needs conditional logic.
  - `provider-sync.ts` confirms what credential shape arrives at the grading server (so you know what fields to check for Bearer vs API-key detection).

  **Acceptance Criteria**:
  - [ ] `grep "anthropic-beta" grading-server/providers.js` returns 1+ matches
  - [ ] `grep "Authorization.*Bearer" grading-server/providers.js` returns 1+ matches (case-insensitive)
  - [ ] `grep "anthropic-beta" grading-server/bundle.js` returns 1+ matches
  - [ ] `grep "x-api-key" grading-server/providers.js` still returns 1+ matches (API key path preserved)

  **QA Scenarios:**

  ```
  Scenario: Grading server supports both auth methods
    Tool: Bash (grep)
    Preconditions: Task 4 code changes complete
    Steps:
      1. Grep for `anthropic-beta` in grading-server/providers.js — expect 1+ matches
      2. Grep for `Bearer` in grading-server/providers.js — expect 1+ matches
      3. Grep for `x-api-key` in grading-server/providers.js — expect 1+ matches (preserved)
      4. Grep for `anthropic-beta` in grading-server/bundle.js — expect 1+ matches
      5. Grep for `Bearer` in grading-server/bundle.js — expect 1+ matches
    Expected Result: Both Bearer and API-key paths present in both files
    Failure Indicators: Missing Bearer path; missing beta header; x-api-key removed (should be kept)
    Evidence: .sisyphus/evidence/task-4-grading-server-headers.txt

  Scenario: Conditional logic present (not always Bearer)
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Grep for `token_type` or `bearer` (lowercase) in providers.js — expect conditional check
      2. Verify both x-api-key and Authorization: Bearer paths exist (if/else pattern)
    Expected Result: Conditional auth header selection based on token_type
    Failure Indicators: Only one auth path (always Bearer or always API key)
    Evidence: .sisyphus/evidence/task-4-conditional-auth.txt
  ```

  **Commit**: YES
  - Message: `fix(grading-server): add anthropic-beta header and Bearer token support`
  - Files: `grading-server/providers.js`, `grading-server/bundle.js`
  - Pre-commit: None (no build step for grading server)

## Final Verification Wave

- [ ] F1. **Full Build + Artifact Verification** — `quick`
  Read the plan end-to-end. Run:
  1. `cargo build` in `ogre-desktop/src-tauri/` — must succeed with 0 errors
  2. `npm run build` in `ogre-desktop/` — must succeed with 0 errors
  3. Grep verification:
     - `grep -r "CodePasteFlowResult" ogre-desktop/src/` → 0 matches
     - `grep -r "claudeCodeInput" ogre-desktop/src/pages/` → 0 matches
     - `grep -r "submitClaudeCode" ogre-desktop/src/pages/` → 0 matches
     - `grep "anthropic-beta" ogre-desktop/src/lib/oauth.ts` → 1+ matches
     - `grep "anthropic-beta" grading-server/providers.js` → 1+ matches
     - `grep "start_oauth_callback" ogre-desktop/src-tauri/src/lib.rs` → 1+ matches
     - `grep "refreshAnthropicToken\|getValidAnthropicToken" ogre-desktop/src/lib/oauth.ts` → 2+ matches
     - `grep "localhost.*callback" ogre-desktop/src/lib/oauth.ts` → 1+ matches
  Output: `Build [PASS/FAIL] | Artifacts Removed [N/N] | New Code Present [N/N] | VERDICT`

---

## Commit Strategy

- **Wave 1 commit**: `feat(auth): add Rust OAuth callback server command` — `src-tauri/src/lib.rs`
- **Wave 1 commit**: `fix(grading-server): add anthropic-beta header and Bearer token support` — `grading-server/providers.js`
- **Wave 2 commit**: `feat(auth): replace code-paste with localhost OAuth callback + token refresh` — `ogre-desktop/src/lib/oauth.ts`, `ogre-desktop/src/pages/Settings.svelte`, `ogre-desktop/src/pages/SetupWizard.svelte`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop/src-tauri && cargo build    # Expected: Compiling... Finished
cd ogre-desktop && npm run build            # Expected: build complete, 0 errors
```

### Final Checklist
- [ ] Automatic OAuth callback (no paste step)
- [ ] Token refresh before expiry
- [ ] anthropic-beta header on Bearer calls
- [ ] CodePasteFlowResult fully removed
- [ ] Claude auth uses same DeviceFlowResult pattern as other providers
- [ ] Grading server handles Bearer tokens correctly
- [ ] All builds pass
