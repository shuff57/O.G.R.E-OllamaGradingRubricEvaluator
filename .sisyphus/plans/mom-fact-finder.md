# MOM Fact-Finder: Pattern Discovery Skill for MyOpenMath

## TL;DR

> **Quick Summary**: Build a "fact-finder" sub-skill that browses MyOpenMath's question bank, reads existing question code, extracts patterns, and builds a persistent pattern library — filling the gap when `mom-frq` lacks a reference for a particular question type or topic.
> 
> **Deliverables**:
> - `.claude/skills/mom-fact-finder/CLAUDE.md` — browser automation skill for searching and extracting question patterns
> - `.claude/skills/mom-patterns/CLAUDE.md` — persistent, growing pattern library organized by topic
> - DOM reconnaissance report documenting actual selectors on MOM viewonly pages
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (Recon) → Tasks 2-3 (Write Skills) → Tasks 4-5 (Integration QA)

---

## Context

### Original Request
User identified a gap: when writing MOM questions and no explicit reference exists for a particular question type/topic, there's no way to learn from existing examples in the question bank. Need a skill that goes out, finds real questions, reads their code, and extracts patterns.

### Interview Summary
**Key Discussions**:
- **Trigger**: Sub-skill invokable by any future question-writing skill + standalone
- **Output**: Both raw code examples AND synthesized pattern summaries
- **Search scope**: User's questions first → global MOM library fallback
- **Sample size**: 5-8 examples per search (thorough, prefer "battle-tested" by Times Used)
- **Input**: Natural language + optional hints (type, library, keywords)
- **Persistence**: Growing pattern library at `.claude/skills/mom-patterns/CLAUDE.md`, organized by topic/subject
- **Lookup strategy**: Library-first by default; `refresh=true` forces fresh browser search
- **Browser**: Check if MOM is open; navigate if needed

**Research Findings**:
- `mom-frq` (1043 lines): Comprehensive static reference — syntax, libraries, FRQ scaffold, examples
- `mom-page-map` (494 lines): Complete DOM/URL map including Question Set Management search UI and Question Editor selectors
- `gb-pipeline`: Sub-agent delegation pattern using `task()` with `load_skills` and temp file communication
- MOM search supports: text search, library filtering, type filtering, advanced search
- Question code accessible via `moddataset.php?id={qid}&cid={cid}&viewonly=1`

### Metis Review
**Identified Gaps** (addressed in plan):
- DOM selectors on `viewonly=1` pages may differ from edit pages → Wave 1 reconnaissance validates this
- Pagination behavior unknown → Recon task checks for pagination controls
- "My questions" search option unclear from `#cursearchtype` dropdown → Recon maps actual options
- Self-modifying skill file unprecedented in codebase → Size cap + write safety guardrails
- Input/output contract unspecified → Locked down in skill file template
- Session expiry detection missing → Included in error handling section
- Pattern library idempotency untested → QA scenario validates update-not-duplicate behavior

---

## Work Objectives

### Core Objective
Create two skill files: a fact-finding browser automation skill that discovers question patterns from MOM's question bank, and a persistent pattern library that grows with each invocation — enabling any question-writing skill to learn from real examples when the static `mom-frq` reference doesn't cover a topic.

### Concrete Deliverables
- `.claude/skills/mom-fact-finder/CLAUDE.md` — complete Playwriter-based skill instructions
- `.claude/skills/mom-patterns/CLAUDE.md` — initial scaffold with structure, metadata template, and first entry placeholder
- `.sisyphus/evidence/task-1-recon/` — DOM reconnaissance findings

### Definition of Done
- [ ] Fact-finder skill can be loaded via `load_skills=["mom-fact-finder"]` in a `task()` call
- [ ] Pattern library can be loaded via `load_skills=["mom-patterns"]` in a `task()` call
- [ ] Fact-finder instructions reference validated selectors (not assumptions from edit-page map)
- [ ] Pattern library has defined section format, size limits, and update protocol
- [ ] End-to-end: invoking the fact-finder for a known topic produces extracted code + synthesized pattern + library update

