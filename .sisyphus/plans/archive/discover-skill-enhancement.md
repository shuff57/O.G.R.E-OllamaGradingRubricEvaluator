# Smart Discovery Skill: Deep DOM Testing, Multi-Mode Interaction, and Agent Integration

## TL;DR

> **Quick Summary**: Enhance O.G.R.E's discovery system into a full "Smart Discovery Skill" — deep DOM testing that simulates real extraction, three user interaction modes (chat/form/example-based), profile editing with re-discovery and per-selector refinement, ExtractionConfig auto-detection, and programmatic access for both the desktop agent and external /grade skill.
> 
> **Deliverables**:
> - Profile testing engine that simulates real student extraction and reports pass/fail
> - ExtractionConfig auto-discovery via separate AI call
> - Three discovery interaction modes (guided form, chat-based, example-based teaching)
> - Profile editor with merge-on-rediscover and per-selector picker refinement
> - Agent actions (discover_page, test_profile, save_profile) for desktop AgentChat
> - Read-only HTTP endpoints for /grade skill profile access
> - Refactored DiscoveryPanel with sub-components for maintainability
> 
> **Estimated Effort**: Large (19 implementation tasks + 4 verification)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 (DB migration) -> Task 2 (type mappers) -> Task 3 (profile tester) -> Task 8 (extraction sim) -> Task 14 (agent actions) -> Task 17 (discovery UI) -> Final Verification

---

## Context

### Original Request
User wants to add a "skill" for the desktop app that uses the existing webpage mapping instructions to let users create new skills for webpages. The discover tab in the grader panel needs to be smarter, test the DOMs it extracts, and let users update or add more mappings to discovered site profiles.

### Interview Summary
**Key Discussions**:
- Testing depth: BOTH enhanced validation AND full extraction simulation, plus user-described intent matching
- Profile updates: BOTH re-discover-with-merge AND per-selector refinement
- Interaction modes: ALL THREE (chat, guided form, example-based) — let user choose
- Agent support: BOTH desktop AgentChat AND external /grade skill
- UI approach: Enhance existing panels inside GraderPanel (not new tabs)
- ExtractionConfig: In scope — AI should discover extraction methods
- Test strategy: TDD (RED-GREEN-REFACTOR)

**Research Findings**:
- Discovery engine (`discover.ts`) does single-shot AI vision calls with screenshot + DOM snapshot
- Validation is shallow: `querySelectorAll(selector)` match count + sample text only
- `ExtractionConfig` type exists in `site-profiles.ts` but discovery never generates it
- DB `site_profiles` table has NO extraction column — needs migration
- `DiscoveryPanel.svelte` is 956 lines — must refactor before adding features
- Type mismatch: `discover.ts` SelectorMap vs `batch-grader.ts` SiteSelectors (structurally similar, not unified)
- Agent system: closed `AgentAction` union — adding actions requires changes across 4+ files
- Desktop agent uses `evalScript()` on WebView2; /grade skill uses Playwriter MCP on Chrome — cannot share implementations
- Test infrastructure: 31 test files, vitest, 2480+ assertions — strong TDD support

### Metis Review
**Identified Gaps** (addressed):
- DB migration needed for extraction column (Task 1)
- Type mappers needed to replace inline casts (Task 2)
- DiscoveryPanel must be refactored before feature additions (Task 6)
- ExtractionConfig must use separate AI call, not bloat existing prompt (Task 4)
- /grade skill cannot import TypeScript — needs HTTP endpoints (Task 16)
- Chat mode should be discovery-scoped, not general assistant (guardrail)
- Agent actions must follow existing discriminated union pattern (guardrail)

---

## Work Objectives

### Core Objective
Transform the existing discovery system from a one-shot AI selector finder into a comprehensive "Smart Discovery Skill" with deep DOM testing, multi-mode user interaction, profile lifecycle management, and programmatic agent access.

### Concrete Deliverables
- `src/lib/profile-tester.ts` — Deep DOM testing engine with extraction simulation
- `src/lib/extraction-config-discovery.ts` — Separate AI call for ExtractionConfig detection
- `src/lib/discovery-intent.ts` — Three interaction modes: form, chat, example
- `src/lib/profile-editor.ts` — Profile merge + per-selector update operations
- `src/lib/type-mappers.ts` — Explicit DiscoveryResult <-> SiteProfile converters
- Enhanced `src/lib/site-profiles.ts` — ExtractionConfig serialization + DB migration
- Enhanced `src-tauri/src/lib.rs` — Migration v11 for extraction column
- 3 new sub-components: `DiscoveryChatMode.svelte`, `DiscoveryFormMode.svelte`, `DiscoveryExampleMode.svelte`
- Enhanced `DiscoveryPanel.svelte` — orchestrator with mode selector + test results UI
- Enhanced `ProfileManager.svelte` — re-discover + per-selector edit + test button
- New agent actions in `agent-types.ts` + `browser-actions.ts` + `agent-prompt.ts`
- New server endpoints: `GET /api/profiles`, `GET /api/profiles/:id`, `GET /api/profiles/match`
- Test fixture HTML files in `tests/fixtures/`

### Definition of Done
- [ ] `npx vitest run` — all existing + new tests pass
- [ ] Profile created via discovery includes ExtractionConfig
- [ ] Profile tester extracts real student data from test fixture HTML
- [ ] All three interaction modes produce valid DiscoveryResult
- [ ] Agent can execute discover_page action on unknown pages
- [ ] /grade skill can fetch profiles via HTTP endpoints
- [ ] Existing profiles load without errors after DB migration (extraction: null)

### Must Have
- Deep DOM testing that simulates real extraction (not just match counts)
- All three user interaction modes
- ExtractionConfig auto-discovery
- Profile editing with re-discovery and per-selector refinement
- Agent actions for desktop AgentChat
- HTTP profile endpoints for /grade skill
- TDD for all new lib modules
- DB migration backward compatibility

### Must NOT Have (Guardrails)
- General-purpose chat UI — chat mode is discovery-scoped ONLY
- ML training or pattern learning for example mode — just CSS selector generalization
- Conversation persistence/history for chat mode
- Version history or diff UI for profile editing
- Full REST CRUD API — read-only endpoints only for /grade skill
- WebSocket communication
- Modifications to the existing working `DISCOVERY_SYSTEM_PROMPT` for selector discovery
- Agent actions that bypass the action approval flow (review mode)
- `as any` casts — explicit type mappers instead
- Pushing DiscoveryPanel.svelte past ~600 lines in the orchestrator
- Refactoring batch-grader.ts types (too many consumers)
- New panels or tabs — enhance existing DiscoveryPanel and ProfileManager only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, 31 test files, 2480+ assertions)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: vitest (existing)
- **Each task**: Write failing test first, then implement, then refactor

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lib modules**: Use Bash (vitest) — run test suites, assert pass counts
- **UI components**: Use Playwright (playwright skill) — interact with desktop app UI
- **Server endpoints**: Use Bash (curl) — send requests, assert status + response fields
- **Agent actions**: Use vitest mocks — mock evalScript, verify action dispatch

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types, migration, test fixtures):
├── Task 1: DB migration for extraction column [quick]
├── Task 2: Type mappers + ExtractionConfig serialization [quick]
├── Task 3: Profile tester module skeleton + types (TDD) [quick]
├── Task 4: Extraction config discovery prompt + parser skeleton (TDD) [quick]
├── Task 5: Discovery intent types + interfaces [quick]
├── Task 6: DiscoveryPanel refactor into sub-components [unspecified-high]
└── Task 7: Test fixture HTML files [quick]

Wave 2 (Core lib modules — MAX PARALLEL):
├── Task 8: Profile tester: enhanced validation + extraction sim (TDD) (depends: 2, 3, 7) [deep]
├── Task 9: Extraction config discovery AI call + validation (TDD) (depends: 4, 7) [deep]
├── Task 10: Discovery intent: guided form mode (TDD) (depends: 5) [unspecified-high]
├── Task 11: Discovery intent: chat mode (TDD) (depends: 5) [deep]
├── Task 12: Discovery intent: example-based teaching mode (TDD) (depends: 5) [deep]
└── Task 13: Profile editor: merge + per-selector update (TDD) (depends: 2) [unspecified-high]

Wave 3 (Integration — agent + UI + server):
├── Task 14: Agent actions: discover_page, test_profile, save_profile (depends: 8, 9) [deep]
├── Task 15: Agent prompt update for discovery actions (depends: 14) [quick]
├── Task 16: Server endpoints for /grade skill profile access (depends: 2) [unspecified-high]
├── Task 17: DiscoveryPanel: testing UI + intent mode selector (depends: 6, 8, 10, 11, 12) [visual-engineering]
├── Task 18: ProfileManager: re-discover + per-selector edit + test (depends: 6, 8, 13) [visual-engineering]
└── Task 19: ExtractionConfig UI: display + user override (depends: 9, 17) [visual-engineering]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Task 3 → Task 8 → Task 14 → Task 17 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2 | 1 |
| 2 | 1 | 8, 13, 16 | 1 |
| 3 | — | 8 | 1 |
| 4 | — | 9 | 1 |
| 5 | — | 10, 11, 12 | 1 |
| 6 | — | 17, 18 | 1 |
| 7 | — | 8, 9 | 1 |
| 8 | 2, 3, 7 | 14, 17, 18 | 2 |
| 9 | 4, 7 | 14, 19 | 2 |
| 10 | 5 | 17 | 2 |
| 11 | 5 | 17 | 2 |
| 12 | 5 | 17 | 2 |
| 13 | 2 | 18 | 2 |
| 14 | 8, 9 | 15 | 3 |
| 15 | 14 | — | 3 |
| 16 | 2 | — | 3 |
| 17 | 6, 8, 10, 11, 12 | 19 | 3 |
| 18 | 6, 8, 13 | — | 3 |
| 19 | 9, 17 | — | 3 |

### Agent Dispatch Summary

- **Wave 1**: **7 tasks** — T1-T5, T7 -> `quick`, T6 -> `unspecified-high`
- **Wave 2**: **6 tasks** — T8, T11, T12 -> `deep`, T9 -> `deep`, T10, T13 -> `unspecified-high`
- **Wave 3**: **6 tasks** — T14 -> `deep`, T15 -> `quick`, T16 -> `unspecified-high`, T17-T19 -> `visual-engineering`
- **FINAL**: **4 tasks** — F1 -> `oracle`, F2 -> `unspecified-high`, F3 -> `unspecified-high`, F4 -> `deep`

---

## TODOs

### Wave 1 — Foundation

