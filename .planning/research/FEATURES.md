# Electron Desktop App Security Features

Research for O.G.R.E hardening. Categorized by maturity tier with complexity
estimates and dependency chains.

---

## Tier 1 -- Table Stakes

These are non-negotiable for any Electron app that handles credentials or
student data. Shipping without them is a known-exploitable posture.

### 1.1 Credential Encryption at Rest

| Aspect | Detail |
|--------|--------|
| **What** | Encrypt API keys, OAuth tokens, and site passwords before writing to SQLite. |
| **Why** | `ogre.db` stores `api_key`, `access_token`, `password` columns in plaintext. Anyone with file-system read (malware, shared machine, backup leak) gets every credential. |
| **How** | Use the OS keychain via `safeStorage.encryptString()` / `safeStorage.decryptString()` (Electron built-in, backed by DPAPI on Windows, Keychain on macOS, libsecret on Linux). Encrypt before INSERT, decrypt after SELECT -- keep plaintext only in memory. |
| **Complexity** | Low. ~50 lines of wrapper code in `database.ts`. Migration needed to re-encrypt existing rows. |
| **Dependencies** | None. Electron ships `safeStorage` since v15. |
| **O.G.R.E. surfaces** | `provider_configs.api_key`, `oauth_tokens.access_token`, `oauth_tokens.refresh_token`, `site_credentials.password` |

### 1.2 XSS Prevention -- Sanitize AI-Generated HTML

| Aspect | Detail |
|--------|--------|
| **What** | Sanitize the HTML produced by `marked.parse()` before injecting via `{@html}`. |
| **Why** | `ResponseRenderer.svelte` passes AI model output through Markdown-to-HTML, then injects it raw with `{@html htmlContent}`. A crafted model response (or prompt-injected student work) can execute arbitrary JS in the renderer context. |
| **How** | Run the HTML through DOMPurify before assigning to `htmlContent`. Allow only safe tags/attributes (p, ul, ol, li, strong, em, code, pre, table, h1-h6, blockquote, span, div, img with restricted src). Strip all event handlers and script tags. |
| **Complexity** | Low. Add `dompurify` dependency, one line: `htmlContent = DOMPurify.sanitize(html)`. |
| **Dependencies** | None. |
| **O.G.R.E. surfaces** | `ResponseRenderer.svelte` line 127 (`{@html htmlContent}`), `drawer-injection.js` innerHTML calls, `SolverChat.svelte` if it renders responses. |

### 1.3 Content Security Policy (CSP)

| Aspect | Detail |
|--------|--------|
| **What** | Set a restrictive CSP header on the renderer page to prevent inline script execution and unauthorized resource loading. |
| **Why** | Even with DOMPurify, defense-in-depth requires CSP. If a sanitizer bypass is found, CSP blocks the payload from executing. |
| **How** | In `main.ts`, use `session.defaultSession.webRequest.onHeadersReceived` to inject CSP headers. Start strict: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:3456 https://*.anthropic.com https://*.openai.com; img-src 'self' data:; font-src 'self' data:`. Add nonces for any inline scripts that remain. |
| **Complexity** | Medium. Requires auditing every resource the renderer loads (KaTeX fonts, external CSS, API endpoints). Iterative tightening. |
| **Dependencies** | Must coordinate with any inline scripts, Vite dev server URLs, and the local Hono server endpoint. |

### 1.4 IPC Channel Hardening

| Aspect | Detail |
|--------|--------|
| **What** | Remove the generic `invoke` passthrough and lock IPC to an explicit allowlist. |
| **Why** | The preload exposes `invoke: <T>(channel: string, args?) => invoke<T>(channel, args)` -- a generic IPC proxy that lets the renderer call ANY registered ipcMain handler by name, including any future handler or Electron internal. This defeats the purpose of `contextIsolation`. |
| **How** | Delete the generic `invoke` export from `preload.ts`. Every IPC call should go through a named, typed function (the existing ones like `dbQuery`, `evalWebviewScript`, etc. are fine). Validate arguments on the main-process side. |
| **Complexity** | Low. Remove one line from preload, audit renderer code for `window.electronAPI.invoke()` calls, replace with specific functions. |
| **Dependencies** | None. |
| **O.G.R.E. surfaces** | `preload.ts` line 46: `invoke: <T>(channel: string, args?) => invoke<T>(channel, args)` |

