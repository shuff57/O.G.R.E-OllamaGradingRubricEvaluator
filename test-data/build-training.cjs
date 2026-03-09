/**
 * build-training.js
 * Rebuilds finetune-grading.jsonl from three sources:
 *   1. 166 original entries — HTML stripped, format preserved
 *   2. 52 new entries (finetune-gptoss-qwen.jsonl) — converted to old format
 *   3. 39 synthetic entries — 11 curriculum gap topics × 3 quality levels
 *                           + 1 chi-square calibration topic × 6 entries
 */

const fs = require('fs');
const path = require('path');

// ── Constants (match production grading.js exactly) ──────────────────────────

const SYSTEM = "You are an expert grading assistant. If the student's work is provided as an image, transcribe it verbatim before grading. Then grade against the provided rubric. Output: JSON object only.";

const PHILOSOPHY = `Grade each response against the rubric criteria provided:
- Award credit proportional to how thoroughly each rubric criterion is met, not response length
- Evaluate what the student demonstrated, not what they omitted
- Use the full scoring range (0-10) as defined by the scoring anchors -- do not compress toward the middle
- Treat scoring-scale descriptors as calibration references when assigning a score
- Off-topic, empty, or nonsensical responses receive a score of 0
- When no custom instructions are provided, grade solely on rubric alignment
- Instructor custom instructions (if any) take absolute precedence over this base philosophy
- A concise answer that addresses all rubric criteria is equivalent to a longer one that does the same`;

const PARTIAL_CREDIT = `PARTIAL CREDIT RULE: When a criterion is addressed conceptually but lacks specific values, formulas, or concrete evidence, award 40-60% of that criterion's points. Award 20-40% if only loosely related; 60-80% if substantially complete but missing one key element. Evaluate each criterion INDEPENDENTLY - do not let strength on one compensate for weakness on another.`;

const SCORING_SCALE = `0: No submission or completely blank
1: Off-topic: response does not address the question at all
2: Minimal effort: mentions the topic but shows almost no understanding
3: Very limited: some awareness of concepts but largely incomplete
4: Partial: shows basic familiarity but misses most key criteria
5: Developing: demonstrates partial understanding, covers some key points
6: Approaching: addresses main ideas but with notable gaps or errors
7: Competent: addresses most rubric criteria adequately
8: Proficient: correctly addresses all rubric criteria
9: Strong: thorough and accurate with clear explanation
10: Excellent: comprehensive, precise, and clearly communicated`;

