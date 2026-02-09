/**
 * batch-grader.js - Core batch grading engine
 *
 * Extracts students from MyOpenMath grading pages, grades them via AI,
 * and fills scores/feedback back into the page.
 *
 * Uses chrome.scripting.executeScript for DOM extraction/manipulation
 * and chrome.runtime.sendMessage for background proxy API calls.
 *
 * All functions are pure logic — no UI code.
 */

// ---------------------------------------------------------------------------
// DOM Selectors (from grade-selectors.md — not hardcoded, centralised here)
// ---------------------------------------------------------------------------
const SELECTORS = {
  studentSection: 'div[data-lastchange]',
  studentName: 'b',
  questionRegion: 'div[role="region"][aria-label^="Question"]',
  scoreInput: 'input[aria-label="Score"]',
  feedbackBox: 'div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]',
  feedbackHidden: 'input[type="hidden"][name^="fb-"]',
  fullCreditLink: 'a.fullcredlink',
};

// ---------------------------------------------------------------------------
// extractStudents(tabId) — extract all student data from the grading page
// ---------------------------------------------------------------------------
/**
 * Extract student names, scores, feedback status, and responses from the page.
 * @param {number} tabId - Chrome tab ID containing the grading page
 * @returns {Promise<Array<{index: number, name: string, currentScore: string, hasFeedback: boolean, response: string}>>}
 */
async function extractStudents(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const students = Array.from(document.querySelectorAll(sel.studentSection));
      return students.map((s, i) => {
        const region = s.querySelector(sel.questionRegion);
        // Part 1 content div is the second child of the region (index 1)
        const responseDiv = region?.children[1]?.children[1];
        const fbBox = s.querySelector(sel.feedbackBox);
        return {
          index: i,
          name: s.querySelector(sel.studentName)?.textContent.trim() || `Student ${i + 1}`,
          currentScore: s.querySelector(sel.scoreInput)?.value || '',
          hasFeedback: (fbBox?.textContent.trim().length || 0) > 0,
          response: responseDiv?.textContent.trim() || '',
        };
      });
    },
    args: [SELECTORS],
  });

  if (!results || !results[0] || results[0].result === undefined) {
    throw new Error('Failed to extract students. Is this a MyOpenMath grading page?');
  }
  return results[0].result;
}

// ---------------------------------------------------------------------------
// extractRubric(tabId) — extract rubric from the first student section
// ---------------------------------------------------------------------------
/**
 * Extract rubric data (prompt, checklist, targets, model response, max score)
 * from the first student section on the page.
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<{essayPrompt: string, checklistItems: Array, rubricItems: Array, modelText: string|null, maxScore: string}>}
 */
async function extractRubric(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const first = document.querySelector(sel.studentSection);
      if (!first) return null;

      const region = first.querySelector(sel.questionRegion);
      if (!region) return null;

      // Part 1: question prompt + grading checklist
      const part1Div = region.children[1];
      const promptDiv = part1Div?.children[0];

      // Grading checklist (collapsed <details> in Part 1)
      const checkDiv = promptDiv?.querySelector('details')?.querySelector('div');
      const checklistItems = checkDiv
        ? Array.from(checkDiv.querySelectorAll('tr')).map(tr => ({
            category: tr.querySelector('b')?.textContent.trim() || '',
            items: Array.from(tr.querySelectorAll('label')).map(l => l.textContent.trim()),
          })).filter(x => x.category || x.items.length)
        : [];

      // Part 2: rubric targets + model response
      const part2Div = region.children[3];
      const rubDiv = part2Div?.querySelector('details')?.querySelector('div');
      const rubricItems = rubDiv
        ? Array.from(rubDiv.querySelectorAll('tr')).map(tr => ({
            category: tr.querySelector('b')?.textContent.trim() || '',
            items: Array.from(tr.querySelectorAll('li')).map(l => l.textContent.trim()),
          })).filter(x => x.category || x.items.length)
        : [];
      const modelText = rubDiv?.querySelector('div')?.textContent.trim() || null;

      // Essay/question prompt
      const promptPs = promptDiv?.querySelectorAll(':scope > p, :scope > div > p') || [];
      const essayPrompt = Array.from(promptPs)
        .map(p => p.textContent.trim())
        .join(' ')
        .substring(0, 500);

      // Max score from score input parent text (e.g., "/10")
      const scoreInput = first.querySelector(sel.scoreInput);
      const maxMatch = scoreInput?.parentElement?.textContent.match(/\/(\d+\.?\d*)/);
      const maxScore = maxMatch ? maxMatch[1] : '10';

      return { essayPrompt, checklistItems, rubricItems, modelText, maxScore };
    },
    args: [SELECTORS],
  });

  if (!results || !results[0] || results[0].result === null) {
    throw new Error('Failed to extract rubric. Could not find student sections on this page.');
  }
  return results[0].result;
}

