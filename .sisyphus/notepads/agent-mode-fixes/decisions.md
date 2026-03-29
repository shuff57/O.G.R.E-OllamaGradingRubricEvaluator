# Decisions — agent-mode-fixes

## [2026-03-28] Session Start

### Navigate Wait (Bug #1)
- Use `Page.loadEventFired` (not `domContentLoaded`) — more reliable for dynamic pages
- Default 10s timeout — resolve with `{ success: true, warning: '...' }` on timeout (never throw)
- `Page.navigate` returning `{ errorText }` → return failure immediately, skip waiting
- Must call `Page.enable` before listening for events
- One-shot listener pattern — clean up on both success AND timeout paths

### Below-Fold Visibility (Bug #2)
- Remove ONLY: `rect.top > viewHeight` and `rect.bottom < 0` checks
- KEEP: `display:none`, `visibility:hidden`, zero dimensions, `opacity:0`
- Add `inViewport: boolean` to `InteractiveElement` type
- `formatDomForPrompt` shows `[offscreen]` indicator for elements outside viewport

### AX Tree Merge (Bug #3)
- Always show interactive DOM first with CSS selectors
- When AX node count > 20: APPEND AX tree as supplementary section
- If combined exceeds ~8000 tokens: truncate AX tree, not DOM
- Empty/null AX tree → don't append, no crash

### No-Reorder Rule
- `getSelector()` priority levels MUST NOT be reordered (Bug #4 is escaping fix only)