const RESPONSE_FORMAT = `Return ONLY valid JSON. No markdown code fences. No explanation text.\n{"transcription": "<student's response verbatim>", "score": <0-10>}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const content = text.slice(start + startMarker.length);
  const end = endMarker ? content.indexOf(endMarker) : content.length;
  return content.slice(0, end === -1 ? content.length : end).trim();
}

function buildUserPrompt({ essayPrompt, checklistItems, keyConceptsText, modelText, studentWork }) {
  let p = `GRADING PHILOSOPHY:\n${PHILOSOPHY}\n\nMAX SCORE: 10\n\nQUESTION/PROMPT:\n${essayPrompt}\n`;

  if (checklistItems && checklistItems.length > 0) {
    p += '\nGRADING CHECKLIST:\n';
    for (const item of checklistItems) {
      p += `- ${item.category} (${item.points} points)\n`;
      for (const sub of (item.items || [])) p += `  - ${sub}\n`;
    }
    p += `\n${PARTIAL_CREDIT}\n`;
  }

  if (keyConceptsText) {
    p += `\nKEY CONCEPTS TO ADDRESS:\n${keyConceptsText}\n`;
  }

  if (modelText) {
    p += `\nMODEL RESPONSE (for reference):\n${modelText}\n`;
  }

  p += `\nSCORING SCALE:\n${SCORING_SCALE}\n\nSTUDENT WORK:\n${studentWork}\n\nRESPONSE FORMAT:\n${RESPONSE_FORMAT}`;
  return p;
}

function makeEntry(parts, score) {
  return {
    messages: [
      { role: 'system',    content: SYSTEM },
      { role: 'user',      content: buildUserPrompt(parts) },
      { role: 'assistant', content: JSON.stringify({ transcription: parts.studentWork, score }) },
    ]
  };
}

// ── Additional format helpers ─────────────────────────────────────────────────

/**
 * Builds a user prompt for CALCULATION-style rubrics.
 * Uses "EXPECTED SOLUTION STEPS:" header instead of a checklist.
 */
function buildCalcPrompt({ essayPrompt, solutionSteps, studentWork }) {
  let p = `GRADING PHILOSOPHY:\n${PHILOSOPHY}\n\nMAX SCORE: 10\n\nQUESTION/PROMPT:\n${essayPrompt}\n`;
  p += `\nEXPECTED SOLUTION STEPS:\n${solutionSteps}\n`;
  p += `\n${PARTIAL_CREDIT}\n`;
  p += `\nSCORING SCALE:\n${SCORING_SCALE}\n\nSTUDENT WORK:\n${studentWork}\n\nRESPONSE FORMAT:\n${RESPONSE_FORMAT}`;
  return p;
}

function makeCalcEntry(parts, score) {
  return {
    messages: [
      { role: 'system',    content: SYSTEM },
      { role: 'user',      content: buildCalcPrompt(parts) },
      { role: 'assistant', content: JSON.stringify({ transcription: parts.studentWork, score }) },
    ]
  };
}

/**
 * Builds a user prompt for NARRATIVE rubrics.
 * Uses "WHAT TO LOOK FOR:" header — prose description of quality indicators.
 */
function buildNarrativePrompt({ essayPrompt, whatToLookFor, studentWork }) {
  let p = `GRADING PHILOSOPHY:\n${PHILOSOPHY}\n\nMAX SCORE: 10\n\nQUESTION/PROMPT:\n${essayPrompt}\n`;
  p += `\nWHAT TO LOOK FOR:\n${whatToLookFor}\n`;
  p += `\nSCORING SCALE:\n${SCORING_SCALE}\n\nSTUDENT WORK:\n${studentWork}\n\nRESPONSE FORMAT:\n${RESPONSE_FORMAT}`;
  return p;
}

function makeNarrativeEntry(parts, score) {
  return {
    messages: [
      { role: 'system',    content: SYSTEM },
      { role: 'user',      content: buildNarrativePrompt(parts) },
      { role: 'assistant', content: JSON.stringify({ transcription: parts.studentWork, score }) },
    ]
  };
}

/**
 * Builds a user prompt for HOLISTIC ANCHOR rubrics.
 * Uses "SCORING GUIDE:" header — describes what each score band looks like.
 */
function buildHolisticPrompt({ essayPrompt, scoringGuide, studentWork }) {
  let p = `GRADING PHILOSOPHY:\n${PHILOSOPHY}\n\nMAX SCORE: 10\n\nQUESTION/PROMPT:\n${essayPrompt}\n`;
  p += `\nSCORING GUIDE:\n${scoringGuide}\n`;
  p += `\nSCORING SCALE:\n${SCORING_SCALE}\n\nSTUDENT WORK:\n${studentWork}\n\nRESPONSE FORMAT:\n${RESPONSE_FORMAT}`;
  return p;
}

function makeHolisticEntry(parts, score) {
  return {
    messages: [
      { role: 'system',    content: SYSTEM },
      { role: 'user',      content: buildHolisticPrompt(parts) },
      { role: 'assistant', content: JSON.stringify({ transcription: parts.studentWork, score }) },
    ]
  };
}

// ── STEP 1: Process original 166 entries — filter, then strip HTML ───────────
//   Rules:
//     - Drop score-0 entries (blank/off-topic, not useful for partial-credit training)
//     - Keep at most 1 entry per exact score per topic (longest response wins)
//     - Chi-square absences topic: hard cap of 4 (well-covered by real student data)

const oldLines = fs.readFileSync(path.join(__dirname, 'training-sources', 'finetune-grading-original.jsonl'), 'utf8').trim().split('\n');

// Group raw entries by topic key
const rawTopicMap = {};
oldLines.forEach((l, i) => {
  const o        = JSON.parse(l);
  const user     = o.messages[1].content;
  const qpRaw    = getSection(user, 'QUESTION/PROMPT:\n', '\n\nGRADING CHECKLIST:') || '';
  const topicKey = qpRaw.replace(/\.ru[\s\S]*/i, '').trim().slice(0, 80);
  if (!rawTopicMap[topicKey]) rawTopicMap[topicKey] = [];
  const score = JSON.parse(o.messages[2].content).score;
  const resp  = getSection(user, 'STUDENT WORK:\n', '\n\nRESPONSE FORMAT:');
  rawTopicMap[topicKey].push({ score, respLen: resp.length, lineIdx: i });
});

const chiKey = Object.keys(rawTopicMap).find(k => k.includes('school nurse'));

const keepLineSet = new Set();
Object.entries(rawTopicMap).forEach(([key, entries]) => {
  const maxTotal = key === chiKey ? 4 : Infinity;
  const valid    = entries.filter(e => e.score > 0);
  const byScore  = {};
  valid.forEach(e => { if (!byScore[e.score]) byScore[e.score] = []; byScore[e.score].push(e); });
  const selected = Object.values(byScore)
    .map(g => g.sort((a, b) => b.respLen - a.respLen)[0])
    .sort((a, b) => a.score - b.score)
    .slice(0, maxTotal);
  selected.forEach(e => keepLineSet.add(e.lineIdx));
});

let oldErrors = 0;

const oldEntries = oldLines.map((l, i) => {
  if (!keepLineSet.has(i)) return null;
  try {
    const o = JSON.parse(l);
    const user = o.messages[1].content;

    const qpRaw = getSection(user, 'QUESTION/PROMPT:\n', '\n\nGRADING CHECKLIST:')
               || getSection(user, 'QUESTION/PROMPT:\n', '\n\nPARTIAL CREDIT RULE:')
               || getSection(user, 'QUESTION/PROMPT:\n', '\n\nKEY CONCEPTS');

    const checklistRaw = getSection(user, 'GRADING CHECKLIST:\n', '\n\nPARTIAL CREDIT RULE:');
    const kcRaw        = getSection(user, 'KEY CONCEPTS TO ADDRESS:\n', '\n\nMODEL RESPONSE');
    const modelRaw     = getSection(user, 'MODEL RESPONSE (for reference):\n', '\n\nSCORING')
                      || getSection(user, 'MODEL RESPONSE:\n', '\n\nSCORING');
    const studentRaw   = getSection(user, 'STUDENT WORK:\n', '\n\nRESPONSE FORMAT:');

    // Strip HTML — everything from .ru onwards
    const essayPrompt = qpRaw.replace(/\s*\.ru[^\n]*/gi, '').trim();

    // Re-parse checklist
    const checklistItems = [];
    if (checklistRaw) {
      let current = null;
      for (const line of checklistRaw.split('\n')) {
        if (line.startsWith('- ')) {
          const m = line.slice(2).match(/^(.+?)\s+\((\d+)\s+points?\)$/);
          if (m) {
            current = { category: `${m[1]} (${m[2]} pts)`, points: parseInt(m[2]), items: [] };
            checklistItems.push(current);
          }
        } else if (line.startsWith('  - ') && current) {
          current.items.push(line.slice(4).trim());
        }
      }
    }

    const keyConceptsText = kcRaw
      ? kcRaw.split('\n').filter(l => !l.trim().startsWith('Target:')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
      : '';

    const score = JSON.parse(o.messages[2].content).score;
    return makeEntry({ essayPrompt, checklistItems, keyConceptsText, modelText: modelRaw, studentWork: studentRaw }, score);
  } catch (e) {
    console.error('OLD ERROR line', i + 1, e.message);
    oldErrors++;
    return null;
  }
}).filter(Boolean);

console.log(`Step 1: ${oldEntries.length} old entries kept from 166 (${oldErrors} errors, ${166 - oldEntries.length - oldErrors} filtered out)`);

// ── STEP 2: Convert 52 new entries to old format ─────────────────────────────

function parseNewFormat(user) {
  const body = user.replace(/^GRADING RUBRIC\s*\n/, '').trim();

  const epIdx    = body.indexOf('Essay Prompt:');
  const scenario = epIdx > 0 ? body.slice(0, epIdx).trim() : '';
  const afterEp  = epIdx >= 0 ? body.slice(epIdx + 14).trim() : body;

  const coverIdx  = afterEp.indexOf('\nIn your explanation, be sure to cover:');
  const epText    = coverIdx >= 0 ? afterEp.slice(0, coverIdx).trim() : afterEp.split('\n\n')[0].trim();

  const scoringIdx = afterEp.indexOf('\nScoring Criteria');
  const coverRaw   = (coverIdx >= 0 && scoringIdx >= 0)
    ? afterEp.slice(coverIdx + 40, scoringIdx).trim()
    : '';

  const coverInline = coverRaw
    .split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean).join('. ');

  const fullEssayPrompt = [
    scenario,
    `Essay Prompt: ${epText}`,
    coverInline ? `In your explanation, be sure to cover: ${coverInline}.` : '',
  ].filter(Boolean).join(' ');

  // Parse Scoring Criteria → checklistItems
  const checklistItems = [];
  const kcStart    = afterEp.indexOf('\nKey Concepts to Address:');
  const srStart    = afterEp.indexOf('\nSTUDENT RESPONSE:');
  const scoringText = scoringIdx >= 0 && kcStart >= 0
    ? afterEp.slice(scoringIdx, kcStart).trim()
    : '';

  if (scoringText) {
    let current = null;
    for (const line of scoringText.split('\n')) {
      const catMatch = line.match(/^([^(]+)\s+\((\d+)\s+pts?\)[^:]*:/);
      if (catMatch) {
        current = { category: `${catMatch[1].trim()} (${catMatch[2]} pts)`, points: parseInt(catMatch[2]), items: [] };
        checklistItems.push(current);
      } else if (line.startsWith('  - ') && current) {
        current.items.push(line.slice(4).trim());
      }
    }
  }

  const kcEnd          = srStart >= 0 ? srStart : afterEp.length;
  const keyConceptsText = kcStart >= 0 ? afterEp.slice(kcStart + 25, kcEnd).trim() : '';
  const studentWork    = srStart >= 0 ? afterEp.slice(srStart + 18).trim() : '';

  return { essayPrompt: fullEssayPrompt, checklistItems, keyConceptsText, modelText: '', studentWork };
}

const newLines = fs.readFileSync(path.join(__dirname, 'training-sources', 'finetune-gptoss-qwen.jsonl'), 'utf8').trim().split('\n');
let newErrors = 0;

const newEntries = newLines.map((l, i) => {
  try {
    const o     = JSON.parse(l);
    const parts = parseNewFormat(o.messages[1].content);
    const score = JSON.parse(o.messages[2].content).score;
    return makeEntry(parts, score);
  } catch (e) {
    console.error('NEW ERROR line', i + 1, e.message);
    newErrors++;
    return null;
  }
}).filter(Boolean);

console.log(`Step 2: ${newEntries.length} new entries converted (${newErrors} errors)`);

// ── STEP 3: 27 synthetic entries for 9 curriculum gap topics ─────────────────
// 3 responses per topic: weak (score 2-3), partial (5-6), strong (8-9)

const syntheticTopics = [

  // ── 1. Experimental Design ────────────────────────────────────────────────
  {
    essayPrompt: `Researchers want to test whether a new study app improves exam scores. They allow students to choose whether or not to use the app, then compare final exam scores between the two groups. Essay Prompt: Identify whether this is an experiment or an observational study, and explain why. Identify at least one potential confounding variable and explain why it is a concern. Then explain how random assignment would improve the study design. In your explanation, be sure to cover: Whether the study is experimental or observational and why. A specific confounding variable and how it could distort results. How random assignment would address the problem.`,
    checklistItems: [
      { category: 'Study Type (3 pts)', points: 3, items: ['Correctly identifies as an observational study (students self-select; no random assignment)', 'Explains what distinguishes an experiment from an observational study'] },
      { category: 'Confounding Variable (3 pts)', points: 3, items: ['Names a plausible confounder (e.g., motivation, prior GPA, available study time)', 'Explains how it affects both app use and exam scores, creating a spurious association'] },
      { category: 'Random Assignment (4 pts)', points: 4, items: ['Explains that random assignment would turn this into an experiment', 'Describes how it distributes confounders evenly across groups, isolating the app\'s effect'] },
    ],
    modelText: `This is an observational study because students choose whether to use the app — there is no random assignment. A key confounding variable is student motivation: highly motivated students are more likely to both use the app and study harder, inflating the apparent benefit of the app. Random assignment would fix this by randomly placing students into app-use and no-app groups, distributing motivation levels (and other potential confounders) roughly equally across both groups. Any remaining difference in exam scores could then be more confidently attributed to the app itself rather than pre-existing differences between groups.`,
    entries: [
      { score: 3, response: `This is an experiment because they are comparing two groups. Students who use the app might already be better students so that could affect the results. If you randomly assigned students it would be more fair.` },
      { score: 6, response: `This study is observational because the students get to choose whether to use the app or not — the researchers aren't assigning treatments. A confounding variable is motivation: students who choose to use the app might also be more likely to study more in general, making it look like the app is helping when really it's the extra studying. Random assignment would help because it would distribute motivation levels evenly between the two groups so you can't blame motivation for the difference.` },
      { score: 9, response: `This is an observational study, not an experiment. The key distinction is that there is no random assignment — students self-select into using the app or not. This creates a serious problem with confounding. For example, motivation is a strong confounder: students who choose to download and use a study app are likely more motivated to begin with, and that motivation independently improves their exam scores. So even if the app has no real effect, app users would appear to score higher just because of their greater motivation.\n\nRandom assignment would solve this by using a random process (coin flip, random number generator) to decide which students use the app. This way, motivation levels, prior GPA, and other confounders are distributed roughly equally across both groups by chance. Any remaining score difference can then be attributed to the app itself rather than pre-existing student characteristics, making this a true experiment.` },
    ],
  },

  // ── 2. Conditional Probability ────────────────────────────────────────────
  {
    essayPrompt: `A rare disease affects 1% of the population. A diagnostic test for the disease has a sensitivity of 90% (it correctly identifies 90% of people who have the disease) and a specificity of 85% (it correctly identifies 85% of people who do not have the disease). A randomly selected person tests positive. Essay Prompt: Using a hypothetical population of 10,000 people, calculate the probability that a person who tests positive actually has the disease. Show all steps. Interpret your result in plain language. In your explanation, be sure to cover: The setup using a frequency table or tree diagram with 10,000 people. The correct calculation of P(disease | positive). A plain-language interpretation of what your answer means.`,
    checklistItems: [
      { category: 'Setup (3 pts)', points: 3, items: ['Correctly computes the four cell counts: true positives, false positives, false negatives, true negatives using 10,000 base', 'Identifies: diseased=100, not diseased=9900, TP=90, FP=1485'] },
      { category: 'Calculation (4 pts)', points: 4, items: ['Correctly computes P(disease | +) = TP / (TP + FP) = 90 / (90 + 1485) ≈ 0.057 or about 5.7%'] },
      { category: 'Interpretation (3 pts)', points: 3, items: ['Explains that even with a positive test, there is only about a 5.7% chance the person actually has the disease', 'Connects this to the low base rate of the disease (1%)'] },
    ],
    modelText: `Starting with 10,000 people: 1% have the disease, so 100 are diseased and 9,900 are not. Of the 100 diseased, 90% test positive → 90 true positives, 10 false negatives. Of the 9,900 healthy, 15% test positive (1 − specificity) → 1,485 false positives, 8,415 true negatives. Total positives = 90 + 1,485 = 1,575. P(disease | positive) = 90/1,575 ≈ 0.057 or about 5.7%. This means that even if someone tests positive, there is still only about a 5.7% chance they actually have the disease. This seems counterintuitive, but it happens because the disease is so rare — most positive tests come from the large pool of healthy people.`,
    entries: [
      { score: 2, response: `The probability is 90% because that is the sensitivity of the test. If the test is 90% accurate then 90% of positive tests are correct.` },
      { score: 5, response: `Using 10,000 people: 100 have the disease and 9900 don't. Of the 100 sick people, 90 test positive (true positives). Of the 9900 healthy people, 85% test negative so 15% test positive which is 1485 false positives. Total positives = 90 + 1485 = 1575. P(disease | positive) = 90/1575 = about 5.7%. So the chance of actually having the disease given a positive test is only 5.7%.` },
      { score: 9, response: `Setting up a frequency table with 10,000 people:\n- Diseased: 1% × 10,000 = 100 people\n- Not diseased: 9,900 people\n\nAmong the 100 diseased: 90% sensitivity → 90 test positive (true positives), 10 test negative (false negatives).\nAmong the 9,900 healthy: 85% specificity → 15% test positive → 9,900 × 0.15 = 1,485 false positives; 8,415 true negatives.\n\nTotal who test positive = 90 + 1,485 = 1,575\nP(disease | positive test) = 90 / 1,575 ≈ 0.057 ≈ 5.7%\n\nInterpretation: Even though the test is quite accurate (90% sensitive, 85% specific), a person who tests positive has only about a 5.7% chance of actually having the disease. This seems surprising but makes sense because the disease is very rare — only 1 in 100 people have it. The large healthy population generates many more false positives (1,485) than the small diseased group generates true positives (90), swamping the signal.` },
    ],
  },

  // ── 3. Binomial Distribution ──────────────────────────────────────────────
  {
    essayPrompt: `A basketball player makes 70% of her free throw attempts. In a particular game she is fouled and takes 8 free throws. Essay Prompt: Calculate the probability that she makes exactly 5 of the 8 free throws. Show your work using the binomial formula. Then verify that the four conditions for a binomial setting are met in this context. In your explanation, be sure to cover: The four binomial conditions and how each applies here. The binomial formula and the correct substitution of values. The final probability and a brief interpretation.`,
    checklistItems: [
      { category: 'Binomial Conditions (3 pts)', points: 3, items: ['States all four conditions: fixed n, binary outcome, independent trials, constant p', 'Verifies each condition applies: n=8 fixed, make/miss binary, shots independent, p=0.70 constant'] },
      { category: 'Calculation (4 pts)', points: 4, items: ['Correctly applies P(X=5) = C(8,5) × (0.70)^5 × (0.30)^3', 'C(8,5) = 56; (0.70)^5 ≈ 0.16807; (0.30)^3 = 0.027; P ≈ 56 × 0.16807 × 0.027 ≈ 0.254'] },
      { category: 'Interpretation (3 pts)', points: 3, items: ['States the probability clearly: approximately 25.4%', 'Explains what this means in context of the game'] },
    ],
    modelText: `Conditions: (1) Fixed n=8 free throws. (2) Binary outcome: make or miss. (3) Independence: each free throw outcome doesn't affect the others. (4) Constant probability p=0.70. All four conditions are satisfied, so binomial applies.\n\nP(X=5) = C(8,5) × (0.70)^5 × (0.30)^3 = 56 × 0.16807 × 0.027 ≈ 56 × 0.004538 ≈ 0.254\n\nThere is approximately a 25.4% probability that she makes exactly 5 of the 8 free throws. This is the most likely single outcome, though still less than 1-in-3 — showing that even likely events don't always occur.`,
    entries: [
      { score: 3, response: `The probability would be 70% times 5 because she makes 70% of shots and we want 5 made. So 0.70 × 5 = 3.5 which doesn't make sense as a probability. The binomial distribution is used when you have yes or no outcomes and a fixed number of trials.` },
      { score: 6, response: `The four binomial conditions are: fixed n (8 shots), binary outcome (make or miss), independent trials (each shot doesn't affect the next), and constant probability (p=0.70 each time). All are met here.\n\nUsing the binomial formula: P(X=5) = C(8,5)(0.70)^5(0.30)^3\nC(8,5) = 56\n(0.70)^5 = 0.168\n(0.30)^3 = 0.027\nP = 56 × 0.168 × 0.027 ≈ 0.254\n\nSo there is about a 25% chance she makes exactly 5 of 8.` },
      { score: 9, response: `Verifying binomial conditions:\n1. Fixed n: Yes, she takes exactly 8 free throws.\n2. Binary outcome: Yes, each shot is either made (success) or missed (failure).\n3. Independent trials: Yes, each free throw is independent — making or missing one doesn't change her probability on the next.\n4. Constant p: Yes, p = 0.70 for each attempt.\n\nAll four conditions are satisfied, so we can apply the binomial formula.\n\nP(X = 5) = C(8,5) × (0.70)^5 × (0.30)^3\n= 56 × 0.16807 × 0.027\n= 56 × 0.004538\n≈ 0.2541\n\nThere is approximately a 25.4% probability that she makes exactly 5 of the 8 free throws. This is actually the single most probable outcome (making exactly 5), which makes intuitive sense since the expected number of makes is 8 × 0.70 = 5.6, and the distribution peaks near there.` },
    ],
  },

  // ── 4. Sampling Distributions / CLT ──────────────────────────────────────
  {
    essayPrompt: `The time college students spend on homework per night is normally distributed with a mean of μ = 90 minutes and a standard deviation of σ = 25 minutes. You plan to take a random sample of n = 25 students. Essay Prompt: Describe the sampling distribution of the sample mean x̄. State its shape, mean, and standard error. Then calculate the probability that the sample mean is greater than 96 minutes. In your explanation, be sure to cover: The shape, mean, and standard error of the sampling distribution of x̄. How you know the shape (reference the relevant theorem or condition). The probability calculation with work shown.`,
    checklistItems: [
      { category: 'Shape and Justification (2 pts)', points: 2, items: ['States shape is normal', 'Justifies using either: population is normal (direct), or Central Limit Theorem for large n'] },
      { category: 'Mean and Standard Error (4 pts)', points: 4, items: ['States mean of sampling distribution: μ_x̄ = μ = 90 minutes', 'Correctly computes SE = σ/√n = 25/√25 = 25/5 = 5 minutes'] },
      { category: 'Probability Calculation (4 pts)', points: 4, items: ['Standardizes: z = (96 − 90)/5 = 1.20', 'Finds P(x̄ > 96) = P(z > 1.20) ≈ 0.1151 (about 11.5%)'] },
    ],
    modelText: `The sampling distribution of x̄ is normal because the population itself is normally distributed (any sample size preserves normality). Mean: μ_x̄ = 90 minutes. Standard error: SE = σ/√n = 25/√25 = 5 minutes. For P(x̄ > 96): z = (96 − 90)/5 = 1.20. P(z > 1.20) = 1 − 0.8849 = 0.1151. There is approximately an 11.5% chance that a random sample of 25 students has a mean homework time greater than 96 minutes.`,
    entries: [
      { score: 2, response: `The sampling distribution would have a mean of 90 and standard deviation of 25 because those are the population parameters. To find the probability that the mean is greater than 96 we would use the normal distribution and look up z = (96-90)/25 = 0.24, so P = about 40%.` },
      { score: 5, response: `The sampling distribution of x̄ is normal (because the population is normal), with mean 90. The standard error is 25/√25 = 5. For the probability: z = (96-90)/5 = 1.20. Looking up z=1.20 gives 0.8849, so P(x̄>96) = 1 - 0.8849 = 0.1151, about 11.5%.` },
      { score: 9, response: `Sampling distribution of x̄:\n- Shape: Normal. Since the population is normally distributed, the sampling distribution of x̄ is also exactly normal for any sample size (no CLT approximation needed here).\n- Mean: μ_x̄ = μ = 90 minutes (the sampling distribution is centered at the population mean)\n- Standard error: SE = σ/√n = 25/√25 = 25/5 = 5 minutes (variability shrinks as n increases)\n\nP(x̄ > 96):\nz = (x̄ − μ_x̄)/SE = (96 − 90)/5 = 6/5 = 1.20\nP(z > 1.20) = 1 − Φ(1.20) = 1 − 0.8849 = 0.1151\n\nThere is approximately an 11.5% probability that a random sample of 25 students has a mean homework time greater than 96 minutes. The relatively small probability makes sense because 96 is 1.2 standard errors above the mean — fairly unusual but not extreme.` },
    ],
  },

  // ── 5. Confidence Intervals ───────────────────────────────────────────────
  {
    essayPrompt: `A random sample of 200 registered voters found that 118 plan to vote for Candidate A in an upcoming election. Essay Prompt: Construct a 95% confidence interval for the true proportion of all registered voters who plan to vote for Candidate A. Check necessary conditions, show your work, and write a correct interpretation of the interval. In your explanation, be sure to cover: Whether the conditions for a confidence interval for a proportion are satisfied. The calculation of the interval (point estimate, standard error, margin of error). A correctly worded interpretation of the 95% confidence interval.`,
    checklistItems: [
      { category: 'Conditions (2 pts)', points: 2, items: ['Checks: random sample ✓, np̂ = 118 ≥ 10 ✓, n(1−p̂) = 82 ≥ 10 ✓', 'Notes independence (sample < 10% of population)'] },
      { category: 'Calculation (4 pts)', points: 4, items: ['p̂ = 118/200 = 0.59', 'SE = √(p̂(1−p̂)/n) = √(0.59×0.41/200) ≈ 0.0348', 'CI: 0.59 ± 1.96 × 0.0348 → (0.522, 0.658)'] },
      { category: 'Interpretation (4 pts)', points: 4, items: ['States "95% confident" — not "95% probability"', 'References the true population proportion (not the sample)', 'Gives the interval in context: proportion of all registered voters supporting Candidate A'] },
    ],
    modelText: `Conditions: random sample ✓; np̂ = 118 ≥ 10 ✓; n(1−p̂) = 82 ≥ 10 ✓; 200 voters is less than 10% of all registered voters ✓. p̂ = 118/200 = 0.59. SE = √(0.59×0.41/200) = √(0.001209) ≈ 0.0348. Margin of error = 1.96 × 0.0348 ≈ 0.068. CI: (0.59 − 0.068, 0.59 + 0.068) = (0.522, 0.658). Interpretation: We are 95% confident that the true proportion of all registered voters who plan to vote for Candidate A is between 52.2% and 65.8%.`,
    entries: [
      { score: 3, response: `The sample proportion is 118/200 = 0.59. The confidence interval means that 95% of the time the true answer will be in the interval. The margin of error is about plus or minus 5% so the interval would be from 54% to 64%.` },
      { score: 6, response: `Conditions: np̂ = 118 ≥ 10 and n(1-p̂) = 82 ≥ 10, so conditions are met. p̂ = 0.59. SE = √(0.59 × 0.41 / 200) = √0.001209 ≈ 0.0348. CI = 0.59 ± 1.96(0.0348) = 0.59 ± 0.068 = (0.522, 0.658). Interpretation: We are 95% confident the true proportion of voters supporting Candidate A is between 52.2% and 65.8%.` },
      { score: 9, response: `Conditions check:\n- Random sample: stated as random ✓\n- np̂ = 200 × 0.59 = 118 ≥ 10 ✓\n- n(1−p̂) = 200 × 0.41 = 82 ≥ 10 ✓\n- Independence: 200 voters is surely less than 10% of all registered voters ✓\nAll conditions satisfied — normal approximation is appropriate.\n\nCalculation:\np̂ = 118/200 = 0.59\nSE = √(p̂(1−p̂)/n) = √(0.59 × 0.41 / 200) = √(0.001209) ≈ 0.03477\nMargin of error = z* × SE = 1.96 × 0.03477 ≈ 0.0681\nCI: (0.59 − 0.0681, 0.59 + 0.0681) = (0.522, 0.658)\n\nInterpretation: We are 95% confident that the true proportion of all registered voters who plan to vote for Candidate A is between 52.2% and 65.8%. Note: this does NOT mean there is a 95% probability the true proportion falls in this interval — the true proportion is a fixed (unknown) value; our confidence refers to the long-run reliability of this procedure.` },
    ],
  },

  // ── 6. Chi-Square Test of Independence ───────────────────────────────────
  {
    essayPrompt: `A researcher surveys 300 college students and records their exercise frequency (Regular / Occasional / None) and self-reported health status (Good / Poor). The data are arranged in a 3×2 contingency table. Essay Prompt: Explain how you would conduct a chi-square test of independence on this data. State the null and alternative hypotheses, calculate the degrees of freedom, explain what an expected cell count represents, and describe what a statistically significant result would mean. In your explanation, be sure to cover: The null and alternative hypotheses in the context of this study. The degrees of freedom formula and result. What expected cell counts represent and why they matter. What rejecting H0 would mean in plain language.`,
    checklistItems: [
      { category: 'Hypotheses (3 pts)', points: 3, items: ['H₀: Exercise frequency and health status are independent (no association)', 'H₁: Exercise frequency and health status are not independent (there is an association)'] },
      { category: 'Degrees of Freedom (3 pts)', points: 3, items: ['States df = (rows − 1)(cols − 1) = (3−1)(2−1) = 2', 'Correctly identifies rows=3 (exercise levels) and cols=2 (health levels)'] },
      { category: 'Expected Counts and Interpretation (4 pts)', points: 4, items: ['Expected count = (row total × column total) / grand total — what we would expect if there were no association', 'Significant result (small p-value) means we reject H₀ and conclude exercise and health status are associated'] },
    ],
    modelText: `H₀: Exercise frequency and health status are independent — knowing someone's exercise level tells you nothing about their health status. H₁: They are not independent — there is an association. Degrees of freedom: df = (3−1)(2−1) = 2. Expected cell counts: Each expected count = (row total × column total) / 300. These represent the frequencies we would expect if H₀ were true (no association). A significant result (p < α, usually 0.05) means we reject H₀ and conclude there is a statistically significant association between exercise frequency and self-reported health — people who exercise more tend to report better (or worse) health at rates different from what random chance would produce.`,
    entries: [
      { score: 3, response: `The null hypothesis is that there is no difference between the groups. The chi-square test compares the observed counts to what you would expect. If the chi-square value is big enough it means the groups are different. Degrees of freedom is the number of categories minus 1.` },
      { score: 6, response: `H₀: Exercise frequency and health status are independent. H₁: They are not independent (there is an association). Degrees of freedom = (rows - 1)(cols - 1) = (3-1)(2-1) = 2. Expected cell counts are what the counts would be if there was no association, calculated as (row total × column total)/grand total. If we reject H₀ it means that exercise frequency and health status are associated — the distribution of health status differs across exercise levels more than expected by chance.` },
      { score: 9, response: `Hypotheses:\nH₀: Exercise frequency and health status are independent — knowing a student's exercise frequency provides no information about their health status.\nH₁: Exercise frequency and health status are not independent — there is a statistically significant association between the two variables.\n\nDegrees of freedom:\ndf = (number of rows − 1)(number of cols − 1) = (3 − 1)(2 − 1) = 2 × 1 = 2\n\nExpected cell counts:\nExpected = (row total × column total) / grand total. These represent the cell frequencies we would expect if H₀ were true — if exercise and health were completely unrelated. Each expected count must be ≥ 5 for the chi-square approximation to be valid.\n\nInterpretation of a significant result:\nIf the p-value < α (e.g., 0.05), we reject H₀ and conclude there is sufficient evidence of an association between exercise frequency and health status. In plain language: the distribution of good/poor health differs across exercise groups more than we would expect by chance alone — suggesting that exercise frequency and health status are related in this population.` },
    ],
  },

  // ── 7. One-Sample t-test ──────────────────────────────────────────────────
  {
    essayPrompt: `A professor claims her students study an average of μ₀ = 20 hours per week. A random sample of 16 students reports a sample mean of x̄ = 17.5 hours with a sample standard deviation of s = 4.2 hours. Essay Prompt: Conduct a two-tailed hypothesis test at α = 0.05 to determine whether the evidence is sufficient to conclude the true mean study time differs from 20 hours. State hypotheses, calculate the test statistic, state the degrees of freedom, and write a conclusion in context. In your explanation, be sure to cover: The null and alternative hypotheses in symbols and words. The t-test statistic formula and calculated value. The degrees of freedom and decision rule. A conclusion in plain language.`,
    checklistItems: [
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ = 20 hours; H₁: μ ≠ 20 hours (two-tailed)', 'States these in context (true mean weekly study time)'] },
      { category: 'Test Statistic (4 pts)', points: 4, items: ['t = (x̄ − μ₀)/(s/√n) = (17.5 − 20)/(4.2/√16) = −2.5/1.05 ≈ −2.38', 'Identifies correct formula components'] },
      { category: 'df and Conclusion (4 pts)', points: 4, items: ['df = n − 1 = 15', 'With df=15, critical value |t*| ≈ 2.131 at α=0.05 two-tailed; |−2.38| > 2.131, so reject H₀', 'Concludes: sufficient evidence the true mean differs from 20 hrs'] },
    ],
    modelText: `H₀: μ = 20 hrs; H₁: μ ≠ 20 hrs. We use a one-sample t-test because σ is unknown. t = (17.5 − 20)/(4.2/√16) = −2.5/1.05 = −2.381. df = 16 − 1 = 15. At α = 0.05 two-tailed, critical value t* ≈ ±2.131. Since |−2.381| > 2.131, we reject H₀. There is sufficient evidence at α = 0.05 to conclude that the true mean weekly study time of the professor's students differs from 20 hours; the sample suggests the true mean is less than 20 hours.`,
    entries: [
      { score: 3, response: `We want to test if the mean is 20 hours. The null hypothesis is the mean equals 20 and the alternative is that it doesn't. The z-score is (17.5-20)/4.2 = -0.595. Since this is between -1.96 and 1.96 we fail to reject the null hypothesis. There is not enough evidence that students study a different amount.` },
      { score: 6, response: `H₀: μ = 20 hrs; H₁: μ ≠ 20 hrs (two-tailed). We use a t-test because we don't know σ. t = (17.5 - 20)/(4.2/√16) = -2.5/1.05 = -2.38. df = 15. The critical value at α=0.05 with df=15 is about 2.131. Since |t| = 2.38 > 2.131 we reject H₀. There is evidence that the true mean study time differs from 20 hours.` },
      { score: 9, response: `Hypotheses:\nH₀: μ = 20 hours (the true mean weekly study time is 20 hours, as the professor claims)\nH₁: μ ≠ 20 hours (the true mean differs from 20 hours — two-tailed because we have no prior reason to test only one direction)\n\nTest statistic (one-sample t-test, because σ is unknown):\nt = (x̄ − μ₀)/(s/√n) = (17.5 − 20)/(4.2/√16) = −2.5/(4.2/4) = −2.5/1.05 ≈ −2.381\n\nDegrees of freedom: df = n − 1 = 16 − 1 = 15\n\nDecision: At α = 0.05 two-tailed with df = 15, the critical value is t* ≈ ±2.131. Since |−2.381| = 2.381 > 2.131, we reject H₀.\n\nConclusion: At the 5% significance level, there is sufficient evidence to conclude that the true mean weekly study time differs from 20 hours. The sample mean of 17.5 hours is significantly below the claimed 20 hours. The professor's claim does not appear to be supported by this sample.` },
    ],
  },

  // ── 8. Linear Regression ─────────────────────────────────────────────────
  {
    essayPrompt: `A statistics instructor collects data on hours studied (x) and final exam score (y) for 50 students and fits a least-squares regression line: ŷ = 52 + 4.3x, with R² = 0.61. Essay Prompt: Interpret the slope and y-intercept of the regression equation in context. Interpret the R² value. Use the equation to predict the exam score for a student who studies 8 hours, and discuss one limitation of using this model for prediction. In your explanation, be sure to cover: The meaning of the slope (4.3) in context. The meaning of the intercept (52) and whether it is practically meaningful. What R² = 0.61 tells us about the model. A prediction and its limitation.`,
    checklistItems: [
      { category: 'Slope Interpretation (3 pts)', points: 3, items: ['For each additional hour studied, the predicted exam score increases by 4.3 points', 'Includes "predicted" or "on average" language; states direction and units'] },
      { category: 'Intercept and R² (3 pts)', points: 3, items: ['Intercept: a student who studies 0 hours is predicted to score 52 (may lack practical meaning)', 'R²=0.61: 61% of the variability in exam scores is explained by hours studied'] },
      { category: 'Prediction and Limitation (4 pts)', points: 4, items: ['Prediction: ŷ = 52 + 4.3(8) = 52 + 34.4 = 86.4', 'Limitation: e.g., correlation ≠ causation; extrapolation beyond data range; lurking variables; individual predictions have uncertainty'] },
    ],
    modelText: `Slope: For each additional hour studied, the predicted exam score increases by 4.3 points, on average. Intercept: A student who studies 0 hours is predicted to score 52 points; this may not be practically meaningful since studying 0 hours is at the edge of or beyond the data range. R² = 0.61 means 61% of the variability in final exam scores is explained by hours studied; the remaining 39% is due to other factors. Prediction: ŷ = 52 + 4.3(8) = 86.4 points. Limitation: This model cannot establish causation — other factors (prior knowledge, test anxiety, attendance) also affect scores and are not accounted for. Additionally, predictions become less reliable for values of x far from the observed data range.`,
    entries: [
      { score: 3, response: `The slope means that studying more hours leads to a higher score, specifically 4.3 more points for each hour. The R squared of 0.61 means the model is 61% accurate. To predict for 8 hours: 52 + 4.3(8) = 86.4. A limitation is that not all students are the same.` },
      { score: 6, response: `Slope: For each additional hour studied, the predicted exam score increases by 4.3 points on average. Intercept: A student studying 0 hours is predicted to score 52 points, though this may not be meaningful since no one actually studies 0 hours. R² = 0.61: 61% of the variation in exam scores is explained by hours studied. Prediction: ŷ = 52 + 4.3(8) = 86.4 points. Limitation: This model shows association but not causation — a lurking variable like natural ability could explain both more studying and higher scores.` },
      { score: 9, response: `Slope interpretation: For each additional hour a student studies, their predicted final exam score increases by 4.3 points, on average. This is a positive association — more studying is associated with higher scores.\n\nIntercept interpretation: A student who studies 0 hours is predicted to score 52 points. Practically, this is of limited meaning — it's unlikely any student studies exactly 0 hours, and 0 may be outside the range of observed x-values in the data. We should be cautious about interpreting the intercept as a real-world value.\n\nR² = 0.61: 61% of the variability in final exam scores is explained by the linear relationship with hours studied. The remaining 39% of variability is due to other factors not included in the model (e.g., prior knowledge, test anxiety, attendance).\n\nPrediction: ŷ = 52 + 4.3(8) = 52 + 34.4 = 86.4 points\n\nLimitation: The regression model describes association, not causation. Students who study more may also have stronger prior preparation or greater motivation — these lurking variables could be driving both the studying and the high scores. Additionally, individual predictions carry uncertainty; the regression line gives the average predicted value, not a guarantee for any specific student.` },
    ],
  },

  // ── 9. Two-Sample Independent t-test ─────────────────────────────────────
  {
    essayPrompt: `A researcher wants to compare the mean exam scores of students who attended a tutoring program (Group A: n=20, x̄=78, s=8) versus students who did not attend (Group B: n=25, x̄=72, s=10). Essay Prompt: Conduct a two-sample t-test at α = 0.05 to determine whether students who attended tutoring scored significantly higher than those who did not. State hypotheses, verify conditions, calculate the test statistic, state the degrees of freedom, and write a conclusion in context. In your explanation, be sure to cover: The null and alternative hypotheses (one-tailed). Conditions for a two-sample t-test. The test statistic and degrees of freedom. A conclusion in plain language.`,
    checklistItems: [
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ_A = μ_B (or μ_A − μ_B = 0); H₁: μ_A > μ_B (one-tailed, tutoring group scores higher)', 'States hypotheses in context of exam scores and tutoring'] },
      { category: 'Conditions (2 pts)', points: 2, items: ['Random samples from independent populations', 'Both sample sizes large enough (n ≥ 30 or populations approximately normal); groups are independent'] },
      { category: 'Test Statistic and df (4 pts)', points: 4, items: ['t = (x̄_A − x̄_B) / √(s_A²/n_A + s_B²/n_B) = (78 − 72) / √(64/20 + 100/25) = 6 / √(3.2 + 4.0) = 6 / √7.2 ≈ 6/2.683 ≈ 2.24', 'df ≈ smaller of n_A−1=19 and n_B−1=24 (conservative), so df ≈ 19; critical value t* ≈ 1.729 at α=0.05 one-tailed'] },
      { category: 'Conclusion (2 pts)', points: 2, items: ['Since t=2.24 > t*=1.729, reject H₀', 'Concludes there is sufficient evidence that tutoring students scored significantly higher'] },
    ],
    modelText: `H₀: μ_A = μ_B; H₁: μ_A > μ_B (one-tailed — we hypothesize tutoring improves scores). Conditions: both groups are random samples, independent of each other, and sample sizes are reasonably large. t = (78 − 72)/√(8²/20 + 10²/25) = 6/√(3.2 + 4.0) = 6/√7.2 = 6/2.683 ≈ 2.24. Using the conservative df = min(19, 24) = 19, the critical value at α=0.05 one-tailed is t* ≈ 1.729. Since 2.24 > 1.729, we reject H₀. There is sufficient evidence at the 5% level to conclude that students who attended tutoring scored significantly higher on average than those who did not.`,
    entries: [
      { score: 3, response: `The null hypothesis is that there is no difference in scores. We subtract the means: 78 - 72 = 6 points difference. The standard deviation is about 9 on average. t = 6/9 = 0.67. This is less than 2 so we fail to reject the null. There is no evidence that tutoring helped.` },
      { score: 6, response: `H₀: μ_A = μ_B; H₁: μ_A > μ_B (tutoring group scores higher). We use a two-sample t-test since these are independent groups. t = (78 - 72)/√(64/20 + 100/25) = 6/√(3.2 + 4) = 6/√7.2 ≈ 6/2.68 ≈ 2.24. Using df = 19 (conservative), the critical value at α=0.05 one-tailed is about 1.729. Since 2.24 > 1.729 we reject H₀ and conclude tutoring students scored significantly higher.` },
      { score: 9, response: `Hypotheses:\nH₀: μ_A = μ_B — the true mean exam scores are equal for tutoring and non-tutoring groups\nH₁: μ_A > μ_B — tutoring students have a higher true mean score (one-tailed, as specified)\n\nConditions:\n- Independent random samples: each group is sampled independently ✓\n- Groups are independent of each other ✓\n- Sample sizes (n=20, n=25) are reasonably large; we proceed assuming approximate normality ✓\n\nTest statistic (two-sample t-test, unknown and unequal σ):\nt = (x̄_A − x̄_B) / √(s_A²/n_A + s_B²/n_B)\n= (78 − 72) / √(8²/20 + 10²/25)\n= 6 / √(64/20 + 100/25)\n= 6 / √(3.20 + 4.00)\n= 6 / √7.20\n= 6 / 2.683\n≈ 2.24\n\nDegrees of freedom (conservative): df = min(n_A − 1, n_B − 1) = min(19, 24) = 19\nAt α = 0.05, one-tailed, t* ≈ 1.729.\n\nDecision: |t| = 2.24 > 1.729 → reject H₀.\n\nConclusion: At the 5% significance level, there is sufficient evidence to conclude that students who attended the tutoring program scored significantly higher on average than those who did not (mean difference = 6 points). The data support the effectiveness of the tutoring program.` },
    ],
  },

  // ── 10. Paired t-test ─────────────────────────────────────────────────────
  {
    essayPrompt: `A coach measures each of 15 runners' mile time (in minutes) before and after a 6-week training program. The differences (before − after) for each runner have a mean of d̄ = 1.2 minutes and a standard deviation of s_d = 0.9 minutes. Essay Prompt: Explain why a paired t-test is appropriate here instead of a two-sample t-test. Then conduct a one-sample t-test on the differences at α = 0.05 to determine whether the training program significantly reduced mile time. State hypotheses, calculate the test statistic and degrees of freedom, and write a conclusion in context. In your explanation, be sure to cover: Why the data are paired and why that matters. The null and alternative hypotheses in terms of μ_d. The t-statistic and degrees of freedom. A conclusion in plain language.`,
    checklistItems: [
      { category: 'Why Paired (3 pts)', points: 3, items: ['Each runner serves as their own control — the two measurements are on the same individuals, not independent groups', 'Pairing removes between-runner variability (natural speed differences), making the test more sensitive to the training effect'] },
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ_d = 0 (training has no effect on mile time)', 'H₁: μ_d > 0 (before − after > 0, meaning times decreased — runners got faster)'] },
      { category: 'Test Statistic and df (3 pts)', points: 3, items: ['t = d̄/(s_d/√n) = 1.2/(0.9/√15) = 1.2/0.2324 ≈ 5.16', 'df = n − 1 = 14'] },
      { category: 'Conclusion (2 pts)', points: 2, items: ['Critical value t* ≈ 1.761 at α=0.05 one-tailed df=14; since 5.16 >> 1.761, reject H₀', 'Concludes training significantly reduced mile time'] },
    ],
    modelText: `A paired t-test is appropriate because each runner was measured twice — before and after training. These are not independent groups; they are matched observations on the same individuals. Pairing removes the natural variability in running speed between runners, making the test more powerful by focusing only on within-runner change.\n\nLet d = before − after for each runner. H₀: μ_d = 0 (no improvement); H₁: μ_d > 0 (runners got faster, so before time > after time).\n\nt = d̄/(s_d/√n) = 1.2/(0.9/√15) = 1.2/(0.9/3.873) = 1.2/0.2324 ≈ 5.16. df = 15 − 1 = 14. At α = 0.05 one-tailed, t* ≈ 1.761. Since 5.16 >> 1.761, we reject H₀. There is strong evidence that the 6-week training program significantly reduced runners' mile times.`,
    entries: [
      { score: 3, response: `We have two groups — before and after times — so we use a two-sample t-test. H₀: the means are equal. t = (before - after) which would require both group means and standard deviations. Since we're given the differences directly, t = 1.2/0.9 = 1.33. This is less than 2 so we fail to reject the null. No significant improvement.` },
      { score: 6, response: `This is paired data because the same runners are measured before and after — they're not two independent groups. Pairing removes individual differences in speed so we focus on the change.\n\nH₀: μ_d = 0 (no change); H₁: μ_d > 0 (times decreased). We treat the differences as one sample.\nt = d̄/(s_d/√n) = 1.2/(0.9/√15) = 1.2/0.232 ≈ 5.17. df = 14. The critical value at α=0.05 one-tailed is about 1.76. Since 5.17 > 1.76 we reject H₀. The training program significantly reduced mile times.` },
      { score: 9, response: `Why paired, not two-sample:\nA paired t-test is appropriate because the same 15 runners are measured twice — before and after the program. These are not two independent groups; the before and after observations are linked within each runner. If we used a two-sample t-test, we would ignore that link and waste information. More importantly, pairing removes between-runner variability (some runners are naturally fast, others slow) so the test focuses exclusively on within-runner improvement. This makes the paired t-test more sensitive.\n\nHypotheses (in terms of μ_d, where d = before − after):\nH₀: μ_d = 0 — the training program produces no average change in mile time\nH₁: μ_d > 0 — before times are greater than after times on average (runners got faster)\n\nTest statistic:\nt = d̄ / (s_d / √n) = 1.2 / (0.9 / √15) = 1.2 / (0.9 / 3.873) = 1.2 / 0.2324 ≈ 5.16\ndf = n − 1 = 15 − 1 = 14\n\nDecision: At α = 0.05 one-tailed, t*(14) ≈ 1.761. Since 5.16 >> 1.761, we reject H₀.\n\nConclusion: There is very strong evidence (t = 5.16, p << 0.05) that the 6-week training program significantly reduced runners' mile times. The average improvement of 1.2 minutes is statistically significant and practically meaningful.` },
    ],
  },

  // ── 11. Categorical Data / Contingency Tables ─────────────────────────────
  {
    essayPrompt: `A survey of 400 college students recorded their major type (STEM / Non-STEM) and their preferred class time (Morning / Evening). Results: STEM-Morning = 80, STEM-Evening = 120, Non-STEM Morning = 100, Non-STEM Evening = 100. Essay Prompt: Calculate the conditional proportion of morning-preference students within each major group. Based on these proportions, does there appear to be an association between major type and class time preference? Explain your reasoning clearly. In your explanation, be sure to cover: The conditional proportions for each group (show work). Whether the proportions suggest an association. Why comparing conditional proportions (rather than raw counts) is the right approach.`,
    checklistItems: [
      { category: 'Conditional Proportions (4 pts)', points: 4, items: ['STEM: 80/200 = 40% morning, 120/200 = 60% evening', 'Non-STEM: 100/200 = 50% morning, 100/200 = 50% evening', 'Group totals: STEM = 200, Non-STEM = 200'] },
      { category: 'Association Conclusion (3 pts)', points: 3, items: ['Concludes there IS an association because conditional proportions differ across groups', 'STEM students favor evening (60%) more than Non-STEM students (50%)'] },
      { category: 'Why Conditional Proportions (3 pts)', points: 3, items: ['Raw counts can be misleading if group sizes differ; conditional proportions standardize for group size', 'Proportions allow fair comparison of preference patterns across groups'] },
    ],
    modelText: `STEM students: 200 total. Morning: 80/200 = 40%; Evening: 120/200 = 60%. Non-STEM students: 200 total. Morning: 100/200 = 50%; Evening: 100/200 = 50%. There appears to be an association: STEM students prefer evening classes at a higher rate (60%) compared to Non-STEM students (50%), while Non-STEM students are evenly split. We use conditional proportions rather than raw counts because both groups happen to have 200 students here, but in general group sizes differ. Proportions standardize for group size so we can fairly compare the distribution of preferences across groups.`,
    entries: [
      { score: 3, response: `STEM students: 80 morning and 120 evening. Non-STEM: 100 morning and 100 evening. It looks like STEM students prefer evening and Non-STEM students are split evenly. There might be an association because the numbers are different. We use proportions to make it easier to compare.` },
      { score: 6, response: `STEM total = 200: morning 80/200 = 0.40, evening 120/200 = 0.60. Non-STEM total = 200: morning 100/200 = 0.50, evening 100/200 = 0.50. There appears to be an association because STEM students have a higher proportion preferring evening (60%) compared to Non-STEM students (50%). We use conditional proportions instead of counts because raw counts can be misleading when group sizes are different — proportions let us compare the pattern within each group fairly.` },
      { score: 9, response: `Step 1 — Conditional proportions within each major group:\nSTEM total: 80 + 120 = 200 students\n  Morning: 80/200 = 0.40 (40%)\n  Evening: 120/200 = 0.60 (60%)\nNon-STEM total: 100 + 100 = 200 students\n  Morning: 100/200 = 0.50 (50%)\n  Evening: 100/200 = 0.50 (50%)\n\nStep 2 — Is there an association?\nYes, there appears to be an association between major type and class time preference. STEM students favor evening classes at a noticeably higher rate (60%) compared to Non-STEM students, who split evenly (50%/50%). If major type and class preference were independent, we would expect similar conditional proportions in both groups.\n\nStep 3 — Why conditional proportions, not raw counts?\nRaw counts are misleading when group sizes differ. For example, if STEM had 300 students and Non-STEM had 100, a higher raw count for one group's preference might just reflect the larger group size, not a genuine difference in preference rates. Conditional proportions standardize for group size, allowing a fair comparison of the preference patterns within each group regardless of how many students are in each major.` },
    ],
  },

  // ── 12. Chi-Square Goodness of Fit — Calibration Reinforcement ──────────────
  // PURPOSE: Reinforce two failure-mode patterns the model systematically misfires on:
  //   A) Minimal/vague response that only loosely mentions chi-square → score 3 (not 5)
  //   B) Thorough fairness section but zero chi-square explanation → score 4.5 (not 3)
  // Each pattern is repeated across all three scenario contexts (die, candy, cars)
  // for robust generalization.
  {
    essayPrompt: `Without doing any calculations, do you think this distribution is fair (equal across categories) or unfair? Explain your reasoning. Then describe what a χ² (chi-square) goodness of fit test would measure in this situation.\n\nIn your explanation, be sure to cover:\n- Whether you believe the distribution is fair or unfair, including what you would expect to see and how the observed data compares.\n- What a χ² goodness of fit test measures and how it uses observed and expected frequencies.\n\nNOTE: Each student received a different version of the scenario (die rolls, car traffic, or candy colors). The [Context: ...] prefix in each student's response identifies their specific scenario. Grade based on how well they address the shared rubric criteria for their given context.`,
    checklistItems: [
      { category: 'Fairness Judgment (5 pts)', points: 5, items: [
        'States whether the distribution appears fair or unfair and takes a clear position',
        'Identifies the expected frequency for each category if the distribution were equal (e.g., 10 per face for dice, 40 per direction for cars, 40 per color for candies)',
        'Compares specific observed values to the expected values and uses that comparison to support their conclusion',
      ]},
      { category: 'Chi-Square Test Purpose (5 pts)', points: 5, items: [
        'Describes what the χ² goodness of fit test measures — how well an observed frequency distribution matches an expected distribution',
        'Explains how the test uses observed and expected frequencies, ideally mentioning the formula (observed - expected)² / expected summed across categories, and what a larger vs. smaller statistic means',
      ]},
    ],
    modelText: `Looking at this data, the die appears roughly fair because the observed frequencies are all close to the expected value of 10, with only small deviations that look like normal random variation. If the distribution were truly equal, each face would come up about 10 times out of 60 rolls. The observed counts (8, 9, 11, 10, 12, 10) are all fairly close to 10, with the largest gap being only 2 away. A χ² goodness of fit test would formalize this intuitive comparison. Specifically, a χ² goodness of fit test measures how well an observed frequency distribution matches an expected distribution across multiple categories. It computes (observed - expected)² / expected for each category, then adds up all those values into one test statistic. A larger χ² value means the observed data deviates more from what was expected, while a small χ² means the data fits the expected pattern closely.`,
    entries: [
      // ── Pattern A: Minimal/vague — mentions chi-square but no substance → 3 ──
      {
        score: 3,
        response: `[Context: Imagine you roll a standard six-sided die 60 times and get the following results: 8 ones, 9 twos, 11 threes, 10 fours, 12 fives, and 10 sixes.]\n\nThe results are not exactly equal. A chi-square goodness of fit test compares the observed and expected frequencies to see if the distribution matches what was expected.`,
      },
      {
        score: 3,
        response: `[Context: Imagine you observe 120 cars arriving at an intersection where the city claims traffic splits evenly among three directions, and you count: 28 turning left, 65 going straight, and 27 turning right.]\n\nThe traffic distribution does not look equal across the three directions. The chi-square test uses observed versus expected frequencies. If they are close, the distribution is fair.`,
      },
      {
        score: 3,
        response: `[Context: Imagine you grab a handful of 200 candies from a large bag that claims to contain equal proportions of five colors, and you count: 52 red, 41 blue, 38 green, 35 yellow, and 34 orange.]\n\nThe candy colors are not equally distributed. A chi-square goodness of fit test measures how well observed frequencies match expected frequencies. If the observed data matches the expected, the distribution follows the expected pattern.`,
      },
      // ── Pattern B: Thorough fairness, zero chi-square → 4.5 ──────────────────
      {
        score: 4.5,
        response: `[Context: Imagine you observe 120 cars arriving at an intersection where the city claims traffic splits evenly among three directions, and you count: 28 turning left, 65 going straight, and 27 turning right.]\n\nThe distribution looks unfair. If the three directions were equal, each should get about 40 cars (120 / 3 = 40). The observed counts are 28 left, 65 straight, and 27 right — straight is 25 above expected while the other two are both well below. Based on these comparisons, I believe the distribution is clearly not equal.`,
      },
      {
        score: 4.5,
        response: `[Context: Imagine you grab a handful of 200 candies from a large bag that claims to contain equal proportions of five colors, and you count: 52 red, 41 blue, 38 green, 35 yellow, and 34 orange.]\n\nI believe the distribution is roughly fair, though slightly off. Each color should appear about 40 times if the proportions are truly equal (200 / 5 = 40). Most colors are close to 40, but red at 52 is notably higher. The other four colors (41, 38, 35, 34) are all within a few of the expected 40. I would lean slightly unfair because of red being so high.`,
      },
      {
        score: 4.5,
        response: `[Context: Imagine you roll a standard six-sided die 60 times and get the following results: 8 ones, 9 twos, 11 threes, 10 fours, 12 fives, and 10 sixes.]\n\nBased on the data, the die appears mostly fair. Each face should come up about 10 times out of 60 rolls (60 / 6 = 10). The observed counts range from 8 to 12, all within 2 of the expected 10. Given these small deviations, I believe the distribution is reasonably fair.`,
      },
    ],
  },

  // ── 13. ANOVA ─────────────────────────────────────────────────────────────
  {
    essayPrompt: `A researcher wants to compare the mean exam scores of students in three different sections of the same statistics course: Section A (taught in the morning), Section B (taught in the afternoon), and Section C (taught in the evening). Essay Prompt: Explain what ANOVA is, when it should be used instead of multiple t-tests, what the F-statistic measures, and what the conditions for ANOVA are. In your explanation, be sure to cover: What ANOVA tests and why it is used instead of running multiple t-tests. What the F-statistic represents conceptually (between-group vs. within-group variability). The three conditions required for ANOVA. What a significant F-test result would mean in context.`,
    checklistItems: [
      { category: 'What ANOVA Tests / Why Not Multiple t-tests (3 pts)', points: 3, items: ['ANOVA tests whether at least one group mean differs from the others', 'Running multiple t-tests inflates the Type I error rate (familywise error); ANOVA controls it with one test'] },
      { category: 'F-statistic Concept (3 pts)', points: 3, items: ['F = variability between groups / variability within groups', 'Large F means groups differ more than would be expected from random sampling alone'] },
      { category: 'ANOVA Conditions (2 pts)', points: 2, items: ['Independence: observations within and across groups are independent', 'Normality: each group is approximately normally distributed', 'Equal variance: population variances (spread) are approximately equal across groups'] },
      { category: 'Conclusion in Context (2 pts)', points: 2, items: ['Significant F means at least one section has a different mean exam score', 'Does NOT tell us which pairs of sections differ — need post-hoc tests for that'] },
    ],
    modelText: `ANOVA (Analysis of Variance) tests whether at least one group mean is significantly different from the others. With three sections, we could run three separate t-tests (A vs B, A vs C, B vs C), but each test has a 5% chance of a Type I error. Running three tests inflates the overall error rate to about 14% — ANOVA avoids this by using a single omnibus test.\n\nThe F-statistic compares variability between groups (how much the group means differ from the grand mean) to variability within groups (natural spread within each section). If between-group variation is much larger than within-group variation, F is large and the result is likely significant. F = MSG/MSE where MSG = mean square between groups and MSE = mean square error (within groups).\n\nConditions: (1) Independence — students are randomly sampled and sections don't influence each other; (2) Normality — scores within each section are approximately normally distributed; (3) Equal variance — the spread of scores is similar across sections (can be checked with side-by-side boxplots).\n\nA significant result (p < 0.05) would mean there is evidence that at least one section has a different mean exam score. It does NOT tell us which pair differs — a post-hoc test (e.g., Tukey's HSD) would be needed to identify the specific differences.`,
    entries: [
      { score: 3, response: `ANOVA is used to compare the means of multiple groups. The F-statistic tells you whether the groups are different. The conditions are that the data should be normal and the groups should be independent. If the F value is significant then at least one group mean is different.` },
      { score: 6, response: `ANOVA is used to compare the means of three or more groups simultaneously. Instead of running three separate t-tests (which would inflate the Type I error rate), ANOVA uses a single test. The F-statistic compares variability between groups to variability within groups — a large F means the group means differ more than expected by chance. Conditions: independence, approximate normality in each group, and roughly equal variances. If F is significant, we conclude at least one section has a different mean, but we need follow-up tests to identify which pairs differ.` },
      { score: 9, response: `ANOVA (Analysis of Variance) is appropriate here because we are comparing the means of three groups simultaneously. Running three separate t-tests would inflate the Type I error rate: with α=0.05 per test, the overall error rate across three comparisons is roughly 1 − (0.95)³ ≈ 14%. ANOVA controls this with a single omnibus F-test.\n\nThe F-statistic = MSG / MSE, where MSG = mean square between groups (how much group means deviate from the grand mean) and MSE = mean square error (average within-group variability). A large F means between-group differences are large relative to natural within-group noise — evidence that sections differ.\n\nConditions required:\n1. Independence: students in each section are independently selected and groups don't influence each other.\n2. Normality: scores within each section should be approximately normally distributed (relaxed with large n by CLT).\n3. Equal variance: the population variance should be roughly similar across the three sections (check with side-by-side boxplots or Levene's test).\n\nA significant F-test (p < 0.05) means at least one section has a mean exam score different from the others. It does NOT identify which specific sections differ — a post-hoc test such as Tukey's HSD or Bonferroni correction would be needed for pairwise comparisons.` },
    ],
  },

  // ── 14. Power of a Test ───────────────────────────────────────────────────
  {
    essayPrompt: `A public health researcher is designing a study to detect whether a new vaccine reduces infection rates. She wants to be confident her study will detect a true effect if one exists. Essay Prompt: Explain what the power of a hypothesis test is, how it relates to Type II error, and identify three factors that affect the power of a test. For each factor, explain the direction of its effect. In your explanation, be sure to cover: The definition of power and its relationship to Type II error (β). How sample size, significance level (α), and effect size each affect power. Why high power is desirable in a medical study like this one.`,
    checklistItems: [
      { category: 'Definition of Power and Type II Error (3 pts)', points: 3, items: ['Power = P(rejecting H₀ | H₀ is false) = 1 − β', 'Type II error (β) = failing to reject a false H₀ (missing a real effect)', 'High power means low β — the test is unlikely to miss a true effect'] },
      { category: 'Three Factors Affecting Power (5 pts)', points: 5, items: ['Sample size (n): larger n → more power (less sampling variability, easier to detect true effects)', 'Significance level (α): larger α → more power (lower bar to reject H₀, but higher Type I error risk)', 'Effect size: larger true difference → more power (bigger effects are easier to detect)'] },
      { category: 'Why High Power Matters Here (2 pts)', points: 2, items: ['Missing a truly effective vaccine (Type II error) wastes a potential public health benefit', 'A powerful study ensures the trial can detect a real vaccine effect with confidence'] },
    ],
    modelText: `Power is the probability of correctly rejecting a false null hypothesis: Power = P(reject H₀ | H₀ is false) = 1 − β, where β is the probability of a Type II error (failing to reject H₀ when it is actually false). In this vaccine study, β would represent the probability of concluding the vaccine has no effect when it actually does — a costly mistake for public health.\n\nThree factors that affect power:\n1. Sample size (n): Larger samples reduce sampling variability, making it easier to distinguish a true effect from noise. Power increases as n increases.\n2. Significance level (α): A larger α (e.g., 0.10 instead of 0.05) makes it easier to reject H₀, increasing power — but also increases the Type I error rate.\n3. Effect size: Larger true differences between conditions are easier to detect. If the vaccine reduces infection by 50% rather than 5%, the same sample size will have much higher power.\n\nHigh power is critical in medical research: a low-powered study might fail to detect a genuinely effective vaccine, delaying its adoption and costing lives. Researchers typically aim for power ≥ 0.80 (an 80% chance of detecting a true effect).`,
    entries: [
      { score: 3, response: `Power is how strong a test is. It is related to the Type II error which is when you accept the null hypothesis when it's false. To increase power you can increase the sample size or decrease the significance level. In a medical study it is important to have high power so you don't miss a real effect.` },
      { score: 6, response: `Power = P(reject H₀ | H₀ is false) = 1 − β, where β is the probability of a Type II error (failing to detect a real effect). High power means the test is sensitive enough to detect a true difference.\n\nThree factors:\n1. Sample size — larger n increases power by reducing variability.\n2. Significance level α — a larger α gives more power but risks more false positives.\n3. Effect size — a larger true difference is easier to detect, giving higher power.\n\nIn this vaccine study, high power is important because missing a real vaccine benefit (Type II error) means delaying an effective public health intervention.` },
      { score: 9, response: `Power of a hypothesis test:\nPower = P(reject H₀ | H₀ is false) = 1 − β\nwhere β = P(Type II error) = probability of failing to reject H₀ when it is actually false.\n\nIn this vaccine study: H₀ might be "the vaccine has no effect." A Type II error would be concluding the vaccine is ineffective when it actually reduces infection — a potentially serious public health mistake. High power minimizes β, making it unlikely we miss a real vaccine effect.\n\nThree factors affecting power:\n\n1. Sample size (n): Larger samples reduce the standard error of the test statistic, making it easier to detect true effects. Power increases monotonically with n. This is the most direct way researchers control power — a power analysis before data collection calculates the n needed.\n\n2. Significance level (α): A higher α (say 0.10 instead of 0.05) moves the rejection region boundary, making it easier to reject H₀. This increases power, but at the cost of a higher Type I error rate (more false positives).\n\n3. Effect size: The true magnitude of the vaccine's benefit. A vaccine that reduces infection by 40% is far easier to detect than one that reduces it by 2%. Larger effects produce larger test statistics even with the same n, yielding higher power.\n\nWhy high power matters: In medical research, failing to detect a truly effective vaccine (Type II error) delays deployment and costs lives. Researchers typically target power ≥ 0.80 — meaning an 80% chance of detecting a true effect — to ensure the study is sensitive enough to be informative.` },
    ],
  },

  // ── 15. Inference for Regression Slope ───────────────────────────────────
  {
    essayPrompt: `A researcher regresses final exam score (y) on hours of sleep the night before (x) using data from 30 students. The output shows: slope b₁ = 3.2, SE(b₁) = 1.1, with a t-statistic of 2.91 and a p-value of 0.007. Essay Prompt: Interpret the slope coefficient. Conduct a hypothesis test to determine whether sleep hours significantly predict exam scores. State the null and alternative hypotheses, calculate the test statistic (verify), state the degrees of freedom, and write a conclusion. Also construct a 95% confidence interval for the true slope and interpret it. In your explanation, be sure to cover: What the slope 3.2 means in context. The null and alternative hypotheses for testing the slope. The t-statistic verification and degrees of freedom. The conclusion and a 95% CI for the slope with interpretation.`,
    checklistItems: [
      { category: 'Slope Interpretation (2 pts)', points: 2, items: ['For each additional hour of sleep, predicted exam score increases by 3.2 points on average', 'Uses "predicted" or "on average" and states units'] },
      { category: 'Hypotheses and Test (4 pts)', points: 4, items: ['H₀: β₁ = 0 (sleep hours do not linearly predict exam score)', 'H₁: β₁ ≠ 0 (sleep hours do linearly predict exam score)', 't = b₁/SE(b₁) = 3.2/1.1 ≈ 2.91 ✓; df = n − 2 = 28', 'p = 0.007 < 0.05 → reject H₀; sleep hours significantly predict exam score'] },
      { category: '95% Confidence Interval (4 pts)', points: 4, items: ['t* ≈ 2.048 for df=28 at 95%', 'CI: 3.2 ± 2.048 × 1.1 = 3.2 ± 2.253 → (0.95, 5.45)', 'Interpretation: We are 95% confident the true slope is between 0.95 and 5.45 — each additional sleep hour is associated with between 0.95 and 5.45 more predicted points'] },
    ],
    modelText: `Slope: For each additional hour of sleep the night before the exam, a student's predicted exam score increases by 3.2 points on average.\n\nHypotheses: H₀: β₁ = 0 (sleep hours have no linear relationship with exam scores); H₁: β₁ ≠ 0 (they do). Test statistic: t = b₁/SE(b₁) = 3.2/1.1 ≈ 2.91 (matches output). df = n − 2 = 30 − 2 = 28. With p = 0.007 < 0.05, we reject H₀. Sleep hours significantly predict exam scores.\n\n95% CI: t*(28) ≈ 2.048. CI = 3.2 ± 2.048(1.1) = 3.2 ± 2.253 = (0.947, 5.453). We are 95% confident the true slope is between about 0.95 and 5.45 — each additional hour of sleep is associated with an average increase of between 0.95 and 5.45 points on the exam.`,
    entries: [
      { score: 3, response: `The slope of 3.2 means that more sleep leads to higher exam scores. The null hypothesis is that sleep doesn't predict scores. The t-statistic is 2.91 and the p-value is 0.007 which is less than 0.05 so we reject the null. Sleep does predict exam scores. The confidence interval would be around 3.2 plus or minus some margin.` },
      { score: 6, response: `Slope: For each additional hour of sleep, the predicted exam score increases by 3.2 points on average.\n\nH₀: β₁ = 0 (no linear relationship); H₁: β₁ ≠ 0. t = 3.2/1.1 ≈ 2.91 (verified), df = n - 2 = 28. Since p = 0.007 < 0.05, reject H₀ — sleep hours significantly predict exam scores.\n\n95% CI: t*(28) ≈ 2.048. CI = 3.2 ± 2.048(1.1) = 3.2 ± 2.25 ≈ (0.95, 5.45). We are 95% confident the true slope is between 0.95 and 5.45 points per hour of sleep.` },
      { score: 9, response: `Slope interpretation: For each additional hour of sleep the night before the exam, the predicted exam score increases by 3.2 points, on average. This is a positive linear association — more sleep is associated with higher predicted scores.\n\nHypotheses:\nH₀: β₁ = 0 — sleep hours have no linear relationship with exam scores in the population\nH₁: β₁ ≠ 0 — there is a linear relationship (two-tailed)\n\nTest statistic verification:\nt = b₁ / SE(b₁) = 3.2 / 1.1 ≈ 2.909 ≈ 2.91 ✓ (matches output)\ndf = n − 2 = 30 − 2 = 28\n\nConclusion: p-value = 0.007 < α = 0.05, so we reject H₀. There is statistically significant evidence that sleep hours linearly predict exam scores.\n\n95% Confidence Interval for β₁:\nt*(df=28, 95%) ≈ 2.048\nCI = b₁ ± t* × SE(b₁) = 3.2 ± 2.048 × 1.1 = 3.2 ± 2.253 = (0.947, 5.453)\n\nInterpretation: We are 95% confident that the true slope is between 0.95 and 5.45. That is, in the population, each additional hour of sleep is associated with an average increase of between 0.95 and 5.45 exam points. Since the entire interval is above zero, we can confirm a positive relationship.` },
    ],
  },

  // ── 16. Random Variables — E[X] and Var[X] ───────────────────────────────
  {
    essayPrompt: `A carnival game costs $3 to play. You draw one ball from a bag containing 5 balls: 3 are red (you win $1 back — net gain = −$2), 1 is blue (you win $5 back — net gain = +$2), and 1 is gold (you win $10 back — net gain = +$7). Let X = net gain per play. Essay Prompt: Construct the probability distribution of X. Calculate E[X] and interpret it in context. Calculate Var(X) and SD(X). Based on E[X], explain whether a rational player should play this game in the long run. In your explanation, be sure to cover: The probability distribution table for X. The calculation of E[X] with formula and result. The calculation of Var(X) and SD(X). What E[X] means for a player who plays many times.`,
    checklistItems: [
      { category: 'Probability Distribution (2 pts)', points: 2, items: ['X = −2 with P = 3/5, X = +2 with P = 1/5, X = +7 with P = 1/5', 'Probabilities sum to 1'] },
      { category: 'E[X] Calculation (3 pts)', points: 3, items: ['E[X] = (−2)(3/5) + (2)(1/5) + (7)(1/5) = −6/5 + 2/5 + 7/5 = 3/5 = 0.60', 'On average, a player gains $0.60 per game (net positive)'] },
      { category: 'Var(X) and SD(X) (3 pts)', points: 3, items: ['Var(X) = (−2−0.6)²(3/5) + (2−0.6)²(1/5) + (7−0.6)²(1/5)', '= (6.76)(0.6) + (1.96)(0.2) + (40.96)(0.2) = 4.056 + 0.392 + 8.192 = 12.64', 'SD(X) = √12.64 ≈ $3.56'] },
      { category: 'Decision Rationale (2 pts)', points: 2, items: ['E[X] = +$0.60 > 0, so in the long run a player gains money on average', 'High SD ($3.56) means high variability per play, but expected value favors the player'] },
    ],
    modelText: `Distribution: X = −2 (P = 3/5), X = +2 (P = 1/5), X = +7 (P = 1/5).\n\nE[X] = (−2)(3/5) + (2)(1/5) + (7)(1/5) = −1.2 + 0.4 + 1.4 = 0.6. On average, a player nets +$0.60 per play.\n\nVar(X) = (−2−0.6)²(3/5) + (2−0.6)²(1/5) + (7−0.6)²(1/5) = (6.76)(0.6) + (1.96)(0.2) + (40.96)(0.2) = 4.056 + 0.392 + 8.192 = 12.64. SD(X) = √12.64 ≈ 3.56.\n\nSince E[X] = +$0.60 > 0, a rational player who plays many times should expect to profit. The high standard deviation ($3.56) means individual outcomes vary widely, but over many plays the Law of Large Numbers ensures the average converges to +$0.60 per game.`,
    entries: [
      { score: 3, response: `The outcomes are -$2, +$2, or +$7. The expected value is the average: (-2 + 2 + 7)/3 = $2.33. Since the expected value is positive the player should play. The variance measures how spread out the outcomes are.` },
      { score: 6, response: `P(X = -2) = 3/5, P(X = 2) = 1/5, P(X = 7) = 1/5. E[X] = (-2)(3/5) + (2)(1/5) + (7)(1/5) = -1.2 + 0.4 + 1.4 = 0.60. On average the player gains $0.60 per game. Var(X) = (-2-0.6)^2(0.6) + (2-0.6)^2(0.2) + (7-0.6)^2(0.2) = 4.056 + 0.392 + 8.192 = 12.64. SD = √12.64 ≈ 3.56. Since E[X] > 0 a rational player should play in the long run.` },
      { score: 9, response: `Probability distribution of X (net gain per play):\n| X   | P(X)  |\n|-----|-------|\n| −2  | 3/5 = 0.60 |\n| +2  | 1/5 = 0.20 |\n| +7  | 1/5 = 0.20 |\nCheck: 0.60 + 0.20 + 0.20 = 1.00 ✓\n\nE[X] = Σ x · P(x):\n= (−2)(3/5) + (2)(1/5) + (7)(1/5)\n= −1.20 + 0.40 + 1.40\n= 0.60\nOn average, a player nets +$0.60 per game played.\n\nVar(X) = Σ (x − μ)² · P(x):\n= (−2 − 0.6)²(0.60) + (2 − 0.6)²(0.20) + (7 − 0.6)²(0.20)\n= (−2.6)²(0.60) + (1.4)²(0.20) + (6.4)²(0.20)\n= (6.76)(0.60) + (1.96)(0.20) + (40.96)(0.20)\n= 4.056 + 0.392 + 8.192\n= 12.64\nSD(X) = √12.64 ≈ $3.56\n\nDecision: Since E[X] = +$0.60 > 0, a rational player who plays many times should play — the expected gain per game is positive. The Law of Large Numbers ensures the average outcome converges to +$0.60 per play over many games. The high SD ($3.56) signals large variability per play, so short-run results will fluctuate, but the long-run expectation favors the player.` },
    ],
  },

  // ── 17. Geometric Distribution ────────────────────────────────────────────
  {
    essayPrompt: `A free-throw shooter makes 75% of her attempts. She will keep shooting until she makes her first successful shot. Let X = the number of shots needed to get the first success. Essay Prompt: Explain what random variable X represents and why the geometric distribution applies. State the four conditions for the geometric setting. Calculate P(X = 3) — the probability that she needs exactly 3 shots. Calculate E[X] and interpret it in context. In your explanation, be sure to cover: What the geometric distribution models (in words). The four geometric conditions and how each applies here. P(X = 3) using the formula. E[X] and what it means for this shooter.`,
    checklistItems: [
      { category: 'What Geometric Models + Conditions (4 pts)', points: 4, items: ['Models the number of trials until the first success', 'Fixed binary outcome (make/miss), independent trials, constant p = 0.75', 'No fixed n — keeps going until first success (key distinction from binomial)'] },
      { category: 'P(X = 3) (3 pts)', points: 3, items: ['P(X = k) = (1−p)^(k−1) × p', 'P(X = 3) = (0.25)² × 0.75 = 0.0625 × 0.75 = 0.046875 ≈ 4.69%'] },
      { category: 'E[X] and Interpretation (3 pts)', points: 3, items: ['E[X] = 1/p = 1/0.75 ≈ 1.33 shots', 'On average, the shooter needs about 1.33 attempts to make her first shot'] },
    ],
    modelText: `X = number of shots required to make the first successful free throw. The geometric distribution applies because: (1) Binary outcome — each shot is either a make or a miss. (2) Independent trials — each shot's outcome doesn't affect the next. (3) Constant probability — p = 0.75 per shot. (4) No fixed n — she keeps shooting until success; X is the trial number of the first success.\n\nP(X = 3) = (1 − 0.75)^(3−1) × 0.75 = (0.25)² × 0.75 = 0.0625 × 0.75 = 0.046875 ≈ 4.69%. There is about a 4.7% chance she needs exactly 3 shots.\n\nE[X] = 1/p = 1/0.75 ≈ 1.333. On average, this shooter needs about 1.33 attempts to make her first free throw. Since she makes 75% on each try, she usually succeeds quickly.`,
    entries: [
      { score: 3, response: `The geometric distribution is used when you're counting how many tries until you get your first success. P(X=3) = 0.75 × 0.75 × 0.75 because she makes 75% each time and we want three makes. The expected value is 1/0.75 = 1.33 shots on average.` },
      { score: 6, response: `X = number of shots until first make. Geometric applies because: binary outcome (make/miss), independent shots, constant p=0.75, no fixed number of trials. P(X=3) = (0.25)^2 × 0.75 = 0.0625 × 0.75 = 0.0469. There is about a 4.7% chance she needs exactly 3 shots. E[X] = 1/p = 1/0.75 = 1.33 shots on average.` },
      { score: 9, response: `X = the number of shots needed to make the first successful free throw. X follows a geometric distribution.\n\nFour geometric conditions:\n1. Binary outcome: each shot is either a make (success) or a miss (failure).\n2. Independent trials: each shot is independent — making or missing one doesn't affect the probability of the next.\n3. Constant probability: p = 0.75 on every shot.\n4. No fixed n: she keeps shooting until the first success — X counts which trial produces the first success.\n\nP(X = 3):\nP(X = k) = (1 − p)^(k−1) × p\nP(X = 3) = (1 − 0.75)^(3−1) × 0.75 = (0.25)^2 × 0.75 = 0.0625 × 0.75 = 0.046875 ≈ 4.69%\nThere is about a 4.7% chance she needs exactly 3 shots — two misses followed by a make.\n\nE[X] = 1/p = 1/0.75 = 4/3 ≈ 1.33 shots\nOn average, this shooter needs about 1.33 attempts to make her first free throw. Since she makes 75% each time, she usually succeeds on the first shot, but occasionally needs a second or third try. The geometric mean reflects this short average wait.` },
    ],
  },

  // ── 18. Normal Approximation to the Binomial ─────────────────────────────
  {
    essayPrompt: `A large introductory statistics course has historically had a 65% pass rate on the first exam. This semester 120 students take the exam. Let X = number of students who pass. Essay Prompt: Verify that the success-failure condition is met for approximating this binomial distribution with a normal distribution. Identify the mean and standard deviation of the approximate normal distribution. Use the normal approximation (with continuity correction) to estimate P(X ≥ 85). In your explanation, be sure to cover: The success-failure condition and whether it is satisfied. The mean (μ) and standard deviation (σ) of the normal approximation. The continuity correction and the probability calculation with a z-score.`,
    checklistItems: [
      { category: 'Success-Failure Condition (2 pts)', points: 2, items: ['np = 120 × 0.65 = 78 ≥ 10 ✓', 'n(1−p) = 120 × 0.35 = 42 ≥ 10 ✓', 'Normal approximation is justified'] },
      { category: 'Mean and SD (3 pts)', points: 3, items: ['μ = np = 120 × 0.65 = 78', 'σ = √(np(1−p)) = √(120 × 0.65 × 0.35) = √27.3 ≈ 5.225'] },
      { category: 'Continuity Correction and Probability (5 pts)', points: 5, items: ['With continuity correction: P(X ≥ 85) ≈ P(Y ≥ 84.5) where Y ~ N(78, 5.225)', 'z = (84.5 − 78)/5.225 = 6.5/5.225 ≈ 1.245', 'P(z ≥ 1.245) = 1 − Φ(1.245) ≈ 1 − 0.8934 ≈ 0.107 (about 10.7%)'] },
    ],
    modelText: `Success-failure condition: np = 120(0.65) = 78 ≥ 10 ✓; n(1−p) = 120(0.35) = 42 ≥ 10 ✓. Both conditions met — normal approximation is valid.\n\nμ = np = 78. σ = √(npq) = √(120 × 0.65 × 0.35) = √27.3 ≈ 5.225.\n\nP(X ≥ 85) with continuity correction: treat as P(Y ≥ 84.5) where Y ~ N(78, 5.225). z = (84.5 − 78)/5.225 = 6.5/5.225 ≈ 1.245. P(z ≥ 1.245) = 1 − Φ(1.245) ≈ 1 − 0.8934 ≈ 0.107. There is approximately a 10.7% chance that 85 or more students pass.`,
    entries: [
      { score: 3, response: `The success-failure condition requires np ≥ 10 and nq ≥ 10. np = 78 and nq = 42 so both are satisfied. The mean is 78 and the standard deviation is about 5.2. To find P(X ≥ 85) we use z = (85-78)/5.2 ≈ 1.35 and look up the probability.` },
      { score: 6, response: `Success-failure condition: np = 120(0.65) = 78 ≥ 10 ✓ and n(1-p) = 42 ≥ 10 ✓. Normal approximation is valid. μ = 78, σ = √(120 × 0.65 × 0.35) = √27.3 ≈ 5.225. Using continuity correction: P(X ≥ 85) ≈ P(Y ≥ 84.5). z = (84.5 - 78)/5.225 ≈ 1.245. P(z ≥ 1.245) = 1 - 0.8934 ≈ 0.107. About 10.7% chance that 85 or more students pass.` },
      { score: 9, response: `Step 1 — Success-failure condition:\nnp = 120 × 0.65 = 78 ≥ 10 ✓\nn(1−p) = 120 × 0.35 = 42 ≥ 10 ✓\nBoth conditions are met. The binomial distribution can be approximated with a normal distribution.\n\nStep 2 — Parameters of the normal approximation:\nμ = np = 120 × 0.65 = 78\nσ = √(np(1−p)) = √(120 × 0.65 × 0.35) = √(27.3) ≈ 5.225\nSo X ≈ N(78, 5.225)\n\nStep 3 — P(X ≥ 85) with continuity correction:\nBecause X is discrete and Y is continuous, P(X ≥ 85) ≈ P(Y ≥ 84.5) (shift by −0.5 to include the boundary correctly).\nz = (84.5 − 78) / 5.225 = 6.5 / 5.225 ≈ 1.245\nP(z ≥ 1.245) = 1 − Φ(1.245) ≈ 1 − 0.8934 = 0.1066 ≈ 10.7%\n\nThere is approximately a 10.7% probability that 85 or more students will pass the first exam this semester.` },
    ],
  },

  // ── 19. Basic Probability Rules ───────────────────────────────────────────
  {
    essayPrompt: `A box contains 10 marbles: 4 red, 3 blue, and 3 green. You draw one marble at random. Essay Prompt: Calculate P(not red) using the complement rule. Then, from a different box with 6 red and 4 blue, two marbles are drawn WITHOUT replacement. Calculate P(both red). Explain which probability rule you used for each part and why. In your explanation, be sure to cover: P(not red) using the complement rule with formula. P(both red) using the general multiplication rule for dependent events. An explanation of why these two events are dependent.`,
    checklistItems: [
      { category: 'Complement Rule (3 pts)', points: 3, items: ['P(not red) = 1 − P(red) = 1 − 4/10 = 6/10 = 0.60', 'States the complement rule: P(Aᶜ) = 1 − P(A)'] },
      { category: 'General Multiplication Rule (4 pts)', points: 4, items: ['P(both red) = P(1st red) × P(2nd red | 1st red)', '= (6/10) × (5/9) = 30/90 = 1/3 ≈ 0.333', 'Uses conditional probability because drawing without replacement changes the composition'] },
      { category: 'Why Dependent (3 pts)', points: 3, items: ['Without replacement: drawing the first red marble reduces both the total count (10→9) and the red count (6→5)', 'P(2nd red) changes based on the first draw — events are dependent, not independent'] },
    ],
    modelText: `Part 1 — Complement rule: P(not red) = 1 − P(red) = 1 − 4/10 = 6/10 = 0.60. The complement rule states P(Aᶜ) = 1 − P(A).\n\nPart 2 — Both red without replacement: P(1st red) = 6/10. After drawing one red, 5 red remain from 9 total: P(2nd red | 1st red) = 5/9. P(both red) = (6/10)(5/9) = 30/90 = 1/3 ≈ 0.333.\n\nWhy dependent: Drawing without replacement changes the marble composition after the first draw. If the first draw is red, there are now only 5 red out of 9 — the probability of the second draw changed. For independent events, the outcome of one does not affect the probability of the other. Here it clearly does.`,
    entries: [
      { score: 3, response: `P(not red) = 1 - 4/10 = 0.6 using the complement rule. For both red without replacement: P = 6/10 × 6/10 = 0.36 because each draw has a 60% chance of being red. These events are dependent because we draw without replacement.` },
      { score: 6, response: `Complement rule: P(not red) = 1 - P(red) = 1 - 4/10 = 6/10 = 0.6. Both red without replacement: P(both red) = P(1st red) × P(2nd red | 1st red) = (6/10) × (5/9) = 30/90 = 1/3 ≈ 0.333. This uses the general multiplication rule because the events are dependent — drawing the first red changes the marble counts, making the second draw conditional on the first.` },
      { score: 9, response: `Part 1 — Complement rule:\nP(not red) = 1 − P(red) = 1 − 4/10 = 6/10 = 0.60\nThe complement rule states: P(Aᶜ) = 1 − P(A). I used it here because it is easier to calculate the probability of NOT getting red than to add up P(blue) + P(green).\n\nPart 2 — Both red without replacement:\nFirst draw: P(1st red) = 6/10 (6 red out of 10 total)\nSecond draw (given first was red): P(2nd red | 1st red) = 5/9 (now 5 red remain out of 9 total)\nGeneral multiplication rule: P(A and B) = P(A) × P(B|A)\nP(both red) = (6/10) × (5/9) = 30/90 = 1/3 ≈ 0.333\n\nWhy dependent: Drawing without replacement means the composition of the box changes after the first draw. If the first marble is red, we now have 5 red and 4 non-red left (9 total) — the probability of a red second draw has changed from 6/10 to 5/9. This change in probability based on a prior outcome is the definition of dependent events. If we had drawn with replacement, P(2nd red) would still be 6/10 regardless of the first draw — those would be independent events.` },
    ],
  },

  // ── 20. Outliers in Regression ────────────────────────────────────────────
  {
    essayPrompt: `A researcher studying the relationship between years of experience (x) and annual salary (y) in thousands of dollars fits a regression model. One data point belongs to a CEO with 5 years of experience but a salary of $850,000 — far higher than all other employees. Essay Prompt: Define what makes a point influential in regression. Explain the difference between leverage and influence. Describe how this CEO data point would likely affect the fitted regression line if included, and whether this point is influential. In your explanation, be sure to cover: What makes a point high-leverage and how that is determined. What "influential" means and how it is assessed (e.g., Cook's distance). How the CEO point would shift the slope and intercept. Whether to include or exclude it and why.`,
    checklistItems: [
      { category: 'Leverage (3 pts)', points: 3, items: ['Leverage = how far a point\'s x-value is from the mean of x', 'CEO has x = 5 years — if most employees cluster at much higher experience, this is unusual x; depends on data range', 'High-leverage points have the potential to be influential but need not be'] },
      { category: 'Influence (3 pts)', points: 3, items: ['Influence = actual change in the regression line when the point is included vs. excluded', 'Measured by Cook\'s distance or difference in fitted values', 'A point is influential if removing it substantially changes the slope, intercept, or predictions'] },
      { category: 'Effect on Regression Line (4 pts)', points: 4, items: ['This point has an extreme y-value (850K vs. typical salaries)', 'Including it would pull the regression line upward and increase the slope significantly', 'The model would predict unrealistically high salaries for all x-values', 'Recommendation: investigate whether CEO is part of the same population; if not, exclude or analyze separately'] },
    ],
    modelText: `Leverage: A point has high leverage when its x-value is far from the mean of x. The CEO has 5 years of experience — whether this is unusual depends on where other employees cluster. If most have 10–30 years, then 5 years is at the low extreme and would have high leverage.\n\nInfluence: A point is influential if including it substantially changes the regression coefficients. This is measured by Cook's distance or simply comparing the slope/intercept with and without the point. Leverage gives a point the potential to be influential; whether it actually is depends on whether its y-value is consistent with the regression trend.\n\nEffect: The CEO's salary ($850K) is a massive outlier in y. Including this point would likely pull the regression line strongly upward (inflated intercept) and increase the slope (making salary grow faster per year of experience than it actually does for typical employees). The model would then overestimate salaries for all employees.\n\nRecommendation: Investigate whether the CEO belongs to the same population as regular employees. If not, the point should be excluded or the data should be analyzed in two separate groups. Keeping it distorts the model for the population of interest.`,
    entries: [
      { score: 3, response: `An outlier in regression is a point that is far from the other points. High leverage means the point is far from the other x-values. The CEO makes a lot more money than everyone else so it would affect the regression line by pulling it up. It is probably influential because it is so different from the rest of the data.` },
      { score: 6, response: `Leverage: A point has high leverage if its x-value is far from the mean of x. The CEO has 5 years of experience — if most employees have more experience, this gives the CEO high leverage. Influence: A point is influential if removing it significantly changes the regression line (slope/intercept). Cook's distance measures this. The CEO's extreme salary ($850K) would pull the regression line upward, inflating the slope and intercept. This point is likely influential — removing it would substantially change the model. The recommendation is to investigate whether the CEO is part of the same population and possibly analyze executives separately.` },
      { score: 9, response: `Leverage:\nA data point has high leverage when its x-value is extreme relative to the other x-values — specifically, when it is far from x̄. The CEO has 5 years of experience. If the typical employee has 10–25 years, then x = 5 puts this point at the low tail of the x-distribution, giving it high leverage. High leverage means the point has the potential to strongly influence the fitted regression line, but leverage alone does not determine actual influence.\n\nInfluence:\nA point is influential if its inclusion substantially changes the estimated regression coefficients. This is typically measured by Cook's distance: D_i = (b̂ − b̂₍₋ᵢ₎)ᵀ(XᵀX)(b̂ − b̂₍₋ᵢ₎) / (p × MSE), where b̂₍₋ᵢ₎ is the estimate without observation i. A simpler check: compare the slope and intercept with and without the point — large changes indicate influence.\n\nEffect on the regression line:\nThe CEO's y-value ($850K) is a massive outlier relative to typical employees. Including this point would: (1) inflate the estimated slope (making salary appear to grow faster with experience than it actually does for non-executives), and (2) push the intercept upward. The result is a misleading model that overestimates salaries across all experience levels.\n\nRecommendation:\nThis CEO data point represents a fundamentally different population (executive compensation vs. employee compensation). Including it violates the assumption that the model describes a homogeneous group. Best practice: investigate the data-generating process, then either exclude the CEO from this analysis or fit separate models for executives and non-executives.` },
    ],
  },

];

