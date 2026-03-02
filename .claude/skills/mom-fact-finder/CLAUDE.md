# MOM Fact-Finder: Discover Patterns from the Question Bank

> **When to use**: You need to write a MOM question on a topic that `mom-frq` doesn't cover, or you want to see real examples of a question type in production before writing your own. This skill searches the live MOM question bank, reads actual question code, and synthesizes patterns.

> **Relationship to other skills**:
> - `mom-frq` — static reference (syntax, answer types, loadlibrary calls). Check it FIRST.
> - `mom-patterns` — living pattern library built by THIS skill. Check it SECOND (before launching browser).
> - `mom-fact-finder` (this skill) — last resort: browser-based discovery when neither above covers the topic.

---

## READ-ONLY SAFETY RULES (READ BEFORE ANYTHING ELSE)

> ⛔ **These rules are absolute. No exceptions.**

1. **ONLY navigate to these two URL patterns** (and no others):
   - `https://www.myopenmath.com/course/manageqset.php?cid={cid}` — search page
   - `https://www.myopenmath.com/course/moddataset.php?id={qid}&cid={cid}&viewonly=1` — view code
2. **NEVER navigate to edit mode** — the `viewonly=1` parameter MUST always be present on question pages.
3. **NEVER click**: Save, Quick Save, Preview, Delete, Edit, or any form submission button.
   - ⚠️ Save buttons ARE visible on viewonly pages and appear active — they are NOT safe to click.
   - Content protection is via `disabled`/`readOnly` attributes on textareas, not button removal.
4. **NEVER browse to another course's question bank** — only use the `cid` from the currently-active MOM tab.
5. **NEVER modify** `mom-frq/CLAUDE.md` or `mom-page-map/CLAUDE.md`.
6. **Rate limit**: minimum `waitForTimeout(1000)` between page navigations. Max 8 question pages per session.
7. **Confirm viewonly** before extracting: URL contains `viewonly=1` AND page heading contains "View:".

---

## Input Contract

Callers pass these parameters (in the task prompt or as structured context):

| Parameter | Required | Description |
|-----------|----------|-------------|
| `topic` | **YES** | Natural language description of the question topic (e.g., "linear regression", "hypothesis testing FRQ", "expected value") |
| `questionType` | no | MOM question type filter (e.g., `essay`, `multipart`, `number`, `choices`) — see full list in Advanced Search section |
| `library` | no | Library name to search within (e.g., `"All Libraries"`, `"OpenIntro Statistics"`) — defaults to All Libraries |
| `keywords` | no | Additional search keywords beyond topic (comma-separated) |
| `refresh` | no | If `true`, skip pattern library cache and always do fresh browser search |

**Example invocation** (from a parent task prompt):
```
Use mom-fact-finder to find patterns for: topic="confidence interval for proportions", questionType="essay", refresh=false
```

---

## Output Contract

Write results to `temp/mom_fact_finder_results.json` (create `temp/` dir if needed):

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
      "commonControl": "...truncated to 80 lines...",
      "questionText": "...truncated to 40 lines..."
    }
  ],
  "patternSummary": {
    "keyPatterns": ["bullet 1", "bullet 2"],
    "functionCalls": ["loadlibrary('datasummary')", "..."],
    "suggestedApproach": "..."
  },
  "libraryUpdated": true
}
```

After writing the temp file, also **update `mom-patterns/CLAUDE.md`** (see Pattern Library Update section).

---

## Step 0 — Library-First Lookup

Before opening the browser:

1. Read `.claude/skills/mom-patterns/CLAUDE.md` (load it or read it directly).
2. Search for a section heading matching the topic (case-insensitive, partial match OK).
3. **If a match exists AND `refresh` is not `true`**:
   - Return the cached pattern from the library as your output.
   - Write `temp/mom_fact_finder_results.json` with `"source": "library"` and the cached pattern.
   - **Stop here — do NOT launch the browser.**
4. **If no match OR `refresh=true`**: proceed to Step 1 (Browser Search).

---

## Step 1 — Find or Open MOM Tab

```js
// Set state.searchTopic from the caller's 'topic' input parameter
// (The caller passes this via their task prompt — extract it and assign here before running)
// e.g., state.searchTopic = 'linear regression'; // set by caller
if (!state.searchTopic) throw new Error('state.searchTopic must be set before running this workflow. Assign: state.searchTopic = topic from input.');

