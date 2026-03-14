# Issues — prompt-optimization-v2

## [2026-03-13] Pre-existing LSP Errors (NOT introduced by our work)

### grading-server/grading.js
- Line 316:11 — "The assignment should not be in an expression."
- Line 331:11 — "The assignment should not be in an expression."
- **Status**: Pre-existing, unrelated to prompt text changes

### grading-server/server.js
- Lines 725, 729, 743, 945, 948, 962, 969, 982, 983, 989, 1060, 1081 — "unreachable code" errors
- **Status**: Pre-existing, not in scope for this plan

**IMPORTANT**: Do NOT count pre-existing errors as verification failures. Only flag NEW errors introduced by our changes.
