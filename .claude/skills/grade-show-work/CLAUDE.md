---
name: grade-show-work
description: Use when evaluating partial credit for "show your work" math problems — reviews uploaded student work images, awards bonus points (+2, +1) for effort shown, generates a detailed report for instructor review before any grade modifications.
---

# Show Your Work - Partial Credit Evaluator

Review uploaded student work images on grading pages to award bonus partial credit for effort shown. This is a **bonus-only** system — it adds points to reward work demonstrated, never decreases scores.

## Prerequisites

- **Playwriter MCP** enabled and connected
- **Grading page open** in Chrome with Playwriter extension active
- Student submissions with **file uploads** (images of handwritten work)

## When to Use

- User asks to evaluate "show your work" partial credit
- User wants to reward effort on math problems with uploaded images
- User mentions "partial credit" or "bonus points" for work shown

**Do NOT use:**

- For text/essay grading — only evaluate uploaded image work
- To modify grades directly — always report first, get approval
- Without file uploads present — nothing to evaluate

## Partial Credit Criteria

Award points based on the **visible work effort**, not mathematical correctness:

### +2 Points — Substantial Work

Student showed meaningful progress toward solving the problem:

- Correct problem setup or relevant equations written
- Multiple solution steps attempted
- Systematic approach visible
- Work demonstrates understanding of the concept
- Even if final answer is wrong, substantial work deserves recognition

**Examples:**
- Wrote the formula needed (e.g., quadratic formula), substituted values, attempted solution
- Drew a diagram, labeled components, applied relevant theorem
- Showed multiple algebraic steps toward the answer
- Attempted the problem in more than one way

### +1 Point — Some Work

Student made a genuine attempt but minimal progress:

- Wrote down given information from the problem
- Attempted to start the problem
- Drew a relevant diagram or wrote a formula
- Made an effort but got stuck early or made fundamental errors

**Examples:**
- Copied the problem statement with some values identified
- Wrote a formula but didn't apply it
- Drew a diagram but didn't connect it to a solution path
- Showed one step of work before stopping

### +0 Points — No Meaningful Work

No credit awarded for:

- Blank upload (no image or empty file)
- Illegible or ungradeable image
- Completely unrelated content
- Only the problem statement rewritten with no attempt at solution
- Image of something other than the assignment (random photo, meme, etc.)

## Guardrails

> **⚠️ MUST NOT:**
>
> - **Text/Essay Grading** — Only evaluate uploaded image work for "work shown". Do not grade written explanations in text fields.
> - **Full Re-grading** — Only add bonus points. Never re-grade or change existing scores.
> - **Score Decreases** — This system is additive only. Never decrease any student's score.
> - **Exceed Max Score** — Cap bonus at the question's maximum points. If a question is worth 5 points and student already has 4, award at most +1.
> - **Evaluate Math Correctness** — Evaluate "work shown" not correctness. A wrong approach with good work = +2. A correct answer with no work shown = +0.
> - **Modify Without Approval** — Always generate the report first. Wait for user approval before filling any scores.
> - **Over-engineer Image Processing** — Use native Playwriter vision (screenshot + vision model). No external OCR services.
> - **Questions Without Uploads** — Only evaluate questions where students uploaded files. Skip questions with only text responses.

## Eligibility Criteria

Only evaluate questions where:

- MOM auto-score is **less than 4** (out of max points)
- Student has a **file upload** attached to the question
- Question asks for "show your work" or allows uploaded images

Skip questions where:

- Auto-score is 4 or higher (already passed)
- No file upload present
- Only text response (this skill evaluates images)

---

## Report Format

Generate a markdown report with this structure:

```markdown
# Partial Credit Report: {Assignment Name}

**Date:** {date}
**Total Students:** {count}
**Questions Evaluated:** {list}

---

## Summary

| Student | Question | Auto-Score | Bonus | New Score | Work Shown |
|---------|----------|------------|-------|-----------|------------|
| Name    | 3        | 2/5        | +2    | 4/5       | +2 Substantial |

---

## Detailed Breakdown

### Question {n}: {Question Text}

| Student | Work Description | Credit | Rationale |
|---------|------------------|--------|-----------|
| Name    | "Wrote quadratic formula, substituted a=1, b=-3, c=-4" | +2 | Multiple solution steps visible |

---

## Approval Request

Ready to apply bonus points to {count} students across {questions} questions.

**Apply these bonuses?** (yes/no)

- If **yes**: Fill the bonus scores using Playwriter, then click Quick Save
- If **no**: Specify which adjustments needed, or cancel
```

