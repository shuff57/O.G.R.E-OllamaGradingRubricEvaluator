/**
 * type-mappers.ts — Converters between DiscoveryResult and SiteProfile types.
 *
 * DiscoveryResult (discover.ts) is the AI/heuristic output shape.
 * SiteProfile (batch-grader.ts) is the persistence/runtime shape.
 * These two overlap but differ in nullability and enum values.
 */

import type { DiscoveryResult, SelectorMap } from './discover';
import type { SiteProfile, SiteSelectors } from './batch-grader';
import type { ExtractionConfig, SiteProfileWithExtraction } from './site-profiles';

// Feedback types that are valid in SiteProfile (batch-grader)
type BatchFeedbackType = 'tinymce-inline' | 'tinymce-iframe' | 'contenteditable' | 'textarea';

/**
 * Map a DiscoveryResult SelectorMap to a SiteProfile SiteSelectors.
 * Handles null/undefined coercion between the two type systems.
 */
export function selectorMapToSiteSelectors(selectors: SelectorMap): SiteSelectors {
  return {
    studentSection: selectors.studentSection ?? null,
    studentName: selectors.studentName,
    scoreInput: selectors.scoreInput,
    feedbackBox: selectors.feedbackBox ?? null,
    feedbackHidden: selectors.feedbackHidden ?? null,
    questionRegion: selectors.questionRegion ?? null,
    fullCreditLink: selectors.fullCreditLink ?? null,
  };
}

/**
 * Map SiteSelectors back to a SelectorMap.
 */
export function siteSelectorsToSelectorMap(selectors: SiteSelectors): SelectorMap {
  return {
    studentSection: selectors.studentSection,
    studentName: selectors.studentName ?? '',
    scoreInput: selectors.scoreInput ?? '',
    feedbackBox: selectors.feedbackBox,
    feedbackHidden: selectors.feedbackHidden,
    questionRegion: selectors.questionRegion,
    fullCreditLink: selectors.fullCreditLink,
  };
}

/**
 * Coerce a DiscoveryResult feedback type to a batch-grader-safe type.
 * 'unknown' is not valid in batch-grader — default to 'textarea'.
 */
function coerceFeedbackType(type: string): BatchFeedbackType {
  if (
    type === 'tinymce-inline' ||
    type === 'tinymce-iframe' ||
    type === 'contenteditable' ||
    type === 'textarea'
  ) {
    return type;
  }
  return 'textarea';
}

/**
 * Convert a DiscoveryResult + optional ExtractionConfig into a SiteProfile
 * ready to be saved to the database.
 *
 * @param result     - Discovery result from AI or heuristic analysis
 * @param extraction - Optional ExtractionConfig discovered via separate AI call
 * @param meta       - Profile metadata (name, urlPatterns) provided by user
 */
export function discoveryResultToSiteProfile(
  result: DiscoveryResult,
  extraction: ExtractionConfig | undefined,
  meta: { name: string; urlPatterns: string[] },
): SiteProfile | SiteProfileWithExtraction {
  const base: SiteProfile = {
    id: crypto.randomUUID(),
    name: meta.name,
    isBuiltIn: false,
    urlPatterns: meta.urlPatterns,
    selectors: selectorMapToSiteSelectors(result.selectors),
    feedback: {
      type: coerceFeedbackType(result.feedback.type),
      requiresHiddenSync: result.feedback.requiresHiddenSync,
      htmlWrap: result.feedback.htmlWrap,
    },
    save: {
      buttonText: result.save.buttonText,
      fallbackText: result.save.fallbackText ?? 'Save',
    },
    navigation: result.navigation,
  };

  if (extraction !== undefined) {
    return { ...base, extraction } as SiteProfileWithExtraction;
  }

  return base;
}

/**
 * Convert a SiteProfile back to a DiscoveryResult shape for display in the UI.
 * Useful when re-loading a saved profile into the discovery panel for refinement.
 */
export function siteProfileToDiscoveryResult(profile: SiteProfile): DiscoveryResult {
  return {
    navigation: profile.navigation,
    selectors: siteSelectorsToSelectorMap(profile.selectors),
    feedback: {
      type: profile.feedback.type,
      requiresHiddenSync: profile.feedback.requiresHiddenSync,
      htmlWrap: profile.feedback.htmlWrap,
    },
    save: {
      buttonText: profile.save.buttonText,
      fallbackText: profile.save.fallbackText,
    },
    confidence: 'high', // Saved profiles are presumed high-confidence
  };
}
