# Desktop GUI Wrapper - Post-Build Verification Checklist

**Date**: 2026-02-12  
**Purpose**: Verify all 9 runtime criteria after successful Tauri build  
**Prerequisites**: `npm run tauri build` completed successfully in `ogre-desktop/`

---

## Pre-Verification Setup

### 1. Locate the Installer
- [ ] Navigate to `ogre-desktop/src-tauri/target/release/bundle/`
- [ ] Confirm installer exists in either:
  - `nsis/O.G.R.E_[version]_x64-setup.exe` OR
  - `msi/O.G.R.E_[version]_x64_en-US.msi`
- [ ] Note the file size (should be ~110-115 MB due to bundled sidecar)

### 2. Pre-Installation State Check
```powershell
# Ensure port 3456 is free before installation
netstat -ano | findstr :3456
# Expected: No output (port not in use)
```

---

## Installation Verification

### 3. Run the Installer
- [ ] Double-click the installer file
- [ ] Complete installation wizard (default settings OK)
- [ ] Note installation directory (typically `C:\Program Files\O.G.R.E\` or `%LOCALAPPDATA%\Programs\O.G.R.E\`)
- [ ] Confirm desktop shortcut created (if NSIS installer)
- [ ] Confirm Start Menu entry created

### 4. First Launch
- [ ] Launch O.G.R.E from desktop shortcut or Start Menu
- [ ] **EXPECTED**: Setup Wizard appears (first run)
- [ ] **EXPECTED**: System tray icon appears (bottom-right of taskbar)

---

## Runtime Verification (Core Functionality)

### 5. Sidecar Auto-Start ✅ **[CRITICAL]**
```powershell
# While app is running, check if server started
curl http://localhost:3456/health

# Expected response:
# {"status":"ok"}

# Alternative: Check running processes
tasklist | findstr "grading-server"
# Expected: grading-server-x86_64-pc-windows-msvc.exe appears
```

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 6. Setup Wizard - Provider Configuration

#### Test Provider: Ollama (No OAuth Required)
- [ ] In Setup Wizard, click "Ollama" tab
- [ ] Enter API URL: `http://localhost:11434` (if you have Ollama running locally)
- [ ] **OR** Enter API URL: `https://api.openai.com/v1` (to test as OpenAI-compatible endpoint)
- [ ] Leave API Key blank (Ollama doesn't require it)
- [ ] Click "Fetch Models" button
- [ ] **EXPECTED**: Dropdown populates with available models
- [ ] Select a model (e.g., `llama2`, `gpt-3.5-turbo`)
- [ ] Click "Save Configuration"
- [ ] **EXPECTED**: Dashboard appears

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 7. SQLite Persistence ✅ **[CRITICAL]**
- [ ] Close the application completely (right-click tray icon → "Quit")
- [ ] Wait 5 seconds
- [ ] Relaunch O.G.R.E
- [ ] **EXPECTED**: Dashboard appears immediately (NOT Setup Wizard)
- [ ] Navigate to Settings page
- [ ] **EXPECTED**: Previously configured Ollama provider still visible with saved model

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 8. Sidecar Auto-Stop ✅ **[CRITICAL]**
```powershell
# While app is running, confirm server is up
curl http://localhost:3456/health
# Expected: {"status":"ok"}

# Now close the app (right-click tray → Quit)
# Wait 5 seconds, then check again
curl http://localhost:3456/health
# Expected: Connection refused / Failed to connect

# Verify process terminated
tasklist | findstr "grading-server"
# Expected: No output (process not running)
```

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 9. System Tray Behavior ✅ **[CRITICAL]**

#### Test 9A: Minimize to Tray
- [ ] Launch O.G.R.E
- [ ] Click the window's "X" (close button)
- [ ] **EXPECTED**: Window disappears BUT app still running (tray icon remains)
- [ ] **EXPECTED**: Server still responds: `curl http://localhost:3456/health` → `{"status":"ok"}`

**Status**: [ ] PASS / [ ] FAIL  

#### Test 9B: Restore from Tray
- [ ] Click the system tray icon (bottom-right of taskbar)
- [ ] **EXPECTED**: Window reappears

**Status**: [ ] PASS / [ ] FAIL  

#### Test 9C: Quit from Tray
- [ ] Right-click tray icon
- [ ] Click "Quit" in context menu
- [ ] **EXPECTED**: Window closes
- [ ] **EXPECTED**: Tray icon disappears
- [ ] **EXPECTED**: Server stops (verify with `curl http://localhost:3456/health` → connection refused)

**Status**: [ ] PASS / [ ] FAIL  

---

### 10. OAuth Flows (Device Flow + Code Paste)

#### Test 10A: Claude (Code Paste Flow)
- [ ] Navigate to Settings page
- [ ] Click "Claude" tab
- [ ] Click "Sign In with Claude"
- [ ] **EXPECTED**: New browser tab opens to `https://console.anthropic.com/...`
- [ ] **EXPECTED**: Desktop app shows "Enter the authorization code from browser"
- [ ] In browser: Authorize access
- [ ] **EXPECTED**: Browser shows authorization code (8-character alphanumeric)
- [ ] Copy code from browser
- [ ] Paste into desktop app input field
- [ ] Click "Submit Code"
- [ ] **EXPECTED**: "Authentication successful" message
- [ ] **EXPECTED**: "Fetch Models" button becomes enabled
- [ ] Click "Fetch Models"
- [ ] **EXPECTED**: Dropdown populates with Claude models (`claude-3-5-sonnet-20241022`, etc.)

**Status**: [ ] PASS / [ ] FAIL / [ ] SKIP (no Claude account)  
**Notes**: ___________________________________________

#### Test 10B: ChatGPT (Device Flow) - **REQUIRES REGISTRATION**
**NOTE**: ChatGPT device flow uses OpenCode's public client ID. GitHub/Google flows require you to register your own OAuth apps first.

- [ ] Navigate to Settings page
- [ ] Click "ChatGPT" tab
- [ ] Click "Sign In with ChatGPT"
- [ ] **EXPECTED**: Desktop app shows:
  - User code (e.g., `ABCD-EFGH`)
  - Verification URL (`https://auth.openai.com/activate`)
  - "Waiting for authorization..." spinner
- [ ] Open browser manually to verification URL
- [ ] Enter the user code shown in desktop app
- [ ] Authorize access
- [ ] **EXPECTED**: Desktop app auto-detects authorization within 5 seconds
- [ ] **EXPECTED**: "Authentication successful" message
- [ ] **EXPECTED**: "Fetch Models" button becomes enabled
- [ ] Click "Fetch Models"
- [ ] **EXPECTED**: Dropdown populates with GPT models (`gpt-4-turbo-preview`, etc.)

**Status**: [ ] PASS / [ ] FAIL / [ ] SKIP (no ChatGPT account)  
**Notes**: ___________________________________________

#### Test 10C: GitHub/Google Device Flows - **BLOCKED**
**Current Status**: Both flows have placeholder client IDs (`TODO_REGISTER_GITHUB_OAUTH_APP`, `TODO_REGISTER_GOOGLE_OAUTH_CLIENT`). These must be replaced with your own registered OAuth app credentials before testing.

**To Test (Future)**:
1. Register GitHub OAuth app at `https://github.com/settings/developers`
2. Register Google OAuth client at `https://console.cloud.google.com/apis/credentials`
3. Update `ogre-desktop/src/lib/oauth.ts` with real client IDs
4. Rebuild and repeat device flow test steps

**Status**: [ ] SKIPPED (placeholders not replaced)

---

### 11. Extension Integration ✅ **[CRITICAL]**

#### Prerequisites
- [ ] Chrome extension installed (from `chrome-extension/` directory)
- [ ] O.G.R.E desktop app running
- [ ] At least one provider configured with valid API key + model

#### Test Steps
- [ ] Open Chrome
- [ ] Navigate to a grading page (e.g., Google Classroom, Canvas)
- [ ] Open extension popup
- [ ] **EXPECTED**: Extension shows "Desktop server detected" or similar indicator
- [ ] **EXPECTED**: Extension shows configured providers from desktop app
- [ ] Select a provider and initiate batch grading
- [ ] **EXPECTED**: Grading completes successfully
- [ ] In desktop app: Navigate to "History" page
- [ ] **EXPECTED**: New grading session appears in table with:
  - Provider name
  - Model used
  - Student count
  - Average score
  - Timestamp
  - Page URL

**Status**: [ ] PASS / [ ] FAIL / [ ] SKIP (no extension)  
**Notes**: ___________________________________________

---

### 12. Grading History Persistence

- [ ] Complete a grading session (see Test 11)
- [ ] Note the session details (timestamp, student count)
- [ ] Close desktop app (right-click tray → Quit)
- [ ] Relaunch desktop app
- [ ] Navigate to History page
- [ ] **EXPECTED**: Previous grading session still visible in table

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 13. Logs Viewer

- [ ] In desktop app, navigate to "Logs" page
- [ ] **EXPECTED**: Real-time server logs visible (stdout/stderr from sidecar)
- [ ] **EXPECTED**: Recent log entries include server startup messages like:
  ```
  Server running on http://localhost:3456
  Health check endpoint: /health
  ```
- [ ] In extension: Trigger a grading session
- [ ] **EXPECTED**: Logs page auto-updates with grading request logs

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 14. Column Visibility Toggle (History Page)

- [ ] Navigate to History page
- [ ] Look for column visibility toggles (checkboxes or dropdown)
- [ ] Uncheck "Model" column
- [ ] **EXPECTED**: Model column disappears from table
- [ ] Close and relaunch app
- [ ] Navigate to History page
- [ ] **EXPECTED**: Model column still hidden (preference persisted)

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

## Edge Cases & Error Handling

### 15. Port Conflict Handling

**Setup**: Start a conflicting server on port 3456 BEFORE launching O.G.R.E

```powershell
# In PowerShell, start a dummy HTTP server on port 3456
# (Requires Python installed)
python -m http.server 3456
```

- [ ] With dummy server running, launch O.G.R.E
- [ ] **EXPECTED**: App shows error notification: "Failed to start grading server (port 3456 in use)"
- [ ] **ALTERNATIVE**: App logs show clear error message in Logs page
- [ ] Stop dummy server (`Ctrl+C`)
- [ ] **EXPECTED**: App shows "Retry" option OR auto-recovers within 30 seconds

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

### 16. Invalid API Key Handling

- [ ] Navigate to Settings
- [ ] Edit a provider (e.g., Ollama configured as OpenAI endpoint)
- [ ] Enter invalid API key: `sk-invalid123`
- [ ] Click "Fetch Models"
- [ ] **EXPECTED**: Error message appears: "Authentication failed" or "Invalid API key"
- [ ] **EXPECTED**: App does NOT crash
- [ ] Correct the API key
- [ ] Click "Fetch Models" again
- [ ] **EXPECTED**: Models load successfully

**Status**: [ ] PASS / [ ] FAIL  
**Notes**: ___________________________________________

---

## Auto-Updater (Optional - Requires GitHub Release)

### 17. Update Check

**NOTE**: This test only works if a newer version is published to GitHub Releases.

- [ ] Launch O.G.R.E
- [ ] **EXPECTED**: App checks for updates on startup (if configured)
- [ ] **IF UPDATE AVAILABLE**: Update modal appears with release notes
- [ ] Click "Install Update"
- [ ] **EXPECTED**: App downloads update, prompts to restart
- [ ] Restart app
- [ ] **EXPECTED**: New version launches successfully

**Status**: [ ] PASS / [ ] FAIL / [ ] SKIP (no update available)  
**Notes**: ___________________________________________

---

## Final Verification Summary

**Total Tests**: 17  
**Passed**: _____ / 17  
**Failed**: _____ / 17  
**Skipped**: _____ / 17  

### Critical Tests (Must Pass for v1 Release)
- [ ] Sidecar auto-start (Test 5)
- [ ] SQLite persistence (Test 7)
- [ ] Sidecar auto-stop (Test 8)
- [ ] System tray behavior (Test 9)
- [ ] Extension integration (Test 11)

### Blockers (If Any)
```
List any failing tests that block release:
1. 
2. 
3. 
```

### Known Issues (Non-Blocking)
```
List any issues that don't block release but should be tracked:
1. 
2. 
3. 
```

---

## Next Steps After Verification

### If All Critical Tests Pass ✅
1. Update `.sisyphus/plans/desktop-gui-wrapper.md` with verification results
2. Tag release: `git tag v1.0.0 && git push origin v1.0.0`
3. Push to `desktop` branch to trigger CI/CD build
4. Download artifacts from GitHub Actions
5. Create GitHub Release with installer artifacts

### If Any Critical Test Fails ❌
1. Document failure in `.sisyphus/notepads/desktop-gui-wrapper/test-failures.md`
2. Identify root cause (check Logs page, Rust console, Tauri dev tools)
3. Fix issue
4. Rebuild: `npm run tauri build`
5. Re-run this checklist

---

## Troubleshooting Reference

### Issue: Server doesn't start
**Check**:
```powershell
# Check if binary exists
dir "C:\Program Files\O.G.R.E\grading-server-x86_64-pc-windows-msvc.exe"

# Check if port is blocked
netstat -ano | findstr :3456

# Check Tauri logs
# Look in: %APPDATA%\com.ogre.desktop\logs\
```

### Issue: OAuth flows fail
**Check**:
- Network connectivity
- Browser popup blockers
- Logs page for detailed error messages
- Valid client IDs in `oauth.ts` (not placeholders)

### Issue: Extension doesn't detect server
**Check**:
```powershell
# Verify server is accessible
curl http://localhost:3456/health

# Check extension console (Chrome DevTools → Extensions → O.G.R.E → Inspect)
```

### Issue: App crashes on startup
**Check**:
- SQLite database corruption (delete `%APPDATA%\com.ogre.desktop\ogre.db` to reset)
- Missing sidecar binary
- Tauri logs in `%APPDATA%\com.ogre.desktop\logs\`

---

**END OF CHECKLIST**
