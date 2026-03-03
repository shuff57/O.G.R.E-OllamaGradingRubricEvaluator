# Fix MOM "Add an Item" Dropdown Mapping

## TL;DR

> **Quick Summary**: The `select#addtype0-t` "Add an Item" dropdown on MyOpenMath course pages causes CDP error `-32000: Node does not have a layout object` because the `<select>` element has no visual layout. Inspect the live DOM to determine the real state, then update the `mom-page-map` skill and `myopenmath.md` profile to make direct URL navigation the unambiguous primary approach.
> 
> **Deliverables**:
> - Updated `.claude/skills/mom-page-map/CLAUDE.md` — fixed "Add An Item" section + Common Mistakes rows
> - Updated `ogre-desktop/src/assets/profiles/myopenmath.md` — aligned dropdown references (4 lines)
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (Task 2 depends on Task 1 findings, Task 3 depends on Task 2)
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
User reported CDP error `-32000: Node does not have a layout object` when an AI agent tried to interact with the "Add an Item..." dropdown at the top of a MyOpenMath course page. The current skill mapping presents `selectOption()` as an equally valid approach alongside direct URL navigation, causing agents to attempt the broken interaction.

### Interview Summary
**Key Discussions**:
- Error location: Top of course page (outside any block) — `select#addtype0-t`
- Interaction method: Agent-chosen (likely `selectOption()` or `.click()`)
- CDP error confirms the `<select>` exists in DOM but has no visual rendering

**Research Findings**:
- Skill already has correct URL workaround (Option A) but presents it as one of two equal options
- The `additem()` JS function constructs URLs like `add{type}.php?block={blk}&tb={tb}&cid={cid}`
- Profile references the dropdown in 4 places (lines 67, 129, 173, 279)

### Metis Review
**Identified Gaps** (addressed in plan):
- Must check ALL addtype selects (not just `#addtype0-t`) — block-level ones may share the defect
- Must verify Option A (direct URL) still works before promoting it as primary
- Must test if `additem()` JS function still exists (potential `page.evaluate` alternative)
- Must verify URL patterns haven't changed
- Must preserve the option value→URL mapping table — it's correct reference regardless of interaction method
- Common Mistakes table rows need updating for the actual failure mode

---

## Work Objectives

### Core Objective
Fix the "Add an Item" dropdown mapping so agents never hit CDP error `-32000` and reliably add items to MOM courses.

### Concrete Deliverables
- `.claude/skills/mom-page-map/CLAUDE.md` — "Adding Items to Course" section rewritten with URL nav as unambiguous primary approach
- `ogre-desktop/src/assets/profiles/myopenmath.md` — 4 references aligned to new guidance

### Definition of Done
- [x] An agent reading only the "How to Interact" section would use direct URL navigation, never `selectOption()`
- [x] Common Mistakes table covers the CDP `-32000` failure mode
- [x] Profile quick-reference selector entry points to URL approach
- [x] No stale references to `selectOption()` as a recommended approach remain

### Must Have
- Live DOM evidence before any edits (no speculative fixes)
- Direct URL navigation as the clearly primary/recommended approach
- Option value → URL mapping table preserved (it's correct reference data)
- Select ID pattern table preserved (correct DOM knowledge, even if element is hidden)
- Common Mistakes rows updated for CDP error

### Must NOT Have (Guardrails)
- Do NOT rewrite the entire "Adding Items to Course" section from scratch — targeted edits only
- Do NOT edit anything outside the "Add An Item" section + Common Mistakes rows in the skill file
- Do NOT add speculative selectors without DOM evidence from Task 1
- Do NOT restructure headings, add new sections, or change the profile file's format
- Do NOT remove the select ID pattern table — it's reference documentation
- Do NOT remove the `onchange` / `additem()` documentation until verified invalid
- Do NOT bloat the profile with implementation details that belong only in the skill

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation files, not code)
- **Automated tests**: None — QA scenarios verify correctness
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DOM Inspection**: Use `playwriter` skill — Navigate, evaluate JS, capture accessibility tree
- **File Verification**: Use Grep/Read — Confirm updated content, no stale references

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — investigation must precede edits):
├── Task 1: Live DOM inspection of "Add An Item" dropdown [deep]
│
├── Task 2: Update mom-page-map skill (depends: Task 1) [quick]
│
└── Task 3: Update myopenmath.md profile (depends: Task 2) [quick]

