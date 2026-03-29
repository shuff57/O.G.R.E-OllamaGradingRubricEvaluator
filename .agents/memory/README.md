# Agent Memory (Hivemind + Ollama)

## What is this?

Persistent agent memory using Hivemind JSONL backed by Ollama embeddings.
Shared between Claude Code and Pi sessions via `~/pi-memories/hivemind/memories.jsonl`.

Local-first, file-based. No Python venv, no pip packages, no Docker.

## How it works

1. Reflections are written as markdown files in `pending/`.
2. `scripts/index_reflection.py` parses reflections into JSONL entries with Ollama embeddings.
3. Entries are appended to `~/pi-memories/hivemind/memories.jsonl`.
4. `scripts/query_memory.py` searches memories via cosine similarity (falls back to substring).

Flow: `pending/ -> index_reflection.py -> ~/pi-memories/hivemind/memories.jsonl <- query_memory.py`

## Quick start

1. Run setup: `bash .agents/memory/scripts/setup.sh`
2. Ensure Ollama is running (`ollama serve`) with `nomic-embed-text` model.
3. Index a reflection:
   `python3 .agents/memory/scripts/index_reflection.py pending/some-reflection.md`
4. Query memory:
   `python3 .agents/memory/scripts/query_memory.py "What did we learn about X?"`

## File structure

- `README.md` — this guide
- `pending/` — reflections waiting to be indexed
- `pending/indexed/` — reflections already indexed into JSONL
- `scripts/setup.sh` — Ollama setup check
- `scripts/index_reflection.py` — reflection-to-JSONL indexer
- `scripts/query_memory.py` — cosine-similarity memory search

## Shared memory pool

Both Claude Code and Pi write to the same file:
`~/pi-memories/hivemind/memories.jsonl`

Pi's `hivemind.ts` extension writes here via `/memory store`.
Claude Code's session-reflector writes here via `index_reflection.py`.

Cross-device sync is handled by the `pi-memories` git repo + Syncthing.

## Prerequisites

- Python 3.8+ (stdlib only, no pip packages)
- Ollama running locally with `nomic-embed-text` model
- `~/pi-memories/hivemind/` directory (created by setup.sh)

## Memory agent (self-improving maintenance)

The memory agent analyzes, consolidates, de-duplicates, and suggests improvements:

- **Skill:** `.agents/memory/memory-agent.md`
- **Script:** `.agents/memory/scripts/memory_agent.py`
- **Improvement log:** `.agents/memory/meta/improvement-log.jsonl` (tracked in git)
- **Reports:** `.agents/memory/meta/reports/` (local only, gitignored)

Commands: `analyze`, `dedupe`, `consolidate`, `archive`, `suggest`, `report`, `compact`

All mutations use shadow-append (safe for concurrent Pi/Claude writers). The agent reads its own improvement log on each run to refine heuristics over time.

Runs at three tiers:
1. **Session start** — `report --oneline` (read-only health check)
2. **Session end** — duplicate check on new reflection (via session-reflector Phase 2.5)
3. **Weekly schedule** — full maintenance cycle with auto-approve for >0.90 similarity

## Graceful degradation

- Ollama unavailable: entries stored without embeddings, substring search still works
- No memories yet: query script reports need to index first
- Reflections always preserved as markdown in `pending/` regardless of indexing outcome
