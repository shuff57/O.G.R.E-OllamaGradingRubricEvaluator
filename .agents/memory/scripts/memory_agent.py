#!/usr/bin/env python3
"""Self-improving memory agent for Hivemind JSONL store.

Analyzes, consolidates, de-duplicates, and suggests improvements
for the shared memory pool. Uses shadow-append strategy for all
mutations (safe for concurrent Pi/Claude writers).

Commands:
  analyze   — Health report: clusters, staleness, tag distribution
  dedupe    — Find high-similarity entry pairs
  consolidate — Merge entries by ID into one authoritative entry
  archive   — Soft-delete entries with reason
  suggest   — Flag stale references and gaps
  report    — Quick health summary
  compact   — Rewrite JSONL removing archived entries (manual only)
"""

import sys
import io
import json
import math
import time
import re
import argparse
import urllib.request
import urllib.error
from pathlib import Path

# Ensure stdout handles unicode on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

OLLAMA_BASE = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
MEMORIES_FILE = Path.home() / "agent-memories" / "hivemind" / "memories.jsonl"
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # .agents/memory/scripts -> repo root
PENDING_DIR = Path(__file__).resolve().parent.parent / "pending"


# ---------------------------------------------------------------------------
# Shared helpers (matching existing index_reflection.py / query_memory.py)
# ---------------------------------------------------------------------------

def get_embedding(text: str) -> list | None:
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


def cosine_similarity(a: list, b: list) -> float:
    """Cosine similarity between two vectors. Handles dimension mismatch."""
    min_len = min(len(a), len(b))
    if min_len == 0:
        return 0.0
    a, b = a[:min_len], b[:min_len]
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def load_memories() -> list:
    """Load all entries from JSONL."""
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


def load_active_memories() -> list:
    """Load entries, resolving shadow-archive markers.

    An entry is archived if a later line has the same ID and archived=true,
    or if the entry itself has archived=true.
    """
    all_entries = load_memories()

    # Collect archive markers (entries with archived=true)
    archived_ids = set()
    replaced_ids = set()
    for entry in all_entries:
        if entry.get("archived"):
            archived_ids.add(entry.get("id", ""))
        # Consolidated entries mark what they replace
        for rid in entry.get("replaces", []):
            replaced_ids.add(rid)

    # Filter to active entries
    active = []
    for entry in all_entries:
        eid = entry.get("id", "")
        if entry.get("archived"):
            continue
        if eid in archived_ids or eid in replaced_ids:
            continue
        active.append(entry)
    return active


def append_entries(entries: list) -> None:
    """Append entries to JSONL (shadow-append, never rewrite)."""
    MEMORIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MEMORIES_FILE, "a", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")


def extract_file_paths(text: str) -> list:
    """Extract potential file paths from free text."""
    patterns = [
        r'[`"\']([a-zA-Z0-9_./-]+\.(md|js|ts|rs|py|json|toml|yaml|yml|sh|css|svelte|html))[`"\']',
        r'(?:^|\s)(\.?(?:agents|src|grading-server|ogre-desktop)/[a-zA-Z0-9_./-]+)',
        r'(?:^|\s)([a-zA-Z0-9_-]+/[a-zA-Z0-9_./-]+\.(md|js|ts|rs|py))',
    ]
    paths = set()
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            paths.add(match.group(1))
    return sorted(paths)


def tag_overlap(tags_a: str, tags_b: str) -> int:
    """Count shared tags between two comma-separated tag strings."""
    set_a = set(t.strip() for t in tags_a.split(",") if t.strip())
    set_b = set(t.strip() for t in tags_b.split(",") if t.strip())
    return len(set_a & set_b)


