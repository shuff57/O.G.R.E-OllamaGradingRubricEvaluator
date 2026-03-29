# Security Architecture: Electron Desktop App with Local Server

Research document for O.G.R.E security boundary design.

---

## 1. Current Architecture Overview

Three process layers, each with a distinct trust level:

```
+---------------------------+
| Layer 1: Renderer         |  Svelte 5 UI (BrowserWindow)
| Trust: LOW                |  contextIsolation=true, sandbox=true
|                           |  Communicates via preload bridge (IPC)
+---------------------------+
            |  IPC (preload.ts)
            v
+---------------------------+
| Layer 2: Main Process     |  Electron main (Node.js)
| Trust: HIGH               |  SQLite, server lifecycle, OAuth,
|                           |  browser-manager, CDP bridge
+---------------------------+
            |  child_process spawn + HTTP
            v
+---------------------------+
| Layer 3: Grading Server   |  Hono on Bun, port 3456
| Trust: MEDIUM             |  AI provider calls, grading logic,
|                           |  embedding, agent loop
+---------------------------+
```

Embedded browser views (WebContentsView) are a **fourth trust zone** -- they load arbitrary third-party content (MyOpenMath, Aeries, etc.) and must be treated as fully untrusted.

---

## 2. Current Security Issues (Audit)

### 2.1 Preload Bridge: Overly Broad API Surface

The renderer currently has direct access to:

| IPC Channel | Risk | Why It Matters |
|---|---|---|
| `evalWebviewScript(tabId, script)` | **CRITICAL** | Renderer can execute arbitrary JS in any webview. A renderer compromise (XSS, malicious dependency) grants full code execution on third-party sites including authenticated sessions. |
| `injectWebviewScript(tabId, script)` | **CRITICAL** | Same as above -- differs only in `userGesture` flag. |
| `injectAutofill(tabId, script)` | **HIGH** | Same arbitrary JS execution, nominally scoped to autofill. |
| `dbQuery(sql, params)` | **HIGH** | Renderer sends raw SQL. The blocklist filter (`BLOCKED_SQL_PATTERNS`) catches DDL but permits `SELECT * FROM oauth_tokens` or `SELECT * FROM site_credentials`. API keys, OAuth tokens, and plaintext passwords are readable. |
| `dbExecute(sql, params)` | **HIGH** | Same SQL injection surface. Can `DELETE FROM` any table. Can `UPDATE oauth_tokens SET access_token=...`. |
| `cdpSend(tabId, method, params)` | **MEDIUM** | Allowlist exists (good) but includes `Runtime.evaluate` and `Runtime.callFunctionOn` -- equivalent to arbitrary code execution on webview targets. |
| `invoke(channel, args)` | **MEDIUM** | Catch-all passthrough. Any IPC handler registered in main is callable. |
| `scanLocalSkills(dir)` | **MEDIUM** | Reads arbitrary filesystem directories. Path traversal possible. |

### 2.2 Grading Server: Wildcard CORS + Unauthenticated Handshake

```javascript
app.use('/*', cors({ origin: '*' }));
```

**Problem:** Any website open in any browser on the machine can call `http://localhost:3456/api/handshake` and obtain the bearer token. The Origin check on `/api/handshake` only blocks non-localhost web origins, but:
- Browser extensions have no Origin header restriction.
- Electron webviews (the embedded browser) run on localhost-adjacent origins.
- `curl` / local malware has no origin at all.

Once the handshake token is obtained, the attacker has full access to all `/api/*` endpoints including provider credentials, grading operations, and profile data.

### 2.3 CDP Debug Port Always Open

```javascript
app.commandLine.appendSwitch('remote-debugging-port', '9223')
```

The Chrome DevTools Protocol port is unconditionally enabled, even in production builds. Any local process can connect to `ws://127.0.0.1:9223` and:
- Read/modify the renderer DOM (steal form data, credentials)
- Execute JS in any renderer context
- Enumerate and attach to webview targets
- Exfiltrate the full page content of authenticated sites

### 2.4 WebContentsView: Sandbox Disabled

```javascript
const view = new WebContentsView({
  webPreferences: {
    sandbox: false,  // <-- should be true
  },
})
```

Embedded browser views load untrusted third-party content with sandboxing disabled. A compromised page could attempt to escape the renderer process.

---

## 3. Security Boundary Design

### 3.1 Principle: Trust Flows Inward

```
Untrusted          Low Trust         High Trust
+-----------+     +-----------+     +------------------+
| Webviews  | --> | Renderer  | --> | Main Process     |
| (3rd party|     | (Svelte)  |     | (SQLite, server, |
|  content) |     |           |     |  OS access)      |
+-----------+     +-----------+     +------------------+
                                           |
                                    +------v-----------+
                                    | Grading Server   |
                                    | (AI calls, no    |
                                    |  local state)    |
                                    +------------------+
```

