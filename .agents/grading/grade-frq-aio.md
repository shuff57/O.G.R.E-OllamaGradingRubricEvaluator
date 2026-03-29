
# Grade FRQ AIO (Free Response Questions — All-in-One)

> Grade student work directly on a web-based grading page. This command extracts the rubric and all student responses in one batch, grades generously for high school seniors, then fills scores and feedback visually in batches of 5 with Quick Save protection and resume support.

Currently supported: **MyOpenMath** (`gradeallq2.php` pages). See [grade-selectors.md](grade-selectors.md) for the DOM selector reference, extraction pattern, and TinyMCE writeback details.

## Prerequisites

- **Playwriter MCP** is available
- **Chrome** is running with the Playwriter extension enabled on the grading tab
- The user can provide the grading page URL
- The project root can store `grade-state.json` for resume tracking

## When to Use

- Grade many student responses from a single web grading page
- Extract all students and rubric data in one browser batch, then grade without more browser reads
- Resume a partially completed grading session from `grade-state.json`
- Enter feedback directly into the LMS using the TinyMCE/contenteditable pattern

## When NOT to Use

- The platform is not supported and you do not have verified selectors
- The user wants a manual rubric discussion only, without browser automation
- The task is about grading uploaded work artifacts instead of a page-based free-response list

## Guardrails

> ⚠️ **Must NOT:**
> - Do **not** change the grading philosophy: these are high school seniors, so grade generously and award substantial partial credit for real mathematical effort.
> - Do **not** overwrite an existing **non-zero** score unless the user explicitly instructs you to do so.
> - Do **not** use score alone as the skip signal; treat **existing feedback** as the reliable sign that a student is already graded.
> - Do **not** make additional Playwriter extraction calls after the Step 2 batch read; grade from the extracted data already in context.
> - Do **not** skip the rubric confirmation gate; always run the three-tier rubric check and wait for user approval before grading.
> - Do **not** break the **batch-of-5 + Quick Save** pattern.
> - Do **not** exceed the **30 students per session** context limit; warn at 25, stop at 30, save, and hand off to a new session.
> - Do **not** use `$$ ... $$` in feedback; use inline LaTeX `\( ... \)` delimiters.
> - Do **not** set only the TinyMCE `contenteditable` box; set **both** the visible editor and the hidden backing field (`input[name^="fb-"]`, and `textarea.mce-content-body` if present on the platform) so feedback persists.

## Quick Start

1. Get the grading URL, check `grade-state.json`, and offer resume/fresh/different-name options.
2. Extract rubric + all students in **one** Playwriter call, then confirm the rubric with the user.
3. Grade locally, fill students in **batches of 5**, click **Quick Save** after each batch, and update state after every save.

## Grading Philosophy

**These are high school seniors, not college students or experts. Grade generously:**

- Give full credit for demonstrating understanding, even if the explanation lacks polish
- Award substantial partial credit for correct reasoning with minor errors
- Focus on mathematical thinking and effort, not perfect execution
- Distinguish conceptual misunderstandings from minor mistakes; they are not equally serious
- Any substantive attempt that genuinely engages with the prompt earns at least **60%** of the available points

## Workflow

### Phase 1: Intake, Resume Check, and Navigation

- **INPUT:** Command arguments, grading page URL, optional student name, existing `grade-state.json`
- **ACTION:**
  1. Check whether the user already passed a URL and/or a student name.
  2. If no URL is present, ask: **"What is the grading page URL?"**
  3. Read `grade-state.json` from the project root. Expected shape:

     ```json
     {
       "<URL>": {
         "lastStudent": "Tyson, Kayla",
         "count": 27,
         "timestamp": "2026-02-08T15:30:00Z"
       }
     }
     ```

  4. If the URL already exists in state, ask:

     > "I found a previous session for this page. Last graded: **Tyson, Kayla** (27 students, Feb 8). Resume after Tyson, Kayla? Or start fresh?"

     Handle the response as follows:
     - **Resume** → use that saved student name as the resume point
     - **Start fresh** → ignore the prior resume point
     - **Different name** → use the user-provided name as the resume point

  5. If no state entry exists, report:

     > "Starting fresh. I'll grade all ungraded students."

  6. Navigate with Playwriter:
     - Reuse the default page or store a dedicated one as `state.gradePage`
     - `await state.gradePage.goto(url, { waitUntil: 'domcontentloaded' })`
     - `await waitForPageLoad({ page: state.gradePage, timeout: 5000 })`
     - Confirm the page is the supported MyOpenMath grading view and load selectors from [grade-selectors.md](grade-selectors.md)
