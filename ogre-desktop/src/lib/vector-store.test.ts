import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock ./db ─────────────────────────────────────────────────────────────
const { mockDB } = vi.hoisted(() => ({
  mockDB: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('./db', () => ({
  initDB: vi.fn().mockResolvedValue(mockDB),
}));

// Import AFTER mocks are set up
import {
  storeEmbedding,
  getEmbeddingsByRubricHash,
  getAllEmbeddings,
  deleteEmbeddingsBySessionId,
  getEmbeddingCount,
  float32ToBuffer,
  bufferToFloat32,
  type StoredEmbedding,
} from './vector-store';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeFloat32(vals: number[]): Float32Array {
  return new Float32Array(vals);
}

/** Build a mock DB row (ResponseEmbedding shape) with embedding as Uint8Array */
function makeRow(overrides: Record<string, unknown> = {}) {
  const embedding = makeFloat32([0.1, 0.2, 0.3, 0.4]);
  return {
    id: 1,
    session_id: 42,
    rubric_hash: 'rubric-abc',
    student_response: 'The answer is 42.',
    score: 8.5,
    feedback: 'Good work.',
    embedding: float32ToBuffer(embedding),
    embedding_model: 'nomic-embed-text',
    created_at: '2025-01-01T00:00:00',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
  mockDB.select.mockResolvedValue([]);
});

describe('float32ToBuffer / bufferToFloat32 — serialization roundtrip', () => {
  it('roundtrip preserves values exactly', () => {
    const original = makeFloat32([0.1, 0.5, -0.3, 0.99, -1.0, 0.0]);
    const bytes = float32ToBuffer(original);
    const recovered = bufferToFloat32(bytes);
    expect(recovered.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 6);
    }
  });

  it('bufferToFloat32 produces correct length', () => {
    const arr = makeFloat32([1, 2, 3, 4, 5]);
    const buf = float32ToBuffer(arr);
    expect(buf.byteLength).toBe(arr.byteLength); // 5 × 4 = 20 bytes
    expect(bufferToFloat32(buf).length).toBe(5);
  });

  it('empty array roundtrip works', () => {
    const arr = new Float32Array(0);
    const buf = float32ToBuffer(arr);
    expect(bufferToFloat32(buf).length).toBe(0);
  });
});

describe('storeEmbedding', () => {
  it('calls execute with correct parameters and returns inserted id', async () => {
    mockDB.execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });

    const id = await storeEmbedding({
      sessionId: 42,
      rubricHash: 'rubric-abc',
      studentResponse: 'Some response.',
      score: 9,
      feedback: 'Excellent.',
      embedding: makeFloat32([0.1, 0.2, 0.3]),
      embeddingModel: 'nomic-embed-text',
    });

    expect(id).toBe(7);
    expect(mockDB.execute).toHaveBeenCalledOnce();
    const [sql, params] = mockDB.execute.mock.calls[0];
    expect(sql).toContain('INSERT INTO response_embeddings');
    expect(params).toContain(42);          // sessionId
    expect(params).toContain('rubric-abc'); // rubricHash
    expect(params).toContain(9);           // score
  });

  it('sends embedding as byte array (Uint8Array)', async () => {
    const embedding = makeFloat32([0.5, -0.5]);
    await storeEmbedding({
      sessionId: 1,
      rubricHash: 'r',
      studentResponse: 'x',
      score: 5,
      feedback: null,
      embedding,
      embeddingModel: 'model',
    });
    const [, params] = mockDB.execute.mock.calls[0];
    // The embedding param should be a Uint8Array (not the raw Float32Array)
    const embeddingParam = params.find((p: unknown) => p instanceof Uint8Array);
    expect(embeddingParam).toBeDefined();
    expect(embeddingParam.byteLength).toBe(embedding.byteLength);
  });
});

describe('getEmbeddingsByRubricHash', () => {
  it('returns empty array when no rows match', async () => {
    mockDB.select.mockResolvedValue([]);
    const result = await getEmbeddingsByRubricHash('unknown-rubric');
    expect(result).toEqual([]);
  });

  it('returns StoredEmbedding[] with Float32Array embeddings', async () => {
    const row = makeRow();
    mockDB.select.mockResolvedValue([row]);

    const result = await getEmbeddingsByRubricHash('rubric-abc');
    expect(result).toHaveLength(1);
    const item = result[0] as StoredEmbedding;
    expect(item.embedding).toBeInstanceOf(Float32Array);
    expect(item.rubricHash).toBe('rubric-abc');
    expect(item.score).toBe(8.5);
  });

  it('passes model filter in query when provided', async () => {
    mockDB.select.mockResolvedValue([]);
    await getEmbeddingsByRubricHash('rubric-abc', 'nomic-embed-text');
    const [sql, params] = mockDB.select.mock.calls[0];
    expect(params).toContain('nomic-embed-text');
    expect(sql).toContain('embedding_model');
  });

  it('does not include model filter when not provided', async () => {
    mockDB.select.mockResolvedValue([]);
    await getEmbeddingsByRubricHash('rubric-abc');
    const [sql] = mockDB.select.mock.calls[0];
    expect(sql).not.toContain('embedding_model');
  });
});

describe('getAllEmbeddings', () => {
  it('returns all rows when no model filter', async () => {
    mockDB.select.mockResolvedValue([makeRow(), makeRow({ id: 2 })]);
    const result = await getAllEmbeddings();
    expect(result).toHaveLength(2);
  });

  it('passes model filter when provided', async () => {
    mockDB.select.mockResolvedValue([]);
    await getAllEmbeddings('text-embedding-ada-002');
    const [sql, params] = mockDB.select.mock.calls[0];
    expect(params).toContain('text-embedding-ada-002');
    expect(sql).toContain('embedding_model');
  });

  it('converts embedding BLOB to Float32Array for each row', async () => {
    mockDB.select.mockResolvedValue([makeRow(), makeRow({ id: 2 })]);
    const result = await getAllEmbeddings();
    for (const item of result) {
      expect(item.embedding).toBeInstanceOf(Float32Array);
    }
  });
});

describe('deleteEmbeddingsBySessionId', () => {
  it('calls execute with correct session id', async () => {
    await deleteEmbeddingsBySessionId(99);
    expect(mockDB.execute).toHaveBeenCalledOnce();
    const [sql, params] = mockDB.execute.mock.calls[0];
    expect(sql).toContain('DELETE FROM response_embeddings');
    expect(params).toContain(99);
  });
});

describe('getEmbeddingCount', () => {
  it('returns count from database', async () => {
    mockDB.select.mockResolvedValue([{ count: 42 }]);
    const count = await getEmbeddingCount();
    expect(count).toBe(42);
  });

  it('returns 0 when table is empty', async () => {
    mockDB.select.mockResolvedValue([{ count: 0 }]);
    const count = await getEmbeddingCount();
    expect(count).toBe(0);
  });
});
