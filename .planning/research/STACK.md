# Security Stack for Hardening O.G.R.E Electron 33 Desktop App

Research date: 2026-03-28
Target: Electron ^33.4.11, Hono ^4.11.9, Bun runtime, better-sqlite3 ^11.10, Windows 11

---

## Table of Contents

1. [Credential Encryption with Electron safeStorage](#1-credential-encryption-with-electron-safestorage)
2. [CORS Hardening for Localhost HTTP Server](#2-cors-hardening-for-localhost-http-server)
3. [Rate Limiting for Hono/Bun](#3-rate-limiting-for-honobun)
4. [IPC Surface Reduction](#4-ipc-surface-reduction)
5. [Secure Storage for Config Files with API Keys](#5-secure-storage-for-config-files-with-api-keys)
6. [Content Security Policy](#6-content-security-policy)
7. [Remote Debugging Port Management](#7-remote-debugging-port-management)
8. [Current O.G.R.E Security Audit Summary](#8-current-ogre-security-audit-summary)

---

## 1. Credential Encryption with Electron safeStorage

### What it is

`electron.safeStorage` provides OS-level encryption for secrets at rest. On Windows it uses DPAPI (Data Protection API), on macOS it uses Keychain, and on Linux it uses the Secret Service API (via libsecret) or falls back to a basic encryption scheme.

### API (Electron 33)

```ts
import { safeStorage } from 'electron'

// Check availability — MUST be called after app.whenReady()
if (safeStorage.isEncryptionAvailable()) {
  // Encrypt: string -> Buffer (binary ciphertext)
  const encrypted: Buffer = safeStorage.encryptString('sk-ant-api03-xxxxx')

  // Decrypt: Buffer -> string (plaintext)
  const plaintext: string = safeStorage.decryptString(encrypted)
}
```

Key details:
- `isEncryptionAvailable()` returns `boolean`. Always gate on this before calling encrypt/decrypt.
- `encryptString(plaintext: string)` returns a `Buffer`. Store this as base64 in your config file or SQLite.
- `decryptString(encrypted: Buffer)` returns the original string. Throws if the buffer is corrupt or was encrypted by a different OS user.
- The encrypted blob is **tied to the OS user account**. A different Windows user on the same machine cannot decrypt it.
- Available in **main process only** (not renderer). This is correct — secrets should never transit the renderer.

### Storage pattern for O.G.R.E

```ts
// In main process: secure-store.ts
import { safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const STORE_PATH = path.join(app.getPath('userData'), 'credentials.enc.json')

interface EncryptedStore {
  [key: string]: string  // key -> base64-encoded ciphertext
}

export function storeSecret(key: string, plaintext: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption unavailable')
  }
  const store = loadStore()
  store[key] = safeStorage.encryptString(plaintext).toString('base64')
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function readSecret(key: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = loadStore()
  if (!store[key]) return null
  return safeStorage.decryptString(Buffer.from(store[key], 'base64'))
}

function loadStore(): EncryptedStore {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}
```

### What NOT to use

- **electron-store with encryption** — its "encryption" is AES with a key embedded in the source code. It is obfuscation, not security. The key ships with your app binary.
- **keytar** — deprecated since 2023. Was the go-to before safeStorage existed. The Electron team built safeStorage specifically to replace it. keytar also requires native compilation which causes packaging headaches.
- **Rolling your own AES with a derived key** — unless you have a user-supplied password, where do you store the key? You end up right back at needing DPAPI/Keychain, which is what safeStorage already does.

### Rationale for O.G.R.E

The current `ogre-server.json` stores API keys and bearer tokens in **plaintext JSON** on disk at `%APPDATA%/ogre-desktop/`. Any process running as the same Windows user can read them. safeStorage encrypts them with the Windows user's DPAPI master key, meaning the ciphertext is opaque to other applications that don't know the DPAPI context.

---

## 2. CORS Hardening for Localhost HTTP Server

### Current state (vulnerability)

```js
// grading-server/server.js line 295
app.use('/*', cors({
  origin: '*',  // <-- allows ANY webpage to make requests
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))
```

`origin: '*'` means any website the user visits in their browser can send requests to `localhost:3456`. If a malicious site knows the port, it could probe the API. The bearer token mitigates unauthenticated access, but the `/api/handshake` endpoint (which returns the token) is excluded from auth, making it a real attack vector.

### Recommended fix

```ts
import { cors } from 'hono/cors'

app.use('/*', cors({
  origin: (origin) => {
    // Allow requests from Electron (no origin or file://) and localhost dev server
    if (!origin) return '*'  // No Origin header = same-origin or non-browser
    const url = new URL(origin)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return origin
    }
    return null  // Reject all other origins
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
```

### Additional: Bind to loopback only

The server should listen **only** on `127.0.0.1`, not `0.0.0.0`. Check the current `serve()` call:

```ts
// Hono @hono/node-server
import { serve } from '@hono/node-server'

serve({
  fetch: app.fetch,
  port: 3456,
  hostname: '127.0.0.1',  // CRITICAL: loopback only, not 0.0.0.0
})
```

This prevents other devices on the network from reaching the server at all, regardless of CORS headers. CORS is a browser-only enforcement; a direct HTTP client ignores it entirely.

### Hardening the handshake endpoint

The `/api/handshake` endpoint currently returns the bearer token to anyone on localhost. Consider:

1. Restrict it to accept only requests with no `Origin` header (Electron's `net.fetch` sends no Origin).
2. Or require a shared secret passed via environment variable from the Electron main process.

```ts
app.get('/api/handshake', (c) => {
  const origin = c.req.header('Origin')
  if (origin) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return c.json({ token: handshakeToken })
})
```

### What NOT to do

- **Do not use `Access-Control-Allow-Origin: *` with `credentials: true`** — browsers reject this combination, but it signals a misunderstanding of the security model.
- **Do not rely solely on CORS for security** — CORS is enforced by browsers only. Any local process can call `localhost:3456` directly. The bearer token is your real defense; CORS is defense-in-depth against web-based attacks.

---

## 3. Rate Limiting for Hono/Bun

### Library: `hono-rate-limiter`

The official community rate limiter for Hono. Works with all Hono runtimes including Bun.

```
npm install hono-rate-limiter
```

Current version: 0.4.x (as of early 2026)

### Usage

```ts
import { rateLimiter } from 'hono-rate-limiter'

// Apply to all API routes
app.use('/api/*', rateLimiter({
  windowMs: 60 * 1000,    // 1 minute window
  limit: 100,              // max 100 requests per window per key
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    // For localhost-only server, use a fixed key (all requests are local)
    // Or derive from Authorization header to rate-limit per token
    return c.req.header('Authorization') ?? 'anonymous'
  },
}))

// Stricter limit on handshake to prevent brute-force
app.use('/api/handshake', rateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: () => 'handshake-global',
}))
```

### Built-in store

`hono-rate-limiter` uses an in-memory store by default, which is fine for a single-process localhost server like O.G.R.E's grading-server. No Redis or external store needed.

### Alternative: Manual middleware

For a simple localhost server, a hand-rolled limiter is also fine:

```ts
const hitCounts = new Map<string, { count: number; resetAt: number }>()

app.use('/api/*', async (c, next) => {
  const key = c.req.header('Authorization') ?? 'anon'
  const now = Date.now()
  const entry = hitCounts.get(key)

  if (!entry || now > entry.resetAt) {
    hitCounts.set(key, { count: 1, resetAt: now + 60_000 })
  } else if (entry.count >= 100) {
    return c.json({ error: 'Rate limit exceeded' }, 429)
  } else {
    entry.count++
  }
  return next()
})
```

### What NOT to use

- **express-rate-limit** — Express-only. Does not work with Hono.
- **@hono/rate-limiter** — does not exist as an official `@hono/` scoped package. The community package is `hono-rate-limiter`.
- **Overly complex distributed rate limiters (Redis-backed, sliding window)** — overkill for a single-process localhost server.

### Rationale for O.G.R.E

Rate limiting protects against:
- A runaway renderer loop hammering the grading API
- Accidental tight-loop retries burning through API provider credits
- Any local process that discovers the port and tries to abuse it

---

## 4. IPC Surface Reduction

### Current state

The preload script exposes **26+ IPC channels** including a generic `invoke` passthrough:

```ts
// preload.ts line 46
invoke: <T>(channel: string, args?: Record<string, unknown>) => invoke<T>(channel, args),
```

This generic `invoke` lets the renderer call **any** `ipcMain.handle` channel by name. If a malicious script runs in the renderer (via XSS in an embedded webview, a compromised dependency, etc.), it can call every registered handler.

### Recommended pattern: Allowlist in preload

Remove the generic `invoke` and expose only the specific channels the renderer needs:

```ts
// preload.ts — REMOVE the generic invoke
// invoke: <T>(channel: string, args?: Record<string, unknown>) => invoke<T>(channel, args),

// Keep only the named methods (already there)
contextBridge.exposeInMainWorld('electronAPI', {
  createEmbeddedBrowser: (tabId: string, url: string) => invoke('create_embedded_browser', { tabId, url }),
  // ... other specific methods ...
})
```

### Recommended pattern: Validate IPC arguments in main

Every `ipcMain.handle` should validate its arguments. Currently, handlers like `inject_autofill`, `eval_webview_script`, and `inject_webview_script` accept arbitrary JavaScript strings to execute. These are the highest-risk handlers.

```ts
// cdp-bridge.ts — add validation
ipcMain.handle('cdp_send', async (_e, { tabId, method, params }) => {
  // Allowlist CDP methods
  const ALLOWED_CDP_METHODS = [
    'Runtime.evaluate',
    'DOM.getDocument',
    'Accessibility.getFullAXTree',
    'Page.navigate',
    // ... enumerate what you actually use
  ]

  if (!ALLOWED_CDP_METHODS.includes(method)) {
    throw new Error(`CDP method not allowed: ${method}`)
  }

  return cdpManager.send(tabId, method, params)
})
```

### Recommended pattern: Separate preloads for embedded webviews

The embedded browser views (WebContentsView) in `browser-manager.ts` currently use:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  // No preload — good, these views should have no IPC access
}
```

This is already correct. Verify it stays this way and that no preload is added to embedded views.

### Dangerous IPC channels to audit

| Channel | Risk | Mitigation |
|---------|------|------------|
| `inject_autofill` | Arbitrary JS execution in webview | Validate script is from a known set of autofill templates |
| `eval_webview_script` | Arbitrary JS execution in webview | Allowlist or template-based approach |
| `inject_webview_script` | Arbitrary JS execution in webview | Same as above |
| `cdp_send` | Full CDP access to attached target | Allowlist methods |
| `oauth:fetch` | SSRF — renderer can make main process fetch any URL | Allowlist target domains |
| `scan_local_skills` | Filesystem read — renderer controls the directory path | Restrict to known skill directories |
| `db_query` / `db_execute` | Direct SQL execution | Parameterized queries only; consider a query allowlist |

### The `oauth:fetch` SSRF concern

```ts
// ipc-handlers.ts
ipcMain.handle('oauth:fetch', async (_e, { url, method, headers, body }) => {
  const res = await net.fetch(url, { method, headers, body })
  // ...
})
```

The renderer can make the main process fetch **any URL**. Restrict to known OAuth endpoints:

```ts
const ALLOWED_OAUTH_HOSTS = [
  'console.anthropic.com',
  'accounts.google.com',
  'github.com',
  'api.github.com',
]

ipcMain.handle('oauth:fetch', async (_e, { url, ...rest }) => {
  const parsed = new URL(url)
  if (!ALLOWED_OAUTH_HOSTS.includes(parsed.hostname)) {
    throw new Error(`oauth:fetch blocked for host: ${parsed.hostname}`)
  }
  // proceed...
})
```

### What NOT to do

- **Do not use `ipcRenderer.send`/`ipcMain.on` for request-response** — use `invoke`/`handle` instead. The `send`/`on` pattern has no built-in error propagation and makes it easy to accidentally leave channels open.
- **Do not pass `webContents` IDs through IPC** — this can enable confused-deputy attacks where the renderer tricks main into acting on the wrong webContents.
- **Do not disable `contextIsolation` or enable `nodeIntegration`** — the current settings are correct. Never change them.

---

## 5. Secure Storage for Config Files with API Keys

### Current vulnerability

`ogre-server.json` stores provider credentials in plaintext:

```json
{
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "providers": [
    {
      "id": "ollama-cloud",
      "credentials": { "api_key": "rp_xxxxxxxxx", "endpoint_id": "xxxxx" }
    }
  ]
}
```

Any process running as the user can read `%APPDATA%/ogre-desktop/ogre-server.json`.

### Recommended architecture

Split config into two files:

1. **`ogre-server.json`** — non-sensitive config (provider URLs, model names, UI preferences). Stays plaintext. The grading-server child process reads this directly.
2. **`credentials.enc.json`** — encrypted secrets (API keys, OAuth tokens). Only the Electron main process reads this via `safeStorage.decryptString()`. Secrets are passed to the grading-server via environment variables on spawn, never written to disk in plaintext.

```ts
// server-manager.ts — pass decrypted secrets via env
serverProcess = spawn(bunExe, ['run', 'server.js'], {
  env: {
    ...process.env,
    OGRE_CONFIG_DIR: configDir,
    OGRE_BEARER_TOKEN: readSecret('bearer-token') ?? '',
    OGRE_RUNPOD_API_KEY: readSecret('runpod-api-key') ?? '',
    OGRE_ANTHROPIC_KEY: readSecret('anthropic-key') ?? '',
    // ... etc
  },
})
```

The grading-server reads `process.env.OGRE_RUNPOD_API_KEY` instead of reading it from the JSON file. Environment variables are visible only to the process and its children, not to other user-level processes (on Windows, `Get-Process` does not expose another process's env block by default).

### File permissions

On Windows, set restrictive ACLs on the credentials file:

```ts
import { execSync } from 'node:child_process'

function restrictFileAccess(filePath: string): void {
  if (process.platform === 'win32') {
    // Remove inherited permissions, grant only current user
    execSync(`icacls "${filePath}" /inheritance:r /grant:r "%USERNAME%:F"`, { stdio: 'ignore' })
  }
}
```

### What NOT to use

- **dotenv files (`.env`)** — plaintext, often accidentally committed to git.
- **Windows Credential Manager via `node-keytar`** — deprecated, native compilation issues.
- **Encrypted SQLite (sqlcipher)** — where do you store the encryption key? Right back to the same problem.
- **Registry storage** — HKCU values are readable by any process running as the same user. No better than a file.

---

## 6. Content Security Policy

### Why it matters

An Electron renderer is a Chromium browser. Without CSP, an XSS vulnerability (or a compromised npm dependency) can load arbitrary remote scripts, exfiltrate data, or connect to external servers.

### Recommended CSP for O.G.R.E

Set CSP via the `session.webRequest` API in main process (more reliable than meta tags):

```ts
import { session } from 'electron'

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",   // Svelte requires inline styles
            "img-src 'self' data: https:",          // Allow data URIs for images, HTTPS images
            "font-src 'self' data:",
            "connect-src 'self' http://localhost:3456 http://127.0.0.1:3456 ws://localhost:* wss://localhost:*",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; '),
        ],
      },
    })
  })
})
```

### Key directives explained

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `default-src` | `'self'` | Block all resources not explicitly allowed |
| `script-src` | `'self'` | No inline scripts, no eval, no remote scripts |
| `style-src` | `'self' 'unsafe-inline'` | Svelte 5 injects scoped styles; `'unsafe-inline'` is needed unless you use a nonce strategy |
| `connect-src` | `'self' http://localhost:3456 ...` | Allow XHR/fetch to the local grading server only |
| `frame-src` | `'none'` | Prevent iframe embedding (embedded views use WebContentsView, not iframes) |
| `object-src` | `'none'` | Block plugins (Flash, Java, etc.) |