Wave FINAL (After ALL tasks):
└── Task F1: End-to-end verification [quick]

Critical Path: Task 1 → Task 2 → Task 3 → F1
Parallel Speedup: None (sequential chain)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | 2, 3   |
| 2    | 1         | 3, F1  |
| 3    | 2         | F1     |
| F1   | 3         | —      |

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep` (+ `playwriter` skill), T2 → `quick`, T3 → `quick`
- **FINAL**: F1 → `quick`

---

## TODOs

- [x] 1. Live DOM Inspection of "Add An Item" Dropdown

  **What to do**:
  - Navigate to a MOM course page (`course/course.php?cid={cid}`)
  - Execute a structured DOM inspection checklist (ALL items required):
    1. **Element existence**: `document.querySelector('#addtype0-t')` — does it exist?
    2. **Layout properties**: `getComputedStyle(el).display`, `el.offsetHeight`, `el.offsetWidth`, `el.getBoundingClientRect()` — confirm the no-layout-object state
    3. **Block-level select**: Check at least one block-level select (e.g., `#addtype0-1-t` if blocks exist) — same checks as above. Do they share the same hidden state?
    4. **Custom widget search**: Inspect the accessibility tree of the area around the dropdown. Is there a `<div>` with `role="listbox"`, `role="combobox"`, or click handler replacing the native select? Take an accessibility tree snapshot of the content area.
    5. **`additem()` function existence**: `typeof additem` in page console — is the JS function still available?
    6. **Direct URL navigation test**: Navigate to `https://www.myopenmath.com/course/addassessment2.php?block=0&tb=t&cid={cid}` — does it load the assessment creation page successfully?
    7. **`page.evaluate` viability test**: Try `page.evaluate(() => additem('0','t'))` — does calling the JS function directly trigger navigation? If yes, does Playwright properly wait for it?
  - Record ALL findings in a structured output

  **Must NOT do**:
  - Do NOT modify any MOM data (no creating assessments, no changing settings)
  - Do NOT attempt fixes — this is investigation only
  - Do NOT inspect unrelated page areas

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Investigation task requiring careful DOM analysis, multiple evaluation steps, and structured output — not a simple edit
  - **Skills**: [`playwriter`]
    - `playwriter`: Required to control Chrome browser for live DOM inspection on MOM
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — Playwriter extension is the correct tool for inspecting the user's live authenticated MOM session

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — must complete before Task 2
  - **Blocks**: Tasks 2, 3, F1
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-page-map/CLAUDE.md` lines 69–134 — Current "Adding Items to Course" section with all documented select IDs, option values, and the `additem()` function description. Use this as the inspection checklist source.

  **External References**:
  - MyOpenMath course page: `https://www.myopenmath.com/course/course.php?cid={cid}` — Live page to inspect

  **WHY Each Reference Matters**:
  - The skill file tells you exactly which selectors and IDs to check. The live page tells you what's actually there. The gap between them is what we're fixing.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Inspect course-level addtype select
    Tool: playwriter
    Preconditions: User is logged into MOM, on a course page with at least one block
    Steps:
      1. Navigate to course page if not already there
      2. Run page.evaluate: `{ const el = document.querySelector('#addtype0-t'); return el ? { exists: true, display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility, offsetHeight: el.offsetHeight, offsetWidth: el.offsetWidth, rect: JSON.stringify(el.getBoundingClientRect()), tagName: el.tagName, parentDisplay: getComputedStyle(el.parentElement).display } : { exists: false } }`
      3. Run page.evaluate for block-level: same query but for `#addtype0-1-t` (or first available block select)
      4. Run page.evaluate: `typeof additem`
      5. Capture accessibility tree snapshot of content area
      6. Navigate to `addassessment2.php?block=0&tb=t&cid={cid}` and check if page loads (title or form field visible)
    Expected Result: Structured JSON with all 6 findings. At minimum: element exists but has display:none or zero dimensions confirming the CDP error cause.
    Failure Indicators: Element doesn't exist at all (selector completely wrong), or element IS visible (error has a different cause)
    Evidence: .sisyphus/evidence/task-1-dom-inspection.md

  Scenario: Test page.evaluate additem() call
    Tool: playwriter
    Preconditions: On course page, additem function confirmed to exist (from previous scenario)
    Steps:
      1. If `typeof additem === 'function'`, run `page.evaluate(() => additem('0','t'))` wrapped in try/catch
      2. Check if navigation occurred (URL changed to an add-item page)
      3. Record result: success/failure + any error message
    Expected Result: Either additem() triggers navigation (viable alternative) or throws an error (not viable)
    Failure Indicators: additem() doesn't exist, or triggers navigation but Playwright can't track it
    Evidence: .sisyphus/evidence/task-1-additem-eval.md
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-dom-inspection.md` — Full structured findings for all 7 checklist items
  - [ ] `.sisyphus/evidence/task-1-additem-eval.md` — `page.evaluate(additem)` test result

  **Commit**: NO

---

- [x] 2. Update mom-page-map Skill — "Add An Item" Section

  **What to do**:
  - Read Task 1 findings from `.sisyphus/evidence/task-1-dom-inspection.md`
  - Edit `.claude/skills/mom-page-map/CLAUDE.md` — specifically the "Adding Items to Course" section and relevant Common Mistakes rows:
    1. **Update the `⚠️ Critical` callout** (currently says "This is a native `<select>` element — NOT a custom widget"): Replace with findings-based callout explaining the actual state (e.g., "The native `<select>` exists in DOM but has `display:none` / no layout — agents MUST use direct URL navigation")
    2. **Restructure the "How to Interact" section**: Make direct URL navigation (Option A) the unambiguously primary and recommended approach. If `page.evaluate(() => additem())` works (from Task 1 findings), add it as Option B. Demote/remove `selectOption()` with explicit warning that it causes CDP error `-32000`
    3. **Update Common Mistakes table**: Add/update the row about `.click()` on the dropdown to also cover `selectOption()` causing CDP error when element has no layout object
    4. **Preserve**: Select ID pattern table, option value→URL mapping table, `additem()` JS function documentation (if confirmed still valid), and all section headings

  **Must NOT do**:
  - Do NOT rewrite the entire section from scratch — targeted edits
  - Do NOT edit anything outside the "Add An Item" section + Common Mistakes rows
  - Do NOT add selectors not confirmed by Task 1 evidence
  - Do NOT remove the select ID pattern table or option value table

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted edits to specific sections of one markdown file. Clear instructions from Task 1 findings.
  - **Skills**: []
    - No skills needed — this is a markdown file edit using standard Edit tool
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — no browser interaction, just file editing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 1
  - **Blocks**: Task 3, F1
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.claude/skills/mom-page-map/CLAUDE.md` — "Adding Items to Course — 'Add An Item...' Dropdown" section. This is the section being edited. Read the full section before making changes.
  - `.claude/skills/mom-page-map/CLAUDE.md` — "Common Mistakes" table at the bottom. Find rows mentioning `addtype`, `.click()`, and `selectOption`.

  **Evidence References**:
  - `.sisyphus/evidence/task-1-dom-inspection.md` — Task 1 DOM findings. This is the source of truth for what to write. Every edit must be traceable to a finding in this file.
  - `.sisyphus/evidence/task-1-additem-eval.md` — Task 1 `page.evaluate` test result. Determines whether `page.evaluate(() => additem())` is a viable Option B.

  **WHY Each Reference Matters**:
  - The skill file is the edit target — read it to understand current structure before editing. The evidence files contain the DOM truth — every change must be grounded in these findings, not speculation.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify URL navigation is unambiguously primary
    Tool: Bash (grep)
    Preconditions: Task 2 edits complete
    Steps:
      1. Read the "How to Interact" section from .claude/skills/mom-page-map/CLAUDE.md
      2. Grep for "selectOption" in the file — if present, it must be inside a warning/deprecated/avoid context
      3. Grep for "recommended" — should appear near the URL navigation approach
      4. Verify the first code example in "How to Interact" is the URL approach, not selectOption
    Expected Result: URL navigation is listed first, marked as "recommended". selectOption is either removed or explicitly warned against with CDP error mention.
    Failure Indicators: selectOption still appears as an equal option, or URL approach isn't clearly marked as primary
    Evidence: .sisyphus/evidence/task-2-skill-verification.md

  Scenario: Verify Common Mistakes updated
    Tool: Bash (grep)
    Preconditions: Task 2 edits complete
    Steps:
      1. Grep for "CDP" or "-32000" or "layout object" in .claude/skills/mom-page-map/CLAUDE.md
      2. Verify at least one Common Mistakes row mentions this error
      3. Grep for "selectOption" in Common Mistakes — should be mentioned as a failure mode
    Expected Result: Common Mistakes table includes CDP error -32000 / no layout object as a known failure when using selectOption on addtype selects
    Failure Indicators: No mention of CDP error in Common Mistakes
    Evidence: .sisyphus/evidence/task-2-mistakes-verification.md

  Scenario: Verify preserved tables still intact
    Tool: Bash (grep)
    Preconditions: Task 2 edits complete
    Steps:
      1. Grep for "addtype0-t" — select ID pattern table should still be present
      2. Grep for "assessment2" — option value table should still list all item types
      3. Grep for "additem(" — JS function documentation should still exist (if Task 1 confirmed function exists)
    Expected Result: All three reference tables/documentation preserved
    Failure Indicators: Any of the three reference sections removed or truncated
    Evidence: .sisyphus/evidence/task-2-preserved-tables.md
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-skill-verification.md`
  - [ ] `.sisyphus/evidence/task-2-mistakes-verification.md`
  - [ ] `.sisyphus/evidence/task-2-preserved-tables.md`

  **Commit**: YES (groups with Task 3)
  - Message: `fix(skills): update MOM Add-an-Item dropdown mapping to prefer URL navigation`
  - Files: `.claude/skills/mom-page-map/CLAUDE.md`, `ogre-desktop/src/assets/profiles/myopenmath.md`
  - Pre-commit: none

---

- [x] 3. Update myopenmath.md Profile — Align Dropdown References

  **What to do**:
  - Read the updated skill file from Task 2 to understand the new guidance
  - Edit `ogre-desktop/src/assets/profiles/myopenmath.md` — update exactly these 4 locations:
    1. **Line 67**: `select#addtype0-t` reference in Content area description — update to reflect that the dropdown is hidden and agents should use direct URL navigation
    2. **Line 129**: "Course page → 'Add An Item...' dropdown → 'Add Assessment'" — update navigation instruction to use URL approach
    3. **Line 173**: "use the 'Add An Item' dropdown → 'Add Block'" — update to URL approach
    4. **Line 279**: CSS Quick Reference `select[id^="addtype"]` entry — add note about no-layout state and URL preference

  **Must NOT do**:
  - Do NOT add detailed implementation instructions to the profile (those belong in the skill)
  - Do NOT change the profile's format or structure
  - Do NOT edit any lines other than the 4 listed above
  - Do NOT add new sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Four targeted line edits in a single markdown file. Straightforward alignment task.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — file editing only

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 2
  - **Blocks**: F1
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/assets/profiles/myopenmath.md` lines 67, 129, 173, 279 — The exact lines to edit. Read surrounding context (±5 lines) to preserve tone and format.
  - `.claude/skills/mom-page-map/CLAUDE.md` — Updated "Adding Items to Course" section from Task 2. Use this as the source of truth for what the profile should say.

  **WHY Each Reference Matters**:
  - The profile is a summary. The skill is the authoritative source. Profile edits must be consistent with but briefer than the skill's new guidance.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify all 4 profile lines updated
    Tool: Bash (grep)
    Preconditions: Task 3 edits complete
    Steps:
      1. Read ogre-desktop/src/assets/profiles/myopenmath.md
      2. Check line ~67: no longer suggests select#addtype0-t as a usable interactive element
      3. Check line ~129: navigation instruction mentions URL approach
      4. Check line ~173: block creation mentions URL approach
      5. Check line ~279: CSS Quick Reference entry notes the hidden/no-layout state
    Expected Result: All 4 references updated to align with skill's URL-first guidance
    Failure Indicators: Any of the 4 locations still references selectOption or implies the dropdown is directly interactable
    Evidence: .sisyphus/evidence/task-3-profile-verification.md

  Scenario: Verify no profile bloat
    Tool: Bash
    Preconditions: Task 3 edits complete
    Steps:
      1. Count total lines in profile: `wc -l ogre-desktop/src/assets/profiles/myopenmath.md`
      2. Compare to original (~300 lines) — should be within ±5 lines
      3. Verify no new sections or headings added
    Expected Result: File length ~300 lines (±5). No new sections.
    Failure Indicators: File grew by more than 5 lines, or new headings/sections appeared
    Evidence: .sisyphus/evidence/task-3-bloat-check.md
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-profile-verification.md`
  - [ ] `.sisyphus/evidence/task-3-bloat-check.md`

  **Commit**: YES (grouped with Task 2)
  - Message: `fix(skills): update MOM Add-an-Item dropdown mapping to prefer URL navigation`
  - Files: `.claude/skills/mom-page-map/CLAUDE.md`, `ogre-desktop/src/assets/profiles/myopenmath.md`
  - Pre-commit: none

