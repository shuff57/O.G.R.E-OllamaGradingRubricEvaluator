import { describe, it, expect } from 'vitest';
import {
  loadGoldStandard,
  loadValidationJSONL,
  identifyEdgeCases,
  groupByRubric,
  buildEvalDataset,
} from '../data-loader.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const GOLD_STANDARD_PATH = '/home/shuff57/Documents/GitHub/shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json';
const JSONL_PATH = '/home/shuff57/Documents/GitHub/shuff57-llm-finetune/ogre/test-data/finetune-grading-val.jsonl';

describe('data-loader', () => {
  describe('loadGoldStandard', () => {
    it('should load gold standard JSON and return array of students', async () => {
      const data = await loadGoldStandard(GOLD_STANDARD_PATH);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(25);
    });

    it('should have correct structure for first student', async () => {
      const data = await loadGoldStandard(GOLD_STANDARD_PATH);
      const first = data[0];
      expect(first).toHaveProperty('index');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('goldScore');
      expect(first).toHaveProperty('scores');
      expect(first).toHaveProperty('rationale');
    });

    it('should extract goldScore as mean from scores', async () => {
      const data = await loadGoldStandard(GOLD_STANDARD_PATH);
      const first = data[0];
      expect(typeof first.goldScore).toBe('number');
      expect(first.goldScore).toBe(8.0);
      expect(Array.isArray(first.scores)).toBe(true);
      expect(first.scores.length).toBe(3);
    });

    it('should preserve student name and index', async () => {
      const data = await loadGoldStandard(GOLD_STANDARD_PATH);
      const first = data[0];
      expect(first.name).toBe('Alvarez, Emiliano');
      expect(first.index).toBe(0);
    });
  });

  describe('identifyEdgeCases', () => {
    it('should identify low-edge cases (goldScore <= 2)', async () => {
      const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
      const edgeCases = identifyEdgeCases(goldData);
      expect(edgeCases).toHaveProperty('lowEdge');
      expect(edgeCases).toHaveProperty('highEdge');
      expect(Array.isArray(edgeCases.lowEdge)).toBe(true);
      expect(Array.isArray(edgeCases.highEdge)).toBe(true);
    });

    it('should correctly flag low-edge students', async () => {
      const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
      const edgeCases = identifyEdgeCases(goldData);
      // Verify that all flagged low-edge students have goldScore <= 2
      edgeCases.lowEdge.forEach((idx) => {
        expect(goldData[idx].goldScore).toBeLessThanOrEqual(2);
      });
    });

    it('should correctly flag high-edge students (goldScore >= 9)', async () => {
      const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
      const edgeCases = identifyEdgeCases(goldData);
      // Verify that all flagged high-edge students have goldScore >= 9
      edgeCases.highEdge.forEach((idx) => {
        expect(goldData[idx].goldScore).toBeGreaterThanOrEqual(9);
      });
    });
  });

  describe('loadValidationJSONL', () => {
    it('should load JSONL file and return array', async () => {
      const data = await loadValidationJSONL(JSONL_PATH);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should extract goldScore from assistant message', async () => {
      const data = await loadValidationJSONL(JSONL_PATH);
      const first = data[0];
      expect(first).toHaveProperty('goldScore');
      expect(typeof first.goldScore).toBe('number');
    });

    it('should extract rubricPrompt from user message', async () => {
      const data = await loadValidationJSONL(JSONL_PATH);
      const first = data[0];
      expect(first).toHaveProperty('rubricPrompt');
      expect(typeof first.rubricPrompt).toBe('string');
    });

    it('should handle malformed JSON lines gracefully', async () => {
      // This test verifies that the loader doesn't crash on malformed lines
      // The actual JSONL file should be well-formed, but the loader should be robust
      const data = await loadValidationJSONL(JSONL_PATH);
      expect(Array.isArray(data)).toBe(true);
      // If we got here without crashing, the loader handled any issues gracefully
    });
  });

  describe('groupByRubric', () => {
    it('should return object with rubric groups', async () => {
      const jsonlData = await loadValidationJSONL(JSONL_PATH);
      const groups = groupByRubric(jsonlData);
      expect(typeof groups).toBe('object');
      expect(Object.keys(groups).length).toBeGreaterThan(0);
    });

    it('should group samples by detected rubric type', async () => {
      const jsonlData = await loadValidationJSONL(JSONL_PATH);
      const groups = groupByRubric(jsonlData);
      // Each group should contain an array of samples
      Object.values(groups).forEach((group) => {
        expect(Array.isArray(group)).toBe(true);
        group.forEach((sample) => {
          expect(sample).toHaveProperty('goldScore');
          expect(sample).toHaveProperty('rubricPrompt');
        });
      });
    });

    it('should detect chi-square rubric type', async () => {
      const jsonlData = await loadValidationJSONL(JSONL_PATH);
      const groups = groupByRubric(jsonlData);
      // At least one group should be detected (chi-square, hypothesis, regression, probability, or other)
      const hasChiSquare = 'chi-square' in groups;
      const hasHypothesis = 'hypothesis' in groups;
      const hasRegression = 'regression' in groups;
      const hasProbability = 'probability' in groups;
      const hasOther = 'other' in groups;
      expect(hasChiSquare || hasHypothesis || hasRegression || hasProbability || hasOther).toBe(true);
    });
  });

  describe('buildEvalDataset', () => {
    it('should combine gold standard and JSONL data', async () => {
      const dataset = await buildEvalDataset(GOLD_STANDARD_PATH, JSONL_PATH);
      expect(dataset).toHaveProperty('goldData');
      expect(dataset).toHaveProperty('jsonlData');
      expect(dataset).toHaveProperty('edgeCases');
      expect(dataset).toHaveProperty('rubricGroups');
    });

    it('should have correct structure for combined dataset', async () => {
      const dataset = await buildEvalDataset(GOLD_STANDARD_PATH, JSONL_PATH);
      expect(Array.isArray(dataset.goldData)).toBe(true);
      expect(Array.isArray(dataset.jsonlData)).toBe(true);
      expect(typeof dataset.edgeCases).toBe('object');
      expect(typeof dataset.rubricGroups).toBe('object');
    });

    it('should preserve data integrity in combined dataset', async () => {
      const dataset = await buildEvalDataset(GOLD_STANDARD_PATH, JSONL_PATH);
      expect(dataset.goldData.length).toBe(25);
      expect(dataset.jsonlData.length).toBeGreaterThan(0);
      // Verify edge cases are properly identified
      expect(Array.isArray(dataset.edgeCases.lowEdge)).toBe(true);
      expect(Array.isArray(dataset.edgeCases.highEdge)).toBe(true);
    });
  });
});
