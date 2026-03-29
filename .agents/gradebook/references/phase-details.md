# gb-sync Phase Details

Use this reference for the high-detail operational rules that would otherwise make `SKILL.md` too large. The main skill defines the contract; this file preserves the selector-level and resume-level details that make the workflow reliable.

## Session Artifacts

Keep all sync state together so a halted run can resume safely.

| Artifact | Purpose | Notes |
|---------|---------|-------|
| `gb-sync-state-{gradebookNum}.json` | Main session state | Tracks assignment scope, mode, completed batches, halt reason, verification summary |
| `gb-sync-student-{safe-name}.json` | Per-student progress file | One file per matched student; source of truth for resume, dry run, and verification |
| `gb-sync-student-{safe-name}.UNMATCHED.json` | Optional unmatched stub | Use when an Aeries roster entry cannot be matched to MOM with sufficient confidence |
| dry-run report | Human approval artifact | Must be shown before live mode |

Recommended repo-local layout:

```text
grade-cloning/temp/gb-sync/{gradebookNum}/
  gb-sync-state-{gradebookNum}.json
  gb-sync-student-Petersen_Julia_M.json
  gb-sync-student-Smith_John_R.UNMATCHED.json
```

## Matching and Conversion Rules

### Assignment matching
- Read only assignments already confirmed by `gb-compare`, then verify the current live pages still expose them.
- If a single assignment is requested, resolve in this order:
  1. Exact Aeries assignment number
  2. Exact Aeries assignment name
  3. Exact MOM assignment name through the existing cross-map
  4. Fuzzy assignment match as a last resort
- Do not accept a fuzzy assignment match below `0.50` when resolving a single target.

### Student matching
- Normalize to `last, first` pairs.
- Strip punctuation and middle initials because Aeries often includes them while MOM does not.
- Confidence rules:
  - `1.00` exact last + first match
  - `0.95` exact last + first-prefix match
  - `0.90` exact last + first-initial match
  - `0.85` last-name containment + exact first match
- Anything below `0.80` must become manual review, not an automatic sync candidate.

### Score conversion
- MOM stores raw points; Aeries score-entry pages expect a 100-point scale.
- Convert only scored, non-exempt cells:

```text
aeriesScore = round((momValue / maxPoints) * 100, 1)
```

- If `momValue` is blank, exempt, `--`, `E`, `-e`, or otherwise unscored, keep the Aeries cell blank.

### Version A / Version B pairs
- Preserve the paired-version detection from the archived workflow.
- If two MOM assignments differ only by a trailing `Version A` / `Version B` marker, treat them as a pair.
- If local grading policy requires it, log the untaken version as `NA` or manual review rather than writing a numeric score.

### Strategy note
- `ScoresByAssignment` and `ScoresByStudent` are **Aeries entry strategies**.
- MOM score collection still comes from the MOM gradebook grid; the strategy decision controls how those scores are written into Aeries later.

## Phase 1 Details — Setup

### Required discovery
- Locate the MOM page by URL containing `myopenmath.com`.
- Locate the Aeries gradebook page by URL containing both `aeries` and `gradebook`.
- Extract `gradebookNum` from `/gradebook/{number}` in the Aeries URL.
- Capture `aeriesBase` from the Aeries origin for later route construction.

### Resume rules
- If a matching `gb-sync-state-{gradebookNum}.json` already exists, load it first.
- Resume only when these still match:
  - gradebook number
  - same Aeries base URL
  - compatible assignment scope
- If the state is stale or mismatched, start fresh only after explicit user approval.

### Single-assignment mode
- Accept `#77`, `77`, full assignment names, or partial names.
- Resolve the target before any live writing.
- Even in single-assignment mode, still build full roster and per-student files; only Phases 5-7 are narrowed to the target assignment.

## Phase 2 Details — Student Discovery

### Aeries roster selectors

| Purpose | Selector / Key | Why it matters |
|---------|----------------|----------------|
| Assignment headers | `th[data-an]` | `data-an` is the durable assignment number |
| Full assignment name | `a.assignment-edit[data-assignment-name]` | Visible text can be truncated with `...` |
| Student roster rows | `table.students tr.row` | Stable source for student identities |
| Student display name | `a.student-name-link` | Human-readable report name |
| Student row key | `data-sn` | Required for assignment-grid row lookup |
| Student IDs | `data-stusc`, `data-stuid` | Extra identity evidence |

