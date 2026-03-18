/**
 * discover.regression.test.ts — Regression suite for the discovery pipeline.
 *
 * Ensures all existing discover.test.ts behaviors still hold after Wave 4
 * integration (heuristic detection, DiscoveryHints, ExtractionConfig).
 *
 * Does NOT duplicate discover.test.ts pure-function tests — only verifies
 * that runDiscovery() behaviour and result shapes are backward-compatible.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { SnapshotResult } from "./dom-snapshot-types";
import type {
  DiscoveryResult,
  DiscoveryWorkflow,
  ValidationResults,
  SelectorMap,
  NavigationConfig,
  FeedbackConfig,
  SaveConfig,
} from "./discover";

// ── Module Mocks (hoisted by vitest) ────────────────────────────────────────

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

vi.mock("./browser", () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
  captureWebviewScreenshot: vi.fn(),
  getEmbeddedUrl: vi.fn(),
}));

vi.mock("./heuristic-detector", () => ({
  detectGradingStructure: vi.fn(),
}));

vi.mock("./provider-sync", () => ({
  getHandshakeToken: vi.fn().mockReturnValue("test-token"),
}));

vi.mock("./ai-retry", () => ({
  withRetry: vi.fn(<T>(fn: () => Promise<T>) => fn()),
}));

vi.mock("./dom-snapshot", () => ({
  buildSmartWalkScript: vi.fn().mockReturnValue("return {}"),
}));

vi.mock("./extraction-config-discovery", () => ({
  discoverExtractionConfig: vi.fn(),
}));

// ── Imports (after vi.mock hoisting) ────────────────────────────────────────

import { runDiscovery, isValidDiscoveryResult } from "./discover";
import {
  evalScriptJSON,
  captureWebviewScreenshot,
  getEmbeddedUrl,
} from "./browser";
import { detectGradingStructure } from "./heuristic-detector";
;

// ── Typed Mock Aliases ──────────────────────────────────────────────────────

const mockEvalJSON = evalScriptJSON as unknown as Mock;
const mockScreenshot = captureWebviewScreenshot as unknown as Mock;
const mockGetUrl = getEmbeddedUrl as unknown as Mock;
const mockDetect = detectGradingStructure as unknown as Mock;
const mockFetch = tauriFetch as unknown as Mock;

// ── Fixtures ────────────────────────────────────────────────────────────────

const SCREENSHOT = "data:image/png;base64,iVBORfake";
const PAGE_URL = "https://example.com/gradebook/gradeallq2.php";

const SNAPSHOT: SnapshotResult = {
  nodes: [
    {
      tag: "body",
      depth: 0,
      priority: "medium",
      attrs: {},
      children: [
        {
          tag: "table",
          depth: 1,
          priority: "high",
          attrs: { id: "grades" },
          children: [
            {
              tag: "tr",
              depth: 2,
              priority: "high",
              attrs: { id: "graderow1" },
              children: [
                {
                  tag: "td",
                  depth: 3,
                  priority: "medium",
                  attrs: {},
                  text: "Bob Jones",
                },
                {
                  tag: "input",
                  depth: 3,
                  priority: "critical",
                  attrs: { type: "number", name: "score1" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  meta: {
    totalVisited: 60,
    nodesIncluded: 30,
    nodesDropped: 30,
    wasTruncated: false,
    charCount: 3000,
    capturedAt: "2025-01-01T00:00:00.000Z",
    options: {
      maxDepth: 8,
      maxNodes: 500,
      maxTextLength: 150,
      rootSelector: "body",
      captureBoundingBoxes: false,
      skipHidden: true,
      extraAttrs: [],
      charBudget: 12000,
    },
  },
};

const AI_RESULT: DiscoveryResult = {
  navigation: {
    mode: "batch",
    nextButton: null,
    prevButton: null,
    studentIndicator: null,
    submitButton: null,
    waitForSelector: null,
  },
  selectors: {
    studentSection: "tr[id^='graderow']",
    studentName: "td.student-name a",
    scoreInput: "input[name^='score']",
    feedbackBox: "textarea[name^='feedback']",
    feedbackHidden: null,
    questionRegion: null,
    fullCreditLink: null,
  },
  feedback: {
    type: "textarea",
    requiresHiddenSync: false,
    htmlWrap: false,
  },
  save: {
    buttonText: "Quick Save",
    fallbackText: "Save",
  },
  confidence: "high",
  notes: "Standard MyOpenMath batch grading page",
};

const VALIDATION: ValidationResults = {
  studentSection: { matchCount: 5, sampleText: "Row 1", valid: true },
  studentName: { matchCount: 5, sampleText: "Bob Jones", valid: true },
  scoreInput: { matchCount: 5, sampleText: "", valid: true },
  feedbackBox: { matchCount: 5, sampleText: "", valid: true },
};

/** Build a mock HTTP response returning `content` as JSON body. */
function mockHttpResponse(content: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ content }),
    text: async () => content,
  };
}

