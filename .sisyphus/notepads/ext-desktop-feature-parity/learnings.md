
## Task 3: Element Picker Scaffold (2025-02-18)

### Key Patterns Learned

1. **JS Injection Pattern**
   - Use IIFE `(function() { ... })()` to avoid global namespace pollution
   - Always include double-injection guard: `if (window._ogreElementPicker) return`
   - Store results in window object for retrieval via evalScript
   - Use window flags for cancellation/completion signals

2. **evalScript Integration**
   - `evalScript(script)` returns string result
   - `evalScriptJSON<T>(script)` parses JSON automatically
   - For complex results, store in window object and retrieve via JSON.stringify

3. **Element Picker Architecture**
   - Overlay captures all mouse events (z-index: 2147483646)
   - Highlight box follows hovered element (z-index: 2147483647)
   - Tooltip shows selector in real-time
   - Banner provides user instructions
   - Click stores result, Escape cancels

4. **DOMRect Serialization**
   - DOMRect has properties: x, y, width, height, top, left, bottom, right
   - Must manually extract properties for JSON serialization
   - Include all 8 properties for complete position/size info

5. **TypeScript Interface Design**
   - ElementPickerResult includes selector, tagName, id?, classes?, rect
   - rect is DOMRect (not serialized version)
   - Optional properties for id and classes (may not exist)

### Implementation Notes

- ELEMENT_PICKER_INJECT_JS is 4,697 characters
- Injection script is valid JavaScript (verified with Node.js)
- All 21 tests pass (TDD approach)
- Placeholder generateSelector() needs full implementation
- startElementPicker() and parsePickerResult() are stubs

### Next Implementation Steps

1. Implement startElementPicker() using evalScript pattern
2. Implement parsePickerResult() with validation
3. Implement generateSelector() with CSS selector generation
4. Add integration tests with mock webview

## Task 1: Site Profiles TypeScript Interfaces (2025-02-18)

### What We Learned

1. **Interface Reuse Pattern**
   - Existing batch-grader.ts already defines core interfaces: SiteProfile, SiteSelectors, FeedbackConfig, SaveConfig, NavigationConfig
   - Importing these avoids duplication and maintains single source of truth
   - New interfaces (ExtractionConfig, SiteProfileWithExtraction) extend existing ones

2. **Extraction Configuration Design**
   - Three response methods: childIndex (DOM path), iframe (selector), selector (direct CSS)
   - Three max score methods: parentTextRegex (regex on parent text), inputLabel (aria-label pattern), selector (direct CSS)
   - Each method has optional parameters (responsePath, iframeSelector, responseSelector, etc.)
   - Default max score fallback prevents extraction failures from breaking grading

3. **Built-in Profile Structure**
   - MyOpenMath: batch mode, tinymce-inline feedback, childIndex response extraction
   - Canvas SpeedGrader: sequential mode, tinymce-iframe feedback, iframe response extraction
   - Both profiles include full extraction config for immediate use without discovery

4. **ProfileStorage Interface Design**
   - Async/await for all operations (supports database, localStorage, or other backends)
   - Methods: listProfiles, getProfile, saveProfile, deleteProfile, findProfilesByUrl, getBuiltInProfiles, getSavedProfiles
   - Separates built-in (read-only) from saved (user-created) profiles
   - URL pattern matching enables automatic profile selection

5. **TDD Approach**
   - Tests written before implementation (20 passing type validation tests)
   - ProfileStorage CRUD tests are placeholders (expect.assertions(0))
   - Tests validate type structure, not behavior
   - Ready for implementation in next task

### Patterns to Reuse

- Import interfaces from batch-grader.ts instead of duplicating
- Use optional parameters for conditional extraction methods
- Separate built-in from user-created profiles in storage interface
- Use async/await for all storage operations
- Include full configuration in built-in profiles for immediate use

### Files Created

- `ogre-desktop/src/lib/site-profiles.ts` (180 lines)
- `ogre-desktop/src/lib/site-profiles.test.ts` (350 lines)

### Next Steps

- Implement ProfileStorage interface with SQLite backend
- Add profile discovery mechanism (AI-powered selector generation)
- Add profile validation and error handling
- Implement URL pattern matching algorithm


