# Grading Prompt Optimization V2 — 95% Agreement Target

## TL;DR

> **Quick Summary**: Optimize O.G.R.E.'s grading prompt to achieve 95% agreement (±1 point) with Claude Sonnet 4.6 across GLM-5 and Qwen35-FT, using VAPO zero-shot for structural suggestions followed by targeted benchmark-driven prompt refinement focused on the 2-3 disagreeing students. Also redesign the feedback format to be criterion-driven: state the rubric criterion, quote what the student said, then explain why it was right/wrong.
> 
> **Deliverables**:
> - Fresh 3-model × 3-run baseline benchmark
> - VAPO zero-shot structural analysis of current prompt
> - Targeted prompt modifications to `grading-constants.js` and `grading.js`
> - Redesigned feedback format instructions (criterion → student quote → evaluation)
> - Post-optimization benchmark comparison showing improvement
> - Synced server-bundle copies
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (baseline) → T3 (VAPO analysis) → T4 (disagreement analysis) → T5 (prompt patches) → T6 (re-benchmark) → T7 (iterate if needed) → T8 (sync + final)

---

## Context

### Original Request
Optimize the grading prompt to achieve 95% agreement rate with Claude Sonnet 4.6 as the gold standard. The fine-tuned Qwen3.5-9B model (stat-grader) has 415 training examples. Use VAPO zero-shot for initial structural rewrite, then iterate via benchmarks. Run glm-5:cloud, sonnet4.6, and stat-grader with 3 runs each, comparing run-to-run and model-to-model.

### Interview Summary
**Key Discussions**:
- `enhance-prompt` from skills.sh is for Stitch UI — not applicable. User agreed to VAPO + iterative approach.
- stat-grader = `qwen3.5-9B-stat-grader:latest` (Qwen35-FT), confirmed
- Start with fresh baseline (previous benchmark-results.json has null data)
- Current agreement at 92% (23/25 students within ±1 point) per March 8 report
- **Feedback format redesign**: User wants criterion-driven feedback — state criterion, quote student, explain right/wrong. Keep teacher-to-student tone. Note contradictions gently. Applies to all 3 feedback locations in grading.js (batch line 233, outlier line 600, single line 828).

**Research Findings**:
- VAPO zero-shot is model-independent but calibrated for Gemini — treat as structural inspiration, not drop-in replacement
- Fine-tuned model was trained on CURRENT prompt format — changing prompt structure risks FT regression
- Benchmark pipeline exists in `test-data/run-benchmark.js` with full CLI flag support
- Server-bundle must be synced after grading-server changes

### Metis Review
**Identified Gaps** (addressed):
- **Statistical significance at N=25**: 95% CI for 23/25 = [81%, 100%]. Cannot statistically distinguish 92% from 95% at this sample size. Need ~200-300 students for reliable detection. **Mitigation**: Define success as consistent 24+/25 across ≥2 of 3 runs, validated on second dataset (biology)
- **VAPO is Gemini-centric**: Zero-shot guidelines calibrated for Gemini/PaLM models, not Claude/GLM/Qwen. **Mitigation**: Downgrade to "structural suggestion source" — manually evaluate and cherry-pick applicable improvements
- **FT model regression risk**: Research shows "better" prompts can break fine-tuned models trained on original format. **Mitigation**: Test EVERY change on Qwen35-FT first (local, fast); reject if agreement drops >4pp
- **Test set overfitting**: Iterating on same 25 students risks prompt tuning to those specific responses. **Mitigation**: Cross-validate on biology dataset after each promising change
- **Focus on disagreeing students**: The gap is 1-2 students. Analyze WHY those specific students disagree, then write targeted clarifications rather than wholesale rewrites

---

## Work Objectives

### Core Objective
Close the gap from 92% → 95% agreement (±1 point) between Sonnet 4.6 and the other models (GLM-5, Qwen35-FT), via targeted prompt refinements informed by VAPO structural analysis and disagreement pattern analysis.

### Concrete Deliverables
- `test-data/baseline-v2.json` + `test-data/baseline-v2.md` — fresh baseline benchmark
- `test-data/vapo-analysis.md` — VAPO zero-shot suggestions + manual evaluation
- Modified `grading-server/grading-constants.js` — refined GRADING_PHILOSOPHY and/or SCORING_SCALE_DESCRIPTORS
- Modified `grading-server/grading.js` — refined prompt assembly + redesigned feedback format instructions
- `test-data/optimized-v2.json` + `test-data/optimized-v2.md` — post-optimization benchmark
- Synced `ogre-desktop/src-tauri/binaries/server-bundle/` files

### Definition of Done
- [ ] Post-optimization agreement ≥ 95% (24+/25) in ≥2 of 3 runs for BOTH GLM-5 vs Sonnet AND Qwen35-FT vs Sonnet
- [ ] OR: Documented plateau with analysis of remaining disagreements and recommended next steps
- [ ] Feedback format redesigned in all 3 locations (batch, outlier, single)
- [ ] Qwen35-FT agreement did NOT regress by >4pp from baseline
- [ ] `bun test --run` in `grading-server/` passes
- [ ] Server-bundle files synced and verified

