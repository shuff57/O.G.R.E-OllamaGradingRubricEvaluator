# GradingPanel Component Decisions

- **Framework**: Used Svelte 5 syntax with runes (`$state`, `$props`, `$bindable`) as requested for Wave 2.
- **Location**: `src/pages/GradingPanel.svelte` as per direct instruction, although it's logically a sub-component of `Browser`.
- **Layout**: Implemented as a collapsible sidebar on the right side.
- **Modes**: "Grader", "Solver", "Batch" modes implemented as tabs, switching content areas.
- **Styling**: Leveraged existing CSS variables from `src/app.css` (`--color-bg-sidebar`, `--color-border`, etc.) to match the application theme (dark/light mode compatible).
- **State Management**: Using local component state for now. Width and collapsed state are bindable props to allow parent control/coordination (e.g., resizing the webview in `Browser.svelte`).
