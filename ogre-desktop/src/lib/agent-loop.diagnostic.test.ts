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
vi.mock('./agent-api', async () => {
  const actual = await vi.importActual<typeof import('./agent-api')>('./agent-api');
  return {
    ...actual,
    sendAgentRequest: vi.fn(),
  };
});
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
  it('FIX: safety net parses { response: string } format correctly', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      response: JSON.stringify({
        action: 'click',
        params: { selector: '#test' },
        reasoning: 'test',
      }),
    } as any);
    vi.mocked(sendAgentRequest).mockResolvedValue({
      action: 'done',
      params: { success: true, message: 'done' },
      reasoning: '',
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    const events = await collectEvents(gen);

    expect(events.some(e => e.type === 'propose')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);
  });

  it('DIAGNOSTIC: executes click action from parsed AgentApiResponse format', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      action: 'click',
      params: { selector: '#test-btn' },
      reasoning: 'clicking test button',
    } as any);
    vi.mocked(sendAgentRequest).mockResolvedValue({
      action: 'done',
      params: { success: true, message: 'done' },
      reasoning: 'task complete',
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Click the test button' });
    const events = await collectEvents(gen);

    expect(events.some(e => e.type === 'propose')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);
  });

  it('DIAGNOSTIC: executeAction receives flat ActionParams (not nested params object)', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      action: 'type',
      params: { selector: '#input', text: 'hello world' },
      reasoning: 'typing',
    } as any);
    vi.mocked(sendAgentRequest).mockResolvedValue({
      action: 'done',
      params: { success: true, message: 'done' },
      reasoning: '',
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Type hello' });
    await collectEvents(gen);

    expect(executeAction).toHaveBeenCalled();
    const firstCallArg = vi.mocked(executeAction).mock.calls[0][0] as Record<string, unknown>;
    expect(firstCallArg).toEqual({ action: 'type', selector: '#input', text: 'hello world' });
    expect(firstCallArg).not.toHaveProperty('params');
  });

  it('DIAGNOSTIC: text response emits text event from parsed format', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      text: 'I can help with that!',
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'What can you do?' });
    const events = await collectEvents(gen);

    const textEvent = events.find(e => e.type === 'text');
    expect(textEvent).toBeDefined();
  });

  it('DIAGNOSTIC: handles direct action format (no response wrapper)', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce({
      action: 'click',
      params: { selector: '#btn' },
      reasoning: 'clicking',
    } as any);
    vi.mocked(sendAgentRequest).mockResolvedValue({
      action: 'done',
      params: { success: true, message: 'done' },
      reasoning: '',
    } as any);

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Click' });
    const events = await collectEvents(gen);

    const proposeEvent = events.find(e => e.type === 'propose');
    expect(proposeEvent).toBeDefined();
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
