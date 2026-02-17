/**
 * batch-grader.js - Core batch grading engine
 *
 * Extracts students from grading pages, grades them via AI,
 * and fills scores/feedback back into the page.
 *
 * Supports multiple LMS platforms via site profiles (see site-profiles.js).
 * Selectors are loaded dynamically from the active profile.
 *
 * Uses chrome.scripting.executeScript for DOM extraction/manipulation
 * and chrome.runtime.sendMessage for background proxy API calls.
 *
 * All functions are pure logic — no UI code.
 */

import { getActiveProfile, DEFAULT_MYOPENMATH_PROFILE } from './site-profiles.js';

// ---------------------------------------------------------------------------
// extractStudents(tabId, selectors) — extract all student data from the grading page
// ---------------------------------------------------------------------------
/**
 * Extract student names, scores, feedback status, and responses from the page.
 * @param {number} tabId - Chrome tab ID containing the grading page
 * @param {object} selectors - CSS selectors from the active site profile
 * @returns {Promise<Array<{index: number, name: string, currentScore: string, hasFeedback: boolean, response: string}>>}
 */
async function extractStudents(tabId, selectors) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const students = Array.from(document.querySelectorAll(sel.studentSection));
      return students.map((s, i) => {
        const region = sel.questionRegion ? s.querySelector(sel.questionRegion) : null;
        // Part 1 content div is the second child of the region (index 1)
        const responseDiv = region?.children[1]?.children[1];
        const fbBox = sel.feedbackBox ? s.querySelector(sel.feedbackBox) : null;
        return {
          index: i,
          name: s.querySelector(sel.studentName)?.textContent.trim() || `Student ${i + 1}`,
          currentScore: s.querySelector(sel.scoreInput)?.value || '',
          hasFeedback: (fbBox?.textContent.trim().length || 0) > 0,
          response: responseDiv?.textContent.trim() || '',
        };
      });
    },
    args: [selectors],
  });

  if (!results || !results[0] || results[0].result === undefined) {
    throw new Error('Failed to extract students. Check that the site profile selectors are correct.');
  }
  return results[0].result;
}

// ---------------------------------------------------------------------------
// extractRubric(tabId, selectors) — extract rubric from the first student section
// ---------------------------------------------------------------------------
/**
 * Extract rubric data (prompt, checklist, targets, model response, max score)
 * from the first student section on the page.
 * @param {number} tabId - Chrome tab ID
 * @param {object} selectors - CSS selectors from the active site profile
 * @returns {Promise<{essayPrompt: string, checklistItems: Array, rubricItems: Array, modelText: string|null, maxScore: string}>}
 */
async function extractRubric(tabId, selectors) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const first = document.querySelector(sel.studentSection);
      if (!first) return null;

      const region = sel.questionRegion ? first.querySelector(sel.questionRegion) : null;

      // Default values for platforms without structured rubric
      let checklistItems = [];
      let rubricItems = [];
      let modelText = null;
      let essayPrompt = '';

      if (region) {
        // MyOpenMath-style: structured question region with parts
        // Part 1: question prompt + grading checklist
        const part1Div = region.children[1];
        const promptDiv = part1Div?.children[0];

        // Grading checklist (collapsed <details> in Part 1)
        const checkDiv = promptDiv?.querySelector('details')?.querySelector('div');
        checklistItems = checkDiv
          ? Array.from(checkDiv.querySelectorAll('tr')).map(tr => ({
              category: tr.querySelector('b')?.textContent.trim() || '',
              items: Array.from(tr.querySelectorAll('label')).map(l => l.textContent.trim()),
            })).filter(x => x.category || x.items.length)
          : [];

        // Part 2: rubric targets + model response
        const part2Div = region.children[3];
        const rubDiv = part2Div?.querySelector('details')?.querySelector('div');
        rubricItems = rubDiv
          ? Array.from(rubDiv.querySelectorAll('tr')).map(tr => ({
              category: tr.querySelector('b')?.textContent.trim() || '',
              items: Array.from(tr.querySelectorAll('li')).map(l => l.textContent.trim()),
            })).filter(x => x.category || x.items.length)
          : [];
        modelText = rubDiv?.querySelector('div')?.textContent.trim() || null;

        // Essay/question prompt
        const promptPs = promptDiv?.querySelectorAll(':scope > p, :scope > div > p') || [];
        essayPrompt = Array.from(promptPs)
          .map(p => p.textContent.trim())
          .join(' ')
          .substring(0, 500);
      }

      // Max score from score input parent text (e.g., "/10")
      const scoreInput = first.querySelector(sel.scoreInput);
      const maxMatch = scoreInput?.parentElement?.textContent.match(/\/(\d+\.?\d*)/);
      const maxScore = maxMatch ? maxMatch[1] : '10';

      return { essayPrompt, checklistItems, rubricItems, modelText, maxScore };
    },
    args: [selectors],
  });

  if (!results || !results[0] || results[0].result === null) {
    throw new Error('Failed to extract rubric. Could not find student sections on this page.');
  }
  return results[0].result;
}

// ---------------------------------------------------------------------------
// isRubricSufficient(rubric) — check if extracted rubric has enough content
// ---------------------------------------------------------------------------
/**
 * Check whether the extracted rubric has enough content for meaningful grading.
 * Used by ALL modes (batch + sequential) to determine if Tier 2/3 fallback is needed.
 * @param {object} rubric - Rubric data from extractRubric() or extractRubricSequential()
 * @returns {boolean}
 */
function isRubricSufficient(rubric) {
  if (!rubric) return false;
  if (rubric.checklistItems?.length > 0) return true;
  if (rubric.rubricItems?.length > 0) return true;
  if (rubric.essayPrompt && rubric.essayPrompt.length > 50) return true;
  return false;
}

// ---------------------------------------------------------------------------
// extractPageContent(tabId, selectors, navigation) — Tier 2 content scraper
// ---------------------------------------------------------------------------
/**
 * Scan the page for assignment-related text when formal rubric extraction fails.
 * Platform-agnostic — tries multiple selector strategies in priority order.
 * @param {number} tabId - Chrome tab ID
 * @param {object} selectors - CSS selectors from the active site profile
 * @param {object} navigation - Navigation config (optional)
 * @returns {Promise<{content: string, source: string}>}
 */
