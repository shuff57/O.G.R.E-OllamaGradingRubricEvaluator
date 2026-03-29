# Architecture

## System Overview

O.G.R.E (Ollama Grading Rubric Evaluator) is an educator-focused grading toolkit built as a three-layer system: an **Electron desktop app** with an embedded Svelte UI, a **local HTTP grading server**, and an **agent infrastructure** for AI-assisted workflows.

```
+-------------------------------------------------------------+
|                    Electron Desktop App                       |
|  (ogre-desktop/)                                             |
|                                                              |
|  +------------------+  +------------------+  +-----------+   |
|  | Svelte UI        |  | Electron Main    |  | Embedded  |   |
|  | (renderer)       |  | Process          |  | Browser   |   |
|  | - Dashboard      |  | - IPC handlers   |  | (WebView) |   |
|  | - Grading Panel  |  | - SQLite DB      |  | - CDP     |   |
|  | - Browser page   |  | - Server manager |  | - Tabs    |   |
|  | - Settings       |  | - OAuth server   |  |           |   |
|  | - Skills         |  | - Auto-updater   |  |           |   |
|  +--------|---------+  +--------|---------+  +-----+-----+   |
|           |  IPC bridge         |                  |          |
+-----------|---------------------|------------------|----------+
            |                     |                  |
            v                     v                  v
+-------------------------------------------------------------+
|              Grading Server (port 3456)                       |
|  (grading-server/)                                           |
|  Hono HTTP API running on Bun                                |
|                                                              |
|  /api/grade         - Batch + single grading                 |
|  /api/chat          - General AI chat                        |
|  /api/agent         - Browser agent AI endpoint              |
|  /api/embed         - Text embedding (local ONNX)            |
|  /api/rubrics       - Rubric CRUD                            |
|  /api/providers     - AI provider management                 |
|  /api/profiles/sync - Site profile sync                      |
|  /api/automation/*  - Browser automation grading             |
|  /api/generate-knowledge-profile - Site profile generation   |
+-------------------------------------------------------------+
            |
            v
+-------------------------------------------------------------+
|              AI Providers (pluggable)                         |
|  Ollama (local)  |  OpenAI  |  Anthropic  |  Google Gemini   |
|  RunPod (cloud)  |  GitHub Models (Copilot)                  |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|              Agent Infrastructure (.agents/)                  |
|  Markdown-based skill/capability routing for Claude Code      |
|  agents — grading, gradebook sync, question authoring, CLI   |
+-------------------------------------------------------------+
```

The desktop app spawns the grading server as a child process. The Svelte renderer communicates with the Electron main process via IPC, and with the grading server via HTTP (localhost:3456). The embedded browser uses Chrome DevTools Protocol (CDP) for page inspection, screenshot capture, and DOM interaction.

## Components

### 1. Electron Desktop App (`ogre-desktop/`)

**Purpose:** Primary user-facing application. Provides a windowed UI for managing AI providers, grading student work, browsing grading sites, managing rubrics, and configuring skills.

**Entry point:** `ogre-desktop/electron-main/main.ts`

**Key files:**
- `ogre-desktop/electron-main/main.ts` -- App lifecycle, window creation, server spawn
- `ogre-desktop/electron-main/ipc-handlers.ts` -- Registers all IPC handler modules
- `ogre-desktop/electron-main/database.ts` -- SQLite database with migrations (better-sqlite3)
- `ogre-desktop/electron-main/server-manager.ts` -- Spawns/restarts grading-server as child process
- `ogre-desktop/electron-main/browser-manager.ts` -- WebContentsView tab management for embedded browser
- `ogre-desktop/electron-main/cdp-bridge.ts` -- Chrome DevTools Protocol attachment/communication
- `ogre-desktop/electron-main/oauth-server.ts` -- Local HTTP server for OAuth callback handling
- `ogre-desktop/electron-main/preload.ts` -- Context bridge for renderer-to-main IPC
- `ogre-desktop/electron-main/updater.ts` -- Auto-update via electron-updater
- `ogre-desktop/src/App.svelte` -- Root Svelte component, page routing, sidebar navigation
- `ogre-desktop/src/main.js` -- Svelte app mount point
- `ogre-desktop/vite.config.js` -- Vite build config with electron plugin

