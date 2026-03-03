import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock ./db ─────────────────────────────────────────────────────────────
const { mockDB } = vi.hoisted(() => ({
  mockDB: { select: vi.fn(), execute: vi.fn() },
}));

vi.mock('./db', () => ({ initDB: vi.fn().mockResolvedValue(mockDB) }));

import { getEmbeddingStats, getSessionEmbeddingCounts } from './embedding-stats';

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

describe('getEmbeddingStats', () => {
  it('returns zeros when no embeddings stored', async () => {
    mockDB.select
      .mockResolvedValueOnce([{ count: 0 }])           // total count
      .mockResolvedValueOnce([])                         // unique rubrics
      .mockResolvedValueOnce([]);                        // models

    const stats = await getEmbeddingStats();
    expect(stats.totalEmbeddings).toBe(0);
    expect(stats.uniqueRubrics).toBe(0);
    expect(stats.embeddingModels).toEqual([]);
    expect(stats.estimatedSizeKB).toBe(0);
  });

  it('returns correct counts from database', async () => {
    mockDB.select
      .mockResolvedValueOnce([{ count: 42 }])
      .mockResolvedValueOnce([{ rubric_hash: 'r1' }, { rubric_hash: 'r2' }])
      .mockResolvedValueOnce([{ embedding_model: 'nomic-embed-text' }, { embedding_model: 'text-embedding-ada-002' }]);

    const stats = await getEmbeddingStats();
    expect(stats.totalEmbeddings).toBe(42);
    expect(stats.uniqueRubrics).toBe(2);
    expect(stats.embeddingModels).toEqual(['nomic-embed-text', 'text-embedding-ada-002']);
  });

  it('estimates size as count × 1.5 KB (rounded)', async () => {
    mockDB.select
      .mockResolvedValueOnce([{ count: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const stats = await getEmbeddingStats();
    expect(stats.estimatedSizeKB).toBe(150); // 100 × 1.5
  });
});

describe('getSessionEmbeddingCounts', () => {
  it('returns empty Map when no embeddings', async () => {
    mockDB.select.mockResolvedValue([]);
    const map = await getSessionEmbeddingCounts();
    expect(map.size).toBe(0);
  });

  it('maps session_id → count correctly', async () => {
    mockDB.select.mockResolvedValue([
      { session_id: 1, count: 12 },
      { session_id: 2, count: 5 },
    ]);

    const map = await getSessionEmbeddingCounts();
    expect(map.get(1)).toBe(12);
    expect(map.get(2)).toBe(5);
    expect(map.size).toBe(2);
  });
});
