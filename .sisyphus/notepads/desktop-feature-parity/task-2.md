# Task 2: GradingPanel Decomposition

## Completed: 2026-02-17

## What Was Done
Decomposed the 874-line GradingPanel.svelte monolith into 5 child components + orchestrator.

### File Inventory
| File | Lines | Purpose |
|------|-------|---------|
| `GradingPanel.svelte` (orchestrator) | 173 | Layout shell: header, mode tabs, content routing |
| `ProviderSelector.svelte` | 99 | Compact inline provider + model dropdowns (placeholder) |
| `RubricCard.svelte` | 93 | Rubric dropdown with manage button |
| `StudentWorkCard.svelte` | 307 | Student textarea, MathField, highlight extraction, AI feedback, Run Assessment |
| `SolverChat.svelte` | 90 | Multi-turn chat UI placeholder |
| `BatchPanel.svelte` | 316 | Batch grading loop, progress, pause/stop controls, config checkboxes |
| **Total** | **1078** | Slightly more total lines due to duplicated scoped styles per component |

### Architecture Decisions
- **State ownership**: Each child component owns its own state (studentWork, batchGrader, etc.)
- **Orchestrator keeps**: activeMode, isCollapsed, width, showScreenshotOverlay
- **Keyboard shortcuts split**: Ctrl+B/Esc in orchestrator, Ctrl+Enter in StudentWorkCard
- **ScreenshotOverlay**: Stays in orchestrator (full-screen overlay), triggered via `onScreenshot` callback prop
- **BatchGrader cleanup**: Moved to BatchPanel's onDestroy (previously in GradingPanel)
- **ProviderSelector**: New component (placeholder) since no provider selection existed. Uses $bindable props ready for wiring.

### Svelte 5 Patterns Used
- `$state()` for reactive state
- `$bindable()` for two-way bound props (isCollapsed, width, provider, model, selectedRubric)
- `$derived()` for computed values (BatchPanel.progressPercent)
- `$props()` with TypeScript `interface Props` for type-safe component APIs
- Callback props (`onScreenshot`, `onRubricChange`, etc.) instead of Svelte 4 event dispatchers
- `$effect()` already used in MathField (not needed in new components)

### Verification
- `npx vitest run`: 60/60 tests pass
- `npx vite build`: Clean build (all warnings pre-existing in other files)
- No new TypeScript errors introduced

### Gotchas
- `extractSelectedText` import shows LSP error in both old and new files — pre-existing issue, not introduced by this change
- `listenBrowserStatus` error in Browser.svelte is also pre-existing
- Global styles (`btn-primary`, `btn-secondary`, `text-muted`, `card`) are in `app.css` — child components rely on these
- CSS must be duplicated per component due to Svelte's scoped styles. Shared patterns (h3, textarea, select) duplicated where needed.

### Dependencies for Downstream Tasks
- Tasks 3-8 can now target individual child components instead of the monolith
- `StudentWorkCard.svelte` is the primary target for AI provider integration
- `BatchPanel.svelte` is self-contained with BatchGrader logic
- `ProviderSelector.svelte` needs wiring to actual provider config in Wave 2
