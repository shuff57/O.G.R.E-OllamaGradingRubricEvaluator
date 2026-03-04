/**
 * site-profiles.ts - Site profile management for desktop app
 *
 * Provides TypeScript interfaces and CRUD operations for managing site profiles.
 * Site profiles describe how to interact with different LMS grading pages
 * (MyOpenMath, Canvas, Blackboard, etc.) via CSS selectors and configuration.
 *
 * Reuses core interfaces from batch-grader.ts and adds ProfileStorage for
 * database persistence.
 */

import type {
  SiteProfile,
  SiteSelectors,
  FeedbackConfig,
  SaveConfig,
  NavigationConfig,
} from './batch-grader';

import {
  getSiteProfiles as dbGetSiteProfiles,
  getSiteProfile as dbGetSiteProfile,
  saveSiteProfile as dbSaveSiteProfile,
  deleteSiteProfile as dbDeleteSiteProfile,
  type SiteProfile as DbSiteProfileRow,
} from './db';
import { syncProfileToServer } from './server';

// Re-export types for consumer convenience
export type { SiteProfile, SiteSelectors, FeedbackConfig, SaveConfig, NavigationConfig };

// ============================================================================
// Additional Interfaces
// ============================================================================

/**
 * Extraction configuration for how to get student response and max score.
 * Describes methods for extracting data from the page DOM.
 */
export interface ExtractionConfig {
  /** Method to extract student response: 'childIndex', 'iframe', 'selector' */
  responseMethod: 'childIndex' | 'iframe' | 'selector';
  /** Path for childIndex method (e.g., 'questionRegion.children[1].children[1]') */
  responsePath?: string;
  /** Selector for iframe method */
  iframeSelector?: string;
  /** Selector for direct selector method */
  responseSelector?: string;
  /** Method to extract max score: 'parentTextRegex', 'inputLabel', 'selector' */
  maxScoreMethod: 'parentTextRegex' | 'inputLabel' | 'selector';
  /** Regex pattern for parentTextRegex method (e.g., '\\/(\\d+\\.?\\d*)') */
  maxScoreRegex?: string;
  /** Pattern for inputLabel method (e.g., 'Grade out of (\\d+)') */
  maxScorePattern?: string;
  /** Selector for direct selector method */
  maxScoreSelector?: string;
  /** Default max score if extraction fails */
  maxScoreDefault: string;
}

/**
 * Complete site profile with extraction configuration.
 * Extends the base SiteProfile with additional extraction details.
 */
export interface SiteProfileWithExtraction extends SiteProfile {
  /** Extraction configuration for response and max score */
  extraction: ExtractionConfig;
}

/**
 * CRUD operations interface for site profile storage.
 * Abstracts the underlying storage mechanism (SQLite, localStorage, etc.).
 */
export interface ProfileStorage {
  /**
   * Load all profiles (built-in + saved).
   * @returns Promise resolving to array of all profiles
   */
  listProfiles(): Promise<SiteProfile[]>;

  /**
   * Get a single profile by ID.
   * @param id - Profile identifier
   * @returns Promise resolving to profile or null if not found
   */
  getProfile(id: string): Promise<SiteProfile | null>;

  /**
   * Save a new or updated profile.
   * @param profile - Profile object to save
   * @returns Promise resolving when save completes
   */
  saveProfile(profile: SiteProfile): Promise<void>;

  /**
   * Delete a profile by ID.
   * @param id - Profile identifier
   * @returns Promise resolving when delete completes
   */
  deleteProfile(id: string): Promise<void>;

  /**
   * Find profiles matching a URL.
   * @param url - URL to match against urlPatterns
   * @returns Promise resolving to array of matching profiles
   */
  findProfilesByUrl(url: string): Promise<SiteProfile[]>;

  /**
   * Get all built-in profiles.
   * @returns Promise resolving to array of built-in profiles
   */
  getBuiltInProfiles(): Promise<SiteProfile[]>;

  /**
   * Get all user-created (non-built-in) profiles.
   * @returns Promise resolving to array of saved profiles
   */
  getSavedProfiles(): Promise<SiteProfile[]>;
}

/**
 * Built-in MyOpenMath profile.
 * Default profile for MyOpenMath grading pages.
 */