- [ ] 1. DB Migration for Extraction Column

  **What to do**:
  - RED: Write migration test that verifies: (a) new `extraction TEXT DEFAULT NULL` column exists after migration, (b) existing profiles load with `extraction: null`, (c) profiles with extraction data round-trip correctly
  - GREEN: Add migration v11 to `src-tauri/src/lib.rs` migrations vector: `ALTER TABLE site_profiles ADD COLUMN extraction TEXT DEFAULT NULL`
  - REFACTOR: Ensure migration follows the existing pattern (see migrations 1-10 in lib.rs)

  **Must NOT do**:
  - Drop or modify any existing columns
  - Make extraction column NOT NULL (would break existing profiles)
  - Add any indexes on extraction column (not needed for the data size)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL statement + Rust migration registration, minimal code
  - **Skills**: []
    - No special skills needed — straightforward Rust/SQL task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-7)
  - **Blocks**: Task 2 (type mappers depend on DB schema being ready)
  - **Blocked By**: None (can start immediately)

  **References**:
  **Pattern References**:
  - `src-tauri/src/lib.rs:897-913` — Existing migration 6 pattern for `site_profiles` table creation
  - `src-tauri/src/lib.rs` — The `migrations` vector where new migrations are registered (find `Migration` struct usage)

  **API/Type References**:
  - `src/lib/db.ts` — `getSiteProfiles()`, `saveSiteProfile()` — DB access functions that may need extraction field
  - `src/lib/site-profiles.ts:265-300` — `serializeProfile()` and `deserializeProfile()` — serialization that must be updated

  **WHY Each Reference Matters**:
  - `lib.rs` migrations: Follow the exact pattern for adding migrations (struct format, version number, SQL string)
  - `db.ts`: The Tauri SQL plugin functions need to handle the new column in queries
  - `site-profiles.ts`: Serialization must include extraction field after DB schema is updated

  **Acceptance Criteria**:
  - [ ] Migration v11 added to lib.rs migrations vector
  - [ ] `npx vitest run src/lib/db.test.ts` -> PASS (existing tests still work)
  - [ ] App starts without errors after migration

  **QA Scenarios:**
  ```
  Scenario: Existing profiles survive migration
    Tool: Bash (vitest)
    Preconditions: Test database with pre-existing site_profiles rows (no extraction column)
    Steps:
      1. Run vitest test that creates a profile without extraction field
      2. Simulate migration by adding extraction column
      3. Query the profile back
    Expected Result: Profile loads successfully with extraction = null
    Failure Indicators: SQL error, profile fails to deserialize, test throws
    Evidence: .sisyphus/evidence/task-1-migration-backward-compat.txt

  Scenario: New profile with extraction data persists
    Tool: Bash (vitest)
    Preconditions: Database with extraction column present
    Steps:
      1. Save a profile with extraction JSON data
      2. Read it back
      3. Assert extraction field matches what was saved
    Expected Result: Extraction JSON round-trips correctly
    Evidence: .sisyphus/evidence/task-1-extraction-roundtrip.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(db): add migration v11 for extraction column in site_profiles`
  - Files: `src-tauri/src/lib.rs`, `src/lib/db.ts`
  - Pre-commit: `npx vitest run src/lib/db.test.ts`

- [ ] 2. Type Mappers + ExtractionConfig Serialization

  **What to do**:
  - RED: Write tests for: (a) `discoveryResultToSiteProfile()` converts DiscoveryResult + ExtractionConfig -> SiteProfile, (b) `siteProfileToDiscoveryResult()` converts SiteProfile -> DiscoveryResult, (c) round-trip preserves all fields, (d) handles null/undefined extraction gracefully, (e) `serializeProfile()`/`deserializeProfile()` handle extraction field
  - GREEN: Create `src/lib/type-mappers.ts` with mapper functions. Update `serializeProfile()` and `deserializeProfile()` in `site-profiles.ts` to include extraction JSON field
  - REFACTOR: Remove the inline manual field mapping in `DiscoveryPanel.svelte:351-374` and replace with mapper call

  **Must NOT do**:
  - Use `as any` casts — use proper type narrowing
  - Modify the source types in `discover.ts` or `batch-grader.ts`
  - Create a third set of types — map between the two existing sets

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type conversion functions, no side effects, straightforward TDD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-7)
  - **Blocks**: Tasks 8, 13, 16
  - **Blocked By**: Task 1 (DB schema must be ready for serialization updates)

  **References**:
  **Pattern References**:
  - `src/lib/site-profiles.ts:265-300` — Existing `serializeProfile()` and `deserializeProfile()` pattern to extend
  - `src/components/grading/DiscoveryPanel.svelte:351-374` — Inline mapping code to REPLACE with mapper

  **API/Type References**:
  - `src/lib/discover.ts:43-81` — `SelectorMap`, `FeedbackConfig`, `SaveConfig`, `NavigationConfig`, `DiscoveryResult` types
  - `src/lib/batch-grader.ts:58-131` — `SiteSelectors`, `FeedbackConfig`, `SaveConfig`, `NavigationConfig`, `SiteProfile` types
  - `src/lib/site-profiles.ts:39-58` — `ExtractionConfig` interface

  **WHY Each Reference Matters**:
  - `discover.ts` types: Source types for discovery-to-profile mapping
  - `batch-grader.ts` types: Target types that the grading engine consumes
  - `site-profiles.ts` ExtractionConfig: Must be included in serialization for DB persistence
  - DiscoveryPanel inline mapping: Code smell to replace — demonstrates the exact field mapping needed

  **Acceptance Criteria**:
  - [ ] Test file created: `src/lib/type-mappers.test.ts`
  - [ ] `npx vitest run src/lib/type-mappers.test.ts` -> PASS
  - [ ] `npx vitest run src/lib/site-profiles.test.ts` -> PASS (extraction serialization)
  - [ ] No `as any` casts in type-mappers.ts

  **QA Scenarios:**
  ```
  Scenario: Discovery result to site profile conversion
    Tool: Bash (vitest)
    Preconditions: Mock DiscoveryResult with all fields populated
    Steps:
      1. Call discoveryResultToSiteProfile(mockDiscoveryResult, mockExtractionConfig, { name: 'Test', urlPatterns: ['example.com'] })
      2. Assert returned SiteProfile has all fields correctly mapped
      3. Assert selectors map correctly (SelectorMap -> SiteSelectors)
    Expected Result: All fields present and correctly typed, no null/undefined leaks
    Evidence: .sisyphus/evidence/task-2-discovery-to-profile.txt

  Scenario: Round-trip preserves extraction config
    Tool: Bash (vitest)
    Preconditions: SiteProfile with ExtractionConfig populated
    Steps:
      1. Call serializeProfile(profileWithExtraction)
      2. Call deserializeProfile(serializedRow)
      3. Deep-equal original vs deserialized extraction config
    Expected Result: ExtractionConfig identical after round-trip
    Evidence: .sisyphus/evidence/task-2-extraction-roundtrip.txt

  Scenario: Null extraction handled gracefully
    Tool: Bash (vitest)
    Preconditions: DB row with extraction = null (legacy profile)
    Steps:
      1. Call deserializeProfile(rowWithNullExtraction)
      2. Assert profile.extraction is undefined (not error)
    Expected Result: Profile loads without errors, extraction is undefined
    Evidence: .sisyphus/evidence/task-2-null-extraction.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(discovery): add type mappers and extraction config serialization`
  - Files: `src/lib/type-mappers.ts`, `src/lib/type-mappers.test.ts`, `src/lib/site-profiles.ts`, `src/lib/site-profiles.test.ts`, `src/components/grading/DiscoveryPanel.svelte`
  - Pre-commit: `npx vitest run src/lib/type-mappers.test.ts && npx vitest run src/lib/site-profiles.test.ts`

