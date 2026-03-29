#!/usr/bin/env python3
"""Query Hivemind JSONL memory store for relevant past learnings."""

import sys
import io
import json
import math
import urllib.request
import urllib.error
from pathlib import Path

# Ensure stdout handles unicode on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

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
