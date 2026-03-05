# Discover Tab: Comprehensive Scraper Upgrade

## TL;DR

> **Quick Summary**: Upgrade the Discover tab's DOM scraping pipeline to handle messy, poorly-structured grading pages. Replace the simple 500-node walker with an intelligent snapshot engine that collapses wrapper noise, captures iframe content, adds bounding-box spatial data, and includes a heuristic fast-path that skips the AI call for recognizable page patterns.
> 
> **Deliverables**:
> - Smart DOM cleanup engine (wrapper collapsing, form-element priority, visibility filtering)
> - Cross-frame DOM capture for same-origin iframes
> - Bounding-box spatial data per DOM node for AI visual correlation
> - Heuristic structural detection with automatic AI fallback
> - Prompt budget co-optimization (12K-char constraint reworked)
> - Comprehensive TDD test suite with fixture HTML fragments
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (spike) → Task 5 (cleanup) → Task 9 (interface evolution) → Task 11 (UI updates) → F1-F4

---

## Context

### Original Request
User asked whether PinchTab (browser automation bridge) could enhance OGRE's site profile mapping and AI-browser interaction. After analysis, PinchTab was determined to be a transport layer (not an intelligence layer) and not suitable. The conversation evolved into: "What tool can help reliably scrape and clean DOM from messy grading sites?" — leading to a comprehensive upgrade plan for the Discover tab's scraping pipeline.

### Interview Summary
**Key Discussions**:
- PinchTab evaluated and rejected — browser transport, not DOM intelligence
- External tools evaluated: Stagehand (AI browser framework), Crawl4AI (HTML cleanup), AgentQL (semantic queries), Harvester (fuzzy extraction)
- The existing Discover tab is already sophisticated (956-line UI, AI-powered discovery, element picker refinement, site profiles)
- The bottleneck is `DOM_SNAPSHOT_SCRIPT` — a hand-rolled walker capped at 500 nodes/depth 8 that fills with noise on messy sites
- User wants ALL 4 improvement areas: DOM cleanup, iframes, visual-to-DOM mapping, heuristic detection
- Platform target: Generic (any grading platform), not LMS-specific
- Dependencies: Whatever works best
- Tests: TDD with vitest

**Research Findings**:
- `discover.ts` has the full AI pipeline: DOM snapshot + screenshot → AI → DiscoveryResult → validation → picker refinement
- `DOM_SNAPSHOT_SCRIPT` runs inside Tauri webview via `evalScript()` using CDP `Runtime.evaluate` — must be plain browser JavaScript
- The prompt template truncates DOM snapshot JSON to **12,000 characters** (discover.ts line 309) — this is a hard constraint independent of the node cap
- CDP is the execution engine, which enables targeting iframe execution contexts via `executionContextId`
- Screenshot capture uses CDP primary (captures composited viewport including iframes) with html2canvas fallback
- Test environment is `node` (not `jsdom`) — DOM walker tests need environment strategy

### Metis Review
**Identified Gaps** (addressed):
- **12K-char prompt truncation**: The prompt template caps DOM JSON at 12K chars regardless of node count. A smarter walker producing richer data per node could actually REDUCE coverage. Co-design of walker and prompt budget is mandatory. → Addressed in Task 2.
- **CDP iframe context validation**: The entire iframe feature depends on CDP `Runtime.evaluate` with `executionContextId` working in WebView2. Untested assumption. → Addressed in Task 1 (spike gate).
- **DiscoveryResult backward compatibility**: New fields (iframe sources, bounding boxes, heuristic match) must not break existing saved SiteProfiles. → Addressed in Task 9.
- **Heuristic false-positive strategy**: If heuristics skip AI but produce wrong selectors, there's no fallback. → Addressed in Task 7 with automatic validation + AI fallback.
- **Test environment for DOM walker**: `node` vitest environment can't test DOM-dependent code directly. → Addressed in Task 3 with jsdom per-file override strategy.
- **Shadow DOM**: Modern LMS components may use Shadow DOM. → Documented as known limitation with optional shadow root traversal.
- **Cross-origin iframe security**: Browser blocks cross-origin iframe DOM access. → Documented as constraint, not a problem to solve.

---

## Work Objectives

### Core Objective
Transform the Discover tab's DOM capture from a simple tree walker into an intelligent snapshot engine that produces clean, AI-optimized page representations for any grading platform.

### Concrete Deliverables
- `dom-snapshot.ts` — New module: smart DOM walker with cleanup, scoring, and spatial data
- `dom-snapshot.test.ts` — TDD test suite with 9+ fixture HTML fragments
- `heuristic-detector.ts` — New module: pattern-based grading page detection
- `heuristic-detector.test.ts` — TDD test suite with structural pattern fixtures
- `iframe-capture.ts` — New module: cross-frame DOM capture via CDP
- `iframe-capture.test.ts` — Test suite (gated on spike result)
- Updated `discover.ts` — Integrates new snapshot engine, prompt budget optimization
- Updated `DiscoveryPanel.svelte` — UI for heuristic results, iframe indicators, spatial preview
- Updated `discover.test.ts` — Regression tests for existing functionality

### Definition of Done
- [ ] `npx vitest run src/lib/dom-snapshot*.test.ts` — all tests pass
- [ ] `npx vitest run src/lib/heuristic-detector*.test.ts` — all tests pass
- [ ] `npx vitest run src/lib/discover.test.ts` — all tests pass (including new + regression)
- [ ] `npx tsc --noEmit` — zero type errors
- [ ] Existing `SiteProfile` data loads without errors (backward compatibility)

### Must Have
- Smart DOM walker that collapses meaningless wrappers and prioritizes form/interactive elements
- Prompt budget co-optimization (walker and 12K-char cap designed together)
- Heuristic detection with automatic validation + AI fallback on failure
- Bounding box spatial data per DOM node
- Same-origin iframe DOM capture (gated on spike)
- TDD test suite with fixture HTML fragments
- Backward-compatible DiscoveryResult interface

### Must NOT Have (Guardrails)
- **No npm dependencies in injected DOM walker script** — must remain plain browser JS executed via `cdp.send('Runtime.evaluate')`
- **No LMS-specific heuristics** — detect STRUCTURAL patterns (repeating rows with inputs, form elements near names), NOT "this is Canvas because of data-component"
- **No cross-origin iframe DOM access** — browser security blocks it; document as limitation, don't attempt to bypass
- **No changes to `/api/chat` server endpoint contract** — snapshot improvement is client-side only
- **No "visual grounding" system** — bbox data is added to DOM nodes, period. No screenshot annotation, no clickable-region detection, no canvas overlay
- **No infinite DOM cleanup yak-shaving** — scope: collapse wrappers, prioritize forms, deduplicate siblings. Stop there.
- **No acceptance criteria requiring Tauri app or live grading pages** — all tests use fixtures
- **No unmeasurable criteria** like "AI produces better results"

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest configured in `ogre-desktop/vitest.config.ts`)
- **Automated tests**: TDD (RED → GREEN → REFACTOR for each feature)
- **Framework**: vitest with `@vitest-environment jsdom` per-file annotation for DOM walker tests
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (`npx vitest run`) — run test suites, compare output
- **Types**: Use Bash (`npx tsc --noEmit`) — verify type safety
- **Integration**: Use Bash to run discovery workflow tests against fixture HTML

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — spikes + foundation):
├── Task 1: CDP iframe context spike [quick]
├── Task 2: Prompt budget analysis + adaptive truncation design [quick]
├── Task 3: Test infrastructure — jsdom setup + HTML fixtures [quick]
└── Task 4: DOM snapshot types/interfaces [quick]

