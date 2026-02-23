# Agent Mode Enhancement - Learnings

## CDP + WebView2 Targeting (Task 2 Spike)

### Key Patterns Discovered

1. **WebView2 CDP Activation**: Set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` env var BEFORE WebView2 process creation. In Tauri, this means before `tauri::Builder::default().build()`.

2. **lib.rs Initialization Order**:
   - `run()` at line 607
   - migrations vec at line 608
   - `tauri::Builder::default()` at line 721
   - `.build()` at line 858
   - ENV VAR must be set between lines 607-608 (top of run())

3. **Target Identification**: CDP exposes all WebView2 webviews via `/json`. They are distinguishable by URL:
   - Main app: `tauri://localhost` or `https://tauri.localhost`
   - Dev mode: `http://localhost:1420` or `http://localhost:5173`
   - Embedded browser: Any external URL (the grading site)
   - CDP does NOT expose Tauri webview labels (like `embedded-browser`)

4. **IPv4 Gotcha**: Always use `127.0.0.1` not `localhost` for CDP connections on Windows — WebView2 may bind IPv4 only.

5. **Embedded browser is lazy**: It only appears as a CDP target AFTER `create_embedded_browser` is called (lib.rs:201). Must wait for user to navigate to a grading page.

6. **Playwright Integration**: `playwright-core` connects via `chromium.connectOverCDP('http://127.0.0.1:9222')`. No browser downloads needed.

### Conventions Used
- Spike scripts go in `ogre-desktop/spike/`
- Results documented in `ogre-desktop/spike/SPIKE-RESULTS.md` (append new sections)
- Scripts use `npx tsx` or `bun run` for execution


## Fuzzy DOM Matching (Task 3)

### Design Decisions
 Used `import type` (not `import`) for InteractiveElement — project enforces `verbatimModuleSyntax`
 Pure module: zero side effects, no browser/DOM imports, no external deps
 4 strategies in priority order: text → id/class → aria-label → tag+position

### Selector Parsing Patterns
 Text extraction: `:has-text("...")`, `:text("...")`, `[title="..."]`, generic quoted strings
 ID extraction: `/#([\w-]+)/` — strips `#` prefix
 Class extraction: `/\.(\w-]+)/g` — strips `.` prefix, returns array
 Aria-label: `/\[aria-label=["']([^"']+)["']\]/i`
 Tag: `/^([a-z][a-z0-9]*)/i` — leading tag name only

### Edge Cases Handled
 Empty `failedSelector` → immediate null
 Empty/null `elements` array → immediate null via `elements?.length`
 `null`/`undefined` element fields → optional chaining throughout (`el.id?.includes()`, `el.text?.toLowerCase()`)
 Strategy returns null → falls through to next strategy
 All strategies fail → returns null (caller handles screenshot fallback)

## Agent Loop Compact Mode + Screenshot Retry (Task 5)

### Patterns

1. **Compact mode suppression**: `config.compact ?? true` defaults on. Thinking events skipped only when `isCompact && config.mode === 'auto'`. Review mode always gets thinking events.

2. **Screenshot retry flow**: After `executeAction()` fails with selector error, we:
   - Check `!result.success && action !== 'done' && typeof params.selector === 'string'` and regex `/not found|element not found/i` on `result.error`
   - Compare `currentActionKey` against `lastFailedAction` to cap at 1 retry per unique action
   - Append screenshot + retry message to conversation history
   - `continue` without incrementing `stepCount` (free retry)
   - On success, clear `lastFailedAction = null`

3. **Conversation history typing**: The array uses `{ role: string; content: string }` — adding `screenshot` field requires `as any` spread to satisfy the type without changing the interface.

4. **Pre-existing errors**: `svelte-check` reports 6 errors in `discovery-picker-integration.ts` (SelectorMap typing) — unrelated to agent-loop changes.

## Playwright Executor Module (Task 6)

### Implementation Patterns

1. **Dynamic import for playwright-core**: `const { chromium } = await import('playwright-core')` inside `connectCDP()` — avoids Vite bundling Node.js APIs (`net`, `fs`, `child_process`).

2. **Type-only imports are safe**: `import type { Browser, Page } from 'playwright-core'` has zero runtime cost and is erased by TypeScript. Only runtime imports need dynamic `import()`.

3. **CDP target filtering algorithm**: Fetch `/json`, filter to `type === 'page'`, exclude `about:blank`, empty URLs, and MAIN_APP_PATTERNS (tauri://localhost, https://tauri.localhost, dev server ports). The remainder is the embedded browser.

4. **Page matching strategy**: After `connectOverCDP`, iterate `browser.contexts()` → `ctx.pages()` and match by URL against the pre-discovered embedded target. Fallback loop for URL drift.

5. **safeEvaluate wrapper**: Serializes the function via `.toString()` and checks against `DANGEROUS_JS_PATTERNS` before passing to `page.evaluate()`. Catches patterns like `eval(`, `document.write`, `fetch(` etc.

6. **Playwright fill() semantics**: `locator.fill(text)` clears the field before filling. For `clear: true`, explicit `fill('')` first triggers clearing events separately before the actual fill.

7. **Error handling convention**: All public action functions (`pwClick`, `pwType`, etc.) catch all errors and return `{ success: false, error }` — matching the `ActionResult` pattern from `browser-actions.ts`. Never throw.

8. **Module-scoped state**: `browser` and `page` stored as module-level `let` variables. Not global — scoped to the module. Cleaned up in `disconnectCDP()`.