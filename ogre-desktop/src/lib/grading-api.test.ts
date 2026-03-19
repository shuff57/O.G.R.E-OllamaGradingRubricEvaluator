import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as typeof fetch);
});

// ── Mock provider-sync ──────────────────────────────────────────────────
const { mockGetHandshakeToken } = vi.hoisted(() => ({
  mockGetHandshakeToken: vi.fn().mockReturnValue("test-token-123"),
}));

vi.mock("./provider-sync", () => ({
  getHandshakeToken: mockGetHandshakeToken,
}));

// ── Mock oauth (for fetchModels → fetchAvailableModels) ─────────────────
const { mockFetchAvailableModels } = vi.hoisted(() => ({
  mockFetchAvailableModels: vi.fn(),
}));

vi.mock("./oauth", () => ({
  fetchAvailableModels: mockFetchAvailableModels,
}));

// ── Mock ai-retry (pass-through — no delays in tests) ──────────────────
vi.mock("./ai-retry", () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

// ── Mock sse-parser (for startBatchGrading) ─────────────────────────────
const { mockParseSSEStream, mockParseSSEText } = vi.hoisted(() => ({
  mockParseSSEStream: vi.fn().mockResolvedValue(undefined),
  mockParseSSEText: vi.fn(),
}));

vi.mock("./sse-parser", () => ({
  parseSSEStream: mockParseSSEStream,
  parseSSEText: mockParseSSEText,
}));


// ── Mock skills-api (for startBatchGrading / sendSolverMessage) ─────────
const { mockBuildSkillInjection } = vi.hoisted(() => ({
  mockBuildSkillInjection: vi.fn().mockResolvedValue(""),
}));

vi.mock("./skills-api", () => ({
  buildSkillInjection: mockBuildSkillInjection,
}));

// Import AFTER mocks are set up
import {
  parseSSEEvents,
  gradeStudent,
  sendSolverMessage,
  startBatchGrading,
  fetchProviders,
  setActiveProvider,
  fetchModels,
  isServerOffline,
  GradingApiError,
} from "./grading-api";
import type { BatchGradingRequest, BatchGradingCallbacks } from "./grading-api";

// ── parseSSEEvents (pure function) ──────────────────────────────────────

describe("parseSSEEvents", () => {
  it("parses a single SSE event", () => {
    const raw = "event: status\ndata: {\"status\":\"thinking\"}\nid: 0\n\n";
    const events = parseSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      event: "status",
      data: '{"status":"thinking"}',
      id: "0",
    });
  });

  it("parses multiple SSE events", () => {
    const raw = [
      "event: status\ndata: {\"status\":\"thinking\"}\nid: 0",
      "event: message\ndata: {\"content\":\"Hello!\"}\nid: 1",
      "event: done\ndata: {\"provider\":\"ollama\"}\nid: 2",
    ].join("\n\n");

    const events = parseSSEEvents(raw);
    expect(events).toHaveLength(3);
    expect(events[0].event).toBe("status");
    expect(events[1].event).toBe("message");
    expect(events[2].event).toBe("done");
  });

  it("handles event with data only (no event name)", () => {
    const raw = "data: {\"info\":\"test\"}\n\n";
    const events = parseSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("");
    expect(events[0].data).toBe('{"info":"test"}');
  });

  it("skips empty blocks", () => {
    const raw = "\n\n\n\nevent: done\ndata: {}\n\n\n\n";
    const events = parseSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("done");
  });

  it("returns empty array for empty input", () => {
    expect(parseSSEEvents("")).toHaveLength(0);
    expect(parseSSEEvents("   \n\n  ")).toHaveLength(0);
  });

  it("parses error event", () => {
    const raw = 'event: error\ndata: {"message":"Provider not found"}\nid: 3\n\n';
    const events = parseSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("error");
    expect(JSON.parse(events[0].data)).toEqual({ message: "Provider not found" });
  });

  it("handles typical solver mode SSE response", () => {
    const raw = [
      'event: status\ndata: {"status":"thinking","provider":"ollama","model":"llama3.2"}\nid: 0',
      'event: message\ndata: {"content":"Sure! Let me help you with that problem."}\nid: 1',
      'event: done\ndata: {"provider":"ollama","model":"llama3.2"}\nid: 2',
    ].join("\n\n");

    const events = parseSSEEvents(raw);
    expect(events).toHaveLength(3);

    const statusData = JSON.parse(events[0].data);
    expect(statusData.status).toBe("thinking");
    expect(statusData.provider).toBe("ollama");

    const messageData = JSON.parse(events[1].data);
    expect(messageData.content).toBe("Sure! Let me help you with that problem.");

    const doneData = JSON.parse(events[2].data);
    expect(doneData.provider).toBe("ollama");
  });
});

