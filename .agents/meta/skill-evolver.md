---
name: skill-evolver
description: Use when a skill underperformed, a workflow failed due to stale instructions, or session-end reflection identifies a skill improvement. Analyzes execution outcomes against skill instructions, proposes targeted edits with protected-section enforcement, and applies changes only after user approval.
---

# Skill Evolver

> Closed-loop skill improvement that grows from real execution outcomes. Observes what happened, compares it to what the skill said should happen, proposes surgical edits, and enforces immutability on safety-critical sections. Every evolution is human-gated — nothing changes without approval.

## Prerequisites
- The skill file to evolve exists in `.agents/{domain}/`
- An execution outcome to learn from (failure, friction, or success pattern)
- Optional: Ollama running with `nomic-embed-text` for similar-issue lookup

## When to Use
- A skill's workflow produced a failure or unexpected friction during execution
- DOM selectors, page structure, or API responses changed and a skill's instructions are stale
- Session-reflector Phase 1 captured a "Skill improvement suggestion" entry
- `memory-agent suggest` surfaced a recurring skill-related issue
- A successful execution revealed a better approach than what the skill documents
- Improvement log shows the same skill failing across multiple sessions

## When NOT to Use
- Creating a brand-new skill from scratch (use `.agents/meta/skill-creator.md`)
- The issue is in source code, not skill instructions (out of agent scope)
- The failure was environmental (Ollama down, network issue) not instructional
- You want to change a Guardrail or batch limit (requires explicit user request, never auto-suggested)

## Guardrails

> ⚠️ **Must NOT:**
> - Auto-apply any edit without explicit user approval `[y/n/edit]`
> - Modify, weaken, or remove content inside **Protected Sections** (see below)
> - Create new skill files — this skill only evolves existing ones
> - Change `references/` files and main skill file in the same proposal (separate proposals)
> - Propose more than one evolution per skill per session (prevents churn)
> - Remove cross-skill references or routing logic
> - Increase batch sizes, remove dry-run requirements, or weaken halt conditions

## Protected Sections

These sections are **immutable** unless the user explicitly requests a change to them by name. The evolver must never propose edits to protected content, even if the LLM analysis suggests it.

| Section | Why protected |
|---------|--------------|
| `## Guardrails` | Safety constraints that protect students |
| `## When NOT to Use` | Routing boundaries prevent misapplication |
| `## Prerequisites` | Dependency contracts with other skills |
| Batch size numbers in `## Workflow` | Rate limits that prevent overwhelming target systems |
| `dry-run`, `--dry-run` references | Audit-before-act requirements |
| `[y/n]` confirmation gates | Human-in-the-loop checkpoints |
| `## Protected Sections` (this section, if present) | Self-referential integrity |

**How to enforce:** Before proposing any diff, scan the skill file and extract all protected section boundaries. Verify the proposed `old_string` → `new_string` does not overlap with any protected range. If it does, split the proposal to exclude the protected content and explain what was skipped.

## Quick Start
1. Identify the skill and the execution outcome that triggered evolution.
2. Run analysis → get a proposal → review with user → apply or discard.

## Workflow

### Phase 0: Gather Context
- **INPUT:** Skill file path + description of what went wrong (or what worked better than expected)
- **ACTION:**
  1. Read the full skill file, noting all protected sections
  2. Read associated `references/` files if the issue involves selectors or reference data
  3. Query memory for prior issues with this skill:
     `python3 .agents/memory/scripts/query_memory.py "skill:<skill-name> issue"`
  4. Read improvement log for prior evolution history on this skill:
     `cat .agents/memory/meta/improvement-log.jsonl`
- **OUTPUT:** Skill content + protected section map + execution context + prior history

### Phase 1: Analyze Divergence
- **INPUT:** Skill instructions vs actual execution outcome
- **ACTION:** Identify the gap between what the skill said and what actually happened. Classify:
  - **STALE:** Instructions reference something that changed externally (DOM, API, page structure)
  - **INCOMPLETE:** A workflow step is missing that was needed in practice
  - **MISLEADING:** Instructions led to a wrong approach; a better path exists
  - **INEFFICIENT:** Instructions work but a discovered shortcut saves significant effort
- **OUTPUT:** Divergence report — type, affected section(s), evidence

