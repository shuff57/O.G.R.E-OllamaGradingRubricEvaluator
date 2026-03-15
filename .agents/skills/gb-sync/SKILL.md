---
name: gb-sync
description: Use when syncing student scores from MyOpenMath into Aeries after assignments already exist in both systems, especially for dry-run-first score entry, single-assignment reruns, interrupted sessions that must resume from temp files, or verification-heavy gradebook sync work.
---

# Gradebook Score Sync (MyOpenMath → Aeries)

> Sync MyOpenMath scores into existing Aeries assignments with a report-first workflow. This skill creates resumable per-student temp files, pauses for user approval after the dry run, enters only approved blank scores in live mode, and halts immediately when the gradebook leaves a safe writable state.

## Overview
- Source system: MyOpenMath (MOM)
- Destination system: Aeries gradebook
- Safety model: dry run → approval → live mode → verification
- Resume model: one session state file plus one `gb-sync-student-{name}.json` file per matched student
- Scope: only assignments that already exist in both systems

## Prerequisites
- `gb-compare` completed and its comparison output is available
- `gb-new-assignment` completed if Aeries was missing any target assignments
- Playwriter connected to a logged-in MOM gradebook tab and a logged-in Aeries gradebook tab
- Aeries user has permission to enter scores
- User understands that blank Aeries cells may be filled from MOM, while existing non-zero Aeries scores are protected and routed to manual review

## When to Use
- "sync scores", "copy grades to Aeries", "enter student scores"
- Stage 3 of `gb-pipeline`
- "sync just Homework 3.1" or "sync assignment #77"
- An earlier sync halted and must resume from saved temp files
- Teacher wants a dry-run report before any browser writes

## When NOT to Use
- Assignments are still missing in Aeries; use `gb-new-assignment` first
- Cross-system assignment matching has not been reviewed; use `gb-compare` first
- User wants blind overwrites of existing non-zero Aeries scores
- The task is only comparing gradebooks, not entering scores

## Guardrails

> ⚠️ **Must NOT:**
> - Never skip Phase 4. The dry-run report and explicit user approval are mandatory.
> - Never overwrite an existing **non-zero** Aeries score unless the user explicitly authorizes that exact overwrite.
> - Never enter `0` for blank, exempt, `--`, `-e`, or `E` MOM cells; leave those cells empty and log the reason.
> - Never continue after a login redirect, missing Aeries score grid, repeated input/save failure, or any halt condition from Phase 6.
> - Never auto-accept fuzzy student matches below `0.80` confidence.
> - Never delete temp files before Phase 7 finishes; they are the audit trail and resume checkpoint.
> - Never mark the sync complete without a fresh Aeries re-scrape.

## Quick Start
1. Load the MOM gradebook, the Aeries gradebook, and the latest `gb-compare` output.
2. Run Phases 1-4 to build `gb-sync-student-{name}.json` files and generate the dry-run report.
3. After explicit approval, switch to live mode for Phases 5-7 and verify every written score.

## Workflow

### Phase 1: Setup
- **INPUT:** MOM tab, Aeries gradebook tab, comparison artifact, optional single-assignment target
- **ACTION:**
  - Detect both tabs, extract the Aeries gradebook number, and create a session workspace.
  - Read the comparison artifact and keep only assignments confirmed to exist in both systems.
  - Detect prior session state and existing `gb-sync-student-{name}.json` files to decide resume vs refresh.
  - Resolve single-assignment mode by assignment number, exact name, or fuzzy name.
- **OUTPUT:** Active sync session, target assignment list, resume decision, session state file

### Phase 2: Student Discovery
- **INPUT:** Aeries gradebook roster pages and session setup
- **ACTION:**
  - Scrape the Aeries student roster with durable row identifiers (`data-sn`, student IDs, display names).
  - Build `sn → student` maps for later score-entry row lookup.
  - Normalize Aeries student names so middle initials and punctuation do not break matching.
  - Flag any roster anomalies before MOM scores are attached.
- **OUTPUT:** Aeries roster snapshot, row-lookup maps, candidate student identity set

### Phase 3: MOM Score Collection
- **INPUT:** MOM gradebook view, assignment mapping, Aeries roster snapshot
- **ACTION:**
  - Set MOM to show all assignments, expand collapsed categories, and scrape assignment metadata plus raw student scores.
  - Match MOM students to Aeries students using confidence thresholds; anything below `0.80` becomes manual review.
  - Convert raw MOM points to Aeries-ready percentages only for eligible scored cells.
  - Write one temp file per matched student: `gb-sync-student-{name}.json`.
  - Preselect the downstream Aeries entry strategy:
    - **ScoresByAssignment** = default for full-class or multi-assignment syncs
    - **ScoresByStudent** = fallback for assignment-page failures, targeted recovery, or leftover entries after a halt
- **OUTPUT:** Per-student temp files, MOM score map, matched roster, entry strategy plan

### Phase 4: Dry-Run Report
- **INPUT:** Per-student temp files and live Aeries scores
- **ACTION:**
  - Re-scrape current Aeries cells before any write.
  - For each student/assignment pair, classify the row as `ready-to-enter`, `already-correct`, `skip-exempt`, `skip-nonzero`, or `manual-review`.
  - Save diff results back into each student temp file.
  - Build a report summarizing what would be written, what is skipped, and what requires teacher review.
  - Stop and wait for explicit user approval before live mode.
