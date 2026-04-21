import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentController } from './agent-loop';
import { collectEvents } from './__test-utils__/agent-fixtures';

vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue(undefined),
  getEmbeddedUrl: vi.fn().mockResolvedValue('https://myopenmath.com'),
}));
vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue('[1] button "Submit" (#submit-btn)'),
}));
vi.mock('./agent-api', () => ({
  sendAgentRequest: vi.fn(),
  parseAgentResponse: vi.fn((t: string) => { try { return JSON.parse(t); } catch { return { text: t }; } }),
}));
vi.mock('./browser-actions', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('./skills-api', () => ({
  buildSiteContextInjection: vi.fn().mockResolvedValue('--- SITE GUIDE (JSON): MyOpenMath ---\n{}\n--- END SITE GUIDE ---'),
  buildSkillInjection: vi.fn().mockResolvedValue('--- SKILL: gb-sync ---\nSync gradebook.\n--- END SKILL ---'),
  getMatchingSkillsForUrl: vi.fn().mockResolvedValue([]),
}));

vi.mock('./profile-precedence', () => ({
  selectBestProfile: vi.fn().mockReturnValue(null),
}));

import { sendAgentRequest } from './agent-api';
import { getEmbeddedUrl } from './browser';
import { executeAction } from './browser-actions';
import { buildSiteContextInjection } from './skills-api';
import { buildSkillInjection } from './skills-api';

beforeEach(() => {
  vi.clearAllMocks(); // clear call history only — preserve factory implementations
  vi.mocked(getEmbeddedUrl).mockResolvedValue('https://myopenmath.com');
  vi.mocked(executeAction).mockResolvedValue({ success: true });
  vi.mocked(buildSiteContextInjection).mockResolvedValue('--- SITE GUIDE (JSON): MyOpenMath ---\n{}\n--- END SITE GUIDE ---');
  vi.mocked(buildSkillInjection).mockResolvedValue('--- SKILL: gb-sync ---\nSync gradebook.\n--- END SKILL ---');
});

describe('agent-loop integration: full pipeline', () => {
  it('Scenario 1: click action executes successfully', async () => {
    vi.mocked(sendAgentRequest)
      .mockResolvedValueOnce({ action: 'click', params: { selector: '#submit-btn' }, reasoning: 'clicking' } as any)
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any);
    const controller = createAgentController();
    const events = await collectEvents(controller.start({ mode: 'auto', initialMessage: 'Click submit' }));
    expect(events.some(e => e.type === 'propose')).toBe(true);
    expect(events.some(e => e.type === 'result')).toBe(true);
    expect(vi.mocked(executeAction)).toHaveBeenCalledWith(expect.objectContaining({ action: 'click', selector: '#submit-btn' }));
  });

  it('Scenario 2: type action with text parameter', async () => {
    vi.mocked(sendAgentRequest)
      .mockResolvedValueOnce({ action: 'type', params: { selector: 'input.score', text: '8' }, reasoning: 'typing' } as any)
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any);
    const controller = createAgentController();
    await collectEvents(controller.start({ mode: 'auto', initialMessage: 'Enter score 8' }));
    expect(vi.mocked(executeAction)).toHaveBeenCalledWith(expect.objectContaining({ action: 'type', selector: 'input.score', text: '8' }));
  });

  it('Scenario 3: readText action', async () => {
    vi.mocked(executeAction).mockResolvedValueOnce({ success: true, data: 'Student: John' });
    vi.mocked(sendAgentRequest)
      .mockResolvedValueOnce({ action: 'readText', params: { selector: '.name' }, reasoning: 'reading' } as any)
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any);
    const controller = createAgentController();
    const events = await collectEvents(controller.start({ mode: 'auto', initialMessage: 'Read name' }));
    expect(events.some(e => e.type === 'result')).toBe(true);
  });

  it('Scenario 4: system prompt contains both skill and site guide content', async () => {
    // The harness renders ## Site guide before ## Installed skill.
    vi.mocked(sendAgentRequest).mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any);
    const controller = createAgentController();
    await collectEvents(controller.start({ mode: 'auto', initialMessage: 'sync' }));
    const msgs = vi.mocked(sendAgentRequest).mock.calls[0][0].messages;
    const sys = msgs.find((m: { role: string }) => m.role === 'system');
    expect(sys?.content).toContain('--- SKILL: gb-sync ---');
    expect(sys?.content).toContain('--- SITE GUIDE (JSON): MyOpenMath ---');
    // Harness layout: site guide comes before installed skill
    expect(sys?.content.indexOf('--- SITE GUIDE')).toBeLessThan(sys?.content.indexOf('--- SKILL:'));
  });

  it('Scenario 5: text response is non-terminal', async () => {
    vi.mocked(sendAgentRequest)
      .mockResolvedValueOnce({ text: 'I understand.' } as any)
      .mockResolvedValueOnce({ action: 'click', params: { selector: '#btn' }, reasoning: 'clicking' } as any)
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any);
    const controller = createAgentController();
    const events = await collectEvents(controller.start({ mode: 'auto', initialMessage: 'click' }));
    expect(events.some(e => e.type === 'text')).toBe(true);
    expect(events.some(e => e.type === 'propose')).toBe(true);
  });

  it('Scenario 6: { response: string } safety net', async () => {
    vi.mocked(sendAgentRequest)
      .mockResolvedValueOnce({ response: JSON.stringify({ action: 'click', params: { selector: '#test' }, reasoning: 'test' }) } as any)
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' } as any);
    const controller = createAgentController();
    const events = await collectEvents(controller.start({ mode: 'auto', initialMessage: 'test' }));
    expect(events.some(e => e.type === 'propose')).toBe(true);
    expect(vi.mocked(executeAction)).toHaveBeenCalledWith(expect.objectContaining({ action: 'click', selector: '#test' }));
  });
});
