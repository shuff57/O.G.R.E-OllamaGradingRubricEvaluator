import { describe, it, expect, beforeEach } from 'vitest';
import type { SiteProfile, SiteSelectors } from './batch-grader';
import type { ProfileStorage, ExtractionConfig } from './site-profiles';
import type { DiscoveryResult } from './discover';
import {
  mergeDiscoveryWithProfile,
  applyMergePlan,
  updateProfileSelector,
  addUrlPattern,
  mergeProfiles,
  updateSelector,
  reDiscoverProfile,
  type SelectorDiff,
  type ProfileMergePlan,
} from './profile-editor';

// ============================================================================
// In-memory ProfileStorage mock
// ============================================================================

class MockProfileStorage implements ProfileStorage {
  private profiles = new Map<string, SiteProfile>();
  saveCount = 0;
  lastSaved: SiteProfile | null = null;

  constructor(initial: SiteProfile[] = []) {
    for (const p of initial) {
      this.profiles.set(p.id, structuredClone(p));
    }
  }

  async listProfiles(): Promise<SiteProfile[]> {
    return [...this.profiles.values()];
  }

  async getProfile(id: string): Promise<SiteProfile | null> {
    return this.profiles.get(id) ?? null;
  }

  async saveProfile(profile: SiteProfile): Promise<void> {
    this.profiles.set(profile.id, structuredClone(profile));
    this.saveCount++;
    this.lastSaved = structuredClone(profile);
  }

  async deleteProfile(id: string): Promise<void> {
    this.profiles.delete(id);
  }

  async findProfilesByUrl(url: string): Promise<SiteProfile[]> {
    return [...this.profiles.values()].filter((p) =>
      p.urlPatterns.some((pat) => url.includes(pat)),
    );
  }

  async getBuiltInProfiles(): Promise<SiteProfile[]> {
    return [...this.profiles.values()].filter((p) => p.isBuiltIn);
  }

  async getSavedProfiles(): Promise<SiteProfile[]> {
    return [...this.profiles.values()].filter((p) => !p.isBuiltIn);
  }
}

// ============================================================================
// Fixtures
// ============================================================================

