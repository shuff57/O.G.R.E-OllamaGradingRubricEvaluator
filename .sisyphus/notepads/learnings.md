# Learnings

## Floating Drawer Button Implementation
- Created `FloatingDrawerButton.svelte` as a standalone component for the browser overlay toggle.
- Used fixed positioning (`bottom: 20px`, `right: 20px`, `z-index: 10`) to overlay the webview.
- Integrated into `Browser.svelte` inside the `browser-content` container.
- Button uses `favicon.png` for branding and matches the app's dark theme.
- Toggles the existing `showGradingPanel` state in `Browser.svelte`.

## Discovery Heuristic Feedback Inference
- In `heuristicToDiscoveryResult`, infer feedback mode from `candidateSelectors.feedbackBox` content (`contenteditable`, `fbbox`, `mce`) instead of using `unknown` defaults.
- Use `candidateSelectors.feedbackHidden` as the primary signal for `requiresHiddenSync`.
- Keep extraction-config behavior explicitly default-on with `const includeExtractionConfig = options.includeExtractionConfig ?? true;` so passing `false` still disables the second pass.
- Regression coverage belongs in `discover.integration.test.ts` for both textarea heuristics and TinyMCE-style heuristic selectors.
