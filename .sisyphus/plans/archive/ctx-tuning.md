> **OBSOLETE** — The `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` target no longer exists.
> Batch grading now uses cloud and larger local models via the provider system.
> The hardware-specific Vulkan/iGPU tuning is no longer relevant. Archived March 2026.

# ctx Tuning: Optimize num_ctx for 9-15 Student Batches at 20-30 tok/s

## TL;DR

> **Quick Summary**: Find the optimal `num_ctx` value for the Qwen3.5-9B stat-grader Modelfile so batch grading fits 9-15 students while generating 20-30 tokens/sec on the Ryzen 9 AI HX370's Radeon 890M iGPU via Vulkan.
>
> **Deliverables**:
> - Verified Vulkan GPU offload working (pre-flight)
> - Benchmark data: tok/s at each ctx value × batch size
> - Updated `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` with optimal `num_ctx`
>
> **Estimated Effort**: Short (1-2 hours of benchmarking + analysis)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (GPU verify) → Task 2 (benchmark script) → Task 3 (run sweep) → Task 4 (analyze + update)

---

## Context

### Original Request
Tweak the `num_ctx` in `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` until the model can handle 9-15 students at once while generating closer to 20-30 tokens/sec. Also ensure the model loads into VRAM and uses Vulkan on the GPU.

### Interview Summary
**Key Discussions**:
- Current speed: 10-20 tok/s at `num_ctx 8192` — below the 20-30 target
- Scope: Modelfile changes only — no server-side `chunkSize` or provider code changes
- Students naturally stay under the 30-chunk threshold, so server chunking doesn't need adjustment
- User wants GPU verification as part of the plan (not sure if Vulkan is engaged)

