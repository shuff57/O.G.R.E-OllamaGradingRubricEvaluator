# Gradebook Pipeline — In-App Platform-Agnostic Sync Engine

## TL;DR

> **Quick Summary**: Bake a platform-agnostic gradebook sync pipeline into the OGRE desktop app. Users open Source and Target gradebook tabs, the pipeline compares assignments, creates missing ones, and syncs scores — all guided by site profiles. Then build a teach→save→replay framework so users can train the bot on new workflows and save them as reusable skills.
> 
> **Deliverables**:
> - Source/Target tab designation UI on existing multi-tab browser
> - TypeScript assignment matching, student matching, and score normalization engines
> - Pipeline orchestrator (compare → create → sync) with dry-run preview
> - Agent multi-tab awareness (tabId threading through agent loop)
> - CDP multi-target switching (validated via spike)
> - Workflow recording controller (captures AgentEvent stream)
> - Workflow replay controller (replays steps without AI)
> - Workflow skill creation prompt (parallel to grading SKILL_CREATION_PROMPT)
> - Pipeline UI panel for progress, diffs, and confirmations
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 7 waves
> **Critical Path**: Task 1 (CDP spike) → Task 5 (tabId threading) → Task 9 (pipeline orchestrator) → Task 12 (write stage) → Task 15 (pipeline UI integration) → Task 17 (workflow recorder) → Final Verification

---

## Context

### Original Request
> "bake the gradebook pipeline into the app but it references the two tabs that are open in the browser view, the gb-pipeline should be gradebook agnostic, using the site profile as the main guidance for interaction. Then potentially use the chat space to tell the bot exactly the flow and steps for clicks to create assignments and sure up gbs across platforms, then the user should be able to save their steps as a specific skill for the bot to use in the future"

### Interview Summary
**Key Discussions**:
- **Source/Target designation**: UI badge/tag on each tab ("Source" / "Target") — user confirmed
- **Teaching method**: ALL THREE — natural language chat, demonstrate-by-doing, AND hybrid chat+corrections
- **V1 scope**: Full pipeline first (compare + create + sync), THEN build teach→save→replay framework
- **Multi-tab**: Tab bar (already exists) + option for split view (future, excluded from V1)
- **Matching logic**: TypeScript utilities as primary, AI fallback for edge cases (V2)
- **Skill granularity**: Both — one orchestrator skill per platform pair that references modular sub-skills
- **Test strategy**: TDD with vitest (infrastructure already exists)

**Research Findings**:
- **Multi-tab already exists**: `Browser.svelte` has full tab bar UI, `browser.ts` has `tabId` on all WebView functions, Rust backend supports `tabId` in `HashMap<String, String>`
- **CDP singleton is the #1 risk**: Single `CDPClient` instance connected to ONE target. Multi-tab requires CDP target switching validated via spike
- **Agent loop hardcoded to single tab**: `getEmbeddedUrl()` uses `_activeTabId`, `navigateAction` calls `getActiveTabId()` — needs tabId threading
- **Pipeline patterns reusable**: Assignment matching, student fuzzy matching, diff classification, score normalization, orchestration stages — all portable from skill markdown to TypeScript
- **Site profiles are the agent's guide**: Schema B markdown docs (aeries.md, myopenmath.md) already auto-inject into agent context via `buildSiteContextInjection(url)`
- **AgentEvent stream is the recording surface**: 9 event types in async generator — recorder wraps this externally
- **Skill system already works**: `saveSkill()` with `url_pattern` and `source` field — just needs new `source='workflow'` type
- **BatchGrader pattern**: Stateful multi-step coordinator with resume — model for pipeline orchestrator

### Metis Review
**Identified Gaps** (addressed):
- **CDP multi-target is stop/go gate**: Must validate before any pipeline code — Task 1 is a spike
- **`navigateAction` hardcodes `getActiveTabId()`**: Fixed in Task 5 (tabId threading)
- **Pipeline must own tab references independently of UI**: Guardrail G1 — pipeline receives explicit tab refs
- **Aeries auto-saves on blur — no undo**: Guardrail G2 — dry-run/preview mandatory before writes
- **Agent loop internals must not be forked**: Guardrail G3 — pipeline wraps, doesn't modify `runLoop()`
- **Stale data between extraction and write**: Edge case addressed — timestamp check before writes
- **Partial pipeline failure**: Atomic operation logging with resume-from-failure point
- **Duplicate assignment creation**: Idempotency check before creating
- **Session timeout**: Health check before write stage
- **Score overwrite policy**: Configurable (skip existing / overwrite if different / overwrite all)

---

## Work Objectives

### Core Objective
Transform OGRE from a grading-only desktop app into a gradebook sync platform by baking a platform-agnostic pipeline into the app, using existing multi-tab browser infrastructure and site profiles to guide agent interaction with any gradebook.

### Concrete Deliverables
- `src/lib/pipeline/assignment-matcher.ts` — Assignment name matching with configurable threshold
- `src/lib/pipeline/student-matcher.ts` — Student name fuzzy matching with format normalization
- `src/lib/pipeline/score-normalizer.ts` — Score format conversion across platforms
- `src/lib/pipeline/comparison-report.ts` — ComparisonReport type and diff generator
- `src/lib/pipeline/orchestrator.ts` — Pipeline state machine (compare → create → sync)
- `src/lib/pipeline/types.ts` — Shared pipeline type definitions
- `src/lib/cdp-multi-target.ts` — CDP target switching utility for multi-tab
- Updated `src/lib/agent-loop.ts` — tabId in AgentLoopConfig, threaded through operations
- Updated `src/lib/browser-actions.ts` — tabId parameter on navigateAction and executeAction
- Updated `src/pages/Browser.svelte` — Tab role designation UI (Source/Target badges)
- `src/lib/pipeline/workflow-recorder.ts` — Records AgentEvent stream as declarative step arrays
- `src/lib/pipeline/workflow-replay.ts` — Replays recorded steps without AI
- `src/lib/workflow-creation-prompt.ts` — Interview prompt for workflow skill creation
- `src/components/pipeline/PipelinePanel.svelte` — Pipeline progress, diff view, confirmations

### Definition of Done
- [ ] `npx vitest run src/lib/pipeline/` — all tests pass
- [ ] Pipeline can compare assignments between two open tabs and produce a ComparisonReport
- [ ] Pipeline can create missing assignments in target tab with user confirmation
- [ ] Pipeline can sync scores from source to target with dry-run preview
- [ ] Agent operates on specified tab (not just active tab) via tabId
- [ ] User can designate tabs as Source/Target via UI
- [ ] User can record a workflow, save it as a skill, and replay it

### Must Have
- CDP multi-target validation spike (stop/go gate)
- TypeScript matching utilities with full test suites (zero browser deps)
- tabId threading through agent-loop and browser-actions
- Source/Target tab designation UI
- Pipeline orchestrator with dry-run preview
- Workflow recording and replay controllers
- All matching logic is deterministic TypeScript — no AI in the matching path

### Must NOT Have (Guardrails)
- **G1**: Pipeline MUST NOT rely on `_activeTabId` or global `cdp` singleton — receives explicit tab refs
- **G2**: No destructive writes without explicit user confirmation — dry-run preview mandatory
- **G3**: Existing `createAgentController()` and `runLoop()` internals MUST NOT be modified — pipeline wraps, doesn't fork
- **G4**: No DB schema migrations for matching utilities — pure functions only
- **G5**: Workflow recorder is an observer — does NOT modify `runLoop()` internals or inject events
- **G6**: Site profiles are reference data for AI — pipeline orchestrator TypeScript logic MUST NOT parse profile markdown
- **G7**: No Canvas/Blackboard/Moodle connectors — V1 is MOM→Aeries architecture, but platform-agnostic interfaces
- **G8**: No visual workflow editor or drag-and-drop pipeline designer
- **G9**: No AI calls in matching utilities — TypeScript-only for V1
- **G10**: No split-view tab layout — V1 uses existing tab bar with role badges only
- **G11**: Recorded workflows stored as declarative step arrays in skill `content` field — NOT executable code
- **G12**: No overwriting existing scores without user-configured policy (skip/overwrite-if-different/overwrite-all)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES (vitest configured in `ogre-desktop/vitest.config.ts`)
- **Automated tests**: YES (TDD — RED→GREEN→REFACTOR)
- **Framework**: vitest
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Pure TypeScript modules**: Use Bash (`npx vitest run ...`) — run tests, assert pass counts
- **UI components**: Use Playwright (playwright skill) — Navigate app, interact, assert DOM, screenshot
- **Agent/CDP integration**: Use Bash (`npx vitest run ...`) — mocked CDP tests
- **Pipeline E2E**: Use Playwright — open two tabs, run pipeline, verify results

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — spike + pure utilities, MAX PARALLEL):
├── Task 1: CDP multi-target spike [deep] ⚡ STOP/GO GATE
├── Task 2: Pipeline type definitions [quick]
├── Task 3: Assignment matcher (TDD) [deep]
├── Task 4: Student matcher (TDD) [deep]

Wave 2 (After Wave 1 — more utilities + infra, PARALLEL):
├── Task 5: tabId threading through agent-loop + browser-actions [unspecified-high]
├── Task 6: Score normalizer (TDD) [deep]
├── Task 7: CDP multi-target utility module [unspecified-high]
├── Task 8: Comparison report generator (TDD) [deep]

Wave 3 (After Wave 2 — pipeline core + UI, PARALLEL):
├── Task 9: Pipeline orchestrator — compare stage [deep]
├── Task 10: Tab role designation UI (Source/Target badges) [visual-engineering]
├── Task 11: Pipeline configuration types + overwrite policy [quick]

Wave 4 (After Wave 3 — pipeline write stages, PARALLEL):
├── Task 12: Pipeline orchestrator — create-missing stage [deep]
├── Task 13: Pipeline orchestrator — sync-scores stage [deep]
├── Task 14: Pipeline progress event system [unspecified-high]

Wave 5 (After Wave 4 — UI integration, PARALLEL):
├── Task 15: PipelinePanel.svelte — progress, diff view, confirmations [visual-engineering]
├── Task 16: Pipeline entry point — wire orchestrator to agent chat [unspecified-high]

Wave 6 (After Wave 5 — teach→save→replay, PARALLEL):
├── Task 17: Workflow recorder controller [deep]
├── Task 18: Workflow replay controller [deep]
├── Task 19: Workflow skill creation prompt [writing]