def count_pending() -> int:
    """Count unindexed reflection files in pending/."""
    if not PENDING_DIR.exists():
        return 0
    return len([f for f in PENDING_DIR.glob("*.md") if f.name != "CLAUDE.md"])


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_analyze(args):
    """Produce health report: clusters, staleness, tag distribution."""
    active = load_active_memories()
    all_entries = load_memories()
    archived_count = len(all_entries) - len(active)

    if not active:
        print(json.dumps({"error": "No active memories found"}, indent=2))
        return

    # Filter by --since
    if args.since:
        active = [e for e in active if e.get("id", "") >= args.since]

    # Limit
    if args.limit:
        active = active[-args.limit:]

    # Tag distribution
    tag_counts = {}
    for entry in active:
        for tag in entry.get("tags", "").split(","):
            tag = tag.strip()
            if tag:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    # Project distribution
    project_counts = {}
    for entry in active:
        proj = entry.get("project", "unknown")
        project_counts[proj] = project_counts.get(proj, 0) + 1

    # Date range
    dates = [e.get("session_date", "") for e in active if e.get("session_date")]
    date_range = {"earliest": min(dates) if dates else "", "latest": max(dates) if dates else ""}

    # Staleness: check file paths referenced in entries
    stale_entries = []
    for entry in active:
        paths = extract_file_paths(entry.get("information", ""))
        broken = [p for p in paths if not (PROJECT_ROOT / p).exists()]
        if broken:
            stale_entries.append({
                "id": entry.get("id", ""),
                "info_preview": entry.get("information", "")[:100],
                "broken_paths": broken,
            })

    # Clusters (similarity within same-tag groups) — skip if --quick
    clusters = []
    if not args.quick:
        embedded = [e for e in active if e.get("embedding")]
        # Group by primary tag to reduce O(n^2)
        tag_groups = {}
        for entry in embedded:
            primary_tag = entry.get("tags", "").split(",")[0].strip() or "untagged"
            tag_groups.setdefault(primary_tag, []).append(entry)

        seen_pairs = set()
        for group_entries in tag_groups.values():
            for i, a in enumerate(group_entries):
                for b in group_entries[i + 1:]:
                    pair_key = tuple(sorted([a["id"], b["id"]]))
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)
                    sim = cosine_similarity(a["embedding"], b["embedding"])
                    if sim >= 0.70:
                        clusters.append({
                            "id_a": a["id"],
                            "id_b": b["id"],
                            "similarity": round(sim, 3),
                            "preview_a": a.get("information", "")[:80],
                            "preview_b": b.get("information", "")[:80],
                        })

        # Also check cross-group for very high similarity
        all_embedded = embedded
        for i, a in enumerate(all_embedded):
            for b in all_embedded[i + 1:]:
                pair_key = tuple(sorted([a["id"], b["id"]]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                # Only cross-group if tags overlap
                if tag_overlap(a.get("tags", ""), b.get("tags", "")) > 0:
                    sim = cosine_similarity(a["embedding"], b["embedding"])
                    if sim >= 0.80:
                        clusters.append({
                            "id_a": a["id"],
                            "id_b": b["id"],
                            "similarity": round(sim, 3),
                            "preview_a": a.get("information", "")[:80],
                            "preview_b": b.get("information", "")[:80],
                        })

        clusters.sort(key=lambda c: c["similarity"], reverse=True)

    report = {
        "total_active": len(active),
        "total_archived": archived_count,
        "pending_reflections": count_pending(),
        "entries_with_embeddings": len([e for e in active if e.get("embedding")]),
        "entries_without_embeddings": len([e for e in active if not e.get("embedding")]),
        "tag_distribution": dict(sorted(tag_counts.items(), key=lambda x: -x[1])),
        "project_distribution": project_counts,
        "date_range": date_range,
        "stale_entries": stale_entries,
        "clusters": clusters,
    }

    print(json.dumps(report, indent=2))


def cmd_dedupe(args):
    """Find entry pairs with high cosine similarity."""
    active = load_active_memories()
    embedded = [e for e in active if e.get("embedding")]

    if not embedded:
        print(json.dumps({"error": "No entries with embeddings found"}, indent=2))
        return

    threshold = args.threshold
    pairs = []
    seen = set()

    for i, a in enumerate(embedded):
        for b in embedded[i + 1:]:
            pair_key = tuple(sorted([a["id"], b["id"]]))
            if pair_key in seen:
                continue
            seen.add(pair_key)
            sim = cosine_similarity(a["embedding"], b["embedding"])
            if sim >= threshold:
                pairs.append({
                    "id_a": a["id"],
                    "id_b": b["id"],
                    "similarity": round(sim, 3),
                    "date_a": a.get("session_date", ""),
                    "date_b": b.get("session_date", ""),
                    "preview_a": a.get("information", "")[:120],
                    "preview_b": b.get("information", "")[:120],
                    "tags_a": a.get("tags", ""),
                    "tags_b": b.get("tags", ""),
                })

    pairs.sort(key=lambda p: p["similarity"], reverse=True)

    result = {
        "threshold": threshold,
        "total_compared": len(embedded),
        "pairs_found": len(pairs),
        "dry_run": args.dry_run,
        "pairs": pairs,
    }

    print(json.dumps(result, indent=2))


def cmd_consolidate(args):
    """Merge entries by ID into one authoritative entry."""
    ids = [i.strip() for i in args.ids.split(",") if i.strip()]
    if len(ids) < 2:
        print(json.dumps({"error": "Need at least 2 IDs to consolidate"}))
        return

    active = load_active_memories()
    entries_map = {e["id"]: e for e in active if "id" in e}

    found = [entries_map[i] for i in ids if i in entries_map]
    missing = [i for i in ids if i not in entries_map]

    if missing:
        print(json.dumps({"warning": f"IDs not found (skipped): {missing}"}))
    if len(found) < 2:
        print(json.dumps({"error": "Need at least 2 valid entries to consolidate"}))
        return

    # Merge information fields
    merged_parts = []
    all_tags = set()
    dates = []
    projects = set()
    for entry in found:
        merged_parts.append(entry.get("information", ""))
        for tag in entry.get("tags", "").split(","):
            tag = tag.strip()
            if tag:
                all_tags.add(tag)
        if entry.get("session_date"):
            dates.append(entry["session_date"])
        if entry.get("project"):
            projects.add(entry["project"])

    merged_info = "\n---\n".join(merged_parts)
    merged_tags = ",".join(sorted(all_tags))

    # Create new consolidated entry
    new_entry = {
        "id": str(int(time.time() * 1000)),
        "information": merged_info,
        "tags": merged_tags + ",consolidated",
        "session_date": max(dates) if dates else "",
        "project": ",".join(sorted(projects)) if projects else "",
        "replaces": [e["id"] for e in found],
    }

    # Try to embed the merged text
    embedding = get_embedding(f"{merged_info} {merged_tags}")
    if embedding:
        new_entry["embedding"] = embedding

    # Create archive markers for originals
    archive_markers = []
    for entry in found:
        archive_markers.append({
            "id": entry["id"],
            "archived": True,
            "archived_reason": "consolidated",
            "archived_date": time.strftime("%Y-%m-%d"),
            "consolidated_into": new_entry["id"],
        })

    # Shadow-append: new entry + archive markers
    append_entries([new_entry] + archive_markers)

    result = {
        "consolidated_id": new_entry["id"],
        "source_ids": [e["id"] for e in found],
        "merged_tags": merged_tags,
        "embedded": bool(embedding),
        "info_preview": merged_info[:200],
    }
    print(json.dumps(result, indent=2))


def cmd_archive(args):
    """Soft-delete entries by appending archive markers."""
    ids = [i.strip() for i in args.ids.split(",") if i.strip()]
    reason = args.reason or "manual archive"

    active = load_active_memories()
    entries_map = {e["id"]: e for e in active if "id" in e}

    found_ids = [i for i in ids if i in entries_map]
    missing = [i for i in ids if i not in entries_map]

    if missing:
        print(json.dumps({"warning": f"IDs not found (skipped): {missing}"}))

    if not found_ids:
        print(json.dumps({"error": "No valid IDs to archive"}))
        return

    markers = []
    for eid in found_ids:
        markers.append({
            "id": eid,
            "archived": True,
            "archived_reason": reason,
            "archived_date": time.strftime("%Y-%m-%d"),
        })

    append_entries(markers)

    print(json.dumps({
        "archived": found_ids,
        "reason": reason,
        "count": len(found_ids),
    }, indent=2))


def cmd_suggest(args):
    """Cross-reference entries against project filesystem, flag issues."""
    active = load_active_memories()

    if not active:
        print(json.dumps({"error": "No active memories found"}, indent=2))
        return

    # Filter by --since for --new-only
    if args.new_only and args.since:
        active = [e for e in active if e.get("id", "") >= args.since]

    suggestions = []

    # 1. Stale file references
    for entry in active:
        paths = extract_file_paths(entry.get("information", ""))
        broken = [p for p in paths if not (PROJECT_ROOT / p).exists()]
        if broken:
            suggestions.append({
                "type": "stale_reference",
                "entry_id": entry.get("id", ""),
                "preview": entry.get("information", "")[:100],
                "broken_paths": broken,
                "suggestion": "Archive or update this entry — referenced files no longer exist",
            })

    # 2. Entries without embeddings
    no_embed = [e for e in active if not e.get("embedding")]
    if no_embed:
        suggestions.append({
            "type": "missing_embeddings",
            "count": len(no_embed),
            "entry_ids": [e.get("id", "") for e in no_embed[:10]],
            "suggestion": "Re-index these entries with Ollama running to add embeddings",
        })

    # 3. Tag gaps — entries with only "reflection" tag (no topic classification)
    sparse_tags = [e for e in active if e.get("tags", "").strip() in ("reflection", "")]
    if sparse_tags:
        suggestions.append({
            "type": "sparse_tags",
            "count": len(sparse_tags),
            "entry_ids": [e.get("id", "") for e in sparse_tags[:10]],
            "suggestion": "Add topic-specific tags to improve clustering and search",
        })

    # 4. Old entries (>30 days from most recent)
    dates = [e.get("session_date", "") for e in active if e.get("session_date")]
    if dates:
        latest = max(dates)
        old_entries = [
            e for e in active
            if e.get("session_date", "") and e["session_date"] < latest[:7]  # older than latest month
        ]
        if old_entries:
            suggestions.append({
                "type": "aging_entries",
                "count": len(old_entries),
                "date_range": f"{min(e['session_date'] for e in old_entries)} to {max(e['session_date'] for e in old_entries)}",
                "suggestion": "Review old entries for continued relevance — archive if superseded",
            })

    # 5. Pending reflections not yet indexed
    pending = count_pending()
    if pending > 0:
        suggestions.append({
            "type": "pending_reflections",
            "count": pending,
            "suggestion": f"Index {pending} pending reflection(s) with index_reflection.py",
        })

    result = {
        "total_active": len(active),
        "suggestions": suggestions,
        "suggestion_count": len(suggestions),
    }
    print(json.dumps(result, indent=2))


def cmd_report(args):
    """Quick health summary."""
    active = load_active_memories()
    all_entries = load_memories()
    archived = len(all_entries) - len(active)
    pending = count_pending()
    with_embed = len([e for e in active if e.get("embedding")])

    if args.oneline:
        parts = [f"{len(active)} active"]
        if archived:
            parts.append(f"{archived} archived")
        if pending:
            parts.append(f"{pending} pending")
        if with_embed < len(active):
            parts.append(f"{len(active) - with_embed} unembedded")
        print(f"Memory: {', '.join(parts)}")
    else:
        dates = [e.get("session_date", "") for e in active if e.get("session_date")]
        report = {
            "active": len(active),
            "archived": archived,
            "pending_reflections": pending,
            "with_embeddings": with_embed,
            "without_embeddings": len(active) - with_embed,
            "date_range": {
                "earliest": min(dates) if dates else "",
                "latest": max(dates) if dates else "",
            },
        }
        print(json.dumps(report, indent=2))


def cmd_compact(args):
    """Rewrite JSONL removing archived entries. Manual only."""
    if not MEMORIES_FILE.exists():
        print("No memories file to compact.")
        return

    all_entries = load_memories()
    active = load_active_memories()

    removed = len(all_entries) - len(active)
    if removed == 0:
        print("Nothing to compact — no archived entries.")
        return

    # Create backup
    backup = MEMORIES_FILE.with_suffix(".jsonl.bak")
    backup.write_text(MEMORIES_FILE.read_text(encoding="utf-8"), encoding="utf-8")

    # Rewrite with only active entries
    with open(MEMORIES_FILE, "w", encoding="utf-8") as f:
        for entry in active:
            f.write(json.dumps(entry) + "\n")

    print(json.dumps({
        "compacted": True,
        "before": len(all_entries),
        "after": len(active),
        "removed": removed,
        "backup": str(backup),
    }, indent=2))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Self-improving memory agent for Hivemind JSONL store"
    )
    sub = parser.add_subparsers(dest="command", help="Command to run")

    # analyze
    p_analyze = sub.add_parser("analyze", help="Health report with clusters and staleness")
    p_analyze.add_argument("--quick", action="store_true", help="Skip similarity clustering")
    p_analyze.add_argument("--since", help="Only analyze entries with ID >= this value")
    p_analyze.add_argument("--limit", type=int, help="Cap to most recent N entries")

    # dedupe
    p_dedupe = sub.add_parser("dedupe", help="Find high-similarity entry pairs")
    p_dedupe.add_argument("--threshold", type=float, default=0.80, help="Cosine similarity threshold (default: 0.80)")
    p_dedupe.add_argument("--dry-run", action="store_true", help="Output pairs without mutations")

    # consolidate
    p_consolidate = sub.add_parser("consolidate", help="Merge entries by ID")
    p_consolidate.add_argument("--ids", required=True, help="Comma-separated entry IDs to merge")

    # archive
    p_archive = sub.add_parser("archive", help="Soft-delete entries")
    p_archive.add_argument("--ids", required=True, help="Comma-separated entry IDs to archive")
    p_archive.add_argument("--reason", default="manual archive", help="Reason for archiving")

    # suggest
    p_suggest = sub.add_parser("suggest", help="Flag stale references and gaps")
    p_suggest.add_argument("--new-only", action="store_true", help="Only suggest for recent entries")
    p_suggest.add_argument("--since", help="Only check entries with ID >= this value")

    # report
    p_report = sub.add_parser("report", help="Quick health summary")
    p_report.add_argument("--oneline", action="store_true", help="Single-line output for hooks")

    # compact
    sub.add_parser("compact", help="Rewrite JSONL removing archived (manual only, creates .bak)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "analyze": cmd_analyze,
        "dedupe": cmd_dedupe,
        "consolidate": cmd_consolidate,
        "archive": cmd_archive,
        "suggest": cmd_suggest,
        "report": cmd_report,
        "compact": cmd_compact,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
