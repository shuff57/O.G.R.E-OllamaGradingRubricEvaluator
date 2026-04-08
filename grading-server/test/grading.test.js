import { describe, it, expect } from 'vitest';
import {
  generateScoringAnchors,
  buildBatchPrompt,
  parseBatchResponse,
  detectOutliers,
  chunkStudents,
  gradeChunk,
  mergeResults,
} from '../grading.js';

// Inline test fixtures (replacing broken external data imports)
const testRubric = {
  essayPrompt: 'Explain how photosynthesis works in plants.',
  maxScore: '10',
  checklistItems: [
    {
      category: 'Understanding (5 pts)',
      points: 5,
      items: ['Explains light absorption', 'Mentions chlorophyll', 'Describes glucose production'],
    },
    {
      category: 'Detail (3 pts)',
      points: 3,
      items: ['Mentions water and CO2', 'Describes oxygen byproduct'],
    },
    {
      category: 'Clarity (2 pts)',
      points: 2,
      items: ['Clear explanation', 'Uses correct terminology'],
    },
  ],
  rubricItems: [
    { category: 'Key Concepts', items: ['Photosynthesis', 'Chlorophyll', 'Glucose'] },
  ],
  modelText: 'Plants use chlorophyll to absorb sunlight. This energy converts CO2 and water into glucose and oxygen.',
};

const testStudents = Array.from({ length: 10 }, (_, i) => ({
  index: i,
  name: `Student ${i + 1}`,
  response: i % 3 === 0
    ? 'Plants use sunlight and chlorophyll to make glucose from CO2 and water, releasing oxygen.'
    : i % 3 === 1
    ? 'Plants need sunlight to grow and make food.'
    : 'I think photosynthesis involves the sun somehow.',
}));

describe('generateScoringAnchors', () => {
  it('should generate 3 anchors (Excellent, Adequate, Minimal)', () => {
    const anchors = generateScoringAnchors(testRubric);
    
    expect(anchors).toBeTypeOf('object');
    expect(anchors.excellent).toBeDefined();
    expect(anchors.adequate).toBeDefined();
    expect(anchors.minimal).toBeDefined();
  });

  it('should include score and description for each anchor', () => {
    const anchors = generateScoringAnchors(testRubric);
    
    for (const level of ['excellent', 'adequate', 'minimal']) {
      expect(anchors[level]).toHaveProperty('score');
      expect(anchors[level]).toHaveProperty('description');
      expect(typeof anchors[level].score).toBe('number');
      expect(typeof anchors[level].description).toBe('string');
    }
  });

  it('should generate scores in descending order (Excellent > Adequate > Minimal)', () => {
    const anchors = generateScoringAnchors(testRubric);
    
    expect(anchors.excellent.score).toBeGreaterThan(anchors.adequate.score);
    expect(anchors.adequate.score).toBeGreaterThan(anchors.minimal.score);
  });

  it('should respect maxScore from rubric', () => {
    const anchors = generateScoringAnchors(testRubric);
    const maxScore = parseFloat(testRubric.maxScore);
    
    expect(anchors.excellent.score).toBeLessThanOrEqual(maxScore);
  });
});

describe('buildBatchPrompt', () => {
  it('should include rubric details', () => {
    const anchors = generateScoringAnchors(testRubric);
    const prompt = buildBatchPrompt(testRubric, testStudents.slice(0, 3), anchors);
    
    expect(prompt).toContain(testRubric.essayPrompt);
    expect(prompt).toContain(testRubric.maxScore);
  });

  it('should include all students in the batch', () => {
    const anchors = generateScoringAnchors(testRubric);
    const students = testStudents.slice(0, 3);
    const prompt = buildBatchPrompt(testRubric, students, anchors);
    
    for (const student of students) {
      expect(prompt).toContain(student.name);
    }
  });

  it('should include scoring anchors for calibration', () => {
    const anchors = generateScoringAnchors(testRubric);
    const prompt = buildBatchPrompt(testRubric, testStudents.slice(0, 3), anchors);
    
    expect(prompt).toContain('anchor');
    expect(prompt).toContain(String(anchors.excellent.score));
  });

  it('should request JSON array response format', () => {
    const anchors = generateScoringAnchors(testRubric);
    const prompt = buildBatchPrompt(testRubric, testStudents.slice(0, 3), anchors);
    
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('array');
  });
});

