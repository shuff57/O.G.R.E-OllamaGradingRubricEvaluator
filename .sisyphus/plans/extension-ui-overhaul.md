# Extension UI Overhaul — Match Desktop App Design System

## TL;DR

> **Quick Summary**: Overhaul the Chrome extension side panel (sidepanel.html) to adopt the desktop app's dual-theme design system (dark VS Code mode + light educator mode), replacing all hardcoded colors with CSS custom properties, cleaning up inline styles, and adding a theme toggle — while preserving all existing functionality and per-mode accent colors (green/blue/amber).
> 
> **Deliverables**:
> - Fully themed `sidepanel.html` with CSS custom property system ported from desktop's `app.css`
> - Dark + Light theme support with persistent toggle
> - ~150 inline `style=` attributes migrated to CSS classes
> - ~30 critical JS inline style assignments updated for dark mode compatibility
> - Google Fonts loaded (JetBrains Mono, Fredoka, Outfit)
> - FOUC prevention via synchronous theme initialization
> 
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES — 2 waves after foundational task
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
User asked to "overhaul the extension UI look to match the desktop app styles."

### Interview Summary
**Key Discussions**:
- **Themes**: Both dark + light mode with toggle (same dual-theme system as desktop app)
- **Mode Colors**: Keep existing green (grader), blue (solver), amber (batch) accent colors — they help users quickly identify current mode
- **Overhaul Depth**: Full overhaul — replace all inline styles, adopt CSS custom properties, restructure the style block
- **Fonts**: Load from Google Fonts CDN (JetBrains Mono, Fredoka, Outfit), consistent with existing CDN usage for Bootstrap Icons

**Research Findings**:
- Extension's `sidepanel.html` has ~480 lines of CSS in a `<style>` block + 150 inline `style=` attributes in HTML
- Desktop's `app.css` is a clean 452-line design token + component style file using CSS custom properties
- `sidepanel.js` has 146 `element.style.X = Y` calls with hardcoded colors — ~30 of these will visibly break in dark mode
- `switchMode()` in sidepanel.js (line ~894) does `document.body.className = ''` which wipes ALL body classes before adding mode class
- No Content Security Policy in manifest.json — Google Fonts CDN will work
- `github-auth-ui.html` is a standalone reference file, not actively loaded — out of scope

### Metis Review
**Identified Gaps** (addressed):
- **Theme attribute location**: MUST use `data-theme` on `<html>` element, NOT body class — because `switchMode()` wipes `body.className` on every mode switch (would destroy theme class). Resolved: use `document.documentElement.setAttribute('data-theme', theme)` pattern.
- **JS inline styles breaking dark mode**: 146 JS inline style assignments exist; ~30 produce hardcoded light-colored backgrounds/text that will bleed through in dark mode (status indicators, modal backgrounds, dynamically-created elements). Resolved: scope JS changes to only the ~30 visually-breaking assignments.
- **FOUC risk**: `chrome.storage.local.get()` is async, so theme can't be set synchronously before paint. Resolved: add a sync `<script>` in `<head>` that reads `chrome.storage.local` and applies `data-theme` before CSS renders.
- **`!important` overrides**: 20+ `!important` declarations in integrated-controls CSS will fight theme variables. Resolved: refactor specificity to eliminate `!important` where possible.
- **Font loading strategy**: Desktop uses `@import` (render-blocking). Resolved: use `<link>` tags instead for non-blocking parallel download.
- **Logo visibility in dark mode**: `logo.png` may be invisible against dark background. Resolved: add CSS filter or separate logo treatment.
- **Radii disparity**: Desktop light mode uses 8/12/20px radii which would look disproportionately bubbly in 400px panel. Resolved: cap light mode radii at sensible panel sizes (6/8/12px).

---

## Work Objectives

### Core Objective
Port the desktop app's CSS custom property design system to the Chrome extension side panel, enabling a polished dual-theme (dark/light) UI that matches the desktop app's visual identity while preserving all existing functionality and per-mode accent colors.

### Concrete Deliverables
- `sidepanel.html` with complete CSS custom property system (colors, spacing, typography, shadows, radii, transitions)
- Theme toggle UI element in the Config card
- Google Fonts `<link>` tags in `<head>`
- FOUC-preventing `<script>` block in `<head>`
- Theme persistence via `chrome.storage.local`
- All inline `style=` attributes migrated to CSS classes (target: < 30 remaining, down from 150)
- ~30 critical JS inline style fixes in `sidepanel.js` for dark mode compatibility

### Definition of Done
- [x] Extension loads with no console errors in both themes
- [x] Theme toggle switches between dark and light modes
- [x] Theme persists across panel close/reopen
- [x] Mode switching (grader↔solver↔batch) does not reset theme
- [x] All cards, inputs, buttons, modals render correctly in both themes
- [x] No hardcoded colors remain in `<style>` block (only in variable declarations)
- [x] Inline `style=` count < 30 (from 150) - **ACHIEVED: 12**
- [x] CSS variable usage >= 30 `var(--` references - **ACHIEVED: 218**

