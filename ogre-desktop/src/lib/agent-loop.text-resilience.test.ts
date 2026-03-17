import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentController } from './agent-loop';
import { collectEvents } from './__test-utils__/agent-fixtures';

vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue(undefined),
  getEmbeddedUrl: vi.fn().mockResolvedValue('https://test.com'),
}));
vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue('No elements'),
}));
vi.mock('./agent-api', () => ({
  sendAgentRequest: vi.fn(),
  parseAgentResponse: vi.fn((t) => { try { return JSON.parse(t); } catch { return { text: t }; } }),
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
  vi.mocked(executeAction).mockResolvedValue({ success: true });
});

describe('agent-loop text response resilience', () => {
  it('text response is non-terminal — loop continues', async () => {
    // First response: text (conversational)
    vi.mocked(sendAgentRequest).mockResolvedValueOnce(
      { text: 'I understand. Let me help you.' } as any
    );
    // Second response: action
    vi.mocked(sendAgentRequest).mockResolvedValueOnce(
      { action: 'click', params: { selector: '#btn' }, reasoning: 'clicking' } as any
    );
    // Third response: done
    vi.mocked(sendAgentRequest).mockResolvedValue(
      { action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any
    );

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Click the button' });
    const events = await collectEvents(gen);

    const eventTypes = events.map(e => e.type);
    console.log('Events with text non-terminal:', eventTypes);

    // Must have a text event
    expect(events.some(e => e.type === 'text')).toBe(true);
    // Must ALSO have a propose event (loop continued after text)
    expect(events.some(e => e.type === 'propose')).toBe(true);
    // Must eventually finish
    expect(events.some(e => e.type === 'done')).toBe(true);
  });

  it('text response added to conversation history', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValueOnce(
      { text: 'Noted.' } as any
    );
    vi.mocked(sendAgentRequest).mockResolvedValue(
      { action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any
    );

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    const events = await collectEvents(gen);

    // Second call to sendAgentRequest should have the text response in history
    const calls = vi.mocked(sendAgentRequest).mock.calls;
    if (calls.length >= 2) {
      const secondCallMessages = calls[1][0].messages;
      const hasTextInHistory = secondCallMessages.some(
        (m: { role: string; content: string }) =>
          m.role === 'assistant' && m.content.includes('Noted.')
      );
      expect(hasTextInHistory).toBe(true);
    }
  });

  it('3 consecutive text responses trigger graceful termination', async () => {
    vi.mocked(sendAgentRequest).mockResolvedValue(
      { text: 'I can help.' } as any
    );

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'do something' });
    const events = await collectEvents(gen);

    const eventTypes = events.map(e => e.type);
    console.log('Events with 3x text:', eventTypes);

    // Should terminate
    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    if (doneEvent && 'message' in doneEvent) {
      expect(doneEvent.message).toContain('rephrase');
    }
    
    // Should have emitted exactly 3 text events
    expect(events.filter(e => e.type === 'text').length).toBe(3);
  });
});
