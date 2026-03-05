# O.G.R.E Desktop App — Code Simplification & UX Flow Optimization

## TL;DR

> **Quick Summary**: Split monolithic components (Settings 1,460 lines, BatchPanel 2,389 lines), wire the existing `oauth.ts` module into Settings & SetupWizard (replacing duplicated inline logic), reorganize the sidebar for non-technical teachers, add Dashboard CTAs, rename developer-facing labels, and migrate touched files from Svelte 4 to Svelte 5 runes — all under TDD.
> 
> **Deliverables**:
> - `src/lib/oauth.ts` — Existing OAuth module (635 lines), now tested and wired into both Settings & SetupWizard (replacing inline duplicates)
> - `src/pages/settings/` — Settings split into 5 focused sub-components
> - `src/components/grading/batch/` — BatchPanel split into 4 focused sub-components
> - `src/components/icons/` — Extracted sidebar icon components
> - Reorganized sidebar with Primary / Tools / System groups
> - Dashboard with 3 CTAs (Grade Now, Recent History, Quick Setup)
> - Renamed labels (Site Profiles → Site Templates, Skills → AI Skills, etc.)
> - Svelte 5 runes migration for all touched files (App, Dashboard, Settings sub-components)
> - Test suite for all extracted `.ts` modules
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves + final verification
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 7 → Task 11 → Final

---

## Context

### Original Request
"Use the code-simplifier skill first, then review the organization and layout of the desktop app and suggest ways to optimize the flow and non-technical user experience."

### Interview Summary
**Key Discussions**:
- **Focus**: Both code simplification AND UX flow optimization (user chose "Both")
- **UX Scope**: Reorganize — keep existing pages, restructure sidebar hierarchy, improve Dashboard, rename labels (user chose "Reorganize")
- **Svelte Migration**: Touch-only — only migrate files we're already modifying (user chose "Touch only what we change")
- **Test Strategy**: TDD — write tests first, then implement (user chose "TDD")

**Research Findings**:
- Settings.svelte (1,460 lines) contains 5 distinct concerns: theme, providers+OAuth, credentials, embedding, column visibility
- OAuth flow is duplicated between Settings.svelte and SetupWizard.svelte (handleOAuthSignIn, handleDeviceFlow, cancelAuth, fetchModels)
- BatchPanel.svelte (2,389 lines) is the largest file — already uses Svelte 5 runes
- GradingPanel.svelte (599 lines) already uses Svelte 5 runes
- Dashboard is a dead end — 3 stats, 2 health dots, no CTAs
- 8 sidebar items all at same visual weight — cognitive overload for teachers
- Labels like "Site Profiles", "Skills", "Logs" are developer-facing, not teacher-friendly
- No component testing infrastructure — TDD applies to `.ts` logic modules only
- State management uses props drilling + SQLite + DOM events — no Svelte stores

### Metis Review
**Identified Gaps** (addressed):
- **No test infra**: TDD scoped to `.ts` logic modules; component verification via `ast_grep_search` patterns + build checks
- **OAuth is logic + UI**: Extract logic-only `.ts` module; keep OAuth UI inline in consumers
- **Providers + OAuth too coupled**: Combined into single `ProviderSettings.svelte` sub-component (not separated)
- **BatchPanel already Svelte 5**: No migration needed — only split into sub-components
- **Route keys immutable**: Only labels and display order change, never route keys
- **GradingPanel ↔ BatchPanel interface**: 13 props, 7 bindable — interface stays identical after split
- **No Svelte stores**: Continue props drilling pattern — no new state management
- **CSS scoping**: Each extracted component gets only its relevant `<style>` block

---

## Work Objectives

### Core Objective
Make the O.G.R.E desktop app more maintainable (smaller, focused components with tested logic) and more usable for non-technical teachers (intuitive sidebar, actionable Dashboard, teacher-friendly labels).

### Concrete Deliverables
- `ogre-desktop/src/lib/oauth.ts` — Existing OAuth module (635 lines), tested and potentially extended with missing functions
- `ogre-desktop/src/lib/__tests__/oauth.test.ts` — NEW: Test suite for OAuth logic
- `ogre-desktop/src/pages/settings/Settings.svelte` — Shell that composes sub-components
- `ogre-desktop/src/pages/settings/ThemeSettings.svelte` — Theme selection
- `ogre-desktop/src/pages/settings/ProviderSettings.svelte` — Provider CRUD + OAuth flows
- `ogre-desktop/src/pages/settings/CredentialSettings.svelte` — Site credentials CRUD
- `ogre-desktop/src/pages/settings/EmbeddingSettings.svelte` — Embedding model config
- `ogre-desktop/src/pages/settings/ColumnSettings.svelte` — History column visibility
- `ogre-desktop/src/components/grading/batch/BatchPanel.svelte` — Shell composing sub-components
- `ogre-desktop/src/components/grading/batch/BatchProfileSelector.svelte` — Profile/model selection
- `ogre-desktop/src/components/grading/batch/BatchInstructions.svelte` — Instructions input
- `ogre-desktop/src/components/grading/batch/BatchProgress.svelte` — Progress display
- `ogre-desktop/src/components/grading/batch/BatchResults.svelte` — Results display
- `ogre-desktop/src/components/icons/` — 8 sidebar icon components
- Updated `ogre-desktop/src/App.svelte` — Reorganized sidebar, Svelte 5 runes
- Updated `ogre-desktop/src/pages/Dashboard.svelte` — CTAs, Svelte 5 runes

### Definition of Done
- [ ] `cd ogre-desktop && npm run build` passes with zero errors
- [ ] `cd ogre-desktop && npm run test` passes (all new tests green)
- [ ] Settings.svelte shell file < 100 lines
- [ ] No Settings sub-component > 400 lines
- [ ] BatchPanel shell file < 150 lines
- [ ] No BatchPanel sub-component > 700 lines
- [ ] OAuth logic: Settings and SetupWizard both import from `src/lib/oauth.ts` (no inline OAuth duplication)
- [ ] Sidebar shows 3 groups (Primary / Tools / System)
- [ ] Dashboard has 3+ clickable CTAs
- [ ] All touched files use Svelte 5 runes syntax (no `$:`, no `export let`, no `on:click`)
- [ ] No functionality regression — all existing features still work

### Must Have
- All existing functionality preserved exactly (no behavior changes)
- OAuth flow works identically in both Settings and SetupWizard after extraction
- BatchPanel ↔ GradingPanel interface stays identical (13 props, 7 bindable)
- Props drilling pattern maintained — no new state management patterns
- CSS stays scoped per component
- Build and tests pass after every task

### Must NOT Have (Guardrails)
- **No Svelte stores or context API** — continue props drilling
- **No new routing library** — keep `{#if}` routing in App.svelte
- **No UI framework/library additions** (no Tailwind, no component library)
- **No icon library** — extract to local `.svelte` icon components only
- **No route key changes** — `dashboard`, `browser`, `profiles`, etc. stay identical
- **No functionality additions** — this is refactor + reorganize, not new features
- **No over-abstraction** — if a sub-component would be < 50 lines, don't extract it
- **No changes to grading-server** — frontend only
- **No changes to Rust backend** (src-tauri/) — frontend only
- **No migration of untouched files** — only files we modify get Svelte 5 runes

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: NO (no test runner configured in ogre-desktop)
- **Automated tests**: TDD — for `.ts` logic modules only (user chose TDD)
- **Framework**: `vitest` (compatible with Vite/Svelte, zero-config for `.ts` files)
- **If TDD**: Each `.ts` extraction task follows RED (failing test) → GREEN (minimal impl) → REFACTOR
- **Component verification**: `ast_grep_search` for pattern checks + `npm run build` for compilation

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Component Extraction**: `ast_grep_search` to verify component boundaries + `npm run build` for compilation
- **Logic Extraction**: `vitest` test suite + import verification
- **UX Changes**: Playwright opens desktop app, navigates sidebar, verifies labels/grouping/CTAs
- **Migration**: `ast_grep_search` for Svelte 4 patterns (should find ZERO in migrated files)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — test infra + extractions, 5 parallel tasks):
├── Task 1: Test infrastructure setup (vitest config) [quick]
├── Task 2: Test existing oauth.ts + reconcile with inline code [deep]
├── Task 3: Extract sidebar icon components [quick]
├── Task 4: Split Settings.svelte → sub-components [deep]
├── Task 5: Split BatchPanel.svelte → sub-components [deep]

Wave 2 (UX + Migration — depends on Wave 1, 4 parallel tasks):
├── Task 6: Reorganize sidebar + rename labels in App.svelte (depends: 3) [unspecified-high]
├── Task 7: Dashboard CTAs + Svelte 5 migration (depends: none from W1) [unspecified-high]
├── Task 8: Wire oauth.ts into Settings ProviderSettings (depends: 2, 4) [unspecified-high]
├── Task 9: Wire oauth.ts into SetupWizard (depends: 2) [unspecified-high]

