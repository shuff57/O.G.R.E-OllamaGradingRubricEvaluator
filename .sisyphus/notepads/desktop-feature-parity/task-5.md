# Task 5: Wire Solver Chat to POST /api/chat with SSE

## What was done
- Created `ogre-desktop/src/lib/grading-api.ts` — API client for solver chat
- Updated `ogre-desktop/src/components/grading/SolverChat.svelte` — full chat UI
- Created `ogre-desktop/src/lib/grading-api.test.ts` — 13 tests covering SSE parsing + API calls

## Key decisions

### SSE parsing approach
- Used manual `fetch()` + `ReadableStream` instead of `EventSource` because EventSource doesn't support custom Authorization headers (Bearer token auth)
- Implemented dual path: ReadableStream for true streaming, `.text()` fallback for buffered response
- Exported `parseSSEEvents()` as a pure function for easy unit testing

### Multi-turn conversation
- Server's `/api/chat` solver mode only accepts a single `message` string (not a messages array)
- Solved by building contextual prompts client-side: conversation history formatted as a transcript and prepended to each new user message
- First user message sent directly without context prefix

### Pattern matching
- Followed `rubric-api.ts` pattern exactly: `tauriFetch`, `getHandshakeToken()`, `authHeaders()`
- Same `SERVER_BASE = "http://localhost:3456"` constant
- Same error handling style

## Patterns discovered
- Existing test files use `vi.hoisted()` for mock setup — followed same pattern
- Vitest config excludes `*.integration.test.ts` files
- Pre-existing LSP errors in Browser.svelte and StudentWorkCard.svelte (missing exports) — not related to this task

## SSE event flow (server → client)
```
POST /api/chat { message: "...", /* no rubric */ }
→ SSE event: status  { status: "thinking", provider, model }
→ SSE event: message { content: "full AI response" }
→ SSE event: done    { provider, model }
(or)
→ SSE event: error   { message: "error description" }
```

## Test results
- All 73 tests pass (30 autofill + 20 browser + 10 db + 13 grading-api)
- LSP diagnostics clean on all changed files
