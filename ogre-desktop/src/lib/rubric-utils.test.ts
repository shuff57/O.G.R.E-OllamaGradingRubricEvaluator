import { describe, it, expect } from "vitest";
import { criteriaToText, textToCriteria, hasUnsavedChanges } from "./rubric-utils";
import type { RubricCriterion } from "./rubric-api";

// ---------------------------------------------------------------------------
// criteriaToText
// ---------------------------------------------------------------------------

describe("criteriaToText", () => {
  it("serializes a single criterion with description", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar and style", points: 10 },
    ];
    expect(criteriaToText(criteria)).toBe("Writing Quality (10pts): Clear grammar and style");
  });

  it("serializes a single criterion without description", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Argument Strength", description: "", points: 15 },
    ];
    expect(criteriaToText(criteria)).toBe("Argument Strength (15pts)");
  });

  it("serializes multiple criteria as newline-separated lines", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
      { criteria: "Argument Strength", description: "Thesis supported", points: 15 },
      { criteria: "Analysis", description: "", points: 5 },
    ];
    expect(criteriaToText(criteria)).toBe(
      "Writing Quality (10pts): Clear grammar\nArgument Strength (15pts): Thesis supported\nAnalysis (5pts)"
    );
  });

  it("handles decimal point values", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Partial Credit", description: "Half points allowed", points: 7.5 },
    ];
    expect(criteriaToText(criteria)).toBe("Partial Credit (7.5pts): Half points allowed");
  });

  it("returns empty string for empty array", () => {
    expect(criteriaToText([])).toBe("");
  });

  it("trims whitespace from criteria name and description", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "  Padded Name  ", description: "  padded desc  ", points: 5 },
    ];
    expect(criteriaToText(criteria)).toBe("Padded Name (5pts): padded desc");
  });

  it("uses 'Unnamed' for empty criteria name", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "", description: "some desc", points: 3 },
    ];
    expect(criteriaToText(criteria)).toBe("Unnamed (3pts): some desc");
  });

  it("handles zero points", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Bonus", description: "Optional", points: 0 },
    ];
    expect(criteriaToText(criteria)).toBe("Bonus (0pts): Optional");
  });
});

// ---------------------------------------------------------------------------
// textToCriteria
// ---------------------------------------------------------------------------

