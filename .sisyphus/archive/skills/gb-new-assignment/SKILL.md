---
name: gb-new-assignment
description: Use when creating one or more assignments in an Aeries gradebook via Playwriter browser automation. Triggers include "add these to Aeries", "create the missing assignments", or after gb-compare identifies missing assignments.
---
# Aeries Add Assignments

Automate adding assignments to Aeries via Playwriter. Handles Kendo UI dropdowns, date pickers, and batch creation.

## Prerequisites

- **Playwriter MCP** enabled, extension active on Aeries Gradebook tab
- **Assignment data ready** — each item needs: `name`, `category`, `assignedDate`, `dueDate`
- **Confirm the assignment list with user before starting**

## Safety Rules

> ⚠️ NEVER delete, edit, or grade existing assignments.
> ⚠️ NEVER navigate away from the Aeries Gradebook page.
> ⚠️ Verify each assignment saved before moving to the next.

---

## Critical Discoveries

Non-obvious behaviors that cause silent failures:

| Behavior | Rule |
|----------|------|
| `#subHeaderAddAssignment` is a `<link>`, not a button | Click only — no navigation wait. Opens a Kendo modal in-place. |
| Category = **Kendo DropDownList** | No native `<select>`. Use `jQuery('#Assignment_Category').data('kendoDropDownList')`. |
| Date fields = **Kendo DatePickers** | Use `.data('kendoDatePicker').value(new Date(...))`. Do NOT `.fill()` — Kendo ignores it. |
| `#Assignment_MaxNumberCorrect` looks like Kendo but is a **plain `<input>`** | Triple-click + `.fill()`. |
| Save buttons are **`<span>` elements** | `getByRole('button', { name: 'Save' })` finds nothing. Use IDs: `#assignmentSaveNClose`, `#assignmentSaveNAdd`. |
| Category options are **course-specific** | Always read options dynamically — never hardcode index. Match by `.name`. |
| Save is **async (AJAX)** | `waitForPageLoad` hangs. Use `waitForTimeout(3000)` + check modal closed. |

---

## Quick Reference

### Field Selectors

| Field | Selector | How to Set |
|-------|---------|-----------|
| Name | `#Assignment_Description` | `.fill(name)` |
| Category | `#Assignment_Category` | Kendo DropDownList — see Step 3 in loop |
| Assigned On | `#Assignment_DateAssigned` | Kendo DatePicker — see Step 4 in loop |
| Due On | `#Assignment_DateDue` | Kendo DatePicker — see Step 4 in loop |
| Number Correct | `#Assignment_MaxNumberCorrect` | Always **100** — scores are entered as percentages |
| Points Possible | `#Assignment_MaxScore` | Leave at 100 (Aeries default) |

### Save Button IDs (all `<span>` elements)

| ID | Use When |
|----|---------|
| `#assignmentSaveNClose` | Last (or only) assignment — saves and closes modal |
| `#assignmentSaveNAdd` | More assignments follow — saves and opens blank form |
| `#assignmentSave` | Save without closing modal |
| `#assignmentCancel` | Cancel without saving |

---

## Session Setup

```javascript
const aeriesPage = context.pages().find(p =>
  p.url().includes('aeries') && p.url().toLowerCase().includes('gradebook')
);
if (!aeriesPage) throw new Error('No Aeries Gradebook tab found — open it first.');
state.aeries = aeriesPage;
```

---

## Temp File Input (from gb-compare)

If running as Stage 2 of `gb-pipeline`, read the Stage 1 temp file to get the missing assignments list automatically — no manual entry needed.

```javascript
const fs = require('fs');
const gradebookNum = state.aeries.url().match(/gradebook\/(\d+)/)?.[1] ?? 'unknown';
const comparePath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_compare_${gradebookNum}.json`;

let assignments;
if (fs.existsSync(comparePath)) {
  const compareData = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  assignments = compareData.missing.map(a => ({
    name: a.name,
    category: a.category,          // e.g. "GROUP", "HW", "IND"
    assignedDate: a.assignedDate,  // MM/DD/YYYY or null
    dueDate: a.dueDate,            // MM/DD/YYYY or null
  }));
  console.log('Loaded ' + assignments.length + ' missing assignments from gb_compare temp file');
} else {
  console.warn('No gb_compare temp file at ' + comparePath + ' — using manual assignment list');
  assignments = [/* user-provided fallback */];
}
```

The `assignments` array feeds directly into the Add Assignments (Batch Loop) below.

---

## Add Assignments (Batch Loop)

Handles both single and multiple assignments — `isLast` takes care of the single-assignment case.

```javascript
// assignments = loaded from temp file above (or user-provided)
// Each: { name, category, assignedDate, dueDate }
// assignedDate/dueDate format: 'MM/DD/YYYY'

