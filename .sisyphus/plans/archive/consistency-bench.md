# Consistency Benchmark: Multi-Model Grading Comparison

## TL;DR

> **Quick Summary**: Build a standalone Bun script that grades the same set of real students through 5 AI models (3 open-source via Ollama, 2 commercial), 3 times each, and generates a statistical report comparing score agreement across models and run-to-run consistency within each model.
> 
> **Deliverables**:
> - `test-data/captured-rubric.json` — Template for user to paste real rubric data
> - `test-data/captured-students.json` — Template for user to paste real student data
> - `test-data/run-benchmark.js` — Standalone benchmark script (Bun)
> - `test-data/benchmark-results.json` — Raw JSON output (generated at runtime)
> - `test-data/benchmark-report.md` — Markdown report (generated at runtime)
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (templates) → Task 2 (script) → Task 3 (report generator)

---

## Context

### Original Request
Test the consistency of the batch grader using actual student data. Compare open-source models (via Ollama) against commercial models to see if open-source is "any good." Concerned about score agreement and consistency over multiple runs, especially given real students with wide swings in writing quality.

### Interview Summary
**Key Discussions**:
- **Models**: GLM-5, Kimi-K2.5, DeepSeek 3.2, Qwen 3.5 (397B), Mistral Large 3 (675B), GPT-OSS (120B) (open-source via Ollama) + Haiku 4.5, Sonnet 4.6 (commercial via Anthropic)
- **Runs**: 3 per model (24 total grading requests), user can add more later
- **Data**: Fresh real student data, manually pasted into JSON files (Option B)
- **Config**: Fixed chunkSize 30, sweep "none" to isolate model as only variable
- **Metrics**: Score agreement (±1 tolerance) and run-to-run consistency — scores only, no feedback
- **Output**: Per-model summary, per-student score matrix, agreement metrics, flagged disagreements
- **Form**: Standalone script, not a Vitest integration test
- **Tolerance**: ±1 for now, designed to be tightened after initial results

**Research Findings**:
- Existing benchmark pattern at `test-data/run-baseline.js` — THE pattern to follow for SSE consumption, auth, and output format
- Server requires Bearer token auth via `GET /api/handshake` before any `/api/grade` calls
- Provider configs loaded from disk (`ogre-server.json`) — user must have providers configured
- Outlier detection always runs even with `sweep: "none"` — creates non-deterministic score adjustments between runs
- Model names are free-form strings passed verbatim to providers — must use exact names from `ollama list` / provider API
- No fetch timeout on provider calls — script needs its own timeout safety

### Metis Review
**Identified Gaps** (addressed):
- **Bearer auth required**: Script must call `/api/handshake` first — incorporated into script design
- **Outlier detection confound**: Track BOTH raw and adjusted scores, use raw for consistency metrics — incorporated
- **No fetch timeout**: Add AbortController with 5-min default — incorporated
- **Ollama cold-start bias**: First run loads model into VRAM, runs 2-3 are faster — documented as known limitation (no warmup phase unless user requests)
- **Rate limiting risk**: Add configurable delay between requests (3s default) — incorporated
- **Continue on failure**: Script skips failed runs and continues — incorporated
- **Model names are runtime config**: Config block at top of script, user fills in exact names — incorporated

---

## Work Objectives

### Core Objective
Create a repeatable benchmarking tool that answers: "Do these 5 AI models grade students consistently, both across models and within the same model across multiple runs?"

### Concrete Deliverables
- 2 JSON template files for user to paste real student/rubric data
- 1 standalone Bun script (`test-data/run-benchmark.js`) that runs the benchmark
- Generated outputs: `benchmark-results.json` (raw data) + `benchmark-report.md` (human-readable report)

### Definition of Done
- [x] `bun run test-data/run-benchmark.js` completes against running server with at least 1 model configured
- [x] `test-data/benchmark-results.json` contains per-model, per-run, per-student score data
- [x] `test-data/benchmark-report.md` contains all 4 report sections (summary, matrix, agreement, disagreements)

