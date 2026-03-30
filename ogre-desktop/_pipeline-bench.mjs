/**
 * Full-pipeline benchmark: builds the exact production prompt via buildBatchPrompt,
 * then calls each model 3 times to measure consistency.
 *
 * Usage: node _pipeline-bench.mjs <model> <label> <run#>
 *   model: ollama model name OR "sonnet" for Claude subagent
 *   label: short label for output files
 *   run#:  1, 2, or 3
 */
import { readFileSync, writeFileSync } from 'fs';
import { buildBatchPrompt, generateScoringAnchors } from '../grading-server/grading.js';

const MODEL = process.argv[2] || 'glm-5:cloud';
const LABEL = process.argv[3] || 'test';
const RUN = process.argv[4] || '1';

// Load benchmark data
const data = JSON.parse(readFileSync('C:/tmp/mom-benchmark-data.json', 'utf8'));
const allStudents = data.students.filter(s => s.response.trim().length > 5);

// Build rubric object matching what the grading server expects
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

// Generate scoring anchors (same as server does)
const anchors = generateScoringAnchors(rubric);

// Group by version fingerprint
function fingerprint(prompt) {
  return prompt.replace(/\$[\d,]+\.?\d*/g, '#').replace(/[\d,]+\.?\d*/g, '#').replace(/\s+/g, ' ').trim().substring(0, 200);
}

const versionMap = {};
for (const s of allStudents) {
  const fp = fingerprint(s.prompt);
  if (!versionMap[fp]) versionMap[fp] = [];
  versionMap[fp].push(s);
}
const versions = Object.values(versionMap);

console.log(`Pipeline Benchmark: ${MODEL} (${LABEL} run ${RUN})`);
console.log(`${allStudents.length} students, ${versions.length} versions\n`);

const allResults = [];
const startTime = Date.now();

for (let v = 0; v < versions.length; v++) {
  const group = versions[v];

  // Build the version-specific rubric with the right essayPrompt
  const vRubric = { ...rubric, essayPrompt: group[0].prompt };

  // Build the FULL pipeline prompt using the actual production function
  const prompt = buildBatchPrompt(vRubric, group, anchors);

  console.log(`Version ${v + 1} (${group.length} students): prompt length ${prompt.length} chars`);

  let parsed = null;

  if (MODEL === 'sonnet') {
    // For Sonnet we can't call via API, so we'll output the prompt for the subagent
    // Actually we'll handle Sonnet separately — skip here
    console.log('  (Sonnet handled by subagent — skipping Ollama call)');
    continue;
  }

  // Call Ollama
  try {
    const resp = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.2, num_predict: 8192 }
      })
    });

    const respData = await resp.json();
    const content = respData.message?.content || '';
    const thinking = respData.message?.thinking || '';
    const text = content || thinking;

    // Extract JSON array
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        console.log(`  JSON parse error: ${e.message}`);
      }
    }

    if (!parsed) {
      console.log(`  Batch failed, trying individually...`);
      parsed = [];
      for (const s of group) {
        const singleRubric = { ...rubric, essayPrompt: s.prompt };
        const singlePrompt = buildBatchPrompt(singleRubric, [s], anchors);

        const sr = await fetch("http://localhost:11434/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: singlePrompt }],
            stream: false,
            options: { temperature: 0.2, num_predict: 4096 }
          })
        });
        const sd = await sr.json();
        const st = (sd.message?.content || '') + ' ' + (sd.message?.thinking || '');
        const sm = st.match(/\[[\s\S]*?\]/) || st.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
        if (sm) {
          try {
            const sp = JSON.parse(sm[0]);
            const arr = Array.isArray(sp) ? sp : [sp];
            parsed.push(...arr);
            process.stdout.write('.');
          } catch {
            process.stdout.write('x');
          }
        } else {
          // Extract score from text
          const scoreM = st.match(/\"score\"\s*:\s*(\d+\.?\d*)/);
          if (scoreM) {
            parsed.push({ studentIndex: s.index, score: parseFloat(scoreM[1]), feedback: 'extracted' });
            process.stdout.write('~');
          } else {
            process.stdout.write('!');
          }
        }
      }
      console.log('');
    }

    if (parsed && parsed.length > 0) {
      // The scores come back on the virtual 0-10 scale — convert to /4
      const maxScore = 4;
      const factor = 10 / maxScore; // = 2.5

      for (let i = 0; i < parsed.length && i < group.length; i++) {
        const r = parsed[i];
        let score = parseFloat(r.score);
        if (isNaN(score)) continue;
        // Descale from virtual-10 to real maxScore
        score = score / factor;
        if (score > maxScore) score = maxScore;
        if (score < 0) score = 0;
        // Snap to 0.25
        score = Math.round(score * 4) / 4;

        const student = group[i];
        allResults.push({
          name: student.name,
          currentScore: student.currentScore,
          score: score,
          virtualScore: parseFloat(r.score),
          feedback: (r.feedback || '').substring(0, 150),
        });
        console.log(`  ${student.name.padEnd(26)} ${score.toFixed(2)}/4 (virtual ${r.score}/10)`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s. ${allResults.length}/${allStudents.length} graded.`);

// Save
const outFile = `C:/tmp/pipeline-${LABEL}-run${RUN}.json`;
writeFileSync(outFile, JSON.stringify(allResults, null, 2));
console.log(`Saved to ${outFile}`);

// Print summary
console.log('\nName'.padEnd(28) + 'Score'.padStart(7));
console.log('-'.repeat(35));
for (const r of allResults.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(r.name.padEnd(28) + r.score.toFixed(2).padStart(7));
}
