/**
 * agent-loop.ts - Client-side agent loop with async generator pattern.
 *
 * Provides the core control loop for the browser agent:
 * - Captures page state (DOM + screenshot)
 * - Sends context to AI for action decisions
 * - Executes approved actions
 * - Handles review mode (pause for approval) and auto mode
 * - Safety limits: max steps, timeout, loop detection
 */

import { captureInteractiveDom, formatDomForPrompt } from './agent-dom';
import { captureWebviewScreenshot, getEmbeddedUrl } from './browser';
import { sendAgentRequest, parseAgentResponse } from './agent-api';
import { executeAction } from './browser-actions';
import { AGENT_SYSTEM_PROMPT } from './agent-prompt';
import { buildSiteContextInjection } from './skills-api';
import type {
  AgentMode,
  AgentAction,
  AgentConfig,
  ActionResult,
  ActionParams,
  AgentApiResponse,
  AgentActionResponse,
  AgentMessage,
} from './agent-types';
import { DEFAULT_AGENT_CONFIG } from './agent-types';

// ============================================================================
// History Management
// ============================================================================

/**
 * Prune conversation history before sending to the AI API.
 *
 * Two operations:
 * 1. Strip `screenshot` from ALL history messages — old screenshots are stale and
 *    enormous (base64 PNG ≈ 50K–200K tokens each). The CURRENT screenshot is already
 *    passed as a separate top-level param to sendAgentRequest.
 * 2. Window to last `keepRecentMessages` non-anchor messages so the history cannot
 *    grow without bound across 30-step sessions.
 *
 * Anchors always kept: system message (index 0) + initial user message (index 1).
 */
export function pruneHistory(
  history: AgentMessage[],
  keepRecentMessages: number = 16,
): AgentMessage[] {
  if (history.length === 0) return [];

  // Anchors: system prompt + initial user request — always included
  const anchors = history.slice(0, 2);
  const rest = history.slice(2);

  // Keep only the most recent N messages beyond the anchors
  const windowed = rest.length > keepRecentMessages ? rest.slice(-keepRecentMessages) : rest;

  // Strip screenshot field from every message — they are huge base64 blobs
  // and only the *current* screenshot matters (passed separately to the API).
  return [...anchors, ...windowed].map(({ screenshot: _sc, ...msg }) => msg as AgentMessage);
}

/**
 * Maximum context window used for percentage calculations.
 * Anthropic Claude supports 200K; other providers vary but we use this as the baseline.
 */
export const MAX_CONTEXT_TOKENS = 200_000;

/** How many characters roughly equal one token (industry approximation). */
const CHARS_PER_TOKEN = 4;

/**
 * How many recent non-anchor messages pruneHistory keeps.
 * Must match the default in pruneHistory() so compaction detection is accurate.
 */
const PRUNE_WINDOW = 16;

/**
 * Estimate the token count of a set of messages plus optional DOM/screenshot.
 *
 * Approximation: 1 token ≈ 4 characters (text). Screenshots are estimated at
 * 5,000 tokens each (typical WebView2 capture at modest resolution).
 */
export function estimateTokens(
  messages: AgentMessage[],
  dom?: string,
  screenshot?: string,
): number {
  let tokens = 0;
  for (const msg of messages) {
    tokens += Math.ceil(msg.content.length / CHARS_PER_TOKEN);
  }
  if (dom) tokens += Math.ceil(dom.length / CHARS_PER_TOKEN);
  if (screenshot) tokens += 5_000;
  return tokens;
}

// ============================================================================
// Event Types
// ============================================================================

