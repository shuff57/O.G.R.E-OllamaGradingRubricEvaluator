# Browser Multi-Tab Support

## TL;DR

> **Quick Summary**: Add a tab bar to the Browser page so multiple sites (e.g. Aeries + MyOpenMath) can be open simultaneously with preserved page state (each tab is a separate webview — switching hides/shows, not reloads).
>
> **Deliverables**:
> - Rust: All browser commands generalized to accept `tab_id`, `WebviewState` becomes a `HashMap`
> - `browser.ts`: All functions accept `tabId` param
> - `Browser.svelte`: Tab bar UI + per-tab state management
>
> **Estimated Effort**: High (3-layer change: Rust → TS → Svelte)
> **Parallel Execution**: Sequential waves (each layer depends on the previous)
> **Critical Path**: Rust commands → browser.ts → Browser.svelte → Verification

---

## Context

### Original Request
User wants to open Aeries and MyOpenMath simultaneously in the Browser page.

### Architecture Discovered

**Current single-tab architecture:**
- Rust (`lib.rs`): `WebviewState { label: Option<String> }` — holds ONE label (`"embedded-browser"`)
- Every Rust command hardcodes `app.get_webview("embedded-browser")`
- Event emissions are label-free: `emit("browser-url-changed", url)` — no tab context
- `browser.ts`: All functions are parameterless (no tab_id)
- `Browser.svelte`: Single `browserCreated: bool`, single `urlInput`, single set of event listeners

**Multi-tab target architecture:**
- Rust: `WebviewState { tabs: HashMap<String, String> }` (tab_id → label)
- Each tab gets label `embedded-browser-{tabId}`
- All Rust commands take `tab_id: String` — look up label from HashMap
- Event emissions include tab_id: `emit("browser-url-changed", {tabId, url})`
- `browser.ts`: All functions take `tabId: string`
- `Browser.svelte`: `tabs: Tab[]`, `activeTabId: string`, tab bar UI, per-tab state

**CDP Note (known limitation):**
`discover_cdp_target` finds the first non-localhost page in the WebView2 debug endpoint. With multiple webviews, it will target whichever tab is "first" in the process. The Agent tab will work on the active tab in most cases, but tab targeting is not guaranteed. This is acceptable for MVP — do NOT try to fix CDP multi-target in this plan.

---

## Work Objectives

### Core Objective
Allow the user to open multiple browser tabs simultaneously, each maintaining its own page state (login sessions, scroll position, form state).

### Concrete Deliverables
- `ogre-desktop/src-tauri/src/lib.rs` — all browser commands accept `tab_id`, `WebviewState` is a `HashMap`, events carry tab_id in payload
- `ogre-desktop/src/lib/browser.ts` — all exported browser functions accept `tabId: string`
- `ogre-desktop/src/pages/Browser.svelte` — tab bar UI, `tabs` state array, `activeTabId`, tab switching/creation/closing logic

### Definition of Done
- [ ] Multiple tabs can be opened simultaneously
- [ ] Switching tabs hides the old webview and shows the new one (page state preserved)
- [ ] Each tab has its own URL/title/loading indicator
- [ ] New tab button opens a blank/preset tab
- [ ] Close button on each tab destroys that webview
- [ ] Quick Launch presets open in the current tab (or a new tab)
- [ ] All existing tests pass
- [ ] No TypeScript errors

### Must Have
- Tab bar above the address bar showing all open tabs
- Each tab is a separate Tauri child webview (not URL swapping)
- Switching tabs: hide old webview → show new webview → set bounds
- First tab created automatically on Browser page mount

### Must NOT Have
- Do NOT implement CDP multi-target (Agent tab works on active tab only)
- Do NOT add tab persistence across app restarts (session-only tabs)
- Do NOT support draggable/reorderable tabs (out of scope)
- Do NOT modify any non-browser pages (Skills, Settings, etc.)
- Do NOT change the GRADING_SITE_PRESETS array

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **New unit tests**: Add tests for tab state management logic in a new `browser-tabs.test.ts` if logic is extracted; otherwise verify via LSP diagnostics
- **Regression tests**: Run `browser.test.ts` to ensure GRADING_SITE_PRESETS and existing functions not broken

### QA Policy
Evidence saved to `.sisyphus/evidence/tab-{scenario}.txt`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Rust backend — MUST be first):
└── Task 1: Update lib.rs — tab_id on all commands, HashMap state, event payloads

