# O.G.R.E Desktop GUI Wrapper (Tauri 2.0)

## TL;DR

> **Quick Summary**: Build a Tauri 2.0 desktop application that wraps the existing O.G.R.E grading server as a sidecar binary, giving non-technical teachers a GUI with provider configuration, health monitoring, log viewing, grading history, and system tray operation — all without touching a command line.
> 
> **Deliverables**:
> - `ogre-desktop/` — Full Tauri 2.0 project with Svelte frontend
> - Sidecar integration with grading-server binary (auto-start/stop, stdout streaming)
> - Setup wizard for multi-provider API key configuration
> - Dashboard with health indicators (server + provider connectivity)
> - Real-time log viewer (sidecar stdout/stderr)
> - Grading history table (SQLite backed, togglable columns)
> - System tray with minimize-to-tray behavior
> - Auto-update from GitHub Releases
> - Windows NSIS installer (.exe) for v1; macOS DMG (v2)
> 
> **Estimated Effort**: Large (~15 tasks, multi-day)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 5 → Tasks 6-10 (parallel) → Tasks 11-13 → Task 14-15

---

## Context

### Original Request
Build a desktop wrapper GUI for the O.G.R.E grading server so non-technical teachers can use batch AI grading without command-line knowledge. Framework: Tauri 2.0 (selected over Electron and Wails in prior session).

### Interview Summary
**Key Discussions**:
- **Framework**: Tauri 2.0 — small bundle (4-12 MB), native sidecar support, official plugins for SQLite/tray/updater
- **Provider config**: Full multi-provider section (Ollama Cloud/Local, OpenAI, Anthropic, Gemini, GitHub Models) — NOT just Ollama auto-detect
- **Grading history**: ALL fields with user-togglable column visibility (timestamp, provider, model, student count, mean/min/max/median, page URL, per-student detail, custom instructions)
- **Health indicators**: Both server + active provider health (green/yellow/red)
- **Tray menu**: Open Dashboard, Server Status indicator, Settings, View Logs, Quit
- **Settings**: Local only — no cloud sync
- **Distribution**: Windows installer + portable for v1; macOS in v2
- **Server lifecycle**: Automatic — starts with app, stops on exit

**Research Findings**:
- Tauri sidecar: `bundle.externalBin` config, `Command.sidecar()` JS API with stdout/stderr event streaming
- SQLite: `tauri-plugin-sql` with Rust-side migrations, `$1/$2/$3` param syntax
- System tray: `TrayIconBuilder` in Rust, `on_menu_event` + `on_tray_icon_event`
- Auto-update: `tauri-plugin-updater` + GitHub Releases `latest.json` + signing
- Grading server API: `POST /grade` (batch), `GET /health` — Hono on port 3456

### Metis Review
**Identified Gaps** (addressed):
- **Server lacks GitHub Models**: Server's providers.js only has 4 adapters; extension has 6. Scoped out of v1 — server stays as-is.
- **Frontend framework unspecified**: Locked to **Svelte** (lightweight, Tauri ecosystem standard, no over-engineering).
- **OAuth in desktop app**: Deferred to v2. Desktop app uses API keys only — OAuth requires Chrome extension ID redirects.
- **110MB sidecar binary in git**: `.gitignore` the binary; build from source during `tauri build` or CI. Do NOT commit.
- **Per-student drill-down**: Deferred to v2. v1 history is summary-level table.
- **macOS distribution**: Deferred to v2. v1 = Windows only. macOS requires Apple Developer cert for signing.
- **Port conflicts**: Server already handles EADDRINUSE; desktop app shows error dialog if port taken.
- **Model list fetching in settings**: Deferred to v2. Teacher types model name manually in v1.

---

## Work Objectives

### Core Objective
Create a Tauri 2.0 desktop application in `ogre-desktop/` that launches the grading server as a sidecar binary, manages its lifecycle, provides provider configuration storage, health monitoring, log streaming, grading history tracking, and system tray operation — enabling non-technical teachers to use the O.G.R.E grading system without any command-line interaction.

### Concrete Deliverables
- `ogre-desktop/` directory with complete Tauri project
- `ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe` (build output, gitignored)
- `ogre-desktop/src/` Svelte frontend with: Dashboard, Setup Wizard, Settings, Log Viewer, History pages
- `ogre-desktop/src-tauri/src/` Rust backend with: sidecar management, system tray, SQLite migrations
- Windows installer (.msi) build configuration
- GitHub Actions workflow for CI/CD build + release

### Definition of Done
- [ ] `npx tauri build` produces a working Windows installer
- [ ] Launching the installer/app starts the grading server sidecar automatically
- [ ] `curl http://localhost:3456/health` returns `{"status":"ok"}` while app is running
- [ ] Chrome extension detects running server and uses it for batch grading
- [ ] Closing the app stops the sidecar (port 3456 becomes free)
- [ ] Provider API keys persist across app restarts (SQLite)
- [ ] Grading history records are created after each batch session
- [ ] System tray icon visible; "Quit" terminates server + app

### Must Have
- Sidecar auto-start/stop tied to app lifecycle
- Provider configuration form (Ollama, OpenAI, Anthropic, Gemini) with persistent storage
- Health indicators for server and active provider
- Real-time log viewer (stdout/stderr from sidecar)
- Grading session history table (summary level)
- System tray with minimize-to-tray
- "Press any key to close" error handling (inherited from server)

### Must NOT Have (Guardrails)
- **No OAuth flows** — API keys only in v1 (OAuth requires Chrome extension redirect URIs)
- **No per-student drill-down** in history — summary table only (v2)
- **No charts/graphs** — HTML table with column sorting only (v2)
- **No model list fetching** from providers — teacher types model name (v2)
- **No dark mode** — single light theme (v2)
- **No macOS build** — Windows only in v1 (v2)
- **No GitHub Models** in server — server stays 4 providers, extension handles 6 (v2)
- **Minimal server code changes** — restore and bundle as-is, with ONE permitted addition: `POST /session` endpoint for history recording (Task 11). No other server.js/grading.js/providers.js changes.
- **No custom installer UI** — Tauri default NSIS installer
- **No telemetry/analytics** — completely local
- **No cloud settings sync** — local SQLite only
- **110MB sidecar binary NOT committed to git** — build from source or download in CI

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> FORBIDDEN: "User manually tests...", "User visually confirms...", "Ask user to verify..."
> ALL verification is executed by the agent using tools (Playwright, Bash, curl, etc.).

### Test Decision
- **Infrastructure exists**: YES (Vitest in root project; Tauri project will use Vitest for frontend + `cargo test` for Rust)
- **Automated tests**: YES (tests-after) — write tests after implementation for both Rust and Svelte components
- **Framework**: Vitest (frontend) + cargo test (Rust backend)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Sidecar/Server** | Bash (curl) | Start app → curl health endpoint → verify JSON response |
| **Frontend UI** | Playwright (playwright skill) | Navigate webview pages, fill forms, assert DOM elements |
| **Rust backend** | Bash (cargo test) | Run unit tests, verify compilation |
| **SQLite** | Bash (sqlite3 CLI or curl + API) | Query database, verify schema and records |
| **System tray** | interactive_bash (tmux) + screenshot | Launch app, verify tray icon presence, test menu |
| **Build/Distribution** | Bash (file inspection) | Verify .msi exists, check file size, test install |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Restore grading server code from git history
└── Task 2: Scaffold Tauri 2.0 project (ogre-desktop/)