// Build entries
const syntheticEntries = [];
for (const topic of syntheticTopics) {
  for (const e of topic.entries) {
    syntheticEntries.push(makeEntry({
      essayPrompt:     topic.essayPrompt,
      checklistItems:  topic.checklistItems,
      keyConceptsText: '',
      modelText:       topic.modelText,
      studentWork:     e.response,
    }, e.score));
  }
}

console.log(`Step 3: ${syntheticEntries.length} synthetic entries created across ${syntheticTopics.length} topics`);

// ── STEP 4a: Score patches — score 1 (off-topic) and score 10 (perfect) ──────
// Score 1 = student writes something but it's completely off-topic.
// Score 10 = comprehensive, precise, perfectly communicated answer.

const patchEntries = [

  // ── Score 1 entries (off-topic / garbled) ──────────────────────────────
  makeEntry({
    essayPrompt: `Researchers randomly assigned 60 participants to either a new exercise program or a control group for 8 weeks, then compared mean blood pressure. Explain why this is an experiment and not an observational study, identify the explanatory and response variables, and discuss why random assignment is important.`,
    checklistItems: [
      { category: 'Experiment vs. Observational (3 pts)', points: 3, items: ['Has random assignment to treatment groups → it is an experiment', 'In an observational study, the researcher does not assign the treatment'] },
      { category: 'Variables (3 pts)', points: 3, items: ['Explanatory variable: exercise program (yes/no)', 'Response variable: blood pressure'] },
      { category: 'Random Assignment (4 pts)', points: 4, items: ['Distributes confounding variables evenly across groups', 'Allows causal inference — differences in blood pressure can be attributed to the program'] },
    ],
    modelText: '',
    studentWork: `I think blood pressure is caused by stress and diet. Exercise can help but genetics also plays a role. My grandfather had high blood pressure and he exercised every day so it really depends on the person. The study should have measured cholesterol too.`,
  }, 1),

  makeEntry({
    essayPrompt: `A poll finds 62 of 100 surveyed students prefer online classes. Construct a 95% confidence interval for the true proportion of all students who prefer online classes. Check conditions, show work, and interpret the interval.`,
    checklistItems: [
      { category: 'Conditions (2 pts)', points: 2, items: ['np̂ = 62 ≥ 10 ✓; n(1−p̂) = 38 ≥ 10 ✓; random sample'] },
      { category: 'Calculation (4 pts)', points: 4, items: ['p̂ = 0.62; SE = √(0.62×0.38/100) ≈ 0.0485; CI = 0.62 ± 1.96(0.0485) = (0.525, 0.715)'] },
      { category: 'Interpretation (4 pts)', points: 4, items: ['95% confident the true proportion of all students preferring online classes is between 52.5% and 71.5%'] },
    ],
    modelText: '',
    studentWork: `Confidence intervals are used in many fields including medicine and engineering. The level of confidence tells you how sure you are. In sports analytics teams use confidence intervals to evaluate player performance. There are different types like bootstrap intervals which don't require normality assumptions. The width of an interval depends on many things.`,
  }, 1),

  makeEntry({
    essayPrompt: `A professor claims the average quiz score is 75 points. A random sample of 20 students yields x̄ = 71, s = 8. Conduct a two-tailed t-test at α = 0.05. State hypotheses, calculate t, give df, and write a conclusion.`,
    checklistItems: [
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ = 75; H₁: μ ≠ 75'] },
      { category: 'Test Statistic (4 pts)', points: 4, items: ['t = (71 − 75)/(8/√20) = −4/1.789 ≈ −2.236; df = 19'] },
      { category: 'Conclusion (4 pts)', points: 4, items: ['|t| = 2.236 > t*(19, 0.025) ≈ 2.093 → reject H₀; evidence mean differs from 75'] },
    ],
    modelText: '',
    studentWork: `The professor might be wrong. Averages can be misleading because they are pulled by outliers. The median would be a better measure. Also 20 students is a small sample so you can't really conclude much. Standard deviation of 8 points means the scores are spread out which means some students are doing very badly and pulling the average down.`,
  }, 1),

  makeEntry({
    essayPrompt: `Explain the difference between a Type I error and a Type II error in hypothesis testing. Give a concrete example of each in the context of testing whether a drug reduces blood pressure, and explain which error might be more costly in a medical setting.`,
    checklistItems: [
      { category: 'Type I Error (4 pts)', points: 4, items: ['Rejecting H₀ when it is true (false positive)', 'Example: concluding drug works when it actually does not'] },
      { category: 'Type II Error (4 pts)', points: 4, items: ['Failing to reject H₀ when it is false (false negative)', 'Example: concluding drug does not work when it actually does'] },
      { category: 'Which Is Worse (2 pts)', points: 2, items: ['Context-dependent: Type II may be worse (missing an effective drug delays treatment); Type I could harm patients if ineffective drug is deployed'] },
    ],
    modelText: '',
    studentWork: `I learned about errors in my computer science class. In programming, errors can be syntax errors, runtime errors, or logic errors. Logic errors are the hardest to find because the program runs but gives the wrong output. Error handling in Python uses try-except blocks. Statistical errors are similar in that you want to minimize them but sometimes you can't avoid them.`,
  }, 1),

  // ── Score 10 entries (perfect, comprehensive answers) ──────────────────
  makeEntry({
    essayPrompt: `Researchers randomly assigned 60 participants to either a new exercise program or a control group for 8 weeks, then compared mean blood pressure. Explain why this is an experiment and not an observational study, identify the explanatory and response variables, and discuss why random assignment is important.`,
    checklistItems: [
      { category: 'Experiment vs. Observational (3 pts)', points: 3, items: ['Has random assignment to treatment groups → it is an experiment', 'In an observational study, the researcher does not assign the treatment'] },
      { category: 'Variables (3 pts)', points: 3, items: ['Explanatory variable: exercise program (yes/no)', 'Response variable: blood pressure'] },
      { category: 'Random Assignment (4 pts)', points: 4, items: ['Distributes confounding variables evenly across groups', 'Allows causal inference — differences in blood pressure can be attributed to the program'] },
    ],
    modelText: '',
    studentWork: `This is an experiment, not an observational study, because the researchers actively assigned participants to groups using random assignment — they did not merely observe who chose to exercise. In an observational study, no treatment is assigned; the researcher only records what participants do naturally.\n\nExplanatory variable: Exercise program participation (two levels: exercise program vs. control/no program). This is what is being manipulated.\nResponse variable: Blood pressure, measured after 8 weeks. This is the outcome being compared.\n\nRandom assignment is critical for three reasons:\n1. It distributes potential confounders — prior fitness level, diet, age, stress — roughly equally across both groups by chance. No systematic pre-existing difference between groups is expected.\n2. It enables causal inference: if blood pressure differs between groups at the end of 8 weeks, we can attribute that difference to the exercise program rather than some pre-existing difference between participants.\n3. It eliminates selection bias — without random assignment, health-conscious people might self-select into exercise, making the program appear more effective than it is.\n\nIn sum, this design — random assignment, two groups, measured outcome — meets the definition of a true experiment and supports causal conclusions about the exercise program's effect on blood pressure.`,
  }, 10),

  makeEntry({
    essayPrompt: `A coach measures each of 15 runners' mile time (in minutes) before and after a 6-week training program. The differences (before − after) for each runner have a mean of d̄ = 1.2 minutes and a standard deviation of s_d = 0.9 minutes. Explain why a paired t-test is appropriate here instead of a two-sample t-test. Then conduct a one-sample t-test on the differences at α = 0.05 to determine whether the training program significantly reduced mile time.`,
    checklistItems: [
      { category: 'Why Paired (3 pts)', points: 3, items: ['Same runners measured twice — not independent groups', 'Pairing removes between-runner variability, increasing sensitivity'] },
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ_d = 0; H₁: μ_d > 0 (one-tailed)'] },
      { category: 'Test Statistic and df (3 pts)', points: 3, items: ['t = 1.2/(0.9/√15) ≈ 5.16; df = 14'] },
      { category: 'Conclusion (2 pts)', points: 2, items: ['t* ≈ 1.761; 5.16 >> 1.761 → reject H₀; training significantly reduced mile time'] },
    ],
    modelText: '',
    studentWork: `Why paired, not two-sample:\nA paired t-test is correct here because the same 15 runners were measured twice — before and after the program. These are not two separate independent groups; each observation in the "before" sample is directly linked to the corresponding observation in the "after" sample (same person). Using a two-sample t-test would ignore this pairing and treat the before and after times as if they came from unrelated groups — this wastes information and loses statistical power.\n\nPairing is specifically beneficial because runners vary greatly in natural ability: some are fast, some slow. When we compute differences (before − after) within each runner, natural speed differences cancel out, and we focus solely on within-runner improvement. This makes the paired test far more sensitive to the training effect.\n\nHypotheses (let d = before − after for each runner):\nH₀: μ_d = 0 — the training program produces no average change in mile time\nH₁: μ_d > 0 — runners' before times exceed after times on average (they got faster; one-tailed)\n\nTest statistic — one-sample t-test on d values:\nt = d̄ / (s_d / √n) = 1.2 / (0.9 / √15) = 1.2 / (0.9 / 3.873) = 1.2 / 0.2324 ≈ 5.16\ndf = n − 1 = 15 − 1 = 14\n\nDecision: At α = 0.05, one-tailed, t*(14) ≈ 1.761. Since 5.16 >> 1.761, we reject H₀.\n\nConclusion: There is very strong evidence (t = 5.16, p << 0.001) that the 6-week training program significantly reduced runners' mile times. The average improvement of 1.2 minutes is both statistically significant and practically meaningful for competitive runners.`,
  }, 10),

  makeEntry({
    essayPrompt: `A statistics instructor collects data on hours studied (x) and final exam score (y) for 50 students and fits a least-squares regression line: ŷ = 52 + 4.3x, with R² = 0.61. Interpret the slope and y-intercept of the regression equation in context. Interpret the R² value. Use the equation to predict the exam score for a student who studies 8 hours, and discuss one limitation of using this model for prediction.`,
    checklistItems: [
      { category: 'Slope Interpretation (3 pts)', points: 3, items: ['For each additional hour studied, predicted score increases 4.3 points on average'] },
      { category: 'Intercept and R² (3 pts)', points: 3, items: ['Intercept: student studying 0 hrs predicted to score 52; limited practical meaning', 'R²=0.61: 61% of score variability explained by hours studied'] },
      { category: 'Prediction and Limitation (4 pts)', points: 4, items: ['ŷ = 52 + 4.3(8) = 86.4 points', 'Limitation: correlation ≠ causation; lurking variables; extrapolation risk; individual uncertainty'] },
    ],
    modelText: '',
    studentWork: `Slope (4.3): For each additional hour a student studies, their predicted final exam score increases by 4.3 points, on average. The positive slope indicates a positive association — more studying is associated with higher scores. The word "predicted" is important: this is the model's estimate, not a guarantee for any individual student.\n\nIntercept (52): A student who studies 0 hours is predicted to score 52 points. This intercept is of limited practical meaning — it is unlikely that students study 0 hours (that may be outside the observed data range), and we should be cautious interpreting the intercept as a real-world prediction at x = 0.\n\nR² = 0.61: 61% of the variability in final exam scores is explained by the linear relationship with hours studied. The remaining 39% is due to other factors not included in the model — natural ability, prior knowledge, test anxiety, attendance, sleep, etc. An R² of 0.61 indicates a moderately strong linear fit.\n\nPrediction for x = 8 hours:\nŷ = 52 + 4.3(8) = 52 + 34.4 = 86.4 points\n\nLimitation: The regression line shows association, not causation. Students who study more may also be more naturally capable, more motivated, or better prepared — these lurking variables could be driving both the studying behavior and the higher scores. Additionally, individual predictions carry uncertainty; the regression gives the average predicted score for students who study 8 hours, but any specific student's score will deviate from 86.4 based on all those other factors. A prediction interval would quantify this individual uncertainty.`,
  }, 10),

  makeEntry({
    essayPrompt: `A researcher surveys 300 college students and records their exercise frequency (Regular / Occasional / None) and self-reported health status (Good / Poor). Explain how you would conduct a chi-square test of independence. State the null and alternative hypotheses, calculate degrees of freedom, explain expected cell counts, and describe what a significant result means.`,
    checklistItems: [
      { category: 'Hypotheses (3 pts)', points: 3, items: ['H₀: Exercise frequency and health status are independent', 'H₁: They are not independent (association exists)'] },
      { category: 'Degrees of Freedom (3 pts)', points: 3, items: ['df = (3−1)(2−1) = 2'] },
      { category: 'Expected Counts and Interpretation (4 pts)', points: 4, items: ['Expected = (row total × column total) / grand total', 'Significant result means evidence of an association between exercise and health'] },
    ],
    modelText: '',
    studentWork: `Hypotheses:\nH₀: Exercise frequency and self-reported health status are independent — knowing a student's exercise frequency provides no information about their health status, and vice versa.\nH₁: Exercise frequency and health status are not independent — there is a statistically significant association between them.\n\nDegrees of freedom:\nThe contingency table is 3 × 2 (3 exercise levels × 2 health levels).\ndf = (number of rows − 1)(number of columns − 1) = (3 − 1)(2 − 1) = 2 × 1 = 2\n\nExpected cell counts:\nFor each cell: Expected = (row total × column total) / grand total\nFor example, if 150 students report Good health and 120 exercise Regularly: Expected count for (Regular, Good) = (120 × 150) / 300 = 60.\nExpected counts represent what cell frequencies would look like if H₀ were true — if exercise and health were completely unrelated. The chi-square statistic measures the total discrepancy between observed and expected counts: χ² = Σ (O − E)² / E. Each cell contributes proportionally to the total discrepancy.\n\nNote: We must verify that all expected counts are ≥ 5 for the chi-square approximation to be valid.\n\nInterpretation of a significant result:\nIf p-value < α (say 0.05), we reject H₀ and conclude there is sufficient evidence of an association between exercise frequency and health status in the student population. Specifically, the distribution of health status differs across exercise levels more than random chance would produce. This does NOT establish causation — students who exercise regularly may also differ in other health-related behaviors (diet, sleep) that contribute to better health.`,
  }, 10),

];

