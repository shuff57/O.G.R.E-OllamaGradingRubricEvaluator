/**
 * O.G.R.E. Multi-Model Consistency Benchmark
 * ==========================================
 * 
 * PURPOSE:
 * Runs consistency benchmarks across multiple LLM models to evaluate how consistently
 * the O.G.R.E. grading server assigns scores to student responses.
 * 
 * PREREQUISITES:
 * - O.G.R.E. grading server running on localhost:3456
 * - Ollama running with required models pulled
 * - Provider configs defined in ogre-server.json
 * 
 * DATA PREPARATION:
 * 1. Paste real student responses into: test-data/captured-students.json
 * 2. Paste grading rubric into: test-data/captured-rubric.json
 * 
 * USAGE:
 *   bun run test-data/run-benchmark.js
 * 
 * OUTPUT:
 * - Raw benchmark data: test-data/benchmark-results.json
 * - Human-readable report: test-data/benchmark-report.md
 * 
 * KNOWN LIMITATIONS:
 * - First run of each Ollama model may be slower (cold VRAM load)
 * - Outlier detection runs on every request — raw (pre-adjustment) scores are used
 *   for consistency metrics
 */

const CONFIG = {
  models: [
    { provider: 'ollama',     model: 'glm-5:cloud',                label: 'GLM-5'/*,           customInstructions: 'When a student demonstrates partial understanding or addresses most criteria with minor gaps, give proportional partial credit for what they got right. In the 4-7 range especially, do not penalize incompleteness too harshly — a response that covers most criteria reasonably well should receive credit for what is addressed. Err slightly toward recognizing demonstrated understanding rather than penalizing for what is missing.' */},
    { provider: 'ollama',     model: 'kimi-k2.5:cloud',            label: 'Kimi-K2.5'        },
    { provider: 'ollama',     model: 'minimax-m2.5:cloud',         label: 'Minimax-M2.5'/*,    customInstructions: 'Be strict with partial credit. Only award points when a criterion is clearly and explicitly addressed. Vague or incomplete responses in the 2-5 range should NOT be rounded up — if the student barely addresses a criterion, give half credit or less. Truly excellent responses that address all criteria thoroughly deserve 9-10. Do not compress scores toward the middle — let weak responses score low and strong responses score high.' */},
    { provider: 'ollama',     model: 'gemini-3-flash-preview:cloud', label: 'Gemini 3 Flash'  },
    { provider: 'ollama',     model: 'deepseek-v3.2:cloud',        label: 'DeepSeek 3.2'     },
    { provider: 'ollama',     model: 'qwen3.5:397b-cloud',         label: 'Qwen 3.5 397B'    },
    { provider: 'ollama',     model: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3'  },
    { provider: 'ollama',     model: 'gpt-oss:120b-cloud',         label: 'GPT-OSS 120B'     },
    { provider: 'ollama-local', model: 'qwen35-nothink:latest',      label: 'Qwen35-9B'        },
    { provider: 'ollama-local', model: 'qwen3.5:9b',                 label: 'Qwen35-Think'     },
    { provider: 'ollama-local', model: 'qwen3.5-9B-stat-grader-think:latest', label: 'Qwen35-FT-Think' },
    { provider: 'ollama-local', model: 'qwen314b-nothink:latest',   label: 'Qwen314B'         },
    { provider: 'ollama-local', model: 'qwen3.5-9B-stat-grader:latest', label: 'Qwen35-FT'        },
    { provider: 'anthropic',  model: 'claude-haiku-4-5',           label: 'Haiku 4.5'        },
    { provider: 'anthropic',  model: 'claude-sonnet-4-6',          label: 'Sonnet 4.6'       },
  ],
  runsPerModel: 3,
  tolerance: 1,        // ±1 point for "agreement"
  delayMs: 3000,      // Between requests
  timeoutMs: 300000,  // 5 min per request
  serverUrl: 'http://localhost:3456',
  chunkSize: 30,
  sweep: 'none',
  inputStudents: 'test-data/captured-students.json',
  inputRubric: 'test-data/captured-rubric.json',
  outputResults: 'test-data/benchmark-results.json',
  outputReport: 'test-data/benchmark-report.md',
};

// Dataset presets for different subject areas
const DATASETS = {
  stats:   { rubric: 'test-data/captured-rubric.json',        students: 'test-data/captured-students.json' },
  biology: { rubric: 'test-data/test-biology-rubric.json',    students: 'test-data/test-biology-students.json' },
  history: { rubric: 'test-data/test-history-rubric.json',    students: 'test-data/test-history-students.json' },
};

// --only=<label> filter (e.g. node run-benchmark.js --only=Mistral)
const _onlyArg = process.argv.find(a => a.startsWith('--only='));
if (_onlyArg) {
  const _labels = _onlyArg.slice(7).split(',').map(s => s.toLowerCase());
  CONFIG.models = CONFIG.models.filter(m => _labels.some(l => m.label.toLowerCase().includes(l)));
}

// --dataset=<name> selector (e.g. --dataset=biology)
const _datasetArg = process.argv.find(a => a.startsWith('--dataset='));
if (_datasetArg) {
  const _dsName = _datasetArg.slice(10);
  if (!DATASETS[_dsName]) {
    console.error(`Unknown dataset '${_dsName}'. Available: ${Object.keys(DATASETS).join(', ')}`);
    process.exit(1);
  }
  CONFIG.inputRubric   = DATASETS[_dsName].rubric;
  CONFIG.inputStudents = DATASETS[_dsName].students;
}

// --chunkSize=<number> override for local/small models that need smaller batches (e.g. --chunkSize=5)
const _chunkArg = process.argv.find(a => a.startsWith('--chunkSize='));
if (_chunkArg) {
  CONFIG.chunkSize = parseInt(_chunkArg.slice(12));
  console.log(`[config] chunkSize overridden to ${CONFIG.chunkSize}`);
}

// --runs=<number> override for number of runs per model (e.g. --runs=1 for quick benchmarks)
const _runsArg = process.argv.find(a => a.startsWith('--runs='));
if (_runsArg) {
  CONFIG.runsPerModel = parseInt(_runsArg.slice(7));
  console.log(`[config] runsPerModel overridden to ${CONFIG.runsPerModel}`);
}

// --tolerance=<number> override (e.g. --tolerance=0.5)
const _tolArg = process.argv.find(a => a.startsWith('--tolerance='));
if (_tolArg) CONFIG.tolerance = parseFloat(_tolArg.slice(12));

// --timeout=<ms> override (e.g. --timeout=600000 for 10 min)
const _timeoutArg = process.argv.find(a => a.startsWith('--timeout='));
if (_timeoutArg) CONFIG.timeoutMs = parseInt(_timeoutArg.slice(10));

// --output=<path> override for results JSON (report gets same path with .md)
const _outputArg = process.argv.find(a => a.startsWith('--output='));
if (_outputArg) {
  CONFIG.outputResults = _outputArg.slice(9);
  CONFIG.outputReport  = _outputArg.slice(9).replace(/\.json$/, '.md');
}

// --custom=<instructions> apply custom instructions to ALL models in this run (T15 override testing)
const _customArg = process.argv.find(a => a.startsWith('--custom='));
if (_customArg) {
  const _customText = _customArg.slice(9);
  CONFIG.models = CONFIG.models.map(m => ({ ...m, customInstructions: _customText }));
  console.log(`[config] Custom instructions applied to all models: ${_customText.slice(0, 60)}...`);
}

// --resume: load existing output and skip models that already have successful runs
const _resumeFlag = process.argv.includes('--resume');

const fs = await import('fs');

// ── Helpers ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
}

