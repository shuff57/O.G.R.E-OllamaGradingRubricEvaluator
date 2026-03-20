# Autoresearch: Grading Prompt Optimization Loop

## TL;DR

> **Quick Summary**: Build an autonomous autoresearch loop (inspired by Karpathy's autoresearch) that iterates on O.G.R.E's grading prompts to make grading more generous for strong responses (+1pt), more reliable on edge cases, more concise, and more deterministic (minimize run-to-run variance). Uses Sonnet 4.6 as the single fixed evaluation model against a gold-standard holdout set.
>
> **Deliverables**:
> - `autoresearch/` module with autonomous prompt optimization loop
> - Composite metric (generosity shift, variance, edge-case reliability, prompt length)
> - Constants-injection mechanism in `grading.js` (only existing-code change)
> - Results tracking (TSV + git branch management + best-prompt snapshots)
> - `program.md` strategy guide for the autonomous agent
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8 → Task 10

---

## Context

### Original Request
User wants to adapt Karpathy's autoresearch pattern to autonomously optimize O.G.R.E's grading prompts. The agent modifies prompts, evaluates against teacher-scored holdout data, keeps improvements, discards regressions, and repeats — running unattended overnight like autoresearch runs GPU experiments.

### Interview Summary
**Key Discussions**:
- Analyzed 5 optimization surfaces; user chose grading server prompts (grading-constants.js) first, agent command second
- User has rich existing infrastructure: JSONL validation data, gold standard scores, benchmark runner, captured student data
- User wants fully autonomous operation (true autoresearch style, no human checkpoints)

**User-Specified Goals (CRITICAL — these define the metric)**:
1. **Grade more generously** — ~1 point higher for well-defined responses (current gold standard is the BASELINE to improve upon, not the target)
2. **Handle edge cases more reliably** — blank responses, exceptional work, borderline cases should converge
3. **Minimize the prompt** — as concise as possible (simplicity criterion: shorter = better at equal quality)
4. **Improve run-to-run accuracy** — shrink variance until we hit the precision limit of the model
5. **Evaluation model**: Sonnet 4.6 (Anthropic API) — single model, fixed

**Research Findings**:
- Autoresearch core pattern: one mutable file, one fixed harness, one scalar metric, autonomous loop
- `grading-constants.js` has GRADING_PHILOSOPHY (11 bullets) + SCORING_SCALE_DESCRIPTORS (11 levels)
- `grading.js` has 3 additional inline prompt surfaces (anchor descriptions, PARTIAL CREDIT RULE, 8+ guardrail) — defer to Phase 2
- Existing `run-benchmark.js` computes model-vs-model consistency but NOT gold-standard alignment — eval harness is mostly new
- `benchmark-ctx.js` pattern shows how to import prompt builders directly, bypassing HTTP server
- ESM hot-reload problem: module-level constants can't be swapped without restart — need constants-injection parameter

### Metis Review
**Identified Gaps** (addressed):
- ESM hot-reload: Solved via optional `constants` parameter on `buildSingleGradePrompt()` (defaults to existing behavior — zero production risk)
- Batch vs single evaluation: Use `buildSingleGradePrompt()` not batch — isolates prompt quality from cross-student context effects
- Overfitting to one rubric: Include generalization check on 2+ JSONL rubric types after each advance
- Metric gaming: Track per-student errors, flag score compression, reject advances where any student error increases >2pt
- Mutation quality: Use structured mutation types (not freeform rewriting) with a mutation log to prevent re-trying failures
- Cost control: Budget cap (max iterations + max time + max API cost)

---

## Work Objectives

### Core Objective
Build an autonomous loop that optimizes grading prompts for generosity, edge-case reliability, conciseness, and determinism — measured against a gold-standard holdout set using Sonnet 4.6.

### Concrete Deliverables
- `autoresearch/` directory with: metric module, eval harness, mutation engine, loop controller, CLI entry point
- Modified `grading.js:buildSingleGradePrompt()` with optional `constants` override parameter
- `autoresearch/program.md` — strategy guide for the autonomous agent
- `autoresearch/results.tsv` — experiment log (append-only)
- Best-performing prompt snapshots in `autoresearch/snapshots/`

### Definition of Done
- [ ] `bun test autoresearch/` → all tests pass
- [ ] `bun run autoresearch/loop.js --dry-run` → completes 1 mock iteration end-to-end
- [ ] `bun run autoresearch/loop.js --iterations=3` → runs 3 real iterations with Sonnet 4.6, logs results
- [ ] Baseline metric established and stored in `autoresearch/baseline-metric.json`
- [ ] Existing grading-server tests still pass (`bun test` in `grading-server/`)

### Must Have
- Composite metric that weights: generosity shift for strong responses, run-to-run variance, edge-case consistency, prompt conciseness
- Constants-injection that preserves 100% backward compatibility
- Structured mutation types (not freeform LLM rewriting)
- Mutation log preventing re-tried failures
- Budget cap (iterations + time + API cost)
- Per-student error tracking (reject advances that regress any student >2pt)
- Generalization check on 2+ rubric types after each advance
- Git branch management (advance on improvement, revert on regression)
- Results TSV tracking every experiment
- Fully autonomous operation (no human checkpoints once started)

### Must NOT Have (Guardrails)
- Must NOT modify `grading.js` prompt STRUCTURE (JSON format, section headers, student listing) — only the injectable constants text
- Must NOT mutate PARTIAL CREDIT RULE or 8+ guardrail in Phase 1 (carefully teacher-calibrated)
- Must NOT use batch grading for evaluation (confounds prompt quality with cross-student context)
- Must NOT run without budget caps (max iterations AND max time AND max API cost)
- Must NOT allow metric gaming via score compression (flag if score std dev collapses)
- Must NOT break existing grading-server tests or production behavior
- Must NOT install new dependencies beyond what's in pyproject.toml/package.json (follow autoresearch simplicity)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest in grading-server)
- **Automated tests**: TDD (Red-Green-Refactor for each module)
- **Framework**: vitest (consistent with grading-server/package.json)
- **Each task follows**: RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Metric module**: Use Bash (bun test) — run tests, compare expected outputs
- **Eval harness**: Use Bash (bun run) — execute against gold standard, verify metric computation
- **Loop controller**: Use Bash (bun run --dry-run) — verify end-to-end with mock LLM
- **Integration**: Use Bash (bun test) — verify existing grading-server tests still pass

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundations, MAX PARALLEL):
├── Task 1: Metric computation module + tests [deep]
├── Task 2: Gold-standard data loader + validation JSONL parser + tests [quick]
├── Task 3: Constants-injection mechanism in grading.js + tests [quick]
└── Task 4: Mutation type definitions + mutation log + tests [deep]

Wave 2 (After Wave 1 — eval harness + mutation engine):
├── Task 5: Eval harness (grade gold-standard via buildSingleGradePrompt + compute metrics) + tests [deep]
├── Task 6: Mutation engine (apply structured mutations to prompt text + validate) + tests [deep]
└── Task 7: Baseline establishment (run current prompts, store baseline-metric.json) [unspecified-high]

Wave 3 (After Wave 2 — loop + tracking):
├── Task 8: Loop controller (iterate, compare, advance/revert, convergence check) + tests [deep]
├── Task 9: Results tracking (results.tsv, git branch management, best-prompt snapshots) + tests [unspecified-high]
└── Task 10: program.md strategy guide + CLI entry point [unspecified-high]