// ── sendSolverMessage ──────────────────────────────────────────────────

describe("sendSolverMessage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST to /api/chat with correct body and auth headers", async () => {
    const sseText = [
      'event: status\ndata: {"status":"thinking","provider":"ollama","model":"llama3.2"}\nid: 0',
      'event: message\ndata: {"content":"Hello!"}\nid: 1',
      'event: done\ndata: {"provider":"ollama","model":"llama3.2"}\nid: 2',
    ].join("\n\n");

    mockFetch.mockResolvedValue({
      ok: true,
      body: null, // no ReadableStream → falls back to .text()
      text: vi.fn().mockResolvedValue(sseText),
    });

    const onStatus = vi.fn();
    const onMessage = vi.fn();
    const onDone = vi.fn();

    await sendSolverMessage({ message: "What is 2+2?" }, { onStatus, onMessage, onDone });

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3456/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token-123",
        }),
      }),
    );

    // Verify body
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ message: "What is 2+2?" });

    // Verify callbacks
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "thinking" }),
    );
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Hello!" }),
    );
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "ollama" }),
    );
  });

  it("includes optional model and provider in body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: null,
      text: vi.fn().mockResolvedValue("event: done\ndata: {}\nid: 0\n\n"),
    });

    await sendSolverMessage({
      message: "Hello",
      model: "gpt-4",
      provider: "openai",
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({
      message: "Hello",
      model: "gpt-4",
      provider: "openai",
    });
  });

  it("throws on server error with error message from response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: "No active provider configured" }),
    });

    await expect(
      sendSolverMessage({ message: "test" }),
    ).rejects.toThrow("No active provider configured");
  });

  it("throws generic error when server returns non-JSON error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    });

    await expect(
      sendSolverMessage({ message: "test" }),
    ).rejects.toThrow("Server error 500");
  });

  it("calls onError callback for SSE error events", async () => {
    const sseText = 'event: error\ndata: {"message":"Model not found"}\nid: 0\n\n';

    mockFetch.mockResolvedValue({
      ok: true,
      body: null,
      text: vi.fn().mockResolvedValue(sseText),
    });

    const onError = vi.fn();
    await sendSolverMessage({ message: "test" }, { onError });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Model not found" }),
    );
  });

  it("uses ReadableStream when available", async () => {
    const sseText = [
      'event: status\ndata: {"status":"thinking","provider":"test","model":"test"}\nid: 0',
      'event: message\ndata: {"content":"Streamed!"}\nid: 1',
      'event: done\ndata: {"provider":"test","model":"test"}\nid: 2',
    ].join("\n\n");

    const encoder = new TextEncoder();
    const chunks = [encoder.encode(sseText)];
    let chunkIndex = 0;

    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
      releaseLock: vi.fn(),
    };

    const mockBody = {
      getReader: vi.fn().mockReturnValue(mockReader),
    };

    mockFetch.mockResolvedValue({
      ok: true,
      body: mockBody,
    });

    const onMessage = vi.fn();
    const onDone = vi.fn();

    await sendSolverMessage({ message: "stream test" }, { onMessage, onDone });

    expect(mockBody.getReader).toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Streamed!" }),
    );
    expect(onDone).toHaveBeenCalled();
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });
});

// ── fetchProviders ──────────────────────────────────────────────────────

