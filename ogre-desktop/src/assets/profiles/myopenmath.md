---
name: "MyOpenMath — Knowledge Profile"
description: "Teaches AI agent how to navigate and operate MyOpenMath as an instructor"
urlPatterns:
  - "myopenmath.com"
---

# MyOpenMath — Agent Navigation Guide

This profile teaches an AI agent to navigate MyOpenMath (MOM) as an instructor. MOM is a free, open-source online math homework platform (IMathAS engine). Instructors create courses, build assessments, manage question banks, and track grades.

## Site Overview

- **Base URL**: `https://www.myopenmath.com`
- **Role**: Instructor/teacher
- **Assessment** = assignment/test containing questions | **Question Set** = personal question bank | **Block** = collapsible folder on course page | **Gradebook Category** = grade weighting group (Homework, Individual, Group)

---

## Priority 1: Home Page Navigation

### Dashboard After Login

**URL**: `https://www.myopenmath.com/` (redirects to home after login)

The home page displays a welcome banner and three course sections:

| Section | Description |
|---------|-------------|
| **Courses you're teaching** | Courses where you are the instructor. Each has an "Options" gear button. |
| **Courses you're tutoring** | Courses where you have tutor access. Each has an "x" hide link. |
| **Courses you're taking** | Courses you're enrolled in as a student (e.g., training courses). |

### System Navigation Bar (top of every page)

```
MyOpenMath logo | Home | My Classes | User Settings | Log Out | [username] ⚙
```

- **Selectors**:
  - Nav container: `nav` with `aria-label="System Navigation"`
  - Home link: `role=link[name="Home"]`
  - My Classes: `role=link[name="My Classes"]`
  - Log Out: `role=link[name="Log Out"]`

### Switching Between Courses

From the home page, click any course name link to enter that course. Each course link shows the course name (e.g., "IM3-Huff-25-26"). The gear icon (`role=button[name="Options"]`) next to each course opens a dropdown with course management options.

**Additional home page links**:
- `role=link[name="Add New Course"]` — create a new course
- `role=link[name="Change Course Order"]` — reorder courses
- `role=link[name="View hidden courses"]` — show hidden courses
- `role=link[name="Find Student"]` — search for a student across courses
- `role=link[name="Enroll in a New Class"]` — self-enroll as student

---

## Course Page Layout

**URL pattern**: `https://www.myopenmath.com/course/course.php?cid={courseId}`

**Course nav bar** (`nav[aria-label="Course Navigation"]`): Course | Roster | Gradebook

**Instructor sidebar** (`nav[aria-label="Instructor tool navigation"]`): Communication (Messages, Forums) | Tools (Roster, Gradebook, Calendar, Course Map) | Questions (Manage, Libraries) | Course Items (Copy From, Export) | Mass Change (Assessments, Forums, Blocks, Dates, Time Shift) | Course Settings

**Content area**: View toggles (Instructor/Student/Quick Rearrange), Add Item dropdown (`select#addtype0-t`), collapsible Blocks/Folders with gear menus, Calendar view, and individual assessment items with visibility status.

**Breadcrumbs** (`nav[aria-label="Navigation breadcrumbs"]`): Home > CourseName > Current Page
---

## Priority 2: Gradebook Mapping

### Accessing the Gradebook

Navigate via:
1. Course Navigation bar → "Gradebook" link
2. Instructor tool sidebar → Tools → "Gradebook"

**URL pattern**: `https://www.myopenmath.com/course/gradebook.php?cid={courseId}`

### Gradebook Controls

| Control | Selector | Purpose |
|---------|----------|---------|
| Offline Grades | dropdown | Add manual grade columns |
| Export | `role=link[name="Export"]` | Export grades (CSV) |
| Settings | `role=link[name="Settings"]` | Configure gradebook display |
| Comments | `role=link[name="Comments"]` | View/add instructor comments |
| Color filter | `select#colorsel` | Color-code cells by grade threshold (e.g., 50/60, 70/80) |
| Category filter | `select#filtersel` | Filter by category: All, Default, Group, Homework, Individual, Category Totals |
| Not Counted filter | `select#hidenc` | Show all / Show stu view / Hide all |
| Show filter | `select#availshow` | Past due / Past & Attempted / Available Only / Past & Available / All |
| Locked toggle | `select#lockedtoggle` | Show Locked / Hide Locked students |

### Gradebook Table Structure

- **Table ID**: `table#myTable` with `aria-label="Any focusable table header can be clicked to sort"`
- **Headers**: Name (N=count), Pictures, Total (pts), %, then category columns, then individual assignment columns
- **Category columns**: Show category name, total points, and `[Expand]`/`[Collapse]` links
- **Assignment columns**: Show name, points, due date, `[Settings]` and `[Isolate]` links
- **Student rows**:
  - Checkbox for batch selection: `input[type="checkbox"][id^="chkbx"]`
  - Student name as link (click to view individual student)
  - Total score as "XX.X/100"
  - Percentage
  - Category percentages
  - Individual scores as clickable links (click to view/edit attempt)
  - Dash ("-") means no attempt

