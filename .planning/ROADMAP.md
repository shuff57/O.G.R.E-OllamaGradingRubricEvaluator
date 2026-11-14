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
- Saved rubrics: the rubric in the card (text, instructions, scoring examples) is kept under a name and used on any page, for sites whose pages show no rubric OGRE can read. One JSON file each under `rubrics/` in the app's data folder.
- A rubric read from a picture of the page: OGRE screenshots the Chrome tab and a model that can look at pictures returns the criteria, each as a category weighted by its points. Checked with real Chrome and Ollama Cloud `gemma4:31b` on a made-up rubric table (`rust/fixtures/rubric/essay-rubric.html`).
- Three deliberate departures from the Electron scoring: category scores are always read out of 10; a sub-maximum score is raised to full only when every verdict says "Correct"; category weights are used only when the weights of the categories the AI scored add up to 100 (before, a rubric with one category named differently from the rest scored a perfect answer 3 of 14).
- A rubric drafted by the AI from the question, for a question that has none. Checked against Ollama Cloud `gemma4:31b`.
- The Agent screen lists what the agent knows: the built-in site guides and the teacher's own skill files, each skill with a switch that is remembered. A skill of the teacher's is written, changed and deleted in a form there; it is still a Markdown file in the skills folder.
- A skill written by talking it over with the AI: the Electron app's interview, one question at a time, then the skill as a Markdown block. What the AI writes goes to the editor's form; nothing is saved until the teacher saves it there. Checked against Ollama Cloud `gemma4:31b` with a made-up teacher.
- A ticked skill is given to the grader as well as to the agent, as in the Electron app: after the teacher's own instructions, each between `--- SKILL: name ---` lines. Guides to a site are not. The rubric card names the skills the grader will be given, and the session record and History keep their names.
- Scoring examples lead the instructions sent to the grader, so that they calibrate and are not read as instructions (they were joined after the teacher's instructions and then were).
- From the comparison with the Electron app of 2026-11-12 (the teacher chose all twelve gaps it found; all twelve are built):
  - Who to grade: students with no grade yet, late work (at zero or blank and answered now), everyone with an answer, or one student.
  - A zero for no response, as a switch that is off until asked for. Each zero is a proposal in the table, written only with the other grades. The Electron app wrote them unasked.
  - A consistency suggestion's rewritten feedback is shown before it is taken, and taking it can be undone.
  - Edited feedback keeps its lists, bold and emphasis. Nothing is escaped into what students read: before, an edit, and every feedback put into a plain text box such as a Canvas comment, turned `x_1` into `x\_1`.
  - "Reword the rubric now": the leniency rewording goes into the editor to read and change before grading, and is then graded as it stands.
  - "Run the consistency check again" on the grades in the table, without regrading.
  - Grades show in the table as each student is finished, and can be changed or held back meanwhile.
  - Several AI services stay set up, each with its address and model, with a switch on the Grade screen.
  - A Rubrics screen for the saved rubrics, with no page open: write, change (the name too), copy, delete.
  - Carrying on a stopped run with the students it did not reach, and, when a page is read again (after a restart too), the offer to bring back grades the last run proposed for students still ungraded. They come as the AI proposed them; the record does not hold the teacher's later changes.
  - A saved site mapping changed by hand on the Sites screen: each selector editable, or picked by clicking the thing on the page; checked against the open page per field; saved only once the page proves it. How the maximum score is found (not shown, from the text beside the score box, from its own place, or the same for everyone) and how the page is saved (by the teacher, or by a button found by its label or a selector, with what the page shows once it has saved) are in the form too.
- Sites that show one student at a time (2026-11-13). A mapping can hold the button to the next student (and to the previous one, for a site whose students share one address). OGRE then reads every student from the one shown to the last by pressing it, and goes back to each to write: by the student's own address where there is one, by the buttons where not, and never without the name on the page being the one read there. Each grade is saved before OGRE moves on, as on Canvas, so such a site needs a save button and something that shows a save went through; without that it is read and nothing is filled in. Found by the structure rules and by the AI, set by hand in the mapping form. Checked in real Chrome on two made-up sites (`rust/fixtures/generic/one-at-a-time-*.html`), not on a real one. Not handled: a button that saves and moves on in one press, and a site that saves by itself as the score is typed.
- Frames (2026-11-13), in Chrome. The driver can run a script inside a frame of the page, on the same site or another. Two things use it. An answer or a question that is shown in a frame from another site, which a script of the page may not read, is read through the browser. And a grading page that is itself shown inside a frame, as when a school's site shows a grading tool, is mapped, read and written inside that frame: where the open page is no grading page and is mostly one frame, "map this page" maps what the frame shows, the mapping keeps a selector for the frame and is kept under the address the teacher has open, and picking on the page waits for the click inside the frame. Checked in real Chrome on made-up pages (`answers-in-frames.html`, `tool-in-a-frame.html`) and on two sites of different names served by the test. Not handled: a frame inside a frame, and the browser built into OGRE, which says so.
- A read pressed while a grading page is on its way to another address no longer fails with "No grading page OGRE knows is open": within the few seconds after an open, a page that was seen is waited for.
- "Find it, then map" on the Sites screen (2026-11-13): the teacher says which grading page they mean and the agent finds its way there from the open page, under the approvals it always has and told to follow links and nothing else. If it says it got there, the page it stopped on is mapped, with the AI to fall back on; if not, nothing is mapped and what it said is shown. Checked with the local `gemma4:31b` on a made-up school site of three pages (`rust/fixtures/agent/school/`): two clicks, the right page, nothing typed, 230 seconds.
- A browser built into the window, as a second build (`rust/embedded`, 2026-11-12, an experiment). It links Chromium through CEF and a patched copy of the unpublished `egui_webview` crate, and Settings then offers a third place for the page. The usual build is untouched: `ogre-app` only has a `BuiltInBrowser` trait. Since 2026-11-13 the worker drives the built-in page with the driver it has for Chrome, over Chromium's own debugging channel, with the window carrying the messages; the first version ran scripts through a bridge of its own and could do nothing else. The built-in page now takes real clicks and keys and gives pictures of itself, so the agent and a rubric from a picture work there; what a page asks (`alert`, `confirm`, `prompt`, "Leave site?") is shown in the window with its answers; frames of the same site are read. `rust/embedded/install.sh` installs it for the user beside the usual OGRE (about 400 MB with Chromium). Checked with `cargo run --example bridge_check` in `rust/embedded` (read, write, read back, a real click, a key, a picture, a question answered, a frame), and the question card and the installed copy by a picture of OGRE's own window (`OGRE_SHOT`). Not there: file pickers, drag and drop, a frame showing another site. Not tried on a real grading page.
- A review of the week's work (2026-11-13) found ten faults, none of them seen in use yet, and all ten are put right with a test each where one fits: feedback with an empty bold mark at the end of a paragraph crashed the window; a grading tool in a frame that shows one student at a time lost its first student; a walk through the students stopped short without a word at a page it could not read (it now lists a student who cannot be graded, and says so where a page cannot be read at all); "Preview" and "Next question" were taken for buttons to another student; "Map with AI" was pointed at a large frame with no way back to the page; a move inside a frame was not waited for; a failed "Find it, then map" left a later agent run to be mapped; changing the browser in Settings while one was running mixed the two up; a grade already saved, or one of two students of the same name, was offered to be brought back; and a saved rubric could not be renamed in its capitals.
- Grades the teacher approves can be kept as examples and a high, a middle and a low one shown to the grader the next time the same question is graded (Settings, "Your earlier grades"; off unless turned on). An example is a score and its feedback with the student's name taken out; no answer is kept. They are kept on this computer or on the teacher's own server, which is the `ogre-examples-server` program in `rust/crates/ogre-examples` (its README says how to set it up).
- Three of those ten fixes had no test of their own and now have one each (the page mapped when its large frame is only a viewer, the browser that was started staying the one in use, and a name two students share bringing no grade back). Writing the second found one more fault of the same kind, now put right: with Chrome running without a window, changing where the page is shown in Settings took the Browser screen away, and with it the only place that Chrome's page could be seen.
- 1065 tests pass by default; 95 more need Chrome, a local model or the AI service.

## Checked on real MyOpenMath pages (read-only)

- Three already-graded pages, 69 students, Ollama Cloud `gemma4:31b`, the Electron app's leniency 0: average gap to the grades on the page about 1.0 of 14; 57 to 60 of 69 within one score step.
- Through the app's own window and Chrome (`rust/crates/ogre-app/tests/live.rs`): one page, 18 students, average gap 0.42, 17 of 18 within one step, page unchanged afterwards.
- Scoring examples on question 360745106 (29 students, 2026-11-12): average gap 1.45, no closer than without them (1.24 to 1.43 over earlier runs).
- Question 360745106 stays about 1.4 away. The two sets of feedback agree on which requirements are correct for 95% of verdicts; the difference is points taken off per missed requirement. That page carries the mark of the Electron app before its 28 October fix (students marked all correct but given 12.5 of 14), so its grades are not a clean target.

- With the page shown inside OGRE (2026-11-13, `OGRE_LIVE_INSIDE=1`, the sign-in kept from before): 29 students read, 27 graded by Ollama Cloud in 60 seconds, 26 compared with the grades on the page: average gap 0.83 of 14, 12 identical, 25 within 1.5. The page read the same afterwards; nothing was written.
- Earlier grades tried on two already-graded questions (2026-11-13, `earlier_grades` in `rust/crates/ogre-app/tests/live.rs`, read-only): the graded students are split in two, and each half is graded twice without earlier grades and twice with three of the other half's grades from the page shown to the grader. They made no difference. Question 361692790, 26 students: average gap to the page 0.74 of 14 without and 0.74 with; 5 students closer, 5 further, 16 the same. Question 360745106, 29 students: 1.16 without and 1.12 with; 5 closer, 4 further, 20 the same. The same student differs by about 0.2 from one run to the next, so neither is a real change. On 360745106 the AI gives 12.5 where the page has 11 and 14 where it has 12.5, for 10 students, and does so with an 11 among the examples it is shown. Both pages read the same afterwards; nothing was written.

## First live write (2026-11-11)

Four ungraded students on one MyOpenMath question, supervised step by step with `OGRE_LIVE_FILL=1` in `rust/crates/ogre-app/tests/live.rs`: preview, approval, fill, read-back with no mismatch, approval, save confirmed by the site. A fresh look from a second browser found all four scores and their feedback stored. The first attempt was discarded unsaved: the read-back check tripped on line breaks the site's editor drops, which is fixed.

## Not verified

- Writing to a live Canvas page, and to a site mapped by the teacher.
- A live MyOpenMath write of more than a handful of students, or one that overwrites existing grades.
- Windows and macOS.
- AI services other than Ollama and Ollama Cloud against the real service.
- Keeping earlier grades through a real write: the examples were tried on real pages read-only (above), but grades were kept as examples on made-up pages only. The examples server was run on this computer only, never behind HTTPS on another one.

## Next

1. Grade a whole assignment through the installed app, with the teacher at the controls. It is installed with `rust/packaging/install.sh` (menu entry "OGRE Grader") and built as one file with `rust/packaging/build-appimage.sh`. Settings has "Copy from the old OGRE app" for the AI service and key.
2. Choose the default way of scoring. The same student got 7, 7 and then 5.5 of 14 from the AI's own score in three runs; the Settings switch that works the score out from the feedback's verdicts removes that part of the variation.
3. Weights that are only filled in do not count on a page whose categories name their points ("Interpret(4 pts)"), as in the Electron app: the score is the AI's own total. On a page with plain category names they do. Making them count everywhere was tried on question 360745106 and agreed less well with the grades on the page (average gap 1.72 against about 1.3), so it was left alone.
4. The teacher's earlier grades do not make the AI agree with them more, on the two questions tried (see above). An example is a score and a cut of its feedback, without the answer that earned it, so it shows the grader a score and not what such an answer looks like. The teacher chose on 2026-11-13 to leave the feature as it is: in Settings, off unless turned on. Still open: whether they help where the examples are scores the teacher changed by hand (whether the page's grades here were, OGRE cannot tell). The check to run then is `earlier_grades` in `rust/crates/ogre-app/tests/live.rs`.
5. Not ported: an update prompt (there is nowhere yet that a build of the Rust app is published for it to look at). The solver chat is not planned: the Electron app has the component and no screen that shows it. The Electron app's own rubric library is not imported; this teacher's had nothing in it.
6. Windows support when wanted.