export const DEFAULT_MYOPENMATH_PROFILE: SiteProfileWithExtraction = {
  id: 'myopenmath',
  name: 'MyOpenMath',
  isBuiltIn: true,
  urlPatterns: [
    'gradeallq2.php',
    'myopenmath.com',
    'demo-grading-page.html',
    'mock-myopenmath',
  ],
  selectors: {
    studentSection: 'div[data-lastchange]',
    studentName: 'b',
    questionRegion: 'div[role="region"][aria-label^="Question"]',
    scoreInput: 'input[aria-label="Score"]',
    feedbackBox: 'div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]',
    feedbackHidden: 'input[type="hidden"][name^="fb-"]',
    fullCreditLink: 'a.fullcredlink',
  },
  extraction: {
    responseMethod: 'childIndex',
    responsePath: 'questionRegion.children[1].children[1]',
    maxScoreMethod: 'parentTextRegex',
    maxScoreRegex: '\\/(\\d+\\.?\\d*)',
    maxScoreDefault: '10',
  },
  navigation: {
    mode: 'batch',
  },
  feedback: {
    type: 'tinymce-inline',
    requiresHiddenSync: true,
    htmlWrap: true,
  },
  save: {
    buttonText: 'Quick Save',
    fallbackText: 'Save Changes',
  },
};

/**
 * Built-in Canvas SpeedGrader profile.
 * Profile for Canvas LMS SpeedGrader sequential grading.
 */
export const DEFAULT_CANVAS_SPEEDGRADER_PROFILE: SiteProfileWithExtraction = {
  id: 'canvas-speedgrader',
  name: 'Canvas SpeedGrader',
  isBuiltIn: true,
  urlPatterns: ['speed_grader', 'speedgrader'],
  selectors: {
    studentSection: null,
    studentName: '[data-testid="student-select-trigger"]',
    questionRegion: '#submission-preview-iframe',
    scoreInput: '[data-testid="grade-input"]',
    feedbackBox: null,
    feedbackHidden: null,
    fullCreditLink: null,
  },
  extraction: {
    responseMethod: 'iframe',
    iframeSelector: '#submission-preview-iframe',
    maxScoreMethod: 'inputLabel',
    maxScorePattern: 'Grade out of (\\d+)',
    maxScoreDefault: '100',
  },
  navigation: {
    mode: 'sequential',
    nextButton: '[data-testid="next-student-button"]',
    prevButton: '[data-testid="previous-student-button"]',
    studentIndicator: '[data-testid="student-select-trigger"]',
    waitAfterNavMs: 2000,
    waitForSelector: '[data-testid="grade-input"]',
    submitPerStudent: true,
    submitButton: '[data-testid="submit-comment-button"]',
  },
  feedback: {
    type: 'tinymce-iframe',
    requiresHiddenSync: false,
    htmlWrap: true,
  },
  save: {
    buttonText: 'Submit',
    fallbackText: 'Save',
  },
};

/**
 * Array of all built-in profiles.
 */
export const BUILT_IN_PROFILES: SiteProfileWithExtraction[] = [
  DEFAULT_MYOPENMATH_PROFILE,
  DEFAULT_CANVAS_SPEEDGRADER_PROFILE,
];

// ============================================================================
// URL Matching Implementation
// ============================================================================

/**
 * Find profiles matching a URL using substring matching.
 * Returns profiles sorted by pattern specificity (longest pattern wins).
 *
 * @param url - URL to match against profile urlPatterns
 * @param profiles - Array of profiles to search
 * @returns Array of matching profiles sorted by pattern length (most specific first)
 */
export function findProfilesByUrl(url: string, profiles: SiteProfile[]): SiteProfile[] {
  const matches: Array<{ profile: SiteProfile; patternLength: number }> = [];

  for (const profile of profiles) {
    for (const pattern of profile.urlPatterns) {
      if (url.includes(pattern)) {
        matches.push({ profile, patternLength: pattern.length });
        break; // Only count each profile once, even if multiple patterns match
      }
    }
  }

  // Sort by pattern length descending (longest/most specific first)
  matches.sort((a, b) => b.patternLength - a.patternLength);

  // Return unique profiles (remove duplicates if any)
  const seen = new Set<string>();
  return matches
    .filter((match) => {
      if (seen.has(match.profile.id)) return false;
      seen.add(match.profile.id);
      return true;
    })
    .map((match) => match.profile);
}

