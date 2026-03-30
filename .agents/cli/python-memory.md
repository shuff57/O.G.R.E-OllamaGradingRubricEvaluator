# python3 (Hivemind memory scripts)

Python scripts for agent memory indexing and retrieval via Hivemind JSONL.

## Working directory

Run from repo root. Scripts live in `.agents/memory/scripts/`.

## Key commands

| Command | Purpose |
|---------|---------|
| `bash .agents/memory/scripts/setup.sh` | Check Ollama, ensure `nomic-embed-text` model |
| `python3 .agents/memory/scripts/index_reflection.py <file>` | Parse reflection markdown into JSONL entries with embeddings |
| `python3 .agents/memory/scripts/query_memory.py "<query>"` | Cosine-similarity search over memories (substring fallback) |

## Prerequisites

- Python 3.8+ (stdlib only, no pip packages)
- `ollama serve` running
- Model: `nomic-embed-text`

## File layout

- `pending/` — reflections waiting to be indexed
- `pending/indexed/` — reflections already indexed
- Memory store: `~/agent-memories/hivemind/memories.jsonl`

## Notes

- Scripts use only Python stdlib — no venv or pip install needed.
- Ollama unavailable: entries stored without embeddings, substring search still works.
- Memory writes always require explicit user confirmation.
- See `.agents/memory/README.md` for the full protocol.