Wave 2 (TypeScript layer — after Wave 1):
└── Task 2: Update browser.ts — add tabId param to all functions

Wave 3 (Frontend — after Wave 2):
├── Task 3: Browser.svelte tab bar UI (visual component only)
└── Task 4: Browser.svelte tab state management + wiring

Wave FINAL (Verification):
├── Task F1: Plan compliance audit
└── Task F2: Regression test run
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2 |
| 2 | 1 | 3, 4 |
| 3 | 2 | F1 |
| 4 | 2, 3 | F1, F2 |
| F1 | 3, 4 | — |
| F2 | 4 | — |

---

## TODOs

- [ ] 1. Rust: Generalize all browser commands to accept `tab_id`

  **What to do**:
  1. Change `WebviewState` struct: `label: Option<String>` → `tabs: HashMap<String, String>`
  2. Update `.manage()` call: `Mutex::new(WebviewState { label: None })` → `Mutex::new(WebviewState { tabs: HashMap::new() })`
  3. Update `create_embedded_browser(app, url)` → `create_embedded_browser(app, tab_id: String, url: String)`:
     - Webview label: `format!("embedded-browser-{}", tab_id)`
     - Store in `state.tabs.insert(tab_id.clone(), label.clone())`
     - `on_navigation` closure: capture `tab_id.clone()`, emit `("browser-url-changed", json!({"tabId": tab_id, "url": url}))`
     - `on_page_load` closure: emit `("browser-page-loaded", json!({"tabId": tab_id, "url": url}))`
     - `on_new_window`: navigate the SAME tab's webview (not hardcoded label)
  4. Update ALL other commands to accept `tab_id: String` and look up label from state HashMap:
     - `navigate_embedded(app, tab_id, url)`
     - `go_back(app, tab_id)`, `go_forward(app, tab_id)`, `reload_browser(app, tab_id)`
     - `set_webview_bounds(app, tab_id, x, y, width, height)`
     - `hide_webview(app, tab_id)`, `show_webview(app, tab_id)`
     - `get_embedded_url(app, tab_id)`
     - `destroy_webview(app, tab_id)` — also removes from HashMap: `state.tabs.remove(&tab_id)`
     - `inject_autofill(app, tab_id, script)`
     - `eval_webview_script(app, tab_id, script)` — look up webview by tab_id
     - `inject_webview_script(app, tab_id, script)`
  5. Helper function to get webview by tab_id (DRY):
     ```rust
     fn get_webview_for_tab(app: &tauri::AppHandle, state: &std::sync::MutexGuard<WebviewState>, tab_id: &str) -> Result<tauri::Webview<tauri::Wry>, String> {
         let label = state.tabs.get(tab_id).ok_or_else(|| format!("Tab {} not found", tab_id))?;
         app.get_webview(label).ok_or_else(|| format!("Webview {} not found", label))
     }
     ```
     Wait — the helper needs to lock state and the commands also need state. Factor this carefully. Instead, inline the lookup in each command OR lock state briefly to get the label then release before using webview.
  6. No new commands needed — just update existing ones

  **Pattern references**:
  - `lib.rs:19-22` — current `WebviewState` struct
  - `lib.rs:217-286` — `create_embedded_browser` implementation
  - `lib.rs:288-380` — all other browser commands (navigate, back, forward, reload, bounds, hide, show, get_url, destroy, inject_autofill)
  - `lib.rs:386-454` — `eval_webview_script` implementation (uses EvalRegistry, still works — eval_id is globally unique UUID)
  - `lib.rs:876-877` — `.manage(Mutex::new(WebviewState { label: None }))` line to update

  **Must NOT do**:
  - Do NOT change `_eval_callback` — it doesn't need tab_id (uses eval_id registry)
  - Do NOT change OAuth, CDP, or sidecar commands
  - Do NOT add new Rust crate dependencies

  **Acceptance Criteria**:
  - [ ] `WebviewState` uses `HashMap<String, String>`
  - [ ] All browser commands accept `tab_id: String`
  - [ ] `create_embedded_browser` creates webview with label `embedded-browser-{tab_id}`
  - [ ] `destroy_webview` removes entry from HashMap
  - [ ] Events `browser-url-changed` and `browser-page-loaded` emit `{tabId, url}` JSON objects
  - [ ] Rust compiles: `cargo build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Rust compiles without errors
    Tool: Bash
    Steps: cd ogre-desktop && cargo build 2>&1 | tail -5
    Expected: Finished / no errors
    Evidence: .sisyphus/evidence/task-1-cargo-build.txt

  Scenario: No remaining hardcoded "embedded-browser" label strings
    Tool: Grep
    Steps: grep -n '"embedded-browser"' src-tauri/src/lib.rs
    Expected: No matches (all replaced with dynamic label)
    Evidence: .sisyphus/evidence/task-1-no-hardcoded-label.txt
  ```

  **Commit**: NO — commit after T4 (full feature)

