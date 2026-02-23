/**
 * Grading API client for the desktop app.
 *
 * Communicates with the local grading server's /api/chat endpoint.
 * Uses manual fetch + ReadableStream for SSE parsing because
 * EventSource doesn't support custom Authorization headers.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getHandshakeToken } from "./provider-sync";
import { fetchAvailableModels } from "./oauth";
import { parseSSEStream, parseSSEText } from "./sse-parser";
import { withRetry } from "./ai-retry";
import { buildSkillInjection } from "./skills-api";
import type {
  BatchGradingCallbacks,
  CancellationToken,
} from "./sse-parser";

const SERVER_BASE = "http://localhost:3456";

// ── Types ────────────────────────────────────────────────────────────────

/** A single SSE event parsed from the stream. */
export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

/** Rubric data sent to the server for single-student grading. */
export interface GradeRubric {
  maxScore?: string;
  essayPrompt?: string;
  checklistItems?: Array<{
    category: string;
    points?: number;
    items: string[];
  }>;
  rubricItems?: Array<{
    category: string;
    items: string[];
  }>;
  modelText?: string | null;
}

/** Request parameters for grading a single student. */
export interface GradeRequest {
  /** Student's work/answer text */
  studentWork: string;
  /** Rubric data (required — triggers grader mode on server) */
  rubric?: GradeRubric;
  /** Additional grading instructions (becomes ADDITIONAL INSTRUCTIONS in prompt) */
  instructions?: string;
  /** Provider ID override (defaults to server's active provider) */
  provider?: string;
  /** Model override (defaults to provider's configured model) */
  model?: string;
  /** Callback fired before each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
}

/** Response from the grading server's /api/chat grader mode. */
export interface GradeResponse {
  score: number;
  feedback: string;
  provider: string;
  model: string;
}

/** Callbacks for solver SSE events. */
export interface SolverCallbacks {
  /** Fired when the server acknowledges and starts processing. */
  onStatus?: (data: { status: string; provider: string; model: string }) => void;
  /** Fired when the AI response content arrives. */
  onMessage?: (data: { content: string }) => void;
  /** Fired when the response is complete. */
  onDone?: (data: { provider: string; model: string }) => void;
  /** Fired on server-side error. */
  onError?: (data: { message: string }) => void;
}

/** Options for sendSolverMessage. */
export interface SolverMessageOptions {
  message: string;
  model?: string;
  provider?: string;
  /** System prompt for skill injection (prepended to AI context) */
  systemPrompt?: string;
  /** Callback fired before each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
}

/** Provider configuration returned by GET /api/providers. */
export interface ProviderConfig {
  id: string;
  api_url: string;
  model: string;
  is_active: boolean;
  credentials?: {
    api_key?: string;
    access_token?: string;
    token_type?: string;
  };
}

/** Error codes for provider API failures. */
export type GradingApiErrorCode =
  | "NO_TOKEN"
  | "AUTH_ERROR"
  | "NOT_FOUND"
  | "SERVER_ERROR"
  | "OFFLINE";

/** Typed error for grading API failures with machine-readable code. */
export class GradingApiError extends Error {
  code: GradingApiErrorCode;
  constructor(message: string, code: GradingApiErrorCode) {
    super(message);
    this.name = "GradingApiError";
    this.code = code;
  }
}

// ── SSE Parser ───────────────────────────────────────────────────────────

/**
 * Parse raw SSE text into structured events.
 *
 * Handles the standard SSE format:
 *   event: <name>\n
 *   data: <payload>\n
 *   id: <id>\n
 *   \n
 *
 * @param raw - Complete or partial SSE text
 * @returns Array of parsed SSE events
 */
export function parseSSEEvents(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  // Split on double-newline (event boundary)
  const blocks = raw.split(/\n\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let event = "";
    let data = "";
    let id: string | undefined;

    const lines = trimmed.split("\n");
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim();
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      }
    }

    // Only emit if we have at least an event name or data
    if (event || data) {
      events.push({ event, data, id });
    }
  }

  return events;
}

// ── Auth Helpers ──────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getHandshakeToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Single Student Grading API ────────────────────────────────────────────

/**
 * Grade a single student's work via the grading server.
 *
 * Sends POST /api/chat with a rubric field to trigger grader mode.
 * The server builds a grading prompt (using buildSingleGradePrompt from
 * grading.js), calls the AI provider, and returns { score, feedback }.
 *
 * @param req - Grading request with student work, rubric, and optional overrides
 * @returns Parsed grading result with score, feedback, provider, and model
 * @throws Error if the server returns an error or is unreachable
 */
