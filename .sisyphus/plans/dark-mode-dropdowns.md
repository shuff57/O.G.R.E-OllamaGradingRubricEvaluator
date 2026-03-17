# Fix Dark Mode Dropdown Menus

## TL;DR

> **Quick Summary**: Native `<select>` dropdown popups render with light OS chrome in dark mode because `color-scheme: dark` is missing from `app.css`. Add it, plus belt-and-suspenders `option` element styling.
> 
> **Deliverables**:
> - `color-scheme` CSS property added for both dark and light themes
> - Explicit `option` element background/color styling for both themes
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single task
> **Critical Path**: Task 1 → Done

---

## Context

### Original Request
"Drop down menus in dark mode are light colored and hard to read text"

### Interview Summary
**Key Discussions**:
- Immediate diagnosis: `color-scheme` CSS property missing from `ogre-desktop/src/app.css`
- 6 Svelte components use native `<select>` elements (RubricCard, ExtractionConfigPanel, ProviderSelector, BatchProfileSelector, SetupWizard, ProviderSettings)
- No custom dropdown components exist — all are native HTML `<select>`

**Research Findings**:
- `app.css` uses `:root` for dark mode (default) and `[data-theme="light"]` for light mode
- `color-scheme` property is absent from all CSS in the project
- Existing `[data-theme="dark"]` selector at line 345-347 provides explicit bg for inputs but doesn't affect dropdown popups
- `option` elements are completely unstyled

### Metis Review
**Identified Gaps** (addressed):
- **SetupWizard edge case**: First-run experience never sets `data-theme` attribute. Fix uses `:root` which always matches, so this is handled correctly.
- **Drawer has separate selects**: `drawer-injection.js` has 2 `<select>` elements with isolated CSS — excluded from scope (separate follow-up).
- **`[data-theme="dark"]` dead selector**: Line 345-347 only fires after visiting Settings. Pre-existing, not causing this bug — excluded from scope.

---

## Work Objectives

### Core Objective
Make native `<select>` dropdown popups respect the active theme by adding the `color-scheme` CSS property and explicit `option` element styling.

### Concrete Deliverables
- `ogre-desktop/src/app.css` updated with `color-scheme` property in both theme blocks + `option` styling

### Definition of Done
- [ ] Dropdown popups in dark mode have dark backgrounds with light text
- [ ] Dropdown popups in light mode have light backgrounds with dark text
- [ ] Existing tests pass: `npx vitest run` in `ogre-desktop/`

### Must Have
- `color-scheme: dark` in `:root {}` block
- `color-scheme: light` in `[data-theme="light"] {}` block
- Explicit `option` element `background-color` + `color` for both themes

### Must NOT Have (Guardrails)
- Do NOT modify any `.svelte` component files
- Do NOT modify `drawer-injection.js` (separate follow-up)
- Do NOT change existing CSS variable values or selector specificity
- Do NOT replace native `<select>` with custom dropdown components
- Do NOT add JavaScript for theme-dependent `color-scheme` switching
- Do NOT touch lines 345-347 (`[data-theme="dark"]` input rules)
- Do NOT add padding, font, border, or layout changes to `option` elements — only `background-color` and `color`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest in ogre-desktop)
- **Automated tests**: None needed — trivial CSS property addition
- **Framework**: vitest (existing)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CSS Verification**: Use Bash (grep/read) to confirm properties are present in app.css
- **Regression**: Use Bash (vitest) to confirm existing tests still pass

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single Task):
└── Task 1: Add color-scheme + option styling to app.css [quick]

