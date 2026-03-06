# Qwen3 Fine-Tuning: Grading + MOM Question Code

## TL;DR

> **Quick Summary**: Benchmark Qwen3.5-9B vs Qwen3-14B zero-shot on grading, then QLoRA fine-tune the winner to produce a single local model that grades student work (JSON output) AND writes MyOpenMath question code. Grading fine-tuning first; MOM code second only after grading hits 90%+ agreement.
> 
> **Deliverables**:
> - Zero-shot benchmark results for both model candidates
> - Curated multi-rubric grading training dataset (50+ examples, 3+ rubrics)
> - QLoRA fine-tuned Qwen3 model registered in Ollama as `qwen3-ogre:latest`
> - Post-fine-tune benchmark proving ≥90% agreement with GLM-5/Sonnet on stats, ≥85% on held-out rubric
> - MOM question code training dataset (50+ prompt→code pairs)
> - MOM capability fine-tuned into the same model without grading regression
> 
> **Estimated Effort**: Large (multi-day across phases)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8 → Task 10 → Task 12

---

## Context

### Original Request
User reviewed the fine-tuning decision document and wants to proceed with fine-tuning a small local Qwen3 model that can handle both rubric-based grading AND MyOpenMath question code writing. Decision was made to benchmark Qwen3.5-9B vs Qwen3-14B zero-shot first, then fine-tune the winner.

### Interview Summary
**Key Discussions**:
- GLM-5 vs Sonnet 4.6 at 96% agreement — production pair. GPT-OSS stuck at 80%.
- Fine-tuning GPT-OSS not accessible (cloud relay). Need a local model.
- Qwen3 family fine-tunes exceptionally well (Distillabs: 4B matched 120B on 7/8 benchmarks).
- Qwen3.5 (newer, 9B, 262K context, multimodal) vs Qwen3 (14B, 41K context) — benchmark both.
- Single model for both grading + MOM code (infrastructure simplicity).
- 25 existing grading examples + more from other topics. 50+ MOM questions in private repo.
- RTX 4070 12GB VRAM. 4-bit QLoRA.

**Research Findings**:
- Qwen3.5-9B: ~6-7GB VRAM Q4, native structured output, tools+thinking, 262K context
- Qwen3-14B: ~10-11GB VRAM Q4, 22.4M Ollama downloads, 41K context, proven track record
- Ollama supports structured output via JSON schema, but current grading server uses prompt-only JSON
- MOM skill is 1,043 lines of code patterns. Actual questions in private `shuff57/mom` repo.
- Benchmark runner (`test-data/run-benchmark.js`) fully functional, supports `--only` flag

### Metis Review
**Identified Gaps** (addressed):
- Training data diversity: All 25 existing examples use same rubric → require 3+ rubrics
- Multi-task risk: Grading + MOM on <100 examples → sequence grading-first, MOM-second
- OOM risk: Qwen3-14B QLoRA on 12GB is tight → explicit fallback to 9B
- Circular evaluation: Training on GLM+Sonnet consensus, eval on same → use held-out rubric
- MOM training data: No JSONL exists → need to create prompt→code pairs from private repo
- Task routing: Model must distinguish grading vs MOM via system prompt, not ambiguity
- Score distribution: Training data skews 6-8 → require 0-10 coverage
- No thinking mode during training or benchmarking

---

## Work Objectives

### Core Objective
Fine-tune a single Qwen3 model for dual-purpose use: rubric-based essay grading (structured JSON) and MyOpenMath question code generation.

### Concrete Deliverables
- `test-data/benchmark-qwen35-zeroshot.json` — zero-shot results for Qwen3.5-9B
- `test-data/benchmark-qwen314b-zeroshot.json` — zero-shot results for Qwen3-14B
- `test-data/finetune-grading.jsonl` — multi-rubric grading training data (50+ examples)
- `test-data/finetune-grading-val.jsonl` — held-out validation set (biology/history)
- `test-data/finetune-mom.jsonl` — MOM prompt→code training data (50+ examples)
- Fine-tuned GGUF model registered as `qwen3-ogre:latest` in Ollama
- `test-data/benchmark-qwen3-ft-stats.json` — post-fine-tune stats benchmark
- `test-data/benchmark-qwen3-ft-biology.json` — post-fine-tune held-out benchmark

### Definition of Done
- [ ] `ollama run qwen3-ogre:latest "test"` responds coherently
- [ ] Grading benchmark: ≥90% pairwise agreement with GLM-5 on stats dataset
- [ ] Grading benchmark: ≥85% pairwise agreement with GLM-5 on held-out biology dataset
- [ ] MOM: 5+ generated questions paste into IMathAS without syntax errors
- [ ] JSON parse failure rate: 0% on benchmark runs

### Must Have
- Zero-shot benchmark of BOTH candidates before fine-tuning
- Training data from 3+ different rubrics with diverse category names
- Score distribution covering 0-10 range (not just 6-8)
- Held-out rubric (biology OR history) never seen during training
- Exact CoR v2 prompt structure in training examples (matching `grading.js:97-247`)
- Explicit OOM fallback: if 14B fails training, use 9B without re-benchmarking
- Grading fine-tuning reaches 90% BEFORE adding MOM training
- ≤2 epochs on <100 examples to prevent overfitting

### Must NOT Have (Guardrails)
- **NO thinking mode** during training or benchmarking — disable `/think` tokens
- **NO multimodal inputs** — grading pipeline is text-only
- **NO Ollama `format: "json"` parameter** — must work with prompt-only JSON (current behavior)
- **NO prompt re-optimization** — use exact CoR v2 prompt from `grading.js`, do not re-engineer
- **NO changes to production code** — do not modify `grading.js`, `providers.js`, `server.js`, or any desktop app code
- **NO fine-tuning for lenient/strict** — only neutral philosophy. Custom instructions come from prompt.
- **NO mixing grading + MOM examples in the same training batch** — sequence them
- **NO testing with >10 benchmark models** — only benchmark against GLM-5 and Sonnet 4.6
- **NO building new benchmark tooling** — use existing `run-benchmark.js`
- **NO testing at 262K context** — production prompts are 4-8K tokens

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES — `test-data/run-benchmark.js` with preset datasets
- **Automated tests**: Tests-after (benchmark runner is the test suite)
- **Framework**: Existing benchmark runner + JSONL validation scripts

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Benchmark tasks**: Use Bash — run benchmark, parse JSON output, assert agreement %
- **Training data tasks**: Use Bash — validate JSONL, count lines, check diversity
- **Fine-tuning tasks**: Use Bash — verify model files exist, Ollama registration, inference test
- **MOM tasks**: Use Bash — generate question, syntax-check output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — benchmark + data prep in parallel):
├── Task 1: Pull models + zero-shot benchmark setup [quick]
├── Task 2: Audit existing grading training data [quick]
├── Task 3: Zero-shot benchmark both candidates [unspecified-high]
└── Task 4: Audit MOM questions in private repo [quick]

