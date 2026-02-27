# Generous Grading Prompt Tuning + MathJax Fix

## TL;DR

> **Quick Summary**: Shift the grading system ~2 points more generous across all prompt layers (philosophy, scoring scale, anchors) and fix MathJax math rendering in feedback by switching from broken backtick notation to proper `\( ... \)` LaTeX delimiters + triggering MathJax.typeset() after programmatic fill.
> 
> **Deliverables**:
> - Updated GRADING_PHILOSOPHY constant (floor 40% → 60%, stronger generous language)
> - Rewritten SCORING SCALE (0-10 descriptions shifted ~2 points up)
> - Bumped scoring anchor percentages (Adequate 65% → 80%, etc.)
> - Fixed MathJax rendering: `\( ... \)` delimiters + MathJax.typeset() call
> - All source and bundled copies kept in sync
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 2 → Task 4 → Task 6

---

## Context

### Original Request
User reports batch grading with the lenient prompt appended is still grading too harshly — about 2 points below desired on a 0-10 scale. Additionally, math in feedback wrapped in backticks doesn't render as MathJax when programmatically inserted into text boxes.

### Interview Summary
**Key Discussions**:
- Benchmark data confirms models average 6.2-6.8/10 when teacher wants ~8.2-8.8/10
- Both batch and single grading prompts should be updated
- Three layers control strictness: GRADING_PHILOSOPHY, SCORING SCALE descriptions, scoring anchor percentages

**Research Findings**:
- `benchmark-results-new.md`: Kimi-K2.5 mean 6.84, Minimax-M2.5 mean 6.63, Gemini 3 Flash mean 7.56
- `benchmark-report.md`: GLM-5 mean 6.17, Sonnet 4.6 mean 6.37
- All models score 1.5-2.5 points below teacher expectation
- MathJax uses `\( ... \)` delimiters, NOT backticks — the `/grade` command already uses the correct approach

### Metis Review
**Identified Gaps** (addressed):
- **MISSED FILE**: `.claude/commands/grade.md` has its own grading philosophy with 40% floor (lines 22-28) — included in plan
- **MISSED LOCATION**: `buildOutlierReviewPrompt()` line 537 also has the backtick math instruction — included in plan
- **MISSED FILE**: `SETUP.md` line 147 documents the 40% floor — included in plan
- **Backtick math is wrong MathJax syntax**: Backticks render as monospace code, not math. MathJax needs `\( ... \)` — using correct delimiters
- **MathJax.typeset() needed**: Even with correct delimiters, programmatic innerHTML insertion won't trigger MathJax re-render — adding guarded typeset() call

---

## Work Objectives

### Core Objective
Shift AI grading scores ~2 points higher across all prompt layers and fix MathJax math rendering in filled feedback.

### Concrete Deliverables
- `grading-server/grading-constants.js` — updated GRADING_PHILOSOPHY (60% floor, stronger language)
- `grading-server/grading.js` — updated anchors + scoring scale + MathJax instruction (3 locations)
- `ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js` — byte-identical copy
- `ogre-desktop/src-tauri/binaries/server-bundle/grading.js` — byte-identical copy
- `ogre-desktop/src/lib/batch-grader.ts` — MathJax.typeset() call in fillGrade()
- `.claude/commands/grade.md` — updated philosophy (60% floor)
- `SETUP.md` — updated documentation (60% floor)

### Definition of Done
- [ ] `bun test` in grading-server/ passes (0 failures)
- [ ] `grep "at least 40%" grading-server/grading-constants.js` returns 0 matches
- [ ] `grep "backticks" grading-server/grading.js` returns 0 matches
- [ ] Source and bundle copies are byte-identical (fc/diff shows no differences)
- [ ] `MathJax.typeset` appears in batch-grader.ts

### Must Have
- GRADING_PHILOSOPHY floor raised from 40% to 60%
- SCORING SCALE descriptions shifted so 7-8 = "solid/good work" range (was 6-7)
- Anchor percentages raised: Excellent 95%, Adequate 80%, Below Avg 65%, Minimal 45%
- MathJax instruction changed from backticks to `\( ... \)` in all 3 prompt builders
- MathJax.typeset() called after fillGrade() inserts feedback HTML
- Source ↔ bundle parity maintained

