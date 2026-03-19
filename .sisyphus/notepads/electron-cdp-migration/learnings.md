# Learnings — electron-cdp-migration

## Format: append only. Never overwrite. Tag each entry with timestamp + task.

## [2026-03-18] Session Start
- Branch: feature/electron-migration
- Worktree: .worktrees/electron-migration
- Starting platform: Linux (Pop!_OS 24.04)
- Node.js version: check before spike
- Spike target dir: tmp/electron-spike/ (throwaway, not in worktree)

## [2026-03-18] Task 1: Spike Results — FINAL VERDICT: GO ✅

All 5 checks PASSED after two fixes:
- Node.js: v25.8.0 | Electron: v33.4.11 (NODE_MODULE_VERSION 130)
- better-sqlite3: PASS — rebuilt via `node-gyp rebuild --target=33.4.11 --dist-url=https://electronjs.org/headers`
- webContents.debugger.attach: PASS
- Runtime.evaluate: PASS — returned "SpikeTest" correctly
- Page.captureScreenshot: PASS — 142KB JPEG returned
- Accessibility.getFullAXTree: PASS — 12 nodes (RootWebArea, heading, button, textbox, StaticText)
- CORS localhost:3456: PASS — grading server responded {"status":"ok"}

CRITICAL LEARNINGS for Wave 1+ subagents:
1. `@electron/rebuild` CRASHES on Node.js v25 (ES module yargs issue). Use `node-gyp rebuild --target=33.4.11 --dist-url=https://electronjs.org/headers` directly instead.
2. On Linux, MUST set these flags before app.whenReady(): --disable-gpu, --disable-software-rasterizer, --no-sandbox, --disable-dev-shm-usage
3. BrowserWindow needs `offscreen: true` in webPreferences for headless CDP on Linux
4. `Page.enable` must be called before `Page.captureScreenshot`
5. `Accessibility.enable` must be called before `Accessibility.getFullAXTree`
6. Use 2000ms settle time after `did-finish-load` before sending CDP commands
7. `window-all-closed` handler must NOT call `app.quit()` — let runSpike() control lifecycle
8. AX tree roles on inline data: URL pages: RootWebArea, none, none, heading, button, textbox, StaticText
9. CORS works from Electron offscreen renderer to localhost:3456 with no special config needed

## [2026-03-18] Task 2: chrome-cdp-skill Fork & Verification ✅

**Fork Status:** github.com/shuff57/chrome-cdp-skill (created successfully)
**Local Clone:** /home/shuff57/Documents/GitHub/chrome-cdp-skill/
**CLI Entry Point:** skills/chrome-cdp/scripts/cdp.mjs
**License:** MIT, v1.0.2

### Architecture Overview
- **Daemon Model:** Per-tab persistent daemon that holds CDP WebSocket open
- **IPC:** Unix socket (Linux/macOS) or named pipe (Windows) at `~/.cache/cdp/cdp-{targetId}.sock`
- **Idle Timeout:** 20 minutes (auto-exit after inactivity)
- **Connection Retries:** 20 attempts with 300ms delay between retries
- **Timeout:** 15 seconds for most commands, 30 seconds for navigation

### Browser Detection (getWsUrl function)
Searches for `DevToolsActivePort` in this order:
1. `CDP_PORT_FILE` env var (if set)
2. macOS: ~/Library/Application Support/{Chrome,Chromium,Brave,Edge}/DevToolsActivePort
3. Linux: ~/.config/{google-chrome,chromium,vivaldi,brave,edge}/DevToolsActivePort
4. Linux Flatpak: ~/.var/app/{org.chromium.Chromium,com.google.Chrome,com.brave.Browser,com.microsoft.Edge,com.vivaldi.Vivaldi}/config/*/DevToolsActivePort
5. Windows: %LOCALAPPDATA%/{Google/Chrome,BraveSoftware/Brave-Browser,Microsoft/Edge}/User Data/DevToolsActivePort

### CLI Commands (13 total)
1. **list** — List open pages with unique target prefixes
2. **snap** — Accessibility tree snapshot (AX tree)
3. **eval** — Evaluate JavaScript expression
4. **shot** — Screenshot (viewport only, native resolution)
5. **html** — Get HTML (full page or CSS selector)
6. **nav** — Navigate to URL and wait for load
7. **net** — Network performance entries
8. **click** — Click element by CSS selector
9. **clickxy** — Click at CSS pixel coordinates
10. **type** — Type text at current focus (works in cross-origin iframes)
11. **loadall** — Repeatedly click "load more" until gone
12. **evalraw** — Raw CDP command passthrough
13. **open** — Open new tab (triggers "Allow debugging?" prompt)
14. **stop** — Stop daemon(s)

### Daemon IPC Protocol (for Task 11 integration)
- **Transport:** Newline-delimited JSON over Unix socket
- **Request:** `{"id":<number>, "cmd":"<command>", "args":["arg1","arg2",...]}` 
- **Response:** `{"id":<number>, "ok":true, "result":"<string>"}` or `{"id":<number>, "ok":false, "error":"<message>"}`
- **Socket Cleanup:** Auto-removed after 20min idle or tab close

### Key Extension Points for Task 11 (Electron CDP merge)
1. **Command Switch:** Lines ~800+ in cdp.mjs — add new commands here
2. **Daemon Handler:** runDaemon() function — add Electron-specific command handlers
3. **Browser Detection:** getWsUrl() function — add Electron detection alongside Chrome/Chromium/Brave/Edge/Vivaldi
4. **Socket Path:** sockPath() function — may need Electron-specific path logic
5. **Target Resolution:** resolvePrefix() — handles ambiguous target IDs

### Coordinate System (Important for Task 11)
- **Screenshot Resolution:** Native DPR (device pixel ratio)
- **CDP Input Events:** CSS pixels (not image pixels)
- **Conversion:** CSS px = screenshot px / DPR
- **Example:** Retina (DPR=2): CSS px ≈ screenshot px × 0.5

### Verified CLI Execution
```
$ node skills/chrome-cdp/scripts/cdp.mjs list
No DevToolsActivePort found. Enable remote debugging at chrome://inspect/#remote-debugging
```
✅ No syntax errors, proper error handling for missing DevToolsActivePort

### Next Steps for Task 11
1. Add Electron detection to getWsUrl() — check for Electron's debugger port
2. Add Electron-specific commands to the switch/case block (e.g., `electron-eval`, `electron-shot`)
3. Implement Electron daemon handler in runDaemon() that uses webContents.debugger API
4. Test coordinate mapping with Electron's DPR handling
5. Verify socket IPC works with Electron's event loop