describe("fetchProviders", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetHandshakeToken.mockReturnValue("test-token-123");
  });

  it("fetches providers with Bearer auth header", async () => {
    const mockProviders = [
      { id: "ollama", api_url: "http://localhost:11434", model: "llama3.2", is_active: true },
      { id: "openai", api_url: "https://api.openai.com", model: "gpt-4", is_active: false },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ providers: mockProviders }),
    });

    const result = await fetchProviders();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3456/api/providers",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
        }),
      }),
    );
    expect(result).toEqual(mockProviders);
  });

  it("throws NO_TOKEN when no handshake token", async () => {
    mockGetHandshakeToken.mockReturnValue(null);

    await expect(fetchProviders()).rejects.toThrow(GradingApiError);
    await expect(fetchProviders()).rejects.toMatchObject({ code: "NO_TOKEN" });
  });

  it("throws AUTH_ERROR on 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(fetchProviders()).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });

  it("throws AUTH_ERROR on 403", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    await expect(fetchProviders()).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });

  it("throws OFFLINE when fetch throws network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(fetchProviders()).rejects.toMatchObject({ code: "OFFLINE" });
  });

  it("throws SERVER_ERROR on other HTTP errors", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchProviders()).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });

  it("returns empty array when server returns no providers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
    });

    const result = await fetchProviders();
    expect(result).toEqual([]);
  });
});

// ── setActiveProvider ───────────────────────────────────────────────────

describe("setActiveProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetHandshakeToken.mockReturnValue("test-token-123");
  });

  it("posts provider_id and model to /api/providers/active", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await setActiveProvider("openai", "gpt-4");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3456/api/providers/active",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ provider_id: "openai", model: "gpt-4" });
  });

  it("throws NOT_FOUND on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(setActiveProvider("unknown", "m")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NO_TOKEN when no handshake token", async () => {
    mockGetHandshakeToken.mockReturnValue(null);

    await expect(setActiveProvider("openai", "gpt-4")).rejects.toMatchObject({
      code: "NO_TOKEN",
    });
  });

  it("throws OFFLINE when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));

    await expect(setActiveProvider("openai", "gpt-4")).rejects.toMatchObject({
      code: "OFFLINE",
    });
  });
});

// ── fetchModels ─────────────────────────────────────────────────────────

describe("fetchModels", () => {
  beforeEach(() => {
    mockFetchAvailableModels.mockReset();
  });

  it("maps provider ID to oauth key and delegates to fetchAvailableModels", async () => {
    mockFetchAvailableModels.mockResolvedValue(["gpt-4", "gpt-3.5-turbo"]);

    const result = await fetchModels("openai");

    expect(mockFetchAvailableModels).toHaveBeenCalledWith("openai");
    expect(result).toEqual(["gpt-4", "gpt-3.5-turbo"]);
  });

  it("maps github-models → github", async () => {
    mockFetchAvailableModels.mockResolvedValue(["claude-haiku-4.5"]);

    await fetchModels("github-models");

    expect(mockFetchAvailableModels).toHaveBeenCalledWith("github");
  });

  it("maps google-gemini → google", async () => {
    mockFetchAvailableModels.mockResolvedValue(["gemini-pro"]);

    await fetchModels("google-gemini");

    expect(mockFetchAvailableModels).toHaveBeenCalledWith("google");
  });

  it("maps ollama-local → ollama", async () => {
    mockFetchAvailableModels.mockResolvedValue(["llama3.2:latest"]);

    await fetchModels("ollama-local");

    expect(mockFetchAvailableModels).toHaveBeenCalledWith("ollama");
  });

  it("propagates errors from fetchAvailableModels", async () => {
    mockFetchAvailableModels.mockRejectedValue(new Error("Ollama not running"));

    await expect(fetchModels("ollama")).rejects.toThrow("Ollama not running");
  });
});

// ── isServerOffline ─────────────────────────────────────────────────────

