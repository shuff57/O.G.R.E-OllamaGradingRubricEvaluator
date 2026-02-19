/**
 * discover.js — AI-powered page structure discovery
 *
 * Analyzes any grading page to discover CSS selectors for student sections,
 * score inputs, feedback areas, etc. Uses a screenshot + DOM snapshot
 * sent to the active AI provider as a vision request.
 *
 * Flow: capturePageSnapshot → discoverSelectors → validateSelectors → testFill
 */

// ============================================================================
// DOM Snapshot Capture
// ============================================================================

/**
 * Capture a simplified DOM tree from the page for AI analysis.
 * Returns an array of nodes with tag, attributes, text, depth, and child count.
 * Capped at 500 nodes to fit within AI context limits.
 *
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<Array>} Simplified DOM tree
 */
async function capturePageSnapshot(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'svg', 'path', 'br', 'hr']);
      const CAPTURE_ATTRS = ['id', 'class', 'role', 'aria-label', 'name', 'type',
        'contenteditable', 'data-lastchange', 'data-testid', 'placeholder', 'for', 'action', 'method'];
      const MAX_NODES = 500;
      const MAX_TEXT = 150;
      const MAX_DEPTH = 8;

      const nodes = [];

      function walk(el, depth) {
        if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) return;
        const tag = el.tagName?.toLowerCase();
        if (!tag || SKIP_TAGS.has(tag)) return;

        // Capture relevant attributes
        const attrs = {};
        for (const attr of CAPTURE_ATTRS) {
          if (el.hasAttribute(attr)) {
            let val = el.getAttribute(attr);
            if (val && val.length > 100) val = val.substring(0, 100) + '...';
            attrs[attr] = val;
          }
        }

        // Capture direct text content (not from children)
        let text = '';
        for (const child of el.childNodes) {
          if (child.nodeType === 3) { // Text node
            const t = child.textContent.trim();
            if (t) {
              text += (text ? ' ' : '') + t;
              if (text.length > MAX_TEXT) {
                text = text.substring(0, MAX_TEXT) + '...';
                break;
              }
            }
          }
        }

        nodes.push({
          depth,
          tag,
          attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
          text: text || undefined,
          childCount: el.children.length || undefined,
        });

        for (const child of el.children) {
          walk(child, depth + 1);
        }
      }

      walk(document.body, 0);
      return nodes;
    },
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error('Failed to capture DOM snapshot');
  }
  return results[0].result;
}

// ============================================================================
// Screenshot Capture (via background.js)
// ============================================================================

/**
 * Capture a screenshot of the visible tab.
 * @returns {Promise<string>} Base64-encoded PNG data URL
 */
function captureScreenshot() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response || !response.dataUrl) {
        reject(new Error('Failed to capture screenshot'));
      } else {
        resolve(response.dataUrl);
      }
    });
  });
}

// ============================================================================
// AI-Powered Discovery
// ============================================================================

