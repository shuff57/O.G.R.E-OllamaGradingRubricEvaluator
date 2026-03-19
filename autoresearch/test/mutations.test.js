import { describe, it, expect } from 'vitest'
import {
  MUTATION_TYPES,
  createMutationLog,
  appendMutation,
  hasSimilarMutation,
  getMutationHistory,
  validateMutatedConstants,
} from '../mutations.js'

describe('MUTATION_TYPES', () => {
  it('exposes REPHRASE_BULLET constant', () => {
    expect(MUTATION_TYPES.REPHRASE_BULLET).toBe('REPHRASE_BULLET')
  })
})

describe('mutation log operations', () => {
  it('createMutationLog returns an empty array', () => {
    expect(createMutationLog()).toEqual([])
  })

  it('appendMutation appends entry and defaults timestamp', () => {
    const log = createMutationLog()
    const next = appendMutation(log, {
      type: MUTATION_TYPES.ADD_BULLET,
      target: { bulletIndex: 1 },
      description: 'add one bullet',
      result: 'applied',
      metricDelta: { score: 0.2 },
    })

    expect(log).toEqual([])
    expect(next).toHaveLength(1)
    expect(typeof next[0].timestamp).toBe('number')
  })

  it('appendMutation preserves explicit timestamp', () => {
    const ts = 1234567890
    const next = appendMutation([], {
      type: MUTATION_TYPES.REORDER_BULLETS,
      target: { from: 1, to: 2 },
      description: 'reordered bullets',
      result: 'applied',
      metricDelta: { score: -0.1 },
      timestamp: ts,
    })

    expect(next[0].timestamp).toBe(ts)
  })

  it('hasSimilarMutation returns true for same type and same target', () => {
    const log = [
      {
        type: 'REPHRASE_BULLET',
        target: { bulletIndex: 3 },
        description: 'rephrase bullet 3',
        result: 'applied',
        metricDelta: { score: 0.1 },
        timestamp: 1,
      },
    ]

    expect(
      hasSimilarMutation(log, {
        type: 'REPHRASE_BULLET',
        target: { bulletIndex: 3 },
      }),
    ).toBe(true)
  })

  it('hasSimilarMutation returns false for same type but different target', () => {
    const log = [
      {
        type: 'REPHRASE_BULLET',
        target: { bulletIndex: 3 },
        description: 'rephrase bullet 3',
        result: 'applied',
        metricDelta: { score: 0.1 },
        timestamp: 1,
      },
    ]

    expect(
      hasSimilarMutation(log, {
        type: 'REPHRASE_BULLET',
        target: { bulletIndex: 5 },
      }),
    ).toBe(false)
  })

  it('getMutationHistory filters by type', () => {
    const log = [
      { type: 'REMOVE_BULLET', target: { bulletIndex: 0 } },
      { type: 'ADD_BULLET', target: { bulletIndex: 1 } },
      { type: 'REMOVE_BULLET', target: { bulletIndex: 2 } },
    ]

    const filtered = getMutationHistory(log, 'REMOVE_BULLET')
    expect(filtered).toEqual([
      { type: 'REMOVE_BULLET', target: { bulletIndex: 0 } },
      { type: 'REMOVE_BULLET', target: { bulletIndex: 2 } },
    ])
  })

  it('getMutationHistory returns all when type is omitted', () => {
    const log = [{ type: 'ADD_BULLET' }, { type: 'REMOVE_BULLET' }]
    expect(getMutationHistory(log)).toEqual(log)
  })
})

describe('validateMutatedConstants', () => {
  it('returns invalid for null constants', () => {
    const result = validateMutatedConstants(null)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('constants is null/undefined')
  })

  it('returns invalid for empty gradingPhilosophy', () => {
    const result = validateMutatedConstants({
      gradingPhilosophy: '',
      scoringScaleDescriptors: [],
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('gradingPhilosophy must be a non-empty string')
  })

  it('returns invalid when score levels are missing', () => {
    const result = validateMutatedConstants({
      gradingPhilosophy: 'some text',
      scoringScaleDescriptors: [{ score: 0, descriptor: 'test' }],
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('Missing score level 1 in scoringScaleDescriptors')
  })

  it('returns valid when all 11 unique score levels exist', () => {
    const scoringScaleDescriptors = Array.from({ length: 11 }, (_, score) => ({
      score,
      descriptor: `descriptor-${score}`,
    }))

    const result = validateMutatedConstants({
      gradingPhilosophy: '- bullet one\n- bullet two',
      scoringScaleDescriptors,
    })

    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for duplicate score levels', () => {
    const descriptors = [
      ...Array.from({ length: 11 }, (_, score) => ({
        score,
        descriptor: `descriptor-${score}`,
      })),
      { score: 10, descriptor: 'duplicate' },
    ]

    const result = validateMutatedConstants({
      gradingPhilosophy: 'some text',
      scoringScaleDescriptors: descriptors,
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('Duplicate score levels in scoringScaleDescriptors')
  })
})
