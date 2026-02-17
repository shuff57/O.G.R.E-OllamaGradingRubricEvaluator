# Phase 1 Connectivity Testing - Checklist

**Date Started:** _______________  
**Tester:** _______________

📖 **See `MANUAL_TEST_GUIDE.md` for step-by-step instructions**

**Legend:**
- `[ ]` = Not yet tested
- `[x]` = PASS
- `[!]` = FAIL (describe what happened in Notes)
- `[-]` = SKIP (not applicable)

---

## ✅ AUTOMATED TESTS COMPLETE (2/4)

### 1.3 Ollama Connectivity (Server-Side)

- [x] **Test 1.3.1: Ollama is Running**
  - **Result**: PASS
  - **Notes**: 18 models available (cloud + local)

---

## 📋 MANUAL TESTS REQUIRED (17 remaining)

---

## ⚠️ TEST ORDER: Desktop App First, Then Extension

**YOU MUST TEST IN THIS ORDER:**

1. **Section 1.6** - Desktop App Tests (starts the grading server)
2. **Sections 1.2-1.5** - Extension Tests (uses desktop-managed server)

**Do NOT test the extension before the desktop app is running!**

---

### 1.6 Desktop App ↔ Grading Server Connectivity (DO FIRST!)

- [x] **Test 1.6.1: Desktop App Launch**
  - **Steps**:
    1. Launch the O.G.R.E desktop app from Windows Start Menu or shortcut
    2. Observe the application window
  - **Expected**: App window opens with the grading UI. Look for server status indicator.
  - **Notes**: Launched successfully from `ogre-desktop\src-tauri\target\release\ogre-desktop.exe`

- [ ] **Test 1.6.2: Integrated Server Status**
  - **Steps**:
    1. In the desktop app, look for a server status indicator or "Server" section
    2. Check if it shows the grading server as running
  - **Expected**: Indicator shows server running on localhost:3456 (or similar)
  - **Notes**: MANUAL - User needs to check UI

- [x] **Test 1.6.3: Desktop ↔ Server Health**
  - **Steps**:
    1. With the desktop app running, open a browser and go to `http://localhost:3456/health`
  - **Expected**: Returns `{"status":"ok"}` — the desktop app started the server
  - **Notes**: VERIFIED - Server responds with {"status":"ok"}

- [ ] **Test 1.6.4: Desktop Provider Config Sync**
  - **Steps**:
    1. In the desktop app, configure an AI provider (e.g., Ollama with localhost URL)
    2. Check if the grading server received the config:
       - Try running a batch grade from the extension while desktop is running
       - Or check terminal output of grading server for config push logs
  - **Expected**: Server receives provider configuration from desktop app
  - **Notes**: _______________

---

### ✅ File Structure Verified (Automated)
- [x] **manifest.json exists and is valid**
- [x] **sidepanel.html exists with provider tabs**  
- [x] **background.js service worker configured**
- [x] **All required permissions present** (sidePanel, activeTab, scripting, storage, identity)

### 1.2 Chrome Extension ↔ Background Worker

- [ ] **Test 1.2.1: Extension Loads**
  - **Steps**:
    1. Go to `chrome://extensions/`
    2. Find "O.G.R.E-OllamaGradingRubricEvaluator"
    3. Click the reload button (circular arrow)
    4. Check for errors — click "Errors" or "Service Worker" link
  - **Expected**: No errors shown. Service worker status shows "Active" or ready.
  - **Notes**: _______________

- [ ] **Test 1.2.2: Side Panel Opens**
  - **Steps**:
    1. Click the O.G.R.E extension icon in Chrome toolbar
    2. Side panel should appear on the right side of the browser
  - **Expected**: Side panel opens showing the grading UI with provider tabs
  - **Notes**: _______________

- [ ] **Test 1.2.3: Provider Tabs Render**
  - **Steps**:
    1. In the side panel, look at the provider tabs at the top
    2. Count how many tabs are visible
  - **Expected**: You should see tabs for: Ollama, OpenAI, Claude, Gemini, GitHub (5 tabs or similar)
  - **Notes**: _______________

---

### 1.3 Ollama (Local) Connectivity - Extension Integration

- [ ] **Test 1.3.2: Extension Connects to Ollama**
  - **Steps**:
    1. Open O.G.R.E side panel
    2. Click the "Ollama" tab (or the tab for local Ollama)
    3. Verify API URL field shows `http://localhost:11434` (or set it)
    4. Leave API Key empty (not needed for local)
    5. Click "Test Connection" button (or wait for auto-test)
  - **Expected**: Green status indicator appears. Status message says "Connected successfully" or similar.
  - **Notes**: _______________

