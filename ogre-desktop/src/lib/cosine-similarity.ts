/**
 * Pure-JS cosine similarity utilities for vector search.
 * No native extensions, no WASM, no new dependencies.
 */

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Returns a value in [-1, 1]. Returns 0 if either vector has zero magnitude.
 * Throws if vectors have different lengths.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Dimension mismatch: a has ${a.length} dims, b has ${b.length} dims`
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

/**
 * Find the top-k most similar candidates to a query vector.
 * Returns results sorted descending by cosine similarity score.
 */
export function findTopK(
  query: Float32Array,
  candidates: { id: number; embedding: Float32Array }[],
  k: number
): { id: number; score: number }[] {
  if (candidates.length === 0) return [];

  const scored = candidates.map(({ id, embedding }) => ({
    id,
    score: cosineSimilarity(query, embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}
