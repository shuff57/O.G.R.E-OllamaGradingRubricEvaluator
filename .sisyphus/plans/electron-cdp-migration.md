# Electron Migration + chrome-cdp-skill Fork

## TL;DR

> **Quick Summary**: Migrate O.G.R.E. Desktop from Tauri to Electron to get consistent Chromium-based CDP browser control on all platforms. Fork `pasky/chrome-cdp-skill`, merge OGRE's CDP capabilities into it, use it as the single CDP foundation for both internal and external agent access, then PR upstream.
> 
> **Deliverables**:
> - Electron-based O.G.R.E. Desktop app (Linux + Windows)
> - Forked chrome-cdp-skill with OGRE enhancements (safety checks, CodeMirror, popup capture, fuzzy matching)
> - Accessibility tree snapshots integrated into internal agent loop
> - External agent access via chrome-cdp-skill CLI
> - All existing features ported and working
> - PR submitted to upstream chrome-cdp-skill
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 6 waves + final verification
> **Critical Path**: Spike → Scaffold → BrowserView port → CDP integration → Agent improvements → Build/test

---

## Context

### Original Request
User wants Playwriter-quality browser control in the embedded browser. The internal agent has inconsistent, unreliable control because Tauri uses WebKitGTK (Linux) which has no CDP support, while WebView2 (Windows) does. The user suggested switching to Electron and forking chrome-cdp-skill to create a unified CDP solution.

### Interview Summary
**Key Discussions**:
- Playwriter works great for external `/grade` skill because it uses CDP + accessibility tree snapshots. The internal agent lacks both.
- On Linux: no CDP, evalScript returns null, GDK event injection is a workaround with poor reliability.
- The existing `cdp-client.ts` is a zero-dep WebSocket CDP client — highly portable.
- User wants to fork chrome-cdp-skill, merge their CDP code, and PR upstream.
- Full port from Rust to Node/TS — no Rust kept.
- Tests-after approach. Linux is current platform; Windows planned.

**Research Findings**:
- Previous session (`linux-cdp-fix.md`) confirmed WebKitGTK does NOT implement CDP protocol.
- chrome-cdp-skill (MIT, v1.0.2) uses persistent daemon per tab, auto-detects Chrome/Chromium/Edge/Brave/Vivaldi.
- The Tauri Rust backend (lib.rs, 2086 lines) handles: webview creation, CDP port, server sidecar, window mgmt, autofill, GDK events, SQLite, updater.
- 189 call sites depend on `evalScript()` — all broken on Linux.
- Three separate browser control backends exist: CDP (Windows), GDK (Linux), evalScript (fallback).

### Metis Review
**Identified Gaps** (addressed):
- **Spike validation needed**: Must validate `webContents.debugger` + `Accessibility.getFullAXTree` works before committing to migration. Added as Wave 0.
- **Electron version matters**: `BrowserView` is deprecated in favor of `WebContentsView` in newer Electron. Plan targets latest stable Electron with `WebContentsView`.
- **better-sqlite3 + Electron ABI**: native modules need rebuilding for Electron's Node.js. Spike validates this.
- **CORS for localhost:3456**: Electron renderer may block fetch to grading server. Addressed in scaffold task.
- **onnxruntime-node ABI**: Local embedder uses onnxruntime — needs Electron ABI validation. Added to spike.
- **Grading server packaging**: Use `child_process.fork()` in Electron main process, not compiled binary sidecar. Simpler, leverages Node.js directly.
- **contextIsolation**: Must be `true` with typed preload bridge. Guardrail set.
- **Scope creep risks**: Don't improve agent during port, don't refactor grading server, don't rewrite UI. Port first, enhance second.
- **chrome-cdp-skill fork guardrails**: API-compatible with upstream, additive not replacing, no Electron hard dependency in the fork.

---

## Work Objectives

### Core Objective
Migrate O.G.R.E. Desktop from Tauri (WebKitGTK/WebView2) to Electron (Chromium everywhere) so the embedded browser agent gets consistent CDP-based control with accessibility tree snapshots on all platforms, matching Playwriter's reasoning quality.

### Concrete Deliverables
- `ogre-desktop/` restructured as Electron app (main process, preload, renderer)
- `shuff57/chrome-cdp-skill` GitHub fork with OGRE enhancements
- Accessibility tree integration in agent loop (`agent-dom.ts` replacement/enhancement)
- External agent CLI access via chrome-cdp-skill
- Linux + Windows builds via electron-builder
- Auto-updater via electron-updater
- All existing features working: embedded browser, grading panel, site profiles, settings, skills, etc.

### Definition of Done
- [ ] `npm run dev` launches Electron app on Linux with working embedded browser
- [ ] Agent loop produces accessibility tree snapshots from embedded browser
- [ ] `cdp.mjs snap <target>` from CLI returns accessibility tree of embedded browser
- [ ] All 9 agent actions (click, type, scroll, readText, screenshot, waitFor, navigate, runJS, done) work via CDP
- [ ] Grading pipeline (extract → grade → fill) works end-to-end in embedded browser
- [ ] `npm run build` produces Linux .AppImage and Windows .exe/.msi

### Must Have
- Chromium-based embedded browser with CDP on Linux AND Windows
- Accessibility tree snapshots via CDP (`Accessibility.getFullAXTree` or equivalent)
- All existing Svelte pages/components working (Browser, Dashboard, GradingPanel, Settings, etc.)
- Grading server running as child process
- SQLite database for settings, sessions, provider configs
- Auto-updater
- chrome-cdp-skill fork with merged OGRE capabilities

### Must NOT Have (Guardrails)
- No `contextIsolation: false` or `nodeIntegration: true` in renderer
- No agent logic improvements during migration — port behavior exactly, enhance AFTER
- No grading server refactoring — keep it unchanged, just change how it's spawned
- No Svelte component rewrites — only change IPC calls (invoke → ipcRenderer)
- No Electron hard-dependency in chrome-cdp-skill fork (must remain usable with any Chromium)
- No GDK actions in final codebase — eliminate entirely
- No html2canvas fallback — CDP `Page.captureScreenshot` is the only screenshot path
- No `--remote-debugging-port` for internal agent — use `webContents.debugger` API instead
- No scope creep into multi-platform CI or test rewrites during port phase

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, extensive .test.ts files)
- **Automated tests**: Tests-after — port/write tests in Wave 5 after migration is stable
- **Framework**: vitest (keep existing)
- **During migration**: Manual agent-executed QA scenarios verify each task

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Electron app**: Use Bash to launch, verify process, check output
- **Browser control**: Use chrome-cdp-skill CLI to verify CDP access
- **Frontend**: Use Playwright/Playwriter to verify UI renders correctly
- **API**: Use curl against grading server endpoints

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (SPIKE — go/no-go validation, MUST complete first):
└── Task 1: Spike — validate Electron + CDP + accessibility tree [deep]

Wave 1 (After spike passes — foundation, MAX PARALLEL):
├── Task 2: Fork chrome-cdp-skill repo [quick]
├── Task 3: Scaffold Electron app (main process, preload, renderer) [unspecified-high]
├── Task 4: Port SQLite database layer [unspecified-high]
└── Task 5: Port server sidecar management [unspecified-high]

Wave 2 (After Wave 1 — core backend port, MAX PARALLEL):
├── Task 6: Port BrowserView creation + management (depends: 3) [deep]
├── Task 7: Port window management + tab system (depends: 3, 6) [unspecified-high]
├── Task 8: Integrate webContents.debugger CDP (depends: 3, 6) [deep]
├── Task 9: Port autofill injection (depends: 6) [quick]
└── Task 10: Port OAuth flow (depends: 3) [unspecified-high]

Wave 3 (After Wave 2 — CDP enhancement + frontend, MAX PARALLEL):
├── Task 11: Merge OGRE CDP capabilities into chrome-cdp-skill fork (depends: 2) [deep]
├── Task 12: Add accessibility tree to CDP layer (depends: 8) [deep]
├── Task 13: Port Svelte frontend IPC — replace invoke() with ipcRenderer (depends: 3) [unspecified-high]
├── Task 14: Port Browser.svelte to Electron BrowserView (depends: 6, 7, 13) [deep]
└── Task 15: Port remaining pages — Dashboard, Settings, History, etc. (depends: 4, 13) [unspecified-high]

Wave 4 (After Wave 3 — agent integration + build):
├── Task 16: Simplify browser-actions.ts — CDP only, no fallbacks (depends: 8, 12) [deep]
├── Task 17: Integrate accessibility tree into agent loop (depends: 12, 16) [deep]
├── Task 18: Wire chrome-cdp-skill for external agent access (depends: 8, 11) [unspecified-high]
├── Task 19: Set up electron-builder for Linux + Windows (depends: 3) [unspecified-high]
└── Task 20: Port auto-updater (electron-updater) (depends: 19) [unspecified-high]