### 1.5 Restrict eval/executeJavaScript IPC

| Aspect | Detail |
|--------|--------|
| **What** | Prevent the renderer from sending arbitrary JavaScript strings to be executed in embedded browser views. |
| **Why** | `inject_autofill`, `eval_webview_script`, `inject_webview_script` all accept a raw `script` string from the renderer and call `wc.executeJavaScript(script)`. If XSS occurs in the renderer, the attacker can execute arbitrary code in any loaded webpage (credential theft from MyOpenMath, Aeries, etc.). |
| **How** | Replace free-form script execution with a fixed set of named operations (e.g., `fillField(selector, value)`, `clickElement(selector)`, `extractText(selector)`). The main process holds the trusted script templates; the renderer only passes data parameters. For the CDP path, the existing `ALLOWED_CDP_METHODS` allowlist is a good pattern -- extend it to cover the script-injection IPC too. |
| **Complexity** | High. The autofill, batch grader, and discovery systems all construct JS strings dynamically. Refactoring to a command vocabulary is significant. |
| **Dependencies** | Requires cataloging every script pattern currently sent through these channels. |

### 1.6 Parameterized Database Access (Replace Raw SQL from Renderer)

| Aspect | Detail |
|--------|--------|
| **What** | Replace the raw `db_query`/`db_execute` IPC (which accepts arbitrary SQL from the renderer) with named, purpose-built query handlers. |
| **Why** | The current `BLOCKED_SQL_PATTERNS` regex is a denylist -- it blocks DDL but still allows `SELECT * FROM site_credentials` or `UPDATE provider_configs SET api_key = 'exfiltrated'` from the renderer. A compromised renderer has full DML access to every table. |
| **How** | Create specific IPC handlers: `getProviderConfigs`, `saveProviderConfig`, `getGradingSessions`, etc. Each handler uses hardcoded prepared statements. Remove or severely restrict `db_query`/`db_execute`. |
| **Complexity** | High. Requires creating 15-25 specific handlers and updating every callsite in the renderer. |
| **Dependencies** | 1.4 (IPC hardening) should happen first to prevent bypassing new handlers via generic invoke. |

---

## Tier 2 -- Standard Hardening

Expected in production desktop apps. Not having these creates exploitable
windows but they are lower-urgency than Tier 1.

### 2.1 CORS Restriction on Local Server

| Aspect | Detail |
|--------|--------|
| **What** | Replace CORS wildcard on the Hono grading server (port 3456) with an explicit origin allowlist. |
| **Why** | Any webpage open in any browser on the machine can make requests to `localhost:3456`, read grading data, trigger AI calls, and exfiltrate API keys. A malicious ad or compromised site can silently interact with the grading server. |
| **How** | Configure CORS to only accept requests from the Electron renderer origin (`http://localhost:5173` in dev, `file://` or `app://` in production). Add the `Vary: Origin` header. |
| **Complexity** | Low. A few lines in the Hono server CORS middleware config. |
| **Dependencies** | Need to identify the exact origins used in dev vs production builds. |

### 2.2 Authenticated Handshake Token

| Aspect | Detail |
|--------|--------|
| **What** | Generate a per-session random token at app startup, pass it to the grading server, and require it on every API request. |
| **Why** | Even with CORS restrictions, other localhost processes (or browser extensions) can bypass CORS by not being browsers. A shared secret ensures only the Electron app can call the server. |
| **How** | Main process generates `crypto.randomBytes(32).toString('hex')` at startup. Pass as env var to the spawned server process. Server validates `Authorization: Bearer <token>` on every route. Renderer receives the token via IPC (not hardcoded). |
| **Complexity** | Low-Medium. Token generation is trivial; wiring it through spawn env, server middleware, and renderer fetch headers requires touching 3-4 files. |
| **Dependencies** | None. Complements 2.1 (CORS). |

### 2.3 API Key Masking on Provider Endpoints