- [ ] 3. Profile Tester Module Skeleton + Types (TDD)

  **What to do**:
  - RED: Write test file `src/lib/profile-tester.test.ts` with test stubs for: (a) `testSelectorDepth()` — enhanced validation of individual selectors, (b) `testExtraction()` — full student extraction simulation, (c) `testProfile()` — end-to-end profile test, (d) `ProfileTestReport` type with per-selector and per-extraction results
  - GREEN: Create `src/lib/profile-tester.ts` with exported types (`ProfileTestReport`, `SelectorTestResult`, `ExtractionTestResult`) and function signatures that throw 'not implemented'
  - REFACTOR: Ensure types align with both discover.ts ValidationResults and batch-grader.ts Student interface

  **Must NOT do**:
  - Implement the actual testing logic (that's Task 8)
  - Import browser.ts functions (skeleton only — real impl uses evalScript)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions and function stubs only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/lib/discover.ts:83-92` — Existing `SelectorValidation` and `ValidationResults` types to extend
  - `src/lib/batch-grader.ts:22-33` — `Student` interface that extraction simulation should produce

  **API/Type References**:
  - `src/lib/site-profiles.ts:39-58` — `ExtractionConfig` that drives extraction behavior
  - `src/lib/site-profiles.ts:64-67` — `SiteProfileWithExtraction` that includes extraction config

  **WHY Each Reference Matters**:
  - `SelectorValidation`: Existing validation type to build upon (add depth testing fields)
  - `Student` interface: The target output format — extraction simulation should produce Student-shaped data
  - `ExtractionConfig`: Drives which extraction methods to test

  **Acceptance Criteria**:
  - [ ] `src/lib/profile-tester.ts` created with exported types
  - [ ] `src/lib/profile-tester.test.ts` created with test stubs
  - [ ] `npx vitest run src/lib/profile-tester.test.ts` -> tests exist but implementation tests skip/todo

  **QA Scenarios:**
  ```
  Scenario: Types are importable and well-formed
    Tool: Bash (vitest)
    Preconditions: None
    Steps:
      1. Import ProfileTestReport, SelectorTestResult, ExtractionTestResult from profile-tester
      2. Create instances of each type
      3. Assert TypeScript compiles without errors
    Expected Result: All types import and instantiate cleanly
    Evidence: .sisyphus/evidence/task-3-types-importable.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(discovery): add profile tester module skeleton and types`
  - Files: `src/lib/profile-tester.ts`, `src/lib/profile-tester.test.ts`
  - Pre-commit: `npx vitest run src/lib/profile-tester.test.ts`

- [ ] 4. Extraction Config Discovery Prompt + Parser Skeleton (TDD)

  **What to do**:
  - RED: Write test file `src/lib/extraction-config-discovery.test.ts` with stubs for: (a) `parseExtractionConfigResponse()` — parses AI response to ExtractionConfig, (b) `isValidExtractionConfig()` — validates required fields, (c) `EXTRACTION_CONFIG_SYSTEM_PROMPT` — exists and is a non-empty string, (d) tests for edge cases: malformed JSON, missing fields, code-fenced responses
  - GREEN: Create `src/lib/extraction-config-discovery.ts` with the system prompt (separate from DISCOVERY_SYSTEM_PROMPT), parser function, and validator. Parser follows the same pattern as `parseDiscoveryResponse()` (strip think blocks, code fences, extract JSON)
  - REFACTOR: Ensure prompt instructs AI to identify `responseMethod` and `maxScoreMethod` from DOM structure

  **Must NOT do**:
  - Modify `DISCOVERY_SYSTEM_PROMPT` in `discover.ts`
  - Implement the AI call (that's Task 9) — just the prompt template and parser
  - Include screenshot analysis in the extraction config prompt (DOM-only is sufficient)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Prompt template string + JSON parser following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/lib/discover.ts:136-286` — `DISCOVERY_SYSTEM_PROMPT` — reference for prompt writing quality (but do NOT modify)
  - `src/lib/discover.ts:339-463` — `parseDiscoveryResponse()` — EXACT pattern to follow for JSON parsing (strip think blocks, code fences, brace matching)
  - `src/lib/discover.ts:471-508` — `isValidDiscoveryResult()` — validation pattern to follow

  **API/Type References**:
  - `src/lib/site-profiles.ts:39-58` — `ExtractionConfig` — the target type the parser must produce

  **WHY Each Reference Matters**:
  - `DISCOVERY_SYSTEM_PROMPT`: Reference for how to write an effective discovery prompt (but do NOT embed extraction config in it)
  - `parseDiscoveryResponse()`: Copy this pattern for the new parser — handles think blocks, code fences, partial JSON, all the common AI response quirks
  - `isValidDiscoveryResult()`: Copy this validation pattern — check required fields, correct types
  - `ExtractionConfig`: The exact type the parser must produce — 3 response methods x 3 max score methods

  **Acceptance Criteria**:
  - [ ] `src/lib/extraction-config-discovery.ts` created
  - [ ] `src/lib/extraction-config-discovery.test.ts` created
  - [ ] `EXTRACTION_CONFIG_SYSTEM_PROMPT` is a separate constant (not in discover.ts)
  - [ ] `npx vitest run src/lib/extraction-config-discovery.test.ts` -> parser tests pass

  **QA Scenarios:**
  ```
  Scenario: Parse valid extraction config JSON
    Tool: Bash (vitest)
    Preconditions: Mock AI response with valid ExtractionConfig JSON
    Steps:
      1. Call parseExtractionConfigResponse(mockAIResponse)
      2. Assert result has responseMethod, maxScoreMethod, maxScoreDefault
      3. Assert responseMethod is one of 'childIndex', 'iframe', 'selector'
    Expected Result: ExtractionConfig with all required fields
    Evidence: .sisyphus/evidence/task-4-parse-valid-config.txt

  Scenario: Handle code-fenced AI response
    Tool: Bash (vitest)
    Preconditions: Mock AI response wrapped in ```json ... ``` fences
    Steps:
      1. Call parseExtractionConfigResponse(fencedResponse)
      2. Assert parses correctly despite fences
    Expected Result: ExtractionConfig extracted from fenced JSON
    Evidence: .sisyphus/evidence/task-4-code-fenced.txt

  Scenario: Reject invalid extraction config
    Tool: Bash (vitest)
    Preconditions: Mock AI response with missing required fields
    Steps:
      1. Call isValidExtractionConfig({ responseMethod: 'invalid' })
      2. Assert returns false
    Expected Result: Validation rejects malformed config
    Evidence: .sisyphus/evidence/task-4-reject-invalid.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(discovery): add extraction config discovery prompt and parser`
  - Files: `src/lib/extraction-config-discovery.ts`, `src/lib/extraction-config-discovery.test.ts`
  - Pre-commit: `npx vitest run src/lib/extraction-config-discovery.test.ts`


- [ ] 5. Discovery Intent Types + Interfaces

  **What to do**:
  - RED: Write test file `src/lib/discovery-intent.test.ts` with type import tests and stub tests for each mode's function signature
  - GREEN: Create `src/lib/discovery-intent.ts` with types: `DiscoveryIntent` (structured user intent), `DiscoveryHints` (AI guidance from intent), `IntentMode` ('chat' | 'form' | 'example'), `FormModeInput` (structured form fields), `ChatMessage` (chat turn), `ExampleSelection` (clicked element + label). Export function signatures: `parseFormIntent()`, `parseChatIntent()`, `parseExampleSelections()`, `intentToDiscoveryHints()`
  - REFACTOR: Ensure `DiscoveryHints` is compatible with the existing `DiscoveryOptions` so hints can feed into `runDiscovery()`

  **Must NOT do**:
  - Implement any AI calls or conversation logic (those are Tasks 10-12)
  - Create UI components (those are Wave 3)
  - Build conversation persistence or history storage

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions and function signatures
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 10, 11, 12
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/lib/discover.ts:94-126` — `DiscoveryRequest`, `DiscoveryOptions`, `DiscoveryWorkflow` — types that DiscoveryHints must integrate with
  - `src/lib/agent-types.ts` — Discriminated union pattern for `IntentMode` type

  **API/Type References**:
  - `src/lib/discover.ts:74-81` — `DiscoveryResult` — the output all three modes must produce
  - `src/lib/element-picker.ts:20-31` — `ElementPickerResult` — used by example mode when user clicks elements

  **WHY Each Reference Matters**:
  - `DiscoveryOptions`: DiscoveryHints must extend or compose with this to feed enhanced context to the AI
  - `DiscoveryResult`: All three modes converge to producing this type
  - `ElementPickerResult`: Example mode captures clicked elements and must reference this type

  **Acceptance Criteria**:
  - [ ] `src/lib/discovery-intent.ts` created with all exported types
  - [ ] `src/lib/discovery-intent.test.ts` created with type import tests
  - [ ] Types compile without errors: `npx tsc --noEmit`

  **QA Scenarios:**
  ```
  Scenario: All intent types are importable
    Tool: Bash (vitest)
    Preconditions: None
    Steps:
      1. Import DiscoveryIntent, DiscoveryHints, IntentMode, FormModeInput, ChatMessage, ExampleSelection
      2. Create test instances of each
      3. Assert TypeScript compiles cleanly
    Expected Result: All types import and work
    Evidence: .sisyphus/evidence/task-5-types-importable.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(discovery): add discovery intent types and interfaces`
  - Files: `src/lib/discovery-intent.ts`, `src/lib/discovery-intent.test.ts`
  - Pre-commit: `npx vitest run src/lib/discovery-intent.test.ts`

- [ ] 6. DiscoveryPanel Refactor into Sub-Components

  **What to do**:
  - Extract the 956-line `DiscoveryPanel.svelte` into a thin orchestrator (~400-600 lines) plus sub-components:
    - `DiscoveryProgress.svelte` — progress bar + message display (extracted from lines ~442-449)
    - `DiscoveryResults.svelte` — results card with selector list + actions (extracted from lines ~452-497)
    - `DiscoveryConfirmation.svelte` — step-by-step confirmation flow (extracted from lines ~500-542)
    - `DiscoverySaveDialog.svelte` — save dialog (extracted from lines ~545-569)
  - The orchestrator keeps state management and action handlers, sub-components receive props + emit events
  - Add a mode selector UI placeholder (tabs or dropdown for 'AI Discover' | 'Guided Form' | 'Chat' | 'Teach by Example') that will be wired in Wave 3

  **Must NOT do**:
  - Change any existing functionality — this is a pure refactor
  - Add new features (those come in Wave 3)
  - Break the existing discover -> confirm -> save flow

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large Svelte component refactor requiring careful state/prop threading across 4 sub-components while preserving all existing behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 17, 18
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/components/grading/DiscoveryPanel.svelte` — The 956-line file to refactor (READ COMPLETELY before starting)
  - `src/components/grading/BatchPanel.svelte` — Example of a well-structured Svelte component with props/events
  - `src/components/grading/ProviderSelector.svelte` — Example of a focused sub-component pattern

  **API/Type References**:
  - `src/lib/discover.ts:74-81` — `DiscoveryResult`, `ValidationResults` types used in state
  - `src/lib/confirmation-flow.ts` — `ConfirmationFlow` state machine used in confirmation phase

  **WHY Each Reference Matters**:
  - `DiscoveryPanel.svelte`: The file being refactored — must understand all state and action handlers before splitting
  - `BatchPanel.svelte`: Shows the established pattern for component composition in this app
  - `confirmation-flow.ts`: The ConfirmationFlow state machine drives the confirmation sub-component

  **Acceptance Criteria**:
  - [ ] DiscoveryPanel.svelte orchestrator is under 600 lines
  - [ ] All 4 sub-components created in `src/components/grading/`
  - [ ] Existing discovery flow works identically (no behavior changes)
  - [ ] Mode selector placeholder UI visible (non-functional)

  **QA Scenarios:**
  ```
  Scenario: Existing discovery flow still works after refactor
    Tool: Playwright (playwright skill)
    Preconditions: Desktop app running in dev mode, test fixture page loaded in webview
    Steps:
      1. Open the app and navigate to the Discover tab in GraderPanel
      2. Click 'Discover Selectors' button
      3. Wait for discovery to complete (progress bar)
      4. Verify results card shows selectors with status icons
      5. Click 'Save as Profile', enter name, click Save
    Expected Result: Full discover->review->save flow works identically to pre-refactor
    Failure Indicators: Missing UI elements, broken state transitions, error messages
    Evidence: .sisyphus/evidence/task-6-discovery-flow-works.png

  Scenario: Mode selector placeholder is visible
    Tool: Playwright (playwright skill)
    Preconditions: Desktop app running
    Steps:
      1. Open Discover tab
      2. Look for mode selector (tabs or dropdown)
    Expected Result: Mode selector UI is visible with options (may be non-functional placeholder)
    Evidence: .sisyphus/evidence/task-6-mode-selector-visible.png
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(discovery): split DiscoveryPanel into orchestrator + sub-components`
  - Files: `src/components/grading/DiscoveryPanel.svelte`, `src/components/grading/DiscoveryProgress.svelte`, `src/components/grading/DiscoveryResults.svelte`, `src/components/grading/DiscoveryConfirmation.svelte`, `src/components/grading/DiscoverySaveDialog.svelte`
  - Pre-commit: `npx vitest run`

- [ ] 7. Test Fixture HTML Files

  **What to do**:
  - Create static HTML files in `tests/fixtures/` that simulate grading pages:
    - `tests/fixtures/batch-grading-simple.html` — 3 students, table layout, score inputs + feedback textareas (MyOpenMath-style)
    - `tests/fixtures/batch-grading-complex.html` — 5 students, div-based layout, contenteditable feedback, hidden sync inputs (TinyMCE-style)
    - `tests/fixtures/sequential-grading.html` — Single student view with next/prev buttons, student indicator, iframe question region
    - `tests/fixtures/unknown-lms.html` — Non-standard layout for testing discovery on unfamiliar pages
  - Each fixture must have realistic DOM structure with proper attributes (ids, names, data- attributes, aria labels)
  - Include enough student data for extraction testing (names, scores, response text)

  **Must NOT do**:
  - Use external dependencies (CDN links, JS frameworks) — pure static HTML
  - Make fixtures larger than needed (3-5 students max)
  - Include any actual student PII — use fake names/data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Static HTML files with realistic DOM structure, no logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `mock-myopenmath-30students.html` (root) — Existing mock page with MyOpenMath structure
  - `test-eval-page.html` (ogre-desktop root) — Existing test HTML page

  **API/Type References**:
  - `src/lib/site-profiles.ts:125-163` — `DEFAULT_MYOPENMATH_PROFILE` — selectors that fixtures must match
  - `src/lib/site-profiles.ts:169-209` — `DEFAULT_CANVAS_SPEEDGRADER_PROFILE` — selectors for sequential fixture

  **WHY Each Reference Matters**:
  - `mock-myopenmath-30students.html`: Model for realistic mock page structure
  - Built-in profiles: Fixtures should use selectors that match these profiles for validation testing

  **Acceptance Criteria**:
  - [ ] 4 HTML fixture files created in `tests/fixtures/`
  - [ ] `batch-grading-simple.html` has 3+ students extractable by MyOpenMath selectors
  - [ ] Each fixture is valid HTML (parseable by JSDOM)

  **QA Scenarios:**
  ```
  Scenario: Batch fixture has extractable students
    Tool: Bash (node/bun REPL)
    Preconditions: Fixture files exist
    Steps:
      1. Load batch-grading-simple.html with JSDOM
      2. querySelectorAll('div[data-lastchange]') (MyOpenMath studentSection selector)
      3. Assert count >= 3
      4. For first section, querySelector('b') and assert it contains a name
    Expected Result: 3+ student sections with extractable names
    Evidence: .sisyphus/evidence/task-7-batch-fixture-students.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(discovery): add HTML test fixtures for grading page simulation`
  - Files: `tests/fixtures/batch-grading-simple.html`, `tests/fixtures/batch-grading-complex.html`, `tests/fixtures/sequential-grading.html`, `tests/fixtures/unknown-lms.html`
  - Pre-commit: None (static files)

---

### Wave 2 — Core Lib Modules

- [ ] 8. Profile Tester: Enhanced Validation + Extraction Simulation (TDD)

  **What to do**:
  - RED: Write comprehensive tests in `profile-tester.test.ts` for: (a) `testSelectorDepth()` — for batch mode, tests relative selectors within studentSection container (e.g., `studentSection.querySelector(studentName)` returns text that looks like a name); for sequential mode, tests page-level selectors; checks writable inputs; verifies feedback areas accept text. (b) `testExtraction()` — given a SiteProfileWithExtraction and live DOM, extracts first 1-2 students as `Student` objects (name, currentScore, response). Tests each ExtractionConfig method (childIndex, iframe, selector). (c) `testProfile()` — runs both selector depth test AND extraction test, returns `ProfileTestReport` with per-field pass/fail + extracted student preview
  - GREEN: Implement all three functions in `profile-tester.ts`. Use `evalScript`/`evalScriptJSON` to run validation scripts in the webview (same pattern as `validateSelectors()` in discover.ts). Build extraction scripts that mirror batch-grader.ts extraction logic but return structured test results instead of modifying the page
  - REFACTOR: Extract shared DOM scripting patterns between profile-tester.ts and discover.ts into helper functions if duplication emerges

  **Must NOT do**:
  - Modify the page DOM during testing (read-only extraction)
  - Duplicate batch-grader.ts logic entirely — reference it but build test-specific scripts
  - Test against live LMS pages — use fixture HTML from Task 7

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex DOM scripting logic, multiple extraction methods, integration with webview eval
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9-13)
  - **Blocks**: Tasks 14, 17, 18
  - **Blocked By**: Tasks 2, 3, 7

  **References**:
  **Pattern References**:
  - `src/lib/discover.ts:746-832` — `buildValidationScript()` and `validateSelectors()` — pattern for running selector tests in webview
  - `src/lib/discover.ts:532-599` — `DOM_SNAPSHOT_SCRIPT` and `captureDomSnapshot()` — pattern for evalScript-based DOM access

  **API/Type References**:
  - `src/lib/batch-grader.ts:22-33` — `Student` interface that extraction simulation should produce
  - `src/lib/batch-grader.ts:150-200` — `BatchConfig` and extraction logic in the batch grader (reference for how students are extracted)
  - `src/lib/site-profiles.ts:39-58` — `ExtractionConfig` that drives which extraction method to use
  - `src/lib/profile-tester.ts` (from Task 3) — Type skeleton to implement

  **Test References**:
  - `src/lib/discover.test.ts` — Existing discovery tests showing how to mock evalScript/evalScriptJSON
  - `tests/fixtures/batch-grading-simple.html` (from Task 7) — Test fixture for batch extraction

  **WHY Each Reference Matters**:
  - `buildValidationScript()`: Shows how to build JS strings that run inside evalScript — same pattern needed for deep testing scripts
  - `Student` interface: Extraction simulation output must match this shape
  - `ExtractionConfig`: Drives which of the 3 response methods and 3 maxScore methods to test
  - Test fixtures: Provide deterministic HTML for reliable testing

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/profile-tester.test.ts` -> ALL tests pass
  - [ ] testSelectorDepth: validates relative selectors, writable inputs, text content analysis
  - [ ] testExtraction: extracts Student objects from mock HTML (name, score, response)
  - [ ] testProfile: returns ProfileTestReport with pass/fail per field + student preview

  **QA Scenarios:**
  ```
  Scenario: Extract students from batch fixture
    Tool: Bash (vitest)
    Preconditions: batch-grading-simple.html fixture loaded
    Steps:
      1. Run testExtraction() with MyOpenMath profile against fixture
      2. Assert result.students.length >= 3
      3. Assert result.students[0].name is a non-empty string
      4. Assert result.students[0].currentScore is defined
    Expected Result: 3+ students extracted with name, score, response fields
    Evidence: .sisyphus/evidence/task-8-extract-students.txt

  Scenario: Deep selector validation catches broken relative selector
    Tool: Bash (vitest)
    Preconditions: Profile with invalid relative selector (e.g., scoreInput: '.nonexistent')
    Steps:
      1. Run testSelectorDepth() with broken selector
      2. Assert scoreInput result shows valid: false with matchCount: 0
    Expected Result: Broken selector flagged as invalid
    Evidence: .sisyphus/evidence/task-8-broken-selector.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): implement profile tester with extraction simulation`
  - Files: `src/lib/profile-tester.ts`, `src/lib/profile-tester.test.ts`
  - Pre-commit: `npx vitest run src/lib/profile-tester.test.ts`

- [ ] 9. Extraction Config Discovery AI Call + Validation (TDD)

  **What to do**:
  - RED: Write tests for: (a) `discoverExtractionConfig()` — makes AI call with DOM snapshot, returns ExtractionConfig, (b) `validateExtractionConfig()` — tests discovered extraction config against live page (e.g., does the regex match actual DOM text?), (c) integration with existing `runDiscovery()` as optional second pass
  - GREEN: Implement `discoverExtractionConfig()` in `extraction-config-discovery.ts`. Makes a separate POST /api/chat call (same pattern as `callDiscoveryAI()`) with `EXTRACTION_CONFIG_SYSTEM_PROMPT` and DOM snapshot (no screenshot needed). Validates extraction config by running test scripts in webview. Optionally integrate as a second step in `runDiscovery()` workflow
  - REFACTOR: Ensure the extraction config AI call reuses `callDiscoveryAI()` or a shared helper for HTTP/auth/SSE handling

  **Must NOT do**:
  - Modify `DISCOVERY_SYSTEM_PROMPT` or the existing selector discovery AI call
  - Make extraction config discovery mandatory in `runDiscovery()` — it should be opt-in
  - Include screenshot in extraction config call (DOM-only is sufficient and saves tokens)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: AI API integration, prompt engineering, DOM validation scripting
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 14, 19
  - **Blocked By**: Tasks 4, 7

  **References**:
  **Pattern References**:
  - `src/lib/discover.ts:644-694` — `callDiscoveryAI()` — HTTP call pattern to reuse for extraction config AI call
  - `src/lib/discover.ts:851-961` — `runDiscovery()` — workflow pattern showing how to integrate optional second pass

  **API/Type References**:
  - `src/lib/extraction-config-discovery.ts` (from Task 4) — Prompt + parser skeleton to implement
  - `src/lib/site-profiles.ts:39-58` — `ExtractionConfig` target type

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/extraction-config-discovery.test.ts` -> ALL tests pass
  - [ ] AI call uses SEPARATE prompt from selector discovery
  - [ ] Extraction config validated against fixture HTML DOM

  **QA Scenarios:**
  ```
  Scenario: Discover extraction config for MyOpenMath-style page
    Tool: Bash (vitest)
    Preconditions: Mock AI response returning childIndex method with regex pattern
    Steps:
      1. Call discoverExtractionConfig() with mock DOM snapshot
      2. Assert result.responseMethod is 'childIndex'
      3. Assert result.maxScoreMethod is 'parentTextRegex'
      4. Assert result.maxScoreRegex is a valid regex string
    Expected Result: ExtractionConfig with correct methods for batch page
    Evidence: .sisyphus/evidence/task-9-extraction-config-mom.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): implement extraction config AI discovery and validation`
  - Files: `src/lib/extraction-config-discovery.ts`, `src/lib/extraction-config-discovery.test.ts`
  - Pre-commit: `npx vitest run src/lib/extraction-config-discovery.test.ts`