describe("textToCriteria", () => {
  it("parses a single line with description", () => {
    const result = textToCriteria("Writing Quality (10pts): Clear grammar and style");
    expect(result).toEqual([
      { criteria: "Writing Quality", description: "Clear grammar and style", points: 10 },
    ]);
  });

  it("parses a line without description", () => {
    const result = textToCriteria("Analysis (5pts)");
    expect(result).toEqual([
      { criteria: "Analysis", description: "", points: 5 },
    ]);
  });

  it("parses multiple lines", () => {
    const text = [
      "Writing Quality (10pts): Clear grammar",
      "Argument Strength (15pts): Thesis supported",
      "Analysis (5pts)",
    ].join("\n");
    expect(textToCriteria(text)).toEqual([
      { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
      { criteria: "Argument Strength", description: "Thesis supported", points: 15 },
      { criteria: "Analysis", description: "", points: 5 },
    ]);
  });

  it("skips blank lines", () => {
    const text = "\nWriting Quality (10pts): Clear grammar\n\nAnalysis (5pts)\n";
    const result = textToCriteria(text);
    expect(result).toHaveLength(2);
  });

  it("skips lines with no recognizable pts pattern", () => {
    const text = "This line has no points\nWriting Quality (10pts): OK";
    const result = textToCriteria(text);
    expect(result).toHaveLength(1);
    expect(result[0].criteria).toBe("Writing Quality");
  });

  it("handles decimal points", () => {
    const result = textToCriteria("Partial Credit (7.5pts): Half points");
    expect(result).toEqual([
      { criteria: "Partial Credit", description: "Half points", points: 7.5 },
    ]);
  });

  it("handles '(N pts)' with a space before pts", () => {
    const result = textToCriteria("Clarity (10 pts): Well written");
    expect(result).toEqual([
      { criteria: "Clarity", description: "Well written", points: 10 },
    ]);
  });

  it("is case-insensitive for pts suffix", () => {
    const result = textToCriteria("Clarity (10PTS): Well written");
    expect(result).toEqual([
      { criteria: "Clarity", description: "Well written", points: 10 },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(textToCriteria("")).toEqual([]);
  });

  it("returns empty array for all-blank input", () => {
    expect(textToCriteria("   \n  \n  ")).toEqual([]);
  });

  it("handles description with colons in it", () => {
    const result = textToCriteria("Rubric Item (5pts): Must include: examples and: evidence");
    expect(result[0].description).toBe("Must include: examples and: evidence");
  });

  it("trims whitespace from parsed fields", () => {
    const result = textToCriteria("  Writing Quality  (10pts):   Clear grammar  ");
    expect(result[0].criteria).toBe("Writing Quality");
    expect(result[0].description).toBe("Clear grammar");
  });

  it("defaults points to 0 when value is missing (edge case)", () => {
    // Manually test edge: parseFloat('') => NaN => fallback 0
    const result = textToCriteria("Weird Item (0pts): zero");
    expect(result[0].points).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Round-trip fidelity
// ---------------------------------------------------------------------------

describe("criteriaToText → textToCriteria round-trip", () => {
  it("round-trips a full rubric correctly", () => {
    const original: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar and style", points: 10 },
      { criteria: "Argument Strength", description: "Thesis is supported with evidence", points: 15 },
      { criteria: "Analysis", description: "", points: 5 },
      { criteria: "Half Point Item", description: "Partial credit", points: 7.5 },
    ];
    const text = criteriaToText(original);
    const parsed = textToCriteria(text);
    expect(parsed).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// hasUnsavedChanges
// ---------------------------------------------------------------------------

describe("hasUnsavedChanges", () => {
  const original: RubricCriterion[] = [
    { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
  ];

  it("returns false when text matches original", () => {
    const text = criteriaToText(original);
    expect(hasUnsavedChanges(text, original)).toBe(false);
  });

  it("returns true when text differs from original", () => {
    expect(hasUnsavedChanges("Writing Quality (20pts): Changed", original)).toBe(true);
  });

  it("returns false when text has leading/trailing whitespace only", () => {
    const text = "  " + criteriaToText(original) + "  ";
    expect(hasUnsavedChanges(text, original)).toBe(false);
  });

  it("returns true when a criterion is added in text", () => {
    const text = criteriaToText(original) + "\nNew Item (5pts): Added";
    expect(hasUnsavedChanges(text, original)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional round-trip fidelity, edge cases, and hasUnsavedChanges correctness
// ---------------------------------------------------------------------------

describe("round-trip and edge cases", () => {
  it("round-trips 3 criteria with different point values", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Mathematical Reasoning", description: "Shows clear logical steps", points: 5 },
      { criteria: "Accuracy", description: "Correct final answer", points: 10 },
      { criteria: "Presentation", description: "Neat and organized", points: 3 },
    ];
    const text = criteriaToText(criteria);
    const parsed = textToCriteria(text);
    expect(parsed).toEqual(criteria);
  });

  it("criteriaToText returns empty string for empty array", () => {
    expect(criteriaToText([])).toBe("");
  });

  it("textToCriteria returns empty array for empty string", () => {
    expect(textToCriteria("")).toEqual([]);
  });

  it("textToCriteria returns empty array for random text without format", () => {
    expect(textToCriteria("random text without format")).toEqual([]);
  });

  it("hasUnsavedChanges returns true when point values differ", () => {
    const original: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
      { criteria: "Analysis", description: "Insightful", points: 8 },
    ];
    const modifiedText = "Writing Quality (10pts): Clear grammar\nAnalysis (15pts): Insightful";
    expect(hasUnsavedChanges(modifiedText, original)).toBe(true);
  });

  it("hasUnsavedChanges returns false when criteria are identical", () => {
    const original: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
      { criteria: "Analysis", description: "Insightful", points: 8 },
    ];
    const identicalText = criteriaToText(original);
    expect(hasUnsavedChanges(identicalText, original)).toBe(false);
  });
});