- **OUTPUT:** Active grading page, resume mode determined, state context loaded

### Phase 2: Batch Extract Everything in ONE Playwriter Call

- **INPUT:** Loaded grading page, platform selectors
- **ACTION:**
  1. Run a single `playwriter_execute()` call against `state.gradePage`.
  2. Extract from every student section (`div[data-lastchange]`):
     - Student name
     - Current score
     - Whether feedback already exists
     - Full response text
  3. Extract shared rubric data from the first student section:
     - Essay/question prompt from Part 1
     - Grading checklist from collapsed `<details>` in Part 1
     - Target answers and model response from collapsed `<details>` in Part 2
     - **Max score** from the `/N` text next to the score input
  4. Apply resume filtering:
     - Use **fuzzy matching** on the requested resume name
     - Match by last name if the full name is not exact
     - Report which student was matched and which index the session will resume from
  5. Report extraction status:
     - **No resume point:** "Found X students. Y already graded (skipping), Z need grading. Max score: N."
     - **With resume point:** "Resuming after [NAME]. Found X students total, skipping Y (already graded or before resume point), Z need grading. Max score: N."

  **Critical extraction rule:** After this phase, make **zero additional Playwriter calls** until the fill phase. All rubric data, student names, feedback status, scores, and responses should already be in context.
- **OUTPUT:** Full in-memory grading dataset for the current session

### Phase 3: Rubric Review and User Confirmation

- **INPUT:** Extracted rubric/checklist/prompt/model answer/max score
- **ACTION:** Run the three-tier rubric check:

  1. **Tier 1 — Rubric found**
     - If you extracted meaningful checklist items, rubric targets, or a substantial prompt (>50 characters), show a summary:

       > "Here's the rubric I extracted:
       > - [checklist items]
       > - [rubric targets]
       > - Max score: N
       > Does this look correct? Any adjustments?"

  2. **Tier 2 — No rubric but content visible**
     - If you only have minimal rubric data but can see assignment text or prompt content, create a grading rubric from that visible content:

       > "I couldn't find a formal rubric, but I see the assignment question. Here's a rubric I created from it:
       > - [generated criteria with point breakdowns]
       > Does this look right?"

  3. **Tier 3 — Nothing found**
     - If neither rubric nor meaningful assignment content is available, stop and ask:

       > "I couldn't find a rubric or assignment questions on this page. Please provide the rubric or grading instructions so I can evaluate student work."

  4. Wait for the user to approve or adjust the rubric before continuing.
- **OUTPUT:** User-approved grading standard for the remainder of the session

### Phase 4: Grade Students Locally

- **INPUT:** Approved rubric, extracted student responses, extracted max score
- **ACTION:**
  1. Grade students directly in-agent. The agent **is** the grader.
  2. Use **no external API calls** and no extra browser reads for grading decisions.
  3. For each ungraded student, produce:
     - **Score** — integer from 0 to max score
     - **Feedback** — constructive, supportive, educational tone
  4. Grade with these rules:
     - Compare the response against the checklist, rubric targets, and model response
     - Award points for each rubric category the student addresses, even if imprecisely
     - Wrong terminology with correct concept still earns most of the points
     - Minor errors or omissions lose at most **1 point per category**
     - Empty response = score `0`, feedback **"No response submitted."**
  5. When writing math, use inline LaTeX with `\( ... \)` delimiters.

     Example: `The sample mean \(\bar{x}\) approximates \(\mu\) as \(n\) increases.`
- **OUTPUT:** A local batch of scored students ready for browser entry

### Phase 5: Fill in Batches of 5 and Quick Save

- **INPUT:** Graded student batch, `state.gradePage`, TinyMCE selectors, current session count
- **ACTION:**
  1. Send at most **5 students** into a single `playwriter_execute()` call.
  2. For each student in the batch:
     - Scroll the student section into view so the user sees page movement
     - Fill the score input
     - Set feedback on **both** the TinyMCE `contenteditable` div **and** the hidden input/textarea value described in [grade-selectors.md](grade-selectors.md)
  3. Click **Quick Save** after the batch.
  4. Wait briefly for save completion.
  5. Update `grade-state.json` immediately after each Quick Save.
  6. Preserve scores safely:
     - If feedback already exists, skip the student
     - If a student has a non-zero score but no feedback, add feedback only and do not overwrite the score unless the user explicitly says to do so
