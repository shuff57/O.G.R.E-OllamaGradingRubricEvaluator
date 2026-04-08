/**
 * Test: rubric + model text leniency rewrite.
 * Run: node _test-leniency.mjs
 */

// ── Copied from rubric-leniency.ts ────────────────────────────────────

const LENIENT_SUBS = [
  { pattern: /\bAND\b/g, replacement: 'OR' },
  { pattern: /\bClearly states\b/gi, replacement: 'Mentions' },
  { pattern: /\bPrecisely (states|defines|describes)\b/gi, replacement: 'References' },
  { pattern: /\bexplicitly\b/gi, replacement: '' },
  { pattern: /\bcorrect formula\b/gi, replacement: 'relevant formula or concept' },
  { pattern: /\bCorrect formula\b/g, replacement: 'Relevant formula or concept' },
  { pattern: /\bcomprehensive\b/gi, replacement: 'adequate' },
  { pattern: /\ball key concepts\b/gi, replacement: 'most key concepts' },
  { pattern: /\bwith specific\b/gi, replacement: 'with some' },
  { pattern: /\brigorously\b/gi, replacement: '' },
  { pattern: /\bdemonstrates mastery\b/gi, replacement: 'shows familiarity' },
  { pattern: /\bFull \((\d+)\)/g, replacement: 'Full ($1)' },
  { pattern: /\bexact\b/gi, replacement: 'approximate' },
  { pattern: /\bprecise\b/gi, replacement: 'reasonable' },
  { pattern: /\bmust include\b/gi, replacement: 'may include' },
  { pattern: /\brequires\b/gi, replacement: 'benefits from' },
  { pattern: /\bidentifies\b/gi, replacement: 'recognizes' },
  { pattern: /\bIdentifies\b/g, replacement: 'Recognizes' },
  { pattern: /\bshows understanding\b/gi, replacement: 'shows awareness' },
  { pattern: /\bdemonstrates understanding\b/gi, replacement: 'shows awareness' },
  { pattern: /\baccurately\b/gi, replacement: 'generally' },
  { pattern: /\bcorrectly\b/gi, replacement: 'reasonably' },
  { pattern: /\bcorrect\b/gi, replacement: 'reasonable' },
  { pattern: /\bappropriate\b/gi, replacement: 'relevant' },
  { pattern: /\bcomplete\b/gi, replacement: 'partial' },
  { pattern: /\bthorough\b/gi, replacement: 'basic' },
  { pattern: /\bdetailed\b/gi, replacement: 'brief' },
  { pattern: /\ball\b/g, replacement: 'most' },
  { pattern: /\bAll\b/g, replacement: 'Most' },
  { pattern: /\bmust\b/gi, replacement: 'may' },
  { pattern: /\bshould\b/gi, replacement: 'could' },
];

const LENIENT_MODEL_SUBS = [
  { pattern: /\bTherefore\b/gi, replacement: 'So' },
  { pattern: /\bthus\b/gi, replacement: 'so' },
  { pattern: /\bwe can conclude\b/gi, replacement: 'it looks like' },
  { pattern: /\bdefinitely\b/gi, replacement: 'likely' },
  { pattern: /\bIS an outlier\b/g, replacement: 'is probably an outlier' },
  { pattern: /\bis an outlier\b/g, replacement: 'is probably an outlier' },
  { pattern: /\bexactly\b/gi, replacement: 'about' },
  { pattern: /\bprecisely\b/gi, replacement: 'roughly' },
  { pattern: /\bSince\b/g, replacement: 'Because' },
  { pattern: /\bdemonstrates\b/gi, replacement: 'shows' },
  { pattern: /\bdemonstrate\b/gi, replacement: 'show' },
  { pattern: /\bdemonstrating\b/gi, replacement: 'showing' },
];

