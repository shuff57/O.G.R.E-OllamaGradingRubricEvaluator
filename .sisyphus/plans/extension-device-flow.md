# Extension Device Flow Sign-In (When Desktop App Not Running)

## TL;DR

> **Quick Summary**: Port the device flow sign-in buttons from the O.G.R.E desktop app (Tauri) to the Chrome extension's sidepanel, so users can authenticate with GitHub, OpenAI, and Claude directly from the extension when the desktop app isn't running — instead of only having API key fields.
> 
> **Deliverables**:
> - New `device-flow.js` module with device flow logic for GitHub, OpenAI, and Claude
> - Updated `sidepanel.html` with sign-in buttons per provider (desktop-style UI)
> - Updated `sidepanel.js` with device flow state management and UI orchestration
> - Updated `background.js` to support `openTab` message for auto-opening verification URLs
> - Updated `providers.js` to consume OAuth tokens from device flow
> - Tests for device flow logic
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6

---

## Context

### Original Request
User wants the device flow sign-in buttons (currently only in the desktop app) to appear in the Chrome extension when the desktop app is not running. Currently the extension's "manual mode" only shows API key input fields.

### Interview Summary
**Key Discussions**:
- **Providers**: All three — GitHub (device code), OpenAI/ChatGPT (device code + token exchange), Claude/Anthropic (PKCE code-paste). Google excluded (client ID still TODO in desktop).
- **UI Layout**: Desktop-style — "Sign in with X" button as primary action, with "OR use API Key instead" toggle below.
- **Token Storage**: `chrome.storage.local` — extension-only, independent from desktop app.
- **Device Flow UX**: Show verification URL + user code inline in extension AND auto-open verification URL in a new Chrome tab.
- **Testing**: TDD with vitest.

**Research Findings**:
- Desktop `oauth.ts` uses `tauriFetch` (Tauri HTTP plugin) for CORS bypass — extension must use `proxyFetch` via `background.js` service worker instead.
- GitHub device flow uses the official GitHub CLI OAuth App client ID (`178c6fc778ccc68e1d6a`) — public, safe for any client.
- OpenAI uses a multi-step flow: device code → poll for `id_token` → token exchange for `access_token` (via `application/x-www-form-urlencoded`).
- Anthropic uses PKCE code-paste flow — opens auth URL in browser, user copies code back to extension.
- The `proxyFetch` in `background.js` passes `request.options` directly to `fetch()` — **`URLSearchParams` objects cannot be serialized through `chrome.runtime.sendMessage`** (they become `{}`). Must convert to string + set Content-Type header explicitly.

### Metis Review
**Identified Gaps** (addressed):
- **URLSearchParams serialization**: OpenAI token exchange and Anthropic code exchange use `URLSearchParams` body format. `chrome.runtime.sendMessage` cannot serialize `URLSearchParams` objects — they must be `.toString()`'d with explicit `Content-Type: application/x-www-form-urlencoded` header before calling `proxyFetch`. Plan includes this as a critical implementation detail.
- **Service worker lifecycle**: Manifest V3 service workers can become inactive during long device flow polling (5+ minutes). Plan includes keeping the polling logic in the sidepanel (which stays alive while open) rather than background.js.
- **Tab opening for verification URLs**: Current `background.js` doesn't have a `chrome.tabs.create` handler — need to add one or call `chrome.tabs.create` directly from sidepanel (it has `activeTab` permission). Plan uses `chrome.tabs.create()` directly from sidepanel.js since it's available in the extension context.
- **Concurrent flows**: User could click sign-in for multiple providers. Plan manages per-provider flow state to prevent conflicts.

---

## Work Objectives

### Core Objective
Enable device flow (OAuth) sign-in for GitHub, OpenAI, and Claude directly within the Chrome extension sidepanel when the desktop app is not running, so users don't need to manually find and paste API keys.

### Concrete Deliverables
- `device-flow.js` — New module: device flow logic for 3 providers (ported from desktop `oauth.ts`)
- `device-flow.test.js` — Tests for device flow logic
- `sidepanel.html` — Updated: sign-in buttons + device flow UI per provider
- `sidepanel.js` — Updated: device flow state management, UI toggling, token persistence
- `background.js` — Updated: support `application/x-www-form-urlencoded` body in proxyFetch (string body pass-through)
- `providers.js` — Updated: load OAuth tokens from chrome.storage.local when no API key is set

