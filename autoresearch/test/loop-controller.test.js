import { describe, it, expect, vi } from 'vitest'
import {
  runLoop,
  shouldAdvance,
  checkPerStudentRegression,
} from '../loop-controller.js'

function makeBaselineMetric(overrides = {}) {
  return {
    composite: 0.8,
    components: {
      generosityShift: 0.1,
      runVariance: 0.1,
      edgeCaseReliability: 0.1,
      within1Rate: 0.8,
      promptConciseness: 1.0,
    },
    promptLength: 100,
    perStudent: [
      { index: 0, name: 'A', mean: 8 },
      { index: 1, name: 'B', mean: 9 },
    ],
    ...overrides,
  }
}

function makeConfig(overrides = {}) {
  return {
    maxIterations: 5,
    maxTimeMinutes: 60,
    maxCostDollars: 50,
    runsPerEval: 3,
    improvementThreshold: 0.001,
    maxPerStudentRegression: 2,
    convergenceWindow: 10,
    model: 'test-model',
    apiKey: 'test-key',
    tsvPath: 'ignore.tsv',
    snapshotsDir: 'ignore-snapshots',
    baselineMetric: {
      constants: {
        gradingPhilosophy: '- baseline',
        scoringScaleDescriptors: Array.from({ length: 11 }, (_, score) => ({
          score,
          descriptor: `Level ${score}`,
        })),
      },
      metric: makeBaselineMetric(),
    },
    ...overrides,
  }
}

function makeDeps(overrides = {}) {
  const initResultsTSV = vi.fn()
  const appendResult = vi.fn()
  const saveSnapshot = vi.fn()
  const createMutationLog = vi.fn(() => [])
  const appendMutation = vi.fn((log, entry) => [...log, entry])
  const loadGoldStandard = vi.fn(async () => [{ index: 0, name: 'A', goldScore: 8 }])
  const proposeMutation = vi.fn(async () => ({
    type: 'REPHRASE_BULLET',
    target: { bulletIndex: 0 },
    description: 'proposal',
  }))
  const applyMutation = vi.fn(async (constants) => ({ ...constants, revised: true }))
  const runEvaluation = vi.fn(async () => ({
    ...makeBaselineMetric({ composite: 0.81 }),
    perStudent: [
      { index: 0, name: 'A', mean: 8.5 },
      { index: 1, name: 'B', mean: 9.2 },
    ],
    estimatedInputTokens: 500,
    estimatedOutputTokens: 200,
  }))
  const getRunningCost = vi.fn(() => ({ estimatedCost: 0, apiCallCount: 0 }))
  const trackAPICall = vi.fn()
  const loadBaselineMetric = vi.fn(async () => null)
  const now = vi.fn(() => 0)

  return {
    initResultsTSV,
    appendResult,
    saveSnapshot,
    createMutationLog,
    appendMutation,
    loadGoldStandard,
    proposeMutation,
    applyMutation,
    runEvaluation,
    getRunningCost,
    trackAPICall,
    loadBaselineMetric,
    now,
    ...overrides,
  }
}

