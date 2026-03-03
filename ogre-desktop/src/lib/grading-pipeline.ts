/**
 * Post-grading embedding storage pipeline.
 * Sanitizes student responses, generates embeddings via grading server,
 * and stores them in SQLite for historical calibration.
 */

import { sanitizeForStorage } from './privacy';
import { storeEmbedding } from './vector-store';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Rubric {
  essayPrompt: string;
  checklistItems: unknown[];
  rubricItems?: unknown[];
  modelText?: string;
  maxScore?: string;
}

export interface GradingResult {
  studentIndex: number;
  score: number;
  feedback: string;
}

export interface StorageSummary {
  stored: number;
  skipped: number;
  errors: number;
}

// ── computeRubricHash ─────────────────────────────────────────────────────

/**
 * Compute a stable SHA-256 hash from a rubric's identity fields.
 * Uses essayPrompt + checklistItems for consistent identity across sessions.
 * @returns Full 64-character hex hash
 */
export async function computeRubricHash(rubric: Rubric): Promise<string> {
  const canonical = (rubric.essayPrompt ?? '') + JSON.stringify(rubric.checklistItems ?? []);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── storeGradingResults ───────────────────────────────────────────────────

type TaskResult = 'stored' | 'skipped' | 'error';

/**
 * Post-grading pipeline: embed and store student responses for future calibration.
 * Skips empty responses, strips student names, calls /api/embed on grading server.
 * Uses Promise.allSettled — individual failures do NOT abort the batch.
 *
 * @param params.sessionId - ID of the grading session (for linkage)
 * @param params.rubric - Rubric definition used for hashing
 * @param params.students - Original student data (name + response)
 * @param params.results - Grading output (studentIndex, score, feedback)
 * @param params.providerConfig - AI provider config passed to /api/embed
 * @param params.serverUrl - Grading server base URL (default: http://localhost:3456)
 * @returns Summary of how many responses were stored / skipped / errored
 */
export async function storeGradingResults(params: {
  sessionId: number;
  rubric: Rubric;
  students: Array<{ name?: string | null; response?: string | null }>;
  results: GradingResult[];
  providerConfig: { provider: string; model: string; apiUrl?: string; apiKey?: string };
  serverUrl?: string;
}): Promise<StorageSummary> {
  const { sessionId, rubric, students, results, providerConfig, serverUrl = 'http://localhost:3456' } = params;

  const rubricHash = await computeRubricHash(rubric);

  const tasks: Promise<TaskResult>[] = results.map(async (result): Promise<TaskResult> => {
    const student = students[result.studentIndex];
    const responseText = student?.response;

    // Skip empty or missing responses
    if (!responseText || responseText.trim() === '') {
      return 'skipped';
    }

    try {
      // Strip student name (FERPA compliance)
      const { sanitizedResponse } = await sanitizeForStorage(
        responseText,
        student?.name ?? null
      );

      // Embed via grading server's /api/embed endpoint
      const embedRes = await fetch(`${serverUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey: providerConfig.apiKey,
          apiUrl: providerConfig.apiUrl,
          text: sanitizedResponse,
        }),
      });

      if (!embedRes.ok) {
        console.warn(`[grading-pipeline] embed failed for student ${result.studentIndex}: HTTP ${embedRes.status}`);
        return 'error';
      }

      const { embedding } = (await embedRes.json()) as {
        embedding: number[];
        dimensions: number;
        model: string;
      };

      // Store in SQLite
      await storeEmbedding({
        sessionId,
        rubricHash,
        studentResponse: sanitizedResponse,
        score: result.score,
        feedback: result.feedback ?? null,
        embedding: new Float32Array(embedding),
        embeddingModel: providerConfig.model,
      });

      return 'stored';
    } catch (err) {
      console.warn(`[grading-pipeline] error for student ${result.studentIndex}:`, err);
      return 'error';
    }
  });

  const outcomes = await Promise.allSettled(tasks);

  let stored = 0;
  let skipped = 0;
  let errors = 0;

  for (const o of outcomes) {
    if (o.status === 'rejected') {
      errors++;
    } else if (o.value === 'stored') {
      stored++;
    } else if (o.value === 'skipped') {
      skipped++;
    } else {
      errors++;
    }
  }

  return { stored, skipped, errors };
}
