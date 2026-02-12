# O.G.R.E Desktop - Deployment Guide

## Overview
This document guides you through building and deploying the O.G.R.E Desktop application (Tauri 2.0 wrapper for the grading server).

## Prerequisites

### Development Environment
- **Node.js** 20+ and npm
- **Rust** toolchain (stable)
- **Bun** (for building grading-server sidecar)
- **Windows** (for Windows builds; macOS support in v2)

### Required Setup

1. **Install Dependencies**
   ```bash
   cd ogre-desktop
   npm install
   cd ../grading-server
   bun install
   ```

2. **Build Sidecar Binary** (REQUIRED before building desktop app)
   ```bash
   cd grading-server
   bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe
   ```
   
   **Important**: The sidecar binary (~111MB) is **NOT committed to git**. You must build it locally or in CI.

3. **Generate Signing Keys** (for auto-updater)
   ```bash
   npx tauri signer generate -w ~/.tauri/ogre-desktop.key
   ```
   
   Add the **public key** to `tauri.conf.json` under `plugins.updater.pubkey`.
   
   **Important**: The private key should be stored as a GitHub secret (`TAURI_SIGNING_PRIVATE_KEY`) for CI builds.

## Building Locally

### Development Build
```bash
cd ogre-desktop
npm run tauri dev
```

### Production Build
```bash
cd ogre-desktop
npm run tauri build
```

**Output locations:**
- MSI installer: `src-tauri/target/release/bundle/msi/O.G.R.E Desktop_0.1.0_x64_en-US.msi`
- NSIS installer: `src-tauri/target/release/bundle/nsis/O.G.R.E Desktop_0.1.0_x64-setup.exe`
- Updater artifacts: `src-tauri/target/release/bundle/**/latest.json` and `*.sig` files

## GitHub Actions CI/CD

### Workflow: `.github/workflows/desktop-build.yml`

**Triggers:**
- Push to `desktop` or `main` branches
- Pull requests to `desktop` or `main`
- Version tags (e.g., `v1.0.0`)
- Manual workflow dispatch

**Artifacts:**
- MSI installer (uploaded as `ogre-desktop-windows-msi`)
- NSIS installer (uploaded as `ogre-desktop-windows-nsis`)
- Updater files (uploaded as `ogre-desktop-updater`)

**Secrets Required:**
- `TAURI_SIGNING_PRIVATE_KEY` — Private key from `tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — Password for the private key (if set)

### Creating a Release

1. **Tag a version:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **GitHub Actions automatically:**
   - Builds the desktop app
   - Creates a GitHub Release
   - Uploads installers and updater artifacts

3. **Auto-updater will detect the release:**
   - Users who have the app installed will see an "Update Available" modal
   - Clicking "Update Now" downloads, installs, and relaunches the app

## Project Structure

```
ogre-desktop/
├── src/                      # Svelte frontend
│   ├── App.svelte           # Main app shell with navigation
│   ├── pages/               # UI pages
│   │   ├── Dashboard.svelte
│   │   ├── History.svelte
│   │   ├── Logs.svelte
│   │   ├── Settings.svelte
│   │   └── SetupWizard.svelte
│   ├── components/
│   │   └── UpdateModal.svelte
│   └── lib/                 # Utilities
│       ├── db.ts            # SQLite CRUD functions
│       ├── server.ts        # Sidecar event listeners
│       ├── oauth.ts         # OAuth flow for Google/GitHub
│       └── updater.ts       # Auto-update logic
├── src-tauri/               # Rust backend
│   ├── src/
│   │   └── lib.rs           # Sidecar lifecycle, tray, deep links, SQLite
│   ├── binaries/            # Sidecar binary (gitignored)
│   │   └── grading-server-x86_64-pc-windows-msvc.exe
│   ├── Cargo.toml
│   └── tauri.conf.json      # Bundle, updater, plugins config
└── tests/e2e/               # Integration tests (Bash scripts)
```

## Testing

### E2E Integration Tests

**Prerequisites:**
- Build the app in debug mode: `npm run tauri build -- --debug`
- Ensure `sqlite3` and `curl` are in PATH
- Run in Git Bash or WSL on Windows

**Run all tests:**
```bash
npm run test:e2e
```

**Individual tests:**
```bash
bash ogre-desktop/tests/e2e/lifecycle.test.sh
bash ogre-desktop/tests/e2e/config.test.sh
bash ogre-desktop/tests/e2e/history.test.sh
bash ogre-desktop/tests/e2e/tray.test.sh
bash ogre-desktop/tests/e2e/golden-path.test.sh
```

**Test coverage:**
- App startup and server health
- Provider configuration persistence
- Grading session recording
- Tray quit behavior
- Full user journey (Launch → Grade → Verify → Quit)

## Configuration

### Provider Setup (First Run)

On first launch, the app shows a **Setup Wizard** with:

1. **Provider Selection**: Choose from Ollama Cloud/Local, OpenAI, Anthropic, Google Gemini, GitHub Models
2. **OAuth Sign-In** (Google Gemini & GitHub Models): Click "Sign in with Google/GitHub" instead of entering API keys
3. **Model Selection**:
   - OAuth providers: Auto-fetch model list and display in dropdown
   - API key providers: Enter model name manually
4. **Confirmation**: Review and save

### Settings Page

- **Edit Providers**: Update API keys, models, or OAuth tokens
- **OAuth Management**: Sign in/sign out, refresh model lists
- **Test Connection**: Verify provider connectivity
- **Column Visibility**: Toggle which columns appear in History table

### SQLite Database

**Location:** `%APPDATA%/com.ogre.desktop/ogre.db`

**Tables:**
- `provider_configs` — API keys, models, active provider
- `grading_sessions` — History records (timestamp, scores, page URL)
- `oauth_tokens` — OAuth access/refresh tokens (Google, GitHub)
- `app_settings` — Setup completion flag, column visibility preferences

## Architecture

### Component Flow

```
Chrome Extension (batch-grader.js)
   ↓ POST /grade
