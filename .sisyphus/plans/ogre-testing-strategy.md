# O.G.R.E Manual QA Playbook

## TL;DR

> **Quick Summary**: A step-by-step manual testing checklist for the user to verify connectivity, functionality, and edge cases across all O.G.R.E surfaces. User executes each test, records pass/fail, and reports findings.
> 
> **Surfaces Covered**: Chrome Extension, Desktop App, Grading Server, Batch Grading (MyOpenMath)
> **Available Providers**: Ollama (local), GitHub Models (token available)
> **Unavailable Providers**: Anthropic, Google Gemini, OpenAI (test error handling)
> **Estimated Time**: 60-90 minutes for full playbook
> **Format**: Check-off list — mark each test PASS/FAIL with notes

---

## How to Use This Playbook

1. Work through each section in order (they build on each other)
2. For each test, follow the **Steps** exactly
3. Compare what you see against **Expected Result**
4. Mark the checkbox: `[x]` for PASS, note any differences for FAIL
5. After completing a section, report your results back
6. I'll adapt follow-up tests based on your findings

**Legend:**
- `[ ]` = Not yet tested
- `[x]` = PASS
- `[!]` = FAIL (describe what happened)
- `[-]` = SKIP (not applicable to your setup)

---

## PHASE 1: CONNECTIVITY TESTING

### 1.1 Grading Server Health

> **Goal**: Verify the grading server starts and responds

- [ ] **Test 1.1.1: Server Startup**
  - **Steps**:
    1. Open a terminal
    2. Navigate to the `grading-server/` directory
    3. Run `bun run start` (or `node server.js`)
    4. Look at the terminal output
  - **Expected**: ASCII banner appears with "RUNNING" status, address `http://localhost:3456`
  - **Notes**: _______________

- [ ] **Test 1.1.2: Health Endpoint**
  - **Steps**:
    1. With server running, open browser and go to `http://localhost:3456/health`
    2. Or run in terminal: `curl http://localhost:3456/health`
  - **Expected**: Response `{"status":"ok"}`
  - **Notes**: _______________

- [ ] **Test 1.1.3: CORS Headers**
  - **Steps**:
    1. Run: `curl -v http://localhost:3456/health 2>&1 | findstr -i "access-control"`
  - **Expected**: Shows `Access-Control-Allow-Origin` header (should be `*`)
  - **Notes**: _______________

---

### 1.2 Chrome Extension ↔ Background Worker

> **Goal**: Verify the extension's internal messaging works

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

### 1.3 Ollama (Local) Connectivity

> **Goal**: Verify Ollama local connection works end-to-end
> **Prerequisite**: Ollama must be running locally (`ollama serve`)

- [ ] **Test 1.3.1: Ollama is Running**
  - **Steps**:
    1. Open terminal, run: `curl http://localhost:11434/api/tags`
  - **Expected**: Returns JSON with a `models` array (may be empty if no models pulled)
  - **Notes**: _______________

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
  - **Expected**: Dropdown populates with models you have pulled (e.g., `llama3`, `mistral`, etc.). If no models pulled, dropdown may be empty.
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

> **Goal**: Verify GitHub Models connection works
> **Prerequisite**: You have a GitHub token or Copilot subscription

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

> **Goal**: Verify graceful error handling when API keys are wrong/missing

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

---

### 1.6 Desktop App ↔ Grading Server Connectivity

> **Goal**: Verify the desktop app manages the grading server

- [ ] **Test 1.6.1: Desktop App Launch**
  - **Steps**:
    1. Launch the O.G.R.E desktop app from Windows Start Menu or shortcut
    2. Observe the application window
  - **Expected**: App window opens with the grading UI. Look for server status indicator.
  - **Notes**: _______________

- [ ] **Test 1.6.2: Integrated Server Status**
  - **Steps**:
    1. In the desktop app, look for a server status indicator or "Server" section
    2. Check if it shows the grading server as running
  - **Expected**: Indicator shows server running on localhost:3456 (or similar)
  - **Notes**: _______________

- [ ] **Test 1.6.3: Desktop ↔ Server Health**
  - **Steps**:
    1. With the desktop app running, open a browser and go to `http://localhost:3456/health`
  - **Expected**: Returns `{"status":"ok"}` — the desktop app started the server
  - **Notes**: _______________

