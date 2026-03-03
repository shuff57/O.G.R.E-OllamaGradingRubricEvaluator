import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock ./vector-store ───────────────────────────────────────────────────
const { mockGetByRubricHash, mockGetAllEmbeddings } = vi.hoisted(() => ({
  mockGetByRubricHash: vi.fn(),
  mockGetAllEmbeddings: vi.fn(),
}));

vi.mock('./vector-store', () => ({
  getEmbeddingsByRubricHash: mockGetByRubricHash,
  getAllEmbeddings: mockGetAllEmbeddings,
}));

// Let cosine-similarity run real (pure math, no side effects)
import { findSimilarResponses, getCalibrationExamples, findSimilarRubrics } from './calibration-retrieval';

// ── Helpers ───────────────────────────────────────────────────────────────

type StoredRow = {
  id: number;
  sessionId: number;
  rubricHash: string;
  studentResponse: string;
  score: number;
  feedback: string;
  embedding: Float32Array;
  embeddingModel: string;
  createdAt: string;
};

function makeRow(id: number, score: number, vec: number[], rubricHash = 'rubric-abc'): StoredRow {
  return {
    id,
    sessionId: 1,
    rubricHash,
    studentResponse: `Response for id=${id}`,
    score,
    feedback: `Feedback ${id}`,
    embedding: new Float32Array(vec),
    embeddingModel: 'nomic-embed-text',
    createdAt: '2025-01-01T00:00:00',
  };
}

// query points along [1, 0, 0]
const QUERY = new Float32Array([1, 0, 0]);

// ── findSimilarResponses ──────────────────────────────────────────────────

describe('findSimilarResponses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when store has no rows', async () => {
    mockGetByRubricHash.mockResolvedValue([]);
    const result = await findSimilarResponses(QUERY, 'rubric-abc');
    expect(result).toEqual([]);
  });

  it('returns top-k results sorted descending by similarity', async () => {
    mockGetByRubricHash.mockResolvedValue([
      makeRow(1, 9, [1, 0, 0]),        // similarity 1.0
      makeRow(2, 6, [0, 1, 0]),        // similarity 0.0 — below threshold
      makeRow(3, 7, [0.9, 0.1, 0]),    // similarity ≈ 0.99
    ]);

    const result = await findSimilarResponses(QUERY, 'rubric-abc', { minSimilarity: 0.5 });
    // Only ids 1 and 3 pass threshold; sorted by similarity desc
    expect(result.length).toBe(2);
    expect(result[0].id).toBe(1);
    expect(result[0].similarity).toBeCloseTo(1.0, 5);
    expect(result[1].id).toBe(3);
  });

  it('does not return results with similarity below minSimilarity', async () => {
    mockGetByRubricHash.mockResolvedValue([
      makeRow(1, 5, [0, 1, 0]),   // orthogonal → 0.0
      makeRow(2, 5, [-1, 0, 0]),  // opposite → -1.0
    ]);
    const result = await findSimilarResponses(QUERY, 'rubric-abc', { minSimilarity: 0.5 });
    expect(result).toHaveLength(0);
  });

  it('result objects have correct shape', async () => {
    mockGetByRubricHash.mockResolvedValue([makeRow(1, 8, [1, 0, 0])]);
    const result = await findSimilarResponses(QUERY, 'rubric-abc');
    expect(result[0]).toMatchObject({
      id: 1,
      similarity: expect.any(Number),
      studentResponse: expect.any(String),
      gradingScore: 8,
      feedback: expect.any(String),
    });
  });

  it('respects embeddingModel filter — passes it to getEmbeddingsByRubricHash', async () => {
    mockGetByRubricHash.mockResolvedValue([]);
    await findSimilarResponses(QUERY, 'rubric-abc', { embeddingModel: 'text-embedding-ada-002' });
    expect(mockGetByRubricHash).toHaveBeenCalledWith('rubric-abc', 'text-embedding-ada-002');
  });

  it('respects k option — returns at most k results', async () => {
    mockGetByRubricHash.mockResolvedValue([
      makeRow(1, 9, [1, 0, 0]),
      makeRow(2, 7, [0.95, 0.05, 0]),
      makeRow(3, 6, [0.9, 0.1, 0]),
    ]);
    const result = await findSimilarResponses(QUERY, 'rubric-abc', { k: 2, minSimilarity: 0 });
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

// ── getCalibrationExamples ────────────────────────────────────────────────

describe('getCalibrationExamples', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns { total: 0 } when no similar responses exist', async () => {
    mockGetByRubricHash.mockResolvedValue([]);
    const result = await getCalibrationExamples(QUERY, 'rubric-abc');
    expect(result).toEqual({ total: 0 });
    expect(result.excellent).toBeUndefined();
  });

  it('tiered examples mirror bridge response tiers: excellent/adequate/minimal', async () => {
    mockGetByRubricHash.mockResolvedValue([
      makeRow(1, 9, [1, 0, 0]),       // highest score → excellent
      makeRow(2, 6, [0.95, 0.05, 0]), // median → adequate
      makeRow(3, 3, [0.9, 0.1, 0]),   // lowest score → minimal
    ]);

    const result = await getCalibrationExamples(QUERY, 'rubric-abc', { minSimilarity: 0 });
    expect(result.total).toBe(3);
    expect(result.excellent?.gradingScore).toBe(9);
    expect(result.minimal?.gradingScore).toBe(3);
    expect(result.adequate?.gradingScore).toBe(6);
  });

  it('with 1 result — only excellent is set', async () => {
    mockGetByRubricHash.mockResolvedValue([makeRow(1, 8, [1, 0, 0])]);
    const result = await getCalibrationExamples(QUERY, 'rubric-abc', { minSimilarity: 0 });
    expect(result.total).toBe(1);
    expect(result.excellent).toBeDefined();
    expect(result.minimal).toBeUndefined();
    expect(result.adequate).toBeUndefined();
  });

  it('with 2 results — excellent and minimal set, adequate undefined', async () => {
    mockGetByRubricHash.mockResolvedValue([
      makeRow(1, 9, [1, 0, 0]),
      makeRow(2, 4, [0.9, 0.1, 0]),
    ]);
    const result = await getCalibrationExamples(QUERY, 'rubric-abc', { minSimilarity: 0 });
    expect(result.total).toBe(2);
    expect(result.excellent).toBeDefined();
    expect(result.minimal).toBeDefined();
    expect(result.adequate).toBeUndefined();
  });
});

