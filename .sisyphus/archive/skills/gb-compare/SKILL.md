---
name: gb-compare
description: Use when comparing MyOpenMath (MOM) gradebook assignments against Aeries — finding what's missing, checking counts by category, or generating a comparison report before adding assignments to Aeries.
---
# Grade Compare (MyOpenMath → Aeries)

Compare assignments between MyOpenMath and Aeries gradebooks to identify what's missing in Aeries. Extracts from both browser tabs via Playwriter, handles category mapping, fuzzy name matching, and HTML entity differences to produce an accurate comparison report.

## Prerequisites
- **Playwriter MCP** enabled and connected
- **Two browser tabs open**: one on MOM gradebook, one on Aeries gradebook (same course)
- **Playwriter active on BOTH tabs** (click extension icon on each)

## When to Use
- User asks to compare MOM assignments against Aeries
- User wants to find which assignments are missing in Aeries
- User asks "what do I still need to add to Aeries?"

**Do NOT use:**
- To modify or create assignments in Aeries (this is READ-ONLY)
- Without both gradebook tabs open and Playwriter-enabled

## Safety Rules

> **⚠️ READ-ONLY** — Never click Add, Edit, or Delete; never submit forms, change grades, or alter settings in Aeries.

> **⚠️ Never navigate away from either gradebook page.**

All Aeries interactions are LIMITED to: reading column headers and assignment metadata.

---

## Selector Quick Reference

### MyOpenMath (MOM)

| Element | Selector | Notes |
|---------|----------|-------|
| Show filter dropdown | `#availshow` | Set `value = '2'` for "All" |
| Category headers | `span.cattothdr` | Text: `"GROUP 10%"`, `"HW 15%"`, `"IND 75%"` |
| Category CSS classes | `.cat1`, `.cat2`, `.cat3` | On parent `<th>` of cattothdr span |
| Expand links | `a` containing text `[Expand]` | Click until none remain |
| Assignment columns | `th[data-pts]` | One `<th>` per assignment |
| Clean assignment name | `th querySelector('div') .childNodes[0].textContent` | **First text node only** — excludes `[Settings][Isolate]` |
| Points | `th.getAttribute('data-pts')` | Variable per assignment |
| Category of assignment | CSS class on the `<th>` | `cat1` / `cat2` / `cat3` |
| Settings link | `th querySelector('a[href*="moasettings"]')` | Contains `?cid=...&aid=...` for date fetching |
| Assignment ID | `aid` param from settings href | Used to fetch `sdate`/`edate` |
### Aeries

| Element | Selector | Notes |
|---------|----------|-------|
| Assignment columns | `th[data-an]` | One `<th>` per assignment |
| Assignment number | `th.getAttribute('data-an')` | e.g., `"77"`, `"78"` |
| Assignment name | `th.textContent.trim()` | **Use textContent** — auto-decodes `&amp;` → `&` |

---

## Phase 1: Session Setup + Tab Detection

```javascript
const pages = context.pages();
const momPage = pages.find(p => p.url().includes('myopenmath.com'));
const aeriesPage = pages.find(p =>
  p.url().includes('aeries') && p.url().toLowerCase().includes('gradebook')
);
if (!momPage) throw new Error('No MyOpenMath tab found — open the MOM gradebook first.');
if (!aeriesPage) throw new Error('No Aeries Gradebook tab found — open Aeries first.');
// Verify both tabs respond
await momPage.evaluate(() => document.title);
await aeriesPage.evaluate(() => document.title);
// Extract gradebook number and base URL for temp file naming (Phase 5)
const gradebookNum = aeriesPage.url().match(/gradebook\/(\d+)/)?.[1] ?? 'unknown';
const aeriesBase = new URL(aeriesPage.url()).origin;
console.log('Gradebook number:', gradebookNum);
```

## Phase 2: MOM Extraction

### Step 1: Set Show Filter to "All"
```javascript
// DEFAULT filter hides assignments. MUST set to "All" (value=2)
await momPage.evaluate(() => {
  const sel = document.querySelector('#availshow');
  if (sel) { sel.value = '2'; sel.dispatchEvent(new Event('change')); }
});
await new Promise(r => setTimeout(r, 1500)); // Wait for table refresh
```

