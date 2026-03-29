# Replace LightRAG with Hivemind Memory Backend

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the LightRAG knowledge graph backend with Hivemind's JSONL + Ollama embeddings, so O.G.R.E and Pi share one memory pool at `~/pi-memories/hivemind/memories.jsonl`.

**Architecture:** Drop LightRAG (Python venv, `lightrag-hku`, `nemotron-3-super:cloud`, `bge-m3`, `lightrag_workdir/`). Replace `index_reflection.py` with a script that converts a reflection markdown file into one or more JSONL entries with Ollama embeddings and appends them to `memories.jsonl`. Replace `query_memory.py` with a script that embeds the query via Ollama and does cosine-similarity search over the JSONL. Session-reflector skill gets updated references. Existing 16 reflections get migrated.

**Tech Stack:** Python 3.8+ (no pip packages), Ollama (`nomic-embed-text`), JSONL

---

## Task 1: Write the new index script

**Files:**
- Create: `.agents/memory/scripts/index_reflection.py` (overwrite existing)

**Step 1: Write `index_reflection.py`**

This script reads a reflection markdown file, splits it into sections, creates JSONL entries with Ollama embeddings, and appends them to `~/pi-memories/hivemind/memories.jsonl`.

```python
#!/usr/bin/env python3
"""Index a session reflection markdown file into Hivemind JSONL memory store."""

import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

OLLAMA_BASE = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
MEMORIES_FILE = Path.home() / "pi-memories" / "hivemind" / "memories.jsonl"


def get_embedding(text: str) -> list[float] | None:
    """Get embedding from Ollama. Returns None if unavailable."""
    try:
        data = json.dumps({"model": EMBED_MODEL, "input": text}).encode()
        req = urllib.request.Request(
            f"{OLLAMA_BASE}/api/embed",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            embeddings = result.get("embeddings", [])
            return embeddings[0] if embeddings else None
    except (urllib.error.URLError, TimeoutError, Exception):
        return None


def parse_reflection(path: Path) -> list[dict]:
    """Parse a reflection markdown into memory entries.

    Splits on ## headings. Each section becomes one memory entry.
    The YAML frontmatter date and slug are extracted for metadata.
    """
    content = path.read_text(encoding="utf-8")
    lines = content.split("\n")

    # Extract frontmatter
    date = ""
    slug = ""
    if lines and lines[0].strip() == "---":
        for i, line in enumerate(lines[1:], 1):
            if line.strip() == "---":
                frontmatter_end = i
                break
            if line.startswith("date:"):
                date = line.split(":", 1)[1].strip()
            if line.startswith("slug:"):
                slug = line.split(":", 1)[1].strip()
        lines = lines[frontmatter_end + 1 :]

    if not date:
        # Fall back to filename pattern YYYY-MM-DD-slug.md
        name = path.stem
        if len(name) >= 10 and name[4] == "-" and name[7] == "-":
            date = name[:10]
            slug = name[11:] if len(name) > 11 else name

    # Extract title from first # heading
    title = slug
    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip()
            break

    # Split into sections by ## headings
    sections: list[tuple[str, str]] = []
    current_heading = ""
    current_body: list[str] = []

    for line in lines:
        if line.startswith("## "):
            if current_body:
                body_text = "\n".join(current_body).strip()
                if body_text:
                    sections.append((current_heading, body_text))
            current_heading = line[3:].strip()
            current_body = []
        else:
            current_body.append(line)

    # Flush last section
    if current_body:
        body_text = "\n".join(current_body).strip()
        if body_text:
            sections.append((current_heading, body_text))

    # If no sections found, treat entire content as one entry
    if not sections:
        full_text = "\n".join(lines).strip()
        if full_text:
            sections = [("", full_text)]

    # Build memory entries
    entries = []
    for heading, body in sections:
        tag_parts = ["reflection"]
        if heading:
            tag_parts.append(heading.lower().replace(" ", "-"))

        # Derive topic tags from heading
        heading_lower = heading.lower()
        if "pattern" in heading_lower:
            tag_parts.append("pattern")
        elif "correction" in heading_lower:
            tag_parts.append("correction")
        elif "what was done" in heading_lower:
            tag_parts.append("completed-work")
        elif "skill" in heading_lower:
            tag_parts.append("skill-improvement")

        information = f"[{title}] {heading}: {body}" if heading else f"[{title}] {body}"

        entries.append({
            "id": str(int(time.time() * 1000)),
            "information": information,
            "tags": ",".join(tag_parts),
            "session_date": date,
            "project": "O.G.R.E",
        })
        # Small delay so IDs don't collide
        time.sleep(0.002)

    return entries


def main():
    if len(sys.argv) < 2:
        print("Usage: index_reflection.py <reflection-file.md>")
        sys.exit(1)

    reflection_path = Path(sys.argv[1])
    if not reflection_path.exists():
        print(f"Error: File {reflection_path} not found")
        sys.exit(1)

    # Ensure memories directory exists
    MEMORIES_FILE.parent.mkdir(parents=True, exist_ok=True)

    entries = parse_reflection(reflection_path)
    if not entries:
        print(f"No content found in {reflection_path.name}")
        sys.exit(1)

    embedded_count = 0
    for entry in entries:
        embedding = get_embedding(f"{entry['information']} {entry['tags']}")
        if embedding:
            entry["embedding"] = embedding
            embedded_count += 1

    # Append to JSONL
    with open(MEMORIES_FILE, "a", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    embed_note = f" ({embedded_count}/{len(entries)} embedded)" if embedded_count else " (no embeddings - Ollama unavailable)"
    print(f"Indexed {len(entries)} entries from {reflection_path.name}{embed_note}")


if __name__ == "__main__":
    main()
```