Wave 7 (After Wave 6 — integration, PARALLEL):
├── Task 20: Workflow skill save/load integration [unspecified-high]
├── Task 21: Pipeline E2E integration test [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T5 → T9 → T12 → T15 → T17 → T21 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 4 (Waves 1, 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 5, 7 | 1 |
| 2 | — | 3, 4, 6, 8, 9, 11 | 1 |
| 3 | 2 | 8, 9 | 1 |
| 4 | 2 | 8, 9, 13 | 1 |
| 5 | 1 | 9, 12, 13, 16, 17 | 2 |
| 6 | 2 | 8, 13 | 2 |
| 7 | 1 | 9, 12, 13 | 2 |
| 8 | 3, 4, 6 | 9, 15 | 2 |
| 9 | 5, 7, 8 | 12, 13, 15, 21 | 3 |
| 10 | — | 15, 16 | 3 |
| 11 | 2 | 12, 13 | 3 |
| 12 | 9, 11 | 15, 21 | 4 |
| 13 | 9, 11 | 15, 21 | 4 |
| 14 | 9 | 15 | 4 |
| 15 | 12, 13, 14, 10 | 21 | 5 |
| 16 | 5, 10 | 21 | 5 |
| 17 | 5 | 20, 21 | 6 |
| 18 | 17 | 20, 21 | 6 |
| 19 | — | 20 | 6 |
| 20 | 17, 18, 19 | 21 | 7 |
| 21 | 15, 16, 20 | F1-F4 | 7 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2 → `quick`, T3 → `deep`, T4 → `deep`
- **Wave 2**: 4 tasks — T5 → `unspecified-high`, T6 → `deep`, T7 → `unspecified-high`, T8 → `deep`
- **Wave 3**: 3 tasks — T9 → `deep`, T10 → `visual-engineering`, T11 → `quick`
- **Wave 4**: 3 tasks — T12 → `deep`, T13 → `deep`, T14 → `unspecified-high`
- **Wave 5**: 2 tasks — T15 → `visual-engineering`, T16 → `unspecified-high`
- **Wave 6**: 3 tasks — T17 → `deep`, T18 → `deep`, T19 → `writing`
- **Wave 7**: 2 tasks — T20 → `unspecified-high`, T21 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. CDP Multi-Target Spike — Validate Stop/Go Gate

  **What to do**:
  - Create `src/lib/cdp-multi-target.spike.ts` — a standalone script that:
    1. Opens two tabs in the browser (Tab A navigated to `about:blank`, Tab B navigated to `about:blank`)
    2. Queries the CDP endpoint (`http://127.0.0.1:{port}/json`) to list all available targets
    3. Connects to Target A via its `webSocketDebuggerUrl`, evaluates `document.title`, disconnects
    4. Connects to Target B via its `webSocketDebuggerUrl`, evaluates `document.title`, disconnects
    5. Reports: target count, connection times, evaluation results, total round-trip
  - Document the findings: Can CDP switch targets? How fast? Is reconnection stable?
  - If CDP multi-target works: proceed with pipeline architecture
  - If CDP multi-target fails: document alternative approach (Tauri IPC `inject_webview_script` per tabId — this already works without CDP)
  - Read `ogre-desktop/src-tauri/src/lib.rs` to understand how `discover_cdp_target` finds targets and what filtering exists

  **Must NOT do**:
  - Modify any production code — this is a spike only
  - Create a `CDPClient` pool or permanent multi-client infrastructure (that's Task 7)
  - Touch `agent-loop.ts` or `browser-actions.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding CDP protocol, WebView2 internals, and Rust backend — needs autonomous investigation
  - **Skills**: []
    - No specialized skills needed — pure investigation and TypeScript coding

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/cdp-client.ts` — Current CDP singleton implementation. Look at `CDPClient` class (constructor, connect, send, disconnect methods) and the exported `cdp` singleton at bottom. Understand the WebSocket connection pattern.
  - `ogre-desktop/src/lib/cdp-actions.ts` — Functions that use CDP: `connectCDP()`, `cdpScreenshot()`, `isConnected()`. See how `connectCDP` calls `discover_cdp_target` Tauri command.

  **API/Type References**:
  - `ogre-desktop/src-tauri/src/lib.rs` — Rust backend with `discover_cdp_target` command. Understand how it queries `http://127.0.0.1:{port}/json` and filters targets. This is where multi-target filtering would need changes if needed.

  **External References**:
  - Chrome DevTools Protocol: `https://chromedevtools.github.io/devtools-protocol/` — `/json` endpoint returns array of targets with `webSocketDebuggerUrl` per target

  **WHY Each Reference Matters**:
  - `cdp-client.ts`: You need to understand the current WebSocket connection lifecycle to know if `disconnect()` → `connect(newUrl)` is safe and fast
  - `cdp-actions.ts`: Shows the current single-target discovery flow — your spike replaces this with multi-target discovery
  - `lib.rs`: The Rust side may filter to only one target — you need to check if it returns all targets or just one

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CDP discovers multiple targets from two open tabs
    Tool: Bash (npx tsx)
    Preconditions: OGRE desktop app running with two tabs open (Tab A and Tab B navigated to different URLs)
    Steps:
      1. Run the spike script: `npx tsx src/lib/cdp-multi-target.spike.ts`
      2. Assert stdout contains "Targets found: 2" (or more)
      3. Assert stdout contains "Target A eval: success" and "Target B eval: success"
      4. Assert stdout contains connection time metrics (< 500ms per switch)
    Expected Result: Two distinct targets discovered, both evaluable, switching takes < 500ms
    Failure Indicators: "Targets found: 1" (only one target visible), connection timeout, evaluation returns wrong tab's data
    Evidence: .sisyphus/evidence/task-1-cdp-multi-target-spike.txt

  Scenario: Fallback — Tauri IPC inject_webview_script works per tab
    Tool: Bash (npx tsx)
    Preconditions: Same as above — two tabs open
    Steps:
      1. If CDP multi-target fails, test `invoke('inject_webview_script', { tabId: tabA, script: 'document.title' })`
      2. Test same for tabB
      3. Assert each returns the correct tab's title
    Expected Result: Tauri IPC can target specific tabs by tabId regardless of CDP state
    Failure Indicators: Wrong tab's data returned, timeout, IPC error
    Evidence: .sisyphus/evidence/task-1-tauri-ipc-fallback.txt
  ```

  **Commit**: YES
  - Message: `spike(cdp): validate multi-target switching with two WebView2 tabs`
  - Files: `src/lib/cdp-multi-target.spike.ts`
  - Pre-commit: N/A (spike)

- [ ] 2. Pipeline Type Definitions

  **What to do**:
  - Create `src/lib/pipeline/types.ts` with all shared type definitions:
    - `SourceAssignment { id: string; name: string; category?: string; maxScore: number; scores: StudentScore[] }`
    - `TargetAssignment { id: string; name: string; category?: string; maxScore: number; scores: StudentScore[] }`
    - `StudentScore { studentName: string; rawScore: number | null; maxScore: number; status: 'graded' | 'exempt' | 'missing' | 'incomplete' }`
    - `AssignmentMatch { source: SourceAssignment; target: TargetAssignment; confidence: number; matchType: 'exact' | 'fuzzy' | 'manual' }`
    - `UnmatchedAssignment { assignment: SourceAssignment | TargetAssignment; side: 'source' | 'target' }`
    - `ScoreDiff { student: string; sourceScore: number | null; targetScore: number | null; diffType: 'new' | 'correct' | 'rounding' | 'increased' | 'decreased' | 'missing' }`
    - `ComparisonReport { matches: AssignmentMatch[]; unmatchedSource: UnmatchedAssignment[]; unmatchedTarget: UnmatchedAssignment[]; scoreDiffs: ScoreDiff[]; timestamp: number }`
    - `PipelineConfig { sourceTabId: string; targetTabId: string; overwritePolicy: 'skip' | 'overwrite-if-different' | 'overwrite-all'; dryRun: boolean }`
    - `PipelineStage = 'idle' | 'comparing' | 'previewing' | 'creating' | 'syncing' | 'done' | 'error'`
    - `TabRole = 'source' | 'target' | 'none'`
  - Write tests verifying type exports compile correctly

  **Must NOT do**:
  - Import from `browser.ts`, `db.ts`, or any Tauri API — these are pure types
  - Add runtime logic — this file is types-only (interfaces, types, enums, constants)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward type definitions file — single file, well-scoped
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 3, 4, 6, 8, 9, 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-types.ts` — Follow this exact pattern: pure type definitions, discriminated unions, JSDoc comments, `export type` and `export interface` declarations. No runtime code.
  - `.claude/skills/gb-compare/SKILL.md` — The existing comparison skill markdown describes the matching taxonomy and diff classification that these types codify. Look at "Comparison Output Format" section for field names.
  - `.claude/skills/gb-sync/SKILL.md` — The sync skill describes score diff types (new/correct/rounding/increased/decreased) and student matching format — these become the `ScoreDiff` and `StudentScore` types.

  **WHY Each Reference Matters**:
  - `agent-types.ts`: Establishes the codebase convention for type-only files (JSDoc, export patterns, naming)
  - `gb-compare/SKILL.md`: Contains the actual field names and diff taxonomy from the working pipeline — types must match this vocabulary
  - `gb-sync/SKILL.md`: Score statuses (exempt, missing, etc.) come from here

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` — compiles with zero errors
  - [ ] File exports all listed types (verified by import test)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All pipeline types are importable and compile
    Tool: Bash (npx tsc)
    Preconditions: types.ts created
    Steps:
      1. Create a test file that imports every exported type
      2. Run `npx tsc --noEmit`
      3. Assert exit code 0
    Expected Result: Zero type errors
    Failure Indicators: TSC reports missing exports or type errors
    Evidence: .sisyphus/evidence/task-2-types-compile.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add shared type definitions for pipeline engine`
  - Files: `src/lib/pipeline/types.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 3. Assignment Matcher — TDD

  **What to do**:
  - **RED**: Write `src/lib/pipeline/assignment-matcher.test.ts` first with test cases:
    - Exact match: `"HW 3.1"` ↔ `"HW 3.1"` → confidence 1.0
    - Number-anchored match: `"Homework 3.1"` ↔ `"HW 3.1"` → confidence ≥ 0.7
    - Category-enhanced: `"Quiz 5"` in category "Quiz" ↔ `"Quiz 5"` in category "QZ" → confidence ≥ 0.8
    - No match: `"Final Exam"` ↔ `"HW 3.1"` → confidence < 0.4 (no match)
    - Bulk matching: given 10 source + 10 target assignments, returns optimal pairing (no duplicates)
    - Edge cases: empty strings, special characters, very long names, unicode
  - **GREEN**: Implement `src/lib/pipeline/assignment-matcher.ts`:
    - `matchAssignments(source: SourceAssignment[], target: TargetAssignment[], threshold?: number): { matches: AssignmentMatch[]; unmatchedSource: SourceAssignment[]; unmatchedTarget: TargetAssignment[] }`
    - Internal: `normalizeAssignmentName(name: string): string` — lowercase, strip punctuation, normalize whitespace
    - Internal: `extractNumbers(name: string): number[]` — extract all numeric tokens
    - Internal: `extractWords(name: string): string[]` — extract alphabetic tokens
    - Internal: `scoreOverlap(source: SourceAssignment, target: TargetAssignment): number` — 0.0 to 1.0 confidence
    - Default threshold: 0.4 (from existing gb-compare skill)
    - Hungarian algorithm or greedy assignment for optimal matching (no duplicate targets)
  - **REFACTOR**: Clean up, ensure pure functions, zero side effects

  **Must NOT do**:
  - Import from `browser.ts`, `db.ts`, CDP, or Tauri APIs
  - Use AI/LLM calls for matching — pure TypeScript only
  - Add category mapping tables (that's pipeline config, not matcher logic)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD workflow with algorithmic complexity (assignment matching, optimal pairing) requires careful test design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 2 (imports types)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-compare/SKILL.md` — Lines describing the matching algorithm: "normalize → extractNumbers → extractWords → score overlap, 0.4 threshold". This is the algorithm to implement in TypeScript. Search for "COMPARISON LOGIC" section.
  - `ogre-desktop/src/lib/agent-loop.test.ts` — (if exists) Follow vitest test patterns: `describe()`, `it()`, `expect()`, `vi.mock()` conventions used in this codebase.

  **API/Type References**:
  - `src/lib/pipeline/types.ts` (Task 2) — Import `SourceAssignment`, `TargetAssignment`, `AssignmentMatch`, `UnmatchedAssignment` types

  **External References**:
  - Levenshtein distance algorithm — for fuzzy string comparison fallback

  **WHY Each Reference Matters**:
  - `gb-compare/SKILL.md`: Contains the battle-tested matching algorithm from the existing pipeline. The TypeScript implementation should replicate this logic, not invent new logic.
  - `types.ts`: All input/output types are defined here — matcher must conform to these contracts

  **Acceptance Criteria**:
  - [ ] Test file created: `src/lib/pipeline/assignment-matcher.test.ts`
  - [ ] `npx vitest run src/lib/pipeline/assignment-matcher.test.ts` → PASS (≥ 8 tests, 0 failures)
  - [ ] Exact match, fuzzy match, no-match, bulk matching, and edge case scenarios all pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Assignment matcher produces correct matches for known data
    Tool: Bash (npx vitest)
    Preconditions: assignment-matcher.ts and .test.ts created
    Steps:
      1. Run `npx vitest run src/lib/pipeline/assignment-matcher.test.ts`
      2. Assert all tests pass
      3. Verify test count ≥ 8
    Expected Result: All tests pass, including exact, fuzzy, no-match, bulk, and edge cases
    Failure Indicators: Any test failure, test count < 8
    Evidence: .sisyphus/evidence/task-3-assignment-matcher-tests.txt

  Scenario: Matcher handles adversarial input without throwing
    Tool: Bash (npx vitest)
    Preconditions: Tests include edge cases
    Steps:
      1. Verify tests include: empty string names, names with only numbers, names with unicode, very long names (500+ chars)
      2. Assert all pass without throwing
    Expected Result: Pure functions handle all edge cases gracefully, returning low confidence (not crashing)
    Failure Indicators: Uncaught exception, test timeout
    Evidence: .sisyphus/evidence/task-3-matcher-edge-cases.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add assignment name matcher with TDD tests`
  - Files: `src/lib/pipeline/assignment-matcher.ts`, `src/lib/pipeline/assignment-matcher.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/assignment-matcher.test.ts`

- [ ] 4. Student Matcher — TDD

  **What to do**:
  - **RED**: Write `src/lib/pipeline/student-matcher.test.ts` first with test cases:
    - Exact match: `"Smith, John"` ↔ `"Smith, John"` → confidence 1.0
    - Format normalization: `"Smith, John"` ↔ `"John Smith"` → confidence ≥ 0.9
    - Middle initial stripping: `"Smith, John A."` ↔ `"Smith, John"` → confidence ≥ 0.85
    - Case insensitive: `"SMITH, JOHN"` ↔ `"smith, john"` → confidence ≥ 0.95
    - No match: `"Smith, John"` ↔ `"Doe, Jane"` → confidence < 0.5
    - Bulk matching: given 30 source + 30 target students, returns optimal pairing
    - Edge cases: hyphenated names, suffixes (Jr., III), accented characters, single names
  - **GREEN**: Implement `src/lib/pipeline/student-matcher.ts`:
    - `matchStudents(sourceNames: string[], targetNames: string[]): { matches: StudentMatch[]; unmatchedSource: string[]; unmatchedTarget: string[] }`
    - `StudentMatch { sourceName: string; targetName: string; confidence: number }`
    - Internal: `normalizeStudentName(name: string): { first: string; last: string; middle?: string }`
    - Internal: `nameConfidence(a: string, b: string): number` — 0.0 to 1.0
    - Default threshold: 0.80 (from existing gb-sync skill)
  - **REFACTOR**: Clean up, ensure pure functions

  **Must NOT do**:
  - Import browser/DB/Tauri dependencies
  - Use AI for name matching
  - Handle student IDs or enrollment numbers (just names for V1)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD with string normalization edge cases and name format handling complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 8, 9, 13
  - **Blocked By**: Task 2 (imports types)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-sync/SKILL.md` — Search for "Student Matching" section. Documents the matching strategy: middle-initial stripping, confidence scoring ≥ 0.80 threshold, "LastName, FirstName" vs "FirstName LastName" format handling. This is the algorithm to replicate.

  **API/Type References**:
  - `src/lib/pipeline/types.ts` (Task 2) — Import `StudentScore` type for the student name format

  **WHY Each Reference Matters**:
  - `gb-sync/SKILL.md`: Contains the exact name normalization rules and confidence threshold from production usage. Don't reinvent — replicate.

  **Acceptance Criteria**:
  - [ ] Test file created: `src/lib/pipeline/student-matcher.test.ts`
  - [ ] `npx vitest run src/lib/pipeline/student-matcher.test.ts` → PASS (≥ 8 tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Student matcher handles all name format variations
    Tool: Bash (npx vitest)
    Preconditions: student-matcher.ts and .test.ts created
    Steps:
      1. Run `npx vitest run src/lib/pipeline/student-matcher.test.ts`
      2. Assert all tests pass
      3. Verify test count ≥ 8
    Expected Result: All name format tests pass (LastFirst, FirstLast, middle initials, hyphenated, accented)
    Failure Indicators: Any test failure, confidence scores outside expected ranges
    Evidence: .sisyphus/evidence/task-4-student-matcher-tests.txt

  Scenario: Bulk matching with 30 students produces no duplicate matches
    Tool: Bash (npx vitest)
    Preconditions: Test includes bulk scenario with 30 students
    Steps:
      1. Verify test includes 30-student bulk matching scenario
      2. Assert no target student is matched to multiple source students
      3. Assert no source student is matched to multiple target students
    Expected Result: One-to-one mapping, no duplicates
    Failure Indicators: Duplicate matches found, assertion error
    Evidence: .sisyphus/evidence/task-4-student-bulk-match.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add student name fuzzy matcher with TDD tests`
  - Files: `src/lib/pipeline/student-matcher.ts`, `src/lib/pipeline/student-matcher.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/student-matcher.test.ts`

- [ ] 5. tabId Threading Through Agent Loop + Browser Actions

  **What to do**:
  - **Before any changes**: Run `lsp_find_references` on `getActiveTabId`, `getEmbeddedUrl`, `navigateEmbedded`, and `executeAction` to map ALL call sites
  - Update `AgentLoopConfig` in `agent-loop.ts` to add optional `tabId?: string` field
  - In `runLoop()` (line ~172-178 of `agent-loop.ts`), use `config.tabId ?? getActiveTabId()` instead of bare `getEmbeddedUrl()` call
  - Update `executeAction` in `browser-actions.ts` to accept `tabId` parameter and pass it through to `navigateEmbedded`, `getEmbeddedUrl`, `evalScript`, `injectScript`
  - Ensure ALL action types that touch the browser thread `tabId` through
  - Default behavior (no tabId) must remain identical to current behavior — backward compatible
  - Write tests verifying tabId is passed through to browser functions

  **Must NOT do**:
  - Modify `createAgentController()` signature or `AgentController` interface
  - Change the `AgentEvent` type union
  - Modify `runLoop()` core logic (approval gate, safety checks, history pruning)
  - Break existing agent functionality — backward compatibility is mandatory

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful refactoring across multiple files with backward compatibility constraint
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Tasks 9, 12, 13, 16, 17
  - **Blocked By**: Task 1 (CDP spike determines if approach is viable)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:122-133` — `AgentLoopConfig` interface definition. Add `tabId?: string` here.
  - `ogre-desktop/src/lib/agent-loop.ts:168-179` — `runLoop()` start, where `getEmbeddedUrl()` is called without tabId. This is the primary change point.
  - `ogre-desktop/src/lib/browser-actions.ts` — `executeAction()` function. Find where it calls `navigateEmbedded`, `getActiveTabId()`, `evalScript`. Thread tabId through all of these.
  - `ogre-desktop/src/lib/browser.ts:83-85` — `getEmbeddedUrl` already accepts optional `tabId` parameter. Your changes leverage this existing capability.

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts:80-81` — `AgentMode = 'review' | 'auto'` — do NOT modify this
  - `ogre-desktop/src/lib/browser.ts:11-13` — `setActiveTabId`/`getActiveTabId` — understand the current global state pattern you're augmenting

  **WHY Each Reference Matters**:
  - `agent-loop.ts:122-133`: The config interface is where tabId is added — must be optional for backward compat
  - `browser-actions.ts`: Where all browser operations dispatch — every action handler needs tabId parameter
  - `browser.ts:83-85`: `getEmbeddedUrl(tabId?)` already supports optional tabId — proves the pattern works

  **Acceptance Criteria**:
  - [ ] `npx vitest run` — all existing tests still pass (zero regressions)
  - [ ] `npx tsc --noEmit` — compiles cleanly
  - [ ] `AgentLoopConfig` has `tabId?: string` field
  - [ ] `runLoop()` passes tabId to `getEmbeddedUrl()` when provided
  - [ ] `executeAction()` accepts and threads tabId

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Agent loop with tabId targets specific tab
    Tool: Bash (npx vitest)
    Preconditions: agent-loop.ts updated with tabId support
    Steps:
      1. Run `npx vitest run src/lib/agent-loop.test.ts` (or create test if none exists)
      2. Verify test: when tabId='tab-123' is in config, getEmbeddedUrl is called with 'tab-123'
      3. Verify test: when tabId is undefined, getEmbeddedUrl is called with no arg (backward compat)
    Expected Result: tabId threaded correctly, backward compat maintained
    Failure Indicators: getEmbeddedUrl called without tabId when tabId was provided, or vice versa
    Evidence: .sisyphus/evidence/task-5-tabid-threading.txt

  Scenario: No regressions in existing test suite
    Tool: Bash (npx vitest)
    Preconditions: Changes applied
    Steps:
      1. Run `npx vitest run`
      2. Assert same number of passing tests as before changes (or more)
      3. Assert 0 failures
    Expected Result: Zero regressions
    Failure Indicators: Any previously-passing test now fails
    Evidence: .sisyphus/evidence/task-5-no-regressions.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent): thread tabId through agent-loop and browser-actions`
  - Files: `src/lib/agent-loop.ts`, `src/lib/browser-actions.ts`
  - Pre-commit: `npx vitest run`

- [ ] 6. Score Normalizer — TDD

  **What to do**:
  - **RED**: Write `src/lib/pipeline/score-normalizer.test.ts` first:
    - Fractional to points: `"8/10"` with targetMax=100 → 80
    - Percentage to points: `"80%"` with targetMax=10 → 8
    - Points pass-through: `8` with sourceMax=10, targetMax=10 → 8
    - Cross-scale: `8` with sourceMax=10, targetMax=100 → 80
    - Missing score: `null` → `null` (preserved)
    - Exempt: `"EX"` or `"exempt"` → `{ value: null, status: 'exempt' }`
    - Edge cases: `0/0`, negative scores, scores > max, `NaN`, empty string
  - **GREEN**: Implement `src/lib/pipeline/score-normalizer.ts`:
    - `parseScore(raw: string | number | null): ParsedScore` — parses raw score strings into structured format
    - `normalizeScore(parsed: ParsedScore, sourceMax: number, targetMax: number): NormalizedScore`
    - `ParsedScore { value: number | null; status: 'graded' | 'exempt' | 'missing' | 'incomplete'; raw: string }`
    - `NormalizedScore { value: number | null; status: string; raw: string; converted: boolean }`
    - Formula: `(raw / sourceMax) * targetMax`, rounded to 2 decimal places
  - **REFACTOR**: Ensure pure functions, no side effects

  **Must NOT do**:
  - Import browser/DB/Tauri dependencies
  - Handle platform-specific score formats (that's the agent's job via site profiles)
  - Use AI for score parsing

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD with complex edge cases in numeric parsing and conversion
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Tasks 8, 13
  - **Blocked By**: Task 2 (imports types)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-sync/SKILL.md` — Search for "Score Conversion" or "normalization". The existing formula is `raw / maxPts * targetMax`. Also documents special statuses: `-e` for exempt, missing handling.

  **API/Type References**:
  - `src/lib/pipeline/types.ts` (Task 2) — `StudentScore.status` enum values: 'graded' | 'exempt' | 'missing' | 'incomplete'

  **WHY Each Reference Matters**:
  - `gb-sync/SKILL.md`: Contains the exact conversion formula and special status codes from production

  **Acceptance Criteria**:
  - [ ] Test file created: `src/lib/pipeline/score-normalizer.test.ts`
  - [ ] `npx vitest run src/lib/pipeline/score-normalizer.test.ts` → PASS (≥ 8 tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Score normalizer handles all format variations
    Tool: Bash (npx vitest)
    Preconditions: score-normalizer.ts and .test.ts created
    Steps:
      1. Run `npx vitest run src/lib/pipeline/score-normalizer.test.ts`
      2. Assert all tests pass, including fractional, percentage, points, cross-scale, missing, exempt
    Expected Result: All score format tests pass with correct converted values
    Failure Indicators: Wrong conversion values, unhandled format throws
    Evidence: .sisyphus/evidence/task-6-score-normalizer-tests.txt

  Scenario: Normalizer handles adversarial input gracefully
    Tool: Bash (npx vitest)
    Preconditions: Tests include edge cases
    Steps:
      1. Verify tests include: 0/0 division, negative scores, scores > max, NaN, empty string, undefined
      2. Assert all return graceful results (no throws, sensible defaults)
    Expected Result: Pure functions handle all edge cases without throwing
    Failure Indicators: Uncaught exception, NaN in output
    Evidence: .sisyphus/evidence/task-6-normalizer-edge-cases.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add score normalizer with TDD tests`
  - Files: `src/lib/pipeline/score-normalizer.ts`, `src/lib/pipeline/score-normalizer.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/score-normalizer.test.ts`

- [ ] 7. CDP Multi-Target Utility Module

  **What to do**:
  - Based on Task 1 spike findings, create `src/lib/cdp-multi-target.ts`:
    - If CDP switching works: `switchCDPTarget(tabId: string): Promise<void>` — disconnects current, discovers target by tabId/URL, reconnects
    - If CDP switching fails: `evalScriptOnTab(tabId: string, script: string): Promise<string>` — uses Tauri IPC `inject_webview_script` + result callback as fallback
    - `discoverAllTargets(): Promise<CDPTarget[]>` — lists all available CDP targets
    - `CDPTarget { id: string; title: string; url: string; webSocketDebuggerUrl: string; tabId?: string }`
    - `getTargetForTab(tabId: string, targets: CDPTarget[]): CDPTarget | null` — maps browser tabId to CDP target
  - Write tests with mocked CDP/Tauri calls
  - Delete the spike file (`cdp-multi-target.spike.ts`) after incorporating findings

  **Must NOT do**:
  - Create multiple CDPClient instances (sequential switching only for V1)
  - Modify the existing `CDPClient` class internals
  - Break existing CDP screenshot/eval functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work between CDP protocol and Tauri IPC — requires spike findings
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: Tasks 9, 12, 13
  - **Blocked By**: Task 1 (spike results determine implementation approach)

  **References**:

  **Pattern References**:
  - `src/lib/cdp-multi-target.spike.ts` (Task 1 output) — Spike findings document what works and what doesn't. This is the primary input.
  - `ogre-desktop/src/lib/cdp-client.ts` — Current `CDPClient` class. Understand `connect(url)`, `disconnect()`, `send(method, params)` lifecycle.
  - `ogre-desktop/src/lib/cdp-actions.ts` — `connectCDP()` calls `discover_cdp_target` Tauri command. Your utility wraps and extends this pattern.

  **API/Type References**:
  - `ogre-desktop/src/lib/browser.ts:200-202` — `injectScript(script, tabId?)` — the Tauri IPC fallback path already exists and takes tabId

  **WHY Each Reference Matters**:
  - Spike file: Contains empirical data about what CDP multi-target approach works
  - `cdp-client.ts`: Must understand connection lifecycle to safely disconnect/reconnect
  - `browser.ts:200`: The fallback approach (`injectScript` via Tauri IPC) already works per-tab

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/cdp-multi-target.test.ts` → PASS
  - [ ] Spike file deleted
  - [ ] Either CDP switching OR Tauri IPC fallback is working and tested

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Multi-target utility can evaluate script on specific tab
    Tool: Bash (npx vitest)
    Preconditions: cdp-multi-target.ts created with mocked tests
    Steps:
      1. Run `npx vitest run src/lib/cdp-multi-target.test.ts`
      2. Assert mock tests pass: switching targets, evaluating scripts, discovering targets
    Expected Result: All mocked CDP/IPC tests pass
    Failure Indicators: Mock assertion failures
    Evidence: .sisyphus/evidence/task-7-cdp-multi-target.txt

  Scenario: Fallback path works when CDP switching fails
    Tool: Bash (npx vitest)
    Preconditions: Tests include fallback scenario
    Steps:
      1. Verify test mocks CDP failure and falls back to Tauri IPC
      2. Assert fallback produces correct result
    Expected Result: Graceful fallback, same result via IPC
    Failure Indicators: No fallback path, error thrown
    Evidence: .sisyphus/evidence/task-7-cdp-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(cdp): add multi-target switching utility for pipeline`
  - Files: `src/lib/cdp-multi-target.ts`, `src/lib/cdp-multi-target.test.ts`
  - Pre-commit: `npx vitest run src/lib/cdp-multi-target.test.ts`

- [ ] 8. Comparison Report Generator — TDD

  **What to do**:
  - **RED**: Write `src/lib/pipeline/comparison-report.test.ts`:
    - Given matched assignments with score data, produces correct `ScoreDiff` entries
    - Classifies diffs correctly: `new` (score in source, null in target), `correct` (same), `rounding` (within 0.5), `increased`, `decreased`, `missing` (null in source)
    - Summary stats: total assignments, matched count, unmatched count, total score diffs
    - Empty inputs: no assignments → empty report
    - Partial data: some assignments have no scores → handled gracefully
  - **GREEN**: Implement `src/lib/pipeline/comparison-report.ts`:
    - `generateComparisonReport(matches: AssignmentMatch[], unmatchedSource: SourceAssignment[], unmatchedTarget: TargetAssignment[]): ComparisonReport`
    - `classifyScoreDiff(sourceScore: number | null, targetScore: number | null, tolerance?: number): ScoreDiff['diffType']`
    - `summarizeReport(report: ComparisonReport): ReportSummary`
    - `ReportSummary { totalAssignments: number; matchedCount: number; unmatchedSourceCount: number; unmatchedTargetCount: number; scoreDiffsCount: number; newScores: number; changedScores: number }`
  - **REFACTOR**: Clean up, ensure pure functions

  **Must NOT do**:
  - Import browser/DB/Tauri dependencies
  - Produce formatted output (that's the UI's job) — just data structures

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD with classification logic across multiple diff types
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 9, 15
  - **Blocked By**: Tasks 3, 4, 6 (uses matchers' output types)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-sync/SKILL.md` — Search for diff classification: "new/correct/rounding/increased/decreased". Documents the tolerance threshold for rounding detection and the classification rules.
  - `.claude/skills/gb-compare/SKILL.md` — "Comparison Output Format" section — describes the structure of comparison results.

  **API/Type References**:
  - `src/lib/pipeline/types.ts` (Task 2) — `ComparisonReport`, `ScoreDiff`, `AssignmentMatch`, `UnmatchedAssignment` types

  **WHY Each Reference Matters**:
  - `gb-sync/SKILL.md`: Classification rules (what counts as "rounding" vs "changed") come from production experience
  - `types.ts`: All input/output contracts defined there

  **Acceptance Criteria**:
  - [ ] Test file created: `src/lib/pipeline/comparison-report.test.ts`
  - [ ] `npx vitest run src/lib/pipeline/comparison-report.test.ts` → PASS (≥ 6 tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Report generator classifies all diff types correctly
    Tool: Bash (npx vitest)
    Preconditions: comparison-report.ts and .test.ts created
    Steps:
      1. Run `npx vitest run src/lib/pipeline/comparison-report.test.ts`
      2. Assert tests cover: new, correct, rounding, increased, decreased, missing diff types
    Expected Result: All diff classifications match expected output
    Failure Indicators: Wrong classification, missing diff type coverage
    Evidence: .sisyphus/evidence/task-8-comparison-report-tests.txt

  Scenario: Report summary statistics are accurate
    Tool: Bash (npx vitest)
    Preconditions: Tests include summary scenario
    Steps:
      1. Given 5 matched, 2 unmatched-source, 1 unmatched-target, 3 score diffs
      2. Assert summarizeReport returns correct counts for each field
    Expected Result: Summary counts match input data exactly
    Failure Indicators: Count mismatch, off-by-one errors
    Evidence: .sisyphus/evidence/task-8-report-summary.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add comparison report generator with TDD tests`
  - Files: `src/lib/pipeline/comparison-report.ts`, `src/lib/pipeline/comparison-report.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/comparison-report.test.ts`

- [ ] 9. Pipeline Orchestrator — Compare Stage

  **What to do**:
  - Create `src/lib/pipeline/orchestrator.ts` — the core state machine:
    - `PipelineOrchestrator` class following `BatchGrader` pattern (stateful, resumable)
    - `constructor(config: PipelineConfig)` — receives source/target tabIds, overwrite policy, dryRun flag
    - `async runCompare(): Promise<ComparisonReport>` — the compare stage:
      1. Switch CDP to source tab → extract assignment list + scores via agent
      2. Switch CDP to target tab → extract assignment list + scores via agent
      3. Run assignment matcher (TypeScript, no AI)
      4. Run student matcher (TypeScript, no AI)
      5. Generate ComparisonReport with all diffs
      6. Return report for user preview
    - Pipeline emits events via callback: `onEvent: (event: PipelineEvent) => void`
    - `PipelineEvent = { type: 'stage-change'; stage: PipelineStage } | { type: 'progress'; message: string; percent: number } | { type: 'extraction-complete'; side: 'source' | 'target'; data: Assignment[] } | { type: 'comparison-ready'; report: ComparisonReport } | { type: 'error'; message: string }`
  - Write tests with mocked CDP/agent calls

  **Must NOT do**:
  - Implement create-missing or sync-scores stages (Tasks 12, 13)
  - Modify `createAgentController()` or `runLoop()` internals
  - Parse site profile markdown — use agent for extraction (site profiles guide the agent, not the orchestrator)
  - Hard-code MOM or Aeries selectors

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex orchestration with state machine, CDP switching, and agent coordination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: Tasks 12, 13, 15, 21
  - **Blocked By**: Tasks 5, 7, 8 (needs tabId threading, CDP utility, comparison report)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts` — `BatchGrader` class: stateful orchestrator with `start()`, progress tracking, resume, error handling. Follow this pattern for the pipeline orchestrator.
  - `ogre-desktop/src/lib/agent-loop.ts:104-115` — `AgentEvent` type union. Your `PipelineEvent` follows the same discriminated union pattern.
  - `.claude/skills/gb-pipeline/SKILL.md` — The 7-phase orchestration flow. Phase 1 (extraction) and Phase 2 (comparison) are what this task implements. Study the sequencing logic.

  **API/Type References**:
  - `src/lib/pipeline/types.ts` — `PipelineConfig`, `PipelineStage`, `ComparisonReport`
  - `src/lib/cdp-multi-target.ts` (Task 7) — `switchCDPTarget(tabId)` or `evalScriptOnTab(tabId, script)`
  - `src/lib/pipeline/assignment-matcher.ts` (Task 3) — `matchAssignments()`
  - `src/lib/pipeline/student-matcher.ts` (Task 4) — `matchStudents()`
  - `src/lib/pipeline/comparison-report.ts` (Task 8) — `generateComparisonReport()`

  **WHY Each Reference Matters**:
  - `batch-grader.ts`: Same orchestration pattern — class with state, progress events, error handling
  - `gb-pipeline/SKILL.md`: Sequencing logic from production — don't reinvent the stage ordering
  - All pipeline modules: The orchestrator wires these together — must import and call correctly

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/orchestrator.test.ts` → PASS (≥ 5 tests)
  - [ ] Compare stage extracts from both tabs, runs matchers, produces ComparisonReport

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Compare stage produces correct ComparisonReport from mock data
    Tool: Bash (npx vitest)
    Preconditions: Orchestrator created with mocked CDP/agent
    Steps:
      1. Mock source tab returns 5 assignments (3 with scores)
      2. Mock target tab returns 4 assignments (2 with scores)
      3. Run `orchestrator.runCompare()`
      4. Assert ComparisonReport has: matches array, unmatchedSource array, scoreDiffs
      5. Assert stage changes emitted: idle → comparing → previewing
    Expected Result: Report matches expected structure, events emitted in order
    Failure Indicators: Missing fields, wrong stage order, matcher not called
    Evidence: .sisyphus/evidence/task-9-orchestrator-compare.txt

  Scenario: Compare stage handles CDP switch failure gracefully
    Tool: Bash (npx vitest)
    Preconditions: Mock CDP switch to throw error
    Steps:
      1. Mock `switchCDPTarget` to reject
      2. Run `orchestrator.runCompare()`
      3. Assert error event emitted with descriptive message
      4. Assert stage changes to 'error'
    Expected Result: Graceful failure with error event, not uncaught throw
    Failure Indicators: Uncaught exception, no error event
    Evidence: .sisyphus/evidence/task-9-orchestrator-error.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add orchestrator compare stage`
  - Files: `src/lib/pipeline/orchestrator.ts`, `src/lib/pipeline/orchestrator.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/orchestrator.test.ts`

- [ ] 10. Tab Role Designation UI — Source/Target Badges

  **What to do**:
  - Extend `Tab` interface in `Browser.svelte` with `role?: TabRole` (import from `pipeline/types.ts`)
  - Add role toggle mechanism: right-click tab → context menu with "Set as Source" / "Set as Target" / "Clear Role"
  - Alternatively: small dropdown on tab hover, or click a badge icon
  - Display colored badge on tab: Source = blue badge "SRC", Target = green badge "TGT"
  - Enforce constraints: only one Source and one Target at a time. Setting a new Source clears the old one.
  - Export tab role state so pipeline can read it: `getSourceTabId(): string | null`, `getTargetTabId(): string | null`
  - Store role state in component — does NOT need to persist to DB

  **Must NOT do**:
  - Build split-view layout
  - Add tab grouping or reordering
  - Modify the tab bar structure (just add badges)
  - Persist tab roles to database (ephemeral state)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component modification with visual badges, context menus, color styling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11)
  - **Blocks**: Tasks 15, 16
  - **Blocked By**: None (can start immediately — only needs existing Tab interface)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Browser.svelte:57-64` — Existing `Tab` interface. Add `role?: TabRole` field here.
  - `ogre-desktop/src/pages/Browser.svelte:408-426` — Existing tab bar HTML. Add badge element inside each `.tab` div.
  - `ogre-desktop/src/pages/Browser.svelte:790-860` — Existing `.tab` CSS. Add badge styles here.

  **API/Type References**:
  - `src/lib/pipeline/types.ts` (Task 2) — `TabRole = 'source' | 'target' | 'none'`

  **WHY Each Reference Matters**:
  - `Browser.svelte:57-64`: This is where the Tab type lives — extend it with role field
  - `Browser.svelte:408-426`: This is the tab bar template — add badge rendering here
  - `Browser.svelte:790-860`: Tab styling — add badge color/position styles

  **Acceptance Criteria**:
  - [ ] Tab interface has `role?: TabRole` field
  - [ ] Source badge visible on designated Source tab (blue "SRC")
  - [ ] Target badge visible on designated Target tab (green "TGT")
  - [ ] Only one Source and one Target at a time

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: User can designate Source and Target tabs
    Tool: Playwright (playwright skill)
    Preconditions: OGRE desktop app running with two tabs open
    Steps:
      1. Right-click first tab
      2. Click "Set as Source" in context menu
      3. Assert blue "SRC" badge appears on first tab
      4. Right-click second tab
      5. Click "Set as Target" in context menu
      6. Assert green "TGT" badge appears on second tab
    Expected Result: Both badges visible, correct colors
    Failure Indicators: No badge appears, wrong color, badge on wrong tab
    Evidence: .sisyphus/evidence/task-10-tab-badges.png

  Scenario: Setting new Source clears old Source
    Tool: Playwright (playwright skill)
    Preconditions: Tab 1 is Source, Tab 2 is Target
    Steps:
      1. Open a third tab
      2. Right-click third tab → "Set as Source"
      3. Assert Tab 1 no longer has "SRC" badge
      4. Assert Tab 3 now has "SRC" badge
      5. Assert Tab 2 still has "TGT" badge (unchanged)
    Expected Result: Only one Source at a time, Target unaffected
    Failure Indicators: Two Source badges visible, Target badge lost
    Evidence: .sisyphus/evidence/task-10-source-switch.png
  ```

  **Commit**: YES
  - Message: `feat(browser): add Source/Target tab role designation UI`
  - Files: `src/pages/Browser.svelte`
  - Pre-commit: N/A (UI — visual verification)

- [ ] 11. Pipeline Configuration Types + Overwrite Policy

  **What to do**:
  - Extend `src/lib/pipeline/types.ts` with detailed configuration:
    - `PipelineOptions { overwritePolicy: OverwritePolicy; dryRun: boolean; roundingTolerance: number; matchThreshold: number; studentMatchThreshold: number; maxStepsPerExtraction: number }`
    - `OverwritePolicy = 'skip-existing' | 'overwrite-if-different' | 'overwrite-all'`
    - `DEFAULT_PIPELINE_OPTIONS: PipelineOptions` with sensible defaults:
      - `overwritePolicy: 'skip-existing'` (safest default)
      - `dryRun: true` (always preview first)
      - `roundingTolerance: 0.5`
      - `matchThreshold: 0.4` (from existing gb-compare)
      - `studentMatchThreshold: 0.80` (from existing gb-sync)
      - `maxStepsPerExtraction: 50` (override default 30)
    - `CategoryMapping { sourceCategory: string; targetCategory: string }` — for future category name translation
    - `PipelineSession { id: string; config: PipelineConfig; options: PipelineOptions; stage: PipelineStage; report?: ComparisonReport; startedAt: number; completedAt?: number }`

  **Must NOT do**:
  - Add runtime logic — types and constants only
  - Import browser/DB/Tauri dependencies
  - Implement category mapping logic (just the type for future use)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions and constants — straightforward extension of existing types file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Task 2 (extends types.ts)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-types.ts:90-111` — `AgentConfig` + `DEFAULT_AGENT_CONFIG` pattern. Follow this exact convention for `PipelineOptions` + `DEFAULT_PIPELINE_OPTIONS`.
  - `.claude/skills/gb-compare/SKILL.md` — Match threshold 0.4 comes from here
  - `.claude/skills/gb-sync/SKILL.md` — Student match threshold 0.80 and rounding tolerance come from here

  **WHY Each Reference Matters**:
  - `agent-types.ts`: Codebase convention for config types + defaults
  - Skill files: Threshold values are battle-tested from production usage

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` — compiles with zero errors
  - [ ] `DEFAULT_PIPELINE_OPTIONS` exported with all listed defaults
  - [ ] `OverwritePolicy` type exported

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All configuration types compile and defaults are correct
    Tool: Bash (npx tsc)
    Preconditions: types.ts updated
    Steps:
      1. Run `npx tsc --noEmit`
      2. Assert exit code 0
      3. Write quick import test verifying DEFAULT_PIPELINE_OPTIONS.overwritePolicy === 'skip-existing'
    Expected Result: Types compile, defaults match spec
    Failure Indicators: Type errors, missing exports
    Evidence: .sisyphus/evidence/task-11-config-types.txt
  ```

  **Commit**: YES (grouped with Task 2 if same file)
  - Message: `feat(pipeline): add configuration types and overwrite policy`
  - Files: `src/lib/pipeline/types.ts` (update)
  - Pre-commit: `npx tsc --noEmit`

- [ ] 12. Pipeline Orchestrator — Create-Missing Stage

  **What to do**:
  - Extend `PipelineOrchestrator` with `async runCreateMissing(report: ComparisonReport): Promise<CreateResult>`:
    1. Filter `report.unmatchedSource` — these are assignments in source but not in target
    2. If `dryRun`: return `CreateResult` with preview data, skip actual creation
    3. If not dryRun: for each unmatched assignment:
       a. Switch CDP to target tab
       b. Use agent to navigate to assignment creation form
       c. Fill in assignment name, category, max score from source data
       d. Submit form
       e. Log success/failure per assignment
    4. Idempotency: before creating, verify assignment doesn't already exist in target (re-check)
    5. Emit progress events: `{ type: 'creating'; current: number; total: number; assignment: string }`
  - `CreateResult { created: string[]; skipped: string[]; failed: Array<{ name: string; error: string }> }`
  - Handle partial failure: if assignment 5/12 fails, continue with 6-12 and report all results
  - Write tests with mocked agent

  **Must NOT do**:
  - Hard-code Aeries-specific selectors (agent uses site profiles for that)
  - Skip the dry-run preview — always preview first by default
  - Create assignments without idempotency check
  - Modify the compare stage (Task 9)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex orchestration with agent coordination, error handling, and partial failure recovery
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: Tasks 15, 21
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `src/lib/pipeline/orchestrator.ts` (Task 9) — Extend the orchestrator created in Task 9
  - `.claude/skills/gb-new-assignment/SKILL.md` — The existing assignment creation skill. Documents the form filling sequence and validation steps. The agent will follow site profiles, but the orchestrator needs to know the creation workflow structure.
  - `ogre-desktop/src/lib/batch-grader.ts` — Resume/retry pattern for batch operations

  **API/Type References**:
  - `src/lib/pipeline/types.ts` — `PipelineConfig`, `OverwritePolicy`, `ComparisonReport`
  - `src/lib/pipeline/orchestrator.ts` (Task 9) — `PipelineOrchestrator` class

  **WHY Each Reference Matters**:
  - `gb-new-assignment/SKILL.md`: Creation workflow sequence — the agent needs this context to fill forms correctly
  - `batch-grader.ts`: How to handle partial failure in batch operations

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/orchestrator.test.ts` → PASS (new tests for create stage)
  - [ ] Dry-run returns preview without executing agent actions
  - [ ] Idempotency check prevents duplicate creation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create-missing dry-run returns preview without agent calls
    Tool: Bash (npx vitest)
    Preconditions: Orchestrator with dryRun=true
    Steps:
      1. Mock report with 3 unmatched source assignments
      2. Run `orchestrator.runCreateMissing(report)` with dryRun=true
      3. Assert result contains 3 assignments in preview
      4. Assert zero agent executeAction calls were made
    Expected Result: Preview data returned, no side effects
    Failure Indicators: Agent actions executed in dry-run mode
    Evidence: .sisyphus/evidence/task-12-create-dryrun.txt

  Scenario: Partial failure continues and reports all results
    Tool: Bash (npx vitest)
    Preconditions: Mock agent to fail on assignment 2 of 3
    Steps:
      1. Run `orchestrator.runCreateMissing(report)` with dryRun=false
      2. Assert result.created includes assignment 1 and 3
      3. Assert result.failed includes assignment 2 with error message
    Expected Result: 2 created, 1 failed, clear error reporting
    Failure Indicators: Pipeline stops at first failure, no error details
    Evidence: .sisyphus/evidence/task-12-partial-failure.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add orchestrator create-missing stage`
  - Files: `src/lib/pipeline/orchestrator.ts` (update), test file update
  - Pre-commit: `npx vitest run src/lib/pipeline/orchestrator.test.ts`

- [ ] 13. Pipeline Orchestrator — Sync-Scores Stage

  **What to do**:
  - Extend `PipelineOrchestrator` with `async runSyncScores(report: ComparisonReport): Promise<SyncResult>`:
    1. Use `report.matches` — only sync scores for matched assignments
    2. For each matched pair, compute score diffs using student matcher
    3. Apply overwrite policy: `skip-existing` / `overwrite-if-different` / `overwrite-all`
    4. If `dryRun`: return `SyncResult` with diff preview
    5. If not dryRun: for each score that needs updating:
       a. Switch CDP to target tab
       b. Navigate to the assignment's score entry page
       c. Use agent to type score into correct student cell
       d. Handle Aeries auto-save-on-blur (each type+tab is a write — warn user)
       e. Log each score update
    6. Score normalization using score-normalizer (Task 6)
    7. Staleness check: verify source data timestamp is recent (< 5 min) before writing
    8. Session health check: verify target tab is still authenticated before writing
  - `SyncResult { updated: ScoreUpdate[]; skipped: ScoreUpdate[]; failed: Array<{ student: string; assignment: string; error: string }> }`
  - `ScoreUpdate { student: string; assignment: string; oldScore: number | null; newScore: number }`
  - Write tests with mocked agent/CDP

  **Must NOT do**:
  - Hard-code platform-specific selectors
  - Skip overwrite policy enforcement
  - Write scores without staleness check
  - Modify compare or create-missing stages

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex stage — score entry with auto-save side effects, staleness checks, overwrite policies
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 14)
  - **Blocks**: Tasks 15, 21
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `src/lib/pipeline/orchestrator.ts` (Tasks 9, 12) — Extend the orchestrator
  - `.claude/skills/gb-sync/SKILL.md` — The full 1193-line sync skill. Study: per-student temp file lifecycle, Version A/B pairs, verification re-scrape, staleness detection. This task implements the core sync logic in TypeScript.
  - `ogre-desktop/src/assets/profiles/aeries.md` — Documents auto-save-on-blur behavior. The sync stage must warn the user about this.

  **API/Type References**:
  - `src/lib/pipeline/score-normalizer.ts` (Task 6) — `normalizeScore()`, `parseScore()`
  - `src/lib/pipeline/student-matcher.ts` (Task 4) — `matchStudents()`
  - `src/lib/pipeline/types.ts` — `OverwritePolicy`, `PipelineOptions`

  **WHY Each Reference Matters**:
  - `gb-sync/SKILL.md`: Contains the entire sync workflow including staleness detection and verification patterns
  - `aeries.md`: Auto-save-on-blur means every score entry is irreversible — critical safety context
  - `score-normalizer.ts`: Scores must be normalized before comparison or entry

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/orchestrator.test.ts` → PASS (new tests for sync stage)
  - [ ] Overwrite policy correctly filters which scores to update
  - [ ] Dry-run returns score diff preview without writing
  - [ ] Staleness check rejects stale data (> 5 min old)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sync dry-run shows score diff preview
    Tool: Bash (npx vitest)
    Preconditions: Mock report with 3 matched assignments, each with 5 student scores
    Steps:
      1. Run `orchestrator.runSyncScores(report)` with dryRun=true
      2. Assert result includes diff preview for each student/assignment pair
      3. Assert zero agent executeAction calls
    Expected Result: Complete diff preview, no side effects
    Failure Indicators: Agent actions executed in dry-run
    Evidence: .sisyphus/evidence/task-13-sync-dryrun.txt

  Scenario: Overwrite policy 'skip-existing' skips non-null target scores
    Tool: Bash (npx vitest)
    Preconditions: Target has scores for students 1-3, source has scores for students 1-5
    Steps:
      1. Run with overwritePolicy='skip-existing', dryRun=false
      2. Assert students 1-3 are in result.skipped
      3. Assert students 4-5 are in result.updated (new scores only)
    Expected Result: Existing scores untouched, only new scores written
    Failure Indicators: Existing scores overwritten, wrong students in updated list
    Evidence: .sisyphus/evidence/task-13-overwrite-policy.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add orchestrator sync-scores stage`
  - Files: `src/lib/pipeline/orchestrator.ts` (update), test file update
  - Pre-commit: `npx vitest run src/lib/pipeline/orchestrator.test.ts`

- [ ] 14. Pipeline Progress Event System

  **What to do**:
  - Create `src/lib/pipeline/events.ts`:
    - `PipelineEventEmitter` class — typed event emitter for pipeline progress
    - Events: `stage-change`, `progress`, `extraction-complete`, `comparison-ready`, `creation-progress`, `sync-progress`, `error`, `complete`
    - `on(event: string, handler: Function)`, `off()`, `emit(event: string, data: any)`
    - Typed: each event type has a specific payload type (discriminated union)
    - Thread-safe: multiple listeners, unsubscribe, one-time listeners
  - Update orchestrator to use this emitter instead of raw callback
  - Write tests verifying event emission order and payload correctness

  **Must NOT do**:
  - Use Node.js `EventEmitter` (browser environment — use custom implementation)
  - Emit events that contain sensitive data (scores, student names) in event payloads visible to devtools
  - Add complex event bus or pub/sub library dependency

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Event system design with typed payloads and integration with orchestrator
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 13)
  - **Blocks**: Task 15
  - **Blocked By**: Task 9 (orchestrator exists to integrate with)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:104-115` — `AgentEvent` discriminated union. Follow this pattern for `PipelineEvent`.
  - `ogre-desktop/src/lib/agent-loop.ts:168` — `runLoop()` is an async generator that yields events. The pipeline uses a similar event-driven pattern but with an emitter instead of generator.

  **WHY Each Reference Matters**:
  - `agent-loop.ts`: Establishes the codebase convention for typed events — discriminated unions with `type` field

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/events.test.ts` → PASS
  - [ ] Events emitted in correct order during pipeline execution
  - [ ] Listeners can subscribe/unsubscribe

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Events fire in correct order during compare stage
    Tool: Bash (npx vitest)
    Preconditions: Event emitter created, orchestrator integrated
    Steps:
      1. Subscribe to all events, record order
      2. Run compare stage
      3. Assert event order: stage-change(comparing) → progress → extraction-complete(source) → extraction-complete(target) → comparison-ready → stage-change(previewing)
    Expected Result: Events in expected order with correct payloads
    Failure Indicators: Wrong order, missing events, wrong payload types
    Evidence: .sisyphus/evidence/task-14-event-order.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add progress event system`
  - Files: `src/lib/pipeline/events.ts`, `src/lib/pipeline/events.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/events.test.ts`

- [ ] 15. PipelinePanel.svelte — Progress, Diff View, Confirmations

  **What to do**:
  - Create `src/components/pipeline/PipelinePanel.svelte`:
    - Right-side drawer panel (like GradingPanel) toggled from nav bar
    - Stages displayed as stepper: Compare → Preview → Create → Sync → Done
    - **Compare stage**: "Extracting from Source..." / "Extracting from Target..." with spinner
    - **Preview stage**: Render ComparisonReport as diff table:
      - Matched assignments: source name ↔ target name (confidence badge)
      - Unmatched source: "Will create in target" (green)
      - Unmatched target: "Only in target" (gray)
      - Score diffs: table with student, source score, target score, diff type (color-coded)
    - **Confirmation buttons**: "Create Missing Assignments" / "Sync Scores" / "Cancel"
    - **Progress bar**: during create/sync stages with per-item status
    - **Result summary**: created/skipped/failed counts with expandable details
    - **Pipeline config panel**: overwrite policy dropdown, dry-run toggle, thresholds
    - Wire up to PipelineEventEmitter for live progress updates
  - Follow existing GradingPanel pattern for drawer mechanics (collapsible, resizable)

  **Must NOT do**:
  - Implement pipeline logic — UI only, receives data via events/props
  - Hard-code platform names (show whatever the source/target tab titles are)
  - Auto-start pipeline without user action
  - Skip the confirmation step before writes

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex UI component with tables, steppers, progress bars, color coding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 16)
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 12, 13, 14, 10 (needs all pipeline stages and tab roles)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/GradingPanel.svelte` — Drawer panel pattern: collapsible, resizable, toggle from nav bar. Follow this exact pattern for the pipeline panel.
  - `ogre-desktop/src/pages/Browser.svelte:397-405` — `toggleDrawer()` function and drawer button in nav bar. Add similar toggle for pipeline panel.
  - `ogre-desktop/src/pages/Browser.svelte:515-521` — How GradingPanel is rendered conditionally. Follow same `{#if showPipelinePanel}` pattern.

  **API/Type References**:
  - `src/lib/pipeline/events.ts` (Task 14) — `PipelineEventEmitter`, `PipelineEvent` types
  - `src/lib/pipeline/types.ts` — `ComparisonReport`, `PipelineStage`, `PipelineOptions`

  **External References**:
  - Svelte 5 reactivity patterns — the panel subscribes to pipeline events and updates reactively

  **WHY Each Reference Matters**:
  - `GradingPanel.svelte`: Exact drawer mechanics to replicate (collapsible, resizable, bounds adjustment)
  - `Browser.svelte:397-405`: How to add a toggle button and wire up visibility
  - Pipeline event types: The panel subscribes to these for live updates

  **Acceptance Criteria**:
  - [ ] Pipeline panel renders with stepper, diff table, and confirmation buttons
  - [ ] Panel toggle button visible in nav bar
  - [ ] ComparisonReport renders as color-coded diff table
  - [ ] Confirmation buttons present before write operations

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pipeline panel renders comparison report as diff table
    Tool: Playwright (playwright skill)
    Preconditions: App running, mock pipeline data fed to panel
    Steps:
      1. Open pipeline panel via nav bar toggle
      2. Assert panel is visible with `.pipeline-panel` selector
      3. Assert stepper shows stages: Compare, Preview, Create, Sync, Done
      4. Feed mock ComparisonReport data
      5. Assert diff table shows matched assignments with confidence badges
      6. Assert unmatched-source rows have green "Will create" label
      7. Assert score diff rows are color-coded (new=green, changed=yellow, decreased=red)
    Expected Result: All data rendered correctly with proper color coding
    Failure Indicators: Missing table, wrong colors, data not displayed
    Evidence: .sisyphus/evidence/task-15-pipeline-panel.png

  Scenario: Confirmation buttons block writes until clicked
    Tool: Playwright (playwright skill)
    Preconditions: Pipeline in preview stage
    Steps:
      1. Assert "Create Missing Assignments" button is visible
      2. Assert "Sync Scores" button is visible
      3. Assert "Cancel" button is visible
      4. Assert no agent actions have been dispatched yet
    Expected Result: Write operations blocked until user clicks confirm
    Failure Indicators: Auto-write without confirmation
    Evidence: .sisyphus/evidence/task-15-confirmation-buttons.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add PipelinePanel with progress, diff view, confirmations`
  - Files: `src/components/pipeline/PipelinePanel.svelte`
  - Pre-commit: N/A (UI)

- [ ] 16. Pipeline Entry Point — Wire Orchestrator to Agent Chat

  **What to do**:
  - Create `src/lib/pipeline/entry.ts`:
    - `startPipeline(config: PipelineConfig, options?: Partial<PipelineOptions>): PipelineOrchestrator`
    - Wires up: creates orchestrator, attaches event emitter, connects to UI panel
    - Reads Source/Target tab IDs from tab role state (Task 10)
    - Validates: both Source and Target tabs are designated and have loaded pages
    - Provides error if tabs aren't designated: "Please designate Source and Target tabs first"
  - Add pipeline trigger to AgentChat.svelte or Browser.svelte:
    - New button in pipeline panel: "Start Compare" (triggers `startPipeline`)
    - Or: slash command in agent chat: `/pipeline compare` → triggers pipeline
  - Connect PipelinePanel to the orchestrator events for live updates

  **Must NOT do**:
  - Auto-start pipeline on tab designation
  - Bypass the PipelinePanel confirmation flow
  - Modify the agent loop (pipeline orchestrator is separate from agent chat)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work connecting multiple subsystems (orchestrator, UI, tab roles)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 15)
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 5, 10

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/AgentChat.svelte` — How agent chat dispatches actions. If adding a `/pipeline` command, follow existing chat command pattern.
  - `ogre-desktop/src/pages/Browser.svelte:94-103` — `openNewTab()` pattern for creating orchestrator instances

  **API/Type References**:
  - `src/lib/pipeline/orchestrator.ts` (Task 9) — `PipelineOrchestrator` class
  - `src/lib/pipeline/events.ts` (Task 14) — `PipelineEventEmitter`
  - `src/lib/pipeline/types.ts` — `PipelineConfig`, `PipelineOptions`
  - `Browser.svelte` (Task 10) — `getSourceTabId()`, `getTargetTabId()`

  **WHY Each Reference Matters**:
  - `AgentChat.svelte`: If adding slash command, follow existing command patterns
  - `Browser.svelte:94-103`: Pattern for creating complex objects from UI state

  **Acceptance Criteria**:
  - [ ] `startPipeline` validates Source/Target tabs are designated
  - [ ] Pipeline events flow to PipelinePanel for live updates
  - [ ] Error shown if tabs not designated

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pipeline validates tab designation before starting
    Tool: Playwright (playwright skill)
    Preconditions: App running, no tabs designated as Source/Target
    Steps:
      1. Open pipeline panel
      2. Click "Start Compare"
      3. Assert error message: "Please designate Source and Target tabs first"
    Expected Result: Clear error, pipeline does not start
    Failure Indicators: Pipeline starts without designated tabs, crash
    Evidence: .sisyphus/evidence/task-16-validation-error.png

  Scenario: Pipeline starts when both tabs designated
    Tool: Playwright (playwright skill)
    Preconditions: Two tabs open, Source and Target designated
    Steps:
      1. Open pipeline panel
      2. Click "Start Compare"
      3. Assert stepper moves to "Comparing" stage
      4. Assert progress messages appear in panel
    Expected Result: Pipeline starts, events flow to UI
    Failure Indicators: Nothing happens, error thrown, events not displayed
    Evidence: .sisyphus/evidence/task-16-pipeline-start.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): wire orchestrator to agent chat entry point`
  - Files: `src/lib/pipeline/entry.ts`, `src/components/pipeline/PipelinePanel.svelte` (update)
  - Pre-commit: `npx vitest run`

- [ ] 17. Workflow Recorder Controller

  **What to do**:
  - Create `src/lib/pipeline/workflow-recorder.ts`:
    - `WorkflowRecorder` class — wraps an AgentEvent async generator and records action+result pairs
    - `start(agentEvents: AsyncGenerator<AgentEvent>): void` — begins recording
    - `stop(): RecordedWorkflow` — stops recording and returns the workflow
    - `RecordedWorkflow { steps: RecordedStep[]; metadata: { url: string; tabId: string; recordedAt: number; duration: number } }`
    - `RecordedStep { action: ActionParams; result: ActionResult; reasoning?: string; timestamp: number }`
    - Filters: only records `propose` + `result` event pairs (skips `thinking`, `context`, `text` events)
    - Does NOT modify or intercept the event stream — pure observer pattern
    - Handles: recording while agent is in review mode (user approves each step = the taught workflow)
  - Write tests with mock AgentEvent streams

  **Must NOT do**:
  - Modify `runLoop()` or `createAgentController()` — pure observer
  - Record DOM snapshots or screenshots (too large) — just action+result pairs
  - Store as executable code — declarative step arrays only
  - Record mouse movements or raw browser events

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Async generator consumption pattern, event stream filtering, state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 18, 19)
  - **Blocks**: Tasks 20, 21
  - **Blocked By**: Task 5 (needs tabId in AgentLoopConfig)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-loop.ts:104-115` — `AgentEvent` type union. The recorder filters this stream, keeping only `propose` + `result` pairs.
  - `ogre-desktop/src/lib/agent-loop.ts:141-149` — `AgentController` interface. The recorder wraps the `start()` generator return, not the controller itself.
  - `ogre-desktop/src/lib/agent-types.ts:36-50` — `ActionParams` discriminated union. Each recorded step contains one of these.

  **WHY Each Reference Matters**:
  - `AgentEvent`: The exact events being filtered/recorded — recorder must handle all 9 types
  - `AgentController`: Understanding how the async generator works to wrap it correctly
  - `ActionParams`: The shape of each recorded action step

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/workflow-recorder.test.ts` → PASS (≥ 5 tests)
  - [ ] Recorder captures action+result pairs from mock event stream
  - [ ] Recorder ignores thinking/context/text events
  - [ ] RecordedWorkflow contains correct metadata

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Recorder captures action-result pairs from event stream
    Tool: Bash (npx vitest)
    Preconditions: Mock AgentEvent stream with 3 propose+result pairs interspersed with thinking/text events
    Steps:
      1. Create recorder, feed mock event stream
      2. Stop recording, get RecordedWorkflow
      3. Assert workflow.steps.length === 3
      4. Assert each step has action, result, and timestamp
      5. Assert thinking/text events are NOT in steps
    Expected Result: Only action+result pairs recorded, metadata correct
    Failure Indicators: Wrong step count, thinking events leaked into steps
    Evidence: .sisyphus/evidence/task-17-recorder-capture.txt

  Scenario: Recorder handles empty stream gracefully
    Tool: Bash (npx vitest)
    Preconditions: Empty mock event stream (no events)
    Steps:
      1. Start recorder, immediately stop
      2. Assert workflow.steps.length === 0
      3. Assert metadata.duration ≥ 0
    Expected Result: Empty workflow, no errors
    Failure Indicators: Error on empty stream, negative duration
    Evidence: .sisyphus/evidence/task-17-recorder-empty.txt
  ```

  **Commit**: YES
  - Message: `feat(workflow): add recording controller for AgentEvent stream`
  - Files: `src/lib/pipeline/workflow-recorder.ts`, `src/lib/pipeline/workflow-recorder.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/workflow-recorder.test.ts`

- [ ] 18. Workflow Replay Controller

  **What to do**:
  - Create `src/lib/pipeline/workflow-replay.ts`:
    - `WorkflowReplayController` class — executes recorded steps without AI
    - `async replay(workflow: RecordedWorkflow, tabId: string): AsyncGenerator<ReplayEvent>`
    - `ReplayEvent = { type: 'step-start'; step: number; action: ActionParams } | { type: 'step-result'; step: number; result: ActionResult } | { type: 'replay-done'; totalSteps: number; succeeded: number; failed: number } | { type: 'replay-error'; step: number; error: string }`
    - For each step: execute the action directly via `executeAction(step.action, tabId)` — NO AI call
    - Step delay: configurable pause between steps (default 500ms) for page state to settle
    - Error handling: if a step fails, emit error event and continue (or stop, configurable)
    - Validation: before replay, verify the tab URL matches the recorded URL (warn if different)
  - Write tests with mocked `executeAction`

  **Must NOT do**:
  - Call the AI/agent API during replay — replay is deterministic
  - Modify the original `RecordedWorkflow` data
  - Execute `runJS` steps without user approval (maintain existing safety rule)
  - Hard-code any selectors or URLs

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Async generator pattern with error handling and step sequencing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 17, 19)
  - **Blocks**: Tasks 20, 21
  - **Blocked By**: Task 17 (needs RecordedWorkflow type)

  **References**:

  **Pattern References**:
  - `src/lib/pipeline/workflow-recorder.ts` (Task 17) — `RecordedWorkflow`, `RecordedStep` types
  - `ogre-desktop/src/lib/agent-loop.ts:168` — `runLoop()` async generator pattern. Replay follows the same yield pattern but without AI calls.
  - `ogre-desktop/src/lib/browser-actions.ts` — `executeAction()` function. Replay calls this directly for each step.

  **API/Type References**:
  - `ogre-desktop/src/lib/agent-types.ts:36-50` — `ActionParams` — input to `executeAction()`
  - `ogre-desktop/src/lib/agent-types.ts:57-61` — `ActionResult` — output from `executeAction()`

  **WHY Each Reference Matters**:
  - `workflow-recorder.ts`: Defines the data format being replayed
  - `agent-loop.ts`: Async generator pattern to follow for event emission
  - `browser-actions.ts`: The actual action execution function called during replay

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/workflow-replay.test.ts` → PASS (≥ 5 tests)
  - [ ] Replay executes steps in order without AI calls
  - [ ] Replay emits correct events for each step
  - [ ] URL validation warns if tab URL doesn't match recorded URL

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Replay executes recorded steps in order
    Tool: Bash (npx vitest)
    Preconditions: Mock workflow with 3 steps, mock executeAction
    Steps:
      1. Run replay(workflow, 'tab-1')
      2. Collect all yielded events
      3. Assert step-start events in order: step 0, 1, 2
      4. Assert step-result events follow each step-start
      5. Assert replay-done event at end with totalSteps=3
      6. Assert executeAction called 3 times with correct params
    Expected Result: Steps execute sequentially, events emitted correctly
    Failure Indicators: Wrong order, missing events, executeAction not called
    Evidence: .sisyphus/evidence/task-18-replay-order.txt

  Scenario: Replay handles step failure gracefully
    Tool: Bash (npx vitest)
    Preconditions: Mock executeAction to fail on step 2
    Steps:
      1. Run replay with stopOnError=false
      2. Assert step 1 succeeds, step 2 emits replay-error, step 3 succeeds
      3. Assert replay-done shows succeeded=2, failed=1
    Expected Result: Replay continues past failure, reports correctly
    Failure Indicators: Replay stops at failure, no error event
    Evidence: .sisyphus/evidence/task-18-replay-failure.txt
  ```

  **Commit**: YES
  - Message: `feat(workflow): add replay controller for recorded steps`
  - Files: `src/lib/pipeline/workflow-replay.ts`, `src/lib/pipeline/workflow-replay.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/workflow-replay.test.ts`

- [ ] 19. Workflow Skill Creation Prompt

  **What to do**:
  - Create `src/lib/workflow-creation-prompt.ts`:
    - `WORKFLOW_CREATION_PROMPT` — parallel to existing `SKILL_CREATION_PROMPT` but for workflows instead of grading skills
    - Phase 1 — Interview (ask one at a time):
      1. What platforms does this workflow connect? (e.g., "MyOpenMath to Aeries")
      2. What is the goal of this workflow? (e.g., "sync scores", "create assignments", "compare gradebooks")
      3. What steps are involved? (describe the click/type/navigate sequence)
      4. Are there any conditions or variations? (e.g., "skip if score already exists")
      5. What should happen on errors? (retry, skip, stop)
    - Phase 2 — Skill Generation:
      - Generate markdown skill with workflow-specific frontmatter:
        ```yaml
        name: [Workflow name]
        description: [One sentence]
        author: Created with O.G.R.E
        source: workflow
        url_pattern: [auto-detected from platforms]
        workflow_type: [compare | create | sync | custom]
        ```
      - Body: structured step description with preconditions and expected outcomes
    - After presenting: "Does this look right? You can adjust or say 'Save' to save."
  - Follow exact structure of existing `SKILL_CREATION_PROMPT`

  **Must NOT do**:
  - Modify existing `SKILL_CREATION_PROMPT` (grading skills are separate)
  - Generate executable code in the skill content
  - Hard-code platform names in the prompt

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Prompt authoring — structured interview design, markdown template creation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Tasks 17, 18)
  - **Blocks**: Task 20
  - **Blocked By**: None (can start immediately, but placed in Wave 6 for logical grouping)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/skill-creation-prompt.ts` — The existing `SKILL_CREATION_PROMPT` (48 lines). Follow this EXACT structure: Phase 1 interview → Phase 2 generation → save prompt. Your workflow version is a parallel document.

  **API/Type References**:
  - `ogre-desktop/src/lib/skills-api.ts` — `saveSkill()` function. New skills will be saved with `source: 'workflow'` and `url_pattern` field.

  **WHY Each Reference Matters**:
  - `skill-creation-prompt.ts`: The template to follow — same interview structure, same save flow
  - `skills-api.ts`: Understanding what fields the skill needs to have for proper save/load

  **Acceptance Criteria**:
  - [ ] `WORKFLOW_CREATION_PROMPT` exported
  - [ ] Prompt includes Phase 1 (5 interview questions) and Phase 2 (skill generation template)
  - [ ] Generated skill format includes `source: workflow` and `workflow_type` frontmatter

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Workflow prompt generates valid skill markdown
    Tool: Bash (manual review)
    Preconditions: Prompt created
    Steps:
      1. Read the prompt file
      2. Verify Phase 1 has 5 questions asked one-at-a-time
      3. Verify Phase 2 generates markdown with frontmatter: name, description, author, source, url_pattern, workflow_type
      4. Verify prompt ends with "Save" instruction
    Expected Result: Prompt follows SKILL_CREATION_PROMPT structure with workflow-specific fields
    Failure Indicators: Missing questions, wrong frontmatter fields, no save instruction
    Evidence: .sisyphus/evidence/task-19-workflow-prompt.txt
  ```

  **Commit**: YES
  - Message: `feat(workflow): add workflow skill creation prompt`
  - Files: `src/lib/workflow-creation-prompt.ts`
  - Pre-commit: N/A (prompt text)

- [ ] 20. Workflow Skill Save/Load Integration

  **What to do**:
  - Create `src/lib/pipeline/workflow-skill.ts`:
    - `saveWorkflowAsSkill(workflow: RecordedWorkflow, name: string, description: string): Promise<void>`
      - Converts `RecordedWorkflow` to markdown skill format with frontmatter
      - Saves via existing `saveSkill()` with `source: 'workflow'`, `url_pattern` auto-detected from workflow URL
    - `loadWorkflowFromSkill(skillId: string): Promise<RecordedWorkflow>`
      - Reads skill from DB, parses markdown content back to `RecordedWorkflow`
    - `getWorkflowSkills(): Promise<Skill[]>` — lists all skills with `source: 'workflow'`
  - Update SkillCreator.svelte or create new WorkflowCreator.svelte:
    - Add "Record Workflow" button that starts recorder (Task 17) when agent is in review mode
    - After recording stops, present save dialog with name/description fields
    - Use `WORKFLOW_CREATION_PROMPT` (Task 19) for AI-assisted workflow creation
  - Add "Replay" button on workflow skills in Skills page
  - Write tests for save/load round-trip

  **Must NOT do**:
  - Store executable code (just step arrays serialized as YAML/JSON in markdown code block)
  - Create new DB tables — use existing `skills` table with `source: 'workflow'`
  - Modify existing skill CRUD functions — add new wrapper functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration across skill system, DB, recorder, and UI components
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but logically after Wave 6)
  - **Parallel Group**: Wave 7 (with Task 21)
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 17, 18, 19

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/skills-api.ts` — `saveSkill()` function with `source`, `url_pattern`, `content` fields. Your save function wraps this.
  - `ogre-desktop/src/lib/skill-parser.ts` — Markdown frontmatter parser. Understand how skills are stored (YAML frontmatter + markdown body).
  - `ogre-desktop/src/components/skills/SkillCreator.svelte` — Existing AI skill creation UI. Follow or extend for workflow creation.

  **API/Type References**:
  - `src/lib/pipeline/workflow-recorder.ts` (Task 17) — `RecordedWorkflow`, `RecordedStep`
  - `src/lib/pipeline/workflow-replay.ts` (Task 18) — `WorkflowReplayController`
  - `src/lib/workflow-creation-prompt.ts` (Task 19) — `WORKFLOW_CREATION_PROMPT`

  **WHY Each Reference Matters**:
  - `skills-api.ts`: The save/load interface — wrapping this ensures workflows are stored in the same system as grading skills
  - `skill-parser.ts`: Must serialize/deserialize workflow data compatible with the parser
  - `SkillCreator.svelte`: UI pattern to follow or extend for workflow creation

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/workflow-skill.test.ts` → PASS
  - [ ] Workflow saves as skill with `source: 'workflow'`
  - [ ] Saved workflow loads back as `RecordedWorkflow` (round-trip)
  - [ ] Workflow skills appear in Skills page with "Replay" button

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Workflow save/load round-trip preserves data
    Tool: Bash (npx vitest)
    Preconditions: Mock RecordedWorkflow with 3 steps
    Steps:
      1. Save workflow as skill: `saveWorkflowAsSkill(workflow, 'Test Flow', 'Test description')`
      2. Load it back: `loadWorkflowFromSkill(savedId)`
      3. Assert loaded workflow.steps.length === 3
      4. Assert each step's action and result match original
      5. Assert metadata preserved
    Expected Result: Perfect round-trip, no data loss
    Failure Indicators: Step count mismatch, action data corrupted, metadata lost
    Evidence: .sisyphus/evidence/task-20-workflow-roundtrip.txt

  Scenario: Workflow skill has correct source field
    Tool: Bash (npx vitest)
    Preconditions: Workflow saved
    Steps:
      1. Query skills DB for saved workflow
      2. Assert `source === 'workflow'`
      3. Assert `url_pattern` matches recorded URL domain
    Expected Result: Correct metadata stored
    Failure Indicators: Wrong source, missing url_pattern
    Evidence: .sisyphus/evidence/task-20-workflow-metadata.txt
  ```

  **Commit**: YES
  - Message: `feat(workflow): integrate skill save/load with recording system`
  - Files: `src/lib/pipeline/workflow-skill.ts`, `src/lib/pipeline/workflow-skill.test.ts`, UI updates
  - Pre-commit: `npx vitest run`

- [ ] 21. Pipeline E2E Integration Test

  **What to do**:
  - Create `src/lib/pipeline/e2e.test.ts`:
    - Full pipeline flow test with comprehensive mocks:
      1. Mock two tabs (source with MOM-like data, target with Aeries-like data)
      2. Designate Source/Target
      3. Run compare stage → verify ComparisonReport structure
      4. Run create-missing with dryRun=true → verify preview
      5. Run sync-scores with dryRun=true → verify score diff preview
      6. Verify all events emitted in correct order
      7. Verify no direct browser actions executed (all mocked)
    - Workflow recording E2E test:
      1. Start recorder on mock agent event stream
      2. Feed 5 action+result pairs
      3. Stop recording → get RecordedWorkflow
      4. Replay workflow with mock executeAction
      5. Verify 5 steps replayed in order
      6. Save as skill → load back → verify round-trip
    - Integration tests verifying modules wire together correctly
  - These are NOT end-to-end with real browser — they're integration tests with mocked I/O

  **Must NOT do**:
  - Require real MOM/Aeries sessions
  - Use real CDP/browser connections
  - Test UI components (Svelte testing is separate)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex integration testing across all pipeline modules
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 7 (with Task 20)
  - **Blocks**: F1-F4 (Final Verification)
  - **Blocked By**: Tasks 15, 16, 20 (needs all pipeline components)

  **References**:

  **Pattern References**:
  - All pipeline modules from Tasks 3-18 — this test imports and wires them all together

  **WHY Each Reference Matters**:
  - All prior tasks: This test validates the modules integrate correctly as a system

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/pipeline/e2e.test.ts` → PASS
  - [ ] Full compare→create→sync flow tested with mocks
  - [ ] Record→replay→save→load flow tested with mocks
  - [ ] Event emission order verified

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full pipeline flow (compare → create → sync) with mocks
    Tool: Bash (npx vitest)
    Preconditions: All pipeline modules imported
    Steps:
      1. Create PipelineOrchestrator with mock source (10 assignments) and target (7 assignments)
      2. Run compare → assert 7 matches, 3 unmatched source
      3. Run createMissing (dryRun=true) → assert 3 assignments in preview
      4. Run syncScores (dryRun=true) → assert score diffs for matched pairs
      5. Assert event order: stage-change(comparing) → extraction-complete(source) → extraction-complete(target) → comparison-ready → stage-change(previewing)
    Expected Result: All stages complete, correct data at each stage
    Failure Indicators: Wrong match count, missing events, stage order violation
    Evidence: .sisyphus/evidence/task-21-e2e-pipeline.txt

  Scenario: Record → Replay → Save → Load round-trip
    Tool: Bash (npx vitest)
    Preconditions: Recorder, replayer, and skill saver all available
    Steps:
      1. Record 5 steps from mock agent stream
      2. Replay the recorded workflow → assert 5 actions executed
      3. Save as skill → load back
      4. Replay the loaded workflow → assert same 5 actions
    Expected Result: Complete lifecycle works, data preserved through all transformations
    Failure Indicators: Step loss, action data corruption, replay failure
    Evidence: .sisyphus/evidence/task-21-e2e-workflow.txt
  ```

  **Commit**: YES
  - Message: `test(pipeline): add E2E integration test for full pipeline`
  - Files: `src/lib/pipeline/e2e.test.ts`
  - Pre-commit: `npx vitest run src/lib/pipeline/e2e.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + linter + `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean app state. Open MOM in one tab, Aeries in another. Designate Source/Target. Run compare stage — verify ComparisonReport renders in PipelinePanel. Run create-missing with dry-run — verify preview shows correct assignments. Test workflow recording: start recording, perform 3 agent actions, save as skill. Replay the saved skill. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Tasks | Commit Message | Files | Pre-commit |
|-------|---------------|-------|------------|
| T1 | `spike(cdp): validate multi-target switching with two WebView2 tabs` | `src/lib/cdp-multi-target.spike.ts` | N/A (spike) |
| T2 | `feat(pipeline): add shared type definitions for pipeline engine` | `src/lib/pipeline/types.ts` | `npx vitest run src/lib/pipeline/` |
| T3 | `feat(pipeline): add assignment name matcher with TDD tests` | `src/lib/pipeline/assignment-matcher.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/assignment-matcher.test.ts` |
| T4 | `feat(pipeline): add student name fuzzy matcher with TDD tests` | `src/lib/pipeline/student-matcher.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/student-matcher.test.ts` |
| T5 | `refactor(agent): thread tabId through agent-loop and browser-actions` | `src/lib/agent-loop.ts`, `src/lib/browser-actions.ts` | `npx vitest run` |
| T6 | `feat(pipeline): add score normalizer with TDD tests` | `src/lib/pipeline/score-normalizer.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/score-normalizer.test.ts` |
| T7 | `feat(cdp): add multi-target switching utility for pipeline` | `src/lib/cdp-multi-target.ts`, `*.test.ts` | `npx vitest run src/lib/cdp-multi-target.test.ts` |
| T8 | `feat(pipeline): add comparison report generator with TDD tests` | `src/lib/pipeline/comparison-report.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/comparison-report.test.ts` |
| T9 | `feat(pipeline): add orchestrator compare stage` | `src/lib/pipeline/orchestrator.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/orchestrator.test.ts` |
| T10 | `feat(browser): add Source/Target tab role designation UI` | `src/pages/Browser.svelte` | N/A (UI) |
| T11 | `feat(pipeline): add configuration types and overwrite policy` | `src/lib/pipeline/types.ts` (update) | `npx vitest run src/lib/pipeline/` |
| T12 | `feat(pipeline): add orchestrator create-missing stage` | `src/lib/pipeline/orchestrator.ts` (update), `*.test.ts` | `npx vitest run src/lib/pipeline/orchestrator.test.ts` |
| T13 | `feat(pipeline): add orchestrator sync-scores stage` | `src/lib/pipeline/orchestrator.ts` (update), `*.test.ts` | `npx vitest run src/lib/pipeline/orchestrator.test.ts` |
| T14 | `feat(pipeline): add progress event system` | `src/lib/pipeline/events.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/events.test.ts` |
| T15 | `feat(ui): add PipelinePanel with progress, diff view, confirmations` | `src/components/pipeline/PipelinePanel.svelte` | N/A (UI) |
| T16 | `feat(pipeline): wire orchestrator to agent chat entry point` | `src/lib/pipeline/entry.ts`, updates to AgentChat.svelte | `npx vitest run` |
| T17 | `feat(workflow): add recording controller for AgentEvent stream` | `src/lib/pipeline/workflow-recorder.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/workflow-recorder.test.ts` |
| T18 | `feat(workflow): add replay controller for recorded steps` | `src/lib/pipeline/workflow-replay.ts`, `*.test.ts` | `npx vitest run src/lib/pipeline/workflow-replay.test.ts` |
| T19 | `feat(workflow): add workflow skill creation prompt` | `src/lib/workflow-creation-prompt.ts` | N/A (prompt) |
| T20 | `feat(workflow): integrate skill save/load with recording system` | `src/lib/skills-api.ts` (update), `src/lib/pipeline/workflow-skill.ts` | `npx vitest run` |
| T21 | `test(pipeline): add E2E integration test for full pipeline` | `src/lib/pipeline/e2e.test.ts` | `npx vitest run src/lib/pipeline/e2e.test.ts` |

---

## Success Criteria

### Verification Commands
```bash
npx vitest run src/lib/pipeline/          # All pipeline unit tests pass
npx vitest run src/lib/cdp-multi-target   # CDP switching tests pass
npx vitest run                            # Full test suite — zero regressions
npx tsc --noEmit                          # TypeScript compiles cleanly
```

### Final Checklist
- [ ] All "Must Have" items implemented and tested
- [ ] All "Must NOT Have" guardrails respected (no forbidden patterns)
- [ ] Pipeline completes compare→create→sync on MOM→Aeries tab pair
- [ ] Source/Target badges visible on tab bar
- [ ] Workflow recording captures agent actions as declarative steps
- [ ] Recorded workflow replays without AI calls
- [ ] All vitest tests pass (`npx vitest run`)
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] No `as any`, `@ts-ignore`, or empty catches in new code
- [ ] All evidence files present in `.sisyphus/evidence/`