### Svelte 5 and CSP

Svelte 5 compiles styles into `<style>` tags at build time, not runtime injection. However, some Svelte features (transitions, dynamic styles) may inject inline styles. Two approaches:

1. **`'unsafe-inline'` for style-src** — simpler, acceptable tradeoff since style injection is lower risk than script injection.
2. **Nonce-based** — generate a nonce per page load and configure Svelte's compiler to use it. More complex, marginal security gain for a local desktop app.

Recommendation: use `'unsafe-inline'` for `style-src` only. Keep `script-src` strict.

### What NOT to do

- **Do not use `'unsafe-eval'`** in `script-src` — this disables a major XSS protection. If you need it for a library, find an alternative library.
- **Do not set CSP via `<meta>` tag** — it can be stripped or overridden. Use `webRequest.onHeadersReceived` in main process.
- **Do not use `script-src 'unsafe-inline'`** — this negates most of CSP's value for script protection.

---

## 7. Remote Debugging Port Management

### Current state (vulnerability)

```ts
// main.ts line 21
app.commandLine.appendSwitch('remote-debugging-port', '9223')
```

This is **always enabled**, even in production builds. Port 9223 exposes a full Chrome DevTools Protocol endpoint. Any local process can connect to it and:
- Read all page content
- Execute JavaScript in any renderer
- Access cookies, localStorage, and IndexedDB
- Inspect network traffic

