# Task 4: Wire Grader mode to real AI via POST /api/chat

## What was done
- Added `gradeStudent()` function to `grading-api.ts` alongside existing solver SSE code
- Added `GradeRubric`, `GradeRequest`, `GradeResponse` types
- Updated `StudentWorkCard.svelte` to call real API instead of simulated response
- Updated `GradingPanel.svelte` to bind provider/model from ProviderSelector and pass to StudentWorkCard
- Added inline error display with dismissible error banner
- Added loading spinner state (spinner-md) during API calls
- Response formatted as markdown (score + feedback + provider info) and displayed via ResponseRenderer

## Key Patterns & Decisions

### API Request Mapping
- `/api/chat` `message` field = additional grading instructions (not student work)
- `/api/chat` `rubric` field presence triggers grader mode (JSON response) vs solver mode (SSE)
- `studentWork` is a separate field
- Server auto-selects active provider/model if not specified in request

### Auth Pattern
- Reuses `authHeaders()` pattern from `rubric-api.ts`
- Uses `getHandshakeToken()` from `provider-sync.ts`
- Bearer token auth on all `/api/*` endpoints (except handshake)

### Component Architecture
- `GradingPanel` binds `activeProvider`/`activeModel` from `ProviderSelector` ($bindable props)
- Passes provider/model down to `StudentWorkCard` as optional props
- `StudentWorkCard` sends them to `gradeStudent()` which passes to server
- If empty strings, they're treated as undefined → server auto-selects

### Error Handling
- Empty student work → inline validation error, 4s auto-dismiss
- API failure → error banner in AI Feedback section, 8s auto-dismiss, dismissible via X button
- Uses `color-mix` CSS for error banner background (12% error color blend)

### Loading State
- `isStreaming` renamed to `isLoading` (more accurate for non-streaming grader mode)
- Button shows "Grading..." with spinner
- AI response area shows centered spinner + "Analyzing student work..." text
- Button disabled during loading, Ctrl+Enter shortcut also blocked

## What's NOT wired yet
- RubricCard doesn't pass real rubric data yet (uses placeholder `{ maxScore: '10' }`)
- ProviderSelector model dropdown is empty (no model list fetch yet)
- No streaming for grader mode (server returns full JSON, not SSE)

## Files Changed
1. `ogre-desktop/src/lib/grading-api.ts` — Added gradeStudent() + types
2. `ogre-desktop/src/components/grading/StudentWorkCard.svelte` — Replaced simulation with real API call
3. `ogre-desktop/src/pages/GradingPanel.svelte` — Added state binding, passes props

## Test Results
- All 73 tests pass (4 test files)
- svelte-check: 0 errors (9 pre-existing warnings in other files)
