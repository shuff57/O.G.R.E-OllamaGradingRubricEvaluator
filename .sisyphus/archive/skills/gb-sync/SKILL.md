---
name: gb-sync
description: Use when syncing student scores from MyOpenMath (MOM) into Aeries after all assignments exist in both systems. Triggers: "sync scores", "copy grades to Aeries", "enter student scores", Stage 3 of gb-pipeline, "sync just [assignment]", "sync assignment #[number]". Supports single-assignment mode. Run AFTER gb-compare and gb-new-assignment.
---
# Aeries Sync Scores (MyOpenMath → Aeries)

Final stage of the gradebook pipeline: reads student scores from MOM and enters them into Aeries score-entry forms. Run after `gb-compare` and `gb-new-assignment`.

## Prerequisites

- `gb-compare` has been run — assignments matched between systems
- `gb-new-assignment` has been run — all MOM assignments now exist in Aeries
- Playwriter MCP connected, extension active on **both** tabs
- Tab 1: MyOpenMath gradebook (teacher view, all assignments visible)
- Tab 2: Aeries gradebook (teacher write permissions)

## When to Use

- "sync scores", "copy grades to Aeries", "enter student scores"
- Stage 3 of `gb-pipeline`
- After `gb-new-assignment` has created all missing assignments in Aeries
- "sync just Homework 3.1", "sync assignment #77" — single-assignment mode

This skill only syncs scores for assignments that exist in **both** systems.

**Single-assignment mode**: When the user specifies a target assignment, Phases 1–4.6 run
fully (maps and per-student files are always complete). Only Phases 5, 6, 7 are filtered
to the target. Student file status is set to `partial-verified` (not `verified`).

## Safety Rules

1. **Dry-run first** — `dryRun = true` by default; preview before writing
2. **Always overwrite to match MOM** — Aeries scores are overwritten to match MOM exactly; MOM is the source of truth
3. **Leave exempt/blank empty** — never enter 0 for `-e`, `--`, `E`, or blank MOM cells
4. **Log progress after each phase** — verify before continuing
5. **Confidence < 0.80 = manual review** — flag student name matches below threshold

---

## Selector Quick Reference

### MyOpenMath (MOM)
| Element | Selector / Method | Notes |
|---------|------------------|-------|
| Show filter | `#availshow` | Set `value = '2'` for "All" |
| Expand links | `a` with `[Expand]` text | Click loop until none remain |
| Assignment headers | `th[data-pts]` | One per assignment |
| Assignment name | `th querySelector('div').childNodes[0].textContent.trim()` | First text node ONLY — excludes `[Settings][Isolate]` |
| Max points | `th.getAttribute('data-pts')` | |
| Category | `.cat1` / `.cat2` / `.cat3` | CSS class on the `<th>` |
| Gradebook table | `#myTable` | Class is `gb`, id is `myTable` |
| Student rows | `#myTable tbody tr` | Skip row 0 (Averages row); name is in `<th>`, not `<td>` |
| Student name | `row.querySelector('th').textContent.trim()` | In `<th>`, NOT first `<td>` |
| Score cell | `[...row.children][th.cellIndex]` | Use ALL children (th+td), not just tds |
| Raw score value | `cell.querySelector('a')?.getAttribute('data-ptv')` | Anchor inside cell; absent = exempt/unscored |
| Exempt marker | No `data-ptv` attr, OR text starts with `-` (e.g. `-e`) | `-e` = exempt, blank anchor = not submitted |

### Aeries
| Element | Selector / Method | Notes |
|---------|------------------|-------|
| Assignment headers | `th[data-an]` | `data-an` = assignment number |
| Assignment name (full) | `th.querySelector('a.assignment-edit')?.getAttribute('data-assignment-name')` | Use this — `textContent` is truncated with `...` |
| Student rows | `table.students tr.row` | Has `data-sn`, `data-stusc`, `data-stuid` attrs |
| Student name | `tr.row a.student-name-link` | Includes middle initial (e.g. "Smith, John R.") |
| Score grid rows | `table.assignments tr.row` | Aligned 1:1 with students table by `data-sn` |
| Existing score | `tr.row td:first-child` | Empty string = no score entered |
| Score input | `table.assignments input.edit-text` | Dynamically rendered on click — NOT a static input |
| Score (mk) cell | `td[data-col-name="mk"]` | First editable cell per row; column name disambiguates from np |
| # Possible (np) cell | `td[data-col-name="np"]` | Must always be 100; Aeries auto-sets `np = mk` when overwriting a score — fix separately after sync |
| Score entry URL | `/teacher/gradebook/{GN}/S/ScoresByAssignment/Index/{an}` | Path-based, NOT `?an=` query param |
| Save button | `#assignmentQuickAssignSave` | Use `evaluate(() => document.querySelector('#assignmentQuickAssignSave').click())` — NOT `locator().click()` (causes nav wait → timeout) |
| Score scale | 0–100 (percent of max) | Convert MOM raw pts: `round(rawPts / maxPts * 100, 1)` |

---

## Phase 1: Session Setup

```javascript
const pages = context.pages();
const momPage = pages.find(p => p.url().includes('myopenmath.com'));
const aeriesPage = pages.find(p =>
  p.url().includes('aeries') && p.url().toLowerCase().includes('gradebook')
);
if (!momPage) throw new Error('No MyOpenMath tab — open the MOM gradebook first.');
if (!aeriesPage) throw new Error('No Aeries Gradebook tab — open Aeries first.');
console.log('MOM:', momPage.url());
console.log('Aeries:', aeriesPage.url());
// Extract gradebook number from Aeries URL for score entry navigation
const gradebookNum = aeriesPage.url().match(/gradebook\/(\d+)/)?.[1];
if (!gradebookNum) throw new Error('Cannot extract gradebook number from Aeries URL');
const aeriesBase = new URL(aeriesPage.url()).origin;
console.log('Gradebook number:', gradebookNum);
```

### Temp File Cache Check
```javascript
// Temp file stores extracted data so re-runs don't re-scrape everything (~8s savings)
// Path: C:\Users\shuff\grade-cloning\temp\gb_sync_{gradebookNum}.json
// Set forceRefresh = true to re-extract even if cache is fresh
const fs = require('fs');
const forceRefresh = false;
const statePath = `C:\\Users\\shuff\\grade-cloning\\temp\\gb_sync_${gradebookNum}.json`;
let cachedState = null;
if (!forceRefresh && fs.existsSync(statePath)) {
  const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const ageHours = (Date.now() - new Date(raw.metadata.extractedAt)) / 36e5;
  if (ageHours < 24 && raw.metadata.gradebookNum === gradebookNum) {
    cachedState = raw;
    console.log(`📂 Loaded cache (${ageHours.toFixed(1)}h old) — skipping Phases 2-4`);
  } else {
    console.log(`🔄 Cache stale or mismatch — re-extracting`);
  }
}
```

If `cachedState` is loaded, skip Phases 2–4 and restore directly:
```javascript
let momAssignments, momStudentScores, aeriesAssignments, aeriesStudents;
let assignmentCrossMap, aeriesStudentScoreMap, snToAeriesName;
let completedAssignments = [];
let versionPairs = new Map(); // populated in Phase 4.5 — Version A/B paired tests
let targetAN = null; // set by Phase 4.8 in single-assignment mode; null = full sync

if (cachedState) {
  ({ momAssignments, momStudentScores, aeriesAssignments, aeriesStudents,
     assignmentCrossMap, aeriesStudentScoreMap, snToAeriesName } = cachedState);
  completedAssignments = cachedState.syncProgress?.completedAssignments ?? [];
  console.log(`Resuming — ${completedAssignments.length} assignments already synced`);
}
// If no cache: run Phases 2-4 normally, then declare vars the same way
```

