/**
 * Vector store CRUD module for response_embeddings table.
 * Pure SQLite CRUD — no similarity search here (that's calibration-retrieval.ts).
 */

import { initDB, type ResponseEmbedding } from './db';

// ── Types ─────────────────────────────────────────────────────────────────

export interface StoredEmbedding {
  id: number;
  sessionId: number | null;
  rubricHash: string;
  studentResponse: string | null;
  score: number;
  feedback: string | null;
  embedding: Float32Array;
  embeddingModel: string;
  createdAt: string;
}

// ── Serialization Helpers ─────────────────────────────────────────────────

/**
 * Convert Float32Array to Uint8Array for SQLite BLOB storage.
 * @param arr - Float32Array of embedding values
 * @returns Uint8Array byte representation
 */
export function float32ToBuffer(arr: Float32Array): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Convert Uint8Array (from SQLite BLOB) back to Float32Array.
 * Copies the buffer to guarantee zero byteOffset before wrapping.
 * @param data - Raw bytes from SQLite
 * @returns Float32Array of embedding values
 */
export function bufferToFloat32(data: Uint8Array): Float32Array {
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Float32Array(copy);
}

// ── Row Mapper ────────────────────────────────────────────────────────────

function rowToStoredEmbedding(row: ResponseEmbedding): StoredEmbedding {
  return {
    id: row.id,
    sessionId: row.session_id,
    rubricHash: row.rubric_hash,
    studentResponse: row.student_response,
    score: row.score,
    feedback: row.feedback,
    embedding: bufferToFloat32(row.embedding),
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
  };
}

// ── CRUD Functions ────────────────────────────────────────────────────────

/**
 * Insert a new embedding record.
 * @returns Inserted row ID
 */
export async function storeEmbedding(params: {
  sessionId: number | null;
  rubricHash: string;
  studentResponse: string | null;
  score: number;
  feedback: string | null;
  embedding: Float32Array;
  embeddingModel: string;
}): Promise<number> {
  const database = await initDB();
  const result = await database.execute(
    `INSERT INTO response_embeddings
       (session_id, rubric_hash, student_response, score, feedback, embedding, embedding_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.sessionId,
      params.rubricHash,
      params.studentResponse,
      params.score,
      params.feedback,
      float32ToBuffer(params.embedding),
      params.embeddingModel,
    ]
  );
  return result.lastInsertId;
}

/**
 * Retrieve all embeddings for a given rubric hash.
 * Optionally filter by embedding model for cross-model compatibility.
 */
export async function getEmbeddingsByRubricHash(
  rubricHash: string,
  embeddingModel?: string
): Promise<StoredEmbedding[]> {
  const database = await initDB();
  const rows = embeddingModel
    ? await database.select<ResponseEmbedding[]>(
        'SELECT * FROM response_embeddings WHERE rubric_hash = $1 AND embedding_model = $2 ORDER BY id',
        [rubricHash, embeddingModel]
      )
    : await database.select<ResponseEmbedding[]>(
        'SELECT * FROM response_embeddings WHERE rubric_hash = $1 ORDER BY id',
        [rubricHash]
      );
  return rows.map(rowToStoredEmbedding);
}

/**
 * Retrieve all stored embeddings, optionally filtered by model.
 */
export async function getAllEmbeddings(embeddingModel?: string): Promise<StoredEmbedding[]> {
  const database = await initDB();
  const rows = embeddingModel
    ? await database.select<ResponseEmbedding[]>(
        'SELECT * FROM response_embeddings WHERE embedding_model = $1 ORDER BY id',
        [embeddingModel]
      )
    : await database.select<ResponseEmbedding[]>(
        'SELECT * FROM response_embeddings ORDER BY id'
      );
  return rows.map(rowToStoredEmbedding);
}

/**
 * Delete all embeddings associated with a grading session.
 */
export async function deleteEmbeddingsBySessionId(sessionId: number): Promise<void> {
  const database = await initDB();
  await database.execute(
    'DELETE FROM response_embeddings WHERE session_id = $1',
    [sessionId]
  );
}

/**
 * Return total count of stored embeddings.
 */
export async function getEmbeddingCount(): Promise<number> {
  const database = await initDB();
  const rows = await database.select<{ count: number }[]>(
    'SELECT COUNT(*) AS count FROM response_embeddings'
  );
  return rows[0]?.count ?? 0;
}
