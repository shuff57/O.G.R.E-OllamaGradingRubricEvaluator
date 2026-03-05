# Grade Show-Work Skill — Review Uploaded Math Work for Partial Credit

## TL;DR

> **Quick Summary**: Create a new `grade-show-work` skill that reviews uploaded PDF/PNG images of handwritten math work on MyOpenMath student pages, evaluates whether meaningful work is shown, and awards up to 2 bonus points to students who scored below 4 on auto-graded questions.
> 
> **Deliverables**:
> - `.claude/skills/grade-show-work/CLAUDE.md` — the skill file
> - `.claude/commands/grade-show-work-selectors.md` — DOM selector reference for the MOM student page
> - `grade-show-work-state.json` schema defined in the skill — session state for resume
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (DOM discovery) → Task 2 (skill file) → Task 3 (integration test)

---

## Context

### Original Request
Create a new skill for grading uploaded PDFs/PNGs on MyOpenMath. The skill should map how to interact with, view, and process student-uploaded images of handwritten math work, then award very minimal partial credit (up to 2 points) to questions where the student scored less than 4 points on the auto-graded portion.

### Interview Summary
**Key Discussions**:
- **Location**: Individual student view pages on MOM (NOT the batch `gradeallq2.php` page used by `/grade`)
- **Navigation**: Sequential via "save and next student" button. Student ID also in URL for direct jumps.
- **Page layout**: Multiple questions per student page, each with its own score input and uploaded files
- **Image display**: "Hide work" / "Show work" toggle reveals clickable thumbnails; must click to view full-size
- **Subject**: Math — handwritten equations, calculations, graphs
- **Scoring**: MOM auto-graded the computed answer (matrix, number, etc.) and gave 0-3 pts. Review uploaded work to potentially bump.
- **Partial credit scale**: +2 (substantial work), +1 (some work), +0 (no meaningful work)
- **Output model**: Report first → user reviews → apply approved bumps
- **Student count**: 30-60 per assignment, needs batching/session management
- **Format decision**: Skill (`.claude/skills/grade-show-work/CLAUDE.md`) not a command
- **DOM discovery**: Agent must map the student page selectors with user help (page is completely undocumented in the codebase)

**Research Findings**:
- MOM FRQ questions support file uploads: `$answerformat[1] = "images,.pdf"` with `$scoremethod[1] = "takeanything"`
- Existing `/grade` command only handles text responses on `gradeallq2.php` — completely different page
- No existing image/vision/OCR skills in the project — this is the first
- The `/grade` command pattern: extract → evaluate → fill → save in batches, with companion `grade-selectors.md`
- Available tools: `look_at` for dedicated media analysis, Playwriter `screenshotWithAccessibilityLabels` for visual screenshots, `snapshot()` for DOM inspection
- Grading philosophy (in `grading-constants.js`): generous for high school seniors

### Metis Review
**Identified Gaps** (addressed in plan):
- **Session state/resume**: 30-60 students may span multiple sessions — need `grade-show-work-state.json` pattern (modeled after `/grade`'s `grade-state.json`)
- **Authentication**: Agent must be logged into MOM via user's Chrome session — Playwriter inherits session cookies
- **Multi-page PDFs**: Could exist — skill should handle by analyzing first page only (stated as limitation)
- **No-upload edge case**: Student scored < 4 but uploaded nothing — skip, note in report
- **Score safety**: Must never decrease a score, never exceed max score
- **Thumbnail expansion method**: Unknown until DOM discovery — skill must document what was found

---

## Work Objectives

### Core Objective
Create a skill that enables an AI agent to sequentially review MOM student pages, view uploaded handwritten math work images, evaluate whether meaningful progress toward a solution is shown, and recommend 0-2 bonus points for qualifying students (those scoring < 4 on auto-graded questions).

### Concrete Deliverables
- `.claude/skills/grade-show-work/CLAUDE.md` — complete skill file with workflow, selectors reference, evaluation criteria, session management
- `.claude/commands/grade-show-work-selectors.md` — DOM selector reference file (discovered live, like `grade-selectors.md`)
- Documented partial credit evaluation criteria within the skill
- Session state schema for resume across sessions

### Definition of Done
- [ ] Skill file exists at `.claude/skills/grade-show-work/CLAUDE.md` with complete workflow instructions
- [ ] Selectors file exists at `.claude/commands/grade-show-work-selectors.md` with verified DOM mappings
- [ ] Agent can invoke the skill, navigate student pages, view uploaded images, and produce a report
- [ ] Report-then-apply workflow functions correctly (scan → report → approval → apply)
- [ ] Session state saves/resumes correctly across sessions

### Must Have
- Sequential student page navigation via "save and next student" button
- Image viewing capability (click thumbnails, view full-size, analyze via vision)
- Score threshold check: only review questions where student scored < 4
- Partial credit scale: +0, +1, +2 based on work quality
- Report generation with per-student, per-question recommendations
- User approval step before applying any score changes
- Session state persistence (resume after context limit)
- Score safety: never decrease, never exceed max

### Must NOT Have (Guardrails)
- **No text/essay grading** — only evaluate uploaded image/PDF work for "work shown"
- **No full re-grading** — only additive bonus points, never override MOM's auto-grade
- **No score decreases** — bonus points only; if current score >= 4, skip entirely
- **No exceeding max score** — bumped score capped at question max
- **No math correctness evaluation** — evaluate whether work is SHOWN (setup, steps, effort), not whether it's CORRECT
- **No modification without approval** — always present report first, never auto-apply
- **No over-engineered image processing** — use agent's native vision, no external OCR libraries
- **No touching questions without file uploads** — skip questions that only have computed answers

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A — deliverable is markdown skill files, not code
- **Automated tests**: None (no code to test)
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios using Playwriter on a live MOM student page.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DOM discovery**: Playwriter — navigate, snapshot, map selectors, screenshot
- **Skill file**: Playwriter — invoke skill instructions step-by-step against real page
- **Integration**: Playwriter — full end-to-end workflow test

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — DOM discovery + skill skeleton):
├── Task 1: Live DOM discovery of MOM student page [deep]
├── Task 2: Skill file skeleton with evaluation criteria [quick]
└── Task 3: Research image viewing approaches on MOM [deep]

