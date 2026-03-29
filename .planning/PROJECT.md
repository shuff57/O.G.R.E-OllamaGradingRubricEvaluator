# O.G.R.E — Security Hardening

## What This Is

O.G.R.E (Ollama Grading Rubric Evaluator) is a desktop grading toolkit for educators. It provides AI-assisted grading workflows through an Electron desktop app with an embedded browser, a local Hono/Bun grading server, and browser automation via CDP. Teachers use it to grade student work on MyOpenMath, sync scores to Aeries, and author assessment questions.

This milestone is a focused security hardening sprint to close critical vulnerabilities before broader use.

## Core Value

Teachers must be able to trust that their credentials, student data, and AI provider keys are safe. Security is non-negotiable for a tool handling student grades.

## Requirements

### Validated

- ✓ Multi-provider AI grading (Ollama, Anthropic, OpenAI, Google, GitHub Models) — existing
- ✓ Embedded browser with CDP-based agent mode for automated grading — existing
- ✓ Batch grading with score filling and feedback injection — existing
- ✓ Gradebook sync pipeline (MyOpenMath → Aeries) — existing
- ✓ Site profile discovery and reuse — existing
- ✓ Local SQLite storage for settings, credentials, sessions, embeddings — existing
- ✓ OAuth device flow authentication for Anthropic, GitHub, OpenAI — existing
- ✓ Auto-updater via GitHub Releases — existing

### Active

- [ ] Encrypt site credentials at rest using Electron safeStorage (DPAPI on Windows)
- [ ] Migrate existing plaintext credentials to encrypted storage on first launch
- [ ] Restrict CORS to localhost origins only
- [ ] Authenticate the handshake token endpoint (require shared secret or eliminate endpoint)
- [ ] Redact API keys and tokens from `/api/providers` response
- [ ] Sanitize AI-generated feedback HTML before innerHTML injection
- [ ] Disable remote debugging port in production builds
- [ ] Remove CDP port advertisement file in production
- [ ] Add rate limiting to grading server endpoints
- [ ] Restrict renderer-exposed IPC surface (evalWebviewScript, dbQuery, dbExecute)
- [ ] Encrypt AI provider API keys at rest in config.json
- [ ] Make server port configurable with fallback

### Out of Scope

- Full penetration testing — this is a hardening sprint, not a formal audit
- Network-level security (HTTPS for localhost) — the server is local-only, TLS adds complexity without meaningful benefit
- Multi-user access control — single-teacher tool, no auth model needed
- Refactoring server.js monolith or batch-grader.ts — technical debt, not security
- CI/CD pipeline — separate milestone

## Context

The codebase mapper identified 5 critical and 7 additional security concerns. The critical chain is:
1. Unauthenticated handshake endpoint returns Bearer token
2. CORS wildcard allows any website to call the server
3. `/api/providers` returns full API keys
4. Together: any website the teacher visits can exfiltrate all AI provider keys

Additionally: plaintext credentials in SQLite, innerHTML XSS vector, always-on debug port, exposed IPC surface for script injection and raw SQL.

The app currently runs on Windows 11 with Electron 33 and a Bun-powered grading server on port 3456.

Codebase map: `.planning/codebase/` (7 documents, 1,335 lines)

## Constraints

- **Platform**: Windows 11 primary, Electron 33 + Bun + Hono
- **Backwards compatibility**: Must migrate existing plaintext credentials without data loss
- **Teacher workflow**: Security fixes must not add friction to normal grading workflows (no extra login steps, no visible changes to the grading flow)
- **Local-only**: Server is localhost — fixes should assume trusted network but untrusted local processes
- **No breaking changes**: Provider configs, site profiles, and grading sessions must survive the update

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Electron safeStorage for credential encryption | OS-native keychain (DPAPI on Windows), no external dependencies | — Pending |
| Migrate existing credentials on first launch | Teacher shouldn't need to re-enter passwords | — Pending |
| Restrict CORS to localhost rather than adding CSRF tokens | Simpler, sufficient for local-only server | — Pending |
| Disable debug port via build flag, not removal | Developers still need it in dev mode | — Pending |

---
*Last updated: 2026-03-28 after initialization*
