/**
 * Teacher Slider Experiments — simulates a teacher trying different
 * weight combos to find the right grading feel.
 *
 * Usage: node _teacher-experiments.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const SERVER = 'http://localhost:3456';
const TOKEN = '80a4dfd7-b912-4212-84fc-fb2f553f7049';
const MODEL = 'nemotron-3-super:cloud';
const PROVIDER = 'ollama';

const fixture = JSON.parse(
  readFileSync(new URL('../grading-server/test/fixtures/demo-clt-data.json', import.meta.url), 'utf-8')
);
const { rubric, students } = fixture;

// ── Teacher experiments ──
// Each one represents a teacher thinking: "what if I just tweak THIS?"
const EXPERIMENTS = {
  '1_default': {
    label: 'Default (baseline)',
    weights: null,
    thought: 'Starting point — see where scores land',
  },
  '2_floor_9': {
    label: 'Floor → 9',
    weights: {
      anchorExcellent: 0.95, anchorAdequate: 0.80,
      anchorBelowAverage: 0.65, anchorMinimal: 0.45,
      conceptualThoroughness: [60, 80], scoreFloor: 9,
    },
    thought: 'Just raise the floor — if they hit all criteria, give them a 9',
  },
  '3_floor_7': {
    label: 'Floor → 7',
    weights: {
      anchorExcellent: 0.95, anchorAdequate: 0.80,
      anchorBelowAverage: 0.65, anchorMinimal: 0.45,
      conceptualThoroughness: [60, 80], scoreFloor: 7,
    },
    thought: 'Lower the floor — just hitting criteria isn\'t enough, show quality',
  },
  '4_ct_wide': {
    label: 'CT → 70-90%',
    weights: {
      anchorExcellent: 0.95, anchorAdequate: 0.80,
      anchorBelowAverage: 0.65, anchorMinimal: 0.45,
      conceptualThoroughness: [70, 90], scoreFloor: 8,
    },
    thought: 'Reward understanding — if they get the concept, give lots of credit even with mistakes',
  },
  '5_ct_tight': {
    label: 'CT → 40-60%',
    weights: {
      anchorExcellent: 0.95, anchorAdequate: 0.80,
      anchorBelowAverage: 0.65, anchorMinimal: 0.45,
      conceptualThoroughness: [40, 60], scoreFloor: 8,
    },
    thought: 'Execution matters — understanding the concept isn\'t enough, do it right',
  },
  '6_nice_teacher': {
    label: 'Nice Teacher combo',
    weights: {
      anchorExcellent: 0.95, anchorAdequate: 0.80,
      anchorBelowAverage: 0.55, anchorMinimal: 0.35,
      conceptualThoroughness: [70, 90], scoreFloor: 9,
    },
    thought: 'Be generous everywhere — high floor, wide CT, low bar for partial credit',
  },
  '7_tough_teacher': {
    label: 'Tough Teacher combo',
    weights: {
      anchorExcellent: 0.95, anchorAdequate: 0.80,
      anchorBelowAverage: 0.75, anchorMinimal: 0.55,
      conceptualThoroughness: [40, 60], scoreFloor: 7,
    },
    thought: 'Be demanding — low floor, tight CT, high bar for partial credit',
  },
};

// ── Parse SSE ──
async function parseSSE(response) {
  const text = await response.text();
  const results = {};
  for (const block of text.split('\n\n').filter(b => b.trim())) {
    const lines = block.split('\n');
    let type = 'message', data = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7).trim();
      else if (line.startsWith('data: ')) {
        try { data = JSON.parse(line.slice(6)); } catch {}
      }
    }
    if (type === 'chunk' && data?.results) {
      for (const r of data.results) {
        const s = students.find(st => st.index === r.studentIndex);
        results[s?.name || `Student ${r.studentIndex}`] = r.score;
      }
    }
    if (type === 'outlier' && data?.adjustedResults) {
      for (const r of data.adjustedResults) {
        const s = students.find(st => st.index === r.studentIndex);
        results[s?.name || `Student ${r.studentIndex}`] = r.score;
      }
    }
  }
  return results;
}

// ── Grade ──
async function runExperiment(key, exp) {
  const body = {
    provider: PROVIDER, model: MODEL,
    rubric: {
      essayPrompt: rubric.essayPrompt,
      checklistItems: rubric.checklistItems || [],
      rubricItems: rubric.rubricItems || [],
      modelText: rubric.modelText || null,
      maxScore: rubric.maxScore || '10',
    },
    students: students.map(s => ({
      index: s.index, name: s.name, response: s.response,
      ...(s.prompt ? { prompt: s.prompt } : {}),
    })),
  };
  if (exp.weights) body.gradingWeights = exp.weights;

  console.log(`\n[${key}] ${exp.label}`);
  console.log(`  Teacher thinks: "${exp.thought}"`);
  const start = Date.now();

  const response = await fetch(`${SERVER}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`  FAILED: HTTP ${response.status}`);
    return null;
  }

  const results = await parseSSE(response);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  const scores = Object.values(results).filter(v => typeof v === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '-';
  console.log(`  Done in ${elapsed}s — ${scores.length} results, avg=${avg}`);

  return results;
}

// ── Main ──
async function main() {
  console.log('=== TEACHER SLIDER EXPERIMENTS ===');
  console.log(`Model: ${MODEL} | Students: ${students.length} | Max: ${rubric.maxScore}\n`);

  const allResults = {};
  for (const [key, exp] of Object.entries(EXPERIMENTS)) {
    allResults[key] = await runExperiment(key, exp);
    if (!allResults[key]) {
      console.error(`Experiment ${key} failed, skipping.`);
    }
  }

  // Save raw results
  writeFileSync(
    new URL('./_teacher-experiments-raw.json', import.meta.url),
    JSON.stringify(allResults, null, 2)
  );
  console.log('\nRaw results saved to _teacher-experiments-raw.json');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
