# dark-mode-dropdowns — Learnings

## [2026-03-16] Session Start
- Pre-existing LSP errors in grading-server/server.js (unreachable code) and SetupWizard.svelte (Svelte 5 rune self-assignment pattern) — UNRELATED, pre-existing, do not fix.
- app.css uses :root for dark mode (default, no data-theme attribute) and [data-theme="light"] for light override.
- color-scheme property is absent from entire codebase.
- 6 components use native <select>: RubricCard, ExtractionConfigPanel, ProviderSelector, BatchProfileSelector, SetupWizard, ProviderSettings.

## [2026-03-16] Task 1 Complete — color-scheme & option styling

### Changes Made
1. **Edit 1**: Added `color-scheme: dark;` after `--theme-name: 'dark';` in `:root {}` block (line 8)
2. **Edit 2**: Added `color-scheme: light;` after `--theme-name: 'light';` in `[data-theme="light"] {}` block (line 103)
3. **Edit 3**: Added `option {}` rule after `input:focus, select:focus, textarea:focus` block with CSS variables:
   - `background-color: var(--color-bg-main);`
   - `color: var(--color-text-primary);`

### Verification
- ✅ `grep -n "color-scheme"` returns 2 lines (8 and 103)
- ✅ `grep -A 4 "^option {"` returns complete rule with both properties
- ✅ LSP diagnostics on app.css: clean (no errors)
- ✅ Evidence saved to `.sisyphus/evidence/task-1-*.txt`

### Key Insight
- Single `option {}` rule with CSS variables is sufficient — variables automatically resolve to theme colors when `color-scheme` changes
- No separate `[data-theme="light"] option {}` override needed because CSS variables update with theme
- This is a minimal, reversible change that fixes native select dropdown popups in dark mode

### Next Steps
- Task 1 complete. Ready for browser testing to verify dropdown appearance in both themes.
