# O.G.R.E — Ollama Grading Rubric Evaluator

> AI-powered grading desktop app for educators. Grade 30+ students in minutes, not hours.

![GitHub Release](https://img.shields.io/github/v/release/shuff57/O.G.R.E-OllamaGradingRubricEvaluator?label=Latest%20Release)
![Build Status](https://img.shields.io/github/actions/workflow/status/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/desktop-build.yml?branch=desktop&label=CI)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue)
![License](https://img.shields.io/github/license/shuff57/O.G.R.E-OllamaGradingRubricEvaluator)

<!-- Replace with a real screenshot or demo GIF -->
<!-- ![O.G.R.E Screenshot](docs/screenshot.png) -->

---

## For Teachers

### What it does

O.G.R.E is a native desktop application that evaluates student written responses against your rubric using AI — then fills in scores and feedback automatically.

- **Open your grading page** in the embedded browser (MyOpenMath and others)
- **Load your rubric** — saved rubrics are reusable across assignments
- **Run batch grading** — all students are graded in a single AI pass, ensuring every score is evaluated against the same standard
- **Review and approve** — scores and feedback are written back to the page; you stay in control before anything is submitted

No cloud subscription. No uploading student data to third-party services. The AI runs locally via [Ollama](https://ollama.ai) or your choice of provider.

---

### Download & Install

**[📥 Download the Latest Release](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)**

| Platform | File | Instructions |
|---|---|---|
| **Windows** | `.exe` (NSIS installer) | Run the installer and follow the wizard |
| **Linux** | `.AppImage` | `chmod +x O.G.R.E-Desktop-*.AppImage && ./O.G.R.E-Desktop-*.AppImage` |

---

### How it works

O.G.R.E bundles two things into one window:

1. **An embedded browser** — loads your grading page directly inside the app via Chrome DevTools Protocol (CDP). No tab-switching, no browser extension to install.
2. **A grading server** — a lightweight local server (Bun/Hono) that runs automatically in the background. It handles all AI communication, rubric storage, and scoring logic.

When you start a batch grade run, the app:

1. Extracts all student responses from the page in one pass
2. Sends them to the grading server alongside your rubric and a model answer
3. The server grades all students in a single AI context — this is what produces consistent scores across your class rather than scoring each student in isolation
4. Results are streamed back to the UI as they arrive
5. Scores and feedback are written back to the page fields, ready for your review

**Site Profiles** let you teach O.G.R.E how to read any grading page — where student names are, where response text lives, where to write scores back. MyOpenMath is supported out of the box.

**Rubrics** are saved locally in SQLite and reused across sessions. You define once; O.G.R.E remembers.

---

### Automatic Updates

The app checks for new versions on startup via GitHub Releases. When an update is available:

- The download happens in the background
- You'll see a prompt when it's ready to install
- Updates are cryptographically signed — the app verifies the signature before installing anything

You can also always download manually from the [releases page](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases).

---

## For Developers

### Architecture

O.G.R.E is split into two cooperating processes:

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                            │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ BrowserWindow│  │ CDP Bridge  │  │  Server Manager  │   │
│  │ (Svelte UI)  │  │ (allowlist) │  │  (sidecar spawn) │   │
│  └──────┬───────┘  └──────┬──────┘  └────────┬─────────┘   │
│         │ contextBridge   │ debugger          │ child_process│
│         ▼                 ▼                   ▼             │
│  ┌─────────────┐   ┌────────────┐   ┌──────────────────┐   │
│  │  Renderer   │   │ WebContents│   │  Grading Server  │   │
│  │  (Svelte 5) │   │    View    │   │  (Bun / Hono)    │   │
│  └─────────────┘   └────────────┘   └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Svelte 5 + Vite | App UI, grading panel, rubric editor, history |
| Main process | Electron (Node.js) | Window management, IPC, CDP, auto-update |
| IPC bridge | `contextBridge` + preload | Sandboxed, allowlisted renderer ↔ main communication |
| Browser control | CDP via `webContents.debugger` | Embedded browser — DOM extraction, autofill |
| Grading server | Bun + Hono | AI provider routing, batch grading logic, embeddings |
| Database | SQLite via `better-sqlite3` | Rubrics, grading history, vector store, site profiles |
| Updates | `electron-updater` | GitHub Releases — signed, background download |
| CI/CD | GitHub Actions | Build → artifact upload → GitHub Release on tag push |

The grading server is compiled to a self-contained binary (`@yao-pkg/pkg`) and shipped inside the app package. Electron spawns it as a child process on startup and kills it on exit. The frontend communicates with it over localhost HTTP.

### Local Development

**Prerequisites:** Node.js v20+, npm v10+

```bash
git clone https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator.git
cd O.G.R.E-OllamaGradingRubricEvaluator/ogre-desktop
npm install
npm run electron:dev
```

This starts the Vite dev server on `http://localhost:5173` and launches Electron with hot-reload enabled.

---

### Building & Releasing

```bash
# Production build (outputs to dist-electron/)
cd ogre-desktop
npm run electron:build
```

**To cut a release:**

```bash
# 1. Bump version in ogre-desktop/package.json
# 2. Commit and tag
git add ogre-desktop/package.json
git commit -m "chore: bump version to 0.x.0"
git push origin desktop

git tag -a v0.x.0 -m "Release v0.x.0"
git push origin v0.x.0

# GitHub Actions does the rest:
#   - Builds NSIS installer on windows-latest
#   - Creates a GitHub Release
#   - Uploads installer + latest.yml updater manifest
#   - electron-updater picks up latest.yml for in-app update checks
```

---

### Project Structure

```
O.G.R.E-OllamaGradingRubricEvaluator/
├── ogre-desktop/                  # Electron desktop app
│   ├── src/                       # Svelte 5 frontend
│   │   ├── App.svelte             # Root component, routing
│   │   ├── pages/                 # Page views (Dashboard, GradingPanel, Rubrics, History…)
│   │   └── lib/                   # Core logic — all modules colocated with their tests
│   ├── electron-main/             # Electron main process (TypeScript)
│   │   ├── main.ts                # BrowserWindow + app lifecycle
│   │   ├── preload.ts             # contextBridge IPC surface
│   │   ├── browser-manager.ts     # WebContentsView + CDP session
│   │   ├── cdp-bridge.ts          # CDP allowlist + forwarding
│   │   ├── database.ts            # SQLite setup and migrations
│   │   ├── ipc-handlers.ts        # All IPC channel registrations
│   │   ├── server-manager.ts      # Grading server spawn/kill
│   │   └── updater.ts             # electron-updater integration
│   ├── tests/e2e/                 # Shell-based E2E test suites
│   ├── electron-builder.yml       # Installer config (NSIS + AppImage)
│   └── vite.config.js             # Vite + vite-plugin-electron config
├── grading-server/                # AI grading backend (Bun + Hono)
│   ├── server.js                  # HTTP routes and SSE streaming
│   ├── grading.js                 # Batch prompt construction, scoring, outlier detection
│   ├── providers.js               # Ollama, OpenAI, Anthropic, Gemini, GitHub Models, RunPod
│   ├── agent.js                   # Agent request handler
│   ├── local-embedder.js          # ONNX-based local embeddings
│   └── test/                      # Vitest server-side tests
└── .github/workflows/
    └── desktop-build.yml          # CI/CD: build on push, release on tag
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and open a pull request against `desktop`
4. Open a pull request against `desktop`

To add support for a new grading platform, create a Site Profile (see `ogre-desktop/src/lib/site-profiles.ts`).

## License

MIT — see [LICENSE](LICENSE) for details.