Wave 2 (After Wave 1 — skill completion):
├── Task 4: Complete skill file with selectors + workflow [deep]
└── Task 5: Create companion selectors reference file [quick]

Wave 3 (After Wave 2 — verification):
├── Task 6: End-to-end integration test on live page [deep]
└── Task 7: Edge case verification + final polish [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Skill quality review [unspecified-high]
└── Task F3: Live QA walkthrough [unspecified-high]
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 4 | 1 |
| 3 | — | 4 | 1 |
| 4 | 1, 2, 3 | 6, 7 | 2 |
| 5 | 1 | 6 | 2 |
| 6 | 4, 5 | F1-F3 | 3 |
| 7 | 4 | F1-F3 | 3 |
| F1-F3 | 6, 7 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `quick`, T3 → `deep`
- **Wave 2**: 2 tasks — T4 → `deep`, T5 → `quick`
- **Wave 3**: 2 tasks — T6 → `deep`, T7 → `unspecified-high`
- **FINAL**: 3 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`

---

## TODOs


- [x] 1. Live DOM Discovery of MOM Student Page

  **What to do**:
  - Ask the user to open a MOM student grading page in Chrome with Playwriter enabled
  - Navigate to the page via Playwriter and take an accessibility snapshot
  - Map every interactive element on the page:
    - "Hide work" / "Show work" toggle button (selector, behavior)
    - Score input fields per question (selector, how to read current value, how to write new value)
    - Max score display per question (where the `/N` text appears)
    - Uploaded file thumbnails (selector, what element they are, what happens on click)
    - Full-size image display after clicking thumbnail (lightbox? new tab? inline expansion?)
    - "Save and next student" button (selector, behavior)
    - Student name display (where on the page)
    - Question section boundaries (how to identify which question a score/upload belongs to)
    - URL pattern with student ID parameter
  - For the thumbnail click behavior: test clicking a thumbnail and observe what happens
    - If lightbox/modal: document the lightbox selectors and how to extract the full image
    - If new tab: document the new tab URL pattern
    - If inline expansion: document the expanded image selector
  - Test the image viewing approach: can the agent see the image via screenshot? Or need to extract URL + download?
  - Test "save and next student" button: click it, observe navigation, note URL change pattern
  - Record ALL findings in a structured format ready for the selectors file

  **Must NOT do**:
  - Do not modify any student scores during discovery
  - Do not click "Save" without user permission
  - Do not navigate away from the student grading pages

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires interactive browser exploration, hypothesis testing, and thorough documentation of findings
  - **Skills**: [`playwriter`]
    - `playwriter`: Essential for browser automation — navigating, snapshotting, clicking, and testing page interactions
  - **Skills Evaluated but Omitted**:
    - `playwright`: Playwriter supersedes it for this use case (direct Chrome control, not headless)

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1, with Tasks 2 and 3)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately — user must have MOM page open)

  **References**:

  **Pattern References**:
  - `.claude/commands/grade-selectors.md` — The exact format and level of detail expected for the selectors file. Study its table structure, selector notation, and extraction code examples. The output of this task should match this level of specificity.
  - `.claude/commands/grade.md:70-88` — Step 2 extraction pattern shows how the /grade command maps DOM. Follow this approach: single evaluate() call to extract structure.

  **External References**:
  - MyOpenMath student grading page (live, user-provided URL) — the actual page being mapped

  **WHY Each Reference Matters**:
  - `grade-selectors.md` provides the gold standard for selector documentation — this task's output must match its format so Task 5 can directly use the findings
  - The `/grade` Step 2 pattern shows how to do efficient single-pass DOM extraction via evaluate()

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Map all interactive elements on student page
    Tool: Playwriter
    Preconditions: User has opened a MOM student grading page in Chrome, Playwriter enabled
    Steps:
      1. Navigate to the user-provided URL via state.page.goto()
      2. Take accessibility snapshot: snapshot({ page: state.page })
      3. Search for work toggle: snapshot({ page: state.page, search: /hide.*work|show.*work/i })
      4. Click the toggle and re-snapshot to see revealed content
      5. Identify thumbnail elements, click one thumbnail
      6. Observe and document what happens (lightbox/new tab/inline)
      7. If lightbox: snapshot the modal, find image element, extract src URL
      8. If new tab: get new page URL, verify image is accessible
      9. Find score inputs: snapshot({ page: state.page, search: /score|input/i })
      10. Find save/next button: snapshot({ page: state.page, search: /save|next/i })
    Expected Result: Complete mapping of all selectors documented in a structured format
    Failure Indicators: Cannot find show-work toggle, thumbnails don't respond to clicks, no score inputs found
    Evidence: .sisyphus/evidence/task-1-dom-discovery.md (structured selector findings)

  Scenario: Test image viewing pipeline
    Tool: Playwriter
    Preconditions: Show-work toggle already clicked, thumbnails visible
    Steps:
      1. Click a thumbnail to view full-size image
      2. Take screenshot: screenshotWithAccessibilityLabels({ page: state.page })
      3. Verify handwritten math is visible and legible in the screenshot
      4. Alternatively: extract image URL from DOM, download via page.evaluate(fetch), save to disk
      5. If saved to disk: use look_at tool to verify image is analyzable
    Expected Result: Agent can see handwritten math work clearly via at least one method
    Failure Indicators: Image not visible in screenshot, URL extraction fails, look_at can't process the file
    Evidence: .sisyphus/evidence/task-1-image-viewing.png (screenshot showing visible math work)
  ```

  **Evidence to Capture:**
  - [ ] task-1-dom-discovery.md — complete selector mapping with exact CSS selectors and behavior notes
  - [ ] task-1-image-viewing.png — screenshot proving the image viewing pipeline works
  - [ ] task-1-navigation.png — screenshot showing save-and-next-student worked

  **Commit**: NO (discovery output feeds into Tasks 4 and 5)

- [x] 2. Skill File Skeleton with Evaluation Criteria

  **What to do**:
  - Create `.claude/skills/grade-show-work/CLAUDE.md` with frontmatter and section structure
  - Write the complete partial credit evaluation criteria section:
    - **+2 points (Substantial Work)**: Student showed meaningful progress — correct problem setup, relevant formulas written, multiple solution steps attempted, systematic approach visible even if final answer wrong
    - **+1 point (Some Work)**: Student made a genuine attempt — wrote down given information, started the problem, drew a relevant diagram or wrote a formula, but minimal progress beyond that
    - **+0 points (No Meaningful Work)**: Blank upload, illegible, completely unrelated content, or only the problem statement rewritten with no attempt
  - Write the guardrails section (all "Must NOT Have" items from plan)
  - Write the eligibility criteria: only questions where MOM auto-score < 4
  - Write the report format specification:
    - Per-student summary: name, questions reviewed, recommendations
    - Per-question detail: current score, max score, work description, recommended bump, rationale
    - Approval prompt format for user review
  - Leave placeholder sections for: Workflow Steps, Selectors Reference, Session Management (filled in Task 4)

  **Must NOT do**:
  - Do not write specific DOM selectors (those come from Task 1)
  - Do not write the workflow steps yet (depends on DOM discovery)
  - Do not include any text grading or essay evaluation language

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Writing a markdown skeleton with evaluation criteria — straightforward content creation
  - **Skills**: []
    - No skills needed — pure markdown authoring based on plan requirements
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — this is markdown writing, no browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1, with Tasks 1 and 3)
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.claude/skills/gb-compare/SKILL.md` — Skill file structure pattern: frontmatter with name/description, safety rules, selector quick reference tables, phased workflow steps. Follow this organization.
  - `.claude/commands/grade.md:21-28` — Grading philosophy section. Adapt the generous-for-HS-seniors tone for partial credit criteria.
  - `.claude/commands/grade.md:112-129` — Grading approach section. Shows how scoring criteria are documented with concrete examples.

  **API/Type References**:
  - `.claude/commands/grade.md:155-164` — State file schema pattern (`grade-state.json`). The `grade-show-work-state.json` should follow this same key-value structure.

  **WHY Each Reference Matters**:
  - `gb-compare/SKILL.md` is the best example of a skill file (not a command) — its structure is what we're creating
  - The `/grade` grading philosophy + approach sections show how to write evaluation criteria that agents can follow consistently
  - The state file pattern ensures resume works the same way across skills

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill file has correct structure
    Tool: Bash (grep)
    Preconditions: Skill file created
    Steps:
      1. Verify frontmatter: grep 'name: grade-show-work' .claude/skills/grade-show-work/CLAUDE.md
      2. Verify evaluation criteria section exists: grep '+2 points' .claude/skills/grade-show-work/CLAUDE.md
      3. Verify guardrails section exists: grep 'Must NOT' .claude/skills/grade-show-work/CLAUDE.md
      4. Verify eligibility criteria: grep 'less than 4' .claude/skills/grade-show-work/CLAUDE.md
      5. Verify report format section exists: grep 'Report Format' .claude/skills/grade-show-work/CLAUDE.md
      6. Verify placeholder sections: grep 'TODO.*selectors\|TODO.*workflow' .claude/skills/grade-show-work/CLAUDE.md
    Expected Result: All 6 greps return matches; file has all required sections
    Failure Indicators: Any grep returns no match; missing sections
    Evidence: .sisyphus/evidence/task-2-structure-check.txt (grep output)

  Scenario: No forbidden patterns in skill file
    Tool: Bash (grep)
    Preconditions: Skill file created
    Steps:
      1. grep -i 'essay\|text.grad\|auto-apply\|decrease.*score' .claude/skills/grade-show-work/CLAUDE.md
    Expected Result: No matches (or only in guardrail warning sections)
    Failure Indicators: Forbidden pattern appears outside guardrails section
    Evidence: .sisyphus/evidence/task-2-forbidden-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-structure-check.txt — grep output proving all sections present
  - [ ] task-2-forbidden-check.txt — grep output confirming no forbidden patterns

  **Commit**: NO (file is a skeleton — committed after Task 4 completes it)


- [x] 3. Research Image Viewing Approaches on MOM

  **What to do**:
  - Using Playwriter on the same MOM student page (or a separate tab), investigate how uploaded files can be viewed and analyzed by the agent
  - Test THREE approaches and document which works best:
    1. **Screenshot approach**: Click thumbnail to expand image, take `screenshotWithAccessibilityLabels()` of the full-size view. Can the agent read handwritten math from the screenshot?
    2. **URL extraction approach**: Inspect the thumbnail element's DOM. Extract the image URL (from `src`, `href`, or `data-*` attribute). Download via `page.evaluate(fetch)` and save to temp file. Use `look_at` tool to analyze.
    3. **Direct navigation approach**: If thumbnail links to a direct image URL, navigate to it in a new tab and screenshot.
  - For each approach, evaluate:
    - Does the agent see enough detail to distinguish "substantial work" from "some work" from "nothing"?
    - Does it work for both PNG and PDF uploads?
    - How many Playwriter calls does it require per image?
    - Any authentication issues (does the image URL require MOM login cookies)?
  - Recommend the primary approach and document a fallback
  - Document any MOM-specific image URL patterns (CDN, direct file path, etc.)

  **Must NOT do**:
  - Do not modify any student data
  - Do not download student files to permanent storage

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires testing multiple approaches, evaluating trade-offs, and making a technical recommendation
  - **Skills**: [`playwriter`]
    - `playwriter`: Essential for browser automation and testing image viewing approaches
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Playwriter is preferred for MOM pages (user is already logged in)

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1, with Tasks 1 and 2)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.claude/commands/grade.md:70-73` - Shows how the /grade command uses page.evaluate() for batch DOM extraction. Same pattern can extract image URLs.

  **External References**:
  - Playwriter skill documentation (in system prompt) - `screenshotWithAccessibilityLabels`, `snapshot`, `page.evaluate(fetch)` patterns
  - `look_at` tool documentation - Takes file_path and goal string for media analysis

  **WHY Each Reference Matters**:
  - The grade.md extraction pattern shows how to efficiently extract data from MOM pages in a single evaluate call
  - Playwriter docs show screenshot and image handling best practices
  - look_at is the dedicated tool for analyzing images/PDFs if screenshot approach is insufficient

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test screenshot approach for handwritten math
    Tool: Playwriter
    Preconditions: MOM student page open, show-work toggled on, thumbnail visible
    Steps:
      1. Click a thumbnail to expand the image
      2. Take screenshot: await screenshotWithAccessibilityLabels({ page: state.page })
      3. Evaluate: can the agent identify handwritten equations, steps, or diagrams?
      4. Rate image quality: sufficient for +2/+1/+0 distinction?
    Expected Result: Agent can clearly see and describe the handwritten math work
    Failure Indicators: Image too small, blurry, or obscured by UI elements
    Evidence: .sisyphus/evidence/task-3-screenshot-test.png

  Scenario: Test URL extraction approach
    Tool: Playwriter
    Preconditions: Same page, thumbnail visible
    Steps:
      1. Extract image URL from thumbnail DOM: page.evaluate(() => document.querySelector('[thumbnail-selector]').href || .src)
      2. Download via page.evaluate(async (url) => { const r = await fetch(url); return await r.arrayBuffer(); }, url)
      3. Save to temp file via require('fs').writeFileSync
      4. Use look_at tool with goal 'Analyze handwritten math work. Is meaningful progress shown?'
    Expected Result: look_at returns description of the math work visible in the image
    Failure Indicators: URL extraction fails, fetch returns 403, look_at cannot process file
    Evidence: .sisyphus/evidence/task-3-url-extract-test.txt (approach comparison)
  ```

  **Evidence to Capture:**
  - [ ] task-3-screenshot-test.png - Screenshot showing handwritten math
  - [ ] task-3-url-extract-test.txt - Comparison of approaches with recommendation

  **Commit**: NO (research output feeds into Task 4)

- [x] 4. Complete Skill File with Full Workflow, Selectors, and Session Management

  **What to do**:
  - Read the DOM discovery findings from Task 1 evidence (`.sisyphus/evidence/task-1-dom-discovery.md`)
  - Read the image viewing recommendation from Task 3 evidence (`.sisyphus/evidence/task-3-url-extract-test.txt`)
  - Read the skeleton skill file from Task 2 (`.claude/skills/grade-show-work/CLAUDE.md`)
  - Complete ALL placeholder sections in the skill file with concrete, agent-executable instructions:

  **Section: Prerequisites**
  - Playwriter MCP enabled and connected
  - Chrome open to a MOM student grading page with Playwriter active
  - User logged into MOM (session cookies available)

  **Section: Workflow Steps** (the core of the skill)
  - Step 0: Get Starting Point
    - Ask user which student page URL to start from
    - Check `grade-show-work-state.json` for resume point (same pattern as `/grade`'s `grade-state.json`)
    - Navigate to the starting student page via Playwriter
  - Step 1: Scan Current Student Page
    - Read student name from the page
    - For each question section on the page:
      - Read current auto-graded score
      - Read max score for the question
      - If score >= 4: skip this question (not eligible)
      - If score < 4: check for uploaded file
        - Click "show work" toggle if not already shown
        - If no uploaded file: note in report as "no upload", skip
        - If uploaded file exists: proceed to image analysis
  - Step 2: Analyze Uploaded Work
    - Use the recommended image viewing approach (from Task 3) to view the full-size image
    - Evaluate the handwritten math work using the partial credit criteria:
      - Look for: problem setup, relevant formulas, solution steps, diagrams, calculations
      - +2: Multiple steps shown, correct setup, systematic approach visible
      - +1: Some relevant work (formula written, diagram drawn, problem restated with attempt)
      - +0: Blank, illegible, unrelated, or only problem statement copied
    - Record: student name, question number, current score, max score, recommended bump, brief rationale
  - Step 3: Navigate to Next Student
    - After scanning all questions for current student, click "save and next student"
    - Wait for page load
    - Update session state file
    - Repeat Steps 1-3 until all students reviewed or context limit reached
  - Step 4: Generate Report
    - After completing scan (or hitting context limit), present report:
      ```
      ## Show-Work Partial Credit Report
      Assignment: [name/URL]
      Students Reviewed: N
      Recommendations: N students, M questions

      | Student | Q# | Current | Max | Work Description | Bump | New Score |
      |---------|-----|---------|-----|-----------------|------|-----------|
      | Smith, J | 3 | 1 | 5 | Set up matrix, started RREF | +2 | 3 |
      | Jones, A | 3 | 0 | 5 | Wrote formula only | +1 | 1 |
      | Brown, K | 3 | 2 | 5 | No upload | +0 | 2 |

      Approve all? Or specify changes (e.g., 'Smith +1 instead', 'skip Jones')
      ```
  - Step 5: Apply Approved Bumps
    - After user approval, navigate back to each student (using student ID in URL for direct jumps)
    - For each approved bump: update the score input, save
    - Report final tally

  **Section: Session State Management**
  - State file: `grade-show-work-state.json` in project root
  - Schema: `{ "<URL-pattern>": { "lastStudent": "Name", "count": N, "phase": "scan|apply", "report": [...], "timestamp": "ISO" } }`
  - Save after every student during scan phase
  - Save after every batch during apply phase
  - Resume detection on skill invocation (same pattern as /grade)

  **Section: Context Limits**
  - Hard limit: 20 students per session (images consume much more context than text)
  - Soft warning at 15
  - Session state enables resume

  **Section: Edge Cases**
  - Student uploaded nothing: note in report, +0 recommendation
  - Multi-page PDF: analyze first page only, note limitation in report
  - Unreadable/corrupt image: note in report, +0 recommendation
  - Student uploaded unrelated content: +0, note in report
  - Score already at max: skip (bumped score would exceed max)
  - Score + bump would exceed max: cap at max score

  **Must NOT do**:
  - Do not include any essay/text grading instructions
  - Do not include auto-apply logic (report first always)
  - Do not include score decrease logic
  - Do not include math correctness evaluation (only "work shown")

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex skill file with multiple interconnected sections, requires synthesizing findings from 3 prior tasks
  - **Skills**: [`playwriter`]
    - `playwriter`: Needed to test the skill instructions against a real page while writing them
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Not applicable — this is markdown authoring, not code

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1, 2, 3)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `.claude/commands/grade.md` (entire file) — THE primary pattern reference. The skill structure, workflow steps, philosophy, state management, context limits, and error handling should all mirror this command's approach. Study it thoroughly.
  - `.claude/skills/gb-compare/SKILL.md` — Skill file format (vs command format). The frontmatter, safety rules section, selector tables, and phased workflow steps should follow this structure.
  - `.claude/commands/grade-selectors.md:47-104` — Extraction code example pattern. The skill should include similar code examples using the discovered selectors.

  **API/Type References**:
  - `.sisyphus/evidence/task-1-dom-discovery.md` — Discovered DOM selectors (from Task 1)
  - `.sisyphus/evidence/task-3-url-extract-test.txt` — Recommended image viewing approach (from Task 3)

  **WHY Each Reference Matters**:
  - `grade.md` is the gold standard for this project's grading workflow documentation
  - `gb-compare/SKILL.md` shows how to structure a skill (not a command)
  - Task 1 and 3 evidence files contain the actual discovered selectors and image approach

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill file is complete (no placeholder sections)
    Tool: Bash (grep)
    Preconditions: Skill file updated
    Steps:
      1. grep -c 'TODO\|PLACEHOLDER\|TBD' .claude/skills/grade-show-work/CLAUDE.md
    Expected Result: 0 matches (no remaining placeholders)
    Failure Indicators: Any placeholder text remains
    Evidence: .sisyphus/evidence/task-4-completeness.txt

  Scenario: Workflow steps are executable
    Tool: Playwriter
    Preconditions: MOM student page open
    Steps:
      1. Read Step 0 from skill file, execute it (navigate to page)
      2. Read Step 1, execute it (scan questions, check scores)
      3. Read Step 2, execute it (view an uploaded image, evaluate work)
      4. Verify the agent can follow the instructions without ambiguity
    Expected Result: Agent successfully executes Steps 0-2 on a real student page
    Failure Indicators: Instructions are ambiguous, selectors don't match, workflow breaks
    Evidence: .sisyphus/evidence/task-4-workflow-test.png (screenshot of successful execution)
  ```

  **Evidence to Capture:**
  - [ ] task-4-completeness.txt — grep showing no placeholders remain
  - [ ] task-4-workflow-test.png — screenshot of successful partial workflow execution

  **Commit**: NO (committed together with Task 5)