function makeProfile(overrides?: Partial<SiteProfile>): SiteProfile {
  return {
    id: 'test-profile-1',
    name: 'Test Profile',
    isBuiltIn: false,
    urlPatterns: ['example.com/grade'],
    selectors: {
      studentSection: 'div.student',
      studentName: 'span.name',
      scoreInput: 'input.score',
      feedbackBox: 'textarea.fb',
      feedbackHidden: null,
      questionRegion: 'div.question',
      fullCreditLink: null,
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
    ...overrides,
  };
}

function makeBuiltInProfile(): SiteProfile {
  return makeProfile({ id: 'builtin-1', isBuiltIn: true });
}

function makeDiscoveryResult(selectorOverrides?: Partial<DiscoveryResult['selectors']>): DiscoveryResult {
  return {
    navigation: { mode: 'batch' },
    selectors: {
      studentSection: 'div.student',
      studentName: 'span.name',
      scoreInput: 'input.score',
      feedbackBox: 'textarea.fb',
      feedbackHidden: null,
      questionRegion: 'div.question',
      fullCreditLink: null,
      ...selectorOverrides,
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
    confidence: 'high',
  };
}

// ============================================================================
// mergeDiscoveryWithProfile
// ============================================================================

describe('mergeDiscoveryWithProfile', () => {
  it('marks unchanged selectors as keep-old', () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult(); // identical selectors

    const plan = mergeDiscoveryWithProfile(profile, discovery);

    expect(plan.profileId).toBe('test-profile-1');
    for (const diff of plan.diffs) {
      expect(diff.decision).toBe('keep-old');
    }
  });

  it('marks changed selectors as pending', () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult({
      scoreInput: 'input[name="new-score"]',
    });

    const plan = mergeDiscoveryWithProfile(profile, discovery);

    const scoreDiff = plan.diffs.find((d) => d.key === 'scoreInput');
    expect(scoreDiff).toBeDefined();
    expect(scoreDiff!.decision).toBe('pending');
    expect(scoreDiff!.oldValue).toBe('input.score');
    expect(scoreDiff!.newValue).toBe('input[name="new-score"]');
  });

  it('marks new field (old undefined, new present) as pending', () => {
    const profile = makeProfile({
      selectors: {
        studentSection: 'div.student',
        studentName: 'span.name',
        scoreInput: 'input.score',
        feedbackBox: null,
        feedbackHidden: null,
        questionRegion: null,
        fullCreditLink: null,
      },
    });
    const discovery = makeDiscoveryResult({
      feedbackBox: 'div[contenteditable]',
    });

    const plan = mergeDiscoveryWithProfile(profile, discovery);

    const fbDiff = plan.diffs.find((d) => d.key === 'feedbackBox');
    expect(fbDiff).toBeDefined();
    expect(fbDiff!.decision).toBe('pending');
    expect(fbDiff!.oldValue).toBeUndefined();
    expect(fbDiff!.newValue).toBe('div[contenteditable]');
  });

  it('marks removed field (old present, new undefined) as pending', () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult({
      questionRegion: null,
    });

    const plan = mergeDiscoveryWithProfile(profile, discovery);

    const qrDiff = plan.diffs.find((d) => d.key === 'questionRegion');
    expect(qrDiff).toBeDefined();
    expect(qrDiff!.decision).toBe('pending');
    expect(qrDiff!.oldValue).toBe('div.question');
    expect(qrDiff!.newValue).toBeUndefined();
  });

  it('covers all selector keys', () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult();
    const plan = mergeDiscoveryWithProfile(profile, discovery);

    const keys = plan.diffs.map((d) => d.key);
    expect(keys).toContain('studentSection');
    expect(keys).toContain('studentName');
    expect(keys).toContain('scoreInput');
    expect(keys).toContain('feedbackBox');
    expect(keys).toContain('feedbackHidden');
    expect(keys).toContain('questionRegion');
    expect(keys).toContain('fullCreditLink');
  });

  it('produces null extractionDiff when neither has extraction', () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult();

    const plan = mergeDiscoveryWithProfile(profile, discovery);
    expect(plan.extractionDiff).toBeNull();
  });

  it('produces extractionDiff when existing profile has extraction but discovery does not', () => {
    const extraction: ExtractionConfig = {
      responseMethod: 'childIndex',
      responsePath: 'q.children[0]',
      maxScoreMethod: 'parentTextRegex',
      maxScoreRegex: '\\/(\\d+)',
      maxScoreDefault: '10',
    };
    const profileWithExt = { ...makeProfile(), extraction } as SiteProfile;
    const discovery = makeDiscoveryResult();

    const plan = mergeDiscoveryWithProfile(profileWithExt, discovery);
    expect(plan.extractionDiff).not.toBeNull();
    expect(plan.extractionDiff!.old).toEqual(extraction);
    expect(plan.extractionDiff!.new).toBeNull();
  });
});

// ============================================================================
// applyMergePlan
// ============================================================================

