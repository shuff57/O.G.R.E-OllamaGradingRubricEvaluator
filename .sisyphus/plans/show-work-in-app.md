# Show-Your-Work Grading: Native O.G.R.E. App Integration

## TL;DR

> **Quick Summary**: Port the standalone `grade-show-work` Claude skill into the O.G.R.E. Tauri desktop app as a first-class grading mode. Students who upload handwritten/photo work on `gbviewassess.php` will be evaluated via vision AI, receive bonus point recommendations, and the teacher approves/rejects before any scores are applied.
>
> **Deliverables**:
> - GradingPanel 2-level mode system: Level 1 `[Single | All-in-One | Sequential]`, Level 2 `[Free Response | Show Work]`
> - Vision model gating: gray out non-vision providers/models in ProviderSelector
> - `show-work-types.ts` — full TypeScript interface set
> - `show-work-scanner.ts` — DOM extraction + eligibility filter for `gbviewassess.php`
> - `show-work-evaluator.ts` — image fetch → base64 → AI vision → bonus decision
> - `show-work-applier.ts` — navigate to student → fill scores → dispatch save
> - `show-work-session.ts` — SQLite CRUD for `show_work_sessions` table
> - `vision-models.ts` — `VISION_MODEL_PATTERNS`, `isVisionModel()` helper
> - `ShowWorkPanel.svelte` — scan progress, report table, approval flow
> - Migration 12: `show_work_sessions` table + `maxStudentsPerSession` setting
> - Settings UI: configurable session limit
>
> **Estimated Effort**: L (17 implementation tasks + 4 verification)
> **Parallel Execution**: YES — 5 waves + verification
> **Critical Path**: Wave 0 spike → Wave 1 foundation → Wave 2 pipeline → Wave 3 UI + applier → Wave 4 integration

---

## Context

### Original Request
User asked: "how will I invoke the show work skill in app?" → "ok so lets make a plan to incorporate as a skill in ogre so I can use it in app." The standalone `/grade-show-work` skill runs in Claude/OpenCode + Playwriter. Goal is to make it a native mode in the O.G.R.E. desktop app so it runs from the GradingPanel like any other grading mode.

### Architecture Decisions (User-Confirmed)

**Q1 — UI Structure**: 2-level mode system inside the existing `grader` tab:
- **Level 1**: `[Single | All-in-One | Sequential]` — replaces the current `[Single | Batch]` toggle
  - `Single` = existing single-student card (unchanged)
  - `All-in-One` = existing batch grader on `gradeallq2.php` (unchanged behavior)
  - `Sequential` = student-by-student on `gbviewassess.php` (new; future Canvas compatibility)
- **Level 2**: `[Free Response | Show Work]` — visible when Level 1 is not `Single`
  - `Free Response` = existing batch grading logic
  - `Show Work` = new pipeline: upload detection → vision eval → approval → apply bonus
- `All-in-One + Show Work` = disabled ("coming soon") in MVP

**Q2 — Vision**: Gray out non-vision-capable providers/models in the existing ProviderSelector. New `requiresVision` prop triggers visual disabling.

**Q3 — Session limit**: Configurable setting, default = no limit. Stored in `app_settings.maxStudentsPerSession`.

**Q4 — Persistence**: SQLite only. New `show_work_sessions` table in Migration 12.

### Metis Findings (Pre-Analysis)
- Grading server `providers.js` ALREADY handles multimodal `image_url` content blocks for all 4 providers. Zero server changes needed.
- No image download pipeline exists in the app. Must build fetch → base64 pipeline.
- No sequential page navigation pattern exists. CDP stability across `gbviewassess.php` full-page reloads is the highest-risk item.
- No "report → approve → bulk apply" UI pattern exists. Net-new UI work.
- App has zero references to `gbviewassess.php`. Selectors must be ported from the skill.

---

## Work Objectives

### Core Objective
Add a native "Show Work" grading mode to the O.G.R.E. desktop app — enabling teachers to evaluate student-uploaded handwritten/photo work on MyOpenMath `gbviewassess.php` pages, award +2/+1/+0 bonus points per question, and apply approved scores without leaving the app.

