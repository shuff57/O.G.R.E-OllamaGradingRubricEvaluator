# Qwen3 Fine-Tuning: Grading (Text + Vision)

## TL;DR

> **Quick Summary**: Fine-tune Qwen3.5-9B on Google Colab A100 using bf16 LoRA to produce a local model that grades student work (text AND handwritten images) with structured JSON output. Training uses 481 examples (283 text + 198 vision). Model exported as GGUF, registered locally in Ollama as `qwen3.5-9B-stat-grader`.
> 
> **Deliverables**:
> - Zero-shot benchmark results for both model candidates (DONE)
> - Curated multi-rubric grading training dataset — 283 text + 198 vision entries (DONE)
> - bf16 LoRA fine-tuned model, exported as GGUF Q4_K_M, registered in Ollama as `qwen3.5-9B-stat-grader`
> - Post-fine-tune benchmark proving ≥90% agreement with GLM-5/Sonnet on stats, ≥85% on held-out rubric
> - Post-fine-tune vision benchmark proving ≥80% score agreement on good-quality handwriting images
> 
> **Estimated Effort**: Medium (training on Colab + local benchmarking)
> **Parallel Execution**: YES — 3 waves (Waves 1-2 DONE)
> **Critical Path**: Task 9 → Task 10a → Task 10b → Tasks 11 + 11b + 12 (parallel)

---

## Context

### Original Request
User reviewed the fine-tuning decision document and wants to proceed with fine-tuning Qwen3.5-9B for rubric-based grading of both text responses and handwritten student work images. MOM code generation was originally planned but has been deferred to a separate plan/model.

### Interview Summary
**Key Discussions**:
- GLM-5 vs Sonnet 4.6 at 96% agreement — production pair. GPT-OSS stuck at 80%.
- Fine-tuning GPT-OSS not accessible (cloud relay). Need a local model.
- Qwen3 family fine-tunes exceptionally well (Distillabs: 4B matched 120B on 7/8 benchmarks).
- Qwen3.5-9B chosen as BASE_MODEL after zero-shot benchmarking (Tasks 1-5 complete).
- Training data: 283 text grading entries + 198 vision grading entries (handwriting images) = 481 total.
- **Training platform**: Google Colab A100 (NOT local RTX 4070). bf16 LoRA (NOT 4-bit QLoRA — Unsloth warns against QLoRA for Qwen3.5).
- **Data transfer**: Direct upload of JSONL files to Colab runtime.
- **Model export**: GGUF Q4_K_M saved to Google Drive → downloaded locally → registered in Ollama.
- **Benchmarking**: Quick sanity check on Colab after training, then full benchmarks locally via Ollama.
- **MOM code generation**: Deferred to a separate plan. This plan is grading-only.
- **Epochs**: Max 2 (Colab script currently uses 3 — must be updated to 2).
- **Model name**: `qwen3.5-9B-stat-grader` (matches existing Modelfile convention).

**Research Findings**:
- Qwen3.5-9B: ~6-7GB VRAM Q4, native structured output, tools+thinking, 262K context, native multimodal
- Previous fine-tuning run achieved 92% agreement with Sonnet (noted in FINE-TUNING-PLAN.md). This is a RE-TRAINING from base with expanded 481-example dataset.
- Existing Colab script: `test-data/colab_train_qwen35_grader.py` (440 lines) — uses Unsloth FastVisionModel, Google Drive checkpoints, GGUF export
- Benchmark runner (`test-data/run-benchmark.js`) fully functional, supports `--only` flag

### Metis Review
**Identified Gaps** (addressed):
- Training data diversity: All 25 existing examples use same rubric → require 3+ rubrics (DONE: 22 topics, 283 entries)
- Circular evaluation: Training on GLM+Sonnet consensus, eval on same → use held-out rubric (biology held out)
- Score distribution: Training data skews 6-8 → require 0-10 coverage (DONE: 0-10 text, 2-9 vision)
- No thinking mode during training or benchmarking
- **Colab-specific gaps** (from Metis review on Colab migration):
  - No smoke test between training and GGUF export → add Colab smoke test step
  - GGUF saved to ephemeral `/content/`, not Drive → add Drive copy step
  - No checksum verification on GGUF → add md5sum step
  - `train_on_responses_only` disabled for ALL data when vision included → accepted trade-off (documented)
  - Colab may assign T4/L4 instead of A100 → add GPU verification with 4-bit fallback
  - No `eval_dataset` configured → add validation loss monitoring
  - Epoch mismatch (script: 3, plan: 2) → resolved to 2

---

## Work Objectives

### Core Objective
Fine-tune Qwen3.5-9B on Google Colab A100 for rubric-based grading of both text responses and handwritten student work images, producing structured JSON output.

### Concrete Deliverables
- `test-data/benchmark-qwen35-zeroshot.json` — zero-shot results for Qwen3.5-9B (DONE)
- `test-data/benchmark-qwen314b-zeroshot.json` — zero-shot results for Qwen3-14B (DONE)
- `test-data/finetune-grading.jsonl` — multi-rubric text grading training data, 283 examples (DONE)
- `test-data/finetune-grading-vision.jsonl` — vision grading training data, 198 examples with handwriting images (DONE)
- `test-data/finetune-grading-val.jsonl` — held-out validation set, biology/history (DONE)
- Fine-tuned GGUF Q4_K_M model registered in Ollama as `qwen3.5-9B-stat-grader`
- `test-data/benchmark-qwen3-ft-stats.json` — post-fine-tune stats benchmark (text)
- `test-data/benchmark-qwen3-ft-vision.json` — post-fine-tune vision grading benchmark (handwriting)
- `test-data/benchmark-qwen3-ft-biology.json` — post-fine-tune held-out benchmark