async function extractPageContent(tabId, selectors, navigation) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Helper: collapse whitespace and blank lines in raw textContent
        function cleanText(raw) {
          return raw
            .split('\n')
            .map(l => l.replace(/\s+/g, ' ').trim())
            .filter((l, i, arr) => !(l === '' && (i === 0 || arr[i - 1] === '')))
            .join('\n')
            .trim();
        }

        // Priority 1: Canvas rubric criteria table
        const rubricCriteria = document.querySelectorAll(
          '#rubric_summary_container .criterion .description, ' +
          '.rubric_table .criterion_description, ' +
          '.rubric_criterion .description'
        );
        if (rubricCriteria.length > 0) {
          const text = Array.from(rubricCriteria)
            .map(el => el.textContent.trim())
            .filter(t => t.length > 0)
            .join('\n');
          if (text.length > 30) return { content: cleanText(text).substring(0, 2000), source: 'rubric_table' };
        }

        // Priority 2: Canvas/LMS assignment description
        const descSelectors = [
          '.description .user_content',
          '#assignment_description',
          '.assignment-description',
          '.assignment_description',
          '.description-text',
        ];
        for (const sel of descSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = el.textContent.trim();
            if (text.length > 30) return { content: cleanText(text).substring(0, 2000), source: 'assignment_description' };
          }
        }

        // Priority 3: MyOpenMath question region
        const qRegion = document.querySelector('.question-region, div[data-qn]');
        if (qRegion) {
          const text = qRegion.textContent.trim();
          if (text.length > 30) return { content: cleanText(text).substring(0, 2000), source: 'question_region' };
        }

        // Priority 4: Submission preview iframe content
        const iframeSelectors = [
          '#submission-preview-iframe',
          'iframe[id*="preview"]',
          'iframe[src*="submission"]',
        ];
        for (const sel of iframeSelectors) {
          const iframe = document.querySelector(sel);
          if (iframe) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow?.document;
              if (doc?.body) {
                const text = doc.body.textContent.trim();
                if (text.length > 30 && !text.includes('No Preview Available')) {
                  return { content: cleanText(text).substring(0, 2000), source: 'submission_iframe' };
                }
              }
            } catch { /* cross-origin */ }
          }
        }

        // Priority 5: Generic headings + nearby content
        const headings = document.querySelectorAll('h1, h2, h3');
        if (headings.length > 0) {
          const parts = [];
          for (const h of headings) {
            parts.push(h.textContent.trim());
            let sibling = h.nextElementSibling;
            while (sibling && !['H1','H2','H3'].includes(sibling.tagName)) {
              if (sibling.textContent.trim().length > 10) {
                parts.push(sibling.textContent.trim());
              }
              sibling = sibling.nextElementSibling;
              if (parts.join('\n').length > 1500) break;
            }
          }
          const text = parts.join('\n');
          if (text.length > 50) return { content: cleanText(text).substring(0, 2000), source: 'page_headings' };
        }

        // Priority 6: Fallback — page body text
        const body = document.body?.textContent?.trim() || '';
        if (body.length > 100) {
          return { content: cleanText(body).substring(0, 2000), source: 'page_content' };
        }

        return { content: '', source: '' };
      },
    });
    return results?.[0]?.result || { content: '', source: '' };
  } catch {
    return { content: '', source: '' };
  }
}

// ---------------------------------------------------------------------------
// formatRubricForReview(rubric) — convert rubric object to readable text
// ---------------------------------------------------------------------------
/**
 * Convert the rubric object into human-readable text for the review textarea.
 * @param {object} rubric - Rubric data from extractRubric() or extractRubricSequential()
 * @returns {string}
 */
function formatRubricForReview(rubric) {
  if (!rubric) return '';
  const lines = [];

  if (rubric.essayPrompt) {
    lines.push('--- Question/Prompt ---');
    // Clean up raw text: collapse excessive whitespace, trim lines
    const cleaned = rubric.essayPrompt
      .split('\n')
      .map(l => l.trim())
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))  // collapse blank lines
      .join('\n')
      .trim();
    lines.push(cleaned);
    lines.push('');
  }

  if (rubric.rubricItems?.length) {
    lines.push('--- Rubric Targets ---');
    rubric.rubricItems.forEach(cat => {
      if (cat.category) lines.push(cat.category + ':');
      if (cat.items?.length) {
        cat.items.forEach(item => lines.push('  - ' + item));
      }
    });
    lines.push('');
  }

  if (rubric.modelText) {
    lines.push('--- Model Response ---');
    lines.push(rubric.modelText.trim());
    lines.push('');
  }

  lines.push('Max Score: ' + (rubric.maxScore || '10'));
  return lines.join('\n');
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
 * @param {object} [explicitConfig] - Optional pre-loaded config (including OAuth tokens)
 * @returns {Promise<{score: number, feedback: string}>}
 */
