/**
 * Core grading logic for O.G.R.E Grading Server
 * Handles batch grading with scoring anchors, chunking, and outlier detection
 */

import { GRADING_PHILOSOPHY, SCORING_SCALE_DESCRIPTORS } from './grading-constants.js';

/**
 * Extract custom instructions into structured parts for tiered positioning.
 * Separates scoring calibration examples (reference-only) from teacher override instructions (mandatory).
 *
 * @param {string} customInstructions - Combined instructions from client
 * @returns {{ calibration: string|null, overrideInstructions: string|null }}
 */
function extractCustomInstructions(customInstructions) {
  if (!customInstructions) return { calibration: null, overrideInstructions: null };

  if (!customInstructions.startsWith('SCORING CALIBRATION:')) {
    return { calibration: null, overrideInstructions: customInstructions };
  }

  const withoutHeader = customInstructions.slice('SCORING CALIBRATION:\n'.length);
  const ANCHOR_LABELS = ['Excellent', 'Adequate', 'Below Average', 'Minimal'];
  let splitPos = -1;
  let searchFrom = 0;
  while (searchFrom < withoutHeader.length) {
    const idx = withoutHeader.indexOf('\n\n', searchFrom);
    if (idx === -1) break;
    const afterBreak = withoutHeader.slice(idx + 2).trimStart();
    if (afterBreak.length > 0 && !ANCHOR_LABELS.some(l => afterBreak.startsWith(l))) {
      splitPos = idx;
      break;
    }
    searchFrom = idx + 2;
  }

  const calibPart    = (splitPos === -1 ? withoutHeader : withoutHeader.slice(0, splitPos)).trim();
  const overridePart = (splitPos === -1 ? '' : withoutHeader.slice(splitPos)).trim();

  return {
    calibration: calibPart || null,
    overrideInstructions: overridePart || null,
  };
}


/**
 * Generate scoring anchors (Excellent, Adequate, Below Average, Minimal) for calibration
 * @param {Object} rubric - Rubric with essayPrompt, checklistItems, rubricItems, maxScore
 * @returns {Object} - { excellent, adequate, belowAverage, minimal } with score and description
 */
export function generateScoringAnchors(rubric) {
  const maxScore = parseFloat(rubric.maxScore) || 10;

  // Round to 1 decimal place for small max scores (< 6) so anchors stay
  // proportionate rather than collapsing to the same integer value.
  const roundScore = (s) => maxScore < 6 ? Math.round(s * 10) / 10 : Math.round(s);
  // Generate scores for each anchor level
  const excellentScore = roundScore(maxScore * 0.95); // 95% - near perfect
  const adequateScore = roundScore(maxScore * 0.80); // 80% - solid understanding
  const belowAverageScore = roundScore(maxScore * 0.65); // 65% - partial understanding
  const minimalScore = roundScore(maxScore * 0.45); // 45% - bare minimum

  // Descriptions are intentionally generic — anchors calibrate score levels, not question content
  const excellentDesc = 'Demonstrates clear understanding with most key concepts addressed.';
  const adequateDesc = 'Addresses the topic and shows awareness of key concepts, even with gaps or imprecision.';
  const belowAverageDesc = 'Makes a genuine attempt that engages with the prompt, showing limited but real understanding.';
  const minimalDesc = 'Shows some effort and awareness related to the topic, even if mostly incomplete.';
  return {
    excellent: {
      score: excellentScore,
      description: excellentDesc,
    },
    adequate: {
      score: adequateScore,
      description: adequateDesc,
    },
    belowAverage: {
      score: belowAverageScore,
      description: belowAverageDesc,
    },
    minimal: {
      score: minimalScore,
      description: minimalDesc,
    },
  };
}

/**
 * Build batch grading prompt for all students with scoring anchors
 * @param {Object} rubric - Rubric object
 * @param {Array} students - Array of student objects with index, name, response
 * @param {Object} anchors - Scoring anchors from generateScoringAnchors()
 * @param {Array|null} bridgeResponses - Graded examples from previous chunk for consistency
 * @returns {String} - Complete prompt for AI grading
 */