### Must Have
- Configurable model list, run count, tolerance, and delay at top of script
- Bearer token auth via `/api/handshake` (follows `run-baseline.js` pattern exactly)
- Per-request timeout via `AbortController` (5 min default)
- Inter-request delay to avoid rate limiting (3s default)
- Track BOTH raw (pre-outlier) and final (post-outlier) scores
- Skip-and-continue on model/run failure (don't abort entire benchmark)
- Markdown report with: per-model summary table, per-student score matrix, agreement %, flagged disagreements
- Configurable tolerance (±1 default) that can be tightened later
- Progress logging: `[Model 2/8] [Run 2/3] model-name — N students — Xs — mean=X.X`

### Must NOT Have (Guardrails)
- **No new dependencies** — Bun built-ins only, no npm installs
- **No modifications to existing files** — server, grading logic, providers stay untouched
- **No feedback text analysis** — scores only
- **No CLI arg parser libraries** — config object at top of file
- **No class abstractions** — single file, procedural, functions only
- **No warmup phase** — unless user explicitly requests after seeing results
- **No statistical significance testing** (t-tests, p-values) — mean, stdDev, variance suffice
- **No HTML reports or charts** — markdown only
- **No complex retry orchestration** — log failure, skip, continue
- **No importing from desktop app** (`ogre-desktop/`) — script is fully standalone
- **No auto-starting or auto-configuring the grading server**

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest on both desktop and server)
- **Automated tests**: NO — this IS the benchmarking tool, not a feature needing unit tests
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Script validation**: Use Bash — run Bun to check syntax, verify file reads, check output format
- **Server integration**: Use Bash (curl) — verify health endpoint, handshake, grade endpoint responses

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — templates):
├── Task 1: Create input JSON templates [quick]
└── Task 2: Create example data documentation [quick]

Wave 2 (After Wave 1 — core script):
└── Task 3: Build the complete benchmark script [deep]