Wave 2 (After Wave 1 — core features, MAX PARALLEL):
├── Task 5: Smart DOM Cleanup engine (depends: 3, 4) [deep]
├── Task 6: Bounding box spatial data (depends: 3, 4) [unspecified-high]
├── Task 7: Heuristic structural detector (depends: 3, 4) [deep]
└── Task 8: Iframe DOM capture module (depends: 1, 3, 4) [unspecified-high]

Wave 3 (After Wave 2 — integration):
├── Task 9: DiscoveryResult interface evolution + migration (depends: 5, 6, 7, 8) [deep]
├── Task 10: discover.ts integration — new snapshot pipeline (depends: 2, 5, 6, 8, 9) [deep]
└── Task 11: DiscoveryPanel.svelte UI updates (depends: 7, 9, 10) [visual-engineering]

Wave 4 (After Wave 3 — verification):
├── Task 12: Regression test suite (depends: 10) [unspecified-high]
└── Task 13: End-to-end discovery workflow test (depends: 10, 11) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 8 → Task 9 → Task 10 → Task 11 → F1-F4
              Task 3 → Task 5 → Task 9 → Task 10 → Task 11
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1 and Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 8 | 1 |
| 2 | — | 10 | 1 |
| 3 | — | 5, 6, 7, 8 | 1 |
| 4 | — | 5, 6, 7, 8, 9 | 1 |
| 5 | 3, 4 | 9, 10 | 2 |
| 6 | 3, 4 | 9, 10 | 2 |
| 7 | 3, 4 | 9, 11 | 2 |
| 8 | 1, 3, 4 | 9, 10 | 2 |
| 9 | 5, 6, 7, 8 | 10, 11 | 3 |
| 10 | 2, 5, 6, 8, 9 | 11, 12, 13 | 3 |
| 11 | 7, 9, 10 | 13 | 3 |
| 12 | 10 | F1-F4 | 4 |
| 13 | 10, 11 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **4 tasks** — T5 → `deep`, T6 → `unspecified-high`, T7 → `deep`, T8 → `unspecified-high`
- **Wave 3**: **3 tasks** — T9 → `deep`, T10 → `deep`, T11 → `visual-engineering`
- **Wave 4**: **2 tasks** — T12 → `unspecified-high`, T13 → `deep`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs


### Wave 1 — Spikes + Foundation

- [ ] 1. CDP Iframe Context Spike

  **What to do**:
  - Write a minimal test script that uses CDP `Runtime.evaluate` with `executionContextId` to execute JavaScript inside an iframe within the Tauri WebView2 environment
  - Test with a simple HTML fixture containing a same-origin iframe
  - Document the CDP API pattern needed: how to discover iframe execution contexts via `Runtime.executionContextCreated` events or `Page.getFrameTree`
  - Record findings in a spike report file: `ogre-desktop/src/lib/iframe-capture-spike.md`
  - If CDP iframe targeting does NOT work in WebView2: document the limitation and recommend alternative approaches (e.g., postMessage bridge, or parent-frame DOM traversal that reads iframe `contentDocument`)

  **Must NOT do**:
  - Don't build a full iframe capture module — this is just a 10-line validation spike
  - Don't modify any existing source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused spike with clear pass/fail criteria
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 8 (iframe capture depends on this spike result)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser.ts:161-189` — Current CDP `Runtime.evaluate` implementation; shows how evalScript wraps CDP calls. The spike should use this same pattern but with `contextId` parameter.
  - `ogre-desktop/src/lib/browser.ts:45-62` — CDP connection setup via `window.__TAURI_INVOKE__`. Shows how to get the CDP session handle.

  **API/Type References**:
  - Chrome DevTools Protocol: `Runtime.evaluate` accepts optional `contextId` parameter for targeting specific execution contexts
  - Chrome DevTools Protocol: `Runtime.executionContextCreated` event fires for each frame's context, including iframes
  - Chrome DevTools Protocol: `Page.getFrameTree` returns frame hierarchy with frame IDs

  **WHY Each Reference Matters**:
  - `browser.ts:161-189`: This is the exact code path the iframe feature would use. The spike validates whether adding `contextId` to this call works in WebView2.
  - The CDP docs tell us what SHOULD work; the spike tells us what ACTUALLY works in Tauri's WebView2 environment.

  **Acceptance Criteria**:
  - [ ] Spike report file created: `ogre-desktop/src/lib/iframe-capture-spike.md`
  - [ ] Report documents: (a) whether `contextId` targeting works, (b) the exact CDP call pattern, (c) any WebView2-specific limitations
  - [ ] Report includes a code snippet that can be copied into the real implementation

  **QA Scenarios:**

  ```
  Scenario: CDP iframe context targeting works
    Tool: Bash (file read)
    Preconditions: Spike report file exists at ogre-desktop/src/lib/iframe-capture-spike.md
    Steps:
      1. Read the spike report file
      2. Verify it contains a section titled "Result" with either "WORKS" or "DOES NOT WORK"
      3. Verify it contains a code snippet section with at least 5 lines of JavaScript
    Expected Result: Report exists with clear verdict and code example
    Failure Indicators: File missing, no verdict section, or empty code snippet
    Evidence: .sisyphus/evidence/task-1-spike-report.txt

  Scenario: Spike report addresses WebView2 limitations
    Tool: Bash (grep)
    Preconditions: Spike report exists
    Steps:
      1. Search report for "WebView2" or "webview2" or "limitation"
      2. Verify at least one mention exists
    Expected Result: WebView2-specific findings documented
    Evidence: .sisyphus/evidence/task-1-webview2-mention.txt
  ```

  **Commit**: YES
  - Message: `spike(discover): validate CDP iframe context targeting in WebView2`
  - Files: `ogre-desktop/src/lib/iframe-capture-spike.md`
  - Pre-commit: none (documentation only)

- [ ] 2. Prompt Budget Analysis + Adaptive Truncation Design

  **What to do**:
  - Analyze the current 12,000-character JSON truncation in `DISCOVERY_USER_PROMPT_TEMPLATE` (discover.ts line 309)
  - Calculate: with current walker (500 nodes, ~13 attrs captured, 150-char text), what's the average chars-per-node? How many nodes typically fit in 12K?
  - Design an adaptive truncation strategy: rather than the current "slice array at 90% until under 12K" approach, implement priority-based truncation that keeps high-value nodes (forms, inputs, interactive) and drops low-value nodes (empty divs, decorative spans) first
  - Document the design in a brief spec: `ogre-desktop/src/lib/prompt-budget-spec.md`
  - Include recommendations for prompt budget: should 12K increase? Should it be configurable? What token cost implications?
  - If bounding boxes are added (Task 6), estimate the per-node overhead and recommend whether bbox data should be included in the AI prompt or kept separate

  **Must NOT do**:
  - Don't implement the adaptive truncation yet — just design it
  - Don't change the prompt template yet
  - Don't benchmark against live grading pages (use existing fixture HTML or estimates)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Analysis and documentation task, no code implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 10 (discover.ts integration needs this design)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:306-328` — Current `DISCOVERY_USER_PROMPT_TEMPLATE` function with the 12K truncation logic. The critical line is 309: `while (snapshotStr.length > 12000 && snapshot.length > 1)`. Currently slices to 90% repeatedly until under limit.
  - `ogre-desktop/src/lib/discover.ts:532-586` — Current `DOM_SNAPSHOT_SCRIPT`. Shows what data each node contains and the 500-node/depth-8 caps. Each node has: depth, tag, attrs (13 possible), text (150 chars), childCount.

  **WHY Each Reference Matters**:
  - `discover.ts:306-328`: This is the constraint that the design must work within. The current truncation is naive (remove from end). The new design should be smarter (remove low-value nodes first).
  - `discover.ts:532-586`: Understanding per-node data size is essential for calculating how many nodes fit in 12K chars with vs. without bbox data.

  **Acceptance Criteria**:
  - [ ] Design spec created: `ogre-desktop/src/lib/prompt-budget-spec.md`
  - [ ] Spec includes: current chars-per-node estimate, node budget calculations, priority-based truncation algorithm, bbox overhead estimate, prompt size recommendation

  **QA Scenarios:**

  ```
  Scenario: Design spec is complete and actionable
    Tool: Bash (file read)
    Preconditions: Spec file exists at ogre-desktop/src/lib/prompt-budget-spec.md
    Steps:
      1. Read the spec file
      2. Verify it contains sections: "Current Budget Analysis", "Priority-Based Truncation", "Bounding Box Overhead", "Recommendations"
      3. Verify the "Priority-Based Truncation" section describes a concrete algorithm (not just "prioritize important nodes")
    Expected Result: Spec has all 4 sections with concrete details
    Failure Indicators: Missing sections, vague algorithm description, no numeric estimates
    Evidence: .sisyphus/evidence/task-2-spec-review.txt
  ```

  **Commit**: YES
  - Message: `analysis(discover): document prompt budget constraints and adaptive truncation design`
  - Files: `ogre-desktop/src/lib/prompt-budget-spec.md`
  - Pre-commit: none (documentation only)

