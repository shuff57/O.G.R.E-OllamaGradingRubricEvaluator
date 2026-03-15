# Agent Nuclear Rebuild — Everything from Scratch

## TL;DR

> **Quick Summary**: Delete all existing agent infrastructure. Design a gold-standard skill format. Rebuild every skill from scratch in the new format, extracting hard-won domain knowledge from archived originals. Create a new 3-layer architecture (CLAUDE.md brain → gold-standard skills in .agents/skills/ → LightRAG-powered persistent memory) with self-improving agent learning capabilities backed by a knowledge graph.
> 
> **Deliverables**:
> - Gold-standard skill format (embedded in skill-creator meta-skill)
> - Rich CLAUDE.md project brain (≤200 lines)
> - AGENTS.md shared behavioral rules
> - All 12 skills rewritten from scratch in gold standard format
> - Commands refreshed (grade.md, selectors)
> - skill-creator meta-skill (teaches agents to create new skills)
> - session-reflector skill + SessionEnd hook
> - **LightRAG-powered memory** (.agents/memory/ with knowledge graph)
> - LightRAG setup scripts (Python, Ollama integration)
> - Archive of old skills for reference extraction
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 8 waves
> **Critical Path**: Archive → Design Gold Standard → Demolition → Foundation → Skills → Meta + LightRAG → Global Infrastructure → Verify

---

## Context

### Original Request
User wants a "fundamental shift" in project organization and agent learning. Referenced jakevanclief (3-layer routing, folder structure IS the agent) and maven_hq (give agents memory). User explicitly chose "everything from scratch" — the nuclear option. Structure is new, expertise is preserved from archived originals.

### Interview Summary
**Key Decisions**:
- **Approach**: Delete everything, rebuild from scratch with gold-standard format
- **Knowledge preservation**: Archive existing skills → extract domain expertise → rewrite in new format
- **Gold standard**: Designed by Prometheus (based on Anthropic guidance + best practices + existing best skills)
- **Learning**: Agent suggests, user decides. Hook-based automatic session reflection.
- **Memory**: Layered — skill-specific knowledge.md + central .agents/memory/
- **Skills location**: `.agents/skills/` (tool-agnostic)
- **Scope**: Markdown infrastructure + hook config only

### What Gets Destroyed
```
DELETED:
├── .claude/skills/           # ALL 12 skill directories (archived first)
│   ├── gb-compare/
│   ├── gb-new-assignment/
│   ├── gb-pipeline/
│   ├── gb-sync/
│   ├── grade-show-work/
│   ├── mom-fact-finder/
│   ├── mom-frq/
│   ├── mom-lib-map/          # including 16 subject files
│   ├── mom-page-map/
│   ├── mom-patterns/
│   ├── mom-style-guide/
│   └── find-skills/
├── .agents/skills/find-skills/  # duplicate
├── .claude/CLAUDE.md            # empty claude-mem placeholder
├── .claude/commands/CLAUDE.md   # empty claude-mem placeholder
└── .claude/plans/CLAUDE.md      # empty claude-mem placeholder

PRESERVED (refreshed in place):
├── .claude/commands/grade.md
├── .claude/commands/grade-selectors.md
├── .claude/commands/grade-show-work-selectors.md
└── .claude/settings.local.json
```

### What Gets Built
```
NEW ARCHITECTURE:
├── CLAUDE.md                          # Project brain (≤200 lines)
├── AGENTS.md                          # Shared agent behavioral rules
├── .agents/
│   ├── skills/                        # ALL skills (gold-standard format)
│   │   ├── skill-creator/
│   │   │   └── SKILL.md              # Meta-skill (includes gold standard template)
│   │   ├── session-reflector/
│   │   │   └── SKILL.md              # Session learning capture
│   │   ├── find-skills/
│   │   │   └── SKILL.md              # Community skill discovery
│   │   ├── gb-compare/
│   │   │   └── SKILL.md              # Rewritten in gold standard
│   │   ├── gb-new-assignment/
│   │   │   └── SKILL.md
│   │   ├── gb-sync/
│   │   │   └── SKILL.md
│   │   ├── gb-pipeline/
│   │   │   └── SKILL.md
│   │   ├── grade-show-work/
│   │   │   └── SKILL.md
│   │   ├── mom-frq/
│   │   │   └── SKILL.md
│   │   ├── mom-fact-finder/
│   │   │   └── SKILL.md
│   │   ├── mom-lib-map/
│   │   │   ├── SKILL.md              # Router/index
│   │   │   └── references/           # 16 subject files (not skills)
│   │   ├── mom-page-map/
│   │   │   └── SKILL.md
│   │   ├── mom-patterns/
│   │   │   ├── SKILL.md              # Instructions for the KB
│   │   │   └── knowledge.md          # Auto-populated knowledge base
│   │   └── mom-style-guide/
│   │       └── SKILL.md
│   └── memory/                        # LightRAG-powered persistent learning
│       ├── README.md                  # Explains the memory system
│       ├── pending/                   # Reflections awaiting LightRAG indexing
│       ├── lightrag_workdir/          # Auto-generated (gitignored)
│       ├── scripts/
│       │   ├── setup.sh              # Install LightRAG + verify Ollama
│       │   ├── index_reflection.py   # Index markdown into knowledge graph
│       │   └── query_memory.py       # Query knowledge graph for past learnings
│       └── .gitignore                # Excludes lightrag_workdir/
├── .claude/
│   ├── commands/                      # Refreshed commands
│   │   ├── grade.md
│   │   ├── grade-selectors.md
│   │   └── grade-show-work-selectors.md
│   └── settings.local.json           # Hook configuration
└── .sisyphus/archive/                 # Archived originals (read-only reference)
```

### Metis Review
**Key findings incorporated**:
- Skills format crisis (7 CLAUDE.md files, 6 missing frontmatter, 16 catalog-polluting sub-files) — solved by gold standard
- Hardcoded `.claude/skills/` paths — solved by clean rebuild with name-based references
- claude-mem artifacts — solved by deletion
- find-skills duplicate — solved by single canonical location
- Skill catalog budget (2% context window) — solved by proper `references/` pattern

---

## Work Objectives

### Core Objective
Build a completely new agent infrastructure from the ground up: a gold-standard skill format, 3-layer routing architecture, self-improving learning system — preserving domain expertise from the originals while eliminating all accumulated technical debt.

### Concrete Deliverables
- `CLAUDE.md` (project root) — project brain with routing intelligence (≤200 lines)
- `AGENTS.md` (project root) — shared behavioral rules (~100 lines)
- 14 skills in `.agents/skills/` — all in gold-standard format
- `.agents/memory/` — LightRAG-powered persistent learning infrastructure
- `.agents/memory/scripts/` — Python scripts for LightRAG indexing and querying (setup.sh, index_reflection.py, query_memory.py)
- `.claude/commands/` — refreshed commands with consistent format
- `.claude/settings.local.json` — SessionEnd hook
- `.sisyphus/archive/` — archived originals for reference

