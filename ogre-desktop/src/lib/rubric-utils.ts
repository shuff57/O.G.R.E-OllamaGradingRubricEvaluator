/**
 * Rubric text serialization / deserialization utilities.
 *
 * Text format (one criterion per line):
 *   Criterion Name (10pts): Description text here
 *
 * Extended format with optional weight:
 *   Criterion Name (10pts, 25%): Description text here
 *
 * Extended format with optional category headers:
 *   ## Category Name
 *   Criterion Name (10pts): Description text here
 *
 * Rules:
 * - Points suffix is "(Npts)" or "(N pts)" — integer or decimal
 * - Optional weight suffix is ", Y%" inside the parens after pts
 * - Colon after the points block separates name+points from description
 * - Description is optional
 * - Category header lines start with "## " and apply to all subsequent criteria
 * - Lines that can't be parsed are silently skipped (except ## headers)
 */

import type { RubricCriterion } from "./rubric-api";

/**
 * Serialize an array of RubricCriterion into a human-readable string.
 * Each criterion becomes one line:
 *   "Criterion Name (10pts): Description"
 *   "Criterion Name (10pts, 25%): Description"  — when criterionWeight is set
 *   "Criterion Name (10pts)"  — when description is empty
 *
 * When criteria have a `category` field, a "## Category Name" header line is
 * emitted before the first criterion of each distinct category.
 */
export function criteriaToText(criteria: RubricCriterion[]): string {
  const lines: string[] = [];
  let lastCategory: string | undefined = undefined;

  for (const c of criteria) {
    // Emit category header when category changes
    if (c.category !== undefined && c.category !== lastCategory) {
      lines.push(`## ${c.category}`);
      lastCategory = c.category;
    }

    const weightPart =
      c.criterionWeight !== undefined ? `, ${c.criterionWeight}%` : "";
    const pts = `(${c.points}pts${weightPart})`;
    const name = c.criteria?.trim() || "Unnamed";
    const desc = c.description?.trim();
    lines.push(desc ? `${name} ${pts}: ${desc}` : `${name} ${pts}`);
  }

  return lines.join("\n");
}

/**
 * Parse a rubric text string back into RubricCriterion[].
 *
 * Tolerant / best-effort:
 * - Blank lines are skipped
 * - Lines starting with "## " set the current category for subsequent criteria
 * - Lines without a recognizable "(Npts)" pattern are skipped
 * - Points default to 0 if the value can't be parsed as a number
 * - Description defaults to empty string if absent
 * - criterionWeight is set when ", Y%" is present inside the pts parens
 * - category is set when a "## Category" header precedes the criterion
 */
export function textToCriteria(text: string): RubricCriterion[] {
  const lines = text.split("\n");
  const results: RubricCriterion[] = [];

  // Matches: "Some Name (10pts): Optional description"
  //      or: "Some Name (10 pts)"
  //      or: "Some Name (10pts, 25%): Optional description"  (with weight)
  //      or: "Some Name (10pts, 25%)"
  const LINE_RE =
    /^(.+?)\s*\((\d+(?:\.\d+)?)\s*pts?(?:,\s*(\d+(?:\.\d+)?)%\s*)?\)\s*(?::\s*(.*))?$/i;

  // Category header pattern: "## Category Name"
  const CATEGORY_RE = /^##\s+(.+)$/;

  let currentCategory: string | undefined = undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Check for category header
    const catMatch = CATEGORY_RE.exec(line);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      continue;
    }

    const match = LINE_RE.exec(line);
    if (!match) continue; // unrecognized line — skip silently

    const [, nameRaw, ptsRaw, weightRaw, descRaw] = match;
    const criteria = nameRaw.trim();
    const points = parseFloat(ptsRaw) || 0;
    const description = descRaw?.trim() ?? "";

    if (!criteria) continue;

    const criterion: RubricCriterion = { criteria, description, points };

    if (weightRaw !== undefined) {
      criterion.criterionWeight = parseFloat(weightRaw);
    }

    if (currentCategory !== undefined) {
      criterion.category = currentCategory;
    }

    results.push(criterion);
  }

  return results;
}

/**
 * Returns true when the text representation differs from the saved criteria.
 * Used to decide whether to show the "Update Library" button.
 */
export function hasUnsavedChanges(
  text: string,
  original: RubricCriterion[]
): boolean {
  return text.trim() !== criteriaToText(original).trim();
}

/**
 * Validates that weight values are properly configured.
 *
 * Category mode: sums ONE `categoryWeight` per unique category group
 * (taking the first criterion's value per group). Valid if total is 99.5–100.5.
 *
 * Criterion mode: groups criteria by `category`, sums `criterionWeight` within
 * each group. Valid only if ALL groups sum to 99.5–100.5.
 *
 * An empty criteria array is always valid.
 */
export function validateWeights(
  criteria: RubricCriterion[],
  mode: "category" | "criterion"
): { valid: boolean; sum?: number; errors: string[] } {
  if (criteria.length === 0) {
    return { valid: true, errors: [] };
  }

  const TOLERANCE_LOW = 99.5;
  const TOLERANCE_HIGH = 100.5;

  if (mode === "category") {
    // Build a map: category key → first criterion's categoryWeight
    const seen = new Map<string | undefined, number>();
    for (const c of criteria) {
      const key = c.category;
      if (!seen.has(key)) {
        seen.set(key, c.categoryWeight ?? 0);
      }
    }

    const sum = Array.from(seen.values()).reduce((acc, w) => acc + w, 0);
    const roundedSum = Math.round(sum * 10) / 10;

    if (sum >= TOLERANCE_LOW && sum <= TOLERANCE_HIGH) {
      return { valid: true, sum: roundedSum, errors: [] };
    }

    return {
      valid: false,
      sum: roundedSum,
      errors: [
        `Category weights sum to ${roundedSum}%, must be 100%`,
      ],
    };
  }

  // criterion mode
  const groups = new Map<string | undefined, RubricCriterion[]>();
  for (const c of criteria) {
    const key = c.category;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(c);
  }

  const errors: string[] = [];
  let firstFailingSum: number | undefined;

  for (const [cat, group] of groups) {
    const groupSum = group.reduce(
      (acc, c) => acc + (c.criterionWeight ?? 0),
      0
    );
    const roundedGroupSum = Math.round(groupSum * 10) / 10;

    if (groupSum < TOLERANCE_LOW || groupSum > TOLERANCE_HIGH) {
      const catLabel = cat ?? "(uncategorized)";
      errors.push(
        `Category '${catLabel}' criteria weights sum to ${roundedGroupSum}%, must be 100%`
      );
      if (firstFailingSum === undefined) {
        firstFailingSum = roundedGroupSum;
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, sum: firstFailingSum, errors };
  }

  return { valid: true, errors: [] };
}
