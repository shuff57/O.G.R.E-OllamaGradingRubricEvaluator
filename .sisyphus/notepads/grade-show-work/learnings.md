# Grade Show Work - Learnings

## Task 3 Complete: Skill Skeleton Created

### What Was Done
Created `.claude/skills/grade-show-work/CLAUDE.md` with:

1. **Frontmatter** - name: grade-show-work, description for skill catalog
2. **Partial Credit Criteria** (+2, +1, +0) with clear definitions
3. **Guardrails Section** - All 8 "Must NOT Have" items from plan
4. **Eligibility Criteria** - Only questions where MOM auto-score < 4
5. **Report Format** - Per-student summary, per-question detail, approval prompt
6. **Placeholder Sections** - Workflow Steps, Selectors Reference, Session Management

### Key Design Decisions

1. **Bonus-only system** - Explicitly stated: additive only, never decreases scores
2. **Work shown, not correctness** - Clear distinction that we're evaluating effort, not math accuracy
3. **Report-first approval** - User must approve before any score modifications
4. **Eligibility gates** - Only questions with uploads AND low auto-scores qualify

### Reference Patterns Used
- `gb-compare/SKILL.md` structure for skill organization
- `grade.md` grading philosophy for tone and principles
- Standard skill format with When to Use, Prerequisites, Guardrails, etc.

### Next Steps (Future Tasks)
- Task 1: DOM discovery to fill Selectors Reference
- Task 4: Fill in Workflow Steps with actual Playwriter code
- Task will need session management section filled in

### Files Created
- `.claude/skills/grade-show-work/CLAUDE.md` (217 lines)

## 2026-03-03: Task 1 DOM Discovery

### Page: `gbviewassess.php` (Individual Student Grading)

**Key architectural differences from `gradeallq2.php`:**
- This is a Vue.js SPA — no `<form>` elements, saving is AJAX-based
- One student per page, navigate between students via "Save and Next Student"
- Questions use `div.bigquestionwrap` containers (not `div[data-lastchange]`)
- Score inputs have per-part granularity: `scorebox{qIdx}` or `scorebox{qIdx}-{partIdx}`

**File upload/preview system:**
- File preview buttons are `<span role="button">` NOT `<button>` — selector must use `span.videoembedbtn` or `[id^="fileembedbtn"]`
- Preview is **inline** — an `<img>` is injected into the `<li>`, no lightbox or new tab
- Image ID pattern: `fileiframefileembedbtn{N}`
- File links use class `a.attach.prepped` with `target="_blank"`

**Work toggle naming:**
- Button text is "Hide Work" / **"View Work"** (NOT "Show Work" as initially assumed in the plan)
- Toggle hides/shows `.introtext` div via `display: none`

**Navigation pattern:**
- "Save and Next Student" does a full page navigation (not SPA route change)
- URL changes `uid` param to next student; `stu` param is dropped after first navigation
- Data loads via `gbloadassess.php` XHR after page load

**Feedback system:**
- Per-question: `div#fb{N}.fbbox.skipmathrender.mce-content-body` (TinyMCE inline)
- General: `div#fbgen.fbbox` at bottom
- All feedback divs exist in DOM even when empty (display: block)

**Gotcha: No IDs on action buttons:**
- "Save Changes", "Save and Next Student", "Return to Gradebook" have NO id attributes
- Must use text-based selectors: `button.primary:has-text("Save and Next Student")`
- "Add feedback" and "Full credit" buttons also have no IDs

## 2026-03-03: Task 3 — Image Viewing Research

### Winner: URL Extraction + Direct Fetch + Read Tool

**Screenshot approach FAILS on MOM grading pages:**
- MathJax/KaTeX font loading blocks ALL Playwright screenshot methods
- screenshotWithAccessibilityLabels(), locator.screenshot(), page.screenshot() all timeout
- CDP Page.captureScreenshot works but captures page viewport, not student work
- Requires 5+ Playwriter calls per image (click View Work, click [+], wait, bbox, screenshot)

**URL extraction approach WINS decisively:**
- `a.attach.prepped` selectors contain file URLs in `href` attribute
- URLs accessible even when "View Work" is collapsed (display:none) — zero UI clicks needed
- `files.myopenmath.com/ufiles/{uid}/{filename}` — **PUBLIC, NO AUTH** required
- Direct `fetch()` returns 200 OK without cookies/session
- Save to temp → Read tool → Claude vision sees full 750×1000px image clearly
- Handwritten math is perfectly legible for +2/+1/+0 grading

### Pipeline for the skill:
```
1. page.evaluate() → extract a.attach.prepped hrefs  [1 call]
2. fetch(url) → save to temp                          [1 call per file]
3. Read tool → Claude vision analysis                  [1 call per file]
```

### Gotchas discovered:
- `look_at` tool fails ("No response from multimodal-looker agent") — use Read tool instead
- MOM pre-resizes uploaded photos to 750×1000px, ~200KB each
- PDF handling untested — need student with PDF upload to verify
- File count varies per student (this student had 2 JPGs)

## 2026-03-03: Task 4 - Skill File Completion

### What Was Done
Filled all three placeholder sections in `.claude/skills/grade-show-work/CLAUDE.md`:

1. **Workflow Steps** (Steps 0-6): Full instructions with Playwriter code snippets
2. **Selectors Reference**: 22-row selector table + Score ID convention + Max Score extraction + File URL pattern
3. **Session Management**: State file schema, phase tracking, resume capability, session limits (20 hard / 15 soft)

### Key Patterns Applied
- Modeled workflow on `grade.md` (Step 1 Get URL, Step 2 Extract, etc.) but adapted for per-student navigation
- Used URL extraction approach (not screenshots) as primary image analysis method per Task 3 findings
- State file uses URL as key (same pattern as `grade-state.json`) with `phase` field for scan/apply tracking
- Extraction code uses single `page.evaluate()` call to get all question data + file URLs in one shot

### Structural Decisions
- **Step 0** added as Get Starting Point - aligns with grade.md Step 1 pattern for URL + state + navigate
- **Steps 1-3** are a loop: scan student, extract/analyze, navigate next
- **Steps 4-6** are sequential: generate report, get approval, apply
- Score fill uses `input.fill('')` then `input.fill(newScore)` pattern (clear then set)
- State file stores full `report` array so resume during apply phase does not need re-scanning