- [ ] 2. TypeScript: Update browser.ts — add tabId param to all functions

  **What to do**:
  1. Read `ogre-desktop/src/lib/browser.ts` fully first
  2. Add `tabId: string` as first parameter to all browser operation functions:
     - `createEmbeddedBrowser(tabId, url)`
     - `navigateEmbedded(tabId, url)`
     - `goBack(tabId)`, `goForward(tabId)`, `reloadBrowser(tabId)`
     - `setWebviewBounds(tabId, x, y, width, height)`
     - `getEmbeddedUrl(tabId)`
     - `hideWebview(tabId)`, `showWebview(tabId)`
     - (check if `destroyWebview` is exported — add tabId if so)
     - `injectAutofill(tabId, username, password)` — script is built internally
  3. Update `listenBrowserUrlChanged` and `listenBrowserPageLoaded` handlers:
     - Event payloads are now `{tabId: string, url: string}` objects
     - Handler type: `(payload: {tabId: string, url: string}) => void`
     - Or keep the current simple `(url: string) => void` but intercept in Browser.svelte — BETTER: change to `(tabId: string, url: string) => void` by passing both
     - Actually: change event listeners to pass the full payload to caller: `listenBrowserUrlChanged(handler: (payload: {tabId: string, url: string}) => void)`
  4. Pass `tabId` through to `invoke()` calls

  **Pattern references**:
  - `browser.ts:1-50` — current function signatures
  - `browser.ts` — `listenBrowserUrlChanged`, `listenBrowserPageLoaded`, `listenBrowserStatus` listener wrappers
  - The `invoke()` calls that map to Rust commands

  **Must NOT do**:
  - Do NOT change `GRADING_SITE_PRESETS`
  - Do NOT change `listenBrowserStatus` — it's not tab-specific
  - Do NOT change `calculateWebviewBounds` in `webview-layout.ts`

  **Acceptance Criteria**:
  - [ ] All browser operation functions accept `tabId: string`
  - [ ] Event listener callbacks receive `{tabId, url}` payload
  - [ ] LSP diagnostics clean on `browser.ts`

  **QA Scenarios**:
  ```
  Scenario: LSP clean on browser.ts
    Tool: lsp_diagnostics
    Steps: run on ogre-desktop/src/lib/browser.ts
    Expected: No errors
    Evidence: .sisyphus/evidence/task-2-lsp.txt

  Scenario: No calls missing tabId
    Tool: Grep
    Steps: grep -n "invoke('create_embedded_browser'" src/lib/browser.ts
    Expected: Call includes tab_id argument
    Evidence: .sisyphus/evidence/task-2-invoke-check.txt
  ```

  **Commit**: NO — commit after T4