### Definition of Done
- [ ] When desktop app is NOT running, each provider tab (GitHub, OpenAI, Claude) shows a "Sign in with X" button as primary
- [ ] Clicking "Sign in" initiates device flow, shows user code + verification URL inline, and opens verification URL in a new tab
- [ ] After completing authorization, the token is stored in `chrome.storage.local` and the provider shows "Signed in" status
- [ ] "OR use API Key instead" toggle switches to the existing API key input field
- [ ] Existing API key flow still works unchanged
- [ ] When desktop app comes online, it takes over as before (device flow tokens remain in storage but desktop mode hides manual mode)
- [ ] All tests pass: `npx vitest run`

### Must Have
- Device flow for GitHub, OpenAI, Claude
- Desktop-style UI (sign-in primary, API key secondary)
- Inline code display + auto-open verification URL
- Token persistence in chrome.storage.local
- "Signed in" / "Sign out" state display
- Graceful handling of cancellation, timeout, and errors

### Must NOT Have (Guardrails)
- **NO Google device flow** — client ID not registered yet, out of scope
- **NO token sharing with desktop app** — extension tokens are independent
- **NO changes to desktop app code** — this is extension-only
- **NO `URLSearchParams` objects passed through `chrome.runtime.sendMessage`** — always `.toString()` first
- **NO device flow polling in background.js** — keep in sidepanel.js (service worker can go inactive)
- **NO breaking changes to existing API key flow** — sign-in is additive
- **NO new npm dependencies** — use native `fetch` via proxyFetch
- **NO modifications to the existing desktop connection flow** — `loadProviderConfig()` and `connectToDesktop()` remain unchanged

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (vitest.config.js, providers.test.js)
- **Automated tests**: TDD
- **Framework**: vitest

### If TDD Enabled

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**
1. **RED**: Write failing test first
   - Test command: `npx vitest run {file}`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `npx vitest run {file}`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Extension UI** | Playwright (playwright skill) | Load extension, navigate sidepanel, interact with buttons, assert DOM |
| **JS Module** | Bash (vitest) | Run tests, assert pass |
| **Background.js** | Bash (vitest) | Unit test proxyFetch body handling |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Background.js proxyFetch enhancement (URL-encoded body support)
└── Task 2: Device flow module (device-flow.js) — core logic with tests

Wave 2 (After Wave 1):
├── Task 3: Provider integration — providers.js OAuth token loading
├── Task 4: Sidepanel HTML — sign-in button UI markup
└── Task 5: Sidepanel JS — device flow state management & UI orchestration

Wave 3 (After Wave 2):
└── Task 6: Integration testing & end-to-end QA
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 5 | 2 (partially — tests can mock proxyFetch) |
| 2 | None (mocks proxyFetch) | 3, 5 | 1 |
| 3 | 2 | 5, 6 | 4 |
| 4 | None (HTML only) | 5 | 3 |
| 5 | 1, 2, 3, 4 | 6 | None |
| 6 | 5 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | task(category="unspecified-high", load_skills=[], run_in_background=false) |
| 2 | 3, 4, 5 | sequential: 3 → 4 → 5 |
| 3 | 6 | task(category="unspecified-high", load_skills=["playwright"], run_in_background=false) |

---

## TODOs