// ── 1. Preflight: health check + auth ──
async function preflight() {
  console.log('Preflight checks...');

  // Health check
  try {
    const hRes = await fetch(`${CONFIG.serverUrl}/health`);
    if (!hRes.ok) throw new Error(`status ${hRes.status}`);
    console.log('  [health] Server is running');
  } catch (err) {
    throw new Error(`Server not reachable at ${CONFIG.serverUrl}: ${err.message}`);
  }

  // Handshake
  const hsRes = await fetch(`${CONFIG.serverUrl}/api/handshake`);
  if (!hsRes.ok) throw new Error(`Handshake failed: ${hsRes.status}`);
  const { token } = await hsRes.json();
  console.log(`  [auth] Token: ${token.slice(0, 8)}...`);
  return token;
}

// ── 2. Load inputs ──
function loadInputs() {
  console.log('Loading inputs...');

  const studentsRaw = fs.readFileSync(CONFIG.inputStudents, 'utf-8');
  const students = JSON.parse(studentsRaw);
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error(`${CONFIG.inputStudents} must be a non-empty array`);
  }
  console.log(`  [students] ${students.length} loaded`);

  const rubricRaw = fs.readFileSync(CONFIG.inputRubric, 'utf-8');
  const rubric = JSON.parse(rubricRaw);
  if (!rubric.essayPrompt) throw new Error('Rubric missing essayPrompt');
  if (!rubric.maxScore) throw new Error('Rubric missing maxScore');
  console.log(`  [rubric] maxScore=${rubric.maxScore}`);

  return { students, rubric };
}