describe('applyMergePlan', () => {
  let storage: MockProfileStorage;
  let profile: SiteProfile;

  beforeEach(() => {
    profile = makeProfile();
    storage = new MockProfileStorage([profile]);
  });

  it('applies use-new decisions to selectors', async () => {
    const plan: ProfileMergePlan = {
      profileId: profile.id,
      diffs: [
        { key: 'scoreInput', oldValue: 'input.score', newValue: 'input[name="new"]', decision: 'use-new' },
        { key: 'studentName', oldValue: 'span.name', newValue: 'span.name', decision: 'keep-old' },
      ],
      extractionDiff: null,
    };

    const result = await applyMergePlan(plan, profile, storage);

    expect(result.selectors.scoreInput).toBe('input[name="new"]');
    expect(result.selectors.studentName).toBe('span.name');
    expect(storage.saveCount).toBe(1);
  });

  it('keeps old values for keep-old decisions', async () => {
    const plan: ProfileMergePlan = {
      profileId: profile.id,
      diffs: [
        { key: 'feedbackBox', oldValue: 'textarea.fb', newValue: 'div.new-fb', decision: 'keep-old' },
      ],
      extractionDiff: null,
    };

    const result = await applyMergePlan(plan, profile, storage);
    expect(result.selectors.feedbackBox).toBe('textarea.fb');
  });

  it('treats pending decisions as keep-old (safe default)', async () => {
    const plan: ProfileMergePlan = {
      profileId: profile.id,
      diffs: [
        { key: 'scoreInput', oldValue: 'input.score', newValue: 'input.new', decision: 'pending' },
      ],
      extractionDiff: null,
    };

    const result = await applyMergePlan(plan, profile, storage);
    expect(result.selectors.scoreInput).toBe('input.score');
  });

  it('applies use-new with undefined newValue (sets null)', async () => {
    const plan: ProfileMergePlan = {
      profileId: profile.id,
      diffs: [
        { key: 'questionRegion', oldValue: 'div.question', newValue: undefined, decision: 'use-new' },
      ],
      extractionDiff: null,
    };

    const result = await applyMergePlan(plan, profile, storage);
    expect(result.selectors.questionRegion).toBeNull();
  });

  it('saves the updated profile to storage', async () => {
    const plan: ProfileMergePlan = {
      profileId: profile.id,
      diffs: [
        { key: 'scoreInput', oldValue: 'input.score', newValue: 'input.v2', decision: 'use-new' },
      ],
      extractionDiff: null,
    };

    await applyMergePlan(plan, profile, storage);

    const stored = await storage.getProfile(profile.id);
    expect(stored).not.toBeNull();
    expect(stored!.selectors.scoreInput).toBe('input.v2');
  });
});

// ============================================================================
// updateProfileSelector
// ============================================================================

describe('updateProfileSelector', () => {
  let storage: MockProfileStorage;
  let profile: SiteProfile;

  beforeEach(() => {
    profile = makeProfile();
    storage = new MockProfileStorage([profile]);
  });

  it('updates the correct selector field', async () => {
    const result = await updateProfileSelector(
      profile.id,
      'scoreInput',
      'input[data-testid="grade"]',
      storage,
    );

    expect(result.selectors.scoreInput).toBe('input[data-testid="grade"]');
    // Other selectors unchanged
    expect(result.selectors.studentName).toBe('span.name');
    expect(result.selectors.feedbackBox).toBe('textarea.fb');
  });

  it('saves the updated profile to storage', async () => {
    await updateProfileSelector(profile.id, 'studentName', 'b.fullname', storage);

    expect(storage.saveCount).toBe(1);
    const stored = await storage.getProfile(profile.id);
    expect(stored!.selectors.studentName).toBe('b.fullname');
  });

  it('throws for non-existent profile', async () => {
    await expect(
      updateProfileSelector('nonexistent-id', 'scoreInput', 'input', storage),
    ).rejects.toThrow('Profile not found: nonexistent-id');
  });

  it('throws for built-in profile', async () => {
    const builtIn = makeBuiltInProfile();
    storage = new MockProfileStorage([builtIn]);

    await expect(
      updateProfileSelector(builtIn.id, 'scoreInput', 'input', storage),
    ).rejects.toThrow('Cannot edit built-in profile');
  });

  it('preserves other profile properties', async () => {
    const result = await updateProfileSelector(
      profile.id,
      'scoreInput',
      'input.new',
      storage,
    );

    expect(result.id).toBe(profile.id);
    expect(result.name).toBe(profile.name);
    expect(result.urlPatterns).toEqual(profile.urlPatterns);
    expect(result.feedback).toEqual(profile.feedback);
    expect(result.save).toEqual(profile.save);
    expect(result.navigation).toEqual(profile.navigation);
  });
});