| Aspect | Detail |
|--------|--------|
| **What** | Never return full API keys from `/api/providers` or any endpoint. Return only the last 4 characters for display. |
| **Why** | The full key is returned to the renderer for display. If XSS exists, the attacker gets every configured API key. Even without XSS, any process that can reach port 3456 gets full keys. |
| **How** | Server returns `api_key: "...sk-xxxx"` (masked). Full key is only used server-side when making AI API calls. Renderer never sees or stores the full key -- only sends new keys during configuration (one-way write). |
| **Complexity** | Low. Modify the provider list endpoint response, add a separate write-only endpoint for key updates. |
| **Dependencies** | Depends on 1.1 (credential encryption) for the stored-at-rest side. |

### 2.4 Debug Port Management

| Aspect | Detail |
|--------|--------|
| **What** | Disable the Chrome DevTools remote debugging port in production builds. |
| **Why** | `main.ts` line 21 unconditionally enables `--remote-debugging-port=9223`. Any local process can connect to this port and get full control of the Electron renderer (read DOM, execute JS, access cookies). The CDP port is also written to `~/.ogre/cdp-port` for easy discovery. |
| **How** | Only append the switch when `isDev` is true. In production, remove the `setCdpPort()` call and the port file. If CDP features are needed in production (for the embedded browser automation), use Electron's built-in debugger API (already used in `cdp-bridge.ts`) instead of the network debug port. |
| **Complexity** | Low. Conditional on `isDev` or `app.isPackaged`. |
| **Dependencies** | Verify that embedded browser CDP automation (`cdp-bridge.ts`) works without the remote debugging port (it should -- it uses `wc.debugger.attach()` which is in-process). |

### 2.5 Rate Limiting on Local Server

| Aspect | Detail |
|--------|--------|
| **What** | Add basic rate limiting to the Hono server endpoints, especially AI grading routes. |
| **Why** | Without rate limiting, a compromised or buggy renderer (or any localhost process) can spam AI API calls, burning through the teacher's API quota. |
| **How** | Simple in-memory token bucket per route group. 10 req/s for reads, 2 req/s for AI grading calls. No need for Redis -- this is a single-user local app. |
| **Complexity** | Low. Hono middleware, ~30 lines. |
| **Dependencies** | None. |

### 2.6 Hardened WebContentsView for Embedded Browser

| Aspect | Detail |
|--------|--------|
| **What** | Enable sandbox mode on the embedded browser views and restrict navigation. |
| **Why** | `browser-manager.ts` line 48 creates WebContentsView with `sandbox: false`. This gives the embedded web content access to Node.js APIs if combined with other misconfigurations. |
| **How** | Set `sandbox: true` on the embedded views. Add `will-navigate` guards to restrict navigation to expected domains (MyOpenMath, Aeries, etc.). Set `webSecurity: true` (default). |
| **Complexity** | Low-Medium. Setting `sandbox: true` is one line, but need to verify all `executeJavaScript` calls still work in sandboxed mode (they should -- sandboxing restricts the page, not the main process debugger API). |
| **Dependencies** | None. |

### 2.7 Randomized Server Port

| Aspect | Detail |
|--------|--------|
| **What** | Use a random available port for the grading server instead of hardcoded 3456. |
| **Why** | A hardcoded port makes the server trivially discoverable by any local process. Combined with no auth (2.2), this is a wide-open target. |
| **How** | Server binds to port 0, OS assigns a free port, server reports the actual port back via stdout. Main process parses it and passes to the renderer via IPC. |
| **Complexity** | Low-Medium. Requires changing the server startup to report its port, and the renderer to receive the port dynamically rather than hardcoding `localhost:3456`. |
| **Dependencies** | Best combined with 2.2 (handshake token) for defense in depth. |

---

## Tier 3 -- Advanced / Differentiating

Nice-to-have for an educator tool. These provide defense against sophisticated
attacks or are required for enterprise/school-district deployment.

### 3.1 Code Signing

| Aspect | Detail |
|--------|--------|
| **What** | Sign the application binary and installer with a code-signing certificate. |
| **Why** | Without signing, Windows SmartScreen blocks the installer and warns users. macOS Gatekeeper refuses to run unsigned apps entirely. Teachers will not trust software their OS warns about. |
| **How** | Purchase an EV code-signing certificate (or use Apple Developer ID for macOS). Configure electron-builder to sign during CI/CD. For Windows, EV certs require a hardware token (USB) or cloud HSM. |
| **Complexity** | Medium. The signing itself is config; the cost and HSM logistics are the real complexity. ~$200-400/year for certs. |
| **Dependencies** | CI/CD pipeline must exist. |

