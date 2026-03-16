# Learnings — sidecar-extension-removal

## Pre-existing LSP Errors (NOT IN SCOPE — do not fix)
- grading-server/server.js: multiple "unreachable code" errors at lines 804, 808, 822, 1024, 1027, 1041, 1048, 1061, 1062, 1068, 1139, 1160
- ogre-desktop/src-tauri/binaries/server-bundle/server.js: same unreachable code errors
- ogre-desktop/src/lib/batch-grader.ts:718 — forEach callback returning value
- These exist BEFORE our work; do not report as new failures

## Architecture
- Worktree: /home/shuff57/.config/superpowers/worktrees/O.G.R.E-OllamaGradingRubricEvaluator/sidecar-extension-removal
- All work must happen in the worktree, NOT the main repo
- Frontend (Svelte) → Grading Server (HTTP :3456) → Ollama

## Key File Locations (in worktree)
- Cargo.toml: ogre-desktop/src-tauri/Cargo.toml
- tauri.conf.json: ogre-desktop/src-tauri/tauri.conf.json
- capabilities: ogre-desktop/src-tauri/capabilities/default.json
- lib.rs: ogre-desktop/src-tauri/src/lib.rs
- package.json: ogre-desktop/package.json
- server.ts: ogre-desktop/src/lib/server.ts

## Conventions
- Rust: tokio 1.x with async/await, tauri 2.x plugin system
- JS/TS: @tauri-apps/* packages matching tauri v2
- Evidence files: .sisyphus/evidence/task-N-slug.txt (in main repo, not worktree)
