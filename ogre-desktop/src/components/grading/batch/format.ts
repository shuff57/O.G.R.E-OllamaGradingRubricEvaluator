/**
 * Shared formatting utilities for batch grading sub-components.
 * Pure functions extracted from the original BatchPanel.
 */
import type { Rubric, RubricItem, VersionGroup } from '../../../lib/batch-grader';
import type { RubricCriterion } from '../../../lib/rubric-api';
import { criteriaToText } from '../../../lib/rubric-utils';

/**
 * Regex to match a point suffix in a MOM rubric category name.
 * Examples: "Statistical Decision(4 pts)", "Conclusion in Context(3pts)"
 */
const POINT_SUFFIX_RE = /\((\d+(?:\.\d+)?)\s*pts?\)/i;

/**
 * Convert a RubricItem array into RubricCriterion[] for use with criteriaToText().
 * Each item in each category becomes one criterion with points: 0.
 *
 * @param items - The rubric rows to convert (should be short-label rows, already deduped)
 * @param rowType - Optional rowType to attach to each criterion
 * @param categoryWeightMap - Optional map of category base-name → percentage weight (0-100).
 *   When provided, sets `categoryWeight` on each criterion so that validateWeights() passes.
 */
function rubricItemsToCriteria(
  items: RubricItem[],
  rowType?: RubricCriterion['rowType'],
  categoryWeightMap?: Map<string, number>,
): RubricCriterion[] {
  const criteria: RubricCriterion[] = [];
  for (const item of items) {
    const category = item.category?.trim() || undefined;
    const categoryWeight = category && categoryWeightMap ? categoryWeightMap.get(category) : undefined;
    for (const sub of item.items) {
      const trimmed = sub.trim();
      if (!trimmed) continue;
      criteria.push({
        criteria: trimmed,
        description: '',
        points: 0,
        ...(category ? { category } : {}),
        ...(categoryWeight !== undefined ? { categoryWeight } : {}),
        ...(rowType ? { rowType } : {}),
      });
    }
  }
  return criteria;
}

/**
 * Format rubric for the review textarea.
 *
 * On MyOpenMath pages, `rubricItems` contains TWO logical sections in one <details> block:
 *   1. Short-label rows — category names WITHOUT a point suffix, items are plain sentences ← USE THESE
 *   2. Detailed rows   — category names WITH "(N pts)" suffix, items are "Target: ..." AI detail
 *
 * We want the short-label rows for the teacher-facing RubricCard. They have clean names and
 * no AI noise. Deduplicate items within each row (DOM sometimes emits each item twice).
 *
 * Falls back to all rubricItems (deduped) if no short-label rows exist, then to checklistItems.
 */
export function formatRubricForDisplay(rubric: Rubric, _allVersions?: VersionGroup[]): string {
  let sourceItems = rubric.checklistItems;
  let rowType: RubricCriterion['rowType'] = 'checklist';

  let categoryWeightMap: Map<string, number> | undefined;

  if (rubric.rubricItems && rubric.rubricItems.length > 0) {
    // Prefer short-label rows (no point suffix) — these are the clean teacher-facing rows
    const shortRows = rubric.rubricItems.filter(item =>
      !POINT_SUFFIX_RE.test(item.category)
    );

    const base = shortRows.length > 0 ? shortRows : rubric.rubricItems;

    // Deduplicate items within each row (MOM DOM sometimes emits each <li> twice)
    sourceItems = base.map(item => ({
      ...item,
      items: Array.from(new Set(item.items.map(s => s.trim()).filter(Boolean))),
    }));

    rowType = 'allocation';

    // Build a map of base-name → raw points from the detailed rows (e.g. "Statistical Decision(4 pts)" → 4)
    // Then convert raw points to percentage weights so validateWeights() is satisfied.
    if (shortRows.length > 0) {
      const rawPointMap = new Map<string, number>();
      for (const item of rubric.rubricItems) {
        const match = item.category?.match(POINT_SUFFIX_RE);
        if (match) {
          const baseName = item.category.replace(POINT_SUFFIX_RE, '').trim();
          // Use the first occurrence of each base name
          if (!rawPointMap.has(baseName)) {
            rawPointMap.set(baseName, parseFloat(match[1]));
          }
        }
      }

      if (rawPointMap.size > 0) {
        const totalPoints = Array.from(rawPointMap.values()).reduce((a, b) => a + b, 0);
        if (totalPoints > 0) {
          // Convert raw points to % weights that sum to 100
          categoryWeightMap = new Map<string, number>();
          const entries = Array.from(rawPointMap.entries());
          let assignedSoFar = 0;
          entries.forEach(([name, pts], idx) => {
            let pct: number;
            if (idx === entries.length - 1) {
              // Last category gets the remainder to guarantee sum = 100
              pct = Math.round((100 - assignedSoFar) * 10) / 10;
            } else {
              pct = Math.round((pts / totalPoints) * 1000) / 10; // one decimal place
            }
            categoryWeightMap!.set(name, pct);
            assignedSoFar += pct;
          });
        }
      }
    }
  }

  const criteria: RubricCriterion[] = rubricItemsToCriteria(sourceItems, rowType, categoryWeightMap);

  if (criteria.length === 0) {
    return '(No rubric data found on page)';
  }

  let text = criteriaToText(criteria);

  // Append model response for human readability; already stored in extractedRubric.modelText
  if (rubric.modelText) {
    text += '\n\n--- Model Response ---\n' + rubric.modelText;
  }

  return text;
}

/**
 * Converts anchor text from real-scale (e.g. /12) to virtual-10 scale before
 * injecting into the grading prompt. The server always grades on virtualMax=10
 * internally, so customInstructions anchors must match that scale.
 */
export function normalizeAnchorTextToVirtual10(text: string, realMaxScore: string): string {
  const realMax = parseFloat(realMaxScore) || 10;
  if (Math.abs(realMax - 10) < 0.001) return text;
  return text.replace(/\((\d+\.?\d*)\/(\d+\.?\d*)\):/g, (_m, sStr, mStr) => {
    const s = parseFloat(sStr);
    const m = parseFloat(mStr);
    if (!isNaN(s) && !isNaN(m) && Math.abs(m - realMax) < 0.5) {
      const v10 = Math.round(s * 10 / realMax * 10) / 10;
      return `(${v10}/10):`;
    }
    return _m;
  });
}
