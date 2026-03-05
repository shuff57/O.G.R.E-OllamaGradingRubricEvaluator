# Smart Discovery: Complete Engine + Skill Upgrade

## TL;DR

> **Quick Summary**: Comprehensive overhaul of O.G.R.E's discovery system — from the low-level DOM capture engine through the AI pipeline to the user experience. Replaces the naive 500-node walker with an intelligent snapshot engine (smart cleanup, iframes, bounding boxes, heuristics), adds deep profile testing with extraction simulation, three user interaction modes (form/chat/example-based), profile lifecycle management, ExtractionConfig auto-detection, agent actions, and HTTP profile API for the /grade skill.
> 
> **Deliverables**:
> - Smart DOM snapshot engine: wrapper collapsing, priority scoring, visibility filtering, bounding boxes
> - Cross-frame DOM capture for same-origin iframes via CDP
> - Heuristic structural detection with automatic AI fallback
> - Prompt budget co-optimization (12K-char constraint reworked)
> - Profile testing engine that simulates real student extraction
> - ExtractionConfig auto-discovery via separate AI call
> - Three discovery interaction modes (guided form, chat-based, example-based teaching)
> - Profile editor with merge-on-rediscover and per-selector picker refinement
> - Agent actions (discover_page, test_profile, save_profile) for desktop AgentChat
> - Desktop→server profile bridge + read-only HTTP endpoints for /grade skill
> - Refactored DiscoveryPanel with sub-components for maintainability
> - Comprehensive TDD test suite with fixture HTML fragments
> 
> **Estimated Effort**: XL (29 implementation tasks + 4 verification)
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: T1 (spike) → T11 (iframe) → T12 (interfaces + mappers) → T20 (discover.ts integration) → T24 (DiscoveryPanel UI) → F1-F4

---

## Context

### Original Request
User wanted to enhance how the Discover tab analyzes grading pages. After evaluating PinchTab (browser transport, rejected) and DOM scraping tools (Stagehand, Crawl4AI, AgentQL, Harvester), the focus became: upgrade the existing DOM capture pipeline to handle messy sites reliably AND transform discovery into a comprehensive "Smart Discovery Skill" with testing, multiple interaction modes, and programmatic access.

### Interview Summary
**Key Discussions**:
- PinchTab evaluated and rejected — browser transport, not DOM intelligence
- External tools evaluated: Stagehand, Crawl4AI, AgentQL, Harvester — none are direct replacements
- The existing Discover tab is already sophisticated (956-line UI, AI pipeline, element picker, site profiles)
- Bottleneck: `DOM_SNAPSHOT_SCRIPT` — 500 nodes/depth 8, fills with noise on messy sites
- Testing depth: BOTH enhanced validation AND full extraction simulation
- Profile updates: BOTH re-discover-with-merge AND per-selector refinement
- Interaction modes: ALL THREE (chat, guided form, example-based)
- Agent support: BOTH desktop AgentChat AND external /grade skill
- ExtractionConfig: In scope — AI should discover extraction methods
- Platform target: Generic (any grading platform), not LMS-specific
- Dependencies: Whatever works best
- Tests: TDD with vitest

**Research Findings**:
- `discover.ts` has full AI pipeline: DOM snapshot + screenshot → AI → DiscoveryResult → validation → picker refinement
- `DOM_SNAPSHOT_SCRIPT` runs inside Tauri webview via CDP `Runtime.evaluate` — must be plain browser JavaScript
- Prompt template truncates DOM snapshot JSON to **12,000 characters** (discover.ts line 309) — hard constraint
- CDP is the execution engine, enabling iframe context targeting via `executionContextId` (untested in WebView2)
- `ExtractionConfig` type exists in `site-profiles.ts` but discovery never generates it
- DB `site_profiles` table has NO extraction column — needs migration
- `DiscoveryPanel.svelte` is 956 lines — must refactor before adding features
- Type mismatch: `discover.ts` SelectorMap vs `batch-grader.ts` SiteSelectors (structurally similar, not unified)
- Agent system: closed `AgentAction` union — adding actions requires changes across 4+ files
- Test infrastructure: 31 test files, vitest, 2480+ assertions — strong TDD support

### Metis Review (from both planning sessions)
**Identified Gaps** (all addressed):
- 12K-char prompt truncation must co-design with walker (Tasks 2, 6)
- CDP iframe context validation needed as spike gate (Task 1)
- DiscoveryResult backward compatibility for saved SiteProfiles (Task 12)
- Heuristic false-positive strategy with validation + AI fallback (Task 8)
- Test environment for DOM walker needs jsdom per-file override (Task 3)
- DB migration needed for extraction column (Task 4)
- Type mappers needed to replace inline casts (Task 12)
- DiscoveryPanel must be refactored before feature additions (Task 13)
- ExtractionConfig must use separate AI call (Task 15)
- /grade skill cannot import TypeScript — needs HTTP endpoints (Task 21)
- Chat mode must be discovery-scoped, not general assistant (guardrail)
- Agent actions must follow existing discriminated union pattern (guardrail)

---

## Work Objectives

### Core Objective
Transform the Discover tab from a one-shot AI selector finder into a comprehensive "Smart Discovery Skill" — starting with a rebuilt DOM capture engine that handles any grading platform reliably, then adding deep testing, multi-mode interaction, profile lifecycle management, and programmatic agent access.