export function buildBatchPrompt(rubric, students, anchors, bridgeResponses = null, calibrationExamples = null) {
  const maxScore = rubric.maxScore || '10';
  const { virtualMax, factor: scoreFactor } = getScaleInfo(maxScore);

  // Pre-compute effective points for weighted modes — AI sees only adjusted totals, never raw weights
  const weightMode = rubric.weightMode;
  function effectivePoints(item) {
    const max = parseFloat(maxScore) || 10;
    if (weightMode === 'category' && item.categoryWeight != null) {
      const base = item.points > 0 ? item.points : max;
      return Math.round(base * (item.categoryWeight / 100) * 10) / 10;
    }
    if (weightMode === 'criterion' && item.criterionWeight != null) {
      const base = item.points > 0 ? item.points : max;
      return Math.round(base * (item.criterionWeight / 100) * 10) / 10;
    }
    return item.points > 0 ? item.points : max;
  }
  const _scoreHint = 'integer 0-10 (see SCORING SCALE below)';

  // Separate custom instructions from essayPrompt if they were appended
  let essayPrompt = rubric.essayPrompt || '(No prompt provided)';
  let customInstructions = rubric.customInstructions || '';

  // Extract ADDITIONAL GRADING INSTRUCTIONS if embedded in essayPrompt
  const instrMatch = essayPrompt.match(/\n\nADDITIONAL GRADING INSTRUCTIONS:\n([\s\S]+)$/);
  if (instrMatch) {
    customInstructions = instrMatch[1].trim();
    essayPrompt = essayPrompt.replace(/\n\nADDITIONAL GRADING INSTRUCTIONS:\n[\s\S]+$/, '').trim();
  }

  const { calibration, overrideInstructions } = extractCustomInstructions(customInstructions);

   let prompt = `You are an expert grading assistant. Grade ALL students in this batch against the provided rubric. Output: JSON array only.

${overrideInstructions ? `INSTRUCTOR OVERRIDE INSTRUCTIONS (you MUST follow these \u2014 they take absolute precedence):\n${overrideInstructions}\n\n` : ''}GRADING PHILOSOPHY:
${GRADING_PHILOSOPHY}

MAX SCORE: ${virtualMax}

QUESTION/PROMPT:
${essayPrompt}
`;

  // Add checklist items if present — flatten requirements as numbered items
  // so the AI writes feedback per requirement, not per category
  if (rubric.checklistItems && rubric.checklistItems.length > 0) {
    prompt += '\nGRADING REQUIREMENTS (write feedback for EACH numbered item):\n';
    let reqNum = 1;
    for (const item of rubric.checklistItems) {
      if (item.items) {
        for (const sub of item.items) {
          prompt += `${reqNum}. [${item.category || 'General'}] ${sub}\n`;
          reqNum++;
        }
      }
    }
    prompt += `\nSCORING BY CATEGORY (score each 0-10, server applies weights automatically):\n`;
    for (const item of rubric.checklistItems) {
      if (item.category) prompt += `- ${item.category}: 10 points\n`;
    }
    const ctLow = 60;
    const ctHigh = 80;
    prompt += `\nPARTIAL CREDIT RULE: When a requirement is addressed conceptually but lacks specific values, formulas, or concrete evidence, award 40-60% of that category's points. Award 20-40% if only loosely related; 60-80% if substantially complete but missing one key element. Evaluate each requirement INDEPENDENTLY - do not let strength on one compensate for weakness on another. For 5-point categories, map bands roughly as: 1-2 pts (20-40%), 2-3 pts (40-60%), 3-4 pts (60-80%); reserve 4-5 pts for essentially complete/correct coverage.

CONCEPTUAL THOROUGHNESS RULE: When a student demonstrates genuine understanding of the underlying concept — correct reasoning, valid approach, or sound logic — but has execution flaws (arithmetic errors, missing units, informal notation, incomplete steps), award ${ctLow}-${ctHigh}% of that category's points. Concept mastery with flawed execution always scores higher than rote correctness without understanding. A student who explains WHY a method works but makes a calculation error deserves more credit than one who copies a formula without understanding it.\n`;
  }

  // Add category weight hints when percentage weights are provided
  if (rubric.categoryWeights && typeof rubric.categoryWeights === 'object') {
    const weightEntries = Object.entries(rubric.categoryWeights);
    if (weightEntries.length > 0) {
      prompt += `\nCATEGORY WEIGHTS (percentage of total grade):\n`;
      for (const [cat, pct] of weightEntries) {
        prompt += `- ${cat}: ${pct}% of total grade\n`;
      }
      prompt += `Grade each category on its own merits. These weights will be applied automatically.\n`;
    }
  }

  // Add criterion weight hints when per-criterion weights are provided
  if (rubric.criterionWeights && typeof rubric.criterionWeights === 'object') {
    const catEntries = Object.entries(rubric.criterionWeights);
    if (catEntries.length > 0) {
      prompt += `\nCRITERION WEIGHTS (within each category, criteria percentages must sum to 100%):\n`;
      for (const [cat, criteria] of catEntries) {
        prompt += `- ${cat}:\n`;
        for (const [criterion, pct] of Object.entries(criteria)) {
          prompt += `  - ${criterion}: ${pct}%\n`;
        }
      }
      prompt += `Weight each criterion proportionally within its category. These weights will be applied automatically.\n`;
    }
  }

  // Add rubric targets if present
  if (rubric.rubricItems && rubric.rubricItems.length > 0) {
    prompt += '\nKEY CONCEPTS TO ADDRESS:\n';
    for (const item of rubric.rubricItems) {
      if (item.category) prompt += `${item.category}:\n`;
      if (item.items) {
        for (const sub of item.items) {
          prompt += `  - ${sub}\n`;
        }
      }
    }
  }

  // Add model response if present
  if (rubric.modelText) {
    prompt += `\nMODEL RESPONSE (for reference):\n${rubric.modelText}\n`;
  }

  // Add scoring anchors for calibration
  prompt += `
SCORING ANCHORS (use these as calibration references):
- Excellent (${Math.round(anchors.excellent.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.excellent.description}
- Adequate (${Math.round(anchors.adequate.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.adequate.description}
- Below Average (${Math.round(anchors.belowAverage.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.belowAverage.description}
- Minimal (${Math.round(anchors.minimal.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.minimal.description}

Compare each student response to these anchors to ensure consistency.

${getScoringScaleString()}


`;
  const floor = 8;
  const floorHigh = Math.min(floor + 1, 10);
  prompt += `
CRITICAL: A response that correctly hits every rubric criterion earns ${floor}-${floorHigh}, REGARDLESS of length.
A short, accurate answer scores higher than a long, partially-wrong one.
Only drop below ${floor} if a rubric criterion is genuinely missing or incorrect — NOT merely brief.
This ${floor}+ rule applies only when ALL rubric criteria are substantively addressed — brevity cannot compensate for missing sub-criteria.
Score ${floor} requires all rubric criteria to be substantively correct; score ${floor - 1} when one criterion is only partially met or missing a key element — but if conceptual understanding is demonstrated, score ${floor - 1} not ${floor - 2}.
`;
  if (calibration) {
    prompt += `\nSCORING CALIBRATION EXAMPLES (use to calibrate score levels only \u2014 grade against rubric criteria and SCORING SCALE above, not these examples):\n${calibration}\n`;
  }
  // Add bridge responses from previous chunk for cross-chunk consistency
  if (bridgeResponses && bridgeResponses.length > 0) {
    prompt += `
CALIBRATION EXAMPLES (from previously graded batch — you MUST match this scoring standard):
`;
    // Group by tier for clearer presentation
    const tiers = {};
    for (const br of bridgeResponses) {
      const tier = br.tier || 'other';
      if (!tiers[tier]) tiers[tier] = [];
      tiers[tier].push(br);
    }

    const tierLabels = { excellent: 'HIGH QUALITY', adequate: 'AVERAGE QUALITY', belowAverage: 'BELOW AVERAGE', minimal: 'LOW QUALITY', spread: 'REFERENCE' };
    for (const [tier, examples] of Object.entries(tiers)) {
      prompt += `\n${tierLabels[tier] || tier.toUpperCase()}:\n`;
      for (const br of examples) {
        prompt += `  - "${br.name || 'Student ' + br.studentIndex}" = ${Math.round(br.score * scoreFactor * 10) / 10}/${virtualMax}: ${(br.feedback || '').substring(0, 300)}\n`;
      }
    }

    prompt += `
CONSISTENCY RULES:
- A response of SIMILAR quality to a calibration example MUST receive a SIMILAR score (within 1 point).
- A response BETTER than the "high quality" examples should score the same or higher.
- A response WORSE than the "low quality" examples should score the same or lower.
- Score distribution should be comparable to the previous batch.
`;
  }

  // Add historical calibration examples from previous sessions (additive — never replaces bridge responses)
  if (calibrationExamples && calibrationExamples.total > 0) {
    prompt += `\nHISTORICAL CALIBRATION EXAMPLES (from previous grading sessions with similar rubrics \u2014 use to calibrate your scoring standard):\n`;
    for (const [tier, label] of [['excellent', 'HIGH QUALITY'], ['adequate', 'AVERAGE QUALITY'], ['minimal', 'LOW QUALITY']]) {
      const ex = calibrationExamples[tier];
      if (ex) {
        prompt += `\n${label}:\n  - "[STUDENT]" = ${Math.round(ex.gradingScore * scoreFactor * 10) / 10}/${virtualMax}: ${(ex.feedback || '').substring(0, 300)}\n`;
      }
    }
    prompt += `\nHISTORICAL CONSISTENCY RULES:\n- Use these historical examples to understand the scoring standard applied in past sessions.\n- A response of similar quality to a historical HIGH QUALITY example should score similarly.\n- These examples supplement (do not replace) the SCORING ANCHORS and CALIBRATION EXAMPLES above.\n`;
  }

  // Check if any students have per-student prompts (jittered values differ per student)
  const hasPerStudentPrompts = students.some(s => s.prompt && s.prompt !== essayPrompt);
  if (hasPerStudentPrompts) {
    prompt += `\nIMPORTANT: Each student received the same question structure but with DIFFERENT randomized numeric values. Each student's specific question is shown below their header. Grade each student against THEIR specific values, not the shared prompt above.\n`;
  }

  // Add all students to the prompt
  prompt += '\nSTUDENTS TO GRADE:\n\n';
  for (const student of students) {
    prompt += `--- Student ${student.index}: ${student.name} ---\n`;
    if (hasPerStudentPrompts && student.prompt) {
      prompt += `THEIR QUESTION: ${student.prompt}\n`;
    }
    prompt += `${student.response || '(No response submitted)'}\n\n`;
  }

  // Build Chain-of-Rubric criterion names for JSON response template
  // Always use 0-10 scale per category — server applies category weights afterward
  const _corItems = (rubric.checklistItems || []).map(c => ({
    name: c.category.replace(/\s*\(\d+\s*pts?\)/i, '').trim(),
  }));
  const _corField = _corItems.length > 0
    ? `    "criterion_scores": {${_corItems.map(({name}) => `"${name}": <0-10>`).join(', ')}},\n`
    : '';
  // Response format instructions — use actual student indices so AI doesn't guess
  const firstIdx = students[0]?.index ?? 0;
  const secondIdx = students.length > 1 ? (students[1]?.index ?? firstIdx + 1) : firstIdx + 1;
  // Build a dynamic feedback example from actual requirements so the AI has a
  // concrete pattern to follow (LLMs follow examples better than instructions)
  const _allReqs = [];
  for (const item of (rubric.checklistItems || [])) {
    if (item.items) {
      for (const sub of item.items) {
        _allReqs.push(sub);
      }
    }
  }
  let _feedbackExample = '';
  if (_allReqs.length > 0) {
    // Show first 2 requirements as examples (one addressed, one not)
    _feedbackExample = `\\n\\n**${_allReqs[0]}**\\n> You said: \\"[quote what student wrote]\\"\\n\\n[Correct/Incorrect/Incomplete — explain WHY]\\n\\n*To improve: [specific suggestion]*`;
    if (_allReqs.length > 1) {
      _feedbackExample += `\\n\\n**${_allReqs[1]}**\\n> You did not address this.\\n\\n[Explain what was expected]`;
    }
    // Show the rest as stubs so the AI knows to continue
    for (let i = 2; i < _allReqs.length; i++) {
      _feedbackExample += `\\n\\n**${_allReqs[i]}**\\n> You said: ...\\n\\n...`;
    }
  }

  prompt += `
${_corItems.length > 0 ? `GRADING PROCESS:\nFor each student: (1) score each category independently using the PARTIAL CREDIT RULE above, (2) record category scores in criterion_scores, (3) sum for the final score. Do NOT adjust scores to hit a desired total.\n` : ''}

FEEDBACK FORMAT RULE: The feedback string must contain one section for EACH numbered requirement from GRADING REQUIREMENTS. Do NOT group by category. Each requirement gets its own bolded header. criterion_scores uses categories for scoring, but feedback MUST be per-requirement.

[
  {
    "studentIndex": ${firstIdx},
    ${_corField}    "score": <${_scoreHint}>
    "feedback": "Hi [name],${_feedbackExample}"
  },
  {
    "studentIndex": ${secondIdx},
    ${_corField}    "score": <${_scoreHint}>
    "feedback": "<same format — one section per requirement>"
  }
  // ... continue for all ${students.length} students
]

CRITICAL: Return results for ALL ${students.length} students. Use the studentIndex from each \"--- Student N:\" header.`;


  return prompt;
}