// ---------------------------------------------------------------------------
// gradeStudent(provider, model, rubric, response, customInstructions)
// ---------------------------------------------------------------------------
/**
 * Grade a single student's response using AI via the background proxy.
 * @param {object} provider - Provider object from PROVIDERS (must have buildChatRequest)
 * @param {string} model - Model ID string
 * @param {object} rubric - Rubric data from extractRubric()
 * @param {string} studentName - Student's name
 * @param {string} response - Student's response text
 * @param {string} [customInstructions] - Additional grading instructions
 * @returns {Promise<{score: number, feedback: string}>}
 */
async function gradeStudent(provider, model, rubric, studentName, response, customInstructions) {
  // Handle empty responses
  if (!response || response.trim().length === 0) {
    return { score: 0, feedback: 'No response submitted.' };
  }

  // Build the grading prompt
  const systemPrompt = buildGradingSystemPrompt(rubric, customInstructions);
  const userPrompt = buildGradingUserPrompt(studentName, response);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Build the request using the provider's pattern
  const config = await getProviderConfig(provider);
  config.model = model;
  const request = provider.buildChatRequest(config, messages, { stream: false });

  // Send via background proxy (non-streaming)
  const responseData = await proxyFetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!responseData.ok) {
    throw new Error(`AI API error: ${responseData.status} ${responseData.statusText}`);
  }

  const data = await responseData.json();

  // Parse the AI response — handle both Ollama and OpenAI response formats
  let aiText = '';
  if (data.message && data.message.content) {
    // Ollama format
    aiText = data.message.content;
  } else if (data.choices && data.choices[0] && data.choices[0].message) {
    // OpenAI format
    aiText = data.choices[0].message.content;
  } else {
    throw new Error('Unexpected AI response format');
  }

  return parseGradingResponse(aiText, rubric.maxScore);
}

// ---------------------------------------------------------------------------
// fillGrade(tabId, studentIndex, score, feedback)
// ---------------------------------------------------------------------------
/**
 * Fill a score and feedback for a specific student on the page.
 * Scrolls to the student, sets score input, and sets both TinyMCE
 * contenteditable div and hidden form input.
 * @param {number} tabId - Chrome tab ID
 * @param {number} studentIndex - Zero-based index of the student
 * @param {number|string} score - Score to set
 * @param {string} feedback - Feedback text (plain text, will be wrapped in <p>)
 */
async function fillGrade(tabId, studentIndex, score, feedback) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, idx, scoreVal, feedbackText) => {
      const students = document.querySelectorAll(sel.studentSection);
      const student = students[idx];
      if (!student) return { success: false, error: `Student at index ${idx} not found` };

      // Scroll into view
      student.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Set score
      const scoreInput = student.querySelector(sel.scoreInput);
      if (scoreInput) {
        scoreInput.value = String(scoreVal);
        scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
        scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Set feedback — TinyMCE pattern: set BOTH contenteditable div AND hidden input
      const fbBox = student.querySelector(sel.feedbackBox);
      const hidden = student.querySelector(sel.feedbackHidden);
      const html = '<p>' + feedbackText.replace(/\n/g, '</p><p>') + '</p>';

      if (fbBox) {
        fbBox.innerHTML = html;
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (hidden) {
        hidden.value = html;
      }

      return { success: true };
    },
    args: [SELECTORS, studentIndex, score, feedback],
  });

  if (!results || !results[0] || !results[0].result?.success) {
    const error = results?.[0]?.result?.error || 'Unknown error filling grade';
    throw new Error(error);
  }
}

// ---------------------------------------------------------------------------
// clickQuickSave(tabId) — click the Quick Save button
// ---------------------------------------------------------------------------
/**
 * Click the Quick Save button on the grading page.
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<void>}
 */
