# Runtime Harness for OGRE's In-App AI (Agent + Discover Modes)

## TL;DR

> **Quick Summary**: Both Agent Mode and Discover Mode today build their prompts from separate, static strings (`AGENT_SYSTEM_PROMPT`, `TRAINING_SYSTEM_PROMPT`) with ad-hoc runtime injection. Replace both with a single **`runtime-harness.ts`** module that emits a layered, state-aware system prompt from a typed `HarnessContext` snapshot. One source of truth for tools, capabilities, mode-specific guidance, and output contracts — two consumers (Agent Chat loop + Discover/Training session).
>
> **Deliverables**:
> - `ogre-desktop/src/lib/runtime-harness.ts` — `HarnessContext` type, `HarnessMode` union, `HarnessCapability` per-mode matrix, `buildHarness(ctx)` pure function, `captureHarnessContext()` factory
> - `ogre-desktop/src/lib/runtime-harness.test.ts` — golden-output snapshots per mode, capability-filtering tests, empty-state fallback
> - `ogre-desktop/src/lib/agent-prompt.ts` — **trimmed** to export only `TOOL_DEFINITIONS` + `ToolDefinition`. `AGENT_SYSTEM_PROMPT` removed
> - `ogre-desktop/src/lib/training-session.ts` — **trimmed**: `TRAINING_SYSTEM_PROMPT` removed. State machine types (`TrainingPhase`, `TrainingSession`) stay
> - `ogre-desktop/src/lib/agent-loop.ts` — call-site swap: replaces the `[AGENT_SYSTEM_PROMPT, skillContent, siteContext].join()` block at lines 209–227 with a single `buildHarness(await captureHarnessContext(...))` call
> - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` + `ogre-desktop/src/lib/training-synthesizer.ts` (or wherever `TRAINING_SYSTEM_PROMPT` is consumed) — swap to `buildHarness({ mode: 'discover', ... })`
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (types + capability matrix) → Task 2 (`buildHarness` + tests) → Tasks 3+4 (agent-loop swap, discover swap in parallel) → Task 5 (trim stale exports)

---

## Context

### Why this exists

OGRE runs two internal AIs that both drive an embedded CDP browser:

1. **Agent Mode** (`AgentChat.svelte` → `agent-loop.ts` → `sendAgentRequest`) — a general-purpose browser automation loop with 16 actions. System prompt: `agent-prompt.ts:AGENT_SYSTEM_PROMPT` (256 lines, static).
2. **Discover Mode** (`DiscoveryPanel.svelte` → `discover.ts`; also surfaced inside Agent Mode via the `discover_page` tool) — an AI-powered page-structure trainer that produces site profiles + learned corrections. System prompt: `training-session.ts:TRAINING_SYSTEM_PROMPT` (40 lines, static, unrelated format).

Today:
- **Tools are defined twice** — once as typed `TOOL_DEFINITIONS` (structured), once as numbered prose in `AGENT_SYSTEM_PROMPT`. They drift.
- **Prompts are not state-aware** — no awareness of active rubric, active provider, step budget, or last action result. The only runtime injection is `buildSiteContextInjection(url)` + `buildSkillInjection()`, both URL-gated.
- **Discover has its own vocabulary** — different output format (markdown sections) from Agent (JSON actions). Converting between modes inside a single session is impossible.
- **No per-mode capability filter** — the agent prompt lists all 16 tools even when only 3 are applicable. Discover's narrower prompt works around this by redefining response format entirely.

A harness that gathers a typed snapshot once per turn and renders a layered prompt solves all four.

### Existing call chain (the thing being replaced)

`agent-loop.ts:209-227`:
```ts
let siteContext = '';
try {
  const currentUrl = await getEmbeddedUrl();
  if (currentUrl) siteContext = await buildSiteContextInjection(currentUrl);
} catch { /* */ }
let skillContent = '';
try { skillContent = await buildSkillInjection(); } catch {}

