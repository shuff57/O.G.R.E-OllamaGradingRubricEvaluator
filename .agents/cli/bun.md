# bun

JavaScript/TypeScript runtime and package manager. Used for the grading-server.

## Working directory

`grading-server/`

## Key commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run start` | Start the grading server (dev) |
| `bun run build` | Build standalone executables for all platforms |
| `bun run build:windows` | Build Windows executable |
| `bun run build:mac` | Build macOS Intel executable |
| `bun run build:mac-arm` | Build macOS Apple Silicon executable |
| `bun run build:linux` | Build Linux executable |
| `bun run test` | Run tests (vitest) |
| `bun run test:watch` | Run tests in watch mode |

## Notes

- The grading-server uses `bun` as its runtime (not Node).
- `bun build --compile` produces standalone executables used as Tauri sidecars.
- Output executables land in `grading-server/dist/`.
