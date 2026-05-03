/**
 * profile-editor.ts — Utilities for comparing, merging, and editing SiteProfiles.
 *
 * Provides:
 * - mergeDiscoveryWithProfile()  — diff an existing profile against a new discovery
 * - applyMergePlan()             — apply resolved diffs back to the profile
 * - updateProfileSelector()      — update a single selector field (async, storage-backed)
 * - addUrlPattern()              — append a URL pattern (deduplicated)
 * - mergeProfiles()              — pure merge of discovery result into existing profile
 * - updateSelector()             — pure single-selector update (no storage)
 * - reDiscoverProfile()          — re-run discovery and merge into existing profile
 */

import type { DiscoveryResult } from './discover';
import type { SiteProfile, SiteSelectors } from './batch-grader';
import type { ExtractionConfig, ProfileStorage, SiteProfileWithExtraction } from './site-profiles';
import { discoveryResultToSiteProfile, normalizeNavigation, selectorMapToSiteSelectors } from './type-mappers';

// ============================================================================
// Types
// ============================================================================

/** Describes a single selector-level difference between two profiles. */
export interface SelectorDiff {
  key: string;
  oldValue: string | undefined;
  newValue: string | undefined;
  decision: 'keep-old' | 'use-new' | 'pending';
}

/** A plan describing all diffs between an existing profile and a new discovery. */
export interface ProfileMergePlan {
  profileId: string;
  diffs: SelectorDiff[];
  extractionDiff: { old: ExtractionConfig | null; new: ExtractionConfig | null } | null;
}

// ============================================================================
// Selector key helpers
// ============================================================================

/** All known selector keys on SiteSelectors. */
const SELECTOR_KEYS: (keyof SiteSelectors)[] = [
  'studentSection',
  'studentName',
  'scoreInput',
  'feedbackBox',
  'feedbackHidden',
  'questionRegion',
  'fullCreditLink',
];

/**
 * Read a selector value as `string | undefined`.
 * Normalises `null` → `undefined` so diff logic is consistent.
 */
function readSelector(selectors: SiteSelectors, key: keyof SiteSelectors): string | undefined {
  const v = selectors[key];
  return v === null || v === undefined ? undefined : v;
}

/**
 * Write a selector value by key. Uses a switch to stay type-safe without
 * needing an index-signature cast.
 */
function writeSelector(
  selectors: SiteSelectors,
  key: string,
  value: string | null,
): void {
  switch (key) {
    case 'studentSection': selectors.studentSection = value; break;
    case 'studentName':    selectors.studentName = value; break;
    case 'scoreInput':     selectors.scoreInput = value; break;
    case 'feedbackBox':    selectors.feedbackBox = value; break;
    case 'feedbackHidden': selectors.feedbackHidden = value; break;
    case 'questionRegion': selectors.questionRegion = value; break;
    case 'fullCreditLink': selectors.fullCreditLink = value; break;
    default: break;
  }
}

// ============================================================================
// mergeDiscoveryWithProfile
// ============================================================================

/**
 * Compare an existing SiteProfile against a fresh DiscoveryResult and produce
 * a merge plan listing every selector difference.
 *
 * Unchanged selectors get decision `'keep-old'`.
 * Changed or newly-present selectors get decision `'pending'`.
 */
export function mergeDiscoveryWithProfile(
  existingProfile: SiteProfile,
  newDiscovery: DiscoveryResult,
): ProfileMergePlan {
  // Convert the discovery result to a SiteProfile so we can compare apples-to-apples
  const converted = discoveryResultToSiteProfile(newDiscovery, undefined, {
    name: existingProfile.name,
    urlPatterns: existingProfile.urlPatterns,
  });

  const diffs: SelectorDiff[] = [];

  for (const key of SELECTOR_KEYS) {
    const oldValue = readSelector(existingProfile.selectors, key);
    const newValue = readSelector(converted.selectors, key);

    const decision: SelectorDiff['decision'] =
      oldValue === newValue ? 'keep-old' : 'pending';

    diffs.push({ key, oldValue, newValue, decision });
  }

  // Extraction config diff
  const oldExtraction = (existingProfile as SiteProfileWithExtraction).extraction ?? null;
  const newExtraction = (converted as SiteProfileWithExtraction).extraction ?? null;

  const extractionDiff =
    JSON.stringify(oldExtraction) === JSON.stringify(newExtraction)
      ? null
      : { old: oldExtraction, new: newExtraction };

  return {
    profileId: existingProfile.id,
    diffs,
    extractionDiff,
  };
}

// ============================================================================
// applyMergePlan
// ============================================================================

/**
 * Apply a resolved ProfileMergePlan to an existing profile and persist it.
 *
 * Decision mapping:
 * - `'keep-old'`  → use the existing profile's value
 * - `'use-new'`   → use the new value from the plan
 * - `'pending'`   → treated as keep-old (safe default)
 */
export async function applyMergePlan(
  plan: ProfileMergePlan,
  existingProfile: SiteProfile,
  storage: ProfileStorage,
): Promise<SiteProfile> {
  const updatedSelectors: SiteSelectors = { ...existingProfile.selectors };

  for (const diff of plan.diffs) {
    if (diff.decision === 'use-new') {
      writeSelector(updatedSelectors, diff.key, diff.newValue ?? null);
    }
    // 'keep-old' and 'pending' → no change
  }

  const updated: SiteProfile = {
    ...existingProfile,
    selectors: updatedSelectors,
  };

  await storage.saveProfile(updated);
  return updated;
}