### Concrete Deliverables
- `src/lib/show-work-types.ts` — `StudentScan`, `EligibleQuestion`, `BonusEvaluation`, `ShowWorkReport`, `ShowWorkSessionState`
- `src/lib/show-work-scanner.ts` + `.test.ts` — DOM extraction + eligibility filter
- `src/lib/show-work-evaluator.ts` + `.test.ts` — image fetch, base64, AI vision call, bonus decision
- `src/lib/show-work-applier.ts` + `.test.ts` — navigate to student, fill scores, dispatch input events
- `src/lib/show-work-session.ts` + `.test.ts` — SQLite CRUD for session state
- `src/lib/vision-models.ts` + `.test.ts` — vision capability detection
- `src/components/grading/ShowWorkPanel.svelte` — primary UI component
- Updated `GradingPanel.svelte` — 2-level mode system
- Updated `ProviderSelector.svelte` — `requiresVision` prop with greyed-out non-vision options
- Updated `src-tauri/src/lib.rs` — Migration 12
- Settings UI entry for `maxStudentsPerSession`
- Spike report `.sisyphus/evidence/show-work-spike.md`

### Definition of Done
- [ ] `npx vitest run` — all existing + new tests pass
- [ ] `npm run tauri build` (or `npm run build`) — zero compile errors
- [ ] `npx tsc --noEmit` — zero type errors
- [ ] GradingPanel shows 3-way Level 1 toggle and Level 2 toggle in grader tab
- [ ] `Sequential + Show Work` mode renders ShowWorkPanel
- [ ] ShowWorkPanel completes scan → shows report → user approves → scores applied
- [ ] Non-vision Ollama models visually disabled when `requiresVision=true`
- [ ] `show_work_sessions` table exists after migration
- [ ] Spike confirms: CDP survives full-page navigation on `gbviewassess.php`
- [ ] Spike confirms: `tauriFetch` can download from `files.myopenmath.com`
- [ ] Spike confirms: vision API round-trip returns bonus evaluation

### Must Have
- Sequential + Show Work grading mode end-to-end
- Vision model gating in ProviderSelector
- Report-then-approve guardrail (NEVER apply without explicit user confirmation)
- SQLite persistence for session state
- Configurable `maxStudentsPerSession` setting
- Bonus-only guardrail: additive points only, never reduce scores, never exceed question max
- Image resize before base64 encoding (cap at 1MB per image)

### Must NOT Have (Guardrails)
- **No new agent actions in `agent-types.ts`** — show-work is a structured pipeline, not an agent action
- **No grading-server changes** — multimodal already works in `providers.js`
- **No `as any` casts** — explicit typing throughout
- **No inline score editing in approval table** — read-only table with approve/skip checkboxes only (MVP)
- **No PDF/HEIC support in MVP** — detect unsupported extensions and skip with note
- **No All-in-One + Show Work** — disabled "coming soon" in MVP
- **No new top-level mode tabs** — show-work lives inside the grader tab's 2-level system
- **No hardcoded student limit** — must use configurable `maxStudentsPerSession`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: `npx vitest run` — run test suites, assert pass count
- **Types**: `npx tsc --noEmit` — verify zero type errors
- **Spike**: CDP script + `tauriFetch` test + `/api/chat` call — assert each succeeds with evidence
- **UI**: Svelte component compile check + `npx vitest run`
- **Migration**: SQLite query — assert table exists with correct columns
- **Integration**: `npx vitest run` on integration test file

---

## Key Selectors Reference (gbviewassess.php)

```
Student name:        h2
Question container:  div.bigquestionwrap
Score input:         input#scoreboxN  or  input#scoreboxN-M  (multi-part)
Max score:           scoreInput.nextSibling (text node: " /10")
Work upload pane:    div.questionpane.viewworkwrap
File download link:  a.attach.prepped[target="_blank"]
File URL pattern:    https://files.myopenmath.com/ufiles/{uid}/{filename}  (no auth required)
Save and Next:       button with text "Save and Next Student" (primary class)
```

