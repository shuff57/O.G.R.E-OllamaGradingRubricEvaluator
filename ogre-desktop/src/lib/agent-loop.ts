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
import { captureWebviewScreenshot } from './browser';
import { sendAgentRequest } from './agent-api';
import { executeAction } from './browser-actions';
import { AGENT_SYSTEM_PROMPT } from './agent-prompt';
import type {
  AgentMode,
  AgentAction,
  AgentConfig,
  ActionResult,
  ActionParams,
  AgentApiResponse,
  AgentActionResponse,
} from './agent-types';
import { DEFAULT_AGENT_CONFIG } from './agent-types';

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
  | { type: 'error'; message: string };

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

    // Conversation history — uses `role: string` to allow 'system' alongside AgentMessage roles
    const conversationHistory: Array<{ role: string; content: string }> = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: config.initialMessage },
    ];

    let stepCount = 0;
    const startTime = Date.now();
    let lastActionKey = '';
    let lastActionRepeatCount = 0;

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
      yield { type: 'thinking' };

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

      // ── Step 2: Call AI ──
      let response: AgentApiResponse;
      try {
        response = await sendAgentRequest({
          messages: conversationHistory as any,
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

      // Text-only response (no action)
      if ('text' in response) {
        yield { type: 'text', content: response.text };
        conversationHistory.push({ role: 'assistant', content: response.text });
        // Text responses are terminal — agent answered without taking action
        return;
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