// Find an existing MOM teacher tab
let momPage = context.pages().find(p => p.url().includes('myopenmath.com'));
if (!momPage) {
  // No MOM tab open — create one and navigate to manageqset
  momPage = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage());
  // CID is unknown — ask the caller to provide it, or stop with an error:
  throw new Error('No MyOpenMath tab found. Open MOM in Chrome with Playwriter enabled, then retry.');
}
state.momPage = momPage;

// Extract cid from current URL
const cidMatch = state.momPage.url().match(/[?&]cid=(\d+)/);
if (!cidMatch) throw new Error('Cannot extract cid from MOM URL: ' + state.momPage.url());
state.cid = cidMatch[1];
console.log('Using cid:', state.cid);
```

---

## Step 2 — Navigate to Question Set Management

```js
await state.momPage.goto(
  `https://www.myopenmath.com/course/manageqset.php?cid=${state.cid}`,
  { waitUntil: 'domcontentloaded' }
);
await state.momPage.waitForTimeout(1000);
console.log('URL:', state.momPage.url());
await snapshot({ page: state.momPage }).then(console.log);
```

---

## Step 3 — Set Search Scope (Topic-Specific Library)

> **Goal**: Scope the search to the MOM library that matches the caller's topic.
> Use topic-specific subject libraries (e.g. Statistics > Hypothesis Testing), NOT textbook-organized ones.

### Option A — Select a Topic Library via the Picker (PREFERRED)

```js
// 1. Open scope dropdown and click 'Select Libraries...'
await state.momPage.locator('#cursearchtype').click();
await state.momPage.waitForTimeout(300);
await state.momPage.locator('a[onclick*="libselect"]').click();
await state.momPage.waitForTimeout(1500);

// 2. The GB_window dialog is now open — an iframe loads libtree3.php
// Access it via frameLocator (required for clicks inside the iframe):
const gbFrame = state.momPage.frameLocator('#GB_frame');

// 3. Navigate the tree to the relevant subject category.
//    ALWAYS expand a parent node BEFORE trying to check a child:
//    Example path: Statistics (lib436) → Hypothesis Testing one pop (lib466) → children
await gbFrame.locator('[data-id="lib436"] > .tree-item-content > button.tree-expander').click();
await state.momPage.waitForTimeout(1000);

// 4. If the sub-node also needs expanding (no checkbox visible yet):
await gbFrame.locator('[data-id="lib466"] > .tree-item-content > button.tree-expander').click();
await state.momPage.waitForTimeout(1000);

// 5. Select the leaf library by clicking its tree-item-content:
//    Leaf nodes have a checkbox (<input type='checkbox'>) — categories do NOT.
//    Clicking the tree-item-content toggles aria-checked and adds to selectedLibs.
await gbFrame.locator('[data-id="lib{N}"] > .tree-item-content').click();

