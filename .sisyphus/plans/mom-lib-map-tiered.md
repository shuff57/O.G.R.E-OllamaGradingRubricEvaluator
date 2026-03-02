# Tiered Library Map: Extract Inline Map to Per-Subject Files

## TL;DR

> **Quick Summary**: Extract the 350-line inline library map from `mom-fact-finder/CLAUDE.md` Step 3 into a tiered `mom-lib-map/` folder. One index file + 15 per-subject files. The fact-finder loads only the index (~40 lines) + the relevant subject file (~10–44 lines) instead of all 350 lines every invocation.
>
> **Deliverables**:
> - `.claude/skills/mom-lib-map/CLAUDE.md` (index with topic keywords + root lib-IDs)
> - 15 per-subject `.md` files under `.claude/skills/mom-lib-map/`
> - Updated `mom-fact-finder/CLAUDE.md` Step 3 (inline map replaced with tiered read instructions)
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (index) → Task 3 (update fact-finder) → Task 4 (verify)

---

## Context

### Original Request
Optimize the MOM library map so that only the relevant subject reference is loaded when needed, using a tiered folder structure.

### Interview Summary
**Key Discussions**:
- The current inline map (350 lines, lines 175–524 of mom-fact-finder) is loaded in full every invocation even when only one subject is needed
- User wants per-subject files loaded on demand via a lightweight index

**Research Findings**:
- All library data was live-recon'd from MOM `libtree3.php` via Playwriter
- The inline map covers 15 subjects, ranging from 3 rows (Linear Algebra) to 44 rows (Statistics)
- Only `mom-fact-finder/CLAUDE.md` Step 3 consumes this data — no other skill references it

### Metis Review
**Identified Gaps** (addressed):
- Cross-subject topics (Regression, Sequences, Geometry, Probability, Complex numbers) — index will list ALL matching subjects per cross-topic
- Index must include root `lib{N}` IDs AND representative topic keywords for fuzzy matching
- Fallback navigation note (lines 520–524) and Option B / Tree Helper (lines 525–554) must stay in fact-finder
- Each subject file must be self-contained with header, table headers, and delimiters

---

## Work Objectives

### Core Objective
Split the inline 350-line library map into a tiered folder structure where the fact-finder loads only what it needs per invocation.

### Concrete Deliverables
- `mom-lib-map/CLAUDE.md` — index file (~40 lines)
- 15 subject files: `arithmetic.md`, `algebra.md`, `trig.md`, `calculus.md`, `differential-equations.md`, `linear-algebra.md`, `statistics.md`, `liberal-arts.md`, `discrete-math.md`, `finance.md`, `accounting.md`, `chemistry.md`, `physics.md`, `geometry.md`, `astronomy.md`
- Updated `mom-fact-finder/CLAUDE.md` Step 3

### Definition of Done
- [ ] All `lib{N}` data-IDs from original map exist in exactly one subject file
- [ ] Index lists all 15 subjects with root lib-ID, filename, and topic keywords
- [ ] mom-fact-finder Step 3 references tiered files instead of inline map
- [ ] mom-fact-finder is ≤520 lines (was 842)
- [ ] Steps 0–2, 4–12 of mom-fact-finder are unchanged

### Must Have
- Every `lib{N}` from the original map preserved exactly
- Cross-subject topics noted in the index (multi-subject pointers)
- Root `lib{N}` per subject in the index (tree navigation entry point)
- 5–8 representative topic keywords per subject in the index
- Self-contained subject files (header + table headers + delimiters)
- Fallback navigation instructions preserved in updated Step 3
- "How to add a new subject" note in index (2–3 lines)

### Must NOT Have (Guardrails)
- Do NOT add lib-IDs not in the current inline map — this is restructuring, not data refresh
- Do NOT reformat table structure within subject files — copy rows verbatim
- Do NOT touch Steps 0–2 or 4–12 of mom-fact-finder
- Do NOT move Option B fallback code (lines 525–534) or Tree Selection Helper (lines 536–553) out of mom-fact-finder — those are workflow code, not map data
- Do NOT create JSON/YAML/programmatic lookup — markdown only
- Do NOT merge small subjects into larger ones (even 3-row files stay separate)
- Do NOT add topic aliasing / synonym tables — the AI handles fuzzy matching natively
- Do NOT update any skill other than mom-fact-finder

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: N/A (reference files, not code)
- **Automated tests**: None — verification is via grep/wc/diff commands
- **Framework**: Bash commands