---

## Phase 2: Extract MOM Scores

### Set Show to All + Expand Categories
```javascript
// DEFAULT filter hides assignments. MUST set to "All" (value=2)
await momPage.evaluate(() => {
  const sel = document.querySelector('#availshow');
  if (sel) { sel.value = '2'; sel.dispatchEvent(new Event('change')); }
});
await new Promise(r => setTimeout(r, 1500));

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
console.log('MOM: Show=All, all categories expanded');
```

### Extract Assignment Map
```javascript
// CRITICAL: childNodes[0] gets ONLY the name, not "[Settings][Isolate]" cruft
const momAssignments = await momPage.evaluate(() =>
  [...document.querySelectorAll('th[data-pts]')].map(th => {
    const div = th.querySelector('div');
    return {
      columnIndex: th.cellIndex,
      name: div ? div.childNodes[0].textContent.trim() : '',
      maxPoints: parseFloat(th.getAttribute('data-pts')),
      category: ['cat1','cat2','cat3'].find(c => th.classList.contains(c)) || 'unknown'
    };
  })
);
console.log(`MOM: ${momAssignments.length} assignments`);
```

### Extract Student Scores
```javascript
// CRITICAL:
// - Table is #myTable (class="gb"), NOT table.gradebook
// - First tbody row is "Averages" — skip it (slice(1))
// - Student name is in <th>, NOT first <td>
// - Score cells use ALL children (th+td) by index: [...row.children][columnIndex]
// - Raw point value is in data-ptv on the anchor inside the cell
// - Exempt: no data-ptv, OR text starts with '-' (e.g. '-e' marker)
const momStudentScores = await momPage.evaluate((assignments) =>
  [...document.querySelectorAll('#myTable tbody tr')].slice(1).map(row => {
    const name = row.querySelector('th')?.textContent.trim();
    if (!name) return null;
    const allCells = [...row.children]; // th + td combined, indexed by cellIndex
    const scores = {};
    for (const a of assignments) {
      const cell = allCells[a.columnIndex];
      const anchor = cell?.querySelector('a');
      const raw = cell?.textContent.trim() ?? '';
      const ptv = anchor?.getAttribute('data-ptv');
      const isExempt = !ptv || raw === '' || raw === '--' || raw === 'E' || raw.startsWith('-');
      scores[a.name] = {
        raw,
        value: isExempt ? null : parseFloat(ptv),
        isExempt,
        maxPoints: a.maxPoints
      };
    }
    return { name, scores };
  }).filter(Boolean)
, momAssignments);

console.log(`MOM: ${momStudentScores.length} students`);
// Verification: log momStudentScores[0] to confirm extraction
console.log('Sample:', JSON.stringify(momStudentScores[0]?.scores ?? {}).slice(0, 200));
```

---

## Phase 3: Extract Aeries Data

```javascript
// CRITICAL:
// - Assignment name: use data-assignment-name attr on a.assignment-edit (textContent is truncated)
// - Students: use table.students tr.row a.student-name-link (NOT table a[href*="student"])
// - Capture data-sn from tr.row — needed for score entry row lookup in Phase 5
const aeriesAssignments = await aeriesPage.evaluate(() =>
  [...document.querySelectorAll('th[data-an]')].map(th => ({
    assignmentNumber: th.getAttribute('data-an'),
    name: th.querySelector('a.assignment-edit')?.getAttribute('data-assignment-name')
          ?? th.querySelector('div')?.textContent.trim()  // fallback if no edit link
          ?? ''
  }))
);

const aeriesStudents = await aeriesPage.evaluate(() =>
  [...document.querySelectorAll('table.students tr.row')].map(row => ({
    name: row.querySelector('a.student-name-link')?.textContent.trim() ?? '',
    sn: row.getAttribute('data-sn'),
    stusc: row.getAttribute('data-stusc'),
    stuid: row.getAttribute('data-stuid')
  })).filter(s => s.name)
);

console.log(`Aeries: ${aeriesAssignments.length} assignments, ${aeriesStudents.length} students`);
// Verification: log first 3 of each
console.log('Assignments:', aeriesAssignments.slice(0, 3).map(a => `[${a.assignmentNumber}] "${a.name}"`));
console.log('Students:', aeriesStudents.slice(0, 3).map(s => s.name));
```

---

## Phase 4: Build Cross-System Maps

### Matching Functions (same algorithm as `gb-compare`)
```javascript
function normalize(s) {
  return s.toLowerCase().replace(/--/g, ' ').replace(/[(),&]/g, ' ').replace(/\s+/g, ' ').trim();
}
function extractNumbers(s) { return [...s.matchAll(/\d+\.?\d*/g)].map(m => m[0]); }
function extractWords(s) { return normalize(s).split(' ').filter(w => w.length > 1 && !/^\d/.test(w)); }

function scoreAssignmentMatch(nameA, nameB) {
  const [numsA, numsB] = [extractNumbers(nameA), extractNumbers(nameB)];
  const overlap = numsA.filter(n => numsB.includes(n)).length;
  const numScore = overlap / Math.max(numsA.length, numsB.length, 1);
  if (numScore === 0) return 0;
  const [wordsA, wordsB] = [extractWords(nameA), extractWords(nameB)];
  const wordOverlap = wordsA.filter(w => wordsB.includes(w)).length;
  return numScore * 0.7 + wordOverlap / Math.max(wordsA.length, wordsB.length, 1) * 0.3;
}
```

### Student Name Matching
```javascript
function normalizeStudentName(name) {
  if (!name) return { last: '', first: '' };
  const parts = name.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    // Strip middle initial — Aeries includes "R." after first name, MOM does not
    const firstName = parts[1].trim().split(/\s+/)[0].toLowerCase().replace(/[^\w]/g, '');
    return { last: parts[0].toLowerCase().replace(/[^\w]/g, ''), first: firstName };
  }
  const words = name.split(/\s+/);
  return { last: words.slice(1).join('').toLowerCase().replace(/[^\w]/g, ''), first: words[0].toLowerCase().replace(/[^\w]/g, '') };
}

function matchStudents(nameA, nameB) {
  const a = normalizeStudentName(nameA);
  const b = normalizeStudentName(nameB);
  if (a.last === b.last && a.first === b.first) return { confidence: 1.0, matched: true };
  if (a.last === b.last && a.first && b.first.startsWith(a.first)) return { confidence: 0.95, matched: true };
  if (a.last === b.last && a.first && b.first[0] === a.first[0]) return { confidence: 0.90, matched: true };
  if ((a.last.includes(b.last) || b.last.includes(a.last)) && a.first === b.first) return { confidence: 0.85, matched: true };
  return { confidence: 0, matched: false };
}
```

