import { describe, it, expect } from "vitest";
import {
  parseDiscoveryResponse,
  isValidDiscoveryResult,
  DISCOVERY_SYSTEM_PROMPT,
  DISCOVERY_USER_PROMPT_TEMPLATE,
  DISCOVERY_MAX_ATTEMPTS,
  parseRubricExtractionResponse,
  isValidRubricExtractionResult,
  RUBRIC_EXTRACTION_PROMPT,
  type DiscoveryResult,
  type NavigationMode,
  type FeedbackType,
  type RubricExtractionResult,
} from "./discover";

// ── parseDiscoveryResponse ──────────────────────────────────────────────────

describe("parseDiscoveryResponse", () => {
  it("parses valid JSON discovery response", () => {
    const json = JSON.stringify({
      navigation: {
        mode: "batch",
        nextButton: null,
        prevButton: null,
        studentIndicator: null,
        submitButton: null,
        waitForSelector: null,
      },
      selectors: {
        studentSection: ".student-row",
        studentName: ".name",
        scoreInput: "input[name='score']",
        feedbackBox: "textarea.feedback",
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
        buttonText: "Save",
        fallbackText: "Submit",
      },
      confidence: "high",
      notes: "Standard batch grading page",
    });

    const result = parseDiscoveryResponse(json);
    expect(result.navigation.mode).toBe("batch");
    expect(result.selectors.studentSection).toBe(".student-row");
    expect(result.confidence).toBe("high");
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const markdown = `\`\`\`json
{
  "navigation": { "mode": "sequential", "nextButton": "button.next", "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
  "selectors": { "studentName": ".student-name", "scoreInput": "input#score", "feedbackBox": null, "feedbackHidden": null, "questionRegion": null, "fullCreditLink": null },
  "feedback": { "type": "unknown", "requiresHiddenSync": false, "htmlWrap": false },
  "save": { "buttonText": "Submit" },
  "confidence": "medium"
}
\`\`\``;

    const result = parseDiscoveryResponse(markdown);
    expect(result.navigation.mode).toBe("sequential");
    expect(result.selectors.studentName).toBe(".student-name");
  });

  it("parses JSON with thinking blocks", () => {
    const withThinking = `<think>
Let me analyze this page structure...
It appears to be a batch grading interface.
</think>

{
  "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
  "selectors": { "studentSection": "tr.student", "studentName": "td.name", "scoreInput": "input.score", "feedbackBox": "textarea", "feedbackHidden": null, "questionRegion": null, "fullCreditLink": null },
  "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
  "save": { "buttonText": "Save" },
  "confidence": "high"
}`;

    const result = parseDiscoveryResponse(withThinking);
    expect(result.navigation.mode).toBe("batch");
    expect(result.selectors.studentSection).toBe("tr.student");
  });

  it("throws error on invalid JSON", () => {
    const invalid = "This is not JSON at all";
    expect(() => parseDiscoveryResponse(invalid)).toThrow(
      "Could not parse AI discovery response as JSON"
    );
  });

  it("parses JSON without selectors key (valid JSON but missing required field)", () => {
    const noSelectors = JSON.stringify({
      navigation: { mode: "batch" },
      feedback: { type: "textarea" },
      save: { buttonText: "Save" },
      // Missing "selectors" key
    });

    // The function will parse this as valid JSON (it doesn't validate structure)
    // Validation happens in isValidDiscoveryResult
    const result = parseDiscoveryResponse(noSelectors);
    expect(result).toBeDefined();
    expect(result.navigation).toBeDefined();
  });

  it("cleans up trailing commas before parsing", () => {
    const withTrailingCommas = `{
      "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null, },
      "selectors": { "studentSection": "tr.student", "studentName": "td.name", "scoreInput": "input.score", "feedbackBox": "textarea", "feedbackHidden": null, "questionRegion": null, "fullCreditLink": null, },
      "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false, },
      "save": { "buttonText": "Save", },
      "confidence": "high",
    }`;

    const result = parseDiscoveryResponse(withTrailingCommas);
    expect(result.navigation.mode).toBe("batch");
    expect(result.selectors.studentSection).toBe("tr.student");
    expect(result.confidence).toBe("high");
  });

  it("handles double-fenced markdown code blocks", () => {
    const doubleFenced = "```json\n```json\n" + JSON.stringify({
      navigation: { mode: "batch", nextButton: null, prevButton: null, studentIndicator: null, submitButton: null, waitForSelector: null },
      selectors: { studentSection: "tr.student", studentName: "td.name", scoreInput: "input.score", feedbackBox: "textarea", feedbackHidden: null, questionRegion: null, fullCreditLink: null },
      feedback: { type: "textarea", requiresHiddenSync: false, htmlWrap: false },
      save: { buttonText: "Save" },
      confidence: "high",
    }) + "\n```\n```";

    const result = parseDiscoveryResponse(doubleFenced);
    expect(result.navigation.mode).toBe("batch");
    expect(result.selectors.studentSection).toBe("tr.student");
  });

  it("unescapes HTML entities before parsing", () => {
    const htmlEncoded = `{
      &quot;navigation&quot;: { &quot;mode&quot;: &quot;batch&quot;, &quot;nextButton&quot;: null, &quot;prevButton&quot;: null, &quot;studentIndicator&quot;: null, &quot;submitButton&quot;: null, &quot;waitForSelector&quot;: null },
      &quot;selectors&quot;: { &quot;studentSection&quot;: &quot;tr.student&quot;, &quot;studentName&quot;: &quot;td.name&quot;, &quot;scoreInput&quot;: &quot;input.score&quot;, &quot;feedbackBox&quot;: &quot;textarea&quot;, &quot;feedbackHidden&quot;: null, &quot;questionRegion&quot;: null, &quot;fullCreditLink&quot;: null },
      &quot;feedback&quot;: { &quot;type&quot;: &quot;textarea&quot;, &quot;requiresHiddenSync&quot;: false, &quot;htmlWrap&quot;: false },
      &quot;save&quot;: { &quot;buttonText&quot;: &quot;Save&quot; },
      &quot;confidence&quot;: &quot;high&quot;
    }`;

    const result = parseDiscoveryResponse(htmlEncoded);
    expect(result.navigation.mode).toBe("batch");
    expect(result.save.buttonText).toBe("Save");
    expect(result.confidence).toBe("high");
  });

  it("extracts JSON from explanatory prefix and suffix text", () => {
    const withExplanation = `Based on my analysis of the page, here is the structured result:

{
  "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
  "selectors": { "studentSection": "tr.student", "studentName": "td.name", "scoreInput": "input.score", "feedbackBox": "textarea", "feedbackHidden": null, "questionRegion": null, "fullCreditLink": null },
  "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
  "save": { "buttonText": "Save" },
  "confidence": "medium"
}

I hope this analysis helps with your grading automation setup!`;

    const result = parseDiscoveryResponse(withExplanation);
    expect(result.navigation.mode).toBe("batch");
    expect(result.confidence).toBe("medium");
  });

  it("picks the last JSON object containing 'selectors' when multiple objects exist", () => {
    const multipleObjects = `{
  "navigation": { "mode": "sequential" },
  "selectors": { "studentSection": ".wrong-first" }
}

After re-examining, here is the corrected result:

{
  "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
  "selectors": { "studentSection": "tr.correct", "studentName": "td.name", "scoreInput": "input.score", "feedbackBox": "textarea", "feedbackHidden": null, "questionRegion": null, "fullCreditLink": null },
  "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
  "save": { "buttonText": "Save" },
  "confidence": "high"
}`;

    const result = parseDiscoveryResponse(multipleObjects);
    expect(result.selectors.studentSection).toBe("tr.correct");
    expect(result.navigation.mode).toBe("batch");
  });

  it("recovers partial JSON with missing closing braces (up to 3)", () => {
    // Simulate a response cut off — missing the outer closing brace.
    // Partial recovery finds firstBrace..lastBrace, counts imbalance, appends '}'.
    const partialJson = `{
  "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
  "selectors": { "studentSection": "tr.student", "studentName": "td.name", "scoreInput": "input.score", "feedbackBox": "textarea", "feedbackHidden": null, "questionRegion": null, "fullCreditLink": null },
  "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
  "save": { "buttonText": "Save" }
`;
    // Missing the outer closing `}` — recovery appends it

    const result = parseDiscoveryResponse(partialJson);
    expect(result.navigation.mode).toBe("batch");
    expect(result.selectors.studentSection).toBe("tr.student");
    expect(result.save.buttonText).toBe("Save");
  });
});

