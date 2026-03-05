# Site Knowledge Profiles — Auto-Injected Agent Mode Context

## TL;DR

> **Quick Summary**: Extend the skills system with a `url_pattern` column so markdown "site guide" skills auto-inject into Agent Mode when the browser URL matches. Then use Playwriter to crawl MyOpenMath and Aeries, authoring comprehensive knowledge profiles that teach the AI how to navigate and operate these sites like a teacher would.
> 
> **Deliverables**:
> - `url_pattern` column on skills table (migration 9) + TypeScript plumbing
> - Agent loop URL awareness + profile injection into system prompt
> - `buildSiteContextInjection(url)` function with unit tests
> - Updated skill parser extracting `urlPatterns` from frontmatter
> - Skills UI showing URL pattern badges on profile skills
> - MyOpenMath knowledge profile (gradebook, navigation, assignments, question authoring)
> - Aeries knowledge profile (full teacher gradebook experience)
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (migration) → T2 (parser) → T3 (injection) → T4 (agent-loop) → T8 (MOM crawl) → T9 (Aeries crawl) → F1-F4

---

## Context

### Original Request
"I need to build a new site profile for Aeries that the AI can reference so it knows how to interact with the page. Also we need to do a full site audit of how MyOpenMath works — how to navigate the site, how to get the gradebook, how to make assignments, how to write questions/create questions. So we'll need a more robust site profile system so that if in the browser grader panel on the agent mode the AI will know exactly how to do what I want when I ask a question since it will have reference file for the ins and outs of these sites."

### Interview Summary
**Key Discussions**:
- Agent Mode is the primary target — no Solver Chat / Batch Grading injection now
- Extend existing skills system with `url_pattern` — profiles are just skills with URL matching
- Use Playwriter (active Chrome tab) to crawl and document sites
- MyOpenMath priorities: gradebook, home page navigation, assignment creation, question authoring/testing
- Aeries priorities: full teacher gradebook experience
- Include unit tests for all new plumbing

**Research Findings**:
- Agent loop (`agent-loop.ts:172-175`) has NO URL awareness and NO skill injection — entirely new wiring
- `pruneHistory()` hardcodes `history.slice(0, 2)` as anchors — must update if adding third anchor
- Existing `site_profiles` table (migration 6) is for batch grading CSS selectors — completely separate concept
- Token budget: 200K max, system prompt ~875 tokens, profile injection of 5-15K chars (~1,250-3,750 tokens) is safe
- `buildSkillInjection()` format: `--- SKILL: name ---\n{content}\n--- END SKILL ---` — reuse pattern
- `parseSkillMarkdown()` uses gray-matter — adding `urlPatterns` extraction is trivial
- Migration approach: `ALTER TABLE skills ADD COLUMN url_pattern TEXT;` — backward compatible

