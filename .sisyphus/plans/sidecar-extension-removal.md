# Remove Sidecar Mechanism & Chrome Extension References

## TL;DR

> **Quick Summary**: Replace Tauri's sidecar API with direct `tokio::process::Command` child process spawning for the grading-server, migrate `shell:open` to `tauri-plugin-opener`, and clean all stale Chrome extension references from the codebase.
> 
> **Deliverables**:
> - Grading-server spawned via `tokio::process::Command` with process-group management
> - All 4 event streams preserved (session-complete, provider-changed, server-status, server-logs)
> - `tauri-plugin-shell` fully removed, replaced by `tauri-plugin-opener` for URL opening
> - Sidecar launcher binary and compiled platform binaries deleted
> - All Chrome extension + sidecar documentation references cleaned
> - Integration tests for server spawn + event flow
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 7 → Task 9 → Task 10

---

## Context

### Original Request
Remove the Tauri sidecar mechanism since all AI processing happens in-app (Frontend → Grading Server → Ollama). Also remove stale Chrome extension references (extension code was deleted in Feb 2026).

### Interview Summary
**Key Discussions**:
- Architecture confirmed: Frontend (Svelte/Tauri) → Grading Server (HTTP :3456) → Ollama
- Desktop app still spawns and manages the grading-server lifecycle
- All 4 event streams must be preserved: session-complete, provider-changed, server-status, server-logs
- User chose "simplest, most robust, most maintainable" approach → direct child process spawning
- User wants integration tests for server spawn + event flow

**Research Findings**:
- Sidecar spans: `lib.rs` (SidecarState, spawn_sidecar L80-234, init L1513, cleanup L1559-1566), `tauri.conf.json` (externalBin L34, resources L35), `server.ts` (4 event listeners), App/Dashboard/Logs.svelte, `Cargo.toml` (tauri-plugin-shell), `binaries/` directory
- `tauri-plugin-shell` also used for `open()` in `oauth.ts` and `History.svelte` — must migrate to `tauri-plugin-opener` before removal
- Chrome extension already deleted but 23+ stale references remain across 8+ files
- `sidecar-launcher/` is a separate Rust project in `grading-server/` that wraps bun execution

### Metis Review
**Identified Gaps** (addressed):
- `tauri-plugin-shell` cannot be blindly removed — `open()` calls migrated to `tauri-plugin-opener` (Task 6)
- tokio needs `"process"` feature for `tokio::process::Command` (Task 1)
- `command-group` crate needed for process-group management to kill grandchild processes (Task 1)
- Windows needs `CREATE_NO_WINDOW` flag to prevent console flash (Task 7)
- Capabilities file needs surgical cleanup, not full removal (Task 8)
- Chrome extension cleanup is larger than initially identified (~23 refs in 8 files) (Task 4)
- Three different `session_complete` emitters with inconsistent payload shapes — pre-existing, NOT in scope

---

## Work Objectives

### Core Objective
Replace the Tauri sidecar spawning mechanism with direct `tokio::process::Command` child process spawning while preserving identical event bridge behavior, and clean all stale extension/sidecar documentation.

### Concrete Deliverables
- `ogre-desktop/src-tauri/src/lib.rs` — `spawn_server()` function using `tokio::process::Command`
- `ogre-desktop/src-tauri/Cargo.toml` — updated dependencies (add command-group, opener; remove shell)
- `ogre-desktop/package.json` — updated deps (add plugin-opener; remove plugin-shell)
- `ogre-desktop/src-tauri/tauri.conf.json` — `externalBin` removed
- `ogre-desktop/src-tauri/capabilities/default.json` — shell perms replaced with opener
- `ogre-desktop/src/lib/oauth.ts`, `src/pages/History.svelte` — migrated to plugin-opener
- Deleted: `grading-server/sidecar-launcher/`, `binaries/grading-server-*`
- Integration tests in `ogre-desktop/src-tauri/tests/`
- Clean docs: README, SETUP, DEPLOYMENT, RELEASE

### Definition of Done
- [ ] `cargo build` succeeds with zero errors
- [ ] `npm run build` succeeds in `ogre-desktop/`
- [ ] App launches, grading-server starts, Dashboard shows "Running"
- [ ] `curl http://localhost:3456/health` returns 200 while app is running
- [ ] App exit kills the server process (port 3456 freed)
- [ ] `grep -r "tauri_plugin_shell\|plugin-shell" ogre-desktop/src/` returns empty
- [ ] `grep -r "tauri_plugin_shell\|ShellExt\|CommandEvent" ogre-desktop/src-tauri/src/` returns empty
- [ ] All integration tests pass

### Must Have
- Identical event names: `server-log`, `server-status`, `session-complete`, `provider-changed`
- Identical payload shapes through the event bridge
- Exponential backoff restart logic (1s, 2s, 4s, max 3 attempts)
- `OGRE_CONFIG_DIR` env var passed to child process
- Process group management (grandchild kill on exit)
- `kill_on_drop(true)` on child process handle
- Tray menu status updates (Server: Running / Stopped)
- OAuth `open()` and History external links still work

