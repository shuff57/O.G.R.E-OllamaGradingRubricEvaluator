# MyOpenMath Teacher Page Map

Complete URL and DOM reference for the MyOpenMath teacher interface. Covers navigation, question creation/editing, assessment management, and gradebook. Companion to `grade-selectors.md` (grading page) and `gb-compare` (gradebook roster view).

---

## URL Patterns

All URLs are on `https://www.myopenmath.com/`. Replace `{cid}` with the course ID (visible in every page URL).

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
| Create New Assessment | `course/addassessment2.php?block={block}&cid={cid}` (no `id`) |
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

---

## Course Home Page (`course.php`)

### Instructor Navigation Sidebar
```
Communication: Messages | Forums
Tools: Roster | Gradebook | Calendar | Course Map | More...
  └─ More: Reports | Groups | Outcomes | Rubrics | Merge Assessments
Questions: Manage | Libraries
Course Items: Copy From... | Export
Mass Change: Assessments | Forums | Blocks | Dates | Time Shift
```

### Adding Items to Course — "Add An Item..." Dropdown

> ⚠️ **Critical**: This is a native `<select>` element — NOT a custom widget. The `<select>` itself **IS** visible and has a layout box (confirmed via DOM inspection), but its `<option>` children do **NOT** — Chrome renders them via the OS native widget, outside the DOM layout tree (0×0px bounding rect). CDP error `-32000: Node does not have a layout object` occurs when an agent tries to `.click()` an `<option>` element directly.
>
> **Use direct URL navigation (Option A — recommended) or `selectOption()` with `waitForNavigation()` (Option B). Never `.click()` `<option>` elements.**

#### Select Element ID Pattern

```
addtype{blk}-{tb}
  blk = '0'       → course-level (outside any block)
  blk = '0-1'     → inside block 1
  blk = '0-2'     → inside block 2  (increment for more blocks)
  tb  = 't'       → top of section
  tb  = 'b'       → bottom of section
```

**All selects on a typical course page:**

| Selector ID | `onchange` call | Location |
|-------------|-----------------|----------|
| `#addtype0-t` | `additem('0','t')` | Top of course (above all blocks) |
| `#addtype0-1-t` | `additem('0-1','t')` | Top of block 1 |
| `#addtype0-1-b` | `additem('0-1','b')` | Bottom of block 1 |
| `#addtype0-2-t` | `additem('0-2','t')` | Top of block 2 |
| `#addtype0-2-b` | `additem('0-2','b')` | Bottom of block 2 |
| `#addtype0-b` | `additem('0','b')` | Bottom of course (below all blocks) |

Block names map to numbers via `[id^="blockh"]` elements (e.g. `#blockh1` = block 1).

#### Option Values and Destination URLs

The `additem()` JS function constructs: `add{type}.php?block={blk}&tb={tb}&cid={cid}`

| Label | `value` | Destination page |
|-------|---------|-----------------|
| Add Assessment | `assessment2` | `addassessment2.php` |
| Add Inline Text | `inlinetext` | `addinlinetext.php` |
| Add Link | `linkedtext` | `addlinkedtext.php` |
| Add Forum | `forum` | `addforum.php` |
| Add Wiki | `wiki` | `addwiki.php` |
| Add Drill | `drillassess` | `adddrillassess.php` |
| Add Block | `block` | `addblock.php` |
| Add Calendar | `calendar` | `addcalendar.php` |

#### How to Interact (pick one approach)