async function gradeStudent(provider, model, rubric, studentName, response, customInstructions, explicitConfig = null) {
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
  const config = explicitConfig || await getProviderConfig(provider);
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
// fillGrade(tabId, studentIndex, score, feedback, selectors, feedbackConfig)
// ---------------------------------------------------------------------------
/**
 * Fill a score and feedback for a specific student on the page.
 * Scrolls to the student, sets score input, and fills feedback using
 * the strategy appropriate for the site profile (TinyMCE, textarea, etc.).
 *
 * Note: feedbackText is generated by the grading AI and is trusted content.
 * TinyMCE inline editors require setting innerHTML to render formatted feedback.
 * The hidden input sync is required because TinyMCE doesn't auto-sync on
 * programmatic innerHTML changes.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {number} studentIndex - Zero-based index of the student
 * @param {number|string} score - Score to set
 * @param {string} feedback - Feedback text (plain text, may be wrapped in HTML)
 * @param {object} selectors - CSS selectors from the active site profile
 * @param {object} [feedbackConfig] - Feedback type config from profile
 */
async function fillGrade(tabId, studentIndex, score, feedback, selectors, feedbackConfig = null) {
  const fbConfig = feedbackConfig || { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, idx, scoreVal, feedbackText, fbCfg) => {
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

      // Set feedback — strategy depends on the site profile's feedback type
      // feedbackText is AI-generated trusted content (not user/external input)
      const fbBox = sel.feedbackBox ? student.querySelector(sel.feedbackBox) : null;

      if (fbCfg.type === 'tinymce-inline' || fbCfg.type === 'contenteditable') {
        // Rich text editor: set innerHTML (required for TinyMCE contenteditable)
        const html = fbCfg.htmlWrap
          ? '<p>' + feedbackText.replace(/\n/g, '</p><p>') + '</p>'
          : feedbackText;
        if (fbBox) {
          fbBox.innerHTML = html; // eslint-disable-line -- trusted AI-generated content
          fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // TinyMCE requires syncing the hidden form input too
        if (fbCfg.requiresHiddenSync && sel.feedbackHidden) {
          const hidden = student.querySelector(sel.feedbackHidden);
          if (hidden) {
            hidden.value = html;
          }
        }
      } else {
        // textarea or plain input: set .value
        if (fbBox) {
          fbBox.value = feedbackText;
          fbBox.dispatchEvent(new Event('input', { bubbles: true }));
          fbBox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      return { success: true };
    },
    args: [selectors, studentIndex, score, feedback, fbConfig],
  });

  if (!results || !results[0] || !results[0].result?.success) {
    const error = results?.[0]?.result?.error || 'Unknown error filling grade';
    throw new Error(error);
  }
}

// ---------------------------------------------------------------------------
// clickQuickSave(tabId, saveConfig) — click the save button
// ---------------------------------------------------------------------------
/**
 * Click the save button on the grading page.
 * @param {number} tabId - Chrome tab ID
 * @param {object} [saveConfig] - Save button config from profile
 * @param {string} [saveConfig.buttonText] - Primary button text to search for
 * @param {string} [saveConfig.fallbackText] - Fallback button text
 * @returns {Promise<void>}
 */
async function clickQuickSave(tabId, saveConfig = null) {
  const cfg = saveConfig || { buttonText: 'Quick Save', fallbackText: 'Save Changes' };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (saveCfg) => {
      const buttons = document.querySelectorAll('button');
      // Try primary button text
      for (const btn of buttons) {
        if (btn.textContent.includes(saveCfg.buttonText)) {
          btn.click();
          return { success: true };
        }
      }
      // Fallback button text
      if (saveCfg.fallbackText) {
        for (const btn of buttons) {
          if (btn.textContent.includes(saveCfg.fallbackText)) {
            btn.click();
            return { success: true, fallback: true };
          }
        }
      }
      // Last resort: any submit button
      const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        return { success: true, fallback: true };
      }
      return { success: false, error: `Save button not found (looked for "${saveCfg.buttonText}")` };
    },
    args: [cfg],
  });

  if (!results || !results[0] || !results[0].result?.success) {
    const error = results?.[0]?.result?.error || 'Failed to click save button';
    throw new Error(error);
  }
}

// ===========================================================================
// Sequential Navigation Helpers
// ===========================================================================

/**
 * Wait for a CSS selector to appear on the page (polling).
 * @param {number} tabId - Chrome tab ID
 * @param {string} selector - CSS selector to wait for
 * @param {number} [timeoutMs=10000] - Max time to wait
 * @returns {Promise<boolean>}
 */
async function waitForSelectorOnPage(tabId, selector, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => !!document.querySelector(sel),
      args: [selector],
    });
    if (results?.[0]?.result) return true;
    await delay(300);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

/**
 * Click the "next student" button and wait for page to settle.
 * @param {number} tabId - Chrome tab ID
 * @param {Object} navigation - Navigation config from profile
 * @returns {Promise<void>}
 */
async function navigateToNextStudent(tabId, navigation) {
  // Capture current student name before navigating
  const beforeResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      // Native <select>: use selected option text
      if (el.tagName === 'SELECT') return el.selectedOptions?.[0]?.textContent?.trim() || '';
      return el.textContent?.trim() || '';
    },
    args: [navigation.studentIndicator],
  });
  const beforeName = beforeResults?.[0]?.result || '';

  // Click next button
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const btn = document.querySelector(sel);
      if (!btn) throw new Error('Next student button not found');
      btn.click();
    },
    args: [navigation.nextButton],
  });

  // Wait for the page to load — check that the student name changes
  await delay(navigation.waitAfterNavMs || 2000);

  if (navigation.waitForSelector) {
    await waitForSelectorOnPage(tabId, navigation.waitForSelector);
  }

  // Verify navigation happened (student name should have changed)
  const afterResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      if (el.tagName === 'SELECT') return el.selectedOptions?.[0]?.textContent?.trim() || '';
      return el.textContent?.trim() || '';
    },
    args: [navigation.studentIndicator],
  });
  const afterName = afterResults?.[0]?.result || '';

  if (beforeName && afterName && beforeName === afterName) {
    // May be at the last student — not necessarily an error
    console.warn('[BatchGrader] Student name did not change after navigation');
  }
}

/**
 * Navigate to the first student in the list.
 * Uses the student dropdown to select the first item.
 * @param {number} tabId - Chrome tab ID
 * @param {Object} navigation - Navigation config from profile
 * @returns {Promise<void>}
 */
async function navigateToFirstStudent(tabId, navigation) {
  // Navigate to the first student via dropdown
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (navConfig) => {
      const trigger = document.querySelector(navConfig.studentIndicator);
      if (!trigger) return false;

      // Native <select>: set selectedIndex and dispatch change event
      if (trigger.tagName === 'SELECT') {
        trigger.selectedIndex = 0;
        trigger.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // Canvas custom dropdown: open it, then click first option
      trigger.click();
      return true;
    },
    args: [navigation],
  });

  await delay(500);

  // For non-<select> dropdowns (Canvas custom UI), click the first option
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const firstOption = document.querySelector('[data-testid="student-option-0"]');
      if (firstOption && firstOption.tagName !== 'OPTION') {
        firstOption.click();
        return true;
      }
      const firstItem = document.querySelector('[role="menuitem"]');
      if (firstItem) {
        firstItem.click();
        return true;
      }
      return false;
    },
  });

  await delay(navigation.waitAfterNavMs || 2000);

  if (navigation.waitForSelector) {
    await waitForSelectorOnPage(tabId, navigation.waitForSelector);
  }
}

/**
 * Get current student info from a sequential page (page-level selectors).
 * @param {number} tabId - Chrome tab ID
 * @param {Object} selectors - Profile selectors
 * @returns {Promise<{name: string, currentScore: string, hasFeedback: boolean}>}
 */
async function getCurrentStudentInfo(tabId, selectors) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const nameEl = document.querySelector(sel.studentName);
      // If it's a <select>, use the selected option text; otherwise use textContent
      const name = nameEl?.tagName === 'SELECT'
        ? (nameEl.selectedOptions?.[0]?.textContent?.trim() || '')
        : (nameEl?.textContent?.trim() || '');
      const score = document.querySelector(sel.scoreInput)?.value || '';
      // Check for existing comments/feedback — look for comment text in the comments area
      const commentSection = document.querySelector('[data-testid="comment-library-button"]');
      const existingComments = commentSection?.closest('section')?.querySelectorAll('[class*="comment"]');
      const hasFeedback = (existingComments?.length || 0) > 0;
      return { name, currentScore: score, hasFeedback };
    },
    args: [selectors],
  });
  return results?.[0]?.result || { name: '', currentScore: '', hasFeedback: false };
}

