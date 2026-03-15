---
name: gb-compare
description: Use when comparing MyOpenMath gradebook assignments against an Aeries gradebook to find missing assignments, check category totals, or produce the read-only comparison artifacts required before gb-new-assignment or gb-pipeline.
---

# Grade Compare

> Compare assignments between MyOpenMath (MOM) and Aeries without modifying either system. This skill expands MOM categories, extracts assignment names/points/dates, reads existing Aeries assignments, applies number-anchored matching, and produces both a markdown report and the temp `gb_compare_{gradebookNum}.json` artifact consumed by later gradebook-sync stages.

## Overview
- Stage order: `gb-compare` always runs before `gb-new-assignment` or `gb-pipeline`
- Source of truth for missing assignments: current MOM gradebook page vs current Aeries gradebook page
- Main outputs:
  - `grade-cloning/gradebook-comparison.md`
  - `C:\Users\shuff\grade-cloning\temp\gb_compare_{gradebookNum}.json`
- Matching rule: assignment numbers are the strongest signal; names are secondary
- Mutation policy: read-only and idempotent; reruns only refresh local report/temp outputs

## Prerequisites
- Playwriter MCP enabled and connected
- Two browser tabs open for the same course:
  - MyOpenMath gradebook
  - Aeries gradebook
- Playwriter active on both tabs
- Permission to write local comparison artifacts

## When to Use
- User asks which MOM assignments are missing from Aeries
- User wants a report of present vs missing assignments before adding anything
- User wants counts by category or a preflight check before `gb-new-assignment`
- A gradebook-sync workflow needs the temp JSON payload for the next stage

## When NOT to Use
- Creating, editing, or deleting Aeries assignments
- Entering scores or syncing grades
- Situations where either gradebook tab is missing or not Playwriter-enabled
- Cases where the user wants silent mutations instead of a read-only comparison

## Guardrails

> ⚠️ **Must NOT:**
> - Never click **Add**, **Edit**, **Delete**, **Save**, or any grading control in Aeries.
> - Never navigate away from the current MOM or Aeries gradebook pages.
> - Never report missing assignments from exact-string matching alone; use the number-anchored matcher.
> - Never compare MOM point values to Aeries point values as an equality check; Aeries normalizes assignments to 100 points.
> - Never lose the temp JSON shape or rename its top-level keys; `gb-new-assignment` depends on them.
> - Never invent dates; if MOM settings fetch fails or is skipped, keep `assignedDate`/`dueDate` null in JSON and show `—` in markdown.
> - Never present this skill as making changes. `gb-compare` is read-only and idempotent.

## Quick Start
1. Detect the MOM and Aeries gradebook tabs and verify both respond.
2. Extract MOM categories, assignments, and optional dates; extract Aeries assignment headers.
3. Match, report, and write `gb_compare_{gradebookNum}.json` for the next stage.

## Workflow

### Phase 1: Session Setup and Tab Detection
- **INPUT:** Browser context with open tabs
- **ACTION:** Find the active MOM and Aeries gradebook tabs, confirm both are reachable, and derive `gradebookNum` plus the Aeries base URL for artifact metadata.
- **OUTPUT:** `momPage`, `aeriesPage`, `gradebookNum`, `aeriesBase`

```javascript
const pages = context.pages();
const momPage = pages.find((p) => p.url().includes('myopenmath.com'));
const aeriesPage = pages.find(
  (p) => p.url().includes('aeries') && p.url().toLowerCase().includes('gradebook')
);

if (!momPage) throw new Error('No MyOpenMath tab found — open the MOM gradebook first.');
if (!aeriesPage) throw new Error('No Aeries Gradebook tab found — open Aeries first.');

await momPage.evaluate(() => document.title);
await aeriesPage.evaluate(() => document.title);

const gradebookNum = aeriesPage.url().match(/gradebook\/(\d+)/)?.[1] ?? 'unknown';
const aeriesBase = new URL(aeriesPage.url()).origin;
```

### Phase 2: Extract MyOpenMath Categories and Assignments
- **INPUT:** MOM gradebook page
- **ACTION:**
  1. Set `#availshow` to value `2` so MOM shows **All** assignments.
  2. Build `catMap` from `span.cattothdr` headers and the parent `th` class (`cat1`, `cat2`, `cat3`).
  3. Expand every collapsed category by clicking all `[Expand]` links until none remain.
  4. Extract assignments from `th[data-pts]`, using the first text node only for the clean assignment name.
  5. Capture `aid` and `cid` from the settings link so dates can be fetched later.
