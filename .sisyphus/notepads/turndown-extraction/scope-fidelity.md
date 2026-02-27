# F4: Scope Fidelity Check

## Commits Analyzed
- `a5cd642` — feat(ogre-desktop): add turndown dependencies and IIFE bundle build script (T1)
- `dcade1e` — feat(ogre-desktop): add markdown-extract utility with math preservation (T2+T3)
- `7cbd52e` — feat(ogre-desktop): integrate turndown markdown extraction in batch-grader (T4+T5+T6)
- `accd115` — test(ogre-desktop): verify turndown extraction regression and integration (T7)

## Task-by-Task Compliance

| Task | Plan "What to do" | Actual Diff | Match |
|------|-------------------|-------------|-------|
| T1 | npm install turndown+gfm, create build script, generate IIFE bundle | package.json, scripts/build-turndown-bundle.js, turndown-bundle.ts created | ✅ 1:1 |
| T2 | Create markdown-extract.ts with ensureTurndownLoaded, htmlToMarkdown, htmlToMarkdownDirect | All 3 exports present, math preservation via .keep() and addRule, ES5 inline scripts | ✅ 1:1 |
| T3 | Create markdown-extract.test.ts with vitest tests | File created with test cases | ✅ 1:1 |
| T4 | Add ensureTurndownLoaded to extractStudents, change response field to Turndown+fallback | Line 242: await ensureTurndownLoaded(), Line 258: try/catch IIFE with turndown/textContent | ✅ 1:1 |
| T5 | Enhance essayPrompt+modelText in extractRubric with Turndown+fallback | Line 280: ensureTurndownLoaded, Line 322: modelText turndown, Line 328: essayPrompt turndown | ✅ 1:1 |
| T6 | Change all 6 extractPageContent strategies to Turndown+fallback, cap 2000→3000 | Lines 415,429,436,452,474,479: All 6 strategies use IIFE try/catch, cap=3000 | ✅ 1:1 |
| T7 | Run full test suite + build, save evidence | Evidence files: task-7-build.txt, task-7-full-suite.txt | ✅ 1:1 |

## Must NOT Do Compliance

| # | Guardrail | Check Method | Result |
|---|-----------|-------------|--------|
| 1 | discover.ts NOT modified | `git log --oneline ogre-desktop/src/lib/discover.ts` — last commit `3ca26a9` (pre-turndown) | ✅ CLEAN |
| 2 | browser-actions.ts NOT modified | `git log --oneline` — last commit `6b168a3` (cdp-client feature, not turndown) | ✅ CLEAN |
| 3 | Return types NOT changed | Signatures verified: `extractStudents→Promise<Student[]>`, `extractRubric→Promise<Rubric>`, `extractPageContent→Promise<PageContent>` — all identical | ✅ CLEAN |
| 4 | No ES6 in inline scripts | All inline scripts in batch-grader.ts and markdown-extract.ts use `var`, `function(){}`, no `=>`, no `const`/`let` | ✅ CLEAN |
| 5 | checklistItems/rubricItems UNCHANGED | Lines 298-320: only context lines in diff (no +/-), extraction uses textContent on b/label/li elements | ✅ CLEAN |
| 6 | No new LMS site profiles | `git diff a5cd642~1..accd115 -- ogre-desktop/src/lib/site-profiles.ts` — empty (no changes) | ✅ CLEAN |

## File Accounting

### Files in turndown commit range (a5cd642~1..accd115):
| File | Attributed To | Status |
|------|--------------|--------|
| ogre-desktop/package.json | T1 | ✅ Expected |
| ogre-desktop/package-lock.json | T1 (auto-gen) | ✅ Expected |
| ogre-desktop/scripts/build-turndown-bundle.js | T1 | ✅ Expected |
| ogre-desktop/src/lib/turndown-bundle.ts | T1 | ✅ Expected |
| ogre-desktop/src/lib/markdown-extract.ts | T2 | ✅ Expected |
| ogre-desktop/src/lib/markdown-extract.test.ts | T3 | ✅ Expected |
| ogre-desktop/src/lib/batch-grader.ts | T4+T5+T6 | ✅ Expected |
| .sisyphus/evidence/task-7-build.txt | T7 | ✅ Expected |
| .sisyphus/evidence/task-7-full-suite.txt | T7 | ✅ Expected |

**Unaccounted files: 0**

---

## VERDICT

Tasks [7/7 compliant] | Contamination [CLEAN/0 issues] | Unaccounted [CLEAN/0 files] | VERDICT: APPROVE