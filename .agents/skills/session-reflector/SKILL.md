---
name: session-reflector
description: Use when ending a work session or starting a new one to persist learnings in pending/ and keep LightRAG memory indexed and queryable.
---

# Session Reflector

> This skill standardizes end-of-session reflection capture and next-session memory retrieval for agent continuity. It always writes durable markdown first, then opportunistically indexes into LightRAG. If Ollama or LightRAG is unavailable, the workflow still succeeds by preserving pending reflections for later indexing.

## Prerequisites
- Write access to `.agents/memory/pending/`
- Python available for `.agents/memory/scripts/index_reflection.py` and `.agents/memory/scripts/query_memory.py`
- Optional for indexing/query: Ollama running locally with LightRAG dependencies installed

## When to Use
- Session is ending and key learnings should be preserved
- New session is beginning and prior learnings should be recalled before significant work
- `pending/` contains one or more unindexed reflection files

## When NOT to Use
- One-off transient notes that are not meant to become durable memory
- Tasks that require immediate code changes without any reflection/query step

## Guardrails

> ⚠️ **Must NOT:**
> - Block session end on LightRAG/Ollama availability
> - Skip writing a reflection because indexing failed
> - Delete pending reflections before successful indexing
> - Move files out of `pending/` unless indexing succeeded

## Quick Start
1. At session end, write one reflection markdown file to `.agents/memory/pending/{YYYY-MM-DD}-{slug}.md`.
2. At next session start, query memory with `.agents/memory/scripts/query_memory.py` using current task summary.
3. If pending files exist, index each with `index_reflection.py`; only then move to `pending/indexed/`.

## Workflow

### Phase 1: Session End Reflection (Immediate)
- **INPUT:** Session outcomes, corrections, and repeat patterns
- **ACTION:** Create a markdown reflection in `.agents/memory/pending/` named `{YYYY-MM-DD}-{slug}.md` (slug is 3-5 word kebab-case)
- **OUTPUT:** Reflection file saved locally in `pending/` (target length: ≤50 lines)

Required reflection content:
- What was done (high-level completed work)
- Patterns noticed (repeatable workflow or failure patterns)
- Corrections received (what changed due to feedback)
- Skill creation/improvement suggestions (candidate automation or skill updates)

### Phase 2: Next Session Start Recall + Deferred Indexing
- **INPUT:** Current task summary + any files in `.agents/memory/pending/`
- **ACTION A (Recall First):** Run query before significant work:
  - `python3 .agents/memory/scripts/query_memory.py "<current task summary>"`
- **ACTION B (Deferred Indexing):** If `pending/` contains reflection files:
  1. Run `python3 .agents/memory/scripts/index_reflection.py <pending-file>` for each file.
  2. On successful indexing, move the file to `.agents/memory/pending/indexed/`.
  3. If indexing fails, keep file in `pending/` and continue session work.
- **OUTPUT:** Relevant memory recalled; successfully indexed files archived under `pending/indexed/`; failed files preserved for retry.

## Graceful Degradation (Required Behavior)

If Ollama or LightRAG is down/unavailable:
- Still write session reflection markdown to `pending/`.
- Do not fail session shutdown.
- Defer indexing to a later session when dependencies are restored.
- Keep `query_memory.py`/`index_reflection.py` attempts non-blocking and report actionable follow-up.

## Error Handling

| Problem | Action |
|---------|--------|
| Ollama not running | Keep reflections in `pending/`; continue session end; retry indexing next session. |
| LightRAG dependency missing | Preserve flat markdown workflow; run setup later; do not discard reflections. |
| `index_reflection.py` fails on file | Leave file in `pending/`, log failure reason, continue with remaining files. |
| `query_memory.py` has no graph data yet | Proceed with normal work and index pending reflections when possible. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Writing reflections outside `.agents/memory/pending/` | Save to the required pending path and naming pattern. |
| Making indexing mandatory at session end | Treat indexing as deferred and non-blocking. |
| Moving files before confirming successful index | Move to `pending/indexed/` only after index success. |
| Skipping the start-of-session query | Run `query_memory.py` with current task summary before significant work. |

## References
- Pending queue: `.agents/memory/pending/`
- Indexer: `.agents/memory/scripts/index_reflection.py`
- Query tool: `.agents/memory/scripts/query_memory.py`
- Storage backend: LightRAG local workdir (`.agents/memory/lightrag_workdir/`)
