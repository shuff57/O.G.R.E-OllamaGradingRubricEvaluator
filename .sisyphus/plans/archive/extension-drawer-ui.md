# Extension Drawer UI — Replace Side Panel with Overlay Drawer

## TL;DR

> **Quick Summary**: Replace the Chrome Side Panel with a right-side drawer overlay that slides on top of browser content. The full extension UI (config, rubric, grading, batch, solver) loads inside an iframe within the drawer. Users can toggle via toolbar icon or a floating page button, resize by dragging the left edge, and collapse to hide.
> 
> **Deliverables**:
> - New `drawer.js` content script (drawer container + floating button + resize handle + state management)
> - Updated `manifest.json` (remove sidePanel, add web_accessible_resources)
> - Updated `background.js` (message relay to content script instead of sidePanel.open)
> - Screenshot coordination (hide drawer during captures)
> - Unit tests for drawer utilities
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 8 → Task 9 → Task 13 → Final

---

## Context

### Original Request
User wants the Chrome extension to use a drawer-style component that opens on top of the browser content, instead of Chrome's Side Panel. The drawer should be collapsible so the user can open it, do configuration/grading, then close it to free screen space.

### Interview Summary
**Key Discussions**:
- **Drawer position**: Right side, sliding in from the right edge
- **Size**: User-resizable via drag handle on left edge
- **Scope**: FULL extension UI in the drawer — config, rubric, student work, grading, batch, solver. Side panel removed entirely.
- **Toggle mechanism**: BOTH toolbar icon AND a floating O.G.R.E button on the page
- **Test strategy**: Unit tests where possible + agent-executed QA scenarios

**Research Findings**:
- Current extension uses Chrome `sidePanel` API with `chrome.sidePanel.open()` in background.js
- sidepanel.html has ~1600 lines of CSS with full dark/light theme system
- sidepanel.js is ~2500+ lines using chrome.tabs, chrome.scripting, chrome.storage, chrome.runtime APIs
- Existing content scripts (capture_area.js, element-picker.js) use z-index 2147483646-47
- No `web_accessible_resources` currently declared — BLOCKER for iframe approach
- Sequential batch grading navigates pages, which will destroy/recreate the drawer on each navigation

### Metis Review
**Identified Gaps** (addressed):
- **BLOCKER: No `web_accessible_resources`** — Must add to manifest for iframe to load sidepanel.html
- **Screenshot capture includes drawer** — Must hide drawer before `captureVisibleTab`, restore after
- **Batch grading state lost on page navigation** — Batch grading already checkpoints to `chrome.storage` (resume feature exists); drawer re-injects automatically on page load
- **Restricted pages (chrome://) lose functionality** — Documented as known limitation; inherent Chrome constraint
- **CDN Bootstrap Icons CSP risk** — Already loaded via `<link>` tag; extension pages have relaxed CSP for external stylesheets. Low risk, monitor during QA.
- **Page CSS bleed into drawer container** — Use `all: initial` on container div, Shadow DOM for floating button
- **Print/PDF includes drawer** — Add `@media print` hide rule
- **Double injection guard** — Use IIFE pattern with `window._ogreDrawer` flag
- **Extension update orphans drawer** — Detect `chrome.runtime` disconnect and clean up

---

## Work Objectives

### Core Objective
Replace Chrome's Side Panel with a user-resizable drawer overlay that slides in from the right, contains the full extension UI via iframe, and toggles via toolbar icon and floating page button.

### Concrete Deliverables
- `drawer.js` — Content script creating drawer container, floating button, iframe, resize handle
- `manifest.json` — Updated: removed sidePanel, added web_accessible_resources and content_scripts
- `background.js` — Updated: message relay to toggle drawer instead of sidePanel.open
- Unit tests for drawer utility functions

### Definition of Done
- [ ] Extension loads without errors in chrome://extensions
- [ ] Clicking toolbar icon toggles drawer open/closed
- [ ] Clicking floating page button toggles drawer open/closed
- [ ] Drawer displays full extension UI (all modes work: grader, solver, batch)
- [ ] Drawer is resizable by dragging left edge
- [ ] Drawer width and open/closed state persist across page loads
- [ ] Screenshots do NOT include the drawer
- [ ] No console errors on restricted pages (chrome://)

### Must Have
- Right-side drawer overlay with position: fixed
- iframe loading sidepanel.html (CSS isolation, full chrome API access)
- Floating O.G.R.E button (Shadow DOM, bottom-right, toggles drawer)
- Resize handle on left edge with drag interaction
- State persistence (width + open/closed) in chrome.storage.local
- Lazy iframe loading (load on first open, not on every page)
- Screenshot coordination (hide drawer during capture)
- Toolbar icon toggle via background.js → content script messaging
- Double-injection guard (window._ogreDrawer flag)
- @media print hide rule
- Z-index below capture_area.js and element-picker.js overlays

### Must NOT Have (Guardrails)
- DO NOT modify sidepanel.html, sidepanel.js, batch-grader.js, providers.js, device-flow.js, prompts.js, discover.js, site-profiles.js
- DO NOT add new permissions beyond web_accessible_resources
- DO NOT add responsive breakpoints, mobile layout, or alternate drawer positions
- DO NOT add keyboard shortcuts (separate follow-up)
- DO NOT make the floating button elaborate — simple circle with favicon.png
- DO NOT split drawer.js into multiple files — keep as single content script
- DO NOT add spring physics or elaborate animation choreography — one simple CSS transition
- DO NOT persist drawer state per-tab — single global state

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, node environment)
- **Automated tests**: YES (tests-after for utility functions)
- **Framework**: vitest
- **QA Method**: Agent loads extension unpacked in Chrome, interacts via Playwright/content script injection

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Extension loading**: Load unpacked in Chrome, verify no errors in chrome://extensions
- **Drawer interaction**: Use Playwright or chrome.scripting to verify DOM state
- **State verification**: Read chrome.storage.local to verify persisted values
- **Screenshot testing**: Capture with drawer open, verify drawer excluded from image

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 3 parallel, start immediately):
├── Task 1: Manifest changes (remove sidePanel, add web_accessible_resources) [quick]
├── Task 2: Background.js overhaul (sidePanel → content script messaging) [quick]
└── Task 3: drawer.js skeleton (IIFE, injection guard, Shadow DOM floating button) [unspecified-high]

