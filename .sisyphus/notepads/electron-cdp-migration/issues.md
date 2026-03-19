# Issues — electron-cdp-migration

## Format: append only. Never overwrite. Tag each entry with timestamp + task.

## [2026-03-18] Known Issues Coming In
- WebKitGTK (Linux) has NO CDP support — confirmed in linux-cdp-fix.md
- evalScript returns "null" on Linux (fire-and-forget, no callback)
- GDK event injection unreliable (not trusted events)
- html2canvas CDN dependency fragile
- 189 call sites depend on evalScript — all broken on Linux
- grading-server/server.js has unreachable code LSP errors (pre-existing, not our concern)

## [2026-03-18] Task 1 Spike Failures
- `electron-rebuild -f -w better-sqlite3` fails under Node v25.8.0 with ESM/CJS loader error in `yargs` (`require is not defined in ES module scope`).
- Electron run logs repeated GPU process launch failures (`error_code=1002`) then fatal `GPU process isn't usable`, causing renderer target closure.
- After target closure, CDP commands for `Page.captureScreenshot`, `Accessibility.getFullAXTree`, and renderer `fetch()` fail with `target closed` / `No target available`.
