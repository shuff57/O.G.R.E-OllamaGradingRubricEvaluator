# Learnings — turndown-extraction

## [2026-02-23] Plan Initialized

### Project Structure
- Working dir: `C:\Users\shuff\OneDrive\Documents\GitHub\O.G.R.E-OllamaGradingReviewEvaluator`
- Desktop app: `ogre-desktop/` (Tauri + Vite + TypeScript)
- Test runner: vitest (`cd ogre-desktop && npx vitest run`)
- Build: `cd ogre-desktop && npm run build`

### Key Conventions
- All inline webview scripts MUST use ES5 syntax (var, function(){}, no arrow functions, no const/let)
- evalScript() bypasses CSP — safe for IIFE injection into Tauri WebView2
- evalScriptJSON<T>() for calls that return data
- Idempotency guard pattern: `if (window.__FLAG__) return;` (see browser.ts:213-237)
- window.__turndownService will be the global Turndown instance set by ensureTurndownLoaded()

### Critical Files
- `ogre-desktop/src/lib/batch-grader.ts` — extractStudents (L240-265), extractRubric (L277-374), extractPageContent (L389-485)
- `ogre-desktop/src/lib/browser.ts` — evalScript, evalScriptJSON, ensureHtml2CanvasLoaded (idempotency pattern)
- `ogre-desktop/src/lib/markdown-extract.ts` — TO BE CREATED
- `ogre-desktop/src/lib/turndown-bundle.ts` — TO BE GENERATED

### DO NOT TOUCH
- discover.ts
- browser-actions.ts readTextAction
- Return type signatures of extractStudents/extractRubric/extractPageContent
- DOM manipulation functions (fillGrade, clickQuickSave, navigateToNextStudent)
- checklistItems / rubricItems structured arrays in extractRubric

## [2026-02-23] Task 1: Bundle Generation Complete

### Bundle Build Script Implementation
- **File**: `ogre-desktop/scripts/build-turndown-bundle.js`
- **Language**: ES modules (required because package.json has `"type": "module"`)
- **Key imports**: `fs`, `path`, `fileURLToPath` from `url`
- **Pattern**: Read IIFE files → concatenate → escape backticks/backslashes → write TypeScript export

### Turndown IIFE Files Located
- `node_modules/turndown/dist/turndown.js` — 26,787 bytes (UMD/IIFE format)
- `node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js` — 4,191 bytes (UMD/IIFE format)
- Both are IIFE format: `var TurndownService = (function () { ... })`
- Combined bundle: 30,979 bytes (before escaping)

### Generated File
- **File**: `ogre-desktop/src/lib/turndown-bundle.ts`
- **Size**: 31,256 bytes (after escaping backticks and backslashes)
- **Export**: `export const TURNDOWN_IIFE: string = \`...escaped bundle...\`;`
- **Auto-generated**: Header comment warns not to edit manually

### Package.json Updates
- Added `"build:turndown": "node scripts/build-turndown-bundle.js"` to scripts
- Updated `"build"` script to run `npm run build:turndown && vite build`
- Dependencies already present: `turndown@^7.2.2`, `turndown-plugin-gfm@^1.0.2`
- DevDependency already present: `@types/turndown@^5.0.6`

### Build Verification
- `npm run build:turndown` ✓ Generates bundle successfully
- `npm run build` ✓ Full Vite build succeeds (1,635 KB JS, 146 KB CSS)
- No TypeScript errors in generated file
- Bundle is ready for injection via evalScript() in Task 2

