# Requirements: O.G.R.E Security Hardening

**Defined:** 2026-03-29
**Core Value:** Teachers must be able to trust that their credentials, student data, and AI provider keys are safe.

## v1 Requirements

Requirements for this hardening sprint. Each maps to roadmap phases.

### Credential Encryption

- [ ] **CRED-01**: Site credentials (usernames, passwords) are encrypted at rest using Electron safeStorage before SQLite storage
- [ ] **CRED-02**: OAuth tokens (access_token, refresh_token) are encrypted at rest using Electron safeStorage before SQLite storage
- [ ] **CRED-03**: AI provider API keys are encrypted at rest using Electron safeStorage before SQLite storage
- [ ] **CRED-04**: Existing plaintext credentials are migrated to encrypted storage on first launch after update, using an `encryption_version` column for idempotent re-migration
- [ ] **CRED-05**: When safeStorage is unavailable (headless, CI, Linux without keyring), credentials are stored as-is with a logged warning — the app does not crash
- [ ] **CRED-06**: When decryption fails (OS reinstall, profile reset), the credential is cleared and the user is prompted to re-enter it — the app does not crash

### XSS Prevention

- [ ] **XSS-01**: AI-generated feedback HTML is sanitized via DOMPurify before innerHTML injection in batch-grader.ts
- [ ] **XSS-02**: Markdown-rendered AI responses are sanitized via DOMPurify before {@html} injection in ResponseRenderer.svelte and any other rendering surfaces
- [ ] **XSS-03**: Content Security Policy is set on the Electron renderer via session.webRequest.onHeadersReceived, restricting script-src, connect-src, and default-src

### Server Authentication & CORS

- [ ] **AUTH-01**: CORS origin is restricted to localhost and 127.0.0.1 (no wildcard)
- [ ] **AUTH-02**: The handshake token endpoint is replaced with a spawn-time shared secret passed via environment variable from Electron to the grading server
- [ ] **AUTH-03**: The `/api/providers` endpoint redacts API keys, access tokens, and refresh tokens from its response (returns masked values like `sk-...xxxx`)
- [ ] **AUTH-04**: Rate limiting is applied to grading server endpoints, with limits tuned to not block legitimate batch grading operations

### IPC & Process Isolation

- [ ] **IPC-01**: The generic `invoke` passthrough in preload.ts is removed; all IPC calls use named, typed functions
- [ ] **IPC-02**: `dbQuery` and `dbExecute` raw SQL IPC handlers are replaced with domain-specific handlers (e.g., `getProviderConfigs`, `saveCredential`, `getGradingSession`)
- [ ] **IPC-03**: `evalWebviewScript` and `injectWebviewScript` are replaced with a named-operations registry in the main process (e.g., `fillScore`, `extractStudents`, `clickElement`)
- [ ] **IPC-04**: WebContentsView sandbox is enabled (`sandbox: true` in browser-manager.ts)

### Debug & Port Management

- [ ] **PORT-01**: CDP communication is migrated from raw debug port (9223) to Electron's `webContents.debugger.attach()` API, eliminating the network-exposed debug port entirely. An IPC relay layer mediates external agent access through the main process.
- [ ] **PORT-02**: CDP port advertisement file (`~/.ogre/cdp-port`) is removed; the `--remote-debugging-port` flag is only set in development builds
- [ ] **PORT-03**: Grading server port is configurable via environment variable with fallback to 3456, and the server tries alternative ports if the primary is in use

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Security

- **ADV-01**: Code signing for Windows installer (NSIS) and auto-update verification
- **ADV-02**: Electron Fuses configuration to disable dangerous features at build time
- **ADV-03**: Audit logging for sensitive operations (credential access, grade modifications)
- **ADV-04**: Renderer process sandboxing (beyond WebContentsView sandbox)

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTPS for localhost server | Local-only server; TLS adds complexity without meaningful benefit for same-machine communication |
| Multi-user access control | Single-teacher tool; no multi-user auth model needed |
| Custom cryptography | Research explicitly warns against this; use OS-provided encryption (DPAPI) |
| Network-level hardening | Server is localhost-only; network security is out of scope |
| Full penetration testing | This is a hardening sprint, not a formal security audit |
| server.js monolith refactoring | Technical debt, not security — separate milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IPC-01 | Phase 1: Quick Wins | Not started |
| IPC-04 | Phase 1: Quick Wins | Not started |
| PORT-02 | Phase 1: Quick Wins | Not started |
| AUTH-01 | Phase 2: Server Auth & CORS | Not started |
| AUTH-02 | Phase 2: Server Auth & CORS | Not started |
| AUTH-03 | Phase 2: Server Auth & CORS | Not started |
| XSS-01 | Phase 3: XSS Prevention | Not started |
| XSS-02 | Phase 3: XSS Prevention | Not started |
| XSS-03 | Phase 3: XSS Prevention | Not started |
| CRED-01 | Phase 4: Credential Encryption | Not started |
| CRED-02 | Phase 4: Credential Encryption | Not started |
| CRED-03 | Phase 4: Credential Encryption | Not started |
| CRED-04 | Phase 4: Credential Encryption | Not started |
| CRED-05 | Phase 4: Credential Encryption | Not started |
| CRED-06 | Phase 4: Credential Encryption | Not started |
| PORT-01 | Phase 5: CDP Migration & IPC Hardening | Not started |
| IPC-02 | Phase 5: CDP Migration & IPC Hardening | Not started |
| IPC-03 | Phase 5: CDP Migration & IPC Hardening | Not started |
| PORT-03 | Phase 6: Port Management & Rate Limiting | Not started |
| AUTH-04 | Phase 6: Port Management & Rate Limiting | Not started |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20 ✓
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after roadmap phase assignment*
