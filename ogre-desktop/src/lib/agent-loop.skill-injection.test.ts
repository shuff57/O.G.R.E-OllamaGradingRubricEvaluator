import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentController } from './agent-loop';
import { collectEvents } from './__test-utils__/agent-fixtures';

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
  parseAgentResponse: vi.fn((t) => {
    try {
      return JSON.parse(t);
    } catch {
      return { text: t };
    }
  }),
}));
vi.mock('./browser-actions', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('./agent-prompt', () => ({
  AGENT_SYSTEM_PROMPT: 'You are a browser agent.',
}));
vi.mock('./skills-api', () => ({
  buildSiteContextInjection: vi
    .fn()
    .mockResolvedValue('--- SITE GUIDE (JSON): TestSite ---\n{}\n--- END SITE GUIDE ---'),
  buildSkillInjection: vi
    .fn()
    .mockResolvedValue('--- SKILL: TestSkill ---\nDo the task step by step.\n--- END SKILL ---'),
}));

import { sendAgentRequest } from './agent-api';
import { getEmbeddedUrl } from './browser';
import { buildSiteContextInjection, buildSkillInjection } from './skills-api';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sendAgentRequest).mockResolvedValue({
    action: 'done',
    params: { success: true, message: 'done' },
    reasoning: '',
  } as any);
  vi.mocked(getEmbeddedUrl).mockResolvedValue('https://myopenmath.com');
  vi.mocked(buildSiteContextInjection).mockResolvedValue(
    '--- SITE GUIDE (JSON): TestSite ---\n{}\n--- END SITE GUIDE ---',
  );
  vi.mocked(buildSkillInjection).mockResolvedValue(
    '--- SKILL: TestSkill ---\nDo the task step by step.\n--- END SKILL ---',
  );
});

describe('agent-loop skill injection', () => {
  it('includes skill content in system prompt when skills are active', async () => {
    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test task' });
    await collectEvents(gen);

    const firstCallMessages = vi.mocked(sendAgentRequest).mock.calls[0][0].messages;
    const systemMessage = firstCallMessages.find((m: { role: string }) => m.role === 'system');

    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content).toContain('--- SKILL: TestSkill ---');
    expect(systemMessage!.content).toContain('Do the task step by step.');
  });

  it('skill content appears BEFORE site guide in system prompt', async () => {
    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    await collectEvents(gen);

    const firstCallMessages = vi.mocked(sendAgentRequest).mock.calls[0][0].messages;
    const systemMessage = firstCallMessages.find((m: { role: string }) => m.role === 'system');

    expect(systemMessage).toBeDefined();
    const skillPos = systemMessage!.content.indexOf('--- SKILL:');
    const guidePos = systemMessage!.content.indexOf('--- SITE GUIDE');
    expect(skillPos).toBeGreaterThanOrEqual(0);
    expect(guidePos).toBeGreaterThanOrEqual(0);
    expect(skillPos).toBeLessThan(guidePos);
  });

  it('empty skill injection does not add spurious content', async () => {
    vi.mocked(buildSkillInjection).mockResolvedValue('');

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    await collectEvents(gen);

    const firstCallMessages = vi.mocked(sendAgentRequest).mock.calls[0][0].messages;
    const systemMessage = firstCallMessages.find((m: { role: string }) => m.role === 'system');

    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content).not.toContain('\n\n\n');
    expect(systemMessage!.content).toBe(
      'You are a browser agent.\n\n--- SITE GUIDE (JSON): TestSite ---\n{}\n--- END SITE GUIDE ---',
    );
  });

  it('buildSkillInjection is called when loop starts', async () => {
    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    await collectEvents(gen);

    expect(buildSkillInjection).toHaveBeenCalledTimes(1);
  });
});