### Metis Review
**Identified Gaps (addressed)**:
- Name collision with existing `site_profiles` table → These are "site guides" (knowledge docs), NOT grading selectors. We add to `skills` table, never touch `site_profiles`.
- `pruneHistory()` anchor assumption → Embed profile content in the system prompt message itself (Option A: augment `AGENT_SYSTEM_PROMPT` content at runtime, don't add a third message). This preserves the 2-anchor assumption.
- URL matching semantics → Use TypeScript-side substring matching (proven pattern from `findProfilesByUrl()`). DB stores patterns, TS does matching.
- Multi-match behavior → Inject ALL matching profiles. Most site guide skills will have non-overlapping URL patterns.
- No browser open edge case → `getEmbeddedUrl()` wrapped in try/catch, returns null → skip injection.
- `url_pattern` independence from `is_active` → URL-matched profiles inject regardless of toggle. The `is_active` toggle controls manual skill injection only.
- Migration is Rust edit in `lib.rs`, not SQL file.
- Profile import idempotency → Use `source='site-profile'` + `source_id=urlPattern` for dedup.

---

## Work Objectives

### Core Objective
Enable Agent Mode to automatically receive site-specific knowledge when the user is browsing a known site, so the AI can navigate and operate the site like a human teacher would.

### Concrete Deliverables
- Migration 9 in `lib.rs`: `url_pattern TEXT` column on `skills` table
- `findSkillsByUrl(url)` in `db.ts`
- `buildSiteContextInjection(url)` in `skills-api.ts`
- Updated `parseSkillMarkdown()` extracting `urlPatterns` from frontmatter
- Updated `saveSkill()` persisting `url_pattern`
- Modified `agent-loop.ts` with URL awareness + profile injection
- SkillCard showing URL pattern badge
- MyOpenMath knowledge profile markdown (~5-10K chars)
- Aeries knowledge profile markdown (~5-10K chars)
- Unit tests for all new functions

### Definition of Done
- [x] `cargo build` passes with migration 9
- [x] `npm test` in ogre-desktop passes (all existing 688+ tests + new tests)
- [x] Agent Mode injects MOM profile when browsing myopenmath.com
- [x] Agent Mode injects Aeries profile when browsing aeries.net
- [x] Agent Mode works normally when no browser is open (no crash, no injection)
- [x] Skills with `url_pattern = null` behave exactly as before

### Must Have
- URL-based auto-injection into Agent Mode
- Backward compatibility for all existing skills
- Graceful fallback when no browser open
- MyOpenMath and Aeries knowledge profiles
- Unit tests for parser, DB, injection builder

### Must NOT Have (Guardrails)
- Do NOT modify the existing `site_profiles` table or batch grading code
- Do NOT change `saveSkill()`, `getSkill()`, `deleteSkill()` function signatures
- Do NOT change `AGENT_SYSTEM_PROMPT` string constant in `agent-prompt.ts` — compose at runtime
- Do NOT add `url_pattern` matching to Solver Chat or Batch Grading (future scope)
- Do NOT auto-set `is_active` on profile skills — URL matching is independent of the toggle
- Do NOT add new npm or Cargo dependencies

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, 29 test files, 688+ tests)
- **Automated tests**: YES (tests-after — write implementation, then tests)
- **Framework**: vitest

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/DB**: Use Bash (vitest) — run specific test files, assert pass counts
- **Rust**: Use Bash (cargo build) — verify compilation
- **Content profiles**: Use Bash (node script) — parse markdown, verify frontmatter, check char count

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent):
├── T1: Rust migration 9 + cargo build [quick]
├── T2: skill-parser.ts — extract urlPatterns from frontmatter + tests [quick]
├── T3: db.ts — Skill interface + findSkillsByUrl + saveSkill url_pattern + tests [quick]
└── T4: Profile markdown template — define structure for site guides [quick]

Wave 2 (Injection pipeline — depends on T1-T3):
├── T5: skills-api.ts — buildSiteContextInjection(url) + tests (depends: T2, T3) [unspecified-high]
├── T6: agent-loop.ts — URL awareness + inject profiles into system prompt (depends: T5) [deep]
└── T7: SkillCard.svelte — show URL pattern badge on profile skills (depends: T3) [quick]

Wave 3 (Content — depends on T4, can start once pipeline works):
├── T8: MyOpenMath knowledge profile via Playwriter crawl (depends: T4) [deep]
└── T9: Aeries knowledge profile via Playwriter crawl (depends: T4) [deep]