### Definition of Done
- [ ] `.claude/skills/` directory does not exist
- [ ] `.agents/skills/` contains exactly 14 SKILL.md files (12 original + skill-creator + session-reflector)
- [ ] Every SKILL.md follows the gold standard format (YAML frontmatter, all required sections present)
- [ ] Zero hardcoded `.claude/skills/` paths anywhere in the project
- [ ] Zero `claude-mem-context` blocks anywhere
- [ ] mom-lib-map `references/` contains 16 subject files, none discoverable as skills
- [ ] CLAUDE.md ≤200 lines, contains routing + learning directive
- [ ] SessionEnd hook configured in settings.local.json
- [ ] `.agents/memory/pending/` directory exists
- [ ] `.agents/memory/scripts/` contains setup.sh, index_reflection.py, query_memory.py
- [ ] `.agents/memory/.gitignore` excludes lightrag_workdir/
- [ ] Archive at `.sisyphus/archive/` contains all original skill content

### Must Have
- Gold-standard format applied uniformly to ALL 14 skills
- Every skill has: YAML frontmatter, overview, prerequisites, when to use, guardrails, workflow, error handling, QA scenarios
- Domain knowledge (selectors, patterns, APIs) preserved from originals
- CLAUDE.md routes to skills by name, never by path
- Session reflector captures learnings to pending/ for user review
- Pattern suggestion directive in CLAUDE.md

### Must NOT Have (Guardrails)
- **No source code changes**: Only markdown + JSON hook config
- **No autonomous learning**: Agents suggest, user decides
- **No lost domain knowledge**: Every selector, pattern, and API quirk from originals MUST appear in the new skill
- **No skill catalog pollution**: references/ files must NOT have YAML frontmatter
- **No CLAUDE.md > 200 lines**
- **No hooks beyond SessionEnd**
- **No complex memory infrastructure**: Flat markdown files only, no databases or indices

---

## Gold Standard Skill Format

> Every skill MUST follow this structure. No exceptions.

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

### Format Rules
1. YAML `description` starts with "Use when..." for auto-trigger matching
2. Guardrails section appears BEFORE workflow (fail-fast visibility)
3. Each phase has clear INPUT → ACTION → OUTPUT
4. Error handling and Common Mistakes are ALWAYS tables
5. Skill content stays under 500 lines (split to references/ if larger)
6. Cross-skill references use `load_skills=["skill-name"]`, never file paths
7. references/ subdirectory for supplementary files (selectors, subject data)
8. knowledge.md for self-populating knowledge bases (follows mom-patterns size policy)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (markdown infrastructure)
- **Framework**: None

### QA Policy
Every task verifies structural correctness via Bash commands. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Archive + Design — 2 parallel):
├── Task 1: Archive all existing skills to .sisyphus/archive/ [quick]
└── Task 2: Design gold standard + create skill-creator [deep]

Wave 1 (Demolition + Foundation — 4 parallel):
├── Task 3: Delete all old skill directories [quick]
├── Task 4: Create CLAUDE.md project brain [deep]
├── Task 5: Create AGENTS.md [unspecified-high]
└── Task 6: Create memory infrastructure [quick]

Wave 2 (Grading Domain — 3 parallel):
├── Task 7: Rewrite grade command + selectors [unspecified-high]
├── Task 8: Rewrite grade-show-work skill [unspecified-high]
└── Task 9: Rewrite grade-show-work-selectors command [quick]

Wave 3 (Gradebook Domain — 4 parallel):
├── Task 10: Rewrite gb-compare [unspecified-high]
├── Task 11: Rewrite gb-new-assignment [unspecified-high]
├── Task 12: Rewrite gb-sync [unspecified-high]
└── Task 13: Rewrite gb-pipeline [unspecified-high]

Wave 4 (MOM Authoring Domain — 6 parallel):
├── Task 14: Rewrite mom-frq [unspecified-high]
├── Task 15: Rewrite mom-fact-finder [unspecified-high]
├── Task 16: Rewrite mom-lib-map + references/ [unspecified-high]
├── Task 17: Rewrite mom-page-map [unspecified-high]
├── Task 18: Rewrite mom-patterns (knowledge base) [unspecified-high]
└── Task 19: Rewrite mom-style-guide [unspecified-high]

Wave 5 (Meta Skills — 2 parallel):
├── Task 20: Create session-reflector + hook + LightRAG indexing [deep]
└── Task 21: Rewrite find-skills [quick]

Wave 6 (Global Infrastructure — sequential, requires user input):
├── Task 22: Audit + clean up global skills (user decides) [unspecified-high]
└── Task 23: Install universal smart agent skills globally [deep]