**Rule:** Data flows from untrusted toward trusted zones. Privileged operations are never delegated outward. Each boundary crossing requires validation by the receiving (more-trusted) side.

### 3.2 Boundary 1: Webview -> Main Process

Webviews must NEVER communicate directly with the renderer or the grading server.

**Pattern: Main-Process Mediation**

All webview interaction goes through the main process. The renderer requests an operation; the main process executes it against a specific webview.

Current violation: `evalWebviewScript`, `injectWebviewScript`, and `injectAutofill` let the renderer send arbitrary JS to webviews. This must be replaced with named operations.

**Target design:**

```
Renderer                    Main Process                 Webview
   |                            |                           |
   |-- IPC: extractStudentWork -|                           |
   |                            |-- executeJavaScript(      |
   |                            |     HARDCODED_EXTRACT_JS) |
   |                            |                           |
   |                            |<-- result data -----------|
   |<-- structured data --------|                           |
```

The main process holds a registry of allowed scripts (extract student work, fill score, click next, etc.). The renderer can only invoke named operations with structured parameters -- never raw JS.

**Allowed operations (examples):**
- `webview:extractContent(tabId, selector)` -- returns text/HTML from a CSS selector
- `webview:fillField(tabId, selector, value)` -- sets an input value
- `webview:clickElement(tabId, selector)` -- clicks a button
- `webview:getPageSnapshot(tabId)` -- returns sanitized DOM snapshot
- `webview:captureScreenshot(tabId)` -- returns image buffer

**Blocked (remove from preload):**
- `evalWebviewScript` -- arbitrary code execution
- `injectWebviewScript` -- arbitrary code execution
- `injectAutofill` -- arbitrary code execution

### 3.3 Boundary 2: Renderer -> Main Process (IPC)

The renderer is a low-trust zone. The preload bridge should expose only the minimum API needed for the UI.

**IPC Channel Categories:**

| Category | Allowed | Pattern |
|---|---|---|
| Navigation | `webview:create`, `webview:navigate`, `webview:back`, `webview:forward`, `webview:reload`, `webview:destroy` | Parameterized (tabId + URL) |
| Layout | `webview:setBounds`, `webview:show`, `webview:hide` | Parameterized (tabId + geometry) |
| Data extraction | `webview:extractContent`, `webview:getSnapshot` | Named operations, structured return |
| Automation | `webview:fillField`, `webview:clickElement` | Named operations with selector + value |
| Database | Domain-specific methods (see below) | Never raw SQL |
| Server | `server:getStatus`, `server:getLogs` | Read-only status |
| OAuth | `oauth:startFlow`, `oauth:cancelFlow` | Opaque flow management |
| Updates | `updater:check`, `updater:download`, `updater:install` | Already scoped |

**Database: Replace Raw SQL with Domain Methods**

Current `dbQuery`/`dbExecute` with raw SQL must be replaced:

```typescript
// REMOVE from preload:
dbQuery: (sql, params) => invoke('db_query', { sql, params })
dbExecute: (sql, params) => invoke('db_execute', { sql, params })

// REPLACE with domain-specific handlers:
db.providers.list: () => invoke('db:providers:list')
db.providers.setActive: (id) => invoke('db:providers:setActive', { id })
db.sessions.list: (opts) => invoke('db:sessions:list', opts)
db.sessions.create: (data) => invoke('db:sessions:create', data)
db.settings.get: (key) => invoke('db:settings:get', { key })
db.settings.set: (key, value) => invoke('db:settings:set', { key, value })
db.skills.list: () => invoke('db:skills:list')
db.skills.upsert: (skill) => invoke('db:skills:upsert', skill)
db.siteProfiles.list: () => invoke('db:siteProfiles:list')
db.siteProfiles.upsert: (profile) => invoke('db:siteProfiles:upsert', profile)
```

Each handler validates input shape and performs only the intended query. Credentials tables (`oauth_tokens`, `site_credentials`) have NO renderer-facing read path -- the main process uses them internally.

**Remove the catch-all `invoke`:**

```typescript
// REMOVE from preload:
invoke: <T>(channel: string, args?: Record<string, unknown>) => invoke<T>(channel, args)
```

This bypasses all API surface control. Every IPC channel must be explicitly listed.

### 3.4 Boundary 3: Main Process -> Grading Server

The main process spawns the grading server as a child process. Communication is currently HTTP on `localhost:3456`.

**Problem:** The server is network-accessible. Any local process can reach it.

**Option A: Shared-Secret via Environment Variable (Recommended, Lowest Effort)**

