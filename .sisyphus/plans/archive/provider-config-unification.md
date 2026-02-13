# Provider Config Unification: Desktop as Single Source of Truth

## TL;DR

> **Quick Summary**: Restructure AI provider configuration so the O.G.R.E Desktop app becomes the single authoritative source for provider setup (sign-in, API keys, OAuth, model selection). The Chrome extension stops managing its own auth and reads everything from the desktop via the grading-server's local HTTP endpoint. Extension keeps its provider adapters for making AI calls — it just gets *configuration* from desktop instead of managing it locally.
> 
> **Deliverables**:
> - New grading-server endpoints: `/api/handshake`, `GET /api/providers`, `POST /internal/providers`, `POST /api/providers/active`
> - Desktop config push mechanism (Svelte frontend → grading-server on startup + config change)
> - Extension: simplified provider UI (dropdown, connection status, "Configure in Desktop App" link)
> - Extension: auto-detect desktop availability with graceful fallback to manual API key entry
> - Extension: active provider write-back to desktop
> - Provider ID standardization across all 3 codebases
> - Full removal of `oauth-client.js` and OAuth UI from extension
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 + Task 5 → Task 6 + Task 7 + Task 8 → Task 9

---

## Context

### Original Request
Restructure AI provider configuration so the desktop app becomes the single source of truth. Extension removes its sign-in/auth UI and reads settings from the desktop app at runtime via the grading-server sidecar. Keep provider adapters in the extension (it still makes its own API calls). Keep a manual API key fallback for users without the desktop app.

### Interview Summary
**Key Discussions**:
- **Data bridge**: Desktop pushes provider config to grading-server (POST /internal/providers) on startup and config changes. Server holds in memory. No SQLite coupling.
- **Security**: Auto-discovery handshake — server validates `Origin: chrome-extension://` header prefix on handshake endpoint. Desktop generates auth token and sends it to server alongside config.
- **Fallback mode**: Auto-detect. Extension tries desktop server on panel open. If unreachable → manual API key entry mode (current chrome.storage.local behavior). No OAuth in fallback — API key only.
- **Sync strategy**: Fetch on panel open + manual refresh button. No polling or WebSocket.
- **Provider IDs**: Standardize across all 3 codebases (no mapping layer).
- **Config write-back**: Extension writes active provider/model selection back to desktop via POST. Desktop updates SQLite.
- **OAuth cleanup**: Remove oauth-client.js entirely. Desktop owns all auth flows.
- **Desktop UI**: No visual/layout changes to Settings.svelte. Logic-only hooks (calling pushProvidersToServer after save/auth) are allowed.
- **Tests**: No automated tests. Agent-Executed QA only.

### Research Findings
**Extension side**:
- `providers.js`: 6 adapters (ollama-cloud, ollama-local, openai, anthropic, google-gemini, github-models). Each has getConfig(), listModels(), testConnection(), buildChatRequest(). Uses proxyFetch() via background.js for CORS bypass.
- `sidepanel.js`: UI controller. Manages provider tab switching, config load/save from chrome.storage.local, OAuth token attachment. 
- `oauth-client.js`: GitHub + Google OAuth via chrome.identity.launchWebAuthFlow(). Routes through Vercel backend for token exchange.
- `batch-grader.js`: Already talks to grading-server (POST /session). Fire-and-forget session stats.
- `background.js`: Service worker for proxyFetch (CORS bypass) + captureVisibleTab. Must not be modified.

**Desktop side**:
- `db.ts`: ProviderConfig {id, api_url?, api_key?, model?, is_active, created_at, updated_at}. OAuthToken {provider, access_token, refresh_token?, token_type?, expires_at?, created_at, updated_at}.
- `oauth.ts`: Device flow for GitHub/OpenAI/Google, code-paste for Claude. Token storage/refresh via db.ts.
- `Settings.svelte`: Provider CRUD, OAuth auth, model fetching, test connection.
- `server.ts`: Event listeners for sidecar stdout events (server-status, session_complete). No HTTP communication to server.
- `grading-server/server.js`: Hono framework. Endpoints: GET /health, POST /grade (receives FULL provider config inline per request), POST /session. CORS: `origin: '*'`. Completely stateless.

**Critical architectural finding**: The grading-server has ZERO access to desktop's SQLite DB. Desktop ↔ server communication is stdout-only (server → desktop via stdout JSON → Rust sidecar → Tauri events). There is NO existing desktop → server HTTP channel.

### Metis Review
**Identified Gaps** (addressed):

1. **Batch grading POST /grade contract**: POST /grade currently receives full provider config in the body from the extension. This contract stays unchanged — the extension will now fetch credentials from desktop and pass them inline to /grade as before. No server-side change needed.

2. **How desktop pushes to server via HTTP**: Desktop → server communication is currently stdout-only. The new push will use `fetch("http://localhost:3456/internal/providers")` from the Svelte frontend (simplest approach — already has getProviderConfigs() + getOAuthToken() in db.ts). No Rust code needed.

3. **Extension ID stability for handshake**: Unpacked extensions get a new ID on every `Load unpacked`. Using prefix match (`Origin` starts with `chrome-extension://`) instead of specific ID. Sufficient for localhost security.

4. **Token generation ownership**: Desktop generates the handshake token (UUID) and sends it to the server alongside provider config in POST /internal/providers. Server stores both in memory. Desktop owns all config.

5. **Startup race condition**: Desktop must wait for GET /health to succeed before pushing config. Use a retry loop with backoff.

6. **Server restart config loss**: In-memory state is lost on server crash/restart. Desktop must re-push config when it receives the `server-status: running` Tauri event.

7. **Config write-back mechanism**: Server emits JSON to stdout `{"type": "provider_changed", "provider_id": "...", "model": "..."}` when extension changes active provider. Desktop's Rust sidecar picks it up, emits Tauri event, Svelte frontend updates SQLite. Matches existing `session_complete` pattern.

8. **Vercel OAuth backend**: Extension's oauth-client.js routes through `ogre-oauth-backend.vercel.app`. After removing oauth-client.js, this backend is orphaned. NOT decommissioned in this plan (out of scope) — just noted as no longer called.

9. **Provider ID mismatch details**: Extension has `ollama-cloud` + `ollama-local` (separate) vs desktop's single `ollama`. Server uses `gemini` instead of `google-gemini`. Full reconciliation in Task 1.

---

## Work Objectives

### Core Objective
Make the O.G.R.E Desktop app the single source of truth for AI provider configuration, with the Chrome extension reading that config via the grading-server's local HTTP API instead of managing its own auth/storage.

### Concrete Deliverables
- `grading-server/server.js`: 4 new endpoints with in-memory state + auth middleware
- `ogre-desktop/src/lib/server.ts` (or new file): Config push logic (Svelte → HTTP → grading-server)
- `ogre-desktop/src-tauri/src/lib.rs`: New `provider_changed` event type parsing in stdout handler (following `session_complete` pattern)
- `ogre-desktop/src/lib/db.ts`: New `updateActiveProvider()` function for write-back persistence
- `providers.js`: Unified provider IDs, new `loadFromDesktop()` path alongside existing chrome.storage path
- `sidepanel.js`: New simplified UI logic (dropdown, connection status, fallback detection)
- `sidepanel.html`: Simplified provider section (remove OAuth buttons, add dropdown + status)
- `oauth-client.js`: DELETED entirely
- `batch-grader.js`: Updated to use new provider ID scheme (if referencing old IDs)

### Definition of Done
- [ ] Extension opens → handshakes with grading-server → displays providers from desktop → user selects provider → grades with it
- [ ] Extension opens without desktop running → shows manual API key fallback UI → works with chrome.storage.local
- [ ] User switches provider in extension → choice persists to desktop SQLite
- [ ] Desktop restarts grading-server → config re-pushed → extension works on next panel open
- [ ] `oauth-client.js` is deleted, zero OAuth imports remain in extension code
- [ ] All 3 codebases use identical provider IDs: `ollama`, `openai`, `anthropic`, `google-gemini`, `github-models`

### Must Have
- Desktop → server config push on startup and on config save
- Extension → server handshake with Origin validation
- Extension → server provider config fetch on panel open
- Extension → server active provider write-back
- Auto-detect desktop availability with graceful fallback
- Provider ID consistency across all 3 codebases
- Complete oauth-client.js removal from extension

