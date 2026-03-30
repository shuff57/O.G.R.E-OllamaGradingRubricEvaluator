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
MEMORIES_FILE = Path.home() / "agent-memories" / "hivemind" / "memories.jsonl"


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
    frontmatter_end = 0
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

    with open(MEMORIES_FILE, "a", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    embed_note = f" ({embedded_count}/{len(entries)} embedded)" if embedded_count else " (no embeddings - Ollama unavailable)"
    print(f"Indexed {len(entries)} entries from {reflection_path.name}{embed_note}")


if __name__ == "__main__":
    main()