/** Set up standard mocks for a successful AI-path run. */
function setupAiPathMocks() {
  mockDetect.mockReturnValue(null);
  mockEvalJSON
    .mockResolvedValueOnce(SNAPSHOT)      // captureDomSnapshot
    .mockResolvedValueOnce(VALIDATION);   // validateSelectors
  mockFetch.mockResolvedValueOnce(
    mockHttpResponse(JSON.stringify(AI_RESULT)),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Discovery Pipeline (Regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScreenshot.mockResolvedValue(SCREENSHOT);
    mockGetUrl.mockResolvedValue(PAGE_URL);
  });

  // ── Backward-compat: runDiscovery with no options ─────────────────────

  it("runDiscovery() with no options works exactly as before Wave 4", async () => {
    setupAiPathMocks();

    const result = await runDiscovery();

    // Returns a DiscoveryWorkflow with all three fields
    expect(result).toHaveProperty("draft");
    expect(result).toHaveProperty("validation");
    expect(result).toHaveProperty("screenshot");
  });

  // ── AI path taken when heuristic doesn't match ────────────────────────

  it("AI path is taken when heuristic returns null", async () => {
    setupAiPathMocks();

    const result = await runDiscovery();

    // Heuristic was called but returned null → AI was called
    expect(mockDetect).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
    expect(result.draft.heuristicMatch).toBeUndefined();
  });

  // ── DiscoveryResult shape backward compatibility ──────────────────────

  it("DiscoveryResult retains all pre-Wave-4 fields", async () => {
    setupAiPathMocks();

    const { draft } = await runDiscovery();

    // navigation
    const nav: NavigationConfig = draft.navigation;
    expect(nav).toHaveProperty("mode");
    expect(["batch", "sequential"]).toContain(nav.mode);
    expect(nav).toHaveProperty("nextButton");
    expect(nav).toHaveProperty("prevButton");
    expect(nav).toHaveProperty("studentIndicator");
    expect(nav).toHaveProperty("submitButton");
    expect(nav).toHaveProperty("waitForSelector");

    // selectors
    const sel: SelectorMap = draft.selectors;
    expect(typeof sel.studentName).toBe("string");
    expect(typeof sel.scoreInput).toBe("string");
    expect(sel).toHaveProperty("feedbackBox");
    expect(sel).toHaveProperty("feedbackHidden");
    expect(sel).toHaveProperty("questionRegion");
    expect(sel).toHaveProperty("fullCreditLink");

    // feedback
    const fb: FeedbackConfig = draft.feedback;
    expect(typeof fb.type).toBe("string");
    expect(typeof fb.requiresHiddenSync).toBe("boolean");
    expect(typeof fb.htmlWrap).toBe("boolean");

    // save
    const save: SaveConfig = draft.save;
    expect(typeof save.buttonText).toBe("string");

    // confidence
    expect(["high", "medium", "low"]).toContain(draft.confidence);
  });

  it("result.selectors is a SelectorMap object (not an array)", async () => {
    setupAiPathMocks();

    const { draft } = await runDiscovery();

    expect(typeof draft.selectors).toBe("object");
    expect(Array.isArray(draft.selectors)).toBe(false);
    expect(draft.selectors.studentName).toBeTruthy();
    expect(draft.selectors.scoreInput).toBeTruthy();
  });

  it("isValidDiscoveryResult accepts the AI-produced draft", async () => {
    setupAiPathMocks();

    const { draft } = await runDiscovery();

    expect(isValidDiscoveryResult(draft)).toBe(true);
  });

  // ── Snapshot metadata attached ────────────────────────────────────────

  it("attaches snapshotMetadata to the draft", async () => {
    setupAiPathMocks();

    const { draft } = await runDiscovery();

    expect(draft.snapshotMetadata).toBeDefined();
    expect(draft.snapshotMetadata?.totalVisited).toBe(
      SNAPSHOT.meta.totalVisited,
    );
    expect(draft.snapshotMetadata?.nodesIncluded).toBe(
      SNAPSHOT.meta.nodesIncluded,
    );
  });

  // ── DiscoveryWorkflow shape ───────────────────────────────────────────

  it("DiscoveryWorkflow contains draft, validation, and screenshot", async () => {
    setupAiPathMocks();

    const result: DiscoveryWorkflow = await runDiscovery();

    expect(result.draft).toBeDefined();
    expect(result.validation).toBeDefined();
    expect(typeof result.screenshot).toBe("string");
    expect(result.screenshot.length).toBeGreaterThan(0);
  });

  // ── Error: invalid AI response ────────────────────────────────────────

  it("throws on invalid AI response after max retries", async () => {
    mockDetect.mockReturnValue(null);
    mockEvalJSON.mockResolvedValueOnce(SNAPSHOT); // captureDomSnapshot

    // AI returns garbage on every attempt
    mockFetch.mockResolvedValue(
      mockHttpResponse("This is not valid JSON at all!!!"),
    );

    await expect(runDiscovery({ maxAttempts: 2 })).rejects.toThrow(
      /Discovery failed after 2 attempts/,
    );
  });

  it("throws when AI returns empty response", async () => {
    mockDetect.mockReturnValue(null);
    mockEvalJSON.mockResolvedValueOnce(SNAPSHOT);

    mockFetch.mockResolvedValue(mockHttpResponse(""));

    await expect(runDiscovery({ maxAttempts: 1 })).rejects.toThrow(
      /empty response/,
    );
  });

  // ── Progress callback fires ───────────────────────────────────────────

  it("calls onProgress at each workflow stage", async () => {
    setupAiPathMocks();

    const stages: string[] = [];
    await runDiscovery({
      onProgress: (p) => stages.push(p.stage),
    });

    expect(stages).toContain("capturing");
    expect(stages).toContain("heuristic");
    expect(stages).toContain("analyzing");
    expect(stages).toContain("validating");
    expect(stages).toContain("complete");
  });

  it("fires onProgress with 'error' stage on failure", async () => {
    mockDetect.mockReturnValue(null);
    mockEvalJSON.mockResolvedValueOnce(SNAPSHOT);
    mockFetch.mockResolvedValue(mockHttpResponse(""));

    const stages: string[] = [];
    await runDiscovery({
      maxAttempts: 1,
      onProgress: (p) => stages.push(p.stage),
    }).catch(() => {
      /* expected */
    });

    expect(stages).toContain("error");
  });
});
