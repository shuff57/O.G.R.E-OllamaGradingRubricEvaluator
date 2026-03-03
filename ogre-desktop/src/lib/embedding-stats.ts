/**
 * Embedding statistics helpers for History page display.
 * Read-only queries — no modification of embedding data.
 */

import { initDB } from './db';

export interface EmbeddingStats {
  totalEmbeddings: number;
  uniqueRubrics: number;
  embeddingModels: string[];
  /** Estimated storage in KB (~1.5 KB per 384-dim float32 vector) */
  estimatedSizeKB: number;
}

/**
 * Aggregate stats about all stored embeddings.
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  const database = await initDB();

  const [countRow] = await database.select<{ count: number }[]>(
    'SELECT COUNT(*) AS count FROM response_embeddings'
  );
  const totalEmbeddings = countRow?.count ?? 0;

  const rubricRows = await database.select<{ rubric_hash: string }[]>(
    'SELECT DISTINCT rubric_hash FROM response_embeddings'
  );
  const uniqueRubrics = rubricRows.length;

  const modelRows = await database.select<{ embedding_model: string }[]>(
    'SELECT DISTINCT embedding_model FROM response_embeddings'
  );
  const embeddingModels = modelRows.map(r => r.embedding_model);

  // ~1.5 KB per 384-dim float32 vector (384 × 4 bytes + row overhead)
  const estimatedSizeKB = Math.round(totalEmbeddings * 1.5);

  return { totalEmbeddings, uniqueRubrics, embeddingModels, estimatedSizeKB };
}

/**
 * Per-session embedding counts for table display.
 * @returns Map from session_id → number of stored embeddings
 */
export async function getSessionEmbeddingCounts(): Promise<Map<number, number>> {
  const database = await initDB();

  const rows = await database.select<{ session_id: number; count: number }[]>(
    `SELECT session_id, COUNT(*) AS count
     FROM response_embeddings
     WHERE session_id IS NOT NULL
     GROUP BY session_id`
  );

  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.session_id, row.count);
  }
  return map;
}