// ============================================================================
// addUrlPattern
// ============================================================================

describe('addUrlPattern', () => {
  let storage: MockProfileStorage;
  let profile: SiteProfile;

  beforeEach(() => {
    profile = makeProfile();
    storage = new MockProfileStorage([profile]);
  });

  it('adds a new URL pattern', async () => {
    const result = await addUrlPattern(profile.id, 'example.com/quiz', storage);

    expect(result.urlPatterns).toContain('example.com/quiz');
    expect(result.urlPatterns).toContain('example.com/grade');
    expect(result.urlPatterns).toHaveLength(2);
  });

  it('deduplicates existing patterns', async () => {
    const result = await addUrlPattern(profile.id, 'example.com/grade', storage);

    expect(result.urlPatterns).toEqual(['example.com/grade']);
    expect(storage.saveCount).toBe(0); // no save needed
  });

  it('saves the updated profile to storage', async () => {
    await addUrlPattern(profile.id, 'new-pattern', storage);

    expect(storage.saveCount).toBe(1);
    const stored = await storage.getProfile(profile.id);
    expect(stored!.urlPatterns).toContain('new-pattern');
  });

  it('throws for non-existent profile', async () => {
    await expect(
      addUrlPattern('nonexistent-id', 'pattern', storage),
    ).rejects.toThrow('Profile not found: nonexistent-id');
  });

  it('throws for built-in profile', async () => {
    const builtIn = makeBuiltInProfile();
    storage = new MockProfileStorage([builtIn]);

    await expect(
      addUrlPattern(builtIn.id, 'new-pattern', storage),
    ).rejects.toThrow('Cannot edit built-in profile');
  });

  it('preserves other profile properties when adding pattern', async () => {
    const result = await addUrlPattern(profile.id, 'another.com', storage);

    expect(result.id).toBe(profile.id);
    expect(result.name).toBe(profile.name);
    expect(result.selectors).toEqual(profile.selectors);
    expect(result.feedback).toEqual(profile.feedback);
  });
});

// ============================================================================
// mergeProfiles (pure function)
// ============================================================================

describe('mergeProfiles', () => {
  it('preserves existing profile id and metadata', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult();
    const merged = mergeProfiles(existing, discovery);
    expect(merged.id).toBe('test-profile-1');
    expect(merged.name).toBe('Test Profile');
    expect(merged.isBuiltIn).toBe(false);
    expect(merged.urlPatterns).toEqual(['example.com/grade']);
  });

  it('updates selectors from new discovery', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult({
      studentName: 'td.new-name',
      scoreInput: 'input.new-score',
    });
    const merged = mergeProfiles(existing, discovery);
    expect(merged.selectors.studentName).toBe('td.new-name');
    expect(merged.selectors.scoreInput).toBe('input.new-score');
  });

  it('preserves existing selectors when new ones are null', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult({
      feedbackBox: null,
      questionRegion: null,
    });
    const merged = mergeProfiles(existing, discovery);
    // null -> selectorMapToSiteSelectors -> null -> readSelector -> undefined -> keep existing
    expect(merged.selectors.feedbackBox).toBe('textarea.fb');
    expect(merged.selectors.questionRegion).toBe('div.question');
  });

  it('updates navigation config from discovery', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult();
    discovery.navigation = { mode: 'sequential', nextButton: 'button.next' };
    const merged = mergeProfiles(existing, discovery);
    expect(merged.navigation.mode).toBe('sequential');
    expect(merged.navigation.nextButton).toBe('button.next');
  });

  it('updates feedback config from discovery', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult();
    discovery.feedback = { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true };
    const merged = mergeProfiles(existing, discovery);
    expect(merged.feedback.type).toBe('tinymce-inline');
    expect(merged.feedback.requiresHiddenSync).toBe(true);
    expect(merged.feedback.htmlWrap).toBe(true);
  });

  it('coerces unknown feedback type to textarea', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult();
    discovery.feedback = { type: 'unknown', requiresHiddenSync: false, htmlWrap: false };
    const merged = mergeProfiles(existing, discovery);
    expect(merged.feedback.type).toBe('textarea');
  });

  it('updates save config from discovery', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult();
    discovery.save = { buttonText: 'Submit All', fallbackText: 'Save Draft' };
    const merged = mergeProfiles(existing, discovery);
    expect(merged.save.buttonText).toBe('Submit All');
    expect(merged.save.fallbackText).toBe('Save Draft');
  });

  it('falls back to existing save buttonText when new is empty', () => {
    const existing = makeProfile();
    const discovery = makeDiscoveryResult();
    discovery.save = { buttonText: '', fallbackText: undefined };
    const merged = mergeProfiles(existing, discovery);
    expect(merged.save.buttonText).toBe('Save');
    expect(merged.save.fallbackText).toBe('Submit');
  });

  it('does not mutate the existing profile', () => {
    const existing = makeProfile();
    const originalScoreInput = existing.selectors.scoreInput;
    const discovery = makeDiscoveryResult({ scoreInput: 'input.changed' });
    mergeProfiles(existing, discovery);
    expect(existing.selectors.scoreInput).toBe(originalScoreInput);
  });
});

