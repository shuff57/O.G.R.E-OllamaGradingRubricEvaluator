import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';

// Mock browser and element-picker before imports
vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
}));

vi.mock('./element-picker', () => ({
  startElementPicker: vi.fn(),
  stopElementPicker: vi.fn(),
}));

import {
  refineSelector,
  clearRefinementHighlights,
  mergeSelectorSources,
  identifyAmbiguousSelectors,
  refineDiscoverySelector,
  applyRefinement,
  batchRefineSelectors,
  getSelectorValue,
  setSelectorValue,
  type RefinementRequest,
  type RefinementResult,
  type OnPickerSelectCallback,
  type DiscoveryRefinementOptions,
  type SelectorKey,
} from './discovery-picker-integration';
import { evalScript } from './browser';
import { startElementPicker, stopElementPicker } from './element-picker';
import type { ElementPickerResult } from './element-picker';
import type {
  DiscoveryResult,
  SelectorMap,
  SelectorValidation,
  ValidationResults,
} from './discover';

const mockedEvalScript = evalScript as MockedFunction<typeof evalScript>;
const mockedStartPicker = startElementPicker as MockedFunction<typeof startElementPicker>;

// ── Test Fixtures ───────────────────────────────────────────────────────────

function makePickerResult(overrides: Partial<ElementPickerResult> = {}): ElementPickerResult {
  return {
    selector: '.picked-element',
    tagName: 'div',
    rect: { x: 10, y: 20, width: 100, height: 50, top: 20, left: 10, bottom: 70, right: 110 } as DOMRect,
    ...overrides,
  };
}

function makeDiscovery(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    navigation: {
      mode: 'batch',
      nextButton: null,
      prevButton: null,
      studentIndicator: null,
      submitButton: null,
      waitForSelector: null,
    },
    selectors: {
      studentSection: '.student-row',
      studentName: '.name',
      scoreInput: "input[name='score']",
      feedbackBox: 'textarea.feedback',
      feedbackHidden: null,
      questionRegion: null,
      fullCreditLink: null,
    },
    feedback: {
      type: 'textarea',
      requiresHiddenSync: false,
      htmlWrap: false,
    },
    save: {
      buttonText: 'Save',
      fallbackText: 'Submit',
    },
    confidence: 'high',
    notes: 'Test discovery result',
    ...overrides,
  };
}

