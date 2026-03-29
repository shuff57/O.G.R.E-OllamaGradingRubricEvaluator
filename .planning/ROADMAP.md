# Roadmap: O.G.R.E Security Hardening

**Milestone:** v1.0 Security Hardening
**Phases:** 6
**Requirements:** 20

## Phase 1: Quick Wins — Sandbox & IPC Lockdown

**Goal:** Close the lowest-effort, highest-impact holes: enable sandbox on embedded views, remove the generic IPC passthrough, and stop advertising the debug port.

**Requirements:**
- IPC-01: Remove the generic `invoke` passthrough in preload.ts; all IPC calls use named, typed functions
- IPC-04: Enable WebContentsView sandbox (`sandbox: true` in browser-manager.ts)
- PORT-02: Remove CDP port advertisement file; `--remote-debugging-port` flag only set in development builds

**Success Criteria:**
1. `preload.ts` exposes no generic `invoke` function; attempting to call it from the renderer throws an error
2. WebContentsView instances launch with `sandbox: true` confirmed in Electron DevTools process info
3. Production builds do not write `~/.ogre/cdp-port` and do not pass `--remote-debugging-port` to Chromium

**Dependencies:** None

---

## Phase 2: Server Auth & CORS

**Goal:** Neutralize the critical exfiltration chain — restrict which origins can call the server, replace the unauthenticated handshake with a spawn-time secret, and redact API keys from responses.

**Requirements:**
- AUTH-01: CORS origin restricted to localhost and 127.0.0.1 (no wildcard)
- AUTH-02: Handshake token endpoint replaced with spawn-time shared secret passed via environment variable
- AUTH-03: `/api/providers` endpoint redacts API keys, access tokens, and refresh tokens (returns masked values like `sk-...xxxx`)

**Success Criteria:**
1. Cross-origin requests from non-localhost origins receive a CORS rejection (403/preflight failure)
2. Server rejects requests without the spawn-time Bearer token with 401
3. GET `/api/providers` returns provider configs with all keys masked; full keys never appear in the response body

**Dependencies:** None

---

## Phase 3: XSS Prevention

**Goal:** Prevent AI-generated or injected HTML from executing scripts in the renderer or embedded views.

**Requirements:**
- XSS-01: AI-generated feedback HTML is sanitized via DOMPurify before innerHTML injection in batch-grader.ts
- XSS-02: Markdown-rendered AI responses are sanitized via DOMPurify before `{@html}` injection in ResponseRenderer.svelte and other rendering surfaces
- XSS-03: Content Security Policy set on the Electron renderer via `session.webRequest.onHeadersReceived`, restricting `script-src`, `connect-src`, and `default-src`

**Success Criteria:**
1. A feedback string containing `<script>alert(1)</script>` or `<img onerror="alert(1)">` is rendered without executing JavaScript
2. CSP headers are present on all renderer page loads; inline scripts not in the allowlist are blocked
3. DOMPurify is called on every code path that injects AI-generated HTML (verified by code review / grep)

**Dependencies:** None

---

## Phase 4: Credential Encryption

**Goal:** Encrypt all sensitive credentials at rest using Electron safeStorage (DPAPI on Windows), with safe migration of existing plaintext data.

**Requirements:**
- CRED-01: Site credentials (usernames, passwords) encrypted at rest using Electron safeStorage before SQLite storage
- CRED-02: OAuth tokens (access_token, refresh_token) encrypted at rest using Electron safeStorage before SQLite storage
- CRED-03: AI provider API keys encrypted at rest using Electron safeStorage before SQLite storage
- CRED-04: Existing plaintext credentials migrated to encrypted storage on first launch, using `encryption_version` column for idempotent re-migration
- CRED-05: When safeStorage is unavailable, credentials stored as-is with a logged warning; the app does not crash
- CRED-06: When decryption fails (OS reinstall, profile reset), the credential is cleared and the user is prompted to re-enter it; the app does not crash

**Success Criteria:**
1. After update, SQLite credential columns contain base64-encoded encrypted blobs, not plaintext
2. A fresh install on a new machine with existing database prompts for credential re-entry rather than crashing
3. Running without a keyring (e.g., headless CI) logs a warning and continues with plaintext storage
4. Migration is idempotent: running it twice does not double-encrypt or corrupt data
5. All provider API keys, site passwords, and OAuth tokens are encrypted (verified by direct SQLite inspection)

**Dependencies:** Phase 2 (AUTH-03 masks keys in API responses; encryption secures them at rest)

---

## Phase 5: CDP Migration & IPC Hardening

**Goal:** Eliminate the network-exposed debug port entirely by migrating CDP communication to Electron's `webContents.debugger` API, and replace remaining unsafe IPC handlers with domain-specific operations.

**Requirements:**
- PORT-01: CDP communication migrated from raw debug port (9223) to `webContents.debugger.attach()` API; IPC relay mediates external agent access through the main process
- IPC-02: `dbQuery` and `dbExecute` raw SQL IPC handlers replaced with domain-specific handlers (e.g., `getProviderConfigs`, `saveCredential`, `getGradingSession`)
- IPC-03: `evalWebviewScript` and `injectWebviewScript` replaced with a named-operations registry in the main process (e.g., `fillScore`, `extractStudents`, `clickElement`)

**Success Criteria:**
1. No process listens on port 9223 (or any debug port) in production builds; `netstat` confirms no listening socket
2. Renderer code cannot execute arbitrary SQL; only domain-specific IPC handlers are available
3. Renderer code cannot inject arbitrary JavaScript into webviews; only named operations from the registry execute
4. External CDP agents connect through the IPC relay and can perform grading operations without a raw debug port

**Dependencies:** Phase 1 (IPC-01 removes generic invoke; this phase replaces the remaining specific unsafe handlers)

---

## Phase 6: Port Management & Rate Limiting

**Goal:** Add finishing touches: make the server port configurable and apply rate limiting to prevent abuse without blocking legitimate batch grading.

**Requirements:**
- PORT-03: Grading server port configurable via environment variable with fallback to 3456; server tries alternative ports if primary is in use
- AUTH-04: Rate limiting applied to grading server endpoints, with limits tuned to not block legitimate batch grading operations

**Success Criteria:**
1. Setting `OGRE_PORT=4000` starts the server on port 4000; the Electron app connects to the correct port
2. When port 3456 is occupied, the server binds to the next available port and the app discovers it
3. Rapid sequential requests beyond the rate limit receive 429 responses
4. A full batch grading run (30+ students) completes without hitting rate limits

**Dependencies:** Phase 2 (rate limiting builds on the auth middleware established in Phase 2)

---

*Roadmap created: 2026-03-29*
*Total requirements: 20 (verified — all v1 requirements assigned)*
