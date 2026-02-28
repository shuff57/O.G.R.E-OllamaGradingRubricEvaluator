---
name: gb-pipeline
description: Use when syncing MyOpenMath (MOM) assignments and scores into Aeries end-to-end — assignments missing from Aeries, scores unsynced, or both.
---

# Gradebook Pipeline (MOM → Aeries)

**You are the orchestrator.** Delegate each stage to a dedicated sub-agent via `task()`. After each stage completes, read the temp file it wrote to verify results, then confirm with the user before proceeding to the next stage.

## Prerequisites

- Playwriter MCP connected, extension active on **both** tabs
- Tab 1: MyOpenMath gradebook (teacher view, all assignments visible)
- Tab 2: Aeries gradebook (teacher write permissions)
- `C:\Users\shuff\grade-cloning\` project directory exists

**Do NOT use** if only one stage is needed — invoke `gb-compare`, `gb-new-assignment`, or `gb-sync` directly.

---

## Temp File Chain

| File | Written by | Read by |
|------|-----------|---------|
| `temp/gb_compare_{GN}.json` | Stage 1 (gb-compare) | Orchestrator + Stage 2 prompt |
| `temp/gb_new_assignment_{GN}.json` | Stage 2 (gb-new-assignment) | Orchestrator |
| `temp/gb_sync_{GN}.json` | Stage 3 (gb-sync) | Stage 3 (resume on timeout) |
| `temp/students/{GN}/*.json` | Stage 3 Phase 4.6 | Stage 3 Phases 5, 6, 7 |

`{GN}` = gradebook number extracted from the Aeries URL (`/gradebook/{GN}/`).

---

## Stage 1: Compare

Spawn a sub-agent with the `gb-compare` skill:

```
task(
  category="unspecified-high",
  load_skills=["gb-compare"],
  description="Stage 1: Compare MOM vs Aeries assignments",
  run_in_background=False,
  prompt="Run gb-compare. Both tabs are already open: MOM gradebook and Aeries gradebook. Compare all assignments — expand all MOM categories, fetch assigned/due dates (Phase 2 Step 5), generate the markdown report at grade-cloning/gradebook-comparison.md, and write the Phase 5 structured JSON temp file at grade-cloning/temp/gb_compare_{gradebookNum}.json (gradebookNum extracted from the Aeries URL)."
)
```

**After Stage 1 completes — verify and confirm before Stage 2:**

1. Run Bash: `ls C:\Users\shuff\grade-cloning\temp\gb_compare_*.json` to find the file
2. Read the JSON with the Read tool — extract `gradebookNum`, `missing[]`, `matched[]`
3. Show the user:
   - Total MOM assignments / Total Aeries assignments / Missing count
   - Table of missing assignments (name, category, pts, assignedDate, dueDate)
4. Ask: *"Found {N} missing assignment(s). Proceed to Stage 2 to add them to Aeries?"*
   - 0 missing → *"No missing assignments found. Skip to Stage 3 (sync scores)?"*
   - User says No → stop pipeline

---

## Stage 2: Add Missing Assignments

Take `gradebookNum` from Stage 1's temp file. Replace `{ACTUAL_GN}` in the prompt with the real value, then spawn:

```
task(
  category="unspecified-high",
  load_skills=["gb-new-assignment"],
  description="Stage 2: Add missing assignments to Aeries",
  run_in_background=False,
  prompt="Run gb-new-assignment. The Aeries gradebook tab is already open. Read the Stage 1 temp file at grade-cloning/temp/gb_compare_{ACTUAL_GN}.json to get the missing assignments list. Add all missing assignments to Aeries, then verify. After verification, write the completion temp file at grade-cloning/temp/gb_new_assignment_{ACTUAL_GN}.json."
)
```

**After Stage 2 completes — verify and confirm before Stage 3:**

1. Read `grade-cloning/temp/gb_new_assignment_{gradebookNum}.json`
2. Show: created count, any failures
3. Ask: *"Added {N} assignment(s). Proceed to Stage 3 to sync scores?"*
   - User says No → stop pipeline

---

## Stage 3: Sync Scores

Stage 3 runs gb-sync Phases 1–7. Phases 4.6, 5, 6, and 7 now produce and consume
per-student temp files under `temp/students/{gradebookNum}/`. Always dry-run first.

If the user requested a single assignment sync, include the target assignment in the prompt
(e.g., `targetAssignment = "Homework 3.1"` or `targetAssignment = "77"`). If no target is
specified, run a full sync (all assignments).

```
task(
  category="unspecified-high",
  load_skills=["gb-sync"],
  description="Stage 3: Sync MOM scores to Aeries",
  run_in_background=False,
  prompt="Run gb-sync Phases 1–7. Both tabs are already open: MOM gradebook and Aeries gradebook. Always start with dryRun: true to preview changes. Show the dry-run output to the user and ask them to confirm before applying with dryRun: false. Use the temp cache at grade-cloning/temp/gb_sync_{gradebookNum}.json to skip re-extraction if fresh (<24h). Phase 4.6 will create per-student JSON files in grade-cloning/temp/students/{gradebookNum}/. Phase 5 populates each student's diff section. Phase 6 fills scores using ScoresByStudent (with ScoresByAssignment fallback). Phase 7 re-scrapes Aeries and verifies every score — acceptance criterion: 0 mismatches and 0 missing. Resume from syncProgress.completedStudents if interrupted mid-run."
)
```

### Stage 3 (single-assignment variant)

When the user requests a single assignment sync, replace the Stage 3 prompt with:

```
task(
  category="unspecified-high",
  load_skills=["gb-sync"],
  description="Stage 3: Sync single assignment scores to Aeries",
  run_in_background=False,
  prompt="Run gb-sync Phases 1–7 in SINGLE-ASSIGNMENT MODE. Target assignment: {TARGET_ASSIGNMENT}. Both tabs are already open. Set targetAssignment = \"{TARGET_ASSIGNMENT}\" in Phase 4.8 to resolve the target. Always start with dryRun: true. Show dry-run output and ask user to confirm before applying with dryRun: false. Use the temp cache at grade-cloning/temp/gb_sync_{gradebookNum}.json to skip re-extraction if fresh (<24h). Phases 5, 6, 7 will only process the resolved target assignment. Student file status will be set to partial-verified (not verified)."
)
```

Replace `{TARGET_ASSIGNMENT}` with the user's input (name or number).

**After Stage 3 completes — verify before reporting done:**

### 4a. Halt Detection
1. Read main cache `temp/gb_sync_{gradebookNum}.json`
2. Check if `pipelineHalted === true`
3. If halt detected:
   - Print `⛔ PIPELINE HALTED: Grade transfer had errors` header
   - Print `haltReason`, list `haltStudents` and `haltAssignments`
   - Do NOT print "pipeline complete" or any success messaging

### 4b. Comprehensive Student File Status Check
1. Run: `ls C:\Users\shuff\grade-cloning\temp\students\{gradebookNum}\`
2. Read EVERY student file in `temp/students/{gradebookNum}/`
3. Count statuses: `verified`, `verify-failed`, `error`, `filled`, `pending`
4. If ANY file has status other than `verified`:
   - Report those student names with their status
5. Only declare success if ALL student files show `verified`

### 4c. Single-Assignment Mode Status

If Stage 3 ran in single-assignment mode, student files will show `partial-verified`
instead of `verified`. This is expected — only one assignment was checked.

1. Report: "Single-assignment sync complete — student files set to partial-verified"
2. Do NOT declare full pipeline success
3. Tell the user: "Run a full sync to verify all assignments and set status to verified"

After Stage 3 completes with 0 mismatches and all student files verified (or partial-verified in single-assignment mode), confirm to the user that the pipeline stage is done.

---

## Safety Rules

> **⚠️ Stage 1 is READ-ONLY** — no Aeries changes until Stage 2.

> **⚠️ MOM is source of truth** — Stage 3 overwrites all Aeries scores to match MOM exactly. Always dry-run first.

> **⚠️ Always confirm with user between stages** — never auto-advance.

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| Stage 1 temp file not found | gb-compare didn't complete — check output and re-run Stage 1 |
| Stage 2 reads empty missing list | Stage 1 temp file may be stale — re-run Stage 1 |
| Stage 3 timed out mid-run | gb_sync cache has progress — re-run Stage 3 sub-agent, resumes automatically |
| 0 missing found | Verify same course in both tabs; may have been added manually |
| Stage 2 partial failure | Re-run Stage 2 — gb-new-assignment is idempotent, skips existing assignments |
| pipelineHalt detected | Phase 7 found mismatches. Read haltStudents/haltAssignments from main cache. Fix manually or re-run Phase 6 for affected students. |
| result.status: verify-failed | Phase 7 detected mismatch for this student. Check verificationErrors in the student file. Re-enter scores and re-run Phase 7. |