- [ ] 3. Test Infrastructure — jsdom Setup + HTML Fixture Library

  **What to do**:
  - Create a shared HTML fixture library for DOM walker testing: `ogre-desktop/src/lib/__fixtures__/dom-snapshots/`
  - Create at least 6 fixture HTML strings covering:
    - `simple-batch.html` — Clean batch grading page (like MyOpenMath): table rows with student names, score inputs, feedback textareas
    - `messy-wrappers.html` — Deeply nested meaningless div soup: 5+ levels of `<div>` with no attributes wrapping actual content
    - `iframe-grading.html` — Page with a same-origin iframe containing the grading form
    - `sequential-grading.html` — Single-student view with next/prev navigation
    - `hidden-content.html` — Page with large invisible sections (collapsed accordions, hidden tabs) mixed with visible content
    - `large-page.html` — 2000+ nodes to test the walker's handling of very large DOMs
  - Configure vitest to support per-file `@vitest-environment jsdom` annotation for DOM walker test files
  - Create a test helper module: `ogre-desktop/src/lib/__fixtures__/dom-test-helpers.ts` with utilities like `createDocument(html)`, `nodeCount(doc)`, `findBySelector(doc, selector)`
  - Verify the jsdom environment works by writing one trivial test that creates a document from fixture HTML and asserts `document.querySelectorAll` works

  **Must NOT do**:
  - Don't use real grading page HTML from live sites (create representative fixtures)
  - Don't modify existing test files
  - Don't add browser-specific APIs that jsdom doesn't support (no `getBoundingClientRect` in jsdom — bbox tests will need mocking)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test scaffolding and fixture creation, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 6, 7, 8 (all Wave 2 tasks need fixtures and jsdom)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.test.ts` — Existing test file. Shows current test conventions: vitest imports, describe/it structure, inline fixtures for `parseDiscoveryResponse`. New fixtures should follow this style.
  - `ogre-desktop/src/lib/discovery-picker-integration.test.ts:43-99` — Shows inline helper factories (`makePickerResult()`, `makeDiscovery()`, etc.). New test helpers should follow this pattern.
  - `ogre-desktop/vitest.config.ts` — Current vitest config. Uses `environment: 'node'`. The jsdom per-file annotation needs to work alongside this.

  **External References**:
  - vitest docs: Per-file environment override via `// @vitest-environment jsdom` comment at top of test file

  **WHY Each Reference Matters**:
  - `discover.test.ts`: Establishes test patterns. New tests must be consistent.
  - `discovery-picker-integration.test.ts:43-99`: The helper factory pattern should be reused for DOM fixtures.
  - `vitest.config.ts`: Need to verify jsdom per-file override works with existing config (no global change needed).

  **Acceptance Criteria**:
  - [ ] 6 fixture HTML files created in `ogre-desktop/src/lib/__fixtures__/dom-snapshots/`
  - [ ] Test helper module created: `ogre-desktop/src/lib/__fixtures__/dom-test-helpers.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/__fixtures__` → at least 1 test passes (jsdom validation)
  - [ ] Each fixture is valid HTML that can be parsed by jsdom without errors

  **QA Scenarios:**

  ```
  Scenario: jsdom environment works for DOM testing
    Tool: Bash
    Preconditions: Fixture files and test helper exist
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/__fixtures__ --reporter=verbose
      2. Check output for at least 1 passing test
      3. Verify no "document is not defined" errors
    Expected Result: Tests pass, jsdom provides document/window globals
    Failure Indicators: "ReferenceError: document is not defined" or all tests fail
    Evidence: .sisyphus/evidence/task-3-jsdom-validation.txt

  Scenario: All 6 HTML fixtures are parseable
    Tool: Bash
    Preconditions: Fixture files exist in __fixtures__/dom-snapshots/
    Steps:
      1. Run: ls ogre-desktop/src/lib/__fixtures__/dom-snapshots/*.html | wc -l
      2. Verify count is >= 6
    Expected Result: At least 6 .html fixture files exist
    Evidence: .sisyphus/evidence/task-3-fixture-count.txt
  ```

  **Commit**: YES
  - Message: `test(discover): add jsdom test infrastructure and HTML fixture library`
  - Files: `ogre-desktop/src/lib/__fixtures__/**`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/__fixtures__`

- [ ] 4. DOM Snapshot Types and Interfaces

  **What to do**:
  - Create `ogre-desktop/src/lib/dom-snapshot-types.ts` with TypeScript interfaces for the enhanced DOM snapshot:
    - `SnapshotNode` — Enhanced node: `{ depth, tag, attrs, text, childCount, bbox?, visible?, iframeSource?, priority? }`
    - `SnapshotOptions` — Walker configuration: `{ maxNodes, maxDepth, maxTextLength, captureVisibility, captureBbox, captureIframes, priorityElements }`
    - `SnapshotResult` — Full result: `{ nodes: SnapshotNode[], metadata: SnapshotMetadata }`
    - `SnapshotMetadata` — Stats: `{ totalDomNodes, capturedNodes, droppedNodes, iframeCount, crossOriginIframes, elapsedMs }`
    - `NodePriority` — Enum: `'critical' | 'high' | 'medium' | 'low' | 'noise'`
  - Define the priority scoring rules as constants:
    - `critical`: `input`, `textarea`, `select`, `button` with score/feedback-related attributes
    - `high`: Elements with `role`, `aria-label`, `name`, `data-testid` attributes
    - `medium`: Semantic elements (`table`, `tr`, `td`, `form`, `label`, `h1-h6`, `a`)
    - `low`: Generic containers (`div`, `span`) with attributes
    - `noise`: Empty containers with no attributes, no text, single child
  - Write `dom-snapshot-types.test.ts` with tests for:
    - Type guard functions: `isSnapshotNode()`, `isValidSnapshotResult()`
    - Priority classification function: `classifyNodePriority(tag, attrs, hasText, childCount) → NodePriority`

  **Must NOT do**:
  - Don't implement the actual DOM walker — just the types and classification function
  - Don't modify `discover.ts` or the existing `DiscoveryResult` interface yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions and simple classification function
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 6, 7, 8, 9 (all downstream tasks import these types)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:19-108` — Current type definitions for DiscoveryResult, SelectorMap, etc. New types should follow the same JSDoc style and naming conventions.
  - `ogre-desktop/src/lib/discover.ts:532-586` — Current DOM_SNAPSHOT_SCRIPT node shape: `{ depth, tag, attrs, text, childCount }`. The new `SnapshotNode` extends this with optional fields.

  **WHY Each Reference Matters**:
  - `discover.ts:19-108`: The new types must be stylistically consistent with existing types. Same JSDoc format, same naming patterns.
  - `discover.ts:532-586`: The `SnapshotNode` type must be a superset of the current node shape so the transition is non-breaking.

  **Acceptance Criteria**:
  - [ ] Type file created: `ogre-desktop/src/lib/dom-snapshot-types.ts`
  - [ ] Test file created: `ogre-desktop/src/lib/dom-snapshot-types.test.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/dom-snapshot-types.test.ts` → all tests pass
  - [ ] `cd ogre-desktop && npx tsc --noEmit` → zero errors

  **QA Scenarios:**

  ```
  Scenario: Type definitions compile without errors
    Tool: Bash
    Preconditions: dom-snapshot-types.ts exists
    Steps:
      1. Run: cd ogre-desktop && npx tsc --noEmit
      2. Check exit code is 0
    Expected Result: Zero type errors
    Failure Indicators: Non-zero exit code or type errors in output
    Evidence: .sisyphus/evidence/task-4-typecheck.txt

  Scenario: Priority classification correctly categorizes elements
    Tool: Bash
    Preconditions: dom-snapshot-types.test.ts exists
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/dom-snapshot-types.test.ts --reporter=verbose
      2. Verify all tests pass
      3. Check that tests cover: input → critical, div-with-role → high, table → medium, empty-div → noise
    Expected Result: All classification tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-4-classification-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): define DOM snapshot types and interfaces`
  - Files: `ogre-desktop/src/lib/dom-snapshot-types.ts`, `ogre-desktop/src/lib/dom-snapshot-types.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/dom-snapshot-types.test.ts`


