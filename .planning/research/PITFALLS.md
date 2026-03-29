# Security Hardening Pitfalls for Electron Desktop Apps

Research document for the O.G.R.E security hardening sprint.
Covers common mistakes, regressions, and "security theater" patterns specific to Electron apps with local servers, SQLite storage, and CDP automation.

---

## 1. safeStorage Migration Pitfalls

### 1.1 Data Loss During Credential Migration

**The mistake:** Running a one-shot migration that reads plaintext credentials, encrypts them with `safeStorage.encryptString()`, writes the encrypted blobs, then deletes the plaintext -- all in a single transaction. If the app crashes mid-migration, or the encrypted write succeeds but the plaintext delete fails, the database is left in an ambiguous state where some rows are encrypted and some are not.

**O.G.R.E specifics:** The `site_credentials` table stores `username` and `password` as TEXT. The `oauth_tokens` table stores `access_token` and `refresh_token`. The `provider_configs` table stores `api_key`. Three separate tables need migration. A partial migration (e.g., `site_credentials` encrypted but `oauth_tokens` still plaintext) is hard to detect and recover from.

**Prevention:**
- Add an `encryption_version` column (INTEGER DEFAULT 0) to each table. Set it to 1 after encrypting each row. This makes the migration idempotent -- on next launch, only migrate rows where `encryption_version = 0`.
- Never delete plaintext in the same step as writing ciphertext. Overwrite in place: `UPDATE site_credentials SET password = ?, encryption_version = 1 WHERE id = ?`.
- Wrap each table's migration in its own SQLite transaction so a crash mid-table does not corrupt the other tables.

**Warning signs:** Tests that mock `safeStorage` but never test the migration path with a database that has a mix of encrypted and unencrypted rows.

**Phase:** Phase 1 (credential encryption). This must be right before any other hardening work ships, because a botched migration means teachers lose all stored passwords.

### 1.2 safeStorage Unavailable on Headless / CI / Linux Without Keyring

**The mistake:** Calling `safeStorage.encryptString()` without checking `safeStorage.isEncryptionAvailable()` first. On Linux without a keyring (common in CI, containers, and some minimal desktop environments), safeStorage throws. On Windows, DPAPI is always available, but testing on CI runners (GitHub Actions) may behave differently than the developer's machine.

**O.G.R.E specifics:** The CI pipeline runs on Windows (`desktop-build.yml`), and the primary target is Windows 11. But if Linux AppImage builds are ever tested in CI, safeStorage calls will fail. More practically: if the app is launched on a headless Windows session (e.g., Remote Desktop disconnected), DPAPI may return different keys than when the desktop session is active.

**Prevention:**
- Always guard with `safeStorage.isEncryptionAvailable()`. If unavailable, fall back to storing credentials as-is and log a warning.
- In tests, mock `safeStorage` rather than relying on the OS keychain.
- Document the DPAPI session-binding behavior: credentials encrypted in one Windows user session cannot be decrypted in another user's session.

**Warning signs:** Tests pass locally but fail in CI with "Error: safeStorage is not available" or "Error: Encryption failed."

**Phase:** Phase 1. Must be handled in the same migration code.

### 1.3 safeStorage Key Rotation and OS Reinstall

**The mistake:** Assuming encrypted credentials survive an OS reinstall, user profile migration, or Windows domain rejoin. DPAPI keys are tied to the Windows user profile. If the profile is recreated (even with the same username), all safeStorage-encrypted data becomes unreadable garbage.

**O.G.R.E specifics:** Teachers on school-managed machines may have their profiles reset by IT. The app should not silently fail when decryption fails -- it should detect the failure and prompt re-entry of credentials rather than showing cryptic errors or empty fields.

**Prevention:**
- Wrap every `safeStorage.decryptString()` call in a try/catch. On failure, set the credential to empty/null and flag it for re-entry.
- Show a one-time notification: "Some stored passwords could not be recovered. Please re-enter them in Settings."
- Never crash on decryption failure. The app must remain usable.

**Warning signs:** No error handling around `decryptString()`. Tests that only test the happy path (encrypt then decrypt with the same safeStorage instance).

**Phase:** Phase 1. The decryption fallback must ship with the encryption migration.

