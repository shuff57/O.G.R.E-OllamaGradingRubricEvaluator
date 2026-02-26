---
name: grade
description: Use when grading student work on a web-based grading page. Asks user for the page URL, navigates to it, extracts rubric and student responses, grades each student, fills scores and feedback.
---

# Autonomous Grading

Grade student work on web-based grading pages. The agent asks the user for the grading page URL, navigates to it, extracts the rubric, point values, and all student responses in one batch, grades each student against the extracted rubric, then fills scores and feedback visually in batches of 5.

Currently supported: **MyOpenMath** (`gradeallq2.php` pages). See [grade-selectors.md](grade-selectors.md) for platform-specific DOM selectors.

## Browser Automation Setup

**Single tool for all environments:**
- **Playwriter MCP** — works in Claude Code, OpenCode, or any MCP-compatible agent
- **Chrome browser** with Playwriter extension installed and enabled on the grading tab
- Direct DOM access for extracting rubrics and filling scores

No environment-specific detection needed. Just Playwriter.

## Grading Philosophy

**These are high school seniors, not college students or experts. Grade generously:**
- Give full credit for demonstrating understanding, even if the explanation lacks polish
- Award substantial partial credit for correct reasoning with minor errors
- Focus on mathematical thinking and effort, not perfect execution
- Distinguish conceptual misunderstandings (serious) from minor mistakes (not serious)
- Any substantive attempt that engages with the prompt earns at least 60% of max score

## Key Principles

- **Batch all DOM reads** — extract every student in a single browser call
- **Grade without browser calls** — all data is in context after extraction; evaluate in your head
- **Fill visually in batches** — scroll, fill score, fill feedback for 5 students per browser call
- **Save every 5 students** — click Quick Save after each batch
- **Skip already-graded students** — those with existing feedback (score alone is unreliable; 0 may be legitimate)
- **Preserve existing non-zero scores** — if a student has a non-zero score but no feedback, add feedback only; do not overwrite the score

## Workflow

### Step 1: Get URL, Check for Resume, Navigate

**1a. Get the URL.** Check if the user passed any arguments with the command (a URL and/or student name). If no URL provided, ask: "What is the grading page URL?"

**1b. Check the state file.** Read `grade-state.json` from the project root. This file maps each grading URL to the last student graded. Format:
```json
{
  "<URL>": { "lastStudent": "Tyson, Kayla", "count": 27, "timestamp": "2026-02-08T15:30:00Z" }
}
```

**1c. Ask the user** — present one of these flows:

- **State file has an entry for this URL:**
  > "I found a previous session for this page. Last graded: **Tyson, Kayla** (27 students, Feb 8).
  > Resume after Tyson, Kayla? Or start fresh?"
  - If user picks **Resume** → set resume point to that student name
  - If user picks **Start fresh** → no resume point, grade all ungraded
  - If user types a **different name** → use that as the resume point