- [ ] **Test 1.6.4: Desktop Provider Config Sync**
  - **Steps**:
    1. In the desktop app, configure an AI provider (e.g., Ollama with localhost URL)
    2. Check if the grading server received the config:
       - Try running a batch grade from the extension while desktop is running
       - Or check terminal output of grading server for config push logs
  - **Expected**: Server receives provider configuration from desktop app
  - **Notes**: _______________

---

## PHASE 2: FUNCTIONALITY TESTING

### 2.1 Single Student Grading (Extension)

> **Goal**: Verify the core grading workflow works end-to-end

- [ ] **Test 2.1.1: Enter Rubric Text**
  - **Steps**:
    1. Open O.G.R.E side panel
    2. Go to the Rubric section
    3. Type or paste a simple rubric:
       ```
       Grade on a scale of 0-10:
       - Understanding of concepts (4 points)
       - Use of examples (3 points)  
       - Clarity of explanation (3 points)
       ```
  - **Expected**: Rubric text appears in the input area. No errors.
  - **Notes**: _______________

- [ ] **Test 2.1.2: Capture Student Text**
  - **Steps**:
    1. Open any webpage with text (e.g., a Wikipedia article)
    2. Highlight a paragraph of text on the page
    3. In the side panel, click "Get Highlighted Text"
  - **Expected**: The highlighted text appears in the Student Work section of the side panel
  - **Notes**: _______________

- [ ] **Test 2.1.3: Run Assessment (Ollama)**
  - **Steps**:
    1. Ensure Ollama tab is selected with a working model
    2. Rubric is entered (from 2.1.1)
    3. Student text is captured (from 2.1.2)
    4. Click "Run Assessment"
  - **Expected**: Loading indicator appears. After a few seconds, AI-generated feedback appears with a score and detailed assessment.
  - **Notes**: _______________

- [ ] **Test 2.1.4: Run Assessment (GitHub Models)**
  - **Steps**:
    1. Switch to GitHub tab (with valid token)
    2. Select a model from the dropdown
    3. Same rubric and student text as before
    4. Click "Run Assessment"
  - **Expected**: AI-generated feedback appears. May differ from Ollama response.
  - **Notes**: _______________

- [ ] **Test 2.1.5: Streaming Response**
  - **Steps**:
    1. Run an assessment (any working provider)
    2. Watch the response area carefully as it generates
  - **Expected**: Text should appear word-by-word or chunk-by-chunk (streaming), NOT all at once after a long wait.
  - **Notes**: _______________

---

### 2.2 Screenshot & Image Handling

> **Goal**: Verify screenshot capture and image-based grading

- [ ] **Test 2.2.1: Screenshot Area Button**
  - **Steps**:
    1. Click "Screenshot Area" button in the side panel
    2. Draw a selection rectangle on the page
  - **Expected**: Screenshot is captured and appears as a thumbnail in the Student Work section
  - **Notes**: _______________

- [ ] **Test 2.2.2: Grade with Image (Vision Model)**
  - **Steps**:
    1. Capture a screenshot of some content (math problem, diagram, etc.)
    2. Select a vision-capable model:
       - Ollama: model with vision support (e.g., `llava`, `llama3.2-vision`)
       - GitHub: GPT-4o or similar vision model
    3. Enter a rubric
    4. Click "Run Assessment"
  - **Expected**: AI analyzes the image content and provides grading feedback that references what's in the image
  - **Notes**: _______________