### Concrete Deliverables
- `src/lib/dom-snapshot-types.ts` — Enhanced snapshot types with priority scoring
- `src/lib/dom-snapshot.ts` + `.test.ts` — Smart DOM walker with cleanup, scoring, spatial data
- `src/lib/heuristic-detector.ts` + `.test.ts` — Pattern-based grading page detection
- `src/lib/iframe-capture.ts` + `.test.ts` — Cross-frame DOM capture via CDP
- `src/lib/prompt-budget-spec.md` — Prompt budget analysis and adaptive truncation design
- `src/lib/iframe-capture-spike.md` — CDP spike report for WebView2 iframe targeting
- `src/lib/type-mappers.ts` + `.test.ts` — DiscoveryResult ↔ SiteProfile converters
- `src/lib/profile-tester.ts` + `.test.ts` — Deep DOM testing with extraction simulation
- `src/lib/extraction-config-discovery.ts` + `.test.ts` — Separate AI call for ExtractionConfig
- `src/lib/discovery-intent.ts` + `.test.ts` — Three interaction modes (form/chat/example)
- `src/lib/profile-editor.ts` + `.test.ts` — Profile merge + per-selector update operations
- `src/lib/agent-discovery-actions.test.ts` — Agent action tests
- `src/lib/grading-server-profiles.test.ts` — Server endpoint tests
- 4 sub-components: `DiscoveryProgress.svelte`, `DiscoveryResults.svelte`, `DiscoveryConfirmation.svelte`, `DiscoverySaveDialog.svelte`
- 3 mode components: `DiscoveryFormMode.svelte`, `DiscoveryChatMode.svelte`, `DiscoveryExampleMode.svelte`
- `ExtractionConfigPanel.svelte` — Config display + override controls
- Updated `discover.ts` — New snapshot pipeline + heuristic path + extraction config
- Updated `DiscoveryPanel.svelte` — Refactored orchestrator with mode selector, test results, config display
- Updated `ProfileManager.svelte` — Re-discover, per-selector edit, test button
- Updated `agent-types.ts` + `browser-actions.ts` + `agent-prompt.ts` — 3 new agent actions
- Updated `server.ts` — 3 new HTTP profile endpoints
- Updated `src-tauri/src/lib.rs` — Migration v11 for extraction column
- 8 HTML test fixture files in `tests/fixtures/`
- `discover.integration.test.ts` — End-to-end pipeline test

### Definition of Done
- [ ] `npx vitest run` — all existing + new tests pass
- [ ] `npx tsc --noEmit` — zero type errors
- [ ] Profile created via discovery includes ExtractionConfig
- [ ] Profile tester extracts real student data from test fixture HTML
- [ ] All three interaction modes produce valid DiscoveryResult
- [ ] Heuristic detection works for recognizable page structures
- [ ] Agent can execute discover_page action on unknown pages
- [ ] /grade skill can fetch profiles via HTTP endpoints
- [ ] Existing profiles load without errors after DB migration (extraction: null)
- [ ] Existing SiteProfile data loads without errors (backward compatibility)

### Must Have
- Smart DOM walker that collapses meaningless wrappers and prioritizes form/interactive elements
- Prompt budget co-optimization (walker and 12K-char cap designed together)
- Heuristic detection with automatic validation + AI fallback on failure
- Bounding box spatial data per DOM node
- Same-origin iframe DOM capture (gated on spike)
- Deep DOM testing that simulates real extraction (not just match counts)
- All three user interaction modes
- ExtractionConfig auto-discovery
- Profile editing with re-discovery and per-selector refinement
- Agent actions for desktop AgentChat
- HTTP profile endpoints for /grade skill
- TDD for all new lib modules
- DB migration backward compatibility
- Backward-compatible DiscoveryResult interface

