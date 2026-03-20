import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLoop } from '../loop-controller.js'

function makeBaselineMetric(composite = 0.70, overrides = {}) {
  return {
    composite,
    components: {
      generosityShift: 0.2,
      runVariance: 0.05,
      edgeCaseReliability: 0.15,
      within1Rate: 0.72,
      promptConciseness: 1.0,
    },
    promptLength: 400,
    perStudent: [
      { index: 0, name: 'Alice', mean: 7 },
      { index: 1, name: 'Bob', mean: 5 },
      { index: 2, name: 'Carol', mean: 9 },
    ],
    ...overrides,
  }
}

function makeConstants(tag = 'base') {
  return {
    gradingPhilosophy: `- Award credit proportional to rubric criteria (${tag})\n- Evaluate demonstrated understanding`,
    scoringScaleDescriptors: Array.from({ length: 11 }, (_, score) => ({
      score,
      descriptor: `Level ${score}`,
    })),
  }
}

function makeConfig(tsvPath, snapshotsDir, overrides = {}) {
  return {
    maxIterations: 3,
    maxTimeMinutes: 60,
    maxCostDollars: 50,
    runsPerEval: 3,
    improvementThreshold: 0.001,
    maxPerStudentRegression: 2,
    convergenceWindow: 10,
    model: 'test-model',
    tsvPath,
    snapshotsDir,
    baselineMetric: {
      constants: makeConstants('base'),
      metric: makeBaselineMetric(0.70),
    },
    goldStandardPath: '/dev/null',
    ...overrides,
  }
}

describe('e2e: mock loop — advance then discard then advance', () => {
  let tmpDir
  let tsvPath
  let snapshotsDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'autoresearch-e2e-'))
    tsvPath = join(tmpDir, 'results.tsv')
    snapshotsDir = join(tmpDir, 'snapshots')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('runs 3 iterations with advance/discard/advance pattern and writes correct results', async () => {
    const evalScores = [0.72, 0.65, 0.75]
    let evalCallCount = 0

    const savedSnapshots = []
    const appendedRows = []
    let iterationsRun = 0

    const deps = {
      loadGoldStandard: vi.fn(async () => [
        { index: 0, name: 'Alice', goldScore: 7 },
        { index: 1, name: 'Bob', goldScore: 5 },
        { index: 2, name: 'Carol', goldScore: 9 },
      ]),
      proposeMutation: vi.fn(async (constants, _log, _config) => ({
        type: 'REMOVE_BULLET',
        target: { bulletIndex: 0 },
        description: `mock mutation ${iterationsRun + 1}`,
      })),
      applyMutation: vi.fn(async (constants) => ({
        ...constants,
        gradingPhilosophy: constants.gradingPhilosophy + `\n- mutated`,
      })),
      runEvaluation: vi.fn(async () => {
        const composite = evalScores[evalCallCount] ?? 0.70
        evalCallCount += 1
        iterationsRun += 1
        return {
          ...makeBaselineMetric(composite),
          perStudent: [
            { index: 0, name: 'Alice', mean: 7 },
            { index: 1, name: 'Bob', mean: 5 },
            { index: 2, name: 'Carol', mean: 9 },
          ],
          estimatedInputTokens: 100,
          estimatedOutputTokens: 50,
        }
      }),
      saveSnapshot: vi.fn(async (constants, metric, iteration) => {
        savedSnapshots.push({ iteration, composite: metric.composite })
      }),
      initResultsTSV: vi.fn(),
      appendResult: vi.fn((path, result) => {
        appendedRows.push({ ...result })
      }),
      trackAPICall: vi.fn(),
      getRunningCost: vi.fn(() => ({ estimatedCost: 0.01, apiCallCount: evalCallCount })),
    }

    const config = makeConfig(tsvPath, snapshotsDir)
    const result = await runLoop(config, deps)

    expect(result.iterations).toBe(3)
    expect(result.reason).toBe('budget_iterations')

    expect(appendedRows).toHaveLength(3)

    expect(appendedRows[0].status).toBe('keep')
    expect(appendedRows[0].composite).toBeCloseTo(0.72, 3)

    expect(appendedRows[1].status).toBe('discard')
    expect(appendedRows[1].composite).toBeCloseTo(0.65, 3)

    expect(appendedRows[2].status).toBe('keep')
    expect(appendedRows[2].composite).toBeCloseTo(0.75, 3)

    expect(savedSnapshots.length).toBeGreaterThanOrEqual(2)
    const keepIterations = savedSnapshots.map((s) => s.iteration)
    expect(keepIterations).toContain(1)
    expect(keepIterations).toContain(3)

    expect(result.bestMetric.composite).toBeGreaterThan(0.70)
    expect(deps.runEvaluation).toHaveBeenCalledTimes(3)
    expect(deps.proposeMutation).toHaveBeenCalledTimes(3)
  })

  it('stops at budget_cost when running cost exceeds limit', async () => {
    let callCount = 0
    const deps = {
      loadGoldStandard: vi.fn(async () => [{ index: 0, name: 'Alice', goldScore: 7 }]),
      proposeMutation: vi.fn(async () => ({
        type: 'REMOVE_BULLET',
        target: { bulletIndex: 0 },
        description: 'mock',
      })),
      applyMutation: vi.fn(async (constants) => constants),
      runEvaluation: vi.fn(async () => {
        callCount += 1
        return { ...makeBaselineMetric(0.71), perStudent: [{ index: 0, name: 'Alice', mean: 7 }], estimatedInputTokens: 0, estimatedOutputTokens: 0 }
      }),
      saveSnapshot: vi.fn(),
      initResultsTSV: vi.fn(),
      appendResult: vi.fn(),
      trackAPICall: vi.fn(),
      getRunningCost: vi.fn(() => ({ estimatedCost: callCount >= 1 ? 100 : 0, apiCallCount: callCount })),
    }

    const config = makeConfig(tsvPath, snapshotsDir, {
      maxIterations: 10,
      maxCostDollars: 5,
    })
    const result = await runLoop(config, deps)
    expect(result.reason).toBe('budget_cost')
    expect(result.iterations).toBeLessThan(10)
  })

  it('discards mutation when per-student regression exceeds threshold', async () => {
    const appendedRows = []
    const deps = {
      loadGoldStandard: vi.fn(async () => [
        { index: 0, name: 'Alice', goldScore: 7 },
        { index: 1, name: 'Bob', goldScore: 9 },
      ]),
      proposeMutation: vi.fn(async () => ({
        type: 'REPHRASE_BULLET',
        target: { bulletIndex: 0 },
        description: 'regression-inducing mutation',
      })),
      applyMutation: vi.fn(async (constants) => constants),
      runEvaluation: vi.fn(async () => ({
        ...makeBaselineMetric(0.71),
        perStudent: [
          { index: 0, name: 'Alice', mean: 7 },
          { index: 1, name: 'Bob', mean: 3 },
        ],
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
      })),
      saveSnapshot: vi.fn(),
      initResultsTSV: vi.fn(),
      appendResult: vi.fn((path, result) => appendedRows.push({ ...result })),
      trackAPICall: vi.fn(),
      getRunningCost: vi.fn(() => ({ estimatedCost: 0, apiCallCount: 0 })),
    }

    const config = makeConfig(tsvPath, snapshotsDir, {
      maxIterations: 1,
      maxPerStudentRegression: 2,
      baselineMetric: {
        constants: makeConstants('base'),
        metric: {
          ...makeBaselineMetric(0.70),
          perStudent: [
            { index: 0, name: 'Alice', mean: 7 },
            { index: 1, name: 'Bob', mean: 9 },
          ],
        },
      },
    })

    const result = await runLoop(config, deps)
    expect(appendedRows[0]?.status).toBe('discard')
    expect(result.bestMetric.composite).toBeCloseTo(0.70, 2)
  })

  it('handles proposeMutation returning null gracefully (no iteration counted)', async () => {
    let proposeCallCount = 0
    const deps = {
      loadGoldStandard: vi.fn(async () => [{ index: 0, name: 'Alice', goldScore: 7 }]),
      proposeMutation: vi.fn(async () => {
        proposeCallCount += 1
        return null
      }),
      applyMutation: vi.fn(),
      runEvaluation: vi.fn(),
      saveSnapshot: vi.fn(),
      initResultsTSV: vi.fn(),
      appendResult: vi.fn(),
      trackAPICall: vi.fn(),
      getRunningCost: vi.fn(() => ({ estimatedCost: 0, apiCallCount: 0 })),
    }

    const config = makeConfig(tsvPath, snapshotsDir, { maxIterations: 3 })
    const result = await runLoop(config, deps)

    expect(result.iterations).toBe(0)
    expect(deps.runEvaluation).not.toHaveBeenCalled()
    expect(proposeCallCount).toBe(3)
  })
})

