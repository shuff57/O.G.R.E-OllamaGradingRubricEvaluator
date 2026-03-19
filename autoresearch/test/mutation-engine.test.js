import { describe, it, expect } from 'vitest'
import { MUTATION_TYPES } from '../mutations.js'
import { applyMutation, parseBullets, proposeMutation } from '../mutation-engine.js'

function makeConstants() {
  const gradingPhilosophy = [
    '- Bullet 0',
    '- Bullet 1',
    '- Bullet 2',
    '- Bullet 3',
    '- Bullet 4',
    '- Bullet 5',
    '- Bullet 6',
    '- Bullet 7',
  ].join('\n')

  const scoringScaleDescriptors = Array.from({ length: 11 }, (_, score) => ({
    score,
    descriptor: `Descriptor ${score}`,
  }))

  return { gradingPhilosophy, scoringScaleDescriptors }
}

describe('applyMutation', () => {
  it('REMOVE_BULLET on index 0 removes one bullet', async () => {
    const constants = makeConstants()
    const before = parseBullets(constants.gradingPhilosophy)

    const result = await applyMutation(constants, {
      type: MUTATION_TYPES.REMOVE_BULLET,
      target: { bulletIndex: 0 },
    })

    const after = parseBullets(result.gradingPhilosophy)
    expect(after).toHaveLength(before.length - 1)
    expect(after[0]).toBe('- Bullet 1')
  })

  it('REMOVE_BULLET on index 2 preserves remaining bullet order', async () => {
    const constants = makeConstants()

    const result = await applyMutation(constants, {
      type: MUTATION_TYPES.REMOVE_BULLET,
      target: { bulletIndex: 2 },
    })

    expect(parseBullets(result.gradingPhilosophy)).toEqual([
      '- Bullet 0',
      '- Bullet 1',
      '- Bullet 3',
      '- Bullet 4',
      '- Bullet 5',
      '- Bullet 6',
      '- Bullet 7',
    ])
  })

  it('REPHRASE_BULLET replaces only the target bullet', async () => {
    const constants = makeConstants()

    const result = await applyMutation(constants, {
      type: MUTATION_TYPES.REPHRASE_BULLET,
      target: { bulletIndex: 1 },
      newText: '- Rephrased bullet 1',
    })

    expect(parseBullets(result.gradingPhilosophy)).toEqual([
      '- Bullet 0',
      '- Rephrased bullet 1',
      '- Bullet 2',
      '- Bullet 3',
      '- Bullet 4',
      '- Bullet 5',
      '- Bullet 6',
      '- Bullet 7',
    ])
  })

  it('ADD_BULLET inserts new bullet after given index', async () => {
    const constants = makeConstants()

    const result = await applyMutation(constants, {
      type: MUTATION_TYPES.ADD_BULLET,
      target: { afterIndex: 2 },
      newText: '- Inserted at position 3',
    })

    expect(parseBullets(result.gradingPhilosophy)).toEqual([
      '- Bullet 0',
      '- Bullet 1',
      '- Bullet 2',
      '- Inserted at position 3',
      '- Bullet 3',
      '- Bullet 4',
      '- Bullet 5',
      '- Bullet 6',
      '- Bullet 7',
    ])
  })

  it('MERGE_BULLETS merges index 2 and 3 into one bullet', async () => {
    const constants = makeConstants()

    const result = await applyMutation(constants, {
      type: MUTATION_TYPES.MERGE_BULLETS,
      target: { bulletIndex1: 2, bulletIndex2: 3 },
      mergedText: '- Merged bullet 2+3',
    })

    expect(parseBullets(result.gradingPhilosophy)).toEqual([
      '- Bullet 0',
      '- Bullet 1',
      '- Merged bullet 2+3',
      '- Bullet 4',
      '- Bullet 5',
      '- Bullet 6',
      '- Bullet 7',
    ])
  })

  it('ADJUST_DESCRIPTOR updates descriptor for score 7', async () => {
    const constants = makeConstants()

    const result = await applyMutation(constants, {
      type: MUTATION_TYPES.ADJUST_DESCRIPTOR,
      target: { score: 7 },
      newDescriptor: 'Updated descriptor for seven',
    })

    const score7 = result.scoringScaleDescriptors.find(d => d.score === 7)
    const score8 = result.scoringScaleDescriptors.find(d => d.score === 8)
    expect(score7?.descriptor).toBe('Updated descriptor for seven')
    expect(score8?.descriptor).toBe('Descriptor 8')
  })

  it('throws for invalid mutation type', async () => {
    const constants = makeConstants()

    await expect(
      applyMutation(constants, {
        type: 'TOTALLY_UNKNOWN_TYPE',
        target: { bulletIndex: 0 },
      }),
    ).rejects.toThrow(/invalid mutation type/i)
  })
})

describe('proposeMutation dedup behavior', () => {
  it('retries when LLM proposes an already-tried mutation', async () => {
    const constants = makeConstants()
    const mutationLog = [
      {
        type: MUTATION_TYPES.REMOVE_BULLET,
        target: { bulletIndex: 3 },
        description: 'already tried',
        result: 'no_improvement',
        timestamp: 1,
      },
    ]

    const calls = []
    const llmProvider = async ({ prompt }) => {
      calls.push(prompt)
      if (calls.length === 1) {
        return JSON.stringify({
          type: MUTATION_TYPES.REMOVE_BULLET,
          target: { bulletIndex: 3 },
          description: 'duplicate proposal',
        })
      }
      return JSON.stringify({
        type: MUTATION_TYPES.REPHRASE_BULLET,
        target: { bulletIndex: 2 },
        newText: '- Newly rephrased',
        description: 'novel proposal',
      })
    }

    const proposed = await proposeMutation(
      constants,
      mutationLog,
      { model: 'test-model', apiKey: 'test-key' },
      llmProvider,
    )

    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('already tried')
    expect(proposed).toMatchObject({
      type: MUTATION_TYPES.REPHRASE_BULLET,
      target: { bulletIndex: 2 },
      newText: '- Newly rephrased',
    })
  })
})
