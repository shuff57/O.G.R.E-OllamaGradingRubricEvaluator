# Turndown HTML-to-Markdown Extraction Enhancement

## TL;DR

> **Quick Summary**: Add Turndown (HTML→Markdown) library to ogre-desktop's DOM extraction pipeline, replacing raw `.textContent.trim()` with structure-preserving Markdown at 3 validated extraction points. This dramatically improves extraction quality for tables, headings, lists, and formatted content — critical for expanding beyond MyOpenMath to Canvas, Moodle, and Blackboard.
> 
> **Deliverables**:
> - Turndown + GFM plugin installed, bundled as IIFE for webview injection
> - `markdown-extract.ts` utility module with injection, conversion, math preservation, and fallback
> - 3 extraction points enhanced: student responses, rubric prompt/model text, page content fallback
> - Unit tests for utility module + regression verification
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: T1 → T2 → T3/T4/T5/T6 (parallel) → T7

---

## Context

### Original Request
User asked whether FireCrawl MCP could enhance DOM extraction for messy/long web pages. After exhaustive research (FireCrawl MCP capabilities, project architecture analysis, alternatives comparison), we determined:
- **FireCrawl rejected**: Auth walls (LMS login required), cost (credits per scrape), latency, redundancy (app already has authenticated browser)
- **Turndown selected**: Free, local, instant, runs in webview — the right tool for converting HTML the app already has access to into clean Markdown

### Interview Summary
**Key Discussions**:
- All 5 extraction points initially in scope; Metis review reduced to 3 validated points
- Desktop app only (not /grade Playwriter skill)
- MyOpenMath works fine currently; enhancement is forward-looking for new LMS platforms
- Tests-after approach with vitest

**Research Findings**:
- Current extraction uses ES5-compatible inline scripts via `evalScriptJSON` in Tauri WebView2
- No HTML→Markdown conversion anywhere in the project
- DOM snapshots capped at 500 nodes / 12K chars for AI discovery
- Student response extraction uses fragile child-index paths
- `extractPageContent()` has 6 cascading fallback strategies ending with raw body text
- Turndown bundle: ~31KB (turndown IIFE + GFM plugin)
- `wv.eval()` in Tauri bypasses page-level CSP — safe for IIFE injection

### Metis Review
**Identified Gaps** (addressed):
- **Scope over-reach**: discover.ts DOM_SNAPSHOT_SCRIPT builds structural tree, NOT content — excluded from scope
- **Agent contract break**: browser-actions.ts readTextAction expects plain text for agent reasoning — excluded from scope
- **extractRubric mismatch**: structured `RubricItem[]` extraction shouldn't be flattened to markdown — limited to `essayPrompt`/`modelText` fields only
- **Math content destruction**: Turndown strips MathML/KaTeX by default — added custom `keep` rules
- **CSP blocking risk**: LMS sites have CSP headers — using `evalScript()` (bypasses CSP) instead of CDN injection
- **No build step**: No IIFE bundler exists — added esbuild build script task

---

## Work Objectives

### Core Objective
Integrate Turndown HTML→Markdown conversion into ogre-desktop's extraction pipeline so student responses, rubric prompts, and fallback page content preserve structural formatting (tables, headings, lists, math) instead of flattening to raw text.

### Concrete Deliverables
- `ogre-desktop/package.json` updated with `turndown`, `turndown-plugin-gfm`, `@types/turndown`
- `ogre-desktop/scripts/build-turndown-bundle.js` — generates IIFE constant
- `ogre-desktop/src/lib/turndown-bundle.ts` — generated IIFE string constant (~31KB)
- `ogre-desktop/src/lib/markdown-extract.ts` — utility module (injection, conversion, fallback, math rules)
- `ogre-desktop/src/lib/markdown-extract.test.ts` — vitest unit tests
- Modified: `batch-grader.ts` (extractStudents, extractRubric, extractPageContent)
- All existing tests still pass