## Embedded browser

The decision of 2026-11-11 was to drive the teacher's own Chrome, so the teacher worked in two windows. On 2026-11-12 the teacher asked for the page inside OGRE's window, and chose the first of three ways to try:

| Way | What it takes | Catch |
|---|---|---|
| **Built, behind a switch.** Show the Chrome tab inside OGRE: Chrome runs without a window, its picture is drawn on a Browser screen, clicks and keys are passed on | No new dependency; the Chrome driver, sign-ins and site adapters stay as they are | Measured: 24 pictures a second while a page moves, none while it is still, and 0.2 to 0.4 seconds from a click or a keystroke to the picture showing it |
| Chromium inside the window (CEF, the `cef` crate) | A real browser in a panel, and the Chrome driver could still talk to it | Adds Chromium to the program, which is 17 MB today, and a much harder build and packaging |
| The system web view (`wry`, WebKitGTK) | Small | Its child window works on X11 only, not Wayland; it is not Chrome, so sign-ins start over and the driver would be rewritten |

What the built one does: Settings, "Show the page inside OGRE (an experiment)", off by default. With it on, Start Chrome starts Chrome without a window and a Browser screen appears in the dock with back, forward, reload, an address box and Stop Chrome. The page takes the mouse (move, click, double click, drag, wheel) and the keyboard (typing, Tab, arrows, Enter, Ctrl+A, undo, redo, copy, cut, paste). A link that opens a new tab is followed. A question the page asks (`alert`, `confirm`, "Leave site?") is shown on every screen with its answers.

What it does not do: the file picker, Chrome's own pop-ups (permission prompts, the password manager), the pointer changing shape over a link, a row of tabs, text entry by an input method. A windowless Chrome says so to the sites it visits ("HeadlessChrome"), and a site may refuse it for that; OGRE does not disguise it. The way round is to sign in with the switch off, in Chrome's own window: both use the same profile, so the sign-in carries over.

Checked: against real Chrome in `rust/crates/ogre-harness/tests/view.rs` and, through the app's own worker, `rust/crates/ogre-app/tests/page_inside.rs`; MyOpenMath's public front page draws correctly. Not checked: a signed-in grading session through it, and the window itself by hand.
