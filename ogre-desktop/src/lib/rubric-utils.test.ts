import { describe, it, expect } from "vitest";
import { criteriaToText, textToCriteria, hasUnsavedChanges, validateWeights } from "./rubric-utils";
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
// criteriaToText — weight serialization (Task 2)
// ---------------------------------------------------------------------------

describe("criteriaToText — weight serialization", () => {
  it("includes criterionWeight when set", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10, criterionWeight: 25 },
    ];
    expect(criteriaToText(criteria)).toBe("Writing Quality (10pts, 25%): Clear grammar");
  });

  it("omits weight when criterionWeight is undefined (backward compat)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
    ];
    expect(criteriaToText(criteria)).toBe("Writing Quality (10pts): Clear grammar");
  });

  it("omits weight when criterionWeight is undefined — no description", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Analysis", description: "", points: 5 },
    ];
    expect(criteriaToText(criteria)).toBe("Analysis (5pts)");
  });

  it("includes criterionWeight with no description", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Analysis", description: "", points: 5, criterionWeight: 50 },
    ];
    expect(criteriaToText(criteria)).toBe("Analysis (5pts, 50%)");
  });

  it("handles 0% criterionWeight", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Bonus", description: "Optional", points: 0, criterionWeight: 0 },
    ];
    expect(criteriaToText(criteria)).toBe("Bonus (0pts, 0%): Optional");
  });

  it("handles 100% criterionWeight", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Only Criterion", description: "Everything", points: 10, criterionWeight: 100 },
    ];
    expect(criteriaToText(criteria)).toBe("Only Criterion (10pts, 100%): Everything");
  });

  it("handles decimal criterionWeight like 33.3%", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Third", description: "One third", points: 10, criterionWeight: 33.3 },
    ];
    expect(criteriaToText(criteria)).toBe("Third (10pts, 33.3%): One third");
  });

  it("emits category header before first criterion in a group", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10, category: "Writing" },
      { criteria: "Style", description: "Concise", points: 5, category: "Writing" },
    ];
    expect(criteriaToText(criteria)).toBe(
      "## Writing\nWriting Quality (10pts): Clear grammar\nStyle (5pts): Concise"
    );
  });

  it("emits multiple category headers for distinct categories", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10, category: "Writing" },
      { criteria: "Math Work", description: "Correct steps", points: 15, category: "Math" },
    ];
    expect(criteriaToText(criteria)).toBe(
      "## Writing\nWriting Quality (10pts): Clear grammar\n## Math\nMath Work (15pts): Correct steps"
    );
  });

  it("only emits header when category changes (not per criterion)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "A", description: "", points: 5, category: "Cat1" },
      { criteria: "B", description: "", points: 5, category: "Cat1" },
      { criteria: "C", description: "", points: 5, category: "Cat2" },
    ];
    expect(criteriaToText(criteria)).toBe(
      "## Cat1\nA (5pts)\nB (5pts)\n## Cat2\nC (5pts)"
    );
  });

  it("does not emit header when category is undefined", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10 },
      { criteria: "Analysis", description: "Insightful", points: 8 },
    ];
    expect(criteriaToText(criteria)).toBe(
      "Writing Quality (10pts): Clear grammar\nAnalysis (8pts): Insightful"
    );
  });

  it("round-trips criteriaToText(textToCriteria(text)) === text for weighted format", () => {
    const text = "## Writing\nWriting Quality (10pts, 25%): Clear grammar\n## Math\nMath Work (15pts, 75%): Correct steps";
    const parsed = textToCriteria(text);
    expect(criteriaToText(parsed)).toBe(text);
  });

  it("combined: weight + category", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing Quality", description: "Clear grammar", points: 10, category: "Writing", criterionWeight: 25 },
      { criteria: "Math Work", description: "Correct steps", points: 15, category: "Math", criterionWeight: 75 },
    ];
    expect(criteriaToText(criteria)).toBe(
      "## Writing\nWriting Quality (10pts, 25%): Clear grammar\n## Math\nMath Work (15pts, 75%): Correct steps"
    );
  });
});

// ---------------------------------------------------------------------------
// textToCriteria — weight and category parsing (Task 2)
// ---------------------------------------------------------------------------

