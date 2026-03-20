import { describe, it, expect } from 'vitest';
import {
  computeMAE,
  computeWithin1Rate,
  computeUndergradePenalty,
  computeGenerosityShift,
  computeRunVariance,
  computeEdgeCaseReliability,
  computePromptConciseness,
  computeComposite,
} from '../metrics.js';

describe('computeMAE', () => {
  it('returns 0 for identical arrays', () => {
    expect(computeMAE([7, 8, 9], [7, 8, 9])).toBe(0);
  });

  it('returns 1 for uniform offset of 1', () => {
    expect(computeMAE([6, 7, 8], [7, 8, 9])).toBe(1);
  });
});

describe('computeWithin1Rate', () => {
  it('returns 1 for all within 1 point', () => {
    expect(computeWithin1Rate([7, 8, 9], [7, 8, 9])).toBe(1.0);
  });

  it('returns 2/3 when one student is off by more than 1', () => {
    expect(computeWithin1Rate([5, 8, 9], [7, 8, 9])).toBe(2 / 3);
  });
});

describe('computeUndergradePenalty', () => {
  it('applies 2x penalty to undergrading', () => {
    expect(computeUndergradePenalty([6], [8])).toBe(4);
  });

  it('applies 1x penalty to overgrading', () => {
    expect(computeUndergradePenalty([10], [8])).toBe(2);
  });

  it('sums mixed under/over penalties', () => {
    expect(computeUndergradePenalty([7, 10, 9], [8, 8, 9])).toBe(4);
  });
});

describe('computeGenerosityShift', () => {
  it('computes mean(predicted) - mean(gold) for strong students', () => {
    expect(computeGenerosityShift([9, 8, 3], [8, 7, 3], 7)).toBe(1.0);
  });

  it('returns 0 when no students meet threshold', () => {
    expect(computeGenerosityShift([4, 5], [3, 4], 7)).toBe(0);
  });
});

describe('computeRunVariance', () => {
  it('averages per-student variance across runs', () => {
    expect(computeRunVariance([[8, 7], [8, 8], [8, 9]])).toBe(0.5);
  });
});

describe('computeEdgeCaseReliability', () => {
  it('computes edge-case variance using only specified indices', () => {
    expect(computeEdgeCaseReliability([[8, 7, 6], [8, 8, 6], [8, 9, 6]], [2])).toBe(0);
  });

  it('returns 0 when edgeIndices is empty', () => {
    expect(computeEdgeCaseReliability([[8, 7], [8, 8]], [])).toBe(0);
  });
});

describe('computePromptConciseness', () => {
  it('returns 2.0 for half-length prompt', () => {
    expect(computePromptConciseness(500, 1000)).toBe(2.0);
  });

  it('returns 1.0 for equal lengths', () => {
    expect(computePromptConciseness(1000, 1000)).toBe(1.0);
  });
});

describe('computeComposite', () => {
  const baseline = {
    generosityShift: 0,
    runVariance: 1,
    edgeCaseReliability: 1,
    within1Rate: 0.5,
    promptConciseness: 1,
  };

  it('weights generosity shift most strongly by default', () => {
    const highGenerosity = {
      ...baseline,
      generosityShift: 3,
    };

    const highWithin1 = {
      ...baseline,
      within1Rate: 1,
    };

    const scoreHighGenerosity = computeComposite(highGenerosity);
    const scoreHighWithin1 = computeComposite(highWithin1);

    expect(scoreHighGenerosity).toBeGreaterThan(scoreHighWithin1);
  });

  it('accepts custom weights', () => {
    const components = {
      generosityShift: 0,
      runVariance: 0,
      edgeCaseReliability: 0,
      within1Rate: 1,
      promptConciseness: 0,
    };
    const weights = {
      generosityShift: 0,
      runVariance: 0,
      edgeCaseReliability: 0,
      within1Rate: 1,
      promptConciseness: 0,
    };

    expect(computeComposite(components, weights)).toBe(1);
  });
});