for (let i = 0; i < assignments.length; i++) {
  const a = assignments[i];
  const isLast = i === assignments.length - 1;

  // Step 1: Open form (first iteration only — subsequent iterations reuse form opened by Save and Add New)
  if (i === 0) {
    await state.aeries.locator('#subHeaderAddAssignment').click();
    await state.aeries.waitForTimeout(1500);
    const isOpen = await state.aeries.evaluate(() => !!document.querySelector('#Assignment_Description'));
    if (!isOpen) throw new Error('Add Assignment modal did not open.');
  }

  // Step 2: Name
  await state.aeries.locator('#Assignment_Description').fill(a.name);

  // Step 3: Category (Kendo DropDownList — read options every time; order is course-specific)
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

  // Step 4: Dates (Kendo DatePickers)
  await state.aeries.evaluate(({ ad, dd }) => {
    const assigned = jQuery('#Assignment_DateAssigned').data('kendoDatePicker');
    assigned.value(new Date(ad)); assigned.trigger('change');
    const due = jQuery('#Assignment_DateDue').data('kendoDatePicker');
    due.value(new Date(dd)); due.trigger('change');
  }, { ad: a.assignedDate, dd: a.dueDate });

  // Step 5: Number Correct — always 100 (scores are entered as percentages, so 85% = 85/100)
  await state.aeries.locator('#Assignment_MaxNumberCorrect').click({ clickCount: 3 });
  await state.aeries.locator('#Assignment_MaxNumberCorrect').fill('100');

  // Step 6: Save
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
}

console.log('Done. Added ' + assignments.length + ' assignment(s).');
```

---

## Verify After Completion

Reload and confirm each assignment appears in the gradebook:

```javascript
await state.aeries.reload({ waitUntil: 'domcontentloaded' });
await state.aeries.waitForTimeout(3000);

const addedNames = assignments.map(a => a.name);
const results = await state.aeries.evaluate((names) => {
  const all = [
    ...document.querySelectorAll('th[data-an]'),
    ...document.querySelectorAll('a.assignment-edit'),
  ].map(el => el.textContent.trim()).join(' | ');
  return names.map(name => ({
    name,
    found: all.toLowerCase().includes(name.toLowerCase().slice(0, 15)),
  }));
}, addedNames);

results.forEach(r => console.log(r.found ? 'OK: ' + r.name : 'MISSING: ' + r.name));
```

---

## Write Completion Temp File

After verification, write a temp file confirming what was created. The `gb-pipeline` orchestrator reads this before starting Stage 3.

```javascript
const tempPath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_new_assignment_${gradebookNum}.json`;
fs.writeFileSync(tempPath, JSON.stringify({
  metadata: {
    gradebookNum,
    completedAt: new Date().toISOString(),
  },
  created: results.filter(r => r.found).map(r => r.name),
  failed:  results.filter(r => !r.found).map(r => r.name),
}, null, 2));
console.log('Completion temp file written: ' + tempPath);
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Modal did not open | Reload page; verify Playwriter is active on tab |
| `jQuery is not defined` | `waitForTimeout(2000)` then retry |
| Category not found | Log `catOptions` to see available names |
| Modal still open after save | Take screenshot; check required fields |
| New blank form didn't open | Increase `waitForTimeout`; retry once |
| Assignment missing after reload | Re-add manually; check page console for errors |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `waitForNavigation` after clicking Add Assignment | Just `.click()` + `waitForTimeout(1500)` — no navigation occurs |
| `getByRole('button', { name: 'Save' })` | Use `#assignmentSaveNClose` by ID — Save is a `<span>` |
| Hardcoding category index (0, 1, 2...) | Always read options and match by `.name` |
| `querySelector('dialog')` returns null | It's a Kendo window — target fields directly by `#id` |
| `.fill('01/28/2026')` on date field | Kendo ignores `.fill()` — use `.data('kendoDatePicker').value(new Date(...))` |
| Not triple-clicking before `.fill('100')` on Number Correct | Value appends → "100100" — always `.click({ clickCount: 3 })` first |
| Skipping Phase 4 verification | Silent save failures go undetected — always reload and confirm |
| Not writing completion temp file | gb-pipeline orchestrator can't confirm Stage 2 succeeded |
