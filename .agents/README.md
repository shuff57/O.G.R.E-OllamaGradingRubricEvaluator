# O.G.R.E Agent Capabilities

This is the capability index for O.G.R.E's agent infrastructure. It maps every workflow a coding agent might need to the correct file or folder. Read this file when routing a task; then read only the specific capability document you need.

## Project Identity

O.G.R.E (Ollama Grading Review Evaluator) is an educator-focused grading toolkit:

- **Desktop app** for local grading workflows (`ogre-desktop/`)
- **Grading server** — AI grading backend (`grading-server/`)
- **Browser automation** via Playwriter for web grading and gradebook operations

Key directories:

| Path | Purpose |
|------|---------|
| `ogre-desktop/` | Electron desktop app (Svelte 5 + Vite) |
| `grading-server/` | Bun/Hono grading API and AI routing |
| `.agents/grading/` | Grading workflow docs and selectors |
| `.agents/gradebook/` | Gradebook sync workflow docs (MOM → Aeries) |
| `.agents/authoring/` | MyOpenMath question authoring docs |
| `.agents/meta/` | Agent meta-utilities (skill creation, memory, discovery) |
| `.agents/cli/` | CLI tool references — lazy-load only |
| `.agents/memory/` | Cross-session learnings and reflections |

## Capability Index

### Grading

| Capability | File | When to use |
|-----------|------|-------------|
| `grade` | `.agents/grading/grade.md` | Default batch grading entrypoint for rubric-driven grading on supported web grading pages |
| `grade-selectors` | `.agents/grading/grade-selectors.md` | DOM selectors and page-structure reference for grading page automation |
| `grade-show-work` | `.agents/grading/grade-show-work.md` | Evaluate uploaded show-your-work images; suggest bonus partial-credit adjustments (+2/+1) before any grade changes |

References: `.agents/grading/references/`

---

### Gradebook Sync (MOM → Aeries)

| Capability | File | When to use |
|-----------|------|-------------|
| `gb-pipeline` | `.agents/gradebook/gb-pipeline.md` | End-to-end orchestrator when assignments and/or scores both need synchronization |
| `gb-compare` | `.agents/gradebook/gb-compare.md` | Read-only comparison of MOM vs Aeries assignments; identifies missing items and mismatch patterns |
| `gb-new-assignment` | `.agents/gradebook/gb-new-assignment.md` | Creates missing Aeries assignments from validated comparison results |
| `gb-sync` | `.agents/gradebook/gb-sync.md` | Syncs student scores from MOM to Aeries once assignment parity is established |

References: `.agents/gradebook/references/`

---

### MOM Question Authoring

| Capability | File | When to use |
|-----------|------|-------------|
| `mom-frq` | `.agents/authoring/mom-frq.md` | Author MyOpenMath free-response (essay) question content and structures |
| `mom-fact-finder` | `.agents/authoring/mom-fact-finder.md` | Discover real-world MOM question patterns from the live question-bank context |
| `mom-lib-map` | `.agents/authoring/mom-lib-map.md` | Map topics to correct MOM library regions and subject routing references |
| `mom-page-map` | `.agents/authoring/mom-page-map.md` | Reference MOM teacher-page URLs, navigation, and DOM landmarks |
| `mom-patterns` | `.agents/authoring/mom-patterns.md` | Reusable knowledge base of discovered question patterns |
| `mom-patterns-knowledge` | `.agents/authoring/mom-patterns-knowledge.md` | Live pattern library; read by `mom-frq`, appended by `mom-fact-finder` |
| `mom-style-guide` | `.agents/authoring/mom-style-guide.md` | Conventions and quality philosophy for high-quality MOM question writing |

References: `.agents/authoring/references/`

---

### Meta and Utility

| Capability | File | When to use |
|-----------|------|-------------|
| `skill-creator` | `.agents/meta/skill-creator.md` | Create or refactor capability documents in project-standard format |
| `session-reflector` | `.agents/meta/session-reflector.md` | Capture end-of-session learnings for later cross-session reuse |
| `find-skills` | `.agents/meta/find-skills.md` | Discover additional community or installable skills when no existing capability fits |
| `model-roster` | `.agents/meta/model-roster.md` | Manage agent model assignments in the OMO configuration |

---

## Routing Rules

- Prefer the most specific capability over generic instructions.
- If multiple capabilities apply, start with orchestrator capabilities (`gb-pipeline`) for multi-stage jobs.
- Use capability names in prompts and plans; avoid hardcoded file paths.
- For CLI tool usage: read `.agents/cli/<name>.md` — lazy-load only, never read the whole folder.
- Never hardcode machine-specific absolute paths.

## Scope Boundaries

- Agents own markdown-based operational infrastructure, routing docs, capability documents, memory notes, and evidence artifacts.
- Source code changes are out of scope unless the user explicitly requests them.
- Hard boundary: never autonomously modify `.rs`, `.ts`, `.js`, or `.py` source files.
- Treat code edits as opt-in actions requiring explicit user instruction.