describe("isServerOffline", () => {
  it("returns true for OFFLINE error code", () => {
    expect(isServerOffline(new GradingApiError("offline", "OFFLINE"))).toBe(true);
  });

  it("returns true for NO_TOKEN error code", () => {
    expect(isServerOffline(new GradingApiError("no token", "NO_TOKEN"))).toBe(true);
  });

  it("returns false for AUTH_ERROR", () => {
    expect(isServerOffline(new GradingApiError("auth", "AUTH_ERROR"))).toBe(false);
  });

  it("returns true for network-like error messages", () => {
    expect(isServerOffline(new TypeError("fetch failed"))).toBe(true);
    expect(isServerOffline(new Error("connection refused"))).toBe(true);
    expect(isServerOffline(new Error("network error"))).toBe(true);
  });

  it("returns false for non-network errors", () => {
    expect(isServerOffline(new Error("Invalid JSON"))).toBe(false);
    expect(isServerOffline("some string")).toBe(false);
  });
});

// ── gradeStudent ────────────────────────────────────────────────────────

describe("gradeStudent", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetHandshakeToken.mockReturnValue("test-token-123");
  });

  it("sends correct body for grader mode (rubric present)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        score: 8,
        feedback: "Good work",
        provider: "ollama",
        model: "llama3.2",
      }),
    });

    const result = await gradeStudent({
      studentWork: "The answer is 42",
      rubric: { maxScore: "10", essayPrompt: "Explain life." },
      instructions: "Be strict",
    });

    // Verify fetch call
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3456/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
          "Content-Type": "application/json",
        }),
      }),
    );

    // Verify body structure
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({
      message: "Be strict",
      rubric: { maxScore: "10", essayPrompt: "Explain life." },
      studentWork: "The answer is 42",
    });

    // Verify return value
    expect(result).toEqual({
      score: 8,
      feedback: "Good work",
      provider: "ollama",
      model: "llama3.2",
    });
  });

  it("uses default instructions when none provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        score: 5, feedback: "OK", provider: "openai", model: "gpt-4",
      }),
    });

    await gradeStudent({ studentWork: "test" });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.message).toBe("Grade this student work.");
  });

  it("uses default rubric when none provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        score: 5, feedback: "OK", provider: "openai", model: "gpt-4",
      }),
    });

    await gradeStudent({ studentWork: "test" });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.rubric).toEqual({ maxScore: "10" });
  });

  it("includes optional provider and model overrides", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        score: 7, feedback: "Good", provider: "openai", model: "gpt-4",
      }),
    });

    await gradeStudent({
      studentWork: "test",
      provider: "openai",
      model: "gpt-4",
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.provider).toBe("openai");
    expect(callBody.model).toBe("gpt-4");
  });

  it("throws with server error message on non-200", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "Model not found" }),
    });

    await expect(gradeStudent({ studentWork: "test" }))
      .rejects.toThrow("Model not found");
  });

  it("throws generic error when error response is not JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    });

    await expect(gradeStudent({ studentWork: "test" }))
      .rejects.toThrow("Grading failed (HTTP 503)");
  });

  it("omits provider/model from body when not specified", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        score: 5, feedback: "OK", provider: "ollama", model: "llama3.2",
      }),
    });

    await gradeStudent({ studentWork: "answer" });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).not.toHaveProperty("provider");
    expect(callBody).not.toHaveProperty("model");
  });
});

// ── startBatchGrading ───────────────────────────────────────────────────