Wave FINAL (Verification — 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Gold standard format compliance (unspecified-high)
├── Task F3: Domain knowledge preservation check (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T3 → T4 → T10-T19 → T20 → T22 → T23 → F1-F4
Parallel Speedup: ~70% faster than sequential
Max Concurrent: 6 (Waves 3-4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3, 7-19 | 0 |
| 2 | — | 3, 7-21 | 0 |
| 3 | 1, 2 | 7-21 | 1 |
| 4 | — | F1 | 1 |
| 5 | — | F1 | 1 |
| 6 | — | 20 | 1 |
| 7 | 1, 3 | F1-F4 | 2 |
| 8 | 1, 2, 3 | F1-F4 | 2 |
| 9 | 1, 3 | F1-F4 | 2 |
| 10-13 | 1, 2, 3 | F1-F4 | 3 |
| 14-19 | 1, 2, 3 | F1-F4 | 4 |
| 20 | 6 | F1-F4 | 5 |
| 21 | 2, 3 | F1-F4 | 5 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 0**: **2** — T1 → `quick`, T2 → `deep`
- **Wave 1**: **4** — T3 → `quick`, T4 → `deep`, T5 → `unspecified-high`, T6 → `quick`
- **Wave 2**: **3** — T7-T8 → `unspecified-high`, T9 → `quick`
- **Wave 3**: **4** — T10-T13 → `unspecified-high`
- **Wave 4**: **6** — T14-T19 → `unspecified-high`
- **Wave 5**: **2** — T20 → `deep`, T21 → `quick`
- **Wave 6**: **2** — T22 → `unspecified-high`, T23 → `deep` (sequential — T22 before T23)
- **FINAL**: **4** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Archive All Existing Skills

  **What to do**:
  - Copy ALL existing skill content to `.sisyphus/archive/` for reference during rewriting
  - Structure: `.sisyphus/archive/skills/{skill-name}/` mirrors original structure
  - Copy from BOTH `.claude/skills/` (12 skills) and `.agents/skills/find-skills/`
  - Also copy `.claude/commands/` (grade.md, grade-selectors.md, grade-show-work-selectors.md)
  - This archive is READ-ONLY reference for tasks in Waves 2-5. Agents read archived originals to extract domain knowledge when rewriting each skill
  - Include all sub-files (mom-lib-map's 16 subject files, etc.)

  **Must NOT do**:
  - Do not modify the originals yet (demolition is Task 3)
  - Do not archive node_modules, .git, or non-skill files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Task 2)
  - **Blocks**: Tasks 3, 7-19 (all rewrite tasks need archive as reference)
  - **Blocked By**: None

  **References**:
  - `.claude/skills/` — all 12 skill directories to archive
  - `.agents/skills/find-skills/` — additional skill to archive
  - `.claude/commands/` — command files to archive

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All skills archived
    Tool: Bash
    Steps:
      1. Run: ls .sisyphus/archive/skills/ | wc -l
      2. Assert: 13 (12 from .claude/skills/ + find-skills)
      3. Run: ls .sisyphus/archive/skills/mom-lib-map/ | wc -l
      4. Assert: ≥ 17 (CLAUDE.md + 16 subject files)
      5. Run: ls .sisyphus/archive/commands/
      6. Assert: grade.md, grade-selectors.md, grade-show-work-selectors.md present
    Expected Result: Complete archive of all existing content
    Evidence: .sisyphus/evidence/task-1-archive-complete.txt
  ```

  **Commit**: YES
  - Message: `chore(archive): archive all existing skills to .sisyphus/archive/ before nuclear rebuild`
  - Files: `.sisyphus/archive/`

- [x] 2. Design Gold Standard + Create skill-creator Meta-Skill

  **What to do**:
  - Create `.agents/skills/skill-creator/SKILL.md` — the meta-skill that defines the gold standard and helps create new skills
  - The gold standard format is defined in the "Gold Standard Skill Format" section of this plan. Embed it in the skill-creator as the template
  - Skill content should cover:
    1. **When to invoke**: User says "create a skill", or agent suggests "I noticed a pattern, should I create a skill?"
    2. **Interview**: Ask for skill name, purpose, triggers, tools used
    3. **Template generation**: Generate SKILL.md following the gold standard format:
       - YAML frontmatter (name, description starting with "Use when...")
       - Overview (2-3 sentences)
       - Prerequisites, When to Use, When NOT to Use
       - Guardrails (BEFORE workflow — fail-fast visibility)
       - Quick Start (3 lines max)
       - Workflow Phases (INPUT → ACTION → OUTPUT)
       - Error Handling table
       - Common Mistakes table
       - Optional: State Management, Selectors/References, knowledge.md
    4. **Placement**: `.agents/skills/{skill-name}/SKILL.md`
    5. **Knowledge base option**: If domain benefits from accumulated knowledge, create `knowledge.md` following mom-patterns model (800-line cap, compression policy, entry format template)
    6. **Format rules**: Include the 8 format rules from the Gold Standard section
  - Keep under 200 lines

  **Must NOT do**:
  - Do not auto-create skills without user confirmation
  - Do not include eval/testing framework
  - Do not exceed 200 lines

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Task 1)
  - **Blocks**: Tasks 3, 7-21 (all rewrite tasks use gold standard)
  - **Blocked By**: None

  **References**:
  - Gold Standard Skill Format section of THIS PLAN — the authoritative format definition
  - `.sisyphus/archive/skills/gb-compare/` (after Task 1) — best-structured original skill for inspiration
  - Anthropic's official skill-creator: `https://github.com/anthropics/skills/tree/main/skills/skill-creator`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: skill-creator exists with gold standard template
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/skill-creator/SKILL.md
      2. Assert: file exists
      3. Run: head -4 .agents/skills/skill-creator/SKILL.md
      4. Assert: YAML frontmatter with name: skill-creator, description starts with "Use when"
      5. Run: wc -l .agents/skills/skill-creator/SKILL.md
      6. Assert: ≤ 200 lines
      7. Run: grep -c "Gold Standard\|Template\|Format" .agents/skills/skill-creator/SKILL.md
      8. Assert: > 0 (contains the template)
    Expected Result: Well-formatted meta-skill with embedded gold standard
    Evidence: .sisyphus/evidence/task-2-skill-creator.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): create skill-creator meta-skill with gold standard format template`
  - Files: `.agents/skills/skill-creator/SKILL.md`

- [x] 3. Delete All Old Skill Directories

  **What to do**:
  - Delete `.claude/skills/` directory entirely (all 12 skill subdirectories)
  - Delete `.agents/skills/find-skills/` (will be recreated in gold standard)
  - Clean up claude-mem artifacts: remove `<claude-mem-context>` blocks from `.claude/CLAUDE.md`, `.claude/commands/CLAUDE.md`, `.claude/plans/CLAUDE.md`
  - If `.claude/plans/CLAUDE.md` is empty after cleanup, delete it
  - Verify archive exists at `.sisyphus/archive/` before deleting anything
  - `.claude/commands/` stays (grade.md, grade-selectors.md, grade-show-work-selectors.md are refreshed in Wave 2)

  **Must NOT do**:
  - Do NOT delete `.claude/commands/` — commands stay
  - Do NOT delete `.claude/settings.local.json` — needed for hooks
  - Do NOT delete `.sisyphus/archive/` — that's our reference
  - Do NOT delete before verifying archive is complete

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 7-21 (clean slate needed before rebuilding)
  - **Blocked By**: Tasks 1, 2 (archive must exist, skill-creator must exist)

  **References**:
  - `.sisyphus/archive/` — verify this exists BEFORE deleting originals

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Old skills completely removed
    Tool: Bash
    Steps:
      1. Run: ls .claude/skills/ 2>/dev/null
      2. Assert: directory does not exist
      3. Run: ls .agents/skills/find-skills/ 2>/dev/null
      4. Assert: directory does not exist (only skill-creator remains)
      5. Run: grep -r "claude-mem" .claude/ 2>/dev/null
      6. Assert: 0 results
    Expected Result: Clean slate — only skill-creator in .agents/skills/
    Evidence: .sisyphus/evidence/task-3-demolition.txt

  Scenario: Commands and archive preserved
    Tool: Bash
    Steps:
      1. Run: ls .claude/commands/grade.md
      2. Assert: file exists
      3. Run: ls .sisyphus/archive/skills/ | wc -l
      4. Assert: 13
    Expected Result: Commands and archive untouched
    Evidence: .sisyphus/evidence/task-3-preserved.txt
  ```

  **Commit**: YES
  - Message: `refactor(infrastructure): delete all old skill directories and claude-mem artifacts`
  - Files: `.claude/skills/` (deleted), cleanup artifacts

- [x] 4. Create CLAUDE.md Project Brain

  **What to do**:
  - Create `CLAUDE.md` at project root (≤200 lines)
  - This is Layer 1 of the 3-layer architecture — the routing brain
  - Content sections:
    1. **Project Identity** (~15 lines): O.G.R.E description, tech stack (Tauri/Rust desktop, Node.js grading server, Python fine-tuning, Playwriter browser automation), key directories
    2. **Skill Routing Guide** (~50 lines): All skills organized by domain:
       - **Grading**: `/grade` command (batch grading), `grade-show-work` (partial credit for uploaded work images)
       - **Gradebook Sync**: `gb-pipeline` (full orchestrator), `gb-compare`, `gb-new-assignment`, `gb-sync` (individual stages)
       - **MOM Question Authoring**: `mom-frq` (write questions), `mom-fact-finder` (discover patterns), `mom-lib-map` (library references), `mom-page-map` (navigation), `mom-patterns` (knowledge base), `mom-style-guide` (conventions)
       - **Meta/Utility**: `skill-creator` (create new skills), `session-reflector` (capture learnings), `find-skills` (community skills)
    3. **Conventions** (~25 lines): Skills live in `.agents/skills/`, commands in `.claude/commands/`, all skills follow gold standard format, name-based references only
    4. **Learning Protocol** (~25 lines):
       - **Pattern suggestion directive**: "When you notice you're performing a task that doesn't match any existing skill, and you've done it before (or it would be useful again), suggest creating a new skill. Format: 'I noticed I keep doing X. Want me to create a skill for this? Proposed name: Y, triggers: Z.'"
       - **Session memory**: Check `.agents/memory/pending/` for unreviewed reflections at session start. Record insights to pending/ via session-reflector at session end.
       - **Cross-session check**: Before starting significant work, review `.agents/memory/approved/` for relevant past learnings.
    5. **Scope Boundaries** (~10 lines): Agents own markdown infrastructure. Source code changes require explicit user instruction.
  - Also update `.claude/CLAUDE.md` to minimal pointer: "See project root CLAUDE.md"

  **Must NOT do**:
  - Do not exceed 200 lines
  - Do not include skill-specific workflow details
  - Do not hardcode file paths (use skill names)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 5, 6)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: None

  **References**:
  - `README.md` — authoritative project description
  - `SETUP.md` — technical setup
  - `.sisyphus/archive/skills/` — skill names and descriptions for routing guide
  - `.sisyphus/archive/commands/grade.md:22-38` — grading philosophy to reference

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CLAUDE.md within limits and complete
    Tool: Bash
    Steps:
      1. Run: wc -l CLAUDE.md
      2. Assert: ≤ 200 lines
      3. Run: grep -c "## " CLAUDE.md
      4. Assert: ≥ 4 section headers
      5. Run: grep -c ".agents/skills/" CLAUDE.md
      6. Assert: > 0 (references correct location)
      7. Run: grep -ci "pattern\|suggest\|skill creation" CLAUDE.md
      8. Assert: > 0 (learning directive present)
    Expected Result: Comprehensive project brain within limits
    Evidence: .sisyphus/evidence/task-4-claude-md.txt
  ```

  **Commit**: YES
  - Message: `feat(config): create CLAUDE.md project brain with 3-layer routing and learning directives`
  - Files: `CLAUDE.md`, `.claude/CLAUDE.md`

- [x] 5. Create AGENTS.md

  **What to do**:
  - Create `AGENTS.md` at project root (~100 lines)
  - Shared behavioral rules for all agents:
    1. **Agent Identity**: Working on O.G.R.E education grading toolkit
    2. **Grading Philosophy**: Be generous (high school seniors), award substantial partial credit, focus on understanding over execution
    3. **Tool Preferences**: Playwriter for browser automation, batch DOM operations, skill-name loading
    4. **Safety Rules**: Never auto-approve grade changes, always dry-run before writing grades, save progress frequently (every 5 students), confirm between pipeline stages
    5. **Learning Protocol**: Check memory at session start, record insights at end, suggest skills for repeated patterns
    6. **Forbidden Actions**: Never modify source code without instruction, never overwrite existing non-zero scores, never skip user confirmation for destructive operations

  **Must NOT do**:
  - Do not duplicate CLAUDE.md content
  - Do not exceed 150 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4, 6)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: None

  **References**:
  - `.sisyphus/archive/commands/grade.md:22-38` — grading philosophy
  - `.sisyphus/archive/skills/grade-show-work/:73-84` — guardrails pattern
  - `.sisyphus/archive/skills/gb-pipeline/:150-168` — safety rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md exists with behavioral rules
    Tool: Bash
    Steps:
      1. Run: wc -l AGENTS.md
      2. Assert: ≤ 150 lines
      3. Run: grep -ci "generous\|partial credit" AGENTS.md
      4. Assert: > 0 (grading philosophy)
      5. Run: grep -ci "forbidden\|must not\|never" AGENTS.md
      6. Assert: > 0 (forbidden actions)
    Expected Result: Comprehensive behavioral rules
    Evidence: .sisyphus/evidence/task-5-agents-md.txt
  ```

  **Commit**: YES
  - Message: `feat(config): create AGENTS.md with shared agent behavioral rules`
  - Files: `AGENTS.md`

- [x] 6. Create Memory Infrastructure + LightRAG Setup

  **What to do**:
  - Create `.agents/memory/` directory structure with LightRAG integration:
    ```
    .agents/memory/
    ├── README.md              (~60 lines — explains the LightRAG-powered memory system)
    ├── lightrag_workdir/      # LightRAG working directory (auto-populated)
    ├── pending/               # Session reflections awaiting indexing (+ .gitkeep)
    ├── scripts/
    │   ├── setup.sh           # Install LightRAG, verify Ollama connectivity
    │   ├── index_reflection.py    # Index a reflection markdown file into LightRAG
    │   └── query_memory.py        # Query the knowledge graph for relevant past learnings
    └── .gitignore             # Ignore lightrag_workdir/ contents (auto-generated data)
    ```
  - **setup.sh**: `pip install lightrag-hku`, verify Ollama is running (`curl localhost:11434/api/tags`), create lightrag_workdir/
  - **index_reflection.py**: Takes a markdown file path as input, indexes it into LightRAG using Ollama for LLM + embeddings. File-based storage (default mode — JSON KV + NetworkX graph + local vector DB). Example:
    ```python
    from lightrag import LightRAG, QueryParam
    rag = LightRAG(working_dir="./lightrag_workdir", llm_model_func=ollama_model_complete, embedding_func=ollama_embedding)
    rag.insert(reflection_text)
    ```
  - **query_memory.py**: Takes a query string, searches the knowledge graph using "mix" mode (hybrid of all retrieval strategies). Returns relevant past learnings. Agents call this at session start.
  - **README.md** explains: LightRAG purpose, how pending/ works (reflections written here first, then indexed), how to query memory, setup instructions, file-based storage (no external databases)
  - **.gitignore** for lightrag_workdir/ (contains auto-generated graph data, embeddings, caches — should not be committed)
  - LightRAG config: Ollama as LLM provider (matches O.G.R.E's existing Ollama setup), file-based storage (simplest mode), working directory at `.agents/memory/lightrag_workdir/`

  **Must NOT do**:
  - Do not require any external database (PostgreSQL, Neo4j, etc.)
  - Do not require Docker
  - Do not commit lightrag_workdir/ contents to git
  - Do not make LightRAG a hard dependency — if Ollama isn't running, the memory system gracefully degrades to flat-file pending/ reflections

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4, 5)
  - **Blocks**: Task 20
  - **Blocked By**: None

  **References**:
  - LightRAG official docs: `https://github.com/HKUDS/LightRAG` — file-based quickstart
  - O.G.R.E already uses Ollama — the LLM provider is already part of the project infrastructure
  - LightRAG supports Ollama natively for both LLM and embedding functions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Memory structure + scripts exist
    Tool: Bash
    Steps:
      1. Run: ls .agents/memory/README.md .agents/memory/pending/.gitkeep
      2. Assert: files exist
      3. Run: ls .agents/memory/scripts/setup.sh .agents/memory/scripts/index_reflection.py .agents/memory/scripts/query_memory.py
      4. Assert: all 3 scripts exist
      5. Run: cat .agents/memory/.gitignore
      6. Assert: contains "lightrag_workdir/"
    Expected Result: Complete memory infrastructure with LightRAG scripts
    Evidence: .sisyphus/evidence/task-6-memory-lightrag.txt

  Scenario: Setup script is executable
    Tool: Bash
    Steps:
      1. Run: head -1 .agents/memory/scripts/setup.sh
      2. Assert: starts with "#!/bin/bash" or similar shebang
      3. Run: grep "lightrag" .agents/memory/scripts/setup.sh
      4. Assert: > 0 (references LightRAG installation)
      5. Run: grep "ollama" .agents/memory/scripts/setup.sh
      6. Assert: > 0 (verifies Ollama connectivity)
    Expected Result: Valid setup script
    Evidence: .sisyphus/evidence/task-6-setup-script.txt

  Scenario: Python scripts have correct imports
    Tool: Bash
    Steps:
      1. Run: grep "lightrag\|LightRAG" .agents/memory/scripts/index_reflection.py
      2. Assert: > 0 (imports LightRAG)
      3. Run: grep "ollama" .agents/memory/scripts/index_reflection.py
      4. Assert: > 0 (uses Ollama provider)
    Expected Result: Scripts reference correct libraries
    Evidence: .sisyphus/evidence/task-6-python-scripts.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): create LightRAG-powered persistent agent memory with Ollama integration`
  - Files: `.agents/memory/`

- [x] 7. Rewrite Grade Command + Selectors

  **What to do**:
  - Rewrite `.claude/commands/grade.md` in gold standard format
  - Rewrite `.claude/commands/grade-selectors.md` as a clean reference
  - Read archived originals from `.sisyphus/archive/commands/grade.md` (205 lines) and `grade-selectors.md`
  - **CRITICAL domain knowledge to preserve from archive**:
    - Grading philosophy (lines 22-38): generous for high school seniors, partial credit, effort-focused
    - Batch extraction pattern: single playwriter call for ALL students
    - Fill-in-batches-of-5 pattern with Quick Save
    - State file format (grade-state.json) with URL-keyed entries
    - Context limit: 30 students per session, soft warning at 25
    - TinyMCE pattern: set both contenteditable div AND hidden input
    - Resume protocol: fuzzy name matching, user choice to resume/fresh/different
    - Rubric three-tier check: found → generated from content → ask user
    - LaTeX math in feedback: `\( ... \)` delimiters
    - Error handling table (lines 188-198)
  - Rewrite in gold standard format with: overview, prerequisites, guardrails (up front), quick start, workflow phases, error handling table, common mistakes table
  - grade-selectors.md is a REFERENCE file, not a skill — keep as reference but ensure it uses consistent table format

  **Must NOT do**:
  - Do not lose ANY DOM selectors from the original
  - Do not change the grading philosophy
  - Do not change the batch-of-5 + Quick Save pattern
  - Do not change the 30-student context limit

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 1, 3 (archive exists, old files deleted)

  **References**:
  - `.sisyphus/archive/commands/grade.md` — 205-line original with all domain knowledge
  - `.sisyphus/archive/commands/grade-selectors.md` — DOM selectors reference
  - `.agents/skills/skill-creator/SKILL.md` — gold standard format template

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Grade command preserves domain knowledge
    Tool: Bash
    Steps:
      1. Run: grep -c "batch\|Quick Save" .claude/commands/grade.md
      2. Assert: > 0 (batch pattern preserved)
      3. Run: grep -c "30 students\|context limit" .claude/commands/grade.md
      4. Assert: > 0 (limit preserved)
      5. Run: grep -c "TinyMCE\|contenteditable\|hidden input" .claude/commands/grade.md .claude/commands/grade-selectors.md
      6. Assert: > 0 (TinyMCE pattern preserved)
      7. Run: grep -c "generous\|partial credit" .claude/commands/grade.md
      8. Assert: > 0 (philosophy preserved)
    Expected Result: All critical domain knowledge present
    Evidence: .sisyphus/evidence/task-7-grade-command.txt
  ```

  **Commit**: YES
  - Message: `feat(commands): rewrite grade command and selectors in gold standard format`
  - Files: `.claude/commands/grade.md`, `.claude/commands/grade-selectors.md`

