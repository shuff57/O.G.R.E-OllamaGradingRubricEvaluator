import { describe, it, expect } from 'vitest';
import { cosineSimilarity, findTopK } from './cosine-similarity';

describe('cosineSimilarity', () => {
  it('identical vectors → 1.0', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 6);
  });

  it('orthogonal vectors → 0.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 6);
  });

  it('opposite vectors → -1.0', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 6);
  });

  it('zero vector → returns 0 (no NaN)', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    const result = cosineSimilarity(a, b);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('both zero vectors → returns 0 (no NaN)', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    const result = cosineSimilarity(a, b);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('mismatched dimensions → throws Error', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(() => cosineSimilarity(a, b)).toThrow(Error);
  });

  it('normalized unit vectors → consistent result', () => {
    const a = new Float32Array([1 / Math.sqrt(2), 1 / Math.sqrt(2)]);
    const b = new Float32Array([1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 5);
  });
});

describe('findTopK', () => {
  const makeVec = (vals: number[]) => new Float32Array(vals);

  const candidates = [
    { id: 1, embedding: makeVec([1, 0, 0]) },
    { id: 2, embedding: makeVec([0, 1, 0]) },
    { id: 3, embedding: makeVec([0.9, 0.1, 0]) },
    { id: 4, embedding: makeVec([0, 0, 1]) },
    { id: 5, embedding: makeVec([-1, 0, 0]) },
  ];

  const query = makeVec([1, 0, 0]); // points in direction of id=1 and opposite of id=5

  it('returns top-k results sorted descending by score', () => {
    const results = findTopK(query, candidates, 3);
    expect(results).toHaveLength(3);
    // id=1 should be first (cos=1.0), id=3 second (cos≈0.99), id=2 third (cos=0)
    expect(results[0].id).toBe(1);
    expect(results[0].score).toBeCloseTo(1.0, 5);
    // scores must be descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('k > candidates.length → returns all candidates', () => {
    const results = findTopK(query, candidates, 100);
    expect(results).toHaveLength(candidates.length);
  });

  it('empty candidates → returns []', () => {
    const results = findTopK(query, [], 5);
    expect(results).toHaveLength(0);
  });

  it('k=1 → returns only the best match', () => {
    const results = findTopK(query, candidates, 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(1);
  });

  it('result objects have id and score fields', () => {
    const results = findTopK(query, candidates, 2);
    for (const r of results) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.score).toBe('number');
    }
  });

  it('performance: 600 candidates × 384 dims in <50ms', () => {
    const dim = 384;
    const count = 600;
    const q = new Float32Array(dim).fill(0.1);
    const bigCandidates = Array.from({ length: count }, (_, i) => ({
      id: i,
      embedding: new Float32Array(dim).fill(i % 10 === 0 ? 0.9 : 0.1),
    }));
    const start = performance.now();
    findTopK(q, bigCandidates, 5);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