### Must NOT Have (Guardrails)
- **No npm dependencies in injected DOM walker script** — must remain plain browser JS via CDP
- **No LMS-specific heuristics** — detect STRUCTURAL patterns only
- **No cross-origin iframe DOM access** — browser security blocks it
- **No changes to `/api/chat` server endpoint contract** — snapshot improvement is client-side only
- **No "visual grounding" system** — bbox data is added to DOM nodes, no screenshot annotation
- **No infinite DOM cleanup yak-shaving** — collapse wrappers, prioritize forms, deduplicate siblings. Stop.
- **No acceptance criteria requiring Tauri app or live grading pages** — all tests use fixtures
- **No unmeasurable criteria** like "AI produces better results"
- **General-purpose chat UI** — chat mode is discovery-scoped ONLY
- **ML training or pattern learning** for example mode — just CSS selector generalization
- **Conversation persistence/history** for chat mode
- **Version history or diff UI** for profile editing
- **Full REST CRUD API** — read-only endpoints only for /grade skill
- **`as any` casts** — explicit type mappers instead
- **Pushing DiscoveryPanel.svelte past ~600 lines** in the orchestrator
- **Refactoring batch-grader.ts types** (too many consumers)
- **New panels or tabs** — enhance existing DiscoveryPanel and ProfileManager only
- **Agent actions that bypass the action approval flow** (review mode)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, 31 test files, 2480+ assertions)
- **Automated tests**: TDD (RED → GREEN → REFACTOR for each feature)
- **Framework**: vitest with `@vitest-environment jsdom` per-file annotation for DOM walker tests
- **Each task**: Write failing test first, then implement, then refactor

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (`npx vitest run`) — run test suites, compare output
- **Types**: Use Bash (`npx tsc --noEmit`) — verify type safety
- **UI components**: Use Playwright (playwright skill) — interact with desktop app UI
- **Server endpoints**: Use Bash (curl) — send requests, assert status + response fields
- **Agent actions**: Use vitest mocks — mock evalScript, verify action dispatch
- **Integration**: Use Bash to run discovery workflow tests against fixture HTML

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — spikes + foundation, 9 tasks):
├── Task 1: CDP iframe context spike [quick]
├── Task 2: Prompt budget analysis + adaptive truncation design [quick]
├── Task 3: Test infrastructure — jsdom setup + unified HTML fixtures [quick]
├── Task 4: DB migration for extraction column [quick]
├── Task 5: DOM snapshot types/interfaces + priority classification [quick]
├── Task 6: Discovery intent types + interfaces [quick]
├── Task 7: Profile tester module skeleton + types [quick]
├── Task 13: DiscoveryPanel refactor into sub-components [unspecified-high]
└── Task 27: Extraction config prompt + parser skeleton [quick]


Wave 2 (After Wave 1 — core engine, 5 tasks, MAX PARALLEL):
├── Task 8: Smart DOM Cleanup engine (depends: 3, 5) [deep]
├── Task 9: Bounding box spatial data (depends: 3, 5) [unspecified-high]
├── Task 10: Heuristic structural detector (depends: 3, 5) [deep]
├── Task 11: Iframe DOM capture module (depends: 1, 3, 5) [unspecified-high]
└── Task 12: DiscoveryResult interface evolution + type mappers (depends: 4, 5, 13) [deep]

Wave 3 (After Wave 2 — core features, 6 tasks, MAX PARALLEL):
├── Task 14: Profile tester: extraction simulation (depends: 3, 7, 12) [deep]
├── Task 15: Extraction config discovery AI call (depends: 3, 12) [deep]
├── Task 16: Discovery intent: guided form mode (depends: 6) [unspecified-high]
├── Task 17: Discovery intent: chat mode (depends: 6) [deep]
├── Task 18: Discovery intent: example-based teaching mode (depends: 6) [deep]
└── Task 19: Profile editor: merge + per-selector update (depends: 12) [unspecified-high]

Wave 4 (After Wave 3 — integration + UI, 7 tasks):
├── Task 20: discover.ts integration — new snapshot pipeline (depends: 2, 8, 9, 10, 11, 12) [deep]
├── Task 21: Agent actions: discover_page, test_profile, save_profile (depends: 14, 15) [deep]
├── Task 22: Agent prompt update for discovery actions (depends: 21) [quick]
├── Task 23: Profile bridge + server endpoints for /grade skill (depends: 12) [unspecified-high]
├── Task 24: DiscoveryPanel UI: testing + modes + config (depends: 13, 14, 15, 16, 17, 18, 20) [visual-engineering]
├── Task 25: ProfileManager UI: re-discover + edit + test (depends: 13, 14, 19) [visual-engineering]
└── Task 26: ExtractionConfig UI panel (depends: 15, 24) [visual-engineering]

Wave 5 (After Wave 4 — verification):
├── Task 28: Regression test suite (depends: 20) [unspecified-high]
└── Task 29: End-to-end discovery workflow test (depends: 20, 24) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T11 → T12 → T20 → T24 → F1-F4
              T3 → T8 → T12 → T14 → T21 → T22
Parallel Speedup: ~70% faster than sequential
Max Concurrent: 9 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 11 | 1 |
| 2 | — | 20 | 1 |
| 3 | — | 8, 9, 10, 11, 14, 15 | 1 |
| 4 | — | 12 | 1 |
| 5 | — | 8, 9, 10, 11, 12 | 1 |
| 6 | — | 16, 17, 18 | 1 |
| 7 | — | 14 | 1 |
| 8 | 3, 5 | 12, 20 | 2 |
| 9 | 3, 5 | 12, 20 | 2 |
| 10 | 3, 5 | 12, 20, 24 | 2 |
| 11 | 1, 3, 5 | 12, 20 | 2 |
| 12 | 4, 5, 13 | 14, 15, 19, 20, 23 | 2 |
| 13 | — | 12, 24, 25 | 1 |
| 14 | 3, 7, 12 | 21, 24, 25 | 3 |
| 15 | 3, 12 | 21, 24, 26 | 3 |
| 16 | 6 | 24 | 3 |
| 17 | 6 | 24 | 3 |
| 18 | 6 | 24 | 3 |
| 19 | 12 | 25 | 3 |
| 20 | 2, 8, 9, 10, 11, 12 | 24, 28, 29 | 4 |
| 21 | 14, 15 | 22 | 4 |
| 22 | 21 | — | 4 |
| 23 | 12 | — | 4 |
| 24 | 13, 14, 15, 16, 17, 18, 20 | 26, 29 | 4 |
| 25 | 13, 14, 19 | — | 4 |
| 26 | 15, 24 | — | 4 |
| 27 | — | 15 | 1 |
| 28 | 20 | F1-F4 | 5 |
| 29 | 20, 24 | F1-F4 | 5 |

