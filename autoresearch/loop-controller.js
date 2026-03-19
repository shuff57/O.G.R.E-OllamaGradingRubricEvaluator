import { readFile } from 'node:fs/promises'

import { runEvaluation as defaultRunEvaluation } from './eval-harness.js'
import {
  proposeMutation as defaultProposeMutation,
  applyMutation as defaultApplyMutation,
} from './mutation-engine.js'
import { loadGoldStandard as defaultLoadGoldStandard } from './data-loader.js'
import { createMutationLog as defaultCreateMutationLog, appendMutation as defaultAppendMutation } from './mutations.js'
import {
  initResultsTSV as defaultInitResultsTSV,
  appendResult as defaultAppendResult,
  saveSnapshot as defaultSaveSnapshot,
  trackAPICall as defaultTrackAPICall,
  getRunningCost as defaultGetRunningCost,
} from './results-tracker.js'

const DEFAULT_BASELINE_PATH = new URL('./baseline-metric.json', import.meta.url)

function getNowFn(deps) {
  return deps.now ?? (() => Date.now())
}

function normalizeBaselinePayload(payload) {
  const metric = payload?.metric ?? payload
  const constants = payload?.constants

  if (!metric || typeof metric.composite !== 'number' || !Number.isFinite(metric.composite)) {
    throw new Error('Invalid baseline metric: missing finite composite')
  }

  if (!constants || typeof constants !== 'object') {
    throw new Error('Invalid baseline metric: missing constants')
  }

  return { metric, constants }
}

async function loadBaselineMetric(config, deps) {
  if (config?.baselineMetric) {
    return normalizeBaselinePayload(config.baselineMetric)
  }

  const baselineMetricPath = config?.baselineMetricPath ?? DEFAULT_BASELINE_PATH
  const loader = deps.loadBaselineMetric

  if (loader) {
    const payload = await loader(baselineMetricPath)
    return normalizeBaselinePayload(payload)
  }

  const raw = await readFile(baselineMetricPath, 'utf-8')
  return normalizeBaselinePayload(JSON.parse(raw))
}

function toStudentName(student) {
  return student?.name ?? `student_${student?.index ?? 'unknown'}`
}

function toStudentIndex(student, fallback) {
  return Number.isInteger(student?.index) ? student.index : fallback
}