const systemPromptParts = [AGENT_SYSTEM_PROMPT];
if (skillContent) systemPromptParts.push(skillContent);
if (siteContext) systemPromptParts.push(siteContext);
const systemPrompt = systemPromptParts.join('\n\n');
```

This is the pattern to replace. The new version:
```ts
const ctx = await captureHarnessContext({ mode: 'agent', sessionGoal: config.initialMessage, loopConfig, provider: config.provider, model: config.model, stepCount });
const systemPrompt = buildHarness(ctx);
```

### Where Discover/Training assembles its prompt

`training-session.ts:TRAINING_SYSTEM_PROMPT` is imported in `DiscoveryPanel.svelte` (line ~33) and consumed at the start of a training session. The replacement is structurally identical:
```ts
const ctx = await captureHarnessContext({ mode: 'discover', sessionGoal: userIntentDescription, ... });
const systemPrompt = buildHarness(ctx);
```

### Guardrails observed from the codebase
- Branch `meta-harness` is the sandbox — main fork keeps `AGENT_SYSTEM_PROMPT` + `TRAINING_SYSTEM_PROMPT` intact.
- `agent-types.ts:ActionParams` discriminated union is load-bearing — do NOT mutate it.
- `parseAgentResponse` (`agent-api.ts`) expects `{action, params, reasoning}` JSON — the harness must keep emitting that contract or parsing breaks.
- `sendAgentRequest` (`agent-api.ts`) API shape is frozen — server-side `/api/agent` consumes it.
- Site-guide and skill injections already work; harness wraps them, doesn't reimplement.

---

## Work Objectives

### Core Objective
Produce a single `buildHarness(ctx)` pure function that renders the complete system prompt for either Agent Mode or Discover Mode from a typed runtime snapshot, replacing both existing static prompts at their call sites.

### Concrete Deliverables
1. `runtime-harness.ts` — types + builder + context capture
2. `runtime-harness.test.ts` — golden prompt snapshots per mode + unit tests for the helpers
3. `agent-loop.ts` — swap call site at lines 209–227
4. Discover consumer (`DiscoveryPanel.svelte` and/or `training-synthesizer.ts`) — swap call site
5. `agent-prompt.ts` — retain only `TOOL_DEFINITIONS` and `ToolDefinition`; delete `AGENT_SYSTEM_PROMPT`
6. `training-session.ts` — retain state machine types + helpers (`canSaveTraining`, `isSaveSignal`, `createTrainingSession`); delete `TRAINING_SYSTEM_PROMPT`

### Definition of Done
- [ ] `npx vitest run src/lib/runtime-harness` — passes with golden-snapshot tests for both modes
- [ ] `npx tsc --noEmit` — clean
- [ ] `AGENT_SYSTEM_PROMPT` and `TRAINING_SYSTEM_PROMPT` are no longer referenced anywhere (`grep` returns zero hits outside their former files)
- [ ] Agent Mode chat and Discover training session both run end-to-end against a real LMS page (manual QA; screenshots captured)
- [ ] No changes to `/api/agent` server contract, `sendAgentRequest`, `parseAgentResponse`, `agent-types.ts`
- [ ] No changes to `discover.ts:runDiscovery()` internals — discover is invoked AS a tool from within the harness, its own single-shot prompt stays intact

### Must Have
- **Single source of truth for tools**: the prompt's action catalog is auto-generated from `TOOL_DEFINITIONS` filtered by the mode's capability set. No duplicated action lists.
- **Pure function builder**: `buildHarness(ctx)` is deterministic — same context → byte-identical output. Enables golden-file tests.
- **Per-mode capability allow-list**: `HarnessCapability` table declares which of the 16 actions each mode may invoke. Filtering is enforced in the prompt (AI only sees allowed actions) AND can be enforced downstream if needed.
- **Backward-compatible JSON action contract**: emitted prompt tells the AI to reply with the same `{action, params, reasoning}` JSON that `parseAgentResponse` already handles.
- **Graceful empty-state**: no URL → harness still renders (with "no active page" markers). No rubric → renders. No skill → renders. Nothing throws.
- **Token-budget aware**: harness output stays under ~4000 tokens for the base layer (site guide + skill content can push higher — those are already bounded upstream).

### Must NOT Have (Guardrails)
- Do NOT modify `agent-types.ts` (action union, ActionParams discriminated union, AgentMessage, AgentConfig are frozen)
- Do NOT change `sendAgentRequest` or `parseAgentResponse` signatures or behavior
- Do NOT touch the `/api/agent` route in the grading server
- Do NOT change the DOM/AX tree/screenshot capture flow (`captureInteractiveDom`, `captureAccessibilityTree`, `captureWebviewScreenshot`, `mergeDomWithAxTree`)
- Do NOT touch `discover.ts:runDiscovery()` — its internal single-shot vision prompt is a separate, solved problem
- Do NOT persist `HarnessContext` anywhere — it's a per-turn runtime construct
- Do NOT add new actions or modify existing action semantics (this plan does plumbing only)
- Do NOT introduce a new provider / model / auth flow
- Do NOT modify the Electron preload, IPC bridge, or CDP layer
- Do NOT write a `window.ogre` global or any runtime-discoverable manifest (different scope — would be a separate plan for external agents)

---

## Architecture

### Type Surface

```ts
// runtime-harness.ts (new)