### Must NOT Have (Guardrails)
- DO NOT change `snapScore()`, `getScaleInfo()`, `parseBatchResponse()`, `parseSingleGradeResponse()`, `validateBatchResults()`, or `clampSingleResult()` — parser/converter functions, not grading policy
- DO NOT change the virtual-10 scoring system or descaling logic
- DO NOT change outlier detection thresholds (2σ) or chunk size (20)
- DO NOT modify `buildCompactSweepPrompt` or `buildPairwiseSweepPrompts` — they inherit anchors automatically
- DO NOT touch `markdown-extract.ts` — its MathJax references are for content extraction, not rendering
- DO NOT create a shared constant for the math instruction format — inline in template is fine, matches current pattern
- DO NOT refactor prompt builders into a base class or shared scoring scale builder
- DO NOT update benchmark data files — they're historical records
- DO NOT fix the broken `prompts.test.js` (imports non-existent `prompts.js`) — pre-existing, out of scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (`bun test` in grading-server/)
- **Automated tests**: Tests-after (verify existing tests pass — no new tests)
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

- **File changes**: Use Bash (grep/diff/fc) — verify content changes and file parity
- **Tests**: Use Bash (bun test) — verify no regressions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Update GRADING_PHILOSOPHY + grade.md philosophy [quick]
├── Task 2: Update scoring scale + anchors + MathJax instruction in grading.js [deep]
└── Task 3: Add MathJax.typeset() in batch-grader.ts fillGrade() [quick]

Wave 2 (After Wave 1 — sync and docs):
├── Task 4: Copy source files to bundle + verify parity [quick]
└── Task 5: Update SETUP.md documentation [quick]