function rewriteRubricRuleBased(rubricText, leniency) {
  if (leniency === 50) return rubricText;

  const intensity = Math.abs(leniency - 50) / 50;
  const subs = leniency < 50 ? LENIENT_SUBS : [];
  const modelSubs = leniency < 50 ? LENIENT_MODEL_SUBS : [];

  const activeCount = Math.ceil(subs.length * intensity);
  const activeSubs = subs.slice(0, activeCount);
  const activeModelCount = Math.ceil(modelSubs.length * intensity);
  const activeModelSubs = modelSubs.slice(0, activeModelCount);

  let inModelSection = false;

  return rubricText.split('\n').map(line => {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('--- Model Response ---')) {
      inModelSection = true;
      return line;
    }
    if (trimmed.startsWith('---') && inModelSection) {
      inModelSection = false;
    }

    if (trimmed.startsWith('---') ||
        (trimmed.startsWith('[') && trimmed.match(/\]\s*$/)) ||
        !trimmed) {
      return line;
    }

    let result = line;
    for (const sub of activeSubs) {
      result = result.replace(sub.pattern, sub.replacement);
    }
    if (inModelSection) {
      for (const sub of activeModelSubs) {
        result = result.replace(sub.pattern, sub.replacement);
      }
    }

    const indent = result.match(/^(\s*)/)?.[1] ?? '';
    result = indent + result.trimStart().replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1');
    return result;
  }).join('\n');
}

// ── Test ───────────────────────────────────────────────────────────────

const FULL_RUBRIC = `--- Grading Checklist ---
[IQR & Upper Fence]
  - Clearly states the IQR calculation using Q1 and Q3
  - Must include correct formula for the upper fence
  - Demonstrates mastery of all key concepts AND precise notation

[Outlier Classification]
  - Explicitly identifies whether the maximum exceeds the fence
  - Requires exact comparison with specific values

--- Rubric Targets ---
[IQR & Upper Fence(4 pts)]
  - Calculate the IQR from Q1 and Q3.
                    Target: "IQR = Q3 - Q1 = 32 - 16 = 16"
  - Calculate the upper fence using the 1.5(IQR) rule.
                    Target: "Upper fence = Q3 + 1.5(IQR) = 32 + 24 = 56"
[Outlier Classification(3 pts)]
  - Compare the maximum value to the upper fence.
                    Target: "Since 80 > 56, the maximum IS an outlier"
[Contextual Interpretation(3 pts)]
  - Explain what the outlier might suggest.
                    Target: "This demonstrates that one household had an unusually high bill"

--- Model Response ---
First, I calculated the IQR: IQR = Q3 - Q1 = 32 - 16 = 16. Therefore, the upper fence is Q3 + 1.5(IQR) = 32 + 1.5(16) = 32 + 24 = 56. Since the maximum value is 80, and 80 is greater than 56, the maximum IS an outlier. This demonstrates that one household had an unusually high electricity bill, which should definitely be investigated further.`;

console.log('='.repeat(70));
console.log('FULL RUBRIC + MODEL TEXT REWRITE — leniency=0 (50% lenient)');
console.log('='.repeat(70));

const rewritten = rewriteRubricRuleBased(FULL_RUBRIC, 0);

const origLines = FULL_RUBRIC.split('\n');
const newLines = rewritten.split('\n');

let section = '';
for (let i = 0; i < origLines.length; i++) {
  const t = origLines[i].trim();
  if (t.startsWith('---')) section = t;

  if (origLines[i] !== newLines[i]) {
    console.log(`\n  ${section}`);
    console.log(`  Line ${i + 1}:`);
    console.log(`    BEFORE: ${origLines[i].trim()}`);
    console.log(`    AFTER:  ${newLines[i].trim()}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('REWRITTEN MODEL TEXT SECTION:');
console.log('='.repeat(70));
const modelStart = rewritten.indexOf('--- Model Response ---');
if (modelStart !== -1) {
  console.log(rewritten.slice(modelStart));
} else {
  console.log('  (no model response section found)');
}
