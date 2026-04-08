/**
 * Dry-run benchmark: Grade the same 30 students with DEFAULT, LENIENT, and STRICT
 * grading weights via the /api/grade SSE endpoint, then compare results.
 *
 * Usage: node _weights-dryrun.mjs
 */
import { readFileSync } from 'fs';

const SERVER = 'http://localhost:3456';
const TOKEN = '80a4dfd7-b912-4212-84fc-fb2f553f7049';
const MODEL = 'nemotron-3-super:cloud';
const PROVIDER = 'ollama';

// ── Load fixture data ──
const fixture = JSON.parse(
  readFileSync(new URL('../grading-server/test/fixtures/demo-clt-data.json', import.meta.url), 'utf-8')
);
const { rubric, students } = fixture;

// ── Weight presets ──
const PRESETS = {
  default: null,  // server defaults
  lenient: {
    anchorExcellent: 0.90,
    anchorAdequate: 0.75,
    anchorBelowAverage: 0.60,
    anchorMinimal: 0.40,
    conceptualThoroughness: [65, 85],
    scoreFloor: 7,
  },
  strict: {
    anchorExcellent: 0.97,
    anchorAdequate: 0.85,
    anchorBelowAverage: 0.70,
    anchorMinimal: 0.50,
    conceptualThoroughness: [50, 70],
    scoreFloor: 8,
  },
};

// ── Parse SSE stream ──
async function parseSSE(response) {
  const text = await response.text();
  const events = [];
  for (const block of text.split('\n\n').filter(b => b.trim())) {
    const lines = block.split('\n');
    let type = 'message', data = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7).trim();
      else if (line.startsWith('data: ')) {
        try { data = JSON.parse(line.slice(6)); } catch { data = line.slice(6); }
      }
    }
    if (data !== null) events.push({ type, data });
  }
  return events;
}

// ── Grade with weights ──
async function gradeWithWeights(presetName, weights) {
  const body = {
    provider: PROVIDER,
    model: MODEL,
    rubric: {
      essayPrompt: rubric.essayPrompt,
      checklistItems: rubric.checklistItems || [],
      rubricItems: rubric.rubricItems || [],
      modelText: rubric.modelText || null,
      maxScore: rubric.maxScore || '10',
    },
    students: students.map(s => ({
      index: s.index,
      name: s.name,
      response: s.response,
      ...(s.prompt ? { prompt: s.prompt } : {}),
    })),
  };
  if (weights) body.gradingWeights = weights;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Grading with: ${presetName.toUpperCase()}`);
  if (weights) {
    console.log(`  Anchors: E=${weights.anchorExcellent} A=${weights.anchorAdequate} BA=${weights.anchorBelowAverage} M=${weights.anchorMinimal}`);
    console.log(`  Conceptual Thoroughness: ${weights.conceptualThoroughness[0]}-${weights.conceptualThoroughness[1]}%`);
    console.log(`  Score Floor: ${weights.scoreFloor}`);
  } else {
    console.log(`  (server defaults: E=0.95 A=0.80 BA=0.65 M=0.45, CT=60-80%, Floor=8)`);
  }
  console.log(`${'='.repeat(60)}`);

  const start = Date.now();
  const response = await fetch(`${SERVER}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`  HTTP ${response.status}: ${await response.text()}`);
    return null;
  }

  const events = await parseSSE(response);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Collect results from chunk events
  const results = {};
  for (const evt of events) {
    if (evt.type === 'chunk' && evt.data.results) {
      for (const r of evt.data.results) {
        const student = students.find(s => s.index === r.studentIndex);
        results[student?.name || `Student ${r.studentIndex}`] = r.score;
      }
    }
    // Also check outlier adjustments
    if (evt.type === 'outlier' && evt.data.adjustedResults) {
      for (const r of evt.data.adjustedResults) {
        const student = students.find(s => s.index === r.studentIndex);
        results[student?.name || `Student ${r.studentIndex}`] = r.score;
      }
    }
  }

  console.log(`  Completed in ${elapsed}s — ${Object.keys(results).length} results`);
  return results;
}

// ── Main ──
async function main() {
  console.log(`\nOGRE Grading Weights Dry Run`);
  console.log(`Model: ${MODEL} | Students: ${students.length} | Max Score: ${rubric.maxScore}`);

  const allResults = {};
  for (const [name, weights] of Object.entries(PRESETS)) {
    allResults[name] = await gradeWithWeights(name, weights);
    if (!allResults[name]) {
      console.error(`Failed to grade with ${name} preset, aborting.`);
      process.exit(1);
    }
  }

  // ── Comparison table ──
  console.log(`\n${'='.repeat(80)}`);
  console.log('  COMPARISON: Default vs Lenient vs Strict');
  console.log(`${'='.repeat(80)}`);

  const header = `${'Student'.padEnd(25)} ${'Default'.padStart(8)} ${'Lenient'.padStart(8)} ${'Strict'.padStart(8)} ${'L-D'.padStart(6)} ${'S-D'.padStart(6)}`;
  console.log(header);
  console.log('-'.repeat(header.length));

  const names = Object.keys(allResults.default).sort();
  const diffs = { lenient: [], strict: [] };

  for (const name of names) {
    const d = allResults.default[name] ?? '-';
    const l = allResults.lenient[name] ?? '-';
    const s = allResults.strict[name] ?? '-';
    const ld = typeof d === 'number' && typeof l === 'number' ? (l - d).toFixed(1) : '-';
    const sd = typeof d === 'number' && typeof s === 'number' ? (s - d).toFixed(1) : '-';

    if (typeof d === 'number' && typeof l === 'number') diffs.lenient.push(l - d);
    if (typeof d === 'number' && typeof s === 'number') diffs.strict.push(s - d);

    const ldStr = ld === '-' ? '  -' : (parseFloat(ld) > 0 ? ` +${ld}` : ` ${ld}`);
    const sdStr = sd === '-' ? '  -' : (parseFloat(sd) > 0 ? ` +${sd}` : ` ${sd}`);

    console.log(`${name.padEnd(25)} ${String(d).padStart(8)} ${String(l).padStart(8)} ${String(s).padStart(8)} ${ldStr.padStart(6)} ${sdStr.padStart(6)}`);
  }

  // ── Summary stats ──
  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
  const sum = arr => arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(1) : '-';

  console.log('-'.repeat(header.length));
  console.log(`${'AVG SCORE'.padEnd(25)} ${avg(Object.values(allResults.default).filter(v => typeof v === 'number')).padStart(8)} ${avg(Object.values(allResults.lenient).filter(v => typeof v === 'number')).padStart(8)} ${avg(Object.values(allResults.strict).filter(v => typeof v === 'number')).padStart(8)}`);
  console.log(`${'AVG DIFF FROM DEFAULT'.padEnd(25)} ${''.padStart(8)} ${avg(diffs.lenient).padStart(8)} ${avg(diffs.strict).padStart(8)}`);

  console.log(`\nExpected: Lenient scores >= Default >= Strict (on average)`);
  const avgL = parseFloat(avg(diffs.lenient));
  const avgS = parseFloat(avg(diffs.strict));
  if (avgL >= 0 && avgS <= 0) {
    console.log(`PASS: Lenient avg diff = +${avgL}, Strict avg diff = ${avgS}`);
  } else if (avgL >= avgS) {
    console.log(`PARTIAL: Lenient (${avgL}) >= Strict (${avgS}) but direction not as expected`);
  } else {
    console.log(`UNEXPECTED: Lenient (${avgL}) < Strict (${avgS}) — weights may not be effective`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
