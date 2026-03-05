/**
 * Re-embed migration pipeline.
 * Iterates ALL stored embeddings and re-embeds each student response
 * using the currently configured embedding provider/model.
 * Overwrites embeddings in place — no deletions, no schema changes.
 */

import { getAllEmbeddingsUnfiltered, updateEmbedding } from './vector-store';
import { getHandshakeToken } from './provider-sync';

const SERVER_URL = 'http://localhost:3456';

export interface ReEmbedResult {
  updated: number;
  failed: number;
}

/**
 * Re-embed every stored embedding using a new provider/model.
 * Sequential processing — one embedding at a time.
 *
 * @param newProvider - Embedding provider id (e.g. 'local', 'openai', 'ollama')
 * @param newModel - Model name (e.g. 'Xenova/all-MiniLM-L6-v2', 'text-embedding-ada-002')
 * @param onProgress - Called after each row with (done, total)
 * @param apiKey - API key for cloud providers (optional)
 * @param apiUrl - API URL for cloud providers (optional)
 * @returns Count of updated and failed embeddings
 */
export async function reEmbedAll(
  newProvider: string,
  newModel: string,
  onProgress: (done: number, total: number) => void,
  apiKey?: string,
  apiUrl?: string,
): Promise<ReEmbedResult> {
  const allEmbeddings = await getAllEmbeddingsUnfiltered();
  const total = allEmbeddings.length;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < allEmbeddings.length; i++) {
    const row = allEmbeddings[i];

    // Skip rows with no student response — nothing to embed
    if (!row.studentResponse || row.studentResponse.trim() === '') {
      updated++;
      onProgress(i + 1, total);
      continue;
    }

    try {
      const body: Record<string, string> = {
        provider: newProvider,
        text: row.studentResponse,
        model: newModel,
      };
      if (apiKey) body.apiKey = apiKey;
      if (apiUrl) body.apiUrl = apiUrl;

      const token = getHandshakeToken();
      const res = await fetch(`${SERVER_URL}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.warn(`[re-embed] failed for id=${row.id}: HTTP ${res.status}`);
        failed++;
        onProgress(i + 1, total);
        continue;
      }

      const { embedding } = (await res.json()) as {
        embedding: number[];
        dimensions: number;
        model: string;
      };

      await updateEmbedding(row.id, new Float32Array(embedding), newModel);
      updated++;
    } catch (err) {
      console.warn(`[re-embed] error for id=${row.id}:`, err);
      failed++;
    }

    onProgress(i + 1, total);
  }

  return { updated, failed };
}