---

## Architecture Reference

### Files Changed or Created

```
ogre-desktop/src/
├── lib/
│   ├── show-work-types.ts          NEW — type definitions
│   ├── show-work-scanner.ts        NEW — DOM extraction + eligibility
│   ├── show-work-evaluator.ts      NEW — image fetch + AI vision
│   ├── show-work-applier.ts        NEW — score fill + save navigation
│   ├── show-work-session.ts        NEW — SQLite CRUD
│   └── vision-models.ts            NEW — vision capability detection
└── components/grading/
    ├── GradingPanel.svelte         MODIFIED — 2-level mode system
    ├── ProviderSelector.svelte     MODIFIED — requiresVision prop
    └── ShowWorkPanel.svelte        NEW — main show-work UI

ogre-desktop/src-tauri/src/
└── lib.rs                          MODIFIED — Migration 12

Settings page                       MODIFIED — maxStudentsPerSession input
```

### Key Patterns to Follow

| Pattern | Source File | Lines |
|---------|-------------|-------|
| Mode tab toggle | `GradingPanel.svelte` | 89-93, 349-365 |
| State machine phases | `confirmation-flow.ts` | 14-50 |
| SQLite migration | `lib.rs` | search `migration_11` for format |
| SQLite CRUD | `db.ts` | `getSetting`, `saveSetting` |
| Image fetch (Tauri HTTP) | `grading-api.ts` | line 9 (`tauriFetch`) |
| Score fill + dispatch | `cdp-actions.ts` | `pwType()` |
| Page-load detection | `browser.ts` | `listenBrowserPageLoaded` |
| CDP eval | `browser.ts` | `evalScriptJSON()` |
| Batch session interface | `batch-grader.ts` | lines 1-180 |
| AI chat call | `grading-api.ts` | `sendChatMessage` |

---

## Wave 0 — Spike: Validate All Three Risk Items

> **Gate condition**: If ANY of the three spike validations fail, STOP and report. Do not proceed to Wave 1.

### T0 — Spike: CDP navigation + image fetch + vision API

**What**: Three throwaway tests that validate the three highest-risk assumptions before building the real pipeline.

**Acceptance Criteria**:
```bash
# Evidence file must exist and contain PASS for all three
cat .sisyphus/evidence/show-work-spike.md
# Must contain:
# CDP Navigation: PASS (5 consecutive navigations, URLs changed correctly)
# Image Fetch: PASS (received N bytes from files.myopenmath.com)
# Vision API: PASS (received evaluation text with +2/+1/+0 language)
```

**Spike 1 — CDP full-page navigation stability**:
- Navigate browser to a `gbviewassess.php` URL
- Use CDP `Runtime.evaluate` via `evalScriptJSON()` to extract `document.querySelector('h2').textContent`
- Call CDP to click "Save and Next Student" button
- Wait for `listenBrowserPageLoaded` event
- Repeat `evalScriptJSON()` on new page — assert it returns a different student name
- Repeat 5 times total
- If any `evalScriptJSON()` call throws after navigation: FAIL

**Spike 2 — Image fetch from Tauri context**:
- Call `tauriFetch('https://files.myopenmath.com/ufiles/TEST_UID/test.jpg')`
- Assert: response is non-empty bytes, status 200
- If CORS error or `tauri.conf.json` security scope blocks: note the fix needed, then apply and retest
- Convert response to base64 string — assert length > 100

**Spike 3 — Vision API round-trip**:
- Send a POST to `/api/chat` with a hardcoded base64 JPEG in an `image_url` content block
- Prompt: "A student submitted the image below as their math work. Did they show meaningful work? Reply with +2 (substantial), +1 (some), or +0 (none). Be brief."
- Assert: response text contains `+2`, `+1`, or `+0`

