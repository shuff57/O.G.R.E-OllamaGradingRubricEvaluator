# Prompt Optimization for Cross-Model Grading Consistency

## TL;DR

> **Quick Summary**: Restructure O.G.R.E.'s grading prompts from an opinionated "grade generously" base into a tiered architecture with a neutral philosophy, early-positioned custom instruction overrides, normalized generation parameters, and comprehensive consistency testing across model sizes.
> 
> **Deliverables**:
> - Neutral grading philosophy replacing 15-bullet generous base
> - Tiered prompt architecture across ALL grading prompt builders (batch, single, outlier)
> - Custom instructions positioned for maximum model adherence (before philosophy, not after)
> - Temperature normalization across all 5 provider types
> - Unified scoring scale descriptors (batch ↔ single)
> - Synthetic test fixtures from 3 diverse subjects
> - Extended benchmark with prompt variant comparison
> - Vitest regression tests for prompt structure and provider params
> - Frozen baseline + comparison report measuring improvement
> - Fine-tuning decision analysis (Phase 2 go/no-go)
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: T1 (baseline) → T6 (restructure inject) → T9 (batch prompt) → T13 (bundle sync) → T14 (comparison benchmark) → T16 (decision report)

---

## Context

### Original Request
Optimize grading prompts for increased consistency across all models including smaller ~120B models. Allow custom instructions that override aspects of the base prompt (e.g., "grade generously" overriding a default "strict" philosophy). Investigate whether better prompts are sufficient or fine-tuning is needed.

### Interview Summary
**Key Discussions**:
- GRADING_PHILOSOPHY must become neutral — teacher's custom instructions shape the grading tone
- Target: 90%+ pairwise agreement at ±1.0 across 3-4 representative models
- Focus models: GPT-OSS 120B (small-dense), GLM-5 (mid MoE), Sonnet 4.6 (flagship)
- Custom instructions cover both tone (lenient/strict) AND rubric focus (no formula penalty)
- Existing presets in BatchPanel.svelte (Non-Zero, Lenient, Strict, Skip No Response, No Formula Penalty)
- Test strategy: extend run-benchmark.js + Vitest prompt regression tests
- Fine-tuning as Phase 2 if prompt optimization insufficient

**Research Findings**:
- GPT-OSS 120B = 117B dense (all active); Qwen3.5-122B = 122B total but only 10B active (MoE)
- Smaller models need concise prompts with delimited blocks; XML tags more reliable than JSON for structure
- Temperature normalization critical — providers use different defaults (Ollama: 0.8, OpenAI: 1.0)
- Chain-of-Rubrics (per-criterion evaluation) improves scoring consistency

### Metis Review
**Identified Gaps** (addressed):
- **Server-bundle dual copy**: Both `grading-server/` and `ogre-desktop/src-tauri/binaries/server-bundle/` have identical copies — MUST sync after changes
- **Score deflation risk**: Removing generous philosophy = lower default scores. Mitigated: add "Balanced" preset recommendation
- **3 injection vectors for custom instructions**: Simple append, SCORING CALIBRATION prefix split, ADDITIONAL GRADING INSTRUCTIONS in essayPrompt — all must survive
- **Scoring scale descriptor divergence**: batch score 8 = "Proficient" vs single score 8 = "Good" — MUST unify
- **Sweep prompts don't use philosophy**: buildCompactSweepPrompt and buildPairwiseSweepPrompts are consistency-review, not grading — keep as-is
- **Benchmark has per-model customInstructions**: GLM-5 gets generous tuning, Minimax gets strict — baseline must run WITHOUT these for fair comparison

---

## Work Objectives

### Core Objective
Replace the opinionated "grade generously" prompt architecture with a tiered system where a neutral base philosophy is shaped by teacher-controlled custom instructions, achieving 90%+ cross-model agreement at ±1.0 tolerance.

### Concrete Deliverables
- Modified `grading-constants.js`: Neutral philosophy (≤8 bullet points, zero directional words)
- Modified `grading.js`: All 3 grading prompt builders use tiered architecture with early custom instruction injection
- Modified `providers.js`: Temperature parameter (default 0.2) in all 5 provider request builders
- New test fixtures: `test-data/test-biology-students.json`, `test-data/test-history-students.json`, `test-data/test-biology-rubric.json`, `test-data/test-history-rubric.json`
- Extended `test-data/run-benchmark.js`: Prompt variant support, ±1.0 tolerance default
- New Vitest tests: Prompt structure ordering, temperature presence, custom instruction positioning
- Benchmark reports: `test-data/baseline-frozen.json` (before), `test-data/benchmark-optimized.json` (after)
- Decision report: Fine-tuning go/no-go based on measured improvement

### Definition of Done
- [x] `bun test --run` in `grading-server/` → 0 failures
- [x] All pairwise agreement ≥ 90% at ±1.0 across 3 target models (or documented gap for Phase 2)
- [x] Custom instruction "Grade very leniently" produces mean score within 0.5 of current generous baseline
- [x] `diff` between grading-server/ and server-bundle/ files → empty output for all modified files

### Must Have
- Neutral philosophy with zero directional language
- Custom instructions positioned BEFORE philosophy in all prompts
- Temperature 0.2 default across all providers
- Frozen baseline captured BEFORE any prompt changes
- Server-bundle sync after all modifications

### Must NOT Have (Guardrails)
- MUST NOT modify response parsing (`parseBatchResponse`, `parseSingleGradeResponse`, `validateBatchResults`)
- MUST NOT change virtual-10 scale logic (`getScaleInfo()`, `snapScore()`)
- MUST NOT change scoring anchor percentages in `computeScoringAnchors()`
- MUST NOT add structured output / JSON mode to provider calls (separate concern)
- MUST NOT add prompt token counting or dynamic truncation logic
- MUST NOT modify sweep prompt builders (they don't use philosophy and serve a different purpose)
- MUST NOT break `SCORING CALIBRATION:` prefix parsing in `injectCustomInstructions()`
- MUST NOT break `ADDITIONAL GRADING INSTRUCTIONS` extraction from `essayPrompt`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest in `grading-server/test/`)
- **Automated tests**: Tests-after (add tests for new structure, run existing tests for regression)
- **Framework**: Vitest (matches existing `grading-server/test/`)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Prompt structure**: Vitest — assert section ordering, content presence, custom instruction position
- **Provider params**: Vitest — assert temperature in all request builders
- **Benchmark**: Bash — run benchmark, parse report, assert agreement percentages
- **Bundle sync**: Bash — diff commands between source and bundle directories

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — baseline + foundation):
├── Task 1: Capture frozen baseline benchmark [quick]
├── Task 2: Create synthetic test fixtures (biology + history) [unspecified-high]
├── Task 3: Rewrite GRADING_PHILOSOPHY to neutral [deep]
├── Task 4: Add temperature parameter to all providers [quick]
└── Task 5: Define unified scoring scale descriptors [quick]

