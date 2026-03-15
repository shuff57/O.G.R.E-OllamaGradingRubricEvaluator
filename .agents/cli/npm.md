# npm

Node package manager. Used for the ogre-desktop frontend.

## Working directory

`ogre-desktop/`

## Key commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite dev server (frontend only) |
| `npm run build` | Production build (includes turndown bundle) |
| `npm run preview` | Preview production build locally |
| `npm run tauri:dev` | Full desktop dev mode (Vite + Tauri) |
| `npm run tauri:build` | Build production installers (MSI/NSIS) |
| `npm run test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run build:turndown` | Build the turndown HTML-to-markdown bundle |

## Notes

- `tauri:dev` starts both the Vite frontend and the Rust backend with hot-reload.
- `tauri:build` produces installers in `src-tauri/target/release/bundle/`.
- Requires the grading-server sidecar binary to be pre-built before `tauri:build`.
