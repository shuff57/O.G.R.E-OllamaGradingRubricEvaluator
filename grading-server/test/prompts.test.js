import { describe, it, expect } from 'vitest';
import { buildSingleGradePrompt } from '../grading.js';

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
