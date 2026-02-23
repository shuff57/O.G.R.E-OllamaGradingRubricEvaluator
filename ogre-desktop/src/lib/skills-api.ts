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

// ── API Functions ───────────────────────────────────────────────────────

/**
 * Search skills.sh marketplace for skills matching a query.
 * Returns empty array on network failure (never throws).
 *
 * @param query - Search query string
 * @param limit - Maximum number of results (default: 20)
 */
export async function searchSkills(query: string, limit = 20): Promise<SkillSearchResult[]> {
  try {
    const response = await tauriFetch(
      `${SKILLS_SH_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return data.skills ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch trending skills from skills.sh.
 * Returns empty array on network failure (never throws).
 */
export async function fetchTrendingSkills(): Promise<SkillSearchResult[]> {
  try {
    const response = await tauriFetch('https://skills.sh/api/skills/trending/0');
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return data.skills ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch the raw markdown content of a skill from GitHub.
 *
 * @param source - The GitHub source repo (e.g., "vercel-labs/agent-skills")
 * @param skillId - The skill ID from the skills.sh API
 * @returns Raw markdown content string
 */
export async function fetchSkillContent(source: string, skillId: string): Promise<string> {
  const url = buildSkillContentUrl(source, skillId);
  const response = await tauriFetch(url);
  return typeof response.data === 'string' ? response.data : String(response.data);
}

// ── Install Logic ───────────────────────────────────────────────────────

import { getSkillBySource, saveSkill, getActiveSkills } from './db';

export interface InstallSkillParams {
  skillId: string;
  name: string;
  source: string;
  description: string;
  content: string;
}

export interface InstallResult {
  installed: boolean;
  id: string;
}

/**
 * Install a skill from the marketplace into the local database.
 * Checks for duplicates by source + source_id before saving.
 *
 * @returns { installed: true, id } if newly saved, { installed: false, id } if already exists
 */
export async function installSkill(params: InstallSkillParams): Promise<InstallResult> {
  const existing = await getSkillBySource(params.source, params.skillId);

  if (existing) {
    return { installed: false, id: existing.id };
  }

  const id = await saveSkill({
    name: params.name,
    description: params.description,
    content: params.content,
    source: params.source,
    source_id: params.skillId,
    is_active: 0,
  });

  return { installed: true, id };
}

// ── Skill Injection ─────────────────────────────────────────────────────

/**
 * Build a combined injection string from all active skills.
 * Used as systemPrompt (solver chat) or customInstructions (batch grading).
 *
 * @returns Formatted skill injection string, or empty string if no skills active
 */
export async function buildSkillInjection(): Promise<string> {
  const skills = await getActiveSkills();
  if (skills.length === 0) return '';
  return skills
    .map(s => `\n\n--- SKILL: ${s.name} ---\n${s.content}\n--- END SKILL ---\n\n`)
    .join('');
}

/**
 * Get the size metrics for the current skill injection.
 * Useful for showing context usage warnings in the UI.
 */
export async function getSkillInjectionSize(): Promise<{ charCount: number; skillCount: number }> {
  const injection = await buildSkillInjection();
  const skills = await getActiveSkills();
  return { charCount: injection.length, skillCount: skills.length };
}