// ── isValidDiscoveryResult ──────────────────────────────────────────────────

describe("isValidDiscoveryResult", () => {
  const validBatchResult: DiscoveryResult = {
    navigation: {
      mode: "batch",
      nextButton: null,
      prevButton: null,
      studentIndicator: null,
      submitButton: null,
      waitForSelector: null,
    },
    selectors: {
      studentSection: ".student-row",
      studentName: ".name",
      scoreInput: "input[name='score']",
      feedbackBox: "textarea.feedback",
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
      buttonText: "Save",
      fallbackText: "Submit",
    },
    confidence: "high",
    notes: "Valid batch result",
  };

  it("validates a correct batch discovery result", () => {
    expect(isValidDiscoveryResult(validBatchResult)).toBe(true);
  });

  it("validates a correct sequential discovery result", () => {
    const sequentialResult: DiscoveryResult = {
      navigation: {
        mode: "sequential",
        nextButton: "button.next",
        prevButton: "button.prev",
        studentIndicator: ".student-counter",
        submitButton: "button.submit",
        waitForSelector: ".student-name",
      },
      selectors: {
        studentName: ".student-name",
        scoreInput: "input#score",
        feedbackBox: null,
        feedbackHidden: null,
        questionRegion: "iframe.preview",
        fullCreditLink: null,
      },
      feedback: {
        type: "unknown",
        requiresHiddenSync: false,
        htmlWrap: false,
      },
      save: {
        buttonText: "Submit",
      },
      confidence: "medium",
    };

    expect(isValidDiscoveryResult(sequentialResult)).toBe(true);
  });

  it("rejects null input", () => {
    expect(isValidDiscoveryResult(null)).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isValidDiscoveryResult("not an object")).toBe(false);
    expect(isValidDiscoveryResult(123)).toBe(false);
    expect(isValidDiscoveryResult([])).toBe(false);
  });

  it("rejects result with missing navigation", () => {
    const invalid = {
      selectors: validBatchResult.selectors,
      feedback: validBatchResult.feedback,
      save: validBatchResult.save,
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });

  it("rejects result with invalid navigation mode", () => {
    const invalid = {
      ...validBatchResult,
      navigation: {
        ...validBatchResult.navigation,
        mode: "invalid" as NavigationMode,
      },
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });

  it("rejects result with missing studentName selector", () => {
    const invalid = {
      ...validBatchResult,
      selectors: {
        ...validBatchResult.selectors,
        studentName: "",
      },
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });

  it("rejects result with missing scoreInput selector", () => {
    const invalid = {
      ...validBatchResult,
      selectors: {
        ...validBatchResult.selectors,
        scoreInput: "",
      },
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });

  it("rejects result with invalid feedback type", () => {
    const invalid = {
      ...validBatchResult,
      feedback: {
        ...validBatchResult.feedback,
        type: "invalid" as FeedbackType,
      },
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });

  it("rejects result with non-boolean requiresHiddenSync", () => {
    const invalid = {
      ...validBatchResult,
      feedback: {
        ...validBatchResult.feedback,
        requiresHiddenSync: "yes" as unknown as boolean,
      },
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });

  it("rejects result with empty buttonText", () => {
    const invalid = {
      ...validBatchResult,
      save: {
        ...validBatchResult.save,
        buttonText: "",
      },
    };
    expect(isValidDiscoveryResult(invalid)).toBe(false);
  });
});

// ── DISCOVERY_SYSTEM_PROMPT ────────────────────────────────────────────────

describe("DISCOVERY_SYSTEM_PROMPT", () => {
  it("contains substantive discovery instructions", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("web page structure analyzer");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("BATCH");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("SEQUENTIAL");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("studentSection");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("studentName");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("scoreInput");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("feedbackBox");
  });

  it("includes batch mode indicators", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("Repeating student rows");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("Multiple score inputs");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("page-wide");
  });

  it("includes sequential mode indicators", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("Next/Previous student buttons");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("student name dropdown");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("X of N");
  });

  it("includes selector rules", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("valid CSS");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("attribute selectors");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("data-testid");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("relative selectors");
  });

  it("includes feedback type guidance", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("textarea");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("tinymce");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("contenteditable");
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("rich text editor");
  });

  it("includes JSON response format", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain('"navigation"');
    expect(DISCOVERY_SYSTEM_PROMPT).toContain('"selectors"');
    expect(DISCOVERY_SYSTEM_PROMPT).toContain('"feedback"');
    expect(DISCOVERY_SYSTEM_PROMPT).toContain('"save"');
    expect(DISCOVERY_SYSTEM_PROMPT).toContain('"confidence"');
  });

  it("first 200 chars contain 'JSON' (bookend — anchors model to JSON output)", () => {
    const first200 = DISCOVERY_SYSTEM_PROMPT.substring(0, 200);
    expect(first200).toContain("JSON");
  });

  it("last 200 chars contain 'JSON' (bookend — reinforces JSON output at end)", () => {
    const last200 = DISCOVERY_SYSTEM_PROMPT.substring(DISCOVERY_SYSTEM_PROMPT.length - 200);
    expect(last200).toContain("JSON");
  });

  it("contains FORBIDDEN negative constraints section", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("FORBIDDEN");
  });

  it("contains concrete example with real CSS selectors", () => {
    expect(DISCOVERY_SYSTEM_PROMPT).toContain("tr[id^='graderow']");
  });
});

