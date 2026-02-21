/**
 * Rubric text serialization / deserialization utilities.
 *
 * Text format (one criterion per line):
 *   Criterion Name (10pts): Description text here
 *
 * Rules:
 * - Points suffix is "(Npts)" or "(N pts)" — integer or decimal
 * - Colon after the points block separates name+points from description
 * - Description is optional
 * - Lines that can't be parsed are silently skipped
 */

import type { RubricCriterion } from "./rubric-api";

/**
 * Serialize an array of RubricCriterion into a human-readable string.
 * Each criterion becomes one line:
 *   "Criterion Name (10pts): Description"
 * or just:
 *   "Criterion Name (10pts)"  — when description is empty
 */
export function criteriaToText(criteria: RubricCriterion[]): string {
  return criteria
    .map((c) => {
      const pts = `(${c.points}pts)`;
      const name = c.criteria?.trim() || "Unnamed";
      const desc = c.description?.trim();
      return desc ? `${name} ${pts}: ${desc}` : `${name} ${pts}`;
    })
    .join("\n");
}

/**
 * Parse a rubric text string back into RubricCriterion[].
 *
 * Tolerant / best-effort:
 * - Blank lines are skipped
 * - Lines without a recognizable "(Npts)" pattern are skipped
 * - Points default to 0 if the value can't be parsed as a number
 * - Description defaults to empty string if absent
 */
export function textToCriteria(text: string): RubricCriterion[] {
  const lines = text.split("\n");
  const results: RubricCriterion[] = [];

  // Matches: "Some Name (10pts): Optional description"
  // or:      "Some Name (10 pts)"
  const LINE_RE = /^(.+?)\s*\((\d+(?:\.\d+)?)\s*pts?\)\s*(?::\s*(.*))?$/i;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const match = LINE_RE.exec(line);
    if (!match) continue; // unrecognized line — skip silently

    const [, nameRaw, ptsRaw, descRaw] = match;
    const criteria = nameRaw.trim();
    const points = parseFloat(ptsRaw) || 0;
    const description = descRaw?.trim() ?? "";

    if (!criteria) continue;

    results.push({ criteria, description, points });
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
