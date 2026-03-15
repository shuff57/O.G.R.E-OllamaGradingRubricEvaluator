---
name: gb-pipeline
description: Use when syncing MyOpenMath assignments and scores into Aeries end-to-end, especially when assignments may be missing, scores may be unsynced, or the user wants one orchestrated compare → create → sync workflow with approval checkpoints between stages.
---

# Gradebook Pipeline

> Orchestrate the full MOM → Aeries gradebook pipeline by delegating Stage 1 to `gb-compare`, Stage 2 to `gb-new-assignment`, and Stage 3 to `gb-sync`. This skill exists for the full workflow only: it preserves the temp-file handoff, verifies every stage result, and stops for explicit user approval before any later stage continues.

## Prerequisites
- Playwriter connected and enabled on the relevant browser tabs
- MyOpenMath gradebook tab open in teacher view
- Aeries gradebook tab open with write access
- Access to the temp workspace used by the gradebook tools (`grade-cloning/temp/`)
- Permission to stop between stages and wait for user confirmation

## When to Use
- User asks to sync MyOpenMath assignments and scores into Aeries end-to-end
- User needs both missing assignments created and scores transferred
- User wants one orchestrated workflow instead of manually running `gb-compare`, `gb-new-assignment`, and `gb-sync`
- User wants to sync just one assignment, but still needs the full compare → confirm → sync safety flow

## When NOT to Use
- Only comparison is needed — use `load_skills=["gb-compare"]`
- Only missing assignments need to be created — use `load_skills=["gb-new-assignment"]`
- Only score sync is needed after assignments already exist — use `load_skills=["gb-sync"]`
- The user wants silent automation without stage-by-stage approval

## Guardrails

> ⚠️ **Must NOT:**
> - Never skip the approval gate between Stage 1 → Stage 2 or Stage 2 → Stage 3.
> - Never auto-advance after any stage, even if the result looks clean.
> - Never bypass a halted stage. If auth fails, extraction fails, verification fails, or `pipelineHalted === true`, stop the pipeline and report the halt.
> - Never treat Stage 1 as writable. Stage 1 is read-only comparison only.
> - Never hardcode skill file paths; invoke downstream skills only by name via `load_skills=["gb-compare"]`, `load_skills=["gb-new-assignment"]`, and `load_skills=["gb-sync"]`.
> - Never lose the temp-file chain. Stage 2 must read Stage 1's compare JSON, and Stage 3 must continue from the same gradebook-specific temp data.
> - Never declare full success for single-assignment mode. Report it as partial verification only.
> - Never overwrite the source-of-truth rule. MOM remains the source of truth for score sync, and Stage 3 must begin with a dry run.

## Quick Start
1. Run Stage 1 with `load_skills=["gb-compare"]`, then read the compare JSON and show the missing-assignment summary.
2. If the user approves, run Stage 2 with `load_skills=["gb-new-assignment"]`, reading the Stage 1 JSON.
3. If the user approves again, run Stage 3 with `load_skills=["gb-sync"]`, starting with a dry run and verifying halt/status files before reporting completion.

## Workflow

### Phase 1: Stage 1 Compare
- **INPUT:** Open MOM and Aeries gradebook tabs
- **ACTION:** Spawn Stage 1 with the compare skill.

```python
task(
  category="unspecified-high",
  load_skills=["gb-compare"],
  run_in_background=False,
  description="Stage 1: Compare MOM vs Aeries assignments",
  prompt="Run gb-compare. Both tabs are already open: MyOpenMath gradebook and Aeries gradebook. Compare all assignments, expand all MOM categories, collect assigned/due dates, generate the markdown comparison report, and write the structured temp file at grade-cloning/temp/gb_compare_{gradebookNum}.json where gradebookNum is extracted from the Aeries URL."
)
```

- **OUTPUT:** Stage 1 writes `grade-cloning/temp/gb_compare_{gradebookNum}.json` and the comparison report.