## Task 2: ProfileStorage Interface & SQLite Schema (2025-02-18)

### Key Learnings

1. **Migration Pattern in Tauri**
   - Migrations are defined in `src-tauri/src/lib.rs` as a vector of `Migration` structs
   - Each migration has: version (number), description (string), sql (string), kind (MigrationKind::Up)
   - Migrations run automatically on app startup via tauri-plugin-sql
   - Version numbers must be sequential (1, 2, 3, 4, 5, 6...)

2. **Database Interface Pattern**
   - Functions in `db.ts` follow consistent async patterns
   - CRUD operations use parameterized queries with `$1, $2, etc.` placeholders
   - Upsert operations use `INSERT ... ON CONFLICT ... DO UPDATE SET`
   - All functions are async and return Promise types

3. **SiteProfile Storage Design**
   - JSON fields (url_patterns, selectors, feedback, save, navigation) stored as TEXT
   - Caller is responsible for JSON.stringify() on write and JSON.parse() on read
   - This keeps the database schema simple while allowing flexible configuration
   - Timestamps use SQLite's datetime('now') for consistency

4. **TypeScript Compilation**
   - No errors when interfaces are properly exported
   - LSP diagnostics check catches issues before build
   - Build process uses Vite which handles TypeScript transpilation

### Patterns to Reuse

- Migration structure for future schema changes
- CRUD function naming: get/save/delete/find pattern
- Async/await for all database operations
- JSON serialization for complex config objects

### Files Modified

- `ogre-desktop/src-tauri/src/lib.rs` - Added Migration 6 for site_profiles table
- `ogre-desktop/src/lib/db.ts` - Added SiteProfile interface and 5 CRUD functions
- `ogre-desktop/src/lib/site-profiles.ts` - Already had ProfileStorage interface defined


## Task 4: Discovery Types & Prompts (TDD)

### Key Learnings

1. **Discovery Architecture**
   - Two navigation modes: BATCH (all students visible) vs SEQUENTIAL (one at a time)
   - Batch mode uses relative selectors within studentSection container
   - Sequential mode uses page-level selectors with navigation buttons
   - Feedback can be textarea, TinyMCE inline, TinyMCE iframe, or contenteditable

2. **Prompt Design**
   - System prompt is 1200+ chars of detailed instructions
   - User prompt is dynamic (includes page URL and DOM snapshot)
   - DOM snapshot truncated to 12000 chars to fit AI context
   - AI returns JSON with navigation, selectors, feedback config, and confidence

3. **Type System**
   - NavigationMode: "batch" | "sequential"
   - FeedbackType: "textarea" | "tinymce-inline" | "tinymce-iframe" | "contenteditable" | "unknown"
   - DiscoveryResult: Complete AI response structure
   - SelectorMap: CSS selectors for all page elements
   - ValidationResults: Match counts and sample text for each selector

4. **TDD Approach**
   - 27 passing unit tests for types and prompts
   - 21 failing integration tests marked with .todo()
   - Tests verify prompt content, JSON parsing, and validation logic
   - Separation of concerns: parsing vs validation

5. **Helper Functions**
   - parseDiscoveryResponse(): Handles JSON in various formats (code fences, thinking blocks)
   - isValidDiscoveryResult(): Validates required fields and types
   - Both are pure functions with no side effects

### Implementation Patterns

1. **Prompt Templates**
   ```typescript
   export const DISCOVERY_SYSTEM_PROMPT = `...`; // Static
   export function DISCOVERY_USER_PROMPT_TEMPLATE(pageUrl, domSnapshot) { ... } // Dynamic
   ```

2. **Type Validation**
   - Use type guards (isValidDiscoveryResult) for runtime validation
   - Separate parsing (JSON.parse) from validation (structure check)
   - Throw on unparseable input, return false on invalid structure

3. **Error Handling**
   - parseDiscoveryResponse throws on invalid JSON
   - isValidDiscoveryResult returns boolean (no throw)
   - Regex fallback for JSON extraction from various formats

### Next Implementation Steps

1. **discoverSelectors()** - Main discovery function
   - Capture screenshot and DOM snapshot in parallel
   - Call AI with system + user prompts
   - Parse and validate response
   - Return draft + validation results

