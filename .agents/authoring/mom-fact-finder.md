
# MOM Fact-Finder

> This research skill discovers how real MyOpenMath questions are built when static guidance is not enough. It searches the live question bank, extracts view-only PHP/question text by QID, synthesizes repeatable patterns across multiple examples, and records durable findings for future reuse.

## Prerequisites
- A live MyOpenMath teacher tab open in Chrome with Playwriter enabled
- A caller-provided `topic`; optional `questionType`, `library`, `keywords`, and `refresh`
- Write access to `temp/mom_fact_finder_results.json`
- `.agents/authoring/mom-page-map.md` available for current navigation/selector guidance
- `.agents/authoring/mom-patterns.md` available for cache lookup and pattern-library updates

## When to Use
- You need real production examples before writing a new MOM question
- `mom-frq` or existing notes do not explain a topic-specific pattern
- You need to open question code safely from QIDs in view-only mode
- You want to compare several similar questions and extract reusable libraries, scoring patterns, and rubric structures
- You want new discoveries appended back into the `mom-patterns` knowledge base

## When NOT to Use
- You only need static authoring syntax or standard essay scaffolds already covered elsewhere
- You need to edit a question, test a draft, or submit any change inside MyOpenMath
- You already have a sufficient cached entry in `mom-patterns` and `refresh` is not requested

## Guardrails

> ⚠️ **Must NOT:**
> - Navigate outside the research-safe MOM pages needed for question-bank search and view-only code inspection
> - Open edit mode or any question URL without `viewonly=1`
> - Click Save, Quick Save, Preview, Delete, Edit, or any form-submission control, even on a view-only page
> - Switch to a different course/question bank than the active teacher tab's `cid`
> - Extract from a page until both checks pass: URL contains `viewonly=1` and the heading shows `View:`
> - Browse more than 8 question pages in one session or skip the 1000 ms minimum pause between navigations
> - Update pattern knowledge without source QIDs, question types, and a synthesized summary

## Inputs

| Field | Required | Notes |
|---|---|---|
| `topic` | Yes | Natural-language topic such as `confidence interval for proportions` |
| `questionType` | No | Filter such as `essay`, `multipart`, `number`, `choices` |
| `library` | No | Preferred search scope; otherwise select topic-specific library or All Libraries |
| `keywords` | No | Extra search terms to broaden or narrow search |
| `refresh` | No | If `true`, bypass cached pattern reuse and force fresh browser research |

## Quick Start
1. Load `.agents/authoring/mom-patterns.md` and check whether the topic already exists unless `refresh=true`.
2. Load `.agents/authoring/mom-page-map.md`, open `manageqset.php?cid={cid}`, search, collect top QIDs, then open each with `moddataset.php?id={qid}&cid={cid}&viewonly=1`.
3. Write `temp/mom_fact_finder_results.json`, then append or refresh the topic entry through the `mom-patterns` knowledge-base workflow.

## Workflow

### Phase 1: Cache Check and Research Setup
- **INPUT:** Caller request with `topic` and optional filters
- **ACTION:**
  - Load `.agents/authoring/mom-patterns.md` first.
  - Search the existing pattern knowledge base for a matching topic heading or index entry.
  - If a relevant cached entry exists and `refresh` is not `true`, return that pattern and still write `temp/mom_fact_finder_results.json` with `source: "library"`.
  - If no good cached entry exists, continue to live browser research.
- **OUTPUT:** Either a cache hit or a confirmed live-search plan with `topic`, `questionType`, and `refresh` state.

### Phase 2: Attach to the Active MOM Course and Open Search
- **INPUT:** Need for live browser research
- **ACTION:**
  - Reuse the active MyOpenMath teacher tab; extract `cid` from its URL.
  - If no MOM tab is open or `cid` cannot be read, stop and ask the user to open the correct tab.
  - Load `.agents/authoring/mom-page-map.md` for current page layout, scope-picker behavior, and library-tree navigation details.
  - Navigate only to `https://www.myopenmath.com/course/manageqset.php?cid={cid}`.
  - Re-observe the page before interacting.
- **OUTPUT:** Safe search page open for the correct `cid`.

### Phase 3: Scope the Search and Collect Candidate QIDs
- **INPUT:** Search page for the current course question bank
- **ACTION:**
  - Prefer a topic-specific library scope instead of broad textbook-style groupings.
  - Use `mom-page-map` to choose the correct library-tree path or fall back to All Libraries if topic mapping is unknown.
  - If `questionType` is provided, open advanced search and apply the matching type value (for example: `essay`, `multipart`, `number`, `choices`, `multans`, `file`, `draw`).
  - Enter the topic or narrowed keyword, run search, and broaden only if results are empty.
  - Sort by **Times Used** descending. Prefer keyboard `Enter` on the header if an overlay blocks mouse clicks.
  - Parse the results table and collect the top 5-8 numeric QIDs with description, type, and times-used count.
  - If the caller already has candidate QIDs, skip directly to extraction as long as each QID is numeric and still tied to the same `cid`.
- **OUTPUT:** Ranked candidate questions ready for code extraction.

