#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  GRADING_PHILOSOPHY,
  SCORING_SCALE_DESCRIPTORS,
} from '../grading-server/grading-constants.js';
import { loadGoldStandard } from './data-loader.js';
import { runEvaluation as defaultRunEvaluation } from './eval-harness.js';
import { runLoop } from './loop-controller.js';
import {
  appendResult as defaultAppendResult,
  initResultsTSV as defaultInitResultsTSV,
  saveSnapshot as defaultSaveSnapshot,
  loadBestSnapshot,
} from './results-tracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_TAG = new Date().toISOString().slice(0, 10);
const DEFAULT_GOLD_STANDARD_PATH = resolve(REPO_ROOT, '..', 'shuff57-llm-finetune', 'ogre', 'test-data', 'sonnet-gold-standard-post-patch.json');
const DEFAULT_BASELINE_PATH = new URL('./baseline-metric.json', import.meta.url);
const COPILOT_AUTH_PATH = resolve(process.env.HOME ?? '', '.local/share/opencode/auth.json');
const COPILOT_BASE_URL = 'https://api.githubcopilot.com/chat/completions';

function printUsage() {
  console.log(`Usage: bun run autoresearch/loop.js [options]

Options:
  --dry-run         Run one mock iteration with no API calls and no git ops
  --iterations=N    Override max iterations (default: 100)
  --tag=LABEL       Snapshot label (default: ${DEFAULT_TAG})
  --budget=N        Max cost in dollars (default: 50)
  --help            Show this help message

Notes:
  - Run bun run autoresearch/establish-baseline.js first.
  - Eval harness auto-uses GitHub Copilot OAuth when no Anthropic key is set.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${flagName} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function parseNonNegativeNumber(value, flagName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`${flagName} must be a non-negative number. Received: ${value}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    iterations: 100,
    tag: DEFAULT_TAG,
    budget: 50,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--help') {
      parsed.help = true;
      continue;
    }

    if (arg.startsWith('--iterations=')) {
      parsed.iterations = parsePositiveInteger(arg.slice('--iterations='.length), '--iterations');
      continue;
    }

    if (arg.startsWith('--tag=')) {
      const value = arg.slice('--tag='.length).trim();
      if (!value) {
        fail('--tag must be a non-empty label.');
      }
      parsed.tag = value;
      continue;
    }

    if (arg.startsWith('--budget=')) {
      parsed.budget = parseNonNegativeNumber(arg.slice('--budget='.length), '--budget');
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function buildConfig(flags) {
  return {
    maxIterations: flags.iterations,
    maxTimeMinutes: 480,
    maxCostDollars: flags.budget,
    runsPerEval: 3,
    improvementThreshold: 0.001,
    maxPerStudentRegression: 2,
    convergenceWindow: 10,
    iterationDelayMs: 30_000,
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
    goldStandardPath: DEFAULT_GOLD_STANDARD_PATH,
    tsvPath: 'autoresearch/results.tsv',
    snapshotsDir: `autoresearch/snapshots/${flags.tag}`,
  };
}

async function loadBaselineComposite(config) {
  if (Number.isFinite(config?.baselineMetric?.metric?.composite)) {
    return config.baselineMetric.metric.composite;
  }

  const baselinePath = config?.baselineMetricPath ?? DEFAULT_BASELINE_PATH;
  const raw = await readFile(baselinePath, 'utf8');
  const parsed = JSON.parse(raw);
  const composite = parsed?.metric?.composite ?? parsed?.composite;

  if (!Number.isFinite(composite)) {
    throw new Error('baseline-metric.json is missing a finite composite score');
  }

  return composite;
}

async function loadCopilotToken() {
  try {
    const raw = await readFile(COPILOT_AUTH_PATH, 'utf8');
    const auth = JSON.parse(raw);
    const token = auth?.['github-copilot']?.access;

    if (!token) {
      throw new Error('No github-copilot access token in auth.json');
    }

    return token;
  } catch (error) {
    throw new Error(`Cannot load Copilot token from ${COPILOT_AUTH_PATH}: ${error?.message ?? error}`);
  }
}

async function callCopilot(prompt, model) {
  const token = await loadCopilotToken();
  const response = await fetch(COPILOT_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Copilot-Integration-Id': 'vscode-chat',
      'editor-version': 'vscode/1.85.0',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Copilot request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Copilot response missing content');
  }

  return content;
}

async function proposeMutationWithCopilot({ prompt, config }) {
  return callCopilot(prompt, config?.model ?? 'claude-sonnet-4.6');
}

function createProgressDeps(baselineComposite) {
  let bestComposite = baselineComposite;

  return {
    initResultsTSV: defaultInitResultsTSV,
    saveSnapshot: defaultSaveSnapshot,
    appendResult(tsvPath, result) {
      const delta = result.composite - bestComposite;
      const sign = delta >= 0 ? '+' : '';
      console.log(
        `iteration ${result.iteration} | composite: ${Number(result.composite).toFixed(4)} (${sign}${delta.toFixed(4)}) | status: ${result.status} | "${result.description}"`,
      );
      defaultAppendResult(tsvPath, result);
      if (result.status === 'keep') {
        bestComposite = result.composite;
      }
    },
  };
}

function suppressLoopControllerLogs() {
  const original = console.log;
  console.log = (...args) => {
    if (
      args.length === 1
      && typeof args[0] === 'string'
      && /^iteration \d+\/\d+, composite: /.test(args[0])
    ) {
      return;
    }
    original(...args);
  };

  return () => {
    console.log = original;
  };
}

function buildDryRunBaseline(goldData) {
  return {
    constants: {
      gradingPhilosophy: GRADING_PHILOSOPHY,
      scoringScaleDescriptors: SCORING_SCALE_DESCRIPTORS,
    },
    metric: {
      composite: 0.5,
      components: {
        generosityShift: 0.5,
        runVariance: 0.5,
        edgeCaseReliability: 0.5,
        within1Rate: 0.5,
        promptConciseness: 0.5,
      },
      promptLength: GRADING_PHILOSOPHY.length,
      perStudent: goldData.map((student) => ({
        index: student.index,
        name: student.name,
        mean: student.goldScore,
      })),
    },
  };
}

async function runDryRun(baseConfig) {
  const goldData = await loadGoldStandard(baseConfig.goldStandardPath);
  const baselineMetric = buildDryRunBaseline(goldData);
  const dryRunConfig = {
    ...baseConfig,
    maxIterations: 1,
    baselineMetric,
  };

  let capturedEvalResult = null;
  const restoreConsole = suppressLoopControllerLogs();

  try {
    const result = await runLoop(dryRunConfig, {
      llmProvider: async () => '{"score": 7}',
      proposeMutationProvider: async () => ({
        type: 'REMOVE_BULLET',
        target: { bulletIndex: 0 },
        description: 'dry-run mock mutation',
      }),
      loadGoldStandard: async () => goldData,
      runEvaluation: async (constants, loadedGoldData, evalConfig, llmProvider) => {
        capturedEvalResult = await defaultRunEvaluation(constants, loadedGoldData, evalConfig, llmProvider);
        return capturedEvalResult;
      },
      saveSnapshot: () => {},
      initResultsTSV: () => {},
      appendResult: () => {},
    });

    const status = result.bestMetric?.composite === capturedEvalResult?.composite ? 'keep' : 'discard';
    const composite = Number(capturedEvalResult?.composite ?? result.bestMetric?.composite ?? 0).toFixed(4);
    console.log(`DRY RUN: iteration 1 | composite: ${composite} | status: ${status}`);
    console.log(
      `Completed ${result.iterations} iterations. Best composite: ${Number(result.bestMetric?.composite ?? 0).toFixed(4)}. Reason: ${result.reason}`,
    );

    if (result.reason === 'error') {
      fail(`Dry run failed: ${result.error}`);
    }
  } finally {
    restoreConsole();
  }
}

async function runStandard(config) {
  const restoreConsole = suppressLoopControllerLogs();

  try {
    const baselineComposite = await loadBaselineComposite(config);

    // Resume from best snapshot if one exists
    const bestSnapshot = loadBestSnapshot();
    let resumeConfig = config;
    if (bestSnapshot?.constants && bestSnapshot?.metric?.composite > baselineComposite) {
      console.log(`Resuming from best snapshot (composite: ${Number(bestSnapshot.metric.composite).toFixed(4)}) instead of baseline (${Number(baselineComposite).toFixed(4)})`);
      resumeConfig = {
        ...config,
        baselineMetric: { metric: bestSnapshot.metric, constants: bestSnapshot.constants },
      };
    }

    const result = await runLoop(resumeConfig, {
      ...createProgressDeps(bestSnapshot?.metric?.composite ?? baselineComposite),
    });

    if (result.reason === 'error') {
      fail(`Loop failed: ${result.error}`);
    }

    console.log(
      `Completed ${result.iterations} iterations. Best composite: ${Number(result.bestMetric?.composite ?? 0).toFixed(4)}. Reason: ${result.reason}`,
    );
  } catch (error) {
    fail(
      `Loop failed before completion: ${error?.message ?? error}\nTip: run bun run autoresearch/establish-baseline.js first, then retry.`,
    );
  } finally {
    restoreConsole();
  }
}

async function main() {
  process.chdir(REPO_ROOT);

  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  const config = buildConfig(flags);

  if (flags.dryRun) {
    await runDryRun(config);
    process.exit(0);
  }

  await runStandard(config);
}

main().catch((error) => {
  fail(`Unhandled loop CLI error: ${error?.message ?? error}`);
});