Wave FINAL (After ALL tasks — review):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real QA against running server [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 3 → F1-F4
Parallel Speedup: ~30% (small plan, main bottleneck is Task 3)
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3 | 1 |
| 2 | — | 3 | 1 |
| 3 | 1, 2 | F1-F4 | 2 |
| F1-F4 | 3 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 1 task — T3 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> **Every task MUST have QA Scenarios. A task WITHOUT QA scenarios is INCOMPLETE.**


- [x] 1. Create Input JSON Templates — COMPLETE (files created: captured-rubric.json, captured-students.json)

  **What to do**:
  - Create `test-data/captured-rubric.json` with the same shape as `test-data/test-rubric.json`:
    - Fields: `{ essayPrompt, checklistItems: [{ category, points, items }], rubricItems: [{ category, items }], modelText, maxScore }`
    - Populate with placeholder text clearly indicating where the user pastes real data
    - Include a top-level `_instructions` field explaining what to replace
  - Create `test-data/captured-students.json` as an array of `{ index, name, response }` objects:
    - Include 2-3 placeholder entries with example structure
    - Include a top-level comment via `_instructions` field explaining the format
  - Both files must be valid JSON (parseable by `JSON.parse()`)

  **Must NOT do**:
  - Do not copy actual student data into these templates
  - Do not add fields beyond what `POST /api/grade` expects

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file creation following an existing pattern
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures clean JSON formatting
  - **Skills Evaluated but Omitted**:
    - None — trivial task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `test-data/test-rubric.json` — Exact schema to replicate for `captured-rubric.json`
  - `test-data/test-students.json` — Exact schema to replicate for `captured-students.json`

  **API/Type References** (contracts to implement against):
  - `grading-server/server.js:1482-1510` — The `/api/grade` endpoint destructures `rubric` and `students` from the request body; these templates must match that shape exactly

  **WHY Each Reference Matters**:
  - `test-rubric.json`: Shows the exact field names (`essayPrompt`, `checklistItems`, `rubricItems`, `modelText`, `maxScore`) and nesting structure the grading server expects
  - `test-students.json`: Shows the `{ index, name, response }` shape — the benchmark script will read this array and pass it directly to the API

  **Acceptance Criteria**:

  - [ ] `captured-rubric.json` exists in `test-data/` and parses as valid JSON
  - [ ] `captured-students.json` exists in `test-data/` and parses as valid JSON array
  - [ ] Rubric file has all required fields: `essayPrompt`, `checklistItems`, `rubricItems`, `maxScore`
  - [ ] Student file entries have all required fields: `index`, `name`, `response`

  **QA Scenarios:**

  ```
  Scenario: Rubric template is valid and has correct structure
    Tool: Bash (bun)
    Preconditions: Template files created in test-data/
    Steps:
      1. Run: bun -e "const r=JSON.parse(require('fs').readFileSync('test-data/captured-rubric.json','utf8')); console.assert(r.essayPrompt !== undefined, 'missing essayPrompt'); console.assert(Array.isArray(r.checklistItems), 'checklistItems not array'); console.assert(r.maxScore !== undefined, 'missing maxScore'); console.log('PASS: rubric template valid')"
    Expected Result: Prints "PASS: rubric template valid", exit code 0
    Failure Indicators: AssertionError or JSON parse error
    Evidence: .sisyphus/evidence/task-1-rubric-template-valid.txt

  Scenario: Student template is valid and has correct structure
    Tool: Bash (bun)
    Preconditions: Template files created in test-data/
    Steps:
      1. Run: bun -e "const s=JSON.parse(require('fs').readFileSync('test-data/captured-students.json','utf8')); console.assert(Array.isArray(s), 'not array'); console.assert(s.length >= 1, 'empty array'); console.assert(s[0].index !== undefined, 'missing index'); console.assert(s[0].name !== undefined, 'missing name'); console.assert(s[0].response !== undefined, 'missing response'); console.log('PASS: student template valid')"
    Expected Result: Prints "PASS: student template valid", exit code 0
    Failure Indicators: AssertionError or JSON parse error
    Evidence: .sisyphus/evidence/task-1-student-template-valid.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `feat(test-data): add benchmark input templates for consistency test`
  - Files: `test-data/captured-rubric.json`, `test-data/captured-students.json`
  - Pre-commit: QA scenarios above

- [x] 2. Create Usage Documentation in Script Header — COMPLETE (run-benchmark.js stub created with header + CONFIG + main)

  **What to do**:
  - Create `test-data/run-benchmark.js` as a minimal stub with a comprehensive header comment block explaining:
    - Purpose: Multi-model consistency benchmark for the O.G.R.E grading server
    - Prerequisites: grading server running on localhost:3456, Ollama running with models pulled, provider configs in ogre-server.json
    - How to prepare data: paste real student responses into `captured-students.json`, paste rubric into `captured-rubric.json`
    - How to run: `bun run test-data/run-benchmark.js`
    - How to read results: `benchmark-results.json` for raw data, `benchmark-report.md` for human-readable report
    - Known limitation: first run of each Ollama model may be slower (cold VRAM load)
    - Known limitation: outlier detection runs on every request — raw (pre-adjustment) scores are used for consistency metrics
  - Define the **configuration block** at the top of the file:
    ```javascript
    const CONFIG = {
      models: [
        { provider: 'ollama',     model: 'glm-5:cloud',               label: 'GLM-5'           },
        { provider: 'ollama',     model: 'kimi-k2.5:cloud',           label: 'Kimi-K2.5'       },
        { provider: 'ollama',     model: 'deepseek-v3.2:cloud',       label: 'DeepSeek 3.2'    },
        { provider: 'ollama',     model: 'qwen3.5:397b-cloud',        label: 'Qwen 3.5 397B'   },
        { provider: 'ollama',     model: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3' },
        { provider: 'ollama',     model: 'gpt-oss:120b-cloud',        label: 'GPT-OSS 120B'    },
        { provider: 'anthropic',  model: 'claude-haiku-4-5',          label: 'Haiku 4.5'       },
        { provider: 'anthropic',  model: 'claude-sonnet-4-6',         label: 'Sonnet 4.6'      },
      ],
      runsPerModel: 3,
      tolerance: 1,        // ±1 point for "agreement"
      delayMs: 3000,       // Between requests
      timeoutMs: 300000,   // 5 min per request
      serverUrl: 'http://localhost:3456',
      chunkSize: 30,
      sweep: 'none',
      inputStudents: 'test-data/captured-students.json',
      inputRubric: 'test-data/captured-rubric.json',
      outputResults: 'test-data/benchmark-results.json',
      outputReport: 'test-data/benchmark-report.md',
    };
    ```
  - This task creates the file with header + config + a placeholder `main()` function that just logs the config and exits
  - The actual implementation fills in Task 3

  **Must NOT do**:
  - Do not implement the actual benchmark logic yet (that's Task 3)
  - Do not add a CLI arg parser library
  - Do not add any npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File creation with documentation and config — no complex logic
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures clean code structure and formatting

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `test-data/run-baseline.js:1-30` — Header comment style and structure for existing benchmark scripts in this project
  - `test-data/run-baseline.js:108-120` — Config block pattern (SERVER_URL, model, provider constants)

  **API/Type References**:
  - `grading-server/server.js:1482-1510` — The `/api/grade` request body schema that the config must align with
  - `grading-server/server.js:246` — Bearer token auth middleware (script must document this prerequisite)

  **External References**:
  - None — Bun built-ins only

  **WHY Each Reference Matters**:
  - `run-baseline.js` header: Follow the existing documentation style so the script feels native to the project, not bolted-on
  - `run-baseline.js` config: The existing pattern uses top-level `const` declarations — follow this for consistency
  - `server.js` auth: The handshake requirement must be documented as a prerequisite since the user won't know otherwise

  **Acceptance Criteria**:

  - [ ] `test-data/run-benchmark.js` exists and is syntactically valid JavaScript
  - [ ] File has a comprehensive header comment explaining purpose, prerequisites, usage
  - [ ] CONFIG block is defined with all 8 models, `runsPerModel: 3`, `tolerance: 1`
  - [ ] Script runs without error (prints config and exits)

  **QA Scenarios:**

  ```
  Scenario: Script file exists and parses without syntax errors
    Tool: Bash (bun)
    Preconditions: run-benchmark.js created in test-data/
    Steps:
      1. Run: bun run test-data/run-benchmark.js 2>&1
    Expected Result: Prints config info and exits cleanly (exit code 0), no SyntaxError
    Failure Indicators: SyntaxError, ReferenceError, or non-zero exit code
    Evidence: .sisyphus/evidence/task-2-script-parses.txt

  Scenario: Config block has all 8 models defined
    Tool: Bash (grep)
    Preconditions: run-benchmark.js exists
    Steps:
      1. Run: grep -c "provider:" test-data/run-benchmark.js
    Expected Result: Output is "5" (one provider line per model entry)
    Failure Indicators: Count is not 5
    Evidence: .sisyphus/evidence/task-2-model-count.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(test-data): add benchmark input templates for consistency test`
  - Files: `test-data/run-benchmark.js` (stub)
  - Pre-commit: QA scenarios above

- [x] 3. Implement the Complete Benchmark Runner and Report Generator — COMPLETE (full implementation with preflight, loadInputs, gradeOnce, runBenchmark, computeStats, saveResults, generateReport)

  **What to do**:
  Fill in `test-data/run-benchmark.js` (created as a stub in Task 2) with the full benchmark logic. This is the core deliverable — a single-file procedural script with these functions:

  **A. Health Check & Auth (`preflight()`)**:
  - `GET {serverUrl}/health` — fail fast with clear error if server is not running
  - `GET {serverUrl}/api/handshake` — get Bearer token (follow `run-baseline.js:113` pattern exactly)
  - Store token for all subsequent requests

  **B. Input Loading (`loadInputs()`)**:
  - Read `captured-students.json` and `captured-rubric.json` from paths in CONFIG
  - Validate: students is an array with `.length > 0`, rubric has `essayPrompt` and `maxScore`
  - Fail with descriptive error if files missing or malformed
  - Log: `Loaded N students, rubric maxScore=X`

  **C. Single Grading Run (`gradeOnce(modelConfig, token, rubric, students)`)**:
  - POST `{serverUrl}/api/grade` with body: `{ provider, model, rubric, students, chunkSize: CONFIG.chunkSize, sweep: CONFIG.sweep }`
  - Headers: `{ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }`
  - Implement `AbortController` with `CONFIG.timeoutMs` timeout
  - Parse SSE response using the **exact** `run-baseline.js` pattern:
    - Read full response text: `const text = await response.text()`
    - Split by lines, track current event name
    - Handle events: `chunk` (collect results), `outlier` (track adjustments), `done` (final stats), `error` (log and throw)
  - Return: `{ elapsed, stats, results: [{ studentIndex, name, score, rawScore, adjusted }] }` where `rawScore` is the pre-outlier score and `score` is the final score
  - On error: throw with descriptive message including model name and run number

  **D. Main Loop (`runBenchmark()`)**:
  - For each model in CONFIG.models (outer loop):
    - For each run 1→CONFIG.runsPerModel (inner loop):
      - Log: `[Model M/8] [Run R/3] {label} — grading {N} students...`
      - Call `gradeOnce()` wrapped in try/catch
      - On success: store results, log `— {elapsed}s — mean={mean}`
      - On failure: log error, store `null` for this run, continue
      - Sleep `CONFIG.delayMs` between requests (use `Bun.sleep()` or `await new Promise(r => setTimeout(r, ms))`)
  - Return all collected results

  **E. Statistics Calculator (`computeStats(allResults)`)**:
  - **Per-model summary**: For each model, across its 3 runs:
    - `meanScore`: average of all student scores across all runs
    - `stdDev`: standard deviation of all student scores across all runs
    - `runToRunVariance`: For each student, compute variance of their score across the 3 runs, then average those variances. This is the key consistency metric.
    - `successfulRuns`: count of non-null runs (out of 3)
  - **Per-student score matrix**: For each student, for each model, the mean score across 3 runs (rounded to 1 decimal)
  - **Agreement metrics**: For each pair of models (28 pairs total), compute % of students where |mean_model_A - mean_model_B| ≤ CONFIG.tolerance
  - **Flagged disagreements**: Students where max(mean scores across models) - min(mean scores across models) ≥ 3
  - Use RAW scores (pre-outlier) for all consistency metrics to avoid the outlier detection confound

  **F. JSON Output (`saveResults(data)`)**:
  - Write `CONFIG.outputResults` with structure:
    ```json
    {
      "timestamp": "ISO-8601",
      "config": { "models": [...], "runsPerModel": 3, "tolerance": 1, "chunkSize": 30, "sweep": "none" },
      "models": [{
        "label": "GLM-5",
        "provider": "ollama",
        "model": "glm-5:cloud",
        "runs": [{
          "runNumber": 1,
          "elapsed": 42.3,
          "stats": { "mean": 7.2, "stdDev": 1.8 },
          "results": [{ "studentIndex": 0, "name": "...", "score": 8, "rawScore": 8, "adjusted": false }]
        }]
      }],
      "comparison": {
        "perModel": [{ "label": "...", "meanScore": 7.1, "stdDev": 1.9, "runToRunVariance": 0.3, "successfulRuns": 3 }],
        "perStudent": [{ "index": 0, "name": "...", "scores": { "GLM-5": 7.3, "Haiku 4.5": 8.0, ... } }],
        "agreement": [{ "modelA": "GLM-5", "modelB": "Haiku 4.5", "agreementPct": 83.3 }],
        "flagged": [{ "index": 5, "name": "...", "scores": {...}, "spread": 4 }]
      }
    }
    ```

  **G. Markdown Report Generator (`generateReport(data)`)**:
  - Write `CONFIG.outputReport` with these sections:
  - **Section 1: Header** — Timestamp, config summary (models, runs, tolerance), student count
  - **Section 2: Per-Model Summary** — Markdown table:
    ```
    | Model | Provider | Mean | StdDev | Run-to-Run Variance | Runs |
    |-------|----------|------|--------|---------------------|------|
    | GLM-5 | ollama   | 7.1  | 1.9    | 0.3                 | 3/3  |
    ```
  - **Section 3: Per-Student Score Matrix** — Markdown table:
    ```
    | # | Student | GLM-5 | Kimi | DeepSeek | Haiku | Sonnet | Spread |
    |---|---------|-------|------|----------|-------|--------|--------|
    | 0 | Anderson| 7.3   | 7.0  | 8.0      | 8.0   | 7.7    | 1.0    |
    ```
  - **Section 4: Cross-Model Agreement** — Markdown table showing pairwise agreement %:
    ```
    | Model Pair            | Agreement (±1) |
    |-----------------------|----------------|
    | GLM-5 vs Haiku 4.5    | 83.3%          |
    ```
  - **Section 5: Flagged Disagreements** — Students where score spread ≥ 3 points:
    ```
    | # | Student | Lowest | Highest | Spread | Models Disagree |
    |---|---------|--------|---------|--------|-----------------|
    | 5 | Chen    | 4.0    | 8.0     | 4.0    | DeepSeek(4) vs Sonnet(8) |
    ```
  - Print final console summary: total time, models tested, agreement overview

  **Must NOT do**:
  - Do not install any npm packages — Bun built-ins and `fs` only
  - Do not import from `ogre-desktop/` — fully standalone
  - Do not add class abstractions — procedural functions only
  - Do not add warmup runs
  - Do not add t-tests, p-values, or statistical significance
  - Do not generate HTML or charts
  - Do not add complex retry logic — log failure, skip, continue
  - Do not modify any existing files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex single-file implementation requiring SSE parsing, statistics computation, report generation, and robust error handling. Needs to follow existing patterns precisely.
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures clean procedural code, proper error handling, consistent formatting
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser automation, this is a server-to-server script

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Wave 1)
  - **Blocks**: Final Verification Wave (F1-F4)
  - **Blocked By**: Task 1 (input templates), Task 2 (script stub with config)

  **References**:

  **Pattern References** (existing code to follow — CRITICAL):
  - `test-data/run-baseline.js:108-254` — **THE primary pattern**: SSE consumption (fetch full text, split lines, parse event/data pairs), handshake auth, progress logging, result collection. Follow this EXACTLY for the `gradeOnce()` function.
  - `test-data/run-baseline.js:113-125` — Handshake token acquisition pattern
  - `test-data/run-baseline.js:148-190` — SSE line-by-line parsing: detect `event:` lines, parse `data:` as JSON, handle `chunk`, `outlier`, `done`, `error` events
  - `test-data/run-baseline.js:192-254` — Result collection, stats computation, and JSON output

  **API/Type References** (contracts to implement against):
  - `grading-server/server.js:246` — Bearer auth middleware: `Authorization: Bearer <token>` header required
  - `grading-server/server.js:1482-1560` — `/api/grade` endpoint: request body schema, SSE event names (`chunk`, `sweep`, `outlier`, `done`, `error`), response data shapes
  - `grading-server/server.js:1559` — Outlier detection always runs (even with sweep: none) — this is why we track rawScore vs score

  **Data References** (output format):
  - `test-data/baseline.json` — Example output shape: `{ timestamp, provider, model, studentCount, elapsedSeconds, stats: { mean, stdDev, outliers, adjusted }, results: [{ index, name, score, feedback, adjusted }] }`. The benchmark JSON output extends this pattern with multi-model multi-run nesting.

  **WHY Each Reference Matters**:
  - `run-baseline.js` is the ONLY working example of calling `/api/grade` from a script — the SSE parsing is non-trivial (not standard EventSource, manual text parsing) and must be replicated exactly or results will be silently wrong
  - `server.js` auth: Without the Bearer token, every request returns 401 — this is the #1 failure mode
  - `server.js` outlier: Understanding that outlier detection creates non-deterministic adjustments is critical for the statistics — raw scores must be tracked separately for consistency metrics
  - `baseline.json`: The output shape is established convention — follow it so results can be compared with existing baselines

  **Acceptance Criteria**:

  - [ ] Script runs to completion with server running and at least 1 configured model
  - [ ] On server-not-running: fails with clear error message mentioning server/health
  - [ ] On missing input files: fails with clear error message mentioning the file path
  - [ ] On model failure mid-benchmark: logs error, skips that run, continues with remaining models
  - [ ] `benchmark-results.json` has valid JSON with `models`, `comparison.perModel`, `comparison.perStudent`, `comparison.agreement`, `comparison.flagged`
  - [ ] `benchmark-report.md` has all 5 sections: Header, Per-Model Summary, Score Matrix, Agreement, Flagged Disagreements
  - [ ] Progress logging shows `[Model M/N] [Run R/N]` format

  **QA Scenarios:**

  ```
  Scenario: Script fails gracefully when server is not running
    Tool: Bash (bun)
    Preconditions: Grading server is NOT running on localhost:3456
    Steps:
      1. Run: bun run test-data/run-benchmark.js 2>&1
    Expected Result: Error message containing "server" or "health" or "connect", exit code non-zero
    Failure Indicators: Script hangs, crashes with unhandled exception, or silently succeeds
    Evidence: .sisyphus/evidence/task-3-server-not-running.txt

  Scenario: Script fails gracefully when input files are missing
    Tool: Bash (bun)
    Preconditions: Grading server is running, but captured-students.json does not exist (rename temporarily)
    Steps:
      1. Rename: mv test-data/captured-students.json test-data/captured-students.json.bak
      2. Run: bun run test-data/run-benchmark.js 2>&1
      3. Restore: mv test-data/captured-students.json.bak test-data/captured-students.json
    Expected Result: Error message mentioning "captured-students.json", exit code non-zero
    Failure Indicators: Script hangs, crashes with unhandled ENOENT, or tries to grade with no students
    Evidence: .sisyphus/evidence/task-3-missing-input.txt

  Scenario: Full benchmark run with at least 1 model produces valid outputs
    Tool: Bash (bun)
    Preconditions: Grading server running, at least 1 model configured, captured-students.json has real data
    Steps:
      1. Run: bun run test-data/run-benchmark.js 2>&1 | tee .sisyphus/evidence/task-3-full-run.txt
      2. Verify JSON: bun -e "const d=JSON.parse(require('fs').readFileSync('test-data/benchmark-results.json','utf8')); console.assert(d.timestamp); console.assert(d.models.length >= 1); console.assert(d.comparison.perModel.length >= 1); console.assert(d.comparison.perStudent.length >= 1); console.log('PASS: JSON output valid')"
      3. Verify report: bun -e "const md=require('fs').readFileSync('test-data/benchmark-report.md','utf8'); console.assert(md.includes('Per-Model Summary')); console.assert(md.includes('Score Matrix')); console.assert(md.includes('Agreement')); console.assert(md.includes('Flagged')); console.log('PASS: Report has all sections')"
    Expected Result: All three steps pass, progress logs show [Model M/N] [Run R/N] format
    Failure Indicators: JSON parse errors, missing report sections, no progress logging
    Evidence: .sisyphus/evidence/task-3-full-run.txt, .sisyphus/evidence/task-3-json-valid.txt, .sisyphus/evidence/task-3-report-valid.txt

  Scenario: Script handles model failure gracefully (skip and continue)
    Tool: Bash (bun)
    Preconditions: Grading server running, CONFIG.models includes a non-existent model (e.g., 'fake-model-xyz')
    Steps:
      1. Temporarily add { provider: 'ollama', model: 'fake-model-xyz', label: 'Fake' } to CONFIG.models
      2. Run: bun run test-data/run-benchmark.js 2>&1
    Expected Result: Script logs error for fake model, continues with other models, produces partial results
    Failure Indicators: Script aborts entirely, no output files generated
    Evidence: .sisyphus/evidence/task-3-model-failure.txt
  ```

  **Commit**: YES
  - Message: `feat(test-data): implement multi-model consistency benchmark runner`
  - Files: `test-data/run-benchmark.js`
  - Pre-commit: QA scenarios 1-2 (no-server and missing-input, which don't require a running model)


## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Review `test-data/run-benchmark.js` for: unused variables, missing error handling, hardcoded values that should be configurable, console.log formatting consistency. Check AI slop: excessive comments, over-abstraction, generic names. Verify it follows the `run-baseline.js` pattern for SSE parsing and auth.
  Output: `Lint [PASS/FAIL] | Pattern Match [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start grading server. Run the benchmark script with at least 1 model configured. Verify: JSON output has correct structure, markdown report has all 4 sections, progress logging works, failure handling works (test with a non-existent model). Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual file. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted files or changes.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(test-data): add benchmark input templates` — captured-rubric.json, captured-students.json
- **Wave 2**: `feat(test-data): add multi-model consistency benchmark script` — run-benchmark.js
- **Post-run** (manual, not automated): Results and reports are gitignored or committed at user discretion

---

## Success Criteria

### Verification Commands
```bash
# Templates are valid JSON
bun -e "JSON.parse(require('fs').readFileSync('test-data/captured-rubric.json','utf8'))"
bun -e "const s=JSON.parse(require('fs').readFileSync('test-data/captured-students.json','utf8')); console.assert(Array.isArray(s))"

# Script parses without error
bun run test-data/run-benchmark.js 2>&1 | head -5

# After a real run:
test -f test-data/benchmark-results.json && echo "Results exist"
test -f test-data/benchmark-report.md && echo "Report exists"
bun -e "const d=JSON.parse(require('fs').readFileSync('test-data/benchmark-results.json','utf8')); console.assert(d.models); console.assert(d.comparison)"
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Script runs end-to-end against live server
- [x] Report contains all 4 sections
- [x] Tolerance is configurable
