# Add Aeries Preset & Copy Gradebook Skills

## TL;DR

> **Quick Summary**: Add Aeries as a Quick Launch preset on the Browser page and copy 4 gradebook pipeline skill files into the project's `.claude/skills/` directory.
> 
> **Deliverables**:
> - Aeries entry added to `GRADING_SITE_PRESETS` array in `browser.ts`
> - 4 skill folders (`gb-pipeline`, `gb-compare`, `gb-new-assignment`, `gb-sync`) copied into `.claude/skills/`
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves (both tasks independent → Wave 1 parallel, Wave 2 verification)
> **Critical Path**: Task 1 + Task 2 (parallel) → Final Verification

---

## Context

### Original Request
User wants to add Aeries gradebook as a Quick Launch site on the Browser page and copy their gb-pipeline suite of Claude Code skills into the project.

### Interview Summary
**Key Discussions**:
- MyOpenMath already exists in `GRADING_SITE_PRESETS` — user confirmed only Aeries needs adding (1 new site, not 2)
- Aeries URL: `https://chicousd.aeries.net/teacher/Login.aspx` (district-specific)
- Skills should be copied verbatim from `C:\Users\shuff\.claude\skills\` into the project's `.claude\skills\` directory
- These are Claude Code / OpenCode skills, NOT OGRE's DB-backed skill system

**Research Findings**:
- `GRADING_SITE_PRESETS` is consumed by `Browser.svelte` and `Settings.svelte` via `{#each}` loops — adding to the array auto-renders in both UIs, zero Svelte changes needed
- `browser.test.ts` uses dynamic iteration (not hardcoded count) — adding a 5th entry won't break tests
- `autofill.test.ts` hardcodes 4 entries but uses its own mock array — won't break, but won't test Aeries either
- Existing project skill `mom-frq/` uses `CLAUDE.md` filename; source gb-* skills use `SKILL.md` — both conventions are supported by the system

### Metis Review
**Identified Gaps** (addressed):
- SKILL.md vs CLAUDE.md naming: Defaulted to keeping `SKILL.md` (both conventions load fine; the gb-* skills already appear in the available skills list with SKILL.md)
- Array insertion position: Defaulted to appending after Moodle (last position, least disruptive)
- autofill.test.ts coverage: Explicitly excluded from scope — not updating tests for Aeries

---

## Work Objectives

### Core Objective
Add Aeries as a grading site preset and make the gb-pipeline skill suite available in the project.

### Concrete Deliverables
- `ogre-desktop/src/lib/browser.ts` — `GRADING_SITE_PRESETS` array has 5 entries (Aeries added)
- `.claude/skills/gb-pipeline/SKILL.md` — copied from user's home skills directory
- `.claude/skills/gb-compare/SKILL.md` — copied from user's home skills directory
- `.claude/skills/gb-new-assignment/SKILL.md` — copied from user's home skills directory
- `.claude/skills/gb-sync/SKILL.md` — copied from user's home skills directory

### Definition of Done
- [x] `GRADING_SITE_PRESETS` contains `{ name: 'Aeries', url: 'https://chicousd.aeries.net/teacher/Login.aspx' }`
- [x] All 4 skill files exist at their target paths
- [x] All 4 skill files are byte-identical to their source files
- [x] Existing tests pass (browser.test.ts, autofill.test.ts)
- [x] TypeScript compiles without errors
- [ ] All 4 skill files exist at their target paths
- [ ] All 4 skill files are byte-identical to their source files
- [ ] Existing tests pass (browser.test.ts, autofill.test.ts)
- [ ] TypeScript compiles without errors

### Must Have
- Aeries preset with exact URL `https://chicousd.aeries.net/teacher/Login.aspx`
- All 4 skill files copied verbatim — zero content modifications

### Must NOT Have (Guardrails)
- Do NOT modify any `.svelte` files — the `{#each}` loops auto-render new presets
- Do NOT modify any test files — existing tests pass with the new entry
- Do NOT rename `SKILL.md` to `CLAUDE.md` — keep source filenames as-is
- Do NOT modify the content of skill files during copy — verbatim only
- Do NOT touch `mom-frq/CLAUDE.md`
- Do NOT add favicons, icons, or other UI elements for Aeries
- Do NOT reorder existing preset entries
- Do NOT create index files, config files, or registration logic for skills

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (trivial changes, existing tests provide regression coverage)
- **Framework**: vitest (for running existing tests only)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code changes**: Use Bash — run TypeScript compiler + existing test suite
- **File copies**: Use Bash — verify file existence + byte-identical comparison via `fc /B`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both tasks independent):
├── Task 1: Add Aeries to GRADING_SITE_PRESETS [quick]
└── Task 2: Copy gb-* skill files into project [quick]

