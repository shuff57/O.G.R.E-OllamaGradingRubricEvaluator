/**
 * profile-tester.ts - Deep DOM testing and extraction simulation
 *
 * Provides functions for testing a site profile against a live page:
 *   - Selector depth testing: verify each selector actually finds elements
 *   - Extraction simulation: run the ExtractionConfig logic and see what it returns
 *   - Full profile test: composite report combining both tests
 *
 * All DOM evaluation is performed via evalScriptJSON from browser.ts,
 * which runs JavaScript inside the Tauri webview via CDP Runtime.evaluate.
 */

import { evalScriptJSON } from './browser';
import type { SiteProfile } from './batch-grader';
import type { ExtractionConfig, SiteProfileWithExtraction } from './site-profiles';

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result for a single CSS selector test.
 */
export interface SelectorTestResult {
  /** The selector that was tested */
  selector: string;
  /** Which field this selector represents (e.g. 'questionRegion', 'scoreInput') */
  field: string;
  /** Whether the selector matched at least one element */
  found: boolean;
  /** Number of matching elements */
  matchCount: number;
  /** Sample of text content from the first match (≤ 100 chars) */
  sampleText?: string;
  /** Error message if the selector threw (invalid CSS, etc.) */
  error?: string;
}

/**
 * Result for an ExtractionConfig simulation run.
 */
export interface ExtractionTestResult {
  /** Whether extraction succeeded */
  success: boolean;
  /** Extracted student response (may be empty string) */
  extractedResponse?: string;
  /** Extracted max score value (may be undefined) */
  extractedMaxScore?: string;
  /** Which responseMethod was used */
  responseMethod: ExtractionConfig['responseMethod'];
  /** Which maxScoreMethod was used */
  maxScoreMethod: ExtractionConfig['maxScoreMethod'];
  /** Error or warning messages */
  messages: string[];
}

/**
 * Full profile test report combining selector + extraction results.
 */
export interface ProfileTestReport {
  /** Profile ID that was tested */
  profileId: string;
  /** Profile name for display */
  profileName: string;
  /** ISO 8601 timestamp of the test run */
  testedAt: string;
  /** Results for each selector in the profile */
  selectorResults: SelectorTestResult[];
  /** Extraction simulation result (null if no ExtractionConfig) */
  extractionResult: ExtractionTestResult | null;
  /** Overall pass/fail */
  passed: boolean;
  /** Count of selectors that found matches */
  selectorsFound: number;
  /** Count of selectors that found nothing */
  selectorsMissing: number;
}

// ============================================================================
// Implementations
// ============================================================================

/** Shape returned by the selector-test IIFE running in the webview. */
interface RawSelectorResult {
  selector: string;
  matchCount: number;
  sampleText: string;
  found: boolean;
  error?: string;
}

/** Shape returned by the extraction IIFE running in the webview. */
interface RawExtractionResult {
  response: string;
  maxScore: string;
  messages: string[];
}

/**
 * Test each CSS selector in a site profile against the currently loaded page.
 *
 * Uses CDP Runtime.evaluate to run querySelectorAll for each selector.
 * Returns a result per selector with match count and sample text.
 */
export async function testSelectorDepth(
  profile: SiteProfile,
  _pageUrl: string
): Promise<SelectorTestResult[]> {
  const selectorsJSON = JSON.stringify(profile.selectors);

  // IIFE script that tests every selector on the live page (same pattern as
  // discover.ts buildValidationScript). Returns a map keyed by field name.
  const script = `(function() {
    var sel = ${selectorsJSON};
    var results = {};
    for (var key in sel) {
      if (!sel.hasOwnProperty(key)) continue;
      var cssSelector = sel[key];
      if (!cssSelector) {
        results[key] = { selector: '', matchCount: 0, sampleText: '', found: false };
        continue;
      }
      try {
        var matches = document.querySelectorAll(cssSelector);
        var firstEl = matches[0];
        var sampleText = '';
        if (firstEl) {
          sampleText = (firstEl.textContent || '').trim().substring(0, 100);
          if (!sampleText && firstEl.value) {
            sampleText = firstEl.value.substring(0, 100);
          }
        }
        results[key] = {
          selector: cssSelector,
          matchCount: matches.length,
          sampleText: sampleText,
          found: matches.length > 0
        };
      } catch (err) {
        results[key] = {
          selector: cssSelector,
          matchCount: 0,
          sampleText: '',
          found: false,
          error: err.message || String(err)
        };
      }
    }
    return results;
  })()`;

  const raw = await evalScriptJSON<Record<string, RawSelectorResult>>(script);

  return Object.entries(raw).map(([field, data]) => ({
    selector: data.selector,
    field,
    found: data.found,
    matchCount: data.matchCount,
    sampleText: data.sampleText || undefined,
    error: data.error,
  }));
}

/**
 * Simulate ExtractionConfig extraction against the currently loaded page.
 *
 * Runs the responseMethod + maxScoreMethod logic and returns what would
 * be extracted for the first visible student row.
 */
