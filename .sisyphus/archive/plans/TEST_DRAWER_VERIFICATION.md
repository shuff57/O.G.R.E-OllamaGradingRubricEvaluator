# Drawer UI Verification Checklist

## Implementation Summary

The GradingPanel has been converted from a **sidebar layout** to a **floating overlay drawer**:

### Key Changes:
1. **Browser.svelte**:
   - ✅ Removed `gradingPanelCollapsed` and `gradingPanelWidth` state variables
   - ✅ Updated webview bounds to use full window width (no panel offset)
   - ✅ Removed reactive dependencies on panel state
   - ✅ Toggle button in nav bar now controls `showGradingPanel` visibility

2. **GradingPanel.svelte**:
   - ✅ Changed from `$props()` to internal `$state()` for `isCollapsed` and `width`
   - ✅ Changed CSS to `position: fixed; top: 0; right: 0; z-index: 1000`
   - ✅ Added `box-shadow` for visual depth
   - ✅ Preserved all functionality (4 modes, screenshot, rubric, batch, etc.)

3. **Build Status**:
   - ✅ Build successful (`npm run build` completed without errors)
   - ✅ All components properly imported
   - ✅ No TypeScript/Svelte compilation errors

---

## Manual Testing Checklist

### 1. Drawer Visibility & Positioning

**Test:** Open/close drawer via toggle button
- [ ] Click the grading panel toggle button in Browser.svelte nav bar (right side, vertical split icon)
- [ ] Drawer slides in from right edge as overlay
- [ ] Drawer does NOT shift webview content left
- [ ] Webview remains full-width behind drawer
- [ ] Drawer has subtle drop shadow

**Test:** Drawer collapse/expand
- [ ] Click collapse button inside drawer (top-right arrow icon)
- [ ] Drawer collapses to 60px width (shows only icons)
- [ ] Click expand button
- [ ] Drawer expands to 400px width (shows full content)

**Expected Result:** Drawer behaves as overlay, webview always full-width

---

### 2. Mode Switching

**Test:** Switch between all 4 modes
- [ ] Open drawer
- [ ] Click "Grader" mode tab → ProviderSelector + RubricCard + StudentWorkCard visible
- [ ] Click "Solver" mode tab → SolverChat visible
- [ ] Click "Batch" mode tab → ProviderSelector + RubricCard + BatchPanel visible
- [ ] Click "Discovery" mode tab → ProviderSelector + DiscoveryPanel visible

**Expected Result:** All modes render correctly, no layout issues

---

### 3. Screenshot Capture Flow

**Test:** Screenshot overlay interaction with drawer
- [ ] Open drawer, select "Grader" mode
- [ ] Click "Screenshot Area" button in StudentWorkCard
- [ ] Webview hides, ScreenshotOverlay appears with captured image
- [ ] Overlay covers ENTIRE screen including drawer area (z-index: 9999 > 1000)
- [ ] Draw selection rectangle
- [ ] Release mouse → cropped screenshot appears in StudentWorkCard
- [ ] ScreenshotOverlay closes, webview reappears

**Test:** Screenshot while drawer collapsed
- [ ] Collapse drawer to 60px
- [ ] Trigger screenshot
- [ ] Overlay still covers entire screen
- [ ] Screenshot captures full webview content (not obscured by drawer)

**Expected Result:** Overlay always on top, captures work correctly

---

### 4. Grading Functionality (4 Modes)

#### Mode 1: Grader
- [ ] Select provider and model (Ollama/OpenAI/Claude/Gemini/GitHub)
- [ ] Select or create a rubric
- [ ] Add student work (text or screenshot)
- [ ] Click "Run Assessment"
- [ ] SSE streaming displays score and feedback in real-time
- [ ] Results appear in output section

#### Mode 2: Solver
- [ ] Enter a problem/question in SolverChat
- [ ] Submit
- [ ] AI provides step-by-step solution
- [ ] Chat history persists

#### Mode 3: Batch
- [ ] Navigate webview to a grading page (e.g., MyOpenMath)
- [ ] Load a rubric
- [ ] Configure grading instructions
- [ ] Click "Start Batch"
- [ ] BatchPanel discovers students automatically
- [ ] Grades each student sequentially
- [ ] Progress bar updates
- [ ] Resume capability works if interrupted

#### Mode 4: Discovery
- [ ] Navigate to a grading site
- [ ] Click "Start Discovery"
- [ ] Element picker activates (hover highlights)
- [ ] Select rubric element, student name element, work element
- [ ] Profile saved successfully
- [ ] Profile can be loaded in Batch mode

**Expected Result:** All grading features work identically to sidebar version

---

### 5. Provider/OAuth Integration