**Evidence file format** (`.sisyphus/evidence/show-work-spike.md`):
```md
# Show-Work Spike Results

## CDP Navigation: [PASS|FAIL]
- URLs seen: [list of 5 URLs]
- evalScriptJSON results: [list of 5 student names]
- Error (if FAIL): ...

## Image Fetch: [PASS|FAIL]
- URL tested: ...
- Bytes received: N
- Base64 length: N
- Error (if FAIL): ...

## Vision API: [PASS|FAIL]
- Provider/model used: ...
- Response: [first 200 chars]
- Contains bonus token: [+2|+1|+0|NONE]
- Error (if FAIL): ...
```

---

## Wave 1 — Foundation (3 parallel tasks)

### T1 — Migration 12 + SQLite CRUD

**What**: Add `show_work_sessions` table and `maxStudentsPerSession` setting. Implement CRUD module.

**Files**:
- `ogre-desktop/src-tauri/src/lib.rs` — add Migration 12 after `migration_11`
- `ogre-desktop/src/lib/show-work-session.ts` + `.test.ts`

**Migration SQL**:
```sql
CREATE TABLE IF NOT EXISTS show_work_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    assignment_name TEXT,
    phase TEXT NOT NULL DEFAULT 'scan',
    evaluations TEXT NOT NULL DEFAULT '[]',
    provider TEXT,
    model TEXT,
    last_student_name TEXT,
    total_students INTEGER DEFAULT 0,
    completed_students INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_show_work_session_url
    ON show_work_sessions(url);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('maxStudentsPerSession', NULL);
```

**CRUD functions** (`show-work-session.ts`):
```typescript
getOrCreateSession(url: string): Promise<ShowWorkSession>
updateSession(id: number, patch: Partial<ShowWorkSession>): Promise<void>
deleteSession(url: string): Promise<void>
listSessions(): Promise<ShowWorkSession[]>
```

**Acceptance Criteria**:
```bash
npx tsc --noEmit
# Assert: 0 errors

# After app starts (or migration test):
# Assert: show_work_sessions table exists
# Assert: app_settings has key 'maxStudentsPerSession'
npx vitest run src/lib/show-work-session.test.ts
# Assert: all tests pass
```

---

### T2 — GradingPanel 2-Level Mode Refactor

**What**: Restructure GradingPanel.svelte's grader sub-mode from a `[Single | Batch]` toggle to a 2-level system.

**File**: `ogre-desktop/src/components/grading/GradingPanel.svelte`

**State changes**:
```typescript
// BEFORE:
let graderSubMode = $state<'single' | 'batch'>('single')

// AFTER:
let batchMode = $state<'single' | 'all-in-one' | 'sequential'>('single')
let gradingType = $state<'free-response' | 'show-work'>('free-response')
```

**Rendering logic**:
```
batchMode === 'single'                              → StudentWorkCard (existing, unchanged)
batchMode === 'all-in-one' + free-response          → BatchPanel (existing, unchanged)
batchMode === 'all-in-one' + show-work              → disabled chip "Coming Soon"
batchMode === 'sequential' + free-response          → placeholder "Sequential Free Response (coming soon)"
batchMode === 'sequential' + show-work              → ShowWorkPanel (PRIMARY DELIVERABLE)
```

**Level 2 toggle visibility**: Only show when `batchMode !== 'single'`.

**PATTERN**: Follow existing `toggle-track`/`toggle-slider` CSS class pattern (lines 349-365). The Level 1 toggle becomes a 3-option selector using the same visual style.

**Acceptance Criteria**:
```bash
npx tsc --noEmit
# Assert: 0 errors (no regressions from rename)

npm run build
# Assert: exit code 0

# Svelte check:
npx svelte-check
# Assert: 0 errors in GradingPanel.svelte
```

---

### T3 — Vision Model Gating

**What**: Create `vision-models.ts` + update `ProviderSelector.svelte` to gray out non-vision options when `requiresVision=true`.

**Files**:
- `ogre-desktop/src/lib/vision-models.ts` + `.test.ts`
- `ogre-desktop/src/components/grading/ProviderSelector.svelte` — add `requiresVision` prop