### Build Lookup Maps
```javascript
// Map: aeriesAssignmentNumber → momAssignmentName
const assignmentCrossMap = {};
const usedMom = new Set();
for (const aeriesA of aeriesAssignments) {
  let best = null, bestScore = 0;
  momAssignments.forEach((momA, i) => {
    if (usedMom.has(i)) return;
    const score = scoreAssignmentMatch(aeriesA.name, momA.name);
    if (score > bestScore) { bestScore = score; best = { idx: i, name: momA.name }; }
  });
  if (best && bestScore >= 0.4) {
    usedMom.add(best.idx);
    assignmentCrossMap[aeriesA.assignmentNumber] = best.name;
    console.log(`✅ "${aeriesA.name}" → "${best.name}" (${bestScore.toFixed(2)})`);
  } else {
    console.warn(`❌ No MOM match for: "${aeriesA.name}"`);
  }
}

// Map: aeriesStudentName → { aeriesAssignNum → scoreData }
// Map: sn → aeriesStudentName (for Phase 5 row lookup)
const aeriesStudentScoreMap = {};
const snToAeriesName = {};
for (const aeriesStudent of aeriesStudents) {
  snToAeriesName[aeriesStudent.sn] = aeriesStudent.name;
  let bestMom = null, bestConf = 0;
  for (const momStudent of momStudentScores) {
    const result = matchStudents(momStudent.name, aeriesStudent.name);
    if (result.matched && result.confidence > bestConf) { bestConf = result.confidence; bestMom = momStudent; }
  }
  if (bestMom && bestConf >= 0.80) {
    const scores = {};
    for (const [aeriesNum, momName] of Object.entries(assignmentCrossMap)) {
      scores[aeriesNum] = bestMom.scores[momName] ?? null;
    }
    aeriesStudentScoreMap[aeriesStudent.name] = scores;
  } else {
    console.warn(`❌ No MOM match for Aeries student: "${aeriesStudent.name}" (best: ${bestConf.toFixed(2)})`);
  }
}
console.log(`Mapped ${Object.keys(aeriesStudentScoreMap).length}/${aeriesStudents.length} students`);
```

### Save State to Temp File
```javascript
// After building all maps — save so next run can resume from here
fs.mkdirSync('C:\\Users\\shuff\\grade-cloning\\temp', { recursive: true });
const stateToSave = {
  metadata: {
    gradebookNum,
    aeriesBase,
    extractedAt: new Date().toISOString(),
    staleAfterHours: 24
  },
  momAssignments,
  momStudentScores,
  aeriesAssignments,
  aeriesStudents,
  assignmentCrossMap,
  aeriesStudentScoreMap,
  snToAeriesName,
  diffReport: null,       // filled after Phase 5
  syncProgress: { completedAssignments: [] }
};
fs.writeFileSync(statePath, JSON.stringify(stateToSave, null, 2));
console.log(`💾 State saved to ${statePath}`);
```

---

## Phase 4.6: Per-Student Temp File Creation

Runs immediately after the state save. Creates one JSON file per matched student in
`temp/students/{gradebookNum}/`. Each file captures the student's MOM scores, an empty `diff`
section (filled by Phase 5), and a `result` section (filled by Phase 6). This enables
per-student subagent parallelism in later phases.

```javascript
// Per-student temp files — one per matched Aeries student
const studentsDir = `C:\\Users\\shuff\\grade-cloning\\temp\\students\\${gradebookNum}`;
fs.mkdirSync(studentsDir, { recursive: true });

const perStudentFiles = [];

for (const aeriesStudent of aeriesStudents) {
  const aeriesName = aeriesStudent.name;
  const sn = aeriesStudent.sn;
  const scores = aeriesStudentScoreMap[aeriesName];

  if (!scores) {
    // Unmatched student — write a warning stub
    const safeName = aeriesName.replace(/,\\s*/g, '_').replace(/\\s+/g, '_').replace(/[^\\w-]/g, '');
    const warnPath = `${studentsDir}/${safeName}.UNMATCHED.json`;
    fs.writeFileSync(warnPath, JSON.stringify({
      _warning: 'No MOM match found — confidence below 0.80 or no match',
      aeriesName,
      sn
    }, null, 2));
    console.warn(`⚠️  Wrote unmatched stub: ${warnPath}`);
    continue;
  }

  // Build momScores map: { [aeriesAssignmentNumber]: { momName, value, maxPoints, isExempt, aeriesScore } }
  const momScores = {};
  for (const [aeriesNum, scoreData] of Object.entries(scores)) {
    const momName = assignmentCrossMap[aeriesNum];
    const aeriesScore = momToAeries(scoreData.value, scoreData.maxPoints);
    momScores[aeriesNum] = {
      momName: momName ?? null,
      value: scoreData.value,
      maxPoints: scoreData.maxPoints,
      isExempt: scoreData.isExempt ?? false,
      aeriesScore             // converted 100-pt value; null if exempt or no data
    };
  }

  // Safe filename: 'Petersen, Julia M.' → 'Petersen_Julia_M'
  const safeName = aeriesName.replace(/,\\s*/g, '_').replace(/\\s+/g, '_').replace(/[^\\w-]/g, '');
  const filePath = `${studentsDir}/${safeName}.json`;

  const studentFile = {
    metadata: {
      gradebookNum,
      aeriesBase,
      studentName: aeriesName,
      sn,
      createdAt: new Date().toISOString()
    },
    momScores,
    diff: {
      checkedAt: null,
      toEnter: [],     // { an, momName, aeriesExisting, aeriesTarget, reason }
      toSkip: [],      // { an, momName, reason }
      warnings: []     // { an, momName, message }
    },
    result: {
      status: 'pending',   // pending | filled | verified | error
      filledAt: null,
      verifiedAt: null,
      entriesAttempted: 0,
      entriesConfirmed: 0,
      errors: []
    }
  };

  fs.writeFileSync(filePath, JSON.stringify(studentFile, null, 2));
  perStudentFiles.push(filePath);
}

console.log(`📁 Created ${perStudentFiles.length} per-student temp files in ${studentsDir}`);

// Extend stateToSave with file list — update the already-written cache
if (fs.existsSync(statePath)) {
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  saved.perStudentFiles = perStudentFiles;
  fs.writeFileSync(statePath, JSON.stringify(saved, null, 2));
}
```

**Note**: `momToAeries()` is defined in Phase 5 — move the definition to a shared helper
block between Phase 4.5 and Phase 5, or inline it here:
```javascript
function momToAeries(value, maxPoints) {
  if (value === null || maxPoints === 0) return null;
  return Math.round(value / maxPoints * 100 * 10) / 10;
}
```

**Verification**: Check `temp/students/{gradebookNum}/` contains one `.json` per matched student
and one `.UNMATCHED.json` per unmatched student. Any UNMATCHED files require manual intervention.


**Verification**: Log all `❌` warnings. Any below 0.80 confidence requires manual review.

---

## Phase 4.5: Version A/B Pair Detection

Runs automatically whenever `momAssignments` is available (fresh extraction or cache restore).
Detects any two assignments whose names differ only by `Version A` / `Version B` (case-insensitive,
also handles `Ver A`, `Ver B`, `V A`, `V B`). Pairs are used in Phase 6 to enter `NA` in Aeries
for the version a student did **not** take.