Wave 4 (Integration — depends on all):
├── T10: Import profiles + end-to-end verification (depends: T5, T8, T9) [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T3 → T5 → T6 → T8 → T10 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T5, T6, T10 | 1 |
| T2 | — | T5, T10 | 1 |
| T3 | — | T5, T6, T7, T10 | 1 |
| T4 | — | T8, T9 | 1 |
| T5 | T2, T3 | T6, T10 | 2 |
| T6 | T5 | T10 | 2 |
| T7 | T3 | F2 | 2 |
| T8 | T4 | T10 | 3 |
| T9 | T4 | T10 | 3 |
| T10 | T5, T8, T9 | F1-F4 | 4 |
| F1-F4 | T10 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `quick`, T4 `quick`
- **Wave 2**: 3 tasks — T5 `unspecified-high`, T6 `deep`, T7 `quick`
- **Wave 3**: 2 tasks — T8 `deep` + `playwriter`, T9 `deep` + `playwriter`
- **Wave 4**: 1 task — T10 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Rust migration 9: add `url_pattern` column to skills table

  **What to do**:
  - In `ogre-desktop/src-tauri/src/lib.rs`, add Migration 9 after the existing migration 8 (around line 944)
  - SQL: `ALTER TABLE skills ADD COLUMN url_pattern TEXT;`
  - Follow the exact pattern of migrations 1-8 (same struct format)
  - Run `cargo build` to verify compilation

  **Must NOT do**:
  - Do NOT touch the `site_profiles` table (migration 6) — different system
  - Do NOT add new Cargo.toml dependencies
  - Do NOT modify any existing migration

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T5, T6, T10
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src-tauri/src/lib.rs:816-945` — All 8 existing migrations. Migration 9 goes after migration 8, follows identical `Migration { version: 9, description: "add_url_pattern_to_skills", sql: "...", kind: MigrationKind::Up }` format
  - `ogre-desktop/src-tauri/src/lib.rs:898-913` — Migration 6 creates `site_profiles` table. Do NOT confuse with this — we're modifying `skills` table
  - `ogre-desktop/src-tauri/src/lib.rs:930-944` — Migration 8 creates `skills` table. Our ALTER TABLE adds to this table

  **Acceptance Criteria**:
  - [ ] `cargo build` passes (exit 0) from `ogre-desktop/src-tauri/`
  - [ ] Migration 9 added after migration 8 in `lib.rs`
  - [ ] SQL is exactly: `ALTER TABLE skills ADD COLUMN url_pattern TEXT;`

  **QA Scenarios:**
  ```
  Scenario: Cargo build passes with new migration
    Tool: Bash
    Steps:
      1. cd ogre-desktop/src-tauri && cargo build 2>&1
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-1-cargo-build.txt
  ```

  **Commit**: YES (groups with T2-T7)
  - Message: `feat(agent): add site knowledge profile system with URL-based auto-injection`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`
  - Pre-commit: `cargo build`

- [x] 2. skill-parser.ts: extract `urlPatterns` from frontmatter + tests

  **What to do**:
  - In `ogre-desktop/src/lib/skill-parser.ts`:
    - Add `urlPatterns?: string[]` to the `ParsedSkill` interface
    - In `parseSkillMarkdown()`, extract `data.urlPatterns` from frontmatter (line ~29 area)
    - Return `urlPatterns` in the result object
  - In `ogre-desktop/src/lib/skill-parser.test.ts`:
    - Add test: frontmatter with `urlPatterns: ["myopenmath.com", "mom.example.com"]` → parsed correctly
    - Add test: frontmatter without `urlPatterns` → `urlPatterns` is undefined
    - Add test: empty `urlPatterns: []` → returns empty array

  **Must NOT do**:
  - Do NOT change how `name`, `description`, `author`, `tags` are parsed
  - Do NOT change the gray-matter dependency or import

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T5, T10
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/lib/skill-parser.ts:4-10` — `ParsedSkill` interface. Add `urlPatterns?: string[]` after `tags`
  - `ogre-desktop/src/lib/skill-parser.ts:12-67` — `parseSkillMarkdown()` function. Add `const urlPatterns = data.urlPatterns;` at line ~29 after `tags` extraction, include in return object
  - `ogre-desktop/src/lib/skill-parser.test.ts` — Existing tests (13 tests). Follow same `describe/it` pattern, use same `parseSkillMarkdown` import

  **Acceptance Criteria**:
  - [ ] `npm test -- --run src/lib/skill-parser.test.ts` → all existing + new tests pass
  - [ ] `ParsedSkill` interface includes `urlPatterns?: string[]`

  **QA Scenarios:**
  ```
  Scenario: Parse skill with urlPatterns frontmatter
    Tool: Bash (vitest)
    Steps:
      1. cd ogre-desktop && npx vitest run src/lib/skill-parser.test.ts 2>&1
    Expected Result: All tests pass, including new urlPatterns tests
    Evidence: .sisyphus/evidence/task-2-parser-tests.txt
  ```

  **Commit**: YES (groups with T1, T3-T7)

- [x] 3. db.ts: update Skill interface + findSkillsByUrl + saveSkill url_pattern + tests

  **What to do**:
  - In `ogre-desktop/src/lib/db.ts`:
    - Add `url_pattern: string | null` to the `Skill` interface (line ~67-77)
    - Update `saveSkill()` SQL to include `url_pattern` in INSERT and ON CONFLICT UPDATE
    - Add new function `getSkillsWithUrlPattern()`: `SELECT * FROM skills WHERE url_pattern IS NOT NULL AND url_pattern != ''`
    - Do NOT add SQL-level URL matching — matching will be done in TypeScript (substring)
  - In a new or existing test file:
    - Test: `saveSkill()` with `url_pattern` persists correctly
    - Test: `saveSkill()` with `url_pattern = null` works (backward compat)
    - Test: `getSkillsWithUrlPattern()` returns only skills with non-null url_pattern

  **Must NOT do**:
  - Do NOT change `saveSkill()`, `getSkill()`, `deleteSkill()` function signatures (only add url_pattern to SQL)
  - Do NOT add SQL LIKE matching in the DB layer — keep matching in TypeScript
  - Do NOT modify the `site_profiles` table functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T5, T6, T7, T10
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/lib/db.ts:67-77` — Current `Skill` interface. Add `url_pattern: string | null` field
  - `ogre-desktop/src/lib/db.ts:352-384` — `saveSkill()` function. Add `url_pattern` to the INSERT columns and VALUES, and to the ON CONFLICT UPDATE SET clause
  - `ogre-desktop/src/lib/db.ts:330-336` — `getSiteCredentialsByUrl()` shows existing URL matching pattern (but we do TS-side matching instead)
  - `ogre-desktop/src/lib/db.test.ts` — Existing DB tests with `vi.hoisted()` + `vi.mock('@tauri-apps/plugin-sql')` pattern. Follow same mock pattern

  **Acceptance Criteria**:
  - [ ] `npm test -- --run src/lib/db.test.ts` → all existing + new tests pass
  - [ ] `Skill` interface includes `url_pattern: string | null`
  - [ ] `saveSkill()` persists url_pattern without breaking existing callers

  **QA Scenarios:**
  ```
  Scenario: DB tests pass with url_pattern changes
    Tool: Bash (vitest)
    Steps:
      1. cd ogre-desktop && npx vitest run src/lib/db.test.ts 2>&1
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-3-db-tests.txt
  ```

  **Commit**: YES (groups with T1-T2, T4-T7)

- [x] 4. Define site guide profile markdown template

  **What to do**:
  - Create `ogre-desktop/src/assets/profile-template.md` — a template/example that future profile authors follow
  - Template structure:
    ```markdown
    ---
    name: "Site Name — Knowledge Profile"
    description: "Teaches AI agent how to navigate and operate Site Name"
    urlPatterns:
      - "site-domain.com"
      - "alt-domain.com"
    ---
    # Site Name — Agent Navigation Guide
    
    ## Site Overview
    [What this site is, what it's used for, key terminology]
    
    ## Navigation Map
    [Page hierarchy, how to get from A to B, menu structure]
    
    ## Key Workflows
    ### Workflow 1: [Task Name]
    1. [Step-by-step instructions]
    2. [Expected UI elements at each step]
    3. [Common gotchas]
    
    ## CSS Selectors & Interaction Patterns
    [Key selectors for common elements, input patterns]
    
    ## Tips & Gotchas
    [Site-specific quirks, timing issues, confirmation dialogs]
    ```
  - Keep template under 500 chars — it's a structure guide, not content

  **Must NOT do**:
  - Do NOT create actual site profiles here — that's T8/T9
  - Do NOT put the template in the DB — it's a development reference

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T8, T9
  - **Blocked By**: None

  **References**:
  - `.claude/commands/grade-selectors.md` — Existing "site knowledge" file for MyOpenMath grading. Shows good pattern: page structure tree, selector table, extraction code, interaction flow. Profile template should follow similar structure.
  - `ogre-desktop/src/lib/site-profiles.ts:125-217` — Built-in SiteProfile objects. Shows what CSS selectors and navigation config look like for existing sites.

  **Acceptance Criteria**:
  - [ ] Template file exists at `ogre-desktop/src/assets/profile-template.md`
  - [ ] Has frontmatter with `name`, `description`, `urlPatterns`
  - [ ] Has sections: Site Overview, Navigation Map, Key Workflows, Selectors, Tips

  **QA Scenarios:**
  ```
  Scenario: Template file exists and has correct structure
    Tool: Bash
    Steps:
      1. test -f ogre-desktop/src/assets/profile-template.md && echo EXISTS
      2. head -10 ogre-desktop/src/assets/profile-template.md
    Expected Result: File exists, first 10 lines show frontmatter with urlPatterns
    Evidence: .sisyphus/evidence/task-4-template.txt
  ```

  **Commit**: YES (groups with T1-T3, T5-T7)

- [x] 5. skills-api.ts: buildSiteContextInjection(url) + tests

  **What to do**:
  - In `ogre-desktop/src/lib/skills-api.ts`:
    - Add `import { getSkillsWithUrlPattern } from './db';`
    - Create `findMatchingProfiles(url: string, skills: Skill[]): Skill[]` — pure function, TypeScript-side substring matching. For each skill, split its `url_pattern` by comma or newline, check if `url.toLowerCase().includes(pattern.trim().toLowerCase())` for any pattern. Return matching skills.
    - Create `buildSiteContextInjection(url: string): Promise<string>` — calls `getSkillsWithUrlPattern()`, runs `findMatchingProfiles(url, skills)`, formats matching skills as `--- SITE GUIDE: {name} ---\n{content}\n--- END SITE GUIDE ---`. Returns empty string if no matches.
    - Export both functions
  - In `ogre-desktop/src/lib/skills-api.test.ts`:
    - Test: `findMatchingProfiles` with URL matching one profile → returns it
    - Test: `findMatchingProfiles` with URL matching zero profiles → returns empty
    - Test: `findMatchingProfiles` with URL matching multiple profiles → returns all
    - Test: `findMatchingProfiles` is case-insensitive
    - Test: `buildSiteContextInjection` returns empty string for non-matching URL
    - Test: `buildSiteContextInjection` returns formatted content for matching URL

  **Must NOT do**:
  - Do NOT modify existing `buildSkillInjection()` — it serves batch grading/solver
  - Do NOT use SQL LIKE matching — do all matching in TypeScript
  - Do NOT couple this to `is_active` — URL-matched profiles inject regardless of toggle

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with T6, T7)
  - **Blocks**: T6, T10
  - **Blocked By**: T2, T3

  **References**:
  - `ogre-desktop/src/lib/skills-api.ts:159-165` — `buildSkillInjection()`. Follow this exact format pattern but use `--- SITE GUIDE:` instead of `--- SKILL:`
  - `ogre-desktop/src/lib/site-profiles.ts:231-255` — `findProfilesByUrl()`. Shows proven substring matching pattern: `url.includes(pattern)` with case-insensitive comparison
  - `ogre-desktop/src/lib/db.ts` — `getSkillsWithUrlPattern()` (from T3). Returns skills with non-null url_pattern
  - `ogre-desktop/src/lib/skills-api.test.ts` — Existing tests. Follow same mock pattern

  **Acceptance Criteria**:
  - [ ] `npm test -- --run src/lib/skills-api.test.ts` → all existing + new tests pass
  - [ ] `findMatchingProfiles` is a pure function (no DB calls, testable without mocks)
  - [ ] `buildSiteContextInjection` returns `''` for unknown URLs
  - [ ] `buildSiteContextInjection` wraps content in `--- SITE GUIDE: name ---` format

  **QA Scenarios:**
  ```
  Scenario: Skills API tests pass with new injection functions
    Tool: Bash (vitest)
    Steps:
      1. cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts 2>&1
    Expected Result: All tests pass (existing 23 + new ~6)
    Evidence: .sisyphus/evidence/task-5-skills-api-tests.txt
  ```

  **Commit**: YES (groups with T1-T4, T6-T7)

