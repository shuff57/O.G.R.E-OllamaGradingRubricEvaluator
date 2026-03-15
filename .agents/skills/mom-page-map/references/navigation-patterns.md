# MyOpenMath Navigation Patterns

Preserve these patterns exactly when building or navigating teacher-side MOM flows.

## URL Patterns

All URLs are on `https://www.myopenmath.com/`.

### Course
| Page | URL |
|------|-----|
| Course Home | `course/course.php?cid={cid}` |
| Course Home (folder) | `course/course.php?folder={fid}&cid={cid}` |
| Course Settings | `admin/forms.php?action=modify&id={cid}&cid={cid}` |
| Roster | `course/listusers.php?cid={cid}` |
| Calendar | `course/showcalendar.php?cid={cid}` |
| Messages | `msgs/msglist.php?cid={cid}` |
| Reports | `course/coursereports.php?cid={cid}` |
| Course Map | `course/coursemap.php?cid={cid}` |
| Copy Items | `course/copyitems.php?cid={cid}` |

### Questions
| Page | URL |
|------|-----|
| Question Set Management | `course/manageqset.php?cid={cid}` |
| Create New Question | `course/moddataset.php?cid={cid}` |
| Edit Existing Question | `course/moddataset.php?id={qid}&cid={cid}` |
| View Code (read-only) | `course/moddataset.php?id={qid}&cid={cid}&viewonly=1` |
| Copy as Template | `course/moddataset.php?id={qid}&cid={cid}&template=true` |
| Libraries | `course/managelibs.php?cid={cid}` |

### Assessments
| Page | URL |
|------|-----|
| Assessment Settings (edit) | `course/addassessment2.php?id={aid}&block={block}&cid={cid}` |
| Assessment Settings (from gradebook) | `course/addassessment2.php?id={aid}&cid={cid}&from=gb` |
| Create New Assessment | `course/addassessment2.php?block={block}&cid={cid}` |
| Add/Remove Questions | `course/addquestions2.php?aid={aid}&cid={cid}` |
| Per-student settings (dates, exceptions) | `course/moasettings.php?cid={cid}&aid={aid}` |
| Take Assessment (student view) | `assess2/?cid={cid}&aid={aid}` |
| Mass Change Assessments | `course/chgassessments2.php?cid={cid}` |
| Mass Change Dates | `course/masschgdates.php?cid={cid}` |
| Time Shift | `course/timeshift.php?cid={cid}` |

### Gradebook & Grading
| Page | URL |
|------|-----|
| Gradebook (roster view) | `course/gradebook.php?cid={cid}` |
| Isolate Assignment Gradebook | `course/isolateassessgrade.php?cid={cid}&aid={aid}` |
| Grade All FRQ (essay/file) | `course/gradeallq2.php?cid={cid}&aid={aid}` |
| Item Analysis | `course/gb-itemanalysis2.php?cid={cid}&aid={aid}` |

## ID Extraction Rules
- **`cid`**: present in every course-side page URL.
- **`aid`**: extract from:
  - `addassessment2.php?id={aid}&...`
  - `addquestions2.php?aid={aid}&cid={cid}`
  - gradebook settings links where the `id` param is the `aid`
- **`qid`**: extract from `moddataset.php?id={qid}` or preview/edit links.
- **Block ids**:
  - DOM id = `blockh{bid}`
  - URL id = hierarchical `path` like `0-1`

```javascript
const ids = await state.page.evaluate((name) => {
  const link = Array.from(document.querySelectorAll('[id^="blockh"]'))
    .find((el) => el.textContent.trim() === name);
  if (!link) return null;
  const m = (link.getAttribute('onclick') || '').match(/toggleblock\(event,'(\d+)','([^']+)'\)/);
  return m ? { elemId: link.id, bid: m[1], path: m[2] } : null;
}, 'TEST SECTION');
```

## Course Page Navigation (`course.php`)

### Add An Item dropdown = native `<select>`

**Critical AJAX/native-widget rule:** the `<select>` has a layout box, but its `<option>` children do not. Clicking an `<option>` directly causes CDP error `-32000: Node does not have a layout object`.

Safe options:
1. **Preferred:** build the direct destination URL.
2. **Acceptable:** call `selectOption()` and capture navigation **before** the selection.

#### Select id pattern
```
addtype{blk}-{tb}
  blk = 0     → course-level
  blk = 0-1   → inside block 1
  tb  = t     → top
  tb  = b     → bottom
```

#### URL formula from `additem()`
`add{type}.php?block={blk}&tb={tb}&cid={cid}`

#### Supported values
| Label | `value` | Destination |
|-------|---------|-------------|
| Add Assessment | `assessment2` | `addassessment2.php` |
| Add Inline Text | `inlinetext` | `addinlinetext.php` |
| Add Link | `linkedtext` | `addlinkedtext.php` |
| Add Forum | `forum` | `addforum.php` |
| Add Wiki | `wiki` | `addwiki.php` |
| Add Drill | `drillassess` | `adddrillassess.php` |
| Add Block | `block` | `addblock.php` |
| Add Calendar | `calendar` | `addcalendar.php` |