### Must NOT Have (Guardrails)
- Do NOT touch `background.js` proxy fetch mechanism — it is critical CORS infrastructure
- Do NOT change existing `/health`, `/grade`, `/session` endpoint request/response contracts
- Do NOT change `Settings.svelte` UI/layout — no new UI components, no visual changes. Adding `pushProvidersToServer()` call hooks after existing save/auth operations IS allowed (logic-only additions, not UI changes).
- Do NOT add WebSocket, polling, or any real-time sync mechanism
- Do NOT log API keys or tokens to stdout (server sidecar output is visible in desktop logs)
- Do NOT create a provider ID mapping layer — standardize directly
- Do NOT change how provider adapters make AI API calls (buildChatRequest, streaming, etc.)
- Do NOT modify the Vercel OAuth backend
- Do NOT add a model list syncing feature — extension can fetch models directly from AI providers using received credentials
- Do NOT support multiple simultaneous handshake tokens (one active token, shared across Chrome windows)
- Do NOT attempt multi-port fallback for port 3456 conflicts

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion is verifiable by running a command (curl, grep, Playwright) or using a tool.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> Agent-Executed QA is the PRIMARY verification method for every task.
> The executing agent directly verifies each deliverable by running it —
> calling endpoints with curl, checking UI with Playwright, grepping code.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Grading-server endpoints | Bash (curl) | Send requests, parse JSON, assert fields/status |
| Desktop push mechanism | Bash (curl to simulate) + Playwright (desktop UI) | Trigger push, verify server state |
| Extension UI | Playwright (Chrome extension side panel) | Navigate, interact, assert DOM, screenshot |
| Code cleanup (OAuth) | Bash (grep) | Search for removed imports/references, assert zero matches |
| Provider ID consistency | Bash (grep) | Search all 3 codebases for ID strings, verify match |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Provider ID Standardization [no dependencies]

Wave 2 (After Wave 1):
└── Task 2: Grading-Server New Endpoints [depends: 1]

Wave 3 (After Wave 2):
├── Task 3: Desktop Config Push to Server [depends: 2]
└── Task 5: Extension Handshake + Provider Fetch [depends: 2]

Wave 4 (After Wave 3):
├── Task 4: Desktop Re-Push on Server Restart [depends: 3]
├── Task 6: Extension Simplified Provider UI [depends: 5]
├── Task 7: Extension Fallback Mode [depends: 5]
└── Task 8: Extension Active Provider Write-Back [depends: 2, 5]

Wave 5 (After Wave 4):
└── Task 9: OAuth Cleanup + Final Verification [depends: 6, 7]

Critical Path: Task 1 → Task 2 → Task 5 → Task 6 → Task 9
Parallel Speedup: ~35% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | None (foundational) |
| 2 | 1 | 3, 5, 8 | None |
| 3 | 2 | 4 | 5 |
| 4 | 2, 3 | None | 6, 7, 8 |
| 5 | 2 | 6, 7, 8 | 3 |
| 6 | 5 | 9 | 4, 7, 8 |
| 7 | 5 | 9 | 4, 6, 8 |
| 8 | 2, 5 | None | 4, 6, 7 |
| 9 | 6, 7 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | task(category="unspecified-high", load_skills=["git-master"]) |
| 2 | 2 | task(category="unspecified-high", load_skills=["git-master"]) |
| 3 | 3, 5 | dispatch parallel: two task(category="unspecified-high") |
| 4 | 4, 6, 7, 8 | dispatch parallel: four tasks |
| 5 | 9 | task(category="quick", load_skills=["git-master"]) |

---

## TODOs

---

