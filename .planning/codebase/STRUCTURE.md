# Directory Structure

## Top-Level Layout

```
O.G.R.E-OllamaGradingRubricEvaluator/
|-- .agents/                    # Agent infrastructure (markdown skill/capability routing)
|   |-- authoring/              # MyOpenMath question authoring skills
|   |-- cli/                    # CLI tool reference docs (bun, npm, cargo, ollama, etc.)
|   |-- gradebook/              # Gradebook sync skills (compare, create, sync, pipeline)
|   |-- grading/                # Grading skills (FRQ, show-work, selectors)
|   |-- memory/                 # Session memory / LightRAG persistence
|   |-- meta/                   # Meta-skills (skill-creator, session-reflector, model-roster)
|   |-- CLAUDE.md               # Agent entry CLAUDE.md
|   +-- README.md               # Capability routing index
|
|-- .github/workflows/          # CI/CD (desktop-build.yml)
|-- .planning/                  # Project planning docs
|   +-- codebase/               # Architecture and structure docs (this file)
|-- .sisyphus/                  # Task tracking (boulder.json, plans/)
|
|-- agent-browser-temp/         # Vendored agent-browser library (Playwright-based)
|-- agent-skills/               # Installable skill packages
|   +-- skills/                 # Individual skill directories with SKILL.md
|
|-- autoresearch/               # Prompt optimization loop (mutation + eval)
|   |-- loop.js                 # Main entry: runs mutation-eval cycles
|   |-- eval-harness.js         # Evaluation runner
|   |-- mutation-engine.js      # Prompt mutation strategies
|   |-- metrics.js              # Scoring metrics
|   +-- test/                   # Tests for each module
|
|-- demo/                       # HTML demo grading pages for testing
|-- dist/                       # Legacy web-only build output
|-- docs/                       # Documentation and plans
|-- fine-tuned-model/           # Quantized Qwen3.5-9B GGUF for Ollama
|-- fonts/                      # Font assets
|
|-- grading-server/             # Local HTTP grading API (Hono on Bun)
|   |-- server.js               # Main server with all routes
|   |-- grading.js              # Core grading logic
|   |-- providers.js            # AI provider adapters
|   |-- config.js               # Config file management
|   |-- rubric-store.js         # Rubric CRUD storage
|   |-- automation.js           # Browser automation session tokens
|   |-- agent.js                # Browser agent endpoint
|   |-- ai-retry.js             # Retry with exponential backoff
|   |-- embedding-adapters.js   # Embedding provider adapters
|   |-- local-embedder.js       # Local ONNX embedding (all-MiniLM-L6-v2)
|   |-- knowledge-profile.js    # AI-generated site profiles
|   |-- grading-constants.js    # Grading philosophy and scale descriptors
|   |-- build.js                # Standalone binary builder (@yao-pkg/pkg)
|   |-- bundle.js               # Bundle for distribution
|   +-- test/                   # Vitest tests
|
|-- ogre-desktop/               # Electron desktop application
|   |-- electron-main/          # Electron main process (TypeScript)
|   |-- src/                    # Svelte renderer (UI + client libraries)
|   |-- src-tauri/              # Legacy Tauri shell (mostly superseded by Electron)
|   |-- dist/                   # Vite build output
|   |-- dist-electron/          # Electron main process build output
|   |-- scripts/                # Build helper scripts
|   |-- spike/                  # Experimental prototypes
|   |-- tests/                  # E2E test scripts
|   |-- vite.config.js          # Vite config with Svelte + Electron plugins
|   |-- vitest.config.ts        # Test runner config
|   +-- electron-builder.yml    # Electron-builder packaging config
|
|-- runpod/                     # RunPod cloud GPU deployment
|
|-- AGENTS.md                   # Shared behavioral rules for all agents
|-- CLAUDE.md                   # Claude Code entry point
|-- PROJECT-AGENT-CONFIG.md     # Session-start behavior and feature routing
|-- SETUP.md                    # Developer setup instructions
|-- README.md                   # Project overview
|-- package.json                # Root workspace (ogre-root, module type)
|-- bun.lock                    # Bun lockfile (root workspace)
+-- versions.json               # Version tracking data
```

## Key Locations

### Electron Main Process
- `ogre-desktop/electron-main/main.ts` -- App entry, window creation, server spawn
- `ogre-desktop/electron-main/ipc-handlers.ts` -- IPC handler registration hub
- `ogre-desktop/electron-main/database.ts` -- SQLite schema, migrations, query handlers
- `ogre-desktop/electron-main/server-manager.ts` -- Child process management for grading server
- `ogre-desktop/electron-main/browser-manager.ts` -- WebContentsView-based tab system
- `ogre-desktop/electron-main/cdp-bridge.ts` -- Chrome DevTools Protocol bridge
- `ogre-desktop/electron-main/oauth-server.ts` -- Local OAuth callback HTTP server
- `ogre-desktop/electron-main/preload.ts` -- Context isolation bridge (exposes IPC to renderer)
- `ogre-desktop/electron-main/updater.ts` -- Auto-update integration

