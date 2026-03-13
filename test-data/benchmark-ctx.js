#!/usr/bin/env bun

import { resolve, isAbsolute } from 'node:path';
import { buildBatchPrompt, generateScoringAnchors } from '../grading-server/grading.js';

const DEFAULTS = {
  model: 'shuff57/qwen3.5-9B-stat-grader',
  url: 'http://localhost:11434',
  ctx: [4096, 5120, 6144, 7168, 8192],
  students: [9, 15],
  runs: 3,
  warmup: 1,
  seed: 42,
  output: 'test-data/ctx-benchmark-results.json',
  timeoutMs: 20 * 60 * 1000,
};

const TEST_RUBRIC = {
  essayPrompt: 'Explain the relationship between sample size and margin of error using the Central Limit Theorem. Include the formula for standard error and describe the direction of the relationship.',
  maxScore: '10',
  checklistItems: [
    {
      category: 'CLT Connection (4 points)',
      points: 4,
      items: ['Mentions Central Limit Theorem', 'Explains sampling distribution becomes normal', 'References sample size n'],
    },
    {
      category: 'Standard Error Formula (3 points)',
      points: 3,
      items: ['States SE = sigma/sqrt(n)', 'Explains denominator relationship', 'Connects SE to margin of error'],
    },
    {
      category: 'Direction & Interpretation (3 points)',
      points: 3,
      items: ['States larger n = smaller MOE', 'Gives quantitative relationship (e.g. quadruple n, halve MOE)', 'Practical application or example'],
    },
  ],
};

const HELP_TEXT = `bun test-data/benchmark-ctx.js [options]

Options:
  --model=<name>         Ollama model name (default: ${DEFAULTS.model})
  --url=<url>            Ollama base URL (default: ${DEFAULTS.url})
  --ctx=<values>         Comma-separated ctx values (default: ${DEFAULTS.ctx.join(',')})
  --students=<values>    Comma-separated student counts (default: ${DEFAULTS.students.join(',')})
  --runs=<n>             Measured runs per config (default: ${DEFAULTS.runs})
  --warmup=<n>           Warm-up runs to discard (default: ${DEFAULTS.warmup})
  --seed=<n>             Seed for reproducibility (default: ${DEFAULTS.seed})
  --output=<path>        Output JSON path (default: ${DEFAULTS.output})
  --help                 Show this help`;

