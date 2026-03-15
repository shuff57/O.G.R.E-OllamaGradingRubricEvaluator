---
name: mom-patterns
description: Use when MyOpenMath question authoring or pattern-discovery workflows need the shared pattern library for cached question patterns, append-only updates from mom-fact-finder, or pre-writing pattern review before mom-frq drafts a new question.
---

# MOM Patterns Knowledge Base

> This skill defines how the shared MyOpenMath pattern library is stored and maintained. `SKILL.md` is the operating manual, while `knowledge.md` is the living dataset that `mom-fact-finder` updates and `mom-frq` reads before drafting new questions.

## Prerequisites
- `.agents/skills/mom-patterns/knowledge.md` exists and stays tracked with this skill
- `load_skills=["mom-patterns"]` is available to both `mom-fact-finder` and `mom-frq`
- The caller can append new topic entries or refresh existing ones without deleting unrelated history

## When to Use
- `mom-fact-finder` discovers reusable MOM question structure and needs to cache or refresh it
- `mom-frq` is about to draft a new question and should review known patterns first
- A MOM authoring workflow needs the current topic index, entry template, or size-management rules

## When NOT to Use
- You only need one temporary example and do not intend to update the shared library
- The task is general MOM navigation; use `mom-page-map` instead
- The task is writing a new question from scratch without first consulting shared patterns; use `mom-frq` after loading this skill

## Guardrails

> ⚠️ **Must NOT:**
> - Never treat `SKILL.md` as the place to store accumulated pattern data; all real entries belong in `knowledge.md`.
> - Never drop the 800-line hard cap or the compression rule when extending `knowledge.md`.
> - Never overwrite unrelated topics when refreshing one topic; update only the target entry and its index line.
> - Never delete the topic index, entry template, or metadata lines that keep the library searchable.
> - Never freehand-edit topic content without evidence from `mom-fact-finder`; use refresh/append updates grounded in real source QIDs.
> - Never hardcode skill file paths; refer to this skill by name with `load_skills=["mom-patterns"]`.

## Quick Start
1. Load `load_skills=["mom-patterns"]`.
2. Read `knowledge.md` before drafting or updating a MOM question pattern.
3. If a new topic is discovered, append or refresh the matching `knowledge.md` entry and update the topic index.

## Workflow

### Phase 1: Read Before Writing
- **INPUT:** MOM authoring topic or discovery target
- **ACTION:** Open `knowledge.md`, scan the Topic Index, and read any matching entries before drafting new code or writing updates.
- **OUTPUT:** Confirmed cache hit, gap, or stale entry decision

### Phase 2: Update Through mom-fact-finder
- **INPUT:** Browser-derived findings from `mom-fact-finder`
- **ACTION:** Append a new entry or refresh an existing one in `knowledge.md` using the exact entry template below. Keep the best code example concise and preserve extracted function-call notes.
- **OUTPUT:** Updated topic entry plus refreshed Topic Index line

### Phase 3: Consume Through mom-frq
- **INPUT:** Question-writing request in `mom-frq`
- **ACTION:** Read the most relevant entries in `knowledge.md` first, reuse the discovered patterns, and cite the right structures, libraries, and question-type conventions in the drafted question.
- **OUTPUT:** Question draft grounded in archived real-world MOM patterns

### Phase 4: Manage Library Size
- **INPUT:** Pending addition or refresh to `knowledge.md`
- **ACTION:** Keep the file at or under **800 lines total**. If a new or expanded entry would push the file over the cap, compress the oldest or least-used full entry into this 3-line summary form before adding more content:

```markdown
## [Topic Name] (summarized)
**Added**: YYYY-MM-DD | **Sources**: QID #1234 | **Times Used (max)**: 999
[One sentence capturing the durable pattern insight.]
---
```

- **OUTPUT:** `knowledge.md` remains searchable, current, and within the hard size cap

## Knowledge Base Rules

### What `knowledge.md` contains
- Discovered MOM question patterns gathered from real production questions
- Topic-level summaries, extracted function calls, and one best code example per topic
- A maintained Topic Index plus an entry template for future additions

### How `mom-fact-finder` populates it
- Load `load_skills=["mom-patterns"]` first to check for an existing topic
- If the topic exists and `refresh=false`, reuse the cached entry
- If the topic is new or stale, append or refresh the entry in `knowledge.md`
- Update the Topic Index whenever a topic title changes or a new topic is added

### How `mom-frq` reads it
- Load `load_skills=["mom-patterns"]` before writing a question
- Read the relevant topic entries in `knowledge.md` before drafting qtext, control code, or scoring behavior
- Reuse the documented patterns instead of inventing unsupported MOM conventions

### Entry format template

````markdown
## [Topic Name]
**Added**: YYYY-MM-DD | **Sources**: QID #1234, #5678 | **Times Used (max)**: 999
**Question Types**: essay, multipart | **Libraries**: `stats`, `datasummary`

### Key Patterns
- [Pattern bullet 1]
- [Pattern bullet 2]
- [Pattern bullet 3]

### Best Code Example (QID #1234, N uses)
```php
[Best single code example, trimmed for maintainability]
```

### Extracted Function Calls
- `functionName(...)` — purpose / behavior note

---
````

### Topic index maintenance
- Keep the Topic Index near the top of `knowledge.md`
- Add one numbered line per full or summarized topic entry
- Use stable anchor links that match the markdown heading text
- When compressing an entry, update the index text to match the summarized heading

## Error Handling

| Problem | Action |
|---------|--------|
| New topic would push `knowledge.md` past 800 lines | Compress the oldest or least-used full entry to the required 3-line summary before appending more content. |
| `mom-fact-finder` discovers a topic already in the library | Refresh only that entry and preserve all other entries unchanged. |
| `mom-frq` cannot find a matching topic | Proceed with fresh research via `mom-fact-finder`, then append the new topic to `knowledge.md`. |
| An entry lacks clear source QIDs or usage counts | Keep the topic out of the shared library until the supporting evidence is recovered. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Storing real pattern content in `SKILL.md` | Keep `SKILL.md` instructional only; move the accumulated examples into `knowledge.md`. |
| Replacing the entry template with loose prose | Preserve the exact heading/metadata/section structure so later updates stay consistent. |
| Letting the file grow indefinitely | Enforce the 800-line cap and compress older topics before exceeding it. |
| Updating a topic without touching the Topic Index | Refresh the index in the same edit so the library remains navigable. |

## State Management

- **Primary store:** `.agents/skills/mom-patterns/knowledge.md`
- **Instruction layer:** `.agents/skills/mom-patterns/SKILL.md`
- **Update policy:** append or targeted refresh only; no broad rewrites
- **Growth policy:** hard cap at 800 lines, oldest/least-used entries summarized first