### Discovery rules
- Build `sn -> aeriesName` and `aeriesName -> studentMeta` maps.
- Do not use loose page-wide student links such as `a[href*="student"]`; they overmatch navigation links.
- Preserve the original display name for reports even when normalized values are used for matching.

## Phase 3 Details — MOM Score Collection

### MOM selectors and extraction facts

| Purpose | Selector / Key | Critical note |
|---------|----------------|---------------|
| Show all filter | `#availshow` | Set to value `2` for All |
| Assignment headers | `th[data-pts]` | One per assignment |
| Assignment name | first text node inside the header `div` | Avoids `[Settings][Isolate]` noise |
| Gradebook table | `#myTable` | This is the real table ID |
| Student rows | `#myTable tbody tr` | Skip row `0`; it is the averages row |
| Student name | row `<th>` text | Name is not in the first `<td>` |
| Score cell | all row children indexed by header `cellIndex` | Using only `<td>` cells shifts alignment |
| Raw score value | anchor `data-ptv` | Visible text may be percent or formatted text |

### Collection rules
- Force MOM to show all assignments before scraping.
- Expand every `[Expand]` link until none remain.
- Use all row children (`th + td`) when mapping assignment columns to score cells.
- Treat these as blank or exempt:
  - no `data-ptv`
  - empty text
  - `--`
  - `E`
  - text starting with `-` such as `-e`

### Per-student file creation
- Create `gb-sync-student-{safe-name}.json` only for matched students at or above the confidence threshold.
- Include:
  - `metadata`
  - `momScores`
  - `diff`
  - `result`
- Preserve unmatched roster entries separately so the user can review them before live mode.

## Phase 4 Details — Dry-Run Report

### Re-scrape before diffing
- Read live Aeries values from assignment entry pages, not from cached grid data.
- Preferred assignment route:

```text
/teacher/gradebook/{gradebookNum}/S/ScoresByAssignment/Index/{assignmentNumber}
```

- This is a path-based route, not a `?an=` query parameter.

### Diff categories

| Category | Meaning | Live-mode behavior |
|----------|---------|--------------------|
| `ready-to-enter` | MOM has numeric score and Aeries is blank | Eligible for live entry |
| `already-correct` | Aeries already matches expected value | Verify later; do not rewrite |
| `skip-exempt` | MOM is blank or exempt | Leave blank |
| `skip-nonzero` | Aeries already contains a non-zero score | Protect it; require explicit teacher approval to overwrite |
| `manual-review` | Low-confidence match, impossible values, mismatched context, or special-case handling | Stop for teacher review |

### Report requirements
- Summarize by assignment and by student.
- Show counts for each category.
- Call out every protected non-zero score explicitly.
- Require explicit teacher approval before Phase 5.

## Phase 5 Details — Live Score Entry

### Strategy selection

| Strategy | Use when | Notes |
|----------|----------|-------|
| `ScoresByAssignment` | Default path for full syncs or multi-assignment runs | One assignment page shows all students |
| `ScoresByStudent` | Assignment page fails, page structure is missing, or a halted run leaves a small residue to finish | Fallback and targeted recovery path |

### Assignment-page write rules
- Navigate to the assignment page for one assignment at a time.
- Work in **batches of 5 students**.
- Save after each batch and after the final short batch.
- Before each fill:
  - verify the page is still on the expected assignment
  - verify the row for the student `data-sn` exists
  - re-read the current Aeries score
  - if the score is non-zero, skip and log `skip-nonzero`

### Dynamic inputs and save behavior
- Aeries score inputs are dynamic; click the score cell first so `input.edit-text` appears.
- Prefer the mark cell keyed by `td[data-col-name="mk"]` or the first score cell on the row.
- The save button is `#assignmentQuickAssignSave`.
- Use page-side click execution for save if normal locator clicks trigger navigation waits.
- Keep fills and save calls in separate execution steps when the browser layer proves timing-sensitive.

### `np` protection
- Aeries may auto-change the possible-points column when overwriting or filling scores.
- Re-check `td[data-col-name="np"]` for touched rows and restore the required default if it drifts.