### Phase 2: Propose Evolution
- **INPUT:** Divergence report + protected section map
- **ACTION:**
  1. Draft the minimal edit that resolves the divergence
  2. Verify no protected section is touched — if overlap detected, split or skip with explanation
  3. If the edit affects `references/` content, propose it as a **separate** follow-up (not bundled)
  4. Format as a readable diff for user review:
     ```
     SKILL: .agents/{domain}/{name}.md
     SECTION: ## Workflow > Phase 2: {Name}
     TYPE: STALE
     EVIDENCE: {what happened vs what skill said}

     REMOVE:
     > {old lines}

     ADD:
     > {new lines}

     PROTECTED SECTIONS VERIFIED: Guardrails ✓, When NOT to Use ✓, Prerequisites ✓
     ```
  5. Present to user: **"Apply this evolution? [y/n/edit]"**
- **OUTPUT:** Approved proposal, rejected proposal, or user-edited proposal

### Phase 3: Apply (Only After Approval)
- **INPUT:** User-approved proposal
- **ACTION:**
  1. Apply the edit using the Edit tool (exact `old_string` → `new_string`)
  2. Re-read the file and verify protected sections are intact
  3. Verify the file still follows skill-creator format rules (frontmatter, section order, line count)
- **OUTPUT:** Updated skill file

### Phase 4: Record Evolution
- **INPUT:** Applied evolution details
- **ACTION:**
  1. Write execution reflection to `.agents/memory/pending/`:
     ```
     ---
     type: skill-evolution
     skill: {skill-name}
     evolution_type: STALE|INCOMPLETE|MISLEADING|INEFFICIENT
     date: {YYYY-MM-DD}
     slug: evolve-{skill-name}-{3-word-summary}
     ---

     # Skill Evolution: {skill-name}

     ## What changed
     {Summary of the edit}

     ## Why
     {The divergence that triggered it}

     ## Evidence
     {What happened during execution}

     ## Protected sections preserved
     {List of verified protected sections}
     ```
  2. Append to improvement log:
     ```json
     {
       "date": "{today}",
       "type": "skill-evolution",
       "skill": "{skill-name}",
       "evolution_type": "STALE|INCOMPLETE|MISLEADING|INEFFICIENT",
       "section_changed": "{section heading}",
       "protected_verified": true,
       "generation": {increment}
     }
     ```
- **OUTPUT:** Evolution recorded for memory indexing and future self-reference

## Trigger Integration

| Trigger | Source | Action |
|---------|--------|--------|
| Execution failure | Agent encounters stale selector / wrong step during task | Invoke skill-evolver at session end with the failure context |
| Session-reflector | Phase 1 "Skill improvement suggestions" entry | Invoke skill-evolver with the suggestion as input |
| Memory agent | `suggest` surfaces recurring skill issue | Invoke skill-evolver with the pattern context |
| User request | "That skill needs updating" / "fix the gb-sync workflow" | Invoke skill-evolver directly |

## Evolving `references/` Files

Reference files (selectors, subject maps, navigation patterns) evolve **separately** from the main skill:

1. Same Phase 0–1 analysis applies
2. Phase 2 proposal clearly labels the target as `references/{file}.md` (never bundled with main skill edits)
3. Protected sections in references: **selector comment blocks** marked with `<!-- stable -->` are treated as protected
4. Same `[y/n/edit]` approval gate

## Error Handling

| Problem | Action |
|---------|--------|
| Protected section overlap detected | Split proposal to exclude protected content; explain what was skipped |
| Skill file exceeds 500 lines after edit | Move overflow content to `references/` in a follow-up proposal |
| No prior memory hits for this skill | Proceed with current-session evidence only |
| User rejects proposal | Record the rejection reason in improvement log for future context |
| Edit makes file invalid (broken frontmatter, wrong section order) | Revert edit, re-draft proposal, present again |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Proposing edits to Guardrails because "they're outdated" | Guardrails are protected — only the user can request changes to them by name |
| Bundling main skill + references edits in one proposal | Always separate — different review, different risk |
| Multiple evolutions to the same skill in one session | Cap at one per skill per session to prevent churn |
| Proposing evolution without execution evidence | Every proposal needs a concrete "what happened" — no speculative improvements |
| Skipping the memory query in Phase 0 | Prior history prevents re-proposing rejected edits or rediscovering known patterns |

## State Management
- **Evolution proposals:** Presented inline during conversation (not persisted as files)
- **Evolution records:** `.agents/memory/pending/evolve-{skill}-{slug}.md`
- **Improvement log:** `.agents/memory/meta/improvement-log.jsonl`
- **Protected section registry:** Parsed from each skill file at analysis time (not a separate file)

## References
- Skill creator: `.agents/meta/skill-creator.md`
- Session reflector: `.agents/meta/session-reflector.md`
- Memory agent: `.agents/memory/memory-agent.md`
- Improvement log: `.agents/memory/meta/improvement-log.jsonl`
