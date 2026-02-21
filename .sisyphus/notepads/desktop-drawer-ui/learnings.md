# Learnings

## Svelte 5 Runes
- `GradingPanel.svelte` uses `$state` for local reactive state.
- Props are defined using `$props()` destructuring, e.g., `let { width = $bindable(400) } = $props();`.
- `$bindable` allows two-way binding.

## DOM Events in Svelte
- Event handlers like `onmousedown` are lowercase in Svelte 5 (or standard HTML attributes).
- Global listeners can be added to `window` or `document` in `handleResizeStart` and removed in `handleResizeEnd`.
