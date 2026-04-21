import { describe, test, expect } from 'vitest';
import * as agentPrompt from './agent-prompt';
import { buildHarness } from './runtime-harness';
import type { HarnessContext } from './runtime-harness';

// Minimal agent-mode fixture: empty URL/guide/skill to keep output deterministic.
const agentCtx: HarnessContext = {
  mode: 'agent',
  sessionGoal: 'test',
  currentUrl: '',
  activeProfileName: null,
  activeRubric: null,
  provider: null,
  model: null,
  stepCount: 0,
  maxSteps: 30,
  timeRemainingMs: 300000,
  lastActionKey: null,
  lastError: null,
  siteGuide: '',
  installedSkill: '',
};

// ---------------------------------------------------------------------------
// Rule 11: Site Guide Priority (migrated from agent-prompt.test.ts)
// ---------------------------------------------------------------------------

describe('buildHarness(agent): site guide priority rule', () => {
  test('contains SITE GUIDE keyword', () => {
    expect(buildHarness(agentCtx)).toContain('SITE GUIDE');
  });

  test('instructs agent to parse SITE GUIDE as JSON', () => {
    expect(buildHarness(agentCtx)).toMatch(/parse it as structured JSON/i);
  });

  test('instructs agent to use selectors object for CSS selectors', () => {
    expect(buildHarness(agentCtx)).toMatch(/Use the "selectors" object for selectors directly/i);
  });

  test('warns against inventing selectors', () => {
    expect(buildHarness(agentCtx)).toMatch(/Do NOT invent selectors/i);
  });
});

// ---------------------------------------------------------------------------
// Rule 12: Task Decomposition (migrated from agent-prompt.test.ts)
// ---------------------------------------------------------------------------

describe('buildHarness(agent): task decomposition rule', () => {
  test('contains TASK DECOMPOSITION instruction', () => {
    expect(buildHarness(agentCtx)).toContain('TASK DECOMPOSITION');
  });

  test('instructs agent to decompose multi-step tasks before acting', () => {
    expect(buildHarness(agentCtx)).toMatch(/ALWAYS decompose the task before acting/i);
  });

  test('mentions outlining steps in reasoning field', () => {
    expect(buildHarness(agentCtx)).toMatch(/reasoning field to outline numbered steps/i);
  });

  test('warns against clicking without a plan', () => {
    expect(buildHarness(agentCtx)).toMatch(/Never start clicking without a plan/i);
  });
});

// ---------------------------------------------------------------------------
// Dead Code Removal: parseAgentResponse and AGENT_SYSTEM_PROMPT no longer exported
// ---------------------------------------------------------------------------

describe('agent-prompt exports', () => {
  test('does not export parseAgentResponse (dead code removed)', () => {
    expect((agentPrompt as Record<string, unknown>).parseAgentResponse).toBeUndefined();
  });

  test('does not export AGENT_SYSTEM_PROMPT (subsumed by harness)', () => {
    expect((agentPrompt as Record<string, unknown>).AGENT_SYSTEM_PROMPT).toBeUndefined();
  });
});