Wave 2 (After Wave 1):
├── Task 3: Sidecar integration (spawn/kill grading server)
└── Task 4: SQLite schema + migrations (provider config + history tables)

Wave 3 (After Wave 2):
├── Task 5: Dashboard shell + health indicators
├── Task 6: Setup wizard UI (first-run provider config)
├── Task 7: Settings page (edit provider config)
├── Task 8: Log viewer (sidecar stdout/stderr streaming)
├── Task 9: Grading history table + SQLite CRUD
└── Task 10: System tray integration

Wave 4 (After Wave 3):
├── Task 11: Extension integration (pass stored API keys to server)
├── Task 12: Auto-updater setup
├── Task 13: End-to-end integration tests
├── Task 14: Build configuration + Windows installer
└── Task 15: CI/CD workflow for GitHub Actions
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 11 | 2 |
| 2 | None | 3, 4, 5, 6, 7, 8, 9, 10 | 1 |
| 3 | 1, 2 | 5, 8, 10, 11, 13 | 4 |
| 4 | 2 | 5, 6, 7, 9, 11 | 3 |
| 5 | 3, 4 | 13 | 6, 7, 8, 9, 10 |
| 6 | 4 | 13 | 5, 7, 8, 9, 10 |
| 7 | 4 | 13 | 5, 6, 8, 9, 10 |
| 8 | 3 | 13 | 5, 6, 7, 9, 10 |
| 9 | 4 | 13 | 5, 6, 7, 8, 10 |
| 10 | 3 | 13 | 5, 6, 7, 8, 9 |
| 11 | 3, 4 | 13 | 12 |
| 12 | 2 | 14 | 11 |
| 13 | 5, 6, 7, 8, 9, 10, 11 | 14 | None |
| 14 | 13 | 15 | None |
| 15 | 14 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | task(category="quick") + task(category="unspecified-high") |
| 2 | 3, 4 | task(category="deep") for sidecar, task(category="unspecified-high") for SQLite |
| 3 | 5-10 | task(category="visual-engineering") for UI tasks, task(category="deep") for tray |
| 4 | 11-15 | task(category="deep") for integration, task(category="unspecified-high") for CI |

---

## TODOs