Wave 2 (After Wave 1 — injection restructure + early tests):
├── Task 6: Restructure injectCustomInstructions for early positioning (depends: 3) [deep]
├── Task 7: Add Vitest temperature/provider tests (depends: 4) [quick]
└── Task 8: Extend benchmark for variant testing (depends: 2) [unspecified-high]

Wave 3 (After Wave 2 — prompt rewrites, MAX PARALLEL):
├── Task 9: Rewrite buildBatchPrompt with tiered architecture (depends: 3, 5, 6) [deep]
├── Task 10: Rewrite buildSingleGradePrompt with tiered architecture (depends: 3, 5, 6) [deep]
└── Task 11: Rewrite buildOutlierReviewPrompt with tiered architecture (depends: 3, 5, 6) [deep]

Wave 4 (After Wave 3 — tests + sync):
├── Task 12: Add Vitest prompt structure regression tests (depends: 9, 10, 11) [unspecified-high]
└── Task 13: Sync server-bundle copies + verify parity (depends: 3, 4, 9, 10, 11) [quick]

Wave 5 (After Wave 4 — benchmark + validation):
├── Task 14: Run comparison benchmark on 3 target models (depends: 1, 8, 13) [unspecified-high]
└── Task 15: Custom instruction override effectiveness test (depends: 14) [deep]

Wave 6 (After Wave 5 — decision):
└── Task 16: Fine-tuning decision analysis (depends: 14, 15) [writing]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T6 → T9 → T13 → T14 → T16 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 14 | 1 |
| 2 | — | 8 | 1 |
| 3 | — | 6, 9, 10, 11, 13 | 1 |
| 4 | — | 7, 13 | 1 |
| 5 | — | 9, 10, 11 | 1 |
| 6 | 3 | 9, 10, 11 | 2 |
| 7 | 4 | — | 2 |
| 8 | 2 | 14 | 2 |
| 9 | 3, 5, 6 | 12, 13 | 3 |
| 10 | 3, 5, 6 | 12, 13 | 3 |
| 11 | 3, 5, 6 | 12, 13 | 3 |
| 12 | 9, 10, 11 | — | 4 |
| 13 | 3, 4, 9, 10, 11 | 14 | 4 |
| 14 | 1, 8, 13 | 15, 16 | 5 |
| 15 | 14 | 16 | 5 |
| 16 | 14, 15 | — | 6 |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1 `quick`, T2 `unspecified-high`, T3 `deep`, T4 `quick`, T5 `quick`
- **Wave 2**: 3 tasks — T6 `deep`, T7 `quick`, T8 `unspecified-high`
- **Wave 3**: 3 tasks — T9 `deep`, T10 `deep`, T11 `deep`
- **Wave 4**: 2 tasks — T12 `unspecified-high`, T13 `quick`
- **Wave 5**: 2 tasks — T14 `unspecified-high`, T15 `deep`
- **Wave 6**: 1 task — T16 `writing`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs


### Wave 1 — Baseline + Foundation (Start Immediately)