/**
 * Get the total number of students from the student dropdown.
 * @param {number} tabId - Chrome tab ID
 * @param {Object} navigation - Navigation config from profile
 * @returns {Promise<number>}
 */
async function getStudentCount(tabId, navigation) {
  // Open the dropdown, count items, close it
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const trigger = document.querySelector(sel);
      if (trigger) trigger.click();
    },
    args: [navigation.studentIndicator],
  });

  await delay(500);

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Count student options (Canvas uses data-testid="student-option-N")
      const options = document.querySelectorAll('[data-testid^="student-option-"]');
      return options.length;
    },
  });

  // Close dropdown by pressing Escape
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  });

  await delay(300);

  return results?.[0]?.result || 0;
}

// ===========================================================================
// Sequential Extraction
// ===========================================================================

/**
 * Extract student data by navigating through each student sequentially.
 * Produces the same Array shape as extractStudents() for compatibility.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {Object} selectors - Profile selectors
 * @param {Object} navigation - Navigation config from profile
 * @param {function} [onProgress] - Callback: (current, total) => void
 * @returns {Promise<Array<{index, name, currentScore, hasFeedback, response}>>}
 */
async function extractStudentsSequential(tabId, selectors, navigation, onProgress = null) {
  const totalStudents = await getStudentCount(tabId, navigation);
  if (totalStudents === 0) {
    throw new Error('Could not determine student count. Is the student dropdown accessible?');
  }

  await navigateToFirstStudent(tabId, navigation);

  const students = [];
  let multiQuestionMode = false;

  for (let i = 0; i < totalStudents; i++) {
    // Read current student data
    const info = await getCurrentStudentInfo(tabId, selectors);

    let response = '';
    let questions = null;

    // On first student, probe for structured multi-question content in the iframe
    if (i === 0) {
      const mqData = await extractMultiQuestionFromIframe(tabId);
      if (mqData.isMultiQuestion && mqData.questions.length > 0) {
        multiQuestionMode = true;
        questions = mqData.questions;
      }
    } else if (multiQuestionMode) {
      // Subsequent students in multi-question mode: extract per-question data
      const mqData = await extractMultiQuestionFromIframe(tabId);
      questions = mqData.questions;
    }

    // Single-response mode: extract plain text response from iframe
    if (!multiQuestionMode) {
      try {
        response = await extractIframeContent(tabId, selectors.questionRegion);
      } catch {
        // Iframe may not be accessible (cross-origin, no preview, etc.)
      }
    }

    students.push({
      index: i,
      name: info.name,
      currentScore: info.currentScore,
      hasFeedback: info.hasFeedback,
      response,
      questions,
      isMultiQuestion: multiQuestionMode,
    });

    if (onProgress) onProgress(i + 1, totalStudents);

    // Navigate to next student (unless last)
    if (i < totalStudents - 1) {
      await navigateToNextStudent(tabId, navigation);
    }
  }

  return students;
}

/**
 * Extract text content from an iframe on the page.
 * Uses chrome.webNavigation.getAllFrames to find the frame, then
 * chrome.scripting.executeScript with frameIds to read its content.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {string} iframeSelector - CSS selector for the iframe element
 * @returns {Promise<string>} Text content from the iframe (max 2000 chars)
 */
async function extractIframeContent(tabId, iframeSelector) {
  if (!iframeSelector) return '';

  // Access iframe content directly via same-origin contentDocument
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selector) => {
        const iframe = document.querySelector(selector);
        if (!iframe) return '';
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!doc || !doc.body) return '';
          const text = doc.body.innerText?.trim() || '';
          if (text.length < 20 || text.includes('No Preview Available')) return '';
          return text.substring(0, 2000);
        } catch {
          return ''; // Cross-origin iframe
        }
      },
      args: [iframeSelector],
    });
    return results?.[0]?.result || '';
  } catch {
    return '';
  }
}

/**
 * Extract structured multi-question data from the submission preview iframe.
 * Detects submissions with multiple gradable questions (quizzes, multi-part assignments)
 * via .display_question elements inside #submission-preview-iframe.
 *
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<{isMultiQuestion: boolean, questions: Array, totalMax: string}>}
 */
async function extractMultiQuestionFromIframe(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const iframe = document.querySelector('#submission-preview-iframe');
      if (!iframe) return { isMultiQuestion: false, questions: [], totalMax: '0' };

      let doc;
      try {
        doc = iframe.contentDocument || iframe.contentWindow?.document;
      } catch { return { isMultiQuestion: false, questions: [], totalMax: '0' }; }
      if (!doc?.body) return { isMultiQuestion: false, questions: [], totalMax: '0' };

      // Detect multi-question structure: .display_question elements
      const questionEls = doc.querySelectorAll('.display_question');
      if (questionEls.length === 0) return { isMultiQuestion: false, questions: [], totalMax: '0' };

      const questions = [];
      questionEls.forEach(q => {
        const qId = q.id || '';
        const qType = q.querySelector('.question_type')?.textContent?.trim() || 'unknown';
        const questionText = q.querySelector('.question_text')?.textContent?.trim() || '';
        const answer = q.querySelector('.quiz_response_text')?.textContent?.trim() || '';
        const ptsText = q.querySelector('.question_points')?.textContent?.trim() || '';
        const ptsMatch = ptsText.match(/(\d+\.?\d*)/);
        const maxPts = ptsMatch ? parseFloat(ptsMatch[1]) : 1;
        const scoreInput = q.querySelector('.question_input');
        const currentScore = scoreInput ? scoreInput.value : '';

        questions.push({ qId, qType, questionText, answer, maxPts, currentScore });
      });

      // Total max from quiz score area
      const totalMaxMatch = doc.querySelector('.quiz_score')?.textContent?.match(/out of (\d+\.?\d*)/);
      const totalMax = totalMaxMatch ? totalMaxMatch[1] : String(questions.reduce((s, q) => s + q.maxPts, 0));

      return { isMultiQuestion: true, questions, totalMax };
    },
  });

  return results?.[0]?.result || { isMultiQuestion: false, questions: [], totalMax: '0' };
}

