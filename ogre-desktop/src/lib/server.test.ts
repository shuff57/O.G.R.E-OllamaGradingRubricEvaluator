import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('./electron-bridge', () => ({
  listen: vi.fn(),
}));

// ── Mock provider-sync ──────────────────────────────────────────────────
const { mockGetHandshakeToken } = vi.hoisted(() => ({
  mockGetHandshakeToken: vi.fn().mockReturnValue('test-token-abc'),
}));

vi.mock('./provider-sync', () => ({
  getHandshakeToken: mockGetHandshakeToken,
}));

import { syncProfileToServer } from './server';
import type { SiteProfile } from './batch-grader';

// ── Test Data ───────────────────────────────────────────────────────────

const TEST_PROFILE: SiteProfile = {
  id: 'myopenmath',
  name: 'MyOpenMath',
  isBuiltIn: true,
  urlPatterns: ['gradeallq2.php', 'myopenmath.com'],
  selectors: {
    studentSection: 'div[data-lastchange]',
    studentName: 'b',
    scoreInput: 'input[aria-label="Score"]',
    feedbackBox: 'div.fbbox',
    feedbackHidden: null,
    questionRegion: null,
    fullCreditLink: null,
  },
  feedback: { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true },
  save: { buttonText: 'Quick Save', fallbackText: 'Save Changes' },
  navigation: { mode: 'batch' },
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('syncProfileToServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as typeof fetch);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });

  it('POSTs serialized profile to /api/profiles/sync', async () => {
    await syncProfileToServer(TEST_PROFILE);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3456/api/profiles/sync');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.id).toBe('myopenmath');
    expect(body.name).toBe('MyOpenMath');
    expect(body.urlPatterns).toEqual(['gradeallq2.php', 'myopenmath.com']);
  });

  it('includes Bearer token from getHandshakeToken()', async () => {
    await syncProfileToServer(TEST_PROFILE);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-token-abc');
  });

  it('omits Authorization header when token is null', async () => {
    mockGetHandshakeToken.mockReturnValueOnce(null);

    await syncProfileToServer(TEST_PROFILE);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });

  it('silently swallows fetch errors (fire-and-forget)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    // Should NOT throw
    await expect(syncProfileToServer(TEST_PROFILE)).resolves.toBeUndefined();
  });

  it('silently swallows network errors', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(syncProfileToServer(TEST_PROFILE)).resolves.toBeUndefined();
  });
});
