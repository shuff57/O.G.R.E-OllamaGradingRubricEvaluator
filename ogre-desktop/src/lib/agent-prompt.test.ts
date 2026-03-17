import { describe, test, expect } from 'vitest';
import * as agentPrompt from './agent-prompt';
import { AGENT_SYSTEM_PROMPT } from './agent-prompt';

// ---------------------------------------------------------------------------
// Rule 11: Site Guide Priority
// ---------------------------------------------------------------------------

describe('AGENT_SYSTEM_PROMPT: site guide priority (Rule 11)', () => {
  test('contains SITE GUIDE keyword', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('SITE GUIDE');
  });

  test('instructs agent to parse SITE GUIDE as JSON', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/parse it as structured JSON/i);
  });

  test('instructs agent to use selectors object for CSS selectors', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Use the "selectors" object for CSS selectors directly/i);
  });

  test('warns against inventing selectors', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Do NOT invent selectors/i);
  });
});

// ---------------------------------------------------------------------------
// Rule 12: Task Decomposition
// ---------------------------------------------------------------------------

describe('AGENT_SYSTEM_PROMPT: task decomposition (Rule 12)', () => {
  test('contains TASK DECOMPOSITION instruction', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('TASK DECOMPOSITION');
  });

  test('instructs agent to decompose multi-step tasks before acting', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/ALWAYS decompose the task before acting/i);
  });

  test('mentions outlining steps in reasoning field', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/reasoning field to outline numbered steps/i);
  });

  test('warns against clicking without a plan', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Never start clicking without a plan/i);
  });
});

// ---------------------------------------------------------------------------
// Dead Code Removal: parseAgentResponse
// ---------------------------------------------------------------------------

describe('agent-prompt exports', () => {
  test('does not export parseAgentResponse (dead code removed)', () => {
    expect((agentPrompt as Record<string, unknown>).parseAgentResponse).toBeUndefined();
  });
});

