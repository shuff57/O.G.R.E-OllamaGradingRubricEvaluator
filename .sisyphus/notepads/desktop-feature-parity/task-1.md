# Task 1: POST /api/chat Endpoint

## Patterns Discovered
- `callProviderDirect(providerName, config, messages, timestamp)` - config is `{ apiUrl, apiKey, model }` from `resolveProviderConfig()`
- `resolveProviderConfig(providerId, model)` returns `{ apiUrl, apiKey, model }` with default URLs per provider
- Server.js imports from grading.js for prompt builders/parsers; providers.js for request/response adapters
- Auth middleware on `/api/*` validates Bearer token against `handshakeToken` (skips `/api/handshake`)
- Active provider: `providerConfigs.find(p => p.is_active)` gives the currently selected provider
- Tests use vitest with `describe`/`it`/`expect`, imported from `vitest`

## Implementation Decisions
- **Mode detection**: `rubric` present → grader mode (JSON), no rubric → solver mode (SSE)
- **Grader mode**: Built `buildSingleGradePrompt()` in grading.js (follows `buildBatchPrompt` patterns but for single student)
- **Solver mode**: Uses `streamSSE` from hono/streaming (same as /api/grade); sends status → message → done events
- **Helper functions** placed in grading.js (not server.js) for testability (server.js has `serve()` side effects on import)
- **parseSingleGradeResponse()** handles same edge cases as batch parser: code fences, thinking blocks, LaTeX backslashes, regex fallback

## Files Changed
- `grading-server/grading.js` — Added `buildSingleGradePrompt()`, `parseSingleGradeResponse()`, `clampSingleResult()` (3 new functions)
- `grading-server/server.js` — Added 2 imports, added POST /api/chat endpoint (~95 lines)
- `grading-server/test/chat.test.js` — New test file with 28 tests covering both functions

## Test Results
- 101 tests pass across 3 test files (0 failures)
- All existing tests unaffected
- New tests: 13 for buildSingleGradePrompt, 15 for parseSingleGradeResponse

## Gotchas
- Can't import server.js in tests (starts the server as side effect) — test helpers via grading.js instead
- LSP errors in ogre-desktop Svelte files are pre-existing, unrelated to this task
- `providerConfigs` is module-level mutable state — chat endpoint reads it just like /api/grade does