1. Main process generates a cryptographically random token at startup (`crypto.randomBytes(32).toString('hex')`).
2. Token is passed to the server via environment variable (`OGRE_HANDSHAKE_TOKEN`).
3. Server requires this token as `Authorization: Bearer <token>` on all endpoints.
4. The `/api/handshake` endpoint is removed entirely -- the renderer never contacts the server directly.
5. All renderer-to-server communication is proxied through the main process.

```
Renderer                     Main Process              Grading Server
   |                             |                          |
   |-- IPC: grade(work, rubric) -|                          |
   |                             |-- HTTP POST /api/grade   |
   |                             |   Authorization: Bearer  |
   |                             |   <env-token>            |
   |                             |                          |
   |                             |<-- SSE stream -----------|
   |<-- IPC: grade-progress -----|                          |
   |<-- IPC: grade-result -------|                          |
```

**Benefits:**
- Token never leaves main process memory; renderer cannot leak it.
- CORS becomes irrelevant (no browser-origin requests).
- SSE streams are proxied as IPC events (already partially implemented via `server-manager.ts` stdout parsing).

**Option B: Unix Domain Socket / Named Pipe (Higher Security, More Effort)**

Replace TCP binding with a Unix domain socket (or Windows named pipe). The socket file's permissions restrict access to the current user. No network exposure at all.

```javascript
// Server side (Bun/Hono)
serve({ fetch: app.fetch, unix: '/tmp/ogre-grading.sock' })

// Main process side
const res = await fetch('http://unix:/tmp/ogre-grading.sock:/api/grade', { ... })
```

On Windows, use named pipes: `\\.\pipe\ogre-grading`.

**Option C: Stdio IPC (Highest Security, Most Refactoring)**

Replace HTTP entirely with JSON-RPC over the child process stdin/stdout. No network listener at all. This is the most secure option but requires rewriting the server's transport layer.

**Recommendation:** Start with Option A. It requires minimal server changes (just enforce the env-var token, remove `/api/handshake`). Migrate to Option B later if needed.

### 3.5 CORS: Replace Wildcard with Deny-All

Once the renderer no longer contacts the server directly:

```javascript
// Remove:
app.use('/*', cors({ origin: '*' }));

// Replace with: no CORS middleware at all.
// Or if keeping any browser access:
app.use('/*', cors({ origin: [] }));  // deny all browser origins
```

If browser-extension-based grading still needs direct server access, use an explicit allowlist of known extension origins.

### 3.6 CDP Debug Port: Disable in Production

```typescript
// main.ts
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
}
```

The `setCdpPort(9223)` call and the CDP port file (`~/.ogre/cdp-port`) should also be conditional on dev mode. In production, the internal debugger protocol (via `wc.debugger.attach()`) is sufficient and does not open a network port.

### 3.7 WebContentsView: Enable Sandbox

```typescript
const view = new WebContentsView({
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,  // CHANGED from false
    // No preload script -- webviews get no bridge
  },
})
```

Additional webview hardening:
- `webSecurity: true` (default, but be explicit)
- No preload script injected into webviews
- `setWindowOpenHandler` already denies popups (good)
- Add `will-navigate` handler to block navigation to `file://`, `javascript:`, `data:` URLs

---

## 4. Data Flow Summary

### After Remediation

```
Layer              Can Access                Cannot Access
---------------------------------------------------------------------------
Webview            Its own DOM only          Renderer, Main, Server, DB,
                                             other webviews, filesystem

Renderer           Named IPC methods         Raw SQL, raw JS injection,
                   UI state                  OAuth tokens, API keys,
                   Server status (via IPC)   site_credentials, filesystem,
                                             CDP debug port

Main Process       Everything local:         External network (except via
                   DB, filesystem, server,   server proxy for OAuth)
                   webview control, OAuth

Grading Server     AI provider APIs,         DB directly (gets data via
                   config file (read)        main process push),
                                             Webviews, Renderer
```

### Credential Flow (After Remediation)

```
1. User enters API key in renderer UI
2. Renderer -> IPC -> Main: db:providers:upsert({ id, credentials })
3. Main stores in SQLite (oauth_tokens / provider_configs)
4. Main pushes to server: POST /internal/providers (env-token auth)
5. Server holds credentials in memory for AI calls
6. Renderer NEVER sees raw credentials after initial entry
```

---

## 5. Build Order (What to Fix First)

Priority is based on: severity of the vulnerability, effort to fix, and dependency ordering (earlier fixes unblock later ones).

### Phase 1: Quick Wins (High Impact, Low Effort)

