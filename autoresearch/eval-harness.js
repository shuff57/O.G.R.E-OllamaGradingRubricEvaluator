import { readFile } from 'node:fs/promises';
import { buildSingleGradePrompt } from '../grading-server/grading.js';
import {
  computeGenerosityShift,
  computeRunVariance,
  computeEdgeCaseReliability,
  computeWithin1Rate,
  computePromptConciseness,
  computeComposite,
} from './metrics.js';

const CAPTURED_RUBRIC_PATH = '/home/shuff57/Documents/GitHub/shuff57-llm-finetune/ogre/test-data/captured-rubric.json';
const CAPTURED_STUDENTS_PATH = '/home/shuff57/Documents/GitHub/shuff57-llm-finetune/ogre/test-data/captured-students.json';

const COPILOT_AUTH_PATH = '/home/shuff57/.local/share/opencode/auth.json';
const COPILOT_BASE_URL = 'https://api.githubcopilot.com/chat/completions';
const COPILOT_MODEL = 'claude-sonnet-4.6';

const DEFAULT_CONFIG = {
  model: 'claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
  runs: 3,
  maxConcurrent: 5,
  timeout: 60000,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createLimiter(maxConcurrent) {
  const limit = Math.max(1, Number(maxConcurrent) || 1);
  let activeCount = 0;
  const queue = [];

  const runNext = () => {
    if (activeCount >= limit || queue.length === 0) return;
    const task = queue.shift();
    activeCount += 1;

    Promise.resolve()
      .then(task.fn)
      .then(task.resolve, task.reject)
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    runNext();
  });
}

