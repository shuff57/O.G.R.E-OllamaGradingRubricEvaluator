# Project Agent Configuration

AI-agnostic instructions for any agent working in this repository.
Tool-specific entry points (e.g., `CLAUDE.md`) should reference this file.

## Session Start Sequence

On every new conversation, execute this sequence automatically:

1. **Index stale pending reflections** — If `.agents/memory/pending/` contains `.md` files (excluding `evolve-queue-*.md`), index them now rather than leaving them for session end:
   - For each file: `python3 .agents/memory/scripts/index_reflection.py <file>`
   - On success: move to `.agents/memory/pending/indexed/`
   - On failure (Ollama offline, etc.): leave in `pending/`, continue — do not block startup
   - After indexing, briefly note what was indexed (filenames only, not content)
2. **Check pending skill evolutions** — If any pending files have `type: skill-evolution` or `type: skill-evolution-queue` in their frontmatter, surface them immediately. These indicate a skill needs attention — invoke `skill-evolver` with the evolution context if the user's task involves that skill.
3. **Check memory maintenance staleness** — Read the last entry in `.agents/memory/meta/improvement-log.jsonl`. If the `date` field is more than 7 days old (or the file is empty/missing), run full Tier 3 memory maintenance:
   - `python3 .agents/memory/scripts/memory_agent.py analyze`
   - `python3 .agents/memory/scripts/memory_agent.py dedupe --threshold 0.85 --dry-run`
   - Present findings to user; apply consolidations >0.90 similarity automatically, queue the rest for approval
   - `python3 .agents/memory/scripts/memory_agent.py suggest`
   - Route any `skill_issue` suggestions to `skill-evolver`
   - Append to improvement log
   - If the store is empty or Ollama is offline, log the blocker and skip — do not retry in a loop
4. **Check project planning state** — If `.planning/STATE.md` exists, check project progress to show current milestone, active phase, and what's next. Use the project's planning workflow (e.g., `/gsd:progress`) to surface this.

## Feature Detection — Auto-Route Through Planning

When the user requests **building, adding, implementing, or fixing** a feature or component of the application itself, check if a relevant phase exists in `.planning/ROADMAP.md` and route through the structured plan-then-execute workflow rather than ad-hoc coding.

### Do NOT trigger planning for:

- **Grading tasks** — grade-show-work, grade-frq-aio, or any student grading workflow
- **Gradebook sync tasks** — gb-pipeline, gb-sync, gb-compare, gb-new-assignment
- **MOM authoring tasks** — mom-frq, mom-patterns, mom-fact-finder, or any question authoring
- **General questions** — research, file exploration, explanations, or information queries
- **Explicitly invoked skills** — when the user types a slash command, they're choosing the workflow; don't override it
- **Quick fixes** — typo corrections, single-line changes, config tweaks

### Do trigger planning for:

- Desktop app feature development (ogre-desktop)
- Grading server architecture changes (grading-server)
- New agent capabilities or infrastructure changes (.agents/)
- Multi-file refactoring or cross-component work
- Any request that spans multiple sessions or requires milestone tracking

## File Layout Reference

| Directory | Purpose | Details |
|-----------|---------|---------|
| `AGENTS.md` | Agent behavioral rules | Identity, grading philosophy, safety, tool preferences |
| `.agents/` | Capability routing and domain docs | Read `.agents/README.md` for the full index |
| `.planning/` | Project roadmap, milestones, and phases | Use planning workflow commands to interact |
| `.agents/memory/` | Cross-session learnings (LightRAG) | Long-term durable memory |
| `.planning/STATE.md` | Session handoff context | Ephemeral milestone state (gitignored) |