/**
 * Fill per-question scores and comments inside the quiz iframe,
 * then click "Update Scores" to save.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {Array<{qId: string, score: number, comment: string}>} questionGrades
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function fillMultiQuestionInIframe(tabId, questionGrades) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (grades) => {
      const iframe = document.querySelector('#submission-preview-iframe');
      if (!iframe) return { success: false, error: 'No submission iframe found' };

      let doc;
      try {
        doc = iframe.contentDocument || iframe.contentWindow?.document;
      } catch { return { success: false, error: 'Cross-origin iframe' }; }
      if (!doc) return { success: false, error: 'Cannot access iframe document' };

      let filled = 0;
      for (const g of grades) {
        const qEl = doc.querySelector('#' + g.qId);
        if (!qEl) continue;

        // Fill per-question score
        const scoreInput = qEl.querySelector('.question_input');
        if (scoreInput) {
          scoreInput.focus();
          scoreInput.value = String(g.score);
          scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
          scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
          scoreInput.blur();
        }

        // Fill per-question comment
        const commentId = g.qId.replace('question_', 'question_comment_');
        const commentEl = doc.querySelector('#' + commentId) ||
                          doc.querySelector('textarea[name="' + commentId + '"]');
        if (commentEl && g.comment) {
          commentEl.value = g.comment;
          commentEl.dispatchEvent(new Event('input', { bubbles: true }));
          commentEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        filled++;
      }

      // Click "Update Scores" button
      const updateBtn = doc.querySelector('button.update-scores, input[value="Update Scores"]');
      if (updateBtn) {
        updateBtn.click();
      }

      return { success: true, filled };
    },
    args: [questionGrades],
  });

  return results?.[0]?.result || { success: false, error: 'executeScript failed' };
}

/**
 * Pivot student-grouped data to question-grouped data for per-question batch grading.
 *
 * @param {Array} students - From extractStudentsSequential(), each with .questions array
 * @returns {Array<{qId: string, questionText: string, maxPts: number, students: Array<{index: number, name: string, answer: string}>}>}
 */
function restructureByQuestion(students) {
  const multiQStudents = students.filter(s => s.isMultiQuestion && s.questions);
  if (multiQStudents.length === 0) return [];

  // Use first student's questions as the template (same questions for all students)
  const template = multiQStudents[0].questions;

  return template.map(q => ({
    qId: q.qId,
    qType: q.qType,
    questionText: q.questionText,
    maxPts: q.maxPts,
    students: multiQStudents.map(s => {
      const studentQ = s.questions?.find(sq => sq.qId === q.qId);
      return {
        index: s.index,
        name: s.name,
        answer: studentQ?.answer || '',
      };
    }),
  }));
}

/**
 * Build a rubric object for the grading server from a single question's data.
 * Maps the question text to essayPrompt and maxPts to maxScore so the grading
 * server's existing infrastructure (anchors, bridges, sweeps) works unchanged.
 *
 * @param {Object} questionData - Single question from restructureByQuestion()
 * @param {string} customInstructions - User custom instructions
 * @returns {Object} Rubric compatible with grading server /api/grade endpoint
 */
function buildQuestionRubricForServer(questionData, customInstructions = '') {
  let essayPrompt = questionData.questionText || '(No question text)';
  if (customInstructions) {
    essayPrompt += '\n\nADDITIONAL GRADING INSTRUCTIONS:\n' + customInstructions;
  }

  return {
    essayPrompt,
    maxScore: String(questionData.maxPts),
    checklistItems: [],
    rubricItems: [],
    modelText: '',
  };
}

/**
 * Fill a single question's score and comment in the iframe, then click Update Scores.
 * Thin wrapper around fillMultiQuestionInIframe with a single-item array.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {string} qId - Question element ID (e.g., "question_6147900")
 * @param {number} score - Score for this question
 * @param {string} comment - Comment for this question
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function fillSingleQuestion(tabId, qId, score, comment) {
  return fillMultiQuestionInIframe(tabId, [{ qId, score, comment }]);
}

/**
 * Extract rubric info from a sequential grading page (first student view).
 * For most sequential interfaces, the rubric isn't embedded on the page —
 * the user provides it manually via the UI. This function extracts what it can
 * (primarily max score from the grade input label).
 *
 * @param {number} tabId - Chrome tab ID
 * @param {Object} selectors - Profile selectors
 * @param {Object} navigation - Navigation config
 * @returns {Promise<Object>} Same shape as extractRubric()
 */
async function extractRubricSequential(tabId, selectors, navigation) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      // Extract max score from score input label (e.g., "Grade out of 100")
      const scoreInput = document.querySelector(sel.scoreInput);
      let maxScore = '10';

      if (scoreInput) {
        // Try <label> element, aria-label attribute, parent text, or nearby siblings
        const label = scoreInput.closest('label') || document.querySelector(`label[for="${scoreInput.id}"]`);
        const candidates = [
          label?.textContent,
          scoreInput.getAttribute('aria-label'),
          scoreInput.parentElement?.textContent,
          scoreInput.parentElement?.parentElement?.textContent,
        ].filter(Boolean);
        for (const text of candidates) {
          const match = text.match(/(?:out of|\/)\s*(\d+\.?\d*)/i);
          if (match) { maxScore = match[1]; break; }
        }
      }

      // Try to get assignment title from the page
      const titleEl = document.querySelector('[data-testid="assignment-link"]') ||
                       document.querySelector('h1, h2, .assignment-title');
      const title = titleEl?.textContent?.trim() || '';

      // Try Canvas rubric criteria table
      const checklistItems = [];
      const rubricCriteria = document.querySelectorAll(
        '#rubric_summary_container .criterion, ' +
        '.rubric_table .criterion, ' +
        '.rubric_criterion'
      );
      if (rubricCriteria.length > 0) {
        rubricCriteria.forEach(criterion => {
          const desc = criterion.querySelector('.description, .criterion_description, td.criterion_description');
          const points = criterion.querySelector('.points, .criterion_points');
          if (desc) {
            checklistItems.push({
              category: points ? points.textContent.trim() + ' pts' : '',
              items: [desc.textContent.trim()],
            });
          }
        });
      }

      // Try assignment description
      let essayPrompt = title;
      const descSelectors = [
        '.description .user_content',
        '#assignment_description',
        '.assignment-description',
        '.assignment_description',
      ];
      for (const dSel of descSelectors) {
        const el = document.querySelector(dSel);
        if (el) {
          const text = el.textContent.trim();
          if (text.length > 30) {
            essayPrompt = text.substring(0, 500);
            break;
          }
        }
      }

      // Fallback for New Quizzes: extract quiz questions from submission iframe
      // (New Quizzes has no rubric or description on the main page — content is in the iframe)
      if (checklistItems.length === 0 && essayPrompt === title) {
        try {
          const iframe = document.querySelector('#submission-preview-iframe');
          if (iframe) {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc?.body) {
              const text = doc.body.innerText?.trim() || '';
              if (text.length > 50) {
                essayPrompt = text.substring(0, 1500);
              }
            }
          }
        } catch { /* cross-origin iframe — skip */ }
      }

      return {
        essayPrompt,
        checklistItems,
        rubricItems: [],
        modelText: null,
        maxScore,
      };
    },
    args: [selectors],
  });

  return results?.[0]?.result || {
    essayPrompt: '',
    checklistItems: [],
    rubricItems: [],
    modelText: null,
    maxScore: '100',
  };
}