export type HarnessMode = 'agent' | 'discover';

/** Per-mode capability matrix. Declared statically; consumed by buildHarness. */
export interface HarnessCapability {
  /** Subset of TOOL_DEFINITIONS.name that this mode may invoke. */
  allowedActions: ReadonlySet<string>;
  /** One-paragraph mode identity ("You are OGRE's …"). */
  identity: string;
  /** Mode-specific rules appended after the base rules. */
  extraRules: string[];
  /** Shape the final `done` payload must take (documented in prompt). */
  doneContract: string;
  /** Required response format hint — 'json_action' or 'markdown_report'. */
  responseFormat: 'json_action' | 'markdown_report';
}

export const HARNESS_CAPABILITIES: Record<HarnessMode, HarnessCapability> = {
  agent: {
    allowedActions: new Set([
      'click', 'triple_click', 'type', 'scroll', 'scrollIntoView',
      'readText', 'screenshot', 'waitFor', 'navigate', 'runJS',
      'writeCodeMirror', 'capturePopup',
      'discover_page', 'test_profile', 'save_profile',
      'done',
    ]),
    identity: `You are OGRE's browser-automation agent. You control an embedded web browser on behalf of a teacher to accomplish grading-related tasks they describe in natural language.`,
    extraRules: [
      'Decompose multi-step tasks in your first response before acting.',
      'If a SITE GUIDE is present, prefer its selectors and workflows over guessing.',
      'runJS always requires user approval — use only when no other action fits.',
    ],
    doneContract: `On done: { success: boolean, message: string } — a 1–2 sentence summary of what the user asked for and what you delivered or why you stopped.`,
    responseFormat: 'json_action',
  },
  discover: {
    allowedActions: new Set([
      'readText', 'screenshot', 'waitFor',
      'discover_page', 'test_profile', 'save_profile',
      'done',
    ]),
    identity: `You are OGRE's page-structure discovery assistant. Your only job is to calibrate how the agent interacts with the current grading page: which elements to click, how to find score inputs, how to target feedback fields.`,
    extraRules: [
      'Work in four phases: perception → dialogue → test → save.',
      'PERCEPTION: reply with {"text": "<markdown report>"} using EXACTLY this template:\n    **Page type:** [description]\n    **Student structure:** [description]\n    **Proposed selectors:**\n    - score_input: [selector]\n    - feedback_box: [selector]\n    - student_name: [selector]\n    - save_button: [selector]\n    **Uncertainties:** [list any]',
      'DIALOGUE: reply with {"text": "<short conversational reply>"}. Accept corrections in plain English and confirm you understood.',
      'TEST: once you have at least one confirmed selector, reply with a JSON action ({"action": "readText"|"test_profile"|..., "params": {...}, "reasoning": "..."}) to verify it live. Propose only ONE test at a time.',
      'Only discuss DOM interaction. Do NOT discuss grades, rubrics, scores, or grading logic.',
      'If uncertain about a selector, say so — never fabricate.',
      'Keep messages short and scannable.',
      'Call done() only after save_profile has succeeded OR the user has said "save"/"done"/"finish"/"looks good".',
    ],
    doneContract: `On done: signal only after save_profile succeeded or the user said "save"/"done". { success: boolean, message: string } summarizing what was learned.`,
    responseFormat: 'json_action',
  },
};