### Wave 2 — Core Features (MAX PARALLEL)

- [ ] 5. Smart DOM Cleanup Engine

  **What to do**:
  - RED: Write `ogre-desktop/src/lib/dom-snapshot.test.ts` with tests for a `smartWalk(document, options)` function that:
    - Collapses meaningless wrapper chains: `div > div > div > p` → `p` (wrappers with no attrs, no text, single child get collapsed)
    - Prioritizes form/interactive elements: `input`, `textarea`, `select`, `button`, `[contenteditable]` are ALWAYS captured regardless of budget
    - Deduplicates visually identical siblings: 30 identical `<tr>` rows → capture first 3 + metadata `{repeated: 30}`
    - Respects node budget with priority-based eviction: when over budget, drop `noise` nodes first, then `low`, then `medium`
    - Filters invisible elements: skip elements with `display:none` or `visibility:hidden` (using `offsetWidth/offsetHeight === 0` heuristic, NOT computed styles)
    - Uses the `SnapshotNode`, `SnapshotOptions`, `SnapshotResult` types from Task 4
  - GREEN: Create `ogre-desktop/src/lib/dom-snapshot.ts` implementing `smartWalk()` as pure browser JavaScript generated from TypeScript
    - The module exports two things: (1) `buildSmartWalkScript(options)` → a string of browser JS for injection via CDP, (2) `smartWalk()` as a testable function
    - The browser JS script must be self-contained: no imports, no require, no TypeScript syntax
    - Use `getComputedStyle` sparingly (expensive) — prefer `offsetWidth === 0` for visibility checks
  - REFACTOR: Optimize the walker for common cases (short-circuit on well-structured pages)

  **Must NOT do**:
  - Don't touch `discover.ts` yet — integration happens in Task 10
  - Don't build LMS-specific logic — structural patterns only
  - Don't use `npm` dependencies in the generated browser script
  - Don't try to handle Shadow DOM in this task (document as known limitation)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex algorithm design with TDD cycle, DOM tree manipulation, priority scoring
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Tasks 9, 10 (interface evolution and integration depend on this)
  - **Blocked By**: Tasks 3 (fixtures), 4 (types)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:532-586` — Current `DOM_SNAPSHOT_SCRIPT`. This is what the new walker REPLACES. Study its node shape, attribute capture, and traversal order to ensure backward compatibility.
  - `ogre-desktop/src/lib/dom-snapshot-types.ts` — (from Task 4) Types that this module implements. Import `SnapshotNode`, `SnapshotOptions`, `SnapshotResult`, `classifyNodePriority`.

  **Test References**:
  - `ogre-desktop/src/lib/__fixtures__/dom-snapshots/messy-wrappers.html` — (from Task 3) Fixture for testing wrapper collapsing
  - `ogre-desktop/src/lib/__fixtures__/dom-snapshots/large-page.html` — (from Task 3) Fixture for testing budget enforcement on 2000+ node pages
  - `ogre-desktop/src/lib/__fixtures__/dom-snapshots/hidden-content.html` — (from Task 3) Fixture for visibility filtering

  **External References**:
  - Crawl4AI's content extraction approach: collapse meaningless wrappers, prioritize semantic content — study their algorithm for inspiration

  **WHY Each Reference Matters**:
  - `discover.ts:532-586`: The new walker must produce output that is a SUPERSET of the current shape (backward compatible). Study the 13 captured attributes to ensure they’re all still captured.
  - Fixtures: Each fixture tests a specific cleanup scenario. The test file should have at least one test per fixture.

  **Acceptance Criteria**:
  - [ ] Test file: `ogre-desktop/src/lib/dom-snapshot.test.ts` with ≥12 tests
  - [ ] Module file: `ogre-desktop/src/lib/dom-snapshot.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/dom-snapshot.test.ts` → all tests pass
  - [ ] Generated browser script contains zero `import`/`require` statements
  - [ ] Wrapper collapsing: `messy-wrappers.html` fixture produces ≤60% nodes vs. naive walk
  - [ ] Priority enforcement: `input` elements are NEVER evicted from budget
  - [ ] Large page: `large-page.html` fixture (2000+ nodes) completes within 500-node budget without crash

  **QA Scenarios:**

  ```
  Scenario: Smart walker collapses meaningless wrappers
    Tool: Bash
    Preconditions: dom-snapshot.test.ts exists with wrapper collapse tests
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/dom-snapshot.test.ts --reporter=verbose
      2. Find test named "collapses meaningless wrapper chains"
      3. Verify it passes
    Expected Result: Test passes, wrapper div chains are collapsed
    Failure Indicators: Test fails or wrapper count exceeds threshold
    Evidence: .sisyphus/evidence/task-5-wrapper-collapse.txt

  Scenario: Form elements are never evicted from budget
    Tool: Bash
    Preconditions: Tests exist for priority-based eviction
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/dom-snapshot.test.ts --reporter=verbose
      2. Find test named "critical elements are never evicted"
      3. Verify that input/textarea/select elements survive budget trimming
    Expected Result: All form elements present in output even at tight budget
    Failure Indicators: Any input/textarea/select missing from output
    Evidence: .sisyphus/evidence/task-5-priority-eviction.txt

  Scenario: Generated browser script is self-contained
    Tool: Bash (grep)
    Preconditions: dom-snapshot.ts exports buildSmartWalkScript()
    Steps:
      1. Import buildSmartWalkScript and call it with default options
      2. Grep the output string for 'import ' and 'require('
      3. Verify zero matches
    Expected Result: No import/require in generated script
    Failure Indicators: Any import or require found
    Evidence: .sisyphus/evidence/task-5-self-contained.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): implement smart DOM cleanup engine with TDD`
  - Files: `ogre-desktop/src/lib/dom-snapshot.ts`, `ogre-desktop/src/lib/dom-snapshot.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/dom-snapshot.test.ts`

- [ ] 6. Bounding Box Spatial Data

  **What to do**:
  - RED: Add tests to `ogre-desktop/src/lib/dom-snapshot.test.ts` (or new file `dom-snapshot-bbox.test.ts`) for bounding box capture:
    - When `options.captureBbox` is true, each node includes `bbox: { x, y, w, h }` from `getBoundingClientRect()`
    - Bbox values are rounded to integers (no sub-pixel precision — saves chars in JSON)
    - Nodes with `bbox.w === 0 && bbox.h === 0` are flagged as `visible: false`
    - Budget impact: Calculate that bbox adds ~30 chars per node. At 500 nodes = ~15K extra chars. Recommend bbox data be EXCLUDED from the AI prompt by default but available for visual correlation
  - GREEN: Add bbox capture to the `smartWalk` browser script when `captureBbox: true`
  - Note: jsdom doesn't support `getBoundingClientRect` (returns all zeros). Tests must MOCK this. Use a test helper that patches `Element.prototype.getBoundingClientRect`.

  **Must NOT do**:
  - Don't add bbox data to the AI prompt by default (violates prompt budget)
  - Don't build a visual annotation system
  - Don't attempt screenshot-to-DOM alignment (that’s a separate problem)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful jsdom mocking strategy and budget analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 3 (fixtures), 4 (types)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/dom-snapshot-types.ts` — (from Task 4) `SnapshotNode.bbox` optional field. `SnapshotOptions.captureBbox` flag.
  - `ogre-desktop/src/lib/dom-snapshot.ts` — (from Task 5) The walker to extend with bbox capture.

  **External References**:
  - MDN: `Element.getBoundingClientRect()` — returns `DOMRect { x, y, width, height, top, right, bottom, left }`

  **WHY Each Reference Matters**:
  - `dom-snapshot-types.ts`: The bbox field shape must match the type definition.
  - `dom-snapshot.ts`: Bbox capture is an EXTENSION of the smart walker, not a separate walker.

  **Acceptance Criteria**:
  - [ ] Bbox tests added (at least 4 tests)
  - [ ] `cd ogre-desktop && npx vitest run src/lib/dom-snapshot*.test.ts` → all tests pass
  - [ ] Bbox values are integers (no decimals)
  - [ ] Zero-size elements are flagged `visible: false`

  **QA Scenarios:**

  ```
  Scenario: Bbox data captured when option enabled
    Tool: Bash
    Preconditions: Tests with bbox mocking exist
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/dom-snapshot*.test.ts --reporter=verbose
      2. Find tests matching "bbox" or "bounding"
      3. Verify all pass
    Expected Result: Bbox tests pass with mocked getBoundingClientRect
    Failure Indicators: Tests fail or bbox fields missing
    Evidence: .sisyphus/evidence/task-6-bbox-tests.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(discover): add bounding-box spatial data to DOM snapshots`
  - Files: `ogre-desktop/src/lib/dom-snapshot.ts`, `ogre-desktop/src/lib/dom-snapshot*.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/dom-snapshot*.test.ts`

