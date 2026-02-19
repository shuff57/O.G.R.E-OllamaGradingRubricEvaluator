# Update Desktop App Favicon

## TL;DR

> **Quick Summary**: Copy the new `favicon.png` into the desktop app's public assets and update the HTML reference from the default Vite SVG to the project favicon.
> 
> **Deliverables**:
> - `ogre-desktop/public/favicon.png` — new favicon file
> - `ogre-desktop/index.html` — updated icon reference
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (2 steps)

---

## Context

### Original Request
Update the favicon to use the new `favicon.png` the user added to the project root.

### Current State
- **Chrome extension**: Already references `favicon.png` in `manifest.json` (icons 16/48/128 + action default_icon) and `sidepanel.html` (`<link rel="icon">`). No changes needed.
- **Desktop app**: `ogre-desktop/index.html` still uses the default Vite placeholder (`/vite.svg`). Needs updating.

---

## Work Objectives

### Core Objective
Make the desktop app use the same project favicon as the Chrome extension.

### Must Have
- `favicon.png` copied into `ogre-desktop/public/`
- `ogre-desktop/index.html` icon link updated to reference `favicon.png`

### Must NOT Have
- Do NOT modify the Chrome extension files (already correct)
- Do NOT modify Tauri app icons (`src-tauri/icons/`) — those are separate from web favicon
- Do NOT delete the old `vite.svg` (harmless, may be used by Vite tooling)

---

## TODOs

- [ ] 1. Copy favicon.png to desktop app public directory

  **What to do**:
  - Copy `favicon.png` from project root to `ogre-desktop/public/favicon.png`

  **Must NOT do**:
  - Do NOT rename the file
  - Do NOT modify the source file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - Source file: `favicon.png` (project root)
  - Destination directory: `ogre-desktop/public/`

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/public/favicon.png` exists and is identical to root `favicon.png`

  **QA Scenarios**:
  ```
  Scenario: Verify favicon file was copied correctly
    Tool: Bash
    Steps:
      1. Run: ls ogre-desktop/public/favicon.png
      2. Compare file sizes: check root favicon.png and ogre-desktop/public/favicon.png are same size
    Expected Result: File exists, sizes match
    Evidence: .sisyphus/evidence/task-1-favicon-copy-verify.txt
  ```

  **Commit**: NO (groups with Task 2)

- [ ] 2. Update desktop app HTML to reference new favicon

  **What to do**:
  - In `ogre-desktop/index.html`, change line 5:
    - FROM: `<link rel="icon" type="image/svg+xml" href="/vite.svg" />`
    - TO: `<link rel="icon" type="image/png" href="/favicon.png" />`
  - Note: change both `type` (svg+xml → png) and `href` (vite.svg → favicon.png)

  **Must NOT do**:
  - Do NOT change any other lines in the file
  - Do NOT remove the vite.svg file from public/

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1

  **References**:
  - `ogre-desktop/index.html:5` — the line to change
  - `sidepanel.html:6` — reference for correct favicon link format (`<link rel="icon" type="image/png" href="favicon.png">`)

  **Acceptance Criteria**:
  - [ ] `ogre-desktop/index.html` contains `<link rel="icon" type="image/png" href="/favicon.png" />`
  - [ ] No other lines in the file were modified

  **QA Scenarios**:
  ```
  Scenario: Verify HTML favicon reference updated
    Tool: Bash
    Steps:
      1. Run: grep -n "favicon" ogre-desktop/index.html
      2. Assert output contains: type="image/png" and href="/favicon.png"
      3. Assert output does NOT contain: vite.svg
    Expected Result: Line 5 shows the new favicon.png reference
    Evidence: .sisyphus/evidence/task-2-html-favicon-ref.txt
  ```

  **Commit**: YES
  - Message: `fix(desktop): update favicon from default Vite SVG to project favicon`
  - Files: `ogre-desktop/public/favicon.png`, `ogre-desktop/index.html`

---

## Success Criteria

### Verification Commands
```bash
ls ogre-desktop/public/favicon.png     # Expected: file exists
grep "favicon.png" ogre-desktop/index.html  # Expected: link with type="image/png"
```

### Final Checklist
- [ ] `ogre-desktop/public/favicon.png` exists
- [ ] `ogre-desktop/index.html` references `/favicon.png` with correct MIME type
- [ ] Chrome extension files unchanged
