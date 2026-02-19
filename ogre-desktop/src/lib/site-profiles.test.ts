/**
 * site-profiles.test.ts - Type validation and interface tests
 *
 * TDD approach: Tests define expected behavior before implementation.
 * ProfileStorage is implemented with SQLite via db.ts (mocked for tests).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SiteProfile,
  SiteSelectors,
  FeedbackConfig,
  SaveConfig,
  NavigationConfig,
  ExtractionConfig,
  SiteProfileWithExtraction,
  ProfileStorage,
} from './site-profiles';
import {
  DEFAULT_MYOPENMATH_PROFILE,
  DEFAULT_CANVAS_SPEEDGRADER_PROFILE,
  BUILT_IN_PROFILES,
  findProfilesByUrl,
  ProfileStorageImpl,
} from './site-profiles';

// ============================================================================
// Mock db.ts — in-memory store replaces SQLite for testing
// ============================================================================

const { mockStore } = vi.hoisted(() => ({
  mockStore: new Map<string, any>(),
}));

vi.mock('./db', () => ({
  getSiteProfiles: vi.fn(async () => [...mockStore.values()]),
  getSiteProfile: vi.fn(async (id: string) => mockStore.get(id) ?? null),
  saveSiteProfile: vi.fn(async (profile: any) => {
    const id = profile.id || crypto.randomUUID();
    mockStore.set(id, {
      ...profile,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return id;
  }),
  deleteSiteProfile: vi.fn(async (id: string) => {
    mockStore.delete(id);
  }),
}));

// ============================================================================
// Type Validation Tests
// ============================================================================

describe('SiteProfile Type Validation', () => {
  it('should have required SiteProfile properties', () => {
    const profile: SiteProfile = {
      id: 'test-profile',
      name: 'Test Profile',
      isBuiltIn: false,
      urlPatterns: ['test.com'],
      selectors: {
        studentSection: '.student',
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: '.feedback',
      },
      feedback: {
        type: 'textarea',
        requiresHiddenSync: false,
        htmlWrap: false,
      },
      save: {
        buttonText: 'Save',
        fallbackText: 'Submit',
      },
      navigation: {
        mode: 'batch',
      },
    };

    expect(profile.id).toBe('test-profile');
    expect(profile.name).toBe('Test Profile');
    expect(profile.isBuiltIn).toBe(false);
    expect(profile.urlPatterns).toContain('test.com');
  });

  it('should validate SiteSelectors with nullable fields', () => {
    const selectors: SiteSelectors = {
      studentSection: 'div.student',
      studentName: 'span.name',
      scoreInput: 'input[type="number"]',
      feedbackBox: 'textarea.feedback',
      feedbackHidden: null,
      questionRegion: null,
      fullCreditLink: null,
    };

    expect(selectors.studentSection).toBeTruthy();
    expect(selectors.feedbackHidden).toBeNull();
  });

  it('should validate FeedbackConfig types', () => {
    const feedbackConfigs: FeedbackConfig[] = [
      { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true },
      { type: 'tinymce-iframe', requiresHiddenSync: false, htmlWrap: true },
      { type: 'contenteditable', requiresHiddenSync: false, htmlWrap: false },
      { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
    ];

    expect(feedbackConfigs).toHaveLength(4);
    feedbackConfigs.forEach((config) => {
      expect(['tinymce-inline', 'tinymce-iframe', 'contenteditable', 'textarea']).toContain(
        config.type
      );
      expect(typeof config.requiresHiddenSync).toBe('boolean');
      expect(typeof config.htmlWrap).toBe('boolean');
    });
  });

  it('should validate SaveConfig structure', () => {
    const saveConfig: SaveConfig = {
      buttonText: 'Quick Save',
      fallbackText: 'Save Changes',
    };

    expect(saveConfig.buttonText).toBeTruthy();
    expect(saveConfig.fallbackText).toBeTruthy();
  });

  it('should validate NavigationConfig modes', () => {
    const batchNav: NavigationConfig = { mode: 'batch' };
    const sequentialNav: NavigationConfig = {
      mode: 'sequential',
      nextButton: '.next',
      prevButton: '.prev',
      waitAfterNavMs: 1000,
    };

    expect(['batch', 'sequential']).toContain(batchNav.mode);
    expect(['batch', 'sequential']).toContain(sequentialNav.mode);
  });

  it('should validate ExtractionConfig response methods', () => {
    const configs: ExtractionConfig[] = [
      {
        responseMethod: 'childIndex',
        responsePath: 'parent.children[0]',
        maxScoreMethod: 'parentTextRegex',
        maxScoreRegex: '/(\\d+)',
        maxScoreDefault: '10',
      },
      {
        responseMethod: 'iframe',
        iframeSelector: '#content-iframe',
        maxScoreMethod: 'inputLabel',
        maxScorePattern: 'Grade out of (\\d+)',
        maxScoreDefault: '100',
      },
      {
        responseMethod: 'selector',
        responseSelector: '.student-response',
        maxScoreMethod: 'selector',
        maxScoreSelector: '.max-score',
        maxScoreDefault: '50',
      },
    ];

    configs.forEach((config) => {
      expect(['childIndex', 'iframe', 'selector']).toContain(config.responseMethod);
      expect(['parentTextRegex', 'inputLabel', 'selector']).toContain(config.maxScoreMethod);
      expect(config.maxScoreDefault).toBeTruthy();
    });
  });
});

// ============================================================================
// Built-in Profile Tests
// ============================================================================

describe('Built-in Profiles', () => {
  it('should have MyOpenMath profile with correct structure', () => {
    expect(DEFAULT_MYOPENMATH_PROFILE.id).toBe('myopenmath');
    expect(DEFAULT_MYOPENMATH_PROFILE.name).toBe('MyOpenMath');
    expect(DEFAULT_MYOPENMATH_PROFILE.isBuiltIn).toBe(true);
    expect(DEFAULT_MYOPENMATH_PROFILE.urlPatterns).toContain('gradeallq2.php');
    expect(DEFAULT_MYOPENMATH_PROFILE.navigation.mode).toBe('batch');
    expect(DEFAULT_MYOPENMATH_PROFILE.feedback.type).toBe('tinymce-inline');
  });

  it('should have Canvas SpeedGrader profile with correct structure', () => {
    expect(DEFAULT_CANVAS_SPEEDGRADER_PROFILE.id).toBe('canvas-speedgrader');
    expect(DEFAULT_CANVAS_SPEEDGRADER_PROFILE.name).toBe('Canvas SpeedGrader');
    expect(DEFAULT_CANVAS_SPEEDGRADER_PROFILE.isBuiltIn).toBe(true);
    expect(DEFAULT_CANVAS_SPEEDGRADER_PROFILE.urlPatterns).toContain('speed_grader');
    expect(DEFAULT_CANVAS_SPEEDGRADER_PROFILE.navigation.mode).toBe('sequential');
    expect(DEFAULT_CANVAS_SPEEDGRADER_PROFILE.feedback.type).toBe('tinymce-iframe');
  });

  it('should have BUILT_IN_PROFILES array with both profiles', () => {
    expect(BUILT_IN_PROFILES).toHaveLength(2);
    expect(BUILT_IN_PROFILES[0].id).toBe('myopenmath');
    expect(BUILT_IN_PROFILES[1].id).toBe('canvas-speedgrader');
  });

  it('should have extraction config in built-in profiles', () => {
    const myopenmath = DEFAULT_MYOPENMATH_PROFILE as SiteProfileWithExtraction;
    expect(myopenmath.extraction).toBeDefined();
    expect(myopenmath.extraction.responseMethod).toBe('childIndex');
    expect(myopenmath.extraction.maxScoreMethod).toBe('parentTextRegex');

    const canvas = DEFAULT_CANVAS_SPEEDGRADER_PROFILE as SiteProfileWithExtraction;
    expect(canvas.extraction).toBeDefined();
    expect(canvas.extraction.responseMethod).toBe('iframe');
    expect(canvas.extraction.maxScoreMethod).toBe('inputLabel');
  });
});

// ============================================================================
// ProfileStorage Interface Tests (TDD - will fail until implemented)
// ============================================================================

describe('ProfileStorage CRUD', () => {
  let storage: ProfileStorage;

  const TEST_PROFILE: SiteProfile = {
    id: 'test-profile',
    name: 'Test Profile',
    isBuiltIn: false,
    urlPatterns: ['test.example.com'],
    selectors: {
      studentSection: '.student',
      studentName: '.name',
      scoreInput: '.score',
      feedbackBox: '.feedback',
    },
    feedback: {
      type: 'textarea',
      requiresHiddenSync: false,
      htmlWrap: false,
    },
    save: {
      buttonText: 'Save',
      fallbackText: 'Submit',
    },
    navigation: {
      mode: 'batch',
    },
  };

  beforeEach(() => {
    mockStore.clear();
    storage = new ProfileStorageImpl();
  });

  it('should list all profiles including built-in', async () => {
    const profiles = await storage.listProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(2);
    expect(profiles.some((p) => p.id === 'myopenmath')).toBe(true);
    expect(profiles.some((p) => p.id === 'canvas-speedgrader')).toBe(true);
  });

  it('should get a profile by ID', async () => {
    const profile = await storage.getProfile('myopenmath');
    expect(profile).not.toBeNull();
    expect(profile!.id).toBe('myopenmath');
    expect(profile!.name).toBe('MyOpenMath');

    const notFound = await storage.getProfile('nonexistent');
    expect(notFound).toBeNull();
  });

  it('should save a new profile', async () => {
    await storage.saveProfile(TEST_PROFILE);
    const retrieved = await storage.getProfile('test-profile');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('Test Profile');
    expect(retrieved!.urlPatterns).toContain('test.example.com');
  });

  it('should delete a profile by ID', async () => {
    await storage.saveProfile(TEST_PROFILE);
    let retrieved = await storage.getProfile('test-profile');
    expect(retrieved).not.toBeNull();

    await storage.deleteProfile('test-profile');
    retrieved = await storage.getProfile('test-profile');
    expect(retrieved).toBeNull();
  });

  it('should find profiles by URL pattern matching', async () => {
    const matches = await storage.findProfilesByUrl(
      'https://myopenmath.com/gradeallq2.php?id=123'
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should return only built-in profiles from getBuiltInProfiles', async () => {
    await storage.saveProfile(TEST_PROFILE);
    const builtIn = await storage.getBuiltInProfiles();
    expect(builtIn.every((p) => p.isBuiltIn === true)).toBe(true);
    expect(builtIn.some((p) => p.id === 'test-profile')).toBe(false);
  });

  it('should return only saved profiles from getSavedProfiles', async () => {
    await storage.saveProfile(TEST_PROFILE);
    const saved = await storage.getSavedProfiles();
    expect(saved.every((p) => p.isBuiltIn === false)).toBe(true);
    expect(saved.some((p) => p.id === 'test-profile')).toBe(true);
    expect(saved.some((p) => p.id === 'myopenmath')).toBe(false);
  });
});

// ============================================================================
// Type Compatibility Tests
// ============================================================================

describe('Type Compatibility', () => {
  it('should allow SiteProfileWithExtraction to be used as SiteProfile', () => {
    const profile: SiteProfile = DEFAULT_MYOPENMATH_PROFILE;
    expect(profile.id).toBe('myopenmath');
    expect(profile.isBuiltIn).toBe(true);
  });

  it('should validate profile URL pattern matching logic', () => {
    const profile = DEFAULT_MYOPENMATH_PROFILE;
    const testUrls = [
      'https://myopenmath.com/gradeallq2.php?id=123',
      'https://demo.myopenmath.com/mock-myopenmath',
      'https://example.com/demo-grading-page.html',
    ];

    testUrls.forEach((url) => {
      const matches = profile.urlPatterns.some((pattern) => url.includes(pattern));
      expect(matches).toBe(true);
    });
  });

  it('should validate selector nullability', () => {
    const selectors: SiteSelectors = {
      studentSection: null,
      studentName: null,
      scoreInput: null,
      feedbackBox: null,
    };

    expect(selectors.studentSection).toBeNull();
    expect(selectors.studentName).toBeNull();
  });
});

// ============================================================================
// URL Matching Tests
// ============================================================================

describe('findProfilesByUrl - URL Pattern Matching', () => {
  it('should match MyOpenMath profile by gradeallq2.php', () => {
    const url = 'https://myopenmath.com/gradeallq2.php?id=123';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should match MyOpenMath profile by myopenmath.com domain', () => {
    const url = 'https://myopenmath.com/courses/123/assignments/456';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should match Canvas SpeedGrader by speed_grader', () => {
    const url = 'https://canvas.example.com/courses/123/speed_grader?assignment_id=456';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('canvas-speedgrader');
  });

  it('should match Canvas SpeedGrader by speedgrader', () => {
    const url = 'https://canvas.example.com/speedgrader?assignment_id=456';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('canvas-speedgrader');
  });

  it('should return empty array for unknown URL', () => {
    const url = 'https://unknown-platform.com/grading';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(0);
  });

  it('should return most specific match (longest pattern)', () => {
    // Create a custom profile with more specific pattern
    const customProfile: SiteProfile = {
      id: 'custom-myopenmath',
      name: 'Custom MyOpenMath',
      isBuiltIn: false,
      urlPatterns: ['myopenmath.com/courses/123/gradeallq2.php'], // More specific
      selectors: {
        studentSection: '.student',
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: '.feedback',
      },
      feedback: {
        type: 'textarea',
        requiresHiddenSync: false,
        htmlWrap: false,
      },
      save: {
        buttonText: 'Save',
        fallbackText: 'Submit',
      },
      navigation: {
        mode: 'batch',
      },
    };

    const url = 'https://myopenmath.com/courses/123/gradeallq2.php?id=789';
    const allProfiles = [...BUILT_IN_PROFILES, customProfile];
    const matches = findProfilesByUrl(url, allProfiles);

    // Should return custom profile first (longer pattern)
    expect(matches).toHaveLength(2);
    expect(matches[0].id).toBe('custom-myopenmath');
    expect(matches[1].id).toBe('myopenmath');
  });

  it('should handle multiple matching patterns in same profile', () => {
    const url = 'https://myopenmath.com/gradeallq2.php';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    // Should match MyOpenMath (has both 'myopenmath.com' and 'gradeallq2.php')
    // but return profile only once
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should match with case-insensitive domain but case-sensitive path', () => {
    // URL domains are case-insensitive, but paths are case-sensitive
    const url = 'https://MyOpenMath.com/gradeallq2.php'; // Capital M in domain
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    // Should match because 'gradeallq2.php' is in the URL (path is case-sensitive)
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should NOT match if path case differs from pattern', () => {
    // Create a profile with specific lowercase pattern
    const caseProfile: SiteProfile = {
      id: 'case-test',
      name: 'Case Test',
      isBuiltIn: false,
      urlPatterns: ['GradeAllQ2.php'], // Specific case
      selectors: {
        studentSection: '.student',
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: '.feedback',
      },
      feedback: {
        type: 'textarea',
        requiresHiddenSync: false,
        htmlWrap: false,
      },
      save: {
        buttonText: 'Save',
        fallbackText: 'Submit',
      },
      navigation: {
        mode: 'batch',
      },
    };

    const url = 'https://example.com/gradeallq2.php'; // lowercase in URL
    const matches = findProfilesByUrl(url, [caseProfile]);

    // Should NOT match because 'GradeAllQ2.php' (capital) is not in URL
    expect(matches).toHaveLength(0);
  });

  it('should match demo-grading-page.html pattern', () => {
    const url = 'https://example.com/demo-grading-page.html';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should match mock-myopenmath pattern', () => {
    const url = 'https://example.com/mock-myopenmath';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should handle empty profile array', () => {
    const url = 'https://myopenmath.com/gradeallq2.php';
    const matches = findProfilesByUrl(url, []);

    expect(matches).toHaveLength(0);
  });

  it('should handle URL with query parameters and fragments', () => {
    const url = 'https://myopenmath.com/gradeallq2.php?id=123&section=2#top';
    const matches = findProfilesByUrl(url, BUILT_IN_PROFILES);

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('myopenmath');
  });

  it('should sort multiple matches by pattern specificity', () => {
    // Create two custom profiles with different pattern lengths
    const shortPattern: SiteProfile = {
      id: 'short-pattern',
      name: 'Short Pattern',
      isBuiltIn: false,
      urlPatterns: ['math.com'],
      selectors: {
        studentSection: '.student',
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: '.feedback',
      },
      feedback: {
        type: 'textarea',
        requiresHiddenSync: false,
        htmlWrap: false,
      },
      save: {
        buttonText: 'Save',
        fallbackText: 'Submit',
      },
      navigation: {
        mode: 'batch',
      },
    };

    const longPattern: SiteProfile = {
      id: 'long-pattern',
      name: 'Long Pattern',
      isBuiltIn: false,
      urlPatterns: ['myopenmath.com/courses/123/gradeallq2.php'],
      selectors: {
        studentSection: '.student',
        studentName: '.name',
        scoreInput: '.score',
        feedbackBox: '.feedback',
      },
      feedback: {
        type: 'textarea',
        requiresHiddenSync: false,
        htmlWrap: false,
      },
      save: {
        buttonText: 'Save',
        fallbackText: 'Submit',
      },
      navigation: {
        mode: 'batch',
      },
    };

    const url = 'https://myopenmath.com/courses/123/gradeallq2.php';
    const allProfiles = [shortPattern, longPattern];
    const matches = findProfilesByUrl(url, allProfiles);

    expect(matches).toHaveLength(2);
    expect(matches[0].id).toBe('long-pattern'); // Longer pattern first
    expect(matches[1].id).toBe('short-pattern');
  });
});