/**
 * Parse batch AI response into structured results
 * Handles JSON extraction from markdown code fences, score clamping, empty responses
 * @param {String} aiText - Raw AI response text
 * @param {Array} students - Original students array for fallback
 * @param {Number} maxScore - Maximum possible score
 * @returns {Array} - Array of { studentIndex, score, feedback }
 */
export function parseBatchResponse(aiText, students, maxScore, categoryWeights = null, categoryMaxPoints = null) {
  let text = aiText.trim();

  // Strip <think>...</think> reasoning blocks (Kimi, DeepSeek, etc.)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                     text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Helper: attempt JSON parse with progressive fixes
  function tryParse(str) {
    // Direct parse
    try {
      const p = JSON.parse(str);
      if (Array.isArray(p)) return p;
      // Unwrap common wrapper objects
      if (p && typeof p === 'object') {
        const arr = p.results || p.students || p.grades || p.data;
        if (Array.isArray(arr)) return arr;
      }
    } catch { /* continue */ }
    // Fix LaTeX backslashes
    try {
      const fixed = str.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      const p = JSON.parse(fixed);
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object') {
        const arr = p.results || p.students || p.grades || p.data;
        if (Array.isArray(arr)) return arr;
      }
    } catch { /* continue */ }
    // Fix trailing commas
    try {
      const fixed = str.replace(/,\s*([}\]])/g, '$1').replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      const p = JSON.parse(fixed);
      if (Array.isArray(p)) return p;
    } catch { /* continue */ }
    return null;
  }

  // Attempt 1: Parse full text
  let parsed = tryParse(text);
  if (parsed) return validateBatchResults(parsed, students, maxScore, categoryWeights, categoryMaxPoints);

  // Attempt 2: Extract JSON array from surrounding text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    parsed = tryParse(arrayMatch[0]);
    if (parsed) return validateBatchResults(parsed, students, maxScore, categoryWeights, categoryMaxPoints);
  }

  // Attempt 3: Regex extraction of individual student objects
  const objPattern = /\{\s*"studentIndex"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*(\d+\.?\d*)\s*,\s*"feedback"\s*:\s*"([^"]*)"/g;
  const regexResults = [];
  let m;
  while ((m = objPattern.exec(text)) !== null) {
    regexResults.push({
      studentIndex: parseInt(m[1], 10),
      score: parseFloat(m[2]),
      feedback: m[3],
    });
  }
  if (regexResults.length > 0) {
    console.warn(`Parsed ${regexResults.length}/${students.length} via regex fallback`);
    return validateBatchResults(regexResults, students, maxScore, categoryWeights);
  }

  // Attempt 4: Score-line patterns like "Student 5: 8/10"
  const linePattern = /student\s*(\d+)[^:]*:\s*(\d+\.?\d*)\s*\/\s*\d+/gi;
  const lineResults = [];
  while ((m = linePattern.exec(text)) !== null) {
    lineResults.push({
      studentIndex: parseInt(m[1], 10),
      score: parseFloat(m[2]),
      feedback: 'Score extracted from non-JSON response.',
    });
  }
  if (lineResults.length > 0) {
    console.warn(`Parsed ${lineResults.length}/${students.length} via score-line fallback`);
    return validateBatchResults(lineResults, students, maxScore, categoryWeights);
  }

  console.error(`Failed to parse batch response (${text.length} chars). Preview: ${text.slice(0, 500)}`);

  // Fallback: return default results for all students
  return students.map((student, idx) => ({
    studentIndex: student.index !== undefined ? student.index : idx,
    score: 0,
    feedback: 'Error parsing AI response. Please try again.',
  }));
}