- [ ] 1. Provider ID Standardization

  **What to do**:
  - Define canonical provider IDs: `ollama`, `openai`, `anthropic`, `google-gemini`, `github-models`
  - **Extension `providers.js`**:
    - Merge `ollama-cloud` and `ollama-local` adapters into a single `ollama` adapter. The `api_url` field in config determines whether it points to a cloud endpoint or `localhost:11434`. Keep both behaviors, just unified under one ID.
    - Rename the PROVIDERS registry keys from `ollama-cloud`/`ollama-local` to `ollama`
    - `google-gemini` and `github-models` already match — no change needed
  - **Grading-server `server.js`**:
    - In the provider switch statement (inside the `/grade` handler), rename `gemini` case to `google-gemini`
    - Add `github-models` case if missing
  - **Grading-server `grading-server/providers.js`** (server-side adapters):
    - Rename `gemini` adapter to `google-gemini`
    - Verify all adapter exports match canonical IDs
  - **Extension `sidepanel.js`**:
    - Update all references to `ollama-cloud`/`ollama-local` to `ollama`
    - Update the provider tab/selector UI to show one "Ollama" option instead of two
  - **Extension `sidepanel.html`**:
    - Update provider tab markup to reflect merged Ollama
  - **Extension `batch-grader.js`**:
    - Update any provider ID references to use new canonical IDs
  - **Extension chrome.storage.local migration**:
    - In the `loadState()` function of `sidepanel.js`, add a one-time migration: if stored provider is `ollama-cloud` or `ollama-local`, migrate to `ollama`. If stored provider is `gemini`, migrate to `google-gemini`.
  - **Desktop `db.ts`**: Verify provider IDs in PROVIDER_OPTIONS match canonical list. Desktop already uses `ollama`, `openai`, `anthropic`, `google-gemini`, `github-models` — should need no changes but verify.

  **Must NOT do**:
  - Do NOT change provider adapter logic (buildChatRequest, listModels, streaming behavior)
  - Do NOT touch background.js
  - Do NOT change how api_url or api_key fields work — only the provider ID key
  - Do NOT change the POST /grade request/response format (provider field value changes, that's it)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-codebase rename touching ~6 files across 3 projects. Requires careful cross-referencing but not deep algorithmic work.
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit after cross-codebase rename. Need clean diff showing all ID changes.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — this is pure ID renaming, not visual design

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo — foundational)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8, 9 (everything uses standardized IDs)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `providers.js` — Full PROVIDERS registry object. Look for all keys: `ollama-cloud`, `ollama-local`, `openai`, `anthropic`, `google-gemini`, `github-models`. Each key maps to an adapter object with getConfig(), listModels(), testConnection(), buildChatRequest(). The merge of `ollama-cloud` + `ollama-local` means combining their adapter logic into one that uses `api_url` to determine behavior.
  - `sidepanel.js` — `loadState()` function (around line 1856) reads provider from chrome.storage.local. This is where the migration logic goes: check if stored value is an old ID, replace with new one.
  - `grading-server/server.js` — Provider switch statement inside POST /grade handler. Look for `case 'gemini'` — rename to `case 'google-gemini'`.
  - `grading-server/providers.js` — Server-side provider adapters. Different file from extension's providers.js. Has buildRequest/parseResponse per provider.

  **API/Type References**:
  - `ogre-desktop/src/lib/db.ts` — `ProviderConfig` interface. Check the `id` field values used in PROVIDER_OPTIONS.
  - `ogre-desktop/src/pages/Settings.svelte` — PROVIDER_OPTIONS constant defines the canonical desktop provider list.

  **Documentation References**:
  - This plan's "Work Objectives > Definition of Done" — provider ID consistency across all 3 codebases

  **WHY Each Reference Matters**:
  - `providers.js` is the heart of the extension's provider system — every ID rename starts here
  - `sidepanel.js:loadState()` is where existing user data needs migration so saved configs don't break
  - `grading-server/server.js` switch statement directly routes to provider adapters by ID — wrong ID = broken grading
  - Desktop's PROVIDER_OPTIONS is the source of truth for what IDs should be — verify extension matches it

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All 3 codebases use identical provider IDs
    Tool: Bash (grep)
    Preconditions: All files saved after edits
    Steps:
      1. grep -r "ollama-cloud\|ollama-local" providers.js sidepanel.js sidepanel.html batch-grader.js
         Assert: Zero matches (old IDs fully removed from extension)
      2. grep -rn "'ollama'\|\"ollama\"" providers.js
         Assert: At least 1 match (new unified ollama adapter exists)
      3. grep -rn "'gemini'" grading-server/server.js grading-server/providers.js
         Assert: Zero matches (old 'gemini' ID removed from server)
      4. grep -rn "'google-gemini'" grading-server/server.js grading-server/providers.js
         Assert: At least 1 match per file (new ID in use)
      5. grep -rn "github-models" grading-server/server.js
         Assert: At least 1 match (github-models supported in server)
    Expected Result: All provider IDs are consistent: ollama, openai, anthropic, google-gemini, github-models
    Evidence: grep output captured

  Scenario: Chrome storage migration handles old IDs
    Tool: Bash (grep)
    Preconditions: sidepanel.js edited
    Steps:
      1. grep -n "ollama-cloud\|ollama-local" sidepanel.js
         Assert: Only matches are inside the migration logic (converting old → new), not in active config code
      2. Verify loadState() or equivalent contains migration code that maps old IDs to new
    Expected Result: Existing users' saved configs will be auto-migrated on next load
    Evidence: grep output + code context captured

  Scenario: Merged Ollama adapter handles both cloud and local via api_url
    Tool: Bash (grep)
    Preconditions: providers.js edited
    Steps:
      1. grep -A5 "'ollama'" providers.js
         Assert: Single ollama adapter exists with api_url-based behavior
      2. Verify no duplicate ollama entries in PROVIDERS object
    Expected Result: One ollama adapter that uses api_url to determine cloud vs local behavior
    Evidence: grep output captured
  ```

  **Evidence to Capture:**
  - [ ] grep output for all ID checks in `.sisyphus/evidence/task-1-id-consistency.txt`
  - [ ] Code snippet of migration logic in `.sisyphus/evidence/task-1-migration-code.txt`

  **Commit**: YES
  - Message: `refactor(providers): standardize provider IDs across extension, server, and desktop`
  - Files: `providers.js`, `sidepanel.js`, `sidepanel.html`, `batch-grader.js`, `grading-server/server.js`, `grading-server/providers.js`
  - Pre-commit: Verify no broken references via grep

---

- [ ] 2. Grading-Server: New Endpoint Infrastructure

  **What to do**:
  - Add in-memory state to `grading-server/server.js`:
    - `let providerConfigs = []` — array of provider config objects pushed from desktop
    - `let handshakeToken = null` — auth token generated by desktop, pushed alongside config
  - Add **middleware** for `/api/*` routes that validates `Authorization: Bearer <token>` header matches `handshakeToken`. Returns 401 if missing/invalid. Skip middleware for `/api/handshake`.
  - Add **4 new endpoints**:
    1. `GET /api/handshake` — Returns `{ "token": handshakeToken }`. Validates that `Origin` header starts with `chrome-extension://`. Returns 403 if Origin doesn't match. Returns 503 if handshakeToken is null (desktop hasn't pushed config yet).
    2. `GET /api/providers` — Protected by Bearer token middleware. Returns `{ "providers": providerConfigs }`. Each provider object shape: `{ id, api_url, model, is_active, credentials: { api_key?, access_token?, token_type? } }`.
    3. `POST /internal/providers` — Accepts config push from desktop. Request body: `{ "token": "<uuid>", "providers": [...] }`. Stores token as `handshakeToken` and providers as `providerConfigs`. Returns 200 OK. Must NOT be accessible with `chrome-extension://` Origin (reject with 403 if Origin starts with `chrome-extension://`).
    4. `POST /api/providers/active` — Protected by Bearer token middleware. Request body: `{ "provider_id": "openai", "model": "gpt-4o" }`. Updates `is_active` in providerConfigs (set target to active, others to inactive). Emits JSON to stdout: `{"type": "provider_changed", "provider_id": "openai", "model": "gpt-4o"}` for desktop sidecar to capture. Returns 200 OK.
  - **Update CORS `allowHeaders`**: The current CORS config only allows `['Content-Type']`. Add `'Authorization'` to the allowed headers list: `allowHeaders: ['Content-Type', 'Authorization']`. Without this, the Chrome extension's preflight requests for `/api/providers` and `/api/providers/active` (which send `Authorization: Bearer <token>`) will be rejected by the browser. This is a **critical** fix — the new Bearer token auth won't work without it.
  - Keep `origin: '*'` for backward compatibility with existing endpoints. The new endpoints use Origin validation and Bearer token auth for security, not CORS origin restrictions.
  - Ensure API keys/tokens are NEVER logged to stdout (the provider_changed event only includes provider_id and model, not credentials).

  **Must NOT do**:
  - Do NOT modify existing `/health`, `/grade`, `/session` endpoints or their request/response contracts
  - Do NOT add database access or file I/O — everything is in-memory
  - Do NOT log provider config contents (API keys, tokens) to console/stdout
  - Do NOT add WebSocket or SSE infrastructure

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Adding 4 endpoints with auth middleware to an existing Hono server. Moderate complexity — needs careful understanding of Hono patterns already in use.
  - **Skills**: [`git-master`]
    - `git-master`: Clean commit of server-side changes
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — verification is curl-based
    - `frontend-ui-ux`: Backend-only task

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 3, 5, 8 (all need these endpoints to exist)
  - **Blocked By**: Task 1 (needs standardized provider IDs)

  **References**:

  **Pattern References**:
  - `grading-server/server.js` — Existing Hono app setup, CORS config, endpoint definitions. Follow the same `app.get()`/`app.post()` pattern. Look at how `/grade` validates request bodies — follow similar validation for new endpoints.
  - `grading-server/server.js` — Existing stdout JSON output pattern: look at how `session_complete` events are written to stdout. The new `provider_changed` event must follow the exact same `console.log(JSON.stringify(...))` pattern for Rust sidecar to parse.

  **API/Type References**:
  - `ogre-desktop/src/lib/db.ts:ProviderConfig` — Source shape for provider config objects. The `/api/providers` response shape is derived from this.
  - `ogre-desktop/src/lib/db.ts:OAuthToken` — OAuth token fields that get merged into the `credentials` sub-object.

  **External References**:
  - Hono docs: https://hono.dev/docs/api/routing — Route definition patterns
  - Hono middleware: https://hono.dev/docs/guides/middleware — How to create middleware for auth

  **WHY Each Reference Matters**:
  - Existing server.js is the template — new code must match its style (Hono patterns, error handling, response shapes)
  - The stdout JSON pattern is critical — the desktop Rust sidecar parses stdout line by line for JSON objects with a `type` field. Mismatched format means desktop never sees provider_changed events.
  - db.ts schemas define the data shape flowing from desktop → server → extension. The endpoint response must be compatible.

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: POST /internal/providers accepts config from desktop
    Tool: Bash (curl)
    Preconditions: grading-server running on localhost:3456
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:3456/internal/providers \
           -H "Content-Type: application/json" \
           -d '{"token":"test-uuid-token-123","providers":[{"id":"openai","api_url":"https://api.openai.com/v1","model":"gpt-4o","is_active":true,"credentials":{"api_key":"sk-test123"}},{"id":"anthropic","api_url":"https://api.anthropic.com","model":"claude-sonnet-4-20250514","is_active":false,"credentials":{"api_key":"sk-ant-test"}}]}'
      2. Assert: HTTP status is 200
    Expected Result: Config stored in server memory
    Evidence: curl output saved to .sisyphus/evidence/task-2-internal-push.txt

  Scenario: GET /api/handshake returns token with valid extension Origin
    Tool: Bash (curl)
    Preconditions: Config pushed via POST /internal/providers (previous scenario)
    Steps:
      1. curl -s -w "\n%{http_code}" -H "Origin: chrome-extension://abcdef123456" http://localhost:3456/api/handshake
      2. Assert: HTTP status is 200
      3. Assert: Response JSON has non-empty "token" field
      4. Assert: token value equals "test-uuid-token-123"
    Expected Result: Handshake returns the token pushed by desktop
    Evidence: curl output saved to .sisyphus/evidence/task-2-handshake-success.txt

  Scenario: GET /api/handshake rejects non-extension Origin
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. curl -s -w "\n%{http_code}" -H "Origin: http://evil.com" http://localhost:3456/api/handshake
      2. Assert: HTTP status is 403
      3. curl -s -w "\n%{http_code}" http://localhost:3456/api/handshake
      4. Assert: HTTP status is 403 (no Origin header)
    Expected Result: Non-extension callers cannot get the token
    Evidence: curl output saved to .sisyphus/evidence/task-2-handshake-reject.txt

  Scenario: GET /api/handshake returns 503 before desktop pushes config
    Tool: Bash (curl)
    Preconditions: Server freshly started, no config pushed yet
    Steps:
      1. curl -s -w "\n%{http_code}" -H "Origin: chrome-extension://test" http://localhost:3456/api/handshake
      2. Assert: HTTP status is 503
      3. Assert: Response indicates desktop config not yet available
    Expected Result: Extension knows desktop hasn't connected yet
    Evidence: curl output saved

  Scenario: GET /api/providers returns config with valid Bearer token
    Tool: Bash (curl)
    Preconditions: Config pushed, handshake token known
    Steps:
      1. curl -s -w "\n%{http_code}" -H "Authorization: Bearer test-uuid-token-123" http://localhost:3456/api/providers
      2. Assert: HTTP status is 200
      3. Assert: Response has "providers" array with 2 items
      4. Assert: First provider id is "openai", has credentials.api_key
      5. Assert: Second provider id is "anthropic"
    Expected Result: Extension can read full provider config including credentials
    Evidence: curl output saved to .sisyphus/evidence/task-2-providers-success.txt

  Scenario: GET /api/providers rejects invalid/missing token
    Tool: Bash (curl)
    Preconditions: Server running with config
    Steps:
      1. curl -s -w "\n%{http_code}" http://localhost:3456/api/providers
         Assert: 401
      2. curl -s -w "\n%{http_code}" -H "Authorization: Bearer wrong-token" http://localhost:3456/api/providers
         Assert: 401
    Expected Result: Unauthorized callers cannot read provider config
    Evidence: curl output saved to .sisyphus/evidence/task-2-providers-reject.txt

  Scenario: POST /internal/providers rejects requests with extension Origin
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:3456/internal/providers \
           -H "Origin: chrome-extension://test" \
           -H "Content-Type: application/json" \
           -d '{"token":"hacker","providers":[]}'
      2. Assert: HTTP status is 403
    Expected Result: Extension cannot overwrite desktop config
    Evidence: curl output saved

  Scenario: POST /api/providers/active updates active provider and emits stdout
    Tool: Bash (curl + server stdout capture)
    Preconditions: Config pushed with openai (active) and anthropic (inactive)
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:3456/api/providers/active \
           -H "Authorization: Bearer test-uuid-token-123" \
           -H "Content-Type: application/json" \
           -d '{"provider_id":"anthropic","model":"claude-sonnet-4-20250514"}'
      2. Assert: HTTP status is 200
      3. GET /api/providers → Assert anthropic.is_active is true, openai.is_active is false
      4. Verify server stdout contains JSON: {"type":"provider_changed","provider_id":"anthropic","model":"claude-sonnet-4-20250514"}
    Expected Result: Active provider switched, desktop notified via stdout
    Evidence: curl + stdout output saved to .sisyphus/evidence/task-2-active-switch.txt

  Scenario: Existing endpoints unaffected
    Tool: Bash (curl)
    Preconditions: Server running with new endpoints
    Steps:
      1. curl -s -w "\n%{http_code}" http://localhost:3456/health
         Assert: 200 with existing response format
      2. curl -s -w "\n%{http_code}" -X POST http://localhost:3456/session \
           -H "Content-Type: application/json" \
           -d '{"provider_id":"openai","model":"gpt-4o","total_students":1,"successful":1}'
         Assert: 200 (or existing expected status)
    Expected Result: New endpoints did not break existing functionality
    Evidence: curl output saved
  ```

  **Evidence to Capture:**
  - [ ] All curl outputs in `.sisyphus/evidence/task-2-*.txt`
  - [ ] Server stdout capture showing provider_changed event

  **Commit**: YES
  - Message: `feat(server): add provider config endpoints with handshake auth for extension bridge`
  - Files: `grading-server/server.js`
  - Pre-commit: Start server, run all curl scenarios above

---

- [ ] 3. Desktop: Config Push to Grading-Server

  **What to do**:
  - Create a new function in `ogre-desktop/src/lib/server.ts` (or a new file like `ogre-desktop/src/lib/provider-sync.ts`):
    - `pushProvidersToServer()` — Reads all provider configs from SQLite via `getProviderConfigs()`, reads OAuth tokens via `getOAuthToken()` for each provider, generates a UUID handshake token, merges them into the endpoint shape `{ token, providers: [{ id, api_url, model, is_active, credentials: { api_key?, access_token?, token_type? } }] }`, POSTs to `http://localhost:3456/internal/providers`.
  - **On desktop startup**: After detecting grading-server is running (wait for `GET /health` to succeed with retry/backoff), call `pushProvidersToServer()`.
  - **On config save**: In `Settings.svelte`, after any `saveProviderConfig()` or `deleteProviderConfig()` call, also call `pushProvidersToServer()` to push updated config to server.
  - **On OAuth sign-in/sign-out**: After `startGitHubDeviceFlow()`, `startChatGPTDeviceFlow()`, `startClaudeCodePasteFlow()`, `startGoogleDeviceFlow()`, or `signOut()` completes in Settings.svelte, call `pushProvidersToServer()`.
  - Implement health check retry: Try `GET http://localhost:3456/health` up to 10 times with 1-second backoff. Only push config after health check succeeds.
  - Store the generated handshake token in a Svelte store or module-level variable so it can be regenerated on server restart.

  **Must NOT do**:
  - Do NOT modify `Settings.svelte` UI — only add `pushProvidersToServer()` calls after existing save/auth operations
  - Do NOT add error UI for push failures — silently retry or log to console
  - Do NOT send credentials in logs or console output

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Involves Svelte/TypeScript, SQLite reads, HTTP fetch, async retry logic. Moderate complexity touching multiple desktop files.
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit for desktop changes
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI changes in this task
    - `playwright`: Desktop app verification is complex (Tauri + Svelte); curl-based verification of the result is more reliable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Task 4 (re-push on restart depends on push mechanism existing)
  - **Blocked By**: Task 2 (needs /internal/providers endpoint to exist)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/server.ts` — Existing event listener pattern (`listenServerLogs`, `listenServerStatus`, `listenSessionComplete`). Follow this pattern for detecting server readiness and triggering push.
  - `ogre-desktop/src/pages/Settings.svelte` — `saveProvider()`, `startAuth()`, `signOut()` functions. These are the trigger points where `pushProvidersToServer()` should be called after the primary operation.

  **API/Type References**:
  - `ogre-desktop/src/lib/db.ts:getProviderConfigs()` — Returns `ProviderConfig[]` from SQLite
  - `ogre-desktop/src/lib/db.ts:getOAuthToken(provider)` — Returns `OAuthToken | null` for a given provider
  - `ogre-desktop/src/lib/db.ts:ProviderConfig` — `{id, api_url?, api_key?, model?, is_active}`
  - `ogre-desktop/src/lib/db.ts:OAuthToken` — `{provider, access_token, refresh_token?, token_type?, expires_at?}`

  **Documentation References**:
  - Task 2 in this plan — Defines the `POST /internal/providers` request shape that this function must produce

  **WHY Each Reference Matters**:
  - `server.ts` shows how the desktop currently interacts with the sidecar — follow its event-based patterns
  - `Settings.svelte` functions are where we hook in the push triggers — must understand when saves/auths complete
  - `db.ts` functions are the data source — we read from these to build the push payload
  - Task 2's endpoint spec defines the exact JSON shape we must produce

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Desktop push function builds correct payload shape
    Tool: Bash (grep + code review)
    Preconditions: pushProvidersToServer function created
    Steps:
      1. grep -n "pushProvidersToServer" ogre-desktop/src/lib/server.ts (or provider-sync.ts)
         Assert: Function exists
      2. grep -n "getProviderConfigs\|getOAuthToken" in the push function
         Assert: Both db.ts functions are called
      3. grep -n "/internal/providers" in the push function
         Assert: POSTs to correct endpoint
      4. grep -n "token.*uuid\|crypto.*random\|uuid" in the push function
         Assert: Generates a UUID/random token
    Expected Result: Push function reads DB, builds payload, POSTs to server
    Evidence: Code grep output saved

  Scenario: Push is called after provider save in Settings
    Tool: Bash (grep)
    Preconditions: Settings.svelte updated
    Steps:
      1. grep -A3 "saveProviderConfig" ogre-desktop/src/pages/Settings.svelte
         Assert: pushProvidersToServer() is called after save operations
      2. grep -A3 "signOut\|startAuth\|DeviceFlow\|CodePaste" ogre-desktop/src/pages/Settings.svelte
         Assert: pushProvidersToServer() is called after auth operations
    Expected Result: Config push happens on every config-altering action
    Evidence: grep output saved

  Scenario: Health check retry before push
    Tool: Bash (grep)
    Preconditions: Push function created
    Steps:
      1. grep -n "health\|retry\|backoff\|attempt" in push function file
         Assert: Retry logic exists for health check
    Expected Result: Desktop waits for server to be healthy before pushing
    Evidence: grep output saved

  Scenario: End-to-end push verification (manual simulation)
    Tool: Bash (curl)
    Preconditions: grading-server running (from Task 2)
    Steps:
      1. Simulate what desktop push does:
         curl -s -X POST http://localhost:3456/internal/providers \
           -H "Content-Type: application/json" \
           -d '{"token":"desktop-gen-uuid","providers":[{"id":"openai","api_url":"https://api.openai.com/v1","model":"gpt-4o","is_active":true,"credentials":{"api_key":"sk-test"}}]}'
         Assert: 200 OK
      2. curl -s -H "Origin: chrome-extension://test" http://localhost:3456/api/handshake
         Assert: 200 with token "desktop-gen-uuid"
      3. curl -s -H "Authorization: Bearer desktop-gen-uuid" http://localhost:3456/api/providers
         Assert: 200 with providers array containing openai
    Expected Result: Full push → handshake → read flow works
    Evidence: curl outputs saved to .sisyphus/evidence/task-3-e2e-push.txt
  ```

  **Evidence to Capture:**
  - [ ] Code grep outputs in `.sisyphus/evidence/task-3-push-code.txt`
  - [ ] E2E curl test in `.sisyphus/evidence/task-3-e2e-push.txt`

  **Commit**: YES
  - Message: `feat(desktop): push provider config to grading-server on startup and config changes`
  - Files: `ogre-desktop/src/lib/server.ts` (or `provider-sync.ts`), `ogre-desktop/src/pages/Settings.svelte`
  - Pre-commit: Verify push function exists and is called from Settings.svelte

---

- [ ] 4. Desktop: Server Event Handling (Re-Push + Write-Back Persistence)

  **What to do**:
  
  **Part A: Re-push config on server restart**
  - In `ogre-desktop/src/lib/server.ts`, listen for the `server-status` Tauri event (already exists via `listenServerStatus()`).
  - When the server status changes to `running` (after a restart), call `pushProvidersToServer()` to re-push config (since in-memory state is lost on server restart).
  - Hook into the existing `listenServerStatus()` listener.
  - Add the health check retry before re-push (same as Task 3) — the server may report `running` before Hono is fully bound to port.

  **Part B: Handle `provider_changed` events from server (write-back persistence)**
  - The grading-server (Task 2) emits `{"type": "provider_changed", "provider_id": "...", "model": "..."}` to stdout when the extension switches the active provider.
  - The Rust sidecar (`ogre-desktop/src-tauri/src/lib.rs`) currently only parses `session_complete` events from stdout. **Add parsing for `provider_changed` events** following the exact same pattern:
    1. In `lib.rs`, find the stdout line parser that detects `"type": "session_complete"`. Add a parallel check for `"type": "provider_changed"`.
    2. When detected, emit a new Tauri event (e.g., `provider-changed`) with the `provider_id` and `model` fields.
  - In `ogre-desktop/src/lib/server.ts`, add a new listener function `listenProviderChanged()` (following the `listenSessionComplete()` pattern):
    1. Listen for the `provider-changed` Tauri event.
    2. When received, call `updateActiveProvider(providerId, model)` — a new db.ts function that sets `is_active = 1` for the target provider and `is_active = 0` for all others, and updates the model field.
  - Add `updateActiveProvider(providerId: string, model: string)` to `ogre-desktop/src/lib/db.ts` — two SQL statements: `UPDATE provider_configs SET is_active = 0` then `UPDATE provider_configs SET is_active = 1, model = ? WHERE id = ?`.
  - Call `listenProviderChanged()` from the app initialization (same place `listenSessionComplete()` is called).

  **Must NOT do**:
  - Do NOT add new Tauri event types beyond `provider-changed` (keep it minimal)
  - Do NOT implement server health monitoring or auto-restart logic
  - Do NOT modify the `session_complete` parsing in lib.rs — only add parallel handling for `provider_changed`
  - Do NOT log API keys in the provider_changed event (it only contains provider_id and model)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches Rust (lib.rs), TypeScript (server.ts, db.ts). Two distinct features (re-push + write-back persistence). Requires understanding Tauri sidecar event patterns.
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit for cross-language changes
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI verification needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 6, 7, 8)
  - **Blocks**: None
  - **Blocked By**: Task 3 (needs pushProvidersToServer function), Task 2 (needs server emitting provider_changed)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/server.ts:listenServerStatus()` — Existing event listener for server status. Re-push trigger goes here.
  - `ogre-desktop/src/lib/server.ts:listenSessionComplete()` — **Critical pattern to copy**. This shows exactly how to listen for a Tauri event emitted from stdout parsing and handle it in TypeScript. The new `listenProviderChanged()` follows the same pattern.
  - `ogre-desktop/src-tauri/src/lib.rs` — Stdout line parser. Search for `session_complete` to find the JSON parsing code. Add a parallel branch for `provider_changed`. This is the critical Rust change.
  - `ogre-desktop/src/lib/server.ts` (or `provider-sync.ts`) — `pushProvidersToServer()` from Task 3

  **API/Type References**:
  - `ogre-desktop/src-tauri/src/lib.rs` — Search for `server-status` or `server_status` event emission to understand status strings.
  - `ogre-desktop/src/lib/db.ts` — Existing SQL patterns for UPDATE statements. Follow the same `execute()` pattern for the new `updateActiveProvider()` function.
  - Task 2's stdout format: `{"type": "provider_changed", "provider_id": "openai", "model": "gpt-4o"}` — this is what lib.rs must parse.

  **WHY Each Reference Matters**:
  - `listenSessionComplete()` is the **exact pattern to replicate** for `listenProviderChanged()` — same event listening, same DB update pattern
  - `lib.rs` stdout parser is where the new event type must be recognized — without this, the `provider_changed` JSON line is silently ignored and the write-back never persists to SQLite
  - `db.ts` SQL patterns ensure the new `updateActiveProvider()` function is consistent with existing DB operations

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Server status listener triggers re-push
    Tool: Bash (grep)
    Preconditions: server.ts updated
    Steps:
      1. grep -A10 "listenServerStatus\|server-status\|server_status" ogre-desktop/src/lib/server.ts
         Assert: Contains a call to pushProvidersToServer when status indicates "running"
      2. grep -n "pushProvidersToServer" ogre-desktop/src/lib/server.ts
         Assert: Called in at least 2 places (startup + restart listener)
    Expected Result: Config is re-pushed whenever server reports running status
    Evidence: grep output saved to .sisyphus/evidence/task-4-repush.txt

  Scenario: lib.rs parses provider_changed events from stdout
    Tool: Bash (grep)
    Preconditions: lib.rs updated
    Steps:
      1. grep -n "provider_changed\|provider-changed" ogre-desktop/src-tauri/src/lib.rs
         Assert: At least 1 match (new event type is parsed)
      2. grep -B5 -A10 "provider_changed" ogre-desktop/src-tauri/src/lib.rs
         Assert: Shows JSON parsing logic that extracts provider_id and model, then emits a Tauri event
      3. grep -n "session_complete" ogre-desktop/src-tauri/src/lib.rs
         Assert: Still exists (not broken by the addition)
    Expected Result: lib.rs recognizes both session_complete AND provider_changed event types
    Evidence: grep output saved to .sisyphus/evidence/task-4-librs-parsing.txt

  Scenario: listenProviderChanged() updates SQLite
    Tool: Bash (grep)
    Preconditions: server.ts and db.ts updated
    Steps:
      1. grep -n "listenProviderChanged\|provider-changed" ogre-desktop/src/lib/server.ts
         Assert: New listener function exists
      2. grep -n "updateActiveProvider" ogre-desktop/src/lib/db.ts
         Assert: New function exists with SQL UPDATE statements
      3. grep -A10 "updateActiveProvider" ogre-desktop/src/lib/db.ts
         Assert: Sets is_active = 0 for all, then is_active = 1 for target provider
    Expected Result: Provider changes from extension persist to desktop SQLite
    Evidence: grep output saved to .sisyphus/evidence/task-4-writeback-persistence.txt

  Scenario: listenProviderChanged() is initialized at app startup
    Tool: Bash (grep)
    Preconditions: App initialization code updated
    Steps:
      1. grep -n "listenProviderChanged\|listenSessionComplete" ogre-desktop/src/lib/server.ts ogre-desktop/src/App.svelte ogre-desktop/src/main.ts
         Assert: Both listeners are called from the same initialization point
    Expected Result: Write-back listener is active from app startup
    Evidence: grep output saved
  ```

  **Evidence to Capture:**
  - [ ] grep output for re-push in `.sisyphus/evidence/task-4-repush.txt`
  - [ ] grep output for lib.rs parsing in `.sisyphus/evidence/task-4-librs-parsing.txt`
  - [ ] grep output for write-back persistence in `.sisyphus/evidence/task-4-writeback-persistence.txt`

  **Commit**: YES
  - Message: `feat(desktop): handle server restart re-push and provider write-back persistence`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`, `ogre-desktop/src/lib/server.ts`, `ogre-desktop/src/lib/db.ts`
  - Pre-commit: grep verification of all 3 files

---

- [ ] 5. Extension: Desktop Connection + Provider Fetch

  **What to do**:
  - Add a new module or section in `sidepanel.js` for desktop communication:
    - `connectToDesktop()` — Attempts handshake: `fetch("http://localhost:3456/api/handshake")` (Chrome extensions with `<all_urls>` can fetch localhost directly, no need for proxyFetch). Stores token in module-level variable. Returns `{ connected: true, token }` or `{ connected: false, reason: "..." }`.
    - `fetchProvidersFromDesktop(token)` — Calls `GET http://localhost:3456/api/providers` with `Authorization: Bearer <token>`. Parses response. Returns provider config array.
    - `loadProviderConfig()` — Orchestrator: tries `connectToDesktop()`. If successful, calls `fetchProvidersFromDesktop()` and populates provider state from response. If failed, falls back to `loadState()` (existing chrome.storage.local path). Sets a `desktopConnected` flag.
  - **On panel open**: Call `loadProviderConfig()` instead of directly calling `loadState()`.
  - **Manual refresh**: Add a refresh button handler that re-calls `loadProviderConfig()`.
  - Store fetched provider configs in a module-level variable (not chrome.storage.local — desktop data stays in memory, not persisted locally to avoid stale data).
  - The fetched config must be wired into the existing provider adapters: when the extension goes to make an API call, it uses the credentials from the desktop-fetched config instead of chrome.storage.local.

  **Must NOT do**:
  - Do NOT use proxyFetch for grading-server calls — direct fetch works for localhost
  - Do NOT persist desktop-fetched config to chrome.storage.local (prevents stale data)
  - Do NOT add polling or automatic refresh
  - Do NOT touch provider adapter logic (buildChatRequest, streaming) — only change where config comes from
  - Do NOT remove the existing loadState() function — it's needed for fallback mode (Task 7)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core extension logic change — wiring a new data source into existing state management. Needs deep understanding of sidepanel.js state flow.
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit for extension connection logic
  - **Skills Evaluated but Omitted**:
    - `playwright`: Verification will be done in Task 6/7 where the UI is actually testable
    - `frontend-ui-ux`: Logic-only task, no visual changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 3)
  - **Blocks**: Tasks 6, 7, 8 (all depend on this connection mechanism)
  - **Blocked By**: Task 2 (needs server endpoints to exist)

  **References**:

  **Pattern References**:
  - `sidepanel.js:loadState()` (around line 1856) — Existing state loading from chrome.storage.local. The new `loadProviderConfig()` wraps this as the fallback path.
  - `sidepanel.js` — How provider config is consumed: look for where `apiKey`, `apiUrl`, `model` are read from state and passed to provider adapters. The desktop-fetched config must populate these same variables.
  - `batch-grader.js` — How it detects grading-server availability: look for `http://localhost:3456` fetch calls. May have an existing pattern for server detection.

  **API/Type References**:
  - Task 2 endpoint specs — `GET /api/handshake` response shape `{ token }`, `GET /api/providers` response shape `{ providers: [{ id, api_url, model, is_active, credentials }] }`

  **WHY Each Reference Matters**:
  - `loadState()` is the function being augmented — must understand what state variables it sets so the desktop path sets the same ones
  - Provider config consumption points tell us what shape the data needs to be in for adapters to work
  - batch-grader.js may have reusable server detection patterns

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Extension connects to desktop and fetches providers
    Tool: Bash (grep + curl simulation)
    Preconditions: sidepanel.js updated, grading-server running with config pushed
    Steps:
      1. grep -n "connectToDesktop\|fetchProvidersFromDesktop\|loadProviderConfig" sidepanel.js
         Assert: All 3 functions exist
      2. grep -n "api/handshake" sidepanel.js
         Assert: Handshake URL present in connection logic
      3. grep -n "api/providers" sidepanel.js
         Assert: Provider fetch URL present
      4. grep -n "Authorization.*Bearer" sidepanel.js
         Assert: Token is sent in Authorization header
      5. grep -n "desktopConnected\|desktop_connected\|isDesktopConnected" sidepanel.js
         Assert: Connection state flag exists
    Expected Result: Extension has complete desktop connection flow
    Evidence: grep output saved to .sisyphus/evidence/task-5-connection-code.txt

  Scenario: Fallback to chrome.storage.local preserved
    Tool: Bash (grep)
    Preconditions: sidepanel.js updated
    Steps:
      1. grep -n "loadState\|chrome.storage" sidepanel.js
         Assert: loadState function still exists
      2. grep -B5 -A10 "loadProviderConfig\|loadState" sidepanel.js
         Assert: loadProviderConfig calls loadState as fallback when desktop unavailable
    Expected Result: Existing chrome.storage path is preserved as fallback
    Evidence: grep output saved
  ```

  **Evidence to Capture:**
  - [ ] Code grep outputs in `.sisyphus/evidence/task-5-connection-code.txt`

  **Commit**: YES
  - Message: `feat(extension): add desktop connection and provider fetch via grading-server`
  - Files: `sidepanel.js`
  - Pre-commit: grep verification of connection functions

---

- [ ] 6. Extension: Simplified Provider UI

  **What to do**:
  - **When desktop is connected** (`desktopConnected === true`):
    - Replace the current provider tab bar (with individual tabs per provider, config forms, OAuth buttons) with:
      1. A **"Connected to O.G.R.E Desktop"** status banner (green indicator + text)
      2. A **provider/model dropdown** that lists all providers fetched from desktop. Show provider name + model as dropdown options. Pre-select the active provider (is_active === true).
      3. A **"Configure in Desktop App"** button/link that instructs user to open the desktop Settings page for provider setup.
      4. A small **refresh button** (🔄) next to the status banner that re-fetches from desktop.
    - Hide the old provider config forms (API key inputs, OAuth buttons, model selectors) — they're not needed in desktop mode.
  - **When desktop is NOT connected** (`desktopConnected === false`):
    - Show the existing provider UI (manual config forms, API key inputs) as-is (this is Task 7's territory, but the UI toggle mechanism lives here).
    - Show a **"Desktop app not running"** banner (yellow/orange indicator) with brief instructions: "Start the O.G.R.E Desktop app to sync providers automatically, or configure manually below."
  - The dropdown `onchange` handler should update the extension's active provider state and trigger Task 8's write-back.
  - Modify `sidepanel.html` to add the new UI elements (banner, dropdown, button). Use CSS classes to toggle between desktop-mode and manual-mode views.

  **Must NOT do**:
  - Do NOT redesign the entire sidepanel layout — only change the provider section
  - Do NOT remove manual config UI elements from HTML — just hide/show them based on mode
  - Do NOT add new CSS frameworks or libraries
  - Do NOT change grading/solver/batch mode UI — only provider selection area

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI work — creating new DOM elements, CSS toggle states, dropdown component, status indicators. Needs visual design sense.
  - **Skills**: [`playwright`, `frontend-ui-ux`]
    - `playwright`: Verify the UI renders correctly in both modes via screenshot
    - `frontend-ui-ux`: Design the status banner, dropdown, and mode toggle to look polished
  - **Skills Evaluated but Omitted**:
    - `git-master`: Can be loaded but visual verification is more important here

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 4, 7, 8)
  - **Blocks**: Task 9 (OAuth cleanup depends on new UI being in place)
  - **Blocked By**: Task 5 (needs desktop connection mechanism + data to display)

  **References**:

  **Pattern References**:
  - `sidepanel.html` — Existing provider section markup. Look for the provider tab bar, config form containers, model selectors. The new UI replaces/overlays this section.
  - `sidepanel.js` — How provider UI is currently populated and toggled. Look for event listeners on provider tabs, how model dropdowns are populated, how the active provider is highlighted.
  - `sidepanel.html` + `sidepanel.js` — Existing CSS class toggle patterns for mode switching (grader/solver/batch). Follow the same pattern for desktop-mode/manual-mode toggling.

  **API/Type References**:
  - Task 5's `desktopConnected` flag — Drives which UI mode to show
  - Task 2's GET /api/providers response shape — Data source for dropdown population

  **WHY Each Reference Matters**:
  - Existing HTML structure determines where new elements go and what gets hidden
  - Existing JS event patterns show how to wire up the new dropdown and refresh button consistently
  - Existing mode toggling (grader/solver/batch) is the exact pattern to follow for desktop/manual mode

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Desktop-connected mode shows simplified UI
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, grading-server running with providers pushed
    Steps:
      1. Open Chrome extension side panel
      2. Wait for: connection status indicator visible (timeout: 5s)
      3. Assert: Green "Connected to O.G.R.E Desktop" banner visible
      4. Assert: Provider/model dropdown exists and is populated
      5. Assert: Dropdown shows the active provider pre-selected
      6. Assert: "Configure in Desktop App" button/link visible
      7. Assert: Refresh button (🔄) visible
      8. Assert: Old provider tabs / API key inputs are NOT visible
      9. Screenshot: .sisyphus/evidence/task-6-desktop-connected.png
    Expected Result: Clean, simplified provider UI in desktop mode
    Evidence: .sisyphus/evidence/task-6-desktop-connected.png

  Scenario: Disconnected mode shows manual config + warning
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, grading-server NOT running
    Steps:
      1. Open Chrome extension side panel
      2. Wait for: connection status indicator visible (timeout: 10s, includes connection timeout)
      3. Assert: Yellow/orange "Desktop app not running" banner visible
      4. Assert: Instructions text visible
      5. Assert: Manual provider config UI (API key inputs) IS visible
      6. Assert: Provider dropdown is NOT visible (or shows "Manual Mode")
      7. Screenshot: .sisyphus/evidence/task-6-disconnected.png
    Expected Result: Fallback UI with manual config and clear instructions
    Evidence: .sisyphus/evidence/task-6-disconnected.png

  Scenario: Provider dropdown changes active provider
    Tool: Playwright (playwright skill)
    Preconditions: Desktop connected, multiple providers available
    Steps:
      1. Open side panel, verify dropdown populated
      2. Select a different provider from dropdown
      3. Assert: Dropdown value changed
      4. Assert: Extension state reflects new active provider
      5. Screenshot: .sisyphus/evidence/task-6-provider-switch.png
    Expected Result: Switching providers in dropdown updates extension state
    Evidence: .sisyphus/evidence/task-6-provider-switch.png

  Scenario: Refresh button re-fetches from desktop
    Tool: Playwright (playwright skill)
    Preconditions: Desktop connected
    Steps:
      1. Click refresh button
      2. Wait for: brief loading indicator (if any)
      3. Assert: Provider list is repopulated (may be same data)
      4. Assert: Connection status still shows connected
    Expected Result: Refresh works without breaking connection
    Evidence: Screenshot saved
  ```

  **Evidence to Capture:**
  - [ ] Screenshots in `.sisyphus/evidence/task-6-*.png`

  **Commit**: YES
  - Message: `feat(extension): add simplified provider UI with desktop connection status`
  - Files: `sidepanel.html`, `sidepanel.js`
  - Pre-commit: Visual verification via Playwright screenshots

---

- [ ] 7. Extension: Fallback Mode (Auto-Detect)

  **What to do**:
  - Refine the `loadProviderConfig()` function from Task 5 to handle all failure modes gracefully:
    - **Server not running**: fetch to localhost:3456 fails with network error → fall back to chrome.storage.local
    - **Server running but no config pushed (503 from handshake)**: Desktop hasn't started or hasn't pushed yet → show "Waiting for O.G.R.E Desktop..." state briefly, then fall back to manual mode after timeout (e.g., 3 seconds)
    - **Handshake rejected (403)**: Unexpected Origin → fall back to manual mode with error note
    - **Token invalid (401 on /api/providers)**: Server restarted and token changed → attempt re-handshake once, then fall back
  - In fallback mode:
    - Set `desktopConnected = false`
    - Load config from chrome.storage.local via existing `loadState()` function
    - Show manual config UI (Task 6 handles the display toggle)
    - All existing chrome.storage.local provider management continues to work as-is
  - Remove all OAuth-related code paths from the fallback mode — manual mode supports API key entry only (OAuth will be fully removed in Task 9, but the fallback flow should already not depend on it).
  - Add a "Retry Connection" button in the disconnected state that re-attempts `connectToDesktop()`.

  **Must NOT do**:
  - Do NOT remove loadState() or chrome.storage.local read/write code — it IS the fallback
  - Do NOT add periodic retry/polling — manual retry button only
  - Do NOT show error toasts for expected failures (server not running is expected, not an error)
  - Do NOT make fallback mode feel like a broken state — it should feel like a valid alternative mode

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Error handling logic with multiple failure modes, state machine for connection status. Needs careful async flow handling.
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit
  - **Skills Evaluated but Omitted**:
    - `playwright`: UI aspects handled in Task 6; this is logic-focused
    - `frontend-ui-ux`: Minimal UI additions (retry button)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 4, 6, 8)
  - **Blocks**: Task 9 (OAuth cleanup depends on fallback being solid)
  - **Blocked By**: Task 5 (needs desktop connection mechanism)

  **References**:

  **Pattern References**:
  - `sidepanel.js:loadState()` — The existing state loading function. This IS the fallback path. Must remain functional.
  - `sidepanel.js` — How errors are currently handled in the UI (look for error message patterns, loading states).
  - `batch-grader.js` — How it detects if grading-server is available. Look for try/catch around fetch to localhost:3456. May have a reusable pattern.

  **API/Type References**:
  - Task 2 endpoint error responses — 401 (bad token), 403 (bad origin), 503 (no config yet). Each needs specific handling.
  - Task 5's `connectToDesktop()` — Returns `{ connected, reason }` which drives the fallback decision.

  **WHY Each Reference Matters**:
  - `loadState()` must be preserved intact — it's the core of fallback mode
  - Existing error handling patterns ensure consistency in UX
  - Server error codes from Task 2 determine which fallback path to take

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Extension works when desktop is not running
    Tool: Playwright (playwright skill)
    Preconditions: grading-server NOT running on port 3456, extension has manual config in chrome.storage.local
    Steps:
      1. Open Chrome extension side panel
      2. Wait for: UI to finish loading (timeout: 10s, includes connection timeout)
      3. Assert: "Desktop app not running" state is shown (not an error)
      4. Assert: Manual API key input fields are visible and functional
      5. Assert: "Retry Connection" button is visible
      6. Fill an API key input, verify it saves to chrome.storage.local
      7. Screenshot: .sisyphus/evidence/task-7-no-desktop.png
    Expected Result: Extension is fully functional in manual mode
    Evidence: .sisyphus/evidence/task-7-no-desktop.png

  Scenario: Extension recovers when desktop starts after extension
    Tool: Playwright (playwright skill)
    Preconditions: Extension open in manual mode, then grading-server starts
    Steps:
      1. Verify extension is in manual/fallback mode
      2. Start grading-server and push config (simulate with curl)
      3. Click "Retry Connection" button in extension
      4. Wait for: connection status to update (timeout: 5s)
      5. Assert: Status changes to "Connected to O.G.R.E Desktop"
      6. Assert: Provider dropdown appears with desktop providers
      7. Screenshot: .sisyphus/evidence/task-7-recovery.png
    Expected Result: Extension transitions from manual to desktop mode
    Evidence: .sisyphus/evidence/task-7-recovery.png

  Scenario: Graceful handling of 503 (no config yet)
    Tool: Bash (curl simulation) + code review
    Preconditions: Server running but no config pushed
    Steps:
      1. grep -A20 "connectToDesktop\|503\|handshake" sidepanel.js
         Assert: 503 response is handled (not treated as fatal error)
      2. Verify code shows a "waiting" state or falls back gracefully
    Expected Result: 503 doesn't crash extension, shows appropriate state
    Evidence: grep output saved

  Scenario: Re-handshake on 401
    Tool: Bash (code review)
    Preconditions: sidepanel.js updated
    Steps:
      1. grep -A10 "401\|re-handshake\|retry.*handshake" sidepanel.js
         Assert: 401 response triggers a re-handshake attempt before falling back
    Expected Result: Extension tries to recover from stale token before giving up
    Evidence: grep output saved
  ```

  **Evidence to Capture:**
  - [ ] Screenshots in `.sisyphus/evidence/task-7-*.png`
  - [ ] Code review outputs in `.sisyphus/evidence/task-7-fallback-code.txt`

  **Commit**: YES
  - Message: `feat(extension): add graceful fallback to manual config when desktop unavailable`
  - Files: `sidepanel.js`
  - Pre-commit: Test both connected and disconnected paths

---

- [ ] 8. Extension: Active Provider Write-Back

  **What to do**:
  - When the user changes the active provider/model via the dropdown (Task 6), send the selection to the server:
    - `POST http://localhost:3456/api/providers/active` with `Authorization: Bearer <token>` and body `{ "provider_id": "<id>", "model": "<model>" }`.
  - This fires when the dropdown `onchange` event occurs (from Task 6).
  - Fire-and-forget: Don't block the UI on the response. If the POST fails (server down, network error), log to console but don't show an error — the local state is already updated.
  - Only send write-back when in desktop-connected mode. In manual/fallback mode, save to chrome.storage.local as before (existing behavior).
  - The server (Task 2) emits the change to stdout → desktop picks it up → updates SQLite. This task only handles the extension → server leg.

  **Must NOT do**:
  - Do NOT block UI on write-back response
  - Do NOT retry failed write-backs — next panel open will re-sync anyway
  - Do NOT send write-back in manual/fallback mode
  - Do NOT modify the provider adapters — only the active selection mechanism

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small feature — one POST call on dropdown change. ~15 lines of code.
  - **Skills**: [`git-master`]
    - `git-master`: Small atomic commit
  - **Skills Evaluated but Omitted**:
    - All others: Too heavyweight

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 4, 6, 7)
  - **Blocks**: None
  - **Blocked By**: Task 2 (needs /api/providers/active endpoint), Task 5 (needs connection + token)

  **References**:

  **Pattern References**:
  - `sidepanel.js` — How provider selection currently triggers state saves. Look for the provider tab click handler or model selector change handler. The write-back piggybacks on this.
  - `batch-grader.js` — `POST /session` is fire-and-forget to grading-server. Follow the same pattern (fetch without awaiting response in the UI flow).

  **API/Type References**:
  - Task 2's `POST /api/providers/active` spec — Request body: `{ provider_id, model }`, requires Bearer token, returns 200

  **WHY Each Reference Matters**:
  - Existing selection handler shows where to hook in the write-back
  - batch-grader.js /session POST is the exact pattern to follow for fire-and-forget server communication

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Provider switch triggers write-back POST
    Tool: Bash (grep + curl)
    Preconditions: sidepanel.js updated, grading-server running with config
    Steps:
      1. grep -n "api/providers/active" sidepanel.js
         Assert: POST endpoint URL exists in code
      2. grep -B5 "api/providers/active" sidepanel.js
         Assert: Called in context of provider/dropdown change handler
      3. grep -n "desktopConnected\|desktop.*connected" near the POST call
         Assert: Write-back is conditional on desktop connection
      4. Simulate: Push config, handshake, then POST active change:
         curl -s -X POST http://localhost:3456/api/providers/active \
           -H "Authorization: Bearer test-token" \
           -H "Content-Type: application/json" \
           -d '{"provider_id":"anthropic","model":"claude-sonnet-4-20250514"}'
         Assert: 200 OK
      5. Verify: GET /api/providers shows anthropic as active
    Expected Result: Write-back updates server state
    Evidence: grep + curl output saved to .sisyphus/evidence/task-8-writeback.txt
  ```

  **Evidence to Capture:**
  - [ ] grep + curl outputs in `.sisyphus/evidence/task-8-writeback.txt`

  **Commit**: YES (groups with Task 6 if same agent)
  - Message: `feat(extension): write active provider selection back to desktop via server`
  - Files: `sidepanel.js`
  - Pre-commit: grep verification

---

- [ ] 9. OAuth Cleanup + Final Verification

  **What to do**:
  - **Delete `oauth-client.js`** entirely.
  - **Update `sidepanel.js`**:
    - Remove all imports/requires of `oauth-client.js`
    - Remove all OAuth-related function calls (e.g., calls to startGitHubAuth, startGoogleAuth, handleOAuthCallback, etc.)
    - Remove OAuth token attachment logic (code that reads OAuth tokens from chrome.storage.local and attaches them to API requests — in desktop mode, tokens come from the desktop via /api/providers credentials)
    - Keep API key reading from chrome.storage.local for fallback mode
  - **Update `sidepanel.html`**:
    - Remove OAuth sign-in button markup (GitHub sign-in, Google sign-in buttons)
    - Remove any OAuth status indicators (signed-in-as-X displays)
    - Keep API key input fields (needed for fallback mode)
  - **Update `manifest.json`**:
    - Remove `oauth-client.js` from any script lists if referenced
    - Keep the `identity` permission for now (removing it is a separate concern — avoids breaking changes)
  - **Check for orphaned files**: Look for `github-auth.js`, `github-auth-ui.html`, or any other OAuth-specific files referenced by oauth-client.js. Delete if they exist and are only used by OAuth.
  - **Final cross-codebase verification**: Verify all 3 codebases use consistent provider IDs and all integration points work.

  **Must NOT do**:
  - Do NOT remove the `identity` permission from manifest.json (safe to keep, risky to remove)
  - Do NOT remove API key input fields from fallback UI
  - Do NOT touch background.js (even if it has OAuth-related message handlers — they become dead code but are harmless)
  - Do NOT decommission the Vercel OAuth backend (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mostly deletion and cleanup. Removing files, removing imports, removing markup. Straightforward.
  - **Skills**: [`git-master`]
    - `git-master`: Clean commit for file deletion + code removal
  - **Skills Evaluated but Omitted**:
    - `playwright`: Final visual verification is valuable but this task is primarily code removal

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (solo — final task)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 6, 7 (need new UI and fallback in place before removing old OAuth paths)

  **References**:

  **Pattern References**:
  - `oauth-client.js` — The file being deleted. Read it first to understand all its exports, then search for those exports across the codebase.
  - `sidepanel.js` — Search for all imports from oauth-client.js and all calls to its functions. These are the removal targets.
  - `sidepanel.html` — Search for OAuth-related markup: sign-in buttons, OAuth status sections.

  **Tool Recommendations**:
  - Use `ast_grep_search` to find all import statements referencing `oauth-client`
  - Use `lsp_find_references` to map all usages of exported functions from `oauth-client.js`
  - Use `grep` to find any remaining string references to OAuth flows

  **WHY Each Reference Matters**:
  - Reading oauth-client.js first gives the complete list of exports to search for — ensures nothing is missed
  - sidepanel.js is the primary consumer — most cleanup happens here
  - sidepanel.html has the buttons/UI that need removal

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: oauth-client.js is completely removed
    Tool: Bash (file check + grep)
    Preconditions: Cleanup complete
    Steps:
      1. ls oauth-client.js 2>&1
         Assert: "No such file" or equivalent (file deleted)
      2. grep -r "oauth-client\|oauth_client\|oauthClient" sidepanel.js sidepanel.html manifest.json background.js
         Assert: Zero matches (no remaining references)
      3. grep -r "launchWebAuthFlow\|chrome\.identity" sidepanel.js
         Assert: Zero matches (no remaining Chrome identity API calls in sidepanel)
      4. grep -r "startGitHubAuth\|startGoogleAuth\|handleOAuthCallback" sidepanel.js
         Assert: Zero matches (no remaining OAuth function calls)
    Expected Result: Complete OAuth removal from extension (except identity permission in manifest)
    Evidence: grep output saved to .sisyphus/evidence/task-9-oauth-removal.txt

  Scenario: OAuth UI elements removed from HTML
    Tool: Bash (grep)
    Preconditions: sidepanel.html updated
    Steps:
      1. grep -in "sign.in.*github\|sign.in.*google\|oauth.*button\|auth.*button" sidepanel.html
         Assert: Zero matches (OAuth sign-in buttons removed)
      2. grep -in "signed.in.as\|oauth.*status\|auth.*status" sidepanel.html
         Assert: Zero matches (OAuth status displays removed)
      3. grep -in "api.key\|api_key\|apikey" sidepanel.html
         Assert: At least 1 match (API key inputs preserved for fallback)
    Expected Result: OAuth UI gone, API key UI preserved
    Evidence: grep output saved

  Scenario: Extension still loads and works after cleanup
    Tool: Playwright (playwright skill)
    Preconditions: Extension reloaded after cleanup, grading-server running with config
    Steps:
      1. Open Chrome extension side panel
      2. Wait for: side panel to fully load (timeout: 10s)
      3. Assert: No JavaScript errors in console
      4. Assert: Provider section is functional (desktop-connected or manual mode)
      5. Assert: No "oauth" or "sign in" buttons visible
      6. Screenshot: .sisyphus/evidence/task-9-final-clean.png
    Expected Result: Extension works cleanly without OAuth
    Evidence: .sisyphus/evidence/task-9-final-clean.png

  Scenario: Final provider ID consistency check
    Tool: Bash (grep)
    Preconditions: All tasks complete
    Steps:
      1. grep -rn "'ollama'\|\"ollama\"" providers.js
         Assert: Matches present (unified ollama adapter)
      2. grep -rn "'ollama-cloud'\|'ollama-local'" providers.js sidepanel.js batch-grader.js
         Assert: Zero matches (old IDs gone)
      3. grep -rn "'google-gemini'" providers.js grading-server/server.js grading-server/providers.js
         Assert: Matches in all 3 files (consistent ID)
      4. grep -rn "'gemini'" grading-server/server.js grading-server/providers.js
         Assert: Zero matches except inside 'google-gemini' string (old standalone 'gemini' gone)
    Expected Result: All 3 codebases use identical canonical provider IDs
    Evidence: grep output saved to .sisyphus/evidence/task-9-final-ids.txt

  Scenario: Fallback mode works without OAuth
    Tool: Playwright (playwright skill)
    Preconditions: grading-server NOT running, extension loaded
    Steps:
      1. Open side panel
      2. Wait for: manual mode UI (timeout: 10s)
      3. Assert: API key input visible and editable
      4. Assert: No OAuth sign-in buttons visible
      5. Enter a test API key, verify it saves
      6. Screenshot: .sisyphus/evidence/task-9-fallback-no-oauth.png
    Expected Result: Manual mode works with API keys only, no OAuth
    Evidence: .sisyphus/evidence/task-9-fallback-no-oauth.png
  ```

  **Evidence to Capture:**
  - [ ] grep outputs in `.sisyphus/evidence/task-9-*.txt`
  - [ ] Screenshots in `.sisyphus/evidence/task-9-*.png`

  **Commit**: YES
  - Message: `refactor(extension): remove OAuth client and clean up auth UI — desktop owns all auth`
  - Files: `oauth-client.js` (deleted), `sidepanel.js`, `sidepanel.html`, `manifest.json` (if changed)
  - Pre-commit: Full grep verification + extension load test

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 1 | `refactor(providers): standardize provider IDs across extension, server, and desktop` | providers.js, grading-server/server.js, grading-server/providers.js, sidepanel.js, sidepanel.html, batch-grader.js | grep for old IDs → zero matches |
| 2 | `feat(server): add provider config endpoints with handshake auth for extension bridge` | grading-server/server.js | curl all endpoints |
| 3 | `feat(desktop): push provider config to grading-server on startup and config changes` | ogre-desktop/src/lib/server.ts (or provider-sync.ts), ogre-desktop/src/pages/Settings.svelte | grep for push function + trigger points |
| 4 | `feat(desktop): handle server restart re-push and provider write-back persistence` | ogre-desktop/src-tauri/src/lib.rs, ogre-desktop/src/lib/server.ts, ogre-desktop/src/lib/db.ts | grep for event parsing + listener + DB update |
| 5 | `feat(extension): add desktop connection and provider fetch via grading-server` | sidepanel.js | grep for connection functions |
| 6 | `feat(extension): add simplified provider UI with desktop connection status` | sidepanel.html, sidepanel.js | Playwright screenshots |
| 7 | `feat(extension): add graceful fallback to manual config when desktop unavailable` | sidepanel.js | Playwright connected + disconnected tests |
| 8 | `feat(extension): write active provider selection back to desktop via server` | sidepanel.js | curl + grep |
| 9 | `refactor(extension): remove OAuth client and clean up auth UI — desktop owns all auth` | oauth-client.js (deleted), sidepanel.js, sidepanel.html | grep zero matches + Playwright |

---

## Success Criteria

### Verification Commands
```bash
# 1. Provider IDs consistent
grep -r "ollama-cloud\|ollama-local" providers.js sidepanel.js batch-grader.js  # Expected: zero matches
grep -r "'gemini'" grading-server/server.js  # Expected: zero matches (except inside 'google-gemini')

# 2. Server endpoints work
curl -s http://localhost:3456/health  # Expected: 200
curl -s -X POST http://localhost:3456/internal/providers -H "Content-Type: application/json" -d '{"token":"t","providers":[]}'  # Expected: 200
curl -s -H "Origin: chrome-extension://test" http://localhost:3456/api/handshake  # Expected: 200 with token
curl -s -H "Authorization: Bearer t" http://localhost:3456/api/providers  # Expected: 200 with providers

# 3. OAuth fully removed
ls oauth-client.js  # Expected: not found
grep -r "oauth-client" sidepanel.js  # Expected: zero matches
grep -r "launchWebAuthFlow" sidepanel.js  # Expected: zero matches

# 4. Extension loads without errors
# (Playwright: open side panel, check console for errors, screenshot)
```

### Final Checklist
- [ ] Desktop → server config push works on startup
- [ ] Desktop → server config re-push works on server restart
- [ ] Extension → server handshake works with chrome-extension:// Origin
- [ ] Extension → server provider fetch returns full config with credentials
- [ ] Extension → server active provider write-back updates server + emits stdout
- [ ] Server stdout `provider_changed` event parsed by lib.rs + persisted to desktop SQLite
- [ ] CORS allowHeaders includes `Authorization` (required for Bearer token from extension)
- [ ] Extension shows simplified UI when desktop connected
- [ ] Extension shows manual config UI when desktop disconnected
- [ ] Extension fallback mode works with API keys (no OAuth)
- [ ] oauth-client.js is deleted, zero OAuth references remain
- [ ] All 3 codebases use canonical provider IDs
- [ ] Existing /health, /grade, /session endpoints are unaffected
- [ ] background.js proxy fetch is untouched
- [ ] No API keys logged to stdout