- [x] 6. agent-loop.ts: URL awareness + inject site profiles into system prompt + tests

  **What to do**:
  - In `ogre-desktop/src/lib/agent-loop.ts`:
    - Import `getEmbeddedUrl` from `./browser` and `buildSiteContextInjection` from `./skills-api`
    - At line ~171 (before conversation initialization), add:
      ```typescript
      let siteContext = '';
      try {
        const currentUrl = await getEmbeddedUrl();
        if (currentUrl) {
          siteContext = await buildSiteContextInjection(currentUrl);
        }
      } catch {
        // No browser open or URL unavailable — skip injection
      }
      ```
    - Modify line 173 to compose the system prompt:
      ```typescript
      const systemPrompt = siteContext
        ? `${AGENT_SYSTEM_PROMPT}\n\n${siteContext}`
        : AGENT_SYSTEM_PROMPT;
      ```
    - Use `systemPrompt` instead of `AGENT_SYSTEM_PROMPT` in the conversation init:
      ```typescript
      const conversationHistory: AgentMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: config.initialMessage },
      ];
      ```
    - This keeps the 2-anchor assumption in `pruneHistory()` intact (no third message)
  - In test file (`agent-loop.test.ts` if exists, or new):
    - Test: agent loop initializes with site context when URL matches a profile
    - Test: agent loop initializes without site context when URL doesn't match
    - Test: agent loop works normally when `getEmbeddedUrl()` throws (no browser)

  **Must NOT do**:
  - Do NOT modify `AGENT_SYSTEM_PROMPT` constant in `agent-prompt.ts` — compose at runtime
  - Do NOT add a third anchor message — append to system prompt content instead
  - Do NOT change `pruneHistory()` anchor slice
  - Do NOT re-check URL on every step (once at init is sufficient for v1)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5)
  - **Parallel Group**: Wave 2 (after T5)
  - **Blocks**: T10
  - **Blocked By**: T5

  **References**:
  - `ogre-desktop/src/lib/agent-loop.ts:172-175` — Conversation initialization. This is THE injection point.
  - `ogre-desktop/src/lib/agent-loop.ts:47-62` — `pruneHistory()`. Hardcodes `history.slice(0, 2)` as anchors. Our approach (augmenting system prompt content) preserves this.
  - `ogre-desktop/src/lib/agent-loop.ts:67-96` — Token estimation. `MAX_CONTEXT_TOKENS = 200_000`, `CHARS_PER_TOKEN = 4`. Profile injection adds ~1,250-3,750 tokens (safe).
  - `ogre-desktop/src/lib/agent-loop.ts:84-96` — `estimateTokens()` function. Screenshot = 5,000 tokens.
  - `ogre-desktop/src/lib/browser.ts:83-85` — `getEmbeddedUrl(tabId?)`. Already exported, returns current URL string.
  - `ogre-desktop/src/lib/agent-prompt.ts:95-175` — `AGENT_SYSTEM_PROMPT` constant. ~3,500 chars, ~875 tokens. Do NOT edit this.

  **Acceptance Criteria**:
  - [ ] `cargo build` passes (Rust unchanged but verify)
  - [ ] `npm test` passes (all existing + new agent-loop tests)
  - [ ] System prompt is augmented with site context when URL matches a profile skill
  - [ ] Agent loop does not crash when no browser is open

  **QA Scenarios:**
  ```
  Scenario: Agent loop with site profile injection
    Tool: Bash (vitest)
    Steps:
      1. cd ogre-desktop && npx vitest run src/lib/agent-loop.test.ts 2>&1 (or relevant test file)
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-6-agent-loop-tests.txt

  Scenario: Agent loop without browser (graceful fallback)
    Tool: Bash (vitest)
    Steps:
      1. Test that mocks getEmbeddedUrl to throw, verifies loop starts normally
    Expected Result: No crash, no site context injected, system prompt is unmodified
    Evidence: .sisyphus/evidence/task-6-no-browser.txt
  ```

  **Commit**: YES (groups with T1-T5, T7)

