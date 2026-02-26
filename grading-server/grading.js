/**
 * Core grading logic for O.G.R.E Grading Server
 * Handles batch grading with scoring anchors, chunking, and outlier detection
 */

import { GRADING_PHILOSOPHY } from './grading-constants.js';

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
  const excellentScore = roundScore(maxScore * 0.9); // 90% - near perfect
  const adequateScore = roundScore(maxScore * 0.65); // 65% - solid understanding
  const belowAverageScore = roundScore(maxScore * 0.5); // 50% - partial understanding
  const minimalScore = roundScore(maxScore * 0.3); // 30% - bare minimum

  // Build descriptions based on rubric criteria
  let excellentDesc = 'Demonstrates comprehensive understanding with all key concepts addressed clearly.';
  let adequateDesc = 'Shows solid grasp of main concepts with minor gaps or unclear explanations.';
  let belowAverageDesc = 'Shows partial understanding but missing key concepts, formulas, or depth.';
  let minimalDesc = 'Addresses some basic concepts but lacks depth or contains significant errors.';

  // Enhance descriptions with rubric-specific criteria if available
  if (rubric.checklistItems && rubric.checklistItems.length > 0) {
    const categories = rubric.checklistItems.map(item => item.category).filter(Boolean);
    if (categories.length > 0) {
      excellentDesc += ` Covers: ${categories.join(', ')}.`;
      adequateDesc += ` Partially covers: ${categories.slice(0, 2).join(', ')}.`;
      belowAverageDesc += ` Weak coverage of: ${categories.slice(0, 1).join(', ')}.`;
      minimalDesc += ` Minimal coverage of: ${categories[0] || 'key concepts'}.`;
    }
  }

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
export function buildBatchPrompt(rubric, students, anchors, bridgeResponses = null) {
  const maxScore = rubric.maxScore || '10';
  const { virtualMax, factor: scoreFactor } = getScaleInfo(maxScore);
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

   let prompt = `You are an expert grading assistant. Grade ALL students in this batch against the provided rubric.

GRADING PHILOSOPHY:
${GRADING_PHILOSOPHY}

MAX SCORE: ${virtualMax}

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

  // Add scoring anchors for calibration
  prompt += `
SCORING ANCHORS (use these as calibration references):
- Excellent (${Math.round(anchors.excellent.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.excellent.description}
- Adequate (${Math.round(anchors.adequate.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.adequate.description}
- Below Average (${Math.round(anchors.belowAverage.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.belowAverage.description}
- Minimal (${Math.round(anchors.minimal.score * scoreFactor * 10) / 10}/${virtualMax}): ${anchors.minimal.description}

Compare each student response to these anchors to ensure consistency.

SCORING SCALE (use integers 0-10 — server converts to actual points):
0  – No attempt, blank, or completely off-topic
1  – Minimal: barely related to the question, almost no understanding shown
2  – Very weak: major misconceptions, very few correct elements
3  – Weak: some relevant ideas but mostly incomplete or incorrect
4  – Below average: partially correct, significant gaps or errors
5  – Half credit: meets some requirements but misses key points
6  – Adequate: meets basic requirements with noticeable gaps
7  – Good: solid understanding, minor errors or omissions
8  – Very good: strong understanding, only small gaps
9  – Excellent: comprehensive, accurate, near-perfect
10 – Perfect: complete, thorough, and accurate

Be precise — 7 and 8 represent meaningfully different quality levels.
`;

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

  // Add all students to the prompt
  prompt += '\nSTUDENTS TO GRADE:\n\n';
  for (const student of students) {
    prompt += `--- Student ${student.index}: ${student.name} ---\n`;
    prompt += `${student.response || '(No response submitted)'}\n\n`;
  }

  // Response format instructions — use actual student indices so AI doesn't guess
  const firstIdx = students[0]?.index ?? 0;
  const secondIdx = students.length > 1 ? (students[1]?.index ?? firstIdx + 1) : firstIdx + 1;
  prompt += `
RESPONSE FORMAT:
You MUST respond with a valid JSON array ONLY. No markdown, no code fences, no explanation.
Return one object per student using the EXACT studentIndex shown above each response.

[
  {
    "studentIndex": ${firstIdx},
    "score": <${_scoreHint}>
    "feedback": "<constructive feedback string, wrap math in backticks for MathJax e.g. \`\\\\sigma / \\\\sqrt{n}\`>"
  },
  {
    "studentIndex": ${secondIdx},
    "score": <${_scoreHint}>
    "feedback": "<feedback>"
  }
  // ... continue for all ${students.length} students
]

CRITICAL: Return results for ALL ${students.length} students. Use the studentIndex from each "--- Student N:" header.`;

  // Add custom instructions as a prominent override section at the end
  if (customInstructions) {
    prompt += `

IMPORTANT — INSTRUCTOR OVERRIDE INSTRUCTIONS (you MUST follow these):
${customInstructions}`;
  }

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
export function parseBatchResponse(aiText, students, maxScore) {
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
  if (parsed) return validateBatchResults(parsed, students, maxScore);

  // Attempt 2: Extract JSON array from surrounding text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    parsed = tryParse(arrayMatch[0]);
    if (parsed) return validateBatchResults(parsed, students, maxScore);
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
    return validateBatchResults(regexResults, students, maxScore);
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
    return validateBatchResults(lineResults, students, maxScore);
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

function validateBatchResults(parsed, students, maxScore) {
  // Build expected index set for validation
  const expectedIndices = new Set(students.map(s => s.index));
  const { factor: _parseFactor } = getScaleInfo(maxScore);

  // Always use POSITIONAL mapping: Nth AI result → Nth student in chunk.
  // AI often ignores studentIndex instructions (returns 0-based for every chunk).
  // Positional mapping is reliable because the prompt says "EXACT order they appear above."
  const results = parsed.map((item, idx) => {
    let score = parseFloat(item.score);
    if (isNaN(score) || score < 0) score = 0;
    // Descale: AI was prompted with virtualMax, convert back to real maxScore
    score = score / _parseFactor;  // always descale from virtual-10 to real maxScore
    if (score > maxScore) score = maxScore;
    // Snap to appropriate granularity
    score = snapScore(score, maxScore);
    console.log('[grade] batch ai_raw=' + item.score + ' factor=' + _parseFactor.toFixed(2) + ' final=' + score + ' (max=' + maxScore + ')');
    const feedback = (item.feedback || '').trim() || 'Graded by AI.';

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

  return results;
}

/**
 * Detect outliers using 2σ (2 standard deviations) threshold
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

  // Find outliers beyond 2σ
  const threshold = 2 * stdDev;
  const outlierResults = results
    .map((result, idx) => {
      const deviation = Math.abs(result.score - mean);
      return {
        ...result,
        deviation,
        isOutlier: deviation > threshold,
        originalIndex: idx,
      };
    })
    .filter(r => r.isOutlier)
    .sort((a, b) => b.deviation - a.deviation) // Sort by most extreme first
    .slice(0, 5); // Limit to max 5 outliers

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
 * Includes batch statistics and original feedback so the AI can recalibrate
 * @param {Object} rubric - Rubric object
 * @param {Array} outlierStudents - Array of { index, name, response, originalScore, originalFeedback }
 * @param {Object} anchors - Scoring anchors from generateScoringAnchors()
 * @param {Object} stats - { mean, stdDev } from the batch
 * @param {Number} maxScore - Maximum possible score
 * @returns {String} - Complete prompt for outlier re-grading
 */
export function buildOutlierReviewPrompt(rubric, outlierStudents, anchors, stats, maxScore) {
  // Separate custom instructions from essayPrompt if they were appended
  let essayPrompt = rubric.essayPrompt || '(No prompt provided)';
  const instrMatch = essayPrompt.match(/\n\nADDITIONAL GRADING INSTRUCTIONS:\n([\s\S]+)$/);
  if (instrMatch) {
    essayPrompt = essayPrompt.replace(/\n\nADDITIONAL GRADING INSTRUCTIONS:\n[\s\S]+$/, '').trim();
  }

  let prompt = `You are an expert grading assistant performing a SECOND-PASS REVIEW of flagged student responses.

These students received scores that were statistical outliers (more than 2 standard deviations from the batch mean). Your job is to re-evaluate each one carefully and determine if the original score was correct or should be adjusted.

BATCH CONTEXT:
- Batch mean score: ${stats.mean}/${maxScore}
- Standard deviation: ${stats.stdDev}
- Total students in batch: ${stats.totalStudents}

GRADING PHILOSOPHY:
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

  // Add each outlier student with their original score for context
  prompt += '\nSTUDENTS TO RE-EVALUATE:\n\n';
  for (const student of outlierStudents) {
    prompt += `--- Student ${student.index}: ${student.name} ---\n`;
    prompt += `ORIGINAL SCORE: ${student.originalScore}/${maxScore}\n`;
    prompt += `ORIGINAL FEEDBACK: ${student.originalFeedback}\n`;
    prompt += `RESPONSE:\n${student.response || '(No response submitted)'}\n\n`;
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
    "feedback": "<updated feedback, wrap math in backticks for MathJax e.g. \`\\\\sigma / \\\\sqrt{n}\`>",
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
export function buildSingleGradePrompt(rubric, studentWork, instructions) {
  const maxScore = rubric.maxScore || '10';
  const { virtualMax } = getScaleInfo(maxScore);
  const _sScoreHint = scoreFormatHint(virtualMax);
  const essayPrompt = rubric.essayPrompt || '(No prompt provided)';

  let prompt = `You are an expert grading assistant. Grade this student's work against the provided rubric.

GRADING PHILOSOPHY:
${GRADING_PHILOSOPHY}

MAX SCORE: ${virtualMax}

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

  prompt += `
STUDENT WORK:
${studentWork || '(No response submitted)'}
`;

  if (instructions) {
    prompt += `
ADDITIONAL INSTRUCTIONS:
${instructions}
`;
  }

  prompt += `
SCORING SCALE (use integers 0-10 — server converts to actual points):
0  – No attempt, blank, or completely off-topic
1  – Minimal: barely related to the question, almost no understanding shown
2  – Very weak: major misconceptions, very few correct elements
3  – Weak: some relevant ideas but mostly incomplete or incorrect
4  – Below average: partially correct, significant gaps or errors
5  – Half credit: meets some requirements but misses key points
6  – Adequate: meets basic requirements with noticeable gaps
7  – Good: solid understanding, minor errors or omissions
8  – Very good: strong understanding, only small gaps
9  – Excellent: comprehensive, accurate, near-perfect
10 – Perfect: complete, thorough, and accurate

Be precise — 7 and 8 represent meaningfully different quality levels.

RESPONSE FORMAT:
Return ONLY valid JSON. No markdown code fences. No explanation text.

{
  "score": <${_sScoreHint}>
  "feedback": "<constructive feedback string, wrap math in backticks for MathJax e.g. \`\\\\sigma / \\\\sqrt{n}\`>"
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
export function parseSingleGradeResponse(aiText, maxScore) {
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
    return clampSingleResult(parsed, maxScore);
  } catch { /* continue */ }

  // Attempt 2: Fix LaTeX backslashes then parse
  try {
    const fixed = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    const parsed = JSON.parse(fixed);
    return clampSingleResult(parsed, maxScore);
  } catch { /* continue */ }

  // Attempt 3: Extract JSON object from surrounding text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      return clampSingleResult(parsed, maxScore);
    } catch { /* continue */ }
    try {
      const fixed = objMatch[0].replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      const parsed = JSON.parse(fixed);
      return clampSingleResult(parsed, maxScore);
    } catch { /* continue */ }
  }

  // Attempt 4: Regex extraction
  const regexMatch = text.match(/"score"\s*:\s*(\d+\.?\d*)\s*,\s*"feedback"\s*:\s*"([^"]*)"/);
  if (regexMatch) {
    return clampSingleResult({ score: parseFloat(regexMatch[1]), feedback: regexMatch[2] }, maxScore);
  }

  return { score: 0, feedback: 'Error parsing AI response. Please try again.' };
}

function clampSingleResult(parsed, maxScore) {
  let score = parseFloat(parsed.score);
  if (isNaN(score) || score < 0) score = 0;
  // Descale: AI was prompted with virtualMax, convert back to real maxScore
  const { factor: _cf } = getScaleInfo(maxScore);
  score = score / _cf;  // always descale from virtual-10 to real maxScore
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