### Step 2: Build Category Map
```javascript
const catMap = await momPage.evaluate(() => {
  const map = {};
  document.querySelectorAll('span.cattothdr').forEach(span => {
    const text = span.textContent.trim(); // e.g., "GROUP 10%"
    const match = text.match(/^(\S+)\s+(\d+%?)$/);
    if (!match) return;
    const th = span.closest('th');
    const cls = ['cat1','cat2','cat3'].find(c => th.classList.contains(c));
    if (cls) map[cls] = { name: match[1], weight: match[2] };
  });
  return map;
});
```

### Step 3: Expand All Categories
```javascript
// Categories collapse by default — MUST expand to see individual assignments
while (true) {
  const clicked = await momPage.evaluate(() => {
    const links = [...document.querySelectorAll('a')]
      .filter(a => a.textContent.includes('[Expand]'));
    links.forEach(a => a.click());
    return links.length;
  });
  if (clicked === 0) break;
  await new Promise(r => setTimeout(r, 500));
}
```

### Step 4: Extract Assignments + Assignment IDs
```javascript
const momAssignments = await momPage.evaluate((catMap) => {
  const results = [];
  document.querySelectorAll('th[data-pts]').forEach(th => {
    // CRITICAL: childNodes[0] gets ONLY the name, not "[Settings][Isolate]" cruft
    const nameDiv = th.querySelector('div');
    const name = nameDiv ? nameDiv.childNodes[0].textContent.trim() : '';
    const pts = th.getAttribute('data-pts');
    const cls = ['cat1','cat2','cat3'].find(c => th.classList.contains(c));
    const category = cls && catMap[cls] ? catMap[cls].name : 'UNKNOWN';
    const weight = cls && catMap[cls] ? catMap[cls].weight : '';
    // Extract aid/cid for date fetching (Step 5)
    const settingsLink = th.querySelector('a[href*="moasettings"]');
    let aid = null, cid = null;
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

### Step 5: Fetch Assigned/Due Dates from MOM (Optional)

> **Note**: This fetches one settings page per assignment — ~1–2s per request. For 15 assignments expect ~10–20s total. Skip if only doing a quick count comparison.

```javascript
// Runs in browser context (already authenticated). Uses Promise.all for parallelism.
const momAssignmentsWithDates = await momPage.evaluate(async (assignments) => {
  return Promise.all(assignments.map(async (a) => {
    if (!a.aid || !a.cid) return { ...a, assignedDate: null, dueDate: null };
    const url = `https://www.myopenmath.com/course/moasettings.php?cid=${a.cid}&aid=${a.aid}`;
    try {
      const html = await fetch(url).then(r => r.text());
      // sdate = assigned-on date, edate = due date
      const sdateMatch = html.match(/name="sdate"[^>]*value="([^"]+)"/);
      const edateMatch = html.match(/name="edate"[^>]*value="([^"]+)"/);
      return {
        ...a,
        assignedDate: sdateMatch ? sdateMatch[1] : null,  // e.g., "01/28/2026"
        dueDate: edateMatch ? edateMatch[1] : null,       // e.g., "01/28/2026"
      };
    } catch {
      return { ...a, assignedDate: null, dueDate: null };
    }
  }));
}, momAssignments);
// Use momAssignmentsWithDates in Phase 4 instead of momAssignments
```

## Phase 3: Aeries Extraction

```javascript
const aeriesAssignments = await aeriesPage.evaluate(() => {
  const results = [];
  document.querySelectorAll('th[data-an]').forEach(th => {
    const number = th.getAttribute('data-an');
    // textContent auto-decodes HTML entities (&amp; → &). NEVER use innerHTML.
    const name = th.textContent.trim();
    results.push({ number, name });
  });
  return results;
});
```

## Phase 4: Compare + Generate Report

```javascript
const { matched, missing } = matchAssignments(momAssignments, aeriesAssignments);
// Generate markdown using Output Template below, save to grade-cloning/gradebook-comparison.md
```

---

## Number-Anchored Matching Algorithm

Names differ between systems — exact matching produces false "missing" results. Use numbers as the primary signal since they survive renaming.

```javascript
function normalize(s) {
  return s.toLowerCase().replace(/--/g, ' ').replace(/[(),&]/g, ' ').replace(/\s+/g, ' ').trim();
}
function extractNumbers(s) {
  return [...s.matchAll(/\d+\.?\d*/g)].map(m => m[0]);
}
function extractWords(s) {
  return normalize(s).split(' ').filter(w => w.length > 1 && !/^\d/.test(w));
}
function matchAssignments(momList, aeriesList) {
  const matched = [], missing = [];
  const used = new Set();
  for (const mom of momList) {
    const mNums = extractNumbers(mom.name);
    const mWords = extractWords(mom.name);
    let best = null, bestScore = 0;
    for (let i = 0; i < aeriesList.length; i++) {
      if (used.has(i)) continue;
      const a = aeriesList[i];
      const aNums = extractNumbers(a.name);
      const overlap = mNums.filter(n => aNums.includes(n)).length;
      const numScore = overlap / Math.max(mNums.length, aNums.length, 1);
      if (numScore === 0) continue;
      const aWords = extractWords(a.name);
      const wordOverlap = mWords.filter(w => aWords.includes(w)).length;
      const wordScore = wordOverlap / Math.max(mWords.length, aWords.length, 1);
      const score = numScore * 0.7 + wordScore * 0.3;
      if (score > bestScore) { bestScore = score; best = { idx: i, ...a }; }
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

**Why 0.4 threshold**: Handles cases like `"Homework 5.1, 5.2 (part 1)"` matching `"5.1 & 5.2 Confidence Intervals"` — numbers match but words diverge.

---

## Output Template

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
- Dates shown as `—` if Step 5 was skipped or settings page was unavailable
```

Save report to `grade-cloning/gradebook-comparison.md`.

---

## Phase 5: Write Temp File

Write a structured JSON file so `gb-new-assignment` (Stage 2) can read the `missing` array directly without re-scraping. Run immediately after saving the markdown report.

```javascript
const fs = require('fs');
fs.mkdirSync('C:\\Users\\shuff\\grade-cloning\\temp', { recursive: true });

const tempPath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_compare_${gradebookNum}.json`;
fs.writeFileSync(tempPath, JSON.stringify({
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
}, null, 2));
console.log('Temp file written: ' + tempPath);
console.log('  ' + missing.length + ' missing, ' + matched.length + ' matched');
```

The `missing` array contains full assignment objects: `{ name, pts, category, weight, assignedDate, dueDate }`. This file is consumed by `gb-new-assignment` in Stage 2.

---

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| No MOM tab found | Tab not open or URL mismatch | Ask user to open MOM gradebook |
| No Aeries tab found | Tab not open or URL mismatch | Ask user to open Aeries Gradebook page |
| Extension not connected | Playwriter not active on tab | Ask user to click Playwriter icon |
| `#availshow` not found | MOM not fully loaded | Wait and retry; verify URL is gradebook |
| No `th[data-pts]` found | Categories collapsed | Re-run expand step; verify MOM URL |
| No `th[data-an]` found | Wrong Aeries page | Verify Aeries URL contains "Gradebook" |
| 0 matches found | Wrong course or selectors | Log both lists for manual review |

---

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Not setting Show to "All" | Misses assignments | Phase 2 Step 1: `#availshow` value `2` |
| Not expanding categories | Sees 3 totals, not 15 assignments | Phase 2 Step 3: `[Expand]` click loop |
| `th.textContent` for names | `"Homework 4.112 pts[Settings][Isolate]"` | `childNodes[0].textContent` |
| `innerHTML` for Aeries | Gets `&amp;` instead of `&` | Use `textContent` |
| Exact string matching | All 15 reported as missing | Number-Anchored Matching |
| Comparing point values | False mismatches (12 vs 100) | Report MOM points; note normalization |
| Using `innerHTML` to find `aid` | Gets encoded URL | Use `settingsLink.href` (resolves to absolute URL) |
| Skipping Step 5 and reporting dates | Shows blank dates | Mark as `—` and note Step 5 was skipped |
| Modifying Aeries | **Alters real grades** | **NEVER — read-only only** |

---

## Cleanup
- Do NOT close browser tabs (user may need them)
- Do NOT navigate away from gradebook pages
- Report saved to `grade-cloning/gradebook-comparison.md`
- Temp file saved to `grade-cloning/temp/gb_compare_{gradebookNum}.json`
