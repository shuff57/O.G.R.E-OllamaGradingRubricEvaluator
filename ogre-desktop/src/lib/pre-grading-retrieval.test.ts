import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────
const { mockGetCalibrationExamples } = vi.hoisted(() => ({
  mockGetCalibrationExamples: vi.fn(),
}));

vi.mock('./calibration-retrieval', () => ({
  getCalibrationExamples: mockGetCalibrationExamples,
}));

// vector-store needed transitively through calibration-retrieval — mock it
vi.mock('./vector-store', () => ({
  getEmbeddingsByRubricHash: vi.fn().mockResolvedValue([]),
}));

import { getHistoricalCalibration } from './pre-grading-retrieval';

// ── Helpers ───────────────────────────────────────────────────────────────

const RUBRIC = {
  essayPrompt: 'Explain photosynthesis.',
  checklistItems: [{ category: 'Understanding', points: 5, items: ['Light reactions'] }],
  maxScore: '10',
};

const PROVIDER = { provider: 'ollama', model: 'nomic-embed-text', apiUrl: 'http://localhost:11434' };

const EXAMPLES = {
  total: 3,
  excellent: { id: 1, similarity: 0.98, studentResponse: '[STUDENT]', gradingScore: 9, feedback: 'Excellent.' },
  adequate:  { id: 2, similarity: 0.85, studentResponse: '[STUDENT]', gradingScore: 6, feedback: 'Adequate.' },
  minimal:   { id: 3, similarity: 0.72, studentResponse: '[STUDENT]', gradingScore: 3, feedback: 'Minimal.' },
};

function makeEmbedFetch(embedding = [0.1, 0.2, 0.3]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ embedding, dimensions: embedding.length, model: 'nomic-embed-text' }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('getHistoricalCalibration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCalibrationExamples.mockResolvedValue(EXAMPLES);
    vi.stubGlobal('fetch', makeEmbedFetch());
  });

  it('returns CalibrationExamples when history exists', async () => {
    const result = await getHistoricalCalibration(RUBRIC, PROVIDER);
    expect(result).not.toBeNull();
    expect(result?.total).toBe(3);
    expect(result?.excellent).toBeDefined();
  });

  it('returns null when no history exists (graceful degradation)', async () => {
    mockGetCalibrationExamples.mockResolvedValue({ total: 0 });
    const result = await getHistoricalCalibration(RUBRIC, PROVIDER);
    expect(result).toBeNull();
  });

  it('returns null when embed API fails — does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await getHistoricalCalibration(RUBRIC, PROVIDER);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws — does not crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await getHistoricalCalibration(RUBRIC, PROVIDER);
    expect(result).toBeNull();
  });

  it('calls /api/embed with rubric essayPrompt as text', async () => {
    const mockFetch = makeEmbedFetch();
    vi.stubGlobal('fetch', mockFetch);

    await getHistoricalCalibration(RUBRIC, PROVIDER, 'http://localhost:3456');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3456/api/embed');
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe(RUBRIC.essayPrompt);
  });

  it('passes embeddingModel filter to getCalibrationExamples', async () => {
    await getHistoricalCalibration(RUBRIC, PROVIDER, 'http://localhost:3456', 'nomic-embed-text');
    expect(mockGetCalibrationExamples).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.any(String),
      { embeddingModel: 'nomic-embed-text' }
    );
  });
});
