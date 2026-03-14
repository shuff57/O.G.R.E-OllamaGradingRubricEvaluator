# Handwriting Vision Training Data — Full Topic Coverage

## TL;DR

> **Quick Summary**: Expand `gen-handwriting-images.py` from 4 statistics topics (24 images) to all 22 topics (198 images) by adding 18 missing topics with 3 response levels each (weak/partial/strong), plus filling out CI and binomial which only have 1 response each. Content is ported from `build-training.cjs` synthetic topics and adapted to handwriting-appropriate length/style.
> 
> **Deliverables**:
> - Updated `test-data/gen-handwriting-images.py` with 66 total responses (58 new + 8 existing)
> - Regenerated `test-data/finetune-grading-vision.jsonl` (198 entries)
> - Regenerated `test-data/image-benchmark-cases.json` (198 cases)
> - Regenerated `test-data/handwriting-images/` (198 PNGs)
> - Regenerated `test-data/handwriting-training-data.zip`
> 
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: NO — all tasks edit one file, must be sequential
> **Critical Path**: Task 1 → 2 → 3 → 4 → 5 → 6 → 7

---

## Context

### Original Request
Continue previous planning session to expand handwriting vision training data to cover all statistics topics currently covered by text training data. Previous session (ses_327b71662ffe) established the need and began implementation but was cut off mid-edit.

### Interview Summary
**Key Discussions**:
- User wants ALL 18 missing topics covered (not a subset)
- User wants 3 responses per topic (weak + partial + strong)
- Content can be ported from `build-training.cjs` which has complete rubrics and student responses for all topics

**Research Findings**:
- Current vision data: 8 responses × 3 quality levels = 24 images across 4 topics
- Text training covers 22 topics with 283 entries
- `build-training.cjs` has ready-to-port content for ALL 18 missing topics (16 as synthetic essays, 2 as calc entries)
- Responses must be REWRITTEN for handwriting — shortened to ≤300 chars, ≤6-8 lines, ≤45 chars per line
- Score bands should VARY: weak 2-4, partial 5-7, strong 8-9 (not locked to exactly 3/6/9)

### Metis Review
**Identified Gaps** (addressed):
- **Font filename mismatch**: `Caveat[wght].ttf` downloaded but `Caveat-Regular.ttf` referenced in FONTS list. Pre-existing bug, out of scope for this plan — flagged for separate fix.
- **Line length constraint**: 860px image width ≈ 45-48 chars max per line. Must enforce via assertion.
- **"Porting" is actually "rewriting"**: Strong responses in build-training.cjs are 600-1600 chars. Handwriting responses must be ≤300 chars. This is content creation using build-training.cjs as reference, not mechanical conversion.
- **Score distribution**: Locking scores to exactly 3/6/9 creates artificial spikes. Must vary within bands.
- **Rubric format restriction**: `build_rubric_prompt()` supports only `checklist` and `steps`. All topics must use one of these.
- **One-prop and two-prop z-tests DO exist** in build-training.cjs Step 4d as calc entries — no original content needed.

---

## Work Objectives

### Core Objective
Bring vision training data to parity with text training data by covering all 22 statistics topics, providing the fine-tuned model with handwritten student work examples across the full curriculum.

### Concrete Deliverables
- 58 new RESPONSES entries in `gen-handwriting-images.py` (18 topics × 3 + 2 CI fill + 2 binomial fill)
- 18 new R_* rubric dicts added before the RESPONSES list
- Line-length validation assertion added to CELL 4
- Updated docstring reflecting new image count
- All generated outputs regenerated via script run

### Definition of Done
- [ ] `python test-data/gen-handwriting-images.py` completes with exit code 0
- [ ] Script prints `66 responses x 3 quality levels = 198 images`
- [ ] `finetune-grading-vision.jsonl` has exactly 198 lines
- [ ] `image-benchmark-cases.json` has exactly 198 cases
- [ ] Score distribution spans at least 5 distinct values
- [ ] All original 8 responses unchanged (no regression)

### Must Have
- All 22 statistics topics represented in vision training data
- 3 response quality levels per topic (weak/partial/strong)
- Line-length validation preventing future regressions
- Handwriting-realistic responses (abbreviated notation, not essay prose)

### Must NOT Have (Guardrails)
- **NO modifications to rendering pipeline** (`render_handwriting()`, quality presets, `degrade_transcription()`, `to_render_text()`)
- **NO modifications to constants** (SYSTEM, PHILOSOPHY, PARTIAL_CREDIT, SCORING_SCALE, RESPONSE_FORMAT)
- **NO new rubric format types** — all topics must use `checklist` or `steps` only
- **NO modifications to JSONL/JSON output format** or image generation pipeline
- **NO changes to existing 8 RESPONSES entries** or 4 existing R_* rubric dicts
- **NO responses longer than 300 chars** or with lines longer than 45 chars
- **NO locked score values** — scores must VARY within bands (weak 2-4, partial 5-7, strong 8-9)
- **NO essay-style prose in responses** — use abbreviated handwriting notation
- **NO generated artifacts committed to git** (images, JSONL, JSON, zip are generated outputs)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Python script with built-in validation output)
- **Automated tests**: TDD-lite — line-length assertion added BEFORE content, run after each batch
- **Framework**: Built-in Python assertions + script output verification