export async function gradeStudent(req: GradeRequest): Promise<GradeResponse> {
  // Build request body matching POST /api/chat schema:
  //   { message, rubric?, studentWork?, model?, provider? }
  // When rubric is present → grader mode (JSON response)
  // The "message" field is used as additional instructions in the prompt
  const body: Record<string, unknown> = {
    message: req.instructions || "Grade this student work.",
    rubric: req.rubric || { maxScore: "10" },
    studentWork: req.studentWork,
  };

  if (req.provider) body.provider = req.provider;
  if (req.model) body.model = req.model;

  const data = await withRetry(
    async () => {
      const response = await tauriFetch(`${SERVER_BASE}/api/chat`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMessage: string;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || `Grading failed (HTTP ${response.status})`;
        } catch {
          errorMessage = `Grading failed (HTTP ${response.status})`;
        }
        const err = new Error(errorMessage);
        (err as Error & { status: number }).status = response.status;
        throw err;
      }

      return await response.json();
    },
    { onRetry: req.onRetry },
  );

  return {
    score: data.score,
    feedback: data.feedback,
    provider: data.provider,
    model: data.model,
  };
}

// ── Solver Chat API ──────────────────────────────────────────────────────

/**
 * Send a message to the solver chat endpoint with SSE streaming.
 *
 * Uses POST /api/chat without a rubric field, which triggers solver mode
 * on the grading server. The server responds with SSE events:
 *   - status: { status: 'thinking', provider, model }
 *   - message: { content: string }
 *   - done: { provider, model }
 *   - error: { message: string }
 *
 * @param options - Message content and optional provider/model overrides
 * @param callbacks - SSE event handlers
 * @throws Error if the request fails or server returns non-200
 */
export async function sendSolverMessage(
  options: SolverMessageOptions,
  callbacks: SolverCallbacks = {},
): Promise<void> {
  const body: Record<string, string | undefined> = {
    message: options.message,
  };
  if (options.model) body.model = options.model;
  if (options.provider) body.provider = options.provider;
  if (options.systemPrompt) body.systemPrompt = options.systemPrompt;

  const response = await withRetry(
    async () => {
      const res = await tauriFetch(`${SERVER_BASE}/api/chat`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let errorMsg = `Server error ${res.status}`;
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch {
          /* Use status-based message */
        }
        const err = new Error(errorMsg);
        (err as Error & { status: number }).status = res.status;
        throw err;
      }

      return res;
    },
    { onRetry: options.onRetry },
  );

  // Read the SSE stream.
  // Try ReadableStream first (streaming), fall back to .text() (buffered).
  if (response.body && typeof response.body.getReader === "function") {
    await readSSEStream(response.body, callbacks);
  } else {
    // Fallback: read entire response as text and parse SSE events
    const text = await response.text();
    dispatchSSEEvents(text, callbacks);
  }
}

/**
 * Read SSE events from a ReadableStream, dispatching callbacks as events arrive.
 */