```javascript
// Detect assignments ending with an isolated A or B (the version indicator).
// Handles: "- A", "- B", "Version A", "Version B", "(A)", "(B)", " A", " B" at the end.
// The A/B must be preceded by a non-word character (space, dash, paren) to avoid
// false-positives on assignment names that happen to end in the letter a or b inside a word.
const isVersionA = name => /(?:[\s\-\u2013(]|^)(?:ver?(?:sion)?\s*\.?\s*)?A\s*[)\s]*$/i.test(name.trim());
const isVersionB = name => /(?:[\s\-\u2013(]|^)(?:ver?(?:sion)?\s*\.?\s*)?B\s*[)\s]*$/i.test(name.trim());
// Strip the version suffix to get the shared base name for comparison
const stripVersionSuffix = name => name.replace(/\s*[\-\u2013(]?\s*(?:ver?(?:sion)?\s*\.?\s*)?[AB]\s*[)\s]*$/i, '').trim().toLowerCase();

const aNames = momAssignments.filter(a => isVersionA(a.name) && !isVersionB(a.name)).map(a => a.name);
const bNames = momAssignments.filter(a => isVersionB(a.name) && !isVersionA(a.name)).map(a => a.name);

for (const aName of aNames) {
  const aBase = stripVersionSuffix(aName);
  const bName = bNames.find(b => stripVersionSuffix(b) === aBase);
  if (bName) {
    versionPairs.set(aName, bName);
    versionPairs.set(bName, aName);
  }
}

if (versionPairs.size > 0) {
  const reported = new Set();
  console.log('🔀 Version A/B pairs detected — will enter NA for the version not taken:');
  for (const [a, b] of versionPairs) {
    if (!reported.has(b)) { console.log(`  "${a}" ↔ "${b}"`); reported.add(a); }
  }
} else {
  console.log('ℹ️  No Version A/B pairs detected — standard sync');
}
```

---

## Phase 4.8: Resolve Target Assignment (Single-Assignment Mode)

**Skip this phase for full syncs.** Only runs when the user requested a single assignment
(e.g., "sync just Homework 3.1", "sync assignment #77"). Set `targetAssignment` to `null`
for a full sync.

The user's input can be:
- An Aeries assignment number (e.g. `#77`, `77`)
- An assignment name or partial name (e.g. `Homework 3.1`)

Resolution tries three strategies in order:
1. **Exact number match** — if input is numeric, match against `aeriesA.assignmentNumber`
2. **Exact name match** — case-insensitive match against Aeries or MOM assignment names
3. **Fuzzy name match** — use `scoreAssignmentMatch()` (already defined in Phase 4) with
   a threshold of 0.5; pick the highest-scoring match

```javascript
// Single-assignment mode: resolve user input to one Aeries assignment number
// Set targetAssignment = null for full sync (default)
let targetAssignment = null;  // ← set from user prompt, e.g. "Homework 3.1" or "77"

if (targetAssignment !== null) {
  const input = targetAssignment.toString().trim().replace(/^#/, '');

  // Strategy 1: exact assignment number
  if (/^\d+$/.test(input)) {
    const match = aeriesAssignments.find(a => a.assignmentNumber === input);
    if (match) {
      targetAN = input;
      console.log(`🎯 Target resolved by number: [${targetAN}] "${match.name}"`);
    }
  }

  // Strategy 2: exact name match (case-insensitive) against Aeries or MOM names
  if (!targetAN) {
    const inputLower = input.toLowerCase();
    const aeriesMatch = aeriesAssignments.find(a => a.name.toLowerCase() === inputLower);
    if (aeriesMatch) {
      targetAN = aeriesMatch.assignmentNumber;
      console.log(`🎯 Target resolved by exact Aeries name: [${targetAN}] "${aeriesMatch.name}"`);
    } else {
      // Check MOM names via assignmentCrossMap (reverse lookup)
      for (const [an, momName] of Object.entries(assignmentCrossMap)) {
        if (momName.toLowerCase() === inputLower) {
          targetAN = an;
          const aeriesName = aeriesAssignments.find(a => a.assignmentNumber === an)?.name;
          console.log(`🎯 Target resolved by exact MOM name: [${targetAN}] "${aeriesName}" (MOM: "${momName}")`);
          break;
        }
      }
    }
  }

  // Strategy 3: fuzzy match using scoreAssignmentMatch() from Phase 4
  if (!targetAN) {
    let bestAN = null, bestScore = 0, bestName = '';
    for (const aeriesA of aeriesAssignments) {
      const score = scoreAssignmentMatch(input, aeriesA.name);
      if (score > bestScore) { bestScore = score; bestAN = aeriesA.assignmentNumber; bestName = aeriesA.name; }
    }
    if (bestAN && bestScore >= 0.5) {
      targetAN = bestAN;
      console.log(`🎯 Target resolved by fuzzy match: [${targetAN}] "${bestName}" (score: ${bestScore.toFixed(2)})`);
    }
  }

  if (!targetAN) {
    throw new Error(`Cannot resolve target assignment: "${targetAssignment}". Check assignment list and try again.`);
  }

  // Verify the target has a MOM mapping
  if (!assignmentCrossMap[targetAN]) {
    throw new Error(`Target [${targetAN}] has no MOM match in assignmentCrossMap — cannot sync scores for unmapped assignment.`);
  }

  console.log(`📌 SINGLE-ASSIGNMENT MODE: only processing [${targetAN}] in Phases 5, 6, 7`);
}
```

**After resolution**: `targetAN` is either `null` (full sync) or a specific Aeries assignment
number string. Phases 5, 6, 7 use this to filter their loops.

---

## Phase 5: Score Diff Check

**Always run this before entering scores.** Scrapes every Aeries assignment page, compares
each cell against the MOM value, and writes the diff into each student's per-student temp file.
MOM is always the source of truth — all diffs result in a `toEnter` item.

```javascript
// momToAeries() is defined in Phase 4.6 shared helper block — reuse it here.

const BASE = `${aeriesBase}/teacher/gradebook/${gradebookNum}/S/ScoresByAssignment/Index`;
let totalChecked = 0;

// Load all per-student files into memory for fast lookup + update
const studentFileCache = {};  // aeriesName → { filePath, data }
for (const filePath of (perStudentFiles ?? [])) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    studentFileCache[data.metadata.studentName] = { filePath, data };
  } catch (e) {
    console.warn(`⚠️  Could not load ${filePath}:`, e.message);
  }
}

for (const aeriesA of aeriesAssignments) {
  if (!assignmentCrossMap[aeriesA.assignmentNumber]) continue;
  if (targetAN && aeriesA.assignmentNumber !== targetAN) continue;  // single-assignment filter
  const an = aeriesA.assignmentNumber;

  await aeriesPage.goto(`${BASE}/${an}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  const rows = await aeriesPage.evaluate(() =>
    [...document.querySelectorAll('table.assignments tr.row')].map(r => ({
      sn: r.getAttribute('data-sn'),
      existingScore: r.querySelector('td:first-child')?.textContent.trim() ?? ''
    }))
  );

  for (const { sn, existingScore } of rows) {
    const aeriesName = snToAeriesName[sn];
    if (!aeriesName) continue;
    const entry = studentFileCache[aeriesName];
    if (!entry) continue;

    const scoreData = aeriesStudentScoreMap[aeriesName]?.[an];
    if (!scoreData || scoreData.isExempt || scoreData.value === null) {
      entry.data.diff.toSkip.push({ an, momName: assignmentCrossMap[an], reason: 'exempt or no MOM score' });
      continue;
    }

    const aeriesTarget = momToAeries(scoreData.value, scoreData.maxPoints);
    if (aeriesTarget === null) {
      entry.data.diff.toSkip.push({ an, momName: assignmentCrossMap[an], reason: 'momToAeries returned null' });
      continue;
    }

    totalChecked++;
    const aeriesExisting = existingScore === '' ? null : parseFloat(existingScore);
    const diff = aeriesExisting !== null ? +(aeriesTarget - aeriesExisting).toFixed(1) : null;

    let reason = 'new score';
    if (aeriesExisting !== null) {
      if (aeriesExisting > 150)          reason = 'bad Aeries value (>150)';
      else if (diff === 0)               reason = 'already correct';
      else if (Math.abs(diff) <= 1)      reason = 'tiny rounding diff';
      else if (diff > 0)                 reason = 'late work (MOM increased)';
      else                               reason = 'MOM decreased (manual review)';
    }

    entry.data.diff.toEnter.push({
      an,
      momName: assignmentCrossMap[an],
      aeriesExisting,
      aeriesTarget,
      diff,
      reason
    });
  }
}