### Must Have
- Fresh baseline with current prompt before any changes
- VAPO zero-shot analysis of assembled prompt
- Disagreement analysis identifying which students and rubric criteria cause divergence
- Redesigned feedback format: criterion → student quote → evaluation (in all 3 feedback instruction locations)
- Cross-validation on biology dataset for any promising changes
- Qwen35-FT regression check on every prompt change
- 3 runs × 3 models for every benchmark comparison

### Must NOT Have (Guardrails)
- MUST NOT wholesale rewrite the prompt — prefer targeted additions/clarifications over structural rewrites (FT regression risk)
- MUST NOT modify response parsing (`parseBatchResponse`, `parseSingleGradeResponse`)
- MUST NOT change virtual-10 scale logic, scoring anchor percentages, or outlier detection
- MUST NOT iterate more than 3 prompt variants without cross-validating on biology dataset
- MUST NOT claim "95% achieved" based on a single run — require ≥2 of 3 runs
- MUST NOT change the fine-tuned model's Modelfile or retrain the model
- MUST NOT modify the JSON response format expected by parseBatchResponse

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest in `grading-server/test/`)
- **Automated tests**: Tests-after (run existing tests for regression)
- **Framework**: Vitest (existing `grading-server/test/`)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Benchmarks**: Bash — run `run-benchmark.js`, parse report, compare agreement %
- **Prompt changes**: Vitest — run existing test suite for regression
- **Bundle sync**: Bash — diff commands between source and bundle directories

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — baseline + VAPO):
├── Task 1: Run fresh 3-model baseline benchmark [unspecified-high]
├── Task 2: Extract assembled prompt text for VAPO input [quick]
└── Task 3: VAPO zero-shot analysis + manual evaluation [deep]

Wave 2 (After Wave 1 — analysis + targeted fixes):
├── Task 4: Disagree student analysis (depends: 1) [deep]
├── Task 5: Apply targeted prompt patches (depends: 3, 4) [deep]
├── Task 5a: Redesign feedback format instructions (depends: —, can parallel with 4-5) [quick]
└── Task 6: Post-patch benchmark + biology cross-validation (depends: 5, 5a) [unspecified-high]

Wave 3 (After Wave 2 — iterate or finalize):
├── Task 7: Iteration loop if <95% (depends: 6) [deep]
├── Task 8: Sync server-bundle + final verification (depends: 7) [quick]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Full benchmark QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T4 → T5 → T6 → T7 → T8 → F1-F4 (T5a parallel with T4/T5)
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1), 3 (Wave 2 with T4, T5, T5a overlapping)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 6 | 1 |
| 2 | — | 3 | 1 |
| 3 | 2 | 5 | 1 |
| 4 | 1 | 5 | 2 |
| 5 | 3, 4 | 6 | 2 |
| 5a | — | 6 | 2 |
| 6 | 5, 5a | 7 | 2 |
| 7 | 6 | 8 | 3 |
| 8 | 7 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `unspecified-high`, T2 `quick`, T3 `deep`
- **Wave 2**: 4 tasks — T4 `deep`, T5 `deep`, T5a `quick`, T6 `unspecified-high`
- **Wave 3**: 2 tasks — T7 `deep`, T8 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

### Wave 1 — Baseline + VAPO (Start Immediately)