2. **validateSelectors()** - Selector validation
   - Test each selector on live page
   - Count matches with querySelectorAll
   - Extract sample text from matches
   - Handle batch vs sequential modes

3. **Integration Points**
   - Use grading-api.ts for AI calls (already has provider/model selection)
   - Use browser.ts for page snapshots
   - Reuse SSE parsing for streaming responses

### Testing Insights

- Unit tests for parsing/validation are fast and reliable
- Integration tests need browser context (marked as .todo())
- Prompt content verification ensures AI gets correct instructions
- Large DOM snapshot truncation prevents context overflow

### Files Created

- `ogre-desktop/src/lib/discover.ts` (450+ lines)
   - 10 TypeScript interfaces
   - 2 prompt templates
   - 2 helper functions
   - Comprehensive JSDoc

- `ogre-desktop/src/lib/discover.test.ts` (400+ lines)
   - 27 passing unit tests
   - 21 failing integration tests (.todo())
   - Tests for parsing, validation, prompts


## Task 8: BatchLogEntry Interface & Log Accumulation (2025-02-18)

### Key Learnings

1. **BatchLogEntry Interface Design**
   - Fields: studentName, studentIndex, score (number | null), feedback, timestamp (ISO 8601), status ('success' | 'error' | 'skipped')
   - score is null for error/skipped entries
   - feedback contains error message for error status, skip reason for skipped status
   - timestamp is always ISO 8601 string from new Date().toISOString()

2. **Log Accumulation Pattern**
   - Private _log: BatchLogEntry[] array initialized in start()
   - getLog() returns a copy (spread operator) to prevent external mutation
   - Log entries added in three places:
     * applyGrade() → status: 'success' with score and feedback
     * recordError() → status: 'error' with null score and error message
     * start() → status: 'skipped' for students with feedback or existing scores

3. **Timestamp Management**
   - Each entry gets new Date().toISOString() at creation time
   - Ensures chronological ordering without explicit sorting
   - ISO 8601 format is standard and sortable

4. **Test Strategy**
   - 13 passing tests covering:
     * getLog() returns empty array initially
     * getLog() returns new array each call (immutability)
     * BatchLogEntry interface structure validation
     * Error entry accumulation
     * Skipped entry logging during start()
     * Log reset on new session
     * Chronological ordering of entries
   - Tests use recordError() instead of applyGrade() to avoid mocking fillGrade
   - Mock evalScriptJSON for start() tests to control student extraction

5. **Implementation Notes**
   - Log is ephemeral (per session, not persisted)
   - No UI yet - data structure only
   - getLog() is read-only accessor (returns copy)
   - All 13 tests pass, no TypeScript errors

### Files Modified

- `ogre-desktop/src/lib/batch-grader.ts` (1200+ lines)
   - Added BatchLogEntry interface (lines 201-213)
   - Added _log property to BatchGrader class
   - Updated start() to initialize _log and log skipped entries
   - Updated applyGrade() to log success entries
   - Updated recordError() to log error entries
   - Added getLog() method

- `ogre-desktop/src/lib/batch-grader.test.ts` (NEW, 350+ lines)
   - 13 passing tests for log functionality
   - Tests for interface structure, accumulation, immutability, reset, ordering

### Next Implementation Steps

1. **UI Display** - Create log viewer component
2. **Log Export** - Add CSV/JSON export functionality
3. **Log Filtering** - Filter by status, student name, date range
4. **Log Persistence** - Optional: save to SQLite for session history

### Testing Insights

- recordError() is easier to test than applyGrade() (no DOM mocking needed)
- Immutability testing via spread operator works well
- Chronological ordering verified via timestamp comparison
- Mock evalScriptJSON for start() to control student extraction behavior


## Task 5: ProfileStorage CRUD Implementation (2026-02-18)

### Key Learnings

1. **Domain ↔ DB Serialization**
   - db.ts SiteProfile uses flat JSON strings (url_patterns, selectors, etc.)
   - batch-grader.ts SiteProfile uses structured objects (urlPatterns, selectors as SiteSelectors, etc.)
   - serializeProfile(): domain → DB (JSON.stringify each nested object)
   - deserializeProfile(): DB → domain (JSON.parse each string field, isBuiltIn: false)

