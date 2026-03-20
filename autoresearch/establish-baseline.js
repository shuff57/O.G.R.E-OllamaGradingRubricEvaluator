import { access, readFile, writeFile } from 'node:fs/promises';
import { GRADING_PHILOSOPHY, SCORING_SCALE_DESCRIPTORS } from '../grading-server/grading-constants.js';
import { loadGoldStandard } from './data-loader.js';
import { runEvaluation } from './eval-harness.js';

const OUTPUT_PATH = new URL('./baseline-metric.json', import.meta.url);
const GOLD_STANDARD_PATH =
  '/home/shuff57/Documents/GitHub/shuff57-llm-finetune/ogre/test-data/sonnet-gold-standard-post-patch.json';
const MODEL = 'claude-sonnet-4.6';

function hasFiniteComposite(metricDoc) {
  return Number.isFinite(metricDoc?.metric?.composite)
    && metricDoc.metric.composite >= 0
    && metricDoc.metric.composite <= 1;
}

function printSummary(metricDoc, label) {
  const metric = metricDoc.metric;
  console.log(`\n${label}`);
  console.log(`model: ${metricDoc.model}`);
  console.log(`timestamp: ${metricDoc.timestamp}`);
  console.log(`composite: ${metric.composite}`);
  console.log('components:', JSON.stringify(metric.components, null, 2));
  console.log(`promptLength: ${metric.promptLength}`);
  console.log(`totalCostEstimate: $${metric.totalCostEstimate}`);
}

async function readExistingBaseline() {
  try {
    await access(OUTPUT_PATH);
  } catch {
    return null;
  }

  const text = await readFile(OUTPUT_PATH, 'utf-8');
  const parsed = JSON.parse(text);

  if (!hasFiniteComposite(parsed)) {
    throw new Error('Existing baseline-metric.json is present but malformed (missing finite metric.composite in [0,1]).');
  }

  return parsed;
}

async function main() {
  const existing = await readExistingBaseline();
  if (existing) {
    printSummary(existing, 'Baseline already exists; reusing existing metric (idempotent path).');
    return;
  }

  const baselineConstants = {
    gradingPhilosophy: GRADING_PHILOSOPHY,
    scoringScaleDescriptors: SCORING_SCALE_DESCRIPTORS,
  };

  const goldData = await loadGoldStandard(GOLD_STANDARD_PATH);

  const config = {
    model: MODEL,
    runs: 3,
    maxConcurrent: 5,
    timeout: 60000,
  };

  const metric = await runEvaluation(baselineConstants, goldData, config);

  const payload = {
    timestamp: new Date().toISOString(),
    constants: baselineConstants,
    metric,
    model: MODEL,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  printSummary(payload, 'Baseline established from current grading constants.');
}

main().catch((error) => {
  console.error(`establish-baseline failed: ${error?.message ?? error}`);
  process.exit(1);
});
