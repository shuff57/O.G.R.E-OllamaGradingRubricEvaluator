/**
 * runtime-harness.ts — Unified system-prompt builder for OGRE's in-app AIs.
 *
 * Both Agent Mode and Discover Mode consume `buildHarness(ctx)` instead of
 * separate static strings. A typed `HarnessContext` snapshot is captured once
 * per session via `captureHarnessContext(inputs)`.
 *
 * Key design constraints:
 * - `buildHarness` is a pure function: same context → byte-identical output.
 * - `captureHarnessContext` never throws: every async call is wrapped in
 *   try/catch with a sensible fallback value.
 * - Active rubric is NOT available from a global store (it lives only in
 *   component scope). Callers pass an optional `activeRubric` override in
 *   `CaptureInputs`; the default is `null`.
 */

import { TOOL_DEFINITIONS } from './agent-prompt';
import type { ToolDefinition } from './agent-prompt';
import { buildSiteContextInjection, getMatchingSkillsForUrl, buildSkillInjection } from './skills-api';
import { getEmbeddedUrl } from './browser';
import { selectBestProfile } from './profile-precedence';

// Re-export ToolDefinition so callers don't need a second import.
export type { ToolDefinition };

// ── Mode ─────────────────────────────────────────────────────────────────────

export type HarnessMode = 'agent' | 'discover';

// ── Capability Matrix ────────────────────────────────────────────────────────

/** Per-mode capability declaration. Declared statically; consumed by buildHarness. */
export interface HarnessCapability {
  /** Subset of TOOL_DEFINITIONS names this mode may invoke. */
  allowedActions: ReadonlySet<string>;
  /** One-paragraph mode identity ("You are OGRE's …"). */
  identity: string;
  /** Mode-specific rules appended after the base rules. */
  extraRules: string[];
  /** Shape the final `done` payload must take (documented in prompt). */
  doneContract: string;
  /** Required response format hint. */
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
      'TASK DECOMPOSITION: For complex multi-step tasks, ALWAYS decompose the task before acting. In your first response, use the reasoning field to outline numbered steps. Then execute each step sequentially. Never start clicking without a plan.',
      'SITE GUIDE PRIORITY: When a SITE GUIDE (JSON) is present in your context, parse it as structured JSON. Use the "selectors" object for selectors directly — Do NOT invent selectors not in the guide. Use "navigation" keys to build URLs for page navigation. Consult "gotchas" before acting. Follow "workflows" for multi-step task guidance. If no SITE GUIDE is present, rely on accessibility tree/DOM snapshots only.',
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

// ── Context Types ────────────────────────────────────────────────────────────

/** Runtime snapshot of the app's state, captured once per turn. */
export interface HarnessContext {
  mode: HarnessMode;
  /** The user's initial request (single-turn) or session description. */
  sessionGoal: string;
  /** Current embedded browser URL, or '' if no page loaded. */
  currentUrl: string;
  /** Name of the matched site profile, or null. */
  activeProfileName: string | null;
  /**
   * Summary of active grading rubric, or null.
   * Note: rubric state lives only in component scope (GradingPanel.svelte /
   * BatchPanel.svelte). Callers must pass it via CaptureInputs.activeRubric.
   */
  activeRubric: {
    name: string;
    maxScore: number;
    criteriaCount: number;
  } | null;
  /** Provider name for display (AI doesn't act on this but it helps it pace). */
  provider: string | null;
  /** Model name for display. */
  model: string | null;
  /** Current step within this session. */
  stepCount: number;
  /** Maximum allowed steps for this session. */
  maxSteps: number;
  /** Wall-clock budget remaining (ms). */
  timeRemainingMs: number;
  /** Key of the last action attempted this session (or null). */
  lastActionKey: string | null;
  /** Last action's error message, if the previous turn failed. */
  lastError: string | null;
  /** Pre-built site guide injection (empty string if no match). */
  siteGuide: string;
  /** Pre-built installed-skill injection (empty string if none active). */
  installedSkill: string;
}

/**
 * Inputs required to capture a context snapshot.
 *
 * `activeRubric` is optional because rubric state is only available inside
 * GradingPanel/BatchPanel component scope — there is no global store. Callers
 * that have access to the active rubric should pass it here; others leave it
 * undefined (defaults to null).
 */
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
  /** Optional caller-supplied rubric summary. Defaults to null. */
  activeRubric?: {
    name: string;
    maxScore: number;
    criteriaCount: number;
  } | null;
}

// ── Context Capture ──────────────────────────────────────────────────────────

