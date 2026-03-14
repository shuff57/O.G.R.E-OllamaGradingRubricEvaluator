# Optimize Discovery Prompt for Output Reliability

## TL;DR

> **Quick Summary**: Restructure the AI discovery prompt in the desktop app to dramatically improve JSON output reliability across all providers (Ollama local through Claude/GPT), harden the response parser, and add retry logic for failed parses.
> 
> **Deliverables**:
> - Rewritten `DISCOVERY_SYSTEM_PROMPT` with JSON constraint reinforcement, concrete examples, and negative constraints
> - Hardened `parseDiscoveryResponse()` with additional fallback patterns
> - Retry mechanism in `runDiscovery()` with configurable max attempts
> - Updated vitest test suite covering new patterns and retry behavior
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves + final
> **Critical Path**: Prompt rewrite → Retry mechanism → Tests

---

## Context

### Original Request
User wants to optimize the page discovery prompt for output reliability. AI models frequently return malformed JSON, markdown code fences, wrong structure, or explanatory text — causing discovery failures.

### Interview Summary
**Key Discussions**:
- **Target**: Desktop app only (`ogre-desktop/src/lib/discover.ts`). Chrome extension `discover.js` is out of scope.
- **Problem**: Output reliability — AI returns malformed JSON, markdown fences, wrong JSON structure, explanatory text around JSON.
- **Providers**: Must work across ALL providers (Ollama local, OpenAI, Claude, Gemini, GitHub Models). Mix of usage.
- **Scope**: Three areas — prompt optimization, parser hardening, retry mechanism.

**Research Findings**:
- The `DISCOVERY_SYSTEM_PROMPT` (~130 lines, ~2200 words) at line 130 has "ONLY valid JSON" instruction once at the bottom — models lose this after processing 100+ lines.
- No concrete example response — JSON template uses placeholder values like `"... or null for sequential"` which models sometimes copy literally.
- No negative constraints (no explicit "Don't include markdown fences").
- The parser `parseDiscoveryResponse()` already strips `<think>` blocks, extracts from markdown fences, and does regex fallback — but misses several patterns.
- `isValidDiscoveryResult()` validates structure after parsing.
- `runDiscovery()` has no retry — a single failed parse terminates the entire workflow.
- DOM snapshot is raw 12K char JSON blob truncated with `substring(0, 12000)` which can cut mid-JSON-object.

### Metis Review
**Identified Gaps** (addressed in plan):
- **Retry budget not discussed**: Applied default of 2 retries (3 total attempts). Disclosed in defaults.
- **Progress callback for retries**: Must report retry attempts to user via `onProgress`.
- **Partial JSON handling**: AI may return JSON cut off by token limits — parser should attempt recovery.
- **Extra fields tolerance**: Parser should not reject JSON with unexpected extra fields (already handled by design).
- **Prompt length concern**: Rewritten prompt must not become significantly longer — smaller models have tight context limits. Target: same length or shorter.
- **No provider-specific prompts**: Single prompt for all providers. Avoid temptation to branch.
- **DOM snapshot truncation**: `substring(0, 12000)` can cut mid-JSON-object, confusing models.

---

## Work Objectives

### Core Objective
Make the AI page discovery prompt produce reliably parseable JSON across all supported AI providers, with graceful fallbacks when it doesn't.

### Concrete Deliverables
- Rewritten `DISCOVERY_SYSTEM_PROMPT` constant in `ogre-desktop/src/lib/discover.ts`
- Improved `DISCOVERY_USER_PROMPT_TEMPLATE()` function in same file
- Hardened `parseDiscoveryResponse()` function with additional recovery patterns
- New `runDiscovery()` retry loop with progress reporting
- Updated test cases in `ogre-desktop/src/lib/discover.test.ts`

### Definition of Done
- [ ] `npx vitest run src/lib/discover.test.ts` passes all tests (existing + new)
- [ ] Prompt is same length or shorter than current (~2200 words)
- [ ] Parser handles at least 8 distinct response patterns (current 4 + 4 new)
- [ ] Retry mechanism attempts up to 3 total calls before failing

### Must Have
- JSON constraint reinforced at START and END of system prompt
- Concrete example response with realistic selectors in the prompt
- Explicit negative constraints ("Do NOT include markdown fences...")
- At least 2 additional parser fallback patterns (partial JSON, double-fenced)
- Retry mechanism with configurable max attempts
- Progress callback updated to report retries
- All existing tests continue to pass

