import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────
const { mockStoreEmbedding, mockSanitize } = vi.hoisted(() => ({
  mockStoreEmbedding: vi.fn(),
  mockSanitize: vi.fn(),
}));

vi.mock('./vector-store', () => ({ storeEmbedding: mockStoreEmbedding }));
vi.mock('./privacy', () => ({ sanitizeForStorage: mockSanitize }));

// Import after mocks
import { storeGradingResults, computeRubricHash } from './grading-pipeline';

// ── Helpers ───────────────────────────────────────────────────────────────

const RUBRIC = {
  essayPrompt: 'Explain photosynthesis.',
  checklistItems: [{ category: 'Understanding', points: 5, items: ['Light reactions', 'Calvin cycle'] }],
  maxScore: '10',
};

const STUDENTS = [
  { name: 'Alice Smith', response: 'Plants use sunlight to make sugar.' },
  { name: 'Bob Jones',   response: 'Photosynthesis converts CO2 and water to glucose.' },
  { name: 'Carol White', response: '' },  // empty — should be skipped
];

const RESULTS = [
  { studentIndex: 0, score: 8, feedback: 'Good explanation.' },
  { studentIndex: 1, score: 9, feedback: 'Excellent detail.' },
  { studentIndex: 2, score: 0, feedback: 'No response.' },
];

const PROVIDER = { provider: 'ollama', model: 'nomic-embed-text', apiUrl: 'http://localhost:11434' };

function makeFetchMock(embedding: number[] = [0.1, 0.2, 0.3]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ embedding, dimensions: embedding.length, model: 'nomic-embed-text' }),
  });
}

// ── computeRubricHash ─────────────────────────────────────────────────────

describe('computeRubricHash', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await computeRubricHash(RUBRIC);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same rubric → same hash', async () => {
    const h1 = await computeRubricHash(RUBRIC);
    const h2 = await computeRubricHash(RUBRIC);
    expect(h1).toBe(h2);
  });

  it('different rubric prompt → different hash', async () => {
    const h1 = await computeRubricHash(RUBRIC);
    const h2 = await computeRubricHash({ ...RUBRIC, essayPrompt: 'Explain cellular respiration.' });
    expect(h1).not.toBe(h2);
  });
});

// ── storeGradingResults ───────────────────────────────────────────────────

describe('storeGradingResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: sanitize strips name, returns sanitized text and hash
    mockSanitize.mockImplementation(async (response: string, name: string | null) => ({
      sanitizedResponse: name ? response.replace(name, '[STUDENT]') : response,
      studentHash: name ? 'abc123def456abcd' : null,
    }));
    mockStoreEmbedding.mockResolvedValue(1);
    vi.stubGlobal('fetch', makeFetchMock());
  });

  it('skips students with empty responses', async () => {
    const summary = await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });
    expect(summary.skipped).toBe(1);
  });

  it('stores embeddings for non-empty responses', async () => {
    const summary = await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });
    expect(summary.stored).toBe(2);
    expect(mockStoreEmbedding).toHaveBeenCalledTimes(2);
  });

  it('calls sanitizeForStorage before storing — names are stripped', async () => {
    await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });
    expect(mockSanitize).toHaveBeenCalledTimes(2); // once per non-empty student
    // Verify storeEmbedding is NOT called with the original name
    for (const call of mockStoreEmbedding.mock.calls) {
      const params = call[0];
      expect(params.studentResponse).not.toContain('Alice Smith');
      expect(params.studentResponse).not.toContain('Bob Jones');
    }
  });

  it('counts errors when embed API fails, does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const summary = await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });
    expect(summary.errors).toBe(2);
    expect(summary.stored).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it('partial failure: one student fails, others succeed', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { ok: false, status: 500 };
      return {
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2], dimensions: 2, model: 'm' }),
      };
    }));

    const summary = await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });
    expect(summary.errors).toBe(1);
    expect(summary.stored).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it('calls /api/embed with correct provider config', async () => {
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3456/api/embed');
    const body = JSON.parse(init.body as string);
    expect(body.provider).toBe('ollama');
    expect(body.model).toBe('nomic-embed-text');
    expect(typeof body.text).toBe('string');
  });

  it('returns correct summary shape', async () => {
    const summary = await storeGradingResults({
      sessionId: 1, rubric: RUBRIC, students: STUDENTS, results: RESULTS,
      providerConfig: PROVIDER, serverUrl: 'http://localhost:3456',
    });
    expect(summary).toMatchObject({
      stored: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
    });
  });
});