2. **Built-in Profile Merging Strategy**
   - listProfiles() returns BUILT_IN_PROFILES first, then DB rows (excluding built-in IDs)
   - getProfile() checks built-in array before hitting DB
   - getSavedProfiles() filters out any DB rows matching built-in IDs
   - This prevents duplicates if a built-in ID somehow gets into the DB

3. **Test Mocking Pattern for Tauri DB**
   - `@tauri-apps/plugin-sql` not available in vitest — must mock db.ts
   - vi.hoisted() for creating mockStore Map before vi.mock() hoisting
   - vi.mock('./db', factory) with in-memory Map replacing SQLite
   - mockStore.clear() in beforeEach for test isolation
   - Mock saveSiteProfile stores serialized data, getSiteProfile returns it

4. **Type Re-export Pattern**
   - site-profiles.ts imports types from batch-grader.ts for local use
   - Added `export type { SiteProfile, ... }` for consumer convenience
   - Tests use `import type { ... }` which resolves through re-exports
   - Import alias `type SiteProfile as DbSiteProfileRow` avoids name collision with batch-grader's SiteProfile

### Implementation Summary

- ProfileStorageImpl: 7 methods, ~60 lines
- serializeProfile/deserializeProfile: ~30 lines
- Test: 7 real CRUD tests replacing placeholders, all passing
- Total: 34/34 tests pass, 0 LSP errors


## Task 6: Element Picker Injection with Hover Highlighting (2026-02-18)

### Key Learnings

1. **startElementPicker() Polling Pattern**
   - Inject ELEMENT_PICKER_INJECT_JS via `evalScript()`
   - Poll with `evalScriptJSON()` checking `window._ogreElementPickerResult` and `window._ogreElementPickerCancelled`
   - 100ms poll interval, 2-minute timeout
   - Clean up window flags after reading result/cancelled state

2. **stopElementPicker() via Exposed Cleanup**
   - IIFE stores `window._ogreElementPickerCleanup = cleanup` inside the injected script
   - External stop calls `window._ogreElementPickerCleanup()` via evalScript
   - Also resets all window flags: result, cancelled, cleanup ref, picker flag

3. **parsePickerResult() Validation**
   - Validates required fields: selector (string), tagName (string), rect (object)
   - Optional fields: id (string or undefined), classes (array or undefined)
   - Throws descriptive errors for each missing field

4. **Full generateSelector() from Chrome Extension**
   - Ported 5-strategy selector generation from element-picker.js
   - Strategy order: unique ID → semantic attrs → data attrs → classes → parent context → tag fallback
   - Added generateParentSelector() helper for parent context strategy
   - Uses CSS.escape() for safe selector values
   - Uses var/for-loops (not const/for-of) for broader webview compat

5. **Test Mocking for evalScript**
   - `vi.mock('./browser', () => ({ evalScript: vi.fn(), evalScriptJSON: vi.fn() }))`
   - MockedFunction typing: `evalScript as MockedFunction<typeof evalScript>`
   - First poll returns result immediately (no timer manipulation needed)
   - Multiple polls tested via mockResolvedValueOnce chaining

### Before → After

- **Before**: 21 tests, 1 unhandled rejection error, stubs throwing "Not implemented"
- **After**: 33 tests, 0 errors, all functions fully implemented

### Files Modified

- `ogre-desktop/src/lib/element-picker.ts` - Full implementation (280+ lines)
- `ogre-desktop/src/lib/element-picker.test.ts` - 33 passing tests with mocked browser


## Task 9: runDiscovery() Workflow with AI Integration (2026-02-18)

### Key Learnings

1. **Discovery Workflow Architecture**
   - 5-stage async pipeline: capture → AI call → parse → validate → return
   - DOM snapshot + screenshot captured in parallel via Promise.all
   - Progress callback at each stage for UI feedback
   - Error handling wraps entire workflow, reports via progress callback