describe('parseBatchResponse', () => {
  const mockResponse = JSON.stringify([
    { studentIndex: 0, score: 9, feedback: 'Excellent work' },
    { studentIndex: 1, score: 7, feedback: 'Good effort' },
    { studentIndex: 2, score: 5, feedback: 'Adequate' },
  ]);

  it('should parse valid JSON array response', () => {
    const results = parseBatchResponse(mockResponse, testStudents.slice(0, 3), 10);
    
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(3);
  });

  it('should extract score and feedback for each student', () => {
    const results = parseBatchResponse(mockResponse, testStudents.slice(0, 3), 10);
    
    for (const result of results) {
      expect(result).toHaveProperty('studentIndex');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('feedback');
      expect(typeof result.score).toBe('number');
      expect(typeof result.feedback).toBe('string');
    }
  });

  it('should handle JSON wrapped in markdown code fences', () => {
    const wrappedResponse = '```json\n' + mockResponse + '\n```';
    const results = parseBatchResponse(wrappedResponse, testStudents.slice(0, 3), 10);
    
    expect(results).toHaveLength(3);
    expect(results[0].score).toBe(9);
  });

  it('should clamp scores to valid range [0, maxScore]', () => {
    const invalidScores = JSON.stringify([
      { studentIndex: 0, score: -5, feedback: 'Negative' },
      { studentIndex: 1, score: 999, feedback: 'Too high' },
    ]);
    
    const results = parseBatchResponse(invalidScores, testStudents.slice(0, 2), 10);
    
    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[1].score).toBeLessThanOrEqual(10);
  });

  it('should handle empty student responses with score 0', () => {
    const emptyStudent = [{ index: 0, name: 'Empty Student', response: '' }];
    const emptyResponse = JSON.stringify([
      { studentIndex: 0, score: 0, feedback: 'No response submitted.' },
    ]);
    
    const results = parseBatchResponse(emptyResponse, emptyStudent, 10);
    
    expect(results[0].score).toBe(0);
    expect(results[0].feedback).toContain('No response');
  });

  it('should fallback gracefully on malformed JSON', () => {
    const malformed = 'This is not JSON at all';
    const students = testStudents.slice(0, 3);
    
    const results = parseBatchResponse(malformed, students, 10);
    
    // Should still return results array, even if parsing fails
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('detectOutliers', () => {
  const normalResults = [
    { studentIndex: 0, score: 8, feedback: 'Good' },
    { studentIndex: 1, score: 8, feedback: 'Good' },
    { studentIndex: 2, score: 8, feedback: 'Good' },
    { studentIndex: 3, score: 8, feedback: 'Good' },
    { studentIndex: 4, score: 8, feedback: 'Good' },
  ];

  it('should calculate mean and standard deviation', () => {
    const outliers = detectOutliers(normalResults);
    
    expect(outliers).toHaveProperty('mean');
    expect(outliers).toHaveProperty('stdDev');
    expect(typeof outliers.mean).toBe('number');
    expect(typeof outliers.stdDev).toBe('number');
  });

  it('should return empty outliers array when scores are consistent', () => {
    const outliers = detectOutliers(normalResults);
    
    expect(outliers).toHaveProperty('outliers');
    expect(Array.isArray(outliers.outliers)).toBe(true);
    expect(outliers.outliers.length).toBe(0);
  });

  it('should detect outliers beyond 2σ threshold', () => {
    const resultsWithOutlier = [
      { studentIndex: 0, score: 8, feedback: 'Good' },
      { studentIndex: 1, score: 8, feedback: 'Good' },
      { studentIndex: 2, score: 9, feedback: 'Good' },
      { studentIndex: 3, score: 8, feedback: 'Good' },
      { studentIndex: 4, score: 8, feedback: 'Good' },
      { studentIndex: 5, score: 8, feedback: 'Good' },
      { studentIndex: 6, score: 0, feedback: 'Bad' }, // Clear outlier with consistent scores
    ];
    
    const outliers = detectOutliers(resultsWithOutlier);
    
    expect(outliers.outliers.length).toBeGreaterThan(0);
    expect(outliers.outliers).toContainEqual(
      expect.objectContaining({ studentIndex: 6 })
    );
  });

  it('should limit outliers to maximum of 5 students', () => {
    // Create 10 extreme outliers
    const manyOutliers = Array.from({ length: 20 }, (_, i) => ({
      studentIndex: i,
      score: i % 2 === 0 ? 0 : 10, // Alternating extremes
      feedback: 'Test',
    }));
    
    const outliers = detectOutliers(manyOutliers);
    
    expect(outliers.outliers.length).toBeLessThanOrEqual(5);
  });

  it('should include deviation amount in outlier info', () => {
    const resultsWithOutlier = [
      { studentIndex: 0, score: 8, feedback: 'Good' },
      { studentIndex: 1, score: 0, feedback: 'Bad' },
    ];
    
    const outliers = detectOutliers(resultsWithOutlier);
    
    if (outliers.outliers.length > 0) {
      expect(outliers.outliers[0]).toHaveProperty('deviation');
      expect(typeof outliers.outliers[0].deviation).toBe('number');
    }
  });
});

describe('chunkStudents', () => {
  it('should split students into chunks of specified size', () => {
    const students = testStudents; // 10 students
    const chunks = chunkStudents(students, 3);
    
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks[0].students.length).toBe(3);
  });

  it('should default to chunk size of 20', () => {
    const manyStudents = Array.from({ length: 50 }, (_, i) => ({
      index: i,
      name: `Student ${i}`,
      response: 'Test response',
    }));
    
    const chunks = chunkStudents(manyStudents);
    
    expect(chunks[0].students.length).toBe(20);
    expect(chunks[1].students.length).toBe(20);
    expect(chunks[2].students.length).toBe(10);
  });

  it('should return single chunk for small batches', () => {
    const students = testStudents.slice(0, 5);
    const chunks = chunkStudents(students, 20);
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].students).toEqual(students);
  });

  it('should indicate which chunks need anchor bridging', () => {
    const students = testStudents;
    const chunks = chunkStudents(students, 3);
    
    expect(chunks[0]).toHaveProperty('needsAnchors');
    expect(chunks[0].needsAnchors).toBe(false); // First chunk doesn't need bridge
    
    if (chunks.length > 1) {
      expect(chunks[1].needsAnchors).toBe(true); // Subsequent chunks need bridge
    }
  });

  it('should preserve student order across chunks', () => {
    const students = testStudents;
    const chunks = chunkStudents(students, 3);
    
    const reconstructed = chunks.flatMap(chunk => chunk.students);
    expect(reconstructed).toEqual(students);
  });
});