### QA Policy
Every task includes agent-executed QA scenarios verified by running the script and checking output.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Script execution**: Use Bash — `python test-data/gen-handwriting-images.py`, check exit code and output counts
- **Data validation**: Use Bash — parse JSONL/JSON, verify line counts, score distribution
- **Image spot-check**: Use `look_at` tool on 2-3 random new PNGs to verify readability

---

## Execution Strategy

### Parallel Execution Waves

> All content tasks are SEQUENTIAL (single-file constraint).
> Only the final verification wave runs in parallel.

```
Wave 1 (Foundation — TDD + fill gaps):
└── Task 1: Add validation + fill CI/binomial [quick]

Wave 2 (Content — sequential batches):
├── Task 2: Probability foundations (4 topics) [deep] — after Task 1
├── Task 3: Distributions (3 topics) [deep] — after Task 2
├── Task 4: Proportion & chi-square tests (4 topics) [deep] — after Task 3
├── Task 5: Comparing means (4 topics) [deep] — after Task 4
└── Task 6: Regression topics (3 topics) [deep] — after Task 5

Wave 3 (Verification):
└── Task 7: Run script + verify all outputs [unspecified-high] — after Task 6

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → F1-F4
Parallel Speedup: Minimal (single-file constraint), except final wave
Max Concurrent: 4 (Final wave only)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3, 4, 5, 6 | 1 |
| 2 | 1 | 3 | 2 |
| 3 | 2 | 4 | 2 |
| 4 | 3 | 5 | 2 |
| 5 | 4 | 6 | 2 |
| 6 | 5 | 7 | 2 |
| 7 | 6 | F1-F4 | 3 |
| F1-F4 | 7 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **5 tasks** (sequential) — T2-T6 → `deep`
- **Wave 3**: **1 task** — T7 → `unspecified-high`
- **FINAL**: **4 tasks** (parallel) — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## Topic Reference Table

> Complete enumeration of all 22 topics with their source and status.

| # | Topic | Source in build-training.cjs | Rubric Format | Vision Status |
|---|-------|---------------------------|---------------|--------------|
| 1 | One-sample t-test | Synthetic #7 | checklist | ✅ Complete (3 responses) |
| 2 | Z-score / normal probability | Original vision script | steps | ✅ Complete (3 responses) |
| 3 | Confidence intervals (proportion) | Synthetic #5 | checklist | ⚠️ Partial (1 response — need weak+strong) |
| 4 | Binomial distribution | Synthetic #3 | checklist | ⚠️ Partial (1 response — need weak+strong) |
| 5 | Experimental design | Synthetic #1 (index 0) | checklist | ❌ Missing |
| 6 | Basic probability rules | Synthetic #19 (index 18) | checklist | ❌ Missing |
| 7 | Conditional probability / Bayes | Synthetic #2 (index 1) | checklist | ❌ Missing |
| 8 | Random variables E[X], Var[X] | Synthetic #16 (index 15) | checklist | ❌ Missing |
| 9 | Geometric distribution | Synthetic #17 (index 16) | checklist | ❌ Missing |
| 10 | Normal approx to binomial | Synthetic #18 (index 17) | checklist | ❌ Missing |
| 11 | Sampling distributions / CLT | Synthetic #4 (index 3) | checklist | ❌ Missing |
| 12 | One-proportion z-test | Calc Step 4d | steps | ❌ Missing |
| 13 | Two-proportion z-test | Calc Step 4d | steps | ❌ Missing |
| 14 | Chi-square GOF | Synthetic #12 (index 11) | checklist | ❌ Missing |
| 15 | Chi-square independence | Synthetic #6 (index 5) | checklist | ❌ Missing |
| 16 | Two-sample t-test | Synthetic #9 (index 8) | checklist | ❌ Missing |
| 17 | Paired t-test | Synthetic #10 (index 9) | checklist | ❌ Missing |
| 18 | Power of a test | Synthetic #14 (index 13) | checklist | ❌ Missing |
| 19 | ANOVA | Synthetic #13 (index 12) | checklist | ❌ Missing |
| 20 | Linear regression basics | Synthetic #8 (index 7) | checklist | ❌ Missing |
| 21 | Outliers in regression | Synthetic #20 (index 19) | checklist | ❌ Missing |
| 22 | Inference for regression slope | Synthetic #15 (index 14) | checklist | ❌ Missing |

---

## Response Style Guide (CRITICAL — applies to ALL new content)

> Every new student response MUST follow these constraints. Failure = broken images.

### Hard Constraints
- **Max 45 chars per rendered line** (after `to_render_text()` Unicode conversion)
- **Max 8 lines per response**
- **Max 300 chars total per response**
- **Use Unicode math** in the `text` field (μ, σ, α, √, ≠, etc.) — `to_render_text()` converts before rendering

### Style Rules
Write as a student would BY HAND — abbreviated notation, not essay prose:
- ✅ `"H₀: μ=20, H₁: μ≠20 (two-tailed)\nt = (17.5-20)/(4.2/√16) = -2.38\ndf=15, t*=2.131\n|t|>t* → reject H₀"`
- ❌ `"The null hypothesis states that the true mean weekly study time is 20 hours. The alternative hypothesis states that the true mean differs from 20 hours..."`

### Rubric Conversion Pattern
From `build-training.cjs` checklistItems → Python `checklist` list:
```
JS:  { category: "Hypotheses (2 pts)", points: 2, items: ["H₀: μ=20", "H₁: μ≠20"] }
PY:  "Hypotheses (2 pts): H0: u=20; H1: u!=20"
```
Flatten category + items into single string. Points in parenthetical. Sub-items joined with semicolons.

### Score Band Guidance
| Band | Score Range | Character |
|------|-----------|-----------|
| Weak | 2-4 | Wrong approach, missing key concepts, major errors |
| Partial | 5-7 | Correct approach, some gaps, partial credit |
| Strong | 8-9 | Thorough, accurate, minor omissions at most |

### ID Naming Pattern
Follow existing: `{topic_slug}_{quality_band}` — e.g., `paired_t_weak`, `anova_partial`, `regression_strong`

---

## TODOs

- [x] 1. Add Line-Length Validation + Fill CI/Binomial Gaps

  **What to do**:
  1. Add a validation block at the end of CELL 4 (after the RESPONSES list and before CELL 5) that checks ALL responses:
     ```python
     # Validate response text constraints
     for resp in RESPONSES:
         lines = to_render_text(resp["text"]).split("\n")
         for i, line in enumerate(lines):
             assert len(line) <= 50, f"{resp['id']} line {i+1} is {len(line)} chars: '{line[:60]}'"
         assert len(lines) <= 10, f"{resp['id']} has {len(lines)} lines (max 10)"
     print(f"All {len(RESPONSES)} responses pass length validation.")
     ```
  2. Verify existing 8 responses pass this validation — run the script FIRST before adding new content
  3. Add `ci_weak` (score 3) and `ci_strong` (score 9) responses to the CI section, referencing `R_CONF_INT`
  4. Add `binomial_weak` (score 3) and `binomial_strong` (score 9) responses to the binomial section, referencing `R_BINOMIAL`
  5. Write responses in handwriting style (abbreviated notation, ≤45 chars/line, ≤8 lines)

  **CI weak (score ~3)** reference from build-training.cjs synthetic #5, score 3 entry:
  Student gets p-hat right but botches SE formula and gives wrong interpretation ("95% probability"). Shorten to ~4 lines.

  **CI strong (score ~9)** reference from build-training.cjs synthetic #5, score 9 entry:
  Full conditions check, correct calculation, proper "95% confident" interpretation. Shorten to ~6 lines.

  **Binomial weak (score ~3)** reference from build-training.cjs synthetic #3, score 3 entry:
  Tries to multiply p × n instead of using binomial formula. No conditions check. Shorten to ~3 lines.

  **Binomial strong (score ~9)** reference from build-training.cjs synthetic #3, score 9 entry:
  All 4 conditions verified, correct C(8,5) calculation, clear interpretation. Shorten to ~6 lines.

  **Must NOT do**:
  - Modify existing 8 RESPONSES entries or 4 R_* rubric dicts
  - Change any constants, rendering functions, or output pipeline
  - Write essay-style prose — use handwriting abbreviations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small scope — 4 new entries + 1 validation block, clear pattern to follow
  - **Skills**: []
    - No specialized skills needed — straightforward Python editing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `test-data/gen-handwriting-images.py:487-512` — Existing CI and binomial RESPONSES entries (pattern for new entries)
  - `test-data/gen-handwriting-images.py:416-453` — T-test responses showing 3-level weak/partial/strong pattern to follow
  - `test-data/gen-handwriting-images.py:126-131` — `to_render_text()` function showing Unicode→ASCII conversion

  **API/Type References**:
  - `test-data/gen-handwriting-images.py:386-408` — R_CONF_INT and R_BINOMIAL rubric dicts (reference these in new entries)

  **Content References**:
  - `test-data/build-training.cjs:383-397` — Confidence interval synthetic entries with 3 quality levels (use as content reference, rewrite for handwriting)
  - `test-data/build-training.cjs:350-365` — Binomial synthetic entries with 3 quality levels (use as content reference, rewrite for handwriting)

  **WHY Each Reference Matters**:
  - Lines 487-512: Shows existing CI/binomial entries — new entries must match this exact structure
  - Lines 416-453: Shows t-test weak/partial/strong pattern — demonstrates the ID naming, score assignments, and text density expected
  - Lines 126-131: Shows what Unicode chars get converted — write text using μ, σ, √ etc., NOT their ASCII equivalents
  - build-training.cjs lines: Source material for the CONTENT of responses — but must be drastically shortened for handwriting style

  **Acceptance Criteria**:

  - [ ] Validation block added after RESPONSES list
  - [ ] `python test-data/gen-handwriting-images.py` exits with code 0
  - [ ] Script prints `12 responses x 3 quality levels = 36 images`
  - [ ] Existing 8 responses unchanged (verify IDs: t_test_weak, t_test_partial, t_test_strong, z_score_wrong, z_score_partial, z_score_strong, ci_partial, binomial_partial)
  - [ ] New entries: ci_weak, ci_strong, binomial_weak, binomial_strong present
  - [ ] All response lines ≤ 50 chars after to_render_text() conversion

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script runs with validation passing
    Tool: Bash
    Preconditions: gen-handwriting-images.py has validation + 4 new entries
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Check exit code is 0
      3. Verify stdout contains "12 responses x 3 quality levels = 36 images"
      4. Verify stdout contains "All 12 responses pass length validation"
    Expected Result: Exit 0, all counts match
    Failure Indicators: Non-zero exit, assertion error, wrong count
    Evidence: .sisyphus/evidence/task-1-script-run.txt

  Scenario: New entries have correct IDs and scores
    Tool: Bash
    Preconditions: Script completed successfully
    Steps:
      1. Run: python -c "import json; entries=[json.loads(l) for l in open('test-data/finetune-grading-vision.jsonl')]; ids=[e['_meta']['id'] for e in entries]; print([i for i in ids if 'ci_' in i or 'binomial_' in i])"
      2. Verify output contains: ci_weak, ci_partial, ci_strong, binomial_weak, binomial_partial, binomial_strong (each × 3 quality levels = 18 entries)
    Expected Result: All 6 response IDs present across 3 quality levels
    Failure Indicators: Missing IDs, wrong count
    Evidence: .sisyphus/evidence/task-1-ids-check.txt

  Scenario: No existing responses modified
    Tool: Bash
    Preconditions: Script completed
    Steps:
      1. Run: grep -c '"t_test_weak"' test-data/finetune-grading-vision.jsonl
      2. Verify count = 3 (one per quality level)
      3. Repeat for all 8 original IDs
    Expected Result: Each original ID appears exactly 3 times
    Failure Indicators: Count ≠ 3 for any original ID
    Evidence: .sisyphus/evidence/task-1-regression-check.txt
  ```

  **Commit**: YES (Commit 1)
  - Message: `feat(vision): add line-length validation and fill CI/binomial responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: `cd test-data && python gen-handwriting-images.py`

- [x] 2. Add Probability Foundation Topics (4 topics, 12 responses)

  **What to do**:
  Add 4 probability topics with 3 responses each (weak/partial/strong). For each topic:
  1. Create an R_* rubric dict (before RESPONSES list) using `question` + `checklist` keys
  2. Add 3 RESPONSES entries referencing the rubric
  3. Write responses in handwriting style (≤45 chars/line, ≤8 lines, abbreviated notation)
  4. Vary scores within bands (weak 2-4, partial 5-7, strong 8-9)
  5. Run validation to confirm line lengths pass

  **Topics in this batch**:
  - **Experimental design** (R_EXPER_DESIGN) — Score suggestion: weak=3, partial=6, strong=9
  - **Basic probability rules** (R_BASIC_PROB) — Score suggestion: weak=3, partial=6, strong=9
  - **Conditional probability / Bayes** (R_COND_PROB) — Score suggestion: weak=2, partial=5, strong=9
  - **Random variables E[X], Var[X]** (R_RANDOM_VAR) — Score suggestion: weak=3, partial=6, strong=9

  **Must NOT do**:
  - Write essay-style prose — students writing by hand use formulas and short phrases
  - Use ASCII equivalents in `text` field — use Unicode (μ, σ, √, etc.) and let `to_render_text()` handle conversion
  - Exceed 45 chars per rendered line or 8 lines per response
  - Modify existing entries, constants, or pipeline code

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Content creation requiring statistical accuracy + handwriting style adaptation. Must carefully condense multi-paragraph responses to ≤300 char handwriting notation while preserving mathematical correctness.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential with Tasks 3-6)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `test-data/gen-handwriting-images.py:358-370` — R_T_TEST rubric dict pattern (checklist format)
  - `test-data/gen-handwriting-images.py:372-382` — R_Z_SCORE rubric dict pattern (steps format)
  - `test-data/gen-handwriting-images.py:416-453` — T-test RESPONSES entries (3-level pattern with handwriting-style text)

  **Content References** (use as SOURCE MATERIAL — rewrite for handwriting):
  - `test-data/build-training.cjs:319-332` — Experimental design: rubric, model answer, 3 student responses
  - `test-data/build-training.cjs:645-659` — Basic probability rules: rubric, model answer, 3 student responses
  - `test-data/build-training.cjs:335-348` — Conditional probability: rubric, model answer, 3 student responses
  - `test-data/build-training.cjs:596-611` — Random variables E[X]/Var[X]: rubric, model answer, 3 student responses

  **Response Style Reference** (this is how finished responses should look):
  - `test-data/gen-handwriting-images.py:428-438` — t_test_partial (score 6): 5 lines, ~250 chars, formula+result notation
  - `test-data/gen-handwriting-images.py:460-461` — z_score_wrong (score 2): 3 lines, ~86 chars, shows wrong approach

  **WHY Each Reference Matters**:
  - R_T_TEST pattern: Copy this EXACT structure for new R_* dicts — keys must be `question` + `checklist` list of strings
  - T-test RESPONSES: These are the GOLD STANDARD for how handwriting responses should look — match this density, abbreviation style, and line count
  - build-training.cjs content: The MATHEMATICAL SUBSTANCE to distill — rubric questions, checklist criteria, and student responses contain the correct statistics content to port
  - z_score_wrong: Shows what a weak/wrong response looks like — short, uses wrong approach, partial credit only

  **Acceptance Criteria**:

  - [ ] 4 new R_* rubric dicts added (R_EXPER_DESIGN, R_BASIC_PROB, R_COND_PROB, R_RANDOM_VAR)
  - [ ] 12 new RESPONSES entries added with correct IDs
  - [ ] `python test-data/gen-handwriting-images.py` exits 0
  - [ ] Script prints `24 responses x 3 quality levels = 72 images`
  - [ ] All response lines pass validation (≤50 chars after conversion)
  - [ ] Scores span at least 3 distinct values in this batch

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script runs with 24 responses
    Tool: Bash
    Preconditions: Task 1 complete, 4 new topics added
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Verify exit code 0
      3. Verify stdout contains "24 responses x 3 quality levels = 72 images"
      4. Verify stdout contains "All 24 responses pass length validation"
    Expected Result: Exit 0, 72 images generated
    Failure Indicators: Assertion error (line too long), wrong count
    Evidence: .sisyphus/evidence/task-2-script-run.txt

  Scenario: New topic IDs present in output
    Tool: Bash
    Preconditions: Script completed
    Steps:
      1. Run: python -c "import json; entries=[json.loads(l) for l in open('test-data/finetune-grading-vision.jsonl')]; ids=set(e['_meta']['id'].rsplit('_',1)[0] for e in entries); print(sorted(ids))"
      2. Verify output includes: exper_design_weak, basic_prob_weak, cond_prob_weak, random_var_weak (and partial/strong variants)
    Expected Result: All 4 new topic prefixes present
    Failure Indicators: Missing topic IDs
    Evidence: .sisyphus/evidence/task-2-topics-check.txt
  ```

  **Commit**: NO (groups with Task 3 in Commit 2)