console.log(`Step 4a: ${patchEntries.length} patch entries created (score 1 × 4, score 10 × 4)`);

// ── STEP 4b: Narrative rubric format entries ──────────────────────────────────
// 3 topics × 3 quality levels = 9 entries
// Rubric format: prose "WHAT TO LOOK FOR" description — no checklist

const narrativeEntries = [

  // Topic A: Type I / Type II errors (drug trial context)
  ...(['weak', 'partial', 'strong'].map((level, i) => {
    const parts = {
      essayPrompt: `A pharmaceutical company tests a new pain medication. The null hypothesis is that the drug has no effect. Explain what a Type I error and a Type II error would mean in this clinical trial context, and discuss which type of error might have more serious consequences and why.`,
      whatToLookFor: `A strong response will correctly define Type I error as rejecting H₀ when it is actually true (concluding the drug works when it does not — a false positive) and Type II error as failing to reject H₀ when it is false (concluding the drug is ineffective when it actually works — a false negative). The student should contextualize both: Type I means approving an ineffective drug (wastes resources, may delay better treatments, could expose patients to side effects without benefit); Type II means rejecting an effective drug (patients who could benefit do not receive treatment). A strong response engages with the tradeoff: Type I is traditionally controlled by choosing α (e.g., 0.05), while Type II error rate (β) is reduced by increasing sample size or effect size. The student should take a defensible position on which is more serious — in medical contexts, this is genuinely nuanced (some argue Type I is worse due to patient safety; others argue Type II is worse due to missed benefits) — and explain their reasoning. Partial credit if definitions are correct but contextual examples or the tradeoff discussion is missing.`,
      studentWork: level === 'weak'
        ? `A Type I error is when you make a mistake in one direction and a Type II error is when you make a mistake in the other direction. In a drug trial this would mean either saying the drug works when it doesn't or saying it doesn't work when it does. Both are bad but they are different kinds of mistakes. Scientists try to avoid both types of errors when doing research.`
        : level === 'partial'
        ? `A Type I error is when we reject H₀ even though it is true — in this trial, it means concluding the drug is effective when it actually has no effect. A Type II error is failing to reject H₀ when it is false — concluding the drug doesn't work when it actually does. Type I is controlled by the significance level α. Type II is related to the power of the test. In a clinical trial, a Type I error could mean releasing a drug that doesn't help patients and may have side effects. A Type II error means patients who could benefit don't receive the drug. I think Type II might be worse here because patients miss out on a real treatment.`
        : `Type I error: We reject H₀ (no effect) when it is actually true — we conclude the drug is effective when it has no real pharmacological benefit. In this trial, that means approving a useless medication. Consequences: patients experience side effects without benefit, resources are diverted from effective treatments, and public trust in medicine erodes if the error is discovered later.\n\nType II error: We fail to reject H₀ when it is false — we conclude the drug is ineffective when it actually works. Consequences: an effective pain medication is not approved; patients who could have received relief continue to suffer; a potentially beneficial treatment is abandoned.\n\nThe tradeoff: Type I error rate is controlled by the significance level α (typically 0.05). Type II error rate (β) is reduced by increasing sample size, using a larger α, or designing the study to detect a clinically meaningful effect size (power analysis).\n\nWhich is more serious depends on context. In oncology, where few effective treatments exist, a Type II error (missing an effective drug) may be catastrophic for patients. In a pain medication trial with existing alternatives, a Type I error (releasing an ineffective drug with side effects) may be more harmful. Most regulatory frameworks (like FDA Phase III trials) prioritize controlling Type I error to protect patients from ineffective treatments, accepting some risk of Type II error. Both matter — the goal is to design sufficiently powered studies that keep both rates acceptably low.`,
    };
    return makeNarrativeEntry(parts, level === 'weak' ? 3 : level === 'partial' ? 6 : 9);
  })),

  // Topic B: Sampling variability / Law of Large Numbers (coin flip scenario)
  ...(['weak', 'partial', 'strong'].map((level, i) => {
    const parts = {
      essayPrompt: `A student flips a fair coin 10 times and gets 8 heads. She concludes: "This coin must be biased." Another student flips the same coin 1,000 times and gets 520 heads. He concludes: "This coin is definitely fair." Evaluate both students' reasoning using the concepts of sampling variability and the Law of Large Numbers.`,
      whatToLookFor: `A strong response demonstrates understanding that 8/10 heads (80%) is not sufficient evidence to conclude bias because the sample is tiny — with only 10 flips, substantial deviation from 50% is expected by chance alone (sampling variability). The first student's conclusion is too strong for such a small sample. For the second student: 520/1000 = 52% is very close to the expected 50%, and with a large sample the Law of Large Numbers guarantees that the sample proportion will be close to the true probability. However, the student cannot conclude the coin is "definitely" fair — only that the observed proportion is consistent with a fair coin. "Definitely" implies certainty, which is never available in statistics. A strong response will reference sampling variability (natural fluctuation in statistics from sample to sample), the Law of Large Numbers (as n increases, x̄ → μ), and the distinction between "consistent with fairness" and "proven fair." Credit for understanding that neither student can make an absolute claim.`,
      studentWork: level === 'weak'
        ? `The first student might be right because 8 heads out of 10 is a lot more than 5. That's 80% heads which is much higher than 50%. The second student got 52% which is much closer to 50% so the coin seems fair. In statistics you need enough data to make good conclusions and 10 flips is probably not enough but 1000 flips should be plenty.`
        : level === 'partial'
        ? `The first student's reasoning is flawed. With only 10 flips, getting 8 heads is surprising but not impossible for a fair coin — sampling variability means results can deviate significantly from the expected 50% in small samples. A sample of 10 is too small to make confident conclusions about bias.\n\nThe second student's conclusion is mostly sound. By the Law of Large Numbers, as sample size grows, the sample proportion converges to the true probability. Getting 520/1000 = 52% is very close to the expected 50%, consistent with a fair coin. However, saying "definitely fair" is too strong — we can only say the results are consistent with a fair coin, not that we've proven it to be fair.`
        : `First student's reasoning — flawed:\n8 heads in 10 flips = 80%, which seems alarming, but with n=10, extreme results are expected due to sampling variability. Each flip is independent with P(heads) = 0.5 for a fair coin. The variability of the sample proportion is SE = √(p(1-p)/n) = √(0.5×0.5/10) ≈ 0.158. Getting 8 heads (p̂=0.80) is only about 1.9 standard errors above 0.5 — unusual but not conclusive evidence of bias. A fair coin produces 8+ heads in 10 flips with probability ≈ 5.5%. The sample is simply too small to distinguish random fluctuation from true bias. The first student has committed the classic error of over-interpreting a small sample.\n\nSecond student's reasoning — mostly sound, but overclaims:\n520/1000 = 52%, which is very close to 50%. The Law of Large Numbers states that as n → ∞, the sample proportion converges to the true population probability. With n=1000, SE = √(0.5×0.5/1000) ≈ 0.0158. Getting 52% is only about 1.27 standard errors above 50% — entirely consistent with a fair coin (p-value ≈ 0.20). The Law of Large Numbers explains why the result is so close to 50%.\n\nHowever, "definitely fair" is never statistically justified. The coin could be very slightly biased (say, p=0.51) and still produce 52% heads in 1000 trials — we lack the power to detect such a small bias. The second student should say "the results are consistent with a fair coin" rather than claiming certainty. Statistics never provides certainty; it provides evidence.`,
    };
    return makeNarrativeEntry(parts, level === 'weak' ? 3 : level === 'partial' ? 7 : 9);
  })),

  // Topic C: Voluntary response bias / sampling methods (TV poll scenario)
  ...(['weak', 'partial', 'strong'].map((level, i) => {
    const parts = {
      essayPrompt: `A local TV news station asks viewers to call in to vote on whether the city should build a new sports stadium. Out of 2,400 callers, 78% say "No." The station reports: "An overwhelming majority of city residents oppose the stadium." Identify and explain the sampling method used, what bias it introduces, and whether the conclusion is valid.`,
      whatToLookFor: `A strong response identifies this as voluntary response sampling (also called self-selection bias) — only people who feel strongly enough to call in respond, which systematically skews results toward those with extreme opinions (typically opponents, who are more motivated to act). Key points: (1) the sampling method is voluntary response / self-selected, not random; (2) voluntary response bias means the sample systematically over-represents people with strong negative opinions; (3) the station's conclusion ("overwhelming majority of city residents") is not valid — they cannot generalize from this non-representative sample to the population of all city residents; (4) a valid approach would use a simple random sample or a stratified random sample of city residents. Credit for correctly naming the bias, explaining the mechanism (who is more likely to call), and stating why generalization is invalid.`,
      studentWork: level === 'weak'
        ? `This poll is biased because not everyone in the city participated. The people who called in might have stronger opinions. 78% is a large majority so it does seem like most people oppose the stadium. The TV station should have surveyed more people to get a better answer. Polls like this are common on the news but they are not very accurate.`
        : level === 'partial'
        ? `The sampling method is voluntary response sampling — only viewers who chose to call in participated. This introduces voluntary response bias: people with strong opinions, especially those opposed to the stadium, are much more likely to take the effort to call in than people who are neutral or mildly in favor. The sample over-represents extreme opponents.\n\nThe conclusion is not valid. The 78% "No" result reflects the self-selected callers, not city residents as a whole. A random sample of residents might reveal very different opinions. To make valid generalizations, the station would need to use a simple random sample or another probability-based sampling method.`
        : `Sampling method: Voluntary response sampling (self-selection). Only TV viewers who actively chose to call in participated — this is not a random sample of city residents.\n\nBias introduced: Voluntary response bias. People with strong negative feelings about the stadium are far more motivated to call in and make their voice heard than those who support it or are neutral. This systematically over-represents opponents of the stadium. The mechanism: those who feel most passionate (in this case, opponents) self-select into the sample, while the majority of residents — who may be mildly supportive or indifferent — never call. The sample is therefore not representative of the city's population.\n\nValidity of the conclusion:\nThe conclusion "an overwhelming majority of city residents oppose the stadium" is NOT valid. You cannot generalize from a voluntary response sample to the broader population. The 78% figure represents only those motivated enough to call — it does not estimate the proportion of all residents who oppose the stadium. Extending this result to "city residents" is an unsupported overgeneralization.\n\nWhat should have been done: The station should have commissioned a probability-based survey — for example, a simple random sample of registered voters or a stratified random sample of city residents by district — to produce a result that could legitimately be generalized. Such a sample would give every resident an equal (or known) probability of selection, avoiding self-selection bias.`,
    };
    return makeNarrativeEntry(parts, level === 'weak' ? 3 : level === 'partial' ? 7 : 9);
  })),

];