Wave 4 (After Wave 3 — verification):
├── Task 11: End-to-end smoke test with mock LLM + 3-iteration real run [deep]
└── Task 12: Documentation + existing test regression check [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — run 3 autonomous iterations (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → Task 8 → Task 10 → Task 11
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 5, 7, 8 | 1 |
| 2 | — | 5, 7 | 1 |
| 3 | — | 5, 6, 7 | 1 |
| 4 | — | 6, 8 | 1 |
| 5 | 1, 2, 3 | 7, 8, 11 | 2 |
| 6 | 3, 4 | 8, 10 | 2 |
| 7 | 1, 2, 3, 5 | 8, 11 | 2 |
| 8 | 1, 4, 5, 6, 7 | 10, 11 | 3 |
| 9 | 4 | 10, 11 | 3 |
| 10 | 6, 8, 9 | 11 | 3 |
| 11 | 5, 7, 8, 9, 10 | F1-F4 | 4 |
| 12 | 3, 10 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2 → `quick`, T3 → `quick`, T4 → `deep`
- **Wave 2**: 3 tasks — T5 → `deep`, T6 → `deep`, T7 → `unspecified-high`
- **Wave 3**: 3 tasks — T8 → `deep`, T9 → `unspecified-high`, T10 → `unspecified-high`
- **Wave 4**: 2 tasks — T11 → `deep`, T12 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Metric Computation Module + Tests

  **What to do**:
  - RED: Write tests for all metric functions FIRST with known inputs and expected outputs
  - GREEN: Implement the metric module with these functions:
    - `computeMAE(predicted, gold)` — Mean Absolute Error of scores
    - `computeWithin1Rate(predicted, gold)` — Fraction of students within ±1 of gold
    - `computeUndergradePenalty(predicted, gold)` — 2x-weighted penalty for scores below gold (undergrading is worse than overgrading)
    - `computeGenerosityShift(predicted, gold, threshold)` — Measures how much higher strong responses (gold ≥ 7) score vs baseline. TARGET: ~+1pt for well-defined responses
    - `computeRunVariance(multiRunScores)` — Average per-student variance across N runs of the same prompt
    - `computeEdgeCaseReliability(multiRunScores, edgeIndices)` — Variance specifically on edge-case students (blank, exceptional, borderline)
    - `computePromptConciseness(promptText, baselineLength)` — Ratio of current length to baseline (lower = better, acts as tiebreaker)
    - `computeComposite(components, weights)` — Weighted combination into single scalar. Default weights:
      - generosityShift: 0.30 (primary goal — grade stronger responses ~1pt higher)
      - runVariance: 0.25 (key goal — determinism)
      - edgeCaseReliability: 0.20 (handle edge cases reliably)
      - within1Rate: 0.15 (stay reasonably close to gold)
      - promptConciseness: 0.10 (tiebreaker — shorter is better)
    - IMPORTANT: Higher composite = better. All components normalized to 0-1 where 1 = best. For variance/MAE, invert so lower variance → higher score.
  - REFACTOR: Ensure all functions are pure, stateless, well-named

  **Must NOT do**:
  - Must NOT depend on any external libraries (pure math only)
  - Must NOT import from grading-server (standalone module)
  - Must NOT hardcode gold standard data in the metric module

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core mathematical logic requiring careful TDD with precise expected values
  - **Skills**: []
    - No domain-specific skills needed — pure computation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `grading-server/test/grading.test.js` — Test structure and vitest conventions used in this project
  - `shuff57-llm-finetune/ogre/test-data/benchmark-report.md` — Shows the existing metrics (mean score, std dev, pairwise agreement) to understand what's already measured vs what's new

  **API/Type References**:
  - `shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json` — Gold standard format: `{index, name, scores[3], mean, rationale}`. The `mean` field is the gold score. The `scores` array shows 3 deterministic runs.

  **External References**:
  - Karpathy's autoresearch `program.md` — Shows the simplicity criterion pattern: "All else being equal, simpler is better"

  **WHY Each Reference Matters**:
  - The gold standard file defines the shape of inputs the metric functions will receive
  - The benchmark report shows what metrics exist vs what needs to be invented
  - The grading test file shows vitest conventions to follow

  **Acceptance Criteria**:
  - [ ] Test file created: `autoresearch/test/metrics.test.js`
  - [ ] Implementation file created: `autoresearch/metrics.js`
  - [ ] `bun test autoresearch/test/metrics.test.js` → PASS (≥12 tests covering all 8 functions)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Composite metric correctly weights generosity as primary goal
    Tool: Bash (bun test)
    Preconditions: Test file exists with hardcoded inputs
    Steps:
      1. Run `bun test autoresearch/test/metrics.test.js`
      2. Verify test "computeComposite weights generosity highest" passes
      3. Test case: gold=[8,7,9,4,3], predicted=[9,8,10,4,3] → generosityShift should be positive (~1pt for strong responses), composite should be high
    Expected Result: All metric tests pass, composite correctly prioritizes generosity shift
    Failure Indicators: Any test fails, or composite doesn't rank generosity-improving prompts higher
    Evidence: .sisyphus/evidence/task-1-metrics-composite.txt

  Scenario: Undergrade penalty is 2x overgrade penalty
    Tool: Bash (bun test)
    Preconditions: Test file with symmetric error cases
    Steps:
      1. Test case A: gold=[8], predicted=[6] (undergrade by 2) → penalty = 4 (2×2)
      2. Test case B: gold=[8], predicted=[10] (overgrade by 2) → penalty = 2 (1×2)
      3. Verify A has higher penalty than B
    Expected Result: Undergrading penalized 2x compared to overgrading
    Evidence: .sisyphus/evidence/task-1-undergrade-penalty.txt
  ```

  **Commit**: YES (1)
  - Message: `feat(autoresearch): add metric computation module with TDD`
  - Files: `autoresearch/metrics.js`, `autoresearch/test/metrics.test.js`
  - Pre-commit: `bun test autoresearch/test/metrics.test.js`

- [ ] 2. Gold-Standard Data Loader + Validation JSONL Parser + Tests

  **What to do**:
  - RED: Write tests for data loading functions FIRST
  - GREEN: Implement:
    - `loadGoldStandard(path)` — Parse `sonnet-gold-standard-post-patch.json`, return array of `{index, name, goldScore, scores, rationale}`
    - `loadValidationJSONL(path)` — Parse `finetune-grading-val.jsonl`, extract `{rubricPrompt, studentResponse, goldScore, maxScore}` from each line's chat messages
    - `identifyEdgeCases(goldData)` — Flag students with extreme scores (0-2 = low edge, 9-10 = high edge) and high variance (if multiple runs)
    - `groupByRubric(jsonlData)` — Group JSONL samples by rubric type for per-rubric generalization checks
    - `buildEvalDataset(goldPath, jsonlPath)` — Combine both sources into a unified evaluation dataset
  - The loader must handle the specific formats:
    - Gold standard: nested JSON with `perStudent` array, each having `scores[3]` and `mean`
    - JSONL: OpenAI chat format where the assistant's response contains a JSON with `score` and `feedback` fields

  **Must NOT do**:
  - Must NOT modify the gold standard or JSONL files
  - Must NOT filter or transform scores (load as-is)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward JSON/JSONL parsing with known formats
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json:1-40` — Full gold standard structure with `description`, `model`, `perStudent[]` array. Each student: `{index, name, scores[3], mean, rationale}`
  - `shuff57-llm-finetune/ogre/test-data/finetune-grading-val.jsonl:1-5` — JSONL lines with OpenAI chat format messages. System → user (with embedded GRADING_PHILOSOPHY, rubric, student response) → assistant (JSON with score + feedback)

  **WHY Each Reference Matters**:
  - These ARE the input files — the loader must parse their exact structure
  - The JSONL embeds the grading prompt inside user messages — the parser must extract the student response and gold score from within that structure

  **Acceptance Criteria**:
  - [ ] Test file created: `autoresearch/test/data-loader.test.js`
  - [ ] Implementation file: `autoresearch/data-loader.js`
  - [ ] `bun test autoresearch/test/data-loader.test.js` → PASS (≥8 tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Gold standard loads all 25 students with correct scores
    Tool: Bash (bun test)
    Preconditions: Gold standard file exists at known path
    Steps:
      1. Load gold standard from `../shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json`
      2. Verify 25 students loaded
      3. Verify first student: name="Alvarez, Emiliano", goldScore=8.0
      4. Verify edge case detection flags students with goldScore ≤ 2 (e.g., "Jimmerson, Kwan" at 2.0)
    Expected Result: All 25 students loaded, edge cases identified, scores match file
    Evidence: .sisyphus/evidence/task-2-gold-loader.txt

  Scenario: JSONL parser handles missing or malformed lines gracefully
    Tool: Bash (bun test)
    Preconditions: Test with mock JSONL data including one malformed line
    Steps:
      1. Parse valid JSONL → verify rubric + response + score extracted
      2. Parse JSONL with malformed JSON line → verify it's skipped with warning, not crash
    Expected Result: Valid lines parsed, malformed lines skipped gracefully
    Evidence: .sisyphus/evidence/task-2-jsonl-parser-error.txt
  ```

  **Commit**: YES (2)
  - Message: `feat(autoresearch): add gold-standard data loader and JSONL parser`
  - Files: `autoresearch/data-loader.js`, `autoresearch/test/data-loader.test.js`
  - Pre-commit: `bun test autoresearch/test/data-loader.test.js`

- [ ] 3. Constants-Injection Mechanism in grading.js + Tests

  **What to do**:
  - This is the ONLY change to existing code. Modify `buildSingleGradePrompt()` in `grading-server/grading.js` to accept an optional `constants` parameter that overrides the module-level `GRADING_PHILOSOPHY` and `SCORING_SCALE_DESCRIPTORS` imports.
  - RED: Write test that calls `buildSingleGradePrompt()` with custom constants and verifies the custom text appears in the generated prompt
  - GREEN: Add `constants = null` parameter to `buildSingleGradePrompt()`. When provided, use `constants.gradingPhilosophy` instead of `GRADING_PHILOSOPHY` and `constants.scoringScaleDescriptors` instead of `SCORING_SCALE_DESCRIPTORS`. When null, behavior is 100% unchanged.
  - REFACTOR: Ensure existing tests still pass with no modifications
  - Pattern: `function buildSingleGradePrompt(rubric, studentWork, instructions, constants = null)`
  - The constants object shape: `{ gradingPhilosophy: string, scoringScaleDescriptors: Array<{score, descriptor}> }`

  **Must NOT do**:
  - Must NOT change the default behavior (when constants=null, existing behavior preserved exactly)
  - Must NOT modify buildBatchPrompt() (that's a Phase 2 extension)
  - Must NOT change function signatures in a way that breaks existing callers
  - Must NOT modify any prompt text — only add the injection mechanism

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, surgical change to one function signature with backward-compatible default
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `grading-server/grading.js:762` — `buildSingleGradePrompt(rubric, studentWork, instructions)` — the function to modify. Read the full function body to understand where GRADING_PHILOSOPHY and SCORING_SCALE_DESCRIPTORS are used.
  - `grading-server/grading-constants.js:2-28` — The module-level constants being overridden. Understand their exact shape.
  - `shuff57-llm-finetune/ogre/test-data/benchmark-ctx.js:1-6` — Shows pattern of importing prompt builders directly (bypass HTTP). The autoresearch loop will use this same pattern.

  **Test References**:
  - `grading-server/test/prompts.test.js:188-247` — Existing tests for `buildSingleGradePrompt` tiered ordering. These must ALL still pass unchanged.
  - `grading-server/test/chat.test.js:6-96` — More existing tests. Must all pass.

  **WHY Each Reference Matters**:
  - The function body shows exactly where constants are interpolated into the prompt string
  - The existing tests verify current behavior — they serve as regression guards
  - The benchmark-ctx.js pattern confirms direct import works (no HTTP needed)

  **Acceptance Criteria**:
  - [ ] `buildSingleGradePrompt` accepts optional 4th parameter `constants`
  - [ ] When `constants=null` (default), output is byte-identical to current behavior
  - [ ] When custom constants provided, they appear in the generated prompt
  - [ ] ALL existing grading-server tests pass: `bun test` in `grading-server/` → PASS

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Constants injection overrides GRADING_PHILOSOPHY in prompt output
    Tool: Bash (bun test)
    Preconditions: grading.js modified with constants parameter
    Steps:
      1. Call buildSingleGradePrompt(mockRubric, "student work", "", {gradingPhilosophy: "CUSTOM_MARKER_XYZ", scoringScaleDescriptors: [{score:0, descriptor:"test"}]})
      2. Assert output contains "CUSTOM_MARKER_XYZ"
      3. Assert output does NOT contain the original GRADING_PHILOSOPHY text
    Expected Result: Custom constants injected into prompt
    Evidence: .sisyphus/evidence/task-3-constants-injection.txt

  Scenario: Backward compatibility — null constants preserves exact output
    Tool: Bash (bun test)
    Preconditions: grading.js modified
    Steps:
      1. Call buildSingleGradePrompt(mockRubric, "student work", "") — no constants param
      2. Call buildSingleGradePrompt(mockRubric, "student work", "", null) — explicit null
      3. Assert both outputs are identical to pre-modification output
      4. Run full grading-server test suite: `bun test` in `grading-server/`
    Expected Result: Zero behavioral change for existing callers, all 50+ existing tests pass
    Failure Indicators: Any existing test fails, or output differs from pre-modification
    Evidence: .sisyphus/evidence/task-3-backward-compat.txt
  ```

  **Commit**: YES (3)
  - Message: `feat(grading-server): add constants-injection to buildSingleGradePrompt`
  - Files: `grading-server/grading.js`, `grading-server/test/grading.test.js`
  - Pre-commit: `bun test` in `grading-server/`

- [ ] 4. Mutation Type Definitions + Mutation Log + Tests

  **What to do**:
  - RED: Write tests for mutation types and the mutation log FIRST
  - GREEN: Implement:
    - **Structured mutation types** (enum/constants — NOT freeform LLM rewriting):
      - `REPHRASE_BULLET` — Rewrite one specific bullet in GRADING_PHILOSOPHY for conciseness or clarity
      - `REMOVE_BULLET` — Remove one bullet from GRADING_PHILOSOPHY (for prompt minimization)
      - `ADD_BULLET` — Add a new bullet to GRADING_PHILOSOPHY (for edge-case handling)
      - `MERGE_BULLETS` — Combine two related bullets into one more concise version
      - `ADJUST_DESCRIPTOR` — Modify a SCORING_SCALE_DESCRIPTORS entry's text (e.g., make score-7 description more generous)
      - `SHIFT_DESCRIPTOR_THRESHOLD` — Move a descriptor to a different score level (e.g., "competent" from 7 to 6)
      - `REORDER_BULLETS` — Change bullet ordering for prompt effectiveness
    - **Mutation log** (`mutation-log.json`):
      - Append-only log of all attempted mutations: `{type, target, description, result: "keep"|"discard"|"crash", metric_delta, timestamp}`
      - `hasSimilarMutation(log, proposedMutation)` — Check if a semantically similar mutation was already tried (fuzzy match on type + target)
      - `getMutationHistory(log, type?)` — Query past mutations by type to inform strategy
    - **Mutation validation**:
      - `validateMutatedConstants(constants)` — Verify mutated constants are well-formed (non-empty philosophy, valid descriptor array with all 11 score levels, no duplicate scores)

  **Must NOT do**:
  - Must NOT implement freeform "rewrite the whole prompt" mutations (too noisy, too hard to attribute)
  - Must NOT depend on LLM for mutation type definitions (these are structural, not generative)
  - Must NOT allow mutations that produce empty GRADING_PHILOSOPHY or missing score levels

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Careful design of mutation vocabulary and log deduplication logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `grading-server/grading-constants.js:2-12` — GRADING_PHILOSOPHY: 11 bullets that mutations target. Read each bullet to understand what REPHRASE/REMOVE/ADD/MERGE operate on.
  - `grading-server/grading-constants.js:16-28` — SCORING_SCALE_DESCRIPTORS: 11 `{score, descriptor}` entries that ADJUST_DESCRIPTOR and SHIFT_DESCRIPTOR_THRESHOLD operate on.

  **External References**:
  - Karpathy's autoresearch `program.md` experiment loop — Shows the "keep/discard/crash" status pattern that the mutation log mirrors. Also shows the results.tsv format.

  **WHY Each Reference Matters**:
  - The constants files define the exact structure mutations modify — mutations must produce valid replacements
  - Autoresearch's results.tsv pattern informs the mutation log format

  **Acceptance Criteria**:
  - [ ] `autoresearch/mutations.js` — mutation type definitions, log operations, validation
  - [ ] `autoresearch/test/mutations.test.js` — ≥10 tests
  - [ ] `bun test autoresearch/test/mutations.test.js` → PASS

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Mutation log prevents re-trying similar mutations
    Tool: Bash (bun test)
    Preconditions: Log with one REPHRASE_BULLET entry for bullet index 3
    Steps:
      1. Add mutation: {type: "REPHRASE_BULLET", target: {bulletIndex: 3}, description: "make more concise"}
      2. Check hasSimilarMutation for {type: "REPHRASE_BULLET", target: {bulletIndex: 3}} → should return true
      3. Check hasSimilarMutation for {type: "REPHRASE_BULLET", target: {bulletIndex: 5}} → should return false
    Expected Result: Same target+type detected as duplicate, different target passes
    Evidence: .sisyphus/evidence/task-4-mutation-log-dedup.txt

  Scenario: Validation rejects malformed constants
    Tool: Bash (bun test)
    Steps:
      1. Empty philosophy string → rejected
      2. Descriptors missing score level 5 → rejected
      3. Descriptors with duplicate score levels → rejected
      4. Valid constants → accepted
    Expected Result: Invalid mutations caught before they waste an API call
    Evidence: .sisyphus/evidence/task-4-validation.txt
  ```

  **Commit**: YES (4)
  - Message: `feat(autoresearch): add mutation type definitions and mutation log`
  - Files: `autoresearch/mutations.js`, `autoresearch/test/mutations.test.js`
  - Pre-commit: `bun test autoresearch/test/mutations.test.js`

- [ ] 5. Eval Harness (Grade Gold-Standard via buildSingleGradePrompt + Compute Metrics) + Tests

  **What to do**:
  - RED: Write tests for the eval harness with a mock LLM provider
  - GREEN: Implement `autoresearch/eval-harness.js`:
    - `runEvaluation(constants, goldData, config)` — Core evaluation function:
      1. For each gold-standard student, build prompt via `buildSingleGradePrompt(rubric, response, "", constants)`
      2. Send to Sonnet 4.6 via Anthropic API (use `grading-server/providers.js:buildAnthropicRequest()` pattern)
      3. Parse response to extract score
      4. Repeat N times (default 3) for variance measurement
      5. Compute all metrics via metrics module
      6. Return composite score + component breakdown + per-student results
    - `runGeneralizationCheck(constants, jsonlSamples, config)` — Run on 2-3 JSONL rubric types, verify no regression beyond threshold
    - Config shape: `{model: "claude-sonnet-4-6", apiKey, runs: 3, maxConcurrent: 5, timeout: 60000}`
    - CRITICAL: Use `buildSingleGradePrompt()` NOT `buildBatchPrompt()` — isolate prompt quality from batch context
    - CRITICAL: Parse the score from LLM response JSON (same format as training data: `{"score": N, "feedback": "..."}`)
    - Handle API errors gracefully: retry 2x with exponential backoff, then mark as crash

  **Must NOT do**:
  - Must NOT use batch grading (confounds prompt quality with cross-student context effects)
  - Must NOT call the grading server via HTTP (import functions directly, bypass ESM caching via constants injection)
  - Must NOT skip the generalization check after advances

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integrates multiple modules (metrics, data-loader, grading.js), handles API calls, needs careful error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7 if dependencies met)
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Tasks 7, 8, 11
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `grading-server/grading.js:762-916` — `buildSingleGradePrompt()` full implementation. Read to understand the complete prompt assembly: philosophy → scoring scale → rubric → student work → instructions → JSON output format.
  - `grading-server/providers.js:165-227` — `buildAnthropicRequest()` — pattern for Anthropic API calls. Shows message format, model parameter, max_tokens, etc.
  - `shuff57-llm-finetune/ogre/test-data/benchmark-ctx.js:1-6` — Shows direct import pattern (bypass HTTP server)

  **API/Type References**:
  - `shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json` — Gold standard: `perStudent[].mean` is the gold score to compare against
  - `shuff57-llm-finetune/ogre/test-data/captured-rubric.json` — The rubric object structure that `buildSingleGradePrompt` expects
  - `shuff57-llm-finetune/ogre/test-data/captured-students.json` — Student response objects

  **WHY Each Reference Matters**:
  - buildSingleGradePrompt shows exactly how constants are interpolated — the eval harness must call it with the injected constants parameter
  - providers.js shows the Anthropic API call pattern to follow
  - Gold standard defines the comparison targets

  **Acceptance Criteria**:
  - [ ] `autoresearch/eval-harness.js` created
  - [ ] `autoresearch/test/eval-harness.test.js` created with mock LLM tests
  - [ ] `bun test autoresearch/test/eval-harness.test.js` → PASS (≥6 tests)
  - [ ] Mock test verifies: load gold data → build prompts with custom constants → parse mock responses → compute metrics → return composite

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Eval harness produces correct metrics with mock LLM
    Tool: Bash (bun test)
    Preconditions: Mock LLM that returns predetermined scores
    Steps:
      1. Mock LLM returns {score: goldScore + 1} for strong students, {score: goldScore} for weak students
      2. Run evaluation with mock
      3. Verify generosityShift > 0 (strong students scored higher)
      4. Verify runVariance = 0 (mock is deterministic)
      5. Verify composite score computed correctly
    Expected Result: Metrics correctly capture the mock scoring pattern
    Evidence: .sisyphus/evidence/task-5-eval-mock.txt

  Scenario: Eval harness handles API timeout gracefully
    Tool: Bash (bun test)
    Preconditions: Mock LLM that times out on 1 student
    Steps:
      1. Mock LLM times out on student index 5
      2. Run evaluation
      3. Verify student 5 marked as error, other students still graded
      4. Verify metrics computed on successful students only
    Expected Result: Graceful degradation, partial results returned
    Evidence: .sisyphus/evidence/task-5-eval-timeout.txt
  ```

  **Commit**: YES (5)
  - Message: `feat(autoresearch): add eval harness with gold-standard grading`
  - Files: `autoresearch/eval-harness.js`, `autoresearch/test/eval-harness.test.js`
  - Pre-commit: `bun test autoresearch/`

- [ ] 6. Mutation Engine (Apply Structured Mutations to Prompt Text + Validate) + Tests

  **What to do**:
  - RED: Write tests for mutation application logic FIRST
  - GREEN: Implement `autoresearch/mutation-engine.js`:
    - `proposeMutation(currentConstants, mutationLog, strategy)` — Use an LLM (Sonnet 4.6) to propose a structured mutation:
      1. Read current constants text and mutation history
      2. Given the optimization goals (more generous for strong responses, more concise, better edge cases), propose ONE specific structured mutation
      3. The LLM output must specify: mutation type (from the defined types), target (which bullet/descriptor), and the concrete new text
      4. Validate the proposal against the mutation log (skip if similar tried before)
      5. Return the mutation proposal
    - `applyMutation(currentConstants, mutation)` — Apply the proposed mutation to produce new constants:
      - For REPHRASE_BULLET: replace the specified bullet text
      - For REMOVE_BULLET: remove the bullet at the specified index
      - For ADD_BULLET: insert a new bullet at the specified position
      - For MERGE_BULLETS: combine two bullets into one
      - For ADJUST_DESCRIPTOR: modify the descriptor text for a score level
      - For SHIFT_DESCRIPTOR_THRESHOLD: move a descriptor between score levels
      - For REORDER_BULLETS: reorder bullets
    - `validateMutatedConstants(newConstants)` — Call the validation from mutations.js
    - `buildMutationPrompt(currentConstants, mutationLog, goals)` — Build the LLM prompt that requests a structured mutation proposal. Include optimization goals explicitly:
      - "Grade ~1 point higher for well-defined responses (gold score ≥7)"
      - "Handle edge cases (blank, exceptional, borderline) more reliably"
      - "Make the prompt more concise — remove redundancy, merge overlapping bullets"
      - "Improve determinism — reduce ambiguity that causes score variance"

  **Must NOT do**:
  - Must NOT allow freeform "rewrite everything" mutations
  - Must NOT skip mutation log duplicate checking
  - Must NOT apply mutations that fail validation

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex LLM-in-the-loop mutation proposal with structured output parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Tasks 8, 10
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `grading-server/grading-constants.js:2-28` — The full text of both constants. The mutation engine must parse and reconstruct these exactly.
  - `autoresearch/mutations.js` (from Task 4) — Mutation type definitions and validation functions

  **External References**:
  - Karpathy's autoresearch `program.md` — The agent's research strategy (hypothesis → experiment → evaluate → keep/discard). The mutation engine mirrors this: propose → apply → validate.

  **WHY Each Reference Matters**:
  - Constants file is the exact text being mutated — engine must preserve formatting and structure
  - Mutation types from Task 4 define the vocabulary of allowed changes

  **Acceptance Criteria**:
  - [ ] `autoresearch/mutation-engine.js` created
  - [ ] `autoresearch/test/mutation-engine.test.js` → PASS (≥8 tests)
  - [ ] Tests cover: REPHRASE_BULLET, REMOVE_BULLET, MERGE_BULLETS, ADJUST_DESCRIPTOR
  - [ ] Tests verify mutation log dedup prevents re-proposals

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: REMOVE_BULLET mutation produces valid shorter constants
    Tool: Bash (bun test)
    Preconditions: Current constants with 11 bullets
    Steps:
      1. Apply REMOVE_BULLET mutation targeting bullet index 5
      2. Verify new constants have 10 bullets
      3. Verify remaining bullets unchanged
      4. Verify validateMutatedConstants() passes
    Expected Result: One bullet cleanly removed, rest preserved
    Evidence: .sisyphus/evidence/task-6-remove-bullet.txt

  Scenario: Mutation engine skips proposals already in log
    Tool: Bash (bun test)
    Preconditions: Mutation log with 3 previous REPHRASE_BULLET attempts on bullets 1, 3, 5
    Steps:
      1. Mock LLM proposes REPHRASE_BULLET on bullet 3
      2. Engine detects duplicate in log
      3. Engine requests a different mutation from LLM
    Expected Result: No duplicate mutations attempted
    Evidence: .sisyphus/evidence/task-6-dedup.txt
  ```

  **Commit**: YES (6)
  - Message: `feat(autoresearch): add mutation engine with structured prompt editing`
  - Files: `autoresearch/mutation-engine.js`, `autoresearch/test/mutation-engine.test.js`
  - Pre-commit: `bun test autoresearch/`

- [ ] 7. Baseline Establishment (Run Current Prompts, Store baseline-metric.json)

  **What to do**:
  - Run the eval harness with the CURRENT (unmodified) grading constants against the gold standard
  - Execute 3 runs with Sonnet 4.6 to establish baseline variance
  - Compute all metrics and store as `autoresearch/baseline-metric.json`
  - This is the "first run" in autoresearch terms — establish what we're improving from
  - The baseline-metric.json shape:
    ```json
    {
      "timestamp": "...",
      "model": "claude-sonnet-4-6",
      "runs": 3,
      "constants": { "gradingPhilosophy": "...", "scoringScaleDescriptors": [...] },
      "promptLength": 1234,
      "composite": 0.65,
      "components": {
        "generosityShift": 0.0,
        "runVariance": 0.85,
        "edgeCaseReliability": 0.72,
        "within1Rate": 0.88,
        "promptConciseness": 1.0
      },
      "perStudent": [ { "index": 0, "name": "...", "goldScore": 8, "predictedScores": [7,7,8], "mean": 7.33, "error": 0.67 } ]
    }
    ```
  - IMPORTANT: generosityShift will be 0 at baseline (by definition — it measures shift FROM baseline). The loop optimizes to increase this.
  - Create a simple script `autoresearch/establish-baseline.js` that runs this

  **Must NOT do**:
  - Must NOT modify any constants for the baseline (use current production values)
  - Must NOT skip the 3-run variance measurement

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires real API calls to Sonnet 4.6 and integrating multiple modules from Tasks 1-3, 5
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on eval harness being complete)
  - **Parallel Group**: Wave 2 (after Tasks 1, 2, 3; can run alongside 6 if 5 is done)
  - **Blocks**: Tasks 8, 11
  - **Blocked By**: Tasks 1, 2, 3, 5

  **References**:

  **Pattern References**:
  - `autoresearch/eval-harness.js` (from Task 5) — The evaluation function this script calls
  - `autoresearch/metrics.js` (from Task 1) — Metric computation functions
  - `autoresearch/data-loader.js` (from Task 2) — Gold standard loader

  **API/Type References**:
  - Anthropic API key must be available via `ANTHROPIC_API_KEY` environment variable

  **WHY Each Reference Matters**:
  - This task is the integration point — it calls the eval harness from Task 5 with real data from Task 2 and real API calls

  **Acceptance Criteria**:
  - [ ] `autoresearch/establish-baseline.js` created
  - [ ] `autoresearch/baseline-metric.json` created with valid metrics
  - [ ] Baseline composite score is a reasonable number (not 0, not 1)
  - [ ] Per-student results included for all 25 gold-standard students
  - [ ] 3 runs completed (verify runVariance > 0 unless Sonnet is perfectly deterministic)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Baseline establishes starting point with real Sonnet 4.6 scores
    Tool: Bash (bun run)
    Preconditions: ANTHROPIC_API_KEY set, gold standard file accessible
    Steps:
      1. Run `bun run autoresearch/establish-baseline.js`
      2. Verify `autoresearch/baseline-metric.json` exists
      3. Verify composite score is between 0.3 and 0.9 (sanity check)
      4. Verify perStudent has 25 entries with 3 predictedScores each
      5. Verify generosityShift is 0.0 (baseline by definition)
    Expected Result: Valid baseline metric file with all components
    Failure Indicators: API errors, missing students, composite out of range
    Evidence: .sisyphus/evidence/task-7-baseline.json (copy of baseline-metric.json)

  Scenario: Baseline captures edge-case students
    Tool: Bash (bun run + grep)
    Preconditions: Baseline metric file exists
    Steps:
      1. Find "Jimmerson, Kwan" (gold=2.0) and "Xiong, William" (gold=2.7) in perStudent
      2. Verify their predictedScores exist and are between 0-10
      3. Find "Guzman Rangel, Jimena" (gold=9.0) — strong response
      4. Verify all 3 runs produced scores for these edge cases
    Expected Result: Edge case students are graded in all runs
    Evidence: .sisyphus/evidence/task-7-edge-cases.txt
  ```

  **Commit**: YES (7)
  - Message: `feat(autoresearch): establish baseline metric from current prompts`
  - Files: `autoresearch/establish-baseline.js`, `autoresearch/baseline-metric.json`
  - Pre-commit: `bun test autoresearch/`

- [ ] 8. Loop Controller (Iterate, Compare, Advance/Revert, Convergence Check) + Tests

  **What to do**:
  - RED: Write tests for loop control logic with mock eval harness
  - GREEN: Implement `autoresearch/loop-controller.js`:
    - `runLoop(config)` — The main autonomous loop. Follows Karpathy's pattern exactly:
      1. Load baseline metric and current-best constants
      2. LOOP:
         a. Propose a mutation via mutation engine
         b. Apply mutation to produce new constants
         c. Validate new constants
         d. Run eval harness with new constants (3 runs for variance)
         e. Compute composite metric
         f. **Advance check**: If composite > currentBest AND no per-student regression >2pt AND generalization check passes → ADVANCE (keep new constants, update current-best)
         g. **Discard check**: If composite ≤ currentBest OR regression detected → DISCARD (revert to previous constants)
         h. Log result to results tracker
         i. Check convergence: if no improvement for N iterations (default 10), log and continue (don't stop — try harder, per autoresearch "NEVER STOP" principle)
         j. Check budget: if max iterations OR max time OR max cost exceeded → STOP
      3. Return final results summary
    - `checkAdvance(currentMetric, newMetric, perStudentErrors)` — Decision function:
      - composite improved by ≥0.001 (avoid noise)
      - No single student error increased by >2 points
      - Generalization check on 2 JSONL rubric types doesn't regress
    - `checkConvergence(recentResults, windowSize)` — Detect plateau
    - Config shape:
      ```js
      {
        maxIterations: 100,
        maxTimeMinutes: 480,     // 8 hours
        maxCostDollars: 50,      // API cost cap
        runsPerEval: 3,          // Runs for variance measurement
        improvementThreshold: 0.001,
        maxPerStudentRegression: 2,
        convergenceWindow: 10,   // Iterations without improvement before logging warning
        model: "claude-sonnet-4-6",
        apiKey: process.env.ANTHROPIC_API_KEY
      }
      ```

  **Must NOT do**:
  - Must NOT stop at convergence (autoresearch "NEVER STOP" principle — only stop at budget cap)
  - Must NOT skip the per-student regression check
  - Must NOT skip the generalization check
  - Must NOT advance on improvements smaller than threshold (noise)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core loop logic with complex decision trees, convergence detection, budget management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on most prior tasks)
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 1, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - Karpathy's autoresearch `program.md` — The experiment loop section. Key patterns: advance on improvement, reset on regression, NEVER STOP, timeout handling, crash recovery.
  - `autoresearch/eval-harness.js` (Task 5) — Called by the loop for each iteration
  - `autoresearch/mutation-engine.js` (Task 6) — Called by the loop to propose mutations

  **WHY Each Reference Matters**:
  - Autoresearch's loop structure is the direct model — follow it closely
  - Eval harness and mutation engine are the two core dependencies

  **Acceptance Criteria**:
  - [ ] `autoresearch/loop-controller.js` created
  - [ ] `autoresearch/test/loop-controller.test.js` → PASS (≥10 tests)
  - [ ] Tests cover: advance decision, discard decision, per-student regression rejection, convergence detection, budget cap enforcement
  - [ ] Mock tests run full 5-iteration loop with mock eval/mutations

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Loop advances on genuine improvement and discards regressions
    Tool: Bash (bun test)
    Preconditions: Mock eval harness returning controlled metrics
    Steps:
      1. Mock iteration 1: composite 0.70 (baseline is 0.65) → should ADVANCE
      2. Mock iteration 2: composite 0.68 (lower than 0.70) → should DISCARD
      3. Mock iteration 3: composite 0.72 but student #5 regressed by 3pt → should DISCARD (regression guard)
      4. Mock iteration 4: composite 0.72 with no per-student regression → should ADVANCE
    Expected Result: 2 advances, 2 discards, correct decision logic
    Evidence: .sisyphus/evidence/task-8-advance-discard.txt

  Scenario: Loop respects budget cap and stops cleanly
    Tool: Bash (bun test)
    Preconditions: Mock with maxIterations=5
    Steps:
      1. Run loop with mock eval that always improves
      2. Verify exactly 5 iterations executed
      3. Verify final state is saved before stopping
      4. Verify results log has 5 entries
    Expected Result: Clean stop at budget, no crash
    Evidence: .sisyphus/evidence/task-8-budget-cap.txt
  ```

  **Commit**: YES (8)
  - Message: `feat(autoresearch): add loop controller with advance/revert logic`
  - Files: `autoresearch/loop-controller.js`, `autoresearch/test/loop-controller.test.js`
  - Pre-commit: `bun test autoresearch/`

- [ ] 9. Results Tracking (results.tsv, Git Branch Management, Best-Prompt Snapshots) + Tests

  **What to do**:
  - RED: Write tests for results tracking operations FIRST
  - GREEN: Implement `autoresearch/results-tracker.js`:
    - **results.tsv management**:
      - `initResultsTSV(path)` — Create with header row: `iteration\tcomposite\tgenerosity\tvariance\tedge_cases\twithin1\tconciseness\tprompt_len\tstatus\tdescription`
      - `appendResult(path, result)` — Append one row per experiment
      - Tab-separated (NOT comma — per autoresearch convention)
    - **Git branch management**:
      - `createResearchBranch(tag)` — Create `autoresearch/<tag>` branch from current HEAD
      - `commitAndAdvance(message, files)` — Commit mutated constants + metrics, advance branch
      - `revertToLastAdvance()` — Git reset to last advance point
      - NOTE: Only commit the mutated constants snapshot, NOT the grading-server source files. The loop works on copies.
    - **Best-prompt snapshots**:
      - `saveSnapshot(constants, metric, iteration)` — Save to `autoresearch/snapshots/iteration-{N}.json` with full constants + metric breakdown
      - `loadBestSnapshot()` — Load the snapshot with highest composite score
    - **Cost tracking**:
      - `trackAPICall(model, tokens)` — Track API usage
      - `getRunningCost()` — Estimate cost (Sonnet 4.6 pricing)
      - Approximate cost: ~$0.01-0.05 per student per run → ~$0.75-3.75 per iteration (25 students × 3 runs)

  **Must NOT do**:
  - Must NOT commit to main branch (always on autoresearch/* branch)
  - Must NOT commit grading-server source files (work on copies)
  - Must NOT use comma-separated format (TSV per autoresearch convention)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: File I/O, git operations, cost estimation — operational plumbing
  - **Skills**: [`git-master`]
    - `git-master`: Git branch creation, commit, and reset operations

  **Parallelization**:
  - **Can Run In Parallel**: YES (partially)
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Task 4 (mutation types for result descriptions)

  **References**:

  **Pattern References**:
  - Karpathy's autoresearch `program.md` — Results TSV format: `commit\tval_bpb\tmemory_gb\tstatus\tdescription`. Our adaptation: `iteration\tcomposite\t...\tstatus\tdescription`
  - Karpathy's autoresearch git pattern — Branch per run tag, advance on keep, reset on discard

  **WHY Each Reference Matters**:
  - We're directly adapting autoresearch's tracking conventions to our domain

  **Acceptance Criteria**:
  - [ ] `autoresearch/results-tracker.js` created
  - [ ] `autoresearch/test/results-tracker.test.js` → PASS (≥8 tests)
  - [ ] TSV format correct (tab-separated, proper header)
  - [ ] Git operations tested with temporary repo

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Results TSV appends correctly formatted rows
    Tool: Bash (bun test)
    Preconditions: Fresh results.tsv with header
    Steps:
      1. Append result: {iteration: 1, composite: 0.65, status: "keep", description: "baseline"}
      2. Append result: {iteration: 2, composite: 0.70, status: "keep", description: "removed redundant bullet"}
      3. Append result: {iteration: 3, composite: 0.68, status: "discard", description: "adjusted score-7 descriptor"}
      4. Read file and verify: 1 header + 3 data rows, tab-separated, no commas
    Expected Result: Well-formed TSV with all fields
    Evidence: .sisyphus/evidence/task-9-tsv.txt

  Scenario: Cost tracking estimates budget correctly
    Tool: Bash (bun test)
    Steps:
      1. Track 25 students × 3 runs × ~500 input tokens + ~200 output tokens each
      2. Verify estimated cost is in range $0.50-$5.00 per iteration (sanity check)
      3. Verify running cost accumulates across iterations
    Expected Result: Cost estimate within expected range for Sonnet 4.6 pricing
    Evidence: .sisyphus/evidence/task-9-cost.txt
  ```

  **Commit**: YES (9)
  - Message: `feat(autoresearch): add results tracking with TSV and git management`
  - Files: `autoresearch/results-tracker.js`, `autoresearch/test/results-tracker.test.js`
  - Pre-commit: `bun test autoresearch/`

- [ ] 10. program.md Strategy Guide + CLI Entry Point

  **What to do**:
  - Create `autoresearch/program.md` — the strategy guide for the autonomous agent (mirrors Karpathy's program.md). Content:
    - Setup instructions (branch creation, baseline verification, API key check)
    - Optimization goals explicitly stated:
      1. Grade ~1pt more generously for well-defined responses (gold ≥ 7)
      2. Handle edge cases (blank=0, exceptional=9-10) more reliably
      3. Minimize prompt length — remove redundancy, merge overlapping bullets
      4. Reduce run-to-run variance to the model's precision limit
    - Mutation strategy guidance:
      - Start with REMOVE_BULLET and MERGE_BULLETS (conciseness first — per simplicity criterion)
      - Then REPHRASE_BULLET for clarity and generosity nudges
      - Then ADJUST_DESCRIPTOR for score-level calibration
      - Only ADD_BULLET if a clear edge case gap is identified
    - The experiment loop (same as autoresearch: modify → run → evaluate → keep/discard)
    - NEVER STOP directive (run until budget cap, don't pause for human)
    - Simplicity criterion: "A prompt with fewer words and equal score is always preferred. A 0.001 improvement that adds 50 words? Not worth it. A 0.001 improvement from deleting words? Always keep."
  - Create `autoresearch/loop.js` — CLI entry point:
    - `bun run autoresearch/loop.js` — Start autonomous loop (default config)
    - `bun run autoresearch/loop.js --dry-run` — 1 iteration with mock LLM
    - `bun run autoresearch/loop.js --iterations=N` — Run exactly N iterations
    - `bun run autoresearch/loop.js --tag=mar19` — Custom branch tag
    - `bun run autoresearch/loop.js --budget=25` — Max API cost in dollars
    - Reads `ANTHROPIC_API_KEY` from environment
    - Prints progress after each iteration: `iteration N | composite: 0.72 (+0.02) | status: keep | "removed bullet 5"`

  **Must NOT do**:
  - Must NOT hardcode API keys
  - Must NOT make program.md too long (it should be concise itself — practice what it preaches)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration of all modules into a cohesive CLI + well-crafted strategy document
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 6, 8, 9

  **References**:

  **Pattern References**:
  - Karpathy's autoresearch `program.md` — Direct model for structure: Setup → Experimentation → Output format → Logging → The experiment loop → NEVER STOP
  - `autoresearch/loop-controller.js` (Task 8) — The main loop this CLI invokes
  - `autoresearch/results-tracker.js` (Task 9) — Results and git management

  **WHY Each Reference Matters**:
  - program.md is a direct adaptation of Karpathy's — follow its structure closely
  - Loop controller and results tracker are the runtime components

  **Acceptance Criteria**:
  - [ ] `autoresearch/program.md` created (≤150 lines — concise!)
  - [ ] `autoresearch/loop.js` created with CLI argument parsing
  - [ ] `bun run autoresearch/loop.js --dry-run` completes without error
  - [ ] `bun run autoresearch/loop.js --help` shows usage

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Dry run completes full loop iteration with mock
    Tool: Bash (bun run)
    Preconditions: All modules available
    Steps:
      1. Run `bun run autoresearch/loop.js --dry-run`
      2. Verify output shows: "DRY RUN: iteration 1 | composite: X.XX | status: keep/discard"
      3. Verify no API calls made (mock used)
      4. Verify no git operations performed
    Expected Result: Full iteration simulated without side effects
    Evidence: .sisyphus/evidence/task-10-dry-run.txt

  Scenario: CLI validates required environment variables
    Tool: Bash (bun run)
    Preconditions: ANTHROPIC_API_KEY not set
    Steps:
      1. Unset ANTHROPIC_API_KEY
      2. Run `bun run autoresearch/loop.js --iterations=1`
      3. Verify clear error: "ANTHROPIC_API_KEY required. Set it before running."
    Expected Result: Helpful error message, no crash
    Evidence: .sisyphus/evidence/task-10-env-check.txt
  ```

  **Commit**: YES (10)
  - Message: `feat(autoresearch): add program.md strategy guide and CLI entry point`
  - Files: `autoresearch/program.md`, `autoresearch/loop.js`
  - Pre-commit: `bun run autoresearch/loop.js --dry-run`

- [ ] 11. End-to-End Smoke Test with Mock LLM + 3-Iteration Real Run

  **What to do**:
  - Create `autoresearch/test/e2e.test.js`:
    - **Mock E2E test**: Full loop with mock LLM that returns predetermined scores
      - Verifies: baseline loaded → mutation proposed → eval run → advance/discard → results logged → snapshot saved
      - Uses mock LLM that makes iteration 1 better (advance), iteration 2 worse (discard), iteration 3 better (advance)
      - Verifies results.tsv has 4 rows (baseline + 3 iterations)
      - Verifies 2 snapshots saved (2 advances)
    - **Real 3-iteration test** (separate test, marked as integration):
      - Run `bun run autoresearch/loop.js --iterations=3` with real Sonnet 4.6
      - Verify the loop completes without crashes
      - Verify results.tsv populated with real metrics
      - Verify at least 1 advance or 1 informed discard occurred
      - Verify per-student tracking works for all 25 students
      - Save full terminal output as evidence
  - Also verify: existing grading-server tests still pass after all changes

  **Must NOT do**:
  - Must NOT run real API tests in CI (mark as `skip` unless ANTHROPIC_API_KEY present)
  - Must NOT modify any grading-server files for this task

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex E2E test setup with mocks + real integration test
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all prior tasks)
  - **Parallel Group**: Wave 4 (with Task 12)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 7, 8, 9, 10

  **References**:

  **Pattern References**:
  - All autoresearch modules (Tasks 1-10) — this is the integration test
  - `grading-server/test/grading.test.js` — Vitest conventions

  **Acceptance Criteria**:
  - [ ] `autoresearch/test/e2e.test.js` created
  - [ ] Mock E2E test passes: `bun test autoresearch/test/e2e.test.js`
  - [ ] Real 3-iteration run completes (when API key available)
  - [ ] Grading-server tests still pass: `bun test` in `grading-server/`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Mock E2E runs full 3-iteration loop correctly
    Tool: Bash (bun test)
    Preconditions: All modules available, mock LLM configured
    Steps:
      1. Run `bun test autoresearch/test/e2e.test.js`
      2. Verify mock E2E test passes
      3. Verify results.tsv has baseline + 3 iterations
      4. Verify at least 1 advance and 1 discard in mock results
    Expected Result: Full loop exercises all code paths
    Evidence: .sisyphus/evidence/task-11-mock-e2e.txt

  Scenario: Real 3-iteration run with Sonnet 4.6
    Tool: Bash (bun run)
    Preconditions: ANTHROPIC_API_KEY set
    Steps:
      1. Run `bun run autoresearch/loop.js --iterations=3 --tag=test-run`
      2. Verify no crashes
      3. Verify `autoresearch/results.tsv` has 4 rows
      4. Verify cost tracking shows reasonable amount ($1-$15 range)
      5. Verify at least one mutation was proposed and evaluated
    Expected Result: Real autonomous loop completes 3 iterations with Sonnet 4.6
    Failure Indicators: API timeout, crash, empty results, cost > $20
    Evidence: .sisyphus/evidence/task-11-real-run.txt
  ```

  **Commit**: YES (11)
  - Message: `test(autoresearch): add e2e smoke test and verify real iteration`
  - Files: `autoresearch/test/e2e.test.js`
  - Pre-commit: `bun test autoresearch/`

- [ ] 12. Documentation + Existing Test Regression Check

  **What to do**:
  - Create `autoresearch/README.md` (concise — 80 lines max):
    - What this is (autoresearch-style grading prompt optimization)
    - Quick start: `bun run autoresearch/loop.js`
    - Configuration (env vars, CLI flags)
    - How it works (1-paragraph loop description)
    - Reading results (results.tsv, snapshots/, baseline-metric.json)
    - Applying results (how to promote an optimized prompt to production)
  - Run ALL existing grading-server tests as a final regression check
  - Verify the constants-injection change (Task 3) didn't break anything

  **Must NOT do**:
  - Must NOT write documentation for code that doesn't exist yet
  - Must NOT exceed 80 lines (practice the conciseness principle)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small documentation file + test run
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 11)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 10

  **References**:

  **Pattern References**:
  - Karpathy's autoresearch README.md — Structure: What is it → Quick start → How it works → Project structure
  - `grading-server/README.md` — Project documentation conventions

  **Acceptance Criteria**:
  - [ ] `autoresearch/README.md` created (≤80 lines)
  - [ ] All grading-server tests pass: `bun test` in `grading-server/` → PASS
  - [ ] README covers: quick start, configuration, reading results, applying results

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Existing grading-server tests unbroken by Task 3 changes
    Tool: Bash (bun test)
    Preconditions: grading.js modified with constants-injection
    Steps:
      1. Run `bun test` in `grading-server/`
      2. Verify ALL tests pass (no failures, no skips from our changes)
      3. Compare test count to pre-modification (should be same or +new tests)
    Expected Result: Zero regressions in existing test suite
    Evidence: .sisyphus/evidence/task-12-regression.txt

  Scenario: README is concise and actionable
    Tool: Bash (wc)
    Steps:
      1. Count lines: `wc -l autoresearch/README.md`
      2. Verify ≤ 80 lines
      3. Verify contains: "Quick Start", "bun run autoresearch/loop.js", "results.tsv"
    Expected Result: Concise, actionable documentation under 80 lines
    Evidence: .sisyphus/evidence/task-12-readme-check.txt
  ```

  **Commit**: YES (12)
  - Message: `docs(autoresearch): add README and verify existing tests pass`
  - Files: `autoresearch/README.md`
  - Pre-commit: `bun test` in `grading-server/`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun test` in both `grading-server/` and `autoresearch/`. Review all new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Run `bun run autoresearch/loop.js --iterations=3` with real Sonnet 4.6. Verify: results.tsv populated, baseline-metric.json exists, at least 1 advance or informed discard occurred, per-student tracking works, no error crashes. Save terminal output to `.sisyphus/evidence/final-qa/`.
  Output: `Iterations [N/N complete] | Results tracked [YES/NO] | Edge cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Message | Files | Pre-commit |
|--------|---------|-------|------------|
| 1 | `feat(autoresearch): add metric computation module with TDD` | `autoresearch/metrics.js`, `autoresearch/test/metrics.test.js` | `bun test autoresearch/test/metrics.test.js` |
| 2 | `feat(autoresearch): add gold-standard data loader and JSONL parser` | `autoresearch/data-loader.js`, `autoresearch/test/data-loader.test.js` | `bun test autoresearch/test/data-loader.test.js` |
| 3 | `feat(grading-server): add constants-injection to buildSingleGradePrompt` | `grading-server/grading.js`, `grading-server/test/grading.test.js` | `bun test` in `grading-server/` |
| 4 | `feat(autoresearch): add mutation type definitions and mutation log` | `autoresearch/mutations.js`, `autoresearch/test/mutations.test.js` | `bun test autoresearch/test/mutations.test.js` |
| 5 | `feat(autoresearch): add eval harness with gold-standard grading` | `autoresearch/eval-harness.js`, `autoresearch/test/eval-harness.test.js` | `bun test autoresearch/` |
| 6 | `feat(autoresearch): add mutation engine with structured prompt editing` | `autoresearch/mutation-engine.js`, `autoresearch/test/mutation-engine.test.js` | `bun test autoresearch/` |
| 7 | `feat(autoresearch): establish baseline metric from current prompts` | `autoresearch/baseline-metric.json` | `bun test autoresearch/` |
| 8 | `feat(autoresearch): add loop controller with advance/revert logic` | `autoresearch/loop-controller.js`, `autoresearch/test/loop-controller.test.js` | `bun test autoresearch/` |
| 9 | `feat(autoresearch): add results tracking with TSV and git management` | `autoresearch/results-tracker.js`, `autoresearch/test/results-tracker.test.js` | `bun test autoresearch/` |
| 10 | `feat(autoresearch): add program.md strategy guide and CLI entry point` | `autoresearch/program.md`, `autoresearch/loop.js` | `bun run autoresearch/loop.js --dry-run` |
| 11 | `test(autoresearch): add e2e smoke test and verify real iteration` | `autoresearch/test/e2e.test.js` | `bun test autoresearch/` |
| 12 | `docs(autoresearch): add README and verify existing tests pass` | `autoresearch/README.md` | `bun test` in `grading-server/` |

---

## Success Criteria

### Verification Commands
```bash
# All autoresearch tests pass
bun test autoresearch/                          # Expected: all pass

# Existing grading-server tests unbroken
bun test                                         # Expected: all pass (in grading-server/)

# Dry run completes without error
bun run autoresearch/loop.js --dry-run           # Expected: 1 mock iteration, results logged

# Real 3-iteration run completes
bun run autoresearch/loop.js --iterations=3      # Expected: 3 iterations, results.tsv populated

# Baseline metric exists
cat autoresearch/baseline-metric.json            # Expected: valid JSON with composite score
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (autoresearch/ AND grading-server/)
- [ ] Baseline metric established
- [ ] Dry-run completes end-to-end
- [ ] 3-iteration real run completes with Sonnet 4.6
- [ ] Results TSV populated with experiment log