**Database tables** (SQLite, managed by `database.ts` migrations):
- `provider_configs` -- AI provider credentials and settings
- `grading_sessions` -- Historical grading session records
- `app_settings` -- Key-value application settings
- `oauth_tokens` -- OAuth access/refresh tokens
- `site_credentials` -- Stored site login credentials
- `site_profiles` -- Discovered grading page profiles (selectors, navigation)
- `batch_session` -- Batch grading resume state
- `skills` -- Installed agent skills
- `response_embeddings` -- Stored embeddings for calibration retrieval

### 2. Grading Server (`grading-server/`)

**Purpose:** Local HTTP API that handles all AI provider communication, grading logic, embedding generation, rubric storage, and browser automation endpoints.

**Entry point:** `grading-server/server.js` (runs on Bun, port 3456)

**Key files:**
- `grading-server/server.js` -- Hono HTTP app with all route definitions (~2000 lines)
- `grading-server/grading.js` -- Core grading logic: scoring anchors, batch prompt building, chunking, outlier detection, response parsing
- `grading-server/providers.js` -- Request builders and response parsers for each AI provider (Ollama, OpenAI, Anthropic, Google Gemini, GitHub Models, RunPod)
- `grading-server/config.js` -- JSON config file management (read/write/watch), platform-specific paths
- `grading-server/rubric-store.js` -- File-based rubric CRUD (ogre-rubrics.json)
- `grading-server/automation.js` -- Session token management for browser automation
- `grading-server/agent.js` -- Browser agent endpoint handler (POST /api/agent)
- `grading-server/ai-retry.js` -- Retry logic with exponential backoff for AI calls
- `grading-server/embedding-adapters.js` -- Provider-specific embedding request/response adapters
- `grading-server/local-embedder.js` -- Local ONNX-based embedding (all-MiniLM-L6-v2, 384 dims)
- `grading-server/knowledge-profile.js` -- AI-generated site navigation profiles
- `grading-server/grading-constants.js` -- Grading philosophy text and scoring scale descriptors
- `grading-server/build.js` -- Build script for standalone binary via @yao-pkg/pkg

### 3. Svelte UI Pages (`ogre-desktop/src/pages/`)

**Purpose:** User-facing pages rendered in the Electron renderer process.

**Key pages:**
- `Dashboard.svelte` -- Overview/landing page
- `GradingPanel.svelte` -- Main grading workflow interface
- `Browser.svelte` -- Embedded browser with tab management and URL bar
- `Rubrics.svelte` -- Rubric library management
- `SiteProfiles.svelte` -- Site profile management and discovery
- `Skills.svelte` -- Skill search, install, and management
- `History.svelte` -- Grading session history viewer
- `Logs.svelte` -- Server log viewer
- `SetupWizard.svelte` -- First-run setup flow
- `settings/Settings.svelte` -- Settings hub (providers, credentials, embedding, columns, themes)

### 4. Client-Side Libraries (`ogre-desktop/src/lib/`)

**Purpose:** Business logic modules used by the Svelte UI. All browser interaction, AI communication, and data management flows through these modules.

**Key subsystems:**

- **Browser agent loop:** `agent-loop.ts`, `agent-api.ts`, `agent-prompt.ts`, `agent-types.ts`, `agent-dom.ts`, `agent-dom-fuzzy.ts` -- AI-driven browser automation with step limits, loop detection, and review/auto modes
- **Browser interaction:** `browser.ts`, `browser-actions.ts`, `cdp-client.ts`, `cdp-actions.ts` -- Embedded browser control via Electron IPC and CDP
- **Grading pipeline:** `grading-api.ts`, `batch-grader.ts`, `grading-pipeline.ts` -- SSE-based grading API client, batch extraction/fill, post-grading embedding storage
- **Discovery:** `discover.ts`, `discovery-intent.ts`, `discovery-ui.ts`, `extraction-config-discovery.ts`, `heuristic-detector.ts` -- AI-powered page structure analysis to build site profiles
- **Site profiles:** `site-profiles.ts`, `profile-editor.ts`, `profile-tester.ts`, `profile-precedence.ts`, `profile-json-converter.ts` -- Profile CRUD and testing
- **Skills:** `skills-api.ts`, `skill-parser.ts`, `skill-utils.ts`, `skill-creation-prompt.ts` -- Skill fetch from skills.sh, parsing, and injection
- **Embeddings/calibration:** `vector-store.ts`, `cosine-similarity.ts`, `embedding-stats.ts`, `calibration-retrieval.ts`, `re-embed.ts`, `pre-grading-retrieval.ts` -- Local vector store for historical calibration
- **Infrastructure:** `db.ts`, `server.ts`, `electron-bridge.ts`, `oauth.ts`, `provider-sync.ts`, `sse-parser.ts`, `privacy.ts`, `autofill.ts`, `constants.ts`