// ===========================================================================
// Sequential Fill
// ===========================================================================

/**
 * Fill score and feedback on the currently-displayed student (sequential mode).
 * No studentIndex param — fills whichever student is visible on the page.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {number|string} score - Score to set
 * @param {string} feedback - Feedback text
 * @param {Object} selectors - Profile selectors
 * @param {Object} feedbackConfig - Feedback type config
 * @param {Object} navigation - Navigation config
 * @returns {Promise<void>}
 */
async function fillGradeSequential(tabId, score, feedback, selectors, feedbackConfig, navigation) {
  const fbConfig = feedbackConfig || { type: 'textarea', requiresHiddenSync: false, htmlWrap: false };

  // Step 1: Fill the score input (page-level selector)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, scoreVal) => {
      const scoreInput = document.querySelector(sel.scoreInput);
      if (!scoreInput) return;
      scoreInput.focus();
      scoreInput.value = String(scoreVal);
      scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
      scoreInput.blur(); // Triggers auto-save on some platforms (Canvas)
    },
    args: [selectors, score],
  });

  // Step 2: Fill feedback — branch on type
  if (fbConfig.type === 'tinymce-iframe') {
    // Canvas SpeedGrader: TinyMCE Rich Content Editor inside an iframe
    await fillIframeFeedback(tabId, feedback, fbConfig);
  } else if (fbConfig.type === 'tinymce-inline' || fbConfig.type === 'contenteditable') {
    // Inline contenteditable (like MyOpenMath, but page-level)
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, feedbackText, cfg) => {
        const fbBox = document.querySelector(sel.feedbackBox);
        if (!fbBox) return;
        const html = cfg.htmlWrap
          ? '<p>' + feedbackText.replace(/\n/g, '</p><p>') + '</p>'
          : feedbackText;
        fbBox.innerHTML = html; // eslint-disable-line -- trusted AI-generated content
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        if (cfg.requiresHiddenSync && sel.feedbackHidden) {
          const hidden = document.querySelector(sel.feedbackHidden);
          if (hidden) hidden.value = html;
        }
      },
      args: [selectors, feedback, fbConfig],
    });
  } else {
    // Plain textarea
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, feedbackText) => {
        const fbBox = document.querySelector(sel.feedbackBox);
        if (!fbBox) return;
        fbBox.value = feedbackText;
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        fbBox.dispatchEvent(new Event('change', { bubbles: true }));
      },
      args: [selectors, feedback],
    });
  }

  // Step 3: Submit per student if configured
  if (navigation?.submitPerStudent && navigation.submitButton) {
    await delay(500); // Brief pause before clicking submit
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const btn = document.querySelector(sel);
        if (btn) btn.click();
      },
      args: [navigation.submitButton],
    });
    await delay(1000); // Wait for submission to process
  }
}

/**
 * Fill feedback into a TinyMCE editor that lives inside an iframe.
 * Used by Canvas SpeedGrader's Rich Content Editor.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {string} feedbackText - Feedback text to set
 * @param {Object} fbConfig - Feedback config
 * @returns {Promise<void>}
 */
async function fillIframeFeedback(tabId, feedbackText, fbConfig) {
  const html = fbConfig.htmlWrap
    ? '<p>' + feedbackText.replace(/\n/g, '</p><p>') + '</p>'
    : feedbackText;

  // Find TinyMCE editor iframe and set content via same-origin contentDocument
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (content) => {
      // Look for TinyMCE editor iframe by common selectors
      const candidates = [
        ...document.querySelectorAll('iframe[id*="rce"]'),
        ...document.querySelectorAll('iframe[id*="_ifr"]'),
        ...document.querySelectorAll('iframe[title*="Rich Text"]'),
        ...document.querySelectorAll('iframe[title*="rich text"]'),
      ];

      // Deduplicate
      const seen = new Set();
      const iframes = [];
      for (const iframe of candidates) {
        if (!seen.has(iframe)) {
          seen.add(iframe);
          iframes.push(iframe);
        }
      }

      if (iframes.length === 0) {
        return { success: false, error: 'No TinyMCE editor iframe found' };
      }

      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && doc.body) {
            doc.body.innerHTML = content;
            // Dispatch input event on the iframe's body to notify TinyMCE
            doc.body.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, iframeId: iframe.id };
          }
        } catch {
          // Cross-origin — skip this iframe
        }
      }

      return { success: false, error: 'Could not access any TinyMCE iframe contentDocument' };
    },
    args: [html],
  });

  const fillResult = result?.[0]?.result;
  if (!fillResult?.success) {
    console.warn('[BatchGrader] fillIframeFeedback:', fillResult?.error || 'unknown error');
  }
}

// ===========================================================================
// Sequential Batch Grading Orchestration
// ===========================================================================

/**
 * Orchestrate batch grading for sequential navigation pages.
 * Three-phase approach:
 *   Phase 1: Navigate through all students, extract data into array
 *   Phase 2: Grade all students via AI (same as batch — just iterates array)
 *   Phase 3: Navigate back through students, fill scores + feedback
 *
 * @param {number} tabId - Chrome tab ID
 * @param {object} provider - Provider object
 * @param {string} model - Model ID
 * @param {object} opts - Options including selectors, feedbackConfig, navigation, etc.
 * @returns {Promise<{graded, skipped, errors}>}
 */