Wave FINAL (After Wave 2 — verification):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review + tests [unspecified-high]
├── Task F3: Grep-based QA verification [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 2 → Task 4 → Task F1-F4
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 4 | 1 |
| 3 | — | — | 1 |
| 4 | 1, 2 | F1-F4 | 2 |
| 5 | 1 | F1-F4 | 2 |
| F1-F4 | 4, 5 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `deep`, T3 → `quick`
- **Wave 2**: 2 tasks — T4 → `quick`, T5 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Update GRADING_PHILOSOPHY constant + /grade command philosophy

  **What to do**:
  - In `grading-server/grading-constants.js`, rewrite the `GRADING_PHILOSOPHY` constant:
    - Raise the floor from "at least 40% of max score" to "at least 60% of max score"
    - Strengthen generous language: add "When in doubt, round UP" and "partial understanding is the norm for high schoolers"
    - Add "If a student demonstrates they understood the core concept, give most of the points even if execution is imperfect"
    - Keep the existing bullets but make each one more generous (e.g., "minor errors lose at most 1 point" → "minor errors lose at most 0.5 points per category")
  - In `.claude/commands/grade.md` lines 22-28, make the same changes:
    - Change "at least 40% of max score" → "at least 60% of max score"
    - Align language with updated GRADING_PHILOSOPHY

  **Must NOT do**:
  - Do NOT change any other content in grade.md (workflow steps, selectors, etc.)
  - Do NOT change the math formatting instruction at line 127 (it already uses correct `\( ... \)` delimiters)
  - Do NOT add new bullet points beyond what fits the existing structure

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `grading-server/grading-constants.js` (entire file, 9 lines) — the GRADING_PHILOSOPHY constant to rewrite
  - `.claude/commands/grade.md:22-28` — separate grading philosophy section that must stay aligned

  **Acceptance Criteria**:

  ```
  Scenario: GRADING_PHILOSOPHY floor raised to 60%
    Tool: Bash (grep)
    Steps:
      1. Run: grep "at least 40%" grading-server/grading-constants.js
      2. Assert: 0 matches returned
      3. Run: grep "at least 60%" grading-server/grading-constants.js
      4. Assert: 1 match returned
    Expected Result: Old floor removed, new floor present
    Evidence: .sisyphus/evidence/task-1-philosophy-floor.txt

  Scenario: grade.md philosophy aligned
    Tool: Bash (grep)
    Steps:
      1. Run: grep "40%" .claude/commands/grade.md
      2. Assert: 0 matches in the philosophy section (lines 22-28)
      3. Run: grep "60%" .claude/commands/grade.md
      4. Assert: 1 match in the philosophy section
    Expected Result: grade.md floor matches grading-constants.js
    Evidence: .sisyphus/evidence/task-1-grade-md-floor.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Message: `fix(grading): shift scoring 2 points more generous + fix MathJax rendering`
  - Files: `grading-server/grading-constants.js`, `.claude/commands/grade.md`

- [ ] 2. Update SCORING SCALE descriptions + anchor percentages + MathJax instruction in grading.js

  **What to do**:
  - In `grading-server/grading.js`, make these changes:

  **A. Update `generateScoringAnchors()` (lines 20-23):**
  Change the anchor multipliers:
  ```
  // OLD:
  const excellentScore = roundScore(maxScore * 0.9);
  const adequateScore = roundScore(maxScore * 0.65);
  const belowAverageScore = roundScore(maxScore * 0.5);
  const minimalScore = roundScore(maxScore * 0.3);
  // NEW:
  const excellentScore = roundScore(maxScore * 0.95);
  const adequateScore = roundScore(maxScore * 0.80);
  const belowAverageScore = roundScore(maxScore * 0.65);
  const minimalScore = roundScore(maxScore * 0.45);
  ```
  Update the anchor description strings (lines 26-29) to match the more generous posture:
  ```
  // OLD:
  let excellentDesc = 'Demonstrates comprehensive understanding with all key concepts addressed clearly.';
  let adequateDesc = 'Shows solid grasp of main concepts with minor gaps or unclear explanations.';
  let belowAverageDesc = 'Shows partial understanding but missing key concepts, formulas, or depth.';
  let minimalDesc = 'Addresses some basic concepts but lacks depth or contains significant errors.';
  // NEW:
  let excellentDesc = 'Demonstrates clear understanding with most key concepts addressed.';
  let adequateDesc = 'Addresses the topic and shows awareness of key concepts, even with gaps or imprecision.';
  let belowAverageDesc = 'Makes a genuine attempt that engages with the prompt, showing limited but real understanding.';
  let minimalDesc = 'Shows some effort and awareness related to the topic, even if mostly incomplete.';
  ```

  **B. Rewrite SCORING SCALE in `buildBatchPrompt()` (lines 138-152):**
  Replace the entire SCORING SCALE block with this shifted version:
  ```
  SCORING SCALE (use integers 0-10 — server converts to actual points):
  0  – No submission or completely blank
  1  – Off-topic: response does not address the question at all
  2  – Minimal effort: mentions the topic but shows almost no understanding
  3  – Very limited: some awareness of concepts but largely incomplete
  4  – Partial: shows basic familiarity but misses most key criteria
  5  – Developing: demonstrates partial understanding, covers some key points
  6  – Approaching: addresses main ideas but with notable gaps or errors
  7  – Satisfactory: shows reasonable understanding of core concepts
  8  – Good: solid understanding with only minor gaps or imprecision
  9  – Very good: thorough and accurate, demonstrates strong command
  10 – Excellent: comprehensive, precise, and clearly communicated
  
  When in doubt between two scores, choose the HIGHER one.
  ```

  **C. Rewrite SCORING SCALE in `buildSingleGradePrompt()` (lines 745-758):**
  Apply the exact same SCORING SCALE text as in step B above.

  **D. Fix MathJax instruction in all 3 prompt builders:**
  In each of these locations, change the feedback format instruction:
  - `buildBatchPrompt()` line ~203: feedback format string
  - `buildOutlierReviewPrompt()` line ~537: feedback format string
  - `buildSingleGradePrompt()` line ~765: feedback format string
  
  OLD: `"feedback": "<constructive feedback string, wrap math in backticks for MathJax e.g. \`\\\\sigma / \\\\sqrt{n}\`>"`
  NEW: `"feedback": "<constructive feedback, use \\( ... \\) for inline math e.g. \\(\\sigma / \\sqrt{n}\\)>"`

  **Must NOT do**:
  - Do NOT change `snapScore()`, `getScaleInfo()`, `parseBatchResponse()`, `parseSingleGradeResponse()`, `validateBatchResults()`, `clampSingleResult()`
  - Do NOT change the virtual-10 scoring system or descaling logic
  - Do NOT change outlier detection thresholds or chunk size
  - Do NOT modify `buildCompactSweepPrompt` or `buildPairwiseSweepPrompts`
  - Do NOT remove the "Be precise — 7 and 8 represent meaningfully different quality levels" line (update it to reflect new scale if needed)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `grading-server/grading.js:13-60` — `generateScoringAnchors()` function with anchor percentages and descriptions
  - `grading-server/grading.js:86-224` — `buildBatchPrompt()` with SCORING SCALE at lines 138-152 and MathJax instruction at line 203
  - `grading-server/grading.js:447-545` — `buildOutlierReviewPrompt()` with MathJax instruction at line 537
  - `grading-server/grading.js:684-769` — `buildSingleGradePrompt()` with SCORING SCALE at lines 745-758 and MathJax instruction at line 765
  - `.claude/commands/grade.md:127` — reference for correct `\( ... \)` LaTeX delimiter pattern (already correct here)

  **Acceptance Criteria**:

  ```
  Scenario: Anchor percentages bumped
    Tool: Bash (grep)
    Steps:
      1. Run: grep "0\.65" grading-server/grading.js
      2. Assert: 0 matches in anchor context (the value 0.65 should now be belowAverage, not adequate)
      3. Run: grep "0\.80" grading-server/grading.js
      4. Assert: at least 1 match (new adequate anchor)
      5. Run: grep "0\.95" grading-server/grading.js
      6. Assert: at least 1 match (new excellent anchor)
    Expected Result: Anchor multipliers updated to 0.95/0.80/0.65/0.45
    Evidence: .sisyphus/evidence/task-2-anchors.txt

  Scenario: SCORING SCALE shifted in both prompts
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A1 "8  –" grading-server/grading.js
      2. Assert: the line for score 8 contains "Good" or "solid understanding" (shifted up from old score 7)
      3. Run: grep "When in doubt" grading-server/grading.js
      4. Assert: at least 2 matches (one per prompt builder)
    Expected Result: Scale descriptions shifted ~2 points up in both buildBatchPrompt and buildSingleGradePrompt
    Evidence: .sisyphus/evidence/task-2-scale.txt

  Scenario: MathJax backtick instruction removed
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "backtick" grading-server/grading.js
      2. Assert: 0 matches
      3. Run: grep -c "\\\\(" grading-server/grading.js
      4. Assert: at least 3 matches (one per prompt builder)
    Expected Result: All 3 prompt builders use \( ... \) delimiters instead of backticks
    Evidence: .sisyphus/evidence/task-2-mathjax.txt

  Scenario: Existing tests pass
    Tool: Bash
    Preconditions: grading-server/node_modules exists (bun install)
    Steps:
      1. Run: cd grading-server && bun test
      2. Assert: exit code 0, all tests pass
    Expected Result: No test regressions
    Evidence: .sisyphus/evidence/task-2-tests.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Files: `grading-server/grading.js`

- [ ] 3. Add MathJax.typeset() call in batch-grader.ts fillGrade()

  **What to do**:
  - In `ogre-desktop/src/lib/batch-grader.ts`, in the `fillGrade()` function
  - The feedback is inserted via `fbBox.innerHTML = html` inside an `evalScriptJSON` call (around line 815)
  - After the feedback insertion + event dispatch block, BEFORE `return { success: true }`, add:
  ```javascript
  // Trigger MathJax to re-render any LaTeX in the newly inserted feedback
  try { if (window.MathJax && window.MathJax.typeset) window.MathJax.typeset(); } catch(e) {}
  ```
  - This goes INSIDE the evalScriptJSON function body, in the `if (fbCfg.type === 'tinymce-inline' || fbCfg.type === 'contenteditable')` branch
  - Also add it in the `else` (textarea) branch for completeness

  **Must NOT do**:
  - Do NOT create a separate module/utility for MathJax rendering
  - Do NOT modify any other function in batch-grader.ts
  - Do NOT add MathJax configuration or loading logic — just the typeset() call

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:756-836` — `fillGrade()` function, especially the evalScriptJSON block
  - `ogre-desktop/src/lib/batch-grader.ts:810-828` — the innerHTML insertion and event dispatch code where the typeset() call should go

  **Acceptance Criteria**:

  ```
  Scenario: MathJax.typeset() present in fillGrade
    Tool: Bash (grep)
    Steps:
      1. Run: grep "MathJax.typeset" ogre-desktop/src/lib/batch-grader.ts
      2. Assert: at least 1 match
      3. Run: grep "MathJax &&" ogre-desktop/src/lib/batch-grader.ts
      4. Assert: at least 1 match (guard check present)
    Expected Result: Guarded MathJax.typeset() call exists in fillGrade()
    Evidence: .sisyphus/evidence/task-3-mathjax-typeset.txt

  Scenario: Error handling present
    Tool: Bash (grep)
    Steps:
      1. Run: grep -B1 "MathJax.typeset" ogre-desktop/src/lib/batch-grader.ts
      2. Assert: "try" appears on the line before or same line
    Expected Result: typeset() call is wrapped in try-catch
    Evidence: .sisyphus/evidence/task-3-error-guard.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Files: `ogre-desktop/src/lib/batch-grader.ts`

- [ ] 4. Copy source files to bundle + verify parity

  **What to do**:
  - Copy `grading-server/grading-constants.js` → `ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js`
  - Copy `grading-server/grading.js` → `ogre-desktop/src-tauri/binaries/server-bundle/grading.js`
  - Verify both copies are byte-identical using diff or fc

  **Must NOT do**:
  - Do NOT manually edit the bundle copies — always copy from source
  - Do NOT copy any other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Final verification wave
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `grading-server/grading-constants.js` — source of truth
  - `grading-server/grading.js` — source of truth
  - `ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js` — bundle copy target
  - `ogre-desktop/src-tauri/binaries/server-bundle/grading.js` — bundle copy target

  **Acceptance Criteria**:

  ```
  Scenario: Source/bundle parity
    Tool: Bash (diff)
    Steps:
      1. Run: diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js
      2. Assert: no output (files identical)
      3. Run: diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js
      4. Assert: no output (files identical)
    Expected Result: Both bundle copies are byte-identical to source
    Evidence: .sisyphus/evidence/task-4-parity.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Files: `ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js`, `ogre-desktop/src-tauri/binaries/server-bundle/grading.js`

- [ ] 5. Update SETUP.md documentation

  **What to do**:
  - In `SETUP.md` line 147, change "Minimum 40% for substantive attempts" to "Minimum 60% for substantive attempts"
  - Verify no other references to the old 40% floor exist in SETUP.md

  **Must NOT do**:
  - Do NOT rewrite other sections of SETUP.md
  - Do NOT add new documentation sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 1 (needs final floor value)

  **References**:

  **Pattern References**:
  - `SETUP.md:147` — "Minimum 40% for substantive attempts" line to update

  **Acceptance Criteria**:

  ```
  Scenario: SETUP.md floor updated
    Tool: Bash (grep)
    Steps:
      1. Run: grep "40%" SETUP.md
      2. Assert: 0 matches in grading philosophy context
      3. Run: grep "60%" SETUP.md
      4. Assert: at least 1 match
    Expected Result: Documentation reflects new 60% floor
    Evidence: .sisyphus/evidence/task-5-setup-md.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Files: `SETUP.md`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (grep for expected strings, read changed files). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cd grading-server && bun test`. Review all changed files for: broken template literals, unescaped backslashes in LaTeX, mismatched quotes, syntax errors. Verify no changes leaked into parser functions (snapScore, getScaleInfo, parseBatchResponse, parseSingleGradeResponse, validateBatchResults, clampSingleResult).
  Output: `Tests [PASS/FAIL] | Files [N clean/N issues] | Parser Integrity [CLEAN/TAINTED] | VERDICT`

- [ ] F3. **Grep-based QA Verification** — `unspecified-high`
  Run all QA grep commands from the plan: verify "40%" removed from philosophy files, "backticks" removed from grading.js, `\(` present in feedback format instructions, MathJax.typeset in batch-grader.ts, source/bundle parity via diff. Capture all output as evidence.
  Output: `Checks [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **After Wave 2**: `fix(grading): shift scoring 2 points more generous + fix MathJax rendering` — grading-constants.js, grading.js (both copies), batch-grader.ts, grade.md, SETUP.md
  - Pre-commit: `cd grading-server && bun test`

---

## Success Criteria

### Verification Commands
```bash
cd grading-server && bun test                    # Expected: all tests pass
grep "at least 40%" grading-server/grading-constants.js  # Expected: 0 matches
grep "at least 60%" grading-server/grading-constants.js  # Expected: 1 match
grep "backticks" grading-server/grading.js               # Expected: 0 matches
grep "MathJax.typeset" ogre-desktop/src/lib/batch-grader.ts  # Expected: ≥1 match
diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js  # Expected: identical
diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js  # Expected: identical
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Source/bundle parity confirmed
