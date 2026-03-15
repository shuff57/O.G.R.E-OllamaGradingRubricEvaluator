# O.G.R.E Project Brain (Layer 1 Routing)

This file is the high-level routing brain for O.G.R.E's 3-layer agent architecture. It tells agents what this project is, which capability family to route to, and which boundaries must be respected.

## Project Identity

O.G.R.E (Ollama Grading Review Evaluator) is an educator-focused grading toolkit with two primary products in one repo:
- Desktop app for local grading workflows
- Autonomous grading command workflows for web platforms

Primary stack and runtime surfaces:
- Tauri + Rust desktop application (`ogre-desktop/`)
- Node.js grading server (`grading-server/`)
- Python model/fine-tuning assets (`fine-tuned-model/`)
- Playwriter browser automation for web grading and gradebook operations

Key directories agents should recognize:
- `ogre-desktop/` - desktop shell and native integration
- `grading-server/` - grading APIs and orchestration
- `mom/` - MyOpenMath-related artifacts
- `.agents/skills/` - project skills (authoritative skill location)
- `.agents/commands/` - canonical command content (tool-agnostic, authoritative)
- `.agents/cli/` - CLI tool references (lazy-load only — read what you need)
- Tool-specific bridges point here as thin pointers
- `.agents/memory/` - cross-session learnings and reflections

Routing intent:
- Use this file for capability-level decisions only
- Delegate tactical steps to skills and command documents
- Keep execution aligned with educator-first grading outcomes

## Skill Routing Guide

Use skill names for routing decisions. Do not embed full workflow details here.

### Grading
- `/grade` command: default batch grading entrypoint for rubric-driven grading on supported web grading pages.
- `grade-show-work`: evaluate uploaded show-your-work images and suggest bonus partial-credit adjustments (+2/+1) before any grade changes.

### Gradebook Sync (MOM -> Aeries)
- `gb-pipeline`: end-to-end orchestrator when assignments and/or scores both need synchronization.
- `gb-compare`: read-only comparison of MOM vs Aeries assignments; identifies missing items and mismatch patterns.
- `gb-new-assignment`: creates missing Aeries assignments from validated comparison results.
- `gb-sync`: syncs student scores from MOM to Aeries once assignment parity is established.

### MOM Question Authoring and Research
- `mom-frq`: author MyOpenMath free-response (essay) question content and structures.
- `mom-fact-finder`: discover real-world MOM question patterns from the live question-bank context.
- `mom-lib-map`: map topics to correct MOM library regions and subject routing references.
- `mom-page-map`: reference MOM teacher-page URLs, navigation, and DOM landmarks.
- `mom-patterns`: reusable knowledge base of discovered question patterns.
- `mom-style-guide`: conventions and quality philosophy for high-quality MOM question writing.

### Meta and Utility
- `skill-creator`: create or refactor skills in project-standard format.
- `session-reflector`: capture end-of-session learnings for later cross-session reuse.
- `find-skills`: discover additional community or installable skills when no existing skill fits.

Routing preference rules:
- Prefer the most specific skill over generic instructions.
- If multiple skills apply, start with orchestrator skills (`gb-pipeline`) for multi-stage jobs.
- Use name-based skill references in prompts and plans; avoid brittle path-specific coupling.

## Conventions

Authoritative conventions for Layer 1 routing:
- Skills live in `.agents/skills/`.
- Canonical commands live in `.agents/commands/`.
- Tool-specific command bridges are thin pointers only — never authoritative content.
- Never hardcode tool-specific skill paths; always use skill names.

Documentation and invocation conventions:
- Use skill names (for example: `gb-compare`, `mom-frq`) rather than hardcoded file paths.
- Keep this file high-level; implementation details belong in skill docs.
- Skills should follow the project gold-standard structure and safety-first ordering.
- Keep guardrails explicit and visible before procedural steps in skill content.
- Preserve routing stability: prefer capability families over one-off ad hoc instructions.

Path and portability discipline:
- Do not hardcode machine-specific absolute paths in routing guidance.
- Keep references portable across local environments.
- Treat this file as policy and intent, not execution script content.

## Learning Protocol

Pattern suggestion directive (required behavior):
- When you notice you're performing a task that doesn't match any existing skill, and you've done it before, suggest exactly:
  - "I noticed I keep doing X. Want me to create a skill? Proposed name: Y, triggers: Z."

Session memory protocol:
- At session start, check `.agents/memory/pending/` for unreviewed reflections.
- Before significant work, run `query_memory.py` for relevant prior learnings.
- At session end, use `session-reflector` to record new insights into `.agents/memory/pending/`.
- Memory writes always require explicit user confirmation [y/n] — never auto-write.

Session notes:
- Use `.agents/memory/pending/` directly for session scratch notes and reflections.
- At session end, `session-reflector` offers to flush observations to `.agents/memory/pending/`.

Question hook standard (per tool):
- **OpenCode**: use the native `question` tool — triggers real UI dialog. Permission set to `"ask"` in `opencode.json`. Invoke via `/session-end` command.
- **Other tools**: use `[QUESTION] <text> / Options: y / n / edit` text format.
- Never auto-write to memory without explicit user confirmation regardless of tool.

Learning quality rules:
- Capture reusable patterns, not one-off noise.
- Prefer concise, trigger-oriented learnings that improve future routing.
- Promote repeated successful patterns into formal skills via `skill-creator`.
- If a new repeatable workflow appears, suggest skill creation before it becomes tribal knowledge.

## Scope Boundaries

Agent ownership limits:
- Agents own markdown-based operational infrastructure, routing docs, skills, commands, memory notes, and evidence artifacts.
- Source code changes are out of scope unless the user explicitly requests them.

Hard boundary:
- Never autonomously modify `.rs`, `.ts`, `.js`, or `.py` source files.
- Treat code edits as opt-in actions requiring explicit user instruction.
- Keep autonomous updates constrained to agent-operational documentation layers.
