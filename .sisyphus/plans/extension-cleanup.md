# Extension UI/UX Redesign: Match Desktop Styles & Compact Sidepanel Layout

## TL;DR

> **Quick Summary**: Restyle the Chrome extension's sidepanel UI to match the desktop app's component styles (bordered buttons, bordered cards with gradient top, input focus rings, light-mode radii) and make the layout more compact — replacing provider tabs with a dropdown selector, hiding all auth UI when desktop is connected, and adding icons to the mode switcher.
> 
> **Deliverables**:
> - Restyled buttons, cards, inputs matching `ogre-desktop/src/app.css`
> - Provider config tabs collapsed into a compact `<select>` dropdown
> - Auth/login UI hidden when `desktopConnected === true`
> - Mode switcher with Bootstrap Icons
> - Tighter spacing for narrow sidepanel format
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential (each task builds on the previous CSS foundation)
> **Critical Path**: Task 1 (CSS foundation) → Task 2 (tabs→dropdown) → Task 3 (desktop-connected hiding) → Task 4 (mode icons + polish)

---

## Context

### Original Request
User asked to adjust the extension UI to better match desktop colors and text, and suggest ways to make it more user-friendly given the narrow sidepanel format.

### Interview Summary
**Key Discussions**:
- Extension and desktop share identical CSS variables but differ in component styles (buttons use full-width accent colors vs desktop's subtle bordered style)
- Provider config tabs consume too much vertical space → replace with compact dropdown
- When desktop app is connected, ALL login/API key/OAuth UI should be hidden (desktop handles auth)
- Keep segmented control for mode switcher (Grader/Solver/Batch), improve with icons
- UI/UX changes ONLY — no dead code removal, no provider logic changes, no architectural refactoring

**Research Findings**:
- Extension CSS is entirely inline in `sidepanel.html` `<style>` block (~1,192 lines)
- `sidepanel.js` is ~2,906 lines containing all UI logic
- `renderProviderConfig()` at ~line 1501 generates provider config HTML with **hardcoded inline styles and non-variable colors** (`#007bff`) — this is effectively a third styling surface beyond the `<style>` block
- `switchProvider()` at ~line 1681 and `setupListeners()` at ~line 93 reference `.tab-btn` elements that will be removed
- `updateProviderTabStatus()` uses `::after` pseudo-elements on `.tab-btn` for status dots — this mechanism is lost with dropdown conversion
- Key HTML elements outside `desktopModeContent`/`manualModeContent` divs (Test/Save buttons, model selector) remain visible in desktop-connected mode — `updateProviderUI()` needs expansion
- Dark mode radii already match desktop; only light mode radii differ (6/8/12 vs 8/12/20)
- Several hardcoded `border-radius: 8px` values exist that won't respond to variable changes

### Metis Review
**Identified Gaps** (addressed):
- `renderProviderConfig()` inline styles are a third styling surface → Task 1 includes updating JS-generated inline styles to use CSS classes
- `.tab-btn` is referenced in 3 JS locations → Task 2 maps and updates all three (setupListeners, switchProvider, updateProviderTabStatus)
- Provider status dots use `::after` on tabs → Task 2 adds status text/emoji to dropdown option labels
- Test/Save buttons and model selector sit outside desktop/manual content divs → Task 3 explicitly hides these
- Hardcoded `border-radius: 8px` scattered across CSS → Task 1 replaces with `var(--radius-*)` references
- 10+ distinct button selector variants exist → Task 1 maps ALL before changing base style
- Bootstrap Icons CDN v1.11.1 already loaded → Task 4 uses only icons from this version

---

## Work Objectives

### Core Objective
Make the extension sidepanel visually consistent with the desktop app's component styles and optimize the layout for narrow sidepanel usage.

### Concrete Deliverables
- Restyled `sidepanel.html` inline CSS matching desktop `app.css` patterns
- Updated `sidepanel.html` HTML structure (tabs → dropdown)
- Updated `sidepanel.js` for dropdown switching, desktop-connected UI hiding, and CSS class usage in dynamic HTML
- Mode switcher with Bootstrap Icon labels

### Definition of Done
- [ ] All buttons use desktop-style bordered appearance (not full-width colored)
- [ ] All cards have `border: 1px solid var(--color-border)` and dark mode gradient `::before`
- [ ] Provider config uses `<select>` dropdown instead of tab buttons
- [ ] All auth UI (API keys, OAuth buttons, Test Connection, Save Config) hidden when desktop connected
- [ ] Mode switcher labels include Bootstrap Icons
- [ ] Light mode radii match desktop (8/12/20)
- [ ] Both dark and light themes render correctly
- [ ] All three modes (Grader/Solver/Batch) still function correctly

### Must Have
- Visual parity with desktop button/card/input styles
- Compact provider dropdown replacing tabs
- Desktop-connected mode hides auth UI completely
- Both themes tested for every change

### Must NOT Have (Guardrails)
- NO changes to provider API logic (inside `switchProvider()` lines ~1693-1714)
- NO restructuring of `renderProviderConfig()` beyond styling — only change `style.*` assignments and add CSS classes
- NO changes to `PROVIDERS` object structure or `getConfig()` definitions
- NO font/typography changes (keep existing fonts)
- NO rearranging card order or adding/removing cards
- NO changes to `batch-grader.js`, `providers.js`, `background.js`, `prompts.js`, `oauth-client.js`
- NO new npm dependencies or external CSS
- NO changes to dark mode radii (already match desktop)
- NO animated icons or SVGs — Bootstrap Icons class names only (`<i class="bi bi-*">`)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> ALL verification is executed by the agent using tools (Playwright, Bash). No exceptions.

### Test Decision
- **Infrastructure exists**: YES — `tests/visual_verification.spec.js` exists with Playwright
- **Automated tests**: Tests-after (visual verification after changes)
- **Framework**: Playwright

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Every task includes specific Playwright scenarios to verify both themes and all modes.
Evidence captured as screenshots in `.sisyphus/evidence/`.

---

## Execution Strategy

### Sequential Execution (No Parallelism)

Tasks are sequential because each builds on the CSS foundation from the previous:

```
Task 1: CSS Foundation (buttons, cards, inputs, radii, hardcoded values)
  ↓
Task 2: Provider Tabs → Dropdown (depends on new button/card styles)
  ↓
Task 3: Desktop-Connected UI Hiding (depends on new layout structure)
  ↓
Task 4: Mode Selector Icons + Final Polish (independent but best done last)
```

### Dependency Matrix

| Task | Depends On | Blocks | 
|------|------------|--------|
| 1 | None | 2, 3, 4 |
| 2 | 1 | 3 |
| 3 | 1, 2 | 4 |
| 4 | 1 | None |

---

## TODOs

- [x] 1. CSS Foundation: Restyle Buttons, Cards, Inputs, Radii to Match Desktop

  **What to do**:

  **1a. Map all button selector variants BEFORE changing base style:**
  Use `ast_grep_search` and grep to find ALL button-related selectors in `sidepanel.html` `<style>` block. Known variants:
  - `button` (base, ~line 176) — full-width green, `background: var(--color-mode-accent)`
  - `.secondary` (~line 183) — secondary button style
  - `.tab-btn` (~line 587) — provider tab buttons (will be removed in Task 2 but must not break here)
  - `.btn-tool` / `.btn-tool-auto` (~lines 939-948) — toolbar buttons
  - `.integrated-controls button` (~lines 474-488) — integrated control buttons
  - `.btn-resume` / `.btn-fresh` (~lines 950-963) — resume/fresh start buttons
  - `.latex-btn` (~lines 203-216) — LaTeX toolbar buttons
  - `body.solver-mode button` / `body.batch-mode button` overrides (~lines 180-181, 382-385) — mode-specific button overrides
  - Dynamically generated buttons in `renderProviderConfig()` (JS inline styles)

  **1b. Restyle base `button` to match desktop:**
  Change from:
  ```css
  /* Current extension */
  button { width: 100%; background: var(--color-mode-accent); color: var(--color-primary-text); border: none; }
  ```
  To match desktop pattern:
  ```css
  /* Desktop style */
  button { 
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    background-color: var(--color-bg-sidebar); 
    border: 1px solid var(--color-border); 
    color: var(--color-text-primary);
    padding: 0.5rem 1rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  button:hover { background-color: var(--color-bg-hover); border-color: var(--color-text-muted); }
  ```
  Add `.btn-primary` class for accent buttons (Submit Assessment, Start Batch, etc.):
  ```css
  .btn-primary { 
    background-color: var(--color-primary); 
    border-color: var(--color-primary); 
    color: white; 
  }
  .btn-primary:hover { opacity: 0.9; }
  ```

  **1c. Verify and update all button variant overrides** so they cascade correctly with the new base style. Ensure mode-specific overrides still apply accent colors where needed.

  **1d. Add `.btn-primary` class to key action buttons** in `sidepanel.html` HTML:
  - "Run Assessment" / "Submit" button
  - "Start Batch" button
  - Any other primary action buttons
  Leave secondary/utility buttons using the new default bordered style.

  **1e. Restyle `.card` to match desktop:**
  Change from:
  ```css
  /* Current extension */
  .card { box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; }
  ```
  To:
  ```css
  /* Desktop style */
  .card { 
    border: 1px solid var(--color-border); 
    border-radius: var(--radius-lg);
    box-shadow: none;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light, var(--color-primary)));
    opacity: 0;
    transition: opacity 0.2s;
  }
  [data-theme="dark"] .card::before,
  @media (prefers-color-scheme: dark) { .card::before { opacity: 1; } }
  ```

  **1f. Restyle inputs to match desktop:**
  Add explicit background and focus ring:
  ```css
  input, select, textarea { 
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-bg);
    outline: none;
  }
  ```

  **1g. Fix light mode radii** in `[data-theme="light"]` block:
  Change from `--radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;`
  To: `--radius-sm: 8px; --radius-md: 12px; --radius-lg: 20px;`
  (Dark mode radii are already correct — do NOT change.)

  **1h. Replace hardcoded `border-radius` values** throughout the `<style>` block:
  Use grep/ast_grep to find all `border-radius: 8px`, `border-radius: 12px`, etc. and replace with appropriate `var(--radius-*)` references. Known locations:
  - `.card` (~line 170) — `8px` → `var(--radius-lg)`
  - `.modal-content` (~line 307) — `8px` → `var(--radius-lg)`
  - `.mode-selector` (~line 352) — check and replace if hardcoded
  - Any other hardcoded radius values found via search

  **1i. Update `renderProviderConfig()` inline styles in `sidepanel.js`:**
  The function at ~line 1501 creates elements with hardcoded inline styles. Update:
  - `helperLink.style.color = '#007bff'` → add CSS class `.helper-link` with `color: var(--color-primary)` instead
  - `testBtn.style.*` inline styles → add CSS class `.btn-test-connection` styled as default bordered button
  - `statusDiv.style.*` inline styles → add CSS class `.provider-status` with proper variable-based styling
  - Add the new CSS classes to the `<style>` block in `sidepanel.html`
  - Keep the element creation logic intact — only change how styles are applied

  **Must NOT do**:
  - Do NOT remove `.tab-btn` CSS yet (Task 2 handles that)
  - Do NOT change provider switching logic
  - Do NOT change any button's click handler or functionality
  - Do NOT change font families
  - Do NOT restructure `renderProviderConfig()` logic — only change `style.*` to class assignments

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is a CSS restyling task requiring visual design sensibility and understanding of CSS cascade/specificity
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for matching desktop design system to extension component styles
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for implementation — QA scenarios use it but that's automatic

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — must complete first
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (desktop styles to match):
  - `ogre-desktop/src/app.css:206-260` — Desktop button styles (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`) — follow these exact patterns for the extension buttons
  - `ogre-desktop/src/app.css:262-328` — Desktop card styles (`.card`, `.card::before` gradient, `.card-header`) — replicate border + gradient pattern
  - `ogre-desktop/src/app.css:330-365` — Desktop input/form styles — match background color and focus ring pattern

  **Files Being Modified**:
  - `sidepanel.html:9-1201` — Inline `<style>` block containing ALL extension CSS. Button base at ~line 176, .secondary at ~183, .card at ~170, .tab-btn at ~587, mode-specific overrides at ~380
  - `sidepanel.js:1501-1679` — `renderProviderConfig()` function with hardcoded inline styles to convert to CSS classes

  **Specificity/Cascade References** (understand before changing base button):
  - `sidepanel.html:176-183` — Base button + .secondary styles
  - `sidepanel.html:474-488` — `.integrated-controls button` overrides
  - `sidepanel.html:587-628` — `.tab-btn` styles + `::after` status dots
  - `sidepanel.html:939-963` — `.btn-tool`, `.btn-tool-auto`, `.btn-resume`, `.btn-fresh`
  - `sidepanel.html:203-216` — `.latex-btn` styles
  - `sidepanel.html:380-385` — `body.solver-mode button`, `body.batch-mode button` accent overrides

  **CSS Variable References**:
  - `sidepanel.html:9-60` — `:root` dark mode variables (DO NOT CHANGE)
  - `sidepanel.html:60-120` — `[data-theme="light"]` variables (change radii here)

  **Acceptance Criteria**:

  - [ ] All hardcoded `border-radius` values replaced with `var(--radius-*)` (search returns 0 hardcoded px values in `<style>`)
  - [ ] Light mode `--radius-sm/md/lg` changed to `8px/12px/20px`
  - [ ] Base `button` style matches desktop (bordered, not full-width colored)
  - [ ] `.btn-primary` class exists and applied to primary action buttons
  - [ ] `.card` has `border: 1px solid var(--color-border)` and `::before` gradient
  - [ ] `renderProviderConfig()` no longer uses hardcoded color values — CSS classes used instead
  - [ ] `#007bff` does not appear anywhere in `sidepanel.js`
  - [ ] All three modes (Grader/Solver/Batch) still render buttons correctly with mode accent colors
  - [ ] No visual regression in dark mode (radii unchanged, colors same)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Buttons match desktop bordered style in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, sidepanel open, dark theme active
    Steps:
      1. Open sidepanel.html in browser
      2. Wait for page load (timeout: 5s)
      3. Screenshot the full sidepanel
      4. Inspect a default button: assert computed style has `border` (not `border: none`)
      5. Inspect a default button: assert `background-color` is NOT the mode accent color
      6. Inspect a `.btn-primary` button: assert it has accent/primary background
      7. Screenshot: .sisyphus/evidence/task-1-buttons-dark.png
    Expected Result: Default buttons are subtle/bordered; primary buttons are accent-colored
    Evidence: .sisyphus/evidence/task-1-buttons-dark.png

  Scenario: Cards match desktop bordered style with gradient in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. Inspect `.card` element: assert computed `border` includes `1px solid`
      2. Inspect `.card::before`: assert `opacity: 1` in dark mode
      3. Assert `.card` does NOT have `box-shadow: 0 2px 4px rgba(0,0,0,0.1)`
      4. Screenshot: .sisyphus/evidence/task-1-cards-dark.png
    Expected Result: Cards have border and gradient top strip
    Evidence: .sisyphus/evidence/task-1-cards-dark.png

  Scenario: Light mode uses updated radii
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, light theme active
    Steps:
      1. Inspect any `.card` element: assert computed `border-radius` is `20px` (--radius-lg)
      2. Inspect any button: assert computed `border-radius` is `8px` (--radius-sm)
      3. Screenshot: .sisyphus/evidence/task-1-radii-light.png
    Expected Result: Light mode radii match desktop (8/12/20)
    Evidence: .sisyphus/evidence/task-1-radii-light.png

  Scenario: All three modes still render correctly
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Click Grader mode → screenshot: .sisyphus/evidence/task-1-mode-grader.png
      2. Click Solver mode → verify accent color changes → screenshot: .sisyphus/evidence/task-1-mode-solver.png
      3. Click Batch mode → verify accent color changes → screenshot: .sisyphus/evidence/task-1-mode-batch.png
      4. In each mode, verify buttons in `.integrated-controls` are visible and styled
    Expected Result: Mode switching still works, accent colors still apply
    Evidence: .sisyphus/evidence/task-1-mode-*.png

  Scenario: No hardcoded colors remain in renderProviderConfig
    Tool: Bash (grep)
    Steps:
      1. grep -n "#007bff" sidepanel.js → Assert: 0 matches
      2. grep -n "style\.color = " sidepanel.js renderProviderConfig section → Assert: uses classList.add instead
    Expected Result: No hardcoded hex colors in provider config generation
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `style(extension): restyle buttons, cards, inputs to match desktop design system`
  - Files: `sidepanel.html`, `sidepanel.js`
  - Pre-commit: Visual verification screenshots pass

---

- [x] 2. Collapse Provider Config Tabs into Compact Dropdown Selector

  **What to do**:

  **2a. Replace tab HTML structure with `<select>` dropdown:**
  In `sidepanel.html`, find the provider tabs container (contains `.tab-btn` elements for Ollama, OpenAI, Claude, Gemini, GitHub). Replace with:
  ```html
  <div class="provider-selector">
    <label for="providerSelect">Provider</label>
    <select id="providerSelect" class="provider-dropdown">
      <!-- Options populated dynamically by JS -->
    </select>
    <span id="providerStatus" class="provider-status-indicator"></span>
  </div>
  ```
  Style `.provider-selector` as a compact row with the dropdown and status indicator side by side.
  Style `.provider-dropdown` to match the new input styling from Task 1.
  Style `.provider-status-indicator` to show connection status (green dot / red dot / spinner) using CSS classes.

  **2b. Add CSS for new dropdown and status indicator:**
  ```css
  .provider-selector { display: flex; align-items: center; gap: var(--spacing-2); margin-bottom: var(--spacing-2); }
  .provider-dropdown { flex: 1; }
  .provider-status-indicator { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .provider-status-indicator.status-connected { background: var(--color-success, #28a745); }
  .provider-status-indicator.status-error { background: var(--color-error, #dc3545); }
  .provider-status-indicator.status-testing { background: var(--color-warning, #ffc107); animation: pulse 1s infinite; }
  ```

  **2c. Update `setupListeners()` in `sidepanel.js` (~line 93):**
  Replace `.tab-btn` click handlers with `#providerSelect` change handler:
  ```js
  // OLD: document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', ...))
  // NEW: document.getElementById('providerSelect').addEventListener('change', (e) => switchProvider(e.target.value))
  ```

  **2d. Update `switchProvider()` in `sidepanel.js` (~line 1681):**
  Remove the `.tab-btn` active class toggling logic (lines ~1686-1688):
  ```js
  // OLD: document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
  // NEW: document.getElementById('providerSelect').value = providerId;
  ```
  Keep ALL provider API logic intact (lines ~1693-1714).

  **2e. Update `updateProviderTabStatus()` in `sidepanel.js`:**
  Instead of adding CSS classes to `.tab-btn` elements, update the `#providerStatus` indicator:
  ```js
  // OLD: btn.classList.add('status-connected') on .tab-btn
  // NEW: document.getElementById('providerStatus').className = 'provider-status-indicator status-connected';
  ```
  Also update the dropdown option text to include status if desired (e.g., "Ollama ✓" for connected).

  **2f. Populate dropdown options dynamically:**
  Find where tab buttons are created/populated and replace with `<option>` creation for the `<select>`. Each option should have `value` set to the provider ID and display text as the provider name.

  **2g. Remove old `.tab-btn` CSS** from `sidepanel.html` `<style>` block (lines ~587-628). This includes:
  - `.tab-btn` base styles
  - `.tab-btn.active` styles
  - `.tab-btn::after` status dot pseudo-elements
  - Any `.tab-btn:hover` styles

  **Must NOT do**:
  - Do NOT change what `switchProvider()` does with the provider (API logic)
  - Do NOT change `renderProviderConfig()` logic (it still renders config for the selected provider)
  - Do NOT change the provider objects in `providers.js`
  - Do NOT remove the provider config container — just the tabs above it

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: HTML restructuring + JS event handler updates for a UI component change
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for compact dropdown layout design in narrow sidepanel

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — after Task 1
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (current tab implementation to replace):
  - `sidepanel.html:587-628` — Current `.tab-btn` CSS styles + `::after` pseudo-elements for status dots
  - `sidepanel.html` HTML section — Find the `<div>` containing `.tab-btn` elements (search for `tab-btn` in HTML body)
  
  **JS Functions to Modify**:
  - `sidepanel.js:~93` — `setupListeners()` — `.tab-btn` click handlers need to become dropdown change handler
  - `sidepanel.js:~1681-1714` — `switchProvider(providerId)` — Remove .tab-btn class toggling (lines ~1686-1688), keep API logic (lines ~1693-1714)
  - `sidepanel.js` — `updateProviderTabStatus()` — Redirect status updates from `.tab-btn` elements to `#providerStatus` indicator
  - `sidepanel.js:~2010` — `populateDesktopProviderDropdown(providers)` — Reference for how provider dropdown is already done in desktop mode (reuse pattern for standalone mode)

  **Existing Dropdown Pattern** (desktop mode already has one):
  - `sidepanel.js:~2010` — `populateDesktopProviderDropdown()` creates `<option>` elements for `#desktopProviderSelect` — follow this exact pattern for the new standalone provider dropdown

  **Acceptance Criteria**:

  - [ ] No `.tab-btn` elements exist in rendered HTML
  - [ ] `#providerSelect` dropdown exists with all 5 providers as options
  - [ ] Changing dropdown selection triggers `switchProvider()` and renders correct provider config
  - [ ] Provider connection status is visible via `#providerStatus` indicator (colored dot)
  - [ ] Old `.tab-btn` CSS rules removed from `<style>` block
  - [ ] `querySelectorAll('.tab-btn')` returns empty NodeList (search JS for any remaining references)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Provider dropdown renders with all providers
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, sidepanel open
    Steps:
      1. Wait for #providerSelect to be visible (timeout: 5s)
      2. Get all <option> elements inside #providerSelect
      3. Assert: 5 options exist (Ollama, OpenAI, Claude, Gemini, GitHub)
      4. Screenshot: .sisyphus/evidence/task-2-dropdown-closed.png
      5. Click #providerSelect to open dropdown
      6. Screenshot: .sisyphus/evidence/task-2-dropdown-open.png
    Expected Result: Compact dropdown with all 5 providers
    Evidence: .sisyphus/evidence/task-2-dropdown-*.png

  Scenario: Switching provider via dropdown loads correct config
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Select "OpenAI" from #providerSelect
      2. Wait for provider config to render (timeout: 3s)
      3. Assert: API key input field visible with OpenAI placeholder
      4. Select "Gemini" from #providerSelect
      5. Wait for provider config to render (timeout: 3s)
      6. Assert: Config shows Gemini-specific fields (API key OR OAuth)
      7. Screenshot: .sisyphus/evidence/task-2-switch-provider.png
    Expected Result: Each dropdown selection renders the correct provider config form
    Evidence: .sisyphus/evidence/task-2-switch-provider.png

  Scenario: Provider status indicator works
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Check #providerStatus element exists
      2. Assert: has class `provider-status-indicator`
      3. Assert: element is visible (width/height > 0)
      4. Screenshot: .sisyphus/evidence/task-2-status-indicator.png
    Expected Result: Status dot visible next to dropdown
    Evidence: .sisyphus/evidence/task-2-status-indicator.png

  Scenario: No .tab-btn remnants in DOM or JS
    Tool: Bash (grep)
    Steps:
      1. grep -n "tab-btn" sidepanel.html → Assert: 0 matches (removed from CSS and HTML)
      2. grep -n "tab-btn" sidepanel.js → Assert: 0 matches (all references updated)
    Expected Result: Complete removal of tab-btn pattern
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `refactor(extension): replace provider tabs with compact dropdown selector`
  - Files: `sidepanel.html`, `sidepanel.js`
  - Pre-commit: Provider switching works via dropdown

---

- [x] 3. Hide All Auth UI When Desktop Is Connected

  **What to do**:

  **3a. Audit all auth-related UI elements outside `desktopModeContent`/`manualModeContent` divs:**
  Search `sidepanel.html` for elements that show authentication UI which should be hidden when desktop is connected:
  - API key input fields (within provider config container)
  - OAuth "Sign in with Google/GitHub" buttons
  - "Test Connection" button (dynamically created by `renderProviderConfig()`)
  - "Save Config" button (~line 1286-1289 in JS)
  - "Get API Key" helper links
  - Model selector (`#modelName`) — if desktop controls model selection
  - Any status messages related to connection testing

  **3b. Expand `updateProviderUI(connected)` in `sidepanel.js` (~line 1903):**
  Currently this function toggles visibility of `desktopModeContent` and `manualModeContent`. Expand it to ALSO hide:
  - The new provider dropdown (from Task 2) — desktop has its own provider selector
  - Test Connection / Save Config buttons
  - API key fields and OAuth buttons
  - Any "Get API Key" links
  
  When desktop is connected, show ONLY:
  - Desktop connection status banner
  - Desktop provider/model info (read-only display)
  - The mode selector (Grader/Solver/Batch)
  - Student work and rubric areas
  - Run Assessment / Start Batch buttons

  **3c. Create a clean desktop-connected layout:**
  When `desktopConnected === true`, the provider config area should show a compact, read-only summary:
  ```html
  <div id="desktopProviderInfo" class="desktop-provider-info">
    <span class="provider-label">Provider:</span>
    <span id="desktopProviderName">—</span>
    <span class="model-label">Model:</span>
    <span id="desktopModelName">—</span>
    <span class="status-dot status-connected"></span>
  </div>
  ```
  Style this as a compact, single-line info bar.

  **3d. Ensure graceful transition between states:**
  When desktop disconnects mid-session (`desktopConnected` goes from `true` to `false`):
  - All auth UI should reappear
  - Provider dropdown should show the last selected provider
  - Config fields should repopulate

  **Must NOT do**:
  - Do NOT change the `setupDesktopListeners()` WebSocket/message logic
  - Do NOT change how `desktopConnected` flag is set
  - Do NOT change the desktop handshake protocol
  - Do NOT disable any buttons — use `display: none` only (hiding, not disabling)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI state management for connected/disconnected modes with layout changes
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for designing the clean desktop-connected layout

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — after Task 2
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Current Desktop Connection Infrastructure**:
  - `sidepanel.js:~1903` — `updateProviderUI(connected)` — Current function that toggles desktop/manual content visibility. This is the PRIMARY function to expand.
  - `sidepanel.js:~1974` — `setupDesktopListeners()` — Sets up message listeners from desktop app. DO NOT MODIFY.
  - `sidepanel.js:~2010` — `populateDesktopProviderDropdown(providers)` — Shows available providers from desktop. Reference for desktop provider info display.

  **HTML Elements to Target**:
  - `sidepanel.html` — `#desktopModeContent` div — Currently shown when desktop connected
  - `sidepanel.html` — `#manualModeContent` div — Currently shown when desktop NOT connected
  - `sidepanel.html` — `#desktopStatusBanner` — Desktop connection status display
  - `sidepanel.html` — `#manualModeBanner` — Manual mode info banner
  - `sidepanel.html` — `#providerConfigContainer` — Provider config form area
  - `sidepanel.html` — `#modelName` — Model selector dropdown

  **State Management**:
  - `sidepanel.js` — `desktopConnected` boolean flag
  - `sidepanel.js` — `currentProviderId` string — Last selected provider (needed for reconnection)

  **Acceptance Criteria**:

  - [ ] When `desktopConnected === true`: no API key inputs visible, no OAuth buttons visible, no Test Connection buttons visible
  - [ ] When `desktopConnected === true`: desktop provider/model info displayed as read-only
  - [ ] When `desktopConnected === false`: all provider config UI reappears (dropdown, config fields, buttons)
  - [ ] Mode selector remains visible in both states
  - [ ] Student work area and rubric area remain visible in both states
  - [ ] Run Assessment / Start Batch buttons remain visible in both states
  - [ ] Transitioning between connected/disconnected does not lose form data

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Desktop connected hides all auth UI
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, simulate desktop connection (set desktopConnected = true via JS evaluate)
    Steps:
      1. Execute in page context: set desktopConnected = true, call updateProviderUI(true)
      2. Wait 1s for DOM update
      3. Assert: #providerSelect (dropdown) is NOT visible
      4. Assert: no input[type="password"] visible (API keys)
      5. Assert: no button containing "Sign in" text visible (OAuth)
      6. Assert: no button containing "Test Connection" text visible
      7. Assert: #desktopProviderInfo IS visible with provider/model names
      8. Assert: mode selector IS still visible
      9. Screenshot: .sisyphus/evidence/task-3-desktop-connected.png
    Expected Result: Clean layout with only desktop info, mode selector, and work areas
    Evidence: .sisyphus/evidence/task-3-desktop-connected.png

  Scenario: Desktop disconnected restores all auth UI
    Tool: Playwright (playwright skill)
    Preconditions: Previously connected, now disconnecting
    Steps:
      1. Execute: set desktopConnected = true, call updateProviderUI(true)
      2. Wait 1s
      3. Execute: set desktopConnected = false, call updateProviderUI(false)
      4. Wait 1s
      5. Assert: #providerSelect (dropdown) IS visible
      6. Assert: provider config form IS visible
      7. Assert: #desktopProviderInfo is NOT visible
      8. Screenshot: .sisyphus/evidence/task-3-desktop-disconnected.png
    Expected Result: Full standalone UI restored
    Evidence: .sisyphus/evidence/task-3-desktop-disconnected.png

  Scenario: Mode selector works in both connection states
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. In disconnected state: click each mode (Grader/Solver/Batch) → assert body class changes
      2. Set desktopConnected = true → click each mode → assert body class still changes
      3. Screenshot: .sisyphus/evidence/task-3-modes-both-states.png
    Expected Result: Mode switching works regardless of desktop connection
    Evidence: .sisyphus/evidence/task-3-modes-both-states.png
  ```

  **Commit**: YES
  - Message: `feat(extension): hide auth UI when desktop app is connected`
  - Files: `sidepanel.html`, `sidepanel.js`
  - Pre-commit: Connected/disconnected state transitions work correctly

---

- [ ] 4. Mode Selector Polish: Add Icons + Final Spacing Adjustments

  **What to do**:

  **4a. Add Bootstrap Icons to mode selector labels:**
  The extension already loads Bootstrap Icons v1.11.1 via CDN (line 8 of `sidepanel.html`). Add icons to each mode button/label in the segmented control:
  - Grader: `<i class="bi bi-check2-square"></i>` (checkmark in box — grading)
  - Solver: `<i class="bi bi-lightbulb"></i>` (lightbulb — problem solving)
  - Batch: `<i class="bi bi-collection"></i>` (stacked items — batch processing)

  Update the mode selector HTML to include icons before the label text. Ensure the icon + text fit within the segmented control buttons without wrapping.

  **4b. Style mode selector icons:**
  ```css
  .mode-selector button i { margin-right: 4px; font-size: 0.85em; }
  ```
  Ensure icons inherit the button's text color and transition with the active state.

  **4c. General spacing tightening for narrow sidepanel:**
  Review and reduce excessive spacing throughout:
  - Card padding: ensure using `var(--spacing-2)` or `var(--spacing-3)` (NOT desktop's `var(--spacing-6)` which is too large for sidepanel)
  - Section gaps: reduce margins between cards if overly generous
  - Form element spacing: tighten label-to-input gaps
  - Keep everything readable — don't over-compress

  **4d. Final visual polish pass:**
  - Verify consistent use of CSS variables (no remaining hardcoded colors outside `:root`)
  - Check that all interactive elements have `:hover` and `:focus` states
  - Ensure scrolling works properly in the sidepanel when content exceeds viewport

  **Must NOT do**:
  - Do NOT use SVG icons or icon images — Bootstrap Icons CSS classes only
  - Do NOT change mode switcher from segmented control to another pattern
  - Do NOT rearrange the order of cards
  - Do NOT add animations beyond simple transitions

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual polish and spacing adjustments
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for making spacing and icon choices that look professional

  **Parallelization**:
  - **Can Run In Parallel**: NO (best done after all structural changes)
  - **Parallel Group**: Sequential — final task
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Mode Selector**:
  - `sidepanel.html` — Search for mode selector HTML (`.mode-selector` class, contains Grader/Solver/Batch buttons)
  - `sidepanel.html:352-380` — `.mode-selector` CSS styles
  - Bootstrap Icons reference: `https://icons.getbootstrap.com/` (v1.11.1 loaded via CDN at line 8)

  **Spacing Variables**:
  - `sidepanel.html:9-60` — CSS variable definitions including `--spacing-*` values
  - `ogre-desktop/src/app.css:1-50` — Desktop spacing for comparison (but DO NOT use desktop's larger spacing values — sidepanel needs to stay compact)

  **Icon Verification**:
  - Verify these icons exist in Bootstrap Icons v1.11.1:
    - `bi-check2-square` — ✅ exists
    - `bi-lightbulb` — ✅ exists
    - `bi-collection` — ✅ exists

  **Acceptance Criteria**:

  - [ ] Each mode button (Grader/Solver/Batch) displays an icon before the label text
  - [ ] Icons are visible in both dark and light themes
  - [ ] Icons inherit the active/inactive state colors of the segmented control
  - [ ] No text wrapping or overflow in mode selector buttons
  - [ ] Spacing feels compact but readable in sidepanel width (~400px)
  - [ ] No hardcoded color values remain outside `:root` / `[data-theme]` blocks (final grep check)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Mode selector icons render correctly
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Wait for .mode-selector to be visible
      2. Assert: Grader button contains <i> element with class "bi-check2-square"
      3. Assert: Solver button contains <i> element with class "bi-lightbulb"
      4. Assert: Batch button contains <i> element with class "bi-collection"
      5. Assert: no button text wrapping (button height is single-line)
      6. Screenshot: .sisyphus/evidence/task-4-mode-icons.png
    Expected Result: All three modes show icon + label, no wrapping
    Evidence: .sisyphus/evidence/task-4-mode-icons.png

  Scenario: Final visual verification — all 6 states (3 modes × 2 themes)
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Set dark theme
      2. Click Grader → screenshot: .sisyphus/evidence/task-4-final-dark-grader.png
      3. Click Solver → screenshot: .sisyphus/evidence/task-4-final-dark-solver.png
      4. Click Batch → screenshot: .sisyphus/evidence/task-4-final-dark-batch.png
      5. Set light theme
      6. Click Grader → screenshot: .sisyphus/evidence/task-4-final-light-grader.png
      7. Click Solver → screenshot: .sisyphus/evidence/task-4-final-light-solver.png
      8. Click Batch → screenshot: .sisyphus/evidence/task-4-final-light-batch.png
    Expected Result: All 6 visual states look polished and consistent
    Evidence: .sisyphus/evidence/task-4-final-*.png

  Scenario: No hardcoded colors remain
    Tool: Bash (grep)
    Steps:
      1. grep -nE "#[0-9a-fA-F]{3,8}" sidepanel.html | grep -v ":root" | grep -v "data-theme" → check results
      2. grep -nE "#[0-9a-fA-F]{3,8}" sidepanel.js → Assert: 0 matches outside comments
    Expected Result: All colors use CSS variables
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `style(extension): add mode icons and tighten sidepanel spacing`
  - Files: `sidepanel.html`, `sidepanel.js`
  - Pre-commit: All 6 visual states verified

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `style(extension): restyle buttons, cards, inputs to match desktop design system` | `sidepanel.html`, `sidepanel.js` | Visual screenshots dark+light, all 3 modes |
| 2 | `refactor(extension): replace provider tabs with compact dropdown selector` | `sidepanel.html`, `sidepanel.js` | Dropdown renders, switching works, no .tab-btn remnants |
| 3 | `feat(extension): hide auth UI when desktop app is connected` | `sidepanel.html`, `sidepanel.js` | Connected/disconnected transitions, auth UI hidden/shown |
| 4 | `style(extension): add mode icons and tighten sidepanel spacing` | `sidepanel.html`, `sidepanel.js` | 6 visual states, no hardcoded colors |

---

## Success Criteria

### Verification Commands
```bash
# Search for remaining hardcoded colors (should be minimal/zero outside :root)
grep -nE "#[0-9a-fA-F]{3,8}" sidepanel.html | grep -v ":root" | grep -v "data-theme"
grep -nE "#[0-9a-fA-F]{3,8}" sidepanel.js

# Search for remaining .tab-btn references (should be zero)
grep -n "tab-btn" sidepanel.html sidepanel.js

# Search for remaining hardcoded border-radius (should be zero in <style>)
grep -n "border-radius:.*px" sidepanel.html
```

### Final Checklist
- [ ] All buttons use desktop bordered style (not full-width colored)
- [ ] Primary action buttons use `.btn-primary` with accent color
- [ ] Cards have border + dark mode gradient top strip
- [ ] Inputs have darker background + focus ring
- [ ] Light mode radii are 8/12/20
- [ ] Provider tabs replaced with compact dropdown
- [ ] Provider status shown via indicator dot
- [ ] All auth UI hidden when desktop connected
- [ ] Clean desktop-connected layout with read-only provider info
- [ ] Mode icons visible and properly styled
- [ ] Both themes verified across all modes
- [ ] No hardcoded colors or radii outside CSS variable definitions
- [ ] No `.tab-btn` remnants in code
- [ ] All three modes (Grader/Solver/Batch) fully functional
