# O.G.R.E Grading Server Bundle

This directory contains the grading server source code that runs as a Tauri sidecar.

## Architecture

The desktop app uses a **lightweight launcher + source bundle** approach:

- **Launcher**: `grading-server-x86_64-pc-windows-msvc.exe` (195KB Rust binary)
  - Spawns `bun run server.js` from this directory
  - Forwards all I/O to the desktop app

- **Server Bundle**: This directory
  - Complete server source code
  - Dependencies installed via `bun install`

## Build Process

When building the desktop app:

1. The Rust launcher is compiled from `grading-server/sidecar-launcher/`
2. Server source files are copied from `grading-server/` to this directory
3. Run `bun install --production` in this directory to install dependencies
4. Tauri bundles everything via the `resources` field in tauri.conf.json

## Development

To test the server locally:

```bash
cd ogre-desktop/src-tauri/binaries/server-bundle
bun install
bun run server.js
```

The server will start on `http://localhost:3456` with Playwriter CDP relay on `ws://localhost:19988`.

## Dependencies

- **playwriter**: Embedded CDP relay server for browser automation
- **hono**: HTTP server framework
- Other dependencies listed in package.json
