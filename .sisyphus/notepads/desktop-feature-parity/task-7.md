# Task 7: RubricCard Server Integration

## Findings

### Architecture
- RubricCard lives in `components/grading/RubricCard.svelte`, rendered inside GradingPanel → Browser page
- GradingPanel is NOT in App.svelte directly — it's inside Browser.svelte (side panel for browser page)
- Navigation is controlled by App.svelte's `navigate()` function, unreachable from deeply nested components

### Cross-Component Navigation Pattern
- Used `window.dispatchEvent(new CustomEvent('ogre:navigate', { detail: 'rubrics' }))` pattern
- App.svelte listens for `ogre:navigate` events and calls its internal `navigate()` function
- Cleaner than prop-drilling through 3 component layers (RubricCard → GradingPanel → Browser → App)
- Listener properly cleaned up in `onDestroy`

### Data Flow: SavedRubric → GradeRubric
- `SavedRubric` (rubric-api.ts): `{ id, name, criteria: [{criteria, description, points}], maxScore: number }`
- `GradeRubric` (grading-api.ts): `{ maxScore: string, checklistItems: [{category, points, items}] }`
- Conversion done in GradingPanel's `toGradeRubric()` function — keeps both types decoupled
- `maxScore` needs string conversion (number → string)

### V2 Scope (Not implemented)
- AI rubric import from screenshot — RubricCard stays text-mode only
- Rubric table editor — using criteria chip preview instead
- Inline criteria editing — users go to Rubrics page for full CRUD

### Test Status
- All 111 tests pass (4 test files)
- svelte-check: 0 errors, only pre-existing warnings in unrelated files
