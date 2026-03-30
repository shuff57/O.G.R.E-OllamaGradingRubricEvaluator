/**
 * Robust pipeline benchmark — individual calls with long timeouts.
 * Usage: node _pipeline-bench-robust.mjs <model> <label>
 */
import { readFileSync, writeFileSync } from 'fs';
import { buildBatchPrompt, generateScoringAnchors } from '../grading-server/grading.js';

const MODEL = process.argv[2] || 'glm-5:cloud';
const LABEL = process.argv[3] || 'test';

const data = JSON.parse(readFileSync('C:/tmp/mom-benchmark-data.json', 'utf8'));
const allStudents = data.students.filter(s => s.response.trim().length > 5);

const rubric = {
  essayPrompt: allStudents[0].prompt,
  checklistItems: [
    { category: 'Outlier Impact', points: 2.5, items: ['Explain how the extreme value in the dataset affects the mean.'] },
    { category: 'Recommendation', points: 3.75, items: ['State whether mean or median is the better measure of center for this dataset.', 'Explain why the chosen measure is resistant to outliers.'] },
    { category: 'Practical Interpretation', points: 3.75, items: ['Interpret what the recommended measure tells the audience in context.'] },
  ],
  rubricItems: [],
  modelText: null,
  maxScore: '4',
};

const anchors = generateScoringAnchors(rubric);

console.log(`Pipeline Benchmark (robust): ${MODEL} (${LABEL})`);
console.log(`${allStudents.length} students\n`);

const allResults = [];
const startTime = Date.now();

for (const student of allStudents) {
  const sRubric = { ...rubric, essayPrompt: student.prompt };
  const prompt = buildBatchPrompt(sRubric, [student], anchors);

  let score = null;
  let feedback = '';
  let virtualScore = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout

      const resp = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { temperature: 0.2, num_predict: 4096 }
        })
      });
      clearTimeout(timeout);

      const respData = await resp.json();
      const text = (respData.message?.content || '') + ' ' + (respData.message?.thinking || '');

      // Try JSON array
      const arrMatch = text.match(/\[[\s\S]*?\]/);
      if (arrMatch) {
        try {
          const arr = JSON.parse(arrMatch[0]);
          if (arr[0]?.score !== undefined) {
            virtualScore = parseFloat(arr[0].score);
            feedback = (arr[0].feedback || '').substring(0, 150);
          }
        } catch {}
      }

      // Try JSON object
      if (virtualScore === null) {
        const objMatch = text.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
        if (objMatch) {
          try {
            const obj = JSON.parse(objMatch[0]);
            virtualScore = parseFloat(obj.score);
            feedback = (obj.feedback || '').substring(0, 150);
          } catch {}
        }
      }

      // Try raw score extraction
      if (virtualScore === null) {
        const rawMatch = text.match(/"score"\s*:\s*(\d+\.?\d*)/);
        if (rawMatch) {
          virtualScore = parseFloat(rawMatch[1]);
          feedback = 'extracted';
        }
      }

      if (virtualScore !== null) break;
    } catch (err) {
      if (attempt === 0) {
        process.stdout.write('R');
        continue;
      }
      console.log(`  ${student.name}: ERROR ${err.message}`);
    }
  }

  if (virtualScore !== null) {
    const factor = 10 / 4; // virtual 10 -> real 4
    score = virtualScore / factor;
    if (score > 4) score = 4;
    if (score < 0) score = 0;
    score = Math.round(score * 4) / 4;

    allResults.push({
      name: student.name,
      currentScore: student.currentScore,
      score,
      virtualScore,
      feedback,
    });
    console.log(`  ${student.name.padEnd(26)} ${score.toFixed(2)}/4 (virtual ${virtualScore}/10)`);
  } else {
    console.log(`  ${student.name.padEnd(26)} FAILED`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s. ${allResults.length}/${allStudents.length} graded.`);

const outFile = `C:/tmp/pipeline-${LABEL}-run1.json`;
writeFileSync(outFile, JSON.stringify(allResults, null, 2));
console.log(`Saved to ${outFile}`);
