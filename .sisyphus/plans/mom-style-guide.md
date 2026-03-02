# MOM Style Guide — Design Philosophy & Conventions Skill

## TL;DR

> **Quick Summary**: Create a standalone MOM style guide skill file that codifies the implicit design philosophy, voice/tone conventions, and AI behavioral guardrails extracted from 33 existing question files — ensuring any AI agent or human produces output indistinguishable from existing questions.
> 
> **Deliverables**:
> - `.claude/skills/mom-style-guide/CLAUDE.md` — comprehensive design philosophy guide (~250-300 lines)
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO — 2 sequential tasks
> **Critical Path**: Task 1 (write guide) → Task 2 (QA verification)

---

## Context

### Original Request
User wants a comprehensive MOM (MyOpenMath) style guide that covers question writing voice/tone, rubric design philosophy, randomization strategy, AI behavioral guardrails, visual consistency, and naming conventions. The guide should be a standalone complement to existing technical skills, not a replacement.

### Interview Summary
**Key Discussions**:
- **Scope**: Design philosophy and conventions only — NOT code syntax, NOT assessment-level design
- **Location**: Project-level skill in the O.G.R.E repo (`.claude/skills/mom-style-guide/CLAUDE.md`)
- **Subjects**: Multiple math courses (stats, algebra, calculus, linear algebra)
- **Relationship**: Standalone complement — loads alongside `mom-frq`, `mom-matrix-inverse`, etc.
- **Voice**: Friendly, warm, concise, student-to-teacher language. No em dashes, no hedging, no overly formal language
- **Rubric**: Always 10 points total, neutral student items, specific instructor targets, 2-4 categories per question
- **Randomization**: FRQ = 3 context scenarios; algorithm-based = random number generators with construct-from-solution
- **AI guardrails**: Principles + rules, defaulting to very strict where ambiguity exists

**Research Findings**:
- Analyzed 33 question files (26 FRQ + 6 matrix + 1 draw), 3 AGENTS.md files, 3 skill files
- Confirmed consistent patterns: identical CSS blocks, `$r_` narrative variables, construct-from-solution for matrix, parallel arrays for FRQ
- Project-level `mom-frq/CLAUDE.md` (1043 lines) already covers implementation reference — style guide must NOT duplicate this
- User-level `mom-frq/SKILL.md` (448 lines) covers workflow — style guide must NOT duplicate this either

### Metis Review
**Identified Gaps** (addressed in plan):
- **Duplication risk**: Style guide must draw clear boundary with existing `mom-frq/CLAUDE.md` (1043 lines) which already contains CSS, templates, anti-patterns. Addressed: guide is philosophy-only with "see X for details" cross-references, no code blocks >5 lines
- **Conflicting directives**: "Always 10 points" vs SKILL.md's "default 10 unless specified." Addressed: guide establishes 10 points as hard default, overridable only by explicit user request
- **Draw question type**: Exists but follows neither FRQ nor matrix pattern. Addressed: guide includes "for question types not covered here" fallback section
- **Context window impact**: Loading guide + reference + skill = 1800+ lines. Addressed: guide capped at 300 lines, philosophy only
- **Cross-repo awareness**: Guide lives in O.G.R.E, questions live in mom repo. Addressed: guide uses cross-references, not absolute paths to example files
- **Loading trigger**: Guide needs clear description of when to load it. Addressed: companion document, agents loading any `mom-*` skill should also load this

---

## Work Objectives

### Core Objective
Create a single markdown file (`.claude/skills/mom-style-guide/CLAUDE.md`) under 300 lines that captures the implicit design philosophy present across 33 existing MOM question files, making the conventions explicit so any AI agent produces consistent, high-quality output.

### Concrete Deliverables
- `.claude/skills/mom-style-guide/CLAUDE.md` — the complete style guide

