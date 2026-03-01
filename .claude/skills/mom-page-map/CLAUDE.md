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

### Adding Items to Course
Each folder/block has a combobox `id="addtype{n}-t"` (n = position index):
```
Options: Add Assessment | Add Inline Text | Add Link | Add Forum | Add Wiki | Add Drill | Add Block | Add Calendar
```

### Item-Level Actions (per content item)
Each item has an Options button `button[id="dropdownMenuCtrl{n}"]`:
```
Links visible next to items:
- Modify → addinlinetext.php?id={id}&block={block}&cid={cid}  (for text items)
- Move   → JS-only (drag or modal)
- Delete → deleteinlinetext.php?id={id}&block={block}&cid={cid}&remove=ask
- Copy   → copyoneitem.php?cid={cid}&copyid={id}&backref={type+id}
- Stats  → contentstats.php?cid={cid}&type=I&id={id}
```

For assessment items:
```
- Questions → addquestions2.php?aid={aid}&cid={cid}
- Settings  → addassessment2.php?id={aid}&block={block}&cid={cid}
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