- [ ] 10. Discovery Intent: Guided Form Mode (TDD)

  **What to do**:
  - RED: Write tests for `parseFormIntent()`: (a) converts structured form input (checkboxes for what to find + optional text descriptions) into DiscoveryHints, (b) generates enhanced system prompt addendum from hints, (c) produces valid DiscoveryResult by feeding hints into existing `runDiscovery()`
  - GREEN: Implement `parseFormIntent()` in `discovery-intent.ts`. The form mode captures: which elements user wants to find (checkboxes: student names, scores, feedback, responses), optional text descriptions of where things are (e.g., 'names are in the left column'), navigation mode preference (batch/sequential). Converts to DiscoveryHints that augment the AI prompt
  - REFACTOR: Ensure form mode produces same quality results as bare discovery by testing against fixture HTML

  **Must NOT do**:
  - Make AI calls directly — form mode produces DiscoveryHints that feed into `runDiscovery()`
  - Build the UI form (that's Task 17)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt augmentation logic + integration with discovery pipeline
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Task 5

  **References**:
  **Pattern References**:
  - `src/lib/discover.ts:296-328` — `DISCOVERY_USER_PROMPT_TEMPLATE()` — pattern for how user prompts are constructed (hints would augment this)

  **API/Type References**:
  - `src/lib/discovery-intent.ts` (from Task 5) — `FormModeInput`, `DiscoveryHints` types

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/discovery-intent.test.ts` -> form mode tests pass
  - [ ] Form input with all checkboxes produces DiscoveryHints with all fields
  - [ ] Hints augment discovery prompt without breaking selector detection

  **QA Scenarios:**
  ```
  Scenario: Form input produces valid discovery hints
    Tool: Bash (vitest)
    Preconditions: Mock FormModeInput with student names + scores checked
    Steps:
      1. Call parseFormIntent(formInput)
      2. Assert result.requiredSelectors includes 'studentName' and 'scoreInput'
      3. Assert result.promptAddendum is a non-empty string
    Expected Result: DiscoveryHints with correct required selectors and prompt addendum
    Evidence: .sisyphus/evidence/task-10-form-hints.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): implement guided form discovery mode`
  - Files: `src/lib/discovery-intent.ts`, `src/lib/discovery-intent.test.ts`
  - Pre-commit: `npx vitest run src/lib/discovery-intent.test.ts`

- [ ] 11. Discovery Intent: Chat Mode (TDD)

  **What to do**:
  - RED: Write tests for `parseChatIntent()`: (a) parses a sequence of ChatMessage turns into DiscoveryHints, (b) handles user descriptions like 'student names are in bold text in the left column', (c) extracts structured intent from natural language (required selectors, layout hints, navigation mode)
  - GREEN: Implement `parseChatIntent()` and `runChatDiscovery()` in `discovery-intent.ts`. Chat mode uses a short multi-turn conversation: AI asks clarifying questions, user describes what they see, AI builds DiscoveryHints incrementally. Uses the existing agent API endpoint (POST /api/chat) for conversation turns. Limited to 5 turns max. Each turn refines the DiscoveryHints. Final turn triggers `runDiscovery()` with accumulated hints
  - REFACTOR: Extract common hint-building logic shared between chat and form modes

  **Must NOT do**:
  - Build conversation persistence — chat state is ephemeral (lost on page change)
  - Build a general-purpose chat UI — this is discovery-scoped only
  - Exceed 5 conversation turns — force completion after max turns

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-turn AI conversation logic with state accumulation, prompt engineering
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Task 5

  **References**:
  **Pattern References**:
  - `src/lib/agent-loop.ts:46-62` — `pruneHistory()` — conversation history management pattern (for limiting chat context)
  - `src/lib/agent-api.ts` — `sendAgentRequest()` — AI API call pattern with history

  **API/Type References**:
  - `src/lib/discovery-intent.ts` (from Task 5) — `ChatMessage`, `DiscoveryHints` types

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/discovery-intent.test.ts` -> chat mode tests pass
  - [ ] Chat with mock AI responses produces valid DiscoveryHints
  - [ ] Max 5 turns enforced

  **QA Scenarios:**
  ```
  Scenario: Chat conversation produces discovery hints
    Tool: Bash (vitest)
    Preconditions: Mock AI responses for 3-turn conversation
    Steps:
      1. Start chat with user message: 'This is a grading page with students listed in a table'
      2. Feed mock AI clarifying question about score inputs
      3. Feed user response: 'Score inputs are in the third column'
      4. Call parseChatIntent(chatHistory)
      5. Assert hints include layout description and score input location
    Expected Result: DiscoveryHints accumulated from multi-turn conversation
    Evidence: .sisyphus/evidence/task-11-chat-hints.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): implement chat-based discovery mode`
  - Files: `src/lib/discovery-intent.ts`, `src/lib/discovery-intent.test.ts`
  - Pre-commit: `npx vitest run src/lib/discovery-intent.test.ts`

