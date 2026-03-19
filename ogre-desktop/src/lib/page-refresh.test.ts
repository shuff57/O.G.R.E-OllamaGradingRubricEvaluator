import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock Setup (BEFORE imports)
// ============================================================================

// Create mocks inside factory functions to avoid hoisting issues
vi.mock('./site-profiles', () => {
  const mockFindProfilesByUrl = vi.fn();
  return {
    ProfileStorageImpl: class {
      findProfilesByUrl = mockFindProfilesByUrl;
    },
    __mockFindProfilesByUrl: mockFindProfilesByUrl,
  };
});

vi.mock('./db', () => {
  const mockGetBatchSession = vi.fn();
  return {
    getBatchSession: mockGetBatchSession,
    __mockGetBatchSession: mockGetBatchSession,
  };
});

// Import AFTER mocks
import {
  refreshPageData,
  buildBatchResetState,
  stopActiveBatch,
  createDebouncedRefresh,
} from './page-refresh';
import type { SiteProfile } from './batch-grader';
import * as siteProfilesModule from './site-profiles';
import * as dbModule from './db';

// Get references to the mock functions
const mockFindProfilesByUrl = (siteProfilesModule as any).__mockFindProfilesByUrl;
const mockGetBatchSession = (dbModule as any).__mockGetBatchSession;

// ============================================================================
// Test Suites
// ============================================================================

describe('page-refresh.ts — refreshPageData()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Profile Detection Tests ──────────────────────────────────────────

  it('Test 1: Profile found → detectedProfile is first match, pageUrl matches input', async () => {
    const mockProfile: SiteProfile = {
      id: 'myopenmath',
      name: 'MyOpenMath',
      isBuiltIn: false,
      urlPatterns: ['myopenmath.com'],
      selectors: {
        studentSection: null,
        studentName: '.student-name',
        scoreInput: '.score',
        feedbackBox: null,
      },
      feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
      save: { buttonText: 'Save', fallbackText: 'Save Changes' },
      navigation: { mode: 'batch' },
    };

    mockFindProfilesByUrl.mockResolvedValueOnce([mockProfile]);
    mockGetBatchSession.mockResolvedValueOnce(null);

    const result = await refreshPageData('https://myopenmath.com/gradeall');

    expect(result.detectedProfile).toEqual(mockProfile);
    expect(result.pageUrl).toBe('https://myopenmath.com/gradeall');
    expect(result.savedSessionStudent).toBeNull();
  });

  it('Test 2: No profile found (empty array) → detectedProfile is null', async () => {
    mockFindProfilesByUrl.mockResolvedValueOnce([]);
    mockGetBatchSession.mockResolvedValueOnce(null);

    const result = await refreshPageData('https://unknown-site.com');

    expect(result.detectedProfile).toBeNull();
    expect(result.pageUrl).toBe('https://unknown-site.com');
  });

  it('Test 3: Profile detection throws → detectedProfile is null (graceful fallback)', async () => {
    mockFindProfilesByUrl.mockRejectedValueOnce(new Error('Database error'));
    mockGetBatchSession.mockResolvedValueOnce(null);

    const result = await refreshPageData('https://myopenmath.com');

    expect(result.detectedProfile).toBeNull();
    expect(result.pageUrl).toBe('https://myopenmath.com');
  });

  // ── Session Detection Tests ──────────────────────────────────────────

  it('Test 4: Session found → savedSessionStudent equals session.last_student_name', async () => {
    mockFindProfilesByUrl.mockResolvedValueOnce([]);
    mockGetBatchSession.mockResolvedValueOnce({
      id: 'session-1',
      url: 'https://myopenmath.com',
      last_student_name: 'John Doe',
      timestamp: new Date().toISOString(),
    });

    const result = await refreshPageData('https://myopenmath.com');

    expect(result.savedSessionStudent).toBe('John Doe');
  });

  it('Test 5: No session (null) → savedSessionStudent is null', async () => {
    mockFindProfilesByUrl.mockResolvedValueOnce([]);
    mockGetBatchSession.mockResolvedValueOnce(null);

    const result = await refreshPageData('https://myopenmath.com');

    expect(result.savedSessionStudent).toBeNull();
  });

  it('Test 6: Session check throws → savedSessionStudent is null (graceful fallback)', async () => {
    mockFindProfilesByUrl.mockResolvedValueOnce([]);
    mockGetBatchSession.mockRejectedValueOnce(new Error('Network error'));

    const result = await refreshPageData('https://myopenmath.com');

    expect(result.savedSessionStudent).toBeNull();
  });

  // ── Combined Tests ──────────────────────────────────────────────────

  it('Both profile and session found → returns both', async () => {
    const mockProfile: SiteProfile = {
      id: 'canvas',
      name: 'Canvas',
      isBuiltIn: false,
      urlPatterns: ['canvas.instructure.com'],
      selectors: {
        studentSection: null,
        studentName: '.student',
        scoreInput: '.grade',
        feedbackBox: null,
      },
      feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
      save: { buttonText: 'Save', fallbackText: 'Save Changes' },
      navigation: { mode: 'batch' },
    };

    mockFindProfilesByUrl.mockResolvedValueOnce([mockProfile]);
    mockGetBatchSession.mockResolvedValueOnce({
      id: 'session-2',
      url: 'https://canvas.instructure.com',
      last_student_name: 'Jane Smith',
      timestamp: new Date().toISOString(),
    });

    const result = await refreshPageData('https://canvas.instructure.com/courses/123');

    expect(result.detectedProfile).toEqual(mockProfile);
    expect(result.savedSessionStudent).toBe('Jane Smith');
    expect(result.pageUrl).toBe('https://canvas.instructure.com/courses/123');
  });

  it('Both profile and session throw → both null', async () => {
    mockFindProfilesByUrl.mockRejectedValueOnce(new Error('Profile error'));
    mockGetBatchSession.mockRejectedValueOnce(new Error('Session error'));

    const result = await refreshPageData('https://error-site.com');

    expect(result.detectedProfile).toBeNull();
    expect(result.savedSessionStudent).toBeNull();
  });
});

