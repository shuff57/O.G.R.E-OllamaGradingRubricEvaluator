// Records what the helpers in grading-server/server.js return for fixed inputs,
// for tests/golden.rs to compare the Rust port against.
//
// The helpers are extracted from server.js by source text, because importing
// the file would start the server. Run from anywhere:
//
//   node record_server_golden.mjs <path to server.js> <path to grading.js> server_golden.json
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [serverPath, gradingPath, outPath] = process.argv.slice(2);
const source = readFileSync(serverPath, 'utf8');
const grading = await import(pathToFileURL(gradingPath).href);
const { extractFirstName, generateScoringAnchors } = grading;

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}
const names = ['parseSweepAdjustments', 'buildBlankResponseFeedback', 'buildBridgeResponses',
  'buildAnchorGenerationPrompt', 'parseAnchorResponses'];
const quiet = { warn() {}, log() {} };
const fns = new Function('extractFirstName', 'console',
  `${names.map(extract).join('\n')}\nreturn { ${names.join(', ')} };`)(extractFirstName, quiet);

const rubricFull = {
  essayPrompt: 'Explain why the sample mean is approximately normal for large n.',
  maxScore: '10',
  checklistItems: [
    { category: 'Understanding (6 pts)', points: 6, items: ['States the Central Limit Theorem', 'Mentions sample size'] },
    { category: 'Communication (4 pts)', points: 4, items: ['Uses complete sentences'] },
  ],
  rubricItems: [{ category: 'Key ideas', items: ['sampling distribution', 'standard error'] }],
  modelText: 'By the CLT the sampling distribution of the mean approaches normal as n grows.',
};
const rubricBare = { maxScore: 4 };
const rubricNoCategory = {
  maxScore: '5.5',
  essayPrompt: '',
  checklistItems: [{ category: '', items: ['Shows the work'] }],
  rubricItems: [{ items: ['slope'] }],
};

const res = (studentIndex, score, feedback = `fb ${studentIndex}`) => ({ studentIndex, score, feedback });
const stu = (index, name) => ({ index, name, response: `answer ${index}` });
const anchors10 = generateScoringAnchors({ maxScore: 10 });
const anchors4 = generateScoringAnchors({ maxScore: 4 });

const bridgeInputs = [
  { name: 'full spread', maxScore: 10, anchors: anchors10,
    results: [res(0, 9.5), res(1, 8), res(2, 7), res(3, 6), res(4, 5), res(5, 4.5), res(6, 3), res(7, 1), res(8, 10), res(9, 6.5)],
    students: [stu(0, 'Ada'), stu(1, 'Ben'), stu(2, 'Cy'), stu(3, 'Di'), stu(4, 'Eve'), stu(5, ''), stu(6, 'Gus'), stu(8, 'Ida'), stu(9, 'Jo')] },
  { name: 'overlapping tiers', maxScore: 10, anchors: anchors10,
    results: [res(3, 8), res(4, 8), res(5, 6), res(6, 2)],
    students: [stu(3, 'Di'), stu(4, 'Eve'), stu(5, 'Fay'), stu(6, 'Gus')] },
  { name: 'sparse falls back to spread', maxScore: 10, anchors: anchors10,
    results: [res(2, 9), res(0, 9.5), res(1, 9)],
    students: [stu(0, 'Ada'), stu(1, 'Ben'), stu(2, 'Cy')] },
  { name: 'single result', maxScore: 10, anchors: anchors10, results: [res(7, 7)], students: [stu(7, 'Hal')] },
  { name: 'two results', maxScore: 10, anchors: anchors10, results: [res(1, 2), res(0, 9)], students: [] },
  { name: 'small maximum', maxScore: 4, anchors: anchors4,
    results: [res(0, 4), res(1, 3.5), res(2, 2.75), res(3, 2), res(4, 1.25), res(5, 0)],
    students: [stu(0, 'Ada'), stu(1, 'Ben'), stu(2, 'Cy'), stu(3, 'Di'), stu(4, 'Eve'), stu(5, 'Fay')] },
  { name: 'ties keep input order', maxScore: 10, anchors: anchors10,
    results: [res(5, 7), res(1, 7), res(3, 7), res(2, 9), res(0, 9), res(4, 3)],
    students: [] },
];

