import type { Skill } from './db';

/**
 * Selects the single best knowledge profile when multiple profiles match a URL.
 *
 * Precedence order (highest first):
 *   1. user-created:  source === 'created' or source === 'local'
 *   2. user-modified: source === 'site-profile' with recent updated_at (within 30 days of now, compared to created_at)
 *   3. bundled:       source === 'site-profile' (not recently modified)
 *
 * Among same-precedence profiles: pick the one with the longest url_pattern (most specific match).
 * If still tied: pick the most recently updated.
 *
 * @param matches - Array of Skill objects that matched a URL pattern
 * @returns The single best Skill, or null if matches is empty
 */
export function selectBestProfile(matches: Skill[]): Skill | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const ranked = [...matches].sort((a, b) => {
    const pa = getPrecedence(a);
    const pb = getPrecedence(b);
    if (pa !== pb) return pa - pb; // lower number = higher precedence

    // Same precedence: longer url_pattern wins (more specific)
    const lenDiff = (b.url_pattern?.length ?? 0) - (a.url_pattern?.length ?? 0);
    if (lenDiff !== 0) return lenDiff;

    // Still tied: most recently updated wins
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return ranked[0];
}

/**
 * Determines the precedence level of a profile.
 * Lower number = higher precedence (wins in sorting).
 *
 * @param skill - The Skill to evaluate
 * @returns Precedence level (1-4, where 1 is highest)
 */
function getPrecedence(skill: Skill): number {
  // User-created profiles have highest precedence
  if (skill.source === 'created' || skill.source === 'local') return 1;

  // Site-profile: check if user modified it
  if (skill.source === 'site-profile') {
    // Check if user modified it (updated_at significantly newer than created_at)
    const created = new Date(skill.created_at).getTime();
    const updated = new Date(skill.updated_at).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (updated - created > thirtyDaysMs) return 2; // user-modified bundled
    return 3; // pristine bundled
  }

  // Marketplace or other sources have lowest precedence
  return 4;
}