// Snap score to granularity proportional to maxScore so low-point questions
// (e.g. maxScore=1) get fine-grained precision instead of only {0, 0.5, 1}.
function snapScore(score, maxScore) {
  if (maxScore >= 5) return Math.round(score * 2) / 2;  // 0.5 increments
  if (maxScore >= 2) return Math.round(score * 4) / 4;  // 0.25 increments
  return Math.round(score * 10) / 10;                    // 0.1 increments
}

// All prompts grade out of 10. Server converts to actual maxScore on output.
function scoreFormatHint(_maxScore) {
  return 'integer 0-10 (see SCORING SCALE below)';
}

// All prompts grade out of 10 regardless of actual maxScore.
// Server converts back to real score via: realScore = aiScore / 10 * maxScore.
function getScaleInfo(maxScore) {
  const max = parseFloat(maxScore) || 10;
  return { virtualMax: 10, factor: 10 / max };
}

// Build scoring scale string from shared constant
function getScoringScaleString(customDescriptors = null) {
  const descriptors = customDescriptors ?? SCORING_SCALE_DESCRIPTORS;
  return 'SCORING SCALE (use integers 0-10 — server converts to actual points):\n' +
    descriptors.map(s => `${s.score.toString().padStart(2)} – ${s.descriptor}`).join('\n');
}

function validateBatchResults(parsed, students, maxScore, categoryWeights = null, categoryMaxPoints = null) {
  // Build expected index set for validation
  const expectedIndices = new Set(students.map(s => s.index));
  const { factor: _parseFactor } = getScaleInfo(maxScore);

  // Validate that percentage weights sum to ~100 (allow 99-101 for floating point)
  if (categoryWeights) {
    const weightSum = Object.values(categoryWeights).reduce((a, b) => a + b, 0);
    if (weightSum < 99 || weightSum > 101) {
      console.warn(`[grade] ⚠ Category weights sum to ${weightSum.toFixed(1)}, expected ~100. Proceeding anyway.`);
    }
  }

  // Always use POSITIONAL mapping: Nth AI result → Nth student in chunk.
  // AI often ignores studentIndex instructions (returns 0-based for every chunk).
  // Positional mapping is reliable because the prompt says "EXACT order they appear above."
  const results = parsed.map((item, idx) => {
    let score = parseFloat(item.score);
    if (isNaN(score) || score < 0) score = 0;

    // ── Percentage-weighted composite if criterion_scores present and weights provided ──
    // Algorithm: sum(catScore / catMaxPts * catWeightPct / 100) * maxScore
    let usedWeighting = false;
    if (categoryWeights && item.criterion_scores && typeof item.criterion_scores === 'object') {
      const catScores = item.criterion_scores;
      const entries = Object.entries(catScores);
      let weightedFraction = 0;
      let validCount = 0;
      for (const [category, catScore] of entries) {
        const raw = parseFloat(catScore);
        if (isNaN(raw) || raw < 0) continue;
        const weightPct = categoryWeights[category];
        if (weightPct == null) continue; // skip categories without a weight
        const catMax = (categoryMaxPoints && categoryMaxPoints[category]) || 10;
        weightedFraction += (raw / catMax) * (weightPct / 100);
        validCount++;
      }
      if (validCount > 0) {
        score = weightedFraction * maxScore;
        usedWeighting = true;
        console.log(`[grade] pct-weighted: weightedFraction=${weightedFraction.toFixed(4)} maxScore=${maxScore} → ${score.toFixed(2)}`);
      }
    }
    // ── End weighted composite ──

    // Descale: AI was prompted with virtualMax, convert back to real maxScore
    // Only descale if we did NOT use percentage weighting (which already produces real-scale score)
    if (!usedWeighting) {
      score = score / _parseFactor;  // descale from virtual-10 to real maxScore
    }
    if (score > maxScore) score = maxScore;
    // Snap to appropriate granularity
    score = snapScore(score, maxScore);
    console.log('[grade] batch ai_raw=' + item.score + ' factor=' + _parseFactor.toFixed(2) + ' final=' + score + ' (max=' + maxScore + ')');
    const rawFeedback = Array.isArray(item.feedback) ? item.feedback.join('\n') : (item.feedback || '');
    const feedback = String(rawFeedback).trim() || 'Graded by AI.';

    // Use the actual student index from the chunk, not the AI's studentIndex
    const studentIndex = idx < students.length
      ? (students[idx].index !== undefined ? students[idx].index : idx)
      : (item.studentIndex !== undefined ? item.studentIndex : idx);

    return { studentIndex, score, feedback };
  });

  if (results.length !== students.length) {
    console.warn(`Warning: Expected ${students.length} results, got ${results.length}`);
  }

  // Log if AI indices didn't match expected (for debugging)
  const aiIndices = parsed.map(item => item.studentIndex);
  const mismatch = aiIndices.some((ai, i) => i < students.length && ai !== students[i].index);
  if (mismatch) {
    console.warn(`AI indices [${aiIndices.join(',')}] remapped to chunk indices [${results.map(r => r.studentIndex).join(',')}]`);
  }

  // Truncate to exactly the expected count — extra AI results have unreliable
  // studentIndex values that can create phantom entries in the batch log.
  if (results.length > students.length) {
    console.warn(`Truncating ${results.length - students.length} extra result(s) beyond ${students.length} students`);
    return results.slice(0, students.length);
  }

  return results;
}

/**
 * Detect outliers using 2σ (2 standard deviations) threshold.
 *
 * Previous 1σ threshold flagged ~32% of students in a normal distribution,
 * causing the second-pass review to regress accurate scores toward the mean.
 * 2σ flags only ~5%, catching genuine grading errors without over-correcting.
 *
 * @param {Array} results - Array of grading results with score
 * @returns {Object} - { mean, stdDev, outliers: [{ studentIndex, score, deviation }] }
 */