Wave 2 (Core Drawer — 4 tasks, after Wave 1):
├── Task 4: Drawer container + open/close slide animation (depends: 3) [visual-engineering]
├── Task 5: iframe lazy-loading of sidepanel.html (depends: 1, 4) [unspecified-high]
├── Task 6: Resize handle + drag interaction (depends: 4) [visual-engineering]
└── Task 7: State persistence — width + open/closed in chrome.storage (depends: 4, 6) [quick]

Wave 3 (Integration — 4 parallel, after Wave 2):
├── Task 8: Toolbar icon ↔ content script message relay (depends: 2, 5) [quick]
├── Task 9: Screenshot coordination — hide drawer during capture (depends: 5) [unspecified-high]
├── Task 10: Z-index + overlay coordination with capture_area/element-picker (depends: 4) [quick]
└── Task 11: Edge case hardening (print hide, restricted page, CSS isolation, orphan detection) (depends: 5) [unspecified-high]

Wave 4 (Testing — 2 tasks, after Wave 3):
├── Task 12: Unit tests for drawer utilities [quick]
└── Task 13: Full integration QA — all modes, screenshot, resize, batch [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 5 → Task 8 → Task 9 → Task 13 → Final
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 2, 3, Final)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 5, 11 | 1 |
| 2 | — | 8 | 1 |
| 3 | — | 4, 10, 11 | 1 |
| 4 | 3 | 5, 6, 7, 9, 10 | 2 |
| 5 | 1, 4 | 8, 9, 11 | 2 |
| 6 | 4 | 7 | 2 |
| 7 | 4, 6 | 12 | 2 |
| 8 | 2, 5 | 13 | 3 |
| 9 | 5 | 13 | 3 |
| 10 | 4 | 13 | 3 |
| 11 | 5 | 13 | 3 |
| 12 | 7 | Final | 4 |
| 13 | 8, 9, 10, 11 | Final | 4 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: 4 tasks — T4 → `visual-engineering`, T5 → `unspecified-high`, T6 → `visual-engineering`, T7 → `quick`
- **Wave 3**: 4 tasks — T8 → `quick`, T9 → `unspecified-high`, T10 → `quick`, T11 → `unspecified-high`
- **Wave 4**: 2 tasks — T12 → `quick`, T13 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

### Wave 1 — Foundation