- [ ] 1. Run Fresh 3-Model Baseline Benchmark

  **What to do**:
  - Start the grading server on localhost:3456
  - Run `run-benchmark.js` with CURRENT prompts (no modifications) on exactly 3 models: glm-5:cloud, claude-sonnet-4-6, qwen3.5-9B-stat-grader:latest
  - Use flags: `--only=GLM-5,Sonnet,Qwen35-FT --runs=3 --tolerance=1 --output=test-data/baseline-v2.json`
  - CRITICAL: Ensure NO per-model `customInstructions` are active in CONFIG (comment them out if present)
  - Save results to `test-data/baseline-v2.json` and `test-data/baseline-v2.md`
  - Record: mean scores per model, pairwise agreement %, flagged disagreements, specific students where models disagree

  **Must NOT do**:
  - Must NOT modify any grading code — this is measurement-only
  - Must NOT use --custom= flag (must measure the default prompt)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires running benchmark against cloud APIs with potential timeout handling and SSE parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: None

  **References**:
  - `test-data/run-benchmark.js:31-60` — CONFIG object with models array, CLI flags
  - `test-data/run-benchmark.js:69-74` — `--only=` filter implementation
  - `test-data/run-benchmark.js:95-100` — `--runs=` override
  - `test-data/run-benchmark.js:102-104` — `--tolerance=` override
  - `test-data/run-benchmark.js:110-115` — `--output=` override
  - `test-data/captured-students.json` — 25 student responses (input data)
  - `test-data/captured-rubric.json` — Chi-square stats rubric (input data)
  - `test-data/benchmark-report.md` — Previous report format (March 8 data shows 92% agreement)

  **WHY Each Reference Matters**:
  - CONFIG: The models array defines label→provider/model mapping. The `--only=` flag filters by label substring. Need exact labels: "GLM-5", "Sonnet 4.6", "Qwen35-FT"
  - Previous report: Shows the format executor should expect and the baseline to beat (92%)

  **Acceptance Criteria**:
  - [ ] `test-data/baseline-v2.json` exists with results from 3 models × 3 runs
  - [ ] `test-data/baseline-v2.md` contains Per-Model Summary, Score Matrix, Pairwise Agreement tables
  - [ ] All 9 runs succeeded (no null entries) — if any fail, retry that model's runs
  - [ ] Pairwise agreement values are documented for all 3 pairs

  **QA Scenarios:**
  ```
  Scenario: Baseline benchmark completes with all 9 runs
    Tool: Bash
    Preconditions: Grading server running on localhost:3456, Ollama running with glm-5:cloud model, Anthropic API key configured
    Steps:
      1. Verify server health: curl http://localhost:3456/health | expect {"status":"ok"}
      2. Run: bun run test-data/run-benchmark.js --only=GLM-5,Sonnet,Qwen35-FT --runs=3 --tolerance=1 --output=test-data/baseline-v2.json
      3. Wait for completion (may take 10-30 minutes depending on API speeds)
      4. Verify files exist: ls test-data/baseline-v2.json test-data/baseline-v2.md
      5. Parse baseline-v2.json: verify rawResults has exactly 3 model keys
      6. For each model key: verify array has 3 non-null entries
      7. Parse stats.agreement: extract all 3 pairwise agreement percentages
    Expected Result: 3 model keys × 3 non-null runs each, agreement percentages documented
    Failure Indicators: null entries in rawResults, missing model keys, HTTP errors in server logs
    Evidence: .sisyphus/evidence/task-1-baseline-complete.txt

  Scenario: Agreement percentages are reasonable
    Tool: Bash
    Preconditions: baseline-v2.json exists
    Steps:
      1. Parse baseline-v2.json stats.agreement
      2. For each pair: verify agreementPct is between 50% and 100%
      3. Record exact values for comparison later
    Expected Result: All agreement values between 50-100%, documented for later comparison
    Evidence: .sisyphus/evidence/task-1-agreement-values.txt
  ```

  **Commit**: YES
  - Message: `chore(test-data): capture fresh baseline benchmark v2`
  - Files: `test-data/baseline-v2.json`, `test-data/baseline-v2.md`
  - Pre-commit: `ls test-data/baseline-v2.json`

- [x] 2. Extract Assembled Prompt Text for VAPO Input

  **What to do**:
  - Write a small script (or use bun REPL) to call `buildBatchPrompt()` with the captured rubric and a subset of students
  - Extract the FULL assembled prompt text that would be sent to the AI model
  - Save it to `test-data/vapo-input-prompt.txt` — this is what gets fed to VAPO zero-shot
  - Also extract the single-student prompt from `buildSingleGradePrompt()` for comparison
  - Include the system message, the full user message, and all assembled sections

  **Must NOT do**:
  - Must NOT modify any grading code
  - Must NOT include actual student responses in the VAPO input (privacy) — use synthetic placeholder text

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple script to call existing functions and capture output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `grading-server/grading.js:52-87` — `generateScoringAnchors()` function
  - `grading-server/grading.js:97-247` — `buildBatchPrompt()` function — the main prompt builder
  - `grading-server/grading.js:748-832` — `buildSingleGradePrompt()` function
  - `grading-server/grading-constants.js:1-26` — GRADING_PHILOSOPHY and SCORING_SCALE_DESCRIPTORS
  - `test-data/captured-rubric.json` — rubric to use as input
  - `test-data/captured-students.json` — student data structure (use 2-3 students, replace names)

  **WHY Each Reference Matters**:
  - buildBatchPrompt assembles the FULL prompt from constants + rubric + students + anchors — this is the text VAPO will analyze
  - Need to capture the exact format including section headers, delimiters, and ordering

  **Acceptance Criteria**:
  - [ ] `test-data/vapo-input-prompt.txt` exists with full assembled batch prompt
  - [ ] Contains all sections: GRADING PHILOSOPHY, MAX SCORE, QUESTION/PROMPT, GRADING CHECKLIST, SCORING ANCHORS, SCORING SCALE, STUDENTS TO GRADE, response format
  - [ ] No real student names or PII in the file

  **QA Scenarios:**
  ```
  Scenario: Extracted prompt contains all expected sections
    Tool: Bash
    Steps:
      1. Verify file exists: ls test-data/vapo-input-prompt.txt
      2. grep "GRADING PHILOSOPHY" test-data/vapo-input-prompt.txt | expect match
      3. grep "SCORING SCALE" test-data/vapo-input-prompt.txt | expect match
      4. grep "SCORING ANCHORS" test-data/vapo-input-prompt.txt | expect match
      5. grep "STUDENTS TO GRADE" test-data/vapo-input-prompt.txt | expect match
      6. grep "PARTIAL CREDIT RULE" test-data/vapo-input-prompt.txt | expect match
    Expected Result: All 5 sections present in extracted prompt
    Evidence: .sisyphus/evidence/task-2-prompt-extracted.txt
  ```

  **Commit**: NO (working artifact, not checked in)

