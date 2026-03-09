# Learnings — qwen3-fine-tuning

## Project Context
- Working directory: C:\Users\shuff\Documents\GitHub\O.G.R.E-OllamaGradingRubricEvaluator
- Branch: feat/qwen3-fine-tuning
- Worktree: main repo (branch feat/qwen3-fine-tuning checked out in main worktree)
- Session started: 2026-03-05T16:58:35.257Z

## Key Files
- Benchmark runner: `test-data/run-benchmark.js`
- Existing training data: `test-data/finetune-gptoss-qwen.jsonl` (25 examples)
- Reference benchmark: `test-data/benchmark-cor-v2.json`
- Held-out test rubrics: `test-data/test-biology-rubric.json`, `test-data/test-history-rubric.json`
- Grading prompt source: `grading-server/grading.js` (CoR v2, lines 97-247)
- Grading constants: `grading-server/grading-constants.js`

## Architecture Notes
- Grading server uses prompt-only JSON (no Ollama format:"json" param)
- Temperature 0.2 for all grading providers
- Production models: GLM-5 + Sonnet 4.6 at 96% agreement
- Target local model: qwen3-ogre:latest (fine-tuned from Qwen3.5-9B or Qwen3-14B)

## Guardrails (CRITICAL)
- NO thinking mode tokens during training or benchmarking
- NO modification to grading.js, providers.js, server.js
- NO biology data in training JSONL
- NO format:"json" in Ollama Modelfile

## Task 1 Findings (2026-03-05)
- Both qwen3.5:9b (6.6 GB) and qwen3:14b (9.3 GB) confirmed pulled and responding
- Both models include `thinking` field in responses — this is normal, content field has the actual answer
- CONFIG entries added at lines 41-42 in run-benchmark.js (before anthropic entries)
- Label filter: `m.label.toLowerCase().includes(l)` — "Qwen35-9B" → "qwen35-9b" matches "qwen35" ✓
- Qwen3 models have thinking mode enabled by default; for benchmarking, the grading server will need to handle or suppress thinking tokens


## Task 2: Data Audit Findings (2026-03-05)

### Training Data State
- `finetune-gptoss-qwen.jsonl`: 25 examples, 1 rubric (chi-square statistics), scores from GPT-OSS 120B
- Score distribution: 2–9 range, missing 0–1 and 10, sparse at 5–6
- Assistant messages: bare `{"score": N}` only — no criterion_scores or feedback

### Dataset Inventory
| Dataset | Students | Rubric | Scores | Use |
|---------|----------|--------|--------|-----|
| Statistics (chi-square) | 25 | ✅ | GPT-OSS only | Training (existing) |
| History (Civil War) | 18 | ✅ | NONE | Training (needs consensus) |
| Biology (photosynthesis) | 18 | ✅ | NONE | HELD OUT — validation only |

### Gaps for Task 6
1. Need 25+ more examples (currently 25, need 50+)
2. Need 2+ more rubrics (currently 1, need 3+)
3. Need low scores (0–2) and perfect scores (10) — currently missing
4. History dataset needs GLM-5 + Sonnet 4.6 consensus scoring before use
5. Need a 3rd rubric beyond history (captured-rubric.json or new synthetic)

### Benchmark-cor-v2 Structure
- Models: GLM-5, GPT-OSS 120B, Sonnet 4.6 (3 runs each)
- Consensus = average of GLM-5 + Sonnet 4.6 (production standard)
- 25 students, scores stored in `stats.perStudent[i].models`

## Task 4 — MOM Community Library Inventory (2026-03-05)

### Library Scale
- 16 subjects, ~290+ topic nodes total
- Statistics: 45 nodes (lib436), Algebra: 60+ nodes (lib60), Calculus: 40+ nodes (lib224)
- Full inventory at `.sisyphus/evidence/task-4-mom-inventory.md`

### Question Types Available
- number, function (numfunc), calculated, choices, multans, matching, ntuple, matrix, calcmatrix, interval, essay, file, multipart
- Essay/FRQ is the most complex type — requires `$rubricbutton`, `$rubricanswerbutton`, `$css_block`, `$anstypes=array("essay")`, `$displayformat[0]="editornopaste"`

### loadlibrary() Usage
- `stats` — most common; needed for normalcdf, tcdf, binomialpdf, linreg, chi2teststat, etc.
- `matrix` — required for ALL matrix questions; use construct-from-solution pattern
- `polys` — polynomial display/operations
- `finance` / `finance2` — TVM calculations
- `normalcurve` — shaded normal curve graphs (often paired with stats)
- `calculus` — numerical integration/differentiation
- Multiple libs can be combined: `loadlibrary("stats,matrix")`

### linreg() Return Order (CRITICAL GOTCHA)
- `linreg($x, $y)` returns `[r, slope, intercept]` — indices 0, 1, 2
- NOT `[slope, intercept, r]` as one might expect
- r² = `$reg[0]*$reg[0]`

### Recommended 60 Questions for Task 13
- Group A: Statistics (15) — A1–A15
- Group B: Algebra (12) — B1–B12
- Group C: Calculus (10) — C1–C10
- Group D: Linear Algebra/Matrix (6) — D1–D6
- Group E: Trig (5) — E1–E5
- Group F: Discrete Math/Finance (6) — F1–F6
- Group G: Geometry/Arithmetic/Other (6) — G1–G6
- Type breakdown: 37% number, 30% multipart, 12% function, 8% matrix, 5% essay, 5% choices, 2% interval
- Generation order: G → B → A → D → C → E/F → FRQ (simple to complex)

### Key Randomization Patterns
- `$contexts = array(...); $i = rand(0, n-1); $topic = $contexts[$i]` — context rotation
- Parallel arrays indexed by `$i` for context-specific values
- `diffrands(min, max, n)` for distinct data points (regression, matrix)
- `where ($condition)` for retry until non-degenerate case
- `nonzerorand()` to avoid trivial coefficient=0 cases