- [x] 7. SkillCard.svelte: show URL pattern badge on profile skills

  **What to do**:
  - In `ogre-desktop/src/components/skills/SkillCard.svelte`:
    - Check if `skill.url_pattern` is non-null and non-empty
    - If present, show a small badge/tag below the source badge: `🌐 Auto: {url_pattern}`
    - Use existing CSS variables for styling (match source badge style)
    - Truncate long patterns with ellipsis if needed

  **Must NOT do**:
  - Do NOT add URL pattern editing — profiles are imported, not hand-edited in UI
  - Do NOT change the skill toggle behavior — URL matching is independent of is_active
  - Do NOT add new CSS class names that conflict with existing styles

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: F2
  - **Blocked By**: T3

  **References**:
  - `ogre-desktop/src/components/skills/SkillCard.svelte` — Current card component. Shows name, source badge, description, toggle, delete. Add URL badge after source badge section.
  - `ogre-desktop/src/pages/Skills.svelte` — Parent page that renders SkillCards. Passes full `skill` object as prop.

  **Acceptance Criteria**:
  - [ ] Skills with `url_pattern` show a globe badge with the pattern text
  - [ ] Skills without `url_pattern` look exactly the same as before

  **QA Scenarios:**
  ```
  Scenario: SkillCard displays URL pattern badge
    Tool: Bash
    Steps:
      1. grep -n 'url_pattern' ogre-desktop/src/components/skills/SkillCard.svelte
    Expected Result: File contains url_pattern conditional rendering
    Evidence: .sisyphus/evidence/task-7-skillcard.txt
  ```

  **Commit**: YES (groups with T1-T6)