- [ ] **Test 1.3.3: Ollama Model List**
  - **Steps**:
    1. After successful connection, click the Model dropdown
  - **Expected**: Dropdown populates with models you have pulled. Should see models like:
    - `gpt-oss:120b-cloud`
    - `deepseek-v3.2:cloud`
    - `gemma3:latest`
    - `qwen2.5-coder:latest`
    - And 14 more models
  - **Notes**: _______________

- [ ] **Test 1.3.4: Ollama Model Selection Persists**
  - **Steps**:
    1. Select a model from the dropdown
    2. Close the side panel
    3. Reopen the side panel
  - **Expected**: Same model is still selected, Ollama tab still shows green indicator
  - **Notes**: _______________

---

### 1.4 GitHub Models Connectivity

- [ ] **Test 1.4.1: GitHub Tab UI**
  - **Steps**:
    1. Click the "GitHub" tab in the side panel
    2. Look for authentication options
  - **Expected**: You see either a "Sign in with GitHub" button OR a field for GitHub Token
  - **Notes**: _______________

- [ ] **Test 1.4.2: GitHub Authentication**
  - **Steps**:
    1. If using token: paste your GitHub token (ghp_... or similar)
    2. If using OAuth: click "Sign in with GitHub" and complete the flow
    3. Wait for connection test
  - **Expected**: Green indicator on GitHub tab, "Connected successfully" message
  - **Notes**: _______________

- [ ] **Test 1.4.3: GitHub Model List**
  - **Steps**:
    1. After connecting, click the Model dropdown
  - **Expected**: Shows available GitHub Copilot models (e.g., gpt-4o, claude-sonnet, etc.)
  - **Notes**: _______________

---

### 1.5 Error Handling for Unavailable Providers

- [ ] **Test 1.5.1: Invalid Anthropic Key**
  - **Steps**:
    1. Click "Claude" tab
    2. Enter a fake API key: `sk-ant-FAKE123456789`
    3. Wait for auto-test or click "Test Connection"
  - **Expected**: Red indicator on Claude tab. Error message mentioning "401 Unauthorized" or similar.
  - **Notes**: _______________

- [ ] **Test 1.5.2: Invalid OpenAI Key**
  - **Steps**:
    1. Click "OpenAI" tab
    2. Enter a fake API key: `sk-FAKE123456789`
    3. Wait for auto-test
  - **Expected**: Red indicator on OpenAI tab. Error message about unauthorized.
  - **Notes**: _______________

- [ ] **Test 1.5.3: Invalid Gemini Key**
  - **Steps**:
    1. Click "Gemini" tab
    2. Enter a fake API key: `AIzaFAKEKEY123`
    3. Wait for auto-test
  - **Expected**: Red indicator. Error message about unauthorized or invalid key.
  - **Notes**: _______________

- [ ] **Test 1.5.4: Empty API Key Test**
  - **Steps**:
    1. On any provider tab (Claude, OpenAI, Gemini), leave the API key field completely empty
    2. Click "Test Connection" (if button exists)
  - **Expected**: Error message or the test does not trigger. No crash.
  - **Notes**: _______________

- [ ] **Test 1.5.5: Ollama Wrong URL**
  - **Steps**:
    1. Click Ollama tab
    2. Change API URL to `http://localhost:99999` (non-existent port)
    3. Test connection
  - **Expected**: Red indicator. Error message about connection refused or timeout.
  - **Notes**: _______________



## Test Results Summary

**Date Completed:** _______________

### Automated Tests (Complete)
- **Total**: 2
- **PASS**: 2
- **FAIL**: 0
- **SKIP**: 0
- **Pass Rate**: 100%

### Manual Tests
- **Total**: 17
- **PASS**: ___
- **FAIL**: ___
- **SKIP**: ___
- **Pass Rate**: ___%

### Overall Phase 1
- **Total Tests**: 19 (2 automated + 17 manual)
- **PASS**: ___
- **FAIL**: ___
- **SKIP**: ___
- **Pass Rate**: ___%

### Critical Issues Found
1. _______________
2. _______________
3. _______________

### Notes & Observations
_______________
_______________
_______________

---

## Next Steps

After completing Phase 1:
- [ ] All tests pass → Proceed to Phase 2 (Functionality Testing)
- [ ] Some tests fail → Report failures for investigation
- [ ] Extension won't load → Check `chrome://extensions/` for errors

**Phase 2 Preview:** Single student grading, screenshot handling, provider switching, API key UX, batch grading
