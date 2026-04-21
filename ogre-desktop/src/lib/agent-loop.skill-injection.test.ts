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
vi.mock('./agent-prompt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agent-prompt')>();
  return { ...actual };
});
vi.mock('./skills-api', () => ({
  buildSiteContextInjection: vi
    .fn()
    .mockResolvedValue('--- SITE GUIDE (JSON): TestSite ---\n{}\n--- END SITE GUIDE ---'),
  buildSkillInjection: vi
    .fn()
    .mockResolvedValue('--- SKILL: TestSkill ---\nDo the task step by step.\n--- END SKILL ---'),
  getMatchingSkillsForUrl: vi.fn().mockResolvedValue([]),
}));
vi.mock('./profile-precedence', () => ({
  selectBestProfile: vi.fn().mockReturnValue(null),
}));

import { sendAgentRequest } from './agent-api';
import { getEmbeddedUrl } from './browser';
import { buildSiteContextInjection, buildSkillInjection } from './skills-api';

beforeEach(async () => {
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
  const { getMatchingSkillsForUrl } = await import('./skills-api');
  (getMatchingSkillsForUrl as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  const { selectBestProfile } = await import('./profile-precedence');
  (selectBestProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
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

  it('site guide appears BEFORE skill in system prompt (harness layout)', async () => {
    // The runtime harness renders ## Site guide before ## Installed skill.
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
    expect(guidePos).toBeLessThan(skillPos);
  });

  it('empty skill injection renders no-skill-active placeholder', async () => {
    vi.mocked(buildSkillInjection).mockResolvedValue('');

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    await collectEvents(gen);

    const firstCallMessages = vi.mocked(sendAgentRequest).mock.calls[0][0].messages;
    const systemMessage = firstCallMessages.find((m: { role: string }) => m.role === 'system');

    expect(systemMessage).toBeDefined();
    // The harness renders a placeholder when no skill is active
    expect(systemMessage!.content).toContain('(no skill active)');
    expect(systemMessage!.content).not.toContain('--- SKILL:');
  });

  it('buildSkillInjection is called when loop starts', async () => {
    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'test' });
    await collectEvents(gen);

    expect(buildSkillInjection).toHaveBeenCalledTimes(1);
  });
});
