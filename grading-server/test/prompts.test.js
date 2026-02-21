import { describe, it, expect } from 'vitest';
import Prompts from '../../prompts.js';
import { buildSingleGradePrompt } from '../grading.js';

describe('Prompt Builders - Pattern Verification', () => {
  
  describe('getRubricExtractionPrompt', () => {
    it('should contain JSON keyword', () => {
      const prompt = Prompts.getRubricExtractionPrompt('sample rubric text');
      expect(prompt).toContain('JSON');
    });

    it('should contain EXAMPLE for few-shot learning', () => {
      const prompt = Prompts.getRubricExtractionPrompt('sample rubric text');
      expect(prompt).toContain('EXAMPLE');
    });

    it('should NOT contain markdown code fences in output', () => {
      const prompt = Prompts.getRubricExtractionPrompt('sample rubric text');
      expect(prompt).not.toContain('```json');
      expect(prompt).not.toContain('```');
    });

    it('should include the selection text', () => {
      const selection = 'Participation (5 points): Active engagement';
      const prompt = Prompts.getRubricExtractionPrompt(selection);
      expect(prompt).toContain(selection);
    });

    it('should instruct to return ONLY JSON', () => {
      const prompt = Prompts.getRubricExtractionPrompt('test');
      expect(prompt).toContain('ONLY');
    });
  });

  describe('getRubricExtractionFromImagePrompt', () => {
    it('should contain JSON keyword', () => {
      const prompt = Prompts.getRubricExtractionFromImagePrompt();
      expect(prompt).toContain('JSON');
    });

    it('should contain EXAMPLE for few-shot learning', () => {
      const prompt = Prompts.getRubricExtractionFromImagePrompt();
      expect(prompt).toContain('EXAMPLE');
    });

    it('should NOT contain markdown code fences in output', () => {
      const prompt = Prompts.getRubricExtractionFromImagePrompt();
      expect(prompt).not.toContain('```json');
      expect(prompt).not.toContain('```');
    });

    it('should mention image challenges', () => {
      const prompt = Prompts.getRubricExtractionFromImagePrompt();
      expect(prompt).toContain('IMAGE CHALLENGES');
    });

    it('should instruct to return ONLY JSON', () => {
      const prompt = Prompts.getRubricExtractionFromImagePrompt();
      expect(prompt).toContain('ONLY');
    });
  });

  describe('getGradingSystemPrompt', () => {
    it('should contain JSON keyword', () => {
      const prompt = Prompts.getGradingSystemPrompt('test rubric');
      expect(prompt).toContain('JSON');
    });

    it('should NOT contain "Do include markdown" (contradiction removed)', () => {
      const prompt = Prompts.getGradingSystemPrompt('test rubric');
      expect(prompt).not.toContain('Do include markdown');
    });

    it('should contain ONLY instruction for JSON-only output', () => {
      const prompt = Prompts.getGradingSystemPrompt('test rubric');
      expect(prompt).toContain('ONLY');
    });

    it('should include the rubric text', () => {
      const rubric = 'Custom rubric content here';
      const prompt = Prompts.getGradingSystemPrompt(rubric);
      expect(prompt).toContain(rubric);
    });

    it('should include GRADING PHILOSOPHY section', () => {
      const prompt = Prompts.getGradingSystemPrompt('test rubric');
      expect(prompt).toContain('GRADING PHILOSOPHY');
    });

    it('should request JSON structure with grading array', () => {
      const prompt = Prompts.getGradingSystemPrompt('test rubric');
      expect(prompt).toContain('grading');
      expect(prompt).toContain('criteria');
      expect(prompt).toContain('status');
    });
  });

  describe('getSolverSystemPrompt', () => {
    it('should contain tutor keyword', () => {
      const prompt = Prompts.getSolverSystemPrompt('math topic');
      expect(prompt).toContain('tutor');
    });

    it('should contain LaTeX format instruction', () => {
      const prompt = Prompts.getSolverSystemPrompt('math topic');
      expect(prompt).toContain('LaTeX');
    });

    it('should contain 4-tier structure reference', () => {
      const prompt = Prompts.getSolverSystemPrompt('math topic');
      expect(prompt).toContain('4');
      expect(prompt).toContain('First interaction');
      expect(prompt).toContain('Second interaction');
      expect(prompt).toContain('Third interaction');
      expect(prompt).toContain('Fourth interaction');
    });

    it('should include the topic/context', () => {
      const topic = 'quadratic equations';
      const prompt = Prompts.getSolverSystemPrompt(topic);
      expect(prompt).toContain(topic);
    });

    it('should mention step-by-step guidance', () => {
      const prompt = Prompts.getSolverSystemPrompt('math topic');
      expect(prompt).toContain('step-by-step');
    });
  });

  describe('getRubricGenerationPrompt', () => {
    it('should contain JSON keyword', () => {
      const prompt = Prompts.getRubricGenerationPrompt('content', 10);
      expect(prompt).toContain('JSON');
    });

    it('should interpolate maxScore into prompt', () => {
      const maxScore = 10;
      const prompt = Prompts.getRubricGenerationPrompt('content', maxScore);
      expect(prompt).toContain(String(maxScore));
    });

    it('should NOT contain markdown code fences in output', () => {
      const prompt = Prompts.getRubricGenerationPrompt('content', 10);
      expect(prompt).not.toContain('```json');
      expect(prompt).not.toContain('```');
    });

    it('should include the assignment content', () => {
      const content = 'Write an essay about climate change';
      const prompt = Prompts.getRubricGenerationPrompt(content, 10);
      expect(prompt).toContain(content);
    });

    it('should mention high school seniors', () => {
      const prompt = Prompts.getRubricGenerationPrompt('content', 10);
      expect(prompt).toContain('high school seniors');
    });

    it('should instruct to return ONLY JSON', () => {
      const prompt = Prompts.getRubricGenerationPrompt('content', 10);
      expect(prompt).toContain('ONLY');
    });

    it('should handle different maxScore values', () => {
      const prompt15 = Prompts.getRubricGenerationPrompt('content', 15);
      const prompt25 = Prompts.getRubricGenerationPrompt('content', 25);
      
      expect(prompt15).toContain('15');
      expect(prompt25).toContain('25');
    });
  });

  describe('getBatchGradingSystemPrompt', () => {
    it('should contain high school seniors grading philosophy', () => {
      const prompt = Prompts.getBatchGradingSystemPrompt('rubric', 10, '');
      expect(prompt).toContain('high school seniors');
    });

    it('should interpolate maxScore into prompt', () => {
      const maxScore = 10;
      const prompt = Prompts.getBatchGradingSystemPrompt('rubric', maxScore, '');
      expect(prompt).toContain(String(maxScore));
    });

    it('should include the rubric text', () => {
      const rubric = 'Custom rubric for grading';
      const prompt = Prompts.getBatchGradingSystemPrompt(rubric, 10, '');
      expect(prompt).toContain(rubric);
    });

    it('should include GRADING PHILOSOPHY section', () => {
      const prompt = Prompts.getBatchGradingSystemPrompt('rubric', 10, '');
      expect(prompt).toContain('GRADING PHILOSOPHY');
    });

    it('should request JSON structure with score and feedback', () => {
      const prompt = Prompts.getBatchGradingSystemPrompt('rubric', 10, '');
      expect(prompt).toContain('score');
      expect(prompt).toContain('feedback');
    });

    it('should append custom instructions when provided', () => {
      const customInstructions = 'Be lenient with partial credit';
      const prompt = Prompts.getBatchGradingSystemPrompt('rubric', 10, customInstructions);
      expect(prompt).toContain(customInstructions);
      expect(prompt).toContain('CUSTOM INSTRUCTIONS');
    });

    it('should NOT include custom instructions section when empty', () => {
      const prompt = Prompts.getBatchGradingSystemPrompt('rubric', 10, '');
      expect(prompt).not.toContain('CUSTOM INSTRUCTIONS');
    });

    it('should handle different maxScore values', () => {
      const prompt20 = Prompts.getBatchGradingSystemPrompt('rubric', 20, '');
      const prompt50 = Prompts.getBatchGradingSystemPrompt('rubric', 50, '');
      
      expect(prompt20).toContain('20');
      expect(prompt50).toContain('50');
    });
  });

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

    it('should contain half-point instruction (7.5)', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('7.5');
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
      expect(prompt).toContain('ADDITIONAL INSTRUCTIONS');
      expect(prompt).toContain(instructions);
    });

    it('should request JSON response format', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('RESPONSE FORMAT');
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

    it('should include LaTeX notation support in feedback', () => {
      const prompt = buildSingleGradePrompt(mockRubric, 'student response', '');
      expect(prompt).toContain('LaTeX');
      expect(prompt).toContain('\\\\(');
    });
  });

  describe('Prompt Consistency Across Builders', () => {
    it('all extraction prompts should instruct JSON-only output', () => {
      const textExtraction = Prompts.getRubricExtractionPrompt('test');
      const imageExtraction = Prompts.getRubricExtractionFromImagePrompt();
      
      expect(textExtraction).toContain('ONLY');
      expect(imageExtraction).toContain('ONLY');
    });

    it('all grading prompts should include GRADING PHILOSOPHY', () => {
      const singleGrade = Prompts.getGradingSystemPrompt('rubric');
      const batchGrade = Prompts.getBatchGradingSystemPrompt('rubric', 10, '');
      
      expect(singleGrade).toContain('GRADING PHILOSOPHY');
      expect(batchGrade).toContain('GRADING PHILOSOPHY');
    });

    it('generation and extraction prompts should both avoid markdown fences', () => {
      const extraction = Prompts.getRubricExtractionPrompt('test');
      const generation = Prompts.getRubricGenerationPrompt('test', 10);
      
      expect(extraction).not.toContain('```');
      expect(generation).not.toContain('```');
    });
  });
});