- **OUTPUT:** Approval-ready dry-run report and updated temp files

### Phase 5: Live Score Entry
- **INPUT:** Approved dry-run report, live mode flag, per-student temp files
- **ACTION:**
  - Require an explicit mode switch from dry run to live.
  - Enter scores in **batches of 5 students**, saving after each batch and after the final partial batch.
  - Before each write, re-check page state and the current Aeries value.
  - Fill only safe blank score cells; if a current value is non-zero, skip it and record manual review instead of overwriting.
  - Keep `np` / possible-points values at their required Aeries defaults after writing.
- **OUTPUT:** Saved live batches, updated temp files, skip list for protected cells

### Phase 6: Halt Detection
- **INPUT:** Live sync state or resumed session
- **ACTION:**
  - Treat login redirects, sign-in pages, missing assignment tables, missing row/input targets, save failures, or verification-sized write discrepancies as halt conditions.
  - Persist the halt reason to the main session state and affected student files.
  - Stop immediately, show the exact blocked students/assignments, and instruct the user to fix the session before resuming.
- **OUTPUT:** Clean halt record with resume checkpoint, or confirmation that live mode stayed healthy

### Phase 7: Verification
- **INPUT:** Completed live batches, target assignment scope, per-student temp files
- **ACTION:**
  - Re-scrape Aeries from scratch for every targeted assignment.
  - Compare actual Aeries scores against the expected `aeriesScore` stored in each student temp file.
  - Mark each student file as `verified`, `partial-verified`, `verify-failed`, or `halted`.
  - Summarize verified rows, missing scores, mismatches, and anything left for manual review.
- **OUTPUT:** Final verification report and audit-ready temp files

## Error Handling

| Problem | Action |
|---------|--------|
| MOM roster or assignments look incomplete | Reset the MOM filter to **All**, expand all categories, and scrape again before matching. |
| Aeries assignment name appears truncated | Read the full assignment name from Aeries metadata (`data-assignment-name`), not visible header text. |
| Student match confidence is below `0.80` | Do not sync that student automatically; write manual-review status into the temp file and report. |
| Existing Aeries score is non-zero | Skip the write, preserve the current score, and require explicit teacher approval for any overwrite. |
| Aeries returns to login mid-run | Mark the session halted immediately, save all state, and stop until the user restores the session. |
| Save succeeds but verification finds missing or mismatched scores | Mark `verify-failed`, record the affected student and assignment, and do not claim completion. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Going straight to live mode | Always finish Phase 4 and get explicit approval first. |
| Treating blank MOM cells as zeroes | Blank or exempt MOM cells stay blank in Aeries; never invent zeroes. |
| Matching Aeries rows by visible name text | Use stable row keys such as `data-sn`; visible names are only for reporting. |
| Rebuilding temp files after a halt without checking resume state | Load the existing session first; only refresh when the user wants a fresh run. |
| Overwriting an existing non-zero score because MOM is the source of truth | Stop and flag manual review unless the user explicitly authorizes the overwrite. |
| Trusting cached Aeries data during verification | Phase 7 must re-scrape Aeries fresh every time. |

## State Management

- **Session directory:** keep one repo-local session folder per gradebook sync run.
- **Main state file:** store assignment scope, resume info, completed batches, halt reason, and verification summary.
- **Per-student files:** `gb-sync-student-{safe-name}.json`
- **Recommended student file shape:**

```json
{
  "metadata": {
    "gradebookNum": "1234",
    "studentName": "Petersen, Julia M.",
    "sn": "900123",
    "createdAt": "2026-03-15T12:00:00Z"
  },
  "momScores": {
    "77": {
      "momName": "Homework 3.1",
      "value": 8.7,
      "maxPoints": 10,
      "isExempt": false,
      "aeriesScore": 87
    }
  },
  "diff": {
    "checkedAt": null,
    "readyToEnter": [],
    "skipNonzero": [],
    "skipExempt": [],
    "manualReview": []
  },
  "result": {
    "status": "pending",
    "filledAt": null,
    "verifiedAt": null,
    "entriesAttempted": 0,
    "entriesConfirmed": 0,
    "errors": []
  }
}
```

- **Resume protocol:**
  - Load existing state first.
  - Keep completed assignment and batch markers so reruns skip safe completed work.
  - In single-assignment mode, Phase 7 ends at `partial-verified`, not full `verified`.
  - Preserve halted and verify-failed records until the user explicitly resets them.

## Selectors / References

### Core selectors to preserve
| System | Purpose | Selector / Key |
|--------|---------|----------------|
| MOM | show all assignments | `#availshow` |
| MOM | gradebook table | `#myTable` |
| MOM | assignment headers | `th[data-pts]` |
| Aeries | assignment headers | `th[data-an]` |
| Aeries | student roster rows | `table.students tr.row` |
| Aeries | assignment score rows | `table.assignments tr.row` |
| Aeries | mark cell | `td[data-col-name="mk"]` or first score cell on the assignment row |
| Aeries | save button | `#assignmentQuickAssignSave` |

- Full phase notes, matching details, selector cautions, live-entry strategy rules, and halt triggers live in `references/phase-details.md`.
