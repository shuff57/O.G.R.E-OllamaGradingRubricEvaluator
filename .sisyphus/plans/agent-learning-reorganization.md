# Agent Learning & Organization Overhaul

## TL;DR

> **Quick Summary**: Restructure the entire agent infrastructure from a fragmented, memory-less system into a 3-layer architecture (CLAUDE.md brain → skills in .agents/skills/ → layered persistent memory) where agents accumulate knowledge across sessions, suggest new skill creation when they detect repetitive patterns, and follow consistent formatting standards.
> 
> **Deliverables**:
> - Rich CLAUDE.md (project brain with routing intelligence)
> - AGENTS.md (shared agent behavioral rules)
> - All 12 skills audited, standardized, and migrated to .agents/skills/
> - mom-lib-map restructured (16 sub-files → references/ subdirectory)
> - skill-creator meta-skill
> - Session reflection hook (automatic learning capture)
> - Memory infrastructure (.agents/memory/)
> - Pattern suggestion directive in CLAUDE.md
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Wave 1 (cleanup) → Wave 2 (paths + CLAUDE.md) → Wave 3 (migration) → Wave 4 (new capabilities) → Wave FINAL (verification)

---

## Context

### Original Request
User wants a "fundamental shift" in how the O.G.R.E project is organized and how agents "learn" across sessions. Inspired by:
- **jakevanclief** ("How I Structure Folders to Replace AI Agents") — 3-layer routing, folder structure IS the agent, naming conventions replace databases
- **maven_hq** ("Give your agents memory") — persistent memory is the simplest way to make agents improve over time

### Interview Summary
**Key Discussions**:
- **Learning aggressiveness**: Agent suggests skill creation, user decides (not autonomous)
- **Memory architecture**: Both layered — skill-specific knowledge files + central cross-cutting knowledge base
- **Skill creation triggers**: Both in-session pattern detection AND cross-session history checks
- **Skills canonical location**: `.agents/skills/` (tool-agnostic, portable across agent platforms)
- **Existing skills**: Full audit and restructure of all 12 skills
- **Reflection timing**: Hook-based automatic (SessionEnd hook triggers reflection)
- **Scope**: Only markdown infrastructure + hook config. No source code changes.

**Research Findings**:
- jakevanclief: 3-layer routing system, CLAUDE.md as brain, skills plugged in, naming conventions as structure
- maven_hq: Persistent agent memory across sessions
- Tebogo Tseka (DEV.to): 6-layer memory architecture for 14 specialized agents
- Liam T Bilich: Meta-skill that scaffolds other skills
- Conor Armstrong (Anthropic): "Stop building agents. Start building skills."
- Anthropic official: skill-creator meta-skill at github.com/anthropics/skills

### Metis Review
**Identified Gaps** (addressed):
- **claude-mem abandoned**: 4 files contain stale `claude-mem-context` blocks (last activity Feb 22). Plan includes cleanup.
- **Skills format crisis**: 7 skills use CLAUDE.md instead of SKILL.md, 6 lack YAML frontmatter, 16 mom-lib-map sub-files pollute skill catalog. Plan standardizes all.
- **Hardcoded paths**: 6 references to `.claude/skills/` in mom-fact-finder and mom-lib-map. Plan updates to skill-name-based loading.
- **find-skills duplicated**: Identical copies in both .claude/skills/ and .agents/skills/. Plan removes duplicate.
- **No auto-memory conflict**: Confirmed `~/.claude/projects/*/memory/MEMORY.md` does NOT exist. Safe to build new memory system.
- **Skill catalog pollution**: 16 mom-lib-map subject files each discovered as standalone skills with empty descriptions (~28 catalog entries instead of ~12). Plan restructures to references/.

---

## Work Objectives

### Core Objective
Transform the agent infrastructure from a fragmented, memory-less system into a clean 3-layer architecture where agents accumulate knowledge, follow consistent standards, and proactively suggest improvements — implementing jakevanclief's routing architecture and maven_hq's persistent memory approach.

### Concrete Deliverables
- `CLAUDE.md` (project root) — populated with project context, skill routing, pattern-suggestion directive (≤200 lines)
- `AGENTS.md` (project root) — shared agent behavioral rules for OpenCode
- All 12 skills migrated to `.agents/skills/` with SKILL.md + YAML frontmatter
- `mom-lib-map` restructured: single SKILL.md + `references/` subdirectory
- `.agents/skills/skill-creator/SKILL.md` — meta-skill for creating new skills
- `.agents/skills/session-reflector/SKILL.md` — session reflection skill
- `.claude/settings.local.json` — SessionEnd hook configuration
- `.agents/memory/` — persistent memory infrastructure with conventions
- `.claude/skills/` — removed (skills consolidated in .agents/skills/)