### Fallback student-page route

```text
/teacher/gradebook/{gradebookNum}/S/ScoresByStudent/Index/{sn}
```

- Use this only when assignment-page entry is unavailable or unsafe.
- Preserve the same non-zero protection and halt rules.

## Phase 6 Details — Halt Detection

### Halt immediately if any of these occur
- URL changes to a login, sign-in, auth, or session-expired page
- Expected assignment table is missing
- Expected student row cannot be found by `data-sn`
- Dynamic score input never appears after the cell click
- Save control is missing or repeatedly fails
- Read-back or later verification shows the write did not persist
- Browser automation loses the gradebook context entirely

### Halt persistence
- Write the halt reason to the main state file.
- Mark affected student files with `result.status = "halted"` and append a structured error.
- Record:
  - affected assignments
  - affected students
  - last successful batch
  - whether fallback mode was in use

### Resume after halt
- Restore the authenticated session first.
- Reload the existing state and resume from the first incomplete batch.
- Do not delete or regenerate successful student files unless the user chooses a fresh restart.

## Phase 7 Details — Verification

### Verification rules
- Re-scrape Aeries fresh from live pages; never trust Phase 4 snapshots.
- Check every targeted assignment for every matched student, not just the cells written in the current run.
- Compare with tolerance `±0.1`.

### Final statuses

| Status | Meaning |
|--------|---------|
| `verified` | Full-scope sync verified successfully |
| `partial-verified` | Single-assignment mode verified only the targeted assignment |
| `verify-failed` | Aeries value missing or mismatched after live mode |
| `halted` | Run stopped before verification completed |

### Acceptance rule

```text
pipelineHalted === false
missing === 0
mismatch === 0
```

- Any missing or mismatched score blocks completion.
- Keep the temp files as the audit trail even after success.

## Retry and Timeout Policy

### Default timeouts
| Wait context | Duration | Why |
|--------------|----------|-----|
| After MOM filter/expand action | 1500ms | MOM re-renders the gradebook table |
| After Kendo modal open | 1500ms | Modal animation + widget initialization |
| After Save and Add New | 2000ms | Aeries async save + form reset |
| After Save and Close / page reload | 3000ms | Full page re-render |
| After clicking a score cell (dynamic input) | 500ms | Input element appears in-place |

### Retry policy for DOM-readiness checks
- **Max retries:** 3 attempts
- **Backoff:** 1s between attempts (fixed, not exponential — these are short UI waits)
- **What to retry:** missing expected element after a click or navigation (e.g., `#Assignment_Description` after opening modal, `input.edit-text` after clicking score cell, Kendo widget `.data()` returning undefined)
- **What NOT to retry:** login redirects, HTTP errors, save verification failures — these are halt conditions, not transient issues

### Example retry pattern
```javascript
async function waitForElement(page, selector, { retries = 3, delay = 1000 } = {}) {
  for (let i = 0; i < retries; i++) {
    const found = await page.evaluate((sel) => !!document.querySelector(sel), selector);
    if (found) return true;
    if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
  }
  return false; // caller decides: halt or throw
}
```

## Common Selector Pitfalls to Preserve

| Pitfall | Correct handling |
|---------|------------------|
| Reading MOM student names from the first `<td>` | Use the row `<th>` |
| Indexing MOM scores with only `<td>` cells | Use all row children so `cellIndex` stays aligned |
| Reading MOM score text instead of raw points | Use anchor `data-ptv` |
| Reading truncated Aeries assignment text | Use `data-assignment-name` |
| Looking up Aeries score rows by visible name | Use `data-sn` |
| Treating score inputs as static DOM | Activate them by clicking the score cell first |
| Using a query string for Aeries assignment entry pages | Use path-based routes |

## Verification Checklist for the Skill Author / Operator

- All 7 phases are preserved in the main skill.
- Dry-run mode is the default and live mode requires approval.
- `gb-sync-student-{name}.json` files remain the center of resume and audit behavior.
- Non-zero Aeries scores are protected unless the user explicitly authorizes a specific overwrite.
- Halt detection includes login redirects and broken Aeries page states.
- Verification is a fresh Aeries re-scrape, not a cache replay.