// ============================================================================
// updateProfileSelector
// ============================================================================

/**
 * Update a single selector field on a saved profile.
 *
 * @throws Error if the profile is not found or is built-in.
 */
export async function updateProfileSelector(
  profileId: string,
  field: string,
  newSelector: string,
  storage: ProfileStorage,
): Promise<SiteProfile> {
  const profile = await storage.getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  if (profile.isBuiltIn) {
    throw new Error(`Cannot edit built-in profile: ${profileId}`);
  }

  const updatedSelectors: SiteSelectors = { ...profile.selectors };
  writeSelector(updatedSelectors, field, newSelector);

  const updated: SiteProfile = { ...profile, selectors: updatedSelectors };
  await storage.saveProfile(updated);
  return updated;
}

// ============================================================================
// addUrlPattern
// ============================================================================

/**
 * Append a URL pattern to a saved profile. Skips duplicates.
 *
 * @throws Error if the profile is not found or is built-in.
 */
export async function addUrlPattern(
  profileId: string,
  newPattern: string,
  storage: ProfileStorage,
): Promise<SiteProfile> {
  const profile = await storage.getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  if (profile.isBuiltIn) {
    throw new Error(`Cannot edit built-in profile: ${profileId}`);
  }

  if (profile.urlPatterns.includes(newPattern)) {
    return profile; // already present — no-op
  }

  const updated: SiteProfile = {
    ...profile,
    urlPatterns: [...profile.urlPatterns, newPattern],
  };
  await storage.saveProfile(updated);
  return updated;
}

// ============================================================================
// Pure Functions - No Storage Required
// ============================================================================

/**
 * Coerce a DiscoveryResult feedback type to a batch-grader-safe type.
 * 'unknown' is not valid in batch-grader - default to 'textarea'.
 */
type ValidFeedbackType = 'tinymce-inline' | 'tinymce-iframe' | 'contenteditable' | 'textarea';

function coerceFeedbackType(type: string): ValidFeedbackType {
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
 * Pure-function merge: apply new discovery on top of an existing profile.
 *
 * Non-null, non-empty new selector values overwrite existing ones.
 * Null/undefined new values preserve whatever the existing profile had.
 * Feedback, save, and navigation configs are fully replaced by new discovery.
 *
 * @param existing     The current saved profile
 * @param newDiscovery  Fresh discovery result to merge in
 * @returns A new SiteProfile with merged values (does not mutate inputs)
 */
export function mergeProfiles(
  existing: SiteProfile,
  newDiscovery: DiscoveryResult,
): SiteProfile {
  const newSelectors = selectorMapToSiteSelectors(newDiscovery.selectors);
  const merged: SiteSelectors = { ...existing.selectors };

  for (const key of SELECTOR_KEYS) {
    const newVal = readSelector(newSelectors, key);
    if (newVal !== undefined) {
      writeSelector(merged, key, newVal);
    }
    // undefined (was null) -> preserve existing
  }

  return {
    ...existing,
    selectors: merged,
    feedback: {
      type: coerceFeedbackType(newDiscovery.feedback.type),
      requiresHiddenSync: newDiscovery.feedback.requiresHiddenSync,
      htmlWrap: newDiscovery.feedback.htmlWrap,
    },
    save: {
      buttonText: newDiscovery.save.buttonText || existing.save.buttonText,
      fallbackText: newDiscovery.save.fallbackText ?? existing.save.fallbackText,
    },
    navigation: normalizeNavigation(newDiscovery.navigation),
  };
}

/**
 * Pure-function single-selector update. Returns a new profile object.
 * Does not persist - caller is responsible for saving.
 *
 * @param profile      The profile to update
 * @param field        Selector field name (must be a valid SiteSelectors key)
 * @param newSelector  New CSS selector value
 * @returns A new SiteProfile with the updated selector
 * @throws Error if field is not a valid selector key
 */
export function updateSelector(
  profile: SiteProfile,
  field: string,
  newSelector: string,
): SiteProfile {
  if (!SELECTOR_KEYS.includes(field as keyof SiteSelectors)) {
    throw new Error(`Invalid selector field: ${field}`);
  }

  return {
    ...profile,
    selectors: {
      ...profile.selectors,
      [field]: newSelector,
    },
  };
}

/**
 * Re-run discovery and merge results into an existing profile.
 *
 * Delegates the actual discovery call to the provided callback, then merges
 * the result using mergeProfiles(). Useful for 're-discover' UI flows.
 *
 * @param profile       The existing profile to update
 * @param runDiscovery  Callback that performs the actual AI discovery call
 * @returns A new SiteProfile with merged discovery results
 */
export async function reDiscoverProfile(
  profile: SiteProfile,
  runDiscovery: () => Promise<DiscoveryResult>,
): Promise<SiteProfile> {
  const newDiscovery = await runDiscovery();
  return mergeProfiles(profile, newDiscovery);
}
