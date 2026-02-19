/**
 * discovery-picker-integration.ts — Integrates element picker with discovery workflow
 *
 * When AI-discovered selectors are ambiguous (low/medium confidence or high match count),
 * the user can manually refine them using the element picker. This module provides:
 *
 * - refineSelector(): Highlights matching elements, then starts picker pre-focused
 * - mergeSelectorSources(): Merges picker selection with AI suggestion
 * - Callback mechanism (onPickerSelect) for discovery workflow integration
 *
 * Communication pattern:
 * 1. Discovery runs AI analysis → produces DiscoveryResult with selectors
 * 2. Validation reveals ambiguous selector (matchCount > threshold or low confidence)
 * 3. User triggers refinement for a specific selector key
 * 4. refineSelector() highlights current matches, starts picker
 * 5. User clicks correct element → picker returns ElementPickerResult
 * 6. mergeSelectorSources() combines AI + picker → refined selector
 * 7. Updated selector replaces original in DiscoveryResult
 */

import { evalScript } from './browser';
import {
  startElementPicker,
  stopElementPicker,
  type ElementPickerResult,
} from './element-picker';
import type {
  DiscoveryResult,
  SelectorMap,
  SelectorValidation,
  ValidationResults,
} from './discover';

// ── Types ───────────────────────────────────────────────────────────────────

/** Which selector field in SelectorMap is being refined. */
export type SelectorKey = keyof SelectorMap;

/** Request to refine a specific selector from discovery results. */
export interface RefinementRequest {
  /** Which selector field to refine (e.g., "studentName", "scoreInput"). */
  selectorKey: SelectorKey;
  /** The current AI-discovered selector (may be ambiguous). */
  currentSelector: string;
  /** Why this selector needs refinement. */
  reason: 'ambiguous' | 'no-match' | 'too-many-matches' | 'user-requested';
  /** Optional: validation data for the current selector. */
  validation?: SelectorValidation;
}

/** Result of a refinement operation. */
export interface RefinementResult {
  /** The selector key that was refined. */
  selectorKey: SelectorKey;
  /** Original AI-discovered selector. */
  originalSelector: string;
  /** New selector from picker or merge. */
  refinedSelector: string;
  /** How the refined selector was determined. */
  source: 'picker' | 'merged' | 'original';
  /** Element picker result (if picker was used). */
  pickerResult?: ElementPickerResult;
}

/**
 * Callback invoked when the picker selects an element during refinement.
 * Receives the refinement result with the new selector.
 *
 * @param result - The refinement result with original and refined selectors
 */
export type OnPickerSelectCallback = (result: RefinementResult) => void;

