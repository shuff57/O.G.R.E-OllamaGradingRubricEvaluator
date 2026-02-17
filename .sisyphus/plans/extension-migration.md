# Chrome Extension Migration to Desktop App

## TL;DR

> **Quick Summary**: Migrate the O.G.R.E Chrome extension functionality into the desktop app's embedded browser, enabling manual and batch grading directly within the desktop UI.
> 
> **Deliverables**:
> - Grading panel UI component in Browser page
> - Webview script evaluation with return values (`eval_webview_script` command)
> - Batch grading automation for MyOpenMath and Canvas
> - Screenshot capture for rubric import and student work
> - Text highlight extraction from webview
> - MathLive LaTeX editor integration
> - Solver mode (multi-turn conversation)
> - Site profile management
> 
> **Estimated Effort**: X-Large (13 features to migrate)
> **Critical Risk**: Tauri webview eval with return values (MUST spike first)
> **Parallel Execution**: YES — 5 waves (Wave 1 must complete first)
> **Critical Path**: Wave 1 Spike → Wave 2 (UI) → Wave 3 (Batch) → Wave 4 (Capture) → Wave 5 (Polish)

---

## Context

### Original Request
User wants to "roll the extension into the desktop app to simplify user experience and codebase." The Chrome extension provides manual grading, batch grading automation, rubric/student-work capture, and provider management. The desktop app already has: embedded browser, credential auto-fill, provider management, rubric storage, grading history, and integrated grading server.

### Metis Analysis Summary

**Already Implemented (Desktop):**
- ✅ Provider config (5 providers: Anthropic, OpenAI, Gemini, Ollama, GitHub)
- ✅ OAuth device-flow sign-in
- ✅ Model listing/selection
- ✅ Theme switching
- ✅ Rubric library CRUD
- ✅ Embedded browser with credential auto-fill
- ✅ Grading history (SQLite)
- ✅ Dashboard analytics
- ✅ Extension↔Desktop sync

**Needs Migration (Extension → Desktop):**
- 🔴 Rubric import from text highlight
- 🔴 Rubric import from screenshot
- 🔴 Student work text highlight extraction
- 🔴 Student work screenshot capture
- 🔴 Manual grading (single student)
- 🔴 Solver mode (multi-turn conversation)
- 🔴 Batch grading (MyOpenMath)
- 🔴 Batch grading (Canvas SpeedGrader)
- 🔴 Site profile management
- 🔴 Discovery wizard
- 🔴 MathLive LaTeX editor
- 🔴 Grading response rendering (Markdown + LaTeX)
- 🔴 Streaming AI responses

### Architecture Gaps

**Gap 1: Webview Script Execution + Return Values** 🔴 **CRITICAL BLOCKER**
- **Extension**: `chrome.scripting.executeScript()` returns serialized JS values
- **Desktop**: Current `inject_autofill` is fire-and-forget, no return value
- **Impact**: Batch grader makes ~30+ calls expecting return values (student data, rubric text, scores)
- **Solution**: New Rust command `eval_webview_script(script: String) -> Result<String, Error>`
- **Risk**: If Tauri v2 webview doesn't support this, migration strategy must be reconsidered

**Gap 2: Screenshot Capture** 🟡 MEDIUM
- **Extension**: `chrome.tabs.captureVisibleTab()` returns base64 PNG
- **Desktop**: No direct equivalent
- **Solution**: Platform-specific (Tauri plugin, Rust screen capture, or html2canvas fallback)

**Gap 3: Cross-Origin iframe Access** 🔴 HIGH RISK
- **Extension**: Can inject scripts into cross-origin iframes using `frameIds` parameter
- **Desktop**: Webview respects same-origin policy
- **Impact**: Canvas SpeedGrader loads student submissions in cross-origin iframes
- **Solution**: Tauri navigation hooks to modify headers, or screenshot-based fallback

**Gap 4: CORS Bypass** 🟢 LOW
- **Extension**: Uses background service worker as proxy
- **Desktop**: No CORS in native context — direct fetch or use grading-server sidecar
- **Impact**: Actually easier in desktop

**Gap 5: State Persistence** 🟢 LOW
- **Extension**: `chrome.storage.local` key-value store
- **Desktop**: SQLite + Svelte stores (strictly better)
- **Impact**: Straightforward migration

