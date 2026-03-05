# Skills System for O.G.R.E Desktop

## TL;DR

> **Quick Summary**: Add a full Skills management system to O.G.R.E Desktop — a new sidebar tab with skill CRUD, marketplace search via skills.sh API, AI-powered skill creation chatbot with TDD workflow, .md file upload, and per-session skill activation that injects into grading and solver chat prompts.
> 
> **Deliverables**:
> - New `Skills` page with 3 sub-views (My Skills / Find Skills / Create Skill)
> - SQLite `skills` table (Migration v8) + full CRUD in db.ts
> - skills.sh marketplace search + preview + install flow
> - AI chatbot for guided skill creation (interview → TDD generation)
> - .md file upload with YAML frontmatter parsing
> - Per-session skill activation multi-select in grading/solver UI
> - Skill content injection via existing `systemPrompt` and `customInstructions` fields
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 2 (DB) → Task 6 (Injection) → Task 7 (Chatbot) → Task 8 (Integration) → Final Verification

---

## Context

### Original Request
User wants a skills implementation similar to OpenCode/Claude Code. A separate tab for skills, built-in create skill and find skill that calls Vercel's skills.sh and searches. Users can also upload a skill. The create skill should use the superpowers:writing-skills approach and be a chatbot that asks the user to describe the skill.

### Interview Summary
**Key Discussions**:
- Skill usage: Prompt injection into BOTH grading and solver chat contexts
- Storage: SQLite table in ogre.db (consistent with existing patterns)
- Create Skill AI: Uses whatever provider/model is currently active in Settings
- Tab layout: Sub-views with toolbar (My Skills / Find Skills / Create Skill buttons)
- Activation model: Per-session multi-select dropdown in grading/solver panel
- Marketplace install: Preview skill content → Install button saves to SQLite
- Create Skill chatbot: Two-phase — (1) guided conversation collecting requirements, (2) TDD workflow generates skill, tests against pressure test, iterates
- Upload format: Single .md file with optional YAML frontmatter
- Server changes: NONE — use existing `systemPrompt` (solver) and `customInstructions` (batch) fields
- Test strategy: TDD with vitest (existing test infrastructure)

### Metis Review
**Identified Gaps** (addressed):
- skills.sh only returns search metadata, not content — need GitHub raw URL spike (→ Task 1)
- Context window overflow risk from large skills — add size warnings (→ Task 6 guardrail)
- No markdown renderer in project — add `marked` package (→ Task 4)
- No YAML frontmatter parser — add `gray-matter` package (→ Task 4)
- XSS risk from markdown rendering — sanitize HTML output (→ Task 4)
- `systemPrompt` already exists in server but SolverChat doesn't use it — wire it up (→ Task 6)
- Tauri HTTP plugin may block external domains — verify security scope (→ Task 1)
- Duplicate skill installs — UNIQUE constraint on (source, source_id) (→ Task 2)
- SKILL.md format varies (with/without frontmatter) — support both (→ Task 4)

---

## Work Objectives

### Core Objective
Build a complete Skills management system that lets educators discover, create, and apply AI grading/tutoring skills — modeled after the OpenCode/Claude Code skills ecosystem but adapted for a desktop grading application.

### Concrete Deliverables
- `ogre-desktop/src/pages/Skills.svelte` — New page with 3 sub-views
- `ogre-desktop/src/lib/skills-db.ts` — Skills CRUD functions (or additions to db.ts)
- `ogre-desktop/src/lib/skills-api.ts` — Marketplace client + skill injection logic
- `ogre-desktop/src/lib/skill-parser.ts` — YAML frontmatter + markdown parsing
- `ogre-desktop/src/components/skills/SkillCard.svelte` — Reusable skill display card
- `ogre-desktop/src/components/skills/SkillSearch.svelte` — Marketplace search UI
- `ogre-desktop/src/components/skills/SkillCreator.svelte` — AI chatbot for skill creation
- `ogre-desktop/src/components/skills/SkillPicker.svelte` — Per-session multi-select dropdown
- Migration v8 in `src-tauri/src/lib.rs` — `skills` table
- Tests: `skills-db.test.ts`, `skills-api.test.ts`, `skill-parser.test.ts`

### Definition of Done
- [x] `cd ogre-desktop && npx vitest run` — ALL tests pass (existing + new)
- [x] `npm run dev` — Skills tab visible in sidebar, all 3 sub-views functional
- [x] Install skill from marketplace → appears in My Skills list
- [x] Create skill via chatbot → appears in My Skills list
- [x] Upload .md file → appears in My Skills list
- [x] Activate skill → content appears in grading/solver AI prompts
- [x] Deactivate skill → content removed from subsequent AI calls

### Must Have
- Skills sidebar tab with icon
- My Skills list with activate/deactivate toggle and delete
- skills.sh search with preview and install
- AI chatbot for guided skill creation
- .md file upload with frontmatter parsing
- Per-session skill picker in grading/solver UI
- Skill content injection into existing prompt fields
- vitest unit tests for all new modules

### Must NOT Have (Guardrails)
- **NO skill editor/IDE** — textarea for raw markdown only. No syntax highlighting, no split-pane preview, no toolbar.
- **NO skill versioning** — install = snapshot into SQLite. No update tracking, no version comparison.
- **NO user accounts or publishing** — skills are local-only. No upload to skills.sh, no login.
- **NO skill categories/tags/ratings** — just name, description, content. Search by name is enough.
- **NO grading-server modifications** — skills are a frontend concern. Content concatenated client-side.
- **NO per-student skill selection** — skills are per-session. Dropdown selects for entire grading run.
- **NO rich markdown rendering in chat messages** — keep existing `pre-wrap` display. Only skill preview renders markdown.
- **NO new npm dependencies in grading-server** — only ogre-desktop gets `gray-matter` and `marked`.
- **NO skill dependency chains** — skills are independent. No "this skill requires that skill".
- **NO real-time skill preview during creation** — chatbot shows generated markdown as text, not rendered.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES (vitest configured, co-located *.test.ts files)
- **Automated tests**: TDD — write failing tests first, then implement
- **Framework**: vitest with `vi.mock()` for Tauri plugins
- **Pattern**: Follow `db.test.ts` — `vi.hoisted()`, `vi.mock('@tauri-apps/plugin-sql')`, `mockSelect`, `mockExecute`

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Logic/Data**: vitest unit tests — `npx vitest run src/lib/{file}.test.ts`
- **UI Components**: `npm run dev` + verify in dev server OR vitest component tests
- **API Integration**: vitest tests with mocked `tauriFetch`
- **End-to-End**: `npm run dev` in ogre-desktop + Playwright for final verification wave

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, 3 parallel):
├── Task 1: Spike: Validate skills.sh content URL pattern [quick]
├── Task 2: Database migration v8 + db.ts CRUD + TDD tests [unspecified-high]
└── Task 3: Skills page skeleton + sidebar navigation [visual-engineering]

Wave 2 (After Wave 1 — core features, 3 parallel):
├── Task 4: My Skills sub-view: list, preview, toggle, delete, upload [visual-engineering]
├── Task 5: Find Skills sub-view: marketplace search + install [unspecified-high]
└── Task 6: Skill injection into grading + solver chat [deep]

