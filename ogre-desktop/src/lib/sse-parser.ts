/**
 * SSE stream parser for POST /api/grade batch grading endpoint.
 *
 * Uses fetch + ReadableStream since EventSource doesn't support
 * custom Authorization headers or POST requests.
 *
 * Event types from the server:
 *   progress  — { phase, chunkIndex, totalChunks, studentCount, totalStudents }
 *   chunk     — { chunkIndex, results: [{studentIndex, score, feedback}] }
 *   sweep     — { adjustments, count }
 *   outlier   — { adjustedResults: [{studentIndex, score, feedback}] }
 *   done      — { stats, anchors, metadata }
 *   error     — { message }
 */

// ── Types ────────────────────────────────────────────────────────────────

/** Individual grading result for a single student. */
export interface BatchStudentResult {
  studentIndex: number;
  score: number;
  feedback: string;
  adjusted?: boolean;
  sweepAdjusted?: boolean;
}

/** Progress event — phase updates during batch grading. */
export interface BatchProgressEvent {
  phase: string;
  chunkIndex?: number;
  totalChunks?: number;
  studentCount?: number;
  totalStudents?: number;
  outlierCount?: number;
  mode?: string;
}

/** Chunk event — grading results for a batch of students. */
export interface BatchChunkEvent {
  chunkIndex: number;
  results: BatchStudentResult[];
}

/** Sweep adjustment event — cross-chunk consistency corrections. */
export interface BatchSweepEvent {
  adjustments: Array<{
    studentIndex: number;
    suggestedScore: number;
    currentScore: number;
    reason?: string;
  }>;
  count: number;
}

/** Outlier adjustment event — statistical outlier re-grading. */
export interface BatchOutlierEvent {
  adjustedResults: BatchStudentResult[];
}

/** Done event — final stats and metadata. */
export interface BatchDoneEvent {
  stats: {
    mean: number;
    stdDev: number;
    outliers: number;
    adjusted: number;
  };
  anchors: {
    excellent: number;
    adequate: number;
    belowAverage: number;
    minimal: number;
  };
  metadata: {
    totalStudents: number;
    chunks: number;
    sweepMode: string;
    sweepAdjustments: number;
    elapsedSeconds: number;
  };
}

/** Error event — server-side error during grading. */
export interface BatchErrorEvent {
  message: string;
}

/** Typed callbacks for batch grading SSE events. */
export interface BatchGradingCallbacks {
  /** Phase updates: extracting, grading, calibration, outlier-review, etc. */
  onProgress?: (data: BatchProgressEvent) => void;
  /** Results for a chunk of students. */
  onChunk?: (data: BatchChunkEvent) => void;
  /** Cross-chunk consistency sweep adjustments. */
  onSweep?: (data: BatchSweepEvent) => void;
  /** Outlier review adjustments. */
  onOutlier?: (data: BatchOutlierEvent) => void;
  /** Batch grading completed successfully. */
  onDone?: (data: BatchDoneEvent) => void;
  /** Server-side error. */
  onError?: (data: BatchErrorEvent) => void;
}

/** Cancellation token checked during stream reading. */
export interface CancellationToken {
  readonly cancelled: boolean;
}

// ── Core Parser ──────────────────────────────────────────────────────────

/**
 * Parse a single SSE event block (lines between double-newlines).
 *
 * Handles standard SSE format:
 *   event: <name>\n
 *   data: <payload>\n
 *   id: <id>\n
 *
 * @param block - Raw SSE text block
 * @returns Parsed event name and data, or null if empty
 */
function parseOneEvent(block: string): { event: string; data: string } | null {
  let event = '';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim();
    }
    // id: lines are ignored — not needed for batch grading
  }

  return (event || data) ? { event, data } : null;
}

/**
 * Dispatch a parsed SSE event to the appropriate typed callback.
 *
 * @param event - SSE event name
 * @param rawData - JSON string payload
 * @param callbacks - Event handlers
 */
function dispatchBatchEvent(
  event: string,
  rawData: string,
  callbacks: BatchGradingCallbacks,
): void {
  try {
    const data = rawData ? JSON.parse(rawData) : {};
    switch (event) {
      case 'progress':
        callbacks.onProgress?.(data as BatchProgressEvent);
        break;
      case 'chunk':
        callbacks.onChunk?.(data as BatchChunkEvent);
        break;
      case 'sweep':
        callbacks.onSweep?.(data as BatchSweepEvent);
        break;
      case 'outlier':
        callbacks.onOutlier?.(data as BatchOutlierEvent);
        break;
      case 'done':
        callbacks.onDone?.(data as BatchDoneEvent);
        break;
      case 'error':
        callbacks.onError?.(data as BatchErrorEvent);
        break;
      default:
        // Unknown event type — silently ignore
        break;
    }
  } catch {
    console.warn('[sse-parser] Failed to parse SSE event data:', event, rawData);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Parse a ReadableStream of SSE data from POST /api/grade.
 *
 * Reads chunks from the stream, reassembles SSE event boundaries
 * (double-newline separated), and dispatches typed callbacks.
 *
 * @param body - ReadableStream from fetch response
 * @param callbacks - Event handlers for batch grading events
 * @param token - Optional cancellation token to abort processing
 */
export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: BatchGradingCallbacks,
  token?: CancellationToken,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (token?.cancelled) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double-newline (SSE event boundary)
      const parts = buffer.split('\n\n');
      // Last part may be incomplete — keep as buffer
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (token?.cancelled) break;

        const trimmed = part.trim();
        if (!trimmed) continue;

        const evt = parseOneEvent(trimmed);
        if (evt) {
          dispatchBatchEvent(evt.event, evt.data, callbacks);
        }
      }
    }

    // Process any remaining buffer content
    if (!token?.cancelled && buffer.trim()) {
      const evt = parseOneEvent(buffer.trim());
      if (evt) {
        dispatchBatchEvent(evt.event, evt.data, callbacks);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a complete SSE text response (non-streaming fallback).
 *
 * Used when ReadableStream is not available (e.g., Tauri HTTP plugin
 * returning buffered response).
 *
 * @param text - Complete SSE text response
 * @param callbacks - Event handlers for batch grading events
 */
export function parseSSEText(
  text: string,
  callbacks: BatchGradingCallbacks,
): void {
  const blocks = text.split('\n\n');
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const evt = parseOneEvent(trimmed);
    if (evt) {
      dispatchBatchEvent(evt.event, evt.data, callbacks);
    }
  }
}
