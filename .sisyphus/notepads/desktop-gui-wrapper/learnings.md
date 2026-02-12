# Desktop GUI Wrapper - Learnings

## Task 1: Restore Grading Server Code from Git History

### Status: ✅ COMPLETED

### What Was Done
1. **Cherry-picked 5 commits in order** onto the `desktop` branch:
   - `dbfdf9d` - docs(grading-server): define wire format JSON schemas
   - `afb4b40` - feat(grading-server): implement core grading server with TDD
   - `a4c6d24` - build(grading-server): add cross-platform executable builds
   - `7dd98d4` - build(grading-server): rebuild Windows exe with error handling fix
   - `15ea7ee` - fix(grading-server): keep window open on startup errors so users can read messages

2. **Added `grading-server/dist/` to root `.gitignore`** to prevent committing the ~110MB Windows executable

3. **Extracted test data files** from git history:
   - `test-data/test-rubric.json`
   - `test-data/test-students.json`

### Verification Results
- ✅ All 10 required files created/restored:
  - grading-server/server.js
  - grading-server/grading.js
  - grading-server/providers.js
  - grading-server/schemas.md
  - grading-server/package.json
  - grading-server/bun.lock
  - grading-server/tsconfig.json
  - grading-server/.gitignore
  - grading-server/test/grading.test.js
  - grading-server/test/providers.test.js

- ✅ Server compiles and starts successfully:
  - Listens on port 3456
  - Displays startup banner with usage instructions
  - Ready to accept grading requests

- ✅ All tests pass:
  - 72 tests passed
  - 0 tests failed
  - 135 expect() calls verified

### Key Insights
1. **Cherry-pick workflow**: All 5 commits applied cleanly without conflicts
2. **Test data location**: Test data files are stored in root `test-data/` directory, not in grading-server/
3. **Server architecture**: Uses Hono framework with Node.js server adapter for HTTP handling
4. **Build artifacts**: Windows executable is ~110MB and should never be committed (now in .gitignore)

### Next Steps
- Task 3: Integrate grading server with desktop GUI wrapper
- Task 11: Deploy grading server to production

### Files Modified
- `.gitignore` - Added `grading-server/dist/` entry
- Created: `test-data/test-rubric.json`
- Created: `test-data/test-students.json`

---

## Task 2: Scaffold Tauri 2.0 Project with Svelte

### Status: ✅ COMPLETED

### What Was Done
1. Created `ogre-desktop/` at repo root with Vite + Svelte frontend (`npm create vite@latest . -- --template svelte`)
2. Installed Tauri CLI (`@tauri-apps/cli@2.10.0`) as dev dependency
3. Manually scaffolded `src-tauri/` directory (interactive `tauri init` not available in CI)
4. Configured `tauri.conf.json` with all required settings
5. Added Cargo.toml with all required plugins
6. Installed JS packages: `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-sql`, `@tauri-apps/api`
7. Created `src-tauri/binaries/` with `.gitkeep` and placeholder sidecar
8. Generated app icons from repo `favicon.png` via `npx tauri icon`
9. Created capabilities/permissions file for shell, SQL, and core access
10. Verified: `cargo check` passes (exit code 0)

### Key Configuration
- **productName**: "O.G.R.E Desktop"
- **identifier**: "com.ogre.desktop"
- **bundle.externalBin**: ["binaries/grading-server"]
- **Window title**: "O.G.R.E - Grading Server Manager"
- **Window size**: 900x650
- **Cargo plugins**: tauri-plugin-shell, tauri-plugin-sql (sqlite), tauri (tray-icon)

### Gotchas
1. **externalBin requires actual files at build time**: Tauri's build script validates that sidecar binaries exist with the target triple appended (e.g., `grading-server-x86_64-pc-windows-msvc.exe`). Created a placeholder `.exe` for `cargo check` to pass. `.gitignore` excludes `src-tauri/binaries/*.exe` while `.gitkeep` keeps the directory tracked.
2. **Tauri 2.0 config structure**: Uses flat top-level keys (`productName`, `identifier`, `build`, `app`, `bundle`, `plugins`) — NOT nested under a `tauri` key like v1.
3. **Capabilities/permissions**: Tauri 2.0 has a security model requiring explicit permission grants in `capabilities/*.json`. Added `core:default`, shell permissions, and `sql:default`.
4. **Cargo.toml lib section**: Need `crate-type = ["staticlib", "cdylib", "rlib"]` for proper Tauri library compilation.

### Versions Used
- Tauri CLI: 2.10.0 | tauri crate: 2.10.2 | tauri-build: 2.5.5
- tauri-plugin-shell: 2.3.5 | tauri-plugin-sql: 2.3.2
- Svelte: 5.45.2 | Vite: 7.3.1
- Rust: 1.92.0 | Node: 22.16.0

