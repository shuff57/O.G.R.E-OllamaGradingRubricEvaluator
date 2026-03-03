/**
 * Pre-grading retrieval orchestrator.
 * Fetches historical calibration examples before a grading session begins.
 * Returns null when no history exists — grading proceeds unchanged (graceful degradation).
 */

import { getCalibrationExamples, type CalibrationExamples } from './calibration-retrieval';
import { computeRubricHash, type Rubric } from './grading-pipeline';

export type { CalibrationExamples };

/**
 * Retrieve historical calibration examples for a given rubric.
 * Embeds the rubric's essay prompt, queries similar past responses,
 * and returns tiered examples for injection into the grading prompt.
 *
 * Returns null if no history exists or if the embed request fails —
 * grading will proceed with standard anchors only.
 *
 * @param rubric - Rubric definition used for hashing and embedding
 * @param providerConfig - AI provider config for /api/embed call
 * @param serverUrl - Grading server base URL (default: http://localhost:3456)
 * @param embeddingModel - Filter retrieval to this model (optional)
 */
export async function getHistoricalCalibration(
  rubric: Rubric,
  providerConfig: { provider: string; model: string; apiUrl?: string; apiKey?: string },
  serverUrl = 'http://localhost:3456',
  embeddingModel?: string
): Promise<CalibrationExamples | null> {
  try {
    // 1. Compute rubric hash for retrieval
    const rubricHash = await computeRubricHash(rubric);

    // 2. Embed the rubric's essay prompt to find similar rubric history
    const embedRes = await fetch(`${serverUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        apiUrl: providerConfig.apiUrl,
        text: rubric.essayPrompt,
      }),
    });

    if (!embedRes.ok) {
      console.warn(`[pre-grading-retrieval] embed failed: HTTP ${embedRes.status}`);
      return null;
    }

    const { embedding } = (await embedRes.json()) as { embedding: number[] };
    const queryEmbedding = new Float32Array(embedding);

    // 3. Retrieve calibration examples for this rubric
    const examples = await getCalibrationExamples(queryEmbedding, rubricHash, {
      embeddingModel,
    });

    // 4. Return null if no history (graceful degradation)
    if (examples.total === 0) return null;

    return examples;
  } catch (err) {
    console.warn('[pre-grading-retrieval] retrieval failed, proceeding without history:', err);
    return null;
  }
}