**Option A — Direct URL navigation (recommended, skips the dropdown entirely):**
```javascript
// Add Assessment to block 2, at the top
const cid = new URL(state.page.url()).searchParams.get('cid');
await state.page.goto(`https://www.myopenmath.com/course/addassessment2.php?block=0-2&tb=t&cid=${cid}`, { waitUntil: 'domcontentloaded' });
```

**Option B — `selectOption()` on the native `<select>` (works, but requires `waitForNavigation`):**
```javascript
// IMPORTANT: capture the nav promise BEFORE calling selectOption — it fires immediately
const navPromise = state.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
await state.page.locator('#addtype0-t').selectOption('assessment2');
await navPromise;
// → navigates to addassessment2.php?block=0&tb=t&cid={cid}
```

**NEVER do this** — causes CDP error `-32000: Node does not have a layout object`:
```javascript
// ❌ <option> elements have no layout box (0×0px rect) — CDP cannot interact with them
await state.page.locator('option[value="assessment2"]').click();
await state.page.locator('[value="assessment2"]').click();
```

For assessment items:
```
- Questions → addquestions2.php?aid={aid}&cid={cid}
- Settings  → addassessment2.php?id={aid}&block={block}&cid={cid}
```

---

### Block (Section/Folder) Interaction

Blocks are the collapsible folder sections on the course page. Each block has two identifiers:

| Identifier | Example | Where used |
|------------|---------|------------|
| **DOM element ID** | `blockh24` (`blockh{bid}`) | Locating in page, CSS |
| **Hierarchical path** | `0-1` (course=0, child index) | URL parameters |

**Extract both IDs from any block by name:**
```javascript
const ids = await page.evaluate((name) => {
  const link = Array.from(document.querySelectorAll('[id^="blockh"]'))
    .find(el => el.textContent.trim() === name);
  if (!link) return null;
  // toggleblock(event, '{bid}', '{path}')
  const m = (link.getAttribute('onclick') || '').match(/toggleblock\(event,'(\d+)','([^']+)'\)/);
  return m ? { elemId: link.id, bid: m[1], path: m[2] } : null;
}, 'TEST SECTION');
// → { elemId: 'blockh24', bid: '24', path: '0-1' }
```

#### Block DOM Structure (confirmed via live inspection)

```html
<div class="title">
  <b><i>                                  <!-- <b><i> = hidden; <b> only = visible -->
    <a id="blockh{bid}"
       href="#"
       onclick="toggleblock(event,'{bid}','{path}'); return false;"
       aria-controls="block{bid}"
       aria-expanded="false|true">{Block Name}</a>
  </i></b>
  <span class="instrdates"><i>Hidden</i></span>  <!-- only shown when hidden -->
</div>
<div>  <!-- Options trigger -->
  <a role="button" data-toggle="dropdown" aria-expanded="false">
    <img alt="Options for {Block Name}">
  </a>
  <ul role="menu">
    <li role="menuitem"><a href="course.php?cid={cid}&folder={path}">Isolate</a></li>
    <li role="menuitem"><a href="addblock.php?cid={cid}&id={path}">Modify</a></li>
    <li role="menuitem"><a href="#" onclick="return moveDialog('0','B{bid}');">Move</a></li>
    <li role="menuitem"><a href="deleteblock.php?cid={cid}&id={path}&bid={bid}&remove=ask">Delete</a></li>
    <li role="menuitem"><a href="copyoneitem.php?cid={cid}&copyid={path}&backref=blockhead{bid}">Copy</a></li>
    <li role="menuitem"><a href="course.php?cid={cid}&togglenewflag={path}">Toggle NewFlag</a></li>
  </ul>
</div>
```

#### Opening the Options Dropdown

> The Options trigger is `<a role="button">` — NOT a real `<button>`. It IS clickable via `getByRole`.

```javascript
// Click Options for a specific block by name
await page.getByRole('button', { name: 'Options for TEST SECTION' }).click();

// Then click a menu item
await page.getByRole('menuitem').filter({ hasText: 'Modify' }).click();
// waits for navigation if the menu item navigates
```

**Or skip the dropdown and navigate directly (recommended):**
```javascript
// Modify (Edit settings — hide/show, title, dates)
await page.goto(`https://www.myopenmath.com/course/addblock.php?cid=${cid}&id=${path}`, { waitUntil: 'domcontentloaded' });

// Isolate (view only this block)
await page.goto(`https://www.myopenmath.com/course/course.php?cid=${cid}&folder=${path}`, { waitUntil: 'domcontentloaded' });