// 6. Click 'Use Libraries' — triggers setlib() → parent scope updates + auto-refresh:
await state.momPage.locator('#GB_footer button.primary').click();
await state.momPage.waitForTimeout(1500);
// Results table auto-refreshes. No need to click Search again.
// scope button now shows 'In Libraries ▼', #libnames shows the selected library name.
```

### Known Topic → Library Map

> The full topic→data-id map is maintained as a tiered reference skill. Load only what you need:
>
> 1. **Read** `.claude/skills/mom-lib-map/CLAUDE.md` (the index, ~50 lines)
> 2. **Match** the caller's `topic` to a row in the Subject Routing Table via the `Representative Topics` column (fuzzy match is fine)
> 3. **Read** only the matching subject file (e.g. `.claude/skills/mom-lib-map/statistics.md`)
> 4. **Extract** the `data-id` for the specific topic from the subject file's table
> 5. **Use** that `data-id` in the tree picker below (Option A)
>
> **Cross-subject topics** (Regression, Sequences, Complex numbers, Geometry/area): the index lists all matching subjects — load the primary first; if results are sparse, check the secondary.
>
> **If topic is not found in any subject file**:
> 1. Expand the top-level subject category in the tree picker.
> 2. Read child labels — match to the caller's topic.
> 3. Expand the matching child; check if children have checkboxes.
> 4. Select all relevant leaf nodes → click 'Use Libraries'.
### Option B — All Libraries (fallback if no specific library found)

```js
// Use when the topic doesn't map to a known subject library
await state.momPage.locator('#cursearchtype').click();
await state.momPage.waitForTimeout(300);
await state.momPage.locator('a[onclick*="alllibs"]').click();
await state.momPage.waitForTimeout(800);
// Then proceed to Step 5 (search) — results will be from the whole community
```

### Tree Selection Helper — finding which nodes have checkboxes

```js
// After expanding a node, check which children are directly selectable:
const libFrame = state.momPage.frames().find(f => f.url().includes('libtree'));
const selectableChildren = await libFrame.evaluate((parentId) => {
  const parent = document.querySelector(`[data-id="${parentId}"]`);
  return [...(parent?.querySelectorAll(':scope > ul li.tree-item') || [])]
    .map(li => ({
      dataId: li.getAttribute('data-id'),
      label: li.querySelector('.tree-label')?.textContent?.trim(),
      selectable: !!li.querySelector(':scope > .tree-item-content input[type="checkbox"]'),
      hasChildren: !li.querySelector(':scope > .tree-item-content .tree-expander.no-children')
    }));
}, 'lib436'); // replace with actual parent data-id
console.log('Children:', JSON.stringify(selectableChildren));
```

---

## Step 4 — Apply Question Type Filter (if `questionType` provided)

```js
// Open advanced search panel
await state.momPage.locator('#advsearchbtn').click();
await state.momPage.waitForTimeout(500);

// Set type filter — map caller's questionType to the value from the table below
// e.g., 'essay' → 'essay', 'multiple choice' → 'choices'
const questionTypeValue = state.questionType || 'essay'; // use state.questionType set from input
await state.momPage.selectOption('select#search-type', questionTypeValue);
```

**Question type values** (use the `value` column in `select#search-type`):

| User says | `select#search-type` value |
|-----------|---------------------------|
| essay / free response / FRQ | `essay` |
| multiple choice | `choices` |
| multiple answer / checkbox | `multans` |
| number / numeric | `number` |
| multipart | `multipart` |
| matching | `matching` |
| matrix | `matrix` |
| interval | `interval` |
| N-tuple / point / vector | `ntuple` |
| calculated | `calculated` |
| string | `string` |
| file upload | `file` |
| drawing | `draw` |
| conditional | `conditional` |
| chemical equation | `chemeqn` |

---

## Step 5 — Search

```js
// Clear previous search and type new term
await state.momPage.locator('#search').fill('');
await state.momPage.locator('#search').type(state.searchTopic);
await state.momPage.locator('role=button[name="Search"]').first().click();
await state.momPage.waitForTimeout(2000); // wait for results
await snapshot({ page: state.momPage, search: /result|found|showing/i }).then(console.log);
```

If the results table is empty, broaden the search: remove `questionType` filter, try a shorter keyword, or switch to "All Libraries".

---

## Step 6 — Sort by Times Used (Descending)

⚠️ **Use keyboard Enter, NOT mouse click** — a `#GB_overlay` div may block mouse clicks temporarily.

```js
// Press Enter TWICE on the "Times Used" header to sort descending
await state.momPage.locator('table th:has-text("Times Used")').press('Enter');
await state.momPage.waitForTimeout(1500);
await state.momPage.locator('table th:has-text("Times Used")').press('Enter');
await state.momPage.waitForTimeout(1500);
```

---

## Step 7 — Extract Top Questions from Results Table