**`vision-models.ts`**:
```typescript
// Providers that are ALWAYS vision-capable (cloud)
export const VISION_PROVIDERS = ['openai', 'anthropic', 'google-gemini', 'github-models']

// Regex patterns for vision-capable Ollama models
export const VISION_MODEL_PATTERNS = [
  /llava/i, /bakllava/i, /llama3\.2-vision/i, /moondream/i, /minicpm-v/i,
  /cogvlm/i, /qwen.*vl/i, /internvl/i
]

export function isVisionCapable(provider: string, model: string): boolean
// Returns true if provider is always-vision, OR if ollama AND model matches pattern
```

**ProviderSelector changes**:
- Add `requiresVision?: boolean` prop
- When `requiresVision=true` and a provider is not vision-capable: `opacity: 0.4; pointer-events: none;`
- Add tooltip on disabled options: "Vision model required for Show Work grading"
- For Ollama: allow provider selection, but gray out non-vision model options

**Acceptance Criteria**:
```bash
npx vitest run src/lib/vision-models.test.ts
# Assert: all pass
# Specific: isVisionCapable('ollama', 'llava') === true
# Specific: isVisionCapable('ollama', 'llama3') === false
# Specific: isVisionCapable('anthropic', 'any-model') === true

npx tsc --noEmit
# Assert: 0 errors
```

---

## Wave 2 — Core Pipeline (2 parallel tasks)

### T4 — Show-Work Types + Scanner

**What**: Define all TypeScript interfaces and implement DOM extraction + eligibility filter for `gbviewassess.php`.

**Files**:
- `ogre-desktop/src/lib/show-work-types.ts`
- `ogre-desktop/src/lib/show-work-scanner.ts` + `.test.ts`

**Types** (`show-work-types.ts`):
```typescript
interface EligibleQuestion {
  index: number            // question number in the page
  scorebox: string         // full selector, e.g. "input#scorebox0" or "input#scorebox0-0"
  currentScore: number
  maxScore: number
  fileLinks: string[]      // absolute URLs to uploaded files
  isPart: boolean          // true if scorebox ID has format N-M
}

interface StudentScan {
  studentName: string
  url: string
  eligibleQuestions: EligibleQuestion[]  // score < 4 AND has file uploads
  allQuestions: number   // total question count
}

interface BonusEvaluation {
  question: EligibleQuestion
  bonus: 0 | 1 | 2
  reasoning: string      // AI explanation
  newScore: number       // min(currentScore + bonus, maxScore)
  imageUrl: string       // which image was analyzed
}

interface ShowWorkReport {
  sessionId: number
  studentName: string
  url: string
  evaluations: BonusEvaluation[]
  skippedFiles: string[]   // unsupported extensions (pdf, heic, etc.)
  approved: boolean | null  // null = pending, true = approved, false = skipped
}

interface ShowWorkSessionState {
  id: number
  url: string
  assignmentName?: string
  phase: 'scan' | 'report' | 'apply' | 'complete'
  reports: ShowWorkReport[]
  completedStudents: number
  totalStudents: number
  provider: string
  model: string
}
```

**Scanner** (`show-work-scanner.ts`):
```typescript
// Pure function — takes HTML string or DOM (for testing), returns StudentScan
export async function scanCurrentStudent(
  evalScript: (script: string) => Promise<unknown>
): Promise<StudentScan>

// Extract: h2 text, all .bigquestionwrap elements
// For each question: extract scoreboxN or scoreboxN-M, current value, max from nextSibling
// Check for .questionpane.viewworkwrap → extract a.attach.prepped[target="_blank"] hrefs
// Eligibility: currentScore < 4 AND fileLinks.length > 0
// Return EligibleQuestion[] for eligible only, allQuestions count
```