/**
 * Build the AI prompt for page structure discovery.
 * @param {Array} domSnapshot - Simplified DOM tree
 * @param {string} pageUrl - Current page URL
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildDiscoveryPrompt(domSnapshot, pageUrl) {
  const systemPrompt = `You are a web page structure analyzer for an automated grading tool. Your job is to identify the key elements on a grading/assignment page so the tool can automatically extract student data, fill scores, and save.

You will receive:
1. A screenshot of the grading page
2. A simplified DOM tree (tag names, attributes, text snippets)

STEP 1 — DETERMINE NAVIGATION MODE:
First, determine if this is a BATCH or SEQUENTIAL grading page.

BATCH indicators (multiple students visible at once):
- Repeating student rows/sections on one page
- Multiple score inputs visible simultaneously
- A page-wide "Save" or "Quick Save" button
- All student names and responses visible without navigation

SEQUENTIAL indicators (one student at a time):
- Next/Previous student buttons
- A student name dropdown or indicator showing current student
- Only ONE score input visible
- "X of N" or student counter text
- Student work shown in a preview pane or iframe

STEP 2 — IDENTIFY SELECTORS:

FOR BATCH MODE — identify these CSS selectors:

REQUIRED:
- studentSection: The repeating container for each student. Must match ALL students with document.querySelectorAll().
- studentName: Element with student name, RELATIVE to studentSection
- scoreInput: Score input field, RELATIVE to studentSection
- feedbackBox: Feedback area, RELATIVE to studentSection (textarea, contenteditable div, or rich text editor)

OPTIONAL:
- feedbackHidden: Hidden input synced with feedback (TinyMCE/CKEditor)
- questionRegion: Question/response container within each student section
- fullCreditLink: Link/button for "full credit" shortcut

FOR SEQUENTIAL MODE — identify these CSS selectors (all are PAGE-LEVEL, not relative):

REQUIRED:
- studentName: Element showing the current student's name (page-level selector)
- scoreInput: The single score input field (page-level selector)

OPTIONAL:
- feedbackBox: Feedback area if visible (may be null for iframe-based editors)
- questionRegion: Container for student work preview (often an iframe)

NAVIGATION (sequential mode only):
- nextButton: Button/link to navigate to next student
- prevButton: Button/link to navigate to previous student
- studentIndicator: Element showing current student (may be same as studentName)
- submitButton: Per-student submit/save button (if different from page-wide save)
- waitForSelector: Element that confirms the page loaded after navigation

RULES:
- Selectors MUST be valid CSS. Use attribute selectors like [aria-label="Score"] or [data-testid="..."] when available.
- For BATCH mode: relative selectors (studentName, scoreInput, feedbackBox) must work as studentSection.querySelector(selector).
- For SEQUENTIAL mode: all selectors are page-level (document.querySelector).
- For BATCH mode: studentSection must match ALL student entries with document.querySelectorAll().
- Prefer semantic selectors (aria-label, role, data-testid, name, type) over fragile class names.
- If the feedback area is a rich text editor (TinyMCE, CKEditor), identify BOTH the visible editor AND any hidden form input.
- If the feedback editor is inside an iframe (common in Canvas LMS), set feedbackBox to null and note it.

Also determine:
- feedback.type: "textarea", "tinymce-inline" (TinyMCE contenteditable), "tinymce-iframe" (TinyMCE inside an iframe), "contenteditable", or "unknown"
- feedback.requiresHiddenSync: true if there's a hidden input synced with feedback
- feedback.htmlWrap: true if feedback should be wrapped in <p> tags
- save.buttonText: The text on the save/submit button (e.g., "Quick Save", "Save", "Submit")

Respond with ONLY valid JSON, no markdown fences, no explanation:
{
  "navigation": {
    "mode": "batch or sequential",
    "nextButton": null,
    "prevButton": null,
    "studentIndicator": null,
    "submitButton": null,
    "waitForSelector": null
  },
  "selectors": {
    "studentSection": "... or null for sequential",
    "studentName": "...",
    "scoreInput": "...",
    "feedbackBox": "... or null",
    "feedbackHidden": null,
    "questionRegion": null,
    "fullCreditLink": null
  },
  "feedback": {
    "type": "textarea",
    "requiresHiddenSync": false,
    "htmlWrap": false
  },
  "save": {
    "buttonText": "Save",
    "fallbackText": "Submit"
  },
  "confidence": "high",
  "notes": "brief observations about the page structure"
}`;

  // Compact the DOM snapshot for the prompt
  const snapshotStr = JSON.stringify(domSnapshot).substring(0, 12000);

  const userPrompt = `Analyze this grading page and identify its structure.

Page URL: ${pageUrl}

DOM SNAPSHOT (simplified tree, ${domSnapshot.length} nodes):
${snapshotStr}

Look at the screenshot to understand the visual layout, and use the DOM snapshot to find precise CSS selectors. The goal is to find selectors that will let the tool automatically extract student names and responses, fill in scores and feedback, and click save.`;

  return { systemPrompt, userPrompt };
}

/**
 * Parse the AI discovery response into a structured result.
 * Handles JSON wrapped in code fences, thinking blocks, etc.
 * @param {string} aiText - Raw AI response
 * @returns {Object} Parsed discovery result
 */
function parseDiscoveryResponse(aiText) {
  let text = aiText.trim();

  // Strip <think>...</think> blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Try to extract JSON from markdown code fences
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                     text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Attempt direct parse
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try to find a JSON object with "selectors" key
  const jsonMatch = text.match(/\{[\s\S]*"selectors"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* continue */ }
  }

  throw new Error('Could not parse AI discovery response as JSON');
}

