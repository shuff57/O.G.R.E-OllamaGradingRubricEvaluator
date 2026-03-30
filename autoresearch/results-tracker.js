import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';

const TSV_HEADER =
  'iteration\tcomposite\tgenerosity\tvariance\tedge_cases\twithin1\tconciseness\tprompt_len\tstatus\tdescription\n';
const DEFAULT_SNAPSHOTS_DIR = 'autoresearch/snapshots';

const SONNET_INPUT_PRICE_PER_TOKEN = 3 / 1_000_000;
const SONNET_OUTPUT_PRICE_PER_TOKEN = 15 / 1_000_000;

let _runningCost = 0;
let _apiCallCount = 0;

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function roundTo4(value) {
  return Number(value.toFixed(4));
}

function formatTo4(value) {
  return Number(value ?? 0).toFixed(4);
}

function sanitizeField(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

function parseNumber(value) {
  return Number.parseFloat(value);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runGit(command) {
  return execSync(command, { encoding: 'utf8' }).trim();
}

export function initResultsTSV(path) {
  if (existsSync(path)) {
    return;
  }

  ensureParentDir(path);
  writeFileSync(path, TSV_HEADER);
}

export function appendResult(path, result) {
  initResultsTSV(path);

  const row = [
    result.iteration,
    formatTo4(result.composite),
    formatTo4(result.components.generosityShift),
    formatTo4(result.components.runVariance),
    formatTo4(result.components.edgeCaseReliability),
    formatTo4(result.components.within1Rate),
    formatTo4(result.components.promptConciseness),
    result.promptLength,
    sanitizeField(result.status),
    sanitizeField(result.description),
  ].join('\t');

  appendFileSync(path, `${row}\n`);
}

export function readResults(path) {
  if (!existsSync(path)) {
    return [];
  }

  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  return lines.slice(1).map((line) => {
    const [
      iteration,
      composite,
      generosity,
      variance,
      edgeCases,
      within1,
      conciseness,
      promptLength,
      status,
      description,
    ] = line.split('\t');

    return {
      iteration: Number.parseInt(iteration, 10),
      composite: parseNumber(composite),
      components: {
        generosityShift: parseNumber(generosity),
        runVariance: parseNumber(variance),
        edgeCaseReliability: parseNumber(edgeCases),
        within1Rate: parseNumber(within1),
        promptConciseness: parseNumber(conciseness),
      },
      promptLength: Number.parseInt(promptLength, 10),
      status,
      description,
    };
  });
}

function nextSnapshotIndex() {
  mkdirSync(DEFAULT_SNAPSHOTS_DIR, { recursive: true });
  const existing = readdirSync(DEFAULT_SNAPSHOTS_DIR)
    .map(f => f.match(/^iteration-(\d+)\.json$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  return existing.length ? Math.max(...existing) + 1 : 1;
}

export function saveSnapshot(constants, metric, iteration) {
  mkdirSync(DEFAULT_SNAPSHOTS_DIR, { recursive: true });
  const idx = nextSnapshotIndex();
  const snapshotPath = join(DEFAULT_SNAPSHOTS_DIR, `iteration-${idx}.json`);
  const snapshot = {
    iteration,
    timestamp: new Date().toISOString(),
    constants,
    metric,
  };

  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  return snapshotPath;
}

export function loadBestSnapshot(snapshotsDir = DEFAULT_SNAPSHOTS_DIR) {
  if (!existsSync(snapshotsDir)) {
    return null;
  }

  const snapshotFiles = readdirSync(snapshotsDir)
    .filter((file) => /^iteration-\d+\.json$/.test(file))
    .map((file) => join(snapshotsDir, file));

  if (snapshotFiles.length === 0) {
    return null;
  }

  return snapshotFiles
    .map((filePath) => JSON.parse(readFileSync(filePath, 'utf8')))
    .reduce((best, current) => {
      if (!best) {
        return current;
      }

      return (current.metric?.composite ?? Number.NEGATIVE_INFINITY) >
        (best.metric?.composite ?? Number.NEGATIVE_INFINITY)
        ? current
        : best;
    }, null);
}

export function loadSnapshot(iteration) {
  const snapshotPath = join(DEFAULT_SNAPSHOTS_DIR, `iteration-${iteration}.json`);
  if (!existsSync(snapshotPath)) {
    return null;
  }

  return JSON.parse(readFileSync(snapshotPath, 'utf8'));
}

export function createResearchBranch(tag) {
  runGit(`git checkout -b ${shellQuote(`autoresearch/${tag}`)}`);
}

export function commitAndAdvance(message, files) {
  const quotedFiles = files.map(shellQuote).join(' ');
  runGit(`git add -- ${quotedFiles}`);
  runGit(`git commit -m ${shellQuote(message)}`);
  return getCurrentCommitHash();
}

export function revertToLastAdvance() {
  runGit('git reset --hard HEAD');
}

export function getCurrentCommitHash() {
  return runGit('git rev-parse --short HEAD');
}

export function trackAPICall(inputTokens, outputTokens) {
  _runningCost +=
    inputTokens * SONNET_INPUT_PRICE_PER_TOKEN + outputTokens * SONNET_OUTPUT_PRICE_PER_TOKEN;
  _apiCallCount += 1;
}

export function getRunningCost() {
  return {
    estimatedCost: Number(_runningCost.toFixed(6)),
    apiCallCount: _apiCallCount,
  };
}

export function resetCostTracking() {
  _runningCost = 0;
  _apiCallCount = 0;
}

export {
  SONNET_INPUT_PRICE_PER_TOKEN,
  SONNET_OUTPUT_PRICE_PER_TOKEN,
  roundTo4,
};