Wave 2 (After Wave 1 — training data + model decision):
├── Task 5: Decide winner from benchmark results [quick]
├── Task 6: Prepare multi-rubric grading JSONL [deep]
├── Task 7: Validate + balance training dataset [unspecified-high]
└── Task 8: Set up QLoRA training environment [unspecified-high]

Wave 3 (After Wave 2 — fine-tuning + evaluation):
├── Task 9: Run QLoRA fine-tuning (grading only) [deep]
├── Task 10: Export GGUF + register in Ollama [unspecified-high]
├── Task 11: Post-fine-tune grading benchmark [deep]
└── Task 12: Grading regression check on held-out rubric [deep]

Wave 4 (After Wave 3, ONLY if grading ≥90% — MOM phase):
├── Task 13: Prepare MOM prompt→code JSONL [deep]
├── Task 14: Continue fine-tuning with MOM data [deep]
├── Task 15: Re-export GGUF + update Ollama [unspecified-high]
├── Task 16: Verify MOM code generation [unspecified-high]
└── Task 17: Grading regression test post-MOM [deep]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Benchmark integrity review [unspecified-high]
├── Task F3: End-to-end grading server QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → Task 9 → Task 10 → Task 11 → Task 12
                                                    ↓ (if ≥90%)
                                              Task 13 → Task 14 → Task 15 → Task 17
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3 | 1 |
| 2 | — | 6 | 1 |
| 3 | 1 | 5 | 1 |
| 4 | — | 13 | 1 |
| 5 | 3 | 8, 9 | 2 |
| 6 | 2 | 7 | 2 |
| 7 | 6 | 9 | 2 |
| 8 | 5 | 9 | 2 |
| 9 | 7, 8 | 10 | 3 |
| 10 | 9 | 11, 12 | 3 |
| 11 | 10 | 13 (gate) | 3 |
| 12 | 10 | 13 (gate) | 3 |
| 13 | 4, 11≥90%, 12≥85% | 14 | 4 |
| 14 | 13 | 15 | 4 |
| 15 | 14 | 16, 17 | 4 |
| 16 | 15 | F1-F4 | 4 |
| 17 | 15 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `unspecified-high`, T4 `quick`
- **Wave 2**: 4 tasks — T5 `quick`, T6 `deep`, T7 `unspecified-high`, T8 `unspecified-high`
- **Wave 3**: 4 tasks — T9 `deep`, T10 `unspecified-high`, T11 `deep`, T12 `deep`
- **Wave 4**: 5 tasks — T13 `deep`, T14 `deep`, T15 `unspecified-high`, T16 `unspecified-high`, T17 `deep`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

### Wave 1 — Benchmark + Data Audit (Start Immediately)

- [x] 1. Pull Models + Zero-Shot Benchmark Setup

  **What to do**:
  - Verify `qwen3.5:9b` and `qwen3:14b` are already pulled (user confirmed they downloaded both)
  - Add both models to the benchmark runner CONFIG in `test-data/run-benchmark.js`
  - Follow the existing CONFIG pattern (see References) — add entries with `provider: 'ollama'`, unique `label`, and correct `model` tag
  - Verify both models respond to a basic chat request via `curl localhost:11434/api/chat`
  - Disable thinking mode for both models: set `"options": { "num_predict": -1 }` and use `/no_think` prefix or Ollama's `think: false` parameter if available

  **Must NOT do**:
  - Do not modify any existing CONFIG entries
  - Do not change the benchmark runner logic
  - Do not enable thinking/reasoning mode

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple Ollama pull + config edits

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `test-data/run-benchmark.js:31-55` — CONFIG array format showing how models are registered (provider, model, label, apiUrl)
  - `grading-server/providers.js:26-72` — Ollama provider implementation (temperature 0.2, `/api/chat` endpoint)
  - Ollama CLI docs: `ollama pull qwen3.5:9b`, `ollama pull qwen3:14b`

  **Acceptance Criteria**:
  - [ ] `ollama list` shows both `qwen3.5:9b` and `qwen3:14b`
  - [ ] Both respond to `curl -s http://localhost:11434/api/chat -d '{"model":"qwen3.5:9b","messages":[{"role":"user","content":"Say hello"}]}'`
  - [ ] `run-benchmark.js` CONFIG has entries for both models

  **QA Scenarios**:
  ```
  Scenario: Both models pulled and responsive
    Tool: Bash
    Preconditions: Ollama running locally
    Steps:
      1. Run `ollama list` — verify qwen3.5:9b and qwen3:14b appear
      2. Run `curl -s http://localhost:11434/api/chat -d '{"model":"qwen3.5:9b","messages":[{"role":"user","content":"Return only the word HELLO"}]}' | grep -i hello`
      3. Run same for qwen3:14b
    Expected Result: Both models return responses containing "HELLO"
    Failure Indicators: Connection refused, model not found, empty response
    Evidence: .sisyphus/evidence/task-1-models-pulled.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `feat(benchmark): add Qwen3 model configs for zero-shot evaluation`
  - Files: `test-data/run-benchmark.js`

