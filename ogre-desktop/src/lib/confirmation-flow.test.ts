import { describe, it, expect } from 'vitest';
import {
  getRequiredSelectorKeys,
  createConfirmationFlow,
  type ConfirmationFlow,
  type ConfirmationStepState,
} from './confirmation-flow';
import type { SelectorMap, ValidationResults, NavigationMode } from './discover';

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