/**
 * Async factory: assembles a HarnessContext from live app state.
 *
 * All async calls are individually wrapped in try/catch so this function
 * never throws — every field degrades gracefully to its null/empty sentinel.
 */
export async function captureHarnessContext(inputs: CaptureInputs): Promise<HarnessContext> {
  let currentUrl = '';
  try {
    currentUrl = await getEmbeddedUrl();
  } catch {
    // No browser open or URL unavailable
  }

  let activeProfileName: string | null = null;
  try {
    if (currentUrl) {
      const matches = await getMatchingSkillsForUrl(currentUrl);
      const best = selectBestProfile(matches);
      activeProfileName = best?.name ?? null;
    }
  } catch {
    // Profile lookup failed
  }

  let siteGuide = '';
  try {
    if (currentUrl) {
      siteGuide = await buildSiteContextInjection(currentUrl);
    }
  } catch {
    // Site guide unavailable
  }

  let installedSkill = '';
  try {
    installedSkill = await buildSkillInjection();
  } catch {
    // Skill injection unavailable
  }

  const timeRemainingMs = Math.max(
    0,
    inputs.loopConfig.maxTimeMs - (Date.now() - inputs.startTime),
  );

  return {
    mode: inputs.mode,
    sessionGoal: inputs.sessionGoal,
    currentUrl,
    activeProfileName,
    activeRubric: inputs.activeRubric ?? null,
    provider: inputs.provider ?? null,
    model: inputs.model ?? null,
    stepCount: inputs.stepCount,
    maxSteps: inputs.loopConfig.maxSteps,
    timeRemainingMs,
    lastActionKey: inputs.lastActionKey ?? null,
    lastError: inputs.lastError ?? null,
    siteGuide,
    installedSkill,
  };
}

// ── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Pure function: renders the complete system prompt from a context snapshot.
 *
 * Deterministic — same context → byte-identical output. Does not embed
 * timestamps or non-deterministic fields. `timeRemainingMs` is rounded to
 * whole seconds so tests are stable.
 */
export function buildHarness(ctx: HarnessContext): string {
  const cap = HARNESS_CAPABILITIES[ctx.mode];
  const modeLabel = ctx.mode.toUpperCase();

  // ── Tools ──────────────────────────────────────────────────────────────
  const allowedTools = TOOL_DEFINITIONS.filter(t => cap.allowedActions.has(t.name));
  const toolLines = allowedTools.map((t: ToolDefinition) => {
    const paramDocs = Object.entries(t.params)
      .map(([k, v]) => `${k} (${v})`)
      .join(', ');
    return `- ${t.name}: ${t.description}\n  params: ${paramDocs || '(none)'}`;
  });

  // ── Situation ──────────────────────────────────────────────────────────
  const rubricLine = ctx.activeRubric
    ? `${ctx.activeRubric.name} (${ctx.activeRubric.criteriaCount} criteria, max ${ctx.activeRubric.maxScore})`
    : '(none)';
  const providerLine = (ctx.provider && ctx.model)
    ? `${ctx.provider}/${ctx.model}`
    : ctx.provider ?? ctx.model ?? '(unknown)';
  const timeRemainingS = Math.floor(ctx.timeRemainingMs / 1000);
  const lastErrorLine = ctx.lastError
    ? `\n- Last turn failed: ${ctx.lastError}`
    : '';

  // ── Mode-specific rules ────────────────────────────────────────────────
  const extraRuleLines = cap.extraRules
    .map((rule: string, i: number) => `${i + 1}. ${rule}`)
    .join('\n');

  // ── Site guide + skill ─────────────────────────────────────────────────
  const siteGuideSection = ctx.siteGuide
    ? ctx.siteGuide
    : '(no site guide matches this URL — use DOM and AX tree only)';
  const installedSkillSection = ctx.installedSkill
    ? ctx.installedSkill
    : '(no skill active)';

  return `# OGRE ${modeLabel} MODE

${cap.identity}

## Your current situation
- URL: ${ctx.currentUrl || '(no page loaded)'}
- Site profile: ${ctx.activeProfileName || '(none — fall back to DOM + AX tree)'}
- Active rubric: ${rubricLine}
- Provider: ${providerLine}
- Step ${ctx.stepCount}/${ctx.maxSteps} — ${timeRemainingS}s remaining${lastErrorLine}

## Session goal
${ctx.sessionGoal}

## Available tools
You may invoke these actions — NO OTHERS:

${toolLines.join('\n\n')}

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
${extraRuleLines}

## Output contract
${cap.doneContract}

## Site guide
${siteGuideSection}

## Installed skill
${installedSkillSection}`;
}