- [x] 1. Restore Grading Server Code from Git History

  **What to do**:
  - Cherry-pick commits `dbfdf9d`, `afb4b40`, `a4c6d24`, `7dd98d4`, `15ea7ee` onto the `desktop` branch (in order)
  - If cherry-pick conflicts, manually restore files from `git show 15ea7ee:grading-server/<file>` for: `server.js`, `grading.js`, `providers.js`, `schemas.md`, `package.json`, `bun.lock`, `tsconfig.json`, `.gitignore`, `test/grading.test.js`, `test/providers.test.js`
  - Pop the stash (`git stash pop`) to recover the rebuilt .exe (if needed for reference, but we'll rebuild anyway)
  - Verify the server compiles and runs: `cd grading-server && bun install && bun run server.js`
  - Verify tests pass: `cd grading-server && bun test`
  - Add `grading-server/dist/` to root `.gitignore` (do NOT commit binaries)

  **Must NOT do**:
  - Do NOT modify server.js, grading.js, or providers.js code in THIS task (Task 11 handles the one permitted server change: adding POST /session)
  - Do NOT add GitHub Models adapter (v2)
  - Do NOT commit the ~110MB .exe binary

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Git operations are mechanical — cherry-pick or file restoration from known commits
  - **Skills**: [`git-master`]
    - `git-master`: Expert git operations for cherry-pick, stash management, conflict resolution

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 11
  - **Blocked By**: None

  **References**:
  
  **Pattern References**:
  - Git commit `afb4b40` — Original grading server implementation (server.js, grading.js, providers.js, tests)
  - Git commit `15ea7ee` — Latest server code with error handling (waitForKeypress, showError, EADDRINUSE)
  - Git commit `a4c6d24` — Cross-platform executable builds (bun build --compile)

  **Documentation References**:
  - `grading-server/schemas.md` (in git at `dbfdf9d`) — Wire format JSON schemas for the API

  **Acceptance Criteria**:

  - [ ] `grading-server/server.js` exists and matches content from commit `15ea7ee`
  - [ ] `grading-server/grading.js` exists with scoring anchors, outlier detection, chunking logic
  - [ ] `grading-server/providers.js` exists with 4 provider adapters (Ollama, OpenAI, Anthropic, Gemini)
  - [ ] `grading-server/test/grading.test.js` and `test/providers.test.js` exist

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Grading server compiles and serves health endpoint
    Tool: Bash
    Preconditions: Bun installed, grading-server/ directory restored
    Steps:
      1. cd grading-server && bun install
      2. bun run server.js & (background)
      3. sleep 2
      4. curl -s http://localhost:3456/health
      5. Assert: response contains {"status":"ok"}
      6. kill %1 (stop background server)
    Expected Result: Server starts on port 3456 and responds to health check
    Evidence: curl output captured

  Scenario: All grading server tests pass
    Tool: Bash
    Preconditions: grading-server/ restored, dependencies installed
    Steps:
      1. cd grading-server && bun test
      2. Assert: exit code 0
      3. Assert: output contains "pass" and no "fail"
    Expected Result: All tests pass (previously 72/72)
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat: restore grading server code from git history`
  - Files: `grading-server/*`, `.gitignore`
  - Pre-commit: `cd grading-server && bun test`

---

- [x] 2. Scaffold Tauri 2.0 Project with Svelte

  **What to do**:
  - Create `ogre-desktop/` directory at repo root
  - Initialize Tauri 2.0 project with Svelte frontend: `npm create tauri-app@latest ogre-desktop -- --template svelte-ts`
  - Or manually: scaffold Vite + Svelte in `ogre-desktop/`, then `npx tauri init` inside it
  - Configure `ogre-desktop/src-tauri/tauri.conf.json`:
    - `productName`: "O.G.R.E Desktop"
    - `identifier`: "com.ogre.desktop"
    - `bundle.externalBin`: `["binaries/grading-server"]`
    - Window title: "O.G.R.E - Grading Server Manager"
    - Default window size: 900x650
  - Add Tauri plugins to `src-tauri/Cargo.toml`:
    - `tauri-plugin-shell` (for sidecar)
    - `tauri-plugin-sql` with `features = ["sqlite"]`
    - `tauri` with `features = ["tray-icon"]`
  - Install JS plugin packages: `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-sql`
  - Create `ogre-desktop/src-tauri/binaries/` directory with `.gitkeep`
  - Add `ogre-desktop/src-tauri/binaries/*.exe` to `.gitignore`
  - Verify: `cd ogre-desktop && npm run tauri dev` opens a window (even if blank)

  **Must NOT do**:
  - Do NOT use React, Vue, or Angular — Svelte only
  - Do NOT add complex routing yet — just verify scaffold compiles
  - Do NOT install auto-updater plugin yet (Task 12)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Project scaffolding with specific configuration requirements, multiple plugins, and build verification
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Svelte project structure and frontend scaffolding expertise

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8, 9, 10
  - **Blocked By**: None

  **References**:

  **External References**:
  - Tauri 2.0 create project: https://v2.tauri.app/start/create-project/
  - Tauri sidecar docs: https://v2.tauri.app/develop/sidecar/
  - Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
  - Tauri system tray: https://v2.tauri.app/learn/system-tray/

  **Acceptance Criteria**:

  - [ ] `ogre-desktop/` directory exists with Svelte + Tauri structure
  - [ ] `ogre-desktop/src-tauri/tauri.conf.json` has correct `productName`, `identifier`, `bundle.externalBin`
  - [ ] `ogre-desktop/src-tauri/Cargo.toml` includes `tauri-plugin-shell`, `tauri-plugin-sql`
  - [ ] `ogre-desktop/package.json` includes `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-sql`

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Tauri project compiles successfully
    Tool: Bash
    Preconditions: Rust toolchain installed, Node.js available
    Steps:
      1. cd ogre-desktop && npm install
      2. cd src-tauri && cargo check
      3. Assert: exit code 0 (no compilation errors)
    Expected Result: Rust backend compiles with all plugins
    Evidence: cargo check output captured

  Scenario: Frontend dev server starts
    Tool: Bash
    Preconditions: npm install completed
    Steps:
      1. cd ogre-desktop && npm run dev &
      2. sleep 5
      3. curl -s http://localhost:5173
      4. Assert: HTML response received (Svelte app)
      5. kill %1
    Expected Result: Vite dev server serves Svelte app
    Evidence: curl output captured
  ```

  **Commit**: YES
  - Message: `feat(desktop): scaffold Tauri 2.0 project with Svelte frontend`
  - Files: `ogre-desktop/*`
  - Pre-commit: `cd ogre-desktop/src-tauri && cargo check`

---

- [ ] 3. Sidecar Integration — Spawn/Kill Grading Server

  **What to do**:
  - Build the grading server sidecar binary:
    - `cd grading-server && bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`
  - In `ogre-desktop/src-tauri/src/lib.rs`:
    - On app `setup`, spawn sidecar using `app.shell().sidecar("binaries/grading-server")`
    - Capture stdout/stderr via `CommandEvent::Stdout` / `CommandEvent::Stderr`
    - Emit events to frontend: `app.emit("server-log", line)` and `app.emit("server-status", status)`
    - Store `child` handle in `app.manage()` state for later kill
  - On app exit/close:
    - Kill the sidecar child process via `child.kill()`
    - Verify port 3456 is freed
  - In Svelte frontend (`src/lib/server.ts`):
    - Create `listenServerLogs()` function using `listen('server-log', callback)`
    - Create `listenServerStatus()` function using `listen('server-status', callback)`
  - Handle sidecar crash: detect `CommandEvent::Terminated` or close event → emit `server-status: crashed` → attempt auto-restart (max 3 times)
  - **Sidecar Naming Convention** (CRITICAL — must be consistent everywhere):
    - Disk file: `ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`
    - `tauri.conf.json` → `bundle.externalBin`: `["binaries/grading-server"]` (base path without target triple or extension — Tauri resolves the triple automatically)
    - Rust spawn: `app.shell().sidecar("binaries/grading-server")` (same base path as externalBin)
    - JS spawn (if used): `Command.sidecar("binaries/grading-server")`
    - Permissions in `capabilities/default.json`: `{ "identifier": "shell:allow-spawn", "allow": [{ "name": "binaries/grading-server", "sidecar": true }] }`
    - All three locations use the SAME string `"binaries/grading-server"` — Tauri appends the target triple and `.exe` suffix automatically when resolving the disk file
  - Configure `ogre-desktop/src-tauri/capabilities/default.json` to include shell permissions:
    ```json
    { "identifier": "shell:allow-spawn", "allow": [{ "name": "binaries/grading-server", "sidecar": true }] }
    ```

  **Must NOT do**:
  - Do NOT modify server.js code in THIS task (Task 11 handles the one permitted server change: adding POST /session)
  - Do NOT add stdin communication to sidecar (not needed — server uses HTTP)
  - Do NOT make port configurable in v1 (hardcoded 3456)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Rust + TypeScript integration with process lifecycle management, event emission, crash recovery — requires deep understanding of Tauri internals
  - **Skills**: []
    - No special skills needed — pure Tauri API work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Tasks 5, 8, 10, 11, 13
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `grading-server/server.js:283-339` (from git `15ea7ee`) — Server startup with event-based `serve()` and error handling
  - Tauri sidecar spawn pattern from librarian research — `app.shell().sidecar()` with `CommandEvent` matching

  **External References**:
  - Tauri sidecar docs: https://v2.tauri.app/develop/sidecar/
  - Tauri shell plugin permissions: https://v2.tauri.app/plugin/shell/

  **Acceptance Criteria**:

  - [ ] Sidecar binary exists at `ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`
  - [ ] `lib.rs` spawns sidecar on `setup` and kills on exit
  - [ ] Frontend receives `server-log` events when sidecar writes to stdout
  - [ ] Frontend receives `server-status` events (running/stopped/crashed)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Sidecar starts with app and serves health endpoint
    Tool: Bash (curl)
    Preconditions: Tauri app built, grading-server binary in binaries/
    Steps:
      1. cd ogre-desktop && npm run tauri dev &
      2. sleep 10 (wait for Rust compilation + sidecar startup)
      3. curl -s http://localhost:3456/health
      4. Assert: response is {"status":"ok"}
      5. Close the Tauri window (kill the dev process)
      6. sleep 2
      7. curl -s http://localhost:3456/health 2>&1
      8. Assert: connection refused (sidecar stopped)
    Expected Result: Server is available when app is running, unavailable when app closes
    Evidence: curl outputs captured for both states
  ```

  **Commit**: YES
  - Message: `feat(desktop): integrate grading server as Tauri sidecar`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`, `ogre-desktop/src-tauri/capabilities/*`, `ogre-desktop/src/lib/server.ts`
  - Pre-commit: `cd ogre-desktop/src-tauri && cargo check`

---

- [ ] 4. SQLite Schema + Migrations (Provider Config + History)

  **What to do**:
  - Define SQLite migrations in `ogre-desktop/src-tauri/src/lib.rs` (or separate `migrations.rs`):
    - **Migration 1**: `provider_configs` table
      ```sql
      CREATE TABLE provider_configs (
        id TEXT PRIMARY KEY,           -- e.g. 'ollama-cloud', 'openai', 'anthropic', 'google-gemini'
        api_url TEXT,
        api_key TEXT,
        model TEXT,
        is_active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      ```
    - **Migration 2**: `grading_sessions` table
      ```sql
      CREATE TABLE grading_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        student_count INTEGER NOT NULL,
        mean_score REAL,
        min_score REAL,
        max_score REAL,
        median_score REAL,
        max_possible_score REAL,
        page_url TEXT,
        question_id TEXT,
        custom_instructions TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      ```
    - **Migration 3**: `app_settings` table
      ```sql
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      -- Insert defaults:
      INSERT INTO app_settings (key, value) VALUES ('setup_complete', 'false');
      INSERT INTO app_settings (key, value) VALUES ('history_visible_columns', '["timestamp","provider","model","studentCount","meanScore","pageUrl"]');
      ```
  - Register migrations with `tauri_plugin_sql::Builder::default().add_migrations("sqlite:ogre.db", migrations)`
  - In Svelte frontend, create `src/lib/db.ts`:
    - `initDB()` — `Database.load('sqlite:ogre.db')`
    - `getProviderConfigs()` — SELECT all providers
    - `saveProviderConfig(provider)` — INSERT OR REPLACE
    - `getGradingSessions(limit, offset)` — SELECT with pagination
    - `insertGradingSession(session)` — INSERT new session
    - `getSetting(key)` / `setSetting(key, value)` — app settings CRUD
  - Enable WAL mode for crash safety: `PRAGMA journal_mode=WAL;` in first migration

  **Must NOT do**:
  - Do NOT create a `grading_results` table with per-student rows (v2 drill-down)
  - Do NOT add foreign key constraints between sessions and providers (keep it simple)
  - Do NOT encrypt API keys in v1 (SQLite is local-only; encryption is v2)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Rust migration definitions + TypeScript data layer — straightforward but multi-file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Tasks 5, 6, 7, 9, 11
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `providers.js:68-77` (root) — Provider config fields for Ollama Cloud: `apiUrl`, `apiKey`
  - `providers.js:199-201` (root) — OpenAI config: just `apiKey`
  - `providers.js:354-357` (root) — Anthropic config: just `apiKey`
  - `providers.js:452-457` (root) — Gemini config: `apiKey` (no OAuth in desktop v1)
  - `batch-grader.js:388` — Graded result shape: `{ name, index, score, feedback }`

  **External References**:
  - Tauri SQL plugin docs: https://v2.tauri.app/plugin/sql/
  - SQLite WAL mode: https://www.sqlite.org/wal.html

  **Acceptance Criteria**:

  - [ ] Migrations defined in Rust with 3 tables: `provider_configs`, `grading_sessions`, `app_settings`
  - [ ] `db.ts` exports CRUD functions for providers, sessions, and settings
  - [ ] WAL mode enabled

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Database initializes with correct schema
    Tool: Bash
    Preconditions: Tauri app has been launched at least once
    Steps:
      1. Find SQLite DB file in %APPDATA%/com.ogre.desktop/ (or Tauri app data dir)
      2. sqlite3 <db-path> ".tables"
      3. Assert: output contains "provider_configs", "grading_sessions", "app_settings"
      4. sqlite3 <db-path> "SELECT value FROM app_settings WHERE key='setup_complete'"
      5. Assert: result is "false"
    Expected Result: All 3 tables exist, defaults populated
    Evidence: sqlite3 output captured
  ```

  **Commit**: YES
  - Message: `feat(desktop): add SQLite schema with provider config and history tables`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`, `ogre-desktop/src/lib/db.ts`
  - Pre-commit: `cd ogre-desktop/src-tauri && cargo check`

---

- [ ] 5. Dashboard Shell + Health Indicators

  **What to do**:
  - Create `ogre-desktop/src/routes/` with Svelte page routing (svelte-spa-router or simple conditional rendering)
  - Create Dashboard page (`src/pages/Dashboard.svelte`) as the main/default view:
    - **Header**: "O.G.R.E Desktop" with version number
    - **Health Indicators Section**:
      - "Server" indicator: green circle + "Running" / red circle + "Stopped" / yellow circle + "Starting..."
      - "Provider" indicator: green circle + "Connected (OpenAI)" / red circle + "Not Configured" / yellow + "Checking..."
    - **Quick Stats** (from SQLite): Total sessions graded, total students graded, last session timestamp
    - **Navigation**: Sidebar or tab bar with links to: Dashboard, History, Logs, Settings
  - Server health check: Poll `http://localhost:3456/health` every 5 seconds from frontend
  - Provider health check: On dashboard load, read active provider from SQLite → attempt test connection via the sidecar server (or just verify API key is stored)
  - Create shared layout component (`src/App.svelte`) with navigation sidebar

  **Must NOT do**:
  - Do NOT add charts or graphs — text stats only
  - Do NOT add real-time grading progress (the extension handles that)
  - Do NOT fetch model lists from providers

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Primary UI layout and component design, health indicator styling, navigation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dashboard layout design, health indicator UX, responsive styling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6-10)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `sidepanel.js:1-20` — Provider IDs and configuration patterns used in the extension
  - `providers.js:575-582` (root) — PROVIDERS registry object with all provider IDs

  **Acceptance Criteria**:

  - [ ] Dashboard page renders with header, health indicators, quick stats, and navigation
  - [ ] Server health indicator updates based on `http://localhost:3456/health` poll
  - [ ] Provider indicator shows "Not Configured" when no providers are in SQLite
  - [ ] Navigation links work between Dashboard, History, Logs, Settings

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Dashboard shows server health as running
    Tool: Playwright (playwright skill)
    Preconditions: Tauri dev server running with sidecar active
    Steps:
      1. Navigate to http://localhost:5173 (Vite dev server for Tauri frontend)
      2. Wait for: .health-indicator.server visible (timeout: 10s)
      3. Assert: .health-indicator.server contains text "Running"
      4. Assert: .health-indicator.server has green indicator (class 'status-ok' or similar)
      5. Screenshot: .sisyphus/evidence/task-5-dashboard-health.png
    Expected Result: Dashboard shows green server health indicator
    Evidence: .sisyphus/evidence/task-5-dashboard-health.png

  Scenario: Dashboard shows provider as not configured
    Tool: Playwright (playwright skill)
    Preconditions: Fresh app, no providers in SQLite
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for: .health-indicator.provider visible (timeout: 10s)
      3. Assert: .health-indicator.provider contains text "Not Configured"
      4. Screenshot: .sisyphus/evidence/task-5-dashboard-no-provider.png
    Expected Result: Provider indicator shows not configured state
    Evidence: .sisyphus/evidence/task-5-dashboard-no-provider.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): add dashboard with health indicators and navigation`
  - Files: `ogre-desktop/src/pages/Dashboard.svelte`, `ogre-desktop/src/App.svelte`, `ogre-desktop/src/lib/health.ts`

---

- [ ] 6. Setup Wizard (First-Run Provider Configuration)

  **What to do**:
  - Create `src/pages/SetupWizard.svelte` — multi-step wizard shown on first launch
  - Step detection: Read `setup_complete` from `app_settings`; if `false`, redirect to wizard
  - **Step 1: Welcome** — "Welcome to O.G.R.E! Let's configure your AI provider."
  - **Step 2: Provider Selection** — Show cards for each provider:
    - Ollama Cloud: API URL + API Key fields
    - Ollama Local: API URL field (default: http://localhost:11434), auto-detect button that probes the URL
    - OpenAI: API Key field (sk-...)
    - Anthropic (Claude): API Key field (sk-ant-...)
    - Google Gemini: API Key field (AIza...)
    - Allow configuring multiple providers (check which ones to enable)
  - **Step 3: Model** — Text input for model name per provider (user types, no fetch)
  - **Step 4: Confirm** — Summary of configured providers, "Save & Start" button
  - On save: Insert provider configs into SQLite, set `setup_complete = 'true'`
  - Auto-detect Ollama: Probe `http://localhost:11434/api/tags` — if responds, show green checkmark and pre-fill

  **Must NOT do**:
  - Do NOT add OAuth sign-in buttons (v2)
  - Do NOT fetch model lists from provider APIs (v2) — user types model name
  - Do NOT add provider test connection in wizard (settings page handles that)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Multi-step wizard UX with form validation, provider cards, auto-detect animation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Wizard flow design, form UX for non-technical users

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5, 7-10)
  - **Blocks**: Task 13
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `providers.js:68-77` — Ollama Cloud config fields: `apiUrl` (text, required), `apiKey` (password, required)
  - `providers.js:138-141` — Ollama Local config: `apiUrl` (text, optional, default localhost:11434)
  - `providers.js:199-201` — OpenAI: `apiKey` (password, required, placeholder 'sk-...')
  - `providers.js:354-357` — Anthropic: `apiKey` (password, required, placeholder 'sk-ant-...')
  - `providers.js:452-456` — Gemini: `apiKey` (password, required, placeholder 'AIza...')
  - `sidepanel.js:13-20` — PROVIDER_KEY_URLS — setup URLs for "Get API Key" links

  **Acceptance Criteria**:

  - [ ] Wizard appears on first launch (setup_complete = false)
  - [ ] Wizard does NOT appear after completion (setup_complete = true)
  - [ ] Each provider has correct form fields matching providers.js config
  - [ ] Provider configs saved to SQLite after wizard completion

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Setup wizard appears on first launch and saves config
    Tool: Playwright (playwright skill)
    Preconditions: Fresh app with empty SQLite database
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for: .setup-wizard visible (timeout: 10s)
      3. Assert: Step 1 "Welcome" text visible
      4. Click: Next button
      5. Wait for: Step 2 provider selection visible
      6. Fill: OpenAI API key field with "sk-test-key-12345"
      7. Click: Next button
      8. Fill: Model name with "gpt-4o"
      9. Click: Next button
      10. Assert: Summary shows "OpenAI" with model "gpt-4o"
      11. Click: "Save & Start"
      12. Wait for: Dashboard visible (wizard dismissed)
      13. Screenshot: .sisyphus/evidence/task-6-wizard-complete.png
    Expected Result: Wizard completes, saves config, redirects to dashboard
    Evidence: .sisyphus/evidence/task-6-wizard-complete.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): add first-run setup wizard for provider configuration`
  - Files: `ogre-desktop/src/pages/SetupWizard.svelte`, `ogre-desktop/src/lib/wizard.ts`

---

- [ ] 7. Settings Page (Edit Provider Config)

  **What to do**:
  - Create `src/pages/Settings.svelte` — editable provider configuration
  - Provider cards (one per configured provider):
    - Show current values (API URL, API Key masked, model)
    - Edit button to toggle inline editing
    - "Test Connection" button per provider: sends a minimal request through the sidecar (POST /grade with 1 dummy student) or calls health endpoint with provider info
    - Delete/remove provider button
  - "Add Provider" button to add new providers (same form as wizard Step 2)
  - Set active provider (radio button or toggle)
  - All changes persist to SQLite immediately on save
  - History column visibility toggle:
    - Read `history_visible_columns` from app_settings
    - Checkbox list of all available columns
    - Save selection to app_settings

  **Must NOT do**:
  - Do NOT add import/export settings
  - Do NOT add provider profiles or presets
  - Do NOT add API key encryption (v2)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CRUD forms with inline editing, test connection UX, toggle controls
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5, 6, 8-10)
  - **Blocks**: Task 13
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `providers.js:575-582` (root) — PROVIDERS registry with all provider IDs and adapters
  - `sidepanel.js:13-20` — PROVIDER_KEY_URLS with links for each provider's API key page

  **Acceptance Criteria**:

  - [ ] Settings page lists all configured providers from SQLite
  - [ ] Can edit API key and model for existing providers
  - [ ] Can add new providers
  - [ ] Can delete providers
  - [ ] Column visibility toggles persist across page navigation

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Edit existing provider API key
    Tool: Playwright (playwright skill)
    Preconditions: At least one provider configured in SQLite
    Steps:
      1. Navigate to Settings page
      2. Click Edit on the first provider card
      3. Clear API Key field, type "sk-new-key-67890"
      4. Click Save
      5. Refresh page
      6. Assert: API Key field shows masked value (not empty)
      7. Screenshot: .sisyphus/evidence/task-7-settings-edit.png
    Expected Result: Updated API key persists after refresh
    Evidence: .sisyphus/evidence/task-7-settings-edit.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): add settings page with provider config editing`
  - Files: `ogre-desktop/src/pages/Settings.svelte`

---

- [ ] 8. Log Viewer (Sidecar stdout/stderr Streaming)

  **What to do**:
  - Create `src/pages/Logs.svelte` — real-time scrolling log display
  - Subscribe to `server-log` events (emitted by Rust sidecar handler from Task 3)
  - Display logs in a scrollable `<pre>` container with auto-scroll to bottom
  - Each log line: `[HH:MM:SS] <message>`
  - Color coding: stdout in white/default, stderr in red/orange
  - "Clear" button to reset the log view (does not affect actual logs)
  - "Auto-scroll" toggle (on by default) — stops auto-scrolling if user scrolls up
  - Retain last 1000 lines in memory (ring buffer)

  **Must NOT do**:
  - Do NOT add log search/filtering (v2)
  - Do NOT persist logs to disk (v2)
  - Do NOT add log level parsing (v2)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Real-time streaming UI with auto-scroll behavior, color coding
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5-7, 9-10)
  - **Blocks**: Task 13
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - Task 3's `server-log` event — the event shape emitted from Rust sidecar handler

  **Acceptance Criteria**:

  - [ ] Log viewer receives and displays sidecar stdout in real-time
  - [ ] stderr lines appear with distinct (red) styling
  - [ ] Auto-scroll keeps bottom visible as new logs arrive
  - [ ] Clear button empties the display
  - [ ] Only last 1000 lines retained in memory

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Log viewer shows server startup messages
    Tool: Playwright (playwright skill)
    Preconditions: Tauri app running with sidecar
    Steps:
      1. Navigate to Logs page
      2. Wait for: .log-container visible (timeout: 5s)
      3. Assert: log container contains "Grading server listening on" or similar startup text
      4. Screenshot: .sisyphus/evidence/task-8-logs-startup.png
    Expected Result: Server startup messages visible in log viewer
    Evidence: .sisyphus/evidence/task-8-logs-startup.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): add real-time log viewer for sidecar output`
  - Files: `ogre-desktop/src/pages/Logs.svelte`

---

- [ ] 9. Grading History Table + SQLite CRUD

  **What to do**:
  - Create `src/pages/History.svelte` — sortable table of grading sessions
  - Columns (all togglable via Settings, defaults shown): Timestamp, Provider, Model, Students, Mean Score, Min, Max, Median, Page URL
  - Read visible columns from `app_settings.history_visible_columns`
  - Fetch sessions from SQLite with pagination (25 per page)
  - Click column header to sort (ascending/descending toggle)
  - Each row links to page URL (external browser open)
  - "Clear History" button with confirmation dialog
  - **Hook into grading flow**: The extension sends grades through the sidecar. The sidecar needs to emit session data back to the desktop app. Two approaches:
    - (a) Desktop app polls the sidecar for completed sessions
    - (b) Desktop app intercepts /grade responses and records them — **recommended**: add a Rust-side HTTP client that monitors the sidecar, or have the frontend listen for completed grading events
    - (c) Simplest: After extension calls POST /grade, the extension also POST /history to a new endpoint on the desktop app (NOT the sidecar) — but this adds complexity
    - **Best approach for v1**: The Tauri Rust backend periodically reads the sidecar's stdout for completed grading lines (which the server already logs as `[HH:MM:SS] Graded N students...`) and parses them to insert history records. The server already logs: timestamp, student count, and timing info. For full stats, modify this to also log provider/model/scores. OR: add a POST /history endpoint to the sidecar that the extension calls after grading completes.

  **Must NOT do**:
  - Do NOT add per-student drill-down rows (v2)
  - Do NOT add charts/graphs (v2)
  - Do NOT add CSV/PDF export (v2)
  - Do NOT add date range filtering (v2)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Data table with sorting, pagination, togglable columns, responsive design
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5-8, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - Task 4's SQLite schema — `grading_sessions` table structure
  - `batch-grader.js:450` — Summary result shape: `{ graded[], skipped[], errors[] }`

  **Acceptance Criteria**:

  - [ ] History table renders with correct columns from app_settings
  - [ ] Clicking column header sorts data
  - [ ] Pagination works (Next/Previous with 25 per page)
  - [ ] "Clear History" deletes all records with confirmation

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: History table displays grading sessions
    Tool: Playwright (playwright skill)
    Preconditions: At least 1 grading session record in SQLite (seed test data)
    Steps:
      1. Insert test data: sqlite3 <db> "INSERT INTO grading_sessions (provider_id, model, student_count, mean_score, min_score, max_score, median_score, max_possible_score, page_url) VALUES ('openai', 'gpt-4o', 25, 7.5, 3, 10, 8, 10, 'https://example.com/grade')"
      2. Navigate to History page
      3. Wait for: table visible (timeout: 5s)
      4. Assert: table has at least 1 row
      5. Assert: first row contains "openai", "gpt-4o", "25"
      6. Screenshot: .sisyphus/evidence/task-9-history-table.png
    Expected Result: History table shows seeded session data
    Evidence: .sisyphus/evidence/task-9-history-table.png
  ```

  **Commit**: YES
  - Message: `feat(desktop): add grading history table with sorting and pagination`
  - Files: `ogre-desktop/src/pages/History.svelte`

---

- [ ] 10. System Tray Integration

  **What to do**:
  - In `ogre-desktop/src-tauri/src/lib.rs`, add system tray setup:
    - Tray icon: Use O.G.R.E icon (create or use existing favicon)
    - Menu items: "Open Dashboard", separator, "Server: Running ✓" (disabled/info), "Settings", "View Logs", separator, "Quit"
    - `on_menu_event` handlers:
      - "open-dashboard": `window.unminimize()`, `window.show()`, `window.set_focus()`
      - "settings": Show window + navigate to settings page (emit event)
      - "logs": Show window + navigate to logs page (emit event)
      - "quit": Kill sidecar → `app.exit(0)`
    - `on_tray_icon_event`: Left-click → restore/focus main window
  - Minimize-to-tray behavior:
    - Override window close button to minimize/hide instead of exit
    - Window `on_close_requested` → `event.prevent_default()`, `window.hide()`
    - Only "Quit" from tray actually exits
  - Update tray menu dynamically when server status changes:
    - "Server: Running ✓" (green) vs "Server: Stopped ✗" (red)

  **Must NOT do**:
  - Do NOT add notification popups from tray
  - Do NOT add tray progress indicator
  - Do NOT add "Pause Server" option

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Rust-only task with Tauri tray API, window lifecycle management, dynamic menu updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5-9)
  - **Blocks**: Task 13
  - **Blocked By**: Task 3

  **References**:

  **External References**:
  - Tauri system tray docs: https://v2.tauri.app/learn/system-tray/
  - Tauri tray API from librarian research: `TrayIconBuilder`, `MenuBuilder`, `on_menu_event`, `on_tray_icon_event`

  **Acceptance Criteria**:

  - [ ] Tray icon appears in system tray when app is running
  - [ ] Right-click shows menu with 5+ items
  - [ ] "Open Dashboard" restores window
  - [ ] "Quit" kills sidecar and exits app
  - [ ] Closing window hides to tray (does NOT exit)
  - [ ] Left-clicking tray icon restores window

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Closing window minimizes to tray, quit exits
    Tool: interactive_bash (tmux) + Bash
    Preconditions: Tauri app running
    Steps:
      1. Verify app window is visible
      2. Close the window (Alt+F4 or window close button)
      3. curl -s http://localhost:3456/health
      4. Assert: server still responds (app minimized, not exited)
      5. Right-click tray icon → "Quit"
      6. sleep 2
      7. curl -s http://localhost:3456/health 2>&1
      8. Assert: connection refused (app and server fully exited)
    Expected Result: Close minimizes to tray; Quit fully exits
    Evidence: curl outputs captured for both states
  ```

  **Commit**: YES
  - Message: `feat(desktop): add system tray with minimize-to-tray behavior`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`, `ogre-desktop/src-tauri/icons/*`

---

- [ ] 11. Extension Integration — Bridge Stored Config to Server

  **What to do**:
  - The Chrome extension already sends `provider`, `apiUrl`, `apiKey`, `model` in the POST /grade body
  - The desktop app stores these in SQLite (from wizard/settings)
  - **Bridge approach**: Add a new endpoint to the grading server: `GET /config` that returns the active provider config
    - Extension calls `GET http://localhost:3456/config` on startup
    - If available, pre-fills provider config from desktop app settings
    - Extension still allows overriding locally
  - **Alternative (simpler, preferred)**: Don't modify the server. The extension already works standalone. The desktop app's value is:
    1. Manages the server lifecycle (no CLI needed)
    2. Stores history (via new `POST /session` endpoint or stdout parsing)
    3. Provides health monitoring
  - **For grading history recording**: Add `POST /session` endpoint to the grading server:
    ```js
    app.post('/session', async (c) => {
      const body = await c.req.json();
      // body: { provider, model, studentCount, meanScore, minScore, maxScore, medianScore, maxPossible, pageUrl, questionId, customInstructions }
      // Emit to desktop app via stdout: JSON.stringify({ type: 'session', ...body })
      console.log(JSON.stringify({ type: 'session_complete', ...body }));
      return c.json({ ok: true });
    });
    ```
  - Extension modification: After `batchGrade()` completes, POST session summary to `http://localhost:3456/session`
  - Desktop app's Rust sidecar handler: Parse stdout lines that are JSON with `type: 'session_complete'` → insert into `grading_sessions` table via Tauri command

  **Must NOT do**:
  - Do NOT change how the extension sends grading requests (POST /grade stays the same)
  - Do NOT require the desktop app for the extension to work (extension must still work standalone)
  - Do NOT add provider sync between desktop app and extension

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cross-component integration (server + extension + desktop app), event parsing, data flow design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `grading-server/server.js:42-53` (from git `15ea7ee`) — Existing POST /grade endpoint structure
  - `batch-grader.js:309-457` — batchGrade() function with onComplete callback that has the summary data
  - `batch-grader.js:450` — Summary shape: `{ graded[], skipped[], errors[] }`
  - `sidepanel.js` — Where batchGrade is called from in the extension

  **Acceptance Criteria**:

  - [ ] Server has new `POST /session` endpoint that logs session data as JSON to stdout
  - [ ] Extension calls `POST /session` after batch grading completes (when server is available)
  - [ ] Desktop app parses sidecar stdout for `session_complete` JSON lines
  - [ ] Desktop app inserts parsed session data into `grading_sessions` SQLite table

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Session recording via POST /session
    Tool: Bash (curl)
    Preconditions: Grading server running (via desktop app or standalone)
    Steps:
      1. curl -s -X POST http://localhost:3456/session \
           -H "Content-Type: application/json" \
           -d '{"provider":"openai","model":"gpt-4o","studentCount":25,"meanScore":7.5,"minScore":3,"maxScore":10,"medianScore":8,"maxPossible":10,"pageUrl":"https://example.com/grade","questionId":"Q1","customInstructions":"Non-zero only"}'
      2. Assert: response is {"ok":true}
      3. Check server stdout (from desktop app logs) for session_complete JSON
    Expected Result: Server accepts session data and emits it to stdout for desktop app
    Evidence: curl response + log output captured
  ```

  **Commit**: YES (two commits)
  - Message 1: `feat(server): add POST /session endpoint for history recording`
  - Files: `grading-server/server.js`
  - Message 2: `feat(extension): report completed sessions to grading server`
  - Files: `batch-grader.js` or `sidepanel.js`

---

- [ ] 12. Auto-Updater Setup

  **What to do**:
  - Add `tauri-plugin-updater` to `src-tauri/Cargo.toml`:
    ```toml
    [target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
    tauri-plugin-updater = "2"
    ```
  - Install JS package: `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`
  - Generate signing keys: `npx tauri signer generate -w ~/.tauri/ogre-desktop.key`
  - Configure `tauri.conf.json`:
    ```json
    {
      "bundle": { "createUpdaterArtifacts": true },
      "plugins": {
        "updater": {
          "pubkey": "<PUBLIC_KEY>",
          "endpoints": ["https://github.com/shuff57/O.G.R.E-OllamaGradingReviewEvaluator/releases/latest/download/latest.json"]
        }
      }
    }
    ```
  - In frontend, add update check on app startup (`src/lib/updater.ts`):
    ```ts
    import { check } from '@tauri-apps/plugin-updater';
    import { relaunch } from '@tauri-apps/plugin-process';
    // Check on startup, show modal if update available
    ```
  - Create `src/components/UpdateModal.svelte`:
    - Shows: "Update available: v{version}. Release notes: {notes}."
    - Buttons: "Update Now" (downloads, installs, relaunches), "Later" (dismisses)
    - Progress bar during download
  - Store signing private key securely (NOT in repo — environment variable or CI secret)

  **Must NOT do**:
  - Do NOT add background polling for updates
  - Do NOT add beta channels
  - Do NOT commit signing private key to git
  - Do NOT auto-update without user confirmation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Plugin configuration, signing setup, update flow with modal UI
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 11)
  - **Blocks**: Task 14
  - **Blocked By**: Task 2

  **References**:

  **External References**:
  - Tauri updater plugin: https://v2.tauri.app/plugin/updater/
  - Tauri GitHub Action: https://github.com/tauri-apps/tauri-action

  **Acceptance Criteria**:

  - [ ] `tauri-plugin-updater` configured in Cargo.toml and tauri.conf.json
  - [ ] Signing keys generated (private key NOT in repo)
  - [ ] Public key in tauri.conf.json
  - [ ] Update check runs on app startup
  - [ ] UpdateModal component shows when update is available

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Update check runs without errors on startup
    Tool: Bash
    Preconditions: App running with updater configured
    Steps:
      1. Launch app in dev mode
      2. Check console/logs for update check message
      3. Assert: no errors related to updater (may say "no update available" — that's fine)
    Expected Result: Updater initializes and checks without crashing
    Evidence: Console output captured
  ```

  **Commit**: YES
  - Message: `feat(desktop): add auto-updater with GitHub Releases integration`
  - Files: `ogre-desktop/src-tauri/Cargo.toml`, `ogre-desktop/src-tauri/tauri.conf.json`, `ogre-desktop/src/lib/updater.ts`, `ogre-desktop/src/components/UpdateModal.svelte`

---

- [ ] 13. End-to-End Integration Tests

  **What to do**:
  - Create `ogre-desktop/tests/e2e/` directory
  - **Test 1: Full app lifecycle**
    - Launch app → verify sidecar starts → verify health endpoint → close app → verify sidecar stops
  - **Test 2: Provider config persistence**
    - Open settings → add OpenAI provider with API key → close and reopen app → verify config persisted
  - **Test 3: Grading history recording**
    - POST /session to sidecar → verify desktop app writes to SQLite → verify History page shows record
  - **Test 4: System tray behavior**
    - Close window → verify server still running → quit from tray → verify server stopped
  - **Golden path test** (most important):
    1. Launch OGRE Desktop
    2. Verify server starts (health check green)
    3. POST a mock grading session to /session
    4. Verify History page updates
    5. Verify Logs page shows server activity
    6. Quit from tray
    7. Verify port 3456 freed

  **Must NOT do**:
  - Do NOT test the Chrome extension integration (that's manual/separate)
  - Do NOT add browser-based E2E tests for Tauri webview (complex; use curl + SQLite queries)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cross-component integration testing, process lifecycle verification, database state checking
  - **Skills**: [`playwright`]
    - `playwright`: For any webview UI assertions needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after all Wave 3 tasks)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 5-11

  **References**:

  **Pattern References**:
  - All acceptance criteria from Tasks 3-11 feed into these integration tests

  **Acceptance Criteria**:

  - [ ] All 4 test scenarios pass
  - [ ] Golden path test passes end-to-end

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Golden path — full lifecycle
    Tool: Bash (curl + sqlite3)
    Preconditions: App built, ready to launch
    Steps:
      1. Launch OGRE Desktop (background process)
      2. sleep 10 (wait for sidecar startup)
      3. curl -s http://localhost:3456/health → assert {"status":"ok"}
      4. curl -s -X POST http://localhost:3456/session -H "Content-Type: application/json" -d '{"provider":"openai","model":"gpt-4o","studentCount":5,"meanScore":8.2,"minScore":6,"maxScore":10,"medianScore":8.5,"maxPossible":10,"pageUrl":"https://test.com"}'
      5. Assert: response {"ok":true}
      6. sleep 2
      7. sqlite3 <appdata>/ogre.db "SELECT COUNT(*) FROM grading_sessions" → assert >= 1
      8. Quit the app (terminate process)
      9. sleep 2
      10. curl -s http://localhost:3456/health 2>&1 → assert connection refused
    Expected Result: Full lifecycle works — server starts, records history, stops on exit
    Evidence: All curl/sqlite3 outputs captured
  ```

  **Commit**: YES
  - Message: `test(desktop): add end-to-end integration tests`
  - Files: `ogre-desktop/tests/e2e/*`

---

- [ ] 14. Build Configuration + Windows Installer

  **What to do**:
  - Configure `ogre-desktop/src-tauri/tauri.conf.json` for production build:
    - `bundle.targets`: `["nsis"]` (Windows NSIS installer — single format for v1)
    - `bundle.icon`: Set app icons (ICO for Windows, PNG for others)
    - `bundle.resources`: Include any additional files if needed
    - `bundle.shortDescription`: "O.G.R.E - AI Grading Server Manager"
    - `bundle.copyright`: License info
  - Create app icons:
    - `ogre-desktop/src-tauri/icons/icon.ico` (Windows)
    - `ogre-desktop/src-tauri/icons/icon.png` (tray icon, various sizes)
  - Build grading server sidecar for release:
    - `cd grading-server && bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`
  - Build Tauri app: `cd ogre-desktop && npm run tauri build`
  - Verify output: Check `src-tauri/target/release/bundle/nsis/` for installer .exe
  - Verify installer size is reasonable (~120-130 MB expected: ~110MB sidecar + ~5MB Tauri + ~2MB frontend)

  **Must NOT do**:
  - Do NOT create custom NSIS scripts
  - Do NOT add macOS build targets (v2)
  - Do NOT code-sign (v2 — requires purchasing certificate)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Build configuration, icon creation, installer verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 13)
  - **Blocks**: Task 15
  - **Blocked By**: Task 13

  **References**:

  **External References**:
  - Tauri build docs: https://v2.tauri.app/distribute/
  - Tauri NSIS config: https://v2.tauri.app/reference/config/#nsisconfig

  **Acceptance Criteria**:

  - [ ] `npm run tauri build` completes without errors
  - [ ] NSIS installer exists in `src-tauri/target/release/bundle/nsis/`
  - [ ] Installer file size is between 100-150 MB
  - [ ] Installing and running the installer produces a working app

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Build produces working Windows installer
    Tool: Bash
    Preconditions: All dependencies installed, sidecar binary built
    Steps:
      1. cd ogre-desktop && npm run tauri build
      2. Assert: exit code 0
      3. ls -lh src-tauri/target/release/bundle/nsis/
      4. Assert: .exe installer file exists
      5. Assert: file size is between 100-150 MB
    Expected Result: Windows installer built successfully
    Evidence: Build output + ls output captured
  ```

  **Commit**: YES
  - Message: `build(desktop): configure Windows installer and app icons`
  - Files: `ogre-desktop/src-tauri/tauri.conf.json`, `ogre-desktop/src-tauri/icons/*`

---

- [ ] 15. CI/CD Workflow for GitHub Actions

  **What to do**:
  - Create `.github/workflows/desktop-build.yml`:
    - Trigger: Push to `desktop` branch with changes in `ogre-desktop/` or `grading-server/`
    - Jobs:
      1. **Build sidecar**: Install Bun, compile grading-server for Windows x64
      2. **Build Tauri**: Install Rust, Node.js, run `npm run tauri build`
      3. **Upload artifacts**: Upload installer .exe as GitHub Actions artifact
    - Release job (on tag push `v*`):
      1. Build sidecar + Tauri
      2. Sign update artifacts (using `TAURI_SIGNING_PRIVATE_KEY` secret)
      3. Create GitHub Release with installer + `latest.json` for auto-updater
  - Add repository secrets:
    - `TAURI_SIGNING_PRIVATE_KEY` — for update signing
    - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — if password-protected
  - Verify: Push a commit and verify GitHub Actions builds successfully

  **Must NOT do**:
  - Do NOT add macOS build job (v2)
  - Do NOT add Linux build job (not a target)
  - Do NOT add automated testing in CI (can add later)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: GitHub Actions workflow authoring with multi-step build pipeline
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 14)
  - **Blocks**: None (final task)
  - **Blocked By**: Task 14

  **References**:

  **External References**:
  - Tauri GitHub Action: https://github.com/tauri-apps/tauri-action
  - GitHub Actions for Rust: https://github.com/actions-rs/toolchain

  **Acceptance Criteria**:

  - [ ] `.github/workflows/desktop-build.yml` exists
  - [ ] Workflow builds successfully on push to `desktop` branch
  - [ ] Release job creates GitHub Release with installer and `latest.json`

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: CI workflow file is valid
    Tool: Bash
    Preconditions: Workflow file created
    Steps:
      1. cat .github/workflows/desktop-build.yml
      2. Validate YAML syntax (no parse errors)
      3. Assert: contains "tauri-apps/tauri-action" or equivalent build steps
      4. Assert: contains trigger on push to desktop branch
      5. Assert: contains TAURI_SIGNING_PRIVATE_KEY secret reference
    Expected Result: Valid GitHub Actions workflow ready for CI/CD
    Evidence: File content captured
  ```

  **Commit**: YES
  - Message: `ci: add GitHub Actions workflow for desktop app builds`
  - Files: `.github/workflows/desktop-build.yml`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat: restore grading server code from git history` | `grading-server/*`, `.gitignore` | `bun test` |
| 2 | `feat(desktop): scaffold Tauri 2.0 project with Svelte frontend` | `ogre-desktop/*` | `cargo check` |
| 3 | `feat(desktop): integrate grading server as Tauri sidecar` | `ogre-desktop/src-tauri/src/*`, `ogre-desktop/src/lib/*` | `cargo check` + curl health |
| 4 | `feat(desktop): add SQLite schema with provider config and history tables` | `ogre-desktop/src-tauri/src/*`, `ogre-desktop/src/lib/db.ts` | `cargo check` |
| 5 | `feat(desktop): add dashboard with health indicators and navigation` | `ogre-desktop/src/pages/*`, `ogre-desktop/src/App.svelte` | dev server renders |
| 6 | `feat(desktop): add first-run setup wizard for provider configuration` | `ogre-desktop/src/pages/SetupWizard.svelte` | wizard flow works |
| 7 | `feat(desktop): add settings page with provider config editing` | `ogre-desktop/src/pages/Settings.svelte` | CRUD works |
| 8 | `feat(desktop): add real-time log viewer for sidecar output` | `ogre-desktop/src/pages/Logs.svelte` | logs stream |
| 9 | `feat(desktop): add grading history table with sorting and pagination` | `ogre-desktop/src/pages/History.svelte` | table renders |
| 10 | `feat(desktop): add system tray with minimize-to-tray behavior` | `ogre-desktop/src-tauri/src/*` | tray works |
| 11 | `feat: bridge extension grading sessions to desktop app history` | `grading-server/server.js`, `batch-grader.js` | POST /session works |
| 12 | `feat(desktop): add auto-updater with GitHub Releases integration` | `ogre-desktop/src-tauri/*`, `ogre-desktop/src/lib/updater.ts` | updater init |
| 13 | `test(desktop): add end-to-end integration tests` | `ogre-desktop/tests/*` | tests pass |
| 14 | `build(desktop): configure Windows installer and app icons` | `ogre-desktop/src-tauri/tauri.conf.json`, icons | build succeeds |
| 15 | `ci: add GitHub Actions workflow for desktop app builds` | `.github/workflows/*` | YAML valid |

---

## Success Criteria

### Verification Commands
```bash
# Server health (while app running)
curl -s http://localhost:3456/health
# Expected: {"status":"ok"}

# Session recording
curl -s -X POST http://localhost:3456/session \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","model":"gpt-4o","studentCount":5,"meanScore":8.0,"minScore":4,"maxScore":10,"medianScore":8,"maxPossible":10,"pageUrl":"https://test.com"}'
# Expected: {"ok":true}

# Build verification
cd ogre-desktop && npm run tauri build
# Expected: exit code 0, installer in target/release/bundle/nsis/

# Server stops after app exit
curl -s http://localhost:3456/health
# Expected: connection refused
```

### Final Checklist
- [ ] All "Must Have" features present and functional
- [ ] All "Must NOT Have" items absent (no OAuth, no charts, no drill-down, no macOS build)
- [ ] Server starts automatically with app
- [ ] Server stops when app quits (from tray)
- [ ] Provider config persists in SQLite across restarts
- [ ] Grading history records are created from POST /session
- [ ] System tray works with minimize-to-tray
- [ ] Windows installer builds and installs successfully
- [ ] Extension still works independently without desktop app
