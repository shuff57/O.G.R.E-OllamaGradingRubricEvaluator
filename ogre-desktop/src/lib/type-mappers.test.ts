// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  discoveryResultToSiteProfile,
  siteProfileToDiscoveryResult,
  selectorMapToSiteSelectors,
  siteSelectorsToSelectorMap,
} from './type-mappers';
import type { DiscoveryResult, SelectorMap } from './discover';
import type { SiteSelectors } from './batch-grader';
import type { ExtractionConfig, SiteProfileWithExtraction } from './site-profiles';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeDiscoveryResult(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    navigation: { mode: 'batch' },
    selectors: {
      studentName: '.student-name',
      scoreInput: '#score',
      feedbackBox: '#feedback',
      studentSection: '.student',
      feedbackHidden: null,
      questionRegion: null,
      fullCreditLink: null,
    },
    feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
    save: { buttonText: 'Save All' },
    confidence: 'high',
    ...overrides,
  };
}

const META = { name: 'Test Profile', urlPatterns: ['example.com/grade'] };

// ── discoveryResultToSiteProfile ─────────────────────────────────────────

describe('discoveryResultToSiteProfile', () => {
  it('1. produces correct id, name, urlPatterns, isBuiltIn=false', () => {
    const result = makeDiscoveryResult();
    const profile = discoveryResultToSiteProfile(result, undefined, META);

    expect(profile.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(profile.name).toBe('Test Profile');
    expect(profile.urlPatterns).toEqual(['example.com/grade']);
    expect(profile.isBuiltIn).toBe(false);
  });

  it('2. maps studentName and scoreInput correctly', () => {
    const result = makeDiscoveryResult();
    const profile = discoveryResultToSiteProfile(result, undefined, META);

    expect(profile.selectors.studentName).toBe('.student-name');
    expect(profile.selectors.scoreInput).toBe('#score');
  });

  it('3. feedbackType unknown → textarea in output profile', () => {
    const result = makeDiscoveryResult({
      feedback: { type: 'unknown', requiresHiddenSync: false, htmlWrap: false },
    });
    const profile = discoveryResultToSiteProfile(result, undefined, META);

    expect(profile.feedback.type).toBe('textarea');
  });

  it('4. fallbackText undefined → Save in output profile', () => {
    const result = makeDiscoveryResult({
      save: { buttonText: 'Submit' },
    });
    const profile = discoveryResultToSiteProfile(result, undefined, META);

    expect(profile.save.fallbackText).toBe('Save');
  });

  it('8. with ExtractionConfig → result is SiteProfileWithExtraction', () => {
    const extraction: ExtractionConfig = {
      responseMethod: 'selector',
      responseSelector: '.response',
      maxScoreMethod: 'selector',
      maxScoreSelector: '.max',
      maxScoreDefault: '10',
    };
    const result = makeDiscoveryResult();
    const profile = discoveryResultToSiteProfile(result, extraction, META);

    expect((profile as SiteProfileWithExtraction).extraction).toEqual(extraction);
  });

  it('9. without ExtractionConfig → extraction not present on result', () => {
    const result = makeDiscoveryResult();
    const profile = discoveryResultToSiteProfile(result, undefined, META);

    expect('extraction' in profile).toBe(false);
  });
});

// ── Round-trip ───────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('5. preserves studentName and scoreInput through round-trip', () => {
    const original = makeDiscoveryResult({
      selectors: {
        studentName: '.name-field',
        scoreInput: 'input.score',
        feedbackBox: null,
        studentSection: null,
        feedbackHidden: null,
        questionRegion: null,
        fullCreditLink: null,
      },
    });
    const profile = discoveryResultToSiteProfile(original, undefined, META);
    const roundTripped = siteProfileToDiscoveryResult(profile);

    expect(roundTripped.selectors.studentName).toBe('.name-field');
    expect(roundTripped.selectors.scoreInput).toBe('input.score');
  });
});

// ── selectorMapToSiteSelectors ──────────────────────────────────────────

describe('selectorMapToSiteSelectors', () => {
  it('6. maps optional undefined fields → null', () => {
    const map: SelectorMap = {
      studentName: '.name',
      scoreInput: '#score',
      // feedbackBox, studentSection, etc. are all undefined
    };
    const result = selectorMapToSiteSelectors(map);

    expect(result.studentSection).toBeNull();
    expect(result.feedbackBox).toBeNull();
    expect(result.feedbackHidden).toBeNull();
    expect(result.questionRegion).toBeNull();
    expect(result.fullCreditLink).toBeNull();
  });

  it('10. feedbackBox=null → feedbackBox=null in SiteSelectors', () => {
    const map: SelectorMap = {
      studentName: '.name',
      scoreInput: '#score',
      feedbackBox: null,
    };
    const result = selectorMapToSiteSelectors(map);

    expect(result.feedbackBox).toBeNull();
  });
});

// ── siteSelectorsToSelectorMap ──────────────────────────────────────────

describe('siteSelectorsToSelectorMap', () => {
  it('7. maps nullable fields correctly (null → empty string for required)', () => {
    const selectors: SiteSelectors = {
      studentSection: null,
      studentName: null,
      scoreInput: null,
      feedbackBox: '.fb',
      feedbackHidden: null,
      questionRegion: '.qr',
      fullCreditLink: null,
    };
    const result = siteSelectorsToSelectorMap(selectors);

    // null studentName/scoreInput → empty string (SelectorMap requires string)
    expect(result.studentName).toBe('');
    expect(result.scoreInput).toBe('');
    // non-null values preserved
    expect(result.feedbackBox).toBe('.fb');
    expect(result.questionRegion).toBe('.qr');
    // null optional → null (SelectorMap allows null)
    expect(result.studentSection).toBeNull();
    expect(result.fullCreditLink).toBeNull();
  });
});

// ── Additional edge cases ───────────────────────────────────────────────

describe('edge cases', () => {
  it('valid feedbackTypes pass through without coercion', () => {
    for (const type of ['tinymce-inline', 'tinymce-iframe', 'contenteditable', 'textarea'] as const) {
      const result = makeDiscoveryResult({
        feedback: { type, requiresHiddenSync: true, htmlWrap: true },
      });
      const profile = discoveryResultToSiteProfile(result, undefined, META);
      expect(profile.feedback.type).toBe(type);
    }
  });

  it('siteProfileToDiscoveryResult sets confidence to high', () => {
    const result = makeDiscoveryResult({ confidence: 'low' });
    const profile = discoveryResultToSiteProfile(result, undefined, META);
    const back = siteProfileToDiscoveryResult(profile);

    expect(back.confidence).toBe('high');
  });
});