### Must Have
- READ-ONLY safety: skill ONLY uses `viewonly=1` URLs, NEVER navigates to edit mode or clicks Save/Delete
- Library-first lookup: check `mom-patterns` before launching browser
- Fallback search: user's library → global library
- Pattern library size cap: 800 lines max with pruning strategy
- Session expiry detection: check URL after navigation for login redirects
- Extraction truncation: Common Control max 80 lines, Question Text max 40 lines per example
- Concrete entry format for pattern library (not left to agent judgment)
- Sub-skill input contract: `topic` (required), `questionType`, `library`, `keywords`, `refresh` (all optional)
- Rate limiting: minimum 1 second between page navigations, max 8 questions per session

### Must NOT Have (Guardrails)
- Must NOT modify `mom-frq/CLAUDE.md` or `mom-page-map/CLAUDE.md` — ever
- Must NOT navigate to any MOM page except `manageqset.php` and `moddataset.php?viewonly=1`
- Must NOT click Preview, Save, Delete, or any form-submission button
- Must NOT browse multiple courses — only the currently-active course's question bank
- Must NOT write skill files until DOM reconnaissance validates selector assumptions
- Must NOT create documentation beyond the two skill files
- Must NOT add over-abstracted helper utilities — skill is self-contained markdown instructions

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (skill files are markdown — no unit test framework applicable)
- **Automated tests**: None (markdown instructions)
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DOM Recon**: Use Playwriter — Navigate MOM pages, snapshot DOM, capture actual selectors
- **Skill File Verification**: Use Bash — `load_skills` in `task()` calls, verify file loads
- **Integration Test**: Use Playwriter — invoke full fact-finder workflow, verify extraction + library update

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — DOM reconnaissance):
└── Task 1: MOM Viewonly Page DOM Reconnaissance [deep]

Wave 2 (After Wave 1 — write skill files, PARALLEL):
├── Task 2: Write mom-fact-finder/CLAUDE.md [deep]
└── Task 3: Write mom-patterns/CLAUDE.md initial scaffold [quick]

