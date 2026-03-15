---
name: mom-page-map
description: Use when navigating MyOpenMath teacher pages with Playwriter, especially when building direct MOM URLs, moving between course/question/assessment/gradebook views, extracting cid/aid/qid/block IDs, or avoiding fragile UI clicks on native selects, TinyMCE fields, and instructor-only preview tools.
---

# MyOpenMath Page Map

> Navigate MyOpenMath teacher workflows with stable URL construction first and DOM interaction second. This skill preserves the exact teacher-side page map, selector anchors, teacher-vs-student distinctions, and Playwriter-safe navigation patterns needed by MOM authoring, fact-finding, grading, and gradebook-sync skills.

## Overview
- Base site: `https://www.myopenmath.com/`
- Core IDs: `cid` (course), `aid` (assessment), `qid` (question set), `bid` (block DOM id), `path` (block URL id)
- Preferred pattern: construct the correct MOM URL directly instead of relying on brittle menus
- Full URL tables, selector maps, AJAX notes, and editor details live in `references/navigation-patterns.md`

## Prerequisites
- Playwriter connected to a logged-in MyOpenMath tab
- A valid MOM course context with `cid`
- Permission to navigate instructor pages in the target course

## When to Use
- User asks how to get to a specific MyOpenMath teacher page
- Another MOM skill needs exact URL patterns or selector anchors
- A workflow must move between course home, question editor, assessment settings, add/remove questions, or gradebook pages
- Browser automation keeps failing on native dropdowns, block menus, TinyMCE fields, or preview/test pages

## When NOT to Use
- Grading logic on `gradeallq2.php` where the dedicated grading selectors skill should drive DOM details
- Aeries workflows or cross-system sync logic that belongs to `gb-compare`, `gb-new-assignment`, `gb-sync`, or `gb-pipeline`
- Student-facing usage instructions unrelated to instructor automation

## Guardrails

> ⚠️ **Must NOT:**
> - Never lose or rewrite the exact MOM URL patterns; reuse them exactly as documented in `references/navigation-patterns.md`.
> - Never treat `testquestion2.php` as a student page. It is an instructor-only authoring/verification tool.
> - Never treat `blockh{bid}` as the block URL id. DOM ids use `blockh{bid}`; URLs use the hierarchical `path` like `0-1`.
> - Never `.click()` native `<option>` elements inside the course-page **Add An Item** dropdown. Use direct URL navigation or `selectOption()` with a pre-captured navigation wait.
> - Never declare a question working from `testquestion2.php` until Submit returns a **Correct** result.
> - Never set hidden editor fields such as `#qtype` or `#libs` directly when the UI flow is required to keep MOM state consistent.
> - Never assume a hardcoded canvas id or fixed assessment entry point when the page can be reached more safely by URL construction.

## Quick Start
1. Extract `cid` from the current MOM URL, then derive `aid`, `qid`, or block `path` from stable links or `toggleblock(...)` data.
2. Navigate by exact URL first; only use DOM controls when the URL depends on current page state.
3. If the target page writes or validates content, use the page-specific selector and verification notes in `references/navigation-patterns.md`.

## Workflow

### Phase 1: Identify the Current MOM Context
- **INPUT:** Any instructor-side MOM page
- **ACTION:**
  - Read `cid` from `location.href`.
  - Extract `aid` from assessment links or `addassessment2.php?id={aid}`.
  - Extract `qid` from `moddataset.php?id={qid}` or preview links.
  - Extract both block identifiers from `toggleblock(event,'{bid}','{path}')` when working with folders/sections.
- **OUTPUT:** Stable ids for URL construction

```javascript
const url = new URL(state.page.url());
const cid = url.searchParams.get('cid');

const ids = await state.page.evaluate(() => {
  const settings = document.querySelector('a[href*="addassessment2.php"]');
  const aid = settings ? new URL(settings.href).searchParams.get('id') : null;
  return { cid: new URL(location.href).searchParams.get('cid'), aid };
});
```

### Phase 2: Navigate by Direct URL Whenever Possible
- **INPUT:** `cid` plus any page-specific ids
- **ACTION:**
  - Build the exact target URL from the preserved MOM patterns.
  - Prefer direct `goto()` for course tools, question editor pages, assessment settings, block edit pages, gradebook pages, and URL-only routes.
  - Use DOM interaction only when you must discover an id or when the UI performs a stateful action that cannot be reconstructed safely.
- **OUTPUT:** Correct instructor page loaded with fewer fragile clicks

Common examples:

| Task | Stable URL pattern |
|------|--------------------|
| Course home | `course/course.php?cid={cid}` |
| Question editor | `course/moddataset.php?id={qid}&cid={cid}` |
| New question | `course/moddataset.php?cid={cid}` |
| Assessment settings | `course/addassessment2.php?id={aid}&block={block}&cid={cid}` |
| Add/remove questions | `course/addquestions2.php?aid={aid}&cid={cid}` |
| Isolate assignment gradebook | `course/isolateassessgrade.php?cid={cid}&aid={aid}` |
| Grade all FRQ | `course/gradeallq2.php?cid={cid}&aid={aid}` |

