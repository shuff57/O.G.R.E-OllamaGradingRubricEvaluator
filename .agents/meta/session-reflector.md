
# Session Reflector

> This skill standardizes end-of-session reflection capture and next-session memory retrieval for agent continuity. It always confirms with the user before writing, writes durable markdown first, then opportunistically indexes into Hivemind JSONL. If Ollama is unavailable, entries are stored without embeddings and substring search still works.

## Prerequisites
- Write access to `.agents/memory/pending/`
- Optional for embedding: Ollama running locally with `nomic-embed-text` model

## When to Use
- Session is ending and key learnings should be preserved
- New session is beginning and prior learnings should be recalled
- `pending/` contains unindexed reflection files from a prior session

## When NOT to Use
- One-off transient notes not meant to become durable memory
- Tasks requiring immediate action with no time for reflection

## Guardrails

> ⚠️ **Must NOT:**
> - Write to `.agents/memory/pending/` without explicit user confirmation [y/n]
> - Block session end on Ollama availability
> - Skip writing a reflection because indexing failed
> - Delete pending reflections before successful indexing
> - Move files out of `pending/` unless indexing confirmed success

## Quick Start
1. Draft a reflection summary from the session.
2. Ask: "Save learnings to `.agents/memory/pending/`? [y/n/edit]"
3. On yes: write `{YYYY-MM-DD}-{slug}.md` to pending/.

## Workflow

### Phase 0: Confirm Before Writing (Required)
- **INPUT:** Session outcomes, corrections, repeat patterns
- **ACTION:** Draft a reflection summary (≤50 lines), then ask the user:
  > "Want me to save these learnings to `.agents/memory/pending/`? [y/n/edit]"
- **OUTPUT:** User decision — only proceed to Phase 1 if confirmed. On "edit", show the draft for revision before writing.

### Phase 1: Session End Reflection (Immediate)
- **INPUT:** Confirmed reflection content
- **ACTION:** Write `{YYYY-MM-DD}-{slug}.md` to `.agents/memory/pending/` (slug = 3–5 word kebab-case)
- **OUTPUT:** Reflection file saved. Never proceed to move/index until written successfully.

Required reflection content:
- What was done (high-level completed work)
- Patterns noticed (repeatable workflow or failure patterns)
- Corrections received (what changed due to feedback)
- Skill creation/improvement suggestions

### Phase 2: Next Session Start — Recall + Deferred Indexing
- **INPUT:** Current task summary + any files in `.agents/memory/pending/`
- **ACTION A (Recall First):**
   `python3 .agents/memory/scripts/query_memory.py "<current task summary>"`
- **ACTION B (Deferred Indexing):** For each file in `pending/`:
   1. Run `python3 .agents/memory/scripts/index_reflection.py <file>`
   2. On success: move to `.agents/memory/pending/indexed/`
   3. On failure: keep in `pending/`, continue
- **OUTPUT:** Relevant memory recalled; indexed files archived; failed files preserved.

### Phase 2.5: Post-Index Duplicate Check (After Phase 2)
- **INPUT:** ID of the newly indexed entry (from Phase 2 output)
- **ACTION A (Duplicate Check):**
   `python3 .agents/memory/scripts/memory_agent.py dedupe --threshold 0.85 --dry-run`
   If any pair includes the new entry with >0.85 similarity: warn the user.
   > "This new reflection is very similar to an existing entry (X% match). Consolidate? [y/n/skip]"
   On yes: `python3 .agents/memory/scripts/memory_agent.py consolidate --ids <new-id,existing-id>`
- **ACTION B (Quick Suggest):**
   `python3 .agents/memory/scripts/memory_agent.py suggest --new-only --since <new-id>`
   Present any suggestions to the user (non-blocking).
- **ACTION C (Meta-Reflection):**
   Append entry to `.agents/memory/meta/improvement-log.jsonl` recording this Phase 2.5 run.
- **OUTPUT:** Duplicates caught early; suggestions surfaced; improvement log updated.

## Asking for Confirmation

Ask the user for confirmation using plain text or the tool's native dialog mechanism:

```
[QUESTION] Want me to save these learnings to `.agents/memory/pending/`? [y/n/edit]
```

Any coding agent can trigger this workflow by invoking the session-reflector at session end.

## Graceful Degradation

If Ollama is down/unavailable:
- Still write session reflection markdown to `pending/`
- Do not fail session shutdown
- Defer indexing to a later session
- Keep script calls non-blocking

## Error Handling

| Problem | Action |
|---------|--------|
| Ollama not running | Entries stored without embeddings; substring search still works |
| `index_reflection.py` fails | Leave file in `pending/`, log reason, continue |
| `query_memory.py` — no memories | Proceed with work; index pending files when possible |
| User says no to saving | End cleanly with no changes |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Auto-writing without confirmation | Always ask [y/n] before writing to pending/ |
| Writing reflections outside `pending/` | Save to the required pending path and naming pattern |
| Making indexing mandatory at session end | Treat indexing as deferred and non-blocking |
| Moving files before confirmed index | Move to `indexed/` only after index success |

## State Management
- **Pending queue:** `.agents/memory/pending/{YYYY-MM-DD}-{slug}.md`
- **Indexed archive:** `.agents/memory/pending/indexed/`
- **Memory store:** `~/agent-memories/hivemind/memories.jsonl`

## References
- Index script: `.agents/memory/scripts/index_reflection.py`
- Query script: `.agents/memory/scripts/query_memory.py`
- Memory agent: `.agents/memory/scripts/memory_agent.py`
- Memory agent skill: `.agents/memory/memory-agent.md`
- Setup: `.agents/memory/scripts/setup.sh`