### Agent Dispatch Summary

- **Wave 1**: **9 tasks** — T1-T7 → `quick`, T13 → `unspecified-high`, T27 → `quick`
- **Wave 2**: **5 tasks** — T8 → `deep`, T9 → `unspecified-high`, T10 → `deep`, T11 → `unspecified-high`, T12 → `deep`
- **Wave 3**: **6 tasks** — T14 → `deep`, T15 → `deep`, T16 → `unspecified-high`, T17 → `deep`, T18 → `deep`, T19 → `unspecified-high`
- **Wave 4**: **7 tasks** — T20 → `deep`, T21 → `deep`, T22 → `quick`, T23 → `unspecified-high`, T24 → `visual-engineering`, T25 → `visual-engineering`, T26 → `visual-engineering`
- **Wave 5**: **2 tasks** — T28 → `unspecified-high`, T29 → `deep`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> **Source Plans**: This mega-plan merges two detailed source plans. Each task below references its source for full specifications (What to do, Must NOT do, Agent Profile, References, QA Scenarios, etc.). The executor should read the source task details AND apply the deltas noted here.
>
> - **Plan A**: `.sisyphus/plans/discover-tab-scraper-upgrade.md` (scraper engine, 13 tasks)
> - **Plan B**: `.sisyphus/plans/discover-skill-enhancement.md` (skill features, 19 tasks)

### Cross-Reference Map

| Combined | Source | Source Task # | Changes from Source |
|----------|--------|--------------|---------------------|
| T1 | Plan A | A1 | None |
| T2 | Plan A | A2 | None |
| T3 | Plan A+B | A3 + B7 | **MERGED** — see details below |
| T4 | Plan B | B1 | None |
| T5 | Plan A | A4 | None |
| T6 | Plan B | B5 | None |
| T7 | Plan B | B3 | None |
| T8 | Plan A | A5 | Fixture path: `tests/fixtures/` |
| T9 | Plan A | A6 | Fixture path: `tests/fixtures/` |
| T10 | Plan A | A7 | Fixture path: `tests/fixtures/` |
| T11 | Plan A | A8 | None |
| T12 | Plan A+B | A9 + B2 | **MERGED** — see details below |
| T13 | Plan B | B6 | None |
| T14 | Plan B | B8 | Fixture path: `tests/fixtures/` |
| T15 | Plan B | B9 | None |
| T16 | Plan B | B10 | None |
| T17 | Plan B | B11 | None |
| T18 | Plan B | B12 | None |
| T19 | Plan B | B13 | None |
| T20 | Plan A | A10 | **EXTENDED** — see details below |
| T21 | Plan B | B14 | None |
| T22 | Plan B | B15 | None |
| T23 | Plan B | B16 | **REWRITTEN** — see details below |
| T24 | Plan A+B | A11 + B17 | **MERGED** — see details below |
| T25 | Plan B | B18 | None |
| T26 | Plan B | B19 | None |
| T27 | Plan B | B4 | None |
| T28 | Plan A | A12 | None |
| T29 | Plan A | A13 | None |

---

### Wave 1 — Foundation (9 tasks, all parallel)

- [ ] 1. CDP Iframe Context Spike
  **Source**: Plan A, Task 1 — copy verbatim
  **Blocks**: Task 11 (iframe capture)
  **Blocked By**: None

- [ ] 2. Prompt Budget Analysis + Adaptive Truncation Design
  **Source**: Plan A, Task 2 — copy verbatim
  **Blocks**: Task 20 (discover.ts integration)
  **Blocked By**: None