- [ ] 12. Discovery Intent: Example-Based Teaching Mode (TDD)

  **What to do**:
  - RED: Write tests for `parseExampleSelections()`: (a) given a set of ExampleSelection objects (element + user label like 'student name'), generalizes a CSS selector pattern, (b) validates the generalized selector against the page (matches all similar elements, not just the one clicked), (c) handles multiple element types (name, score, feedback) in sequence
  - GREEN: Implement `parseExampleSelections()` and `runExampleDiscovery()` in `discovery-intent.ts`. User clicks 2-3 elements of the same type. For each clicked element, the element picker provides the selector, tag, id, classes, and parent context. System generalizes: if user clicks `tr:nth-child(2) > td.name > b`, system tests `tr > td.name > b` and finds it matches all rows. Builds DiscoveryHints from generalized selectors. Falls back to full AI discovery if generalization is ambiguous
  - REFACTOR: Ensure generalization logic works with both ID-based and class-based selectors

  **Must NOT do**:
  - Build ML models or training pipelines
  - Persist teaching examples beyond the current session
  - Require more than 3 clicks per element type

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: CSS selector generalization algorithm, pattern matching, fallback logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Task 5

  **References**:
  **Pattern References**:
  - `src/lib/element-picker.ts:37-386` — Element picker that provides selector, tagName, id, classes for clicked elements
  - `src/lib/discovery-picker-integration.ts:190-213` — `mergeSelectorSources()` — selector merging pattern to extend for generalization

  **API/Type References**:
  - `src/lib/discovery-intent.ts` (from Task 5) — `ExampleSelection` type
  - `src/lib/element-picker.ts:20-31` — `ElementPickerResult` that feeds into ExampleSelection

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/discovery-intent.test.ts` -> example mode tests pass
  - [ ] Clicking 2 student names generalizes to selector matching all students
  - [ ] Generalized selectors validated against fixture HTML

  **QA Scenarios:**
  ```
  Scenario: Generalize from 2 clicked student names
    Tool: Bash (vitest)
    Preconditions: Mock ExampleSelection objects from two clicked names in batch fixture
    Steps:
      1. Two ExampleSelections: 'tr:nth-child(2) > td > b' (label: 'studentName') and 'tr:nth-child(4) > td > b' (label: 'studentName')
      2. Call parseExampleSelections([sel1, sel2])
      3. Assert generalized selector matches 3+ elements in fixture
    Expected Result: Generalized selector like 'tr > td > b' that matches all student names
    Evidence: .sisyphus/evidence/task-12-example-generalize.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): implement example-based teaching discovery mode`
  - Files: `src/lib/discovery-intent.ts`, `src/lib/discovery-intent.test.ts`
  - Pre-commit: `npx vitest run src/lib/discovery-intent.test.ts`

- [ ] 13. Profile Editor: Merge + Per-Selector Update (TDD)

  **What to do**:
  - RED: Write tests for: (a) `mergeDiscoveryWithProfile()` — given existing profile + new DiscoveryResult, produces merged profile where user can choose per-selector which to keep (old vs new), (b) `updateProfileSelector()` — updates a single selector in a profile (with picker result), (c) `addUrlPattern()` — adds URL patterns to existing profile, (d) handles ExtractionConfig merge (old extraction + new extraction)
  - GREEN: Create `src/lib/profile-editor.ts` with all operations. Merge produces a diff-like structure: `{ key: string, oldValue: string, newValue: string, decision: 'keep-old' | 'use-new' | 'pending' }[]`. Per-selector update wraps the existing picker integration. URL pattern update deduplicates and saves via ProfileStorage
  - REFACTOR: Ensure all operations go through ProfileStorageImpl for persistence

  **Must NOT do**:
  - Build a diff/merge UI (that's Task 18)
  - Implement version history or undo
  - Allow editing built-in profiles (they're isBuiltIn: true)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Profile manipulation logic with merge semantics, storage integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 18
  - **Blocked By**: Task 2

  **References**:
  **Pattern References**:
  - `src/lib/site-profiles.ts:310-375` — `ProfileStorageImpl` — storage CRUD operations to use
  - `src/lib/discovery-picker-integration.ts:328-346` — `applyRefinement()` — pattern for updating selectors in a discovery result

  **API/Type References**:
  - `src/lib/type-mappers.ts` (from Task 2) — `discoveryResultToSiteProfile()` for merge conversion
  - `src/lib/site-profiles.ts:73-119` — `ProfileStorage` interface

  **Acceptance Criteria**:
  - [ ] `src/lib/profile-editor.ts` and `src/lib/profile-editor.test.ts` created
  - [ ] `npx vitest run src/lib/profile-editor.test.ts` -> ALL tests pass
  - [ ] Merge produces diff structure with per-selector decisions
  - [ ] URL pattern deduplication works

  **QA Scenarios:**
  ```
  Scenario: Merge new discovery with existing profile
    Tool: Bash (vitest)
    Preconditions: Existing profile with 5 selectors, new DiscoveryResult with 4 selectors (1 changed, 1 new, 2 same)
    Steps:
      1. Call mergeDiscoveryWithProfile(existingProfile, newDiscoveryResult)
      2. Assert diff has entries for all selectors
      3. Assert changed selector shows old and new values
      4. Assert unchanged selectors show same value for both
    Expected Result: Merge diff with correct old/new values and 'pending' decisions
    Evidence: .sisyphus/evidence/task-13-merge-diff.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discovery): implement profile editor with merge and per-selector update`
  - Files: `src/lib/profile-editor.ts`, `src/lib/profile-editor.test.ts`
  - Pre-commit: `npx vitest run src/lib/profile-editor.test.ts`

---

### Wave 3 — Integration (Agent + UI + Server)

- [ ] 14. Agent Discovery Actions — Extend AgentAction Union

  **What to do**:

  RED:
  - Write tests in `src/lib/agent-discovery-actions.test.ts`:
    - Test `discover_page` action: calls `runDiscovery()` with current page DOM snapshot + screenshot, returns `DiscoveryResult`
    - Test `test_profile` action: calls `ProfileTester.testProfile()` with given profile ID + page context, returns `ProfileTestResult`
    - Test `save_profile` action: calls `ProfileStorageImpl.saveProfile()` with validated profile, returns saved profile ID
    - Test dispatcher routing: `executeAction({type: 'discover_page', ...})` dispatches correctly
    - Test error handling: each action returns structured error on failure (not throw)
  - Tests should mock `runDiscovery`, `ProfileTester`, `ProfileStorageImpl`

  GREEN:
  - In `src/lib/agent-types.ts`:
    - Add to `AgentAction` union: `'discover_page' | 'test_profile' | 'save_profile'`
    - Add corresponding entries to `ActionParams` discriminated union:
      ```
      { type: 'discover_page'; selectors?: string[] } // optional hints
      { type: 'test_profile'; profileId: string; sampleCount?: number }
      { type: 'save_profile'; profile: Partial<SiteProfile>; name: string }
      ```
    - Add to `ActionResult` union for each new action type
  - In `src/lib/browser-actions.ts` → `executeAction()` dispatcher:
    - Add case for `'discover_page'`: capture DOM snapshot via `evalScript()`, capture screenshot via Tauri webview API, call `runDiscovery()`, return parsed result
    - Add case for `'test_profile'`: load profile from storage by ID, call `ProfileTester.testProfile()`, return test results
    - Add case for `'save_profile'`: validate required fields, call `profileStorage.saveProfile()`, return saved ID
  - Each action handler: wrap in try/catch, return `{ success: false, error: string }` on failure

  REFACTOR:
  - Extract common action patterns (capture + process + return) into helper if repetitive
  - Ensure all three actions share consistent error shape

  **Must NOT do**:
  - Do NOT modify any existing agent actions — only ADD new ones
  - Do NOT import Playwriter/browser MCP — these are desktop-only actions using `evalScript()`
  - Do NOT add UI code — this is pure logic layer

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Extends a discriminated union across multiple files with coordinated type changes; requires understanding agent loop architecture
  - **Skills**: [`coding-standards`]
    - `coding-standards`: TypeScript union type patterns and error handling conventions
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant — these are desktop WebView2 actions, not browser automation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 15, 16)
  - **Parallel Group**: Wave 3 (with Tasks 15, 16)
  - **Blocks**: Tasks 15, 17
  - **Blocked By**: Tasks 8 (ProfileTester), 9 (ExtractionConfig)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-types.ts` — `AgentAction` union type (line ~15-30), `ActionParams` discriminated union (line ~32-80), `ActionResult` type. Follow exact pattern for adding new actions.
  - `ogre-desktop/src/lib/browser-actions.ts` → `executeAction()` function — switch/case dispatcher pattern. Each case captures context, calls service, returns result. Follow this exact structure.
  - `ogre-desktop/src/lib/agent-loop.ts:45-100` — How `executeAction()` is called from the agent loop. Shows the contract between agent loop and action dispatcher.

  **API/Type References**:
  - `ogre-desktop/src/lib/discover.ts` → `runDiscovery()` function signature and return type (`DiscoveryResult`)
  - `ogre-desktop/src/lib/profile-tester.ts` (Task 8 output) → `ProfileTester.testProfile()` signature
  - `ogre-desktop/src/lib/site-profiles.ts` → `ProfileStorageImpl.saveProfile()` method, `SiteProfile` type

  **Test References**:
  - `ogre-desktop/src/lib/agent-loop.test.ts` (if exists) — Existing agent test patterns and mock setup
  - Task 7 test fixtures — Mock DOM snapshots and profile data

  **WHY Each Reference Matters**:
  - `agent-types.ts` union: Must extend the EXACT union pattern or TypeScript won't narrow types correctly in the dispatcher
  - `browser-actions.ts` dispatcher: Must follow the same try/catch + result shape or the agent loop will fail to parse responses
  - `discover.ts` / `profile-tester.ts`: These are the actual functions being called — need exact signatures to wire up correctly

  **Acceptance Criteria**:
  - [ ] `AgentAction` type includes `'discover_page' | 'test_profile' | 'save_profile'`
  - [ ] `ActionParams` has matching discriminated entries for all 3 new actions
  - [ ] `executeAction()` handles all 3 new action types without fallthrough
  - [ ] `npx vitest run src/lib/agent-discovery-actions.test.ts` → PASS (all tests)
  - [ ] No TypeScript errors: `npx tsc --noEmit` passes

  **QA Scenarios:**

  ```
  Scenario: Agent dispatches discover_page action
    Tool: Bash (bun/node REPL)
    Preconditions: Mock DOM snapshot and screenshot available; runDiscovery mocked to return fixture result
    Steps:
      1. Import executeAction from browser-actions.ts
      2. Call executeAction({ type: 'discover_page' }) with mocked dependencies
      3. Assert return value has { success: true, result: DiscoveryResult }
      4. Assert runDiscovery was called with DOM snapshot + screenshot args
    Expected Result: Action returns DiscoveryResult with selectors array, no errors
    Failure Indicators: TypeError on action dispatch, missing case error, undefined result
    Evidence: .sisyphus/evidence/task-14-discover-action-dispatch.txt

  Scenario: Agent action returns structured error on failure
    Tool: Bash (bun/node REPL)
    Preconditions: runDiscovery mocked to throw Error('AI call failed')
    Steps:
      1. Call executeAction({ type: 'discover_page' })
      2. Assert return value has { success: false, error: 'AI call failed' }
      3. Assert no unhandled exception propagated
    Expected Result: Structured error response, not thrown exception
    Failure Indicators: Unhandled exception, process crash, missing error field
    Evidence: .sisyphus/evidence/task-14-discover-action-error.txt
  ```

  **Commit**: YES (group with 15)
  - Message: `feat(agent): add discovery, test, and save profile actions to agent system`
  - Files: `src/lib/agent-types.ts`, `src/lib/browser-actions.ts`, `src/lib/agent-discovery-actions.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-discovery-actions.test.ts`