- [x] 8. MyOpenMath knowledge profile via Playwriter crawl

  **What to do**:
  - Use Playwriter skill to navigate MyOpenMath as a logged-in instructor
  - Document the 4 priority areas by crawling each section:
    1. **Home page navigation** — Dashboard layout, main menu items, course list, how to select a course
    2. **Gradebook mapping** — How to access gradebook, column layout, how scores display, filtering, export
    3. **Assignment creation** — How to create/edit assignments, set properties (due date, points, attempts), organize in course
    4. **Question authoring** — Inside an assignment: add questions, question editor UI, test/preview, iterate until working
  - For each area: capture page structure, navigation flow, key selectors, interaction patterns
  - Output: markdown file following T4 template, with `urlPatterns: ["myopenmath.com"]` in frontmatter
  - Save to `ogre-desktop/src/assets/profiles/myopenmath.md`
  - Target size: 5,000-12,000 characters (1,250-3,000 tokens)

  **Must NOT do**:
  - Do NOT scrape or store sensitive data (passwords, student info)
  - Do NOT modify any MyOpenMath pages
  - Do NOT exceed 15,000 characters — stays within token budget

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`playwriter`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T9)
  - **Parallel Group**: Wave 3
  - **Blocks**: T10
  - **Blocked By**: T4

  **References**:
  - `ogre-desktop/src/assets/profile-template.md` (from T4) — Template structure to follow
  - `.claude/commands/grade-selectors.md` — Existing MOM site knowledge. Shows selector patterns and page structure for grading pages. The new profile should cover BROADER navigation, not just grading.
  - `ogre-desktop/src/lib/site-profiles.ts:125-175` — Built-in MOM SiteProfile with CSS selectors for grading elements. Reference for selector naming.

  **Acceptance Criteria**:
  - [ ] File exists at `ogre-desktop/src/assets/profiles/myopenmath.md`
  - [ ] Frontmatter has `name`, `description`, `urlPatterns` with `myopenmath.com`
  - [ ] Contains sections for all 4 priority areas
  - [ ] Character count between 3,000 and 15,000

  **QA Scenarios:**
  ```
  Scenario: MOM profile has correct structure
    Tool: Bash
    Steps:
      1. test -f ogre-desktop/src/assets/profiles/myopenmath.md && echo EXISTS
      2. head -10 ogre-desktop/src/assets/profiles/myopenmath.md
      3. wc -c ogre-desktop/src/assets/profiles/myopenmath.md
    Expected Result: File exists, has urlPatterns frontmatter, 3K-15K chars
    Evidence: .sisyphus/evidence/task-8-mom-profile.txt
  ```

  **Commit**: YES (separate commit)
  - Message: `content(profiles): add MyOpenMath and Aeries site knowledge profiles`

