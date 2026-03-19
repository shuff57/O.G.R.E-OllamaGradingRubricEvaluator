# Learnings — details-element-support

## [2026-03-18] Session Start

### Key Conventions
- Test runner: `cd ogre-desktop && npx vitest run` (NOT `npm test`)
- Fixtures live in `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts`
- `InteractiveElement.type` is `string | undefined` — accepts 'collapsed'/'expanded' without interface change
- `formatDomForPrompt` already appends `[type]` to tag name when type != 'text' (line 170-172 of agent-dom.ts)
- INTERACTIVE_DOM_SCRIPT is ES5 — no arrow functions, no const/let, no template literals inside the string

### Architecture
- `agent-dom.ts` is the sole source of interactive element capture for the agent
- `browser-actions.ts` click dispatch works for any element — no changes needed
- `batch-grader.ts` handles `<details>` separately via raw DOM queries — DO NOT TOUCH
- `dom-snapshot-types.ts` is a separate priority classification system — DO NOT TOUCH

### Selector List Location
- `agent-dom.ts` lines 24-28: CSS selector array in INTERACTIVE_DOM_SCRIPT
- `agent-dom.ts` lines 109-123: element-building block where `type` is assigned (line 113)