### Svelte UI Pages
- `ogre-desktop/src/App.svelte` -- Root component, sidebar, page router
- `ogre-desktop/src/pages/Dashboard.svelte`
- `ogre-desktop/src/pages/GradingPanel.svelte` -- Main grading workflow
- `ogre-desktop/src/pages/Browser.svelte` -- Embedded browser with tabs
- `ogre-desktop/src/pages/Rubrics.svelte`
- `ogre-desktop/src/pages/SiteProfiles.svelte`
- `ogre-desktop/src/pages/Skills.svelte`
- `ogre-desktop/src/pages/History.svelte`
- `ogre-desktop/src/pages/Logs.svelte`
- `ogre-desktop/src/pages/SetupWizard.svelte`
- `ogre-desktop/src/pages/settings/Settings.svelte` -- Settings hub
- `ogre-desktop/src/pages/settings/ProviderSettings.svelte`
- `ogre-desktop/src/pages/settings/CredentialSettings.svelte`
- `ogre-desktop/src/pages/settings/EmbeddingSettings.svelte`

### Svelte UI Components
- `ogre-desktop/src/components/grading/` -- Grading-specific components (AgentChat, DiscoveryPanel, RubricCard, StudentWorkCard, SolverChat, ProviderSelector, etc.)
- `ogre-desktop/src/components/skills/` -- Skill management components (SkillCard, SkillCreator, SkillPicker, SkillSearch)
- `ogre-desktop/src/components/icons/` -- SVG icon components (index.ts barrel export)
- `ogre-desktop/src/components/MathField.svelte` -- MathLive math input
- `ogre-desktop/src/components/ResponseRenderer.svelte` -- Markdown/LaTeX response display
- `ogre-desktop/src/components/ScreenshotOverlay.svelte`
- `ogre-desktop/src/components/UpdateModal.svelte`

### Client Libraries (Business Logic)
- `ogre-desktop/src/lib/agent-loop.ts` -- Core browser agent control loop
- `ogre-desktop/src/lib/agent-api.ts` -- Agent API client
- `ogre-desktop/src/lib/agent-prompt.ts` -- Agent system prompt
- `ogre-desktop/src/lib/agent-types.ts` -- Agent type definitions
- `ogre-desktop/src/lib/agent-dom.ts` -- DOM capture for agent context
- `ogre-desktop/src/lib/batch-grader.ts` -- Batch extraction/fill engine
- `ogre-desktop/src/lib/grading-api.ts` -- Grading server API client (SSE)
- `ogre-desktop/src/lib/grading-pipeline.ts` -- Post-grading embedding pipeline
- `ogre-desktop/src/lib/discover.ts` -- AI-powered page structure discovery
- `ogre-desktop/src/lib/browser.ts` -- Embedded browser control functions
- `ogre-desktop/src/lib/browser-actions.ts` -- Browser action execution (click, fill, scroll)
- `ogre-desktop/src/lib/cdp-client.ts` -- CDP WebSocket client
- `ogre-desktop/src/lib/cdp-actions.ts` -- CDP high-level actions (screenshot, eval)
- `ogre-desktop/src/lib/db.ts` -- Renderer-side database helpers via IPC
- `ogre-desktop/src/lib/server.ts` -- Server event listeners (session complete, provider changed)
- `ogre-desktop/src/lib/electron-bridge.ts` -- IPC abstraction layer
- `ogre-desktop/src/lib/oauth.ts` -- OAuth flow management
- `ogre-desktop/src/lib/provider-sync.ts` -- Push provider configs to grading server
- `ogre-desktop/src/lib/site-profiles.ts` -- Site profile types and CRUD
- `ogre-desktop/src/lib/skills-api.ts` -- Skill fetch, search, and injection
- `ogre-desktop/src/lib/vector-store.ts` -- Local SQLite vector store for embeddings
- `ogre-desktop/src/lib/cosine-similarity.ts` -- Cosine similarity calculation
- `ogre-desktop/src/lib/privacy.ts` -- PII sanitization for stored responses
- `ogre-desktop/src/lib/sse-parser.ts` -- SSE stream parser
- `ogre-desktop/src/lib/ai-retry.ts` -- Client-side retry logic
- `ogre-desktop/src/lib/autofill.ts` -- Score/feedback autofill script generation
- `ogre-desktop/src/lib/dom-snapshot.ts` -- Smart DOM walk for page snapshots
- `ogre-desktop/src/lib/markdown-extract.ts` -- HTML-to-Markdown via Turndown
- `ogre-desktop/src/lib/heuristic-detector.ts` -- Rule-based grading page detector

### Grading Server
- `grading-server/server.js` -- All HTTP routes (see Architecture for route list)
- `grading-server/grading.js` -- Prompt building, chunking, parsing, outlier detection
- `grading-server/providers.js` -- Provider-specific request/response adapters
- `grading-server/config.js` -- Platform-aware config file management
- `grading-server/local-embedder.js` -- ONNX embedding inference

