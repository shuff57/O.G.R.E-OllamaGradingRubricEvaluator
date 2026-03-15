---
name: skill-creator
description: Use when creating or rewriting an agent skill so the output follows the gold standard SKILL.md format and placement conventions.
---

# Skill Creator

> This meta-skill standardizes how new skills are authored so every skill is predictable, searchable, and safe to run. It interviews the user for required inputs, then produces a complete SKILL.md in the approved structure. The output is a ready-to-save skill at `.agents/skills/{name}/SKILL.md`.

## Prerequisites
- Write access to `.agents/skills/`
- Confirmed skill intent from user
- Destination path: `.agents/skills/{name}/SKILL.md`

## When to Use
- User asks to create a new skill
- User asks to rewrite/normalize an existing skill to a standard format
- A plan task requires generating a SKILL.md template-compliant skill

## When NOT to Use
- User asks to execute a skill action immediately without authoring a new skill
- User asks only for a quick tip instead of reusable skill documentation

## Guardrails

> ⚠️ **Must NOT:**
> - Auto-create or save a skill without explicit user confirmation of the final draft
> - Use legacy paths like `.claude/skills/` in output skill instructions
> - Add evaluation/testing framework references unless user explicitly requests them

## Interview

Collect these four required inputs before drafting:
1. **Skill name** (kebab-case, e.g. `grade-importer`)
2. **Purpose** (what job this skill performs)
3. **Trigger phrases** (how users ask for it; must inform `description`)
4. **Tools used** (exact tools/APIs/pages needed)

If any field is missing, ask only for missing fields.

## 8 Format Rules (Mandatory)

1. YAML `description` starts with **"Use when..."** for auto-trigger matching.
2. **Guardrails** section appears **before Workflow** for fail-fast visibility.
3. Each workflow phase uses clear **INPUT → ACTION → OUTPUT**.
4. **Error Handling** and **Common Mistakes** are always tables.
5. Skill content stays under **500 lines**; move overflow into `references/` files.
6. Cross-skill references use `load_skills=["skill-name"]`, never file paths.
7. Use a `references/` subdirectory for supplementary assets (selectors, subject data).
8. Use `knowledge.md` for self-populating domain knowledge bases (follows mom-patterns size policy).

## Quick Start
1. Gather interview answers.
2. Fill the template exactly.
3. Save as `.agents/skills/{name}/SKILL.md` after user confirmation.

## Workflow

### Phase 1: Intake
- **INPUT:** User request to create/rewrite a skill
- **ACTION:** Run Interview; normalize name to kebab-case; capture triggers/tools
- **OUTPUT:** Complete skill specification (name, purpose, triggers, tools)

### Phase 2: Draft
- **INPUT:** Completed specification
- **ACTION:** Fill all required template sections; enforce 8 format rules
- **OUTPUT:** Full SKILL.md draft

### Phase 3: Validate
- **INPUT:** Draft SKILL.md
- **ACTION:** Check frontmatter correctness, section order, rule compliance, and line length
- **OUTPUT:** Confirmed final draft ready for save

## Error Handling

| Problem | Action |
|---------|--------|
| Missing triggers for description | Request trigger phrases and rewrite description to start with "Use when..." |
| Name not kebab-case | Convert to lowercase hyphenated form and confirm with user |
| Workflow missing IO clarity | Rewrite each phase to explicit INPUT → ACTION → OUTPUT |
| Document too large | Move non-core detail to `references/` and keep SKILL.md concise |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Writing description as "This skill does..." | Rewrite to "Use when..." with trigger conditions |
| Putting Guardrails after Workflow | Move Guardrails above Quick Start/Workflow |
| Referencing skill files directly | Replace with `load_skills=["skill-name"]` |
| Saving to wrong directory | Save only to `.agents/skills/{name}/SKILL.md` |

## Template

Use this exact scaffold when generating a new skill:

```markdown
---
name: {skill-name}
description: {One-line description. Starts with "Use when...". Includes trigger phrases.}
---

# {Skill Title}

> {2-3 sentence overview of what this skill does, why it exists, and what it produces.}

## Prerequisites
- {Tool/permission/page required}

## When to Use
- {Trigger condition 1}
- {Trigger condition 2}

## When NOT to Use
- {Anti-trigger — use {other-skill} instead}

## Guardrails

> ⚠️ **Must NOT:**
> - {Forbidden action 1}
> - {Forbidden action 2}

## Quick Start
{Simplest invocation path — 3 lines max}

## Workflow

### Phase 1: {Name}
{Steps with clear inputs/outputs}

### Phase 2: {Name}
{Steps}

## Error Handling

| Problem | Action |
|---------|--------|
| {Error} | {Resolution} |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| {Mistake} | {Correction} |

## State Management (optional)
{State file location, format, resume protocol}

## Selectors / References (optional)
{DOM selectors, API patterns, or link to references/ files}
```

## Output Placement
- Main file: `.agents/skills/{name}/SKILL.md`
- Optional support files: `.agents/skills/{name}/references/*`
- Optional domain memory: `.agents/skills/{name}/knowledge.md`