- **No state file entry (or file doesn't exist):**
  > "Starting fresh. I'll grade all ungraded students."

**1d. Navigate with Playwriter.**
1. Use the default page or create a dedicated page: `state.gradePage = page` (or `await context.newPage()` if you need isolation)
2. Navigate to the URL: `await state.gradePage.goto(url, { waitUntil: 'domcontentloaded' })`
3. Wait for page load: `await waitForPageLoad({ page: state.gradePage, timeout: 5000 })`
4. Identify the platform (e.g., MyOpenMath if URL contains `myopenmath`) and load selectors from [grade-selectors.md](grade-selectors.md)

### Step 2: Batch Extract Everything (ONE Playwriter call)

Run a single `playwriter_execute()` call to extract all data at once. Use `state.gradePage` as the page reference. See [grade-selectors.md](grade-selectors.md) for exact DOM selectors and extraction code.

Extract from each student section (`div[data-lastchange]`):
- Student name, current score, whether feedback already exists
- Full response text

Extract shared rubric (from the first student — identical for all):
- Essay/question prompt from Part 1
- Grading checklist from collapsed `<details>` in Part 1
- Target answers and model response from collapsed `<details>` in Part 2
- **Max score** — read the `/N` text adjacent to the score input (e.g., `/10`, `/5`, `/20`)

Store all data locally. Report:
- **No resume point:** "Found X students. Y already graded (skipping), Z need grading. Max score: N."
- **With resume point:** "Resuming after [NAME]. Found X students total, skipping Y (already graded or before resume point), Z need grading. Max score: N."

**CRITICAL: After extraction, make ZERO additional Playwriter calls until Step 4.** All rubric data, student names, scores, feedback status, and full responses are in context. Grade entirely from what you have.

### Step 2b: Rubric Review (Three-Tier Check)

After extraction, check if the rubric has meaningful content. Apply this universally — not just for specific platforms:

1. **Tier 1 — Rubric found:** If you extracted checklist items, rubric targets, or a substantial question prompt (>50 characters), show the user a summary:
   > "Here's the rubric I extracted:
   > - [checklist items]
   > - [rubric targets]
   > - Max score: N
   > Does this look correct? Any adjustments?"

2. **Tier 2 — No rubric but content visible:** If rubric extraction returned minimal data (just title + max score) but you can see assignment questions, descriptions, or prompt text on the page, use that visible content to create grading criteria:
   > "I couldn't find a formal rubric, but I see the assignment question. Here's a rubric I created from it:
   > - [generated criteria with point breakdowns]
   > Does this look right?"

3. **Tier 3 — Nothing found:** If neither rubric nor meaningful content is available:
   > "I couldn't find a rubric or assignment questions on this page. Please provide the rubric or grading instructions so I can evaluate student work."
   > Wait for user response before proceeding.

**Always wait for user confirmation before proceeding to Step 3.** The user should approve or adjust the rubric.

### Step 3: Grade Each Student (Agent evaluates directly)

**The agent IS the grader.** No external API calls. No LLM calls. Evaluate each ungraded student's response against the extracted rubric.

For each student, produce:
- **Score** (integer, 0 to extracted max)
- **Feedback** — constructive, supportive, educational tone

Grading approach:
- Compare response against the rubric checklist, target answers, and model response
- Award points for each rubric category the student addresses, even imprecisely
- Wrong terminology with correct concept = most of the points
- Minor errors or omissions lose at most 1 point per category
- Empty response = score 0, feedback "No response submitted."

**Math in feedback:** Use `\( ... \)` LaTeX delimiters for inline math. Most LMS platforms render MathJax automatically. Example: `"The sample mean \(\bar{x}\) approximates \(\mu\) as \(n\) increases."`

Grade all students in a batch mentally, then proceed to filling.

### Step 4: Fill Scores in Batches of 5 (ONE Playwriter call per batch)

Pass the batch of graded students into a single `playwriter_execute()` call. For each student in the batch:
1. Scroll to the student section (user sees the page move)
2. Fill the score input
3. Set feedback on BOTH the contenteditable div AND the hidden input — see [grade-selectors.md](grade-selectors.md) for the TinyMCE pattern

### Step 5: Save Every 5 Students

Click the "Quick Save" button after each batch. Wait for the save to complete (~1 second).

### Step 6: Verify and Report

After each batch, report:
- Students graded so far / total remaining
- Current batch: names and scores

After all students are graded:
- Total graded this session
- Score distribution: average, min, max
- Students skipped or errored
- Save confirmation

## State File & Resuming

**State file:** `grade-state.json` (project root) persists the last graded student across sessions.

**Saving state** — update the state file after every Quick Save (Step 5):
```json
{
  "<URL>": { "lastStudent": "LastName, FirstName", "count": 15, "timestamp": "2026-02-08T15:30:00Z" }
}
```
Use the grading page URL as the key. Merge with existing entries (other URLs) — don't overwrite the whole file.

**Resuming** — handled automatically in Step 1c. The agent reads the state file, finds an entry for the URL, and offers to resume. The user can:
- Accept the suggested resume point
- Type a different student name
- Choose to start fresh

Use **fuzzy matching** on student names — match by last name if the full name isn't exact. Report which student was matched and the index resuming from.

## Context Limits

Grading consumes context window proportional to student count. To prevent context exhaustion and lost work:

- **Hard limit: 30 students per session.** After grading 30 students, STOP. Save the current batch, update the state file, then report:
  > "Context limit reached. Graded 30 students this session. Last graded: **LastName, FirstName**.
  > To continue, start a new conversation and invoke the grade skill again with the same URL.
  > (I'll detect the previous session and suggest resuming from where you left off.)"
- **Soft warning at 25:** After grading 25 students, include in the batch report:
  > "Approaching context limit (25/30). Y students remaining."
- **Counting rules:** Only students graded *this session* count toward the limit. Already-graded students (skipped) and students before the resume point do not count.
- Track the count internally after each batch fill. The limit protects both grading quality and session reliability.

## Error Handling

| Problem | Action |
|---------|--------|
| Playwriter not available | Ask user to enable Playwriter extension on the grading tab and ensure Chrome is running |
| User hasn't provided URL | Ask "What is the grading page URL?" before proceeding |
| Unsupported platform | Inform user; currently only MyOpenMath is supported |
| No rubric found | Scan page for assignment content; if still empty, ask user to provide rubric text |
| Cannot evaluate a response | Skip student, continue with next |
| Empty response | Score 0, feedback "No response submitted." |
| Connection stale | Reset: `playwriter_reset()` |
| DOM mismatch | Take accessibility snapshot to diagnose, ask user for help |

## Implementation Notes

- The agent IS the grader — no external API calls needed
- Use Playwriter MCP for all browser automation (works across Claude Code, OpenCode, agents)
- Rubric `<details>` elements are collapsed but content is accessible via DOM queries
- TinyMCE inline editors require setting both the visible div and the hidden input — see [grade-selectors.md](grade-selectors.md)
- Use `state.gradePage` to reference the grading page consistently
