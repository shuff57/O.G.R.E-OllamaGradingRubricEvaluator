# Draft: Agent Infrastructure Simplification

## Requirements (confirmed)

- **Goal**: Replace multi-layered agent abstraction with simple folder + markdown + scripts structure
- **Universal**: Must work with ANY coding agent (OpenCode, Claude Code, Copilot, Cursor, etc.)
- **Colocated**: Each capability = folder with both .md instructions AND helper scripts (shell, python, JS/TS, whatever fits)
- **No agent framework dependency**: Remove OpenCode/Sisyphus-specific dispatch patterns
- **No bridge files**: Eliminate CLAUDE.md, GEMINI.md, opencode.json thin pointers

## What STAYS (content preserved, restructured)

- AGENTS.md behavioral rules, grading philosophy, safety rules
- Skill content (gb-compare, grade, mom-frq, etc.) — restructured into new format
- CLI references (bun.md, npm.md, cargo-tauri.md, etc.)

## What GOES

- routing.md 3-layer routing abstraction → collapse into simpler structure
- CLAUDE.md bridge file → remove
- GEMINI.md bridge file → remove
- opencode.json tool-specific config → remove (or minimal)
- memory/ system → user didn't explicitly mark to keep; clarify
- .sisyphus/ and .planning/ → may go as part of tool config cleanup

## What Gets COLLAPSED

- routing.md → becomes part of the index/discovery mechanism
- 15 separate skill folders (each with only SKILL.md) → restructured as capability folders with scripts

## Technical Decisions

- **Entry point**: Unified AGENTS.md (behavioral) + index file (capability discovery)
- **Structure**: Self-contained capability folders with .md + scripts colocated
- **Scope**: Agent infra + clean up tool configs (not touching grading-server/ or ogre-desktop/ source)

## Resolved Questions

- **Memory system**: Keep as-is, work on it later. Don't touch it in this restructure.
- **Folder name**: Keep `.agents/` — descriptive, already exists, some tools auto-discover it.
- **Entry point**: Unified AGENTS.md (behavioral rules) + .agents/README.md (capability index/discovery)
- **Tool config cleanup**: Delete ALL tool-specific dirs (.claude/, .sisyphus/, .planning/)
- **Capability grouping**: Agent's discretion — use domain-based grouping where it makes sense, flat where it doesn't. "Do what makes sense."
- **Verification**: Multi-agent smoke test (test with 2-3 different agents to confirm discovery and usability)
- **Test strategy**: No automated tests needed. Multi-agent smoke test is the verification method.

## Scope Boundaries

- INCLUDE: .agents/ restructure, bridge file removal, tool config cleanup, AGENTS.md rewrite
- EXCLUDE: grading-server/, ogre-desktop/ source code, memory system changes