function makeValidation(overrides: Record<string, Partial<SelectorValidation>> = {}): ValidationResults {
  const base: ValidationResults = {
    studentSection: { matchCount: 10, sampleText: 'Student 1', valid: true },
    studentName: { matchCount: 10, sampleText: 'Alice', valid: true },
    scoreInput: { matchCount: 10, sampleText: '', valid: true },
    feedbackBox: { matchCount: 10, sampleText: '', valid: true },
  };
  for (const [key, val] of Object.entries(overrides)) {
    base[key] = { ...base[key], ...val };
  }
  return base;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('discovery-picker-integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEvalScript.mockResolvedValue('');
  });

  // ── refineSelector ──────────────────────────────────────────────────────

  describe('refineSelector', () => {
    it('should highlight matching elements then start picker', async () => {
      const pickerResult = makePickerResult({ selector: '#refined' });
      mockedStartPicker.mockResolvedValue(pickerResult);

      const result = await refineSelector('.ambiguous-selector');

      // Should have called evalScript to highlight matches
      expect(mockedEvalScript).toHaveBeenCalledTimes(2); // highlight + clear
      const highlightCall = mockedEvalScript.mock.calls[0][0];
      expect(highlightCall).toContain('.ambiguous-selector');
      expect(highlightCall).toContain('data-ogre-refine-highlight');

      // Should have started picker
      expect(mockedStartPicker).toHaveBeenCalledTimes(1);

      // Should return picker result
      expect(result.selector).toBe('#refined');
    });

    it('should skip highlighting if baseSelector is empty', async () => {
      const pickerResult = makePickerResult();
      mockedStartPicker.mockResolvedValue(pickerResult);

      await refineSelector('');

      // Only clear call (no highlight call since selector was empty)
      expect(mockedEvalScript).toHaveBeenCalledTimes(1);
      const clearCall = mockedEvalScript.mock.calls[0][0];
      expect(clearCall).toContain('data-ogre-refine-highlight');
    });

    it('should clear highlights after successful selection', async () => {
      mockedStartPicker.mockResolvedValue(makePickerResult());

      await refineSelector('.some-selector');

      // Last evalScript call should be the clear
      const lastCall = mockedEvalScript.mock.calls[mockedEvalScript.mock.calls.length - 1][0];
      expect(lastCall).toContain('removeAttribute');
    });

    it('should clear highlights on picker cancel', async () => {
      mockedStartPicker.mockRejectedValue(new Error('Element picker cancelled'));

      await expect(refineSelector('.some-selector')).rejects.toThrow('cancelled');

      // Should still clear highlights
      const lastCall = mockedEvalScript.mock.calls[mockedEvalScript.mock.calls.length - 1][0];
      expect(lastCall).toContain('removeAttribute');
    });

    it('should clear highlights on picker timeout', async () => {
      mockedStartPicker.mockRejectedValue(new Error('Element picker timed out'));

      await expect(refineSelector('.some-selector')).rejects.toThrow('timed out');

      // Should still clear highlights
      expect(mockedEvalScript).toHaveBeenCalledTimes(2); // highlight + clear
    });
  });

  // ── clearRefinementHighlights ───────────────────────────────────────────

  describe('clearRefinementHighlights', () => {
    it('should inject cleanup script', async () => {
      await clearRefinementHighlights();

      expect(mockedEvalScript).toHaveBeenCalledTimes(1);
      const script = mockedEvalScript.mock.calls[0][0];
      expect(script).toContain('data-ogre-refine-highlight');
      expect(script).toContain('removeAttribute');
    });
  });

  // ── mergeSelectorSources ────────────────────────────────────────────────

  describe('mergeSelectorSources', () => {
    it('should prefer picker ID selector over AI suggestion', () => {
      const picker = makePickerResult({ selector: '#unique-id', id: 'unique-id' });
      const result = mergeSelectorSources('.some-class', picker);
      expect(result).toBe('#unique-id');
    });

    it('should use picker selector when AI selector is empty', () => {
      const picker = makePickerResult({ selector: '.picker-found' });
      const result = mergeSelectorSources('', picker);
      expect(result).toBe('.picker-found');
    });

    it('should use picker selector when AI selector is whitespace', () => {
      const picker = makePickerResult({ selector: '.picker-found' });
      const result = mergeSelectorSources('   ', picker);
      expect(result).toBe('.picker-found');
    });

    it('should prefer AI selector when picker gives tag-only fallback', () => {
      const picker = makePickerResult({ selector: 'div' });
      const result = mergeSelectorSources('div.specific-class[data-role="test"]', picker);
      expect(result).toBe('div.specific-class[data-role="test"]');
    });

    it('should use picker selector by default (user chose it)', () => {
      const picker = makePickerResult({ selector: '.user-picked' });
      const result = mergeSelectorSources('.ai-suggested', picker);
      expect(result).toBe('.user-picked');
    });

    it('should handle picker with ID but selector not starting with #', () => {
      const picker = makePickerResult({ selector: 'div.special', id: 'my-id' });
      // ID present but selector doesn't start with # — fall through to default
      const result = mergeSelectorSources('.ai-selector', picker);
      expect(result).toBe('div.special');
    });
  });

  // ── identifyAmbiguousSelectors ──────────────────────────────────────────

  describe('identifyAmbiguousSelectors', () => {
    it('should flag selectors with zero matches', () => {
      const discovery = makeDiscovery();
      const validation = makeValidation({
        studentName: { matchCount: 0, valid: false },
      });

      const requests = identifyAmbiguousSelectors(discovery, validation);
      expect(requests).toHaveLength(1);
      expect(requests[0].selectorKey).toBe('studentName');
      expect(requests[0].reason).toBe('no-match');
    });

    it('should flag selectors exceeding threshold', () => {
      const discovery = makeDiscovery();
      const validation = makeValidation({
        scoreInput: { matchCount: 200, valid: true },
      });

      const requests = identifyAmbiguousSelectors(discovery, validation, 50);
      expect(requests).toHaveLength(1);
      expect(requests[0].selectorKey).toBe('scoreInput');
      expect(requests[0].reason).toBe('too-many-matches');
    });

    it('should flag invalid selectors when confidence is not high', () => {
      const discovery = makeDiscovery({ confidence: 'medium' });
      const validation = makeValidation({
        feedbackBox: { matchCount: 5, valid: false },
      });

      const requests = identifyAmbiguousSelectors(discovery, validation);
      expect(requests.some(r => r.selectorKey === 'feedbackBox')).toBe(true);
      expect(requests.find(r => r.selectorKey === 'feedbackBox')?.reason).toBe('ambiguous');
    });

    it('should NOT flag invalid selectors when confidence is high', () => {
      const discovery = makeDiscovery({ confidence: 'high' });
      const validation = makeValidation({
        feedbackBox: { matchCount: 5, valid: false },
      });

      const requests = identifyAmbiguousSelectors(discovery, validation);
      // feedbackBox has valid:false but confidence is high, so no flag
      expect(requests.filter(r => r.selectorKey === 'feedbackBox')).toHaveLength(0);
    });

    it('should skip skipped selectors', () => {
      const discovery = makeDiscovery();
      const validation = makeValidation({
        feedbackHidden: { matchCount: 0, valid: false, skipped: true },
      });

      const requests = identifyAmbiguousSelectors(discovery, validation);
      expect(requests.filter(r => r.selectorKey === 'feedbackHidden')).toHaveLength(0);
    });

    it('should return empty for fully valid results', () => {
      const discovery = makeDiscovery();
      const validation = makeValidation();

      const requests = identifyAmbiguousSelectors(discovery, validation);
      expect(requests).toHaveLength(0);
    });

    it('should use custom threshold', () => {
      const discovery = makeDiscovery();
      const validation = makeValidation({
        studentSection: { matchCount: 30, valid: true },
      });

      // Default threshold (50): not flagged
      const requests50 = identifyAmbiguousSelectors(discovery, validation, 50);
      expect(requests50.filter(r => r.selectorKey === 'studentSection')).toHaveLength(0);

      // Custom threshold (20): flagged
      const requests20 = identifyAmbiguousSelectors(discovery, validation, 20);
      expect(requests20.filter(r => r.selectorKey === 'studentSection')).toHaveLength(1);
    });

    it('should include validation data in requests', () => {
      const discovery = makeDiscovery();
      const validation = makeValidation({
        studentName: { matchCount: 0, valid: false, sampleText: '' },
      });

      const requests = identifyAmbiguousSelectors(discovery, validation);
      expect(requests[0].validation).toBeDefined();
      expect(requests[0].validation?.matchCount).toBe(0);
    });
  });

  // ── refineDiscoverySelector ─────────────────────────────────────────────

  describe('refineDiscoverySelector', () => {
    it('should orchestrate refinement flow and return result', async () => {
      const pickerResult = makePickerResult({ selector: '#refined-input', id: 'refined-input' });
      mockedStartPicker.mockResolvedValue(pickerResult);

      const request: RefinementRequest = {
        selectorKey: 'scoreInput',
        currentSelector: 'input.ambiguous',
        reason: 'too-many-matches',
      };

      const result = await refineDiscoverySelector(request);

      expect(result.selectorKey).toBe('scoreInput');
      expect(result.originalSelector).toBe('input.ambiguous');
      expect(result.refinedSelector).toBe('#refined-input');
      expect(result.source).toBe('picker');
      expect(result.pickerResult).toBe(pickerResult);
    });

    it('should invoke onPickerSelect callback', async () => {
      const pickerResult = makePickerResult({ selector: '.refined' });
      mockedStartPicker.mockResolvedValue(pickerResult);

      const callback = vi.fn();
      const options: DiscoveryRefinementOptions = { onPickerSelect: callback };

      const request: RefinementRequest = {
        selectorKey: 'studentName',
        currentSelector: '.old-name',
        reason: 'user-requested',
      };

      await refineDiscoverySelector(request, options);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].selectorKey).toBe('studentName');
      expect(callback.mock.calls[0][0].refinedSelector).toBe('.refined');
    });

    it('should set source to "original" when merger keeps AI selector', async () => {
      // Picker returns tag-only fallback, merger keeps AI selector
      const pickerResult = makePickerResult({ selector: 'input' });
      mockedStartPicker.mockResolvedValue(pickerResult);

      const request: RefinementRequest = {
        selectorKey: 'scoreInput',
        currentSelector: 'input[name="score"][type="number"]',
        reason: 'user-requested',
      };

      const result = await refineDiscoverySelector(request);

      expect(result.source).toBe('original');
      expect(result.refinedSelector).toBe('input[name="score"][type="number"]');
    });

    it('should propagate picker cancellation error', async () => {
      mockedStartPicker.mockRejectedValue(new Error('Element picker cancelled'));

      const request: RefinementRequest = {
        selectorKey: 'studentName',
        currentSelector: '.name',
        reason: 'user-requested',
      };

      await expect(refineDiscoverySelector(request)).rejects.toThrow('cancelled');
    });
  });

  // ── applyRefinement ─────────────────────────────────────────────────────

  describe('applyRefinement', () => {
    it('should return new discovery with updated selector', () => {
      const discovery = makeDiscovery();
      const refinement: RefinementResult = {
        selectorKey: 'studentName',
        originalSelector: '.name',
        refinedSelector: '#student-name',
        source: 'picker',
      };

      const updated = applyRefinement(discovery, refinement);

      expect(updated.selectors.studentName).toBe('#student-name');
      // Original should be unchanged
      expect(discovery.selectors.studentName).toBe('.name');
    });

    it('should append refinement note', () => {
      const discovery = makeDiscovery({ notes: 'Original note' });
      const refinement: RefinementResult = {
        selectorKey: 'scoreInput',
        originalSelector: 'input.old',
        refinedSelector: '#score',
        source: 'picker',
      };

      const updated = applyRefinement(discovery, refinement);

      expect(updated.notes).toContain('Original note');
      expect(updated.notes).toContain('[Refined]');
      expect(updated.notes).toContain('scoreInput');
      expect(updated.notes).toContain('input.old');
      expect(updated.notes).toContain('#score');
    });

    it('should not mutate original discovery', () => {
      const discovery = makeDiscovery();
      const originalName = discovery.selectors.studentName;
      const refinement: RefinementResult = {
        selectorKey: 'studentName',
        originalSelector: '.name',
        refinedSelector: '.refined-name',
        source: 'picker',
      };

      applyRefinement(discovery, refinement);

      expect(discovery.selectors.studentName).toBe(originalName);
    });

    it('should handle discovery with no initial notes', () => {
      const discovery = makeDiscovery({ notes: undefined });
      const refinement: RefinementResult = {
        selectorKey: 'studentName',
        originalSelector: '.name',
        refinedSelector: '.new-name',
        source: 'picker',
      };

      const updated = applyRefinement(discovery, refinement);
      expect(updated.notes).toContain('[Refined]');
      expect(updated.notes).not.toContain('undefined');
    });
  });

  // ── batchRefineSelectors ────────────────────────────────────────────────

  describe('batchRefineSelectors', () => {
    it('should refine multiple selectors in sequence', async () => {
      const pickerResults = [
        makePickerResult({ selector: '#name-refined', id: 'name-refined' }),
        makePickerResult({ selector: '#score-refined', id: 'score-refined' }),
      ];
      mockedStartPicker
        .mockResolvedValueOnce(pickerResults[0])
        .mockResolvedValueOnce(pickerResults[1]);

      const discovery = makeDiscovery();
      const requests: RefinementRequest[] = [
        { selectorKey: 'studentName', currentSelector: '.name', reason: 'no-match' },
        { selectorKey: 'scoreInput', currentSelector: 'input.score', reason: 'no-match' },
      ];

      const { discovery: updated, refinements } = await batchRefineSelectors(
        discovery,
        requests,
      );

      expect(refinements).toHaveLength(2);
      expect(updated.selectors.studentName).toBe('#name-refined');
      expect(updated.selectors.scoreInput).toBe('#score-refined');
    });

    it('should skip cancelled refinements and continue', async () => {
      mockedStartPicker
        .mockRejectedValueOnce(new Error('Element picker cancelled'))
        .mockResolvedValueOnce(makePickerResult({ selector: '#score-ok', id: 'score-ok' }));

      const discovery = makeDiscovery();
      const requests: RefinementRequest[] = [
        { selectorKey: 'studentName', currentSelector: '.name', reason: 'no-match' },
        { selectorKey: 'scoreInput', currentSelector: 'input.score', reason: 'no-match' },
      ];

      const { discovery: updated, refinements } = await batchRefineSelectors(
        discovery,
        requests,
      );

      // Only second refinement should succeed
      expect(refinements).toHaveLength(1);
      expect(refinements[0].selectorKey).toBe('scoreInput');
      expect(updated.selectors.studentName).toBe('.name'); // unchanged
      expect(updated.selectors.scoreInput).toBe('#score-ok');
    });

    it('should invoke callback for each successful refinement', async () => {
      mockedStartPicker.mockResolvedValue(
        makePickerResult({ selector: '.refined', id: undefined }),
      );

      const callback = vi.fn();
      const discovery = makeDiscovery();
      const requests: RefinementRequest[] = [
        { selectorKey: 'studentName', currentSelector: '.name', reason: 'no-match' },
      ];

      await batchRefineSelectors(discovery, requests, { onPickerSelect: callback });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should return empty refinements when all cancelled', async () => {
      mockedStartPicker.mockRejectedValue(new Error('Element picker cancelled'));

      const discovery = makeDiscovery();
      const requests: RefinementRequest[] = [
        { selectorKey: 'studentName', currentSelector: '.name', reason: 'no-match' },
      ];

      const { refinements } = await batchRefineSelectors(discovery, requests);
      expect(refinements).toHaveLength(0);
    });
  });

  // ── getSelectorValue / setSelectorValue ─────────────────────────────────

  describe('getSelectorValue', () => {
    it('should return selector value for valid key', () => {
      const selectors: SelectorMap = {
        studentName: '.name',
        scoreInput: 'input.score',
      };
      expect(getSelectorValue(selectors, 'studentName')).toBe('.name');
      expect(getSelectorValue(selectors, 'scoreInput')).toBe('input.score');
    });

    it('should return null for null selector', () => {
      const selectors: SelectorMap = {
        studentName: '.name',
        scoreInput: 'input.score',
        feedbackBox: null,
      };
      expect(getSelectorValue(selectors, 'feedbackBox')).toBeNull();
    });

    it('should return undefined for missing selector', () => {
      const selectors: SelectorMap = {
        studentName: '.name',
        scoreInput: 'input.score',
      };
      expect(getSelectorValue(selectors, 'fullCreditLink')).toBeUndefined();
    });
  });

  describe('setSelectorValue', () => {
    it('should update existing selector', () => {
      const selectors: SelectorMap = {
        studentName: '.old-name',
        scoreInput: 'input.score',
      };
      setSelectorValue(selectors, 'studentName', '.new-name');
      expect(selectors.studentName).toBe('.new-name');
    });

    it('should set previously null selector', () => {
      const selectors: SelectorMap = {
        studentName: '.name',
        scoreInput: 'input.score',
        feedbackBox: null,
      };
      setSelectorValue(selectors, 'feedbackBox', 'textarea.feedback');
      expect(selectors.feedbackBox).toBe('textarea.feedback');
    });
  });

  // ── Type interface tests ────────────────────────────────────────────────

  describe('RefinementRequest interface', () => {
    it('should have required fields', () => {
      const request: RefinementRequest = {
        selectorKey: 'studentName',
        currentSelector: '.name',
        reason: 'ambiguous',
      };
      expect(request.selectorKey).toBe('studentName');
      expect(request.currentSelector).toBe('.name');
      expect(request.reason).toBe('ambiguous');
    });

    it('should support all reason types', () => {
      const reasons: RefinementRequest['reason'][] = [
        'ambiguous',
        'no-match',
        'too-many-matches',
        'user-requested',
      ];
      expect(reasons).toHaveLength(4);
    });

    it('should support optional validation', () => {
      const request: RefinementRequest = {
        selectorKey: 'scoreInput',
        currentSelector: 'input',
        reason: 'too-many-matches',
        validation: { matchCount: 100, sampleText: '', valid: false },
      };
      expect(request.validation?.matchCount).toBe(100);
    });
  });

  describe('RefinementResult interface', () => {
    it('should have required fields', () => {
      const result: RefinementResult = {
        selectorKey: 'studentName',
        originalSelector: '.old',
        refinedSelector: '.new',
        source: 'picker',
      };
      expect(result.selectorKey).toBe('studentName');
      expect(result.source).toBe('picker');
    });

    it('should support all source types', () => {
      const sources: RefinementResult['source'][] = ['picker', 'merged', 'original'];
      expect(sources).toHaveLength(3);
    });

    it('should support optional pickerResult', () => {
      const result: RefinementResult = {
        selectorKey: 'studentName',
        originalSelector: '.old',
        refinedSelector: '.new',
        source: 'picker',
        pickerResult: makePickerResult(),
      };
      expect(result.pickerResult?.selector).toBe('.picked-element');
    });
  });

  describe('SelectorKey type', () => {
    it('should cover all SelectorMap keys', () => {
      const keys: SelectorKey[] = [
        'studentSection',
        'studentName',
        'scoreInput',
        'feedbackBox',
        'feedbackHidden',
        'questionRegion',
        'fullCreditLink',
      ];
      expect(keys).toHaveLength(7);
    });
  });
});
