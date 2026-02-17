# Phase 1 Manual Testing Guide

**Automated tests are complete. This guide helps you complete the remaining manual tests.**

---

## Quick Status

✅ **Already Complete (Automated)**
- Grading server running on `http://localhost:3456` ✓
- Ollama running on `http://localhost:11434` ✓
- 18 Ollama models detected ✓
- Extension files validated ✓

⏳ **Needs Your Testing (Manual)**
- Load extension in Chrome
- Test provider connections
- Verify error handling
- Test desktop app (optional)

---

## ⚠️ CRITICAL: Test Order Matters!

**You MUST test the Desktop App FIRST before testing the Extension.**

The Desktop App automatically manages the grading server. Testing the extension first will give false negatives because the server won't be running.

### Correct Order:
1. **Desktop App Tests** (Section 1.6) → Starts the server
2. **Extension Tests** (Sections 1.2-1.5) → Uses the desktop-managed server

---

## Step-by-Step Instructions

### STEP 0: Launch Desktop App (DO THIS FIRST!)

**This is NOT optional - the desktop app starts the grading server.**

1. **Open O.G.R.E Desktop App**:
   - Look in Windows Start Menu
   - Or find desktop shortcut
   - Or navigate to installation directory

2. **Wait for app to initialize**:
   - App window should open
   - Look for "Server Running" or similar indicator
   - Should show `localhost:3456` or port 3456

3. **Verify server started**:
   - Open a browser or terminal
   - Go to: `http://localhost:3456/health`
   - Should return: `{"status":"ok"}`
   - If yes → Mark **Test 1.6.1 as [x]** and **Test 1.6.3 as [x]**
   - If no → Mark both as [!] and note the error

4. **Check server status in app**:
   - Look for server indicator in the desktop app UI
   - Should show "Running" or green indicator
   - If visible → Mark **Test 1.6.2 as [x]**
   - If not → Mark **Test 1.6.2 as [!]**

**⚠️ DO NOT PROCEED to extension tests until the desktop app is running and the server is healthy!**

---

### STEP 1: Load the Chrome Extension

1. Open Chrome and go to: `chrome://extensions/`

2. **Enable Developer Mode**:
   - Look for toggle in top-right corner
   - Turn it ON

3. **Load the Extension**:
   - Click "Load unpacked" button
   - Navigate to: `C:\Users\shuff\OneDrive\Documents\GitHub\O.G.R.E-OllamaGradingReviewEvaluator`
   - Click "Select Folder"

4. **Check for Errors**:
   - Look for the extension card: "O.G.R.E-OllamaGradingRubricEvaluator"
   - Check if there's a red "Errors" button
   - If no errors → Mark **Test 1.2.1 as [x]**
   - If errors → Mark **Test 1.2.1 as [!]** and note the error

---

### STEP 2: Open the Side Panel

1. **Click the extension icon** in Chrome toolbar
   - Look for the O.G.R.E icon (should be a green badge or similar)

2. **Verify side panel opens**:
   - Panel should slide in from the right
   - Should show the grading UI
   - If it opens → Mark **Test 1.2.2 as [x]**
   - If it doesn't → Mark **Test 1.2.2 as [!]** and describe what happened

---

### STEP 3: Check Provider Tabs

1. **Look at the top of the side panel**
   - Should see a dropdown or tabs for providers

2. **Count the providers**:
   - Expected: Ollama, OpenAI, Claude, Gemini, GitHub
   - If you see all 5 → Mark **Test 1.2.3 as [x]**
   - If missing any → Mark **Test 1.2.3 as [!]** and list which are missing

---

### STEP 4: Test Ollama Connection

1. **Select Ollama provider** from dropdown

2. **Check API URL field**:
   - Should show `http://localhost:11434`
   - If not, enter it manually

3. **Test connection**:
   - Look for "Test Connection" button or wait for auto-test
   - Should see green indicator
   - Status should say "Connected successfully"
   - If green → Mark **Test 1.3.2 as [x]**
   - If red → Mark **Test 1.3.2 as [!]** and note the error

4. **Check Model Dropdown**:
   - Click the Model dropdown
   - Should list your 18 models including:
     - `gpt-oss:120b-cloud`
     - `deepseek-v3.2:cloud`
     - `gemma3:latest`
     - `qwen2.5-coder:latest`
   - If models appear → Mark **Test 1.3.3 as [x]**
   - If empty or error → Mark **Test 1.3.3 as [!]** and note what you see

5. **Test Persistence**:
   - Select any model
   - Close the side panel
   - Reopen the side panel
   - Check if the same model is still selected
   - If yes → Mark **Test 1.3.4 as [x]**
   - If no → Mark **Test 1.3.4 as [!]**

---

### STEP 5: Test GitHub Models (If You Have Token)

1. **Click GitHub provider**