/** Events emitted by the agent loop async generator. */
export type AgentEvent =
  | { type: 'thinking' }
  | { type: 'propose'; action: AgentAction; params: Record<string, unknown>; reasoning: string }
  | { type: 'executing'; action: AgentAction; params: Record<string, unknown> }
  | { type: 'result'; action: AgentAction; result: ActionResult }
  | { type: 'text'; content: string }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string }
  /** Emitted every iteration with the estimated token usage for the current API call. */
  | { type: 'context'; usedTokens: number; maxTokens: number; percent: number }
  /** Emitted once when history windowing first drops old messages. */
  | { type: 'compacted'; droppedMessages: number };

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for the agent loop. */
export interface AgentLoopConfig {
  mode: AgentMode;
  initialMessage: string;
  config?: Partial<AgentConfig>;
  signal?: AbortSignal;
  /** Provider to use for AI calls (overrides server active provider) */
  provider?: string;
  /** Model to use for AI calls */
  model?: string;
  /** When true (default), skip emitting 'thinking' events in auto mode for compact output */
  compact?: boolean;
}

// ============================================================================
// Controller Interface
// ============================================================================

/** Controller returned by createAgentController(). */
export interface AgentController {
  /** Start the agent loop. Returns an async generator of AgentEvents. */
  start(config: AgentLoopConfig): AsyncGenerator<AgentEvent>;
  /** Approve the current proposed action (review mode only). */
  approve(): void;
  /** Skip the current proposed action (review mode only). */
  skip(): void;
  /** Stop the agent loop (abort). */
  stop(): void;
}

// ============================================================================
// Controller Factory
// ============================================================================

/**
 * Create a new agent controller.
 *
 * The controller manages the lifecycle of an agent loop:
 * - `start()` begins the loop and returns an async generator
 * - `approve()` / `skip()` resolve the review-mode gate
 * - `stop()` aborts the loop via AbortController
 */
