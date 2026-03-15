# cargo / tauri

Rust build system and Tauri CLI. Used for the desktop app shell and sidecar launcher.

## Working directories

- Desktop app: `ogre-desktop/src-tauri/`
- Sidecar launcher: `grading-server/sidecar-launcher/`

## Key commands

| Command | Working dir | Purpose |
|---------|------------|---------|
| `cargo build` | `src-tauri/` | Build the Rust backend (debug) |
| `cargo build --release` | `src-tauri/` | Build the Rust backend (release) |
| `cargo test` | `src-tauri/` | Run Rust unit tests |
| `cargo tauri dev` | `ogre-desktop/` | Full dev mode (equivalent to `npm run tauri:dev`) |
| `cargo tauri build` | `ogre-desktop/` | Build production installers |
| `cargo build` | `sidecar-launcher/` | Build the sidecar launcher |

## Notes

- Tauri v2 is used — commands and plugin APIs differ from v1.
- The sidecar launcher is a small Rust binary that manages the grading-server process.
- `tauri.conf.json` in `src-tauri/` controls app metadata, window config, and updater settings.
- Tauri CLI is installed as an npm devDependency (`@tauri-apps/cli`), invocable via `npm run tauri`.