- [ ] 7. Heuristic Structural Detector

  **What to do**:
  - RED: Write `ogre-desktop/src/lib/heuristic-detector.test.ts` with tests for a `detectGradingStructure(snapshot)` function that:
    - Takes a `SnapshotResult` and returns `HeuristicDetection | null`
    - `HeuristicDetection` contains: `{ mode: 'batch'|'sequential', candidateSelectors: SelectorMap, confidence: number, patternName: string }`
    - Detects structural patterns WITHOUT AI:
      - **Repeating rows with inputs**: 3+ sibling elements of same tag, each containing `<input>` elements → batch mode, studentSection = repeating element selector
      - **Name + score proximity**: Elements with person-name-like text near `<input type="text|number">` fields → studentName + scoreInput candidates
      - **Rich editor detection**: `[contenteditable]`, `iframe` with TinyMCE-like attributes, `textarea` near score inputs → feedbackBox candidate
      - **Navigation buttons**: next/prev buttons (text matching `next`, `previous`, `▶`, `◄`, arrows) → sequential mode
      - **Save button**: Button/input with text matching `save`, `submit`, `quick save`, `record` → save.buttonText candidate
    - Returns `null` when no recognizable pattern is found (triggers AI fallback)
  - GREEN: Implement `ogre-desktop/src/lib/heuristic-detector.ts`
    - Pure function operating on `SnapshotResult` (NOT on live DOM)
    - Confidence score 0-1 based on how many patterns matched
    - Pattern matching uses structural rules only (no LMS-specific selectors)
  - CRITICAL: When heuristic detection produces a result, it MUST be validated using the existing `buildValidationScript` from `discover.ts`. If any required selector has `matchCount === 0`, the heuristic is discarded and AI discovery runs instead. This fallback logic will be wired in Task 10.

  **Must NOT do**:
  - Don't write LMS-specific patterns (no "if URL contains myopenmath")
  - Don't integrate with discover.ts yet (Task 10 handles that)
  - Don't replace the AI path — heuristics are an OPTIMIZATION, AI is the fallback

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex pattern matching algorithm design with TDD, structural analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: Tasks 9, 11 (interface evolution and UI)
  - **Blocked By**: Tasks 3 (fixtures), 4 (types)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/dom-snapshot-types.ts` — (from Task 4) `SnapshotResult` type that the detector consumes.
  - `ogre-desktop/src/lib/discover.ts:746-799` — `buildValidationScript()` that validates selectors on the live page. The heuristic detector's output must produce selectors compatible with this validation.
  - `ogre-desktop/src/lib/discover.ts:74-81` — `DiscoveryResult` shape. Heuristic output must be convertible to this shape.

  **Test References**:
  - `ogre-desktop/src/lib/__fixtures__/dom-snapshots/simple-batch.html` — Should be detected as batch grading
  - `ogre-desktop/src/lib/__fixtures__/dom-snapshots/sequential-grading.html` — Should be detected as sequential
  - `ogre-desktop/src/lib/__fixtures__/dom-snapshots/messy-wrappers.html` — Should still detect grading structure despite wrapper noise

  **WHY Each Reference Matters**:
  - `dom-snapshot-types.ts`: The heuristic detector's input type. Must consume this exact shape.
  - `discover.ts:746-799`: The validation function that will verify heuristic output. Selectors must be valid CSS for `querySelector`.
  - Fixtures: Each fixture tests a detection scenario.

  **Acceptance Criteria**:
  - [ ] Test file: `ogre-desktop/src/lib/heuristic-detector.test.ts` with ≥8 tests
  - [ ] Module file: `ogre-desktop/src/lib/heuristic-detector.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts` → all tests pass
  - [ ] `simple-batch.html` fixture detected as batch mode
  - [ ] `sequential-grading.html` fixture detected as sequential mode
  - [ ] Returns `null` for unrecognizable page structures (not a false positive)

  **QA Scenarios:**

  ```
  Scenario: Heuristic correctly detects batch grading structure
    Tool: Bash
    Preconditions: Tests exist with simple-batch fixture
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts --reporter=verbose
      2. Find test matching "batch" or "repeating rows"
      3. Verify it passes and returns mode: 'batch'
    Expected Result: Batch grading detected correctly
    Evidence: .sisyphus/evidence/task-7-batch-detection.txt

  Scenario: Heuristic returns null for unrecognizable pages
    Tool: Bash
    Preconditions: Tests exist with random/non-grading HTML fixture
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts --reporter=verbose
      2. Find test matching "null" or "no pattern"
      3. Verify it passes and returns null
    Expected Result: No false positive detection
    Evidence: .sisyphus/evidence/task-7-no-false-positive.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): implement heuristic structural detector with AI fallback`
  - Files: `ogre-desktop/src/lib/heuristic-detector.ts`, `ogre-desktop/src/lib/heuristic-detector.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts`

- [ ] 8. Iframe DOM Capture Module

  **What to do**:
  - **GATE**: Read the spike report from Task 1 (`iframe-capture-spike.md`). If the verdict is "DOES NOT WORK", descope this task to a simpler approach: detect iframes in the DOM and add metadata to the snapshot (`iframeSource: url, crossOrigin: true/false`) WITHOUT capturing their internal DOM. If "WORKS", proceed with full CDP-based capture.
  - RED: Write `ogre-desktop/src/lib/iframe-capture.test.ts` with tests for:
    - `captureIframeSnapshot(frameId, options)` → `SnapshotNode[]` (same node shape as main frame)
    - Detection of same-origin vs cross-origin iframes
    - Cross-origin iframes produce metadata-only entries: `{ tag: 'iframe', attrs: {src: url}, iframeSource: url, crossOrigin: true }`
    - Same-origin iframes produce full subtree capture merged into main snapshot
  - GREEN: Implement `ogre-desktop/src/lib/iframe-capture.ts`
    - Uses CDP `Runtime.evaluate` with `contextId` for same-origin frames (pattern from spike)
    - For cross-origin iframes: DO NOT attempt DOM access, just record metadata
    - Exports `buildIframeCaptureScript(options)` for injection and `detectIframes(snapshot)` as pure function

  **Must NOT do**:
  - Don't attempt cross-origin iframe DOM access (browser security constraint)
  - Don't modify the existing `evalScript` function in `browser.ts`
  - Don't handle nested iframes (iframe within iframe) — only top-level iframes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CDP integration, conditional scope based on spike, security constraints
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 1 (spike), 3 (fixtures), 4 (types)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/iframe-capture-spike.md` — (from Task 1) Spike report with CDP iframe context findings. READ THIS FIRST to determine full or metadata-only implementation.
  - `ogre-desktop/src/lib/browser.ts:161-189` — Current CDP `Runtime.evaluate` call. Use the same pattern but with `contextId` parameter.
  - `ogre-desktop/src/lib/dom-snapshot-types.ts` — (from Task 4) `SnapshotNode.iframeSource` field for iframe metadata.

  **WHY Each Reference Matters**:
  - `iframe-capture-spike.md`: Gates the entire implementation approach. Must be read before writing any code.
  - `browser.ts:161-189`: The CDP call pattern to follow or extend.

  **Acceptance Criteria**:
  - [ ] Spike report read and approach determined (full CDP or metadata-only)
  - [ ] Test file: `ogre-desktop/src/lib/iframe-capture.test.ts`
  - [ ] Module file: `ogre-desktop/src/lib/iframe-capture.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/iframe-capture.test.ts` → all tests pass
  - [ ] Cross-origin iframes produce metadata entries (no DOM access attempted)

  **QA Scenarios:**

  ```
  Scenario: Iframe detection works on fixture with iframes
    Tool: Bash
    Preconditions: iframe-capture.test.ts exists with iframe fixture tests
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/iframe-capture.test.ts --reporter=verbose
      2. Verify all tests pass
    Expected Result: All iframe capture tests pass
    Evidence: .sisyphus/evidence/task-8-iframe-tests.txt

  Scenario: Cross-origin iframes produce metadata only
    Tool: Bash
    Preconditions: Tests exist for cross-origin detection
    Steps:
      1. Find test matching "cross-origin" in iframe-capture.test.ts
      2. Verify it asserts metadata-only output (no child nodes)
    Expected Result: Cross-origin handling is safe (no DOM access)
    Evidence: .sisyphus/evidence/task-8-cross-origin.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): implement cross-frame DOM capture via CDP`
  - Files: `ogre-desktop/src/lib/iframe-capture.ts`, `ogre-desktop/src/lib/iframe-capture.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/iframe-capture.test.ts`