async function clickQuickSave(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Find button containing "Quick Save" text
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent.includes('Quick Save')) {
          btn.click();
          return { success: true };
        }
      }
      // Fallback: try submit button with "Save Changes"
      for (const btn of buttons) {
        if (btn.textContent.includes('Save Changes')) {
          btn.click();
          return { success: true, fallback: true };
        }
      }
      return { success: false, error: 'Quick Save button not found' };
    },
  });

  if (!results || !results[0] || !results[0].result?.success) {
    const error = results?.[0]?.result?.error || 'Failed to click Quick Save';
    throw new Error(error);
  }
}

// ---------------------------------------------------------------------------
// batchGrade(tabId, provider, model, options) — orchestrate full grading flow
// ---------------------------------------------------------------------------
/**
 * Orchestrate the full batch grading flow:
 * 1. Extract rubric
 * 2. Extract all students
 * 3. Filter to ungraded (and apply resume point)
 * 4. Grade each student sequentially via AI
 * 5. Fill scores on page
 * 6. Quick Save every 5 students
 *
 * @param {number} tabId - Chrome tab ID
 * @param {object} provider - Provider object from PROVIDERS
 * @param {string} model - Model ID
 * @param {object} [options]
 * @param {string} [options.pageUrl] - Grading page URL (for state persistence)
 * @param {string} [options.customInstructions] - Extra grading instructions
 * @param {string} [options.resumeAfter] - Student name to resume after (skip up to and including this student)
 * @param {number} [options.delayMs=1000] - Delay between grading requests (ms)
 * @param {number} [options.saveEvery=5] - Save after every N students
 * @param {function} [options.onProgress] - Callback: (current, total, studentName, score, feedback) => void
 * @param {function} [options.onError] - Callback: (studentName, error) => void
 * @param {function} [options.onSave] - Callback: (savedCount) => void
 * @param {function} [options.onComplete] - Callback: (results) => void
 * @returns {Promise<{graded: Array<{name: string, score: number, feedback: string}>, skipped: Array<string>, errors: Array<{name: string, error: string}>}>}
 */
async function batchGrade(tabId, provider, model, options = {}) {
  const {
    pageUrl = null,
    customInstructions = '',
    resumeAfter = null,
    delayMs = 1000,
    saveEvery = 5,
    onProgress = null,
    onError = null,
    onSave = null,
    onComplete = null,
  } = options;

  // Step 1: Extract rubric
  const rubric = await extractRubric(tabId);

  // Step 2: Extract all students
  const allStudents = await extractStudents(tabId);

  // Step 3: Determine which students to grade
  let startIndex = 0;
  const skipped = [];

  if (resumeAfter) {
    // Find the resume point — fuzzy match by last name
    const resumeLower = resumeAfter.toLowerCase();
    const resumeLastName = resumeLower.split(',')[0].trim();
    let foundIndex = -1;

    for (let i = 0; i < allStudents.length; i++) {
      const nameLower = allStudents[i].name.toLowerCase();
      if (nameLower === resumeLower || nameLower.startsWith(resumeLastName)) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 0) {
      startIndex = foundIndex + 1; // Resume AFTER this student
      for (let i = 0; i < startIndex; i++) {
        skipped.push(allStudents[i].name);
      }
    }
  }

  // Filter: skip already-graded students (those with existing feedback)
  const toGrade = [];
  for (let i = startIndex; i < allStudents.length; i++) {
    const student = allStudents[i];
    if (student.hasFeedback) {
      skipped.push(student.name);
    } else {
      toGrade.push(student);
    }
  }

  const total = toGrade.length;
  const graded = [];
  const errors = [];
  let sinceLastSave = 0;

  // Step 4: Grade each student sequentially
  for (let i = 0; i < total; i++) {
    const student = toGrade[i];

    try {
      // Grade via AI
      const result = await gradeStudent(
        provider,
        model,
        rubric,
        student.name,
        student.response,
        customInstructions
      );

      // Step 5: Fill grade on page
      await fillGrade(tabId, student.index, result.score, result.feedback);

      graded.push({ name: student.name, index: student.index, score: result.score, feedback: result.feedback });
      sinceLastSave++;

      // Progress callback
      if (onProgress) {
        onProgress(i + 1, total, student.name, result.score, result.feedback);
      }

      // Step 6: Quick Save every N students
      if (sinceLastSave >= saveEvery) {
        await clickQuickSave(tabId);
        sinceLastSave = 0;
        
        // Save state after Quick Save
        if (pageUrl && graded.length > 0) {
          const lastGraded = graded[graded.length - 1];
          await saveBatchGradeState(pageUrl, lastGraded.name, graded.length);
        }
        
        if (onSave) {
          onSave(graded.length);
        }
        // Extra delay after save for page to process
        await delay(1500);
      }

      // Delay between students
      if (i < total - 1) {
        await delay(delayMs);
      }
    } catch (err) {
      errors.push({ name: student.name, error: err.message });
      if (onError) {
        onError(student.name, err);
      }
    }
  }

  // Final save if there are unsaved grades
  if (sinceLastSave > 0) {
    try {
      await clickQuickSave(tabId);
      
      // Save state after final Quick Save
      if (pageUrl && graded.length > 0) {
        const lastGraded = graded[graded.length - 1];
        await saveBatchGradeState(pageUrl, lastGraded.name, graded.length);
      }
      
      if (onSave) {
        onSave(graded.length);
      }
    } catch (err) {
      errors.push({ name: '__quicksave__', error: `Final save failed: ${err.message}` });
    }
  }

  // Clear state on successful completion (all students graded)
  if (pageUrl && total > 0 && errors.length === 0) {
    await clearBatchGradeState(pageUrl);
  }

  const summary = { graded, skipped, errors };

  if (onComplete) {
    onComplete(summary);
  }

  return summary;
}