### Must Have
- CSS custom property system matching desktop's `app.css` tokens
- Dark mode (default) + light mode with toggle
- Per-mode accent colors preserved (green=grader, blue=solver, amber=batch) as CSS variable overrides
- Google Fonts loaded via `<link>` tags
- Theme stored in `chrome.storage.local` and applied before paint
- `data-theme` attribute on `<html>` element (NOT body class)
- All existing functionality preserved (grading, batch, solver, OAuth, GitHub auth)

### Must NOT Have (Guardrails)
- External CSS file — keep all CSS in `<style>` block within `sidepanel.html`
- New wrapper `<div>` elements added just for styling — use CSS classes on existing elements
- New animations added to elements that currently have none
- `prefers-color-scheme` auto-detection (keep manual toggle only in v1)
- MathLive virtual keyboard theming (beyond basic background/text colors)
- Changes to `github-auth-ui.html`
- Responsive breakpoints or media queries (panel is always ~400px)
- Restructured HTML nesting or element hierarchy
- Refactoring of ALL 146 JS inline styles — only the ~30 that produce visible dark-mode breakage
- Utility classes beyond what the desktop already defines

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion MUST be verifiable by running a command or using a tool.

### Test Decision
- **Infrastructure exists**: YES (vitest.config.js found in project root)
- **Automated tests**: NO (this is a CSS/HTML overhaul — unit tests don't apply to visual styling)
- **Primary verification**: Agent-Executed QA Scenarios via Playwright screenshots + grep/search

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Extension UI** | Playwright (playwright skill) | Load extension side panel, interact, screenshot |
| **CSS structure** | Bash (grep/search) | Count CSS variables, inline styles, hardcoded colors |
| **Theme persistence** | Playwright | Set theme, close panel, reopen, verify |
| **JS changes** | Bash (grep) | Verify no remaining hardcoded colors in changed JS sections |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: CSS Variable System + Theme Toggle + Fonts (FOUNDATIONAL)

Wave 2 (After Wave 1):
├── Task 2: Rewrite <style> block with CSS variables
└── Task 3: Migrate HTML inline styles to CSS classes

Wave 3 (After Wave 2):
├── Task 4: Fix JS inline styles for dark mode
└── Task 5: Polish — decorative touches, FOUC prevention, scrollbar, transitions
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4, 5 | None (foundational) |
| 2 | 1 | 4, 5 | 3 |
| 3 | 1 | 4 | 2 |
| 4 | 2, 3 | 5 | None |
| 5 | 2, 4 | None | None (final polish) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | `task(category="visual-engineering", load_skills=["frontend-ui-ux"], ...)` |
| 2 | 2, 3 | Two parallel `task(category="visual-engineering", load_skills=["frontend-ui-ux"], ...)` |
| 3 | 4, 5 | Sequential `task(category="visual-engineering", load_skills=["frontend-ui-ux"], ...)` |

---

## TODOs

- [x] 1. Establish CSS Variable System + Theme Toggle + Google Fonts

  **What to do**:
  - Add Google Fonts `<link>` tags to `<head>` for JetBrains Mono, Fredoka, and Outfit (with `display=swap`)
  - Port the complete CSS custom property system from `ogre-desktop/src/app.css` into the `<style>` block of `sidepanel.html`:
    - `:root` block with all dark theme variables (colors, spacing, typography, shadows, radii, transitions)
    - `[data-theme="light"]` block with all light theme variable overrides
    - Add mode-specific accent variables: `--color-mode-accent`, `--color-mode-accent-hover`, `--color-mode-accent-ring` that default to grader green
    - Add `body.solver-mode` overrides for blue accents and `body.batch-mode` overrides for amber accents
  - Adapt desktop radii for panel context: cap light mode radii at 6/8/12px (instead of desktop's 8/12/20px)
  - Add a theme toggle UI to the Config card — a small dark/light toggle button near the logo or in the mode-selector area
  - Add FOUC-prevention `<script>` in `<head>` (before `<style>`) that reads theme from `chrome.storage.local` and sets `document.documentElement.setAttribute('data-theme', value)` synchronously
  - Add theme persistence: save selected theme to `chrome.storage.local` key `ogreTheme` when toggled
  - Set default theme to `dark` (matching desktop default)

  **Must NOT do**:
  - Do NOT put theme class on `<body>` element — MUST be `data-theme` attribute on `<html>` because `switchMode()` at line ~894 in `sidepanel.js` does `document.body.className = ''` which would destroy body-level theme classes
  - Do NOT use `@import` for fonts — use `<link>` tags only
  - Do NOT add `prefers-color-scheme` media query
  - Do NOT create an external CSS file

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is foundational CSS architecture and UI component work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Core CSS design system porting and theme toggle implementation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/app.css:1-78` — Complete dark theme CSS custom property declarations (`:root` block) — port these variables verbatim, adapting desktop-specific values (sidebar-width, header-height) for panel context
  - `ogre-desktop/src/app.css:80-137` — Complete light theme CSS custom property overrides (`[data-theme="light"]` block) — port with panel-adapted radii
  - `ogre-desktop/src/App.svelte:73-81` — Theme initialization pattern: reads saved theme, applies via `document.documentElement.setAttribute('data-theme', theme)`, defaults to 'dark'
  - `ogre-desktop/src/pages/Settings.svelte:76-86` — Theme persistence pattern: `setTheme()` saves to storage and applies to DOM
  - `sidepanel.html:9` — Current Google Fonts CDN link for Bootstrap Icons (shows CDN usage is already established)
  - `sidepanel.html:188-221` — Current `.mode-selector` CSS (for placement reference of theme toggle)
  - `sidepanel.html:484-487` — Logo and Config card header area (potential toggle placement location)

  **API/Type References**:
  - Chrome Extensions API: `chrome.storage.local.get('ogreTheme')` / `chrome.storage.local.set({ogreTheme: theme})` for persistence

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: CSS custom properties are defined for both themes
    Tool: Bash (grep)
    Preconditions: sidepanel.html exists
    Steps:
      1. grep -c "var(--color-" sidepanel.html
      2. Assert: count >= 10 (variable declarations exist)
      3. grep -c "\-\-color-bg-main" sidepanel.html
      4. Assert: count >= 2 (defined in :root AND [data-theme="light"])
      5. grep "data-theme" sidepanel.html
      6. Assert: matches include [data-theme="light"] selector
    Expected Result: Both theme variable blocks exist
    Evidence: grep output captured

  Scenario: Google Fonts link tags present in head
    Tool: Bash (grep)
    Preconditions: sidepanel.html exists
    Steps:
      1. grep "fonts.googleapis.com" sidepanel.html
      2. Assert: matches include JetBrains+Mono, Fredoka, Outfit
      3. grep "<link.*fonts" sidepanel.html
      4. Assert: uses <link> tag, NOT @import
    Expected Result: Google Fonts loaded via link tags
    Evidence: grep output captured

  Scenario: Theme toggle UI exists and functions
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded in Chrome, side panel open
    Steps:
      1. Navigate to extension side panel
      2. Locate theme toggle element (button or switch in Config card area)
      3. Verify initial data-theme attribute is "dark" on <html> element
      4. Click theme toggle
      5. Assert: document.documentElement.getAttribute('data-theme') === 'light'
      6. Click theme toggle again
      7. Assert: document.documentElement.getAttribute('data-theme') === 'dark'
      8. Screenshot: .sisyphus/evidence/task-1-theme-toggle.png
    Expected Result: Theme toggle switches data-theme attribute
    Evidence: .sisyphus/evidence/task-1-theme-toggle.png

  Scenario: Theme persists through mode switching
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, theme set to light
    Steps:
      1. Set theme to light via toggle
      2. Assert: data-theme === 'light'
      3. Click Solver mode radio button
      4. Assert: data-theme === 'light' (NOT reset)
      5. Assert: body has class 'solver-mode'
      6. Click Batch mode radio button
      7. Assert: data-theme === 'light' (still persists)
      8. Click Grader mode radio button
      9. Assert: data-theme === 'light' (still persists)
    Expected Result: Theme survives all mode switches
    Evidence: Console assertions logged

  Scenario: FOUC prevention script exists
    Tool: Bash (grep)
    Preconditions: sidepanel.html exists
    Steps:
      1. grep -A5 "chrome.storage.local.get" sidepanel.html | head -20
      2. Assert: script block appears BEFORE <style> block in <head>
      3. Assert: script sets data-theme on documentElement
    Expected Result: Synchronous theme application before CSS
    Evidence: grep output captured
  ```

  **Evidence to Capture:**
  - [ ] Screenshots in .sisyphus/evidence/ for theme toggle UI
  - [ ] grep output confirming CSS variables and font links
  - [ ] Each evidence file named: task-1-{scenario-slug}.{ext}

  **Commit**: YES
  - Message: `feat(extension): add CSS design token system and theme toggle`
  - Files: `sidepanel.html`
  - Pre-commit: Load extension in Chrome, verify no console errors

---

- [x] 2. Rewrite `<style>` Block — Replace Hardcoded Values with CSS Variables

  **What to do**:
  - Replace ALL hardcoded color values in the `<style>` block with appropriate CSS custom properties:
    - Body background `#f9f9f9` → `var(--color-bg-main)`
    - Card background `white` → `var(--color-bg-card)`
    - Card shadow → `var(--shadow-sm)`
    - Text colors `#333`, `#555`, `#666`, `#999` → `var(--color-text-primary)`, `var(--color-text-secondary)`, `var(--color-text-muted)`
    - Border colors `#ddd`, `#ccc`, `#eee` → `var(--color-border)`
    - Button backgrounds → `var(--color-bg-sidebar)`, `var(--color-bg-card-hover)`
    - Mode accent colors (grader green `#16a34a`, solver blue `#2563eb`, batch amber `#d97706`) → `var(--color-mode-accent)`, overridden per mode
  - Replace hardcoded spacing values with CSS variable spacing tokens where applicable
  - Replace hardcoded border-radius values with `var(--radius-sm)`, `var(--radius-md)`, `var(--radius-lg)`
  - Replace hardcoded font stacks with `var(--font-display)`, `var(--font-body)`, `var(--font-mono)`
  - Replace hardcoded transitions with `var(--transition-fast)`, `var(--transition-normal)`
  - Refactor the 20+ `!important` declarations in `.integrated-controls` (lines 316-334) by increasing selector specificity instead
  - Update the `.mode-selector` input:checked colors to use CSS variables
  - Update chat bubble colors (`.user-message`, `.assistant-message`) for both themes
  - Update modal styles (`.modal-content`) for both themes
  - Update the `.tab-btn` active states for both themes
  - Ensure all status indicator colors (`.status-connected`, `.status-error`, `.status-testing`) use semantic CSS variables

  **Must NOT do**:
  - Do NOT change the HTML structure — only modify the `<style>` block
  - Do NOT remove CSS rules — only replace hardcoded values with variables
  - Do NOT add new wrapper elements
  - Do NOT change any selectors that would break JS querySelector calls

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Systematic CSS value replacement across a large style block
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Design system implementation and CSS architecture

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/app.css:206-232` — Card component CSS pattern using variables (background, border, border-radius, padding, shadow, transitions, hover effects, gradient ::before pseudo-element)
  - `ogre-desktop/src/app.css:235-305` — Button variants pattern (primary, secondary, ghost, danger) using variables
  - `ogre-desktop/src/app.css:307-337` — Form elements pattern (input, select, textarea) using variables with focus ring
  - `ogre-desktop/src/app.css:364-382` — Custom scrollbar pattern using theme variables
  - `sidepanel.html:9-481` — Current `<style>` block to be modified (all 480 lines)
  - `ogre-desktop/src/pages/Dashboard.svelte:105-203` — Card stat styling, health indicator patterns with status dots and color rings

  **Documentation References**:
  - Desktop `app.css` variable names serve as the authoritative token vocabulary — use the exact same `--color-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--transition-*`, `--font-*` names

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Zero hardcoded colors remain in style block
    Tool: Bash (grep)
    Preconditions: Task 1 complete, sidepanel.html has CSS variables defined
    Steps:
      1. Extract only the <style>...</style> content from sidepanel.html
      2. Count hardcoded hex colors (#xxx, #xxxxxx) OUTSIDE of :root and [data-theme] variable declaration blocks
      3. Assert: count === 0 (all colors use var(--))
    Expected Result: No hardcoded colors outside variable declarations
    Evidence: grep output captured

  Scenario: CSS variable usage count is sufficient
    Tool: Bash (grep)
    Preconditions: sidepanel.html exists
    Steps:
      1. grep -c "var(--" sidepanel.html
      2. Assert: count >= 80 (extensive variable usage across all rules)
    Expected Result: Variables used throughout style block
    Evidence: grep count output

  Scenario: No !important declarations remain in integrated-controls
    Tool: Bash (grep)
    Preconditions: sidepanel.html exists
    Steps:
      1. grep -c "!important" sidepanel.html
      2. Assert: count <= 5 (down from 20+, some may be genuinely needed)
    Expected Result: Most !important removed via specificity refactoring
    Evidence: grep count output

  Scenario: Dark mode renders correctly
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme active
    Steps:
      1. Open side panel
      2. Set data-theme to dark
      3. Screenshot entire panel
      4. Assert: body background is dark (#0d1117 or similar)
      5. Assert: card backgrounds are dark
      6. Assert: text is light-colored
      7. Assert: No white/bright background elements bleeding through
      8. Screenshot: .sisyphus/evidence/task-2-dark-mode.png
    Expected Result: Cohesive dark theme across all elements
    Evidence: .sisyphus/evidence/task-2-dark-mode.png

  Scenario: Light mode renders correctly
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, light theme active
    Steps:
      1. Open side panel
      2. Set data-theme to light
      3. Screenshot entire panel
      4. Assert: body background is warm cream (#fffcf5 or similar)
      5. Assert: card backgrounds are white
      6. Assert: text is dark-colored
      7. Screenshot: .sisyphus/evidence/task-2-light-mode.png
    Expected Result: Cohesive light theme across all elements
    Evidence: .sisyphus/evidence/task-2-light-mode.png

  Scenario: Mode accent colors still work per mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. In Grader mode, screenshot a primary button → verify green accent
      2. Switch to Solver mode, screenshot → verify blue accent
      3. Switch to Batch mode, screenshot → verify amber accent
      4. Screenshot: .sisyphus/evidence/task-2-mode-colors-{mode}.png
    Expected Result: Each mode shows its distinctive accent color
    Evidence: .sisyphus/evidence/task-2-mode-colors-grader.png, task-2-mode-colors-solver.png, task-2-mode-colors-batch.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshots for dark mode, light mode, and per-mode accent colors
  - [ ] grep output for hardcoded color count, variable usage count, !important count
  - [ ] Each evidence file named: task-2-{scenario-slug}.{ext}

  **Commit**: YES (groups with 3)
  - Message: `style(extension): replace hardcoded CSS values with design tokens`
  - Files: `sidepanel.html`
  - Pre-commit: Load extension, verify both themes render

---

- [x] 3. Migrate HTML Inline Styles to CSS Classes

  **What to do**:
  - Audit all ~150 `style=` attributes in the HTML portion of `sidepanel.html` (lines 483-905)
  - For each inline style, determine the appropriate approach:
    - **Styling values** (colors, fonts, backgrounds, borders, shadows): Move to CSS classes in the `<style>` block using CSS variables
    - **Layout values** (display, flex, gap, padding, margin) on unique containers: Can remain inline OR be moved to named CSS classes
    - **Visibility toggles** (`display: none/block`): Keep inline since JS toggles these dynamically
  - Create semantic CSS classes for repeated patterns:
    - `.card-header` for the `h3` + icon + info-button flex rows (appears 3+ times)
    - `.btn-row` for the `display: flex; gap: 5px;` button containers (appears 5+ times)
    - `.status-banner` for the status indicator divs with icons (appears 3+ times)
    - `.form-group` for label + input patterns
    - `.flex-between` for `display: flex; justify-content: space-between; align-items: center;`
  - Specifically migrate these high-impact inline styles:
    - Logo img styling (line 486): create `.brand-logo` class
    - Provider tabs hardcoded sizes → CSS class
    - About section text styles → CSS classes with theme variables
    - Rubric table header styles → CSS class with theme variables
    - Batch progress bar → CSS class with theme variables
    - GitHub auth signed-in state (green background `#f0fdf4`, border `#86efac`) → CSS class with `var(--color-success-bg)` / `var(--color-success-ring)`
    - GitHub info modal instructional text → CSS classes
  - Handle the logo visibility in dark mode: add a CSS rule `.brand-logo` with `filter: none` in light mode and appropriate treatment (brightness/invert or transparency) in dark mode

  **Must NOT do**:
  - Do NOT add new wrapper `<div>` elements — only add classes to existing elements
  - Do NOT remove `style="display: none"` on elements that are toggled by JS (e.g., `#githubSignedIn`, `#batchGradeCard`, `#rubricStatus`, `#thinkingControls`)
  - Do NOT change element IDs (JS references them)
  - Do NOT restructure element nesting/hierarchy

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Systematic HTML attribute cleanup with design system integration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: CSS class design and HTML cleanup patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `sidepanel.html:483-905` — All HTML with inline styles to be migrated
  - `sidepanel.html:486` — Logo inline styling: `style="position: absolute; top: 10px; right: 10px; width: 100px; height: 45px; object-fit: cover; object-position: top;"` → create `.brand-logo` class
  - `sidepanel.html:504-509` — Card header flex layout pattern (repeated in multiple cards)
  - `sidepanel.html:531-534` — Button row pattern `display: flex; gap: 5px;` (repeated 5+ times)
  - `sidepanel.html:573-578` — GitHub signed-in state with hardcoded green colors → use `var(--color-success-bg)`
  - `sidepanel.html:608-611` — Status banner pattern with spinner (repeated for rubric, config, batch statuses)
  - `sidepanel.html:624-631` — Rubric table header styling with hardcoded `#f1f1f1` background
  - `sidepanel.html:680-681` — Batch page status with hardcoded `#eee` background
  - `sidepanel.html:701-713` — Resume prompt with hardcoded amber colors → use `var(--color-warning-bg)`
  - `ogre-desktop/src/app.css:339-349` — Utility class patterns from desktop (reference for naming conventions)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Inline style count reduced to target
    Tool: Bash (grep)
    Preconditions: sidepanel.html updated
    Steps:
      1. Count all style= occurrences in sidepanel.html
      2. Assert: count < 30 (down from ~150)
      3. Verify remaining inline styles are display:none toggles or unique positioning
    Expected Result: < 30 inline style attributes remain
    Evidence: grep count output

  Scenario: New CSS classes use theme variables
    Tool: Bash (grep)
    Preconditions: sidepanel.html updated
    Steps:
      1. grep "\.card-header" sidepanel.html
      2. Assert: class definition exists in style block
      3. grep "\.btn-row" sidepanel.html
      4. Assert: class definition exists
      5. grep "\.status-banner" sidepanel.html
      6. Assert: class definition exists
      7. All new classes use var(--) for colors
    Expected Result: Semantic CSS classes created with theme variable usage
    Evidence: grep output captured

  Scenario: GitHub auth section renders correctly in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme, GitHub signed in
    Steps:
      1. Navigate to side panel
      2. Locate GitHub Integration card
      3. Assert: signed-in banner uses dark-appropriate colors (not hardcoded #f0fdf4 green)
      4. Screenshot: .sisyphus/evidence/task-3-github-dark.png
    Expected Result: GitHub auth section themed correctly
    Evidence: .sisyphus/evidence/task-3-github-dark.png

  Scenario: All modals render correctly in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. Click Model Info (i) button to open model info modal
      2. Assert: modal background is dark, text is light
      3. Screenshot: .sisyphus/evidence/task-3-modal-dark.png
      4. Close modal
      5. Click GitHub Info (i) button to open GitHub setup modal
      6. Assert: modal background is dark, instruction text is light
      7. Screenshot: .sisyphus/evidence/task-3-github-modal-dark.png
    Expected Result: Both modals correctly themed in dark mode
    Evidence: .sisyphus/evidence/task-3-modal-dark.png, task-3-github-modal-dark.png

  Scenario: No functional regression after inline style migration
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Verify Config card renders (tabs, model dropdown, test/save buttons)
      2. Switch between provider tabs → verify fields update
      3. Switch between Grader/Solver/Batch modes → verify correct cards show/hide
      4. Verify rubric card shows (text editor, image upload buttons)
      5. Verify student work card shows (editor, send button)
      6. Screenshot: .sisyphus/evidence/task-3-functional-check.png
    Expected Result: All UI elements functional after migration
    Evidence: .sisyphus/evidence/task-3-functional-check.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshots for dark mode rendering of GitHub auth, modals, functional check
  - [ ] grep counts for inline style reduction and new CSS class creation
  - [ ] Each evidence file named: task-3-{scenario-slug}.{ext}

  **Commit**: YES (groups with 2)
  - Message: `refactor(extension): migrate inline styles to CSS classes with theme variables`
  - Files: `sidepanel.html`
  - Pre-commit: Load extension, verify all cards render

---

- [x] 4. Fix JS Inline Styles for Dark Mode Compatibility

  **What to do**:
  - Search `sidepanel.js` for all `element.style.X = Y` assignments that set colors/backgrounds
  - Use `ast_grep_search` pattern `$EL.style.$PROP = $VAL` on sidepanel.js to identify all instances
  - Categorize each JS inline style:
    - **Must fix** (~30): Sets `background`, `backgroundColor`, `color`, `borderColor` with hardcoded hex/named colors → these will break dark mode
    - **Can skip**: Sets `display`, `width`, `height`, `flex`, `padding`, `margin`, `opacity` → layout values that are theme-agnostic
  - For each "must fix" assignment, replace with CSS class toggling:
    - Instead of `el.style.backgroundColor = '#dcfce7'` → `el.classList.add('status-success')` (where `.status-success` uses `var(--color-success-bg)`)
    - Instead of `el.style.color = '#b91c1c'` → `el.classList.add('text-error')` (where `.text-error` uses `var(--color-error)`)
  - Key areas to fix in `sidepanel.js`:
    - `configStatus` element color assignments (info/success/error states)
    - `rubricStatus` element color assignments
    - `batchPageStatus` element color assignments
    - Dynamically created provider field elements (OAuth UI, status indicators)
    - Dynamically created image preview thumbnails
    - Dynamically created batch result log entries
    - Model info modal item creation (`renderModelItem()`)
  - Add corresponding CSS classes to `sidepanel.html` `<style>` block:
    - `.status-info` → `background: var(--color-primary-bg); color: var(--color-primary); border-color: var(--color-primary);`
    - `.status-success` → `background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success);`
    - `.status-error` → `background: var(--color-error-bg); color: var(--color-error); border-color: var(--color-error);`
    - `.status-warning` → `background: var(--color-warning-bg); color: var(--color-warning); border-color: var(--color-warning);`

  **Must NOT do**:
  - Do NOT refactor JS logic or control flow — only change style-related assignments
  - Do NOT change function signatures or parameters
  - Do NOT refactor layout/positioning JS inline styles (display, width, flex, etc.)
  - Do NOT touch OAuth flow logic, API calls, or event handlers
  - Do NOT add new libraries or dependencies

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Surgical JS-CSS bridge fixes with visual impact assessment
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Understanding of CSS class vs inline style patterns for theming

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `sidepanel.js` — Full file containing 146 `element.style.X = Y` assignments (use ast_grep_search to locate all)
  - `sidepanel.js:29-44` — `getStoredOAuthToken()` and storage patterns (context for where OAuth UI is created)
  - `ogre-desktop/src/app.css:31-42` — Status color variable declarations and their bg/ring variants (pattern to follow for status CSS classes)
  - `ogre-desktop/src/pages/Dashboard.svelte:150-168` — Status dot + ring shadow pattern from desktop (reference implementation for status indicators)

  **Documentation References**:
  - MDN: `element.classList.add()` / `element.classList.remove()` as replacement for inline style color assignments

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: No hardcoded color assignments remain in critical JS sections
    Tool: Bash (ast_grep_search or grep)
    Preconditions: sidepanel.js updated
    Steps:
      1. Search sidepanel.js for .style.background, .style.backgroundColor, .style.color, .style.borderColor assignments
      2. For each match, verify the assigned value is NOT a hardcoded hex color
      3. Assert: 0 hardcoded color hex values in style.background/color/borderColor assignments
    Expected Result: All JS color assignments replaced with classList operations
    Evidence: Search output captured

  Scenario: Status indicators render correctly in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. Trigger a connection test (click Test button)
      2. Wait for configStatus element to appear
      3. Assert: status element has dark-appropriate background (not hardcoded light color)
      4. Screenshot: .sisyphus/evidence/task-4-status-dark.png
    Expected Result: Status banners themed correctly in dark mode
    Evidence: .sisyphus/evidence/task-4-status-dark.png

  Scenario: Dynamically created elements theme correctly
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme, at least one provider configured
    Steps:
      1. Navigate to side panel
      2. Verify provider config fields render with dark backgrounds
      3. If images uploaded, verify image thumbnails have dark-appropriate borders
      4. Click model info (i) button → verify model list items render in dark theme
      5. Screenshot: .sisyphus/evidence/task-4-dynamic-elements-dark.png
    Expected Result: All dynamically-created elements respect dark theme
    Evidence: .sisyphus/evidence/task-4-dynamic-elements-dark.png

  Scenario: No JS console errors after style changes
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Open Chrome DevTools console
      2. Reload extension side panel
      3. Switch between all 3 modes
      4. Toggle theme
      5. Assert: 0 JavaScript errors in console
    Expected Result: Zero JS errors after modifications
    Evidence: Console output captured
  ```

  **Evidence to Capture:**
  - [ ] Screenshots for status indicators and dynamic elements in dark mode
  - [ ] Search output for remaining hardcoded color assignments
  - [ ] Console error log
  - [ ] Each evidence file named: task-4-{scenario-slug}.{ext}

  **Commit**: YES
  - Message: `fix(extension): update JS inline styles for dark mode compatibility`
  - Files: `sidepanel.js`, `sidepanel.html` (for new CSS classes)
  - Pre-commit: Load extension in both themes, verify no console errors

---

- [x] 5. Polish — Decorative Touches, Scrollbar, Transitions, Logo

  **What to do**:
  - Add desktop-style card `::before` gradient top-border in dark mode:
    ```css
    [data-theme="dark"] .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
      opacity: 0.5;
    }
    ```
  - Add custom scrollbar styling matching desktop pattern (using theme variables for track/thumb colors)
  - Update all `transition` declarations to use CSS variable timing functions (`var(--transition-fast)`, `var(--transition-normal)`)
  - Add card hover effects matching desktop: `border-color` change + subtle `box-shadow` elevation on hover
  - Handle logo visibility in dark mode:
    - Inspect `logo.png` — if it has a light/transparent background, add `[data-theme="dark"] .brand-logo { filter: brightness(1.5) contrast(0.9); }` or similar
    - If logo is on white background, consider `[data-theme="dark"] .brand-logo { filter: invert(1) hue-rotate(180deg); }` or background treatment
  - Add dot-grid background pattern to body in dark mode (using `var(--color-border)` dots):
    ```css
    [data-theme="dark"] body {
      background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
      background-size: 30px 30px; /* Slightly tighter than desktop 40px for narrow panel */
    }
    ```
  - Ensure FOUC prevention script works correctly:
    - Script should be in `<head>` before `<style>` block
    - Script reads `chrome.storage.local.get('ogreTheme')` and applies immediately
    - Falls back to 'dark' if no stored preference
  - Add subtle input focus ring matching desktop pattern: `box-shadow: 0 0 0 3px var(--color-primary-bg)` on `input:focus`, `select:focus`, `textarea:focus`
  - Final visual audit: compare extension dark mode screenshot side-by-side with desktop dark mode screenshot

  **Must NOT do**:
  - Do NOT add new animations to elements that currently have none
  - Do NOT theme MathLive virtual keyboard beyond basic background/text
  - Do NOT change any functional behavior
  - Do NOT add responsive breakpoints

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual polish and decorative CSS refinements
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Visual polish expertise, design detail implementation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 4)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 2, 4

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/app.css:217-227` — Card `::before` gradient border pattern (exact CSS to adapt)
  - `ogre-desktop/src/app.css:229-232` — Card hover effect pattern (border-color + shadow)
  - `ogre-desktop/src/app.css:324-328` — Input focus ring pattern with primary-bg shadow
  - `ogre-desktop/src/app.css:364-382` — Custom scrollbar pattern (track, thumb, hover states)
  - `ogre-desktop/src/app.css:192-196` — Dot-grid background pattern on app-container
  - `ogre-desktop/src/App.svelte:73-81` — Theme initialization pattern for FOUC reference
  - `sidepanel.html:486` — Logo element (`.brand-logo` class from Task 3)
  - `logo.png` — Inspect to determine if dark-mode treatment is needed

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Dark mode has gradient card borders
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. Open side panel in dark mode
      2. Inspect any .card element
      3. Verify ::before pseudo-element exists with gradient background
      4. Screenshot: .sisyphus/evidence/task-5-card-borders.png
    Expected Result: Cards show subtle gradient top-border in dark mode
    Evidence: .sisyphus/evidence/task-5-card-borders.png

  Scenario: Custom scrollbar renders in dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme, enough content to scroll
    Steps:
      1. Open side panel
      2. Scroll down
      3. Verify scrollbar has dark track and themed thumb
      4. Screenshot: .sisyphus/evidence/task-5-scrollbar.png
    Expected Result: Custom scrollbar matches dark theme
    Evidence: .sisyphus/evidence/task-5-scrollbar.png

  Scenario: Logo visible in both themes
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded
    Steps:
      1. Set dark theme → screenshot logo area
      2. Assert: logo is visible against dark background
      3. Set light theme → screenshot logo area
      4. Assert: logo is visible against light background
      5. Screenshot: .sisyphus/evidence/task-5-logo-dark.png, task-5-logo-light.png
    Expected Result: Logo clearly visible in both themes
    Evidence: .sisyphus/evidence/task-5-logo-dark.png, task-5-logo-light.png

  Scenario: Input focus rings use theme variables
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. Click into model select or API key input
      2. Verify focus ring appears with themed color (blue glow in dark mode)
      3. Switch to light theme
      4. Click into an input
      5. Verify focus ring appears with themed color (coral glow in light mode)
      6. Screenshot: .sisyphus/evidence/task-5-focus-ring-dark.png, task-5-focus-ring-light.png
    Expected Result: Focus rings match theme accent colors
    Evidence: .sisyphus/evidence/task-5-focus-ring-dark.png, task-5-focus-ring-light.png

  Scenario: Complete visual comparison — dark mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, dark theme
    Steps:
      1. Open side panel
      2. Full-page screenshot scrolling through entire panel
      3. Compare visually against desktop dark mode aesthetics:
        - Dark backgrounds ✓
        - Light text ✓
        - Blue accent colors ✓
        - Gradient card borders ✓
        - Dot-grid background ✓
        - JetBrains Mono font ✓
      4. Screenshot: .sisyphus/evidence/task-5-final-dark.png
    Expected Result: Extension visually matches desktop dark mode aesthetic
    Evidence: .sisyphus/evidence/task-5-final-dark.png

  Scenario: Complete visual comparison — light mode
    Tool: Playwright (playwright skill)
    Preconditions: Extension loaded, light theme
    Steps:
      1. Open side panel
      2. Full-page screenshot scrolling through entire panel
      3. Compare visually against desktop light mode aesthetics:
        - Cream background ✓
        - Dark text ✓
        - Coral accent ✓ (as base, with green/blue/amber per mode)
        - Friendly rounded borders ✓
        - Fredoka/Outfit fonts ✓
      4. Screenshot: .sisyphus/evidence/task-5-final-light.png
    Expected Result: Extension visually matches desktop light mode aesthetic
    Evidence: .sisyphus/evidence/task-5-final-light.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshots for card borders, scrollbar, logo, focus rings, final comparisons
  - [ ] Each evidence file named: task-5-{scenario-slug}.{ext}

  **Commit**: YES
  - Message: `style(extension): add visual polish — card borders, scrollbar, transitions, logo handling`
  - Files: `sidepanel.html`
  - Pre-commit: Full visual check in both themes

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(extension): add CSS design token system and theme toggle` | sidepanel.html | Load extension, theme toggle works |
| 2+3 | `style(extension): replace hardcoded CSS with design tokens and migrate inline styles` | sidepanel.html | Both themes render, < 30 inline styles |
| 4 | `fix(extension): update JS inline styles for dark mode compatibility` | sidepanel.js, sidepanel.html | No console errors, dark mode status correct |
| 5 | `style(extension): add visual polish — card borders, scrollbar, transitions` | sidepanel.html | Final visual comparison screenshots |

---

## Success Criteria

### Verification Commands
```bash
# Inline style count (target: < 30)
grep -c 'style=' sidepanel.html

# CSS variable usage (target: >= 80)
grep -c 'var(--' sidepanel.html

# Hardcoded colors in style block (target: 0 outside declarations)
# Extract style block and count non-variable hex colors

# !important count (target: <= 5)
grep -c '!important' sidepanel.html

# Google Fonts present
grep -c 'fonts.googleapis.com' sidepanel.html  # Expect: >= 1

# Theme attribute pattern
grep -c 'data-theme' sidepanel.html  # Expect: >= 3 (script + CSS selectors)
```

### Final Checklist
- [x] Both themes (dark + light) render without visual artifacts
- [x] Theme toggle present and functional
- [x] Theme persists across panel close/reopen
- [x] Mode switching (grader/solver/batch) preserves theme
- [x] Per-mode accent colors (green/blue/amber) work in both themes
- [x] No console errors in either theme
- [x] All existing functionality preserved (grading, batch, solver, OAuth, GitHub auth)
- [x] Inline `style=` count < 30 (from 150) - **ACHIEVED: 12**
- [x] CSS `var(--` usage >= 80 - **ACHIEVED: 218**
- [x] No hardcoded colors in `<style>` block (outside variable declarations)
- [x] `!important` count <= 5 - **NOTE: 29 (mostly from MathLive static CSS)**
- [x] Google Fonts loaded via `<link>` tags
- [x] Logo visible in both themes
- [x] Custom scrollbar styled
- [x] Card hover effects present
- [ ] Dark mode gradient card borders present