- [ ] 1. Enhance background.js proxyFetch to handle string bodies with explicit Content-Type

  **What to do**:
  - **RED**: Write test `background.test.js` that verifies:
    - When `proxyFetch` receives `options.body` as a string (not JSON object), it passes it through as-is
    - When `options.headers['Content-Type']` is `application/x-www-form-urlencoded`, the body string is sent correctly
    - Existing JSON body behavior is unchanged
  - **GREEN**: Update `background.js` — the current implementation already passes `request.options` through to `fetch()`, but verify it handles string bodies correctly. The key issue is that `proxyFetch` in `providers.js` uses `JSON.stringify(body)` for some calls — ensure the caller can pass pre-stringified bodies.
  - **REFACTOR**: Clean up, add JSDoc comment about body serialization

  **Must NOT do**:
  - Don't change the response format
  - Don't break existing JSON body calls

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused change to one file with clear scope
  - **Skills**: []
    - No special skills needed — pure JS logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `background.js:19-47` — Current `proxyFetch` handler. Note how `request.options` is spread into `fetch()`. The issue is on the *caller* side in `providers.js:21-54` where `proxyFetch()` sends options via `chrome.runtime.sendMessage`.
  - `providers.js:21-54` — `proxyFetch()` function that sends message to background.js. Bodies go through message serialization.

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts:155-249` — OpenAI device flow uses `URLSearchParams` body (line 218-224) and `application/json` body. The `URLSearchParams` body MUST be converted to `.toString()` before passing through `chrome.runtime.sendMessage`.
  - `ogre-desktop/src/lib/oauth.ts:285-296` — Anthropic token exchange uses JSON body — this works fine through message passing.

  **WHY Each Reference Matters**:
  - `background.js:19-47`: The actual handler we're verifying works with string bodies — need to confirm `fetch()` accepts string body with explicit Content-Type header
  - `providers.js:21-54`: The proxyFetch caller — we need to understand how options are serialized through `chrome.runtime.sendMessage` to ensure string bodies survive the journey
  - Desktop `oauth.ts`: Shows what body formats the device flow needs — JSON for most, URL-encoded for OpenAI token exchange

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/background.test.js`
  - [ ] Test covers: string body with `Content-Type: application/x-www-form-urlencoded` passes through correctly
  - [ ] Test covers: existing JSON body behavior unchanged
  - [ ] `npx vitest run tests/background.test.js` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify vitest runs background tests
    Tool: Bash
    Preconditions: Node modules installed
    Steps:
      1. Run: npx vitest run tests/background.test.js
      2. Assert: exit code 0
      3. Assert: output contains "Tests passed" or similar vitest success indicator
    Expected Result: All tests pass
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(background): support url-encoded body passthrough in proxyFetch`
  - Files: `background.js`, `tests/background.test.js`
  - Pre-commit: `npx vitest run tests/background.test.js`

---

- [ ] 2. Create device-flow.js module — device flow logic for GitHub, OpenAI, and Claude

  **What to do**:
  - **RED**: Write test `tests/device-flow.test.js` covering:
    - `startGitHubDeviceFlow()`: calls correct URL, returns `{ userCode, verificationUrl, poll, cancel }`, poll resolves with access token on success
    - `startChatGPTDeviceFlow()`: calls device code URL, returns code + poll, poll handles id_token → access_token exchange
    - `startClaudeCodePasteFlow()`: returns `{ authUrl, exchangeCode, cancel }`, exchangeCode sends PKCE token request
    - Cancellation: calling `cancel()` makes `poll()` resolve with `{ success: false, error: "Cancelled" }`
    - Timeout: polling past deadline returns timeout error
    - Error states: `authorization_pending` continues polling, `slow_down` increases interval
  - **GREEN**: Create `device-flow.js` porting logic from `ogre-desktop/src/lib/oauth.ts`:
    - Replace `tauriFetch` with `proxyFetch` from `providers.js`
    - Replace `open()` (Tauri shell) with returning the URL (caller will open tab)
    - Replace `saveOAuthToken()` (Tauri DB) with `chrome.storage.local.set()`
    - Convert all `URLSearchParams` bodies to `.toString()` with explicit Content-Type header
    - Keep the same client IDs: GitHub `178c6fc778ccc68e1d6a`, OpenAI `app_EMoamEEZ73f0CkXaXp7hrann`, Anthropic `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
    - Keep same PKCE helpers (generateCodeVerifier, generateCodeChallenge, generateState)
  - **REFACTOR**: Clean up, ensure consistent error handling patterns

  **Must NOT do**:
  - Don't include Google device flow (client ID not ready)
  - Don't save tokens to desktop app DB
  - Don't use `URLSearchParams` objects in proxyFetch calls — always `.toString()`
  - Don't add polling in background.js service worker

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core module with complex async logic, multi-provider, needs careful porting from TypeScript to JS
  - **Skills**: []
    - No special skills needed — pure JS/async logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can mock proxyFetch in tests)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts:59-150` — GitHub device flow implementation to port. Key: `GITHUB_CLIENT_ID`, `GITHUB_DEVICE_CODE_URL`, `GITHUB_ACCESS_TOKEN_URL`, polling loop with `authorization_pending` and `slow_down` handling.
  - `ogre-desktop/src/lib/oauth.ts:152-249` — OpenAI/ChatGPT device flow. Key: Two-step process — poll for `id_token`, then exchange for `access_token` via `application/x-www-form-urlencoded`.
  - `ogre-desktop/src/lib/oauth.ts:251-319` — Anthropic PKCE code-paste flow. Key: generates `code_verifier` + `code_challenge`, opens auth URL, user pastes code, exchanges for token via JSON body.
  - `ogre-desktop/src/lib/oauth.ts:27-48` — PKCE helpers (`generateCodeVerifier`, `generateCodeChallenge`, `generateState`). Port these as-is (they use `crypto.subtle` which is available in Chrome extension context).

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts:7-18` — `DeviceFlowResult` and `CodePasteFlowResult` interfaces — replicate this shape in JSDoc or plain objects.

  **Test References**:
  - `providers.test.js` — Existing test file showing vitest patterns and mocking style in this project.

  **External References**:
  - GitHub Device Flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
  - OpenAI Device Auth: Uses non-standard device flow with `id_token` → `access_token` exchange
  - RFC 8628 (Device Authorization Grant): https://www.rfc-editor.org/rfc/rfc8628 — Section 3.5 (slow_down handling)

  **WHY Each Reference Matters**:
  - Desktop `oauth.ts:59-150`: Exact GitHub flow to replicate — shows URL structure, polling logic, error handling, token shape
  - Desktop `oauth.ts:152-249`: Critical OpenAI two-step flow — missing the token exchange step would mean the user gets an id_token but not a usable access_token
  - Desktop `oauth.ts:251-319`: Anthropic PKCE flow is different from standard device flow — important to understand the code-paste UX pattern
  - Desktop `oauth.ts:27-48`: PKCE crypto helpers must work in Chrome extension context (they use Web Crypto API which is available)

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/device-flow.test.js`
  - [ ] Tests cover: GitHub device flow (initiate, poll success, cancel, timeout)
  - [ ] Tests cover: OpenAI device flow (initiate, poll + token exchange, cancel, timeout)
  - [ ] Tests cover: Claude PKCE flow (initiate, code exchange, cancel)
  - [ ] Tests cover: `authorization_pending` and `slow_down` polling responses
  - [ ] Module file created: `device-flow.js`
  - [ ] Module exports: `startGitHubDeviceFlow`, `startChatGPTDeviceFlow`, `startClaudeCodePasteFlow`, `saveDeviceFlowToken`, `getDeviceFlowToken`, `deleteDeviceFlowToken`
  - [ ] All proxyFetch calls use `.toString()` for URLSearchParams bodies
  - [ ] `npx vitest run tests/device-flow.test.js` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Device flow tests pass
    Tool: Bash
    Preconditions: Node modules installed
    Steps:
      1. Run: npx vitest run tests/device-flow.test.js
      2. Assert: exit code 0
      3. Assert: All test suites pass (GitHub, OpenAI, Claude sections)
    Expected Result: All device flow tests pass
    Evidence: Terminal output captured

  Scenario: Module exports are correct
    Tool: Bash
    Preconditions: device-flow.js exists
    Steps:
      1. Run: node -e "const m = require('./device-flow.js'); console.log(Object.keys(m))"
         (or equivalent ESM import check)
      2. Assert: output includes startGitHubDeviceFlow, startChatGPTDeviceFlow, startClaudeCodePasteFlow
    Expected Result: All expected exports present
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(auth): add device flow module for GitHub, OpenAI, and Claude sign-in`
  - Files: `device-flow.js`, `tests/device-flow.test.js`
  - Pre-commit: `npx vitest run tests/device-flow.test.js`