**Test:** OAuth sign-in (Google Gemini & GitHub)
- [ ] Select Gemini provider
- [ ] Click "Sign in with Google" button
- [ ] OAuth popup opens
- [ ] Complete sign-in
- [ ] "Signed in" status appears
- [ ] Model dropdown populates

**Test:** API Key providers
- [ ] Select OpenAI/Anthropic/Ollama provider
- [ ] Enter API key
- [ ] Test connection
- [ ] Model list fetches successfully

**Expected Result:** All provider authentication methods work

---

### 6. Webview Bounds Verification

**Test:** Webview uses full width
- [ ] Open drawer
- [ ] Verify webview content extends full width behind drawer
- [ ] Drawer overlays on top without pushing content left
- [ ] Close drawer
- [ ] Webview still full width
- [ ] Resize window
- [ ] Webview bounds update correctly (no gaps)

**Test:** Presets panel interaction
- [ ] Toggle presets panel (open/close)
- [ ] Webview bounds update to account for presets height
- [ ] Drawer position remains fixed at top-right

**Expected Result:** Webview always full-width, bounds update correctly

---

### 7. State Persistence

**Test:** Drawer state persists across navigation
- [ ] Open drawer, select a mode (e.g., Grader)
- [ ] Navigate webview to different URL
- [ ] Drawer remains open in same mode
- [ ] Provider/model/rubric selection preserved

**Test:** Collapse state persists
- [ ] Collapse drawer
- [ ] Switch between different app pages (Dashboard, Settings, etc.)
- [ ] Return to Browser page
- [ ] Drawer remains collapsed

**Expected Result:** State persists as expected

---

### 8. Keyboard Shortcuts

**Test:** Ctrl+B toggle
- [ ] Press `Ctrl+B` → Drawer toggles collapse/expand
- [ ] Works when drawer is open
- [ ] Works when drawer is closed (if `showGradingPanel = true`)

**Test:** Escape key
- [ ] Open drawer, press `Escape`
- [ ] Drawer collapses (if not already collapsed)

**Test:** Ctrl+Enter (in grader mode)
- [ ] Enter student work
- [ ] Press `Ctrl+Enter`
- [ ] Assessment runs

**Expected Result:** All shortcuts work as documented

---

### 9. Edge Cases

**Test:** Batch grading with drawer
- [ ] Start batch grading
- [ ] Mode tabs disable (cannot switch during batch)
- [ ] Try to switch modes → buttons disabled
- [ ] Complete or cancel batch → mode tabs re-enable

**Test:** Multiple screenshots
- [ ] Capture 3+ screenshots in Grader mode
- [ ] All appear in screenshots list
- [ ] Remove individual screenshots
- [ ] List updates correctly

**Test:** Drawer while webview loading
- [ ] Navigate webview to slow-loading page
- [ ] Open/close drawer during load
- [ ] No crashes or layout issues

**Expected Result:** No errors, graceful handling

---

## Build & Performance Verification

### Build Output Check:
```bash
cd ogre-desktop
npm run build
```
- [x] Build completes successfully
- [x] No TypeScript errors
- [x] No Svelte compilation errors
- [x] Bundle size acceptable (~1.38 MB)

### Dev Mode Check:
```bash
cd ogre-desktop
npm run tauri:dev
```
- [ ] App launches without errors
- [ ] Hot-reload works for frontend changes
- [ ] Console shows no runtime errors

---

## Known Issues / Notes

1. **A11y warnings**: Several accessibility warnings exist for form labels (pre-existing, not introduced by drawer changes)
2. **Large bundle warning**: Bundle size is 1.38 MB (acceptable for desktop app with KaTeX fonts)
3. **ScreenshotOverlay z-index**: Correctly set to 9999 (higher than drawer's 1000)
4. **Webview bounds**: Now calculated without grading panel offset (line 91 in Browser.svelte)

---

## Rollback Plan (If Issues Found)

If critical issues are discovered:

1. **Revert commits**:
   ```bash
   git log --oneline  # Find commit hash before drawer changes
   git revert <commit-hash>
   ```

2. **Or restore from backup**:
   - Restore Browser.svelte and GradingPanel.svelte from git history
   - Run `npm run build` to verify

3. **Report issues**: Document specific failures with screenshots

---

## Success Criteria

All of the following must pass:

- ✅ Build completes without errors
- [ ] Drawer opens/closes smoothly as overlay
- [ ] Webview uses full width (no layout shift)
- [ ] All 4 grading modes work identically
- [ ] Screenshot capture works with drawer visible
- [ ] Provider/OAuth integration works
- [ ] State persists across navigation
- [ ] No console errors during normal usage

---

## Next Steps

1. **Manual testing** — Run through this entire checklist
2. **Fix any issues** — Address failures found during testing
3. **Documentation update** — Update user docs if UI changed significantly
4. **Commit changes** — Create atomic commit with detailed message
5. **Tag release** — If all tests pass, prepare release build