- [x] 3. VAPO Zero-Shot Analysis + Manual Evaluation

  **What to do**:
  - Use Google Vertex AI Prompt Optimizer zero-shot mode to analyze the assembled prompt from Task 2
  - If GCP project is available: use `vertexai.Client().prompt_optimizer.optimize_prompt(prompt=...)` via Python SDK
  - If GCP is NOT available: manually apply VAPO-style structural analysis — evaluate the prompt against established best practices:
    1. Clarity of role assignment
    2. Specificity of instructions
    3. Section ordering and delimiter clarity
    4. Redundancy or contradiction detection
    5. Calibration anchor effectiveness
    6. JSON format reinforcement positioning
  - Document VAPO suggestions in `test-data/vapo-analysis.md`
  - For EACH suggestion, manually evaluate:
    - **Applicable?** Does this apply to a grading context (not just Gemini optimization)?
    - **FT-safe?** Would this change break the fine-tuned model (structural changes are HIGH risk)?
    - **Targeted?** Does this address a known disagreement pattern, or is it generic?
  - Classify each suggestion as: ADOPT, ADAPT, SKIP (with rationale)
  - CRITICAL: Prefer ADDITIONS (new clarifying text) over REWRITES (changing existing text) — additions are less likely to break FT model patterns

  **Must NOT do**:
  - Must NOT blindly adopt VAPO suggestions — each must be manually evaluated for FT safety
  - Must NOT restructure prompt sections (FT model learned the current order)
  - Must NOT apply suggestions that are clearly Gemini-specific (e.g., XML tag formatting preferences)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful evaluation of each suggestion against grading domain + FT safety constraints
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can overlap with T1 running benchmark)
  - **Parallel Group**: Wave 1 (after T2 provides prompt text)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  - `test-data/vapo-input-prompt.txt` — extracted prompt from Task 2
  - `grading-server/grading-constants.js:2-10` — GRADING_PHILOSOPHY (8 bullets)
  - `grading-server/grading-constants.js:14-26` — SCORING_SCALE_DESCRIPTORS (0-10)
  - `grading-server/grading.js:115-124` — Prompt opening (role, philosophy injection)
  - `grading-server/grading.js:159-174` — Scoring anchors + CRITICAL section
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` — FT model config (temperature 0.2, 8192 ctx)
  - `test-data/finetune-grading.jsonl:1-5` — Training data format (shows exact prompt structure the FT model learned)
  - Vertex AI Prompt Optimizer docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/prompt-optimizer

  **WHY Each Reference Matters**:
  - finetune-grading.jsonl: The FT model was trained on the EXACT text format in these examples. Any structural change that deviates from this format risks regression.
  - GRADING_PHILOSOPHY: The 8 bullets are the most modifiable section — additions here are safest
  - CRITICAL section (lines 171-174): This section about short-accurate-answers scoring high is a strong candidate for refinement

  **Acceptance Criteria**:
  - [ ] `test-data/vapo-analysis.md` exists
  - [ ] Contains ≥5 specific suggestions with ADOPT/ADAPT/SKIP classification
  - [ ] Each suggestion has FT-safety assessment
  - [ ] At least 2 suggestions classified as ADOPT or ADAPT

  **QA Scenarios:**
  ```
  Scenario: VAPO analysis produces actionable suggestions
    Tool: Bash
    Steps:
      1. Verify: ls test-data/vapo-analysis.md
      2. Count suggestions: grep -c "ADOPT\|ADAPT\|SKIP" test-data/vapo-analysis.md | expect >= 5
      3. Verify FT safety mentions: grep -c "FT\|fine-tune\|regression" test-data/vapo-analysis.md | expect >= 3
    Expected Result: Analysis file exists with ≥5 classified suggestions, FT safety considered
    Evidence: .sisyphus/evidence/task-3-vapo-analysis.txt
  ```

  **Commit**: YES (group with T5)
  - Message: `docs(test-data): VAPO structural analysis of grading prompt`
  - Files: `test-data/vapo-analysis.md`

### Wave 2 — Analysis + Targeted Fixes

- [x] 4. Disagreeing Student Analysis

  **What to do**:
  - From the baseline-v2 results (Task 1), identify ALL students where ANY model pair disagrees by >1 point
  - For each disagreeing student:
    1. Record: student name, their response text (from captured-students.json), scores from each model across all 3 runs
    2. Identify: which rubric criteria caused the divergence (if criterion_scores are available in results)
    3. Classify the disagreement type:
       - **Score inflation** — one model scores too high (which model? which criterion?)
       - **Score deflation** — one model scores too low (which model? which criterion?)
       - **Partial credit ambiguity** — models differ on how much partial credit to give
       - **Edge case** — response is ambiguous/borderline (hard for any model)
    4. Map the disagreement back to specific GRADING_PHILOSOPHY bullets or SCORING_SCALE levels
  - Save analysis to `test-data/disagreement-analysis-v2.md`
  - Recommend targeted prompt modifications for each identified pattern

  **Must NOT do**:
  - Must NOT propose wholesale prompt rewrites — target specific sections
  - Must NOT modify any code — this is analysis only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful analysis of student responses against rubric and cross-model scoring patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs baseline data)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `test-data/baseline-v2.json` — Baseline results with per-student scores (from Task 1)
  - `test-data/captured-students.json` — Student response text
  - `test-data/captured-rubric.json` — Rubric criteria for the grading task
  - `grading-server/grading-constants.js:2-10` — GRADING_PHILOSOPHY bullets to map disagreements against
  - `grading-server/grading-constants.js:14-26` — SCORING_SCALE_DESCRIPTORS to identify boundary ambiguities
  - `grading-server/grading.js:137` — PARTIAL CREDIT RULE text
  - `grading-server/grading.js:171-174` — CRITICAL section (short-answer scoring guidance)
  - `test-data/benchmark-report.md` — Previous report for historical comparison

  **WHY Each Reference Matters**:
  - baseline-v2.json: Has rawResults[model][run].results with per-student scores. Use stats.perStudent for averaged cross-run scores.
  - captured-students.json: Need actual student text to understand WHY models diverge
  - GRADING_PHILOSOPHY: Map each disagreement to the specific philosophy bullet that's ambiguous

  **Acceptance Criteria**:
  - [ ] `test-data/disagreement-analysis-v2.md` exists
  - [ ] Identifies ALL students with >1 point disagreement between any model pair
  - [ ] Each disagreement classified by type (inflation/deflation/partial-credit/edge-case)
  - [ ] Recommended prompt patches documented for each pattern

  **QA Scenarios:**
  ```
  Scenario: Disagreement analysis identifies specific students and patterns
    Tool: Bash
    Steps:
      1. Verify: ls test-data/disagreement-analysis-v2.md
      2. Count identified students: grep -c "Student\|Name:" test-data/disagreement-analysis-v2.md | expect >= 2
      3. Verify classification: grep -c "inflation\|deflation\|partial credit\|edge case" test-data/disagreement-analysis-v2.md | expect >= 2
      4. Verify recommendations: grep -c "Recommendation\|Patch\|Fix" test-data/disagreement-analysis-v2.md | expect >= 1
    Expected Result: Analysis identifies 2+ students with classified disagreement types and recommendations
    Evidence: .sisyphus/evidence/task-4-disagreement-analysis.txt
  ```

  **Commit**: YES (group with T5)

- [x] 5. Apply Targeted Prompt Patches

  **What to do**:
  - Based on VAPO suggestions (Task 3, ADOPT/ADAPT items) and disagreement analysis (Task 4), modify the grading prompt:
  - **Priority modifications** (from safest to riskiest):
    1. **Add clarifying bullets to GRADING_PHILOSOPHY** — e.g., "When a response demonstrates understanding through an unconventional structure, evaluate the content quality, not the format"
    2. **Refine SCORING_SCALE boundary descriptors** — if score 6 vs 7 is a common disagreement boundary, make the distinction sharper
    3. **Adjust PARTIAL CREDIT RULE percentages** — if partial credit is the main divergence source
    4. **Refine the CRITICAL section** (lines 171-174) — if short-vs-long answer scoring is causing issues
  - WORKFLOW for each change:
    1. Make the change to `grading-server/grading-constants.js` or `grading-server/grading.js`
    2. Run `bun test --run` in `grading-server/` — must pass
    3. Run a QUICK benchmark: `--only=Qwen35-FT --runs=1 --chunkSize=30` (local, fast, tests FT regression)
    4. If Qwen35-FT mean score shifts >0.5 points from baseline, REVERT the change
    5. If stable, proceed to next change
  - Keep changes MINIMAL — smallest edit that addresses the disagreement pattern

  **Must NOT do**:
  - Must NOT reorder prompt sections (FT model learned current order)
  - Must NOT change delimiters or headers (e.g., "GRADING PHILOSOPHY:" → "INSTRUCTIONS:") — FT model depends on exact headers
  - Must NOT modify parseBatchResponse, parseSingleGradeResponse, or any scoring math
  - Must NOT remove existing GRADING_PHILOSOPHY bullets — only add or refine wording
  - Must NOT make >3 changes without a full benchmark checkpoint

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires precise, targeted editing with FT regression testing after each change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential changes with regression testing)
  - **Parallel Group**: Wave 2 (after T3 and T4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `test-data/vapo-analysis.md` — VAPO suggestions classified as ADOPT/ADAPT (from Task 3)
  - `test-data/disagreement-analysis-v2.md` — Disagreement patterns and recommended patches (from Task 4)
  - `grading-server/grading-constants.js:2-10` — GRADING_PHILOSOPHY (primary edit target)
  - `grading-server/grading-constants.js:14-26` — SCORING_SCALE_DESCRIPTORS (secondary edit target)
  - `grading-server/grading.js:137` — PARTIAL CREDIT RULE
  - `grading-server/grading.js:171-174` — CRITICAL section
  - `grading-server/grading.js:64-68` — Scoring anchor descriptions
  - `test-data/finetune-grading.jsonl:1` — First training example showing exact prompt format (DO NOT deviate from this structure)
  - `grading-server/test/prompts.test.js` — Existing tests that must continue passing

  **WHY Each Reference Matters**:
  - vapo-analysis.md + disagreement-analysis-v2.md: These two documents together tell you WHAT to change and WHERE
  - finetune-grading.jsonl line 1: Shows the prompt structure the FT model learned — your changes must be compatible with this format
  - prompts.test.js: Existing regression tests — changes must not break these

  **Acceptance Criteria**:
  - [ ] ≥1 change applied to GRADING_PHILOSOPHY or SCORING_SCALE_DESCRIPTORS
  - [ ] `bun test --run` in `grading-server/` passes after changes
  - [ ] Quick Qwen35-FT benchmark shows mean score within ±0.5 of baseline (no regression)
  - [ ] Changes documented with rationale in commit message

  **QA Scenarios:**
  ```
  Scenario: Prompt changes don't break FT model
    Tool: Bash
    Preconditions: Grading server running, Qwen35-FT model loaded in Ollama
    Steps:
      1. Run: bun run test-data/run-benchmark.js --only=Qwen35-FT --runs=1 --tolerance=1 --output=test-data/ft-regression-check.json
      2. Parse ft-regression-check.json for stats.perModel["Qwen35-FT"].meanScore
      3. Compare to baseline-v2.json stats.perModel["Qwen35-FT"].meanScore
      4. Assert: |new_mean - baseline_mean| <= 0.5
    Expected Result: FT model mean score within ±0.5 of baseline
    Failure Indicators: Mean score shift >0.5, null results, parse errors
    Evidence: .sisyphus/evidence/task-5-ft-regression.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Steps:
      1. Run: cd grading-server && bun test --run
      2. Verify: 0 failures
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `refactor(grading): targeted prompt refinements for cross-model agreement`
  - Files: `grading-server/grading-constants.js`, `grading-server/grading.js` (if modified)
  - Pre-commit: `cd grading-server && bun test --run`

