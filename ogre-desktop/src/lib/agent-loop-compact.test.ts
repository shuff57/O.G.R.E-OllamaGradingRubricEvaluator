import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
}));

vi.mock('./agent-api', () => ({
  sendAgentRequest: vi.fn(),
}));

vi.mock('./browser-actions', () => ({
  executeAction: vi.fn(),
}));

vi.mock('./agent-prompt', () => ({
  AGENT_SYSTEM_PROMPT: 'You are a browser agent.',
}));

import { sendAgentRequest } from './agent-api';
import { executeAction } from './browser-actions';
import { captureWebviewScreenshot } from './browser';
import { createAgentController, pruneHistory } from './agent-loop';
import type { AgentMessage } from './agent-types';

const mockSend = sendAgentRequest as ReturnType<typeof vi.fn>;
const mockExecute = executeAction as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetAllMocks();
  const { captureInteractiveDom, formatDomForPrompt } = await import('./agent-dom');
  (captureInteractiveDom as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (formatDomForPrompt as ReturnType<typeof vi.fn>).mockReturnValue('');
  (captureWebviewScreenshot as ReturnType<typeof vi.fn>).mockResolvedValue('data:image/png;base64,abc');
});

async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe('Agent loop: compact mode', () => {
  test('compact=true in auto mode suppresses thinking events', async () => {
    mockSend.mockResolvedValueOnce({
      action: 'done',
      params: { success: true, message: 'Task complete' },
      reasoning: 'done',
    });
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'Task complete' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', compact: true, initialMessage: 'test' });
    const events = await collectEvents(gen);

    const thinkingEvents = events.filter((e) => e.type === 'thinking');
    expect(thinkingEvents).toHaveLength(0);
  });

  test('compact=false in auto mode emits thinking events', async () => {
    mockSend.mockResolvedValueOnce({
      action: 'done',
      params: { success: true, message: 'Task complete' },
      reasoning: 'done',
    });
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'Task complete' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', compact: false, initialMessage: 'test' });
    const events = await collectEvents(gen);

    const thinkingEvents = events.filter((e) => e.type === 'thinking');
    expect(thinkingEvents.length).toBeGreaterThan(0);
  });

  test('default compact (no option) suppresses thinking in auto mode', async () => {
    // compact defaults to true
    mockSend.mockResolvedValueOnce({
      action: 'done',
      params: { success: true, message: 'done' },
      reasoning: 'done',
    });
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'done' } });

    const controller = createAgentController();
    // No compact option — should default to true
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    const events = await collectEvents(gen);

    const thinkingEvents = events.filter((e) => e.type === 'thinking');
    expect(thinkingEvents).toHaveLength(0);
  });
});

describe('Agent loop: screenshot retry on selector failure', () => {
  test('captures screenshot and retries after element-not-found failure', async () => {
    // First AI call: click a bad selector
    mockSend.mockResolvedValueOnce({
      action: 'click',
      params: { selector: '#bad-selector' },
      reasoning: 'clicking the button',
    });
    // Action fails
    mockExecute.mockResolvedValueOnce({ success: false, error: 'Element not found: #bad-selector' });

    // Second AI call (after retry): done
    mockSend.mockResolvedValueOnce({
      action: 'done',
      params: { success: true, message: 'completed' },
      reasoning: 'done',
    });
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'completed' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', compact: true, initialMessage: 'click something' });
    const events = await collectEvents(gen);

    // Screenshot should be captured for the retry
    const screenshotMock = captureWebviewScreenshot as ReturnType<typeof vi.fn>;
    expect(screenshotMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // sendAgentRequest should be called at least twice
    expect(mockSend.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Loop should eventually reach 'done'
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents.length).toBeGreaterThan(0);
  });

  test('screenshot retry is capped at 1 per action (no infinite loop)', async () => {
    // Always return the same failing click action
    mockSend.mockResolvedValue({
      action: 'click',
      params: { selector: '#always-fails' },
      reasoning: 'clicking',
    });
    // Always fail
    mockExecute.mockResolvedValue({ success: false, error: 'Element not found: #always-fails' });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', compact: true, initialMessage: 'click forever' });
    const events = await collectEvents(gen);

    // Loop should terminate (via loop detection or maxSteps) — not hang forever
    const terminalEvents = events.filter((e) => e.type === 'done' || e.type === 'error');
    expect(terminalEvents.length).toBeGreaterThan(0);

    // Screenshot should NOT be called infinitely — the retry cap + loop detection kicks in
    const screenshotMock = captureWebviewScreenshot as ReturnType<typeof vi.fn>;
    // Should be bounded (not more than 2x maxSteps or so)
    expect(screenshotMock.mock.calls.length).toBeLessThan(30);
  });
});


describe('pruneHistory', () => {
  const sys: AgentMessage = { role: 'system', content: 'SYSTEM' };
  const init: AgentMessage = { role: 'user', content: 'Initial request' };
  const makeMsg = (i: number): AgentMessage => ({ role: 'user', content: `msg-${i}` });
  const makeScreenshotMsg = (i: number): AgentMessage => ({
    role: 'user',
    content: `retry-${i}`,
    screenshot: `data:image/png;base64,HUGE_BLOB_${i}`,
  });

  test('empty history returns empty array', () => {
    expect(pruneHistory([])).toEqual([]);
  });

  test('preserves system + initial messages as anchors', () => {
    const history = [sys, init, makeMsg(1), makeMsg(2)];
    const result = pruneHistory(history, 16);
    expect(result[0]).toEqual(sys);
    expect(result[1]).toEqual(init);
  });

  test('strips screenshot field from all messages', () => {
    const history = [
      sys,
      init,
      makeScreenshotMsg(1),
      makeScreenshotMsg(2),
    ];
    const result = pruneHistory(history, 16);
    for (const msg of result) {
      expect((msg as any).screenshot).toBeUndefined();
    }
  });

  test('windows to last N messages beyond anchors', () => {
    const history = [sys, init, ...Array.from({ length: 20 }, (_, i) => makeMsg(i))];
    const result = pruneHistory(history, 10);
    // 2 anchors + 10 windowed = 12 total
    expect(result).toHaveLength(12);
    // Last message should be msg-19
    expect(result[result.length - 1].content).toBe('msg-19');
    // First non-anchor should be msg-10 (last 10 of 0..19)
    expect(result[2].content).toBe('msg-10');
  });

  test('does not window when history is within limit', () => {
    const history = [sys, init, makeMsg(0), makeMsg(1)];
    const result = pruneHistory(history, 16);
    expect(result).toHaveLength(4);
  });

  test('does not mutate original history', () => {
    const msg = makeScreenshotMsg(1);
    const history = [sys, init, msg];
    pruneHistory(history, 16);
    // Original message still has screenshot
    expect(msg.screenshot).toBeDefined();
  });
});