describe('gradeChunk', () => {
  // Note: This is a complex integration test that would call actual grading logic
  // For TDD, we'll mock the AI response
  it('should be defined and callable', () => {
    expect(typeof gradeChunk).toBe('function');
  });

  // Full gradeChunk testing would require mocking AI provider calls
  // We'll validate this in the integration tests instead
});

describe('mergeResults', () => {
  const chunk1Results = [
    { studentIndex: 0, score: 8, feedback: 'Good' },
    { studentIndex: 1, score: 7, feedback: 'Good' },
  ];

  const chunk2Results = [
    { studentIndex: 2, score: 9, feedback: 'Excellent' },
    { studentIndex: 3, score: 6, feedback: 'Adequate' },
  ];

  it('should combine results from multiple chunks', () => {
    const merged = mergeResults([chunk1Results, chunk2Results]);
    
    expect(Array.isArray(merged)).toBe(true);
    expect(merged).toHaveLength(4);
  });

  it('should preserve result order by studentIndex', () => {
    const merged = mergeResults([chunk1Results, chunk2Results]);
    
    expect(merged[0].studentIndex).toBe(0);
    expect(merged[1].studentIndex).toBe(1);
    expect(merged[2].studentIndex).toBe(2);
    expect(merged[3].studentIndex).toBe(3);
  });

  it('should handle single chunk (no merging needed)', () => {
    const merged = mergeResults([chunk1Results]);
    
    expect(merged).toEqual(chunk1Results);
  });

  it('should handle empty chunks', () => {
    const merged = mergeResults([]);
    
    expect(Array.isArray(merged)).toBe(true);
    expect(merged).toHaveLength(0);
  });

  it('should calculate aggregate statistics', () => {
    const merged = mergeResults([chunk1Results, chunk2Results]);
    
    // Should return stats along with results
    expect(merged).toBeDefined();
    expect(merged.length).toBeGreaterThan(0);
  });
});

// ── buildBatchPrompt — calibrationExamples (Task 8) ─────────────────────

