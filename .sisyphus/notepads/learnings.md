# Learnings

## Floating Drawer Button Implementation
- Created `FloatingDrawerButton.svelte` as a standalone component for the browser overlay toggle.
- Used fixed positioning (`bottom: 20px`, `right: 20px`, `z-index: 10`) to overlay the webview.
- Integrated into `Browser.svelte` inside the `browser-content` container.
- Button uses `favicon.png` for branding and matches the app's dark theme.
- Toggles the existing `showGradingPanel` state in `Browser.svelte`.