### Phase 2: Review Stage 1 Output and Get Approval
- **INPUT:** `grade-cloning/temp/gb_compare_{gradebookNum}.json`
- **ACTION:**
  - Read the compare JSON and extract at minimum `gradebookNum`, `missing`, and `matched`.
  - Summarize total MOM assignments, total Aeries assignments, and missing count.
  - Show the missing assignments table with name, category, points, assigned date, and due date.
  - Ask the user whether to continue.
  - If `missing.length === 0`, ask whether to skip Stage 2 and continue directly to Stage 3.
  - If the user declines, stop the pipeline cleanly.
- **OUTPUT:** Explicit user decision to stop, skip Stage 2, or proceed to Stage 2.

### Phase 3: Stage 2 Add Missing Assignments
- **INPUT:** Approved Stage 1 output and real `gradebookNum`
- **ACTION:** Spawn Stage 2 with the new-assignment skill, passing the actual compare JSON path from Stage 1.

```python
task(
  category="unspecified-high",
  load_skills=["gb-new-assignment"],
  run_in_background=False,
  description="Stage 2: Add missing assignments to Aeries",
  prompt="Run gb-new-assignment. The Aeries gradebook tab is already open. Read the Stage 1 temp file at grade-cloning/temp/gb_compare_{gradebookNum}.json to get the missing assignments list. Add all missing assignments to Aeries, verify the results, and write the completion temp file at grade-cloning/temp/gb_new_assignment_{gradebookNum}.json."
)
```

- **OUTPUT:** Stage 2 writes `grade-cloning/temp/gb_new_assignment_{gradebookNum}.json`.

### Phase 4: Review Stage 2 Output and Get Approval
- **INPUT:** `grade-cloning/temp/gb_new_assignment_{gradebookNum}.json`
- **ACTION:**
  - Read the Stage 2 temp file.
  - Show created count, skipped count, and any failures.
  - Ask: `Added {N} assignment(s). Proceed to Stage 3 to sync scores?`
  - If the user declines, stop the pipeline cleanly.
- **OUTPUT:** Explicit user approval to begin score sync, or a clean stop after Stage 2.

### Phase 5: Stage 3 Sync Scores
- **INPUT:** Approved pipeline scope, `gradebookNum`, Stage 1 compare JSON, and optionally a target assignment
- **ACTION:**
  - Always preserve the temp-file chain:
    - Read Stage 1 scope from `grade-cloning/temp/gb_compare_{gradebookNum}.json`
    - Reuse sync cache at `grade-cloning/temp/gb_sync_{gradebookNum}.json`
    - Allow per-student progress files under `grade-cloning/temp/students/{gradebookNum}/`
  - Start with a dry run before any writeback.
  - Use the standard Stage 3 prompt for full sync when no single target is requested.

```python
task(
  category="unspecified-high",
  load_skills=["gb-sync"],
  run_in_background=False,
  description="Stage 3: Sync MOM scores to Aeries",
  prompt="Run gb-sync Phases 1-7. Both tabs are already open: MyOpenMath gradebook and Aeries gradebook. Read grade-cloning/temp/gb_compare_{gradebookNum}.json for the pipeline scope, then use the temp cache at grade-cloning/temp/gb_sync_{gradebookNum}.json to reuse fresh extraction work when possible. Always start with dryRun: true, show the dry-run output to the user, and wait for confirmation before applying with dryRun: false. Phase 4.6 writes per-student JSON files in grade-cloning/temp/students/{gradebookNum}/. Resume from syncProgress.completedStudents if interrupted. Final acceptance criterion: 0 mismatches and 0 missing after verification."
)
```

- **OUTPUT:** Stage 3 writes or updates `grade-cloning/temp/gb_sync_{gradebookNum}.json` plus per-student status files.

### Phase 6: Stage 3 Single-Assignment Variant
- **INPUT:** User requested a single assignment by name or number
- **ACTION:** Replace the standard Stage 3 prompt with the single-assignment variant.

```python
task(
  category="unspecified-high",
  load_skills=["gb-sync"],
  run_in_background=False,
  description="Stage 3: Sync single assignment scores to Aeries",
  prompt="Run gb-sync Phases 1-7 in SINGLE-ASSIGNMENT MODE. Target assignment: {TARGET_ASSIGNMENT}. Both tabs are already open. Read grade-cloning/temp/gb_compare_{gradebookNum}.json for the pipeline scope, set targetAssignment = \"{TARGET_ASSIGNMENT}\" during target resolution, and use grade-cloning/temp/gb_sync_{gradebookNum}.json for cache/progress. Always start with dryRun: true, show the dry-run output to the user, and wait for confirmation before applying with dryRun: false. Only process the resolved target assignment in Phases 5-7. Student files may end in partial-verified rather than verified."
)
```