### 5. Agent Infrastructure (`.agents/`)

**Purpose:** Markdown-based capability routing for Claude Code agents. Defines skills, workflows, and behavioral rules for AI agents operating on this codebase.

**Key domains:**
- `.agents/authoring/` -- MyOpenMath question authoring skills (mom-frq, mom-patterns, mom-style-guide, etc.)
- `.agents/grading/` -- Grading skills (grade-frq-aio, grade-selectors, grade-show-work)
- `.agents/gradebook/` -- Gradebook sync pipeline (gb-compare, gb-new-assignment, gb-sync, gb-pipeline)
- `.agents/cli/` -- CLI tool references (bun, npm, cargo, ollama, vitest, gh, gws, python)
- `.agents/memory/` -- Session memory and learning persistence (LightRAG integration)
- `.agents/meta/` -- Meta-skills (skill-creator, session-reflector, model-roster, find-skills)

### 6. Autoresearch (`autoresearch/`)

**Purpose:** Automated prompt mutation and evaluation loop for optimizing grading prompts. Runs experiments that mutate prompts, grade test data, and track which mutations improve accuracy.

**Entry point:** `autoresearch/loop.js`

**Key files:** `data-loader.js`, `eval-harness.js`, `mutation-engine.js`, `metrics.js`, `results-tracker.js`, `loop-controller.js`

### 7. Supporting Components

- **`agent-browser-temp/`** -- Vendored copy of an agent-browser library (Playwright-based browser automation toolkit for AI agents)
- **`fine-tuned-model/`** -- Contains a quantized Qwen3.5-9B model (GGUF format) for local Ollama serving
- **`runpod/`** -- RunPod cloud GPU deployment configs
- **`demo/`** -- HTML demo grading pages for testing (SpeedGrader tiers, quiz formats)
- **`dist/`** -- Legacy build output (web-only frontend, largely superseded by desktop app)
- **`fonts/`** -- Font assets
- **`.github/workflows/`** -- CI: `desktop-build.yml` builds the Electron app on Windows

## Data Flow

### Grading Flow (Batch)

1. Teacher opens a grading page in the embedded browser (`Browser.svelte`)
2. Discovery system (`discover.ts`) analyzes the page to identify student sections, score inputs, and feedback areas
3. Batch grader (`batch-grader.ts`) extracts student responses via CDP/evalScript
4. Desktop sends extracted data to grading server via SSE POST to `/api/grade`
5. Server builds prompts with scoring anchors (`grading.js`), chunks students, and calls the active AI provider (`providers.js`)
6. Server streams back scores and feedback via SSE events
7. Desktop displays results for teacher review in GradingPanel
8. On approval, batch grader fills scores and feedback back into the page via CDP
9. Post-grading pipeline (`grading-pipeline.ts`) embeds responses via `/api/embed` and stores in SQLite for calibration

### Grading Flow (Agent Mode)

1. Agent loop (`agent-loop.ts`) captures page state (DOM snapshot + screenshot)
2. Sends context to `/api/agent` on grading server
3. Server forwards to active AI provider with page context
4. AI returns structured action (click, fill, extract, etc.)
5. Agent executes action via `browser-actions.ts` / CDP
6. Loop repeats with updated page state until task complete or step limit reached

### Provider Configuration

1. Desktop stores provider configs in SQLite (`database.ts`)
2. On startup and changes, `provider-sync.ts` pushes configs to grading server via POST `/internal/providers`
3. Server persists to `ogre-server.json` on disk (`config.js`) and hot-reloads on changes
4. Server manages OAuth token refresh for Anthropic and GitHub Models in-process

### Site Profile Discovery