**Step 2: Verify the script runs without errors on a test reflection**

Run:
```bash
python3 .agents/memory/scripts/index_reflection.py .agents/memory/pending/2026-03-18-agent-profile-fix-and-skill-improvements.md
```
Expected: `Indexed N entries from 2026-03-18-agent-profile-fix-and-skill-improvements.md (N/N embedded)` or `(no embeddings - Ollama unavailable)` if Ollama is off.

**Step 3: Verify entries were appended to `~/pi-memories/hivemind/memories.jsonl`**

Run:
```bash
wc -l ~/pi-memories/hivemind/memories.jsonl
head -1 ~/pi-memories/hivemind/memories.jsonl | python3 -m json.tool
```
Expected: Line count > 0, valid JSON with `id`, `information`, `tags`, `session_date`, `project` fields.

**Step 4: Commit**

```bash
git add .agents/memory/scripts/index_reflection.py
git commit -m "feat: replace LightRAG indexer with Hivemind JSONL backend"
```

---

## Task 2: Write the new query script

**Files:**
- Create: `.agents/memory/scripts/query_memory.py` (overwrite existing)

**Step 1: Write `query_memory.py`**

This script loads the JSONL, embeds the query via Ollama, does cosine-similarity search, falls back to substring match.

```python
#!/usr/bin/env python3
"""Query Hivemind JSONL memory store for relevant past learnings."""

import sys
import json
import math
import urllib.request
import urllib.error
from pathlib import Path

OLLAMA_BASE = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
MEMORIES_FILE = Path.home() / "pi-memories" / "hivemind" / "memories.jsonl"
TOP_K = 10


def get_embedding(text: str) -> list[float] | None:
    """Get embedding from Ollama. Returns None if unavailable."""
    try:
        data = json.dumps({"model": EMBED_MODEL, "input": text}).encode()
        req = urllib.request.Request(
            f"{OLLAMA_BASE}/api/embed",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            embeddings = result.get("embeddings", [])
            return embeddings[0] if embeddings else None
    except (urllib.error.URLError, TimeoutError, Exception):
        return None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def load_memories() -> list[dict]:
    if not MEMORIES_FILE.exists():
        return []
    memories = []
    for line in MEMORIES_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            memories.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return memories


def semantic_search(query_embedding: list[float], memories: list[dict]) -> list[tuple[dict, float]]:
    with_embeddings = [m for m in memories if m.get("embedding")]
    if not with_embeddings:
        return []
    scored = [(m, cosine_similarity(query_embedding, m["embedding"])) for m in with_embeddings]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:TOP_K]


def substring_search(query: str, memories: list[dict]) -> list[dict]:
    q = query.lower()
    return [
        m for m in memories
        if q in m.get("information", "").lower()
        or q in m.get("tags", "").lower()
        or q in m.get("project", "").lower()
    ][:TOP_K]


def format_result(mem: dict, idx: int, score: float | None = None) -> str:
    score_str = f" ({score:.0%} match)" if score is not None else ""
    embed_icon = "+" if mem.get("embedding") else "-"
    return f"  [{idx+1}] [{mem.get('session_date','')}] [{mem.get('project','')}] [{embed_icon}]{score_str}\n      {mem.get('information','')[:200]}\n      tags: {mem.get('tags','')}"


def main():
    if len(sys.argv) < 2:
        print("Usage: query_memory.py '<your query>'")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    memories = load_memories()

    if not memories:
        print("No memories stored yet. Index some reflections first with index_reflection.py.")
        sys.exit(0)

    # Try semantic search
    query_embedding = get_embedding(query)
    if query_embedding:
        results = semantic_search(query_embedding, memories)
        if results:
            print(f"=== Relevant Past Learnings ({len(results)} results) ===\n")
            for i, (mem, score) in enumerate(results):
                print(format_result(mem, i, score))
                print()
            return

    # Fall back to substring
    results = substring_search(query, memories)
    if results:
        label = "FTS fallback" if query_embedding is None else "Substring search"
        print(f"=== {label} ({len(results)} results) ===\n")
        for i, mem in enumerate(results):
            print(format_result(mem, i))
            print()
    else:
        print(f"No memories found matching: {query}")


if __name__ == "__main__":
    main()
```

