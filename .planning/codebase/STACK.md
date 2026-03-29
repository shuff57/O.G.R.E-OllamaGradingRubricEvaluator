# Technology Stack

## Languages

- **JavaScript (ES Modules)** -- grading-server (`grading-server/*.js`), root package
- **TypeScript** -- Electron main process (`ogre-desktop/electron-main/*.ts`), frontend lib (`ogre-desktop/src/lib/*.ts`)
- **Svelte 5** -- UI components (`ogre-desktop/src/components/`, `ogre-desktop/src/pages/`)
- **CSS** -- `ogre-desktop/src/app.css`
- **Rust** -- legacy Tauri shell in `ogre-desktop/src-tauri/` (build artifacts only; active desktop uses Electron)

## Runtime

- **Node.js 22** -- grading-server targets `node22-*` for pkg compilation (`grading-server/build.js`)
- **Bun** -- grading-server dev runtime (`bun run server.js` in `grading-server/package.json`); server-manager resolves bun executable at `~/.bun/bin/bun`
- **Electron 33** -- desktop shell (`ogre-desktop/package.json` `electron@^33.4.11`)

## Frameworks

| Framework | Version | Location | Purpose |
|-----------|---------|----------|---------|
| **Svelte** | 5.45+ | `ogre-desktop/` | Reactive UI framework |
| **Hono** | 4.11+ | `grading-server/` | Lightweight HTTP server framework |
| **Electron** | 33.4+ | `ogre-desktop/` | Desktop shell with BrowserWindow + WebContentsView |
| **electron-builder** | 25.1+ | `ogre-desktop/` | Packaging/distribution (NSIS on Windows, AppImage on Linux) |
| **electron-updater** | 6.8+ | `ogre-desktop/` | GitHub Releases auto-update |

## Key Dependencies

### Desktop App (`ogre-desktop/package.json`)

**Database & Storage**
- `better-sqlite3` ^11.10 -- local SQLite database (WAL mode) for provider configs, grading sessions, app settings, embeddings, credentials, site profiles

**Rendering & Math**
- `katex` ^0.16 -- LaTeX math rendering
- `mathlive` ^0.108 -- interactive math input field (`MathField.svelte`)
- `marked` ^17 -- Markdown to HTML
- `turndown` ^7.2 + `turndown-plugin-gfm` -- HTML to Markdown conversion
- `gray-matter` ^4 -- YAML frontmatter parsing for site profiles

**Dev/Build**
- `@sveltejs/vite-plugin-svelte` ^6.2
- `vite-plugin-electron` ^0.29
- `vitest` ^4.0 + `jsdom` ^28 -- unit/integration testing
- `@electron/rebuild` ^4 -- native module rebuild for Electron

### Grading Server (`grading-server/package.json`)

**HTTP**
- `hono` ^4.11 -- API framework with CORS, SSE streaming
- `@hono/node-server` ^1.19 -- Node.js adapter for Hono

**AI / ML**
- `onnxruntime-node` ^1.24 -- local ONNX inference for embeddings
- `@huggingface/tokenizers` ^0.1 -- pure-JS tokenization for local embedding model

**Build/Packaging**
- `@yao-pkg/pkg` ^6.14 -- compiles server into standalone exe (Node 22 runtime embedded)

## Build Tools

- **Vite 7.3** -- frontend bundler and dev server (`ogre-desktop/vite.config.js`)
- **Rollup** -- via Vite for Electron main/preload builds; `better-sqlite3` externalized
- **electron-builder** -- produces NSIS installer (Windows) and AppImage (Linux) from `ogre-desktop/electron-builder.yml`
- **@yao-pkg/pkg** -- compiles `grading-server/server.js` into platform-specific executables (`grading-server/build.js`)
- **Vitest** -- test runner for both desktop and server (`ogre-desktop/vitest.config.ts`, `grading-server/package.json`)
- **Custom script** -- `ogre-desktop/scripts/build-turndown-bundle.js` bundles turndown for renderer

## Configuration

| File | Location | Purpose |
|------|----------|---------|
| `package.json` | root, `ogre-desktop/`, `grading-server/` | Package metadata and scripts |
| `vite.config.js` | `ogre-desktop/` | Vite + Svelte + Electron plugin config |
| `svelte.config.js` | `ogre-desktop/` | Svelte preprocessing (vitePreprocess) |
| `vitest.config.ts` | `ogre-desktop/` | Test environment (Node, glob patterns) |
| `electron-builder.yml` | `ogre-desktop/` | App packaging, publish to GitHub, extra resources |
| `tsconfig.json` | `ogre-desktop/electron-main/`, `grading-server/` | TypeScript compiler options |
| `jsconfig.json` | `ogre-desktop/` | IDE support for JS/Svelte |
| `ogre-server.json` | `~/.config/ogre-desktop/` (runtime) | Provider configs and auth token (written by desktop, read by server) |
| `ogre-rubrics.json` | `~/.config/ogre-desktop/` (runtime) | Saved rubric library |
| `Modelfile-*` | root | Ollama custom model definitions |
| `versions.json` | root | Training/demo data with rubrics and student responses |

## Project Structure

```
ogre-root/                    # ES module root
  ogre-desktop/               # Electron + Svelte desktop app
    electron-main/            # Electron main process (TS)
    src/                      # Svelte renderer
      components/             # Reusable Svelte components
      pages/                  # Route-level pages (Dashboard, Browser, Grading, etc.)
      lib/                    # Core logic (agent loop, CDP, grading pipeline, OAuth, etc.)
    src-tauri/                # Legacy Tauri shell (inactive, build artifacts only)
  grading-server/             # Standalone HTTP grading API
    sidecar-launcher/         # Launcher utilities
  .agents/                    # Claude Code agent infrastructure (skills, memory, routing)
  .planning/                  # Planning documents
```