### Phase 4: Open Each QID in View-Only Mode and Extract Code
- **INPUT:** Ranked list of candidate QIDs
- **ACTION:**
  - For each candidate, open `https://www.myopenmath.com/course/moddataset.php?id={qid}&cid={cid}&viewonly=1`.
  - After every navigation, verify the session did not redirect to login and confirm the page is still within `myopenmath.com/course/`.
  - Confirm both safety checks before extraction: URL contains `viewonly=1` and the page heading contains `View:`.
  - Read `textarea#control`, `textarea#qtext`, and the question type field (`input#qtype` when available).
  - Skip entries where both control and question text are empty.
  - Truncate captured snippets to a reviewable size: up to 80 lines for control and 40 lines for question text.
  - Wait at least 1000 ms before the next navigation.
- **OUTPUT:** A comparable set of real examples keyed by QID.

### Phase 5: Synthesize a Reusable Pattern
- **INPUT:** Extracted examples from multiple related questions
- **ACTION:**
  - Compare the examples to identify repeated `loadlibrary()` calls, helper functions, `$anstypes`, scoring methods, rubric structures, variable conventions, and distinctive authoring tricks.
  - Prefer cross-example synthesis over single-question copying.
  - Choose one `bestExample`: highest signal, usually high usage plus illustrative code.
  - Produce:
    - `keyPatterns` — 3-5 concise bullets capturing what repeatedly matters
    - `functionCalls` — every notable `loadlibrary()` or special helper found
    - `suggestedApproach` — 2-3 sentences on how to build a similar question
  - Call out anything not already documented in static authoring guidance.
- **OUTPUT:** Pattern summary grounded in multiple production examples.

### Phase 6: Persist Results and Update the Knowledge Base
- **INPUT:** Extracted examples plus synthesized pattern summary
- **ACTION:**
  - Write `temp/mom_fact_finder_results.json` with this shape:

```json
{
  "topic": "confidence interval for proportions",
  "searchDate": "YYYY-MM-DD",
  "source": "browser|library",
  "examples": [
    {
      "qid": "12345",
      "type": "essay",
      "timesUsed": 4200,
      "commonControl": "...",
      "questionText": "..."
    }
  ],
  "patternSummary": {
    "keyPatterns": ["bullet 1", "bullet 2"],
    "functionCalls": ["loadlibrary('datasummary')"],
    "suggestedApproach": "..."
  },
  "libraryUpdated": true
}
```

  - Load `.agents/authoring/mom-patterns.md` again before writing back.
  - Follow the `mom-patterns` skill's current storage location and append/refresh protocol rather than hardcoding an old path.
  - Preserve these archived update rules when adding a topic entry:
    - include Added date, source QIDs, max Times Used, question types, and discovered libraries/functions
    - include a concise Key Patterns section
    - include one best code example with safe truncation
    - replace an existing topic only when `refresh=true`; otherwise skip duplicate rewrites
    - if the knowledge base has a size cap, compress the oldest low-signal entry before appending rather than dropping the new finding
  - Mark `libraryUpdated` accurately.
- **OUTPUT:** Search results file plus an updated reusable pattern record.

## Error Handling

| Problem | Action |
|---|---|
| No MOM tab open | Stop and ask the user to open MyOpenMath in Chrome with Playwriter enabled. |
| `cid` missing from current URL | Halt and report the exact URL so the caller can open the correct course context. |
| Search returns zero rows | Retry in order: remove `questionType`, shorten/synonymize keywords, switch to All Libraries; if still empty, return a no-results report instead of guessing. |
| Search header clicks are blocked | Use keyboard `Enter` on the sortable header, especially for **Times Used**. |
| View-only page redirects to login or outside `/course/` | Halt immediately and ask the user to restore the MOM session. |
| `control` and `qtext` are both empty | Skip that QID and log it as an empty extraction. |
| All extracted questions are empty | Return question metadata plus a note that code extraction failed; do not fabricate patterns. |
| `mom-patterns` knowledge base unavailable | Keep the JSON result, note `libraryUpdated: false`, and report the missing downstream dependency. |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Opening `moddataset.php` without `viewonly=1` | Rebuild the URL with `viewonly=1` and do not proceed until the heading shows `View:`. |
| Clicking visible Save/Preview/Edit controls on a view-only page | Treat all such controls as unsafe and ignore them completely. |
| Using the wrong course context | Re-extract `cid` from the active teacher tab and stay inside that course's question bank. |
| Updating patterns from one question only | Compare several top QIDs first so the summary captures repeated structure, not a one-off implementation. |
| Appending pattern notes without QIDs or usage context | Always store source QIDs, question types, and max Times Used for auditability. |
| Hardcoding old skill-file paths | Use only `.agents/authoring/mom-page-map.md` and `.agents/authoring/mom-patterns.md` references. |

## State Management
- Browser state: `state.momPage`, `state.cid`, `state.searchTopic`, and optional `state.questionType`
- Result artifact: `temp/mom_fact_finder_results.json`
- Resume strategy: if the session stops mid-research, keep any already-extracted QIDs and resume with the remaining ranked candidates instead of re-running the full search immediately
- Safe limits: max 8 question pages per session; 1000 ms minimum between navigations

## Selectors / References
- Search page URL: `https://www.myopenmath.com/course/manageqset.php?cid={cid}`
- View-only code URL: `https://www.myopenmath.com/course/moddataset.php?id={qid}&cid={cid}&viewonly=1`
- Search input: `#search`
- Advanced search toggle: `#advsearchbtn`
- Question type select: `select#search-type`
- Scope picker: `#cursearchtype`
- Library modal frame: `#GB_frame`
- Safe extraction fields: `textarea#control`, `textarea#qtext`, `input#qtype`
- Sorting note: use keyboard activation on the **Times Used** header when `#GB_overlay` interferes