### Definition of Done
- [ ] File exists at `.claude/skills/mom-style-guide/CLAUDE.md`
- [ ] Contains all 6 required sections (voice, rubric, randomization, guardrails, visual, naming)
- [ ] Under 300 lines
- [ ] Zero em dashes in the file
- [ ] Cross-references `mom-frq` by name at least 2 times
- [ ] Contains at least 2 explicit "does NOT cover" exclusion statements
- [ ] No verbatim CSS block duplication from `mom-frq/CLAUDE.md`
- [ ] No code blocks longer than 5 lines

### Must Have
- "Relationship to Existing Skills" section at the top mapping what each companion file covers
- All 6 design philosophy sections: voice/tone, rubric philosophy, randomization strategy, AI guardrails, visual consistency, naming conventions
- Explicit hierarchy statement: style guide = philosophy, SKILL.md = workflow, CLAUDE.md = reference
- "Does NOT cover" exclusion statements (at least 2, preferably per-section)
- Cross-references to companion skills instead of duplicating content
- AI guardrails separated by domain: structural, voice, and safety
- "Friendly, warm, concise" as the core voice principle
- "Always 10 points" as hard rubric default
- "3 contexts for FRQ, random numbers for algorithm-based" as randomization rules
- Color palette documentation (hex values + purpose, NOT full CSS blocks)
- File naming conventions for all question types

