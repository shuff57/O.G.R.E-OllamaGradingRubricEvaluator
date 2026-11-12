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

---

# Rust rewrite

*Status on 2026-11-11. Branch `rust-rewrite`, folder `rust/`. The roadmap above is for the Electron app and is unchanged.*

## What it is

OGRE rebuilt in Rust with egui/eframe as one desktop program. It drives the teacher's own Chrome over the DevTools Protocol instead of embedding a browser, and has no separate grading server.

| Crate | Holds |
|---|---|
| `ogre-core` | Grading rules ported from `grading-server/grading.js` (prompts byte for byte), rubric text, the rules for what may be written to a page |
| `ogre-llm` | Ollama, Ollama Cloud, OpenAI, Anthropic, Gemini |
| `ogre-grader` | Batch grading, consistency check, anchors, leniency rewording |
| `ogre-harness` | Chrome driver, MyOpenMath and Canvas adapters, mapping of other sites |
| `ogre-agent` | Agent mode and skills, with forced approvals |
| `ogre-app` | The window: Grade, Agent, Sites, History, Settings |

Decisions: desktop only for now (code kept web-compilable), Linux only for now, UI follows the verSHion design. The leniency setting starts at 50, and 50 grades as the Electron app did at its most lenient (75 is the rubric as written). Scores are the AI's own by default, with a Settings switch to work them out from the feedback's verdicts.

## Done

- All four areas ported: MyOpenMath batch grading, Canvas, bring-your-own-site mapping, agent mode and skills.
- Safety rules are in code: no overwrite of a non-zero score or existing feedback unless allowed, a write is refused if the box changed since it was read, AI feedback is sanitized, writes go in batches of five and are read back, saving is a separate step, a missing AI score is "not graded" and never zero, every session is recorded.
- Rubric editing before grading; what is in the editor is what is graded.
- History screen from the session records.
- Consistency-check suggestions can be used or kept with a click; left undecided, the proposal is written.
- Previous and next question on MyOpenMath, from the assignment's Item Analysis list, with a warning before work would be lost.
- Category weights in the rubric card. Weights the teacher sets are written into the rubric text and decide how the AI's per-category scores add up; grading waits while they do not add up to 100.
- Scoring examples (the Electron app's anchors) in the rubric card: written by the AI on request, editable, shown to the grader, kept in the session record.
- Reading the same page again keeps the teacher's rubric edits, instructions and scoring examples.
- Three deliberate departures from the Electron scoring: category scores are always read out of 10; a sub-maximum score is raised to full only when every verdict says "Correct"; category weights are used only when the weights of the categories the AI scored add up to 100 (before, a rubric with one category named differently from the rest scored a perfect answer 3 of 14).
- 919 tests pass by default; 69 more need Chrome, a local model or the AI service.

## Checked on real MyOpenMath pages (read-only)

- Three already-graded pages, 69 students, Ollama Cloud `gemma4:31b`, the Electron app's leniency 0: average gap to the grades on the page about 1.0 of 14; 57 to 60 of 69 within one score step.
- Through the app's own window and Chrome (`rust/crates/ogre-app/tests/live.rs`): one page, 18 students, average gap 0.42, 17 of 18 within one step, page unchanged afterwards.
- Scoring examples on question 360745106 (29 students, 2026-11-12): average gap 1.45, no closer than without them (1.24 to 1.43 over earlier runs).
- Question 360745106 stays about 1.4 away. The two sets of feedback agree on which requirements are correct for 95% of verdicts; the difference is points taken off per missed requirement. That page carries the mark of the Electron app before its 28 October fix (students marked all correct but given 12.5 of 14), so its grades are not a clean target.

## First live write (2026-11-11)

Four ungraded students on one MyOpenMath question, supervised step by step with `OGRE_LIVE_FILL=1` in `rust/crates/ogre-app/tests/live.rs`: preview, approval, fill, read-back with no mismatch, approval, save confirmed by the site. A fresh look from a second browser found all four scores and their feedback stored. The first attempt was discarded unsaved: the read-back check tripped on line breaks the site's editor drops, which is fixed.

## Not verified

- Writing to a live Canvas page, and to a site mapped by the teacher.
- A live MyOpenMath write of more than a handful of students, or one that overwrites existing grades.
- Windows and macOS.
- AI services other than Ollama and Ollama Cloud against the real service.

## Next

1. Grade a whole assignment through the installed app, with the teacher at the controls. It is installed with `rust/packaging/install.sh` (menu entry "OGRE Grader") and built as one file with `rust/packaging/build-appimage.sh`. Settings has "Copy from the old OGRE app" for the AI service and key.
2. Choose the default way of scoring. The same student got 7, 7 and then 5.5 of 14 from the AI's own score in three runs; the Settings switch that works the score out from the feedback's verdicts removes that part of the variation.
3. Weights that are only filled in do not count on a page whose categories name their points ("Interpret(4 pts)"), as in the Electron app: the score is the AI's own total. On a page with plain category names they do. Making them count everywhere was tried on question 360745106 and agreed less well with the grades on the page (average gap 1.72 against about 1.3), so it was left alone.
4. Calibration from earlier sessions is in the engine with no control in the window. It needs graded answers to draw on, and the session records deliberately hold no student responses, so it starts with a decision about keeping them. Outlier review needs no control: the app already marks scores that stand apart.
5. Not ported: rubric import, the solver chat, a skills manager screen, an update prompt.
6. Windows support when wanted.