Wave 3 (After Wave 2 — integration QA):
├── Task 4: End-to-end live test of fact-finder [unspecified-high]
└── Task 5: Pattern library idempotency + load_skills verification [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Skill quality review (unspecified-high)
├── Task F3: Real live QA with Playwriter (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Task 4 → F1-F4
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Waves 2 & 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3 | 1 |
| 2 | 1 | 4, 5 | 2 |
| 3 | 1 | 4, 5 | 2 |
| 4 | 2, 3 | F1-F4 | 3 |
| 5 | 2, 3 | F1-F4 | 3 |
| F1-F4 | 4, 5 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `deep` (+ `playwriter`, `mom-page-map` skills)
- **Wave 2**: **2 tasks** — T2 → `deep`, T3 → `quick`
- **Wave 3**: **2 tasks** — T4 → `unspecified-high` (+ `playwriter`, `mom-fact-finder`, `mom-page-map`), T5 → `quick`
- **Wave FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `playwriter`), F4 → `deep`

---

## TODOs

- [ ] 1. MOM Viewonly Page DOM Reconnaissance

  **What to do**:
  - Navigate to MOM's Question Set Management page (`manageqset.php?cid={cid}`) using Playwriter
  - Use `snapshot()` to capture the search UI: document the `#cursearchtype` dropdown options verbatim — specifically identify which option represents "my questions" vs "all libraries"
  - Search for a common term (e.g., "statistics") and capture the results table
  - Check for pagination controls: is there a "next page" link, "showing X of Y" text, or result count limit?
  - Check if table column headers (especially "Times Used") are click-sortable (look for sort indicators in snapshot)
  - Navigate to a known question in viewonly mode (`moddataset.php?id={qid}&cid={cid}&viewonly=1`)
  - **CRITICAL**: Snapshot the viewonly page and document the ACTUAL selectors for Common Control and Question Text content. The edit page uses `textarea#control` and `textarea#qtext` — verify whether viewonly uses the same tags or renders as `<div>`, `<pre>`, or other elements
  - Test the Advanced Search button (`#advsearchbtn`) — expand it and document what filter options appear
  - Check: does the search match question description text, code content, or both?
  - Save all findings to `.sisyphus/evidence/task-1-recon/` as text files

  **Must NOT do**:
  - Do NOT click Edit, Save, Delete, or any form submission button
  - Do NOT modify any question content
  - Do NOT navigate outside of `manageqset.php` and `moddataset.php?viewonly=1`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Exploratory task requiring careful DOM analysis, multiple navigation steps, and detailed documentation
  - **Skills**: [`playwriter`, `mom-page-map`]
    - `playwriter`: Browser automation for navigating MOM and taking snapshots
    - `mom-page-map`: Reference for known selectors and URL patterns to validate against
  - **Skills Evaluated but Omitted**:
    - `mom-frq`: Not needed — this task is about DOM structure, not question syntax

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-page-map/CLAUDE.md:144-179` — Question Set Management page selectors (search UI, results table, column definitions)
  - `.claude/skills/mom-page-map/CLAUDE.md:182-247` — Question Editor page selectors (`textarea#control`, `textarea#qtext`, save buttons, type picker)
  - `.claude/skills/mom-page-map/CLAUDE.md:24-32` — Question URL patterns including `viewonly=1`

  **WHY Each Reference Matters**:
  - `mom-page-map:144-179`: These are the ASSUMED selectors for the search page. Recon must verify they're accurate and complete (pagination, sorting may be undocumented).
  - `mom-page-map:182-247`: These are EDIT PAGE selectors. The critical question is whether `textarea#control` and `textarea#qtext` exist on `viewonly=1` pages or render differently.
  - `mom-page-map:24-32`: URL patterns for constructing viewonly URLs. Need to verify the `viewonly=1` param actually works as expected.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Search UI renders and matches documented selectors
    Tool: Playwriter
    Preconditions: MOM is open in Chrome with Playwriter active, user is logged in as teacher
    Steps:
      1. Navigate to `manageqset.php?cid={cid}` (extract cid from current MOM URL)
      2. Run `snapshot({ page: state.page, search: /search|Search|library/i })`
      3. Verify `#cursearchtype` button exists in snapshot output
      4. Click `#cursearchtype` to open dropdown
      5. Run `snapshot({ page: state.page })` and capture ALL dropdown option text verbatim
      6. Search for "statistics" using `#search` input + Search button
      7. Snapshot results table — verify columns include: Description, Type, Times Used, ID
      8. Check for pagination: search snapshot for /page|next|prev|showing.*of/i
    Expected Result: All selectors from mom-page-map verified present. Dropdown options documented. Pagination presence/absence confirmed.
    Failure Indicators: `#cursearchtype` not found, `#search` not found, results table missing expected columns
    Evidence: .sisyphus/evidence/task-1-recon/search-ui-snapshot.txt

  Scenario: Viewonly page code extraction selectors
    Tool: Playwriter
    Preconditions: Search results visible from previous scenario
    Steps:
      1. From search results, find a question ID (from the ID column)
      2. Navigate to `moddataset.php?id={qid}&cid={cid}&viewonly=1`
      3. Run `snapshot({ page: state.page })` — capture full page structure
      4. Check if `textarea#control` exists: `state.page.locator('textarea#control').count()`
      5. If NOT: check alternatives — `#control`, `[name="control"]`, `pre`, `.code-view`, any element containing PHP-like code
      6. Same for Question Text: check `textarea#qtext`, then fallback selectors
      7. Extract actual content from whichever selector works — verify it contains MOM code (look for `$answer`, `$questions`, `loadlibrary`, etc.)
      8. Document the ACTUAL working selectors
    Expected Result: Working selectors for extracting Common Control and Question Text from viewonly pages, documented with examples.
    Failure Indicators: No selector returns content, page redirects to login, viewonly=1 shows a completely different layout than expected
    Evidence: .sisyphus/evidence/task-1-recon/viewonly-selectors.txt

  Scenario: Table sorting capability check
    Tool: Playwriter
    Preconditions: Back on search results page from Scenario 1
    Steps:
      1. Snapshot the table header row: `snapshot({ locator: state.page.locator('table thead, table tr:first-child') })`
      2. Look for sortable indicators: clickable links in headers, sort icons, aria-sort attributes
      3. If headers appear clickable: click "Times Used" header and verify table reorders
      4. If not sortable: document this — extraction logic must sort in JavaScript instead
    Expected Result: Clear answer on whether Times Used column is sortable via click.
    Failure Indicators: None — this is informational. Either outcome is handled.
    Evidence: .sisyphus/evidence/task-1-recon/table-sorting.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-recon/search-ui-snapshot.txt` — Full search page snapshot + dropdown options
  - [ ] `.sisyphus/evidence/task-1-recon/viewonly-selectors.txt` — Actual working selectors on viewonly pages
  - [ ] `.sisyphus/evidence/task-1-recon/table-sorting.txt` — Sorting capability findings
  - [ ] `.sisyphus/evidence/task-1-recon/pagination.txt` — Pagination presence/absence + mechanism if present
  - [ ] `.sisyphus/evidence/task-1-recon/advanced-search.txt` — Advanced search filter options

  **Commit**: YES
  - Message: `feat(skills): add DOM recon evidence for MOM viewonly pages`
  - Files: `.sisyphus/evidence/task-1-recon/*`

- [ ] 2. Write `mom-fact-finder/CLAUDE.md` Skill File

  **What to do**:
  - Create `.claude/skills/mom-fact-finder/CLAUDE.md` — a complete Playwriter-based skill for browsing MOM's question bank and extracting patterns
  - MUST incorporate the actual selectors discovered in Task 1's recon (read `.sisyphus/evidence/task-1-recon/viewonly-selectors.txt` for viewonly page selectors; `search-ui-snapshot.txt` for search UI specifics)
  - Structure the skill file following `mom-frq/CLAUDE.md` naming convention and `gb-pipeline/SKILL.md` delegation patterns
  - Include these sections in the skill file:
    - **Overview**: What this skill does, when to use it, how it fits with `mom-frq` and `mom-patterns`
    - **Input Contract**: Exact parameters the caller passes (topic required; questionType, library, keywords, refresh optional)
    - **Output Contract**: What the skill returns — temp file at `temp/mom_fact_finder_results.json` with both raw examples and synthesized pattern
    - **Library-First Lookup**: Instructions to check `mom-patterns/CLAUDE.md` first; only proceed to browser search if no match or `refresh=true`
    - **Browser Search Workflow**: Step-by-step Playwriter instructions for:
      1. Check if MOM tab exists (`context.pages().find(p => p.url().includes('myopenmath.com'))`) — navigate if not
      2. Extract `cid` from current MOM URL
      3. Navigate to `manageqset.php?cid={cid}`
      4. Set search scope (user's library first via `#cursearchtype`, then global)
      5. Enter search term, click Search
      6. Extract results table rows — sort by Times Used if table supports it, else sort in JS
      7. Select top 5-8 questions by Times Used
      8. For each: navigate to `moddataset.php?id={qid}&cid={cid}&viewonly=1`
      9. Extract Common Control + Question Text using validated selectors from recon
      10. Rate limit: `waitForTimeout(1000)` between navigations
    - **Extraction Logic**: How to read and truncate code (Common Control max 80 lines, Question Text max 40 lines)
    - **Synthesis Instructions**: How to analyze the extracted examples and produce a pattern summary
    - **Pattern Library Update**: How to append/update `mom-patterns/CLAUDE.md` (read first, find existing section or create new, preserve all other sections, enforce 800-line cap)
    - **Error Handling**: Session expiry (check URL for login redirects), no search results (broaden search), empty Common Control (skip question), network errors
    - **READ-ONLY Safety Rules**: Prominent warning section — ONLY `viewonly=1` URLs, NEVER edit/save/delete, NEVER navigate outside allowed pages
    - **Rate Limiting**: 1s between navigations, max 8 questions per session
    - **Pattern Library Entry Format** (exact template to follow):
      ```markdown
      ## [Topic Name]
      **Added**: YYYY-MM-DD | **Sources**: QID #1234, #5678, #9012
      **Question Types**: essay, number | **Libraries**: `stats`
      
      ### Key Pattern
      - [3-5 bullet points of what the extracted code does differently from mom-frq]
      
      ### Code Example (best of N)
      [Single most representative code block, truncated to limits]
      
      ### Extracted Function Calls
      - [List of function calls found in examples, especially any not documented in mom-frq]
      ```

  **Must NOT do**:
  - Do NOT hardcode selectors from `mom-page-map` — use the VALIDATED selectors from Task 1 recon evidence
  - Do NOT include instructions to modify `mom-frq/CLAUDE.md` or `mom-page-map/CLAUDE.md`
  - Do NOT include instructions to click Preview, Save, Delete
  - Do NOT write overly abstract or vague instructions — every step must reference a concrete selector or URL pattern

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex skill file requiring careful integration of recon findings, multiple instruction sections, safety rules, and error handling
  - **Skills**: []
    - No skills needed — this is writing a markdown file based on evidence from Task 1
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed to WRITE the skill file (only needed to EXECUTE it later)
    - `mom-page-map`: Recon evidence supersedes this — use actual findings, not assumptions

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-frq/CLAUDE.md` — Overall structure and naming convention for MOM skill files (1043 lines, organized by sections with code examples)
  - `.claude/skills/gb-pipeline/SKILL.md:36-46` — Sub-agent `task()` delegation syntax (category, load_skills, prompt, run_in_background)
  - `.claude/skills/gb-compare/SKILL.md` — READ-ONLY safety rules pattern to follow
  - `.claude/skills/mom-page-map/CLAUDE.md:144-179` — Question Set Management selectors (baseline, may be supplemented by recon)
  - `.claude/skills/mom-page-map/CLAUDE.md:182-247` — Question Editor selectors (baseline, viewonly may differ)

  **Recon Evidence (CRITICAL — must read before writing):**
  - `.sisyphus/evidence/task-1-recon/viewonly-selectors.txt` — ACTUAL working selectors for viewonly pages
  - `.sisyphus/evidence/task-1-recon/search-ui-snapshot.txt` — Actual search dropdown options and search behavior
  - `.sisyphus/evidence/task-1-recon/table-sorting.txt` — Whether Times Used is click-sortable
  - `.sisyphus/evidence/task-1-recon/pagination.txt` — Pagination mechanism (affects search loop)
  - `.sisyphus/evidence/task-1-recon/advanced-search.txt` — Available filter options

  **WHY Each Reference Matters**:
  - `mom-frq`: Copy the file structure pattern (sections, code blocks, pitfall tables) for consistency
  - `gb-pipeline:36-46`: The exact `task()` syntax callers will use to invoke this skill
  - `gb-compare`: The READ-ONLY safety pattern to replicate in the fact-finder
  - Recon evidence files: **The most critical references** — these contain the validated selectors the skill must use. Do NOT use mom-page-map selectors where recon evidence provides actual findings.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill file loads successfully via load_skills
    Tool: Bash
    Preconditions: `.claude/skills/mom-fact-finder/CLAUDE.md` exists
    Steps:
      1. Verify file exists: `ls .claude/skills/mom-fact-finder/CLAUDE.md`
      2. Verify file is valid markdown: check first line starts with `#`
      3. Verify key sections exist: grep for 'Input Contract', 'Output Contract', 'Browser Search Workflow', 'READ-ONLY Safety', 'Pattern Library Entry Format'
      4. Verify selectors match recon evidence: compare selectors in skill file against `.sisyphus/evidence/task-1-recon/viewonly-selectors.txt`
    Expected Result: File exists, all required sections present, selectors match recon evidence.
    Failure Indicators: Missing sections, selectors from mom-page-map used instead of recon findings, vague instructions like "find the element"
    Evidence: .sisyphus/evidence/task-2-skill-file-validation.txt

  Scenario: Safety rules are comprehensive and prominent
    Tool: Bash (grep)
    Preconditions: `.claude/skills/mom-fact-finder/CLAUDE.md` exists
    Steps:
      1. grep for 'viewonly=1' — must appear in all navigation URLs
      2. grep for 'NEVER' or 'Must NOT' — must forbid edit, save, delete
      3. Verify 'READ-ONLY' appears in a heading (not buried in body text)
      4. Verify rate limiting instructions are present (1s delay, 8 question cap)
    Expected Result: Safety section is prominent, all forbidden actions listed, rate limits specified.
    Failure Indicators: Safety rules buried or missing, edit-mode URLs without viewonly=1
    Evidence: .sisyphus/evidence/task-2-safety-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-skill-file-validation.txt` — Section presence + selector verification
  - [ ] `.sisyphus/evidence/task-2-safety-validation.txt` — Safety rule completeness check

  **Commit**: YES (groups with Task 3)
  - Message: `feat(skills): add mom-fact-finder and mom-patterns skills`
  - Files: `.claude/skills/mom-fact-finder/CLAUDE.md`, `.claude/skills/mom-patterns/CLAUDE.md`

- [ ] 3. Write `mom-patterns/CLAUDE.md` Initial Scaffold

  **What to do**:
  - Create `.claude/skills/mom-patterns/CLAUDE.md` — the persistent, growing pattern library
  - This file starts near-empty but with a well-defined structure that the fact-finder will populate over time
  - Include these sections:
    - **Header**: Title, description, last-updated timestamp, total entries count
    - **How This File Works**: Explanation that this is auto-populated by `mom-fact-finder` and loaded by question-writing skills via `load_skills=["mom-patterns"]`
    - **Size Policy**: Hard cap at 800 lines. When limit approached: oldest/least-referenced topics get summarized to 3-line summaries. Each topic section max 150 lines.
    - **Entry Format Template**: The exact markdown structure each pattern entry MUST follow (copy from the Pattern Library Entry Format in Task 2's skill file)
    - **Topic Index**: Empty placeholder — will list all topics as they're added
    - **Patterns Section**: Empty — populated by fact-finder. Include ONE example entry as a template (clearly marked as `<!-- TEMPLATE - REPLACE WITH REAL DATA -->`) to show the expected format
  - The template example entry should use a realistic topic (e.g., "Hypothesis Testing FRQ") with placeholder values

  **Must NOT do**:
  - Do NOT add real pattern content — this is a scaffold only
  - Do NOT exceed 80 lines for the initial scaffold (it should be mostly structure)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file creation with defined structure — no research or complex logic
  - **Skills**: []
    - No skills needed — straightforward markdown creation
  - **Skills Evaluated but Omitted**:
    - `mom-frq`: Not needed for creating an empty scaffold

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 1 (needs recon findings to align entry format)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-frq/CLAUDE.md:1-20` — File header convention for MOM skill files
  - Task 2's pattern library entry format (defined in the fact-finder skill) — the scaffold must match

  **WHY Each Reference Matters**:
  - `mom-frq:1-20`: Follow the same header and organizational style for consistency across MOM skills
  - Task 2 entry format: The scaffold's template entry must exactly match the format the fact-finder will write, ensuring consistency

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scaffold file has correct structure
    Tool: Bash (grep)
    Preconditions: `.claude/skills/mom-patterns/CLAUDE.md` exists
    Steps:
      1. Verify file exists: `ls .claude/skills/mom-patterns/CLAUDE.md`
      2. grep for '# MyOpenMath' or similar title heading
      3. grep for 'Size Policy' or '800 lines' — size cap documented
      4. grep for 'Entry Format' or 'Template' — format template present
      5. grep for 'TEMPLATE' or 'REPLACE' — example entry is clearly marked as template
      6. Count total lines: `wc -l` — must be under 80
    Expected Result: File exists with all structural sections, template entry present and marked, under 80 lines.
    Failure Indicators: Missing size policy, no template entry, over 80 lines, real data instead of placeholders
    Evidence: .sisyphus/evidence/task-3-scaffold-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-scaffold-validation.txt` — Structure and size verification

  **Commit**: YES (groups with Task 2)
  - Message: `feat(skills): add mom-fact-finder and mom-patterns skills`
  - Files: `.claude/skills/mom-fact-finder/CLAUDE.md`, `.claude/skills/mom-patterns/CLAUDE.md`

- [ ] 4. End-to-End Live Test of Fact-Finder

  **What to do**:
  - Load the `mom-fact-finder` skill and execute it against MOM for a real topic
  - Choose a topic that's likely to have many results (e.g., "statistics" or "linear regression" or "normal distribution")
  - Verify the complete workflow:
    1. Library-first lookup: check `mom-patterns` — should find no match (library is empty scaffold)
    2. Browser search: navigate to MOM, search, get results
    3. Example selection: top 5-8 by Times Used
    4. Code extraction: read Common Control + Question Text from viewonly pages
    5. Synthesis: agent produces a pattern summary
    6. Output: temp file written with raw examples + pattern
    7. Library update: `mom-patterns/CLAUDE.md` gains a new topic section
  - Verify the pattern library was updated correctly:
    - New topic section matches the defined entry format
    - Source QIDs are recorded
    - Code examples are truncated within limits
    - Template entry is removed or replaced

  **Must NOT do**:
  - Do NOT modify the skill files during this test — only verify they work as written
  - Do NOT click any edit/save/delete buttons on MOM

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test requiring browser automation, file I/O, and multi-step verification
  - **Skills**: [`playwriter`, `mom-fact-finder`, `mom-page-map`]
    - `playwriter`: Browser automation for executing the fact-finder workflow
    - `mom-fact-finder`: The skill being tested — loaded to provide instructions
    - `mom-page-map`: Fallback navigation reference
  - **Skills Evaluated but Omitted**:
    - `mom-frq`: Not needed for testing the fact-finder workflow
    - `mom-patterns`: Will be read/updated during test, but loading it as a skill could bias the test

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-fact-finder/CLAUDE.md` — The skill being tested (created in Task 2)
  - `.claude/skills/mom-patterns/CLAUDE.md` — The library file that should be updated (created in Task 3)
  - `.claude/skills/gb-pipeline/SKILL.md:36-46` — `task()` invocation syntax for reference

  **WHY Each Reference Matters**:
  - `mom-fact-finder`: This IS the skill being executed. The agent loads it and follows its instructions.
  - `mom-patterns`: The test must verify this file gets updated with a real pattern entry.
  - `gb-pipeline:36-46`: Shows the expected `task()` call syntax for loading and invoking skills.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full workflow executes successfully for a known topic
    Tool: Playwriter
    Preconditions: MOM is open in Chrome, Playwriter active, both skill files exist from Tasks 2-3
    Steps:
      1. Load mom-fact-finder skill instructions
      2. Follow the Library-First Lookup: read mom-patterns — confirm no existing match for test topic
      3. Follow Browser Search Workflow: navigate to manageqset.php, search for topic
      4. Verify search returns results (snapshot shows result rows)
      5. Follow Example Selection: identify top questions by Times Used
      6. Follow Code Extraction: navigate to viewonly pages, extract code
      7. Verify extracted code is non-empty and contains MOM syntax ($answer, loadlibrary, etc.)
      8. Follow Synthesis: agent produces pattern summary
      9. Follow Pattern Library Update: read mom-patterns, append new section
      10. Verify mom-patterns now has a new topic section matching the entry format
    Expected Result: Complete workflow runs. mom-patterns updated with real topic. Temp results file written.
    Failure Indicators: Search fails, extraction returns empty, library update corrupts existing content, session expires mid-workflow
    Evidence: .sisyphus/evidence/task-4-e2e-test.txt

  Scenario: Error handling when no results found
    Tool: Playwriter
    Preconditions: MOM is open, fact-finder skill loaded
    Steps:
      1. Search for a very obscure topic unlikely to have results (e.g., "xyzzy123nonsense")
      2. Verify the fact-finder handles 0 results gracefully
      3. Check for a clear error message (not a crash or hang)
    Expected Result: Agent reports no results found, suggests broadening search. No crash.
    Failure Indicators: Agent hangs, crashes, or silently produces empty output without messaging
    Evidence: .sisyphus/evidence/task-4-no-results.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-e2e-test.txt` — Full workflow log with extracted code samples
  - [ ] `.sisyphus/evidence/task-4-no-results.txt` — Error handling verification
  - [ ] Updated `.claude/skills/mom-patterns/CLAUDE.md` with real topic entry

  **Commit**: NO (evidence only, pattern library update is the deliverable)

- [ ] 5. Pattern Library Idempotency + Load Verification

  **What to do**:
  - Verify that `mom-patterns/CLAUDE.md` can be loaded via `load_skills` in a `task()` call
  - Verify idempotency: if the fact-finder is run again for the SAME topic as Task 4, the topic section is UPDATED (not duplicated)
  - Verify size is within bounds: `wc -l` on the pattern library
  - Verify all existing content was preserved during the update in Task 4 (header, size policy, format template, plus the new topic)

  **Must NOT do**:
  - Do NOT modify the pattern library manually — only verify the state left by Task 4

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple verification checks — file reads, line counts, grep patterns
  - **Skills**: []
    - No skills needed — just file inspection
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed for file verification

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4 in theory, but depends on Task 4 completing the library update)
  - **Parallel Group**: Wave 3 (runs after Task 4 completes)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-patterns/CLAUDE.md` — The file being verified
  - Task 3's scaffold structure — verify structural sections still present after Task 4's update

  **WHY Each Reference Matters**:
  - `mom-patterns`: Direct subject of verification. Must check it wasn't corrupted by Task 4's write.
  - Task 3 scaffold: Baseline structure to compare against — header, size policy, format template should all survive the update.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pattern library loads and contains expected content
    Tool: Bash
    Preconditions: Task 4 has completed and updated mom-patterns
    Steps:
      1. `cat .claude/skills/mom-patterns/CLAUDE.md` — read full content
      2. Verify header/title section still present
      3. Verify size policy section still present
      4. Verify at least one real topic section exists (not just template)
      5. `wc -l .claude/skills/mom-patterns/CLAUDE.md` — must be under 800
      6. Count topic sections: grep -c '^## ' — should be exactly 1 real topic (from Task 4)
    Expected Result: File intact, all structural sections present, one real topic entry, under 800 lines.
    Failure Indicators: Missing header, missing size policy, duplicated topics, over 800 lines
    Evidence: .sisyphus/evidence/task-5-library-verification.txt

  Scenario: Idempotency — same topic doesn't duplicate
    Tool: Bash (grep + count)
    Preconditions: Pattern library has one topic entry from Task 4
    Steps:
      1. Count occurrences of the topic heading: `grep -c '## [TopicName]' .claude/skills/mom-patterns/CLAUDE.md`
      2. Result must be exactly 1
      3. If Task 4's fact-finder was run twice, verify the section was updated, not appended
    Expected Result: Exactly one section per topic. No duplicates.
    Failure Indicators: Count > 1 for any topic heading
    Evidence: .sisyphus/evidence/task-5-idempotency-check.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-library-verification.txt` — Full content + structural check
  - [ ] `.sisyphus/evidence/task-5-idempotency-check.txt` — Duplicate topic check

  **Commit**: YES
  - Message: `test(skills): verify fact-finder integration and pattern library`
  - Files: `.sisyphus/evidence/task-4-*`, `.sisyphus/evidence/task-5-*`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read skill file, check content). For each "Must NOT Have": search skill files for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Skill Quality Review** — `unspecified-high`
  Read both skill files. Check for: vague instructions that leave room for interpretation, missing selector references, missing error handling, inconsistent formatting vs existing skills (`mom-frq`, `mom-page-map`, `gb-pipeline`). Verify the pattern library entry format is concrete and machine-followable. Check that all MOM URLs include `{cid}` placeholder. Verify READ-ONLY safety rules are present and prominent.
  Output: `Fact-finder [PASS/FAIL] | Patterns [PASS/FAIL] | Consistency [N issues] | VERDICT`

- [ ] F3. **Real Live QA with Playwriter** — `unspecified-high` (+ `playwriter` skill)
  Start from clean state. Load `mom-fact-finder` skill. Navigate to MOM. Search for a known topic (e.g., "statistics" or "hypothesis"). Verify search results appear. Open one question in viewonly mode. Verify code extraction works with the documented selectors. Capture evidence screenshots/snapshots.
  Output: `Search [PASS/FAIL] | Navigation [PASS/FAIL] | Extraction [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual deliverable. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect if any existing skill files were modified (they should NOT be). Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Existing files [CLEAN/MODIFIED] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(skills): add DOM recon evidence for MOM viewonly pages` — `.sisyphus/evidence/task-1-recon/*`
- **2-3**: `feat(skills): add mom-fact-finder and mom-patterns skills` — `.claude/skills/mom-fact-finder/CLAUDE.md`, `.claude/skills/mom-patterns/CLAUDE.md`
- **4-5**: `test(skills): verify fact-finder integration and pattern library` — `.sisyphus/evidence/task-4-*`, `.sisyphus/evidence/task-5-*`

---

## Success Criteria

### Final Checklist
- [ ] `.claude/skills/mom-fact-finder/CLAUDE.md` exists and loads via `load_skills`
- [ ] `.claude/skills/mom-patterns/CLAUDE.md` exists and loads via `load_skills`
- [ ] Fact-finder skill references validated selectors from recon (not assumptions)
- [ ] READ-ONLY safety rules present in fact-finder skill
- [ ] Pattern library entry format is concrete (not vague)
- [ ] End-to-end test evidence exists in `.sisyphus/evidence/`
- [ ] No existing skill files were modified (`mom-frq`, `mom-page-map`, `gb-*`)