### Must NOT Have (Guardrails)
- Must NOT reproduce `$css_block` verbatim (point to `mom-frq/CLAUDE.md` Section 11 instead)
- Must NOT include syntax reference or macro documentation (that's `mom-frq/CLAUDE.md`)
- Must NOT include workflow instructions — batch mode, manifest management, file output paths (that's `mom-frq/SKILL.md`)
- Must NOT include DOM selectors or browser automation patterns (that's `mom-page-map/CLAUDE.md`)
- Must NOT include assessment-level design (progression, coverage, time estimates)
- Must NOT use em dashes (`—`, `&mdash;`, `&#8212;`) anywhere in the file
- Must NOT contain code blocks longer than 5 lines (brief examples OK, full templates NOT)
- Must NOT exceed 300 lines total
- Must NOT modify any existing skill files

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (markdown file, no unit test framework)
- **Automated tests**: QA verification via grep/wc commands
- **Framework**: Bash (grep, wc, test)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **File verification**: Use Bash — grep, wc, test commands to validate content structure
- **Duplication check**: Use Bash — grep for patterns that should NOT appear in the style guide

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — write the guide):
└── Task 1: Write .claude/skills/mom-style-guide/CLAUDE.md [writing]

Wave 2 (After Wave 1 — verify):
└── Task 2: Run QA acceptance checks and fix any failures [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Content quality review (unspecified-high)
├── Task F3: Duplication and consistency check (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → F1-F4
Max Concurrent: 4 (Wave FINAL only)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2 | 1 |
| 2 | 1 | F1-F4 | 2 |
| F1-F4 | 2 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `writing` (+ `mom-frq` skill for companion reference)
- **Wave 2**: **1 task** — T2 → `quick`
- **Wave FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Write the MOM Style Guide

  **What to do**:
  - Create the directory `.claude/skills/mom-style-guide/` if it doesn't exist
  - Write `.claude/skills/mom-style-guide/CLAUDE.md` — a comprehensive design philosophy guide under 300 lines
  - The file must contain these sections (in order):
    1. **Title + Overview**: "MOM Style Guide — Design Philosophy & Conventions." Brief description of purpose, when to load, relationship to companion skills
    2. **Relationship to Existing Skills**: Table mapping each companion file (mom-frq/CLAUDE.md, mom-frq/SKILL.md, mom-matrix-inverse/SKILL.md, mom-page-map/CLAUDE.md) to its domain. Establish hierarchy: this guide = philosophy, SKILL.md = workflow, CLAUDE.md = reference, AGENTS.md = repo conventions
    3. **Voice & Tone**: Core principle: friendly, warm, concise, student-to-teacher language. Rules: no em dashes (use commas, periods, semicolons, or restructure), no hedging ("It is important to note that..."), no overly formal academic language, no repetitive structure (vary sentence length, vary rubric item counts per category). Question prompts use second person ("Explain in your own words..."). Rubric items are action-oriented verbs ("Describe...", "Identify...", "Explain..."). Model narratives are instructor-quality but approachable, using `<b>bold</b>` for key concepts. Write like a good instructor talking to a colleague, not a textbook
    4. **Rubric Design Philosophy**: Always 10 points total (overridable only by explicit user request). 2-4 categories per question based on conceptual weight — do NOT default to a fixed number. Each category has 1-3 checklist items — vary based on complexity. Student rubric items are NEUTRAL (describe what to address, NOT the correct answer. Good: "Describe the sampling method." Bad: "Take many random samples."). Instructor targets are SPECIFIC (exact correct answer for grading). Points distributed by conceptual importance, not evenly. Model narrative: 2-5 sentences, covers all categories, uses `$r_` prefix variables composed into `$sample_narrative` with `<b>bold</b>` key phrases. See `mom-frq/SKILL.md` for the exact template pattern
    5. **Randomization Strategy**: FRQ questions: minimum 3 meaningfully different context scenarios in `$contexts` array, indexed by `$i`, with parallel arrays for ALL context-specific values. Algorithm-based questions (matrix, draw, numeric): use MOM randomizers (`rand`, `diffrands`, `nonzerodiffrands`, etc.) with construct-from-solution pattern (generate answer first, derive question from it). NEVER hardcode scenario text, numerical values, or data that appears in the question. See `mom-frq/CLAUDE.md` Section 4 for randomizer reference
    6. **AI Behavioral Guardrails**: Three domains: (a) Structural: don't add features not requested, don't over-abstract, don't create extra files. (b) Voice: follow voice/tone rules above, don't use em dashes, don't write AI-sounding prose (hedging, excessive formality, "It's worth noting..."). (c) Safety: NEVER invent MOM functions — if unsure, check `mom-frq/CLAUDE.md` reference first. NEVER use `<?php ?>` tags, `echo`, `print`, or standard PHP functions. When uncertain, default to strict: ask the user rather than improvise. Every generated question must follow the established template pattern for its type (FRQ scaffold, matrix scaffold, etc.)
    7. **Visual Consistency**: Document the shared color palette with hex values and purpose (NOT the full CSS): `#f0f4ff` = collapsible header background, `#e8f5e9` = correct answer highlight / model response, `#4CAF50` = accent bar / highlight border, `#fff9ea` = alternating row tint, `#ccc` = border/separator, `#f8f8f8` = summary background, `#fafafa` = content area. Font: always Arial. Student-facing text: `font-size:medium; line-height:1.6`. Tables: `border-radius:8px` rounded corners, `border-collapse:separate`. See `mom-frq/CLAUDE.md` Section 11 for the full `$css_block` implementation. Matrix solution guides use inline CSS following same palette but without `$css_block`
    8. **Naming Conventions**: Files: `q{N}-{kebab-slug}.php` for FRQ, `matrix-{size}-{type}.php` for matrix. Variables: `$r_` prefix for narrative model answer components, `$contexts`/`$topic` for scenario arrays, `$sample_narrative` for composed model response. Comments: `// === SECTION NAME ===` for major sections, `/* ---------- N. Subsection ---------- */` for numbered subsections within Common Control. File headers: `// === NAME - DESCRIPTION: Title - Description sentence. ===`

  **Must NOT do**:
  - Do NOT reproduce `$css_block` verbatim — reference `mom-frq/CLAUDE.md` Section 11
  - Do NOT include code blocks longer than 5 lines
  - Do NOT include syntax/macro reference material
  - Do NOT include workflow instructions
  - Do NOT modify any existing skill file

  **Source material to READ (not modify) while writing:**
  - `.claude/skills/mom-frq/CLAUDE.md` — project-level reference (1043 lines). Sections 11 (FRQ pattern), 12 (worked examples), 13 (pitfalls) are especially relevant
  - `~/.claude/skills/mom-frq/SKILL.md` — user-level workflow (448 lines). Rubric design rules, voice rules, template pattern
  - `~/.claude/skills/mom-matrix-inverse/SKILL.md` — matrix question skill (260 lines). Solution guide pattern, anti-patterns
  - Real FRQ examples: `C:/Users/shuff/Documents/GitHub/mom/mom/questions/frq/ch6-questions/q1-single-proportion-hypothesis-test.php` (canonical FRQ)
  - Real matrix examples: `C:/Users/shuff/Documents/GitHub/mom/mom/questions/matrix/matrix-2x2-rref.php` (canonical matrix)
  - FRQ template: `C:/Users/shuff/Documents/GitHub/mom/mom/free-reponse-template.php`
  - AGENTS.md: `C:/Users/shuff/Documents/GitHub/mom/AGENTS.md`, `C:/Users/shuff/Documents/GitHub/mom/mom/questions/frq/AGENTS.md`, `C:/Users/shuff/Documents/GitHub/mom/mom/questions/matrix/AGENTS.md`

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: This is a documentation/prose task requiring concise, well-structured technical writing. Not a code implementation task.
  - **Skills**: [`mom-frq`]
    - `mom-frq`: Agent needs to see the existing FRQ reference to know what's already documented and write philosophy that complements (not duplicates) it
  - **Skills Evaluated but Omitted**:
    - `mom-matrix-inverse`: Agent should READ this file (path provided), but doesn't need skill loaded since the guide isn't writing matrix questions
    - `playwright`: Not a browser task
    - `mom-page-map`: Not relevant — guide doesn't cover browser automation

  **Parallelization**:
  - **Can Run In Parallel**: NO (single task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing conventions to codify):
  - `.claude/skills/mom-frq/CLAUDE.md` — Sections 11-13: FRQ template pattern, worked examples, common pitfalls. Extract the implicit design philosophy from these implementation patterns
  - `~/.claude/skills/mom-frq/SKILL.md` — Lines 110-120: Rubric generation rules, voice rules, "no em dashes" rule. These are the closest existing thing to a style guide — expand into full philosophy
  - `~/.claude/skills/mom-matrix-inverse/SKILL.md` — Lines 114-160: Solution guide structure, anti-patterns. Different visual pattern from FRQ — guide must accommodate both

  **Convention References** (existing docs to NOT duplicate):
  - `C:/Users/shuff/Documents/GitHub/mom/AGENTS.md` — Lines 69-100: Existing project conventions. Guide should align with these, not contradict
  - `C:/Users/shuff/Documents/GitHub/mom/mom/questions/frq/AGENTS.md` — Lines 84-98: FRQ anti-patterns and randomization rules. Already documented — guide should reference, not repeat

  **Real Question References** (exemplars of the conventions):
  - `C:/Users/shuff/Documents/GitHub/mom/mom/questions/frq/ch6-questions/q1-single-proportion-hypothesis-test.php` — Canonical FRQ: 3 contexts, parallel arrays, `$r_` variables, 10 points across 3 categories
  - `C:/Users/shuff/Documents/GitHub/mom/mom/questions/frq/butte-stats-week1-5-questions/q5-interpreting-bimodal-data.php` — Advanced FRQ: randomized numerical values within contexts, richer parallel arrays
  - `C:/Users/shuff/Documents/GitHub/mom/mom/questions/matrix/matrix-2x2-rref.php` — Canonical matrix: construct-from-solution, step-by-step solution guide, inline CSS
  - `C:/Users/shuff/Documents/GitHub/mom/mom/free-reponse-template.php` — The canonical FRQ template file that all FRQs are based on

  **WHY Each Reference Matters**:
  - The FRQ template shows the EXACT structural pattern the guide codifies as philosophy
  - Comparing q1 (simple) vs q5 (advanced) reveals how conventions scale with complexity
  - The matrix RREF file shows how conventions adapt for non-FRQ question types
  - The AGENTS.md files show what's already documented at the repo level — avoid duplication

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File exists and loads correctly
    Tool: Bash
    Preconditions: Task 1 write is complete
    Steps:
      1. Run: test -f ".claude/skills/mom-style-guide/CLAUDE.md" && echo "PASS" || echo "FAIL"
    Expected Result: Output is "PASS"
    Evidence: .sisyphus/evidence/task-1-file-exists.txt

  Scenario: All 6 required sections present
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: grep -ciE "(voice|tone)" ".claude/skills/mom-style-guide/CLAUDE.md"
      2. Run: grep -ci "rubric" ".claude/skills/mom-style-guide/CLAUDE.md"
      3. Run: grep -ciE "random" ".claude/skills/mom-style-guide/CLAUDE.md"
      4. Run: grep -ciE "(guardrail|behavior)" ".claude/skills/mom-style-guide/CLAUDE.md"
      5. Run: grep -ciE "(visual|consisten)" ".claude/skills/mom-style-guide/CLAUDE.md"
      6. Run: grep -ciE "naming" ".claude/skills/mom-style-guide/CLAUDE.md"
    Expected Result: Each returns >= 1
    Evidence: .sisyphus/evidence/task-1-sections-check.txt

  Scenario: No em dashes in the file
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: grep -cP "\x{2014}" ".claude/skills/mom-style-guide/CLAUDE.md" || echo "0"
      2. Run: grep -c "&mdash;" ".claude/skills/mom-style-guide/CLAUDE.md" || echo "0"
      3. Run: grep -c "&#8212;" ".claude/skills/mom-style-guide/CLAUDE.md" || echo "0"
    Expected Result: All return 0
    Failure Indicators: Any grep returns > 0
    Evidence: .sisyphus/evidence/task-1-no-emdash.txt

  Scenario: Under 300 lines
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: wc -l ".claude/skills/mom-style-guide/CLAUDE.md"
    Expected Result: Line count <= 300
    Failure Indicators: Line count > 300
    Evidence: .sisyphus/evidence/task-1-line-count.txt

  Scenario: Cross-references to companion skills
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: grep -c "mom-frq" ".claude/skills/mom-style-guide/CLAUDE.md"
    Expected Result: Count >= 2
    Failure Indicators: Count < 2
    Evidence: .sisyphus/evidence/task-1-crossrefs.txt

  Scenario: No verbatim CSS duplication
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: grep -c "rubric-container {" ".claude/skills/mom-style-guide/CLAUDE.md"
    Expected Result: Returns 0
    Failure Indicators: Returns > 0 (CSS block was duplicated)
    Evidence: .sisyphus/evidence/task-1-no-css-dupe.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-1-{scenario-slug}.txt
  - [ ] Terminal output for each QA check

  **Commit**: YES
  - Message: `feat(skills): add MOM style guide for design philosophy and conventions`
  - Files: `.claude/skills/mom-style-guide/CLAUDE.md`
  - Pre-commit: All 6 QA scenarios pass

---

- [ ] 2. Run Full QA Verification Suite

  **What to do**:
  - Run all 6 QA acceptance scenarios from Task 1 independently (re-verify, don't trust Task 1's self-check)
  - Additionally check: exclusion statements present (grep for "does NOT" or "not in scope" — expect >= 2)
  - Additionally check: no code blocks longer than 5 lines
  - If ANY check fails, fix the issue in the file and re-run all checks
  - Save all results as evidence

  **Must NOT do**:
  - Do NOT change the philosophical content — only fix structural issues (length, missing sections, em dashes)
  - Do NOT add new sections beyond the 6 agreed upon

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file verification via grep/wc commands. Trivial execution.
  - **Skills**: []
    - No specialized skills needed for file verification
  - **Skills Evaluated but Omitted**:
    - All skills omitted — this is bash-only verification work

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **File to verify**:
  - `.claude/skills/mom-style-guide/CLAUDE.md` — the file written in Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full verification suite passes
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run all 6 scenarios from Task 1 acceptance criteria
      2. Run: grep -cE "does [Nn][Oo][Tt]|not in scope|out of scope" ".claude/skills/mom-style-guide/CLAUDE.md" — expect >= 2
      3. Verify no code blocks > 5 lines (count lines between ``` markers)
      4. If any failure: fix the specific issue, re-run all checks
    Expected Result: All checks pass (8 total)
    Failure Indicators: Any check returns unexpected value
    Evidence: .sisyphus/evidence/task-2-full-qa.txt

  Scenario: Verify guide follows its own voice rules
    Tool: Bash
    Preconditions: File passes structural checks
    Steps:
      1. Read the file content
      2. Check for hedging language patterns: grep -ciE "it is (important|worth|necessary) to" ".claude/skills/mom-style-guide/CLAUDE.md"
      3. Check for AI-slop filler: grep -ciE "in (this|the) (section|guide|document)" ".claude/skills/mom-style-guide/CLAUDE.md"
    Expected Result: Hedging count = 0, filler count <= 2
    Evidence: .sisyphus/evidence/task-2-voice-check.txt
  ```

  **Commit**: NO (groups with Task 1 commit)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists in the style guide file. For each "Must NOT Have": search the file for forbidden patterns — reject with line reference if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Content Quality Review** — `unspecified-high`
  Read the style guide file end-to-end. Check for: vague instructions that leave room for interpretation, missing cross-references to companion skills, internal contradictions (e.g., "be concise" alongside verbose prose), tone consistency (does the guide itself follow its own voice rules?). Verify each of the 6 sections contains actionable rules, not just vague principles.
  Output: `Sections [N/6 actionable] | Cross-refs [N found] | Contradictions [N found] | Tone [PASS/FAIL] | VERDICT`

- [ ] F3. **Duplication and Consistency Check** — `unspecified-high`
  Compare the style guide against `mom-frq/CLAUDE.md`, `mom-frq/SKILL.md`, and `mom-matrix-inverse/SKILL.md`. Identify any content that appears in BOTH the style guide AND a companion file (duplication). Verify the style guide's rules don't contradict companion file rules. Check that the hierarchy (philosophy > workflow > reference) is maintained.
  Output: `Duplicated content [N instances] | Contradictions [N found] | Hierarchy [MAINTAINED/BROKEN] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify the guide covers ONLY what was agreed (voice, rubric, randomization, guardrails, visual, naming) and nothing beyond. Check for scope creep: syntax reference material, workflow instructions, assessment-level design, DOM selectors. Verify no existing skill files were modified. Check that exclusion statements exist for out-of-scope areas.
  Output: `In-scope [N/6 sections] | Scope creep [CLEAN/N issues] | Existing files [UNMODIFIED/N changed] | VERDICT`

---

## Commit Strategy

- **1-2**: `feat(skills): add MOM style guide for design philosophy and conventions` — `.claude/skills/mom-style-guide/CLAUDE.md`

---

## Success Criteria

### Verification Commands
```bash
test -f ".claude/skills/mom-style-guide/CLAUDE.md"  # Expected: true
wc -l ".claude/skills/mom-style-guide/CLAUDE.md"     # Expected: <= 300
grep -c "mom-frq" ".claude/skills/mom-style-guide/CLAUDE.md"  # Expected: >= 2
```

### Final Checklist
- [ ] `.claude/skills/mom-style-guide/CLAUDE.md` exists
- [ ] All 6 sections present (voice, rubric, randomization, guardrails, visual, naming)
- [ ] Under 300 lines
- [ ] Zero em dashes
- [ ] Cross-references companion skills
- [ ] Contains exclusion statements
- [ ] No verbatim CSS duplication
- [ ] No code blocks > 5 lines
- [ ] No existing skill files modified
- [ ] Guide follows its own voice rules (warm, concise, no hedging)