- [x] 1. Capture Frozen Baseline Benchmark

  **What to do**:
  - Run `run-benchmark.js` with CURRENT prompts (no modifications) on 3 target models: GPT-OSS 120B, GLM-5, Sonnet 4.6
  - Use `--only=GPT-OSS,GLM-5,Sonnet` flag to select models
  - Use `--tolerance=1` to get ±1.0 agreement metrics
  - CRITICAL: Remove per-model `customInstructions` from CONFIG for fair comparison (comment them out, don't delete)
  - Save results to `test-data/baseline-frozen.json` and `test-data/baseline-frozen.md`
  - Document: current mean scores, pairwise agreement %, and flagged disagreements

  **Must NOT do**:
  - Must NOT modify any grading code — this is a measurement-only task
  - Must NOT delete per-model customInstructions — only comment them out temporarily for the run

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Task 14 (comparison benchmark needs this baseline)
  - **Blocked By**: None

  **References**:
  - `test-data/run-benchmark.js:31-55` — CONFIG object with models array and output paths
  - `test-data/run-benchmark.js:57-62` — `--only=` filter flag implementation
  - `test-data/benchmark-report.md` — Example output format (current GLM-5 vs Sonnet report)
  - `test-data/captured-students.json` — 25 real student responses (input data)
  - `test-data/captured-rubric.json` — Chi-square stats rubric (input data)

  **Acceptance Criteria**:
  - [ ] `test-data/baseline-frozen.json` exists with results from 3 models × 3 runs
  - [ ] `test-data/baseline-frozen.md` contains Per-Model Summary, Score Matrix, Pairwise Agreement tables
  - [ ] All 3 model runs succeeded (no null entries in results)

  **QA Scenarios:**
  ```
  Scenario: Baseline benchmark completes successfully
    Tool: Bash
    Preconditions: Grading server running on localhost:3456, all 3 models accessible via Ollama
    Steps:
      1. Comment out customInstructions in run-benchmark.js CONFIG.models entries
      2. Run: bun run test-data/run-benchmark.js --only=GPT-OSS,GLM-5,Sonnet --tolerance=1 --output=test-data/baseline-frozen.json
      3. Verify output files exist: ls test-data/baseline-frozen.json test-data/baseline-frozen.md
      4. Parse baseline-frozen.json: verify stats.perModel has exactly 3 model entries
      5. Verify each model has successfulRuns >= 2 (allow 1 failure)
    Expected Result: Both output files exist, 3 models with 2-3 successful runs each
    Failure Indicators: Missing output files, null entries in rawResults, 0 successful runs for any model
    Evidence: .sisyphus/evidence/task-1-baseline-complete.txt
  ```

  **Commit**: YES
  - Message: `chore(test-data): capture frozen baseline benchmark`
  - Files: `test-data/baseline-frozen.json`, `test-data/baseline-frozen.md`
  - Pre-commit: `ls test-data/baseline-frozen.json`

- [x] 2. Create Synthetic Test Fixtures (Biology + History)

  **What to do**:
  - Create 2 new test datasets representing diverse subject areas beyond chi-square statistics:
    - **Biology**: Photosynthesis essay (15-20 synthetic student responses spanning quality 0-10)
    - **History**: Civil War cause analysis essay (15-20 synthetic student responses spanning quality 0-10)
  - For each subject, create:
    - `test-data/test-{subject}-rubric.json` — Rubric matching captured-rubric.json schema (essayPrompt, checklistItems, rubricItems, modelText, maxScore)
    - `test-data/test-{subject}-students.json` — Array of {index, name, response} objects
  - Student responses MUST span the full quality range: 2-3 empty/joke responses, 3-4 minimal (1-3 pts), 4-5 partial (4-6 pts), 3-4 strong (7-9 pts), 2-3 excellent (9-10 pts)
  - Include edge cases: partial understanding with wrong conclusion, correct answer with no explanation, copy of model text, response to wrong question

  **Must NOT do**:
  - Must NOT generate all responses at the same quality level (AI-generated 'bad' work tends to be obviously bad)
  - Must NOT use the same rubric structure as the chi-square rubric — diversify categories

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 8 (benchmark variant testing needs these fixtures)
  - **Blocked By**: None

  **References**:
  - `test-data/captured-rubric.json` — Schema to match: {essayPrompt, checklistItems, rubricItems, modelText, maxScore}
  - `test-data/captured-students.json` — Schema to match: [{index, name, response}, ...]
  - `versions.json` — Additional rubric/student examples across 3 question versions

  **Acceptance Criteria**:
  - [ ] `test-data/test-biology-rubric.json` is valid JSON matching captured-rubric.json schema
  - [ ] `test-data/test-biology-students.json` is valid JSON array with 15-20 entries
  - [ ] `test-data/test-history-rubric.json` is valid JSON matching captured-rubric.json schema
  - [ ] `test-data/test-history-students.json` is valid JSON array with 15-20 entries
  - [ ] Student responses span 0-10 quality range (at least 3 minimal, 4 partial, 3 strong)

  **QA Scenarios:**
  ```
  Scenario: Synthetic fixtures are valid and diverse
    Tool: Bash (bun/node)
    Preconditions: None
    Steps:
      1. Parse each JSON file: bun -e "JSON.parse(require('fs').readFileSync('test-data/test-biology-rubric.json','utf-8'))"
      2. Verify rubric has required fields: essayPrompt, checklistItems (array), rubricItems (array), maxScore
      3. Verify students array has length >= 15
      4. Count students with response.length < 20 (minimal/empty) — expect >= 3
      5. Count students with response.length > 200 (detailed) — expect >= 3
    Expected Result: All 4 files parse, rubrics have required fields, students span quality range
    Failure Indicators: JSON parse error, missing required fields, all responses similar length
    Evidence: .sisyphus/evidence/task-2-fixture-validation.txt
  ```

  **Commit**: YES
  - Message: `test(test-data): add synthetic biology and history test fixtures`
  - Files: `test-data/test-biology-*.json`, `test-data/test-history-*.json`

- [x] 3. Rewrite GRADING_PHILOSOPHY to Neutral

  **What to do**:
  - Replace the entire `GRADING_PHILOSOPHY` constant in `grading-server/grading-constants.js`
  - Current: 15 bullet points all pushing "grade generously" (mentions "full credit", "at least 60%", "round UP", "benefit of the doubt" etc.)
  - New: ≤8 bullet points expressing a neutral, rubric-aligned grading stance:
    - Grade strictly against the rubric criteria provided
    - Award credit proportional to how thoroughly each criterion is addressed
    - Evaluate what the student DID demonstrate, not what they omitted
    - Use the full scoring range — do not compress toward the middle
    - Treat the scoring anchors as calibration reference points
    - Empty or off-topic responses receive 0
    - If no custom instructions are provided, grade neutrally based solely on rubric alignment
    - The instructor's custom instructions (if any) take absolute precedence over this philosophy
  - CRITICAL: The new philosophy MUST contain ZERO directional words: no "generous", "lenient", "strict", "round up", "at least X%", "benefit of the doubt"
  - Export as `GRADING_PHILOSOPHY` (same export name for backward compatibility)

  **Must NOT do**:
  - Must NOT rename the export (it's imported across multiple files)
  - Must NOT include ANY opinion about leniency or strictness — that's the teacher's job via custom instructions
  - Must NOT touch `SCORING_SCALE` or any other export in grading-constants.js

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Tasks 6, 9, 10, 11, 13
  - **Blocked By**: None

  **References**:
  - `grading-server/grading-constants.js` — Current GRADING_PHILOSOPHY (entire file)
  - `grading-server/grading.js:119-120` — Where GRADING_PHILOSOPHY is injected into batch prompt
  - `grading-server/grading.js:750-751` — Where GRADING_PHILOSOPHY is injected into single prompt
  - `grading-server/grading.js:502-503` — Where GRADING_PHILOSOPHY is injected into outlier prompt
  - Librarian research finding: "Philosophy must be ≤8 bullets for smaller model attention budget"

  **Acceptance Criteria**:
  - [ ] `GRADING_PHILOSOPHY` exported from `grading-constants.js`
  - [ ] ≤8 bullet points in new philosophy
  - [ ] `grep -ci 'generous\|lenient\|strict\|round up\|at least.*%\|benefit' grading-server/grading-constants.js` → 0 matches
  - [ ] Contains phrase "custom instructions" or "instructor" (acknowledges override mechanism)
  - [ ] `bun test --run` in `grading-server/` passes (existing tests)

  **QA Scenarios:**
  ```
  Scenario: Philosophy is neutral and concise
    Tool: Bash
    Steps:
      1. Count bullet points: grep -c '^  -\|^- ' grading-server/grading-constants.js | expect <= 8
      2. Check for forbidden words: grep -ci 'generous\|lenient\|strict\|round up\|benefit of the doubt\|at least.*60' grading-server/grading-constants.js | expect 0
      3. Check for required content: grep -c 'custom instructions\|instructor' grading-server/grading-constants.js | expect >= 1
      4. Run existing tests: cd grading-server && bun test --run | expect all pass
    Expected Result: ≤8 bullets, 0 directional words, mentions custom instructions, tests pass
    Evidence: .sisyphus/evidence/task-3-neutral-philosophy.txt

  Scenario: Philosophy doesn't break existing prompt builders
    Tool: Bash
    Steps:
      1. Run: cd grading-server && bun test --run
      2. Verify: all test suites pass (prompts.test.js, grading.test.js)
    Expected Result: 0 failures
    Failure Indicators: "GRADING PHILOSOPHY" assertion failure in prompts.test.js
    Evidence: .sisyphus/evidence/task-3-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `refactor(grading): replace generous philosophy with neutral rubric-aligned base`
  - Files: `grading-server/grading-constants.js`
  - Pre-commit: `cd grading-server && bun test --run`


- [x] 4. Add Temperature Parameter to All Providers

  **What to do**:
  - Add `temperature` parameter to ALL 5 provider request builders in `grading-server/providers.js`:
    - `buildOllamaRequest()` — add `options: { temperature: 0.2 }` to request body
    - `buildOpenAIRequest()` — add `temperature: 0.2` to request body
    - `buildAnthropicRequest()` — add `temperature: 0.2` to request body
    - `buildGoogleGeminiRequest()` — add `generationConfig: { temperature: 0.2 }` to request body
    - `buildGitHubModelsRequest()` — add `temperature: 0.2` to request body (OpenAI-compatible)
  - Default temperature: 0.2 (deterministic enough for grading, avoids degenerate outputs at 0.0)
  - Make temperature configurable: accept optional `temperature` field in provider config, fallback to 0.2
  - Also accept `temperature` in the `/api/grade` request body and pass through to provider

  **Must NOT do**:
  - Must NOT change any other request body fields (model, messages, max_tokens, stream)
  - Must NOT add other generation parameters (top_p, top_k, etc.) unless explicitly requested later

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Tasks 7, 13
  - **Blocked By**: None

  **References**:
  - `grading-server/providers.js` — All 5 `build*Request()` functions and their request body shapes
  - `grading-server/server.js:1315-1340` — Where `callProviderDirect()` is called (passes provider config)
  - Ollama API docs: `options.temperature` in chat request body
  - OpenAI API docs: `temperature` at top level of chat completion request
  - Anthropic API docs: `temperature` at top level of messages request
  - Google Gemini API docs: `generationConfig.temperature` in generateContent request

  **Acceptance Criteria**:
  - [ ] All 5 `build*Request()` functions include temperature in their output body
  - [ ] Default temperature is 0.2 when not explicitly configured
  - [ ] `bun test --run` in `grading-server/` passes

  **QA Scenarios:**
  ```
  Scenario: Temperature is present in all provider request bodies
    Tool: Bash (bun test)
    Steps:
      1. Run: cd grading-server && bun test --run
      2. Grep providers.js for temperature: grep -c 'temperature' grading-server/providers.js | expect >= 5
    Expected Result: Tests pass, temperature appears in all 5 builder functions
    Evidence: .sisyphus/evidence/task-4-temperature-added.txt
  ```

  **Commit**: YES
  - Message: `feat(providers): add temperature normalization (default 0.2) across all providers`
  - Files: `grading-server/providers.js`
  - Pre-commit: `cd grading-server && bun test --run`

- [x] 5. Define Unified Scoring Scale Descriptors

  **What to do**:
  - Currently `buildBatchPrompt` and `buildSingleGradePrompt` have DIFFERENT scoring scale descriptors:
    - Batch score 8: "Proficient: correctly addresses ALL rubric criteria, even if briefly or concisely"
    - Single score 8: "Good: solid understanding with only minor gaps or imprecision"
  - Unify into a SINGLE set of scoring scale descriptors used by ALL grading prompt builders
  - Extract the unified descriptors into a new exported constant in `grading-constants.js` (e.g., `SCORING_SCALE_DESCRIPTORS`)
  - Update `getScaleInfo()` in `grading.js` to use this shared constant
  - Descriptors must be neutral (no directional language) and model-size-friendly (≤15 words per level)

  **Must NOT do**:
  - Must NOT change the virtual-10 scale logic (0-10 integers)
  - Must NOT change `snapScore()` or descaling math
  - Must NOT change the number of scale levels (keep 0-10)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 9, 10, 11
  - **Blocked By**: None

  **References**:
  - `grading-server/grading.js:373-425` — `getScaleInfo()` function (batch scale)
  - `grading-server/grading.js:760-800` — Scoring scale text in `buildSingleGradePrompt`
  - `grading-server/grading-constants.js` — Where new shared constant should live

  **Acceptance Criteria**:
  - [ ] `SCORING_SCALE_DESCRIPTORS` or equivalent exported from `grading-constants.js`
  - [ ] Both `buildBatchPrompt` and `buildSingleGradePrompt` use the SAME descriptors
  - [ ] Descriptors contain zero directional language
  - [ ] `bun test --run` passes

  **QA Scenarios:**
  ```
  Scenario: Scale descriptors are unified
    Tool: Bash
    Steps:
      1. Verify constant exists: grep 'SCORING_SCALE\|SCALE_DESC' grading-server/grading-constants.js | expect >= 1
      2. Verify batch prompt uses it: grep 'SCORING_SCALE\|scaleInfo\|SCALE_DESC' grading-server/grading.js | expect >= 2 (batch + single)
      3. Run tests: cd grading-server && bun test --run
    Expected Result: Shared constant exists, used in both builders, tests pass
    Evidence: .sisyphus/evidence/task-5-unified-scale.txt
  ```

  **Commit**: YES (group with T3)
  - Message: `refactor(grading): unify scoring scale descriptors across batch/single`
  - Files: `grading-server/grading-constants.js`, `grading-server/grading.js`

### Wave 2 — Injection Restructure + Early Tests

- [x] 6. Restructure injectCustomInstructions for Early Positioning

  **What to do**:
  - Redesign `injectCustomInstructions()` in `grading-server/grading.js` to support the tiered architecture:
    - CURRENT: Appends custom instructions at END of prompt as "INSTRUCTOR OVERRIDE"
    - NEW: Returns structured sections that prompt builders insert at the correct tier position
  - New approach: Instead of appending to final prompt, `injectCustomInstructions()` should return an object:
    ```
    { calibration: string | null, overrideInstructions: string | null }
    ```
  - Prompt builders then insert `overrideInstructions` BEFORE the philosophy section and `calibration` in the scoring section
  - PRESERVE existing special paths:
    1. `SCORING CALIBRATION:` prefix — still splits into calibration + override parts
    2. `ADDITIONAL GRADING INSTRUCTIONS` extraction from essayPrompt — still works
  - All 3 grading prompt builders must call this function and insert results at correct positions

  **Must NOT do**:
  - Must NOT change the function signature in a way that breaks existing callers without updating them
  - Must NOT lose the SCORING CALIBRATION special handling
  - Must NOT change what information is extracted — only WHERE it's placed in the prompt

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Tasks 9, 10, 11
  - **Blocked By**: Task 3 (needs neutral philosophy to know what sections exist)

  **References**:
  - `grading-server/grading.js:16-48` — Current `injectCustomInstructions()` function
  - `grading-server/grading.js:111-115` — `ADDITIONAL GRADING INSTRUCTIONS` extraction from essayPrompt
  - `grading-server/grading.js:249` — Where injection is called in `buildBatchPrompt`
  - `grading-server/grading.js:807` — Where injection is called in `buildSingleGradePrompt`
  - `grading-server/grading.js:599-600` — Where injection is called in `buildOutlierReviewPrompt`
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:546-549` — How instructions are combined before sending
  - Metis finding: "3 injection vectors must all survive the restructure"

  **Acceptance Criteria**:
  - [ ] `injectCustomInstructions()` returns structured object (not appended string)
  - [ ] All 3 grading prompt builders updated to use new return format
  - [ ] `SCORING CALIBRATION:` prefix path still correctly splits calibration from override
  - [ ] `bun test --run` passes

  **QA Scenarios:**
  ```
  Scenario: Custom instructions appear BEFORE philosophy in batch prompt
    Tool: Bash (bun REPL)
    Steps:
      1. In bun REPL, import buildBatchPrompt from grading.js
      2. Call with mock rubric + customInstructions: "Grade very leniently"
      3. Find index of "Grade very leniently" in output
      4. Find index of GRADING_PHILOSOPHY content (e.g., "rubric criteria") in output
      5. Assert: custom instructions index < philosophy index
    Expected Result: Custom instructions appear before philosophy section
    Evidence: .sisyphus/evidence/task-6-injection-order.txt

  Scenario: SCORING CALIBRATION prefix still works
    Tool: Bash (bun REPL)
    Steps:
      1. Call injectCustomInstructions with: "SCORING CALIBRATION:\nExcellent (9/10): Perfect\n\nGrade strictly"
      2. Verify result has calibration field containing "Excellent (9/10)"
      3. Verify result has overrideInstructions field containing "Grade strictly"
    Expected Result: Calibration and override correctly separated
    Evidence: .sisyphus/evidence/task-6-calibration-split.txt
  ```

  **Commit**: YES
  - Message: `refactor(grading): restructure custom instruction injection for tiered positioning`
  - Files: `grading-server/grading.js`
  - Pre-commit: `cd grading-server && bun test --run`


- [x] 7. Add Vitest Temperature/Provider Tests

  **What to do**:
  - Add new test file `grading-server/test/providers.test.js` with tests verifying:
    - Each of the 5 `build*Request()` functions includes `temperature` in output body
    - Default temperature is 0.2 when not explicitly configured
    - Custom temperature from config overrides the default
  - Follow existing test patterns from `grading-server/test/prompts.test.js`

  **Recommended Agent Profile**: `quick` | **Skills**: []
  **Parallelization**: Wave 2 (with 6, 8) | **Blocked By**: T4 | **Blocks**: None

  **References**:
  - `grading-server/test/prompts.test.js` — Test pattern to follow
  - `grading-server/providers.js` — Functions to test

  **Acceptance Criteria**:
  - [ ] `grading-server/test/providers.test.js` exists with ≥5 test cases (1 per provider)
  - [ ] `bun test --run` in `grading-server/` passes with new + existing tests

  **QA Scenarios:**
  ```
  Scenario: Provider temperature tests all pass
    Tool: Bash
    Steps:
      1. Run: cd grading-server && bun test --run test/providers.test.js
      2. Verify: 5+ tests pass, 0 failures
    Expected Result: All provider temperature tests pass
    Evidence: .sisyphus/evidence/task-7-provider-tests.txt
  ```

  **Commit**: YES (group with T12)
  - Message: `test(grading): add provider temperature and prompt structure tests`
  - Files: `grading-server/test/providers.test.js`

- [x] 8. Extend Benchmark for Prompt Variant Testing

  **What to do**:
  - Add support to `test-data/run-benchmark.js` for:
    - Multiple rubric/student datasets: add `--dataset=biology|history|stats` flag
    - Default `--tolerance=1` (currently 0.5 tolerance is the implicit default in ±0.5)
    - Summary metrics across datasets: aggregate agreement % across all test sets
  - Add new CONFIG fields: `datasets` array with paths to rubric + student files
  - Ensure backward compatibility: existing behavior (captured-students/rubric) still works with no flags

  **Recommended Agent Profile**: `unspecified-high` | **Skills**: []
  **Parallelization**: Wave 2 (with 6, 7) | **Blocked By**: T2 | **Blocks**: T14

  **References**:
  - `test-data/run-benchmark.js:31-55` — Current CONFIG structure
  - `test-data/run-benchmark.js:116-134` — loadInputs() function to extend

  **Acceptance Criteria**:
  - [ ] `--dataset=biology` flag loads `test-data/test-biology-rubric.json` and `test-data/test-biology-students.json`
  - [ ] Default behavior unchanged when no `--dataset` flag
  - [ ] Default tolerance changed to 1.0 (was implicit 0.5 in reports)

  **QA Scenarios:**
  ```
  Scenario: Dataset flag loads correct fixtures
    Tool: Bash
    Steps:
      1. Run: bun run test-data/run-benchmark.js --dataset=biology --only=GLM-5 --output=test-data/test-bio-run.json 2>&1 | head -20
      2. Verify output mentions "biology" in loaded students/rubric
      3. Verify test-bio-run.json exists
    Expected Result: Biology dataset loads and benchmark runs
    Evidence: .sisyphus/evidence/task-8-dataset-flag.txt
  ```

  **Commit**: YES
  - Message: `feat(benchmark): add multi-dataset and tolerance support`
  - Files: `test-data/run-benchmark.js`

### Wave 3 — Prompt Rewrites (MAX PARALLEL)

- [x] 9. Rewrite buildBatchPrompt with Tiered Architecture

  **What to do**:
  - Restructure `buildBatchPrompt()` in `grading-server/grading.js` to follow the tiered prompt layout:
    ```
    TIER 1: ROLE + FORMAT CONSTRAINTS (JSON output, response structure, max score)
    TIER 2: CUSTOM INSTRUCTIONS (from restructured injectCustomInstructions, if any)
    TIER 3: NEUTRAL PHILOSOPHY (from new GRADING_PHILOSOPHY)
    TIER 4: RUBRIC CONTENT (essay prompt, checklist, rubric items, model text)
    TIER 5: SCORING ANCHORS + BRIDGE RESPONSES (calibration examples)
    TIER 6: STUDENT RESPONSES (the actual work to grade)
    TIER 7: FORMAT REINFORCEMENT (re-assert JSON structure, count expectations)
    ```
  - Use clear delimited sections: `### ROLE AND FORMAT ###`, `### INSTRUCTOR INSTRUCTIONS ###`, etc.
  - Keep total prompt concise — aim for 30% token reduction from current
  - Use the unified scoring scale descriptors from Task 5
  - Insert custom instructions from Task 6's restructured function at TIER 2 position

  **Must NOT do**:
  - Must NOT change the JSON response format expected by `parseBatchResponse()`
  - Must NOT change how student data is formatted (index, name, response blocks)
  - Must NOT change bridge response handling logic
  - Must NOT modify `parseBatchResponse()` or scoring validation

  **Recommended Agent Profile**: `deep` | **Skills**: []
  **Parallelization**: Wave 3 (with 10, 11) | **Blocked By**: T3, T5, T6 | **Blocks**: T12, T13

  **References**:
  - `grading-server/grading.js:101-252` — Current `buildBatchPrompt()` function (FULL function)
  - `grading-server/grading.js:262-356` — `parseBatchResponse()` — output format MUST be compatible
  - `grading-server/grading-constants.js` — New GRADING_PHILOSOPHY and SCORING_SCALE_DESCRIPTORS
  - `grading-server/grading.js:16-48` — Restructured `injectCustomInstructions()` from Task 6
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:79-85` — Preset custom instruction examples

  **Acceptance Criteria**:
  - [ ] Prompt contains tiered sections in correct order (custom instructions before philosophy)
  - [ ] Uses unified scoring scale descriptors
  - [ ] JSON response format unchanged (parseBatchResponse still works)
  - [ ] `bun test --run` passes (especially prompts.test.js)

  **QA Scenarios:**
  ```
  Scenario: Batch prompt follows tiered architecture
    Tool: Bash (bun REPL)
    Steps:
      1. Import buildBatchPrompt
      2. Call with mock rubric, students, anchors, and customInstructions: "Be strict"
      3. Find indexOf for: "Be strict", "GRADING_PHILOSOPHY content", "STUDENT", "JSON"
      4. Assert ordering: format < custom < philosophy < student < format_reinforce
    Expected Result: Sections appear in tiered order
    Evidence: .sisyphus/evidence/task-9-batch-tiered.txt

  Scenario: Batch prompt without custom instructions still works
    Tool: Bash (bun REPL)
    Steps:
      1. Call buildBatchPrompt with NO customInstructions (empty string)
      2. Verify prompt still contains philosophy and format sections
      3. Verify no "INSTRUCTOR" section appears
    Expected Result: Prompt works correctly without custom instructions
    Evidence: .sisyphus/evidence/task-9-batch-no-custom.txt
  ```

  **Commit**: YES (group with T10, T11)
  - Message: `refactor(grading): apply tiered prompt architecture to all builders`
  - Files: `grading-server/grading.js`

- [x] 10. Rewrite buildSingleGradePrompt with Tiered Architecture

  **What to do**:
  - Apply same tiered architecture as Task 9 to `buildSingleGradePrompt()` in `grading-server/grading.js`
  - Same tier ordering: Format → Custom Instructions → Philosophy → Rubric → Student Work → Format Reinforce
  - Use unified scoring scale descriptors from Task 5 (replacing divergent "Good" descriptors)
  - Insert custom instructions from Task 6 at TIER 2 position

  **Must NOT do**: Same guardrails as Task 9 + must NOT change `parseSingleGradeResponse()`

  **Recommended Agent Profile**: `deep` | **Skills**: []
  **Parallelization**: Wave 3 (with 9, 11) | **Blocked By**: T3, T5, T6 | **Blocks**: T12, T13

  **References**:
  - `grading-server/grading.js:720-830` — Current `buildSingleGradePrompt()` function
  - All references from Task 9 (shared architecture)

  **Acceptance Criteria**:
  - [ ] Same tiered section ordering as batch prompt
  - [ ] Uses unified scoring scale descriptors (same as batch)
  - [ ] `bun test --run` passes

  **QA Scenarios:** Same pattern as Task 9, adapted for `buildSingleGradePrompt`
  **Commit**: YES (group with T9, T11)

- [x] 11. Rewrite buildOutlierReviewPrompt with Tiered Architecture

  **What to do**:
  - Apply tiered architecture to `buildOutlierReviewPrompt()` in `grading-server/grading.js`
  - This prompt RE-EVALUATES outlier students, so it needs the same philosophy/instructions as the original grading
  - Ensure custom instructions from the original grading request are passed through to outlier review
  - Same tier ordering as Tasks 9/10

  **Must NOT do**: Same guardrails + must NOT change outlier detection logic (`detectOutliers()`)

  **Recommended Agent Profile**: `deep` | **Skills**: []
  **Parallelization**: Wave 3 (with 9, 10) | **Blocked By**: T3, T5, T6 | **Blocks**: T12, T13

  **References**:
  - `grading-server/grading.js:480-610` — Current `buildOutlierReviewPrompt()` function
  - `grading-server/server.js:1612-1620` — Where outlier prompt is called (verify customInstructions passthrough)

  **Acceptance Criteria**:
  - [ ] Same tiered ordering as batch/single prompts
  - [ ] Custom instructions are passed through from original grading request
  - [ ] `bun test --run` passes

  **QA Scenarios:** Same pattern as Tasks 9/10, adapted for outlier prompt
  **Commit**: YES (group with T9, T10)

### Wave 4 — Tests + Sync

- [x] 12. Add Vitest Prompt Structure Regression Tests

  **What to do**:
  - Add comprehensive tests to `grading-server/test/prompts.test.js` verifying:
    - All 3 grading prompts contain tiered sections in correct order
    - Custom instructions (when provided) appear BEFORE philosophy section
    - Custom instructions (when empty) do NOT insert a placeholder section
    - Neutral philosophy text is present and contains zero directional language
    - Unified scoring scale descriptors are present in both batch and single prompts
    - JSON format instructions appear at both start and end (reinforcement pattern)
  - Also test custom instruction edge cases:
    - Empty string custom instructions
    - "SCORING CALIBRATION:" prefixed instructions — calibration vs override split
    - Very long custom instructions (500+ characters)
    - Multiple preset toggles combined

  **Recommended Agent Profile**: `unspecified-high` | **Skills**: []
  **Parallelization**: Wave 4 (with 13) | **Blocked By**: T9, T10, T11 | **Blocks**: None

  **References**:
  - `grading-server/test/prompts.test.js` — Existing test patterns (343 lines of tests)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:79-85` — PRESETS to test with

  **Acceptance Criteria**:
  - [ ] ≥15 new test cases added
  - [ ] Tests cover all 3 prompt builders + custom instruction edge cases
  - [ ] `bun test --run` passes with all new + existing tests

  **QA Scenarios:**
  ```
  Scenario: All prompt regression tests pass
    Tool: Bash
    Steps:
      1. Run: cd grading-server && bun test --run test/prompts.test.js
      2. Count test cases: expect >= 15 new tests (plus existing)
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-12-prompt-tests.txt
  ```

  **Commit**: YES (group with T7)
  - Message: `test(grading): add prompt structure and temperature regression tests`
  - Files: `grading-server/test/prompts.test.js`, `grading-server/test/providers.test.js`

- [x] 13. Sync Server-Bundle Copies + Verify Parity

  **What to do**:
  - Copy all modified files from `grading-server/` to `ogre-desktop/src-tauri/binaries/server-bundle/`:
    - `grading-constants.js`
    - `grading.js`
    - `providers.js`
  - Verify byte-for-byte parity using diff
  - This is a CRITICAL step — the desktop app ships a compiled copy of these files

  **Recommended Agent Profile**: `quick` | **Skills**: []
  **Parallelization**: Wave 4 (with 12) | **Blocked By**: T3, T4, T9, T10, T11 | **Blocks**: T14

  **References**:
  - `ogre-desktop/src-tauri/binaries/server-bundle/` — Destination directory
  - Metis finding: "Both directories must stay in sync after modifications"

  **Acceptance Criteria**:
  - [ ] `diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js` → empty
  - [ ] `diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js` → empty
  - [ ] `diff grading-server/providers.js ogre-desktop/src-tauri/binaries/server-bundle/providers.js` → empty

  **QA Scenarios:**
  ```
  Scenario: Server-bundle files are identical to source
    Tool: Bash
    Steps:
      1. diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js
      2. diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js
      3. diff grading-server/providers.js ogre-desktop/src-tauri/binaries/server-bundle/providers.js
      4. All 3 must produce empty output
    Expected Result: All diffs empty
    Evidence: .sisyphus/evidence/task-13-bundle-sync.txt
  ```

  **Commit**: YES
  - Message: `chore(desktop): sync server-bundle with grading-server changes`
  - Files: `ogre-desktop/src-tauri/binaries/server-bundle/*.js`

### Wave 5 — Benchmark + Validation

- [x] 14. Run Comparison Benchmark on 3 Target Models

  **What to do**:
  - Run the extended benchmark (from T8) with NEW prompts on 3 models: GPT-OSS 120B, GLM-5, Sonnet 4.6
  - Use SAME test data as T1 frozen baseline (captured-students.json + captured-rubric.json)
  - Run WITHOUT per-model customInstructions (fair comparison to frozen baseline)
  - Save to `test-data/benchmark-optimized.json` and `test-data/benchmark-optimized.md`
  - Compare against `test-data/baseline-frozen.json`:
    - Pairwise agreement % at ±1.0 (target: ≥90%)
    - Mean score shift per model (flag if > 1.5 points from baseline)
    - Run-to-run variance (should decrease with temperature normalization)
  - Also run on synthetic biology + history datasets for broader validation

  **Recommended Agent Profile**: `unspecified-high` | **Skills**: []
  **Parallelization**: Wave 5 (with 15) | **Blocked By**: T1, T8, T13 | **Blocks**: T15, T16

  **References**:
  - `test-data/baseline-frozen.json` — Pre-change baseline (from T1)
  - `test-data/run-benchmark.js` — Extended benchmark (from T8)

  **Acceptance Criteria**:
  - [ ] `test-data/benchmark-optimized.json` exists with 3-model results
  - [ ] Pairwise agreement at ±1.0 documented for all model pairs
  - [ ] Comparison to frozen baseline documented in report

  **QA Scenarios:**
  ```
  Scenario: Benchmark produces comparable or improved results
    Tool: Bash
    Steps:
      1. Run: bun run test-data/run-benchmark.js --only=GPT-OSS,GLM-5,Sonnet --tolerance=1 --output=test-data/benchmark-optimized.json
      2. Parse benchmark-optimized.md for pairwise agreement percentages
      3. Compare to baseline-frozen.md percentages
    Expected Result: Agreement % improved or within 5% of baseline. Target: ≥90% at ±1.0
    Evidence: .sisyphus/evidence/task-14-comparison.txt
  ```

  **Commit**: YES
  - Message: `docs(test-data): benchmark comparison report after prompt optimization`
  - Files: `test-data/benchmark-optimized.*`

- [x] 15. Custom Instruction Override Effectiveness Test

  **What to do**:
  - Run benchmark with specific custom instructions to verify override system works:
    - Run 1: NO custom instructions (neutral baseline)
    - Run 2: "Grade very leniently. Give partial credit for any attempt." (should produce higher scores)
    - Run 3: "Grade strictly according to the rubric. Deduct points for minor errors." (should produce lower scores)
  - Use 1 model (GLM-5 or GPT-OSS 120B) for speed
  - Verify: lenient mean > neutral mean > strict mean
  - Verify: lenient mean is within 0.5 of old generous baseline (from T1) — proves custom instructions fully compensate for neutral philosophy

  **Recommended Agent Profile**: `deep` | **Skills**: []
  **Parallelization**: Wave 5 (with 14) | **Blocked By**: T14 | **Blocks**: T16

  **References**:
  - `test-data/baseline-frozen.json` — Old generous-philosophy scores to compare against
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:81-82` — Lenient/Strict preset text

  **Acceptance Criteria**:
  - [ ] lenient mean > neutral mean > strict mean (strict ordering)
  - [ ] |lenient mean − old generous baseline mean| ≤ 0.5 (custom instructions compensate)
  - [ ] Results documented in comparison report

  **QA Scenarios:**
  ```
  Scenario: Custom instructions shift scores in expected direction
    Tool: Bash
    Steps:
      1. Run benchmark 3x on same model with: no instructions, lenient, strict
      2. Extract mean scores from each run
      3. Assert: lenient_mean > neutral_mean > strict_mean
      4. Assert: |lenient_mean - frozen_baseline_mean| <= 0.5
    Expected Result: Strict ordering maintained, lenient approximates old generous baseline
    Evidence: .sisyphus/evidence/task-15-override-test.txt
  ```

  **Commit**: YES (group with T14)

### Wave 6 — Decision

- [x] 16. Fine-Tuning Decision Analysis

  **What to do**:
  - Analyze all benchmark results and produce a decision report:
    - If ALL pairwise agreements ≥ 90% at ±1.0: Recommend "Prompt optimization sufficient, no fine-tuning needed"
    - If SOME pairs < 90%: Identify which models are outliers, recommend targeted fine-tuning for those models
    - If MOST pairs < 90%: Recommend "Prompt optimization insufficient, Phase 2 fine-tuning required"
  - Include:
    - Summary table: model pair → agreement % (before vs after)
    - Specific model weaknesses (which models deviate most)
    - Recommended fine-tuning approach if needed (LoRA on which base model, training data requirements)
    - Cost/effort estimate for fine-tuning vs. prompt-only approach
  - Save to `test-data/fine-tuning-decision.md`

  **Recommended Agent Profile**: `writing` | **Skills**: []
  **Parallelization**: Sequential | **Blocked By**: T14, T15 | **Blocks**: None

  **References**:
  - `test-data/baseline-frozen.md` — Before metrics
  - `test-data/benchmark-optimized.md` — After metrics
  - Librarian research: Fine-tuning decision criteria

  **Acceptance Criteria**:
  - [ ] `test-data/fine-tuning-decision.md` exists with clear GO/NO-GO recommendation
  - [ ] Contains before vs after comparison table
  - [ ] If recommending fine-tuning, includes specific model targets and approach

  **Commit**: YES
  - Message: `docs(test-data): fine-tuning decision analysis based on benchmark results`
  - Files: `test-data/fine-tuning-decision.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun test --run` in `grading-server/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify prompt text has zero directional language ("generous", "lenient", "strict", "round up").
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start grading server. Send real grading request with captured-students.json + captured-rubric.json. Verify JSON response parses correctly. Send same request with "Grade very leniently" custom instructions — verify scores shift upward. Send with "Grade strictly" — verify scores shift downward. Run benchmark on 1 model to verify pairwise metrics.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no parsing changes, no scale changes, no sweep prompt changes. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1**: `chore(test-data): capture frozen baseline benchmark` — baseline-frozen.json, baseline-frozen.md
- **T2**: `test(test-data): add synthetic biology and history test fixtures` — test fixtures
- **T3**: `refactor(grading): replace generous philosophy with neutral base` — grading-constants.js
- **T4**: `feat(providers): add temperature normalization (default 0.2)` — providers.js
- **T5**: `refactor(grading): unify scoring scale descriptors across batch/single` — grading.js
- **T6**: `refactor(grading): restructure custom instruction injection for early positioning` — grading.js
- **T7+T12**: `test(grading): add prompt structure and temperature regression tests` — test files
- **T8**: `feat(benchmark): add prompt variant comparison support` — run-benchmark.js
- **T9-T11**: `refactor(grading): apply tiered prompt architecture to all builders` — grading.js
- **T13**: `chore(desktop): sync server-bundle with grading-server changes` — server-bundle files
- **T14-T16**: `docs(test-data): benchmark comparison report and fine-tuning analysis` — reports

---

## Success Criteria

### Verification Commands
```bash
# All existing tests pass
cd grading-server && bun test --run  # Expected: All tests pass

# Server-bundle parity
diff grading-server/grading-constants.js ogre-desktop/src-tauri/binaries/server-bundle/grading-constants.js  # Expected: empty
diff grading-server/grading.js ogre-desktop/src-tauri/binaries/server-bundle/grading.js  # Expected: empty
diff grading-server/providers.js ogre-desktop/src-tauri/binaries/server-bundle/providers.js  # Expected: empty

# Benchmark target
bun run test-data/run-benchmark.js --only=GPT-OSS,GLM-5,Sonnet --tolerance=1  # Expected: All pairs >= 90%
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All Vitest tests pass
- [x] Server-bundle synced
- [x] Frozen baseline captured
- [x] Comparison benchmark run
- [x] Fine-tuning decision documented
