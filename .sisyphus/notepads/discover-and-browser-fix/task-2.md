# Task 2: Consolidate Webview Bounds Management

## What Changed
- **Browser.svelte**: Now the single authority for webview bounds management
  - Status listener: `hideWebview()` replaced with `tick() -> updateWebviewBounds() -> showWebview()` (bounds set BEFORE show to avoid flash at x=0,y=60)
  - Added `handleResize()` with 100ms debounce for window resize
  - Added `handleSidebarChanged()` with RAF loop (300ms duration) for smooth sidebar animations
  - Both listeners registered in onMount, cleaned up in onDestroy

- **App.svelte**: Simplified to event dispatcher only
  - Removed: `recalculateWebviewBounds()`, `handleWindowResize()`, `animateWebviewBounds()`
  - Removed: `URL_BAR_HEIGHT`, `RESIZE_DEBOUNCE_MS`, `resizeTimeout`
  - Kept: `SIDEBAR_EXPANDED_WIDTH`, `SIDEBAR_COLLAPSED_WIDTH`, `SIDEBAR_TRANSITION_MS` (unused but retained per plan)
  - navigate/toggleSidebar now dispatch `ogre:sidebar-changed` CustomEvent
  - Reactive block dispatches event instead of calling recalculateWebviewBounds

## Key Patterns
- Custom DOM events (`ogre:sidebar-changed`) bridge App.svelte -> Browser.svelte communication
- RAF animation loop in handleSidebarChanged queries DOM each frame for accurate sidebar width during CSS transition
- Browser.svelte's `updateWebviewBounds()` is the ONLY function that calls `setWebviewBounds()` now (single source of truth)

## Show/Hide Call Sites (verified)
| # | File | Line | Action | Status |
|---|------|------|--------|--------|
| 1 | App.svelte | 44 | hide (modal) | KEPT |
| 2 | App.svelte | 46 | show (modal close) | KEPT |
| 3 | App.svelte | 125 | show (navigate) | KEPT |
| 4 | App.svelte | 130 | hide (leave browser) | KEPT |
| 5 | Browser.svelte | 169 | show (creation) | CHANGED hide->show |
| 6 | GradingPanel.svelte | 80 | hide (screenshot) | KEPT |
| 7 | GradingPanel.svelte | 98 | show (screenshot done) | KEPT |

## Verification
- Build: PASS
- Tests: 333 passed, 26 todo (all 10 test files pass)
