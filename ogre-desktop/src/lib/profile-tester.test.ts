// @vitest-environment node
import { describe, it, expect } from 'vitest';
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
// Stub function behaviour (throws 'not implemented')
// ============================================================================

describe('testSelectorDepth (stub)', () => {
  it.todo('resolves with SelectorTestResult[] when a real page is available');

  it('throws "not implemented" immediately', async () => {
    await expect(testSelectorDepth({} as never, 'https://example.com')).rejects.toThrow(
      'not implemented'
    );
  });
});

describe('testExtraction (stub)', () => {
  it.todo('resolves with ExtractionTestResult when a real page is available');

  it('throws "not implemented" immediately', async () => {
    await expect(testExtraction({} as never, 'https://example.com')).rejects.toThrow(
      'not implemented'
    );
  });
});

describe('testProfile (stub)', () => {
  it.todo('resolves with ProfileTestReport when a real page is available');

  it('throws "not implemented" immediately', async () => {
    await expect(testProfile({} as never, 'https://example.com')).rejects.toThrow(
      'not implemented'
    );
  });
});
