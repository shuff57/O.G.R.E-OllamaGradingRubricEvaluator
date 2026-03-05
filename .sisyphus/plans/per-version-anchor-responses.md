# Per-Version AI Anchor Responses

## TL;DR

> **Quick Summary**: Replace static percentage-based scoring anchors with AI-generated example student responses tailored to each question version. In review mode, grading pauses to show these AI anchors for user review/editing. In auto mode, anchors generate but grading proceeds without pausing.
> 
> **Deliverables**:
> - Modified `$effect` in `BatchPanel.svelte` that calls `generateAnchors()` API instead of computing static anchors
> - Auto-continue logic for auto mode (bypasses review phase after anchors generate)
> - Version-chaining anchor regeneration (new AI anchors when version advances)
> - Fallback to static `computeScoringAnchors()` on AI generation failure
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
"Update the batch grader to generate generic anchor responses per version. In review mode the grading would stop to show you the anchor responses, auto runs start to finish. This way the scoring anchors are tailored to each version of every different question."

### Interview Summary
**Key Discussions**:
- Per-student review mode (`isReviewMode` toggle) is KEPT alongside the new anchor review — they serve different purposes
- Auto mode: AI anchors still generate but grading proceeds without pausing at the review phase
- Review mode: Grading pauses at review phase showing AI-generated anchor responses in the textarea for user editing

**Research Findings**:
- `POST /api/generate-anchors` endpoint already exists server-side (`server.js:1261-1291`) — takes rubric, returns AI-written example student responses at 4 tiers (Excellent, Adequate, Below Average, Minimal)
- `generateAnchors()` client-side function already exists in `grading-api.ts:719-758` — calls the server endpoint, returns `AnchorResponse[]`
- The review phase (`batchPhase === 'review'`) ALWAYS shows regardless of auto/review mode. The `isReviewMode` toggle only controls per-student approve/skip during grading — NOT the pre-grading review phase
- Current `$effect` at `BatchPanel.svelte:927-937` computes static anchors synchronously when `batchPhase` enters `'review'`

### Metis Review
**Identified Gaps** (addressed):
- Dual-anchor collision risk: Server's `buildBatchPrompt()` injects `SCORING ANCHORS` (static thresholds), AND client sends `SCORING CALIBRATION:` via `customInstructions`. Both end up in the grading prompt → Resolved: AI anchors replace the static text in `anchorText`, so the `SCORING CALIBRATION:` section will contain AI-generated examples instead. Server-side static anchors in `buildBatchPrompt()` remain untouched (different purpose: chunk bridging)
- Must validate `provider` and `model` are non-empty before calling `generateAnchors()` API — if either is empty, fall back to static anchors
- Must NOT modify `isReviewMode` semantics — it means per-student review, not anchor review
- Must NOT modify server-side `generateScoringAnchors()` in `grading.js` or `buildBatchPrompt()`

---

## Work Objectives

### Core Objective
Replace the synchronous static anchor computation in BatchPanel.svelte's `$effect` with an async call to the AI anchor generation API, producing rubric-tailored example student responses at 4 quality tiers for each question version.

### Concrete Deliverables
- Modified `BatchPanel.svelte:927-937` — async AI anchor generation with fallback
- Auto-mode bypass logic — auto-call `handleContinueGrading()` after anchors generate when `isReviewMode === false`
- Version-chaining anchor regeneration in `handleSSEDone` — regenerate AI anchors before starting next version
- Import of `generateAnchors` added to `BatchPanel.svelte` imports

### Definition of Done
- [x] `bun run build` in `ogre-desktop` succeeds with no TypeScript errors
- [x] In review mode: batch reaches `'review'` phase, shows "Generating examples..." spinner, then shows AI-generated anchor text in textarea
- [x] In auto mode: batch reaches `'review'` phase, generates AI anchors, then auto-continues to grading without user interaction
- [x] On version chain: when advancing to next version, AI anchors regenerate for the new version's rubric
- [x] On AI failure: falls back to static `computeScoringAnchors()` output — no crash, no blank anchors

### Must Have
- AI-generated anchor responses shown in the Scoring Anchors textarea during review phase
- Spinner + "Generating examples..." UI feedback during anchor generation
- Fallback to static anchors on API failure (network error, empty provider/model)
- Auto-continue to grading in auto mode after anchors complete
- Anchor regeneration on version change