- [x] 2. Audit Existing Grading Training Data

  **What to do**:
  - Read `test-data/finetune-gptoss-qwen.jsonl` — count examples, analyze score distribution, identify rubric diversity
  - Read `test-data/benchmark-cor-v2.json` — extract GLM+Sonnet consensus scores for all 25 students
  - Identify which rubric(s) are represented and which score ranges (0-10) are missing
  - Check `test-data/test-biology-rubric.json`, `test-data/test-biology-students.json`, `test-data/test-history-rubric.json`, `test-data/test-history-students.json` — assess whether these have graded consensus scores or just raw data
  - Report: total examples, rubric count, score distribution, gaps

  **Must NOT do**:
  - Do not modify any existing files
  - Do not generate new training data yet (that's Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Read-only analysis of JSON files

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `test-data/finetune-gptoss-qwen.jsonl` — existing 25 training examples in OpenAI chat format
  - `test-data/benchmark-cor-v2.json` — raw scores for all 25 students across 3 models, 3 runs each
  - `test-data/test-biology-rubric.json`, `test-data/test-biology-students.json` — biology dataset
  - `test-data/test-history-rubric.json`, `test-data/test-history-students.json` — history dataset
  - `test-data/fine-tuning-decision.md:131-132` — warning about insufficient training data volume

  **Acceptance Criteria**:
  - [ ] Report includes: total example count, rubric names, score distribution histogram, identified gaps
  - [ ] Biology and history datasets assessed for suitability as training or held-out data

  **QA Scenarios**:
  ```
  Scenario: Training data audit report
    Tool: Bash
    Preconditions: test-data/ directory exists
    Steps:
      1. Count lines in finetune-gptoss-qwen.jsonl
      2. Parse each line, extract score from assistant message, build histogram
      3. Extract unique rubric prompts (first 200 chars of user message)
      4. Read biology/history rubric files, report structure
    Expected Result: Report showing 25 examples, 1 rubric, scores clustered 6-8, biology/history available
    Evidence: .sisyphus/evidence/task-2-data-audit.md
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(benchmark): add Qwen3 model configs for zero-shot evaluation`
  - Files: `test-data/run-benchmark.js`

- [x] 3. Zero-Shot Benchmark Both Candidates

  **What to do**:
  - Start the grading server: `bun run grading-server/server.js`
  - Run benchmark for Qwen3.5-9B: `bun run test-data/run-benchmark.js --only=qwen35 --output=test-data/benchmark-qwen35-zeroshot.json`
  - Run benchmark for Qwen3-14B: `bun run test-data/run-benchmark.js --only=qwen314b --output=test-data/benchmark-qwen314b-zeroshot.json`
  - Run 3 iterations per model for variance measurement
  - Extract pairwise agreement with GLM-5 and Sonnet 4.6 from results
  - Compare: which model has higher agreement? Lower variance? Better JSON compliance?
  - Record JSON parse failure rate for each model

  **Must NOT do**:
  - Do not modify the prompt or grading server
  - Do not enable thinking/reasoning mode
  - Do not test against all 10 models — only GLM-5 and Sonnet 4.6

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Long-running benchmark execution, needs patience and analysis

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1)
  - **Parallel Group**: Sequential after Task 1
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `test-data/run-benchmark.js` — benchmark runner with `--only` and `--output` flags
  - `test-data/benchmark-cor-v2.json` — reference format for benchmark output
  - `test-data/fine-tuning-decision.md:25-30` — T14 agreement table format
  - `grading-server/grading.js:97-247` — the exact CoR v2 prompt that will be used

  **Acceptance Criteria**:
  - [ ] `test-data/benchmark-qwen35-zeroshot.json` exists with valid JSON
  - [ ] `test-data/benchmark-qwen314b-zeroshot.json` exists with valid JSON
  - [ ] Both files contain agreement percentages for GLM-5 and Sonnet pairs
  - [ ] JSON parse failure rate recorded for each model
  - [ ] Summary comparison table created

  **QA Scenarios**:
  ```
  Scenario: Both models produce parseable benchmark results
    Tool: Bash
    Preconditions: Grading server running, both models pulled
    Steps:
      1. Start grading server in background
      2. Run benchmark for qwen3.5:9b, wait for completion
      3. Run benchmark for qwen3:14b, wait for completion
      4. Parse both output JSONs, extract agreement percentages
      5. Compare agreement with GLM-5 for both models
    Expected Result: Both files valid JSON, both show >0% agreement (models produce parseable output)
    Failure Indicators: Timeout, empty output, all-zero scores, 100% parse failures
    Evidence: .sisyphus/evidence/task-3-zeroshot-comparison.md

  Scenario: JSON compliance check
    Tool: Bash
    Steps:
      1. Extract parse failure count from benchmark output for each model
      2. Calculate parse failure rate: failures / (students × runs)
    Expected Result: Parse failure rate <20% for at least one model (zero-shot may not be perfect)
    Evidence: .sisyphus/evidence/task-3-json-compliance.txt
  ```

  **Commit**: YES
  - Message: `data(benchmark): zero-shot benchmark results for Qwen3.5-9B and Qwen3-14B`
  - Files: `test-data/benchmark-qwen35-zeroshot.json`, `test-data/benchmark-qwen314b-zeroshot.json`