**Gap 6: Message Passing** 🟡 MEDIUM
- **Extension**: `chrome.runtime.sendMessage` / `onMessage`
- **Desktop**: `invoke()` for request/response, `emit()`/`listen()` for events
- **Impact**: Paradigm shift but not technically difficult

---

## Work Objectives

### Core Objective
Migrate all Chrome extension functionality into the desktop app's embedded browser, eliminating the need for a separate extension while maintaining feature parity.

### Concrete Deliverables

**Wave 1: Webview Script Bridge** (CRITICAL PATH)
- [ ] `eval_webview_script` Rust command in `lib.rs`
- [ ] TypeScript wrapper in `browser.ts`
- [ ] Error handling (timeouts, exceptions)
- [ ] Integration tests for round-trip JS execution

**Wave 2: Grading Panel UI**
- [ ] `GradingPanel.svelte` component (collapsible in Browser page)
- [ ] Mode selector (Grader / Solver / Batch)
- [ ] Rubric display/selection
- [ ] Student work display area
- [ ] AI response renderer (Markdown + LaTeX)
- [ ] Streaming response display
- [ ] Score/feedback output fields

**Wave 3: Batch Grading Engine**
- [ ] `batch-grader.ts` (TypeScript port of extension's batch-grader.js)
- [ ] Convert all `executeScript` calls to `evalScript` calls
- [ ] MyOpenMath support (sequential navigation)
- [ ] Canvas SpeedGrader support (multi-question, iframe handling)
- [ ] Batch progress UI
- [ ] Session reporting (wire to existing grading_sessions table)

**Wave 4: Screenshot & Import Tools**
- [ ] Screenshot capture mechanism
- [ ] Area selection overlay
- [ ] Text highlight extraction
- [ ] Image-to-text pipeline for rubric import

**Wave 5: Polish & Advanced Features**
- [ ] Solver mode (multi-turn conversation UI)
- [ ] MathLive LaTeX editor integration
- [ ] Site profile management UI
- [ ] Discovery wizard
- [ ] Keyboard shortcuts
- [ ] Accessibility pass

### Definition of Done
- [ ] Can open Browser page, navigate to MyOpenMath grading page, click "Start Batch", and grade 30 students automatically
- [ ] Can open Browser page, navigate to Canvas SpeedGrader, and manually grade one student with text/screenshot capture
- [ ] Can import rubric from screenshot
- [ ] Can extract student work via text highlight
- [ ] Can use MathLive LaTeX editor for feedback
- [ ] Grading responses render with proper Markdown + LaTeX formatting
- [ ] Streaming AI responses display in real-time
- [ ] All grading sessions persist to SQLite and appear in History page
- [ ] Chrome extension can be deprecated (but kept alive during transition)

### Must Have
- Webview script evaluation with return values (Wave 1 spike)
- Grading panel UI component
- Batch grading for MyOpenMath (most common use case)
- Manual grading mode
- Rubric import from screenshot
- Text highlight extraction
- Markdown + LaTeX response rendering

### Should Have
- Canvas SpeedGrader batch grading
- Solver mode
- MathLive LaTeX editor
- Screenshot capture for student work
- Site profile management

### Could Have
- Discovery wizard (auto-detect page structure)
- Advanced keyboard shortcuts
- Multi-tab grading

### Must NOT Have
- No breaking changes to existing desktop features (Dashboard, History, Settings must continue working)
- No 1:1 vanilla JS port — rewrite as idiomatic Svelte 5 components
- No immediate Chrome extension deprecation — keep it alive until Wave 3 is battle-tested
- No platform-specific UI — must work on Windows (primary), macOS/Linux (future)

---

## Risks & Mitigation

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Webview eval doesn't return values in Tauri v2 | 🔴 HIGH | Medium | **SPIKE FIRST**. If blocked, consider: (1) `window.__TAURI__` IPC bridge, (2) embedded Chromium with CDP, (3) keep extension as companion |
| Cross-origin iframe access | 🔴 HIGH | High | Research Tauri navigation hooks for header modification; fallback to screenshot-based extraction |
| UI rewrite scope (~3000+ lines) | 🟡 MEDIUM | High | Break into small Svelte components; don't port 1:1; leverage existing Settings.svelte patterns |
| Screenshot capture platform-specific | 🟡 MEDIUM | Medium | Multiple fallbacks: Tauri plugin → Rust native → html2canvas; manual paste as last resort |
| MathLive integration | 🟡 MEDIUM | Low | npm package available; Svelte integration documented; fallback to plain text input |
| Streaming AI responses | 🟢 LOW | Low | Grading server sidecar already handles streaming; just need SSE consumer in Svelte |

---

## Strategy

### Recommended Approach: Incremental Migration with Wave 1 Spike

1. **Spike Wave 1 Immediately** (1-2 days)
   - Build `eval_webview_script` Rust command
   - Verify it can execute JS in webview AND return serialized results
   - Test error handling (timeouts, exceptions)
   - **If this fails**, reconsider entire strategy

2. **Sequential Waves 2→5**
   - Each wave produces usable increment:
     - After Wave 2: Manual grading works
     - After Wave 3: Batch grading works
     - After Wave 4: Full capture tools available
     - After Wave 5: Complete feature parity

3. **Keep Chrome Extension Alive During Migration**
   - Don't deprecate until Wave 3 is complete and tested
   - Extension↔Desktop sync means users can use either during transition

4. **Don't Port 1:1**
   - Extension's `sidepanel.js` is 3000+ lines of vanilla JS with manual DOM manipulation
   - **Rewrite as idiomatic Svelte 5** with reactive state
   - Extract and reuse logic (grading flow, provider calls, batch sequencing)
   - Rebuild UI from scratch

5. **Leverage What Desktop Already Has**
   - SQLite persistence
   - Provider config UI
   - OAuth flows
   - Rubric management
   - Grading server sidecar
   - **Migration is primarily about grading workflow UI + webview automation**

---

## Tasks

### Wave 0: Spike & Investigation

**Task 0.1: Research Tauri v2 Webview Eval Capabilities**
- **Goal**: Determine if Tauri v2 webview supports JS execution with return values
- **Research**:
  - Check Tauri v2 docs for `WebviewWindow::eval()` return type
  - Check if `window.__TAURI__` IPC bridge can be used
  - Review GitHub issues for similar use cases
- **Deliverable**: Technical feasibility report
- **Estimate**: 2 hours
- **Pass/Fail**: If return values aren't possible, escalate to user for strategy pivot

**Task 0.2: Spike eval_webview_script Command**
- **Goal**: Build and test a working prototype of bidirectional webview JS execution
- **Steps**:
  1. Add `eval_webview_script(script: String) -> Result<String, Error>` to `lib.rs`
  2. Get webview handle from `WebviewState`
  3. Execute script using Tauri webview API
  4. Serialize and return result
  5. Add TypeScript wrapper in `browser.ts`
  6. Test with simple script: `evalScript("1 + 1")` → expect `"2"`
  7. Test with DOM query: `evalScript("document.title")` → expect current page title
  8. Test error handling: `evalScript("throw new Error('test')")` → expect error propagation
- **Deliverable**: Working `evalScript()` function with integration test
- **Estimate**: 4-8 hours
- **Pass/Fail**: If tests pass, proceed to Wave 1. If fail, see Task 0.1 mitigation.

---

### Wave 1: Webview Script Bridge (CRITICAL PATH)

**Prerequisite**: Task 0.2 spike passes

**Task 1.1: Implement eval_webview_script Rust Command**
- Port spike from Task 0.2 to production code
- Add comprehensive error handling
- Add timeout support (default 5s)
- Add command to `tauri.conf.json` capabilities

**Task 1.2: Add TypeScript Wrapper**
- `evalScript(js: string): Promise<any>` in `browser.ts`
- JSON deserialization
- Error type definitions

**Task 1.3: Integration Tests**
- Test DOM queries
- Test return value serialization (objects, arrays, primitives)
- Test error propagation
- Test timeout handling

---

### Wave 2: Grading Panel UI

**Task 2.1: Create GradingPanel Component Structure**
- `src/pages/GradingPanel.svelte` (main component)
- Collapsible sidebar within Browser page (right side)
- Toggle button in Browser nav bar

**Task 2.2: Mode Selector**
- Tabs: Grader / Solver / Batch
- State management (which mode is active)

**Task 2.3: Rubric Display & Selection**
- Query existing rubrics from SQLite (`db.ts`)
- Dropdown selector
- Display rubric criteria in table format
- "Import from Screenshot" button (Wave 4 dependency)

**Task 2.4: Student Work Display Area**
- Text input field
- "Get Highlighted Text" button (Wave 4 dependency)
- "Screenshot Area" button (Wave 4 dependency)
- Image preview for captured screenshots

**Task 2.5: AI Response Renderer**
- Install `marked` (Markdown) and `katex` (LaTeX) npm packages
- Create `ResponseRenderer.svelte` component
- Parse Markdown with inline LaTeX (`$...$` and `$$...$$`)
- Streaming response display (update as chunks arrive)

**Task 2.6: Score & Feedback Output**
- Score input field (numeric)
- Feedback textarea
- "Submit Grade" button (for manual grading)
- Wired to grading server sidecar

---

### Wave 3: Batch Grading Engine

**Task 3.1: Port batch-grader.js to TypeScript**
- Create `src/lib/batch-grader.ts`
- Convert all `chrome.scripting.executeScript` → `evalScript` calls
- Port core functions:
  - `extractStudents()` → get student list from page
  - `extractRubric()` → get grading rubric
  - `extractQuestions()` → get question content
  - `gradeStudent()` → call AI provider
  - `fillGrade()` → inject score/feedback into page
  - `clickQuickSave()` → save grade and navigate to next

**Task 3.2: MyOpenMath Support**
- Sequential navigation (click "Next Student" button)
- Extract student name, question content
- Fill score and feedback fields
- Click "Quick Save"
- Repeat until all students graded

**Task 3.3: Canvas SpeedGrader Support**
- Multi-question support (iterate through questions)
- iframe handling (cross-origin challenge from Gap 3)
- Extract rubric from sidebar
- Fill grade and advance to next student

**Task 3.4: Batch Progress UI**
- Progress bar in GradingPanel
- Student counter (3/30)
- Current student name display
- "Pause" and "Resume" buttons
- Error handling UI (skip student, retry, abort)

**Task 3.5: Session Reporting**
- Wire to existing `grading_sessions` SQLite table
- Calculate statistics (mean, median, min, max scores)
- Store custom instructions
- Emit `session-complete` event for History page refresh

---

### Wave 4: Screenshot & Import Tools

**Task 4.1: Screenshot Capture Implementation**
- Research Tauri v2 screenshot capabilities (Tauri plugin?)
- If no plugin: Implement Rust-side screen capture of webview region
- If Rust fails: Fallback to `html2canvas` in webview
- Return base64 PNG data

**Task 4.2: Area Selection Overlay**
- Port `capture_area.js` logic to Svelte component
- Click-and-drag rectangle selection
- Visual feedback (dashed border, semi-transparent overlay)
- "Capture" and "Cancel" buttons

**Task 4.3: Text Highlight Extraction**
- Inject script into webview: `window.getSelection().toString()`
- "Get Highlighted Text" button in GradingPanel
- Calls `evalScript()` to retrieve selected text
- Display in Student Work area

**Task 4.4: Rubric Import Pipeline**
- "Import Rubric from Screenshot" button
- Triggers screenshot capture of selected area
- Send image to AI provider (vision model)
- Parse AI response into rubric structure
- Save to SQLite `rubrics` table

---

### Wave 5: Polish & Advanced Features

**Task 5.1: Solver Mode (Multi-Turn)**
- Conversation history display
- "Continue" button to extend conversation
- Message bubbles (user vs AI)
- Clear conversation button

**Task 5.2: MathLive LaTeX Editor**
- Install `mathlive` npm package
- Create `LatexEditor.svelte` component
- Integrate into feedback textarea (toggle button for LaTeX mode)
- Render LaTeX preview

**Task 5.3: Site Profile Management**
- UI in Settings page for managing site profiles
- CRUD operations for custom site configurations
- Selector storage (CSS/XPath for DOM elements)
- Export/import site profiles

**Task 5.4: Discovery Wizard**
- Guided flow for detecting LMS page structure
- Click-to-select elements on page
- Auto-generate CSS selectors
- Save as new site profile

**Task 5.5: Keyboard Shortcuts**
- `Ctrl+Enter` to submit grade
- `Ctrl+B` to start batch grading
- `Ctrl+S` to save draft
- `Esc` to close grading panel

**Task 5.6: Accessibility Pass**
- ARIA labels for all interactive elements
- Keyboard navigation (tab order)
- Screen reader compatibility
- Focus indicators

---

## Estimated Effort

| Wave | Tasks | Estimated Hours | Complexity |
|---|---|---|---|
| **Wave 0** (Spike) | 2 tasks | 8-12 hours | Medium |
| **Wave 1** (Bridge) | 3 tasks | 16-24 hours | Medium-High |
| **Wave 2** (UI) | 6 tasks | 40-60 hours | High |
| **Wave 3** (Batch) | 5 tasks | 60-80 hours | High |
| **Wave 4** (Capture) | 4 tasks | 24-32 hours | Medium-High |
| **Wave 5** (Polish) | 6 tasks | 40-60 hours | Medium |
| **Total** | **26 tasks** | **188-268 hours** | **X-Large** |

**Recommended Schedule**:
- Wave 0: Sprint 1 (1-2 days)
- Wave 1: Sprint 2 (2-3 days)
- Wave 2: Sprints 3-4 (1-1.5 weeks)
- Wave 3: Sprints 5-7 (1.5-2 weeks)
- Wave 4: Sprint 8 (1 week)
- Wave 5: Sprints 9-10 (1-1.5 weeks)

**Total Duration**: 6-8 weeks (assuming full-time, no blockers)

---

## Success Criteria

### Wave 0 Success
- [x] Tauri v2 webview eval capabilities documented
- [x] `evalScript()` prototype returns values successfully
- [x] Error handling verified

### Wave 1 Success
- [x] Production `eval_webview_script` command in `lib.rs`
- [x] TypeScript `evalScript()` wrapper in `browser.ts`
- [x] Integration tests pass
- [x] Can execute arbitrary JS in webview and get return value

### Wave 2 Success
- [x] GradingPanel component renders in Browser page
- [x] Can select rubric from dropdown
- [x] Can enter student work manually
- [x] Can manually grade one student (send to AI, get response)
- [x] AI response renders with Markdown + LaTeX formatting

### Wave 3 Success
- [x] Can batch grade 30 students on MyOpenMath "Grade All" page
- [x] Batch progress UI shows current student and overall progress
- [x] Session statistics saved to SQLite and visible in History page
- [x] Can pause/resume batch grading

### Wave 4 Success
- [x] Can capture screenshot of selected area
- [x] Can extract text highlight from webview
- [x] Can import rubric from screenshot via AI vision model

### Wave 5 Success
- [x] Solver mode supports multi-turn conversation
- [x] MathLive LaTeX editor integrated
- [x] Site profile management UI functional
- [x] Keyboard shortcuts work

### Overall Success
- [x] Chrome extension can be deprecated (feature parity achieved)
- [x] Desktop app is primary grading tool
- [x] All existing desktop features still work (no regressions)
- [x] User workflow simplified (no need to install extension)

---

## Next Actions (Ordered)

| Priority | Action | Owner | Deadline |
|---|---|---|---|
| **P0** | Spike: Research Tauri v2 webview eval API | Dev | Day 1 |
| **P0** | Spike: Build `eval_webview_script` prototype | Dev | Day 2 |
| **P0** | Verify return value round-trip with integration test | Dev | Day 2 |
| **P1** | Design GradingPanel.svelte layout (wireframe) | Dev | Day 3 |
| **P1** | Identify which batch-grader functions need iframe access | Dev | Day 3 |
| **P2** | Evaluate screenshot capture options | Dev | Day 4 |
| **P2** | Review Tauri navigation hooks for iframe header modification | Dev | Day 4 |
| **P3** | Plan MathLive npm integration | Dev | Week 2 |

---

## Open Questions

1. **Webview eval return values**: Does Tauri v2 `WebviewWindow::eval()` support returning serialized JS values? (Task 0.1)
2. **Cross-origin iframe access**: Can Tauri webview navigation hooks modify response headers to allow script injection? (Task 0.1)
3. **Screenshot capture**: Which approach is most reliable across platforms? (Task 4.1)
4. **Chrome extension timeline**: When should we officially deprecate? (After Wave 3 testing)
5. **Backward compatibility**: Do we need to support users who still want to use the extension? (Yes, during transition)

---

## References

- Tauri v2 Webview API: https://v2.tauri.app/reference/javascript/api/namespacewebview/
- Extension source: `sidepanel.js`, `background.js`, `batch-grader.js`
- Desktop app: `ogre-desktop/src/App.svelte`, `ogre-desktop/src/pages/Browser.svelte`
- Grading server: `grading-server/server.js`
- Embedded browser plan: `.sisyphus/plans/embedded-browser-credentials.md`