// ── DISCOVERY_USER_PROMPT_TEMPLATE ─────────────────────────────────────────

describe("DISCOVERY_USER_PROMPT_TEMPLATE", () => {
  const mockDomSnapshot = [
    {
      depth: 0,
      tag: "body",
      childCount: 5,
    },
    {
      depth: 1,
      tag: "div",
      attrs: { class: "container" },
      childCount: 2,
    },
    {
      depth: 2,
      tag: "table",
      attrs: { id: "grades" },
      childCount: 10,
    },
  ];

  it("includes page URL in prompt", () => {
    const url = "https://example.com/grades";
    const prompt = DISCOVERY_USER_PROMPT_TEMPLATE(url, mockDomSnapshot);
    expect(prompt).toContain(url);
  });

  it("includes DOM snapshot in prompt", () => {
    const prompt = DISCOVERY_USER_PROMPT_TEMPLATE(
      "https://example.com",
      mockDomSnapshot
    );
    expect(prompt).toContain("DOM SNAPSHOT");
    expect(prompt).toContain("simplified tree");
    expect(prompt).toContain("3 nodes");
  });

  it("includes instruction to analyze screenshot and DOM", () => {
    const prompt = DISCOVERY_USER_PROMPT_TEMPLATE(
      "https://example.com",
      mockDomSnapshot
    );
    expect(prompt).toContain("screenshot");
    expect(prompt).toContain("DOM snapshot");
    expect(prompt).toContain("CSS selectors");
  });

  it("includes goal of extracting student data", () => {
    const prompt = DISCOVERY_USER_PROMPT_TEMPLATE(
      "https://example.com",
      mockDomSnapshot
    );
    expect(prompt).toContain("student names");
    expect(prompt).toContain("responses");
    expect(prompt).toContain("scores");
    expect(prompt).toContain("feedback");
  });

  it("truncates large DOM snapshots to 12000 chars", () => {
    const largeDomSnapshot = Array(1000)
      .fill(null)
      .map((_, i) => ({
        depth: i % 8,
        tag: "div",
        attrs: { id: `elem-${i}` },
        text: `Element ${i}`,
        childCount: Math.floor(Math.random() * 10),
      }));

    const prompt = DISCOVERY_USER_PROMPT_TEMPLATE(
      "https://example.com",
      largeDomSnapshot
    );

    // The prompt should contain the DOM snapshot section
    expect(prompt).toContain("DOM SNAPSHOT");
    expect(prompt).toContain("simplified tree");
    
    // The JSON string in the prompt should be truncated to 12000 chars
    // (the function uses smart truncation: removes whole elements from end, not mid-string)
    const jsonMatch = prompt.match(/DOM SNAPSHOT[\s\S]*?:\n([\s\S]*?)\n\nLook at/);
    if (jsonMatch) {
      // The JSON portion should be reasonable in size (not the full 1000 elements)
      expect(jsonMatch[1].length).toBeLessThanOrEqual(12100);
      // Verify the JSON is valid (not cut mid-object)
      expect(() => JSON.parse(jsonMatch[1])).not.toThrow();
    }
  });

  it("includes truncation note when snapshot is truncated", () => {
    const largeDomSnapshot = Array(1000)
      .fill(null)
      .map((_, i) => ({
        depth: i % 8,
        tag: "div",
        attrs: { id: `elem-${i}` },
        text: `Element ${i}`,
        childCount: Math.floor(Math.random() * 10),
      }));

    const prompt = DISCOVERY_USER_PROMPT_TEMPLATE(
      "https://example.com",
      largeDomSnapshot
    );

    // When truncated, the prompt should mention truncation
    expect(prompt).toContain("truncated from");
    expect(prompt).toContain("to fit context limits");
  });
});