### Must NOT Have (Guardrails)
- Do NOT change `session_complete` payload shapes in server.js (pre-existing inconsistency — separate concern)
- Do NOT change frontend `listen()` calls or `server.ts` types — event bridge contract stays identical
- Do NOT touch embedded browser webview code (lines 236-930+ of lib.rs)
- Do NOT touch OAuth, CDP, or skills scanning commands
- Do NOT change grading-server functionality (server.js, providers.js, etc.)
- Do NOT add unnecessary abstractions or wrapper layers
- Do NOT change the compiled server binary build process (`bun build --compile`)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest for frontend, cargo test for Rust)
- **Automated tests**: YES (tests-after)
- **Framework**: `cargo test` for Rust integration tests, `vitest` for frontend
- **Approach**: Implementation first, then integration tests verifying spawn + events + restart + cleanup

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Rust backend**: Use Bash — `cargo build`, `cargo clippy`, `cargo test`
- **Frontend**: Use Bash — `npm run build`, `vitest run`
- **End-to-end**: Use Bash — `npm run tauri:dev`, `curl`, `lsof`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + independent cleanup):
├── Task 1: Add new Rust/JS dependencies [quick]
├── Task 2: Delete sidecar launcher + compiled binaries [quick]
├── Task 3: Update tauri.conf.json — remove externalBin [quick]
├── Task 4: Clean Chrome extension references [unspecified-low]
└── Task 5: Clean sidecar references in documentation [unspecified-low]

Wave 2 (After Wave 1 — core migration, MAX PARALLEL):
├── Task 6: Migrate open() from plugin-shell → plugin-opener [quick]
├── Task 7: Rewrite spawn_sidecar → spawn_server (CORE TASK) [deep]
└── Task 8: Update capabilities/default.json [quick]