### 3.2 Auto-Update Signature Verification

| Aspect | Detail |
|--------|--------|
| **What** | Verify that downloaded updates are signed by the same publisher before installing. |
| **Why** | `electron-updater` is already integrated. Without signature verification, an attacker who compromises the update server (or DNS) can push a malicious update. |
| **How** | electron-builder supports update signing out of the box. Generate a signing key pair, embed the public key in the app, sign `latest.yml` during the build. electron-updater verifies the signature automatically. |
| **Complexity** | Low (if code signing is already done). Config in `electron-builder.yml`. |
| **Dependencies** | 3.1 (code signing) or at minimum a dedicated update-signing keypair. |

### 3.3 Process Sandboxing Audit

| Aspect | Detail |
|--------|--------|
| **What** | Ensure all renderer processes and WebContentsViews run with OS-level sandboxing enabled. |
| **Why** | The main window already has `sandbox: true` (good). But the `--no-sandbox` flag is appended on Linux (line 13 of `main.ts`). Embedded views have `sandbox: false`. A full audit ensures no process escapes the sandbox. |
| **How** | Remove `--no-sandbox` on Linux (it was likely added to work around a GPU issue -- the GPU is already disabled on that path). Set `sandbox: true` on all WebContentsView instances. Test on all three platforms. |
| **Complexity** | Medium. Risk of breaking Linux headless/CI environments. Requires testing matrix. |
| **Dependencies** | 2.6 (embedded view hardening). |

### 3.4 Network Request Allowlisting

| Aspect | Detail |
|--------|--------|
| **What** | Restrict which URLs the renderer and embedded views can reach at the network level. |
| **Why** | If XSS or code execution occurs, the attacker can exfiltrate data to any server. An allowlist limits damage. |
| **How** | Use `session.defaultSession.webRequest.onBeforeRequest` to block requests to non-allowlisted domains. Allowlist: localhost, Anthropic API, OpenAI API, Ollama, MyOpenMath, Aeries, and any other configured providers. |
| **Complexity** | Medium. Must dynamically update the allowlist when the teacher configures new AI providers or site profiles. |
| **Dependencies** | None, but benefits from 1.3 (CSP) for defense in depth. |

### 3.5 Encrypted SQLite Database (Full Database Encryption)

| Aspect | Detail |
|--------|--------|
| **What** | Use SQLCipher or similar to encrypt the entire database file. |
| **Why** | Goes beyond field-level encryption (1.1) to protect all data -- student names, scores, grading history, site profiles. Relevant for FERPA compliance if student PII is involved. |
| **How** | Replace `better-sqlite3` with `better-sqlite3` + SQLCipher extension, or `@journeyapps/sqlcipher`. Key derived from OS keychain via `safeStorage`. |
| **Complexity** | High. Requires native module rebuild, migration path for existing unencrypted databases, performance testing. SQLCipher adds ~5-10% overhead. |
| **Dependencies** | 1.1 (credential encryption via safeStorage) should be done first -- it is simpler and covers the highest-risk fields. |

### 3.6 Audit Logging

| Aspect | Detail |
|--------|--------|
| **What** | Log security-relevant events: credential access, API key usage, grading actions, auth failures. |
| **Why** | For school-district IT review and incident response. If a teacher's machine is compromised, logs help determine what was accessed. |
| **How** | Write structured JSON logs to a separate file in `userData`. Include timestamps, action type, success/failure. Rotate logs. Never log credential values. |
| **Complexity** | Medium. The logging itself is simple; deciding what to log and making it useful requires design. |
| **Dependencies** | None. |

### 3.7 Permission-Scoped IPC (Capability-Based)

| Aspect | Detail |
|--------|--------|
| **What** | Assign capabilities to different renderer contexts so the embedded browser view cannot call database or credential IPC. |
| **Why** | Currently all IPC handlers are globally registered. If an attacker achieves code execution in an embedded WebContentsView, they could (in theory, if sandbox is off) reach IPC handlers meant only for the main UI. |
| **How** | Check `event.sender` in each IPC handler and compare against the known main window webContents ID. Reject calls from embedded views. |
| **Complexity** | Low-Medium. Add a sender-verification wrapper around security-sensitive handlers. |
| **Dependencies** | 1.4 (IPC hardening) should be done first. |