// ── DISCOVERY_MAX_ATTEMPTS ────────────────────────────────────────────────────

describe("DISCOVERY_MAX_ATTEMPTS", () => {
  it("is exported and equals 3", () => {
    expect(DISCOVERY_MAX_ATTEMPTS).toBe(3);
  });
});

// ── Integration Tests (Failing) ─────────────────────────────────────────────

describe("Discovery Workflow (Integration - Failing)", () => {
  it.todo("should capture page snapshot and send to AI");
  it.todo("should parse AI response into DiscoveryResult");
  it.todo("should validate selectors on live page");
  it.todo("should handle batch mode discovery");
  it.todo("should handle sequential mode discovery");
  it.todo("should retry on validation failure");
  it.todo("should report progress through callbacks");
  it.todo("should handle AI errors gracefully");
  it.todo("should detect TinyMCE feedback editors");
  it.todo("should detect iframe-based feedback editors");
});

describe("Selector Validation (Integration - Failing)", () => {
  it.todo("should validate batch mode selectors");
  it.todo("should validate sequential mode selectors");
  it.todo("should count matching elements");
  it.todo("should extract sample text from matches");
  it.todo("should handle relative selectors in batch mode");
  it.todo("should handle page-level selectors in sequential mode");
});

describe("Discovery Error Handling (Failing)", () => {
  it.todo("should handle network errors");
  it.todo("should handle AI provider errors");
  it.todo("should handle invalid page structure");
  it.todo("should handle missing required selectors");
  it.todo("should provide helpful error messages");
});