/** Runtime snapshot of the app's state, captured once per turn. */
export interface HarnessContext {
  mode: HarnessMode;
  /** The user's initial request (single-turn) or session description. */
  sessionGoal: string;
  /** Current embedded browser URL, or '' if no page loaded. */
  currentUrl: string;
  /** Name of the matched site profile, or null. */
  activeProfileName: string | null;
  /** Summary of active grading rubric, or null. */
  activeRubric: {
    name: string;
    maxScore: number;
    criteriaCount: number;
  } | null;
  /** Provider + model names for display (optional — AI doesn't act on these but they help it pace). */
  provider: string | null;
  model: string | null;
  /** Step budget. */
  stepCount: number;
  maxSteps: number;
  /** Wall-clock budget remaining (ms). */
  timeRemainingMs: number;
  /** Key of the last action attempted this session (or null). For loop-awareness callouts. */
  lastActionKey: string | null;
  /** Last action's error message, if the previous turn failed. */
  lastError: string | null;
  /** Pre-built site guide injection (empty string if no match). */
  siteGuide: string;
  /** Pre-built installed-skill injection (empty string if none active). */
  installedSkill: string;
}

/** Inputs required to capture a context snapshot. */
export interface CaptureInputs {
  mode: HarnessMode;
  sessionGoal: string;
  stepCount: number;
  loopConfig: { maxSteps: number; maxTimeMs: number };
  startTime: number;
  provider?: string;
  model?: string;
  lastActionKey?: string | null;
  lastError?: string | null;
}

/** Async factory: assembles a HarnessContext from live app state. */
export async function captureHarnessContext(inputs: CaptureInputs): Promise<HarnessContext>;

/** Pure function: renders the system prompt from a context snapshot. */
export function buildHarness(ctx: HarnessContext): string;
```

### Prompt Layout (what `buildHarness` emits)

```
# OGRE {MODE} MODE

{capability.identity}

## Your current situation
- URL: {currentUrl || '(no page loaded)'}
- Site profile: {activeProfileName || '(none — fall back to DOM + AX tree)'}
- Active rubric: {activeRubric ? `${activeRubric.name} (${activeRubric.criteriaCount} criteria, max ${activeRubric.maxScore})` : '(none)'}
- Provider: {provider}/{model}
- Step {stepCount}/{maxSteps} — {timeRemainingMs/1000 | 0}s remaining
{lastError ? `- Last turn failed: ${lastError}` : ''}

## Session goal
{sessionGoal}

## Available tools
You may invoke these actions — NO OTHERS:

{for each action in TOOL_DEFINITIONS where allowedActions.has(action.name):
  render:
  - {action.name}: {action.description}
    params: {formatted param docs}
}

## Response format
Respond with EXACTLY ONE JSON object per turn:

{"action": "<name>", "params": {...}, "reasoning": "<brief explanation>"}

OR for conversational (non-action) replies:

{"text": "..."}

## Base rules
1. Always include "reasoning" in action responses.
2. Use CSS selectors from the Interactive Elements section of page state. Use the Accessibility Tree for context, not as action targets.
3. If an action fails, analyze the error and try a different approach.
4. Call done() when the goal is accomplished or you cannot proceed.
5. Prefer exact text content or aria-labels in selectors for robust fuzzy matching.

## Mode-specific rules
{for each rule in capability.extraRules: numbered list}

## Output contract
{capability.doneContract}

## Site guide
{siteGuide || '(no site guide matches this URL — use DOM and AX tree only)'}

