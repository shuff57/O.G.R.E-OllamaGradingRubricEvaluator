// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the browser module before importing profile-tester
vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
}));

import {
  testSelectorDepth,
  testExtraction,
  testProfile,
  isSelectorTestResult,
  isProfileTestReport,
  type SelectorTestResult,
  type ExtractionTestResult,
  type ProfileTestReport,
} from './profile-tester';
import type { SiteProfile } from './batch-grader';
import type { ExtractionConfig, SiteProfileWithExtraction } from './site-profiles';

// ============================================================================
// Type Shape Tests (run green — no async needed)
// ============================================================================

describe('SelectorTestResult shape', () => {
  it('accepts a minimal valid result', () => {
    const r: SelectorTestResult = {
      selector: 'div.question',
      field: 'questionRegion',
      found: true,
      matchCount: 3,
    };
    expect(r.found).toBe(true);
    expect(r.matchCount).toBe(3);
  });

  it('accepts optional fields', () => {
    const r: SelectorTestResult = {
      selector: 'input.score',
      field: 'scoreInput',
      found: false,
      matchCount: 0,
      sampleText: undefined,
      error: 'Element not found',
    };
    expect(r.error).toBe('Element not found');
  });
});

describe('ExtractionTestResult shape', () => {
  it('accepts a successful result', () => {
    const r: ExtractionTestResult = {
      success: true,
      extractedResponse: 'x^2 + 1',
      extractedMaxScore: '10',
      responseMethod: 'selector',
      maxScoreMethod: 'parentTextRegex',
      messages: [],
    };
    expect(r.success).toBe(true);
    expect(r.responseMethod).toBe('selector');
    expect(r.maxScoreMethod).toBe('parentTextRegex');
  });

  it('accepts all valid responseMethod values', () => {
    const methods: ExtractionTestResult['responseMethod'][] = ['childIndex', 'iframe', 'selector'];
    for (const method of methods) {
      const r: ExtractionTestResult = {
        success: false,
        responseMethod: method,
        maxScoreMethod: 'inputLabel',
        messages: [],
      };
      expect(r.responseMethod).toBe(method);
    }
  });

  it('accepts all valid maxScoreMethod values', () => {
    const methods: ExtractionTestResult['maxScoreMethod'][] = [
      'parentTextRegex',
      'inputLabel',
      'selector',
    ];
    for (const method of methods) {
      const r: ExtractionTestResult = {
        success: false,
        responseMethod: 'childIndex',
        maxScoreMethod: method,
        messages: [],
      };
      expect(r.maxScoreMethod).toBe(method);
    }
  });
});

describe('ProfileTestReport shape', () => {
  const report: ProfileTestReport = {
    profileId: 'myopenmath-v1',
    profileName: 'MyOpenMath',
    testedAt: new Date().toISOString(),
    selectorResults: [],
    extractionResult: null,
    passed: false,
    selectorsFound: 0,
    selectorsMissing: 3,
  };

  it('accepts a valid report with null extractionResult', () => {
    expect(report.extractionResult).toBeNull();
    expect(report.passed).toBe(false);
  });

  it('accepts a report with extractionResult populated', () => {
    const full: ProfileTestReport = {
      ...report,
      extractionResult: {
        success: true,
        responseMethod: 'childIndex',
        maxScoreMethod: 'parentTextRegex',
        messages: ['OK'],
      },
    };
    expect(full.extractionResult?.success).toBe(true);
  });
});

// ============================================================================
// isSelectorTestResult
// ============================================================================

describe('isSelectorTestResult', () => {
  it('returns true for valid result', () => {
    expect(
      isSelectorTestResult({ selector: 'div', field: 'q', found: true, matchCount: 1 })
    ).toBe(true);
  });

  it('returns false for missing field', () => {
    expect(isSelectorTestResult({ selector: 'div', found: true, matchCount: 1 })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSelectorTestResult(null)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isSelectorTestResult('result')).toBe(false);
  });
});

// ============================================================================
// isProfileTestReport
// ============================================================================