```js
const rows = await state.momPage.evaluate(() => {
  return [...document.querySelectorAll('table tbody tr')]
    .filter(r => r.querySelectorAll('td').length > 3)
    .map(r => {
      const cells = [...r.querySelectorAll('td')];
      return {
        desc: cells[1]?.textContent?.trim(),
        qid: cells[4]?.textContent?.trim(),  // matches output contract schema
        id: cells[4]?.textContent?.trim(),
        type: cells[5]?.textContent?.trim(),
        timesUsed: parseInt(cells[6]?.textContent?.trim() || '0', 10)
      };
    })
    .filter(r => r.qid && /^\d+$/.test(r.qid)) // only rows with numeric QIDs
    .sort((a, b) => b.timesUsed - a.timesUsed); // highest first
});

// Take top 5-8
const topQuestions = rows.slice(0, 7);
console.log('Top questions:', JSON.stringify(topQuestions, null, 2));
```

If `rows` is empty, try:
1. Removing the question type filter and re-searching.
2. Switching to "All Libraries" scope.
3. Trying a shorter or synonym search term.
4. Report no results found with a suggestion.

---

## Step 8 — Extract Code from Viewonly Pages

For each question in `topQuestions`:

```js
for (const q of topQuestions) {
  // SAFETY CHECK: only proceed if we have a valid numeric QID
  if (!q.qid || !/^\d+$/.test(q.qid)) continue;

  const viewonlyUrl = `https://www.myopenmath.com/course/moddataset.php?id=${q.qid}&cid=${state.cid}&viewonly=1`;
  await state.momPage.goto(viewonlyUrl, { waitUntil: 'domcontentloaded' });
  await state.momPage.waitForTimeout(1000);

  // CONFIRM viewonly mode before extracting
  const pageUrl = state.momPage.url();
  const pageHeading = await state.momPage.evaluate(() =>
    document.querySelector('h2, h1')?.textContent?.trim() || ''
  );
  if (!pageUrl.includes('viewonly=1') || !pageHeading.includes('View:')) {
    console.warn(`QID ${q.qid}: Not in viewonly mode \u2014 skipping. URL: ${pageUrl}`);
    continue;
  }

  // Extract code
  const control = await state.momPage.evaluate(() =>
    document.querySelector('textarea#control')?.value || ''
  );
  const qtext = await state.momPage.evaluate(() =>
    document.querySelector('textarea#qtext')?.value || ''
  );
  const qtype = await state.momPage.evaluate(() =>
    document.querySelector('input#qtype')?.value || ''
  );

  if (!control && !qtext) {
    console.warn(`QID ${q.qid}: Both control and qtext empty \u2014 skipping.`);
    continue;
  }

  // Truncate to limits
  const controlLines = control.split('\n');
  const qtextLines = qtext.split('\n');
  q.commonControl = controlLines.slice(0, 80).join('\n') + (controlLines.length > 80 ? '\n// [truncated]' : '');
  q.questionText = qtextLines.slice(0, 40).join('\n') + (qtextLines.length > 40 ? '\n<!-- [truncated] -->' : '');
  q.qtype = qtype;

  console.log(`QID ${q.qid}: extracted ${controlLines.length} control lines, ${qtextLines.length} qtext lines`);

  // Rate limit between navigations
  await state.momPage.waitForTimeout(1000);
}
```

---

## Step 9 — Session Expiry Detection

After each navigation, check for login redirect:

```js
const currentUrl = state.momPage.url();
if (currentUrl.includes('/login') || currentUrl.includes('index.php') || !currentUrl.includes('myopenmath.com/course/')) {
  throw new Error('MOM session expired or redirected to login. URL: ' + currentUrl + '\nAsk user to log back in and retry.');
}
```

---

## Step 10 — Synthesize Pattern

After extracting code from all questions, analyze the examples and produce a `patternSummary`:

1. **Identify common patterns** across the extracted code:
   - Which `loadlibrary()` calls appear? (e.g., `loadlibrary('datasummary')`)
   - What `$anstypes` are used?
   - Are there common variable naming conventions?
   - What rubric structures appear in essay questions?
   - What scoring methods (`$scoremethod`, `$scorevalue`) are used?
   - Any functions or techniques NOT documented in `mom-frq`?

2. **Write `keyPatterns`** — 3-5 bullet points describing what these questions do.

3. **Write `functionCalls`** — list every `loadlibrary()` and special function call found across all examples.

4. **Pick the best single example** (`bestExample`) — the one with the highest Times Used AND most illustrative code.

5. **Write `suggestedApproach`** — 2-3 sentence guidance for writing a similar question.

---

## Step 11 — Write Output File

```js
const fs = require('node:fs');
const path = require('node:path');