**Step 2: Test the query script**

Run:
```bash
python3 .agents/memory/scripts/query_memory.py "subagent worktree"
```
Expected: Results from the previously indexed reflection (if Task 1 was run), or "No memories stored yet."

**Step 3: Commit**

```bash
git add .agents/memory/scripts/query_memory.py
git commit -m "feat: replace LightRAG query with Hivemind cosine-similarity search"
```

---

## Task 3: Replace setup.sh (drop LightRAG/venv dependencies)

**Files:**
- Create: `.agents/memory/scripts/setup.sh` (overwrite existing)

**Step 1: Write the new `setup.sh`**

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORIES_DIR="$HOME/pi-memories/hivemind"

echo "=== Hivemind Memory Setup ==="

# Ensure memories directory
mkdir -p "$MEMORIES_DIR"
touch "$MEMORIES_DIR/memories.jsonl"
echo "  Memories file: $MEMORIES_DIR/memories.jsonl"

# Check Ollama
echo "Checking Ollama..."
if curl -s localhost:11434/api/tags > /dev/null 2>&1; then
    echo "  Ollama: running"
else
    echo "  WARNING: Ollama not running. Start with: ollama serve"
    echo "  Memory will still work (no embeddings until Ollama available)"
fi

# Check/pull embedding model
echo "Checking nomic-embed-text model..."
if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    echo "  nomic-embed-text: available"
else
    echo "  Pulling nomic-embed-text..."
    ollama pull nomic-embed-text 2>/dev/null || echo "  WARNING: Could not pull. Run 'ollama pull nomic-embed-text' manually."
fi

echo ""
echo "Setup complete. No Python venv required."
echo "  Index:  python3 $SCRIPT_DIR/index_reflection.py <file.md>"
echo "  Query:  python3 $SCRIPT_DIR/query_memory.py '<query>'"
```

**Step 2: Commit**

```bash
git add .agents/memory/scripts/setup.sh
git commit -m "feat: simplify setup to Ollama-only (drop Python venv/LightRAG)"
```

---

## Task 4: Update README.md

**Files:**
- Modify: `.agents/memory/README.md`

**Step 1: Overwrite README.md**

```markdown
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

## Graceful degradation