2. **Check UI**:
   - Should see "Sign in with GitHub" button OR token field
   - Mark **Test 1.4.1 as [x]** if you see auth options
   - Mark **Test 1.4.1 as [!]** if UI is broken

3. **Authenticate**:
   - If using token: paste it
   - If using OAuth: click "Sign in with GitHub"
   - Wait for connection test
   - If green indicator → Mark **Test 1.4.2 as [x]**
   - If error → Mark **Test 1.4.2 as [!]** and note the error

4. **Check Models**:
   - Click Model dropdown
   - Should show GitHub Copilot models
   - If models appear → Mark **Test 1.4.3 as [x]**
   - If not → Mark **Test 1.4.3 as [!]**

---

### STEP 6: Test Error Handling

These tests verify the extension handles bad inputs gracefully.

**Test 1.5.1: Invalid Claude Key**
1. Click "Claude" provider
2. Enter: `sk-ant-FAKE123456789`
3. Wait for connection test
4. Expect: Red indicator + 401/Unauthorized error
5. Mark [x] if you see error, [!] if it crashes

**Test 1.5.2: Invalid OpenAI Key**
1. Click "OpenAI" provider
2. Enter: `sk-FAKE123456789`
3. Expect: Red indicator + unauthorized error
4. Mark accordingly

**Test 1.5.3: Invalid Gemini Key**
1. Click "Gemini" provider
2. Enter: `AIzaFAKEKEY123`
3. Expect: Red indicator + invalid key error
4. Mark accordingly

**Test 1.5.4: Empty API Key**
1. On any provider, leave API key field empty
2. Try to test connection
3. Expect: Error message or test doesn't run (no crash)
4. Mark accordingly

**Test 1.5.5: Wrong Ollama URL**
1. Click Ollama provider
2. Change URL to: `http://localhost:99999`
3. Test connection
4. Expect: Red indicator + connection refused error
5. Mark accordingly

---

### STEP 7: Desktop Provider Config Sync

**This tests whether the desktop app and extension communicate.**

1. **Configure a provider in Desktop App**:
   - In the desktop app, select Ollama
   - Set URL to `http://localhost:11434`
   - Select a model from dropdown

2. **Check if extension detects it**:
   - Open extension side panel
   - Look for "Desktop App Connected" banner or similar
   - Provider should auto-populate from desktop app

3. **Test batch grading**:
   - Navigate to a MyOpenMath grading page (if available)
   - Start batch grading from extension
   - Check desktop app terminal/logs for activity

4. **Mark results**:
   - If desktop and extension communicate → Mark **Test 1.6.4 as [x]**
   - If they don't sync → Mark **Test 1.6.4 as [!]** and describe behavior

---

## Quick Checklist Summary

Copy this to your checklist as you go:

```
MANUAL TESTS COMPLETION (IN ORDER!):

DESKTOP APP TESTS (DO FIRST):
[ ] 1.6.1 - Desktop app launches
[ ] 1.6.2 - Desktop server status shown
[ ] 1.6.3 - Desktop server health (curl test)
[ ] 1.6.4 - Desktop config sync

EXTENSION TESTS (DO AFTER DESKTOP):
[ ] 1.2.1 - Extension loads
[ ] 1.2.2 - Side panel opens
[ ] 1.2.3 - Provider tabs visible
[ ] 1.3.2 - Ollama connects
[ ] 1.3.3 - Ollama models load
[ ] 1.3.4 - Model selection persists
[ ] 1.4.1 - GitHub UI present
[ ] 1.4.2 - GitHub auth works
[ ] 1.4.3 - GitHub models load
[ ] 1.5.1 - Invalid Claude key error
[ ] 1.5.2 - Invalid OpenAI key error
[ ] 1.5.3 - Invalid Gemini key error
[ ] 1.5.4 - Empty key handled
[ ] 1.5.5 - Wrong Ollama URL error
```

---

## After Testing

Once you've completed all tests:

1. **Count your results**:
   - How many [x] (pass)?
   - How many [!] (fail)?
   - How many [-] (skip)?

2. **Calculate pass rate**:
   - Pass rate = (pass / (pass + fail)) × 100%

3. **List critical failures**:
   - Any tests that block basic functionality

4. **Report back** with your findings

---

## Troubleshooting

**Extension won't load?**
- Check for syntax errors in manifest.json
- Look for errors in `chrome://extensions/`
- Try reloading the extension

**Side panel won't open?**
- Try right-click extension icon → "Open side panel"
- Check Chrome version (needs 114+)
- Try restarting Chrome

**Ollama not connecting?**
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check firewall settings
- Try restarting Ollama

**GitHub auth fails?**
- Check if OAuth app is configured
- Try using Personal Access Token instead
- Verify token has correct permissions

---

**Good luck with testing! Report back when done.**