export function detectOutliers(results) {
  if (!results || results.length === 0) {
    return { mean: 0, stdDev: 0, outliers: [] };
  }

  // Calculate mean
  const scores = results.map(r => r.score);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  // Calculate standard deviation
  const squaredDiffs = scores.map(score => Math.pow(score - mean, 2));
  const variance = squaredDiffs.reduce((sum, sq) => sum + sq, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Find outliers beyond 2σ — flags only ~5% of students
  const threshold = stdDev * 2;
  const outlierResults = results
    .map((result, idx) => {
      const deviation = Math.abs(result.score - mean);
      return {
        ...result,
        deviation: deviation / (stdDev || 1), // store as σ-units for logging
        isOutlier: deviation > threshold,
        originalIndex: idx,
      };
    })
    .filter(r => r.isOutlier)
    .sort((a, b) => b.deviation - a.deviation);

  return {
    mean: parseFloat(mean.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    outliers: outlierResults.map(r => ({
      studentIndex: r.studentIndex,
      score: r.score,
      deviation: parseFloat(r.deviation.toFixed(2)),
    })),
  };
}

/**
 * Build a focused re-grading prompt for outlier students
 * Includes batch statistics, peer comparison examples, and original feedback so the AI can recalibrate.
 * @param {Object} rubric - Rubric object
 * @param {Array} outlierStudents - Array of { index, name, response, originalScore, originalFeedback }
 * @param {Object} anchors - Scoring anchors from generateScoringAnchors()
 * @param {Object} stats - { mean, stdDev } from the batch
 * @param {Number} maxScore - Maximum possible score
 * @param {Number} maxScore - Maximum possible score
 * @param {Array} allResults - Full batch results for peer comparison (optional)
 * @returns {String} - Complete prompt for outlier re-grading
 */
export function buildOutlierReviewPrompt(rubric, outlierStudents, anchors, stats, maxScore, allResults = []) {
  // Separate custom instructions from essayPrompt if they were appended
  let essayPrompt = rubric.essayPrompt || '(No prompt provided)';
  let customInstructions = rubric.customInstructions || '';
  const instrMatch = essayPrompt.match(/\n\nADDITIONAL GRADING INSTRUCTIONS:\n([\s\S]+)$/);
  if (instrMatch) {
    if (!customInstructions) customInstructions = instrMatch[1].trim();
    essayPrompt = essayPrompt.replace(/\n\nADDITIONAL GRADING INSTRUCTIONS:\n[\s\S]+$/, '').trim();
  }

  const { calibration, overrideInstructions } = extractCustomInstructions(customInstructions);

  let prompt = `You are an expert grading assistant performing a SECOND-PASS REVIEW of flagged student responses. Output: JSON array only.

These students received scores that deviated more than 1 standard deviation from the batch mean. Your job is to re-evaluate each one carefully by comparing against the rubric AND against similarly-scored peers to ensure the score is accurate and consistent.

BATCH CONTEXT:
- Batch mean score: ${stats.mean}/${maxScore}
- Standard deviation: ${stats.stdDev}
- Total students in batch: ${stats.totalStudents}

${overrideInstructions ? `INSTRUCTOR OVERRIDE INSTRUCTIONS (you MUST follow these \u2014 they take absolute precedence):\n${overrideInstructions}\n\n` : ''}GRADING PHILOSOPHY:
${GRADING_PHILOSOPHY}

MAX SCORE: ${maxScore}

QUESTION/PROMPT:
${essayPrompt}
`;

  // Add checklist items if present
  if (rubric.checklistItems && rubric.checklistItems.length > 0) {
    prompt += '\nGRADING CHECKLIST:\n';
    for (const item of rubric.checklistItems) {
      if (item.category) prompt += `- ${item.category} (${item.points} points)\n`;
      if (item.items) {
        for (const sub of item.items) {
          prompt += `  - ${sub}\n`;
        }
      }
    }
  }

  // Add rubric targets if present
  if (rubric.rubricItems && rubric.rubricItems.length > 0) {
    prompt += '\nKEY CONCEPTS TO ADDRESS:\n';
    for (const item of rubric.rubricItems) {
      if (item.category) prompt += `${item.category}:\n`;
      if (item.items) {
        for (const sub of item.items) {
          prompt += `  - ${sub}\n`;
        }
      }
    }
  }

  // Add model response if present
  if (rubric.modelText) {
    prompt += `\nMODEL RESPONSE (for reference):\n${rubric.modelText}\n`;
  }

  // Add scoring anchors
  prompt += `
SCORING ANCHORS:
- Excellent (${anchors.excellent.score}/${maxScore}): ${anchors.excellent.description}
- Adequate (${anchors.adequate.score}/${maxScore}): ${anchors.adequate.description}
- Below Average (${anchors.belowAverage.score}/${maxScore}): ${anchors.belowAverage.description}
- Minimal (${anchors.minimal.score}/${maxScore}): ${anchors.minimal.description}
`;

  if (calibration) {
    prompt += `\nSCORING CALIBRATION EXAMPLES (use to calibrate score levels only \u2014 grade against rubric criteria and SCORING SCALE above, not these examples):\n${calibration}\n`;
  }

  // Check if any outlier students have per-student prompts (jittered values)
  const hasPerStudentPrompts = outlierStudents.some(s => s.prompt && s.prompt !== essayPrompt);
  if (hasPerStudentPrompts) {
    prompt += `\nIMPORTANT: Each student received the same question structure but with DIFFERENT randomized numeric values. Each student's specific question is shown below their header. Grade each student against THEIR specific values.\n`;
  }

  // Add each outlier student with peer comparison context
  prompt += '\nSTUDENTS TO RE-EVALUATE:\n\n';
  for (const student of outlierStudents) {
    prompt += `--- Student ${student.index}: ${student.name} ---\n`;
    if (hasPerStudentPrompts && student.prompt) {
      prompt += `THEIR QUESTION: ${student.prompt}\n`;
    }
    prompt += `ORIGINAL SCORE: ${student.originalScore}/${maxScore}\n`;
    prompt += `ORIGINAL FEEDBACK: ${student.originalFeedback}\n`;
    prompt += `RESPONSE:\n${student.response || '(No response submitted)'}\n`;

    // Find 2 peers with similar scores for comparison (exclude this student)
    if (allResults.length > 0) {
      const peers = allResults
        .filter(r => r.studentIndex !== student.index && Math.abs(r.score - student.originalScore) <= 1)
        .sort((a, b) => Math.abs(a.score - student.originalScore) - Math.abs(b.score - student.originalScore))
        .slice(0, 2);
      if (peers.length > 0) {
        prompt += `\nPEER COMPARISON (students who scored similarly — verify consistency):\n`;
        for (const peer of peers) {
          const preview = (peer.response || '(no response)').slice(0, 300);
          const ellipsis = (peer.response?.length || 0) > 300 ? '...' : '';
          prompt += `  [Score ${peer.score}/${maxScore}]: ${preview}${ellipsis}\n`;
        }
      }
    }
    prompt += '\n';
  }

  prompt += `
INSTRUCTIONS:
- Re-read each student's response carefully
- Compare against the rubric, scoring anchors, and the batch mean (${stats.mean})
- If the original score seems correct, return the SAME score
- If the original score was too high or too low, return an ADJUSTED score
- Provide updated feedback explaining your reasoning

RESPONSE FORMAT:
You MUST respond with a valid JSON array ONLY. No markdown, no code fences, no explanation.

[
  {
    "studentIndex": <original student index>,
    "score": <${scoreFormatHint(maxScore)}>
    "feedback": "<Use the student's first name from their header. For each rubric criterion, write one section using this structure: (1) state the criterion name, (2) write 'You said ...' quoting or paraphrasing what the student said about that criterion, (3) explain whether what they said was correct, incorrect, or incomplete — and what they would need to add for full credit. If the student's statements conflict with each other, note gently: 'Note: this seems inconsistent with your earlier statement that...'. Use \\n between each section. Write like a high school math teacher talking directly to the student. No em dashes. Short and clear.",
    "adjusted": <true if score changed, false if kept same>
  }
]

CRITICAL: Return results for ALL ${outlierStudents.length} student(s) in the array.`;


  return prompt;
}

/**
 * Split students into chunks with anchor bridging
 * @param {Array} students - Array of student objects
 * @param {Number} chunkSize - Max students per chunk (default 20)
 * @returns {Array} - Array of chunk objects { students, needsAnchors, chunkIndex }
 */
export function chunkStudents(students, chunkSize = 20) {
  if (!students || students.length === 0) {
    return [];
  }

  if (students.length <= chunkSize) {
    return [{
      students,
      needsAnchors: false,
      chunkIndex: 0,
    }];
  }

  const chunks = [];
  for (let i = 0; i < students.length; i += chunkSize) {
    const chunk = students.slice(i, i + chunkSize);
    chunks.push({
      students: chunk,
      needsAnchors: i > 0, // First chunk doesn't need anchors, subsequent ones do
      chunkIndex: chunks.length,
    });
  }

  return chunks;
}

/**
 * Grade a single chunk of students (placeholder for integration with providers)
 * This will be called by server.js with the actual AI provider integration
 * @param {Object} chunk - Chunk object from chunkStudents()
 * @param {Object} rubric - Rubric object
 * @param {Object} anchors - Scoring anchors
 * @param {Array} bridgeResponses - Optional: anchor responses from previous chunk
 * @returns {Promise<Array>} - Array of grading results
 */
export async function gradeChunk(chunk, rubric, anchors, bridgeResponses = null) {
  // This is a placeholder - actual implementation will be in server.js
  // where we have access to provider adapters and API calls
  throw new Error('gradeChunk must be called from server context with provider integration');
}

/**
 * Merge results from multiple chunks into a single array
 * @param {Array} chunkResults - Array of result arrays from gradeChunk()
 * @returns {Array} - Combined and sorted results by studentIndex
 */
export function mergeResults(chunkResults) {
  if (!chunkResults || chunkResults.length === 0) {
    return [];
  }

  // Flatten all chunk results
  const allResults = chunkResults.flat();

  // Sort by studentIndex to preserve original order
  allResults.sort((a, b) => a.studentIndex - b.studentIndex);

  return allResults;
}

/**
 * Build a compact consistency sweep prompt (single API call).
 * Shows all students in a table with scores + excerpts, asks AI to flag misaligned scores.
 * @param {Array} results - Merged grading results (studentIndex, score, feedback)
 * @param {Array} students - Original student array (index, name, response)
 * @param {Object} anchors - Scoring anchors
 * @param {Object} chunkMap - Map of studentIndex → chunkIndex for cross-chunk identification
 * @param {number} maxScore - Maximum possible score
 * @returns {string} - Prompt for the AI
 */
export function buildCompactSweepPrompt(results, students, anchors, chunkMap, maxScore) {
  let prompt = `CROSS-CHUNK CONSISTENCY REVIEW

You previously graded these students across ${new Set(Object.values(chunkMap)).size} separate batches. Different batches may have drifted in scoring standards. Review ALL scores for cross-batch consistency.

SCORING ANCHORS:
- Excellent (${anchors.excellent.score}/${maxScore}): ${anchors.excellent.description}
- Adequate (${anchors.adequate.score}/${maxScore}): ${anchors.adequate.description}
- Below Average (${anchors.belowAverage.score}/${maxScore}): ${anchors.belowAverage.description}
- Minimal (${anchors.minimal.score}/${maxScore}): ${anchors.minimal.description}

STUDENT SCORES:
`;

  // Build compact table
  for (const r of results) {
    const student = students.find(s => s.index === r.studentIndex);
    const name = student?.name || `Student ${r.studentIndex}`;
    const chunk = chunkMap[r.studentIndex] ?? '?';
    const excerpt = (student?.response || '(No response)').substring(0, 150).replace(/\n/g, ' ');
    prompt += `[#${r.studentIndex}] ${name} | Score: ${r.score}/${maxScore} | Chunk: ${chunk + 1} | "${excerpt}..."\n`;
  }

  prompt += `
TASK: Identify any students whose score seems inconsistent relative to peers with similar response quality. Focus especially on students near chunk boundaries or where similar-quality responses received different scores in different chunks.

RESPONSE FORMAT:
Return a JSON array of adjustments. Only include students that need a score change. Return [] if all scores look consistent.

[
  {
    "studentIndex": <number>,
    "currentScore": <number>,
    "suggestedScore": <number, half-points allowed e.g. 7.5>,
    "reason": "<brief explanation of why this score should change>"
  }
]

CRITICAL: Only flag genuine inconsistencies. Do NOT adjust scores just to create a smoother distribution. Be conservative — only change scores where a student's response quality clearly doesn't match their score relative to peers.`;

  return prompt;
}

/**
 * Build pairwise band comparison prompts (multiple API calls).
 * Groups students by score band, sends full responses for each cross-chunk band.
 * @param {Array} results - Merged grading results
 * @param {Array} students - Original student array
 * @param {Object} anchors - Scoring anchors
 * @param {Object} chunkMap - Map of studentIndex → chunkIndex
 * @param {number} maxScore - Maximum possible score
 * @returns {Array} - Array of { band, prompt, studentIndices } objects (only bands with cross-chunk students)
 */
/**
 * Build a grading prompt for a single student (used by /api/chat grader mode).
 * Simplified version of buildBatchPrompt for one student at a time.
 * @param {Object} rubric - Rubric object with essayPrompt, checklistItems, rubricItems, modelText, maxScore
 * @param {string} studentWork - The student's response text
 * @param {string} instructions - Additional grading instructions or message from the user
 * @returns {string} - Complete prompt for AI grading
 */
export function buildSingleGradePrompt(rubric, studentWork, instructions, constants = null) {
  const maxScore = rubric.maxScore || '10';
  const { virtualMax } = getScaleInfo(maxScore);
  const _sScoreHint = scoreFormatHint(virtualMax);
  const essayPrompt = rubric.essayPrompt || '(No prompt provided)';
  const customInstructions = rubric.customInstructions || '';
  const { calibration, overrideInstructions } = extractCustomInstructions(customInstructions);
  const _gradingPhilosophy = constants?.gradingPhilosophy ?? GRADING_PHILOSOPHY;

  // Pre-compute effective points for weighted modes — AI sees only adjusted totals, never raw weights
  const weightMode = rubric.weightMode;
  function effectivePoints(item) {
    const max = parseFloat(maxScore) || 10;
    if (weightMode === 'category' && item.categoryWeight != null) {
      const base = item.points > 0 ? item.points : max;
      return Math.round(base * (item.categoryWeight / 100) * 10) / 10;
    }
    if (weightMode === 'criterion' && item.criterionWeight != null) {
      const base = item.points > 0 ? item.points : max;
      return Math.round(base * (item.criterionWeight / 100) * 10) / 10;
    }
    return item.points > 0 ? item.points : max;
  }

  let prompt = `You are an expert grading assistant. Grade this student's work against the provided rubric. Output: JSON object only.

${overrideInstructions ? `INSTRUCTOR OVERRIDE INSTRUCTIONS (you MUST follow these \u2014 they take absolute precedence):\n${overrideInstructions}\n\n` : ''}GRADING PHILOSOPHY:
${_gradingPhilosophy}

MAX SCORE: ${virtualMax}

QUESTION/PROMPT:
${essayPrompt}
`;

  // Add checklist items if present — flatten requirements as numbered items
  if (rubric.checklistItems && rubric.checklistItems.length > 0) {
    prompt += '\nGRADING REQUIREMENTS (write feedback for EACH numbered item):\n';
    let reqNum = 1;
    for (const item of rubric.checklistItems) {
      if (item.items) {
        for (const sub of item.items) {
          prompt += `${reqNum}. [${item.category || 'General'}] ${sub}\n`;
          reqNum++;
        }
      }
    }
    prompt += `\nSCORING BY CATEGORY (score each 0-10, server applies weights automatically):\n`;
    for (const item of rubric.checklistItems) {
      if (item.category) prompt += `- ${item.category}: 10 points\n`;
    }
    prompt += `\nPARTIAL CREDIT RULE: When a requirement is addressed conceptually but lacks specific values, formulas, or concrete evidence, award 40-60% of that category's points. Award 20-40% if only loosely related; 60-80% if substantially complete but missing one key element. Evaluate each requirement INDEPENDENTLY - do not let strength on one compensate for weakness on another.

CONCEPTUAL THOROUGHNESS RULE: When a student demonstrates genuine understanding of the underlying concept — correct reasoning, valid approach, or sound logic — but has execution flaws (arithmetic errors, missing units, informal notation, incomplete steps), award 60-80% of that category's points. Concept mastery with flawed execution always scores higher than rote correctness without understanding. A student who explains WHY a method works but makes a calculation error deserves more credit than one who copies a formula without understanding it.\n`;
  }

  // Add category weight hints when percentage weights are provided
  if (rubric.categoryWeights && typeof rubric.categoryWeights === 'object') {
    const weightEntries = Object.entries(rubric.categoryWeights);
    if (weightEntries.length > 0) {
      prompt += `\nCATEGORY WEIGHTS (percentage of total grade):\n`;
      for (const [cat, pct] of weightEntries) {
        prompt += `- ${cat}: ${pct}% of total grade\n`;
      }
      prompt += `Grade each category on its own merits. These weights will be applied automatically.\n`;
    }
  }

  // Add rubric targets if present
  if (rubric.rubricItems && rubric.rubricItems.length > 0) {
    prompt += '\nKEY CONCEPTS TO ADDRESS:\n';
    for (const item of rubric.rubricItems) {
      if (item.category) prompt += `${item.category}:\n`;
      if (item.items) {
        for (const sub of item.items) {
          prompt += `  - ${sub}\n`;
        }
      }
    }
  }

  // Add model response if present
  if (rubric.modelText) {
    prompt += `\nMODEL RESPONSE (for reference):\n${rubric.modelText}\n`;
  }

  // Tier 5: Scoring scale + calibration (before student work)
  prompt += '\n' + getScoringScaleString(constants?.scoringScaleDescriptors) + '\n';
  if (calibration) {
    prompt += `\nSCORING CALIBRATION EXAMPLES (use to calibrate score levels only \u2014 grade against rubric criteria and SCORING SCALE above, not these examples):\n${calibration}\n`;
  }

  // Tier 6: Student work
  prompt += `\nSTUDENT WORK:\n${studentWork || '(No response submitted)'}\n`;

  if (instructions) {
    prompt += `\nADDITIONAL INSTRUCTIONS:\n${instructions}\n`;
  }

  // Build Chain-of-Rubric criterion names for single prompt
  const _sCorItems = (rubric.checklistItems || []).map(c => ({
    name: c.category.replace(/\s*\(\d+\s*pts?\)/i, '').trim(),
    pts: effectivePoints(c)
  }));
  const _sCorNames = _sCorItems.map(c => c.name);
  const _sCorField = _sCorItems.length > 0
    ? `  "criterion_scores": {${_sCorItems.map(({name, pts}) => `"${name}": <0-${pts} pts>`).join(', ')}},\n`
    : '';
  // Build dynamic feedback example from actual requirements for single prompt
  const _sAllReqs = [];
  for (const item of (rubric.checklistItems || [])) {
    if (item.items) {
      for (const sub of item.items) {
        _sAllReqs.push(sub);
      }
    }
  }
  let _sFeedbackExample = '';
  if (_sAllReqs.length > 0) {
    _sFeedbackExample = `\\n\\n**${_sAllReqs[0]}**\\n> You said: \\"[quote]\\"\\n\\n[Correct/Incorrect — WHY]\\n\\n*To improve: [suggestion]*`;
    if (_sAllReqs.length > 1) {
      _sFeedbackExample += `\\n\\n**${_sAllReqs[1]}**\\n> You did not address this.\\n\\n[What was expected]`;
    }
    for (let i = 2; i < _sAllReqs.length; i++) {
      _sFeedbackExample += `\\n\\n**${_sAllReqs[i]}**\\n> You said: ...\\n\\n...`;
    }
  }

  prompt += `
${_sCorNames.length > 0 ? 'GRADING PROCESS: Score each category independently using the PARTIAL CREDIT RULE, then sum for the final score.\n' : ''}
FEEDBACK FORMAT RULE: The feedback string must contain one section for EACH numbered requirement from GRADING REQUIREMENTS. Do NOT group by category. Each requirement gets its own bolded header. criterion_scores uses categories for scoring, but feedback MUST be per-requirement.

RESPONSE FORMAT:
Return ONLY valid JSON. No markdown code fences. No explanation text.

{
${_sCorField}  "score": <${_sScoreHint}>
  "feedback": "Hi [name],${_sFeedbackExample}"
}`;

  return prompt;
}

/**
 * Parse a single grade AI response into { score, feedback }.
 * Handles JSON extraction, code fences, thinking blocks, and score clamping.
 * @param {string} aiText - Raw AI response text
 * @param {number} maxScore - Maximum possible score
 * @returns {{ score: number, feedback: string }}
 */
export function parseSingleGradeResponse(aiText, maxScore, categoryWeights = null, categoryMaxPoints = null) {
  let text = aiText.trim();

  // Strip <think>...</think> reasoning blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                     text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Attempt 1: Direct JSON parse
  try {
    const parsed = JSON.parse(text);
    return clampSingleResult(parsed, maxScore, categoryWeights, categoryMaxPoints);
  } catch { /* continue */ }

  // Attempt 2: Fix LaTeX backslashes then parse
  try {
    const fixed = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    const parsed = JSON.parse(fixed);
    return clampSingleResult(parsed, maxScore, categoryWeights, categoryMaxPoints);
  } catch { /* continue */ }

  // Attempt 3: Extract JSON object from surrounding text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      return clampSingleResult(parsed, maxScore, categoryWeights, categoryMaxPoints);
    } catch { /* continue */ }
    try {
      const fixed = objMatch[0].replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      const parsed = JSON.parse(fixed);
      return clampSingleResult(parsed, maxScore, categoryWeights, categoryMaxPoints);
    } catch { /* continue */ }
  }

  // Attempt 4: Regex extraction
  const regexMatch = text.match(/"score"\s*:\s*(\d+\.?\d*)\s*,\s*"feedback"\s*:\s*"([^"]*)"/);
  if (regexMatch) {
    return clampSingleResult({ score: parseFloat(regexMatch[1]), feedback: regexMatch[2] }, maxScore, categoryWeights, categoryMaxPoints);
  }

  return { score: 0, feedback: 'Error parsing AI response. Please try again.' };
}