export async function testExtraction(
  config: ExtractionConfig,
  _pageUrl: string
): Promise<ExtractionTestResult> {
  const configJSON = JSON.stringify(config);

  // IIFE that attempts response + maxScore extraction using the config.
  const script = `(function() {
    var cfg = ${configJSON};
    var result = { response: '', maxScore: '', messages: [] };

    // ── Response extraction ──
    try {
      if (cfg.responseMethod === 'selector' && cfg.responseSelector) {
        var el = document.querySelector(cfg.responseSelector);
        if (el) {
          result.response = (el.textContent || '').trim().substring(0, 500);
        } else {
          result.messages.push('Response selector matched no elements: ' + cfg.responseSelector);
        }
      } else if (cfg.responseMethod === 'childIndex' && cfg.responsePath) {
        var parts = cfg.responsePath.split('.');
        var cur = document;
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          var bm = part.match(/^(\\w+)\\[(\\d+)\\]$/);
          if (bm) { cur = cur[bm[1]][parseInt(bm[2])]; }
          else { cur = cur[part] || document.querySelector(part); }
          if (!cur) { result.messages.push('childIndex path broken at: ' + part); break; }
        }
        if (cur && cur !== document) {
          result.response = (cur.textContent || '').trim().substring(0, 500);
        }
      } else if (cfg.responseMethod === 'iframe' && cfg.iframeSelector) {
        var iframe = document.querySelector(cfg.iframeSelector);
        if (iframe && iframe.contentDocument) {
          result.response = (iframe.contentDocument.body.textContent || '').trim().substring(0, 500);
        } else if (iframe) {
          result.messages.push('iframe found but contentDocument not accessible (cross-origin?)');
        } else {
          result.messages.push('iframe selector matched no elements: ' + cfg.iframeSelector);
        }
      }
    } catch (err) {
      result.messages.push('Response extraction error: ' + (err.message || String(err)));
    }

    // ── Max score extraction ──
    try {
      if (cfg.maxScoreMethod === 'selector' && cfg.maxScoreSelector) {
        var scoreEl = document.querySelector(cfg.maxScoreSelector);
        if (scoreEl) {
          result.maxScore = (scoreEl.textContent || scoreEl.value || '').trim();
        } else {
          result.messages.push('Max score selector matched no elements');
        }
      } else if (cfg.maxScoreMethod === 'parentTextRegex' && cfg.maxScoreRegex) {
        var inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
        var regex = new RegExp(cfg.maxScoreRegex);
        for (var j = 0; j < inputs.length; j++) {
          var parentText = inputs[j].parentElement ? inputs[j].parentElement.textContent : '';
          var m = parentText.match(regex);
          if (m && m[1]) { result.maxScore = m[1]; break; }
        }
        if (!result.maxScore) { result.messages.push('parentTextRegex found no match'); }
      } else if (cfg.maxScoreMethod === 'inputLabel' && cfg.maxScorePattern) {
        var labels = document.querySelectorAll('label');
        var lRegex = new RegExp(cfg.maxScorePattern);
        for (var k = 0; k < labels.length; k++) {
          var lm = labels[k].textContent.match(lRegex);
          if (lm && lm[1]) { result.maxScore = lm[1]; break; }
        }
        if (!result.maxScore) { result.messages.push('inputLabel found no match'); }
      }
    } catch (err) {
      result.messages.push('Max score extraction error: ' + (err.message || String(err)));
    }

    if (!result.maxScore && cfg.maxScoreDefault) {
      result.maxScore = cfg.maxScoreDefault;
      result.messages.push('Using default max score: ' + cfg.maxScoreDefault);
    }

    return result;
  })()`;

  const raw = await evalScriptJSON<RawExtractionResult>(script);

  return {
    success: raw.response.length > 0,
    extractedResponse: raw.response || undefined,
    extractedMaxScore: raw.maxScore || undefined,
    responseMethod: config.responseMethod,
    maxScoreMethod: config.maxScoreMethod,
    messages: raw.messages,
  };
}

/**
 * Run a full profile test: selectors + extraction (if config present).
 *
 * Calls testSelectorDepth, then testExtraction if the profile includes
 * an ExtractionConfig. Computes aggregate pass/fail from results.
 */
export async function testProfile(
  profile: SiteProfile,
  pageUrl: string
): Promise<ProfileTestReport> {
  const selectorResults = await testSelectorDepth(profile, pageUrl);

  // Only attempt extraction if the profile carries an ExtractionConfig
  let extractionResult: ExtractionTestResult | null = null;
  if ('extraction' in profile) {
    const extraction = (profile as SiteProfileWithExtraction).extraction;
    if (extraction) {
      extractionResult = await testExtraction(extraction, pageUrl);
    }
  }

  // Count only configured (non-empty) selectors for found/missing tallies
  const configured = selectorResults.filter(r => r.selector !== '');
  const selectorsFound = configured.filter(r => r.found).length;
  const selectorsMissing = configured.filter(r => !r.found).length;

  const selectorsPassed = selectorsMissing === 0;
  const extractionPassed = extractionResult === null || extractionResult.success;

  return {
    profileId: profile.id,
    profileName: profile.name,
    testedAt: new Date().toISOString(),
    selectorResults,
    extractionResult,
    passed: selectorsPassed && extractionPassed,
    selectorsFound,
    selectorsMissing,
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/** Returns true if value is a SelectorTestResult. */
export function isSelectorTestResult(value: unknown): value is SelectorTestResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['selector'] === 'string' &&
    typeof v['field'] === 'string' &&
    typeof v['found'] === 'boolean' &&
    typeof v['matchCount'] === 'number'
  );
}

/** Returns true if value is a ProfileTestReport. */
export function isProfileTestReport(value: unknown): value is ProfileTestReport {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['profileId'] === 'string' &&
    typeof v['profileName'] === 'string' &&
    typeof v['testedAt'] === 'string' &&
    Array.isArray(v['selectorResults']) &&
    typeof v['passed'] === 'boolean' &&
    typeof v['selectorsFound'] === 'number' &&
    typeof v['selectorsMissing'] === 'number'
  );
}