- **OUTPUT:** A single-assignment sync run that still respects dry-run confirmation and partial-verification reporting.

### Phase 7: Verify Stage 3 Result Before Reporting Completion
- **INPUT:** `grade-cloning/temp/gb_sync_{gradebookNum}.json` and `grade-cloning/temp/students/{gradebookNum}/*.json`
- **ACTION:**
  - Read the main sync cache and check `pipelineHalted`.
  - If `pipelineHalted === true`, report `haltReason`, `haltStudents`, and `haltAssignments`, then stop without any success message.
  - Read every student temp file and count statuses.
  - Full-sync success requires all student files to be `verified`.
  - Single-assignment success is reported separately when student files are `partial-verified`; do not call this full pipeline success.
  - If any file shows `verify-failed`, `error`, `filled`, or `pending`, list those students and stop for review.
- **OUTPUT:** One of three terminal states:
  - halted pipeline with exact failure details
  - partial single-assignment completion
  - verified full pipeline completion

## State Management

### Temp File Chain

| File | Written by | Read by | Purpose |
|------|------------|---------|---------|
| `grade-cloning/temp/gb_compare_{gradebookNum}.json` | Stage 1 (`gb-compare`) | Orchestrator, Stage 2, Stage 3 | Canonical compare result and pipeline scope |
| `grade-cloning/temp/gb_new_assignment_{gradebookNum}.json` | Stage 2 (`gb-new-assignment`) | Orchestrator | Assignment-creation completion record |
| `grade-cloning/temp/gb_sync_{gradebookNum}.json` | Stage 3 (`gb-sync`) | Orchestrator, Stage 3 reruns | Sync cache, progress, halt state |
| `grade-cloning/temp/students/{gradebookNum}/*.json` | Stage 3 verification phases | Orchestrator, Stage 3 reruns | Per-student verification status |

### Resume Rules
- Extract `gradebookNum` from the Aeries URL and reuse it consistently across all stages.
- Treat `gb_compare_{gradebookNum}.json` as the source file for downstream pipeline scope.
- If Stage 3 times out or is interrupted, rerun Stage 3 against the same `gb_sync_{gradebookNum}.json` so it can resume from saved progress.

## Error Handling

| Problem | Action |
|---------|--------|
| Stage 1 temp file missing | Stop. Report that `gb-compare` did not finish correctly and rerun Stage 1. |
| Stage 2 reads an empty or stale missing list | Stop and rerun Stage 1 so Stage 2 gets a fresh compare JSON. |
| Stage 2 reports partial failures | Show the failed assignments, stop, and let the user decide whether to rerun Stage 2. |
| Stage 3 times out mid-run | Rerun Stage 3 against the same `gb_sync_{gradebookNum}.json`; resume from saved progress instead of starting over. |
| `pipelineHalted === true` in Stage 3 cache | Stop immediately, print halt details, and do not report completion. |
| Student files contain `verify-failed`, `error`, `filled`, or `pending` | Treat the pipeline as incomplete, list the affected students, and stop for review. |
| Single-assignment mode ends with `partial-verified` files | Report partial completion only and tell the user to run a full sync for complete verification. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running this skill when only one stage is needed | Invoke the specific downstream skill directly instead of the pipeline orchestrator. |
| Advancing to the next stage without user confirmation | Stop after each stage, summarize results, and ask the user whether to continue. |
| Hardcoding downstream skill file paths | Use `load_skills=["gb-compare"]`, `load_skills=["gb-new-assignment"]`, and `load_skills=["gb-sync"]` only. |
| Treating single-assignment sync as full verification | Report `partial-verified` as partial completion and recommend a later full sync. |
| Declaring success from the main Stage 3 cache alone | Also read every per-student file and require `verified` for full-sync success. |
| Ignoring the Stage 1 compare JSON during later stages | Preserve the temp-file chain and pass the compare JSON forward as the canonical pipeline scope. |