```javascript
const cid = new URL(state.page.url()).searchParams.get('cid');
await state.page.goto(
  `https://www.myopenmath.com/course/addassessment2.php?block=0-2&tb=t&cid=${cid}`,
  { waitUntil: 'domcontentloaded' }
);

const navPromise = state.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
await state.page.locator('#addtype0-t').selectOption('assessment2');
await navPromise;
```

### Block DOM and navigation
- Find block headers with `[id^="blockh"]`.
- Extract `bid` and `path` from `toggleblock(event,'{bid}','{path}')`.
- Open a block menu with `getByRole('button', { name: 'Options for {Block Name}' })`.
- Hidden blocks show `<b><i>` wrapping and/or `.instrdates` text `Hidden`.

| State | Title style | `instrdates` text |
|-------|-------------|-------------------|
| Visible | `<b>` only | Empty or date range |
| Hidden | `<b><i>` | `Hidden` |
| Date-restricted | `<b>` | Date range |

Direct URLs:
- Isolate block: `course/course.php?cid={cid}&folder={path}`
- Modify block: `course/addblock.php?cid={cid}&id={path}`
- Delete confirmation: `course/deleteblock.php?cid={cid}&id={path}&bid={bid}&remove=ask`

## Question Set Management (`manageqset.php`)

| Purpose | Selector / Pattern | Notes |
|---------|--------------------|-------|
| Search type toggle | `#cursearchtype` | Opens libraries/assessment scope menu |
| Search input | `#search` | Query text |
| Search button | `role=button[name="Search"]` | Runs current search |
| Advanced search | `#advsearchbtn` | Expands filters |
| Add New Question | `role=button[name="Add New Question"]` | Goes to `moddataset.php?cid={cid}` |
| With Selected | `#dropdownMenuWithsel` | Transfer/delete/library/rights/license |
| Row checkbox | `checkbox[id^="qo"]` | `qo0`, `qo1`, ... |
| Preview | `role=button[name="Preview"]` | Inline preview |

Per-question More menu URLs:
- View Code → `moddataset.php?id={qid}&cid={cid}&viewonly=1`
- Template(Copy) → `moddataset.php?id={qid}&cid={cid}&template=true`
- Edit → `moddataset.php?id={qid}&cid={cid}`

## Question Editor (`moddataset.php`)

### Key fields
| Field | Selector | Notes |
|-------|----------|-------|
| Description | `textarea#description` | Question name |
| Use Rights | `select#userights` | Sharing permissions |
| License | `select#license` | Rights metadata |
| Additional Attribution | `input#addattr` | Optional attribution |
| Libraries | `input#libs` | Hidden; managed by UI button only |
| Question type | `input#qtype` | Hidden; set by picker JS only |
| Common Control | `textarea#control` | Server-side PHP-like logic |
| Question Text | `textarea#qtext` | Student-facing content |
| Detailed Solution | `textarea#solution` | Post-submit solution |
| Image upload | `input#imgfile` | With `#newimgvar` and `#newimgalt` |

### Question type picker
- Trigger: the current-type button (for example `Number ▼`)
- **Do not** fill `#qtype` directly.
- Important preserved note: matrix-equation / matrix-rref authoring workflows often require **Multipart**.

### Save controls
- `role=button[name="Save"]`
- `role=button[name="Quick Save and Preview"]`

### MOM authoring syntax gotchas
```php
$a = rands(1, 10, 1)
$arr = diffrands(1, 20, 4)
$anstypes = array("matrix", "file")
$answer[0] = ...
$answersize[0] = "3,1"
$scoremethod[1] = "takeanything"
```

- Inline math uses backticks, e.g. `` `y = 2x + 3` ``.
- `\(` and `\)` render literally in MOM question text.

## Assessment Settings (`addassessment2.php`)

### Key selectors
| Field | Selector / Name | Notes |
|-------|------------------|-------|
| Assessment Name | `input#name` | Title |
| Summary | `textarea#summary` | TinyMCE-backed rich text |
| Intro / Instructions | `textarea#intro` | TinyMCE-backed rich text |
| Show / Hide | `name="avail"` radios | Visibility |
| Start date | `name="sdate"` | `MM/DD/YYYY` |
| Start time | `name="stime"` | `HH:MM AM/PM` |
| Due date | `name="edate"` | `MM/DD/YYYY` |
| Due time | `name="etime"` | `HH:MM AM/PM` |
| Copy settings from | `select#copyfrom` | Another assessment |
| Display style | `select#displaymethod` | One question/all at once/etc. |
| Submission type | `select#subtype` | Homework/quiz style |
| Versions per question | `spinbutton#defregens` | Randomized versions |
| Tries per version | `spinbutton#defattempts` | Attempts |
| Gradebook category | `select#gbcategory` | Gradebook mapping |

Preserved TinyMCE rule:
- `.fill()` can silently fail on Summary and Intro.
- Use raw textarea manipulation or editor/iframe-aware injection, then verify the underlying field value.

