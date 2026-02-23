/**
 * Skills API client for fetching skill content from skills.sh.
 *
 * Provides utilities to build URLs for fetching skill content
 * from GitHub raw content based on skills.sh search results.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// The validated URL pattern from the spike
export const SKILLS_SH_SEARCH_URL = "https://skills.sh/api/search";

export interface SkillSearchResult {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
  description?: string;
}

/**
 * Normalizes a skillId from the skills.sh API to match the actual
 * directory name in the skill's GitHub repository.
 *
 * Transformations:
 * - Strips vendor prefixes (e.g., "vercel-react-best-practices" -> "react-best-practices")
 * - Replaces colons with dashes (e.g., "react:components" -> "react-components")
 */
function normalizeSkillId(skillId: string): string {
  // Strip common vendor prefixes
  let normalized = skillId.replace(/^(vercel-|google-|microsoft-|aws-)/i, "");

  // Replace colons with dashes (common in scoped skills like "react:components")
  normalized = normalized.replace(/:/g, "-");

  return normalized;
}

/**
 * Builds the raw GitHub URL to fetch a skill's markdown content.
 * Pattern validated against skills.sh API results.
 *
 * @param source - The GitHub source repo (e.g., "vercel-labs/agent-skills")
 * @param skillId - The skill ID from the skills.sh API (e.g., "vercel-react-best-practices")
 * @returns The raw GitHub content URL
 *
 * @example
 * const url = buildSkillContentUrl("vercel-labs/agent-skills", "vercel-react-best-practices");
 * // Returns: "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md"
 */
export function buildSkillContentUrl(source: string, skillId: string): string {
  const normalizedSkillId = normalizeSkillId(skillId);

  // Pattern: https://raw.githubusercontent.com/{source}/main/skills/{normalizedSkillId}/SKILL.md
  return `https://raw.githubusercontent.com/${source}/main/skills/${normalizedSkillId}/SKILL.md`;
}