describe('isProfileTestReport', () => {
  it('returns true for valid report', () => {
    expect(
      isProfileTestReport({
        profileId: 'p1',
        profileName: 'Test',
        testedAt: new Date().toISOString(),
        selectorResults: [],
        extractionResult: null,
        passed: true,
        selectorsFound: 0,
        selectorsMissing: 0,
      })
    ).toBe(true);
  });

  it('returns false for missing profileId', () => {
    expect(
      isProfileTestReport({
        profileName: 'Test',
        testedAt: new Date().toISOString(),
        selectorResults: [],
        extractionResult: null,
        passed: false,
        selectorsFound: 0,
        selectorsMissing: 0,
      })
    ).toBe(false);
  });

  it('returns false for null', () => {
    expect(isProfileTestReport(null)).toBe(false);
  });
});

// ============================================================================
// Mock helpers
// ============================================================================

function createMockProfile(overrides?: Partial<SiteProfile>): SiteProfile {
  return {
    id: 'test-profile',
    name: 'Test Profile',
    isBuiltIn: false,
    urlPatterns: ['example.com'],
    selectors: {
      studentSection: '.student-row',
      studentName: '.student-name',
      scoreInput: 'input.score',
      feedbackBox: 'textarea.feedback',
    },
    feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
    save: { buttonText: 'Save', fallbackText: 'Submit' },
    navigation: { mode: 'batch' },
    ...overrides,
  };
}

function createMockExtractionConfig(overrides?: Partial<ExtractionConfig>): ExtractionConfig {
  return {
    responseMethod: 'selector',
    responseSelector: '.student-response',
    maxScoreMethod: 'selector',
    maxScoreSelector: '.max-score',
    maxScoreDefault: '100',
    ...overrides,
  };
}

// ============================================================================
// testSelectorDepth
// ============================================================================

describe('testSelectorDepth', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns SelectorTestResult[] with correct found/missing data', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      studentSection: { selector: '.student-row', matchCount: 5, sampleText: 'John Doe', found: true },
      studentName: { selector: '.student-name', matchCount: 5, sampleText: 'Jane', found: true },
      scoreInput: { selector: 'input.score', matchCount: 5, sampleText: '85', found: true },
      feedbackBox: { selector: 'textarea.feedback', matchCount: 5, sampleText: '', found: true },
    });

    const profile = createMockProfile();
    const results = await testSelectorDepth(profile, 'https://example.com');

    expect(results).toHaveLength(4);
    expect(results.every(r => isSelectorTestResult(r))).toBe(true);

    const studentRow = results.find(r => r.field === 'studentSection');
    expect(studentRow?.found).toBe(true);
    expect(studentRow?.matchCount).toBe(5);
    expect(studentRow?.sampleText).toBe('John Doe');
    expect(studentRow?.selector).toBe('.student-row');
  });

  it('calls evalScriptJSON with a querySelectorAll validation script', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({});

    await testSelectorDepth(createMockProfile(), 'https://example.com');

    expect(evalScriptJSON).toHaveBeenCalledOnce();
    const script = vi.mocked(evalScriptJSON).mock.calls[0][0] as string;
    expect(script).toContain('querySelectorAll');
    expect(script).toContain('.student-row');
  });

  it('handles selectors with errors', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      studentSection: { selector: '!!!bad', matchCount: 0, sampleText: '', found: false, error: 'SyntaxError' },
    });

    const profile = createMockProfile({ selectors: { studentSection: '!!!bad', studentName: null, scoreInput: null, feedbackBox: null } });
    const results = await testSelectorDepth(profile, 'https://example.com');

    expect(results[0].found).toBe(false);
    expect(results[0].error).toBe('SyntaxError');
  });
});

// ============================================================================
// testExtraction
// ============================================================================

