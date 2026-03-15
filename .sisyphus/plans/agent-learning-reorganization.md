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

- [ ] 3. Rename grade-show-work/CLAUDE.md → SKILL.md

  **What to do**:
  - Rename `.claude/skills/grade-show-work/CLAUDE.md` to `.claude/skills/grade-show-work/SKILL.md`
  - This file ALREADY has proper YAML frontmatter (`name: grade-show-work`, `description: ...`). No content changes needed.
  - The rename changes it from a contextual-instruction file (auto-loaded) to a proper skill file (on-demand loaded)

  **Must NOT do**:
  - Do not modify the file content — only rename
  - Do not touch grade-show-work-selectors.md (that's a command reference, stays in .claude/commands/)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 13
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.claude/skills/grade-show-work/CLAUDE.md` — 417 lines, has YAML frontmatter at top
  - `.claude/skills/gb-compare/SKILL.md` — example of correct SKILL.md naming (348 lines)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File renamed correctly
    Tool: Bash
    Preconditions: grade-show-work/CLAUDE.md exists with YAML frontmatter
    Steps:
      1. Run: ls .claude/skills/grade-show-work/SKILL.md
      2. Assert: file exists
      3. Run: ls .claude/skills/grade-show-work/CLAUDE.md 2>/dev/null
      4. Assert: file does NOT exist
      5. Run: head -4 .claude/skills/grade-show-work/SKILL.md
      6. Assert: output starts with "---" (YAML frontmatter preserved)
    Expected Result: SKILL.md exists with frontmatter, CLAUDE.md gone
    Evidence: .sisyphus/evidence/task-3-grade-show-work-rename.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(skills): rename grade-show-work/CLAUDE.md to SKILL.md`
  - Files: `.claude/skills/grade-show-work/SKILL.md` (renamed from CLAUDE.md)

- [ ] 4. Add YAML Frontmatter + Rename: mom-fact-finder, mom-frq, mom-page-map

  **What to do**:
  - For each of these 3 skills, add YAML frontmatter block at the top of CLAUDE.md, then rename to SKILL.md
  - **mom-fact-finder**: Add frontmatter: `name: mom-fact-finder`, `description: Use when searching MyOpenMath for real question examples, code patterns, and library usage — discovers patterns from live MOM questions and writes findings to the mom-patterns knowledge base.`
  - **mom-frq**: Add frontmatter: `name: mom-frq`, `description: Use when writing MyOpenMath free response (essay) questions, creating MOM question code, or authoring IMathAS essay-type assessment items from a topic description.`
  - **mom-page-map**: Add frontmatter: `name: mom-page-map`, `description: Use when navigating MyOpenMath pages, understanding MOM URL structure, or locating specific MOM interface elements for browser automation.`
  - YAML frontmatter format (add at very top of file):
    ```
    ---
    name: {skill-name}
    description: {one-line description}
    ---
    ```
  - After adding frontmatter, rename each CLAUDE.md → SKILL.md
  - mom-frq note: Task 1 must complete first (claude-mem block removal) before adding frontmatter

  **Must NOT do**:
  - Do not modify any skill content below the frontmatter
  - Do not rewrite descriptions to be more verbose — keep single-line

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Tasks 7, 12
  - **Blocked By**: Task 1 (claude-mem cleanup for mom-frq)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-compare/SKILL.md:1-4` — example of proper YAML frontmatter format
  - `.claude/skills/mom-fact-finder/CLAUDE.md` — 509 lines, no frontmatter, starts with `# MOM Fact Finder`
  - `.claude/skills/mom-frq/CLAUDE.md` — ~1032 lines (after claude-mem removal), no frontmatter
  - `.claude/skills/mom-page-map/CLAUDE.md` — 786 lines, no frontmatter

  **WHY Each Reference Matters**:
  - gb-compare/SKILL.md shows the exact YAML format to follow (lines 1-4: `---`, `name:`, `description:`, `---`)
  - Each skill file needs frontmatter added at line 1, pushing all existing content down

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 3 skills have frontmatter and are renamed
    Tool: Bash
    Preconditions: 3 skills have CLAUDE.md without frontmatter
    Steps:
      1. Run: head -4 .claude/skills/mom-fact-finder/SKILL.md
      2. Assert: output shows "---\nname: mom-fact-finder\n..."
      3. Run: head -4 .claude/skills/mom-frq/SKILL.md
      4. Assert: output shows "---\nname: mom-frq\n..."
      5. Run: head -4 .claude/skills/mom-page-map/SKILL.md
      6. Assert: output shows "---\nname: mom-page-map\n..."
      7. Run: ls .claude/skills/mom-fact-finder/CLAUDE.md .claude/skills/mom-frq/CLAUDE.md .claude/skills/mom-page-map/CLAUDE.md 2>/dev/null
      8. Assert: none exist (all renamed)
    Expected Result: All 3 have SKILL.md with YAML frontmatter
    Evidence: .sisyphus/evidence/task-4-frontmatter-large-skills.txt

  Scenario: Content preserved after frontmatter addition
    Tool: Bash
    Steps:
      1. Run: wc -l .claude/skills/mom-frq/SKILL.md
      2. Assert: line count is approximately 1036 (1032 content + 4 frontmatter lines)
      3. Run: grep -c "^#" .claude/skills/mom-frq/SKILL.md
      4. Assert: heading count matches original (frontmatter didn't corrupt content)
    Expected Result: Line counts increase by exactly 4 (frontmatter lines)
    Evidence: .sisyphus/evidence/task-4-content-preserved.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(skills): add YAML frontmatter to mom-fact-finder, mom-frq, mom-page-map`
  - Files: `.claude/skills/mom-fact-finder/SKILL.md`, `.claude/skills/mom-frq/SKILL.md`, `.claude/skills/mom-page-map/SKILL.md`

- [ ] 5. Add YAML Frontmatter + Rename: mom-patterns, mom-style-guide

  **What to do**:
  - For each of these 2 skills, add YAML frontmatter block at the top of CLAUDE.md, then rename to SKILL.md
  - **mom-patterns**: Add frontmatter: `name: mom-patterns`, `description: Auto-populated knowledge base of MyOpenMath question patterns — loaded by question-writing skills for real-world examples. Updated by mom-fact-finder, not manually.`
  - **mom-style-guide**: Add frontmatter: `name: mom-style-guide`, `description: Use when writing MyOpenMath questions to ensure consistent style, formatting, and pedagogical conventions across all question types.`
  - Same YAML format as Task 4
  - mom-patterns note: Task 1 must complete first (claude-mem block removal if present)

  **Must NOT do**:
  - Do not modify skill content below frontmatter
  - Do not change the mom-patterns size policy or entry format template

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1 (claude-mem cleanup)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-patterns/CLAUDE.md` — 255 lines, starts with `# MyOpenMath Question Patterns Library`
  - `.claude/skills/mom-style-guide/CLAUDE.md` — 177 lines

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both skills have frontmatter and are renamed
    Tool: Bash
    Steps:
      1. Run: head -4 .claude/skills/mom-patterns/SKILL.md
      2. Assert: shows YAML frontmatter with name: mom-patterns
      3. Run: head -4 .claude/skills/mom-style-guide/SKILL.md
      4. Assert: shows YAML frontmatter with name: mom-style-guide
      5. Run: ls .claude/skills/mom-patterns/CLAUDE.md .claude/skills/mom-style-guide/CLAUDE.md 2>/dev/null
      6. Assert: none exist
    Expected Result: Both renamed with proper frontmatter
    Evidence: .sisyphus/evidence/task-5-frontmatter-small-skills.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(skills): add YAML frontmatter to mom-patterns, mom-style-guide`
  - Files: `.claude/skills/mom-patterns/SKILL.md`, `.claude/skills/mom-style-guide/SKILL.md`

- [ ] 6. Restructure mom-lib-map (Sub-files → references/)

  **What to do**:
  - The current mom-lib-map directory has a CLAUDE.md (49 lines, the index/router) + 16 subject-specific .md files (algebra.md, calculus.md, etc.)
  - Problem: Each subject file is discovered as a standalone skill with empty description, polluting the skill catalog with 16 entries like `mom-lib-map/algebra → "(project - Skill) "`
  - Solution:
    1. Create `.claude/skills/mom-lib-map/references/` subdirectory
    2. Move all 16 subject .md files into `references/`: algebra.md, accounting.md, arithmetic.md, astronomy.md, calculus.md, chemistry.md, differential-equations.md, discrete-math.md, elem-ed.md, finance.md, geometry.md, liberal-arts.md, linear-algebra.md, physics.md, statistics.md, trig.md
    3. Create a proper SKILL.md from CLAUDE.md:
       - Add YAML frontmatter: `name: mom-lib-map`, `description: Use when looking up MyOpenMath library functions and question code syntax for specific subjects — provides library references, function signatures, and code examples organized by academic discipline.`
       - Update internal references to point to `references/` subdirectory
    4. Delete the old CLAUDE.md after SKILL.md is created
  - The references/ subdirectory files should NOT have YAML frontmatter (preventing catalog discovery)
  - Remove any YAML frontmatter if present in the subject files

  **Must NOT do**:
  - Do not modify the content of the 16 subject files — only move them
  - Do not create a combined mega-file (keep them separate for targeted loading)
  - Do not remove the CLAUDE.md-labeled file inside mom-lib-map named `CLAUDE.md` — rename it to SKILL.md

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Tasks 8, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-lib-map/CLAUDE.md` — 49-line index that routes to subject files
  - `.claude/skills/mom-lib-map/algebra.md` — example subject file (check for YAML frontmatter presence)
  - `.claude/skills/mom-lib-map/statistics.md` — another example

  **WHY Each Reference Matters**:
  - The CLAUDE.md index file references subject files by relative path. After moving to references/, these paths must be updated (e.g., `algebra.md` → `references/algebra.md`)
  - Subject files must be checked for YAML frontmatter — if any have it, remove it to prevent catalog discovery

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Subject files moved to references/
    Tool: Bash
    Steps:
      1. Run: ls .claude/skills/mom-lib-map/references/ | wc -l
      2. Assert: output is 16
      3. Run: ls .claude/skills/mom-lib-map/*.md
      4. Assert: only SKILL.md remains (no subject files at root level)
    Expected Result: 16 files in references/, only SKILL.md at root
    Failure Indicators: Subject files still at root level, or references/ has wrong count
    Evidence: .sisyphus/evidence/task-6-mom-lib-map-restructure.txt

  Scenario: Subject files NOT discoverable as skills
    Tool: Bash
    Steps:
      1. Run: grep -l "^---" .claude/skills/mom-lib-map/references/*.md 2>/dev/null
      2. Assert: no files returned (no YAML frontmatter in references)
    Expected Result: Zero reference files have YAML frontmatter
    Evidence: .sisyphus/evidence/task-6-no-catalog-pollution.txt

  Scenario: SKILL.md has proper frontmatter
    Tool: Bash
    Steps:
      1. Run: head -4 .claude/skills/mom-lib-map/SKILL.md
      2. Assert: shows YAML frontmatter with name: mom-lib-map
    Expected Result: Proper SKILL.md with frontmatter
    Evidence: .sisyphus/evidence/task-6-skill-md-valid.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(skills): restructure mom-lib-map — move 16 subject files to references/`
  - Files: `.claude/skills/mom-lib-map/SKILL.md`, `.claude/skills/mom-lib-map/references/*.md`

- [ ] 7. Update Hardcoded Paths in mom-fact-finder

  **What to do**:
  - mom-fact-finder contains 5 references to `.claude/skills/mom-patterns/CLAUDE.md` and `.claude/skills/mom-lib-map/CLAUDE.md`
  - Replace ALL hardcoded file paths with skill-name-based loading patterns:
    - `.claude/skills/mom-patterns/CLAUDE.md` → reference via `load_skills=["mom-patterns"]` or explain that the skill is loaded by name
    - `.claude/skills/mom-lib-map/CLAUDE.md` → reference via `load_skills=["mom-lib-map"]`
  - After Wave 3 migration, the actual paths will be `.agents/skills/mom-patterns/SKILL.md` and `.agents/skills/mom-lib-map/SKILL.md` — but skill-name-based references are path-agnostic, which is the whole point
  - Also update any references to `CLAUDE.md` filenames → `SKILL.md` within the skill content (since those files were renamed in Tasks 4-5)
  - Search and replace carefully — some references may be in prose/instructions, not just code

  **Must NOT do**:
  - Do not rewrite the skill's workflow logic
  - Do not change how mom-fact-finder discovers patterns or writes to mom-patterns
  - Only change file path references, not behavioral instructions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 4 (mom-fact-finder renamed to SKILL.md)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-fact-finder/SKILL.md` (formerly CLAUDE.md) — search for all `.claude/skills/` references
  - The 5 known hardcoded paths are scattered through the 509-line file. Use `grep -n "\.claude/skills" .claude/skills/mom-fact-finder/SKILL.md` to locate them all

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No hardcoded .claude/skills/ paths remain
    Tool: Bash
    Steps:
      1. Run: grep -c "\.claude/skills/" .claude/skills/mom-fact-finder/SKILL.md
      2. Assert: output is 0
    Expected Result: Zero hardcoded paths
    Evidence: .sisyphus/evidence/task-7-mom-fact-finder-paths.txt

  Scenario: Skill name references are correct
    Tool: Bash
    Steps:
      1. Run: grep -c "mom-patterns" .claude/skills/mom-fact-finder/SKILL.md
      2. Assert: output is > 0 (references exist by name)
      3. Run: grep -c "mom-lib-map" .claude/skills/mom-fact-finder/SKILL.md
      4. Assert: output is > 0
    Expected Result: Skills referenced by name, not path
    Evidence: .sisyphus/evidence/task-7-name-references.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(skills): replace hardcoded .claude/skills/ paths in mom-fact-finder with skill names`
  - Files: `.claude/skills/mom-fact-finder/SKILL.md`

- [ ] 8. Update Hardcoded Paths in mom-lib-map

  **What to do**:
  - mom-lib-map SKILL.md (formerly CLAUDE.md) contains 1 known reference to `.claude/skills/mom-lib-map/` paths
  - Update internal references to point to `references/` subdirectory (since subject files moved there in Task 6)
  - Replace any `.claude/skills/` prefixed paths with relative references
  - Also verify the updated SKILL.md correctly references `references/algebra.md` etc. instead of just `algebra.md`

  **Must NOT do**:
  - Do not modify the 16 subject reference files themselves
  - Only update the SKILL.md index file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 9, 10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 6 (mom-lib-map restructure must complete first)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-lib-map/SKILL.md` — the index file updated in Task 6
  - Use `grep -n "\.claude/skills" .claude/skills/mom-lib-map/SKILL.md` to find hardcoded paths

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No hardcoded paths and references/ paths correct
    Tool: Bash
    Steps:
      1. Run: grep -c "\.claude/skills/" .claude/skills/mom-lib-map/SKILL.md
      2. Assert: output is 0
      3. Run: grep -c "references/" .claude/skills/mom-lib-map/SKILL.md
      4. Assert: output is > 0 (references to subdirectory exist)
    Expected Result: Clean paths, references/ subdirectory referenced
    Evidence: .sisyphus/evidence/task-8-mom-lib-map-paths.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(skills): update mom-lib-map references to use references/ subdirectory`
  - Files: `.claude/skills/mom-lib-map/SKILL.md`

- [ ] 9. Write CLAUDE.md — Project Brain

  **What to do**:
  - Create a rich, comprehensive `CLAUDE.md` at the project root (NOT `.claude/CLAUDE.md` — the project root)
  - This is the "brain" of the 3-layer routing system (jakevanclief's approach)
  - Must be ≤200 lines (Anthropic guidance)
  - Content structure:
    1. **Project Identity** (~15 lines): O.G.R.E description, tech stack, key directories
    2. **Skill Routing Guide** (~40 lines): What each skill does, when to use it, organized by domain (grading, gradebook sync, MOM question authoring, meta/utility)
    3. **Conventions** (~30 lines): File naming, skill format standards, commit message style, code style preferences
    4. **Memory Instructions** (~20 lines): Where persistent knowledge lives, how to read/write memory, session reflection protocol
    5. **Pattern Suggestion Directive** (~15 lines): THE key learning instruction — tells agents to notice repetitive patterns and suggest creating new skills. Include: what triggers a suggestion (same task type 2+ times), how to suggest (present to user with proposed skill name/description), what NOT to do (don't auto-create, don't interrupt workflow)
    6. **Cross-Session Learning** (~15 lines): How to check .agents/memory/ for past learnings, how to record new insights, the pending/ review system
    7. **Scope Boundaries** (~10 lines): What agents must NOT touch (source code conventions, deployment, etc.)
  - Also update `.claude/CLAUDE.md` to be a minimal pointer: "See project root CLAUDE.md for full project context."

  **Must NOT do**:
  - Do not exceed 200 lines
  - Do not include skill-specific instructions (those belong in SKILL.md files)
  - Do not include source code documentation
  - Do not duplicate what AGENTS.md covers (agent behavioral rules)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10)
  - **Blocks**: Tasks F1, F2
  - **Blocked By**: None (can draft based on existing knowledge)

  **References**:

  **Pattern References**:
  - `README.md` — project description and feature list (source of truth for project identity)
  - `SETUP.md` — technical setup details
  - `.claude/skills/*/SKILL.md` — all skill names and descriptions (source for routing guide)
  - `.claude/commands/grade.md` — command description (for routing guide)

  **External References**:
  - Anthropic guidance on CLAUDE.md: keep under 200 lines, focus on project context and conventions
  - jakevanclief's 3-layer routing: CLAUDE.md is the brain that routes to skills

  **WHY Each Reference Matters**:
  - README.md provides the authoritative project description to summarize in CLAUDE.md
  - Skill files provide the exact names and descriptions for the routing guide section

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CLAUDE.md exists at project root and is within limits
    Tool: Bash
    Steps:
      1. Run: ls CLAUDE.md
      2. Assert: file exists at project root
      3. Run: wc -l CLAUDE.md
      4. Assert: line count ≤ 200
    Expected Result: File exists, ≤200 lines
    Evidence: .sisyphus/evidence/task-9-claude-md-size.txt

  Scenario: CLAUDE.md contains all required sections
    Tool: Bash
    Steps:
      1. Run: grep -c "## " CLAUDE.md
      2. Assert: at least 5 section headers
      3. Run: grep -c "pattern" CLAUDE.md (case insensitive)
      4. Assert: > 0 (pattern suggestion directive exists)
      5. Run: grep -c "memory" CLAUDE.md (case insensitive)
      6. Assert: > 0 (memory instructions exist)
      7. Run: grep -c ".agents/skills/" CLAUDE.md
      8. Assert: > 0 (skill routing references correct location)
    Expected Result: All key sections present
    Evidence: .sisyphus/evidence/task-9-claude-md-content.txt

  Scenario: .claude/CLAUDE.md updated as pointer
    Tool: Bash
    Steps:
      1. Run: wc -l .claude/CLAUDE.md
      2. Assert: line count < 10 (minimal pointer)
      3. Run: grep "root" .claude/CLAUDE.md
      4. Assert: references project root CLAUDE.md
    Expected Result: Minimal pointer file
    Evidence: .sisyphus/evidence/task-9-claude-dir-pointer.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(config): create CLAUDE.md project brain with skill routing and learning directives`
  - Files: `CLAUDE.md` (new), `.claude/CLAUDE.md` (updated)

- [ ] 10. Create AGENTS.md

  **What to do**:
  - Create `AGENTS.md` at the project root
  - This file provides shared behavioral rules for all agents working on the project (OpenCode convention)
  - Content structure:
    1. **Agent Identity**: "You are working on O.G.R.E, an education-focused AI grading toolkit"
    2. **Behavioral Rules**: Be generous with grading (high school seniors), preserve existing scores, batch DOM operations, save frequently
    3. **Tool Preferences**: Playwriter for browser automation, skill-name-based loading (never hardcode paths), always check for existing skills before starting work
    4. **Error Recovery**: How to handle common failures (Playwriter disconnection, page load timeout, context limit)
    5. **Learning Protocol**: Check .agents/memory/ at session start, record insights at session end, suggest skill creation when patterns detected
    6. **Forbidden Actions**: Never modify source code without explicit instruction, never auto-approve grade changes, never skip user confirmation for destructive operations
  - Keep concise (~80-120 lines)

  **Must NOT do**:
  - Do not duplicate CLAUDE.md content (project description, skill routing)
  - Do not include skill-specific instructions
  - Do not exceed 150 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: Task F1
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.claude/commands/grade.md:22-38` — grading philosophy section (behavioral rules for grading agents)
  - `.claude/skills/grade-show-work/SKILL.md:73-84` — guardrails section (example of forbidden actions)
  - `.claude/skills/gb-pipeline/SKILL.md:150-168` — safety rules and troubleshooting (error recovery patterns)

  **External References**:
  - Tebogo Tseka (DEV.to) article: 6-layer memory architecture — structure for AGENTS.md behavioral rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md exists and is within limits
    Tool: Bash
    Steps:
      1. Run: ls AGENTS.md
      2. Assert: file exists at project root
      3. Run: wc -l AGENTS.md
      4. Assert: line count ≤ 150
    Expected Result: File exists, reasonable size
    Evidence: .sisyphus/evidence/task-10-agents-md.txt

  Scenario: AGENTS.md covers key behavioral areas
    Tool: Bash
    Steps:
      1. Run: grep -ci "forbidden\|must not\|never" AGENTS.md
      2. Assert: > 0 (forbidden actions exist)
      3. Run: grep -ci "memory\|learn" AGENTS.md
      4. Assert: > 0 (learning protocol exists)
    Expected Result: Behavioral rules and learning protocol present
    Evidence: .sisyphus/evidence/task-10-agents-md-content.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(config): create AGENTS.md with shared agent behavioral rules`
  - Files: `AGENTS.md` (new)

- [ ] 11. Migrate gb-* Skills to .agents/skills/

  **What to do**:
  - Move 4 gradebook skills from `.claude/skills/` to `.agents/skills/`:
    - `.claude/skills/gb-compare/` → `.agents/skills/gb-compare/`
    - `.claude/skills/gb-new-assignment/` → `.agents/skills/gb-new-assignment/`
    - `.claude/skills/gb-pipeline/` → `.agents/skills/gb-pipeline/`
    - `.claude/skills/gb-sync/` → `.agents/skills/gb-sync/`
  - These 4 skills already have proper SKILL.md files with YAML frontmatter — no format changes needed
  - Move entire directories (SKILL.md + any supporting files)
  - After moving, verify gb-pipeline's references to gb-compare, gb-new-assignment, and gb-sync still work (they use `load_skills=["gb-compare"]` etc. which is name-based, not path-based)
  - Also check gb-sync (1193 lines) for any hardcoded `.claude/skills/` paths and update if found

  **Must NOT do**:
  - Do not modify skill content (workflow logic, error handling, etc.)
  - Do not modify the Windows paths in gb-* skills (`C:\Users\shuff\grade-cloning\temp\`) — these are Playwriter-context paths used inside Chrome on a Windows machine, not local file paths
  - Do not split gb-sync into smaller files (future project)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 13)
  - **Blocks**: Tasks 14, 15, 16, F1-F4
  - **Blocked By**: Task 7 (path updates must complete before migration)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-pipeline/SKILL.md:36-101` — contains `load_skills=["gb-compare"]`, `load_skills=["gb-new-assignment"]`, `load_skills=["gb-sync"]` references (verify these are name-based)
  - `.agents/skills/find-skills/SKILL.md` — existing skill in .agents/ as proof the directory is discoverable

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 gb-* skills migrated
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/gb-compare/SKILL.md .agents/skills/gb-new-assignment/SKILL.md .agents/skills/gb-pipeline/SKILL.md .agents/skills/gb-sync/SKILL.md
      2. Assert: all 4 files exist
      3. Run: ls .claude/skills/gb-compare/ .claude/skills/gb-new-assignment/ .claude/skills/gb-pipeline/ .claude/skills/gb-sync/ 2>/dev/null
      4. Assert: none exist (all moved)
    Expected Result: Skills exist in .agents/, not in .claude/
    Evidence: .sisyphus/evidence/task-11-gb-migration.txt

  Scenario: Cross-references resolve
    Tool: Bash
    Steps:
      1. Run: grep "load_skills" .agents/skills/gb-pipeline/SKILL.md
      2. Assert: references gb-compare, gb-new-assignment, gb-sync by NAME
      3. Run: grep -c "\.claude/skills/" .agents/skills/gb-pipeline/SKILL.md .agents/skills/gb-sync/SKILL.md
      4. Assert: 0 (no hardcoded paths)
    Expected Result: Name-based references, no hardcoded paths
    Evidence: .sisyphus/evidence/task-11-gb-cross-refs.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(skills): migrate gb-compare, gb-new-assignment, gb-pipeline, gb-sync to .agents/skills/`
  - Files: `.agents/skills/gb-compare/`, `.agents/skills/gb-new-assignment/`, `.agents/skills/gb-pipeline/`, `.agents/skills/gb-sync/`

- [ ] 12. Migrate mom-* Skills to .agents/skills/

  **What to do**:
  - Move 6 MOM skills from `.claude/skills/` to `.agents/skills/`:
    - `.claude/skills/mom-fact-finder/` → `.agents/skills/mom-fact-finder/`
    - `.claude/skills/mom-frq/` → `.agents/skills/mom-frq/`
    - `.claude/skills/mom-lib-map/` → `.agents/skills/mom-lib-map/` (includes references/ subdirectory from Task 6)
    - `.claude/skills/mom-page-map/` → `.agents/skills/mom-page-map/`
    - `.claude/skills/mom-patterns/` → `.agents/skills/mom-patterns/`
    - `.claude/skills/mom-style-guide/` → `.agents/skills/mom-style-guide/`
  - All 6 should already have SKILL.md with YAML frontmatter (from Tasks 4-5)
  - Move entire directories including all supporting files

  **Must NOT do**:
  - Do not modify skill content
  - Do not move any .claude/commands/ files (those stay)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 13)
  - **Blocks**: Tasks 14, 15, 16, F1-F4
  - **Blocked By**: Tasks 4, 5, 6, 7, 8 (all format + path changes must complete first)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-fact-finder/SKILL.md` — references mom-patterns and mom-lib-map by skill name (after Task 7 updates)
  - `.claude/skills/mom-lib-map/SKILL.md` + `references/` — includes the restructured subdirectory from Task 6

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 6 mom-* skills migrated with supporting files
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/mom-fact-finder/SKILL.md .agents/skills/mom-frq/SKILL.md .agents/skills/mom-lib-map/SKILL.md .agents/skills/mom-page-map/SKILL.md .agents/skills/mom-patterns/SKILL.md .agents/skills/mom-style-guide/SKILL.md
      2. Assert: all 6 files exist
      3. Run: ls .agents/skills/mom-lib-map/references/ | wc -l
      4. Assert: output is 16 (all subject files moved with parent)
      5. Run: ls .claude/skills/mom-* 2>/dev/null
      6. Assert: none exist (all moved)
    Expected Result: All mom-* skills in .agents/, none in .claude/
    Evidence: .sisyphus/evidence/task-12-mom-migration.txt

  Scenario: No hardcoded paths survived migration
    Tool: Bash
    Steps:
      1. Run: grep -r "\.claude/skills/" .agents/skills/mom-*/
      2. Assert: 0 matches
    Expected Result: Clean of .claude/ path references
    Evidence: .sisyphus/evidence/task-12-no-hardcoded-paths.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(skills): migrate mom-fact-finder, mom-frq, mom-lib-map, mom-page-map, mom-patterns, mom-style-guide to .agents/skills/`
  - Files: `.agents/skills/mom-*/`

- [ ] 13. Migrate grade-show-work + Clean Up .claude/skills/

  **What to do**:
  - Move `.claude/skills/grade-show-work/` → `.agents/skills/grade-show-work/` (SKILL.md was renamed in Task 3)
  - After ALL skills are migrated (Tasks 11, 12, 13), verify `.claude/skills/` is empty
  - Remove the empty `.claude/skills/` directory
  - Also remove `.claude/plans/CLAUDE.md` if it's empty after Task 1 cleanup (claude-mem artifact removed)
  - Keep `.claude/commands/` intact (grade.md, grade-selectors.md, grade-show-work-selectors.md, CLAUDE.md stay there)
  - Keep `.claude/settings.local.json` (needed for hook config in Task 15)

  **Must NOT do**:
  - Do not remove `.claude/commands/` or `.claude/settings.local.json`
  - Do not modify grade-show-work content
  - Do not remove `.claude/` directory itself (commands and settings still live there)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12)
  - **Blocks**: Tasks 14, 15, 16, F1-F4
  - **Blocked By**: Tasks 2, 3 (find-skills removed, grade-show-work renamed)

  **References**:

  **Pattern References**:
  - `.claude/skills/grade-show-work/SKILL.md` — the file to move (renamed from CLAUDE.md in Task 3)
  - `.claude/commands/` — directory that stays put (4 files)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: grade-show-work migrated and .claude/skills/ cleaned up
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/grade-show-work/SKILL.md
      2. Assert: file exists
      3. Run: ls .claude/skills/ 2>/dev/null
      4. Assert: directory does not exist (removed)
      5. Run: ls .claude/commands/grade.md
      6. Assert: commands directory still intact
    Expected Result: Skill migrated, .claude/skills/ gone, commands preserved
    Evidence: .sisyphus/evidence/task-13-final-cleanup.txt

  Scenario: Total skill count in .agents/skills/
    Tool: Bash
    Steps:
      1. Run: ls -d .agents/skills/*/SKILL.md | wc -l
      2. Assert: output is 12 (11 migrated + find-skills already there)
    Expected Result: 12 skills in .agents/skills/
    Evidence: .sisyphus/evidence/task-13-skill-count.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(skills): migrate grade-show-work, remove empty .claude/skills/`
  - Files: `.agents/skills/grade-show-work/`, `.claude/skills/` (removed)

- [ ] 14. Create skill-creator Meta-Skill

  **What to do**:
  - Create `.agents/skills/skill-creator/SKILL.md` — a meta-skill that helps agents create new skills
  - This is the "teach Claude to teach itself" mechanism
  - YAML frontmatter: `name: skill-creator`, `description: Use when creating a new agent skill — scaffolds a properly formatted SKILL.md with YAML frontmatter, description, workflow steps, guardrails, and QA scenarios. Triggered when an agent suggests a new skill or the user asks to create one.`
  - Skill content should cover:
    1. **When to invoke**: User says "create a skill for X", or agent suggests "I noticed I keep doing X, should I create a skill?"
    2. **Interview step**: Ask user for: skill name, what it does, when to trigger, what tools it uses
    3. **Template generation**: Generate SKILL.md following the gb-compare format (the best-structured existing skill):
       - YAML frontmatter (name, description)
       - Prerequisites
       - When to Use / When NOT to Use
       - Workflow Steps (numbered phases)
       - Guardrails (Must NOT do)
       - Error Handling table
       - QA Scenarios
    4. **Placement**: New skills go in `.agents/skills/{skill-name}/SKILL.md`
    5. **Optional knowledge base**: If the skill domain benefits from accumulated knowledge, create a `knowledge.md` file following the mom-patterns model (size cap, compression policy, entry format)
  - Reference Anthropic's official skill-creator at `github.com/anthropics/skills` for structure inspiration
  - Keep the meta-skill itself under 200 lines

  **Must NOT do**:
  - Do not auto-create skills without user confirmation
  - Do not create overly complex skill templates — keep it simple
  - Do not include an eval/testing framework (future project)
  - Do not exceed 200 lines for the meta-skill itself

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 15, 16)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 11, 12, 13 (migration complete, .agents/skills/ is canonical)

  **References**:

  **Pattern References**:
  - `.agents/skills/gb-compare/SKILL.md` — BEST example of skill structure (348 lines: YAML frontmatter, prerequisites, phases, safety rules, error handling, troubleshooting)
  - `.agents/skills/grade-show-work/SKILL.md` — another well-structured example (417 lines: guardrails section, selector reference, state management)
  - `.agents/skills/mom-patterns/SKILL.md` — model for auto-populated knowledge bases (size cap, compression, entry format template)

  **External References**:
  - Anthropic official skill-creator: `https://github.com/anthropics/skills/tree/main/skills/skill-creator`
  - Liam T Bilich article: "Automating Agency: Building a Meta-Skill in Claude Code" — meta-skill design patterns

  **WHY Each Reference Matters**:
  - gb-compare shows the IDEAL skill structure the meta-skill should template from
  - mom-patterns shows how to structure optional knowledge.md files
  - Anthropic's skill-creator provides proven patterns for the scaffolding workflow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: skill-creator SKILL.md exists with proper format
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/skill-creator/SKILL.md
      2. Assert: file exists
      3. Run: head -4 .agents/skills/skill-creator/SKILL.md
      4. Assert: YAML frontmatter with name: skill-creator
      5. Run: wc -l .agents/skills/skill-creator/SKILL.md
      6. Assert: ≤ 200 lines
    Expected Result: Well-formatted meta-skill within size limits
    Evidence: .sisyphus/evidence/task-14-skill-creator.txt

  Scenario: skill-creator contains required sections
    Tool: Bash
    Steps:
      1. Run: grep -c "## " .agents/skills/skill-creator/SKILL.md
      2. Assert: ≥ 4 sections (When to Use, Interview, Template, Placement)
      3. Run: grep -ci "frontmatter\|YAML" .agents/skills/skill-creator/SKILL.md
      4. Assert: > 0 (teaches agents about proper skill format)
      5. Run: grep -ci "knowledge.md\|knowledge base" .agents/skills/skill-creator/SKILL.md
      6. Assert: > 0 (covers optional knowledge base creation)
    Expected Result: Covers all required aspects of skill creation
    Evidence: .sisyphus/evidence/task-14-skill-creator-content.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(skills): create skill-creator meta-skill for agent-suggested skill generation`
  - Files: `.agents/skills/skill-creator/SKILL.md`

- [ ] 15. Create Session Reflector Skill + SessionEnd Hook

  **What to do**:
  - **Part A: Create the skill** — `.agents/skills/session-reflector/SKILL.md`
    - YAML frontmatter: `name: session-reflector`, `description: Captures session learnings and insights into the memory system. Triggered automatically via SessionEnd hook or manually when an agent wants to record what it learned.`
    - The skill instructs agents to:
      1. Review what was accomplished this session
      2. Identify patterns (repeated tasks, common errors, user corrections)
      3. Write a concise reflection (≤50 lines) to `.agents/memory/pending/{date}-{slug}.md`
      4. Format: `## Session Reflection — {date}`, `### What was done`, `### Patterns noticed`, `### Corrections received`, `### Skill creation suggestions`
      5. Mark as "pending review" — user reviews next session
    - Include instructions for checking previous reflections at session start: "Read `.agents/memory/pending/` for unreviewed reflections. If the user has not reviewed them, mention them."
  - **Part B: Configure the SessionEnd hook** — update `.claude/settings.local.json`
    - Read the current settings.local.json file first (it exists)
    - Add a hook that triggers a prompt-based reflection at session end:
      ```json
      {
        "hooks": {
          "SessionEnd": [{
            "type": "prompt",
            "prompt": "Before ending, check if anything notable happened this session. If you graded students, synced grades, created questions, or did any task that produced insights worth remembering, load the session-reflector skill and write a brief reflection to .agents/memory/pending/. If this was a trivial session (just a question, quick fix), skip the reflection."
          }]
        }
      }
      ```
    - Merge with existing settings (don't overwrite other settings)

  **Must NOT do**:
  - Do not create hooks for any event other than SessionEnd
  - Do not auto-approve reflections (they go to pending/ for user review)
  - Do not write more than 50 lines per reflection
  - Do not create reflections for trivial sessions (the hook prompt includes this guard)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 16)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 11, 12, 13 (migration complete)

  **References**:

  **Pattern References**:
  - `.claude/settings.local.json` — existing settings file (read before modifying to merge)
  - `.agents/skills/mom-patterns/SKILL.md` — model for how accumulated knowledge is structured (size caps, entry format)
  - `.claude/commands/grade.md:154-170` — example of state file management (grade-state.json pattern)

  **External References**:
  - Claude Code hook system documentation: 22 hook events, SessionEnd is one
  - Hook types: command, http, prompt, agent — we use "prompt" type

  **WHY Each Reference Matters**:
  - settings.local.json must be READ first to avoid overwriting existing config
  - grade.md's state file pattern shows how to structure persistent files with timestamps
  - mom-patterns shows how to cap and compress accumulated knowledge

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: session-reflector SKILL.md exists
    Tool: Bash
    Steps:
      1. Run: ls .agents/skills/session-reflector/SKILL.md
      2. Assert: file exists
      3. Run: head -4 .agents/skills/session-reflector/SKILL.md
      4. Assert: YAML frontmatter with name: session-reflector
    Expected Result: Properly formatted skill file
    Evidence: .sisyphus/evidence/task-15-session-reflector.txt

  Scenario: SessionEnd hook configured
    Tool: Bash
    Steps:
      1. Run: cat .claude/settings.local.json
      2. Assert: contains "SessionEnd" key
      3. Assert: contains "session-reflector" reference
      4. Assert: valid JSON (no syntax errors)
    Expected Result: Hook properly configured in settings
    Evidence: .sisyphus/evidence/task-15-hook-config.txt

  Scenario: pending/ directory exists
    Tool: Bash
    Steps:
      1. Run: ls -d .agents/memory/pending/
      2. Assert: directory exists
    Expected Result: Directory ready for reflection files
    Evidence: .sisyphus/evidence/task-15-pending-dir.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(skills): create session-reflector skill and SessionEnd hook for persistent learning`
  - Files: `.agents/skills/session-reflector/SKILL.md`, `.claude/settings.local.json`

- [ ] 16. Create Memory Infrastructure

  **What to do**:
  - Create the `.agents/memory/` directory structure:
    ```
    .agents/memory/
    ├── README.md              # Explains the memory system (for agents AND humans)
    ├── pending/               # Session reflections awaiting user review
    └── approved/              # User-reviewed and approved learnings
    ```
  - **README.md** (~50 lines) should explain:
    1. What this directory is for (persistent agent memory across sessions)
    2. How pending/ works (reflections written here by session-reflector, user reviews next session)
    3. How approved/ works (user moves accepted reflections here, or agent summarizes and moves after approval)
    4. Size management: each reflection ≤50 lines, purge approved/ entries older than 90 days
    5. How agents should USE this: "At session start, read approved/ files for context. Check pending/ for unreviewed items."
    6. Format for reflection files: `{YYYY-MM-DD}-{slug}.md`
  - Create empty `.gitkeep` files in pending/ and approved/ so the directories are tracked by git
  - This is the "central knowledge base" layer of the memory architecture

  **Must NOT do**:
  - Do not pre-populate with fake reflections
  - Do not create complex subdirectory hierarchies (keep it flat within pending/ and approved/)
  - Do not create a database, JSON index, or any non-markdown infrastructure
  - Do not exceed 50 lines for README.md

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 11, 12, 13 (migration complete, .agents/ is canonical)

  **References**:

  **Pattern References**:
  - `.agents/skills/mom-patterns/SKILL.md:19-26` — size policy section (model for memory management rules)
  - `.claude/commands/grade.md:154-170` — state file management pattern (timestamps, per-URL keys)

  **WHY Each Reference Matters**:
  - mom-patterns' size policy shows how to cap, compress, and manage growing knowledge files
  - grade.md shows practical timestamp and key management for state files

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Memory directory structure exists
    Tool: Bash
    Steps:
      1. Run: ls .agents/memory/README.md
      2. Assert: file exists
      3. Run: ls -d .agents/memory/pending/ .agents/memory/approved/
      4. Assert: both directories exist
      5. Run: wc -l .agents/memory/README.md
      6. Assert: ≤ 50 lines
    Expected Result: Clean directory structure with README
    Evidence: .sisyphus/evidence/task-16-memory-infrastructure.txt

  Scenario: README covers required topics
    Tool: Bash
    Steps:
      1. Run: grep -ci "pending" .agents/memory/README.md
      2. Assert: > 0
      3. Run: grep -ci "approved" .agents/memory/README.md
      4. Assert: > 0
      5. Run: grep -ci "session" .agents/memory/README.md
      6. Assert: > 0
    Expected Result: README explains both directories and session workflow
    Evidence: .sisyphus/evidence/task-16-readme-content.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(memory): create persistent agent memory infrastructure with pending/approved workflow`
  - Files: `.agents/memory/README.md`, `.agents/memory/pending/.gitkeep`, `.agents/memory/approved/.gitkeep`

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