### Wave 3 — Integration

- [ ] 9. DiscoveryResult Interface Evolution + Migration

  **What to do**:
  - Extend the `DiscoveryResult` interface in `discover.ts` with new OPTIONAL fields:
    - `heuristicMatch?: { patternName: string, confidence: number }` — populated when heuristic detection was used instead of AI
    - `snapshotMetadata?: SnapshotMetadata` — stats from the smart walker (total nodes, captured, dropped, iframes)
  - Extend the `SelectorMap` interface with:
    - `iframeContext?: string` — if a selector targets content inside an iframe, record which iframe
  - Update `isValidDiscoveryResult()` to accept the new fields WITHOUT requiring them (backward compatible)
  - Update `SiteProfile` type in `batch-grader.ts` to accept the extended fields
  - Write migration logic: existing saved SiteProfiles (in localStorage/disk) must load without error even though they lack new fields
  - Add regression tests: existing test fixtures for `parseDiscoveryResponse` and `isValidDiscoveryResult` must still pass

  **Must NOT do**:
  - Don't break existing SiteProfile serialization/deserialization
  - Don't make any new field required (all additions are optional)
  - Don't change the AI prompt structure yet (Task 10 handles that)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Interface evolution with backward compatibility constraints requires careful analysis of all consumers
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — needs all Wave 2 outputs
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:19-108` — Current interfaces to extend: `DiscoveryResult`, `SelectorMap`, `NavigationConfig`, `FeedbackConfig`, `SaveConfig`
  - `ogre-desktop/src/lib/discover.ts:471-508` — `isValidDiscoveryResult()` validator. MUST remain backward compatible.
  - `ogre-desktop/src/lib/batch-grader.ts:114-131` — `SiteProfile` type. Must accept extended fields.
  - `ogre-desktop/src/lib/site-profiles.ts` — `ProfileStorageImpl` class. Must load old profiles without error.

  **WHY Each Reference Matters**:
  - `discover.ts:19-108`: The interfaces being extended. Every new field must be optional (`?`) to preserve compatibility.
  - `discover.ts:471-508`: If this validator rejects old data, existing saved profiles break. Critical regression test target.
  - `batch-grader.ts:114-131` and `site-profiles.ts`: Downstream consumers that must handle both old and new profile shapes.

  **Acceptance Criteria**:
  - [ ] Extended interfaces compile: `cd ogre-desktop && npx tsc --noEmit` → 0 errors
  - [ ] Existing `isValidDiscoveryResult` tests still pass
  - [ ] Old SiteProfile format loads without error (regression test)
  - [ ] New optional fields can be set and read without error

  **QA Scenarios:**

  ```
  Scenario: Old SiteProfile format still loads
    Tool: Bash
    Preconditions: Regression test exists for old profile format
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/discover.test.ts --reporter=verbose
      2. Find test matching "backward" or "migration" or "old format"
      3. Verify it passes
    Expected Result: Old profiles load without error
    Evidence: .sisyphus/evidence/task-9-backward-compat.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): evolve DiscoveryResult interface with backward compatibility`
  - Files: `ogre-desktop/src/lib/discover.ts`, `ogre-desktop/src/lib/batch-grader.ts`, `ogre-desktop/src/lib/discover.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/discover.test.ts`

- [ ] 10. discover.ts Integration — New Snapshot Pipeline

  **What to do**:
  - Replace `DOM_SNAPSHOT_SCRIPT` usage with `buildSmartWalkScript()` from `dom-snapshot.ts`
  - Replace `captureDomSnapshot()` function to use the new smart walker
  - Implement the adaptive prompt truncation strategy from Task 2's spec:
    - Priority-based truncation: when JSON exceeds budget, remove `noise` nodes first, then `low`, then `medium`
    - Keep the budget configurable (default 12K, but accept parameter)
  - Wire the heuristic detection path:
    1. Run `smartWalk()` to capture enhanced snapshot
    2. Run `detectGradingStructure(snapshot)` from `heuristic-detector.ts`
    3. If heuristic returns a result → validate selectors via existing `buildValidationScript`
    4. If all required selectors validate (matchCount > 0) → use heuristic result, skip AI call
    5. If validation fails OR heuristic returned null → proceed with AI discovery as before
  - Wire iframe capture: call `captureIframeSnapshot` for detected same-origin iframes, merge nodes into main snapshot
  - Update `runDiscovery()` to report whether heuristic or AI was used in progress events
  - Ensure the `DISCOVERY_SYSTEM_PROMPT` and `DISCOVERY_USER_PROMPT_TEMPLATE` work with the enhanced snapshot format

  **Must NOT do**:
  - Don't change the `/api/chat` server endpoint
  - Don't remove the AI discovery path — heuristics are an optimization, AI is always the fallback
  - Don't break the existing DiscoveryPanel.svelte contract (same events, same result shape)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex integration touching multiple modules, conditional logic, backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 11 partially)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 11, 12, 13
  - **Blocked By**: Tasks 2, 5, 6, 8, 9

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts` — ENTIRE FILE is the integration target. Key functions: `captureDomSnapshot()` (replace), `runDiscovery()` (extend), `DISCOVERY_USER_PROMPT_TEMPLATE` (update truncation)
  - `ogre-desktop/src/lib/dom-snapshot.ts` — (from Task 5) `buildSmartWalkScript()` to replace `DOM_SNAPSHOT_SCRIPT`
  - `ogre-desktop/src/lib/heuristic-detector.ts` — (from Task 7) `detectGradingStructure()` to wire into discovery pipeline
  - `ogre-desktop/src/lib/iframe-capture.ts` — (from Task 8) `captureIframeSnapshot()` to merge iframe content
  - `ogre-desktop/src/lib/prompt-budget-spec.md` — (from Task 2) Adaptive truncation algorithm to implement

  **WHY Each Reference Matters**:
  - `discover.ts`: The orchestration layer. ALL new modules are wired here. Read the full `runDiscovery()` function before modifying.
  - Each new module provides a specific capability that plugs into the discovery pipeline.

  **Acceptance Criteria**:
  - [ ] `DOM_SNAPSHOT_SCRIPT` constant is no longer used (replaced by `buildSmartWalkScript()`)
  - [ ] `runDiscovery()` attempts heuristic detection before AI call
  - [ ] If heuristic succeeds + validates → AI call is skipped (verify via progress events)
  - [ ] If heuristic fails → AI call proceeds as before
  - [ ] All existing `discover.test.ts` tests still pass (regression)
  - [ ] `cd ogre-desktop && npx tsc --noEmit` → zero errors

  **QA Scenarios:**

  ```
  Scenario: Heuristic path skips AI when selectors validate
    Tool: Bash
    Preconditions: Integration tests exist
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/discover.test.ts --reporter=verbose
      2. Find test matching "heuristic" and "skip AI"
      3. Verify it passes
    Expected Result: AI call is skipped when heuristic produces valid selectors
    Evidence: .sisyphus/evidence/task-10-heuristic-path.txt

  Scenario: AI fallback when heuristic fails
    Tool: Bash
    Preconditions: Tests exist for heuristic fallback
    Steps:
      1. Find test matching "fallback" or "AI when heuristic fails"
      2. Verify AI discovery runs when heuristic returns null
    Expected Result: AI path used as fallback
    Evidence: .sisyphus/evidence/task-10-ai-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): integrate new snapshot pipeline into discover.ts`
  - Files: `ogre-desktop/src/lib/discover.ts`, `ogre-desktop/src/lib/discover.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/discover.test.ts`

