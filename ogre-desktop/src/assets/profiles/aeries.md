---
name: "Aeries — Knowledge Profile"
description: "Teaches AI agent how to navigate and operate Aeries SIS as a teacher"
urlPatterns:
  - "aeries.net"
---

# Aeries SIS — Agent Navigation Guide

This profile teaches an AI agent how to navigate Aeries Student Information System (SIS) as a teacher. Aeries is a web-based K-12 SIS used primarily in California school districts. The teacher portal provides gradebook management, attendance, student data, and reporting.

**Base URL pattern**: `https://{district}.aeries.net/teacher/`

## 1. Login and Dashboard

### Login Page

- **URL**: `https://{district}.aeries.net/teacher/Login.aspx`
- Redirects append `?page=` param (e.g., `?page=gradebook`) for post-login routing
- Two authentication methods: Aeries credentials and Google SSO

**Login form selectors:**

| Element | Selector | Purpose |
|---------|----------|---------|
| Username | `#Username_Aeries` | Aeries username field |
| Password | `#Password_Aeries` | Password field |
| Year dropdown | `select` (listbox labeled "Year") | Academic year selector (e.g., "2025-2026") |
| Login button | `#btnSignIn_Aeries` | Submit Aeries credentials |
| Google username | `#Username_Google` | Google SSO username |
| Google login | `#btnSignIn_Google` | Submit Google SSO |

The login page displays the district name and Aeries logo.

### Dashboard (Home)

- **URL**: `https://{district}.aeries.net/teacher/Default.aspx`
- The home page is a general landing page; teachers typically navigate directly to the Gradebook

### Gradebook Dashboard

- **URL**: `https://{district}.aeries.net/teacher/gradebook`
- Shows all gradebooks organized under **Current Terms** and **Past Terms**
- Three view options in the top bar:
  - **Tiles**: `#tiles-view` — card/tile layout
  - **List**: `#list-view` — compact list
  - **Table**: `#table-view` — tabular format
- Each gradebook appears as a clickable link: `"Period# - ClassName - Term"` (e.g., "5 - Intro Stats - Spring")
- Clicking a gradebook link navigates to its Scores by Class view

**Gradebook management links** (top bar):
- Add Gradebook, Mass Add Gradebooks (`#massAddGrdebooks`), Link Gradebooks, Copy Gradebook, Import Assignments From Google

### Main Sidebar Navigation

The sidebar uses a Kendo TreeView (`[data-role="treeview"]`):

| Menu Item | URL Path | Notes |
|-----------|----------|-------|
| Home | `/teacher/Default.aspx` | Main dashboard |
| Communications | `/teacher/GoToCommunications.aspx` | Messaging |
| Attendance | `/teacher/TeacherAttendance.aspx` | Daily attendance |
| Attendance by Photo | `/teacher/SeatingChart.aspx` | Photo-based |
| Gradebook | `/teacher/gradebook` | Gradebook dashboard |
| Grades | `/teacher/TeacherGrades.aspx` | Grade/mark submission |
| **Student Data** | (expandable) | Profile, Demographics, Contacts, Attendance, Grades |
| **Test Scores** | (expandable) | Test details and score reports |

**Student Data sub-menu:** Profile, Demographics, Contacts, Attendance, Grades (current, history, transcripts), Gradebook Summary/Details, Discipline.

### How to Select a Class/Period

From the gradebook dashboard, click any gradebook link (e.g., "5 - Intro Stats - Spring"). Within an open gradebook, use the class switcher dropdown (`a[data-dropcontent="gradebooks"]`) in the sub-navigation toolbar to switch between classes.

## 2. Gradebook Navigation

### Accessing the Gradebook

1. Click "Gradebook" in the sidebar (`a[href="/teacher/gradebook"]`)
2. Click a specific class from the gradebook dashboard
3. You land on the **Scores by Class** view

### URL Pattern