Wave 5 (After Wave 4 — testing + polish):
├── Task 21: Port existing vitest tests to Electron context (depends: 16, 17) [unspecified-high]
├── Task 22: End-to-end grading pipeline test (depends: all) [deep]
└── Task 23: PR to upstream chrome-cdp-skill (depends: 11, 18) [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright skill)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 6 → Task 8 → Task 12 → Task 17 → Task 22 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Waves 1, 2, 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2-5 | 0 |
| 2 | 1 | 11, 18 | 1 |
| 3 | 1 | 6, 7, 8, 10, 13, 19 | 1 |
| 4 | 1 | 15 | 1 |
| 5 | 1 | — | 1 |
| 6 | 3 | 7, 8, 9, 14 | 2 |
| 7 | 3, 6 | 14 | 2 |
| 8 | 3, 6 | 12, 16, 18 | 2 |
| 9 | 6 | — | 2 |
| 10 | 3 | — | 2 |
| 11 | 2 | 18, 23 | 3 |
| 12 | 8 | 16, 17 | 3 |
| 13 | 3 | 14, 15 | 3 |
| 14 | 6, 7, 13 | — | 3 |
| 15 | 4, 13 | — | 3 |
| 16 | 8, 12 | 17, 21 | 4 |
| 17 | 12, 16 | 21, 22 | 4 |
| 18 | 8, 11 | 23 | 4 |
| 19 | 3 | 20 | 4 |
| 20 | 19 | — | 4 |
| 21 | 16, 17 | — | 5 |
| 22 | all | F1-F4 | 5 |
| 23 | 11, 18 | — | 5 |

### Agent Dispatch Summary