- [x] 9. Aeries knowledge profile via Playwriter crawl

  **What to do**:
  - Use Playwriter skill to navigate Aeries as a logged-in teacher
  - Document the full teacher gradebook experience:
    1. **Login & Dashboard** — Login flow, dashboard layout, class selection
    2. **Gradebook navigation** — Viewing classes, switching terms, student list, score grid
    3. **Assignments** — Adding/editing assignments, categories, weighting, due dates
    4. **Score entry** — Entering/modifying individual scores, batch entry, special marks
    5. **Student info** — Viewing student details, attendance, demographics (read-only)
    6. **Reports** — Available reports, grade reports, export options
  - For each area: capture page structure, navigation flow, key selectors, interaction patterns
  - Output: markdown file following T4 template, with `urlPatterns: ["aeries.net"]` in frontmatter
  - Save to `ogre-desktop/src/assets/profiles/aeries.md`
  - Target size: 5,000-12,000 characters

  **Must NOT do**:
  - Do NOT scrape or store sensitive student data
  - Do NOT modify any Aeries records
  - Do NOT exceed 15,000 characters

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`playwriter`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8)
  - **Parallel Group**: Wave 3
  - **Blocks**: T10
  - **Blocked By**: T4

  **References**:
  - `ogre-desktop/src/assets/profile-template.md` (from T4) — Template structure to follow
  - `ogre-desktop/src/lib/browser.ts:248-255` — `GRADING_SITE_PRESETS` includes Aeries URL: `https://chicousd.aeries.net/teacher/Login.aspx`

  **Acceptance Criteria**:
  - [ ] File exists at `ogre-desktop/src/assets/profiles/aeries.md`
  - [ ] Frontmatter has `name`, `description`, `urlPatterns` with `aeries.net`
  - [ ] Contains sections for login, gradebook, assignments, scores, student info, reports
  - [ ] Character count between 3,000 and 15,000

  **QA Scenarios:**
  ```
  Scenario: Aeries profile has correct structure
    Tool: Bash
    Steps:
      1. test -f ogre-desktop/src/assets/profiles/aeries.md && echo EXISTS
      2. head -10 ogre-desktop/src/assets/profiles/aeries.md
      3. wc -c ogre-desktop/src/assets/profiles/aeries.md
    Expected Result: File exists, has urlPatterns frontmatter, 3K-15K chars
    Evidence: .sisyphus/evidence/task-9-aeries-profile.txt
  ```

  **Commit**: YES (groups with T8)