function clampSingleResult(parsed, maxScore, categoryWeights = null, categoryMaxPoints = null) {
  let score = parseFloat(parsed.score);
  if (isNaN(score) || score < 0) score = 0;

  // Validate that percentage weights sum to ~100 (allow 99-101 for floating point)
  if (categoryWeights) {
    const weightSum = Object.values(categoryWeights).reduce((a, b) => a + b, 0);
    if (weightSum < 99 || weightSum > 101) {
      console.warn(`[grade] ⚠ Category weights sum to ${weightSum.toFixed(1)}, expected ~100. Proceeding anyway.`);
    }
  }

  // ── Percentage-weighted composite if criterion_scores present and weights provided ──
  // Algorithm: sum(catScore / catMaxPts * catWeightPct / 100) * maxScore
  let usedWeighting = false;
  if (categoryWeights && parsed.criterion_scores && typeof parsed.criterion_scores === 'object') {
    let weightedFraction = 0;
    let validCount = 0;
    for (const [category, catScore] of Object.entries(parsed.criterion_scores)) {
      const raw = parseFloat(catScore);
      if (isNaN(raw) || raw < 0) continue;
      const weightPct = categoryWeights[category];
      if (weightPct == null) continue; // skip categories without a weight
      const catMax = (categoryMaxPoints && categoryMaxPoints[category]) || 10; // fallback to virtual max
      weightedFraction += (raw / catMax) * (weightPct / 100);
      validCount++;
    }
    if (validCount > 0) {
      score = weightedFraction * maxScore;
      usedWeighting = true;
      console.log(`[grade] single pct-weighted: weightedFraction=${weightedFraction.toFixed(4)} maxScore=${maxScore} → ${score.toFixed(2)}`);
    }
  }
  // ── End weighted composite ──

  // Descale: AI was prompted with virtualMax, convert back to real maxScore
  // Only descale if we did NOT use percentage weighting (which already produces real-scale score)
  const { factor: _cf } = getScaleInfo(maxScore);
  if (!usedWeighting) {
    score = score / _cf;  // descale from virtual-10 to real maxScore
  }
  if (score > maxScore) score = maxScore;
  score = snapScore(score, maxScore);
  console.log('[grade] single ai_raw=' + parsed.score + ' factor=' + _cf.toFixed(2) + ' final=' + score + ' (max=' + maxScore + ')');
  const feedback = (parsed.feedback || '').trim() || 'Graded by AI.';
  return { score, feedback };
}