- [x] 8. Rewrite grade-show-work Skill

  **What to do**:
  - Create `.agents/skills/grade-show-work/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/grade-show-work/` (417 lines)
  - **CRITICAL domain knowledge to preserve**:
    - All DOM selectors (bigquestionwrap, scoreboxN, scoreboxN-M, attach.prepped, viewworkwrap, etc.)
    - Score input ID convention (0-based, single vs multi-part)
    - File URL pattern (files.myopenmath.com/ufiles/{uid}/filename.jpg, no auth needed)
    - Partial credit criteria (+2 substantial, +1 some, +0 none) with examples
    - Eligibility: auto-score < 4, has file upload
    - Report-first approach (generate report, get approval, THEN apply)
    - State file format (grade-show-work-state.json with phases: scan, apply)
    - Session limit: 20 students, soft warning at 15
    - Navigate via "Save and Next Student" button (full page navigation)
    - URL extraction approach for files (not UI clicks)
  - Rewrite with guardrails BEFORE workflow, proper Quick Start, error/mistakes tables

  **Must NOT do**:
  - Do not lose any DOM selectors
  - Do not change the bonus-only approach (never decrease scores)
  - Do not change the report-first-then-apply workflow

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 9)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `.sisyphus/archive/skills/grade-show-work/` — 417-line original with all selectors and workflow
  - `.agents/skills/skill-creator/SKILL.md` — gold standard format

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All selectors preserved
    Tool: Bash
    Steps:
      1. Run: grep -c "scorebox\|bigquestionwrap\|viewworkwrap\|attach.prepped" .agents/skills/grade-show-work/SKILL.md
      2. Assert: ≥ 4 (key selectors present)
      3. Run: grep -c "files.myopenmath.com" .agents/skills/grade-show-work/SKILL.md
      4. Assert: > 0 (file URL pattern preserved)
    Expected Result: Domain knowledge intact
    Evidence: .sisyphus/evidence/task-8-grade-show-work.txt

  Scenario: Gold standard format
    Tool: Bash
    Steps:
      1. Run: head -4 .agents/skills/grade-show-work/SKILL.md
      2. Assert: YAML frontmatter with "Use when" description
      3. Run: grep -c "## Guardrails" .agents/skills/grade-show-work/SKILL.md
      4. Assert: 1 (guardrails section exists)
      5. Run: grep -c "## Quick Start" .agents/skills/grade-show-work/SKILL.md
      6. Assert: 1
    Expected Result: Follows gold standard
    Evidence: .sisyphus/evidence/task-8-gold-standard.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): rewrite grade-show-work in gold standard format`
  - Files: `.agents/skills/grade-show-work/SKILL.md`

- [x] 9. Rewrite grade-show-work-selectors Command

  **What to do**:
  - Rewrite `.claude/commands/grade-show-work-selectors.md` as a clean reference
  - Read archived original from `.sisyphus/archive/commands/grade-show-work-selectors.md`
  - This is a reference file used by grade-show-work skill, not a standalone command
  - Ensure consistent table format for selectors

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocked By**: Tasks 1, 3

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Selectors file refreshed
    Tool: Bash
    Steps:
      1. Run: ls .claude/commands/grade-show-work-selectors.md
      2. Assert: file exists
    Expected Result: Reference file present
    Evidence: .sisyphus/evidence/task-9-selectors.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [x] 10. Rewrite gb-compare

  **What to do**:
  - Create `.agents/skills/gb-compare/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/gb-compare/` (348 lines)
  - **CRITICAL domain knowledge to preserve**: MOM category expansion, assignment name/points extraction, Aeries assignment listing, date parsing (assigned/due), JSON temp file output format, markdown comparison report generation
  - gb-compare is already the best-structured skill — use it as validation that the gold standard captures everything

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `.sisyphus/archive/skills/gb-compare/SKILL.md` — 348-line original (best-structured)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Gold standard and domain knowledge
    Tool: Bash
    Steps:
      1. Run: head -4 .agents/skills/gb-compare/SKILL.md
      2. Assert: YAML frontmatter with "Use when" description
      3. Run: grep -c "temp.*json\|gb_compare" .agents/skills/gb-compare/SKILL.md
      4. Assert: > 0 (temp file pattern preserved)
      5. Run: grep -c "## Guardrails" .agents/skills/gb-compare/SKILL.md
      6. Assert: 1
    Expected Result: Gold standard + domain knowledge
    Evidence: .sisyphus/evidence/task-10-gb-compare.txt
  ```

  **Commit**: YES (groups with Wave 3)