- **OUTPUT:** `catMap`, `momAssignments`

#### 2A. Set Show Filter to All
```javascript
await momPage.evaluate(() => {
  const sel = document.querySelector('#availshow');
  if (sel) {
    sel.value = '2';
    sel.dispatchEvent(new Event('change'));
  }
});
await new Promise((r) => setTimeout(r, 1500));
```

#### 2B. Build Category Map from MOM Headers
```javascript
const catMap = await momPage.evaluate(() => {
  const map = {};
  document.querySelectorAll('span.cattothdr').forEach((span) => {
    const text = span.textContent.trim();
    const match = text.match(/^(\S+)\s+(\d+%?)$/);
    if (!match) return;
    const th = span.closest('th');
    const cls = ['cat1', 'cat2', 'cat3'].find((c) => th.classList.contains(c));
    if (cls) map[cls] = { name: match[1], weight: match[2] };
  });
  return map;
});
```

#### 2C. Expand All MOM Categories
```javascript
while (true) {
  const clicked = await momPage.evaluate(() => {
    const links = [...document.querySelectorAll('a')].filter((a) =>
      a.textContent.includes('[Expand]')
    );
    links.forEach((a) => a.click());
    return links.length;
  });
  if (clicked === 0) break;
  await new Promise((r) => setTimeout(r, 500));
}
```

#### 2D. Extract MOM Assignment Name, Points, Category, and IDs
```javascript
const momAssignments = await momPage.evaluate((catMap) => {
  const results = [];
  document.querySelectorAll('th[data-pts]').forEach((th) => {
    const nameDiv = th.querySelector('div');
    const name = nameDiv ? nameDiv.childNodes[0].textContent.trim() : '';
    const pts = th.getAttribute('data-pts');
    const cls = ['cat1', 'cat2', 'cat3'].find((c) => th.classList.contains(c));
    const category = cls && catMap[cls] ? catMap[cls].name : 'UNKNOWN';
    const weight = cls && catMap[cls] ? catMap[cls].weight : '';

    const settingsLink = th.querySelector('a[href*="moasettings"]');
    let aid = null;
    let cid = null;
    if (settingsLink) {
      const params = new URLSearchParams(settingsLink.href.split('?')[1]);
      aid = params.get('aid');
      cid = params.get('cid');
    }

    results.push({ name, pts, category, weight, aid, cid });
  });
  return results;
}, catMap);
```

### Phase 3: Fetch Assigned and Due Dates from MOM Settings (Optional but Preferred)
- **INPUT:** `momAssignments` with `aid`/`cid`
- **ACTION:** Fetch each `moasettings.php` page while already authenticated in MOM, then parse `sdate` as `assignedDate` and `edate` as `dueDate`.
- **OUTPUT:** `momAssignmentsWithDates`

