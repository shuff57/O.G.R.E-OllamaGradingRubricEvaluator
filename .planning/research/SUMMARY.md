# Security Hardening Research Summary

## Stack Recommendations

**Credential Encryption:** Electron `safeStorage` (DPAPI on Windows) — built-in, no dependencies. Encrypt before INSERT, decrypt after SELECT. Store as base64 in existing TEXT columns. Must gate on `isEncryptionAvailable()`.

**HTML Sanitization:** DOMPurify — mature, well-maintained. One-line integration: `DOMPurify.sanitize(html)` before any `innerHTML` or `{@html}` injection.

**CORS Hardening:** Hono's built-in `cors()` middleware with `origin` restricted to `http://localhost:*` and `http://127.0.0.1:*`. No new dependencies needed.

**Rate Limiting:** `hono-rate-limiter` for Hono framework. Sliding window, in-memory store sufficient for local-only server.

**CSP:** Set via `session.defaultSession.webRequest.onHeadersReceived` in Electron main process. Restrict `script-src`, `connect-src`, and `default-src` to `'self'` plus explicit localhost and AI provider domains.

## Table Stakes (Must Fix)

1. Encrypt credentials at rest (safeStorage + base64 in SQLite)
2. Sanitize AI-generated HTML (DOMPurify before innerHTML)
3. Content Security Policy on renderer
4. IPC hardening: remove generic `invoke` passthrough, replace with named handlers
5. Restrict eval/inject IPC to named operations registry

## Standard Hardening

6. CORS restricted to localhost origins
7. Authenticated server handshake (env-var token generated at spawn time)
8. Redact API keys from `/api/providers` response
9. Debug port disabled in production builds (wrap in `isDev` check)
10. Remove CDP port advertisement file in production
11. Enable WebContentsView sandbox (`sandbox: true`)
12. Rate limiting on server endpoints

## Architecture Findings

**Five boundaries to harden (in order):**
1. CDP debug port — 5-minute fix, closes biggest hole
2. Server auth — replace handshake with spawn-time env-var token (~1 hour)
3. Database IPC — replace raw SQL with ~15 domain-specific handlers
4. Webview script injection — build named-operations registry in main process
5. WebContentsView sandbox — set `sandbox: true` in browser-manager.ts

## Key Pitfalls to Avoid

1. **Migration data loss:** Use `encryption_version` column for idempotent migration, don't delete plaintext in same step as encrypting
2. **safeStorage unavailability:** Always check `isEncryptionAvailable()`, fall back gracefully
3. **Decryption failure after OS reinstall:** Wrap every `decryptString()` in try/catch, prompt re-entry instead of crashing
4. **Encrypted blobs in TEXT columns:** Must base64-encode `Buffer` before SQLite storage
5. **innerHTML→textContent overcorrection:** Feedback HTML is intentionally formatted — sanitize, don't strip
6. **CORS breaking legitimate requests:** Test with both Electron renderer and embedded webview origins
7. **Rate limiting blocking batch operations:** Grading sends many rapid requests — tune limits for batch patterns
8. **Debug port removal breaking dev workflow:** Use build flag, not code removal

## Build Order

Research recommends starting with quick wins (CDP port, sandbox, catch-all invoke removal), then server auth, then progressively larger refactors for database encryption and webview script injection. Credential migration is the highest-risk change and needs the most testing.

---
*Research completed: 2026-03-28*
*Sources: STACK.md (619 lines), FEATURES.md (315 lines), ARCHITECTURE.md (436 lines), PITFALLS.md (497 lines)*
