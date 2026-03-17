import { describe, it, expect, vi } from 'vitest';
import {
  createMockAgentServer,
  collectEvents,
  createTestSiteProfile,
  createTestSkillContent,
  createTestDomElements,
} from './agent-fixtures';
import type { AgentApiResponse, AgentEvent } from '../agent-types';

describe('createMockAgentServer', () => {
  it('returns responses in sequence', async () => {
    const responses: AgentApiResponse[] = [
      { action: 'click', params: { selector: '#btn1' }, reasoning: 'click first' },
      { action: 'click', params: { selector: '#btn2' }, reasoning: 'click second' },
    ];
    const mock = createMockAgentServer(responses);

    const call1 = await mock();
    const call2 = await mock();

    // Responses should be wrapped in { response: string } format
    expect(call1).toEqual({
      response: JSON.stringify(responses[0]),
    });
    expect(call2).toEqual({
      response: JSON.stringify(responses[1]),
    });
  });

  it('repeats last response when exhausted', async () => {
    const responses: AgentApiResponse[] = [
      { action: 'click', params: { selector: '#btn' }, reasoning: 'click' },
    ];
    const mock = createMockAgentServer(responses);

    await mock(); // first call
    const call2 = await mock(); // second call (exhausted)
    const call3 = await mock(); // third call (still exhausted)

    // Both should return the last response
    expect(call2).toEqual({
      response: JSON.stringify(responses[0]),
    });
    expect(call3).toEqual({
      response: JSON.stringify(responses[0]),
    });
  });

  it('wraps action responses in { response: string } format', async () => {
    const actionResponse: AgentApiResponse = {
      action: 'navigate',
      params: { url: 'https://example.com' },
      reasoning: 'navigate',
    };
    const mock = createMockAgentServer([actionResponse]);

    const result = await mock();

    expect(result).toHaveProperty('response');
    expect(typeof result.response).toBe('string');
    expect(JSON.parse(result.response)).toEqual(actionResponse);
  });

  it('handles text responses', async () => {
    const textResponse: AgentApiResponse = { text: 'Here is my answer' };
    const mock = createMockAgentServer([textResponse]);

    const result = await mock();

    expect(result).toEqual({
      response: JSON.stringify(textResponse),
    });
  });
});

describe('collectEvents', () => {
  it('collects all events from generator', async () => {
    async function* testGen(): AsyncGenerator<AgentEvent> {
      yield { type: 'thinking' };
      yield { type: 'propose', action: 'click', params: { selector: '#btn' }, reasoning: 'click' };
      yield { type: 'done', message: 'Finished' };
    }

    const events = await collectEvents(testGen());

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('thinking');
    expect(events[1].type).toBe('propose');
    expect(events[2].type).toBe('done');
  });

  it('returns empty array for done generator', async () => {
    async function* testGen(): AsyncGenerator<AgentEvent> {
      // Empty generator
    }

    const events = await collectEvents(testGen());

    expect(events).toEqual([]);
  });

  it('times out after 5 seconds to prevent hanging tests', { timeout: 10000 }, async () => {
    async function* infiniteGen(): AsyncGenerator<AgentEvent> {
      while (true) {
        yield { type: 'thinking' };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const startTime = Date.now();
    const events = await collectEvents(infiniteGen());
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(6000);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('createTestSiteProfile', () => {
  it('returns valid SiteGuideJSON shape', () => {
    const profile = createTestSiteProfile();

    expect(profile).toHaveProperty('site');
    expect(profile).toHaveProperty('baseUrl');
    expect(profile).toHaveProperty('role');
    expect(profile).toHaveProperty('urlPatterns');
    expect(profile).toHaveProperty('selectors');
    expect(profile).toHaveProperty('navigation');
    expect(profile).toHaveProperty('workflows');
    expect(profile).toHaveProperty('gotchas');
  });

  it('has correct types for all properties', () => {
    const profile = createTestSiteProfile();

    expect(typeof profile.site).toBe('string');
    expect(typeof profile.baseUrl).toBe('string');
    expect(typeof profile.role).toBe('string');
    expect(Array.isArray(profile.urlPatterns)).toBe(true);
    expect(typeof profile.selectors).toBe('object');
    expect(typeof profile.navigation).toBe('object');
    expect(Array.isArray(profile.workflows)).toBe(true);
    expect(Array.isArray(profile.gotchas)).toBe(true);
  });

  it('includes test site name and URL', () => {
    const profile = createTestSiteProfile();

    expect(profile.site).toContain('Test');
    expect(profile.baseUrl).toContain('test.example.com');
  });
});

describe('createTestSkillContent', () => {
  it('includes skill name in output', () => {
    const content = createTestSkillContent('MySkill');

    expect(content).toContain('MySkill');
  });

  it('returns valid SKILL.md formatted content', () => {
    const content = createTestSkillContent('TestSkill');

    expect(content).toContain('--- SKILL:');
    expect(content).toContain('--- END SKILL ---');
  });

  it('uses default name when not provided', () => {
    const content = createTestSkillContent();

    expect(content).toContain('--- SKILL:');
    expect(content).toContain('--- END SKILL ---');
  });
});

describe('createTestDomElements', () => {
  it('returns array of InteractiveElements', () => {
    const elements = createTestDomElements();

    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('each element has required properties', () => {
    const elements = createTestDomElements();

    elements.forEach((el) => {
      expect(el).toHaveProperty('index');
      expect(el).toHaveProperty('tag');
      expect(el).toHaveProperty('text');
      expect(el).toHaveProperty('disabled');
      expect(el).toHaveProperty('visible');
      expect(el).toHaveProperty('selector');
    });
  });

  it('includes at least a button and an input', () => {
    const elements = createTestDomElements();
    const tags = elements.map((el) => el.tag);

    expect(tags).toContain('button');
    expect(tags).toContain('input');
  });

  it('elements have valid selectors', () => {
    const elements = createTestDomElements();

    elements.forEach((el) => {
      expect(typeof el.selector).toBe('string');
      expect(el.selector.length).toBeGreaterThan(0);
    });
  });
});