- [ ] 11. DiscoveryPanel.svelte UI Updates

  **What to do**:
  - Add visual indicator when heuristic detection was used (show "Detected automatically" vs "Analyzed by AI")
  - Show `snapshotMetadata` stats in the UI: total nodes, captured, dropped, iframe count
  - Add iframe indicators: show which selectors target iframe content, display cross-origin iframe warnings
  - If heuristic detection produced a result, show confidence score and pattern name
  - Add a "Force AI Analysis" button that bypasses heuristic detection and runs full AI discovery
  - Update progress messages to reflect the new pipeline stages (heuristic attempt → AI fallback if needed)

  **Must NOT do**:
  - Don't redesign the entire DiscoveryPanel layout
  - Don't add new tabs or navigation — these are additions to the existing Discover tab
  - Don't change the save/profile workflow

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component updates with visual indicators, badges, and stats display
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 9 provides types)
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 7, 9, 10

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` — ENTIRE FILE is the update target. 956 lines. Study the existing phase state machine, progress display, and validation result rendering.
  - `ogre-desktop/src/lib/discover.ts` — (updated in Tasks 9, 10) New `DiscoveryResult` fields and progress events to consume.

  **WHY Each Reference Matters**:
  - `DiscoveryPanel.svelte`: Must understand the existing state machine before adding states. The component uses `phase` state with values `idle | running | review | confirming | saving | error`.

  **Acceptance Criteria**:
  - [ ] Heuristic/AI indicator visible in UI
  - [ ] Snapshot metadata displayed
  - [ ] "Force AI Analysis" button functional
  - [ ] `cd ogre-desktop && npx tsc --noEmit` → zero errors

  **QA Scenarios:**

  ```
  Scenario: UI shows heuristic vs AI indicator
    Tool: Bash (grep)
    Preconditions: DiscoveryPanel.svelte updated
    Steps:
      1. Search DiscoveryPanel.svelte for "heuristic" or "Detected automatically"
      2. Verify text exists in the component
    Expected Result: UI text for heuristic detection present
    Evidence: .sisyphus/evidence/task-11-ui-indicator.txt

  Scenario: Force AI button exists
    Tool: Bash (grep)
    Preconditions: DiscoveryPanel.svelte updated
    Steps:
      1. Search for "Force AI" in DiscoveryPanel.svelte
      2. Verify button element exists
    Expected Result: Force AI Analysis button present in component
    Evidence: .sisyphus/evidence/task-11-force-ai-button.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): update DiscoveryPanel UI for heuristics, iframes, spatial preview`
  - Files: `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`
  - Pre-commit: `cd ogre-desktop && npx tsc --noEmit`

### Wave 4 — Verification

- [ ] 12. Regression Test Suite

  **What to do**:
  - Add regression tests to `ogre-desktop/src/lib/discover.test.ts` that verify:
    - All existing `parseDiscoveryResponse` behavior is preserved (15+ existing test cases)
    - `isValidDiscoveryResult` accepts both old and new format data
    - The entire `runDiscovery` pipeline can be mocked and tested end-to-end
    - The AI response parsing still handles: code fences, think blocks, partial JSON, double fences, HTML entities
  - Ensure test count does not decrease from current baseline

  **Must NOT do**:
  - Don't test against live grading pages
  - Don't duplicate tests from Task 5/6/7/8 — focus on integration and regression only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive regression testing across multiple modules
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 13)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10

  **References**:
  - `ogre-desktop/src/lib/discover.test.ts` — Existing tests to verify and extend

  **Acceptance Criteria**:
  - [ ] `cd ogre-desktop && npx vitest run src/lib/discover.test.ts` → all tests pass
  - [ ] Test count ≥ current baseline
  - [ ] New regression tests cover backward compatibility scenarios

  **QA Scenarios:**

  ```
  Scenario: All existing parse tests still pass
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/discover.test.ts --reporter=verbose
      2. Count passing tests
      3. Verify count >= previous baseline
    Expected Result: No regression in existing tests
    Evidence: .sisyphus/evidence/task-12-regression.txt
  ```

  **Commit**: YES
  - Message: `test(discover): add regression test suite for existing functionality`
  - Files: `ogre-desktop/src/lib/discover.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/discover.test.ts`

- [ ] 13. End-to-End Discovery Workflow Test

  **What to do**:
  - Write an integration test that mocks the CDP layer and tests the full discovery pipeline:
    1. Mock `evalScript` to return a snapshot from a fixture
    2. Mock `captureWebviewScreenshot` to return a placeholder
    3. Mock `getEmbeddedUrl` to return a test URL
    4. Mock `/api/chat` response with a valid DiscoveryResult JSON
    5. Call `runDiscovery()` and verify it returns a valid `DiscoveryWorkflow`
  - Test both paths: heuristic success (AI skipped) and heuristic failure (AI called)
  - Verify progress events fire in correct order

  **Must NOT do**:
  - Don't use real browser or real AI calls
  - Don't require Tauri app to be running

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex mocking setup for end-to-end pipeline verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 12)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 10, 11

  **References**:
  - `ogre-desktop/src/lib/discover.ts` — `runDiscovery()` function to test end-to-end
  - `ogre-desktop/src/lib/browser.ts` — Functions to mock: `evalScript`, `captureWebviewScreenshot`, `getEmbeddedUrl`

  **Acceptance Criteria**:
  - [ ] Integration test file: `ogre-desktop/src/lib/discover.integration.test.ts`
  - [ ] Tests both heuristic and AI paths
  - [ ] `cd ogre-desktop && npx vitest run src/lib/discover.integration.test.ts` → all pass

  **QA Scenarios:**

  ```
  Scenario: Full pipeline test passes
    Tool: Bash
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/discover.integration.test.ts --reporter=verbose
      2. Verify all tests pass
    Expected Result: End-to-end pipeline works with mocked dependencies
    Evidence: .sisyphus/evidence/task-13-e2e.txt
  ```

  **Commit**: YES
  - Message: `test(discover): add end-to-end discovery workflow tests`
  - Files: `ogre-desktop/src/lib/discover.integration.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/discover.integration.test.ts`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify DOM walker script is pure browser JS with no imports/requires.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (smart cleanup feeding into discovery pipeline). Test edge cases: very large DOM, deeply nested wrappers, pages with iframes. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no npm deps in walker script, no LMS-specific heuristics, no cross-origin iframe access, no server endpoint changes. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `spike(discover): validate CDP iframe context targeting in WebView2`
- **T2**: `analysis(discover): document prompt budget constraints and adaptive truncation design`
- **T3**: `test(discover): add jsdom test infrastructure and HTML fixture library`
- **T4**: `feat(discover): define DOM snapshot types and interfaces`
- **T5**: `feat(discover): implement smart DOM cleanup engine with TDD`
- **T6**: `feat(discover): add bounding-box spatial data to DOM snapshots`
- **T7**: `feat(discover): implement heuristic structural detector with AI fallback`
- **T8**: `feat(discover): implement cross-frame DOM capture via CDP`
- **T9**: `feat(discover): evolve DiscoveryResult interface with backward compatibility`
- **T10**: `feat(discover): integrate new snapshot pipeline into discover.ts`
- **T11**: `feat(discover): update DiscoveryPanel UI for heuristics, iframes, spatial preview`
- **T12**: `test(discover): add regression test suite for existing functionality`
- **T13**: `test(discover): add end-to-end discovery workflow tests`

---

## Success Criteria

### Verification Commands
```bash
# All new tests pass
cd ogre-desktop && npx vitest run src/lib/dom-snapshot*.test.ts  # Expected: all pass
cd ogre-desktop && npx vitest run src/lib/heuristic-detector*.test.ts  # Expected: all pass
cd ogre-desktop && npx vitest run src/lib/iframe-capture*.test.ts  # Expected: all pass (if spike passes)
cd ogre-desktop && npx vitest run src/lib/discover.test.ts  # Expected: all pass (existing + new)

# No type regressions
cd ogre-desktop && npx tsc --noEmit  # Expected: 0 errors

# All existing tests still pass
cd ogre-desktop && npx vitest run  # Expected: ≥ current pass count
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Existing SiteProfiles load without error
- [ ] DOM walker script contains zero import/require statements
- [ ] Heuristic detection falls back to AI when validation fails