Wave 3 (After Wave 2 — finalization):
├── Task 9: Remove tauri-plugin-shell entirely [quick]
└── Task 10: Write integration tests for server spawn + events [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 7 → Task 9 → Task 10 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 6, 7, 8 | 1 |
| 2 | — | 9 | 1 |
| 3 | — | 7 | 1 |
| 4 | — | F4 | 1 |
| 5 | — | F4 | 1 |
| 6 | 1 | 9 | 2 |
| 7 | 1, 3 | 9, 10 | 2 |
| 8 | 1 | 9 | 2 |
| 9 | 6, 7, 8, 2 | 10 | 3 |
| 10 | 7, 9 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `unspecified-low`, T5 → `unspecified-low`
- **Wave 2**: **3** — T6 → `quick`, T7 → `deep`, T8 → `quick`
- **Wave 3**: **2** — T9 → `quick`, T10 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add New Dependencies to Cargo.toml and package.json

  **What to do**:
  - In `ogre-desktop/src-tauri/Cargo.toml`:
    - Add `tauri-plugin-opener = "2"` to `[dependencies]`
    - Add `command-group = { version = "5", features = ["with-tokio"] }` to `[dependencies]`
    - Update tokio line to: `tokio = { version = "1", features = ["time", "net", "io-util", "macros", "process"] }` (add `"process"`)
  - In `ogre-desktop/package.json`:
    - Add `"@tauri-apps/plugin-opener": "^2.0.0"` to `dependencies`
  - Run `cargo check --manifest-path ogre-desktop/src-tauri/Cargo.toml` to verify Rust deps resolve
  - Run `npm install` in `ogre-desktop/` to install JS dep

  **Must NOT do**:
  - Do NOT remove `tauri-plugin-shell` yet (still used until Task 9)
  - Do NOT remove `@tauri-apps/plugin-shell` yet
  - Do NOT modify any Rust source code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple dependency additions to two config files
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/Cargo.toml:18-29` — Current dependency list; add new deps in same style

  **API/Type References**:
  - `ogre-desktop/package.json:28-41` — Current JS dependencies section

  **External References**:
  - `tauri-plugin-opener` crate: replaces `tauri-plugin-shell`'s `open()` for launching URLs in default browser
  - `command-group` crate: provides `AsyncGroupChild` for process-group management (kill parent kills all children)
  - tokio `process` feature: enables `tokio::process::Command` for async child process spawning

  **WHY Each Reference Matters**:
  - Cargo.toml — exact location to insert new dependency lines, preserving alphabetical ordering
  - package.json — exact location for new JS dependency, preserving version range style

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rust dependencies resolve correctly
    Tool: Bash
    Preconditions: Cargo.toml has new deps added
    Steps:
      1. Run `cargo check --manifest-path ogre-desktop/src-tauri/Cargo.toml`
      2. Verify exit code is 0
      3. Grep Cargo.toml for `tauri-plugin-opener`, `command-group`, `"process"`
    Expected Result: cargo check succeeds; all three deps present in Cargo.toml
    Failure Indicators: Compilation error, missing feature flag, dep name typo
    Evidence: .sisyphus/evidence/task-1-cargo-check.txt

  Scenario: JS dependency installs correctly
    Tool: Bash
    Preconditions: package.json updated, npm install run
    Steps:
      1. Run `npm ls @tauri-apps/plugin-opener` in `ogre-desktop/`
      2. Verify the package appears in the tree
    Expected Result: Package listed without UNMET PEER DEP warnings
    Failure Indicators: npm ERR, package not found
    Evidence: .sisyphus/evidence/task-1-npm-ls.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore: add opener/command-group deps and tokio process feature`
  - Files: `ogre-desktop/src-tauri/Cargo.toml`, `ogre-desktop/package.json`, `ogre-desktop/package-lock.json`
  - Pre-commit: `cargo check --manifest-path ogre-desktop/src-tauri/Cargo.toml`

- [x] 2. Delete Sidecar Launcher and Compiled Binaries

  **What to do**:
  - Delete the sidecar launcher Rust project: `rm -rf grading-server/sidecar-launcher/`
  - Delete compiled sidecar binaries:
    - `rm ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`
    - `rm ogre-desktop/src-tauri/binaries/grading-server-x86_64-unknown-linux-gnu`
  - Verify `ogre-desktop/src-tauri/binaries/server-bundle/` is NOT deleted (still needed as Tauri resource)
  - `git rm` the files so they're tracked as deletions

  **Must NOT do**:
  - Do NOT delete `server-bundle/` directory (the grading-server source bundle is still needed)
  - Do NOT delete anything in `grading-server/` except `sidecar-launcher/`
  - Do NOT modify tauri.conf.json (that's Task 3)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion only, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/binaries/` — Contains the two compiled binaries and server-bundle/
  - `grading-server/sidecar-launcher/` — Contains Cargo.toml, Cargo.lock, src/, target/ for the Rust launcher

  **WHY Each Reference Matters**:
  - binaries/ — The compiled sidecar binaries are no longer spawned via externalBin; server-bundle stays
  - sidecar-launcher/ — This Rust project wraps bun execution; no longer needed since Rust spawns the server directly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sidecar binaries deleted
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls ogre-desktop/src-tauri/binaries/grading-server-*` — should fail
      2. Run `ls grading-server/sidecar-launcher/` — should fail
      3. Run `ls ogre-desktop/src-tauri/binaries/server-bundle/server.js` — should succeed
    Expected Result: Compiled binaries and launcher gone; server-bundle preserved
    Failure Indicators: grading-server-* files still exist, or server-bundle accidentally deleted
    Evidence: .sisyphus/evidence/task-2-deletion-verify.txt

  Scenario: Git tracks deletions
    Tool: Bash
    Preconditions: Files deleted with git rm
    Steps:
      1. Run `git status --short` and grep for deleted files
      2. Verify grading-server-x86_64-* and sidecar-launcher appear as deleted
    Expected Result: Git shows deleted status for all removed files
    Failure Indicators: Files still tracked or untracked
    Evidence: .sisyphus/evidence/task-2-git-status.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore: remove sidecar launcher and compiled binaries`
  - Files: deleted files
  - Pre-commit: `ls ogre-desktop/src-tauri/binaries/server-bundle/server.js`

- [x] 3. Update tauri.conf.json — Remove externalBin

  **What to do**:
  - In `ogre-desktop/src-tauri/tauri.conf.json`, remove line 34: `"externalBin": ["binaries/grading-server"],`
  - Keep line 35: `"resources": ["binaries/server-bundle"]` — still needed for bundling server source
  - Verify the resulting JSON is valid

  **Must NOT do**:
  - Do NOT remove the `resources` entry
  - Do NOT change any other config (plugins, windows, security, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line removal from a JSON file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/tauri.conf.json:24-36` — Bundle section with externalBin and resources

  **WHY Each Reference Matters**:
  - `externalBin` tells Tauri to bundle and manage the sidecar binary — removing it decouples the server from the sidecar mechanism

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: externalBin removed, resources preserved
    Tool: Bash
    Preconditions: tauri.conf.json edited
    Steps:
      1. Run `grep "externalBin" ogre-desktop/src-tauri/tauri.conf.json`
      2. Run `grep "resources" ogre-desktop/src-tauri/tauri.conf.json`
      3. Run `python3 -c "import json; json.load(open('ogre-desktop/src-tauri/tauri.conf.json'))"` to validate JSON
    Expected Result: No externalBin match; resources still present; valid JSON
    Failure Indicators: externalBin still present, resources accidentally removed, JSON parse error
    Evidence: .sisyphus/evidence/task-3-config-verify.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore: remove externalBin sidecar config from tauri.conf.json`
  - Files: `ogre-desktop/src-tauri/tauri.conf.json`

- [x] 4. Clean Chrome Extension References Across Codebase

  **What to do**:
  - Search for and clean all stale Chrome extension references in source code and config:
    - `grading-server/server.js` (~8 refs): Remove/update CORS `chrome-extension://` origin handling, update comments referencing "extension", update banner text
    - `ogre-desktop/src/lib/batch-grader.ts` (~1 ref): Update comment referencing "extension write-back"
    - `ogre-desktop/src/lib/discover.ts` (~1 ref): Update comment
    - `ogre-desktop/src/lib/provider-sync.ts` (~1 ref): Update comment
    - `ogre-desktop/src/lib/server.ts` (L24, L31, L47, L57): Update JSDoc comments — change "sidecar" and "extension" references to "child process" / "desktop app"
    - `ogre-desktop/src/pages/Rubrics.svelte` (L295): Remove UI text saying "save one from the Chrome extension"
    - `grading-server/schemas.md` (~1 ref): Update reference
    - `grading-server/providers.js` (L331): Change error message from "Re-authenticate in the extension" to "Re-authenticate in the desktop app"
  - After editing, run `grep -ri "chrome.extension\|Chrome extension\|chrome-extension" --include="*.{ts,js,svelte}" ogre-desktop/src/ grading-server/` to verify no refs remain in source

  **Must NOT do**:
  - Do NOT change any functional logic in server.js (only comments, CORS origins, and text)
  - Do NOT modify `session_complete` payload shapes
  - Do NOT touch files in `ogre-desktop/src-tauri/binaries/server-bundle/` (those are copies that will be updated when the bundle is rebuilt)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Text/comment cleanup across multiple files, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `grading-server/server.js` — CORS middleware near top of file, banner text, deprecated endpoint comments
  - `ogre-desktop/src/lib/server.ts:24,31,47,57` — JSDoc comments referencing "sidecar" and "extension write-back"
  - `ogre-desktop/src/pages/Rubrics.svelte:295` — UI text referencing Chrome extension

  **WHY Each Reference Matters**:
  - server.js CORS — `chrome-extension://` origins are no longer valid clients; remove to avoid confusion
  - server.ts JSDoc — comments reference "sidecar handler" and "extension write-back" which are now stale
  - Rubrics.svelte — user-facing text mentioning Chrome extension confuses users

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No Chrome extension references in source code
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. Run `grep -ri "chrome.extension\|Chrome extension\|chrome-extension" --include="*.ts" --include="*.js" --include="*.svelte" ogre-desktop/src/ grading-server/`
      2. Verify output is empty (or only in test fixtures / server-bundle copies)
    Expected Result: Zero matches in source files (server-bundle copies excluded)
    Failure Indicators: Any remaining reference in source code
    Evidence: .sisyphus/evidence/task-4-extension-refs.txt

  Scenario: server.js still starts correctly after comment changes
    Tool: Bash
    Preconditions: server.js comments/CORS updated
    Steps:
      1. Run `node --check grading-server/server.js` to verify syntax
    Expected Result: No syntax errors
    Failure Indicators: SyntaxError output
    Evidence: .sisyphus/evidence/task-4-syntax-check.txt
  ```

  **Commit**: YES (groups with Commit 4 — docs cleanup)
  - Message: `docs: remove stale Chrome extension references from source code`
  - Files: server.js, server.ts, batch-grader.ts, discover.ts, provider-sync.ts, Rubrics.svelte, providers.js, schemas.md

- [x] 5. Clean Sidecar References in Documentation

  **What to do**:
  - `README.md`:
    - Line 33: Remove "All the power of the Chrome extension in a standalone app"
    - Lines 68-71: Update Playwriter references — these reference the Chrome extension; update to describe Playwriter MCP without extension dependency
  - `SETUP.md`:
    - Lines 27-28: Remove "Install the Playwriter extension from the Chrome Web Store"
    - Line 87: Remove "Click the Playwriter extension icon in your toolbar"
    - Line 155: Remove "Enable the Playwriter extension on your grading tab"
    - Line 213: Remove "Check that Playwriter extension is enabled (green icon)"
  - `ogre-desktop/README.md`:
    - Remove sidecar build instructions (`bun build --compile` section in Setup)
    - Update "Project Structure" to remove `binaries/` description of "External binaries (grading-server)"
    - Update troubleshooting "Missing sidecar binary" section
  - `ogre-desktop/DEPLOYMENT.md` (~3 sidecar refs): Update architecture descriptions
  - `ogre-desktop/RELEASE.md` (~1 sidecar ref): Update build instructions

  **Must NOT do**:
  - Do NOT change any source code files (this task is docs only)
  - Do NOT delete the doc files themselves

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Documentation text updates across multiple markdown files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `README.md:33,68-71` — Chrome extension and Playwriter extension mentions
  - `SETUP.md:27-28,87,155,213` — Playwriter extension setup steps
  - `ogre-desktop/README.md` — Sidecar build instructions, project structure, troubleshooting
  - `ogre-desktop/DEPLOYMENT.md` — Architecture descriptions with sidecar references
  - `ogre-desktop/RELEASE.md` — Build process referencing sidecar

  **WHY Each Reference Matters**:
  - These docs describe setup/architecture that no longer exists — misleads users and developers

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No sidecar/extension references in key docs
    Tool: Bash
    Preconditions: All doc edits applied
    Steps:
      1. Run `grep -i "sidecar\|externalBin" README.md SETUP.md ogre-desktop/README.md ogre-desktop/DEPLOYMENT.md ogre-desktop/RELEASE.md`
      2. Run `grep -i "chrome extension\|playwriter extension" README.md SETUP.md`
      3. Verify both return empty
    Expected Result: Zero matches for sidecar/extension terminology in key docs
    Failure Indicators: Any remaining stale reference
    Evidence: .sisyphus/evidence/task-5-docs-cleanup.txt
  ```

  **Commit**: YES (groups with Commit 4 — docs cleanup)
  - Message: `docs: update README, SETUP, DEPLOYMENT, RELEASE for new architecture`
  - Files: README.md, SETUP.md, ogre-desktop/README.md, ogre-desktop/DEPLOYMENT.md, ogre-desktop/RELEASE.md

- [x] 6. Migrate open() from plugin-shell to plugin-opener

  **What to do**:
  - In `ogre-desktop/src/lib/oauth.ts` line 1:
    - Change `import { open } from "@tauri-apps/plugin-shell"` → `import { openUrl } from "@tauri-apps/plugin-opener"`
    - Update all `open(url)` calls to `openUrl(url)` (the API is the same — takes a URL string, opens in default browser)
  - In `ogre-desktop/src/pages/History.svelte` line 5:
    - Change `import { open } from "@tauri-apps/plugin-shell"` → `import { openUrl } from "@tauri-apps/plugin-opener"`
    - Update all `open(url)` calls to `openUrl(url)`
  - In `ogre-desktop/src/lib/oauth.test.ts` lines 7-9:
    - Update mock: `vi.mock("@tauri-apps/plugin-shell", ...)` → `vi.mock("@tauri-apps/plugin-opener", ...)`
    - Update mock shape: `{ open: mockOpen }` → `{ openUrl: mockOpen }`
  - In `ogre-desktop/src-tauri/src/lib.rs`, add `.plugin(tauri_plugin_opener::init())` to the builder chain (near line 1404 where other plugins are registered)
  - Verify `npm run test` passes (oauth test should still work with updated mock)

  **Must NOT do**:
  - Do NOT remove `tauri-plugin-shell` yet (still used by sidecar code until Task 9)
  - Do NOT change any other imports or functionality
  - Do NOT change the behavior of open/openUrl — it's a 1:1 API replacement

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple import swap across 3 files + one plugin registration line
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1 (deps must be installed first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts:1` — Current import: `import { open } from "@tauri-apps/plugin-shell"`
  - `ogre-desktop/src/pages/History.svelte:5` — Current import: `import { open } from "@tauri-apps/plugin-shell"`
  - `ogre-desktop/src/lib/oauth.test.ts:7-9` — Mock setup for plugin-shell
  - `ogre-desktop/src-tauri/src/lib.rs:1400-1404` — Plugin registration chain

  **External References**:
  - `tauri-plugin-opener` API: `openUrl(url: string)` replaces `open(url: string)` — identical behavior

  **WHY Each Reference Matters**:
  - These are the ONLY three frontend files importing from plugin-shell; updating them enables safe removal of the shell plugin

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No plugin-shell imports remain in frontend
    Tool: Bash
    Preconditions: All imports updated
    Steps:
      1. Run `grep -r "plugin-shell" ogre-desktop/src/`
      2. Verify output is empty
    Expected Result: Zero references to plugin-shell in frontend source
    Failure Indicators: Any remaining import
    Evidence: .sisyphus/evidence/task-6-import-check.txt

  Scenario: OAuth test still passes with new mock
    Tool: Bash
    Preconditions: oauth.test.ts mock updated
    Steps:
      1. Run `npx vitest run oauth` in `ogre-desktop/`
      2. Verify all tests pass
    Expected Result: All oauth tests pass
    Failure Indicators: Test failure mentioning mock or import
    Evidence: .sisyphus/evidence/task-6-test-pass.txt
  ```

  **Commit**: YES (groups with Commit 2 — core refactor)
  - Message: `refactor: migrate open() from plugin-shell to plugin-opener`
  - Files: oauth.ts, History.svelte, oauth.test.ts, lib.rs
  - Pre-commit: `cd ogre-desktop && npx vitest run oauth`

- [x] 7. Rewrite spawn_sidecar → spawn_server Using tokio::process::Command (CORE TASK)

  **What to do**:
  This is the main refactoring task. Replace the Tauri sidecar spawning mechanism with direct `tokio::process::Command` child process spawning. The event bridge behavior must remain IDENTICAL.

  **Step 1 — Update imports** in `lib.rs`:
  - Remove: `use tauri_plugin_shell::ShellExt;` (line 10)
  - Remove: `use tauri_plugin_shell::process::CommandEvent;` (line 11)
  - Add: `use tokio::process::Command as TokioCommand;`
  - Add: `use tokio::io::{AsyncBufReadExt, BufReader};`
  - Add: `use command_group::AsyncCommandGroup;`

  **Step 2 — Rename SidecarState → ServerState** (lines 35-39):
  - Rename the struct from `SidecarState` to `ServerState`
  - Change the `child` field type from `Option<tauri_plugin_shell::process::CommandChild>` to `Option<command_group::AsyncGroupChild>`
  - Keep the `status_item` field as-is
  - Update ALL references: `.state::<Mutex<SidecarState>>()` → `.state::<Mutex<ServerState>>()`
  - Update `.manage(Mutex::new(SidecarState { ... }))` → `.manage(Mutex::new(ServerState { ... }))`
  - Update the doc comment: "Holds the sidecar child process" → "Holds the grading-server child process"

  **Step 3 — Rewrite spawn_sidecar → spawn_server** (lines 80-234):
  - Rename function: `spawn_sidecar` → `spawn_server`
  - Replace the sidecar command creation (lines 88-96) with:
    ```rust
    // Resolve path to the compiled grading-server binary in Tauri resources
    let resource_path = handle.path().resource_dir()
        .expect("failed to resolve resource dir")
        .join("server-bundle")
        .join(if cfg!(windows) { "grading-server.exe" } else { "grading-server" });
    
    let mut cmd = TokioCommand::new(&resource_path);
    cmd.env("OGRE_CONFIG_DIR", config_dir.to_string_lossy().to_string())
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped())
       .kill_on_drop(true);
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    let mut child = cmd.group_spawn()
        .expect("failed to spawn grading-server");
    ```
  - Extract stdout and stderr from the child:
    ```rust
    let stdout = child.inner().stdout.take()
        .expect("failed to capture stdout");
    let stderr = child.inner().stderr.take()
        .expect("failed to capture stderr");
    ```
  - Store the `AsyncGroupChild` in managed state (replacing the old `CommandChild`)
  - Keep the event emitting logic: `emit("server-status", "running")` and tray status update

  **Step 4 — Rewrite the async event reader** (lines 124-233):
  - Replace the `rx.recv()` / `CommandEvent` loop with two async tasks:
    - **stdout reader**: `BufReader::new(stdout).lines()` → parse each line for JSON events exactly as before
    - **stderr reader**: `BufReader::new(stderr).lines()` → emit as `server-log` with `[stderr]` prefix
  - The stdout JSON parsing logic (lines 132-147) stays IDENTICAL — check for `"type": "session_complete"` and `"type": "provider_changed"`, emit same Tauri events
  - Replace `CommandEvent::Terminated` handling with: detect when stdout stream ends (returns `None`), then check child exit status via `child.wait()`
  - Preserve the restart logic: exit code 0 = intentional (don't restart), non-zero = crash (restart with backoff)
  - Preserve exponential backoff: `1u64 << (count - 1)` giving 1s, 2s, 4s delays, max `MAX_RESTART_ATTEMPTS` (3)
  - Preserve tray status updates on crash/restart/failure

  **Step 5 — Update setup and cleanup**:
  - Line 1513: Change `spawn_sidecar(&handle, restart_count)` → `spawn_server(&handle, restart_count)`
  - Lines 1559-1566: Update the `RunEvent::Exit` handler — instead of `child.kill()`, use the `AsyncGroupChild` to kill the process group. Since `kill_on_drop(true)` is set, dropping the child handle will also kill the process.

  **Must NOT do**:
  - Do NOT change event names: `server-log`, `server-status`, `session-complete`, `provider-changed`
  - Do NOT change JSON payload parsing logic or field names
  - Do NOT change the restart count, backoff timing, or MAX_RESTART_ATTEMPTS
  - Do NOT touch any code outside the sidecar-related sections (webview code L236-930+, OAuth, CDP, etc.)
  - Do NOT change `OGRE_CONFIG_DIR` env var name
  - Do NOT remove `tauri_plugin_shell` import or `.plugin()` call yet (Task 9)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core refactoring of process management code with async I/O, cross-platform concerns, and strict behavioral preservation requirements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:10-11` — Current sidecar imports to replace
  - `ogre-desktop/src-tauri/src/lib.rs:35-39` — SidecarState struct to rename
  - `ogre-desktop/src-tauri/src/lib.rs:80-234` — Full spawn_sidecar function (THE CODE TO REWRITE)
  - `ogre-desktop/src-tauri/src/lib.rs:1413` — Managed state registration
  - `ogre-desktop/src-tauri/src/lib.rs:1494-1498` — Status item stored in state
  - `ogre-desktop/src-tauri/src/lib.rs:1512-1513` — spawn_sidecar call in setup
  - `ogre-desktop/src-tauri/src/lib.rs:1558-1567` — Exit cleanup handler

  **API/Type References**:
  - `command_group::AsyncCommandGroup` trait — provides `.group_spawn()` method on `tokio::process::Command`
  - `command_group::AsyncGroupChild` — the child handle type; `.inner()` gives access to `tokio::process::Child`
  - `tokio::io::BufReader` + `AsyncBufReadExt::lines()` — async line-by-line reading from stdout/stderr
  - `tokio::process::Command` — async child process builder; `.kill_on_drop(true)` ensures cleanup

  **External References**:
  - `command-group` crate docs: Process group management for killing child trees
  - Windows `CREATE_NO_WINDOW` flag: `0x08000000` prevents console window flash

  **WHY Each Reference Matters**:
  - Lines 80-234 are the ENTIRE function being rewritten — the agent must understand every line
  - Lines 1413, 1494-1498, 1512-1513, 1558-1567 are the OTHER places that reference SidecarState/spawn_sidecar — all must be updated
  - The JSON parsing at lines 132-147 must be preserved EXACTLY (same field names, same event names)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rust compiles after spawn_server rewrite
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run `cargo build --manifest-path ogre-desktop/src-tauri/Cargo.toml`
      2. Run `cargo clippy --manifest-path ogre-desktop/src-tauri/Cargo.toml -- -D warnings`
      3. Verify both exit with code 0
    Expected Result: Clean compile and clippy pass with zero warnings
    Failure Indicators: Compilation error, type mismatch, unused import warning
    Evidence: .sisyphus/evidence/task-7-cargo-build.txt

  Scenario: No SidecarState or spawn_sidecar references remain
    Tool: Bash
    Preconditions: Rename complete
    Steps:
      1. Run `grep -n "SidecarState\|spawn_sidecar\|ShellExt\|CommandEvent" ogre-desktop/src-tauri/src/lib.rs`
      2. Verify output is empty
    Expected Result: Zero matches — all renamed/replaced
    Failure Indicators: Any old name still present
    Evidence: .sisyphus/evidence/task-7-rename-check.txt

  Scenario: Event names preserved in code
    Tool: Bash
    Preconditions: Rewrite complete
    Steps:
      1. Run `grep -c '"server-log"\|"server-status"\|"session-complete"\|"provider-changed"' ogre-desktop/src-tauri/src/lib.rs`
      2. Verify count >= 4 (at least one of each event name)
    Expected Result: All four event names present in the rewritten code
    Failure Indicators: Missing event name, typo in event string
    Evidence: .sisyphus/evidence/task-7-event-names.txt
  ```

  **Commit**: YES (groups with Commit 2 — core refactor)
  - Message: `refactor: replace sidecar with direct tokio::process::Command child spawn`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo build --manifest-path ogre-desktop/src-tauri/Cargo.toml`

- [x] 8. Update capabilities/default.json — Remove Shell Sidecar Permissions

  **What to do**:
  - In `ogre-desktop/src-tauri/capabilities/default.json`:
    - Remove `"shell:allow-execute"` (line 15)
    - Remove the `shell:allow-spawn` object block (lines 16-24) with the sidecar config
    - Remove `"shell:allow-stdin-write"` (line 25)
    - Remove `"shell:allow-kill"` (line 26)
    - Replace `"shell:allow-open"` (line 14) with `"opener:allow-open-url"`
  - Verify the resulting JSON is valid and well-formatted

  **Must NOT do**:
  - Do NOT remove any non-shell permissions (sql, updater, http, core, etc.)
  - Do NOT change the http URL allowlist
  - Do NOT add permissions that aren't needed

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON editing — removing specific entries from a permissions array
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/capabilities/default.json:6-79` — Full permissions array
  - Lines 14-26: The 5 shell permissions to modify/remove

  **External References**:
  - `tauri-plugin-opener` capabilities: uses `"opener:allow-open-url"` permission identifier

  **WHY Each Reference Matters**:
  - The capabilities file controls what the frontend can invoke via Tauri IPC — sidecar permissions must go, opener permission must be added

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No shell permissions remain, opener added
    Tool: Bash
    Preconditions: capabilities/default.json edited
    Steps:
      1. Run `grep "shell:" ogre-desktop/src-tauri/capabilities/default.json`
      2. Run `grep "opener:" ogre-desktop/src-tauri/capabilities/default.json`
      3. Run `python3 -c "import json; json.load(open('ogre-desktop/src-tauri/capabilities/default.json'))"` to validate JSON
    Expected Result: Zero shell matches; opener:allow-open-url present; valid JSON
    Failure Indicators: Any shell permission remaining, opener missing, JSON parse error
    Evidence: .sisyphus/evidence/task-8-capabilities.txt
  ```

  **Commit**: YES (groups with Commit 2 — core refactor)
  - Message: `refactor: update capabilities — remove shell perms, add opener`
  - Files: `ogre-desktop/src-tauri/capabilities/default.json`

- [x] 9. Remove tauri-plugin-shell Entirely

  **What to do**:
  - In `ogre-desktop/src-tauri/Cargo.toml`:
    - Remove `tauri-plugin-shell = "2"` (line 22)
  - In `ogre-desktop/package.json`:
    - Remove `"@tauri-apps/plugin-shell": "^2.3.5"` from dependencies (line 32)
  - In `ogre-desktop/src-tauri/src/lib.rs`:
    - Remove `.plugin(tauri_plugin_shell::init())` from the builder chain (find it in the plugin chain near line 1390-1410)
    - Verify NO remaining `use tauri_plugin_shell` imports exist (should have been removed in Task 7)
  - Run `npm install` to update lockfile
  - Run `cargo build` to verify everything compiles without the shell plugin

  **Must NOT do**:
  - Do NOT remove any other plugins from the builder chain
  - Do NOT modify any source code beyond removing the plugin registration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Dependency removal from 3 files — straightforward cleanup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Task 10)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 6, 7, 8, 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/Cargo.toml:22` — `tauri-plugin-shell = "2"` to remove
  - `ogre-desktop/package.json:32` — `"@tauri-apps/plugin-shell": "^2.3.5"` to remove
  - `ogre-desktop/src-tauri/src/lib.rs` — `.plugin(tauri_plugin_shell::init())` in builder chain

  **WHY Each Reference Matters**:
  - All three locations must be cleaned simultaneously — leaving any one causes build errors

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No tauri-plugin-shell references anywhere
    Tool: Bash
    Preconditions: All removals applied
    Steps:
      1. Run `grep -r "tauri.plugin.shell\|tauri_plugin_shell\|plugin-shell" ogre-desktop/src-tauri/Cargo.toml ogre-desktop/package.json ogre-desktop/src-tauri/src/lib.rs`
      2. Run `grep -r "plugin-shell" ogre-desktop/src/`
      3. Verify both return empty
    Expected Result: Zero matches for plugin-shell in any project file
    Failure Indicators: Any remaining reference
    Evidence: .sisyphus/evidence/task-9-shell-removed.txt

  Scenario: Project builds clean without shell plugin
    Tool: Bash
    Preconditions: Plugin removed from all locations
    Steps:
      1. Run `cargo build --manifest-path ogre-desktop/src-tauri/Cargo.toml`
      2. Run `npm run build` in `ogre-desktop/`
      3. Verify both exit with code 0
    Expected Result: Clean build with zero errors
    Failure Indicators: Unresolved import, missing plugin registration, linker error
    Evidence: .sisyphus/evidence/task-9-build-clean.txt
  ```

  **Commit**: YES (groups with Commit 3)
  - Message: `chore: remove tauri-plugin-shell dependency`
  - Files: Cargo.toml, package.json, package-lock.json, lib.rs
  - Pre-commit: `cargo build --manifest-path ogre-desktop/src-tauri/Cargo.toml`

- [x] 10. Write Integration Tests for Server Spawn and Event Flow

  **What to do**:
  - Create integration test file: `ogre-desktop/src-tauri/tests/server_spawn.rs`
  - Test the core spawn_server logic in isolation (without full Tauri app):
    1. **Test: Server binary resolves and spawns** — verify `tokio::process::Command` can spawn the compiled server binary and it starts listening on port 3456
    2. **Test: stdout JSON parsing** — feed known JSON lines (`{"type":"session_complete",...}`, `{"type":"provider_changed",...}`) through a mock stdout and verify the parsing logic extracts correct fields
    3. **Test: stderr forwarding** — verify stderr lines are captured and prefixed with `[stderr]`
    4. **Test: exit code handling** — verify exit code 0 = intentional (no restart), non-zero = crash
    5. **Test: restart backoff timing** — verify attempts use delays of 1s, 2s, 4s and max out at 3 attempts
    6. **Test: process cleanup on drop** — verify `kill_on_drop(true)` kills the child process
  - Extract the JSON parsing logic from `spawn_server` into a testable helper function if needed (e.g., `fn parse_server_event(line: &str) -> Option<ServerEvent>`)
  - Run `cargo test --manifest-path ogre-desktop/src-tauri/Cargo.toml` to verify all pass

  **Must NOT do**:
  - Do NOT require the full Tauri app to be running for tests
  - Do NOT change the spawn_server implementation to accommodate tests (extract helpers instead)
  - Do NOT add test-only dependencies that change production behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Writing Rust integration tests with async process management, mock I/O, and timing verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 7, 9

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:80-234` — The spawn_server function being tested
  - `ogre-desktop/src-tauri/src/lib.rs:132-147` — JSON parsing logic to extract into testable helper

  **API/Type References**:
  - `tokio::process::Command` — async child process API
  - `tokio::io::BufReader` + `AsyncBufReadExt` — line-by-line reading
  - `command_group::AsyncGroupChild` — process group child type

  **Test References**:
  - `ogre-desktop/src/lib/oauth.test.ts` — Example of test structure in this project (vitest)
  - `grading-server/test/providers.test.js` — Example of test structure for server code

  **WHY Each Reference Matters**:
  - The spawn_server function (L80-234) defines WHAT to test — event parsing, restart logic, cleanup
  - The JSON parsing (L132-147) is the most critical logic to unit test — incorrect parsing breaks all events

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All integration tests pass
    Tool: Bash
    Preconditions: Test file created, spawn_server helper extracted
    Steps:
      1. Run `cargo test --manifest-path ogre-desktop/src-tauri/Cargo.toml -- --nocapture`
      2. Verify exit code 0
      3. Count test results (should be >= 4 tests)
    Expected Result: All tests pass, >= 4 test cases
    Failure Indicators: Test failure, compilation error in test file
    Evidence: .sisyphus/evidence/task-10-test-results.txt

  Scenario: JSON parsing test covers both event types
    Tool: Bash
    Preconditions: Parse helper function extracted
    Steps:
      1. Run `cargo test --manifest-path ogre-desktop/src-tauri/Cargo.toml parse_server_event -- --nocapture`
      2. Verify tests for session_complete AND provider_changed pass
    Expected Result: Both event type parsing tests pass
    Failure Indicators: Parsing returns None for valid JSON, wrong field extraction
    Evidence: .sisyphus/evidence/task-10-parse-tests.txt
  ```

  **Commit**: YES (groups with Commit 3)
  - Message: `test: add integration tests for server spawn and event flow`
  - Files: `ogre-desktop/src-tauri/tests/server_spawn.rs`, possibly `ogre-desktop/src-tauri/src/lib.rs` (if helper extracted)
  - Pre-commit: `cargo test --manifest-path ogre-desktop/src-tauri/Cargo.toml`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo build && cargo clippy` in `ogre-desktop/src-tauri/`. Run `npm run build && npm run test` in `ogre-desktop/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Run `npm run tauri:dev` in `ogre-desktop/`. Verify: (1) Dashboard shows "Server: Running", (2) `curl http://localhost:3456/health` returns 200, (3) Logs page shows server startup output, (4) Close app → `lsof -i :3456` returns empty, (5) Settings → OAuth link opens browser, (6) History → external link opens browser. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no changes to server.js payloads, no changes to webview code, no changes to OAuth/CDP commands. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Wave 1): `chore: add opener/command-group deps and remove sidecar artifacts` — Cargo.toml, package.json, tauri.conf.json, deleted files
- **Commit 2** (after Wave 2): `refactor: replace sidecar with direct tokio::process child spawn` — lib.rs, oauth.ts, History.svelte, capabilities
- **Commit 3** (after Wave 3): `chore: remove tauri-plugin-shell and add server spawn tests` — final removal + tests
- **Commit 4** (after docs cleanup): `docs: remove stale Chrome extension and sidecar references` — all .md and comment cleanup

---

## Success Criteria

### Verification Commands
```bash
# Build checks
cd ogre-desktop && cargo build --manifest-path src-tauri/Cargo.toml  # Expected: Compiling ... Finished
cd ogre-desktop && npm run build  # Expected: Build success
cd ogre-desktop && cargo test --manifest-path src-tauri/Cargo.toml  # Expected: test result: ok
cd ogre-desktop && npm run test  # Expected: Tests passed

# No stale references
grep -r "tauri_plugin_shell\|ShellExt\|CommandEvent" ogre-desktop/src-tauri/src/  # Expected: (empty)
grep -r "plugin-shell" ogre-desktop/src/ ogre-desktop/package.json  # Expected: (empty)
grep -r "externalBin" ogre-desktop/src-tauri/tauri.conf.json  # Expected: (empty)
grep "shell:" ogre-desktop/src-tauri/capabilities/default.json  # Expected: (empty)
ls ogre-desktop/src-tauri/binaries/grading-server-*  # Expected: No such file
ls grading-server/sidecar-launcher/  # Expected: No such file or directory
```

### Final Checklist
- [ ] All "Must Have" present (event names, payloads, restart logic, env vars, process groups)
- [ ] All "Must NOT Have" absent (no server.js changes, no webview changes, no shell imports)
- [ ] `cargo build` + `cargo clippy` clean
- [ ] `npm run build` + `npm run test` pass
- [ ] All integration tests pass
- [ ] App launches, server runs, events flow, exit kills server