// Delete (shows confirmation page)
await page.goto(`https://www.myopenmath.com/course/deleteblock.php?cid=${cid}&id=${path}&bid=${bid}&remove=ask`, { waitUntil: 'domcontentloaded' });
```

#### Detecting Hidden vs Visible Blocks

```javascript
const isHidden = await page.evaluate((bid) => {
  const link = document.getElementById('blockh' + bid);
  if (!link) return null;
  // Hidden: title wrapped in <b><i>, and/or instrdates span contains 'Hidden'
  const titleDiv = link.closest('.title') || link.parentElement;
  const hasItalic = !!titleDiv && !!titleDiv.querySelector('i > a, b > i');
  const statusText = titleDiv ? titleDiv.querySelector('.instrdates')?.textContent || '' : '';
  return statusText.includes('Hidden') || hasItalic;
}, '24');
```

**Visual markers:**
| State | Title style | `instrdates` text |
|-------|-------------|-------------------|
| Visible (Show Always) | `<b>` only | Empty or date range |
| Hidden | `<b><i>` | `Hidden` |
| Date-restricted | `<b>` | Date range string |

#### Hiding / Showing a Block

Navigate to the Modify page and set the availability radio:

```javascript
// Get block path first
const { path } = await page.evaluate((name) => {
  const link = Array.from(document.querySelectorAll('[id^="blockh"]'))
    .find(el => el.textContent.trim() === name);
  const m = (link?.getAttribute('onclick') || '').match(/toggleblock\(event,'(\d+)','([^']+)'\)/);
  return m ? { bid: m[1], path: m[2] } : {};
}, 'TEST SECTION');

await page.goto(`https://www.myopenmath.com/course/addblock.php?cid=${cid}&id=${path}`, { waitUntil: 'domcontentloaded' });

// Hide the block
await page.getByRole('radio', { name: /Hide.*hide all items/ }).click();
// OR: Show always
await page.getByRole('radio', { name: 'Show Always' }).click();
// OR: Show by dates
await page.getByRole('radio', { name: 'Show by Dates' }).click();

await page.getByRole('button', { name: /Modify Block|Save/i }).click();
await page.waitForLoadState('domcontentloaded');
// → returns to course.php
```
---

## Question Set Management (`manageqset.php`)

### Page Controls
| Element | Selector | Notes |
|---------|---------|-------|
| Search type toggle | `#cursearchtype` | Button — "In Libraries ▼". Click to open dropdown |
| Search type dropdown options | `.dropdown-menu a` | All Libraries / Select Libraries... / Select Assessments... / Unassigned / [named libs] |
| Search input | `#search` | Text field inside the search button group |
| Search button | `role=button[name="Search"]` | |
| Advanced Search | `#advsearchbtn` | Expands filter options |
| Add New Question | `role=button[name="Add New Question"]` | Navigates to `moddataset.php?cid={cid}` |
| With Selected dropdown | `#dropdownMenuWithsel` | Transfer / Delete / Library Assignment / Change Rights / Change License |

### Questions Table
```
th headers: Select | Description | Actions | Info | ID | Type | Times Used | Last Mod
```

| Column | Selector | Notes |
|--------|---------|-------|
| Checkbox | `checkbox[id^="qo"]` | `qo0`, `qo1`, ... |
| Question name | Cell text | |
| Preview button | `role=button[name="Preview"]` | Opens inline preview |
| More ▼ | `.dropdown-toggle` (secondary class) | Per-row; opens action menu |
| Question ID | Cell text | Numeric |
| Type | Cell text | `number`, `choices`, `multans`, `matching`, `multipart`, `essay`, etc. |
| Times Used | Cell text | |
| Last Modified | Cell text | Date |

### More ▼ Options Per Question
```
View Code     → moddataset.php?id={qid}&cid={cid}&viewonly=1    (all questions)
Template(Copy)→ moddataset.php?id={qid}&cid={cid}&template=true  (all questions)
Edit          → moddataset.php?id={qid}&cid={cid}               (YOUR questions only)
```

---

## Question Editor (`moddataset.php`)

### Header Fields
| Field | Selector | Notes |
|-------|---------|-------|
| Description (question name) | `textarea#description` | Plain text name shown in question lists |
| Use Rights | `select#userights` | Private / Allow use by all / Allow use by all and modifications by group / Allow use by all and modifications by all |
| License | `select#license` | Copyrighted / IMathAS/WAMAP/MOM Community License (GPL+CC-BY) / Public Domain / CC-BY-NC-SA / CC-BY-SA |
| Additional Attribution | `input#addattr` | Text field |
| Library assignment | `input#libs` | Hidden — managed by "Select Libraries" button |
| Question type | `input#qtype` | Hidden — value set by type picker JS |

### Question Type Picker
```
Button: "Number ▼" (or current type) → opens dropdown menu
```

