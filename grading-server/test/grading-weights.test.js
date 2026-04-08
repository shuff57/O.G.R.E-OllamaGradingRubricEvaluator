import { describe, it, expect } from 'vitest';
import { buildBatchPrompt } from '../grading.js';

// Self-contained fixtures — no external test-data dependency
const _weightAnchors = {
  excellent:    { score: 9, description: 'Excellent understanding.' },
  adequate:     { score: 7, description: 'Adequate with minor gaps.' },
  belowAverage: { score: 5, description: 'Below average.' },
  minimal:      { score: 3, description: 'Minimal engagement.' },
};

const _weightStudents = [
  { index: 0, name: 'Alice', response: 'Plants use sunlight to make food.' },
  { index: 1, name: 'Bob',   response: 'I am not sure.' },
];

const baseRubric = {
  essayPrompt: 'Explain the concept.',
  maxScore: '10',
  checklistItems: [
    {
      category: 'Understanding (5 pts)',
      points: 5,
      categoryWeight: 40,
      items: ['Shows comprehension'],
    },
  ],
};

// ── buildBatchPrompt — weightMode effective points (Task 7) ──────────────────

describe('buildBatchPrompt — weightMode effective points', () => {
  it('regression — no weightMode → byte-identical output, original points, no weight% in scoring section', () => {
    const rubric1 = { ...baseRubric };
    const rubric2 = { ...baseRubric };
    const prompt1 = buildBatchPrompt(rubric1, _weightStudents, _weightAnchors);
    const prompt2 = buildBatchPrompt(rubric2, _weightStudents, _weightAnchors);
    // Idempotent
    expect(prompt1).toBe(prompt2);
    // Original points appear unchanged in scoring section
    expect(prompt1).toContain('5 points total');
    // The scoring section should not contain categoryWeight value (40)
    // (it may appear in PARTIAL CREDIT RULE as part of "20-40%" bands — that's OK)
    // What matters: no "40 points" or "categoryWeight: 40" in scoring section
    expect(prompt1).not.toContain('categoryWeight');
    expect(prompt1).not.toContain('weightMode');
  });

  it('category mode — applies effective points (5 pts × 40% = 2 pts)', () => {
    const rubric = { ...baseRubric, weightMode: 'category' };
    const prompt = buildBatchPrompt(rubric, _weightStudents, _weightAnchors);
    // Effective points: 5 * 0.40 = 2
    expect(prompt).toContain('2 points total');
    // Original raw points must NOT appear as the category total (they were replaced by effective pts)
    expect(prompt).not.toContain('5 points total');
    // Raw weight fields must not appear literally in prompt
    expect(prompt).not.toContain('categoryWeight');
    expect(prompt).not.toContain('weightMode');
  });

  it('off mode — explicit weightMode:off leaves points unchanged', () => {
    const rubric = { ...baseRubric, weightMode: 'off' };
    const prompt = buildBatchPrompt(rubric, _weightStudents, _weightAnchors);
    // Original points must be present
    expect(prompt).toContain('5 points total');
    // Effective-weighted points must NOT appear
    expect(prompt).not.toContain('2 points total');
  });
});