### Recommended fix

Only enable in development:

```ts
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
}
```

### But O.G.R.E needs CDP for browser automation

The CDP bridge in `cdp-bridge.ts` uses the remote debugging port to automate embedded webviews. The key insight: **CDP access to WebContentsView targets does not require the `--remote-debugging-port` flag.** Electron's `webContents.debugger` API provides CDP access directly from the main process without opening a network port.

```ts
import { WebContentsView } from 'electron'

// Attach debugger to a specific webContents programmatically
const view: WebContentsView = /* your embedded view */
view.webContents.debugger.attach('1.3')

// Send CDP commands directly — no network port needed
const result = await view.webContents.debugger.sendCommand('Runtime.evaluate', {
  expression: 'document.title'
})

// Listen for CDP events
view.webContents.debugger.on('message', (event, method, params) => {
  // handle CDP events
})

// Detach when done
view.webContents.debugger.detach()
```

This approach:
- Eliminates the open network port entirely
- Scopes CDP access to specific webContents instances
- Works in production builds
- Does not require `--remote-debugging-port`

### If you absolutely need the network port

If there is an external tool dependency that requires network CDP (e.g., external Playwright connecting to the app):

```ts
if (isDev) {
  // Random port to avoid collisions, only in dev
  const port = 9200 + Math.floor(Math.random() * 100)
  app.commandLine.appendSwitch('remote-debugging-port', String(port))
  console.log(`DevTools debugging on port ${port}`)
}
```