2. **DOM Snapshot via evalScript**
   - Full DOM walker script as string constant (DOM_SNAPSHOT_SCRIPT)
   - Mirrors Chrome extension's capturePageSnapshot logic exactly
   - 500 node cap, depth 8, 150 char text limit
   - Returns JSON string from IIFE, parsed on TypeScript side
   - Uses var/for-loops for webview compatibility (no const/for-of)

3. **AI Call Pattern for Vision**
   - POST /api/chat with `images: [screenshot]` array for vision support
   - Includes `systemPrompt` field for discovery-specific instructions
   - Handles both SSE and JSON response modes
   - extractContentFromSSE() concatenates message event content
   - Provider/model overrides passed through to server

4. **Selector Validation via evalScript**
   - buildValidationScript() generates inline JS with serialized selector map
   - Supports batch mode (relative selectors within studentSection)
   - Supports sequential mode (page-level selectors)
   - Navigation selectors (_navNext, _navPrev, etc.) merged for validation
   - Returns match counts + sample text for each selector

5. **Auth Pattern Reuse**
   - authHeaders() identical to grading-api.ts pattern
   - Uses getHandshakeToken() from provider-sync.ts
   - Bearer token auth for all server requests

### Implementation Summary

- Added to existing discover.ts (types/prompts were already there from Task 4)
- New exports: runDiscovery(), DiscoveryOptions
- Internal functions: captureDomSnapshot(), callDiscoveryAI(), extractContentFromSSE(), buildValidationScript(), validateSelectors()
- 0 LSP errors, 0 warnings on discover.ts
- Reuses all existing types (DiscoveryResult, DiscoveryWorkflow, ValidationResults, etc.)

### Architecture Decisions

- **No new types**: Reused DiscoveryWorkflow, DiscoveryOptions extends existing patterns
- **Private authHeaders**: Duplicated from grading-api.ts instead of exporting (avoids coupling)
- **SSE fallback**: callDiscoveryAI handles both SSE stream and JSON response from /api/chat
- **Parallel capture**: DOM snapshot, screenshot, and URL fetched concurrently


## Task 10: Discovery-Picker Integration (2026-02-18)

### Key Learnings

1. **Integration Architecture**
   - New module `discovery-picker-integration.ts` bridges element-picker.ts and discover.ts
   - Does NOT modify either source file — pure integration layer
   - Uses existing `startElementPicker()` and `stopElementPicker()` from element-picker.ts
   - Uses existing `DiscoveryResult`, `SelectorMap`, `ValidationResults` from discover.ts

2. **Refinement Flow**
   - `refineSelector(baseSelector)`: Highlights matches → starts picker → clears highlights
   - Highlight uses orange dashed outlines via data attributes (not class-based)
   - Cleanup restores original inline styles via data-ogre-original-* attributes
   - Always clears highlights (even on cancel/timeout) via try/finally pattern

3. **Selector Merging Strategy**
   - Picker with unique ID → always wins (most specific)
   - AI selector when picker gives tag-only fallback → AI wins
   - Empty/whitespace AI selector → picker wins
   - Default: picker wins (user explicitly chose the element)

4. **Ambiguity Detection**
   - `identifyAmbiguousSelectors()` flags: no-match, too-many-matches, ambiguous
   - Default threshold: 50 matches (configurable)
   - Only flags ambiguous when confidence is NOT high
   - Skips selectors marked as skipped in validation

5. **Batch Refinement**
   - `batchRefineSelectors()` processes requests sequentially
   - Cancelled refinements skipped (continue to next)
   - Each success updates running discovery state
   - Returns both updated discovery and applied refinements array

### Files Created

- `ogre-desktop/src/lib/discovery-picker-integration.ts` (~310 lines)
- `ogre-desktop/src/lib/discovery-picker-integration.test.ts` (~460 lines, 44 tests)


## Task 11: Rubric Screenshot Capture & AI Parsing (2026-02-18)

### Key Learnings

1. **Reusing callDiscoveryAI() for Vision Requests**
   - The existing `callDiscoveryAI()` in discover.ts already handles sending images
     to `/api/chat` with `systemPrompt` and `images` array fields
   - SSE/JSON response handling is built-in
   - Auth headers via `authHeaders()` are already available
   - No need to create a new API call function

