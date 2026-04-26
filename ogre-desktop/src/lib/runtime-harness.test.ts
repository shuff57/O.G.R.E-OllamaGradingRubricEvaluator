/**
 * runtime-harness.test.ts — Golden-snapshot + unit tests for the harness.
 *
 * Tests:
 *  1. Golden snapshot — agent mode (with URL, rubric, site guide, skill)
 *  2. Golden snapshot — discover mode
 *  3. Empty state — no URL, no profile, no rubric, no guide, no skill
 *  4. Tool filtering — agent has click + discover_page; discover lacks navigate + runJS + writeCodeMirror
 *  5. captureHarnessContext — returns activeProfileName: null when getEmbeddedUrl throws
 *  6. Determinism — buildHarness(ctx) === buildHarness(ctx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildHarness,
  captureHarnessContext,
  HARNESS_CAPABILITIES,
  type HarnessContext,
  type CaptureInputs,
} from './runtime-harness';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./browser', () => ({
  getEmbeddedUrl: vi.fn().mockResolvedValue('https://www.myopenmath.com/course/1'),
}));

vi.mock('./skills-api', () => ({
  getMatchingSkillsForUrl: vi.fn().mockResolvedValue([
    {
      id: 'bundled-mom',
      name: 'MyOpenMath',
      description: 'MOM site profile',
      content: '',
      source: 'site-profile',
      source_id: 'myopenmath.com',
      is_active: 1,
      url_pattern: 'myopenmath.com',
      learned_corrections: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ]),
  buildSiteContextInjection: vi.fn().mockResolvedValue('--- SITE GUIDE: MyOpenMath ---\n{"site":"myopenmath"}\n--- END SITE GUIDE ---'),
  buildSkillInjection: vi.fn().mockResolvedValue('--- SKILL: gb-sync ---\nSync gradebook.\n--- END SKILL ---'),
}));

vi.mock('./profile-precedence', () => ({
  selectBestProfile: vi.fn().mockImplementation((matches: unknown[]) => matches[0] ?? null),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function agentCtx(): HarnessContext {
  return {
    mode: 'agent',
    sessionGoal: 'Grade all students on the current assignment',
    currentUrl: 'https://www.myopenmath.com/course/1',
    activeProfileName: 'MyOpenMath',
    activeRubric: { name: 'Essay Rubric', maxScore: 10, criteriaCount: 3 },
    provider: 'Ollama',
    model: 'llama3.1:8b',
    stepCount: 0,
    maxSteps: 30,
    timeRemainingMs: 300000,
    lastActionKey: null,
    lastError: null,
    siteGuide: '--- SITE GUIDE: MyOpenMath ---\n{"site":"myopenmath"}\n--- END SITE GUIDE ---',
    installedSkill: '--- SKILL: gb-sync ---\nSync gradebook.\n--- END SKILL ---',
  };
}

function discoverCtx(): HarnessContext {
  return {
    mode: 'discover',
    sessionGoal: 'Discover the page structure for MyOpenMath grading',
    currentUrl: 'https://www.myopenmath.com/course/1',
    activeProfileName: 'MyOpenMath',
    activeRubric: null,
    provider: 'Ollama',
    model: 'llava:13b',
    stepCount: 1,
    maxSteps: 20,
    timeRemainingMs: 180000,
    lastActionKey: 'readText',
    lastError: null,
    siteGuide: '',
    installedSkill: '',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildHarness', () => {
  it('Test 1: golden snapshot — agent mode', () => {
    const output = buildHarness(agentCtx());
    expect(output).toMatchSnapshot();
  });

  it('Test 2: golden snapshot — discover mode', () => {
    const output = buildHarness(discoverCtx());
    expect(output).toMatchSnapshot();
  });

  it('Test 3: empty state renders without undefined or null leaking', () => {
    const emptyCtx: HarnessContext = {
      mode: 'agent',
      sessionGoal: 'test',
      currentUrl: '',
      activeProfileName: null,
      activeRubric: null,
      provider: null,
      model: null,
      stepCount: 0,
      maxSteps: 30,
      timeRemainingMs: 0,
      lastActionKey: null,
      lastError: null,
      siteGuide: '',
      installedSkill: '',
    };
    const output = buildHarness(emptyCtx);
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('[object Object]');
    // null should not appear as the literal string "null"
    expect(output).not.toMatch(/\bnull\b/);
    // Sentinel strings should appear instead
    expect(output).toContain('(no page loaded)');
    expect(output).toContain('(none — fall back to DOM + AX tree)');
    expect(output).toContain('(none)');
    expect(output).toContain('(no site guide matches this URL');
    expect(output).toContain('(no skill active)');
  });

  it('Test 4: tool filtering per mode', () => {
    const agentOutput = buildHarness(agentCtx());
    const discoverOutput = buildHarness(discoverCtx());

    // Agent has these tools
    expect(agentOutput).toContain('- click:');
    expect(agentOutput).toContain('- discover_page:');

    // Discover does NOT have navigate, runJS, writeCodeMirror — or any other
    // agent-mode tools. Discover is a conversational flow; the only action is done.
    expect(discoverOutput).not.toContain('- navigate:');
    expect(discoverOutput).not.toContain('- runJS:');
    expect(discoverOutput).not.toContain('- writeCodeMirror:');
    expect(discoverOutput).not.toContain('- readText:');
    expect(discoverOutput).not.toContain('- screenshot:');
    expect(discoverOutput).not.toContain('- test_profile:');
    expect(discoverOutput).not.toContain('- save_profile:');

    // Discover has only done — save/test are UI-driven, not AI-invoked.
    expect(discoverOutput).toContain('- done:');
  });

  it('Test 6: output is deterministic — same context produces identical string', () => {
    const ctx = agentCtx();
    expect(buildHarness(ctx)).toBe(buildHarness(ctx));
  });
});

describe('captureHarnessContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 5: returns activeProfileName null when getEmbeddedUrl throws', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    vi.mocked(getEmbeddedUrl).mockRejectedValueOnce(new Error('no browser'));

    const inputs: CaptureInputs = {
      mode: 'agent',
      sessionGoal: 'test goal',
      stepCount: 0,
      loopConfig: { maxSteps: 30, maxTimeMs: 300000 },
      startTime: Date.now(),
    };

    const ctx = await captureHarnessContext(inputs);

    expect(ctx.currentUrl).toBe('');
    expect(ctx.activeProfileName).toBeNull();
    expect(ctx.siteGuide).toBe('');
  });
});

describe('HARNESS_CAPABILITIES', () => {
  it('agent mode has exactly 16 allowed actions', () => {
    expect(HARNESS_CAPABILITIES.agent.allowedActions.size).toBe(16);
  });

  it('discover mode has exactly 1 allowed action (done)', () => {
    expect(HARNESS_CAPABILITIES.discover.allowedActions.size).toBe(1);
    expect(HARNESS_CAPABILITIES.discover.allowedActions.has('done')).toBe(true);
  });
});
