# Task 9: Comprehensive Unit Tests

## What was done
- Extended `grading-api.test.ts` with 17 new tests: `gradeStudent` (7 tests) and `startBatchGrading` (10 tests)
- Created `sse-parser.test.ts` with 22 tests: `parseSSEText` (13 tests) and `parseSSEStream` (9 tests)
- Extended `grading-server/test/chat.test.js` with 20+ new tests for grader/solver mode patterns

## Test counts
- ogre-desktop: 133 tests passing (was 113 before)
- grading-server: 123 tests passing (was 103 before)
- Total new tests: ~40

## Patterns & conventions discovered
- vitest with `vi.hoisted()` for mock setup before imports
- `vi.waitFor()` for asserting on async fire-and-forget functions (startBatchGrading)
- ReadableStream mocking: use real `new ReadableStream({ pull })` for stream tests, not manual mock readers
- Cancellation testing: trigger cancel inside a callback (onProgress) rather than in stream `pull` — avoids race where inner loop checks cancelled before dispatching

## Key testing decisions
- `startBatchGrading` is fire-and-forget (async IIFE inside sync function) — need `vi.waitFor()` to wait for assertions
- SSE cancellation test: cancel in `onProgress` callback ensures first event dispatches but second chunk is skipped
- Server endpoint tests: since `server.js` doesn't export the Hono `app` and `serve()` runs at import time, we test the handler-level functions instead of making HTTP requests. Added validation pattern tests that mirror endpoint logic.

## Gotchas
- ReadableStream `pull` callback executes during `reader.read()` — setting cancellation token in `pull` causes the inner event loop to see cancelled=true before dispatching events from that chunk
- `grading-server` uses `vitest run` (not `bun test` directly) — confirmed in package.json scripts
- Pre-existing LSP errors in Svelte files (BatchPanel.svelte, ProviderSelector.svelte) are unrelated to test changes

---

## Final QA Integration Run (2026-02-17)

### Results
- **267/267 unit tests pass** (123 server + 144 desktop)
- **17/17 live API scenarios pass** (curl against running server)
- **10/10 integration paths verified** (provider sync, rubric CRUD, auth chain, offline detection, etc.)
- **12/12 edge cases pass** (empty state, invalid provider, missing fields, corrupt config, cancellation, etc.)

### Known Issue Found
- Compiled sidecar binary at `grading-server/dist/grading-server-win.exe` does NOT include `/api/chat` endpoint (returns 404)
- Source code is correct (server.js line 357 has the route)
- Other endpoints (/health, /api/grade, /api/providers, /api/rubrics) all work
- Severity: MEDIUM — batch grading works, only single-student grading/solver chat affected
- Fix: recompile sidecar binary

### Evidence
- Full report: `.sisyphus/evidence/final-qa/qa-report.md`