// ── findSimilarRubrics ────────────────────────────────────────────────────

describe('findSimilarRubrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no embeddings stored', async () => {
    mockGetAllEmbeddings.mockResolvedValue([]);
    const result = await findSimilarRubrics(QUERY);
    expect(result).toEqual([]);
  });

  it('returns similar rubric hashes sorted by similarity descending', async () => {
    // Two rubrics: 'rubric-a' has similar embed, 'rubric-b' does not
    mockGetAllEmbeddings.mockResolvedValue([
      makeRow(1, 9, [1, 0, 0], 'rubric-a'),
      makeRow(2, 7, [1, 0, 0], 'rubric-a'),
      makeRow(3, 5, [0, 1, 0], 'rubric-b'),  // orthogonal → 0.0, filtered
    ]);

    const result = await findSimilarRubrics(QUERY, { minSimilarity: 0.5 });
    expect(result.length).toBe(1);
    expect(result[0].rubricHash).toBe('rubric-a');
  });

  it('result includes responseCount and meanScore', async () => {
    mockGetAllEmbeddings.mockResolvedValue([
      makeRow(1, 8, [1, 0, 0], 'rubric-a'),
      makeRow(2, 6, [0.9, 0.1, 0], 'rubric-a'),
    ]);

    const result = await findSimilarRubrics(QUERY, { minSimilarity: 0 });
    expect(result[0].responseCount).toBe(2);
    expect(result[0].meanScore).toBeCloseTo(7, 5); // (8+6)/2
  });

  it('result includes rubricHash and similarity', async () => {
    mockGetAllEmbeddings.mockResolvedValue([makeRow(1, 9, [1, 0, 0], 'rubric-xyz')]);
    const result = await findSimilarRubrics(QUERY, { minSimilarity: 0 });
    expect(result[0]).toMatchObject({
      rubricHash: 'rubric-xyz',
      similarity: expect.any(Number),
      responseCount: expect.any(Number),
      meanScore: expect.any(Number),
    });
  });
});