1. Teacher navigates to a grading page in embedded browser
2. Discovery system captures DOM snapshot and screenshot
3. Sends to AI via `/api/chat` for structural analysis
4. AI identifies CSS selectors for students, scores, feedback, navigation
5. Profile saved to SQLite `site_profiles` table
6. Profiles synced to grading server via `/api/profiles/sync` for server-side matching

### Embedding and Calibration

1. After grading, responses are sanitized (`privacy.ts` strips student names)
2. Embedded via local ONNX model (all-MiniLM-L6-v2, 384-dim) through `/api/embed`
3. Stored in SQLite `response_embeddings` table with rubric hash, score, and metadata
4. Before future grading, `pre-grading-retrieval.ts` fetches similar past responses as calibration context
5. Calibration examples injected into grading prompts as scoring anchors

## Entry Points

| Component | Entry Point | Runtime |
|-----------|------------|---------|
| Desktop app | `ogre-desktop/electron-main/main.ts` | Electron (Node.js) |
| Svelte renderer | `ogre-desktop/src/main.js` | Browser (Vite dev / bundled) |
| Grading server | `grading-server/server.js` | Bun (port 3456) |
| Autoresearch | `autoresearch/loop.js` | Node.js/Bun |
| Desktop build | `ogre-desktop/vite.config.js` | Vite + electron-builder |
| Server build | `grading-server/build.js` | @yao-pkg/pkg (standalone binary) |
| CI pipeline | `.github/workflows/desktop-build.yml` | GitHub Actions (Windows) |
| Agent routing | `.agents/README.md` + `CLAUDE.md` | Claude Code (markdown-driven) |

## Abstractions

### Provider Adapter Pattern (`grading-server/providers.js`)

Each AI provider has a matched pair of functions: `build<Provider>Request(config, messages)` returns a `{url, headers, body}` object, and `parse<Provider>Response(response)` extracts the text. The server's `callProviderDirect()` function uses a switch on provider ID to select the right adapter pair. This makes adding new providers a matter of adding two functions and a case branch.

### IPC Handler Registration (`ogre-desktop/electron-main/ipc-handlers.ts`)

The Electron main process organizes IPC handlers into domain modules: `registerDatabaseHandlers()`, `registerBrowserHandlers()`, `registerCdpHandlers()`, `registerOAuthHandlers()`. Each module calls `ipcMain.handle()` for its domain. The renderer calls these via `invoke()` from `electron-bridge.ts`.

### Site Profiles

Site profiles are a key abstraction that decouples the grading engine from specific LMS page structures. A profile contains CSS selectors for student lists, score inputs, feedback editors, and navigation controls. Profiles are either manually created or AI-discovered, stored in SQLite, and synced to the grading server for matching against URLs.

### Agent Action Loop (`ogre-desktop/src/lib/agent-loop.ts`)

An async generator pattern that captures page state, sends it to AI, receives structured actions, and executes them. Supports two modes: "review" (pause for teacher approval per action) and "auto" (execute up to safety limits). Includes step limits, timeout, loop detection, and history pruning to manage context window size.

### Scoring Anchors and Calibration (`grading-server/grading.js`)

Grading prompts are built with "scoring anchors" -- calibrated descriptions of what Excellent/Adequate/Below Average/Minimal responses look like for the specific rubric. Historical embeddings from past grading sessions can be retrieved as additional calibration context, making grading more consistent over time.

### SSE Streaming (`ogre-desktop/src/lib/sse-parser.ts`, `grading-server/server.js`)

The grading server streams results back to the desktop app using Server-Sent Events. The server uses Hono's `streamSSE` helper. The client uses a custom SSE parser over `ReadableStream` (not `EventSource`, because custom Authorization headers are needed). Events include per-student scores, batch progress, and completion signals.

### Config Hot-Reload (`grading-server/config.js`)

The server watches its config file on disk and reloads provider configs without restart. The desktop app writes config changes, and the server picks them up via `fs.watchFile`. This enables the desktop and server to stay in sync without requiring direct coordination beyond the shared config file.

### Electron-Bridge Pattern (`ogre-desktop/src/lib/electron-bridge.ts`)

All renderer-to-main-process communication goes through `invoke()` and `listen()` functions that abstract over `window.electronAPI` (set up by preload.ts). This provides a clean boundary and makes the renderer testable without Electron.
