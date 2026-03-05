/**
 * Shared formatting utilities for batch grading sub-components.
 * Pure functions extracted from the original BatchPanel.
 */
import type { Rubric, VersionGroup } from '../../../lib/batch-grader';

/**
 * Format rubric for the review textarea.
 *
 * - If a grading checklist or rubric targets exist, hide the question/prompt
 *   (the prompt is already visible on the grading page itself).
 * - If multi-version, show all version prompts above the shared rubric.
 * - If NO checklist/rubric exists, show the prompt as fallback content.
 */
export function formatRubricForDisplay(rubric: Rubric, allVersions?: VersionGroup[]): string {
  const lines: string[] = [];
  const isMultiVersion = allVersions && allVersions.length > 1;

  if (isMultiVersion) {
    for (const group of allVersions) {
      lines.push(`--- Version ${group.versionNumber} Prompt ---`);
      lines.push(group.essayPrompt || '(no prompt)');
      lines.push('');
    }
  } else if (rubric.essayPrompt) {
    lines.push('--- Question/Prompt ---');
    lines.push(rubric.essayPrompt);
    lines.push('');
  }

  if (rubric.checklistItems.length > 0) {
    lines.push('--- Grading Checklist ---');
    for (const item of rubric.checklistItems) {
      if (item.category) lines.push(`[${item.category}]`);
      for (const sub of item.items) lines.push(`  - ${sub}`);
    }
    lines.push('');
  }
  if (rubric.rubricItems.length > 0) {
    lines.push('--- Rubric Targets ---');
    for (const item of rubric.rubricItems) {
      if (item.category) lines.push(`[${item.category}]`);
      for (const sub of item.items) lines.push(`  - ${sub}`);
    }
    lines.push('');
  }
  if (rubric.modelText) {
    lines.push('--- Model Response ---');
    lines.push(rubric.modelText);
  }
  return lines.join('\n').trim() || '(No rubric data found on page)';
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
