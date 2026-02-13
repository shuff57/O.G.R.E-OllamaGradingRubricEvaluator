# Fix Desktop OAuth: Replace Deep-Link Flow with OpenCode-Style Auth

## TL;DR

> **Quick Summary**: The desktop app's OAuth buttons use a broken deep-link redirect flow. Replace with **OpenCode-style auth** for all 4 providers — each using the same flow type as OpenCode's official plugins. User clicks "Sign in" → provider-specific flow → app gets token automatically.
> 
> **Auth flows per provider** (matching OpenCode exactly):
> - **GitHub**: Device flow (RFC 8628) — show code, user enters at github.com/login/device, app polls → token
> - **ChatGPT/OpenAI**: OpenAI device flow — show code, user enters at auth.openai.com/codex/device, app polls → token  
> - **Claude/Anthropic**: PKCE code-paste — browser opens, user copies auth code, pastes back into app → token exchange
> - **Google Gemini**: Google device flow (TV/Limited Input) — show code, user enters at google.com/device, app polls → token
> 
> **Deliverables**:
> - Rewritten `oauth.ts` — 4 provider auth flows modeled on OpenCode's plugins
> - Updated `SetupWizard.svelte` — auth flow UI (device code display OR code-paste input per provider)
> - Updated `Settings.svelte` — same auth flow UI
> - Cleaned `lib.rs` — remove dead deep-link handler code
> - Cleaned `Cargo.toml` — remove `tauri-plugin-deep-link` dependency
> 
> **Estimated Effort**: Medium-Large (4-6 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (oauth.ts all 4 flows) → Task 2 + 3 (Svelte UI) → Task 4 (Rust cleanup) → Task 5 (build verify)

---

## Context

### Original Request
Fix the desktop app's OAuth sign-in so "Sign in with Google/GitHub" buttons actually work, using the same device flow authorization pattern as the Chrome extension and OpenCode.

### Interview Summary
**Key Discussions**:
- The Chrome extension's WORKING auth uses device flow: click "Sign in" → generates a code → user enters code in browser → app gets token
- User confirmed: "it generated a custom code after I clicked sign in then after I signed in I pasted the code" — this is device flow
- The desktop app's `oauth.ts` has a broken deep-link flow (`ogre://oauth/callback/...`) that was never completed
- User wants ALL 4 providers matched to OpenCode's exact auth pattern per provider
- Button labels must say **"Sign in with Google"** / **"Sign in with GitHub"** / **"Sign in with ChatGPT"** / **"Sign in with Claude"** (not "Get API Key")
- API key field should be marked **(optional)** so users don't think it's mandatory

**Research Findings**:
- **GitHub** — OpenCode `copilot.ts` device flow (RFC 8628):
  1. POST to `https://github.com/login/device/code` with `client_id` and `scope`
  2. Returns `device_code`, `user_code`, `verification_uri`, `interval`
  3. Display code to user, open browser to `verification_uri`
  4. Poll `https://github.com/login/oauth/access_token` with `device_code` + `grant_type=urn:ietf:params:oauth:grant-type:device_code`
  5. Handle `authorization_pending` (keep polling) and `slow_down` (increase interval by 5s per RFC 8628 §3.5)
  6. On success, receive `access_token`
  7. Public client — NO client secret needed
- **ChatGPT/OpenAI** — OpenCode `codex.ts` device flow:
  1. POST to `https://auth.openai.com/api/accounts/deviceauth/usercode` with `{ client_id }`
  2. Returns `{ device_auth_id, user_code, interval }` (note: `device_auth_id` not `device_code`)
  3. Open browser to `https://auth.openai.com/codex/device?user_code={user_code}`
  4. Poll `https://auth.openai.com/api/accounts/deviceauth/token` with `{ device_auth_id, grant_type: "device_code" }`
  5. On success, returns `{ id_token }` — this is a JWT
  6. Exchange `id_token` at `https://auth.openai.com/oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` + `subject_token={id_token}` + `subject_token_type=urn:ietf:params:oauth:token-type:id_token` + `audience=https://api.openai.com/v1`
  7. Returns final `{ access_token }` for API calls
  8. Public client — client ID: `app_EMoamEEZ73f0CkXaXp7hrann` (OpenCode's — O.G.R.E may reuse or register own)
- **Claude/Anthropic** — OpenCode `opencode-anthropic-auth/index.mjs` PKCE code-paste flow:
  1. Generate PKCE `code_verifier` (random 128 chars) + `code_challenge` (SHA-256 base64url of verifier)
  2. Generate random `state` parameter
  3. Open browser to `https://claude.ai/oauth/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri=http://localhost&code_challenge={challenge}&code_challenge_method=S256&scope=org:create_api_key&state={state}`
  4. User authorizes → browser redirects to `http://localhost?code=...` → user copies the `code` from the URL
  5. User pastes code back into the app (text input field)
  6. App exchanges code at `https://console.anthropic.com/v1/oauth/token` with `{ grant_type: "authorization_code", client_id, code, redirect_uri: "http://localhost", code_verifier }`
  7. Returns `{ access_token }` for API calls
  8. Client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (OpenCode's — O.G.R.E may reuse or register own)
  9. Flow method: `"code"` (user must paste code manually — no auto-detection)
- **Google Gemini** — Google device flow (TV/Limited Input):
  1. POST to `https://oauth2.googleapis.com/device/code` with `client_id` and `scope`
  2. Returns `device_code`, `user_code`, `verification_url`, `interval`
  3. Display code to user, open browser to `verification_url`
  4. Poll `https://oauth2.googleapis.com/token` with `{ client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }`
  5. Same error handling as GitHub (authorization_pending, slow_down)
  6. Public client — NO client secret needed
  7. Requires Google Cloud Console OAuth client type: "TVs and Limited Input Devices"
- None of the flows require deep links, redirect URIs (except Claude's placeholder `http://localhost`), or a Vercel backend

### Metis Review
**Identified Gaps** (addressed):
- Device flow needs real Client IDs (but NOT secrets — these are public clients). GitHub and Google need new registrations; ChatGPT and Claude may reuse OpenCode's public client IDs.
- Google may restrict device flow to certain app types — needs "TVs and Limited Input Devices" OAuth client type
- Polling interval must respect server's `interval` field + RFC 8628 `slow_down` handling
- Need to handle timeout (user never completes auth) and cancellation (user clicks cancel)
- ChatGPT flow has a two-step token exchange (device flow → id_token → token exchange → access_token) — must implement both steps
- Claude flow requires PKCE crypto (SHA-256 + base64url) — must use Web Crypto API (available in Tauri WebView)
- Claude flow requires a paste-back UI (text input + "Submit Code" button) unlike the device flows (which auto-poll)

---

## Work Objectives

### Core Objective
Replace the broken deep-link OAuth flow with OpenCode-style authentication for all 4 AI providers — GitHub (device flow), ChatGPT/OpenAI (device flow), Claude/Anthropic (PKCE code-paste), and Google Gemini (device flow) — matching each provider's exact auth pattern from OpenCode.

### Concrete Deliverables
- `ogre-desktop/src/lib/oauth.ts` — 4 provider auth flows (GitHub device, ChatGPT device, Claude PKCE code-paste, Google device)
- `ogre-desktop/src/pages/SetupWizard.svelte` — auth flow UI: device code display for GitHub/ChatGPT/Google + code-paste input for Claude
- `ogre-desktop/src/pages/Settings.svelte` — same auth flow UI
- `ogre-desktop/src-tauri/src/lib.rs` — deep-link dead code removed
- `ogre-desktop/src-tauri/Cargo.toml` — `tauri-plugin-deep-link` dependency removed

### Definition of Done
- [ ] "Sign in with GitHub" initiates device flow, shows user code, polls for token
- [ ] "Sign in with ChatGPT" initiates OpenAI device flow, shows user code, polls for id_token, exchanges for access_token
- [ ] "Sign in with Claude" initiates PKCE flow, opens browser, accepts pasted auth code, exchanges for token
- [ ] "Sign in with Google" initiates device flow, shows user code, polls for token
- [ ] Device flows auto-open browser to verification URL
- [ ] Device flows poll and auto-complete when user authorizes
- [ ] Claude flow shows text input + "Submit Code" button for pasting auth code
- [ ] All tokens saved to SQLite `oauth_tokens` table
- [ ] `cargo check` passes after removing deep-link plugin
- [ ] `npm run build` succeeds for the Vite frontend
- [ ] No references to `ogre://`, `oauth-callback`, or deep-link remain in `src/`

### Must Have
- **"Sign in with Google"** / **"Sign in with GitHub"** / **"Sign in with ChatGPT"** / **"Sign in with Claude"** button labels
- **Device flow UI** (GitHub, ChatGPT, Google): display user code + verification URL + auto-open browser + polling spinner + cancel button
- **Code-paste UI** (Claude): open browser + text input for pasting auth code + "Submit Code" button
- Polling with proper interval handling (RFC 8628 `slow_down` support)
- ChatGPT two-step token exchange (device flow → id_token → token exchange → access_token)
- Claude PKCE crypto (code_verifier/code_challenge via Web Crypto API)
- Timeout handling (e.g. 5 minute max wait for device flows)
- Cancel button to abort polling / code-paste
- API key field labeled **(optional)** as fallback alternative for ALL providers
- Helper text: "Or paste an API key below if you already have one"
- Model list fetching works with obtained tokens
- Clean removal of deep-link dead code

### Must NOT Have (Guardrails)
- DO NOT keep the deep-link OAuth flow — it never worked, remove it entirely
- DO NOT touch Chrome extension files (`oauth-client.js`, `github-auth.js`, etc.)
- DO NOT touch Vercel backend files (`api/auth/**`) — they serve the extension
- DO NOT remove the `oauth_tokens` table from `db.ts` — reuse it for device flow tokens
- DO NOT change how Ollama provider works
- DO NOT require client secrets — device flow and PKCE use public clients only
- DO NOT use `Bun.sleep` — use standard `setTimeout`/`Promise` for polling (this is a browser/Tauri context, not Bun)
- DO NOT use `node:crypto` — use Web Crypto API (`crypto.subtle`) for PKCE SHA-256 (runs in Tauri WebView)

---

## Verification Strategy (MANDATORY)

> **AGENT-EXECUTABLE VERIFICATION**: All acceptance criteria are verified via build commands and static analysis (grep).
> The executing agent verifies code correctness by compiling, building, and checking for expected patterns.
>
> **Manual QA (post-plan)**: Actual sign-in flows require human interaction (entering device codes in browser,
> pasting auth codes from Claude). These are verified manually by the user AFTER `/start-work` completes.
> The plan's acceptance criteria focus on: code compiles, functions exist, correct URLs/patterns present,
> no forbidden patterns, builds succeed.

### Test Decision
- **Infrastructure exists**: YES (vitest in root)
- **Automated tests**: NO — UI/config changes, verified via build + grep
- **Framework**: N/A

### Client ID Strategy
- **ChatGPT/OpenAI**: Use OpenCode's public client ID `app_EMoamEEZ73f0CkXaXp7hrann` — it's a public client, reusable
- **Claude/Anthropic**: Use OpenCode's public client ID `9d1c250a-e61b-44d9-88ed-5944d1962f5e` — it's a public client, reusable
- **GitHub**: Requires O.G.R.E's own GitHub OAuth App registration — use placeholder constant `GITHUB_CLIENT_ID = "TODO_REGISTER_GITHUB_OAUTH_APP"` with a `// TODO:` comment explaining registration steps
- **Google**: Requires O.G.R.E's own Google OAuth Client registration (TV/Limited Input type) — use placeholder constant `GOOGLE_CLIENT_ID = "TODO_REGISTER_GOOGLE_OAUTH_CLIENT"` with a `// TODO:` comment explaining registration steps
- **Acceptance criteria updated**: grep checks for `YOUR_` (generic placeholder) → 0, but `TODO_REGISTER_` placeholders are allowed and expected for GitHub + Google until the user registers their own OAuth apps

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Rewrite oauth.ts with device flow

Wave 2 (After Wave 1 — depends on new oauth.ts exports):
├── Task 2: Update SetupWizard.svelte with device flow UI
├── Task 3: Update Settings.svelte with device flow UI
└── Task 4: Remove deep-link from lib.rs + Cargo.toml

Wave 3 (After Wave 2):
└── Task 5: Full build verification

Critical Path: Task 1 → Tasks 2,3 → Task 5
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | None (foundational) |
| 2 | 1 | 5 | 3, 4 |
| 3 | 1 | 5 | 2, 4 |
| 4 | None | 5 | 2, 3 |
| 5 | 2, 3, 4 | None (final) | None |

---

## TODOs

- [ ] 1. Rewrite `oauth.ts` — Implement all 4 provider auth flows

  **What to do**:

  **Step 1: Remove all deep-link OAuth machinery**
  - Remove `listen` import from `@tauri-apps/api/event`
  - Remove `saveOAuthToken`, `getOAuthToken`, `deleteOAuthToken` imports (will re-add `saveOAuthToken` for tokens)
  - Remove constants: `OAUTH_BACKEND_URL`, `GOOGLE_CLIENT_ID` (placeholder), `GITHUB_CLIENT_ID` (placeholder), `GOOGLE_REDIRECT_URI`, `GITHUB_REDIRECT_URI`
  - Remove functions: `signInWithGoogle()`, `signInWithGitHub()`, `signOut()` (the deep-link versions)
  - **Keep**: `import { open } from "@tauri-apps/plugin-shell"` (used to open browser for all providers)

  **Step 2: Add shared types and helpers**
  - Add `DeviceFlowResult` type:
    ```typescript
    interface DeviceFlowResult {
      userCode: string;
      verificationUrl: string;
      poll: () => Promise<{ success: boolean; accessToken?: string; error?: string }>;
      cancel: () => void;
    }
    ```
  - Add `CodePasteFlowResult` type (for Claude):
    ```typescript
    interface CodePasteFlowResult {
      authUrl: string;
      exchangeCode: (code: string) => Promise<{ success: boolean; accessToken?: string; error?: string }>;
      cancel: () => void;
    }
    ```
  - Add `sleep(ms)` helper: `const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))`
  - Add PKCE helper functions (for Claude):
    ```typescript
    function generateCodeVerifier(): string // 128 random chars from [A-Za-z0-9-._~]
    async function generateCodeChallenge(verifier: string): Promise<string> // SHA-256 → base64url (using crypto.subtle)
    function generateState(): string // 32 random hex chars
    ```

  **Step 3: Add GitHub device flow** — modeled on OpenCode's `copilot.ts`
  - Constants:
    - `GITHUB_CLIENT_ID = "TODO_REGISTER_GITHUB_OAUTH_APP"` — placeholder until user registers GitHub OAuth App (see Flagged Follow-ups). Add `// TODO: Register a GitHub OAuth App at https://github.com/settings/applications/new with device flow enabled, then replace this value`
    - `GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"`
    - `GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"`
  - Function `startGitHubDeviceFlow(): Promise<DeviceFlowResult>`:
    1. POST to `GITHUB_DEVICE_CODE_URL` with `client_id` and `scope: "read:user"` (form-urlencoded, `Accept: application/json`)
    2. Parse response: `{ device_code, user_code, verification_uri, interval }`
    3. Open browser to `verification_uri` via `open()`
    4. Return `DeviceFlowResult` with:
       - `poll()`: POST to `GITHUB_ACCESS_TOKEN_URL` with `{ client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }` (form-urlencoded, `Accept: application/json`)
         - `authorization_pending` → wait `interval` seconds + 3s safety margin, retry
         - `slow_down` → increase interval by 5s per RFC 8628 §3.5
         - On `access_token` → save to `oauth_tokens` table via `saveOAuthToken("github", access_token)`, return success
         - Timeout after 5 minutes → return error
       - `cancel()`: sets flag to stop polling loop

  **Step 4: Add ChatGPT/OpenAI device flow** — modeled on OpenCode's `codex.ts`
  - Constants:
    - `OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"` (OpenCode's public client — OR register own)
    - `OPENAI_DEVICE_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode"`
    - `OPENAI_DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token"`
    - `OPENAI_TOKEN_EXCHANGE_URL = "https://auth.openai.com/oauth/token"`
    - `OPENAI_AUDIENCE = "https://api.openai.com/v1"`
  - Function `startChatGPTDeviceFlow(): Promise<DeviceFlowResult>`:
    1. POST to `OPENAI_DEVICE_CODE_URL` with `{ client_id: OPENAI_CLIENT_ID }` (JSON body, `Content-Type: application/json`)
    2. Parse response: `{ device_auth_id, user_code, interval }` (note: `device_auth_id`, NOT `device_code`)
    3. Open browser to `https://auth.openai.com/codex/device?user_code=${user_code}` via `open()`
    4. Return `DeviceFlowResult` with:
       - `userCode`: the `user_code` from step 2
       - `verificationUrl`: `https://auth.openai.com/codex/device?user_code=${user_code}`
       - `poll()`:
         a. Poll `OPENAI_DEVICE_TOKEN_URL` with `{ device_auth_id, grant_type: "device_code" }` (JSON body)
         b. Handle `authorization_pending` → wait `interval` seconds, retry
         c. On success, receive `{ id_token }` (this is a JWT, NOT the final access token)
         d. **Token exchange step**: POST to `OPENAI_TOKEN_EXCHANGE_URL` with form-urlencoded body:
            - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
            - `subject_token={id_token}`
            - `subject_token_type=urn:ietf:params:oauth:token-type:id_token`
            - `audience={OPENAI_AUDIENCE}`
            - `client_id={OPENAI_CLIENT_ID}`
         e. Parse response: `{ access_token }`
         f. Save to `oauth_tokens` table via `saveOAuthToken("openai", access_token)`, return success
         g. Timeout after 5 minutes → return error
       - `cancel()`: sets flag to stop polling loop

  **Step 5: Add Claude/Anthropic PKCE code-paste flow** — modeled on OpenCode's `opencode-anthropic-auth/index.mjs`
  - Constants:
    - `ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"` (OpenCode's public client — OR register own)
    - `ANTHROPIC_AUTH_URL = "https://claude.ai/oauth/authorize"`
    - `ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"`
    - `ANTHROPIC_REDIRECT_URI = "http://localhost"` (placeholder — user manually copies code from redirect)
    - `ANTHROPIC_SCOPE = "org:create_api_key"`
  - Function `startClaudeCodePasteFlow(): Promise<CodePasteFlowResult>`:
    1. Generate PKCE: `code_verifier` (128 random chars) + `code_challenge` (SHA-256 base64url via `crypto.subtle`)
    2. Generate random `state` parameter (32 hex chars)
    3. Build auth URL: `${ANTHROPIC_AUTH_URL}?response_type=code&client_id=${ANTHROPIC_CLIENT_ID}&redirect_uri=${encodeURIComponent(ANTHROPIC_REDIRECT_URI)}&code_challenge=${code_challenge}&code_challenge_method=S256&scope=${ANTHROPIC_SCOPE}&state=${state}`
    4. Open browser to auth URL via `open()`
    5. Return `CodePasteFlowResult` with:
       - `authUrl`: the constructed auth URL
       - `exchangeCode(code)`: 
         a. POST to `ANTHROPIC_TOKEN_URL` with JSON body: `{ grant_type: "authorization_code", client_id: ANTHROPIC_CLIENT_ID, code, redirect_uri: ANTHROPIC_REDIRECT_URI, code_verifier }`
         b. Parse response: `{ access_token }`
         c. Save to `oauth_tokens` table via `saveOAuthToken("anthropic", access_token)`, return success
         d. On error → return `{ success: false, error: message }`
       - `cancel()`: no-op (no polling to stop, just UI dismissal)

  **Step 6: Add Google Gemini device flow** — modeled on Google's device flow docs
  - Constants:
    - `GOOGLE_CLIENT_ID = "TODO_REGISTER_GOOGLE_OAUTH_CLIENT"` — placeholder until user registers Google OAuth Client (type: "TVs and Limited Input Devices") in Google Cloud Console. Add `// TODO: Create a Google OAuth Client at https://console.cloud.google.com/apis/credentials — select "TVs and Limited Input Devices" type, then replace this value`
    - `GOOGLE_DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code"`
    - `GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"`
    - `GOOGLE_SCOPE = "https://www.googleapis.com/auth/generative-language.retriever"`
  - Function `startGoogleDeviceFlow(): Promise<DeviceFlowResult>`:
    1. POST to `GOOGLE_DEVICE_CODE_URL` with form-urlencoded: `client_id` + `scope`
    2. Parse response: `{ device_code, user_code, verification_url, interval }`
    3. Open browser to `verification_url` via `open()`
    4. Return `DeviceFlowResult` with same polling pattern as GitHub:
       - Poll `GOOGLE_TOKEN_URL` with form-urlencoded: `{ client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }`
       - Same `authorization_pending` / `slow_down` / timeout handling
       - On `access_token` → save via `saveOAuthToken("google", access_token)`, return success

  **Step 7: Update model fetching**
  - Rewrite `fetchAvailableModels(provider, token)` to work with all provider tokens:
    - GitHub: `fetch("https://models.github.ai/inference/v1/models", { headers: { Authorization: "Bearer ${token}" } })`
    - ChatGPT/OpenAI: `fetch("https://api.openai.com/v1/models", { headers: { Authorization: "Bearer ${token}" } })`
    - Claude/Anthropic: `fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": token, "anthropic-version": "2023-06-01" } })`
    - Google: `fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { Authorization: "Bearer ${token}" } })`

  **Step 8: Add signOut**
  - `signOut(provider: string)` — delete token from `oauth_tokens` table via `deleteOAuthToken(provider)`

  **Must NOT do**:
  - Do NOT use `Bun.sleep` — use `new Promise(resolve => setTimeout(resolve, ms))` for polling delays
  - Do NOT use `node:crypto` — use Web Crypto API (`crypto.subtle`) for PKCE SHA-256
  - Do NOT hardcode client secrets — device flow and PKCE use public clients only
  - Do NOT keep any deep-link or Vercel backend code
  - Do NOT use `crypto.randomUUID()` for PKCE — use `crypto.getRandomValues()` for full code_verifier charset

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core auth logic rewrite with 4 different flow patterns, polling, PKCE crypto, RFC compliance, two-step token exchange
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundational — other tasks import from this)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:

  **Pattern References** (OpenCode source — primary reference for each flow):
  - `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/plugin/copilot.ts` — **GitHub device flow**:
    - Lines 189-206: POST to device code URL, parse response
    - Lines 208-213: Return `verification_uri` and `user_code` to display
    - Lines 215-264: Polling loop with `authorization_pending` and `slow_down` handling
    - Line 5: `CLIENT_ID = "Ov23li8tweQw6odWQebz"` (OpenCode's — O.G.R.E needs its own)
    - Line 7: `OAUTH_POLLING_SAFETY_MARGIN_MS = 3000` — safety buffer for polling
  - `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/plugin/codex.ts` — **ChatGPT/OpenAI device flow**:
    - Device code request: POST to `auth.openai.com/api/accounts/deviceauth/usercode` with `{ client_id }`
    - Response: `{ device_auth_id, user_code, interval }` — note `device_auth_id` not `device_code`
    - Verification URL construction: `https://auth.openai.com/codex/device?user_code=${user_code}`
    - Polling: POST to `auth.openai.com/api/accounts/deviceauth/token` with `{ device_auth_id, grant_type: "device_code" }`
    - Two-step exchange: on success get `id_token` → exchange at `auth.openai.com/oauth/token` for final `access_token`
    - Client ID: `app_EMoamEEZ73f0CkXaXp7hrann`
  - `https://raw.githubusercontent.com/anomalyco/opencode-anthropic-auth/master/index.mjs` — **Claude/Anthropic PKCE code-paste**:
    - PKCE generation: `generateCodeVerifier()` (128 random chars) + `generateCodeChallenge()` (SHA-256 → base64url)
    - Auth URL construction with `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `scope=org:create_api_key`
    - Token exchange at `console.anthropic.com/v1/oauth/token` with `grant_type=authorization_code` + `code_verifier`
    - Client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
    - Flow returns `method: "code"` — user must manually copy/paste the auth code

  **API References** (endpoints for all 4 providers):
  - **GitHub**: `POST https://github.com/login/device/code` → `POST https://github.com/login/oauth/access_token`
  - **ChatGPT/OpenAI**: `POST https://auth.openai.com/api/accounts/deviceauth/usercode` → `POST https://auth.openai.com/api/accounts/deviceauth/token` → `POST https://auth.openai.com/oauth/token`
  - **Claude/Anthropic**: Browser to `https://claude.ai/oauth/authorize?...` → `POST https://console.anthropic.com/v1/oauth/token`
  - **Google**: `POST https://oauth2.googleapis.com/device/code` → `POST https://oauth2.googleapis.com/token`
  - RFC 8628: https://www.rfc-editor.org/rfc/rfc8628 — Device Authorization Grant spec
  - Google device flow docs: https://developers.google.com/identity/protocols/oauth2/limited-input-device

  **Existing code to gut and replace**:
  - `ogre-desktop/src/lib/oauth.ts` — entire file, replace deep-link flow with 4 provider auth flows
  - `ogre-desktop/src/lib/db.ts:196-257` — `oauth_tokens` table CRUD functions — KEEP and REUSE for all provider tokens

  **Acceptance Criteria**:

  - [ ] No deep-link imports remain: `grep -c "oauth-callback\|OAUTH_BACKEND_URL" ogre-desktop/src/lib/oauth.ts` → 0 (note: `ANTHROPIC_REDIRECT_URI = "http://localhost"` is allowed — it's not a deep-link)
  - [ ] All 4 flow functions exist: `grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/lib/oauth.ts` → 4
  - [ ] GitHub device code URL: `grep "github.com/login/device/code" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] OpenAI device code URL: `grep "auth.openai.com/api/accounts/deviceauth/usercode" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] OpenAI token exchange URL: `grep "auth.openai.com/oauth/token" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] Anthropic auth URL: `grep "claude.ai/oauth/authorize" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] Anthropic token URL: `grep "console.anthropic.com/v1/oauth/token" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] Google device code URL: `grep "oauth2.googleapis.com/device/code" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] PKCE functions present: `grep -cE "generateCodeVerifier|generateCodeChallenge|crypto.subtle" ogre-desktop/src/lib/oauth.ts` → at least 3
  - [ ] Polling grant type present: `grep "device_code" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] No `listen` import from event API: `grep "from.*api/event" ogre-desktop/src/lib/oauth.ts` → 0
  - [ ] No generic placeholder Client IDs: `grep -c "YOUR_" ogre-desktop/src/lib/oauth.ts` → 0 (note: `TODO_REGISTER_` placeholders for GitHub/Google are expected and allowed)
  - [ ] OpenAI real client ID present: `grep "app_EMoamEEZ73f0CkXaXp7hrann" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] Anthropic real client ID present: `grep "9d1c250a-e61b-44d9-88ed-5944d1962f5e" ogre-desktop/src/lib/oauth.ts` → match
  - [ ] GitHub/Google TODO placeholders have registration instructions: `grep -c "TODO:" ogre-desktop/src/lib/oauth.ts` → at least 2
  - [ ] No `Bun.sleep`: `grep -c "Bun.sleep" ogre-desktop/src/lib/oauth.ts` → 0
  - [ ] No `node:crypto`: `grep -c "node:crypto" ogre-desktop/src/lib/oauth.ts` → 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Deep-link code fully removed, all 4 provider flows present
    Tool: Bash
    Steps:
      1. Run: grep -cE "ogre://|oauth-callback|OAUTH_BACKEND|listen.*event" ogre-desktop/src/lib/oauth.ts
      2. Assert: output is "0"
      3. Run: grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/lib/oauth.ts
      4. Assert: output is "4" (all 4 functions defined)
      5. Run: grep -c "YOUR_" ogre-desktop/src/lib/oauth.ts
      6. Assert: output is "0" (no generic placeholders — TODO_REGISTER_ for GitHub/Google are allowed)
      7. Run: grep "app_EMoamEEZ73f0CkXaXp7hrann" ogre-desktop/src/lib/oauth.ts
      8. Assert: match (OpenAI real client ID present)
      9. Run: grep "9d1c250a-e61b-44d9-88ed-5944d1962f5e" ogre-desktop/src/lib/oauth.ts
      10. Assert: match (Anthropic real client ID present)
    Expected Result: All 4 auth flows implemented, deep-link code gone, real IDs for ChatGPT+Claude, TODO placeholders for GitHub+Google
    Evidence: grep output captured

  Scenario: ChatGPT two-step token exchange implemented
    Tool: Bash
    Steps:
      1. Run: grep -c "device_auth_id" ogre-desktop/src/lib/oauth.ts
      2. Assert: count >= 2 (used in request + polling)
      3. Run: grep -c "token-exchange" ogre-desktop/src/lib/oauth.ts
      4. Assert: count >= 1 (grant type for id_token → access_token exchange)
      5. Run: grep -c "id_token" ogre-desktop/src/lib/oauth.ts
      6. Assert: count >= 1 (intermediate JWT from device auth)
    Expected Result: Two-step ChatGPT exchange (device → id_token → access_token) implemented
    Evidence: grep output captured

  Scenario: Claude PKCE code-paste flow implemented
    Tool: Bash
    Steps:
      1. Run: grep -cE "generateCodeVerifier|generateCodeChallenge|code_verifier|code_challenge" ogre-desktop/src/lib/oauth.ts
      2. Assert: count >= 4
      3. Run: grep -c "crypto.subtle" ogre-desktop/src/lib/oauth.ts
      4. Assert: count >= 1 (Web Crypto API for SHA-256)
      5. Run: grep -c "claude.ai/oauth/authorize" ogre-desktop/src/lib/oauth.ts
      6. Assert: count >= 1
      7. Run: grep -c "exchangeCode" ogre-desktop/src/lib/oauth.ts
      8. Assert: count >= 1 (function for pasting code back)
    Expected Result: Claude PKCE flow with code-paste exchange implemented
    Evidence: grep output captured

  Scenario: No forbidden patterns used
    Tool: Bash
    Steps:
      1. Run: grep -c "Bun.sleep" ogre-desktop/src/lib/oauth.ts
      2. Assert: output is "0"
      3. Run: grep -c "node:crypto" ogre-desktop/src/lib/oauth.ts
      4. Assert: output is "0"
      5. Run: grep -cE "REDIRECT_URI.*ogre://|deep.link" ogre-desktop/src/lib/oauth.ts
      6. Assert: output is "0"
    Expected Result: No forbidden patterns (Bun.sleep, node:crypto, deep-link URIs)
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `refactor(desktop): replace broken deep-link OAuth with 4-provider auth (GitHub/ChatGPT/Claude/Google)`
  - Files: `ogre-desktop/src/lib/oauth.ts`

---

- [ ] 2. Update `SetupWizard.svelte` — Auth flow UI for all 4 providers

  **What to do**:
  - **Remove** imports of `signInWithGoogle`, `signInWithGitHub` from `../lib/oauth`
  - **Add** imports of `startGoogleDeviceFlow`, `startGitHubDeviceFlow`, `startChatGPTDeviceFlow`, `startClaudeCodePasteFlow`, `fetchAvailableModels` from `../lib/oauth`
  - **Remove** the `oauth: true` property from Google Gemini and GitHub Models provider definitions (lines 69, 81)
  - **Add** `authEnabled` property to provider definitions for ALL 4 providers: `google`, `github`, `openai`, `anthropic` — this replaces the old `oauth: true` and indicates the provider supports "Sign in with" flow
  - **Add** new state variables:
    - `deviceFlowState: Record<string, { userCode: string, verificationUrl: string, polling: boolean, error?: string } | null>` — tracks active device flows per provider (GitHub, ChatGPT, Google)
    - `codePasteState: Record<string, { authUrl: string, codeInput: string, exchanging: boolean, error?: string } | null>` — tracks active code-paste flows per provider (Claude)
  - **Replace** the OAuth sign-in button section (lines 299-313) with provider-specific auth UI:

    **For device-flow providers (GitHub, ChatGPT, Google):**
    - **Button**: "Sign in with {provider.name}" — calls the matching `start*DeviceFlow()` function
    - **When device flow is active** (code received, polling):
      - Display: "Enter this code: **XXXX-XXXX**" (large, prominent, copyable)
      - Display: "Go to: {verificationUrl}" (clickable link)
      - Show a "Waiting for authorization..." spinner/indicator
      - Show a "Cancel" button to abort
    - **When polling completes** (token received):
      - Show: "✅ Signed in" badge
      - Auto-fetch models via `fetchAvailableModels()`
    - **When error/timeout**:
      - Show error message + "Try again" button

    **For code-paste providers (Claude/Anthropic):**
    - **Button**: "Sign in with Claude" — calls `startClaudeCodePasteFlow()`
    - **When code-paste flow is active** (browser opened, waiting for code):
      - Display: "1. Sign in with Claude in the browser that just opened"
      - Display: "2. Copy the authorization code from the redirected URL"
      - Display: "3. Paste it below:"
      - Show a **text input** field for pasting the auth code
      - Show a **"Submit Code"** button — calls `exchangeCode(inputValue)`
      - Show a "Cancel" button to dismiss
    - **When exchanging** (code submitted, waiting for token):
      - Show "Exchanging code..." spinner
    - **When exchange completes** (token received):
      - Show: "✅ Signed in" badge
      - Auto-fetch models via `fetchAvailableModels()`
    - **When error**:
      - Show error message + "Try again" button

  - **Keep** the API key text input as a fallback for ALL providers, but label it **"API Key (optional)"** with helper text: "Or paste an API key below if you already have one"
  - **Keep** model dropdown — feed from `fetchAvailableModels()` after auth flow completes or after API key is entered
  - **Remove** `toggleAuthMethod()` function — auth flow + optional API key replaces the toggle

  **Must NOT do**:
  - Do NOT change how Ollama provider works
  - Do NOT remove the model dropdown
  - Do NOT change the step flow (Step 1→2→3→4)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex Svelte UI with two different auth flow UI patterns (device code + code-paste), multiple providers, reactive state management
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  - `ogre-desktop/src/pages/SetupWizard.svelte:285-314` — Current OAuth section to replace with auth flow UI
  - `ogre-desktop/src/pages/SetupWizard.svelte:316-324` — Existing API key pattern for non-OAuth providers (keep as optional fallback)
  - `ogre-desktop/src/pages/SetupWizard.svelte:355-370` — Model dropdown (keep, feed from auth flow token)
  - OpenCode UX patterns: device flow displays `user_code` prominently; Claude shows paste-back input
  - `ogre-desktop/src/lib/oauth.ts` — (after Task 1) exports `DeviceFlowResult` and `CodePasteFlowResult` types

  **Acceptance Criteria**:

  - [ ] No old OAuth references: `grep -c "oauthSignedIn\|signInWithGoogle\|signInWithGitHub" ogre-desktop/src/pages/SetupWizard.svelte` → 0
  - [ ] All 4 provider flow imports present: `grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/SetupWizard.svelte` → at least 4
  - [ ] "Sign in with" button text for all 4: `grep -c "Sign in with" ogre-desktop/src/pages/SetupWizard.svelte` → at least 4
  - [ ] Optional label on API key: `grep -i "optional" ogre-desktop/src/pages/SetupWizard.svelte` → at least 1
  - [ ] Device flow user code display: `grep -i "userCode\|user.code\|user_code" ogre-desktop/src/pages/SetupWizard.svelte` → at least 1
  - [ ] Code-paste text input for Claude: `grep -i "codePasteState\|exchangeCode\|Submit Code" ogre-desktop/src/pages/SetupWizard.svelte` → at least 1
  - [ ] Frontend builds: `cd ogre-desktop && npm run build` → succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All 4 provider auth UIs present in SetupWizard
    Tool: Bash
    Steps:
      1. Run: grep -cE "oauthSignedIn|signInWithGoogle|signInWithGitHub" ogre-desktop/src/pages/SetupWizard.svelte
      2. Assert: output is "0" (old OAuth removed)
      3. Run: grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/SetupWizard.svelte
      4. Assert: count >= 4 (all 4 flow functions referenced)
      5. Run: grep -c "Sign in with" ogre-desktop/src/pages/SetupWizard.svelte
      6. Assert: count >= 4 (buttons for all 4 providers)
      7. Run: grep -i "optional" ogre-desktop/src/pages/SetupWizard.svelte
      8. Assert: at least 1 match (API key labeled optional)
    Expected Result: All 4 auth flow UIs present, old OAuth gone, API key optional
    Evidence: grep output captured

  Scenario: Claude code-paste UI distinct from device flow UI
    Tool: Bash
    Steps:
      1. Run: grep -cE "codePasteState|exchangeCode|Submit Code|Paste.*code|authorization code" ogre-desktop/src/pages/SetupWizard.svelte
      2. Assert: count >= 2 (code-paste UI elements present)
      3. Run: grep -cE "userCode|verification.*url|Waiting for authorization" ogre-desktop/src/pages/SetupWizard.svelte
      4. Assert: count >= 2 (device flow UI elements present)
    Expected Result: Both UI patterns (device code display + code paste input) exist
    Evidence: grep output captured
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(desktop): add auth flow UI for all 4 providers (device flow + code paste)`
  - Files: `ogre-desktop/src/pages/SetupWizard.svelte`, `ogre-desktop/src/pages/Settings.svelte`

---

- [ ] 3. Update `Settings.svelte` — Auth flow UI for all 4 providers

  **What to do**:
  - Same changes as Task 2 but for `Settings.svelte`:
  - **Remove** `oauthStatus` record, `useApiKey` record, `checkOAuthStatus()`, `handleOAuthSignIn()`, `handleSignOut()` functions
  - **Remove** imports of `signInWithGoogle`, `signInWithGitHub`, `signOut` from `../lib/oauth`
  - **Remove** import of `getOAuthToken` from `../lib/db`
  - **Add** imports of `startGoogleDeviceFlow`, `startGitHubDeviceFlow`, `startChatGPTDeviceFlow`, `startClaudeCodePasteFlow`, `fetchAvailableModels`, `signOut` from `../lib/oauth`
  - **Add** auth flow state tracking (same `deviceFlowState` + `codePasteState` pattern as SetupWizard)
  - **Replace** the OAuth section (lines 246-277) with provider-specific auth UI:
    - **Device flow providers** (GitHub, ChatGPT, Google): "Sign in with {name}" button → code display + verification URL + polling indicator + cancel button → ✅ Signed in badge
    - **Code-paste provider** (Claude): "Sign in with Claude" button → browser opens → paste instructions + text input + "Submit Code" button → ✅ Signed in badge
  - **Keep** API key input as fallback for ALL providers, labeled **(optional)**: "Or paste an API key below if you already have one"
  - **Update** model fetching section to work with auth flow tokens from all providers
  - **Remove** `oauth: true` from provider option definitions (lines 27-32); replace with `authEnabled: true`
  - **Remove** OAuth-specific CSS (lines 697-740); replace with auth flow CSS

  **Must NOT do**:
  - Do NOT change how Ollama provider works
  - Do NOT remove the "Add New Provider" functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Same complexity as Task 2 — parallel Svelte UI work with two auth flow patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  - `ogre-desktop/src/pages/Settings.svelte:246-277` — Current OAuth section to replace
  - `ogre-desktop/src/pages/Settings.svelte:278-283` — API key input pattern (keep as optional fallback)
  - `ogre-desktop/src/pages/Settings.svelte:27-32` — Provider option definitions with `oauth: true` to remove
  - `ogre-desktop/src/pages/Settings.svelte:63-103` — OAuth functions to remove
  - `ogre-desktop/src/pages/Settings.svelte:697-740` — OAuth CSS to remove/update
  - `ogre-desktop/src/lib/oauth.ts` — (after Task 1) exports all flow functions + types

  **Acceptance Criteria**:

  - [ ] No old OAuth references: `grep -c "oauthStatus\|signInWithGoogle\|signInWithGitHub\|getOAuthToken\|oauth: true" ogre-desktop/src/pages/Settings.svelte` → 0
  - [ ] All 4 provider flow imports present: `grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/Settings.svelte` → at least 4
  - [ ] Optional label on API key: `grep -i "optional" ogre-desktop/src/pages/Settings.svelte` → at least 1
  - [ ] Claude code-paste UI: `grep -cE "codePasteState|exchangeCode|Submit Code" ogre-desktop/src/pages/Settings.svelte` → at least 1
  - [ ] Frontend builds: `cd ogre-desktop && npm run build` → succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All 4 provider auth UIs present in Settings
    Tool: Bash
    Steps:
      1. Run: grep -cE "oauthStatus|signInWithGoogle|signInWithGitHub|getOAuthToken" ogre-desktop/src/pages/Settings.svelte
      2. Assert: output is "0" (old OAuth removed)
      3. Run: grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/Settings.svelte
      4. Assert: count >= 4 (all 4 flow functions referenced)
      5. Run: grep -i "optional" ogre-desktop/src/pages/Settings.svelte
      6. Assert: at least 1 match (API key labeled optional)
      7. Run: grep -cE "codePasteState|exchangeCode" ogre-desktop/src/pages/Settings.svelte
      8. Assert: count >= 1 (Claude code-paste UI present)
    Expected Result: All 4 auth flow UIs present, old OAuth gone, API key optional
    Evidence: grep output captured
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(desktop): add auth flow UI for all 4 providers (device flow + code paste)`
  - Files: `ogre-desktop/src/pages/Settings.svelte`

---

- [ ] 4. Remove deep-link plugin from Rust backend

  **What to do**:
  - **In `lib.rs`**:
    - Remove `use tauri_plugin_deep_link::DeepLinkExt;` (line 6)
    - Remove `handle_uri_open()` function (lines 197-201)
    - Remove `.plugin(tauri_plugin_deep_link::init())` from the builder chain (line 274)
    - Remove the `app.deep_link().on_open_url(...)` block (lines 377-385)
    - Remove the `#[cfg(target_os = "macos")]` deep link handler in the `run` closure (lines 394-399)
  - **In `Cargo.toml`**:
    - Remove `tauri-plugin-deep-link = "2"` from `[dependencies]` (line 23)
  - **Do NOT change** anything else — sidecar lifecycle, tray menu, SQL migrations, etc. stay as-is
  - **Do NOT remove** the `oauth_tokens` migration (Migration 4) — it's reused for device flow tokens

  **Must NOT do**:
  - Do NOT remove any other plugins
  - Do NOT modify sidecar spawn logic
  - Do NOT modify tray menu logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted Rust code removal
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  - `ogre-desktop/src-tauri/src/lib.rs:6` — `use tauri_plugin_deep_link::DeepLinkExt;` to remove
  - `ogre-desktop/src-tauri/src/lib.rs:197-201` — `handle_uri_open()` function to remove
  - `ogre-desktop/src-tauri/src/lib.rs:274` — `.plugin(tauri_plugin_deep_link::init())` to remove
  - `ogre-desktop/src-tauri/src/lib.rs:377-385` — `app.deep_link().on_open_url(...)` to remove
  - `ogre-desktop/src-tauri/src/lib.rs:394-399` — macOS deep link handler to remove
  - `ogre-desktop/src-tauri/Cargo.toml:23` — `tauri-plugin-deep-link = "2"` to remove

  **Acceptance Criteria**:

  - [ ] No deep-link references: `grep -c "deep_link\|DeepLinkExt\|handle_uri_open" ogre-desktop/src-tauri/src/lib.rs` → 0
  - [ ] No deep-link in Cargo.toml: `grep -c "deep-link" ogre-desktop/src-tauri/Cargo.toml` → 0
  - [ ] Rust compiles: `cd ogre-desktop/src-tauri && cargo check` → success

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Deep-link plugin fully removed and Rust compiles
    Tool: Bash
    Steps:
      1. Run: grep -cE "deep_link|DeepLinkExt|handle_uri_open" ogre-desktop/src-tauri/src/lib.rs
      2. Assert: output is "0"
      3. Run: grep -c "deep-link" ogre-desktop/src-tauri/Cargo.toml
      4. Assert: output is "0"
      5. Run: cd ogre-desktop/src-tauri && cargo check 2>&1 | tail -5
      6. Assert: output contains "Finished"
    Expected Result: Clean removal, Rust compiles
    Evidence: cargo check output captured
  ```

  **Commit**: YES
  - Message: `chore(desktop): remove unused tauri-plugin-deep-link dependency`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`, `ogre-desktop/src-tauri/Cargo.toml`

---

- [ ] 5. Full build verification

  **What to do**:
  - Run `cd ogre-desktop && npm run build` — verify Vite frontend builds
  - Run `cd ogre-desktop/src-tauri && cargo check` — verify Rust compiles
  - Comprehensive grep for orphaned references:
    - No `ogre://` in `ogre-desktop/src/`
    - No `oauth-callback` event references
    - No `OAUTH_BACKEND_URL`
    - No `deep_link` in Rust
    - No `YOUR_` placeholder Client IDs
  - Verify all 4 auth flow functions are exported and imported correctly across oauth.ts + both Svelte files

  **Must NOT do**:
  - Do NOT make code changes — verification only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (final)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 4

  **Acceptance Criteria**:

  - [ ] Vite build: `cd ogre-desktop && npm run build` → exit code 0
  - [ ] Rust compiles: `cd ogre-desktop/src-tauri && cargo check` → exit code 0
  - [ ] No orphans: `grep -r "ogre://\|oauth-callback\|OAUTH_BACKEND\|deep_link\|DeepLinkExt\|YOUR_" ogre-desktop/src/ ogre-desktop/src-tauri/src/` → 0 matches (note: `TODO_REGISTER_` is allowed in oauth.ts for GitHub/Google)
  - [ ] All 4 flow functions present in oauth.ts: `grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/lib/oauth.ts` → 4
  - [ ] All 4 flow functions imported in SetupWizard: `grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/SetupWizard.svelte` → at least 4
  - [ ] All 4 flow functions imported in Settings: `grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/Settings.svelte` → at least 4

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full project builds and no orphaned references
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npm run build 2>&1 | tail -5
      2. Assert: output contains "built in"
      3. Run: cd ogre-desktop/src-tauri && cargo check 2>&1 | tail -5
      4. Assert: output contains "Finished"
      5. Run: grep -r --include="*.ts" --include="*.svelte" --include="*.rs" -cE "ogre://|oauth-callback|OAUTH_BACKEND|deep_link|YOUR_" ogre-desktop/src/ ogre-desktop/src-tauri/src/ 2>/dev/null | grep -v ":0$"
      6. Assert: no output (all clean — TODO_REGISTER_ in oauth.ts is allowed and won't match this pattern)
    Expected Result: Clean build, no dead references
    Evidence: Build + grep output captured

  Scenario: All 4 auth flows wired end-to-end
    Tool: Bash
    Steps:
      1. Run: grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/lib/oauth.ts
      2. Assert: output is "4" (all 4 functions defined)
      3. Run: for f in SetupWizard.svelte Settings.svelte; do grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/$f; done
      4. Assert: each file has count >= 4 (all 4 imported/used)
      5. Run: grep -c "Sign in with" ogre-desktop/src/pages/SetupWizard.svelte
      6. Assert: count >= 4 (button for each provider)
    Expected Result: All 4 auth flows defined, imported, and wired to UI buttons
    Evidence: grep output captured
  ```

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task(s) | Message | Files | Verification |
|---------------|---------|-------|--------------|
| 1 | `refactor(desktop): replace broken deep-link OAuth with 4-provider auth (GitHub/ChatGPT/Claude/Google)` | `oauth.ts` | grep assertions |
| 2, 3 | `feat(desktop): add auth flow UI for all 4 providers (device flow + code paste)` | `SetupWizard.svelte`, `Settings.svelte` | `npm run build` |
| 4 | `chore(desktop): remove unused tauri-plugin-deep-link dependency` | `lib.rs`, `Cargo.toml` | `cargo check` |
| 5 | (no commit — verification only) | — | full build + grep |

---

## Success Criteria

### Verification Commands
```bash
# Frontend builds
cd ogre-desktop && npm run build

# Rust compiles
cd ogre-desktop/src-tauri && cargo check

# No deep-link traces or generic placeholders
grep -r "ogre://\|oauth-callback\|OAUTH_BACKEND\|deep_link\|YOUR_" ogre-desktop/src/ ogre-desktop/src-tauri/src/
# Expected: no matches (TODO_REGISTER_ placeholders in oauth.ts are allowed — different pattern)

# All 4 auth flow functions present
grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/lib/oauth.ts
# Expected: 4

# All 4 flows imported in Svelte files
grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/SetupWizard.svelte
grep -cE "startGitHubDeviceFlow|startChatGPTDeviceFlow|startClaudeCodePasteFlow|startGoogleDeviceFlow" ogre-desktop/src/pages/Settings.svelte
# Expected: at least 4 each

# Button labels correct
grep -r "Sign in with" ogre-desktop/src/pages/
# Expected: matches for Google, GitHub, ChatGPT, Claude

# Claude PKCE crypto present
grep -cE "generateCodeVerifier|generateCodeChallenge|crypto.subtle" ogre-desktop/src/lib/oauth.ts
# Expected: at least 3

# ChatGPT two-step exchange present
grep -cE "device_auth_id|token-exchange|id_token" ogre-desktop/src/lib/oauth.ts
# Expected: at least 3

# API key labeled optional
grep -ri "optional" ogre-desktop/src/pages/
# Expected: matches for all provider API key fields
```

### Final Checklist
- [ ] "Sign in with GitHub" button initiates device flow (RFC 8628)
- [ ] "Sign in with ChatGPT" button initiates OpenAI device flow with two-step token exchange
- [ ] "Sign in with Claude" button initiates PKCE flow with code-paste input
- [ ] "Sign in with Google" button initiates device flow
- [ ] Device flows (GitHub, ChatGPT, Google) show user code + verification URL + auto-open browser
- [ ] Device flows poll and auto-complete when user authorizes
- [ ] Claude flow opens browser + shows paste instructions + text input + "Submit Code" button
- [ ] Claude PKCE uses Web Crypto API (`crypto.subtle`) for SHA-256
- [ ] ChatGPT flow exchanges `id_token` for `access_token` via token-exchange grant
- [ ] All tokens saved to `oauth_tokens` SQLite table
- [ ] API key fields labeled "(optional)" for all providers
- [ ] Model fetching works with auth tokens from all 4 providers
- [ ] Deep-link plugin fully removed (Rust + Cargo.toml)
- [ ] Both frontend and Rust compile cleanly
- [ ] No orphaned references to removed code
- [ ] Chrome extension files untouched
- [ ] Vercel backend files untouched
- [ ] No `Bun.sleep` or `node:crypto` usage

---

## Flagged Follow-ups (NOT in this plan)

1. **Register OAuth Apps**: User needs to register a GitHub OAuth App (for device flow) and a Google OAuth Client (type: "TVs and Limited Input Devices") to get real Client IDs. ChatGPT/OpenAI and Claude/Anthropic may reuse OpenCode's public client IDs initially. This is a manual step outside the codebase.
2. **Google device flow restriction**: Google may require the OAuth client type to be "TVs and Limited Input Devices" for device flow to work. Verify in Google Cloud Console.
3. **Token refresh**: Auth tokens may expire — Google OAuth tokens expire in 1 hour, Anthropic/OpenAI tokens have varying lifetimes. A follow-up task should add automatic token refresh using `refresh_token` where available.
4. **Update DEPLOYMENT.md**: Remove "OAuth Flow (Tauri Deep Links)" section, replace with auth flow documentation covering all 4 providers.
5. **Update OAUTH_APP_SETUP.md**: Add instructions for registering OAuth apps for all 4 providers (device flow for GitHub/Google, PKCE for Claude, device flow for ChatGPT).
6. **Register O.G.R.E's own Client IDs**: Currently using OpenCode's public client IDs for ChatGPT and Claude — should register O.G.R.E's own when going to production.
