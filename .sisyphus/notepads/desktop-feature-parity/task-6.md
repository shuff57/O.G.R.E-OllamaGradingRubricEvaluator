# Task 6: Wire Batch Grading to POST /api/grade SSE

## Files Created/Modified
- **NEW** `ogre-desktop/src/lib/sse-parser.ts` — SSE stream parser with typed batch events
- **EDIT** `ogre-desktop/src/lib/grading-api.ts` — Added `startBatchGrading()`, re-exports SSE types
- **EDIT** `ogre-desktop/src/lib/batch-grader.ts` — Added `studentsToGrade` getter
- **EDIT** `ogre-desktop/src/components/grading/BatchPanel.svelte` — Rewired to SSE streaming
- **EDIT** `ogre-desktop/src/pages/GradingPanel.svelte` — Pass props, disable mode tabs during batch

## Architecture Decisions

### SSE Parser Separation
Created `sse-parser.ts` separate from grading-api.ts's existing SSE parser because:
- `/api/chat` (solver) and `/api/grade` (batch) emit different event types
- Batch SSE has 6 event types: progress, chunk, sweep, outlier, done, error
- Keeping them separate avoids a god-parser and keeps types clean

### Cancellation Token Pattern (not AbortController)
Used a `CancellationToken { cancelled: boolean }` instead of `AbortController.signal` because:
- Tauri's HTTP plugin `@tauri-apps/plugin-http` may not support AbortSignal on fetch
- A simple boolean flag checked in the stream reader loop is more reliable
- `startBatchGrading()` wraps callbacks with cancellation guards for extra safety

### Pause = Buffer, Stop = Cancel
- **Pause**: Server keeps streaming, client buffers incoming results without filling grades
- **Resume**: Flushes buffered results into the page
- **Stop**: Cancels the SSE token, stops filling, discards buffer
- Server-side AI calls continue but results are silently dropped after cancel

### applyGrade() Usage
BatchPanel calls `batchGrader.applyGrade(studentIndex, score, feedback)` for each SSE result.
This fills the grade on the page AND tracks progress internally. The `studentsToGrade` getter
was added to BatchGrader for looking up student names by index.

## Key Patterns
- `startBatchGrading()` is fire-and-forget (returns handle, uses callbacks)
- GradingPanel binds `isBatchRunning` to disable mode tabs (prevents concurrent grading)
- Phase message shows server progress (chunk N/M, consistency sweep, outlier review)
- Current student name shows which grade is being filled on the page

## Tests
- 94 tests pass (4 test files)
- No new test file created — sse-parser.ts is pure logic that could have unit tests added later
- Existing grading-api.test.ts tests continue to pass unchanged

## Gotchas
- The server's `/api/grade` SSE events use `studentIndex` matching the page DOM index
- BatchGrader's `applyGrade()` advances `_currentIndex` sequentially — works because
  server returns results in the same order students were sent
- Outlier adjustments re-fill grades for students already filled (overwrites)