const sweepTexts = [
  '[]',
  '[{"studentIndex": 2, "currentScore": 6, "suggestedScore": 7.5, "suggestedFeedback": "<p>Hi</p>", "reason": "matches peers"}]',
  '```json\n[{"studentIndex": 1, "currentScore": 5, "suggestedScore": 6}]\n```',
  '```\n[{"studentIndex": 1, "suggestedScore": 6}]\n```  ',
  'Here are the changes:\n[{"studentIndex": 4, "currentScore": 8, "suggestedScore": 8}]\nLet me know.',
  'No changes needed.',
  '',
  '[{"studentIndex": 1, "suggestedScore": 6},]',
  '<think>scores [8, 9] look close</think>[]',
  '{"adjustments": [{"studentIndex": 3, "currentScore": 2, "suggestedScore": 4}]}',
  '[1, "two", {"studentIndex": "3", "currentScore": 2, "suggestedScore": "4"}]',
  '  [ ]  ',
  '] [',
];

const blankInputs = [
  { rubric: rubricFull, student: { index: 0, name: 'Avery, Sam' } },
  { rubric: rubricFull, student: { index: 1, name: '' } },
  { rubric: rubricBare, student: { index: 2, name: 'Jordan Lee' } },
  { rubric: rubricNoCategory, student: { index: 3, name: 'Kim' } },
];

const promptInputs = [
  { rubric: rubricFull, leniency: null },
  { rubric: rubricFull, leniency: 50 },
  { rubric: rubricFull, leniency: 20 },
  { rubric: rubricFull, leniency: 80 },
  { rubric: rubricFull, leniency: 37.5 },
  { rubric: rubricFull, leniency: 0 },
  { rubric: rubricBare, leniency: null },
  { rubric: rubricNoCategory, leniency: 100 },
];

const anchorTexts = [
  { rubric: rubricFull, text: 'EXCELLENT (10/10):\nThe CLT says means are normal.\n\nADEQUATE (8/10):\nMeans get normal.\n\nBELOW AVERAGE (7/10):\nIt is normal.\n\nMINIMAL (5/10):\nidk' },
  { rubric: rubricFull, text: '**Excellent (10/10)**\nGreat answer here.\n\n**Adequate (8/10)** : fine answer\n\nbelow   average (7/10) weak answer\n\nMinimal (5/10):' },
  { rubric: rubricFull, text: 'Excellent (10/10): only this tier' },
  { rubric: rubricFull, text: 'Nothing useful.' },
  { rubric: rubricFull, text: 'Minimal (5/10): last first\nExcellent (10/10): then best\nAdequate (8/10): then ok' },
  { rubric: rubricFull, text: 'EXCELLENT (9/10): wrong score in header\nADEQUATE (8/10): right one\nBelow Average(7/10):no spaces\nMINIMAL  (5/10)  :  spaced' },
  { rubric: rubricBare, text: 'EXCELLENT (3.8/4):\nA\nADEQUATE (3.2/4):\nB\nBELOW AVERAGE (2.6/4):\nC\nMINIMAL (1.8/4):\nD' },
  { rubric: rubricBare, text: 'EXCELLENT (3x8/4): dot matches any character\nADEQUATE (3.2/4): é ünïcödé ✓\n' },
  { rubric: rubricFull, text: 'Excellent (10/10): first\nExcellent (10/10): repeated header\nAdequate (8/10): ok\nAdequate (8/10): again' },
];

const out = {
  bridges: bridgeInputs.map(c => ({ ...c, expected: fns.buildBridgeResponses(c.results, c.students, c.anchors, c.maxScore) })),
  sweepAdjustments: sweepTexts.map(text => ({ text, expected: fns.parseSweepAdjustments(text, 'test') })),
  blankFeedback: blankInputs.map(c => ({ ...c, expected: fns.buildBlankResponseFeedback(c.rubric, c.student) })),
  anchorPrompts: promptInputs.map(c => ({ ...c, expected: fns.buildAnchorGenerationPrompt(c.rubric, generateScoringAnchors(c.rubric), c.leniency) })),
  anchorResponses: anchorTexts.map(c => {
    const maxScore = parseFloat(c.rubric.maxScore) || 10;
    return { ...c, expected: fns.parseAnchorResponses(c.text, generateScoringAnchors(c.rubric), maxScore) };
  }),
};
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(', '));