// ── 3. Single grading run ──
async function gradeOnce(modelConfig, token, rubric, students) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch(`${CONFIG.serverUrl}/api/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider: modelConfig.provider,
        model: modelConfig.model,
        rubric,
        students,
        chunkSize: CONFIG.chunkSize,
        sweep: CONFIG.sweep,
        ...(modelConfig.customInstructions ? { customInstructions: modelConfig.customInstructions } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    // Parse SSE stream (same pattern as run-baseline.js)
    const allChunkResults = [];
    const outlierAdjustments = [];
    let doneData = null;

    const text = await res.text();
    const lines = text.split('\n');
    let currentEvent = null;
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      } else if (line.trim() === '' && currentEvent && currentData) {
        try {
          const parsed = JSON.parse(currentData);

          if (currentEvent === 'chunk') {
            allChunkResults.push(...parsed.results);
          } else if (currentEvent === 'outlier') {
            outlierAdjustments.push(...parsed.adjustedResults);
          } else if (currentEvent === 'done') {
            doneData = parsed;
          } else if (currentEvent === 'error') {
            throw new Error(`Server error: ${parsed.message}`);
          }
        } catch (e) {
          if (e.message.startsWith('Server error:')) throw e;
          // Skip malformed SSE data
        }
        currentEvent = null;
        currentData = '';
      }
    }

    const elapsed = Date.now() - startTime;

    // Build results — track rawScore (pre-outlier) and score (post-outlier)
    const results = allChunkResults.map(r => {
      const student = students.find(s => s.index === r.studentIndex);
      return {
        studentIndex: r.studentIndex,
        name: student?.name || `Student ${r.studentIndex}`,
        rawScore: r.score,  // pre-outlier
        score: r.score,     // will be overwritten if adjusted
        adjusted: false,
      };
    });

    // Apply outlier adjustments
    for (const adj of outlierAdjustments) {
      const r = results.find(x => x.studentIndex === adj.studentIndex);
      if (r) {
        r.score = adj.score;
        r.adjusted = true;
      }
    }

    results.sort((a, b) => a.studentIndex - b.studentIndex);

    return { elapsed, stats: doneData?.stats || null, results };
  } finally {
    clearTimeout(timeout);
  }
}

// ── 4. Benchmark main loop ──
async function runBenchmark(token, rubric, students, savedResults = {}) {
  const totalModels = CONFIG.models.length;
  const allResults = { ...savedResults };  // Seed with any saved data

  for (let mi = 0; mi < totalModels; mi++) {
    const mc = CONFIG.models[mi];

    // Resume: skip models that already have at least one successful run saved
    if (allResults[mc.label]?.some(r => r !== null)) {
      const nOk = allResults[mc.label].filter(r => r !== null).length;
      console.log(`\n[Skip] ${mc.label} — using ${nOk} saved run(s)`);
      continue;
    }

    allResults[mc.label] = [];

    for (let ri = 0; ri < CONFIG.runsPerModel; ri++) {
      console.log(`\n[Model ${mi + 1}/${totalModels}] [Run ${ri + 1}/${CONFIG.runsPerModel}] ${mc.label} \u2014 grading ${students.length} students...`);

      let runFailed = false;
      try {
        const result = await gradeOnce(mc, token, rubric, students);
        allResults[mc.label].push(result);
        const m = result.stats?.mean?.toFixed(2) ?? 'N/A';
        const sd = result.stats?.stdDev?.toFixed(2) ?? 'N/A';
        console.log(`  Done in ${(result.elapsed / 1000).toFixed(1)}s \u2014 mean=${m} stdDev=${sd}`);
      } catch (err) {
        runFailed = true;
        console.error(`  FAILED: ${err.message}`);
        allResults[mc.label].push(null);
      }

      // Sleep between requests — longer after failures to let server stabilize
      const delay = runFailed ? 30000 : CONFIG.delayMs;
      if (ri < CONFIG.runsPerModel - 1 || mi < totalModels - 1) {
        if (runFailed) console.log(`  (waiting ${delay / 1000}s after failure...)`);
        await sleep(delay);
      }
    }  // end ri loop

    // Incremental save after each model — preserves data if server crashes mid-run
    {
      const partialStats = computeStats(allResults, students);
      const partialData = {
        timestamp: new Date().toISOString(),
        config: {
          models: CONFIG.models.map(m => m.label),
          runsPerModel: CONFIG.runsPerModel,
          tolerance: CONFIG.tolerance,
          chunkSize: CONFIG.chunkSize,
          sweep: CONFIG.sweep,
          studentCount: students.length,
        },
        stats: partialStats,
        rawResults: allResults,
      };
      saveResults(partialData);
    }
  }

  return allResults;
}

// ── 5. Compute statistics ──
function computeStats(allResults, students) {
  const modelLabels = Object.keys(allResults);

  // Per-model stats
  const perModel = {};
  for (const label of modelLabels) {
    const runs = allResults[label].filter(Boolean);
    const meanScores = runs.map(r => mean(r.results.map(s => s.rawScore)));
    perModel[label] = {
      successfulRuns: runs.length,
      totalRuns: CONFIG.runsPerModel,
      meanScore: mean(meanScores),
      stdDev: stdDev(meanScores),
      runToRunVariance: runs.length >= 2 ? stdDev(meanScores) ** 2 : 0,
    };
  }

  // Per-student: mean rawScore per model across runs
  const studentIndices = students.map(s => s.index);
  const perStudent = {};
  for (const idx of studentIndices) {
    const student = students.find(s => s.index === idx);
    perStudent[idx] = { name: student?.name || `Student ${idx}`, models: {} };

    for (const label of modelLabels) {
      const runs = allResults[label].filter(Boolean);
      const scores = runs
        .map(r => r.results.find(s => s.studentIndex === idx))
        .filter(Boolean)
        .map(s => s.rawScore);
      perStudent[idx].models[label] = scores.length ? mean(scores) : null;
    }
  }

  // Agreement: for each model pair, % of students where |meanA - meanB| <= tolerance
  const agreement = {};
  for (let i = 0; i < modelLabels.length; i++) {
    for (let j = i + 1; j < modelLabels.length; j++) {
      const a = modelLabels[i];
      const b = modelLabels[j];
      let agreeCount = 0;
      let comparableCount = 0;

      for (const idx of studentIndices) {
        const scoreA = perStudent[idx].models[a];
        const scoreB = perStudent[idx].models[b];
        if (scoreA !== null && scoreB !== null) {
          comparableCount++;
          if (Math.abs(scoreA - scoreB) <= CONFIG.tolerance) agreeCount++;
        }
      }

      const key = `${a} vs ${b}`;
      agreement[key] = {
        agreementPct: comparableCount ? (agreeCount / comparableCount) * 100 : 0,
        agreeCount,
        comparableCount,
      };
    }
  }

  // Flagged: students where max - min across models >= 3
  const flagged = [];
  for (const idx of studentIndices) {
    const scores = modelLabels
      .map(l => perStudent[idx].models[l])
      .filter(v => v !== null);
    if (scores.length >= 2) {
      const spread = Math.max(...scores) - Math.min(...scores);
      if (spread >= 3) {
        flagged.push({
          studentIndex: idx,
          name: perStudent[idx].name,
          spread: Math.round(spread * 100) / 100,
          scores: Object.fromEntries(
            modelLabels.map(l => [l, perStudent[idx].models[l]])
          ),
        });
      }
    }
  }

  return { perModel, perStudent, agreement, flagged };
}

// ── 6. Save results ──
function saveResults(data) {
  fs.writeFileSync(CONFIG.outputResults, JSON.stringify(data, null, 2));
  console.log(`\nResults saved to ${CONFIG.outputResults}`);
}

// ── 7. Generate markdown report ──
function generateReport(data) {
  const { config, stats } = data;
  const { perModel, perStudent, agreement, flagged } = stats;
  const modelLabels = Object.keys(perModel);
  const studentIndices = Object.keys(perStudent).map(Number).sort((a, b) => a - b);
  const lines = [];

  // Section 1: Header
  lines.push('# O.G.R.E. Multi-Model Consistency Benchmark Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Models:** ${modelLabels.length} | **Runs per model:** ${config.runsPerModel} | **Students:** ${studentIndices.length}`);
  lines.push(`**Tolerance:** \u00b1${config.tolerance} | **Sweep:** ${config.sweep} | **Chunk size:** ${config.chunkSize}`);
  lines.push('');

  // Section 2: Per-Model Summary
  lines.push('## Per-Model Summary');
  lines.push('');
  lines.push('| Model | Runs | Mean Score | Std Dev | Run-to-Run Variance |');
  lines.push('|-------|------|-----------|---------|---------------------|');
  for (const label of modelLabels) {
    const m = perModel[label];
    lines.push(`| ${label} | ${m.successfulRuns}/${m.totalRuns} | ${m.meanScore.toFixed(2)} | ${m.stdDev.toFixed(2)} | ${m.runToRunVariance.toFixed(4)} |`);
  }
  lines.push('');

  // Section 3: Score Matrix (student × model)
  lines.push('## Score Matrix');
  lines.push('');
  const colWidths = [25, ...modelLabels.map(l => Math.max(l.length, 8))];
  const headerRow = ['Student'.padEnd(colWidths[0]), ...modelLabels.map((l, i) => l.padEnd(colWidths[i + 1]))];
  lines.push(`| ${headerRow.join(' | ')} |`);
  lines.push(`| ${colWidths.map(w => '-'.repeat(w)).join(' | ')} |`);
  for (const idx of studentIndices) {
    const name = perStudent[idx].name;
    const row = [name.padEnd(colWidths[0])];
    for (let i = 0; i < modelLabels.length; i++) {
      const v = perStudent[idx].models[modelLabels[i]];
      const cell = v !== null ? v.toFixed(1) : 'N/A';
      row.push(cell.padStart(colWidths[i + 1]));
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  // Section 4: Agreement
  lines.push('## Pairwise Agreement');
  lines.push('');
  lines.push(`Agreement = % of students where score difference \u2264 \u00b1${config.tolerance}`);
  lines.push('');
  lines.push('| Model Pair | Agreement | Agree/Total |');
  lines.push('|------------|-----------|-------------|');
  for (const [pair, a] of Object.entries(agreement)) {
    lines.push(`| ${pair} | ${a.agreementPct.toFixed(1)}% | ${a.agreeCount}/${a.comparableCount} |`);
  }
  lines.push('');

  // Section 5: Flagged Disagreements
  lines.push('## Flagged Disagreements');
  lines.push('');
  lines.push('Students where max\u2212min score spread \u2265 3 points across models:');
  lines.push('');
  if (flagged.length === 0) {
    lines.push('*No flagged disagreements.*');
  } else {
    lines.push('| Student | Spread | ' + modelLabels.join(' | ') + ' |');
    lines.push('|---------|--------|' + modelLabels.map(() => '--------|').join(''));
    for (const f of flagged) {
      const scores = modelLabels.map(l => f.scores[l] !== null ? f.scores[l].toFixed(1) : 'N/A');
      lines.push(`| ${f.name} | ${f.spread.toFixed(1)} | ${scores.join(' | ')} |`);
    }
  }
  lines.push('');

  const report = lines.join('\n');
  fs.writeFileSync(CONFIG.outputReport, report);
  console.log(`Report saved to ${CONFIG.outputReport}`);
}

// ── Main ──
async function main() {
  console.log('O.G.R.E. Consistency Benchmark');
  console.log('==============================');
  console.log('CONFIG:', JSON.stringify(CONFIG, null, 2));
  console.log('');

  const token = await preflight();
  const { students, rubric } = loadInputs();

  // Load saved results if --resume flag is set
  let savedResults = {};
  if (_resumeFlag && fs.existsSync(CONFIG.outputResults)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CONFIG.outputResults, 'utf-8'));
      savedResults = existing.rawResults || {};
      const nSaved = Object.values(savedResults).reduce((acc, runs) => acc + (runs?.filter(r => r !== null).length || 0), 0);
      console.log(`[Resume] Loaded ${nSaved} saved run(s) from ${CONFIG.outputResults}\n`);
    } catch (e) {
      console.warn(`[Resume] Could not load existing results: ${e.message}\n`);
    }
  }

  const rawResults = await runBenchmark(token, rubric, students, savedResults);
  const stats = computeStats(rawResults, students);

  const data = {
    timestamp: new Date().toISOString(),
    config: {
      models: CONFIG.models.map(m => m.label),
      runsPerModel: CONFIG.runsPerModel,
      tolerance: CONFIG.tolerance,
      chunkSize: CONFIG.chunkSize,
      sweep: CONFIG.sweep,
      studentCount: students.length,
    },
    stats,
    rawResults,
  };

  saveResults(data);
  generateReport(data);

  console.log('\nBenchmark complete!');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