## Installed skill
{installedSkill || '(no skill active)'}
```

This is token-budget-predictable because the variable parts (site guide, skill, rubric) are already bounded upstream.

### Capture-time data flow

```
captureHarnessContext(inputs)
├── await getEmbeddedUrl()                   → currentUrl
├── await getMatchingSkillsForUrl(url) + selectBestProfile  → activeProfileName
├── getActiveRubricSummary()                  → activeRubric  (new helper — reads from whatever store BatchProgress uses)
├── await buildSiteContextInjection(url)      → siteGuide
├── await buildSkillInjection()               → installedSkill
└── assemble HarnessContext { ...inputs, ... }
```

All upstream helpers already exist — `captureHarnessContext` is just a typed gather.

### Failure modes & recovery

| Failure | Current behavior | Harness behavior |
|---|---|---|
| `getEmbeddedUrl()` throws | Caught, `siteContext=''` | Caught, `currentUrl=''` (prompt says "no page loaded") |
| No site guide matches | `siteContext=''` | `siteGuide=''` — rendered as "(no site guide matches this URL)" |
| No rubric active | N/A | `activeRubric=null` — rendered as "(none)" |
| `buildSkillInjection()` throws | Caught, `skillContent=''` | Same |
| Unknown action in `allowedActions` set | N/A | Ignored at render time (filtered by `TOOL_DEFINITIONS.find`) — type-level consistency via const set not lost to a typo |

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** for correctness — manual only for end-to-end polish.

### Test Decision
- **Infrastructure exists**: YES (vitest — runs from `ogre-desktop/`)
- **Automated tests**: Tests-alongside — write `runtime-harness.test.ts` in the same PR as the implementation
- **Framework**: vitest
- **Pattern**: Golden-snapshot for the full prompt output per mode + unit tests for the capability matrix and fallback behavior

### QA Policy
Evidence saved to `.sisyphus/evidence/harness-task-{N}-{slug}.{ext}`.

- **Unit**: vitest against `buildHarness` with fixed `HarnessContext` fixtures
- **Integration**: spin the Electron app, trigger Agent Mode, confirm the prompt in the network tab matches the harness snapshot (spot check)
- **Discover path**: trigger a training session on a known LMS page, confirm it still advances through phases

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 — Foundation (sequential):
└── Task 1: Types + capability matrix + captureHarnessContext stub [quick]

Wave 2 — Builder + tests (sequential, depends on Wave 1):
└── Task 2: buildHarness implementation + vitest golden snapshots [medium]

Wave 3 — Call-site swaps (parallel, both depend on Wave 2):
├── Task 3: agent-loop.ts swap [quick]
└── Task 4: Discover/DiscoveryPanel swap [quick]

Wave 4 — Cleanup (depends on Wave 3):
└── Task 5: Remove AGENT_SYSTEM_PROMPT + TRAINING_SYSTEM_PROMPT exports [quick]

Wave FINAL (after all):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality + tsc + vitest [unspecified-high]
└── F3: Live Playwright QA — Agent Mode run on MOM + Discover on MOM [unspecified-high + webapp-testing]
```

### Dependency Matrix
- **Task 1**: no deps → blocks 2, 3, 4, 5
- **Task 2**: 1 → blocks 3, 4, 5
- **Task 3**: 2 → blocks 5
- **Task 4**: 2 → blocks 5
- **Task 5**: 3, 4 → blocks F1, F2, F3

---

## TODOs

- [ ] 1. Scaffold `runtime-harness.ts` — types, capability matrix, `captureHarnessContext` factory

  **What to do**:
  - Create `ogre-desktop/src/lib/runtime-harness.ts`
  - Declare: `HarnessMode`, `HarnessCapability`, `HARNESS_CAPABILITIES` (the two-entry record shown in Architecture), `HarnessContext`, `CaptureInputs`
  - Implement `captureHarnessContext(inputs: CaptureInputs): Promise<HarnessContext>`:
    - `getEmbeddedUrl()` → `currentUrl` (catch → `''`)
    - `getMatchingSkillsForUrl(url) + selectBestProfile(matches)` → `activeProfileName` (catch → `null`)
    - `getActiveRubricSummary()` — **new small helper in `runtime-harness.ts`** that imports the active rubric from wherever BatchProgress reads it (likely a store or localStorage key — inspect and import). Returns `{name, maxScore, criteriaCount} | null`. Catch → `null`.
    - `buildSiteContextInjection(url)` → `siteGuide` (catch → `''`)
    - `buildSkillInjection()` → `installedSkill` (catch → `''`)
    - Return `{ ...inputs derived fields, currentUrl, activeProfileName, activeRubric, siteGuide, installedSkill, timeRemainingMs: Math.max(0, loopConfig.maxTimeMs - (Date.now() - startTime)) }`
  - Stub `buildHarness(ctx)` returning `''` (Task 2 fills it in)
  - Export: all types + `HARNESS_CAPABILITIES` + `captureHarnessContext` + `buildHarness`

  **Must NOT do**:
  - Do NOT import from `agent-loop.ts` (would create a cycle — agent-loop imports harness)
  - Do NOT import `AGENT_SYSTEM_PROMPT` or `TRAINING_SYSTEM_PROMPT` (those are being deleted)
  - Do NOT add persistence — this is a pure in-memory construct

  **Agent Profile**: `quick`

  **Parallelization**: serial — blocks all downstream

  **References**:
  - `ogre-desktop/src/lib/agent-prompt.ts:13-130` — `ToolDefinition` + `TOOL_DEFINITIONS` (imported as-is)
  - `ogre-desktop/src/lib/agent-loop.ts:209-227` — pattern for what the factory replaces
  - `ogre-desktop/src/lib/skills-api.ts:217-294` — `buildSiteContextInjection` + `getMatchingSkillsForUrl`
  - `ogre-desktop/src/lib/browser.ts` — `getEmbeddedUrl` signature
  - `ogre-desktop/src/lib/profile-precedence.ts` — `selectBestProfile`

  **Unknown to resolve in this task**: where does the "active rubric" live in renderer state? Probably `BatchProgress.svelte`'s store or a `rubric-store`. Find it, import it, write the summary getter. If there isn't a single source, leave `activeRubric: null` for now and flag as a follow-up.

  **Acceptance**:
  - [ ] `npx tsc --noEmit` passes
  - [ ] `HARNESS_CAPABILITIES.agent.allowedActions.size === 16`
  - [ ] `HARNESS_CAPABILITIES.discover.allowedActions.size === 7`
  - [ ] `captureHarnessContext` never throws — all failure branches caught

  **Commit**: grouped with Task 2