### Definition of Done
- [ ] `grep -r "claude-mem" .claude/ .agents/` returns 0 results
- [ ] Skill catalog shows exactly 14 skills (12 original + skill-creator + session-reflector), all with non-empty descriptions
- [ ] `grep -r "\.claude/skills/" .agents/skills/` returns 0 results (no hardcoded paths)
- [ ] `wc -l CLAUDE.md` shows ≤200 lines
- [ ] `.agents/memory/` directory exists with README.md explaining structure
- [ ] SessionEnd hook configured in `.claude/settings.local.json`

### Must Have
- Every skill has SKILL.md with YAML frontmatter (name + description)
- CLAUDE.md contains skill routing guidance and pattern-suggestion directive
- mom-lib-map sub-files are NOT discoverable as individual skills
- All cross-skill references use skill names, not file paths
- Session reflection captures learnings to a pending file for user review

### Must NOT Have (Guardrails)
- **No autonomous file modifications**: Agents suggest, user approves. No auto-writing to memory without user consent (except session-reflector drafts to pending/)
- **No source code changes**: Do not touch grading-server/, ogre-desktop/, mom/, fine-tuned-model/, or any .ts/.js/.py/.rs files
- **No skill content rewrites**: Format changes only during standardization. Do not rewrite skill logic, error handling, or workflows
- **No autonomous pattern detection system**: Limit to a CLAUDE.md directive paragraph that reminds agents to suggest skill creation
- **No generalized mom-patterns pipelines**: Do not build auto-population pipelines for gb-* or grade-* domains (future project)
- **No meta-documentation**: No skills manifest file, no format guide document. YAML frontmatter IS the manifest. SKILL.md format IS self-documenting
- **No hooks beyond SessionEnd**: Start with ONE hook. Expand later based on experience
- **No CLAUDE.md > 200 lines**: Official Anthropic guidance caps project memory

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (markdown infrastructure, not testable code)
- **Automated tests**: None (N/A for markdown files)
- **Framework**: None

### QA Policy
Every task MUST include agent-executed QA scenarios using Bash commands (grep, wc, ls, cat) to verify structural correctness. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **File structure verification**: Use `ls`, `find`, `tree` commands
- **Content verification**: Use `grep`, `wc -l`, `head` commands
- **Skill discovery verification**: Use skill catalog listing
- **Reference resolution**: Use `grep` to verify all cross-references resolve

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Cleanup + Standardization — 6 parallel, all quick):
├── Task 1: Remove claude-mem artifacts from all files [quick]
├── Task 2: Remove find-skills duplicate directory [quick]
├── Task 3: Rename grade-show-work/CLAUDE.md → SKILL.md [quick]
├── Task 4: Add YAML frontmatter + rename: mom-fact-finder, mom-frq, mom-page-map [quick]
├── Task 5: Add YAML frontmatter + rename: mom-patterns, mom-style-guide [quick]
└── Task 6: Restructure mom-lib-map (sub-files → references/) [unspecified-low]

Wave 2 (Path Updates + Project Brain — 4 parallel):
├── Task 7: Update hardcoded paths in mom-fact-finder [quick]
├── Task 8: Update hardcoded paths in mom-lib-map [quick]
├── Task 9: Write CLAUDE.md (project brain) [deep]
└── Task 10: Create AGENTS.md [unspecified-high]

Wave 3 (Migration to .agents/skills/ — 3 parallel):
├── Task 11: Migrate gb-* skills (4 skills) [unspecified-low]
├── Task 12: Migrate mom-* skills (6 skills) [unspecified-low]
└── Task 13: Migrate grade-show-work + cleanup .claude/skills/ [quick]

Wave 4 (New Capabilities — 3 parallel):
├── Task 14: Create skill-creator meta-skill [deep]
├── Task 15: Create session-reflector skill + SessionEnd hook [deep]
└── Task 16: Create memory infrastructure [unspecified-high]