---

## Workflow Steps

### Step 0: Get Starting Point

**0a. Get the URL.** Check if the user provided a grading page URL. If not, ask: "What is the grading page URL?" The URL should be a `gbviewassess.php` page (individual student grading view).

**0b. Check the state file.** Read `grade-show-work-state.json` from the project root. This file maps each grading URL to the last session state. If an entry exists for this URL:
> "I found a previous session for this page. Last student: **{name}** ({count} students, {date}).
> Phase: {scan|apply}. Resume? Or start fresh?"

- **Resume** → navigate to the last student and continue from the saved phase
- **Start fresh** → begin from the first student

**0c. Navigate with Playwriter.**
1. Get or create a page: `state.gradePage = context.pages().find(p => p.url() === 'about:blank') ?? await context.newPage()`
2. Navigate: `await state.gradePage.goto(url, { waitUntil: 'domcontentloaded' })`
3. Wait for load: `await waitForPageLoad({ page: state.gradePage, timeout: 5000 })`
4. Verify on correct page: snapshot and confirm `h2` (student name) is visible

### Step 1: Scan Current Student

Extract all data for the current student in a single `page.evaluate()` call:

```javascript
const data = await state.gradePage.evaluate(() => {
  const studentName = document.querySelector('h2')?.textContent?.trim();
  const questions = Array.from(document.querySelectorAll('.bigquestionwrap')).map((wrap, qIdx) => {
    const label = wrap.querySelector('strong')?.textContent?.trim();
    const scoreInputs = Array.from(wrap.querySelectorAll('input[id^="scorebox"]'));
    const scores = scoreInputs.map(inp => ({
      id: inp.id,
      value: parseFloat(inp.value) || 0,
      max: parseFloat(inp.nextSibling?.textContent?.trim()?.replace('/', '')) || 0,
    }));
    const fileLinks = Array.from(wrap.querySelectorAll('a.attach.prepped')).map(a => ({
      url: a.href,
      filename: a.textContent.trim(),
    }));
    return {
      index: qIdx,
      label,
      scores,
      fileLinks,
      hasWorkUpload: !!wrap.querySelector('.viewworkwrap'),
    };
  });
  return { studentName, questions };
});
```

**Eligibility filter** — for each question, check:
- Has file upload (`fileLinks.length > 0`)
- Auto-score < 4 (any score part `value < 4`)

If no eligible questions for this student, skip to Step 3 (next student).

### Step 2: Extract & Analyze Uploads

For each eligible question's file uploads, use the **URL extraction approach** (no UI clicks needed):

**2a. File URLs are already extracted** from Step 1's `fileLinks` array. The `<a.attach.prepped>` elements exist in the DOM regardless of the "View Work" toggle state.

**2b. Fetch each file** directly in the Playwriter sandbox:

```javascript
// For each file URL from Step 1
const fs = require('node:fs');
const resp = await fetch(fileUrl);  // No auth needed — files.myopenmath.com is public
const buf = Buffer.from(await resp.arrayBuffer());
const tempPath = `./temp-work-${studentIndex}-q${qIndex}-${fileIndex}.jpg`;
fs.writeFileSync(tempPath, buf);
```

**2c. Analyze with Claude vision** — use the Read tool on each saved temp file. Claude vision sees the full-resolution image (750×1000px) and evaluates:
- **+2 points** — Substantial work: correct setup, multiple steps, systematic approach
- **+1 point** — Some work: wrote given info, started problem, drew diagram
- **+0 points** — No meaningful work: blank, illegible, unrelated content

**2d. Cap the bonus** — ensure `currentScore + bonus ≤ maxScore` for the question. If max is 5 and current is 4, award at most +1.

**2e. Record the evaluation** — store student name, question, current score, bonus, rationale, and brief work description for the report.

