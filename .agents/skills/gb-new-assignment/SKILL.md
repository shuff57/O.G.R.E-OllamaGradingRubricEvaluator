---
name: gb-new-assignment
description: Use when creating one or more missing assignments in an Aeries gradebook after gb-compare identified gaps, especially when Stage 2 of gb-pipeline needs a confirmation-gated, idempotent assignment-creation pass.
---

# gb-new-assignment

> Create missing Aeries assignments from validated comparison results without duplicating records. This skill reads the Stage 1 `gb-compare` temp file (or a manual fallback list), previews exactly what will be created vs. skipped, waits for explicit user approval, then fills the Aeries Add Assignment dialog with the correct MOM-derived values and writes a Stage 2 status file for the pipeline.

## Prerequisites
- Playwriter connected to a Chrome tab already on the correct Aeries gradebook page
- Teacher write access in Aeries
- Stage 1 comparison data available from `gb-compare` or a manually curated assignment list
- User available to approve the final create/skip preview before any writes

## When to Use
- User says "add these to Aeries", "create the missing assignments", or similar
- `gb-compare` already identified a `missing` assignment list for the same Aeries gradebook
- Stage 2 of `gb-pipeline` needs to create missing assignments before score sync

## When NOT to Use
- Read-only comparison work — use `gb-compare`
- Score entry or score reconciliation — use `gb-sync`
- Editing, deleting, or bulk-maintaining assignments that already exist in Aeries
- Any run where the assignment list has not been validated yet

## Guardrails

> ⚠️ **Must NOT:**
> - Never create assignments until you show the proposed **create list** and **skip list** and get explicit user approval.
> - Never create duplicates. Always scan existing Aeries assignments first and skip anything already present.
> - Never edit or delete an existing Aeries assignment in this workflow.
> - Never hardcode category indexes. Aeries category options are course-specific and must be matched by displayed name each run.
> - Never change MOM-derived category or points values during entry. Preserve the category exactly and map MOM `pts` into Aeries `#Assignment_MaxScore`.
> - Never navigate away from the Aeries gradebook page except for in-place Aeries dialogs already opened from that page.
> - Never trust a save without verification. Confirm the modal state after each save and run a post-batch verification pass before writing the completion temp file.
> - Never overwrite the Stage 2 temp file with false success. Record created, skipped, and failed assignments separately.

## Quick Start
1. Load the missing assignments from the Stage 1 `gb_compare_{gradebookNum}.json` file.
2. Scan current Aeries assignments, build the create/skip preview, and get explicit user approval.
3. Create only the remaining assignments, verify them, then write `gb_new_assignment_{gradebookNum}.json`.

## Workflow

### Phase 1: Attach to the Correct Aeries Gradebook
- **INPUT:** Open browser tabs managed by Playwriter
- **ACTION:**
  - Find the Aeries page whose URL contains both `aeries` and `gradebook`.
  - Confirm the page responds before doing any extraction.
  - Extract `gradebookNum` from the URL for temp-file naming.
- **OUTPUT:** Live `state.aeries` page plus `gradebookNum` for Stage 2 input/output.

```javascript
const aeriesPage = context.pages().find(p =>
  p.url().includes('aeries') && p.url().toLowerCase().includes('gradebook')
);
if (!aeriesPage) throw new Error('No Aeries Gradebook tab found — open it first.');
await aeriesPage.evaluate(() => document.title);
state.aeries = aeriesPage;
const gradebookNum = state.aeries.url().match(/gradebook\/(\d+)/)?.[1] ?? 'unknown';
```

### Phase 2: Load the Stage 1 Input File or Manual Fallback
- **INPUT:** `gradebookNum` and optional user-provided assignments
- **ACTION:**
  - Read the Stage 1 temp file first.
  - Preserve the legacy temp-file references exactly:
    - Input: `C:\Users\shuff\grade-cloning\temp\gb_compare_${gradebookNum}.json`
    - Output: `C:\Users\shuff\grade-cloning\temp\gb_new_assignment_${gradebookNum}.json`
  - If the compare file exists, use `compareData.missing` directly.
  - If the compare file is absent, fall back to a manual assignment list supplied by the user.
  - Normalize every item into this shape:
    `{ name, category, pts, assignedDate, dueDate }`
- **OUTPUT:** Candidate assignment list for idempotency review.

```javascript
const fs = require('fs');
const comparePath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_compare_${gradebookNum}.json`;

