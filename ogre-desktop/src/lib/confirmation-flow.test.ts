import { describe, it, expect } from 'vitest';
import {
  getRequiredSelectorKeys,
  createConfirmationFlow,
  type ConfirmationFlow,
  type ConfirmationStepState,
} from './confirmation-flow';
import type { SelectorMap, ValidationResults, NavigationMode } from './discover';
import { findProfilesByUrl } from './site-profiles';

// ── Test Fixtures ───────────────────────────────────────────────────────────

function makeSelectorMap(overrides: Partial<SelectorMap> = {}): SelectorMap {
  return {
    studentSection: '.student-section',
    studentName: '.student-name',
    scoreInput: '.score-input',
    feedbackBox: '.feedback-box',
    ...overrides,
  };
}

function makeValidation(selectors: SelectorMap): ValidationResults {
  const results: ValidationResults = {};
  for (const [key, value] of Object.entries(selectors)) {
    if (value != null) {
      results[key] = {
        matchCount: 5,
        sampleText: `Sample for ${key}`,
        valid: true,
      };
    } else {
      results[key] = {
        matchCount: 0,
        sampleText: '',
        valid: false,
        skipped: true,
      };
    }
  }
  return results;
}

// ── getRequiredSelectorKeys ─────────────────────────────────────────────────

describe('getRequiredSelectorKeys', () => {
  it('returns studentSection, studentName, scoreInput for batch mode', () => {
    const keys = getRequiredSelectorKeys('batch');
    expect(keys).toEqual(['studentSection', 'studentName', 'scoreInput']);
  });

  it('returns studentName, scoreInput for sequential mode', () => {
    const keys = getRequiredSelectorKeys('sequential');
    expect(keys).toEqual(['studentName', 'scoreInput']);
  });
});

// ── createConfirmationFlow ──────────────────────────────────────────────────

