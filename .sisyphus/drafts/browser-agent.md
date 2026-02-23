# Draft: Browser Agent — Autonomous Webview Automation

## Research Findings

### Existing Infrastructure (Strong Foundation)
 **`evalScript()`/`evalScriptJSON()`** — Already executes arbitrary JS in the webview and returns results via IPC callback pattern (oneshot channel + `__TAURI_INTERNALS__.invoke`). 120s timeout. Works today.
 **`captureWebviewScreenshot()`** — Takes viewport screenshots via html2canvas (loaded from CDN on demand). Returns base64 JPEG data URLs.
 **`captureWebviewArea(x,y,w,h)`** — Crop screenshots to specific regions.
 **`injectAutofill(username, password)`** — Already injects DOM-manipulating scripts into the webview.
 **`SolverChat.svelte`** — Working multi-turn chat UI with SSE streaming. Talks to `/api/chat` on grading server. Perfect template.
 **`discover.ts`** — AI-powered page structure discovery. Takes screenshot + DOM snapshot → sends to AI → gets CSS selectors. Shows the "AI analyzes page" pattern working.
 **`batch-grader.ts`** — Phase state machine: idle → extracting → review → grading → done. Precedent for workflow phases.
 **`confirmation-flow.ts`** — Step-by-step selector confirmation pattern. Precedent for "review mode."
 **`element-picker.ts`** — Interactive element selection in webview.
 **Grading server Playwriter/CDP** — The grading server bundles `playwriter@0.0.62` and runs a CDP relay server on port 19988 for Chrome extension automation.

### Communication Architecture
 **Tauri v2 + WebView2** (Windows) — Multi-webview support via WRY
 **Webview eval**: Rust `wv.eval(&script)` → fire-and-forget JS execution
 **Webview eval with return**: `eval_webview_script` Tauri command → wraps script in async IIFE → calls `_eval_callback` via `__TAURI_INTERNALS__` → oneshot channel → returns to frontend
 **Events**: `browser-url-changed`, `browser-page-loaded`, `browser-status` — Rust → Svelte via Tauri event system
 **Server comms**: Tauri HTTP plugin (`tauriFetch`) → grading server at localhost:3456

### UI Architecture
 **Routing**: `App.svelte` with `currentPage` state (`dashboard | history | logs | settings | rubrics | browser | site-profiles`)
 **Browser page**: `Browser.svelte` — URL bar, presets, webview area, right-side GradingPanel drawer
 **GradingPanel modes**: grader | solver | discovery — tabs in the drawer
 **SolverChat**: Multi-turn chat in the GradingPanel drawer, sends messages to `/api/chat` without rubric = solver mode
 **Provider abstraction**: Ollama, OpenAI, Anthropic, Google Gemini, GitHub Models — all via grading server

### Key Gap: No Browser Action Vocabulary
The app can evaluate arbitrary JS and take screenshots, but has no structured action system like:
 `click(selector)`, `type(selector, text)`, `scroll(direction)`, `waitFor(selector)`, `readText(selector)`, `screenshot()`
 No AI agent loop (observe → decide → act → observe result)
 No review/auto mode toggle for general browser automation

## Requirements (confirmed)
 User wants a chat window for describing browser automation intentions
 Two modes: review (step-by-step approval) and auto (fully autonomous)
 Operates on the existing embedded webview in Browser.svelte

## Technical Decisions (ALL CONFIRMED)
 **UI Placement**: Replace SolverChat.svelte entirely → new AgentChat component in "Agent" tab
 **Tab Name**: "Agent" (replaces "Solver")
 **AI Approach**: Hybrid — structured tool actions + runJS() escape hatch
 **Page Understanding**: Vision + DOM (screenshot + simplified DOM snapshot)
 **Communication**: Via grading server, new `POST /api/agent` endpoint
 **Agent Loop**: Client-side in Svelte (direct webview access, server is AI proxy)
 **Review Mode**: One action at a time (propose → approve/skip → execute → next)
 **Auto Mode**: Execute all actions automatically, report results in chat
 **Scope**: General-purpose browser agent (any page, any task)
 **Tests**: After implementation + agent QA scenarios

## Action Vocabulary (10 actions)
1. `click(selector)` — Click element by CSS selector
2. `type(selector, text)` — Type text into input field
3. `scroll(direction, amount)` — Scroll page up/down/left/right
4. `readText(selector?)` — Extract text from page or element
5. `screenshot()` — Capture viewport screenshot for AI vision
6. `waitFor(selector, timeout)` — Wait for element to appear
7. `navigate(url)` — Navigate to URL
8. `runJS(code)` — Escape hatch: execute arbitrary JavaScript
9. `done(success, message)` — Signal task completion

## All Open Questions RESOLVED
 Agent loop: client-side
 Server: new POST /api/agent endpoint
 Review mode: one action at a time
 Multi-step: AI proposes one action, observes result, proposes next
 Error recovery: AI sees error in tool result, decides how to recover
 Action vocabulary: 9 actions confirmed
## Scope Boundaries
 INCLUDE: Agent chat UI, action executor, agent loop, server endpoint, vision+DOM observation
 EXCLUDE: CDP integration (can add later), mobile platform support, persistent automation scripts/macros