**Acceptance Criteria**:
```bash
npx vitest run src/lib/show-work-scanner.test.ts
# Assert: all pass
# Test 1: "extracts student name from h2" → returns correct name
# Test 2: "filters eligible questions (score < 4 AND has uploads)" → returns only eligible
# Test 3: "handles multi-part scoreboxes (N-M format)" → isPart=true, correct selector
# Test 4: "returns empty eligibleQuestions when no uploads" → eligibleQuestions=[]
# Test 5: "caps eligibility at score < 4" → score=4 NOT included, score=3 included

npx tsc --noEmit
# Assert: 0 errors
```

---

### T5 — Show-Work Evaluator

**What**: Download student work images, send to vision AI via `/api/chat`, parse bonus decision.

**File**: `ogre-desktop/src/lib/show-work-evaluator.ts` + `.test.ts`

**Implementation**:
```typescript
// Image download + resize
export async function fetchImageAsBase64(
  url: string,
  fetchFn: typeof tauriFetch
): Promise<{ base64: string; mimeType: string } | null>
// - Use tauriFetch to download image bytes
// - Detect mime type from URL extension (jpg/jpeg/png/gif/webp)
// - Reject unsupported: pdf, heic, heif, svg (return null with logged reason)
// - Resize if decoded size > 1MB (canvas resize or sharp if available)
// - Return base64 string

// Vision AI evaluation
export async function evaluateQuestion(
  question: EligibleQuestion,
  base64: string,
  mimeType: string,
  sendChat: (messages: ChatMessage[]) => Promise<string>
): Promise<BonusEvaluation>
// - Build multimodal message with image_url content block
// - Prompt: "A student submitted this as their work for a math question worth {max} points.
//   Their current score is {current}/{max}. Evaluate whether they showed meaningful work.
//   Reply ONLY with: +2 (substantial work shown), +1 (some work shown), or +0 (no meaningful work).
//   Then one sentence of reasoning."
// - Parse response: extract +2/+1/+0 token
// - Compute newScore: min(current + bonus, max)
// - Return BonusEvaluation

// Full student evaluation
export async function evaluateStudent(
  scan: StudentScan,
  fetchFn: typeof tauriFetch,
  sendChat: (messages: ChatMessage[]) => Promise<string>
): Promise<ShowWorkReport>
// - For each eligibleQuestion, call fetchImageAsBase64
// - If null (unsupported): add to skippedFiles, skip
// - Call evaluateQuestion
// - Return ShowWorkReport with all evaluations
```

**Acceptance Criteria**:
```bash
npx vitest run src/lib/show-work-evaluator.test.ts
# Assert: all pass
# Test 1: "parses +2 from AI response" → bonus=2
# Test 2: "parses +1 from AI response" → bonus=1
# Test 3: "parses +0 when no work shown" → bonus=0
# Test 4: "caps newScore at maxScore" → current=4, bonus=2, max=5 → newScore=5
# Test 5: "skips PDF files, adds to skippedFiles" → skippedFiles=['file.pdf']
# Test 6: "handles fetch failure gracefully" → returns report with skippedFiles

npx tsc --noEmit
# Assert: 0 errors
```

---

## Wave 3 — UI + Applier (2 parallel tasks)

### T6 — ShowWorkPanel.svelte

**What**: Main UI component for the show-work grading mode. Shows scan progress, report table, approval flow.

**File**: `ogre-desktop/src/components/grading/ShowWorkPanel.svelte`

**States / phases**:
1. **Idle**: "Start Show-Work Scan" button. Shows configured provider/model (with vision indicator).
2. **Scanning**: Progress bar — "Scanning student X of Y... (student name)". Cancel button.
3. **Report**: Table of students with evaluations. Each row: student name, questions evaluated, bonus points earned. Checkboxes to approve/skip per student. "Apply Approved" button.
4. **Applying**: Progress — "Applying scores for student X of Y..."
5. **Complete**: Summary — "N students updated, M skipped." New scan button.

**Report table columns**:
```
Student | Q# | Current | Bonus | New Score | Work Preview (thumbnail) | Approve?
```