describe('createConfirmationFlow', () => {
  let selectors: SelectorMap;
  let validation: ValidationResults;

  function createBatchFlow(): ConfirmationFlow {
    return createConfirmationFlow(selectors, validation, 'batch');
  }

  function createSequentialFlow(): ConfirmationFlow {
    return createConfirmationFlow(selectors, validation, 'sequential');
  }

  beforeEach(() => {
    selectors = makeSelectorMap();
    validation = makeValidation(selectors);
  });

  // ── Initialization ──────────────────────────────────────────────────────

  it('initializes with phase "confirming" and first step', () => {
    const flow = createBatchFlow();
    expect(flow.phase).toBe('confirming');

    const state = flow.getState();
    expect(state).not.toBeNull();
    expect(state!.key).toBe('studentSection');
    expect(state!.selector).toBe('.student-section');
    expect(state!.stepIndex).toBe(0);
    expect(state!.totalSteps).toBe(3);
    expect(state!.matchCount).toBe(5);
    expect(state!.sampleText).toBe('Sample for studentSection');
  });

  // ── accept() ────────────────────────────────────────────────────────────

  it('accept() advances to next step and stores confirmed selector', () => {
    const flow = createBatchFlow();
    flow.accept();

    expect(flow.phase).toBe('confirming');
    const state = flow.getState();
    expect(state).not.toBeNull();
    expect(state!.key).toBe('studentName');
    expect(state!.stepIndex).toBe(1);

    // First selector should be confirmed
    const confirmed = flow.getConfirmedSelectors();
    expect(confirmed.studentSection).toBe('.student-section');
  });

  it('accept() on last step sets phase to "complete"', () => {
    const flow = createBatchFlow();
    flow.accept(); // step 0 → 1
    flow.accept(); // step 1 → 2
    flow.accept(); // step 2 → complete

    expect(flow.phase).toBe('complete');
  });

  // ── refine() ────────────────────────────────────────────────────────────

  it('refine(newSelector) replaces selector for current step and advances', () => {
    const flow = createBatchFlow();
    flow.refine('.refined-section');

    expect(flow.phase).toBe('confirming');
    const state = flow.getState();
    expect(state!.key).toBe('studentName');
    expect(state!.stepIndex).toBe(1);

    const confirmed = flow.getConfirmedSelectors();
    expect(confirmed.studentSection).toBe('.refined-section');
  });

  // ── cancel() ────────────────────────────────────────────────────────────

  it('cancel() sets phase to "cancelled"', () => {
    const flow = createBatchFlow();
    flow.cancel();

    expect(flow.phase).toBe('cancelled');
  });

  // ── back() ──────────────────────────────────────────────────────────────

  it('back() returns to previous step', () => {
    const flow = createBatchFlow();
    flow.accept(); // step 0 → 1
    expect(flow.getState()!.stepIndex).toBe(1);

    flow.back();
    expect(flow.getState()!.stepIndex).toBe(0);
    expect(flow.getState()!.key).toBe('studentSection');
  });

  it('back() on first step does nothing (stays at step 0)', () => {
    const flow = createBatchFlow();
    expect(flow.getState()!.stepIndex).toBe(0);

    flow.back();
    expect(flow.getState()!.stepIndex).toBe(0);
    expect(flow.getState()!.key).toBe('studentSection');
  });

  // ── getState() ──────────────────────────────────────────────────────────

  it('getState() returns null when phase is "complete"', () => {
    const flow = createBatchFlow();
    flow.accept();
    flow.accept();
    flow.accept();

    expect(flow.phase).toBe('complete');
    expect(flow.getState()).toBeNull();
  });

  it('getState() returns null when phase is "cancelled"', () => {
    const flow = createBatchFlow();
    flow.cancel();

    expect(flow.phase).toBe('cancelled');
    expect(flow.getState()).toBeNull();
  });

  // ── getConfirmedSelectors() ─────────────────────────────────────────────

  it('getConfirmedSelectors() returns map of confirmed selectors after completion', () => {
    const flow = createBatchFlow();
    flow.accept(); // studentSection
    flow.accept(); // studentName
    flow.accept(); // scoreInput

    const confirmed = flow.getConfirmedSelectors();
    expect(confirmed).toEqual({
      studentSection: '.student-section',
      studentName: '.student-name',
      scoreInput: '.score-input',
    });
  });

  // ── Null selector handling ──────────────────────────────────────────────

  it('optional selector with null value does NOT appear in required steps', () => {
    selectors = makeSelectorMap({ feedbackBox: null });
    validation = makeValidation(selectors);

    const flow = createBatchFlow();
    // feedbackBox is optional, never in required keys anyway
    // batch mode has 3 steps: studentSection, studentName, scoreInput
    expect(flow.getState()!.totalSteps).toBe(3);

    // Walk through all steps — none should be feedbackBox
    const seenKeys: string[] = [];
    while (flow.phase === 'confirming') {
      const state = flow.getState();
      if (state) seenKeys.push(state.key);
      flow.accept();
    }

    expect(seenKeys).toEqual(['studentSection', 'studentName', 'scoreInput']);
    expect(seenKeys).not.toContain('feedbackBox');
  });

  it('batch mode with null studentSection skips it from steps', () => {
    selectors = makeSelectorMap({ studentSection: null });
    validation = makeValidation(selectors);

    const flow = createBatchFlow();
    // studentSection is null, so it should be skipped
    // Only studentName and scoreInput remain
    expect(flow.getState()!.totalSteps).toBe(2);
    expect(flow.getState()!.key).toBe('studentName');
  });

  // ── Invalid transitions ─────────────────────────────────────────────────

  it('accept() when complete is a no-op', () => {
    const flow = createBatchFlow();
    flow.accept();
    flow.accept();
    flow.accept();
    expect(flow.phase).toBe('complete');

    // Should not throw or change state
    flow.accept();
    expect(flow.phase).toBe('complete');
    expect(flow.getState()).toBeNull();
  });

  it('refine() when cancelled is a no-op', () => {
    const flow = createBatchFlow();
    flow.cancel();
    expect(flow.phase).toBe('cancelled');

    flow.refine('.new-selector');
    expect(flow.phase).toBe('cancelled');
  });

  // ── Full happy path ─────────────────────────────────────────────────────

  it('full batch mode happy path: 3 steps, accept all, phase becomes complete', () => {
    const flow = createBatchFlow();

    // Step 0: studentSection
    expect(flow.phase).toBe('confirming');
    let state = flow.getState();
    expect(state!.key).toBe('studentSection');
    expect(state!.stepIndex).toBe(0);
    expect(state!.totalSteps).toBe(3);
    flow.accept();

    // Step 1: studentName
    state = flow.getState();
    expect(state!.key).toBe('studentName');
    expect(state!.stepIndex).toBe(1);
    flow.accept();

    // Step 2: scoreInput
    state = flow.getState();
    expect(state!.key).toBe('scoreInput');
    expect(state!.stepIndex).toBe(2);
    flow.accept();

    // Complete
    expect(flow.phase).toBe('complete');
    expect(flow.getState()).toBeNull();

    const confirmed = flow.getConfirmedSelectors();
    expect(confirmed).toEqual({
      studentSection: '.student-section',
      studentName: '.student-name',
      scoreInput: '.score-input',
    });
  });

  it('full sequential mode happy path: 2 steps, mix accept and refine', () => {
    const flow = createSequentialFlow();

    // Step 0: studentName
    expect(flow.phase).toBe('confirming');
    let state = flow.getState();
    expect(state!.key).toBe('studentName');
    expect(state!.totalSteps).toBe(2);
    flow.accept();

    // Step 1: scoreInput — refine it
    state = flow.getState();
    expect(state!.key).toBe('scoreInput');
    flow.refine('.better-score-input');

    // Complete
    expect(flow.phase).toBe('complete');
    const confirmed = flow.getConfirmedSelectors();
    expect(confirmed).toEqual({
      studentName: '.student-name',
      scoreInput: '.better-score-input',
    });
  });
});

