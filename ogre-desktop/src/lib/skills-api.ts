/**
 * Skills API client for fetching skill content from skills.sh.
 *
 * Provides utilities to build URLs for fetching skill content
 * from GitHub raw content based on skills.sh search results.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from '@tauri-apps/api/core';

type TauriResponseWithData = { data: unknown };

function getResponseData(response: unknown): unknown {
  return (response as TauriResponseWithData).data;
}

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
    const rawData = getResponseData(response);
    const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
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
    const rawData = getResponseData(response);
    const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
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
  const rawData = getResponseData(response);
  return typeof rawData === 'string' ? rawData : String(rawData);
}

// ── Install Logic ───────────────────────────────────────────────────────

import { getSkillBySource, saveSkill, getActiveSkills, getSkillsWithUrlPattern, type Skill } from './db';
import { parseSkillMarkdown } from './skill-parser';
import { convertProfileToJSON } from './profile-json-converter';
import { formatSiteGuideForAgent } from './site-guide-types';
import { selectBestProfile } from './profile-precedence';

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

// ── Site Profile Injection ──────────────────────────────────────────

/**
 * Pure function: Find skills whose url_pattern matches the given URL.
 * Performs TypeScript-side substring matching (case-insensitive).
 * A skill's url_pattern may be a single value or comma-separated list.
 *
 * @param url - The current browser URL
 * @param skills - List of skills with url_pattern set
 * @returns Skills whose url_pattern matches the URL
 */
export function findMatchingProfiles(url: string, skills: Skill[]): Skill[] {
  const lowerUrl = url.toLowerCase();
  return skills.filter(skill => {
    if (!skill.url_pattern) return false;
    const patterns = skill.url_pattern.split(',').map(p => p.trim()).filter(Boolean);
    return patterns.some(pattern => lowerUrl.includes(pattern.toLowerCase()));
  });
}

/**
 * Build a site context injection string for the given URL.
 * Fetches all skills with url_pattern set, finds matches, and formats them
 * as SITE GUIDE blocks to inject into the Agent Mode system prompt.
 *
 * @param url - The current browser URL
 * @returns Formatted site guide injection string, or empty string if no matches
 */
export async function buildSiteContextInjection(url: string): Promise<string> {
  try {
    const allWithPattern = await getSkillsWithUrlPattern();
    const matches = findMatchingProfiles(url, allWithPattern);
    if (matches.length === 0) return '';

    const best = selectBestProfile(matches);
    if (!best) return '';

    try {
      const guide = convertProfileToJSON(best.content);
      if (!guide.site) guide.site = best.name;
      return formatSiteGuideForAgent(guide);
    } catch {
      return `--- SITE GUIDE: ${best.name} ---\n${best.content}\n--- END SITE GUIDE ---`;
    }
  } catch {
    return '';
  }
}

/**
 * Get all skills whose url_pattern matches the given URL.
 * Returns skills that can be loaded for the current page context.
 * Used by the skill dropdown in AgentChat to show relevant skills.
 *
 * @param url - The current browser URL
 * @returns Skills matching the URL pattern
 */
export async function getMatchingSkillsForUrl(url: string): Promise<Skill[]> {
  try {
    const allWithPattern = await getSkillsWithUrlPattern();
    return findMatchingProfiles(url, allWithPattern);
  } catch {
    return [];
  }
}

// ── Bundled Site Profiles ────────────────────────────────────────────────

// @ts-expect-error Vite raw markdown asset import
import momProfileRaw from '../assets/profiles/myopenmath.md?raw';
// @ts-expect-error Vite raw markdown asset import
import aeriesProfileRaw from '../assets/profiles/aeries.md?raw';

/** Bundled site profiles shipped with the app. Exported for testing. */
export const BUNDLED_PROFILES: string[] = [momProfileRaw, aeriesProfileRaw];

export interface SyncSiteProfilesResult {
  imported: number;
  updated: number;
}

/**
 * Sync bundled site profiles (MyOpenMath, Aeries) into the skills DB.
 * Profiles are always upserted so content stays fresh on app updates.
 * Preserves each profile's is_active toggle state when updating.
 *
 * @param profiles - Markdown content array. Defaults to BUNDLED_PROFILES.
 *                   Pass custom content in tests to avoid file I/O.
 */
export async function syncSiteProfiles(
  profiles: string[] = BUNDLED_PROFILES
): Promise<SyncSiteProfilesResult> {
  let imported = 0;
  let updated = 0;

  for (const content of profiles) {
    try {
      const parsed = parseSkillMarkdown(content);
      const sourceId = parsed.urlPatterns?.[0] ?? '';
      if (!sourceId) continue;

      const urlPattern = parsed.urlPatterns?.join(',') ?? '';
      const existing = await getSkillBySource('site-profile', sourceId);

      if (existing) {
        await saveSkill({
          id: existing.id,
          name: parsed.name || sourceId,
          description: parsed.description || '',
          content,
          source: 'site-profile',
          source_id: sourceId,
          is_active: existing.is_active,
          url_pattern: urlPattern,
        });
        updated++;
      } else {
        await saveSkill({
          name: parsed.name || sourceId,
          description: parsed.description || '',
          content,
          source: 'site-profile',
          source_id: sourceId,
          is_active: 0,
          url_pattern: urlPattern,
        });
        imported++;
      }
    } catch (e) {
      console.warn('syncSiteProfiles: failed to sync profile:', e);
    }
  }

  return { imported, updated };
}

interface LocalSkillFile {
  folder: string;
  content: string;
}

export async function syncLocalSkills(): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  try {
    const files = await invoke<LocalSkillFile[]>('scan_local_skills');

    for (const file of files) {
      const existing = await getSkillBySource('local', file.folder);
      if (existing) {
        skipped++;
        continue;
      }

      const parsed = parseSkillMarkdown(file.content);
      await saveSkill({
        name: parsed.name || file.folder,
        description: parsed.description || '',
        content: file.content,
        source: 'local',
        source_id: file.folder,
        is_active: 0,
      });
      imported++;
    }
  } catch (e) {
    console.warn('syncLocalSkills failed:', e);
  }

  return { imported, skipped };
}