- [x] 11. Rewrite gb-new-assignment

  **What to do**:
  - Create `.agents/skills/gb-new-assignment/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/gb-new-assignment/` (248 lines)
  - Preserve: Aeries assignment creation workflow, form field mapping, temp file input/output, idempotency (skip existing assignments)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 3 (parallel with 10, 12, 13). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Same pattern as Task 10. Verify YAML frontmatter, guardrails section, temp file references. Evidence: `.sisyphus/evidence/task-11-gb-new-assignment.txt`

  **Commit**: YES (groups with Wave 3)

- [x] 12. Rewrite gb-sync

  **What to do**:
  - Create `.agents/skills/gb-sync/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/gb-sync/` (1193 lines — the largest skill)
  - **CRITICAL**: This is the most complex skill with 7 phases, per-student temp files, dry-run/live mode, ScoresByStudent/ScoresByAssignment strategies, halt detection, and resume protocol
  - Preserve ALL phase logic (1-7), per-student JSON format, pipeline halt conditions, verification (Phase 7: re-scrape and compare)
  - Consider splitting into SKILL.md (core workflow, ≤500 lines) + `references/phase-details.md` if exceeds 500 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 3 (parallel with 10, 11, 13). Blocked By: 1, 2, 3.

  **References**:
  - `.sisyphus/archive/skills/gb-sync/SKILL.md` — 1193-line original with all 7 phases

  **Acceptance Criteria**: Verify all 7 phases present, dry-run pattern, per-student temp files, halt detection. Evidence: `.sisyphus/evidence/task-12-gb-sync.txt`

  **Commit**: YES (groups with Wave 3)