async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: SolverCallbacks,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events (separated by double newlines)
      const parts = buffer.split("\n\n");
      // Keep the last part as buffer (may be incomplete)
      buffer = parts.pop() || "";

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const events = parseSSEEvents(trimmed);
        for (const evt of events) {
          dispatchSingleEvent(evt, callbacks);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const events = parseSSEEvents(buffer);
      for (const evt of events) {
        dispatchSingleEvent(evt, callbacks);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse and dispatch all SSE events from a complete text response.
 */
function dispatchSSEEvents(text: string, callbacks: SolverCallbacks): void {
  const events = parseSSEEvents(text);
  for (const evt of events) {
    dispatchSingleEvent(evt, callbacks);
  }
}

/**
 * Dispatch a single SSE event to the appropriate callback.
 */
function dispatchSingleEvent(evt: SSEEvent, callbacks: SolverCallbacks): void {
  try {
    const data = evt.data ? JSON.parse(evt.data) : {};
    switch (evt.event) {
      case "status":
        callbacks.onStatus?.(data);
        break;
      case "message":
        callbacks.onMessage?.(data);
        break;
      case "done":
        callbacks.onDone?.(data);
        break;
      case "error":
        callbacks.onError?.(data);
        break;
    }
  } catch {
    // JSON parse failure — skip this event
    console.warn("[grading-api] Failed to parse SSE event data:", evt);
  }
}

// ── Provider API ─────────────────────────────────────────────────────────

/**
 * Check whether an error indicates the server is unreachable.
 * Useful for showing an "offline" banner instead of a hard error.
 */
export function isServerOffline(error: unknown): boolean {
  if (error instanceof GradingApiError) {
    return error.code === "OFFLINE" || error.code === "NO_TOKEN";
  }
  // tauriFetch throws on network failure — check common patterns
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("connection") ||
    msg.includes("refused") ||
    msg.includes("network") ||
    msg.includes("fetch")
  );
}

/**
 * Map server provider IDs to the oauth.ts provider type keys.
 *
 *   Server ID       → oauth key
 *   github-models   → github
 *   google-gemini   → google
 *   ollama*         → ollama
 *   openai          → openai
 *   anthropic       → anthropic
 */
function mapProviderIdToOAuth(
  id: string,
): "github" | "openai" | "anthropic" | "google" | "ollama" {
  switch (id) {
    case "github-models":
      return "github";
    case "google-gemini":
      return "google";
    case "ollama-local":
    case "ollama-cloud":
    case "ollama":
      return "ollama";
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    default:
      return id as "openai"; // best-effort fallback
  }
}

/**
 * Fetch the list of configured providers from the grading server.
 * Requires a valid handshake token (call pushProvidersToServer first).
 */
export async function fetchProviders(): Promise<ProviderConfig[]> {
  const token = getHandshakeToken();
  if (!token) {
    throw new GradingApiError(
      "Not connected to grading server — no handshake token",
      "NO_TOKEN",
    );
  }

  let res: Response;
  try {
    res = await tauriFetch(`${SERVER_BASE}/api/providers`, {
      method: "GET",
      headers: authHeaders(),
    });
  } catch {
    throw new GradingApiError("Cannot reach grading server", "OFFLINE");
  }

  if (res.status === 401 || res.status === 403) {
    throw new GradingApiError("Authentication failed", "AUTH_ERROR");
  }
  if (!res.ok) {
    throw new GradingApiError(
      `Failed to fetch providers: ${res.status}`,
      "SERVER_ERROR",
    );
  }

  const data = await res.json();
  return data.providers ?? [];
}

/**
 * Tell the grading server which provider + model to use.
 * The server marks that provider active and persists to config.
 */
export async function setActiveProvider(
  providerId: string,
  model: string,
): Promise<void> {
  const token = getHandshakeToken();
  if (!token) {
    throw new GradingApiError(
      "Not connected to grading server — no handshake token",
      "NO_TOKEN",
    );
  }

  let res: Response;
  try {
    res = await tauriFetch(`${SERVER_BASE}/api/providers/active`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ provider_id: providerId, model }),
    });
  } catch {
    throw new GradingApiError("Cannot reach grading server", "OFFLINE");
  }

  if (res.status === 401 || res.status === 403) {
    throw new GradingApiError("Authentication failed", "AUTH_ERROR");
  }
  if (res.status === 404) {
    throw new GradingApiError(
      `Provider not found: ${providerId}`,
      "NOT_FOUND",
    );
  }
  if (!res.ok) {
    throw new GradingApiError(
      `Failed to set active provider: ${res.status}`,
      "SERVER_ERROR",
    );
  }
}

/**
 * Fetch the available models for a given provider.
 * Delegates to oauth.ts's fetchAvailableModels which calls
 * provider APIs directly (Ollama /api/tags, OpenAI /v1/models, etc.).
 */
export async function fetchModels(providerId: string): Promise<string[]> {
  const oauthProvider = mapProviderIdToOAuth(providerId);
  return fetchAvailableModels(oauthProvider);
}

// ── Batch Grading API ────────────────────────────────────────────────────

/** Re-export SSE callback types for consumers. */
export type { BatchGradingCallbacks, CancellationToken } from "./sse-parser";
export type {
  BatchStudentResult,
  BatchProgressEvent,
  BatchChunkEvent,
  BatchSweepEvent,
  BatchOutlierEvent,
  BatchDoneEvent,
  BatchErrorEvent,
} from "./sse-parser";

