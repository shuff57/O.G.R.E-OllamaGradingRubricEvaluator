import { describe, it, expect } from 'vitest';
import { buildSingleGradePrompt, buildBatchPrompt, buildOutlierReviewPrompt, generateScoringAnchors } from '../grading.js';

// NOTE: Tests for the extension's Prompts object (getRubricExtractionPrompt, etc.)
// have been removed — they belong in the extension package, not in the grading-server.
// T12 (prompt structure regression tests) will add tiered-architecture tests here
// after T9-T11 rewrite the prompt builders.

describe('Prompt Builders - Pattern Verification', () => {

  describe('buildSingleGradePrompt (server)', () => {
    const mockRubric = {
      maxScore: '10',
      essayPrompt: 'Explain photosynthesis',
      checklistItems: [
        { category: 'Understanding', points: 5, items: ['Knows process', 'Explains steps'] }
      ],
      rubricItems: [
        { category: 'Key Concepts', items: ['Chlorophyll', 'ATP production'] }
      ],
      modelText: 'Photosynthesis is the process...'
    };

    it('should contain "No markdown" instruction', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('No markdown');
    });

    it('should contain scoring scale section', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('SCORING SCALE');
    });

    it('should include maxScore from rubric', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('10');
    });

    it('should include essay prompt', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('Explain photosynthesis');
    });

    it('should include student work', () => {
      const studentWork = 'Photosynthesis is a process where plants convert light to energy';
      const prompt = buildSingleGradePrompt(mockRubric, studentWork, '');
      expect(prompt).toContain(studentWork);
    });

    it('should include checklist items when present', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('GRADING CHECKLIST');
      expect(prompt).toContain('Understanding');
    });

    it('should include rubric items when present', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('KEY CONCEPTS');
      expect(prompt).toContain('Chlorophyll');
    });

    it('should include model response when present', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('MODEL RESPONSE');
      expect(prompt).toContain('Photosynthesis is the process');
    });

    it('should include additional instructions when provided', () => {
      const instructions = 'Focus on conceptual understanding';
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', instructions);
      expect(prompt).toContain(instructions);
    });

    it('should request JSON response format', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('JSON');
    });

    it('should handle missing optional rubric fields', () => {
      const minimalRubric = {
        maxScore: '5',
        essayPrompt: 'Simple question'
      };
      const prompt = buildSingleGradePrompt(minimalRubric, 'response', '');

      expect(prompt).toContain('5');
      expect(prompt).toContain('Simple question');
      expect(typeof prompt).toBe('string');
    });

    it('should handle empty student response', () => {
      const prompt = buildSingleGradePrompt(mockRubric, '', '');
      expect(prompt).toContain('STUDENT WORK');
    });

    it('should contain response format instruction', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('RESPONSE FORMAT');
      expect(prompt).toContain('Write directly to the student');
    });
  });

});