**Guardrails in UI**:
- "Apply Approved" button only enabled when at least 1 student is checked
- Show warning if `maxStudentsPerSession` is set and will be reached
- Show skipped files in expandable row detail

**Acceptance Criteria**:
```bash
npx svelte-check
# Assert: 0 errors in ShowWorkPanel.svelte

npx tsc --noEmit
# Assert: 0 errors

npm run build
# Assert: exit code 0
```

---

### T7 — Show-Work Applier

**What**: Navigate back to each approved student's `gbviewassess.php` URL, fill the bonus scores, and trigger save.

**File**: `ogre-desktop/src/lib/show-work-applier.ts` + `.test.ts`

**Implementation**:
```typescript
export async function applyBonusForStudent(
  report: ShowWorkReport,
  navigateTo: (url: string) => Promise<void>,
  waitForLoad: () => Promise<void>,
  evalScript: (script: string) => Promise<unknown>
): Promise<{ applied: boolean; error?: string }>
// - navigate to report.url
// - wait for page load (listenBrowserPageLoaded)
// - for each evaluation where bonus > 0:
//   - find scorebox by evaluation.question.scorebox
//   - set value to evaluation.question.newScore
//   - dispatch input event: dispatchEvent(new Event('input', { bubbles: true }))
// - click "Save and Next Student" button (or just the Save button if at end)
// - wait for navigation confirmation
// - return { applied: true }

// Safety checks:
// - Verify student name on page matches report.studentName before applying
// - If name mismatch: return { applied: false, error: 'Student name mismatch' }
// - Never set score below currentScore (bonus-only guarantee)
// - Never set score above maxScore
```

**Acceptance Criteria**:
```bash
npx vitest run src/lib/show-work-applier.test.ts
# Assert: all pass
# Test 1: "fills correct scoreboxN value" → assert evalScript called with correct selector + value
# Test 2: "dispatches input event after fill" → assert dispatchEvent call
# Test 3: "aborts if student name mismatch" → returns { applied: false, error: '...' }
# Test 4: "never sets score above maxScore" → mocked: current=4, bonus=2, max=5 → fills 5 not 6

npx tsc --noEmit
# Assert: 0 errors
```

---

## Wave 4 — Integration + Settings (1 task)

### T8 — Wire Everything + Settings UI

**What**: Connect all pipeline pieces in ShowWorkPanel. Add `maxStudentsPerSession` to Settings page. Wire `requiresVision` in GradingPanel when show-work mode is active.

**Files**:
- `ogre-desktop/src/components/grading/ShowWorkPanel.svelte` — wire scanner → evaluator → report → applier
- `ogre-desktop/src/components/grading/GradingPanel.svelte` — pass `requiresVision={gradingType === 'show-work'}` to ProviderSelector
- Settings page (find the relevant component) — add `maxStudentsPerSession` numeric input

**Integration flow**:
```
user clicks "Start Scan"
  → read maxStudentsPerSession from db (getSetting)
  → navigate to gbviewassess.php if not already there
  → loop:
      scan current student (show-work-scanner.ts)
      if eligible questions: evaluate (show-work-evaluator.ts)
      save report to session (show-work-session.ts)
      update progress UI
      if maxStudents reached: pause, ask user to continue
      else: click "Save and Next Student" via CDP
            wait for page load
            check if no more students (button gone / end-of-list indicator)
  → show report table
user reviews, checks approvals, clicks "Apply Approved"
  → for each approved report: applyBonusForStudent (show-work-applier.ts)
  → update session phase to 'complete'
  → show summary
```

**Settings UI**: Find the settings component/page, add:
```
Max students per show-work session: [____] (blank = no limit)
```
Store via `saveSetting('maxStudentsPerSession', value)`.

**Acceptance Criteria**:
```bash
npm run build
# Assert: exit code 0

npx tsc --noEmit
# Assert: 0 errors

npx vitest run
# Assert: all tests pass (no regressions)
```

---

## Wave FINAL — Verification (4 parallel tasks, all independent)

> All 4 must return APPROVE before marking the plan complete.