- [ ] **Test 2.2.3: Image with Non-Vision Model**
  - **Steps**:
    1. Capture a screenshot
    2. Select a text-only model (one that doesn't support vision)
    3. Click "Run Assessment"
  - **Expected**: Either an error message about vision not supported, OR the model ignores the image and grades only the text
  - **Notes**: _______________

- [ ] **Test 2.2.4: Rubric Screenshot Import**
  - **Steps**:
    1. Click "Screenshot Area" in the Rubric section
    2. Capture a screenshot of a rubric (from a webpage, PDF, etc.)
    3. Click "Import Rubric from Screenshot"
  - **Expected**: The rubric image is parsed and converted into rubric text/table format
  - **Notes**: _______________

---

### 2.3 Provider Switching

> **Goal**: Verify switching between providers works smoothly

- [ ] **Test 2.3.1: Switch Provider Mid-Session**
  - **Steps**:
    1. Run an assessment with Ollama
    2. While the result is displayed, switch to GitHub tab
    3. Run the same assessment again
  - **Expected**: Both assessments complete without errors. Results may differ between providers.
  - **Notes**: _______________

- [ ] **Test 2.3.2: Provider State Persistence**
  - **Steps**:
    1. Configure Ollama with URL and model
    2. Configure GitHub with token and model
    3. Close the side panel completely
    4. Reopen the side panel
  - **Expected**: Both providers retain their configuration. Green indicators persist. Last used provider is selected.
  - **Notes**: _______________

- [ ] **Test 2.3.3: Switch to Unconfigured Provider**
  - **Steps**:
    1. Click on a provider tab you haven't configured (e.g., Claude with no API key)
    2. Try to run an assessment
  - **Expected**: Clear error message about missing API key. No crash. Assessment does not proceed.
  - **Notes**: _______________

---

### 2.4 API Key UX

> **Goal**: Verify API key masking, persistence, and link behavior

- [ ] **Test 2.4.1: Key Masking on Blur**
  - **Steps**:
    1. Click Claude tab
    2. Paste a test key: `sk-ant-test123456789abcdefghijklmnop`
    3. Click outside the input field
  - **Expected**: Key is masked: shows something like `sk-ant-...nop` with dots in the middle
  - **Notes**: _______________

- [ ] **Test 2.4.2: Key Reveals on Focus**
  - **Steps**:
    1. Click back into the API key field
  - **Expected**: Full key is revealed: `sk-ant-test123456789abcdefghijklmnop`
  - **Notes**: _______________

- [ ] **Test 2.4.3: Get API Key Links**
  - **Steps**:
    1. On each provider tab (Claude, Gemini, OpenAI), look for a "Get API Key" link
    2. Click each link
  - **Expected**: 
    - Claude → opens `https://console.anthropic.com/settings/keys`
    - Gemini → opens `https://aistudio.google.com/app/apikey`
    - OpenAI → opens `https://platform.openai.com/api-keys`
  - **Notes**: _______________

---

### 2.5 Batch Grading (MyOpenMath)

> **Goal**: Verify batch grading workflow on a real MyOpenMath page
> **Prerequisite**: Navigate to a MyOpenMath "Grade All" page (gradeallq2.php or similar)

- [ ] **Test 2.5.1: Batch Mode Activation**
  - **Steps**:
    1. Open a MyOpenMath grading page in Chrome
    2. Open O.G.R.E side panel
    3. Switch to "Batch" mode (look for a mode toggle at bottom of config section)
  - **Expected**: UI changes to show batch grading controls (Start Batch, student count, etc.)
  - **Notes**: _______________

- [ ] **Test 2.5.2: Student Extraction**
  - **Steps**:
    1. In batch mode, the extension should detect students on the page
    2. Look for a student count or list
  - **Expected**: Extension shows the number of students found on the page (e.g., "25 students detected")
  - **Notes**: _______________

- [ ] **Test 2.5.3: Start Batch Grading**
  - **Steps**:
    1. Ensure a working provider is selected (Ollama or GitHub)
    2. Enter a rubric or ensure one is loaded
    3. Click "Start Batch"
    4. Watch the progress
  - **Expected**: 
    - Progress indicator shows grading advancing (student 1/N, 2/N, etc.)
    - Scores and feedback are filled into the grading page
    - Each student gets a score and feedback
  - **Notes**: _______________

- [ ] **Test 2.5.4: Batch Grading with Server**
  - **Steps**:
    1. Ensure grading server is running (`http://localhost:3456/health` returns ok)
    2. Start batch grading on a MyOpenMath page
    3. Check the grading server terminal for activity logs
  - **Expected**: Server shows it received a batch grading request. Extension uses server mode (all students in one batch) instead of per-student mode.
  - **Notes**: _______________

- [ ] **Test 2.5.5: Batch Grading WITHOUT Server**
  - **Steps**:
    1. Stop the grading server (close terminal or Ctrl+C)
    2. Start batch grading on a MyOpenMath page
  - **Expected**: Extension falls back to per-student mode. Grading still works but processes one student at a time instead of batching.
  - **Notes**: _______________

- [ ] **Test 2.5.6: Grading Instructions**
  - **Steps**:
    1. In batch mode, expand "Grading Instructions" section
    2. Add custom instructions like "Be lenient with partial answers" or "Non-Zero Only"
    3. Start batch grading
  - **Expected**: Grading instructions are applied — feedback tone should reflect the instructions
  - **Notes**: _______________

---

### 2.6 Desktop App Functionality

> **Goal**: Verify desktop-specific features

- [ ] **Test 2.6.1: Desktop Grading UI**
  - **Steps**:
    1. In the desktop app, perform a single-student grading:
       - Enter a rubric
       - Enter/paste student work
       - Select a provider and model
       - Run assessment
  - **Expected**: Same grading experience as the extension. AI feedback appears.
  - **Notes**: _______________

- [ ] **Test 2.6.2: Auto-Update Check**
  - **Steps**:
    1. Launch the desktop app
    2. Look for an update indicator or check "About" section
  - **Expected**: App checks for updates on startup. Either shows "Up to date" or offers an update if available.
  - **Notes**: _______________

- [ ] **Test 2.6.3: Desktop Provider Configuration**
  - **Steps**:
    1. Configure Ollama in the desktop app
    2. Switch to GitHub Models tab and configure
    3. Close and reopen the desktop app
  - **Expected**: All provider configs persist across app restarts
  - **Notes**: _______________

---

## PHASE 3: EDGE CASES & ERROR HANDLING

### 3.1 Network & Connectivity Edge Cases

- [ ] **Test 3.1.1: Grade While Offline**
  - **Steps**:
    1. Disconnect from the internet (disable WiFi/Ethernet)
    2. Try to grade using a CLOUD provider (GitHub Models)
    3. Click "Run Assessment"
  - **Expected**: Clear error message about network connectivity. No crash. No infinite loading.
  - **Notes**: _______________

- [ ] **Test 3.1.2: Grade with Local Ollama While Offline**
  - **Steps**:
    1. Stay offline (or at least with Ollama still running locally)
    2. Switch to Ollama with localhost URL
    3. Run assessment
  - **Expected**: Grading works normally — local Ollama doesn't need internet
  - **Notes**: _______________

- [ ] **Test 3.1.3: Server Dies Mid-Batch**
  - **Steps**:
    1. Start batch grading on a MyOpenMath page (with grading server running)
    2. While grading is in progress (watch the progress indicator), kill the grading server (close terminal)
    3. Observe what happens in the extension
  - **Expected**: Extension detects server failure, either shows error or falls back to per-student mode. Does NOT freeze or crash.
  - **Notes**: _______________

- [ ] **Test 3.1.4: Ollama Stopped Mid-Grade**
  - **Steps**:
    1. Start a single-student grading with Ollama
    2. While the response is streaming, stop Ollama (`taskkill /f /im ollama.exe` or close Ollama)
  - **Expected**: Error message appears. Partial response may be shown. No infinite loading spinner.
  - **Notes**: _______________

---

### 3.2 Input Edge Cases

- [ ] **Test 3.2.1: Empty Rubric**
  - **Steps**:
    1. Leave the rubric field completely empty
    2. Enter some student work text
    3. Click "Run Assessment"
  - **Expected**: Error message about missing rubric, OR the AI grades without rubric context (may give generic feedback)
  - **Notes**: _______________

- [ ] **Test 3.2.2: Empty Student Work**
  - **Steps**:
    1. Enter a rubric
    2. Leave student work completely empty
    3. Click "Run Assessment"
  - **Expected**: Error message about missing student work, OR the AI gives a 0 score with appropriate feedback
  - **Notes**: _______________

- [ ] **Test 3.2.3: Very Long Rubric**
  - **Steps**:
    1. Paste a very long rubric (2000+ words — copy a long passage from any website)
    2. Enter brief student work
    3. Run assessment
  - **Expected**: Assessment completes (may be slow). No truncation errors.
  - **Notes**: _______________

- [ ] **Test 3.2.4: Very Long Student Response**
  - **Steps**:
    1. Enter a brief rubric
    2. Paste very long student work (2000+ words)
    3. Run assessment
  - **Expected**: Assessment completes. AI provides feedback covering the full response.
  - **Notes**: _______________

- [ ] **Test 3.2.5: Special Characters in Rubric**
  - **Steps**:
    1. Enter rubric with special chars: `Grade: 50% → "A+" or <excellent>; use {curly} & [square] brackets`
    2. Run assessment
  - **Expected**: Special characters don't break the API call or response parsing. Assessment completes.
  - **Notes**: _______________

- [ ] **Test 3.2.6: Unicode / Non-English Text**
  - **Steps**:
    1. Enter rubric or student work in non-English: `Bewerten Sie: Verständnis (5 Punkte), Beispiele (3 Punkte)`
    2. Run assessment
  - **Expected**: AI processes non-English text. Response may be in the same language or English.
  - **Notes**: _______________

---

### 3.3 Batch Grading Edge Cases

- [ ] **Test 3.3.1: Cancel Batch Mid-Run**
  - **Steps**:
    1. Start batch grading on a page with multiple students
    2. After 2-3 students are graded, click "Cancel" or "Stop"
  - **Expected**: Grading stops. Already-graded students keep their scores. Ungraded students are untouched.
  - **Notes**: _______________

- [ ] **Test 3.3.2: Resume Interrupted Batch**
  - **Steps**:
    1. Start batch grading on a page
    2. After a few students are graded, cancel or close the side panel
    3. Reopen the side panel on the same MyOpenMath page
  - **Expected**: Extension detects partially graded session. Offers "Resume" option to continue from where it left off.
  - **Notes**: _______________

- [ ] **Test 3.3.3: Batch with Students Already Graded**
  - **Steps**:
    1. On a MyOpenMath page where some students already have scores/feedback
    2. Start batch grading
  - **Expected**: Extension either skips already-graded students or asks whether to re-grade them
  - **Notes**: _______________

- [ ] **Test 3.3.4: Page with 1 Student**
  - **Steps**:
    1. Navigate to a grading page with only 1 student response
    2. Start batch grading
  - **Expected**: Works correctly for single-student batch. Score and feedback filled in.
  - **Notes**: _______________

- [ ] **Test 3.3.5: Student with Empty Response**
  - **Steps**:
    1. On a grading page, find or create a scenario where a student submitted no response
    2. Run batch grading
  - **Expected**: Empty response gets scored 0 with appropriate feedback like "No response submitted"
  - **Notes**: _______________

- [ ] **Test 3.3.6: Navigate Away During Batch**
  - **Steps**:
    1. Start batch grading
    2. Navigate to a different webpage (click a link or enter new URL)
  - **Expected**: Batch grading stops (since the grading page is gone). No errors in background. Progress is saved.
  - **Notes**: _______________

---

### 3.4 Provider-Specific Edge Cases

- [ ] **Test 3.4.1: Ollama Model Not Found**
  - **Steps**:
    1. In Ollama tab, manually type a non-existent model name if possible, or note the behavior
    2. Try to run assessment
  - **Expected**: Error message about model not found. No crash.
  - **Notes**: _______________

- [ ] **Test 3.4.2: GitHub Rate Limit Simulation**
  - **Steps**:
    1. Run multiple assessments rapidly with GitHub Models (5+ in quick succession)
    2. Watch for rate limiting behavior
  - **Expected**: Either continues working or shows a rate limit error message. Does not crash.
  - **Notes**: _______________

- [ ] **Test 3.4.3: Token Expiry (GitHub)**
  - **Steps**:
    1. If using OAuth: sign in to GitHub
    2. Wait for a long time (or manually check when token was issued)
    3. Try to run assessment
  - **Expected**: If token expired, extension either refreshes automatically or shows re-auth prompt
  - **Notes**: _______________

---

### 3.5 UI & UX Edge Cases

- [ ] **Test 3.5.1: Rapid Click Run Assessment**
  - **Steps**:
    1. Set up a valid grading request
    2. Click "Run Assessment" 3 times rapidly
  - **Expected**: Only one assessment runs. Button should disable after first click or ignore duplicate clicks.
  - **Notes**: _______________

- [ ] **Test 3.5.2: Switch Tabs While Grading**
  - **Steps**:
    1. Click "Run Assessment" (with a slower model for longer response)
    2. While the response is streaming, switch provider tabs
  - **Expected**: Either the streaming stops gracefully, or it continues and shows the result. No orphaned state.
  - **Notes**: _______________

- [ ] **Test 3.5.3: Very Small Side Panel**
  - **Steps**:
    1. Resize the side panel to be very narrow (drag the divider)
    2. Check if UI elements are still usable
  - **Expected**: UI elements wrap or scroll. No critical buttons are hidden or cut off.
  - **Notes**: _______________

- [ ] **Test 3.5.4: Multiple Screenshots**
  - **Steps**:
    1. Capture 3-4 screenshots of student work (click Screenshot Area multiple times)
    2. Check the student work section
  - **Expected**: All screenshots appear as thumbnails. User can remove individual screenshots or add to them.
  - **Notes**: _______________

- [ ] **Test 3.5.5: Clear/Reset State**
  - **Steps**:
    1. Enter rubric, capture student work, get a grading result
    2. Look for a "Clear" or "Reset" button
    3. Click it
  - **Expected**: All fields are cleared — rubric, student work, and results. Ready for fresh grading.
  - **Notes**: _______________

---

### 3.6 Desktop App Edge Cases

- [ ] **Test 3.6.1: Launch While Server Port in Use**
  - **Steps**:
    1. Start the grading server manually in terminal (`bun run start` in grading-server/)
    2. Then launch the desktop app (which also tries to start the server)
  - **Expected**: Desktop app either detects existing server and uses it, or shows port conflict error. Does not crash.
  - **Notes**: _______________

- [ ] **Test 3.6.2: Close Desktop App Behavior**
  - **Steps**:
    1. Launch desktop app
    2. Close the main window (click X)
    3. Check if the grading server is still running: `curl http://localhost:3456/health`
  - **Expected**: Document what happens — does the server stop? Does the app minimize to tray?
  - **Notes**: _______________

- [ ] **Test 3.6.3: Desktop + Extension Simultaneously**
  - **Steps**:
    1. Have the desktop app running
    2. Also have the Chrome extension open
    3. Try grading from BOTH — first from extension, then from desktop
  - **Expected**: Both should work. They may share the same grading server on port 3456.
  - **Notes**: _______________

---

## PHASE 4: CROSS-SURFACE INTEGRATION

### 4.1 Extension + Server Integration

- [ ] **Test 4.1.1: Extension Detects Server**
  - **Steps**:
    1. Start grading server
    2. Open extension, switch to Batch mode
    3. Look for server detection indicator
  - **Expected**: Extension shows server is available (e.g., "Server connected" or batch mode is enhanced)
  - **Notes**: _______________

- [ ] **Test 4.1.2: Extension Falls Back Without Server**
  - **Steps**:
    1. Stop grading server
    2. Try batch grading from extension
  - **Expected**: Extension works in per-student mode. May show "Server not available, using individual mode" or similar.
  - **Notes**: _______________

### 4.2 Desktop + Server + Extension Chain

- [ ] **Test 4.2.1: Full Stack Integration**
  - **Steps**:
    1. Launch desktop app (which starts integrated server)
    2. Open Chrome extension
    3. Navigate to MyOpenMath grading page
    4. Run batch grading from the extension
    5. Watch desktop app AND extension for activity
  - **Expected**: 
    - Extension detects the server started by the desktop app
    - Batch grading uses the server
    - Desktop app may show grading activity/logs
    - Everything works together
  - **Notes**: _______________

---

## Results Summary Template

After completing all tests, fill in this summary:

```
## Test Results Summary
Date: ________
Tester: ________

### Phase 1: Connectivity
- Total tests: 19
- PASS: __
- FAIL: __
- SKIP: __
- Critical failures: _______________

### Phase 2: Functionality  
- Total tests: 17
- PASS: __
- FAIL: __
- SKIP: __
- Critical failures: _______________

### Phase 3: Edge Cases
- Total tests: 18
- PASS: __
- FAIL: __
- SKIP: __
- Critical failures: _______________

### Phase 4: Integration
- Total tests: 3
- PASS: __
- FAIL: __
- SKIP: __
- Critical failures: _______________

### Overall
- Total: 57 tests
- Pass rate: __/%
- Top issues found:
  1. _______________
  2. _______________
  3. _______________
```

---

## After Testing: Next Steps

Once you complete the playbook, report your results back. I will:
1. Analyze failures and categorize them (bug, config issue, expected behavior)
2. Prioritize fixes based on severity
3. Create targeted fix plans for each issue discovered
4. Suggest follow-up tests for any areas that need deeper investigation