Wave FINAL (Verification — 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Structural integrity review (unspecified-high)
├── Task F3: Real skill invocation QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1-6 → Task 7-8 → Task 11-13 → Task 14-16 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 13 | 1 |
| 3 | — | 13 | 1 |
| 4 | 1 | 7, 12 | 1 |
| 5 | 1 | 12 | 1 |
| 6 | — | 8, 12 | 1 |
| 7 | 4 | 12 | 2 |
| 8 | 6 | 12 | 2 |
| 9 | — | F1 | 2 |
| 10 | — | F1 | 2 |
| 11 | 7 | F1-F4 | 3 |
| 12 | 4, 5, 6, 7, 8 | F1-F4 | 3 |
| 13 | 2, 3 | F1-F4 | 3 |
| 14 | 11, 12, 13 | F1-F4 | 4 |
| 15 | 11, 12, 13 | F1-F4 | 4 |
| 16 | 11, 12, 13 | F1-F4 | 4 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **6** — T1-T5 → `quick`, T6 → `unspecified-low`
- **Wave 2**: **4** — T7-T8 → `quick`, T9 → `deep`, T10 → `unspecified-high`
- **Wave 3**: **3** — T11-T12 → `unspecified-low`, T13 → `quick`
- **Wave 4**: **3** — T14-T15 → `deep`, T16 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Remove claude-mem Artifacts

  **What to do**:
  - Find all files containing `<claude-mem-context>` blocks and remove the entire block (from `<claude-mem-context>` through `</claude-mem-context>`)
  - Files to clean: `.claude/CLAUDE.md`, `.claude/commands/CLAUDE.md`, `.claude/plans/CLAUDE.md`, `.claude/skills/mom-frq/CLAUDE.md`
  - For `.claude/CLAUDE.md`: the file will become empty after removing the block. Leave it as an empty file (it gets replaced in Task 9)
  - For `mom-frq/CLAUDE.md`: preserve ALL content below the claude-mem block. The block contains 3 entries from Feb 22, 2026 that are no longer useful
  - Verify no other files contain claude-mem blocks: `grep -r "claude-mem" .claude/ .agents/`

  **Must NOT do**:
  - Do not delete the files themselves — only remove the claude-mem-context blocks
  - Do not modify any skill content outside the claude-mem blocks
  - Do not remove any other sections from mom-frq/CLAUDE.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 4, 5 (need clean files before adding frontmatter)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.claude/CLAUDE.md` — 7 lines total, entire content is the claude-mem block
  - `.claude/commands/CLAUDE.md` — contains claude-mem block (check structure before editing)
  - `.claude/plans/CLAUDE.md` — contains claude-mem block
  - `.claude/skills/mom-frq/CLAUDE.md` — claude-mem block at TOP of file (lines 1-11), skill content below (~1043 lines total)

  **WHY Each Reference Matters**:
  - `.claude/CLAUDE.md` becomes empty because its ONLY content is the claude-mem block. Task 9 replaces it.
  - `mom-frq/CLAUDE.md` is the most delicate — the block is at the top but 1000+ lines of valuable skill content follow it. Preserve everything after the closing tag.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All claude-mem blocks removed
    Tool: Bash
    Preconditions: Current files have claude-mem-context blocks in 4 locations
    Steps:
      1. Run: grep -rn "claude-mem" .claude/ .agents/
      2. Assert: output is empty (exit code 1, no matches)
    Expected Result: Zero files contain "claude-mem" anywhere
    Failure Indicators: Any grep match returned
    Evidence: .sisyphus/evidence/task-1-no-claude-mem.txt

  Scenario: mom-frq content preserved
    Tool: Bash
    Preconditions: mom-frq/CLAUDE.md has ~1043 lines with claude-mem block at top
    Steps:
      1. Run: wc -l .claude/skills/mom-frq/CLAUDE.md
      2. Assert: line count is approximately 1032 (original 1043 minus ~11 claude-mem lines)
      3. Run: head -5 .claude/skills/mom-frq/CLAUDE.md
      4. Assert: first line is NOT `<claude-mem-context>` — should be skill content
    Expected Result: File starts with skill content, not claude-mem block
    Failure Indicators: File starts with `<claude-mem-context>` or file is empty
    Evidence: .sisyphus/evidence/task-1-mom-frq-preserved.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(skills): remove abandoned claude-mem artifacts from 4 files`
  - Files: `.claude/CLAUDE.md`, `.claude/commands/CLAUDE.md`, `.claude/plans/CLAUDE.md`, `.claude/skills/mom-frq/CLAUDE.md`
  - Pre-commit: `grep -rn "claude-mem" .claude/ .agents/` returns empty

- [ ] 2. Remove find-skills Duplicate

  **What to do**:
  - Delete the `.claude/skills/find-skills/` directory entirely
  - The canonical copy lives at `.agents/skills/find-skills/SKILL.md` (already exists, identical content)
  - Verify the `.agents/skills/find-skills/SKILL.md` copy exists and has YAML frontmatter before deleting

  **Must NOT do**:
  - Do not delete `.agents/skills/find-skills/` — that's the one we keep
  - Do not modify the surviving copy's content

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Task 13
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.claude/skills/find-skills/SKILL.md` — the DUPLICATE to delete (133 lines)
  - `.agents/skills/find-skills/SKILL.md` — the CANONICAL copy to KEEP (133 lines, identical)

  **WHY Each Reference Matters**:
  - Verify the keeper exists BEFORE deleting the duplicate. Safety first.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Duplicate removed, canonical preserved
    Tool: Bash
    Preconditions: find-skills exists in both .claude/skills/ and .agents/skills/
    Steps:
      1. Run: ls .agents/skills/find-skills/SKILL.md
      2. Assert: file exists (exit code 0)
      3. Run: ls .claude/skills/find-skills/SKILL.md 2>/dev/null
      4. Assert: file does NOT exist (exit code non-zero)
    Expected Result: Only .agents/skills/ copy exists
    Failure Indicators: .claude/skills/find-skills/ still exists, or .agents/ copy missing
    Evidence: .sisyphus/evidence/task-2-dedup-find-skills.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(skills): remove duplicate find-skills from .claude/skills/`
  - Files: `.claude/skills/find-skills/` (deleted)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run grep). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Structural Integrity Review** — `unspecified-high`
  Verify ALL cross-references resolve: grep every .agents/skills/*/SKILL.md for `load_skills=`, skill name mentions, and file path references. Confirm each referenced skill exists at .agents/skills/{name}/SKILL.md. Check no orphan files remain in .claude/skills/. Verify mom-lib-map references/ files are not in skill catalog. Run `wc -l CLAUDE.md` (must be ≤200). Run `wc -l AGENTS.md`.
  Output: `References [N resolved/N total] | Orphans [N] | Catalog [N skills] | VERDICT`

- [ ] F3. **Real Skill Invocation QA** — `unspecified-high`
  Read each skill's SKILL.md and verify: (1) YAML frontmatter has `name` and `description`, (2) description is non-empty and accurately describes the skill, (3) content is syntactically valid markdown, (4) no hardcoded `.claude/skills/` paths remain. Test at minimum: gb-compare, mom-frq, grade-show-work, find-skills, skill-creator, session-reflector. Verify CLAUDE.md routing guidance references correct skill names.
  Output: `Skills [N/N valid] | Descriptions [N/N non-empty] | Hardcoded paths [N found] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual files changed. Verify 1:1 — everything in spec was done (no missing), nothing beyond spec was done (no creep). Check "Must NOT do" compliance. Specifically verify: no source code files modified (.ts/.js/.py/.rs), no skill content rewritten (only format changes), no hooks beyond SessionEnd, CLAUDE.md ≤200 lines.
  Output: `Tasks [N/N compliant] | Scope violations [N] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(skills): clean up claude-mem artifacts and standardize skill format` — all Wave 1 files
- **Wave 2**: `feat(config): populate CLAUDE.md project brain and update skill references` — CLAUDE.md, AGENTS.md, path-updated skills
- **Wave 3**: `refactor(skills): migrate all skills to .agents/skills/ for tool portability` — all skill directories
- **Wave 4**: `feat(skills): add skill-creator, session-reflector, and memory infrastructure` — new skill files, hook config
- **Wave FINAL**: No commit (verification only)

---

## Success Criteria

### Verification Commands
```bash
grep -r "claude-mem" .claude/ .agents/  # Expected: 0 results
grep -r "\.claude/skills/" .agents/skills/  # Expected: 0 results
ls .agents/skills/*/SKILL.md  # Expected: 14 files (12 + skill-creator + session-reflector)
wc -l CLAUDE.md  # Expected: ≤200 lines
ls .agents/memory/  # Expected: directory exists with README.md
ls .claude/skills/ 2>/dev/null  # Expected: empty or not found (all migrated)
cat .claude/settings.local.json | grep -i session  # Expected: SessionEnd hook configured
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All skills discoverable with non-empty descriptions
- [ ] mom-lib-map sub-files NOT in skill catalog
- [ ] All cross-skill references resolve
- [ ] Session reflection hook fires and creates pending file