**1a. Disable CDP debug port in production**
- File: `ogre-desktop/electron-main/main.ts` (line 21)
- Change: Wrap in `if (isDev)` conditional
- Risk eliminated: Full renderer/webview takeover by any local process
- Effort: ~5 minutes

**1b. Enable sandbox on WebContentsView**
- File: `ogre-desktop/electron-main/browser-manager.ts` (line 48)
- Change: `sandbox: false` -> `sandbox: true`
- Risk reduced: Webview renderer-process escape
- Effort: ~5 minutes, but test that webview functionality still works

**1c. Remove catch-all `invoke` from preload**
- File: `ogre-desktop/electron-main/preload.ts` (line 46)
- Change: Delete the line
- Risk reduced: Renderer access to any IPC handler
- Effort: ~5 minutes + grep for usage in renderer code

### Phase 2: Server Authentication (High Impact, Medium Effort)

**2a. Generate env-token and pass to server**
- File: `ogre-desktop/electron-main/server-manager.ts`
- Change: Generate `crypto.randomBytes(32)` token, add to spawn env
- Effort: ~30 minutes

**2b. Server enforces env-token on all endpoints**
- File: `grading-server/server.js`
- Change: Read `OGRE_HANDSHAKE_TOKEN` from env, use as the sole valid bearer token. Remove `/api/handshake` endpoint.
- Effort: ~30 minutes

**2c. Remove wildcard CORS**
- File: `grading-server/server.js` (line 295)
- Change: Remove `cors({ origin: '*' })` or replace with empty allowlist
- Effort: ~5 minutes (after 2a/2b, renderer no longer needs CORS)

### Phase 3: Database Access Control (High Impact, Medium Effort)

**3a. Replace `dbQuery`/`dbExecute` with domain methods**
- Files: `ogre-desktop/electron-main/database.ts`, `ogre-desktop/electron-main/preload.ts`, all renderer callers
- Change: Create ~15 specific IPC handlers; update renderer code to use them
- Risk eliminated: SQL injection, credential exfiltration, data deletion
- Effort: ~2-4 hours (most time spent finding and updating renderer call sites)

### Phase 4: Webview Script Injection (High Impact, High Effort)

**4a. Build named-operation registry in main process**
- File: New file `ogre-desktop/electron-main/webview-operations.ts`
- Contains: Hardcoded JS snippets for extract, fill, click, snapshot
- Effort: ~4-8 hours (must catalog all current `evalWebviewScript` usage)

**4b. Replace `evalWebviewScript`/`injectWebviewScript` in preload**
- Files: preload.ts, all renderer callers (CDP actions, agent loop, discovery, autofill)
- Change: Replace arbitrary script calls with named operation invocations
- Effort: ~4-8 hours

**4c. Remove `Runtime.evaluate` from CDP allowlist**
- File: `ogre-desktop/electron-main/cdp-bridge.ts` (line 126)
- Change: Remove `Runtime.evaluate` and `Runtime.callFunctionOn` from `ALLOWED_CDP_METHODS`
- Prerequisite: Phase 4a/4b must provide equivalent functionality
- Effort: ~1 hour after 4a/4b

### Phase 5: Proxy Server Communication Through Main (Medium Impact, High Effort)

**5a. Create main-process proxy for grading API calls**
- Replace renderer's direct `fetch('http://localhost:3456/...')` calls with IPC handlers that proxy through main
- Main process adds env-token auth header
- SSE streams forwarded as IPC events
- Effort: ~8-16 hours (large surface area)

---

## 6. Threat Model Summary

| Threat | Current State | After Phase 1-2 | After Phase 3-5 |
|---|---|---|---|
| Local malware reads CDP port | Exposed | Blocked (dev-only) | Blocked |
| XSS in renderer reads OAuth tokens via SQL | Possible | Possible | Blocked (no raw SQL) |
| Local process steals server handshake token | Easy (GET /api/handshake) | Blocked (env-token) | Blocked |
| Malicious website calls grading server | Easy (CORS: *) | Blocked | Blocked |
| Renderer compromise -> webview code execution | Possible (evalWebviewScript) | Possible | Blocked (named ops) |
| Webview escape to main process | Possible (sandbox: false) | Blocked (sandbox: true) | Blocked |
| Renderer calls arbitrary IPC | Possible (catch-all invoke) | Blocked | Blocked |
| Path traversal via scanLocalSkills | Possible | Possible | Mitigated (restrict to app dirs) |

---

## 7. References

- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security) -- Official best practices
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) -- main vs renderer vs utility
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) -- why `contextBridge` matters
- [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view) -- replacement for deprecated BrowserView
- Chromium sandbox architecture -- why `sandbox: true` matters for renderer processes
- OWASP Localhost Attack Surface -- why `localhost` is not a security boundary