// ── URL Pattern Round-Trip ─────────────────────────────────────────────────
// Mock the db module so site-profiles.ts can be imported without Tauri runtime.
// vi.mock is hoisted by Vitest — this runs before any imports.
vi.mock('./db', () => ({
  getSiteProfiles: vi.fn().mockResolvedValue([]),
  getSiteProfile: vi.fn().mockResolvedValue(null),
  saveSiteProfile: vi.fn().mockResolvedValue(undefined),
  deleteSiteProfile: vi.fn().mockResolvedValue(undefined),
}));

describe('URL pattern round-trip (findProfilesByUrl)', () => {
  it('hostname+pathname pattern generated by DiscoveryPanel matches the original URL', () => {
    // Simulate DiscoveryPanel's URL pattern generation (lines 316-322):
    //   const u = new URL(currentUrl);
    //   urlPattern = u.hostname + u.pathname;
    const originalUrl = 'https://www.myopenmath.com/assess2/gradeallq2.php?cid=12345&qid=67890';
    const u = new URL(originalUrl);
    const urlPattern = u.hostname + u.pathname;

    const mockProfile = {
      id: 'discovered-1',
      name: 'Discovered Profile',
      isBuiltIn: false,
      urlPatterns: [urlPattern],
      selectors: {
        studentSection: '.student',
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: null,
      },
      navigation: { mode: 'batch' as const },
      feedback: { type: 'textarea' as const, requiresHiddenSync: false, htmlWrap: false },
      save: { buttonText: 'Save', fallbackText: 'Save' },
    };

    // findProfilesByUrl uses url.includes(pattern) — should match
    const matches = findProfilesByUrl(originalUrl, [mockProfile]);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('discovered-1');
  });

  it('pattern matches URL variants with different query params', () => {
    const originalUrl = 'https://example.com/grade/page?student=42';
    const u = new URL(originalUrl);
    const urlPattern = u.hostname + u.pathname;

    const mockProfile = {
      id: 'discovered-2',
      name: 'Test',
      isBuiltIn: false,
      urlPatterns: [urlPattern],
      selectors: {
        studentSection: null,
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: null,
      },
      navigation: { mode: 'batch' as const },
      feedback: { type: 'textarea' as const, requiresHiddenSync: false, htmlWrap: false },
      save: { buttonText: 'Save', fallbackText: 'Save' },
    };

    // Same base URL, different query params — should still match
    const variantUrl = 'https://example.com/grade/page?student=99&attempt=2';
    const matches = findProfilesByUrl(variantUrl, [mockProfile]);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('discovered-2');
  });

  it('pattern does NOT match unrelated URLs', () => {
    const originalUrl = 'https://www.myopenmath.com/assess2/gradeallq2.php';
    const u = new URL(originalUrl);
    const urlPattern = u.hostname + u.pathname;

    const mockProfile = {
      id: 'discovered-3',
      name: 'MOM Profile',
      isBuiltIn: false,
      urlPatterns: [urlPattern],
      selectors: {
        studentSection: null,
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: null,
      },
      navigation: { mode: 'batch' as const },
      feedback: { type: 'textarea' as const, requiresHiddenSync: false, htmlWrap: false },
      save: { buttonText: 'Save', fallbackText: 'Save' },
    };

    const unrelatedUrl = 'https://canvas.instructure.com/speedgrader';
    const matches = findProfilesByUrl(unrelatedUrl, [mockProfile]);
    expect(matches).toHaveLength(0);
  });
});