- **OUTPUT:** One saved batch, one state checkpoint, browser and state file in sync

### Phase 6: Verify, Report, and Enforce Context Limits

- **INPUT:** Saved batch result, session counters, skipped/error list
- **ACTION:**
  1. After each batch, report:
     - Students graded so far / total remaining
     - Current batch names and scores
  2. At **25 students**, add a soft warning:

     > "Approaching context limit (25/30). Y students remaining."

  3. At **30 students**, stop immediately after saving the current batch and updating state:

     > "Context limit reached. Graded 30 students this session. Last graded: **LastName, FirstName**.
     > To continue, start a new conversation and invoke the grade command again with the same URL.
     > (I'll detect the previous session and suggest resuming from where you left off.)"

  4. Counting rule: only students graded **this session** count toward the 30-student limit. Already-graded students and students skipped before the resume point do not count.
  5. After the session ends, report:
     - Total graded this session
     - Score distribution: average, min, max
     - Students skipped or errored
     - Save confirmation
- **OUTPUT:** Completed session summary or clean handoff point for the next session

## State Management

### State File

- **Path:** `grade-state.json` in the project root
- **Purpose:** Track the last graded student for each grading page URL
- **Keying rule:** Use the full grading page URL as the object key
- **Merge rule:** Merge new URL entries with existing ones; do not overwrite unrelated URLs

### State Update Pattern

Update state after **every Quick Save**:

```json
{
  "<URL>": {
    "lastStudent": "LastName, FirstName",
    "count": 15,
    "timestamp": "2026-02-08T15:30:00Z"
  }
}
```

### Resume Protocol

- Read `grade-state.json` before grading starts
- If an entry exists for the URL, offer **resume / fresh / different-name** choices
- Use **fuzzy matching** for the resume name
- Report exactly which student matched and where grading will resume

## Selector / Reference Notes

- Use [grade-selectors.md](grade-selectors.md) for all MyOpenMath DOM selectors
- Rubric `<details>` content may be visually collapsed but is still queryable from the DOM
- TinyMCE feedback entry is a two-target write: the visible `contenteditable` element **and** the hidden form value (`input[name^="fb-"]` in MyOpenMath, or a hidden `textarea.mce-content-body` backing field on platforms that expose one)
- Keep browser reads batched and browser writes grouped by batch size

## Error Handling

| Problem | Action |
|---------|--------|
| Playwriter not available | Ask the user to enable the Playwriter extension on the grading tab and ensure Chrome is running |
| User hasn't provided URL | Ask "What is the grading page URL?" before proceeding |
| Unsupported platform | Inform the user that currently only MyOpenMath is supported |
| No rubric found | Scan the page for assignment content; if still empty, ask the user to provide rubric text |
| Cannot evaluate a response | Skip that student and continue with the next |
| Empty response | Score `0`, feedback `No response submitted.` |
| Connection stale | Reset with `playwriter_reset()` |
| DOM mismatch | Take an accessibility snapshot to diagnose and ask the user for help |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Extracting students in multiple browser reads | Extract all students and rubric data in **one** Playwriter call |
| Grading after extraction but still making extra DOM reads | Grade entirely from the extracted data already in context |
| Filling too many students at once | Keep the write phase to **batches of 5** |
| Forgetting to click **Quick Save** after a batch | Save after every batch, then update `grade-state.json` immediately |
| Treating a `0` score as proof the student is already graded | Use **existing feedback**, not score alone, as the skip signal |
| Overwriting a non-zero score because feedback is blank | Add feedback only unless the user explicitly approves a score change |
| Resuming only on exact full-name match | Use fuzzy matching and confirm the matched student/index |
| Writing math feedback with `$$ ... $$` | Use inline LaTeX `\( ... \)` instead |
| Setting only the TinyMCE visible editor | Set both the `contenteditable` editor and the hidden input/textarea value |
| Ignoring the context limit | Warn at **25**, stop at **30 students**, save, and hand off to a fresh session |