export function checkPerStudentRegression(baselinePerStudent, evalPerStudent, maxRegression) {
  const baseline = Array.isArray(baselinePerStudent) ? baselinePerStudent : []
  const candidate = Array.isArray(evalPerStudent) ? evalPerStudent : []
  const cap = Number.isFinite(maxRegression) ? maxRegression : 0

  const violations = []
  const count = Math.min(baseline.length, candidate.length)

  for (let i = 0; i < count; i += 1) {
    const baselineMean = baseline[i]?.mean
    const candidateMean = candidate[i]?.mean
    if (!Number.isFinite(baselineMean) || !Number.isFinite(candidateMean)) {
      continue
    }

    const regression = baselineMean - candidateMean
    if (regression > cap) {
      violations.push({
        index: toStudentIndex(candidate[i], i),
        name: toStudentName(candidate[i] ?? baseline[i]),
        regression: Number(regression.toFixed(4)),
      })
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  }
}

export function shouldAdvance(currentMetric, candidateMetric, improvementThreshold) {
  const currentComposite = Number(currentMetric?.composite ?? Number.NEGATIVE_INFINITY)
  const candidateComposite = Number(candidateMetric?.composite ?? Number.NEGATIVE_INFINITY)
  const threshold = Number.isFinite(improvementThreshold) ? improvementThreshold : 0

  if (candidateComposite > currentComposite + threshold) {
    return 'advance'
  }

  const diff = candidateComposite - currentComposite
  const currentPromptLength = Number(currentMetric?.promptLength ?? Number.POSITIVE_INFINITY)
  const candidatePromptLength = Number(candidateMetric?.promptLength ?? Number.POSITIVE_INFINITY)
  const withinThreshold = Number.isFinite(diff) && Math.abs(diff) < threshold

  if (withinThreshold && candidatePromptLength < currentPromptLength) {
    return 'simplicity_advance'
  }

  return 'revert'
}

function extractTokenUsage(evalResult) {
  if (Number.isFinite(evalResult?.estimatedInputTokens) || Number.isFinite(evalResult?.estimatedOutputTokens)) {
    return [
      {
        inputTokens: Number(evalResult?.estimatedInputTokens ?? 0),
        outputTokens: Number(evalResult?.estimatedOutputTokens ?? 0),
      },
    ]
  }

  if (Array.isArray(evalResult?.apiCalls)) {
    return evalResult.apiCalls.map((entry) => ({
      inputTokens: Number(entry?.inputTokens ?? 0),
      outputTokens: Number(entry?.outputTokens ?? 0),
    }))
  }

  return []
}

export async function runLoop(config, deps = {}) {
  const runEvaluation = deps.runEvaluation ?? defaultRunEvaluation
  const proposeMutation = deps.proposeMutation ?? defaultProposeMutation
  const applyMutation = deps.applyMutation ?? defaultApplyMutation
  const loadGoldStandard = deps.loadGoldStandard ?? defaultLoadGoldStandard

  const createMutationLog = deps.createMutationLog ?? defaultCreateMutationLog
  const appendMutation = deps.appendMutation ?? defaultAppendMutation
  const initResultsTSV = deps.initResultsTSV ?? defaultInitResultsTSV
  const appendResult = deps.appendResult ?? defaultAppendResult
  const saveSnapshot = deps.saveSnapshot ?? defaultSaveSnapshot
  const trackAPICall = deps.trackAPICall ?? defaultTrackAPICall
  const getRunningCost = deps.getRunningCost ?? defaultGetRunningCost
  const now = getNowFn(deps)

  const maxIterations = Number(config?.maxIterations ?? 0)
  const maxTimeMinutes = Number(config?.maxTimeMinutes ?? Number.POSITIVE_INFINITY)
  const maxCostDollars = Number(config?.maxCostDollars ?? Number.POSITIVE_INFINITY)
  const improvementThreshold = Number(config?.improvementThreshold ?? 0)
  const maxPerStudentRegression = Number(config?.maxPerStudentRegression ?? Number.POSITIVE_INFINITY)

  const startedAt = now()
  let reason = 'budget_iterations'
  let iterations = 0

  const { metric: baselineMetric, constants: baselineConstants } = await loadBaselineMetric(config, deps)
  const goldData = await loadGoldStandard(config?.goldStandardPath)

  let currentConstants = baselineConstants
  let bestMetric = baselineMetric
  let mutationLog = createMutationLog()

  initResultsTSV(config.tsvPath)

  try {
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const elapsedMinutes = (now() - startedAt) / 60_000
      if (elapsedMinutes > maxTimeMinutes) {
        reason = 'budget_time'
        break
      }

      const runningCost = getRunningCost()
      if ((runningCost?.estimatedCost ?? 0) > maxCostDollars) {
        reason = 'budget_cost'
        break
      }

      const mutation = await proposeMutation(
        currentConstants,
        mutationLog,
        config,
        deps.proposeMutationProvider,
      )

      if (!mutation) {
        continue
      }

      iterations += 1

      const candidateConstants = await applyMutation(currentConstants, mutation)
      const evalConfig = {
        model: config?.model,
        apiKey: config?.apiKey,
        runs: config?.runsPerEval,
      }

      const evalResult = await runEvaluation(
        candidateConstants,
        goldData,
        evalConfig,
        deps.llmProvider,
      )

      for (const usage of extractTokenUsage(evalResult)) {
        trackAPICall(usage.inputTokens, usage.outputTokens)
      }

      const regressionCheck = checkPerStudentRegression(
        baselineMetric.perStudent,
        evalResult?.perStudent,
        maxPerStudentRegression,
      )

      let status = 'discard'
      if (regressionCheck.passed) {
        const decision = shouldAdvance(bestMetric, evalResult, improvementThreshold)
        if (decision === 'advance' || decision === 'simplicity_advance') {
          status = 'keep'
          currentConstants = candidateConstants
          bestMetric = evalResult
          mutationLog = appendMutation(mutationLog, { ...mutation, status })
          saveSnapshot(candidateConstants, evalResult, iteration, config?.snapshotsDir)
        }
      }

      if (status === 'discard') {
        mutationLog = appendMutation(mutationLog, { ...mutation, status })
      }

      appendResult(config.tsvPath, {
        iteration,
        composite: evalResult.composite,
        components: evalResult.components,
        promptLength: evalResult.promptLength,
        status,
        description: mutation.description,
      })

      console.log(
        `iteration ${iteration}/${maxIterations}, composite: ${Number(evalResult.composite).toFixed(4)}, status: ${status}`,
      )
    }
  } catch (error) {
    reason = 'error'
    return {
      iterations,
      bestMetric,
      bestConstants: currentConstants,
      reason,
      error: error?.message ?? String(error),
    }
  }

  return {
    iterations,
    bestMetric,
    bestConstants: currentConstants,
    reason,
  }
}
