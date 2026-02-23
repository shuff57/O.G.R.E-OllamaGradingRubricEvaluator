# Draft: Turndown HTML-to-Markdown Extraction Enhancement

## Requirements (confirmed)
 **Enhancement direction**: Turndown integration for local HTML-to-Markdown conversion
 **FireCrawl verdict**: Not suitable as primary tool (auth walls, cost, latency)
 **Core problem**: All current extraction uses raw `.textContent.trim()`, losing structural information (tables, headings, lists)

## Research Findings

### Current Extraction Architecture
 Desktop App uses `evalScript`/`evalScriptJSON` to run JS in Tauri webview
 Student responses extracted via CSS selectors + hardcoded child-index paths
 DOM snapshots capped at 500 nodes / 12K chars for AI discovery
 `extractPageContent()` has 6 cascading fallback strategies ending with raw body text
 No HTML-to-Markdown conversion anywhere in the project
 Turndown library: npm `turndown` + `turndown-plugin-gfm` for table support
 Can run in-browser (inject script into webview) or server-side

### Key Files Affected
 `ogre-desktop/src/lib/discover.ts` -- DOM snapshot for AI discovery (lines 532-586)
 `ogre-desktop/src/lib/batch-grader.ts` -- Student response + rubric extraction
 `ogre-desktop/src/lib/agent-dom.ts` -- Interactive element capture (likely unchanged)
 `ogre-desktop/src/lib/browser-actions.ts` -- Agent readText action
 `ogre-desktop/src/lib/browser.ts` -- Core evalScript functions

### Extraction Points That Would Benefit
1. **Student response extraction** (batch-grader.ts:240-260) -- `textContent` to markdown
2. **Rubric extraction** (batch-grader.ts:277-374) -- essay prompt, checklist items
3. **Page content fallback** (batch-grader.ts:389-485) -- `textContent.substring(0,2000)` to markdown
4. **Discovery DOM snapshot** (discover.ts:532-586) -- 500-node JSON tree to markdown of key regions
5. **Agent readText** (browser-actions.ts:255) -- `innerText.substring(0,5000)` to markdown

## Technical Decisions
 Turndown can be bundled as a browser-side script (runs in webview context)
 GFM plugin needed for tables (common in rubrics)
 No external API calls needed -- runs locally, free

## Answered Questions
 **Which extraction points?** ALL 5 -- student responses, rubric, page content fallback, discovery DOM snapshot, agent readText
 **Test infrastructure?** YES -- vitest, existing .test.ts files in ogre-desktop/src/lib/
 **Problem pages?** MyOpenMath works fine; enhancement is forward-looking for Canvas, Moodle, Blackboard
 **Desktop or /grade skill?** Desktop app only (ogre-desktop)
## Scope Boundaries
 INCLUDE: All 5 extraction points in ogre-desktop, Turndown + GFM plugin, tests
 EXCLUDE: FireCrawl MCP, /grade skill changes, new LMS site profiles

## Test Strategy Decision
 **Infrastructure exists**: YES (vitest)
 **Automated tests**: YES (tests-after) -- new utility functions get unit tests
 **Agent-Executed QA**: Mandatory for all tasks