// Flush all per-student diff data back to disk
let diffedCount = 0;
for (const { filePath, data } of Object.values(studentFileCache)) {
  data.diff.checkedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  diffedCount++;
}
if (targetAN) {
  console.log(`\n📊 Diff complete (single-assignment [${targetAN}]): ${totalChecked} cells checked, ${diffedCount} student files updated`);
} else {
  console.log(`\n📊 Diff complete: ${totalChecked} cells checked, ${diffedCount} per-student files updated`);
}
```

```javascript
// Update main cache so next run can skip diff phase
if (fs.existsSync(statePath)) {
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  saved.diffReport = { checkedAt: new Date().toISOString(), totalChecked, studentCount: diffedCount };
  fs.writeFileSync(statePath, JSON.stringify(saved, null, 2));
  console.log('💾 diffReport metadata saved to cache');
}
```

**Diff `reason` values written to each student file's `diff.toEnter`:**
- `new score` — Aeries is empty; MOM has a value
- `already correct` — Aeries matches MOM exactly (still written so Phase 6 can confirm)
- `tiny rounding diff` — ≤1pt difference (Phase 6 still overwrites to exact MOM value)
- `late work (MOM increased)` — student resubmitted after Aeries was filled
- `MOM decreased (manual review)` — Aeries has a higher score; MOM wins but flagged
- `bad Aeries value (>150)` — impossible score; MOM overwrites

---


## Phase 6: Enter Scores in Aeries

Reads per-student temp files (from Phase 5) and fills scores into Aeries.
**Primary strategy**: ScoresByAssignment page (one page per assignment, all students visible).
Each score is entered and committed via click-away.
**Fallback**: ScoresByStudent (triggered if an assignment page fails to load).

**Critical runtime constraints (discovered in practice):**
- **Batch ≤6 students per execute call** — MCP relay times out after ~10s; longer fill loops hit this even when JS is fast
- **Save in a separate execute call** — saving in the same call as the fill loop causes a race condition where some scores don't persist
- **Save via `evaluate()`** — `locator('#assignmentQuickAssignSave').click()` triggers Playwright navigation wait → times out

```javascript
const syncOptions = { dryRun: true, forceOverwrite: true };
console.log('=== Phase 6: Score Sync ===', syncOptions);

// CRITICAL: ≤6 students per execute call — MCP relay has ~10s timeout; longer loops hit it
// CRITICAL: fill and save must be in SEPARATE execute calls — save in same call causes race condition

// --- Load all per-student files into memory ---
const studentFileCache = {};  // aeriesName → { filePath, data }
for (const filePath of (perStudentFiles ?? [])) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.result.retries) data.result.retries = [];
    studentFileCache[data.metadata.studentName] = { filePath, data };
  } catch (e) {
    console.warn(`⚠️  Cannot read ${filePath}:`, e.message);
  }
}

