/**
 * profile-tester.ts - Deep DOM testing and extraction simulation
 *
 * Provides functions for testing a site profile against a live page:
 *   - Selector depth testing: verify each selector actually finds elements
 *   - Extraction simulation: run the ExtractionConfig logic and see what it returns
 *   - Full profile test: composite report combining both tests
 *
 * All async functions are stubs in Wave 1; they are implemented in Wave 3 (T22).
 * Tests that exercise the stubs use `.todo()` to mark unimplemented behaviour.
 * Type-level tests (interface shape, guard correctness) run green now.
 */

import type { SiteProfile } from './batch-grader';
import type { ExtractionConfig } from './site-profiles';

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
// Stub Implementations
// ============================================================================

/**
 * Test each CSS selector in a site profile against the currently loaded page.
 *
 * Uses CDP Runtime.evaluate to run querySelectorAll for each selector.
 * Returns a result per selector with match count and sample text.
 *
 * @stub — Full implementation in Wave 3 (T22)
 * @throws {Error} Always — not yet implemented
 */
export async function testSelectorDepth(
  _profile: SiteProfile,
  _pageUrl: string
): Promise<SelectorTestResult[]> {
  throw new Error('testSelectorDepth: not implemented');
}

/**
 * Simulate ExtractionConfig extraction against the currently loaded page.
 *
 * Runs the responseMethod + maxScoreMethod logic and returns what would
 * be extracted for the first visible student row.
 *
 * @stub — Full implementation in Wave 3 (T22)
 * @throws {Error} Always — not yet implemented
 */
export async function testExtraction(
  _config: ExtractionConfig,
  _pageUrl: string
): Promise<ExtractionTestResult> {
  throw new Error('testExtraction: not implemented');
}

/**
 * Run a full profile test: selectors + extraction (if config present).
 *
 * @stub — Full implementation in Wave 3 (T22)
 * @throws {Error} Always — not yet implemented
 */
export async function testProfile(
  _profile: SiteProfile,
  _pageUrl: string
): Promise<ProfileTestReport> {
  throw new Error('testProfile: not implemented');
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