| Top-level | Sub-types |
|-----------|-----------|
| Number | Numeric, Calculated, Complex, Calculated Complex |
| Selecting from Options | Multiple-choice, Multiple-answer, Matching |
| Algebraic Expression (Function) | (none) |
| Text Entry / Upload | String, Essay, File Upload |
| Drawing | (none) |
| N-Tuple | Numeric, Calculated, Complex, Calculated Complex, Algebraic |
| Matrix | Numeric, Calculated, Complex, Calculated Complex, Algebraic |
| Interval | Numeric, Calculated |
| Chemical | Equation, Molecule |
| Multipart | (none) |
| Conditional | (none) |

**Key**: For the skills `mom-matrix-equation` and `mom-matrix-rref`, set type to **Multipart**.

### Editor Sections
| Section | Selector | Notes |
|---------|---------|-------|
| Common Control | `textarea#control` / `name="control"` | PHP-like variables and logic; runs server-side before display |
| Question Text | `textarea#qtext` / `name="qtext"` | Student-facing question; can use `$variables` defined in Common Control |
| Detailed Solution | `textarea#solution` / `name="solution"` | Optional; shown after submission |

**Tip**: Each section has `[+]` / `[-]` links to resize the textarea and a `Toggle Editor` button (Question Text only) to switch between visual and raw mode.

### Image Upload
| Field | Selector |
|-------|---------|
| File picker | `input[type="file"]#imgfile` |
| Variable name | `input#newimgvar` — `$varname` used in question text |
| Alt text | `textarea#newimgalt` |

### Help Button
| Field | Selector | Options |
|-------|---------|---------|
| Help type | `select#helptype` | Video / Read |
| URL | `input#helpurl` | |
| Description | `input#helpdescr` | |

### Save Buttons
All three save button pairs are functionally identical; use whichever is visible:
- `role=button[name="Save"]` — saves, stays on page
- `role=button[name="Quick Save and Preview"]` — saves, opens preview popup

### Solver
- `input[type="button"]#solveropenbutton` — opens the equation solver tool
- `select#solveroperation` — solver operation type
- `input[type="button"]#solverappend` — appends solver output to Common Control

---

## Assessment Settings (`addassessment2.php`)

### Top Controls
```
Link: "Add/Remove Questions" → addquestions2.php?aid={aid}&cid={cid}
```

### Basic Fields
| Field | Selector | Notes |
|-------|---------|-------|
| Assessment Name | `input#name` / `name="name"` | Text |
| Summary | `textarea#summary` — TinyMCE rich text | Optional description shown to students |
| Intro/Instructions | `textarea#intro` — TinyMCE rich text | Shown at start of assessment |
| Show/Hide | `name="avail"` radio | "Hide" or "Show by Dates" |

### Date Fields (when "Show by Dates" selected)
| Field | Name | Format |
|-------|------|--------|
| Start date type | `name="sdatetype"` radio | "Available always until end date" / "Available after" |
| Start date | `name="sdate"` | `MM/DD/YYYY` |
| Start time | `name="stime"` | `HH:MM AM/PM` |
| Due date type | `name="edatetype"` radio | "Available always after start date" / "Due" |
| Due date | `name="edate"` | `MM/DD/YYYY` |
| Due time | `name="etime"` | `HH:MM AM/PM` |
| Practice after due | `name="allowpractice"` checkbox | Keep open ungraded after deadline |

### Core Options
| Field | Selector | Options |
|-------|---------|---------|
| Copy settings from | `select#copyfrom` | None / [list of other assessments in course] |
| Display style | `select#displaymethod` | One question at a time / All at once / Video Cued / Live Poll |
| Submission type | `select#subtype` | Homework-style (retry individual questions) / Quiz-style (retake whole assessment) |
| Versions per question | `spinbutton#defregens` | Number of randomized versions |
| Tries per version | `spinbutton#defattempts` | Attempts allowed per version |
| Show scores during | `select#showscores` | On each question immediately / No scores at all |
| Show answers during | `select#showans` | After last try / Never / etc. |

### Gradebook Options
| Field | Selector | Notes |
|-------|---------|-------|
| View work in gradebook | `select#viewingb` | When students can see their submitted work |
| View scores in gradebook | `select#scoresingb` | When students can see scores |
| View answers in gradebook | `select#ansingb` | When students can see correct answers |
| Gradebook Category | `select#gbcategory` | Category this assessment counts toward |
| Count in gradebook | `select#cntingb` | Whether/how it counts |

