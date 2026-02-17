# 🚀 Phase 1 Testing - Start Here

## ✅ You're Ready to Test!

**Ollama is running. Extension is ready. Now test the UI.**

---

## ⚠️ IMPORTANT: Start Desktop App First

**The Desktop App manages the grading server automatically.**

### Step 0: Launch Desktop App
```
1. Open O.G.R.E Desktop App from Start Menu
2. App will automatically start the integrated grading server
3. Look for "Server Running" indicator in the app
4. Verify: curl http://localhost:3456/health
   Should return: {"status":"ok"}
```

**Once desktop app is running, proceed with extension tests:**

---

## Quick Start (5 Steps)

### 1️⃣ Load Extension
```
1. Open Chrome → chrome://extensions/
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select this folder
5. Look for "O.G.R.E-OllamaGradingRubricEvaluator"
```

### 2️⃣ Open Side Panel
```
1. Click O.G.R.E extension icon in toolbar
2. Side panel should slide in from right
3. You should see provider dropdown and settings
```

### 3️⃣ Test Ollama Connection
```
1. Select "Ollama" from provider dropdown
2. Verify URL shows: http://localhost:11434
3. Wait for auto-test or click "Test Connection"
4. Should see GREEN indicator
5. Model dropdown should show 18 models
```

### 4️⃣ Test Error Handling
```
1. Select "Claude" provider
2. Enter fake key: sk-ant-FAKE123456789
3. Should see RED indicator with error
4. No crash = PASS
```

### 5️⃣ Fill Out Checklist
```
Open: PHASE1_CONNECTIVITY_CHECKLIST.md
Mark each test: [x] pass, [!] fail, [-] skip
```

---

## 📚 Full Documentation

**Need detailed instructions?**
→ See `MANUAL_TEST_GUIDE.md`

**Want to track results?**
→ Use `PHASE1_CONNECTIVITY_CHECKLIST.md`

**Want current status?**
→ Read `PHASE1_SUMMARY.md`

---

## ⚡ Already Done (Automated)

✅ Ollama running with 18 models  
✅ Extension files validated  
⏳ Grading server (will start with Desktop App)  

---

## 🎯 Your Mission

**Test these 19 items (in order):**

### Desktop App Tests (4 tests - DO FIRST)
- Desktop app launches
- Server status shown in app
- Server responds at localhost:3456
- Provider config syncs to server

### Extension Tests (11 tests - DO AFTER DESKTOP)
- Extension loads without errors
- Side panel opens
- Provider tabs visible
- Ollama connects (green indicator)
- Model dropdown works (18 models)
- Selection persists after reload
- GitHub auth UI present
- Error handling (5 tests for invalid keys)

---

## 🆘 Need Help?

**Extension won't load?**
- Check `chrome://extensions/` for errors
- Try reloading the extension
- Check manifest.json syntax

**Ollama won't connect?**
- Verify: `curl http://localhost:11434/api/tags`
- Should return JSON with models
- Already verified by automated tests ✓

**Side panel won't open?**
- Right-click icon → "Open side panel"
- Chrome version 114+ required
- Try restarting Chrome

---

## 📊 Report Results

After testing, tell me:
1. How many passed [x]?
2. How many failed [!]?
3. Any critical blockers?

Then we'll either:
- ✅ Move to Phase 2 (if all pass)
- 🔧 Debug failures (if any issues)

---

**Estimated time: 15-20 minutes**

**Status: Ready to start! 🎉**