describe('Tiered Prompt Architecture - Regression Tests (T12)', () => {
  const baseRubric = {
    maxScore: '10',
    essayPrompt: 'Explain photosynthesis',
    checklistItems: [{ category: 'Understanding', points: 5, items: ['Knows process', 'Explains steps'] }],
    rubricItems: [{ category: 'Key Concepts', items: ['Chlorophyll', 'ATP production'] }],
    modelText: 'Photosynthesis is the process...',
  };
  const mockStudents = [
    { index: 0, name: 'Alice', response: 'Plants use sunlight to make food.' },
    { index: 1, name: 'Bob', response: 'I do not know.' },
  ];
  const mockAnchors = generateScoringAnchors(baseRubric);
  const mockOutlierStudents = [
    { index: 2, name: 'Carol', response: 'Photosynthesis makes oxygen.', originalScore: 9, originalFeedback: 'Great work.' },
  ];
  const mockStats = { mean: 5, stdDev: 2, totalStudents: 10 };

  describe('buildBatchPrompt - tiered ordering', () => {
    it('format hint appears before custom instructions', () => {
      const rubric = { ...baseRubric, customInstructions: 'Be strict' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      const idxFormat = prompt.indexOf('JSON array only');
      const idxCustom = prompt.indexOf('Be strict');
      expect(idxFormat).toBeGreaterThan(-1);
      expect(idxCustom).toBeGreaterThan(idxFormat);
    });

    it('custom instructions appear before philosophy', () => {
      const rubric = { ...baseRubric, customInstructions: 'Grade very leniently' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      const idxCustom = prompt.indexOf('Grade very leniently');
      const idxPhil = prompt.indexOf('rubric criteria');
      expect(idxCustom).toBeGreaterThan(-1);
      expect(idxPhil).toBeGreaterThan(idxCustom);
    });

    it('philosophy appears before student responses', () => {
      const rubric = { ...baseRubric, customInstructions: '' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      const idxPhil = prompt.indexOf('rubric criteria');
      const idxStudents = prompt.indexOf('STUDENTS TO GRADE');
      expect(idxPhil).toBeGreaterThan(-1);
      expect(idxStudents).toBeGreaterThan(idxPhil);
    });

    it('student responses appear before format reinforcement', () => {
      const rubric = { ...baseRubric, customInstructions: '' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      const idxStudents = prompt.indexOf('STUDENTS TO GRADE');
      const idxFormatEnd = prompt.lastIndexOf('CRITICAL: Return results for ALL');
      expect(idxStudents).toBeGreaterThan(-1);
      expect(idxFormatEnd).toBeGreaterThan(idxStudents);
    });

    it('no INSTRUCTOR section when no custom instructions', () => {
      const rubric = { ...baseRubric, customInstructions: '' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      expect(prompt).not.toContain('INSTRUCTOR OVERRIDE');
    });

    it('INSTRUCTOR section present when custom instructions provided', () => {
      const rubric = { ...baseRubric, customInstructions: 'Be strict' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      expect(prompt).toContain('INSTRUCTOR OVERRIDE INSTRUCTIONS');
    });

    it('scoring scale uses unified descriptors', () => {
      const rubric = { ...baseRubric, customInstructions: '' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      expect(prompt).toContain('SCORING SCALE');
      expect(prompt).toContain('Proficient');
    });

    it('no directional language in batch prompt', () => {
      const rubric = { ...baseRubric, customInstructions: '' };
      const prompt = buildBatchPrompt(rubric, mockStudents, mockAnchors);
      expect(prompt.toLowerCase()).not.toContain('choose the higher');
      expect(prompt.toLowerCase()).not.toContain('generous');
    });
  });

  describe('buildSingleGradePrompt - tiered ordering', () => {
    it('format hint appears at prompt start', () => {
      const prompt = buildSingleGradePrompt(baseRubric, 'student work', '');
      const idxFormat = prompt.indexOf('JSON object only');
      const idxScale = prompt.indexOf('SCORING SCALE');
      expect(idxFormat).toBeGreaterThan(-1);
      expect(idxScale).toBeGreaterThan(idxFormat);
    });

    it('scoring scale appears before student work', () => {
      const prompt = buildSingleGradePrompt(baseRubric, 'my-unique-answer-xyz', '');
      const idxScale = prompt.indexOf('SCORING SCALE');
      const idxStudent = prompt.indexOf('my-unique-answer-xyz');
      expect(idxScale).toBeGreaterThan(-1);
      expect(idxStudent).toBeGreaterThan(idxScale);
    });

    it('student work appears before response format', () => {
      const prompt = buildSingleGradePrompt(baseRubric, 'unique-marker-abc', '');
      const idxStudent = prompt.indexOf('unique-marker-abc');
      const idxFormat = prompt.indexOf('RESPONSE FORMAT');
      expect(idxStudent).toBeGreaterThan(-1);
      expect(idxFormat).toBeGreaterThan(idxStudent);
    });

    it('no directional language in single grade prompt', () => {
      const prompt = buildSingleGradePrompt(baseRubric, 'student work', '');
      expect(prompt.toLowerCase()).not.toContain('choose the higher');
      expect(prompt.toLowerCase()).not.toContain('generous');
    });

    it('SCORING CALIBRATION prefix: calibration examples included', () => {
      const rubric = {
        ...baseRubric,
        customInstructions: 'SCORING CALIBRATION:\nExcellent (9/10): Perfect response\nAdequate (7/10): Solid\n\nGrade very strictly.',
      };
      const prompt = buildSingleGradePrompt(rubric, 'student work', '');
      expect(prompt).toContain('SCORING CALIBRATION EXAMPLES');
      expect(prompt).toContain('Excellent (9/10)');
    });

    it('SCORING CALIBRATION prefix: override instructions appear before calibration', () => {
      const rubric = {
        ...baseRubric,
        customInstructions: 'SCORING CALIBRATION:\nExcellent (9/10): Perfect\n\nGrade very strictly.',
      };
      const prompt = buildSingleGradePrompt(rubric, 'student work', '');
      expect(prompt).toContain('Grade very strictly');
      expect(prompt.indexOf('Grade very strictly')).toBeLessThan(prompt.indexOf('Excellent (9/10)'));
    });

    it('empty custom instructions produce no INSTRUCTOR section', () => {
      const prompt = buildSingleGradePrompt(baseRubric, 'student work', '');
      expect(prompt).not.toContain('INSTRUCTOR OVERRIDE');
    });

    it('very long custom instructions (500+ chars) are included', () => {
      const longInstructions = 'Grade carefully. '.repeat(30);
      const rubric = { ...baseRubric, customInstructions: longInstructions };
      const prompt = buildSingleGradePrompt(rubric, 'student work', '');
      expect(prompt).toContain('Grade carefully.');
      expect(prompt.length).toBeGreaterThan(500);
    });
  });

  describe('buildOutlierReviewPrompt - tiered ordering', () => {
    it('format hint present at prompt start', () => {
      const prompt = buildOutlierReviewPrompt(baseRubric, mockOutlierStudents, mockAnchors, mockStats, 10);
      expect(prompt).toContain('JSON array only');
    });

    it('custom instructions appear before philosophy', () => {
      const rubric = { ...baseRubric, customInstructions: 'Re-grade strictly' };
      const prompt = buildOutlierReviewPrompt(rubric, mockOutlierStudents, mockAnchors, mockStats, 10);
      const idxCustom = prompt.indexOf('Re-grade strictly');
      const idxPhil = prompt.indexOf('rubric criteria');
      expect(idxCustom).toBeGreaterThan(-1);
      expect(idxPhil).toBeGreaterThan(idxCustom);
    });

    it('includes student original score and name in prompt', () => {
      const prompt = buildOutlierReviewPrompt(baseRubric, mockOutlierStudents, mockAnchors, mockStats, 10);
      expect(prompt).toContain('ORIGINAL SCORE');
      expect(prompt).toContain('Carol');
    });
  });
});