### Must NOT Have (Guardrails)
- Must NOT rename or change `isReviewMode` semantics — it means per-student review
- Must NOT modify server-side files (`grading.js`, `server.js`)
- Must NOT modify the `computeScoringAnchors()` function itself — it serves as fallback
- Must NOT modify `grading-api.ts` — `generateAnchors()` already exists and works
- Must NOT remove the `SCORING CALIBRATION:` injection in `handleContinueGrading()` — AI anchor text will flow through it naturally
- Must NOT add new dependencies

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (no test framework set up in ogre-desktop)
- **Automated tests**: None
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **Build verification**: Use Bash — `npm run build` in ogre-desktop

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — core implementation):
├── Task 1: Add generateAnchors import + replace $effect with async AI anchor generation [deep]
└── Task 2: Add auto-mode bypass logic (auto-continue after anchors) [deep]

NOTE: Tasks 1 and 2 CANNOT be parallel — they modify the same $effect block.
Task 2 depends on Task 1's changes being in place.

Wave 2 (After Wave 1 — version chaining + verification):
├── Task 3: Add anchor regeneration in version-chaining flow [quick]
└── Task 4: Build verification + QA [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → F1-F4
Parallel Speedup: ~30% (Tasks 3+4 parallel in Wave 2, F1-F4 parallel in final)
Max Concurrent: 4 (Final wave)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1    | —         | 2, 3   | 1    |
| 2    | 1         | 4      | 1    |
| 3    | 1         | 4      | 2    |
| 4    | 2, 3      | F*     | 2    |
| F1-F4| 4         | —      | FINAL|

### Agent Dispatch Summary

- **Wave 1**: 2 tasks sequential — T1 → `deep`, T2 → `deep`
- **Wave 2**: 2 tasks parallel — T3 → `quick`, T4 → `unspecified-high`
- **FINAL**: 4 tasks parallel — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Add `generateAnchors` import and replace `$effect` with async AI anchor generation

  **What to do**:
  1. In `BatchPanel.svelte`, add `generateAnchors` to the import from `../../lib/grading-api` (line 25). The import already includes `startBatchGrading` — add `generateAnchors` alongside it, plus import the `type AnchorResponse` from the same module.
  2. Replace the `$effect` block at lines 927-937 with an async IIFE that:
     - Immediately sets `anchorGenerating = true`
     - Shows static anchors as placeholder text (call existing `computeScoringAnchors()` via `scoringAnchors` derived state)
     - Guards: if `provider` or `model` is empty, skip AI call and keep static anchors
     - Calls `generateAnchors({ provider, model, rubric: { essayPrompt: extractedRubric.essayPrompt, checklistItems: extractedRubric.checklistItems, rubricItems: extractedRubric.rubricItems, modelText: extractedRubric.modelText, maxScore: rubricMaxScore } })`
     - On success: format the `AnchorResponse[]` into textarea text: `"${label} (${score}/${maxScore}): ${response}"` joined by `\n\n` (double newline for readability since responses are multi-line)
     - On failure (catch block): log warning to console, keep the static anchor text already showing — do NOT clear it
     - Finally: set `anchorGenerating = false`
  3. The `$effect` must still track `batchPhase` reactively (read it inside the effect body to subscribe). Use `untrack()` for everything else (`scoringAnchors`, `rubricMaxScore`, `provider`, `model`, `extractedRubric`) to avoid re-triggering.

  **Must NOT do**:
  - Do NOT modify `computeScoringAnchors()` function (lines 879-912)
  - Do NOT modify `scoringAnchors` derived state (lines 914-921)
  - Do NOT modify `grading-api.ts` — `generateAnchors()` already exists
  - Do NOT touch server files
  - Do NOT change the anchor UI template (lines 1028-1050)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding Svelte 5 reactivity (`$effect`, `untrack`, `$derived`), async patterns inside effects, and the full anchor generation pipeline across client+server
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures TypeScript best practices, proper error handling, no `as any`
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed for implementation — QA is in Task 4
    - `vercel-react-best-practices`: This is Svelte, not React

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential with Task 2)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:927-937` — Current `$effect` block to replace. Shows the reactive pattern: tracks `batchPhase`, uses `untrack()` for other reads
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:879-912` — `computeScoringAnchors()` function. Returns `AnchorItem[]` with `{ label, score, description, colorClass }`. Use `scoringAnchors` derived state (line 914) to get the static output for fallback placeholder
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:922-923` — `anchorText` and `anchorGenerating` state variables. Set `anchorText` to formatted string, `anchorGenerating` to true/false for spinner
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:25` — Current import line for `startBatchGrading` — add `generateAnchors` here

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/grading-api.ts:694-712` — `AnchorResponse` interface and `GenerateAnchorsRequest` interface. The response shape is `{ label: string, score: number, maxScore: number, response: string }`
  - `ogre-desktop/src/lib/grading-api.ts:719-758` — `generateAnchors()` function signature. Takes `GenerateAnchorsRequest`, returns `Promise<AnchorResponse[]>`. Throws `GradingApiError` on network failure
  - `grading-server/server.js:1261-1291` — Server endpoint for reference only (DO NOT MODIFY). Shows the request shape: `{ provider, model, rubric }` where rubric contains `{ essayPrompt, checklistItems, rubricItems, modelText, maxScore }`

  **Context References** (state variables used in the effect):
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:45-46` — `provider` and `model` props. Both are strings, may be empty
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:56` — `extractedRubric` bindable prop of type `Rubric | null`
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:55` — `rubricMaxScore` bindable prop, string default `'10'`

  **Acceptance Criteria**:
  - [ ] `generateAnchors` is imported from `../../lib/grading-api` in BatchPanel.svelte
  - [ ] `AnchorResponse` type is imported (for typing the API response)
  - [ ] `$effect` block calls `generateAnchors()` when `batchPhase === 'review'`
  - [ ] Static anchors shown immediately as placeholder while AI generates
  - [ ] On AI success: `anchorText` contains AI-generated example student responses formatted as `"Label (score/max): response text"`
  - [ ] On AI failure: `anchorText` retains static anchor text, console warning logged
  - [ ] `anchorGenerating` is `true` during API call, `false` after (success or failure)
  - [ ] Guard: if `provider` or `model` is empty string, skip AI call entirely and keep static anchors
  - [ ] Effect does NOT re-trigger on `provider`/`model`/`extractedRubric` changes (all read inside `untrack()`)
  - [ ] `npm run build` passes in ogre-desktop

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after modification
    Tool: Bash
    Preconditions: ogre-desktop directory exists with package.json
    Steps:
      1. Run `npm run build` in ogre-desktop directory
      2. Check exit code is 0
      3. Check stderr for TypeScript errors
    Expected Result: Build completes with exit code 0, no TS errors
    Failure Indicators: Non-zero exit code, "error TS" in output
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: generateAnchors import present and $effect uses it
    Tool: Bash (grep)
    Preconditions: Task 1 implementation complete
    Steps:
      1. Grep BatchPanel.svelte for `import.*generateAnchors.*from.*grading-api`
      2. Grep BatchPanel.svelte for `generateAnchors(` call inside the $effect
      3. Grep BatchPanel.svelte for `anchorGenerating = true` and `anchorGenerating = false`
    Expected Result: All three patterns found
    Failure Indicators: Any pattern missing
    Evidence: .sisyphus/evidence/task-1-import-check.txt

  Scenario: Fallback guard for empty provider/model
    Tool: Bash (grep)
    Preconditions: Task 1 implementation complete
    Steps:
      1. Read the $effect block in BatchPanel.svelte
      2. Verify there is a conditional check for empty `provider` or `model` before calling `generateAnchors()`
    Expected Result: Guard clause exists that skips AI call when provider/model is empty
    Failure Indicators: No guard, or guard after the API call
    Evidence: .sisyphus/evidence/task-1-guard-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-build-check.txt — npm run build output
  - [ ] task-1-import-check.txt — grep results for import and usage
  - [ ] task-1-guard-check.txt — grep results for provider/model guard

  **Commit**: NO (groups with Task 2)