### File Structure
```
ogre-desktop/
├── src/                    # Svelte frontend (default Vite template)
│   ├── App.svelte
│   ├── main.js
│   └── lib/Counter.svelte
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # Windows entry point
│   │   └── lib.rs          # Tauri builder with plugins
│   ├── binaries/           # Sidecar binaries go here
│   │   └── .gitkeep
│   ├── capabilities/
│   │   └── default.json    # Permission grants
│   ├── icons/              # Generated from favicon.png
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── package.json
└── vite.config.js
```

### For Next Tasks
- The Svelte frontend has default Vite template content — replace with actual UI (Tasks 5-10)
- Shell plugin permissions are configured for spawning the grading-server sidecar (Task 3)
- SQL plugin with SQLite is ready for local data persistence (Task 4)
- Tray icon feature is enabled in Cargo.toml but not yet implemented in lib.rs

---

## Task 3: Sidecar Integration — Spawn/Kill Grading Server

### Status: ✅ COMPLETED

### What Was Done
1. **Implemented sidecar lifecycle management in lib.rs**:
   - Spawn grading-server on app `setup` hook
   - Kill sidecar on window `Destroyed` event
   - Store child process handle in managed state

2. **Added event-driven log forwarding**:
   - Capture `CommandEvent::Stdout` and `CommandEvent::Stderr`
   - Emit `server-log` events to frontend with log lines
   - Emit `server-status` events (running/stopped/crashed/failed)

3. **Implemented crash recovery**:
   - Detect `CommandEvent::Terminated` with non-zero exit code
   - Auto-restart with exponential backoff (1s, 2s, 4s)
   - Max 3 restart attempts, then emit `failed` status

4. **Created TypeScript utilities** (`src/lib/server.ts`):
   - `listenServerLogs(callback)` - Subscribe to log events
   - `listenServerStatus(callback)` - Subscribe to status changes
   - Typed `ServerStatus` union type

5. **Configured shell permissions** in `capabilities/default.json`:
   - Added `shell:allow-spawn` with sidecar permission
   - Followed naming convention: `"binaries/grading-server"` (base path only)

6. **Built sidecar binary** (111MB):
   - Command: `bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`
   - File: `ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe`

### Key Insights
- **Naming Convention**: Tauri automatically appends target triple to sidecar paths. All references use `"binaries/grading-server"` (without triple or extension).
- **Event Loop**: Rust async task reads `CommandEvent` stream and emits to frontend via `app.emit()`.
- **Exit Code Handling**: Exit code 0 = intentional shutdown (no restart), non-zero = crash (auto-restart).
- **State Management**: `app.manage(Mutex<SidecarState>)` holds child process handle for cleanup.

### Verification Results
- ✅ Rust code compiles: `cargo check` passes
- ✅ Sidecar binary exists and is 111MB
- ✅ TypeScript utilities compile
- ✅ Permissions configured correctly

---

## Task 4: SQLite Schema + Migrations (Provider Config + History)

### Status: ✅ COMPLETED

### What Was Done
1. **Defined 3 migrations in lib.rs** (lines 120-169):
   - **Migration 1**: `provider_configs` table + WAL mode
   - **Migration 2**: `grading_sessions` table
   - **Migration 3**: `app_settings` table with default values

2. **Created TypeScript CRUD layer** (`src/lib/db.ts`):
   - **Types**: `ProviderConfig`, `GradingSession`, `AppSetting`
   - **Provider functions**: `getProviderConfigs()`, `getProviderConfig(id)`, `saveProviderConfig(config)`, `deleteProviderConfig(id)`
   - **Session functions**: `getGradingSessions()`, `insertGradingSession(session)`
   - **Settings functions**: `getSetting(key)`, `setSetting(key, value)`

3. **Schema details**:
   - `provider_configs`: id (PK), api_url, api_key, model, is_active, timestamps
   - `grading_sessions`: id (auto-increment), provider_id, model, student_count, scores, page_url, question_id, custom_instructions, created_at
   - `app_settings`: key (PK), value (with defaults for setup_complete, history_visible_columns)

4. **Registered migrations** with `tauri-plugin-sql`:
   - Migrations run automatically on first app launch
   - WAL mode enabled for crash safety

### Key Insights
- **ON CONFLICT**: Used for upsert operations in `saveProviderConfig` and `setSetting`
- **Parameterized queries**: All queries use `$1, $2, $3...` syntax (SQLite positional params)
- **Null handling**: TypeScript functions accept optional params, convert to `null` for SQL
- **No foreign keys**: Keep it simple - no constraints between tables
- **No encryption**: API keys stored in plaintext (v1 - local-only database)

---

## Task 5: Dashboard Shell + Health Indicators

### Status: ✅ COMPLETED

### What Was Done
1. **Created routing structure** in `src/pages/`:
   - Dashboard.svelte (main view)
   - History.svelte (placeholder)
   - Logs.svelte (placeholder)
   - Settings.svelte (placeholder)