- [x] 5. Create Companion Selectors Reference File

  **What to do**:
  - Create `.claude/commands/grade-show-work-selectors.md` as a standalone DOM reference
  - Use the findings from Task 1 (`.sisyphus/evidence/task-1-dom-discovery.md`)
  - Follow the EXACT format of `.claude/commands/grade-selectors.md`:
    - Page Structure diagram (ASCII tree showing element hierarchy)
    - Selector Quick Reference table (Element | Selector | Notes)
    - Extraction Code Example (JavaScript for page.evaluate())
    - Image Viewing Pattern (step-by-step code for the recommended approach from Task 3)
    - Score Modification Pattern (code for updating score inputs and saving)
  - Cross-reference selectors with the skill file (Task 4) to ensure consistency

  **Must NOT do**:
  - Do not invent selectors — only use those discovered and verified in Task 1
  - Do not include grading logic — this is a pure selector reference

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward markdown creation — reformatting Task 1 findings into the grade-selectors.md format
  - **Skills**: []
    - No skills needed — pure markdown authoring from existing findings

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2, with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.claude/commands/grade-selectors.md` (entire file) — THE template. Copy its exact section structure: Page Structure diagram, Selector Quick Reference table, Extraction Code Example, Visual Interaction Pattern. Replace content with discovered student page selectors.

  **API/Type References**:
  - `.sisyphus/evidence/task-1-dom-discovery.md` — Source data: all discovered selectors from live DOM mapping

  **WHY Each Reference Matters**:
  - `grade-selectors.md` is the exact template — maintain format consistency across the project
  - Task 1 evidence is the raw data being formatted

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Selectors file matches grade-selectors.md format
    Tool: Bash (grep)
    Preconditions: Selectors file created
    Steps:
      1. Verify has Page Structure section: grep '## Page Structure' .claude/commands/grade-show-work-selectors.md
      2. Verify has Selector table: grep '| Element' .claude/commands/grade-show-work-selectors.md
      3. Verify has code example: grep 'javascript' .claude/commands/grade-show-work-selectors.md
      4. Verify has image viewing pattern: grep -i 'image\|thumbnail' .claude/commands/grade-show-work-selectors.md
    Expected Result: All 4 sections present
    Failure Indicators: Missing sections
    Evidence: .sisyphus/evidence/task-5-format-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-format-check.txt — grep output verifying all sections present

  **Commit**: YES (group with Task 4)
  - Message: `feat(skills): add grade-show-work skill and selectors`
  - Files: `.claude/skills/grade-show-work/CLAUDE.md`, `.claude/commands/grade-show-work-selectors.md`
  - Pre-commit: `grep -c 'TODO' .claude/skills/grade-show-work/CLAUDE.md` (expect 0)

- [x] 6. End-to-End Integration Test on Live Page

  **What to do**:
  - Load the `grade-show-work` skill and execute its COMPLETE workflow on a real MOM student page
  - This is a full dress rehearsal — not a partial test. Execute every step from the skill file:
    - Step 0: Get starting URL from user, check state file, navigate
    - Step 1: Scan current student page — identify all questions, check scores, find eligible ones (< 4)
    - Step 2: For each eligible question — toggle show-work, view thumbnails, expand image, analyze handwritten math, record recommendation
    - Step 3: Navigate to next student (at least 2-3 students)
    - Step 4: Generate the report in the exact format specified in the skill
    - Step 5: (Simulated) Present report, get "approval" from user, apply at least one bump to verify the score update flow
  - Verify every selector in the selectors file matches the actual page
  - Verify session state file is created/updated correctly
  - Document any issues found and fix them in the skill/selectors files

  **Must NOT do**:
  - Do not apply score changes to more than 1 test student without explicit user approval
  - Do not modify the workflow steps — follow them as-written to test accuracy

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full end-to-end test requiring sustained browser interaction, image analysis, reporting, and score modification
  - **Skills**: [`playwriter`]
    - `playwriter`: Essential for all browser interactions in this test
  - **Skills Evaluated but Omitted**:
    - `playwright`: Playwriter preferred — direct Chrome control with user session

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3, with Task 7)
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: F1-F3
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `.claude/skills/grade-show-work/CLAUDE.md` (entire file) — THE skill being tested. Follow it step-by-step.
  - `.claude/commands/grade-show-work-selectors.md` (entire file) — Selectors to verify against live page.

  **WHY Each Reference Matters**:
  - This task exists to validate both files against reality. Every selector and every instruction is tested.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full scan of 3 students produces valid report
    Tool: Playwriter
    Preconditions: MOM student page open, user logged in, Playwriter enabled
    Steps:
      1. Follow Step 0: navigate to starting student page
      2. Follow Step 1: scan all questions, identify eligible ones (score < 4)
      3. Follow Step 2: view uploaded work for eligible questions, analyze, record
      4. Follow Step 3: click save-and-next-student, verify navigation works
      5. Repeat Steps 1-3 for 2 more students (3 total)
      6. Follow Step 4: generate report in the specified format
      7. Verify report contains: student names, question numbers, current scores, max scores, work descriptions, recommended bumps
    Expected Result: Complete report with 3 students, each with per-question recommendations
    Failure Indicators: Navigation fails, images not viewable, report format wrong, scores misread
    Evidence: .sisyphus/evidence/task-6-full-report.md (the generated report)

  Scenario: Apply one approved bump
    Tool: Playwriter
    Preconditions: Report generated, user approves one specific bump
    Steps:
      1. Navigate to the approved student (using student ID in URL)
      2. Find the correct question's score input
      3. Read current score, verify it matches report
      4. Update score to current + approved bump
      5. Click save
      6. Verify score persisted (refresh or re-read)
    Expected Result: Score updated from N to N+bump, verified after save
    Failure Indicators: Wrong student, wrong question, score didn't save, exceeded max
    Evidence: .sisyphus/evidence/task-6-score-apply.png (screenshot showing updated score)

  Scenario: Session state persists
    Tool: Bash
    Preconditions: Integration test completed through 3 students
    Steps:
      1. cat grade-show-work-state.json
      2. Verify JSON contains the URL key with lastStudent, count, phase, timestamp
      3. Verify lastStudent matches the 3rd student's name
      4. Verify count is 3
    Expected Result: Valid JSON with correct state reflecting the test session
    Failure Indicators: File missing, wrong student name, wrong count
    Evidence: .sisyphus/evidence/task-6-state-file.txt (contents of state file)
  ```

  **Evidence to Capture:**
  - [ ] task-6-full-report.md — the generated report from scanning 3 students
  - [ ] task-6-score-apply.png — screenshot showing an approved score bump was applied
  - [ ] task-6-state-file.txt — contents of grade-show-work-state.json

  **Commit**: NO (fixes from this test feed into Task 7)