export function buildPairwiseSweepPrompts(results, students, anchors, chunkMap, maxScore) {
  // Define score bands based on anchors
  const bands = [
    { label: 'High', min: anchors.excellent.score - 1, max: maxScore, key: 'high' },
    { label: 'Upper-Mid', min: anchors.adequate.score, max: anchors.excellent.score - 1.5, key: 'upper-mid' },
    { label: 'Lower-Mid', min: anchors.belowAverage.score, max: anchors.adequate.score - 0.5, key: 'lower-mid' },
    { label: 'Low', min: 0, max: anchors.belowAverage.score - 0.5, key: 'low' },
  ];

  const prompts = [];

  for (const band of bands) {
    // Find students in this band
    const bandResults = results.filter(r => r.score >= band.min && r.score <= band.max);
    if (bandResults.length < 2) continue;

    // Check if this band has students from multiple chunks
    const chunkIds = new Set(bandResults.map(r => chunkMap[r.studentIndex]));
    if (chunkIds.size < 2) continue; // All from same chunk — no cross-chunk comparison needed

    let prompt = `PAIRWISE CONSISTENCY CHECK — ${band.label} Score Band (${band.min}–${band.max}/${maxScore})

These students all scored in the ${band.label.toLowerCase()} range but were graded in DIFFERENT batches. Review their full responses and determine if the scores are internally consistent.

SCORING ANCHORS:
- Excellent (${anchors.excellent.score}/${maxScore}): ${anchors.excellent.description}
- Adequate (${anchors.adequate.score}/${maxScore}): ${anchors.adequate.description}
- Below Average (${anchors.belowAverage.score}/${maxScore}): ${anchors.belowAverage.description}
- Minimal (${anchors.minimal.score}/${maxScore}): ${anchors.minimal.description}

STUDENTS IN THIS BAND:
`;

    for (const r of bandResults) {
      const student = students.find(s => s.index === r.studentIndex);
      const name = student?.name || `Student ${r.studentIndex}`;
      const chunk = chunkMap[r.studentIndex] ?? '?';
      prompt += `\n--- [#${r.studentIndex}] ${name} | Score: ${r.score}/${maxScore} | Chunk: ${chunk + 1} ---\n`;
      prompt += `${student?.response || '(No response submitted)'}\n`;
    }

    prompt += `
TASK: Are these scores consistent with each other? If two students gave responses of similar quality but got different scores (because they were in different batches), flag them for adjustment.

RESPONSE FORMAT:
Return a JSON array of adjustments. Only include students that need a score change. Return [] if all scores look consistent within this band.

[
  {
    "studentIndex": <number>,
    "currentScore": <number>,
    "suggestedScore": <number, half-points allowed e.g. 7.5>,
    "reason": "<brief explanation>"
  }
]

Be conservative — only adjust genuine cross-chunk inconsistencies.`;

    prompts.push({
      band: band.key,
      label: band.label,
      prompt,
      studentIndices: bandResults.map(r => r.studentIndex),
    });
  }

  return prompts;
}