- [x] 5a. Redesign Feedback Format Instructions

  **What to do**:
  - Replace the feedback instruction text in ALL THREE locations in `grading.js`:
    1. **Batch prompt** (line 233): The feedback field instruction in the JSON response template
    2. **Outlier re-grading prompt** (line 600): The feedback field instruction in the outlier review template
    3. **Single student prompt** (line 828): The feedback field instruction in the single-grade template
  - **Current format** (all 3 locations, paraphrased): "Write one bullet point per rubric category. Say what they did well, then what was missing and what they would need to write to earn full credit."
  - **New format**: Replace with:
    ```
    Write one section per rubric criterion. For each criterion:
    1. State the criterion name
    2. Quote or paraphrase what the student said about it: 'You said ...'
    3. Explain why what they said was correct, incorrect, or incomplete — and what they would need to add for full credit
    If a student's statements conflict with each other, note gently: 'Note: this seems inconsistent with your earlier statement that...'
    Use \\n between each section so they appear on separate lines. Write like a high school math teacher talking directly to the student. No em dashes. Short and clear.
    ```
  - Keep the "Use the student's first name" instruction for batch/outlier prompts
  - Keep the "Write directly to the student using 'you'" instruction for single student prompt
  - CRITICAL: The feedback instruction is INSIDE the JSON response template — do NOT change the JSON structure, only the text inside the `<...>` placeholder

  **Must NOT do**:
  - Must NOT change the JSON response format (field names, field order, field types)
  - Must NOT change anything outside the feedback instruction text
  - Must NOT remove the `\\n` instruction (needed for line breaks in output)
  - Must NOT change the tone away from "high school math teacher"

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward text replacement in 3 known locations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run alongside T4 and T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6 (benchmark must test new feedback format)
  - **Blocked By**: None (feedback format change is independent of scoring optimization)

  **References**:
  - `grading-server/grading.js:233` — Batch prompt feedback instruction: `"<Use the student's first name from their header. Write one bullet point per rubric category...">`
  - `grading-server/grading.js:600` — Outlier re-grading feedback instruction: same format as batch
  - `grading-server/grading.js:828` — Single student feedback instruction: `"<Write directly to the student using 'you'. Write one bullet point per rubric category...">`
  - `grading-server/grading.js:238` — Second student in batch template: `"<feedback>"` (this stays as-is, just a placeholder)

  **WHY Each Reference Matters**:
  - Lines 233, 600, 828 are the ONLY three places feedback format is instructed — all three must be updated consistently
  - Line 238 is a short placeholder for subsequent students — it does NOT need the full instruction text

  **Acceptance Criteria**:
  - [ ] All 3 feedback instruction locations updated with new criterion-driven format
  - [ ] JSON response template structure unchanged (same fields, same order)
  - [ ] `bun test --run` in `grading-server/` passes
  - [ ] New instruction text includes: criterion name, student quote, right/wrong evaluation, contradiction handling

  **QA Scenarios:**
  ```
  Scenario: Feedback instructions updated in all 3 locations
    Tool: Bash
    Steps:
      1. grep -n "criterion" grading-server/grading.js | expect 3+ matches in feedback sections
      2. grep -n "You said\|student said\|Quote" grading-server/grading.js | expect matches near lines 233, 600, 828
      3. grep -n "inconsistent\|conflict" grading-server/grading.js | expect match (contradiction handling)
      4. Verify JSON template intact: grep '"feedback":' grading-server/grading.js | expect 4 matches (lines 233, 238, 600, 828)
    Expected Result: All 3 instruction locations updated, JSON structure preserved
    Evidence: .sisyphus/evidence/task-5a-feedback-format.txt

  Scenario: Tests still pass after feedback format change
    Tool: Bash
    Steps:
      1. Run: cd grading-server && bun test --run
      2. Verify: 0 failures
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-5a-tests-pass.txt
  ```

  **Commit**: YES (group with T5)
  - Message: `refactor(grading): redesign feedback format to criterion-driven evaluation`
  - Files: `grading-server/grading.js`
  - Pre-commit: `cd grading-server && bun test --run`