---

- [ ] 2. Implement `buildHarness(ctx)` + vitest golden snapshots

  **What to do**:
  - Fill in `buildHarness(ctx)` per the "Prompt Layout" section above:
    - Start with `# OGRE ${ctx.mode.toUpperCase()} MODE` header
    - Render identity, situation, goal, tools, response format, base rules, mode-specific rules, done contract, site guide, installed skill in that order
    - Tools rendering:
      ```ts
      const cap = HARNESS_CAPABILITIES[ctx.mode];
      const allowedTools = TOOL_DEFINITIONS.filter(t => cap.allowedActions.has(t.name));
      const toolLines = allowedTools.map(t => `- ${t.name}: ${t.description}\n  params: ${Object.entries(t.params).map(([k,v]) => `${k} (${v})`).join(', ') || '(none)'}`);
      ```
    - Use template literals with conditional blocks for null fields ("no page loaded", etc.)
  - Create `ogre-desktop/src/lib/runtime-harness.test.ts`:
    - Test 1 (golden, agent mode): fixture ctx with a known URL + rubric + site guide → `expect(buildHarness(ctx)).toMatchSnapshot()`
    - Test 2 (golden, discover mode): similar
    - Test 3: empty state (no URL, no profile, no rubric, no guide, no skill) renders without `undefined` or `null` leaking into output
    - Test 4: agent mode's tool list contains `click`, `discover_page`; discover mode's list does NOT contain `navigate`, `runJS`, `writeCodeMirror`
    - Test 5: `captureHarnessContext` returns `activeProfileName: null` when `getEmbeddedUrl` throws (mock it)
    - Test 6: output is deterministic — `buildHarness(ctx) === buildHarness(ctx)` (structurally, no timestamps)
  - Run snapshots: `npx vitest run src/lib/runtime-harness` — expect all green

  **Must NOT do**:
  - Do NOT include the current timestamp, step count as absolute time, or any non-deterministic field in the output (breaks snapshot tests)
  - Do NOT dedent or reformat `siteGuide` / `installedSkill` — pass through as-is

  **Agent Profile**: `medium`

  **Parallelization**: serial — Tasks 3, 4 depend on this working

  **References**:
  - `ogre-desktop/src/lib/agent-prompt.ts:137-256` — source material for base rules (cherry-pick the rules that are NOT tool docs)
  - `ogre-desktop/src/lib/training-session.ts:64-103` — source material for discover mode's extra rules

  **Acceptance**:
  - [ ] All 6 tests pass
  - [ ] Snapshot files checked in under `__snapshots__/`
  - [ ] `npx tsc --noEmit` clean

  **Commit**: `feat(harness): add runtime-harness with per-mode capability matrix and golden tests` (groups with Task 1)
  - Files: `runtime-harness.ts`, `runtime-harness.test.ts`, snapshot files

---