console.log(`Step 4b: ${narrativeEntries.length} narrative rubric entries created`);

// ── STEP 4c: Holistic anchor rubric format entries ────────────────────────────
// 3 topics × 3 quality levels = 9 entries
// Rubric format: SCORING GUIDE with band descriptions (1-4, 5-7, 8-10)

const holisticEntries = [

  // Topic A: Correlation vs. causation (ice cream / crime headline)
  ...(['weak', 'partial', 'strong'].map((level, i) => {
    const parts = {
      essayPrompt: `A news headline reads: "Ice cream sales and murder rates both spike in summer — study finds ice cream causes crime!" Explain why this headline is misleading. Identify the actual relationship between these variables and explain the concept being illustrated.`,
      scoringGuide: `8-10 (Excellent): Correctly identifies this as a correlation-not-causation error. Names the lurking variable (temperature / hot weather) and explains the mechanism: hot weather independently causes both more ice cream purchases and more outdoor activity leading to more crime — they share a common cause but do not causally influence each other. Uses precise vocabulary (confounding/lurking variable, association vs. causation). May note that correlation is a prerequisite for causation but not sufficient. Explains why the headline is not just misleading but logically invalid.

5-7 (Developing): Correctly states correlation does not imply causation and identifies that a lurking variable (likely temperature or season) explains both trends. May lack precise explanation of the mechanism or imprecise vocabulary, but the core reasoning is sound.

1-4 (Beginning): May acknowledge the headline seems wrong but cannot identify a lurking variable or explain the mechanism. May confuse association with causation or provide a vague response like "correlation is not the same as cause."`,
      studentWork: level === 'weak'
        ? `The headline is misleading because just because two things happen at the same time doesn't mean one causes the other. Ice cream doesn't make people commit crimes. There are probably other reasons why both go up in summer. You can't trust news headlines about statistics because they are often wrong.`
        : level === 'partial'
        ? `The headline confuses correlation with causation. Ice cream sales and murder rates are correlated — both increase in summer — but this does not mean ice cream causes crime. There is likely a lurking variable: hot weather. When it's hot, people buy more ice cream AND more people are outside, which increases social interactions and opportunities for conflict. Both variables share a common cause (temperature/season) but do not influence each other directly.`
        : `The headline commits the classic correlation-causation fallacy. Just because two variables move together — both increase in summer — does not mean one causes the other. In this case, ice cream sales do not cause crime.\n\nThe actual relationship: Both ice cream sales and crime rates share a common lurking variable — temperature and summer conditions. Hot weather causes people to purchase more ice cream (seeking relief from heat). Hot weather also causes more people to be outside, in public spaces, and socializing for longer hours — all of which increase opportunities for interpersonal conflict and crime. The two variables are associated only because they share this common seasonal driver, not because they influence each other.\n\nThis is a textbook confounding/lurking variable problem. If we controlled for temperature (e.g., compared ice cream sales and crime rates only in months with the same average temperature), the apparent association would disappear or diminish substantially.\n\nThe conceptual lesson: Correlation is a necessary condition for causation but not sufficient. Establishing causation requires either (1) a randomized experiment that can rule out confounders, or (2) strong theoretical justification plus evidence that rules out alternative explanations. A headline can identify an interesting association worthy of investigation — but claiming causation from observational correlation is logically invalid.`,
    };
    return makeHolisticEntry(parts, level === 'weak' ? 3 : level === 'partial' ? 6 : 9);
  })),

  // Topic B: Central Limit Theorem (student misconception correction)
  ...(['weak', 'partial', 'strong'].map((level, i) => {
    const parts = {
      essayPrompt: `A classmate says: "The Central Limit Theorem says that as you collect more data, your data will eventually become normally distributed." Explain whether your classmate is correct or incorrect, and state what the Central Limit Theorem actually says. Give an example to illustrate.`,
      scoringGuide: `8-10 (Excellent): Clearly identifies the misconception — the CLT does not say individual data values become normal. States the CLT correctly: as sample size increases, the sampling distribution of the sample mean (x̄) approaches a normal distribution, regardless of the population distribution. Distinguishes between: the population distribution (fixed, may be skewed), the distribution of raw data (same shape as population, does not change with n), and the sampling distribution of x̄ (becomes approximately normal as n increases, typically n ≥ 30 as a rule of thumb). Provides a concrete example (e.g., household income is right-skewed; individual incomes don't become normal with more data, but the distribution of sample means from many samples would be approximately normal). Precise, complete, clearly communicated.

5-7 (Developing): Correctly identifies that the classmate is wrong. States that the CLT is about sample means, not individual values. May not clearly distinguish all three distributions or may lack a concrete illustrative example. Core understanding is present but explanation has gaps.

1-4 (Beginning): May partially identify the error but cannot correctly state what the CLT actually says. May confuse sample distributions with sampling distributions, or state the CLT incorrectly.`,
      studentWork: level === 'weak'
        ? `My classmate is not quite right. The CLT is about sample means, not individual data values. As you take more samples the distribution of the means will be normal. Individual data points stay the same. The CLT is one of the most important theorems in statistics.`
        : level === 'partial'
        ? `The classmate is incorrect. The CLT does not say raw data becomes normally distributed. What the CLT actually says is: as the sample size increases, the sampling distribution of the sample mean (x̄) approaches a normal distribution, regardless of what the population distribution looks like. This is true even if the underlying data is skewed or not normal at all. For example, if incomes in a city are right-skewed (a few very high earners), each individual income measurement stays right-skewed — the CLT doesn't change that. But if you repeatedly took random samples of n=50 incomes and computed the mean each time, those sample means would follow an approximately normal distribution.`
        : `The classmate is incorrect, and the misunderstanding is a very common one.\n\nWhat the classmate said: "As you collect more data, your data will eventually become normally distributed." This describes the distribution of individual observations — but more data does not change the shape of the population distribution. If individual incomes are right-skewed, adding more income data to the dataset keeps the distribution right-skewed.\n\nWhat the CLT actually says: The Central Limit Theorem states that as sample size (n) increases, the sampling distribution of the sample mean x̄ approaches a normal distribution with mean μ and standard deviation σ/√n — regardless of the shape of the population distribution. A common guideline is that the approximation is reasonably good for n ≥ 30, though for highly skewed populations, larger n may be needed.\n\nKey distinction between three distributions:\n1. Population distribution: the distribution of individual values — may be skewed, uniform, bimodal, etc.; does NOT change as n increases.\n2. Sample data distribution: a snapshot of the population; more data makes it a better estimate of the population shape, not more normal.\n3. Sampling distribution of x̄: the distribution of sample means from many repeated samples — THIS is what becomes normal by the CLT.\n\nConcrete example: U.S. household incomes are strongly right-skewed. If I sample 100 households and record each income, those 100 values are still right-skewed — more data doesn't make them normal. But if I repeatedly took samples of n=100 and computed the mean income each time, those sample means would follow an approximately normal distribution (CLT). That normal approximation is what allows us to construct t-tests and confidence intervals for the mean without requiring the population to be normal.`,
    };
    return makeHolisticEntry(parts, level === 'weak' ? 3 : level === 'partial' ? 7 : 9);
  })),

  // Topic C: Stratified vs. simple random sampling
  ...(['weak', 'partial', 'strong'].map((level, i) => {
    const parts = {
      essayPrompt: `A school librarian wants to survey 100 students about library hours. She considers two options: (A) Select 100 students randomly from the entire school roster. (B) Divide students into grade levels (9th, 10th, 11th, 12th) and randomly select 25 from each grade. Compare these two sampling methods. Identify each method by name, explain the advantage of method B over method A in this context, and discuss one potential disadvantage of method B.`,
      scoringGuide: `8-10 (Excellent): Correctly names method A as simple random sampling (SRS) and method B as stratified random sampling. Explains the advantage of stratification clearly: stratified sampling guarantees representation from every grade level — with SRS, by chance, some grades could be over- or under-represented in the sample of 100. If grade level is related to library usage patterns (e.g., 12th graders use the library more for college applications), stratification ensures estimates reflect all subgroups. Notes that stratified sampling typically yields lower variance for the overall estimate when strata differ in their means. Identifies a genuine disadvantage: requires knowing stratum membership in advance; more complex to implement; equal allocation (25 per grade) may not match the actual proportional makeup of the school, which could introduce distortion if grade sizes differ substantially (proportional stratification would be better). Response is precise and uses correct terminology throughout.

5-7 (Developing): Correctly names both methods and identifies that stratified sampling guarantees representation from all grades. May not explain why this matters (e.g., not connecting it to the possibility that grade level affects library preferences) or may identify a vague or incorrect disadvantage. Core reasoning is sound but lacks depth or precision.

1-4 (Beginning): May correctly name one method or identify that they are different, but cannot explain the advantage of stratification or confuses the methods.`,
      studentWork: level === 'weak'
        ? `Method A is random sampling where you pick students randomly. Method B splits students into groups and picks from each group. Method B is better because you make sure every grade is included. If you just did random sampling you might accidentally get mostly seniors or mostly freshmen. A disadvantage of method B is that it is harder and takes more time.`
        : level === 'partial'
        ? `Method A is simple random sampling (SRS) — every student has an equal chance of being selected. Method B is stratified random sampling — the school population is divided into strata (grade levels) and a random sample is drawn from each stratum.\n\nAdvantage of B: Stratified sampling guarantees that all four grade levels are represented (25 each). With SRS, random chance could result in unequal representation — for example, getting 40 seniors and only 15 freshmen. If library preferences differ by grade (seniors may use it more for college research), SRS might give a biased estimate of overall preferences. Stratification ensures each grade's views are captured.\n\nDisadvantage of B: Equal allocation (25 per grade) may not match the actual proportions. If the school has many more juniors than freshmen, equal sampling over-represents freshmen and under-represents juniors relative to their actual population share, which could distort the overall estimate.`
        : `Method A — Simple Random Sampling (SRS): Every student in the school has an equal probability of being selected. The 100 students are chosen entirely by chance from the full roster.\n\nMethod B — Stratified Random Sampling: The population is divided into non-overlapping strata (grade levels: 9th, 10th, 11th, 12th), and a separate random sample is drawn from each stratum (25 per grade).\n\nAdvantage of Method B:\nStratified sampling guarantees representation from every grade level. With SRS and n=100, it's possible (though unlikely) to draw, say, 40 seniors, 35 juniors, 18 sophomores, and only 7 freshmen — purely by chance. If library preferences differ by grade (e.g., seniors use the library more for college application research; freshmen use it for orientation materials), SRS with an unlucky draw could produce a misleading estimate of overall library preference. Stratification eliminates this uncertainty: all four grades are represented equally, and estimates can be combined appropriately. Stratified sampling also typically reduces variance in the overall estimate when strata differ in their means — you're borrowing structure from the population rather than leaving everything to chance.\n\nDisadvantage of Method B:\nEqual allocation (25 per grade) is simple but may not be optimal if grade sizes differ substantially. Suppose the school has 400 seniors but only 200 freshmen — equal sampling over-represents freshmen (25/200 = 12.5% sampled) relative to seniors (25/400 = 6.25% sampled). To produce unbiased estimates of the school-wide preference, the librarian would need to weight the stratum estimates by stratum size — or use proportional stratification (sample proportionally to stratum size). If weighting is not applied, equal-allocation stratification can introduce bias in overall estimates even while guaranteeing stratum coverage.`,
    };
    return makeHolisticEntry(parts, level === 'weak' ? 3 : level === 'partial' ? 7 : 9);
  })),

];

console.log(`Step 4c: ${holisticEntries.length} holistic rubric entries created`);

// ── STEP 4d: Calculation-style (step-based) rubric entries ───────────────────
// Uses buildCalcPrompt / makeCalcEntry — "EXPECTED SOLUTION STEPS:" header
// Covers all major book topics with numerical calculation problems
// 3 entries per topic (wrong approach, partial, correct) = ~60 entries