function withTimeout(promise, timeoutMs) {
  const timeout = Math.max(1, Number(timeoutMs) || 1);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timeout after ${timeout}ms`)), timeout);
  });
  return Promise.race([promise, timeoutPromise]);
}

async function loadCapturedData() {
  const [rubricText, studentsText] = await Promise.all([
    readFile(CAPTURED_RUBRIC_PATH, 'utf-8'),
    readFile(CAPTURED_STUDENTS_PATH, 'utf-8'),
  ]);

  const rubric = JSON.parse(rubricText);
  const students = JSON.parse(studentsText);
  return { rubric, students };
}

function matchCapturedStudent(student, capturedStudents) {
  return (
    capturedStudents.find((entry) => entry.index === student.index)
    ?? capturedStudents.find((entry) => entry.name === student.name)
    ?? null
  );
}

async function loadCopilotToken() {
  try {
    const raw = await readFile(COPILOT_AUTH_PATH, 'utf-8');
    const auth = JSON.parse(raw);
    const token = auth?.['github-copilot']?.access;
    if (!token) throw new Error('No github-copilot access token in auth.json');
    return token;
  } catch (err) {
    throw new Error(`Cannot load Copilot token from ${COPILOT_AUTH_PATH}: ${err.message}`);
  }
}

async function callCopilot(prompt) {
  const token = await loadCopilotToken();

  const response = await fetch(COPILOT_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Copilot-Integration-Id': 'vscode-chat',
      'editor-version': 'vscode/1.85.0',
    },
    body: JSON.stringify({
      model: COPILOT_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Copilot request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Copilot response missing content');
  return content;
}

async function callAnthropic(prompt, config) {
  if (!config.apiKey) {
    throw new Error('Missing Anthropic API key');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model ?? DEFAULT_CONFIG.model,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const textBlock = data?.content?.find?.((block) => block?.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Anthropic response missing text content');
  }
  return textBlock.text;
}

async function invokeLlm(prompt, config, llmProvider) {
  if (llmProvider) {
    return llmProvider(prompt);
  }
  // Use GitHub Copilot (claude-sonnet-4.6) if no Anthropic key — no config needed
  if (!config.apiKey) {
    return callCopilot(prompt);
  }
  return callAnthropic(prompt, config);
}

async function gradeOnce({ prompt, config, llmProvider }) {
  const responseText = await withTimeout(invokeLlm(prompt, config, llmProvider), config.timeout);
  return parseScore(responseText);
}

async function gradeWithRetries({ prompt, config, llmProvider }) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const score = await gradeOnce({ prompt, config, llmProvider });
      if (typeof score === 'number' && Number.isFinite(score)) {
        return { score, error: null };
      }
      lastError = new Error('Invalid or missing score');
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts) {
      const delay = 150 * (2 ** (attempt - 1));
      await sleep(delay);
    }
  }

  return { score: null, error: lastError?.message ?? 'Unknown grading error' };
}

function buildEdgeIndices(goldData) {
  const indices = [];
  goldData.forEach((student, idx) => {
    if (student.goldScore <= 2 || student.goldScore >= 9) {
      indices.push(idx);
    }
  });
  return indices;
}

function estimateCostUSD(prompts, responses) {
  const inChars = prompts.reduce((sum, text) => sum + (text?.length ?? 0), 0);
  const outChars = responses.reduce((sum, text) => sum + (text?.length ?? 0), 0);
  const inputTokens = inChars / 4;
  const outputTokens = outChars / 4;

  const inputCostPerM = 3.0;
  const outputCostPerM = 15.0;
  const cost = (inputTokens / 1_000_000) * inputCostPerM + (outputTokens / 1_000_000) * outputCostPerM;
  return Number(cost.toFixed(6));
}

export function parseScore(llmResponseText) {
  if (typeof llmResponseText !== 'string') return null;

  try {
    const parsed = JSON.parse(llmResponseText);
    const value = parsed?.score;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function runEvaluation(constants, goldData, config, llmProvider = null) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const { rubric, students: capturedStudents } = await loadCapturedData();
  const limiter = createLimiter(mergedConfig.maxConcurrent);

  const perStudent = goldData.map((student) => ({
    index: student.index,
    name: student.name,
    goldScore: student.goldScore,
    predictedScores: Array.from({ length: mergedConfig.runs }, () => null),
    mean: null,
    error: null,
  }));

  const runScores = Array.from({ length: mergedConfig.runs }, () => Array(goldData.length).fill(null));
  const prompts = [];
  const llmRawResponses = [];
  let promptLengthTotal = 0;
  let promptCount = 0;

  const jobs = [];
  for (let studentIdx = 0; studentIdx < goldData.length; studentIdx += 1) {
    const student = goldData[studentIdx];
    const matched = matchCapturedStudent(student, capturedStudents);
    const studentWork = matched?.response ?? '';
    const prompt = buildSingleGradePrompt(rubric, studentWork, '', constants);
    promptLengthTotal += prompt.length;
    promptCount += 1;

    for (let run = 0; run < mergedConfig.runs; run += 1) {
      jobs.push(limiter(async () => {
        prompts.push(prompt);
        const graded = await gradeWithRetries({ prompt, config: mergedConfig, llmProvider });
        runScores[run][studentIdx] = graded.score;
        perStudent[studentIdx].predictedScores[run] = graded.score;
        if (graded.error) {
          perStudent[studentIdx].error = graded.error;
        }

        if (typeof graded.score === 'number') {
          llmRawResponses.push(JSON.stringify({ score: graded.score }));
        }
      }));
    }
  }

  await Promise.all(jobs);

  for (let i = 0; i < perStudent.length; i += 1) {
    const validScores = perStudent[i].predictedScores.filter((score) => typeof score === 'number' && Number.isFinite(score));
    perStudent[i].mean = mean(validScores);
  }

  const predictedMeans = perStudent.map((student) => (typeof student.mean === 'number' ? student.mean : student.goldScore));
  const goldScores = goldData.map((student) => student.goldScore);
  const edgeIndices = buildEdgeIndices(goldData);
  const promptLength = promptCount > 0 ? Math.round(promptLengthTotal / promptCount) : 0;
  const promptConciseness = computePromptConciseness(promptLength, promptLength || 1);

  const components = {
    generosityShift: computeGenerosityShift(predictedMeans, goldScores),
    runVariance: computeRunVariance(runScores),
    edgeCaseReliability: computeEdgeCaseReliability(runScores, edgeIndices),
    within1Rate: computeWithin1Rate(predictedMeans, goldScores),
    promptConciseness,
  };

  return {
    composite: computeComposite(components),
    components,
    perStudent,
    promptLength,
    totalCostEstimate: estimateCostUSD(prompts, llmRawResponses),
  };
}

export async function runGeneralizationCheck(constants, jsonlSamples, config, llmProvider = null) {
  const grouped = {};

  for (const sample of jsonlSamples ?? []) {
    const key = sample.rubricType ?? 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sample);
  }

  const details = {};
  let passedCheck = true;

  for (const [rubricType, samples] of Object.entries(grouped)) {
    const predictions = [];
    const baselines = [];

    for (const sample of samples.slice(0, 3)) {
      const prompt = buildSingleGradePrompt(
        sample.rubric ?? { essayPrompt: sample.rubricPrompt ?? '', maxScore: '10', checklistItems: [], rubricItems: [] },
        sample.studentResponse ?? '',
        '',
        constants,
      );

      const graded = await gradeWithRetries({ prompt, config: { ...DEFAULT_CONFIG, ...(config ?? {}) }, llmProvider });
      if (typeof graded.score === 'number') predictions.push(graded.score);
      if (typeof sample.baselineScore === 'number') baselines.push(sample.baselineScore);
      else if (typeof sample.goldScore === 'number') baselines.push(sample.goldScore);
    }

    const predictedMean = mean(predictions) ?? 0;
    const baselineMean = mean(baselines) ?? 0;
    const regression = baselineMean - predictedMean;
    const pass = regression <= 2;
    if (!pass) passedCheck = false;

    details[rubricType] = {
      predictedMean,
      baselineMean,
      regression,
      pass,
      samplesEvaluated: Math.min(samples.length, 3),
    };
  }

  return { passedCheck, details };
}