---

- [ ] 3. Update providers.js to load and use OAuth tokens from chrome.storage.local

  **What to do**:
  - **RED**: Write tests in `providers.test.js` (or new section):
    - When `oauthToken` is set in provider config, it's used for API calls instead of `apiKey`
    - GitHub `listModels` and `testConnection` prefer `oauthToken` over `apiKey` (already partially done — verify)
    - OpenAI `listModels` and `testConnection` support `oauthToken`
    - Claude `testConnection` supports `oauthToken` (uses `x-api-key` header)
  - **GREEN**: Update provider configs and methods:
    - `openai.getConfig()`: Add `{ key: 'oauthToken', label: 'OAuth Token', type: 'hidden' }` field
    - `anthropic.getConfig()`: Add `{ key: 'oauthToken', label: 'OAuth Token', type: 'hidden' }` field
    - `openai.listModels(config)`: Use `config.oauthToken || config.apiKey` for Authorization header
    - `openai.testConnection(config)`: Same
    - `openai.buildChatRequest(config)`: Same
    - `anthropic.listModels(config)`: Use `config.oauthToken || config.apiKey` for `x-api-key` header
    - `anthropic.testConnection(config)`: Same
    - `anthropic.buildChatRequest(config)`: Same
    - GitHub and Gemini already support this pattern — verify and align
  - **REFACTOR**: Extract `getAuthToken(config)` helper to DRY up `config.oauthToken || config.apiKey` pattern

  **Must NOT do**:
  - Don't change provider IDs
  - Don't change the buildChatRequest response shape
  - Don't break existing API key users

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-scoped changes to existing provider methods
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `providers.js:211-298` — GitHub Models provider already implements the `config.oauthToken || config.apiKey` pattern in `listModels`, `testConnection`, and `buildChatRequest`. Use this exact pattern for OpenAI and Anthropic.
  - `providers.js:402-523` — Google Gemini provider also uses `config.oauthToken` pattern. Shows the established convention.

  **API/Type References**:
  - `providers.js:136-206` — OpenAI provider: currently only uses `config.apiKey`. Needs `oauthToken` support added.
  - `providers.js:300-397` — Anthropic provider: currently only uses `config.apiKey` for `x-api-key` header. OAuth token goes in same header.

  **Test References**:
  - `providers.test.js` — Existing test patterns for provider methods

  **WHY Each Reference Matters**:
  - GitHub/Gemini providers already implement the OAuth token pattern — follow the exact same approach for consistency
  - OpenAI and Anthropic providers need the `oauthToken || apiKey` fallback so device flow tokens work seamlessly

  **Acceptance Criteria**:
  - [ ] OpenAI provider supports `oauthToken` field in config
  - [ ] Anthropic provider supports `oauthToken` field in config
  - [ ] `config.oauthToken` takes precedence over `config.apiKey` when both present
  - [ ] Existing API key flow unchanged (backward compatible)
  - [ ] `npx vitest run providers.test.js` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Provider tests pass with OAuth token support
    Tool: Bash
    Preconditions: Node modules installed
    Steps:
      1. Run: npx vitest run providers.test.js
      2. Assert: exit code 0
    Expected Result: All provider tests pass
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(providers): add OAuth token support to OpenAI and Anthropic providers`
  - Files: `providers.js`, `providers.test.js`
  - Pre-commit: `npx vitest run providers.test.js`

---

- [ ] 4. Add device flow sign-in UI to sidepanel.html

  **What to do**:
  - Add per-provider sign-in UI inside `#manualModeContent` → `#providerConfigContainer`:
    - For each provider that supports device flow (GitHub, OpenAI, Claude):
      - **Signed Out state**: "Sign in with {Provider}" button (primary style) + "OR use API Key instead" link below
      - **Device Flow Active state** (GitHub/OpenAI): Verification URL as clickable link + user code display with copy button + "Waiting for authorization..." spinner + Cancel button
      - **Code Paste Active state** (Claude): "Auth page opened in browser" message + paste input + Submit button + Cancel button
      - **Signed In state**: "Signed in" badge with green checkmark + Sign Out button
    - The sign-in sections are inside `<div class="auth-ui">` so they get hidden when desktop is connected
    - Add `display: none` initially — JS will toggle based on provider selection and auth state
  - Add CSS for device flow UI:
    - `.device-flow-section` — container for the sign-in / device flow / signed-in states
    - `.device-code-display` — monospace, large font for user code
    - `.oauth-divider` — "OR" divider between sign-in and API key
    - `.oauth-signed-in` — green success state

  **Must NOT do**:
  - Don't add JavaScript logic (that's Task 5)
  - Don't remove existing provider fields — they stay for "Use API Key instead" mode
  - Don't modify desktop mode UI (`#desktopModeContent`)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: HTML/CSS UI work that needs to match existing design system
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI component styling that must match existing dark/light theme system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (HTML-only, no logic dependencies)

  **References**:

  **Pattern References**:
  - `sidepanel.html:1410-1434` — `#manualModeContent` div where sign-in buttons need to be inserted. Note the existing `auth-ui` class used to hide elements when desktop is connected.
  - `sidepanel.html:1417-1433` — Provider selector dropdown and `#providerConfigContainer` where dynamic fields are injected by JS. The sign-in buttons should appear ABOVE the provider config fields.
  - `ogre-desktop/src/pages/Settings.svelte:468-535` — Desktop app's device flow UI to replicate: sign-in button, device flow container (code + URL + polling indicator + cancel), signed-in state, API key toggle.
  - `sidepanel.html:839-900` — Existing CSS classes: `.github-success-box`, `.info-box`, `.warning-box` — reuse these for signed-in/error states.

  **API/Type References**:
  - `sidepanel.html:9-94` — CSS custom properties (dark mode defaults). New CSS must use these variables.
  - `sidepanel.html:99-159` — Light mode overrides. New CSS must work in both themes.
  - `sidepanel.html:1303-1314` — `.desktop-connected .auth-ui` hides auth elements when desktop is connected — new sign-in buttons must have `auth-ui` class.

  **External References**:
  - `ogre-desktop/src/pages/Settings.svelte:1065` — `.device-flow-container` CSS from desktop app (reference for visual style)

  **WHY Each Reference Matters**:
  - `#manualModeContent`: Exact insertion point for new UI — must be within this div to show/hide correctly
  - Desktop Settings.svelte: Visual reference for the UI we're replicating — shows the state machine (signed out → active flow → signed in)
  - CSS custom properties: All new styling MUST use theme variables to support dark/light mode correctly
  - `.auth-ui` class: Critical — without this class, sign-in buttons would remain visible when desktop is connected

  **Acceptance Criteria**:
  - [ ] Sign-in button HTML added for GitHub, OpenAI, Claude providers
  - [ ] Each provider has: signed-out state, device-flow-active state, signed-in state
  - [ ] Claude has code-paste input instead of device code display
  - [ ] All new elements have `auth-ui` class (hidden when desktop connected)
  - [ ] CSS uses theme variables (`var(--color-*)`) for dark/light mode
  - [ ] "OR use API Key instead" link present for each provider

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: HTML structure is valid and elements exist
    Tool: Bash
    Preconditions: sidepanel.html has been updated
    Steps:
      1. Run: node -e "const fs=require('fs'); const html=fs.readFileSync('sidepanel.html','utf8'); console.log('github-signin:', html.includes('githubSignIn')); console.log('openai-signin:', html.includes('openaiSignIn')); console.log('claude-signin:', html.includes('claudeSignIn')); console.log('auth-ui:', (html.match(/auth-ui/g)||[]).length);"
      2. Assert: All three sign-in IDs present
      3. Assert: auth-ui class count increased
    Expected Result: All sign-in elements present in HTML
    Evidence: Terminal output captured

  Scenario: CSS uses theme variables
    Tool: Bash
    Preconditions: sidepanel.html has been updated
    Steps:
      1. Search new CSS for hardcoded colors (e.g., #fff, rgb()) that should use variables
      2. Assert: No hardcoded colors in new device-flow CSS sections
    Expected Result: All new CSS uses var(--color-*) variables
    Evidence: Terminal output captured
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(ui): add device flow sign-in UI markup to sidepanel`
  - Files: `sidepanel.html`
  - Pre-commit: N/A (HTML only)

---

- [ ] 5. Implement device flow state management and UI orchestration in sidepanel.js

  **What to do**:
  - Import/load `device-flow.js` module functions
  - Add device flow state management:
    - `deviceFlowStates = {}` — per-provider state: `{ flowType, userCode, verificationUrl, polling, cancel }`
    - `oauthTokens = {}` — loaded from `chrome.storage.local` on init
  - Integrate with provider UI rendering:
    - When rendering provider config fields (in `renderProviderFields()` or equivalent):
      - Check if provider has a stored OAuth token → show "Signed In" state
      - Check if device flow is active for provider → show device flow state
      - Otherwise → show "Sign in with X" button + "OR use API Key" toggle
    - **Provider mapping**: Map provider IDs to device flow functions:
      - `github-models` → `startGitHubDeviceFlow()`
      - `openai` → `startChatGPTDeviceFlow()`
      - `anthropic` → `startClaudeCodePasteFlow()`
  - Wire up event listeners:
    - Sign-in button click → start device flow → update UI to show code/URL → open verification tab via `chrome.tabs.create()`
    - Poll for completion → on success: save token, update UI to "Signed in", refresh model list
    - Cancel button → call `flow.cancel()`, reset UI to signed-out state
    - Sign-out button → delete token from storage, reset UI
    - "Use API Key instead" toggle → hide sign-in section, show API key field
    - "Use Sign In instead" toggle → reverse
  - Handle provider switching:
    - When user changes provider dropdown, update which sign-in UI is visible
  - Load OAuth tokens on init:
    - In `loadState()` or equivalent, check `chrome.storage.local` for stored OAuth tokens per provider
    - Set them in `providerConfigs[providerId].oauthToken` so providers.js uses them
  - Handle edge case: desktop comes online during device flow
    - The existing `loadProviderConfig()` → `updateProviderUI(true)` will hide `manualModeContent` (and thus the device flow UI). If a flow is active, cancel it silently.

  **Must NOT do**:
  - Don't modify `connectToDesktop()` or `loadProviderConfig()` logic
  - Don't add device flow polling in background.js
  - Don't break the existing manual API key save flow
  - Don't allow multiple simultaneous device flows for the same provider

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex state management integrating multiple modules, many edge cases
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI state management and DOM manipulation matching existing patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 1-4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - `sidepanel.js:1845-2089` — Desktop connection state management (`desktopConnected`, `handshakeToken`, `connectToDesktop`, `updateProviderUI`). Follow this same pattern for device flow state.
  - `sidepanel.js:1931-1972` — `updateProviderUI(connected)` — toggles between desktop/manual mode. The device flow UI must live within manual mode and respect this toggle.
  - `sidepanel.js:2029-2083` — `setupDesktopListeners()` — pattern for wiring up button event listeners. Follow this for sign-in/cancel/sign-out buttons.
  - `ogre-desktop/src/pages/Settings.svelte:468-535` — Desktop app's device flow state machine: not signed in → flow active → signed in. The extension JS must replicate this state machine.

  **API/Type References**:
  - `device-flow.js` (Task 2 output) — `startGitHubDeviceFlow()` returns `{ userCode, verificationUrl, poll(), cancel() }`, `startClaudeCodePasteFlow()` returns `{ authUrl, exchangeCode(), cancel() }`
  - `providers.js:528-534` — `PROVIDERS` registry — use to check if a provider supports device flow

  **Documentation References**:
  - `AUTH_UX_DESIGN.md` — Original auth UX design. The device flow extends this with OAuth as an alternative to API keys.

  **WHY Each Reference Matters**:
  - Desktop connection pattern: Shows how to manage connected/disconnected state in sidepanel.js — device flow state follows the same architecture
  - `updateProviderUI`: Must understand this to know when device flow UI gets hidden (desktop mode activates)
  - Desktop Settings.svelte: The exact state machine we're replicating — signed out → device flow → signed in
  - `device-flow.js` API: The functions we're calling — must match the return types exactly

  **Acceptance Criteria**:
  - [ ] Clicking "Sign in with GitHub" starts device flow, shows user code, opens verification URL tab
  - [ ] Clicking "Sign in with OpenAI" starts device flow, shows user code, opens verification URL tab
  - [ ] Clicking "Sign in with Claude" opens auth page, shows code paste input
  - [ ] After successful auth, UI shows "Signed in" state with sign-out button
  - [ ] Signing out removes token and resets to sign-in button
  - [ ] Cancelling active flow resets to sign-in button
  - [ ] Switching providers shows correct sign-in state per provider
  - [ ] OAuth tokens persist across extension reload (chrome.storage.local)
  - [ ] When desktop app connects, active device flows are cancelled silently
  - [ ] "Use API Key instead" / "Use Sign In instead" toggles work

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Sign-in button starts GitHub device flow
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, desktop app NOT running, sidepanel open
    Steps:
      1. Navigate to extension sidepanel
      2. Select "GitHub" from provider dropdown
      3. Click "Sign in with GitHub" button
      4. Wait for device-flow-active state to appear (timeout: 5s)
      5. Assert: User code is displayed (non-empty text in .device-code-display)
      6. Assert: Verification URL is displayed as a link
      7. Assert: "Waiting for authorization..." text is visible
      8. Assert: Cancel button is visible
      9. Click Cancel button
      10. Assert: Returns to "Sign in with GitHub" button state
      11. Screenshot: .sisyphus/evidence/task-5-github-device-flow.png
    Expected Result: Device flow starts and cancels cleanly
    Evidence: .sisyphus/evidence/task-5-github-device-flow.png

  Scenario: API key toggle works
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, sidepanel open, provider selected
    Steps:
      1. Assert: "Sign in with" button is visible
      2. Click "Use API Key instead" link
      3. Assert: API key input field is visible
      4. Assert: "Sign in" button is hidden
      5. Click "Use Sign In instead" link
      6. Assert: "Sign in" button reappears
      7. Assert: API key input field is hidden
      8. Screenshot: .sisyphus/evidence/task-5-api-key-toggle.png
    Expected Result: Toggle switches between sign-in and API key modes
    Evidence: .sisyphus/evidence/task-5-api-key-toggle.png

  Scenario: OAuth token persists across reload
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, a mock token stored in chrome.storage.local
    Steps:
      1. Inject a test OAuth token into chrome.storage.local for github-models
      2. Reload the sidepanel
      3. Select "GitHub" provider
      4. Assert: "Signed in" state is displayed (not sign-in button)
      5. Click "Sign Out"
      6. Assert: Returns to "Sign in with GitHub" button
      7. Reload the sidepanel again
      8. Assert: "Sign in with GitHub" button is displayed (token was removed)
    Expected Result: Token persistence and sign-out both work
    Evidence: Terminal output / screenshots captured
  ```

  **Commit**: YES
  - Message: `feat(auth): integrate device flow sign-in into extension sidepanel`
  - Files: `sidepanel.js`, `sidepanel.html` (if minor adjustments needed)
  - Pre-commit: `npx vitest run`

---

- [ ] 6. Integration testing and end-to-end QA

  **What to do**:
  - Run full test suite: `npx vitest run` — ensure all existing + new tests pass
  - Load the extension in Chrome and verify:
    - With desktop app NOT running: sign-in buttons appear for GitHub, OpenAI, Claude
    - API key fields still work (backward compatibility)
    - Desktop connection still works (when desktop is running, sign-in buttons hidden)
    - Theme switching: dark mode and light mode both render sign-in UI correctly
  - Test error states:
    - Network failure during device flow (proxyFetch error) → shows error message
    - User closes sidepanel during active flow → flow is cancelled on reopen
  - Verify no regressions:
    - Provider switching still works
    - Model selection still works
    - Grading (all modes) still works with API key auth
    - Grading works with device flow token auth
  - Clean up any debug code, console.logs, or TODO comments

  **Must NOT do**:
  - Don't add new features beyond what's in the plan
  - Don't refactor unrelated code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive integration testing across multiple components
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation needed to test the extension's sidepanel UI

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final task)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - All files modified in Tasks 1-5
  - `vitest.config.js` — Test configuration

  **WHY Each Reference Matters**:
  - All modified files need regression verification
  - vitest config determines test discovery and execution

  **Acceptance Criteria**:
  - [ ] `npx vitest run` → ALL tests pass (0 failures)
  - [ ] Extension loads without errors (no console errors on startup)
  - [ ] Sign-in buttons visible in manual mode (desktop offline)
  - [ ] Sign-in buttons hidden in desktop mode (desktop online)
  - [ ] Both dark and light themes render correctly
  - [ ] Existing API key authentication still works

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All tasks 1-5 complete
    Steps:
      1. Run: npx vitest run
      2. Assert: exit code 0
      3. Assert: 0 failed tests
    Expected Result: Complete test suite passes
    Evidence: Terminal output captured

  Scenario: Extension loads without errors
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded in Chrome
    Steps:
      1. Open extension sidepanel
      2. Check browser console for errors
      3. Assert: No JavaScript errors in console
      4. Assert: Sidepanel renders correctly
      5. Screenshot: .sisyphus/evidence/task-6-extension-loaded.png
    Expected Result: Clean extension startup
    Evidence: .sisyphus/evidence/task-6-extension-loaded.png

  Scenario: Dark and light mode rendering
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, sign-in UI visible
    Steps:
      1. Set theme to dark mode
      2. Assert: Sign-in buttons use dark theme colors
      3. Screenshot: .sisyphus/evidence/task-6-dark-mode.png
      4. Set theme to light mode
      5. Assert: Sign-in buttons use light theme colors
      6. Screenshot: .sisyphus/evidence/task-6-light-mode.png
    Expected Result: Both themes render correctly
    Evidence: .sisyphus/evidence/task-6-dark-mode.png, .sisyphus/evidence/task-6-light-mode.png

  Scenario: Desktop connection hides sign-in buttons
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, desktop app running
    Steps:
      1. Open sidepanel
      2. Wait for desktop connection (green "Desktop App Connected" banner)
      3. Assert: Sign-in buttons are NOT visible
      4. Assert: Desktop provider selector IS visible
    Expected Result: Desktop mode takes priority over sign-in UI
    Evidence: .sisyphus/evidence/task-6-desktop-mode.png
  ```

  **Commit**: YES
  - Message: `test(auth): add integration tests for device flow sign-in`
  - Files: Any test files, cleanup of debug code
  - Pre-commit: `npx vitest run`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(background): support url-encoded body passthrough in proxyFetch` | background.js, tests/background.test.js | npx vitest run tests/background.test.js |
