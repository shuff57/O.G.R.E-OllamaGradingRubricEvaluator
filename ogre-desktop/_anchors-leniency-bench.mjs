/**
 * Anchors + Leniency Dry Run — tests whether shifting anchor positions
 * on top of rubric rewriting helps, hurts, or double-dips.
 *
 * 4 conditions:
 *   A: Original rubric + default anchors (baseline)
 *   B: Lenient rubric + default anchors (current slider behavior)
 *   C: Lenient rubric + shifted anchors (proposed enhancement)
 *   D: Strict rubric + default anchors (confirm directional)
 *
 * Usage: node _anchors-leniency-bench.mjs
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

// ── Format rubric for display ──
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

// ── AI rewrite ──
async function rewriteAI(text, leniency) {
  if (leniency === 50) return text;
  const direction = leniency < 50 ? 'lenient' : 'strict';
  const pct = Math.abs(leniency - 50);
  const dirDesc = direction === 'lenient'
    ? `${pct}% more lenient — make criteria easier to satisfy, accept vaguer answers, partial understanding counts`
    : `${pct}% more strict — require precise terminology, exact formulas, explicit conditions`;

  const prompt = `Rewrite the following rubric criteria to be ${dirDesc}.

RULES:
- Keep ALL category names in [brackets] EXACTLY the same
- Keep ALL point values EXACTLY the same
- Keep the EXACT same formatting structure (indentation, dashes, line breaks)
- ONLY modify the description text of each criterion item
- Return the COMPLETE rewritten rubric, not just changed parts
- Do NOT add explanations or commentary — return ONLY the rubric text

ORIGINAL RUBRIC:
${text}

REWRITTEN RUBRIC:`;

  const res = await fetch(`${SERVER}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ message: prompt, provider: PROVIDER, model: MODEL }),
  });
  if (!res.ok) throw new Error(`AI rewrite HTTP ${res.status}`);

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

// ── Parse rubric text back to structured format ──
function textToRubric(text, originalRubric) {
  const checklistItems = [];
  let currentCategory = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentCategory = { category: trimmed.slice(1, -1), items: [] };
      checklistItems.push(currentCategory);
    } else if (trimmed.startsWith('-') && currentCategory) {
      currentCategory.items.push(trimmed.slice(1).trim());
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

// ── SSE parser ──
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

// ── Grade ──
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
  if (!res.ok) {
    console.error(`  FAILED: HTTP ${res.status}`);
    return null;
  }
  const results = await parseSSE(res);
  const scores = Object.values(results).filter(v => typeof v === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '-';
  console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(0)}s — ${scores.length} results, avg=${avg}`);
  return results;
}

// ── Main ──
async function main() {
  console.log('=== ANCHORS + LENIENCY DRY RUN ===');
  console.log(`Model: ${MODEL} | Students: ${students.length} | Max: ${rubric.maxScore}\n`);

  // Generate rewritten rubrics
  console.log('Generating AI-rewritten rubrics...');
  console.log('  Lenient (15%)...');
  const lenientText = await rewriteAI(ORIGINAL_RUBRIC_TEXT, 15);
  console.log('  Strict (85%)...');
  const strictText = await rewriteAI(ORIGINAL_RUBRIC_TEXT, 85);

  console.log('\nLenient rubric preview:');
  console.log(lenientText.split('\n').slice(0, 5).join('\n'));
  console.log('\nStrict rubric preview:');
  console.log(strictText.split('\n').slice(0, 5).join('\n'));

  const lenientRubric = textToRubric(lenientText, rubric);
  const strictRubric = textToRubric(strictText, rubric);

  // Condition A: Original rubric + default anchors
  console.log('\n--- Condition A: Original rubric + default anchors ---');
  const resultsA = await grade('A: baseline', rubric);

  // Condition B: Lenient rubric + default anchors (current slider behavior)
  console.log('\n--- Condition B: Lenient rubric + default anchors ---');
  const resultsB = await grade('B: lenient rubric only', lenientRubric);

  // Condition C: Lenient rubric + shifted anchors
  // Inject custom anchor instructions that override the default positions
  const shiftedAnchors = `SCORING CALIBRATION:
Excellent (9/10): Near-perfect response addressing the lenient rubric criteria
Adequate (7/10): Solid response meeting most of the lenient criteria
Below Average (5.5/10): Partial response touching on some criteria
Minimal (3.5/10): Minimal engagement with the topic`;

  console.log('\n--- Condition C: Lenient rubric + shifted anchors ---');
  const resultsC = await grade('C: lenient rubric + shifted anchors', lenientRubric, shiftedAnchors);

  // Condition D: Strict rubric + default anchors
  console.log('\n--- Condition D: Strict rubric + default anchors ---');
  const resultsD = await grade('D: strict rubric only', strictRubric);

  // Save raw
  const allResults = { A: resultsA, B: resultsB, C: resultsC, D: resultsD };
  writeFileSync(
    new URL('./_anchors-leniency-raw.json', import.meta.url),
    JSON.stringify(allResults, null, 2)
  );

  // ── Summary ──
  const stats = (r) => {
    if (!r) return { avg: '-', median: '-', count: 0 };
    const scores = Object.values(r).filter(v => typeof v === 'number').sort((a, b) => a - b);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const median = scores[Math.floor(scores.length / 2)];
    return { avg, median, count: scores.length };
  };

  const sA = stats(resultsA), sB = stats(resultsB), sC = stats(resultsC), sD = stats(resultsD);

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`${'Condition'.padEnd(45)} ${'Avg'.padStart(6)} ${'Median'.padStart(7)}`);
  console.log('-'.repeat(60));
  console.log(`${'A: Original rubric + default anchors'.padEnd(45)} ${sA.avg.padStart(6)} ${String(sA.median).padStart(7)}`);
  console.log(`${'B: Lenient rubric + default anchors'.padEnd(45)} ${sB.avg.padStart(6)} ${String(sB.median).padStart(7)}`);
  console.log(`${'C: Lenient rubric + shifted anchors'.padEnd(45)} ${sC.avg.padStart(6)} ${String(sC.median).padStart(7)}`);
  console.log(`${'D: Strict rubric + default anchors'.padEnd(45)} ${sD.avg.padStart(6)} ${String(sD.median).padStart(7)}`);

  console.log('\n--- Analysis ---');
  console.log(`Rubric-only effect (B vs A):  ${(parseFloat(sB.avg) - parseFloat(sA.avg)).toFixed(2)} points`);
  console.log(`Anchor shift on top (C vs B): ${(parseFloat(sC.avg) - parseFloat(sB.avg)).toFixed(2)} points`);
  console.log(`Strict effect (D vs A):       ${(parseFloat(sD.avg) - parseFloat(sA.avg)).toFixed(2)} points`);

  if (parseFloat(sC.avg) > parseFloat(sB.avg) + 0.3) {
    console.log('\nVERDICT: Shifting anchors HELPS on top of rubric rewrite — consider adding to slider');
  } else if (parseFloat(sC.avg) < parseFloat(sB.avg) - 0.3) {
    console.log('\nVERDICT: Shifting anchors HURTS (double-dips) — keep anchors fixed');
  } else {
    console.log('\nVERDICT: Anchor shift has minimal additional effect — keep anchors fixed (simpler)');
  }

  // Per-student comparison
  console.log('\n--- Per-Student Scores ---');
  const header = `${'Student'.padEnd(25)} ${'A'.padStart(4)} ${'B'.padStart(4)} ${'C'.padStart(4)} ${'D'.padStart(4)} ${'B-A'.padStart(5)} ${'C-B'.padStart(5)}`;
  console.log(header);
  console.log('-'.repeat(header.length));
  const names = Object.keys(resultsA || {}).sort();
  for (const name of names) {
    const a = resultsA?.[name] ?? '-';
    const b = resultsB?.[name] ?? '-';
    const c = resultsC?.[name] ?? '-';
    const d = resultsD?.[name] ?? '-';
    const ba = typeof a === 'number' && typeof b === 'number' ? (b - a).toFixed(0) : '-';
    const cb = typeof b === 'number' && typeof c === 'number' ? (c - b).toFixed(0) : '-';
    console.log(`${name.padEnd(25)} ${String(a).padStart(4)} ${String(b).padStart(4)} ${String(c).padStart(4)} ${String(d).padStart(4)} ${ba.padStart(5)} ${cb.padStart(5)}`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
