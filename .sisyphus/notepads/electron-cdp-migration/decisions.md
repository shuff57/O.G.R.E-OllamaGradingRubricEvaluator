# Decisions — electron-cdp-migration

## Format: append only. Never overwrite. Tag each entry with timestamp + task.

## [2026-03-18] Architecture Decisions (from planning session)
- Electron over Tauri: Chromium everywhere, CDP on all platforms
- webContents.debugger for internal agent (NOT --remote-debugging-port)
- --remote-debugging-port ONLY for external chrome-cdp-skill access
- child_process.fork() for grading server (no binary compilation)
- better-sqlite3 for SQLite (replaces tauri-plugin-sql)
- contextIsolation: true, nodeIntegration: false — non-negotiable
- WebContentsView (not deprecated BrowserView)
- Tests-after approach (port vitest tests in Wave 5)
- Fork chrome-cdp-skill → merge OGRE capabilities → PR upstream