let assignments;
if (fs.existsSync(comparePath)) {
  const compareData = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  assignments = compareData.missing.map(a => ({
    name: a.name,
    category: a.category,
    pts: a.pts,
    assignedDate: a.assignedDate,
    dueDate: a.dueDate,
  }));
  console.log('Loaded ' + assignments.length + ' missing assignments from gb_compare temp file');
} else {
  console.warn('No gb_compare temp file at ' + comparePath + ' — using manual assignment list');
  assignments = [/* user-provided fallback */];
}
```

### Phase 3: Preflight Idempotency Scan + Approval Gate
- **INPUT:** Candidate assignments and the live Aeries gradebook page
- **ACTION:**
  - Scrape existing Aeries assignments before opening the Add Assignment modal.
  - Use the full assignment name when available:
    `a.assignment-edit[data-assignment-name]` first, then fall back to `th[data-an]` text.
  - Normalize whitespace/case and compare by normalized full name.
  - Split the incoming list into:
    - `toCreate` — not already present in Aeries
    - `skippedExisting` — already present, therefore skipped
  - Show the user a preview containing both lists and wait for explicit approval.
  - If `toCreate.length === 0`, stop safely and still write a completion file showing only skips.
- **OUTPUT:** Approved `toCreate` list and a recorded `skippedExisting` list.

```javascript
function normalizeName(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const existingNames = await state.aeries.evaluate(() => {
  return [...document.querySelectorAll('th[data-an]')].map(th => {
    const full = th.querySelector('a.assignment-edit')?.getAttribute('data-assignment-name');
    return (full || th.textContent || '').trim();
  });
});

const existingSet = new Set(existingNames.map(normalizeName));
const skippedExisting = [];
const toCreate = [];

for (const assignment of assignments) {
  if (existingSet.has(normalizeName(assignment.name))) {
    skippedExisting.push(assignment);
  } else {
    toCreate.push(assignment);
  }
}

console.log(JSON.stringify({
  toCreate: toCreate.map(a => ({ name: a.name, category: a.category, pts: a.pts })),
  skippedExisting: skippedExisting.map(a => ({ name: a.name, category: a.category, pts: a.pts })),
}, null, 2));
// STOP here and get explicit user approval before opening the add form.
```

### Phase 4: Open the Add Assignment Dialog
- **INPUT:** Approved `toCreate` list
- **ACTION:**
  - On the first item only, click `#subHeaderAddAssignment`.
  - Do **not** wait for navigation; this opens a Kendo modal in place.
  - Wait briefly, then verify `#Assignment_Description` exists before continuing.
  - On later items, reuse the blank form opened by **Save and Add New**.
- **OUTPUT:** Ready Aeries assignment form.

```javascript
if (i === 0) {
  await state.aeries.locator('#subHeaderAddAssignment').click();
  await state.aeries.waitForTimeout(1500);
  const isOpen = await state.aeries.evaluate(() => !!document.querySelector('#Assignment_Description'));
  if (!isOpen) throw new Error('Add Assignment modal did not open.');
}
```

### Phase 5: Fill the Aeries Form with MOM Data
- **INPUT:** One approved assignment: `{ name, category, pts, assignedDate, dueDate }`
- **ACTION:**
  - Fill **Name** into `#Assignment_Description`.
  - Resolve **Category** through the Kendo DropDownList at `#Assignment_Category` by matching the displayed category name exactly.
  - Set **Assigned On** and **Due On** through Kendo DatePickers:
    `#Assignment_DateAssigned` and `#Assignment_DateDue`.
  - Set **Number Correct Possible** in `#Assignment_MaxNumberCorrect` to `100` so Stage 3 score sync can enter percentages consistently.
  - Set **Points Possible** in `#Assignment_MaxScore` to the exact MOM `pts` value.
- **OUTPUT:** A fully populated assignment form ready to save.

#### Field Mapping

| MOM field | Aeries field | Selector | Entry rule |
|-----------|--------------|----------|------------|
| `name` | Name | `#Assignment_Description` | `.fill(name)` |
| `category` | Category | `#Assignment_Category` | Kendo DropDownList, match by displayed `.name` |
| `assignedDate` | Assigned On | `#Assignment_DateAssigned` | Kendo DatePicker `.value(new Date(...))` |
| `dueDate` | Due On | `#Assignment_DateDue` | Kendo DatePicker `.value(new Date(...))` |
| `pts` | Points Possible | `#Assignment_MaxScore` | Use the exact MOM point value |
| pipeline scoring scale | Number Correct Possible | `#Assignment_MaxNumberCorrect` | Set to `100` for percentage-based Stage 3 sync |

```javascript
await state.aeries.locator('#Assignment_Description').fill(a.name);

const catOptions = await state.aeries.evaluate(() => {
  const ddl = jQuery('#Assignment_Category').data('kendoDropDownList');
  return ddl.dataSource.data().map((d, idx) => {
    const obj = typeof d.toJSON === 'function' ? d.toJSON() : d;
    return { idx, name: obj.Name || obj.name };
  });
});
const catIdx = catOptions.findIndex(o => o.name === a.category);
if (catIdx === -1) throw new Error(`Category "${a.category}" not found. Available: ${catOptions.map(o => o.name).join(', ')}`);
await state.aeries.evaluate((idx) => {
  const ddl = jQuery('#Assignment_Category').data('kendoDropDownList');
  ddl.select(idx);
  ddl.trigger('change');
}, catIdx);

await state.aeries.evaluate(({ ad, dd }) => {
  const assigned = jQuery('#Assignment_DateAssigned').data('kendoDatePicker');
  assigned.value(new Date(ad)); assigned.trigger('change');
  const due = jQuery('#Assignment_DateDue').data('kendoDatePicker');
  due.value(new Date(dd)); due.trigger('change');
}, { ad: a.assignedDate, dd: a.dueDate });

await state.aeries.locator('#Assignment_MaxNumberCorrect').click({ clickCount: 3 });
await state.aeries.locator('#Assignment_MaxNumberCorrect').fill('100');
await state.aeries.locator('#Assignment_MaxScore').click({ clickCount: 3 });
await state.aeries.locator('#Assignment_MaxScore').fill(String(a.pts));
```

### Phase 6: Save Each Assignment in the Correct Sequence
- **INPUT:** Populated form and loop position
- **ACTION:**
  - If more assignments remain, click `#assignmentSaveNAdd`.
  - If this is the last assignment (or the only one), click `#assignmentSaveNClose`.
  - Remember: these save controls are `<span>` elements, not accessible buttons.
  - After each save, verify the expected modal state:
    - intermediate save: blank form reopened
    - final save: modal closed
- **OUTPUT:** Saved assignment plus either the next blank form or a closed modal.

```javascript
if (isLast) {
  await state.aeries.locator('#assignmentSaveNClose').click();
  await state.aeries.waitForTimeout(3000);
  const stillOpen = await state.aeries.evaluate(() => !!document.querySelector('#assignmentSave'));
  if (stillOpen) throw new Error('Modal still open after Save — check for validation errors.');
  console.log('Saved and closed: "' + a.name + '"');
} else {
  await state.aeries.locator('#assignmentSaveNAdd').click();
  await state.aeries.waitForTimeout(2000);
  const newFormOpen = await state.aeries.evaluate(() => {
    const f = document.querySelector('#Assignment_Description');
    return f && f.value === '';
  });
  if (!newFormOpen) throw new Error('New blank form did not open after Save and Add New.');
  console.log('Saved, opening next form: "' + a.name + '"');
}
```

### Phase 7: Verify the Batch Before Writing Stage 2 Output
- **INPUT:** `toCreate` and `skippedExisting`
- **ACTION:**
  - Reload the gradebook page after the batch.
  - Re-scrape assignment names from the page.
  - Confirm each newly created assignment exists by normalized full-name matching.
  - Record three lists:
    - `created`
    - `skippedExisting`
    - `failed`
- **OUTPUT:** Verified Stage 2 result set.

```javascript
await state.aeries.reload({ waitUntil: 'domcontentloaded' });
await state.aeries.waitForTimeout(3000);

const finalNames = await state.aeries.evaluate(() => {
  return [...document.querySelectorAll('th[data-an]')].map(th => {
    const full = th.querySelector('a.assignment-edit')?.getAttribute('data-assignment-name');
    return (full || th.textContent || '').trim();
  });
});

const finalSet = new Set(finalNames.map(normalizeName));
const created = [];
const failed = [];

for (const assignment of toCreate) {
  if (finalSet.has(normalizeName(assignment.name))) created.push(assignment.name);
  else failed.push(assignment.name);
}
```

### Phase 8: Write the Stage 2 Temp File
- **INPUT:** Verified `created`, `skippedExisting`, and `failed` lists
- **ACTION:**
  - Ensure the temp directory exists.
  - Write the Stage 2 completion file at:
    `C:\Users\shuff\grade-cloning\temp\gb_new_assignment_${gradebookNum}.json`
  - Preserve enough data for `gb-pipeline` to decide whether Stage 2 succeeded and whether a rerun should skip existing items.
- **OUTPUT:** Stage 2 temp file for the pipeline.

```javascript
const tempPath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_new_assignment_${gradebookNum}.json`;
fs.mkdirSync('C:\\Users\\shuff\\grade-cloning\\temp', { recursive: true });
fs.writeFileSync(tempPath, JSON.stringify({
  metadata: {
    gradebookNum,
    completedAt: new Date().toISOString(),
  },
  created,
  skippedExisting: skippedExisting.map(a => a.name),
  failed,
}, null, 2));
console.log('Completion temp file written: ' + tempPath);
```

## Error Handling

| Problem | Action |
|---------|--------|
| No Aeries gradebook tab found | Stop and ask the user to open the correct Aeries gradebook tab. |
| Stage 1 temp file missing | Fall back to a manual list only if the user explicitly provides one; otherwise stop and run `gb-compare` first. |
| Category not found in Aeries | Stop the batch, report available category names, and ask the user how to map the missing category. |
| `jQuery is not defined` or Kendo widget missing | Wait briefly, retry once, then stop if the dialog widgets still are not available. |
| Modal stays open after save | Treat as a validation failure; inspect required fields before attempting the next assignment. |
| Reload verification shows assignment missing | Put the assignment in `failed`, do not claim success, and preserve the failure in the Stage 2 temp file. |
| All assignments already exist | Report that Stage 2 is a no-op, record the skip list, and write the completion file without opening the add dialog. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Clicking Add Assignment and waiting for navigation | This is an in-place Kendo modal. Use `.click()` and then verify `#Assignment_Description`. |
| Using `getByRole('button', { name: 'Save' })` | Save controls are `<span>` elements. Use `#assignmentSaveNAdd` and `#assignmentSaveNClose`. |
| Hardcoding category index `0/1/2` | Read category options dynamically from the Kendo DropDownList and match by displayed name. |
| Filling date text directly | Kendo DatePickers ignore raw `.fill()` calls; use `.data('kendoDatePicker').value(new Date(...))`. |
| Forgetting to triple-click numeric fields before `.fill()` | Existing values can append. Triple-click first for `#Assignment_MaxNumberCorrect` and `#Assignment_MaxScore`. |
| Re-running Stage 2 without an idempotency scan | Always scrape current Aeries assignments first so duplicates are skipped instead of recreated. |
| Treating a fuzzy prefix match as verification | Re-scrape full assignment names and compare normalized full names, not just truncated prefixes. |

## State Management

### Temp-file contract

| File | Producer | Consumer | Purpose |
|------|----------|----------|---------|
| `C:\Users\shuff\grade-cloning\temp\gb_compare_{gradebookNum}.json` | `gb-compare` | `gb-new-assignment` | Stage 1 input containing `missing` assignments with MOM metadata |
| `C:\Users\shuff\grade-cloning\temp\gb_new_assignment_{gradebookNum}.json` | `gb-new-assignment` | `gb-pipeline` / human operator | Stage 2 output recording created, skipped, and failed assignments |

### Input shape from Stage 1

```json
{
  "metadata": {
    "gradebookNum": "12345",
    "aeriesBase": "https://example.aeries.net",
    "extractedAt": "2026-03-15T12:00:00.000Z"
  },
  "missing": [
    {
      "name": "Homework 3.1",
      "pts": 12,
      "category": "HW",
      "weight": "15%",
      "assignedDate": "01/28/2026",
      "dueDate": "01/28/2026"
    }
  ]
}
```

### Output shape from Stage 2

```json
{
  "metadata": {
    "gradebookNum": "12345",
    "completedAt": "2026-03-15T12:20:00.000Z"
  },
  "created": ["Homework 3.1"],
  "skippedExisting": ["Homework 2.9"],
  "failed": []
}
```

## Selectors / References

### Aeries assignment creation selectors

| Element | Selector | Notes |
|---------|----------|-------|
| Add Assignment launcher | `#subHeaderAddAssignment` | Opens the assignment Kendo modal in place |
| Assignment name | `#Assignment_Description` | Plain text input |
| Category | `#Assignment_Category` | Kendo DropDownList |
| Assigned On | `#Assignment_DateAssigned` | Kendo DatePicker |
| Due On | `#Assignment_DateDue` | Kendo DatePicker |
| Number Correct Possible | `#Assignment_MaxNumberCorrect` | Plain input; use `100` for Stage 3 percentage sync |
| Points Possible | `#Assignment_MaxScore` | Plain input; use exact MOM `pts` |
| Save and Add New | `#assignmentSaveNAdd` | `<span>` element |
| Save and Close | `#assignmentSaveNClose` | `<span>` element |
| Existing assignment headers | `th[data-an]` | Use with `a.assignment-edit[data-assignment-name]` when available |

### Non-obvious Aeries behaviors

| Behavior | Rule |
|----------|------|
| `#subHeaderAddAssignment` is a link-like launcher, not a full-page navigation | Click only; do not wait for navigation |
| Category widget is Kendo, not native `<select>` | Use `jQuery('#Assignment_Category').data('kendoDropDownList')` |
| Date fields are Kendo DatePickers | Use `.value(new Date(...))`, not `.fill()` |
| Save controls are `<span>` elements | Use ID selectors directly |
| Save is asynchronous | Use a short wait plus modal-state verification instead of page-load waiting |
