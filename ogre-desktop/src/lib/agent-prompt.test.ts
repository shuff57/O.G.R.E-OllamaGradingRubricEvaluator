import { describe, test, expect } from 'vitest';
import { AGENT_SYSTEM_PROMPT } from './agent-prompt';

// ---------------------------------------------------------------------------
// Rule 11: Site Guide Priority
// ---------------------------------------------------------------------------

describe('AGENT_SYSTEM_PROMPT: site guide priority (Rule 11)', () => {
  test('contains SITE GUIDE keyword', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('SITE GUIDE');
  });

  test('instructs agent to consult SITE GUIDE first', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/ALWAYS consult the SITE GUIDE first/i);
  });

  test('instructs agent to match guide descriptions to DOM list selectors', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Match these descriptions to elements in the DOM element list/i);
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
// Rule 13: Selector Translation
// ---------------------------------------------------------------------------

describe('AGENT_SYSTEM_PROMPT: selector notation translation (Rule 13)', () => {
  test('contains SELECTOR TRANSLATION instruction', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('SELECTOR TRANSLATION');
  });

  test('explains role= notation is DESCRIPTIVE not literal CSS', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/DESCRIPTIVE, not literal CSS/i);
  });

  test('contains example of role= notation', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('role=link[name=');
  });

  test('instructs agent to find element in DOM list and use its CSS selector', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/find the matching element in the DOM element list/i);
  });
});