// ============================================================================
// updateSelector (pure function)
// ============================================================================

describe('updateSelector', () => {
  it('updates a single selector field', () => {
    const profile = makeProfile();
    const updated = updateSelector(profile, 'scoreInput', 'input.new-score');
    expect(updated.selectors.scoreInput).toBe('input.new-score');
  });

  it('does not modify the original profile', () => {
    const profile = makeProfile();
    updateSelector(profile, 'scoreInput', 'input.new-score');
    expect(profile.selectors.scoreInput).toBe('input.score');
  });

  it('throws on invalid field name', () => {
    const profile = makeProfile();
    expect(() => updateSelector(profile, 'invalidField', 'div.x')).toThrow('Invalid selector field');
  });

  it('preserves all other selectors', () => {
    const profile = makeProfile();
    const updated = updateSelector(profile, 'studentName', 'div.new-name');
    expect(updated.selectors.scoreInput).toBe('input.score');
    expect(updated.selectors.feedbackBox).toBe('textarea.fb');
    expect(updated.selectors.studentSection).toBe('div.student');
  });

  it('preserves non-selector properties', () => {
    const profile = makeProfile();
    const updated = updateSelector(profile, 'scoreInput', 'input.new');
    expect(updated.id).toBe(profile.id);
    expect(updated.name).toBe(profile.name);
    expect(updated.feedback).toEqual(profile.feedback);
    expect(updated.save).toEqual(profile.save);
    expect(updated.navigation).toEqual(profile.navigation);
  });
});

// ============================================================================
// reDiscoverProfile
// ============================================================================

describe('reDiscoverProfile', () => {
  it('calls runDiscovery and merges result into profile', async () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult({ scoreInput: 'input.rediscovered' });
    const runDiscovery = async () => discovery;

    const result = await reDiscoverProfile(profile, runDiscovery);
    expect(result.selectors.scoreInput).toBe('input.rediscovered');
    expect(result.id).toBe(profile.id);
  });

  it('preserves existing selectors when discovery returns null', async () => {
    const profile = makeProfile();
    const discovery = makeDiscoveryResult({ feedbackBox: null });
    const runDiscovery = async () => discovery;

    const result = await reDiscoverProfile(profile, runDiscovery);
    expect(result.selectors.feedbackBox).toBe('textarea.fb');
  });

  it('propagates errors from runDiscovery', async () => {
    const profile = makeProfile();
    const runDiscovery = async () => { throw new Error('AI call failed'); };

    await expect(reDiscoverProfile(profile, runDiscovery)).rejects.toThrow('AI call failed');
  });
});
