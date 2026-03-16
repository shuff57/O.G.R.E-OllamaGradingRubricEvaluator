# Discover Tab — Site Profile Knowledge Integration

## TL;DR

> **Quick Summary**: Unify two siloed profile systems (CSS selectors for batch grading + markdown knowledge guides for Agent Mode) into the Discover tab. Profiles stay as markdown for humans but inject as compact JSON into the agent prompt, cutting token usage ~60-80%.
> 
> **Deliverables**:
> - Markdown-to-JSON parser that converts bundled knowledge profiles into structured agent payloads
> - `buildSiteContextInjection()` emits JSON instead of raw markdown
> - Agent prompt rules updated for JSON consumption
> - Discover tab shows site guide status + offers AI-generated knowledge profile creation
> - `syncSiteProfiles()` moved to app startup (fixes latent bug)
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 5 → Task 7 → Task 10 → Task 12 → F1-F4

---

## Context

### Original Request
Review the site-profile skill system and determine how it should be incorporated into the Discover tab. Profiles should use markdown for humans, JSON for agents.

### Interview Summary
**Key Discussions**:
- Two siloed systems exist: CSS selector profiles (`site_profiles` table) and knowledge profiles (`skills` table with `source='site-profile'`)
- User wants full integration: surface, create, enhance, unify
- Format philosophy: "markdown is for human, json is for agent"
- After selector discovery, AI auto-generates a draft knowledge profile
- SiteProfiles page stays for detailed editing; Discover tab is primary entry
- Agent injection switches from raw markdown to JSON-only

**Research Findings**:
- `buildSiteContextInjection()` injects ~300 lines of raw markdown per profile
- `syncSiteProfiles()` only runs on Skills page mount — if user never visits Skills, Agent Mode has zero site context (latent bug)
- Bundled profiles (`myopenmath.md`, `aeries.md`) don't follow template section headings exactly — parser must handle actual structure
- Agent prompt rules #11 and #13 exist specifically to compensate for unstructured markdown — replaceable with JSON
- URL matching logic is duplicated between `site-profiles.ts` and `skills-api.ts`

### Metis Review
**Identified Gaps** (addressed):
- `syncSiteProfiles()` must move to app startup → Task 4
- Parser must be tested against real bundled profiles, not template → Task 2 QA
- Knowledge generation is riskiest piece — built last, fully optional → Task 10
- Multiple matching profiles need precedence strategy → Task 3
- Agent prompt rules #11/#13 need JSON-specific rewrites → Task 7
- Discovery phase machine must stay clean (at most one new phase) → Task 11 design constraint

---

## Work Objectives

### Core Objective
Make Agent Mode smarter by giving it structured JSON site context instead of raw markdown, while surfacing knowledge profiles in the Discover tab and enabling AI-generated profile creation from discovery sessions.

### Concrete Deliverables
- `ogre-desktop/src/lib/site-guide-types.ts` — JSON schema interface
- `ogre-desktop/src/lib/profile-json-converter.ts` + `.test.ts` — markdown→JSON parser
- Updated `skills-api.ts:buildSiteContextInjection()` — JSON output
- Updated `agent-prompt.ts` — rules #11, #13 rewritten for JSON
- Updated `App.svelte` or init — syncSiteProfiles() on startup
- Updated `DiscoveryPanel.svelte` — site guide status indicator + generation flow
- New `grading-server` endpoint for knowledge profile generation
- New `DiscoveryGuideStatus.svelte` component
- New `DiscoveryGuidePreview.svelte` component

### Definition of Done
- [ ] Agent Mode receives JSON (not markdown) when on myopenmath.com — verified via `buildSiteContextInjection()` test
- [ ] JSON payload contains selectors, navigation, workflows, gotchas from MOM profile
- [ ] Discover tab shows "Knowledge Profile: Active" when on a profiled site
- [ ] Discover tab shows "No Knowledge Profile" when on an unknown site
- [ ] Knowledge profile generation produces a saveable markdown profile
- [ ] All new modules have vitest tests passing
- [ ] App startup syncs bundled profiles (no longer requires visiting Skills page)

### Must Have
- Markdown→JSON conversion for both bundled profiles (MOM + Aeries)
- JSON injection into agent system prompt
- Site guide status indicator in Discover tab
- App startup sync for bundled profiles
- Tests for parser and injection pipeline

### Must NOT Have (Guardrails)
- ❌ Do NOT alter existing columns in `site_profiles` or `skills` tables
- ❌ Do NOT store JSON in `skills.content` — markdown is source of truth
- ❌ Do NOT add a knowledge profile EDITOR to the Discover tab (view + generate + preview only)
- ❌ Do NOT touch `ProfileManager.svelte` (SiteProfiles page stays unchanged)
- ❌ Do NOT merge marketplace skills into site profile logic
- ❌ Do NOT refactor `findMatchingProfiles()` or unify URL matching logic
- ❌ Do NOT add vector/embedding features to knowledge profiles
- ❌ Do NOT create new Rust/SQL migrations unless absolutely necessary
- ❌ Default generated profiles to `is_active: 0` (user must explicitly activate)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES — vitest configured, colocated `.test.ts` files throughout `ogre-desktop/src/lib/`
- **Automated tests**: Tests-after implementation
- **Framework**: vitest (already configured for ogre-desktop)
- **Run command**: `npx vitest run` from `ogre-desktop/`

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Parser/API modules**: Use Bash (`npx vitest run src/lib/file.test.ts`) — assert pass counts
- **UI components**: Use Playwright — navigate, interact, assert DOM, screenshot
- **Server endpoints**: Use Bash (curl) — send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent, start immediately):
├── Task 1: JSON SiteGuide schema + TypeScript interfaces [quick]
├── Task 2: Markdown-to-JSON converter + tests [deep]
├── Task 3: Profile precedence strategy for multi-match [quick]
├── Task 4: Move syncSiteProfiles() to app startup [quick]
└── Task 5: Structured frontmatter enhancement for bundled profiles [quick]

