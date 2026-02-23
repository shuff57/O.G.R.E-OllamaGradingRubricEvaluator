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
import { createAgentController } from './agent-loop';

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