2. **Implemented Dashboard.svelte** with:
   - Header showing "O.G.R.E Desktop" + version number
   - Health Indicators Section:
     - Server indicator: polls `http://localhost:3456/health` every 5 seconds
     - Provider indicator: reads active provider from SQLite
   - Quick Stats from database:
     - Total sessions graded
     - Total students graded
     - Last session timestamp
   - Real-time updates via `listenServerStatus` event listener

3. **Refactored App.svelte** for navigation:
   - Sidebar navigation menu
   - Conditional rendering for page switching
   - Current page highlighting

4. **Styling**:
   - Clean, professional light theme
   - Color-coded health indicators (green=ok, red=error, yellow=loading)
   - Responsive layout for 900x650 window

5. **Backend integration**:
   - Connected to `listenServerStatus()` for real-time server events
   - Used `getProviderConfigs()` and `getGradingSessions()` for stats
   - Health polling with 5-second interval

6. **Cleanup**:
   - Removed unused Counter.svelte component

### Key Insights
- **Health Polling**: Combination of event listeners (from Rust) and HTTP polling (from frontend) ensures accurate status
- **Provider Status**: Checks `is_active = 1` in database to determine active provider
- **Quick Stats**: Calculated on mount from database, shows 0s if no sessions exist
- **Navigation**: Simple conditional rendering - no heavy router library needed for v1

### Verification Results
- ✅ npm run build succeeds
- ✅ All 4 page files created
- ✅ Health polling logic implemented
- ✅ Provider check queries SQLite
- ✅ Sidebar navigation renders

---

## Task 6: Setup Wizard (First-Run Provider Configuration)

### Status: ✅ COMPLETED

### What Was Done
(Completed in previous session - committed already)

---

## Task 7: Settings Page (Edit Provider Config)

### Status: ✅ COMPLETED

### What Was Done
1. **Created Settings.svelte** with provider management UI:
   - Provider cards with inline editing
   - Add/Edit/Delete provider operations
   - Test Connection button per provider
   - OAuth integration for Google Gemini and GitHub Models
   - Column visibility toggles for history table

2. **OAuth Integration Features**:
   - "Sign in with Google/GitHub" buttons
   - OAuth token storage in SQLite
   - Automatic model fetching after OAuth sign-in
   - Model dropdown with "Refresh Models" button
   - Sign out functionality with token revocation
   - Fallback to API key input if OAuth fails

3. **Provider Configuration**:
   - Dynamic form fields based on provider type
   - Masked API key display
   - Active provider toggle
   - Support for all 6 providers (Ollama Cloud/Local, OpenAI, Anthropic, Google Gemini, GitHub Models)

4. **Created oauth.ts** with full OAuth flow:
   - `signInWithGoogle()` - Opens browser for Google OAuth consent
   - `signInWithGitHub()` - Opens browser for GitHub OAuth consent
   - `fetchAvailableModels()` - Fetches model list from provider API
   - `signOut()` - Revokes tokens and clears from database
   - Token refresh for expired Google tokens
   - Deep link callback handling via Tauri event listeners

5. **Created updater.ts** for auto-update functionality (bonus for Task 12)

6. **Created UpdateModal.svelte** for update notifications (bonus for Task 12)

### Key Insights
- **OAuth Flow**: Uses Tauri deep links (`ogre://oauth/callback`) captured by event listeners
- **Model Fetching**: Only OAuth providers support automatic model fetching; API key providers use text input
- **Backend Reuse**: Uses existing Vercel OAuth backend from Chrome extension
- **Token Storage**: OAuth tokens stored in `oauth_tokens` table with expiry tracking
- **UX Choice**: Users can choose between OAuth sign-in OR API key for supported providers

### Gotchas
1. **Client IDs**: Placeholder values in oauth.ts - user must replace with actual OAuth app client IDs
2. **Deep Link Registration**: Requires custom URL scheme registration in tauri.conf.json (already done)
3. **Model API Endpoints**: 
   - Google Gemini: `https://generativelanguage.googleapis.com/v1beta/models`
   - GitHub Models: `https://models.github.ai/inference/v1/models`
4. **Token Refresh**: Only Google OAuth supports refresh tokens; GitHub tokens don't expire

### Verification Results
- ✅ npm run build succeeds
- ✅ Settings page compiles with all features
- ✅ OAuth functions defined and exported
- ✅ UpdateModal component created (for Task 12)

---

## Task 8: Log Viewer (Sidecar stdout/stderr Streaming)

### Status: ✅ COMPLETED

(Completed in previous session - committed already)

---

## Task 9: Grading History Table + SQLite CRUD

### Status: ✅ COMPLETED

(Completed in previous session - committed already)

---

## Next Tasks (Wave 3 & 4)
- Task 10: System Tray Integration
- Task 11: Extension Integration (POST /session endpoint)
- Task 12: Auto-Updater Setup (partially done - updater.ts and UpdateModal.svelte created)
- Task 13: End-to-End Integration Tests
- Task 14: Build Configuration + Windows Installer
- Task 15: CI/CD Workflow