For assessment settings reached from the course page, `block={block}` uses the hierarchical block path (`0`, `0-1`, `0-2`, ...) rather than the DOM `bid` / `blockh{bid}` id.

### Phase 3: Use Page-Specific Navigation Patterns
- **INPUT:** Loaded MOM page plus target action
- **ACTION:**
  - On `course.php`, treat **Add An Item** as a native `<select>` and use the safe dropdown rules.
  - For blocks, target the anchor with role `button` named `Options for {Block Name}` or skip menus with direct URLs.
  - On `manageqset.php`, `moddataset.php`, `addassessment2.php`, and `addquestions2.php`, use the preserved selectors for search, edit, save, and add/remove operations.
  - For TinyMCE-backed fields and hidden inputs, follow the editor-specific caveats instead of assuming standard `.fill()` behavior.
- **OUTPUT:** Safe page mutations or stable read-only extraction

Key selectors to keep handy:

| Page | Purpose | Selector / Pattern |
|------|---------|--------------------|
| `course.php` | Add-item dropdown | `#addtype{blk}-{tb}` |
| `course.php` | Block headers | `[id^="blockh"]` |
| `course.php` | Block options trigger | `getByRole('button', { name: 'Options for {Block Name}' })` |
| `manageqset.php` | Search type toggle | `#cursearchtype` |
| `manageqset.php` | Search input | `#search` |
| `moddataset.php` | Description | `textarea#description` |
| `moddataset.php` | Common Control | `textarea#control` |
| `moddataset.php` | Question Text | `textarea#qtext` |
| `addassessment2.php` | Assessment name | `input#name` |
| `addassessment2.php` | Summary / Intro | `textarea#summary`, `textarea#intro` |
| `addquestions2.php` | Add button | `role=button[name="Add"]` |
| `testquestion2.php` | Dynamic draw canvas | `canvas[id^="canvas"]` |

### Phase 4: Respect Teacher vs Student Views and Validation Rules
- **INPUT:** Assessment or question-verification workflow
- **ACTION:**
  - Use `testquestion2.php?cid={cid}&qsetid={qid}` for instructor preview and author verification.
  - Use `assess2/?cid={cid}&aid={aid}` only when you explicitly need the student-facing assessment view.
  - Use `moasettings.php?cid={cid}&aid={aid}` for per-student settings/dates/exceptions.
  - On `testquestion2.php`, submit an answer and confirm MOM returns **Correct** before reporting success.
- **OUTPUT:** Correct page choice and verified authoring result

```javascript
await state.page.goto(
  `https://www.myopenmath.com/course/testquestion2.php?cid=${cid}&qsetid=${qid}`,
  { waitUntil: 'domcontentloaded' }
);
await state.page.locator('input[type="button"][value="Submit"]').click();
const resultText = await state.page.locator('.scoredisplay, .correct, .incorrect').first().textContent();
if (!/1\/1|Correct/i.test(resultText || '')) {
  throw new Error(`Preview validation failed: ${resultText || 'no result shown'}`);
}
```

## Error Handling

| Problem | Action |
|---------|--------|
| MOM page has `cid` but no obvious `aid` | Read the nearest assessment settings/add-questions link and parse the `id` or `aid` parameter from the href. |
| Clicking an Add An Item option throws CDP `-32000` | Stop clicking `<option>` elements; use direct URL navigation or `selectOption()` with a navigation wait. |
| Block URL actions fail because `id=blockh24` was used | Re-extract the hierarchical `path` from `toggleblock(event,'{bid}','{path}')`; URL params use `path`, not `blockh{bid}`. |
| TinyMCE text does not update after `.fill()` | Use the raw textarea or editor iframe strategy documented in `references/navigation-patterns.md`. |
| Draw-question validation returns incorrect | Re-check the parsed equation, implicit coefficient cases, and actual canvas dimensions before retrying. |
| Grade-all page cannot be found from the main gradebook UI | Build `course/gradeallq2.php?cid={cid}&aid={aid}` directly; it is not linked from the main gradebook header. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Treating `addassessment2.php` without `id={aid}` as an edit page | Without `id`, MOM opens the **new assessment** flow. |
| Confusing `aid` with `id` on assessment settings links | In `addassessment2.php?id={aid}&...`, the `id` parameter **is** the assessment id. |
| Assuming `#qtype` can be filled directly | Use the question-type picker UI so MOM updates all dependent state. |
| Using `\(`...`\)` for inline MOM math | Use backticks, e.g. `` `y = 2x + 3` ``. |
| Hardcoding a draw-question canvas id like `#canvas27` | Always target `canvas[id^="canvas"]`. |
| Clicking Submit before both twopoint canvas clicks are placed | Two distinct clicks are required before submit. |

## Selectors / References
- Full URL tables, navigation formulas, block DOM patterns, editor selector maps, TinyMCE notes, teacher/student page differences, AJAX behavior, and draw-question validation details live in `references/navigation-patterns.md`.
- If another MOM skill needs a page route, copy the exact pattern from that reference instead of rewriting it from memory.
