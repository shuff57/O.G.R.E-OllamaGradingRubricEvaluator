import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSSEStream, parseSSEText } from "./sse-parser";
import type {
  BatchGradingCallbacks,
  CancellationToken,
  BatchProgressEvent,
  BatchChunkEvent,
  BatchSweepEvent,
  BatchOutlierEvent,
  BatchDoneEvent,
  BatchErrorEvent,
} from "./sse-parser";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a mock ReadableStream from an array of string chunks. */
function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const encoded = chunks.map((c) => encoder.encode(c));
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < encoded.length) {
        controller.enqueue(encoded[index++]);
      } else {
        controller.close();
      }
    },
  });
}

/** Build a standard SSE text block from event name and JSON data. */
function sseBlock(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── parseSSEText (synchronous, non-streaming) ───────────────────────────

describe("parseSSEText", () => {
  it("dispatches progress event", () => {
    const onProgress = vi.fn();
    const text = sseBlock("progress", {
      phase: "grading",
      chunkIndex: 0,
      totalChunks: 2,
      studentCount: 10,
      totalStudents: 20,
    });

    parseSSEText(text, { onProgress });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "grading",
        chunkIndex: 0,
        totalChunks: 2,
      }),
    );
  });

  it("dispatches chunk event with results", () => {
    const onChunk = vi.fn();
    const text = sseBlock("chunk", {
      chunkIndex: 0,
      results: [
        { studentIndex: 0, score: 8, feedback: "Good" },
        { studentIndex: 1, score: 6, feedback: "OK" },
      ],
    });

    parseSSEText(text, { onChunk });

    expect(onChunk).toHaveBeenCalledOnce();
    const arg = onChunk.mock.calls[0][0] as BatchChunkEvent;
    expect(arg.chunkIndex).toBe(0);
    expect(arg.results).toHaveLength(2);
    expect(arg.results[0].score).toBe(8);
  });

  it("dispatches sweep event", () => {
    const onSweep = vi.fn();
    const text = sseBlock("sweep", {
      adjustments: [
        { studentIndex: 3, suggestedScore: 7, currentScore: 5, reason: "consistency" },
      ],
      count: 1,
    });

    parseSSEText(text, { onSweep });

    expect(onSweep).toHaveBeenCalledOnce();
    const arg = onSweep.mock.calls[0][0] as BatchSweepEvent;
    expect(arg.count).toBe(1);
    expect(arg.adjustments[0].suggestedScore).toBe(7);
  });

  it("dispatches outlier event", () => {
    const onOutlier = vi.fn();
    const text = sseBlock("outlier", {
      adjustedResults: [{ studentIndex: 5, score: 4, feedback: "Adjusted" }],
    });

    parseSSEText(text, { onOutlier });

    expect(onOutlier).toHaveBeenCalledOnce();
    const arg = onOutlier.mock.calls[0][0] as BatchOutlierEvent;
    expect(arg.adjustedResults[0].studentIndex).toBe(5);
  });

  it("dispatches done event with stats", () => {
    const onDone = vi.fn();
    const text = sseBlock("done", {
      stats: { mean: 7.5, stdDev: 1.2, outliers: 1, adjusted: 1 },
      anchors: { excellent: 9, adequate: 7, belowAverage: 5, minimal: 3 },
      metadata: {
        totalStudents: 20,
        chunks: 2,
        sweepMode: "pairwise",
        sweepAdjustments: 3,
        elapsedSeconds: 12.5,
      },
    });

    parseSSEText(text, { onDone });

    expect(onDone).toHaveBeenCalledOnce();
    const arg = onDone.mock.calls[0][0] as BatchDoneEvent;
    expect(arg.stats.mean).toBe(7.5);
    expect(arg.metadata.totalStudents).toBe(20);
  });

  it("dispatches error event", () => {
    const onError = vi.fn();
    const text = sseBlock("error", { message: "Provider timeout" });

    parseSSEText(text, { onError });

    expect(onError).toHaveBeenCalledOnce();
    const arg = onError.mock.calls[0][0] as BatchErrorEvent;
    expect(arg.message).toBe("Provider timeout");
  });

  it("dispatches multiple events from a single text", () => {
    const onProgress = vi.fn();
    const onChunk = vi.fn();
    const onDone = vi.fn();

    const text = [
      sseBlock("progress", { phase: "grading", chunkIndex: 0, totalChunks: 1 }),
      sseBlock("chunk", { chunkIndex: 0, results: [{ studentIndex: 0, score: 9, feedback: "Great" }] }),
      sseBlock("done", { stats: { mean: 9, stdDev: 0, outliers: 0, adjusted: 0 }, anchors: {}, metadata: {} }),
    ].join("");

    parseSSEText(text, { onProgress, onChunk, onDone });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onChunk).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("skips empty blocks between events", () => {
    const onDone = vi.fn();
    const text = "\n\n\n\n" + sseBlock("done", { stats: {} }) + "\n\n\n";

    parseSSEText(text, { onDone });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("silently ignores unknown event types", () => {
    const callbacks: BatchGradingCallbacks = {
      onProgress: vi.fn(),
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    const text = sseBlock("unknown-event", { foo: "bar" });
    parseSSEText(text, callbacks);

    expect(callbacks.onProgress).not.toHaveBeenCalled();
    expect(callbacks.onChunk).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("silently skips events with malformed JSON data", () => {
    const onProgress = vi.fn();
    const onDone = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const text =
      "event: progress\ndata: {not valid json}\n\n" +
      sseBlock("done", { stats: {} });

    parseSSEText(text, { onProgress, onDone });

    // Malformed event should be skipped, next event still dispatched
    expect(onProgress).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });

  it("handles empty input without errors", () => {
    const onError = vi.fn();
    parseSSEText("", { onError });
    parseSSEText("   \n\n  ", { onError });
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles event with empty data field", () => {
    const onProgress = vi.fn();
    const text = "event: progress\ndata: \n\n";

    parseSSEText(text, { onProgress });

    // Empty data → parsed as {} by dispatchBatchEvent
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it("works with no callbacks provided", () => {
    const text = sseBlock("progress", { phase: "grading" }) +
      sseBlock("done", { stats: {} });

    // Should not throw
    expect(() => parseSSEText(text, {})).not.toThrow();
  });
});

// ── parseSSEStream (async, ReadableStream) ──────────────────────────────

describe("parseSSEStream", () => {
  it("parses events from a single stream chunk", async () => {
    const onProgress = vi.fn();
    const onChunk = vi.fn();
    const onDone = vi.fn();

    const text = [
      sseBlock("progress", { phase: "grading", chunkIndex: 0, totalChunks: 1 }),
      sseBlock("chunk", { chunkIndex: 0, results: [{ studentIndex: 0, score: 8, feedback: "Good" }] }),
      sseBlock("done", { stats: { mean: 8, stdDev: 0, outliers: 0, adjusted: 0 }, anchors: {}, metadata: {} }),
    ].join("");

    const stream = createMockStream([text]);

    await parseSSEStream(stream, { onProgress, onChunk, onDone });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onChunk).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("reassembles events split across multiple chunks", async () => {
    const onProgress = vi.fn();
    const onDone = vi.fn();

    // Split an event across two stream chunks
    const progressBlock = sseBlock("progress", { phase: "grading" });
    const doneBlock = sseBlock("done", { stats: {} });

    // Split mid-event: first chunk has progress + partial done, second has rest
    const splitPoint = progressBlock.length + Math.floor(doneBlock.length / 2);
    const fullText = progressBlock + doneBlock;
    const chunk1 = fullText.slice(0, splitPoint);
    const chunk2 = fullText.slice(splitPoint);

    const stream = createMockStream([chunk1, chunk2]);

    await parseSSEStream(stream, { onProgress, onDone });

    expect(onProgress).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("processes remaining buffer after stream ends", async () => {
    const onDone = vi.fn();

    // Stream content that doesn't end with double-newline
    const text = "event: done\ndata: {}";

    const stream = createMockStream([text]);

    await parseSSEStream(stream, { onDone });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("stops processing when cancellation token is set", async () => {
    const onDone = vi.fn();

    const token: CancellationToken & { cancelled: boolean } = { cancelled: false };

    // Cancel when onProgress fires — this ensures the first event is dispatched
    // but subsequent events in the next chunk are skipped.
    const onProgress = vi.fn().mockImplementation(() => {
      token.cancelled = true;
    });

    // Two separate stream chunks — progress in first, done in second
    const chunk1 = sseBlock("progress", { phase: "grading" });
    const chunk2 = sseBlock("done", { stats: {} });

    const stream = createMockStream([chunk1, chunk2]);

    await parseSSEStream(stream, { onProgress, onDone }, token);

    expect(onProgress).toHaveBeenCalledOnce();
    // onDone should NOT fire because we cancelled after progress dispatched
    expect(onDone).not.toHaveBeenCalled();
  });

  it("skips empty blocks in stream", async () => {
    const onDone = vi.fn();

    const text = "\n\n\n\n" + sseBlock("done", { stats: {} }) + "\n\n";
    const stream = createMockStream([text]);

    await parseSSEStream(stream, { onDone });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("handles all event types through stream", async () => {
    const callbacks: Required<BatchGradingCallbacks> = {
      onProgress: vi.fn(),
      onChunk: vi.fn(),
      onSweep: vi.fn(),
      onOutlier: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    const text = [
      sseBlock("progress", { phase: "grading" }),
      sseBlock("chunk", { chunkIndex: 0, results: [] }),
      sseBlock("sweep", { adjustments: [], count: 0 }),
      sseBlock("outlier", { adjustedResults: [] }),
      sseBlock("done", { stats: {}, anchors: {}, metadata: {} }),
      sseBlock("error", { message: "test" }),
    ].join("");

    const stream = createMockStream([text]);
    await parseSSEStream(stream, callbacks);

    expect(callbacks.onProgress).toHaveBeenCalledOnce();
    expect(callbacks.onChunk).toHaveBeenCalledOnce();
    expect(callbacks.onSweep).toHaveBeenCalledOnce();
    expect(callbacks.onOutlier).toHaveBeenCalledOnce();
    expect(callbacks.onDone).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledOnce();
  });

  it("handles stream with many small chunks", async () => {
    const onChunk = vi.fn();

    // Send each character as a separate chunk (worst-case fragmentation)
    const fullText = sseBlock("chunk", { chunkIndex: 0, results: [{ studentIndex: 0, score: 7, feedback: "OK" }] });
    const chars = fullText.split("").map((c) => c);

    const stream = createMockStream(chars);
    await parseSSEStream(stream, { onChunk });

    expect(onChunk).toHaveBeenCalledOnce();
    expect(onChunk.mock.calls[0][0].results[0].score).toBe(7);
  });

  it("works with no cancellation token provided", async () => {
    const onDone = vi.fn();

    const stream = createMockStream([sseBlock("done", { stats: {} })]);
    await parseSSEStream(stream, { onDone });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("handles malformed JSON in stream without crashing", async () => {
    const onProgress = vi.fn();
    const onDone = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const text =
      "event: progress\ndata: {invalid}\n\n" +
      sseBlock("done", { stats: {} });

    const stream = createMockStream([text]);
    await parseSSEStream(stream, { onProgress, onDone });

    // Malformed event skipped, done still dispatched
    expect(onProgress).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });
});