- **Wave 0**: **1** — T1 → `deep`
- **Wave 1**: **4** — T2 → `quick`, T3 → `unspecified-high`, T4 → `unspecified-high`, T5 → `unspecified-high`
- **Wave 2**: **5** — T6 → `deep`, T7 → `unspecified-high`, T8 → `deep`, T9 → `quick`, T10 → `unspecified-high`
- **Wave 3**: **5** — T11 → `deep`, T12 → `deep`, T13 → `unspecified-high`, T14 → `deep`, T15 → `unspecified-high`
- **Wave 4**: **5** — T16 → `deep`, T17 → `deep`, T18 → `unspecified-high`, T19 → `unspecified-high`, T20 → `unspecified-high`
- **Wave 5**: **3** — T21 → `unspecified-high`, T22 → `deep`, T23 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Spike — Validate Electron + CDP + Accessibility Tree (GO/NO-GO)

  **What to do**:
  - Create a minimal Electron app (not in ogre-desktop — use `tmp/electron-spike/`)
  - Create a BrowserWindow, navigate to `https://www.myopenmath.com/`
  - Use `webContents.debugger.attach('1.3')` to enable CDP
  - Send `Accessibility.enable` then `Accessibility.getFullAXTree` — capture the result
  - Send `Page.captureScreenshot` — verify screenshot works
  - Send `Runtime.evaluate` with `document.title` — verify JS eval works
  - Install `better-sqlite3`, rebuild for Electron's Node ABI, create/read a test table
  - Install `onnxruntime-node`, verify it loads without ABI mismatch
  - Test CORS: Electron renderer `fetch('http://localhost:3456/health')` — does it work?
  - **GO**: All above work → proceed with migration
  - **NO-GO**: Any critical failure → reassess architecture

  **Must NOT do**:
  - Don't build a full app — this is a throwaway spike
  - Don't port any OGRE code — use minimal test scripts only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires investigation, multiple unknowns, and go/no-go decision-making
  - **Skills**: [`playwright`]
    - `playwright`: May need browser verification of the spike app

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (alone — blocker for everything)
  - **Blocks**: Tasks 2, 3, 4, 5 (all of Wave 1)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/cdp-client.ts:44-66` — Current CDP connection flow (shows what `webContents.debugger` replaces)
  - `ogre-desktop/src-tauri/src/lib.rs:1696-1720` — Current CDP port allocation (will be eliminated)

  **API/Type References**:
  - `ogre-desktop/src/lib/cdp-actions.ts:322-329` — `cdpScreenshot()` — same CDP call, verify it works via `webContents.debugger`

  **External References**:
  - Electron `webContents.debugger` API: https://www.electronjs.org/docs/latest/api/debugger
  - Electron `WebContentsView`: https://www.electronjs.org/docs/latest/api/web-contents-view
  - better-sqlite3 Electron rebuild: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md
  - electron-rebuild: https://github.com/electron/rebuild

  **WHY Each Reference Matters**:
  - cdp-client.ts shows the exact CDP messages the spike must validate (`send('Accessibility.getFullAXTree')`)
  - lib.rs shows the port allocation the spike replaces with `webContents.debugger`
  - electron-rebuild is needed because better-sqlite3 and onnxruntime-node are native modules

  **Acceptance Criteria**:
  - [ ] `Accessibility.getFullAXTree` returns a non-empty tree with roles and names
  - [ ] `Page.captureScreenshot` returns valid base64 image data
  - [ ] `Runtime.evaluate` returns correct `document.title` value
  - [ ] `better-sqlite3` creates, writes, and reads a table without errors
  - [ ] `onnxruntime-node` loads without ABI mismatch errors
  - [ ] CORS fetch to localhost:3456 succeeds (or workaround documented)

  **QA Scenarios**:

  ```
  Scenario: CDP accessibility tree via webContents.debugger
    Tool: Bash
    Preconditions: Minimal Electron app created in tmp/electron-spike/
    Steps:
      1. Run `npm start` in tmp/electron-spike/
      2. App launches, navigates to https://www.myopenmath.com/
      3. Main process calls webContents.debugger.attach('1.3')
      4. Main process sends Accessibility.enable
      5. Main process sends Accessibility.getFullAXTree
      6. Log the result length and first 5 node roles to stdout
    Expected Result: Tree has 50+ nodes, includes roles like 'WebArea', 'link', 'textbox'
    Failure Indicators: Empty tree, error on attach, 'method not found' response
    Evidence: .sisyphus/evidence/task-1-accessibility-tree.json

  Scenario: Native module ABI compatibility
    Tool: Bash
    Preconditions: better-sqlite3 and onnxruntime-node installed in spike
    Steps:
      1. Run electron-rebuild in spike directory
      2. Launch spike app
      3. Main process requires better-sqlite3, creates in-memory DB, inserts row, reads it back
      4. Main process requires onnxruntime-node, calls ort.env (basic load test)
    Expected Result: Both modules load without errors, DB operations succeed
    Failure Indicators: 'NODE_MODULE_VERSION mismatch', segfault, 'cannot find module'
    Evidence: .sisyphus/evidence/task-1-native-modules.txt
  ```

  **Commit**: YES
  - Message: `spike(electron): validate CDP + accessibility tree + native modules`
  - Files: `tmp/electron-spike/**`
  - Pre-commit: spike passes all checks

- [x] 2. Fork chrome-cdp-skill Repository

  **What to do**:
  - Fork `pasky/chrome-cdp-skill` to `shuff57/chrome-cdp-skill` on GitHub
  - Clone the fork locally (e.g., `../chrome-cdp-skill/` or as git submodule)
  - Verify the existing CLI works: `scripts/cdp.mjs list` against a running Chrome
  - Read through the codebase to understand the daemon architecture
  - Document the API surface and extension points for the merge task (Task 11)

  **Must NOT do**:
  - Don't modify the fork yet — that's Task 11
  - Don't add OGRE-specific code yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple repo fork and clone operation
  - **Skills**: [`git-master`]
    - `git-master`: Git operations for fork setup

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4, 5)
  - **Blocks**: Tasks 11, 18
  - **Blocked By**: Task 1 (spike must pass)

  **References**:

  **External References**:
  - chrome-cdp-skill repo: https://github.com/pasky/chrome-cdp-skill
  - chrome-cdp-skill README: CLI commands, usage, architecture

  **WHY Each Reference Matters**:
  - Need to understand the daemon-per-tab architecture before merging OGRE capabilities

  **Acceptance Criteria**:
  - [ ] Fork exists at github.com/shuff57/chrome-cdp-skill
  - [ ] Local clone at correct path
  - [ ] `scripts/cdp.mjs list` runs without errors (may show 0 tabs if no Chrome running)

  **QA Scenarios**:

  ```
  Scenario: Fork exists and CLI runs
    Tool: Bash
    Preconditions: GitHub CLI authenticated
    Steps:
      1. gh repo fork pasky/chrome-cdp-skill --clone
      2. cd chrome-cdp-skill && node scripts/cdp.mjs list
    Expected Result: Fork created, CLI runs without syntax errors
    Failure Indicators: Fork fails, CLI throws import errors
    Evidence: .sisyphus/evidence/task-2-fork-verified.txt
  ```

  **Commit**: NO (separate repo)

- [x] 3. Scaffold Electron App

  **What to do**:
  - Create new Electron project structure alongside existing ogre-desktop:
    - `ogre-desktop/electron-main/` — main process code
    - `ogre-desktop/electron-main/main.ts` — entry point
    - `ogre-desktop/electron-main/preload.ts` — preload script with typed API bridge
    - `ogre-desktop/electron-main/ipc-handlers.ts` — IPC handler registration
  - Install Electron, electron-builder, @electron/rebuild as devDependencies
  - Configure Vite to work with Electron (vite-plugin-electron or manual config)
  - Set up the typed preload bridge with `contextBridge.exposeInMainWorld()`:
    - Mirror all existing `invoke()` function signatures as the preload API
    - This creates the typed contract that Task 13 (IPC migration) will use
  - Configure `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  - Set up CORS handling for localhost:3456 (grading server)
  - Add `npm run electron:dev` and `npm run electron:build` scripts
  - Verify: Electron launches, shows Vite dev server content, preload bridge works

  **Must NOT do**:
  - Don't port any Tauri-specific code yet
  - Don't remove Tauri config/code (keep it working during migration)
  - Don't change the Svelte frontend

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Significant scaffolding with many moving parts (Vite + Electron + preload bridge)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4, 5)
  - **Blocks**: Tasks 6, 7, 8, 10, 13, 19
  - **Blocked By**: Task 1 (spike must pass)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/tauri.conf.json` — Current window config (size, title) to replicate
  - `ogre-desktop/vite.config.js` — Current Vite config to adapt for Electron
  - `ogre-desktop/package.json` — Current scripts to add Electron equivalents alongside

  **API/Type References**:
  - `ogre-desktop/src-tauri/src/lib.rs:1900-1910` — List of all Tauri commands (these become IPC handlers)

  **External References**:
  - Electron quick start: https://www.electronjs.org/docs/latest/tutorial/quick-start
  - vite-plugin-electron: https://github.com/nicedaybrother/vite-plugin-electron
  - contextBridge API: https://www.electronjs.org/docs/latest/api/context-bridge

  **WHY Each Reference Matters**:
  - tauri.conf.json has window dimensions and app metadata to replicate
  - lib.rs:1900-1910 lists ALL invoke commands — these are the preload bridge API surface
  - vite.config.js shows the current dev server setup that must coexist with Electron

  **Acceptance Criteria**:
  - [ ] `npm run electron:dev` launches Electron window showing Vite dev content
  - [ ] Preload bridge exposes typed API matching existing invoke() signatures
  - [ ] `contextIsolation: true` verified in BrowserWindow config
  - [ ] CORS for localhost:3456 works from renderer

  **QA Scenarios**:

  ```
  Scenario: Electron app launches with Svelte frontend
    Tool: Bash
    Preconditions: Electron + dependencies installed
    Steps:
      1. Run npm run electron:dev
      2. Wait 10s for app to launch
      3. Check process list for electron process
      4. Use chrome-cdp-skill or webContents.debugger to verify page content
    Expected Result: Electron window shows the Svelte app, no console errors
    Failure Indicators: White screen, crash, preload bridge errors
    Evidence: .sisyphus/evidence/task-3-electron-launch.png

  Scenario: contextIsolation enforced
    Tool: Bash (grep)
    Preconditions: Scaffold complete
    Steps:
      1. Search electron-main/ for contextIsolation settings
      2. Verify all BrowserWindow creation has contextIsolation: true
      3. Verify no nodeIntegration: true exists
    Expected Result: All windows have contextIsolation: true, nodeIntegration: false
    Failure Indicators: Any window with contextIsolation: false
    Evidence: .sisyphus/evidence/task-3-security-audit.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): scaffold main process, preload bridge, renderer`
  - Files: `ogre-desktop/electron-main/**, ogre-desktop/package.json, ogre-desktop/vite.config.js`
  - Pre-commit: `npm run electron:dev` launches successfully

- [x] 4. Port SQLite Database Layer

  **What to do**:
  - Replace `tauri-plugin-sql` with `better-sqlite3` (validated in spike)
  - Port `ogre-desktop/src/lib/db.ts` to use Electron IPC → main process better-sqlite3
  - Replicate all existing migrations from `lib.rs` (provider_configs, grading_sessions, settings, site_credentials, site_profiles, skills, rubrics, embeddings)
  - Database file location: `app.getPath('userData')/ogre.db`
  - Expose via preload bridge: `getSetting`, `setSetting`, `runQuery`, etc.
  - Preserve all existing data if migrating from Tauri version (read existing db file)

  **Must NOT do**:
  - Don't change the database schema
  - Don't add new tables or columns
  - Don't switch to a different database (keep SQLite)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Database migration with many tables and migration scripts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 5)
  - **Blocks**: Task 15
  - **Blocked By**: Task 1 (spike validates better-sqlite3 ABI)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/db.ts` — Current database API surface (all functions to port)
  - `ogre-desktop/src-tauri/src/lib.rs:1721-1900` — All migration SQL statements to replicate

  **API/Type References**:
  - `ogre-desktop/src/lib/db.ts` — Function signatures for getSetting, setSetting, getSiteCredentials, etc.

  **External References**:
  - better-sqlite3 API: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md

  **WHY Each Reference Matters**:
  - db.ts is the exact API surface to replicate — every function must have the same signature
  - lib.rs migrations define the schema — must reproduce exactly

  **Acceptance Criteria**:
  - [ ] All migration SQL from lib.rs reproduced in better-sqlite3
  - [ ] `getSetting`/`setSetting` work via IPC from renderer
  - [ ] All table operations work: provider_configs, grading_sessions, site_credentials, etc.
  - [ ] Database file created at correct path

  **QA Scenarios**:

  ```
  Scenario: Database CRUD operations via IPC
    Tool: Bash
    Preconditions: Electron app with database layer
    Steps:
      1. Launch app
      2. Call setSetting('test_key', 'test_value') from renderer
      3. Call getSetting('test_key') from renderer
      4. Verify returned value matches
      5. Check database file exists at userData/ogre.db
    Expected Result: Value stored and retrieved correctly, db file exists
    Failure Indicators: IPC timeout, wrong value, missing db file
    Evidence: .sisyphus/evidence/task-4-db-crud.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): port SQLite database layer to better-sqlite3`
  - Files: `ogre-desktop/electron-main/database.ts, ogre-desktop/src/lib/db.ts`
  - Pre-commit: database tests pass

- [x] 5. Port Server Sidecar Management

  **What to do**:
  - Replace Tauri's `SharedChild` group-spawn with `child_process.fork()` in Electron main process
  - Port the server lifecycle from `lib.rs:160-370`:
    - Spawn grading server on app start
    - Monitor stdout/stderr, forward to renderer as events
    - Auto-restart on crash (3 attempts max with backoff)
    - Clean kill on app exit (SIGTERM, then SIGKILL after timeout)
  - Server bundle path: resolve from `app.getPath('userData')` or bundled resources
  - Health check: poll `http://localhost:3456/health` until ready
  - Expose status events to renderer: `server-started`, `server-error`, `server-log`

  **Must NOT do**:
  - Don't modify the grading server code itself
  - Don't change the server's port or API surface
  - Don't compile the server to a binary — run directly with Node/Bun

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Process lifecycle management with restart logic and health checks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: None (other tasks don't directly depend on server management)
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:160-370` — Current sidecar lifecycle (spawn, monitor, restart, kill)
  - `ogre-desktop/src/lib/server.ts` — Current server status API from frontend

  **API/Type References**:
  - `grading-server/server.js:1-60` — Server entry point, port config, health endpoint

  **WHY Each Reference Matters**:
  - lib.rs:160-370 has the exact restart logic (3 attempts, backoff) to replicate
  - server.ts shows the frontend API for server status — must keep compatible

  **Acceptance Criteria**:
  - [ ] Server starts automatically when Electron app launches
  - [ ] `curl http://localhost:3456/health` returns `{"status":"ok"}`
  - [ ] Server auto-restarts after simulated crash (kill the process)
  - [ ] Server logs forwarded to renderer as events
  - [ ] Clean shutdown on app exit (no orphaned processes)

  **QA Scenarios**:

  ```
  Scenario: Server auto-start and health check
    Tool: Bash (curl)
    Preconditions: Electron app launched
    Steps:
      1. Launch Electron app
      2. Wait 5s for server startup
      3. curl http://localhost:3456/health
      4. Kill the server process manually
      5. Wait 5s for restart
      6. curl http://localhost:3456/health again
    Expected Result: Both health checks return {"status":"ok"}
    Failure Indicators: Connection refused, server not restarted, orphaned process
    Evidence: .sisyphus/evidence/task-5-server-lifecycle.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): port grading server sidecar to child_process`
  - Files: `ogre-desktop/electron-main/server-manager.ts`
  - Pre-commit: server starts and health check passes

- [x] 6. Port BrowserView Creation + Management

  **What to do**:
  - Replace Tauri's `create_embedded_browser` / `navigate_embedded` / `destroy_webview` with Electron equivalents
  - Use `WebContentsView` (Electron 30+) or `BrowserView` (older Electron) for the embedded browser
  - Implement in `electron-main/browser-manager.ts`:
    - `createBrowserView(tabId, url)` — create new view, navigate to URL
    - `navigateView(tabId, url)` — navigate existing view
    - `destroyView(tabId)` — destroy view and clean up
    - `showView(tabId)` / `hideView(tabId)` — visibility management
    - `setBounds(tabId, x, y, width, height)` — positioning
    - `goBack(tabId)` / `goForward(tabId)` / `reload(tabId)` — navigation controls
  - Emit events to renderer: `browser-url-changed`, `browser-page-loaded`, `browser-status`
  - Handle URL normalization (add https:// prefix if missing)
  - Register IPC handlers matching the existing invoke() signatures

  **Must NOT do**:
  - Don't implement CDP here — that's Task 8
  - Don't change the Browser.svelte component — that's Task 14
  - Don't implement tabs UI — just the backend for view management

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core infrastructure with multiple interrelated APIs and event management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 3)
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: Tasks 7, 8, 9, 14
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser.ts:19-92` — All browser management functions to replicate
  - `ogre-desktop/src/lib/browser.ts:97-123` — Event listener signatures to match
  - `ogre-desktop/src-tauri/src/lib.rs:400-700` — Rust webview creation logic to port

  **API/Type References**:
  - `ogre-desktop/src/lib/browser.ts:98` — `BrowserEventPayload` type to keep

  **External References**:
  - Electron WebContentsView: https://www.electronjs.org/docs/latest/api/web-contents-view
  - Electron BrowserView (legacy): https://www.electronjs.org/docs/latest/api/browser-view

  **WHY Each Reference Matters**:
  - browser.ts has the exact function signatures the renderer calls — IPC handlers must match
  - lib.rs shows the navigation, back/forward, and event emission logic to replicate

  **Acceptance Criteria**:
  - [ ] `createBrowserView('tab1', 'https://example.com')` creates a visible embedded browser
  - [ ] Navigation (forward, back, reload) works
  - [ ] `browser-url-changed` event emitted on navigation
  - [ ] `browser-page-loaded` event emitted on page load
  - [ ] Multiple views can coexist (show/hide)
  - [ ] `destroyView` cleans up without orphaned processes

  **QA Scenarios**:

  ```
  Scenario: Create and navigate embedded browser
    Tool: Bash
    Preconditions: Electron app with browser manager
    Steps:
      1. Launch app
      2. Call createBrowserView('test', 'https://www.myopenmath.com/')
      3. Wait for browser-page-loaded event
      4. Verify URL matches via getEmbeddedUrl('test')
      5. Call navigateView('test', 'https://example.com')
      6. Wait for browser-page-loaded event
      7. Call goBack('test')
      8. Verify URL is back to myopenmath
    Expected Result: All navigation steps succeed, events fire correctly
    Failure Indicators: View not visible, events not emitted, navigation fails
    Evidence: .sisyphus/evidence/task-6-browser-lifecycle.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): port BrowserView creation and management`
  - Files: `ogre-desktop/electron-main/browser-manager.ts, ogre-desktop/electron-main/ipc-handlers.ts`
  - Pre-commit: browser creation and navigation works

- [x] 7. Port Window Management + Tab System

  **What to do**:
  - Port tab management from `lib.rs` to Electron main process
  - Implement bounds calculation in main process (replicate `webview-layout.ts` logic)
  - Handle window resize → recalculate and apply view bounds
  - Handle sidebar toggle → animate view bounds (sync with CSS transition)
  - Port `set_webview_bounds` IPC handler
  - Handle the grading panel drawer width affecting browser bounds

  **Must NOT do**:
  - Don't change Browser.svelte tab UI
  - Don't change webview-layout.ts calculations

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Window/layout management with event-driven bounds updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 3, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 3, 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/webview-layout.ts` — Bounds calculation logic (keep as-is, just wire to Electron)
  - `ogre-desktop/src/pages/Browser.svelte:157-193` — How bounds are calculated from DOM measurements

  **Acceptance Criteria**:
  - [ ] Browser view fills correct area (accounting for sidebar, nav bar, tab bar)
  - [ ] Window resize updates browser view bounds
  - [ ] Sidebar toggle animates browser view bounds smoothly

  **QA Scenarios**:

  ```
  Scenario: Browser bounds update on window resize
    Tool: Bash
    Preconditions: App with browser view open
    Steps:
      1. Launch app, create browser view
      2. Resize window to 1024x768
      3. Verify browser view bounds adjusted (no overflow, no gaps)
      4. Resize window to 1920x1080
      5. Verify bounds adjusted again
    Expected Result: Browser view fills available space correctly at both sizes
    Failure Indicators: View overflows window, gaps visible, view not resized
    Evidence: .sisyphus/evidence/task-7-bounds-update.png
  ```

  **Commit**: YES (groups with 6)
  - Message: `feat(electron): port window management and tab system`
  - Files: `ogre-desktop/electron-main/browser-manager.ts`
  - Pre-commit: bounds update on resize

- [x] 8. Integrate webContents.debugger CDP

  **What to do**:
  - Replace the current `CDPClient` WebSocket connection with Electron's `webContents.debugger` API
  - In `electron-main/cdp-bridge.ts`:
    - `attachDebugger(tabId)` — calls `webContents.debugger.attach('1.3')`
    - `sendCDP(tabId, method, params)` — calls `webContents.debugger.sendCommand(method, params)`
    - `onCDPEvent(tabId, event, callback)` — listens to `webContents.debugger` events
    - `detachDebugger(tabId)` — cleanup
  - Expose via IPC so the renderer's `cdp-client.ts` can call through
  - Enable `Page`, `Runtime`, `DOM`, `Input`, `Accessibility` domains on attach
  - Verify: `pwClick`, `pwType`, `pwReadText`, `cdpScreenshot`, `pwWaitFor` all work
  - This is the KEY task — it establishes CDP as the single control path

  **Must NOT do**:
  - Don't use `--remote-debugging-port` for internal agent (use `webContents.debugger`)
  - Don't modify `cdp-actions.ts` yet — that's Task 16
  - Don't add accessibility tree yet — that's Task 12

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core CDP integration — the thesis of the entire migration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 3, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 12, 16, 18
  - **Blocked By**: Tasks 3, 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/cdp-client.ts` — Current WebSocket CDP client (being replaced by debugger API)
  - `ogre-desktop/src/lib/cdp-actions.ts:118-175` — `pwClick` implementation (verify works via new bridge)
  - `ogre-desktop/src/lib/cdp-actions.ts:322-329` — `cdpScreenshot` (verify works)
  - `ogre-desktop/src/lib/browser.ts:168-197` — `evalScript` via CDP (verify works)

  **External References**:
  - Electron Debugger API: https://www.electronjs.org/docs/latest/api/debugger
  - CDP Protocol Viewer: https://chromedevtools.github.io/devtools-protocol/

  **WHY Each Reference Matters**:
  - cdp-client.ts shows the exact message format (`{id, method, params}`) the bridge must support
  - cdp-actions.ts has every CDP call that must work through the new bridge
  - The Debugger API replaces the WebSocket connection with in-process communication

  **Acceptance Criteria**:
  - [ ] `webContents.debugger.attach('1.3')` succeeds on embedded browser
  - [ ] `Runtime.evaluate` works (document.title returns correct value)
  - [ ] `Input.dispatchMouseEvent` works (click at coordinates)
  - [ ] `Page.captureScreenshot` works (returns valid base64 image)
  - [ ] All existing CDP actions in cdp-actions.ts pass through the bridge

  **QA Scenarios**:

  ```
  Scenario: CDP actions via webContents.debugger
    Tool: Bash
    Preconditions: App with browser view navigated to test page
    Steps:
      1. Navigate to https://www.myopenmath.com/
      2. Attach debugger
      3. Runtime.evaluate('document.title') — verify returns page title
      4. Page.captureScreenshot — verify returns base64 data
      5. DOM.getDocument — verify returns document node
    Expected Result: All CDP commands return valid responses
    Failure Indicators: 'Debugger is not attached', 'method not found', empty responses
    Evidence: .sisyphus/evidence/task-8-cdp-bridge.json

  Scenario: Input events via CDP
    Tool: Bash
    Preconditions: Browser at myopenmath.com login page
    Steps:
      1. Use Runtime.evaluate to find username input coordinates
      2. Input.dispatchMouseEvent to click it
      3. Input.insertText to type a test string
      4. Runtime.evaluate to read the input value
    Expected Result: Input contains the typed text
    Failure Indicators: Click doesn't focus, text not inserted
    Evidence: .sisyphus/evidence/task-8-cdp-input.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): integrate webContents.debugger CDP`
  - Files: `ogre-desktop/electron-main/cdp-bridge.ts, ogre-desktop/electron-main/ipc-handlers.ts`
  - Pre-commit: CDP evaluate and screenshot work

- [x] 9. Port Autofill Injection

  **What to do**:
  - Port `inject_autofill` from Tauri to Electron
  - Use `webContents.executeJavaScript()` to inject the autofill script
  - Keep the existing `autofill.ts` logic (generateAutoFillScript, matchCredentialsToUrl)
  - Wire IPC handler matching existing invoke() signature

  **Must NOT do**:
  - Don't change autofill logic or matching rules

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple port — one IPC handler calling executeJavaScript
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/autofill.ts` — Autofill script generation (keep as-is)
  - `ogre-desktop/src/lib/browser.ts:129-132` — Current injectAutofill implementation

  **Acceptance Criteria**:
  - [ ] Autofill script injected into embedded browser via IPC
  - [ ] Credentials matched and filled on supported sites

  **QA Scenarios**:

  ```
  Scenario: Autofill injection
    Tool: Bash
    Preconditions: Site credentials stored in database
    Steps:
      1. Navigate to a site with stored credentials
      2. Call injectAutofill with test credentials
      3. Verify input fields contain the credentials
    Expected Result: Username and password fields populated
    Failure Indicators: Fields empty, script error
    Evidence: .sisyphus/evidence/task-9-autofill.txt
  ```

  **Commit**: YES (groups with 6)
  - Message: `feat(electron): port autofill injection`
  - Files: `ogre-desktop/electron-main/ipc-handlers.ts`

- [x] 10. Port OAuth Callback Flow

  **What to do**:
  - Port OAuth callback handling from Tauri to Electron
  - Use `electron.net` or TCP listener for OAuth redirect (keep existing pattern from lib.rs)
  - Handle Google OAuth flow for Gemini API provider
  - Port GitHub Copilot token exchange if applicable
  - Register IPC handlers matching existing invoke() signatures

  **Must NOT do**:
  - Don't change OAuth provider configuration
  - Don't add new OAuth providers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: OAuth involves token exchange, redirect handling, and security considerations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts` — Current OAuth implementation
  - `ogre-desktop/src-tauri/src/lib.rs` — OAuth TCP listener in Rust (search for `oauth`)

  **Acceptance Criteria**:
  - [ ] Google OAuth flow completes (redirect → token → stored)
  - [ ] Token persisted in database for subsequent API calls

  **QA Scenarios**:

  ```
  Scenario: OAuth token exchange
    Tool: Bash
    Preconditions: OAuth credentials configured
    Steps:
      1. Initiate OAuth flow from settings page
      2. Complete browser-based authentication
      3. Verify token stored in database
      4. Verify API call with token succeeds
    Expected Result: Token obtained and stored, API works
    Failure Indicators: Redirect fails, token not stored, API unauthorized
    Evidence: .sisyphus/evidence/task-10-oauth.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): port OAuth callback flow`
  - Files: `ogre-desktop/electron-main/oauth.ts`

- [x] 11. Merge OGRE CDP Capabilities into chrome-cdp-skill Fork

  **What to do**:
  - In the forked `shuff57/chrome-cdp-skill` repo, add new commands inspired by OGRE's CDP code:
    - `codemirror <target> <selector> <value>` — Write to CodeMirror editors (from `pwWriteCodeMirror`)
    - `popup <target> [timeout]` — Capture popup window screenshot (from `pwCapturePopup`)
    - `press <target> <key>` — Press keyboard key with full key mapping (from `pwPressKey`)
    - `fuzzymatch <target> <text>` — Find element by text content with fuzzy matching (from `agent-dom-fuzzy.ts`)
  - Add safety: block dangerous JS patterns before eval (from `DANGEROUS_JS_PATTERNS`)
  - Add Electron auto-detection: detect Electron's CDP endpoint alongside Chrome/Edge/Brave
  - Preserve API compatibility with upstream (additive, not breaking changes)
  - Update README with new commands

  **Must NOT do**:
  - Don't break existing chrome-cdp-skill CLI interface
  - Don't add Electron as a hard dependency
  - Don't remove any existing commands
  - Don't change the daemon architecture

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Merging two codebases requires careful API design and compatibility testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 13, 14, 15)
  - **Blocks**: Tasks 18, 23
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/cdp-actions.ts:385-416` — `pwWriteCodeMirror` implementation to port
  - `ogre-desktop/src/lib/cdp-actions.ts:429-495` — `pwCapturePopup` implementation to port
  - `ogre-desktop/src/lib/cdp-actions.ts:337-374` — `pwPressKey` with full key mapping
  - `ogre-desktop/src/lib/agent-dom-fuzzy.ts` — Fuzzy matching logic
  - `ogre-desktop/src/lib/agent-types.ts` — `DANGEROUS_JS_PATTERNS` array

  **External References**:
  - chrome-cdp-skill source: `skills/chrome-cdp/scripts/cdp.mjs` in fork

  **WHY Each Reference Matters**:
  - Each OGRE file contains a working implementation to adapt to chrome-cdp-skill's CLI pattern
  - DANGEROUS_JS_PATTERNS is a security feature that benefits the entire community

  **Acceptance Criteria**:
  - [ ] All existing chrome-cdp-skill commands still work unchanged
  - [ ] `cdp.mjs press <target> Enter` sends key event
  - [ ] `cdp.mjs codemirror <target> "#control" "code"` writes to CodeMirror
  - [ ] Dangerous eval patterns are blocked with clear error message

  **QA Scenarios**:

  ```
  Scenario: New commands work alongside existing ones
    Tool: Bash
    Preconditions: Fork cloned, Chrome running with test page
    Steps:
      1. cdp.mjs list — verify existing command works
      2. cdp.mjs snap <target> — verify existing command works
      3. cdp.mjs press <target> Tab — verify new command works
      4. cdp.mjs eval <target> "document.cookie" — verify blocked by safety
    Expected Result: Existing commands unchanged, new commands functional, safety blocks dangerous patterns
    Failure Indicators: Existing commands broken, new commands error, unsafe eval allowed
    Evidence: .sisyphus/evidence/task-11-fork-commands.txt
  ```

  **Commit**: YES (in chrome-cdp-skill fork repo)
  - Message: `feat: add press, codemirror, popup commands + safety patterns`
  - Files: `skills/chrome-cdp/scripts/cdp.mjs, README.md`

- [x] 12. Add Accessibility Tree to CDP Layer

  **What to do**:
  - Add accessibility tree capture to `electron-main/cdp-bridge.ts`:
    - `captureAccessibilityTree(tabId)` — calls `Accessibility.getFullAXTree` via debugger
    - Format the tree into a compact, readable text format (similar to Playwriter's `snapshot()`)
    - Include: node roles, names, values, descriptions, states (focused, checked, etc.)
    - Generate stable locators for each interactive node
  - Also add to chrome-cdp-skill fork as enhanced `snap` output (if the existing snap doesn't already use `Accessibility.getFullAXTree`)
  - Expose via IPC: `captureAccessibilityTree(tabId)` → returns formatted tree string
  - This is the **key improvement** that brings Playwriter-quality page understanding

  **Must NOT do**:
  - Don't integrate into agent loop yet — that's Task 17
  - Don't replace DOM snapshot (`captureInteractiveDom`) yet — keep both available

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Accessibility tree formatting is complex — must match Playwriter quality
  - **Skills**: [`playwright`]
    - `playwright`: Reference Playwriter's `snapshot()` output format for compatibility

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 16, 17
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-dom.ts` — Current DOM snapshot (what this improves upon)
  - Playwriter `snapshot()` output format — the gold standard to match

  **External References**:
  - CDP Accessibility domain: https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/
  - Playwriter source: Check how `snapshot()` formats the accessibility tree

  **WHY Each Reference Matters**:
  - agent-dom.ts shows the current inferior approach (querySelectorAll) that this replaces
  - Playwriter's snapshot format is what the AI models are trained to understand — matching it means better reasoning

  **Acceptance Criteria**:
  - [ ] `captureAccessibilityTree()` returns a tree with 50+ nodes for a typical page
  - [ ] Each interactive node has: role, name, value (if applicable), locator
  - [ ] Output format is compact and readable by AI models
  - [ ] Non-interactive elements (headings, text, images) included for context
  - [ ] Tree correctly represents page structure (nesting, grouping)

  **QA Scenarios**:

  ```
  Scenario: Accessibility tree captures MyOpenMath grading page
    Tool: Bash
    Preconditions: Embedded browser at myopenmath.com grading page
    Steps:
      1. Navigate to a MyOpenMath grading page
      2. Call captureAccessibilityTree()
      3. Verify tree contains: textbox (for score), link (for student names), button (for submit)
      4. Verify tree includes locators (CSS selector or role-based)
      5. Compare output quality with Playwriter snapshot of same page
    Expected Result: Tree has 80+ nodes, includes all interactive elements with roles and names
    Failure Indicators: Empty tree, missing interactive elements, no locators
    Evidence: .sisyphus/evidence/task-12-accessibility-tree.json

  Scenario: Accessibility tree on empty/simple page
    Tool: Bash
    Preconditions: Browser at about:blank or simple test page
    Steps:
      1. Navigate to about:blank
      2. Call captureAccessibilityTree()
      3. Verify minimal tree (just WebArea root)
    Expected Result: Tree has 1-3 nodes (root WebArea)
    Failure Indicators: Error, null response
    Evidence: .sisyphus/evidence/task-12-accessibility-empty.json
  ```

  **Commit**: YES
  - Message: `feat(cdp): add accessibility tree snapshots`
  - Files: `ogre-desktop/electron-main/cdp-bridge.ts`

- [x] 13. Port Svelte Frontend IPC — Replace invoke() with Electron IPC

  **What to do**:
  - Create `ogre-desktop/src/lib/electron-bridge.ts` that wraps `window.electronAPI.*` calls
  - Replace all `invoke()` calls from `@tauri-apps/api/core` with the preload bridge API
  - Replace all `listen()` calls from `@tauri-apps/api/event` with IPC event listeners
  - Replace `tauriFetch` from `@tauri-apps/plugin-http` with standard `fetch`
  - This is a mechanical find-and-replace across ~22 files with 189+ call sites
  - Create a compatibility shim so changes are minimal per file:
    ```typescript
    // electron-bridge.ts
    export function invoke<T>(cmd: string, args?: any): Promise<T> {
      return window.electronAPI[cmd](args);
    }
    export function listen(event: string, handler: Function) {
      return window.electronAPI.on(event, handler);
    }
    ```

  **Must NOT do**:
  - Don't change any business logic
  - Don't change component structure or UI
  - Don't rename functions — keep API surface identical

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large-scale mechanical changes across many files (22 files, 189+ call sites)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 14, 15
  - **Blocked By**: Task 3 (preload bridge must exist)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser.ts:1-5` — Example of Tauri imports to replace
  - `ogre-desktop/src/lib/agent-api.ts:8` — tauriFetch import to replace
  - `ogre-desktop/src/lib/cdp-actions.ts:11` — invoke import to replace

  **Acceptance Criteria**:
  - [ ] Zero imports from `@tauri-apps/api/*` remain in src/
  - [ ] All 189+ call sites use the electron bridge
  - [ ] App compiles without errors
  - [ ] Basic navigation in app works (page switching, settings)

  **QA Scenarios**:

  ```
  Scenario: No Tauri imports remain
    Tool: Bash (grep)
    Preconditions: IPC migration complete
    Steps:
      1. grep -r "@tauri-apps" ogre-desktop/src/ --include="*.ts" --include="*.svelte"
      2. Count matches
    Expected Result: Zero matches
    Failure Indicators: Any remaining @tauri-apps imports
    Evidence: .sisyphus/evidence/task-13-tauri-imports.txt
  ```

  **Commit**: YES
  - Message: `refactor(frontend): replace Tauri invoke() with Electron IPC`
  - Files: `ogre-desktop/src/lib/*.ts, ogre-desktop/src/**/*.svelte`

- [x] 14. Port Browser.svelte to Electron BrowserView

  **What to do**:
  - Update `Browser.svelte` to work with Electron's BrowserView/WebContentsView
  - The main structure stays the same — tab bar, nav bar, presets, grading panel
  - Key changes:
    - `createEmbeddedBrowser()` → calls Electron IPC (via bridge from Task 13)
    - Bounds calculation → same logic, but calls Electron IPC to set view bounds
    - Events → listen via Electron IPC events
  - Verify full browser workflow: navigate, back/forward, reload, tabs, grading panel

  **Must NOT do**:
  - Don't redesign the UI
  - Don't add new features

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Browser page is the most complex component with many interactions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 6, 7, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7, 13

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Browser.svelte` — The component being ported (860 lines)
  - `ogre-desktop/src/lib/browser.ts` — All browser functions it calls

  **Acceptance Criteria**:
  - [ ] Browser page renders with tab bar, nav bar, presets
  - [ ] URL navigation works (type URL, press Enter, page loads)
  - [ ] Back/forward/reload work
  - [ ] Multiple tabs work (open, switch, close)
  - [ ] Grading panel toggle works

  **QA Scenarios**:

  ```
  Scenario: Full browser workflow
    Tool: Playwright (or manual via playwriter)
    Preconditions: Electron app running
    Steps:
      1. Click Browser page in sidebar
      2. Type "myopenmath.com" in URL bar
      3. Press Enter
      4. Wait for page load
      5. Click "+" to open new tab
      6. Type "example.com" in URL bar
      7. Switch between tabs
      8. Toggle grading panel
    Expected Result: All steps complete without errors
    Failure Indicators: White screen, navigation fails, tabs don't switch, panel doesn't toggle
    Evidence: .sisyphus/evidence/task-14-browser-workflow.png
  ```

  **Commit**: YES
  - Message: `feat(electron): port Browser.svelte to BrowserView`
  - Files: `ogre-desktop/src/pages/Browser.svelte, ogre-desktop/src/lib/browser.ts`