Top link preserved:
- `Add/Remove Questions` → `addquestions2.php?aid={aid}&cid={cid}`

## Add/Remove Questions (`addquestions2.php`)

| Purpose | Selector / Pattern | Notes |
|---------|--------------------|-------|
| Current question checkbox | `checkbox[id^="qc"]` | `qc0`, `qc1`, ... |
| Move order dropdown | `combobox[id="{n}"]` | Row position |
| Per-question points | `spinbutton[id^="pts-"]` | Override points |
| Default points | `spinbutton#defpts` | Applies to new additions |
| Actions menu | `role=button[name="⋮"]` | Per-row options |
| Remove | `role=button[name="Remove"]` | Batch remove |
| Group | `role=button[name="Group"]` | Create pick-N groups |
| Change Settings | `role=button[name="Change Settings"]` | Batch settings |
| Bottom search type | `#cursearchtype` | Same pattern as `manageqset.php` |
| Add | `role=button[name="Add"]` | Adds selected questions |
| Add options | `role=button[name="Options for adding ▲"]` | Add behavior controls |
| Done | `role=link[name="Done"]` | Returns to course page |

## Gradebook and Grading

### Gradebook (`gradebook.php`)
- Main page: `course/gradebook.php?cid={cid}`
- Assignment headers: `th[data-pts]`
- Settings link pattern: `addassessment2.php?id={aid}&cid={cid}&from=gb`
- Isolate link pattern: `isolateassessgrade.php?cid={cid}&aid={aid}`

### Isolate Assignment Gradebook (`isolateassessgrade.php`)
- Single-assignment view for per-student scores and exceptions
- Links:
  - `gb-itemanalysis2.php?cid={cid}&aid={aid}`
  - back to `gradebook.php?gbmode=1011&cid={cid}`

### Grade All FRQ (`gradeallq2.php`)
- URL: `course/gradeallq2.php?cid={cid}&aid={aid}`
- Reach it by clicking student score cells on the isolate page or by constructing the URL directly.
- It is **not directly linked** from the main gradebook header.

## Teacher vs Student Views
- **Instructor preview / verification:** `course/testquestion2.php?cid={cid}&qsetid={qid}`
- **Student assessment-taking view:** `assess2/?cid={cid}&aid={aid}`
- **Per-student dates/exceptions:** `course/moasettings.php?cid={cid}&aid={aid}`

## `testquestion2.php` Validation Rules

### Required rule
After answering a previewed question, click **Submit** and confirm MOM shows **Correct** before calling the question working.

### Key selectors
| Purpose | Selector / Pattern |
|---------|--------------------|
| Question text | `.qtext` |
| Answer area | `#answerarea` |
| Draw canvas | `canvas[id^="canvas"]` |
| Submit | `input[type="button"][value="Submit"]` |
| Result | `.scoredisplay, .correct, .incorrect` |
| New Version | `input[type="button"][value="New Version"]` |

### Draw-question notes (`$answerformat = "twopoint"`)
- The canvas id is dynamic; always use `canvas[id^="canvas"]`.
- Standard grid example: `$grid = "-6,6,-6,6,1,1,300,300"` → 298×298 canvas.

```javascript
const canvasW = 298, canvasH = 298;
const xMin = -6, xMax = 6, yMin = -6, yMax = 6;

function gridToPixel(gx, gy) {
  return {
    x: Math.round((gx - xMin) / (xMax - xMin) * canvasW),
    y: Math.round((yMax - gy) / (yMax - yMin) * canvasH),
  };
}

function twoPointsOnLine(m, b) {
  const x1 = 0;
  const y1 = m * x1 + b;
  const x2 = Math.abs(m) <= 3 ? 1 : (m > 0 ? -1 : 1);
  const y2 = m * x2 + b;
  return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
}
```

Preserved edge case:
- When parsing rendered equations, `m = 1` may appear as `x`, not `1x`, and `m = -1` may appear as `-x`.

Required result interpretation:

| Result | Meaning | Action |
|--------|---------|--------|
| `Score: 1/1` or `.correct` present | Question works | Proceed |
| `Score: 0/1` or `.incorrect` present | Question or answer math is wrong | Debug before proceeding |
| No result shown | Submit or canvas interaction failed | Re-check selectors and pixel math |

## High-value mistakes to avoid

| Mistake | Fix |
|---------|-----|
| Editing an assessment via `addassessment2.php` without `id={aid}` | Include `id` or MOM opens a new-assessment flow. |
| Filling TinyMCE Summary/Intro like normal textareas | Use a TinyMCE-aware write path and verify saved value. |
| Clicking Add An Item `<option>` nodes | Use direct URL navigation or `selectOption()` with navigation wait. |
| Using `blockh{N}` in block URLs | URL params require the block `path` such as `0-1`. |
| Clicking the block options image itself | Click the enclosing `role=button` named `Options for {Block Name}`. |
| Hardcoding `#canvas27` | Use `canvas[id^="canvas"]`. |
