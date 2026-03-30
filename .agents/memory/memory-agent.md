
# Memory Agent

> Self-improving memory maintenance — analyze, consolidate, de-duplicate, and suggest improvements for the Hivemind JSONL memory store. Inspired by Hyperagents' meta-agent pattern: each invocation reads its own improvement log, applies prior corrections, and appends a new meta-reflection.

## Prerequisites
- `~/agent-memories/hivemind/memories.jsonl` exists with indexed entries
- Optional: Ollama running with `nomic-embed-text` for similarity operations
- Script: `.agents/memory/scripts/memory_agent.py`

## When to Use
- Memory store needs maintenance (duplicates, stale entries, sparse tags)
- Session-reflector flagged a potential duplicate during indexing
- Scheduled weekly maintenance cycle
- Manual review of memory health

## When NOT to Use
- Writing new reflections (use `session-reflector` instead)
- Querying memory for a specific topic (use `query_memory.py` directly)
- One-off lookups that don't need maintenance

## Guardrails

> **Must NOT:**
> - Delete entries permanently without user approval — always use shadow-archive
> - Rewrite `memories.jsonl` outside of manual `compact` command
> - Auto-approve consolidations below 0.90 similarity in unattended mode
> - Exceed `--max-auto-mutations 10` in scheduled runs
> - Modify entries written by Pi (different `project` field) without explicit approval

## Workflow

### Meta Phase 0: Read Improvement Log (Always First)

Before any operation, check for prior self-corrections:

```bash
# Read improvement log if it exists
cat .agents/memory/meta/improvement-log.jsonl 2>/dev/null
```

If the log exists, read the most recent entry's `heuristic_adjustments` and apply them to the current run. For example:
- Adjusted dedupe threshold (use the logged value instead of default 0.80)
- Adjusted cluster grouping strategy
- Known false-positive patterns to skip

### Phase 1: Analyze

Run the health report to understand current memory state:

```bash
python3 .agents/memory/scripts/memory_agent.py analyze
```

Read the JSON output. Present to the user:
- Total active vs archived entries
- Pending reflections count
- Cluster groups (entries with >0.70 similarity)
- Stale entries referencing files that no longer exist
- Tag distribution

For quick checks (Tier 2 integration):
```bash
python3 .agents/memory/scripts/memory_agent.py analyze --quick --since <last-indexed-id>
```

### Phase 2: Consolidate

Review clusters from Phase 1. For each cluster with similarity >0.80:

1. Show the user both entries side-by-side
2. Ask: "Consolidate these into one entry? [y/n/skip]"
3. On yes:
```bash
python3 .agents/memory/scripts/memory_agent.py consolidate --ids <id1,id2,...>
```

The script shadow-appends a merged entry and archive markers. Originals stay in the JSONL but are filtered out by all read operations.

For scheduled runs (Tier 3): auto-approve clusters >0.90 similarity, queue the rest.

### Phase 3: De-duplicate

Find high-similarity pairs:

```bash
python3 .agents/memory/scripts/memory_agent.py dedupe --threshold 0.80
```

For each pair:
1. Show previews and similarity score
2. Ask which to keep (the more complete one) or whether to consolidate
3. Archive the duplicate:
```bash
python3 .agents/memory/scripts/memory_agent.py archive --ids <id> --reason "duplicate of <other-id>"
```

For dry-run preview only:
```bash
python3 .agents/memory/scripts/memory_agent.py dedupe --threshold 0.80 --dry-run
```

### Phase 4: Suggest

Identify gaps and improvement opportunities:

```bash
python3 .agents/memory/scripts/memory_agent.py suggest
```

Review suggestions with the user:
- **stale_reference**: Entry references files that no longer exist → archive or update
- **missing_embeddings**: Re-index with Ollama running
- **sparse_tags**: Add topic tags to improve clustering
- **aging_entries**: Review old entries for continued relevance
- **pending_reflections**: Index pending files

For each suggestion, ask the user whether to act on it.

### Meta Phase 5: Self-Improve (Always Last)

After completing operations, append a meta-reflection:

1. Summarize what operations were performed
2. Note any decisions that felt uncertain
3. Self-assess accuracy (1-5 scale)
4. Propose heuristic adjustments for next run

Append to `.agents/memory/meta/improvement-log.jsonl`:
```json
{
  "date": "<today>",
  "generation": <increment from last entry>,
  "operations": ["analyze", "dedupe", "consolidate"],
  "decisions": ["merged 3 async-pattern entries", "skipped CSS pair — different contexts"],
  "accuracy_self_score": 4,
  "heuristic_adjustments": ["raise dedupe threshold to 0.85 for cross-tag pairs"]
}
```

## Trigger Integration

This skill runs at three depths (see plan for full details):

| Tier | Trigger | Depth | Phases |
|------|---------|-------|--------|
| 1 | Session start hook | Read-only | `report --oneline` only |
| 2 | Session-reflector Phase 2.5 | Light analysis | 0 → 1 (quick) → suggest (new-only) → 5 |
| 3 | Weekly schedule / manual `/memory-agent` | Full maintenance | 0 → 1 → 2 → 3 → 4 → 5 |

## Manual Maintenance

Periodically (or when file gets large), compact the JSONL:
```bash
python3 .agents/memory/scripts/memory_agent.py compact
```
This creates a `.bak` backup then rewrites the file without archived entries. **Never run from hooks or scheduled agents.**

## Error Handling

| Problem | Action |
|---------|--------|
| Ollama not running | Skip similarity-based operations; use tag-based grouping |
| No entries with embeddings | Report count; suggest re-indexing |
| Consolidate fails mid-merge | Shadow-append is atomic per entry; partial state is safe |
| Improvement log missing | Start at generation 1 with default heuristics |

## State Management
- **Memory store:** `~/agent-memories/hivemind/memories.jsonl` (shared, append-only)
- **Improvement log:** `.agents/memory/meta/improvement-log.jsonl` (tracked in git)
- **Maintenance reports:** `.agents/memory/meta/reports/{date}.md` (local only, gitignored)

## References
- Memory agent script: `.agents/memory/scripts/memory_agent.py`
- Index script: `.agents/memory/scripts/index_reflection.py`
- Query script: `.agents/memory/scripts/query_memory.py`
- Session reflector: `.agents/meta/session-reflector.md`
- Hyperagents (inspiration): `github.com/facebookresearch/Hyperagents`
