# CLI Reference Index

Lazy-load directory for agent-accessible CLI tools.
Read a file here only when you need that specific CLI — don't load them all upfront.

## Available CLIs

| File | CLI | When to load |
|------|-----|-------------|
| `bun.md` | `bun` | Running/building the grading-server, installing its deps |
| `npm.md` | `npm` | Running/building ogre-desktop frontend, installing its deps |
| `cargo-tauri.md` | `cargo` / `tauri` | Building the Rust desktop shell or sidecar launcher |
| `ollama.md` | `ollama` | Local model serving, model management, fine-tuned model creation |
| `vitest.md` | `vitest` | Running tests in grading-server or ogre-desktop |
| `gh.md` | `gh` | GitHub releases, PRs, issues, Actions workflows |
| `python-memory.md` | `python3` | Hivemind memory scripts (index, query, setup) |
| `cli-anything.md` | `cli-anything` | Generating CLI harnesses for GUI software (agent-native control) |
| `gws.md` | `gws` | Google Workspace: Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin |

## How Agents Should Use This

1. Identify which CLI you need for the current task.
2. Read **only** that file (e.g., `Read .agents/cli/bun.md`).
3. Follow the working-directory and invocation notes in the file.
4. Do **not** preload all files — that defeats lazy loading.