/**
 * Discover page selectors using AI analysis.
 * Takes a screenshot + DOM snapshot, sends to AI, validates results.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {string} pageUrl - Current page URL
 * @param {function} aiCallFn - Function to call AI: (systemPrompt, userPrompt, screenshotDataUrl) => Promise<string>
 * @returns {Promise<{ draft: Object, validation: Object }>} Draft profile + validation results
 */
async function discoverSelectors(tabId, pageUrl, aiCallFn) {
  // Step 1: Capture screenshot + DOM snapshot in parallel
  const [screenshot, domSnapshot] = await Promise.all([
    captureScreenshot(),
    capturePageSnapshot(tabId),
  ]);

  // Step 2: Build prompt and call AI
  const { systemPrompt, userPrompt } = buildDiscoveryPrompt(domSnapshot, pageUrl);
  const aiResponse = await aiCallFn(systemPrompt, userPrompt, screenshot);

  // Step 3: Parse response
  const discovery = parseDiscoveryResponse(aiResponse);

  // Step 4: Validate selectors on the live page
  const navigation = discovery.navigation || null;
  const validation = await validateSelectors(tabId, discovery.selectors, navigation);

  return {
    draft: discovery,
    validation,
    screenshot,
  };
}

// ============================================================================
// Selector Validation
// ============================================================================

/**
 * Validate discovered selectors by running them on the live page.
 * Returns match counts and sample text for each selector.
 * Supports both batch mode (relative selectors within studentSection)
 * and sequential mode (all selectors at page level).
 *
 * @param {number} tabId - Chrome tab ID
 * @param {Object} selectors - Selector map { studentSection, studentName, ... }
 * @param {Object} [navigation] - Navigation config from discovery (if available)
 * @returns {Promise<Object>} Map of selectorKey → { matchCount, sampleText, valid }
 */
async function validateSelectors(tabId, selectors, navigation = null) {
  const isSequential = navigation && navigation.mode === 'sequential';

  // Merge navigation selectors into validation if sequential
  const allSelectors = { ...selectors };
  if (isSequential && navigation) {
    if (navigation.nextButton) allSelectors._navNext = navigation.nextButton;
    if (navigation.prevButton) allSelectors._navPrev = navigation.prevButton;
    if (navigation.submitButton) allSelectors._navSubmit = navigation.submitButton;
    if (navigation.waitForSelector) allSelectors._navWait = navigation.waitForSelector;
    if (navigation.studentIndicator) allSelectors._navIndicator = navigation.studentIndicator;
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, sequential) => {
      const validation = {};

      for (const [key, cssSelector] of Object.entries(sel)) {
        if (!cssSelector) {
          validation[key] = { matchCount: 0, sampleText: '', valid: false, skipped: true };
          continue;
        }

        try {
          if (sequential || key === 'studentSection' || key.startsWith('_nav')) {
            // Sequential mode: all selectors are page-level
            // Navigation selectors are always page-level
            // studentSection is always page-level
            const matches = document.querySelectorAll(cssSelector);
            validation[key] = {
              matchCount: matches.length,
              sampleText: matches[0]?.textContent?.trim().substring(0, 80) || matches[0]?.value?.substring(0, 80) || '',
              valid: matches.length > 0,
            };
          } else {
            // Batch mode: relative selector within first studentSection
            const parent = sel.studentSection ? document.querySelector(sel.studentSection) : null;
            if (!parent) {
              validation[key] = { matchCount: 0, sampleText: '', valid: false, error: 'No parent found' };
              continue;
            }
            const match = parent.querySelector(cssSelector);
            const allMatches = parent.querySelectorAll(cssSelector);
            validation[key] = {
              matchCount: allMatches.length,
              sampleText: match?.textContent?.trim().substring(0, 80) || match?.value?.substring(0, 80) || '',
              valid: !!match,
            };
          }
        } catch (err) {
          validation[key] = { matchCount: 0, sampleText: '', valid: false, error: err.message };
        }
      }

      return validation;
    },
    args: [allSelectors, isSequential],
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error('Failed to validate selectors');
  }
  return results[0].result;
}

// ============================================================================
// Test Fill
// ============================================================================