```javascript
const momAssignmentsWithDates = await momPage.evaluate(async (assignments) => {
  return Promise.all(
    assignments.map(async (a) => {
      if (!a.aid || !a.cid) return { ...a, assignedDate: null, dueDate: null };

      const url = `https://www.myopenmath.com/course/moasettings.php?cid=${a.cid}&aid=${a.aid}`;
      try {
        const html = await fetch(url).then((r) => r.text());
        const sdateMatch = html.match(/name="sdate"[^>]*value="([^"]+)"/);
        const edateMatch = html.match(/name="edate"[^>]*value="([^"]+)"/);
        return {
          ...a,
          assignedDate: sdateMatch ? sdateMatch[1] : null,
          dueDate: edateMatch ? edateMatch[1] : null,
        };
      } catch {
        return { ...a, assignedDate: null, dueDate: null };
      }
    })
  );
}, momAssignments);
```

Date rules:
- `sdate` = assigned-on date
- `edate` = due date
- If this phase is skipped, keep JSON dates `null` and render markdown dates as `—`

### Phase 4: Extract Existing Aeries Assignments
- **INPUT:** Aeries gradebook page
- **ACTION:** Read all `th[data-an]` headers. Use `textContent.trim()` for assignment names so HTML entities decode correctly (`&amp;` → `&`).
- **OUTPUT:** `aeriesAssignments`

```javascript
const aeriesAssignments = await aeriesPage.evaluate(() => {
  const results = [];
  document.querySelectorAll('th[data-an]').forEach((th) => {
    const number = th.getAttribute('data-an');
    const name = th.textContent.trim();
    results.push({ number, name });
  });
  return results;
});
```

### Phase 5: Compare MOM vs Aeries with Number-Anchored Matching
- **INPUT:** MOM assignments and Aeries assignments
- **ACTION:** Normalize punctuation, extract numbers and words, score candidate matches with numbers weighted more heavily than words, and classify unmatched MOM rows as missing from Aeries.
- **OUTPUT:** `matched`, `missing`

```javascript
function normalize(s) {
  return s.toLowerCase().replace(/--/g, ' ').replace(/[(),&]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractNumbers(s) {
  return [...s.matchAll(/\d+\.?\d*/g)].map((m) => m[0]);
}

function extractWords(s) {
  return normalize(s).split(' ').filter((w) => w.length > 1 && !/^\d/.test(w));
}

function matchAssignments(momList, aeriesList) {
  const matched = [];
  const missing = [];
  const used = new Set();

  for (const mom of momList) {
    const mNums = extractNumbers(mom.name);
    const mWords = extractWords(mom.name);
    let best = null;
    let bestScore = 0;

    for (let i = 0; i < aeriesList.length; i++) {
      if (used.has(i)) continue;
      const a = aeriesList[i];
      const aNums = extractNumbers(a.name);
      const overlap = mNums.filter((n) => aNums.includes(n)).length;
      const numScore = overlap / Math.max(mNums.length, aNums.length, 1);
      if (numScore === 0) continue;

      const aWords = extractWords(a.name);
      const wordOverlap = mWords.filter((w) => aWords.includes(w)).length;
      const wordScore = wordOverlap / Math.max(mWords.length, aWords.length, 1);
      const score = numScore * 0.7 + wordScore * 0.3;

      if (score > bestScore) {
        bestScore = score;
        best = { idx: i, ...a };
      }
    }

    if (best && bestScore >= 0.4) {
      used.add(best.idx);
      matched.push({ mom, aeries: best, score: bestScore });
    } else {
      missing.push(mom);
    }
  }

  return { matched, missing };
}
```

Matching rules:
- Threshold: `0.4`
- Why: allows cases like `Homework 5.1, 5.2 (part 1)` vs `5.1 & 5.2 Confidence Intervals`
- Never fall back to point-value comparison for presence detection

### Phase 6: Write the Markdown Comparison Report
- **INPUT:** `matched`, `missing`, category totals, and MOM dates if available
- **ACTION:** Save a teacher-readable report showing missing assignments first, then the full comparison, then category totals.
- **OUTPUT:** `grade-cloning/gradebook-comparison.md`

Use this report format:

```markdown
# Gradebook Comparison: MyOpenMath → Aeries
**Course**: {course name from page title}
**Date**: {today's date}
---
## Assignments Missing from Aeries
| MyOpenMath Name | Category | MOM Points | Assigned On | Due Date | Status |
|-----------------|----------|------------|-------------|----------|--------|
| {name} | **{CAT}** | {pts} | {assignedDate or —} | {dueDate or —} | ❌ NOT IN AERIES |

**{count} assignment(s) need to be added to Aeries.**
---
## Full Assignment Comparison
| # | MyOpenMath Name | Cat | MOM Pts | Assigned On | Due Date | Aeries Name | Aeries # | In Aeries? |
|---|-----------------|-----|---------|-------------|----------|-------------|----------|------------|
| {n} | {mom_name} | {cat} | {pts} | {assignedDate or —} | {dueDate or —} | {aeries_name or —} | {# or —} | ✅ or ❌ MISSING |
---
## Summary by Category
| Category | Weight | Total in MOM | Total in Aeries | Missing |
|----------|--------|-------------|-----------------|---------|
| {CAT} | {wt}% | {n} | {n} | **{n}** |
| **TOTAL** | | **{n}** | **{n}** | **{n}** |
---
## Notes
- Aeries normalizes all assignments to 100 points; MOM uses variable points
- Note name discrepancies between systems
- Flag any typos (e.g., "Indvidual" vs "Individual")
- Dates sourced from MOM settings pages (`moasettings.php?cid=...&aid=...`)
- Dates shown as `—` if the settings fetch was skipped or unavailable
```

### Phase 7: Write the Temp JSON Contract for the Next Stage
- **INPUT:** `gradebookNum`, `aeriesBase`, `catMap`, MOM assignments, Aeries assignments, `matched`, `missing`
- **ACTION:** Immediately after the markdown report, write the structured temp JSON artifact with the exact top-level keys shown below.
- **OUTPUT:** `C:\Users\shuff\grade-cloning\temp\gb_compare_${gradebookNum}.json`

```javascript
const fs = require('fs');
fs.mkdirSync('C:\\Users\\shuff\\grade-cloning\\temp', { recursive: true });

const tempPath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_compare_${gradebookNum}.json`;
fs.writeFileSync(
  tempPath,
  JSON.stringify(
    {
      metadata: {
        gradebookNum,
        aeriesBase,
        extractedAt: new Date().toISOString(),
      },
      catMap,
      momAssignments: momAssignmentsWithDates ?? momAssignments,
      aeriesAssignments,
      matched,
      missing,
    },
    null,
    2
  )
);
console.log('Temp file written: ' + tempPath);
console.log('  ' + missing.length + ' missing, ' + matched.length + ' matched');
```

Temp JSON contract notes:
- The `missing` array must contain full assignment objects with date fields when available:
  - `{ name, pts, category, weight, assignedDate, dueDate }`
- The artifact is read by `gb-new-assignment` without re-scraping
- Preserve both `temp` and `gb_compare` naming so downstream discovery keeps working

## Error Handling

| Problem | Action |
|---------|--------|
| No MOM tab found | Ask the user to open the MOM gradebook tab first. |
| No Aeries tab found | Ask the user to open the Aeries Gradebook page first. |
| Playwriter not active on one tab | Ask the user to click the Playwriter icon on that tab. |
| `#availshow` missing | Wait for MOM to finish loading and verify the page is the gradebook. |
| No `span.cattothdr` or `th[data-pts]` rows | Re-run the expand step and confirm MOM categories are visible. |
| No `th[data-an]` rows | Verify the Aeries page is a gradebook page, not another view. |
| MOM settings fetch fails | Keep `assignedDate` and `dueDate` null and continue the comparison. |
| Zero plausible matches found | Confirm the two tabs are for the same course and inspect both extracted lists manually. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Leaving MOM on the default filter | Set `#availshow` to `2` for **All** before extracting. |
| Forgetting to expand categories | Click every `[Expand]` link until none remain. |
| Using `th.textContent` for MOM names | Use `div.childNodes[0].textContent` so `[Settings][Isolate]` is excluded. |
| Using `innerHTML` for Aeries names | Use `textContent.trim()` so entities decode correctly. |
| Doing exact string matching | Use the number-anchored algorithm with a `0.4` threshold. |
| Treating Aeries 100-point normalization as a mismatch | Compare assignment presence, not raw point values. |
| Parsing settings URLs from encoded HTML | Use `settingsLink.href`, then `URLSearchParams`, to get `aid` and `cid`. |
| Reporting blank dates as real data | Keep JSON dates null and show `—` in the markdown report. |
| Clicking Aeries controls during comparison | Do not mutate anything; this skill is read-only only. |

## Selectors / References

### MyOpenMath

| Element | Selector / Pattern | Notes |
|---------|--------------------|-------|
| Show filter dropdown | `#availshow` | Set to `2` for **All** |
| Category header label | `span.cattothdr` | Text like `GROUP 10%` |
| Category CSS class | `.cat1`, `.cat2`, `.cat3` | Class lives on parent `th` |
| Expand controls | `a` with text `[Expand]` | Click until no links remain |
| Assignment headers | `th[data-pts]` | One `th` per assignment |
| Clean assignment name | `th.querySelector('div').childNodes[0].textContent` | Excludes settings/isolate cruft |
| MOM points | `th.getAttribute('data-pts')` | Variable point values |
| Settings link | `a[href*="moasettings"]` | Use to get `aid` and `cid` |

### Aeries

| Element | Selector / Pattern | Notes |
|---------|--------------------|-------|
| Assignment headers | `th[data-an]` | One `th` per assignment |
| Assignment number | `th.getAttribute('data-an')` | Aeries assignment ID/number |
| Assignment name | `th.textContent.trim()` | Decodes entities automatically |

## Cleanup
- Do not close either browser tab
- Do not navigate away from either gradebook page
- Report final counts (`missing` vs `matched`) to the user
- Point later stages to the temp JSON artifact instead of re-scraping