describe("textToCriteria — weight and category parsing", () => {
  it("parses criterionWeight from 'Name (10pts, 25%): Desc'", () => {
    const result = textToCriteria("Writing Quality (10pts, 25%): Clear grammar");
    expect(result).toEqual([
      { criteria: "Writing Quality", description: "Clear grammar", points: 10, criterionWeight: 25 },
    ]);
  });

  it("produces criterionWeight: undefined for old format 'Name (10pts): Desc'", () => {
    const result = textToCriteria("Writing Quality (10pts): Clear grammar");
    expect(result[0].criterionWeight).toBeUndefined();
  });

  it("produces category: undefined for line without ## header", () => {
    const result = textToCriteria("Writing Quality (10pts): Clear grammar");
    expect(result[0].category).toBeUndefined();
  });

  it("parses category from ## header lines", () => {
    const text = "## Writing\nWriting Quality (10pts): Clear grammar";
    const result = textToCriteria(text);
    expect(result).toEqual([
      { criteria: "Writing Quality", description: "Clear grammar", points: 10, category: "Writing" },
    ]);
  });

  it("assigns category to all criteria following the header until next header", () => {
    const text = "## Writing\nA (5pts): First\nB (5pts): Second\n## Math\nC (10pts): Third";
    const result = textToCriteria(text);
    expect(result[0].category).toBe("Writing");
    expect(result[1].category).toBe("Writing");
    expect(result[2].category).toBe("Math");
  });

  it("handles 0% weight", () => {
    const result = textToCriteria("Bonus (0pts, 0%): Optional");
    expect(result[0].criterionWeight).toBe(0);
    expect(result[0].points).toBe(0);
  });

  it("handles 100% weight", () => {
    const result = textToCriteria("Only Criterion (10pts, 100%): Everything");
    expect(result[0].criterionWeight).toBe(100);
  });

  it("handles decimal weight like 33.3%", () => {
    const result = textToCriteria("Third (10pts, 33.3%): One third");
    expect(result[0].criterionWeight).toBe(33.3);
  });

  it("parses weight without description", () => {
    const result = textToCriteria("Analysis (5pts, 50%)");
    expect(result[0].criterionWeight).toBe(50);
    expect(result[0].description).toBe("");
  });

  it("parses weight with category", () => {
    const text = "## Math\nMath Work (15pts, 75%): Correct steps";
    const result = textToCriteria(text);
    expect(result[0].category).toBe("Math");
    expect(result[0].criterionWeight).toBe(75);
    expect(result[0].points).toBe(15);
    expect(result[0].description).toBe("Correct steps");
  });

  it("old format parses identically to pre-change behavior (backward compat)", () => {
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

// ---------------------------------------------------------------------------
// criterionWeight round-trip
// ---------------------------------------------------------------------------

describe("criterionWeight round-trip", () => {
  it("preserves criterionWeight through textToCriteria → criteriaToText", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Thesis", points: 5, description: "Clear thesis statement", category: "Writing", criterionWeight: 30 },
      { criteria: "Evidence", points: 5, description: "Uses evidence", category: "Writing", criterionWeight: 40 },
      { criteria: "Grammar", points: 5, description: "Correct grammar", category: "Writing", criterionWeight: 30 },
      { criteria: "Setup", points: 5, description: "Correct setup", category: "Math", criterionWeight: 50 },
      { criteria: "Calculation", points: 5, description: "Correct calc", category: "Math", criterionWeight: 50 },
    ];
    const text = criteriaToText(criteria);
    const parsed = textToCriteria(text);
    expect(parsed.length).toBe(5);
    for (let i = 0; i < criteria.length; i++) {
      expect(parsed[i].criteria).toBe(criteria[i].criteria);
      expect(parsed[i].criterionWeight).toBe(criteria[i].criterionWeight);
      expect(parsed[i].category).toBe(criteria[i].category);
    }
  });
});

// ---------------------------------------------------------------------------
// validateWeights (Task 3)
// ---------------------------------------------------------------------------

describe("validateWeights", () => {
  // ---- category mode ----

  it("returns valid:true for empty criteria array (category mode)", () => {
    const result = validateWeights([], "category");
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("returns valid:true when category weights sum to exactly 100 (category mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing", description: "", points: 10, category: "Writing", categoryWeight: 60 },
      { criteria: "Math", description: "", points: 10, category: "Math", categoryWeight: 40 },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sum).toBeCloseTo(100);
  });

  it("returns valid:true when category weights sum to 100.4 (within tolerance)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "A", description: "", points: 5, category: "A", categoryWeight: 50.2 },
      { criteria: "B", description: "", points: 5, category: "B", categoryWeight: 50.2 },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid:false with error when category weights sum to 85 (category mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing", description: "", points: 10, category: "Writing", categoryWeight: 50 },
      { criteria: "Math", description: "", points: 10, category: "Math", categoryWeight: 35 },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("85");
    expect(result.sum).toBeCloseTo(85);
  });

  it("returns valid:false when no categoryWeight fields are set (category mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "Writing", description: "", points: 10, category: "Writing" },
      { criteria: "Math", description: "", points: 10, category: "Math" },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.sum).toBeCloseTo(0);
  });

  it("handles floating point: 33.3 + 33.3 + 33.4 = 100 (category mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "A1", description: "", points: 5, category: "A", categoryWeight: 33.3 },
      { criteria: "A2", description: "", points: 5, category: "A", categoryWeight: 33.3 },
      { criteria: "B1", description: "", points: 5, category: "B", categoryWeight: 33.3 },
      { criteria: "C1", description: "", points: 5, category: "C", categoryWeight: 33.4 },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("sums ONE categoryWeight per unique category (not per criterion) (category mode)", () => {
    // Writing has 2 criteria both with categoryWeight 60, Math has 1 with 40
    // Correct sum = 60 + 40 = 100, NOT 60 + 60 + 40 = 160
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing", categoryWeight: 60 },
      { criteria: "W2", description: "", points: 5, category: "Writing", categoryWeight: 60 },
      { criteria: "M1", description: "", points: 5, category: "Math", categoryWeight: 40 },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(true);
    expect(result.sum).toBeCloseTo(100);
  });

  it("returns valid:true for empty criteria array (criterion mode)", () => {
    const result = validateWeights([], "criterion");
    expect(result).toEqual({ valid: true, errors: [] });
  });

  // ---- criterion mode ----

  it("returns valid:true when all category groups sum to 100 (criterion mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing", criterionWeight: 60 },
      { criteria: "W2", description: "", points: 5, category: "Writing", criterionWeight: 40 },
      { criteria: "M1", description: "", points: 5, category: "Math", criterionWeight: 70 },
      { criteria: "M2", description: "", points: 5, category: "Math", criterionWeight: 30 },
    ];
    const result = validateWeights(criteria, "criterion");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid:false when one category group sums to 90 (criterion mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing", criterionWeight: 60 },
      { criteria: "W2", description: "", points: 5, category: "Writing", criterionWeight: 30 },
    ];
    const result = validateWeights(criteria, "criterion");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("names the failing category in the error message (criterion mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing", criterionWeight: 60 },
      { criteria: "W2", description: "", points: 5, category: "Writing", criterionWeight: 30 },
    ];
    const result = validateWeights(criteria, "criterion");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Writing");
  });

  it("returns valid:true for single criterion per category at 100% (criterion mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing", criterionWeight: 100 },
      { criteria: "M1", description: "", points: 5, category: "Math", criterionWeight: 100 },
    ];
    const result = validateWeights(criteria, "criterion");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid:false if any category fails even when others pass (criterion mode)", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing", criterionWeight: 60 },
      { criteria: "W2", description: "", points: 5, category: "Writing", criterionWeight: 40 },
      // Math group sums to only 90
      { criteria: "M1", description: "", points: 5, category: "Math", criterionWeight: 50 },
      { criteria: "M2", description: "", points: 5, category: "Math", criterionWeight: 40 },
    ];
    const result = validateWeights(criteria, "criterion");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Math"))).toBe(true);
  });

  it("includes the actual sum % in category mode error message", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "A", description: "", points: 5, category: "A", categoryWeight: 40 },
      { criteria: "B", description: "", points: 5, category: "B", categoryWeight: 30 },
    ];
    const result = validateWeights(criteria, "category");
    expect(result.valid).toBe(false);
    // Error must mention the sum (70)
    expect(result.errors[0]).toMatch(/70/);
  });

  it("handles criteria with undefined criterionWeight as 0 in criterion mode", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "W1", description: "", points: 5, category: "Writing" },
      { criteria: "W2", description: "", points: 5, category: "Writing" },
    ];
    const result = validateWeights(criteria, "criterion");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Writing");
  });

  it("does not mutate the input criteria array", () => {
    const criteria: RubricCriterion[] = [
      { criteria: "A", description: "", points: 5, category: "A", categoryWeight: 100 },
    ];
    const original = JSON.stringify(criteria);
    validateWeights(criteria, "category");
    validateWeights(criteria, "criterion");
    expect(JSON.stringify(criteria)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// textToCriteria — checkbox format parsing
// ---------------------------------------------------------------------------

describe("textToCriteria — checkbox format", () => {
  it("parses a single category line with one checkbox criterion", () => {
    const text = "CLT Statement\t☐ States sampling distribution of x̄ approaches normality";
    const result = textToCriteria(text);
    expect(result).toEqual([
      {
        criteria: "States sampling distribution of x̄ approaches normality",
        description: "",
        points: 0,
        category: "CLT Statement",
      },
    ]);
  });

  it("parses multiple checkbox criteria in the same category (continuation lines)", () => {
    const text = [
      "CLT Statement\t☐ States sampling distribution of x̄ approaches normality",
      "☐ Mentions condition: sufficiently large n",
    ].join("\n");
    const result = textToCriteria(text);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("CLT Statement");
    expect(result[0].criteria).toBe("States sampling distribution of x̄ approaches normality");
    expect(result[1].category).toBe("CLT Statement");
    expect(result[1].criteria).toBe("Mentions condition: sufficiently large n");
    expect(result[1].points).toBe(0);
    expect(result[1].description).toBe("");
  });

  it("parses multiple categories with their criteria", () => {
    const text = [
      "CLT Statement\t☐ States sampling distribution of x̄ approaches normality",
      "☐ Mentions condition: sufficiently large n",
      "Standard Error\t☐ Provides formula SE = σ/√n",
      "☐ Explains SE decreases as n increases",
      "Margin of Error Connection\t☐ Provides MOE formula: MOE = z* × SE",
    ].join("\n");
    const result = textToCriteria(text);
    expect(result).toHaveLength(5);
    expect(result[0].category).toBe("CLT Statement");
    expect(result[1].category).toBe("CLT Statement");
    expect(result[2].category).toBe("Standard Error");
    expect(result[2].criteria).toBe("Provides formula SE = σ/√n");
    expect(result[3].category).toBe("Standard Error");
    expect(result[4].category).toBe("Margin of Error Connection");
    expect(result[4].criteria).toBe("Provides MOE formula: MOE = z* × SE");
  });

  it("all parsed criteria have points: 0 and description: ''", () => {
    const text = "Category A\t☐ Criterion one\n☐ Criterion two";
    const result = textToCriteria(text);
    for (const c of result) {
      expect(c.points).toBe(0);
      expect(c.description).toBe("");
    }
  });

  it("skips blank lines", () => {
    const text = "Category A\t☐ First\n\n☐ Second\n";
    const result = textToCriteria(text);
    expect(result).toHaveLength(2);
  });

  it("handles criterion text that itself contains colons", () => {
    const text = "Standard Error\t☐ Provides formula SE = σ/√n";
    const result = textToCriteria(text);
    expect(result[0].criteria).toBe("Provides formula SE = σ/√n");
  });

  it("does not fall through to standard parser when checkbox format detected", () => {
    // A mixed string that has a tab+☐ pattern — should use checkbox path, not LINE_RE
    const text = "Category\t☐ Some criterion\nWriting Quality (10pts): Clear grammar";
    const result = textToCriteria(text);
    // Writing Quality line has no ☐ so it's skipped; only the checkbox item parsed
    expect(result).toHaveLength(1);
    expect(result[0].criteria).toBe("Some criterion");
  });

  it("returns empty array for empty string (checkbox path not triggered)", () => {
    expect(textToCriteria("")).toEqual([]);
  });

  it("strips extra whitespace from category and criteria names", () => {
    const text = "  My Category  \t☐  Criterion with spaces  ";
    const result = textToCriteria(text);
    expect(result[0].category).toBe("My Category");
    expect(result[0].criteria).toBe("Criterion with spaces");
  });
});

// ---------------------------------------------------------------------------
// textToCriteria — indented-category format parsing
// ---------------------------------------------------------------------------

describe("textToCriteria — indented-category format", () => {
  it("parses a single category with one indented criterion", () => {
    const text = "Statistical Decision\t\n Compare the p-value to α";
    const result = textToCriteria(text);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Statistical Decision");
    expect(result[0].criteria).toBe("Compare the p-value to α");
    expect(result[0].points).toBe(0);
    expect(result[0].description).toBe("");
  });

  it("parses multiple criteria under one category", () => {
    const text = "Statistical Decision\t\n Compare the p-value to α and state whether you reject or fail to reject H₀.\n State whether the result is statistically significant.";
    const result = textToCriteria(text);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("Statistical Decision");
    expect(result[0].criteria).toBe("Compare the p-value to α and state whether you reject or fail to reject H₀.");
    expect(result[1].category).toBe("Statistical Decision");
    expect(result[1].criteria).toBe("State whether the result is statistically significant.");
  });

  it("parses multiple categories with their indented criteria", () => {
    const text = [
      "Statistical Decision\t",
      " Compare the p-value to α and state whether you reject or fail to reject H₀.",
      " State whether the result is statistically significant.",
      "Conclusion in Context\t",
      " Explain what the test decision means for the specific claim in this real-world situation.",
      "Interpretation of Evidence\t",
      " Describe what the evidence tells us and what the researcher should take away from the result.",
    ].join("\n");
    const result = textToCriteria(text);
    expect(result).toHaveLength(4);
    expect(result[0].category).toBe("Statistical Decision");
    expect(result[1].category).toBe("Statistical Decision");
    expect(result[2].category).toBe("Conclusion in Context");
    expect(result[3].category).toBe("Interpretation of Evidence");
  });

  it("all parsed criteria have points: 0 and description: ''", () => {
    const text = "Category\t\n Criterion one\n Criterion two";
    const result = textToCriteria(text);
    for (const c of result) {
      expect(c.points).toBe(0);
      expect(c.description).toBe("");
    }
  });

  it("skips blank lines", () => {
    const text = "Category\t\n\n Criterion one\n\n Criterion two\n";
    const result = textToCriteria(text);
    expect(result).toHaveLength(2);
  });

  it("handles criteria containing colons, equals signs, and special chars", () => {
    const text = "Standard Error\t\n Provides formula SE = σ/√n";
    const result = textToCriteria(text);
    expect(result[0].criteria).toBe("Provides formula SE = σ/√n");
  });

  it("does not trigger when text has no trailing-tab category lines", () => {
    // Standard format — should NOT use the indented path
    const text = "Writing Quality (10pts): Clear grammar";
    const result = textToCriteria(text);
    expect(result[0].criteria).toBe("Writing Quality");
    expect(result[0].points).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// allocation row detection
// ---------------------------------------------------------------------------

describe("allocation row detection", () => {
  it("detects 'Full (2pts)' as allocation row", () => {
    const result = textToCriteria("Full (2pts)");
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe("allocation");
  });

  it("detects 'Partial (1pts): Partial description' as allocation row", () => {
    const result = textToCriteria("Partial (1pts): Partial description");
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe("allocation");
  });

  it("detects 'Missing (0pts)' as allocation row", () => {
    const result = textToCriteria("Missing (0pts)");
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe("allocation");
  });

  it("detects 'Minimal (1pts)' as allocation row", () => {
    const result = textToCriteria("Minimal (1pts)");
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe("allocation");
  });

  it("does NOT set rowType for 'States the CLT (0pts)'", () => {
    const result = textToCriteria("States the CLT (0pts)");
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBeUndefined();
  });

  it("does NOT set rowType for 'Full Credit (2pts)' (extra words after keyword)", () => {
    const result = textToCriteria("Full Credit (2pts)");
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBeUndefined();
  });

  it("detects allocation rows in checkbox format with 'Full (2):' in criterion text", () => {
    const text = "Category A\t☐ Full (2): Complete solution with all steps shown";
    const result = textToCriteria(text);
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe("allocation");
    expect(result[0].criteria).toBe("Full (2): Complete solution with all steps shown");
  });
});