describe('testExtraction', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns successful ExtractionTestResult when response is found', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      response: 'x^2 + 1',
      maxScore: '10',
      messages: [],
    });

    const config = createMockExtractionConfig();
    const result = await testExtraction(config, 'https://example.com');

    expect(result.success).toBe(true);
    expect(result.extractedResponse).toBe('x^2 + 1');
    expect(result.extractedMaxScore).toBe('10');
    expect(result.responseMethod).toBe('selector');
    expect(result.maxScoreMethod).toBe('selector');
    expect(result.messages).toEqual([]);
  });

  it('returns unsuccessful result when no response is found', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      response: '',
      maxScore: '',
      messages: ['Response selector matched no elements: .missing'],
    });

    const config = createMockExtractionConfig({ responseSelector: '.missing' });
    const result = await testExtraction(config, 'https://example.com');

    expect(result.success).toBe(false);
    expect(result.extractedResponse).toBeUndefined();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('preserves responseMethod and maxScoreMethod in result', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      response: 'answer',
      maxScore: '5',
      messages: [],
    });

    const config = createMockExtractionConfig({
      responseMethod: 'iframe',
      iframeSelector: 'iframe.response',
      maxScoreMethod: 'parentTextRegex',
      maxScoreRegex: '\\/(\\d+)',
    });
    const result = await testExtraction(config, 'https://example.com');

    expect(result.responseMethod).toBe('iframe');
    expect(result.maxScoreMethod).toBe('parentTextRegex');
  });
});

// ============================================================================
// testProfile
// ============================================================================

describe('testProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a valid ProfileTestReport combining selector results', async () => {
    const { evalScriptJSON } = await import('./browser');
    // testSelectorDepth call
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      studentSection: { selector: '.student-row', matchCount: 3, sampleText: 'Alice', found: true },
      studentName: { selector: '.student-name', matchCount: 3, sampleText: 'Alice', found: true },
      scoreInput: { selector: 'input.score', matchCount: 3, sampleText: '', found: true },
      feedbackBox: { selector: 'textarea.feedback', matchCount: 3, sampleText: '', found: true },
    });

    const profile = createMockProfile();
    const report = await testProfile(profile, 'https://example.com');

    expect(isProfileTestReport(report)).toBe(true);
    expect(report.profileId).toBe('test-profile');
    expect(report.profileName).toBe('Test Profile');
    expect(report.selectorResults).toHaveLength(4);
    expect(report.selectorsFound).toBe(4);
    expect(report.selectorsMissing).toBe(0);
    expect(report.passed).toBe(true);
    expect(report.extractionResult).toBeNull();
    expect(report.testedAt).toBeTruthy();
  });

  it('includes extraction result when profile has ExtractionConfig', async () => {
    const { evalScriptJSON } = await import('./browser');
    // testSelectorDepth call
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      studentSection: { selector: '.student-row', matchCount: 1, sampleText: 'Bob', found: true },
    });
    // testExtraction call
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      response: 'student answer',
      maxScore: '10',
      messages: [],
    });

    const profile: SiteProfileWithExtraction = {
      ...createMockProfile(),
      extraction: createMockExtractionConfig(),
    };
    const report = await testProfile(profile, 'https://example.com');

    expect(report.extractionResult).not.toBeNull();
    expect(report.extractionResult?.success).toBe(true);
    expect(report.extractionResult?.extractedResponse).toBe('student answer');
    expect(report.passed).toBe(true);
  });

  it('marks report as failed when a configured selector is missing', async () => {
    const { evalScriptJSON } = await import('./browser');
    vi.mocked(evalScriptJSON).mockResolvedValueOnce({
      studentSection: { selector: '.student-row', matchCount: 0, sampleText: '', found: false },
      studentName: { selector: '.student-name', matchCount: 1, sampleText: 'X', found: true },
      scoreInput: { selector: 'input.score', matchCount: 0, sampleText: '', found: false },
      feedbackBox: { selector: 'textarea.feedback', matchCount: 1, sampleText: '', found: true },
    });

    const report = await testProfile(createMockProfile(), 'https://example.com');

    expect(report.passed).toBe(false);
    expect(report.selectorsMissing).toBe(2);
    expect(report.selectorsFound).toBe(2);
  });
});