### Step 3: Navigate to Next Student

After scanning and evaluating the current student:

1. Click "Save and Next Student": `await state.gradePage.locator('button.primary:has-text("Save and Next Student")').click()`
2. Wait for full page navigation: `await state.gradePage.waitForLoadState('domcontentloaded')`
3. Wait for content: `await waitForPageLoad({ page: state.gradePage, timeout: 5000 })`
4. Verify new student loaded: check `h2` text changed

**Note:** This is a full page navigation (not SPA). The URL `uid` parameter changes to the next student. The `stu` parameter may be dropped.

**Session counter:** Increment the student count. Check against limits:
- At **15 students**: warn "Approaching context limit (15/20). {N} students remaining."
- At **20 students**: STOP. Save state, generate report for students evaluated so far.

**Loop:** Return to Step 1 for the next student. Continue until reaching the end of the roster or the session limit.

### Step 4: Generate Report

After scanning all students (or reaching the session limit), compile the markdown report using the Report Format defined above. Include:

- Summary table: all students with eligible questions, their current scores, recommended bonuses, and new scores
- Detailed breakdown per question: work descriptions and rationale for each credit decision
- Statistics: total students scanned, students with eligible work, total bonus points recommended

**Only include students who would receive bonus points** (+1 or +2). Students with +0 across all questions can be summarized as a count ("12 students showed no additional work").

### Step 5: Get Approval

Present the report to the user and ask for confirmation:

> "Ready to apply bonus points to {count} students across {questions} questions.
> 
> **Apply these bonuses?** (yes / no / adjust)"

- **Yes** → proceed to Step 6
- **No** → cancel, no changes made
- **Adjust** → user specifies which students/scores to modify, then re-confirm

**CRITICAL: Never apply scores without explicit user approval.** The report-first approach is non-negotiable.

### Step 6: Apply Bonus Points

After approval, navigate back to each approved student and update their scores:

**6a. Navigate to the student** — use the grading page URL with the student's `uid` parameter:
`await state.gradePage.goto(studentUrl, { waitUntil: 'domcontentloaded' })`

**6b. Update the score** — for each eligible question:
```javascript
const input = await state.gradePage.locator(`input#${scoreboxId}`);
await input.fill('');  // Clear current value
await input.fill(newScore.toString());  // Set new score (current + bonus)
```

**6c. Save changes** — click "Save Changes" or "Save and Next Student":
`await state.gradePage.locator('button.primary:has-text("Save Changes")').click()`

**6d. Verify** — confirm the score was saved by re-reading the input value.

**6e. Update state file** — after each student, update `grade-show-work-state.json` with phase `"apply"` and the current student name.
---

## Selectors Reference

| Element | Selector | Notes |
|---------|----------|-------|
| **Student name** | `h2` | First `<h2>` in `.gbmainview` |
| **Assessment name** | `h3` | First `<h3>` in `.gbmainview` |
| **Overall score** | `button#assess_select` | Text: "Scored attempt. Score: X/Y." |
| **Question container** | `div.bigquestionwrap` | One per question, 0-indexed |
| **Question label** | `.bigquestionwrap strong` | Text: "Question N." |
| **Score input (single)** | `input#scoreboxN` | `aria-label="Score"`, type="text" |
| **Score input (multi-part)** | `input#scoreboxN-M` | `aria-label="Score Part M"`, type="text" |
| **Max score text** | `scoreInput.nextSibling` | Text node: "/10", "/5", "/3.333", etc. |
| **Work upload pane** | `div.questionpane.viewworkwrap` | Only present on questions requiring file upload |
| **File download link** | `a.attach.prepped[target="_blank"]` | Direct URL to `files.myopenmath.com/ufiles/{uid}/filename.jpg` |
| **File preview toggle** | `span.videoembedbtn#fileembedbtnN[role="button"]` | `<span>` with `role="button"`, NOT a `<button>` |
| **View/Hide Work toggle** | `button.slim` inside `.viewworkwrap` | Text toggles: "Hide Work" ↔ "View Work" |
| **File list container** | `.viewworkwrap .introtext ul.nomark` | Hidden via `display:none` when work collapsed — but `<a>` hrefs still in DOM |
| **Per-question feedback** | `div#fbN.fbbox` | TinyMCE inline editor (contenteditable div) |
| **General feedback** | `div#fbgen.fbbox` | TinyMCE inline editor at bottom of page |
| **Save Changes** | `button.primary:has-text("Save Changes")` | Appears 2× (top + bottom) |
| **Save and Next Student** | `button.primary:has-text("Save and Next Student")` | Single instance, full page navigation |
| **Return to Gradebook** | `button.secondary:has-text("Return to Gradebook")` | Single instance |
| **Full credit button** | `button:has-text("Full credit")` | Text varies: "Full credit" vs "Full credit all parts" |
| **Add feedback button** | `button.slim:has-text("Add feedback")` | One per question |

