/**
 * Shared formatting utilities for batch grading sub-components.
 * Pure functions extracted from the original BatchPanel.
 */
import type { Rubric, RubricItem, VersionGroup } from '../../../lib/batch-grader';
import type { RubricCriterion } from '../../../lib/rubric-api';
import { criteriaToText } from '../../../lib/rubric-utils';

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
 * Emits criteriaToText()-compatible output so that RubricCard's textToCriteria()
 * can parse it back into table rows. Format:
 *
 *   ## Category Name
 *   Criterion description (0pts)
 *   ...
 *
 * The --- Model Response --- block is appended after the criteria block so it
 * is preserved for human review (it is also stored in extractedRubric.modelText).
 *
 * If NO checklist/rubric criteria exist, falls back to a plain-text message.
 */
export function formatRubricForDisplay(rubric: Rubric, _allVersions?: VersionGroup[]): string {
  // Merge checklist and rubric target items into a single flat criteria list.
  // Checklist items come first, then rubric targets.
  const criteria: RubricCriterion[] = [
    ...rubricItemsToCriteria(rubric.checklistItems, 'checklist'),
    ...rubricItemsToCriteria(rubric.rubricItems, 'allocation'),
  ];

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
