# Learnings — prompt-optimization-v2

## [2026-03-13] Session: ses_31bb6445bffe3QURwljl4ollIB (Atlas bootstrap)

### Model Labels (CRITICAL)
- `GLM-5` → `glm-5:cloud` (provider: ollama)
- `Sonnet 4.6` → `claude-sonnet-4-6` (provider: anthropic) — gold standard
- `Qwen35-FT` → `qwen3.5-9B-stat-grader:latest` (provider: ollama-local)
- `--only=` flag filters by substring match on label

### customInstructions
- Already commented out in run-benchmark.js lines 33 and 35 — no action needed

### Biology Dataset
- Does NOT exist: no test-biology-rubric.json or test-biology-students.json in test-data/
- T6 cross-validation: skip and document as N/A

### Feedback Format (3 Locations in grading.js)
- Line 233: batch prompt feedback instruction
- Line 600: outlier re-grading feedback instruction  
- Line 828: single student feedback instruction
- Line 238: placeholder `"<feedback>"` — DO NOT change

### FT Model Facts
- Model: qwen3.5-9B-stat-grader:latest (Qwen35-FT)
- Training: 415 examples (239 text + 176 vision), QLoRA rank 16
- Temperature: 0.2, ctx: 8192
- Trained on EXACT current prompt format — structural changes risk regression
- Regression gate: >4pp agreement drop = revert

### Benchmark CLI Flags
- `--only=` — comma-separated label substrings (e.g., `GLM-5,Sonnet,Qwen35-FT` — note: Sonnet matches "Sonnet 4.6")
- `--runs=3` — 3 runs per model
- `--tolerance=1` — ±1 point agreement
- `--output=` — override output JSON path
- `--dataset=` — preset rubric/student data (biology doesn't exist)
- Default output: test-data/benchmark-results.json + test-data/benchmark-report.md

### Server
- URL: http://localhost:3456
- Health check: GET /health → {"status":"ok"}

## [2026-03-12] Task 5a: Feedback Format Redesign (COMPLETED)

### Changes Applied
- **3 locations updated** in grading-server/grading.js:
  - Line 233: batch feedback instruction
  - Line 600: outlier re-grading feedback instruction
  - Line 828: single student feedback instruction

### New Format Structure
**Per-criterion feedback:**
1. State criterion name
2. Quote/paraphrase student response: "You said ..."
3. Evaluate correctness + what's needed for full credit
4. Note contradictions gently: "Note: this seems inconsistent with..."

### Key Preservation
- JSON structure unchanged (field names, order, count)
- Line 238 placeholder left untouched
- "High school math teacher" tone preserved
- No em dashes, short and clear
- `\\n` between sections maintained

### Test Results
- **197 pass, 0 fail** ✓
- All tests pass with new feedback format
- Pre-existing LSP errors (lines 316, 331) unaffected

### Evidence Saved
- `.sisyphus/evidence/task-5a-feedback-format.txt` — grep output + test summary
- `.sisyphus/evidence/task-5a-tests-pass.txt` — full test output

## [2026-03-12] Task 3: VAPO-Style Structural Analysis (COMPLETED)

### What improved agreement most (low FT risk)
- Added high-value SAFE recommendations to tighten **7 vs 8** and **8 vs 9** boundaries with criterion-level evidence thresholds.
- Added numeric mapping guidance for PARTIAL CREDIT bands to 5-point criteria (reduces 5/6/7 drift across models).
- Added philosophy/critical clarifiers to prevent over-crediting concise but vague responses.

### FT-Safety pattern
- Best path: prioritize **additive clarifications** (SAFE) over structural edits.
- Avoid section reordering/header changes due to Qwen35-FT prompt-shape dependency.
- Apply ADAPT items incrementally and benchmark after each mini-batch to detect regression early.

### Parse-stability gotchas found
- Batch JSON sample includes inline `//` comment (invalid JSON exemplar behavior risk).
- Single-student JSON sample has a missing comma between `score` and `feedback` in example block.

### Deliverables
- Analysis file: `test-data/vapo-analysis.md` (12 findings, all 6 dimensions covered)
- Evidence file: `.sisyphus/evidence/task-3-vapo-analysis.txt`

## [2026-03-13] Task 4: Disagreement Analysis V2 (COMPLETED)

### Output Created
- `test-data/disagreement-analysis-v2.md`

### Disagreement Patterns Captured
- **Metroka, Layla**: score deflation (GLM-5 + Qwen35-FT too strict vs Sonnet)
- **Price, Lynn**: score deflation (GLM-5 too strict vs Sonnet)
- **melton, myla**: score inflation (Qwen35-FT too generous vs Sonnet + GLM-5)

### Targeted Prompt Patches
- **Patch A (partial-credit clarification):** if expected frequency is identified and student gives general closeness/farness comparison, award partial comparison credit even without enumerating each observed value.
- **Patch B (short-answer guardrail):** short-answer bonus applies only when all required sub-criteria are addressed; missing sub-criteria blocks 8+ scoring.

### Priority Insight
- Patch A first (fixes Metroka + Price; highest agreement lift), then Patch B (fixes melton edge-case inflation).

### Evidence Saved
- `.sisyphus/evidence/task-4-disagreement-analysis.txt`

## [2026-03-12] Task 5: Targeted Prompt Patches (COMPLETED)

### Changes Applied
- **Change 1** (grading-constants.js): Added 2 bullets to GRADING_PHILOSOPHY
  - Partial credit for general closeness statements (Patch A — fixes Metroka/Price)
  - "Not evidenced = not demonstrated" clarifier
- **Change 2** (grading.js line 137): Extended PARTIAL CREDIT RULE with 5-point criteria band mapping
  - 1-2 pts (20-40%), 2-3 pts (40-60%), 3-4 pts (60-80%), 4-5 pts = complete
- **Change 3** (grading.js lines 171-174): Added 2 sentences to CRITICAL section
  - 8+ rule requires ALL sub-criteria addressed (Patch B — fixes melton inflation)
  - Score 7 when one criterion only partially met

### Test Results
- bun test --run
- 197 pass
- 0 fail
- 364 expect() calls

### Evidence Saved
- `.sisyphus/evidence/task-5-tests-pass.txt`
- `.sisyphus/evidence/task-5-changes-applied.txt`