- [ ] 3. Test Infrastructure — jsdom Setup + Unified HTML Fixtures
  **Source**: **MERGED** from Plan A Task 3 + Plan B Task 7
  **Blocks**: Tasks 8, 9, 10, 11, 14, 15
  **Blocked By**: None

  **MERGE DETAILS**:
  - Use `tests/fixtures/` as the SINGLE fixture directory (not `__fixtures__/dom-snapshots/`)
  - Include ALL 8 fixtures (deduplicated):
    - `simple-batch.html` — From A: table rows, score inputs, feedback textareas (MyOpenMath-style)
    - `messy-wrappers.html` — From A: 5+ levels of meaningless div wrappers
    - `iframe-grading.html` — From A: page with same-origin iframe containing grading form
    - `sequential-grading.html` — From A+B: single-student with next/prev navigation + iframe question region
    - `hidden-content.html` — From A: large invisible sections (collapsed accordions, hidden tabs)
    - `large-page.html` — From A: 2000+ nodes for walker budget testing
    - `batch-grading-complex.html` — From B: 5 students, div-based layout, contenteditable feedback, hidden sync inputs
    - `unknown-lms.html` — From B: non-standard layout for testing on unfamiliar pages
  - Include jsdom per-file annotation setup from Plan A Task 3
  - Include test helper module: `tests/fixtures/dom-test-helpers.ts`
  - Each fixture must be valid HTML parseable by jsdom AND have realistic DOM structure with proper attributes
  - `simple-batch.html` must match MyOpenMath selectors for extraction testing (Plan B Task 7's requirement)

  **Acceptance Criteria**:
  - [ ] 8 fixture HTML files in `tests/fixtures/`
  - [ ] Test helper module at `tests/fixtures/dom-test-helpers.ts`
  - [ ] `cd ogre-desktop && npx vitest run tests/fixtures/` → at least 1 test passes (jsdom validation)
  - [ ] All fixtures valid HTML parseable by jsdom
  - [ ] `simple-batch.html` has 3+ students extractable by MyOpenMath selectors

  **Commit**: `test(discover): add jsdom test infrastructure and unified HTML fixture library`

- [ ] 4. DB Migration for Extraction Column
  **Source**: Plan B, Task 1 — copy verbatim
  **Blocks**: Task 12 (interface evolution + type mappers)
  **Blocked By**: None

- [ ] 5. DOM Snapshot Types/Interfaces + Priority Classification
  **Source**: Plan A, Task 4 — copy verbatim
  **Blocks**: Tasks 8, 9, 10, 11, 12
  **Blocked By**: None

- [ ] 6. Discovery Intent Types + Interfaces
  **Source**: Plan B, Task 5 — copy verbatim
  **Blocks**: Tasks 16, 17, 18
  **Blocked By**: None

- [ ] 7. Profile Tester Module Skeleton + Types
  **Source**: Plan B, Task 3 — copy verbatim
  **Blocks**: Task 14
  **Blocked By**: None

- [ ] 13. DiscoveryPanel Refactor into Sub-Components
  **Source**: Plan B, Task 6 — copy verbatim
  **Category**: `unspecified-high`
  **Blocks**: Tasks 12, 24, 25
  **Blocked By**: None (can start in Wave 1)

- [ ] 27. Extraction Config Prompt + Parser Skeleton
  **Source**: Plan B, Task 4 — copy verbatim
  **Category**: `quick`
  **Blocks**: Task 15
  **Blocked By**: None

---

### Wave 2 — Core Engine (5 tasks, MAX PARALLEL)

- [ ] 8. Smart DOM Cleanup Engine
  **Source**: Plan A, Task 5 — copy verbatim
  **Delta**: Update fixture paths from `__fixtures__/dom-snapshots/` to `tests/fixtures/`
  **Category**: `deep`
  **Blocks**: Tasks 12, 20
  **Blocked By**: Tasks 3, 5

- [ ] 9. Bounding Box Spatial Data
  **Source**: Plan A, Task 6 — copy verbatim
  **Delta**: Update fixture paths from `__fixtures__/dom-snapshots/` to `tests/fixtures/`
  **Category**: `unspecified-high`
  **Blocks**: Tasks 12, 20
  **Blocked By**: Tasks 3, 5

- [ ] 10. Heuristic Structural Detector
  **Source**: Plan A, Task 7 — copy verbatim
  **Delta**: Update fixture paths from `__fixtures__/dom-snapshots/` to `tests/fixtures/`
  **Category**: `deep`
  **Blocks**: Tasks 12, 20, 24
  **Blocked By**: Tasks 3, 5

- [ ] 11. Iframe DOM Capture Module
  **Source**: Plan A, Task 8 — copy verbatim
  **Category**: `unspecified-high`
  **Blocks**: Tasks 12, 20
  **Blocked By**: Tasks 1, 3, 5

- [ ] 12. DiscoveryResult Interface Evolution + Type Mappers
  **Source**: **MERGED** from Plan A Task 9 + Plan B Task 2
  **Category**: `deep`
  **Blocks**: Tasks 14, 15, 19, 20, 23
  **Blocked By**: Tasks 4, 5, 13

  **MERGE DETAILS**:
  This task combines TWO concerns that touch the same interface layer:

  **From Plan A Task 9 (DiscoveryResult interface evolution)**:
  - Extend `DiscoveryResult` interface with optional fields: `heuristicMatch?`, `snapshotMetadata?`
  - Extend `SelectorMap` with `iframeContext?`
  - Update `isValidDiscoveryResult()` for backward compatibility
  - Create type mapper that bridges `SiteProfile` (batch-grader.ts) with extended `DiscoveryResult` — do NOT modify `SiteProfile` definition (guardrail: "Must NOT refactor batch-grader.ts types")
  - Write migration logic: existing saved SiteProfiles load without error
  - Add regression tests for backward compatibility

  **From Plan B Task 2 (Type mappers + ExtractionConfig serialization)**:
  - Create `src/lib/type-mappers.ts` with `discoveryResultToSiteProfile()` and `siteProfileToDiscoveryResult()` converters
  - Update `serializeProfile()` and `deserializeProfile()` in `site-profiles.ts` to include extraction JSON field
  - Remove inline manual field mapping in `DiscoveryPanel.svelte:351-374` and replace with mapper call
  - Write round-trip tests, null extraction tests, type guard tests
  - No `as any` casts — use proper type narrowing

  **Combined Acceptance Criteria**:
  - [ ] Extended interfaces compile: `npx tsc --noEmit` → 0 errors
  - [ ] Existing `isValidDiscoveryResult` tests still pass
  - [ ] Old SiteProfile format loads without error (regression test)
  - [ ] `src/lib/type-mappers.ts` created with mapper functions
  - [ ] `npx vitest run src/lib/type-mappers.test.ts` → PASS
  - [ ] `npx vitest run src/lib/site-profiles.test.ts` → PASS (extraction serialization)
  - [ ] No `as any` casts in type-mappers.ts
  - [ ] Round-trip preservation test passes

  **Commit**: `feat(discover): evolve DiscoveryResult interface and add type mappers`

---

### Wave 3 — Core Features (6 tasks, MAX PARALLEL)

- [ ] 14. Profile Tester: Enhanced Validation + Extraction Simulation
  **Source**: Plan B, Task 8 — copy verbatim
  **Delta**: Fixture path updated to `tests/fixtures/`
  **Category**: `deep`
  **Blocks**: Tasks 21, 24, 25
  **Blocked By**: Tasks 3, 7, 12

- [ ] 15. Extraction Config Discovery AI Call + Validation
  **Source**: Plan B, Task 9 — copy verbatim
  **Category**: `deep`
  **Blocks**: Tasks 21, 24, 26
  **Blocked By**: Tasks 3, 12, 27

- [ ] 16. Discovery Intent: Guided Form Mode
  **Source**: Plan B, Task 10 — copy verbatim
  **Category**: `unspecified-high`
  **Blocks**: Task 24
  **Blocked By**: Task 6

- [ ] 17. Discovery Intent: Chat Mode
  **Source**: Plan B, Task 11 — copy verbatim
  **Category**: `deep`
  **Blocks**: Task 24
  **Blocked By**: Task 6

- [ ] 18. Discovery Intent: Example-Based Teaching Mode
  **Source**: Plan B, Task 12 — copy verbatim
  **Category**: `deep`
  **Blocks**: Task 24
  **Blocked By**: Task 6

- [ ] 19. Profile Editor: Merge + Per-Selector Update
  **Source**: Plan B, Task 13 — copy verbatim
  **Category**: `unspecified-high`
  **Blocks**: Task 25
  **Blocked By**: Task 12

---

### Wave 4 — Integration + UI (7 tasks)

- [ ] 20. discover.ts Integration — New Snapshot Pipeline
  **Source**: Plan A Task 10, **EXTENDED** with Plan B integration points
  **Category**: `deep`
  **Blocks**: Tasks 24, 28, 29
  **Blocked By**: Tasks 2, 8, 9, 10, 11, 12

  **EXTENSION DETAILS**:
  Everything from Plan A Task 10 (replace DOM_SNAPSHOT_SCRIPT, wire heuristic path, adaptive truncation, iframe capture), PLUS:
  - Wire ExtractionConfig discovery as optional second pass in `runDiscovery()` workflow (from Plan B Task 9 integration notes)
  - Accept `DiscoveryHints` parameter from intent modes to augment the AI prompt (from Plan B Task 10-12 integration)
  - Report via progress events whether heuristic, AI, or intent-augmented path was used
  - Ensure `runDiscovery()` signature accepts optional `{ hints?: DiscoveryHints, includeExtractionConfig?: boolean }`

  **Combined Acceptance Criteria**:
  - [ ] `DOM_SNAPSHOT_SCRIPT` constant no longer used (replaced by `buildSmartWalkScript()`)
  - [ ] `runDiscovery()` attempts heuristic detection before AI call
  - [ ] If heuristic succeeds + validates → AI call skipped
  - [ ] If heuristic fails → AI call proceeds as before
  - [ ] `DiscoveryHints` parameter augments AI prompt when provided
  - [ ] ExtractionConfig discovery optionally runs as second pass
  - [ ] All existing `discover.test.ts` tests still pass
  - [ ] `npx tsc --noEmit` → zero errors

  **Commit**: `feat(discover): integrate new snapshot pipeline with heuristic fast-path and intent support`

- [ ] 21. Agent Actions: discover_page, test_profile, save_profile
  **Source**: Plan B, Task 14 — copy verbatim
  **Category**: `deep`
  **Blocks**: Task 22
  **Blocked By**: Tasks 14, 15

- [ ] 22. Agent Prompt Update for Discovery Actions
  **Source**: Plan B, Task 15 — copy verbatim
  **Category**: `quick`
  **Blocks**: None
  **Blocked By**: Task 21

- [ ] 23. Profile Bridge + Server Endpoints for /grade Skill Profile Access
  **Source**: Plan B, Task 16 — **REWRITTEN** (Metis review: original references wrong file)
  **Category**: `unspecified-high`
  **Blocks**: None
  **Blocked By**: Task 12

  **⚠️ ARCHITECTURE CORRECTION** (from Metis review):
  Plan B Task 16 references `src/lib/server.ts` — that file is a **61-line Tauri event listener**, NOT the HTTP server. The actual HTTP server is `grading-server/server.js` (Hono-based Bun sidecar). Profiles are stored in the desktop app's SQLite via `tauri-plugin-sql` — the grading server has NO direct SQLite access. A desktop→server bridge is needed.

  **What to do**:
  - **Desktop side** (`ogre-desktop/src/lib/server.ts`): Add `syncProfileToServer()` that POSTs serialized profile data to the grading server whenever a profile is saved/updated. Wire into `saveProfile()` in `site-profiles.ts`.
  - **Server side** (`grading-server/server.js`): Add 3 endpoints following existing POST /api/grade pattern:
    - `POST /api/profiles/sync` — accepts serialized profile JSON, caches in memory (`Map<string, SiteProfile>`)
    - `GET /api/profiles` — returns all cached profiles as JSON array
    - `GET /api/profiles/match?url={url}` — returns the best matching profile for a given URL
  - Tests in `grading-server/test/profiles.test.js` and `ogre-desktop/src/lib/server.test.ts`

  **Architecture**: `Desktop App (SQLite) → POST /api/profiles/sync → Grading Server (in-memory Map) ← GET /api/profiles/match ← /grade skill`

  **Must NOT do**:
  - Do NOT modify `src/lib/server.ts` beyond adding sync function — keep existing Tauri event listener intact
  - Do NOT give the grading server direct SQLite access — profiles are pushed from desktop
  - Do NOT create full CRUD API — sync (POST) + read-only (GET) only
  - Do NOT reference `src/lib/server.ts` as "the HTTP server" — it is NOT

  **References**:
  - `grading-server/server.js:1307-1369` — Existing POST /api/grade endpoint pattern. Follow this.
  - `ogre-desktop/src/lib/server.ts:1-61` — Tauri event listener. Add sync function here.
  - `ogre-desktop/src/lib/site-profiles.ts` — `saveProfile()`. Wire sync call after save.
  - `ogre-desktop/src/lib/type-mappers.ts` (T12) — Use for serializing profile data to wire format.

  **⚠️ Shared with Vector History Plan**: This bridge pattern is the SAME architecture needed by vector history plan Task 7 (`.sisyphus/plans/history-vector-search.md`). Both need desktop→server communication. If both plans execute, reuse this pattern.

  **Acceptance Criteria**:
  - [ ] `POST /api/profiles/sync` accepts profile JSON and caches it
  - [ ] `GET /api/profiles` returns all cached profiles
  - [ ] `GET /api/profiles/match?url=...` returns matching profile or null
  - [ ] Desktop app pushes profiles to server after save
  - [ ] `bun test test/profiles.test.js` → PASS
  - [ ] `npx vitest run src/lib/server.test.ts` → PASS

  **QA Scenarios**:
  Scenario: Profile sync roundtrip — curl POST /api/profiles/sync with profile JSON → curl GET /api/profiles → verify synced profile present. Evidence: `.sisyphus/evidence/task-23-sync-roundtrip.txt`
  Scenario: URL matching — curl GET /api/profiles/match?url=myopenmath.com → verify match returned. Evidence: `.sisyphus/evidence/task-23-url-match.txt`
  Scenario: No match graceful — curl GET /api/profiles/match?url=unknown-site.com → verify null/empty (not 500). Evidence: `.sisyphus/evidence/task-23-no-match.txt`

  **Commit**: `feat(profiles): add desktop→server profile bridge and HTTP endpoints`

- [ ] 24. DiscoveryPanel UI: Testing + Modes + Config + Engine Indicators
  **Source**: **MERGED** from Plan A Task 11 + Plan B Task 17
  **Category**: `visual-engineering`
  **Blocks**: Tasks 26, 29
  **Blocked By**: Tasks 13, 14, 15, 16, 17, 18, 20

  **MERGE DETAILS**:
  This is the main UI integration task. It combines:

  **From Plan A Task 11 (engine indicators)**:
  - Heuristic vs AI indicator ("Detected automatically" vs "Analyzed by AI")
  - `snapshotMetadata` stats display (total nodes, captured, dropped, iframe count)
  - Iframe indicators (which selectors target iframe content, cross-origin warnings)
  - Heuristic confidence score and pattern name display
  - "Force AI Analysis" button that bypasses heuristic detection
  - Updated progress messages for new pipeline stages

  **From Plan B Task 17 (testing + modes + config)**:
  - Intent mode selector (📝 Form | 💬 Chat | 🎯 Example) with sub-component rendering
  - Testing results display (per-selector pass/fail from ProfileTester)
  - "Re-test" button for running ProfileTester again
  - ExtractionConfig display section (mounts ExtractionConfigPanel sub-component)
  - Wire discovery flow: mode → intent → discovery → auto-test → results + config

  **Combined Acceptance Criteria**:
  - [ ] Intent mode selector renders 3 options
  - [ ] Selecting each mode renders correct sub-component
  - [ ] Test results display shows per-selector pass/fail after discovery
  - [ ] Heuristic/AI indicator visible in results
  - [ ] Snapshot metadata stats displayed
  - [ ] "Force AI Analysis" button functional
  - [ ] ExtractionConfig section shows discovered values
  - [ ] Orchestrator stays under 600 lines
  - [ ] `npx tsc --noEmit` → zero errors

  **Commit**: `feat(ui): complete DiscoveryPanel with engine indicators, modes, testing, and config`

- [ ] 25. ProfileManager UI: Re-Discover + Per-Selector Edit + Test
  **Source**: Plan B, Task 18 — copy verbatim
  **Category**: `visual-engineering`
  **Blocks**: None
  **Blocked By**: Tasks 13, 14, 19

- [ ] 26. ExtractionConfig UI Panel
  **Source**: Plan B, Task 19 — copy verbatim
  **Category**: `visual-engineering`
  **Blocks**: None
  **Blocked By**: Tasks 15, 24

---

### Wave 5 — Verification (2 tasks)

- [ ] 28. Regression Test Suite
  **Source**: Plan A, Task 12 — copy verbatim
  **Category**: `unspecified-high`
  **Blocks**: F1-F4
  **Blocked By**: Task 20

- [ ] 29. End-to-End Discovery Workflow Test
  **Source**: Plan A, Task 13 — copy verbatim, extended
  **Category**: `deep`
  **Blocks**: F1-F4
  **Blocked By**: Tasks 20, 24
  **Delta**: Also test the intent-augmented path (pass DiscoveryHints, verify hints augment prompt)

---

## Vector History Plan Coordination

> This plan is **discovery-focused**. The vector history plan (`.sisyphus/plans/history-vector-search.md`) is a **separate concern** — cross-session grading memory via embeddings. The two plans share infrastructure that must be coordinated:

### Shared Infrastructure Points

| Concern | Discovery (this plan) | Vector History | Coordination |
|---------|----------------------|----------------|-------------|
| **DB migrations** | Task 4: Migration 11 (extraction column) | Task 1: Migration 10 (response_embeddings) | Migration 10 first, 11 second. No conflict. |
| **Server bridge** | Task 23: desktop→server profile sync | Task 7: desktop→server embedding storage | Same pattern. T23 establishes bridge; vector plan reuses it. |
| **`server.ts` identity** | T23 corrects file reference | Vector T7 calls `/api/embed` on grading server | Both must target `grading-server/server.js`, NOT `src/lib/server.ts`. |

### If Both Plans Execute
1. **Execute vector history plan AFTER this plan** — T23 establishes the desktop→server sync pattern that vector plan Task 7 reuses
2. **Migration ordering**: Vector plan's Migration 10 goes BEFORE this plan's Migration 11. Verify ordering in `lib.rs`
3. **Grading server endpoints**: Vector plan adds `POST /api/embed`, this plan adds `POST /api/profiles/sync` + `GET /api/profiles` — no endpoint conflicts

### If Only Discovery Plan Executes
No coordination needed. Vector history plan is fully independent and can be executed later.


---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify DOM walker script is pure browser JS with no imports/requires. Verify DiscoveryPanel orchestrator under 600 lines.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (smart cleanup feeding into discovery pipeline, heuristic into intent modes, extraction config into profile tester). Test edge cases: very large DOM, deeply nested wrappers, pages with iframes, empty inputs. Start desktop app, run full discovery in each mode, test profile saving/editing/re-discovery, verify agent actions, curl profile endpoints. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no npm deps in walker script, no LMS-specific heuristics, no cross-origin iframe access, no server endpoint changes to /api/chat, no general chat UI, no ML training, no CRUD API, no as-any casts, no new tabs. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: Individual commits per task (foundation work)
- **Wave 2**: Individual commits per task (engine modules)
- **Wave 3**: Individual commits per task (feature modules)
- **Wave 4**: Grouped commits for related tasks (integration + UI)
- **Wave 5**: Individual commits (verification)

Specific messages listed in each task's Commit section.

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
cd ogre-desktop && npx vitest run                                    # Expected: ALL pass
cd ogre-desktop && npx vitest run src/lib/dom-snapshot*.test.ts      # Expected: all pass
cd ogre-desktop && npx vitest run src/lib/heuristic-detector*.test.ts # Expected: all pass
cd ogre-desktop && npx vitest run src/lib/iframe-capture*.test.ts    # Expected: all pass (if spike passes)
cd ogre-desktop && npx vitest run src/lib/discover.test.ts           # Expected: all pass
cd ogre-desktop && npx vitest run src/lib/profile-tester.test.ts     # Expected: extraction sim tests pass
cd ogre-desktop && npx vitest run src/lib/extraction-config-discovery.test.ts  # Expected: pass
cd ogre-desktop && npx vitest run src/lib/discovery-intent.test.ts   # Expected: all 3 modes pass
cd ogre-desktop && npx vitest run src/lib/profile-editor.test.ts     # Expected: merge + update pass
cd ogre-desktop && npx vitest run src/lib/type-mappers.test.ts       # Expected: round-trip pass

# No type regressions
cd ogre-desktop && npx tsc --noEmit  # Expected: 0 errors

# Server endpoints
curl -H 'Authorization: Bearer <token>' http://localhost:3456/api/profiles           # Expected: 200 with array
curl -H 'Authorization: Bearer <token>' http://localhost:3456/api/profiles/match?url=https://myopenmath.com/gradeallq2.php  # Expected: 200
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (vitest)
- [ ] Existing SiteProfiles load without error
- [ ] DOM walker script contains zero import/require statements
- [ ] Heuristic detection falls back to AI when validation fails
- [ ] DB migration backward compatible
- [ ] DiscoveryPanel orchestrator under 600 lines
- [ ] No `as any` casts in new code
- [ ] All three interaction modes functional
- [ ] Agent actions registered and functional
- [ ] /grade skill can fetch profiles via HTTP
