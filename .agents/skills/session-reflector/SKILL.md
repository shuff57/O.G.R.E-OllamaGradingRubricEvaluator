---
name: session-reflector
description: Use when ending a work session or starting a new one to persist learnings in pending/ and keep LightRAG memory indexed and queryable.
---

# Session Reflector

> This skill standardizes end-of-session reflection capture and next-session memory retrieval for agent continuity. It always confirms with the user before writing, writes durable markdown first, then opportunistically indexes into LightRAG. If Ollama or LightRAG is unavailable, the workflow still succeeds by preserving pending reflections for later indexing.

## Prerequisites
- Write access to `.agents/memory/pending/`
- Python available for index and query scripts
- Optional for indexing/query: Ollama running locally with LightRAG installed

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
> - Block session end on LightRAG/Ollama availability
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

## Question Hook Conventions (Per Tool)

Questions to the user MUST use the tool's native mechanism — never free-form text guessing.

### OpenCode (native — preferred)
Use the **`question` tool** directly. OpenCode shows a real UI dialog.
The `/session-end` command in `opencode.json` triggers this workflow.
`permission.question` is set to `"ask"` in `opencode.json` — dialog always appears.

### Other tools (fallback)
Use bracketed text format:
```
[QUESTION] <question text>
Options: y / n / edit
```

| Tool | Mechanism | Trigger |
|------|-----------|---------|
| OpenCode | `question` tool (native UI) | `/session-end` command |
| Other | `[QUESTION]` text format | Manual invocation |

## Graceful Degradation

If Ollama or LightRAG is down/unavailable:
- Still write session reflection markdown to `pending/`
- Do not fail session shutdown
- Defer indexing to a later session
- Keep script calls non-blocking

## Error Handling

| Problem | Action |
|---------|--------|
| Ollama not running | Keep reflections in `pending/`; retry indexing next session |
| LightRAG dependency missing | Preserve flat markdown; run setup later |
| `index_reflection.py` fails | Leave file in `pending/`, log reason, continue |
| `query_memory.py` — no graph data | Proceed with work; index pending files when possible |
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
- **Knowledge graph:** `.agents/memory/lightrag_workdir/` (gitignored)

## References
- Index script: `.agents/memory/scripts/index_reflection.py`
- Query script: `.agents/memory/scripts/query_memory.py`
- LightRAG setup: `.agents/memory/scripts/setup.sh`