### 1.4 Encrypted Blobs in TEXT Columns

**The mistake:** `safeStorage.encryptString()` returns a `Buffer` (binary data). Storing raw binary in a SQLite `TEXT` column causes corruption because SQLite TEXT columns assume UTF-8. The buffer must be base64-encoded before storage.

**O.G.R.E specifics:** The existing schema uses `TEXT` for `password`, `api_key`, `access_token`, etc. Changing column types requires an ALTER TABLE migration. It is simpler to store the base64 string in the existing TEXT column.

**Prevention:**
- Always encode: `safeStorage.encryptString(plaintext).toString('base64')`.
- Always decode: `safeStorage.decryptString(Buffer.from(stored, 'base64'))`.
- Add a unit test that round-trips a credential through encrypt -> base64 -> store -> read -> base64 decode -> decrypt.

**Warning signs:** Encrypted credentials that work on write but produce garbled output on read. Tests that compare Buffer objects instead of decoded strings.

**Phase:** Phase 1.

---

## 2. CORS Restriction Gotchas

### 2.1 Breaking the Desktop-to-Server Communication

**The mistake:** Restricting CORS to `http://localhost:3456` (the server's own origin) or a single port, when the Electron renderer loads from a different origin. In dev mode, the Svelte app loads from `http://localhost:5173` (Vite dev server). In production, it loads from `file://` protocol. Both need to reach the grading server at `http://localhost:3456`.

**O.G.R.E specifics:** The renderer communicates with the grading server via `fetch()` with custom `Authorization` headers. The current `origin: '*'` allows this. Restricting to a static allowlist will break one of these scenarios:
- Dev mode: origin is `http://localhost:5173`
- Production: origin is `null` (file:// protocol sends `Origin: null`)
- Embedded webview: origin varies by loaded site

**Prevention:**
- Use a dynamic CORS origin function that allows:
  - `http://localhost:*` and `http://127.0.0.1:*` (any localhost port)
  - `null` origin (file:// protocol in production Electron)
- Reject all other origins.
- Test CORS with requests from `Origin: http://localhost:5173`, `Origin: null`, and `Origin: http://evil.com` to verify all three cases.

**Warning signs:** Grading works in dev mode but fails in production builds (or vice versa). Console errors about "CORS policy" in the renderer. The `/api/grade` SSE stream connects but immediately closes.

**Phase:** Phase 2 (server hardening). Must be tested in both dev and packaged builds.

### 2.2 Preflight Failures on SSE Endpoints

**The mistake:** Forgetting that `fetch()` with custom headers (like `Authorization: Bearer ...`) triggers a CORS preflight `OPTIONS` request. If the CORS middleware does not handle `OPTIONS` correctly for SSE endpoints (which use `Content-Type: text/event-stream`), the preflight passes but the actual request fails because the response headers are missing on the SSE stream.

**O.G.R.E specifics:** The grading endpoint `/api/grade` streams results via SSE using Hono's `streamSSE`. The Hono CORS middleware handles OPTIONS automatically, but custom SSE implementations sometimes bypass the middleware's response header injection because they write headers manually.

**Prevention:**
- After restricting CORS, test the full grading flow end-to-end: extract students, submit grading request, receive SSE stream, fill scores.
- Verify that the `Access-Control-Allow-Origin` header appears on both the preflight response AND the SSE stream response.
- Use the browser DevTools Network tab to inspect the preflight and SSE requests separately.

**Warning signs:** Preflight succeeds (204) but the SSE fetch fails with a CORS error. Works with simple GET requests but fails on POST with Authorization header.

**Phase:** Phase 2.

### 2.3 Localhost vs 127.0.0.1 Origin Mismatch

**The mistake:** Allowing `http://localhost:3456` but not `http://127.0.0.1:3456`, or vice versa. Browsers treat these as different origins. If the renderer connects to `localhost` but the server binds to `127.0.0.1`, the CORS origin check may fail depending on how the OS resolves localhost.

**O.G.R.E specifics:** The server binds to port 3456 via Hono/Node. The renderer connects to `http://localhost:3456`. On some Windows configurations, `localhost` resolves to `::1` (IPv6) rather than `127.0.0.1`. If the server only listens on IPv4, the connection fails entirely (not a CORS issue but easily confused with one).

**Prevention:**
- Allow both `localhost` and `127.0.0.1` in the CORS origin list, on any port.
- If possible, bind the server to `0.0.0.0` for local development (but be aware this opens it to the LAN -- see the next pitfall).

**Warning signs:** Works on the developer's machine but fails on a teacher's machine. Intermittent CORS errors that depend on DNS resolution.

**Phase:** Phase 2.

---

## 3. IPC Refactoring Mistakes

### 3.1 Over-Restricting dbQuery/dbExecute Breaks Existing Queries

**The mistake:** Replacing the raw `dbQuery(sql, params)` / `dbExecute(sql, params)` IPC channels with a fixed set of named operations (e.g., `db:getProviders`, `db:saveSettings`). This is the right direction, but if any renderer code uses a SQL query that is not covered by the new named operations, that code silently breaks.

**O.G.R.E specifics:** The renderer uses `dbQuery` and `dbExecute` extensively -- for provider configs, grading sessions, app settings, OAuth tokens, site credentials, site profiles, batch sessions, skills, and response embeddings. There are likely dozens of distinct SQL queries scattered across Svelte components and lib modules. Missing even one means a broken feature that may not be caught until a teacher hits that specific workflow.

**Prevention:**
- Before refactoring, grep every `dbQuery` and `dbExecute` call in the renderer codebase. Catalog every unique SQL string. This is the contract that the new IPC API must satisfy.
- Implement the new named handlers one-by-one, updating the renderer call sites to match.
- Keep the raw `dbQuery`/`dbExecute` handlers active (but logged/warned) during the transition. Remove them only after confirming zero calls remain.
- Run the full test suite after each batch of migrations.

**Warning signs:** Features that work in the previous version but silently return empty data or throw after the refactor. Settings page loads but shows no providers. History page is empty.

**Phase:** Phase 3 (IPC hardening). This is the highest-regression-risk phase.

### 3.2 IPC Channel Name Collisions

**The mistake:** When splitting `dbQuery` into named handlers like `db:getProviders`, accidentally registering two handlers for the same channel name, or registering a handler that shadows an existing one from a different module. Electron silently uses the last registered handler.

**O.G.R.E specifics:** IPC handlers are registered across multiple modules via `registerDatabaseHandlers()`, `registerBrowserHandlers()`, `registerCdpHandlers()`, `registerOAuthHandlers()`. Adding new database-specific handlers in the database module while another module already handles a similar channel creates silent conflicts.

**Prevention:**
- Use a consistent naming convention: `domain:action` (e.g., `db:getProviders`, `browser:navigate`).
- Add a registration-time check that throws if a channel is registered twice.
- Keep a single registry file that imports all handler modules so conflicts are visible.

**Warning signs:** A handler that works in isolation but returns unexpected data when the full app runs. Test mocks that register handlers after the real ones.

**Phase:** Phase 3.

### 3.3 Race Conditions When Restricting evalWebviewScript

**The mistake:** Adding validation to `evalWebviewScript` (e.g., only allowing scripts that match an allowlist) that breaks the timing of CDP-based operations. The batch grader, discovery system, and agent loop all evaluate scripts in webviews. If the validation adds async overhead or rejects scripts that are actually legitimate, the grading pipeline hangs or produces incomplete results.

**O.G.R.E specifics:** `batch-grader.ts` builds dynamic JavaScript strings that extract student data and fill scores into the DOM. These scripts reference CSS selectors from site profiles and contain string interpolation. An allowlist approach would need to match these dynamic scripts, which is essentially impossible. A better approach is to validate the source (only allow calls from trusted renderer code, not from injected third-party scripts).

**Prevention:**
- Do not use script-content allowlisting for `evalWebviewScript`. Instead, restrict at the IPC level: ensure only the renderer's own code (not scripts injected into webviews) can call the IPC channel.
- If adding validation, make it synchronous and non-blocking.
- Test the full batch grading flow (extract + grade + fill) after any IPC changes.

**Warning signs:** Batch grading extracts 0 students. Score filling silently fails. Agent mode stops after the first step.

**Phase:** Phase 3.

### 3.4 Breaking the Preload Bridge Contract

**The mistake:** Changing the preload script's `contextBridge.exposeInMainWorld` API without updating all renderer call sites. The preload currently exposes 25+ methods on `window.electronAPI`. If a method is renamed, removed, or its signature changes, every call site in the Svelte components and lib modules breaks.

**O.G.R.E specifics:** The `electron-bridge.ts` module wraps `window.electronAPI` calls. This is the natural chokepoint -- changes to preload should be mirrored in `electron-bridge.ts`, and renderer code should only use the bridge. But any code that directly accesses `window.electronAPI` (e.g., in tests or injection scripts) will break silently.

**Prevention:**
- Treat the preload API as a versioned contract. Add TypeScript types for the `electronAPI` interface.
- Search for direct `window.electronAPI` usage outside of `electron-bridge.ts` and route them through the bridge.
- Run the full test suite after any preload changes.

**Warning signs:** TypeScript errors in the renderer about missing properties on `electronAPI`. Runtime errors like "electronAPI.evalWebviewScript is not a function."

**Phase:** Phase 3.

---

## 4. innerHTML to textContent Migration Issues

### 4.1 Destroying Intentional HTML Formatting in Feedback

**The mistake:** Blanket-replacing all `innerHTML` assignments with `textContent` to eliminate XSS vectors. This breaks cases where HTML formatting is intentional and expected by the target platform.

**O.G.R.E specifics:** The batch grader's feedback fill code (line 839 of `batch-grader.ts`) uses `innerHTML` specifically for `tinymce-inline` and `contenteditable` feedback boxes. These rich-text editors expect HTML content. Switching to `textContent` would strip all formatting, producing plain text where the teacher and platform expect formatted feedback with paragraphs, bold text, and math rendering.

The code already handles this correctly for plain input fields (the `else` branch uses `.value`). The HTML path is only used when `fbCfg.type` is `tinymce-inline` or `contenteditable`.

**Prevention:**
- Do NOT replace `innerHTML` with `textContent` for rich-text feedback injection. Instead, sanitize the HTML before injection:
  - Strip `<script>` tags, `on*` event handlers, `javascript:` URLs, and `<iframe>`/`<object>`/`<embed>` elements.
  - Allow safe formatting tags: `<p>`, `<br>`, `<b>`, `<i>`, `<strong>`, `<em>`, `<ul>`, `<ol>`, `<li>`, `<code>`, `<pre>`.
  - Use a lightweight sanitizer (DOMPurify or a simple regex strip) rather than switching to textContent.
- For the `drawer-injection.js` innerHTML usages (static UI construction like `title.innerHTML = 'O.G.R.E <span ...>'`), these are safe because the content is hardcoded, not user/AI-generated. Do not waste time "fixing" these.

**Warning signs:** Feedback appears as raw HTML tags in the grading platform (e.g., `<p>Good work</p>` shown literally). Teachers report that filled feedback looks broken.

**Phase:** Phase 2 (XSS hardening). Must be tested on actual MyOpenMath and Canvas grading pages with TinyMCE editors.

### 4.2 Breaking MathJax/KaTeX Rendering in Feedback

**The mistake:** Sanitizing HTML feedback too aggressively and stripping LaTeX math delimiters (`\(...\)`, `$$...$$`) or MathJax-generated `<span>` trees. AI-generated feedback for math courses frequently contains LaTeX that the grading platform renders.

**O.G.R.E specifics:** The grading server's AI prompt asks for feedback that may include math notation. If the sanitizer strips backslashes or modifies `$` delimiters, the math rendering breaks on the target page.

**Prevention:**
- Sanitize HTML structure (tags and attributes) but preserve text content verbatim, including LaTeX delimiters.
- Test with feedback containing `\(\frac{1}{2}\)` and verify it renders correctly after sanitization and injection.

**Warning signs:** Math formulas appear as raw LaTeX source text instead of rendered equations. Backslashes disappear from feedback.

**Phase:** Phase 2.

---

## 5. Rate Limiting That Blocks Legitimate Batch Operations

### 5.1 Per-Endpoint Rate Limits That Break Batch Grading

**The mistake:** Applying a generic rate limit (e.g., 10 requests per minute) to all `/api/*` endpoints, including `/api/grade`. Batch grading sends one request per batch chunk, and a class of 35 students with chunks of 5 means 7 requests in rapid succession. A naive rate limit blocks the grading flow.

**O.G.R.E specifics:** The grading server is local-only, called by a single desktop app instance. The threat model is not DDoS -- it is a misconfigured script or malicious webpage making unbounded requests to run up AI provider costs. Rate limiting should target abuse, not normal usage.

**Prevention:**
- Set rate limits per-endpoint based on expected usage patterns:
  - `/api/grade`: Allow 20-30 requests per minute (enough for large batch grading).
  - `/api/embed`: Allow 50+ per minute (post-grading embedding is chatty).
  - `/api/handshake`: 5 per minute (only called on startup).
  - `/api/providers`: 10 per minute.
- Use a token bucket or sliding window, not a fixed window that can lock out the teacher for a full minute.
- Include the rate limit headers (`X-RateLimit-Remaining`, `Retry-After`) so the desktop app can back off gracefully.

**Warning signs:** Batch grading of large classes fails partway through with 429 errors. The teacher has to wait and retry, which re-sends already-graded students.

**Phase:** Phase 2 (server hardening).

### 5.2 Rate Limiting SSE Streams as Multiple Requests

**The mistake:** Counting the initial SSE connection and each chunk response as separate requests for rate limiting purposes. An SSE stream is one HTTP connection that stays open. If the rate limiter counts events rather than connections, a single grading session can exhaust the limit.

**O.G.R.E specifics:** `/api/grade` returns an SSE stream. The Hono middleware runs on the initial request. If rate limiting middleware is applied before `streamSSE`, it should count the connection once, not per-event.

**Prevention:**
- Apply rate limiting to the initial request only, not to SSE events within the stream.
- Test by grading a full class (30+ students) and verifying no rate limit errors appear mid-stream.

**Warning signs:** Grading starts normally but the SSE stream cuts off after a certain number of events.

**Phase:** Phase 2.

---

## 6. Debug Port Management That Breaks Development

### 6.1 Removing the Debug Port Flag Entirely

**The mistake:** Deleting `app.commandLine.appendSwitch('remote-debugging-port', '9223')` from `main.ts` without providing an alternative for development. CDP-based features (the embedded browser, agent mode, page discovery) may rely on the debug port being available.

**O.G.R.E specifics:** The debug port at 9223 serves two purposes:
1. Developer debugging: connecting Chrome DevTools to the Electron app.
2. CDP bridge: `cdp-bridge.ts` writes the port to `~/.ogre/cdp-port` and the app uses CDP to communicate with embedded browser tabs.

However, Electron's CDP for WebContentsView tabs uses `webContents.debugger` API, not the remote debugging port. The remote debugging port is for debugging the Electron app itself (the main window and renderer). These are separate CDP instances.

**Prevention:**
- Guard the debug port behind `isDev` or `app.isPackaged`:
  ```typescript
  if (!app.isPackaged) {
    app.commandLine.appendSwitch('remote-debugging-port', '9223')
  }
  ```
- Verify that embedded browser CDP (via `webContents.debugger.attach()`) still works without the remote debugging port. These are independent systems.
- Remove the `~/.ogre/cdp-port` file write in production, or write it only when the port is actually enabled.

**Warning signs:** Agent mode and batch grading break after removing the debug port (indicates the code was using the debug port for tab CDP, which would be a deeper architectural issue). Dev mode loses the ability to attach Chrome DevTools.

**Phase:** Phase 2. Test embedded browser CDP operations separately from the debug port removal.

### 6.2 CDP Port File Left Behind After App Exit

**The mistake:** The `~/.ogre/cdp-port` file is written on startup but never cleaned up on exit. Any process can read this file to discover the debug port. Even after disabling the port in production, a stale file from a dev session could mislead other tools or create confusion.

**Prevention:**
- Delete the CDP port file in the `app.on('before-quit')` handler.
- In production, never write the file at all.

**Warning signs:** The file persists after the app is closed. Other tools pick up a stale port number and fail to connect.

**Phase:** Phase 2.

---

## 7. Security Theater: Things That Look Secure But Are Not

### 7.1 Handshake Token Without Origin Validation Is Meaningless

**The mistake:** Keeping the handshake token mechanism but only restricting CORS, without fixing the unauthenticated `/api/handshake` endpoint. A non-browser attacker (curl, Python script, local malware) can call `/api/handshake` directly (CORS is browser-only enforcement) and obtain the token. The handshake token only protects against browser-based attacks when combined with CORS.

**O.G.R.E specifics:** The current handshake endpoint checks `Origin` header but `Origin` is trivially spoofable from non-browser contexts. The real security gate should be: the desktop app generates the token and passes it to the server on startup via a non-HTTP channel (e.g., command-line argument, environment variable, or IPC).

**Prevention:**
- Eliminate the `/api/handshake` endpoint entirely. Have the Electron main process generate the token, pass it to the grading server as a startup argument, and inject it into the renderer via IPC. No endpoint should ever return the token.
- If the endpoint must exist for backward compatibility, require a one-time-use nonce that the desktop app provisions.

**Warning signs:** The `/api/handshake` endpoint still exists and returns a token to any localhost request. Security review says "we have token auth" but the token is freely available.

**Phase:** Phase 2. This is the single highest-impact fix.

### 7.2 Encrypting Credentials But Leaving the Database Readable

**The mistake:** Encrypting passwords with safeStorage but leaving the SQLite database file with default permissions. On Windows, any process running as the same user can read the database. Since safeStorage (DPAPI) keys are also per-user, any process running as the same user can also decrypt the credentials by calling DPAPI directly.

**Reality check:** safeStorage protects against a different user reading the credentials, or reading them from a disk image. It does NOT protect against malware running as the same user. This is a known limitation, not a bug. But it is important to communicate this honestly rather than claiming "credentials are encrypted" as if it provides complete protection.

**Prevention:**
- Document the threat model honestly: safeStorage protects credentials at rest on disk, not against same-user malware.
- Set restrictive file permissions on the SQLite database (owner-only read/write).
- Do not claim "military-grade encryption" or similar nonsense in user-facing messaging.

**Warning signs:** Security documentation claims safeStorage "fully protects" credentials. No mention of the same-user-process limitation.

**Phase:** Phase 1 (documentation should ship with the encryption feature).

### 7.3 Redacting API Keys in /api/providers But Storing Them in Config File

**The mistake:** Redacting API keys from the `/api/providers` HTTP response (showing only `sk-...xxxx`) but leaving them in plaintext in `ogre-server.json` on disk. The HTTP endpoint is one attack vector; the config file is another. If you fix one but not the other, you have created an asymmetric defense that is easy to bypass.

**O.G.R.E specifics:** The grading server persists provider configs to `ogre-server.json` via `config.js`. This file contains full API keys in plaintext. Even after redacting the HTTP response, the file is readable by any same-user process.

**Prevention:**
- Encrypt API keys in the config file using safeStorage (encrypt in the Electron main process, pass encrypted blobs to the server).
- Or eliminate the config file entirely: keep provider configs only in SQLite (encrypted), and pass them to the server via the `/internal/providers` endpoint on startup.
- Redacting the HTTP response is still correct and should be done, but do not treat it as sufficient alone.

**Warning signs:** The `/api/providers` response is redacted but `cat ~/.config/ogre-desktop/ogre-server.json` shows full API keys.

**Phase:** Phase 1 (credential encryption) + Phase 2 (HTTP redaction). These must happen together.

### 7.4 Rate Limiting Without Addressing the Root CORS/Token Issue

**The mistake:** Adding rate limiting to the grading server as a defense against abuse, while the CORS wildcard and unauthenticated handshake are still open. Rate limiting slows down an attacker but does not prevent exfiltration -- they only need one successful request to `/api/providers` to get all API keys.

**Prevention:**
- Fix CORS and the handshake token BEFORE adding rate limiting. Rate limiting is defense-in-depth, not a primary control.
- Do not let rate limiting become a substitute for fixing the actual vulnerability chain.

**Warning signs:** The sprint adds rate limiting in Phase 1 but defers CORS/handshake fixes to Phase 3. The attack chain remains fully exploitable.

**Phase:** Rate limiting should be Phase 2 or 3, after CORS and handshake are fixed.

---

## 8. Regressions: How Security Fixes Commonly Break Features

### 8.1 Provider Sync Breaks After Credential Encryption

**The mistake:** Encrypting API keys in SQLite but forgetting to decrypt them before syncing to the grading server via `/internal/providers`. The server receives encrypted blobs instead of usable API keys and cannot authenticate with AI providers. All grading fails.

**O.G.R.E specifics:** `provider-sync.ts` pushes configs from SQLite to the grading server on startup and on changes. If the sync code reads encrypted `api_key` values and passes them through without decryption, the server stores encrypted strings in its runtime config and every AI call fails with authentication errors.

**Prevention:**
- The decryption must happen in the Electron main process (where safeStorage is available), not in the renderer.
- The provider sync flow should decrypt credentials before sending them to the server.
- Test the full flow: encrypt credentials -> restart app -> server receives decrypted credentials -> grading works.

**Warning signs:** "Invalid API key" errors from AI providers after enabling encryption. The grading server logs show garbled base64 strings where API keys should be.

**Phase:** Phase 1. Must be tested end-to-end immediately.

### 8.2 OAuth Token Refresh Breaks After Encryption

**The mistake:** The grading server refreshes OAuth tokens in-process (e.g., Anthropic token refresh at line 125 of `server.js`) and writes them back to the config file. If the config file now expects encrypted values, the server needs access to safeStorage to encrypt the refreshed token -- but safeStorage is only available in the Electron main process, not in the Bun server process.

**O.G.R.E specifics:** The server runs as a separate Bun process spawned by Electron. It cannot call `safeStorage.encryptString()`. If the config file requires encrypted values, the server cannot persist refreshed tokens. The token refresh works once (in memory) but the refreshed token is lost on restart.

**Prevention:**
- Option A: The server stores tokens in plaintext in its config; the Electron app is the source of truth for encrypted storage and re-syncs to the server on startup.
- Option B: The server notifies the Electron app (via HTTP callback or IPC) when a token is refreshed, and the Electron app handles encryption and persistence.
- Option C: Accept that the server config file has plaintext tokens (it is local-only) and focus encryption on the SQLite database that the renderer can access.

**Warning signs:** OAuth tokens expire and refresh fails. Teachers are prompted to re-authenticate after every restart. Server logs show "Failed to persist refreshed token."

**Phase:** Phase 1. Architecture decision must be made before implementation.

### 8.3 Site Profile Discovery Breaks After IPC Restrictions

**The mistake:** The discovery system uses `evalWebviewScript` to capture DOM snapshots and test CSS selectors against the live page. If IPC hardening restricts `evalWebviewScript` to a limited set of operations, discovery stops working.

**O.G.R.E specifics:** Discovery (`discover.ts`) builds JavaScript strings dynamically based on AI-suggested selectors and evaluates them in the webview to verify they match elements. These scripts are unpredictable -- the AI may suggest any valid CSS selector or DOM traversal. An allowlist approach would need to permit arbitrary selector queries, defeating the purpose.

**Prevention:**
- The IPC restriction for `evalWebviewScript` should be at the source level (who is calling), not the content level (what script is being evaluated).
- Consider a separate `evalDiscoveryScript` channel that is functionally identical but can be audited separately.
- Test the full discovery flow: navigate to a grading page, run discovery, verify selectors are found and saved.

**Warning signs:** Discovery starts but reports "0 elements found" for all selectors. The AI suggests valid selectors but validation fails.

**Phase:** Phase 3.

### 8.4 Auto-Updater Fails After Security Changes

**The mistake:** Security hardening changes the app's file structure, database schema, or config format in ways that the auto-updater cannot handle. The updater downloads and installs the new version, but the migration code runs before the database schema changes are applied, or the old config format is incompatible with the new encryption expectations.

**O.G.R.E specifics:** The app uses `electron-updater` with GitHub Releases. The database migration system uses version numbers (`migrations` array in `database.ts`). If the hardened version adds new migrations (e.g., `encryption_version` column), these run on first launch of the new version. But if the migration code calls `safeStorage` before the app is fully initialized, it may fail.

**Prevention:**
- Ensure database migrations run AFTER `app.whenReady()` (which is already the case in `main.ts`).
- Test the upgrade path: install the current version, populate it with credentials and provider configs, then install the hardened version and verify everything migrates correctly.
- Make migrations idempotent: running the same migration twice should be safe.

**Warning signs:** Teachers update the app and all their providers/credentials disappear. The app crashes on first launch after update.

**Phase:** All phases. Every change should be tested with the upgrade path, not just clean installs.

### 8.5 Batch Grading Fill Fails Silently After XSS Sanitization

**The mistake:** Adding HTML sanitization to the feedback fill path that strips content the grading platform needs. For example, some platforms use `<input type="hidden">` sync fields that expect the same HTML as the visible editor. If the sanitizer modifies the HTML differently for the hidden field sync, the platform rejects the feedback on save.

**O.G.R.E specifics:** The batch grader has a `requiresHiddenSync` path (line 842 of `batch-grader.ts`) that copies the same HTML to a hidden field. If the sanitizer produces different output for the visible editor vs. the hidden field (e.g., due to different contexts), the platform may show a mismatch error or silently drop the feedback.

**Prevention:**
- Sanitize the HTML ONCE, then use the sanitized version for both the visible editor and the hidden field.
- Test on actual MyOpenMath TinyMCE editors with feedback that contains HTML formatting.

**Warning signs:** Feedback appears in the editor but is lost when the teacher clicks Save. The hidden field contains different content than the visible editor.

**Phase:** Phase 2.

---

## Summary: Pitfall Priority by Phase

### Phase 1 -- Credential Encryption
| # | Pitfall | Severity |
|---|---------|----------|
| 1.1 | Data loss during migration (partial encryption) | Critical |
| 1.2 | safeStorage unavailable (CI, headless, Linux) | High |
| 1.3 | Decryption failure after OS reinstall | High |
| 1.4 | Binary blobs in TEXT columns | High |
| 7.2 | Overstating safeStorage protection | Medium |
| 7.3 | Encrypting HTTP but not config file | High |
| 8.1 | Provider sync sends encrypted blobs | Critical |
| 8.2 | OAuth refresh cannot re-encrypt tokens | Critical |

### Phase 2 -- Server Hardening
| # | Pitfall | Severity |
|---|---------|----------|
| 2.1 | CORS breaks dev or production mode | Critical |
| 2.2 | Preflight failures on SSE streams | High |
| 2.3 | localhost vs 127.0.0.1 mismatch | Medium |
| 4.1 | textContent destroys rich-text feedback | Critical |
| 4.2 | Sanitizer strips LaTeX math | High |
| 5.1 | Rate limits block batch grading | High |
| 5.2 | Rate limiting counts SSE events | Medium |
| 6.1 | Debug port removal breaks dev workflow | Medium |
| 6.2 | CDP port file left behind | Low |
| 7.1 | Handshake endpoint still returns token | Critical |
| 7.4 | Rate limiting as substitute for CORS fix | High |
| 8.5 | Sanitization breaks hidden field sync | High |

### Phase 3 -- IPC Hardening
| # | Pitfall | Severity |
|---|---------|----------|
| 3.1 | Named IPC misses existing SQL queries | Critical |
| 3.2 | IPC channel name collisions | Medium |
| 3.3 | evalWebviewScript validation breaks grading | High |
| 3.4 | Preload bridge contract broken | High |
| 8.3 | Discovery breaks after IPC restrictions | High |

### All Phases
| # | Pitfall | Severity |
|---|---------|----------|
| 8.4 | Auto-updater fails after schema/format changes | High |

---

## Appendix: Pre-Phase Checklist

Before starting each phase, verify:

1. **Catalog existing behavior:** Grep all call sites for the API being changed. Document the contract before modifying it.
2. **Write regression tests first:** For each security fix, write a test that exercises the existing feature. The test should pass before the fix and still pass after.
3. **Test in both dev and production modes:** Many regressions only appear in one mode (file:// vs localhost, packaged vs unpackaged).
4. **Test the upgrade path:** Install the pre-hardening version, populate data, then upgrade. Verify migration.
5. **Test with real grading pages:** MyOpenMath TinyMCE editors, Canvas SpeedGrader, and any other platform teachers use. Mock pages miss platform-specific quirks.
6. **Check the server logs:** After each change, verify the grading server starts, receives the correct configs, and can authenticate with at least one AI provider.