/** Options for the discovery-picker integration workflow. */
export interface DiscoveryRefinementOptions {
  /** Callback when picker selects an element during refinement. */
  onPickerSelect?: OnPickerSelectCallback;
  /** Match count threshold above which a selector is considered ambiguous. */
  ambiguityThreshold?: number;
  /** Whether to auto-suggest refinement for ambiguous selectors. */
  autoSuggestRefinement?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Default match count threshold for ambiguity detection. */
const DEFAULT_AMBIGUITY_THRESHOLD = 50;

/** JavaScript to highlight matching elements in the webview. */
const HIGHLIGHT_MATCHES_JS = `
(function(selector) {
  // Clean up previous highlights
  document.querySelectorAll('[data-ogre-refine-highlight]').forEach(function(el) {
    el.style.outline = el.dataset.ogreOriginalOutline || '';
    el.style.outlineOffset = el.dataset.ogreOriginalOutlineOffset || '';
    el.removeAttribute('data-ogre-refine-highlight');
    el.removeAttribute('data-ogre-original-outline');
    el.removeAttribute('data-ogre-original-outline-offset');
  });

  if (!selector) return { count: 0, highlighted: false };

  try {
    var matches = document.querySelectorAll(selector);
    for (var i = 0; i < matches.length; i++) {
      var el = matches[i];
      el.dataset.ogreOriginalOutline = el.style.outline || '';
      el.dataset.ogreOriginalOutlineOffset = el.style.outlineOffset || '';
      el.style.outline = '3px dashed #f59e0b';
      el.style.outlineOffset = '2px';
      el.setAttribute('data-ogre-refine-highlight', 'true');
    }
    return { count: matches.length, highlighted: true };
  } catch (e) {
    return { count: 0, highlighted: false, error: e.message };
  }
})`;

/** JavaScript to remove refinement highlights. */
const CLEAR_HIGHLIGHTS_JS = `
(function() {
  document.querySelectorAll('[data-ogre-refine-highlight]').forEach(function(el) {
    el.style.outline = el.dataset.ogreOriginalOutline || '';
    el.style.outlineOffset = el.dataset.ogreOriginalOutlineOffset || '';
    el.removeAttribute('data-ogre-refine-highlight');
    el.removeAttribute('data-ogre-original-outline');
    el.removeAttribute('data-ogre-original-outline-offset');
  });
})()`;

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Highlight elements matching a selector, then start the element picker
 * for the user to select the correct element.
 *
 * Flow:
 * 1. Highlight all elements matching baseSelector with dashed orange outline
 * 2. Start element picker overlay
 * 3. User clicks the correct element
 * 4. Clear highlights and return picker result
 *
 * @param baseSelector - CSS selector whose matches to highlight (can be empty)
 * @returns ElementPickerResult from user selection
 * @throws Error if picker is cancelled or times out
 */
export async function refineSelector(
  baseSelector: string,
): Promise<ElementPickerResult> {
  // Step 1: Highlight matching elements (shows user what AI found)
  if (baseSelector) {
    await evalScript(`${HIGHLIGHT_MATCHES_JS}(${JSON.stringify(baseSelector)})`);
  }

  try {
    // Step 2: Start picker — user selects the correct element
    const result = await startElementPicker();

    // Step 3: Clear highlights after selection
    await clearRefinementHighlights();

    return result;
  } catch (err) {
    // Clean up highlights on cancel/timeout too
    await clearRefinementHighlights();
    throw err;
  }
}

/**
 * Remove all refinement highlight outlines from the page.
 * Safe to call even if no highlights exist.
 */
export async function clearRefinementHighlights(): Promise<void> {
  await evalScript(CLEAR_HIGHLIGHTS_JS);
}

/**
 * Merge a picker-selected selector with the AI-discovered selector.
 *
 * Strategy:
 * - If picker found a unique ID selector, prefer it (most specific)
 * - If picker selector is more specific (shorter match count), use it
 * - If AI selector is a superset that includes the picked element, keep AI but narrow
 * - Otherwise, use the picker's selector directly
 *
 * @param aiSelector - Original AI-discovered selector
 * @param pickerResult - Element picker result from user selection
 * @returns The best merged selector string
 */
export function mergeSelectorSources(
  aiSelector: string,
  pickerResult: ElementPickerResult,
): string {
  const pickerSelector = pickerResult.selector;

  // If picker found a unique ID, it's the most specific — always prefer it
  if (pickerResult.id && pickerSelector.startsWith('#')) {
    return pickerSelector;
  }

  // If AI selector is empty/null, use picker directly
  if (!aiSelector || !aiSelector.trim()) {
    return pickerSelector;
  }

  // If picker gave us a tag-only fallback (e.g., "div"), AI is likely better
  if (/^[a-z]+$/i.test(pickerSelector) && aiSelector.length > pickerSelector.length) {
    return aiSelector;
  }

  // Default: prefer picker's selector (user explicitly chose this element)
  return pickerSelector;
}

/**
 * Identify which selectors in a discovery result need refinement.
 *
 * A selector is flagged for refinement when:
 * - It has no matches (matchCount === 0)
 * - It has too many matches (above threshold)
 * - The overall confidence is low/medium AND the selector wasn't skipped
 *
 * @param discovery - The AI discovery result
 * @param validation - Validation results for each selector
 * @param threshold - Match count above which selector is ambiguous
 * @returns Array of refinement requests for ambiguous selectors
 */
export function identifyAmbiguousSelectors(
  discovery: DiscoveryResult,
  validation: ValidationResults,
  threshold: number = DEFAULT_AMBIGUITY_THRESHOLD,
): RefinementRequest[] {
  const requests: RefinementRequest[] = [];

  for (const [key, val] of Object.entries(validation)) {
    if (val.skipped) continue;

    const selectorKey = key as SelectorKey;
    const currentSelector = getSelectorValue(discovery.selectors, selectorKey);

    if (!currentSelector) continue;

    if (val.matchCount === 0) {
      requests.push({
        selectorKey,
        currentSelector,
        reason: 'no-match',
        validation: val,
      });
    } else if (val.matchCount > threshold) {
      requests.push({
        selectorKey,
        currentSelector,
        reason: 'too-many-matches',
        validation: val,
      });
    } else if (discovery.confidence !== 'high' && !val.valid) {
      requests.push({
        selectorKey,
        currentSelector,
        reason: 'ambiguous',
        validation: val,
      });
    }
  }

  return requests;
}

/**
 * Refine a single selector from a discovery result using the element picker.
 *
 * Orchestrates the full refinement flow:
 * 1. Highlight matches for the current selector
 * 2. Start picker for user selection
 * 3. Merge picker result with AI suggestion
 * 4. Invoke onPickerSelect callback if provided
 * 5. Return the refinement result
 *
 * @param request - Which selector to refine and why
 * @param options - Callback and configuration options
 * @returns RefinementResult with the refined selector
 * @throws Error if picker is cancelled or times out
 */
export async function refineDiscoverySelector(
  request: RefinementRequest,
  options?: DiscoveryRefinementOptions,
): Promise<RefinementResult> {
  // Start refinement with highlights + picker
  const pickerResult = await refineSelector(request.currentSelector);

  // Merge AI suggestion with picker selection
  const refinedSelector = mergeSelectorSources(
    request.currentSelector,
    pickerResult,
  );

  const source = refinedSelector === request.currentSelector ? 'original' : (
    refinedSelector === pickerResult.selector ? 'picker' : 'merged'
  );

  const result: RefinementResult = {
    selectorKey: request.selectorKey,
    originalSelector: request.currentSelector,
    refinedSelector,
    source,
    pickerResult,
  };

  // Invoke callback if provided
  if (options?.onPickerSelect) {
    options.onPickerSelect(result);
  }

  return result;
}

/**
 * Apply a refinement result to a discovery result, updating the selector.
 *
 * Returns a new DiscoveryResult with the refined selector in place.
 * Does not mutate the original discovery result.
 *
 * @param discovery - Original discovery result
 * @param refinement - Refinement result to apply
 * @returns New DiscoveryResult with updated selector
 */
export function applyRefinement(
  discovery: DiscoveryResult,
  refinement: RefinementResult,
): DiscoveryResult {
  const updatedSelectors = { ...discovery.selectors };
  setSelectorValue(updatedSelectors, refinement.selectorKey, refinement.refinedSelector);

  return {
    ...discovery,
    selectors: updatedSelectors,
    // Append refinement note
    notes: [
      discovery.notes || '',
      `[Refined] ${refinement.selectorKey}: "${refinement.originalSelector}" → "${refinement.refinedSelector}" (${refinement.source})`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Batch refine multiple ambiguous selectors interactively.
 *
 * Presents each ambiguous selector to the user one at a time.
 * The user can refine via picker or skip (cancel) each one.
 * Returns the updated discovery result with all refinements applied.
 *
 * @param discovery - Original discovery result
 * @param requests - Array of refinement requests
 * @param options - Callback and configuration options
 * @returns Updated discovery result with all applied refinements
 */
export async function batchRefineSelectors(
  discovery: DiscoveryResult,
  requests: RefinementRequest[],
  options?: DiscoveryRefinementOptions,
): Promise<{ discovery: DiscoveryResult; refinements: RefinementResult[] }> {
  let current = discovery;
  const refinements: RefinementResult[] = [];

  for (const request of requests) {
    try {
      const refinement = await refineDiscoverySelector(request, options);
      current = applyRefinement(current, refinement);
      refinements.push(refinement);
    } catch {
      // User cancelled this refinement — skip and continue
      continue;
    }
  }

  return { discovery: current, refinements };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get selector value from SelectorMap by key.
 * Returns the string value or null/undefined.
 */
export function getSelectorValue(
  selectors: SelectorMap,
  key: SelectorKey,
): string | null | undefined {
  return selectors[key];
}

/**
 * Set selector value in SelectorMap by key.
 * Mutates the selectors object.
 */
export function setSelectorValue(
  selectors: SelectorMap,
  key: SelectorKey,
  value: string,
): void {
  // TypeScript needs explicit handling since some keys are optional/nullable
  (selectors as Record<string, string | null | undefined>)[key] = value;
}