### QA Policy
Every task includes agent-executed verification commands.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — create all files):
├── Task 1: Create index CLAUDE.md [quick]
├── Task 2a: Create subject files batch A (arithmetic, algebra, trig, calculus, diff-eq) [quick]
├── Task 2b: Create subject files batch B (linear-algebra, statistics, liberal-arts, discrete-math, finance) [quick]
├── Task 2c: Create subject files batch C (accounting, chemistry, physics, geometry, astronomy) [quick]
└── Task 2d: Create elem-ed.md (Math for Elem Ed — bonus subject from recon) [quick]

Wave 2 (After Wave 1 — update fact-finder):
└── Task 3: Rewrite mom-fact-finder Step 3 (replace inline map with tiered read) [quick]

Wave 3 (After Wave 2 — verify):
└── Task 4: Data integrity verification [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit [oracle]
└── F2: Scope fidelity check [deep]
```

### Dependency Matrix
- **1, 2a–2d**: None — can all start immediately (Wave 1, 5 parallel)
- **3**: Depends on 1, 2a–2d (Wave 2)
- **4**: Depends on 3 (Wave 3)
- **F1, F2**: Depend on 4 (Final wave, 2 parallel)

### Agent Dispatch Summary
- **Wave 1**: 5 — T1 → `quick`, T2a–T2d → `quick`
- **Wave 2**: 1 — T3 → `quick`
- **Wave 3**: 1 — T4 → `quick`
- **FINAL**: 2 — F1 → `oracle`, F2 → `deep`

---

## TODOs

- [ ] 1. Create `mom-lib-map/CLAUDE.md` index file

  **What to do**:
  - Create `.claude/skills/mom-lib-map/CLAUDE.md`
  - Add skill header: `> **When to use**: Look up the correct MOM library tree data-id for any subject/topic. This is a passive reference skill — read by mom-fact-finder, never invoked directly.`
  - Add `> **Related skills**: mom-fact-finder (consumer), mom-page-map (DOM reference)`
  - Add the top-level subject routing table with columns: `| Subject | Root lib-ID | File | Representative Topics |`
  - Include ALL 15 subjects (+ elem-ed = 16 total)
  - For each subject, list 5–8 representative topic keywords for fuzzy matching
  - Add cross-subject notes at bottom: "**Cross-subject topics**: Regression → statistics.md, algebra.md, discrete-math.md. Sequences → arithmetic.md, calculus.md, discrete-math.md. Complex numbers → algebra.md (lib115), trig.md (lib219). Geometry/area → arithmetic.md, algebra.md, geometry.md."
  - Add "How to add a new subject" note: "(1) Create `{subject}.md` with header + table. (2) Add row to this index. (3) Done."

  **Must NOT do**:
  - Do not include the full topic tables — only the routing information
  - Do not use JSON/YAML — markdown tables only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2a–2d)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-page-map/CLAUDE.md` — skill header format convention (copy the `> **When to use**` + `> **Related skills**` pattern)

  **Content Source** (copy from):
  - `.claude/skills/mom-fact-finder/CLAUDE.md` lines 175–177 — the map header introduction text
  - `.claude/skills/mom-fact-finder/CLAUDE.md` lines 181–516 — extract subject names + root lib-IDs from section headers (e.g. `#### 🔢 Arithmetic (lib3)`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Index file has correct structure
    Tool: Bash
    Steps:
      1. cat .claude/skills/mom-lib-map/CLAUDE.md
      2. Verify header line contains "MOM Library Map" or "Library Map"
      3. Verify table contains columns: Subject, Root lib-ID, File, Representative Topics
      4. Count rows in the table (grep -c '| lib' .claude/skills/mom-lib-map/CLAUDE.md)
    Expected Result: 16 subject rows (15 original + elem-ed)
    Evidence: .sisyphus/evidence/task-1-index-structure.txt

  Scenario: Cross-subject topics documented
    Tool: Bash
    Steps:
      1. grep -i "cross-subject\|regression.*algebra\|regression.*statistics" .claude/skills/mom-lib-map/CLAUDE.md
    Expected Result: At least 3 cross-subject topic mentions
    Evidence: .sisyphus/evidence/task-1-cross-subject.txt
  ```

  **Commit**: YES (group with Tasks 2a–2d)
  - Message: `feat(skills): create tiered mom-lib-map with index + 16 subject files`
  - Files: `.claude/skills/mom-lib-map/*`

---

- [ ] 2a. Create subject files — Batch A (arithmetic, algebra, trig, calculus, differential-equations)

  **What to do**:
  - Create 5 files under `.claude/skills/mom-lib-map/`:
    - `arithmetic.md` — copy from fact-finder lines 181–197 (the `#### 🔢 Arithmetic (lib3)` section)
    - `algebra.md` — copy from fact-finder lines 200–227 (the `#### 🔣 Algebra (lib60)` section)
    - `trig.md` — copy from fact-finder lines 231–249 (the `#### 📐 Trig (lib208)` section)
    - `calculus.md` — copy from fact-finder lines 253–290 (the `#### ∫ Calculus (lib224)` section)
    - `differential-equations.md` — copy from fact-finder lines 294–308 (the `#### 🌀 Differential Equations (lib349)` section)
  - Each file MUST be self-contained:
    - Start with `# {Subject} — MOM Library Map` heading
    - Include `> Root node: lib{N}` line
    - Include the full markdown table with headers
    - End with `---`
  - Copy table rows VERBATIM from the fact-finder inline map — do NOT reformat

  **Must NOT do**:
  - Do not reformat tables or change column headers
  - Do not add lib-IDs not present in the source
  - Do not merge sections or add commentary

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2b, 2c, 2d)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Content Source** (copy from — CRITICAL):
  - `.claude/skills/mom-fact-finder/CLAUDE.md` lines 181–308 — the exact source content to extract

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 5 files created with correct content
    Tool: Bash
    Steps:
      1. ls .claude/skills/mom-lib-map/arithmetic.md .claude/skills/mom-lib-map/algebra.md .claude/skills/mom-lib-map/trig.md .claude/skills/mom-lib-map/calculus.md .claude/skills/mom-lib-map/differential-equations.md
      2. For each file: verify first line contains "# " (heading)
      3. For each file: verify contains "lib" references matching source
      4. Spot check: grep "lib476" .claude/skills/mom-lib-map/calculus.md (should be absent — that's Statistics)
    Expected Result: 5 files exist, each self-contained, no cross-contamination
    Evidence: .sisyphus/evidence/task-2a-files-created.txt
  ```

  **Commit**: YES (group with Task 1 and 2b–2d)

---

- [ ] 2b. Create subject files — Batch B (linear-algebra, statistics, liberal-arts, discrete-math, finance)

  **What to do**:
  - Create 5 files under `.claude/skills/mom-lib-map/`:
    - `linear-algebra.md` — copy from fact-finder lines 312–318 (3 rows)
    - `statistics.md` — copy from fact-finder lines 322–369 (44 rows)
    - `liberal-arts.md` — copy from fact-finder lines 373–377 (1 note row)
    - `discrete-math.md` — copy from fact-finder lines 381–401 (17 rows)
    - `finance.md` — copy from fact-finder lines 405–417 (9 rows)
  - Same self-contained format as Task 2a (heading + root node + table + delimiter)
  - Copy table rows VERBATIM

  **Must NOT do**:
  - Same guardrails as Task 2a

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Content Source** (copy from — CRITICAL):
  - `.claude/skills/mom-fact-finder/CLAUDE.md` lines 312–417

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Statistics file has all 44 topic rows
    Tool: Bash
    Steps:
      1. grep -c '| lib' .claude/skills/mom-lib-map/statistics.md
    Expected Result: ≥ 44 rows containing lib references
    Evidence: .sisyphus/evidence/task-2b-stats-rows.txt

  Scenario: All 5 files created
    Tool: Bash
    Steps:
      1. ls .claude/skills/mom-lib-map/linear-algebra.md .claude/skills/mom-lib-map/statistics.md .claude/skills/mom-lib-map/liberal-arts.md .claude/skills/mom-lib-map/discrete-math.md .claude/skills/mom-lib-map/finance.md
    Expected Result: All 5 files exist
    Evidence: .sisyphus/evidence/task-2b-files-created.txt
  ```

  **Commit**: YES (group with Task 1 and 2a, 2c, 2d)

---

- [ ] 2c. Create subject files — Batch C (accounting, chemistry, physics, geometry, astronomy)

  **What to do**:
  - Create 5 files under `.claude/skills/mom-lib-map/`:
    - `accounting.md` — copy from fact-finder lines 421–443 (20 rows)
    - `chemistry.md` — copy from fact-finder lines 447–462 (12 rows)
    - `physics.md` — copy from fact-finder lines 466–481 (12+ rows)
    - `geometry.md` — copy from fact-finder lines 485–500 (12 rows)
    - `astronomy.md` — copy from fact-finder lines 504–516 (9 rows)
  - Same self-contained format as Task 2a
  - Copy table rows VERBATIM

  **Must NOT do**:
  - Same guardrails as Task 2a

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Content Source** (copy from — CRITICAL):
  - `.claude/skills/mom-fact-finder/CLAUDE.md` lines 421–516

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 5 files created
    Tool: Bash
    Steps:
      1. ls .claude/skills/mom-lib-map/accounting.md .claude/skills/mom-lib-map/chemistry.md .claude/skills/mom-lib-map/physics.md .claude/skills/mom-lib-map/geometry.md .claude/skills/mom-lib-map/astronomy.md
    Expected Result: All 5 files exist
    Evidence: .sisyphus/evidence/task-2c-files-created.txt
  ```

  **Commit**: YES (group with Task 1 and 2a, 2b, 2d)

---

- [ ] 2d. Create `elem-ed.md` (Math for Elementary School Teachers)

  **What to do**:
  - This subject was discovered during the recon but was NOT in the original inline map (it's a top-level node lib10201 with 15 direct children)
  - Create `.claude/skills/mom-lib-map/elem-ed.md` with the data from the Playwriter recon session:
    - lib10202 Problem solving / patterns / logic
    - lib10203 Sets and operations
    - lib10204 Whole number addition
    - lib10205 Whole number subtraction
    - lib10206 Whole number multiplication
    - lib10207 Whole number division
    - lib10208 Integers
    - lib10209 Number theory
    - lib10210 Fun with Fractions
    - lib10211 Decimals and operations
    - lib10212 Probability and counting
    - lib10213 Descriptive statistics
    - lib10214 Geometry basics
    - lib10215 Numeration systems
  - Same self-contained format as other subject files

  **Must NOT do**:
  - Do not invent data — only use IDs confirmed from the recon

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Content Source**:
  - Playwriter recon output from this session (the `lib10201` → children data — all 14 leaf nodes confirmed with `selectable: true`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File created with correct content
    Tool: Bash
    Steps:
      1. cat .claude/skills/mom-lib-map/elem-ed.md
      2. grep -c 'lib102' .claude/skills/mom-lib-map/elem-ed.md
    Expected Result: File exists, contains lib10202–lib10215 references
    Evidence: .sisyphus/evidence/task-2d-elem-ed.txt
  ```

  **Commit**: YES (group with Tasks 1, 2a–2c)

---

- [ ] 3. Rewrite `mom-fact-finder/CLAUDE.md` Step 3 — replace inline map with tiered read

  **What to do**:
  - Read `.claude/skills/mom-fact-finder/CLAUDE.md` in full
  - DELETE lines 175–524 (the `### Complete Topic → Library Map` section through the fallback nav note)
  - REPLACE with new Step 3 instructions (~25 lines) that:
    1. Read `.claude/skills/mom-lib-map/CLAUDE.md` (the index)
    2. Match the caller's `topic` to a subject row via the Representative Topics column
    3. Read only the matching subject file (e.g. `.claude/skills/mom-lib-map/statistics.md`)
    4. Extract the relevant `data-id` from the subject file's table
    5. Proceed to the library picker workflow (Option A code block — which stays)
  - PRESERVE these sections exactly (do NOT move or delete):
    - Lines 525–534: Option B — All Libraries fallback code
    - Lines 536–553: Tree Selection Helper code snippet
    - Lines 520–524 content (fallback navigation note) — integrate into the new instructions as "if topic isn't found in any subject file" fallback
  - The `### Option A — Select a Topic Library via the Picker (PREFERRED)` heading and its code block (lines 140–173) must remain unchanged — only the inline map section is replaced

  **Must NOT do**:
  - Do NOT touch Steps 0–2 (lines 1–134) or Steps 4–12 (lines 556–842)
  - Do NOT touch Option A code block (lines 140–173), Option B code block (lines 525–534), or Tree Selection Helper (lines 536–553)
  - Do NOT rewrite any Playwriter code snippets
  - Do NOT change the Input/Output contracts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2a, 2b, 2c, 2d

  **References**:

  **Target File**:
  - `.claude/skills/mom-fact-finder/CLAUDE.md` — the file being edited

  **Lines to DELETE** (the inline map):
  - Lines 175–524 (from `### Complete Topic → Library Map` through line 524)

  **Lines to PRESERVE unchanged**:
  - Lines 1–174 (Steps 0–3 header + Option A code)
  - Lines 525–553 (Option B + Tree Helper)
  - Lines 554–842 (Steps 4–12)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Inline map removed
    Tool: Bash
    Steps:
      1. grep -c "Complete Topic.*Library Map" .claude/skills/mom-fact-finder/CLAUDE.md
    Expected Result: 0 matches (section header gone)
    Evidence: .sisyphus/evidence/task-3-map-removed.txt

  Scenario: File size reduced
    Tool: Bash
    Steps:
      1. wc -l .claude/skills/mom-fact-finder/CLAUDE.md
    Expected Result: ≤ 520 lines (was 842, removed ~350, added ~25)
    Evidence: .sisyphus/evidence/task-3-linecount.txt

  Scenario: Tiered read instructions present
    Tool: Bash
    Steps:
      1. grep -c "mom-lib-map/CLAUDE.md" .claude/skills/mom-fact-finder/CLAUDE.md
      2. grep -c "mom-lib-map/" .claude/skills/mom-fact-finder/CLAUDE.md
    Expected Result: ≥ 2 references to mom-lib-map
    Evidence: .sisyphus/evidence/task-3-tiered-refs.txt

  Scenario: Steps 4–12 untouched
    Tool: Bash
    Steps:
      1. grep "Step 4\|Step 5\|Step 6\|Step 7\|Step 8\|Step 9\|Step 10\|Step 11\|Step 12" .claude/skills/mom-fact-finder/CLAUDE.md
    Expected Result: All step headers present
    Evidence: .sisyphus/evidence/task-3-steps-intact.txt

  Scenario: Option B and Tree Helper preserved
    Tool: Bash
    Steps:
      1. grep -c "Option B" .claude/skills/mom-fact-finder/CLAUDE.md
      2. grep -c "Tree Selection Helper" .claude/skills/mom-fact-finder/CLAUDE.md
    Expected Result: Both ≥ 1
    Evidence: .sisyphus/evidence/task-3-options-preserved.txt
  ```

  **Commit**: YES
  - Message: `refactor(skills): replace inline library map with tiered mom-lib-map references`
  - Files: `.claude/skills/mom-fact-finder/CLAUDE.md`

---

- [ ] 4. Data integrity verification

  **What to do**:
  - Run the following verification commands and capture evidence:
  - **Count check**: Extract all unique `lib{N}` IDs from the original map (use git to get the pre-edit version) and from all new subject files. Counts must match.
  - **File count**: `ls .claude/skills/mom-lib-map/ | wc -l` must equal 17 (1 CLAUDE.md + 16 subject files)
  - **No orphans**: Every lib-ID in the subject files must trace back to the original inline map
  - **Spot checks**: Verify 5 specific lib-IDs land in the correct subject file:
    - lib476 (Correlation/Regression) → statistics.md
    - lib243 (Chain rule) → calculus.md
    - lib215 (Trig identities) → trig.md
    - lib1805 (Leontief) → discrete-math.md
    - lib401 (Eigenvalues) → linear-algebra.md

  **Must NOT do**:
  - Do not modify any files — read-only verification task

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: F1, F2
  - **Blocked By**: Task 3

  **References**:

  **Files to verify**:
  - `.claude/skills/mom-lib-map/*.md` (all 17 files)
  - `.claude/skills/mom-fact-finder/CLAUDE.md` (to verify inline map is gone)
  - `git show HEAD~1:.claude/skills/mom-fact-finder/CLAUDE.md` (original version for comparison)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Data-ID count matches
    Tool: Bash
    Steps:
      1. git show HEAD~1:.claude/skills/mom-fact-finder/CLAUDE.md | sed -n '175,524p' | grep -oP 'lib\d+' | sort -u > /tmp/original_ids.txt
      2. cat .claude/skills/mom-lib-map/[!C]*.md | grep -oP 'lib\d+' | sort -u > /tmp/new_ids.txt
      3. diff /tmp/original_ids.txt /tmp/new_ids.txt
    Expected Result: diff output is empty (zero differences) OR new file has ONLY elem-ed additions (lib10201–lib10215)
    Failure Indicators: Missing lib-IDs in new files, or unexpected additions
    Evidence: .sisyphus/evidence/task-4-id-diff.txt

  Scenario: File count correct
    Tool: Bash
    Steps:
      1. ls .claude/skills/mom-lib-map/ | wc -l
    Expected Result: 17
    Evidence: .sisyphus/evidence/task-4-file-count.txt

  Scenario: Spot check lib-IDs in correct files
    Tool: Bash
    Steps:
      1. grep "lib476" .claude/skills/mom-lib-map/statistics.md && echo "PASS: lib476 in statistics"
      2. grep "lib243" .claude/skills/mom-lib-map/calculus.md && echo "PASS: lib243 in calculus"
      3. grep "lib215" .claude/skills/mom-lib-map/trig.md && echo "PASS: lib215 in trig"
      4. grep "lib1805" .claude/skills/mom-lib-map/discrete-math.md && echo "PASS: lib1805 in discrete-math"
      5. grep "lib401" .claude/skills/mom-lib-map/linear-algebra.md && echo "PASS: lib401 in linear-algebra"
    Expected Result: All 5 PASS
    Evidence: .sisyphus/evidence/task-4-spot-checks.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify: (1) All 17 files exist under mom-lib-map/. (2) Index CLAUDE.md has 16 subject rows with root lib-IDs and topic keywords. (3) Cross-subject topics documented. (4) mom-fact-finder Step 3 references tiered files. (5) mom-fact-finder ≤520 lines. (6) Steps 0–2 and 4–12 unchanged.
  Output: `Files [17/17] | Index [PASS/FAIL] | Fact-finder [PASS/FAIL] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify no extra files created, no unexpected edits to other skills, no data-ID invention. Check that Option B and Tree Helper are preserved in fact-finder. Flag any unaccounted changes.
  Output: `Tasks [4/4 compliant] | Unaccounted [CLEAN/N files] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Wave 1 (all file creation)**: `feat(skills): create tiered mom-lib-map with index + 16 subject files` — all files in `.claude/skills/mom-lib-map/`
- **Wave 2 (fact-finder update)**: `refactor(skills): replace inline library map with tiered mom-lib-map references` — `.claude/skills/mom-fact-finder/CLAUDE.md`

---

## Success Criteria

### Verification Commands
```bash
# File count
ls .claude/skills/mom-lib-map/ | wc -l  # Expected: 17

# Fact-finder line count
wc -l .claude/skills/mom-fact-finder/CLAUDE.md  # Expected: ≤ 520

# Inline map removed
grep -c "Complete Topic.*Library Map" .claude/skills/mom-fact-finder/CLAUDE.md  # Expected: 0

# Tiered references present
grep -c "mom-lib-map" .claude/skills/mom-fact-finder/CLAUDE.md  # Expected: ≥ 2

# Data integrity
cat .claude/skills/mom-lib-map/[!C]*.md | grep -oP 'lib\d+' | sort -u | wc -l  # Expected: ≥ count from original
```

### Final Checklist
- [ ] All 17 files exist in mom-lib-map/
- [ ] Index has 16 subjects with root lib-IDs and topic keywords
- [ ] Cross-subject topics documented in index
- [ ] mom-fact-finder Step 3 uses tiered read pattern
- [ ] mom-fact-finder ≤520 lines
- [ ] Steps 0–2, 4–12 unchanged in mom-fact-finder
- [ ] Option B and Tree Helper preserved
- [ ] Zero lib-ID data loss
