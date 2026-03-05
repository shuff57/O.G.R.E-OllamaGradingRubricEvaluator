/**
 * Calibration retrieval service.
 * Finds similar past graded responses to use as calibration examples for AI grading.
 */

import { getEmbeddingsByRubricHash, getAllEmbeddings, type StoredEmbedding } from './vector-store';
import { cosineSimilarity, findTopK } from './cosine-similarity';

// ── Types ─────────────────────────────────────────────────────────────────

export interface SimilarResponse {
  id: number;
  /** Cosine similarity score [−1, 1] */
  similarity: number;
  studentResponse: string;
  gradingScore: number;
  feedback: string;
}

/**
 * Tiered calibration examples mirroring bridge response structure
 * (excellent / adequate / minimal — same tiers as grading.js buildBridgeResponses).
 */
export interface CalibrationExamples {
  excellent?: SimilarResponse;
  adequate?: SimilarResponse;
  minimal?: SimilarResponse;
  total: number;
}

export interface SimilarRubric {
  rubricHash: string;
  /** Average cosine similarity of stored responses to the query embedding */
  similarity: number;
  responseCount: number;
  meanScore: number;
}

// ── findSimilarResponses ──────────────────────────────────────────────────

/**
 * Find past graded responses similar to the query embedding for a given rubric.
 * Returns results sorted descending by cosine similarity.
 * @param queryEmbedding - Embedding of the current student response (or rubric prompt)
 * @param rubricHash - Rubric identity hash — only searches within this rubric's history
 * @param options.k - Max candidates to consider (default 10)
 * @param options.embeddingModel - Only search embeddings from this model
 * @param options.minSimilarity - Minimum similarity threshold (default 0.5)
 */
export async function findSimilarResponses(
  queryEmbedding: Float32Array,
  rubricHash: string,
  options?: { k?: number; embeddingModel?: string; minSimilarity?: number }
): Promise<SimilarResponse[]> {
  const k = options?.k ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.5;

  const embeddingModel = options?.embeddingModel;
  if (!embeddingModel) {
    // embeddingModel is required; graceful no-op when caller hasn't set one yet
    return [];
  }

  const stored = await getEmbeddingsByRubricHash(rubricHash, embeddingModel);
  if (stored.length === 0) return [];

  const candidates = stored.map(s => ({ id: s.id, embedding: s.embedding }));
  const topK = findTopK(queryEmbedding, candidates, k);

  const storedById = new Map<number, StoredEmbedding>(stored.map(s => [s.id, s]));

  return topK
    .filter(r => r.score >= minSimilarity)
    .map(r => {
      const s = storedById.get(r.id)!;
      return {
        id: s.id,
        similarity: r.score,
        studentResponse: s.studentResponse ?? '',
        gradingScore: s.score,
        feedback: s.feedback ?? '',
      };
    });
}

// ── getCalibrationExamples ────────────────────────────────────────────────

/**
 * Get tiered calibration examples (excellent / adequate / minimal) for a rubric.
 * Mirrors the bridge response tier structure in grading.js for prompt injection.
 * Returns { total: 0 } when no history exists (graceful degradation).
 */
export async function getCalibrationExamples(
  queryEmbedding: Float32Array,
  rubricHash: string,
  options?: { embeddingModel?: string; minSimilarity?: number }
): Promise<CalibrationExamples> {
  const similar = await findSimilarResponses(queryEmbedding, rubricHash, {
    k: 10,
    ...options,
  });

  if (similar.length === 0) return { total: 0 };

  // Sort by grading score to assign tiers
  const byScore = [...similar].sort((a, b) => b.gradingScore - a.gradingScore);

  const excellent = byScore[0];
  const minimal = byScore.length >= 2 ? byScore[byScore.length - 1] : undefined;
  const adequate = byScore.length >= 3 ? byScore[Math.floor((byScore.length - 1) / 2)] : undefined;

  return { excellent, adequate, minimal, total: similar.length };
}

// ── findSimilarRubrics ────────────────────────────────────────────────────

/**
 * Find past rubrics with similar embedding centroids to the query.
 * Enables cross-rubric calibration discovery.
 * @param rubricEmbedding - Embedding of the current rubric's essay prompt
 * @param options.k - Max rubrics to return (default 5)
 * @param options.minSimilarity - Minimum similarity threshold (default 0.5)
 * @param options.embeddingModel - Filter by embedding model
 */
export async function findSimilarRubrics(
  rubricEmbedding: Float32Array,
  options?: { k?: number; minSimilarity?: number; embeddingModel?: string }
): Promise<SimilarRubric[]> {
  const k = options?.k ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0.5;

  const embeddingModel = options?.embeddingModel;
  if (!embeddingModel) {
    // embeddingModel is required; graceful no-op when caller hasn't set one yet
    return [];
  }

  const allEmbeddings = await getAllEmbeddings(embeddingModel);
  if (allEmbeddings.length === 0) return [];

  // Group by rubric hash
  const byRubric = new Map<string, StoredEmbedding[]>();
  for (const row of allEmbeddings) {
    const list = byRubric.get(row.rubricHash) ?? [];
    list.push(row);
    byRubric.set(row.rubricHash, list);
  }

  // Compute centroid embedding per rubric and measure similarity
  const rubricCandidates: { id: string; embedding: Float32Array }[] = [];
  const rubricMeta = new Map<string, { responseCount: number; meanScore: number }>();

  let rubricIdx = 0;
  for (const [rubricHash, rows] of byRubric) {
    const dim = rubricEmbedding.length;
    const centroid = new Float32Array(dim);
    for (const row of rows) {
      for (let i = 0; i < Math.min(dim, row.embedding.length); i++) {
        centroid[i] += row.embedding[i];
      }
    }
    for (let i = 0; i < dim; i++) centroid[i] /= rows.length;

    rubricCandidates.push({ id: rubricHash, embedding: centroid });
    rubricMeta.set(rubricHash, {
      responseCount: rows.length,
      meanScore: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    });
    rubricIdx++;
  }

  // findTopK expects numeric ids — work around with index-based approach
  const results: SimilarRubric[] = [];
  for (const candidate of rubricCandidates) {
    const sim = cosineSimilarity(rubricEmbedding, candidate.embedding);
    if (sim >= minSimilarity) {
      const meta = rubricMeta.get(candidate.id)!;
      results.push({
        rubricHash: candidate.id,
        similarity: sim,
        responseCount: meta.responseCount,
        meanScore: meta.meanScore,
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, k);
}