### Definition of Done
- [x] `cd ogre-desktop && npx vitest run` → all tests pass (existing + new)
- [x] `cd ogre-desktop && npm run build` → builds without errors
- [x] Student response extraction returns markdown with preserved tables/headings
- [x] Rubric essayPrompt/modelText return markdown with preserved formatting
- [x] Page content fallback returns markdown instead of raw textContent
- [x] Math content (MathML, KaTeX) preserved in extraction output
- [x] Graceful degradation: if Turndown injection fails, falls back to textContent

### Must Have
- Turndown + GFM plugin bundled as IIFE for webview injection
- Math content preservation (MathML `<math>`, KaTeX `.katex`, MathJax `.MathJax`)
- Graceful fallback to textContent on any Turndown failure
- Idempotent injection (don't re-inject on subsequent calls)
- ES5-compatible inline scripts (existing convention)
- All existing `batch-grader.test.ts` tests still pass

### Must NOT Have (Guardrails)
- DO NOT modify `discover.ts` — DOM snapshot script serves page STRUCTURE analysis, not content extraction
- DO NOT modify `browser-actions.ts` readTextAction — agent contract expects plain text
- DO NOT change return type signatures of `extractStudents()`, `extractRubric()`, `extractPageContent()`
- DO NOT modify DOM MANIPULATION functions (`fillGrade`, `clickQuickSave`, `navigateToNextStudent`)
- DO NOT use CDN-based injection (CSP blocking risk) — use pre-bundled IIFE via `evalScript()`
- DO NOT convert ES5 inline scripts to ES6+ (arrow functions, const/let) — maintain existing convention
- DO NOT flatten `extractRubric()` structured `RubricItem[]` to markdown — only convert `essayPrompt` and `modelText` text fields
- DO NOT add new LMS site profiles or selectors — this is extraction quality only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: vitest (existing)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (node/bun REPL or vitest) — Import, call functions, compare output
- **Build verification**: Use Bash — Run build commands, check exit codes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Install deps + create build script + generate IIFE bundle [quick]
├── Task 2: Create markdown-extract.ts utility module [unspecified-high]

Wave 2 (Integration + Tests — after Wave 1, MAX PARALLEL):
├── Task 3: Unit tests for markdown-extract.ts [quick]
├── Task 4: Enhance extractStudents() response field [quick]
├── Task 5: Enhance extractRubric() essayPrompt + modelText [quick]
├── Task 6: Enhance extractPageContent() fallback cascade [quick]

Wave 3 (Verification — after Wave 2):
├── Task 7: Regression tests + integration verification [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T2 → T4/T5/T6 → T7 → F1-F4
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T2 | 1 |
| T2 | T1 | T3, T4, T5, T6 | 1 |
| T3 | T2 | T7 | 2 |
| T4 | T2 | T7 | 2 |
| T5 | T2 | T7 | 2 |
| T6 | T2 | T7 | 2 |
| T7 | T3, T4, T5, T6 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 4 tasks — T3 → `quick`, T4 → `quick`, T5 → `quick`, T6 → `quick`
- **Wave 3**: 1 task — T7 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs


- [x] 1. Install Turndown Dependencies + Create IIFE Bundle

  **What to do**:
  - Run `npm install turndown turndown-plugin-gfm` and `npm install -D @types/turndown` in ogre-desktop/
  - Create `ogre-desktop/scripts/build-turndown-bundle.js` that:
    - Reads `node_modules/turndown/lib/turndown.browser.umd.js` (or the IIFE dist)
    - Reads `node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js`
    - Concatenates them into a single IIFE string
    - Writes `ogre-desktop/src/lib/turndown-bundle.ts` exporting `const TURNDOWN_IIFE: string = '...'`
  - Add npm script: `"build:turndown": "node scripts/build-turndown-bundle.js"` in package.json
  - Run the script to generate the initial bundle
  - Verify the generated .ts file compiles (no syntax errors in the string constant)

  **Must NOT do**:
  - Do NOT use CDN URLs or dynamic loading
  - Do NOT modify any existing source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward npm install + small build script
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential start)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser.ts:213-237` — `ensureHtml2CanvasLoaded()` shows the existing pattern for library injection (CDN-based, which we deliberately avoid; but the idempotency guard pattern is what to follow)
  - `ogre-desktop/package.json` — Current dependencies to add to

  **API/Type References**:
  - `@types/turndown` — TypeScript definitions for the Turndown API

  **External References**:
  - Turndown npm: https://www.npmjs.com/package/turndown
  - turndown-plugin-gfm npm: https://www.npmjs.com/package/turndown-plugin-gfm

  **WHY Each Reference Matters**:
  - browser.ts ensureHtml2CanvasLoaded: Shows idempotency guard pattern (`if (window.__html2canvas_loaded__) return`) — replicate for Turndown
  - package.json: Target file for dependency additions

  **Acceptance Criteria**:
  - [ ] `cd ogre-desktop && npm ls turndown` shows turndown installed
  - [ ] `cd ogre-desktop && npm ls turndown-plugin-gfm` shows plugin installed
  - [ ] File exists: `ogre-desktop/scripts/build-turndown-bundle.js`
  - [ ] File exists: `ogre-desktop/src/lib/turndown-bundle.ts`
  - [ ] `cd ogre-desktop && npm run build:turndown` exits 0
  - [ ] `cd ogre-desktop && npm run build` still succeeds

  **QA Scenarios:**
  ```
  Scenario: Bundle generation produces valid TypeScript
    Tool: Bash
    Preconditions: npm install completed in ogre-desktop/
    Steps:
      1. Run: cd ogre-desktop && node scripts/build-turndown-bundle.js
      2. Check exit code is 0
      3. Read src/lib/turndown-bundle.ts
      4. Verify it exports TURNDOWN_IIFE as a string
      5. Run: npx tsc --noEmit src/lib/turndown-bundle.ts (or npm run build)
    Expected Result: File generated, exports valid string constant, compiles without error
    Failure Indicators: Script exits non-zero, file not created, TypeScript compilation error
    Evidence: .sisyphus/evidence/task-1-bundle-gen.txt

  Scenario: Bundle size is reasonable
    Tool: Bash
    Preconditions: turndown-bundle.ts exists
    Steps:
      1. Check file size of src/lib/turndown-bundle.ts
      2. Verify it is between 10KB and 60KB
    Expected Result: File size within expected range (~31KB for combined IIFE)
    Failure Indicators: File empty, file over 100KB, file under 5KB
    Evidence: .sisyphus/evidence/task-1-bundle-size.txt
  ```

  **Commit**: YES
  - Message: `feat(ogre-desktop): add turndown dependencies and IIFE bundle build script`
  - Files: `package.json`, `scripts/build-turndown-bundle.js`, `src/lib/turndown-bundle.ts`
  - Pre-commit: `cd ogre-desktop && npm run build`

- [x] 2. Create markdown-extract.ts Utility Module

  **What to do**:
  - Create `ogre-desktop/src/lib/markdown-extract.ts` with:
    - `ensureTurndownLoaded(): Promise<void>` — injects IIFE into webview via `evalScript()`, with idempotency guard (`window.__TURNDOWN_READY__`). Must handle page navigation clearing the context (re-inject if needed)
    - `htmlToMarkdown(selector: string): Promise<string>` — runs in webview: gets `innerHTML` of element matching selector, converts via Turndown with GFM plugin, returns markdown string. Wraps in try/catch with textContent fallback
    - `htmlToMarkdownDirect(html: string): string` — pure function for testing: converts HTML string to markdown (runs in Node/test context, not webview)
    - Configure Turndown with:
      - GFM plugin (tables, strikethrough, task lists)
      - `headingStyle: 'atx'` (# style headings)
      - `codeBlockStyle: 'fenced'` (``` code blocks)
      - `keep` rule for math elements: preserve `<math>`, `<annotation>`, elements with class `.katex`, `.MathJax`, `.MathJax_Display` as raw HTML
    - All inline scripts MUST use ES5 syntax (var, function(){}, no arrow functions)
    - Import `TURNDOWN_IIFE` from `./turndown-bundle`
    - Import `evalScript` from `./browser`

  **Must NOT do**:
  - Do NOT modify browser.ts, discover.ts, browser-actions.ts, or batch-grader.ts
  - Do NOT use ES6 syntax in any string that runs inside the webview
  - Do NOT use CDN loading — only pre-bundled IIFE via evalScript

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core utility module requiring careful Turndown configuration, math preservation rules, ES5 inline scripts, and proper error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after T1)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/browser.ts:213-237` — `ensureHtml2CanvasLoaded()` idempotency guard pattern. Follow this EXACTLY: check global flag, inject script, set flag
  - `ogre-desktop/src/lib/browser.ts:105-152` — `evalScript()` and `evalScriptJSON()` functions. These are the IPC bridge to the webview. Use `evalScript()` for injection, `evalScriptJSON()` for conversion calls that return data
  - `ogre-desktop/src/lib/batch-grader.ts:240-265` — `extractStudents()` inline script pattern. Shows ES5 convention: `var`, `function(){}`, `Array.from()`, `JSON.stringify`. ALL new inline scripts must follow this exact style
  - `ogre-desktop/src/lib/agent-dom.ts:19-129` — `INTERACTIVE_DOM_SCRIPT` shows a large inline script constant with the same ES5 pattern

  **API/Type References**:
  - `@types/turndown` — TypeScript API: `new TurndownService(options)`, `.use(plugin)`, `.turndown(html)`, `.keep(filter)`, `.addRule(key, rule)`
  - `ogre-desktop/src/lib/browser.ts` — `evalScript(code: string): Promise<string>`, `evalScriptJSON<T>(code: string): Promise<T>`

  **External References**:
  - Turndown API docs: https://github.com/mixmark-io/turndown#options
  - turndown-plugin-gfm: https://github.com/mixmark-io/turndown-plugin-gfm
  - Turndown `.keep()` for preserving elements: https://github.com/mixmark-io/turndown#keeping-certain-elements

  **WHY Each Reference Matters**:
  - browser.ts ensureHtml2CanvasLoaded: Exact pattern to replicate for idempotent library injection
  - evalScript/evalScriptJSON: The IPC bridge all inline scripts must use
  - batch-grader.ts extractStudents: Concrete example of ES5 inline script style to match
  - Turndown .keep(): Critical for math preservation — tells Turndown to pass math elements through as-is

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/markdown-extract.ts`
  - [ ] Module exports `ensureTurndownLoaded`, `htmlToMarkdown`, `htmlToMarkdownDirect`
  - [ ] `htmlToMarkdownDirect` converts `<table>` to GFM table syntax
  - [ ] `htmlToMarkdownDirect` preserves `<math>` elements as raw HTML
  - [ ] `htmlToMarkdownDirect` preserves `.katex` elements as raw HTML
  - [ ] `htmlToMarkdownDirect` converts `<h1>` to `# ` heading
  - [ ] `htmlToMarkdownDirect` converts `<ul><li>` to `- ` list items
  - [ ] `cd ogre-desktop && npm run build` succeeds

  **QA Scenarios:**
  ```
  Scenario: Table HTML converts to GFM markdown
    Tool: Bash (vitest or node)
    Preconditions: markdown-extract.ts exists and compiles
    Steps:
      1. Import htmlToMarkdownDirect from markdown-extract
      2. Call with: '<table><tr><th>Name</th><th>Score</th></tr><tr><td>Alice</td><td>95</td></tr></table>'
      3. Assert output contains '| Name | Score |'
      4. Assert output contains '| Alice | 95 |'
    Expected Result: HTML table converted to pipe-delimited GFM table
    Failure Indicators: Output is empty, output is raw HTML, table structure lost
    Evidence: .sisyphus/evidence/task-2-table-conversion.txt

  Scenario: Math content preserved through conversion
    Tool: Bash (vitest or node)
    Preconditions: markdown-extract.ts exists
    Steps:
      1. Import htmlToMarkdownDirect
      2. Call with: '<p>The formula is <math><mi>x</mi><mo>^</mo><mn>2</mn></math> and more text</p>'
      3. Assert output contains '<math>' tag (preserved, not stripped)
      4. Call with: '<p>Result: <span class="katex">x^2 + 3x</span></p>'
      5. Assert output contains 'katex' class (preserved, not stripped)
    Expected Result: Math elements pass through Turndown unmodified
    Failure Indicators: Math tags stripped, empty output where math was, 'undefined' in output
    Evidence: .sisyphus/evidence/task-2-math-preservation.txt

  Scenario: Graceful fallback on empty/invalid input
    Tool: Bash (vitest or node)
    Preconditions: markdown-extract.ts exists
    Steps:
      1. Call htmlToMarkdownDirect with empty string ''
      2. Assert returns empty string (not error)
      3. Call htmlToMarkdownDirect with null/undefined
      4. Assert returns empty string (not error)
    Expected Result: No exceptions thrown, empty string returned for empty input
    Failure Indicators: Exception thrown, 'null' or 'undefined' in output
    Evidence: .sisyphus/evidence/task-2-fallback.txt
  ```

  **Commit**: YES (groups with T3)
  - Message: `feat(ogre-desktop): add markdown-extract utility with math preservation`
  - Files: `src/lib/markdown-extract.ts`, `src/lib/markdown-extract.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/markdown-extract.test.ts`