Wave 3 (After Wave 2 — complex feature + integration, 2 parallel):
├── Task 7: Create Skill chatbot sub-view [deep]
└── Task 8: Integration testing + polish [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 2 → Task 6 → Task 7 → Task 8 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 (Spike) | — | 5 | 1 |
| 2 (DB/CRUD) | — | 4, 5, 6, 7, 8 | 1 |
| 3 (Page skeleton) | — | 4, 5, 7 | 1 |
| 4 (My Skills) | 2, 3 | 8 | 2 |
| 5 (Find Skills) | 1, 2, 3 | 8 | 2 |
| 6 (Injection) | 2 | 7, 8 | 2 |
| 7 (Create chatbot) | 2, 3, 6 | 8 | 3 |
| 8 (Integration) | 4, 5, 6, 7 | F1-F4 | 3 |
| F1-F4 (Final) | 8 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `visual-engineering`
- **Wave 2**: 3 tasks — T4 → `visual-engineering`, T5 → `unspecified-high`, T6 → `deep`
- **Wave 3**: 2 tasks — T7 → `deep`, T8 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Spike: Validate skills.sh Content URL Pattern

  **What to do**:
  - Search skills.sh API for 3 known skills (e.g., "react", "typescript", "testing")
  - Extract `source` (GitHub owner/repo) and `skillId` fields from results
  - Try fetching raw content via these URL patterns:
    - `https://raw.githubusercontent.com/{source}/main/.claude/skills/{skillId}.md`
    - `https://raw.githubusercontent.com/{source}/main/.claude/skills/{skillId}/SKILL.md`
    - `https://raw.githubusercontent.com/{source}/main/skills/{skillId}/SKILL.md`
    - `https://raw.githubusercontent.com/{source}/master/.claude/skills/{skillId}.md`
  - Also check if `https://api.inference.sh/skills/{source}/{skillId}/content` works
  - Check `ogre-desktop/src-tauri/tauri.conf.json` for HTTP security scope — verify `skills.sh` and `raw.githubusercontent.com` are allowed domains (or that scope is permissive)
  - Document the working URL pattern as a constant in a new file `ogre-desktop/src/lib/skills-api.ts`
  - Write a vitest test that validates the URL builder function

  **Must NOT do**:
  - Do NOT build any UI
  - Do NOT install npm packages
  - Do NOT modify grading-server

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures TypeScript patterns match project conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 5 (Find Skills needs the URL pattern)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/grading-api.ts:8-10` — How `tauriFetch` is imported from `@tauri-apps/plugin-http`
  - `ogre-desktop/src/lib/grading-api.ts:171-177` — `authHeaders()` pattern for building request headers

  **API/Type References**:
  - skills.sh search endpoint: `GET https://skills.sh/api/search?q={query}&limit=10`
  - Response shape: `{ skills: [{ id, skillId, name, installs, source }] }`
  - GitHub raw content: `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`

  **External References**:
  - skills.sh API: `https://skills.sh`
  - Tauri HTTP plugin docs for security scope: `https://v2.tauri.app/plugin/http-client/`

  **WHY Each Reference Matters**:
  - `grading-api.ts` shows how to use `tauriFetch` correctly in this project (not `window.fetch`)
  - skills.sh search response tells us what fields are available for building the content URL
  - Tauri HTTP security scope may block external domains — must be verified before building marketplace

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file created: `ogre-desktop/src/lib/skills-api.test.ts`
  - [ ] Test: `buildSkillContentUrl()` produces correct URL from source + skillId
  - [ ] `cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Validate skills.sh search API returns data
    Tool: Bash (curl or node script)
    Preconditions: Internet connectivity
    Steps:
      1. Run: `curl -s "https://skills.sh/api/search?q=react&limit=3"`
      2. Parse JSON response
      3. Assert: response has `skills` array with at least 1 entry
      4. Assert: each entry has `source` and `skillId` fields
    Expected Result: JSON response with valid skill entries
    Failure Indicators: HTTP error, empty skills array, missing fields
    Evidence: .sisyphus/evidence/task-1-skills-sh-search.json

  Scenario: Validate raw content fetch from GitHub
    Tool: Bash (curl or node script)
    Preconditions: Working URL pattern identified from search results
    Steps:
      1. Take first result's `source` and `skillId`
      2. Build URL using identified pattern
      3. Fetch raw content
      4. Assert: HTTP 200, response body contains markdown text
    Expected Result: Valid markdown content downloaded
    Failure Indicators: HTTP 404, empty body, HTML error page
    Evidence: .sisyphus/evidence/task-1-content-fetch.md

  Scenario: Verify Tauri HTTP scope allows external domains
    Tool: Bash (read tauri.conf.json)
    Preconditions: None
    Steps:
      1. Read `ogre-desktop/src-tauri/tauri.conf.json`
      2. Find HTTP plugin security scope configuration
      3. Assert: scope allows `https://skills.sh/*` and `https://raw.githubusercontent.com/*`
         OR scope is permissive (allows all HTTPS)
    Expected Result: External domains are reachable via tauriFetch
    Failure Indicators: Explicit deny list blocking these domains
    Evidence: .sisyphus/evidence/task-1-tauri-scope.txt
  ```

  **Commit**: YES
  - Message: `spike(skills): validate skills.sh content URL pattern and Tauri HTTP scope`
  - Files: `src/lib/skills-api.ts`, `src/lib/skills-api.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts`

- [x] 2. Database Migration v8 + Skills CRUD + TDD Tests

  **What to do**:
  - **TDD First**: Write failing tests in `ogre-desktop/src/lib/db.test.ts` (or new `skills-db.test.ts`) for all CRUD operations before implementing
  - Add Migration v8 in `ogre-desktop/src-tauri/src/lib.rs` following the exact pattern of migrations 1-7:
    ```sql
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source TEXT,
      source_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source ON skills(source, source_id) WHERE source IS NOT NULL;
    ```
  - Add `Skill` TypeScript interface in `db.ts` (following `SiteProfile` pattern):
    ```typescript
    export interface Skill {
      id: string;
      name: string;
      description: string;
      content: string;
      source: string | null;
      source_id: string | null;
      is_active: number;
      created_at: string;
      updated_at: string;
    }
    ```
  - Add CRUD functions following existing patterns (`getSiteProfiles`, `saveSiteProfile`, `deleteSiteProfile`):
    - `getSkills(): Promise<Skill[]>` — all skills ordered by name
    - `getActiveSkills(): Promise<Skill[]>` — skills where is_active=1
    - `getSkill(id: string): Promise<Skill | null>` — single skill by id
    - `saveSkill(skill: {...}): Promise<string>` — upsert, returns id
    - `updateSkillActive(id: string, isActive: number): Promise<void>` — toggle active state
    - `deleteSkill(id: string): Promise<void>` — remove skill
    - `getSkillBySource(source: string, sourceId: string): Promise<Skill | null>` — check duplicates

  **Must NOT do**:
  - Do NOT create any UI components
  - Do NOT modify any existing migration (versions 1-7)
  - Do NOT add columns to existing tables
  - Do NOT use `lastInsertId` for TEXT primary keys (use `crypto.randomUUID()` like `saveSiteProfile`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures TypeScript patterns, test patterns match project conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 8 (everything needs DB)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src-tauri/src/lib.rs:632-743` — Migrations 1-7 pattern. MUST follow exact `Migration { version: 8, description: "...", sql: "...", kind: MigrationKind::Up }` structure
  - `ogre-desktop/src/lib/db.ts:46-57` — `SiteProfile` interface pattern (id TEXT PK, typed fields)
  - `ogre-desktop/src/lib/db.ts:387-465` — Site profile CRUD functions pattern (`getSiteProfiles`, `saveSiteProfile`, `deleteSiteProfile`). Follow this exact pattern for skills.
  - `ogre-desktop/src/lib/db.ts:74-79` — `initDB()` singleton pattern

  **Test References**:
  - `ogre-desktop/src/lib/db.test.ts` — Test mocking pattern with `vi.hoisted()`, `vi.mock('@tauri-apps/plugin-sql')`, `mockSelect`, `mockExecute`. Follow this exact structure.

  **WHY Each Reference Matters**:
  - `lib.rs` migrations: Version number MUST be 8, MUST follow struct format or Tauri SQL plugin crashes
  - `db.ts` SiteProfile: Closest existing analogue to Skills — TEXT PK, CRUD with upsert, `crypto.randomUUID()`
  - `db.test.ts`: Mock pattern is non-obvious (hoisted mocks, Database.load mock) — must be copied exactly

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `ogre-desktop/src/lib/db.test.ts` (extended) or `skills-db.test.ts` (new)
  - [ ] Tests written FIRST (RED): getSkills, getActiveSkills, saveSkill, updateSkillActive, deleteSkill, getSkillBySource
  - [ ] All tests PASS (GREEN) after implementation
  - [ ] `cd ogre-desktop && npx vitest run src/lib/db.test.ts` → PASS (all existing + new)

  **QA Scenarios:**

  ```
  Scenario: Skills CRUD operations work correctly
    Tool: Bash (vitest)
    Preconditions: ogre-desktop dependencies installed
    Steps:
      1. Run: `cd ogre-desktop && npx vitest run src/lib/db.test.ts`
      2. Assert: All skill-related tests pass
      3. Specifically verify: saveSkill returns UUID, getSkills returns array, deleteSkill removes row
    Expected Result: All tests pass with 0 failures
    Failure Indicators: Any test failure in skills-related describe blocks
    Evidence: .sisyphus/evidence/task-2-db-tests.txt

  Scenario: Migration v8 SQL is valid
    Tool: Bash (grep + read)
    Preconditions: None
    Steps:
      1. Read `ogre-desktop/src-tauri/src/lib.rs`
      2. Find Migration with version: 8
      3. Assert: SQL contains CREATE TABLE skills with all required columns
      4. Assert: UNIQUE INDEX on (source, source_id) exists
      5. Assert: Migration is added to the `migrations` vec before `.build()`
    Expected Result: Valid migration v8 with correct schema
    Failure Indicators: Missing migration, wrong version number, invalid SQL
    Evidence: .sisyphus/evidence/task-2-migration-v8.sql

  Scenario: Duplicate marketplace skill detection works
    Tool: Bash (vitest)
    Preconditions: Skills CRUD tests exist
    Steps:
      1. Run test: saveSkill with source="owner/repo", source_id="skill-name"
      2. Run: getSkillBySource("owner/repo", "skill-name")
      3. Assert: Returns the saved skill
      4. Run: saveSkill with SAME source+source_id
      5. Assert: Updates existing (upsert), doesn't create duplicate
    Expected Result: Duplicate detection via UNIQUE index works
    Failure Indicators: Duplicate entries created, constraint error not handled
    Evidence: .sisyphus/evidence/task-2-duplicate-detection.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add skills table migration and CRUD operations`
  - Files: `src-tauri/src/lib.rs`, `src/lib/db.ts`, `src/lib/db.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/db.test.ts`

- [x] 3. Skills Page Skeleton + Sidebar Navigation

  **What to do**:
  - Create `ogre-desktop/src/pages/Skills.svelte` with:
    - Internal state: `let currentView = $state<'my-skills' | 'find-skills' | 'create-skill'>('my-skills');`
    - Toolbar with 3 buttons: My Skills, Find Skills, Create Skill
    - Conditional rendering: `{#if currentView === 'my-skills'}` etc.
    - Placeholder content for each view ("Coming soon" or empty state)
    - Follow existing page patterns from `Rubrics.svelte` for toolbar layout
  - Modify `ogre-desktop/src/App.svelte`:
    - Add import: `import Skills from './pages/Skills.svelte';`
    - Add sidebar button between 'Site Profiles' and 'Browser' (or after Settings) following exact pattern from lines 169-211:
      ```svelte
      <button class:active={currentPage === 'skills'} on:click={() => navigate('skills')} title="Skills">
        <span class="icon"><!-- puzzle piece or lightbulb SVG --></span>
        <span class="label">Skills</span>
      </button>
      ```
    - Add conditional render: `{:else if currentPage === 'skills'} <Skills />`
  - Use an appropriate SVG icon (puzzle piece, lightbulb, or magic wand — all inline, no external icon library)

  **Must NOT do**:
  - Do NOT implement any sub-view content (just placeholders)
  - Do NOT add any database calls
  - Do NOT install any npm packages
  - Do NOT modify the sidebar collapse/expand behavior (follow existing pattern exactly)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `coding-standards`]
    - `frontend-ui-ux`: Sidebar navigation UX, toolbar design, empty states
    - `coding-standards`: Svelte 5 patterns, CSS variable usage

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 7 (sub-views need the page shell)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/App.svelte:169-211` — Sidebar navigation buttons. Copy this EXACT pattern for the Skills button (icon SVG + label span + class:active binding + on:click navigate)
  - `ogre-desktop/src/App.svelte:216-230` — Conditional page rendering. Add `{:else if currentPage === 'skills'} <Skills />` following this exact pattern
  - `ogre-desktop/src/App.svelte:2-9` — Page imports. Add Skills import here
  - `ogre-desktop/src/pages/Rubrics.svelte` — Page with internal sub-views (editing, isNew, showImport states). Closest pattern for Skills toolbar layout

  **External References**:
  - Svelte 5 `$state` rune: `https://svelte.dev/docs/svelte/$state`

  **WHY Each Reference Matters**:
  - App.svelte navigation: Adding a nav button requires EXACT pattern match (CSS classes, event handlers, icon structure) or it breaks styling
  - Rubrics.svelte: Shows how to build a page with toolbar + conditional sub-views using Svelte 5 state

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Skills tab appears in sidebar and is navigable
    Tool: Bash (npm run dev + visual inspection via Playwright)
    Preconditions: `npm install` completed in ogre-desktop
    Steps:
      1. Run: `cd ogre-desktop && npm run build` (verify no compile errors)
      2. Assert: Build succeeds with exit code 0
      3. Verify: Skills.svelte exists at `src/pages/Skills.svelte`
      4. Verify: App.svelte imports Skills component
      5. Verify: Sidebar nav has Skills button with icon
      6. Verify: Conditional render for 'skills' page exists
    Expected Result: Build succeeds, all navigation wiring in place
    Failure Indicators: Build failure, missing import, missing nav button
    Evidence: .sisyphus/evidence/task-3-build-output.txt

  Scenario: Sub-view toolbar renders and switches views
    Tool: Bash (grep verification of component structure)
    Preconditions: Skills.svelte created
    Steps:
      1. Read Skills.svelte source
      2. Assert: Contains `$state` variable for currentView
      3. Assert: Contains 3 toolbar buttons (My Skills, Find Skills, Create Skill)
      4. Assert: Contains `{#if currentView === 'my-skills'}` conditional blocks
      5. Assert: Uses CSS variables from app.css (--color-*, --spacing-*)
    Expected Result: Component has correct structure with all 3 sub-views
    Failure Indicators: Missing state variable, missing conditionals, hardcoded colors
    Evidence: .sisyphus/evidence/task-3-skills-page-structure.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add Skills page skeleton and sidebar navigation`
  - Files: `src/App.svelte`, `src/pages/Skills.svelte`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [x] 4. My Skills Sub-View — Card List, Upload, Preview, Toggle, Delete

  **What to do**:
  - Install npm dependencies: `gray-matter` (YAML frontmatter parsing) and `marked` (markdown rendering) in `ogre-desktop/package.json`
  - Create `src/lib/skill-parser.ts` with:
    - `parseSkillMarkdown(content: string): ParsedSkill` — extracts frontmatter (name, description, author, tags) and body content
    - Support BOTH formats: with YAML frontmatter (`---\nyaml\n---\nbody`) and without (plain markdown)
    - If no frontmatter: use first `# heading` as name, first paragraph as description
    - `renderSkillPreview(content: string): string` — renders markdown body to sanitized HTML
    - Sanitize output: strip `<script>`, `<iframe>`, `on*` attributes, `javascript:` URLs to prevent XSS
  - Create `src/components/skills/SkillCard.svelte`:
    - Displays: skill name, description (truncated to 2 lines), source badge ("Local" / "Marketplace" / "Created"), active toggle switch
    - Active toggle calls `updateSkill(id, { is_active })` from db.ts
    - Delete button with confirmation dialog ("Are you sure?") calls `deleteSkill(id)` from db.ts
    - Click card body → expand to show full preview (rendered markdown)
  - Build the My Skills sub-view inside `src/pages/Skills.svelte`:
    - Fetch skills from SQLite via `getSkills()` on mount using `$effect`
    - Render as a grid/list of `SkillCard` components
    - Empty state: centered message "No skills yet — upload a .md file or find one in the marketplace"
    - "Upload Skill" button in toolbar area:
      - Uses `<input type="file" accept=".md">` (hidden, triggered by button click)
      - On file select: read file content, parse with `parseSkillMarkdown()`, validate name exists
      - Save to SQLite via `saveSkill({ name, description, content, source: 'local', is_active: false })`
      - Show toast/notification on success or error
      - Refresh skill list after upload
  - Write vitest tests:
    - `src/lib/skill-parser.test.ts`: Test parseSkillMarkdown with frontmatter, without frontmatter, empty content, malformed YAML
    - `src/lib/skill-parser.test.ts`: Test renderSkillPreview strips XSS vectors (`<script>`, `onerror=`, `javascript:`)
    - `src/components/skills/__tests__/SkillCard.test.ts`: Test toggle calls updateSkill, delete shows confirm then calls deleteSkill

  **Must NOT do**:
  - Do NOT use a rich text editor — markdown only
  - Do NOT allow `.txt`, `.json`, or other file types for upload
  - Do NOT render unsanitized HTML from markdown
  - Do NOT import from or modify anything in `grading-server/`

  **Recommended Agent Profile**:
  > My Skills is a visual component task with significant UI layout + interaction.
  - **Category**: `visual-engineering`
    - Reason: Primary deliverable is a visual UI sub-view with card grid, toggle switches, preview panels, empty states, and file upload UX
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures TypeScript/Svelte patterns follow project conventions (Svelte 5 runes, CSS variables)
  - **Skills Evaluated but Omitted**:
    - `vercel-react-best-practices`: React-specific, not applicable to Svelte 5

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: [Task 7, Task 8]
  - **Blocked By**: [Task 2 (DB CRUD), Task 3 (Skills page skeleton)]

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/SolverChat.svelte` — Svelte 5 component structure pattern: `$state` for reactive variables, `$effect` for lifecycle, CSS variable usage. Specifically lines 1-50 for state setup and the `<style>` section for CSS variable conventions.
  - `ogre-desktop/src/pages/Settings.svelte` — Settings page layout pattern: card-based UI sections, form inputs, toggle switches. Use as reference for card grid layout and toggle styling.
  - `ogre-desktop/src/lib/db.ts` — `getSkills()`, `saveSkill()`, `updateSkill()`, `deleteSkill()` functions (created by Task 2). These are the CRUD operations the sub-view calls.

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/db.ts:Skill` — TypeScript interface for skill objects (created by Task 2). Fields: `id`, `name`, `description`, `content`, `source`, `source_id`, `is_active`, `created_at`.

  **External References** (libraries and frameworks):
  - `gray-matter` npm package: `import matter from 'gray-matter'; const { data, content } = matter(rawMarkdown);` — data = frontmatter object, content = body string
  - `marked` npm package: `import { marked } from 'marked'; const html = marked(markdownString);` — renders markdown to HTML string
  - DOMPurify or manual sanitization: strip `<script>`, `<iframe>`, `on*` event handlers from rendered HTML

  **WHY Each Reference Matters**:
  - SolverChat.svelte: Copy the exact Svelte 5 patterns (runes, CSS vars) so the new component feels native
  - Settings.svelte: The card-based layout and toggle UI here is the closest visual pattern to what SkillCard needs
  - db.ts Skill interface: Every skill object passed between components must conform to this shape
  - gray-matter: Required for parsing YAML frontmatter — the key function for upload and content parsing
  - marked: Required for rendering skill preview — converts markdown body to displayable HTML

  **Acceptance Criteria**:
  - [ ] `npm install` succeeds with gray-matter and marked added to package.json
  - [ ] `npx vitest run src/lib/skill-parser.test.ts` → PASS (all parsing + XSS tests)
  - [ ] `npm run build` succeeds with no TypeScript errors in new files
  - [ ] SkillCard component exports correctly from `src/components/skills/SkillCard.svelte`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Upload a .md skill file with YAML frontmatter
    Tool: Bash (vitest + file system verification)
    Preconditions: Task 2 complete (DB CRUD available), Task 3 complete (Skills page exists)
    Steps:
      1. Create a test file `/tmp/test-skill.md` with content: `---\nname: Test Grading Skill\ndescription: A skill for testing\nauthor: TestUser\n---\n# Test Skill\nGrade strictly based on rubric criteria.`
      2. Run `npx vitest run src/lib/skill-parser.test.ts` to verify parser handles this format
      3. Assert: parseSkillMarkdown extracts name="Test Grading Skill", description="A skill for testing"
      4. Assert: renderSkillPreview returns HTML containing `<h1>Test Skill</h1>` and `<p>Grade strictly...`
      5. Assert: renderSkillPreview output does NOT contain any `<script>` tags
    Expected Result: Parser correctly extracts frontmatter and renders sanitized HTML
    Failure Indicators: Frontmatter not extracted, HTML contains unescaped script tags, test failures
    Evidence: .sisyphus/evidence/task-4-upload-frontmatter.txt

  Scenario: Upload a .md skill file WITHOUT frontmatter
    Tool: Bash (vitest)
    Preconditions: skill-parser.ts exists
    Steps:
      1. Test with content: `# Math Grading Helper\nFocus on showing work and partial credit.\n\n## Rules\n- Award partial credit for correct approach`
      2. Assert: parseSkillMarkdown extracts name="Math Grading Helper" (from first heading)
      3. Assert: description="Focus on showing work and partial credit." (from first paragraph)
      4. Assert: content field contains full original markdown
    Expected Result: Parser gracefully handles no-frontmatter format
    Failure Indicators: name is empty/undefined, description is empty
    Evidence: .sisyphus/evidence/task-4-upload-no-frontmatter.txt

  Scenario: XSS prevention in rendered markdown
    Tool: Bash (vitest)
    Preconditions: skill-parser.ts exists
    Steps:
      1. Test renderSkillPreview with content containing: `<script>alert('xss')</script>` and `<img onerror="alert('xss')" src="x">` and `[link](javascript:alert('xss'))`
      2. Assert: output does NOT contain `<script>`
      3. Assert: output does NOT contain `onerror=`
      4. Assert: output does NOT contain `javascript:`
    Expected Result: All XSS vectors stripped from rendered output
    Failure Indicators: Any script/event handler/javascript: URL present in output
    Evidence: .sisyphus/evidence/task-4-xss-prevention.txt

  Scenario: SkillCard toggle updates database
    Tool: Bash (vitest)
    Preconditions: SkillCard.svelte and db.ts mock available
    Steps:
      1. Run vitest for SkillCard component test
      2. Assert: Clicking toggle dispatches updateSkill(skillId, { is_active: true })
      3. Assert: Clicking delete shows confirmation, then dispatches deleteSkill(skillId)
    Expected Result: Card interactions correctly call DB functions
    Failure Indicators: Mock functions not called, wrong arguments passed
    Evidence: .sisyphus/evidence/task-4-skillcard-interactions.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add My Skills sub-view with upload and preview`
  - Files: `src/lib/skill-parser.ts`, `src/lib/skill-parser.test.ts`, `src/components/skills/SkillCard.svelte`, `src/components/skills/__tests__/SkillCard.test.ts`, `package.json`
  - Pre-commit: `cd ogre-desktop && npx vitest run && npm run build`


- [x] 5. Find Skills Sub-View — Marketplace Search, Preview, Install

  **What to do**:
  - Create `src/components/skills/SkillSearch.svelte`:
    - Search input with debounce (300ms) calling `searchSkills(query)` from `skills-api.ts`
    - Results displayed as cards: skill name, source (owner/repo), install count
    - Loading spinner during search, "No results" message for empty results
    - Error state for network failures: "Could not reach skills.sh. Check your internet connection."
  - Extend `src/lib/skills-api.ts` (created in Task 1) with:
    - `searchSkills(query: string, limit?: number): Promise<SkillSearchResult[]>` — calls `https://skills.sh/api/search?q={query}&limit={limit}`
    - `fetchSkillContent(source: string, skillId: string): Promise<string>` — fetches raw markdown from GitHub using URL pattern validated in Task 1
    - `SkillSearchResult` interface: `{ id, skillId, name, source, installs, description }`
    - All HTTP calls use `tauriFetch` from `@tauri-apps/plugin-http` (NOT `window.fetch`)
  - Build marketplace search flow:
    - User types in search input → debounced API call → results appear as cards
    - Click a result card → expand to show full skill preview (fetch content via `fetchSkillContent`, render with `renderSkillPreview` from skill-parser.ts)
    - Preview shows rendered markdown with "Install" button at bottom
    - "Install" button: check if already installed via `getSkillBySource()`, if yes show "Already Installed" badge, if no save via `saveSkill({ name, description, content, source, source_id: skillId, is_active: false })`
    - After install: show success toast, change button to "Installed ✓"
  - Also add a "Trending" or default view when search is empty:
    - On mount, fetch `https://skills.sh/api/skills/trending/0` to show popular skills
    - Display same card format as search results
  - Write vitest tests:
    - `src/lib/skills-api.test.ts` (extend): Test searchSkills with mocked tauriFetch response, test fetchSkillContent URL construction
    - `src/components/skills/__tests__/SkillSearch.test.ts`: Test search triggers API call, test install button calls saveSkill

  **Must NOT do**:
  - Do NOT use `window.fetch` — must use `tauriFetch` for all HTTP calls (CORS and Tauri security)
  - Do NOT cache search results in SQLite — always fresh from API
  - Do NOT add pagination — simple limit-based results (default limit=20) is sufficient
  - Do NOT implement skill ratings, reviews, or comments
  - Do NOT modify anything in `grading-server/`

  **Recommended Agent Profile**:
  > Find Skills combines API integration with UI rendering — primarily data-fetching logic with visual results.
  - **Category**: `unspecified-high`
    - Reason: Task involves HTTP API integration, data transformation, and error handling — more data-logic than pure visual design
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures TypeScript patterns, async/await error handling, and Svelte 5 conventions match project standards
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Card layout is straightforward, doesn't need dedicated design skill
    - `vercel-react-best-practices`: React-specific, not applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: [Task 8]
  - **Blocked By**: [Task 1 (URL pattern), Task 2 (DB CRUD), Task 3 (Skills page skeleton)]

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/grading-api.ts:8-10` — `tauriFetch` import pattern: `import { fetch as tauriFetch } from '@tauri-apps/plugin-http';`
  - `ogre-desktop/src/lib/grading-api.ts:171-177` — `authHeaders()` helper function pattern for building HTTP request options
  - `ogre-desktop/src/lib/grading-api.ts:12-50` — SSE streaming pattern (NOT needed here, but shows how tauriFetch is used for standard requests too)
  - `ogre-desktop/src/lib/skills-api.ts` — Created by Task 1 with `buildSkillContentUrl()` and validated URL pattern. Extend this file with `searchSkills()` and `fetchSkillContent()`.
  - `ogre-desktop/src/components/grading/SolverChat.svelte` — Loading states, error messages, Svelte 5 `$state` patterns for async UI

  **API/Type References** (contracts to implement against):
  - skills.sh search: `GET https://skills.sh/api/search?q={query}&limit=20` → `{ skills: [{ id, skillId, name, source, installs }] }`
  - skills.sh trending: `GET https://skills.sh/api/skills/trending/0` → same response shape
  - `ogre-desktop/src/lib/db.ts:Skill` — Skill interface (created by Task 2) for the install flow
  - `ogre-desktop/src/lib/db.ts:getSkillBySource()` — For duplicate detection before install
  - `ogre-desktop/src/lib/db.ts:saveSkill()` — For saving installed skill to SQLite
  - `ogre-desktop/src/lib/skill-parser.ts:renderSkillPreview()` — For rendering skill preview in results (created by Task 4)

  **External References** (libraries and frameworks):
  - skills.sh API: `https://skills.sh` — Search and trending endpoints
  - Tauri HTTP plugin: `https://v2.tauri.app/plugin/http-client/` — `tauriFetch` usage docs

  **WHY Each Reference Matters**:
  - `grading-api.ts` tauriFetch: MUST use this import pattern or Tauri's CSP will block requests
  - `skills-api.ts` (Task 1): Contains the validated URL pattern for fetching skill content from GitHub
  - `db.ts` Skill/CRUD: Install flow needs saveSkill + getSkillBySource for duplicate detection
  - `skill-parser.ts` renderSkillPreview: Preview panel renders fetched markdown — reuse the sanitized renderer

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/skills-api.test.ts` → PASS (search + fetch content tests)
  - [ ] `npm run build` succeeds with no TypeScript errors
  - [ ] SkillSearch component exists at `src/components/skills/SkillSearch.svelte`
  - [ ] skills-api.ts exports `searchSkills()` and `fetchSkillContent()` functions

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Search skills.sh for "react" and display results
    Tool: Bash (vitest with mocked tauriFetch)
    Preconditions: skills-api.ts has searchSkills(), tauriFetch is mocked
    Steps:
      1. Mock tauriFetch to return: `{ data: { skills: [{ skillId: "react-best-practices", name: "React Best Practices", source: "vercel/next.js", installs: 150 }] } }`
      2. Call `searchSkills("react")`
      3. Assert: Returns array with 1 entry
      4. Assert: Entry has skillId="react-best-practices", name="React Best Practices"
      5. Assert: tauriFetch was called with `https://skills.sh/api/search?q=react&limit=20`
    Expected Result: Search function correctly calls API and transforms response
    Failure Indicators: Wrong URL, response not parsed, missing fields
    Evidence: .sisyphus/evidence/task-5-search-api.txt

  Scenario: Fetch skill content from GitHub raw URL
    Tool: Bash (vitest with mocked tauriFetch)
    Preconditions: skills-api.ts has fetchSkillContent(), URL pattern from Task 1
    Steps:
      1. Mock tauriFetch to return: `{ data: "# React Skill\nUse hooks for state management." }`
      2. Call `fetchSkillContent("vercel/next.js", "react-best-practices")`
      3. Assert: Returns the markdown string
      4. Assert: tauriFetch URL matches pattern from Task 1 (e.g., `https://raw.githubusercontent.com/vercel/next.js/main/.claude/skills/react-best-practices.md`)
    Expected Result: Content URL built correctly and content returned as string
    Failure Indicators: Wrong URL pattern, content not returned
    Evidence: .sisyphus/evidence/task-5-content-fetch.txt

  Scenario: Install skill from marketplace (not already installed)
    Tool: Bash (vitest)
    Preconditions: DB mocks for getSkillBySource (returns null) and saveSkill
    Steps:
      1. Simulate install flow: getSkillBySource("vercel/next.js", "react-best-practices") returns null
      2. Call saveSkill with skill data
      3. Assert: saveSkill called with source="vercel/next.js", source_id="react-best-practices", is_active=0
      4. Assert: saveSkill returns a UUID string
    Expected Result: Skill saved to DB with correct source metadata
    Failure Indicators: saveSkill not called, wrong source fields
    Evidence: .sisyphus/evidence/task-5-install-new.txt

  Scenario: Attempt to install already-installed skill
    Tool: Bash (vitest)
    Preconditions: DB mock for getSkillBySource returns existing skill
    Steps:
      1. Simulate: getSkillBySource("vercel/next.js", "react-best-practices") returns { id: "abc", name: "React...", ... }
      2. Assert: Install flow detects duplicate
      3. Assert: saveSkill is NOT called again
      4. Assert: UI would show "Already Installed" (test the logic function, not UI rendering)
    Expected Result: Duplicate skill not re-installed
    Failure Indicators: saveSkill called for duplicate, no duplicate detection
    Evidence: .sisyphus/evidence/task-5-install-duplicate.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add marketplace search and install from skills.sh`
  - Files: `src/components/skills/SkillSearch.svelte`, `src/lib/skills-api.ts`, `src/lib/skills-api.test.ts`, `src/components/skills/__tests__/SkillSearch.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run && npm run build`


- [x] 6. Skill Injection into Grading and Solver Chat

  **What to do**:
  - **TDD First**: Write failing tests for `buildSkillInjection()` before implementing
  - Create or extend `src/lib/skills-api.ts` with injection logic:
    - `buildSkillInjection(): Promise<string>` — reads all active skills from SQLite via `getActiveSkills()`, concatenates their `content` fields with clear separators
    - Format: `\n\n--- SKILL: {name} ---\n{content}\n--- END SKILL ---\n\n` for each active skill
    - Return empty string if no active skills (zero overhead when unused)
    - `getSkillInjectionSize(): Promise<{ charCount: number, skillCount: number }>` — returns total character count and skill count for context window warnings
  - Create `src/components/skills/SkillPicker.svelte`:
    - Multi-select dropdown showing all skills from SQLite (name + source badge)
    - Checkboxes for each skill — checking/unchecking toggles `is_active` via `updateSkillActive(id, 0|1)`
    - Shows count: "N skills active" as summary text when collapsed
    - Context size warning: if total injection > 4000 chars, show yellow warning: "Active skills use {N} chars of context — consider deactivating some for better grading quality"
    - Placed in the grading panel UI (near rubric/model selection area)
  - Wire skill injection into **SolverChat.svelte**:
    - Import `buildSkillInjection` from skills-api.ts
    - Before sending message to `/api/chat`, call `buildSkillInjection()`
    - If result is non-empty, pass it as the `systemPrompt` field in the request body: `{ message, systemPrompt: skillInjection }`
    - The server already accepts `systemPrompt` in `/api/chat` but SolverChat currently doesn't send it — just add the field
  - Wire skill injection into **batch grading** flow:
    - In the grading initiation code (where `/api/grade` is called), call `buildSkillInjection()`
    - If result is non-empty, pass it as the `customInstructions` field: `{ rubric, students, customInstructions: skillInjection }`
    - The server already accepts `customInstructions` in `/api/grade`
  - Write vitest tests:
    - `src/lib/skills-api.test.ts` (extend): Test buildSkillInjection with 0 active skills (returns ""), 1 active skill, 3 active skills (correct separator format), getSkillInjectionSize returns correct counts

  **Must NOT do**:
  - Do NOT modify any grading-server files — injection is 100% client-side concatenation
  - Do NOT add skills to the server's system prompt at the server level
  - Do NOT change the `/api/chat` or `/api/grade` endpoint contracts
  - Do NOT implement per-student skill selection — skills apply to entire session
  - Do NOT add skill content to chat message history — only to systemPrompt/customInstructions

  **Recommended Agent Profile**:
  > Skill injection is core business logic with careful prompt engineering and data flow.
  - **Category**: `deep`
    - Reason: Requires understanding the full data flow from SQLite → client-side concatenation → API request fields. Must handle edge cases (no skills, huge skills, encoding) and wire into 2 separate UI flows (solver + grading) correctly.
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures TypeScript patterns and Svelte 5 integration match project conventions
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: SkillPicker is a straightforward dropdown, not complex visual design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: [Task 7, Task 8]
  - **Blocked By**: [Task 2 (DB CRUD for getActiveSkills)]

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/SolverChat.svelte` — The solver chat component that sends messages to `/api/chat`. Find the `fetch` or `tauriFetch` call that posts `{ message }` and add `systemPrompt` field. Look for the message send handler function.
  - `ogre-desktop/src/lib/grading-api.ts:588-676` — The `startBatchGrading()` function that posts to `/api/grade` with `{ rubric, students, ...options }`. The `customInstructions` field is already in the request body (line 606-608). This is where active-skill content gets injected.
  - `ogre-desktop/src/lib/grading-api.ts:256-301` — The `sendSolverMessage()` function that posts to `/api/chat` with `{ message }`. This is where `systemPrompt` should be injected into the request body alongside `message`.
  - `ogre-desktop/src/pages/Settings.svelte` — Dropdown component patterns (model selector) for reference on building SkillPicker multi-select

  **API/Type References** (contracts to implement against):
  - `grading-server/server.js` POST `/api/chat` — accepts `{ message: string, systemPrompt?: string }`. The `systemPrompt` is prepended to the AI's system message. Already implemented server-side.
  - `grading-server/server.js` POST `/api/grade` — accepts `{ rubric, students, customInstructions?: string }`. The `customInstructions` are appended to grading instructions. Already implemented server-side.
  - `ogre-desktop/src/lib/db.ts:getActiveSkills()` — Returns `Skill[]` where `is_active=1` (created by Task 2)
  - `ogre-desktop/src/lib/db.ts:updateSkillActive()` — Toggles skill active state (created by Task 2)

  **External References** (libraries and frameworks):
  - None needed — pure TypeScript string concatenation + existing Svelte patterns

  **WHY Each Reference Matters**:
  - SolverChat.svelte: Must identify the EXACT location where `/api/chat` request is built to add `systemPrompt`
  - grading-api.ts: Must identify the EXACT location where `/api/grade` request is built to add `customInstructions`
  - Server API contracts: Confirms the fields exist server-side and won't require server changes
  - db.ts active skills: The data source for building the injection string

  **Acceptance Criteria**:
  - [ ] `npx vitest run src/lib/skills-api.test.ts` → PASS (buildSkillInjection + size calc tests)
  - [ ] `npm run build` succeeds with no TypeScript errors
  - [ ] SkillPicker component exists at `src/components/skills/SkillPicker.svelte`
  - [ ] SolverChat.svelte sends `systemPrompt` when active skills exist
  - [ ] Grading flow sends `customInstructions` when active skills exist

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: buildSkillInjection with no active skills returns empty string
    Tool: Bash (vitest)
    Preconditions: skills-api.ts has buildSkillInjection(), DB mock returns empty array for getActiveSkills
    Steps:
      1. Mock getActiveSkills to return []
      2. Call buildSkillInjection()
      3. Assert: returns "" (empty string)
    Expected Result: No injection when no skills active
    Failure Indicators: Returns undefined, throws error, returns whitespace
    Evidence: .sisyphus/evidence/task-6-injection-empty.txt

  Scenario: buildSkillInjection with 2 active skills returns formatted content
    Tool: Bash (vitest)
    Preconditions: DB mock returns 2 skills
    Steps:
      1. Mock getActiveSkills to return: [{ name: "Math Grading", content: "Grade math strictly" }, { name: "Writing Feedback", content: "Focus on clarity" }]
      2. Call buildSkillInjection()
      3. Assert: result contains "--- SKILL: Math Grading ---"
      4. Assert: result contains "Grade math strictly"
      5. Assert: result contains "--- SKILL: Writing Feedback ---"
      6. Assert: result contains "Focus on clarity"
      7. Assert: result contains "--- END SKILL ---" (2 occurrences)
    Expected Result: Properly formatted injection string with separators
    Failure Indicators: Missing separators, missing content, wrong skill names
    Evidence: .sisyphus/evidence/task-6-injection-formatted.txt

  Scenario: getSkillInjectionSize returns correct character count
    Tool: Bash (vitest)
    Preconditions: DB mock returns skills with known content lengths
    Steps:
      1. Mock getActiveSkills with 2 skills: content lengths 100 and 200 chars
      2. Call getSkillInjectionSize()
      3. Assert: charCount > 300 (content + separators)
      4. Assert: skillCount === 2
    Expected Result: Accurate size calculation for context window warnings
    Failure Indicators: Wrong count, missing separator overhead
    Evidence: .sisyphus/evidence/task-6-injection-size.txt

  Scenario: SolverChat includes systemPrompt when skills are active
    Tool: Bash (grep verification of SolverChat.svelte)
    Preconditions: SolverChat.svelte modified
    Steps:
      1. Read SolverChat.svelte source
      2. Assert: imports buildSkillInjection from skills-api
      3. Assert: calls buildSkillInjection() before sending message
      4. Assert: includes systemPrompt field in the /api/chat request body
    Expected Result: Solver chat wired to inject skills
    Failure Indicators: Missing import, missing injection call, missing systemPrompt field
    Evidence: .sisyphus/evidence/task-6-solver-wiring.txt

  Scenario: Batch grading includes customInstructions when skills are active
    Tool: Bash (grep verification of grading-api.ts or grading component)
    Preconditions: Grading flow modified
    Steps:
      1. Read the grading API call source (grading-api.ts or grading component)
      2. Assert: imports buildSkillInjection from skills-api
      3. Assert: calls buildSkillInjection() before grading
      4. Assert: includes customInstructions field in the /api/grade request body
    Expected Result: Batch grading wired to inject skills
    Failure Indicators: Missing import, missing injection call, missing customInstructions field
    Evidence: .sisyphus/evidence/task-6-grading-wiring.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add skill injection into grading and solver chat`
  - Files: `src/lib/skills-api.ts`, `src/lib/skills-api.test.ts`, `src/components/skills/SkillPicker.svelte`, `src/components/grading/SolverChat.svelte`, `src/lib/grading-api.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run && npm run build`


- [x] 7. Create Skill AI Chatbot Sub-View

  **What to do**:
  - Create `src/components/skills/SkillCreator.svelte`:
    - Chat interface modeled after SolverChat.svelte (message bubbles, streaming responses, loading indicator)
    - Two-phase workflow:
      - **Phase 1 — Interview**: System prompt guides AI to ask about: subject area, grade level, grading style (strict/lenient/partial credit), specific focus areas (e.g., "showing work", "grammar", "citations"), any custom rules or exceptions
      - **Phase 2 — TDD Generation**: After gathering requirements, AI generates a draft SKILL.md with YAML frontmatter + body. User can iterate: "make it stricter", "add a section about partial credit", etc.
    - Uses the active AI provider/model from Settings (same as SolverChat)
    - Sends messages to `/api/chat` with a custom `systemPrompt` that contains the skill-creation interview instructions
  - Create interview system prompt constant in `src/lib/skill-creation-prompt.ts`:
    - Guide AI through structured interview:
      ```
      You are a skill creation assistant for O.G.R.E, an AI grading tool.
      Your job is to help educators create custom grading/tutoring skills.
      
      Phase 1 - Interview (ask these questions one at a time):
      1. What subject/course is this skill for?
      2. What grade level or audience?
      3. How strict should grading be? (lenient/moderate/strict)
      4. What specific aspects should the AI focus on?
      5. Any custom rules, exceptions, or special instructions?
      6. Provide an example of ideal student work (optional)
      
      Phase 2 - Generation:
      After gathering all answers, generate a complete skill in markdown format:
      - Start with YAML frontmatter (name, description, author)
      - Include clear sections for: Grading Criteria, Scoring Rubric, Feedback Style, Special Rules
      - Use the superpowers:writing-skills TDD approach:
        1. Generate initial draft
        2. Test it mentally against edge cases (lazy student, overachiever, partial answer)
        3. Iterate until robust
      
      Present the skill as a markdown code block. Ask user to review and iterate.
      ```
  - Chat message flow:
    - User clicks "Create Skill" sub-view → sees introductory message from AI ("I'll help you create a custom grading skill. Let's start...") auto-sent on mount
    - User types responses → messages sent to `/api/chat` with skill-creation systemPrompt via `streamSolverChat()` or equivalent
    - SSE streaming displays AI responses in real-time (reuse existing SSE pattern from SolverChat)
    - After AI generates SKILL.md, show "Save Skill" button below the message containing the markdown
  - "Save Skill" button behavior:
    - Extract markdown content from the AI's last message (look for code block fences \`\`\`markdown ... \`\`\`)
    - Parse with `parseSkillMarkdown()` from skill-parser.ts
    - Save to SQLite via `saveSkill({ name, description, content, source: 'created', is_active: false })`
    - Show success toast: "Skill '{name}' saved! Find it in My Skills."
    - Reset chat for creating another skill
  - "New Conversation" button to reset chat state and start fresh

  **Must NOT do**:
  - Do NOT render markdown in real-time during chat — display as `pre-wrap` text (existing chat pattern)
  - Do NOT use a different AI provider than the one active in Settings
  - Do NOT create a custom API endpoint — use existing `/api/chat` with custom systemPrompt
  - Do NOT implement skill editing (just creation — users edit the .md file directly if needed)
  - Do NOT modify grading-server or add new server endpoints

  **Recommended Agent Profile**:
  > Create Skill chatbot requires understanding SSE streaming, prompt engineering, and complex UI state management.
  - **Category**: `deep`
    - Reason: Complex two-phase chat UI with streaming responses, state machine logic (interview → generation → save), markdown extraction from AI responses, and integration with existing chat infrastructure
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures Svelte 5 patterns, SSE handling, and TypeScript conventions match project standards
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Chat UI is being copied from SolverChat, not designed from scratch

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 2 completing)
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: [Task 8]
  - **Blocked By**: [Task 2 (DB CRUD), Task 3 (Skills page skeleton), Task 6 (injection pattern shows how systemPrompt is used)]

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/components/grading/SolverChat.svelte` — **PRIMARY REFERENCE**. Copy the entire chat UI pattern: message state array, SSE streaming handler, message bubble rendering, loading indicator, input form with send button. This is the EXACT pattern to replicate for the chatbot.
  - `ogre-desktop/src/lib/grading-api.ts:streamSolverChat()` or equivalent — The SSE streaming function that sends messages to `/api/chat` and processes streamed responses. SkillCreator will call this same function with a custom `systemPrompt`.
  - `ogre-desktop/src/lib/skill-parser.ts:parseSkillMarkdown()` — For parsing the AI-generated skill markdown before saving (created by Task 4)
  - `ogre-desktop/src/lib/db.ts:saveSkill()` — For saving the created skill to SQLite (created by Task 2)

  **API/Type References** (contracts to implement against):
  - `POST /api/chat` with `{ message: string, systemPrompt?: string }` — The existing endpoint. SkillCreator sends the interview systemPrompt here.
  - `ogre-desktop/src/lib/db.ts:Skill` interface — Shape of the skill object to save

  **External References** (libraries and frameworks):
  - superpowers:writing-skills TDD approach: AI generates skill → mentally tests against edge cases → iterates until robust. This philosophy should be embedded in the system prompt.

  **WHY Each Reference Matters**:
  - SolverChat.svelte: This IS the chat UI. Copy its structure, state management, SSE handling, and styling. Do not reinvent.
  - streamSolverChat: The SSE function handles streaming tokens from the server. SkillCreator needs the exact same mechanism.
  - skill-parser.ts: When user clicks "Save Skill", the AI's markdown output gets parsed to extract name/description for the DB record.
  - saveSkill: The final step — persisting the created skill to SQLite with source='created'

  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds with no TypeScript errors
  - [ ] SkillCreator component exists at `src/components/skills/SkillCreator.svelte`
  - [ ] Interview system prompt constant exists in `src/lib/skill-creation-prompt.ts`
  - [ ] Chat messages display with streaming (SSE)
  - [ ] "Save Skill" button extracts markdown and saves to DB

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill creation system prompt is correctly structured
    Tool: Bash (grep + read verification)
    Preconditions: skill-creation-prompt.ts exists
    Steps:
      1. Read `src/lib/skill-creation-prompt.ts`
      2. Assert: Contains "Phase 1" interview questions (subject, grade level, grading style)
      3. Assert: Contains "Phase 2" generation instructions (YAML frontmatter, sections)
      4. Assert: Contains TDD approach mention (test against edge cases)
      5. Assert: Exported as a named constant
    Expected Result: Well-structured system prompt with both phases
    Failure Indicators: Missing phases, no interview questions, no generation instructions
    Evidence: .sisyphus/evidence/task-7-system-prompt.txt

  Scenario: SkillCreator component has correct chat structure
    Tool: Bash (grep verification of component)
    Preconditions: SkillCreator.svelte exists
    Steps:
      1. Read SkillCreator.svelte source
      2. Assert: Has $state for messages array
      3. Assert: Has message input form with send button
      4. Assert: Has SSE streaming handler (uses streamSolverChat or equivalent)
      5. Assert: Has "Save Skill" button with click handler
      6. Assert: Has "New Conversation" reset button
      7. Assert: Imports skill-creation-prompt system prompt
    Expected Result: Component has full chat + save structure
    Failure Indicators: Missing state, no SSE handling, no save button
    Evidence: .sisyphus/evidence/task-7-creator-structure.txt

  Scenario: Markdown extraction from AI response works
    Tool: Bash (vitest or manual grep)
    Preconditions: SkillCreator has save logic
    Steps:
      1. Verify the save handler looks for markdown code block fences in AI messages
      2. Assert: Extracts content between ```markdown and ``` (or ``` and ```)
      3. Assert: Passes extracted content to parseSkillMarkdown()
      4. Assert: Calls saveSkill() with parsed result
    Expected Result: Clean extraction of AI-generated skill content
    Failure Indicators: Regex doesn't match code blocks, parsing fails, save not called
    Evidence: .sisyphus/evidence/task-7-markdown-extraction.txt

  Scenario: Chat sends systemPrompt with skill-creation instructions
    Tool: Bash (grep verification)
    Preconditions: SkillCreator.svelte exists
    Steps:
      1. Read SkillCreator.svelte
      2. Assert: The message send function includes systemPrompt from skill-creation-prompt.ts
      3. Assert: Messages sent to /api/chat include { message, systemPrompt: SKILL_CREATION_PROMPT }
    Expected Result: Every message to AI includes the creation system prompt
    Failure Indicators: systemPrompt missing from request, wrong prompt imported
    Evidence: .sisyphus/evidence/task-7-system-prompt-wiring.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add AI-powered Create Skill chatbot`
  - Files: `src/components/skills/SkillCreator.svelte`, `src/lib/skill-creation-prompt.ts`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [x] 8. Integration Testing + Polish

  **What to do**:
  - Run all vitest tests across the entire ogre-desktop project: `npx vitest run`
  - Fix any test failures or TypeScript errors introduced by Tasks 1-7
  - Verify CSS consistency:
    - All new components use existing CSS variables (`--color-*`, `--spacing-*`, `--radius-*`, `--font-*`)
    - No hardcoded colors, font sizes, or spacing values
    - Dark/light theme compatibility (if app has theme support)
  - Verify Svelte 5 correctness:
    - All reactive state uses `$state` rune (not legacy `$:` or `let` reactivity)
    - All side effects use `$effect` (not `onMount` for reactive operations)
    - No legacy Svelte 4 patterns (stores, `$:` blocks, `on:` event handlers instead of `onclick`)
  - Cross-feature integration tests:
    - Install skill from marketplace → appears in My Skills → activate → verify in skill picker
    - Upload .md skill → appears in My Skills → activate → verify injection into solver chat systemPrompt
    - Create skill via chatbot → save → appears in My Skills with source="created"
    - Deactivate all skills → verify empty injection (no systemPrompt/customInstructions sent)
  - Migration safety:
    - Delete ogre.db (or use fresh DB) and verify app starts cleanly with migration v8
    - Verify existing data survives (if DB already has data from migrations 1-7)
  - Error boundary testing:
    - Disconnect internet → marketplace search shows error state (not crash)
    - Upload malformed .md (empty file, binary file) → graceful error message
    - Save skill with empty name → validation prevents save

  **Must NOT do**:
  - Do NOT add new features — only fix bugs and polish existing work
  - Do NOT refactor working code for style preferences
  - Do NOT modify grading-server
  - Do NOT change the migration schema

  **Recommended Agent Profile**:
  > Integration testing requires running the full app, verifying cross-component interactions, and fixing edge cases.
  - **Category**: `unspecified-high`
    - Reason: Broad scope (all modules), requires running tests + build + dev server, fixing diverse issues across UI/data/API layers
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensures all fixes follow project patterns and don't introduce new inconsistencies
  - **Skills Evaluated but Omitted**:
    - `playwright`: Playwright is used in Final Verification Wave (F3), not here — Task 8 uses vitest + manual code review

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on ALL Wave 2+3 tasks)
  - **Parallel Group**: Wave 3 (after Task 7)
  - **Blocks**: [F1-F4 (Final Verification)]
  - **Blocked By**: [Task 4, Task 5, Task 6, Task 7]

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/db.ts` — All CRUD functions to verify (Tasks 2 additions)
  - `ogre-desktop/src/lib/skills-api.ts` — All API + injection functions to verify (Tasks 1, 5, 6 additions)
  - `ogre-desktop/src/lib/skill-parser.ts` — Parsing functions to verify (Task 4 additions)
  - `ogre-desktop/src/pages/Skills.svelte` — Main page to verify all sub-views work together
  - `ogre-desktop/src/App.svelte` — Navigation to verify Skills tab works in context of full app
  - `ogre-desktop/src/app.css` — CSS variables reference for consistency check

  **Test References**:
  - `ogre-desktop/src/lib/db.test.ts` — Existing + new tests to run
  - `ogre-desktop/src/lib/skills-api.test.ts` — API + injection tests to run
  - `ogre-desktop/src/lib/skill-parser.test.ts` — Parser tests to run

  **WHY Each Reference Matters**:
  - All files from Tasks 1-7: This is integration testing — verifying everything works TOGETHER, not in isolation
  - app.css: CSS consistency check requires comparing against the canonical variable definitions

  **Acceptance Criteria**:
  - [ ] `npx vitest run` → ALL tests pass (0 failures)
  - [ ] `npm run build` → production build succeeds (0 errors, 0 TypeScript errors)
  - [ ] No hardcoded colors/fonts in any new `.svelte` files
  - [ ] No legacy Svelte 4 patterns (`$:`, `on:click`, stores) in new files

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash (vitest)
    Preconditions: All Tasks 1-7 complete
    Steps:
      1. Run: `cd ogre-desktop && npx vitest run`
      2. Assert: Exit code 0
      3. Assert: All test suites pass (db.test.ts, skills-api.test.ts, skill-parser.test.ts)
      4. Assert: No test failures or skipped tests
    Expected Result: Green test suite with 0 failures
    Failure Indicators: Any test failure, TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-8-full-test-suite.txt

  Scenario: Production build succeeds
    Tool: Bash
    Preconditions: All code changes in place
    Steps:
      1. Run: `cd ogre-desktop && npm run build`
      2. Assert: Exit code 0
      3. Assert: No TypeScript errors in output
      4. Assert: No "unused variable" or "missing import" warnings
    Expected Result: Clean production build
    Failure Indicators: Build failure, TS errors, missing modules
    Evidence: .sisyphus/evidence/task-8-build-output.txt

  Scenario: CSS consistency check — no hardcoded values
    Tool: Bash (grep search)
    Preconditions: New .svelte and .ts files exist
    Steps:
      1. Search all new files in `src/components/skills/` and `src/pages/Skills.svelte` for hardcoded hex colors (#fff, #000, rgb())
      2. Search for hardcoded font sizes (font-size: 14px, not using var(--font-*))
      3. Search for hardcoded spacing (padding: 8px, not using var(--spacing-*))
      4. Assert: Zero matches (all should use CSS variables)
    Expected Result: All styling uses CSS variables from app.css
    Failure Indicators: Any hardcoded color, font, or spacing value
    Evidence: .sisyphus/evidence/task-8-css-consistency.txt

  Scenario: No legacy Svelte 4 patterns in new files
    Tool: Bash (grep search)
    Preconditions: New .svelte files exist
    Steps:
      1. Search new .svelte files for `$:` (reactive declarations — should be $effect or $derived)
      2. Search for `on:click` (should be `onclick`)
      3. Search for `import { writable }` or `import { readable }` (should be $state)
      4. Assert: Zero matches of legacy patterns
    Expected Result: All new code uses Svelte 5 runes
    Failure Indicators: Any legacy Svelte 4 pattern found
    Evidence: .sisyphus/evidence/task-8-svelte5-check.txt

  Scenario: Migration safety — fresh DB starts cleanly
    Tool: Bash (read migration code)
    Preconditions: Migration v8 exists in lib.rs
    Steps:
      1. Read lib.rs, verify migration v8 uses IF NOT EXISTS
      2. Assert: No DROP TABLE statements
      3. Assert: Migration is additive only (no altering existing tables)
    Expected Result: Safe migration that won't break existing databases
    Failure Indicators: Missing IF NOT EXISTS, destructive SQL statements
    Evidence: .sisyphus/evidence/task-8-migration-safety.txt
  ```

  **Commit**: YES
  - Message: `test(skills): add integration tests and polish`
  - Files: All modified files from fixes, test output files
  - Pre-commit: `cd ogre-desktop && npx vitest run && npm run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run vitest, check exports). For each "Must NOT Have": search codebase for forbidden patterns (skill versioning code, grading-server modifications, rich editors, per-student selection) — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan list.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` (ogre-desktop). Review all changed/new files for: `as any`/`@ts-ignore`, empty catches, console.log in production code, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic variable names. Verify all new files follow existing CSS variable patterns (`--color-*`, `--spacing-*`, `--radius-*`). Verify Svelte 5 runes used correctly (`$state`, `$effect`, not legacy `$:`).
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | Svelte5 [PASS/FAIL] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start `npm run dev` in ogre-desktop. Use Playwright to: (1) Click Skills tab in sidebar, (2) Verify My Skills shows empty state, (3) Upload a test .md skill file, (4) Verify skill appears in list, (5) Toggle skill active, (6) Navigate to Find Skills, (7) Search for "react", (8) Preview a result, (9) Install a skill, (10) Navigate to Create Skill, (11) Send a message to chatbot, (12) Verify chatbot responds. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Screenshots [N captured] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: search for `grading-server/package.json` changes, skill versioning fields, rich text editor components, per-student selection UI. Flag unaccounted changes. Verify no modifications to `grading-server/` directory at all.
  Output: `Tasks [N/N compliant] | Server Changes [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **After Task 2**: `feat(skills): add skills table migration and CRUD operations` — `lib.rs`, `db.ts`, `db.test.ts`
- **After Task 3**: `feat(skills): add Skills page skeleton and sidebar navigation` — `App.svelte`, `Skills.svelte`
- **After Task 4**: `feat(skills): add My Skills sub-view with upload and preview` — `Skills.svelte`, `SkillCard.svelte`, `skill-parser.ts`, `package.json`
- **After Task 5**: `feat(skills): add marketplace search and install from skills.sh` — `SkillSearch.svelte`, `skills-api.ts`
- **After Task 6**: `feat(skills): add skill injection into grading and solver chat` — `skills-api.ts`, `SolverChat.svelte`, `SkillPicker.svelte`
- **After Task 7**: `feat(skills): add AI-powered Create Skill chatbot` — `SkillCreator.svelte`, system prompt constants
- **After Task 8**: `test(skills): add integration tests and polish` — test files, CSS fixes

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run  # Expected: ALL tests pass (existing + new)
cd ogre-desktop && npm run dev     # Expected: App launches, Skills tab functional
cd ogre-desktop && npm run build   # Expected: Production build succeeds with no errors
```

### Final Checklist
- [x] All "Must Have" features present and functional
- [x] All "Must NOT Have" patterns absent from codebase
- [x] All vitest tests pass
- [x] Production build succeeds
- [x] No modifications to grading-server/ directory
- [x] Migration v8 creates skills table correctly
- [x] Skills tab appears in sidebar with correct icon
- [x] Marketplace search returns results from skills.sh
- [x] Create Skill chatbot produces valid SKILL.md
- [x] Skill injection verified in both grading and solver modes