### Escaping Strategy
- Backslashes escaped first: `str.replace(/\/g, '\\')`
- Then backticks: `str.replace(/`/g, '\`')`
- Order matters: backticks must be escaped after backslashes
- Result: Safe for embedding in TypeScript template literal

### Next Steps (Task 2)
- Create `markdown-extract.ts` with `ensureTurndownLoaded()` function
- Pattern: Check if `window.__turndownService` exists, inject IIFE if not
- Use idempotency guard: `if (window.__turndownService) return;`
- Call `evalScript(TURNDOWN_IIFE)` to inject bundle into webview
- Then call `evalScriptJSON<string>('new TurndownService().turndown(html)')` to convert

## [2026-02-23] Task 2: markdown-extract.ts Complete

### Module Structure
 **File**: `ogre-desktop/src/lib/markdown-extract.ts` (128 lines)
 **3 exports**: `ensureTurndownLoaded()`, `htmlToMarkdown(selector)`, `htmlToMarkdownDirect(html)`
 Dual-mode: webview injection (exports 1-2) and pure Node.js (export 3)

### Webview Injection Pattern (ensureTurndownLoaded)
 Two-step: first `evalScript(TURNDOWN_IIFE)` to inject globals, then second `evalScript()` to configure
 Idempotency guard: `if (window.__turndownService) return;` in the config script
 Entire body wrapped in try/catch — warns but doesn't throw on failure
 ES5 syntax mandatory in all inline scripts (var, function(){}, no arrow functions)

### Bundle Global Names (Confirmed)
 `TurndownService` — from line 2 of turndown-bundle.ts: `var TurndownService = (function () {`
 `turndownPluginGfm` — from line 979: `var turndownPluginGfm = (function (exports) {`
 GFM plugin accessed as `turndownPluginGfm.gfm` (the gfm function is an export)

### htmlToMarkdown (webview)
 Uses `evalScriptJSON<string>()` — the inline script returns `JSON.stringify(result)`
 Falls back to `el.textContent.trim()` on Turndown error
 Returns `''` if selector not found

### htmlToMarkdownDirect (Node.js pure)
 Direct `import TurndownService from 'turndown'` and `import { gfm } from 'turndown-plugin-gfm'`
 Same config as webview: atx headings, fenced code blocks, GFM plugin, math preservation
 Guard: `if (!html) return ''` handles empty/undefined/null
 Creates fresh TurndownService instance per call (no caching needed for test use)

### Math Preservation Strategy
 `service.keep(['math', 'annotation'])` — preserves MathML elements as raw HTML
 Custom `addRule('mathClass', ...)` — any element with className containing 'katex' or 'MathJax'
  gets its `outerHTML` returned verbatim instead of being converted
 Both approaches verified working in tests

### Evidence
 `.sisyphus/evidence/task-2-table-conversion.txt` — GFM pipe table output
 `.sisyphus/evidence/task-2-math-preservation.txt` — <math>, .katex, .MathJax preserved
 `.sisyphus/evidence/task-2-fallback.txt` — empty/undefined return '' + build passes
 Note: .sisyphus/evidence/ is gitignored, evidence files are local-only

### Build
 `npm run build` passes (1,635 KB JS, 147 KB CSS)
 Commit: `9465cf2 feat(ogre-desktop): add markdown-extract utility with math preservation`

## Task 4: Turndown Integration in batch-grader.ts

**Status**: ✅ COMPLETED

### Changes Made
1. Added import: `import { ensureTurndownLoaded } from './markdown-extract';`
2. Added `await ensureTurndownLoaded();` at the start of `extractStudents()` function
3. Modified `response` field extraction to use Turndown with fallback:
   ```javascript
   response: responseDiv ? (function() { try { return window.__turndownService.turndown(responseDiv.innerHTML); } catch(e) { return responseDiv.textContent.trim(); } })() : ''
   ```
4. Kept all other fields (`name`, `currentScore`, `hasFeedback`) using textContent unchanged

### Verification
- ✅ All 13 existing tests pass (batch-grader.test.ts)
- ✅ Build succeeds (npm run build)
- ✅ No TypeScript errors
- ✅ ES5 syntax maintained in inline script
- ✅ Try/catch fallback ensures robustness

### Key Implementation Details
- The inline script uses ES5 syntax (no arrow functions, no template literals)
- Turndown conversion happens inside a try/catch IIFE to handle edge cases
- If Turndown fails or is unavailable, falls back to textContent.trim()
- The function signature and return type remain unchanged
- Student interface unchanged

### Commit
- Hash: 0b9dd9a
- Message: "feat(ogre-desktop): integrate turndown markdown extraction in batch-grader"
- Files: src/lib/batch-grader.ts


## [2026-02-23] Task 3: Unit Tests Complete

### Test File Created
- **File**: `ogre-desktop/src/lib/markdown-extract.test.ts`
- **Framework**: vitest (matching existing test patterns in batch-grader.test.ts)
- **Total Tests**: 25 test cases
- **Status**: ✅ ALL PASS (25/25)

### Test Coverage

#### Core Conversions (Tests 1-4)
1. **Table conversion** — HTML tables → GFM pipe tables with headers and cells
2. **H1 heading** — `<h1>` → `# Title`
3. **H2 heading** — `<h2>` → `## Subtitle`
4. **H3 heading** — `<h3>` → `### Section`

#### List Conversions (Tests 5-6)
5. **Unordered list** — `<ul><li>` → `* Item` or `- Item` (Turndown uses `*`)
6. **Ordered list** — `<ol><li>` → `1. First`, `2. Second`, etc.

#### Math Preservation (Tests 7-8, 17, 19)
7. **MathML elements** — `<math><mi>x</mi></math>` preserved as raw HTML
8. **KaTeX class** — `<span class="katex">` preserved as raw HTML
17. **MathJax class** — `<span class="MathJax_Preview">` preserved as raw HTML
19. **Annotation elements** — `<annotation>` within `<math>` preserved

#### Formatting & Content (Tests 9, 14-16, 22, 24)
9. **Nested formatting** — `<strong>Bold</strong>` → `**Bold**`, `<em>italic</em>` → `_italic_`
14. **Code blocks** — `<pre><code>` → ` ```fenced``` ` syntax
15. **Links** — `<a href="url">text</a>` → `[text](url)`
16. **Strikethrough** — `<del>text</del>` → `~~text~~` (GFM plugin)
22. **Blockquotes** — `<blockquote><p>` → `> quote`
24. **Images** — `<img alt="text" src="url">` → `![text](url)`

#### Edge Cases (Tests 10-13, 20-21, 23, 25)
10. **Empty string** — `''` → `''` (no crash)
11. **Null input** — `null` → `''` (guard clause)
12. **Undefined input** — `undefined` → `''` (guard clause)
13. **Large input** — 10KB+ HTML → processes without crash, returns non-empty string
20. **Whitespace handling** — excessive whitespace normalized correctly
21. **Mixed content** — complex HTML with multiple element types converts correctly
23. **Horizontal rules** — `<hr />` → `* * *` or similar separator
25. **Return type** — always returns `string` type (never null/undefined)

### Key Findings

#### Turndown Output Format
- **Lists**: Uses `*` for unordered (not `-`), with extra spaces: `*   Item` (3 spaces)
- **Ordered lists**: Uses numbered format: `1.  First` (2 spaces after period)
- **Emphasis**: Uses `_` for italic (not `*`): `_italic_`
- **Strikethrough**: Uses single `~` (not double): `~strikethrough~`
- **Horizontal rules**: Converts to `* * *` (not `---`)

#### Test Assertions Strategy
- Used regex patterns for flexible matching: `/[*\-]\s+Item/` for list items
- Used `.toContain()` for exact text presence (table cells, headings, links)
- Used `.toMatch()` for format variations (lists, emphasis, strikethrough)
- Avoided brittle exact-match assertions that depend on Turndown's spacing

#### Math Preservation Verified
- `<math>` tags preserved with all children
- `<annotation>` elements preserved
- `.katex` class elements preserved as `outerHTML`
- `.MathJax` class elements preserved as `outerHTML`
- All math content survives round-trip conversion

### Test Execution
```bash
cd ogre-desktop && npx vitest run src/lib/markdown-extract.test.ts
```

**Result**:
```
✓ src/lib/markdown-extract.test.ts (25 tests) 31ms
Test Files: 1 passed (1)
Tests: 25 passed (25)
```

### Evidence
- `.sisyphus/evidence/task-3-unit-tests.txt` — Full test output with all 25 passing

### Commit
- **Hash**: dcade1e (amended T2 commit)
- **Message**: "feat(ogre-desktop): add markdown-extract utility with math preservation"
- **Files**: 
  - `ogre-desktop/src/lib/markdown-extract.ts` (created in T2)
  - `ogre-desktop/src/lib/markdown-extract.test.ts` (created in T3)

### Lessons Learned
1. **Turndown spacing**: Always use regex patterns for list/number assertions, not exact strings
2. **Emphasis variants**: Turndown prefers `_` for italic, not `*`
3. **Strikethrough format**: Single `~` is valid Markdown, not always double
4. **HR format**: Turndown uses `* * *`, not `---`
5. **Test isolation**: Each test is independent, no shared state needed
6. **Type safety**: All tests verify `typeof result === 'string'` for robustness

## Task 6: Turndown Integration in extractPageContent()

**Status**: ✅ COMPLETED

### Changes Made
- Added `await ensureTurndownLoaded();` before evalScriptJSON call in `extractPageContent()`
- Updated all 6 fallback strategies to use Turndown markdown extraction:
  1. **rubric_table** (line 415): Canvas rubric criteria table
  2. **assignment_description** (line 429): LMS assignment description
  3. **question_region** (line 436): MyOpenMath question region
  4. **submission_iframe** (line 452): Submission preview iframe
  5. **page_headings** (line 474): Generic page headings
  6. **page_content** (line 479): Page body text

### Implementation Details
- Each strategy uses: `window.__turndownService.turndown(el.innerHTML).substring(0, 3000)`
- Fallback on error: `cleanText(text).substring(0, 2000)` (textContent)
- Substring cap: 3000 for Turndown (markdown adds formatting), 2000 for textContent
- All 6 strategies maintain original selection logic and element selectors
- ES5 syntax preserved in inline script (no ES6 features)

### Verification
- Total `__turndownService` occurrences: 9 (6 in strategies + 3 in try/catch blocks)
- Build: ✅ SUCCESS (`npm run build` completed without errors)
- No changes to `PageContent` interface or return types
- No changes to strategy order or selection logic

### Code Quality
- Try/catch pattern ensures graceful fallback if Turndown fails
- Maintains backward compatibility with textContent extraction
- Consistent error handling across all 6 strategies

## Task 5: Turndown Integration in extractRubric() and essayPrompt

**Status**: ✅ COMPLETED

### Changes Made

1. **Import already present** (from Task 4):
   - `import { ensureTurndownLoaded } from './markdown-extract';`

2. **Added ensureTurndownLoaded() call** (line 280):
   - `await ensureTurndownLoaded();` before the evalScriptJSON call
   - Ensures Turndown is available in the webview before extraction

3. **Updated modelText extraction** (line 322):
   - **Before**: `modelText = modelDiv ? modelDiv.textContent.trim() : null;`
   - **After**: `modelText = modelDiv ? (function() { try { return window.__turndownService.turndown(modelDiv.innerHTML); } catch(e) { return modelDiv.textContent.trim(); } })() : null;`
   - Converts model response HTML to markdown with textContent fallback

4. **Updated essayPrompt extraction** (lines 326-330):
   - **Before**: `.map(function(p) { return p.textContent.trim(); })`
   - **After**: `.map(function(p) { try { return window.__turndownService.turndown(p.outerHTML); } catch(e) { return p.textContent.trim(); } })`
   - Converts each prompt paragraph's HTML to markdown with fallback
   - Uses `outerHTML` to preserve paragraph structure

### What Remained UNCHANGED
- ✅ checklistItems extraction (lines 300-307) — still uses textContent
- ✅ rubricItems extraction (lines 314-320) — still uses textContent
- ✅ maxScore extraction (lines 364-368) — unchanged
- ✅ Rubric interface — no changes
- ✅ essayPrompt fallback logic (lines 332-344) — still uses textContent for fallback paragraphs
- ✅ All other functions (extractStudents, extractPageContent, etc.) — unchanged

### Compatibility Notes
- **essayPrompt field**: Still a string, Turndown output is markdown string (compatible)
- **modelText field**: Still a string | null, Turndown output is markdown string (compatible)
- **formatRubricForReview()** (lines 520-556): Continues to work with markdown strings
  - Splits on `\n`, trims, filters empty lines, joins back
  - Works identically with markdown as with plain text
- **No breaking changes** to public API

### Regression Testing
- **Command**: `cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts`
- **Results**: ✅ All 13 tests passed
- **Duration**: 680ms
- **Evidence**: `.sisyphus/evidence/task-5-regression.txt`

### Implementation Details
- ES5 syntax maintained in inline script (var, function(){}, no arrow functions)
- Try/catch IIFE pattern ensures graceful degradation
- If Turndown fails, falls back to textContent.trim()
- Turndown conversion happens per-element (each `<p>` converted separately)
- Markdown output is joined with spaces (same as original textContent)

### Commit
- Hash: 7cbd52e
- Message: "feat(ogre-desktop): integrate turndown markdown extraction in batch-grader"
- Files: src/lib/batch-grader.ts
- Changes: 9 insertions(+), 8 deletions(-)

### Summary
Task 5 successfully integrates Turndown into the `extractRubric()` function for both `essayPrompt` and `modelText` fields. The implementation:
- Preserves all existing functionality (checklistItems, rubricItems, maxScore)
- Maintains backward compatibility (string fields remain strings)
- Provides graceful fallback to textContent if Turndown fails
- Passes all 13 existing regression tests
- Follows ES5 syntax requirements for webview scripts


## [2026-02-23] Task 7: Full Suite Verification Complete

### Test Suite
 **Command**: `cd ogre-desktop && npx vitest run`
 **Result**: ✅ ALL 28 test files pass, 673 tests pass, 26 todo (skipped)
 **Duration**: 1.88s
 **New tests since baseline**: 25 (markdown-extract.test.ts) — up from 648 to 673

### Build
 **Command**: `cd ogre-desktop && npm run build`
 **Result**: ✅ BUILD SUCCESS
 **Steps**: build:turndown (31KB bundle) → vite build (266 modules, 4.34s)
 **Output**: 1,669 KB JS (469 KB gzip), 147 KB CSS (27 KB gzip)
 **No new warnings** introduced by T1-T6 changes

### Commit
 **Hash**: accd115
 **Message**: `test(ogre-desktop): verify turndown extraction regression and integration`
 **Files**: .sisyphus/evidence/task-7-full-suite.txt, task-7-build.txt

### Conclusion
All T1-T6 changes are regression-free. No source files modified — verification only.