export function createAgentController(): AgentController {
  // Shared state between loop and controller
  let approvalResolve: ((decision: 'approve' | 'skip') => void) | null = null;
  let internalAbort = new AbortController();

  async function* runLoop(config: AgentLoopConfig): AsyncGenerator<AgentEvent> {
    const loopConfig: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...config.config };
    const signal = config.signal ?? internalAbort.signal;

    // Get current browser URL and build site context injection if a profile matches
    let siteContext = '';
    try {
      const currentUrl = await getEmbeddedUrl();
      if (currentUrl) {
        siteContext = await buildSiteContextInjection(currentUrl);
      }
    } catch {
      // No browser open or URL unavailable — skip injection
    }
    const systemPrompt = siteContext
      ? `${AGENT_SYSTEM_PROMPT}\n\n${siteContext}`
      : AGENT_SYSTEM_PROMPT;

    // Conversation history — includes system role and optional screenshot field
    const conversationHistory: AgentMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: config.initialMessage },
    ];

    let stepCount = 0;
    const startTime = Date.now();
    let lastActionKey = '';
    let lastActionRepeatCount = 0;
    let consecutiveFailures = 0;
    let consecutiveTextResponses = 0;
    let lastSiteContext = siteContext;

    const isCompact = config.compact ?? true;
    /** Tracks the action key of the last selector failure that triggered a screenshot retry */
    let lastFailedAction: string | null = null;
    /** Tracks how many messages were dropped by windowing last iteration (for compaction events). */
    let lastDroppedMessages = 0;
    while (true) {
      // ── Safety checks ──
      if (signal.aborted) {
        yield { type: 'error', message: 'Agent stopped by user' };
        return;
      }
      if (stepCount >= loopConfig.maxSteps) {
        yield { type: 'done', message: `Reached maximum step limit (${loopConfig.maxSteps})` };
        return;
      }
      if (Date.now() - startTime > loopConfig.maxTimeMs) {
        yield { type: 'done', message: 'Reached maximum time limit (5 minutes)' };
        return;
      }

      // ── Step 1: Capture page state ──
      if (!(isCompact && config.mode === 'auto')) {
        yield { type: 'thinking' };
      }

      let dom = '';
      let screenshot: string | undefined;

      try {
        const elements = await captureInteractiveDom();
        dom = formatDomForPrompt(elements);
      } catch {
        /* webview not open yet — continue with empty dom */
      }

      try {
        screenshot = await captureWebviewScreenshot();
      } catch {
        /* vision not available — dom-only mode */
      }

      // ── Step 2: Context tracking + Call AI ──
      const pruned = pruneHistory(conversationHistory);
      const usedTokens = estimateTokens(pruned, dom, screenshot);
      const percent = Math.min(100, Math.round((usedTokens / MAX_CONTEXT_TOKENS) * 100));
      yield { type: 'context', usedTokens, maxTokens: MAX_CONTEXT_TOKENS, percent };

      // Emit compacted event first time windowing drops old messages
      const historyRestLen = Math.max(0, conversationHistory.length - 2);
      const droppedMessages = Math.max(0, historyRestLen - PRUNE_WINDOW);
      if (droppedMessages > 0 && lastDroppedMessages === 0) {
        yield { type: 'compacted', droppedMessages };
      }
      lastDroppedMessages = droppedMessages;
      let response: AgentApiResponse;
      try {
        response = await sendAgentRequest({
          messages: pruned,
          dom: dom || undefined,
          screenshot,
          provider: config.provider || undefined,
          model: config.model || undefined,
        });
      } catch (err: unknown) {
        yield { type: 'error', message: err instanceof Error ? err.message : 'AI request failed' };
        return;
      }

      // ── Step 3: Handle response ──

      if (
        'response' in response &&
        typeof (response as Record<string, unknown>).response === 'string'
      ) {
        response = parseAgentResponse((response as Record<string, unknown>).response as string);
      }

      // Text-only response (no action) — non-terminal
      if ('text' in response) {
        yield { type: 'text', content: response.text };
        conversationHistory.push({ role: 'assistant', content: response.text });
        // Count consecutive text responses — if too many, terminate gracefully
        consecutiveTextResponses = (consecutiveTextResponses ?? 0) + 1;
        if (consecutiveTextResponses >= 3) {
          yield { type: 'done', message: 'Agent provided text responses without taking action. Please rephrase your request to be more specific.' };
          return;
        }
        stepCount++;
        continue; // Non-terminal — loop back to capture page state and ask AI again
      }

      // Action response
      const actionResponse = response as AgentActionResponse;
      const action = actionResponse.action;
      const params = actionResponse.params as Record<string, unknown>;
      const reasoning = actionResponse.reasoning ?? '';

      // Reconstruct ActionParams discriminated union
      const actionParams = { action, ...params } as ActionParams;

      // ── Loop detection ──
      const actionKey = JSON.stringify({ action, params });
      if (actionKey === lastActionKey) {
        lastActionRepeatCount++;
        if (lastActionRepeatCount >= loopConfig.maxSameAction) {
          yield {
            type: 'done',
            message: `Loop detected: same action repeated ${loopConfig.maxSameAction} times`,
          };
          return;
        }
      } else {
        lastActionKey = actionKey;
        lastActionRepeatCount = 1;
      }

      // ── Step 4: Propose action (review mode gate) ──
      yield { type: 'propose', action, params, reasoning };

      // runJS always requires approval, even in auto mode
      const requiresApproval = (config.mode === 'review' && action !== 'done') || action === 'runJS';

      if (requiresApproval) {
        const decision = await new Promise<'approve' | 'skip'>((resolve) => {
          approvalResolve = resolve;
        });
        approvalResolve = null;

        if (decision === 'skip') {
          conversationHistory.push({
            role: 'assistant',
            content: JSON.stringify({ action, params, reasoning }),
          });
          conversationHistory.push({
            role: 'user',
            content: 'Action was skipped by the user. Try a different approach.',
          });
          stepCount++;
          continue;
        }
      }

      // ── Step 5: Execute action ──
      yield { type: 'executing', action, params };

      const result = await executeAction(actionParams);
      yield { type: 'result', action, result };

      // ── Step 6: Update conversation history ──
      conversationHistory.push({
        role: 'assistant',
        content: JSON.stringify({ action, params, reasoning }),
      });
      conversationHistory.push({
        role: 'user',
        content: `Action result: ${JSON.stringify(result)}`,
      });

      // ── Step 6b: Screenshot retry on selector failure ──
      // If a selector-based action failed with "not found", capture a screenshot
      // and ask AI to suggest a better selector. Capped at 1 retry per action.
      const selectorFailed =
        !result.success &&
        action !== 'done' &&
        typeof params.selector === 'string' &&
        result.error &&
        /not found|element not found/i.test(result.error);

      const currentActionKey = JSON.stringify({ action, params });
      if (selectorFailed && lastFailedAction !== currentActionKey) {
        lastFailedAction = currentActionKey;
        // Take screenshot of current page state
        try {
          const retryScreenshot = await captureWebviewScreenshot();
          conversationHistory.push({
            role: 'user',
            content: 'The selector failed. Here is a screenshot of the current page. Please analyze and suggest a better selector.',
            ...(retryScreenshot ? { screenshot: retryScreenshot } : {}),
          });
        } catch {
          conversationHistory.push({
            role: 'user',
            content: 'The selector failed. Screenshot capture was unavailable. Please analyze the DOM and suggest a better selector.',
          });
        }
        // Do NOT increment stepCount — this is a free retry
        continue;
      }

      // Clear retry tracker on successful action or different failure
      if (result.success) {
        lastFailedAction = null;
      }

      // ── Consecutive failure detection ──
      // Counts failures across different actions (catches alternating failure spirals).
      // Screenshot retry (Step 6b) uses `continue` before reaching here, so it is NOT counted.
      if (!result.success && action !== 'done') {
        consecutiveFailures++;
        if (consecutiveFailures >= loopConfig.maxConsecutiveFailures) {
          yield {
            type: 'done',
            message: `Too many consecutive failures (${consecutiveFailures}): last error: ${result.error ?? 'unknown'}`,
          };
          return;
        }
      } else if (result.success) {
        consecutiveFailures = 0;
        consecutiveTextResponses = 0; // Reset on successful action
      }
      // ── Site context refresh after navigate ──
      // When the agent navigates to a new URL, inject an updated site guide as a
      // supplementary user message. Only inject if the guide has changed (avoids
      // duplicates when navigating within the same profiled site).
      if (action === 'navigate' && result.success) {
        try {
          const newUrl = await getEmbeddedUrl();
          const newSiteContext = newUrl ? await buildSiteContextInjection(newUrl) : '';
          if (newSiteContext !== lastSiteContext) {
            const guideContent = newSiteContext || 'No site guide available for this URL. Use DOM elements only.';
            conversationHistory.push({
              role: 'user',
              content: `[System: Navigated to ${newUrl ?? 'new page'}. ${guideContent}]`,
            });
            lastSiteContext = newSiteContext;
          }
        } catch {
          // URL unavailable after navigate — skip context refresh
        }
      }
      // ── Step 7: Check for done action ──
      if (action === 'done') {
        const message = (params as { message?: string }).message ?? 'Task completed';
        yield { type: 'done', message };
        return;
      }
      stepCount++;

      // ── Step 8: Delay between actions ──
      if (loopConfig.actionDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, loopConfig.actionDelayMs));
      }
    }
  }

  return {
    start(config: AgentLoopConfig): AsyncGenerator<AgentEvent> {
      internalAbort = new AbortController(); // reset abort on each start
      return runLoop(config);
    },
    approve() {
      if (approvalResolve) {
        approvalResolve('approve');
        approvalResolve = null;
      }
    },
    skip() {
      if (approvalResolve) {
        approvalResolve('skip');
        approvalResolve = null;
      }
    },
    stop() {
      internalAbort.abort();
      // Also resolve any pending approval (as skip) so loop can exit
      if (approvalResolve) {
        approvalResolve('skip');
        approvalResolve = null;
      }
    },
  };
}