- [ ] 3. Swap call site in `agent-loop.ts`

  **What to do**:
  - In `agent-loop.ts`, at lines 209–227, replace the 18-line manual assembly block with:
    ```ts
    const ctx = await captureHarnessContext({
      mode: 'agent',
      sessionGoal: config.initialMessage,
      stepCount: 0,
      loopConfig,
      startTime,
      provider: config.provider,
      model: config.model,
    });
    const systemPrompt = buildHarness(ctx);
    ```
  - Note: `stepCount` and `lastActionKey`/`lastError` can't be captured at session start (they update inside the loop). **Leave them at initial values for now** — this is a pure plumbing swap, not a behavior change. A follow-up plan can re-capture per-turn.
  - Remove the `AGENT_SYSTEM_PROMPT` import (will be deleted in Task 5)
  - Keep the `siteContext` / `skillContent` variable tracking for the existing "lastSiteContext" logic at line 241 — those are used later for per-turn re-injection; check whether they're still needed after harness or if the harness subsumes them. If subsumed, delete the tracking and the comparison logic.

  **Must NOT do**:
  - Do NOT change the loop structure (the `while (true)` pump, yield events, safety checks)
  - Do NOT change `pruneHistory`, `estimateTokens`, or any other loop internals

  **Agent Profile**: `quick`

  **Parallelization**: YES (with Task 4)

  **References**:
  - `ogre-desktop/src/lib/agent-loop.ts:209-227` — the block to replace
  - `ogre-desktop/src/lib/agent-loop.ts:240-241` — `lastSiteContext` — check if still needed

  **Acceptance**:
  - [ ] `npx tsc --noEmit` clean
  - [ ] Agent Mode chat still launches in dev build and makes its first AI call successfully
  - [ ] No regression to review-mode approval gate

  **Commit**: `refactor(agent-loop): use runtime harness for system prompt` (groups with Task 4)

---