- [x] 4. Audit MOM Community Library Questions

  **What to do**:
  - Use `mom-lib-map` skills to browse MOM community question libraries across subjects
  - Inventory available question types: essay-FRQ, number, multiple-choice, multipart, matrix, etc.
  - For each subject library, identify: total questions available, answer types, complexity range, `loadlibrary()` usage
  - Assess which questions are suitable for training data (working, diverse, well-structured)
  - Report: total available questions, type distribution, topics covered, recommended selections for Task 13

  **Must NOT do**:
  - Do not modify any MOM questions
  - Do not generate training data yet (that's Task 13)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`mom-frq`, `mom-lib-map/statistics`, `mom-lib-map/algebra`]
  - **Reason**: Needs MOM domain knowledge + community library navigation to audit available questions
  - `mom-frq`: Understanding of IMathAS question format to evaluate training data suitability
  - `mom-lib-map/*`: Browse community libraries to inventory available questions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 13
  - **Blocked By**: None

  **References**:
  - `.claude/skills/mom-frq/CLAUDE.md` — 1,043-line MOM question writing reference (all question types, answer formats)
  - `.claude/skills/mom-lib-map/CLAUDE.md` — how to navigate MOM community libraries
  - `mom/questions/CLAUDE.md` — recent question creation activity log

  **Acceptance Criteria**:
  - [ ] Inventory report: total questions, type breakdown, topic distribution
  - [ ] Assessment of training data suitability (how many are usable as-is)
  - [ ] List of questions needing `loadlibrary()` calls identified

  **QA Scenarios**:
  ```
  Scenario: MOM question inventory complete
    Tool: Bash
    Steps:
      1. List all question files in the MOM repo
      2. Categorize by file extension and content type
      3. Count total, count by question type
    Expected Result: 50+ questions inventoried with type/topic breakdown
    Evidence: .sisyphus/evidence/task-4-mom-inventory.md
  ```

  **Commit**: NO (read-only audit)

### Wave 2 — Training Data Prep + Model Decision (After Wave 1)

- [x] 5. Decide Winner from Benchmark Results

  **What to do**:
  - Read `test-data/benchmark-qwen35-zeroshot.json` and `test-data/benchmark-qwen314b-zeroshot.json`
  - Compare: pairwise agreement with GLM-5, pairwise agreement with Sonnet, JSON parse failure rate, run-to-run variance
  - Decision criteria (in priority order):
    1. Higher agreement with GLM-5 (primary metric)
    2. Lower JSON parse failure rate (must produce structured output)
    3. Lower run-to-run variance (consistency)
    4. If tied within 5%: prefer Qwen3.5-9B (newer architecture, more VRAM headroom for training)
  - Write decision to `.sisyphus/evidence/task-5-model-decision.md` with full rationale
  - **The chosen model becomes `BASE_MODEL` for all subsequent tasks**
  - If NEITHER model produces any valid JSON output (100% parse failures), STOP and report — the grading prompt may need adaptation for smaller models

  **Must NOT do**:
  - Do not re-run benchmarks
  - Do not test additional models

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Decision-making from existing data

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — gate for Wave 2
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 3

  **References**:
  - `test-data/benchmark-qwen35-zeroshot.json` — Qwen3.5-9B results
  - `test-data/benchmark-qwen314b-zeroshot.json` — Qwen3-14B results
  - `test-data/fine-tuning-decision.md:109-116` — decision matrix format

  **Acceptance Criteria**:
  - [ ] Decision document exists with comparison table and rationale
  - [ ] `BASE_MODEL` clearly identified (either `qwen3.5:9b` or `qwen3:14b`)
  - [ ] If neither model works, failure documented with next-step recommendation

  **QA Scenarios**:
  ```
  Scenario: Model decision is justified by data
    Tool: Bash
    Steps:
      1. Read decision document
      2. Verify agreement percentages match source benchmark files
      3. Verify decision follows priority criteria
    Expected Result: Decision doc references specific percentages from benchmark files
    Evidence: .sisyphus/evidence/task-5-model-decision.md
  ```

  **Commit**: NO (decision artifact only)

- [x] 6. Prepare Multi-Rubric Grading JSONL

  **What to do**:
  - User will provide MOM assignment URLs for 3+ different rubrics/topics
  - For each URL: use Playwriter to navigate to the MOM grading page, extract the rubric and all student responses (same extraction pattern as the `/grade` skill)
  - Run GLM-5 and Sonnet 4.6 grading on each set of student responses to generate consensus scores
  - For each rubric/topic, generate training examples in the EXACT format of `test-data/finetune-gptoss-qwen.jsonl`:
    - `messages[0]` (system): `"You are an expert grading assistant..."`
    - `messages[1]` (user): The FULL CoR v2 prompt as generated by `buildBatchPrompt()` or `buildSingleGradePrompt()` in `grading.js` — including GRADING_PHILOSOPHY, SCORING ANCHORS, GRADING CHECKLIST, PARTIAL CREDIT RULE, SCORING SCALE, and student response
    - `messages[2]` (assistant): The correct JSON output with criterion_scores, score, and feedback
  - Use GLM-5 + Sonnet 4.6 consensus scores as ground truth (run both, average, resolve disagreements)
  - **CRITICAL**: Score distribution must cover 0-10 range. Include:
    - At least 2 examples scoring 0-2 (empty/nonsensical responses)
    - At least 5 examples scoring 3-5 (partial credit edge cases)
    - At least 5 examples scoring 6-8 (mid-range)
    - At least 2 examples scoring 9-10 (excellent)
  - **CRITICAL**: At least 3 different rubrics with different category names
  - **HOLD OUT**: Do NOT include biology dataset — reserve it for validation (Task 12)
  - Split: 80% training → `test-data/finetune-grading.jsonl`, 20% validation → `test-data/finetune-grading-val.jsonl`
  - Target: minimum 50 training examples + 12 validation examples

  **Must NOT do**:
  - Do not include biology examples in training data (held-out for validation)
  - Do not simplify the prompt format — use the FULL production prompt structure
  - Do not manually assign scores — use GLM+Sonnet consensus only
  - Do not include thinking tokens in assistant responses

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`playwriter`]
  - **Reason**: Complex data pipeline requiring browser automation (Playwriter) to extract rubrics/students from MOM, plus consensus generation via grading server
  - `playwriter`: Needed to navigate MOM assignment URLs and extract rubric + student response data

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:
  - `test-data/finetune-gptoss-qwen.jsonl` line 1 — exact JSONL chat format to follow
  - `grading-server/grading.js:97-247` — `buildBatchPrompt()` for full prompt structure
  - `grading-server/grading.js:747-831` — `buildSingleGradePrompt()` for single-student format
  - `grading-server/grading-constants.js:1-26` — GRADING_PHILOSOPHY and SCORING_SCALE_DESCRIPTORS
  - `.claude/commands/grade.md` — extraction pattern for MOM grading pages (rubric + student responses)
  - `.claude/commands/grade-selectors.md` — CSS selectors for MOM page elements
  - `test-data/test-biology-rubric.json` — DO NOT USE (held out)
  - `test-data/test-history-rubric.json` + `test-data/test-history-students.json` — available for training
  - **User will provide**: MOM assignment URLs for 3+ rubrics at execution time

  **Acceptance Criteria**:
  - [ ] `test-data/finetune-grading.jsonl` has ≥50 lines
  - [ ] `test-data/finetune-grading-val.jsonl` has ≥12 lines
  - [ ] Every line is valid JSON with messages array containing system/user/assistant
  - [ ] ≥3 unique rubric prompts in training data
  - [ ] Score distribution covers 0-2, 3-5, 6-8, 9-10 ranges
  - [ ] No biology rubric examples in training data
  - [ ] User message format matches production `buildBatchPrompt()` output

  **QA Scenarios**:
  ```
  Scenario: Training data diversity and format validation
    Tool: Bash
    Steps:
      1. `wc -l test-data/finetune-grading.jsonl` — verify ≥50 lines
      2. Parse each line, verify JSON structure: messages[0].role="system", messages[1].role="user", messages[2].role="assistant"
      3. Extract scores from assistant messages, build histogram
      4. Extract unique rubric identifiers (first 200 chars of user message), count unique
      5. Grep for "biology" in user messages — must be absent
    Expected Result: 50+ lines, 3+ rubrics, scores span 0-10, no biology contamination
    Failure Indicators: <50 lines, single rubric, scores only 6-8, biology found
    Evidence: .sisyphus/evidence/task-6-training-data-validation.md
  ```

  **Commit**: YES
  - Message: `feat(training): create multi-rubric grading fine-tuning dataset`
  - Files: `test-data/finetune-grading.jsonl`, `test-data/finetune-grading-val.jsonl`

- [x] 7. Validate + Balance Training Dataset

  **What to do**:
  - Run format validation on `test-data/finetune-grading.jsonl`: every line must parse as valid JSON with correct structure
  - Check for data quality issues: duplicate examples, extremely short/long responses, malformed feedback
  - Verify score distribution is balanced enough (no more than 40% of examples in any 2-point band)
  - Verify criterion_scores in assistant responses use correct category names from each rubric
  - Cross-check that assistant response scores match the stated criterion_scores sum
  - If imbalanced: flag which score ranges need more examples
  - Write validation report

  **Must NOT do**:
  - Do not modify the training data (flag issues for Task 6 to fix)
  - Do not train the model

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Data validation requiring JSON parsing and statistical analysis

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 6
  - **Blocks**: Task 9
  - **Blocked By**: Task 6

  **References**:
  - `test-data/finetune-grading.jsonl` — training data to validate
  - `test-data/finetune-grading-val.jsonl` — validation data to validate
  - `grading-server/grading.js:215-243` — expected JSON output structure (criterion_scores, score, feedback)

  **Acceptance Criteria**:
  - [ ] 100% of lines parse as valid JSON
  - [ ] No duplicate examples
  - [ ] No score band >40% of total
  - [ ] All criterion_scores match rubric categories
  - [ ] Validation report written

  **QA Scenarios**:
  ```
  Scenario: Dataset passes all quality checks
    Tool: Bash
    Steps:
      1. Parse every JSONL line — count successes/failures
      2. Hash user messages — count unique vs duplicates
      3. Build score histogram in 2-point bands, verify max band ≤40%
      4. For each example, sum criterion_scores and compare to stated score
    Expected Result: 100% parse, 0 duplicates, balanced distribution, scores consistent
    Evidence: .sisyphus/evidence/task-7-validation-report.md
  ```

  **Commit**: NO (validation only)