- [x] 3. Unit Tests for markdown-extract.ts

  **What to do**:
  - Create `ogre-desktop/src/lib/markdown-extract.test.ts` with vitest tests:
    - Table conversion: `<table>` with `<th>`/`<td>` produces GFM pipe table
    - Heading conversion: `<h1>` through `<h3>` produce `#`/`##`/`###`
    - List conversion: `<ul><li>` produces `- ` items, `<ol><li>` produces `1. ` items
    - Math preservation: `<math>` tags, `.katex` spans, `.MathJax` elements preserved as raw HTML
    - Nested content: `<div><p><strong>` preserves bold within paragraphs
    - Empty/null input: returns empty string without throwing
    - Large HTML: 10KB+ input doesn't crash or timeout
  - Follow existing test patterns from `batch-grader.test.ts` (vi.mock, vi.fn)

  **Must NOT do**:
  - Do NOT test webview injection (requires actual browser) — test only the `htmlToMarkdownDirect` pure function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward unit tests following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.test.ts` — Existing vitest patterns: `vi.mock('./browser')`, `describe/test/expect` structure
  - `ogre-desktop/src/lib/browser-actions.test.ts:1` — Import pattern: `import { describe, test, expect, vi, beforeEach } from 'vitest'`

  **Acceptance Criteria**:
  - [ ] File exists: `ogre-desktop/src/lib/markdown-extract.test.ts`
  - [ ] `cd ogre-desktop && npx vitest run src/lib/markdown-extract.test.ts` passes all tests
  - [ ] At least 7 test cases covering: tables, headings, lists, math, nested, empty, large input

  **QA Scenarios:**
  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: markdown-extract.ts and markdown-extract.test.ts exist
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/markdown-extract.test.ts
      2. Check exit code is 0
      3. Verify output shows all tests passing (0 failures)
    Expected Result: All tests pass, exit code 0
    Failure Indicators: Any test failure, exit code non-zero
    Evidence: .sisyphus/evidence/task-3-unit-tests.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `feat(ogre-desktop): add markdown-extract utility with math preservation`
  - Files: `src/lib/markdown-extract.test.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/markdown-extract.test.ts`

- [x] 4. Enhance extractStudents() Response Field

  **What to do**:
  - In `batch-grader.ts` `extractStudents()` (lines 240-265), modify the inline script:
    - BEFORE calling the extraction loop, call `ensureTurndownLoaded()` (imported from markdown-extract.ts)
    - Change response extraction from `responseDiv.textContent.trim()` to:
      ```
      try { window.__turndownService.turndown(responseDiv.innerHTML) } catch(e) { responseDiv.textContent.trim() }
      ```
    - Keep all other fields (name, currentScore, hasFeedback) using textContent (they are short labels, not rich content)
  - The Turndown service instance (`window.__turndownService`) is set up by `ensureTurndownLoaded()` from Task 2
  - Maintain ES5 syntax in the inline script string

  **Must NOT do**:
  - Do NOT change the `Student` interface or return type
  - Do NOT modify name, currentScore, or hasFeedback extraction
  - Do NOT use ES6 syntax in the inline script

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function modification, small scope
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:240-265` — Current `extractStudents()` function. The inline script at line 241 is what gets modified. Pay attention to: the ES5 `var`/`function` style, the `evalScriptJSON<Student[]>` return type, and the `responseDiv.textContent.trim()` at line 256 which is the specific line to change
  - `ogre-desktop/src/lib/markdown-extract.ts` — The `ensureTurndownLoaded()` function to call before extraction, and the Turndown configuration that defines `window.__turndownService`

  **Acceptance Criteria**:
  - [ ] `extractStudents()` calls `ensureTurndownLoaded()` before running extraction script
  - [ ] Response field now uses Turndown conversion with textContent fallback
  - [ ] `Student` interface unchanged
  - [ ] `cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts` still passes
  - [ ] `cd ogre-desktop && npm run build` succeeds

  **QA Scenarios:**
  ```
  Scenario: extractStudents still passes existing tests
    Tool: Bash
    Preconditions: batch-grader.ts modified, markdown-extract.ts exists
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts
      2. Verify all existing extractStudents tests pass
    Expected Result: Zero test failures
    Failure Indicators: Any test failure related to extractStudents
    Evidence: .sisyphus/evidence/task-4-regression.txt

  Scenario: Response field uses innerHTML-based conversion
    Tool: Bash (grep)
    Preconditions: batch-grader.ts modified
    Steps:
      1. Read batch-grader.ts extractStudents function
      2. Verify it references ensureTurndownLoaded
      3. Verify it uses innerHTML (not just textContent) for response field
      4. Verify try/catch fallback to textContent exists
    Expected Result: Code shows Turndown conversion with fallback pattern
    Failure Indicators: Still using only textContent, no fallback, no ensureTurndownLoaded call
    Evidence: .sisyphus/evidence/task-4-code-review.txt
  ```

  **Commit**: YES (groups with T5, T6)
  - Message: `feat(ogre-desktop): integrate turndown markdown extraction in batch-grader`
  - Files: `src/lib/batch-grader.ts`
  - Pre-commit: `cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts`