// --- Group entries by assignment number ---
// Each assignment page shows all students — batch by assignment for efficient navigation
const assignmentEntries = {};  // an → [{ sn, aeriesName, aeriesTarget, item }]
for (const { data } of Object.values(studentFileCache)) {
  const { studentName: aeriesName, sn } = data.metadata;
  const toEnter = data.diff.toEnter.filter(d => d.reason !== 'already correct');
  for (const item of toEnter) {
    if (!assignmentEntries[item.an]) assignmentEntries[item.an] = [];
    assignmentEntries[item.an].push({ sn, aeriesName, aeriesTarget: item.aeriesTarget, item });
  }
}
// Deduplicate assignmentEntries by (sn, an) pair — cache restore can produce duplicate toEnter items
for (const an of Object.keys(assignmentEntries)) {
  const seen = new Set();
  assignmentEntries[an] = assignmentEntries[an].filter(e => {
    const key = `${e.sn}:${an}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const BASE = `${aeriesBase}/teacher/gradebook/${gradebookNum}/S/ScoresByAssignment/Index`;
let totalEntered = 0, totalErrors = 0, pipelineHalted = false;
const fallbackEntries = []; // entries whose assignment page failed — try ScoresByStudent

// Single-assignment mode banner
if (targetAN) {
  const targetMomName = assignmentCrossMap[targetAN] ?? `#${targetAN}`;
  const targetAeriesName = aeriesAssignments.find(a => a.assignmentNumber === targetAN)?.name ?? targetMomName;
  console.log(`\n📌 SINGLE-ASSIGNMENT MODE: [${targetAN}] "${targetAeriesName}" (MOM: "${targetMomName}")`);
  console.log(`   ${(assignmentEntries[targetAN] ?? []).length} students to process\n`);
}

// === PRIMARY: ScoresByAssignment (one page per assignment, all students visible) ===
for (const [an, students] of Object.entries(assignmentEntries)) {
  if (pipelineHalted) break;
  const momName = assignmentCrossMap[an] ?? `#${an}`;

  // Resume: skip completed assignments
  if (completedAssignments.includes(an)) {
    console.log(`⏭️  [${an}] "${momName}" — already synced`);
    continue;
  }
  if (targetAN && an !== targetAN) continue;  // single-assignment filter

  console.log(`\n📝 [${an}] "${momName}" — ${students.length} students`);

  // Navigate to assignment page
  try {
    await aeriesPage.goto(`${BASE}/${an}`, { waitUntil: 'domcontentloaded' });
    await aeriesPage.waitForLoadState('domcontentloaded');
  } catch (navErr) {
    console.error(`  ❌ Navigation failed: ${navErr.message}`);
    students.forEach(s => fallbackEntries.push({ ...s, an, momName }));
    continue;
  }

  if ((await aeriesPage.locator('table.assignments').count()) === 0) {
    console.error(`  ❌ table.assignments not found — deferring to fallback`);
    students.forEach(s => fallbackEntries.push({ ...s, an, momName }));
    continue;
  }

  // Pre-validate: identify students with valid rows on this page
  const validStudents = [];
  for (const student of students) {
    const sel = `table.assignments tr[data-sn="${student.sn}"] td:first-child`;
    if ((await aeriesPage.locator(sel).count()) > 0) {
      validStudents.push(student);
    } else {
      console.warn(`  ❌ ${student.aeriesName}: row not found (sn=${student.sn})`);
      const entry = studentFileCache[student.aeriesName];
      entry.data.result.errors.push({ an, msg: `Row sn=${student.sn} not found` });
      totalErrors++;
    }
  }

  let enteredThisPage = 0;

  // --- Enter each student's score (fill + click-away, no read-back) ---
  for (let i = 0; i < validStudents.length; i++) {
    if (pipelineHalted) break;
    const { sn, aeriesName, aeriesTarget, item } = validStudents[i];
    const scoreStr = aeriesTarget.toString();
    const entry = studentFileCache[aeriesName];
    const cellSelector = `table.assignments tr[data-sn="${sn}"] td:first-child`;

    // Dry run: log and skip
    if (syncOptions.dryRun) {
      console.log(`  [DRY] ${aeriesName}: ${item.aeriesExisting ?? '—'} → ${scoreStr} (${item.reason})`);
      entry.data.result.entriesConfirmed = (entry.data.result.entriesConfirmed ?? 0) + 1;
      totalEntered++;
      enteredThisPage++;
      continue;
    }

    // --- Fill + click-away commit (no read-back — fast, reliable) ---
    // CRITICAL: keep outer loop to ≤6 students per execute call (MCP relay ~10s timeout)
    try {
      // Step 1: Click student's score cell to activate input
      await aeriesPage.locator(cellSelector).click();
      await aeriesPage.locator('table.assignments input.edit-text').first()
        .waitFor({ state: 'visible', timeout: 3000 });

      // Step 2: Fill the score value
      await aeriesPage.locator('table.assignments input.edit-text').first().fill(scoreStr);

      // Step 3: Commit via click-away
      //   - Non-last student: click next student's cell (commits current + activates next)
      //   - Last student (multi): click first student's cell (commits current)
      //   - Single student: press Tab (commits, moves to next column in same row)
      const isLast = (i === validStudents.length - 1);
      if (!isLast) {
        const nextSn = validStudents[i + 1].sn;
        await aeriesPage.locator(`table.assignments tr[data-sn="${nextSn}"] td:first-child`).click();
      } else if (validStudents.length > 1) {
        await aeriesPage.locator(`table.assignments tr[data-sn="${validStudents[0].sn}"] td:first-child`).click();
      } else {
        await aeriesPage.locator('table.assignments input.edit-text').first().press('Tab');
      }

      console.log(`  ✓ ${aeriesName}: → ${scoreStr}`);
      entry.data.result.entriesConfirmed = (entry.data.result.entriesConfirmed ?? 0) + 1;
      totalEntered++;
      enteredThisPage++;
    } catch (e) {
      console.warn(`  ⚠️ Fill error for ${aeriesName}: ${e.message}`);
      entry.data.result.errors.push({ an, msg: `Fill error: ${e.message}` });
      totalErrors++;
    }
  }

  if (pipelineHalted) break;

  // --- Save the assignment page ---
  if (!syncOptions.dryRun && enteredThisPage > 0) {
    console.log(`  💾 Saving [${an}]...`);
    // CRITICAL: use evaluate() NOT locator().click() — locator awaits navigation → times out
    // CRITICAL: this must be a SEPARATE execute call from the fill loop above (race condition otherwise)
    await aeriesPage.evaluate(() => document.querySelector('#assignmentQuickAssignSave').click());
    await aeriesPage.waitForTimeout(1500); // allow save to process before navigating away
    console.log(`  ✅ Saved`);
  }

  // Mark assignment completed in main cache (resume support)
  if (!syncOptions.dryRun && fs.existsSync(statePath)) {
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!saved.syncProgress) saved.syncProgress = { completedAssignments: [] };
    if (!saved.syncProgress.completedAssignments) saved.syncProgress.completedAssignments = [];
    if (!saved.syncProgress.completedAssignments.includes(an))
      saved.syncProgress.completedAssignments.push(an);
    fs.writeFileSync(statePath, JSON.stringify(saved, null, 2));
  }
}

// === FALLBACK: ScoresByStudent (for entries whose assignment page failed) ===
if (fallbackEntries.length > 0 && !pipelineHalted) {
  console.log(`\n⚠️  FALLBACK: ${fallbackEntries.length} entries via ScoresByStudent`);

  // Group by student for efficient navigation
  const byStudent = {};
  for (const s of fallbackEntries) {
    if (!byStudent[s.sn]) byStudent[s.sn] = { sn: s.sn, aeriesName: s.aeriesName, items: [] };
    byStudent[s.sn].items.push(s);
  }

  for (const { sn, aeriesName, items } of Object.values(byStudent)) {
    if (pipelineHalted) break;
    const entry = studentFileCache[aeriesName];
    const studentUrl = `${aeriesBase}/teacher/gradebook/${gradebookNum}/S/ScoresByStudent/Index/${sn}`;

    try {
      await aeriesPage.goto(studentUrl, { waitUntil: 'domcontentloaded' });
      await aeriesPage.waitForLoadState('domcontentloaded');
    } catch (e) {
      console.error(`  ❌ Fallback nav failed for ${aeriesName}: ${e.message}`);
      items.forEach(s => entry.data.result.errors.push({ an: s.an, msg: `Fallback nav: ${e.message}` }));
      totalErrors += items.length;
      continue;
    }

    let enteredFallback = 0;

    for (const { an, aeriesTarget, item } of items) {
      if (pipelineHalted) break;
      const scoreStr = aeriesTarget.toString();
      const rowLocator = aeriesPage.locator(`tr[data-an="${an}"]`);

      if ((await rowLocator.count()) === 0) {
        entry.data.result.errors.push({ an, msg: `Row data-an=${an} not found (fallback)` });
        totalErrors++;
        continue;
      }

      if (syncOptions.dryRun) {
        console.log(`  [DRY FALLBACK] ${aeriesName} | [${an}]: → ${scoreStr}`);
        entry.data.result.entriesConfirmed = (entry.data.result.entriesConfirmed ?? 0) + 1;
        totalEntered++;
        enteredFallback++;
        continue;
      }

      // Fill + read-back + retry (same retry policy as primary)
      let verified = false;
      for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
        if (attempt > 0) {
          const waitMs = RETRY_WAITS[attempt - 1];
          console.warn(`    ⟳ Retry ${attempt}/${RETRY_WAITS.length} (wait ${waitMs}ms)`);
          await new Promise(r => setTimeout(r, waitMs));
        }

        let readVal = null;
        try {
          await rowLocator.locator('td:first-child').click();
          await aeriesPage.locator('input.edit-text').first()
            .waitFor({ state: 'visible', timeout: 3000 });
          await aeriesPage.locator('input.edit-text').first().fill(scoreStr);
          // Commit via Tab (ScoresByStudent layout — rows are assignments, not students)
          await aeriesPage.locator('input.edit-text').first().press('Tab');
          await new Promise(r => setTimeout(r, 200));

          const readBack = await rowLocator.locator('td:first-child').textContent();
          readVal = readBack?.trim() === '' ? null : parseFloat(readBack?.trim());
        } catch (e) {
          console.warn(`    ⚠️ Fallback fill error: ${e.message}`);
        }

        if (readVal !== null && Math.abs(readVal - aeriesTarget) <= READBACK_TOLERANCE) {
          verified = true;
          break;
        }

        entry.data.result.retries.push({
          an, attempt: attempt + 1, readBack: readVal, expected: aeriesTarget,
          timestamp: new Date().toISOString()
        });

        if (attempt === RETRY_WAITS.length) {
          const errMsg = `Fallback read-back FAILED after ${RETRY_WAITS.length} retries: expected ${aeriesTarget}, got ${readVal}`;
          console.error(`  🛑 ${aeriesName} [${an}]: ${errMsg}`);
          entry.data.result.status = 'error';
          entry.data.result.errors.push({ an, msg: errMsg });
          entry.data.result.filledAt = new Date().toISOString();
          fs.writeFileSync(entry.filePath, JSON.stringify(entry.data, null, 2));
          pipelineHalted = true;
          totalErrors++;
        }
      }

      if (pipelineHalted) break;

      if (verified) {
        entry.data.result.entriesConfirmed = (entry.data.result.entriesConfirmed ?? 0) + 1;
        entry.data.result.usedFallback = true;
        totalEntered++;
        enteredFallback++;
      }
    }

    if (pipelineHalted) break;

    // Save student page
    if (!syncOptions.dryRun && enteredFallback > 0) {
      // CRITICAL: use evaluate() — same reason as primary save
      await aeriesPage.evaluate(() => document.querySelector('#assignmentQuickAssignSave').click());
      await aeriesPage.waitForTimeout(1500);
  }
}

// --- Flush all per-student files ---
for (const { filePath, data } of Object.values(studentFileCache)) {
  if (data.result.status !== 'error') {
    data.result.status = pipelineHalted ? 'partial' : 'filled';
  }
  data.result.filledAt = data.result.filledAt ?? new Date().toISOString();
  data.result.entriesAttempted = data.diff.toEnter.filter(d => d.reason !== 'already correct').length;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

if (pipelineHalted) {
  console.error(`\n🛑 PIPELINE HALTED — navigation failure or fill errors`);
  console.error(`   Fix the issue manually and re-run. Completed assignments will be skipped.`);
} else if (targetAN) {
  console.log(`\n=== Single-Assignment Sync Complete: [${targetAN}] — ${totalEntered} entered, ${totalErrors} errors ===`);
} else {
  console.log(`\n=== Sync Complete: ${totalEntered} entered, ${totalErrors} errors ===`);
}
```

**Primary strategy**: ScoresByAssignment — navigates to each assignment page and enters all
students' scores. Click-away commit (clicking next student's `td:first-child`), no read-back.

**Fallback trigger**: ScoresByStudent — used when an assignment page fails to load or
`table.assignments` is missing. Groups remaining entries by student and enters via the
ScoresByStudent page.

**Save button**: Always use `evaluate(() => document.querySelector('#assignmentQuickAssignSave').click())`.
Using `locator('#assignmentQuickAssignSave').click()` causes Playwright to await navigation → times out.

**Batch size**: Keep fill loops to ≤6 students per execute call. MCP relay has ~10s timeout;
longer loops hit this even when the JS is fast.

**Separate execute calls**: Fills and the save call MUST be in separate execute calls.
If save fires in the same call as fills, some scores don’t persist (race condition).

**Pipeline halt**: If navigation to an assignment page fails, entries defer to fallback.
On re-run, `completedAssignments` ensures saved assignments are skipped.

**Resume**: Skip any assignment whose `an` is in `syncProgress.completedAssignments`.

---

## Phase 7: Verify

Re-scrapes all Aeries assignment pages from scratch and compares every score against the
per-student temp files for ALL matched assignments (not just toEnter items). Uses ±0.1
tolerance. Sets `pipelineHalted` flag and writes halt info to main cache when mismatches
or missing scores are found. Updates each student's `result.status` to `verified` or
`verify-failed`.

```javascript
console.log('=== Phase 7: Verification Re-Scrape ===');

const verifyReport = { verified: [], mismatch: [], missing: [], errors: [] };
const BASE = `${aeriesBase}/teacher/gradebook/${gradebookNum}/S/ScoresByAssignment/Index`;
let pipelineHalted = false;
const haltStudents = new Set();
const haltAssignments = new Set();

// Load all per-student files
const studentFileCache = {};
for (const filePath of (perStudentFiles ?? [])) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    studentFileCache[data.metadata.studentName] = { filePath, data };
  } catch (e) {
    console.warn(`⚠️  Cannot read ${filePath}:`, e.message);
  }
}

