import { describe, test, expect, beforeAll } from 'vitest';
import { generateLocalEmbedding, isModelLoaded } from '../local-embedder.js';

/**
 * Integration tests for local-embedder.js.
 * Uses the REAL Xenova/all-MiniLM-L6-v2 model — NO mocking.
 * First run may take up to 15s to download/cache the model.
 */

describe('isModelLoaded', () => {
  test('returns false before any embedding call', () => {
    // The module is freshly loaded — extractor is null
    expect(isModelLoaded()).toBe(false);
  });
});

describe('generateLocalEmbedding', () => {
  /** @type {{ embedding: number[], dimensions: number, model: string }} */
  let result1;
  /** @type {{ embedding: number[], dimensions: number, model: string }} */
  let result2;
  /** @type {{ embedding: number[], dimensions: number, model: string }} */
  let result3;

  // Load model once for all tests in this describe block
  beforeAll(async () => {
    result1 = await generateLocalEmbedding('hello world');
    result2 = await generateLocalEmbedding('hello world');
    result3 = await generateLocalEmbedding('This student showed partial work using substitution');
  }, 60000);

  test('returns an array of length 384', () => {
    expect(Array.isArray(result1.embedding)).toBe(true);
    expect(result1.embedding.length).toBe(384);
    expect(result1.dimensions).toBe(384);
  });

  test('all values are finite numbers (no NaN, no Infinity)', () => {
    for (const v of result1.embedding) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test('same text produces identical vectors (deterministic)', () => {
    expect(result1.embedding.length).toBe(result2.embedding.length);
    for (let i = 0; i < result1.embedding.length; i++) {
      expect(result1.embedding[i]).toBe(result2.embedding[i]);
    }
  });

  test('different text produces different vectors', () => {
    const anyDiffers = result1.embedding.some((v, i) => v !== result3.embedding[i]);
    expect(anyDiffers).toBe(true);
  });

  test('returns model name matching Xenova/all-MiniLM-L6-v2', () => {
    expect(result1.model).toBe('Xenova/all-MiniLM-L6-v2');
  });
});

describe('isModelLoaded (after embed)', () => {
  test('returns true after generateLocalEmbedding has been called', async () => {
    // By the time this describe block runs, beforeAll above has loaded the model
    // (vitest runs describes sequentially in file order)
    expect(isModelLoaded()).toBe(true);
  });
});