### Tests
- `grading-server/test/` -- Vitest tests for server modules (grading, providers, agent, chat, embedding, etc.)
- `ogre-desktop/src/lib/*.test.ts` -- Vitest tests co-located with source (agent-loop, batch-grader, browser-actions, discovery, etc.)
- `ogre-desktop/src/components/grading/AgentChat.test.ts` -- Component test
- `ogre-desktop/tests/` -- E2E test scripts
- `autoresearch/test/` -- Autoresearch module tests

### Configuration
- `ogre-desktop/vite.config.js` -- Vite build (Svelte + Electron)
- `ogre-desktop/vitest.config.ts` -- Test runner config
- `ogre-desktop/svelte.config.js` -- Svelte compiler config
- `ogre-desktop/electron-builder.yml` -- Electron packaging config
- `ogre-desktop/jsconfig.json` -- JavaScript/TypeScript path config
- `grading-server/tsconfig.json` -- TypeScript config for server
- `.gitignore` -- Git ignore rules
- `.gitattributes` -- Git LFS and line ending rules

### Agent Infrastructure
- `CLAUDE.md` -- Root agent entry (reads PROJECT-AGENT-CONFIG.md and AGENTS.md)
- `AGENTS.md` -- Behavioral rules, grading philosophy, safety rules, session lifecycle
- `PROJECT-AGENT-CONFIG.md` -- Feature routing and session-start specification
- `.agents/README.md` -- Capability routing index with domain folders and skill names
- `.agents/*/CLAUDE.md` -- Per-domain agent entry points
- `.agents/cli/README.md` -- CLI tool quick index

## Naming Conventions

### Files
- **Svelte components:** PascalCase (`GradingPanel.svelte`, `SkillCard.svelte`)
- **TypeScript/JavaScript libraries:** kebab-case (`agent-loop.ts`, `grading-api.ts`, `batch-grader.ts`)
- **Tests:** Co-located with source, suffixed `.test.ts` or `.test.js` (`agent-loop.test.ts`)
- **Specialized tests:** Additional qualifier before `.test` (`discover.regression.test.ts`, `agent-loop.integration.test.ts`)
- **Agent skills:** kebab-case markdown (`grade-frq-aio.md`, `gb-sync.md`, `mom-patterns.md`)
- **Agent domain CLAUDE.md:** One per folder, provides folder-level agent instructions

### Directories
- **Svelte pages:** `src/pages/` (flat, one component per page)
- **Svelte components:** `src/components/` with domain subfolders (`grading/`, `skills/`, `icons/`)
- **Client logic:** `src/lib/` (flat, module per concern)
- **Agent domains:** `.agents/<domain>/` with markdown skills inside

### Prefixes
- `agent-` -- Browser agent subsystem files (`agent-loop.ts`, `agent-api.ts`, `agent-dom.ts`)
- `cdp-` -- Chrome DevTools Protocol files (`cdp-client.ts`, `cdp-actions.ts`, `cdp-bridge.ts`)
- `browser-` -- Browser interaction files (`browser-actions.ts`, `browser-manager.ts`)
- `discovery-` / `discover` -- Page discovery subsystem
- `profile-` -- Site profile management
- `grading-` -- Grading pipeline files
- `skill-` / `skills-` -- Skill system files
- `embedding-` -- Embedding subsystem
- `gb-` -- Gradebook agent skills
- `mom-` -- MyOpenMath agent skills
- `grade-` -- Grading agent skills

## Important Files

### Must-Read for New Contributors
1. `CLAUDE.md` -- Entry point for agent sessions, points to config and rules
2. `AGENTS.md` -- Grading philosophy, safety rules, forbidden actions, session lifecycle
3. `PROJECT-AGENT-CONFIG.md` -- Feature routing and agent configuration
4. `.agents/README.md` -- Capability routing map for all agent skills
5. `SETUP.md` -- Developer environment setup instructions
6. `README.md` -- Project overview for teachers and developers

### Core Architectural Files
7. `ogre-desktop/electron-main/main.ts` -- Electron app lifecycle and startup sequence
8. `ogre-desktop/electron-main/database.ts` -- Database schema (read migrations for data model)
9. `ogre-desktop/vite.config.js` -- Build configuration showing Svelte + Electron integration
10. `grading-server/server.js` -- All HTTP API routes in one file (the API surface)
11. `grading-server/grading.js` -- Core grading algorithm (anchors, chunking, parsing)
12. `grading-server/providers.js` -- How each AI provider is called

### Key Integration Points
13. `ogre-desktop/electron-main/server-manager.ts` -- How desktop spawns/manages grading server
14. `ogre-desktop/src/lib/electron-bridge.ts` -- IPC abstraction (renderer to main process)
15. `ogre-desktop/src/lib/provider-sync.ts` -- How provider configs flow from desktop to server
16. `grading-server/config.js` -- Shared config file between desktop and server

### Build and Deploy
17. `ogre-desktop/electron-builder.yml` -- Desktop app packaging
18. `grading-server/build.js` -- Server standalone binary build
19. `.github/workflows/desktop-build.yml` -- CI pipeline
20. `ogre-desktop/package.json` -- Desktop dependencies and scripts
21. `grading-server/package.json` -- Server dependencies and scripts