- [x] 5. Enhance extractRubric() essayPrompt + modelText

  **What to do**:
  - In `batch-grader.ts` `extractRubric()` (lines 277-374), modify the inline script:
    - Call `ensureTurndownLoaded()` before running the extraction script (if not already done by extractStudents in the same session)
    - For `essayPrompt` field: change from `p.textContent.trim()` concatenation to Turndown conversion of the prompt region's innerHTML
    - For `modelText` field: change from `modelDiv.textContent.trim()` to Turndown conversion
    - Keep `checklistItems` and `rubricItems` using their current structured extraction (textContent on `<b>`, `<label>`, `<li>` elements) — these are intentionally structured, NOT flattened text
    - Keep `maxScore` extraction unchanged
  - Wrap each Turndown call in try/catch with textContent fallback
  - Maintain ES5 syntax in the inline script string

  **Must NOT do**:
  - Do NOT modify `checklistItems` or `rubricItems` extraction — they produce structured `RubricItem[]` arrays
  - Do NOT change the `Rubric` interface or return type
  - Do NOT modify `maxScore` extraction

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted changes to 2 fields in one function
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:277-374` — Current `extractRubric()`. Focus on: `essayPrompt` assembly at lines 323-341 (concatenates `p.textContent.trim()`), and `modelText` at lines 318-321 (`modelDiv.textContent.trim()`). These are the 2 fields to enhance
  - `ogre-desktop/src/lib/batch-grader.ts:500-552` — `formatRubricForReview()` which consumes the rubric data. Verify the fields you change are still string-compatible with this consumer

  **Acceptance Criteria**:
  - [ ] `essayPrompt` field uses Turndown conversion with textContent fallback
  - [ ] `modelText` field uses Turndown conversion with textContent fallback
  - [ ] `checklistItems` and `rubricItems` extraction UNCHANGED
  - [ ] `Rubric` interface unchanged
  - [ ] `cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts` still passes

  **QA Scenarios:**
  ```
  Scenario: extractRubric still passes existing tests
    Tool: Bash
    Preconditions: batch-grader.ts modified
    Steps:
      1. Run: cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts
      2. Verify all existing extractRubric tests pass
    Expected Result: Zero test failures
    Failure Indicators: Any test failure related to extractRubric
    Evidence: .sisyphus/evidence/task-5-regression.txt
  ```

  **Commit**: YES (groups with T4, T6)
  - Message: `feat(ogre-desktop): integrate turndown markdown extraction in batch-grader`
  - Files: `src/lib/batch-grader.ts`

- [x] 6. Enhance extractPageContent() Fallback Cascade

  **What to do**:
  - In `batch-grader.ts` `extractPageContent()` (lines 389-485), modify the inline script:
    - Call `ensureTurndownLoaded()` before running the extraction script
    - For each of the 6 fallback strategies, change from `el.textContent.trim().substring(0, 2000)` to:
      ```
      try { window.__turndownService.turndown(el.innerHTML).substring(0, 3000) } catch(e) { el.textContent.trim().substring(0, 2000) }
      ```
    - Increase the substring cap slightly (2000 → 3000) since markdown includes formatting characters that add length but improve quality
    - Maintain the 6-strategy cascade order and logic unchanged
  - Wrap each Turndown call in try/catch with textContent fallback
  - Maintain ES5 syntax in the inline script string

  **Must NOT do**:
  - Do NOT change the `PageContent` interface or return type
  - Do NOT reorder or remove any of the 6 fallback strategies
  - Do NOT change the strategy selection logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Repetitive change across 6 strategies in one function
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/batch-grader.ts:389-485` — Current `extractPageContent()`. The 6 strategies in order: (1) Canvas rubric criteria table, (2) LMS assignment description, (3) MyOpenMath question region, (4) Submission preview iframe, (5) Generic page headings, (6) Page body text. Each ends with `cleanText(text).substring(0, 2000)`

  **Acceptance Criteria**:
  - [ ] All 6 fallback strategies use Turndown with textContent fallback
  - [ ] `PageContent` interface unchanged
  - [ ] Strategy order and selection logic unchanged
  - [ ] `cd ogre-desktop && npm run build` succeeds

  **QA Scenarios:**
  ```
  Scenario: extractPageContent code review
    Tool: Bash (grep/read)
    Preconditions: batch-grader.ts modified
    Steps:
      1. Read extractPageContent function from batch-grader.ts
      2. Count occurrences of 'turndown' or '__turndownService' in the function
      3. Verify at least 6 occurrences (one per strategy)
      4. Count occurrences of '.textContent' as fallback
      5. Verify at least 6 fallback occurrences
    Expected Result: Each strategy has both Turndown conversion and textContent fallback
    Failure Indicators: Some strategies still only use textContent, no fallback pattern
    Evidence: .sisyphus/evidence/task-6-code-review.txt
  ```

  **Commit**: YES (groups with T4, T5)
  - Message: `feat(ogre-desktop): integrate turndown markdown extraction in batch-grader`
  - Files: `src/lib/batch-grader.ts`