### Definition of Done
- [ ] `ollama run qwen3.5-9B-stat-grader "test"` responds coherently
- [ ] Grading benchmark: ≥90% pairwise agreement with GLM-5 on stats dataset
- [ ] Grading benchmark: ≥85% pairwise agreement with GLM-5 on held-out biology dataset
- [ ] Vision grading: ≥80% score agreement (±1) on good-quality handwriting images
- [ ] JSON parse failure rate: 0% on text benchmarks, ≤5% on vision

### Must Have
- Zero-shot benchmark of BOTH candidates before fine-tuning (DONE)
- Training data from 3+ different rubrics with diverse category names (DONE: 22 topics)
- Score distribution covering 0-10 range (DONE: 0-10 text, 2-9 vision)
- Held-out rubric (biology) never seen during training (DONE)
- Exact CoR v2 prompt structure in training examples (matching `grading.js:97-247`)
- ≤2 epochs on ~481 combined examples (283 text + 198 vision) to prevent overfitting
- Colab GPU verification before training — assert A100 or fallback to 4-bit
- Post-training smoke test on Colab BEFORE GGUF export (3 grading prompts → valid JSON)
- GGUF copied to Google Drive before any download attempt (persistence)
- md5sum checksum verification: Colab export matches local download
- GGUF smoke test on Colab via llama-cli BEFORE downloading

### Must NOT Have (Guardrails)
- **NO thinking mode** during training or benchmarking — disable `/think` tokens
- **MULTIMODAL ENABLED** — train on both text (`finetune-grading.jsonl`, 283 entries) AND vision (`finetune-grading-vision.jsonl`, 198 entries with base64 handwriting images). Qwen3.5-9B supports native multimodal. Mix in same training run.
- **NO QLoRA 4-bit for Qwen3.5** — Use bf16 LoRA (`load_in_16bit=True`). Unsloth docs explicitly warn against QLoRA for Qwen3.5 due to higher quantization differences. Only fall back to 4-bit if Colab assigns T4/L4 instead of A100.
- **NO Ollama `format: "json"` parameter** — must work with prompt-only JSON (current behavior)
- **NO prompt re-optimization** — use exact CoR v2 prompt from `grading.js`, do not re-engineer
- **NO changes to production code** — do not modify `grading.js`, `providers.js`, `server.js`, or any desktop app code
- **NO fine-tuning for lenient/strict** — only neutral philosophy. Custom instructions come from prompt.
- **NO testing with >10 benchmark models** — only benchmark against GLM-5 and Sonnet 4.6
- **NO building new benchmark tooling** — use existing `run-benchmark.js`
- **NO testing at 262K context** — production prompts are 4-8K tokens
- **NO browser download as primary GGUF transfer** — use Google Drive + gdown/rclone. Browser download is fallback only.
- **NO Windows paths in Modelfiles** — use relative paths only (portable across Linux/Windows)

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
- **Fine-tuning tasks (Colab side)**: Use Bash on Colab — training logs, smoke test, GGUF export, Drive copy, checksum
- **Fine-tuning tasks (local side)**: Use Bash — GGUF download, checksum verify, Ollama registration, inference test

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (DONE — benchmark + data prep):
├── Task 1: Pull models + zero-shot benchmark setup [quick] ✅
├── Task 2: Audit existing grading training data [quick] ✅
├── Task 3: Zero-shot benchmark both candidates [unspecified-high] ✅
└── Task 4: Audit MOM questions in private repo [quick] ✅ (no longer needed — MOM deferred)

Wave 2 (DONE — training data + model decision):
├── Task 5: Decide winner from benchmark results [quick] ✅
├── Task 6: Prepare multi-rubric grading JSONL [deep] ✅
├── Task 7: Validate + balance training dataset [unspecified-high] ✅
└── Task 8: Set up QLoRA training environment on Colab [unspecified-high] ✅

Wave 3 (NEXT — fine-tuning on Colab + local evaluation):
├── Task 9: Run bf16 LoRA fine-tuning on Colab A100 (text + vision grading) [deep]
├── Task 10a: Export GGUF + verify on Colab + copy to Drive [unspecified-high]
├── Task 10b: Download GGUF + register in Ollama locally [unspecified-high]
├── Task 11: Post-fine-tune grading benchmark — text (local) [deep]
├── Task 11b: Post-fine-tune vision grading benchmark (local) [deep]
└── Task 12: Grading regression check on held-out rubric (local) [deep]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Benchmark integrity review [unspecified-high]
├── Task F3: End-to-end grading server QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 9 → Task 10a → Task 10b → Tasks 11 + 11b + 12 (parallel)
Parallel Speedup: ~40% faster than sequential (benchmarks run in parallel)
Max Concurrent: 3 (Tasks 11, 11b, 12)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 ✅ | — | 3 | 1 |
| 2 ✅ | — | 6 | 1 |
| 3 ✅ | 1 | 5 | 1 |
| 4 ✅ | — | — (MOM deferred) | 1 |
| 5 ✅ | 3 | 8, 9 | 2 |
| 6 ✅ | 2 | 7 | 2 |
| 7 ✅ | 6 | 9 | 2 |
| 8 ✅ | 5 | 9 | 2 |
| 9 | 7, 8 | 10a | 3 |
| 10a | 9 | 10b | 3 |
| 10b | 10a | 11, 11b, 12 | 3 |
| 11 | 10b | F1-F4 | 3 |
| 11b | 10b | F1-F4 | 3 |
| 12 | 10b | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1** ✅: 4 tasks — T1 `quick`, T2 `quick`, T3 `unspecified-high`, T4 `quick`
- **Wave 2** ✅: 4 tasks — T5 `quick`, T6 `deep`, T7 `unspecified-high`, T8 `unspecified-high`
- **Wave 3**: 6 tasks — T9 `deep`, T10a `unspecified-high`, T10b `unspecified-high`, T11 `deep`, T11b `deep`, T12 `deep`
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