### What NOT to do

- **Never ship `--remote-debugging-port` in production** — it is the single most dangerous setting in an Electron app.
- **Do not use a fixed well-known port (9222, 9223)** — scanning tools look for these.
- **Do not expose the debugging port on `0.0.0.0`** — Chromium binds to `127.0.0.1` by default, but verify this.

---

## 8. Current O.G.R.E Security Audit Summary

### What is already correct

| Item | Status |
|------|--------|
| `contextIsolation: true` | Enabled in main window and embedded views |
| `nodeIntegration: false` | Disabled everywhere |
| `sandbox: true` | Enabled on main window |
| `contextBridge` for IPC | Used correctly, no direct `ipcRenderer` exposure |
| Bearer token auth on API | Present for `/api/*` routes |
| Embedded views have no preload | Correct, no IPC leakage to third-party content |

### What needs hardening (priority order)

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `--remote-debugging-port` always on | **Critical** | Conditionally enable in dev only, or migrate to `webContents.debugger` API |
| 2 | `origin: '*'` CORS on grading server | **High** | Restrict to localhost origins |
| 3 | API keys in plaintext JSON config | **High** | Migrate to `safeStorage` + env var injection |
| 4 | Generic `invoke()` in preload | **Medium** | Remove; keep only named channels |
| 5 | No CSP on renderer | **Medium** | Add CSP via `session.webRequest` |
| 6 | `oauth:fetch` SSRF (any URL) | **Medium** | Allowlist target hostnames |
| 7 | `scan_local_skills` path traversal | **Medium** | Restrict to known directories |
| 8 | `eval_webview_script` accepts arbitrary JS | **Medium** | Template-based approach or allowlist |
| 9 | No rate limiting on HTTP server | **Low** | Add `hono-rate-limiter` |
| 10 | Handshake token returned to any localhost caller | **Low** | Reject requests with `Origin` header |

### Dependency versions for implementation

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^33.4.11 | Already installed. safeStorage API stable since Electron 15. |
| `hono` | ^4.11.9 | Already installed. CORS middleware built in. |
| `hono-rate-limiter` | ^0.4.0 | Rate limiting. Install new. |
| `better-sqlite3` | ^11.10.0 | Already installed. Can store encrypted credential blobs. |

No new major dependencies needed. The primary changes are configuration and code patterns, not new libraries.
