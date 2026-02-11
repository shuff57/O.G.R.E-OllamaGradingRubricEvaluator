/**
 * Core grading logic for O.G.R.E Grading Server
 * Handles batch grading with scoring anchors, chunking, and outlier detection
 */

/**
 * Generate scoring anchors (Excellent, Adequate, Minimal) for calibration
 * @param {Object} rubric - Rubric with essayPrompt, checklistItems, rubricItems, maxScore
 * @returns {Object} - { excellent, adequate, minimal } with score and description
 */
export function generateScoringAnchors(rubric) {
  const maxScore = parseFloat(rubric.maxScore) || 10;
  
  // Generate scores for each anchor level
  const excellentScore = Math.round(maxScore * 0.9); // 90% - near perfect
  const adequateScore = Math.round(maxScore * 0.65); // 65% - solid understanding
  const minimalScore = Math.round(maxScore * 0.3); // 30% - bare minimum

  // Build descriptions based on rubric criteria
  let excellentDesc = 'Demonstrates comprehensive understanding with all key concepts addressed clearly.';
  let adequateDesc = 'Shows solid grasp of main concepts with minor gaps or unclear explanations.';
  let minimalDesc = 'Addresses some basic concepts but lacks depth or contains significant errors.';

  // Enhance descriptions with rubric-specific criteria if available
  if (rubric.checklistItems && rubric.checklistItems.length > 0) {
    const categories = rubric.checklistItems.map(item => item.category).filter(Boolean);
    if (categories.length > 0) {
      excellentDesc += ` Covers: ${categories.join(', ')}.`;
      adequateDesc += ` Partially covers: ${categories.slice(0, 2).join(', ')}.`;
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
 * @returns {String} - Complete prompt for AI grading
 */
export function buildBatchPrompt(rubric, students, anchors) {
  const maxScore = rubric.maxScore || '10';
  
  let prompt = `You are an expert grading assistant. Grade ALL students in this batch against the provided rubric.

GRADING PHILOSOPHY:
- Grade generously for high school students showing understanding
- Award substantial partial credit for correct reasoning with minor errors
- Focus on mathematical thinking and effort, not perfect execution
- Any substantive attempt earns at least 40% of max score

MAX SCORE: ${maxScore}

QUESTION/PROMPT:
${rubric.essayPrompt || '(No prompt provided)'}
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
- Excellent (${anchors.excellent.score}/${maxScore}): ${anchors.excellent.description}
- Adequate (${anchors.adequate.score}/${maxScore}): ${anchors.adequate.description}
- Minimal (${anchors.minimal.score}/${maxScore}): ${anchors.minimal.description}

Compare each student response to these anchors to ensure consistency.
`;

  // Add all students to the prompt
  prompt += '\nSTUDENTS TO GRADE:\n\n';
  for (const student of students) {
    prompt += `--- Student ${student.index}: ${student.name} ---\n`;
    prompt += `${student.response || '(No response submitted)'}\n\n`;
  }

  // Response format instructions
  prompt += `
RESPONSE FORMAT:
You MUST respond with a valid JSON array ONLY. No markdown, no code fences, no explanation.
Return one object per student in the EXACT order they appear above.

[
  {
    "studentIndex": 0,
    "score": <integer 0 to ${maxScore}>,
    "feedback": "<constructive feedback string, use \\\\( ... \\\\) for LaTeX math>"
  },
  {
    "studentIndex": 1,
    "score": <integer>,
    "feedback": "<feedback>"
  }
  // ... continue for all ${students.length} students
]

CRITICAL: Return results for ALL ${students.length} students in the array.`;

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
  let cleanJson = aiText.trim();

  // Strip markdown code fences if present
  const jsonMatch = cleanJson.match(/```json\s*([\s\S]*?)\s*```/) ||
                    cleanJson.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleanJson = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleanJson);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    // Validate and clamp each result
    const results = parsed.map((item, idx) => {
      let score = parseInt(item.score, 10);
      
      // Clamp score to valid range
      if (isNaN(score) || score < 0) score = 0;
      if (score > maxScore) score = Math.round(maxScore);
      
      const feedback = (item.feedback || '').trim() || 'Graded by AI.';
      const studentIndex = item.studentIndex !== undefined ? item.studentIndex : idx;

      return {
        studentIndex,
        score,
        feedback,
      };
    });

    // Ensure we have results for all students
    if (results.length !== students.length) {
      console.warn(`Warning: Expected ${students.length} results, got ${results.length}`);
    }

    return results;
  } catch (error) {
    console.error('Failed to parse batch response:', error.message);
    
    // Fallback: return default results for all students
    return students.map((student, idx) => ({
      studentIndex: student.index !== undefined ? student.index : idx,
      score: 0,
      feedback: 'Error parsing AI response. Please try again.',
    }));
  }
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