// Re-scrape Aeries fresh (do NOT use cached data)
// Checks ALL assignments — not just toEnter items — for comprehensive error detection
for (const aeriesA of aeriesAssignments) {
  if (!assignmentCrossMap[aeriesA.assignmentNumber]) continue;
  if (targetAN && aeriesA.assignmentNumber !== targetAN) continue;  // single-assignment filter
  const an = aeriesA.assignmentNumber;
  const momName = assignmentCrossMap[an];

  await aeriesPage.goto(`${BASE}/${an}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  const rows = await aeriesPage.evaluate(() =>
    [...document.querySelectorAll('table.assignments tr.row')].map(r => ({
      sn: r.getAttribute('data-sn'),
      score: r.querySelector('td:first-child')?.textContent.trim() ?? ''
    }))
  );

  for (const { sn, score } of rows) {
    const aeriesName = snToAeriesName[sn];
    if (!aeriesName) continue;
    const entry = studentFileCache[aeriesName];
    if (!entry) continue;

    // Look up MOM score from per-student file (checks ALL assignments, not just toEnter)
    const momScore = entry.data.momScores?.[an];
    if (!momScore || momScore.isExempt || momScore.value === null) continue;

    const expectedScore = momScore.aeriesScore;
    if (expectedScore === null) continue;

    const actualScore = score === '' ? null : parseFloat(score);

    if (actualScore === null) {
      verifyReport.missing.push({ student: aeriesName, an, momName, expected: expectedScore });
      entry.data.result.errors.push({ an, msg: `Score missing in Aeries after fill (expected ${expectedScore})` });
      haltStudents.add(aeriesName);
      haltAssignments.add(an);
    } else if (Math.abs(actualScore - expectedScore) > 0.1) {
      verifyReport.mismatch.push({ student: aeriesName, an, momName, expected: expectedScore, actual: actualScore });
      entry.data.result.errors.push({ an, msg: `Score mismatch: expected ${expectedScore}, got ${actualScore}` });
      haltStudents.add(aeriesName);
      haltAssignments.add(an);
    } else {
      verifyReport.verified.push({ student: aeriesName, an });
    }
  }
}

// Determine halt status
pipelineHalted = verifyReport.mismatch.length > 0 || verifyReport.missing.length > 0;

// Flush all student files with verification results
for (const { filePath, data } of Object.values(studentFileCache)) {
  const hasErrors = data.result.errors.some(e => e.an !== undefined);
  if (hasErrors) {
    data.result.status = 'verify-failed';
  } else if (targetAN) {
    // Single-assignment mode: only one assignment checked — do NOT mark fully 'verified'
    data.result.status = 'partial-verified';
  } else {
    data.result.status = 'verified';
  }
  data.result.verifiedAt = new Date().toISOString();
  data.result.entriesConfirmed = verifyReport.verified.filter(
    v => v.student === data.metadata.studentName
  ).length;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Print final report
console.log(`\n✅ VERIFIED (Aeries matches MOM): ${verifyReport.verified.length}`);
console.log(`❌ MISMATCH (score wrong after fill): ${verifyReport.mismatch.length}`);
verifyReport.mismatch.forEach(m => console.log(`  [${m.an}] ${m.momName} | ${m.student}: expected ${m.expected}, got ${m.actual}`));
console.log(`⚠️  MISSING (score not entered): ${verifyReport.missing.length}`);
verifyReport.missing.forEach(m => console.log(`  [${m.an}] ${m.momName} | ${m.student}: expected ${m.expected}`));

// Save verification summary + halt info to main cache
if (fs.existsSync(statePath)) {
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  saved.verifyReport = {
    verifiedAt: new Date().toISOString(),
    verified: verifyReport.verified.length,
    mismatch: verifyReport.mismatch.length,
    missing: verifyReport.missing.length,
    pipelineHalted,
    haltReason: pipelineHalted
      ? `${verifyReport.mismatch.length} mismatches, ${verifyReport.missing.length} missing`
      : null,
    haltStudents: [...haltStudents],
    haltAssignments: [...haltAssignments]
  };
  fs.writeFileSync(statePath, JSON.stringify(saved, null, 2));
}

if (!pipelineHalted && targetAN) {
  console.log(`\n✅ Assignment [${targetAN}] verified. Student files set to "partial-verified" (single-assignment mode).`);
} else if (!pipelineHalted) {
  console.log('\n🎉 All scores verified. Sync complete!');
} else {
  console.error(`\n🛑 PIPELINE HALTED — verification failed`);
  console.error(`   ${verifyReport.mismatch.length} mismatches, ${verifyReport.missing.length} missing`);
  console.error(`   Affected students: ${[...haltStudents].join(', ')}`);
  console.error(`   Affected assignments: ${[...haltAssignments].join(', ')}`);
  console.error(`   Check per-student files for details. Fix manually and re-run Phase 7.`);
}
```

**Acceptance criteria**: `pipelineHalted === false` (i.e. `mismatch.length === 0 && missing.length === 0`).
Any mismatch or missing score halts the pipeline and writes halt details to the main cache file.

---

## Error Handling Table

| Error | Cause | Solution |
|-------|-------|----------|
| `MOM: 0 students` | Wrong table selector | Use `#myTable tbody tr` and skip row 0 (Averages) |
| Student name is empty | Reading `td` instead of `th` | Use `row.querySelector('th').textContent.trim()` |
| Score is `NaN` or wrong | `textContent` instead of `data-ptv` | Use `cell.querySelector('a')?.getAttribute('data-ptv')` |
| Score input not found | Inputs are dynamic (click-to-activate) | Click `td:first-child` first; input appears as `.edit-text` |
| Assignment name truncated | Using `textContent` on Aeries header | Use `a.assignment-edit[data-assignment-name]` |
| `Aeries: 0 students` | Wrong selector (`a[href*="student"]` finds nav links) | Use `table.students tr.row a.student-name-link` |
| `❌ No MOM match for Aeries student` | Middle initial in Aeries name mismatch | Strip middle initial in `normalizeStudentName` — already handled |
| `Cannot extract gradebook number` | URL does not contain `/gradebook/{n}/` | Verify Aeries tab is on gradebook page |
| Navigation timeout | SPA route change | Use `waitUntil: 'domcontentloaded'` not `waitForNavigation` |
| Score already exists | Aeries has data | MOM is source of truth — overwrite by default (`forceOverwrite: true`) |
| ScoresByStudent row not found | `tr[data-an]` selector wrong for this gradebook | Fall back to ScoresByAssignment; inspect page HTML first |
| Per-student file missing | Phase 4.6 didn't run or failed mid-loop | Re-run from Phase 4.6; check `perStudentFiles` in main cache |
| `result.status: error` in student file | Phase 6 fill or Phase 7 verify failed | Read `result.errors` array; fix manually then re-run Phase 7 |
| Phase 7 mismatch after fill | Save button fired but Aeries didn't commit | Re-run Phase 6 with `dryRun: false`; check console for save errors |

---

## Common Mistakes Table

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| `table.gradebook tbody tr` for MOM rows | Table class is `gb` not `gradebook`, id is `myTable` | Use `#myTable tbody tr` and skip first row (Averages) |
| First `td` for MOM student name | Name is in `<th>`, not `<td>` | Use `row.querySelector('th').textContent.trim()` |
| `row.querySelectorAll('td')[columnIndex]` for score | Skips the `<th>` cell, shifts all column indices | Use `[...row.children][columnIndex]` (all children) |
| `cell.textContent` for MOM score | Shows percentage like "72.5%" not raw points | Use `cell.querySelector('a')?.getAttribute('data-ptv')` |
| `raw === ''` only for exempt check | MOM uses `-e` marker for exempt assignments | Also check `!ptv` and `raw.startsWith('-')` |
| `th.textContent.trim()` for Aeries assignment name | Display text is CSS-truncated with `...` | Use `th.querySelector('a.assignment-edit')?.getAttribute('data-assignment-name')` |
| `table a[href*="student"]` for Aeries students | Matches dozens of nav/profile links | Use `table.students tr.row a.student-name-link` |
| `input[name*="Score"]` for score inputs | No such static input exists — inputs are dynamic | Click `td:first-child`; input appears as `input.edit-text` |
| `?an=77` in score entry URL | Aeries uses path-based routing | Use `/ScoresByAssignment/Index/77` |
| Entering raw MOM pts (e.g. 8.7) directly | Aeries uses 100-pt scale for all assignments | Convert: `Math.round(value / maxPoints * 100 * 10) / 10` |
| Entering 0 for blank/exempt | Blank = not submitted; 0 = attempted and failed | Leave field empty (`value === null` check) |
| Looking up Aeries rows by student name text | Assignments table rows have no name text — only `data-sn` | Build `sn → aeriesName` map from students table |
| NOT overwriting existing scores | Aeries might have stale/wrong scores | MOM is always source of truth — `forceOverwrite: true` is the default; always overwrite |
| Skipping dry-run | No way to preview before writing | Always `dryRun: true` first |
| Using `browser.contexts()[0].pages()` | `browser` not available in Playwriter | Use `context.pages()` |
| Using `waitForNavigation()` | Aeries is SPA — hangs | Use `waitUntil: 'domcontentloaded'` |
| Skipping expand step | Most MOM assignments collapsed by default | Run expand loop first |
| Using `innerHTML` for Aeries assignment names | Returns `&amp;` instead of `&` | Use `textContent` or `data-assignment-name` attr |
| Iterating `perStudentFiles` before Phase 4.6 runs | Files don't exist yet | Always run Phases in order: 4.6 → 5 → 6 → 7 |
| Loading student file by index instead of `aeriesName` key | Wrong student's data used | Use `studentFileCache[aeriesName]` map, not array index |
| Comparing scores with `===` | Floating point: `72.5 !== 72.50` | Use `Math.abs(actual - expected) <= 1` tolerance |
| Re-using cached Aeries scores in Phase 7 | Phase 7 must detect post-fill state | Always re-scrape Aeries fresh in Phase 7 — never use Phase 5 data |
| `locator('#assignmentQuickAssignSave').click()` | Playwright waits for navigation after click → times out | Use `evaluate(() => document.querySelector('#assignmentQuickAssignSave').click())` |
| Fill loop >6 students in one execute call | MCP relay has ~10s timeout; long loops hit it even with fast JS | Batch: ≤6 students per execute call |
| Fill + save in same execute call | Race condition — save fires before DOM commits all fills | Always save in a SEPARATE execute call after all fills complete |
| Not checking `np` after score write | Aeries auto-sets `np = mk` when overwriting a score | After writing scores, check `td[data-col-name="np"]` for affected students; fix to 100 if `np ≠ 100` |
| Duplicate `toEnter` entries when restoring from cache | Cache restore can produce duplicate `(sn, an)` pairs | Deduplicate `assignmentEntries` by `sn:an` key after building (see Phase 6 dedup block) |

---

## Cleanup

- Do NOT close browser tabs (user needs them for spot-checking)
- Review console output for `❌` warnings before marking complete
- Re-run with `dryRun: false, forceOverwrite: true` to apply all MOM scores