- [x] 15. Port Remaining Pages — Dashboard, Settings, History, etc.

  **What to do**:
  - Port all non-Browser pages to work with Electron IPC:
    - `Dashboard.svelte` — server status, quick actions
    - `Settings/` — provider config, credentials, appearance
    - `History.svelte` — grading session history
    - `Logs.svelte` — server log viewer
    - `Rubrics.svelte` — rubric management
    - `SiteProfiles.svelte` — site profile editor
    - `Skills.svelte` — skill management
    - `SetupWizard.svelte` — first-run setup
  - Most changes are just IPC migration (already handled by Task 13 bridge)
  - Verify each page loads and basic functions work

  **Must NOT do**:
  - Don't redesign any pages
  - Don't add new features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many pages but mostly mechanical — verify they work with new IPC
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 13

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/*.svelte` — All pages to verify
  - `ogre-desktop/src/components/**/*.svelte` — Components used by pages

  **Acceptance Criteria**:
  - [ ] Every page in the sidebar navigation loads without errors
  - [ ] Settings page can save/load provider configurations
  - [ ] History page shows grading sessions from database
  - [ ] Dashboard shows server status

  **QA Scenarios**:

  ```
  Scenario: All pages render without errors
    Tool: Bash
    Preconditions: Electron app with all IPC ported
    Steps:
      1. Launch app
      2. Navigate to each page: Dashboard, Browser, Settings, History, Logs, Rubrics, SiteProfiles, Skills
      3. Check console for errors on each page
    Expected Result: All pages render, no console errors
    Failure Indicators: White pages, console errors, missing data
    Evidence: .sisyphus/evidence/task-15-all-pages.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): port Dashboard, Settings, History pages`
  - Files: `ogre-desktop/src/pages/*.svelte`

- [ ] 16. Simplify browser-actions.ts — CDP Only, No Fallbacks

  **What to do**:
  - Refactor `browser-actions.ts` to remove the 3-tier fallback chain:
    - REMOVE: GDK actions import and all `isGdkAvailable()` checks
    - REMOVE: evalScript-based fallback implementations (`clickAction`, `typeAction`, etc.)
    - KEEP: CDP-based implementations as the ONLY path
  - Delete `gdk-actions.ts` entirely (no longer needed with Chromium everywhere)
  - Update `executeAction` dispatcher to use CDP directly
  - Simplify `browser.ts`:
    - `evalScript` → always use CDP `Runtime.evaluate` (no fallback chain)
    - `captureWebviewScreenshot` → always use CDP `Page.captureScreenshot` (no html2canvas)
    - Remove `html2canvas` CDN reference and related code
  - Remove `_evalScriptCdpUnavailable` cache and fallback logic
  - Update all imports that referenced GDK

  **Must NOT do**:
  - Don't change action logic (what click/type/scroll DO) — only remove fallback plumbing
  - Don't add new actions yet
  - Don't change the agent loop

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Careful refactoring across multiple files — must not break action behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17, 18, 19, 20)
  - **Blocks**: Tasks 17, 21
  - **Blocked By**: Tasks 8, 12

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser-actions.ts:22-24` — GDK imports to remove
  - `ogre-desktop/src/lib/browser-actions.ts:86-200` — evalScript fallback implementations to remove
  - `ogre-desktop/src/lib/browser.ts:161-179` — evalScript fallback chain to simplify
  - `ogre-desktop/src/lib/browser.ts:266-344` — html2canvas code to remove
  - `ogre-desktop/src/lib/gdk-actions.ts` — ENTIRE FILE to delete

  **Acceptance Criteria**:
  - [ ] `gdk-actions.ts` deleted
  - [ ] Zero references to `isGdkAvailable`, `gdkClick`, `gdkType`, etc. in codebase
  - [ ] Zero references to `html2canvas` in codebase
  - [ ] `evalScript` has no fallback — always uses CDP
  - [ ] `captureWebviewScreenshot` has no fallback — always uses CDP
  - [ ] All 9 agent actions still work (click, type, scroll, readText, screenshot, waitFor, navigate, runJS, done)

  **QA Scenarios**:

  ```
  Scenario: No GDK or html2canvas references remain
    Tool: Bash (grep)
    Preconditions: Refactoring complete
    Steps:
      1. grep -r "gdk" ogre-desktop/src/ --include="*.ts" -i
      2. grep -r "html2canvas" ogre-desktop/src/ --include="*.ts" -i
      3. grep -r "isGdkAvailable" ogre-desktop/src/ --include="*.ts"
      4. ls ogre-desktop/src/lib/gdk-actions.ts (should not exist)
    Expected Result: Zero matches for all greps, file doesn't exist
    Failure Indicators: Any remaining references
    Evidence: .sisyphus/evidence/task-16-cleanup-audit.txt

  Scenario: Agent actions still work after simplification
    Tool: Bash
    Preconditions: App running with embedded browser
    Steps:
      1. Navigate to test page
      2. Execute click action on a known element
      3. Execute type action into an input
      4. Execute readText to read page content
      5. Execute screenshot capture
    Expected Result: All actions succeed, returned data is valid
    Failure Indicators: Any action returns {success: false}
    Evidence: .sisyphus/evidence/task-16-actions-test.json
  ```

  **Commit**: YES
  - Message: `refactor(agent): simplify browser-actions to CDP-only`
  - Files: `ogre-desktop/src/lib/browser-actions.ts, ogre-desktop/src/lib/browser.ts`
  - Pre-commit: agent actions work

- [ ] 17. Integrate Accessibility Tree into Agent Loop

  **What to do**:
  - Update `agent-loop.ts` to use accessibility tree instead of (or alongside) DOM scraping:
    - Replace `captureInteractiveDom()` with `captureAccessibilityTree()` as primary page state
    - Keep screenshot capture as secondary (for visual-only elements)
    - Update `formatDomForPrompt()` to format accessibility tree for AI consumption
  - Update `agent-prompt.ts` — modify system prompt to:
    - Reference accessibility tree roles and names (not CSS selectors)
    - Instruct the AI to use role-based locators when possible
    - Match Playwriter's `snapshot()` description patterns
  - Update `agent-dom.ts`:
    - Add `captureAccessibilityTree()` function that calls IPC
    - Add `formatAccessibilityTreeForPrompt()` formatter
    - Keep `captureInteractiveDom()` as fallback (for edge cases)
  - Update action parsing to accept role-based selectors (e.g., `role=button[name="Submit"]`)
  - This is the task that delivers the **Playwriter-quality reasoning** improvement

  **Must NOT do**:
  - Don't change the agent loop structure (steps, timeout, loop detection)
  - Don't change the AI provider integration
  - Don't add new action types

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core improvement to agent reasoning — requires careful prompt engineering
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 21, 22
  - **Blocked By**: Tasks 12, 16

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:11-13` — Current DOM/screenshot capture imports
  - `ogre-desktop/src/lib/agent-dom.ts:19-120` — Current DOM snapshot script to replace/supplement
  - `ogre-desktop/src/lib/agent-prompt.ts` — System prompt to update with accessibility tree guidance

  **External References**:
  - Playwriter snapshot() output format — the format AI models are trained to understand

  **WHY Each Reference Matters**:
  - agent-loop.ts shows exactly where the accessibility tree replaces DOM capture
  - agent-prompt.ts is the system prompt that teaches the AI how to use the page state — must reference roles and names
  - Playwriter's format is what works — match it

  **Acceptance Criteria**:
  - [ ] Agent loop uses accessibility tree as primary page state
  - [ ] System prompt references roles, names, and locators (not just CSS selectors)
  - [ ] Agent can correctly identify and interact with elements by role (e.g., "click the Submit button")
  - [ ] Agent reasoning quality noticeably improved on grading pages
  - [ ] Fallback to DOM scraping available if accessibility tree fails

  **QA Scenarios**:

  ```
  Scenario: Agent uses accessibility tree for element identification
    Tool: Bash
    Preconditions: App with agent loop and accessibility tree integration
    Steps:
      1. Navigate to MyOpenMath grading page
      2. Start agent with task "find the score input and fill in 8"
      3. Check agent's state capture — should include accessibility tree with roles
      4. Check agent's action — should reference element by role/name, not just CSS selector
    Expected Result: Agent identifies score input by role='textbox' name='Score', types '8'
    Failure Indicators: Agent uses nth-child selector, can't find element, wrong element
    Evidence: .sisyphus/evidence/task-17-agent-reasoning.json

  Scenario: Agent handles page with many interactive elements
    Tool: Bash
    Preconditions: Browser at complex grading page (30 students)
    Steps:
      1. Capture accessibility tree
      2. Verify tree includes all student score inputs (30+)
      3. Verify tree is under 200KB (manageable for AI context window)
    Expected Result: Tree captures all elements, under 200KB
    Failure Indicators: Missing elements, tree too large for context window
    Evidence: .sisyphus/evidence/task-17-tree-size.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): integrate accessibility tree into agent loop`
  - Files: `ogre-desktop/src/lib/agent-loop.ts, ogre-desktop/src/lib/agent-dom.ts, ogre-desktop/src/lib/agent-prompt.ts`

- [ ] 18. Wire chrome-cdp-skill for External Agent Access

  **What to do**:
  - Configure Electron to also expose a CDP port via `--remote-debugging-port` for external tools
  - Write the CDP port to a discoverable file (e.g., `~/.ogre/cdp-port`) on app startup
  - Verify chrome-cdp-skill fork can discover and connect to OGRE's Electron browser:
    - `cdp.mjs list` shows the embedded browser tab(s)
    - `cdp.mjs snap <target>` returns accessibility tree
    - `cdp.mjs click <target> ".selector"` clicks elements
    - `cdp.mjs eval <target> "expression"` evaluates JS
  - Create an OpenCode skill file (`.agents/skills/ogre-browser/SKILL.md`) documenting:
    - How to discover OGRE's CDP port
    - Available commands via chrome-cdp-skill
    - Example workflows for grading automation

  **Must NOT do**:
  - Don't expose `--remote-debugging-port` on 0.0.0.0 (localhost only)
  - Don't bypass the safety patterns added in Task 11

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration between two systems (Electron + chrome-cdp-skill)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 8, 11

  **References**:

  **Pattern References**:
  - chrome-cdp-skill fork — CLI commands to verify
  - `ogre-desktop/src-tauri/src/lib.rs:1696-1720` — Current port allocation to replicate for external access

  **Acceptance Criteria**:
  - [ ] CDP port written to `~/.ogre/cdp-port` on startup
  - [ ] `cdp.mjs list` shows embedded browser targets
  - [ ] `cdp.mjs snap <target>` returns accessibility tree
  - [ ] OpenCode skill file documents the workflow

  **QA Scenarios**:

  ```
  Scenario: External agent controls embedded browser via chrome-cdp-skill
    Tool: Bash
    Preconditions: OGRE app running with page loaded, chrome-cdp-skill fork installed
    Steps:
      1. Read port from ~/.ogre/cdp-port
      2. CDP_PORT=<port> cdp.mjs list — verify shows OGRE browser tab
      3. cdp.mjs snap <target> — verify accessibility tree
      4. cdp.mjs eval <target> "document.title" — verify returns page title
      5. cdp.mjs shot <target> — verify screenshot saved
    Expected Result: All commands work, data matches embedded browser state
    Failure Indicators: 'No targets found', empty responses, connection refused
    Evidence: .sisyphus/evidence/task-18-external-access.txt
  ```

  **Commit**: YES
  - Message: `feat(external): wire chrome-cdp-skill for external agent access`
  - Files: `ogre-desktop/electron-main/main.ts, .agents/skills/ogre-browser/SKILL.md`

- [ ] 19. Set Up electron-builder for Linux + Windows

  **What to do**:
  - Install and configure `electron-builder` for multi-platform builds
  - Configure build targets:
    - Linux: AppImage, deb (match current distribution)
    - Windows: NSIS exe, MSI (match current Tauri output)
  - Configure resource bundling (grading server, icons, static assets)
  - Set up code signing configuration (placeholder for now)
  - Verify: `npm run build` produces installable packages
  - Update `.github/workflows/desktop-build.yml` for Electron (or create new workflow)

  **Must NOT do**:
  - Don't set up actual code signing keys (just the config placeholder)
  - Don't publish to GitHub releases yet

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Build configuration with multiple targets and resource bundling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 20
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/tauri.conf.json` — Current build config (icons, resources, bundle)
  - `ogre-desktop/package.json` — Current build scripts

  **External References**:
  - electron-builder docs: https://www.electron.build/

  **Acceptance Criteria**:
  - [ ] `npm run build` completes without errors
  - [ ] Linux AppImage generated and executable
  - [ ] Windows installer config present (cross-compile or CI-only)
  - [ ] Grading server bundled in resources

  **QA Scenarios**:

  ```
  Scenario: Linux build produces AppImage
    Tool: Bash
    Preconditions: All dependencies installed
    Steps:
      1. npm run build
      2. ls dist/ — find AppImage file
      3. chmod +x dist/*.AppImage && ./dist/*.AppImage --help (or launch test)
    Expected Result: AppImage exists and is executable
    Failure Indicators: Build fails, no AppImage, missing resources
    Evidence: .sisyphus/evidence/task-19-linux-build.txt
  ```

  **Commit**: YES
  - Message: `feat(build): configure electron-builder for Linux + Windows`
  - Files: `ogre-desktop/package.json, ogre-desktop/electron-builder.yml`

- [ ] 20. Port Auto-Updater (electron-updater)

  **What to do**:
  - Replace Tauri updater plugin with `electron-updater`
  - Configure GitHub releases as update source (same repo, same release pattern)
  - Port `UpdateModal.svelte` to work with electron-updater events
  - Auto-check for updates on startup (same behavior as Tauri version)
  - Handle: check → download → prompt → install flow

  **Must NOT do**:
  - Don't change the update UX
  - Don't set up a separate update server

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Auto-updater involves security, IPC, and lifecycle management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 19)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 19

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/UpdateModal.svelte` — Current update UI to keep
  - `ogre-desktop/src-tauri/tauri.conf.json:37-44` — Current updater config

  **External References**:
  - electron-updater: https://www.electron.build/auto-update

  **Acceptance Criteria**:
  - [ ] App checks for updates on startup
  - [ ] Update notification shown when new version available
  - [ ] Download progress displayed
  - [ ] Install prompt after download completes

  **QA Scenarios**:

  ```
  Scenario: Update check on startup
    Tool: Bash
    Preconditions: App configured with updater
    Steps:
      1. Launch app
      2. Check logs for update check
      3. Verify no crash on 'no update available' response
    Expected Result: Update check completes, app continues normally
    Failure Indicators: Crash, update check hangs
    Evidence: .sisyphus/evidence/task-20-updater.txt
  ```

  **Commit**: YES
  - Message: `feat(updater): port auto-updater to electron-updater`
  - Files: `ogre-desktop/electron-main/updater.ts, ogre-desktop/src/components/UpdateModal.svelte`

- [ ] 21. Port Existing Vitest Tests to Electron Context

  **What to do**:
  - Review all existing `.test.ts` files (~40+ test files)
  - Port tests that mock Tauri to mock Electron IPC instead
  - Key test areas:
    - `cdp-client.test.ts` — update for new bridge architecture
    - `cdp-actions.test.ts` — update for debugger API
    - `browser-actions.test.ts` — remove GDK test cases, simplify to CDP-only
    - `browser.test.ts` — update for Electron IPC
    - `agent-loop.test.ts` — update for accessibility tree
    - `db.test.ts` — update for better-sqlite3
  - Remove tests for deleted code (gdk-actions.test.ts)
  - Add new tests for:
    - Accessibility tree capture and formatting
    - Electron preload bridge
    - Server sidecar lifecycle

  **Must NOT do**:
  - Don't rewrite tests that still pass as-is
  - Don't add extensive new test coverage (just port + critical gaps)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large test suite update, mechanical but requires attention to mocking changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 4)
  - **Parallel Group**: Wave 5 (with Tasks 22, 23)
  - **Blocks**: None
  - **Blocked By**: Tasks 16, 17

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/*.test.ts` — All test files to review/port

  **Acceptance Criteria**:
  - [ ] `npx vitest run` passes with 0 failures
  - [ ] No test file references `@tauri-apps/*`
  - [ ] No test file references `gdk-actions`
  - [ ] Tests exist for accessibility tree formatting

  **QA Scenarios**:

  ```
  Scenario: Test suite passes
    Tool: Bash
    Preconditions: All code ported
    Steps:
      1. npx vitest run
      2. Check output for failures
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-21-test-results.txt
  ```

  **Commit**: YES
  - Message: `test: port vitest tests to Electron context`
  - Files: `ogre-desktop/src/lib/*.test.ts`

- [ ] 22. End-to-End Grading Pipeline Test

  **What to do**:
  - Run a complete grading cycle through the Electron app:
    1. Launch app, verify server starts
    2. Navigate embedded browser to MyOpenMath grading page
    3. Verify accessibility tree captures student list, score inputs, feedback areas
    4. Trigger agent loop with a grading task
    5. Verify agent can read page via accessibility tree
    6. Verify agent can fill scores via CDP
    7. Verify grading panel shows results
  - Also test external agent path:
    1. Use chrome-cdp-skill CLI to capture accessibility tree
    2. Verify tree matches what internal agent sees
  - Document any differences from Tauri version behavior

  **Must NOT do**:
  - Don't actually submit grades to a real grading site (use test/demo page)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full integration test across all systems
  - **Skills**: [`playwright`]
    - `playwright`: For browser verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (sequential — needs all other tasks complete)
  - **Blocks**: F1-F4
  - **Blocked By**: All previous tasks

  **References**:

  **Pattern References**:
  - `mock-myopenmath-30students.html` — Test grading page available in repo root
  - `ogre-desktop/src/lib/grading-pipeline.ts` — Grading pipeline to exercise
  - `ogre-desktop/src/lib/agent-loop.ts` — Agent loop to verify

  **Acceptance Criteria**:
  - [ ] Complete grading cycle works: navigate → extract → grade → fill
  - [ ] Accessibility tree captures all student elements
  - [ ] Agent correctly identifies elements by role/name
  - [ ] External chrome-cdp-skill access works simultaneously

  **QA Scenarios**:

  ```
  Scenario: Full grading pipeline
    Tool: Bash + Playwright
    Preconditions: Electron app running, grading server healthy
    Steps:
      1. Navigate to mock-myopenmath-30students.html (local file)
      2. Capture accessibility tree — verify 30 student entries visible
      3. Start grading pipeline with test rubric
      4. Verify scores filled for at least 5 students
      5. Use chrome-cdp-skill to verify scores from external agent
    Expected Result: Pipeline completes, scores filled, external access works
    Failure Indicators: Pipeline fails, wrong elements targeted, external access blocked
    Evidence: .sisyphus/evidence/task-22-e2e-grading.json
  ```

  **Commit**: YES
  - Message: `test: end-to-end grading pipeline verification`
  - Files: evidence files only

- [ ] 23. PR to Upstream chrome-cdp-skill

  **What to do**:
  - Clean up the chrome-cdp-skill fork for PR submission:
    - Squash/rebase commits into logical units
    - Update README with new commands and usage
    - Ensure all new code has JSDoc comments
    - Add test cases if upstream has them
    - Write PR description explaining the additions and motivation
  - Submit PR to `pasky/chrome-cdp-skill`
  - Respond to any review feedback

  **Must NOT do**:
  - Don't include OGRE-specific code (only general-purpose additions)
  - Don't break backward compatibility

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: PR preparation and submission
  - **Skills**: [`git-master`]
    - `git-master`: Git operations for squash/rebase

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 11, 18)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Tasks 11, 18

  **References**:

  **External References**:
  - chrome-cdp-skill contributing guidelines (if any)
  - Upstream PR template

  **Acceptance Criteria**:
  - [ ] PR submitted to pasky/chrome-cdp-skill
  - [ ] PR description clearly explains each addition
  - [ ] All existing tests still pass (if upstream has tests)
  - [ ] No OGRE-specific code in PR

  **QA Scenarios**:

  ```
  Scenario: PR passes upstream CI
    Tool: Bash
    Preconditions: Fork cleaned up, PR created
    Steps:
      1. gh pr create --repo pasky/chrome-cdp-skill
      2. Check CI status
      3. Verify PR description includes motivation and usage examples
    Expected Result: PR created, CI passes (or no CI configured)
    Failure Indicators: CI fails, PR rejected automatically
    Evidence: .sisyphus/evidence/task-23-pr-url.txt
  ```

  **Commit**: NO (PR in upstream repo)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, launch app, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run linter + `vitest run`. Review all changed/new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check for `nodeIntegration: true` or `contextIsolation: false` (forbidden). Check for GDK imports (should be eliminated). Verify no html2canvas references remain.
  Output: `Lint [PASS/FAIL] | Tests [N pass/N fail] | Forbidden Patterns [N found] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Launch app from clean state on Linux. Navigate to MyOpenMath. Verify login, page load, grading panel. Run accessibility tree capture. Execute a grading cycle. Test chrome-cdp-skill CLI against embedded browser. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect any agent improvements that went beyond pure port. Flag GDK code that wasn't removed.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1**: `spike(electron): validate CDP + accessibility tree + native modules`
- **T2**: `chore(fork): fork chrome-cdp-skill repo`
- **T3**: `feat(electron): scaffold main process, preload bridge, renderer`
- **T4**: `feat(electron): port SQLite database layer to better-sqlite3`
- **T5**: `feat(electron): port grading server sidecar to child_process`
- **T6**: `feat(electron): port BrowserView creation and management`
- **T7**: `feat(electron): port window management and tab system`
- **T8**: `feat(electron): integrate webContents.debugger CDP`
- **T9**: `feat(electron): port autofill injection`
- **T10**: `feat(electron): port OAuth callback flow`
- **T11**: `feat(chrome-cdp): merge OGRE safety, CodeMirror, popup, fuzzy matching`
- **T12**: `feat(cdp): add accessibility tree snapshots`
- **T13**: `refactor(frontend): replace Tauri invoke() with Electron IPC`
- **T14**: `feat(electron): port Browser.svelte to BrowserView`
- **T15**: `feat(electron): port Dashboard, Settings, History pages`
- **T16**: `refactor(agent): simplify browser-actions to CDP-only`
- **T17**: `feat(agent): integrate accessibility tree into agent loop`
- **T18**: `feat(external): wire chrome-cdp-skill for external agent access`
- **T19**: `feat(build): configure electron-builder for Linux + Windows`
- **T20**: `feat(updater): port auto-updater to electron-updater`
- **T21**: `test: port vitest tests to Electron context`
- **T22**: `test: end-to-end grading pipeline verification`
- **T23**: `chore(upstream): prepare PR to pasky/chrome-cdp-skill`

---

## Success Criteria

### Verification Commands
```bash
# App launches on Linux
npm run dev                          # Expected: Electron window opens, no crashes

# Accessibility tree works
cdp.mjs snap <target>                # Expected: semantic tree with roles, names, locators

# Agent actions work via CDP
cdp.mjs click <target> ".selector"   # Expected: element clicked
cdp.mjs eval <target> "document.title" # Expected: page title returned

# Grading server runs
curl http://localhost:3456/health     # Expected: {"status":"ok"}

# Build produces installers
npm run build                         # Expected: .AppImage (Linux) and .exe (Windows) in dist/

# Tests pass
npx vitest run                        # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Embedded browser uses Chromium on Linux (not WebKitGTK)
- [ ] Accessibility tree captures work in agent loop
- [ ] chrome-cdp-skill fork has all OGRE enhancements
- [ ] No GDK actions code remains
- [ ] No html2canvas references remain
- [ ] contextIsolation is true in all BrowserWindows
- [ ] PR to upstream chrome-cdp-skill is ready