/** Request parameters for batch grading via POST /api/grade. */
export interface BatchGradingRequest {
  /** Provider ID (defaults to server's active provider) */
  provider?: string;
  /** Model override (defaults to provider's configured model) */
  model?: string;
  /** Rubric data extracted from the grading page */
  rubric: {
    essayPrompt?: string;
    checklistItems?: Array<{ category: string; items: string[] }>;
    rubricItems?: Array<{ category: string; items: string[] }>;
    modelText?: string | null;
    maxScore?: string;
  };
  /** Students to grade (filtered — only ungraded students) */
  students: Array<{
    index: number;
    name: string;
    response: string;
  }>;
  /** Grading strategy: 'serial' (default) or 'parallel' */
  strategy?: "serial" | "parallel";
  /** Students per AI call (default: 30, clamped 5–50) */
  chunkSize?: number;
  /** Consistency sweep: 'none', 'compact', 'pairwise', 'auto' (default) */
  sweep?: "none" | "compact" | "pairwise" | "auto";
  /** Custom grading instructions (appended to system prompt) */
  customInstructions?: string;
}

/** Handle returned by startBatchGrading for cancellation. */
export interface BatchGradingHandle {
  /** Cancel the batch grading request. Stops processing SSE events. */
  cancel: () => void;
}

/**
 * Start batch grading via POST /api/grade SSE endpoint.
 *
 * Sends all students + rubric to the grading server which grades them
 * in intelligent chunks with scoring anchors, cross-chunk consistency
 * sweeps, and outlier detection. Results stream back as SSE events.
 *
 * @param request - Rubric, students, and optional provider/model/strategy
 * @param callbacks - Typed event handlers for progress, results, completion
 * @returns Handle with cancel() method for stopping the stream
 */
export function startBatchGrading(
  request: BatchGradingRequest,
  callbacks: BatchGradingCallbacks,
): BatchGradingHandle {
  // Cancellation token — shared flag checked by the SSE stream reader
  const token: CancellationToken & { cancelled: boolean } = {
    cancelled: false,
  };

  const body: Record<string, unknown> = {
    provider: request.provider,
    model: request.model,
    rubric: request.rubric,
    students: request.students,
    strategy: request.strategy,
    chunkSize: request.chunkSize,
    sweep: request.sweep,
  };
  if (request.customInstructions) {
    body.customInstructions = request.customInstructions;
  }

  // Fire async — callers use callbacks, not await
  (async () => {
    try {
      // Inject active skills into customInstructions
      const skillInjection = await buildSkillInjection();
      if (skillInjection) {
        body.customInstructions = body.customInstructions
          ? `${body.customInstructions}\n\n${skillInjection}`
          : skillInjection;
      }
      const response = await tauriFetch(`${SERVER_BASE}/api/grade`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (token.cancelled) return;

      if (!response.ok) {
        let errorMsg = `Batch grading failed (HTTP ${response.status})`;
        try {
          const errData = await response.json();
          errorMsg = (errData as { error?: string }).error || errorMsg;
        } catch {
          /* use status-based message */
        }
        callbacks.onError?.({ message: errorMsg });
        return;
      }

      // Wrap callbacks to check cancellation before dispatching
      const guardedCallbacks: BatchGradingCallbacks = {
        onProgress: (d) => {
          if (!token.cancelled) callbacks.onProgress?.(d);
        },
        onChunk: (d) => {
          if (!token.cancelled) callbacks.onChunk?.(d);
        },
        onSweep: (d) => {
          if (!token.cancelled) callbacks.onSweep?.(d);
        },
        onOutlier: (d) => {
          if (!token.cancelled) callbacks.onOutlier?.(d);
        },
        onDone: (d) => {
          if (!token.cancelled) callbacks.onDone?.(d);
        },
        onError: (d) => {
          if (!token.cancelled) callbacks.onError?.(d);
        },
      };

      // Stream or buffered fallback
      if (response.body && typeof response.body.getReader === "function") {
        await parseSSEStream(response.body, guardedCallbacks, token);
      } else {
        const text = await response.text();
        if (!token.cancelled) {
          parseSSEText(text, guardedCallbacks);
        }
      }
    } catch (err) {
      if (token.cancelled) return; // Expected cancellation — don't fire error
      const msg = err instanceof Error ? err.message : String(err);
      callbacks.onError?.({ message: msg });
    }
  })();

  return {
    cancel: () => {
      token.cancelled = true;
    },
  };
}