- [x] 7. Edge Case Verification and Final Polish (covered by Task 6 integration)

  **What to do**:
  - Based on findings from Task 6 integration test, fix any issues discovered in:
    - `.claude/skills/grade-show-work/CLAUDE.md`
    - `.claude/commands/grade-show-work-selectors.md`
  - Verify edge cases on the live page:
    - Student with NO uploaded file on an eligible question — verify skill handles gracefully (skip, note in report)
    - Student whose score is exactly 4 — verify NOT flagged (threshold is strictly < 4)
    - Student whose score + bump would exceed max — verify cap logic described correctly
    - Question with multiple uploaded images — verify skill handles (analyze all? first only?)
    - Student page with mix of eligible and non-eligible questions — verify only eligible ones reviewed
  - Polish the skill file:
    - Ensure error handling section covers: Playwriter disconnection, page timeout, unreadable image
    - Ensure the report format is clear and actionable
    - Verify all selector references in the skill match the selectors file exactly
  - Final proofread for clarity, completeness, and adherence to guardrails

  **Must NOT do**:
  - Do not add features not in the plan (scope creep)
  - Do not add text grading, essay evaluation, or math correctness checking

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires judgment to identify and fix issues, plus edge case testing on live page
  - **Skills**: [`playwriter`]
    - `playwriter`: Needed for edge case verification on live MOM page

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3, with Task 6)
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: F1-F3
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `.claude/commands/grade.md:186-197` — Error handling table format. Follow this pattern for the error handling section of the skill.
  - `.claude/commands/grade.md:172-184` — Context limits section. Adapt for the 20-student limit with image-heavy context.

  **WHY Each Reference Matters**:
  - The error handling and context limits patterns from /grade ensure consistency across grading tools

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edge case - student with no upload
    Tool: Playwriter
    Preconditions: Find a student with score < 4 and no uploaded file
    Steps:
      1. Navigate to the student page
      2. Follow Step 1 of skill: scan questions
      3. Verify the eligible question with no upload is noted as 'no upload' and gets +0 recommendation
    Expected Result: Skill handles gracefully - no crash, clear 'no upload' note
    Failure Indicators: Skill crashes looking for thumbnails, unclear behavior
    Evidence: .sisyphus/evidence/task-7-no-upload.txt

  Scenario: Edge case - score exactly 4 is excluded
    Tool: Playwriter
    Preconditions: Find a student with score = 4 on a question
    Steps:
      1. Navigate to that student page
      2. Follow Step 1 of skill
      3. Verify the question with score = 4 is SKIPPED (not eligible)
    Expected Result: Question with score 4 is not flagged for review
    Failure Indicators: Question with score 4 incorrectly included
    Evidence: .sisyphus/evidence/task-7-threshold.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-no-upload.txt — output showing no-upload case handled
  - [ ] task-7-threshold.txt — output showing score=4 correctly excluded

  **Commit**: YES
  - Message: `fix(skills): polish grade-show-work edge cases and refinements`
  - Files: `.claude/skills/grade-show-work/CLAUDE.md`, `.claude/commands/grade-show-work-selectors.md`
  - Pre-commit: `grep -c 'TODO' .claude/skills/grade-show-work/CLAUDE.md` (expect 0)

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. Plan Compliance Audit (deliverables verified)
  Read the plan end-to-end. For each "Must Have": verify the skill file addresses it. For each "Must NOT Have": search skill content for forbidden patterns (text grading references, auto-apply language, score decrease logic). Check that selectors file exists and cross-references the skill. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. Skill Quality Review (skill complete, no placeholders)
  Read the skill file end-to-end. Check for: completeness (all workflow steps documented), clarity (an agent unfamiliar with the project could follow it), selector accuracy (cross-reference with selectors file), guardrail presence (all "Must NOT" items mentioned). Compare structure against existing `/grade` command and `gb-compare` skill for consistency.
  Output: `Completeness [N/N] | Clarity [PASS/FAIL] | Selectors [N verified] | Guardrails [N/N] | VERDICT`