/**
 * Fill a test score and feedback on one student to verify selectors work.
 * Uses a clearly labeled test value so the user can visually confirm.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {Object} selectors - CSS selectors from draft profile
 * @param {Object} feedbackConfig - Feedback type config
 * @param {number} [studentIndex=0] - Which student to test on
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function testFill(tabId, selectors, feedbackConfig, studentIndex = 0) {
  const fbConfig = feedbackConfig || { type: 'textarea', requiresHiddenSync: false, htmlWrap: false };
  const testScore = '7';
  const testFeedback = '[O.G.R.E Test] This is a test fill — it will be cleared after confirmation.';

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, idx, scoreVal, feedbackText, fbCfg) => {
      try {
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
        } else {
          return { success: false, error: 'Score input not found with selector: ' + sel.scoreInput };
        }

        // Set feedback
        const fbBox = sel.feedbackBox ? student.querySelector(sel.feedbackBox) : null;
        if (!fbBox) {
          return { success: false, error: 'Feedback box not found with selector: ' + sel.feedbackBox };
        }

        if (fbCfg.type === 'tinymce-inline' || fbCfg.type === 'contenteditable') {
          const content = fbCfg.htmlWrap
            ? '<p>' + feedbackText + '</p>'
            : feedbackText;
          // Using textContent for test fill to avoid XSS concerns
          fbBox.textContent = feedbackText;
          fbBox.dispatchEvent(new Event('input', { bubbles: true }));
          if (fbCfg.requiresHiddenSync && sel.feedbackHidden) {
            const hidden = student.querySelector(sel.feedbackHidden);
            if (hidden) hidden.value = content;
          }
        } else {
          fbBox.value = feedbackText;
          fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return { success: true, studentName: student.querySelector(sel.studentName)?.textContent.trim() || `Student ${idx + 1}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    args: [selectors, studentIndex, testScore, testFeedback, fbConfig],
  });

  if (!results || !results[0] || !results[0].result) {
    return { success: false, error: 'Failed to execute test fill script' };
  }
  return results[0].result;
}

/**
 * Clear a test fill by resetting score and feedback for one student.
 *
 * @param {number} tabId - Chrome tab ID
 * @param {Object} selectors - CSS selectors
 * @param {Object} feedbackConfig - Feedback type config
 * @param {number} [studentIndex=0] - Which student to clear
 * @param {string} [originalScore=''] - Original score to restore
 * @returns {Promise<void>}
 */
async function clearTestFill(tabId, selectors, feedbackConfig, studentIndex = 0, originalScore = '') {
  const fbConfig = feedbackConfig || { type: 'textarea', requiresHiddenSync: false, htmlWrap: false };

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, idx, origScore, fbCfg) => {
      const students = document.querySelectorAll(sel.studentSection);
      const student = students[idx];
      if (!student) return;

      // Restore score
      const scoreInput = student.querySelector(sel.scoreInput);
      if (scoreInput) {
        scoreInput.value = origScore;
        scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Clear feedback
      const fbBox = sel.feedbackBox ? student.querySelector(sel.feedbackBox) : null;
      if (fbBox) {
        if (fbCfg.type === 'tinymce-inline' || fbCfg.type === 'contenteditable') {
          fbBox.textContent = '';
          fbBox.dispatchEvent(new Event('input', { bubbles: true }));
          if (fbCfg.requiresHiddenSync && sel.feedbackHidden) {
            const hidden = student.querySelector(sel.feedbackHidden);
            if (hidden) hidden.value = '';
          }
        } else {
          fbBox.value = '';
          fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    },
    args: [selectors, studentIndex, originalScore, fbConfig],
  });
}

// ============================================================================
// Exports
// ============================================================================

const Discover = {
  capturePageSnapshot,
  captureScreenshot,
  discoverSelectors,
  validateSelectors,
  testFill,
  clearTestFill,
  // Expose for testing
  _buildDiscoveryPrompt: buildDiscoveryPrompt,
  _parseDiscoveryResponse: parseDiscoveryResponse,
};

if (typeof window !== 'undefined') {
  window.Discover = Discover;
}

export {
  capturePageSnapshot,
  captureScreenshot,
  discoverSelectors,
  validateSelectors,
  testFill,
  clearTestFill,
};

export default Discover;
