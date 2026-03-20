import { describe, it, expect } from 'vitest';
import { loadGoldStandard } from '../data-loader.js';
import { runEvaluation, parseScore } from '../eval-harness.js';

const GOLD_STANDARD_PATH = '/home/shuff57/Documents/GitHub/shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json';

const defaultConfig = {
  model: 'claude-sonnet-4-6',
  apiKey: 'test-key',
  runs: 1,
  maxConcurrent: 5,
  timeout: 50,
};

describe('eval-harness', () => {
  it('shows positive generosity shift when strong students get +1', async () => {
    const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
    let callIndex = 0;
    const mockProvider = async () => {
      const student = goldData[callIndex % goldData.length];
      callIndex += 1;
      const score = student.goldScore >= 7 ? Math.min(10, student.goldScore + 1) : student.goldScore;
      return JSON.stringify({ score, feedback: 'mock' });
    };

    const result = await runEvaluation({}, goldData, defaultConfig, mockProvider);
    expect(result.components.generosityShift).toBeGreaterThan(0);
  });

  it('returns run variance 0 with deterministic mock across 3 runs', async () => {
    const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
    const mockProvider = async () => JSON.stringify({ score: 8, feedback: 'stable' });

    const result = await runEvaluation({}, goldData, { ...defaultConfig, runs: 3 }, mockProvider);
    expect(result.components.runVariance).toBe(0);
  });

  it('computes composite score from component metrics', async () => {
    const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
    const mockProvider = async () => JSON.stringify({ score: 8, feedback: 'ok' });

    const result = await runEvaluation({}, goldData, defaultConfig, mockProvider);
    expect(typeof result.composite).toBe('number');
    expect(Number.isFinite(result.composite)).toBe(true);
    expect(result.composite).not.toBeNull();
  });

  it('returns perStudent array matching gold dataset length (25)', async () => {
    const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
    const mockProvider = async () => JSON.stringify({ score: 8, feedback: 'ok' });

    const result = await runEvaluation({}, goldData, defaultConfig, mockProvider);
    expect(result.perStudent).toHaveLength(goldData.length);
    expect(result.perStudent).toHaveLength(25);
  });

  it('gracefully degrades when one student repeatedly times out', async () => {
    const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);
    const targetSnippet = 'The distribution is fair because of the amount of dice rolls';
    const mockProvider = async (prompt) => {
      if (prompt.includes(targetSnippet)) {
        throw new Error('timeout');
      }
      return JSON.stringify({ score: 8, feedback: 'ok' });
    };

    const result = await runEvaluation({}, goldData, defaultConfig, mockProvider);
    const errored = result.perStudent.filter((student) => student.error);
    const graded = result.perStudent.filter((student) => !student.error && typeof student.mean === 'number');

    expect(errored.length).toBe(1);
    expect(graded.length).toBe(24);
  });

  it('parseScore extracts score from JSON response text', () => {
    const score = parseScore('{"score": 8, "feedback": "Good work"}');
    expect(score).toBe(8);
  });
});