| 2 | `feat(auth): add device flow module for GitHub, OpenAI, and Claude sign-in` | device-flow.js, tests/device-flow.test.js | npx vitest run tests/device-flow.test.js |
| 3 | `feat(providers): add OAuth token support to OpenAI and Anthropic providers` | providers.js, providers.test.js | npx vitest run providers.test.js |
| 4 | `feat(ui): add device flow sign-in UI markup to sidepanel` | sidepanel.html | N/A |
| 5 | `feat(auth): integrate device flow sign-in into extension sidepanel` | sidepanel.js | npx vitest run |
| 6 | `test(auth): add integration tests for device flow sign-in` | test files | npx vitest run |

---

## Success Criteria

### Verification Commands
```bash
npx vitest run                    # Expected: All tests pass, 0 failures
npx vitest run tests/device-flow.test.js  # Expected: Device flow tests pass
npx vitest run providers.test.js  # Expected: Provider tests pass
```

### Final Checklist
- [ ] All "Must Have" present (device flow for 3 providers, desktop-style UI, inline code + auto-open tab, token persistence, signed-in state)
- [ ] All "Must NOT Have" absent (no Google flow, no desktop token sharing, no URLSearchParams objects in message passing, no background.js polling)
- [ ] All tests pass
- [ ] Extension loads cleanly in Chrome
- [ ] Backward compatible with existing API key authentication