- [x] 3. Add Distribution Topics (3 topics, 9 responses)

  **What to do**:
  Add 3 distribution topics with 3 responses each (weak/partial/strong). For each topic:
  1. Create an R_* rubric dict using `question` + `checklist` keys
  2. Add 3 RESPONSES entries referencing the rubric
  3. Write responses in handwriting style (≤45 chars/line, ≤8 lines, abbreviated notation)
  4. Vary scores within bands
  5. Run validation to confirm line lengths pass

  **Topics in this batch**:
  - **Geometric distribution** (R_GEOMETRIC) — Score suggestion: weak=3, partial=6, strong=9
  - **Normal approximation to binomial** (R_NORM_APPROX) — Score suggestion: weak=3, partial=6, strong=9
  - **Sampling distributions / CLT** (R_CLT) — Score suggestion: weak=2, partial=5, strong=9

  **Must NOT do**:
  - Modify existing entries, constants, or pipeline code
  - Write essay prose — use formulas and short notation
  - Exceed line length constraints

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Statistical content requiring accuracy — CLT, geometric distribution, and normal approximation involve precise formulas and interpretations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `test-data/gen-handwriting-images.py:358-370` — R_T_TEST checklist rubric pattern
  - `test-data/gen-handwriting-images.py:416-453` — T-test RESPONSES pattern (handwriting style)

  **Content References**:
  - `test-data/build-training.cjs:613-627` — Geometric distribution: rubric, model answer, 3 responses
  - `test-data/build-training.cjs:629-643` — Normal approximation to binomial: rubric, model answer, 3 responses
  - `test-data/build-training.cjs:366-381` — Sampling distributions / CLT: rubric, model answer, 3 responses

  **WHY Each Reference Matters**:
  - build-training.cjs content: Contains the complete statistics content (rubric questions, correct answers, student responses at 3 levels). Rewrite these for handwriting format.
  - Geometric responses involve the formula P(X=k)=(1-p)^(k-1)×p — must be concise for handwriting
  - Normal approx requires continuity correction — responses should show z-score calculation step-by-step in short notation

  **Acceptance Criteria**:

  - [ ] 3 new R_* rubric dicts added (R_GEOMETRIC, R_NORM_APPROX, R_CLT)
  - [ ] 9 new RESPONSES entries added
  - [ ] `python test-data/gen-handwriting-images.py` exits 0
  - [ ] Script prints `33 responses x 3 quality levels = 99 images`
  - [ ] All line lengths pass validation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script runs with 33 responses
    Tool: Bash
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Verify exit code 0 and stdout contains "33 responses"
    Expected Result: Exit 0, 99 images
    Evidence: .sisyphus/evidence/task-3-script-run.txt

  Scenario: Geometric formula renders correctly
    Tool: look_at
    Steps:
      1. Open test-data/handwriting-images/ and find a geometric_* image
      2. Verify the formula P(X=k) notation is visible and readable
    Expected Result: Formula text clearly readable, no overflow
    Evidence: .sisyphus/evidence/task-3-geometric-image.png
  ```

  **Commit**: YES (Commit 2 — combined with Task 2)
  - Message: `feat(vision): add probability and distribution topic responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: `cd test-data && python gen-handwriting-images.py`