- [ ] 15. Agent Prompt Update — Discovery Action Descriptions

  **What to do**:

  RED:
  - Write tests in `src/lib/agent-prompt.test.ts`:
    - Test that `AGENT_SYSTEM_PROMPT` contains description for `discover_page` action
    - Test that `AGENT_SYSTEM_PROMPT` contains description for `test_profile` action
    - Test that `AGENT_SYSTEM_PROMPT` contains description for `save_profile` action
    - Test that action descriptions include parameter documentation
    - Test prompt doesn't exceed reasonable token count (stays under 4000 tokens)

  GREEN:
  - In `src/lib/agent-prompt.ts` → `AGENT_SYSTEM_PROMPT`:
    - Add `discover_page` action description:
      ```
      discover_page: Analyze the current page to find grading selectors. Use when user asks to set up a new grading page or wants to find where student names, scores, and feedback are located. Returns a profile with CSS selectors for each field. Optional param: selectors[] - hints about what to look for.
      ```
    - Add `test_profile` action description:
      ```
      test_profile: Test an existing profile against the current page. Use when user wants to verify a profile still works or after page changes. Extracts sample students using the profile and reports which selectors succeeded/failed. Param: profileId (required), sampleCount (optional, default 3).
      ```
    - Add `save_profile` action description:
      ```
      save_profile: Save a discovered or modified profile for future use. Use after discover_page succeeds or after user confirms selector edits. Param: profile (the profile data), name (human-readable name).
      ```
  - Descriptions should teach the agent WHEN to use each action (not just WHAT it does)
  - Include example user phrases that should trigger each action

  REFACTOR:
  - Organize action descriptions by category (navigation, grading, discovery) if the prompt is getting long

  **Must NOT do**:
  - Do NOT rewrite existing action descriptions — only ADD new ones
  - Do NOT change the prompt structure/format
  - Do NOT add implementation details to the prompt (the agent doesn't need to know about ProfileTester internals)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change adding text descriptions to an existing prompt template
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Not needed for prompt text editing

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 14 for action names)
  - **Parallel Group**: Sequential after Task 14
  - **Blocks**: None directly (but agents can't USE actions without this prompt update)
  - **Blocked By**: Task 14 (needs final action names/params)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/agent-prompt.ts` — `AGENT_SYSTEM_PROMPT` constant. Shows how existing actions (click, type, scroll, etc.) are documented. Follow the EXACT same format for new actions.
  - `ogre-desktop/src/lib/agent-types.ts` — Final `ActionParams` definitions from Task 14. Use these as the source of truth for parameter documentation.

  **WHY Each Reference Matters**:
  - `agent-prompt.ts` existing format: The AI model expects consistent action documentation format. Deviating will confuse the agent.
  - `agent-types.ts` params: Prompt must match actual params exactly or agent will send wrong parameters.

  **Acceptance Criteria**:
  - [ ] `AGENT_SYSTEM_PROMPT` contains descriptions for all 3 discovery actions
  - [ ] Each description includes: action name, when to use, parameters with types
  - [ ] `npx vitest run src/lib/agent-prompt.test.ts` → PASS
  - [ ] Prompt total token count stays under 4000 tokens

  **QA Scenarios:**

  ```
  Scenario: Agent prompt includes discovery action docs
    Tool: Bash (node REPL)
    Preconditions: agent-prompt.ts updated with new action descriptions
    Steps:
      1. Import AGENT_SYSTEM_PROMPT from agent-prompt.ts
      2. Assert AGENT_SYSTEM_PROMPT.includes('discover_page')
      3. Assert AGENT_SYSTEM_PROMPT.includes('test_profile')
      4. Assert AGENT_SYSTEM_PROMPT.includes('save_profile')
      5. Assert AGENT_SYSTEM_PROMPT.includes('profileId') (parameter doc)
    Expected Result: All 3 action names and key params found in prompt string
    Failure Indicators: Any includes() returns false
    Evidence: .sisyphus/evidence/task-15-prompt-contains-actions.txt

  Scenario: Prompt stays within token budget
    Tool: Bash (node REPL)
    Preconditions: agent-prompt.ts updated
    Steps:
      1. Import AGENT_SYSTEM_PROMPT
      2. Count words: AGENT_SYSTEM_PROMPT.split(/\s+/).length
      3. Assert word count < 3000 (rough proxy for 4000 tokens)
    Expected Result: Word count under 3000
    Failure Indicators: Word count exceeds 3000
    Evidence: .sisyphus/evidence/task-15-prompt-token-budget.txt
  ```

  **Commit**: YES (group with 14)
  - Message: `feat(agent): add discovery action descriptions to agent system prompt`
  - Files: `src/lib/agent-prompt.ts`, `src/lib/agent-prompt.test.ts`
  - Pre-commit: `npx vitest run src/lib/agent-prompt.test.ts`

- [ ] 16. Server Endpoints for /grade Skill — Profile API

  **What to do**:

  RED:
  - Write tests in `src/lib/grading-server-profiles.test.ts`:
    - Test `GET /api/profiles` returns array of all saved profiles (id, name, urlPattern, createdAt)
    - Test `GET /api/profiles/:id` returns full profile with selectors + extraction config
    - Test `GET /api/profiles/:id` with invalid ID returns 404 with `{ error: 'Profile not found' }`
    - Test `GET /api/profiles/match?url=X` returns best-matching profile for given URL (uses `matchProfile()` logic)
    - Test `GET /api/profiles/match?url=X` with no match returns 404 with `{ error: 'No matching profile' }`
    - Test all endpoints require valid handshake token in `Authorization` header
    - Test requests without token return 401

  GREEN:
  - In grading server (`src/lib/server.ts` — the HTTP server setup):
    - Add route `GET /api/profiles`:
      - Read token from `Authorization: Bearer <token>` header
      - Validate token matches current handshake token
      - Call `profileStorage.getAllProfiles()`
      - Return JSON array of profile summaries (id, name, urlPattern, createdAt — NOT full selectors)
    - Add route `GET /api/profiles/:id`:
      - Auth check same as above
      - Call `profileStorage.getProfile(id)`
      - If null → 404 `{ error: 'Profile not found' }`
      - Else → return full profile JSON including selectors and extraction config
    - Add route `GET /api/profiles/match`:
      - Auth check
      - Read `url` query param
      - Call `profileStorage.matchProfile(url)` (existing method that matches URL patterns)
      - If null → 404 `{ error: 'No matching profile' }`
      - Else → return full profile JSON
  - All endpoints: read-only (GET only), no mutations via API
  - All endpoints: return proper `Content-Type: application/json`

  REFACTOR:
  - Extract auth middleware function if token check is repeated across routes

  **Must NOT do**:
  - Do NOT add mutation endpoints (POST, PUT, DELETE) — profiles are managed from desktop UI only
  - Do NOT expose internal database IDs or implementation details
  - Do NOT add CORS headers (server runs on localhost, same-origin)
  - Do NOT add endpoints for built-in profiles — only user-saved profiles

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: HTTP server route addition with auth, serialization, and error handling. Not trivially simple but follows existing patterns.
  - **Skills**: [`coding-standards`]
    - `coding-standards`: REST API patterns, error response conventions
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — these are server-side routes, tested with curl/fetch

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15)
  - **Parallel Group**: Wave 3 (with Tasks 14, 15)
  - **Blocks**: None directly (the /grade skill already knows how to fetch)
  - **Blocked By**: Task 2 (type mappers — needs serialization helpers for SiteProfile → JSON)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/server.ts` — The grading server HTTP routes. Existing route patterns, middleware setup, how the handshake token is validated. Follow this exact pattern.
  - `ogre-desktop/src/lib/site-profiles.ts` → `ProfileStorageImpl.getAllProfiles()`, `getProfile(id)`, `matchProfile(url)` — Exact methods to call from route handlers

  **API/Type References**:
  - `ogre-desktop/src/lib/site-profiles.ts` → `SiteProfile` type, `serializeProfile()` function — Use for JSON serialization
  - Task 2 output → type mapper functions for converting internal types to API-safe JSON

  **External References**:
  - `/grade` skill markdown (`SETUP.md` or `.claude/commands/grade.md`) — Shows how the /grade skill currently calls the grading server. New endpoints should follow the same auth pattern.

  **WHY Each Reference Matters**:
  - `server.ts` route pattern: Must match existing middleware chain (token auth, error handling) or requests will be rejected
  - `ProfileStorageImpl` methods: These are the exact DB access methods — need correct signatures and return types
  - `/grade` skill: The consumer of these endpoints — must return data in a format the skill can parse

  **Acceptance Criteria**:
  - [ ] `GET /api/profiles` returns JSON array of profile summaries
  - [ ] `GET /api/profiles/:id` returns full profile or 404
  - [ ] `GET /api/profiles/match?url=X` returns matching profile or 404
  - [ ] All endpoints return 401 without valid auth token
  - [ ] `npx vitest run src/lib/grading-server-profiles.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: List profiles via API
    Tool: Bash (curl)
    Preconditions: Grading server running on localhost:3456, at least 1 saved profile exists, valid handshake token available
    Steps:
      1. curl -s -H 'Authorization: Bearer <token>' http://localhost:3456/api/profiles
      2. Parse JSON response
      3. Assert response is array with length >= 1
      4. Assert each element has keys: id, name, urlPattern, createdAt
      5. Assert NO element has 'selectors' key (summary only)
    Expected Result: 200 OK, JSON array of profile summaries without full selector data
    Failure Indicators: 500 error, empty array when profiles exist, selectors leaked in summary
    Evidence: .sisyphus/evidence/task-16-list-profiles.txt

  Scenario: Auth required for profile API
    Tool: Bash (curl)
    Preconditions: Grading server running
    Steps:
      1. curl -s -o /dev/null -w '%{http_code}' http://localhost:3456/api/profiles (no auth header)
      2. Assert HTTP status is 401
      3. curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer invalid-token' http://localhost:3456/api/profiles
      4. Assert HTTP status is 401
    Expected Result: 401 Unauthorized for missing and invalid tokens
    Failure Indicators: 200 OK without auth (security vulnerability), 500 error
    Evidence: .sisyphus/evidence/task-16-auth-required.txt

  Scenario: Match profile by URL
    Tool: Bash (curl)
    Preconditions: Profile saved with urlPattern matching 'myopenmath.com/gradeallq2.php'
    Steps:
      1. curl -s -H 'Authorization: Bearer <token>' 'http://localhost:3456/api/profiles/match?url=https://www.myopenmath.com/gradeallq2.php?cid=123'
      2. Parse JSON response
      3. Assert response has 'id', 'name', 'selectors' keys
      4. Assert selectors has 'studentName', 'studentScore' etc.
    Expected Result: 200 OK with full matching profile including selectors
    Failure Indicators: 404 when match should exist, wrong profile returned, missing selectors
    Evidence: .sisyphus/evidence/task-16-match-profile.txt
  ```

  **Commit**: YES
  - Message: `feat(server): add read-only profile API endpoints for /grade skill`
  - Files: `src/lib/server.ts`, `src/lib/grading-server-profiles.test.ts`
  - Pre-commit: `npx vitest run src/lib/grading-server-profiles.test.ts`

- [ ] 17. DiscoveryPanel UI — Testing Results + Intent Mode Selector + ExtractionConfig Display

  **What to do**:

  RED:
  - Write component tests in `src/components/grading/DiscoveryPanel.test.ts` (or `.svelte.test.ts` if using Svelte testing):
    - Test: intent mode selector renders 3 options (Form, Chat, Example)
    - Test: selecting a mode shows the correct sub-component
    - Test: discovery results panel shows testing status (pending/pass/fail per selector)
    - Test: extraction config section displays discovered config with override dropdowns
    - Test: "Run Tests" button triggers profile tester and updates results display

  GREEN:
  - In `src/components/grading/DiscoveryPanel.svelte` (the refactored orchestrator from Task 6):
    - Add **intent mode selector** UI:
      - Three toggle buttons/tabs: 📝 Form | 💬 Chat | 🎯 Example
      - Selected mode renders the corresponding sub-component:
        - Form → `<DiscoveryFormMode />` (Task 11)
        - Chat → `<DiscoveryChatMode />` (Task 12)
        - Example → `<DiscoveryExampleMode />` (Task 13 — element picker teaching)
      - Persist selected mode in component state (default: Form)
    - Add **testing results display** section:
      - After discovery completes, show per-selector test results from `ProfileTester`:
        - Green checkmark + count for selectors that found elements
        - Red X + details for selectors that failed (no elements, wrong count, etc.)
        - Overall confidence score (from `ProfileTestResult.overallScore`)
      - "Re-test" button to run `ProfileTester.testProfile()` again
    - Add **extraction config display** section:
      - Show discovered `ExtractionConfig` values (responseMethod, maxScoreMethod, etc.)
      - Dropdowns to override each config value (populated from ExtractionConfig type's allowed values)
      - "Auto-detect" button to re-run extraction config discovery (Task 9)
    - Wire up the discovery flow:
      - Mode sub-component produces intent/selectors → run discovery → auto-test results → show results + config

  REFACTOR:
  - Ensure orchestrator stays under 250 lines (delegates to sub-components)
  - Use consistent Svelte 5 `$state` / `$derived` patterns

  **Must NOT do**:
  - Do NOT put discovery logic IN the component — call imported functions
  - Do NOT duplicate ProfileTester or ExtractionConfig logic — import from Task 8/9 modules
  - Do NOT exceed 250 lines in the orchestrator — if growing, extract more sub-components
  - Do NOT break existing "Quick Discover" one-click flow — it should still work as default Form mode

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Svelte 5 UI component work with layout, state management, and visual test result display
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI/UX patterns for mode selectors, test result visualization, status indicators
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for component implementation (QA uses it, but the agent implements UI, not tests)

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 18, 19)
  - **Parallel Group**: Wave 3b (with Tasks 18, 19 — after 14-16 complete)
  - **Blocks**: Task 19 (ExtractionConfig UI depends on this panel being wired)
  - **Blocked By**: Tasks 6 (refactored DiscoveryPanel), 8 (ProfileTester), 10 (ExtractionConfig engine), 11 (FormMode), 12 (ChatMode)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` — The refactored orchestrator from Task 6. This is the file being modified. Must stay under 250 lines.
  - `ogre-desktop/src/components/grading/ProfileManager.svelte` — Existing panel with similar layout patterns (tabs, status indicators). Follow same styling conventions.

  **API/Type References**:
  - Task 3 output → `ProfileTester` class, `ProfileTestResult` type with `overallScore`, per-selector results
  - Task 5 output → `DiscoveryIntent` type with mode discriminant (form/chat/example)
  - Task 9 output → `ExtractionConfig` type, `discoverExtractionConfig()` function
  - Task 11/12/13 outputs → `<DiscoveryFormMode />`, `<DiscoveryChatMode />`, `<DiscoveryExampleMode />` sub-components

  **WHY Each Reference Matters**:
  - Refactored DiscoveryPanel: This is the TARGET file — agent must understand its current structure before adding features
  - ProfileManager patterns: Consistent UI style across grading panels
  - Sub-component contracts: Must wire up the correct props and events for each mode component

  **Acceptance Criteria**:
  - [ ] Intent mode selector renders 3 options with correct icons/labels
  - [ ] Selecting each mode renders the corresponding sub-component
  - [ ] Test results display shows per-selector pass/fail after discovery
  - [ ] Extraction config section shows discovered values with override dropdowns
  - [ ] Orchestrator file stays under 250 lines
  - [ ] `npx vitest run src/components/grading/DiscoveryPanel.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Mode selector switches between discovery modes
    Tool: Playwright (via desktop webview or component test)
    Preconditions: App running, GraderPanel open, Discover tab active
    Steps:
      1. Locate mode selector with 3 buttons: '[data-mode="form"]', '[data-mode="chat"]', '[data-mode="example"]'
      2. Assert 'form' mode is active by default (has .active class)
      3. Click '[data-mode="chat"]'
      4. Assert chat mode sub-component is visible (selector: '.discovery-chat-mode')
      5. Assert form mode sub-component is NOT visible
      6. Click '[data-mode="example"]'
      7. Assert example mode sub-component is visible (selector: '.discovery-example-mode')
    Expected Result: Each mode click swaps the visible sub-component; only one visible at a time
    Failure Indicators: Multiple modes visible simultaneously, no mode change on click, missing sub-component
    Evidence: .sisyphus/evidence/task-17-mode-selector.png

  Scenario: Test results display after discovery
    Tool: Playwright
    Preconditions: App running, on a page with known selectors (e.g., MyOpenMath grading page)
    Steps:
      1. Click 'Quick Discover' button (form mode default)
      2. Wait for discovery to complete (spinner disappears, results appear)
      3. Locate test results section: '.discovery-test-results'
      4. Assert at least one selector row exists: '.selector-result'
      5. Assert each row has either '.pass' (green check) or '.fail' (red X) indicator
      6. Locate overall confidence score: '.confidence-score'
      7. Assert score is a number between 0 and 100
    Expected Result: Per-selector results visible with pass/fail status and overall confidence score
    Failure Indicators: No test results section, missing pass/fail indicators, score outside 0-100 range
    Evidence: .sisyphus/evidence/task-17-test-results-display.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add intent mode selector, test results display, and extraction config to DiscoveryPanel`
  - Files: `src/components/grading/DiscoveryPanel.svelte`, `src/components/grading/DiscoveryPanel.test.ts`
  - Pre-commit: `npx vitest run src/components/grading/DiscoveryPanel.test.ts`

- [ ] 18. ProfileManager UI — Re-Discover, Per-Selector Edit, Test Button

  **What to do**:

  RED:
  - Write component tests in `src/components/grading/ProfileManager.test.ts`:
    - Test: profile detail view shows "Re-discover" button
    - Test: clicking "Re-discover" triggers re-discovery flow and shows merge diff
    - Test: each selector row has an "Edit" button that opens the element picker
    - Test: element picker selection updates the selector value in-place
    - Test: "Test Profile" button runs ProfileTester and shows results inline
    - Test: test results show pass/fail per selector with extracted sample data

  GREEN:
  - In `src/components/grading/ProfileManager.svelte`:
    - Add **"Re-discover" button** to profile detail view:
      - Triggers `runDiscovery()` on the currently loaded page
      - Shows merge diff: side-by-side comparison of current selectors vs newly discovered
      - "Accept All" / "Accept Selected" / "Cancel" buttons for selective merge
      - Uses existing `runDiscovery()` from `discover.ts`
    - Add **per-selector edit with element picker**:
      - Each selector row (studentName, studentScore, etc.) gets an "Edit 🎯" button
      - Clicking "Edit" activates element picker overlay (from `element-picker.ts`)
      - User clicks an element on the page → picker returns CSS selector
      - Selector value updates in-place in the profile
      - Visual feedback: green flash on updated row, "unsaved" badge on profile
    - Add **"Test Profile" button**:
      - Calls `ProfileTester.testProfile(profileId)` against current page
      - Shows results inline in the profile detail view:
        - Per-selector: pass/fail icon, element count found, sample text extracted
        - Overall: confidence score, "Ready to Grade" / "Needs Fixes" status
      - If test fails: highlight failing selectors in red, suggest "Edit" to fix
    - Add **"Save Changes" button** (visible when edits are unsaved):
      - Persists modified selectors to DB via `profileStorage.updateProfile()`

  REFACTOR:
  - Extract inline test result display into `<ProfileTestResults />` sub-component if it exceeds 80 lines

  **Must NOT do**:
  - Do NOT allow deleting built-in profiles — only user profiles
  - Do NOT auto-save selector edits — require explicit "Save Changes"
  - Do NOT modify the profile list/grid view — only enhance the detail view
  - Do NOT duplicate element picker logic — import from `element-picker.ts` / `discovery-picker-integration.ts`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex Svelte UI work with element picker integration, merge diff view, and inline test results
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI patterns for inline editing, merge diffs, test result visualization
  - **Skills Evaluated but Omitted**:
    - `playwright`: Implementation task, not testing task

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 19)
  - **Parallel Group**: Wave 3b (with Tasks 17, 19)
  - **Blocks**: None
  - **Blocked By**: Tasks 6 (refactored panels), 8 (ProfileTester), 13 (element picker teaching pattern for reference)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/ProfileManager.svelte` — The file being modified. Current structure: profile list + detail view + CRUD operations. ~393 lines.
  - `ogre-desktop/src/lib/discovery-picker-integration.ts` — Existing element picker + discovery integration. Shows how to activate picker, receive selection, convert to CSS selector. Reuse this pattern for per-selector editing.
  - `ogre-desktop/src/lib/element-picker.ts` — Element picker overlay implementation. Shows API for activating/deactivating picker and receiving selections.

  **API/Type References**:
  - `ogre-desktop/src/lib/discover.ts` → `runDiscovery()` — Function to call for re-discovery
  - Task 8 output → `ProfileTester.testProfile()` — Returns per-selector test results
  - `ogre-desktop/src/lib/site-profiles.ts` → `ProfileStorageImpl.updateProfile()` — For persisting selector edits

  **WHY Each Reference Matters**:
  - `ProfileManager.svelte` current structure: Must understand existing layout before adding features
  - `discovery-picker-integration.ts`: Exact pattern for wiring element picker selections to selector values
  - `ProfileTester`: Test results shape determines the inline display format

  **Acceptance Criteria**:
  - [ ] "Re-discover" button visible in profile detail view
  - [ ] Re-discovery shows merge diff with accept/cancel options
  - [ ] Each selector row has "Edit" button that activates element picker
  - [ ] Element picker selection updates selector in-place
  - [ ] "Test Profile" button shows per-selector pass/fail results
  - [ ] "Save Changes" button appears when edits are unsaved
  - [ ] `npx vitest run src/components/grading/ProfileManager.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Test profile and view results inline
    Tool: Playwright
    Preconditions: App running, ProfileManager open, at least 1 saved profile, target page loaded in webview
    Steps:
      1. Select a profile from the list
      2. Locate and click 'Test Profile' button: 'button:has-text("Test Profile")'
      3. Wait for test to complete: '.profile-test-results' becomes visible (timeout: 15s)
      4. Assert at least 3 selector result rows exist: '.selector-result' count >= 3
      5. Assert each row has status icon: '.pass-icon' or '.fail-icon'
      6. Assert overall status shown: '.test-status' contains either 'Ready to Grade' or 'Needs Fixes'
    Expected Result: Inline test results with per-selector pass/fail and overall readiness status
    Failure Indicators: No results after 15s, missing status icons, no overall status
    Evidence: .sisyphus/evidence/task-18-test-profile-results.png

  Scenario: Edit selector via element picker
    Tool: Playwright
    Preconditions: App running, profile detail view open, target page loaded
    Steps:
      1. Locate first selector row: '.selector-row:first-child'
      2. Note current selector value: read text from '.selector-value'
      3. Click 'Edit' button on that row: '.selector-row:first-child button:has-text("Edit")'
      4. Assert element picker overlay appears on webview: '.element-picker-overlay' visible
      5. Click a DOM element on the page (simulate picker selection)
      6. Assert selector value changed: '.selector-value' text differs from step 2
      7. Assert 'Save Changes' button appears: 'button:has-text("Save Changes")' visible
    Expected Result: Picker activates, selection updates selector value, unsaved indicator appears
    Failure Indicators: Picker doesn't activate, value doesn't change, no save button
    Evidence: .sisyphus/evidence/task-18-edit-selector-picker.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add re-discover, per-selector edit, and test button to ProfileManager`
  - Files: `src/components/grading/ProfileManager.svelte`, `src/components/grading/ProfileManager.test.ts`
  - Pre-commit: `npx vitest run src/components/grading/ProfileManager.test.ts`

- [ ] 19. ExtractionConfig UI — Display and Override Controls

  **What to do**:

  RED:
  - Write component tests in `src/components/grading/ExtractionConfigPanel.test.ts`:
    - Test: renders discovered config values (responseMethod, maxScoreMethod, etc.)
    - Test: dropdown for responseMethod shows all valid options from ExtractionConfig type
    - Test: changing dropdown fires update event with new config
    - Test: "Auto-detect" button triggers `discoverExtractionConfig()` and refreshes display
    - Test: renders placeholder/default state when no config discovered yet

  GREEN:
  - Create `src/components/grading/ExtractionConfigPanel.svelte`:
    - **Display section**:
      - Show each ExtractionConfig field with label and current value:
        - `responseMethod`: How student responses are extracted (e.g., "input_value", "cell_text")
        - `maxScoreMethod`: How max scores are determined (e.g., "header_parse", "rubric_total")
        - Each field shows: label, current value, confidence indicator from auto-detection
    - **Override dropdowns**:
      - Each field has a dropdown populated from the ExtractionConfig type's valid values
      - Selecting a value overrides auto-detected value
      - Visual indicator: "Auto-detected" badge vs "Manual override" badge
    - **Auto-detect button**:
      - Calls `discoverExtractionConfig()` (Task 9 module)
      - Shows spinner during detection
      - Refreshes display with new values, clears manual overrides
    - **Props interface**:
      - `config: ExtractionConfig | null` (current config)
      - `onUpdate: (config: ExtractionConfig) => void` (callback for changes)
      - `onAutoDetect: () => Promise<ExtractionConfig>` (callback for re-detection)
  - Wire into DiscoveryPanel (Task 17) via the extraction config section slot

  REFACTOR:
  - Keep component under 150 lines — it's a sub-component of DiscoveryPanel

  **Must NOT do**:
  - Do NOT hardcode config field names — derive from ExtractionConfig type definition
  - Do NOT persist config changes directly — emit events, let parent handle storage
  - Do NOT add this to ProfileManager — it lives in DiscoveryPanel's config section

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Svelte sub-component with dropdowns, badges, and reactive state
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dropdown patterns, override/auto-detect UX, status badges
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Simple component, doesn't need extensive code review patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 17, 18)
  - **Parallel Group**: Wave 3b (with Tasks 17, 18)
  - **Blocks**: None
  - **Blocked By**: Tasks 9 (ExtractionConfig discovery engine), 17 (DiscoveryPanel provides the mount point)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` (Task 6/17 output) — Parent component that mounts this sub-component. Check the slot/section where ExtractionConfig UI is expected.
  - Other sub-components from Task 6 refactor — Follow same prop interface pattern, event dispatch convention, and styling.

  **API/Type References**:
  - `ogre-desktop/src/lib/site-profiles.ts` → `ExtractionConfig` type definition — All fields and their valid values. This is the source of truth for dropdown options.
  - Task 9 output → `discoverExtractionConfig()` function signature and return type

  **WHY Each Reference Matters**:
  - `ExtractionConfig` type: Dropdown options MUST match the type's valid values exactly, or saved configs will cause runtime errors
  - Task 6 sub-component pattern: Consistent component architecture across the refactored DiscoveryPanel

  **Acceptance Criteria**:
  - [ ] Component renders all ExtractionConfig fields with labels and values
  - [ ] Each field has a dropdown with valid options from ExtractionConfig type
  - [ ] Override dropdowns emit update events with correct config shape
  - [ ] "Auto-detect" button triggers re-detection and refreshes display
  - [ ] Component stays under 150 lines
  - [ ] `npx vitest run src/components/grading/ExtractionConfigPanel.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Display and override extraction config
    Tool: Playwright
    Preconditions: App running, DiscoveryPanel open, discovery completed with ExtractionConfig auto-detected
    Steps:
      1. Locate extraction config section: '.extraction-config-panel'
      2. Assert responseMethod field visible: '.config-field[data-field="responseMethod"]'
      3. Assert responseMethod has 'Auto-detected' badge: '.auto-badge'
      4. Open responseMethod dropdown: click 'select[data-field="responseMethod"]'
      5. Select a different value (e.g., 'cell_text')
      6. Assert badge changes to 'Manual override': '.manual-badge'
      7. Assert the new value is reflected in the display
    Expected Result: Config fields visible, dropdowns functional, badge updates on override
    Failure Indicators: Missing config fields, dropdown empty, badge doesn't change
    Evidence: .sisyphus/evidence/task-19-config-override.png

  Scenario: Auto-detect refreshes config
    Tool: Playwright
    Preconditions: App running, DiscoveryPanel open, some fields manually overridden
    Steps:
      1. Click 'Auto-detect' button: 'button:has-text("Auto-detect")'
      2. Assert spinner appears: '.detection-spinner' visible
      3. Wait for detection to complete (spinner disappears, timeout: 15s)
      4. Assert all fields show 'Auto-detected' badge (manual overrides cleared)
      5. Assert field values may have changed from previous state
    Expected Result: Re-detection runs, refreshes values, clears manual overrides
    Failure Indicators: Spinner hangs, overrides not cleared, values unchanged when they should change
    Evidence: .sisyphus/evidence/task-19-auto-detect.png
  ```

  **Commit**: YES (group with 17)
  - Message: `feat(ui): add ExtractionConfig display panel with auto-detect and override controls`
  - Files: `src/components/grading/ExtractionConfigPanel.svelte`, `src/components/grading/ExtractionConfigPanel.test.ts`
  - Pre-commit: `npx vitest run src/components/grading/ExtractionConfigPanel.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection -> fix -> re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` + check for type errors. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify DiscoveryPanel.svelte orchestrator is under 600 lines.
  Output: `Tests [N pass/N fail] | Type Errors [N] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start the desktop app. Navigate to test fixture HTML pages. Run full discovery in each mode. Test profile saving, editing, re-discovery. Verify agent can call discover_page. Curl the /api/profiles endpoints. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 match. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes. Verify no general chat UI, no ML training, no CRUD API, no new tabs.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(discovery): add extraction column migration and type foundation` — lib.rs, type-mappers.ts, site-profiles.ts, profile-tester.ts (skeleton), extraction-config-discovery.ts (skeleton), discovery-intent.ts (types), DiscoveryPanel refactor
- **Wave 2**: `feat(discovery): implement profile tester, extraction config, intent modes, profile editor` — profile-tester.ts, extraction-config-discovery.ts, discovery-intent.ts, profile-editor.ts + all test files
- **Wave 3**: `feat(discovery): integrate agent actions, server endpoints, and UI enhancements` — agent-types.ts, browser-actions.ts, agent-prompt.ts, server routes, DiscoveryPanel.svelte, ProfileManager.svelte, sub-components
- **Final**: `test(discovery): final QA verification and evidence` — test results, evidence files

---

## Success Criteria

### Verification Commands
```bash
npx vitest run                                    # Expected: ALL tests pass
npx vitest run src/lib/profile-tester.test.ts     # Expected: extraction simulation tests pass
npx vitest run src/lib/extraction-config-discovery.test.ts  # Expected: config detection tests pass
npx vitest run src/lib/discovery-intent.test.ts   # Expected: all three mode tests pass
npx vitest run src/lib/profile-editor.test.ts     # Expected: merge + update tests pass
npx vitest run src/lib/type-mappers.test.ts       # Expected: round-trip conversion tests pass
npx vitest run src/lib/site-profiles.test.ts      # Expected: extraction serialization tests pass
curl http://localhost:3456/api/profiles            # Expected: 200 with profile array
curl http://localhost:3456/api/profiles/myopenmath # Expected: 200 with MyOpenMath profile
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (vitest)
- [ ] DB migration backward compatible
- [ ] DiscoveryPanel orchestrator under 600 lines
- [ ] No `as any` casts in new code
- [ ] All three interaction modes functional
- [ ] Agent actions registered and functional
- [ ] /grade skill can fetch profiles via HTTP
