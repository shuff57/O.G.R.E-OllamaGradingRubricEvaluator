# python3 (LightRAG memory scripts)

Python scripts for agent memory indexing and retrieval.

## Working directory

Run from repo root. Scripts live in `.agents/memory/scripts/`.

## Key commands

| Command | Purpose |
|---------|---------|
| `bash .agents/memory/scripts/setup.sh` | Bootstrap: install LightRAG, check Ollama models |
| `python3 .agents/memory/scripts/index_reflection.py <file>` | Index a reflection markdown file into the knowledge graph |
| `python3 .agents/memory/scripts/query_memory.py "<query>"` | Query the knowledge graph for past learnings |

## Prerequisites

- Python 3.8+
- `ollama serve` running
- Models: `llama3.2`, `nomic-embed-text`
- `lightrag-hku` pip package (installed by `setup.sh`)

## File layout

- `pending/` — reflections waiting to be indexed
- `lightrag_workdir/` — auto-generated graph state (gitignored)

## Notes

- Scripts degrade gracefully if deps are missing — they print guidance instead of crashing.
- Memory writes always require explicit user confirmation.
- See `.agents/memory/README.md` for the full protocol.