- [x] 8. Set Up Training Environment on Google Colab

  **What to do**:
  - Set up Google Colab notebook with A100 GPU runtime
  - Install Unsloth + dependencies (`pip install unsloth`)
  - Verify GPU type is A100 (40GB or 80GB) — if T4/L4 assigned, fall back to `load_in_4bit=True`
  - Load Qwen3.5-9B with `load_in_16bit=True` (bf16 LoRA, NOT QLoRA 4-bit)
  - Configure training script (existing: `test-data/colab_train_qwen35_grader.py`)
  - Test with a dry-run: load model, run 1 training step on 1 example

  **COMPLETED**: Environment set up on Colab A100. Dry-run successful.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Blocks**: Task 9
  - **Blocked By**: Task 5

  **References**:
  - `test-data/colab_train_qwen35_grader.py` — existing Colab training script (440 lines)
  - Unsloth docs: `https://unsloth.ai/docs/models/qwen3-how-to-run-and-fine-tune`

  **Commit**: NO (environment setup only)

### Wave 3 — Fine-Tuning + Evaluation (After Wave 2)

- [ ] 9. Run bf16 LoRA Fine-Tuning on Google Colab A100

  **What to do**:

  **Step 1: Colab Setup**
  - Open Google Colab notebook, select A100 GPU runtime
  - **GPU VERIFICATION (MANDATORY)**: Run `assert 'A100' in torch.cuda.get_device_name(0)` in first cell. If T4/L4 assigned instead, switch `load_in_16bit=True` to `load_in_4bit=True` and reduce batch size. Document which GPU was assigned.
  - Mount Google Drive in the FIRST cell: `from google.colab import drive; drive.mount('/content/drive')`
  - Upload training data directly to Colab runtime:
    - `test-data/finetune-grading.jsonl` — 283 text-only grading entries
    - `test-data/finetune-grading-vision.jsonl` — 198 vision grading entries (base64 PNG images)
    - `test-data/finetune-grading-val.jsonl` — validation data

  **Step 2: Training Configuration**
  - Load Qwen3.5-9B with Unsloth `FastVisionModel`, `load_in_16bit=True` (bf16 LoRA)
  - Use existing training script as base: `test-data/colab_train_qwen35_grader.py`
  - **CRITICAL SCRIPT UPDATES** (must be applied before running):
    - Change `num_train_epochs=3` → `num_train_epochs=2` (max 2 epochs per plan)
    - Add `eval_dataset` and `eval_strategy="epoch"` to SFTConfig for validation loss monitoring
    - Add `save_total_limit=3` to SFTConfig to prevent Drive storage exhaustion
    - Ensure `remove_unused_columns=False` is set (required for multimodal)
  - Merge both JSONLs into a single shuffled dataset. Strip `_meta` from all entries before training.
  - Hyperparameters:
    - bf16 LoRA (NOT QLoRA 4-bit — Unsloth warns against 4-bit for Qwen3.5)
    - LoRA rank: 16-32, alpha: 16-32
    - LR: 1e-5 to 2e-5 with cosine schedule
    - Epochs: 2 max
    - Batch size 1, gradient accumulation 4
    - Max seq length: 8192
  - **Known trade-off**: When `HAS_VISION=True`, `train_on_responses_only` is disabled for ALL data (including text-only entries). This is accepted — the model trains on full prompts for both text and vision entries.

  **Step 3: Training Execution**
  - Run training, monitor training loss + validation loss per epoch
  - **STOP condition**: If validation loss INCREASES after epoch 1, stop training (overfitting)
  - Checkpoints auto-save to Google Drive (existing script behavior)

  **Step 4: Post-Training Smoke Test (MANDATORY — before GGUF export)**
  - Use `FastVisionModel.for_inference(model)` to switch to inference mode
  - Send 3 grading prompts through the merged model on Colab:
    1. One text-only grading prompt → verify valid JSON with `score` field (0-10)
    2. One vision grading prompt (image + rubric) → verify valid JSON with `transcription` + `score`
    3. One text-only prompt with a different rubric topic → verify JSON output
  - All 3 must produce parseable JSON with `score` field. If ANY fails, do NOT proceed to GGUF export.

  **Step 5: Merge Adapter**
  - Merge LoRA adapter into base model: `model.save_pretrained_merged("/content/merged/", tokenizer)`
  - Verify merged model files exist on Colab

  **Must NOT do**:
  - Do not train for more than 2 epochs
  - Do not enable thinking mode during training
  - Do not use QLoRA 4-bit (unless T4/L4 fallback — document if so)
  - Do not use full fine-tuning (LoRA only)
  - Do not strip image data from vision entries — the model must learn to process handwriting images
  - Do not proceed to GGUF export if smoke test fails
  - Do not use `colab_files.download()` for any large files — use Drive

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: ML training on Colab requiring careful monitoring, script updates, and multi-step verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — depends on Tasks 7 and 8
  - **Blocks**: Task 10a
  - **Blocked By**: Tasks 7, 8

  **References**:
  - `test-data/colab_train_qwen35_grader.py` — existing Colab training script (440 lines). KEY SECTIONS:
    - Lines 85-86: `load_in_16bit=True` (bf16 LoRA config)
    - Lines 260-275: SFTConfig (needs `num_train_epochs=2`, `eval_dataset`, `save_total_limit=3`)
    - Line 296: `train_on_responses_only` disabled for vision (accepted trade-off)
    - Cell 5: GGUF export (needs Drive copy addition)
  - Unsloth Qwen3 fine-tuning docs: `https://unsloth.ai/docs/models/qwen3-how-to-run-and-fine-tune`
  - Unsloth multimodal fine-tuning: Check Unsloth docs for Qwen3.5 vision fine-tuning format
  - `test-data/FINE-TUNING-PLAN.md:64-68` — hyperparameter recommendations
  - `test-data/finetune-grading.jsonl` — 283 text grading training entries
  - `test-data/finetune-grading-vision.jsonl` — 198 vision grading entries. Format: `{messages: [{role:"system",...}, {role:"user", content:[{type:"image"},{type:"text",text:"...rubric..."}]}, {role:"assistant", content:"{\"transcription\":\"...\",\"score\":N}"}], images:["data:image/png;base64,..."], _meta:{id,quality,score}}`
  - `test-data/finetune-grading-val.jsonl` — validation data (46 entries)
  - `test-data/gen-handwriting-images.py` — script that generates vision training data (reference for data format)

  **Acceptance Criteria**:
  - [ ] Colab runtime confirmed as A100 (or T4/L4 with documented 4-bit fallback)
  - [ ] Google Drive mounted in first cell
  - [ ] Training script updated: `num_train_epochs=2`, `eval_dataset` configured, `save_total_limit=3`
  - [ ] Training completes without OOM (all cells run to completion)
  - [ ] Both text and vision examples processed (log shows 481 total training examples)
  - [ ] Validation loss tracked per epoch; epoch 2 val loss ≤ epoch 1 val loss
  - [ ] Post-training smoke test: 3 grading prompts → 3 valid JSON outputs on Colab
  - [ ] At least 1 vision prompt produces valid JSON with `transcription` and `score` fields
  - [ ] Merged model files exist at `/content/merged/` on Colab
  - [ ] Google Drive checkpoint exists and is loadable

  **QA Scenarios**:
  ```
  Scenario: GPU verification and training completion
    Tool: Bash (on Colab)
    Preconditions: Colab notebook with GPU runtime selected
    Steps:
      1. Run `python -c "import torch; print(torch.cuda.get_device_name(0))"` — verify A100
      2. Run `python -c "import torch; print(torch.cuda.get_device_properties(0).total_mem // 1024**3, 'GB')"` — verify 40+ GB
      3. Upload both JSONL files to Colab runtime
      4. Run training with updated script (2 epochs, eval_dataset enabled)
      5. Capture training log: loss per step, eval loss per epoch
    Expected Result: A100 confirmed (40-80GB), training completes in ~30-60 min, loss decreases monotonically
    Failure Indicators: T4/L4 assigned (fallback to 4-bit), OOM, loss NaN, eval loss increases
    Evidence: .sisyphus/evidence/task-9-training-log.txt

  Scenario: Overfitting detection via validation loss
    Tool: Bash (on Colab)
    Steps:
      1. Extract eval_loss at epoch 1 and epoch 2 from training output
      2. If epoch 2 eval_loss > epoch 1 eval_loss: flag overfitting, recommend using epoch 1 checkpoint
    Expected Result: Epoch 2 eval_loss ≤ epoch 1 eval_loss
    Evidence: .sisyphus/evidence/task-9-loss-curve.txt

  Scenario: Post-training multimodal smoke test on Colab (MANDATORY)
    Tool: Bash (on Colab)
    Preconditions: Training completed, model still in memory
    Steps:
      1. `FastVisionModel.for_inference(model)` — switch to inference mode
      2. Send text-only grading prompt: "Grade this student response: [simple test response]" → parse output as JSON
      3. Verify output has `score` field with value 0-10
      4. Send vision grading prompt with 1 base64 image from training data → parse output as JSON
      5. Verify output has `transcription` and `score` fields
      6. Send text-only prompt with different rubric topic → verify JSON output
    Expected Result: All 3 produce valid JSON. text → {score: N}, vision → {transcription: "...", score: N}
    Failure Indicators: JSON parse error, missing fields, score outside 0-10, vision input crashes model
    Evidence: .sisyphus/evidence/task-9-colab-smoketest.txt
  ```

  **Commit**: NO (model weights on Colab, not local)

