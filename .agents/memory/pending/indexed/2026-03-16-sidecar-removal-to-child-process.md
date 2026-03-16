# Sidecar Removal — Tauri Child Process Spawning Patterns

## What was done
- Removed Tauri sidecar mechanism (externalBin, tauri-plugin-shell, compiled launcher binary)
- Replaced with direct tokio::process::Command + command-group child process spawning
- Migrated shell:open to tauri-plugin-opener (openUrl)
- Cleaned all Chrome extension + sidecar references from source and docs
- Added 5 integration tests for server event parsing (parse_server_event helper)

## Tauri resource_dir() dev vs production
- `resource_dir()` in dev mode does NOT resolve bundled resources the same as production
- Dev mode: resources stay at their original location under `src-tauri/`
- Production: Tauri copies resources declared in `tauri.conf.json` to `{resource_dir}/`
- Fix: check `resource_dir().join(path).exists()` first, then fall back to `CARGO_MANIFEST_DIR/binaries/server-bundle`
- Pattern: `env!("CARGO_MANIFEST_DIR")` is the compile-time src-tauri directory

## tokio::process::Command requires Tokio reactor
- `tokio::process::Command` on Unix registers a SIGCHLD handler with the Tokio reactor
- Calling `.group_spawn()` or `.spawn()` from a sync context (like Tauri's `setup()`) panics with "there is no reactor running"
- Fix: defer the spawn to `tauri::async_runtime::spawn(async move { spawn_server(...) })`
- The async runtime provides the reactor context needed for child process management

## command-group crate (v5) patterns
- `CommandGroup` trait adds `.group_spawn()` to both `std::process::Command` and `tokio::process::Command`
- Returns `GroupChild` (sync) or `AsyncGroupChild` (async) which wraps the child in a process group
- `.inner()` gives access to the underlying `Child` for stdio handle extraction
- `kill_on_drop(true)` set on the `TokioCommand` propagates through the group wrapper
- Killing the group kills all grandchild processes (important for bun spawning node)

## macOS/Linux PATH for GUI apps
- GUI apps launched by the window manager don't inherit shell PATH
- bun/node may not be found if installed via homebrew or user-local paths
- Fix: augment PATH before spawning: `/opt/homebrew/bin`, `/usr/local/bin`, `~/.bun/bin`
- Use `#[cfg(not(windows))]` guard since Windows doesn't have this issue

## tauri-plugin-shell to tauri-plugin-opener migration
- `open(url)` from plugin-shell becomes `openUrl(url)` from plugin-opener
- 1:1 behavioral replacement, just different function name
- Must migrate ALL imports before removing plugin-shell (3 files: oauth.ts, History.svelte, test)
- Capabilities: `shell:allow-open` becomes `opener:allow-open-url`
- Must also add `.plugin(tauri_plugin_opener::init())` to Rust plugin chain

## Process cleanup on stale instances
- Always kill ALL existing app instances before restarting during dev
- Stale processes from other projects (STEVE) can interfere with port allocation
- Use `pkill -f "app-name"` before launch to ensure clean state
- Check `lsof -i :PORT` to verify port availability