### Score Input ID Convention

- **Single-part question**: `scorebox{qIndex}` (e.g., `scorebox1`, `scorebox3`)
- **Multi-part question**: `scorebox{qIndex}-{partIndex}` (e.g., `scorebox0-0`, `scorebox0-1`)
- Question index is **0-based** (Question 1 = index 0)
- Part index is **0-based**

### Max Score Extraction

```javascript
const scoreInput = document.getElementById('scorebox1');
const maxText = scoreInput.nextSibling.textContent.trim(); // "/10"
const maxScore = parseFloat(maxText.replace('/', '')); // 10
```

### File URL Pattern

| Property | Value |
|----------|-------|
| Host | `files.myopenmath.com` |
| Path pattern | `/ufiles/{uid}/{filename}` |
| Authentication | **None** — publicly accessible |
| Image size | ~200KB, 750×1000px (MOM pre-resizes uploads) |
| Confirmed ext | `.jpg` (resized phone photos) |
| Possible ext | `.png`, `.pdf`, `.jpeg`, `.heic` |
---

## Session Management

### State File

**Location:** `grade-show-work-state.json` (project root)

**Schema:**
```json
{
  "<grading-page-URL>": {
    "lastStudent": "LastName, FirstName",
    "count": 12,
    "phase": "scan",
    "report": [
      {
        "student": "LastName, FirstName",
        "uid": "7158609",
        "questions": [
          {
            "index": 9,
            "label": "Question 10.",
            "currentScore": 2,
            "maxScore": 10,
            "bonus": 2,
            "newScore": 4,
            "rationale": "Substantial work: wrote formula, substituted values, multiple steps"
          }
        ]
      }
    ],
    "timestamp": "2026-03-03T15:30:00Z"
  }
}
```

**Phases:**
- `"scan"` — currently scanning students and evaluating uploads (Steps 1–3)
- `"apply"` — report generated, applying approved bonus points (Step 6)

### Resume Capability

On resume, the skill reads the state file and offers to continue:
- **Phase `"scan"`** — navigates to the last scanned student's URL, continues scanning from the next student
- **Phase `"apply"`** — presents the saved report for re-approval, then applies remaining unapplied bonuses

The `report` array in the state file preserves all evaluation data across sessions, so no re-scanning is needed on resume.

### Session Limits

- **Hard limit: 20 students per session.** After scanning 20 students, STOP. Save state, generate report for students evaluated so far, then inform the user:
  > "Context limit reached. Scanned 20 students this session. Last student: **{name}**.
  > To continue, start a new conversation and invoke the skill again with the same URL."
- **Soft warning at 15:** After scanning 15 students, include in output:
  > "Approaching context limit (15/20). {N} students remaining."
- **Counting rules:** Only students scanned *this session* count. Previously scanned students (from resume) do not count.
- Track count internally. The limit protects context quality and image analysis reliability.
---

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| No file uploads found | Question doesn't accept uploads | Skip question |
| Image unreadable | Poor quality upload | Award +0, note in report |
| Auto-score at max | Student already passed | Skip, don't add bonus |

---

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Evaluating text responses | Grading wrong content | Only evaluate image uploads |
| Exceeding max score | Score > 100% | Cap at question max |
| Grading without report | Unauthorized changes | Always report first |
| Evaluating correctness | Wrong criteria | Judge work shown, not accuracy |