- [ ] 6. Post-Patch Benchmark + Biology Cross-Validation

  **What to do**:
  - Run FULL benchmark with modified prompts: `--only=GLM-5,Sonnet,Qwen35-FT --runs=3 --tolerance=1 --output=test-data/optimized-v2.json`
  - Compare to baseline-v2 results:
    1. Pairwise agreement % for all 3 pairs (target: ≥95% for Sonnet pairs)
    2. Per-student score changes (which students flipped from disagree→agree or agree→disagree?)
    3. Mean score drift per model (flag if >1.0 from baseline)
    4. Qwen35-FT regression check (must not drop >4pp agreement with Sonnet)
  - Run CROSS-VALIDATION on biology dataset: `--only=GLM-5,Sonnet,Qwen35-FT --runs=1 --dataset=biology --output=test-data/biology-cross-val.json`
  - If biology dataset doesn't exist (Task 2 from previous plan may not have been executed), skip cross-validation and document as limitation
  - Save comparison summary in `test-data/optimized-v2.md`

  **Must NOT do**:
  - Must NOT modify the prompt during this task — this is measurement only
  - Must NOT skip the Qwen35-FT regression check

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Running multi-model benchmarks against cloud APIs
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs modified prompt from T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `test-data/baseline-v2.json` — Pre-change baseline (from Task 1)
  - `test-data/run-benchmark.js:64-67` — DATASETS config for --dataset=biology flag
  - `test-data/test-biology-rubric.json` — Biology rubric (may or may not exist)
  - `test-data/test-biology-students.json` — Biology students (may or may not exist)

  **WHY Each Reference Matters**:
  - baseline-v2.json: Must compare against this to measure improvement
  - DATASETS config: Shows the --dataset flag maps to specific file paths — biology may not have been created yet

  **Acceptance Criteria**:
  - [ ] `test-data/optimized-v2.json` and `test-data/optimized-v2.md` exist with 3-model × 3-run results
  - [ ] Comparison to baseline documented: agreement % change, per-student changes
  - [ ] Qwen35-FT agreement with Sonnet did not drop >4pp from baseline
  - [ ] Biology cross-validation attempted (or documented as N/A if dataset missing)

  **QA Scenarios:**
  ```
  Scenario: Post-optimization benchmark shows improvement or stability
    Tool: Bash
    Steps:
      1. Run: bun run test-data/run-benchmark.js --only=GLM-5,Sonnet,Qwen35-FT --runs=3 --tolerance=1 --output=test-data/optimized-v2.json
      2. Wait for completion
      3. Parse optimized-v2.json stats.agreement for "Sonnet 4.6 vs Qwen35-FT" and "GLM-5 vs Sonnet 4.6"
      4. Compare to baseline-v2.json same fields
      5. Assert: Sonnet agreement values >= baseline values (improvement or same)
      6. Assert: Qwen35-FT agreement did not drop more than 4pp
    Expected Result: Agreement % improved or maintained, no FT regression
    Evidence: .sisyphus/evidence/task-6-post-optimization.txt

  Scenario: Biology cross-validation (if dataset exists)
    Tool: Bash
    Steps:
      1. Check: ls test-data/test-biology-rubric.json test-data/test-biology-students.json 2>/dev/null
      2. If both exist: bun run test-data/run-benchmark.js --only=GLM-5,Sonnet,Qwen35-FT --runs=1 --dataset=biology --output=test-data/biology-cross-val.json
      3. If files missing: echo "Biology dataset not available — cross-validation skipped"
    Expected Result: Biology benchmark runs OR documented as N/A
    Evidence: .sisyphus/evidence/task-6-biology-crossval.txt
  ```

  **Commit**: YES
  - Message: `docs(test-data): post-optimization benchmark comparison v2`
  - Files: `test-data/optimized-v2.json`, `test-data/optimized-v2.md`

