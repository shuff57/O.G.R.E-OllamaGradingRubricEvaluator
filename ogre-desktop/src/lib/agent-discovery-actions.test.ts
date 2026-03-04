import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
  captureWebviewScreenshot: vi.fn(),
  navigateEmbedded: vi.fn(),
  getActiveTabId: vi.fn(() => 'test-tab-1'),
  getEmbeddedUrl: vi.fn(() => Promise.resolve('https://example.com/grading')),
}));

vi.mock('./cdp-actions', () => ({
  isConnected: vi.fn(() => false),
  pwClick: vi.fn(),
  pwType: vi.fn(),
  pwReadText: vi.fn(),
  pwWaitFor: vi.fn(),
  pwScroll: vi.fn(),
  pwPressKey: vi.fn(),
  pwWriteCodeMirror: vi.fn(),
  pwCapturePopup: vi.fn(),
}));

vi.mock('./cdp-client', () => ({
  cdp: { send: vi.fn() },
}));

vi.mock('./agent-dom-fuzzy', () => ({
  findFuzzyMatch: vi.fn(() => null),
  fuzzyMatchReason: vi.fn(),
}));

vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./discover', () => ({
  runDiscovery: vi.fn(),
}));

vi.mock('./profile-tester', () => ({
  testProfile: vi.fn(),
}));

const mockGetProfile = vi.fn();
const mockSaveProfile = vi.fn();

vi.mock('./site-profiles', () => ({
  ProfileStorageImpl: class {
    getProfile(...args: unknown[]) { return mockGetProfile(...args); }
    saveProfile(...args: unknown[]) { return mockSaveProfile(...args); }
    listProfiles() { return Promise.resolve([]); }
  },
}));

import { executeAction } from './browser-actions';
import { runDiscovery } from './discover';
import { testProfile } from './profile-tester';

const mockRunDiscovery = runDiscovery as ReturnType<typeof vi.fn>;
const mockTestProfile = testProfile as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── discover_page ────────────────────────────────────────────────────────────

