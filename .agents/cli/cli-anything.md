# cli-anything

Generates CLI harnesses for GUI software so AI agents can control them programmatically. From HKUDS/CLI-Anything.

## Installation

Installed as OpenCode commands in `~/.config/opencode/commands/`. Already available in this environment.

Requires Python 3.10+ and the target software installed locally.

## Key commands

| Command | Purpose |
|---------|---------|
| `/cli-anything <path>` | Generate a full CLI harness for a software codebase (7-phase pipeline) |
| `/cli-anything-refine <path>` | Gap-analyze and expand an existing harness |
| `/cli-anything-refine <path> "<focus>"` | Focused refinement on a specific capability area |
| `/cli-anything-validate <path>` | Validate a generated harness |
| `/cli-anything-test <path>` | Run tests on a generated harness |
| `/cli-anything-list` | List available generated CLIs |

## 7-phase pipeline

1. Analyze — scan source code, map GUI actions to APIs
2. Design — architect command groups, state model, output formats
3. Implement — build Click CLI with REPL, JSON output, undo/redo
4. Plan Tests — create TEST.md with unit + E2E test plans
5. Write Tests — implement test suite
6. Document — update TEST.md with results
7. Publish — create `setup.py`, install to PATH

## Using a generated CLI

```bash
cd <software>/agent-harness && pip install -e .
cli-anything-<name> --help
cli-anything-<name> --json <command> <subcommand> [args]
```

## Notes

- Generated CLIs follow `cli-anything-<name>` naming convention.
- All output supports `--json` flag for structured agent consumption.
- Harnesses include undo/redo and persistent session state.
- Supported software includes GIMP, Blender, LibreOffice, OBS, Inkscape, Audacity, Kdenlive, Shotcut, Zoom, Draw.io, and any custom codebase.