describe('runLoop', () => {
  it('advance: keeps mutation when composite improves above threshold', async () => {
    const config = makeConfig()
    const deps = makeDeps({
      runEvaluation: vi.fn(async () => makeBaselineMetric({
        composite: 0.811,
        promptLength: 120,
        perStudent: [
          { index: 0, name: 'A', mean: 8.5 },
          { index: 1, name: 'B', mean: 9.1 },
        ],
      })),
      proposeMutation: vi.fn(async () => ({
        type: 'ADD_BULLET',
        target: { afterIndex: 0 },
        description: 'add one line',
      })),
    })

    const result = await runLoop({ ...config, maxIterations: 1 }, deps)

    expect(result.reason).toBe('budget_iterations')
    expect(result.bestMetric.composite).toBe(0.811)
    expect(deps.appendMutation).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ status: 'keep' }),
    )
    expect(deps.appendResult).toHaveBeenCalledWith(
      config.tsvPath,
      expect.objectContaining({ status: 'keep' }),
    )
    expect(deps.saveSnapshot).toHaveBeenCalledTimes(1)
  })

  it('revert: discards mutation when composite gets worse', async () => {
    const config = makeConfig()
    const deps = makeDeps({
      runEvaluation: vi.fn(async () => makeBaselineMetric({
        composite: 0.79,
        promptLength: 90,
        perStudent: [
          { index: 0, name: 'A', mean: 8 },
          { index: 1, name: 'B', mean: 9 },
        ],
      })),
    })

    const result = await runLoop({ ...config, maxIterations: 1 }, deps)

    expect(result.reason).toBe('budget_iterations')
    expect(result.bestMetric.composite).toBe(0.8)
    expect(deps.appendMutation).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ status: 'discard' }),
    )
    expect(deps.appendResult).toHaveBeenCalledWith(
      config.tsvPath,
      expect.objectContaining({ status: 'discard' }),
    )
    expect(deps.saveSnapshot).not.toHaveBeenCalled()
  })

  it('budget-iterations: stops when maxIterations reached', async () => {
    const config = makeConfig({ maxIterations: 2 })
    const deps = makeDeps({
      runEvaluation: vi
        .fn()
        .mockResolvedValueOnce(makeBaselineMetric({ composite: 0.811, promptLength: 110 }))
        .mockResolvedValueOnce(makeBaselineMetric({ composite: 0.822, promptLength: 120 })),
    })

    const result = await runLoop(config, deps)

    expect(result.reason).toBe('budget_iterations')
    expect(result.iterations).toBe(2)
    expect(deps.runEvaluation).toHaveBeenCalledTimes(2)
  })

  it('budget-time: stops when maxTimeMinutes exceeded', async () => {
    const config = makeConfig({ maxIterations: 10, maxTimeMinutes: 0.5 })
    const deps = makeDeps({
      now: vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(31_000),
    })

    const result = await runLoop(config, deps)

    expect(result.reason).toBe('budget_time')
    expect(result.iterations).toBe(0)
    expect(deps.runEvaluation).not.toHaveBeenCalled()
  })

  it('budget-cost: stops when maxCostDollars exceeded', async () => {
    const config = makeConfig({ maxIterations: 5, maxCostDollars: 1 })
    const deps = makeDeps({
      getRunningCost: vi.fn(() => ({ estimatedCost: 1.2, apiCallCount: 9 })),
    })

    const result = await runLoop(config, deps)

    expect(result.reason).toBe('budget_cost')
    expect(result.iterations).toBe(0)
    expect(deps.runEvaluation).not.toHaveBeenCalled()
  })

  it('per-student-regression guard: reverts if any student regresses over cap', async () => {
    const config = makeConfig({ maxIterations: 1, maxPerStudentRegression: 2 })
    const deps = makeDeps({
      runEvaluation: vi.fn(async () => makeBaselineMetric({
        composite: 0.82,
        promptLength: 80,
        perStudent: [
          { index: 0, name: 'A', mean: 5 },
          { index: 1, name: 'B', mean: 9.1 },
        ],
      })),
    })

    const result = await runLoop(config, deps)

    expect(result.bestMetric.composite).toBe(0.8)
    expect(deps.appendMutation).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ status: 'discard' }),
    )
    expect(deps.saveSnapshot).not.toHaveBeenCalled()
  })

  it('convergence does NOT stop loop (never-stop principle)', async () => {
    const config = makeConfig({ maxIterations: 12, convergenceWindow: 3 })
    const deps = makeDeps({
      runEvaluation: vi.fn(async () => makeBaselineMetric({
        composite: 0.8001,
        promptLength: 110,
        perStudent: [
          { index: 0, name: 'A', mean: 8 },
          { index: 1, name: 'B', mean: 9 },
        ],
      })),
    })

    const result = await runLoop(config, deps)

    expect(result.reason).toBe('budget_iterations')
    expect(result.iterations).toBe(12)
    expect(deps.runEvaluation).toHaveBeenCalledTimes(12)
  })

  it('simplicity-tiebreak: keeps shorter prompt at near-equal score', async () => {
    const config = makeConfig({ maxIterations: 1, improvementThreshold: 0.001 })
    const deps = makeDeps({
      runEvaluation: vi.fn(async () => makeBaselineMetric({
        composite: 0.8,
        promptLength: 70,
        perStudent: [
          { index: 0, name: 'A', mean: 8 },
          { index: 1, name: 'B', mean: 9 },
        ],
      })),
    })

    const result = await runLoop(config, deps)

    expect(result.bestMetric.promptLength).toBe(70)
    expect(deps.appendMutation).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ status: 'keep' }),
    )
    expect(deps.appendResult).toHaveBeenCalledWith(
      config.tsvPath,
      expect.objectContaining({ status: 'keep' }),
    )
  })
})

describe('shouldAdvance', () => {
  it('returns advance when composite exceeds threshold', () => {
    const decision = shouldAdvance(
      makeBaselineMetric({ composite: 0.8, promptLength: 120 }),
      makeBaselineMetric({ composite: 0.802, promptLength: 180 }),
      0.001,
    )
    expect(decision).toBe('advance')
  })

  it('returns simplicity_advance for near-equal but shorter prompt', () => {
    const decision = shouldAdvance(
      makeBaselineMetric({ composite: 0.8, promptLength: 120 }),
      makeBaselineMetric({ composite: 0.8005, promptLength: 90 }),
      0.001,
    )
    expect(decision).toBe('simplicity_advance')
  })

  it('returns revert when no threshold improvement and not shorter', () => {
    const decision = shouldAdvance(
      makeBaselineMetric({ composite: 0.8, promptLength: 100 }),
      makeBaselineMetric({ composite: 0.8005, promptLength: 130 }),
      0.001,
    )
    expect(decision).toBe('revert')
  })
})

describe('checkPerStudentRegression', () => {
  it('returns violations for regressions over cap', () => {
    const result = checkPerStudentRegression(
      [
        { index: 0, name: 'A', mean: 8 },
        { index: 1, name: 'B', mean: 9 },
      ],
      [
        { index: 0, name: 'A', mean: 5.5 },
        { index: 1, name: 'B', mean: 8 },
      ],
      2,
    )

    expect(result.passed).toBe(false)
    expect(result.violations).toEqual([
      { index: 0, name: 'A', regression: 2.5 },
    ])
  })
})