- [ ] 10a. Export GGUF + Verify on Colab + Copy to Google Drive

  **What to do**:

  **Step 1: GGUF Export**
  - Export merged model to GGUF Q4_K_M using Unsloth on Colab:
    `model.save_pretrained_gguf("/content/gguf/", tokenizer, quantization_method="q4_k_m")`
  - This takes 15-30 minutes on A100. Do NOT disconnect Colab during export.
  - Expected output: `/content/gguf/unsloth.Q4_K_M.gguf` (~5-6 GB)

  **Step 2: GGUF Smoke Test on Colab (MANDATORY — before downloading)**
  - Test the GGUF directly on Colab to catch quantization-induced issues:
    - If llama.cpp is available: `./llama-cli --model /content/gguf/unsloth.Q4_K_M.gguf --prompt "<grading prompt>" --n-predict 500`
    - Alternatively: reload the GGUF via Unsloth and run inference
  - Send a grading prompt and verify the GGUF produces valid JSON with `score` field
  - This catches quantization issues (bf16 → Q4) BEFORE the expensive download

  **Step 3: Copy to Google Drive + Checksum**
  - Copy GGUF to Drive: `shutil.copy("/content/gguf/unsloth.Q4_K_M.gguf", "/content/drive/MyDrive/models/qwen3.5-9B-stat-grader-Q4_K_M.gguf")`
  - Generate md5sum: `md5sum /content/drive/MyDrive/models/qwen3.5-9B-stat-grader-Q4_K_M.gguf > /content/drive/MyDrive/models/qwen3.5-9B-stat-grader-Q4_K_M.md5`
  - Save checksum to evidence: `.sisyphus/evidence/task-10-gguf-checksum.txt`
  - **This is the persistence step** — if Colab disconnects after this, the GGUF survives on Drive

  **Must NOT do**:
  - Do not use `colab_files.download()` as primary transfer — Drive is primary, browser is fallback
  - Do not proceed to download without GGUF smoke test passing
  - Do not skip checksum generation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: GGUF conversion + verification pipeline on Colab

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 9
  - **Blocks**: Task 10b
  - **Blocked By**: Task 9

  **References**:
  - `test-data/colab_train_qwen35_grader.py` Cell 5 — existing GGUF export code (needs Drive copy addition)
  - Unsloth GGUF export: `model.save_pretrained_gguf()` method
  - llama.cpp CLI for GGUF testing: `./llama-cli --model <path> --prompt "<text>" --n-predict 500`

  **Acceptance Criteria**:
  - [ ] GGUF file exists at `/content/gguf/unsloth.Q4_K_M.gguf` (~5-6 GB)
  - [ ] GGUF smoke test: grading prompt → valid JSON with `score` field (0-10)
  - [ ] GGUF copied to Google Drive at `/content/drive/MyDrive/models/qwen3.5-9B-stat-grader-Q4_K_M.gguf`
  - [ ] md5sum checksum saved to Drive alongside GGUF
  - [ ] Checksum recorded in `.sisyphus/evidence/task-10-gguf-checksum.txt`

  **QA Scenarios**:
  ```
  Scenario: GGUF export and quantization verification
    Tool: Bash (on Colab)
    Steps:
      1. Run `model.save_pretrained_gguf("/content/gguf/", tokenizer, quantization_method="q4_k_m")`
      2. `ls -lh /content/gguf/*.gguf` — verify file exists and size is 4.5-6.5 GB
      3. Send grading prompt through GGUF: verify JSON output with `score` 0-10
    Expected Result: GGUF ~5.5GB, produces valid grading JSON after quantization
    Failure Indicators: Export fails, GGUF <1GB (truncated), JSON malformed after quantization
    Evidence: .sisyphus/evidence/task-10a-gguf-export.txt

  Scenario: Drive copy and checksum
    Tool: Bash (on Colab)
    Steps:
      1. `shutil.copy(gguf_path, "/content/drive/MyDrive/models/qwen3.5-9B-stat-grader-Q4_K_M.gguf")`
      2. `md5sum /content/drive/MyDrive/models/qwen3.5-9B-stat-grader-Q4_K_M.gguf`
      3. Verify Drive file size matches original
    Expected Result: File on Drive, md5sum recorded, sizes match
    Failure Indicators: Drive out of space, copy fails, sizes differ
    Evidence: .sisyphus/evidence/task-10a-drive-copy.txt
  ```

  **Commit**: NO (Colab-side only)

- [ ] 10b. Download GGUF + Register in Ollama Locally

  **What to do**:

  **Step 1: Download from Google Drive**
  - Download GGUF from Drive to local machine (user handles this manually from Drive UI or via `gdown`/`rclone`)
  - Place GGUF file in `fine-tuned-model/` directory (relative to project root)
  - **Verify integrity**: `md5sum fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf` must match checksum from `.sisyphus/evidence/task-10-gguf-checksum.txt`

  **Step 2: Create Modelfile**
  - Create Modelfile using RELATIVE path (portable across machines):
    ```
    FROM ./qwen3.5-9B-stat-grader-Q4_K_M.gguf
    PARAMETER temperature 0.2
    PARAMETER stop "<|im_start|>"
    PARAMETER stop "<|im_end|>"
    TEMPLATE "..."  # Match Qwen3.5 chat template from base model
    ```
  - Follow existing Modelfile convention: see `fine-tuned-model/Modelfile-qwen3.5-math-grader` for format

  **Step 3: Register in Ollama**
  - Register: `ollama create qwen3.5-9B-stat-grader -f Modelfile` (run from `fine-tuned-model/` directory)
  - Verify: `ollama list | grep qwen3.5-9B-stat-grader`
  - Test: `ollama run qwen3.5-9B-stat-grader "Say hello"` — must return coherent response
  - Test JSON: Send a grading prompt via curl, verify JSON output with `score` and `feedback` fields

  **Must NOT do**:
  - Do not add `format: "json"` to the Modelfile — must work with prompt-only JSON
  - Do not enable thinking mode in the Modelfile
  - Do not modify any grading server code
  - Do not use Windows absolute paths in Modelfile — relative paths only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Local Ollama registration + verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 10a
  - **Blocks**: Tasks 11, 11b, 12
  - **Blocked By**: Task 10a

  **References**:
  - `fine-tuned-model/Modelfile-qwen3.5-math-grader` — existing Modelfile format (relative path, stop tokens)
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` — may already exist from previous training run
  - Ollama Modelfile docs: `https://github.com/ollama/ollama/blob/main/docs/modelfile.md`
  - Qwen3.5 chat template from Ollama: `ollama show qwen3.5:9b --template`
  - `grading-server/providers.js:26-72` — how Ollama provider sends requests (temperature 0.2)
  - `.sisyphus/evidence/task-10-gguf-checksum.txt` — md5sum from Colab export

  **Acceptance Criteria**:
  - [ ] GGUF file exists in `fine-tuned-model/` directory
  - [ ] Local md5sum matches Colab-side checksum EXACTLY
  - [ ] Modelfile uses relative path (`FROM ./qwen3.5-9B-stat-grader-Q4_K_M.gguf`)
  - [ ] `ollama list` shows `qwen3.5-9B-stat-grader`
  - [ ] `ollama run qwen3.5-9B-stat-grader "Hello"` returns coherent response
  - [ ] Grading prompt produces valid JSON with `score` and `feedback` fields

  **QA Scenarios**:
  ```
  Scenario: GGUF integrity verification
    Tool: Bash
    Preconditions: GGUF downloaded from Google Drive
    Steps:
      1. `md5sum fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf` — capture hash
      2. `cat .sisyphus/evidence/task-10-gguf-checksum.txt` — get Colab hash
      3. Compare: hashes must be identical
    Expected Result: md5sums match exactly
    Failure Indicators: Hash mismatch (corrupted download), file not found
    Evidence: .sisyphus/evidence/task-10b-checksum-verify.txt

  Scenario: Model registered and responsive in Ollama
    Tool: Bash
    Preconditions: GGUF verified, Ollama running
    Steps:
      1. `ollama create qwen3.5-9B-stat-grader -f Modelfile` (from fine-tuned-model/ directory)
      2. `ollama list | grep qwen3.5-9B-stat-grader` — verify registration
      3. `ollama run qwen3.5-9B-stat-grader "Return only: {\"test\": true}"` — verify JSON capability
    Expected Result: Model registered, produces JSON output
    Failure Indicators: ollama create fails, model not in list, garbled output
    Evidence: .sisyphus/evidence/task-10b-ollama-registration.txt

  Scenario: Grading prompt smoke test via Ollama
    Tool: Bash
    Steps:
      1. Send a minimal grading request via curl: `curl -s http://localhost:11434/api/chat -d '{"model":"qwen3.5-9B-stat-grader","messages":[{"role":"user","content":"Grade this: Student wrote a basic answer about standard deviation. Score 0-10. Return JSON with score and feedback."}]}'`
      2. Parse response, verify JSON with `score` (0-10) and `feedback` (non-empty string)
    Expected Result: Valid JSON with reasonable score and feedback
    Evidence: .sisyphus/evidence/task-10b-grading-smoketest.txt
  ```

  **Commit**: YES
  - Message: `feat(model): register fine-tuned qwen3.5-9B-stat-grader in Ollama`
  - Files: `fine-tuned-model/Modelfile` (Modelfile only, not the GGUF — too large for git)

- [ ] 11. Post-Fine-Tune Grading Benchmark — Text (Stats Dataset, Local)

  **What to do**:
  - Add `qwen3.5-9B-stat-grader` to the benchmark runner CONFIG in `test-data/run-benchmark.js` (if not already present from previous training run — update label/model tag if needed)
  - Start grading server locally
  - Run benchmark: `bun run test-data/run-benchmark.js --only=qwen3.5-9B-stat-grader --dataset=stats --output=test-data/benchmark-qwen3-ft-stats.json`
  - Run 3 iterations for variance measurement
  - Extract pairwise agreement with GLM-5 and Sonnet 4.6
  - **TARGET**: ≥90% agreement with GLM-5
  - Compare to zero-shot baseline (from Task 3) AND previous fine-tuning run (92% with Sonnet): quantify improvement
  - Record JSON parse failure rate — **TARGET**: 0%
  - If agreement <90%: document which students/criteria cause disagreements. Recommend additional training data for those areas.

  **Must NOT do**:
  - Do not re-run the benchmark with different prompts
  - Do not modify grading server code
  - Do not count this as a "pass" if JSON parse failures >5%

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Benchmark analysis requiring interpretation of disagreement patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11b and 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10b

  **References**:
  - `test-data/run-benchmark.js:31-55` — CONFIG array. Model may already have entry from previous run; update if needed.
  - `test-data/benchmark-qwen35-zeroshot.json` — zero-shot baseline for comparison
  - `test-data/fine-tuning-decision.md:109-116` — decision matrix format
  - `test-data/FINE-TUNING-PLAN.md:12` — previous fine-tuning result: 92% agreement with Sonnet

  **Acceptance Criteria**:
  - [ ] `test-data/benchmark-qwen3-ft-stats.json` exists with valid JSON
  - [ ] Pairwise agreement with GLM-5 ≥90%
  - [ ] JSON parse failure rate = 0%
  - [ ] Improvement over zero-shot baseline documented
  - [ ] Comparison to previous fine-tuning run (92%) documented

  **QA Scenarios**:
  ```
  Scenario: Fine-tuned model meets grading target on training rubric
    Tool: Bash
    Preconditions: qwen3.5-9B-stat-grader registered in Ollama (Task 10b), grading server running
    Steps:
      1. Run benchmark with --only=qwen3.5-9B-stat-grader --dataset=stats
      2. Parse output JSON, extract GLM-5 agreement percentage
      3. Compare to zero-shot baseline AND previous 92% result
    Expected Result: ≥90% agreement with GLM-5, improvement over zero-shot baseline
    Failure Indicators: <90% agreement, parse failures, regression from previous run
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

- [ ] 11b. Post-Fine-Tune Vision Grading Benchmark (Handwriting Images, Local)

  **What to do**:
  - Use `test-data/image-benchmark-cases.json` (198 cases) to benchmark the fine-tuned model's ability to grade from handwritten student work images
  - For each benchmark case:
    1. Load the corresponding PNG from `test-data/handwriting-images/`
    2. Send to `qwen3.5-9B-stat-grader` via Ollama API with multimodal message format (image + rubric prompt)
    3. Parse JSON response: extract `transcription` and `score`
    4. Compare extracted `score` against `groundTruthScore` from benchmark case
  - Run across all 3 handwriting quality levels (good, medium, bad) to verify:
    - **good**: Model transcribes accurately and grades correctly (baseline)
    - **medium**: Model handles minor handwriting degradation
    - **bad**: Model attempts transcription on messy handwriting (lower accuracy expected)
  - Calculate per-quality agreement rates and overall agreement
  - **TARGET**: ≥80% score agreement (within ±1) on "good" quality images. Lower targets for medium/bad.
  - Record transcription quality: spot-check 6 transcriptions against known ground truth text
  - Record JSON parse failure rate — **TARGET**: ≤5%
  - Note: The Colab smoke test (Task 9) provides early signal on vision capability. This task is the full local benchmark.

  **Must NOT do**:
  - Do not modify benchmark cases or ground truth scores
  - Do not re-run benchmarks with different prompts
  - Do not expect perfect accuracy on "bad" quality images (intentionally degraded)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Vision benchmarking requiring multimodal API calls + transcription quality analysis

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11 and 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10b

  **References**:
  - `test-data/image-benchmark-cases.json` — 198 benchmark cases with `groundTruthScore`, `handwritingQuality`, `exactTranscription`, `rubricPrompt`
  - `test-data/handwriting-images/` — 198 PNG files (66 responses × 3 quality levels)
  - `test-data/gen-handwriting-images.py` — script that generated the benchmark data (documents quality levels and transcription fidelity)
  - Ollama multimodal API: `curl http://localhost:11434/api/chat -d '{"model":"qwen3.5-9B-stat-grader","messages":[{"role":"user","content":"...","images":["base64..."]}]}'`

  **Acceptance Criteria**:
  - [ ] `test-data/benchmark-qwen3-ft-vision.json` exists with valid JSON
  - [ ] 198 cases evaluated across 3 quality levels
  - [ ] Score agreement ≥80% (within ±1) on "good" quality images
  - [ ] JSON parse failure rate ≤5%
  - [ ] Transcription quality spot-check: 6 transcriptions reviewed
  - [ ] Per-quality breakdown documented: good/medium/bad agreement rates

  **QA Scenarios**:
  ```
  Scenario: Vision grading produces valid output
    Tool: Bash
    Preconditions: qwen3.5-9B-stat-grader registered in Ollama (Task 10b)
    Steps:
      1. Select 3 benchmark cases (1 good, 1 medium, 1 bad quality)
      2. Load each PNG, base64-encode, send to Ollama multimodal API
      3. Parse JSON response, extract transcription and score
      4. Compare score against groundTruthScore
    Expected Result: All 3 produce valid JSON with transcription and score fields
    Failure Indicators: Empty response, no transcription, parse failure, model refuses image input
    Evidence: .sisyphus/evidence/task-11b-vision-smoketest.txt

  Scenario: Full vision benchmark with per-quality analysis
    Tool: Bash
    Steps:
      1. Run all 198 benchmark cases through the model
      2. Group results by handwritingQuality (good/medium/bad)
      3. Calculate score agreement rate per group (within ±1 of groundTruthScore)
      4. Calculate overall agreement and parse failure rate
    Expected Result: good ≥80%, medium ≥60%, bad ≥40% agreement, ≤5% parse failures
    Evidence: .sisyphus/evidence/task-11b-vision-benchmark.md

  Scenario: Transcription quality spot-check
    Tool: Bash
    Steps:
      1. Select 6 cases (2 per quality level)
      2. Compare model transcription against exactTranscription from benchmark
      3. Rate each: exact match / minor errors / major errors
    Expected Result: good quality = exact or minor errors, medium = minor, bad = acceptable degradation
    Evidence: .sisyphus/evidence/task-11b-transcription-quality.md
  ```

  **Commit**: YES (group with Task 11)
  - Message: `data(benchmark): post-fine-tune vision grading benchmark results`
  - Files: `test-data/benchmark-qwen3-ft-vision.json`

- [ ] 12. Grading Generalization Check on Held-Out Rubric (Biology, Local)

  **What to do**:
  - Run benchmark: `bun run test-data/run-benchmark.js --only=qwen3.5-9B-stat-grader --dataset=biology --output=test-data/benchmark-qwen3-ft-biology.json`
  - Run 3 iterations for variance measurement
  - Extract pairwise agreement with GLM-5 and Sonnet 4.6
  - **TARGET**: ≥85% agreement with GLM-5 (lower than stats because model never saw this rubric)
  - This proves the model learned GENERALIZABLE grading ability, not just chi-square memorization
  - Record JSON parse failure rate — **TARGET**: 0%
  - If <85%: the model may have overfit to training rubrics. Document which criteria cause disagreements and recommend additional training data for those rubric areas. Since this is the plan's final quality gate (no MOM phase to fall back on), addressing grading quality is the only path forward.

  **Must NOT do**:
  - Do not have biology data in the training set (verify by grepping finetune-grading.jsonl)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Held-out evaluation requiring careful interpretation — this is the plan's final quality gate

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11 and 11b)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10b

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
    Preconditions: qwen3.5-9B-stat-grader registered in Ollama (Task 10b), grading server running
    Steps:
      1. `grep -i biology test-data/finetune-grading.jsonl | wc -l` — verify 0 matches
      2. Run benchmark with --only=qwen3.5-9B-stat-grader --dataset=biology
      3. Parse output, extract GLM-5 agreement
    Expected Result: 0 biology matches in training data, ≥85% agreement on biology benchmark
    Failure Indicators: Biology in training data, <85% agreement, parse failures
    Evidence: .sisyphus/evidence/task-12-biology-benchmark.md
  ```

  **Commit**: YES (group with Task 11)
  - Message: `data(benchmark): post-fine-tune held-out biology benchmark`
  - Files: `test-data/benchmark-qwen3-ft-biology.json`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan. Verify GGUF checksum matches between Colab and local.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Benchmark Integrity Review** — `unspecified-high`
  Verify all benchmark JSON files are valid (`benchmark-qwen3-ft-stats.json`, `benchmark-qwen3-ft-vision.json`, `benchmark-qwen3-ft-biology.json`). Cross-check agreement percentages manually by reading raw scores. Confirm held-out rubric was never in training data. Check GGUF model is loadable via `ollama run qwen3.5-9B-stat-grader "Hello"`. Verify GGUF checksum matches Colab-side checksum (`.sisyphus/evidence/task-10-gguf-checksum.txt`). Verify Modelfile uses relative path, not Windows absolute path.
  Output: `Benchmarks [N/N valid] | Agreement [verified/discrepancy] | Held-out [CLEAN/CONTAMINATED] | GGUF [VALID/CORRUPT] | VERDICT`

- [ ] F3. **End-to-End Grading Server QA** — `unspecified-high`
  Start grading server. Send a real grading request using the fine-tuned model (`qwen3.5-9B-stat-grader`) via `curl`. Verify response parses correctly, scores are within range, feedback is coherent. Test with 5+ students (text). Also test 1 vision grading request (image + rubric). Verify both text and vision produce valid JSON.
  Output: `Server [UP/DOWN] | Text Parse [PASS/FAIL] | Vision Parse [PASS/FAIL] | Scores [IN RANGE/OUT] | Feedback [COHERENT/BROKEN] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify no production code was modified (`grading.js`, `providers.js`, `server.js`). Confirm no thinking mode artifacts in outputs. Confirm no Ollama `format: "json"` usage. Check no prompt re-optimization occurred. Verify no MOM-related code, data, or references remain in active plan tasks. Verify no RTX 4070 / local GPU references remain in Tasks 9-12. Verify no Windows paths in Modelfiles.
  Output: `Production Code [CLEAN/MODIFIED] | Thinking Mode [ABSENT/PRESENT] | MOM Refs [ABSENT/PRESENT] | Scope [COMPLIANT/CREEP] | VERDICT`

---

## Commit Strategy

- **After Wave 1** ✅: `feat(benchmark): add zero-shot Qwen3 benchmark results` — benchmark JSON files
- **After Wave 2** ✅: `feat(training): create multi-rubric grading training dataset` — JSONL files
- **After Task 10b**: `feat(model): register fine-tuned qwen3.5-9B-stat-grader in Ollama` — Modelfile
- **After Tasks 11+11b+12**: `data(benchmark): post-fine-tune grading benchmark results` — all benchmark JSON files
- **After Final Wave**: `chore: final QA verification for qwen3.5-9B-stat-grader grading model`

---

## Success Criteria

### Verification Commands
```bash
# Model is registered and responds
ollama run qwen3.5-9B-stat-grader "Hello" # Expected: coherent text response

# Text grading benchmark on training rubric (stats)
bun run test-data/run-benchmark.js --only=qwen3.5-9B-stat-grader --dataset=stats
# Expected: ≥90% agreement with GLM-5

# Vision grading benchmark (handwriting images)
# Run Task 11b benchmark script against image-benchmark-cases.json
# Expected: ≥80% score agreement (±1) on good-quality handwriting images

# Grading benchmark on held-out rubric (biology)
bun run test-data/run-benchmark.js --only=qwen3.5-9B-stat-grader --dataset=biology
# Expected: ≥85% agreement with GLM-5

# JSON parse rate
# Expected: 0% parse failures on text, ≤5% on vision

# GGUF integrity
md5sum fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf
# Expected: matches .sisyphus/evidence/task-10-gguf-checksum.txt
```

### Final Checklist
- [x] Both Qwen3.5-9B and Qwen3-14B benchmarked zero-shot
- [x] Training data: 283 text + 198 vision = 481 examples across 22 topics
- [ ] Fine-tuned model registered as `qwen3.5-9B-stat-grader` in Ollama
- [ ] GGUF checksum verified (Colab export matches local download)
- [ ] ≥90% GLM-5 agreement on text stats grading
- [ ] ≥80% score agreement on vision grading (good-quality handwriting)
- [ ] ≥85% GLM-5 agreement on held-out biology
- [ ] 0% JSON parse failures (text), ≤5% (vision)
- [ ] No production code modified
- [ ] No thinking mode in outputs
- [ ] No MOM-related code or references in active tasks
- [ ] No Windows paths in Modelfiles
