## Task 7: Credential Management UI

- Implemented "Site Credentials" section in `Settings.svelte`.
- Used `SiteCredential` interface and CRUD functions from `db.ts`.
- Added password masking with show/hide toggle.
- Added URL pattern presets using `GRADING_SITE_PRESETS` from `browser.ts`.
- Integrated with existing `db.ts` which was correctly updated in Task 4, even though LSP initially complained about missing exports.
- Verified build success with `npm run build`.

## Task 8: LMS Login Form Selectors + Auto-Fill Script

- Created `ogre-desktop/src/lib/autofill.ts` with LMS selector map and two exported functions.
- `LMS_LOGIN_SELECTORS` array covers MyOpenMath, Canvas, Blackboard, Moodle with CSS selectors for username/password fields.
- `generateAutoFillScript()` returns a self-contained IIFE string for webview injection:
  - Uses `HTMLInputElement.prototype.value` native setter to bypass React/Angular controlled input wrappers.
  - Dispatches both `input` and `change` events with `bubbles: true` for framework compatibility.
  - Retry mechanism: 3 attempts at 1s, 2s, 4s intervals (exponential backoff) for SPA dynamic form loading.
  - Does NOT auto-submit - user retains control.
  - Includes JS string escaping helper for safe credential embedding.
- `matchCredentialsToUrl()` does case-insensitive substring match of `url_pattern` against the page URL.
- Canvas `instructure.com` used as URL pattern (not `canvas.instructure.com`) for broader matching.
- Import is `type`-only for `SiteCredential` since it's only used for type checking.
- Build passes cleanly (warnings are all pre-existing a11y issues in other files).

## Task 5: Redesign Browser.svelte with URL Bar + Navigation Controls

- **UI Redesign**: Replaced the existing `Browser.svelte` with a new layout featuring a top navigation bar (URL input, Back, Forward, Reload buttons) and a main content area for the embedded webview. Added a collapsible "Quick Launch" section for presets and saved URLs.
- **State Management**: Used Svelte stores or local state for URL input, loading status, and presets visibility.
- **Backend Integration**: Updated `browser.ts` to include wrapper functions for new Rust commands: `createEmbeddedBrowser`, `navigateEmbedded`, `goBack`, `goForward`, `reloadBrowser`, `setWebviewBounds`, `hideWebview`, `showWebview`, `getEmbeddedUrl`, `destroyWebview`.
- **Event Handling**: Added listeners for `browser-url-changed` and `browser-page-loaded` to keep the UI in sync with the embedded browser state.
- **Verification**: Confirmed that `npm run build` succeeds, indicating that the TypeScript changes are valid and imports are correct.

## Task 6: Webview-Sidebar Coordination + Modal Z-Ordering

### Changes Made
- **App.svelte**: Added webview lifecycle management coordinated with sidebar and modal state

### Implementation Details

**Import**: `hideWebview`, `showWebview`, `setWebviewBounds` from `./lib/browser` (Task 5 already added these)

**Layout Constants** (lines 19-24):
- `SIDEBAR_EXPANDED_WIDTH = 250` / `SIDEBAR_COLLAPSED_WIDTH = 60` — match CSS vars in app.css
- `URL_BAR_HEIGHT = 50` — estimated height of Browser.svelte URL bar
- `SIDEBAR_TRANSITION_MS = 300` — matches `--sidebar-transition: 0.3s ease`
- `RESIZE_DEBOUNCE_MS = 100`

**Webview Bounds Calculation** (`recalculateWebviewBounds()`):
- Webview is a native OS overlay, positioned in logical pixels relative to window origin (NOT the DOM)
- x = sidebar width (collapsed: 60px, expanded: 250px)
- y = URL bar height (50px)
- width = window.innerWidth - sidebar width
- height = window.innerHeight - URL bar height
- Guards: early-return if not on browser page; skip if dimensions <= 0
- `.catch(() => {})` on all Tauri invokes since webview may not exist yet

**Navigate Function** (lines 143-157):
- When navigating TO browser: collapse sidebar, then show webview + recalculate bounds after `SIDEBAR_TRANSITION_MS` timeout
- When navigating AWAY: immediately hide webview (preserves session state), expand sidebar

**Toggle Sidebar** (lines 159-163):
- After toggling: schedule bounds recalculation after transition completes

**Modal Z-Ordering** (Svelte reactive `$:` block, lines 69-74):
- `showUpdateModal = true` → hideWebview (prevents native overlay covering modal)
- `showUpdateModal = false && currentPage === 'browser'` → showWebview + recalculate bounds
- Runs once on init (safe: both conditions false initially, no action taken)

**Window Resize Handler** (onMount/onDestroy):
- `handleWindowResize()` debounces at 100ms then calls `recalculateWebviewBounds()`
- Listener added in onMount, removed in onDestroy with timeout cleanup

### Key Design Decisions
1. **setTimeout over transitionend**: Used `setTimeout(fn, 300)` instead of `transitionend` event for sidebar transition completion. Simpler, more predictable, and doesn't require a DOM ref to the sidebar element.
2. **Silent error handling**: All Tauri invoke calls wrapped with `.catch(() => {})` because the webview may not exist until the user first opens the browser page (Task 9 creates it).
3. **Immediate hide, delayed show**: Hiding is immediate (no flicker of native overlay over wrong page), showing is delayed until sidebar finishes animating (correct positioning).

### Verification
- `npm run build` passes cleanly (3.27s, 141 modules)
- No new warnings introduced (all warnings are pre-existing a11y issues in Rubrics.svelte and SetupWizard.svelte)

### Dependencies
- Task 5 (browser.ts functions) was already completed — all 3 needed functions existed
- Task 3 (collapsible sidebar) was already completed — `sidebarCollapsed` state and CSS transitions in place
- Task 2 (Rust commands) provides the backend — `hide_webview`, `show_webview`, `set_webview_bounds`

## Task 11: Cleanup - Remove Old Browser Window Code

### What Was Done
- Removed 4 old browser window commands from `lib.rs`:
  - `open_browser_window()` - created separate window
  - `navigate_browser()` - navigated separate window
  - `get_browser_url()` - got URL from separate window
  - `close_browser()` - closed separate window
- Removed these 4 commands from `generate_handler![]` macro
- Removed old function exports from `browser.ts`:
  - `openBrowser()`
  - `navigateBrowser()`
  - `getBrowserUrl()`
  - `closeBrowser()`
  - `listenBrowserStatus()`
- Fixed unused import warning: removed `WebviewWindowBuilder` from imports

### Key Learnings
1. **Clean separation of concerns**: Old code was completely replaced by embedded browser implementation (Tasks 2, 9, 10)
2. **No dangling references**: Grep search found only node_modules reference (expected), confirming clean removal
3. **Build verification**: Both `cargo build` and `npm run build` passed with zero errors
4. **Import cleanup**: Removing unused imports prevents compiler warnings and keeps code clean

### Build Results
- **Cargo build**: ✓ Clean build, no warnings
- **npm run build**: ✓ Successful, 142 modules transformed
- **Commit**: ✓ 2 files changed, 21 insertions(+), 114 deletions(-)

### Dependencies Satisfied
- Task 9 (Integration wiring) completed ✓
- Task 10 (Auto-fill injection) completed ✓
- Ready for Task 12 (Tests)