async function batchGradeSequential(tabId, provider, model, opts = {}) {
  const {
    selectors: sel,
    feedbackConfig: fbConfig,
    saveConfig,
    navigation: nav,
    pageUrl = null,
    customInstructions = '',
    resumeAfter = null,
    delayMs = 1000,
    onProgress = null,
    onError = null,
    onSave = null,
    onComplete = null,
    manualRubric = null,
  } = opts;

  // ---- Phase 1: Extract rubric + all students ----
  const rubric = manualRubric || await extractRubricSequential(tabId, sel, nav);

  if (onProgress) onProgress(0, 1, 'Navigating to first student...', null, null);
  await navigateToFirstStudent(tabId, nav);

  const allStudents = await extractStudentsSequential(tabId, sel, nav, (current, total) => {
    if (onProgress) onProgress(current, total * 2, `Extracting ${current}/${total}...`, null, null);
  });

  // ---- Filter to ungraded ----
  let startIndex = 0;
  const skipped = [];

  if (resumeAfter) {
    const resumeLower = resumeAfter.toLowerCase();
    for (let i = 0; i < allStudents.length; i++) {
      if (allStudents[i].name.toLowerCase().includes(resumeLower)) {
        startIndex = i + 1;
        break;
      }
    }
    for (let i = 0; i < startIndex; i++) {
      skipped.push(allStudents[i].name);
    }
  }

  const toGrade = [];
  for (let i = startIndex; i < allStudents.length; i++) {
    const student = allStudents[i];
    if (student.hasFeedback) {
      skipped.push(student.name);
    } else {
      // Also skip students with existing non-zero scores (don't replace grades)
      const existingScore = parseFloat(student.currentScore);
      if (!isNaN(existingScore) && existingScore > 0) {
        skipped.push(student.name);
      } else {
        toGrade.push(student);
      }
    }
  }

  if (toGrade.length === 0) {
    const summary = { graded: [], skipped, errors: [] };
    if (onComplete) onComplete(summary);
    return summary;
  }

  // ---- Phase 2: Grade all students via AI ----
  const total = toGrade.length;
  const gradedResults = [];
  const errors = [];

  // Detect "non-zero feedback only" instruction for programmatic enforcement
  const nonZeroFeedbackOnly = customInstructions && /non.?zero/i.test(customInstructions) && /feedback/i.test(customInstructions);

  for (let i = 0; i < total; i++) {
    const student = toGrade[i];
    try {
      const result = await gradeStudent(provider, model, rubric, student.name, student.response, customInstructions);
      // Enforce non-zero feedback rule: strip feedback from 0-score students
      const feedback = (nonZeroFeedbackOnly && result.score === 0) ? '' : result.feedback;
      gradedResults.push({
        index: student.index,
        name: student.name,
        score: result.score,
        feedback,
      });

      if (onProgress) {
        const phaseOffset = allStudents.length; // Phase 1 count
        onProgress(phaseOffset + i + 1, allStudents.length + total * 2, student.name, result.score, result.feedback);
      }

      if (i < total - 1) await delay(delayMs);
    } catch (err) {
      errors.push({ name: student.name, error: err.message });
      if (onError) onError(student.name, err);
    }
  }

  // ---- Phase 3: Navigate back and fill grades ----
  if (gradedResults.length > 0) {
    await navigateToFirstStudent(tabId, nav);
    let currentPos = 0;

    for (let i = 0; i < gradedResults.length; i++) {
      const result = gradedResults[i];

      // Navigate to the correct student position
      while (currentPos < result.index) {
        await navigateToNextStudent(tabId, nav);
        currentPos++;
      }

      // Fill this student's grade
      try {
        await fillGradeSequential(tabId, result.score, result.feedback, sel, fbConfig, nav);

        if (onProgress) {
          const phaseOffset = allStudents.length + total;
          onProgress(phaseOffset + i + 1, allStudents.length + total * 2, `Filled ${result.name}`, result.score, result.feedback);
        }

        // Save state periodically
        if (pageUrl && (i + 1) % 5 === 0) {
          await saveBatchGradeState(pageUrl, result.name, gradedResults.length);
          if (onSave) onSave(i + 1);
        }
      } catch (err) {
        errors.push({ name: result.name, error: `Fill failed: ${err.message}` });
        if (onError) onError(result.name, err);
      }

      // Navigate to next student for the next fill (unless this is the last)
      if (i < gradedResults.length - 1) {
        await navigateToNextStudent(tabId, nav);
        currentPos++;
      }
    }
  }

  // Clear state on completion
  if (pageUrl && gradedResults.length > 0 && errors.length === 0) {
    await clearBatchGradeState(pageUrl);
  }

  const graded = gradedResults.map(r => ({ name: r.name, index: r.index, score: r.score, feedback: r.feedback }));
  const summary = { graded, skipped, errors };
  if (onComplete) onComplete(summary);
  return summary;
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
    profile = null,
  } = options;

  // Resolve site profile — selectors + feedback config + save config
  const activeProfile = profile || (pageUrl ? await getActiveProfile(pageUrl) : null) || DEFAULT_MYOPENMATH_PROFILE;
  const sel = activeProfile.selectors;
  const fbConfig = activeProfile.feedback || { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true };
  const saveConfig = activeProfile.save || { buttonText: 'Quick Save', fallbackText: 'Save Changes' };
  const nav = activeProfile.navigation || { mode: 'batch' };

  // Branch: sequential navigation mode uses a separate three-phase flow
  if (nav.mode === 'sequential') {
    return await batchGradeSequential(tabId, provider, model, {
      selectors: sel,
      feedbackConfig: fbConfig,
      saveConfig,
      navigation: nav,
      pageUrl,
      customInstructions,
      resumeAfter,
      delayMs,
      onProgress,
      onError,
      onSave,
      onComplete,
      manualRubric: options.manualRubric || null,
    });
  }

  // Step 1: Extract rubric (batch mode)
  const rubric = await extractRubric(tabId, sel);

  // Step 2: Extract all students
  const allStudents = await extractStudents(tabId, sel);

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

  // Filter: skip already-graded students (those with existing feedback or non-zero scores)
  const toGrade = [];
  for (let i = startIndex; i < allStudents.length; i++) {
    const student = allStudents[i];
    if (student.hasFeedback) {
      skipped.push(student.name);
    } else {
      // Also skip students with existing non-zero scores (don't replace grades)
      const existingScore = parseFloat(student.currentScore);
      if (!isNaN(existingScore) && existingScore > 0) {
        skipped.push(student.name);
      } else {
        toGrade.push(student);
      }
    }
  }

  const total = toGrade.length;
  const graded = [];
  const errors = [];
  let sinceLastSave = 0;

  // Detect "non-zero feedback only" instruction for programmatic enforcement
  const nonZeroFeedbackOnly = customInstructions && /non.?zero/i.test(customInstructions) && /feedback/i.test(customInstructions);

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

      // Enforce non-zero feedback rule: strip feedback from 0-score students
      if (nonZeroFeedbackOnly && result.score === 0) {
        result.feedback = '';
      }

      // Step 5: Fill grade on page
      await fillGrade(tabId, student.index, result.score, result.feedback, sel, fbConfig);

      graded.push({ name: student.name, index: student.index, score: result.score, feedback: result.feedback });
      sinceLastSave++;

      // Progress callback
      if (onProgress) {
        onProgress(i + 1, total, student.name, result.score, result.feedback);
      }

      // Step 6: Quick Save every N students
      if (sinceLastSave >= saveEvery) {
        await clickQuickSave(tabId, saveConfig);
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

  // ===========================================================================
  // Session Reporting (to Desktop App via Server)
  // ===========================================================================
  if (graded.length > 0) {
    try {
      const scores = graded.map(g => g.score).sort((a, b) => a - b);
      const sum = scores.reduce((a, b) => a + b, 0);
      const mean = sum / scores.length;
      const min = scores[0];
      const max = scores[scores.length - 1];
      const median = scores.length % 2 === 0
        ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
        : scores[Math.floor(scores.length / 2)];

      // Try to determine provider ID
      let providerId = 'unknown';
      if (provider && typeof provider.id === 'string') {
        providerId = provider.id;
      } else if (provider && provider.constructor && provider.constructor.name) {
        providerId = provider.constructor.name.replace('Provider', '').toLowerCase();
      }

      // Prepare session data matching the DB schema
      const sessionData = {
        provider_id: providerId,
        model: model || 'unknown',
        student_count: graded.length,
        mean_score: parseFloat(mean.toFixed(2)),
        min_score: min,
        max_score: max,
        median_score: parseFloat(median.toFixed(2)),
        max_possible_score: parseFloat(rubric.maxScore || 10),
        page_url: pageUrl || 'unknown',
        question_id: pageUrl ? (pageUrl.match(/[?&]q=(\d+)/) || [])[1] || '' : '',
        custom_instructions: customInstructions || ''
      };

      // Send to local grading server (which relays to desktop app via stdout)
      // Fire-and-forget: if server is down, we just continue
      fetch('http://localhost:3456/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      }).catch(() => {
        // Server likely not running, ignore
      });

    } catch (err) {
      console.warn('Session reporting failed:', err);
    }
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
  const max = parseFloat(maxScore) || 10;
  let text = aiText.trim();

  // Strip <think>...</think> reasoning blocks (common in Kimi, DeepSeek, etc.)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Try to extract JSON from markdown code fences first
  let cleanJson = text;
  const jsonMatch = cleanJson.match(/```json\s*([\s\S]*?)\s*```/) ||
                    cleanJson.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleanJson = jsonMatch[1].trim();
  }

  // Attempt 1: Direct JSON parse
  try {
    const data = JSON.parse(cleanJson);
    return clampAndReturn(data, max);
  } catch { /* continue */ }

  // Attempt 2: Find the last JSON object in the text (skip think-block leftovers)
  const jsonObjects = [...text.matchAll(/\{[^{}]*"score"[^{}]*\}/gi)];
  if (jsonObjects.length > 0) {
    const lastJson = jsonObjects[jsonObjects.length - 1][0];
    try {
      const data = JSON.parse(lastJson);
      return clampAndReturn(data, max);
    } catch {
      // JSON has invalid escapes (e.g., LaTeX \( \sigma) — fix common cases
      try {
        const fixed = lastJson.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
        const data = JSON.parse(fixed);
        return clampAndReturn(data, max);
      } catch { /* continue */ }
    }
  }

  // Attempt 3: Extract score from "score": N pattern (JSON-style, more specific)
  const jsonScoreMatch = text.match(/"score"\s*:\s*"?(\d+)"?/i);
  if (jsonScoreMatch) {
    let score = parseInt(jsonScoreMatch[1], 10);
    if (isNaN(score) || score < 0) score = 0;
    if (score > max) score = Math.round(max);
    // Try to extract feedback field too
    const fbMatch = text.match(/"feedback"\s*:\s*"([\s\S]*?)(?:"|$)/i);
    const feedback = fbMatch ? fbMatch[1].trim() : text.substring(0, 500);
    return { score, feedback: feedback || 'Graded by AI.' };
  }

  // Attempt 4: Freeform text — look for "Score: N" pattern
  const scoreMatch = text.match(/\bscore[:\s]*(\d+)/i);
  const score = scoreMatch ? Math.min(parseInt(scoreMatch[1], 10), max) : 0;
  const feedback = text.substring(0, 500) || 'Graded by AI (response parsing error).';
  return { score, feedback };
}