const calcEntries = [

  // ── Normal z-score — find probability ──────────────────────────────────
  ...([
    { score: 2, work: `z = (78-70)/8 = 1.0. P = 1.0 - 0.8413 = 15.87%. Wait, I need to find above 78. So P(X>78) = 1 - 0.8413 = 0.1587. Actually P(X<78) = 0.8413. So P(X>78) = 0.159.` },
    { score: 6, work: `Standardize: z = (78-70)/8 = 1.0. P(X<78) = P(z<1.0) = 0.8413. P(X>78) = 1 - 0.8413 = 0.1587. About 15.87% of scores exceed 78.` },
    { score: 9, work: `Given: X ~ N(70, 8). Find P(X > 78).\nStep 1 — Standardize: z = (x − μ)/σ = (78 − 70)/8 = 8/8 = 1.00\nStep 2 — Table lookup: Φ(1.00) = P(z < 1.00) = 0.8413\nStep 3 — Complement: P(X > 78) = 1 − 0.8413 = 0.1587\nAnswer: About 15.87% of scores exceed 78 points.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Exam scores are normally distributed with mean μ = 70 and standard deviation σ = 8. Find P(X > 78). Show all steps.`,
    solutionSteps: `Step 1: Standardize the x-value: z = (x − μ) / σ = (78 − 70) / 8 = 1.00\nStep 2: Look up P(z < 1.00) from the standard normal table: Φ(1.00) = 0.8413\nStep 3: Apply complement rule: P(X > 78) = 1 − 0.8413 = 0.1587\nFinal answer: approximately 15.87%`,
    studentWork: e.work,
  }, e.score))),

  // ── Normal z-score — find percentile ───────────────────────────────────
  ...([
    { score: 2, work: `The 90th percentile means 90% of scores are below it. z = 1.28 for 90%. Score = 70 + 1.28 = 71.28. The score is about 71.28 points.` },
    { score: 6, work: `z* for 90th percentile = 1.282. Score = μ + z*σ = 70 + 1.282(8) = 70 + 10.256 = 80.26. The 90th percentile is about 80.3 points.` },
    { score: 9, work: `Find x such that P(X < x) = 0.90. X ~ N(70, 8).\nStep 1: Find z* so that P(z < z*) = 0.90. From the z-table: z* ≈ 1.282\nStep 2: Unstandardize: x = μ + z* × σ = 70 + 1.282 × 8 = 70 + 10.256 = 80.26\nThe 90th percentile of exam scores is approximately 80.3 points. 90% of students score below this value.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Exam scores are normally distributed with mean μ = 70 and standard deviation σ = 8. Find the 90th percentile score. Show all steps.`,
    solutionSteps: `Step 1: Find z* such that P(z < z*) = 0.90. From the standard normal table: z* ≈ 1.282\nStep 2: Unstandardize: x = μ + z* × σ = 70 + 1.282 × 8 = 70 + 10.256 ≈ 80.3\nFinal answer: The 90th percentile is approximately 80.3 points.`,
    studentWork: e.work,
  }, e.score))),

  // ── One-proportion z-test ───────────────────────────────────────────────
  ...([
    { score: 2, work: `p̂ = 54/100 = 0.54. H₀: p=0.50. z = (0.54 - 0.50)/0.05 = 0.8. p-value = 0.21. Fail to reject, no evidence support exceeds 50%.` },
    { score: 6, work: `p̂ = 54/100 = 0.54. SE = √(0.5×0.5/100) = 0.05. z = (0.54-0.50)/0.05 = 0.80. P(z>0.80) = 1-0.7881 = 0.2119. p-value = 0.212 > 0.05. Fail to reject H₀. Insufficient evidence that support exceeds 50%.` },
    { score: 9, work: `H₀: p = 0.50; H₁: p > 0.50 (one-tailed)\np̂ = 54/100 = 0.54\nStep 1 — SE under H₀: SE₀ = √(p₀(1−p₀)/n) = √(0.50×0.50/100) = √0.0025 = 0.05\nStep 2 — z-statistic: z = (p̂ − p₀)/SE₀ = (0.54 − 0.50)/0.05 = 0.04/0.05 = 0.80\nStep 3 — p-value (one-tailed, right): P(z > 0.80) = 1 − Φ(0.80) = 1 − 0.7881 = 0.2119\nConclusion: p = 0.212 > α = 0.05. Fail to reject H₀. There is insufficient evidence that majority support exceeds 50%.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A poll surveys 100 voters; 54 support Proposition A. Test H₀: p = 0.50 vs. H₁: p > 0.50 at α = 0.05. Show all steps.`,
    solutionSteps: `Step 1: p̂ = 54/100 = 0.54\nStep 2: SE₀ = √(0.50 × 0.50 / 100) = 0.05 (use p₀ under H₀)\nStep 3: z = (0.54 − 0.50) / 0.05 = 0.80\nStep 4: p-value = P(z > 0.80) = 1 − 0.7881 = 0.2119\nStep 5: 0.212 > 0.05 → Fail to reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Two-proportion z-test ───────────────────────────────────────────────
  ...([
    { score: 2, work: `p̂₁ = 40/100 = 0.40; p̂₂ = 55/100 = 0.55. Difference = 0.15. SE = √(0.40×0.60/100 + 0.55×0.45/100) = √(0.0024+0.002475) = √0.004875 = 0.0698. z = 0.15/0.0698 = 2.15. p-value ≈ 0.031. Reject H₀.` },
    { score: 6, work: `p̂₁ = 0.40, p̂₂ = 0.55. Pooled: p̂ = 95/200 = 0.475. SE = √(0.475×0.525/100 + 0.475×0.525/100) = √(0.002494×2) = √0.004988 = 0.0706. z = (0.40-0.55)/0.0706 = -2.12. Two-tailed p ≈ 0.034. Reject H₀ at α=0.05.` },
    { score: 9, work: `H₀: p₁ = p₂; H₁: p₁ ≠ p₂ (two-tailed)\np̂₁ = 40/100 = 0.40; p̂₂ = 55/100 = 0.55\nStep 1 — Pooled proportion: p̂_pool = (40+55)/(100+100) = 95/200 = 0.475\nStep 2 — SE: SE = √(p̂_pool(1−p̂_pool)/n₁ + p̂_pool(1−p̂_pool)/n₂)\n= √(0.475×0.525/100 + 0.475×0.525/100) = √(0.0024938 + 0.0024938) = √0.0049875 ≈ 0.07062\nStep 3 — z: z = (p̂₁ − p̂₂)/SE = (0.40 − 0.55)/0.07062 = −0.15/0.07062 ≈ −2.124\nStep 4 — p-value (two-tailed): 2 × P(z < −2.124) = 2 × 0.0168 = 0.0337\nConclusion: p = 0.034 < α = 0.05 → Reject H₀. Significant evidence of a difference in proportions.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Group 1 (n=100): 40 successes. Group 2 (n=100): 55 successes. Test H₀: p₁ = p₂ vs. H₁: p₁ ≠ p₂ at α = 0.05 using a two-proportion z-test. Show all steps.`,
    solutionSteps: `Step 1: p̂₁ = 40/100 = 0.40; p̂₂ = 55/100 = 0.55\nStep 2: Pooled: p̂ = 95/200 = 0.475\nStep 3: SE = √(p̂(1−p̂)(1/n₁ + 1/n₂)) = √(0.475×0.525×0.02) = √0.004988 ≈ 0.0706\nStep 4: z = (0.40 − 0.55)/0.0706 ≈ −2.12\nStep 5: Two-tailed p = 2×P(z<−2.12) ≈ 0.034 < 0.05 → Reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Chi-square GOF ──────────────────────────────────────────────────────
  ...([
    { score: 2, work: `Expected each = 60/4 = 15. χ² = (12-15)²/15 + (18-15)²/15 + (14-15)²/15 + (16-15)²/15 = 0.6+0.6+0.067+0.067 = 1.333. df = 4. Not significant.` },
    { score: 6, work: `Expected = 15 each. χ² = (12-15)²/15 + (18-15)²/15 + (14-15)²/15 + (16-15)²/15 = 9/15+9/15+1/15+1/15 = 0.6+0.6+0.067+0.067 = 1.333. df = 4-1 = 3. Critical value χ²(3, 0.05) = 7.815. Since 1.333 < 7.815 fail to reject. No evidence against equal distribution.` },
    { score: 9, work: `H₀: All four flavors equally preferred (p = 0.25 each); H₁: At least one differs.\nExpected counts: E = n × p = 60 × 0.25 = 15 for each flavor.\nStep 1 — χ² statistic:\nχ² = Σ (O−E)²/E\n= (12−15)²/15 + (18−15)²/15 + (14−15)²/15 + (16−15)²/15\n= 9/15 + 9/15 + 1/15 + 1/15\n= 0.600 + 0.600 + 0.067 + 0.067 = 1.333\nStep 2 — df = k − 1 = 4 − 1 = 3\nStep 3 — Decision: χ²*(3, α=0.05) = 7.815. Since 1.333 < 7.815, fail to reject H₀.\nConclusion: There is insufficient evidence that the four flavors are preferred at different rates. The data are consistent with equal preference.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `60 people each tasted 4 ice cream flavors. Observed counts: Vanilla=12, Chocolate=18, Strawberry=14, Mint=16. Test whether the flavors are equally preferred. Show all steps of a chi-square GOF test at α = 0.05.`,
    solutionSteps: `Step 1: Expected counts: E = 60/4 = 15 for each flavor\nStep 2: χ² = Σ(O−E)²/E = (12−15)²/15 + (18−15)²/15 + (14−15)²/15 + (16−15)²/15 = 0.600+0.600+0.067+0.067 = 1.333\nStep 3: df = k−1 = 3\nStep 4: χ²*(3, 0.05) = 7.815; since 1.333 < 7.815 → Fail to reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Chi-square independence ─────────────────────────────────────────────
  ...([
    { score: 2, work: `df = (2-1)(2-1) = 1. Expected for cell (Smoke, Disease) = 100×150/300 = 50. χ² = (70-50)²/50 = 8. Reject H₀. Smoking and disease are related.` },
    { score: 6, work: `E(Smoke,Disease) = (100×150)/300 = 50; E(Smoke,No Disease) = (100×150)/300 = 50; E(No Smoke,Disease) = (200×150)/300 = 100; E(No Smoke,No Disease) = 100. χ² = (70-50)²/50 + (30-50)²/50 + (80-100)²/100 + (120-100)²/100 = 8+8+4+4 = 24. df=1. χ²*(1,0.05)=3.841. 24>3.841 reject H₀. Significant association.` },
    { score: 9, work: `Table: Smokers(100): Disease=70, No Disease=30. Non-Smokers(200): Disease=80, No Disease=120. Totals: Disease=150, No Disease=150, Grand=300.\nH₀: Smoking and disease are independent; H₁: Not independent.\nStep 1 — Expected counts: E = (row total × col total)/n\nE(S,D) = 100×150/300 = 50; E(S,ND) = 100×150/300 = 50\nE(NS,D) = 200×150/300 = 100; E(NS,ND) = 200×150/300 = 100\nStep 2 — χ²:\n= (70−50)²/50 + (30−50)²/50 + (80−100)²/100 + (120−100)²/100\n= 400/50 + 400/50 + 400/100 + 400/100\n= 8 + 8 + 4 + 4 = 24.00\nStep 3 — df = (2−1)(2−1) = 1\nStep 4 — Critical value: χ²*(1, 0.05) = 3.841. Since 24 >> 3.841 → Reject H₀.\nConclusion: Strong evidence of a significant association between smoking status and disease presence.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Smokers (n=100): 70 with disease, 30 without. Non-smokers (n=200): 80 with disease, 120 without. Conduct a chi-square test of independence at α = 0.05. Show all steps.`,
    solutionSteps: `Step 1: Expected counts: E(S,D)=50, E(S,ND)=50, E(NS,D)=100, E(NS,ND)=100\nStep 2: χ² = (70−50)²/50 + (30−50)²/50 + (80−100)²/100 + (120−100)²/100 = 8+8+4+4 = 24.00\nStep 3: df = (2−1)(2−1) = 1\nStep 4: χ²*(1, 0.05) = 3.841; 24 >> 3.841 → Reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Conditional probability (Bayes table) ──────────────────────────────
  ...([
    { score: 2, work: `P(B|A) = P(A and B)/P(A). P(late | bus) = 0.30. P(bus) = 0.60. So P(late) = 0.30 × 0.60 = 0.18. P(bus|late) = 0.18/0.30 = 0.60.` },
    { score: 6, work: `P(late|bus)=0.30, P(bus)=0.60; P(late|car)=0.10, P(car)=0.40.\nP(late) = 0.30(0.60)+0.10(0.40) = 0.18+0.04 = 0.22.\nP(bus|late) = P(late|bus)P(bus)/P(late) = 0.18/0.22 ≈ 0.818. About 81.8%.` },
    { score: 9, work: `Given: P(bus)=0.60, P(car)=0.40, P(late|bus)=0.30, P(late|car)=0.10.\nStep 1 — Total probability of late:\nP(late) = P(late|bus)P(bus) + P(late|car)P(car)\n= 0.30(0.60) + 0.10(0.40) = 0.18 + 0.04 = 0.22\nStep 2 — Bayes' theorem:\nP(bus|late) = P(late|bus) × P(bus) / P(late) = (0.30 × 0.60) / 0.22 = 0.18/0.22 ≈ 0.8182\nIf a student arrives late, there is approximately an 81.8% probability they took the bus.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `60% of students take the bus (P(late|bus)=0.30); 40% take a car (P(late|car)=0.10). Given that a student arrives late, find P(student took the bus). Show all steps using Bayes' theorem.`,
    solutionSteps: `Step 1: P(late) = P(late|bus)P(bus) + P(late|car)P(car) = 0.30(0.60)+0.10(0.40) = 0.18+0.04 = 0.22\nStep 2: Bayes: P(bus|late) = (0.30×0.60)/0.22 = 0.18/0.22 ≈ 0.818`,
    studentWork: e.work,
  }, e.score))),

  // ── Binomial probability ────────────────────────────────────────────────
  ...([
    { score: 2, work: `P(X=3) = C(6,3) × 0.4^3 × 0.6^3. C(6,3) = 20. 0.4^3 = 0.064. 0.6^3 = 0.216. P = 20 × 0.064 × 0.216 = 0.2765. About 27.65%.` },
    { score: 6, work: `n=6, p=0.4, k=3. P(X=3) = C(6,3)(0.4)^3(0.6)^3 = 20 × 0.064 × 0.216 = 20 × 0.013824 = 0.2765. About 27.65%.` },
    { score: 9, work: `n=6 trials, p=0.40, k=3 successes. Verify binomial conditions: fixed n ✓, binary (success/fail) ✓, independent ✓, constant p ✓.\nP(X = 3) = C(n,k) × p^k × (1−p)^(n−k)\n= C(6,3) × (0.40)^3 × (0.60)^3\n= 20 × 0.064 × 0.216\n= 20 × 0.013824\n= 0.27648 ≈ 27.65%\nThere is approximately a 27.65% probability that exactly 3 of the 6 components function correctly.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `An electronic device has 6 independent components, each with a 40% probability of functioning correctly. Find P(X = 3) — the probability that exactly 3 components work. Use the binomial formula and show all steps.`,
    solutionSteps: `Conditions: n=6 (fixed), binary (works/fails), independent, constant p=0.40.\nP(X=3) = C(6,3) × (0.40)^3 × (0.60)^3 = 20 × 0.064 × 0.216 = 0.2765`,
    studentWork: e.work,
  }, e.score))),

  // ── Sampling distribution / CLT probability ─────────────────────────────
  ...([
    { score: 2, work: `SE = 15/√36 = 2.5. z = (72-70)/15 = 0.133. P = 0.45. That seems wrong. P(x̄>72) = 1 - 0.553 = 0.447.` },
    { score: 6, work: `SE = σ/√n = 15/√36 = 2.5. z = (72-70)/2.5 = 0.80. P(x̄>72) = 1 - P(z<0.80) = 1 - 0.7881 = 0.2119. About 21.2%.` },
    { score: 9, work: `Population: μ=70, σ=15. Sample size n=36.\nStep 1 — Sampling distribution of x̄: by CLT (n=36≥30), x̄ ~ N(μ=70, SE=σ/√n=15/√36=2.5)\nStep 2 — Standardize: z = (x̄ − μ)/SE = (72 − 70)/2.5 = 2/2.5 = 0.80\nStep 3 — P(x̄ > 72) = P(z > 0.80) = 1 − Φ(0.80) = 1 − 0.7881 = 0.2119\nThere is approximately a 21.2% probability that a random sample of 36 students has a mean score above 72.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Scores are normally distributed with μ = 70, σ = 15. A random sample of n = 36 is taken. Find P(x̄ > 72). Show all steps using the sampling distribution of x̄.`,
    solutionSteps: `Step 1: SE = σ/√n = 15/√36 = 2.5\nStep 2: z = (72 − 70)/2.5 = 0.80\nStep 3: P(x̄ > 72) = 1 − Φ(0.80) = 1 − 0.7881 = 0.2119`,
    studentWork: e.work,
  }, e.score))),

  // ── CI for proportion ───────────────────────────────────────────────────
  ...([
    { score: 2, work: `p̂ = 45/150 = 0.30. SE = √(0.30×0.70/150) = 0.0374. Margin = 1.96 × 0.0374 = 0.0733. CI = (0.227, 0.373).` },
    { score: 6, work: `p̂ = 45/150 = 0.30. Check: np̂=45≥10, n(1-p̂)=105≥10. SE = √(0.30×0.70/150) = √0.0014 = 0.03742. ME = 1.96×0.03742 = 0.0733. CI: (0.30-0.073, 0.30+0.073) = (0.227, 0.373). We are 95% confident the true proportion is between 22.7% and 37.3%.` },
    { score: 9, work: `p̂ = 45/150 = 0.30\nConditions: random sample ✓; np̂ = 45 ≥ 10 ✓; n(1−p̂) = 105 ≥ 10 ✓; 150 < 10% of population ✓\nSE = √(p̂(1−p̂)/n) = √(0.30 × 0.70 / 150) = √(0.0014) = 0.03742\nMargin of error = z* × SE = 1.96 × 0.03742 = 0.07334\nCI: p̂ ± ME = 0.30 ± 0.073 = (0.227, 0.373)\nInterpretation: We are 95% confident that the true proportion of defective items is between 22.7% and 37.3%.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A quality inspector samples 150 items and finds 45 defective. Construct a 95% confidence interval for the true proportion of defective items. Check conditions and show all steps.`,
    solutionSteps: `Step 1: p̂ = 45/150 = 0.30; check np̂=45≥10, n(1−p̂)=105≥10 ✓\nStep 2: SE = √(0.30×0.70/150) = 0.03742\nStep 3: ME = 1.96 × 0.03742 = 0.0733\nStep 4: CI = (0.227, 0.373)`,
    studentWork: e.work,
  }, e.score))),

  // ── One-sample t-test ───────────────────────────────────────────────────
  ...([
    { score: 2, work: `t = (22-20)/(4/√25) = 2/0.8 = 2.5. df = 25. Critical value ≈ 2.06. Since 2.5 > 2.06, reject H₀.` },
    { score: 6, work: `H₀: μ=20, H₁: μ≠20. t = (22-20)/(4/√25) = 2/0.8 = 2.5. df = 24. t*(24, 0.025) ≈ 2.064. Since 2.5>2.064 reject H₀. Evidence the mean differs from 20.` },
    { score: 9, work: `H₀: μ = 20 min; H₁: μ ≠ 20 min (two-tailed)\nGiven: x̄=22, s=4, n=25\nStep 1 — SE: SE = s/√n = 4/√25 = 4/5 = 0.80\nStep 2 — t: t = (x̄ − μ₀)/SE = (22 − 20)/0.80 = 2.00/0.80 = 2.50\nStep 3 — df = n−1 = 24\nStep 4 — Critical value: t*(24, α/2=0.025) ≈ 2.064\nSince |t| = 2.50 > 2.064 → Reject H₀\nConclusion: At α=0.05 two-tailed, there is sufficient evidence that the true mean wait time differs from 20 minutes. The sample mean of 22 minutes is significantly above the hypothesized 20.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A sample of n=25 observations yields x̄=22, s=4. Test H₀: μ=20 vs. H₁: μ≠20 at α=0.05. Show all steps.`,
    solutionSteps: `Step 1: SE = s/√n = 4/√25 = 0.80\nStep 2: t = (22−20)/0.80 = 2.50\nStep 3: df = 24\nStep 4: t*(24, 0.025) ≈ 2.064; |2.50| > 2.064 → Reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Two-sample t-test ───────────────────────────────────────────────────
  ...([
    { score: 2, work: `Difference = 85-80 = 5. SE = √(10²/30 + 12²/30) = √(3.33+4.8) = √8.13 = 2.85. t = 5/2.85 = 1.75. df = 30. t* ≈ 2.04. Fail to reject.` },
    { score: 6, work: `t = (85-80)/√(10²/30+12²/30) = 5/√(3.33+4.80) = 5/√8.13 = 5/2.851 = 1.754. df = min(29,29) = 29. t*(29, 0.025) ≈ 2.045. Since 1.754 < 2.045 fail to reject H₀. No significant difference.` },
    { score: 9, work: `H₀: μ₁=μ₂; H₁: μ₁≠μ₂ (two-tailed)\nGiven: x̄₁=85, s₁=10, n₁=30; x̄₂=80, s₂=12, n₂=30\nStep 1 — SE:\nSE = √(s₁²/n₁ + s₂²/n₂) = √(100/30 + 144/30) = √(3.333+4.800) = √8.133 ≈ 2.852\nStep 2 — t:\nt = (x̄₁−x̄₂)/SE = (85−80)/2.852 = 5/2.852 ≈ 1.753\nStep 3 — df (conservative): min(n₁−1, n₂−1) = min(29,29) = 29\nStep 4 — Critical value: t*(29, 0.025) ≈ 2.045\nSince |t| = 1.753 < 2.045 → Fail to reject H₀\nConclusion: At α=0.05, there is insufficient evidence of a significant difference in mean scores between the two groups.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Group 1: n=30, x̄=85, s=10. Group 2: n=30, x̄=80, s=12. Test H₀: μ₁=μ₂ vs. H₁: μ₁≠μ₂ at α=0.05. Show all steps.`,
    solutionSteps: `Step 1: SE = √(10²/30 + 12²/30) = √(3.333+4.800) = √8.133 ≈ 2.852\nStep 2: t = (85−80)/2.852 ≈ 1.753\nStep 3: df = min(29,29) = 29\nStep 4: t*(29, 0.025) ≈ 2.045; 1.753 < 2.045 → Fail to reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Paired t-test ───────────────────────────────────────────────────────
  ...([
    { score: 2, work: `d̄ = 4.5, s_d = 3.2, n = 12. t = 4.5/3.2 = 1.406. df = 12. t* ≈ 1.796. Fail to reject H₀.` },
    { score: 6, work: `t = d̄/(s_d/√n) = 4.5/(3.2/√12) = 4.5/0.9238 = 4.872. df = 11. t*(11, 0.05 one-tail) ≈ 1.796. Since 4.872>1.796 reject H₀. Training significantly improved scores.` },
    { score: 9, work: `Paired t-test on differences (post − pre). d̄ = 4.5, s_d = 3.2, n = 12.\nH₀: μ_d = 0; H₁: μ_d > 0 (one-tailed — we expect improvement)\nStep 1 — SE: SE = s_d/√n = 3.2/√12 = 3.2/3.4641 = 0.9238\nStep 2 — t: t = d̄/SE = 4.5/0.9238 = 4.872\nStep 3 — df = n−1 = 11\nStep 4 — Critical value: t*(11, α=0.05, one-tail) ≈ 1.796\nSince 4.872 >> 1.796 → Reject H₀\nConclusion: Strong evidence (t=4.87, p<<0.05) that the training program significantly improved scores. Average gain of 4.5 points is statistically significant.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `12 students took a training program. Differences (post − pre) have d̄ = 4.5 and s_d = 3.2. Test H₀: μ_d = 0 vs. H₁: μ_d > 0 at α = 0.05 using a paired t-test. Show all steps.`,
    solutionSteps: `Step 1: SE = s_d/√n = 3.2/√12 ≈ 0.9238\nStep 2: t = 4.5/0.9238 ≈ 4.872\nStep 3: df = 11\nStep 4: t*(11, one-tail α=0.05) ≈ 1.796; 4.872 > 1.796 → Reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Linear regression — slope, prediction, residual ────────────────────
  ...([
    { score: 2, work: `ŷ = 30 + 2.5(10) = 30 + 25 = 55. Residual = 60 - 55 = 5. The slope means that for each unit increase in x, y increases by 2.5.` },
    { score: 6, work: `ŷ = 30 + 2.5(10) = 55. Residual = y − ŷ = 60 − 55 = 5 (positive: student scored above prediction). Slope 2.5 means for each additional hour studied, predicted score increases by 2.5 points on average.` },
    { score: 9, work: `Regression line: ŷ = 30 + 2.5x\nStep 1 — Prediction at x=10:\nŷ = 30 + 2.5(10) = 30 + 25 = 55 points\nStep 2 — Residual:\nresidual = y − ŷ = 60 − 55 = +5\nPositive residual: this student scored 5 points above what the model predicted for someone who studied 10 hours.\nStep 3 — Slope interpretation:\nFor each additional hour studied, the predicted exam score increases by 2.5 points on average. The positive slope confirms a positive linear association between study hours and exam scores.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A regression line for predicting exam score (y) from study hours (x) is ŷ = 30 + 2.5x. A student studies 10 hours and earns a score of 60. Calculate the predicted score, the residual, and interpret the slope.`,
    solutionSteps: `Step 1: Predicted: ŷ = 30 + 2.5(10) = 55\nStep 2: Residual = y − ŷ = 60 − 55 = +5 (student performed 5 points above prediction)\nStep 3: Slope = 2.5: for each additional study hour, predicted score increases 2.5 points on average`,
    studentWork: e.work,
  }, e.score))),

  // ── Sample standard deviation ───────────────────────────────────────────
  ...([
    { score: 2, work: `Mean = (4+7+5+8+6)/5 = 30/5 = 6. Deviations: -2, 1, -1, 2, 0. Squared: 4, 1, 1, 4, 0. Sum = 10. s² = 10/5 = 2. s = √2 ≈ 1.41.` },
    { score: 6, work: `Mean = 6. Deviations: -2, 1, -1, 2, 0. Squared deviations: 4, 1, 1, 4, 0. Sum = 10. s² = 10/(5-1) = 2.5. s = √2.5 ≈ 1.58.` },
    { score: 9, work: `Data: 4, 7, 5, 8, 6. n = 5.\nStep 1 — Mean: x̄ = (4+7+5+8+6)/5 = 30/5 = 6\nStep 2 — Deviations from mean: (4−6)=−2, (7−6)=1, (5−6)=−1, (8−6)=2, (6−6)=0\nStep 3 — Squared deviations: 4, 1, 1, 4, 0. Sum = 10\nStep 4 — Sample variance: s² = Σ(xᵢ−x̄)²/(n−1) = 10/(5−1) = 10/4 = 2.5\nNote: divide by n−1=4 (not n=5) for the sample variance (Bessel's correction).\nStep 5 — Sample standard deviation: s = √2.5 ≈ 1.581\nThe average distance of data points from the mean is about 1.58 units.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Calculate the sample standard deviation for the dataset: 4, 7, 5, 8, 6. Show all steps including the mean, deviations, and the correct divisor.`,
    solutionSteps: `Step 1: x̄ = (4+7+5+8+6)/5 = 6\nStep 2: Deviations: −2, 1, −1, 2, 0. Squared: 4, 1, 1, 4, 0. Sum = 10\nStep 3: s² = 10/(n−1) = 10/4 = 2.5 (divide by n−1, not n)\nStep 4: s = √2.5 ≈ 1.581`,
    studentWork: e.work,
  }, e.score))),

  // ── ANOVA F-statistic (given SS and df) ────────────────────────────────
  ...([
    { score: 2, work: `F = SSB/SSW = 120/180 = 0.667. Not significant.` },
    { score: 6, work: `MSG = SSB/df_B = 120/2 = 60. MSE = SSW/df_W = 180/27 = 6.667. F = 60/6.667 = 9.0. df = (2, 27). F*(2,27, 0.05) ≈ 3.35. Since 9.0 > 3.35, reject H₀. Significant difference among group means.` },
    { score: 9, work: `Given: k=3 groups, n=30 total. SSB=120 (between groups), SSW=180 (within groups).\nStep 1 — Degrees of freedom:\ndf_between = k−1 = 3−1 = 2\ndf_within = n−k = 30−3 = 27\nStep 2 — Mean squares:\nMSG = SSB/df_between = 120/2 = 60.0\nMSE = SSW/df_within = 180/27 ≈ 6.667\nStep 3 — F-statistic:\nF = MSG/MSE = 60.0/6.667 = 9.00\nStep 4 — Decision: F*(2, 27, α=0.05) ≈ 3.35. Since 9.00 > 3.35 → Reject H₀.\nConclusion: At α=0.05, there is significant evidence that at least one group mean differs from the others.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A one-way ANOVA has k=3 groups, total n=30. SSB (between groups) = 120; SSW (within groups) = 180. Calculate the F-statistic and test at α = 0.05 whether any group means differ. Show all steps.`,
    solutionSteps: `Step 1: df_between = k−1 = 2; df_within = n−k = 27\nStep 2: MSG = 120/2 = 60; MSE = 180/27 ≈ 6.667\nStep 3: F = MSG/MSE = 60/6.667 = 9.00\nStep 4: F*(2,27,0.05) ≈ 3.35; 9.00 > 3.35 → Reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Regression slope t-test: t = b₁/SE(b₁) ────────────────────────────
  ...([
    { score: 2, work: `t = 1.8/0.6 = 3.0. df = 28. Significant because t > 2.` },
    { score: 6, work: `H₀: β₁=0; H₁: β₁≠0. t = b₁/SE(b₁) = 1.8/0.6 = 3.0. df = n-2 = 28. t*(28, 0.025) ≈ 2.048. Since 3.0 > 2.048 reject H₀. Slope is significantly different from zero.` },
    { score: 9, work: `H₀: β₁ = 0 (no linear relationship); H₁: β₁ ≠ 0 (two-tailed)\nGiven: b₁ = 1.8, SE(b₁) = 0.6, n = 30\nStep 1 — t-statistic: t = b₁/SE(b₁) = 1.8/0.6 = 3.00\nStep 2 — df = n−2 = 30−2 = 28\nStep 3 — Critical value: t*(28, 0.025) ≈ 2.048\nSince |t| = 3.00 > 2.048 → Reject H₀\nConclusion: There is statistically significant evidence (t=3.00, p<0.05) of a linear relationship between the predictor and response. The slope b₁=1.8 is significantly different from zero.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A simple linear regression is fit with n=30 observations. The estimated slope is b₁ = 1.8 with SE(b₁) = 0.6. Test H₀: β₁ = 0 vs. H₁: β₁ ≠ 0 at α = 0.05. Show all steps.`,
    solutionSteps: `Step 1: t = b₁/SE(b₁) = 1.8/0.6 = 3.00\nStep 2: df = n−2 = 28\nStep 3: t*(28, 0.025) ≈ 2.048; |3.00| > 2.048 → Reject H₀`,
    studentWork: e.work,
  }, e.score))),

  // ── Geometric probability P(X=k) ───────────────────────────────────────
  ...([
    { score: 2, work: `P(X=4) = 0.30^4 = 0.0081. About 0.81%.` },
    { score: 6, work: `P(X=k) = (1-p)^(k-1) × p. P(X=4) = (0.70)^3 × 0.30 = 0.343 × 0.30 = 0.1029. About 10.3%.` },
    { score: 9, work: `X = number of calls until first sale. X ~ Geometric with p=0.30.\nP(X = k) = (1−p)^(k−1) × p\nP(X = 4) = (1 − 0.30)^(4−1) × 0.30\n= (0.70)^3 × 0.30\n= 0.343 × 0.30\n= 0.1029 ≈ 10.29%\nThere is approximately a 10.3% probability that the salesperson makes their first sale on the 4th call (three failures followed by one success).` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A salesperson makes a sale on any given call with probability 0.30. Let X = number of calls until the first sale. Calculate P(X = 4). Show the geometric formula and all steps.`,
    solutionSteps: `P(X=k) = (1−p)^(k−1) × p\nP(X=4) = (0.70)^3 × 0.30 = 0.343 × 0.30 = 0.1029`,
    studentWork: e.work,
  }, e.score))),

  // ── Normal approximation to binomial ───────────────────────────────────
  ...([
    { score: 2, work: `np=200×0.40=80, nq=120. Conditions met. μ=80, σ=√48≈6.93. z=(75-80)/6.93=-0.72. P(X<75)=0.236.` },
    { score: 6, work: `np=80≥10, nq=120≥10. μ=80, σ=√(200×0.4×0.6)=√48≈6.928. With continuity correction: P(X≤75)≈P(Y≤75.5). z=(75.5-80)/6.928=-0.649. P(z<-0.649)≈0.258. About 25.8%.` },
    { score: 9, work: `X ~ Binomial(n=200, p=0.40).\nStep 1 — Conditions: np=80≥10 ✓; n(1−p)=120≥10 ✓. Normal approximation valid.\nStep 2 — Parameters: μ=np=80; σ=√(np(1−p))=√(200×0.4×0.6)=√48≈6.928\nStep 3 — Continuity correction: P(X≤75) ≈ P(Y≤75.5) where Y~N(80, 6.928)\nStep 4 — z: z=(75.5−80)/6.928=−4.5/6.928≈−0.650\nStep 5 — Probability: P(z<−0.650)≈0.2578\nThere is approximately a 25.8% probability that 75 or fewer customers choose the discount offer.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `200 customers each independently choose a discount offer with probability 0.40. Find P(X ≤ 75) using the normal approximation to the binomial, with continuity correction. Show all steps.`,
    solutionSteps: `Step 1: np=80≥10, nq=120≥10 → normal approx valid\nStep 2: μ=80, σ=√48≈6.928\nStep 3: Continuity correction: P(X≤75)≈P(Y≤75.5)\nStep 4: z=(75.5−80)/6.928≈−0.650\nStep 5: P(z<−0.650)≈0.258`,
    studentWork: e.work,
  }, e.score))),

  // ── Random variables E[X] and Var[X] ───────────────────────────────────
  ...([
    { score: 2, work: `E[X] = 1(0.2)+2(0.5)+3(0.3) = 0.2+1.0+0.9 = 2.1. Var = average of squared values minus mean squared. = (1²+2²+3²)/3 - 2.1² = (1+4+9)/3 - 4.41 = 4.67-4.41 = 0.26.` },
    { score: 6, work: `E[X] = 1(0.2)+2(0.5)+3(0.3) = 0.2+1.0+0.9 = 2.1. Var(X) = (1-2.1)²(0.2)+(2-2.1)²(0.5)+(3-2.1)²(0.3) = 1.21(0.2)+0.01(0.5)+0.81(0.3) = 0.242+0.005+0.243 = 0.49. SD=√0.49=0.70.` },
    { score: 9, work: `Probability distribution: P(X=1)=0.2, P(X=2)=0.5, P(X=3)=0.3. Check: 0.2+0.5+0.3=1.0 ✓\nStep 1 — E[X] = Σ x·P(x):\n= 1(0.20) + 2(0.50) + 3(0.30) = 0.20+1.00+0.90 = 2.10\nStep 2 — Var(X) = Σ (x−μ)²·P(x):\n= (1−2.1)²(0.20) + (2−2.1)²(0.50) + (3−2.1)²(0.30)\n= (1.21)(0.20) + (0.01)(0.50) + (0.81)(0.30)\n= 0.242 + 0.005 + 0.243 = 0.490\nStep 3 — SD(X) = √Var(X) = √0.490 ≈ 0.700\nInterpretation: On average, the random variable takes a value of 2.10. The standard deviation of 0.70 describes the typical spread of outcomes around that mean.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `A discrete random variable X has: P(X=1)=0.20, P(X=2)=0.50, P(X=3)=0.30. Calculate E[X], Var(X), and SD(X). Show all steps using the formulas.`,
    solutionSteps: `Step 1: E[X] = 1(0.20)+2(0.50)+3(0.30) = 0.20+1.00+0.90 = 2.10\nStep 2: Var(X) = (1−2.1)²(0.20)+(2−2.1)²(0.50)+(3−2.1)²(0.30) = 0.242+0.005+0.243 = 0.490\nStep 3: SD(X) = √0.490 ≈ 0.700`,
    studentWork: e.work,
  }, e.score))),

  // ── Basic probability rules ─────────────────────────────────────────────
  ...([
    { score: 2, work: `P(A or B) = P(A)+P(B) = 0.4+0.3 = 0.7. P(A and B) = 0.4×0.3 = 0.12. P(not A) = 1-0.4 = 0.6.` },
    { score: 6, work: `Events are independent. P(A or B) = P(A)+P(B)-P(A and B) = 0.4+0.3-0.12 = 0.58. P(A and B) = P(A)×P(B) = 0.4×0.3 = 0.12. P(not A) = 1-0.4 = 0.60.` },
    { score: 9, work: `Given: P(A)=0.40, P(B)=0.30, A and B independent.\nPart 1 — P(A or B) [Addition Rule]:\nP(A ∪ B) = P(A)+P(B)−P(A∩B) = P(A)+P(B)−P(A)·P(B) [since independent]\n= 0.40+0.30−(0.40)(0.30) = 0.70−0.12 = 0.58\nPart 2 — P(A and B) [Multiplication Rule for independent events]:\nP(A∩B) = P(A)·P(B) = 0.40×0.30 = 0.12\nPart 3 — P(not A) [Complement Rule]:\nP(Aᶜ) = 1−P(A) = 1−0.40 = 0.60\nSummary: P(A or B)=0.58, P(A and B)=0.12, P(not A)=0.60.` },
  ].map(e => makeCalcEntry({
    essayPrompt: `Events A and B are independent with P(A)=0.40 and P(B)=0.30. Calculate: (1) P(A or B), (2) P(A and B), (3) P(not A). Name the rule used for each. Show all steps.`,
    solutionSteps: `Step 1: P(A∩B) = P(A)×P(B) = 0.40×0.30 = 0.12 [multiplication rule, independent]\nStep 2: P(A∪B) = P(A)+P(B)−P(A∩B) = 0.40+0.30−0.12 = 0.58 [addition rule]\nStep 3: P(Aᶜ) = 1−P(A) = 1−0.40 = 0.60 [complement rule]`,
    studentWork: e.work,
  }, e.score))),

];

console.log(`Step 4d: ${calcEntries.length} calculation-style entries created`);

// ── STEP 4e: Score gap entries — score 0 (blank), 4, and 5 ───────────────────
// Score 0 = blank/no submission (distinct from score 1 = off-topic)
// Score 4 = basic familiarity, misses most key criteria
// Score 5 = partial understanding, covers some key points

const gapEntries = [

  // ── Score 0: blank / no submission ─────────────────────────────────────
  makeEntry({
    essayPrompt: `A professor claims her students study an average of μ₀ = 20 hours per week. A random sample of 16 students reports x̄ = 17.5 hours, s = 4.2 hours. Conduct a two-tailed t-test at α = 0.05. State hypotheses, calculate t, state df, and write a conclusion.`,
    checklistItems: [
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ=20; H₁: μ≠20'] },
      { category: 'Test Statistic (4 pts)', points: 4, items: ['t=(17.5−20)/(4.2/√16)≈−2.38; df=15'] },
      { category: 'Conclusion (4 pts)', points: 4, items: ['|t|=2.38>t*(15)≈2.131 → reject H₀'] },
    ],
    modelText: '',
    studentWork: ``,
  }, 0),

  makeEntry({
    essayPrompt: `A researcher surveys 300 college students and records their exercise frequency (Regular / Occasional / None) and self-reported health status (Good / Poor). Explain how to conduct a chi-square test of independence. State hypotheses, calculate df, explain expected counts, and describe what a significant result means.`,
    checklistItems: [
      { category: 'Hypotheses (3 pts)', points: 3, items: ['H₀: Independence; H₁: Association'] },
      { category: 'df (3 pts)', points: 3, items: ['df=(3−1)(2−1)=2'] },
      { category: 'Expected Counts and Result (4 pts)', points: 4, items: ['E=(row×col)/n; significant → association'] },
    ],
    modelText: '',
    studentWork: `I don't know how to answer this question.`,
  }, 0),

  makeCalcEntry({
    essayPrompt: `Exam scores are normally distributed with mean μ = 70 and standard deviation σ = 8. Find P(X > 78). Show all steps.`,
    solutionSteps: `Step 1: z=(78−70)/8=1.00\nStep 2: Φ(1.00)=0.8413\nStep 3: P(X>78)=1−0.8413=0.1587`,
    studentWork: ``,
  }, 0),

  // ── Score 4: basic familiarity, misses most key criteria ───────────────
  makeEntry({
    essayPrompt: `Researchers want to test whether a new study app improves exam scores. They allow students to choose whether or not to use the app, then compare final exam scores. Identify whether this is an experiment or an observational study and explain why. Identify at least one confounding variable. Explain how random assignment would improve the study.`,
    checklistItems: [
      { category: 'Study Type (3 pts)', points: 3, items: ['Observational (students self-select, no random assignment)', 'Explains what distinguishes experiment from observational study'] },
      { category: 'Confounding Variable (3 pts)', points: 3, items: ['Names plausible confounder', 'Explains how it affects both app use and exam scores'] },
      { category: 'Random Assignment (4 pts)', points: 4, items: ['Turns this into an experiment', 'Distributes confounders evenly so difference can be attributed to app'] },
    ],
    modelText: '',
    studentWork: `This is an observational study because the researchers are not controlling who uses the app — students choose on their own. A confounding variable could be how hardworking the students are, because hardworking students might both use the app more and also study harder. Random assignment would be better because if you randomly pick who uses the app it would be more fair and the results would be more trustworthy.`,
  }, 4),

  makeEntry({
    essayPrompt: `A professor claims students study an average of 20 hours per week. A sample of n=16 yields x̄=17.5, s=4.2. Conduct a two-tailed t-test at α=0.05. State hypotheses, calculate the test statistic, state df, and write a conclusion.`,
    checklistItems: [
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ=20; H₁: μ≠20 (two-tailed)'] },
      { category: 'Test Statistic (4 pts)', points: 4, items: ['t=(17.5−20)/(4.2/√16)=−2.5/1.05≈−2.38; uses t, not z; SE=s/√n'] },
      { category: 'df and Conclusion (4 pts)', points: 4, items: ['df=n−1=15; |t|=2.38>t*(15)≈2.131 → reject H₀'] },
    ],
    modelText: '',
    studentWork: `H₀: μ = 20 hours; H₁: μ ≠ 20 hours. We use a z-test to compare the sample mean to the claimed value. z = (17.5 − 20)/4.2 = −2.5/4.2 = −0.595. Since −0.595 is between −1.96 and 1.96 we fail to reject the null hypothesis. There is not enough evidence that the mean study time differs from 20 hours.`,
  }, 4),

  makeEntry({
    essayPrompt: `A poll of 200 voters finds 118 support Candidate A. Construct a 95% confidence interval for the true proportion. Check conditions, show work, and write a correct interpretation.`,
    checklistItems: [
      { category: 'Conditions (2 pts)', points: 2, items: ['np̂=118≥10, n(1−p̂)=82≥10, random, independence'] },
      { category: 'Calculation (4 pts)', points: 4, items: ['p̂=0.59; SE=√(0.59×0.41/200)≈0.0348; CI=0.59±1.96(0.0348)=(0.522,0.658)'] },
      { category: 'Interpretation (4 pts)', points: 4, items: ['"95% confident" not probability; true population proportion in context'] },
    ],
    modelText: '',
    studentWork: `Conditions: np̂ = 118 ≥ 10 and n(1−p̂) = 82 ≥ 10. p̂ = 118/200 = 0.59. SE = 0.59 × 0.41 / 200 = 0.001209. Margin of error = 1.96 × 0.001209 = 0.00237. CI = 0.59 ± 0.00237 = (0.588, 0.592). We are 95% confident the true proportion is between 58.8% and 59.2%.`,
  }, 4),

  makeCalcEntry({
    essayPrompt: `60 people tasted 4 ice cream flavors. Observed: Vanilla=12, Chocolate=18, Strawberry=14, Mint=16. Test whether flavors are equally preferred using a chi-square GOF test at α=0.05.`,
    solutionSteps: `Step 1: Expected=60/4=15 each\nStep 2: χ²=(12−15)²/15+(18−15)²/15+(14−15)²/15+(16−15)²/15=1.333\nStep 3: df=k−1=3\nStep 4: χ²*(3,0.05)=7.815; 1.333<7.815 → Fail to reject H₀`,
    studentWork: `Expected = 60/4 = 15 each. χ² = (12−15)²/15 + (18−15)²/15 + (14−15)²/15 + (16−15)²/15 = 9/15 + 9/15 + 1/15 + 1/15 = 1.333. df = 4 (number of categories). Critical value χ²(4, 0.05) = 9.488. Since 1.333 < 9.488 fail to reject H₀. The flavors are equally preferred.`,
  }, 4),

  makeCalcEntry({
    essayPrompt: `A discrete random variable X has: P(X=1)=0.20, P(X=2)=0.50, P(X=3)=0.30. Calculate E[X], Var(X), and SD(X). Show all steps.`,
    solutionSteps: `Step 1: E[X]=1(0.20)+2(0.50)+3(0.30)=2.10\nStep 2: Var(X)=(1−2.1)²(0.20)+(2−2.1)²(0.50)+(3−2.1)²(0.30)=0.490\nStep 3: SD(X)=√0.490≈0.700`,
    studentWork: `E[X] = (1 + 2 + 3)/3 = 2.0 since there are three outcomes I take the simple average. Var(X) = E[X²] − (E[X])² = (1² + 2² + 3²)/3 − 4 = 14/3 − 4 = 4.667 − 4 = 0.667. SD = √0.667 ≈ 0.816.`,
  }, 4),

  // ── Score 5: partial understanding, covers some key points ─────────────
  makeEntry({
    essayPrompt: `A statistics instructor fits ŷ = 52 + 4.3x for exam score (y) vs. hours studied (x), R²=0.61. Interpret the slope and intercept. Interpret R². Predict for x=8. Discuss one limitation.`,
    checklistItems: [
      { category: 'Slope (3 pts)', points: 3, items: ['4.3 points per additional hour, on average; uses "predicted" language'] },
      { category: 'Intercept and R² (3 pts)', points: 3, items: ['52 = predicted score for 0 hrs studied; R²=0.61: 61% of variability in scores explained'] },
      { category: 'Prediction and Limitation (4 pts)', points: 4, items: ['ŷ=86.4; meaningful limitation (causation, lurking variables, extrapolation)'] },
    ],
    modelText: '',
    studentWork: `The slope is 4.3, which means for each additional hour studied the predicted exam score increases by 4.3 points on average. The intercept is 52, meaning a student who studies 0 hours would be predicted to score 52. The R² of 0.61 means the regression model is 61% accurate — it correctly predicts 61% of the outcomes. Prediction: ŷ = 52 + 4.3(8) = 86.4. One limitation is that correlation does not imply causation — just because studying more is correlated with higher scores doesn't mean studying is the direct cause.`,
  }, 5),

  makeEntry({
    essayPrompt: `A basketball player makes 70% of free throws and takes 8. Calculate P(X=5) using the binomial formula. Verify all four conditions. Interpret the result.`,
    checklistItems: [
      { category: 'Conditions (3 pts)', points: 3, items: ['Fixed n=8, binary, independent, constant p=0.70'] },
      { category: 'Calculation (4 pts)', points: 4, items: ['P(X=5)=C(8,5)×(0.70)⁵×(0.30)³≈0.254'] },
      { category: 'Interpretation (3 pts)', points: 3, items: ['About 25.4%; contextual interpretation'] },
    ],
    modelText: '',
    studentWork: `Conditions: (1) Fixed n=8. (2) Binary: make or miss. (3) Independent trials. (4) Constant p=0.70. All four conditions are met. P(X=5) = C(8,5)(0.70)^5(0.30)^3 = 56 × 0.16807 × 0.027 = 56 × 0.004538 ≈ 0.254. There is about a 25% chance she makes exactly 5 of the 8 free throws. Since the expected number of makes is 8(0.70)=5.6, getting exactly 5 is close to expected and is one of the more likely single outcomes.`,
  }, 5),

  makeEntry({
    essayPrompt: `Compare exam scores: Group A (n=20, x̄=78, s=8) vs. Group B (n=25, x̄=72, s=10). Test H₀: μ_A=μ_B vs. H₁: μ_A>μ_B at α=0.05. State hypotheses, verify conditions, calculate t, state df, and conclude.`,
    checklistItems: [
      { category: 'Hypotheses (2 pts)', points: 2, items: ['H₀: μ_A=μ_B; H₁: μ_A>μ_B (one-tailed)'] },
      { category: 'Conditions (2 pts)', points: 2, items: ['Independent random samples; adequate sample sizes'] },
      { category: 'Test Statistic and df (4 pts)', points: 4, items: ['t=6/√(64/20+100/25)=6/√7.2≈2.24; df=min(19,24)=19 (conservative)'] },
      { category: 'Conclusion (2 pts)', points: 2, items: ['2.24>t*(19,one-tail)≈1.729 → reject H₀'] },
    ],
    modelText: '',
    studentWork: `H₀: μ_A = μ_B; H₁: μ_A > μ_B. Both samples are independent. t = (78−72)/√(8²/20+10²/25) = 6/√(3.2+4.0) = 6/√7.2 = 6/2.683 ≈ 2.24. Using df = n_A + n_B − 2 = 43, the critical value at α=0.05 one-tailed is approximately 1.681. Since 2.24 > 1.681 we reject H₀ and conclude tutoring students scored significantly higher on average.`,
  }, 5),

  makeCalcEntry({
    essayPrompt: `Scores are normally distributed with μ=70, σ=15. A sample of n=36. Find P(x̄ > 72). Show all steps using the sampling distribution of x̄.`,
    solutionSteps: `Step 1: SE=σ/√n=15/√36=2.5\nStep 2: z=(72−70)/2.5=0.80\nStep 3: P(x̄>72)=1−Φ(0.80)=0.2119`,
    studentWork: `Sampling distribution of x̄ is normal by CLT. Mean = μ = 70. SE = 15/√36 = 2.5. To standardize: z = (72−70)/15 = 0.133. P(z > 0.133) = 1 − 0.5529 = 0.447. About 44.7%.`,
  }, 5),

  makeCalcEntry({
    essayPrompt: `A quality inspector samples 150 items and finds 45 defective. Construct a 95% CI for the true proportion. Check conditions, show all steps.`,
    solutionSteps: `Step 1: p̂=0.30; np̂=45≥10, n(1−p̂)=105≥10 ✓\nStep 2: SE=√(0.30×0.70/150)=0.03742\nStep 3: ME=1.96×0.03742=0.0733\nStep 4: CI=(0.227,0.373)`,
    studentWork: `p̂ = 45/150 = 0.30. Conditions: np̂=45≥10 ✓, n(1−p̂)=105≥10 ✓. SE = √(0.30×0.70/150) = √0.0014 = 0.03742. For 95% CI, z* = 1.645. ME = 1.645×0.03742 = 0.0616. CI = (0.30−0.062, 0.30+0.062) = (0.238, 0.362). We are 95% confident the true proportion is between 23.8% and 36.2%.`,
  }, 5),

];

console.log(`Step 4e: ${gapEntries.length} score gap entries created (0 × 3, 4 × 5, 5 × 5)`);

// ── STEP 4f: Score 10 entries for calc, narrative, and holistic formats ───────
// Score 10 = comprehensive, precise, and clearly communicated.
// Distinct from score 9 by: explicit assumption verification, intermediate
// interpretation, sanity checks, and precise statistical language throughout.

const score10Entries = [

  // ── Score 10 in calc format ─────────────────────────────────────────────
  makeCalcEntry({
    essayPrompt: `Exam scores are normally distributed with mean μ = 70 and standard deviation σ = 8. Find P(X > 78). Show all steps.`,
    solutionSteps: `Step 1: z=(78−70)/8=1.00\nStep 2: Φ(1.00)=0.8413\nStep 3: P(X>78)=1−0.8413=0.1587`,
    studentWork: `Given: X ~ N(μ=70, σ=8). Find P(X > 78).
Assumptions: Population is stated normal; σ known — standard normal table applies directly.

Step 1 — Standardize:
z = (x − μ)/σ = (78 − 70)/8 = 8/8 = 1.00
Interpretation: 78 is exactly 1 standard deviation above the mean.

Step 2 — Standard normal table:
Φ(1.00) = P(Z < 1.00) = 0.8413

Step 3 — Complement:
P(X > 78) = 1 − 0.8413 = 0.1587

Answer: Approximately 15.87% of scores exceed 78 points.

Sanity check: Empirical rule — about 68% of values fall within 1 SD of the mean (between 62 and 78), leaving ~16% above 78 and ~16% below 62. Our answer of 15.87% is consistent. ✓`,
  }, 10),

  makeCalcEntry({
    essayPrompt: `A poll surveys 100 voters; 54 support Proposition A. Test H₀: p = 0.50 vs. H₁: p > 0.50 at α = 0.05. Show all steps.`,
    solutionSteps: `Step 1: p̂=54/100=0.54\nStep 2: SE₀=√(0.50×0.50/100)=0.05\nStep 3: z=(0.54−0.50)/0.05=0.80\nStep 4: p-value=P(z>0.80)=0.2119\nStep 5: 0.212>0.05 → Fail to reject H₀`,
    studentWork: `H₀: p = 0.50; H₁: p > 0.50 (one-tailed)

Conditions:
• Random sample: stated ✓
• np₀ = 100(0.50) = 50 ≥ 10 ✓
• n(1−p₀) = 100(0.50) = 50 ≥ 10 ✓
• 100 voters < 10% of voting population ✓

Step 1 — Sample proportion:
p̂ = 54/100 = 0.54

Step 2 — SE under H₀ (use p₀, not p̂):
SE₀ = √(p₀(1−p₀)/n) = √(0.50×0.50/100) = √0.0025 = 0.050
Note: we use p₀ = 0.50 here, not p̂ = 0.54, because we standardize assuming H₀ is true.

Step 3 — z-statistic:
z = (p̂ − p₀)/SE₀ = (0.54 − 0.50)/0.050 = 0.04/0.050 = 0.80

Step 4 — p-value (one-tailed, right):
P(Z > 0.80) = 1 − Φ(0.80) = 1 − 0.7881 = 0.2119

Step 5 — Decision:
p = 0.212 > α = 0.05 → Fail to reject H₀

Conclusion: There is insufficient evidence at the 5% level that majority support exceeds 50%. Getting 54 of 100 (54%) is entirely consistent with natural sampling variability around a true proportion of 50% — this difference is not statistically significant.`,
  }, 10),

  makeCalcEntry({
    essayPrompt: `12 students took a training program. Differences (post − pre) have d̄ = 4.5 and s_d = 3.2. Test H₀: μ_d = 0 vs. H₁: μ_d > 0 at α = 0.05 using a paired t-test. Show all steps.`,
    solutionSteps: `Step 1: SE=s_d/√n=3.2/√12≈0.9238\nStep 2: t=4.5/0.9238≈4.872\nStep 3: df=11\nStep 4: t*(11,one-tail α=0.05)≈1.796; 4.872>1.796 → Reject H₀`,
    studentWork: `H₀: μ_d = 0 (training produces no average improvement)
H₁: μ_d > 0 (training increases scores — one-tailed, direction specified a priori)

Given: d̄ = 4.5, s_d = 3.2, n = 12 paired differences.

Step 1 — Standard error of d̄:
SE = s_d/√n = 3.2/√12 = 3.2/3.4641 = 0.9238

Step 2 — t-statistic (one-sample t on differences):
t = d̄/SE = 4.5/0.9238 = 4.872

Step 3 — Degrees of freedom:
df = n − 1 = 12 − 1 = 11

Step 4 — Critical value:
t*(df=11, α=0.05, one-tailed) ≈ 1.796

Since 4.872 >> 1.796 → Reject H₀

Conclusion: Very strong statistical evidence (t = 4.87, p < 0.001) that the training program significantly improved scores. The t-statistic is nearly 5 SEs above zero — extremely unlikely under H₀. The average gain of 4.5 points is both statistically significant and practically meaningful.`,
  }, 10),

  makeCalcEntry({
    essayPrompt: `A one-way ANOVA has k=3 groups, total n=30. SSB (between groups) = 120; SSW (within groups) = 180. Calculate the F-statistic and test at α = 0.05. Show all steps.`,
    solutionSteps: `Step 1: df_between=k−1=2; df_within=n−k=27\nStep 2: MSG=120/2=60; MSE=180/27≈6.667\nStep 3: F=MSG/MSE=9.00\nStep 4: F*(2,27,0.05)≈3.35; 9.00>3.35 → Reject H₀`,
    studentWork: `H₀: μ₁ = μ₂ = μ₃; H₁: at least one group mean differs

Given: k=3 groups, n=30 total, SSB=120, SSW=180.

Step 1 — Degrees of freedom:
df_between = k − 1 = 3 − 1 = 2
df_within = n − k = 30 − 3 = 27
Check: df_total = n − 1 = 29 = 2 + 27 ✓

Step 2 — Mean squares:
MSG = SSB/df_between = 120/2 = 60.000
MSE = SSW/df_within = 180/27 ≈ 6.667
MSG measures between-group variability; MSE measures average within-group variability.

Step 3 — F-statistic:
F = MSG/MSE = 60.000/6.667 = 9.00

Step 4 — Decision:
F*(df₁=2, df₂=27, α=0.05) ≈ 3.35
Since F = 9.00 >> 3.35 → Reject H₀

Conclusion: At α=0.05, there is statistically significant evidence that at least one group mean differs (F=9.00, p<0.005). A post-hoc test (e.g., Tukey's HSD) would be needed to identify which specific pairs of groups differ.`,
  }, 10),

  makeCalcEntry({
    essayPrompt: `A salesperson makes a sale on any given call with probability 0.30. Let X = number of calls until the first sale. Calculate P(X = 4). Show the geometric formula and all steps.`,
    solutionSteps: `P(X=k)=(1−p)^(k−1)×p\nP(X=4)=(0.70)^3×0.30=0.343×0.30=0.1029`,
    studentWork: `X = number of calls until first sale. X follows a Geometric distribution.

Conditions verified:
1. Binary outcome: each call is a sale (p=0.30) or no sale (1−p=0.70) ✓
2. Independent trials: calls are independent ✓
3. Constant p = 0.30 per call ✓
4. No fixed n: calling continues until first success ✓

Geometric PMF: P(X = k) = (1 − p)^(k−1) × p

P(X = 4):
= (1 − 0.30)^(4−1) × 0.30
= (0.70)^3 × 0.30
= 0.343 × 0.30
= 0.1029

Probability: ≈ 10.3%

Interpretation: There is a 10.3% chance the salesperson needs exactly 4 calls — 3 consecutive failures followed by 1 success. E[X] = 1/p = 1/0.30 ≈ 3.33 calls on average, so P(X=4) near 10% is reasonable since 4 is close to the geometric mean.`,
  }, 10),

  // ── Score 10 in narrative format ────────────────────────────────────────
  makeNarrativeEntry({
    essayPrompt: `A pharmaceutical company tests a new pain medication. The null hypothesis is that the drug has no effect. Explain what a Type I error and a Type II error would mean in this clinical trial context, and discuss which type of error might have more serious consequences and why.`,
    whatToLookFor: `A strong response will correctly define Type I error as rejecting H₀ when it is actually true (concluding the drug works when it does not — a false positive) and Type II error as failing to reject H₀ when it is false (concluding the drug is ineffective when it actually works — a false negative). The student should contextualize both: Type I means approving an ineffective drug (wastes resources, may delay better treatments, could expose patients to side effects without benefit); Type II means rejecting an effective drug (patients who could benefit do not receive treatment). A strong response engages with the tradeoff: Type I error rate is traditionally controlled by choosing α (e.g., 0.05), while Type II error rate (β) is reduced by increasing sample size or effect size. The student should take a defensible position on which is more serious — in medical contexts, this is genuinely nuanced (some argue Type I is worse due to patient safety; others argue Type II is worse due to missed benefits) — and explain their reasoning. Partial credit if definitions are correct but contextual examples or the tradeoff discussion is missing.`,
    studentWork: `Type I error (α-error, false positive):
We reject H₀ when H₀ is true — we conclude the pain medication is effective when it actually has no therapeutic benefit. The probability of this error = α (significance level, typically set at 0.05).
Clinical consequence: An ineffective drug is approved. Patients experience side effects without benefit. Physicians prescribe a useless medication with false confidence. Resources and prescriptions are diverted from treatments that work.

Type II error (β-error, false negative):
We fail to reject H₀ when H₀ is false — we conclude the drug is ineffective when it actually works. Probability = β; Power = 1 − β.
Clinical consequence: An effective pain medication is rejected. Patients who could have received relief continue to suffer. A valuable treatment is abandoned or indefinitely delayed.

The α–β tradeoff:
For a fixed sample size, α and β are inversely related: lowering α (stricter threshold) increases β. To reduce both simultaneously requires a larger sample size. This is why power analysis is conducted before data collection — to determine the n that achieves both α ≤ 0.05 and power ≥ 0.80 (i.e., β ≤ 0.20).

Which error is more serious:
This is genuinely context-dependent, and a thoughtful answer must engage with the nuance rather than picking arbitrarily.

If effective alternatives already exist: a Type I error means exposing patients to a useless drug's side effects while bypassing better treatments. This argues for tightly controlling α.

If this medication targets a condition with no current treatment: a Type II error means denying real relief to suffering patients — potentially catastrophic at scale.

Regulatory practice: FDA Phase III trials typically require two independent trials, each with one-sided α ≈ 0.025 (≈ 0.05 two-sided), prioritizing Type I error control to protect patients from ineffective treatments. This reflects the view that approving a harmful or useless drug erodes trust in medicine and harms patients who forgo other care.

The correct framing: The goal is not to choose which error to accept, but to design a well-powered study that keeps both errors small. A study with n chosen to achieve power ≥ 0.80 at α = 0.05 limits Type I error to 5% and Type II error to 20% — an explicit tradeoff that investigators, sponsors, and regulators agree upon in advance.`,
  }, 10),

  makeNarrativeEntry({
    essayPrompt: `A student flips a fair coin 10 times and gets 8 heads. She concludes: "This coin must be biased." Another student flips the same coin 1,000 times and gets 520 heads. He concludes: "This coin is definitely fair." Evaluate both students' reasoning using the concepts of sampling variability and the Law of Large Numbers.`,
    whatToLookFor: `A strong response demonstrates understanding that 8/10 heads (80%) is not sufficient evidence to conclude bias because the sample is tiny — with only 10 flips, substantial deviation from 50% is expected by chance alone (sampling variability). The first student's conclusion is too strong for such a small sample. For the second student: 520/1000 = 52% is very close to the expected 50%, and with a large sample the Law of Large Numbers guarantees that the sample proportion will be close to the true probability. However, the student cannot conclude the coin is "definitely" fair — only that the observed proportion is consistent with a fair coin. "Definitely" implies certainty, which is never available in statistics. A strong response will reference sampling variability (natural fluctuation in statistics from sample to sample), the Law of Large Numbers (as n increases, x̄ → μ), and the distinction between "consistent with fairness" and "proven fair." Credit for understanding that neither student can make an absolute claim.`,
    studentWork: `First student's reasoning — fundamentally flawed:
8/10 = 80% heads triggers intuitive alarm, but the flaw is the tiny n. For a fair coin (p=0.50), SE(p̂) = √(0.5×0.5/10) ≈ 0.158. Getting p̂=0.80 puts us (0.80−0.50)/0.158 ≈ 1.9 SEs above 0.50. Using the exact binomial: P(X ≥ 8 | fair, n=10) = [C(10,8) + C(10,9) + C(10,10)] / 2¹⁰ = 56/1024 ≈ 5.5%. This is unusual but far from conclusive. With n=10, the study has very low statistical power to detect even moderate bias. Sampling variability — natural random fluctuation from sample to sample — fully explains this result. The conclusion "the coin must be biased" dramatically overstates the evidence. A one-sided binomial test here gives p ≈ 0.055, which does not even reach α=0.05.

Second student's reasoning — substantially correct, but overclaims:
520/1000 = 52.0%, very close to 50%. The Law of Large Numbers (LLN) states: as n → ∞, p̂ → p (the true probability of heads). With n=1000, SE(p̂) = √(0.5×0.5/1000) ≈ 0.0158. Getting 52% is only (0.52−0.50)/0.0158 ≈ 1.27 SEs above 0.50 — a two-tailed p-value ≈ 0.20, fully consistent with a fair coin.

However, "definitely fair" is never statistically justified. No finite sample can prove a coin is exactly fair (p=0.5000...). A slightly biased coin (p=0.51 or p=0.49) could easily produce 520/1000 in expectation — detecting such small biases requires n in the tens of thousands. The second student should say: "The results are consistent with a fair coin; there is no significant evidence of bias."

Key conceptual distinction — LLN vs. CLT:
Both concepts apply but address different things. The LLN explains why p̂ = 52% ≈ 50% with large n (the sample proportion converges to the true p). The CLT explains why we can use z-scores to compute probabilities about p̂ (the sampling distribution of p̂ becomes approximately normal). LLN provides the intuition; CLT provides the inferential machinery. Neither theorem — and no finite sample — ever certifies a coin as "definitely" fair.`,
  }, 10),

  makeNarrativeEntry({
    essayPrompt: `A local TV news station asks viewers to call in to vote on whether the city should build a new sports stadium. Out of 2,400 callers, 78% say "No." The station reports: "An overwhelming majority of city residents oppose the stadium." Identify and explain the sampling method, the bias it introduces, and whether the conclusion is valid.`,
    whatToLookFor: `A strong response identifies this as voluntary response sampling (also called self-selection bias) — only people who feel strongly enough to call in respond, which systematically skews results toward those with extreme opinions (typically opponents, who are more motivated to act). Key points: (1) the sampling method is voluntary response / self-selected, not random; (2) voluntary response bias means the sample systematically over-represents people with strong negative opinions; (3) the station's conclusion ("overwhelming majority of city residents") is not valid — they cannot generalize from this non-representative sample to the population of all city residents; (4) a valid approach would use a simple random sample or a stratified random sample of city residents. Credit for correctly naming the bias, explaining the mechanism (who is more likely to call), and stating why generalization is invalid.`,
    studentWork: `Sampling method: Voluntary response sampling (self-selection).
Only TV viewers who both (a) watched this specific broadcast and (b) chose to call in are included. This is not a random sample from city residents — it is entirely self-selected.

Bias introduced: Voluntary response bias — systematic, not random.
Mechanism: The decision to call is driven by motivation, not chance. People who oppose the stadium have strong emotional or financial motivations to act — concerns about public costs, traffic, neighborhood disruption. Supporters or neutral residents feel far less urgency. The probability of calling is orders of magnitude higher for strong opponents than for the average resident. This creates a systematic bias in one direction that cannot be fixed by collecting more calls: 24,000 callers would produce the same 78% No because the selection mechanism is unchanged.

Additional errors compounding the bias:
• Coverage error: Only viewers of this channel are in the sampling frame — not all city residents watch this station.
• Self-selection compounds coverage: Even among viewers, only the highly motivated call.
• Non-response: The majority of residents — who did not call — are entirely unrepresented.

Is the conclusion valid?
No. "An overwhelming majority of city residents oppose the stadium" cannot be supported. The station is generalizing from a self-selected sample of callers to all city residents — an unsupported extrapolation. The 78% figure reflects who calls TV stations, not what residents believe. The sample size of 2,400 is large, but precision (small margin of error) is irrelevant when the estimate is systematically biased. A large biased sample is worse than a small representative one.

What would be needed:
A probability-based survey — simple random sample (SRS) or stratified random sample of city residents by district — where every resident has a known, non-zero probability of selection. Only then can results be generalized to the city population with a valid margin of error and meaningful confidence interval.`,
  }, 10),

  // ── Score 10 in holistic format ─────────────────────────────────────────
  makeHolisticEntry({
    essayPrompt: `A news headline reads: "Ice cream sales and murder rates both spike in summer — study finds ice cream causes crime!" Explain why this headline is misleading. Identify the actual relationship between these variables and explain the concept being illustrated.`,
    scoringGuide: `8-10 (Excellent): Correctly identifies this as a correlation-not-causation error. Names the lurking variable (temperature / hot weather) and explains the mechanism: hot weather independently causes both more ice cream purchases and more outdoor activity leading to more crime — they share a common cause but do not causally influence each other. Uses precise vocabulary (confounding/lurking variable, association vs. causation). May note that correlation is a prerequisite for causation but not sufficient. Explains why the headline is not just misleading but logically invalid.

5-7 (Developing): Correctly states correlation does not imply causation and identifies that a lurking variable (likely temperature or season) explains both trends. May lack precise explanation of the mechanism or imprecise vocabulary, but the core reasoning is sound.

1-4 (Beginning): May acknowledge the headline seems wrong but cannot identify a lurking variable or explain the mechanism. May confuse association with causation or provide a vague response like "correlation is not the same as cause."`,
    studentWork: `The headline commits the correlation-causation fallacy. Two variables can be strongly correlated without any direct causal link if they share a common cause — a confounding (lurking) variable.

Lurking variable: Temperature / summer conditions.
Mechanism: Hot weather (1) causes increased ice cream purchases (people seek relief from heat) and (2) causes more outdoor activity, longer daylight hours, more social interaction in public spaces — all of which increase opportunities for interpersonal conflict and crime. Ice cream sales and crime both rise because of the same underlying seasonal driver. They are correlated but causally unrelated to each other.

Why this is logically invalid, not just misleading:
Establishing causation requires more than association. Standard criteria include: (1) association exists ✓, (2) the cause precedes the effect in time, (3) the association persists after controlling for confounders. Condition (3) fails: if we stratify by temperature — comparing months with identical average temperatures — the association between ice cream sales and crime would vanish. The correlation is not measurement error; it is real. But it is entirely explained by the shared seasonal driver, not by any causal pathway from ice cream to crime.

A key test: if ice cream caused crime, we would expect a dose-response relationship at the individual level — people who eat more ice cream should commit more crimes. No plausible biological or behavioral mechanism exists for this. The absence of individual-level mechanism is strong evidence against causation.

Correcting the claim:
The accurate headline would be: "Summer heat is associated with both higher ice cream sales and higher crime rates — a classic confound." Controlling for temperature in a regression model would reduce the ice cream–crime correlation to near zero, confirming that temperature is the true driver. Causal inference from observational data requires explicitly ruling out confounders — something the study headline failed to do.`,
  }, 10),

  makeHolisticEntry({
    essayPrompt: `A classmate says: "The Central Limit Theorem says that as you collect more data, your data will eventually become normally distributed." Explain whether your classmate is correct or incorrect, and state what the Central Limit Theorem actually says. Give an example to illustrate.`,
    scoringGuide: `8-10 (Excellent): Clearly identifies the misconception — the CLT does not say individual data values become normal. States the CLT correctly: as sample size increases, the sampling distribution of the sample mean (x̄) approaches a normal distribution, regardless of the population distribution. Distinguishes between: the population distribution (fixed, may be skewed), the distribution of raw data (same shape as population, does not change with n), and the sampling distribution of x̄ (becomes approximately normal as n increases, typically n ≥ 30 as a rule of thumb). Provides a concrete example (e.g., household income is right-skewed; individual incomes don't become normal with more data, but the distribution of sample means from many samples would be approximately normal). Precise, complete, clearly communicated.

5-7 (Developing): Correctly identifies that the classmate is wrong. States that the CLT is about sample means, not individual values. May not clearly distinguish all three distributions or may lack a concrete illustrative example. Core understanding is present but explanation has gaps.

1-4 (Beginning): May partially identify the error but cannot correctly state what the CLT says. May confuse sample distributions with sampling distributions, or state the CLT incorrectly.`,
    studentWork: `The classmate is incorrect, and the error reflects a very common but fundamental misunderstanding.

What the classmate said: "...your data will eventually become normally distributed."
This refers to individual observations — but no theorem says collecting more data changes the shape of the data distribution. More data estimates the population more accurately; it does not reshape it. If the population is right-skewed, the data distribution stays right-skewed regardless of n.

What the CLT actually says:
For random samples of size n from any population with finite mean μ and finite variance σ², the sampling distribution of the sample mean x̄ approaches N(μ, σ²/n) as n → ∞. A common rule of thumb: n ≥ 30 is adequate for most populations (larger n needed for highly skewed distributions).

Three distributions to keep distinct:
1. Population distribution — fixed; reflects the characteristic in the real world. Does NOT change with more data.
2. Sample data distribution — a snapshot of the population; more data makes it converge to the population shape. Also does NOT become normal unless the population is.
3. Sampling distribution of x̄ — distribution of sample means across many hypothetical repeated samples of size n. THIS is what the CLT says becomes approximately normal.

Concrete example:
U.S. household annual income is highly right-skewed (mean ≈ $96K, median ≈ $70K, with a long tail of very high earners). If I sample 50 households and record each income, the 50 values are right-skewed — adding more observations makes the distribution a better picture of the population, but it stays right-skewed. However, if I repeatedly drew samples of n=50 and computed the mean income each time, plotting those sample means would show an approximately normal distribution centered at $96K with SE = σ/√50 — exactly what the CLT predicts.

Why the CLT is so powerful:
It enables statistical inference (t-tests, confidence intervals) for any population shape. Without the CLT, we could only use z-tests and t-tests when the population itself was normal. With the CLT, sample means are approximately normal for large n — this is why inferential procedures work in practice even when individual data are skewed.

Important limit: the CLT applies to sample means specifically. For other statistics (sample maximum, sample variance, sample median), different distributional results apply. The CLT does not generalize automatically to all statistics.`,
  }, 10),

  makeHolisticEntry({
    essayPrompt: `A school librarian wants to survey 100 students about library hours. She considers: (A) Select 100 students randomly from the school roster. (B) Divide students into grade levels and select 25 from each grade. Compare the methods, identify each by name, explain the advantage of B over A in this context, and discuss one potential disadvantage of B.`,
    scoringGuide: `8-10 (Excellent): Correctly names method A as simple random sampling (SRS) and method B as stratified random sampling. Explains the advantage of stratification clearly: stratified sampling guarantees representation from every grade level — with SRS, by chance, some grades could be over- or under-represented in the sample of 100. If grade level is related to library usage patterns (e.g., 12th graders use the library more for college applications), stratification ensures estimates reflect all subgroups. Notes that stratified sampling typically yields lower variance for the overall estimate when strata differ in their means. Identifies a genuine disadvantage: requires knowing stratum membership in advance; more complex to implement; equal allocation (25 per grade) may not match the actual proportional makeup of the school, which could introduce distortion if grade sizes differ substantially (proportional stratification would be better). Response is precise and uses correct terminology throughout.

5-7 (Developing): Correctly names both methods and identifies that stratified sampling guarantees representation from all grades. May not explain why this matters or may identify a vague or incorrect disadvantage. Core reasoning is sound but lacks depth or precision.

1-4 (Beginning): May correctly name one method or identify they are different, but cannot explain the advantage of stratification or confuses the methods.`,
    studentWork: `Method A: Simple Random Sampling (SRS).
Every student has an equal probability of selection: n=100 chosen from the full roster by a random mechanism. No structure imposed on the sample.

Method B: Stratified Random Sampling.
The population is divided into non-overlapping, exhaustive strata (grade levels: 9, 10, 11, 12), and a separate SRS of 25 is drawn within each stratum. Every student within a stratum has equal selection probability within that stratum.

Primary advantage of Method B — guaranteed representation:
With SRS and n=100, the expected count per grade is 25, but random sampling can produce substantial deviations: e.g., 40 seniors, 30 juniors, 20 sophomores, 10 freshmen purely by chance. If library usage patterns differ by grade (seniors researching college applications, freshmen unfamiliar with resources), such imbalances distort the overall estimate. Stratification eliminates this risk: all four grades contribute exactly 25 observations.

Statistical advantage — variance reduction:
When strata means differ — which they do if library usage varies by grade — stratified sampling yields a lower-variance estimate than SRS of the same total n. The key condition: within-stratum variance < overall variance. Variance formula: Var(ȳ_st) = Σ (Nₕ/N)² × (Sₕ²/nₕ), which is strictly smaller than Var(ȳ_SRS) = S²/n when strata are heterogeneous (differ in means) and homogeneous within (similar within each grade).

Disadvantage of Method B — equal allocation with potentially unequal strata:
Equal allocation (25 per grade) is only unbiased for the school-wide estimate if all grades are the same size. Suppose the school has 400 seniors but 100 freshmen — equal allocation samples 25/400 = 6.25% of seniors but 25/100 = 25% of freshmen, over-representing freshmen. To produce a valid school-wide estimate, the analyst must apply post-stratification weights: ȳ = Σ(Nₕ/N) × ȳₕ where Nₕ is stratum size. Ignoring weights biases the overall estimate toward smaller strata. Proportional stratification (sample each stratum at rate n/N) avoids this but requires knowing exact stratum sizes in advance. Either way, Method B is more complex to design and analyze than SRS.`,
  }, 10),

];

console.log(`Step 4f: ${score10Entries.length} score 10 entries for calc/narrative/holistic formats`);

// ── STEP 5: Merge and write ───────────────────────────────────────────────────

const merged = [...oldEntries, ...newEntries, ...syntheticEntries, ...patchEntries, ...narrativeEntries, ...holisticEntries, ...calcEntries, ...gapEntries, ...score10Entries];
const outPath = path.join(__dirname, 'finetune-grading.jsonl');
fs.writeFileSync(outPath, merged.map(e => JSON.stringify(e)).join('\n') + '\n');

console.log(`\nTotal merged: ${merged.length}`);
console.log(`  - Old (HTML stripped): ${oldEntries.length}`);
console.log(`  - New (format converted): ${newEntries.length}`);
console.log(`  - Synthetic (gap topics): ${syntheticEntries.length}`);
console.log(`  - Patches (score 1 & 10): ${patchEntries.length}`);
console.log(`  - Narrative rubric: ${narrativeEntries.length}`);
console.log(`  - Holistic rubric: ${holisticEntries.length}`);
console.log(`  - Calculation rubric: ${calcEntries.length}`);
console.log(`  - Score gap (0/4/5): ${gapEntries.length}`);
console.log(`  - Score 10 (new formats): ${score10Entries.length}`);
console.log(`Written to: ${outPath}`);

// Quick validation
let parseErrors = 0;
const allScores = [];
merged.forEach((e, i) => {
  try {
    const score = JSON.parse(e.messages[2].content).score;
    allScores.push(score);
  } catch(err) {
    console.error('VALIDATION ERROR entry', i + 1, err.message);
    parseErrors++;
  }
});
allScores.sort((a, b) => a - b);
console.log(`\nValidation: ${parseErrors} errors`);
console.log(`Score range: ${allScores[0]} – ${allScores[allScores.length - 1]}`);
console.log(`Score distribution:`, JSON.stringify(
  allScores.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {})
));