**Research Findings**:
- **Token estimates** (revised by Metis): 15 students ≈ **~7,300 tokens** total (not 6K as initially estimated). 9 students ≈ ~4,840 tokens. This means 8192 ctx is barely sufficient for 15 students.
- **Vulkan is NOT auto-detected** — requires explicit `OLLAMA_VULKAN=1` environment variable
- **Known HX370 bug** ([GitHub #11451](https://github.com/ollama/ollama/issues/11451)): BIOS "UMA Auto" VRAM mode breaks GPU detection. Must be set to a fixed size.
- **Known RDNA 3.5 bug** ([GitHub #14562](https://github.com/ollama/ollama/issues/14562)): Vulkan runner may find zero devices on some RDNA 3.5 iGPUs
- **Community benchmark** (NixOS Discourse, HX370): Vulkan gives ~14 tok/s on 8B Q4 at default ctx. This is a hardware ceiling reference point.
- **Qwen3.5-9B hybrid architecture**: Only 8/32 layers use traditional KV cache (DeltaNet). Speed improvement from reducing ctx may be flatter than expected (~10-20% gain, not 40-50%).
- **`OLLAMA_FLASH_ATTENTION=1`** may be a bigger lever than ctx reduction on shared-memory APUs
- **Ollama per-request override**: `num_ctx` can be overridden per-request via `options.num_ctx` — no Modelfile rebuild needed during benchmarking
- **Server discards timing data**: `grading-server/providers.js` parses only `message.content` from Ollama responses, discarding `eval_count`/`eval_duration`. Benchmarks must call Ollama directly.

### Metis Review
**Identified Gaps** (addressed):
- Token estimate was ~1,300 tokens too low → corrected to ~7,300 for 15 students
- No quality verification after ctx reduction → added grading quality comparison task
- No truncation detection → added `prompt_eval_count` verification
- No warm-up protocol → added discard-first-run + 3-measurement minimum
- Vulkan not guaranteed to be active → added GPU pre-flight as Task 1
- `num_predict` not set → addressed in Modelfile update

---

## Work Objectives

### Core Objective
Verify GPU/Vulkan is active, then find the `num_ctx` sweet spot where 9-15 student batch prompts fit without truncation while generating ≥20 tok/s.

### Concrete Deliverables
- `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` — updated `num_ctx` (and optionally `num_gpu 99`)
- `test-data/benchmark-ctx.js` — reusable benchmark script for future tuning
- `test-data/ctx-benchmark-results.json` — raw benchmark data for reference

### Definition of Done
- [ ] GPU confirmed via Vulkan with all layers offloaded (`offloaded N/N layers to GPU` in logs)
- [ ] Chosen `num_ctx` passes: 15-student batch completes without truncation AND tok/s ≥ 20
- [ ] Grading quality preserved: test students scored within ±1 point of 8192-ctx baseline

### Must Have
- Vulkan GPU verification before any benchmarking
- Benchmark calls Ollama `/api/chat` directly (not through grading server)
- Test at both 9-student and 15-student batch sizes
- Truncation detection via `prompt_eval_count` comparison
- JSON output integrity check at each ctx value
- Warm-up run discarded after each ctx change
- At least 3 measurement runs per configuration

### Must NOT Have (Guardrails)
- Do NOT modify any grading server code (`grading-server/*.js`)
- Do NOT change sampling parameters (temperature 0.2, top_p 0.95, top_k 20, presence_penalty 1.5) during benchmarking
- Do NOT modify the existing `test-data/run-benchmark.js` (it measures consistency, not speed)
- Do NOT test ctx values above 8192 (goal is faster, not more context)
- Do NOT change model quantization or model name
- Do NOT build a dashboard or over-engineer the benchmark script

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test in grading-server)
- **Automated tests**: NO — this is empirical benchmarking, not code development
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **GPU verification**: Use Bash — check Ollama server logs, `ollama ps`, layer offload count
- **Benchmarking**: Use Bash (curl) — call Ollama `/api/chat` directly, parse timing metrics with jq
- **Quality check**: Use Bash — parse JSON output, verify student count, compare scores

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — pre-flight + preparation):
├── Task 1: GPU/Vulkan pre-flight verification [quick]
└── Task 2: Build ctx benchmark script [unspecified-high]

Wave 2 (After Wave 1 — benchmarking):
└── Task 3: Run ctx sweep benchmarks (depends: 1, 2) [deep]

Wave 3 (After Wave 2 — analysis + apply):
└── Task 4: Analyze results + update Modelfile (depends: 3) [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 4 → F1-F4
Parallel Speedup: Tasks 1+2 run in parallel
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 3 |
| 2 | — | 3 |
| 3 | 1, 2 | 4 |
| 4 | 3 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 2 agents — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 1 agent — T3 → `deep`
- **Wave 3**: 1 agent — T4 → `quick`
- **FINAL**: 4 agents — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. GPU / Vulkan Pre-Flight Verification

  **What to do**:
  - Verify Ollama is running with Vulkan backend on the Radeon 890M iGPU
  - Check that `OLLAMA_VULKAN=1` is set in the Ollama server environment. If running as a systemd service, check `systemctl show ollama --property=Environment` or `/etc/systemd/system/ollama.service`. If running manually, verify the env var is exported.
  - Start/restart Ollama with `OLLAMA_VULKAN=1 OLLAMA_DEBUG=1` and capture startup logs
  - Look for the success pattern in logs: `library=Vulkan`, `description="AMD Radeon 890M"`, `total` VRAM > 0
  - Load the model: `ollama run shuff57/qwen3.5-9B-stat-grader "test" --verbose`
  - Verify layer offload: look for `offloaded N/N layers to GPU` in debug logs (NOT `offloaded 0/N`)
  - Verify `ollama ps` shows `100% GPU` in PROCESSOR column (but don't trust this alone — log is authoritative)
  - Check prompt eval rate from `--verbose` output: > 50 tok/s indicates GPU is working; < 15 tok/s suggests CPU fallback

  **If GPU detection fails** (any of these):
  - `library=cpu` in logs → Vulkan not active
  - `offloaded 0/N layers to GPU` → VRAM detection failed
  - `devices=[] total_vram="0 B"` → Vulkan found zero devices (known bug [#14562](https://github.com/ollama/ollama/issues/14562))

  **Troubleshooting steps (in order)**:
  1. Check BIOS: UMA VRAM must be set to a **fixed size** (e.g., 16GB or 32GB), NOT "Auto/Dynamic" — this is a known issue on HX370 ([#11451](https://github.com/ollama/ollama/issues/11451))
  2. Set Vulkan VRAM capability: `sudo setcap cap_perfmon+ep $(which ollama)` — required for accurate VRAM reporting
  3. Explicitly select Vulkan device: `export GGML_VK_VISIBLE_DEVICES=0`
  4. If Vulkan still fails, try ROCm fallback: `export OLLAMA_LLM_LIBRARY=rocm` + `export HSA_OVERRIDE_GFX_VERSION=11.5.1`
  5. If neither works, force layer offload in Modelfile: add `PARAMETER num_gpu 99`
  6. Nuclear option: compare against KoboldCpp with `--usevulkan` to confirm hardware works

  **Also test Flash Attention** (may provide bigger speed boost than ctx reduction on shared memory):
  - Restart Ollama with `OLLAMA_FLASH_ATTENTION=1 OLLAMA_VULKAN=1 OLLAMA_DEBUG=1 ollama serve`
  - Run the same `--verbose` test and compare eval rate with and without Flash Attention
  - Record both numbers — if Flash Attention alone hits 20+ tok/s at 8192, ctx reduction may not be needed

  **Must NOT do**:
  - Do NOT modify grading server code
  - Do NOT change any Modelfile sampling parameters
  - Do NOT permanently modify system services without noting the change

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: This is system verification and configuration checking, not complex implementation
  - **Skills**: [] (no skills needed — pure bash/terminal work)

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3 (benchmarking requires confirmed GPU)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` (lines 1-19) — the Modelfile to potentially add `num_gpu 99` to

  **External References**:
  - [Ollama GPU docs](https://docs.ollama.com/gpu) — Vulkan section: `OLLAMA_VULKAN=1` is required, `cap_perfmon` needed for VRAM reporting
  - [GitHub #11451](https://github.com/ollama/ollama/issues/11451) — HX370-specific: UMA "Auto" breaks GPU detection, must use fixed VRAM size
  - [GitHub #14562](https://github.com/ollama/ollama/issues/14562) — RDNA 3.5 Vulkan zero-device bug
  - [NixOS Discourse HX370 thread](https://discourse.nixos.org/t/how-to-ollama-on-amd-strix-halo/74363) — Community benchmarks: Vulkan ~14 tok/s, ROCm ~12 tok/s on HX370

  **WHY Each Reference Matters**:
  - Modelfile: may need `num_gpu 99` added if auto-detection underreports VRAM
  - #11451: This is the EXACT hardware — BIOS VRAM "Auto" is a known failure mode
  - #14562: Fallback awareness if Vulkan enumeration fails on RDNA 3.5
  - NixOS thread: Provides baseline performance expectations (~14 tok/s on 8B Q4)

  **Acceptance Criteria**:

  - [ ] Ollama startup logs show `library=Vulkan` and `description` contains "890M" or "Radeon"
  - [ ] Logs show `offloaded N/N layers to GPU` where N > 0 (ideally all layers)
  - [ ] `ollama ps` shows model loaded with GPU processor
  - [ ] `ollama run --verbose` shows prompt eval rate > 50 tok/s (GPU indicator)
  - [ ] Flash Attention comparison recorded (with vs without `OLLAMA_FLASH_ATTENTION=1`)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Vulkan GPU confirmed active
    Tool: Bash
    Preconditions: Ollama server running with OLLAMA_VULKAN=1 OLLAMA_DEBUG=1
    Steps:
      1. Run: OLLAMA_VULKAN=1 OLLAMA_DEBUG=1 ollama serve 2>&1 | head -50
         - Look for: `library=Vulkan` in "inference compute" log line
      2. Run: ollama run shuff57/qwen3.5-9B-stat-grader "What is 2+2?" --verbose 2>&1
         - Capture prompt eval rate and eval rate from verbose output
      3. Run: ollama ps
         - Capture PROCESSOR column
    Expected Result:
      - Log contains `library=Vulkan` (not `library=cpu`)
      - Prompt eval rate > 50 tok/s
      - `ollama ps` shows GPU percentage > 0%
    Failure Indicators:
      - `library=cpu` in logs
      - `offloaded 0/` in logs
      - Prompt eval rate < 15 tok/s
      - `ollama ps` shows `100% CPU`
    Evidence: .sisyphus/evidence/task-1-vulkan-verified.txt

  Scenario: Flash Attention speed comparison
    Tool: Bash
    Preconditions: Vulkan confirmed working from previous scenario
    Steps:
      1. Run without FA: ollama run shuff57/qwen3.5-9B-stat-grader "Explain the Central Limit Theorem" --verbose
         - Record eval rate (tok/s)
      2. Restart Ollama with: OLLAMA_FLASH_ATTENTION=1 OLLAMA_VULKAN=1 ollama serve
      3. Run same prompt with FA: ollama run shuff57/qwen3.5-9B-stat-grader "Explain the Central Limit Theorem" --verbose
         - Record eval rate (tok/s)
    Expected Result:
      - Both runs produce coherent output
      - FA eval rate recorded (may be same, faster, or slower)
      - Comparison data: "Without FA: X tok/s, With FA: Y tok/s"
    Failure Indicators:
      - Ollama crashes with FA enabled
      - Output is garbage/truncated
    Evidence: .sisyphus/evidence/task-1-flash-attention-comparison.txt
  ```

  **Commit**: NO (verification only, no file changes — unless `num_gpu 99` needs adding, in which case include in Commit 3)

- [x] 2. Build ctx Benchmark Script

  **What to do**:
  - Create `test-data/benchmark-ctx.js` — a standalone Bun script that:
    1. Calls Ollama `/api/chat` directly (NOT through the grading server)
    2. Uses per-request `options.num_ctx` to test different ctx values without rebuilding the model
    3. Captures Ollama's native timing fields: `eval_count`, `eval_duration`, `prompt_eval_count`, `prompt_eval_duration`, `total_duration`
    4. Calculates tok/s as `eval_count / (eval_duration / 1e9)`
    5. Builds realistic batch prompts using `buildBatchPrompt()` from `grading-server/grading.js`
    6. Tests with both 9-student and 15-student subsets from `test-data/test-students.json`
    7. Runs a warm-up request (discarded) after each ctx change, then 3 measured runs
    8. Verifies output integrity: parses `message.content` as JSON, checks student count matches input
    9. Detects truncation: compares `prompt_eval_count` across ctx values (a drop indicates silent truncation)
    10. Outputs results to `test-data/ctx-benchmark-results.json`

  - CLI interface:
    ```bash
    bun test-data/benchmark-ctx.js [--model shuff57/qwen3.5-9B-stat-grader] [--ctx 4096,5120,6144,7168,8192] [--students 9,15] [--runs 3] [--flash-attention]
    ```

  - Output format for each configuration:
    ```json
    {
      "ctx": 6144,
      "students": 15,
      "runs": [
        { "eval_count": 2847, "eval_duration_ns": 142350000000, "prompt_eval_count": 3891, "tps": 20.0, "json_valid": true, "student_count_match": true }
      ],
      "median_tps": 20.0,
      "prompt_eval_count": 3891,
      "truncated": false,
      "all_json_valid": true
    }
    ```

  - Build the test prompts by importing `buildBatchPrompt` and `generateScoringAnchors` from `grading-server/grading.js` and using a representative rubric. Use test students from `test-data/test-students.json` (10 students available — for the 15-student test, duplicate some with modified names to reach 15).

  **Must NOT do**:
  - Do NOT modify any existing grading server files
  - Do NOT install new dependencies (use built-in `fetch` and `Bun.write`)
  - Do NOT build a web dashboard — console + JSON file output only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding the Ollama API, prompt building logic, and statistical measurement — more than a trivial script
  - **Skills**: []
    - No special skills needed — standard JS/Bun scripting

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3 (benchmark sweep needs the script)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `test-data/run-benchmark.js` — existing benchmark script: follow its CLI arg pattern, file I/O patterns, and console output style. BUT note it calls the grading server, not Ollama directly — your script calls Ollama.
  - `grading-server/grading.js:97-249` (`buildBatchPrompt()`) — the exact function that builds batch prompts. Import and use this to create realistic test prompts.
  - `grading-server/grading.js:30-88` (`generateScoringAnchors()`) — generates the anchor object needed by `buildBatchPrompt()`. Import this too.
  - `grading-server/providers.js:58-73` (`buildOllamaRequest()`) — shows how Ollama `/api/chat` requests are structured (model, messages, stream, options). Follow this pattern but add `options.num_ctx` and `options.seed`.

  **API/Type References**:
  - `test-data/test-students.json` — 10 test students with varying quality. Use indices 0-8 for 9-student tests, all 10 + 5 duplicates for 15-student tests.
  - Ollama `/api/chat` response fields: `eval_count` (tokens generated), `eval_duration` (generation time in ns), `prompt_eval_count` (input tokens processed), `prompt_eval_duration` (prefill time in ns), `total_duration` (total time in ns)

  **External References**:
  - [Ollama API docs — /api/chat](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion) — response format with timing fields
  - Ollama `options.num_ctx` override: can be passed per-request to override Modelfile default
  - Ollama `options.seed`: set to 42 for reproducibility across runs

  **WHY Each Reference Matters**:
  - `run-benchmark.js`: copy the CLI style and output format for consistency
  - `buildBatchPrompt()`: creates the exact prompt structure the model was fine-tuned on — using a synthetic prompt would test the wrong thing
  - `providers.js`: shows the correct Ollama request shape the server uses
  - Test students: provides realistic response lengths and quality distribution

  **Acceptance Criteria**:

  - [ ] `bun test-data/benchmark-ctx.js --help` prints usage without errors
  - [ ] Script runs successfully with default args and produces `test-data/ctx-benchmark-results.json`
  - [ ] Each result entry contains: `ctx`, `students`, `runs[]`, `median_tps`, `prompt_eval_count`, `truncated`, `all_json_valid`
  - [ ] Script correctly calculates `tps = eval_count / (eval_duration / 1e9)`
  - [ ] Script detects truncation by comparing `prompt_eval_count` across ctx values

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Benchmark script runs and produces valid output
    Tool: Bash
    Preconditions: Ollama running with model loaded, test-data/test-students.json exists
    Steps:
      1. Run: bun test-data/benchmark-ctx.js --ctx 8192 --students 9 --runs 1
      2. Check exit code is 0
      3. Read test-data/ctx-benchmark-results.json
      4. Verify JSON is valid and contains entry with ctx=8192, students=9
      5. Verify entry has median_tps > 0 and prompt_eval_count > 0
    Expected Result:
      - Script exits cleanly
      - JSON file contains one result entry
      - median_tps is a positive number
      - all_json_valid is true
    Failure Indicators:
      - Script crashes or hangs
      - JSON file missing or malformed
      - tps is 0 or NaN
      - all_json_valid is false (model output couldn't be parsed as JSON)
    Evidence: .sisyphus/evidence/task-2-benchmark-script-test.json

  Scenario: Script detects truncation at very low ctx
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. Run: bun test-data/benchmark-ctx.js --ctx 2048 --students 15 --runs 1
      2. Read test-data/ctx-benchmark-results.json
      3. Check the entry for ctx=2048, students=15
    Expected Result:
      - truncated field is true (2048 cannot fit 15 students)
      - OR all_json_valid is false (output is garbage due to truncated input)
    Failure Indicators:
      - Script reports no truncation at 2048 with 15 students (impossible — prompt alone is ~3500+ tokens)
    Evidence: .sisyphus/evidence/task-2-truncation-detection.json
  ```

  **Commit**: YES
  - Message: `test(benchmark): add ctx sweep benchmark script`
  - Files: `test-data/benchmark-ctx.js`
  - Pre-commit: `bun test-data/benchmark-ctx.js --ctx 8192 --students 9 --runs 1`

- [~] 3. Run ctx Sweep Benchmarks (running in tmux ctx-bench — ~45 min ETA)

  **What to do**:
  - Using the benchmark script from Task 2, run a full sweep across ctx values and batch sizes
  - Test matrix:
    | ctx | 9 students | 15 students |
    |-----|-----------|-------------|
    | 4096 | ✓ | ✓ |
    | 5120 | ✓ | ✓ |
    | 6144 | ✓ | ✓ |
    | 7168 | ✓ | ✓ |
    | 8192 | ✓ | ✓ (baseline) |

  - For each cell: warm-up run (discarded) + 3 measured runs
  - Total: 5 ctx × 2 batch sizes × (1 warmup + 3 measured) = 40 Ollama API calls
  - If Task 1 found Flash Attention helps, run the ENTIRE sweep twice: once without FA, once with `OLLAMA_FLASH_ATTENTION=1`

  - Run command:
    ```bash
    bun test-data/benchmark-ctx.js --ctx 4096,5120,6144,7168,8192 --students 9,15 --runs 3
    ```

  - After sweep completes, examine results for:
    1. **Speed sweet spot**: Which ctx values achieve ≥20 tok/s?
    2. **Capacity ceiling**: At which ctx values does 15-student batch truncate?
    3. **Diminishing returns**: Is the speed gain from 6144→4096 worth the capacity loss?
    4. **Quality**: Does the model still produce valid grading JSON at lower ctx values?

  - Also run a **verbose student stress test**: take the 15-student batch but replace 5 students with 300+ word responses (copy the longest test response and expand it). This tests the realistic worst case.

  **Must NOT do**:
  - Do NOT change any Modelfile parameters between runs (only `options.num_ctx` per-request)
  - Do NOT run other GPU-intensive tasks during benchmarking (thermal interference)
  - Do NOT accept results from the first run after a ctx change (always discard warm-up)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires running multiple sequential benchmarks, interpreting results, handling edge cases (truncation, thermal throttling), and making analytical judgments about the data
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — depends on Tasks 1 and 2)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `test-data/benchmark-ctx.js` (created in Task 2) — the benchmark script to execute
  - `test-data/test-students.json` — test student data used by the script

  **External References**:
  - [NixOS HX370 benchmark](https://discourse.nixos.org/t/how-to-ollama-on-amd-strix-halo/74363) — community reports ~14 tok/s on 8B Q4 at default ctx. Use as sanity check — if your 8192 baseline is far below this, something is wrong.

  **WHY Each Reference Matters**:
  - benchmark-ctx.js: this is the tool you're executing
  - NixOS benchmark: sanity check — if results diverge wildly from community data, investigate before proceeding

  **Acceptance Criteria**:

  - [ ] `test-data/ctx-benchmark-results.json` contains results for all 10 configurations (5 ctx × 2 batch sizes)
  - [ ] At least one ctx value achieves ≥20 tok/s with 15 students
  - [ ] Truncation detected for 15 students at ctx ≤ 4096 (expected given ~7K token requirement)
  - [ ] Verbose student stress test results recorded
  - [ ] If Flash Attention tested, both FA-on and FA-off sweep data included

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full sweep produces complete results
    Tool: Bash
    Preconditions: Ollama running with Vulkan confirmed (Task 1), benchmark script working (Task 2)
    Steps:
      1. Run: bun test-data/benchmark-ctx.js --ctx 4096,5120,6144,7168,8192 --students 9,15 --runs 3
      2. Wait for completion (may take 10-20 minutes)
      3. Read: test-data/ctx-benchmark-results.json
      4. Count entries: should be 10 (5 ctx × 2 batch sizes)
      5. For each entry, verify: median_tps > 0, prompt_eval_count > 0
    Expected Result:
      - 10 result entries, all with valid data
      - 8192-ctx/9-student baseline matches the known 10-20 tok/s range
      - Lower ctx values show higher tok/s (monotonic speed improvement)
      - 15-student batches at ≤4096 show truncation=true
    Failure Indicators:
      - Missing entries (script crashed mid-sweep)
      - 8192 baseline shows < 5 tok/s (GPU likely not engaged — revisit Task 1)
      - Lower ctx shows SLOWER speeds than higher ctx (something is wrong)
      - No ctx value achieves ≥20 tok/s (hardware ceiling — plan must pivot)
    Evidence: .sisyphus/evidence/task-3-sweep-results.json

  Scenario: Identify the winning ctx value
    Tool: Bash
    Preconditions: Sweep results exist
    Steps:
      1. Read test-data/ctx-benchmark-results.json
      2. Filter: entries where students=15 AND truncated=false AND all_json_valid=true
      3. From filtered: find entry with highest median_tps that is ≥20
      4. If no entry has tps ≥20 with 15 students, try students=12 (if tested) or note that only 9-student batches hit target
    Expected Result:
      - A clear winner ctx value that fits 15 students AND achieves ≥20 tok/s
      - OR evidence that the target requires reducing batch size to 9-12 students
    Failure Indicators:
      - No configuration meets both criteria simultaneously
      - Multiple ctx values are tied (pick the higher ctx for more headroom)
    Evidence: .sisyphus/evidence/task-3-winner-analysis.txt
  ```

  **Commit**: YES
  - Message: `data(benchmark): ctx benchmark results for HX370/890M`
  - Files: `test-data/ctx-benchmark-results.json`
  - Pre-commit: none (data file only)

- [x] 4. Analyze Results + Update Modelfile

  **What to do**:
  - Read `test-data/ctx-benchmark-results.json` and identify the optimal `num_ctx` value
  - Selection criteria (in priority order):
    1. 15-student batch must NOT be truncated (`truncated: false`)
    2. 15-student batch must produce valid JSON with all 15 students
    3. tok/s must be ≥20 (target range: 20-30)
    4. If multiple ctx values qualify, pick the HIGHEST (more headroom for verbose students)
    5. If NO ctx value qualifies for 15 students, find the max batch size that works at ≥20 tok/s

  - **If a clear winner exists**: Update `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` line 16:
    ```
    PARAMETER num_ctx <WINNING_VALUE>
    ```

  - **If Flash Attention was needed to hit target**: Note in the Modelfile comment that `OLLAMA_FLASH_ATTENTION=1` is required:
    ```
    # Requires: OLLAMA_FLASH_ATTENTION=1 OLLAMA_VULKAN=1
    ```

  - **If Task 1 found `num_gpu 99` was needed**: Add to Modelfile:
    ```
    PARAMETER num_gpu 99
    ```

  - **If no ctx value hits 20 tok/s with 15 students**: Update to the best trade-off and document the actual achievable performance in the Modelfile comment. Consider recommending a lower batch size (e.g., 12 students) for the 20 tok/s target.

  - Run a **grading quality sanity check**: Grade the 10 test students at the new ctx value and compare scores against the 8192-ctx baseline. Mean absolute deviation should be ≤1 point per student. Use:
    ```bash
    # Baseline at 8192
    curl -s http://localhost:11434/api/chat -d '{"model":"shuff57/qwen3.5-9B-stat-grader","messages":[{"role":"user","content":"<10-student prompt>"}],"stream":false,"options":{"num_ctx":8192,"seed":42}}' > baseline.json

    # Test at new ctx
    curl -s http://localhost:11434/api/chat -d '{"model":"shuff57/qwen3.5-9B-stat-grader","messages":[{"role":"user","content":"<same prompt>"}],"stream":false,"options":{"num_ctx":<NEW>,"seed":42}}' > test.json

    # Compare scores
    ```

  - Rebuild the Ollama model with the updated Modelfile:
    ```bash
    ollama create shuff57/qwen3.5-9B-stat-grader -f fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader
    ```

  **Must NOT do**:
  - Do NOT change temperature, top_p, top_k, or presence_penalty
  - Do NOT change the model FROM path or GGUF file
  - Do NOT change stop tokens
  - Do NOT modify grading server code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Reading benchmark data, making a decision, changing one line in a file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — depends on Task 3)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` (lines 1-19) — the file to update. Line 16 is `PARAMETER num_ctx 8192` — change only this line (and optionally add `num_gpu 99` after line 16)
  - `test-data/ctx-benchmark-results.json` (created in Task 3) — the benchmark data to analyze

  **API/Type References**:
  - `test-data/test-students.json` — 10 test students for quality comparison

  **WHY Each Reference Matters**:
  - Modelfile: THE deliverable — one line change
  - Benchmark results: THE evidence driving the decision
  - Test students: quality verification dataset

  **Acceptance Criteria**:

  - [ ] `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` line 16 updated to new `num_ctx` value
  - [ ] Modelfile comment (line 2) updated to reflect performance characteristics
  - [ ] Model rebuilt with `ollama create` using updated Modelfile
  - [ ] Quality comparison: 10 test students scored within ±1 point mean absolute deviation vs 8192 baseline
  - [ ] `ollama run --verbose` with 15-student prompt confirms tok/s ≥ 20 at new ctx

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Updated model achieves target performance
    Tool: Bash
    Preconditions: Modelfile updated, model rebuilt with ollama create
    Steps:
      1. Run: bun test-data/benchmark-ctx.js --ctx <NEW_VALUE> --students 15 --runs 3
      2. Read results: check median_tps
      3. Verify: truncated=false, all_json_valid=true, median_tps >= 20
    Expected Result:
      - median_tps >= 20
      - 15 students returned in valid JSON
      - No truncation
    Failure Indicators:
      - tps < 20 (value chosen was wrong — re-analyze)
      - truncated=true (value too low — increase)
      - JSON invalid (model behavior changed — investigate)
    Evidence: .sisyphus/evidence/task-4-final-performance.json

  Scenario: Grading quality preserved at new ctx
    Tool: Bash
    Preconditions: Updated model running
    Steps:
      1. Send 10 test students at ctx=8192 (baseline) with seed=42
      2. Send same 10 students at ctx=<NEW_VALUE> with seed=42
      3. Parse both JSON responses, extract scores per student
      4. Calculate mean absolute deviation between baseline and new scores
    Expected Result:
      - Mean absolute deviation ≤ 1.0 point
      - No student deviates by more than 2 points
      - All 10 students returned in both responses
    Failure Indicators:
      - MAD > 1.0 (ctx reduction is affecting grading quality)
      - Student missing from either response
      - Feedback text is truncated or incoherent at lower ctx
    Evidence: .sisyphus/evidence/task-4-quality-comparison.json
  ```

  **Commit**: YES (two commits)
  - Message 1: `data(benchmark): ctx benchmark results for HX370/890M`
    - Files: `test-data/ctx-benchmark-results.json`
  - Message 2: `perf(model): optimize num_ctx for 9-15 student batches at 20+ tok/s`
    - Files: `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader`
    - Pre-commit: `bun test-data/benchmark-ctx.js --ctx <NEW_VALUE> --students 15 --runs 1`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify: GPU is confirmed via Vulkan (evidence in logs), benchmark data exists in `test-data/ctx-benchmark-results.json`, Modelfile `num_ctx` was updated, no server code was modified, no sampling parameters changed. Check `.sisyphus/evidence/` for all required evidence files.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Review `test-data/benchmark-ctx.js` for: proper error handling, no hardcoded paths, correct Ollama API usage, proper JSON parsing, meaningful output format. Review Modelfile changes for correctness. Run `bun test` in grading-server to verify no regressions.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start Ollama with the updated model. Send a real 15-student batch prompt via curl. Verify: tok/s ≥ 20, all 15 students returned in JSON, no truncation, feedback is coherent. Save full response to `.sisyphus/evidence/final-qa/15-student-live-test.json`.
  Output: `tok/s [VALUE] | Students [N/N] | Truncation [NONE/DETECTED] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Verify ONLY these files were modified: `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader`, and new files: `test-data/benchmark-ctx.js`, `test-data/ctx-benchmark-results.json`. No other files touched. No server code changes. No sampling parameter changes. Verify `num_ctx` value matches benchmark winner.
  Output: `Files Modified [EXPECTED/UNEXPECTED] | Scope [CLEAN/VIOLATED] | VERDICT`

---

## Commit Strategy

- **Commit 1**: `test(benchmark): add ctx sweep benchmark script` — `test-data/benchmark-ctx.js`
- **Commit 2**: `data(benchmark): ctx benchmark results for HX370/890M` — `test-data/ctx-benchmark-results.json`
- **Commit 3**: `perf(model): optimize num_ctx for 9-15 student batches` — `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader`

---

## Success Criteria

### Verification Commands
```bash
# 1. GPU is using Vulkan
ollama ps  # Expected: PROCESSOR shows "100% GPU"

# 2. Model generates at target speed with 15 students
curl -s http://localhost:11434/api/chat -d '{"model":"shuff57/qwen3.5-9B-stat-grader","messages":[{"role":"user","content":"<15-student prompt>"}],"stream":false,"options":{"num_ctx":<CHOSEN_VALUE>}}' | jq '{tps: (.eval_count / (.eval_duration / 1e9)), students: (.message.content | fromjson | length)}'
# Expected: tps >= 20, students == 15

# 3. No grading server regressions
cd grading-server && bun test  # Expected: all tests pass
```

### Final Checklist
- [ ] Vulkan confirmed active with all layers on GPU
- [ ] `num_ctx` value chosen based on empirical benchmark data
- [ ] 15-student batch: no truncation, valid JSON, ≥20 tok/s
- [ ] 9-student batch: no truncation, valid JSON, ≥20 tok/s
- [ ] Grading quality preserved (within ±1 point of baseline)
- [ ] No server code modified
- [ ] All tests still pass