- [x] F3. Live QA Walkthrough (3 students scanned, report generated)
  Start from a real MOM student page. Execute the skill workflow step-by-step using Playwriter: find show-work button, click it, view thumbnails, click a thumbnail, verify image is viewable, check score inputs, test "save and next student" navigation. Verify the report format described in the skill is clear and actionable. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Steps [N/N executed] | Navigation [PASS/FAIL] | Image Viewing [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **After Task 5**: `feat(skills): add grade-show-work skill and selectors` — `.claude/skills/grade-show-work/CLAUDE.md`, `.claude/commands/grade-show-work-selectors.md`
- **After Task 7**: `fix(skills): polish grade-show-work edge cases and refinements` — same files

---

## Success Criteria

### Verification Commands
```bash
# Skill file exists and has content
cat .claude/skills/grade-show-work/CLAUDE.md | head -5  # Expected: skill frontmatter

# Selectors file exists
cat .claude/commands/grade-show-work-selectors.md | head -5  # Expected: selector reference header

# No forbidden patterns in skill
grep -i "decrease\|override\|auto-apply\|essay\|text grad" .claude/skills/grade-show-work/CLAUDE.md  # Expected: no matches (or only in guardrail warnings)
```

### Final Checklist
- [ ] All "Must Have" features present in skill file
- [ ] All "Must NOT Have" guardrails documented in skill file
- [ ] Selectors file verified against live MOM page
- [ ] Report-then-apply workflow clearly documented
- [ ] Session state/resume pattern defined
- [ ] Partial credit criteria explicitly documented (+0, +1, +2)
- [ ] Edge cases handled (no upload, multi-page PDF, unreadable image)
