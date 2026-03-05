import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock ./vector-store ──────────────────────────────────────────────────
const { mockGetAll, mockUpdate } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('./vector-store', () => ({
  getAllEmbeddingsUnfiltered: mockGetAll,
  updateEmbedding: mockUpdate,
}));

// Import AFTER mocks are set up
import { reEmbedAll } from './re-embed';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeStoredEmbedding(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    sessionId: 42,
    rubricHash: 'rubric-abc',
    studentResponse: 'The answer is 42.',
    score: 8.5,
    feedback: 'Good work.',
    embedding: new Float32Array([0.1, 0.2, 0.3]),
    embeddingModel: 'old-model',
    createdAt: '2025-01-01T00:00:00',
    ...overrides,
  };
}

function make384dVector(): number[] {
  return Array.from({ length: 384 }, (_, i) => i * 0.001);
}

function makeOkResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      embedding: make384dVector(),
      dimensions: 384,
      model: 'new-model',
    }),
  } as unknown as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  originalFetch = globalThis.fetch;
  mockUpdate.mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('reEmbedAll', () => {
  it('calls embed API once per row with student response', async () => {
    const rows = [
      makeStoredEmbedding({ id: 1, studentResponse: 'Answer A' }),
      makeStoredEmbedding({ id: 2, studentResponse: 'Answer B' }),
      makeStoredEmbedding({ id: 3, studentResponse: 'Answer C' }),
    ];
    mockGetAll.mockResolvedValue(rows);
    const mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
    globalThis.fetch = mockFetch;

    await reEmbedAll('local', 'new-model', vi.fn());

    expect(mockFetch).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const [url, opts] = mockFetch.mock.calls[i];
      expect(url).toBe('http://localhost:3456/api/embed');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.text).toBe(rows[i].studentResponse);
      expect(body.provider).toBe('local');
      expect(body.model).toBe('new-model');
    }
  });

  it('calls updateEmbedding for each successfully embedded row', async () => {
    const rows = [
      makeStoredEmbedding({ id: 10 }),
      makeStoredEmbedding({ id: 20 }),
      makeStoredEmbedding({ id: 30 }),
    ];
    mockGetAll.mockResolvedValue(rows);
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());

    await reEmbedAll('local', 'new-model', vi.fn());

    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockUpdate.mock.calls[0][0]).toBe(10);
    expect(mockUpdate.mock.calls[0][2]).toBe('new-model');
    expect(mockUpdate.mock.calls[1][0]).toBe(20);
    expect(mockUpdate.mock.calls[2][0]).toBe(30);
    for (const call of mockUpdate.mock.calls) {
      expect(call[1]).toBeInstanceOf(Float32Array);
    }
  });

  it('tracks progress correctly', async () => {
    const rows = [
      makeStoredEmbedding({ id: 1 }),
      makeStoredEmbedding({ id: 2 }),
      makeStoredEmbedding({ id: 3 }),
    ];
    mockGetAll.mockResolvedValue(rows);
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    const onProgress = vi.fn();

    await reEmbedAll('local', 'new-model', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]).toEqual([1, 3]);
    expect(onProgress.mock.calls[1]).toEqual([2, 3]);
    expect(onProgress.mock.calls[2]).toEqual([3, 3]);
  });

  it('returns {updated: 3, failed: 0} on full success', async () => {
    const rows = [
      makeStoredEmbedding({ id: 1 }),
      makeStoredEmbedding({ id: 2 }),
      makeStoredEmbedding({ id: 3 }),
    ];
    mockGetAll.mockResolvedValue(rows);
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());

    const result = await reEmbedAll('local', 'new-model', vi.fn());

    expect(result).toEqual({ updated: 3, failed: 0 });
  });

  it('skips rows with null/empty studentResponse', async () => {
    const rows = [makeStoredEmbedding({ id: 1, studentResponse: null })];
    mockGetAll.mockResolvedValue(rows);
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const result = await reEmbedAll('local', 'new-model', vi.fn());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 1, failed: 0 });
  });

  it('handles embed API failure — increments failed, continues', async () => {
    const rows = [
      makeStoredEmbedding({ id: 1, studentResponse: 'A' }),
      makeStoredEmbedding({ id: 2, studentResponse: 'B' }),
      makeStoredEmbedding({ id: 3, studentResponse: 'C' }),
    ];
    mockGetAll.mockResolvedValue(rows);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse())
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeOkResponse());
    globalThis.fetch = mockFetch;

    const result = await reEmbedAll('local', 'new-model', vi.fn());

    expect(result).toEqual({ updated: 2, failed: 1 });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[0][0]).toBe(1);
    expect(mockUpdate.mock.calls[1][0]).toBe(3);
  });

  it('handles non-ok HTTP response — increments failed', async () => {
    const rows = [makeStoredEmbedding({ id: 1, studentResponse: 'A' })];
    mockGetAll.mockResolvedValue(rows);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    const result = await reEmbedAll('local', 'new-model', vi.fn());

    expect(result).toEqual({ updated: 0, failed: 1 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