function clampAndReturn(data, max) {
  let score = parseInt(data.score, 10);
  if (isNaN(score) || score < 0) score = 0;
  if (score > max) score = Math.round(max);
  const feedback = (data.feedback || '').trim() || 'Graded by AI.';
  return { score, feedback };
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
  // Sequential navigation
  extractStudentsSequential,
  extractRubricSequential,
  fillGradeSequential,
  batchGradeSequential,
  navigateToFirstStudent,
  navigateToNextStudent,
  getCurrentStudentInfo,
  getStudentCount,
  // Rubric helpers
  isRubricSufficient,
  extractPageContent,
  formatRubricForReview,
  // State management
  loadBatchGradeState,
  saveBatchGradeState,
  clearBatchGradeState,
  getBatchGradeState,
  // Multi-question mode (Canvas per-question grading)
  extractMultiQuestionFromIframe,
  fillMultiQuestionInIframe,
  fillSingleQuestion,
  restructureByQuestion,
  buildQuestionRubricForServer,
  // Expose internals for testing
  _parseGradingResponse: parseGradingResponse,
  _buildGradingSystemPrompt: buildGradingSystemPrompt,
  _buildGradingUserPrompt: buildGradingUserPrompt,
  // Backward compat: default MyOpenMath selectors
  _SELECTORS: DEFAULT_MYOPENMATH_PROFILE.selectors,
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
  // Sequential navigation
  extractStudentsSequential,
  extractRubricSequential,
  fillGradeSequential,
  batchGradeSequential,
  navigateToFirstStudent,
  navigateToNextStudent,
  getCurrentStudentInfo,
  getStudentCount,
  // Rubric helpers
  isRubricSufficient,
  extractPageContent,
  formatRubricForReview,
  // Multi-question mode (Canvas per-question grading)
  extractMultiQuestionFromIframe,
  fillMultiQuestionInIframe,
  fillSingleQuestion,
  restructureByQuestion,
  buildQuestionRubricForServer,
  // State management
  loadBatchGradeState,
  saveBatchGradeState,
  clearBatchGradeState,
  getBatchGradeState,
};

export default BatchGrader;