describe("startBatchGrading", () => {
  const defaultRequest: BatchGradingRequest = {
    rubric: { maxScore: "10", essayPrompt: "Test prompt" },
    students: [
      { index: 0, name: "Alice", response: "Answer A" },
      { index: 1, name: "Bob", response: "Answer B" },
    ],
    provider: "ollama",
    model: "llama3.2",
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockParseSSEStream.mockReset();
    mockParseSSEText.mockReset();
    mockGetHandshakeToken.mockReturnValue("test-token-123");
    mockParseSSEStream.mockResolvedValue(undefined);
    mockBuildSkillInjection.mockReset();
    mockBuildSkillInjection.mockResolvedValue("");
  });

  it("returns handle with cancel function", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: vi.fn() },
    });

    const handle = startBatchGrading(defaultRequest, {});
    expect(handle).toHaveProperty("cancel");
    expect(typeof handle.cancel).toBe("function");
  });

  it("sends POST to /api/grade with correct body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: vi.fn() },
    });

    startBatchGrading(defaultRequest, {});

    // Wait for async fire-and-forget
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3456/api/grade",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
        }),
      }),
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.provider).toBe("ollama");
    expect(callBody.model).toBe("llama3.2");
    expect(callBody.students).toHaveLength(2);
    expect(callBody.rubric.essayPrompt).toBe("Test prompt");
  });

  it("includes optional strategy, chunkSize, sweep in body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: vi.fn() },
    });

    startBatchGrading({
      ...defaultRequest,
      strategy: "parallel",
      chunkSize: 15,
      sweep: "compact",
    }, {});

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.strategy).toBe("parallel");
    expect(callBody.chunkSize).toBe(15);
    expect(callBody.sweep).toBe("compact");
  });

  it("includes customInstructions in body when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: vi.fn() },
    });

    const customInstructions = "Grade very leniently. Give partial credit for any attempt.";
    startBatchGrading({
      ...defaultRequest,
      customInstructions,
    }, {});

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.customInstructions).toBe(customInstructions);
  });

  it("omits customInstructions from body when not provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: vi.fn() },
    });

    startBatchGrading(defaultRequest, {});

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).not.toHaveProperty("customInstructions");
  });

  it("calls parseSSEStream for ReadableStream response", async () => {
    const mockBody = { getReader: vi.fn() };
    mockFetch.mockResolvedValue({
      ok: true,
      body: mockBody,
    });

    const callbacks: BatchGradingCallbacks = { onDone: vi.fn() };
    startBatchGrading(defaultRequest, callbacks);

    await vi.waitFor(() => {
      expect(mockParseSSEStream).toHaveBeenCalled();
    });

    // Should pass the response body and guarded callbacks
    expect(mockParseSSEStream).toHaveBeenCalledWith(
      mockBody,
      expect.objectContaining({
        onDone: expect.any(Function),
      }),
      expect.objectContaining({ cancelled: false }),
    );
  });

  it("falls back to parseSSEText when no ReadableStream", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: null,
      text: vi.fn().mockResolvedValue("event: done\ndata: {}\n\n"),
    });

    startBatchGrading(defaultRequest, {});

    await vi.waitFor(() => {
      expect(mockParseSSEText).toHaveBeenCalled();
    });

    expect(mockParseSSEText).toHaveBeenCalledWith(
      "event: done\ndata: {}\n\n",
      expect.any(Object),
    );
  });

  it("calls onError when server returns non-200", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "Internal error" }),
    });

    const onError = vi.fn();
    startBatchGrading(defaultRequest, { onError });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    expect(onError).toHaveBeenCalledWith({ message: "Internal error" });
  });

  it("calls onError with generic message when error is not JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    });

    const onError = vi.fn();
    startBatchGrading(defaultRequest, { onError });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    expect(onError).toHaveBeenCalledWith({
      message: "Batch grading failed (HTTP 503)",
    });
  });

  it("calls onError on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("fetch failed"));

    const onError = vi.fn();
    startBatchGrading(defaultRequest, { onError });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    expect(onError).toHaveBeenCalledWith({ message: "fetch failed" });
  });

  it("cancel() prevents further callback dispatch", async () => {
    // Simulate a slow fetch that resolves after cancel
    let resolveFetch: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const onDone = vi.fn();
    const handle = startBatchGrading(defaultRequest, { onDone });

    // Cancel immediately
    handle.cancel();

    // Now resolve fetch — the callbacks should NOT fire
    resolveFetch!({
      ok: true,
      body: null,
      text: vi.fn().mockResolvedValue("event: done\ndata: {}\n\n"),
    });

    // Give time for the async to run
    await new Promise((r) => setTimeout(r, 50));

    // Should not have called parseSSEText because token.cancelled = true
    expect(mockParseSSEText).not.toHaveBeenCalled();
  });

  it("does not fire onError after cancellation on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    const onError = vi.fn();
    const handle = startBatchGrading(defaultRequest, { onError });

    // Cancel immediately
    handle.cancel();

    // Give time for the async to run
    await new Promise((r) => setTimeout(r, 50));

    // onError should NOT have been called because cancel was called first
    expect(onError).not.toHaveBeenCalled();
  });
});