```
https://{district}.aeries.net/teacher/gradebook/{gradebookNumber}/{term}/ScoresByClass
```

- `{gradebookNumber}` — numeric ID (e.g., `1219616`)
- `{term}` — term code (e.g., `S` for Spring, `F` for Fall)

### Gradebook Sub-Navigation Toolbar

The toolbar at the top uses dropdown panels triggered by `data-dropcontent` attributes:

| Tab | `data-dropcontent` | Description |
|-----|-------------------|-------------|
| Class name | `gradebooks` | Switch between classes/periods |
| Dashboard | (direct link) | Back to gradebook list |
| Scores by Class | (direct link, `active` class when selected) | Main score grid |
| Assignments | `assignments` | Assignment list panel + Add Assignment |
| Students | `students` | Student roster (Active/Inactive) |
| Reports | `reports` | Report generation options |
| Manage | `manageactions` | Gradebook settings and configuration |

### Student List Layout (Scores by Class)

The left side uses `table.students` with these columns:

| Column | Data Attribute | Content |
|--------|---------------|---------|
| Row # | — | Sequential number |
| Name | `data-column-name="DisplayName"` | "LastName, FirstName MI." (clickable link) |
| Grade | `data-column-name="Grade"` | Grade level (11, 12, etc.) |
| % | `data-column-name="CurrentPercentage"` | Current percentage |
| Mark | `data-column-name="CurrentMark"` | Letter grade (A, B+, etc.) |

Student name cells also contain small icon links for quick access to student profile and contacts.

### Score Grid Layout

The right side uses `table.assignments` — a scrollable grid where:
- **Column headers** (`table.assignment-header`) show assignment name, due date, assignment number, and max points
- Header format: `"Assignment Name"` / `"MM/DD/YYYY #AssignNum : MaxPoints"`
- **Score cells** are `td` elements with rich data attributes (see Score Entry section)

### Display Options & Filtering

- `#chkDisplayFormativeSummativeIndicator`, `#chkShowFilters`, `#chkShowTrend` — toggle display modes
- Sorting: by Student Name or Assignment Due Date
- **Filter Sets**: `#showSavedFilters` | **Categories**: `#filterCategoriesButton` | **Save**: `#createFilter` | **Clear**: `#clearAllFilters`
- Category filter checkboxes: `input.filter-category[data-category="N"]`

## 3. Assignment Management

### Viewing Assignments

Click the **Assignments** tab (`a[data-dropcontent="assignments"]`) to open the assignments panel. It contains:
- Search box: `#assignmentsSearch` (placeholder: "Enter Description or Assignment #")
- **Add Assignment** button: `#subHeaderAddAssignment`
- Scrollable list of assignments sorted by due date (newest first)
- Each assignment shows as: `"AssignmentName - (MM/DD/YYYY)"`

### Clicking an Assignment Column Header

Each assignment column header contains a hidden info dialog (`.assignmentInfoDialog`) with:
- **Edit** link: `a.assignment-edit[data-assignment-number="N"]` — opens edit dialog
- **Enter Scores** link: navigates to `/teacher/gradebook/{gn}/{term}/ScoresByAssignment/Index/{an}`
- Read-only info: Assigned date, Due date, Number Correct Possible, Points Possible, Category, and visibility checkboxes

### Add/Edit Assignment Dialog

The assignment form opens in a Kendo Window (`#assignmentWindow`, `role="dialog"`).

**Form fields:**