describe('e2e: loop.js CLI smoke tests', () => {
  it('--dry-run produces expected output format', async () => {
    const { spawnSync } = await import('node:child_process')
    const repoRoot = new URL('../..', import.meta.url).pathname

    const result = spawnSync('bun', ['run', 'autoresearch/loop.js', '--dry-run'], {
      cwd: repoRoot,
      timeout: 60_000,
      encoding: 'utf8',
    })

    if (result.status !== 0 || result.error) {
      throw new Error(`--dry-run failed (status ${result.status}): ${result.stderr ?? result.error?.message ?? ''}`)
    }

    const output = result.stdout
    expect(output).toMatch(/DRY RUN: iteration 1/)
    expect(output).toMatch(/composite: \d+\.\d{4}/)
    expect(output).toMatch(/status: (keep|discard)/)
    expect(output).toMatch(/Completed 1 iterations/)
  }, 90_000)

  it('--help outputs usage info', async () => {
    const { execSync } = await import('node:child_process')
    const repoRoot = new URL('../..', import.meta.url).pathname

    const output = execSync('bun run autoresearch/loop.js --help', {
      cwd: repoRoot,
      timeout: 10_000,
      encoding: 'utf8',
    })

    expect(output).toMatch(/--dry-run/)
    expect(output).toMatch(/--iterations/)
    expect(output).toMatch(/--budget/)
    expect(output).toMatch(/--tag/)
  })

  it('--iterations=0 is rejected with helpful error', async () => {
    const { execSync } = await import('node:child_process')
    const repoRoot = new URL('../..', import.meta.url).pathname

    expect(() => {
      execSync('bun run autoresearch/loop.js --iterations=0', {
        cwd: repoRoot,
        timeout: 10_000,
        encoding: 'utf8',
      })
    }).toThrow()
  })
})
