# Draft: Auto Page Refresh — Desktop Extension

## Requirements (confirmed)
- Extension should update its state when user navigates to a different page
- "Without closing and reopening" = automatic detection + refresh

## Technical Understanding

### Architecture Summary
- **Desktop App**: Tauri + Svelte, embedded webview (Browser.svelte + GradingPanel.svelte)
  - `browser.ts` has `listenBrowserUrlChanged()` and `listenBrowserPageLoaded()` events from Rust
  - `Browser.svelte` listens to these events — updates URL bar, tries autofill
  - `GradingPanel.svelte` does NOT listen to page changes at all
  - Batch mode's `checkBatchPageStatus()` only runs when switching to batch mode
  
- **Chrome Extension**: MV3 side panel (sidepanel.js + background.js)
  - No `tabs.onUpdated` listener anywhere
  - All DOM access is one-shot via `chrome.scripting.executeScript` on button click
  - No automatic page change detection

### Identified Gap
Neither platform detects navigation events to re-extract:
- Site profile (batch compatibility check)
- Student info / DOM content
- Rubric (auto-extraction)
- Page compatibility status

## Research Findings
- Desktop already has Tauri events: `browser-url-changed`, `browser-page-loaded`
- Chrome has `chrome.tabs.onUpdated` and `chrome.webNavigation.onCompleted` APIs
- Desktop has `evalScript()` for webview JS evaluation
- Both platforms have site profile matching logic

## Open Questions
- [ ] Scope: Desktop only or also Chrome extension?
- [ ] What specifically should refresh? (batch status, rubric, student list?)
- [ ] Should state reset or merge when navigating?
- [ ] Any pages where auto-refresh should NOT happen?

## Scope Boundaries
- INCLUDE: TBD
- EXCLUDE: TBD