// ── Rubric Extraction from Screenshot ─────────────────────────────────────

describe("RUBRIC_EXTRACTION_PROMPT", () => {
  it("contains rubric extraction instructions", () => {
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("data extraction assistant");
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("rubric");
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("criteria");
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("points");
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("description");
  });

  it("specifies JSON output format", () => {
    expect(RUBRIC_EXTRACTION_PROMPT).toContain('"rubric"');
    expect(RUBRIC_EXTRACTION_PROMPT).toContain('"criteria"');
    expect(RUBRIC_EXTRACTION_PROMPT).toContain('"description"');
    expect(RUBRIC_EXTRACTION_PROMPT).toContain('"points"');
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("suggestedName");
  });

  it("includes rules for point value handling", () => {
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("numbers");
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("maximum value");
    expect(RUBRIC_EXTRACTION_PROMPT).toContain("question number");
  });
});

describe("parseRubricExtractionResponse", () => {
  it("parses valid rubric JSON", () => {
    const json = JSON.stringify({
      suggestedName: "Math Quiz Rubric",
      rubric: [
        { criteria: "Problem Solving", description: "Shows correct work", points: 5 },
        { criteria: "Explanation", description: "Explains reasoning clearly", points: 3 },
        { criteria: "Accuracy", description: "Final answer is correct", points: 2 },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria).toHaveLength(3);
    expect(result.maxScore).toBe(10);
    expect(result.suggestedName).toBe("Math Quiz Rubric");
    expect(result.criteria[0].criteria).toBe("Problem Solving");
    expect(result.criteria[0].points).toBe(5);
    expect(result.criteria[0].description).toBe("Shows correct work");
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const response = `\`\`\`json
{
  "suggestedName": "",
  "rubric": [
    { "criteria": "Content", "description": "Addresses the prompt", "points": 10 },
    { "criteria": "Grammar", "description": "Proper grammar and spelling", "points": 5 }
  ]
}
\`\`\``;

    const result = parseRubricExtractionResponse(response);
    expect(result.criteria).toHaveLength(2);
    expect(result.maxScore).toBe(15);
    expect(result.criteria[0].criteria).toBe("Content");
  });

  it("parses JSON with thinking blocks", () => {
    const response = `<think>
I can see a rubric with three categories...
Let me extract them.
</think>

{
  "rubric": [
    { "criteria": "Thesis", "description": "Clear thesis statement", "points": 10 },
    { "criteria": "Evidence", "description": "Supporting evidence provided", "points": 15 }
  ]
}`;

    const result = parseRubricExtractionResponse(response);
    expect(result.criteria).toHaveLength(2);
    expect(result.maxScore).toBe(25);
  });

  it("handles string point values by converting to numbers", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "Analysis", description: "Deep analysis", points: "8" },
        { criteria: "Format", description: "Proper formatting", points: "4.5" },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria[0].points).toBe(8);
    expect(result.criteria[1].points).toBe(4.5);
    expect(result.maxScore).toBe(12.5);
  });

  it("handles NaN points by defaulting to 0", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "Research", description: "Good sources", points: "N/A" },
        { criteria: "Writing", description: "Clear prose", points: 10 },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria[0].points).toBe(0);
    expect(result.criteria[1].points).toBe(10);
    expect(result.maxScore).toBe(10);
  });

  it("includes question numbers when present", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "Q1 Work", description: "Shows work for Q1", points: 5, question: 1 },
        { criteria: "Q2 Work", description: "Shows work for Q2", points: 5, question: 2 },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria[0].question).toBe(1);
    expect(result.criteria[1].question).toBe(2);
  });

  it("converts string question numbers to integers", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "Part A", description: "Solves part A", points: 5, question: "1" },
        { criteria: "Part B", description: "Solves part B", points: 5, question: "2" },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria[0].question).toBe(1);
    expect(result.criteria[1].question).toBe(2);
  });

  it("skips criteria items with no name", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "Valid Criterion", description: "Has a name", points: 5 },
        { criteria: "", description: "Empty name", points: 3 },
        { criteria: "Another Valid", description: "Also has a name", points: 2 },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0].criteria).toBe("Valid Criterion");
    expect(result.criteria[1].criteria).toBe("Another Valid");
  });

  it("handles 'name' field as fallback for 'criteria'", () => {
    const json = JSON.stringify({
      rubric: [
        { name: "Creativity", description: "Shows original thinking", points: 10 },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.criteria[0].criteria).toBe("Creativity");
  });

  it("returns empty string for missing suggestedName", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "Test", description: "Test desc", points: 5 },
      ],
    });

    const result = parseRubricExtractionResponse(json);
    expect(result.suggestedName).toBe("");
  });

  it("throws on completely invalid JSON", () => {
    expect(() => parseRubricExtractionResponse("This is not JSON at all"))
      .toThrow("Could not parse AI rubric extraction response as JSON");
  });

  it("throws on JSON with empty rubric array", () => {
    const json = JSON.stringify({ rubric: [] });
    expect(() => parseRubricExtractionResponse(json))
      .toThrow("AI response contains no rubric criteria");
  });

  it("throws on JSON with missing rubric field", () => {
    const json = JSON.stringify({ data: "no rubric here" });
    expect(() => parseRubricExtractionResponse(json))
      .toThrow("AI response contains no rubric criteria");
  });

  it("throws when all criteria items are invalid (no names)", () => {
    const json = JSON.stringify({
      rubric: [
        { criteria: "", description: "No name 1", points: 5 },
        { description: "No name 2", points: 3 },
      ],
    });

    expect(() => parseRubricExtractionResponse(json))
      .toThrow("no valid criteria items");
  });

  it("extracts JSON embedded in surrounding text", () => {
    const response = `Here is the extracted rubric:

{
  "rubric": [
    { "criteria": "Understanding", "description": "Demonstrates understanding", "points": 10 }
  ]
}

I hope this helps!`;

    const result = parseRubricExtractionResponse(response);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].criteria).toBe("Understanding");
  });
});

