# Agent Memory (LightRAG + Ollama)

## What is this?

This directory implements persistent agent memory using a local LightRAG
knowledge graph backed by Ollama models.

Purpose:
- preserve session learnings,
- index them into a searchable memory graph,
- retrieve relevant context in future sessions.

It is local-first and file-based: no PostgreSQL, Neo4j, Docker, or hosted
database is required.

## How it works

1. Reflections are written as markdown files (often staged in `pending/`).
2. `scripts/index_reflection.py` ingests a reflection into LightRAG.
3. LightRAG stores generated graph/index artifacts in `lightrag_workdir/`.
4. `scripts/query_memory.py` queries the graph for relevant past learnings.

Flow:
`pending/ -> index_reflection.py -> lightrag_workdir/ -> query_memory.py`

## Quick start

1. Run setup:
   `bash .agents/memory/scripts/setup.sh`
2. Ensure Ollama is running (`ollama serve`).
3. Ensure models are available: `llama3.2` and `nomic-embed-text`.
4. Index a reflection:
   `python3 .agents/memory/scripts/index_reflection.py path/to/reflection.md`
5. Query memory:
   `python3 .agents/memory/scripts/query_memory.py "What did we learn about X?"`

## File structure

- `README.md` — this guide.
- `.gitignore` — excludes generated LightRAG state.
- `pending/` — reflections waiting to be indexed.
- `pending/.gitkeep` — keeps `pending/` tracked.
- `scripts/setup.sh` — install/check bootstrap.
- `scripts/index_reflection.py` — reflection indexer.
- `scripts/query_memory.py` — memory query utility.
- `lightrag_workdir/` — LightRAG auto-generated working data.

## Graceful degradation

If dependencies are unavailable, behavior remains safe and useful:
- Missing LightRAG → scripts print guidance to run setup.
- Ollama unavailable → setup reports actionable startup command.
- No graph data yet → query script reports that indexing is needed.
- Reflections can always remain as markdown in `pending/` for later indexing.

## Prerequisites

- Python 3.8+
- Ollama running locally (`ollama serve`)
- Ollama model: `llama3.2`
- Ollama embedding model: `nomic-embed-text`
- PyPI access to install `lightrag-hku`
