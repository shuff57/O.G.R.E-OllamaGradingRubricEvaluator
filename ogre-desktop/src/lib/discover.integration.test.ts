/**
 * discover.integration.test.ts — End-to-end integration tests for the discovery pipeline.
 *
 * Tests the complete runDiscovery() workflow covering:
 *   1. AI path (heuristic miss → AI analysis)
 *   2. Heuristic fast-path (high confidence + valid selectors)
 *   3. Heuristic validation failure → AI fallback
 *   4. Intent-augmented path (DiscoveryHints in AI prompt)
 *   5. ExtractionConfig second pass
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { SnapshotResult } from "./dom-snapshot-types";
import type { HeuristicDetection } from "./heuristic-detector";
import type {
  DiscoveryResult,
  ValidationResults,
} from "./discover";
import type { ExtractionConfig } from "./site-profiles";
import { convertProfileToJSON } from "./profile-json-converter";
import { formatSiteGuideForAgent, isSiteGuideJSON } from "./site-guide-types";

// @ts-expect-error Vite raw markdown asset import
import momProfileRaw from "../assets/profiles/myopenmath.md?raw";
// @ts-expect-error Vite raw markdown asset import
import aeriesProfileRaw from "../assets/profiles/aeries.md?raw";

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

// ── Imports (resolved after vi.mock hoisting) ───────────────────────────────

import { runDiscovery } from "./discover";
import {
  evalScriptJSON,
  captureWebviewScreenshot,
  getEmbeddedUrl,
} from "./browser";
import { detectGradingStructure } from "./heuristic-detector";
;
import { discoverExtractionConfig } from "./extraction-config-discovery";

// ── Typed Mock Aliases ──────────────────────────────────────────────────────
// Cast once so individual tests stay clean (no `as any`).

const mockEvalJSON = evalScriptJSON as unknown as Mock;
const mockScreenshot = captureWebviewScreenshot as unknown as Mock;
const mockGetUrl = getEmbeddedUrl as unknown as Mock;
const mockDetect = detectGradingStructure as unknown as Mock;
const mockFetch = tauriFetch as unknown as Mock;
const mockDiscoverExt = discoverExtractionConfig as unknown as Mock;

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
          attrs: { id: "grades-table" },
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
                  text: "Alice Smith",
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
    totalVisited: 80,
    nodesIncluded: 40,
    nodesDropped: 40,
    wasTruncated: false,
    charCount: 4000,
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

const VALIDATION_PASS: ValidationResults = {
  studentSection: { matchCount: 5, sampleText: "Row 1", valid: true },
  studentName: { matchCount: 5, sampleText: "Alice Smith", valid: true },
  scoreInput: { matchCount: 5, sampleText: "", valid: true },
  feedbackBox: { matchCount: 5, sampleText: "", valid: true },
};

const VALIDATION_FAIL: ValidationResults = {
  studentSection: { matchCount: 0, sampleText: "", valid: false },
  studentName: { matchCount: 0, sampleText: "", valid: false },
  scoreInput: { matchCount: 0, sampleText: "", valid: false },
  feedbackBox: { matchCount: 0, sampleText: "", valid: false },
};

const HEURISTIC: HeuristicDetection = {
  mode: "batch",
  candidateSelectors: {
    studentSection: "tr.student-row",
    studentName: "td.name a",
    scoreInput: "input.score",
    feedbackBox: "textarea.feedback",
    feedbackHidden: null,
    questionRegion: null,
    fullCreditLink: null,
  },
  confidence: 0.9,
  patternName: "Batch grading (repeating-rows, score-input, name-candidate)",
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Discovery Pipeline (Integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScreenshot.mockResolvedValue(SCREENSHOT);
    mockGetUrl.mockResolvedValue(PAGE_URL);
  });

  // ── Test 1: AI path ────────────────────────────────────────────────────

  it("takes AI path when heuristic returns no match", async () => {
    mockDetect.mockReturnValue(null);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)           // captureDomSnapshot
      .mockResolvedValueOnce(VALIDATION_PASS);   // validateSelectors (AI)
    mockFetch.mockResolvedValueOnce(
      mockHttpResponse(JSON.stringify(AI_RESULT)),
    );

    const result = await runDiscovery();

    // AI fetch was called
    expect(mockFetch).toHaveBeenCalled();
    // No heuristic match on result
    expect(result.draft.heuristicMatch).toBeUndefined();
    // Selectors populated from AI
    expect(result.draft.selectors.studentName).toBe("td.student-name a");
    expect(result.draft.selectors.scoreInput).toBe("input[name^='score']");
    // Validation & screenshot present
    expect(result.validation).toBeDefined();
    expect(result.screenshot).toBe(SCREENSHOT);
  });

  // ── Test 2: Heuristic fast-path ────────────────────────────────────────

  it("uses heuristic fast-path when confidence is high and selectors validate", async () => {
    mockDetect.mockReturnValue(HEURISTIC);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)           // captureDomSnapshot
      .mockResolvedValueOnce(VALIDATION_PASS);   // validateSelectors (heuristic)

    const result = await runDiscovery();

    // AI fetch must NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
    // Heuristic match present on result
    expect(result.draft.heuristicMatch).toBeDefined();
    expect(result.draft.heuristicMatch!.patternName).toBe(
      HEURISTIC.patternName,
    );
    expect(result.draft.heuristicMatch!.confidence).toBe(0.9);
    // Selectors populated from heuristic candidate selectors
    expect(result.draft.selectors.studentName).toBe("td.name a");
    expect(result.draft.selectors.scoreInput).toBe("input.score");
    // Confidence mapped: 0.9 ≥ 0.8 → "high"
    expect(result.draft.confidence).toBe("high");
    expect(result.draft.feedback).toEqual({
      type: "textarea",
      requiresHiddenSync: false,
      htmlWrap: false,
    });
  });

  it("infers TinyMCE inline feedback from heuristic selectors", async () => {
    const heuristicTinymce: HeuristicDetection = {
      ...HEURISTIC,
      candidateSelectors: {
        ...HEURISTIC.candidateSelectors,
        feedbackBox: "div.fbbox",
        feedbackHidden: "input[type='hidden'][name^='feedback']",
      },
    };

    mockDetect.mockReturnValue(heuristicTinymce);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)
      .mockResolvedValueOnce(VALIDATION_PASS);

    const result = await runDiscovery();

    expect(result.draft.feedback).toEqual({
      type: "tinymce-inline",
      requiresHiddenSync: true,
      htmlWrap: true,
    });
  });

  // ── Test 3: Heuristic validation fail → AI fallback ────────────────────

  it("falls back to AI when heuristic selectors fail validation", async () => {
    mockDetect.mockReturnValue(HEURISTIC);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)           // captureDomSnapshot
      .mockResolvedValueOnce(VALIDATION_FAIL)    // validateSelectors (heuristic — fails)
      .mockResolvedValueOnce(VALIDATION_PASS);   // validateSelectors (AI result)
    mockFetch.mockResolvedValueOnce(
      mockHttpResponse(JSON.stringify(AI_RESULT)),
    );

    const result = await runDiscovery();

    // AI fetch WAS called as fallback
    expect(mockFetch).toHaveBeenCalled();
    // Result is from AI, not heuristic
    expect(result.draft.heuristicMatch).toBeUndefined();
    expect(result.draft.selectors.studentName).toBe("td.student-name a");
  });

  // ── Test 4: DiscoveryHints in AI prompt ────────────────────────────────

  it("includes DiscoveryHints in the AI prompt when provided", async () => {
    mockDetect.mockReturnValue(null);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)
      .mockResolvedValueOnce(VALIDATION_PASS);
    mockFetch.mockResolvedValueOnce(
      mockHttpResponse(JSON.stringify(AI_RESULT)),
    );

    await runDiscovery({
      hints: {
        pageDescription: "MyOpenMath gradebook for Algebra class",
        estimatedStudentCount: 25,
        navigationMode: "batch",
      },
    });

    // Verify the fetch body contains the hints text
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/chat"),
      expect.objectContaining({
        body: expect.stringContaining("User hints:"),
      }),
    );

    // Verify specific hint values appear in the serialized body
    const callBody = String(
      (mockFetch.mock.calls[0][1] as Record<string, unknown>).body,
    );
    expect(callBody).toContain("MyOpenMath gradebook for Algebra class");
    expect(callBody).toContain("25");
    expect(callBody).toContain("batch");
  });

  // ── Test 5: includeExtractionConfig ────────────────────────────────────

  it("attaches extractionConfig when includeExtractionConfig is true", async () => {
    const extConfig: ExtractionConfig = {
      responseMethod: "selector",
      responseSelector: ".student-response",
      maxScoreMethod: "parentTextRegex",
      maxScoreRegex: "/(\\d+\\.?\\d*)",
      maxScoreDefault: "10",
    };

    mockDetect.mockReturnValue(null);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)
      .mockResolvedValueOnce(VALIDATION_PASS);
    mockFetch.mockResolvedValueOnce(
      mockHttpResponse(JSON.stringify(AI_RESULT)),
    );
    mockDiscoverExt.mockResolvedValue(extConfig);

    const result = await runDiscovery({ includeExtractionConfig: true });

    expect(mockDiscoverExt).toHaveBeenCalled();
    expect(result.draft.extractionConfig).toBeDefined();
    expect(result.draft.extractionConfig?.responseMethod).toBe("selector");
    expect(result.draft.extractionConfig?.maxScoreDefault).toBe("10");
  });

  it("enables extractionConfig discovery by default", async () => {
    const extConfig: ExtractionConfig = {
      responseMethod: "selector",
      responseSelector: ".student-response",
      maxScoreMethod: "parentTextRegex",
      maxScoreRegex: "/(\\d+\\.?\\d*)",
      maxScoreDefault: "10",
    };

    mockDetect.mockReturnValue(null);
    mockEvalJSON
      .mockResolvedValueOnce(SNAPSHOT)
      .mockResolvedValueOnce(VALIDATION_PASS);
    mockFetch.mockResolvedValueOnce(
      mockHttpResponse(JSON.stringify(AI_RESULT)),
    );
    mockDiscoverExt.mockResolvedValue(extConfig);

    await runDiscovery();

    expect(mockDiscoverExt).toHaveBeenCalled();
  });

  it("full pipeline: MOM markdown converts to valid JSON injection", () => {
    const guide = convertProfileToJSON(momProfileRaw);
    const injection = formatSiteGuideForAgent(guide);

    expect(injection).toContain("--- SITE GUIDE (JSON):");
    expect(injection).toContain("--- END SITE GUIDE ---");

    const match = injection.match(
      /--- SITE GUIDE \(JSON\): .* ---\n([\s\S]+)\n--- END SITE GUIDE ---/,
    );
    expect(match).toBeTruthy();

    const parsed = JSON.parse(match![1]);
    expect(parsed).toHaveProperty("site");
    expect(parsed).toHaveProperty("selectors");
    expect(parsed).toHaveProperty("navigation");
    expect(parsed).toHaveProperty("gotchas");
    expect(Object.keys(parsed.selectors).length).toBeGreaterThanOrEqual(5);
    expect(parsed.gotchas.length).toBeGreaterThanOrEqual(3);
  });

  it("JSON injection is at least 30% smaller than raw markdown", () => {
    const guide = convertProfileToJSON(momProfileRaw);
    const injection = formatSiteGuideForAgent(guide);

    const reductionRatio = injection.length / momProfileRaw.length;
    expect(reductionRatio).toBeLessThan(0.7);

    console.log(
      `Token reduction: ${momProfileRaw.length} chars → ${injection.length} chars (${Math.round((1 - reductionRatio) * 100)}% reduction)`,
    );
  });

  it("full pipeline: Aeries markdown converts to valid JSON injection", () => {
    const guide = convertProfileToJSON(aeriesProfileRaw);
    const injection = formatSiteGuideForAgent(guide);

    expect(injection).toContain("--- SITE GUIDE (JSON):");
    const match = injection.match(
      /--- SITE GUIDE \(JSON\): .* ---\n([\s\S]+)\n--- END SITE GUIDE ---/,
    );
    expect(match).toBeTruthy();

    const parsed = JSON.parse(match![1]);
    expect(Object.keys(parsed.selectors).length).toBeGreaterThanOrEqual(5);
  });

  it("isSiteGuideJSON correctly validates guide objects", () => {
    const guide = convertProfileToJSON(momProfileRaw);

    expect(isSiteGuideJSON(guide)).toBe(true);
    expect(isSiteGuideJSON(null)).toBe(false);
    expect(isSiteGuideJSON({})).toBe(false);
    expect(isSiteGuideJSON({ site: "test" })).toBe(false);
  });
});