- [x] 8. Set Up QLoRA Training Environment

  **What to do**:
  - Install Unsloth on the RTX 4070 machine: `pip install unsloth`
  - Verify CUDA is available and 12GB VRAM is detected
  - Download the BASE_MODEL (from Task 5 decision) in HuggingFace format (not GGUF — need full weights for training)
  - Configure QLoRA training script with:
    - 4-bit quantization (BitsAndBytes NF4)
    - LoRA rank 16-32, alpha 16-32
    - Learning rate: 1e-5 to 2e-5
    - Batch size: 1, gradient accumulation: 4
    - Max epochs: 2
    - Max sequence length: 8192 (matches production prompt size)
    - Warmup steps: 10% of total
    - FP16/BF16 mixed precision
  - **OOM FALLBACK**: If BASE_MODEL is qwen3-14b and the environment setup shows <1GB free VRAM after loading model, document this and recommend switching to qwen3.5-9b
  - Test with a dry-run: load model, run 1 training step on 1 example, verify no OOM

  **Must NOT do**:
  - Do not run full training yet (that's Task 9)
  - Do not enable thinking mode in the base model
  - Do not use full fine-tuning (only LoRA/QLoRA)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: ML environment setup requiring GPU knowledge

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 5

  **References**:
  - Unsloth docs: `https://unsloth.ai/docs/models/qwen3-how-to-run-and-fine-tune`
  - `test-data/FINE-TUNING-PLAN.md:64-68` — LoRA hyperparameters: rank 16-32, lr ~1e-5, 1-2 epochs
  - `test-data/FINE-TUNING-PLAN.md:83-86` — hardware specs: RTX 4070 12GB, 32GB RAM

  **Acceptance Criteria**:
  - [ ] Unsloth installed and importable
  - [ ] CUDA detected with 12GB VRAM
  - [ ] BASE_MODEL loaded in 4-bit without OOM
  - [ ] 1-step dry-run completes without error
  - [ ] If OOM: fallback documented

  **QA Scenarios**:
  ```
  Scenario: Training environment ready
    Tool: Bash
    Preconditions: RTX 4070 with CUDA drivers
    Steps:
      1. `python -c "import unsloth; print('OK')"` — verify import
      2. `python -c "import torch; print(torch.cuda.get_device_properties(0).total_mem // 1024**3, 'GB')"` — verify 12GB
      3. Run 1-step training dry-run script
      4. Check GPU memory after model load: `nvidia-smi`
    Expected Result: Unsloth imports, 12GB detected, dry-run completes, <11GB VRAM used
    Failure Indicators: OOM error, CUDA not found, import error
    Evidence: .sisyphus/evidence/task-8-env-setup.txt

  Scenario: OOM fallback triggered (if applicable)
    Tool: Bash
    Steps:
      1. If dry-run OOMs: document VRAM usage at failure point
      2. Switch BASE_MODEL to qwen3.5-9b
      3. Re-run dry-run with smaller model
    Expected Result: Smaller model loads and completes dry-run
    Evidence: .sisyphus/evidence/task-8-oom-fallback.txt
  ```

  **Commit**: NO (environment setup only)

### Wave 3 — Fine-Tuning + Evaluation (After Wave 2)

- [ ] 9. Run QLoRA Fine-Tuning (Grading Only)

  **What to do**:
  - Load BASE_MODEL (from Task 5) with Unsloth 4-bit QLoRA
  - Train on `test-data/finetune-grading.jsonl` with validation on `test-data/finetune-grading-val.jsonl`
  - Hyperparameters (from Task 8 setup):
    - LoRA rank: 16-32, alpha: 16-32
    - LR: 1e-5 to 2e-5 with cosine schedule
    - Epochs: 2 max
    - Batch size 1, gradient accumulation 4
    - Max seq length: 8192
  - Monitor training loss and validation loss per epoch
  - **STOP condition**: If validation loss INCREASES after epoch 1, stop training (overfitting)
  - Save LoRA adapter weights to `fine-tuned-model/grading-adapter/`
  - Merge adapter into base model: `model.save_pretrained_merged("fine-tuned-model/merged/")`
  - **GRADING ONLY** — do NOT include any MOM training data

  **Must NOT do**:
  - Do not train for more than 2 epochs
  - Do not include MOM examples in this training run
  - Do not enable thinking mode during training
  - Do not use full fine-tuning (LoRA only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: ML training requiring careful monitoring, hyperparameter awareness, and stop conditions

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — depends on Tasks 7 and 8
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 7, 8

  **References**:
  - Unsloth Qwen3 fine-tuning docs: `https://unsloth.ai/docs/models/qwen3-how-to-run-and-fine-tune`
  - `test-data/FINE-TUNING-PLAN.md:64-68` — hyperparameter recommendations
  - `test-data/finetune-grading.jsonl` — training data
  - `test-data/finetune-grading-val.jsonl` — validation data

  **Acceptance Criteria**:
  - [ ] Training completes without OOM (exit code 0)
  - [ ] Validation loss < training loss after final epoch (not overfitting)
  - [ ] `fine-tuned-model/merged/config.json` exists
  - [ ] Merged model weights exist in `fine-tuned-model/merged/`

  **QA Scenarios**:
  ```
  Scenario: Training completes successfully
    Tool: Bash
    Preconditions: Training environment set up (Task 8), training data validated (Task 7)
    Steps:
      1. Run training script with specified hyperparameters
      2. Monitor stdout for loss values per step
      3. After training, verify model files exist
      4. Check `nvidia-smi` — no lingering GPU memory issues
    Expected Result: Training completes, loss decreases, model files saved
    Failure Indicators: OOM, loss NaN, training loss increases, missing output files
    Evidence: .sisyphus/evidence/task-9-training-log.txt

  Scenario: Overfitting detection
    Tool: Bash
    Steps:
      1. Extract validation loss at epoch 1 and epoch 2
      2. If epoch 2 val loss > epoch 1 val loss: flag overfitting
    Expected Result: Epoch 2 val loss ≤ epoch 1 val loss (or training stopped at epoch 1)
    Evidence: .sisyphus/evidence/task-9-loss-curve.txt
  ```

  **Commit**: NO (model weights too large for git)

- [ ] 10. Export GGUF + Register in Ollama

  **What to do**:
  - Export merged model to GGUF format using Unsloth: `model.save_pretrained_gguf("fine-tuned-model/gguf/", tokenizer, quantization_method="q4_k_m")`
  - Alternatively use llama.cpp: `python convert_hf_to_gguf.py fine-tuned-model/merged/ --outtype q4_k_m`
  - Create an Ollama Modelfile:
    ```
    FROM fine-tuned-model/gguf/qwen3-ogre-Q4_K_M.gguf
    PARAMETER temperature 0.2
    PARAMETER stop "<|im_start|>"
    PARAMETER stop "<|im_end|>"
    TEMPLATE "..."  # Match base model's chat template
    ```
  - Register in Ollama: `ollama create qwen3-ogre -f Modelfile`
  - Verify model loads: `ollama run qwen3-ogre:latest "Say hello"`
  - Verify model produces JSON when given a grading prompt: send a simple test grading request

  **Must NOT do**:
  - Do not add `format: "json"` to the Modelfile — must work with prompt-only JSON
  - Do not enable thinking mode in the Modelfile
  - Do not modify any grading server code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: GGUF conversion pipeline with specific tool knowledge

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 9
  - **Blocks**: Tasks 11, 12
  - **Blocked By**: Task 9

  **References**:
  - Unsloth GGUF export: `model.save_pretrained_gguf()` method
  - Ollama Modelfile docs: `https://github.com/ollama/ollama/blob/main/docs/modelfile.md`
  - Qwen3 chat template from Ollama: check `qwen3:14b` or `qwen3.5:9b` template format
  - `grading-server/providers.js:26-72` — how Ollama provider sends requests (temperature 0.2)

  **Acceptance Criteria**:
  - [ ] GGUF file exists in `fine-tuned-model/gguf/`
  - [ ] `ollama list` shows `qwen3-ogre:latest`
  - [ ] `ollama run qwen3-ogre:latest "Hello"` returns coherent response
  - [ ] Model produces JSON when given a mini grading prompt

  **QA Scenarios**:
  ```
  Scenario: Model registered and responsive in Ollama
    Tool: Bash
    Steps:
      1. `ls fine-tuned-model/gguf/*.gguf` — verify GGUF file exists
      2. `ollama list | grep qwen3-ogre` — verify registration
      3. `ollama run qwen3-ogre:latest "Return only: {\"test\": true}"` — verify JSON capability
    Expected Result: GGUF exists, model registered, produces JSON
    Failure Indicators: Missing GGUF, ollama create fails, model can't produce JSON
    Evidence: .sisyphus/evidence/task-10-ollama-registration.txt

  Scenario: Grading prompt smoke test
    Tool: Bash
    Steps:
      1. Send a minimal grading request via curl to Ollama API with a 1-student prompt
      2. Verify response contains studentIndex, score, and feedback fields
    Expected Result: Valid JSON with expected fields
    Evidence: .sisyphus/evidence/task-10-grading-smoketest.txt
  ```

  **Commit**: YES
  - Message: `feat(model): register fine-tuned qwen3-ogre in Ollama`
  - Files: `Modelfile` (if stored in repo), benchmark config update

- [ ] 11. Post-Fine-Tune Grading Benchmark (Stats Dataset)

  **What to do**:
  - Add `qwen3-ogre` to the benchmark runner CONFIG in `test-data/run-benchmark.js`
  - Start grading server
  - Run benchmark: `bun run test-data/run-benchmark.js --only=qwen3-ogre --dataset=stats --output=test-data/benchmark-qwen3-ft-stats.json`
  - Run 3 iterations for variance measurement
  - Extract pairwise agreement with GLM-5 and Sonnet 4.6
  - **TARGET**: ≥90% agreement with GLM-5
  - Compare to zero-shot baseline (from Task 3): quantify improvement
  - Record JSON parse failure rate — **TARGET**: 0%
  - **GATE**: If agreement <90%, document which students disagree and why. This gates Wave 4 (MOM phase).

  **Must NOT do**:
  - Do not re-run the benchmark with different prompts
  - Do not modify grading server code
  - Do not count this as a "pass" if JSON parse failures >5%

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Benchmark analysis requiring interpretation of disagreement patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 12)
  - **Parallel Group**: Wave 3 (with Task 12)
  - **Blocks**: Task 13 (gate)
  - **Blocked By**: Task 10

  **References**:
  - `test-data/run-benchmark.js` — benchmark runner
  - `test-data/benchmark-qwen35-zeroshot.json` or `test-data/benchmark-qwen314b-zeroshot.json` — baseline for comparison
  - `test-data/fine-tuning-decision.md:109-116` — decision matrix format

  **Acceptance Criteria**:
  - [ ] `test-data/benchmark-qwen3-ft-stats.json` exists with valid JSON
  - [ ] Pairwise agreement with GLM-5 ≥90%
  - [ ] JSON parse failure rate = 0%
  - [ ] Improvement over zero-shot baseline documented

  **QA Scenarios**:
  ```
  Scenario: Fine-tuned model meets grading target on training rubric
    Tool: Bash
    Steps:
      1. Run benchmark with --only=qwen3-ogre --dataset=stats
      2. Parse output JSON, extract GLM-5 agreement percentage
      3. Compare to zero-shot baseline
    Expected Result: ≥90% agreement with GLM-5, improvement over baseline
    Failure Indicators: <90% agreement, parse failures, regression from baseline
    Evidence: .sisyphus/evidence/task-11-ft-stats-benchmark.md

  Scenario: Zero JSON parse failures
    Tool: Bash
    Steps:
      1. Extract parse failure count from benchmark output
      2. Calculate failure rate
    Expected Result: 0% parse failures across all runs
    Evidence: .sisyphus/evidence/task-11-parse-failures.txt
  ```

  **Commit**: YES
  - Message: `data(benchmark): post-fine-tune grading benchmark results (stats)`
  - Files: `test-data/benchmark-qwen3-ft-stats.json`

- [ ] 12. Grading Regression Check on Held-Out Rubric (Biology)

  **What to do**:
  - Run benchmark: `bun run test-data/run-benchmark.js --only=qwen3-ogre --dataset=biology --output=test-data/benchmark-qwen3-ft-biology.json`
  - Run 3 iterations for variance measurement
  - Extract pairwise agreement with GLM-5 and Sonnet 4.6
  - **TARGET**: ≥85% agreement with GLM-5 (lower than stats because model never saw this rubric)
  - This proves the model learned GENERALIZABLE grading ability, not just chi-square memorization
  - Record JSON parse failure rate — **TARGET**: 0%
  - If <85%: the model may have overfit to training rubrics. Document which criteria cause disagreements.

  **Must NOT do**:
  - Do not have biology data in the training set (verify by grepping finetune-grading.jsonl)
  - Do not consider <85% as acceptable for Wave 4 gate

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Held-out evaluation requiring careful interpretation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 11)
  - **Parallel Group**: Wave 3 (with Task 11)
  - **Blocks**: Task 13 (gate)
  - **Blocked By**: Task 10

  **References**:
  - `test-data/test-biology-rubric.json` — biology rubric (never in training data)
  - `test-data/test-biology-students.json` — biology student responses
  - `test-data/run-benchmark.js` — benchmark runner with --dataset=biology support

  **Acceptance Criteria**:
  - [ ] `test-data/benchmark-qwen3-ft-biology.json` exists with valid JSON
  - [ ] Pairwise agreement with GLM-5 ≥85%
  - [ ] JSON parse failure rate = 0%
  - [ ] Biology data confirmed absent from training JSONL

  **QA Scenarios**:
  ```
  Scenario: Model generalizes to unseen rubric
    Tool: Bash
    Steps:
      1. `grep -i biology test-data/finetune-grading.jsonl | wc -l` — verify 0 matches
      2. Run benchmark with --only=qwen3-ogre --dataset=biology
      3. Parse output, extract GLM-5 agreement
    Expected Result: 0 biology matches in training data, ≥85% agreement on biology benchmark
    Failure Indicators: Biology in training data, <85% agreement, parse failures
    Evidence: .sisyphus/evidence/task-12-biology-benchmark.md
  ```

  **Commit**: YES (group with Task 11)
  - Message: `data(benchmark): post-fine-tune held-out biology benchmark`
  - Files: `test-data/benchmark-qwen3-ft-biology.json`

### Wave 4 — MOM Code Fine-Tuning (ONLY if grading ≥90% on Task 11 AND ≥85% on Task 12)

> **GATE**: Tasks 11 and 12 must pass their targets before Wave 4 begins.
> If grading agreement is below target, STOP here. The model is a grading-only model.
> Do NOT proceed to MOM fine-tuning if grading isn't solid.

- [ ] 13. Prepare MOM Prompt→Code JSONL

  **What to do**:
  - Use the `mom-lib-map` skills to browse MOM community question libraries across subjects (statistics, algebra, calculus, etc.)
  - Select 50+ diverse, working questions from the community library as training examples
  - The agent decides which examples to include — prioritize diversity of question types, subjects, and complexity levels
  - For each question, create a training example in chat JSONL format:
    - `messages[0]` (system): `"You are an expert MyOpenMath question author. Write IMathAS question code based on the user's specification."`
    - `messages[1]` (user): A natural-language description of the question (e.g., "Write a multiple-choice question about chi-square goodness of fit with 3 random contexts. Include randomized sample sizes between 100-500. Award 5 points for correct identification of the test type and 5 points for correct calculation.")
    - `messages[2]` (assistant): The complete working IMathAS/MOM question code
  - **CRITICAL**: The user prompts must be diverse and realistic — not just "Write this exact question." Include:
    - Topic/subject specification
    - Answer type requirements (number, essay, multiple-choice)
    - Randomization requirements
    - Rubric/scoring requirements
    - `loadlibrary()` requirements where applicable
  - Include examples covering: essay-FRQ, number, multiple-choice, multipart, and matrix question types
  - Target: 50+ training examples
  - Save to `test-data/finetune-mom.jsonl`

  **Must NOT do**:
  - Do not include grading examples in this file (grading training is separate)
  - Do not fabricate questions that haven't been tested in IMathAS
  - Do not include thinking tokens in assistant responses

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`mom-frq`, `mom-lib-map/statistics`, `mom-lib-map/algebra`, `mom-lib-map/calculus`]
  - **Reason**: Requires deep understanding of MOM question format plus community library navigation
  - `mom-frq`: Essential for understanding IMathAS question syntax, answer types, loadlibrary usage
  - `mom-lib-map/*`: Navigate MOM community question libraries to find and select training examples across subjects

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — gated by Tasks 11 and 12
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 4, 11 (≥90%), 12 (≥85%)

  **References**:
  - `.claude/skills/mom-frq/CLAUDE.md` — complete MOM question writing reference (all question types, 1,043 lines)
  - `.claude/skills/mom-lib-map/CLAUDE.md` — how to browse MOM community question libraries
  - `.claude/skills/mom-lib-map/statistics/CLAUDE.md` — statistics community library
  - `.claude/skills/mom-lib-map/algebra/CLAUDE.md` — algebra community library
  - `test-data/finetune-gptoss-qwen.jsonl` — JSONL format reference (different system prompt but same structure)
  - `mom/questions/CLAUDE.md` — recent question creation activity showing 8+ Chapter 6 questions
  - **Primary data source**: MOM community question libraries (agent selects best examples)

  **Acceptance Criteria**:
  - [ ] `test-data/finetune-mom.jsonl` has ≥50 lines
  - [ ] Every line is valid JSON with system/user/assistant messages
  - [ ] System message is MOM-specific (not grading system message)
  - [ ] User messages are diverse natural-language descriptions (not copy-paste)
  - [ ] Assistant messages contain valid IMathAS code
  - [ ] At least 3 different question types represented

  **QA Scenarios**:
  ```
  Scenario: MOM training data format and diversity
    Tool: Bash
    Steps:
      1. `wc -l test-data/finetune-mom.jsonl` — verify ≥50 lines
      2. Parse each line, verify JSON structure
      3. Check system messages all contain "MyOpenMath" or "IMathAS"
      4. Sample 5 user messages — verify they're natural-language descriptions, not code
      5. Sample 5 assistant messages — verify they contain PHP-like MOM code patterns
    Expected Result: 50+ lines, valid format, diverse prompts, working code
    Evidence: .sisyphus/evidence/task-13-mom-data-validation.md
  ```

  **Commit**: YES
  - Message: `feat(training): create MOM question code fine-tuning dataset`
  - Files: `test-data/finetune-mom.jsonl`

- [ ] 14. Continue Fine-Tuning with MOM Data

  **What to do**:
  - Load the GRADING-ONLY fine-tuned model from Task 9 (LoRA adapter from `fine-tuned-model/grading-adapter/`)
  - Continue training with MOM data: `test-data/finetune-mom.jsonl`
  - **IMPORTANT**: Use a LOWER learning rate than grading training (half the original, e.g., 5e-6 to 1e-5) to avoid catastrophic forgetting of grading capability
  - Train for 1-2 epochs max
  - Monitor for signs of grading regression: after training, spot-check 3 grading prompts to verify JSON output is still correct
  - Save updated adapter to `fine-tuned-model/grading-mom-adapter/`
  - Merge into base model: `fine-tuned-model/merged-v2/`

  **Must NOT do**:
  - Do not train from scratch — continue from grading adapter
  - Do not use a higher learning rate than grading phase
  - Do not train for more than 2 epochs

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Continuation training requiring careful learning rate management

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 13
  - **Blocks**: Task 15
  - **Blocked By**: Task 13

  **References**:
  - `fine-tuned-model/grading-adapter/` — grading-only adapter from Task 9
  - `test-data/finetune-mom.jsonl` — MOM training data from Task 13
  - Unsloth docs on continuation training

  **Acceptance Criteria**:
  - [ ] Training completes without OOM
  - [ ] `fine-tuned-model/merged-v2/config.json` exists
  - [ ] Spot-check: model still produces valid grading JSON on 3 test prompts

  **QA Scenarios**:
  ```
  Scenario: MOM training doesn't break grading
    Tool: Bash
    Steps:
      1. After training, load merged-v2 model
      2. Send 3 grading prompts (from validation set)
      3. Verify all 3 produce valid JSON with studentIndex, score, feedback
    Expected Result: All 3 grading prompts return valid JSON
    Failure Indicators: Malformed JSON, missing fields, MOM code in grading output
    Evidence: .sisyphus/evidence/task-14-grading-regression-spotcheck.txt
  ```

  **Commit**: NO (model weights too large for git)

- [ ] 15. Re-Export GGUF + Update Ollama

  **What to do**:
  - Export merged-v2 model to GGUF: `model.save_pretrained_gguf("fine-tuned-model/gguf-v2/", tokenizer, quantization_method="q4_k_m")`
  - Update Ollama registration: `ollama create qwen3-ogre -f Modelfile-v2` (pointing to new GGUF)
  - Verify model loads and responds to both grading AND MOM prompts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Blocks**: Tasks 16, 17
  - **Blocked By**: Task 14

  **References**:
  - Same as Task 10 references

  **Acceptance Criteria**:
  - [ ] Updated GGUF exists
  - [ ] `ollama run qwen3-ogre:latest "Hello"` responds
  - [ ] Model handles both grading and MOM prompts

  **QA Scenarios**:
  ```
  Scenario: Updated model responds to both task types
    Tool: Bash
    Steps:
      1. Send a mini grading prompt — verify JSON output
      2. Send a MOM prompt ("Write a multiple-choice question about fractions") — verify code output
    Expected Result: Grading → JSON, MOM → IMathAS code
    Evidence: .sisyphus/evidence/task-15-dual-task-smoketest.txt
  ```

  **Commit**: YES
  - Message: `feat(model): update qwen3-ogre with MOM code generation capability`
  - Files: Updated Modelfile

- [ ] 16. Verify MOM Code Generation Quality

  **What to do**:
  - Generate 5+ MOM questions using the fine-tuned model across different types:
    - 1 essay-FRQ question
    - 1 numerical answer question
    - 1 multiple-choice question
    - 1 multipart question
    - 1 question requiring `loadlibrary()`
  - For each generated question:
    - Check syntax validity (balanced braces, valid PHP-like patterns)
    - Verify randomization works (variables use `rand()`, `array_rand()`, etc.)
    - If possible, paste into IMathAS and verify it renders without errors
  - Record: pass/fail for each question, common error patterns

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`mom-frq`]
  - `mom-frq`: Needed to evaluate generated code against IMathAS standards

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 17)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 15

  **Acceptance Criteria**:
  - [ ] 5+ questions generated across different types
  - [ ] ≥4 out of 5 have valid syntax (no unmatched braces, valid variable names)
  - [ ] ≥3 out of 5 paste into IMathAS without errors (if testable)

  **QA Scenarios**:
  ```
  Scenario: Generated MOM questions are syntactically valid
    Tool: Bash
    Steps:
      1. Generate 5 MOM questions via ollama run qwen3-ogre with different prompts
      2. For each: check balanced braces, check $answer is set, check $questionType exists
      3. Count valid vs invalid
    Expected Result: ≥4/5 syntactically valid
    Evidence: .sisyphus/evidence/task-16-mom-quality.md
  ```

  **Commit**: NO (evaluation only)

- [ ] 17. Grading Regression Test Post-MOM

  **What to do**:
  - Re-run BOTH grading benchmarks to verify MOM training didn't degrade grading:
    - Stats: `bun run test-data/run-benchmark.js --only=qwen3-ogre --dataset=stats --output=test-data/benchmark-qwen3-ft-v2-stats.json`
    - Biology: `bun run test-data/run-benchmark.js --only=qwen3-ogre --dataset=biology --output=test-data/benchmark-qwen3-ft-v2-biology.json`
  - Compare to pre-MOM results (Task 11 and Task 12):
    - Stats agreement must still be ≥88% (allowed 2% regression from MOM training)
    - Biology agreement must still be ≥83% (allowed 2% regression)
  - If regression >2%: MOM fine-tuning damaged grading. Recommend reverting to grading-only model (Task 9 output).
  - Record comparison table: before vs after MOM training

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 16)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 15

  **Acceptance Criteria**:
  - [ ] Stats agreement ≥88% (within 2% of pre-MOM)
  - [ ] Biology agreement ≥83% (within 2% of pre-MOM)
  - [ ] Before/after comparison table documented
  - [ ] If regression >2%: revert recommendation documented

  **QA Scenarios**:
  ```
  Scenario: MOM training didn't regress grading quality
    Tool: Bash
    Steps:
      1. Run stats benchmark, extract GLM-5 agreement
      2. Run biology benchmark, extract GLM-5 agreement
      3. Compare to Task 11 and Task 12 results
      4. Calculate regression: Task11_agreement - current_agreement
    Expected Result: ≤2% regression on both datasets
    Failure Indicators: >2% regression, parse failures that weren't there before
    Evidence: .sisyphus/evidence/task-17-regression-comparison.md
  ```

  **Commit**: YES
  - Message: `data(benchmark): post-MOM grading regression test results`
  - Files: `test-data/benchmark-qwen3-ft-v2-stats.json`, `test-data/benchmark-qwen3-ft-v2-biology.json`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Benchmark Integrity Review** — `unspecified-high`
  Verify all benchmark JSON files are valid. Cross-check agreement percentages manually by reading raw scores. Confirm held-out rubric was never in training data. Check GGUF model is loadable.
  Output: `Benchmarks [N/N valid] | Agreement [verified/discrepancy] | Held-out [CLEAN/CONTAMINATED] | VERDICT`

- [ ] F3. **End-to-End Grading Server QA** — `unspecified-high`
  Start grading server. Send a real grading request using the fine-tuned model via `curl`. Verify response parses correctly, scores are within range, feedback is coherent. Test with 5+ students.
  Output: `Server [UP/DOWN] | Parse [PASS/FAIL] | Scores [IN RANGE/OUT] | Feedback [COHERENT/BROKEN] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify no production code was modified (`grading.js`, `providers.js`, `server.js`). Confirm no thinking mode artifacts in outputs. Confirm no Ollama `format: "json"` usage. Check no prompt re-optimization occurred.
  Output: `Production Code [CLEAN/MODIFIED] | Thinking Mode [ABSENT/PRESENT] | Scope [COMPLIANT/CREEP] | VERDICT`

---

## Commit Strategy

- **After Wave 1**: `feat(benchmark): add zero-shot Qwen3 benchmark results` — benchmark JSON files
- **After Wave 2**: `feat(training): create multi-rubric grading training dataset` — JSONL files
- **After Wave 3**: `feat(model): register fine-tuned qwen3-ogre in Ollama` — Modelfile, GGUF reference, benchmark results
- **After Wave 4**: `feat(model): add MOM code generation to qwen3-ogre` — MOM JSONL, updated model, regression tests

---

## Success Criteria

### Verification Commands
```bash
# Model is registered and responds
ollama run qwen3-ogre:latest "Hello" # Expected: coherent text response

# Grading benchmark on training rubric (stats)
bun run test-data/run-benchmark.js --only=qwen3-ogre --dataset=stats
# Expected: ≥90% agreement with GLM-5

# Grading benchmark on held-out rubric (biology)
bun run test-data/run-benchmark.js --only=qwen3-ogre --dataset=biology
# Expected: ≥85% agreement with GLM-5

# JSON parse rate
# Expected: 0% parse failures across all benchmark runs

# MOM code generation (manual paste into IMathAS)
# Expected: 5+ questions paste without syntax errors
```

### Final Checklist
- [ ] Both Qwen3.5-9B and Qwen3-14B benchmarked zero-shot
- [ ] Training data covers 3+ rubrics with 0-10 score range
- [ ] Fine-tuned model registered as `qwen3-ogre:latest`
- [ ] ≥90% GLM-5 agreement on stats
- [ ] ≥85% GLM-5 agreement on held-out biology
- [ ] 0% JSON parse failures
- [ ] MOM questions generate valid IMathAS code
- [ ] No production code modified
- [ ] No thinking mode in outputs