describe('executeAction: discover_page', () => {
  test('dispatches to runDiscovery and returns DiscoveryResult on success', async () => {
    const mockResult = {
      draft: {
        navigation: { mode: 'batch' },
        selectors: { studentName: 'b', scoreInput: 'input' },
        feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
        save: { buttonText: 'Save' },
        confidence: 'high',
      },
      validation: { studentName: { matchCount: 5, sampleText: 'Alice', valid: true } },
      screenshot: 'data:image/png;base64,abc',
    };
    mockRunDiscovery.mockResolvedValueOnce(mockResult);

    const result = await executeAction({ action: 'discover_page' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResult);
    expect(mockRunDiscovery).toHaveBeenCalledOnce();
  });

  test('passes hints through (accepts optional hints parameter)', async () => {
    mockRunDiscovery.mockResolvedValueOnce({ draft: {}, validation: {}, screenshot: '' });

    const result = await executeAction({
      action: 'discover_page',
      hints: { estimatedStudentCount: 30, pageDescription: 'MyOpenMath grading page' },
    });

    expect(result.success).toBe(true);
    expect(mockRunDiscovery).toHaveBeenCalledOnce();
  });

  test('returns structured error on failure (does not throw)', async () => {
    mockRunDiscovery.mockRejectedValueOnce(new Error('AI call failed (HTTP 500)'));

    const result = await executeAction({ action: 'discover_page' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('AI call failed (HTTP 500)');
  });
});

// ── test_profile ─────────────────────────────────────────────────────────────

describe('executeAction: test_profile', () => {
  const fakeProfile = {
    id: 'myopenmath',
    name: 'MyOpenMath',
    isBuiltIn: true,
    urlPatterns: ['gradeallq2.php'],
    selectors: { studentName: 'b', scoreInput: 'input' },
    feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
    save: { buttonText: 'Quick Save', fallbackText: 'Save' },
    navigation: { mode: 'batch' },
  };

  const fakeReport = {
    profileId: 'myopenmath',
    profileName: 'MyOpenMath',
    testedAt: '2026-01-01T00:00:00.000Z',
    selectorResults: [
      { selector: 'b', field: 'studentName', found: true, matchCount: 10 },
      { selector: 'input', field: 'scoreInput', found: true, matchCount: 10 },
    ],
    extractionResult: null,
    passed: true,
    selectorsFound: 2,
    selectorsMissing: 0,
  };

  test('loads profile by ID and returns ProfileTestReport on success', async () => {
    mockGetProfile.mockResolvedValueOnce(fakeProfile);
    mockTestProfile.mockResolvedValueOnce(fakeReport);

    const result = await executeAction({ action: 'test_profile', profileId: 'myopenmath' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(fakeReport);
    expect(mockGetProfile).toHaveBeenCalledWith('myopenmath');
    expect(mockTestProfile).toHaveBeenCalledWith(fakeProfile, 'https://example.com/grading');
  });

  test('returns error when profile is not found', async () => {
    mockGetProfile.mockResolvedValueOnce(null);

    const result = await executeAction({ action: 'test_profile', profileId: 'nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Profile not found: nonexistent');
    expect(mockTestProfile).not.toHaveBeenCalled();
  });

  test('returns structured error on testProfile failure', async () => {
    mockGetProfile.mockResolvedValueOnce(fakeProfile);
    mockTestProfile.mockRejectedValueOnce(new Error('DOM snapshot failed'));

    const result = await executeAction({ action: 'test_profile', profileId: 'myopenmath' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('DOM snapshot failed');
  });
});

// ── save_profile ─────────────────────────────────────────────────────────────

describe('executeAction: save_profile', () => {
  test('validates and saves a profile, returns profileId', async () => {
    mockSaveProfile.mockResolvedValueOnce(undefined);

    const result = await executeAction({
      action: 'save_profile',
      name: 'My Custom Profile',
      profile: {
        selectors: {
          studentSection: null,
          studentName: '.student-name',
          scoreInput: 'input.score',
          feedbackBox: null,
        },
        urlPatterns: ['mycourse.edu/grades'],
      },
    });

    expect(result.success).toBe(true);
    expect((result.data as { profileId: string }).profileId).toBeTruthy();
    expect(mockSaveProfile).toHaveBeenCalledOnce();

    // Verify the saved profile shape
    const savedArg = mockSaveProfile.mock.calls[0][0];
    expect(savedArg.name).toBe('My Custom Profile');
    expect(savedArg.isBuiltIn).toBe(false);
    expect(savedArg.selectors.studentName).toBe('.student-name');
    expect(savedArg.urlPatterns).toEqual(['mycourse.edu/grades']);
  });

  test('returns error when name is empty', async () => {
    const result = await executeAction({
      action: 'save_profile',
      name: '',
      profile: {
        selectors: {
          studentSection: null,
          studentName: '.name',
          scoreInput: 'input',
          feedbackBox: null,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Profile name must not be empty');
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });

  test('returns error when name is whitespace-only', async () => {
    const result = await executeAction({
      action: 'save_profile',
      name: '   ',
      profile: {
        selectors: {
          studentSection: null,
          studentName: '.name',
          scoreInput: 'input',
          feedbackBox: null,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Profile name must not be empty');
  });

  test('returns error when no selectors are provided', async () => {
    const result = await executeAction({
      action: 'save_profile',
      name: 'Empty Profile',
      profile: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Profile must have at least one selector');
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });

  test('returns error when all selectors are null/empty', async () => {
    const result = await executeAction({
      action: 'save_profile',
      name: 'Null Selectors',
      profile: {
        selectors: {
          studentSection: null,
          studentName: null,
          scoreInput: null,
          feedbackBox: null,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Profile must have at least one selector');
  });

  test('returns structured error on storage failure', async () => {
    mockSaveProfile.mockRejectedValueOnce(new Error('Database write failed'));

    const result = await executeAction({
      action: 'save_profile',
      name: 'Failing Profile',
      profile: {
        selectors: {
          studentSection: null,
          studentName: '.name',
          scoreInput: 'input',
          feedbackBox: null,
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database write failed');
  });

  test('uses provided profile ID when present', async () => {
    mockSaveProfile.mockResolvedValueOnce(undefined);

    const result = await executeAction({
      action: 'save_profile',
      name: 'Custom ID',
      profile: {
        id: 'my-custom-id',
        selectors: {
          studentSection: null,
          studentName: 'span.name',
          scoreInput: 'input',
          feedbackBox: null,
        },
      },
    });

    expect(result.success).toBe(true);
    expect((result.data as { profileId: string }).profileId).toBe('my-custom-id');
  });
});