- [x] 13. Rewrite gb-pipeline

  **What to do**:
  - Create `.agents/skills/gb-pipeline/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/gb-pipeline/` (168 lines)
  - Preserve: 3-stage orchestration (compare → add → sync), temp file chain, inter-stage confirmation, halt detection, single-assignment variant
  - Update all `load_skills=` references to use skill names (already name-based in original)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 3 (parallel with 10, 11, 12). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Verify 3 stages, temp file chain, load_skills references. Evidence: `.sisyphus/evidence/task-13-gb-pipeline.txt`

  **Commit**: YES (groups with Wave 3)

- [x] 14. Rewrite mom-frq

  **What to do**:
  - Create `.agents/skills/mom-frq/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/mom-frq/` (~1032 lines)
  - **CRITICAL domain knowledge**: MOM PHP syntax ($scoremethod, $displayformat, $anstypes, loadlibrary), essay vs multipart patterns, randomization techniques (rand, rrand, diffrands), qtext HTML construction, scoring methods (takeanything, singlescore, essayrubric), feedback functions (getfeedbacktxtessay)
  - Consider SKILL.md (core workflow + essentials, ≤500 lines) + `references/php-patterns.md` for detailed code examples

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 4 (parallel with 15-19). Blocked By: 1, 2, 3.

  **References**:
  - `.sisyphus/archive/skills/mom-frq/` — ~1032-line original with MOM PHP patterns

  **Acceptance Criteria**: Verify MOM PHP syntax present ($scoremethod, loadlibrary, etc.), gold standard format. Evidence: `.sisyphus/evidence/task-14-mom-frq.txt`

  **Commit**: YES (groups with Wave 4)