2. **Prompt Design: prompts.js → discover.ts**
   - Original Chrome extension prompt (`getRubricExtractionFromImagePrompt`) is minimal
   - Enhanced prompt adds: numeric points enforcement, question tagging,
     suggestedName extraction, range→max rule, missing points estimation
   - Prompt explicitly says "no markdown fences" to avoid wrapping issues
   - Includes JSON schema with `question` field (optional, for multi-Q rubrics)

3. **AI Response Parsing Robustness**
   - AI models inconsistently name fields (`criteria` vs `name`)
   - Points can come as strings ("5") or numbers (5) — must coerce
   - Points can be NaN for values like "N/A" — clamp to 0
   - Question numbers can be strings ("1") or numbers (1) — coerce
   - Code fences, thinking blocks, and embedded JSON all handled
   - Fallback regex `/"rubric"[\s\S]*\}/` catches JSON in surrounding text

4. **SavedRubric Compatibility**
   - Function returns `RubricExtractionResult` (criteria + maxScore + suggestedName)
   - `criteria` uses `RubricCriterion` type imported from rubric-api.ts
   - Deliberately does NOT include `id`, `createdAt`, `updatedAt` (server-generated)
   - Caller should present to user for confirmation, then call `createRubric()`

5. **Separation of Concerns**
   - `parseRubricExtractionResponse()` is pure (no side effects, fully testable)
   - `parseRubricFromScreenshot()` is the async entry point (validates URL, calls AI, parses)
   - `isValidRubricExtractionResult()` is a type guard for runtime validation
   - Data returned for UI confirmation — no auto-save

### Test Coverage

- 28 new unit tests:
  - 15 for parseRubricExtractionResponse (valid JSON, code fences, thinking blocks,
    string points, NaN, question numbers, empty names, name fallback, errors, embedded JSON)
  - 9 for isValidRubricExtractionResult (valid/invalid shapes)
  - 3 for RUBRIC_EXTRACTION_PROMPT (content verification)
  - 1 for parseRubricFromScreenshot type guard on image URL
- 5 integration todos for parseRubricFromScreenshot (require server)

### Files Modified

- `ogre-desktop/src/lib/discover.ts` — Added ~170 lines:
  - Import: `RubricCriterion` from rubric-api.ts
  - Types: `RubricExtractionResult`, `RubricScreenshotOptions`
  - Prompt: `RUBRIC_EXTRACTION_PROMPT`
  - Functions: `parseRubricExtractionResponse()`, `isValidRubricExtractionResult()`,
    `parseRubricFromScreenshot()`

- `ogre-desktop/src/lib/discover.test.ts` — Added ~200 lines:
  - 28 passing tests + 5 integration todos

### Pre-existing Issues Noted

- `BatchPanel.svelte` has 5 LSP errors (missing exports, type mismatches)
  — unrelated to this task, existed before changes.

## Task 15: Rubric Import Component (2026-02-18)

### Key Learnings

1. **Visual Capture Workflow**
   - The flow of "Capture -> Crop -> Parse -> Review -> Save" is robust
   - Uses `captureWebviewScreenshot` (global view) then `ScreenshotOverlay` (cropping)
   - This separation (capture first, then overlay) ensures the overlay doesn't capture itself

2. **Staging State Pattern**
   - Introduce `stagingRubric` state to hold AI results *before* persistence
   - Allows user to edit extracted data (name, points, criteria) before committing
   - "Review first, save later" pattern prevents bad data from entering the library

3. **Component Reusability**
   - `ScreenshotOverlay` reused from main discovery flow without modification
   - `RubricImport.svelte` is self-contained but uses shared libs (`browser`, `discover`, `rubric-api`)
   - Can be embedded in any parent component (e.g. Rubric Library page)

4. **Svelte 5 Runes Usage**
   - `$state` for local reactivity (isCapturing, stagingRubric, etc.)
   - `$props` for component interface (onImport callback)
   - `$bindable` for two-way binding with child components (ScreenshotOverlay visibility)

### Implementation Summary

- Created `RubricImport.svelte` (~300 lines)
- Integrated 3 core libraries: browser, discover, rubric-api
- Full error handling and loading states
- Clean UI with preview/edit capabilities

### Files Created

- `ogre-desktop/src/components/grading/RubricImport.svelte`