| Field | Selector | Type | Notes |
|-------|----------|------|-------|
| # (Number) | `#Assignment_AssignmentNumber` | text/spinbutton | Auto-incremented |
| Name | `#Assignment_Description` | text | Assignment title |
| Description | `#Assignment_Comment` | textarea | Optional details |
| Type | `#Assignment_AssignmentType` | dropdown | Formative or Summative |
| Category | `#Assignment_Category` | dropdown | e.g., HW, GROUP, IND |
| Do Not Drop | `#Assignment_DoNotDrop` | checkbox | Exclude from drop rules |
| Extra Credit | `#ExtraCredit` | checkbox | Sets points to zero |
| Assigned On | `#Assignment_DateAssigned` | date picker | Date assigned |
| Due On | `#Assignment_DateDue` | date picker | Due date |
| Number Correct Possible | `#Assignment_MaxNumberCorrect` | number | Max correct answers |
| Points Possible | `#Assignment_MaxScore` | number | Point value for weighting |
| Grading Completed | `#Assignment_GradingCompleted` | checkbox | Mark grading done |
| Visible to Portal | `#Assignment_VisibleToParents` | checkbox | Parent portal visibility |
| Scores Visible to Portal | `#Assignment_ScoresVisibleToParents` | checkbox | Score visibility |
| Drop Box | `#Assignment_AllowDropBox` | checkbox | Enable file submissions |

**Dialog buttons**: Save, Save and Add New, Save and Add Recurring, Save and Close, Cancel. Checkbox `#PushToSelectedGradebooks` pushes to linked gradebooks.

### Assignment Categories

Categories are configured per gradebook. Observed categories:
- **HW** (Homework) — `data-category="0"`
- **GROUP** (Group work) — `data-category="1"`
- **IND** (Individual) — `data-category="2"`

Categories and their weights are managed via Manage → Categories.

## 4. Score Entry

### Scores by Class (Grid Entry)

On the Scores by Class view, each score cell is a `td` in `table.assignments` with these key data attributes:

| Attribute | Description |
|-----------|-------------|
| `data-sn` | Student number |
| `data-an` | Assignment number |
| `data-gn` | Gradebook number |
| `data-col-name` | Column type: `mk` (mark/score) |
| `data-original-value` | Current saved value |
| `data-edit` | Edit type: `txt_mk` (text input for mark) |
| `data-cid` | Category ID |
| `data-extra-credit` | Extra credit flag |
| `data-att` | Attendance notes on due date |
| `data-comment` | Score comment |
| `data-status` | Score status |

**To enter a score**: Click on a cell → it becomes an editable text input → type the score → Tab or click away to save. Scores auto-save on blur.

### Scores by Assignment (Detailed Entry)

**URL**: `https://{district}.aeries.net/teacher/gradebook/{gn}/{term}/ScoresByAssignment/Index/{an}`

This view shows all students for a single assignment with expanded columns:

| Column | `data-edit` | Purpose |
|--------|------------|---------|
| # Correct (Score) | `txt_mk` | The main score value |
| # Correct Possible | `txt_np` | Per-student possible (usually matches assignment max) |
| % | (calculated) | Auto-calculated percentage |
| Points Earned | (calculated) | Auto-calculated points |
| Points Possible | `txt_mx` | Per-student points possible |
| Comment | `txt_co` | Score-level comment |
| Date Completed | `dtp_dc` | Date picker for completion date |
| Status | `ddl_st` | Dropdown for score status |
| Att on Assigned Date | (read-only) | Attendance on assigned date |
| Att on Due Date | (read-only) | Attendance on due date |
| Submitted File | (read-only) | Drop box submission |

### Special Marks

Aeries supports these special marks in score cells (entered as text):
- **MI** or blank — Missing assignment
- **EX** — Exempt (excluded from grade calculation)
- **INS** — Insufficient/Incomplete
- Numeric values — Standard scores (e.g., 85, 93.5)

### Save Behavior

Score changes auto-save when the cell loses focus (blur event). There is no explicit "Save" button for individual scores. The `data-original-value` attribute tracks the last-saved value for change detection.

## 5. Student Information (Read-Only)

### Viewing Student Details

From the gradebook, click a student's name link to access their profile. The student name cells in `table.students` contain:
- Primary link: student name (navigates to student profile)
- Icon links: quick access to contacts and other info

Key pages under Student Data sidebar menu:

- **Profile** (`/teacher/StudentProfile.aspx`) — Overview with photo
- **Demographics** (`/teacher/Students.aspx`) — Full demographic details
- **Contacts** (`/teacher/EmergencyContacts.aspx`) — Parent/guardian phone, email
- **Attendance** (`/teacher/Attendance.aspx`) — Records by period
- **Grades** (`/teacher/StudentGrades.aspx`) — Current grades across classes
- **Grade History** (`/teacher/StudentGradeHistory.aspx`) — Past semester grades
- **Transcripts** (`/teacher/StudentTranscripts.aspx`) — Official transcript
- **Gradebook Summary/Details** (`StudentGradebookSummary.aspx`, `StudentGradebookDetails.aspx`)

A Kendo Window (`#aeries-studentcontactspopup`) can display contacts as a popup without navigating away.

## 6. Reports and Grade Export

### Accessing Reports

Click the **Reports** tab (`a[data-dropcontent="reports"]`) in the gradebook sub-navigation. Reports are organized into three categories:

**GRADEBOOK Reports:**
- Gradebook Assignments Analysis
- Gradebook Assignments By Student
- Gradebook Final Mark Analysis
- Gradebook Missing Assignments
- Gradebook Missing Assignments By Class
- Gradebook Roster
- Gradebook Summary
- Gradebook Summary By Standards
- **Gradebook Summary Export to Excel** — export grade data to spreadsheet

**PROGRESS Reports:**
- Progress By Class
- Progress By Student

**STANDARDS Reports:**
- Standards Progress By Student

### Global Reports Page

Accessible from the sidebar: `/teacher/Reports.aspx?cat=Student+Data` (Student Data reports) or `/teacher/Reports.aspx?cat=All` (all available reports).

### Grade Submission

The Grades page (`/teacher/TeacherGrades.aspx`) is used for final mark submission at the end of a term. This is separate from the gradebook — it's where calculated grades are officially submitted.

## Manage Menu

The **Manage** tab (`a[data-dropcontent="manageactions"]`) provides: Edit Gradebook, Options, Categories (weights), Assignments (bulk), Students (enrollment), Final Marks, Narrative Grades, Rules (drop lowest), Backups, Restore.

## CSS Selectors & Interaction Patterns

### Key Selectors

- **Root element**: `div[data-root-url][data-school-code][data-user-name]`
- **Sidebar menu**: `[data-role="treeview"] ul[role="tree"]`
- **Student table**: `table.students`
- **Score grid**: `table.assignments`
- **Assignment headers**: `table.assignment-header`
- **Score cell**: `td[data-col-name="mk"][data-edit="txt_mk"]`
- **Assignment dialog**: `#assignmentWindow[role="dialog"]`
- **Score cell by student+assignment**: `td[data-sn="{studentNum}"][data-an="{assignNum}"]`

### Common Interaction Patterns

- **Kendo UI framework**: Aeries uses Telerik Kendo UI — dialogs are `.k-window`, dropdowns are Kendo widgets
- **Auto-save on blur**: Score cells save when focus leaves the cell
- **Dropdown panels**: Sub-navigation uses `data-dropcontent` attribute to toggle panels (not page navigation)
- **Hidden dialogs**: Many dialogs (`.k-window`) exist in the DOM but are hidden (`display: none`) until triggered
- **Assignment info popover**: Click the caret icon (`.fa-caret-down`) on an assignment column header to reveal the `.assignmentInfoDialog`

## Tips & Gotchas

- Sessions expire after inactivity; you'll be redirected to `/teacher/Login.aspx` with a `?page=` param
- The gradebook sub-navigation (Assignments, Students, Reports, Manage) opens **dropdown panels on the same page** — these are NOT separate page navigations
- Assignment and score URLs encode the gradebook number and term in the path — always extract `{gn}` and `{term}` from the current URL
- Kendo date pickers: click calendar icon or type directly in combobox
- Multiple Kendo Windows exist in DOM at all times — check visibility before interacting
