/**
 * 5-run consistency benchmark for nemotron-3-super:cloud via the OGRE
 * grading server's /api/grade SSE endpoint (full production pipeline).
 *
 * Reads student data from C:/tmp/mom-benchmark-data.json
 * (exported from the OGRE app or previous benchmark run).
 *
 * Usage: node _consistency-bench.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const TOKEN = '80a4dfd7-b912-4212-84fc-fb2f553f7049';
const SERVER = 'http://localhost:3456';
const MODEL = 'nemotron-3-super:cloud';
const PROVIDER = 'ollama';
const RUNS = 5;
const CUSTOM_INSTRUCTIONS = `Grade very leniently. Give partial credit for any attempt that is vaguely correct.

Do not deduct points for lack of explicit formula notation or symbolic notation of any kind. If a student demonstrates understanding of a concept through explanation alone — without writing out formulas or symbols — award full credit for that rubric item. Reward the concept, not the notation. Do NOT penalize brevity. A concise response that correctly addresses each rubric criterion deserves full marks. Only deduct when a rubric criterion is genuinely missing or wrong — not because the student could have written more.`;

// ── Load student data ──
const dataFile = 'C:/tmp/mom-benchmark-data.json';
if (!existsSync(dataFile)) {
  console.error(`Missing ${dataFile}. Export student data first.`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataFile, 'utf8'));
// Use allStudents (includes already-graded), filter to those with actual responses
const students = (data.allStudents || data.students).filter(s => s.response && s.response.trim().length > 5);
const rubric = data.rubric;

console.log(`=== OGRE Consistency Benchmark: ${MODEL} x${RUNS} ===`);
console.log(`Students: ${students.length}, Max Score: ${rubric.maxScore}\n`);

// ── Baseline scores from Sonnet (from benchmark doc) ──
const baseline = {
  'Brandt, Laura': 1.50, 'Calderon, Gabriella': 2.75, 'Chagoya, Julie': 3.25,
  'Costner, Adam': 0.75, 'Disney, Ben': 1.50, 'Franco, Melody': 2.50,
  'Fuentes, Nayeli': 2.50, 'Garcia, Hazel': 3.25, 'Goodwin, Reed': 2.75,
  'Hastain, Emma': 2.75, 'Humble, Layla': 2.50, 'Lakhanpal, Neha': 0.75,
  'Matthews, Sammy': 1.25, 'Quiroz, Paulina': 0.75, 'Rosales, Elizabeth': 1.25,
  'Sutton, Caidin': 3.50, 'Tuman, Charlie': 2.75,
};

// ── Call /api/grade and parse SSE stream ──
async function runGrade(runNum) {
  console.log(`\n--- Run ${runNum} ---`);
  const startTime = Date.now();

  const response = await fetch(`${SERVER}/api/grade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      provider: PROVIDER,
      model: MODEL,
      rubric: {
        essayPrompt: rubric.essayPrompt,
        checklistItems: rubric.checklistItems || [],
        rubricItems: rubric.rubricItems || [],
        modelText: rubric.modelText || null,
        maxScore: rubric.maxScore || '4',
      },
      students: students.map(s => ({
        index: s.index,
        name: s.name,
        response: s.response,
        ...(s.prompt ? { prompt: s.prompt } : {}),
      })),
      customInstructions: CUSTOM_INSTRUCTIONS || undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`  HTTP ${response.status}: ${err}`);
    return null;
  }

  // Parse SSE stream
  const text = await response.text();
  const results = [];

  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const event = JSON.parse(line.slice(6));
      if (event.results) {
        for (const r of event.results) {
          results.push({
            studentIndex: r.studentIndex,
            score: r.score,
            feedback: (r.feedback || '').substring(0, 100),
          });
        }
      }
      if (event.stats) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Done in ${elapsed}s (server: ${event.metadata?.elapsedSeconds?.toFixed(1)}s)`);
      }
    } catch {}
  }

  // Map results back to student names
  const scoreMap = {};
  for (const r of results) {
    const student = students.find(s => s.index === r.studentIndex);
    if (student) scoreMap[student.name] = r.score;
  }

  // Print scores
  for (const s of students.sort((a, b) => a.name.localeCompare(b.name))) {
    const score = scoreMap[s.name];
    const base = baseline[s.name];
    const diff = score !== undefined && base !== undefined ? (score - base).toFixed(2) : '?';
    const diffStr = diff > 0 ? `+${diff}` : diff;
    console.log(`  ${s.name.padEnd(26)} ${score !== undefined ? score.toFixed(2) : '  ? '}/4  (base: ${base?.toFixed(2) || '?'}, diff: ${diffStr})`);
  }

  return scoreMap;
}

// ── Run 5 times ──
const allRuns = [];
for (let i = 1; i <= RUNS; i++) {
  const scores = await runGrade(i);
  if (scores) allRuns.push(scores);
}

// ── Summary statistics ──
if (allRuns.length > 0) {
  console.log('\n\n=== CONSISTENCY SUMMARY ===\n');
  console.log('Student'.padEnd(28) + 'Base'.padStart(6) + '  ' +
    allRuns.map((_, i) => `R${i+1}`.padStart(6)).join('') +
    '  Mean'.padStart(7) + ' StdDev'.padStart(7) + ' AvgErr'.padStart(7));
  console.log('-'.repeat(28 + 6 + 2 + allRuns.length * 6 + 21));

  const studentNames = [...new Set(students.map(s => s.name))].sort();
  const allErrors = [];
  const allStdDevs = [];

  for (const name of studentNames) {
    const base = baseline[name];
    const scores = allRuns.map(r => r[name]).filter(s => s !== undefined);
    if (scores.length === 0) continue;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const avgErr = base !== undefined ? Math.abs(mean - base) : NaN;

    allErrors.push(avgErr);
    allStdDevs.push(stdDev);

    const scoreStr = scores.map(s => s.toFixed(2).padStart(6)).join('');
    console.log(
      name.padEnd(28) +
      (base?.toFixed(2) || '?').padStart(6) + '  ' +
      scoreStr +
      `  ${mean.toFixed(2)}`.padStart(7) +
      `  ${stdDev.toFixed(2)}`.padStart(7) +
      `  ${isNaN(avgErr) ? '?' : avgErr.toFixed(2)}`.padStart(7)
    );
  }

  const meanError = allErrors.filter(e => !isNaN(e)).reduce((a, b) => a + b, 0) / allErrors.filter(e => !isNaN(e)).length;
  const meanStdDev = allStdDevs.reduce((a, b) => a + b, 0) / allStdDevs.length;

  console.log('-'.repeat(28 + 6 + 2 + allRuns.length * 6 + 21));
  console.log(`${'OVERALL'.padEnd(28)}${''.padStart(6)}  ${''.padStart(allRuns.length * 6)}  ${''.padStart(7)}  ${meanStdDev.toFixed(3).padStart(7)}  ${meanError.toFixed(3).padStart(7)}`);
  console.log(`\nMean run-to-run StdDev: ${meanStdDev.toFixed(3)}`);
  console.log(`Mean error vs baseline: ${meanError.toFixed(3)}`);
  console.log(`Max single-student StdDev: ${Math.max(...allStdDevs).toFixed(3)}`);

  // Save full results
  writeFileSync('C:/tmp/consistency-bench-results.json', JSON.stringify({
    model: MODEL, runs: RUNS, students: studentNames.length,
    allRuns, baseline, meanError, meanStdDev,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log('\nSaved to C:/tmp/consistency-bench-results.json');
}