- [ ] 1. Manifest Changes — Remove Side Panel, Add Web Accessible Resources

  **What to do**:
  - Remove `"sidePanel"` from the `permissions` array
  - Remove the `"side_panel": { "default_path": "sidepanel.html" }` section
  - Add `"web_accessible_resources"` section listing all files the iframe needs:
    ```json
    "web_accessible_resources": [{
      "resources": [
        "sidepanel.html",
        "sidepanel.js",
        "providers.js",
        "batch-grader.js",
        "site-profiles.js",
        "discover.js",
        "device-flow.js",
        "github-auth.js",
        "prompts.js",
        "capture_area.js",
        "element-picker.js",
        "favicon.png",
        "logo.png",
        "lib/*"
      ],
      "matches": ["<all_urls>"]
    }]
    ```
  - Add `"content_scripts"` section to inject drawer.js on all pages:
    ```json
    "content_scripts": [{
      "matches": ["<all_urls>"],
      "js": ["drawer.js"],
      "run_at": "document_idle"
    }]
    ```
  - Verify the extension still loads without errors in chrome://extensions after changes

  **Must NOT do**:
  - Do NOT modify any other fields in manifest.json
  - Do NOT add new permissions
  - Do NOT change the icons, version, or description

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple JSON edits to a config file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for JSON file editing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 5, 11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `manifest.json:1-36` — Current manifest with sidePanel config to remove and structure to extend

  **API/Type References**:
  - Chrome Manifest V3 `web_accessible_resources` spec — requires `resources` array + `matches` array
  - Chrome Manifest V3 `content_scripts` spec — `matches`, `js`, `run_at` fields

  **WHY Each Reference Matters**:
  - `manifest.json` is the ONLY file being modified; executor needs to see current structure to make surgical edits

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Extension loads after manifest changes
    Tool: Bash
    Preconditions: Extension folder exists with modified manifest.json
    Steps:
      1. Read manifest.json and verify: no "sidePanel" in permissions array
      2. Read manifest.json and verify: no "side_panel" key exists
      3. Read manifest.json and verify: "web_accessible_resources" key exists with resources array
      4. Read manifest.json and verify: "content_scripts" key exists with drawer.js entry
      5. Parse manifest.json as JSON to verify it's valid JSON
    Expected Result: All 5 checks pass, valid JSON
    Failure Indicators: JSON parse error, "sidePanel" still present, missing web_accessible_resources
    Evidence: .sisyphus/evidence/task-1-manifest-validation.txt

  Scenario: No unintended manifest changes
    Tool: Bash (git diff)
    Preconditions: manifest.json has been modified
    Steps:
      1. Run `git diff manifest.json`
      2. Verify ONLY these changes: sidePanel removed, web_accessible_resources added, content_scripts added
      3. Verify permissions array still contains: activeTab, scripting, storage, identity, debugger
      4. Verify icons, version, description, background are unchanged
    Expected Result: Only targeted changes visible in diff
    Evidence: .sisyphus/evidence/task-1-manifest-diff.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(ext): remove sidePanel, add web_accessible_resources for drawer`
  - Files: `manifest.json`

- [ ] 2. Background.js Overhaul — Side Panel → Content Script Messaging

  **What to do**:
  - Replace `chrome.sidePanel.open({ windowId: tab.windowId })` with a message to the active tab's content script to toggle the drawer
  - The new action click handler should:
    1. Get the active tab via `chrome.tabs.query({ active: true, currentWindow: true })`
    2. Send a message to that tab: `chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawer' })`
    3. Handle the case where content script isn't injected yet (restricted pages): wrap in try/catch, if message fails, inject drawer.js programmatically then retry
  - Keep ALL existing message handlers (`captureVisibleTab`, `proxyFetch`) completely unchanged
  - Add a new message handler for `'hideDrawer'` — when content scripts (capture_area.js) need to hide the drawer before screenshot:
    ```js
    if (request.action === 'hideDrawer' || request.action === 'showDrawer') {
      // Relay to the content script on the same tab
      chrome.tabs.sendMessage(sender.tab.id, request);
      sendResponse({ ok: true });
    }
    ```

  **Must NOT do**:
  - Do NOT modify the `captureVisibleTab` handler logic
  - Do NOT modify the `proxyFetch` handler logic
  - Do NOT remove any existing functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small focused changes to a 71-line file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `background.js:1-4` — Current action click handler using sidePanel.open (to be replaced)
  - `background.js:7-69` — Existing message handlers (captureVisibleTab, proxyFetch) to preserve UNTOUCHED

  **API/Type References**:
  - `chrome.tabs.sendMessage(tabId, message)` — Sends message to content scripts in specified tab
  - `chrome.scripting.executeScript({ target: { tabId }, files: ['drawer.js'] })` — Fallback injection

  **WHY Each Reference Matters**:
  - Lines 1-4 are the ONLY lines being replaced
  - Lines 7-69 must be verified as unchanged after edits

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Action click handler sends toggleDrawer message
    Tool: Bash
    Preconditions: background.js has been modified
    Steps:
      1. Read background.js
      2. Verify: no reference to `chrome.sidePanel` anywhere in file
      3. Verify: `chrome.action.onClicked` handler exists
      4. Verify: handler calls `chrome.tabs.sendMessage` with `{ action: 'toggleDrawer' }`
      5. Verify: handler has try/catch for fallback injection
    Expected Result: Old sidePanel code gone, new messaging code present
    Evidence: .sisyphus/evidence/task-2-background-validation.txt

  Scenario: Existing handlers preserved
    Tool: Bash (git diff)
    Steps:
      1. Run `git diff background.js`
      2. Verify: `captureVisibleTab` handler is UNCHANGED
      3. Verify: `proxyFetch` handler is UNCHANGED
      4. Verify: new `hideDrawer`/`showDrawer` relay handler exists
    Expected Result: Only action click handler replaced + new relay handler added
    Evidence: .sisyphus/evidence/task-2-background-diff.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(ext): replace sidePanel.open with content script messaging`
  - Files: `background.js`

- [ ] 3. drawer.js Skeleton — IIFE, Injection Guard, Shadow DOM Floating Button

  **What to do**:
  - Create new file `drawer.js` as a content script with IIFE pattern (following capture_area.js pattern)
  - Add double-injection guard: `if (window._ogreDrawerInjected) return; window._ogreDrawerInjected = true;`
  - Create the floating O.G.R.E toggle button using Shadow DOM for CSS isolation:
    - Create a host element (`<div id="ogre-drawer-host">`) appended to document.body
    - Attach Shadow DOM (mode: 'closed' for isolation from page scripts)
    - Inside Shadow DOM: circular button (40px), positioned `fixed`, `bottom: 20px`, `right: 20px`
    - Button displays the extension's favicon: `chrome.runtime.getURL('favicon.png')`
    - Button has hover effect, cursor: pointer, subtle box-shadow
    - Z-index: `2147483639` (below capture_area overlay at 2147483647)
    - `all: initial` on host element to prevent page CSS bleed
  - Add click handler on the floating button that dispatches a custom event or calls a toggle function (placeholder for Task 4)
  - Add `chrome.runtime.onMessage.addListener()` to receive `toggleDrawer`, `hideDrawer`, `showDrawer` messages from background.js
  - Add cleanup function for orphan detection: `chrome.runtime.onConnect` or try-catch on `chrome.runtime.id` access
  - Add `@media print` rule inside Shadow DOM styles: `{ display: none !important; }`

  **Must NOT do**:
  - Do NOT split into multiple files
  - Do NOT create the drawer container yet (Task 4)
  - Do NOT load the iframe yet (Task 5)
  - Do NOT make the button elaborate — simple circle with favicon

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New file creation with Shadow DOM, event handling, and extension API usage
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `visual-engineering`: The button is minimal UI, no complex styling needed yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 10, 11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `capture_area.js:1-10` — IIFE pattern and injection guard (follow this exact pattern for `window._ogreDrawerInjected`)
  - `element-picker.js:136-143` — Cleanup pattern for removing injected elements on disconnect
  - `capture_area.js:11-96` — Full-page overlay creation pattern (z-index, position: fixed, event handling)

  **API/Type References**:
  - `chrome.runtime.getURL('favicon.png')` — Gets the full `chrome-extension://` URL for the favicon
  - `chrome.runtime.onMessage.addListener()` — Listens for messages from background.js
  - `Element.attachShadow({ mode: 'closed' })` — Creates isolated Shadow DOM

  **External References**:
  - MDN Shadow DOM: https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow

  **WHY Each Reference Matters**:
  - `capture_area.js` IIFE pattern prevents double-injection — critical for content scripts
  - `element-picker.js` cleanup pattern ensures drawer removes itself cleanly
  - Shadow DOM ensures floating button CSS is completely isolated from page styles

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: drawer.js file exists with correct structure
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: file starts with IIFE pattern `(function() {`
      3. Verify: `window._ogreDrawerInjected` guard is present
      4. Verify: Shadow DOM creation with `attachShadow({ mode: 'closed' })`
      5. Verify: `chrome.runtime.getURL('favicon.png')` for button image
      6. Verify: `chrome.runtime.onMessage.addListener` for toggleDrawer/hideDrawer/showDrawer
      7. Verify: z-index is 2147483639 or lower (below 2147483646)
    Expected Result: All structural checks pass
    Evidence: .sisyphus/evidence/task-3-drawer-skeleton.txt

  Scenario: Floating button is isolated from page CSS
    Tool: Bash
    Steps:
      1. Search drawer.js for `attachShadow`
      2. Verify: Shadow DOM mode is 'closed'
      3. Search for `all: initial` or equivalent reset on host element
      4. Verify: @media print hide rule exists inside Shadow DOM styles
    Expected Result: CSS isolation verified
    Evidence: .sisyphus/evidence/task-3-css-isolation.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(ext): create drawer.js skeleton with floating button`
  - Files: `drawer.js`

### Wave 2 — Core Drawer

- [ ] 4. Drawer Container + Open/Close Slide Animation

  **What to do**:
  - In `drawer.js`, create the drawer container element:
    - `<div id="ogre-drawer-container">` appended to document.body
    - CSS: `position: fixed; top: 0; right: 0; height: 100vh; z-index: 2147483640`
    - Default width: `400px` (will be overridden by persisted state in Task 7)
    - Background: `#0d1117` (matches extension dark theme bg)
    - Border-left: `1px solid #30363d`
    - Box-shadow: `-4px 0 20px rgba(0,0,0,0.3)`
    - `all: initial` on container to prevent page CSS bleed, then apply drawer-specific styles
  - Implement open/close slide animation:
    - Use `transform: translateX(100%)` for closed state (offscreen right)
    - Use `transform: translateX(0)` for open state
    - CSS transition: `transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
  - Create a `toggleDrawer()` function that:
    - Toggles the `transform` between open/closed
    - Updates the floating button appearance (e.g., slight color change when drawer is open)
    - Stores current open/closed state for Task 7 to persist
  - Wire the floating button click (from Task 3) to call `toggleDrawer()`
  - Wire the `toggleDrawer` message handler (from Task 3) to call `toggleDrawer()`
  - Start in CLOSED state by default

  **Must NOT do**:
  - Do NOT load the iframe yet (Task 5)
  - Do NOT add resize logic (Task 6)
  - Do NOT persist state to storage (Task 7)
  - Do NOT modify sidepanel.html

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS animation, positioning, visual transitions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (first in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 6, 7, 9, 10
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `drawer.js` (from Task 3) — Skeleton file to add drawer container to
  - `sidepanel.html:10-13` — Dark theme color variables to match (`--color-bg-main: #0d1117`, `--color-border: #30363d`)

  **WHY Each Reference Matters**:
  - Drawer must visually match the extension's dark theme for a seamless look
  - drawer.js is the file being extended — executor needs the skeleton from Task 3

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Drawer container exists in DOM
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: element with id `ogre-drawer-container` is created
      3. Verify: position is `fixed`, right is `0`, top is `0`, height is `100vh`
      4. Verify: `transform: translateX(100%)` for initial closed state
      5. Verify: CSS transition on transform property
    Expected Result: Container structure correct
    Evidence: .sisyphus/evidence/task-4-drawer-container.txt

  Scenario: Toggle function switches between open and closed
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: `toggleDrawer` function exists
      3. Verify: it toggles `transform` between `translateX(0)` and `translateX(100%)`
      4. Verify: floating button click calls toggleDrawer
      5. Verify: message handler for 'toggleDrawer' calls toggleDrawer
    Expected Result: Toggle logic correct
    Evidence: .sisyphus/evidence/task-4-toggle-logic.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [ ] 5. iframe Lazy-Loading of sidepanel.html

  **What to do**:
  - Inside the drawer container (from Task 4), create an `<iframe>` element:
    - `src`: `chrome.runtime.getURL('sidepanel.html')`
    - CSS: `width: 100%; height: 100%; border: none;`
    - `allow`: `clipboard-write` (for copy-to-clipboard functionality in the extension)
  - Implement LAZY LOADING: Do NOT create the iframe on page load. Instead:
    - On first `toggleDrawer()` call that opens the drawer, create and append the iframe
    - Store a reference: `let iframeLoaded = false;`
    - On subsequent opens, just show the existing iframe (don't reload)
  - The iframe loads `sidepanel.html` which runs `sidepanel.js` as a module — all existing functionality should work inside the iframe automatically

  **Must NOT do**:
  - Do NOT modify sidepanel.html or sidepanel.js
  - Do NOT load iframe on every page load (lazy load on first open only)
  - Do NOT add extra communication between content script and iframe (not needed — iframe has full chrome API access)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: iframe creation with extension URLs and lazy loading logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Task 4 container)
  - **Parallel Group**: Wave 2 (after Task 4, parallel with Task 6)
  - **Blocks**: Tasks 8, 9, 11
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `drawer.js` (from Tasks 3-4) — Container to add iframe into
  - `manifest.json` (from Task 1) — web_accessible_resources must include sidepanel.html

  **API/Type References**:
  - `chrome.runtime.getURL('sidepanel.html')` — Returns `chrome-extension://<id>/sidepanel.html`
  - `sidepanel.html:1-5` — The HTML file that will be loaded in the iframe
  - `sidepanel.js:1-12` — Module imports that must resolve correctly from chrome-extension:// URL

  **WHY Each Reference Matters**:
  - `chrome.runtime.getURL` is essential for loading extension pages in iframe
  - The imports in sidepanel.js must work from the iframe context — executor should verify relative paths resolve

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: iframe is created lazily on first open
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: iframe is NOT created at script load time
      3. Verify: iframe is created inside toggleDrawer() on first open
      4. Verify: `iframeLoaded` flag prevents recreation on subsequent opens
      5. Verify: iframe src uses `chrome.runtime.getURL('sidepanel.html')`
    Expected Result: Lazy loading pattern confirmed
    Evidence: .sisyphus/evidence/task-5-iframe-lazy.txt

  Scenario: iframe fills drawer container
    Tool: Bash
    Steps:
      1. Verify: iframe has width: 100%, height: 100%, border: none
      2. Verify: iframe is a child of the drawer container element
    Expected Result: iframe fills container
    Evidence: .sisyphus/evidence/task-5-iframe-styles.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [ ] 6. Resize Handle + Drag Interaction

  **What to do**:
  - Add a resize handle to the LEFT edge of the drawer container:
    - `<div class="ogre-resize-handle">` positioned on the left edge
    - CSS: `position: absolute; left: 0; top: 0; width: 6px; height: 100%; cursor: ew-resize;`
    - Transparent by default, shows subtle highlight on hover (`background: rgba(88, 166, 255, 0.3)`)
  - Implement drag-to-resize interaction:
    - `mousedown` on handle starts resize mode
    - `mousemove` on document updates drawer width: `newWidth = window.innerWidth - e.clientX`
    - `mouseup` on document ends resize mode
    - During resize: disable pointer-events on the iframe (`iframe.style.pointerEvents = 'none'`) to prevent it capturing mouse events
    - After resize: re-enable iframe pointer-events
  - Add constraints:
    - Minimum width: `360px` (matches typical extension side panel minimum)
    - Maximum width: `80%` of viewport width (prevent covering entire page)
  - Store the final width value for Task 7 to persist

  **Must NOT do**:
  - Do NOT persist the width to storage (Task 7 handles that)
  - Do NOT add vertical resize or repositioning
  - Do NOT add touch events (desktop Chrome only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Drag interaction, pointer events, visual feedback
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 5 after Task 4)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `drawer.js` (from Task 4) — Drawer container to add resize handle to
  - `capture_area.js:30-80` — Mouse event handling pattern (mousedown/mousemove/mouseup on document)

  **WHY Each Reference Matters**:
  - capture_area.js shows the exact mouse event pattern used in this extension's content scripts
  - drawer.js is the file being extended

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Resize handle exists with correct positioning
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: resize handle element with cursor: ew-resize
      3. Verify: positioned absolute, left: 0, full height
      4. Verify: hover highlight style exists
    Expected Result: Handle structure correct
    Evidence: .sisyphus/evidence/task-6-resize-handle.txt

  Scenario: Drag interaction respects constraints
    Tool: Bash
    Steps:
      1. Verify: mousedown/mousemove/mouseup event handlers exist
      2. Verify: minimum width constraint (360px)
      3. Verify: maximum width constraint (80% viewport)
      4. Verify: iframe pointer-events disabled during drag
      5. Verify: iframe pointer-events re-enabled after drag
    Expected Result: Constraints and pointer-events handling correct
    Evidence: .sisyphus/evidence/task-6-resize-logic.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [ ] 7. State Persistence — Width + Open/Closed in chrome.storage

  **What to do**:
  - Use `chrome.storage.local` to persist drawer state:
    - Key: `'ogreDrawerState'`
    - Value: `{ open: boolean, width: number }`
  - On drawer open/close (in `toggleDrawer()`): save state
  - On resize end (mouseup in Task 6): save width
  - On content script initialization: load saved state and apply:
    - If `open: true`, open the drawer immediately (no animation on restore)
    - Apply saved `width` to drawer container
  - Use `chrome.storage.local.get` / `chrome.storage.local.set` with proper error handling
  - Default state if none saved: `{ open: false, width: 400 }`

  **Must NOT do**:
  - Do NOT persist per-tab state — single global state
  - Do NOT persist other state (provider config, mode) — those are already handled by sidepanel.js

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple chrome.storage get/set calls
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Task 6 width value)
  - **Parallel Group**: Wave 2 (after Tasks 4, 6)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 6

  **References**:

  **Pattern References**:
  - `sidepanel.js:73-74` — Existing chrome.storage.local usage pattern (`chrome.storage.local.get('ogreTheme')`)
  - `sidepanel.js:141-142` — Existing chrome.storage.local.set pattern

  **WHY Each Reference Matters**:
  - Follow the existing storage pattern for consistency (async/await with `.then()`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: State is saved on toggle
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: toggleDrawer() calls chrome.storage.local.set with ogreDrawerState
      3. Verify: resize mouseup handler calls chrome.storage.local.set with updated width
      4. Verify: default state is { open: false, width: 400 }
    Expected Result: Save logic present for both toggle and resize
    Evidence: .sisyphus/evidence/task-7-state-save.txt

  Scenario: State is restored on injection
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: initialization code calls chrome.storage.local.get('ogreDrawerState')
      3. Verify: if saved state has open: true, drawer opens without animation
      4. Verify: saved width is applied to container
    Expected Result: Restore logic present
    Evidence: .sisyphus/evidence/task-7-state-restore.txt
  ```

  **Commit**: YES
  - Message: `feat(ext): add drawer overlay with iframe, resize, and state persistence`
  - Files: `drawer.js`

### Wave 3 — Integration

- [ ] 8. Toolbar Icon ↔ Content Script Message Relay

  **What to do**:
  - Verify end-to-end: toolbar icon click → background.js sends `toggleDrawer` → content script receives → drawer toggles
  - Handle the edge case where content script is NOT yet injected:
    - In background.js `chrome.action.onClicked` handler, wrap `chrome.tabs.sendMessage` in try/catch
    - On failure (content script not present), programmatically inject drawer.js via `chrome.scripting.executeScript({ target: { tabId }, files: ['drawer.js'] })`
    - After injection, send `toggleDrawer` message again
  - Handle restricted pages (chrome://, about:, chrome-extension://):
    - `chrome.scripting.executeScript` will throw on restricted pages
    - Catch this error and silently fail (no error popup, no console spam)
  - Test both paths: content script already injected (normal case) and content script not yet injected (first click after navigation)

  **Must NOT do**:
  - Do NOT modify the floating button behavior (already working from Tasks 3-4)
  - Do NOT add keyboard shortcuts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small message relay verification and error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 5

  **References**:

  **Pattern References**:
  - `background.js` (from Task 2) — Action click handler with messaging
  - `drawer.js` (from Tasks 3-7) — Message listener for toggleDrawer

  **API/Type References**:
  - `chrome.tabs.sendMessage(tabId, message)` — May throw if no content script listener
  - `chrome.scripting.executeScript({ target: { tabId }, files: ['drawer.js'] })` — Programmatic injection fallback

  **WHY Each Reference Matters**:
  - Both files need to be coordinated — the message format must match exactly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Toolbar click toggles drawer when content script is loaded
    Tool: Bash
    Steps:
      1. Read background.js
      2. Verify: chrome.action.onClicked handler sends toggleDrawer message
      3. Read drawer.js
      4. Verify: onMessage listener handles 'toggleDrawer' action
      5. Verify: message format matches between sender and receiver
    Expected Result: Message format consistent between background.js and drawer.js
    Evidence: .sisyphus/evidence/task-8-message-relay.txt

  Scenario: Fallback injection on restricted page doesn't throw
    Tool: Bash
    Steps:
      1. Read background.js
      2. Verify: try/catch wraps chrome.tabs.sendMessage
      3. Verify: catch block attempts chrome.scripting.executeScript
      4. Verify: second catch block handles restricted page errors silently
    Expected Result: Double try/catch with silent fail for restricted pages
    Evidence: .sisyphus/evidence/task-8-fallback-injection.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [ ] 9. Screenshot Coordination — Hide Drawer During Capture

  **What to do**:
  - When the user clicks "Screenshot Area" in the extension UI (inside the iframe), the flow is:
    1. sidepanel.js calls `chrome.scripting.executeScript({ files: ['capture_area.js'] })`
    2. capture_area.js creates overlay, user selects area, sends `areaSelected` message
    3. sidepanel.js receives `areaSelected`, sends `captureVisibleTab` to background.js
    4. background.js calls `chrome.tabs.captureVisibleTab()` and returns the screenshot
  - The drawer (and floating button) appear in the captured screenshot because they're in the page DOM
  - Fix: Hide the drawer before screenshot capture, restore after
  - Implementation approach — modify the capture flow in `drawer.js`:
    - Listen for `hideDrawer` and `showDrawer` messages
    - `hideDrawer`: Set `display: none` on both the drawer container AND the floating button host
    - `showDrawer`: Restore `display` on both elements
  - The hide/show can be triggered from within the iframe's sidepanel.js context:
    - Before `chrome.runtime.sendMessage({ action: 'captureVisibleTab' })`, send `chrome.runtime.sendMessage({ action: 'hideDrawer' })`
    - After receiving the screenshot data, send `chrome.runtime.sendMessage({ action: 'showDrawer' })`
  - Alternative simpler approach: In `drawer.js`, listen for `capture_area.js` injection by detecting the overlay element (`document.querySelector('[data-ogre-capture]')`) via MutationObserver, and auto-hide when it appears, auto-show when it's removed
  - Choose the simpler approach that requires fewer changes to existing files. If the MutationObserver approach works without modifying sidepanel.js, prefer that.

  **Must NOT do**:
  - Do NOT modify sidepanel.js if possible (prefer MutationObserver approach)
  - Do NOT modify capture_area.js
  - Do NOT change the screenshot quality or format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-component coordination, timing-sensitive hide/show logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `capture_area.js` — Full file. Look for identifiable DOM elements or classes that can be detected (overlay creation pattern, z-index 2147483647)
  - `sidepanel.js:1023-1032` — `startAreaSelection()` function that injects capture_area.js
  - `sidepanel.js:1048-1090` — `processAreaCapture()` function that calls `captureVisibleTab`
  - `background.js:8-16` — `captureVisibleTab` handler

  **WHY Each Reference Matters**:
  - capture_area.js creates identifiable DOM elements that MutationObserver can detect
  - Understanding the full capture flow is essential to know WHEN to hide/show
  - The timing between area selection → capture must include drawer hide/show

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Drawer hides during screenshot capture
    Tool: Bash
    Steps:
      1. Read drawer.js
      2. Verify: hide/show logic exists (either message-based or MutationObserver-based)
      3. Verify: BOTH drawer container AND floating button host are hidden
      4. Verify: elements are restored after capture completes
    Expected Result: Hide/show mechanism implemented for both elements
    Evidence: .sisyphus/evidence/task-9-screenshot-hide.txt

  Scenario: Drawer not visible in captured screenshot (integration check)
    Tool: Bash
    Steps:
      1. Verify: the hide happens BEFORE captureVisibleTab is called
      2. Verify: the show happens AFTER screenshot data is received
      3. If MutationObserver approach: verify it watches for capture_area.js overlay creation/removal
    Expected Result: Timing correct — drawer hidden before capture, shown after
    Evidence: .sisyphus/evidence/task-9-screenshot-timing.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [ ] 10. Z-Index + Overlay Coordination with capture_area and element-picker

  **What to do**:
  - Verify and enforce z-index layering across ALL injected elements:
    - `capture_area.js` overlay: z-index `2147483647` (MAX — highest, unchanged)
    - `element-picker.js` overlay: z-index `2147483646` (unchanged)
    - Drawer container: z-index `2147483640`
    - Floating button host: z-index `2147483639`
  - Ensure that when capture_area.js or element-picker.js overlays appear:
    - They appear ABOVE the drawer and floating button
    - Mouse events on the overlays are NOT intercepted by the drawer
    - The drawer is behind the overlay but doesn't interfere
  - Add a comment block in drawer.js documenting the z-index hierarchy for future maintainability

  **Must NOT do**:
  - Do NOT modify capture_area.js or element-picker.js
  - Do NOT change their z-index values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: z-index verification and documentation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `capture_area.js` — Search for z-index value (should be 2147483647)
  - `element-picker.js` — Search for z-index values (should be 2147483646-47)
  - `drawer.js` (from Tasks 3-7) — z-index values to verify

  **WHY Each Reference Matters**:
  - The z-index hierarchy must be verified against actual values in all three files

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Z-index hierarchy is correct
    Tool: Bash
    Steps:
      1. Search capture_area.js for z-index value → confirm 2147483647
      2. Search element-picker.js for z-index values → confirm 2147483646-47
      3. Search drawer.js for z-index values → confirm container: 2147483640, button: 2147483639
      4. Verify: drawer z-index < element-picker z-index < capture_area z-index
      5. Verify: comment block documenting hierarchy exists in drawer.js
    Expected Result: Correct layering hierarchy verified
    Evidence: .sisyphus/evidence/task-10-zindex-hierarchy.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [ ] 11. Edge Case Hardening — Print, Restricted Pages, CSS Isolation, Orphan Detection

  **What to do**:
  - **Print/PDF hide**: Add to drawer.js injected styles: `@media print { #ogre-drawer-container, #ogre-drawer-host { display: none !important; } }`
  - **Restricted page graceful degradation**: 
    - The content_scripts `matches: ["<all_urls>"]` already excludes chrome:// pages
    - In background.js, the fallback injection try/catch (from Task 8) handles restricted pages silently
    - Verify: no console errors when on chrome://extensions, chrome://settings, about:blank
  - **CSS isolation for drawer container**:
    - Apply `all: initial` on `#ogre-drawer-container` to reset inherited page styles
    - Then apply drawer-specific styles AFTER the reset
    - This prevents page CSS (especially `* { }` selectors) from breaking the drawer layout
  - **Extension update orphan detection**:
    - In drawer.js, periodically (or on first use after injection) try to access `chrome.runtime.id`
    - If it throws (extension context invalidated), clean up: remove drawer container, remove floating button host, clear `window._ogreDrawerInjected`
    - Alternatively: wrap chrome.runtime calls in try/catch throughout drawer.js
  - **Double-injection from manual `chrome.scripting.executeScript` in background.js**:
    - The `window._ogreDrawerInjected` guard (from Task 3) prevents this
    - Verify the guard works even when content_scripts auto-injection AND manual injection both fire

  **Must NOT do**:
  - Do NOT modify capture_area.js, element-picker.js, or sidepanel.js
  - Do NOT add complex error recovery — simple cleanup is sufficient

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple edge cases requiring careful defensive coding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `drawer.js` (from Tasks 3-7) — File to add hardening code to
  - `capture_area.js:1-5` — IIFE guard pattern to verify consistency
  - `element-picker.js:136-143` — Cleanup pattern for disconnect handling

  **WHY Each Reference Matters**:
  - element-picker.js cleanup pattern is the model for orphan detection
  - capture_area.js guard pattern confirms the double-injection prevention approach

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Print media hides drawer
    Tool: Bash
    Steps:
      1. Search drawer.js for `@media print`
      2. Verify: rule targets both drawer container and floating button host
      3. Verify: `display: none !important` is used
    Expected Result: Print hide rule present
    Evidence: .sisyphus/evidence/task-11-print-hide.txt

  Scenario: CSS isolation prevents page bleed
    Tool: Bash
    Steps:
      1. Search drawer.js for `all: initial` on drawer container
      2. Verify: drawer-specific styles are applied AFTER the reset
    Expected Result: CSS isolation applied
    Evidence: .sisyphus/evidence/task-11-css-isolation.txt

  Scenario: Orphan detection exists
    Tool: Bash
    Steps:
      1. Search drawer.js for `chrome.runtime.id` access or `chrome.runtime` error handling
      2. Verify: cleanup function removes DOM elements on disconnect
    Expected Result: Orphan cleanup logic present
    Evidence: .sisyphus/evidence/task-11-orphan-detection.txt
  ```

  **Commit**: YES
  - Message: `feat(ext): add toolbar toggle, screenshot coordination, and edge case handling`
  - Files: `drawer.js`, `background.js`

### Wave 4 — Testing

- [ ] 12. Unit Tests for Drawer Utilities

  **What to do**:
  - Create `tests/drawer.test.js` with vitest unit tests for:
    - **State persistence**: Test default state (`{ open: false, width: 400 }`), saving/loading cycle
    - **Width constraints**: Test that resize logic clamps to min 360px and max 80% of viewport
    - **Message handling**: Test that the message listener dispatches correctly for `toggleDrawer`, `hideDrawer`, `showDrawer`
    - **Injection guard**: Test that `window._ogreDrawerInjected` prevents double execution
  - Mock `chrome.storage.local` and `chrome.runtime` APIs since tests run in node environment
  - Follow existing test patterns from `tests/background.test.js`

  **Must NOT do**:
  - Do NOT test visual rendering (that's QA, Task 13)
  - Do NOT test iframe loading (can't be unit tested in node)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard vitest unit tests following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 13)
  - **Blocks**: Final
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `tests/background.test.js` — Existing test file showing chrome API mocking patterns
  - `vitest.config.js` — Test configuration (globals: true, environment: node)

  **WHY Each Reference Matters**:
  - background.test.js shows exactly how to mock chrome.* APIs in this project

  **Acceptance Criteria**:

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Steps:
      1. Run `npx vitest run tests/drawer.test.js`
      2. Verify: all tests pass
      3. Verify: at least 4 test cases covering state, constraints, messages, guard
    Expected Result: All tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-12-unit-tests.txt
  ```

  **Commit**: YES
  - Message: `test(ext): add drawer utility unit tests`
  - Files: `tests/drawer.test.js`

- [ ] 13. Full Integration QA — All Modes, Screenshot, Resize, Batch

  **What to do**:
  - Load the extension unpacked in Chrome
  - Verify ALL extension functionality works through the drawer:
    1. **Extension loads**: No errors in chrome://extensions
    2. **Floating button visible**: Navigate to any page, verify O.G.R.E button appears bottom-right
    3. **Drawer opens/closes**: Click button → drawer slides in from right. Click again → slides out.
    4. **Toolbar icon works**: Click O.G.R.E toolbar icon → drawer toggles
    5. **Full UI loads**: Inside drawer, all cards visible (Settings, Mode selector, Rubric, Student Work)
    6. **Provider config**: Select a provider, enter API key, test connection
    7. **Mode switching**: Switch between Grader, Solver, Batch modes
    8. **Grader mode**: Paste rubric text, paste student work, click Run Assessment
    9. **Screenshot area**: Click "Screenshot Area" → capture_area overlay appears ABOVE drawer → select area → screenshot captured WITHOUT drawer visible
    10. **Resize**: Drag left edge → drawer width changes. Reload page → width persists.
    11. **State persistence**: Open drawer, reload page → drawer is open at same width
    12. **Batch mode**: Navigate to supported page → batch status detected correctly
    13. **Restricted page**: Navigate to chrome://extensions → no errors, no floating button, toolbar icon does nothing (silent fail)
    14. **Theme toggle**: Switch between dark/light theme inside the drawer → both look correct

  **Must NOT do**:
  - Do NOT fix bugs found during QA — document them as issues for follow-up
  - This task is verification only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive manual testing requiring browser interaction
  - **Skills**: [`playwright`]
    - `playwright`: For browser automation, navigation, clicking, screenshots

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 12)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final
  - **Blocked By**: Tasks 8, 9, 10, 11

  **References**:

  **Pattern References**:
  - All previous task QA scenarios — consolidated verification
  - `sidepanel.html:1771-1779` — Mode selector HTML structure to verify renders in drawer

  **Acceptance Criteria**:

  ```
  Scenario: Full drawer workflow
    Tool: Playwright (via playwright skill)
    Steps:
      1. Open Chrome with extension loaded unpacked
      2. Navigate to a test page (e.g., example.com)
      3. Verify floating O.G.R.E button is visible (bottom-right)
      4. Click floating button → drawer slides in
      5. Inside drawer: verify Settings card, Mode selector, Rubric card visible
      6. Resize drawer by dragging left edge
      7. Close drawer → verify slide-out animation
      8. Reopen drawer → verify persisted width
      9. Take screenshots at each step
    Expected Result: All 8 verification points pass
    Evidence: .sisyphus/evidence/task-13-full-qa-{step}.png

  Scenario: Screenshot excludes drawer
    Tool: Playwright
    Steps:
      1. Open drawer
      2. Navigate to a page with visible content
      3. Click Screenshot Area inside the drawer
      4. Select an area that includes where the drawer is
      5. Examine the captured image
    Expected Result: Captured image does NOT show the drawer or floating button
    Evidence: .sisyphus/evidence/task-13-screenshot-exclusion.png

  Scenario: Restricted page graceful degradation
    Tool: Playwright
    Steps:
      1. Navigate to chrome://extensions
      2. Open browser console
      3. Verify: no errors from O.G.R.E extension
      4. Click toolbar icon → verify nothing happens (no error, no crash)
    Expected Result: Silent failure, no console errors
    Evidence: .sisyphus/evidence/task-13-restricted-page.png
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check DOM via chrome.scripting). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run linter checks on all changed/new files. Review drawer.js for: memory leaks (event listeners not cleaned up), z-index conflicts, CSS specificity issues, missing error handling. Check for AI slop: excessive comments, over-abstraction, generic names. Verify all `chrome.storage` calls have proper error handling.
  Output: `Files [N clean/N issues] | Memory Leaks [CLEAN/N found] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state (remove and re-add extension). Execute EVERY QA scenario from EVERY task. Test cross-task integration: open drawer → configure provider → switch to batch mode → start grading → take screenshot → resize drawer. Test on 3 different sites (Google, MyOpenMath, a simple HTML page).
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1. Check that sidepanel.html, sidepanel.js, batch-grader.js, providers.js, device-flow.js, prompts.js, discover.js, site-profiles.js are COMPLETELY UNCHANGED (git diff shows zero changes). Flag any unaccounted file modifications.
  Output: `Tasks [N/N compliant] | Protected Files [CLEAN/N modified] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(ext): remove sidePanel, add web_accessible_resources and messaging` — manifest.json, background.js
- **Wave 2**: `feat(ext): add drawer overlay with iframe, resize, and state persistence` — drawer.js
- **Wave 3**: `feat(ext): add toolbar toggle, screenshot coordination, and edge case handling` — drawer.js, background.js
- **Wave 4**: `test(ext): add drawer unit tests and integration QA` — tests/drawer.test.js

---

## Success Criteria

### Verification Commands
```bash
# Extension loads without errors
# Navigate to chrome://extensions → verify no error badges

# Drawer state persists
# chrome.storage.local.get('ogreDrawerState') → { open: true/false, width: number }

# All existing tests still pass
npx vitest run
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Extension loads cleanly
- [ ] All 3 modes work (grader, solver, batch)
- [ ] Drawer opens/closes from both triggers
- [ ] Resize persists across page loads
- [ ] Screenshots exclude the drawer
- [ ] No errors on restricted pages
- [ ] Protected files unchanged (sidepanel.html, sidepanel.js, batch-grader.js, providers.js, device-flow.js, prompts.js, discover.js, site-profiles.js)