Grading Server Sidecar (server.js)
   ↓ POST /session
Rust Sidecar Handler (lib.rs)
   ↓ Parse stdout JSON
SQLite (grading_sessions table)
   ↓ session-complete event
Svelte Frontend (Dashboard.svelte, History.svelte)
   ↓ Reactive refresh
User sees updated history
```

### Sidecar Lifecycle

1. **App Launch**: Rust spawns `grading-server.exe` via `tauri-plugin-shell`
2. **Stdout/Stderr Capture**: Logs streamed to frontend via `server-log` events
3. **Health Monitoring**: Frontend polls `http://localhost:3456/health` every 5s
4. **Crash Recovery**: Rust detects `CommandEvent::Terminated`, attempts auto-restart (max 3 times)
5. **App Exit**: Rust kills sidecar process, port 3456 becomes free

### OAuth Flow (Tauri Deep Links)

1. User clicks "Sign in with Google/GitHub" in Settings/Wizard
2. Frontend opens browser to OAuth consent screen with `redirect_uri=ogre://oauth/callback/{provider}`
3. User authorizes, provider redirects to `ogre://oauth/callback?code=...`
4. Tauri deep link handler in `lib.rs` captures the URL, emits `oauth-callback` event
5. Frontend exchanges `code` for access token via backend API
6. Token saved to SQLite `oauth_tokens` table
7. Frontend fetches available models from provider API
8. Models displayed in dropdown for selection

## Troubleshooting

### Build Errors

**Error:** "Sidecar binary not found"
- **Fix:** Build the grading-server binary first (see Prerequisites)

**Error:** "cargo check failed"
- **Fix:** Install Rust toolchain: `rustup default stable`

**Error:** "npm install failed"
- **Fix:** Delete `node_modules` and `package-lock.json`, run `npm install` again

### Runtime Errors

**Error:** "Server failed to start"
- **Check:** Is port 3456 already in use? Close conflicting processes.
- **Check:** Sidecar binary executable permissions

**Error:** "Database locked"
- **Fix:** Close all instances of the app, delete `%APPDATA%/com.ogre.desktop/ogre.db-wal`

**Error:** "Update check failed"
- **Cause:** No GitHub releases yet, or network error
- **Note:** This is non-fatal; app continues normally

### OAuth Errors

**Error:** "OAuth sign-in failed"
- **Check:** OAuth app client IDs in `src/lib/oauth.ts` must match your OAuth apps
- **Check:** Redirect URIs in Google/GitHub OAuth app settings include `ogre://oauth/callback/{provider}`
- **Note:** See [OAUTH_APP_SETUP.md](../OAUTH_APP_SETUP.md) for backend setup

**Error:** "Failed to fetch models"
- **Check:** OAuth token is valid and not expired
- **Fix:** Sign out and sign in again to refresh token

## Security Notes

1. **API Keys**: Stored unencrypted in SQLite (local-only). Encryption is planned for v2.
2. **OAuth Tokens**: Stored in SQLite with refresh tokens for auto-renewal.
3. **Signing Keys**: Private key must be kept secret and never committed to git.
4. **Sidecar Binary**: Bundled with the installer, not downloaded at runtime.

## Known Limitations (v1)

- **Windows only** (macOS support in v2)
- **No per-student drill-down** in history (summary table only)
- **No dark mode** (single light theme)
- **No charts/graphs** (HTML table only)
- **No cloud settings sync** (local SQLite only)

## Next Steps for v2

1. **macOS Support**: DMG installer, code signing
2. **Per-Student Drill-Down**: Expand history rows to show individual student scores
3. **Dark Mode**: Theme toggle
4. **Charts**: Score distribution graphs
5. **API Key Encryption**: Use OS keychain/credential manager
6. **Model Fetching for All Providers**: Auto-populate model dropdowns for OpenAI, Anthropic, etc.

## Support

For issues, feature requests, or questions:
- **GitHub Issues**: https://github.com/shuff57/O.G.R.E-OllamaGradingReviewEvaluator/issues
- **Plan Document**: See `.sisyphus/plans/desktop-gui-wrapper.md` for full implementation details