- Ollama unavailable: entries stored without embeddings, substring search still works
- No memories yet: query script reports need to index first
- Reflections always preserved as markdown in `pending/` regardless of indexing outcome
```

**Step 2: Commit**

```bash
git add .agents/memory/README.md
git commit -m "docs: update memory README for Hivemind backend"
```

---

## Task 5: Update session-reflector skill

**Files:**
- Modify: `.agents/meta/session-reflector.md`

**Step 1: Update session-reflector references**

Changes needed:
- Remove all references to LightRAG, `.venv`, `lightrag-hku`, `lightrag_workdir/`
- Update prerequisites to just "Ollama with `nomic-embed-text`"
- Update error handling table to drop LightRAG-specific rows
- Script calls remain the same (`index_reflection.py` and `query_memory.py`) — just the backend changed

Replace the prerequisites section:
```
## Prerequisites
- Write access to `.agents/memory/pending/`
- Optional for embedding: Ollama running locally with `nomic-embed-text` model
```

Replace the error handling table:
```
| Problem | Action |
|---------|--------|
| Ollama not running | Entries stored without embeddings; substring search still works |
| `index_reflection.py` fails | Leave file in `pending/`, log reason, continue |
| `query_memory.py` — no memories | Proceed with work; index pending files when possible |
| User says no to saving | End cleanly with no changes |
```

Remove from the Prerequisites note about `setup.sh` creating a venv. Remove the "auto-activates `.venv`" notes from Phase 2 action items.

**Step 2: Commit**

```bash
git add .agents/meta/session-reflector.md
git commit -m "docs: update session-reflector for Hivemind backend"
```

---

## Task 6: Clean up LightRAG artifacts

**Files:**
- Modify: `.agents/memory/.gitignore`
- Delete: `.agents/memory/lightrag_workdir/` (if exists)
- Delete: `.agents/memory/.venv/` (if exists)

**Step 1: Update `.gitignore`**

```
# Hivemind memories live in ~/pi-memories/ (not tracked here)
# Python bytecode
__pycache__/
```

**Step 2: Remove LightRAG working directory if present**

Run:
```bash
rm -rf .agents/memory/lightrag_workdir/ .agents/memory/.venv/
```

**Step 3: Commit**

```bash
git add .agents/memory/.gitignore
git commit -m "chore: remove LightRAG artifacts and update gitignore"
```

---

## Task 7: Migrate existing 16 reflections

**Step 1: Index all pending reflections**

Run:
```bash
for f in .agents/memory/pending/2026-*.md; do
  python3 .agents/memory/scripts/index_reflection.py "$f"
done
```

**Step 2: Index all previously-indexed reflections**

Run:
```bash
for f in .agents/memory/pending/indexed/2026-*.md; do
  python3 .agents/memory/scripts/index_reflection.py "$f"
done
```

**Step 3: Verify memory count**

Run:
```bash
wc -l ~/pi-memories/hivemind/memories.jsonl
```
Expected: Multiple entries (4 pending + 12 indexed reflections, each with multiple sections).

**Step 4: Test query across migrated data**

Run:
```bash
python3 .agents/memory/scripts/query_memory.py "Svelte reactivity"
python3 .agents/memory/scripts/query_memory.py "subagent worktree"
```
Expected: Relevant results from the migrated reflections.

**Step 5: Commit the populated memory file (in pi-memories repo)**

Run:
```bash
cd ~/pi-memories && git add -A && git commit -m "feat: initial hivemind population from O.G.R.E reflections" && cd -
```

---

## Task 8: Verify end-to-end

**Step 1: Run query_memory.py to confirm search works**

```bash
python3 .agents/memory/scripts/query_memory.py "agent profile detection"
```
Expected: Results with similarity scores.

**Step 2: Create a test reflection and index it**

Create a temp file, index it, query for it, then clean up:
```bash
cat > /tmp/test-reflection.md << 'EOF'
---
type: session-reflection
date: 2026-03-28
slug: hivemind-migration-test
---

# Session: Hivemind Migration Test

## What was done
- Migrated memory backend from LightRAG to Hivemind JSONL

## Patterns noticed
- Zero-dependency Python scripts are simpler to maintain than venv-based ones
EOF

python3 .agents/memory/scripts/index_reflection.py /tmp/test-reflection.md
python3 .agents/memory/scripts/query_memory.py "hivemind migration"
```
Expected: The test entry appears in results.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete LightRAG to Hivemind migration"
```