---

## Final Verification Wave

- [x] F1. **End-to-End Readthrough** — `quick`
  Read both updated files end-to-end. Verify: (1) A naive agent following only the skill instructions would use URL navigation and never attempt selectOption. (2) No stale references to selectOption as a recommended approach in either file. (3) Common Mistakes table covers CDP error. (4) Select ID pattern table and option value→URL table preserved. (5) Profile references consistent with skill.
  Output: `Skill [PASS/FAIL] | Profile [PASS/FAIL] | Stale Refs [0/N found] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Tasks 2+3**: `fix(skills): update MOM Add-an-Item dropdown mapping to prefer URL navigation` — `.claude/skills/mom-page-map/CLAUDE.md`, `ogre-desktop/src/assets/profiles/myopenmath.md`

---

## Success Criteria

### Verification Commands
```bash
grep -c "selectOption" .claude/skills/mom-page-map/CLAUDE.md  # Expected: 0 or only in warning context
grep -c "CDP\|layout object\|-32000" .claude/skills/mom-page-map/CLAUDE.md  # Expected: ≥1
grep "addtype0-t" ogre-desktop/src/assets/profiles/myopenmath.md  # Expected: updated context
```

### Final Checklist
- [x] URL navigation is unambiguously the primary/recommended approach
- [x] selectOption is demoted or removed (not presented as equally valid)
- [x] CDP error -32000 documented in Common Mistakes
- [x] Select ID pattern table preserved
- [x] Option value → URL mapping table preserved
- [x] Profile's 4 references aligned
- [x] No speculative selectors added without DOM evidence