- [x] 15. Rewrite mom-fact-finder

  **What to do**:
  - Create `.agents/skills/mom-fact-finder/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/mom-fact-finder/` (509 lines)
  - Preserve: browser search workflow for MOM question patterns, code extraction from QIDs, pattern synthesis, writing to mom-patterns knowledge base
  - **CRITICAL**: Replace ALL `.claude/skills/` path references with skill-name-based loading (`load_skills=["mom-patterns"]`, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 4 (parallel with 14, 16-19). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Verify zero hardcoded `.claude/skills/` paths, mom-patterns reference by name. Evidence: `.sisyphus/evidence/task-15-mom-fact-finder.txt`

  **Commit**: YES (groups with Wave 4)

- [x] 16. Rewrite mom-lib-map + references/

  **What to do**:
  - Create `.agents/skills/mom-lib-map/SKILL.md` — router/index in gold standard format
  - Create `.agents/skills/mom-lib-map/references/` — move 16 subject files from archive
  - Read archived originals from `.sisyphus/archive/skills/mom-lib-map/` (CLAUDE.md + 16 subject files)
  - Subject files go in references/ WITHOUT YAML frontmatter (prevents catalog pollution)
  - SKILL.md references subjects via `references/{subject}.md` relative paths

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 4 (parallel with 14, 15, 17-19). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Verify 16 files in references/, no YAML frontmatter in references, SKILL.md has gold standard format. Evidence: `.sisyphus/evidence/task-16-mom-lib-map.txt`

  **Commit**: YES (groups with Wave 4)

- [x] 17. Rewrite mom-page-map

  **What to do**:
  - Create `.agents/skills/mom-page-map/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/mom-page-map/` (786 lines)
  - Preserve: MOM URL patterns, page navigation sequences, selector maps
  - Consider SKILL.md + `references/navigation-patterns.md` if exceeds 500 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 4 (parallel with 14-16, 18-19). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Verify MOM URL patterns preserved, gold standard format. Evidence: `.sisyphus/evidence/task-17-mom-page-map.txt`

  **Commit**: YES (groups with Wave 4)

- [x] 18. Rewrite mom-patterns (Knowledge Base)

  **What to do**:
  - Create `.agents/skills/mom-patterns/SKILL.md` — instructions for the knowledge base
  - Create `.agents/skills/mom-patterns/knowledge.md` — seed from archived patterns
  - Read archived original from `.sisyphus/archive/skills/mom-patterns/` (255 lines)
  - Preserve: size policy (800-line cap), compression strategy, entry format template, topic index
  - SKILL.md explains how mom-fact-finder populates this, how mom-frq reads it, size management
  - knowledge.md contains the actual patterns (ported from archive — Statistics Essay, Regression Analysis, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 4 (parallel with 14-17, 19). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Verify SKILL.md + knowledge.md both exist, size policy preserved, existing patterns ported. Evidence: `.sisyphus/evidence/task-18-mom-patterns.txt`

  **Commit**: YES (groups with Wave 4)

- [x] 19. Rewrite mom-style-guide

  **What to do**:
  - Create `.agents/skills/mom-style-guide/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/mom-style-guide/` (177 lines)
  - Preserve: question style conventions, formatting rules, pedagogical guidelines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 4 (parallel with 14-18). Blocked By: 1, 2, 3.

  **Acceptance Criteria**: Verify gold standard format, style conventions preserved. Evidence: `.sisyphus/evidence/task-19-mom-style-guide.txt`

  **Commit**: YES (groups with Wave 4)

- [x] 20. Create Session Reflector + SessionEnd Hook + LightRAG Indexing

  **What to do**:
  - Create `.agents/skills/session-reflector/SKILL.md` — session learning capture skill in gold standard format
  - Configure SessionEnd hook in `.claude/settings.local.json`
  - **Two-stage memory pipeline**:
    1. **Stage 1 (immediate)**: At session end, write a reflection markdown file to `.agents/memory/pending/{YYYY-MM-DD}-{slug}.md` (≤50 lines)
    2. **Stage 2 (deferred)**: At NEXT session start, if pending/ has files: run `.agents/memory/scripts/index_reflection.py` to index them into LightRAG's knowledge graph, then move to an `indexed/` subdirectory
  - Reflection format: what was done, patterns noticed, corrections received, skill creation suggestions
  - **LightRAG query at session start**: The skill should instruct agents to run `query_memory.py` with a summary of the current task to check for relevant past learnings before starting work
  - Hook type: "prompt" — triggers reflection check at session end
  - **Graceful degradation**: If Ollama isn't running or LightRAG isn't installed, reflections still save to pending/ as flat markdown. The knowledge graph indexing happens later when the tools are available.

  **Must NOT do**:
  - Do not require LightRAG to be running for the session to end (it's enhancement, not requirement)
  - Do not auto-index without user awareness (pending/ → indexed/ transition is visible)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**: Wave 5 (parallel with Task 21). Blocked By: Task 6.

  **References**:
  - `.agents/memory/scripts/index_reflection.py` — created in Task 6, indexes markdown into LightRAG
  - `.agents/memory/scripts/query_memory.py` — created in Task 6, queries knowledge graph
  - `.claude/settings.local.json` — existing settings file (read before modifying)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Session reflector skill + hook configured
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/session-reflector/SKILL.md
      2. Assert: file exists
      3. Run: head -4 .agents/skills/session-reflector/SKILL.md
      4. Assert: YAML frontmatter with "Use when" description
      5. Run: grep "SessionEnd" .claude/settings.local.json
      6. Assert: hook configured
    Expected Result: Skill + hook operational
    Evidence: .sisyphus/evidence/task-20-session-reflector.txt

  Scenario: Two-stage pipeline documented
    Tool: Bash
    Steps:
      1. Run: grep -ci "pending\|index.*reflection\|lightrag\|query.*memory" .agents/skills/session-reflector/SKILL.md
      2. Assert: > 0 (references both stages)
      3. Run: grep -ci "graceful\|degrad\|ollama.*not" .agents/skills/session-reflector/SKILL.md
      4. Assert: > 0 (graceful degradation documented)
    Expected Result: Full pipeline with fallback documented
    Evidence: .sisyphus/evidence/task-20-pipeline-docs.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `feat(skills): create session-reflector with LightRAG-powered knowledge graph indexing`
  - Files: `.agents/skills/session-reflector/SKILL.md`, `.claude/settings.local.json`

- [x] 21. Rewrite find-skills

  **What to do**:
  - Create `.agents/skills/find-skills/SKILL.md` in gold standard format
  - Read archived original from `.sisyphus/archive/skills/find-skills/` (133 lines)
  - Preserve: `npx skills` CLI commands, search workflow, installation guidance
  - Apply gold standard: add guardrails, quick start, error handling table

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 5 (parallel with Task 20). Blocked By: Tasks 2, 3.

  **Acceptance Criteria**: Verify gold standard format, `npx skills` references preserved. Evidence: `.sisyphus/evidence/task-21-find-skills.txt`

  **Commit**: YES (groups with Wave 5)

- [x] 22. Audit + Clean Up Global Skills

  **What to do**:
  - List ALL skills currently installed at `~/.config/opencode/skills/`
  - Categorize each as **universal** (useful for any project) vs **project-specific** (only relevant to one project):
    - **Universal** (KEEP global): `superpowers/`, `frontend-design/`, `find-skills/`
    - **Project-specific** (RECOMMEND removing): `gb-compare/`, `gb-new-assignment/`, `gb-pipeline/`, `gb-sync/`, `mom-fact-finder/`, `mom-frq/`, `mom-lib-map/`, `mom-matrix/`, `mom-matrix-inverse/`, `mom-page-map/`, `mom-patterns/`, `mom-style-guide/`, `book-solutions/`, `book-verify/`, `json-to-slides-desktop/`
  - **PRESENT the full list to the user** with recommended categorization and ask them to confirm or adjust BEFORE moving anything
  - For each skill the user confirms as project-specific:
    - Verify it already exists in the project's `.agents/skills/` (after nuclear rebuild rewrite)
    - If yes → delete the global copy
    - If no → ask user where it belongs
  - For skills that belong to OTHER projects (book-solutions, book-verify, json-to-slides-desktop, mom-matrix, mom-matrix-inverse): ask user which project they should live in, or if they should stay global

  **Must NOT do**:
  - Do NOT move or delete ANY skill without explicit user confirmation
  - Do NOT modify the superpowers/ directory (it's the agent framework)
  - Do NOT delete global skills that don't have a project-level equivalent yet

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (requires user decisions)
  - **Parallel Group**: Wave 6 (after all O.G.R.E skills exist in .agents/skills/)
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 7-21 (all O.G.R.E rewrites must complete first so project-level copies exist)

  **References**:
  - `~/.config/opencode/skills/` — current global skills directory (18 skills)
  - `.agents/skills/` — project-level skills (after nuclear rebuild)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: User was consulted before any moves
    Tool: Bash
    Steps:
      1. Verify evidence file contains user confirmation transcript
    Expected Result: No skills moved without explicit user approval
    Evidence: .sisyphus/evidence/task-22-user-decisions.txt

  Scenario: No orphaned skills
    Tool: Bash
    Steps:
      1. Run: ls ~/.config/opencode/skills/ | wc -l
      2. Compare against pre-cleanup count (was 18)
      3. For each removed global skill, verify project-level copy exists
    Expected Result: Every removed global skill has a project-level home
    Evidence: .sisyphus/evidence/task-22-global-cleanup.txt
  ```

  **Commit**: YES
  - Message: `refactor(global): clean up global skills — move project-specific skills to their projects`
  - Files: `~/.config/opencode/skills/` (removals)

- [x] 23. Install Universal Smart Agent Skills Globally

  **What to do**:
  - Copy the following NEW skills from O.G.R.E's `.agents/skills/` to `~/.config/opencode/skills/`:
    - `skill-creator/` → `~/.config/opencode/skills/skill-creator/`
    - `session-reflector/` → `~/.config/opencode/skills/session-reflector/`
  - Create a NEW global skill: `~/.config/opencode/skills/lightrag-memory/SKILL.md`
    - This is a WRAPPER skill that provides the LightRAG memory interface for any project
    - Contains: instructions for setting up `.agents/memory/` in any project, the Python scripts (setup.sh, index_reflection.py, query_memory.py), and usage guidance
    - When invoked in a new project, it creates the `.agents/memory/` directory structure with LightRAG scripts
    - Skill description: `Use when setting up persistent agent memory in a new project, querying past session learnings, or indexing session reflections into the knowledge graph.`
  - Configure the SessionEnd hook at the GLOBAL level (if opencode supports global hooks — check `~/.config/opencode/opencode.json` for hook support)
    - If global hooks exist: configure SessionEnd to trigger session-reflector
    - If global hooks don't exist: document that each project needs the hook in its `.claude/settings.local.json`
  - After installation, verify the new skills appear as `(opencode - Skill)` in any project's skill catalog

  **Must NOT do**:
  - Do not overwrite existing global skills
  - Do not install O.G.R.E-specific skills (gb-*, mom-*, grade-*) globally — those stay project-level
  - Do not hardcode O.G.R.E paths in the global skills

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (after Task 22 cleanup)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Task 22 (cleanup first, then install)

  **References**:
  - `.agents/skills/skill-creator/SKILL.md` — source for global copy (created in Task 2)
  - `.agents/skills/session-reflector/SKILL.md` — source for global copy (created in Task 20)
  - `~/.config/opencode/opencode.json` — check for global hook configuration support
  - `~/.config/opencode/oh-my-opencode.json` — global agent configuration

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Smart agent skills installed globally
    Tool: Bash
    Steps:
      1. Run: ls ~/.config/opencode/skills/skill-creator/SKILL.md
      2. Assert: file exists
      3. Run: ls ~/.config/opencode/skills/session-reflector/SKILL.md
      4. Assert: file exists
      5. Run: ls ~/.config/opencode/skills/lightrag-memory/SKILL.md
      6. Assert: file exists
    Expected Result: All 3 universal smart agent skills installed globally
    Evidence: .sisyphus/evidence/task-23-global-install.txt

  Scenario: LightRAG memory skill is project-agnostic
    Tool: Bash
    Steps:
      1. Run: grep -c "O.G.R.E\|ogre\|grading" ~/.config/opencode/skills/lightrag-memory/SKILL.md
      2. Assert: 0 (no project-specific references)
      3. Run: grep -c "lightrag\|LightRAG\|knowledge graph" ~/.config/opencode/skills/lightrag-memory/SKILL.md
      4. Assert: > 0 (LightRAG references present)
    Expected Result: Universal skill, no project coupling
    Evidence: .sisyphus/evidence/task-23-no-coupling.txt
  ```

  **Commit**: YES
  - Message: `feat(global): install skill-creator, session-reflector, lightrag-memory as universal global skills`
  - Files: `~/.config/opencode/skills/skill-creator/`, `~/.config/opencode/skills/session-reflector/`, `~/.config/opencode/skills/lightrag-memory/`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for violations. Check all evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Gold Standard Format Compliance** — `unspecified-high`
  Read EVERY `.agents/skills/*/SKILL.md` file. For each, verify ALL required sections exist (YAML frontmatter, overview, prerequisites, when to use, when NOT to use, guardrails, workflow, error handling). Check YAML `description` starts with "Use when...". Check no file exceeds 500 lines. Check no `references/` file has YAML frontmatter.
  Output: `Skills [N/N compliant] | Format violations [list] | VERDICT`

- [ ] F3. **Domain Knowledge Preservation Check** — `unspecified-high`
  For EACH rewritten skill, compare against the archive at `.sisyphus/archive/`. Verify critical domain knowledge is preserved:
  - grade-show-work: all DOM selectors (scoreboxN, bigquestionwrap, etc.)
  - gb-sync: complete Aeries scraping patterns, Phase 4-7 workflow
  - gb-compare: MOM category extraction, date parsing
  - mom-frq: MOM PHP syntax ($scoremethod, $displayformat, loadlibrary)
  - mom-page-map: MOM URL patterns, page navigation sequences
  - mom-lib-map: all 16 subject reference files present in references/
  - mom-fact-finder: browser search workflow for MOM patterns
  Flag any domain knowledge present in archive but MISSING from new skill.
  Output: `Skills [N/N preserved] | Missing knowledge [list] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify: no source code modified, no non-markdown/JSON files created, CLAUDE.md ≤200 lines, no hooks beyond SessionEnd, `.claude/skills/` deleted, commands preserved in `.claude/commands/`.
  Output: `Scope violations [N] | VERDICT`

---

## Commit Strategy

- **Wave 0**: `chore(archive): archive all existing skills to .sisyphus/archive/`
- **Wave 1**: `refactor(infrastructure): delete old skills, create CLAUDE.md + AGENTS.md + memory structure`
- **Wave 2**: `feat(skills): rewrite grading skills in gold standard format`
- **Wave 3**: `feat(skills): rewrite gradebook sync skills in gold standard format`
- **Wave 4**: `feat(skills): rewrite MOM authoring skills in gold standard format`
- **Wave 5**: `feat(skills): create session-reflector, rewrite find-skills`
- **Wave FINAL**: No commit (verification only)

---

## Success Criteria

### Verification Commands
```bash
ls .claude/skills/ 2>/dev/null              # Expected: directory does not exist
ls -d .agents/skills/*/SKILL.md | wc -l     # Expected: 14
grep -r "claude-mem" . --include="*.md"      # Expected: 0 results
grep -r "\.claude/skills/" .agents/          # Expected: 0 results
wc -l CLAUDE.md                              # Expected: ≤200
ls .agents/memory/pending/                           # Expected: directory exists
ls .agents/memory/scripts/*.py                       # Expected: index_reflection.py, query_memory.py
grep "lightrag" .agents/memory/scripts/setup.sh      # Expected: LightRAG installation reference
ls .sisyphus/archive/                        # Expected: archived skills present
cat .claude/settings.local.json | grep -i session  # Expected: SessionEnd hook
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 14 skills follow gold standard format
- [ ] All domain knowledge preserved from originals
- [ ] Session reflection hook operational