- [ ] 4. Swap call site in Discover/Training consumer

  **What to do**:
  - Find every import of `TRAINING_SYSTEM_PROMPT` (expect it in `DiscoveryPanel.svelte` near line 33 and possibly `training-synthesizer.ts`)
  - At each site, replace with a `buildHarness({ mode: 'discover', sessionGoal: <training intent description>, ... })` call
  - The training session intent: use the current `session.siteName` or the matched profile name as `sessionGoal` if the user hasn't typed one yet; otherwise use the user's first message
  - Ensure `stepCount`, `loopConfig` (discover doesn't use the 30-step agent config, but a mode-specific one — use `{ maxSteps: 20, maxTimeMs: 10 * 60 * 1000 }` to start), `startTime = Date.now()` are provided

  **Must NOT do**:
  - Do NOT change the `TrainingSession` state machine (phases, transitions)
  - Do NOT change `isSaveSignal`, `canSaveTraining`, `createTrainingSession` helpers
  - Do NOT change how corrections are written to DB (`appendLearnedCorrections`)

  **Agent Profile**: `quick`

  **Parallelization**: YES (with Task 3)

  **References**:
  - `ogre-desktop/src/components/grading/DiscoveryPanel.svelte:33` — `TRAINING_SYSTEM_PROMPT` import
  - `ogre-desktop/src/lib/training-session.ts:64` — the prompt being replaced
  - `ogre-desktop/src/lib/training-synthesizer.ts` — check for import (synthesizer may use the prompt for the synthesis step — if so, that's a separate single-shot prompt, leave it alone)

  **Acceptance**:
  - [ ] `npx tsc --noEmit` clean
  - [ ] Discover/Training session launches on a known LMS page and advances to perception phase
  - [ ] No regression to `canSaveTraining` / `isSaveSignal` / the save flow

  **Commit**: grouped with Task 3

---

- [ ] 5. Trim stale exports from `agent-prompt.ts` and `training-session.ts`

  **What to do**:
  - In `agent-prompt.ts`:
    - Delete `AGENT_SYSTEM_PROMPT` (lines 137–256)
    - Keep `ToolDefinition` and `TOOL_DEFINITIONS`
    - Update the top-of-file doc comment to reflect the reduced scope ("Exports structured tool metadata for the harness.")
  - In `training-session.ts`:
    - Delete `TRAINING_SYSTEM_PROMPT` (lines 62–103)
    - Keep `TrainingPhase`, `TrainingSession`, `createTrainingSession`, `canSaveTraining`, `isSaveSignal`
    - Update the doc comment
  - Verify nothing still imports either constant:
    ```bash
    grep -rn "AGENT_SYSTEM_PROMPT\|TRAINING_SYSTEM_PROMPT" ogre-desktop/src
    ```
    Expect 0 matches.

  **Must NOT do**:
  - Do NOT delete the state machine types or helpers in `training-session.ts`
  - Do NOT delete `TOOL_DEFINITIONS` — the harness imports it

  **Agent Profile**: `quick`

  **Parallelization**: serial (must be last)

  **Acceptance**:
  - [ ] `grep -rn "AGENT_SYSTEM_PROMPT\|TRAINING_SYSTEM_PROMPT" ogre-desktop/src` returns 0
  - [ ] `npx tsc --noEmit` clean
  - [ ] All vitest suites pass

  **Commit**: `chore(prompts): remove AGENT_SYSTEM_PROMPT and TRAINING_SYSTEM_PROMPT (subsumed by harness)`

---

## Final Verification Wave (MANDATORY)

> 3 review agents in parallel. ALL must APPROVE. Present results and wait for explicit user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each Must Have: verify implementation exists. For each Must NOT Have: search codebase for forbidden patterns. Confirm evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [5/5] | VERDICT`

- [ ] F2. **Code Quality + Build** — `unspecified-high`
  Run `cd ogre-desktop && npx tsc --noEmit && npx vitest run`. Scan changed files for: `as any`, empty catches, dead imports, unused vars. Confirm harness output has no `undefined`/`null`/`[object Object]` leakage.
  Output: `Build [PASS/FAIL] | Tests [N/N pass] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Live Playwright QA** — `unspecified-high` + `webapp-testing`
  Start OGRE. Open Agent Mode. Send a trivial task ("read the page title"). Verify the API payload to `/api/agent` contains the new prompt header (`# OGRE AGENT MODE`). Open Discover Mode on a MOM page. Verify the training perception phase still produces the 4-line report. Save screenshots.
  Output: `Scenarios [N/N] | VERDICT`

---

## Commit Strategy

1. **Tasks 1+2** — `feat(harness): add runtime-harness with per-mode capability matrix and golden tests`
2. **Tasks 3+4** — `refactor(agent+discover): use runtime harness for system prompt`
3. **Task 5** — `chore(prompts): remove AGENT_SYSTEM_PROMPT and TRAINING_SYSTEM_PROMPT (subsumed by harness)`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop
npx tsc --noEmit                                  # Expected: clean
npx vitest run src/lib/runtime-harness            # Expected: all pass
npx vitest run                                    # Expected: no regressions
grep -rn "AGENT_SYSTEM_PROMPT\|TRAINING_SYSTEM_PROMPT" src  # Expected: 0 matches
```

### Final Checklist
- [ ] `runtime-harness.ts` + `.test.ts` shipped with passing snapshots
- [ ] `agent-loop.ts:209-227` swapped to `buildHarness(await captureHarnessContext(...))`
- [ ] Discover consumer swapped to harness
- [ ] `AGENT_SYSTEM_PROMPT` removed from `agent-prompt.ts`
- [ ] `TRAINING_SYSTEM_PROMPT` removed from `training-session.ts`
- [ ] `TOOL_DEFINITIONS` + `ToolDefinition` remain in `agent-prompt.ts`
- [ ] Training state-machine types + helpers remain in `training-session.ts`
- [ ] `/api/agent` contract, `sendAgentRequest`, `parseAgentResponse`, `agent-types.ts` all untouched
- [ ] No persistence added; harness is purely runtime
- [ ] Manual QA: Agent Mode runs end-to-end on MOM; Discover Mode advances to perception

---

## Open Questions / Flags

1. **Active rubric source** — I haven't confirmed where the "active rubric" lives in renderer state. Task 1 resolves this by inspection; if there's no single store, `activeRubric: null` is the initial pass and we add per-turn re-capture in a follow-up.
2. **Discover step/time budget** — I picked `{ maxSteps: 20, maxTimeMs: 10 min }` arbitrarily for discover mode. Training sessions are mostly user-paced, so the budget exists only as a runaway-guard. Feel free to adjust at review time.
3. **Per-turn context refresh** — this plan captures the harness context ONCE at session start. The existing agent loop already refreshes `siteContext` per turn (line 241's `lastSiteContext`). A follow-up plan can re-capture the harness per turn so `stepCount`, `lastError`, and URL changes flow into the prompt. For now: single capture is the minimum that replaces the existing behavior.
4. **Output format of discover mode** — **RESOLVED**: hybrid JSON envelope with markdown inside the `{"text": "..."}` field for perception/dialogue phases; JSON actions for test phase. Preserves `canSaveTraining` heuristic (greps for `**Proposed selectors:**` in assistant messages), keeps conversational UX in dialogue, and adds tool-use vocabulary for test/save phases. The current `parseAgentResponse` already handles both `{action: ...}` and `{text: ...}` — no server changes needed.
