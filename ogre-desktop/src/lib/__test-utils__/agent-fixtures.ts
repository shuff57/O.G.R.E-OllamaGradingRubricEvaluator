import { vi } from 'vitest';
import type { AgentApiResponse, ActionResult, InteractiveElement } from '../agent-types';
import type { AgentEvent } from '../agent-loop';
import type { SiteGuideJSON } from '../site-guide-types';

/**
 * Create a mock sendAgentRequest that cycles through an array of responses.
 * Each call returns the next response; repeats last when exhausted.
 * Responses are wrapped in the server format: { response: JSON.stringify(response) }
 */
export function createMockAgentServer(responses: AgentApiResponse[]): any {
  let index = 0;
  return vi.fn(async () => {
    const response = responses[Math.min(index, responses.length - 1)];
    index++;
    return {
      response: JSON.stringify(response),
    };
  });
}

/**
 * Consume an async generator and return all yielded values as an array.
 * Times out after 5 seconds to prevent hanging tests.
 */
export async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  const timeoutMs = 5000;
  const startTime = Date.now();

  try {
    for await (const event of gen) {
      events.push(event);
      if (Date.now() - startTime > timeoutMs) {
        break;
      }
    }
  } catch (error) {
    // Timeout or other error - return what we collected
  }

  return events;
}

/**
 * Return a valid SiteGuideJSON test profile (MyOpenMath-shaped).
 */
export function createTestSiteProfile(): SiteGuideJSON {
  return {
    site: 'TestSite',
    baseUrl: 'https://test.example.com',
    role: 'instructor',
    urlPatterns: ['test.example.com'],
    selectors: {
      studentName: '.student-name',
      scoreInput: 'input.score',
      submitButton: 'button[type="submit"]',
    },
    navigation: {
      home: '/index.php',
      gradebook: '/gradebook.php',
    },
    workflows: [
      {
        name: 'Grade a question',
        steps: ['Open the question', 'Review student responses', 'Enter score', 'Save'],
      },
    ],
    gotchas: ['Always save before navigating away', 'Scores are auto-rounded to 2 decimals'],
  };
}

/**
 * Return sample SKILL.md formatted content for injection testing.
 */
export function createTestSkillContent(name: string = 'TestSkill'): string {
  return `--- SKILL: ${name} ---\nDo the task step by step.\n--- END SKILL ---`;
}

/**
 * Return a sample InteractiveElement array for DOM mock.
 */
export function createTestDomElements(): InteractiveElement[] {
  return [
    {
      index: 0,
      tag: 'button',
      id: 'submit-btn',
      text: 'Submit',
      disabled: false,
      visible: true,
      selector: 'button#submit-btn',
    },
    {
      index: 1,
      tag: 'input',
      type: 'text',
      id: 'name-input',
      placeholder: 'Enter your name',
      text: '',
      value: '',
      disabled: false,
      visible: true,
      selector: 'input#name-input',
    },
  ];
}