Wave FINAL (After Task 1):
└── Task F1: Verify CSS properties present + test suite passes [quick]
```

### Dependency Matrix
- **Task 1**: None → F1
- **F1**: Task 1 → Done

### Agent Dispatch Summary
- **Wave 1**: 1 task — T1 → `quick`
- **FINAL**: 1 task — F1 → `quick`

---

## TODOs

- [x] 1. Add `color-scheme` property and `option` styling to app.css

  **What to do**:
  - Add `color-scheme: dark;` inside the `:root {}` block (after line 7, with the other top-level properties)
  - Add `color-scheme: light;` inside the `[data-theme="light"] {}` block (after line 101, with the other theme overrides)
  - Add `option` element styling for dark mode (after the existing `input, select, textarea` rule around line 343):
    ```css
    option {
      background-color: var(--color-bg-main);
      color: var(--color-text-primary);
    }
    ```
  - The `option` styling inherits theme variables automatically, so no separate light mode rule is needed

  **Must NOT do**:
  - Do not modify any component `<style>` blocks
  - Do not change existing CSS variable values
  - Do not add JS-based color-scheme switching
  - Do not style `option` elements beyond `background-color` and `color`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file, 4-line CSS addition with no logic complexity
  - **Skills**: []
    - No specialized skills needed for a trivial CSS edit
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: This is a bug fix, not a design task

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/app.css:3-95` — `:root {}` block where `color-scheme: dark` goes. Place it near line 7 after `--theme-name: 'dark';` for logical grouping with theme identity properties.
  - `ogre-desktop/src/app.css:100-162` — `[data-theme="light"] {}` block where `color-scheme: light` goes. Place it near line 101 after `--theme-name: 'light';`.
  - `ogre-desktop/src/app.css:333-353` — Existing `input, select, textarea` styling. Add `option` rule after line 353 to keep form element styles grouped together.

  **API/Type References**:
  - CSS `color-scheme` property: tells the browser which color schemes the element can be rendered in. Values: `dark`, `light`, `normal`.

  **WHY Each Reference Matters**:
  - Lines 3-95: The executor needs to know the exact `:root` block boundaries to place the property correctly
  - Lines 100-162: Same for the light theme override block
  - Lines 333-353: The executor needs to see the existing form element pattern to follow the same grouping convention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: color-scheme property present in dark mode root
    Tool: Bash (grep)
    Preconditions: app.css exists at ogre-desktop/src/app.css
    Steps:
      1. Run: grep -n "color-scheme" ogre-desktop/src/app.css
      2. Assert output contains "color-scheme: dark" within lines 3-95 (the :root block)
      3. Assert output contains "color-scheme: light" within lines 100-170 (the [data-theme="light"] block)
    Expected Result: Both lines present, correctly placed within their respective theme blocks
    Failure Indicators: grep returns no matches, or properties are outside their theme blocks
    Evidence: .sisyphus/evidence/task-1-color-scheme-grep.txt

  Scenario: option element styling present
    Tool: Bash (grep)
    Preconditions: app.css exists
    Steps:
      1. Run: grep -A 4 "^option" ogre-desktop/src/app.css
      2. Assert output contains "background-color: var(--color-bg-main)"
      3. Assert output contains "color: var(--color-text-primary)"
    Expected Result: option rule with both properties present
    Failure Indicators: grep returns no matches or missing properties
    Evidence: .sisyphus/evidence/task-1-option-styling-grep.txt

  Scenario: existing test suite still passes (regression)
    Tool: Bash (vitest)
    Preconditions: ogre-desktop dependencies installed
    Steps:
      1. Run: npx vitest run (in ogre-desktop/ directory)
      2. Assert exit code 0
      3. Assert output contains "Tests passed" or equivalent success message
    Expected Result: All existing tests pass with zero new failures
    Failure Indicators: Non-zero exit code, test failures in output
    Evidence: .sisyphus/evidence/task-1-vitest-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-color-scheme-grep.txt — grep output showing both color-scheme properties
  - [ ] task-1-option-styling-grep.txt — grep output showing option element styles
  - [ ] task-1-vitest-regression.txt — vitest run output confirming no regressions

  **Commit**: YES
  - Message: `fix(desktop): add color-scheme CSS for native dropdown dark mode support`
  - Files: `ogre-desktop/src/app.css`
  - Pre-commit: `npx vitest run` in `ogre-desktop/`

---

## Final Verification Wave

- [x] F1. **Regression + CSS Verification** — `quick`
  Run `npx vitest run` in `ogre-desktop/`. Grep `app.css` for `color-scheme: dark` in `:root` and `color-scheme: light` in `[data-theme="light"]`. Grep for `option` element styling with `background-color` and `color` properties. Verify no other files were modified: `git diff --name-only` should show only `ogre-desktop/src/app.css`.
  Output: `Tests [PASS/FAIL] | color-scheme dark [PRESENT/MISSING] | color-scheme light [PRESENT/MISSING] | option styling [PRESENT/MISSING] | Files changed [1/N] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Task 1**: `fix(desktop): add color-scheme CSS for native dropdown dark mode support` — `ogre-desktop/src/app.css`, `npx vitest run`

---

## Success Criteria

### Verification Commands
```bash
# Confirm color-scheme properties present
grep -n "color-scheme" ogre-desktop/src/app.css
# Expected: two lines — one with "dark" in :root, one with "light" in [data-theme="light"]

# Confirm option styling present  
grep -A 4 "^option" ogre-desktop/src/app.css
# Expected: option { background-color: var(--color-bg-main); color: var(--color-text-primary); }

# Regression test
cd ogre-desktop && npx vitest run
# Expected: all tests pass
```

### Final Checklist
- [ ] `color-scheme: dark` in `:root {}` — present
- [ ] `color-scheme: light` in `[data-theme="light"] {}` — present
- [ ] `option` element styled with theme-aware background + color
- [ ] No `.svelte` files modified
- [ ] No CSS variable values changed
- [ ] All existing tests pass