- [ ] 3. Svelte: Tab bar UI component (visual only)

  **What to do**:
  Add a tab bar UI to `Browser.svelte` ABOVE the `.nav-bar` (address bar). The tab bar is visual-only in this task — no wiring to real webviews yet.

  Tab bar layout:
  ```
  [Tab 1 Title ×] [Tab 2 Title ×] [+]
  ```
  - Each tab shows its title (or URL hostname if no title) with a close button (×)
  - Active tab is highlighted
  - `+` button opens new tab
  - Tab bar scrolls horizontally if many tabs

  Add these CSS classes and structure:
  ```svelte
  <div class="tab-bar">
    {#each tabs as tab (tab.id)}
      <button
        class="tab"
        class:active={tab.id === activeTabId}
        onclick={() => switchTab(tab.id)}
      >
        <span class="tab-title">{tab.title || tab.url || 'New Tab'}</span>
        <button class="tab-close" onclick|stopPropagation={() => closeTab(tab.id)}>×</button>
      </button>
    {/each}
    <button class="tab-new" onclick={openNewTab}>+</button>
  </div>
  ```

  Style the tab bar inline or in the `<style>` block following existing patterns (dark theme, similar to `.nav-bar` styling).

  **Tab state shape** (add to script section — stub functions for now):
  ```typescript
  interface Tab {
    id: string;
    url: string;
    title: string;
    isLoading: boolean;
    browserCreated: boolean;
  }
  let tabs = $state<Tab[]>([]);
  let activeTabId = $state<string>('');

  function switchTab(id: string) { /* T4 */ }
  function closeTab(id: string) { /* T4 */ }
  function openNewTab(url?: string) { /* T4 */ }
  ```

  **Must NOT do**:
  - Do NOT wire tab functions to real webview calls yet — that's T4
  - Do NOT delete any existing state variables yet (they'll be used per-tab in T4)
  - Do NOT change nav-bar, presets panel, or grading panel

  **Acceptance Criteria**:
  - [ ] Tab bar renders above the address bar
  - [ ] Tabs array renders correctly with active highlighting
  - [ ] Close button and new-tab button visible
  - [ ] LSP diagnostics clean on Browser.svelte
  - [ ] Existing `browserCreated`, `urlInput`, etc. still present (not yet removed)

  **QA Scenarios**:
  ```
  Scenario: LSP clean
    Tool: lsp_diagnostics
    Steps: run on ogre-desktop/src/pages/Browser.svelte
    Expected: No errors
    Evidence: .sisyphus/evidence/task-3-lsp.txt
  ```

  **Commit**: NO — commit after T4

- [ ] 4. Svelte: Wire tab state management to real webview commands

  **What to do**:
  This is the main integration task. Replace all single-tab state with per-tab state.

  1. **State migration**: Each Tab tracks its own state
     ```typescript
     // Old single-tab state (REMOVE these):
     let urlInput = '';
     let pageLoadedUrl = '';
     let isLoading = false;
     let browserCreated = false;

     // New: these become derived from activeTab
     $: currentTab = tabs.find(t => t.id === activeTabId);
     $: urlInput = currentTab?.url ?? '';
     $: isLoading = currentTab?.isLoading ?? false;
     $: browserCreated = currentTab?.browserCreated ?? false;
     ```

  2. **Tab ID generation**: use `crypto.randomUUID()` (available in Tauri webview context)

  3. **`openNewTab(url?: string)`**:
     ```typescript
     async function openNewTab(url?: string) {
       const id = crypto.randomUUID();
       const newTab: Tab = { id, url: url ?? '', title: '', isLoading: false, browserCreated: false };
       tabs = [...tabs, newTab];
       await switchTab(id);
       if (url) await navigate(id, url);
     }
     ```

  4. **`switchTab(id: string)`**:
     ```typescript
     async function switchTab(id: string) {
       if (activeTabId && activeTabId !== id) {
         const prev = tabs.find(t => t.id === activeTabId);
         if (prev?.browserCreated) await hideWebview(activeTabId);
       }
       activeTabId = id;
       const tab = tabs.find(t => t.id === id);
       if (tab?.browserCreated) {
         await showWebview(id);
         await tick();
         updateWebviewBoundsForTab(id);
       } else if (tab?.url) {
         await createEmbeddedBrowser(id, tab.url);
         // browserCreated will be set via browser-status event
       }
     }
     ```

  5. **`closeTab(id: string)`**:
     ```typescript
     async function closeTab(id: string) {
       const tab = tabs.find(t => t.id === id);
       if (tab?.browserCreated) await destroyWebview(id);
       tabs = tabs.filter(t => t.id !== id);
       if (activeTabId === id && tabs.length > 0) {
         await switchTab(tabs[tabs.length - 1].id);
       }
     }
     ```

  6. **Event listeners**: Update to handle `{tabId, url}` payload:
     ```typescript
     unlistenUrl = await listenBrowserUrlChanged(({tabId, url}) => {
       tabs = tabs.map(t => t.id === tabId ? {...t, url} : t);
     });
     unlistenLoaded = await listenBrowserPageLoaded(async ({tabId, url}) => {
       tabs = tabs.map(t => t.id === tabId ? {...t, isLoading: false} : t);
       if (tabId === activeTabId) await tryAutofill(url);
     });
     ```

  7. **`listenBrowserStatus`**: Update to set `browserCreated` per tab when status is `"embedded-open"` — BUT the current event doesn't include tab_id. **Add `tab_id` to the `browser-status` event emission in Rust** (go back to T1 if needed, or handle in T4 by using the tab that's currently being created).
     Actually: track "pending creation" tab_id in a variable:
     ```typescript
     let creatingTabId = '';
     // when creating: creatingTabId = id;
     unlistenStatus = await listenBrowserStatus((status) => {
       if (status === 'embedded-open' && creatingTabId) {
         tabs = tabs.map(t => t.id === creatingTabId ? {...t, browserCreated: true} : t);
         creatingTabId = '';
         tick().then(() => updateWebviewBoundsForTab(activeTabId));
       }
     });
     ```

  8. **`updateWebviewBounds`**: Update to pass `activeTabId` to `setWebviewBounds(activeTabId, ...)`

  9. **Address bar navigation**: URL input `onkeydown` and navigate button should call `navigateEmbedded(activeTabId, urlInput)`

  10. **Back/Forward/Reload**: Call with `activeTabId`

  11. **Quick Launch presets**: Should call `navigateEmbedded(activeTabId, preset.url)` (navigate current tab)

  12. **`onMount`**: After loading saved state, call `openNewTab()` to create the first tab

  13. **`onDestroy`**: `closeTab` each tab (or just destroy all webviews)

  **Must NOT do**:
  - Do NOT change GradingPanel — it listens to CDP, which targets active webview automatically
  - Do NOT change the presets array or URL bar visual structure
  - Do NOT add tab count limits
  - Do NOT persist tabs across restarts

  **Acceptance Criteria**:
  - [ ] First tab created automatically on Browser page mount
  - [ ] Clicking "+" opens a new empty tab
  - [ ] Clicking a preset URL navigates the active tab
  - [ ] Switching between tabs shows the correct webview (page state preserved)
  - [ ] Closing a tab destroys its webview and switches to another tab
  - [ ] URL bar shows the active tab's current URL
  - [ ] LSP diagnostics clean on Browser.svelte

  **QA Scenarios**:
  ```
  Scenario: LSP clean on Browser.svelte
    Tool: lsp_diagnostics
    Steps: run on ogre-desktop/src/pages/Browser.svelte
    Expected: No errors
    Evidence: .sisyphus/evidence/task-4-lsp.txt

  Scenario: All existing browser functions pass tabId
    Tool: Grep
    Steps: grep -n "navigateEmbedded\|goBack\|goForward\|reloadBrowser\|hideWebview\|showWebview\|setWebviewBounds" src/pages/Browser.svelte
    Expected: All calls have a tabId argument (no bare function calls)
    Evidence: .sisyphus/evidence/task-4-tabid-calls.txt
  ```

  **Commit**: YES — after F1 and F2 pass
  - Message: `feat(browser): add multi-tab support with persistent page state`
  - Files: `src-tauri/src/lib.rs`, `src/lib/browser.ts`, `src/pages/Browser.svelte`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `quick`
  1. Verify `WebviewState` in lib.rs uses `HashMap`
  2. Verify `create_embedded_browser` creates label `embedded-browser-{tab_id}`
  3. Verify all browser commands in browser.ts have `tabId: string` param
  4. Verify Browser.svelte has tab bar UI (`tab-bar` class)
  5. Verify Browser.svelte has `tabs: Tab[]` and `activeTabId` state
  6. Verify no files outside `lib.rs`, `browser.ts`, `Browser.svelte` were modified (except test files if updated)
  Output: `Deliverables [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Regression Test + Compile** — `quick`
  1. `cargo build` (Rust) — exit 0
  2. `npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/browser.test.ts` — PASS
  3. LSP diagnostics clean on all 3 changed files
  Output: `Rust [PASS/FAIL] | Tests [PASS/FAIL] | LSP [PASS/FAIL] | VERDICT: APPROVE/REJECT`

---

## Success Criteria

- [ ] Multi-tab UI visible with tab bar
- [ ] Two sites can be open simultaneously without losing login state
- [ ] Switching tabs is instant (hide/show, not reload)
- [ ] All existing browser tests pass
- [ ] Rust compiles clean