### F1 — Plan Compliance Audit

**Agent**: `oracle`
**What**: Verify all deliverables listed in "Concrete Deliverables" exist and match specifications.
**Checklist**:
- All 6 lib files exist (`show-work-types.ts`, `show-work-scanner.ts`, `show-work-evaluator.ts`, `show-work-applier.ts`, `show-work-session.ts`, `vision-models.ts`)
- All `.test.ts` files exist alongside implementation files
- `ShowWorkPanel.svelte` exists
- `GradingPanel.svelte` has 3-option Level 1 toggle and Level 2 toggle
- `ProviderSelector.svelte` has `requiresVision` prop
- Migration 12 in `lib.rs`
- No `as any` casts in any new file
- No new agent actions added to `agent-types.ts`
- No modifications to `grading-server/providers.js`

**Evidence**: `.sisyphus/evidence/f1-plan-compliance.md`

---

### F2 — Code Quality Review

**Agent**: `unspecified-high` (Sisyphus-Junior)
**What**: Static analysis + test run.
**Checklist**:
```bash
npx tsc --noEmit
# Assert: 0 errors

npx vitest run
# Assert: all tests pass

npx svelte-check
# Assert: 0 errors in new Svelte files

npm run build
# Assert: exit code 0
```

**Evidence**: `.sisyphus/evidence/f2-code-quality.md`

---

### F3 — Guardrail Verification

**Agent**: `unspecified-high` (Sisyphus-Junior)
**What**: Verify all safety guardrails are correctly implemented in code.
**Checklist**:
- Search `show-work-evaluator.ts` for `Math.min` cap (or equivalent) — confirms bonus cannot exceed max
- Search `show-work-applier.ts` for student name mismatch check before fill
- Search `show-work-applier.ts` for no-decrease guard (`newScore >= currentScore`)
- Search `ShowWorkPanel.svelte` — confirm "Apply Approved" button is conditionally enabled
- Search for any path that calls score-fill functions without user approval step
- No `as any` in any show-work file

**Evidence**: `.sisyphus/evidence/f3-guardrail-check.md`

---

### F4 — Scope Fidelity Check

**Agent**: `unspecified-high` (Sisyphus-Junior)
**What**: Confirm Must NOT Have items are absent.
**Checklist**:
- `agent-types.ts` — no new entries for show-work actions
- `grading-server/providers.js` — git diff shows no changes
- No `grading-server/` files modified
- No "All-in-One + Show Work" combination enabled (must be "coming soon")
- No PDF/HEIC rendering logic (must be skip with note)
- Settings page has `maxStudentsPerSession` input

**Evidence**: `.sisyphus/evidence/f4-scope-fidelity.md`

---

## Task Summary

| Task | Wave | Parallel? | Depends On | Description |
|------|------|-----------|------------|-------------|
| T0   | 0    | No (gate) | —          | Spike: CDP nav + image fetch + vision API |
| T1   | 1    | Yes       | T0 PASS    | Migration 12 + show-work-session.ts CRUD |
| T2   | 1    | Yes       | T0 PASS    | GradingPanel 2-level mode refactor |
| T3   | 1    | Yes       | T0 PASS    | vision-models.ts + ProviderSelector gating |
| T4   | 2    | Yes       | T1, T2     | show-work-types.ts + show-work-scanner.ts |
| T5   | 2    | Yes       | T1, T2     | show-work-evaluator.ts (image + AI) |
| T6   | 3    | Yes       | T4, T5     | ShowWorkPanel.svelte (UI skeleton) |
| T7   | 3    | Yes       | T4, T5     | show-work-applier.ts |
| T8   | 4    | No        | T6, T7, T3 | Wire integration + Settings UI |
| F1   | FINAL | Yes      | T8         | Plan compliance audit |
| F2   | FINAL | Yes      | T8         | Code quality (tsc + vitest + build) |
| F3   | FINAL | Yes      | T8         | Guardrail verification |
| F4   | FINAL | Yes      | T8         | Scope fidelity check |