// ===========================================================================
// Batch Grade State Management
// ===========================================================================

/**
 * Load batch grade state from chrome.storage.local.
 * @returns {Promise<object>} State object with URL keys
 */
async function loadBatchGradeState() {
  try {
    const result = await chrome.storage.local.get('batchGradeState');
    return result.batchGradeState || {};
  } catch (err) {
    console.error('Failed to load batch grade state:', err);
    return {};
  }
}

/**
 * Save batch grade state to chrome.storage.local.
 * @param {string} url - Grading page URL
 * @param {string} lastStudent - Last graded student name
 * @param {number} count - Number of students graded
 */
async function saveBatchGradeState(url, lastStudent, count) {
  try {
    const state = await loadBatchGradeState();
    state[url] = {
      lastStudent,
      count,
      timestamp: new Date().toISOString()
    };
    await chrome.storage.local.set({ batchGradeState: state });
  } catch (err) {
    console.error('Failed to save batch grade state:', err);
  }
}

/**
 * Clear batch grade state for a specific URL.
 * @param {string} url - Grading page URL
 */
async function clearBatchGradeState(url) {
  try {
    const state = await loadBatchGradeState();
    delete state[url];
    await chrome.storage.local.set({ batchGradeState: state });
  } catch (err) {
    console.error('Failed to clear batch grade state:', err);
  }
}

/**
 * Get batch grade state for a specific URL.
 * @param {string} url - Grading page URL
 * @returns {Promise<object|null>} State object or null if not found
 */
async function getBatchGradeState(url) {
  const state = await loadBatchGradeState();
  return state[url] || null;
}

// ===========================================================================
// Internal Helpers
// ===========================================================================

/**
 * Proxy fetch via background service worker (avoids CORS).
 * Mirrors the pattern from providers.js.
 */
function proxyFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      reject(new Error('Extension API not available'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 130000);

    chrome.runtime.sendMessage(
      { action: 'proxyFetch', url, options },
      (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error('No response from background service worker'));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            text: () => Promise.resolve(response.data),
            json: () => Promise.resolve(JSON.parse(response.data)),
          });
        }
      }
    );
  });
}

/**
 * Get provider config from chrome.storage.local.
 * Returns stored config values (apiUrl, apiKey, etc.) for the active provider.
 */