describe('page-refresh.ts — buildBatchResetState()', () => {
  it('Test 7: Returns object with all expected fields and correct default values', () => {
    const state = buildBatchResetState();

    // Verify all fields exist
    expect(state).toHaveProperty('batchPhase');
    expect(state).toHaveProperty('batchProgress');
    expect(state).toHaveProperty('batchLog');
    expect(state).toHaveProperty('extractedRubric');
    expect(state).toHaveProperty('rubricText');
    expect(state).toHaveProperty('phaseMessage');
    expect(state).toHaveProperty('batchError');
    expect(state).toHaveProperty('batchGrader');
    expect(state).toHaveProperty('batchHandle');
    expect(state).toHaveProperty('isBatchRunning');
    expect(state).toHaveProperty('isBatchPaused');
    expect(state).toHaveProperty('currentStudentName');
    expect(state).toHaveProperty('resumeAfter');

    // Verify correct default values
    expect(state.batchPhase).toBe('idle');
    expect(state.batchProgress).toBeNull();
    expect(state.batchLog).toEqual([]);
    expect(state.extractedRubric).toBeNull();
    expect(state.rubricText).toBe('');
    expect(state.phaseMessage).toBe('');
    expect(state.batchError).toBe('');
    expect(state.batchGrader).toBeNull();
    expect(state.batchHandle).toBeNull();
    expect(state.isBatchRunning).toBe(false);
    expect(state.isBatchPaused).toBe(false);
    expect(state.currentStudentName).toBe('');
    expect(state.resumeAfter).toBe('');
  });

  it('Returns a new object each time (not singleton)', () => {
    const state1 = buildBatchResetState();
    const state2 = buildBatchResetState();

    expect(state1).not.toBe(state2);
    expect(state1).toEqual(state2);
  });

  it('batchLog is a fresh array each call', () => {
    const state1 = buildBatchResetState();
    const state2 = buildBatchResetState();

    state1.batchLog.push('test' as never);
    expect(state2.batchLog).toEqual([]);
  });
});