### Other Options
| Field | Selector | Notes |
|-------|---------|-------|
| Shuffle order | `select#shuffle` | Randomize question order |
| Show work boxes | `select#showwork` | Provide work entry boxes |
| Time limit | `input#timelimit` | Minutes; blank = no limit |
| Password | `input#assmpassword` | Require password to open |
| Show hints | `name="showhints"` checkbox | |
| Allow LatePasses | `select#allowlate` | |
| Group assessment | `select#isgroup` | Enable group submissions |
| Max group members | `spinbutton#groupmax` | |

---

## Add/Remove Questions (`addquestions2.php`)

### Control Links
```
Assessment Settings | Categorize Questions | Create Print Version | Define End Messages | Find Question in Course | Use Classic Add/Remove
```

### Current Questions Table
```
th headers: Select | Order | Description | Features | ID | Preview | Type | Avg Time | Points [default spinner] | Actions
```

| Element | Selector | Notes |
|---------|---------|-------|
| Question checkbox | `checkbox[id^="qc"]` | `qc0`, `qc1`, ... |
| Move order dropdown | `combobox[id="{n}"]` | Integer index of position |
| Question name | Cell text | |
| Question ID | Cell text | |
| Type | Cell text | `number`, `choices`, `multipart`, `multans`, `matching`, `essay`, etc. |
| Per-question points | `spinbutton[id^="pts-"]` | Override per question |
| Default points (header) | `spinbutton#defpts` | Sets default for all new questions |
| Actions ⋮ | `role=button[name="⋮"]` | Per-question menu |
| Assessment total | `text "Assessment points total:"` followed by total | Read-only |

### Group Row (when questions are grouped)
| Element | Selector | Notes |
|---------|---------|-------|
| "Select N from group of M" | `textbox[id^="grpn"]` | N = how many to pick; M = group size |
| With/Without replacement | `combobox[id^="grptype"]` | "Without" / "With" |
| Points per question in group | `spinbutton[id^="grppts-"]` | |
| Ungroup link | `role=link[name="Ungroup"]` | Per question in group |
| Collapse group | `image "Collapse"` | First cell of group header row |

### Batch Actions
- `role=button[name="Remove"]` — remove selected from assessment
- `role=button[name="Group"]` — create a pick-N group from selected
- `role=button[name="Change Settings"]` — change points/settings on selected

### Adding Questions (bottom of page)
| Element | Selector | Notes |
|---------|---------|-------|
| Search type toggle | `#cursearchtype` | "In Libraries ▼" — same pattern as manageqset |
| Search type options | `.dropdown-menu a` | All Libraries / Select Libraries... / Select Assessments... / [named libs] |
| Search input | `#search` | |
| Search button | `role=button[name="Search"]` | |
| Add button | `role=button[name="Add"]` | Adds selected questions to assessment |
| Options for adding | `role=button[name="Options for adding ▲"]` | Expand for add behavior settings |
| Add New Question | `role=link[name="Add New Question"]` | Creates new question → `moddataset.php?cid={cid}` |
| Done link | `role=link[name="Done"]` | Returns to course page |
| Preview | `role=button[name="Preview"]` | Preview assessment |

---

## Gradebook (`gradebook.php`)

### Controls Bar
| Control | Selector | Values |
|---------|---------|--------|
| Color coding | `select#colorsel` | None, or score threshold ranges (50/60, 60/70, etc.) |
| Headers | `name="hdrs"` radio | Locked / Unlocked |
| Page width | `name="pgw"` radio | Fixed / Full |
| Score display | `name="pts"` radio | Points / Percent |
| Links | `name="links"` radio | View/Edit / Summary |
| Student pictures | `name="pics"` radio | None / Small / Large |
| New flag | `name="newflag"` radio | Off / On |
| Category filter | `select#filtersel` | All / Default / Category Totals |
| Not Counted | `select#hidenc` | Show all / Show stu view / Hide all |
| Show filter | `select#availshow` | Past due / Past & Attempted / Available Only / Past & Available / **All** |
| Locked toggle | `select#lockedtoggle` | Show Locked / Hide Locked |

### Column Headers (per assignment)
Each assignment column: `th[data-pts]` (same selector as roster gradebook view)
```
[Assignment Name] [N pts] [Settings] [Isolate]
```
- `[Settings]` → `addassessment2.php?id={aid}&cid={cid}&from=gb`
- `[Isolate]` → `isolateassessgrade.php?cid={cid}&aid={aid}`

