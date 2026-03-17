import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentController } from './agent-loop';
import { collectEvents } from './__test-utils__/agent-fixtures';

// Mock all dependencies (EXACTLY as in agent-loop.test.ts)
vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue(undefined),
  getEmbeddedUrl: vi.fn().mockResolvedValue('https://myopenmath.com'),
}));
vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue('No elements'),
}));
vi.mock('./agent-api', () => ({
  sendAgentRequest: vi.fn(),
}));
vi.mock('./browser-actions', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('./skills-api', () => ({
  buildSiteContextInjection: vi.fn().mockResolvedValue(''),
  buildSkillInjection: vi.fn().mockResolvedValue(''),
}));

import { sendAgentRequest } from './agent-api';
import { executeAction } from './browser-actions';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sendAgentRequest).mockReset();
  vi.mocked(executeAction).mockResolvedValue({ success: true });
});

describe('agent-loop diagnostic: action execution pipeline', () => {
  it('DIAGNOSTIC: executes click action from { response: "..." } server format', async () => {
    // Mock server returning the ACTUAL format: { response: '{"action":"click",...}' }
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      response: JSON.stringify({
        action: 'click',
        params: { selector: '#test-btn' },
        reasoning: 'clicking test button',
      }),
    } as any);
    // After click, return done
    vi.mocked(sendAgentRequest).mockResolvedValue({
      response: JSON.stringify({
        action: 'done',
        params: { success: true, message: 'done' },
        reasoning: 'task complete',
      }),
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Click the test button' });
    const events = await collectEvents(gen);

    // DIAGNOSTIC: Log all events to understand the flow
    console.log('Events received:', events.map(e => e.type));

    // Find the propose event
    const proposeEvent = events.find(e => e.type === 'propose');
    const resultEvent = events.find(e => e.type === 'result');

    // Document findings
    if (!proposeEvent) {
      // DIAGNOSTIC: If no propose event, the AI response parsing failed
      console.log('DIAGNOSTIC FAILURE: No propose event — parsing chain broken');
      console.log('All events:', JSON.stringify(events, null, 2));
    }
    if (!resultEvent) {
      // DIAGNOSTIC: If no result event, executeAction was never called
      console.log('DIAGNOSTIC FAILURE: No result event — action dispatch broken');
    }

    expect(events.some(e => e.type === 'propose')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);
  });

  it('DIAGNOSTIC: executeAction receives flat ActionParams (not nested params object)', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      response: JSON.stringify({
        action: 'type',
        params: { selector: '#input', text: 'hello world' },
        reasoning: 'typing',
      }),
    } as any);
    vi.mocked(sendAgentRequest).mockResolvedValue({
      response: JSON.stringify({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' }),
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Type hello' });
    await collectEvents(gen);

    // Check what executeAction was called with
    const calls = vi.mocked(executeAction).mock.calls;
    console.log('executeAction calls:', JSON.stringify(calls, null, 2));

    if (calls.length > 0) {
      const firstCallArg = calls[0][0] as Record<string, unknown>;
      // Should be { action: 'type', selector: '#input', text: 'hello world' }
      // NOT { action: 'type', params: { selector: '#input', text: 'hello world' } }
      console.log('executeAction arg shape:', JSON.stringify(firstCallArg));

      if ('params' in firstCallArg) {
        // DIAGNOSTIC: params was NOT spread — this is the bug!
        console.log('DIAGNOSTIC FAILURE: ActionParams has nested params object, not flat!');
        console.log('Bug location: agent-loop.ts line ~284: { action, ...params }');
      } else if (firstCallArg.action === 'type') {
        console.log('DIAGNOSTIC OK: ActionParams is flat as expected');
      }
    }
  });

  it('DIAGNOSTIC: text response emits text event', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      response: JSON.stringify({ text: 'I can help with that!' }),
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'What can you do?' });
    const events = await collectEvents(gen);

    console.log('Text path events:', events.map(e => e.type));

    const textEvent = events.find(e => e.type === 'text');
    if (textEvent && 'content' in textEvent) {
      console.log('Text content:', textEvent.content);
    }

    // Document current behavior (may or may not terminate)
    const loopContinues = events.filter(e => e.type === 'thinking').length > 1;
    console.log('Loop continues after text?', loopContinues, '(currently terminates — this is the bug Task 6 fixes)');

    expect(textEvent).toBeDefined();
  });

  it('DIAGNOSTIC: handles direct action format (no response wrapper)', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      action: 'click',
      params: { selector: '#btn' },
      reasoning: 'clicking',
    } as any);
    vi.mocked(sendAgentRequest).mockResolvedValue({
      response: JSON.stringify({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' }),
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Click' });
    const events = await collectEvents(gen);

    console.log('Direct format events:', events.map(e => e.type));
    const proposeEvent = events.find(e => e.type === 'propose');
    console.log('Direct format propose:', proposeEvent ? 'YES' : 'NO — direct format may not be handled');
  });
});

// =============================================================================
// DIAGNOSTIC REPORT (to be filled in after running tests)
// =============================================================================
// Root cause of "actions fail with error in chat":
// Evidence: When response shape is { response: "...json..." }, agent-loop consumes it
// as AgentActionResponse without parsing; action/params become undefined.
// Observed effects:
//   - executeAction receives {} (from { action, ...params } with undefined inputs)
//   - text wrapper path never emits 'text' (test 3 fails as expected)
//   - loop emits propose/result with invalid payloads until loop guard terminates
// Direct format { action, params } works (test 4), isolating break to wrapped-response handling.
// Fix needed in Task 4: normalize/parse wrapped { response: string } payload before
// Step 3 branch checks in agent-loop (or guarantee mocks/transport always return parsed AgentApiResponse).
// =============================================================================