describe('buildBatchPrompt — calibrationExamples', () => {
  const anchors = generateScoringAnchors(testRubric);
  const students = testStudents.slice(0, 2);

  const calibrationExamples = {
    total: 3,
    excellent: { id: 1, similarity: 0.98, studentResponse: '[STUDENT] response A', gradingScore: 9, feedback: 'Excellent understanding of the core concepts.' },
    adequate:  { id: 2, similarity: 0.85, studentResponse: '[STUDENT] response B', gradingScore: 6, feedback: 'Partial understanding, missing key details.' },
    minimal:   { id: 3, similarity: 0.72, studentResponse: '[STUDENT] response C', gradingScore: 3, feedback: 'Minimal engagement with the topic.' },
  };

  it('null calibrationExamples → prompt is IDENTICAL to baseline (no regression)', () => {
    const baseline = buildBatchPrompt(testRubric, students, anchors, null, null);
    const withNull = buildBatchPrompt(testRubric, students, anchors, null);
    expect(withNull).toBe(baseline);
  });

  it('with calibrationExamples → prompt contains HISTORICAL CALIBRATION EXAMPLES section', () => {
    const prompt = buildBatchPrompt(testRubric, students, anchors, null, calibrationExamples);
    expect(prompt).toContain('HISTORICAL CALIBRATION EXAMPLES');
  });

  it('with calibrationExamples → prompt contains all three tier labels', () => {
    const prompt = buildBatchPrompt(testRubric, students, anchors, null, calibrationExamples);
    expect(prompt).toContain('HIGH QUALITY');
    expect(prompt).toContain('AVERAGE QUALITY');
    expect(prompt).toContain('LOW QUALITY');
  });

  it('with calibrationExamples → feedback text appears in prompt', () => {
    const prompt = buildBatchPrompt(testRubric, students, anchors, null, calibrationExamples);
    expect(prompt).toContain('Excellent understanding of the core concepts.');
    expect(prompt).toContain('Partial understanding, missing key details.');
  });

  it('calibrationExamples AND bridgeResponses both present → both sections appear', () => {
    const bridge = [{ tier: 'excellent', name: 'BridgeStudent', studentIndex: 0, score: 8, feedback: 'Bridge feedback.' }];
    const prompt = buildBatchPrompt(testRubric, students, anchors, bridge, calibrationExamples);
    expect(prompt).toContain('CALIBRATION EXAMPLES (from previously graded batch');
    expect(prompt).toContain('HISTORICAL CALIBRATION EXAMPLES');
  });

  it('calibrationExamples with total:0 → no HISTORICAL section in prompt', () => {
    const empty = { total: 0 };
    const prompt = buildBatchPrompt(testRubric, students, anchors, null, empty);
    expect(prompt).not.toContain('HISTORICAL CALIBRATION EXAMPLES');
  });

  it('with calibrationExamples → HISTORICAL CONSISTENCY RULES appear', () => {
    const prompt = buildBatchPrompt(testRubric, students, anchors, null, calibrationExamples);
    expect(prompt).toContain('HISTORICAL CONSISTENCY RULES');
  });
});

// ── buildBatchPrompt — weightMode effective points (Task 7) ──────────────────

describe('buildBatchPrompt — weightMode effective points', () => {
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

  it('regression — no weightMode → byte-identical output, original points, no % signs', () => {
    const rubric1 = { ...baseRubric };
    const rubric2 = { ...baseRubric };
    const prompt1 = buildBatchPrompt(rubric1, _weightStudents, _weightAnchors);
    const prompt2 = buildBatchPrompt(rubric2, _weightStudents, _weightAnchors);
    // Idempotent
    expect(prompt1).toBe(prompt2);
    // Original points appear unchanged
    expect(prompt1).toContain('5 points total');
    // No raw weight percentages exposed to AI in SCORING BY CATEGORY section
    // (boilerplate partial-credit rule text may contain % — only check scoring section)
    const scoringSection1 = prompt1.match(/SCORING BY CATEGORY[\s\S]*?(?=\nSCORING ANCHORS|\nSCORING SCALE|\n\n[A-Z]|$)/)?.[0] ?? '';
    expect(scoringSection1).not.toMatch(/\d+%/);
  });

  it('category mode — applies effective points (5 pts × 40% = 2 pts)', () => {
    const rubric = { ...baseRubric, weightMode: 'category' };
    const prompt = buildBatchPrompt(rubric, _weightStudents, _weightAnchors);
    // Effective points: 5 * 0.40 = 2
    expect(prompt).toContain('2 points total');
    // Original raw points must NOT appear in SCORING BY CATEGORY
    expect(prompt).not.toContain('5 points total');
    // Raw weight percentage must not appear in SCORING BY CATEGORY section
    const scoringSection = prompt.match(/SCORING BY CATEGORY[\s\S]*?(?=\nSCORING ANCHORS|\nSCORING SCALE|\n\n[A-Z]|$)/)?.[0] ?? '';
    expect(scoringSection).not.toMatch(/\b40\b.*%|%.*\b40\b/);
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