function parseArgs(argv) {
  const config = structuredClone(DEFAULTS);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      config.help = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const [flag, inlineValue] = arg.split(/=(.*)/s, 2);
    const value = inlineValue ?? argv[index + 1];

    switch (flag) {
      case '--model':
        config.model = requireValue(flag, value);
        if (inlineValue === undefined) index += 1;
        break;
      case '--url':
        config.url = requireValue(flag, value);
        if (inlineValue === undefined) index += 1;
        break;
      case '--ctx':
        config.ctx = parseIntegerList(requireValue(flag, value), flag);
        if (inlineValue === undefined) index += 1;
        break;
      case '--students':
        config.students = parseIntegerList(requireValue(flag, value), flag);
        if (inlineValue === undefined) index += 1;
        break;
      case '--runs':
        config.runs = parseNonNegativeInteger(requireValue(flag, value), flag, { min: 1 });
        if (inlineValue === undefined) index += 1;
        break;
      case '--warmup':
        config.warmup = parseNonNegativeInteger(requireValue(flag, value), flag);
        if (inlineValue === undefined) index += 1;
        break;
      case '--seed':
        config.seed = parseNonNegativeInteger(requireValue(flag, value), flag);
        if (inlineValue === undefined) index += 1;
        break;
      case '--output':
        config.output = requireValue(flag, value);
        if (inlineValue === undefined) index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  config.ctx = uniqueIntegers(config.ctx);
  config.students = uniqueIntegers(config.students);
  return config;
}

function requireValue(flag, value) {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseIntegerList(rawValue, flag) {
  const values = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseNonNegativeInteger(value, flag, { min: 1 }));

  if (values.length === 0) {
    throw new Error(`${flag} requires at least one integer`);
  }

  return values;
}

function parseNonNegativeInteger(rawValue, flag, { min = 0 } = {}) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${flag} must be an integer`);
  }

  const value = Number.parseInt(rawValue, 10);
  if (value < min) {
    throw new Error(`${flag} must be >= ${min}`);
  }

  return value;
}

function uniqueIntegers(values) {
  return [...new Set(values)];
}

function normalizeBaseUrl(url) {
  return url.replace(/\/$/, '');
}

function resolveOutputPath(outputPath) {
  return isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
}

function sortCtxValues(values) {
  return [...values].sort((left, right) => {
    if (left === 8192 && right !== 8192) return -1;
    if (right === 8192 && left !== 8192) return 1;
    return left - right;
  });
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function rateFromNs(count, durationNs) {
  if (!count || !durationNs) return 0;
  return count / (durationNs / 1e9);
}

function roundMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function formatRate(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function buildStudents(sourceStudents, count) {
  const students = [];

  for (let index = 0; index < count; index += 1) {
    const source = sourceStudents[index % sourceStudents.length];
    const copyNumber = Math.floor(index / sourceStudents.length);
    const name = copyNumber === 0 ? source.name : `${source.name} - Copy ${copyNumber}`;

    students.push({
      ...source,
      name,
      index,
    });
  }

  return students;
}

function buildOllamaRequest({ url, model, promptText, ctx, seed }) {
  const base = normalizeBaseUrl(url);

  return {
    url: `${base}/api/chat`,
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      model,
      messages: [{ role: 'user', content: promptText }],
      stream: false,
      think: false,
      keep_alive: '60m',
      options: {
        temperature: 0.2,
        num_ctx: ctx,
        seed,
      },
    },
  };
}

async function callOllama({ url, model, promptText, ctx, seed, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const request = buildOllamaRequest({ url, model, promptText, ctx, seed });
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeRun(runNumber, responseJson, expectedStudents) {
  const content = responseJson?.message?.content ?? '';
  let parsed = null;
  let jsonValid = false;

  try {
    parsed = JSON.parse(content);
    jsonValid = true;
  } catch {
    jsonValid = false;
  }

  const studentCountMatch = jsonValid && Array.isArray(parsed) && parsed.length === expectedStudents;
  const evalCount = responseJson.eval_count ?? 0;
  const evalDurationNs = responseJson.eval_duration ?? 0;
  const promptEvalCount = responseJson.prompt_eval_count ?? 0;
  const promptEvalDurationNs = responseJson.prompt_eval_duration ?? 0;
  const totalDurationNs = responseJson.total_duration ?? 0;

  return {
    run: runNumber,
    eval_count: evalCount,
    eval_duration_ns: evalDurationNs,
    prompt_eval_count: promptEvalCount,
    prompt_eval_duration_ns: promptEvalDurationNs,
    total_duration_ns: totalDurationNs,
    tps: roundMetric(rateFromNs(evalCount, evalDurationNs)),
    prefill_tps: roundMetric(rateFromNs(promptEvalCount, promptEvalDurationNs)),
    json_valid: jsonValid,
    student_count_match: studentCountMatch,
    truncated: jsonValid && !studentCountMatch,
  };
}

function refreshTruncationFlags(results, baselines) {
  for (const result of results) {
    const baselinePromptEvalCount = baselines.get(result.students);
    const threshold = baselinePromptEvalCount ? baselinePromptEvalCount * 0.95 : null;

    for (const run of result.runs) {
      const promptWasTruncated = threshold !== null
        && result.ctx !== 8192
        && run.prompt_eval_count < threshold;
      const jsonWasTruncated = run.json_valid && !run.student_count_match;
      run.truncated = jsonWasTruncated || promptWasTruncated;
    }

    result.truncated = result.runs.some((run) => run.truncated)
      || (threshold !== null && result.ctx !== 8192 && result.prompt_eval_count < threshold);
    result.all_json_valid = result.runs.every((run) => run.json_valid);
  }
}

async function saveResults(results, outputPath) {
  await Bun.write(outputPath, `${JSON.stringify(results, null, 2)}\n`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(HELP_TEXT);
    return;
  }

  const sourceStudents = await Bun.file(new URL('./test-students.json', import.meta.url)).json();
  const anchors = generateScoringAnchors(TEST_RUBRIC);
  const outputPath = resolveOutputPath(config.output);
  const results = [];
  const baselines = new Map();
  const orderedCtxValues = sortCtxValues(config.ctx);
  const orderedStudentCounts = [...config.students].sort((left, right) => left - right);

  let previousCtx = null;

  for (const ctx of orderedCtxValues) {
    const warmupStudents = buildStudents(sourceStudents, 1);
    const warmupPrompt = buildBatchPrompt(TEST_RUBRIC, warmupStudents, anchors);

    if (previousCtx !== ctx) {
      for (let warmupIndex = 0; warmupIndex < config.warmup; warmupIndex += 1) {
        await callOllama({
          url: config.url,
          model: config.model,
          promptText: warmupPrompt,
          ctx,
          seed: config.seed,
          timeoutMs: config.timeoutMs,
        });

        console.log(`[ctx=${ctx} warmup ${warmupIndex + 1}/${config.warmup}] complete`);
      }
    }

    for (const studentCount of orderedStudentCounts) {
      const students = buildStudents(sourceStudents, studentCount);
      const promptText = buildBatchPrompt(TEST_RUBRIC, students, anchors);
      const runs = [];

      for (let runNumber = 1; runNumber <= config.runs; runNumber += 1) {
        const responseJson = await callOllama({
          url: config.url,
          model: config.model,
          promptText,
          ctx,
          seed: config.seed,
          timeoutMs: config.timeoutMs,
        });

        const runResult = summarizeRun(runNumber, responseJson, studentCount);
        runs.push(runResult);
        console.log(
          `[ctx=${ctx} students=${studentCount} run ${runNumber}/${config.runs}] tps=${formatRate(runResult.tps)} prefill=${formatRate(runResult.prefill_tps)}`,
        );
      }

      const result = {
        ctx,
        students: studentCount,
        flash_attention: false,
        runs,
        median_tps: roundMetric(median(runs.map((run) => run.tps))),
        median_prefill_tps: roundMetric(median(runs.map((run) => run.prefill_tps))),
        prompt_eval_count: Math.round(median(runs.map((run) => run.prompt_eval_count))),
        truncated: runs.some((run) => run.truncated),
        all_json_valid: runs.every((run) => run.json_valid),
        timestamp: new Date().toISOString(),
      };

      if (ctx === 8192) {
        baselines.set(studentCount, result.prompt_eval_count);
      }

      results.push(result);
      refreshTruncationFlags(results, baselines);
      await saveResults(results, outputPath);
    }

    previousCtx = ctx;
  }
}

main().catch((error) => {
  console.error(`FATAL: ${error.message}`);
  process.exit(1);
});
