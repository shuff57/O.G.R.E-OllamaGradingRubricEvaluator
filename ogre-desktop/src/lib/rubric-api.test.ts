/**
 * Compile-time type tests for rubric-api.ts
 * These tests verify backward compatibility and new field acceptance.
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { RubricCriterion, SavedRubric } from './rubric-api';

describe('RubricCriterion type compatibility', () => {
  it('should accept RubricCriterion WITHOUT new weight fields (backward compat)', () => {
    const criterion = {
      criteria: 'Test criterion',
      description: 'A test description',
      points: 5,
      question: 1,
    } satisfies RubricCriterion;

    expectTypeOf(criterion).toMatchTypeOf<RubricCriterion>();
  });

  it('should accept RubricCriterion WITH all new weight fields', () => {
    const criterion = {
      criteria: 'Test criterion',
      description: 'A test description',
      points: 5,
      question: 1,
      category: 'Mathematical Reasoning',
      categoryWeight: 0.4,
      criterionWeight: 0.25,
    } satisfies RubricCriterion;

    expectTypeOf(criterion).toMatchTypeOf<RubricCriterion>();
  });
});

describe('SavedRubric type compatibility', () => {
  it('should accept SavedRubric WITHOUT weightMode (backward compat)', () => {
    const rubric = {
      id: 'test-id',
      name: 'Test Rubric',
      description: 'A test rubric',
      criteria: [
        {
          criteria: 'Test criterion',
          description: 'A test description',
          points: 5,
        },
      ],
      maxScore: 10,
      tags: ['test'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } satisfies SavedRubric;

    expectTypeOf(rubric).toMatchTypeOf<SavedRubric>();
  });
});