### Control Links
```
Offline Grades ▼ | Export | Settings | Comments
```

---

## Isolate Assignment Gradebook (`isolateassessgrade.php`)

Single-assignment gradebook view. Used to see per-student scores and manage exceptions.

### Links Available
| Link | Destination |
|------|------------|
| View Item Analysis | `gb-itemanalysis2.php?cid={cid}&aid={aid}` |
| Gradebook (back) | `gradebook.php?gbmode=1011&cid={cid}` |

### Batch Actions
```
Check: All | None
With Selected: Excuse Grade | Un-excuse Grade | Make Exception
```

---

## Grading Page (`gradeallq2.php`) — Summary

*(Full DOM map in `grade-selectors.md`)*

URL: `course/gradeallq2.php?cid={cid}&aid={aid}`

Accessible from: the grading page is reached by clicking a student's score cell on the Isolate page, or by navigating directly. **Not directly linked** from the main gradebook — navigate via URL construction using `cid` and `aid`.

---

---

## Question Preview / Test Page (`testquestion2.php`)

URL: `https://www.myopenmath.com/course/testquestion2.php?cid={cid}&qsetid={qid}`

Used by instructors to preview a question with live randomization and to verify auto-grading. This is NOT a student-facing page — it's an authoring/verification tool.

> 🔴 **REQUIRED VALIDATION RULE**: After answering any question on this page, you **MUST** click Submit and confirm you receive a **Correct** result before declaring the question working. Getting Incorrect (or no result) means the question code is broken or your answer math is wrong — either way, do not proceed. This applies to every question type, every seed.

### Key Page Elements

| Element | Selector | Notes |
|---------|---------|-------|
| Question text | `.qtext` or first visible text block | Contains the student-facing prompt |
| Answer box area | `#answerarea` | Wraps canvas or input depending on question type |
| Canvas (draw questions) | `canvas[id^="canvas"]` | ID is dynamically assigned (e.g. `canvas27`) — always use the prefix selector |
| Submit button | `input[type="button"][value="Submit"]` or `button:has-text("Submit")` | Submits the answer for grading |
| Grade/result display | `.scoredisplay`, `.correct`, `.incorrect`, or text containing "Score" | Shows grade after submit |
| New Version button | `input[type="button"][value="New Version"]` or `button:has-text("New Version")` | Loads a new random seed |

### Draw Question (`$answerformat = "twopoint"`) Canvas Interaction

> ⚠️ **Critical**: The canvas ID is dynamic. Always locate it with `canvas[id^="canvas"]` — never hardcode the number.

#### Grid Configuration

The grid is defined by `$grid = "xmin,xmax,ymin,ymax,xscl,yscl,width,height"` in the question's Common Control.

Standard graph: `$grid = "-6,6,-6,6,1,1,300,300"` → 298×298px canvas, grid from -6 to 6 on both axes.

#### Grid → Pixel Conversion

```javascript
// For a standard -6 to 6 grid on a 298x298 canvas:
const canvasW = 298, canvasH = 298;
const xMin = -6, xMax = 6, yMin = -6, yMax = 6;

function gridToPixel(gx, gy) {
  return {
    x: Math.round((gx - xMin) / (xMax - xMin) * canvasW),
    y: Math.round((yMax - gy) / (yMax - yMin) * canvasH),
  };
}

// Example: click points (0,-2) and (3,4)
const p1 = gridToPixel(0, -2);  // { x: 149, y: 198 }
const p2 = gridToPixel(3, 4);   // { x: 224, y: 74 }
```

#### Drawing a Line (Two Clicks)

With `$snaptogrid = 1`, clicks snap to the nearest integer grid point. Pick any two distinct integer points on the line.

```javascript
// Step 1: locate the canvas (ID is dynamic)
const canvas = await state.page.locator('canvas[id^="canvas"]').first();

// Step 2: compute pixel positions from two grid points on the line
// e.g. for y = 2x + 3, use (-1, 1) and (1, 5)
const p1 = gridToPixel(-1, 1);
const p2 = gridToPixel(1, 5);

// Step 3: click both points — order does not matter
await canvas.click({ position: p1 });
await canvas.click({ position: p2 });
```

#### Computing Points on the Line

Given the equation `y = m*x + b`, pick two integer x values and compute y:

```javascript
function twoPointsOnLine(m, b, xMin = -6, xMax = 6) {
  // Try x = 0 first, then x = 1 (or adjust to keep within grid)
  const x1 = 0;
  const y1 = m * x1 + b;
  const x2 = (Math.abs(m) <= 3) ? 1 : (m > 0 ? -1 : 1);
  const y2 = m * x2 + b;
  // Clamp to grid if needed
  return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
}
```

For general use, pick x values such that both resulting y values stay within [yMin, yMax].

#### Full Draw + Submit Workflow

```javascript
// 1. Navigate to the question
await state.page.goto(`https://www.myopenmath.com/course/testquestion2.php?cid=${cid}&qsetid=${qid}`, { waitUntil: 'domcontentloaded' });

// 2. Read the equation from the page (or know it from the question code)
//    e.g. parse 'y = 2x + 3' from the visible question text

// 3. Compute two points on the line
const [p1grid, p2grid] = twoPointsOnLine(m, b);
const p1px = gridToPixel(p1grid.x, p1grid.y);
const p2px = gridToPixel(p2grid.x, p2grid.y);

// 4. Click both points on the canvas
const canvas = await state.page.locator('canvas[id^="canvas"]').first();
await canvas.click({ position: p1px });
await canvas.click({ position: p2px });

// 5. Submit and ASSERT CORRECT — this is required validation, not optional
await state.page.locator('input[type="button"][value="Submit"]').click();
await state.page.waitForTimeout(1500);

// 6. Read result and verify
const resultEl = await state.page.locator('.scoredisplay, .correct, .incorrect').first();
const resultText = await resultEl.textContent().catch(() => '');
const isCorrect = resultText.includes('1/1') || (await state.page.locator('.correct').count()) > 0;
if (!isCorrect) {
  // ❌ STOP — question is broken. Do NOT proceed.
  // Debug: check that your gridToPixel math matches the actual equation,
  //        verify canvas dimensions with canvas.getBoundingClientRect(),
  //        and confirm the equation was read correctly from qtext.
  throw new Error(`Submit returned incorrect: "${resultText}" — fix the question or answer math before continuing`);
}

// 7. Optionally test a second seed to confirm the question works across randomizations
await state.page.locator('input[type="button"][value="New Version"]').click();
await state.page.waitForLoadState('domcontentloaded');
// Repeat steps 2–6 for the new seed to confirm correctness holds

### Reading the Current Equation from the Question

The question text is rendered HTML. Parse it to extract slope/intercept:

```javascript
const qtext = await state.page.locator('.qtext').first().innerText();
// qtext will contain something like: "Graph the linear function y = 2x + 3"
// Use a regex to extract m and b:
const match = qtext.match(/y\s*=\s*(-?\d*)x\s*([+-]\s*\d+)?/);
// Parse m and b from match groups
```

Alternatively, if the slope/intercept values are known from the question source, use them directly rather than parsing the rendered text.

### Grading Result Interpretation (Required Pass/Fail)

After submit, check the result **before** declaring the question complete:

| Result | Meaning | Action |
|--------|---------|--------|
| `Score: 1/1` or `.correct` present | ✅ Question works | Proceed / test more seeds |
| `Score: 0/1` or `.incorrect` present | ❌ Question broken or answer math wrong | Debug and fix — do NOT proceed |
| No result shown after submit | ❌ Submit click missed or canvas interaction failed | Re-verify `gridToPixel` math and canvas size |

**Debugging incorrect results:**
1. Take a screenshot to see what line was drawn vs. what was expected
2. Confirm the equation was read correctly from `.qtext` (watch for `m=1` rendering as `x`, not `1x`)
3. Verify canvas pixel dimensions with `canvas.getBoundingClientRect()` — if they differ from 298×298, recalculate
4. Click "New Version" and try a simpler seed (e.g. slope=1) to isolate whether it's a pixel math issue or a question code issue

## How to Get `cid` and `aid`

- **`cid`** — appears in every page URL. Extract from current page: `new URL(location.href).searchParams.get('cid')`
- **`aid`** — the assessment ID. Extract from:
  - Course page links: `a[href*="addquestions2"]` → parse `aid` from href
  - Gradebook `[Settings]` links: `a[href*="addassessment2"]` → parse `id` param
  - Assessment URL: `addassessment2.php?id={aid}&...` → `id` param IS the `aid`