// ============================================================================
// Serialization Helpers (Domain ↔ DB)
// ============================================================================

/**
 * Serialize a domain SiteProfile to the flat DB row format.
 * Converts structured objects (urlPatterns, selectors, etc.) to JSON strings.
 */
function serializeProfile(profile: SiteProfile): {
  id: string;
  name: string;
  url_patterns: string;
  selectors: string;
  feedback: string;
  save: string;
  navigation: string;
  extraction: string | null;
} {
  const ext = (profile as SiteProfileWithExtraction).extraction;
  return {
    id: profile.id,
    name: profile.name,
    url_patterns: JSON.stringify(profile.urlPatterns),
    selectors: JSON.stringify(profile.selectors),
    feedback: JSON.stringify(profile.feedback),
    save: JSON.stringify(profile.save),
    navigation: JSON.stringify(profile.navigation),
    extraction: ext ? JSON.stringify(ext) : null,
  };
}

/**
 * Deserialize a DB row back to a domain SiteProfile.
 * Parses JSON strings back into structured objects. DB profiles are never built-in.
 */
function deserializeProfile(row: DbSiteProfileRow): SiteProfile {
  const base: SiteProfile = {
    id: row.id,
    name: row.name,
    isBuiltIn: false,
    urlPatterns: JSON.parse(row.url_patterns),
    selectors: JSON.parse(row.selectors),
    feedback: JSON.parse(row.feedback),
    save: JSON.parse(row.save),
    navigation: JSON.parse(row.navigation),
  };
  if (row.extraction) {
    (base as SiteProfileWithExtraction).extraction = JSON.parse(row.extraction);
  }
  return base;
}

// ============================================================================
// ProfileStorage Implementation (SQLite-backed)
// ============================================================================

/**
 * SQLite-backed implementation of ProfileStorage.
 * Merges built-in profiles with user-created profiles stored in the database.
 */
export class ProfileStorageImpl implements ProfileStorage {
  /**
   * Load all profiles: built-in profiles first, then user-saved profiles from DB.
   * DB rows with IDs matching built-in profiles are skipped to prevent duplicates.
   */
  async listProfiles(): Promise<SiteProfile[]> {
    const builtInIds = new Set(BUILT_IN_PROFILES.map((p) => p.id));
    const dbRows = await dbGetSiteProfiles();
    const savedProfiles = dbRows
      .filter((row) => !builtInIds.has(row.id))
      .map(deserializeProfile);
    return [...BUILT_IN_PROFILES, ...savedProfiles];
  }

  /**
   * Get a single profile by ID. Checks built-in profiles first, then DB.
   */
  async getProfile(id: string): Promise<SiteProfile | null> {
    const builtIn = BUILT_IN_PROFILES.find((p) => p.id === id);
    if (builtIn) return builtIn;

    const dbRow = await dbGetSiteProfile(id);
    return dbRow ? deserializeProfile(dbRow) : null;
  }

  /**
   * Save a profile to the database. Serializes structured fields to JSON.
   */
  async saveProfile(profile: SiteProfile): Promise<void> {
    await dbSaveSiteProfile(serializeProfile(profile));
    // Fire-and-forget sync to grading server (errors silently swallowed)
    syncProfileToServer(profile).catch(() => {});
  }

  /**
   * Delete a profile from the database by ID.
   */
  async deleteProfile(id: string): Promise<void> {
    await dbDeleteSiteProfile(id);
  }

  /**
   * Find profiles matching a URL across both built-in and saved profiles.
   * Returns results sorted by pattern specificity (longest match first).
   */
  async findProfilesByUrl(url: string): Promise<SiteProfile[]> {
    const allProfiles = await this.listProfiles();
    return findProfilesByUrl(url, allProfiles);
  }

  /**
   * Get only the built-in profiles (not from DB).
   */
  async getBuiltInProfiles(): Promise<SiteProfile[]> {
    return [...BUILT_IN_PROFILES];
  }

  /**
   * Get only user-created profiles from the database.
   */
  async getSavedProfiles(): Promise<SiteProfile[]> {
    const builtInIds = new Set(BUILT_IN_PROFILES.map((p) => p.id));
    const dbRows = await dbGetSiteProfiles();
    return dbRows
      .filter((row) => !builtInIds.has(row.id))
      .map(deserializeProfile);
  }
}