### Must NOT Have (Guardrails)
- DO NOT modify `discover.js` (Chrome extension) — out of scope
- DO NOT add provider-specific prompt variations — single prompt for all
- DO NOT change `DiscoveryPanel.svelte` UI components
- DO NOT modify validation logic (`validateSelectors`, `buildValidationScript`)
- DO NOT modify test fill logic (`testFill`, `clearTestFill` in discover.ts or any other file)
- DO NOT change the `DiscoveryResult` type interface (must remain backward compatible)
- DO NOT change the `SelectorMap` type interface
- DO NOT make the prompt significantly longer (stay within ±10% of current word count)
- DO NOT add third-party dependencies

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES — vitest configured in `ogre-desktop/vitest.config.js`
- **Automated tests**: YES (Tests-after) — update existing test file
- **Framework**: vitest
- **Run command**: `npx vitest run src/lib/discover.test.ts` from `ogre-desktop/` directory

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (vitest) — Run tests, check output, compare results
- **Code Quality**: Use Bash (tsc) — Type-check to ensure no type errors introduced

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent edits to different file sections):
├── Task 1: Restructure DISCOVERY_SYSTEM_PROMPT [deep]
│   (lines 130-229 — prompt engineering, no code logic)
├── Task 2: Harden parseDiscoveryResponse() [unspecified-high]
│   (lines 271-303 — add fallback patterns, pure function)
└── Task 3: Fix DOM snapshot truncation in DISCOVERY_USER_PROMPT_TEMPLATE [quick]
    (lines 239-260 — fix substring to not cut mid-object)