```javascript
// Extract cid from current page
const cid = new URL(location.href).searchParams.get('cid');

// Extract aid from a Settings link
const settingsLink = document.querySelector('a[href*="addassessment2"]');
const aid = new URL(settingsLink.href).searchParams.get('id');

// Build grading URL
const gradeUrl = `https://www.myopenmath.com/course/gradeallq2.php?cid=${cid}&aid=${aid}`;
```

---

## MOM PHP Syntax (Quick Reference)

For use in **Common Control** and **Question Text** of the question editor. Full reference is in the `mom-matrix-equation` and `mom-matrix-rref` skills.

```php
// Variables
$x = 5
$name = "hello"

// Random integers (may repeat)
$a = rands(1, 10, 1)       // one integer 1–10
$arr = rands(-5, 5, 3)     // array of 3 integers

// Distinct random integers
$arr = diffrands(1, 20, 4) // 4 distinct integers 1–20

// Conditional
if ($x > 0) { $sign = "positive" } else { $sign = "negative" }

// In Question Text: reference variables with $
// Example: "The value of x is $x."

// LaTeX math in question text:
// Inline:  \( x = $x \)
// Display: \[ x^2 + y^2 = r^2 \]

// Answer variable (for auto-grading)
$answer = $x + 3

// Multipart answers
$anstypes = array("matrix", "file")
$answer[0] = ...
$answersize[0] = "3,1"
$scoremethod[1] = "takeanything"
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Navigating to `addassessment2.php` without `id` param when editing | Must include `?id={aid}` — without it, creates a NEW assessment |
| Using `.fill()` on TinyMCE fields (Summary, Intro) | TinyMCE ignores `.fill()` — use `iframe` content injection or raw textarea |
| Question type hidden field (`#qtype`) can't be set directly | Use the type picker button UI to change type — it sets the hidden field via JS |
| Forgetting to set both `#control` and `#qtext` when pasting a question | Both sections are required; Common Control has variables, Question Text has the student-facing content |
| Clicking "Save" while question type picker dropdown is open | Close dropdown first; open dropdown intercepts the save click |
| Building `aid` from the wrong param | In `addassessment2.php?id={aid}`, the `id` param = `aid`. Don't confuse with the course `cid` |
| `.click()` on `<option>` elements inside the "Add An Item" `<select>` | CDP error `-32000: Node does not have a layout object` — `<option>` children have zero layout (0×0px). Use `.selectOption()` with `waitForNavigation()`, or navigate directly to the URL (Option A) |
| Using `#addtype{n}-t` where `n` is a simple integer | ID pattern is `addtype{blk}-{tb}` where `blk` is `0` (course) or `0-{blockNum}` (inside block) |
| Using `\( ... \)` or `$` for inline math in question text | MOM uses backticks: `` `y = 2x + 3` `` renders as typeset math. `\(` shows literally. |
| Using hardcoded canvas ID (e.g. `#canvas27`) | Canvas ID is dynamically assigned — always use `canvas[id^="canvas"]` |
| Clicking Submit before both canvas points are placed | Two clicks required for `twopoint` draw type — one click draws nothing visible |
| Using `\( ... \)` for inline math in question text (repeated) | Use backticks `` ` `` — see MOM PHP Quick Reference above |
| `gridToPixel` using wrong canvas size | Verify actual canvas dims with `canvas.getBoundingClientRect()` if results are off |
| Parsing `y = mx + b` from rendered text when m=1 or m=-1 | Rendered text shows `y = x + 3` (not `1x`) — handle the implicit coefficient case |
| Using `blockh{N}` as the URL `id` param for block operations | `blockh{N}` is the DOM element ID (e.g. `blockh24`). URL params use the **path** format (e.g. `id=0-1`). Extract both via `toggleblock` onclick: `/toggleblock\(event,'(\d+)','([^']+)'\)/` |
| Trying to `.click()` the block Options image directly | The trigger is `<a role="button">` wrapping the image — use `page.getByRole('button', { name: 'Options for {BlockName}' })` to click the anchor, not the image |
| Using `page.locator('[id^="dropdownMenuCtrl"]')` to find a specific block's Options | These IDs are NOT unique per block — same ID repeats inside nested blocks. Use `getByRole('button', { name: 'Options for {name}' })` instead |