- [x] 2. Add auto-mode bypass logic (auto-continue after AI anchors generate)

  **What to do**:
  1. Inside the `$effect` async IIFE (created in Task 1), AFTER anchors have been set (both success and fallback paths), add a check:
     ```
     if (!untrack(() => isReviewMode)) {
       // Auto mode: skip review, proceed directly to grading
       // Use setTimeout to break out of the $effect synchronous context
       setTimeout(() => handleContinueGrading(), 0);
     }
     ```
  2. This check must be AFTER `anchorGenerating = false` is set (in the `finally` block or after both success/error paths)
  3. The `setTimeout(..., 0)` is critical — `handleContinueGrading()` sets `batchPhase = 'grading'` which would trigger other effects. Breaking out of the current effect context prevents Svelte reactivity issues.
  4. Important: the `isReviewMode` read must be inside `untrack()` since we don't want the effect to re-run when the toggle changes.

  **Must NOT do**:
  - Do NOT modify the `handleContinueGrading()` function itself
  - Do NOT change when `batchPhase` transitions to `'review'` — the review phase still happens, auto-mode just doesn't STOP there
  - Do NOT skip anchor generation in auto mode — anchors still generate and get injected into `customInstructions` via `anchorText`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful understanding of Svelte 5 effect lifecycle, async timing, and the interaction between `$effect` re-triggering and `batchPhase` state transitions
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures correct async patterns and no race conditions
  - **Skills Evaluated but Omitted**:
    - `playwriter`: QA is in Task 4

  **Parallelization**:
  - **Can Run In Parallel**: NO (modifies same $effect block as Task 1)
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:927-937` — The `$effect` block being modified (now contains Task 1's async IIFE)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:466-587` — `handleContinueGrading()` function. Must be called via `setTimeout` to avoid effect-within-effect issues. It sets `batchPhase = 'grading'` at line 537
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:88` — `isReviewMode` state variable. When `false` = auto mode, when `true` = review mode (per-student approve/skip)

  **Context References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1052-1060` — "Continue Grading" button in review phase. In review mode, user clicks this manually. In auto mode, this is bypassed by the auto-continue logic
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1063-1079` — Auto/Review toggle UI. Confirms `isReviewMode` controls per-student review, NOT the anchor review pause

  **Acceptance Criteria**:
  - [ ] When `isReviewMode === false` (auto mode): grading starts automatically after anchors generate — user never sees review phase pause
  - [ ] When `isReviewMode === true` (review mode): grading PAUSES at review phase, user sees anchors in textarea and must click "Continue Grading"
  - [ ] Auto-continue uses `setTimeout` to break out of `$effect` context
  - [ ] `isReviewMode` is read inside `untrack()` within the effect
  - [ ] `npm run build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auto-continue logic present in $effect
    Tool: Bash (grep)
    Preconditions: Task 2 implementation complete
    Steps:
      1. Read the $effect block in BatchPanel.svelte
      2. Verify `isReviewMode` check exists after anchor generation
      3. Verify `handleContinueGrading` is called inside `setTimeout`
    Expected Result: Pattern `setTimeout(() => handleContinueGrading()` found after anchor generation completes
    Failure Indicators: No auto-continue logic, or `handleContinueGrading` called directly (no setTimeout)
    Evidence: .sisyphus/evidence/task-2-auto-continue-check.txt

  Scenario: Build succeeds with auto-continue logic
    Tool: Bash
    Preconditions: Task 2 implementation complete
    Steps:
      1. Run `npm run build` in ogre-desktop directory
    Expected Result: Build completes with exit code 0
    Failure Indicators: TypeScript errors
    Evidence: .sisyphus/evidence/task-2-build-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-auto-continue-check.txt — grep/read results showing auto-continue pattern
  - [ ] task-2-build-check.txt — npm run build output

  **Commit**: YES
  - Message: `feat(batch): replace static scoring anchors with AI-generated per-version anchor responses`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [x] 3. Add anchor regeneration in version-chaining flow

  **What to do**:
  1. In `handleSSEDone()` (line 690), find the version-chaining block at lines 703-712 where `batchGrader.advanceVersion()` is called
  2. After `updateVersionDisplay()` (line 707) and before `handleContinueGrading()` (line 711), add AI anchor regeneration:
     - Set `anchorGenerating = true`
     - Build the rubric for the new version: `const versionRubric = batchGrader.getRubricForVersion(currentVersionIndex);`
     - If `provider` and `model` are non-empty AND `versionRubric` exists:
       - Call `generateAnchors({ provider, model, rubric: { essayPrompt: versionRubric.essayPrompt, checklistItems: versionRubric.checklistItems, rubricItems: versionRubric.rubricItems, modelText: versionRubric.modelText, maxScore: versionRubric.maxScore || rubricMaxScore } })`
       - On success: format `AnchorResponse[]` into `anchorText` (same format as Task 1)
       - On failure: compute static anchors as fallback using `computeScoringAnchors()` and format them into `anchorText`
     - Set `anchorGenerating = false`
  3. The `handleContinueGrading()` call at line 711 must happen AFTER anchor regeneration completes (await the async work)
  4. Since `handleSSEDone` is already `async`, this is straightforward — just `await` the anchor generation

  **Must NOT do**:
  - Do NOT modify the version detection/advancement logic (`advanceVersion()`, `getStudentsForVersion()`)
  - Do NOT change the brief pause at line 710 (`await new Promise(r => setTimeout(r, 500))`)
  - Do NOT skip `handleContinueGrading()` — it must still be called after anchors regenerate

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, scoped change — insert anchor regeneration into an existing async flow at a specific location
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Error handling patterns
  - **Skills Evaluated but Omitted**:
    - `playwriter`: QA is in Task 4

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 4 in Wave 2)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 4 (but runs parallel since both are in Wave 2 and Task 4 can start its build check after Task 3 finishes)
  - **Blocked By**: Task 1 (needs the anchor formatting pattern established in Task 1)

  **References** (CRITICAL):

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:690-713` — `handleSSEDone()` function with version-chaining block. Lines 703-712 are the exact insertion point: after `updateVersionDisplay()` (707), before `handleContinueGrading()` (711)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:927-937` — The `$effect` block (modified by Tasks 1+2). Copy the same AI anchor formatting pattern used there for consistency
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:592-599` — `updateVersionDisplay()` function. Shows how `batchGrader.getRubricForVersion()` is used — follow this pattern to get the version-specific rubric

  **API/Type References**:
  - `ogre-desktop/src/lib/grading-api.ts:719-758` — `generateAnchors()` function (same as Task 1)
  - `ogre-desktop/src/lib/batch-grader.ts` — `getRubricForVersion()` returns `Rubric | null` for the given version index

  **Acceptance Criteria**:
  - [ ] When version chains (multi-version batch), AI anchors are regenerated for each new version
  - [ ] New version's rubric (especially `essayPrompt`) is used for anchor generation, not the previous version's
  - [ ] Fallback to static anchors if AI generation fails during version chain
  - [ ] `handleContinueGrading()` is still called after anchor regeneration (not skipped)
  - [ ] `npm run build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Version-chain anchor regeneration code present
    Tool: Bash (grep)
    Preconditions: Task 3 implementation complete
    Steps:
      1. Read `handleSSEDone` function in BatchPanel.svelte
      2. Verify `generateAnchors` is called within the version-chaining block (between advanceVersion and handleContinueGrading)
      3. Verify `anchorGenerating` is set to true/false around the call
    Expected Result: `generateAnchors` call found inside version-chaining block with proper state management
    Failure Indicators: No anchor regeneration in version chain, or missing error handling
    Evidence: .sisyphus/evidence/task-3-version-chain-check.txt

  Scenario: Build succeeds with version-chain changes
    Tool: Bash
    Preconditions: Task 3 implementation complete
    Steps:
      1. Run `npm run build` in ogre-desktop directory
    Expected Result: Build completes with exit code 0
    Failure Indicators: TypeScript errors
    Evidence: .sisyphus/evidence/task-3-build-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-version-chain-check.txt — grep/read of handleSSEDone showing anchor regeneration
  - [ ] task-3-build-check.txt — npm run build output

  **Commit**: YES
  - Message: `feat(batch): regenerate AI anchors on version chain advance`
  - Files: `ogre-desktop/src/components/grading/BatchPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [x] 4. Full build verification and end-to-end QA

  **What to do**:
  1. Run `npm run build` in ogre-desktop and verify zero errors
  2. Read the entire modified `$effect` block and `handleSSEDone` version-chain block to verify:
     - Correct import of `generateAnchors` and `AnchorResponse`
     - Proper `untrack()` usage (provider, model, extractedRubric, isReviewMode, scoringAnchors all untracked)
     - Error handling in both AI call sites (try/catch with fallback)
     - `anchorGenerating` state management (true before call, false after in all paths)
     - Auto-continue logic only fires when `isReviewMode === false`
     - Version-chain regeneration awaits before calling `handleContinueGrading()`
  3. Verify no forbidden files were modified: check `grading.js`, `server.js`, `grading-api.ts` are untouched
  4. Take screenshots of key code sections as evidence

  **Must NOT do**:
  - Do NOT make code changes — this is verification only
  - Do NOT modify any files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Thorough verification requiring careful code reading and build validation across multiple files
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Code quality checklist for review
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Desktop app requires Tauri runtime — can't launch via Playwright in CI-like verification

  **Parallelization**:
  - **Can Run In Parallel**: YES (runs after Task 3 completes, parallel with nothing — last in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Final verification wave
  - **Blocked By**: Tasks 2, 3

  **References** (CRITICAL):

  **Files to Verify**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte` — All modifications from Tasks 1-3
  - `ogre-desktop/src/lib/grading-api.ts` — Must be UNMODIFIED (verify with git diff)
  - `grading-server/grading.js` — Must be UNMODIFIED
  - `grading-server/server.js` — Must be UNMODIFIED

  **Acceptance Criteria**:
  - [ ] `npm run build` passes with zero TypeScript errors
  - [ ] `generateAnchors` import present in BatchPanel.svelte
  - [ ] `$effect` uses async IIFE with try/catch/finally pattern
  - [ ] Static anchors shown as placeholder, replaced by AI anchors on success
  - [ ] Fallback to static anchors on failure (no blank textarea)
  - [ ] Auto-continue fires only when `isReviewMode === false`
  - [ ] Version-chain calls `generateAnchors` before `handleContinueGrading`
  - [ ] No modifications to grading-api.ts, grading.js, or server.js

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build verification
    Tool: Bash
    Preconditions: All tasks 1-3 complete
    Steps:
      1. Run `npm run build` in ogre-desktop directory
      2. Capture full output including any warnings
    Expected Result: Build succeeds, exit code 0, no TypeScript errors
    Failure Indicators: Non-zero exit code, "error TS" in output
    Evidence: .sisyphus/evidence/task-4-build-full.txt

  Scenario: Forbidden files unmodified
    Tool: Bash (git diff)
    Preconditions: All tasks 1-3 complete
    Steps:
      1. Run `git diff --name-only` to see all changed files
      2. Verify `grading-server/grading.js` is NOT in the diff
      3. Verify `grading-server/server.js` is NOT in the diff
      4. Verify `ogre-desktop/src/lib/grading-api.ts` is NOT in the diff
    Expected Result: Only `ogre-desktop/src/components/grading/BatchPanel.svelte` appears in diff
    Failure Indicators: Any forbidden file appears in git diff
    Evidence: .sisyphus/evidence/task-4-forbidden-files.txt

  Scenario: Code pattern verification
    Tool: Bash (grep + read)
    Preconditions: All tasks 1-3 complete
    Steps:
      1. Grep for `import.*generateAnchors` in BatchPanel.svelte
      2. Grep for `anchorGenerating = true` — should appear at least twice (effect + version chain)
      3. Grep for `setTimeout.*handleContinueGrading` — auto-continue pattern
      4. Read the handleSSEDone function to verify anchor regeneration before handleContinueGrading
    Expected Result: All patterns found, code structure matches plan
    Failure Indicators: Missing patterns or incorrect placement
    Evidence: .sisyphus/evidence/task-4-code-patterns.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-build-full.txt — complete npm run build output
  - [ ] task-4-forbidden-files.txt — git diff --name-only output
  - [ ] task-4-code-patterns.txt — grep results for all key patterns

  **Commit**: NO (verification only, no changes)

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check import, check function call). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build` in ogre-desktop. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Verify: (1) Review mode shows spinner → AI anchors in textarea, (2) Auto mode generates anchors then auto-continues, (3) Version chain regenerates anchors, (4) Kill server mid-anchor-gen → falls back to static anchors. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Detect modifications to `grading.js`, `server.js`, or `grading-api.ts` — these are FORBIDDEN. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Forbidden Files [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **After Task 2**: `feat(batch): replace static scoring anchors with AI-generated per-version anchor responses` — `ogre-desktop/src/components/grading/BatchPanel.svelte`
- **After Task 3**: `feat(batch): regenerate AI anchors on version chain advance` — `ogre-desktop/src/components/grading/BatchPanel.svelte`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build  # Expected: Build succeeds, no TypeScript errors
```

### Final Checklist
- [x] AI-generated anchor responses appear in Scoring Anchors textarea during review
- [x] Spinner shows "Generating examples..." while AI anchors generate
- [x] Auto mode: grading starts automatically after AI anchors complete (no pause)
- [x] Review mode: grading pauses at review phase for user to edit anchors
- [x] Version chain: AI anchors regenerate when advancing to next version
- [x] Fallback: static anchors shown when AI generation fails
- [x] `isReviewMode` toggle still controls per-student approve/skip (unchanged)
- [x] No modifications to `grading.js`, `server.js`, or `grading-api.ts`
- [x] `npm run build` passes with zero errors