### Batch Operations

- **Check**: All / None links to select/deselect students
- **With Selected** dropdown for batch actions

### Score Display Format

- **Total column**: Raw score out of total points (e.g., "57.6/100")
- **Percentage column**: Total as percent (e.g., "57.6%")
- **Category columns**: Category percentage (e.g., "85.2%")
- **Individual assignments**: Raw score as link (e.g., "10.5") or "-" for no attempt

---

## Priority 3: Assignment Creation

### Creating a New Assessment

**Navigation**: Course page → "Add An Item..." dropdown → "Add Assessment"  
**URL pattern**: `https://www.myopenmath.com/course/addassessment.php?cid={courseId}`  
(Redirects to: `addassessment2.php?cid={courseId}&r={token}`)

### Assessment Form Fields

**Core fields**:
- `input#name` — Assessment Name (required, displayed to students)
- `textarea#summary` — Summary (TinyMCE editor, shown on course page)
- `textarea#intro` — Intro/Instructions (TinyMCE editor, shown when student opens assessment)
- `select#copyfrom` — Copy Options from existing assessment (clone settings for consistency)

**Question behavior**:
- `select#displaymethod` — Display method (all at once, one at a time, etc.)
- `select#subtype` — Submission type
- `input#defregens` — Versions allowed; `input#defregenpenalty` — % penalty per version
- `input#defattempts` — Attempts per question; `input#defattemptpenalty` — % penalty per attempt
- `select#showscores` — When students see scores; `select#showans` — When they see answers
- `select#shuffle` — Randomize question order

**Grading & gradebook**:
- `select#gbcategory` — Gradebook category (Homework, Individual, Group, etc.)
- `select#cntingb` — Whether it counts in gradebook
- `input#minscore` — Minimum score floor
- `select#showwork` — Require work upload

**Access control**:
- `select#allowlate` — Late submission policy
- `input#timelimit` — Time limit in minutes (blank = unlimited)
- `input#assmpassword` — Optional password
- `select#isgroup` — Group assessment toggle; `input#groupmax` — Max group size
### Visibility / Date Controls

- **Show**: Radio group — "Hide" or "Show by Dates"
- **Available After**: Radio — "Available always until end date" or "Available after" with date/time pickers
  - Date input: `role=textbox[name="show after date"]`
  - Time input: `role=textbox[name="show after time"]`
- **Available Until**: Radio — "Available always after start date" or "Due" with date/time pickers
  - Date input: `role=textbox[name="show until date"]`
  - Time input: `role=textbox[name="show until time"]`
- **Practice mode**: Checkbox — "Keep open for un-graded practice after the due date"

### Organizing into Folders/Blocks

Assessments are organized via **Blocks** on the course page. To create a new block: use the "Add An Item" dropdown → "Add Block". Blocks can be nested and reordered via "Quick Rearrange". Items can be dragged between blocks or moved via the Options gear menu on each item.

---

## Priority 4: Question Authoring

### Managing Questions in an Assessment

**URL pattern**: `https://www.myopenmath.com/course/addquestions.php?aid={assessmentId}&cid={courseId}`

The Add/Remove Questions page shows:
- **Control links**: Assessment Settings, Categorize Questions, Create Print Version, Define End Messages, Find Question in Course
- **Questions table** with columns: Order (Q1, Q2...), Description, ID, Preview, Type, Avg Time, Points, Actions
- **Action dropdown** per question: edit, remove, reorder, change settings
- **"+ Text" button** (`#add-text-button`): Add inline text or page breaks
- **Assessment points total** displayed at bottom
- **Preview** and **Done** buttons at bottom

### Question Set Management

**URL pattern**: `https://www.myopenmath.com/course/manageqset.php?cid={courseId}`

Access via: Instructor tool sidebar → Questions → "Manage"

Features:
- **Search bar**: `input#search` with search type toggle (`button#cursearchtype` — "In Libraries")
- **Advanced Search**: `button#advsearchbtn`
- **"Add New Question"** button: Creates a new question from scratch
- **Library selector**: Browse shared question libraries
- **Questions table**: Select, Description, Actions (Preview, More ▼), Info, ID, Type, Times Used, Last Mod
- **Batch operations**: Check All/None, "With Selected" dropdown (`button#dropdownMenuWithsel`)

### Question Editor (Writing Questions)

**URL pattern**: `https://www.myopenmath.com/course/moddataset.php?cid={courseId}` (new question)  
**URL pattern**: `https://www.myopenmath.com/course/moddataset.php?cid={courseId}&id={questionId}` (edit existing)

#### Question Type Menu

Click the type button (e.g., "Number ▼") to reveal categories:

| Category | Sub-types |
|----------|-----------|
| **Number** | Numeric, Calculated, Complex, Calculated Complex |
| **Selecting from Options** | Multiple-choice, Multiple-answer, Matching |
| **Algebraic Expression (Function)** | (single type) |
| **Text Entry / Upload** | String, Essay, File Upload |
| **Drawing** | (single type) |
| **N-Tuple** | (sub-types expand) |
| **Matrix** | (sub-types expand) |
| **Interval** | (sub-types expand) |
| **Chemical** | (sub-types expand) |
| **Multipart** | (single type — combines multiple answer types) |
| **Conditional** | (single type) |

#### Editor Layout

| Section | Selector/ID | Purpose |
|---------|-------------|---------|
| Description | `input#description` | Internal name for the question (not shown to students). |
| Use Rights | `select#userights` | Private, Allow use by all, etc. |
| License | `select#license` | Copyright/CC license. |
| Library assignment | "Select Libraries" button | Assign to shared libraries. |
| Common Control | Code editor (CodeMirror) | PHP-like code for randomizing variables. `[+]`/`[-]` to resize. |
| Question Text | Code editor (CodeMirror) | HTML + variable placeholders for the question display. Toggle Editor button switches between code and WYSIWYG. |
| Detailed Solution | Link to add | Optional step-by-step solution. |
| Image file | `button#imgfile` | Upload an image; assign to variable via `input#newimgvar`. |
| Help button | `select#helptype` (Video/Read), `input#helpurl`, `input#helpdescr` | Attach help resource. |
| Solver | `button#solveropenbutton` | Built-in CAS solver (Solve, Simplify, Differentiate, Integrate, Plot). |

#### Key Buttons

- **Save**: `role=button[name="Save"]` — saves and stays on page
- **Quick Save and Preview**: `role=button[name="Quick Save and Preview"]` — saves and shows preview

#### Question Code Structure

Questions use PHP-like IMathAS code:
- **Common Control**: Define random variables (e.g., `$a = rand(1,10)`)
- **Question Text**: Mix HTML with `$variables` (e.g., `Solve $a x + $b = $c`)
- **Answer**: Set via `$answer = $solution` in Common Control

#### Preview and Iteration

1. Write/edit code in Common Control and Question Text editors
2. Click "Quick Save and Preview" to test
3. Preview shows the rendered question with randomized values
4. Fix errors, re-save, re-preview until correct
5. Click "Save" for final save, then navigate back to assessment via breadcrumbs

#### Help Resources (visible on editor page)

- `role=link[name="Writing Questions Help"]` — full documentation
- `role=link[name="Macro Library Help"]` — reusable code macros
- `role=link[name="Tutorial Style editor"]` — guided editor for simpler questions

---

## CSS Selectors Quick Reference

**Navigation**: `nav[aria-label="System Navigation"]`, `nav[aria-label="Course Navigation"]`, `nav[aria-label="Navigation breadcrumbs"]`, `nav[aria-label="Instructor tool navigation"]`

**Gradebook**: `table#myTable`, `select#filtersel` (category), `select#availshow` (show filter), `select#colorsel` (color), `input[type="checkbox"][id^="chkbx"]` (student checkboxes)

**Grading page**: `input[aria-label="Score"]`, `div.fbbox[role="textbox"][contenteditable]` (feedback display), `input[type="hidden"][name^="fb-"]` (feedback value)

**Course page**: `select[id^="addtype"]` (add item dropdown), `input#name` (assessment name), `input#search` (question search), `input#description` (question description)
---

## Tips & Gotchas

- **TinyMCE editors** are used for Summary, Instructions, and feedback fields. They load asynchronously — wait for the toolbar to appear before interacting.
- **CodeMirror editors** are used in the question editor. They are NOT standard textareas — use CodeMirror's API or click into the editor area and use keyboard input.
- **Gradebook auto-sorts**: Clicking any column header sorts the table. The default sort is by student name.
- **Assessment "Copy Options from"**: When creating a new assessment, always consider using this to clone settings from a template (e.g., "HW - Template", "INDIVIDUAL - Template").
- **Warning on modifying taken assessments**: If students have already taken an assessment, adding/removing questions shows a warning. You must "Clear Assessment Attempts" first.
- **Page loads**: MOM uses traditional full-page reloads (not SPA). Wait for `domcontentloaded` after navigation.
- **Grading pages**: The grading page (`gradeallq2.php`) has a unique DOM structure. See the separate `grade-selectors.md` reference for detailed selectors.
- **URL patterns summary**:
  - Home: `/`
  - Course: `/course/course.php?cid={id}`
  - Gradebook: `/course/gradebook.php?cid={id}`
  - Add Assessment: `/course/addassessment.php?cid={id}`
  - Add/Remove Questions: `/course/addquestions.php?aid={id}&cid={id}`
  - Manage Question Set: `/course/manageqset.php?cid={id}`
  - Question Editor: `/course/moddataset.php?cid={id}` (new) or `?cid={id}&id={qid}` (edit)
  - Assessment View: `/assess2/?cid={id}&aid={id}`
  - Grade All: `/assess2/gradeallq2.php?cid={id}&aid={id}`