- [x] 4. Add Proportion & Chi-Square Test Topics (4 topics, 12 responses)

  **What to do**:
  Add 4 testing topics with 3 responses each. For each topic:
  1. Create an R_* rubric dict
  2. Add 3 RESPONSES entries
  3. Follow handwriting style constraints
  4. Run validation after adding

  **Topics in this batch**:
  - **One-proportion z-test** (R_ONE_PROP_Z) — use `steps` format (calc-style rubric). Score: weak=2, partial=6, strong=9
  - **Two-proportion z-test** (R_TWO_PROP_Z) — use `steps` format. Score: weak=3, partial=6, strong=9
  - **Chi-square GOF** (R_CHI_GOF) — use `checklist` format. Score: weak=3, partial=6, strong=9. Pick ONE scenario context from build-training.cjs (die rolls recommended — simplest for handwriting).
  - **Chi-square independence** (R_CHI_INDEP) — use `checklist` format. Score: weak=3, partial=6, strong=9

  **Must NOT do**:
  - Modify existing entries, constants, or pipeline code
  - Include multiple scenario contexts for chi-square GOF (pick ONE)
  - Add new rubric format types (use `checklist` or `steps` only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Proportion z-tests require precise formula work; chi-square GOF has a unique calibration format in build-training.cjs that must be adapted to standard format
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `test-data/gen-handwriting-images.py:372-382` — R_Z_SCORE steps-format rubric (use this pattern for proportion z-tests)
  - `test-data/gen-handwriting-images.py:358-370` — R_T_TEST checklist-format rubric (use for chi-square topics)

  **Content References**:
  - `test-data/build-training.cjs:497-545` — Chi-square GOF calibration entries (3 contexts × 2 patterns = 6 entries). Extract ONE context (die rolls) and create standard weak/partial/strong responses.
  - `test-data/build-training.cjs:399-412` — Chi-square independence: rubric, model answer, 3 responses
  - For one-prop and two-prop z-tests: search `build-training.cjs` Step 4d for "one-proportion" and "two-proportion" calc entries

  **WHY Each Reference Matters**:
  - R_Z_SCORE pattern: The proportion z-tests are calculation problems — use `steps` format like z-score
  - Chi-square GOF has a UNIQUE structure in build-training.cjs (calibration with 3 scenarios × 2 patterns). Simplify to ONE scenario with standard weak/partial/strong
  - Chi-square independence content maps directly to a checklist rubric

  **Acceptance Criteria**:

  - [ ] 4 new R_* rubric dicts added
  - [ ] 12 new RESPONSES entries added
  - [ ] Script prints `45 responses x 3 quality levels = 135 images`
  - [ ] All line lengths pass validation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script runs with 45 responses
    Tool: Bash
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Verify exit 0 and "45 responses"
    Expected Result: Exit 0, 135 images
    Evidence: .sisyphus/evidence/task-4-script-run.txt

  Scenario: Proportion z-test uses steps format
    Tool: Bash
    Steps:
      1. Run: python -c "exec(open('test-data/gen-handwriting-images.py').read().split('CELL 5')[0]); r=[r for r in RESPONSES if 'one_prop' in r['id']]; print(r[0]['rubric'].keys())"
      2. Verify output shows 'steps' key (not 'checklist')
    Expected Result: Rubric has 'steps' key
    Evidence: .sisyphus/evidence/task-4-format-check.txt
  ```

  **Commit**: NO (groups with Task 5 in Commit 3)

- [x] 5. Add Comparing Means Topics (4 topics, 12 responses)

  **What to do**:
  Add 4 hypothesis testing topics with 3 responses each.

  **Topics in this batch**:
  - **Two-sample t-test** (R_TWO_SAMPLE_T) — Score: weak=3, partial=6, strong=9
  - **Paired t-test** (R_PAIRED_T) — Score: weak=3, partial=6, strong=9
  - **ANOVA** (R_ANOVA) — Score: weak=3, partial=6, strong=9
  - **Power of a test** (R_POWER) — Score: weak=3, partial=6, strong=9

  **Must NOT do**:
  - Modify existing entries or pipeline code
  - Write essay prose
  - Exceed line length constraints

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Paired t-test requires explaining WHY paired (not just how), ANOVA requires F-statistic conceptual explanation — both need careful condensation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:

  **Content References**:
  - `test-data/build-training.cjs:447-462` — Two-sample t-test: rubric, model answer, 3 responses
  - `test-data/build-training.cjs:464-478` — Paired t-test: rubric, model answer, 3 responses
  - `test-data/build-training.cjs:547-561` — ANOVA: rubric, model answer, 3 responses
  - `test-data/build-training.cjs:564-578` — Power of a test: rubric, model answer, 3 responses

  **Pattern References**:
  - `test-data/gen-handwriting-images.py:416-453` — T-test responses (these are the closest pattern — two-sample and paired t-tests follow similar structure)

  **WHY Each Reference Matters**:
  - Two-sample t-test has a pooled SE formula that students write as √(s₁²/n₁ + s₂²/n₂) — ensure this fits in 45 chars
  - Paired t-test: the weak response should show the common mistake of using a two-sample test instead
  - ANOVA: conceptual topic — weak response should confuse F with t, partial should get the basics, strong should explain why not multiple t-tests
  - Power: mostly conceptual — handwriting responses should be formula-light, concept-heavy

  **Acceptance Criteria**:

  - [ ] 4 new R_* rubric dicts added
  - [ ] 12 new RESPONSES entries added
  - [ ] Script prints `57 responses x 3 quality levels = 171 images`
  - [ ] All line lengths pass validation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script runs with 57 responses
    Tool: Bash
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Verify exit 0 and "57 responses"
    Expected Result: Exit 0, 171 images
    Evidence: .sisyphus/evidence/task-5-script-run.txt

  Scenario: Paired t-test weak shows common mistake
    Tool: Bash
    Steps:
      1. Parse JSONL, find paired_t_weak entries
      2. Verify score is 2-4 range
      3. Verify response text does NOT contain correct d-bar formula
    Expected Result: Weak response shows wrong approach (e.g., uses two-sample formula)
    Evidence: .sisyphus/evidence/task-5-paired-t-check.txt
  ```

  **Commit**: YES (Commit 3 — combined with Task 4)
  - Message: `feat(vision): add testing and comparison topic responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: `cd test-data && python gen-handwriting-images.py`

- [x] 6. Add Regression & Design Topics (3 topics, 9 responses)

  **What to do**:
  Add final 3 topics with 3 responses each.

  **Topics in this batch**:
  - **Linear regression basics** (R_REGRESSION) — Score: weak=3, partial=6, strong=9
  - **Outliers in regression** (R_OUTLIERS) — Score: weak=3, partial=6, strong=9
  - **Inference for regression slope** (R_SLOPE_INF) — Score: weak=3, partial=6, strong=9

  **Must NOT do**:
  - Modify existing entries or pipeline code
  - Write essay prose
  - Exceed line length constraints

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Regression topics involve interpretation (slope meaning, R², leverage vs influence) that must be condensed to handwriting notation without losing nuance
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:

  **Content References**:
  - `test-data/build-training.cjs:431-445` — Linear regression: rubric, model answer, 3 responses
  - `test-data/build-training.cjs:661-672` — Outliers in regression: rubric, model answer, 3 responses (read remainder at offset 673)
  - `test-data/build-training.cjs:580-594` — Inference for regression slope: rubric, model answer, 3 responses

  **WHY Each Reference Matters**:
  - Linear regression: slope/intercept interpretation needs shortening from full sentences to "slope 4.3: +4.3 pts per hr studied"
  - Outliers: leverage vs influence is conceptual — handwriting responses should focus on identifying the specific point as influential
  - Regression slope inference: involves t-test + CI for β₁ — calculation-heavy, good for handwriting notation

  **Acceptance Criteria**:

  - [ ] 3 new R_* rubric dicts added
  - [ ] 9 new RESPONSES entries added
  - [ ] Script prints `66 responses x 3 quality levels = 198 images`
  - [ ] All line lengths pass validation
  - [ ] This is the FINAL content task — all 22 topics now have vision data

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 22 topics present in final output
    Tool: Bash
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Verify exit 0 and "66 responses x 3 quality levels = 198 images"
      3. Run: python -c "import json; topics=set(); [topics.add(e['_meta']['id'].rsplit('_',2)[0]) for e in [json.loads(l) for l in open('finetune-grading-vision.jsonl')]]; print(f'{len(topics)} topics:', sorted(topics))"
      4. Verify at least 20 unique topic prefixes
    Expected Result: 198 images, 20+ topic prefixes
    Evidence: .sisyphus/evidence/task-6-all-topics.txt

  Scenario: Score distribution is diverse
    Tool: Bash
    Steps:
      1. Run: python -c "import json; scores=set(); [scores.add(json.loads(l)['_meta']['score']) for l in open('test-data/finetune-grading-vision.jsonl')]; print(f'{len(scores)} distinct:', sorted(scores))"
      2. Verify ≥5 distinct score values
    Expected Result: At least 5 distinct scores (e.g., 2, 3, 5, 6, 9)
    Evidence: .sisyphus/evidence/task-6-score-dist.txt
  ```

  **Commit**: YES (Commit 4)
  - Message: `feat(vision): add regression topic responses — complete 22-topic coverage`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: `cd test-data && python gen-handwriting-images.py`

- [x] 7. Final Verification & Docstring Update

  **What to do**:
  1. Update the module docstring at line 23 from "24 PNG files (8 responses × 3 quality levels)" to "198 PNG files (66 responses × 3 quality levels)"
  2. Run the complete script one final time from clean state
  3. Verify ALL acceptance criteria from the plan
  4. Spot-check 6 random new images for readability (2 per quality level: good/medium/bad)
  5. Verify JSONL is valid JSON on every line
  6. Verify benchmark JSON has correct structure
  7. Verify zip file created and contains all outputs
  8. Verify score distribution across all 198 entries

  **Must NOT do**:
  - Modify response content
  - Change pipeline code
  - Commit generated artifacts (images, JSONL, JSON, zip)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive verification task requiring script execution, JSON parsing, image inspection, and data validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:

  **Verification References**:
  - `test-data/gen-handwriting-images.py:1-26` — Module docstring to update
  - `test-data/gen-handwriting-images.py:584` — VISION_JSONL output filename
  - `test-data/gen-handwriting-images.py:634` — BENCHMARK_JSON output filename

  **WHY Each Reference Matters**:
  - Line 23: Docstring references "24 PNG files" — must be updated to "198 PNG files (66 responses × 3 quality levels)"
  - Lines 584/634: These are the output files to verify

  **Acceptance Criteria**:

  - [ ] Docstring updated with correct counts
  - [ ] Script exits 0 and prints correct totals
  - [ ] `wc -l test-data/finetune-grading-vision.jsonl` = 198
  - [ ] `image-benchmark-cases.json` has 198 cases
  - [ ] Score distribution spans ≥5 distinct values
  - [ ] 6 random images visually verified (2 good, 2 medium, 2 bad quality)
  - [ ] All JSONL lines are valid JSON
  - [ ] Zip file created with all outputs

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Complete end-to-end verification
    Tool: Bash
    Preconditions: All content tasks (1-6) complete
    Steps:
      1. Run: cd test-data && python gen-handwriting-images.py
      2. Verify: exit 0, "66 responses x 3 quality levels = 198 images"
      3. Run: wc -l finetune-grading-vision.jsonl → expect 198
      4. Run: python -c "import json; d=json.load(open('image-benchmark-cases.json')); print(len(d['cases']))" → expect 198
      5. Run: python -c "import json; scores=set(); [scores.add(json.loads(l)['_meta']['score']) for l in open('finetune-grading-vision.jsonl')]; print(f'{len(scores)} distinct:', sorted(scores))" → expect ≥5
      6. Run: python -c "import json; [json.loads(l) for l in open('finetune-grading-vision.jsonl')]; print('All 198 lines valid JSON')" → no errors
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/task-7-final-verify.txt

  Scenario: Image spot-check (6 random images)
    Tool: look_at
    Steps:
      1. Pick 2 "good" quality images from new topics (e.g., anova, geometric)
      2. Pick 2 "medium" quality images from different new topics
      3. Pick 2 "bad" quality images from different new topics
      4. For each: verify text is readable, no overflow past right edge, handwriting quality matches level
    Expected Result: All 6 images readable with appropriate quality degradation
    Evidence: .sisyphus/evidence/task-7-image-spot-check/

  Scenario: Docstring reflects correct counts
    Tool: Bash
    Steps:
      1. Run: head -26 test-data/gen-handwriting-images.py | grep "198"
      2. Verify line 23 mentions "198 PNG files" or "66 responses × 3 quality levels"
    Expected Result: Docstring updated
    Evidence: .sisyphus/evidence/task-7-docstring.txt
  ```

  **Commit**: YES (Commit 5)
  - Message: `feat(vision): update docstring, finalize 198-image vision dataset`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: Full verification commands from Success Criteria section

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run script, check output). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Verify all 22 topics present in RESPONSES list. Compare RESPONSES count (should be 66). Check evidence files exist in .sisyphus/evidence/.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Review all changes to gen-handwriting-images.py. Check: consistent ID naming, no duplicate IDs, all rubric references valid, proper Unicode usage, line lengths within bounds, score diversity, no accidental modification of existing code. Run the line-length validation.
  Output: `IDs [N unique/N total] | Line lengths [PASS/FAIL] | Scores [N distinct] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Run `python test-data/gen-handwriting-images.py` from scratch. Verify output counts match expectations (66 responses, 198 images). Open 6 random new PNG images with `look_at` tool — verify text is readable, no overflow, handwriting quality varies by level. Parse JSONL and verify all 198 entries have valid JSON with required keys. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Script [PASS/FAIL] | Images [N/N readable] | JSONL [N/N valid] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task in the plan: read "What to do", diff actual changes. Verify 1:1 — all specified topics were added (none missing), no unspecified topics were added (no creep). Verify existing 8 responses are byte-identical to originals. Check "Must NOT do" compliance: no pipeline modifications, no new rubric formats, no constants changed.
  Output: `Tasks [N/N compliant] | Existing entries [UNCHANGED/MODIFIED] | Guardrails [N/N respected] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Task 1): `feat(vision): add line-length validation and fill CI/binomial responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: Verify script runs, prints "12 responses x 3 = 36 images"

- **Commit 2** (after Task 2-3): `feat(vision): add probability and distribution topic responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: Verify script runs, prints "33 responses x 3 = 99 images"

- **Commit 3** (after Task 4-5): `feat(vision): add testing and comparison topic responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: Verify script runs, prints "57 responses x 3 = 171 images"

- **Commit 4** (after Task 6): `feat(vision): add regression topic responses`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: Verify script runs, prints "66 responses x 3 = 198 images"

- **Commit 5** (after Task 7): `feat(vision): update docstring, finalize 198-image vision dataset`
  - Files: `test-data/gen-handwriting-images.py`
  - Pre-commit: Full QA — all acceptance criteria pass

Do NOT commit generated artifacts (images/, JSONL, JSON, zip).

---

## Success Criteria

### Verification Commands
```bash
cd test-data && python gen-handwriting-images.py  # Expected: exits 0, prints "66 responses x 3 quality levels = 198 images"
wc -l test-data/finetune-grading-vision.jsonl     # Expected: 198
python -c "import json; d=json.load(open('test-data/image-benchmark-cases.json')); print(len(d['cases']))"  # Expected: 198
python -c "import json; scores=set(); [scores.add(json.loads(l)['_meta']['score']) for l in open('test-data/finetune-grading-vision.jsonl')]; print(f'{len(scores)} distinct scores:', sorted(scores))"  # Expected: ≥5 distinct scores
```

### Final Checklist
- [ ] All 22 topics represented (18 new + 4 existing)
- [ ] 66 total responses (58 new + 8 existing)
- [ ] 198 total images (174 new + 24 existing)
- [ ] Line-length validation assertion present and passing
- [ ] Score distribution spans ≥5 distinct values
- [ ] No modifications to rendering pipeline or constants
- [ ] No essay-style prose in responses
- [ ] All generated artifacts regenerated via single script run
- [ ] Docstring updated with correct image count