### Wave 3 — Iterate or Finalize

- [ ] 7. Iteration Loop (if <95%)

  **What to do**:
  - If Task 6 shows agreement <95% (fewer than 24/25 in ≥2 of 3 runs), enter iteration:
    1. Identify the NEW disagreeing students (may have changed from baseline)
    2. Analyze WHY the patches from Task 5 didn't fully close the gap
    3. Apply 1-2 more targeted refinements
    4. Run quick FT regression check (--only=Qwen35-FT --runs=1)
    5. Run full 3-model benchmark
    6. Repeat up to 2 more iterations (max 3 total prompt variants including Task 5)
  - If agreement plateaus (same students disagree across iterations), document as:
    - "Prompt-only optimization plateau at X%. Remaining disagreements are edge cases where models genuinely interpret rubric differently."
    - Recommend next steps: expand training data, add scored calibration examples, or accept current level
  - Save iteration results as: `test-data/iteration-{N}-results.json`

  **Must NOT do**:
  - Must NOT iterate >3 prompt variants without biology cross-validation
  - Must NOT iterate indefinitely — cap at 3 variants total
  - Must NOT revert to a worse prompt just to try something different
  - Must NOT declare failure without documenting specific remaining disagreements

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Iterative analysis requiring judgment about when to continue vs plateau
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential iteration)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:
  - `test-data/optimized-v2.json` — Latest benchmark results (from Task 6)
  - `test-data/disagreement-analysis-v2.md` — Original disagreement patterns (from Task 4)
  - `grading-server/grading-constants.js` — Current prompt (as modified by Task 5)
  - `grading-server/grading.js` — Current prompt assembly (as modified by Task 5)
  - All references from Tasks 4 and 5

  **Acceptance Criteria**:
  - [ ] Agreement ≥95% in ≥2 of 3 runs achieved, OR plateau documented with analysis
  - [ ] Max 3 prompt variants tested (including Task 5's initial variant)
  - [ ] Each iteration has FT regression check
  - [ ] Final prompt state is the BEST performing variant

  **QA Scenarios:**
  ```
  Scenario: Iteration achieves 95% or documents plateau
    Tool: Bash
    Steps:
      1. If latest agreement <95%: apply additional targeted patch
      2. Run: bun run test-data/run-benchmark.js --only=GLM-5,Sonnet,Qwen35-FT --runs=3 --tolerance=1 --output=test-data/iteration-1-results.json
      3. Check agreement: if >=95% in 2+ runs → SUCCESS
      4. If still <95% and <3 variants tried → repeat
      5. If 3 variants tried and still <95% → document plateau
    Expected Result: 95% achieved OR plateau documented with specific remaining disagreements
    Evidence: .sisyphus/evidence/task-7-iteration-result.txt
  ```

  **Commit**: YES (if prompt was further modified)
  - Message: `refactor(grading): iteration N prompt refinement for agreement target`
  - Files: `grading-server/grading-constants.js`, `grading-server/grading.js`

- [ ] 8. Sync Server-Bundle + Final Verification

  **What to do**:
  - Copy all modified files from `grading-server/` to `ogre-desktop/src-tauri/binaries/server-bundle/`:
    - `grading-constants.js`
    - `grading.js`
  - Verify byte-for-byte parity using diff
  - Run final `bun test --run` in `grading-server/`
  - Document final state: which prompt variant is active, final agreement %, FT regression status

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:
  - `ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js` — Destination
  - `ogre-desktop/src-tauri/binaries/server-bundle/grading.js` — Destination

  **Acceptance Criteria**:
  - [ ] `diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js` → empty
  - [ ] `diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js` → empty
  - [ ] `bun test --run` in `grading-server/` passes

  **QA Scenarios:**
  ```
  Scenario: Server-bundle files identical to source
    Tool: Bash
    Steps:
      1. cp grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js
      2. cp grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js
      3. diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js
      4. diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js
      5. Both diffs must produce empty output
    Expected Result: All diffs empty
    Evidence: .sisyphus/evidence/task-8-bundle-sync.txt
  ```

  **Commit**: YES
  - Message: `chore(desktop): sync server-bundle with optimized grading prompt`
  - Files: `ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js`, `ogre-desktop/src-tauri/binaries/server-bundle/grading.js`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun test --run` in `grading-server/`. Review all changed files. Check AI slop: excessive comments, over-abstraction. Verify prompt text has no contradictions or ambiguities. Verify scoring scale descriptors are consistent across batch/single builders.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Full Benchmark QA** — `unspecified-high`
  Run complete 3-model × 3-run benchmark. Verify all runs succeed (no nulls). Compare agreement % to baseline. Verify Qwen35-FT didn't regress. Validate on biology dataset. Save evidence.
  Output: `Baseline [N%] | Optimized [N%] | FT Regression [YES/NO] | Biology [N%] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: verify only intended changes were made. Check parsing functions untouched. Check scale logic untouched. Verify server-bundle sync. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1**: `chore(test-data): capture fresh baseline benchmark v2` — baseline-v2.json, baseline-v2.md
- **T5**: `refactor(grading): targeted prompt refinements for cross-model agreement` — grading-constants.js, grading.js
- **T6**: `docs(test-data): post-optimization benchmark comparison` — optimized-v2.json, optimized-v2.md
- **T8**: `chore(desktop): sync server-bundle with prompt changes` — server-bundle files

---

## Success Criteria

### Verification Commands
```bash
cd grading-server && bun test --run  # Expected: all tests pass
diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js  # Expected: empty
diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js  # Expected: empty
```

### Final Checklist
- [ ] Fresh baseline captured with 3 models × 3 runs (no nulls)
- [ ] VAPO analysis documented
- [ ] Disagreement analysis identified specific students and criteria
- [ ] Feedback format redesigned: criterion → student quote → evaluation (all 3 locations)
- [ ] Post-optimization agreement ≥ 95% in ≥2 of 3 runs (or documented plateau)
- [ ] Qwen35-FT did not regress >4pp
- [ ] Biology cross-validation performed
- [ ] All tests pass
- [ ] Server-bundle synced
