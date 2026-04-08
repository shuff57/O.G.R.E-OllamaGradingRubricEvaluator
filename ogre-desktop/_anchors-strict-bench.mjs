/**
 * Condition E: Strict rubric + shifted strict anchors
 * Adds the missing 5th condition to the anchors-leniency benchmark.
 *
 * Usage: node _anchors-strict-bench.mjs
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

function formatRubric(r) {
  const lines = [];
  if (r.checklistItems?.length) {
    lines.push('--- Grading Checklist ---');
    for (const item of r.checklistItems) {
      if (item.category) lines.push(`[${item.category}]`);
      for (const sub of item.items) lines.push(`  - ${sub}`);
    }
    lines.push('');
  }
  if (r.rubricItems?.length) {
    lines.push('--- Rubric Targets ---');
    for (const item of r.rubricItems) {
      if (item.category) lines.push(`[${item.category}]`);
      for (const sub of item.items) lines.push(`  - ${sub}`);
    }
  }
  return lines.join('\n').trim();
}

const ORIGINAL_RUBRIC_TEXT = formatRubric(rubric);

async function rewriteAI(text, leniency) {
  const direction = leniency < 50 ? 'lenient' : 'strict';
  const pct = Math.abs(leniency - 50);
  const dirDesc = direction === 'lenient'
    ? `${pct}% more lenient — make criteria easier to satisfy`
    : `${pct}% more strict — require precise terminology, exact formulas, explicit conditions`;

  const prompt = `Rewrite the following rubric criteria to be ${dirDesc}.

RULES:
- Keep ALL category names in [brackets] EXACTLY the same
- Keep ALL point values EXACTLY the same
- Keep the EXACT same formatting structure
- ONLY modify the description text
- Return the COMPLETE rewritten rubric
- Do NOT add explanations

ORIGINAL RUBRIC:
${text}

REWRITTEN RUBRIC:`;

  const res = await fetch(`${SERVER}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ message: prompt, provider: PROVIDER, model: MODEL }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const sseText = await res.text();
  let result = '';
  for (const block of sseText.split('\n\n').filter(b => b.trim())) {
    for (const line of block.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) result += data.content;
          else if (data.token) result += data.token;
          else if (data.text) result += data.text;
        } catch {}
      }
    }
  }
  return result.trim();
}

function textToRubric(text, originalRubric) {
  const checklistItems = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      cur = { category: t.slice(1, -1), items: [] };
      checklistItems.push(cur);
    } else if (t.startsWith('-') && cur) {
      cur.items.push(t.slice(1).trim());
    }
  }
  return {
    essayPrompt: originalRubric.essayPrompt,
    checklistItems: checklistItems.length > 0 ? checklistItems : originalRubric.checklistItems,
    rubricItems: originalRubric.rubricItems || [],
    modelText: originalRubric.modelText || null,
    maxScore: originalRubric.maxScore || '10',
  };
}

async function parseSSE(response) {
  const text = await response.text();
  const results = {};
  for (const block of text.split('\n\n').filter(b => b.trim())) {
    const lines = block.split('\n');
    let type = 'message', data = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7).trim();
      else if (line.startsWith('data: ')) { try { data = JSON.parse(line.slice(6)); } catch {} }
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

async function grade(label, modifiedRubric, customInstructions) {
  console.log(`  Grading: ${label}...`);
  const start = Date.now();
  const body = {
    provider: PROVIDER, model: MODEL,
    rubric: modifiedRubric,
    students: students.map(s => ({
      index: s.index, name: s.name, response: s.response,
      ...(s.prompt ? { prompt: s.prompt } : {}),
    })),
  };
  if (customInstructions) body.customInstructions = customInstructions;
  const res = await fetch(`${SERVER}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(`  FAILED: HTTP ${res.status}`); return null; }
  const results = await parseSSE(res);
  const scores = Object.values(results).filter(v => typeof v === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '-';
  console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(0)}s — ${scores.length} results, avg=${avg}`);
  return results;
}

async function main() {
  console.log('=== Condition E: Strict rubric + shifted strict anchors ===\n');

  // Load previous results
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(new URL('./_anchors-leniency-raw.json', import.meta.url), 'utf-8'));
  } catch { console.log('No previous results found, running E only.\n'); }

  // Generate strict rubric
  console.log('Generating strict rubric (85%)...');
  const strictText = await rewriteAI(ORIGINAL_RUBRIC_TEXT, 85);
  console.log('Preview:', strictText.split('\n').slice(0, 4).join('\n'));
  const strictRubric = textToRubric(strictText, rubric);

  // Strict anchors: raise the bar — Excellent=9.8, Adequate=8.5, BelowAvg=7.5, Minimal=5.5
  const strictAnchors = `SCORING CALIBRATION:
Excellent (9.8/10): Flawless response with precise notation, complete formulas, and rigorous logical chain
Adequate (8.5/10): Complete response meeting all strict criteria with minor gaps
Below Average (7.5/10): Addresses most criteria but lacks precision or formal notation
Minimal (5.5/10): Partial engagement with the topic, missing key formal requirements`;

  console.log('\n--- Condition E: Strict rubric + shifted strict anchors ---');
  const resultsE = await grade('E: strict rubric + strict anchors', strictRubric, strictAnchors);

  // Merge with previous results
  prev.E = resultsE;
  writeFileSync(
    new URL('./_anchors-leniency-raw.json', import.meta.url),
    JSON.stringify(prev, null, 2)
  );

  // Summary with all 5 conditions
  const stats = (r) => {
    if (!r) return { avg: '-', median: '-' };
    const scores = Object.values(r).filter(v => typeof v === 'number').sort((a, b) => a - b);
    return {
      avg: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      median: scores[Math.floor(scores.length / 2)],
    };
  };

  console.log('\n' + '='.repeat(70));
  console.log('ALL 5 CONDITIONS');
  console.log('='.repeat(70));
  console.log(`${'Condition'.padEnd(50)} ${'Avg'.padStart(6)} ${'Med'.padStart(5)}`);
  console.log('-'.repeat(63));
  for (const [key, label] of [
    ['A', 'A: Original rubric + default anchors'],
    ['B', 'B: Lenient rubric + default anchors'],
    ['C', 'C: Lenient rubric + shifted lenient anchors'],
    ['D', 'D: Strict rubric + default anchors'],
    ['E', 'E: Strict rubric + shifted strict anchors'],
  ]) {
    const s = stats(prev[key]);
    console.log(`${label.padEnd(50)} ${s.avg.padStart(6)} ${String(s.median).padStart(5)}`);
  }

  const sD = stats(prev.D), sE = stats(prev.E);
  console.log(`\nStrict anchor shift effect (E vs D): ${(parseFloat(sE.avg) - parseFloat(sD.avg)).toFixed(2)} points`);

  // Per-student for D vs E
  if (prev.D && prev.E) {
    console.log('\n--- Per-Student: D (strict only) vs E (strict + anchors) ---');
    const header = `${'Student'.padEnd(25)} ${'D'.padStart(4)} ${'E'.padStart(4)} ${'E-D'.padStart(5)}`;
    console.log(header);
    console.log('-'.repeat(header.length));
    for (const name of Object.keys(prev.D).sort()) {
      const d = prev.D[name] ?? '-';
      const e = prev.E[name] ?? '-';
      const diff = typeof d === 'number' && typeof e === 'number' ? (e - d).toFixed(0) : '-';
      console.log(`${name.padEnd(25)} ${String(d).padStart(4)} ${String(e).padStart(4)} ${diff.padStart(5)}`);
    }
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