- [x] 7. Regression Tests + Integration Verification

  **What to do**:
  - Run the full vitest test suite: `cd ogre-desktop && npx vitest run`
  - Run the build: `cd ogre-desktop && npm run build`
  - Verify all existing tests pass (batch-grader, browser, discover, etc.)
  - Verify the new markdown-extract tests pass
  - Run a quick smoke test: import markdown-extract in a test and verify table/math/heading conversion works end-to-end
  - Check for any TypeScript compilation warnings
  - Save evidence files for all verification results

  **Must NOT do**:
  - Do NOT modify any source files — this task is verification only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive verification requiring careful review of all test results and build output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after all implementation)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 4, 5, 6

  **References**:

  **Pattern References**:
  - `ogre-desktop/package.json` — npm scripts for test and build commands
  - All test files in `ogre-desktop/src/lib/*.test.ts` — full test suite

  **Acceptance Criteria**:
  - [ ] `cd ogre-desktop && npx vitest run` — ALL tests pass (0 failures)
  - [ ] `cd ogre-desktop && npm run build` — exits 0
  - [ ] No TypeScript compilation errors or warnings
  - [ ] Evidence files saved for all results

  **QA Scenarios:**
  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All tasks T1-T6 completed
    Steps:
      1. Run: cd ogre-desktop && npx vitest run
      2. Capture full output
      3. Verify exit code is 0
      4. Count total tests, passed, failed
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, non-zero exit code
    Evidence: .sisyphus/evidence/task-7-full-suite.txt

  Scenario: Build succeeds
    Tool: Bash
    Preconditions: All tasks T1-T6 completed
    Steps:
      1. Run: cd ogre-desktop && npm run build
      2. Verify exit code is 0
      3. Check for any warnings in output
    Expected Result: Clean build with exit code 0
    Failure Indicators: Build failure, TypeScript errors, missing imports
    Evidence: .sisyphus/evidence/task-7-build.txt
  ```

  **Commit**: YES
  - Message: `test(ogre-desktop): verify turndown extraction regression and integration`
  - Files: evidence files only
---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` + `npm run build` in ogre-desktop. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify ES5 convention maintained in all inline webview scripts.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (Turndown injection + extraction + fallback). Test edge cases: empty HTML, math-only content, huge pages. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1. Check "Must NOT do" compliance — verify discover.ts NOT modified, browser-actions.ts NOT modified, return types NOT changed, no ES6 in inline scripts. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(ogre-desktop): add turndown dependencies and IIFE bundle build script` — package.json, scripts/build-turndown-bundle.js, src/lib/turndown-bundle.ts
- **T2+T3**: `feat(ogre-desktop): add markdown-extract utility with math preservation` — src/lib/markdown-extract.ts, src/lib/markdown-extract.test.ts
- **T4+T5+T6**: `feat(ogre-desktop): integrate turndown markdown extraction in batch-grader` — src/lib/batch-grader.ts
- **T7**: `test(ogre-desktop): verify turndown extraction regression and integration` — test files, evidence

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop && npx vitest run                              # Expected: all tests pass
cd ogre-desktop && npm run build                               # Expected: exit 0
cd ogre-desktop && npx vitest run src/lib/markdown-extract.test.ts  # Expected: all new tests pass
cd ogre-desktop && npx vitest run src/lib/batch-grader.test.ts      # Expected: existing tests still pass
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass (existing + new)
- [x] Build succeeds
- [x] Math content preserved in extraction
- [x] Graceful degradation verified