describe("isValidRubricExtractionResult", () => {
  const validResult: RubricExtractionResult = {
    criteria: [
      { criteria: "Analysis", description: "Shows analysis", points: 5 },
      { criteria: "Writing", description: "Clear writing", points: 5 },
    ],
    maxScore: 10,
    suggestedName: "Test Rubric",
  };

  it("validates a correct result", () => {
    expect(isValidRubricExtractionResult(validResult)).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidRubricExtractionResult(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidRubricExtractionResult("string")).toBe(false);
    expect(isValidRubricExtractionResult(42)).toBe(false);
  });

  it("rejects empty criteria array", () => {
    expect(isValidRubricExtractionResult({ ...validResult, criteria: [] })).toBe(false);
  });

  it("rejects negative maxScore", () => {
    expect(isValidRubricExtractionResult({ ...validResult, maxScore: -1 })).toBe(false);
  });

  it("rejects criteria with missing name", () => {
    expect(isValidRubricExtractionResult({
      ...validResult,
      criteria: [{ criteria: "", description: "d", points: 5 }],
    })).toBe(false);
  });

  it("rejects criteria with NaN points", () => {
    expect(isValidRubricExtractionResult({
      ...validResult,
      criteria: [{ criteria: "Test", description: "d", points: NaN }],
    })).toBe(false);
  });

  it("rejects non-string maxScore", () => {
    expect(isValidRubricExtractionResult({ ...validResult, maxScore: "10" })).toBe(false);
  });

  it("accepts result with zero maxScore", () => {
    expect(isValidRubricExtractionResult({
      ...validResult,
      criteria: [{ criteria: "Participation", description: "Present", points: 0 }],
      maxScore: 0,
    })).toBe(true);
  });
});

describe("parseRubricFromScreenshot (Integration - Failing)", () => {
  it.todo("should send image to AI and return structured rubric");
  it.todo("should reject non-data-URL images");
  it.todo("should handle AI network errors gracefully");
  it.todo("should handle empty AI responses");
  it.todo("should pass provider/model overrides to AI call");
});