---

## Anti-Features -- Deliberately Do NOT Build

| Anti-Feature | Why Not |
|---|---|
| **Custom encryption algorithm** | Use `safeStorage` (OS-backed) or well-known libraries. Rolling your own crypto is the #1 way to get it wrong. |
| **In-app password manager** | The app needs site credentials for autofill, but do not build vault features (master password, password generation, breach checking). Use OS keychain integration instead. |
| **Certificate pinning for localhost** | The grading server is localhost-only. TLS for localhost adds complexity (self-signed cert management, trust store injection) with minimal benefit. Handshake token (2.2) is sufficient. |
| **Custom auto-update server** | Use GitHub Releases + electron-updater. Building a custom update server adds attack surface and maintenance burden. |
| **Obfuscation / binary packing** | Does not provide real security. ASAR files are trivially extractable regardless. Focus on making the code safe to inspect, not on hiding it. |
| **Encrypted IPC channel** | IPC between main and renderer is in-process memory. Encrypting it adds overhead with zero security benefit -- if an attacker can read IPC memory, they already own the process. |
| **DRM on grading data** | Grading data belongs to the teacher. Do not restrict their ability to export, backup, or migrate. |
| **Network-level MITM detection** | The app makes outbound HTTPS calls to AI providers. TLS handles transport security. Do not add custom certificate validation or pinning for external APIs -- it breaks corporate proxies and adds maintenance. |

---

## Dependency Graph

```
Tier 1 (do first)
  1.1 Credential Encryption ──────────────────┐
  1.2 XSS Sanitization ──┐                    │
  1.3 CSP ────────────────┤                    │
  1.4 IPC Hardening ──────┼─► 1.6 DB Access ──┤
  1.5 eval/exec Restrict  │                    │
                          │                    │
Tier 2 (do next)         │                    │
  2.1 CORS Restrict ──┐  │                    │
  2.2 Handshake Token ┤  │   2.3 Key Masking ─┘
  2.4 Debug Port ──────┤  │
  2.5 Rate Limiting    │  │
  2.6 Sandbox Views ───┤  │
  2.7 Random Port ─────┘  │
                          │
Tier 3 (when ready)       │
  3.1 Code Signing ─► 3.2 Auto-Update Verify
  3.3 Sandbox Audit (needs 2.6)
  3.4 Network Allowlist (benefits from 1.3)
  3.5 Full DB Encryption (needs 1.1)
  3.6 Audit Logging
  3.7 Scoped IPC (needs 1.4)
```

---

## Recommended Sequencing

**Phase 1 -- Immediate (blocks any public release):**
1. 1.1 Credential encryption via `safeStorage`
2. 1.2 DOMPurify on `ResponseRenderer`
3. 1.4 Remove generic IPC `invoke` passthrough
4. 2.4 Conditional debug port (one-line fix)
5. 2.1 CORS origin restriction (few lines in Hono)

**Phase 2 -- Before beta users:**
6. 1.3 CSP headers
7. 2.2 Handshake token for server auth
8. 2.3 API key masking
9. 2.6 Sandbox embedded views
10. 2.5 Rate limiting

**Phase 3 -- Before v1.0 release:**
11. 1.5 Replace eval/executeJavaScript with command vocabulary
12. 1.6 Named database query handlers
13. 2.7 Random server port
14. 3.1 Code signing
15. 3.2 Auto-update verification

**Phase 4 -- Post-launch hardening:**
16. 3.3 Full sandbox audit
17. 3.4 Network allowlisting
18. 3.5 SQLCipher full-DB encryption
19. 3.6 Audit logging
20. 3.7 Capability-scoped IPC

---

## Sources and References

- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security) -- official guide, covers CSP, sandbox, contextIsolation, nodeIntegration
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) -- OS-backed encryption
- [DOMPurify](https://github.com/cure53/DOMPurify) -- standard HTML sanitizer
- [electron-builder Code Signing](https://www.electron.build/code-signing) -- signing config
- [OWASP Electron Security](https://cheatsheetseries.owasp.org/cheatsheets/Electron_Security_Cheat_Sheet.html) -- OWASP perspective
- [SQLCipher](https://www.zetetic.net/sqlcipher/) -- transparent SQLite encryption