- [x] 10. Import profiles into skills DB + end-to-end verification

  **What to do**:
  - Write a small import script or use the existing `syncLocalSkills` pattern to import the profile markdown files:
    - Read `ogre-desktop/src/assets/profiles/myopenmath.md`
    - Read `ogre-desktop/src/assets/profiles/aeries.md`
    - Parse with `parseSkillMarkdown()` to extract `name`, `description`, `urlPatterns`
    - Join `urlPatterns` array into comma-separated string for `url_pattern` column
    - Save to skills DB via `saveSkill()` with `source='site-profile'`, `source_id=urlPattern[0]`
  - Verify end-to-end:
    - Run `npm test` — all tests pass
    - Run `cargo build` — passes
    - Manually verify profiles appear in skills DB with correct `url_pattern`

  **Must NOT do**:
  - Do NOT auto-activate profiles (`is_active = 0`) — URL matching is independent
  - Do NOT create duplicate entries if run twice — use `getSkillBySource('site-profile', pattern)` for dedup

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential)
  - **Blocks**: F1-F4
  - **Blocked By**: T5, T8, T9

  **References**:
  - `ogre-desktop/src/lib/skills-api.ts:187-217` — `syncLocalSkills()` pattern. Follow same dedup approach with `getSkillBySource()`.
  - `ogre-desktop/src/lib/db.ts` — `saveSkill()`, `getSkillBySource()` functions
  - `ogre-desktop/src/lib/skill-parser.ts` — `parseSkillMarkdown()` for extracting frontmatter

  **Acceptance Criteria**:
  - [ ] Both profiles exist in skills DB with correct `url_pattern`
  - [ ] `npm test` passes (all tests)
  - [ ] `cargo build` passes
  - [ ] Running import twice does not create duplicates

  **QA Scenarios:**
  ```
  Scenario: Full test suite passes after integration
    Tool: Bash
    Steps:
      1. cd ogre-desktop/src-tauri && cargo build 2>&1
      2. cd ogre-desktop && npx vitest run 2>&1
    Expected Result: cargo build exit 0, all vitest tests pass
    Evidence: .sisyphus/evidence/task-10-integration.txt
  ```

  **Commit**: NO (included in content commit with T8/T9)

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo build` + `npm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwriter` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (profile injection in agent mode). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Wave 2): `feat(agent): add site knowledge profile system with URL-based auto-injection`
  - Files: lib.rs, db.ts, skill-parser.ts, skills-api.ts, agent-loop.ts, SkillCard.svelte, all test files
  - Pre-commit: `cargo build && cd ogre-desktop && npm test`

- **Commit 2** (after Wave 3): `content(profiles): add MyOpenMath and Aeries site knowledge profiles`
  - Files: profile markdown files (location TBD by T4)

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop/src-tauri && cargo build     # Expected: exit 0
cd ogre-desktop && npm test                   # Expected: all pass (existing + new)
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Agent Mode injects correct profile based on URL
- [x] Agent Mode works normally with no browser open
- [x] Existing skills unaffected
