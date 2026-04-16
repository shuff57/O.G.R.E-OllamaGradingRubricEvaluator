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
 */
function rubricItemsToCriteria(items: RubricItem[], rowType?: RubricCriterion['rowType']): RubricCriterion[] {
  const criteria: RubricCriterion[] = [];
  for (const item of items) {
    const category = item.category?.trim() || undefined;
    for (const sub of item.items) {
      const trimmed = sub.trim();
      if (!trimmed) continue;
      criteria.push({ criteria: trimmed, description: '', points: 0, ...(category ? { category } : {}), ...(rowType ? { rowType } : {}) });
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
  }

  const criteria: RubricCriterion[] = rubricItemsToCriteria(sourceItems, rowType);

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
