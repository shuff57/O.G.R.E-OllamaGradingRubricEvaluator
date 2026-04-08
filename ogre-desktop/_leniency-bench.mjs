/**
 * Leniency Benchmark — compare rule-based vs AI rubric rewriting
 * across 5 leniency levels, grading the same 30 students each time.
 *
 * Usage: node _leniency-bench.mjs
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

// Format rubric the same way the app does (formatRubricForDisplay style)
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

// ── Rule-based rewrite (port from rubric-leniency.ts) ──

const LENIENT_SUBS = [
  [/\bAND\b/g, 'OR'],
  [/\bClearly states\b/gi, 'Mentions'],
  [/\bPrecisely (states|defines|describes)\b/gi, 'References'],
  [/\bexplicitly\b/gi, ''],
  [/\bcorrect formula\b/gi, 'relevant formula or concept'],
  [/\bCorrect formula\b/g, 'Relevant formula or concept'],
  [/\bcomprehensive\b/gi, 'adequate'],
  [/\ball key concepts\b/gi, 'most key concepts'],
  [/\bwith specific\b/gi, 'with some'],
  [/\brigorously\b/gi, ''],
  [/\bdemonstrates mastery\b/gi, 'shows familiarity'],
  [/\bexact\b/gi, 'approximate'],
  [/\bprecise\b/gi, 'reasonable'],
  [/\bmust include\b/gi, 'may include'],
  [/\brequires\b/gi, 'benefits from'],
];

const STRICT_SUBS = [
  [/\bOR\b/g, 'AND'],
  [/\bMentions\b/g, 'Precisely states'],
  [/\bmentions\b/g, 'precisely states'],
  [/\bexplains\b/gi, 'rigorously demonstrates'],
  [/\bExplains\b/g, 'Rigorously demonstrates'],
  [/\breferences\b/gi, 'explicitly cites with notation'],
  [/\bsome\b/gi, 'all'],
  [/\bshows understanding\b/gi, 'demonstrates mastery'],
  [/\bdiscusses\b/gi, 'formally analyzes'],
  [/\bDescribes\b/g, 'Precisely defines'],
  [/\bdescribes\b/g, 'precisely defines'],
  [/\baware(ness)?\b/gi, 'thorough understanding'],
  [/\bbasic\b/gi, 'detailed'],
];

function rewriteRuleBased(text, leniency) {
  if (leniency === 50) return text;
  const intensity = Math.abs(leniency - 50) / 50;
  const subs = leniency < 50 ? LENIENT_SUBS : STRICT_SUBS;
  const activeCount = Math.ceil(subs.length * intensity);
  const activeSubs = subs.slice(0, activeCount);

  return text.split('\n').map(line => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('-') && !trimmed.match(/^(Full|Partial|Minimal|Missing)\s*\(/)) {
      return line;
    }
    let result = line;
    for (const [pattern, replacement] of activeSubs) {
      result = result.replace(pattern, replacement);
    }
    return result.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1');
  }).join('\n');
}

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
          if (data.token) result += data.token;
          if (data.text) result += data.text;
          if (typeof data === 'string') result += data;
        } catch {}
      }
    }
  }
  return result.trim();
}

// ── Parse rubric text back to structured format ──
function textToRubric(text, originalRubric) {
  // Parse [Category] / - item format back into checklistItems
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

// ── Grade with a rubric ──
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

async function gradeWithRubric(label, modifiedRubric) {
  console.log(`  Grading: ${label}...`);
  const start = Date.now();
  const res = await fetch(`${SERVER}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      provider: PROVIDER, model: MODEL,
      rubric: modifiedRubric,
      students: students.map(s => ({
        index: s.index, name: s.name, response: s.response,
        ...(s.prompt ? { prompt: s.prompt } : {}),
      })),
    }),
  });
  if (!res.ok) {
    console.error(`  FAILED: HTTP ${res.status}`);
    return null;
  }
  const results = await parseSSE(res);
  const scores = Object.values(results).filter(v => typeof v === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '-';
  console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(0)}s — avg=${avg}`);
  return results;
}

// ── Main ──
async function main() {
  const LEVELS = [15, 30, 50, 70, 85];

  console.log('=== RUBRIC LENIENCY BENCHMARK ===');
  console.log(`Model: ${MODEL} | Students: ${students.length} | Max: ${rubric.maxScore}`);
  console.log(`\nOriginal rubric:\n${ORIGINAL_RUBRIC_TEXT.split('\n').slice(0, 6).join('\n')}...\n`);

  const allResults = {};

  for (const level of LEVELS) {
    console.log(`\n--- Leniency ${level}% ---`);

    // Rule-based
    const ruleText = rewriteRuleBased(ORIGINAL_RUBRIC_TEXT, level);
    if (level !== 50) {
      console.log(`  Rule-based preview: ${ruleText.split('\n').filter(l => l.trim().startsWith('-'))[0]?.trim().slice(0, 80)}...`);
    }
    const ruleRubric = textToRubric(ruleText, rubric);
    allResults[`rule_${level}`] = await gradeWithRubric(`rule-based @${level}%`, ruleRubric);

    // AI rewrite (skip at 50% — same as original)
    if (level !== 50) {
      try {
        console.log(`  AI rewriting rubric @${level}%...`);
        const aiText = await rewriteAI(ORIGINAL_RUBRIC_TEXT, level);
        console.log(`  AI preview: ${aiText.split('\n').filter(l => l.trim().startsWith('-'))[0]?.trim().slice(0, 80)}...`);
        const aiRubric = textToRubric(aiText, rubric);
        allResults[`ai_${level}`] = await gradeWithRubric(`AI @${level}%`, aiRubric);
      } catch (e) {
        console.error(`  AI rewrite failed: ${e.message}`);
        allResults[`ai_${level}`] = null;
      }
    }
  }

  // Save raw results
  writeFileSync(
    new URL('./_leniency-bench-raw.json', import.meta.url),
    JSON.stringify(allResults, null, 2)
  );

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`${'Level'.padEnd(10)} ${'Strategy'.padEnd(12)} ${'Avg'.padStart(6)} ${'Median'.padStart(7)}`);
  console.log('-'.repeat(40));

  for (const level of LEVELS) {
    for (const strategy of ['rule', 'ai']) {
      const key = `${strategy}_${level}`;
      const r = allResults[key];
      if (!r) { if (level !== 50 || strategy !== 'ai') console.log(`${String(level + '%').padEnd(10)} ${strategy.padEnd(12)} ${'FAIL'.padStart(6)}`); continue; }
      const scores = Object.values(r).filter(v => typeof v === 'number').sort((a, b) => a - b);
      const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
      const median = scores[Math.floor(scores.length / 2)];
      console.log(`${String(level + '%').padEnd(10)} ${strategy.padEnd(12)} ${avg.padStart(6)} ${String(median).padStart(7)}`);
    }
  }

  console.log('\nExpected: 15% > 30% > 50% > 70% > 85% (avg scores should decrease)');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