Wave 3 (Migration + Polish — depends on Wave 2, 3 parallel tasks):
├── Task 10: Svelte 5 migration for App.svelte (depends: 6) [unspecified-high]
├── Task 11: Svelte 5 migration for Settings sub-components (depends: 4, 8) [unspecified-high]
├── Task 12: Integration build verification + fixup (depends: all W2) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA via Playwright [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 2 → Task 8 → Task 11 → Task 12 → Final
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2 | 1 |
| 2 | 1 | 8, 9 | 1 |
| 3 | — | 6 | 1 |
| 4 | — | 8, 11 | 1 |
| 5 | — | 12 | 1 |
| 6 | 3 | 10 | 2 |
| 7 | — | 12 | 2 |
| 8 | 2, 4 | 11 | 2 |
| 9 | 2 | 12 | 2 |
| 10 | 6 | 12 | 3 |
| 11 | 4, 8 | 12 | 3 |
| 12 | all W2 | Final | 3 |
| F1-F4 | 12 | — | Final |

### Agent Dispatch Summary

| Wave | Tasks | Categories |
|------|-------|-----------|
| 1 | 5 | T1 → `quick`, T2 → `deep`, T3 → `quick`, T4 → `deep`, T5 → `deep` |
| 2 | 4 | T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `unspecified-high`, T9 → `unspecified-high` |
| 3 | 3 | T10 → `unspecified-high`, T11 → `unspecified-high`, T12 → `deep` |
| FINAL | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

- [ ] 1. Set Up Vitest Test Infrastructure

  **What to do**:
  - Install `vitest` as a dev dependency in `ogre-desktop/`
  - Create `ogre-desktop/vitest.config.ts` with Svelte + TypeScript support
  - Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`
  - Create a smoke test `ogre-desktop/src/lib/__tests__/smoke.test.ts` that imports a known module and asserts it exports correctly
  - Run `npm run test` and verify the smoke test passes

  **Must NOT do**:
  - Do NOT add component testing (no `@testing-library/svelte`)
  - Do NOT add browser test config — only `.ts` module testing
  - Do NOT modify any existing source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple config file creation + package install, no complex logic
  - **Skills**: []
    - No specialized skills needed — standard npm/config work

  **Parallelization**:
  - **Can Run In Parallel**: YES (but other TDD tasks depend on this)
  - **Parallel Group**: Wave 1 (with Tasks 2-5, but 2 should wait for this)
  - **Blocks**: Task 2 (needs vitest to write tests first)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/package.json` — Check existing devDependencies, scripts section, and build tool (Vite)
  - `ogre-desktop/vite.config.js` — Vite config to align vitest config with (same Svelte plugin, same resolve aliases). Note: this is `.js` not `.ts`
  - `ogre-desktop/jsconfig.json` — JavaScript/TypeScript config to reference in vitest config. Note: project uses `jsconfig.json` (not tsconfig.json) despite having `.ts` files in `src/lib/`

  **API/Type References**:
  - None — config-only task

  **External References**:
  - Vitest docs: `https://vitest.dev/config/` — Configuration reference
  - Vitest + Svelte: `https://vitest.dev/guide/` — Setup guide

  **WHY Each Reference Matters**:
  - `package.json`: Need to know existing build scripts pattern to add test scripts consistently
  - `vite.config.ts`: Vitest shares Vite config — must align plugins and aliases or tests won't resolve imports
  - `tsconfig.json`: Vitest needs to know TypeScript paths and compiler options

  **Acceptance Criteria**:
  - [ ] `vitest` appears in devDependencies in package.json
  - [ ] `ogre-desktop/vitest.config.ts` exists and imports svelte plugin
  - [ ] `npm run test` script exists in package.json
  - [ ] `cd ogre-desktop && npm run test` → PASS (1 test, 0 failures)
  - [ ] `cd ogre-desktop && npm run build` → still passes (no regressions)

  **QA Scenarios:**

  ```
  Scenario: Vitest runs and smoke test passes
    Tool: Bash
    Preconditions: ogre-desktop has vitest installed
    Steps:
      1. Run `cd ogre-desktop && npm run test`
      2. Assert exit code is 0
      3. Assert stdout contains "1 passed" or "Tests  1 passed"
    Expected Result: Exit code 0, output shows 1 passing test
    Failure Indicators: Non-zero exit code, "FAIL" in output, missing vitest binary
    Evidence: .sisyphus/evidence/task-1-vitest-smoke.txt

  Scenario: Build still passes after vitest addition
    Tool: Bash
    Preconditions: vitest config added
    Steps:
      1. Run `cd ogre-desktop && npm run build`
      2. Assert exit code is 0
    Expected Result: Build succeeds with no errors
    Failure Indicators: Non-zero exit code, TypeScript errors, missing dependencies
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-vitest-smoke.txt — vitest run output
  - [ ] task-1-build-check.txt — build output

  **Commit**: YES
  - Message: `chore(test): add vitest infrastructure for ogre-desktop`
  - Files: `vitest.config.ts`, `package.json`, `src/lib/__tests__/smoke.test.ts`
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`

---

- [ ] 2. Write Tests for Existing `oauth.ts` + Reconcile with Inline OAuth Code

  **What to do**:
  - **DISCOVERY**: `ogre-desktop/src/lib/oauth.ts` (635 lines) ALREADY EXISTS as a comprehensive OAuth module with:
    - `DeviceFlowResult` interface, PKCE helpers, GitHub/Google device flows, model fetching
    - BUT neither Settings.svelte nor SetupWizard.svelte imports it — they have DUPLICATED inline OAuth logic
  - **RED**: Write tests FIRST in `ogre-desktop/src/lib/__tests__/oauth.test.ts`:
    - Test key exported functions from `oauth.ts` (read the file to discover exact function names/signatures)
    - Test `DeviceFlowResult` shape: has `userCode`, `verificationUrl`, `poll()`, `cancel()`
    - Test PKCE flow helpers if exported
    - Test model fetching functions
    - Mock `tauriFetch` and `open` (Tauri plugin imports) since these are platform APIs
  - **GREEN**: If any functions from Settings/SetupWizard inline code are MISSING from `oauth.ts`, add them to `oauth.ts`
  - **RECONCILE**: Compare the inline OAuth logic in Settings.svelte (~lines 200-400) and SetupWizard.svelte (~lines 100-300) against `oauth.ts`:
    - Identify which inline functions already exist in `oauth.ts` (likely most of them)
    - Identify any inline functions that are NOT in `oauth.ts` (need to be added)
    - Document the mapping: "Settings line X = oauth.ts function Y"
  - Do NOT modify Settings.svelte or SetupWizard.svelte yet (that's Tasks 8-9)
  - Do NOT create a new `oauth.ts` — use the existing `oauth.ts`

  **Must NOT do**:
  - Do NOT touch any `.svelte` files in this task
  - Do NOT create a new oauth module — extend the existing `oauth.ts` if needed
  - Do NOT change existing `oauth.ts` behavior — only add missing functions and tests
  - Do NOT create Svelte stores or reactive state

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD + reconciliation between 3 files (oauth.ts, Settings, SetupWizard) requires careful behavior analysis
  - **Skills**: []
    - No specialized skills needed — TypeScript logic testing

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1 (with Tasks 3, 4, 5)
  - **Blocks**: Tasks 8, 9 (need tested oauth.ts to wire into consumers)
  - **Blocked By**: Task 1 (needs vitest infrastructure)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/oauth.ts` — THE existing OAuth module (635 lines). Read FULLY to understand all exports, types, and functions
  - `ogre-desktop/src/pages/Settings.svelte:200-400` — Inline OAuth logic to COMPARE against oauth.ts. Identify duplicated vs missing functions
  - `ogre-desktop/src/pages/SetupWizard.svelte:100-300` — Inline OAuth logic to COMPARE against oauth.ts. Identify duplicated vs missing functions

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts:6-13` — `DeviceFlowResult` interface — the core type to test against
  - `ogre-desktop/src/lib/oauth.ts` — All `export` statements — these are the public API to write tests for
  - `ogre-desktop/src/lib/db.ts` — `saveOAuthToken`, `getOAuthToken`, `deleteOAuthToken` — used by oauth.ts, may need mocking

  **Test References**:
  - `ogre-desktop/src/lib/__tests__/smoke.test.ts` — Follow this test file structure and import pattern (created in Task 1)

  **External References**:
  - Google OAuth device flow: `https://developers.google.com/identity/protocols/oauth2/limited-input-device` — Understand device flow to mock correctly

  **WHY Each Reference Matters**:
  - `oauth.ts`: This IS the module being tested — must read fully to discover all testable functions
  - `Settings.svelte:200-400`: Contains inline OAuth logic that SHOULD be using oauth.ts — compare to find gaps
  - `SetupWizard.svelte:100-300`: Same comparison needed for wizard's OAuth code
  - `db.ts`: oauth.ts calls these DB functions — must mock them in tests

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/src/lib/__tests__/oauth.test.ts` exists with 5+ test cases
  - [ ] Tests cover key exported functions from oauth.ts
  - [ ] If any functions were missing from oauth.ts (found in Settings/SetupWizard but not oauth.ts), they are now added
  - [ ] `cd ogre-desktop && npm run test` → PASS (all oauth tests green)
  - [ ] `cd ogre-desktop && npm run build` → still passes
  - [ ] No `.svelte` files modified (verify with `git diff --name-only`)
  - [ ] A RECONCILIATION NOTE is left as a code comment or in commit message documenting: which inline functions map to which oauth.ts functions

  **QA Scenarios:**

  ```
  Scenario: All OAuth tests pass
    Tool: Bash
    Preconditions: Task 1 complete (vitest configured)
    Steps:
      1. Run `cd ogre-desktop && npm run test -- --reporter=verbose`
      2. Assert output contains "oauth" test suite
      3. Assert all tests show ✓ (pass)
      4. Assert exit code is 0
    Expected Result: 5+ tests pass, zero failures
    Failure Indicators: Any test shows ✗, exit code non-zero
    Evidence: .sisyphus/evidence/task-2-oauth-tests.txt

  Scenario: oauth.ts exports are comprehensive
    Tool: Bash
    Preconditions: Reconciliation complete
    Steps:
      1. Run ast_grep_search for `export function` and `export async function` in oauth.ts
      2. Run ast_grep_search for `export interface` and `export type` in oauth.ts
      3. Compare against inline functions found in Settings.svelte and SetupWizard.svelte
      4. Verify every inline OAuth function has a corresponding export in oauth.ts
    Expected Result: oauth.ts covers all OAuth logic needed by both consumers
    Failure Indicators: Missing function that exists inline but not in oauth.ts
    Evidence: .sisyphus/evidence/task-2-exports-check.txt

  Scenario: No Svelte files touched
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `cd ogre-desktop && git diff --name-only`
      2. Assert no `.svelte` files in output
    Expected Result: Only .ts files and config files changed
    Failure Indicators: Any .svelte file in diff output
    Evidence: .sisyphus/evidence/task-2-no-svelte-changes.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-oauth-tests.txt — vitest verbose output
  - [ ] task-2-exports-check.txt — export reconciliation results
  - [ ] task-2-no-svelte-changes.txt — git diff output

  **Commit**: YES
  - Message: `test(oauth): add test suite for oauth.ts and reconcile with inline OAuth code`
  - Files: `src/lib/__tests__/oauth.test.ts`, possibly `src/lib/oauth.ts` (if functions added)
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`

---

- [ ] 3. Extract Sidebar Icon Components

  **What to do**:
  - Create directory `ogre-desktop/src/components/icons/`
  - Extract each inline SVG from `App.svelte` lines 162-216 (8 nav buttons) into individual Svelte components:
    - `DashboardIcon.svelte`, `HistoryIcon.svelte`, `LogsIcon.svelte`, `RubricsIcon.svelte`, `ProfilesIcon.svelte`, `BrowserIcon.svelte`, `SkillsIcon.svelte`, `SettingsIcon.svelte`
  - Each icon component: accept `size` prop (default 20), accept `class` prop for styling, render the SVG
  - Use Svelte 5 runes syntax (`let { size = 20, class: className = '' } = $props()`) since these are new files
  - Create `ogre-desktop/src/components/icons/index.ts` barrel export
  - Replace inline SVGs in App.svelte with component imports (but DO NOT do the full sidebar reorg — that's Task 6)

  **Must NOT do**:
  - Do NOT install an icon library
  - Do NOT reorganize sidebar structure yet (Task 6)
  - Do NOT rename labels yet (Task 6)
  - Do NOT migrate App.svelte to Svelte 5 runes yet (Task 10) — only the icon components use runes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Repetitive extraction of 8 similar SVG blocks into simple components
  - **Skills**: []
    - No specialized skills needed — straightforward Svelte component creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 6 (needs icon components to reorganize sidebar)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/App.svelte:162-216` — The 8 inline SVGs to extract (each is inside a `<button>` nav item)
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1-10` — Example of Svelte 5 `$props()` syntax to follow for new icon components

  **API/Type References**:
  - None — simple presentational components

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - `App.svelte:162-216`: These are the exact SVGs to extract — copy paths/viewBoxes exactly
  - `BatchPanel.svelte:1-10`: Shows how this codebase writes Svelte 5 props — follow the same pattern

  **Acceptance Criteria**:
  - [ ] 8 icon components exist in `src/components/icons/`
  - [ ] `src/components/icons/index.ts` barrel export exists
  - [ ] App.svelte imports icons from `./components/icons`
  - [ ] No inline `<svg>` elements remain in App.svelte sidebar nav buttons
  - [ ] Each icon component uses Svelte 5 `$props()` syntax
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: All icon components exist and export correctly
    Tool: Bash
    Preconditions: None
    Steps:
      1. Use glob to find `ogre-desktop/src/components/icons/*.svelte`
      2. Assert 8 files found
      3. Read `ogre-desktop/src/components/icons/index.ts`
      4. Assert it exports all 8 icons
    Expected Result: 8 .svelte files + 1 index.ts in icons directory
    Failure Indicators: Fewer than 8 files, missing barrel export
    Evidence: .sisyphus/evidence/task-3-icon-files.txt

  Scenario: No inline SVGs remain in sidebar
    Tool: Bash
    Preconditions: Icons extracted and wired
    Steps:
      1. Run ast_grep_search for `<svg` in App.svelte
      2. Assert zero matches in the nav/sidebar section (lines 150-230)
    Expected Result: No inline SVGs in sidebar nav buttons
    Failure Indicators: Any `<svg` found in sidebar section of App.svelte
    Evidence: .sisyphus/evidence/task-3-no-inline-svg.txt

  Scenario: Build passes with icon components
    Tool: Bash
    Preconditions: All icons extracted
    Steps:
      1. Run `cd ogre-desktop && npm run build`
      2. Assert exit code is 0
    Expected Result: Successful build
    Failure Indicators: Import errors, missing exports, SVG syntax errors
    Evidence: .sisyphus/evidence/task-3-build-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-icon-files.txt — glob results
  - [ ] task-3-no-inline-svg.txt — ast_grep results
  - [ ] task-3-build-check.txt — build output

  **Commit**: YES
  - Message: `refactor(icons): extract sidebar icons to component files`
  - Files: `src/components/icons/*.svelte`, `src/components/icons/index.ts`, `src/App.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`


- [ ] 4. Split Settings.svelte into Focused Sub-Components

  **What to do**:
  - Create directory `ogre-desktop/src/pages/settings/`
  - Read `Settings.svelte` (1,460 lines) and identify the 5 sections by their comment blocks / visual grouping:
    1. **Theme settings** (~lines 50-120): Theme toggle, dark/light selection
    2. **Provider settings + OAuth** (~lines 120-600): Provider CRUD, API key management, OAuth sign-in flows, device flow UI, model fetching
    3. **Credential settings** (~lines 600-850): Site credential CRUD (URL, username, password)
    4. **Embedding settings** (~lines 850-1050): Embedding model configuration, provider selection
    5. **Column visibility** (~lines 1050-1150): History column show/hide toggles
  - Create 5 sub-components:
    - `settings/ThemeSettings.svelte` — Theme selection UI + logic
    - `settings/ProviderSettings.svelte` — Provider CRUD + OAuth flows (NOTE: OAuth logic stays inline for now, Task 8 will replace with oauth.ts)
    - `settings/CredentialSettings.svelte` — Site credentials CRUD
    - `settings/EmbeddingSettings.svelte` — Embedding model config
    - `settings/ColumnSettings.svelte` — History column visibility
  - Create `settings/Settings.svelte` as a shell that imports and renders all 5 sub-components
  - Pass necessary props from shell to sub-components (providers array, credentials array, settings object, etc.)
  - Move relevant `<style>` blocks to each sub-component (scoped CSS)
  - Update `App.svelte` import from `./pages/Settings.svelte` to `./pages/settings/Settings.svelte`
  - Keep Svelte 4 syntax in sub-components for now (Task 11 will migrate to Svelte 5)

  **Must NOT do**:
  - Do NOT change any behavior — pure structural extraction
  - Do NOT replace OAuth logic with oauth.ts yet (that's Task 8)
  - Do NOT migrate to Svelte 5 runes yet (that's Task 11)
  - Do NOT add or remove functionality
  - Do NOT change prop interfaces — if Settings passed props to children, preserve exactly

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Splitting a 1,460-line monolith requires careful section identification, CSS scoping, and prop threading
  - **Skills**: []
    - No specialized skills needed — Svelte component extraction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Tasks 8, 11 (need sub-components to exist)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Settings.svelte` — THE file to split (1,460 lines). Read fully to identify section boundaries
  - `ogre-desktop/src/App.svelte:40-50` — Where Settings is imported. Update import path after split
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-30` — Example of a component that passes many props to children — follow this pattern for the Settings shell

  **API/Type References**:
  - `ogre-desktop/src/pages/Settings.svelte` — Look at `onMount` and top-level `let` declarations to identify all state that sub-components need as props
  - `ogre-desktop/src/lib/db.ts` — Database functions called by Settings (loadProviders, saveProvider, deleteProvider, etc.) — sub-components will call these directly

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - `Settings.svelte`: This IS the file being split — every line must be accounted for in a sub-component or the shell
  - `App.svelte import`: The import path changes — must update or app breaks
  - `GradingPanel.svelte`: Shows how this project structures components that compose children with many props
  - `db.ts`: Sub-components need to know which DB functions to import directly vs receive as props

  **Acceptance Criteria**:
  - [ ] `settings/Settings.svelte` shell exists and is < 100 lines
  - [ ] 5 sub-components exist: ThemeSettings, ProviderSettings, CredentialSettings, EmbeddingSettings, ColumnSettings
  - [ ] No sub-component > 400 lines
  - [ ] `App.svelte` imports from `./pages/settings/Settings.svelte`
  - [ ] All CSS from original Settings.svelte accounted for in sub-components or shell
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: Settings shell is slim and composes sub-components
    Tool: Bash
    Preconditions: Split complete
    Steps:
      1. Read `ogre-desktop/src/pages/settings/Settings.svelte`
      2. Count lines — assert < 100
      3. Use ast_grep_search for import statements — assert 5 sub-component imports
      4. Verify each sub-component is rendered in the template
    Expected Result: Shell < 100 lines, imports and renders all 5 sub-components
    Failure Indicators: Shell > 100 lines, missing imports, sub-components not rendered
    Evidence: .sisyphus/evidence/task-4-shell-check.txt

  Scenario: No sub-component exceeds line limit
    Tool: Bash
    Preconditions: Split complete
    Steps:
      1. For each of the 5 sub-components, read the file
      2. Count lines for each
      3. Assert each is < 400 lines
    Expected Result: All sub-components under 400 lines
    Failure Indicators: Any sub-component ≥ 400 lines
    Evidence: .sisyphus/evidence/task-4-line-counts.txt

  Scenario: Build passes after Settings split
    Tool: Bash
    Preconditions: All sub-components created, shell created, App.svelte import updated
    Steps:
      1. Run `cd ogre-desktop && npm run build`
      2. Assert exit code is 0
    Expected Result: Successful build, zero errors
    Failure Indicators: Import errors, missing props, CSS errors, type mismatches
    Evidence: .sisyphus/evidence/task-4-build-check.txt

  Scenario: Original Settings.svelte no longer exists at old path
    Tool: Bash
    Preconditions: Split complete
    Steps:
      1. Check if `ogre-desktop/src/pages/Settings.svelte` still exists
      2. It should NOT exist (moved to settings/Settings.svelte)
      3. Verify App.svelte does NOT import from `./pages/Settings.svelte`
    Expected Result: Old file removed, no dangling imports
    Failure Indicators: Old file still exists, old import path still referenced
    Evidence: .sisyphus/evidence/task-4-old-file-removed.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-shell-check.txt — shell file analysis
  - [ ] task-4-line-counts.txt — sub-component line counts
  - [ ] task-4-build-check.txt — build output
  - [ ] task-4-old-file-removed.txt — verification of old file removal

  **Commit**: YES
  - Message: `refactor(settings): split Settings.svelte into focused sub-components`
  - Files: `src/pages/settings/*.svelte`, `src/App.svelte` (import update)
  - Pre-commit: `cd ogre-desktop && npm run build`

---

- [ ] 5. Split BatchPanel.svelte into Focused Sub-Components

  **What to do**:
  - Create directory `ogre-desktop/src/components/grading/batch/`
  - Read `BatchPanel.svelte` (2,389 lines) and identify 4 logical sections:
    1. **Profile/Model Selection** (~top section): Provider picker, model dropdown, profile selection, rubric selection
    2. **Instructions Input** (~middle): Grading instructions textarea, preset selection, skill picker integration
    3. **Progress Display** (~during grading): Progress bar, student-by-student status, cancel button, elapsed time
    4. **Results Display** (~after grading): Student results list, scores, feedback, copy/export actions
  - Create 4 sub-components:
    - `batch/BatchProfileSelector.svelte` — Profile, provider, model, rubric selection
    - `batch/BatchInstructions.svelte` — Instructions input + presets + skill picker
    - `batch/BatchProgress.svelte` — Grading progress display
    - `batch/BatchResults.svelte` — Results display + actions
  - Create `batch/BatchPanel.svelte` as a shell that imports and composes the 4 sub-components
  - **CRITICAL**: The GradingPanel ↔ BatchPanel interface (13 props, 7 bindable) MUST stay identical
  - The shell receives all 13 props from GradingPanel and distributes to sub-components
  - Keep Svelte 5 runes syntax (BatchPanel already uses runes)
  - Move relevant `<style>` blocks to each sub-component
  - Update `GradingPanel.svelte` import path from `./BatchPanel.svelte` to `./batch/BatchPanel.svelte`

  **Must NOT do**:
  - Do NOT change any behavior — pure structural extraction
  - Do NOT change the 13-prop interface between GradingPanel and BatchPanel
  - Do NOT change bindable prop behavior
  - Do NOT add or remove functionality
  - Do NOT change event dispatch patterns

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Splitting a 2,389-line component with 13 props (7 bindable) requires precise interface preservation
  - **Skills**: []
    - No specialized skills needed — Svelte component extraction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 12 (integration verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte` — THE file to split (2,389 lines). Read fully to identify section boundaries
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-50` — Where BatchPanel is imported and rendered. Shows the 13-prop interface that MUST be preserved
  - `ogre-desktop/src/pages/GradingPanel.svelte` — Search for `bind:` directives on BatchPanel to identify the 7 bindable props

  **API/Type References**:
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1-30` — Look at `$props()` destructuring to identify all 13 props and their types
  - `ogre-desktop/src/components/grading/BatchPanel.svelte` — Look for `$bindable()` markers to identify which props are bindable

  **External References**:
  - Svelte 5 `$bindable()` docs: `https://svelte.dev/docs/svelte/$bindable` — How to declare bindable props in Svelte 5 runes

  **WHY Each Reference Matters**:
  - `BatchPanel.svelte`: This IS the file being split — every line must land in a sub-component or shell
  - `GradingPanel.svelte` import: The interface contract — 13 props, 7 bindable — is defined here and must not change
  - `$bindable()` docs: Sub-components that receive bindable values need correct Svelte 5 binding patterns

  **Acceptance Criteria**:
  - [ ] `batch/BatchPanel.svelte` shell exists and is < 150 lines
  - [ ] 4 sub-components exist: BatchProfileSelector, BatchInstructions, BatchProgress, BatchResults
  - [ ] No sub-component > 700 lines
  - [ ] GradingPanel.svelte import updated to `./batch/BatchPanel.svelte`
  - [ ] GradingPanel → BatchPanel interface unchanged (same 13 props, same 7 bindable)
  - [ ] All sub-components use Svelte 5 runes (`$props()`, `$state()`, `$effect()`)
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: BatchPanel shell is slim and composes sub-components
    Tool: Bash
    Preconditions: Split complete
    Steps:
      1. Read `ogre-desktop/src/components/grading/batch/BatchPanel.svelte`
      2. Count lines — assert < 150
      3. Use ast_grep_search for import statements — assert 4 sub-component imports
    Expected Result: Shell < 150 lines, imports all 4 sub-components
    Failure Indicators: Shell > 150 lines, missing imports
    Evidence: .sisyphus/evidence/task-5-shell-check.txt

  Scenario: GradingPanel interface preserved
    Tool: Bash
    Preconditions: Split complete
    Steps:
      1. Read GradingPanel.svelte
      2. Find BatchPanel usage — count props passed
      3. Assert 13 props passed, 7 with `bind:` prefix
      4. Compare with pre-split interface (from references)
    Expected Result: Identical interface — 13 props, 7 bindable
    Failure Indicators: Different prop count, missing bind: directives, type changes
    Evidence: .sisyphus/evidence/task-5-interface-check.txt

  Scenario: Build passes after BatchPanel split
    Tool: Bash
    Preconditions: All sub-components created, shell created, GradingPanel import updated
    Steps:
      1. Run `cd ogre-desktop && npm run build`
      2. Assert exit code is 0
    Expected Result: Successful build, zero errors
    Failure Indicators: Import errors, prop type mismatches, binding errors
    Evidence: .sisyphus/evidence/task-5-build-check.txt

  Scenario: No functionality changes in grading flow
    Tool: Bash
    Preconditions: Build passes
    Steps:
      1. Use ast_grep_search for event dispatch patterns in original vs new BatchPanel
      2. Verify same events dispatched (gradeComplete, gradeError, etc.)
      3. Use ast_grep_search for fetch/invoke calls — same API calls present
    Expected Result: Same events + same API calls = same behavior
    Failure Indicators: Missing event dispatches, missing API calls
    Evidence: .sisyphus/evidence/task-5-behavior-preserved.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-shell-check.txt — shell file analysis
  - [ ] task-5-interface-check.txt — GradingPanel prop verification
  - [ ] task-5-build-check.txt — build output
  - [ ] task-5-behavior-preserved.txt — event + API call comparison

  **Commit**: YES
  - Message: `refactor(batch): split BatchPanel into focused sub-components`
  - Files: `src/components/grading/batch/*.svelte`, `src/pages/GradingPanel.svelte` (import update)
  - Pre-commit: `cd ogre-desktop && npm run build`


- [ ] 6. Reorganize Sidebar + Rename Labels in App.svelte

  **What to do**:
  - Restructure the sidebar navigation in `App.svelte` from a flat list of 8 items into 3 labeled groups:
    ```
    ── Primary ──
      Grade Now (route: browser)
      Grading History (route: history)
      Rubrics (route: rubrics)
    ── Tools ──
      AI Skills (route: skills)
      Site Templates (route: profiles)
    ── System ──
      Activity Log (route: logs)
      Settings (route: settings)
    ```
  - Rename labels in the sidebar buttons (ONLY the display text, NOT route keys):
    - "History" → "Grading History"
    - "Logs" → "Activity Log"
    - "Site Profiles" → "Site Templates"
    - "Browser" → "Grade Now"
    - "Skills" → "AI Skills"
    - Dashboard, Rubrics, Settings → keep same names
  - Add visual group separators (thin lines or spacing + group label in small caps)
  - Use the extracted icon components from Task 3
  - Move "Dashboard" out of groups — make it the top item with slight visual distinction (active/home indicator)
  - Keep Svelte 4 syntax for now (Task 10 will migrate)
  - **CRITICAL**: Route keys (`dashboard`, `browser`, `history`, `logs`, `rubrics`, `profiles`, `skills`, `settings`) MUST NOT change

  **Must NOT do**:
  - Do NOT change route keys or routing logic
  - Do NOT add a router library
  - Do NOT migrate to Svelte 5 yet (Task 10)
  - Do NOT rearrange page content — only sidebar organization
  - Do NOT add new pages or remove existing ones

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful sidebar restructuring with CSS grouping, visual design attention, and label coordination
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: Task 10 (Svelte 5 migration of App.svelte)
  - **Blocked By**: Task 3 (needs icon components)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/App.svelte:140-230` — Current sidebar nav section with 8 flat buttons. This is the code to restructure
  - `ogre-desktop/src/App.svelte:30-50` — Route state management (`currentPage` variable) — do NOT change
  - `ogre-desktop/src/components/icons/index.ts` — Icon components created in Task 3 — import from here
  - `ogre-desktop/src/app.css` — Existing sidebar CSS classes (`.sidebar`, `.nav-button`, `.active`) — extend for groups

  **API/Type References**:
  - None — UI-only changes

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - `App.svelte:140-230`: The exact code region to restructure — contains all 8 nav buttons
  - `App.svelte:30-50`: Route state logic must remain untouched — understand before modifying nearby code
  - `icons/index.ts`: Import path for extracted icons
  - `app.css`: Need to extend existing CSS patterns for group separators, not create conflicting styles

  **Acceptance Criteria**:
  - [ ] Sidebar shows 3 groups: Primary (3 items), Tools (2 items), System (2 items)
  - [ ] Dashboard is top item, visually distinct from groups
  - [ ] Labels match rename table: Grade Now, Grading History, Rubrics, AI Skills, Site Templates, Activity Log, Settings
  - [ ] All 8 route keys unchanged in code
  - [ ] Group separators visible (lines or spacing + labels)
  - [ ] Icon components imported from `./components/icons`
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: Sidebar displays 3 groups with correct labels
    Tool: Playwright (playwright skill)
    Preconditions: Desktop app running
    Steps:
      1. Navigate to app's main page
      2. Look at sidebar — find group headers/separators
      3. Assert "Primary" group contains: "Grade Now", "Grading History", "Rubrics"
      4. Assert "Tools" group contains: "AI Skills", "Site Templates"
      5. Assert "System" group contains: "Activity Log", "Settings"
      6. Assert "Dashboard" appears above all groups
      7. Screenshot the full sidebar
    Expected Result: 3 distinct groups with correct items, Dashboard on top
    Failure Indicators: Flat list (no groups), wrong labels, missing items
    Evidence: .sisyphus/evidence/task-6-sidebar-groups.png

  Scenario: All navigation routes still work
    Tool: Playwright (playwright skill)
    Preconditions: App running with new sidebar
    Steps:
      1. Click each sidebar item in order
      2. After each click, verify the correct page content loads
      3. Assert all 8 pages are accessible
    Expected Result: Every sidebar item navigates to correct page
    Failure Indicators: Broken navigation, wrong page loads, JavaScript errors
    Evidence: .sisyphus/evidence/task-6-nav-works.png

  Scenario: Route keys unchanged in source
    Tool: Bash
    Preconditions: Sidebar restructured
    Steps:
      1. Use grep to search App.svelte for route key strings
      2. Assert these exact strings exist: 'dashboard', 'browser', 'history', 'logs', 'rubrics', 'profiles', 'skills', 'settings'
    Expected Result: All 8 original route keys present, unchanged
    Failure Indicators: Missing route key, renamed route key
    Evidence: .sisyphus/evidence/task-6-route-keys.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-sidebar-groups.png — sidebar screenshot
  - [ ] task-6-nav-works.png — navigation test screenshots
  - [ ] task-6-route-keys.txt — grep results

  **Commit**: YES (groups with Task 7)
  - Message: `feat(ux): reorganize sidebar, rename labels, add Dashboard CTAs`
  - Files: `src/App.svelte`, `src/pages/Dashboard.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

---

- [ ] 7. Add Dashboard CTAs + Svelte 5 Migration for Dashboard

  **What to do**:
  - Redesign the Dashboard page from a passive stats display into an actionable landing page:
    1. **Keep existing**: Health indicators (server status, provider status) and 3 quick stats (total graded, sessions, avg score)
    2. **Add CTA section** below stats with 3 prominent action cards:
       - **"Grade Now"** → navigates to `browser` route. Icon + brief description ("Open the browser to start grading")
       - **"View Recent History"** → navigates to `history` route. Show last 3 grading sessions as preview
       - **"Configure Settings"** → navigates to `settings` route. Show setup completion status (providers configured? credentials set?)
    3. **Add empty state handling**: If no grading history, show onboarding message: "Welcome to O.G.R.E! Start by grading your first assignment."
  - **Migrate Dashboard.svelte to Svelte 5 runes**:
    - Replace `export let` with `let { ... } = $props()`
    - Replace `$:` reactive statements with `$derived()` or `$effect()`
    - Replace `on:click` with `onclick`
    - Replace `onMount` with `$effect()` if appropriate (or keep `onMount` if it's a one-time init)
  - CTAs use the `dispatch('navigate', { page: 'browser' })` pattern or whatever App.svelte's navigation mechanism is
  - Style CTAs to match existing design system (CSS variables from app.css)

  **Must NOT do**:
  - Do NOT remove existing stats or health indicators
  - Do NOT add new API endpoints or server calls
  - Do NOT add a router library — use existing navigation dispatch
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: UX enhancement with visual design + Svelte 5 migration — needs attention to both behavior and appearance
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9)
  - **Blocks**: Task 12 (integration verification)
  - **Blocked By**: None (Dashboard is independent)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/Dashboard.svelte` — Current dashboard (220 lines) — enhance, don't rewrite
  - `ogre-desktop/src/App.svelte:70-90` — Navigation mechanism (how pages communicate "navigate to X" to App.svelte)
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-30` — Example of Svelte 5 runes syntax (`$props()`, `$state()`, `$effect()`) already used in this codebase
  - `ogre-desktop/src/app.css:1-50` — CSS variable names for colors, spacing, fonts — use these for CTA styling

  **API/Type References**:
  - `ogre-desktop/src/lib/db.ts` — Functions to query recent grading sessions for the "View Recent History" CTA preview

  **External References**:
  - Svelte 5 migration guide: `https://svelte.dev/docs/svelte/v5-migration-guide` — Reference for `$props()`, `$derived()`, `$effect()` patterns

  **WHY Each Reference Matters**:
  - `Dashboard.svelte`: Enhance this file — understand existing layout before adding CTAs
  - `App.svelte:70-90`: Need to know HOW to trigger page navigation from Dashboard CTAs
  - `GradingPanel.svelte:1-30`: Copy this Svelte 5 runes pattern for Dashboard migration
  - `app.css`: CTA cards must use existing design tokens, not custom colors
  - `db.ts`: Need specific function to query last 3 sessions for history preview

  **Acceptance Criteria**:
  - [ ] Dashboard has 3 CTA cards: Grade Now, View Recent History, Configure Settings
  - [ ] Each CTA navigates to correct page when clicked
  - [ ] Existing stats and health indicators still present
  - [ ] Empty state message shown when no grading history
  - [ ] Dashboard.svelte uses Svelte 5 runes: `$props()`, `$state()`, `$derived()` or `$effect()`
  - [ ] No `export let`, `$:`, or `on:click` in Dashboard.svelte
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: Dashboard shows 3 CTA cards
    Tool: Playwright (playwright skill)
    Preconditions: Desktop app running, at least 1 grading session in history
    Steps:
      1. Navigate to Dashboard
      2. Assert 3 CTA cards visible with text containing "Grade Now", "History", "Settings"
      3. Click "Grade Now" CTA
      4. Assert page navigated to browser view
      5. Navigate back to Dashboard
      6. Click "View Recent History" CTA
      7. Assert page navigated to history view
      8. Screenshot Dashboard with CTAs
    Expected Result: 3 CTAs visible and functional
    Failure Indicators: Missing CTAs, navigation doesn't work, layout broken
    Evidence: .sisyphus/evidence/task-7-dashboard-ctas.png

  Scenario: Dashboard empty state
    Tool: Playwright (playwright skill)
    Preconditions: App running with empty database (no grading history)
    Steps:
      1. Navigate to Dashboard
      2. Look for onboarding/welcome message
      3. Assert text contains "Welcome" or "Start" or "first assignment"
      4. Assert "Grade Now" CTA is still visible (primary action even in empty state)
    Expected Result: Friendly welcome message + Grade Now CTA
    Failure Indicators: Blank dashboard, error, no guidance for new user
    Evidence: .sisyphus/evidence/task-7-empty-state.png

  Scenario: No Svelte 4 patterns in Dashboard
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Run ast_grep_search for `export let` in Dashboard.svelte — assert 0 matches
      2. Run ast_grep_search for `$:` reactive declarations — assert 0 matches
      3. Run ast_grep_search for `on:click` — assert 0 matches
      4. Run ast_grep_search for `$props()` — assert 1+ matches
    Expected Result: Zero Svelte 4 patterns, at least one Svelte 5 pattern
    Failure Indicators: Any `export let`, `$:`, or `on:click` found
    Evidence: .sisyphus/evidence/task-7-svelte5-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-dashboard-ctas.png — dashboard screenshot with CTAs
  - [ ] task-7-empty-state.png — empty state screenshot
  - [ ] task-7-svelte5-check.txt — ast_grep results

  **Commit**: YES (groups with Task 6)
  - Message: `feat(ux): reorganize sidebar, rename labels, add Dashboard CTAs`
  - Files: `src/pages/Dashboard.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

---

- [ ] 8. Wire oauth.ts into ProviderSettings.svelte

  **What to do**:
  - Open `ogre-desktop/src/pages/settings/ProviderSettings.svelte` (created in Task 4)
  - Replace inline OAuth logic with imports from `ogre-desktop/src/lib/oauth.ts` (existing module, tested in Task 2):
    - Replace inline `handleOAuthSignIn()` body with call to `buildOAuthUrl()` + Tauri shell open
    - Replace inline `handleDeviceFlow()` body with call to `startDeviceFlow()` + `pollDeviceFlow()`
    - Replace inline `cancelAuth()` body with call to imported `cancelAuth()`
    - Replace inline `fetchModels()` body with call to imported `fetchModels()`
  - Keep the UI parts (device flow code display, polling spinner, model dropdown rendering) in the Svelte component — only replace the logic
  - Update the `oauthStatus` reactive variable to use the `OAuthState` type from oauth.ts
  - Verify the provider CRUD flow still works: add provider → configure API key → OAuth sign-in → fetch models

  **Must NOT do**:
  - Do NOT change OAuth behavior — same flow, shared implementation
  - Do NOT remove UI elements (device code display, polling indicator, cancel button)
  - Do NOT migrate to Svelte 5 runes yet (Task 11)
  - Do NOT touch other Settings sub-components

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Wiring shared logic into an existing component with reactive state requires careful integration
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9)
  - **Blocks**: Task 11 (Svelte 5 migration for Settings sub-components)
  - **Blocked By**: Tasks 2 (oauth.ts) and 4 (ProviderSettings.svelte)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/settings/ProviderSettings.svelte` — The file to modify (created in Task 4) — find the inline OAuth functions
  - `ogre-desktop/src/lib/oauth.ts` — The shared module to import from (created in Task 2) — know the function signatures

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts` — Import: `buildOAuthUrl`, `startDeviceFlow`, `pollDeviceFlow`, `fetchModels`, `cancelAuth`, `OAuthState`, `DeviceFlowResponse`, `Model`

  **Test References**:
  - `ogre-desktop/src/lib/__tests__/oauth.test.ts` — Understand what the extracted functions expect and return — match these contracts

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - `ProviderSettings.svelte`: This file contains the inline OAuth logic to replace with imports
  - `oauth.ts`: The function signatures must match — call sites need correct arguments
  - `oauth.test.ts`: Tests document the expected behavior — component integration must match

  **Acceptance Criteria**:
  - [ ] ProviderSettings.svelte imports from `../../lib/oauth`
  - [ ] No inline OAuth function bodies remain (handleOAuthSignIn, handleDeviceFlow, cancelAuth, fetchModels)
  - [ ] `oauthStatus` uses `OAuthState` type from oauth.ts
  - [ ] OAuth UI elements still present (device code display, spinner, cancel button, model dropdown)
  - [ ] `cd ogre-desktop && npm run test` → PASS (oauth tests still green)
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: OAuth logic replaced with imports
    Tool: Bash
    Preconditions: Tasks 2 and 4 complete
    Steps:
      1. Read ProviderSettings.svelte
      2. Search for `import.*oauth` — assert found
      3. Search for inline fetch/polling logic (multi-line async function bodies) — assert NOT found
      4. Verify function calls like `buildOAuthUrl(`, `startDeviceFlow(`, `pollDeviceFlow(`, `fetchModels(` are present
    Expected Result: Imports from oauth, no inline logic, function calls present
    Failure Indicators: No import, inline logic remains, missing function calls
    Evidence: .sisyphus/evidence/task-8-oauth-wiring.txt

  Scenario: Tests still pass after wiring
    Tool: Bash
    Preconditions: Wiring complete
    Steps:
      1. Run `cd ogre-desktop && npm run test`
      2. Assert exit code 0
    Expected Result: All tests pass
    Failure Indicators: Test failures, import errors
    Evidence: .sisyphus/evidence/task-8-tests-pass.txt

  Scenario: Build passes after wiring
    Tool: Bash
    Preconditions: Wiring complete
    Steps:
      1. Run `cd ogre-desktop && npm run build`
      2. Assert exit code 0
    Expected Result: Successful build
    Failure Indicators: Type errors, import resolution failures
    Evidence: .sisyphus/evidence/task-8-build-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-oauth-wiring.txt — import and logic verification
  - [ ] task-8-tests-pass.txt — test output
  - [ ] task-8-build-check.txt — build output

  **Commit**: YES (groups with Task 9)
  - Message: `refactor(oauth): wire shared oauth.ts into Settings and SetupWizard`
  - Files: `src/pages/settings/ProviderSettings.svelte`
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`


- [ ] 9. Wire oauth.ts into SetupWizard.svelte

  **What to do**:
  - Open `ogre-desktop/src/pages/SetupWizard.svelte` (981 lines)
  - Replace inline OAuth logic with imports from `ogre-desktop/src/lib/oauth.ts` (created in Task 2):
    - Replace inline `handleOAuthSignIn()` body with call to `buildOAuthUrl()` + Tauri shell open
    - Replace inline `handleDeviceFlow()` body with call to `startDeviceFlow()` + `pollDeviceFlow()`
    - Replace inline `cancelAuth()` body with call to imported `cancelAuth()`
    - Replace inline `fetchModels()` body with call to imported `fetchModels()`
  - Keep SetupWizard-specific UI: step progress indicator, next/back buttons, wizard flow
  - Keep Svelte 4 syntax (SetupWizard is NOT being migrated to Svelte 5 in this plan — it's not being touched beyond OAuth wiring)

  **Must NOT do**:
  - Do NOT change wizard step flow or navigation
  - Do NOT change any non-OAuth parts of SetupWizard
  - Do NOT migrate to Svelte 5 (SetupWizard is not in scope for migration)
  - Do NOT modify the wizard's completion behavior

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Same pattern as Task 8 but in a different file with wizard context
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Task 12 (integration verification)
  - **Blocked By**: Task 2 (needs oauth.ts)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/SetupWizard.svelte:100-300` — Inline OAuth functions to replace. Compare with Settings version to confirm same logic
  - `ogre-desktop/src/pages/settings/ProviderSettings.svelte` — After Task 8, this shows the pattern for how oauth.ts was wired — follow same pattern
  - `ogre-desktop/src/lib/oauth.ts` — The shared module to import from

  **API/Type References**:
  - `ogre-desktop/src/lib/oauth.ts` — Same imports as Task 8: `buildOAuthUrl`, `startDeviceFlow`, `pollDeviceFlow`, `fetchModels`, `cancelAuth`

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - `SetupWizard.svelte:100-300`: Contains the duplicated OAuth logic to replace
  - `ProviderSettings.svelte`: Task 8 already wired this — follow the same integration pattern for consistency
  - `oauth.ts`: Function signatures to call correctly

  **Acceptance Criteria**:
  - [ ] SetupWizard.svelte imports from `../lib/oauth`
  - [ ] No inline OAuth function bodies remain in SetupWizard
  - [ ] Wizard step flow unchanged (4 steps)
  - [ ] `cd ogre-desktop && npm run test` → PASS
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: OAuth logic replaced with imports in SetupWizard
    Tool: Bash
    Preconditions: Tasks 2 complete
    Steps:
      1. Read SetupWizard.svelte
      2. Search for `import.*oauth` — assert found
      3. Search for inline fetch logic (device flow polling bodies) — assert NOT found
      4. Search for `buildOAuthUrl(` or `startDeviceFlow(` function calls — assert found
    Expected Result: Shared imports present, no inline OAuth logic
    Failure Indicators: No import, inline logic still present
    Evidence: .sisyphus/evidence/task-9-wizard-wiring.txt

  Scenario: SetupWizard step flow intact
    Tool: Bash
    Preconditions: OAuth wiring complete
    Steps:
      1. Read SetupWizard.svelte
      2. Search for step management variables (currentStep, step indicators)
      3. Assert step 1, 2, 3, 4 logic still present
      4. Build passes: `cd ogre-desktop && npm run build`
    Expected Result: 4-step wizard flow preserved
    Failure Indicators: Missing step logic, broken navigation between steps
    Evidence: .sisyphus/evidence/task-9-wizard-steps.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-wizard-wiring.txt — import and logic verification
  - [ ] task-9-wizard-steps.txt — step flow verification

  **Commit**: YES (groups with Task 8)
  - Message: `refactor(oauth): wire shared oauth.ts into Settings and SetupWizard`
  - Files: `src/pages/SetupWizard.svelte`
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`

---

- [ ] 10. Svelte 5 Migration for App.svelte

  **What to do**:
  - Migrate `App.svelte` from Svelte 4 to Svelte 5 runes:
    - Replace all `export let` with `let { ... } = $props()` (if App receives any props from main.js)
    - Replace `let currentPage = 'dashboard'` with `let currentPage = $state('dashboard')`
    - Replace all `$:` reactive statements with `$derived()` or `$effect()`
    - Replace all `on:click` event handlers with `onclick`
    - Replace all `on:keydown`, `on:change`, etc. with `onkeydown`, `onchange`, etc.
    - Replace `onMount` with `$effect()` for side effects (or keep `onMount` for one-time init)
    - Replace `{#if condition}` event handlers if any use old syntax
  - Verify all sidebar navigation still works after migration
  - Verify all page routing still works
  - Verify theme switching still works (dark/light mode)

  **Must NOT do**:
  - Do NOT change functionality — syntax migration only
  - Do NOT change sidebar organization (already done in Task 6)
  - Do NOT add new features
  - Do NOT change routing logic
  - Do NOT migrate other files that App.svelte imports (only App.svelte itself)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Systematic syntax migration of a 417-line file with routing, state, and event handling
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12)
  - **Blocks**: Task 12 (integration verification)
  - **Blocked By**: Task 6 (sidebar reorg must be complete first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/App.svelte` — THE file to migrate — read fully to catalog all Svelte 4 patterns
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-30` — Reference implementation of Svelte 5 runes in this codebase
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1-30` — Another Svelte 5 runes example for `$state()` and `$effect()` patterns

  **External References**:
  - Svelte 5 migration guide: `https://svelte.dev/docs/svelte/v5-migration-guide` — Comprehensive pattern-by-pattern migration reference

  **WHY Each Reference Matters**:
  - `App.svelte`: The file being migrated — need to find every Svelte 4 pattern
  - `GradingPanel.svelte`: Shows how this project writes Svelte 5 — follow same conventions (spacing, naming, etc.)
  - Migration guide: Authoritative reference for edge cases (e.g., `$:` blocks with side effects vs derived values)

  **Acceptance Criteria**:
  - [ ] Zero `export let` in App.svelte
  - [ ] Zero `$:` reactive declarations in App.svelte
  - [ ] Zero `on:click` or `on:keydown` etc. in App.svelte
  - [ ] Uses `$state()`, `$derived()`, `$effect()` where appropriate
  - [ ] All navigation works (8 pages accessible)
  - [ ] Theme switching works
  - [ ] `cd ogre-desktop && npm run build` → passes

  **QA Scenarios:**

  ```
  Scenario: No Svelte 4 patterns remain in App.svelte
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Run ast_grep_search for `export let` in App.svelte — assert 0 matches
      2. Run ast_grep_search for `$:` in App.svelte (outside strings/comments) — assert 0 matches
      3. Run grep for `on:click` in App.svelte — assert 0 matches
      4. Run grep for `on:keydown` in App.svelte — assert 0 matches
      5. Run ast_grep_search for `$state(` in App.svelte — assert 1+ matches
    Expected Result: Zero Svelte 4, multiple Svelte 5 patterns
    Failure Indicators: Any Svelte 4 pattern found
    Evidence: .sisyphus/evidence/task-10-svelte5-check.txt

  Scenario: All pages still accessible
    Tool: Playwright (playwright skill)
    Preconditions: App running with migrated App.svelte
    Steps:
      1. Click each of the 8 sidebar items
      2. Assert each page loads without error
      3. Assert theme toggle still works (switch dark → light → dark)
    Expected Result: All 8 pages work, theme switching works
    Failure Indicators: Page not loading, JavaScript errors, theme not changing
    Evidence: .sisyphus/evidence/task-10-navigation.png
  ```

  **Evidence to Capture:**
  - [ ] task-10-svelte5-check.txt — ast_grep results
  - [ ] task-10-navigation.png — navigation test screenshots

  **Commit**: YES (groups with Task 11)
  - Message: `refactor(svelte5): migrate App.svelte and Settings sub-components to runes`
  - Files: `src/App.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

---

- [ ] 11. Svelte 5 Migration for Settings Sub-Components

  **What to do**:
  - Migrate ALL 6 Settings files to Svelte 5 runes:
    - `settings/Settings.svelte` (shell)
    - `settings/ThemeSettings.svelte`
    - `settings/ProviderSettings.svelte`
    - `settings/CredentialSettings.svelte`
    - `settings/EmbeddingSettings.svelte`
    - `settings/ColumnSettings.svelte`
  - For each file:
    - Replace `export let` with `let { ... } = $props()`
    - Replace `$:` reactive statements with `$derived()` or `$effect()`
    - Replace `on:click` etc. with `onclick` etc.
    - Replace `oauthStatus = { ...oauthStatus }` reactivity hacks with direct `$state()` mutations
    - Replace `onMount` with `$effect()` where appropriate
  - **Special attention to ProviderSettings.svelte**: This has OAuth state that used the `{ ...spread }` reactivity hack — with `$state()`, direct mutation works and these hacks can be removed

  **Must NOT do**:
  - Do NOT change functionality — syntax migration only
  - Do NOT change prop interfaces between shell and sub-components
  - Do NOT modify non-Settings files
  - Do NOT remove the `{ ...spread }` hacks until confirming `$state()` handles the same reactivity

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Migrating 6 files with reactive state, especially the OAuth reactivity hacks
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 12)
  - **Blocks**: Task 12 (integration verification)
  - **Blocked By**: Tasks 4 (sub-components exist) and 8 (OAuth wiring done first)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/settings/*.svelte` — All 6 files to migrate (created in Task 4, modified in Task 8)
  - `ogre-desktop/src/pages/GradingPanel.svelte:1-50` — Svelte 5 runes reference implementation
  - `ogre-desktop/src/components/grading/BatchPanel.svelte:1-50` — Svelte 5 `$state()` pattern, especially for complex state objects

  **External References**:
  - Svelte 5 migration guide: `https://svelte.dev/docs/svelte/v5-migration-guide`
  - Svelte 5 `$state()` deep reactivity: `https://svelte.dev/docs/svelte/$state` — Explains why `{ ...spread }` hacks are no longer needed

  **WHY Each Reference Matters**:
  - `settings/*.svelte`: The files being migrated
  - `GradingPanel/BatchPanel`: Show how this project already uses Svelte 5 — match conventions
  - `$state()` docs: Critical for understanding that `$state()` objects are deeply reactive — the `{ ...spread }` hack removal depends on this

  **Acceptance Criteria**:
  - [ ] Zero `export let` across all 6 Settings files
  - [ ] Zero `$:` across all 6 Settings files
  - [ ] Zero `on:click` etc. across all 6 Settings files
  - [ ] Zero `{ ...spread }` reactivity hacks in ProviderSettings.svelte
  - [ ] All use `$props()`, `$state()`, `$derived()` or `$effect()` where appropriate
  - [ ] `cd ogre-desktop && npm run build` → passes
  - [ ] `cd ogre-desktop && npm run test` → passes

  **QA Scenarios:**

  ```
  Scenario: No Svelte 4 patterns in any Settings file
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. For each of the 6 files in src/pages/settings/:
         - ast_grep_search for `export let` — assert 0
         - grep for `on:click` — assert 0
         - grep for `$:` (outside template expressions) — assert 0
      2. Grep ProviderSettings.svelte for `= { ...` spread hacks — assert 0
    Expected Result: Zero Svelte 4 patterns across all Settings files
    Failure Indicators: Any legacy pattern found
    Evidence: .sisyphus/evidence/task-11-svelte5-check.txt

  Scenario: Build and tests pass
    Tool: Bash
    Preconditions: All 6 files migrated
    Steps:
      1. Run `cd ogre-desktop && npm run test`
      2. Run `cd ogre-desktop && npm run build`
      3. Assert both exit code 0
    Expected Result: Tests green, build succeeds
    Failure Indicators: Type errors, reactive bugs, missing imports
    Evidence: .sisyphus/evidence/task-11-build-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-11-svelte5-check.txt — pattern check results
  - [ ] task-11-build-test.txt — build + test output

  **Commit**: YES (groups with Task 10)
  - Message: `refactor(svelte5): migrate App.svelte and Settings sub-components to runes`
  - Files: `src/pages/settings/*.svelte`
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`

---

- [ ] 12. Integration Build Verification + Fixup

  **What to do**:
  - This is the final integration task before verification wave
  - Run full build: `cd ogre-desktop && npm run build`
  - Run full test suite: `cd ogre-desktop && npm run test`
  - If any errors:
    1. Read error messages carefully
    2. Identify which task's changes caused the issue
    3. Fix the issue in the responsible file
    4. Re-run build + tests until both pass
  - Verify no stale imports (old paths to Settings.svelte or BatchPanel.svelte)
  - Verify no duplicate file references (old + new paths existing simultaneously)
  - Run `ast_grep_search` across ALL modified files for:
    - Svelte 4 patterns in files that should be migrated (App, Dashboard, Settings sub-components)
    - Confirm Svelte 4 patterns STILL EXIST in files not being migrated (History, Browser, Rubrics, etc.)
  - Clean up any temporary files or debug code

  **Must NOT do**:
  - Do NOT make behavioral changes — only fix integration issues
  - Do NOT migrate files beyond the scope (touch-only rule)
  - Do NOT add features or optimize

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cross-cutting integration debugging requires understanding all 11 prior tasks
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 2 and 3 tasks)
  - **Parallel Group**: Wave 3 (runs after Tasks 10 and 11)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: All Tasks 1-11

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/App.svelte` — Main shell — verify imports from new paths (settings/Settings.svelte, icons/, etc.)
  - `ogre-desktop/src/pages/GradingPanel.svelte` — Verify import from new path (batch/BatchPanel.svelte)
  - `ogre-desktop/src/pages/SetupWizard.svelte` — Verify oauth.ts import
  - `ogre-desktop/src/pages/settings/*.svelte` — All Settings sub-components
  - `ogre-desktop/src/components/grading/batch/*.svelte` — All BatchPanel sub-components

  **WHY Each Reference Matters**:
  - Every file touched by Tasks 1-11 must be verified as part of the integration check

  **Acceptance Criteria**:
  - [ ] `cd ogre-desktop && npm run build` → PASS, zero errors, zero warnings
  - [ ] `cd ogre-desktop && npm run test` → PASS, all tests green
  - [ ] No stale imports to old file paths
  - [ ] No duplicate files (old + new versions)
  - [ ] Svelte 4 patterns ONLY in files not being migrated
  - [ ] Svelte 5 patterns in ALL migrated files
  - [ ] No `console.log` debug statements left
  - [ ] No commented-out code blocks left

  **QA Scenarios:**

  ```
  Scenario: Full build and test suite
    Tool: Bash
    Preconditions: All Tasks 1-11 committed
    Steps:
      1. Run `cd ogre-desktop && npm run build` — capture full output
      2. Run `cd ogre-desktop && npm run test` — capture full output
      3. Assert both exit code 0
      4. Assert zero warnings in build output
    Expected Result: Clean build + all tests pass
    Failure Indicators: Any error or warning
    Evidence: .sisyphus/evidence/task-12-full-build.txt

  Scenario: No stale imports
    Tool: Bash
    Preconditions: All changes committed
    Steps:
      1. Grep all `.svelte` and `.ts` files for `./pages/Settings.svelte` (old path) — assert 0
      2. Grep for `./BatchPanel.svelte` (old direct import) in GradingPanel — assert uses `./batch/BatchPanel.svelte`
      3. Grep for any import of files that no longer exist
    Expected Result: All imports point to new paths
    Failure Indicators: Any reference to old file paths
    Evidence: .sisyphus/evidence/task-12-stale-imports.txt

  Scenario: Svelte version compliance
    Tool: Bash
    Preconditions: All changes committed
    Steps:
      1. For migrated files (App, Dashboard, settings/*), ast_grep for `export let` — assert 0
      2. For untouched files (History, Browser, Rubrics, Skills, Logs, SiteProfiles), ast_grep for `export let` — assert these STILL have Svelte 4 (confirming touch-only)
    Expected Result: Migrated files = Svelte 5 only. Untouched files = Svelte 4 (unchanged)
    Failure Indicators: Svelte 4 in migrated file, or Svelte 5 in untouched file
    Evidence: .sisyphus/evidence/task-12-svelte-compliance.txt
  ```

  **Evidence to Capture:**
  - [ ] task-12-full-build.txt — build + test output
  - [ ] task-12-stale-imports.txt — import verification
  - [ ] task-12-svelte-compliance.txt — Svelte version check per file

  **Commit**: YES
  - Message: `chore(verify): integration build verification and fixups`
  - Files: various (only files with actual fixes)
  - Pre-commit: `cd ogre-desktop && npm run test && npm run build`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cd ogre-desktop && npm run build` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no Svelte 4 patterns in migrated files (`ast_grep_search` for `$:`, `export let`, `on:click`).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Start the desktop app. Navigate every sidebar item. Verify: 3 sidebar groups visible, labels match plan (Grade Now, Grading History, etc.), Dashboard has 3+ CTAs, clicking CTAs navigates correctly, Settings has 5 tabs/sections, grading flow still works end-to-end. Save screenshots.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message | Key Files | Pre-commit Check |
|--------------|---------------|-----------|-----------------|
| 1 | `chore(test): add vitest infrastructure for ogre-desktop` | `vitest.config.ts`, `package.json` | `npm run build` |
| 2 | `test(oauth): add test suite for oauth.ts and reconcile with inline OAuth code` | `src/lib/__tests__/oauth.test.ts`, possibly `src/lib/oauth.ts` | `npm run test && npm run build` |
| 3 | `refactor(icons): extract sidebar icons to component files` | `src/components/icons/*.svelte` | `npm run build` |
| 4 | `refactor(settings): split Settings.svelte into focused sub-components` | `src/pages/settings/*.svelte` | `npm run build` |
| 5 | `refactor(batch): split BatchPanel into focused sub-components` | `src/components/grading/batch/*.svelte` | `npm run build` |
| 6, 7 | `feat(ux): reorganize sidebar, rename labels, add Dashboard CTAs` | `src/App.svelte`, `src/pages/Dashboard.svelte` | `npm run build` |
| 8, 9 | `refactor(oauth): wire shared oauth.ts into Settings and SetupWizard` | `src/pages/settings/ProviderSettings.svelte`, `src/pages/SetupWizard.svelte` | `npm run test && npm run build` |
| 10, 11 | `refactor(svelte5): migrate App.svelte and Settings sub-components to runes` | `src/App.svelte`, `src/pages/settings/*.svelte` | `npm run build` |
| 12 | `chore(verify): integration build verification and fixups` | various | `npm run test && npm run build` |

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npm run build          # Expected: Build succeeds, zero errors
cd ogre-desktop && npm run test           # Expected: All tests pass
```

### Final Checklist
- [ ] Settings.svelte shell < 100 lines (was 1,460)
- [ ] BatchPanel shell < 150 lines (was 2,389)
- [ ] OAuth logic in exactly 1 `.ts` file
- [ ] Sidebar has 3 groups (Primary / Tools / System)
- [ ] Dashboard has 3+ CTAs that navigate correctly
- [ ] All labels match rename table
- [ ] All touched files use Svelte 5 runes
- [ ] No Svelte 4 patterns in migrated files
- [ ] Build passes
- [ ] Tests pass
- [ ] No new dependencies added
- [ ] No changes outside `ogre-desktop/src/`
