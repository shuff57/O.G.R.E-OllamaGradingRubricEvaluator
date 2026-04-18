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
 *
 * Checkbox format (auto-detected):
 *   Category Name\t☐ Criterion description
 *   ☐ Another criterion in same category
 *   Next Category\t☐ First criterion of next category
 *
 * - Detected when text contains a tab followed by ☐
 * - Each ☐ item becomes one RubricCriterion with points: 0
 * - Category comes from text before the tab on the same line;
 *   continuation ☐ lines (no tab) inherit the last seen category
 * - ☐ prefix is stripped from the criterion name
 */

import type { RubricCriterion } from "./rubric-api";

/**
 * Returns true when the criterion name matches allocation row patterns.
 * Matches: "Full (2pts)", "Partial (1pts): ...", "Minimal (1pts)", "Missing (0pts)"
 * Does NOT match: "Full Credit (2pts)" (extra words between keyword and paren)
 */
export function isAllocationCriterion(name: string): boolean {
  return /^(Full|Partial|Minimal|Missing)\s*\(\d/i.test(name);
}

/**
 * Build a map from criterion index → max points (from its "Full" allocation row).
 * For non-allocation rows, scans subsequent rows to find the first "Full (Npts)" row.
 * Returns undefined for rows that have no matching "Full" allocation.
 */
export function getFullCreditPoints(criteria: RubricCriterion[]): Map<number, number> {
  const result = new Map<number, number>();
  for (let i = 0; i < criteria.length; i++) {
    if (isAllocationCriterion(criteria[i].criteria)) continue;
    // Scan forward for the "Full" allocation row belonging to this criterion
    for (let j = i + 1; j < criteria.length; j++) {
      const c = criteria[j];
      if (isAllocationCriterion(c.criteria)) {
        if (/^Full\s*\(/i.test(c.criteria)) {
          result.set(i, c.points);
          break;
        }
      } else {
        // Reached next non-allocation row — no Full allocation found
        break;
      }
    }
  }
  return result;
}

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
    // Emit category header when category changes, including categoryWeight if set
    if (c.category !== undefined && c.category !== lastCategory) {
      const weightSuffix = c.categoryWeight !== undefined ? ` [${c.categoryWeight}%]` : '';
      lines.push(`## ${c.category}${weightSuffix}`);
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
/**
 * Remove duplicate criteria from a parsed array.
 * Deduplication key: category (lowercased, empty string when absent) + criteria name (lowercased).
 * First occurrence wins; subsequent duplicates are dropped.
 * This ensures that rubric text generated from multiple sources (e.g. checklist +
 * allocation sections on MOM pages, or library rubrics with repeated entries) never
 * produces duplicate rows in the UI regardless of which parser was used.
 */
function dedupCriteria(criteria: RubricCriterion[]): RubricCriterion[] {
  const seen = new Set<string>();
  return criteria.filter((c) => {
    const key = `${(c.category ?? '').toLowerCase()}|${c.criteria.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Returns true when the text looks like a checkbox rubric.
 * Detected by the presence of a tab character immediately followed by the ☐ symbol.
 */
function isCheckboxFormat(text: string): boolean {
  return /\t☐/.test(text);
}

/**
 * Returns true when the text looks like an indented-category rubric.
 *
 * Format:
 *   Category Name\t          ← line ending with a bare tab, no criteria on same line
 *    Criterion text           ← criteria lines start with a leading space or tab
 *
 * Detected by a line that consists entirely of non-whitespace text followed by
 * a trailing tab (and nothing after the tab), AND at least one subsequent line
 * that starts with whitespace.
 */
function isIndentedCategoryFormat(text: string): boolean {
  return /^[^\t\n]+\t\s*$/m.test(text) && /^[ \t]+\S/m.test(text);
}

/**
 * Parse an indented-category rubric into RubricCriterion[].
 *
 * Format:
 *   Category Name\t
 *    Criterion description one
 *    Criterion description two
 *   Next Category\t
 *    Criterion description
 *
 * - Category lines end with a trailing tab and have no content after it
 * - Criteria lines start with at least one space or tab
 * - Each criterion line becomes one RubricCriterion with points: 0
 * - Leading/trailing whitespace is stripped from both category and criteria names
 */
function parseIndentedCategoryFormat(text: string): RubricCriterion[] {
  const lines = text.split("\n");
  const results: RubricCriterion[] = [];
  let currentCategory: string | undefined = undefined;

  // Category header: non-whitespace text followed by a trailing tab (nothing after)
  const CATEGORY_HDR_RE = /^([^\t]+)\t\s*$/;
  // Criterion line: starts with at least one space or tab
  const INDENTED_RE = /^[ \t]+(\S.*\S|\S)$/;

  for (const raw of lines) {
    // Do NOT trim here — leading whitespace is how we distinguish criteria from headers
    if (!raw.trim()) continue;

    const catMatch = CATEGORY_HDR_RE.exec(raw);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      continue;
    }

    const indentMatch = INDENTED_RE.exec(raw);
    if (indentMatch) {
      const criteriaName = indentMatch[1].trim();
      if (!criteriaName) continue;
      const criterion: RubricCriterion = {
        criteria: criteriaName,
        description: "",
        points: 0,
      };
      if (currentCategory !== undefined) criterion.category = currentCategory;
      results.push(criterion);
      if (isAllocationCriterion(criterion.criteria)) {
        results[results.length - 1].rowType = 'allocation';
      }
    }
    // Non-indented, non-category lines are silently skipped
  }

  return dedupCriteria(results);
}

/**
 * Parse a checkbox-format rubric string into RubricCriterion[].
 *
 * Format:
 *   Category Name\t☐ Criterion description
 *   ☐ Another criterion in same category
 *   Next Category\t☐ First criterion of next category
 *
 * Each ☐ item becomes one criterion with points: 0.
 * The ☐ prefix (and any leading/trailing whitespace) is stripped from the name.
 */
function parseCheckboxFormat(text: string): RubricCriterion[] {
  const lines = text.split("\n");
  const results: RubricCriterion[] = [];
  let currentCategory: string | undefined = undefined;

  // Matches a tab-separated line: "Category\t☐ Criterion text"
  const TAB_LINE_RE = /^(.+?)\t☐\s*(.+)$/;
  // Matches a standalone checkbox line: "☐ Criterion text"
  const CHECKBOX_RE = /^☐\s*(.+)$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const tabMatch = TAB_LINE_RE.exec(line);
    if (tabMatch) {
      currentCategory = tabMatch[1].trim();
      const criteriaName = tabMatch[2].trim();
      if (!criteriaName) continue;
      const criterion: RubricCriterion = {
        criteria: criteriaName,
        description: "",
        points: 0,
      };
      if (currentCategory) criterion.category = currentCategory;
      results.push(criterion);
      if (isAllocationCriterion(criterion.criteria)) {
        results[results.length - 1].rowType = 'allocation';
      }
      continue;
    }

    const checkboxMatch = CHECKBOX_RE.exec(line);
    if (checkboxMatch) {
      const criteriaName = checkboxMatch[1].trim();
      if (!criteriaName) continue;
      const criterion: RubricCriterion = {
        criteria: criteriaName,
        description: "",
        points: 0,
      };
      if (currentCategory !== undefined) criterion.category = currentCategory;
      results.push(criterion);
      if (isAllocationCriterion(criterion.criteria)) {
        results[results.length - 1].rowType = 'allocation';
      }
    }
    // Lines with no ☐ and no tab-checkbox are silently skipped
  }

  return dedupCriteria(results);
}

export function textToCriteria(text: string): RubricCriterion[] {
  // Auto-detect checkbox format and delegate to the specialized parser
  if (isCheckboxFormat(text)) {
    return parseCheckboxFormat(text);
  }

  // Auto-detect indented-category format (Category\t\n  Criterion)
  if (isIndentedCategoryFormat(text)) {
    return parseIndentedCategoryFormat(text);
  }

  const lines = text.split("\n");
  const results: RubricCriterion[] = [];

  // Matches: "Some Name (10pts): Optional description"
  //      or: "Some Name (10 pts)"
  //      or: "Some Name (10pts, 25%): Optional description"  (with weight)
  //      or: "Some Name (10pts, 25%)"
  const LINE_RE =
    /^(.+?)\s*\((\d+(?:\.\d+)?)\s*pts?(?:,\s*(\d+(?:\.\d+)?)%\s*)?\)\s*(?::\s*(.*))?$/i;

  // Category header pattern: "## Category Name" or "## Category Name [N%]"
  const CATEGORY_RE = /^##\s+(.+?)(?:\s*\[(\d+(?:\.\d+)?)%\])?\s*$/;

  let currentCategory: string | undefined = undefined;
  let currentCategoryWeight: number | undefined = undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Check for category header
    const catMatch = CATEGORY_RE.exec(line);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      currentCategoryWeight = catMatch[2] !== undefined ? parseFloat(catMatch[2]) : undefined;
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

    if (currentCategoryWeight !== undefined) {
      criterion.categoryWeight = currentCategoryWeight;
    }

    results.push(criterion);
    if (isAllocationCriterion(line)) {
      results[results.length - 1].rowType = 'allocation';
    }
  }

  return dedupCriteria(results);
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

  const TOLERANCE = 0.5;

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

    if (Math.abs(sum - 100) <= TOLERANCE) {
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

  // criterion mode: ALL criteria weights across all categories sum to 100%
  const totalSum = criteria.reduce(
    (acc, c) => acc + (c.criterionWeight ?? 0),
    0
  );
  const roundedSum = Math.round(totalSum * 10) / 10;

  if (Math.abs(totalSum - 100) <= TOLERANCE) {
    return { valid: true, sum: roundedSum, errors: [] };
  }

  return {
    valid: false,
    sum: roundedSum,
    errors: [
      `Criteria weights sum to ${roundedSum}%, must be 100%`,
    ],
  };
}

/**
 * Distribute weights equally across criteria or categories.
 * Returns a new array with weight fields set (does not mutate input).
 *
 * Category mode: each unique category gets 100 / numCategories.
 * Criterion mode: each criterion gets 100 / numCriteria.
 * Rounding: last item gets the remainder so total is exactly 100.
 */
export function equalizeWeights(
  criteria: RubricCriterion[],
  mode: 'category' | 'criterion'
): RubricCriterion[] {
  if (criteria.length === 0) return criteria;

  const result = criteria.map(c => ({ ...c }));

  if (mode === 'category') {
    // Collect unique categories in order
    const cats: string[] = [];
    const seen = new Set<string>();
    for (const c of criteria) {
      const cat = c.category ?? '';
      if (!seen.has(cat)) {
        cats.push(cat);
        seen.add(cat);
      }
    }
    const numCats = cats.length;
    if (numCats === 0) return result;

    const base = Math.floor(100 / numCats * 10) / 10;  // e.g. 33.3 for 3 cats
    const remainder = Math.round((100 - base * numCats) * 10) / 10;

    const catWeights = new Map<string, number>();
    cats.forEach((cat, i) => {
      catWeights.set(cat, i === 0 ? base + remainder : base);
    });

    for (const c of result) {
      c.categoryWeight = catWeights.get(c.category ?? '') ?? 0;
    }
  } else {
    // criterion mode: equal per criterion
    const num = criteria.length;
    const base = Math.floor(100 / num * 10) / 10;
    const remainder = Math.round((100 - base * num) * 10) / 10;

    result.forEach((c, i) => {
      c.criterionWeight = i === 0 ? base + remainder : base;
    });
  }

  return result;
}

/**
 * Auto-fill weights from points proportion.
 * Returns a new array with weight fields set (does not mutate input).
 *
 * Category mode: weight proportional to total points in that category.
 * Criterion mode: weight proportional to each criterion's points.
 * Rounding: last item gets the remainder so total is exactly 100.
 */
export function autoFillWeights(
  criteria: RubricCriterion[],
  mode: 'category' | 'criterion'
): RubricCriterion[] {
  if (criteria.length === 0) return criteria;

  const result = criteria.map(c => ({ ...c }));

  if (mode === 'category') {
    // Sum points per category
    const catPoints = new Map<string, number>();
    const cats: string[] = [];
    const seen = new Set<string>();
    for (const c of criteria) {
      const cat = c.category ?? '';
      if (!seen.has(cat)) {
        cats.push(cat);
        seen.add(cat);
        catPoints.set(cat, 0);
      }
      catPoints.set(cat, (catPoints.get(cat) ?? 0) + c.points);
    }

    const totalPoints = Array.from(catPoints.values()).reduce((a, b) => a + b, 0);
    if (totalPoints === 0) return equalizeWeights(criteria, mode);

    // Distribute proportionally, rounding to 1 decimal
    let allocated = 0;
    const catWeights = new Map<string, number>();
    cats.forEach((cat, i) => {
      if (i === cats.length - 1) {
        catWeights.set(cat, Math.round((100 - allocated) * 10) / 10);
      } else {
        const w = Math.round((catPoints.get(cat)! / totalPoints) * 1000) / 10;
        catWeights.set(cat, w);
        allocated += w;
      }
    });

    for (const c of result) {
      c.categoryWeight = catWeights.get(c.category ?? '') ?? 0;
    }
  } else {
    // criterion mode: proportional to points
    const totalPoints = criteria.reduce((a, c) => a + c.points, 0);
    if (totalPoints === 0) return equalizeWeights(criteria, mode);

    let allocated = 0;
    result.forEach((c, i) => {
      if (i === result.length - 1) {
        c.criterionWeight = Math.round((100 - allocated) * 10) / 10;
      } else {
        const w = Math.round((c.points / totalPoints) * 1000) / 10;
        c.criterionWeight = w;
        allocated += w;
      }
    });
  }

  return result;
}