Wave FINAL (After Wave 1 — verification):
├── Task F1: Plan compliance audit [quick]
└── Task F2: Regression test run [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | F1, F2 |
| 2 | — | F1 |
| F1 | 1, 2 | — |
| F2 | 1 | — |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `quick`, T2 → `quick`
- **Wave FINAL**: **2 tasks** — F1 → `quick`, F2 → `quick`

---

## TODOs

- [x] 1. Add Aeries to GRADING_SITE_PRESETS

  **What to do**:
  - Open `ogre-desktop/src/lib/browser.ts`
  - Find the `GRADING_SITE_PRESETS` array (line 239-244)
  - Add `{ name: 'Aeries', url: 'https://chicousd.aeries.net/teacher/Login.aspx' }` as the last entry before the closing `]`
  - Ensure trailing comma on the Moodle entry (line 243) if not already present

  **Must NOT do**:
  - Do NOT reorder existing entries
  - Do NOT modify any other part of browser.ts
  - Do NOT touch any .svelte files
  - Do NOT update test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line array insertion in one TypeScript file
  - **Skills**: []
    - No special skills needed — plain file edit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1, F2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/browser.ts:239-244` — The `GRADING_SITE_PRESETS` array. Follow the exact `{ name: string, url: string }` object shape used by existing entries (lines 240-243)

  **Consumer References** (files that auto-render from this array — do NOT modify these):
  - `ogre-desktop/src/pages/Browser.svelte:355-359` — Quick Launch panel renders presets via `{#each GRADING_SITE_PRESETS}`. Adding to array auto-renders.
  - `ogre-desktop/src/pages/Settings.svelte:797-804` — Credential preset buttons also use `{#each}`. Auto-renders.

  **Test References** (existing tests that must continue passing):
  - `ogre-desktop/src/lib/browser.test.ts:82-89` — Tests `GRADING_SITE_PRESETS` exists, is non-empty, each entry has `name` + `url`. Uses dynamic iteration, NOT hardcoded count — will pass with 5 entries.
  - `ogre-desktop/src/lib/autofill.test.ts:275-289` — Hardcodes 4 entries in its own mock array. Won't break but won't test Aeries. Do NOT modify.

  **Acceptance Criteria**:

  - [ ] `GRADING_SITE_PRESETS` array contains exactly 5 entries
  - [ ] 5th entry is `{ name: 'Aeries', url: 'https://chicousd.aeries.net/teacher/Login.aspx' }`
  - [ ] TypeScript compiles: `npx tsc --noEmit` (or equivalent)
  - [ ] Tests pass: `npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/browser.test.ts`

  **QA Scenarios:**

  ```
  Scenario: Aeries preset added correctly
    Tool: Bash
    Preconditions: browser.ts has been edited
    Steps:
      1. Run: node -e "const fs=require('fs'); const c=fs.readFileSync('ogre-desktop/src/lib/browser.ts','utf8'); const m=c.match(/GRADING_SITE_PRESETS\s*=\s*\[([\s\S]*?)\]/); const entries=m[1].match(/\{[^}]+\}/g); console.log('Count:', entries.length); console.log('Has Aeries:', entries.some(e => e.includes('Aeries') && e.includes('chicousd.aeries.net')))"
      2. Run: npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/browser.test.ts
      3. Run: npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/autofill.test.ts
    Expected Result: Count=5, Has Aeries=true, all tests PASS
    Failure Indicators: Count != 5, Has Aeries=false, any test FAIL
    Evidence: .sisyphus/evidence/task-1-aeries-preset.txt

  Scenario: No unintended file changes
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: git diff --name-only
      2. Verify ONLY ogre-desktop/src/lib/browser.ts appears in diff
    Expected Result: Only browser.ts is modified
    Failure Indicators: Any .svelte or test file appears in diff
    Evidence: .sisyphus/evidence/task-1-no-side-effects.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(browser): add Aeries preset and gb-pipeline skills`
  - Files: `ogre-desktop/src/lib/browser.ts`

- [x] 2. Copy gb-* skill files into project

  **What to do**:
  - Create 4 directories under `.claude/skills/`: `gb-pipeline/`, `gb-compare/`, `gb-new-assignment/`, `gb-sync/`
  - Copy each `SKILL.md` file from `C:\Users\shuff\.claude\skills\{folder}\SKILL.md` to `.claude\skills\{folder}\SKILL.md`
  - Verbatim copy — zero content modifications
  - Files to copy:
    - `C:\Users\shuff\.claude\skills\gb-pipeline\SKILL.md` → `.claude\skills\gb-pipeline\SKILL.md`
    - `C:\Users\shuff\.claude\skills\gb-compare\SKILL.md` → `.claude\skills\gb-compare\SKILL.md`
    - `C:\Users\shuff\.claude\skills\gb-new-assignment\SKILL.md` → `.claude\skills\gb-new-assignment\SKILL.md`
    - `C:\Users\shuff\.claude\skills\gb-sync\SKILL.md` → `.claude\skills\gb-sync\SKILL.md`

  **Must NOT do**:
  - Do NOT rename SKILL.md to CLAUDE.md
  - Do NOT modify file contents during copy
  - Do NOT touch mom-frq/CLAUDE.md
  - Do NOT create index files, config files, or any registration logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward file copy operations — mkdir + copy
  - **Skills**: []
    - No special skills needed — plain file operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1
  - **Blocked By**: None (can start immediately)

  **References**:

  **Source Files** (copy FROM these — read each to get content):
  - `C:\Users\shuff\.claude\skills\gb-pipeline\SKILL.md` — 168 lines, gb-pipeline orchestration skill
  - `C:\Users\shuff\.claude\skills\gb-compare\SKILL.md` — 348 lines, MOM vs Aeries comparison skill
  - `C:\Users\shuff\.claude\skills\gb-new-assignment\SKILL.md` — 248 lines, Aeries assignment creation skill
  - `C:\Users\shuff\.claude\skills\gb-sync\SKILL.md` — 1193+ lines, score sync skill (largest file)

  **Target Directory** (copy TO here):
  - `.claude/skills/` — Already exists with `mom-frq/CLAUDE.md`. Create new subdirectories alongside it.

  **Convention Reference** (for context, NOT to follow):
  - `.claude/skills/mom-frq/CLAUDE.md` — Existing project skill uses CLAUDE.md naming. The gb-* skills use SKILL.md. Both are valid. Keep SKILL.md.

  **Acceptance Criteria**:

  - [ ] `.claude/skills/gb-pipeline/SKILL.md` exists
  - [ ] `.claude/skills/gb-compare/SKILL.md` exists
  - [ ] `.claude/skills/gb-new-assignment/SKILL.md` exists
  - [ ] `.claude/skills/gb-sync/SKILL.md` exists
  - [ ] All 4 files are byte-identical to source (verified via `fc /B`)
  - [ ] `mom-frq/CLAUDE.md` is unmodified

  **QA Scenarios:**

  ```
  Scenario: All skill files copied correctly
    Tool: Bash
    Preconditions: Directories created and files copied
    Steps:
      1. Run: dir ".claude\skills\gb-pipeline\SKILL.md" ".claude\skills\gb-compare\SKILL.md" ".claude\skills\gb-new-assignment\SKILL.md" ".claude\skills\gb-sync\SKILL.md"
      2. Run: fc /B "C:\Users\shuff\.claude\skills\gb-pipeline\SKILL.md" ".claude\skills\gb-pipeline\SKILL.md"
      3. Run: fc /B "C:\Users\shuff\.claude\skills\gb-compare\SKILL.md" ".claude\skills\gb-compare\SKILL.md"
      4. Run: fc /B "C:\Users\shuff\.claude\skills\gb-new-assignment\SKILL.md" ".claude\skills\gb-new-assignment\SKILL.md"
      5. Run: fc /B "C:\Users\shuff\.claude\skills\gb-sync\SKILL.md" ".claude\skills\gb-sync\SKILL.md"
    Expected Result: All files exist, all fc /B comparisons show "FC: no differences encountered"
    Failure Indicators: File not found, fc shows differences
    Evidence: .sisyphus/evidence/task-2-skill-copy-verify.txt

  Scenario: Existing skill untouched
    Tool: Bash
    Preconditions: Task 2 complete
    Steps:
      1. Run: git diff .claude/skills/mom-frq/CLAUDE.md
    Expected Result: No output (file unchanged)
    Failure Indicators: Any diff output
    Evidence: .sisyphus/evidence/task-2-no-side-effects.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(browser): add Aeries preset and gb-pipeline skills`
  - Files: `.claude/skills/gb-pipeline/SKILL.md`, `.claude/skills/gb-compare/SKILL.md`, `.claude/skills/gb-new-assignment/SKILL.md`, `.claude/skills/gb-sync/SKILL.md`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `quick`
  Verify all deliverables exist:
  1. Read `ogre-desktop/src/lib/browser.ts` — confirm `GRADING_SITE_PRESETS` has 5 entries including Aeries with exact URL `https://chicousd.aeries.net/teacher/Login.aspx`
  2. Verify all 4 skill files exist: `.claude/skills/gb-pipeline/SKILL.md`, `.claude/skills/gb-compare/SKILL.md`, `.claude/skills/gb-new-assignment/SKILL.md`, `.claude/skills/gb-sync/SKILL.md`
  3. Run `fc /B` to verify each copied file is byte-identical to its source at `C:\Users\shuff\.claude\skills\`
  4. Verify `mom-frq/CLAUDE.md` was NOT modified (check git status)
  5. Verify NO `.svelte` files were modified (check git status)
  Output: `Deliverables [N/N] | Guardrails [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Regression Test Run** — `quick`
  Run existing test suite to confirm no regressions:
  1. `npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/browser.test.ts` — MUST PASS
  2. `npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/autofill.test.ts` — MUST PASS
  3. `npx tsc --noEmit --project ogre-desktop/tsconfig.json` — MUST PASS (or check equivalent TypeScript verification)
  Output: `Tests [PASS/FAIL] | TypeScript [PASS/FAIL] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Single commit**: `feat(browser): add Aeries preset and gb-pipeline skills`
  - Files: `ogre-desktop/src/lib/browser.ts`, `.claude/skills/gb-pipeline/SKILL.md`, `.claude/skills/gb-compare/SKILL.md`, `.claude/skills/gb-new-assignment/SKILL.md`, `.claude/skills/gb-sync/SKILL.md`
  - Pre-commit: `npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/browser.test.ts`

---

## Success Criteria

### Verification Commands
```bash
# Aeries preset exists in array
node -e "const fs=require('fs'); const c=fs.readFileSync('ogre-desktop/src/lib/browser.ts','utf8'); console.log(c.includes(\"'Aeries'\") && c.includes('chicousd.aeries.net') ? 'PASS' : 'FAIL')"

# All 4 skill files exist
dir ".claude\skills\gb-pipeline\SKILL.md" ".claude\skills\gb-compare\SKILL.md" ".claude\skills\gb-new-assignment\SKILL.md" ".claude\skills\gb-sync\SKILL.md"

# Existing tests pass
npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/browser.test.ts
npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/autofill.test.ts
```

### Final Checklist
- [x] Aeries in GRADING_SITE_PRESETS with correct URL
- [x] All 4 gb-* skill files present and identical to source
- [x] All existing tests pass
- [x] No .svelte files modified
- [x] No test files modified
- [x] mom-frq/CLAUDE.md untouched
- [ ] All 4 gb-* skill files present and identical to source
- [ ] All existing tests pass
- [ ] No .svelte files modified
- [ ] No test files modified
- [ ] mom-frq/CLAUDE.md untouched