Wave 2 (Backend Pipeline — after Wave 1):
├── Task 6: Rewrite buildSiteContextInjection() for JSON output [deep]
├── Task 7: Update agent prompt rules for JSON format [quick]
├── Task 8: Knowledge generation endpoint on grading-server [unspecified-high]
└── Task 9: Tests for injection pipeline + agent prompt [quick]

Wave 3 (Discover Tab UI — after Wave 2):
├── Task 10: Site guide status indicator component [visual-engineering]
├── Task 11: Knowledge profile generation flow in Discover tab [deep]
└── Task 12: Guide-enhanced discovery (pre-populate hints) [deep]

Wave 4 (Polish + Edge Cases — after Wave 3):
├── Task 13: Edge case handling (offline, multi-match, stale) [quick]
└── Task 14: Integration tests for full pipeline [deep]

Wave FINAL (Verification — after ALL tasks):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real QA — Playwright + manual scenarios [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: T1 → T6 → T7 → T10 → T11 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 6 | 1 |
| 2 | 1 | 6, 9 | 1 |
| 3 | — | 6 | 1 |
| 4 | — | 10 | 1 |
| 5 | — | 2, 6 | 1 |
| 6 | 1, 2, 3, 5 | 7, 9, 10 | 2 |
| 7 | 6 | 9 | 2 |
| 8 | — | 11 | 2 |
| 9 | 6, 7 | 14 | 2 |
| 10 | 4, 6 | 11 | 3 |
| 11 | 8, 10 | 13 | 3 |
| 12 | 2, 6 | — | 3 |
| 13 | 11 | 14 | 4 |
| 14 | 9, 13 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1 `quick`, T2 `deep`, T3 `quick`, T4 `quick`, T5 `quick`
- **Wave 2**: 4 tasks — T6 `deep`, T7 `quick`, T8 `unspecified-high`, T9 `quick`
- **Wave 3**: 3 tasks — T10 `visual-engineering`, T11 `deep`, T12 `deep`
- **Wave 4**: 2 tasks — T13 `quick`, T14 `deep`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. JSON SiteGuide Schema + TypeScript Interfaces

  **What to do**:
  - Create `ogre-desktop/src/lib/site-guide-types.ts`
  - Define `SiteGuideJSON` interface representing the structured JSON payload injected into agent prompts:
    ```typescript
    interface SiteGuideJSON {
      site: string;
      baseUrl: string;
      role: string;
      urlPatterns: string[];
      selectors: Record<string, string>;        // key → CSS selector
      navigation: Record<string, string>;        // page name → URL pattern
      workflows: Array<{ name: string; steps: string[] }>;
      gotchas: string[];
    }
    ```
  - Export a `formatSiteGuideForAgent(guide: SiteGuideJSON): string` helper that serializes to compact JSON string wrapped in `--- SITE GUIDE (JSON): {name} ---` delimiters
  - Export a type guard `isSiteGuideJSON(obj: unknown): obj is SiteGuideJSON`

  **Must NOT do**:
  - Do NOT add database storage for this type — it's a computed view, not a stored entity
  - Do NOT import from `site-profiles.ts` — this is a separate concern

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 2, 6
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/lib/agent-types.ts` — follow existing type file conventions (JSDoc, explicit exports)
  - `ogre-desktop/src/lib/skills-api.ts:205-212` — current injection format (lines 209-211 show the `--- SITE GUIDE ---` delimiter pattern to follow)
  - `ogre-desktop/src/assets/profiles/myopenmath.md` — real data the JSON must represent
  - `ogre-desktop/src/lib/batch-grader.ts:1-50` — existing `SiteProfile` interface for comparison (don't duplicate, but understand what fields exist)

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/site-guide-types.ts`
  - [ ] TypeScript compiles without errors: `cd ogre-desktop && npx tsc --noEmit`
  - [ ] `SiteGuideJSON` interface has all 8 fields listed above
  - [ ] `formatSiteGuideForAgent()` wraps JSON in delimiters

  **QA Scenarios**:
  ```
  Scenario: SiteGuideJSON interface compiles and exports correctly
    Tool: Bash
    Steps:
      1. Run `cd ogre-desktop && npx tsc --noEmit`
      2. Assert exit code 0
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-1-tsc-check.txt

  Scenario: formatSiteGuideForAgent produces expected output
    Tool: Bash
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/site-guide-types.test.ts` (if test exists)
      2. Or create a quick smoke test inline
    Expected Result: Output contains `--- SITE GUIDE (JSON):` prefix and valid JSON body
    Evidence: .sisyphus/evidence/task-1-format-output.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add SiteGuide JSON schema interface`
  - Files: `ogre-desktop/src/lib/site-guide-types.ts`

- [x] 2. Markdown-to-JSON Converter + Tests

  **What to do**:
  - Create `ogre-desktop/src/lib/profile-json-converter.ts`
  - Implement `convertProfileToJSON(markdownContent: string): SiteGuideJSON` that:
    1. Parses YAML frontmatter via `gray-matter` (reuse from `skill-parser.ts`)
    2. Extracts `name`, `urlPatterns` from frontmatter
    3. Scans markdown sections for CSS selectors (patterns like `` `selector.here` `` in tables and bullet lists)
    4. Extracts navigation URLs (patterns like `/path/to/page.php?param={id}`)
    5. Extracts workflow steps from ordered lists under `### Workflow` or `### Creating` sections
    6. Extracts gotchas from `## Tips & Gotchas` bullet list
  - Create `ogre-desktop/src/lib/profile-json-converter.test.ts` with tests using REAL content from bundled profiles
  - **CRITICAL**: Test against actual `myopenmath.md` content (which uses `## Priority 1:` headings, NOT template headings). Also test against `aeries.md`

  **Must NOT do**:
  - Do NOT expect template-standard section headings — parse actual profile structure
  - Do NOT modify the bundled markdown files to make parsing easier (that's Task 5)
  - Do NOT import or depend on `site-profiles.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Complex parsing logic with regex, section detection, and table extraction requires careful reasoning

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Tasks 6, 9
  - **Blocked By**: Task 1 (needs SiteGuideJSON interface)

  **References**:
  - `ogre-desktop/src/lib/skill-parser.ts:1-70` — existing gray-matter parsing pattern to reuse
  - `ogre-desktop/src/assets/profiles/myopenmath.md` — primary test fixture (300 lines, uses `## Priority N:` headings, pipe tables, code blocks for selectors)
  - `ogre-desktop/src/assets/profiles/aeries.md` — secondary test fixture (324 lines, uses `## N. Section Name` headings, different table format)
  - `ogre-desktop/src/assets/profile-template.md` — ideal structure but NOT what real profiles follow
  - `ogre-desktop/src/lib/site-guide-types.ts` — target output interface (Task 1)

  **Acceptance Criteria**:
  - [ ] `convertProfileToJSON(momContent)` returns JSON with ≥5 selectors, ≥3 navigation entries, ≥1 workflow, ≥3 gotchas
  - [ ] `convertProfileToJSON(aeriesContent)` returns JSON with ≥5 selectors, ≥3 navigation entries, ≥1 workflow, ≥3 gotchas
  - [ ] Empty/malformed markdown returns a minimal valid SiteGuideJSON (no crash)
  - [ ] `npx vitest run src/lib/profile-json-converter.test.ts` passes all tests

  **QA Scenarios**:
  ```
  Scenario: Parse MyOpenMath profile to JSON
    Tool: Bash
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/profile-json-converter.test.ts`
      2. Assert all tests pass
      3. Verify test output shows: MOM profile produces JSON with site="MyOpenMath", selectors has keys like "scoreInput", "feedbackBox"
    Expected Result: ≥8 tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-2-vitest-output.txt

  Scenario: Malformed markdown doesn't crash
    Tool: Bash
    Steps:
      1. Tests include: empty string input, markdown with no frontmatter, markdown with no sections
      2. Assert each returns a valid (possibly sparse) SiteGuideJSON object
    Expected Result: No thrown exceptions; sparse but valid JSON returned
    Evidence: .sisyphus/evidence/task-2-edge-cases.txt
  ```

  **Commit**: YES
  - Message: `feat(parser): markdown-to-JSON converter for knowledge profiles`
  - Files: `ogre-desktop/src/lib/profile-json-converter.ts`, `ogre-desktop/src/lib/profile-json-converter.test.ts`

- [x] 3. Profile Precedence Strategy for Multiple Matches

  **What to do**:
  - Create `ogre-desktop/src/lib/profile-precedence.ts`
  - Implement `selectBestProfile(matches: Skill[]): Skill` that applies precedence: user-generated (`source='created'` or `source='local'`) > user-modified (`source='site-profile'` with recent `updated_at`) > bundled (`source='site-profile'`)
  - If multiple same-precedence profiles match, pick the one with the longest `url_pattern` match (most specific)
  - Export for use by `buildSiteContextInjection()` in Task 6
  - Add tests in `profile-precedence.test.ts`

  **Must NOT do**:
  - Do NOT refactor `findMatchingProfiles()` — use its output as input
  - Do NOT merge multiple profiles into one — pick the single best

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/lib/skills-api.ts:188-195` — `findMatchingProfiles()` returns `Skill[]` — this task picks the best from that array
  - `ogre-desktop/src/lib/db.ts:68-79` — `Skill` interface with `source`, `source_id`, `url_pattern`, `updated_at` fields

  **Acceptance Criteria**:
  - [ ] User-created profile beats bundled profile for same URL
  - [ ] Longest pattern match wins among same-precedence profiles
  - [ ] Single profile always returned (never array)
  - [ ] Tests pass: `npx vitest run src/lib/profile-precedence.test.ts`

  **QA Scenarios**:
  ```
  Scenario: User profile wins over bundled
    Tool: Bash
    Steps:
      1. Run `npx vitest run src/lib/profile-precedence.test.ts`
      2. Test: given [bundled MOM profile, user-created MOM profile], selectBestProfile returns user-created
    Expected Result: All precedence tests pass
    Evidence: .sisyphus/evidence/task-3-precedence-tests.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(profiles): add profile precedence strategy for multi-match`
  - Files: `ogre-desktop/src/lib/profile-precedence.ts`, `ogre-desktop/src/lib/profile-precedence.test.ts`

- [x] 4. Move syncSiteProfiles() to App Startup

  **What to do**:
  - In `ogre-desktop/src/App.svelte` (or the app's init sequence), add a call to `syncSiteProfiles()` during app startup
  - Remove the duplicate call from `ogre-desktop/src/pages/Skills.svelte` `onMount` (or make it a no-op if already synced)
  - This fixes the latent bug where Agent Mode has zero site context if user never visits Skills page
  - Fire-and-forget pattern: `syncSiteProfiles().catch(() => {})` — errors swallowed, app continues

  **Must NOT do**:
  - Do NOT make startup block on sync completing
  - Do NOT remove the Skills page sync entirely (keep as re-sync for freshness)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/App.svelte:1-20` — app initialization code
  - `ogre-desktop/src/pages/Skills.svelte:110-118` — current syncSiteProfiles() call in Skills page onMount
  - `ogre-desktop/src/lib/skills-api.ts:235-280` — `syncSiteProfiles()` function

  **Acceptance Criteria**:
  - [ ] `syncSiteProfiles()` is called during app initialization (App.svelte onMount or equivalent)
  - [ ] Skills page still calls syncSiteProfiles (acts as re-sync)
  - [ ] App boots successfully even if sync fails

  **QA Scenarios**:
  ```
  Scenario: Bundled profiles are available without visiting Skills page
    Tool: Bash (grep)
    Steps:
      1. Search App.svelte for `syncSiteProfiles` call
      2. Verify it's in an onMount or initialization block
    Expected Result: Call found in app init code
    Evidence: .sisyphus/evidence/task-4-startup-sync.txt
  ```

  **Commit**: YES
  - Message: `fix(startup): sync bundled site profiles on app init`
  - Files: `ogre-desktop/src/App.svelte`

- [x] 5. Add Structured Frontmatter to Bundled Profiles

  **What to do**:
  - Enhance YAML frontmatter in `ogre-desktop/src/assets/profiles/myopenmath.md` and `aeries.md` with structured fields that make JSON conversion more reliable:
    ```yaml
    ---
    name: "MyOpenMath — Knowledge Profile"
    description: "..."
    urlPatterns:
      - "myopenmath.com"
    baseUrl: "https://www.myopenmath.com"
    role: "instructor"
    ---
    ```
  - Add `baseUrl` and `role` fields to frontmatter
  - Update `profile-template.md` to include these fields
  - Do NOT change the markdown body content — only frontmatter

  **Must NOT do**:
  - Do NOT restructure the markdown sections
  - Do NOT change any prose content
  - Do NOT rename sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 2, 6
  - **Blocked By**: None

  **References**:
  - `ogre-desktop/src/assets/profiles/myopenmath.md:1-6` — current frontmatter (name, description, urlPatterns)
  - `ogre-desktop/src/assets/profiles/aeries.md:1-6` — same structure
  - `ogre-desktop/src/assets/profile-template.md:1-7` — template frontmatter
  - `ogre-desktop/src/lib/skill-parser.ts:13-69` — gray-matter parsing reads `data.urlPatterns`

  **Acceptance Criteria**:
  - [ ] `myopenmath.md` frontmatter includes `baseUrl` and `role` fields
  - [ ] `aeries.md` frontmatter includes `baseUrl` and `role` fields
  - [ ] `profile-template.md` includes `baseUrl` and `role` fields
  - [ ] Existing `parseSkillMarkdown()` still works (YAML is backward-compatible)

  **QA Scenarios**:
  ```
  Scenario: Updated frontmatter is valid YAML
    Tool: Bash
    Steps:
      1. Run existing tests that parse these profiles: `npx vitest run src/lib/skills-api.test.ts`
      2. Assert tests still pass (backward compatible)
    Expected Result: All existing tests pass
    Evidence: .sisyphus/evidence/task-5-frontmatter-compat.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(profiles): add structured frontmatter to bundled profiles`
  - Files: `ogre-desktop/src/assets/profiles/myopenmath.md`, `ogre-desktop/src/assets/profiles/aeries.md`, `ogre-desktop/src/assets/profile-template.md`

- [x] 6. Rewrite buildSiteContextInjection() for JSON Output

  **What to do**:
  - Modify `ogre-desktop/src/lib/skills-api.ts:buildSiteContextInjection()`
  - Instead of injecting raw `s.content` (markdown), call `convertProfileToJSON(s.content)` from Task 2 to get structured JSON
  - Use `formatSiteGuideForAgent()` from Task 1 to format the output
  - Use `selectBestProfile()` from Task 3 when multiple profiles match
  - Add fallback: if JSON conversion fails, fall back to raw markdown injection (backward compat safety net)
  - Update tests in `skills-api.test.ts` to verify JSON output structure

  **Must NOT do**:
  - Do NOT store JSON in the database — compute at injection time
  - Do NOT change the `Skill` DB interface
  - Do NOT modify `findMatchingProfiles()` logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 7, 9, 10
  - **Blocked By**: Tasks 1, 2, 3, 5

  **References**:
  - `ogre-desktop/src/lib/skills-api.ts:205-212` — current `buildSiteContextInjection()` implementation
  - `ogre-desktop/src/lib/skills-api.test.ts:398-416` — existing tests for `buildSiteContextInjection`
  - `ogre-desktop/src/lib/profile-json-converter.ts` — Task 2 output (convertProfileToJSON)
  - `ogre-desktop/src/lib/site-guide-types.ts` — Task 1 output (formatSiteGuideForAgent)
  - `ogre-desktop/src/lib/profile-precedence.ts` — Task 3 output (selectBestProfile)
  - `ogre-desktop/src/lib/agent-loop.ts:172-184` — where injection is consumed (system prompt construction)
  - `ogre-desktop/src/lib/agent-loop.ts:399-413` — where injection is refreshed after navigation

  **Acceptance Criteria**:
  - [ ] `buildSiteContextInjection('https://www.myopenmath.com/course/123')` returns string containing valid JSON
  - [ ] Output contains `--- SITE GUIDE (JSON):` delimiter
  - [ ] JSON payload has keys: `site`, `selectors`, `navigation`, `workflows`, `gotchas`
  - [ ] Markdown fallback works when JSON conversion fails
  - [ ] `npx vitest run src/lib/skills-api.test.ts` passes

  **QA Scenarios**:
  ```
  Scenario: JSON injection for MyOpenMath URL
    Tool: Bash
    Steps:
      1. Run `npx vitest run src/lib/skills-api.test.ts`
      2. Test asserts: calling buildSiteContextInjection with myopenmath URL returns JSON with site="MyOpenMath"
    Expected Result: Tests pass, JSON output validated
    Evidence: .sisyphus/evidence/task-6-json-injection.txt

  Scenario: Fallback to markdown on parse error
    Tool: Bash
    Steps:
      1. Test with a skill whose content is malformed markdown
      2. Assert function still returns content (falls back to raw markdown delimiters)
    Expected Result: No crash, graceful fallback
    Evidence: .sisyphus/evidence/task-6-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(injection): convert site context injection to JSON output`
  - Files: `ogre-desktop/src/lib/skills-api.ts`, `ogre-desktop/src/lib/skills-api.test.ts`

- [x] 7. Update Agent Prompt Rules for JSON Format

  **What to do**:
  - Rewrite rule #11 in `ogre-desktop/src/lib/agent-prompt.ts` (SITE GUIDE PRIORITY) to reference JSON format:
    - "When a SITE GUIDE (JSON) is present, parse the JSON object to find selectors, navigation URLs, workflows, and gotchas"
    - "Use `selectors` object keys to find CSS selectors directly — do NOT invent selectors"
    - "Use `navigation` object to build URLs for page navigation"
    - "Consult `gotchas` array before interacting with the site"
  - Remove rule #13 (SELECTOR TRANSLATION) entirely — it existed to compensate for markdown's descriptive selectors. With JSON, selectors are literal CSS.
  - Add a new example showing JSON site guide usage in the EXAMPLES section

  **Must NOT do**:
  - Do NOT change any other agent prompt rules
  - Do NOT modify the action definitions or tool list

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 6

  **References**:
  - `ogre-desktop/src/lib/agent-prompt.ts:234` — rule #11 (SITE GUIDE PRIORITY)
  - `ogre-desktop/src/lib/agent-prompt.ts:235-236` — rules #12 (TASK DECOMPOSITION, keep) and #13 (SELECTOR TRANSLATION, remove)

  **Acceptance Criteria**:
  - [ ] Rule #11 references JSON format with `selectors`, `navigation`, `workflows`, `gotchas` keys
  - [ ] Rule #13 (SELECTOR TRANSLATION) removed
  - [ ] Remaining rules renumbered correctly
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: Agent prompt compiles and contains JSON instructions
    Tool: Bash
    Steps:
      1. Run `cd ogre-desktop && npx tsc --noEmit`
      2. Grep agent-prompt.ts for "SITE GUIDE (JSON)" — should find match
      3. Grep agent-prompt.ts for "SELECTOR TRANSLATION" — should NOT find match
    Expected Result: Compiles, JSON reference found, old rule removed
    Evidence: .sisyphus/evidence/task-7-prompt-update.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent): update prompt rules for JSON site guide format`
  - Files: `ogre-desktop/src/lib/agent-prompt.ts`

- [x] 8. Knowledge Profile Generation Endpoint on Grading Server

  **What to do**:
  - Add new endpoint `POST /api/generate-knowledge-profile` to `grading-server/server.js`
  - Request body: `{ pageSnapshot: string, url: string, existingSelectors?: object, provider?: string, model?: string }`
  - Calls the configured LLM (Ollama/OpenAI/etc.) with a system prompt that instructs:
    - "Given this page snapshot and URL, generate a markdown knowledge profile following this template: [profile-template.md content]"
    - "Include: site overview, navigation map, key workflows, CSS selectors reference, tips & gotchas"
  - Response: `{ markdown: string, metadata: { site: string, pagesAnalyzed: number } }`
  - Follow existing provider pattern in `grading-server/providers.js`

  **Must NOT do**:
  - Do NOT call Ollama directly from ogre-desktop — go through grading-server
  - Do NOT require this endpoint to be available for the rest of the feature to work (optional enhancement)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11
  - **Blocked By**: None (independent of frontend pipeline)

  **References**:
  - `grading-server/server.js` — existing endpoint patterns (POST /api/grade, POST /api/solver)
  - `grading-server/providers.js` — provider abstraction (buildOllamaRequest, parseOllamaResponse)
  - `ogre-desktop/src/assets/profile-template.md` — template to include in generation prompt
  - `ogre-desktop/src/lib/server.ts` — desktop client API calls pattern

  **Acceptance Criteria**:
  - [ ] `POST /api/generate-knowledge-profile` returns 200 with `{ markdown: "..." }`
  - [ ] Generated markdown includes YAML frontmatter with `name`, `urlPatterns`, `baseUrl`
  - [ ] Endpoint works with Ollama provider
  - [ ] Returns 400 if pageSnapshot is empty

  **QA Scenarios**:
  ```
  Scenario: Generate knowledge profile from page snapshot
    Tool: Bash (curl)
    Steps:
      1. Start grading server
      2. curl -X POST http://localhost:3000/api/generate-knowledge-profile -H "Content-Type: application/json" -d '{"pageSnapshot": "<html>..test page..</html>", "url": "https://example.com/grades"}'
      3. Assert response status 200
      4. Assert response body has `markdown` field containing YAML frontmatter
    Expected Result: 200 OK with valid markdown profile
    Evidence: .sisyphus/evidence/task-8-generate-endpoint.txt

  Scenario: Empty page snapshot returns 400
    Tool: Bash (curl)
    Steps:
      1. curl -X POST http://localhost:3000/api/generate-knowledge-profile -d '{"pageSnapshot": "", "url": ""}'
      2. Assert response status 400
    Expected Result: 400 Bad Request
    Evidence: .sisyphus/evidence/task-8-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(server): add knowledge profile generation endpoint`
  - Files: `grading-server/server.js`

- [x] 9. Tests for Injection Pipeline + Agent Prompt

  **What to do**:
  - Add/update tests in `ogre-desktop/src/lib/skills-api.test.ts` to verify:
    - JSON output structure from `buildSiteContextInjection()`
    - `selectBestProfile()` precedence (if not covered in Task 3)
    - Fallback behavior when conversion fails
  - Add tests verifying `AGENT_SYSTEM_PROMPT` in `agent-prompt.ts` references JSON format
  - Verify token reduction: measure character count of JSON injection vs original markdown

  **Must NOT do**:
  - Do NOT test agent behavior end-to-end here (that's F3)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 6, 7

  **References**:
  - `ogre-desktop/src/lib/skills-api.test.ts:398-482` — existing test structure
  - `ogre-desktop/src/lib/agent-prompt.ts` — updated prompt from Task 7

  **Acceptance Criteria**:
  - [ ] ≥5 new tests added across skills-api.test.ts
  - [ ] JSON structure assertions (not just "non-empty string")
  - [ ] Token reduction measured: JSON is ≥30% smaller than markdown
  - [ ] `npx vitest run src/lib/skills-api.test.ts` passes

  **QA Scenarios**:
  ```
  Scenario: All injection pipeline tests pass
    Tool: Bash
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts`
      2. Assert all tests pass
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-9-pipeline-tests.txt
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `test(injection): add JSON output and pipeline verification tests`
  - Files: `ogre-desktop/src/lib/skills-api.test.ts`

- [x] 10. Site Guide Status Indicator in Discover Tab

  **What to do**:
  - Create `ogre-desktop/src/components/grading/DiscoveryGuideStatus.svelte`
  - Shows a compact status bar at the top of the Discover tab:
    - If knowledge profile matches current URL: `"🟢 Site Guide: MyOpenMath — Active"` with toggle to disable
    - If no profile matches: `"⚪ No site guide for this page"` with `"Generate"` button (disabled if no provider)
    - If profile exists but inactive: `"🟡 Site Guide: MyOpenMath — Inactive"` with toggle to enable
  - Mount in `DiscoveryPanel.svelte` above the `DiscoveryModeSelector`
  - Props: `pageLoadedUrl: string` — to check for matching profiles
  - Uses `getSkillsWithUrlPattern()` and `findMatchingProfiles()` from skills-api.ts
  - Uses `selectBestProfile()` from Task 3

  **Must NOT do**:
  - Do NOT add a knowledge profile editor — view/toggle only
  - Do NOT modify DiscoveryPanel phase machine

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 4, 6

  **References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:298-304` — where to mount (above DiscoveryModeSelector)
  - `ogre-desktop/src/lib/skills-api.ts:188-212` — `findMatchingProfiles()` and `buildSiteContextInjection()` patterns
  - `ogre-desktop/src/lib/db.ts:622-628` — `updateSkillActive()` for toggle
  - `ogre-desktop/src/components/skills/SkillPicker.svelte` — similar toggle UI pattern to follow

  **Acceptance Criteria**:
  - [ ] Status indicator visible in Discover tab
  - [ ] Shows "Active" with green indicator when profile matches URL
  - [ ] Shows "No site guide" when no profile matches
  - [ ] Toggle enables/disables the profile's `is_active` flag

  **QA Scenarios**:
  ```
  Scenario: Status shows active when on profiled site
    Tool: Playwright
    Steps:
      1. Navigate embedded browser to myopenmath.com (or mock URL matching)
      2. Open Discover tab
      3. Assert element with text "Site Guide" and "Active" is visible
    Expected Result: Green status indicator visible
    Evidence: .sisyphus/evidence/task-10-status-active.png

  Scenario: Status shows empty when on unknown site
    Tool: Playwright
    Steps:
      1. Navigate to a non-profiled URL
      2. Open Discover tab
      3. Assert element with text "No site guide" is visible
    Expected Result: Neutral status indicator visible
    Evidence: .sisyphus/evidence/task-10-status-empty.png
  ```

  **Commit**: YES
  - Message: `feat(discover): add site guide status indicator`
  - Files: `ogre-desktop/src/components/grading/DiscoveryGuideStatus.svelte`, `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`

- [x] 11. Knowledge Profile Generation Flow in Discover Tab

  **What to do**:
  - Add a "Generate Knowledge Profile" step to the Discover tab workflow
  - After selector discovery completes (review phase), add a secondary action: `"Generate Site Guide"` button
  - Clicking it:
    1. Captures current page snapshot (DOM + URL)
    2. Calls `POST /api/generate-knowledge-profile` (Task 8)
    3. Shows progress indicator during generation
    4. Displays generated markdown in a preview panel (`DiscoveryGuidePreview.svelte`)
    5. User can "Save as Site Guide" → calls `saveSkill()` with `source='site-profile'`, `is_active: 0`
    6. Or "Discard" → returns to review phase
  - Create `ogre-desktop/src/components/grading/DiscoveryGuidePreview.svelte` — shows markdown content, Save/Discard buttons
  - Add to DiscoveryPanel: new optional sub-flow within `review` phase (NOT a new phase — keeps state machine clean per Metis guardrail G6)

  **Must NOT do**:
  - Do NOT add a new phase to the discovery state machine — use a sub-state or dialog within `review`
  - Do NOT make knowledge generation required — it's fully optional
  - Do NOT add a markdown editor — preview only

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 8, 10

  **References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:340-379` — review phase UI where button goes
  - `ogre-desktop/src/lib/server.ts` — pattern for calling grading-server endpoints from desktop
  - `ogre-desktop/src/lib/skills-api.ts:131-149` — `installSkill()` pattern for saving to DB
  - `ogre-desktop/src/components/grading/DiscoverySaveDialog.svelte` — similar save dialog pattern
  - `ogre-desktop/src/lib/browser-actions.ts` — DOM snapshot capture patterns

  **Acceptance Criteria**:
  - [ ] "Generate Site Guide" button visible in review phase
  - [ ] Clicking generates a markdown profile via grading-server endpoint
  - [ ] Preview shows generated markdown content
  - [ ] "Save" stores profile in skills DB with `source='site-profile'`, `is_active: 0`
  - [ ] "Discard" returns to review phase
  - [ ] Button disabled when no AI provider configured

  **QA Scenarios**:
  ```
  Scenario: Generate and save knowledge profile
    Tool: Playwright
    Steps:
      1. Run discovery on a page
      2. In review phase, click "Generate Site Guide"
      3. Wait for generation to complete
      4. Assert preview panel shows markdown content with YAML frontmatter
      5. Click "Save as Site Guide"
      6. Assert profile appears in skills DB
    Expected Result: Profile saved successfully
    Evidence: .sisyphus/evidence/task-11-generate-save.png

  Scenario: Generation fails gracefully when Ollama offline
    Tool: Playwright
    Steps:
      1. Stop Ollama service
      2. Click "Generate Site Guide"
      3. Assert error message displayed (not crash)
      4. Assert user can still save CSS selector profile normally
    Expected Result: Error toast, no crash, discovery flow continues
    Evidence: .sisyphus/evidence/task-11-offline-error.png
  ```

  **Commit**: YES
  - Message: `feat(discover): add knowledge profile generation flow`
  - Files: `ogre-desktop/src/components/grading/DiscoveryGuidePreview.svelte`, `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`

- [x] 12. Guide-Enhanced Discovery with Pre-Populated Hints

  **What to do**:
  - When starting discovery on a page that already has a knowledge profile, pre-populate discovery hints from the profile's JSON data
  - In `DiscoveryPanel.svelte:handleStartDiscovery()`, check for matching knowledge profile
  - If found, call `convertProfileToJSON()` on its content, extract `selectors` as `knownSelectors` hints
  - Pass to `runDiscovery({ hints: { knownSelectors: {...}, pageDescription: guide.site } })`
  - This lets the AI discovery engine skip re-discovering selectors it already knows, and validate/refine existing ones

  **Must NOT do**:
  - Do NOT auto-skip discovery if a profile exists — let user explicitly choose
  - Do NOT modify `runDiscovery()` itself — just pass richer hints

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 6

  **References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:121-158` — `handleStartDiscovery()` function
  - `ogre-desktop/src/lib/discover.ts` — `runDiscovery()` accepts `hints` parameter
  - `ogre-desktop/src/lib/discovery-intent.ts` — `intentToDiscoveryHints()` for hint format
  - `ogre-desktop/src/lib/profile-json-converter.ts` — Task 2 output

  **Acceptance Criteria**:
  - [ ] Discovery on myopenmath.com passes known selectors as hints
  - [ ] Discovery on unknown site works normally (no hints)
  - [ ] Hint-enhanced discovery produces results at least as good as baseline

  **QA Scenarios**:
  ```
  Scenario: Discovery uses existing profile hints
    Tool: Bash
    Steps:
      1. Verify that handleStartDiscovery reads matching profile and passes knownSelectors to runDiscovery
      2. Assert hints object contains selectors from the profile
    Expected Result: Hints passed to discovery engine
    Evidence: .sisyphus/evidence/task-12-enhanced-hints.txt
  ```

  **Commit**: YES
  - Message: `feat(discover): guide-enhanced discovery with pre-populated hints`
  - Files: `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`

- [x] 13. Edge Case Handling

  **What to do**:
  - **Offline resilience**: Disable "Generate Site Guide" button when no provider is configured; show tooltip "Configure AI provider first"
  - **Multi-match display**: If `selectBestProfile()` picks one but others exist, show a subtle "(2 profiles match)" note in the status indicator
  - **Stale profile**: When a page changes (staleWarning already exists in DiscoveryPanel), extend it to note that the knowledge profile may also be outdated
  - **Generation cancellation**: If user navigates away during generation, cancel the in-flight request

  **Must NOT do**:
  - Do NOT add complex profile merge UI
  - Do NOT add profile versioning

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 14)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 14
  - **Blocked By**: Task 11

  **References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:102-117` — existing stale warning pattern
  - `ogre-desktop/src/components/grading/DiscoveryGuideStatus.svelte` — Task 10 output

  **Acceptance Criteria**:
  - [ ] Generate button disabled without provider
  - [ ] Multi-match note visible when >1 profile matches
  - [ ] Stale warning mentions knowledge profile
  - [ ] Generation cancels on navigation

  **QA Scenarios**:
  ```
  Scenario: Generate button disabled without AI provider
    Tool: Playwright
    Steps:
      1. Ensure no AI provider configured
      2. Open Discover tab
      3. Assert "Generate Site Guide" button is disabled with tooltip
    Expected Result: Button disabled, tooltip visible
    Evidence: .sisyphus/evidence/task-13-offline.png
  ```

  **Commit**: YES
  - Message: `fix(edge-cases): offline resilience, multi-match, stale data handling`
  - Files: various

- [x] 14. Integration Tests for Full Pipeline

  **What to do**:
  - Add integration test in `ogre-desktop/src/lib/discover.integration.test.ts` (extend existing file) or new file
  - Test the full flow: markdown profile → `convertProfileToJSON()` → `buildSiteContextInjection()` → verify JSON output
  - Test: profile saved from discovery → appears in `getSkillsWithUrlPattern()` → matches URL → JSON injected
  - Test token reduction: compare character count of JSON vs markdown injection for MOM profile
  - Mock DB calls (Tauri invoke) as other integration tests do

  **Must NOT do**:
  - Do NOT test UI components here — purely TypeScript pipeline

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 13)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 9, 13

  **References**:
  - `ogre-desktop/src/lib/discover.integration.test.ts` — existing integration test patterns
  - `ogre-desktop/src/lib/skills-api.test.ts` — existing mock patterns for DB
  - `ogre-desktop/src/assets/profiles/myopenmath.md` — real profile content for end-to-end

  **Acceptance Criteria**:
  - [ ] End-to-end test: markdown → JSON → injection → validated output
  - [ ] Token reduction assertion: JSON is ≥30% smaller than markdown
  - [ ] All integration tests pass: `npx vitest run src/lib/discover.integration.test.ts`

  **QA Scenarios**:
  ```
  Scenario: Full pipeline integration test passes
    Tool: Bash
    Steps:
      1. Run `cd ogre-desktop && npx vitest run src/lib/discover.integration.test.ts`
      2. Assert all tests pass
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-14-integration.txt
  ```

  **Commit**: YES
  - Message: `test(integration): full pipeline integration tests`
  - Files: `ogre-desktop/src/lib/discover.integration.test.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` + check for TypeScript errors. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Test: Agent Mode on myopenmath.com receives JSON injection. Discover tab shows status indicator. Knowledge generation produces valid profile. Test edge cases: offline, unknown site, stale profile.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — nothing missing, nothing beyond spec. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

1. `feat(types): add SiteGuide JSON schema interface` — site-guide-types.ts
2. `feat(parser): markdown-to-JSON converter for knowledge profiles` — profile-json-converter.ts + .test.ts
3. `fix(startup): sync bundled site profiles on app init` — App.svelte
4. `feat(profiles): add structured frontmatter to bundled profiles` — assets/profiles/*.md
5. `feat(injection): convert site context injection to JSON output` — skills-api.ts + .test.ts
6. `refactor(agent): update prompt rules for JSON site guide format` — agent-prompt.ts
7. `feat(server): add knowledge profile generation endpoint` — grading-server
8. `feat(discover): add site guide status indicator` — DiscoveryGuideStatus.svelte
9. `feat(discover): add knowledge profile generation flow` — DiscoveryPanel.svelte
10. `feat(discover): guide-enhanced discovery with pre-populated hints` — discover.ts
11. `fix(edge-cases): offline resilience, multi-match precedence, stale data` — various
12. `test(integration): full pipeline integration tests` — discover.integration.test.ts

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run src/lib/profile-json-converter.test.ts  # Parser tests pass
cd ogre-desktop && npx vitest run src/lib/skills-api.test.ts              # Injection tests pass
cd ogre-desktop && npx vitest run                                          # All tests pass
```

### Final Checklist
- [ ] `buildSiteContextInjection('https://www.myopenmath.com/course/123')` returns valid JSON string
- [ ] JSON contains keys: site, selectors, navigation, workflows, gotchas
- [ ] Agent prompt rules #11 and #13 reference JSON format
- [ ] App startup calls syncSiteProfiles() (not just Skills page)
- [ ] Discover tab shows site guide status for profiled URLs
- [ ] Knowledge generation produces saveable markdown profile
- [ ] All tests pass: `npx vitest run` exits 0
- [ ] No `as any`, no `@ts-ignore`, no console.log in production code
- [ ] `skills.content` still stores markdown (never JSON)
- [ ] `site_profiles` and `skills` table schemas unchanged
