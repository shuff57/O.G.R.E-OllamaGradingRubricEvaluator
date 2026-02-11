# Desktop GUI Wrapper - Learnings

## Task 1: Restore Grading Server Code from Git History

### Status: ✅ COMPLETED

### What Was Done
1. **Cherry-picked 5 commits in order** onto the `desktop` branch:
   - `dbfdf9d` - docs(grading-server): define wire format JSON schemas
   - `afb4b40` - feat(grading-server): implement core grading server with TDD
   - `a4c6d24` - build(grading-server): add cross-platform executable builds
   - `7dd98d4` - build(grading-server): rebuild Windows exe with error handling fix
   - `15ea7ee` - fix(grading-server): keep window open on startup errors so users can read messages

2. **Added `grading-server/dist/` to root `.gitignore`** to prevent committing the ~110MB Windows executable

3. **Extracted test data files** from git history:
   - `test-data/test-rubric.json`
   - `test-data/test-students.json`

### Verification Results
- ✅ All 10 required files created/restored:
  - grading-server/server.js
  - grading-server/grading.js
  - grading-server/providers.js
  - grading-server/schemas.md
  - grading-server/package.json
  - grading-server/bun.lock
  - grading-server/tsconfig.json
  - grading-server/.gitignore
  - grading-server/test/grading.test.js
  - grading-server/test/providers.test.js

- ✅ Server compiles and starts successfully:
  - Listens on port 3456
  - Displays startup banner with usage instructions
  - Ready to accept grading requests

- ✅ All tests pass:
  - 72 tests passed
  - 0 tests failed
  - 135 expect() calls verified

### Key Insights
1. **Cherry-pick workflow**: All 5 commits applied cleanly without conflicts
2. **Test data location**: Test data files are stored in root `test-data/` directory, not in grading-server/
3. **Server architecture**: Uses Hono framework with Node.js server adapter for HTTP handling
4. **Build artifacts**: Windows executable is ~110MB and should never be committed (now in .gitignore)

### Next Steps
- Task 3: Integrate grading server with desktop GUI wrapper
- Task 11: Deploy grading server to production

### Files Modified
- `.gitignore` - Added `grading-server/dist/` entry
- Created: `test-data/test-rubric.json`
- Created: `test-data/test-students.json`

---

## Task 2: Scaffold Tauri 2.0 Project with Svelte

### Status: ✅ COMPLETED

### What Was Done
1. Created `ogre-desktop/` at repo root with Vite + Svelte frontend (`npm create vite@latest . -- --template svelte`)
2. Installed Tauri CLI (`@tauri-apps/cli@2.10.0`) as dev dependency
3. Manually scaffolded `src-tauri/` directory (interactive `tauri init` not available in CI)
4. Configured `tauri.conf.json` with all required settings
5. Added Cargo.toml with all required plugins
6. Installed JS packages: `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-sql`, `@tauri-apps/api`
7. Created `src-tauri/binaries/` with `.gitkeep` and placeholder sidecar
8. Generated app icons from repo `favicon.png` via `npx tauri icon`
9. Created capabilities/permissions file for shell, SQL, and core access
10. Verified: `cargo check` passes (exit code 0)

### Key Configuration
- **productName**: "O.G.R.E Desktop"
- **identifier**: "com.ogre.desktop"
- **bundle.externalBin**: ["binaries/grading-server"]
- **Window title**: "O.G.R.E - Grading Server Manager"
- **Window size**: 900x650
- **Cargo plugins**: tauri-plugin-shell, tauri-plugin-sql (sqlite), tauri (tray-icon)

### Gotchas
1. **externalBin requires actual files at build time**: Tauri's build script validates that sidecar binaries exist with the target triple appended (e.g., `grading-server-x86_64-pc-windows-msvc.exe`). Created a placeholder `.exe` for `cargo check` to pass. `.gitignore` excludes `src-tauri/binaries/*.exe` while `.gitkeep` keeps the directory tracked.
2. **Tauri 2.0 config structure**: Uses flat top-level keys (`productName`, `identifier`, `build`, `app`, `bundle`, `plugins`) — NOT nested under a `tauri` key like v1.
3. **Capabilities/permissions**: Tauri 2.0 has a security model requiring explicit permission grants in `capabilities/*.json`. Added `core:default`, shell permissions, and `sql:default`.
4. **Cargo.toml lib section**: Need `crate-type = ["staticlib", "cdylib", "rlib"]` for proper Tauri library compilation.

### Versions Used
- Tauri CLI: 2.10.0 | tauri crate: 2.10.2 | tauri-build: 2.5.5
- tauri-plugin-shell: 2.3.5 | tauri-plugin-sql: 2.3.2
- Svelte: 5.45.2 | Vite: 7.3.1
- Rust: 1.92.0 | Node: 22.16.0

### File Structure
```
ogre-desktop/
├── src/                    # Svelte frontend (default Vite template)
│   ├── App.svelte
│   ├── main.js
│   └── lib/Counter.svelte
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # Windows entry point
│   │   └── lib.rs          # Tauri builder with plugins
│   ├── binaries/           # Sidecar binaries go here
│   │   └── .gitkeep
│   ├── capabilities/
│   │   └── default.json    # Permission grants
│   ├── icons/              # Generated from favicon.png
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── package.json
└── vite.config.js
```

### For Next Tasks
- The Svelte frontend has default Vite template content — replace with actual UI (Tasks 5-10)
- Shell plugin permissions are configured for spawning the grading-server sidecar (Task 3)
- SQL plugin with SQLite is ready for local data persistence (Task 4)
- Tray icon feature is enabled in Cargo.toml but not yet implemented in lib.rs