async function getProviderConfig(provider) {
  const providerMeta = provider.getConfig();
  const keys = providerMeta.fields.map(f => f.key);
  const defaults = {};
  for (const f of providerMeta.fields) {
    if (f.default) defaults[f.key] = f.default;
  }

  try {
    const stored = await chrome.storage.local.get(keys);
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

/**
 * Build the system prompt for grading.
 */
function buildGradingSystemPrompt(rubric, customInstructions) {
  let prompt = `You are an expert grading assistant for high school students. Grade the student response against the provided rubric.

GRADING PHILOSOPHY:
- These are high school seniors, not college students or experts. Grade generously.
- Give full credit for demonstrating understanding, even if the explanation lacks polish.
- Award substantial partial credit for correct reasoning with minor errors.
- Focus on mathematical thinking and effort, not perfect execution.
- Distinguish conceptual misunderstandings (serious) from minor mistakes (not serious).
- Any substantive attempt that engages with the prompt earns at least 40% of max score.

MAX SCORE: ${rubric.maxScore}

QUESTION/PROMPT:
${rubric.essayPrompt || '(No prompt extracted)'}
`;

  if (rubric.checklistItems && rubric.checklistItems.length > 0) {
    prompt += '\nGRADING CHECKLIST:\n';
    for (const item of rubric.checklistItems) {
      if (item.category) prompt += `- ${item.category}\n`;
      for (const sub of item.items) {
        prompt += `  - ${sub}\n`;
      }
    }
  }

  if (rubric.rubricItems && rubric.rubricItems.length > 0) {
    prompt += '\nRUBRIC TARGETS:\n';
    for (const item of rubric.rubricItems) {
      if (item.category) prompt += `- ${item.category}\n`;
      for (const sub of item.items) {
        prompt += `  - ${sub}\n`;
      }
    }
  }

  if (rubric.modelText) {
    prompt += `\nMODEL RESPONSE (for reference):\n${rubric.modelText}\n`;
  }

  if (customInstructions) {
    prompt += `\nADDITIONAL INSTRUCTIONS:\n${customInstructions}\n`;
  }

  prompt += `
RESPONSE FORMAT:
You MUST respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.
{
  "score": <integer 0 to ${rubric.maxScore}>,
  "feedback": "<constructive feedback string, use \\( ... \\) for inline LaTeX math>"
}`;

  return prompt;
}

/**
 * Build the user prompt for grading a specific student.
 */
function buildGradingUserPrompt(studentName, response) {
  return `Grade this student's response.

STUDENT: ${studentName}

STUDENT RESPONSE:
${response}`;
}

/**
 * Parse the AI grading response into score and feedback.
 * Handles JSON wrapped in markdown code fences.
 */
function parseGradingResponse(aiText, maxScore) {
  let cleanJson = aiText.trim();

  // Strip markdown code fences if present
  const jsonMatch = cleanJson.match(/```json\s*([\s\S]*?)\s*```/) ||
                    cleanJson.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleanJson = jsonMatch[1].trim();
  }

  try {
    const data = JSON.parse(cleanJson);
    const max = parseFloat(maxScore) || 10;
    let score = parseInt(data.score, 10);

    // Clamp score to valid range
    if (isNaN(score) || score < 0) score = 0;
    if (score > max) score = Math.round(max);

    const feedback = (data.feedback || '').trim() || 'Graded by AI.';

    return { score, feedback };
  } catch {
    // Fallback: try to extract score and feedback from freeform text
    const scoreMatch = aiText.match(/score[:\s]*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

    // Use the full AI text as feedback if JSON parsing fails
    const feedback = aiText.trim().substring(0, 500) || 'Graded by AI (response parsing error).';

    return { score, feedback };
  }
}

/**
 * Promise-based delay.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Exports — attach to window for <script> usage; also support ES module import
// ---------------------------------------------------------------------------
const BatchGrader = {
  extractStudents,
  extractRubric,
  gradeStudent,
  fillGrade,
  clickQuickSave,
  batchGrade,
  // State management
  loadBatchGradeState,
  saveBatchGradeState,
  clearBatchGradeState,
  getBatchGradeState,
  // Expose internals for testing
  _parseGradingResponse: parseGradingResponse,
  _buildGradingSystemPrompt: buildGradingSystemPrompt,
  _buildGradingUserPrompt: buildGradingUserPrompt,
  _SELECTORS: SELECTORS,
};

// Attach to window (for regular <script> inclusion)
if (typeof window !== 'undefined') {
  window.BatchGrader = BatchGrader;
}

// Support ES module export
export {
  extractStudents,
  extractRubric,
  gradeStudent,
  fillGrade,
  clickQuickSave,
  batchGrade,
  loadBatchGradeState,
  saveBatchGradeState,
  clearBatchGradeState,
  getBatchGradeState,
};

export default BatchGrader;