// Ensure temp/ exists
const tempDir = path.resolve('temp'); // relative to project root
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const result = {
  topic: state.searchTopic,
  searchDate: new Date().toISOString().slice(0, 10),
  source: 'browser',
  examples: topQuestions.filter(q => q.commonControl),
  patternSummary: {
    keyPatterns: ['...'], // fill from synthesis
    functionCalls: ['...'],
    suggestedApproach: '...'
  },
  libraryUpdated: false // will update to true after Step 12
};

fs.writeFileSync(
  path.join(tempDir, 'mom_fact_finder_results.json'),
  JSON.stringify(result, null, 2)
);
console.log('Results written to temp/mom_fact_finder_results.json');
```

---

## Step 12 — Update Pattern Library

Read `.claude/skills/mom-patterns/CLAUDE.md`, find or create the section for this topic, write the new entry, and save. 

### Entry Format (MUST follow exactly):

```markdown
## [Topic Name]
**Added**: YYYY-MM-DD | **Sources**: QID #1234, #5678, #9012 | **Times Used (max)**: 6591
**Question Types**: essay, multipart | **Libraries**: `datasummary`, `stats`

### Key Patterns
- [Pattern bullet 1 — what these questions do that mom-frq doesn't document]
- [Pattern bullet 2]
- [Pattern bullet 3]
- [Pattern bullet 4 — optional]
- [Pattern bullet 5 — optional]

### Best Code Example (QID #1234, N uses)
```php
[Best single code example, truncated to 80 lines for control, 40 lines for qtext]
```

### Extracted Function Calls
- `loadlibrary('name')` — description of what it provides
- [other functions found]

---
```

### Update Protocol

```
1. Read the full contents of `.claude/skills/mom-patterns/CLAUDE.md`
2. Count current lines.
3. If adding this section would exceed 800 lines:
   - Find the OLDEST section (earliest "Added" date) with fewer than 5 bullet references
   - Compress that section to a 3-line summary:
     ## [Topic] (summarized)
     **Added**: YYYY-MM-DD | **Types**: ... | Summarized: [key insight in 1 sentence]
     ---
4. Find the "## Patterns" heading or "<!-- PATTERNS -->" marker.
5. Check if a section for this topic already exists:
   - If YES and `refresh=true`: REPLACE the existing section entirely.
   - If YES and `refresh=false`: SKIP (library already has this topic).
   - If NO: APPEND the new section after the last existing pattern.
6. Update the "Topic Index" section to add/update this topic.
7. Update the "Last Updated" and "Total Entries" in the header.
8. Write the full updated file back.
9. Verify line count is ≤ 800.
```

**DO NOT** truncate or modify any section you are not updating. Preserve ALL existing entries exactly.

---

## Error Handling

| Situation | Action |
|-----------|--------|
| No MOM tab open | Throw error asking user to open MOM in Chrome with Playwriter enabled |
| Can't extract `cid` from URL | Throw error with current URL for debugging |
| Search returns 0 results | Log warning, try: (1) remove type filter, (2) shorter keywords, (3) "All Libraries" scope. If still 0, return empty result with `"noResultsFound": true` |
| Viewonly page redirects to login | Throw session-expiry error with URL, ask user to log back in |
| `textarea#control` is empty for a question | Skip that question, log `QID {id}: empty control — skipped` |
| All questions have empty control | Return early with extracted question text only, note in output |
| Pattern library update would exceed 800 lines | Compress oldest entry first, then write new entry |
| `mom-patterns/CLAUDE.md` file not found | Proceed without library update, note in output; do not create it here |