Wave 2 (After Wave 1 — depends on parser hardening):
├── Task 4: Add retry mechanism to runDiscovery() [unspecified-high]
│   (lines 660-739 — wrap AI call in retry loop, uses hardened parser)
└── Task 5: Update discover.test.ts with new test cases [unspecified-high]
    (new tests for parser patterns + retry + prompt assertions)

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Full test suite run + type check (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 5 → F1-F4
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (Prompt) | — | 4, 5, F1-F4 |
| 2 (Parser) | — | 4, 5, F1-F4 |
| 3 (Snapshot) | — | 5, F1-F4 |
| 4 (Retry) | 1, 2 | 5, F1-F4 |
| 5 (Tests) | 1, 2, 3, 4 | F1-F4 |
| F1-F4 | All | — |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: 2 tasks — T4 → `unspecified-high`, T5 → `unspecified-high`
- **Wave FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Restructure DISCOVERY_SYSTEM_PROMPT for JSON Reliability

  **What to do**:
  - Rewrite the `DISCOVERY_SYSTEM_PROMPT` constant (lines 130-229 of `ogre-desktop/src/lib/discover.ts`)
  - Apply these structural changes to improve JSON compliance across all AI providers:
    1. **Open with JSON constraint** — First line must establish: "You are a JSON-only responder. Your entire response must be a single valid JSON object."
    2. **Add concrete example** — Include one complete, realistic example JSON response with actual MyOpenMath-style selectors (e.g., `"tr[id^='graderow']"`, `"input[name^='score']"`) so models understand the exact format
    3. **Add explicit negative constraints** — Add a clear FORBIDDEN section: "Do NOT include markdown code fences (```), explanations, comments, thinking blocks, or any text outside the JSON object"
    4. **Close with JSON constraint** — Final line must reinforce: "Remember: respond with ONLY the JSON object. No other text."
    5. **Tighten the analysis instructions** — Reduce verbose explanations. Use concise bullet points. Cut redundant guidance. The prompt should guide the model efficiently without wasting tokens.
    6. **Use concrete enum values** — Instead of `"batch or sequential"` in the template, list actual valid values: `"batch"` or `"sequential"`
  - The rewritten prompt must be the same length or shorter than current (~2200 words, ±10%)
  - Do NOT change the JSON response schema itself — keep the same field names, nesting, and types

  **Must NOT do**:
  - DO NOT change the `DiscoveryResult` type interface
  - DO NOT add provider-specific branching
  - DO NOT modify any other function or constant in the file
  - DO NOT add emojis to the prompt

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt engineering requires careful reasoning about how different AI models interpret instructions. Must balance conciseness with clarity across model quality tiers.
  - **Skills**: []
    - No specialized skills needed — this is pure text editing of a string constant
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant — no browser interaction needed
    - `frontend-ui-ux`: Not relevant — no UI changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:130-229` — Current `DISCOVERY_SYSTEM_PROMPT` constant. This is the exact string to rewrite. Study its structure: STEP 1 (navigation mode detection), STEP 2 (selector identification), RULES, JSON format template.
  - `discover.js:122-237` — Chrome extension's identical prompt in `buildDiscoveryPrompt()`. DO NOT MODIFY THIS, but reference it to understand the original design intent.

  **API/Type References**:
  - `ogre-desktop/src/lib/discover.ts:72-80` — `DiscoveryResult` interface. The JSON schema the prompt teaches must match this type exactly.
  - `ogre-desktop/src/lib/discover.ts:42-57` — `SelectorMap` interface. The `selectors` object in the prompt must match these fields.
  - `ogre-desktop/src/lib/discover.ts:32-39` — `NavigationConfig` interface. The `navigation` object must match.
  - `ogre-desktop/src/lib/discover.ts:59-64` — `FeedbackConfig` interface. The `feedback` object must match.
  - `ogre-desktop/src/lib/discover.ts:67-70` — `SaveConfig` interface. The `save` object must match.

  **Test References**:
  - `ogre-desktop/src/lib/discover.test.ts:273-317` — `DISCOVERY_SYSTEM_PROMPT` tests. These assert the prompt contains certain strings. New prompt MUST still contain all asserted keywords or the tests need updating in Task 5.

  **External References**:
  - Best practice: JSON-mode prompting. Reinforcing JSON at start AND end of system prompt is a well-known technique for improving compliance, especially with smaller open-source models.

  **WHY Each Reference Matters**:
  - The `DiscoveryResult` type (line 72) defines the exact JSON schema the prompt must teach — any mismatch means `isValidDiscoveryResult()` rejects the response
  - The test assertions (line 273+) check for keywords like "web page structure analyzer", "BATCH", "SEQUENTIAL" etc. — the rewritten prompt must preserve these or the test task must update them
  - The Chrome extension prompt (discover.js:122) shows the original design intent — useful context for understanding WHY certain instructions exist

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Prompt contains JSON constraint bookends
    Tool: Bash (grep)
    Preconditions: discover.ts has been saved
    Steps:
      1. Read the DISCOVERY_SYSTEM_PROMPT from discover.ts
      2. Verify first 200 characters contain "JSON" and "only" (case-insensitive)
      3. Verify last 200 characters contain "JSON" and "only" (case-insensitive)
    Expected Result: JSON constraint appears in both first and last 200 chars of prompt
    Failure Indicators: "JSON" or "only" not found in prompt bookends
    Evidence: .sisyphus/evidence/task-1-json-bookends.txt

  Scenario: Prompt includes concrete example response
    Tool: Bash (grep)
    Preconditions: discover.ts has been saved
    Steps:
      1. Read DISCOVERY_SYSTEM_PROMPT
      2. Search for a complete JSON example block with realistic selectors (not placeholders like "...")
      3. Verify example contains all required fields: navigation, selectors, feedback, save, confidence
    Expected Result: A complete JSON example with actual CSS selectors exists in the prompt
    Failure Indicators: No example found, or example uses placeholder values like "..."
    Evidence: .sisyphus/evidence/task-1-example-response.txt

  Scenario: Prompt includes negative constraints
    Tool: Bash (grep)
    Preconditions: discover.ts has been saved
    Steps:
      1. Read DISCOVERY_SYSTEM_PROMPT
      2. Search for "Do NOT" or "FORBIDDEN" section
      3. Verify it mentions: markdown fences, code blocks, explanations, thinking blocks
    Expected Result: Explicit negative constraints section exists
    Failure Indicators: No "Do NOT" / "FORBIDDEN" text about markdown fences
    Evidence: .sisyphus/evidence/task-1-negative-constraints.txt

  Scenario: Prompt word count within bounds
    Tool: Bash (wc/node script)
    Preconditions: discover.ts has been saved
    Steps:
      1. Extract DISCOVERY_SYSTEM_PROMPT string
      2. Count words
      3. Assert count is between 1980 and 2420 (2200 ± 10%)
    Expected Result: Word count between 1980 and 2420
    Failure Indicators: Word count outside this range
    Evidence: .sisyphus/evidence/task-1-word-count.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-json-bookends.txt
  - [ ] task-1-example-response.txt
  - [ ] task-1-negative-constraints.txt
  - [ ] task-1-word-count.txt

  **Commit**: YES (groups with Wave 1 tasks)
  - Message: `refactor(discover): restructure discovery prompt for JSON reliability`
  - Files: `ogre-desktop/src/lib/discover.ts`
  - Pre-commit: `npx vitest run src/lib/discover.test.ts` (from ogre-desktop/)

- [ ] 2. Harden parseDiscoveryResponse() with Additional Fallback Patterns

  **What to do**:
  - Enhance the `parseDiscoveryResponse()` function (lines 271-303 of `ogre-desktop/src/lib/discover.ts`)
  - Add these additional fallback patterns to handle more AI response quirks:
    1. **Double-fenced markdown** — Some models wrap JSON in double fences: ````json\n```json\n{...}\n```\n````. Strip outer fence first, then inner.
    2. **Partial JSON recovery** — If JSON is cut off by token limit (missing closing braces), attempt to close the JSON. Count open `{` vs close `}`, append missing `}`. Only attempt if imbalance is ≤ 3.
    3. **Trailing comma cleanup** — Some models add trailing commas in JSON objects/arrays (e.g., `{"key": "val",}`). Strip them before parsing.
    4. **Explanatory prefix/suffix** — Models sometimes prepend "Here is the result:" or append "I hope this helps!" around valid JSON. The existing regex fallback handles this, but add a more targeted pattern: extract first `{` to last `}`.
    5. **HTML entity escape** — Some models escape quotes as `&quot;` in JSON. Unescape HTML entities before parsing.
    6. **Multiple JSON objects** — If model returns multiple JSON objects (e.g., thinking then answer), take the LAST one that contains `"selectors"`.
  - Keep the existing patterns (think block stripping, fence extraction, regex fallback) intact
  - Maintain the same function signature and return type

  **Must NOT do**:
  - DO NOT change the function signature or return type
  - DO NOT modify `isValidDiscoveryResult()` — it's a separate validation step
  - DO NOT change the `DiscoveryResult` type
  - DO NOT add external dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful regex and string manipulation with edge-case reasoning, but not architecturally complex
  - **Skills**: []
    - No specialized skills needed — pure TypeScript function enhancement
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant — no browser work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:271-303` — Current `parseDiscoveryResponse()`. The function to enhance. Study existing patterns: think block strip, fence extraction, direct parse, regex fallback.
  - `discover.js:245-272` — Chrome extension's identical parser. Reference for understanding design intent but DO NOT MODIFY.

  **API/Type References**:
  - `ogre-desktop/src/lib/discover.ts:72-80` — `DiscoveryResult` type. The function returns this type.

  **Test References**:
  - `ogre-desktop/src/lib/discover.test.ts:18-113` — Existing `parseDiscoveryResponse` tests. These test: valid JSON, markdown fences, thinking blocks, invalid JSON, missing fields. New patterns must not break these.

  **WHY Each Reference Matters**:
  - The existing parser (line 271) already handles 4 patterns — new patterns must be inserted in the right order so they don't interfere with existing ones
  - The test suite (line 18) validates current behavior — any change that breaks these tests is a regression

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Parser handles trailing commas in JSON
    Tool: Bash (node/vitest inline)
    Preconditions: discover.ts updated with new parser
    Steps:
      1. Call parseDiscoveryResponse with JSON containing trailing commas: {"selectors": {"studentName": ".name",}, "navigation": {"mode": "batch",},}
      2. Assert it parses without throwing
      3. Assert result.selectors.studentName === ".name"
    Expected Result: Parsed successfully despite trailing commas
    Failure Indicators: Throws "Could not parse" error
    Evidence: .sisyphus/evidence/task-2-trailing-comma.txt

  Scenario: Parser handles partial JSON (missing closing braces)
    Tool: Bash (node/vitest inline)
    Preconditions: discover.ts updated
    Steps:
      1. Call parseDiscoveryResponse with JSON missing 1-2 closing braces (simulating token cutoff)
      2. Assert it attempts recovery
      3. Assert it either parses successfully OR throws a clear error
    Expected Result: Either recovers partial JSON or throws descriptive error
    Failure Indicators: Cryptic error or crash
    Evidence: .sisyphus/evidence/task-2-partial-json.txt

  Scenario: Parser handles double-fenced markdown
    Tool: Bash (vitest)
    Preconditions: discover.ts updated
    Steps:
      1. Call parseDiscoveryResponse with response wrapped in double markdown fences
      2. Assert it extracts and parses the inner JSON
    Expected Result: JSON extracted from double fences
    Failure Indicators: Throws parse error
    Evidence: .sisyphus/evidence/task-2-double-fence.txt

  Scenario: Existing tests still pass (regression check)
    Tool: Bash (vitest)
    Preconditions: discover.ts updated
    Steps:
      1. Run: npx vitest run src/lib/discover.test.ts (from ogre-desktop/)
      2. Check all existing parseDiscoveryResponse tests pass
    Expected Result: All existing tests pass (0 failures)
    Failure Indicators: Any existing test fails
    Evidence: .sisyphus/evidence/task-2-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-trailing-comma.txt
  - [ ] task-2-partial-json.txt
  - [ ] task-2-double-fence.txt
  - [ ] task-2-regression.txt

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(discover): restructure discovery prompt for JSON reliability`
  - Files: `ogre-desktop/src/lib/discover.ts`
  - Pre-commit: `npx vitest run src/lib/discover.test.ts`

- [ ] 3. Fix DOM Snapshot Truncation in DISCOVERY_USER_PROMPT_TEMPLATE

  **What to do**:
  - Fix the `DISCOVERY_USER_PROMPT_TEMPLATE()` function (lines 239-260 of `ogre-desktop/src/lib/discover.ts`)
  - The current implementation uses `JSON.stringify(domSnapshot).substring(0, 12000)` which can cut mid-JSON-object, producing invalid JSON that confuses AI models
  - Replace with smart truncation that:
    1. Stringify the full snapshot
    2. If it exceeds 12000 chars, truncate by removing elements from the END of the array (not mid-string)
    3. Re-stringify the truncated array so it's always valid JSON
    4. Add a note in the prompt: `(truncated from N to M nodes to fit context limits)` so the AI knows some nodes were omitted
  - Also improve the user prompt text: add a brief reinforcement of the JSON-only output requirement at the end

  **Must NOT do**:
  - DO NOT change the function signature or parameters
  - DO NOT change the DOM snapshot capture logic (that's in `DOM_SNAPSHOT_SCRIPT`)
  - DO NOT change the 12000 char limit (it's designed for context window constraints)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused change — replace one line of truncation logic with 5-10 lines of smart truncation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:239-260` — Current `DISCOVERY_USER_PROMPT_TEMPLATE()` function. The `substring(0, 12000)` at line 250 is the specific line to fix.
  - `ogre-desktop/src/lib/discover.ts:370-424` — `DOM_SNAPSHOT_SCRIPT`. Shows the shape of each node object: `{depth, tag, attrs, text, childCount}`. Understanding node size helps estimate truncation.

  **Test References**:
  - `ogre-desktop/src/lib/discover.test.ts:379-407` — Test "truncates large DOM snapshots to 12000 chars". This test may need updating to verify smart truncation instead of raw substring.

  **WHY Each Reference Matters**:
  - Line 250's `substring(0, 12000)` is the exact bug — cutting mid-object produces `[{...},{tag:"div"` which is invalid JSON in the prompt
  - The DOM_SNAPSHOT_SCRIPT (line 370) shows what each node looks like so we can estimate average node size for truncation math

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Truncated snapshot is valid JSON
    Tool: Bash (node)
    Preconditions: discover.ts updated
    Steps:
      1. Create a large mock snapshot (500 nodes)
      2. Call DISCOVERY_USER_PROMPT_TEMPLATE with it
      3. Extract the JSON portion from the returned prompt string
      4. Attempt JSON.parse on the extracted portion
    Expected Result: JSON.parse succeeds — no truncation artifacts
    Failure Indicators: JSON.parse throws SyntaxError
    Evidence: .sisyphus/evidence/task-3-valid-truncation.txt

  Scenario: Small snapshots pass through unchanged
    Tool: Bash (node)
    Preconditions: discover.ts updated
    Steps:
      1. Create a small mock snapshot (10 nodes, well under 12000 chars)
      2. Call DISCOVERY_USER_PROMPT_TEMPLATE
      3. Verify all 10 nodes appear in the output
    Expected Result: All nodes present, no truncation message
    Failure Indicators: Nodes missing or truncation note appears unnecessarily
    Evidence: .sisyphus/evidence/task-3-small-snapshot.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-valid-truncation.txt
  - [ ] task-3-small-snapshot.txt

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(discover): restructure discovery prompt for JSON reliability`
  - Files: `ogre-desktop/src/lib/discover.ts`
  - Pre-commit: `npx vitest run src/lib/discover.test.ts`

- [ ] 4. Add Retry Mechanism to runDiscovery()

  **What to do**:
  - Add a retry loop around the AI call and parse steps in `runDiscovery()` (lines 660-739 of `ogre-desktop/src/lib/discover.ts`)
  - Implementation details:
    1. **Max attempts**: 3 (1 initial + 2 retries). Make this a constant `DISCOVERY_MAX_ATTEMPTS = 3` exported from the module.
    2. **Retry scope**: Only retry stages 2-3 (AI call + parse). Do NOT re-capture DOM/screenshot — they're expensive and the page hasn't changed.
    3. **Progress reporting**: On retry, call `onProgress` with stage `"analyzing"` and message like `"AI response invalid, retrying... (attempt 2 of 3)"`.
    4. **Error accumulation**: Collect errors from each attempt. If all attempts fail, throw an error that includes all failure reasons.
    5. **Backoff**: No backoff needed — AI calls are already slow. Just retry immediately.
    6. **On parse failure**: If `parseDiscoveryResponse()` throws OR `isValidDiscoveryResult()` returns false, retry.
    7. **On empty response**: If `aiResponseText.trim()` is empty, retry.
  - Add the `DiscoveryOptions` type a new optional field: `maxAttempts?: number` (defaults to `DISCOVERY_MAX_ATTEMPTS`)
  - Update the progress reporting to include attempt number in the `DiscoveryProgress` type. Add optional field `attempt?: number` to the type.

  **Must NOT do**:
  - DO NOT re-capture screenshot/DOM on retry — reuse from first capture
  - DO NOT add exponential backoff (unnecessary for AI calls)
  - DO NOT retry on validation failures (`validateSelectors`) — that's a different kind of failure
  - DO NOT retry on network errors (HTTP 4xx/5xx) — those are provider-level issues, not output format issues
  - DO NOT change the `DiscoveryWorkflow` return type

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful control flow changes to an async function with error handling and progress callbacks
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1 (prompt), 2 (parser)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.ts:660-739` — Current `runDiscovery()` function. The retry loop wraps stages 2-3 (lines 679-711): AI call (`callDiscoveryAI`) + parse (`parseDiscoveryResponse`) + validate (`isValidDiscoveryResult`).
  - `ogre-desktop/src/lib/discover.ts:465-511` — `callDiscoveryAI()` function. This is what gets retried. Note it can throw on HTTP errors — those should NOT trigger a retry (they're provider errors, not format errors).

  **API/Type References**:
  - `ogre-desktop/src/lib/discover.ts:109-115` — `DiscoveryProgress` type. Add optional `attempt?: number` field.
  - `ogre-desktop/src/lib/discover.ts:353-360` — `DiscoveryOptions` type. Add optional `maxAttempts?: number` field.
  - `ogre-desktop/src/lib/discover.ts:117-122` — `DiscoveryWorkflow` return type. Do NOT change.

  **Test References**:
  - `ogre-desktop/src/lib/discover.test.ts:411-439` — Integration test TODOs (currently `it.todo`). The retry tests should go here as new describe block.

  **WHY Each Reference Matters**:
  - The `runDiscovery` function (line 660) is the orchestrator — the retry loop wraps its core logic. Understanding the stage progression (capture → analyze → parse → validate) is critical to knowing WHAT to retry.
  - The `callDiscoveryAI` function (line 465) throws on HTTP errors — the retry must distinguish "parse failure" (retry) from "network failure" (don't retry, propagate immediately).
  - The `DiscoveryProgress` type (line 109) is used by the UI's `DiscoveryPanel.svelte` to show progress — adding `attempt` helps the UI display retry status.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DISCOVERY_MAX_ATTEMPTS constant is exported
    Tool: Bash (grep)
    Preconditions: discover.ts updated
    Steps:
      1. Grep discover.ts for "DISCOVERY_MAX_ATTEMPTS"
      2. Verify it's exported and set to 3
    Expected Result: `export const DISCOVERY_MAX_ATTEMPTS = 3` found
    Failure Indicators: Not found or not exported
    Evidence: .sisyphus/evidence/task-4-max-attempts.txt

  Scenario: DiscoveryOptions has maxAttempts field
    Tool: Bash (grep)
    Preconditions: discover.ts updated
    Steps:
      1. Read the DiscoveryOptions interface
      2. Verify maxAttempts?: number field exists
    Expected Result: Field present with correct type
    Failure Indicators: Field missing
    Evidence: .sisyphus/evidence/task-4-options-type.txt

  Scenario: DiscoveryProgress has attempt field
    Tool: Bash (grep)
    Preconditions: discover.ts updated
    Steps:
      1. Read the DiscoveryProgress interface
      2. Verify attempt?: number field exists
    Expected Result: Field present with correct type
    Failure Indicators: Field missing
    Evidence: .sisyphus/evidence/task-4-progress-type.txt

  Scenario: Type check passes
    Tool: Bash (npx tsc --noEmit)
    Preconditions: All discover.ts changes applied
    Steps:
      1. Run npx tsc --noEmit from ogre-desktop/ directory
      2. Check exit code is 0
    Expected Result: No type errors
    Failure Indicators: Type errors reported
    Evidence: .sisyphus/evidence/task-4-typecheck.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-max-attempts.txt
  - [ ] task-4-options-type.txt
  - [ ] task-4-progress-type.txt
  - [ ] task-4-typecheck.txt

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discover): add retry mechanism for failed AI parses`
  - Files: `ogre-desktop/src/lib/discover.ts`
  - Pre-commit: `npx tsc --noEmit` (from ogre-desktop/)

- [ ] 5. Update discover.test.ts with New Test Cases

  **What to do**:
  - Add new test cases to `ogre-desktop/src/lib/discover.test.ts` covering:
    1. **New parser patterns** (in `describe("parseDiscoveryResponse")` block):
       - Test: parses JSON with trailing commas → strips commas, returns valid result
       - Test: recovers partial JSON (1-2 missing closing braces) → attempts recovery
       - Test: handles double-fenced markdown → extracts inner JSON
       - Test: handles HTML-escaped quotes → unescapes `&quot;` etc.
       - Test: handles explanatory text around JSON → extracts JSON
       - Test: picks last JSON object when multiple present → uses last `"selectors"` match
    2. **Updated prompt assertions** (in `describe("DISCOVERY_SYSTEM_PROMPT")` block):
       - Update assertions to match rewritten prompt keywords if any changed
       - Test: prompt starts with JSON constraint (first 200 chars contain "JSON")
       - Test: prompt ends with JSON constraint (last 200 chars contain "JSON")
       - Test: prompt contains concrete example with CSS selectors
       - Test: prompt contains "Do NOT" / "FORBIDDEN" negative constraints
    3. **Updated user prompt assertions** (in `describe("DISCOVERY_USER_PROMPT_TEMPLATE")` block):
       - Update truncation test if smart truncation changed behavior
       - Test: truncated output produces valid JSON (JSON.parse succeeds on snapshot portion)
    4. **New retry constant and types** (new `describe` block):
       - Test: `DISCOVERY_MAX_ATTEMPTS` is exported and equals 3
       - Test: `DiscoveryOptions` type includes `maxAttempts` (structural/compile-time — just import and verify)
    5. **Import new exports**: Add `DISCOVERY_MAX_ATTEMPTS` to the import block
  - All existing tests must continue to pass

  **Must NOT do**:
  - DO NOT add integration tests that require a running server or AI provider
  - DO NOT mock the entire `runDiscovery` workflow (those are `it.todo` placeholders for future)
  - DO NOT remove any existing test cases
  - DO NOT change test infrastructure (vitest config, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many test cases to write, requires understanding the updated parser and prompt
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not relevant — unit tests only

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 1 tasks completing)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/discover.test.ts:1-14` — Import block. Add `DISCOVERY_MAX_ATTEMPTS` to imports.
  - `ogre-desktop/src/lib/discover.test.ts:18-113` — Existing `parseDiscoveryResponse` tests. New parser tests go in this describe block following the same patterns.
  - `ogre-desktop/src/lib/discover.test.ts:273-317` — Existing `DISCOVERY_SYSTEM_PROMPT` tests. Update and extend these.
  - `ogre-desktop/src/lib/discover.test.ts:322-407` — Existing `DISCOVERY_USER_PROMPT_TEMPLATE` tests. Update truncation test.

  **API/Type References**:
  - `ogre-desktop/src/lib/discover.ts` — The updated file. Tests must match the actual implementation.

  **WHY Each Reference Matters**:
  - The existing test patterns (line 18+) show the assert style and mock data shapes — follow these exactly for consistency
  - The import block (line 1) must be updated to import new exports like `DISCOVERY_MAX_ATTEMPTS`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass including new ones
    Tool: Bash (vitest)
    Preconditions: discover.ts and discover.test.ts both updated
    Steps:
      1. Run: npx vitest run src/lib/discover.test.ts (from ogre-desktop/)
      2. Count total tests
      3. Assert 0 failures
      4. Assert new test count >= 10 more than original (~40 originally, target 50+)
    Expected Result: All tests pass, at least 10 new tests added
    Failure Indicators: Any test failure, or fewer than 10 new tests
    Evidence: .sisyphus/evidence/task-5-test-run.txt

  Scenario: No regressions in existing tests
    Tool: Bash (vitest)
    Preconditions: Both files updated
    Steps:
      1. Run full test suite
      2. Verify all originally-passing tests still pass
    Expected Result: Zero regressions
    Failure Indicators: Any previously-passing test now fails
    Evidence: .sisyphus/evidence/task-5-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-test-run.txt
  - [ ] task-5-regression.txt

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(discover): add retry mechanism and update tests`
  - Files: `ogre-desktop/src/lib/discover.test.ts`
  - Pre-commit: `npx vitest run src/lib/discover.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` in `ogre-desktop/` directory. Review all changed sections of `discover.ts` for: type errors, empty catches, unused imports, console.log in prod. Check AI slop: excessive comments, over-abstraction. Verify prompt word count is within ±10% of original (~2200 words).
  Output: `TypeCheck [PASS/FAIL] | Lint Issues [N] | Prompt Length [N words vs 2200 target] | VERDICT`

- [ ] F3. **Full Test Suite Run** — `unspecified-high`
  Run `npx vitest run src/lib/discover.test.ts` from `ogre-desktop/` directory. Verify ALL existing tests still pass. Verify new tests for parser patterns pass. Verify new tests for retry mechanism pass. Count total tests before vs after.
  Output: `Tests [N pass/N fail] | New Tests [N added] | Regressions [N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual code changes. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance: `discover.js` untouched, `DiscoveryPanel.svelte` untouched, no provider-specific branching, types unchanged. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Must NOT violations [N] | Unaccounted [N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(discover): restructure prompt for JSON reliability` — discover.ts
- **Wave 2**: `feat(discover): add retry mechanism and update tests` — discover.ts, discover.test.ts

---

## Success Criteria

### Verification Commands
```bash
# From ogre-desktop/ directory:
npx vitest run src/lib/discover.test.ts   # Expected: ALL tests pass
npx tsc --noEmit                           # Expected: no type errors
```

### Final Checklist
- [ ] DISCOVERY_SYSTEM_PROMPT has JSON constraint at START and END
- [ ] Prompt includes concrete example response
- [ ] Prompt includes explicit negative constraints
- [ ] parseDiscoveryResponse handles 8+ response patterns
- [ ] runDiscovery retries up to 3 attempts on parse failure
- [ ] Progress callback reports retry attempts
- [ ] All existing tests pass
- [ ] New tests for parser and retry pass
- [ ] Prompt word count within ±10% of 2200
- [ ] discover.js (extension) untouched
- [ ] DiscoveryPanel.svelte untouched
- [ ] Type interfaces unchanged