describe('page-refresh.ts — stopActiveBatch()', () => {
  it('Test 8: With non-null handle and grader → both .cancel() and .stop() called', () => {
    const mockCancel = vi.fn();
    const mockStop = vi.fn();

    const handle = { cancel: mockCancel } as any;
    const grader = { stop: mockStop };
    const buffer: unknown[] = [1, 2, 3];

    stopActiveBatch(handle, grader, buffer);

    expect(mockCancel).toHaveBeenCalledOnce();
    expect(mockStop).toHaveBeenCalledOnce();
    expect(buffer).toEqual([]);
  });

  it('Test 9: With null handle → no crash, grader.stop() still called', () => {
    const mockStop = vi.fn();
    const grader = { stop: mockStop };
    const buffer: unknown[] = [1, 2, 3];

    expect(() => stopActiveBatch(null, grader, buffer)).not.toThrow();
    expect(mockStop).toHaveBeenCalledOnce();
    expect(buffer).toEqual([]);
  });

  it('Test 10: With null grader → no crash, handle.cancel() still called', () => {
    const mockCancel = vi.fn();
    const handle = { cancel: mockCancel } as any;
    const buffer: unknown[] = [1, 2, 3];

    expect(() => stopActiveBatch(handle, null, buffer)).not.toThrow();
    expect(mockCancel).toHaveBeenCalledOnce();
    expect(buffer).toEqual([]);
  });

  it('Test 11: Clears pausedResultBuffer (array becomes empty after call)', () => {
    const buffer = [
      { studentName: 'Alice', score: 10 },
      { studentName: 'Bob', score: 8 },
      { studentName: 'Charlie', score: 9 },
    ];

    stopActiveBatch(null, null, buffer);

    expect(buffer).toEqual([]);
    expect(buffer.length).toBe(0);
  });

  it('With both null → no crash, buffer cleared', () => {
    const buffer: unknown[] = ['a', 'b', 'c'];

    expect(() => stopActiveBatch(null, null, buffer)).not.toThrow();
    expect(buffer).toEqual([]);
  });

  it('With empty buffer → no crash', () => {
    const buffer: unknown[] = [];
    const mockCancel = vi.fn();
    const handle = { cancel: mockCancel } as any;

    stopActiveBatch(handle, null, buffer);

    expect(buffer).toEqual([]);
  });
});

describe('page-refresh.ts — createDebouncedRefresh()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 12: Called 3 times rapidly → handler called only once (after delay)', () => {
    const mockHandler = vi.fn();
    const debounced = createDebouncedRefresh(mockHandler, 300);

    debounced('url1');
    debounced('url2');
    debounced('url3');

    // Handler not called yet
    expect(mockHandler).not.toHaveBeenCalled();

    // Advance time by 300ms
    vi.advanceTimersByTime(300);

    // Handler called exactly once with the last URL
    expect(mockHandler).toHaveBeenCalledOnce();
    expect(mockHandler).toHaveBeenCalledWith('url3');
  });

  it('Test 13: Called once, wait for delay → handler called exactly once', () => {
    const mockHandler = vi.fn();
    const debounced = createDebouncedRefresh(mockHandler, 300);

    debounced('https://myopenmath.com');

    expect(mockHandler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(mockHandler).toHaveBeenCalledOnce();
    expect(mockHandler).toHaveBeenCalledWith('https://myopenmath.com');
  });

  it('Test 14: Default delay is 300ms (use fake timers to verify)', () => {
    const mockHandler = vi.fn();
    const debounced = createDebouncedRefresh(mockHandler);

    debounced('url');

    // At 299ms, handler should not be called
    vi.advanceTimersByTime(299);
    expect(mockHandler).not.toHaveBeenCalled();

    // At 300ms, handler should be called
    vi.advanceTimersByTime(1);
    expect(mockHandler).toHaveBeenCalledOnce();
  });

  it('Debounce cancels previous pending call on re-invocation', () => {
    const mockHandler = vi.fn();
    const debounced = createDebouncedRefresh(mockHandler, 300);

    debounced('url1');
    vi.advanceTimersByTime(150);

    debounced('url2');
    vi.advanceTimersByTime(150);

    // Handler not called yet (second call reset the timer)
    expect(mockHandler).not.toHaveBeenCalled();

    // Advance another 300ms
    vi.advanceTimersByTime(300);

    // Handler called once with url2
    expect(mockHandler).toHaveBeenCalledOnce();
    expect(mockHandler).toHaveBeenCalledWith('url2');
  });

  it('Multiple debounced instances are independent', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const debounced1 = createDebouncedRefresh(handler1, 300);
    const debounced2 = createDebouncedRefresh(handler2, 300);

    debounced1('url1');
    debounced2('url2');

    vi.advanceTimersByTime(300);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler1).toHaveBeenCalledWith('url1');
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledWith('url2');
  });

  it('Custom delay is respected', () => {
    const mockHandler = vi.fn();
    const debounced = createDebouncedRefresh(mockHandler, 500);

    debounced('url');

    vi.advanceTimersByTime(499);
    expect(mockHandler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockHandler).toHaveBeenCalledOnce();
  });
});
