/**
 * batch-grader.ts - Desktop batch grading engine
 *
 * Desktop batch grading engine for the Tauri desktop app.
 * Replaces all chrome.scripting.executeScript calls with evalScript/evalScriptJSON
 * from browser.ts.
 *
 * Extracts students from grading pages, formats rubric data, fills scores/feedback,
 * and navigates between students. Supports multiple LMS platforms via site profiles.
 *
 * All functions are pure logic + DOM interaction via evalScript — no UI code.
 */

import { evalScript, evalScriptJSON } from './browser';
import { ensureTurndownLoaded } from './markdown-extract';
import { marked } from 'marked';

/**
 * JS helper injected into every evalScriptJSON call below.
 *
 * Returns the Nth part-content div inside a question region, handling both
 * single-part and multi-part MOM questions.
 *
 * - Single-part: `region > div` is the Part 1 container directly.
 *   `getPartContent(region, 0)` returns it.
 * - Multi-part ("Part 1 of 2"): each part is wrapped in `div.seqsepwrap`
 *   containing [hidden `div.seqscoreresult`, `p.seqsep` label, real content div].
 *   The helper drills through seqsepwrap and returns the real content div, so
 *   downstream `.children[0]` / `.children[1]` access lands on the prompt/
 *   response rather than on the hidden seqscoreresult (which produced empty
 *   fingerprints and collapsed all students onto one "version").
 */
const GET_PART_CONTENT_HELPER = `
  function getPartContent(region, partIndex) {
    if (!region) return null;
    var directDivs = region.querySelectorAll(':scope > div');
    var target = directDivs[partIndex];
    if (!target) return null;
    if ((target.className || '').indexOf('seqsepwrap') >= 0) {
      return Array.from(target.children).find(function(c) {
        return c.tagName === 'DIV' && (c.className || '').indexOf('seqscoreresult') < 0;
      }) || target;
    }
    return target;
  }
`;

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/** A single student extracted from a grading page. */
export interface Student {
  /** Zero-based index in the student list */
  index: number;
  /** Student display name */
  name: string;
  /** Current score value (may be empty string if ungraded) */
  currentScore: string;
  /** Whether the student already has feedback */
  hasFeedback: boolean;
  /** Student's response text */
  response: string;
  /** Per-student question prompt with their specific jittered values (optional) */
  prompt?: string;
}

/** A single rubric category with its items. */
export interface RubricItem {
  /** Category label (e.g., "Mathematical Reasoning") */
  category: string;
  /** Individual criteria/items within this category */
  items: string[];
}

/** Rubric data extracted from a grading page. */
export interface Rubric {
  /** The essay/question prompt text */
  essayPrompt: string;
  /** Grading checklist categories and items */
  checklistItems: RubricItem[];
  /** Rubric target categories and items */
  rubricItems: RubricItem[];
  /** Model/example response text, if available */
  modelText: string | null;
  /** Maximum possible score (as string, e.g. "10") */
  maxScore: string;
  /** Percentage weights per category, must sum to 100. Each value represents what % of the total grade that category is worth. */
  categoryWeights?: Record<string, number>;
}

/** CSS selectors for locating elements on a grading page. */
export interface SiteSelectors {
  /** Selector for each student's container element */
  studentSection: string | null;
  /** Selector for student name within a student section */
  studentName: string | null;
  /** Selector for the score input field */
  scoreInput: string | null;
  /** Selector for the feedback box (textarea, contenteditable, etc.) */
  feedbackBox: string | null;
  /** Selector for hidden feedback input (for TinyMCE sync) */
  feedbackHidden?: string | null;
  /** Selector for the question/content region */
  questionRegion?: string | null;
  /** Selector for a full-credit shortcut link */
  fullCreditLink?: string | null;
}

/** Feedback entry configuration for a site profile. */
export interface FeedbackConfig {
  /** Feedback input type: 'tinymce-inline', 'tinymce-iframe', 'contenteditable', 'textarea' */
  type: 'tinymce-inline' | 'tinymce-iframe' | 'contenteditable' | 'textarea';
  /** Whether to sync content to a hidden form input */
  requiresHiddenSync: boolean;
  /** Whether to wrap plain text in HTML <p> tags */
  htmlWrap: boolean;
}

/** Save button configuration for a site profile. */
export interface SaveConfig {
  /** Primary save button text to search for */
  buttonText: string;
  /** Fallback button text if primary not found */
  fallbackText: string;
}

/** Navigation configuration for sequential grading pages. */
export interface NavigationConfig {
  /** Navigation mode: 'batch' (all visible) or 'sequential' (one at a time) */
  mode: 'batch' | 'sequential';
  /** Selector for the "next student" button */
  nextButton?: string;
  /** Selector for the "previous student" button */
  prevButton?: string;
  /** Selector for the student indicator (dropdown, name display) */
  studentIndicator?: string;
  /** Milliseconds to wait after navigation */
  waitAfterNavMs?: number;
  /** CSS selector to wait for after navigation */
  waitForSelector?: string;
  /** Whether to submit/save per student automatically */
  submitPerStudent?: boolean;
  /** Selector for per-student submit button */
  submitButton?: string;
}

/** Complete site profile describing how to interact with a grading page. */
export interface SiteProfile {
  /** Unique profile identifier */
  id: string;
  /** Human-readable profile name */
  name: string;
  /** Whether this is a built-in (non-editable) profile */
  isBuiltIn: boolean;
  /** URL substrings used to match this profile to a page */
  urlPatterns: string[];
  /** CSS selectors for page elements */
  selectors: SiteSelectors;
  /** Feedback entry configuration */
  feedback: FeedbackConfig;
  /** Save button configuration */
  save: SaveConfig;
  /** Navigation configuration */
  navigation: NavigationConfig;
}

/** Content extracted as a fallback when formal rubric extraction fails. */
export interface PageContent {
  /** Extracted text content */
  content: string;
  /** Source identifier (e.g., 'rubric_table', 'assignment_description') */
  source: string;
}

/** Result from filling a grade on the page. */
interface FillResult {
  success: boolean;
  error?: string;
  fallback?: boolean;
}

/** Configuration for a batch grading session. */
export interface BatchConfig {
  /** Site profile to use */
  profile: SiteProfile;
  /** Custom grading instructions for AI */
  customInstructions?: string;
  /** Student name to resume after (skip up to and including) */
  resumeAfter?: string | null;
  /** Delay between operations in milliseconds */
  delayMs?: number;
  /** Number of students to grade before saving */
  saveEvery?: number;
}

/** Progress information for a batch grading session. */
export interface BatchProgress {
  /** Total number of students on the page */
  totalStudents: number;
  /** Number of students graded so far */
  gradedCount: number;
  /** Number of students skipped */
  skippedCount: number;
  /** Number of errors encountered */
  errorCount: number;
  /** Index of the current student being processed */
  currentIndex: number;
  /** Whether the grading session is currently running */
  isRunning: boolean;
  /** Whether the grading session is paused */
  isPaused: boolean;
}

/** Result from grading a single student. */
export interface GradeResult {
  /** Student name */
  name: string;
  /** Student index on the page */
  index: number;
  /** Assigned score */
  score: number;
  /** Generated feedback text */
  feedback: string;
}

/** Summary of a completed batch grading session. */
export interface BatchSummary {
  /** Successfully graded students */
  graded: GradeResult[];
  /** Names of skipped students */
  skipped: string[];
  /** Errors encountered during grading */
  errors: Array<{ name: string; error: string }>;
}

/** A group of students sharing the same question version. */
export interface VersionGroup {
  /** Version identifier (1-based) */
  versionNumber: number;
  /** Normalized prompt text fingerprint used for grouping */
  fingerprint: string;
  /** Page index of the representative student for this version */
  representativeIndex: number;
  /** All students with this version */
  students: Student[];
  /** Version-specific essay/question prompt text */
  essayPrompt: string;
  /** Version-specific model response text */
  modelText: string | null;
}

/** Log entry for a single grading action. */
export interface BatchLogEntry {
  /** Student name */
  studentName: string;
  /** Zero-based index of the student on the page */
  studentIndex: number;
  /** Assigned score (or null if error/skipped) */
  score: number | null;
  /** Generated feedback text (or error message if status is 'error') */
  feedback: string;
  /** ISO 8601 timestamp when the action occurred */
  timestamp: string;
  /** Status of the action: 'success' (graded), 'error' (failed), 'skipped' (not graded) */
  status: 'success' | 'error' | 'skipped';
}

// ============================================================================
// Utility
// ============================================================================

/** Promise-based delay. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// DOM Extraction Functions
// ============================================================================

/**
 * Extract student names, scores, feedback status, and responses from the page.
 *
 * Queries the embedded browser for all student sections and maps each to a
 * Student object. Uses the site profile's CSS selectors to locate elements.
 *
 * @param selectors - CSS selectors from the active site profile
 * @returns Array of student data extracted from the page
 * @throws Error if extraction fails or no students found
 */
export async function extractStudents(selectors: SiteSelectors): Promise<Student[]> {
  await ensureTurndownLoaded();
  if (!selectors.studentSection) {
    throw new Error('Failed to extract students. Check that the site profile selectors are correct.');
  }

  // Get total student count
  const count = await evalScriptJSON<number>(
    `document.querySelectorAll(${JSON.stringify(selectors.studentSection)}).length`
  );
  if (!count) {
    throw new Error('Failed to extract students. Check that the site profile selectors are correct.');
  }

  const students: Student[] = [];
  const selJson = JSON.stringify(selectors);

  for (let i = 0; i < count; i++) {
    const student = await evalScriptJSON<Student | null>(`(function() {
      ${GET_PART_CONTENT_HELPER}
      var sel = ${selJson};
      var s = document.querySelectorAll(sel.studentSection)[${i}];
      if (!s) return null;

      // Jump to this student so the extraction is visible
      s.scrollIntoView({ block: 'start' });
      var region = sel.questionRegion ? s.querySelector(sel.questionRegion) : null;
      var part1Div = getPartContent(region, 0);
      var responseDiv = (part1Div && part1Div.querySelectorAll(':scope > div').length > 1)
        ? part1Div.querySelectorAll(':scope > div')[1]
        : null;
      // Fallback: MOM essay responses often live in div.introtext as a sibling of the question div
      if (!responseDiv && region) {
        responseDiv = region.querySelector(':scope > div.introtext');
      }
      var fbBox = sel.feedbackBox ? s.querySelector(sel.feedbackBox) : null;

      // Extract per-student prompt text (with their specific jittered values).
      // Replace MathJax-rendered equations with their aria-label text BEFORE
      // markdown conversion, so per-student equation coefficients (e.g. "y hat
      // equals 30 plus 9 x") survive into the prompt the grading server sees.
      // Without this, turndown strips the MathJax SVG and the AI has to guess
      // the equation — leading to cross-student value contamination.
      var promptDiv = part1Div ? part1Div.children[0] : null;
      var studentPrompt = '';
      if (promptDiv) {
        var clone = promptDiv.cloneNode(true);
        clone.querySelectorAll('mjx-container, .MathJax, [data-mathml], math').forEach(function(m) {
          var aria = m.getAttribute('aria-label') || (m.querySelector('[aria-label]') ? m.querySelector('[aria-label]').getAttribute('aria-label') : null);
          if (aria) {
            var txt = aria.replace(/,\s*math\s*$/, '').trim();
            var span = document.createElement('span');
            span.textContent = ' ' + txt + ' ';
            m.parentNode.replaceChild(span, m);
          }
        });
        var promptPs = clone.querySelectorAll(':scope > p, :scope > div > p, :scope > ul, :scope > ol');
        studentPrompt = Array.from(promptPs)
          .map(function(p) {
            if (p.closest('details')) return '';
            try { return window.__turndownService.turndown(p.outerHTML); } catch(e) { return p.textContent.trim(); }
          })
          .filter(function(t) { return t.length > 0; })
          .join(' ')
          .substring(0, 1500);
        if (!studentPrompt || studentPrompt.length < 30) {
          var fallbackClone = region.cloneNode(true);
          fallbackClone.querySelectorAll('mjx-container, .MathJax, [data-mathml], math').forEach(function(m) {
            var aria = m.getAttribute('aria-label') || (m.querySelector('[aria-label]') ? m.querySelector('[aria-label]').getAttribute('aria-label') : null);
            if (aria) {
              var txt = aria.replace(/,\s*math\s*$/, '').trim();
              var span = document.createElement('span');
              span.textContent = ' ' + txt + ' ';
              m.parentNode.replaceChild(span, m);
            }
          });
          var fallbackPs = Array.from(fallbackClone.querySelectorAll('p')).filter(function(p) {
            return !p.closest('details');
          });
          var fallbackText = fallbackPs
            .map(function(p) { return p.textContent.trim(); })
            .filter(function(t) { return t.length > 5; })
            .join(' ')
            .substring(0, 1500);
          if (fallbackText.length > studentPrompt.length) { studentPrompt = fallbackText; }
        }
      }

      return {
        index: ${i},
        name: (s.querySelector(sel.studentName) ? s.querySelector(sel.studentName).textContent.trim() : '') || ('Student ' + (${i} + 1)),
        currentScore: s.querySelector(sel.scoreInput) ? s.querySelector(sel.scoreInput).value : '',
        hasFeedback: (fbBox ? fbBox.textContent.trim().length : 0) > 0,
        response: responseDiv ? (function() { try { return window.__turndownService.turndown(responseDiv.innerHTML); } catch(e) { return responseDiv.textContent.trim(); } })() : '',
        prompt: studentPrompt || undefined
      };
  })()`);
    if (student) students.push(student);
    await delay(50); // brief pause so each student is visible before jumping to the next
  }

  if (students.length === 0) {
    throw new Error('Failed to extract students. Check that the site profile selectors are correct.');
  }
  return students;
}

/**
 * Extract rubric data from the first student section on the page.
 *
 * Extracts the essay prompt, grading checklist, rubric targets, model response,
 * and max score from the first student's question region.
 *
 * @param selectors - CSS selectors from the active site profile
 * @returns Rubric data from the page
 * @throws Error if rubric extraction fails
 */
export async function extractRubric(selectors: SiteSelectors, studentIndex: number = 0): Promise<Rubric> {
  await ensureTurndownLoaded();
  const result = await evalScriptJSON<Rubric | null>(`(function() {
    ${GET_PART_CONTENT_HELPER}
    var sel = ${JSON.stringify(selectors)};
    if (!sel.studentSection) return null;
    var first = document.querySelectorAll(sel.studentSection)[${studentIndex}];
    if (!first) return null;

    var region = sel.questionRegion ? first.querySelector(sel.questionRegion) : null;

    var checklistItems = [];
    var rubricItems = [];
    var modelText = null;
    var essayPrompt = '';

    if (region) {
      var part1Div = getPartContent(region, 0);
      var promptDiv = part1Div ? part1Div.children[0] : null;

      var checkDetails = promptDiv ? promptDiv.querySelector('details') : null;
      var checkDiv = checkDetails ? checkDetails.querySelector('div') : null;
      if (checkDiv) {
        checklistItems = Array.from(checkDiv.querySelectorAll('tr')).map(function(tr) {
          var bEl = tr.querySelector('b');
          return {
            category: bEl ? bEl.textContent.trim() : '',
            items: Array.from(tr.querySelectorAll('label')).map(function(l) { return l.textContent.trim(); })
          };
        }).filter(function(x) { return x.category || x.items.length; });
      }

      // Fallback: find checklist by summary text if initial child-index path missed it
      if (!checklistItems.length) {
        Array.from(region.querySelectorAll('details')).forEach(function(det) {
          var summary = det.querySelector('summary');
          if (!summary || summary.textContent.indexOf('Checklist') === -1) return;
          var div = det.querySelector('div');
          if (!div) return;
          var rows = Array.from(div.querySelectorAll('tr')).map(function(tr) {
            var bEl = tr.querySelector('b');
            return {
              category: bEl ? bEl.textContent.trim() : '',
              items: Array.from(tr.querySelectorAll('label')).map(function(l) { return l.textContent.trim(); })
            };
          }).filter(function(x) { return x.category || x.items.length; });
          if (rows.length && !checklistItems.length) { checklistItems = rows; }
        });
      }

      var part2Div = region.querySelectorAll(':scope > div')[1]; // Second direct div = Part 2/rubric
      var rubDetails = part2Div ? part2Div.querySelector('details') : null;
      var rubDiv = rubDetails ? rubDetails.querySelector('div') : null;
      if (rubDiv) {
        rubricItems = Array.from(rubDiv.querySelectorAll('tr')).map(function(tr) {
          var bEl = tr.querySelector('b');
          return {
            category: bEl ? bEl.textContent.trim() : '',
            items: Array.from(tr.querySelectorAll('li')).map(function(l) { return l.textContent.trim(); })
          };
        }).filter(function(x) { return x.category || x.items.length; });
        var modelDiv = rubDiv.querySelector('div');
        modelText = modelDiv ? (function() { try { return window.__turndownService.turndown(modelDiv.innerHTML); } catch(e) { return modelDiv.textContent.trim(); } })() : null;
        if (modelText === '') modelText = null;
      }

      // Replace MathJax-rendered math with aria-label text so the equation
      // (e.g. "y hat equals 30 plus 9 x") survives turndown's HTML→markdown.
      var promptClone = promptDiv ? promptDiv.cloneNode(true) : null;
      if (promptClone) {
        promptClone.querySelectorAll('mjx-container, .MathJax, [data-mathml], math').forEach(function(m) {
          var aria = m.getAttribute('aria-label') || (m.querySelector('[aria-label]') ? m.querySelector('[aria-label]').getAttribute('aria-label') : null);
          if (aria) {
            var txt = aria.replace(/,\s*math\s*$/, '').trim();
            var span = document.createElement('span');
            span.textContent = ' ' + txt + ' ';
            m.parentNode.replaceChild(span, m);
          }
        });
      }
      var promptPs = promptClone ? promptClone.querySelectorAll(':scope > p, :scope > div > p') : [];
      essayPrompt = Array.from(promptPs)
        .map(function(p) { try { return window.__turndownService.turndown(p.outerHTML); } catch(e) { return p.textContent.trim(); } })
        .join(' ')
        .substring(0, 1500);

      // Fallback: if essayPrompt still short/empty, scan all <p> in region
      // excluding those inside <details> (which contain rubric/checklist items)
      if (!essayPrompt || essayPrompt.length < 30) {
        var fallbackClone = region.cloneNode(true);
        fallbackClone.querySelectorAll('mjx-container, .MathJax, [data-mathml], math').forEach(function(m) {
          var aria = m.getAttribute('aria-label') || (m.querySelector('[aria-label]') ? m.querySelector('[aria-label]').getAttribute('aria-label') : null);
          if (aria) {
            var txt = aria.replace(/,\s*math\s*$/, '').trim();
            var span = document.createElement('span');
            span.textContent = ' ' + txt + ' ';
            m.parentNode.replaceChild(span, m);
          }
        });
        var fallbackPs = Array.from(fallbackClone.querySelectorAll('p')).filter(function(p) {
          return !p.closest('details');
        });
        var fallbackText = fallbackPs
          .map(function(p) { return p.textContent.trim(); })
          .filter(function(t) { return t.length > 5; })
          .join(' ')
          .substring(0, 1500);
        if (fallbackText.length > essayPrompt.length) { essayPrompt = fallbackText; }
      }

      // Fallback: if no rubric/checklist items found via child indices,
      // scan all <details> elements anywhere in the region
      if (!checklistItems.length && !rubricItems.length) {
        Array.from(region.querySelectorAll('details')).forEach(function(det) {
          var div = det.querySelector('div');
          if (!div) return;
          var rows = Array.from(div.querySelectorAll('tr')).map(function(tr) {
            var bEl = tr.querySelector('b');
            return {
              category: bEl ? bEl.textContent.trim() : '',
              items: Array.from(tr.querySelectorAll('li, label')).map(function(l) { return l.textContent.trim(); })
            };
          }).filter(function(x) { return x.category || x.items.length; });
          if (rows.length) { rubricItems = rubricItems.concat(rows); }
        });
      }
    }

    var scoreInput = first.querySelector(sel.scoreInput);
    var maxMatch = scoreInput && scoreInput.parentElement
      ? scoreInput.parentElement.textContent.match(/\\/(\\d+\\.?\\d*)/)
      : null;
    var maxScore = maxMatch ? maxMatch[1] : '10';

    return { essayPrompt: essayPrompt, checklistItems: checklistItems, rubricItems: rubricItems, modelText: modelText, maxScore: maxScore };
  })()`);

  if (!result) {
    throw new Error('Failed to extract rubric. Could not find student sections on this page.');
  }
  return result;
}

/**
 * Extract a prompt text fingerprint from every student's question region.
 *
 * Returns a mapping of student page-index → normalized prompt text (first 500 chars).
 * Students with identical fingerprints share the same question version.
 * Runs as a single evalScriptJSON call for efficiency.
 *
 * Two normalizations are applied so that students on the same version collapse
 * to the same fingerprint even when MOM randomises numeric values per-student:
 *
 *   1. Only the prompt+checklist area (part1.children[0]) is fingerprinted —
 *      NOT the full Part 1 div, which also contains the student's unique response
 *      text.  Using the full Part 1 div was the original bug: every student had a
 *      unique fingerprint simply because their answers differed.
 *
 *   2. Numeric tokens are stripped from the prompt text.  MOM injects different
 *      randomised values (e.g. "$47,200", "12.5%", "350 bacteria") into the same
 *      version's prompt for each student.  Stripping digits collapses those
 *      per-student variants back to a single structural fingerprint per version.
 *
 * @param selectors - CSS selectors from the active site profile
 * @returns Record mapping student index to their normalized prompt fingerprint
 */
export async function extractPromptFingerprints(selectors: SiteSelectors): Promise<Record<number, string>> {
  const result = await evalScriptJSON<Record<number, string>>(`(function() {
    ${GET_PART_CONTENT_HELPER}
    var sel = ${JSON.stringify(selectors)};
    if (!sel.studentSection) return {};
    var sections = document.querySelectorAll(sel.studentSection);
    var fingerprints = {};
    for (var i = 0; i < sections.length; i++) {
      var region = sel.questionRegion ? sections[i].querySelector(sel.questionRegion) : null;
      if (!region) { fingerprints[i] = ''; continue; }
      // part1Div is the Part 1 content container (unwrapped from seqsepwrap if present).
      // children[0] of part1Div is the prompt+checklist area — it excludes the student
      // response div (children[1]), which is unique per student and must NOT be included
      // in the fingerprint.
      var part1Div = getPartContent(region, 0);
      var promptArea = part1Div ? part1Div.children[0] : null;
      // Fall back to part1Div.textContent if promptArea is missing OR empty
      // (a truthy-but-empty element would otherwise collapse every student to "").
      var raw = (promptArea && promptArea.textContent.trim())
        ? promptArea.textContent
        : (part1Div ? part1Div.textContent : '');
      // Strip numeric tokens (integers, decimals, comma-separated numbers, currency
      // prefixes) so per-student randomised values don't split a single version into
      // many.  The structural words that distinguish real versions are preserved.
      var text = raw
        .replace(/[$][\\d,]+\\.?\\d*/g, '#')
        .replace(/\\b[\\d,]+\\.?\\d*\\b/g, '#')
        .replace(/(#[\\s]*)+/g, '# ')
        // Strip proper names (including multi-word, accented like "Sebastián")
        // that follow context patterns so per-student randomised names
        // don't split versions. Uses [^\\s,] to match any non-space non-comma char
        // including accented letters (á, é, ñ, etc.).
        .replace(/,\\s*[A-Z][^\\s,]+(?:\\s+[A-Z][^\\s,]+)*\\s*,/g, ', @, ')
        .replace(/\\bnamed\\s+[A-Z][^\\s,]+(?:\\s+[A-Z][^\\s,]+)*/gi, 'named @')
        .replace(/\\bfor\\s+[A-Z][^\\s,]+(?:\\s+[A-Z][^\\s,]+)*/g, 'for @')
        .replace(/\\s+/g, ' ')
        .trim()
        .substring(0, 500);
      fingerprints[i] = text;
    }
    return fingerprints;
  })()`);
  const fingerprints = result || {};
  return fingerprints;
}

/**
 * Extract the version-specific essayPrompt and modelText from a specific student.
 *
 * Uses the same DOM traversal as extractRubric but only returns the prompt and
 * model response text — the parts that differ between question versions.
 *
 * @param selectors - CSS selectors from the active site profile
 * @param studentIndex - Zero-based index of the student on the page
 * @returns Object with essayPrompt and modelText for this student's version
 */
export async function extractVersionPromptData(
  selectors: SiteSelectors,
  studentIndex: number,
): Promise<{ essayPrompt: string; modelText: string | null }> {
  await ensureTurndownLoaded();
  const result = await evalScriptJSON<{ essayPrompt: string; modelText: string | null } | null>(`(function() {
    ${GET_PART_CONTENT_HELPER}
    var sel = ${JSON.stringify(selectors)};
    if (!sel.studentSection) return null;
    var student = document.querySelectorAll(sel.studentSection)[${studentIndex}];
    if (!student) return null;

    var region = sel.questionRegion ? student.querySelector(sel.questionRegion) : null;
    if (!region) return { essayPrompt: '', modelText: null };

    var essayPrompt = '';
    var modelText = null;

    // Extract essay prompt from Part 1 promptDiv (unwrapped from seqsepwrap if present)
    var part1Div = getPartContent(region, 0);
    var promptDiv = part1Div ? part1Div.children[0] : null;
    if (promptDiv) {
      var promptPs = promptDiv.querySelectorAll(':scope > p, :scope > div > p, :scope > ul, :scope > ol');
      essayPrompt = Array.from(promptPs)
        .map(function(p) {
          // Skip elements inside <details> (checklist/rubric)
          if (p.closest('details')) return '';
          try { return window.__turndownService.turndown(p.outerHTML); } catch(e) { return p.textContent.trim(); }
        })
        .filter(function(t) { return t.length > 0; })
        .join(' ')
        .substring(0, 500);

      // Fallback: scan all <p> in region excluding <details>
      if (!essayPrompt || essayPrompt.length < 30) {
        var fallbackPs = Array.from(region.querySelectorAll('p')).filter(function(p) {
          return !p.closest('details');
        });
        var fallbackText = fallbackPs
          .map(function(p) { return p.textContent.trim(); })
          .filter(function(t) { return t.length > 5; })
          .join(' ')
          .substring(0, 500);
        if (fallbackText.length > essayPrompt.length) { essayPrompt = fallbackText; }
      }
    }

    // Extract model text from Part 2 rubric details (unwrapped from seqsepwrap if present)
    var part2Div = getPartContent(region, 1);
    var rubDetails = part2Div ? part2Div.querySelector('details') : null;
    var rubDiv = rubDetails ? rubDetails.querySelector('div') : null;
    if (rubDiv) {
      var modelDiv = rubDiv.querySelector('div');
      modelText = modelDiv ? (function() {
        try { return window.__turndownService.turndown(modelDiv.innerHTML); } catch(e) { return modelDiv.textContent.trim(); }
      })() : null;
      if (modelText === '') modelText = null;
    }

    return { essayPrompt: essayPrompt, modelText: modelText };
  })()`);
  return result || { essayPrompt: '', modelText: null };
}

/**
 * Group students by their prompt fingerprint into version groups.
 *
 * Students with identical fingerprints are placed in the same version group.
 * If all students share one fingerprint, a single group is returned (no-op case).
 *
 * @param students - Array of extracted students
 * @param fingerprints - Mapping of student index → prompt fingerprint
 * @returns Array of version groups, one per distinct fingerprint
 */
export function groupStudentsByVersion(
  students: Student[],
  fingerprints: Record<number, string>,
): VersionGroup[] {
  const groups = new Map<string, Student[]>();

  for (const student of students) {
    const fp = fingerprints[student.index] || '';
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp)!.push(student);
  }

  let versionNumber = 1;
  const result: VersionGroup[] = [];
  for (const [fingerprint, groupStudents] of groups) {
    result.push({
      versionNumber: versionNumber++,
      fingerprint,
      representativeIndex: groupStudents[0].index,
      students: groupStudents,
      essayPrompt: '',
      modelText: null,
    });
  }
  return result;
}

/**
 * Scan the page for assignment-related text when formal rubric extraction fails.
 *
 * Platform-agnostic fallback that tries multiple selector strategies in priority order:
 * 1. Canvas rubric criteria table
 * 2. LMS assignment description
 * 3. MyOpenMath question region
 * 4. Submission preview iframe
 * 5. Generic page headings + nearby content
 * 6. Page body text
 *
 * @returns Extracted content and its source identifier
 */
export async function extractPageContent(): Promise<PageContent> {
  await ensureTurndownLoaded();
  try {
    const result = await evalScriptJSON<PageContent>(`(function() {
      function cleanText(raw) {
        return raw
          .split('\\n')
          .map(function(l) { return l.replace(/\\s+/g, ' ').trim(); })
          .filter(function(l, i, arr) { return !(l === '' && (i === 0 || arr[i - 1] === '')); })
          .join('\\n')
          .trim();
      }

      var rubricCriteria = document.querySelectorAll(
        '#rubric_summary_container .criterion .description, ' +
        '.rubric_table .criterion_description, ' +
        '.rubric_criterion .description'
      );
      if (rubricCriteria.length > 0) {
        var text = Array.from(rubricCriteria)
          .map(function(el) { return el.textContent.trim(); })
          .filter(function(t) { return t.length > 0; })
          .join('\\n');
        if (text.length > 30) return { content: (function() { try { return window.__turndownService.turndown(rubricCriteria[0].innerHTML).substring(0, 3000); } catch(e) { return cleanText(text).substring(0, 2000); } })(), source: 'rubric_table' };
      }

      var descSelectors = [
        '.description .user_content',
        '#assignment_description',
        '.assignment-description',
        '.assignment_description',
        '.description-text'
      ];
      for (var d = 0; d < descSelectors.length; d++) {
        var el = document.querySelector(descSelectors[d]);
        if (el) {
          var text = el.textContent.trim();
          if (text.length > 30) return { content: (function() { try { return window.__turndownService.turndown(el.innerHTML).substring(0, 3000); } catch(e) { return cleanText(text).substring(0, 2000); } })(), source: 'assignment_description' };
        }
      }

      var qRegion = document.querySelector('.question-region, div[data-qn]');
      if (qRegion) {
        var text = qRegion.textContent.trim();
        if (text.length > 30) return { content: (function() { try { return window.__turndownService.turndown(qRegion.innerHTML).substring(0, 3000); } catch(e) { return cleanText(text).substring(0, 2000); } })(), source: 'question_region' };
      }

      var iframeSelectors = [
        '#submission-preview-iframe',
        'iframe[id*="preview"]',
        'iframe[src*="submission"]'
      ];
      for (var f = 0; f < iframeSelectors.length; f++) {
        var iframe = document.querySelector(iframeSelectors[f]);
        if (iframe) {
          try {
            var doc = iframe.contentDocument || (iframe.contentWindow ? iframe.contentWindow.document : null);
            if (doc && doc.body) {
              var text = doc.body.textContent.trim();
              if (text.length > 30 && text.indexOf('No Preview Available') === -1) {
                return { content: (function() { try { return window.__turndownService.turndown(doc.body.innerHTML).substring(0, 3000); } catch(e) { return cleanText(text).substring(0, 2000); } })(), source: 'submission_iframe' };
              }
            }
          } catch(e) { /* cross-origin */ }
        }
      }

      var headings = document.querySelectorAll('h1, h2, h3');
      if (headings.length > 0) {
        var parts = [];
        for (var h = 0; h < headings.length; h++) {
          parts.push(headings[h].textContent.trim());
          var sibling = headings[h].nextElementSibling;
          while (sibling && ['H1','H2','H3'].indexOf(sibling.tagName) === -1) {
            if (sibling.textContent.trim().length > 10) {
              parts.push(sibling.textContent.trim());
            }
            sibling = sibling.nextElementSibling;
            if (parts.join('\\n').length > 1500) break;
          }
        }
        var text = parts.join('\\n');
        if (text.length > 50) return { content: (function() { try { return window.__turndownService.turndown(document.body.innerHTML).substring(0, 3000); } catch(e) { return cleanText(text).substring(0, 2000); } })(), source: 'page_headings' };
      }

      var body = document.body ? document.body.textContent.trim() : '';
      if (body.length > 100) {
        return { content: (function() { try { return window.__turndownService.turndown(document.body.innerHTML).substring(0, 3000); } catch(e) { return cleanText(body).substring(0, 2000); } })(), source: 'page_content' };
      }

      return { content: '', source: '' };
    })()`);

    return result || { content: '', source: '' };
  } catch {
    return { content: '', source: '' };
  }
}

// ============================================================================
// Pure Logic Helpers
// ============================================================================

/**
 * Check whether the extracted rubric has enough content for meaningful grading.
 *
 * Used by all modes (batch + sequential) to determine if fallback content
 * extraction is needed.
 *
 * @param rubric - Rubric data from extractRubric()
 * @returns true if the rubric has sufficient content for grading
 */
export function isRubricSufficient(rubric: Rubric | null): boolean {
  if (!rubric) return false;
  if (rubric.checklistItems?.length > 0) return true;
  if (rubric.rubricItems?.length > 0) return true;
  if (rubric.essayPrompt && rubric.essayPrompt.length > 50) return true;
  return false;
}

/**
 * Convert the rubric object into human-readable text for review.
 *
 * Formats the rubric sections (prompt, targets, model response, max score)
 * into a readable text block.
 *
 * @param rubric - Rubric data from extractRubric()
 * @returns Formatted rubric text
 */
export function formatRubricForReview(rubric: Rubric | null): string {
  if (!rubric) return '';
  const lines: string[] = [];

  if (rubric.essayPrompt) {
    lines.push('--- Question/Prompt ---');
    const cleaned = rubric.essayPrompt
      .split('\n')
      .map(l => l.trim())
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
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

// ============================================================================
// DOM Manipulation Functions
// ============================================================================

/**
 * Fill a score and feedback for a specific student on the page.
 *
 * Scrolls to the student section, sets the score input value, and fills
 * feedback using the strategy appropriate for the site profile
 * (TinyMCE inline, contenteditable, or plain textarea).
 *
 * @param studentIndex - Zero-based index of the student on the page
 * @param score - Score to assign
 * @param feedback - Feedback text to fill
 * @param selectors - CSS selectors from the active site profile
 * @param feedbackConfig - Feedback type configuration
 * @throws Error if the student is not found or fill fails
 */

/**
 * Convert AI feedback text to HTML for contenteditable feedback boxes.
 *
 * If the text is already HTML (starts with a tag), strips inter-tag newlines.
 * If the text contains markdown patterns (**bold**, > blockquote, etc.), converts
 * to HTML using marked. Otherwise wraps in <p> tags.
 */
function feedbackToHtml(text: string, htmlWrap: boolean): string {
  // Already HTML — strip inter-tag newlines that would create spurious <p><br></p>
  if (/^\s*</.test(text)) {
    return text.replace(/\n+/g, '');
  }

  // Markdown detected — convert to HTML
  if (/\*\*|__|^>/m.test(text)) {
    return marked.parse(text, { async: false }) as string;
  }

  // Plain text — wrap in <p> tags
  if (htmlWrap) {
    return '<p>' + text.replace(/\n/g, '</p><p>') + '</p>';
  }
  return text;
}

export async function fillGrade(
  studentIndex: number,
  score: number | string,
  feedback: string,
  selectors: SiteSelectors,
  feedbackConfig: FeedbackConfig | null = null,
  studentName: string | null = null,
): Promise<void> {
  const fbConfig = feedbackConfig || { type: 'tinymce-inline' as const, requiresHiddenSync: true, htmlWrap: true };

  // Pre-convert feedback to HTML before injecting into the page.
  // This handles markdown fallback (when AI returns **bold** or > quote instead of
  // <strong>/<blockquote>) as well as the existing HTML and plain-text paths.
  const html = feedbackToHtml(feedback, fbConfig.htmlWrap);

  const result = await evalScriptJSON<FillResult>(`(function() {
    var sel = ${JSON.stringify(selectors)};
    var idx = ${JSON.stringify(studentIndex)};
    var expectedName = ${JSON.stringify(studentName || '')};
    var scoreVal = ${JSON.stringify(String(score))};
    var fbHtml = ${JSON.stringify(html)};
    var fbRawText = ${JSON.stringify(feedback)};
    var fbCfg = ${JSON.stringify(fbConfig)};

    if (!sel.studentSection) return { success: false, error: 'No studentSection selector' };
    var students = document.querySelectorAll(sel.studentSection);

    // Find student by name first (stable across scroll/reorder), fall back to index
    var student = null;
    if (expectedName && sel.studentName) {
      for (var i = 0; i < students.length; i++) {
        var nameEl = students[i].querySelector(sel.studentName);
        if (nameEl && nameEl.textContent.trim() === expectedName) {
          student = students[i];
          break;
        }
      }
    }
    if (!student) student = students[idx];
    if (!student) return { success: false, error: 'Student "' + expectedName + '" (index ' + idx + ') not found' };

    student.scrollIntoView({ behavior: 'smooth', block: 'center' });

    var scoreInput = sel.scoreInput ? student.querySelector(sel.scoreInput) : null;
    if (scoreInput) {
      // Focus + clear + set to reliably overwrite existing scores.
      // Some LMS pages (MyOpenMath) only persist the value on blur/focusout,
      // or track internal state that .value= alone doesn't update.
      scoreInput.focus();
      scoreInput.select();
      // Use the native HTMLInputElement value setter to bypass any framework wrappers
      var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(scoreInput, scoreVal);
      scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
      scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    var fbBox = sel.feedbackBox ? student.querySelector(sel.feedbackBox) : null;

    if (fbCfg.type === 'tinymce-inline' || fbCfg.type === 'contenteditable') {
      // innerHTML is required here: MOM's TinyMCE-inline editors expect HTML.
      // Content is teacher-authored AI feedback, not arbitrary untrusted input.
      if (fbBox) {
        fbBox.innerHTML = fbHtml;
        if (fbBox.classList) fbBox.classList.remove('skipmathrender');
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (fbCfg.requiresHiddenSync && sel.feedbackHidden) {
        var hidden = student.querySelector(sel.feedbackHidden);
        if (hidden) hidden.value = fbHtml;
      }
    } else {
      if (fbBox) {
        fbBox.value = fbRawText;
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        fbBox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Trigger math render. MOM's rendermathnode() drives MathJax's AsciiMath
    // input jax (backtick delimiters). Fall back to MathJax.typeset().
    try {
      if (fbBox && typeof window.rendermathnode === 'function') {
        window.rendermathnode(fbBox);
      } else if (window.MathJax && window.MathJax.typeset) {
        window.MathJax.typeset();
      }
    } catch(e) {}
    return { success: true };
  })()`);

  if (!result?.success) {
    throw new Error(result?.error || 'Unknown error filling grade');
  }
}

/**
 * Click the save button on the grading page.
 *
 * Searches for buttons matching the save configuration text. Falls back
 * to secondary button text, then to any submit-type button.
 *
 * @param saveConfig - Save button configuration from the site profile
 * @throws Error if no save button is found
 */
export async function clickQuickSave(saveConfig: SaveConfig | null = null): Promise<void> {
  const cfg = saveConfig || { buttonText: 'Quick Save', fallbackText: 'Save Changes' };

  const result = await evalScriptJSON<FillResult>(`(function() {
    var saveCfg = ${JSON.stringify(cfg)};
    var buttons = document.querySelectorAll('button');

    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].textContent.indexOf(saveCfg.buttonText) !== -1) {
        buttons[i].click();
        return { success: true };
      }
    }

    if (saveCfg.fallbackText) {
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].textContent.indexOf(saveCfg.fallbackText) !== -1) {
          buttons[i].click();
          return { success: true, fallback: true };
        }
      }
    }

    var submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      submitBtn.click();
      return { success: true, fallback: true };
    }

    return { success: false, error: 'Save button not found (looked for "' + saveCfg.buttonText + '")' };
  })()`);

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to click save button');
  }
}

/**
 * Wait for a CSS selector to appear on the page (polling).
 *
 * @param selector - CSS selector to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns true if the selector was found
 * @throws Error if timeout is reached
 */
async function waitForSelector(selector: string, timeoutMs: number = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evalScriptJSON<boolean>(
      `!!document.querySelector(${JSON.stringify(selector)})`,
    );
    if (found) return true;
    await delay(300);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

/**
 * Click the "next student" button and wait for the page to settle.
 *
 * Captures the current student indicator text before navigation, clicks the
 * next button, waits for the configured delay, and verifies that the student
 * indicator changed (indicating successful navigation).
 *
 * @param navigation - Navigation configuration from the site profile
 */
export async function navigateToNextStudent(navigation: NavigationConfig): Promise<void> {
  if (!navigation.nextButton) {
    throw new Error('No nextButton selector configured in navigation profile');
  }

  // Capture current student name before navigating
  const beforeName = await evalScriptJSON<string>(`(function() {
    var sel = ${JSON.stringify(navigation.studentIndicator || '')};
    if (!sel) return '';
    var el = document.querySelector(sel);
    if (!el) return '';
    if (el.tagName === 'SELECT') return el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
    return el.textContent ? el.textContent.trim() : '';
  })()`);

  // Click next button
  await evalScript(`(function() {
    var btn = document.querySelector(${JSON.stringify(navigation.nextButton)});
    if (btn) btn.click();
  })()`);

  // Wait for page to settle
  await delay(navigation.waitAfterNavMs || 2000);

  // Wait for specific selector if configured
  if (navigation.waitForSelector) {
    try {
      await waitForSelector(navigation.waitForSelector);
    } catch {
      // Non-fatal: the selector might already be present or not applicable
    }
  }

  // Verify navigation happened (student indicator should have changed)
  if (navigation.studentIndicator) {
    const afterName = await evalScriptJSON<string>(`(function() {
      var sel = ${JSON.stringify(navigation.studentIndicator)};
      var el = document.querySelector(sel);
      if (!el) return '';
      if (el.tagName === 'SELECT') return el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
      return el.textContent ? el.textContent.trim() : '';
    })()`);

    if (beforeName && afterName && beforeName === afterName) {
    }
  }
}

/**
 * Navigate to the first student in the list.
 *
 * Uses the student dropdown/indicator to select the first item.
 * Supports both native `<select>` elements and custom dropdown UIs.
 *
 * @param navigation - Navigation configuration from the site profile
 */
export async function navigateToFirstStudent(navigation: NavigationConfig): Promise<void> {
  if (!navigation.studentIndicator) {
    throw new Error('No studentIndicator selector configured in navigation profile');
  }

  // Click the dropdown/indicator to open it or select first item
  await evalScript(`(function() {
    var trigger = document.querySelector(${JSON.stringify(navigation.studentIndicator)});
    if (!trigger) return;
    if (trigger.tagName === 'SELECT') {
      trigger.selectedIndex = 0;
      trigger.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      trigger.click();
    }
  })()`);

  await delay(500);

  // For non-<select> dropdowns, click the first option
  await evalScript(`(function() {
    var firstOption = document.querySelector('[data-testid="student-option-0"]');
    if (firstOption && firstOption.tagName !== 'OPTION') {
      firstOption.click();
      return;
    }
    var firstItem = document.querySelector('[role="menuitem"]');
    if (firstItem) firstItem.click();
  })()`);

  await delay(navigation.waitAfterNavMs || 2000);

  if (navigation.waitForSelector) {
    try {
      await waitForSelector(navigation.waitForSelector);
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Get current student info from a sequential grading page.
 *
 * Reads the currently-displayed student's name, score, and feedback status
 * using page-level selectors (not scoped to a student section).
 *
 * @param selectors - CSS selectors from the active site profile
 * @returns Current student information
 */
export async function getCurrentStudentInfo(
  selectors: SiteSelectors,
): Promise<{ name: string; currentScore: string; hasFeedback: boolean }> {
  const result = await evalScriptJSON<{ name: string; currentScore: string; hasFeedback: boolean }>(`(function() {
    var sel = ${JSON.stringify(selectors)};
    var nameEl = sel.studentName ? document.querySelector(sel.studentName) : null;
    var name = '';
    if (nameEl) {
      name = nameEl.tagName === 'SELECT'
        ? (nameEl.selectedOptions && nameEl.selectedOptions[0] ? nameEl.selectedOptions[0].textContent.trim() : '')
        : (nameEl.textContent ? nameEl.textContent.trim() : '');
    }
    var score = '';
    if (sel.scoreInput) {
      var scoreEl = document.querySelector(sel.scoreInput);
      score = scoreEl ? scoreEl.value : '';
    }
    var hasFeedback = false;
    if (sel.feedbackBox) {
      var fbEl = document.querySelector(sel.feedbackBox);
      hasFeedback = fbEl ? (fbEl.textContent ? fbEl.textContent.trim().length > 0 : false) : false;
    }
    return { name: name, currentScore: score, hasFeedback: hasFeedback };
  })()`);

  return result || { name: '', currentScore: '', hasFeedback: false };
}

// ============================================================================
// Default Selectors
// ============================================================================

/** Default MyOpenMath site selectors. */
export const DEFAULT_MYOPENMATH_SELECTORS: SiteSelectors = {
  studentSection: 'div[data-lastchange]',
  studentName: 'b',
  questionRegion: 'div[role="region"][aria-label^="Question"]',
  scoreInput: 'input[aria-label="Score"]',
  feedbackBox: 'div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]',
  feedbackHidden: 'input[type="hidden"][name^="fb-"]',
  fullCreditLink: 'a.fullcredlink',
};

/** Default MyOpenMath feedback configuration. */
export const DEFAULT_MYOPENMATH_FEEDBACK: FeedbackConfig = {
  type: 'tinymce-inline',
  requiresHiddenSync: true,
  htmlWrap: true,
};

/** Default MyOpenMath save configuration. */
export const DEFAULT_MYOPENMATH_SAVE: SaveConfig = {
  buttonText: 'Quick Save',
  fallbackText: 'Save Changes',
};

/** Default MyOpenMath site profile. */
export const DEFAULT_MYOPENMATH_PROFILE: SiteProfile = {
  id: 'myopenmath',
  name: 'MyOpenMath',
  isBuiltIn: true,
  urlPatterns: ['gradeallq2.php', 'myopenmath.com', 'demo-grading-page.html', 'mock-myopenmath'],
  selectors: DEFAULT_MYOPENMATH_SELECTORS,
  feedback: DEFAULT_MYOPENMATH_FEEDBACK,
  save: DEFAULT_MYOPENMATH_SAVE,
  navigation: { mode: 'batch' },
};

/** Canvas SpeedGrader CSS selectors. */
export const CANVAS_SPEEDGRADER_SELECTORS: SiteSelectors = {
  studentSection: null, // sequential mode — one student at a time
  studentName: '[data-testid="student-select-trigger"]',
  questionRegion: '#submission-preview-iframe',
  scoreInput: '[data-testid="grade-input"]',
  feedbackBox: null, // TinyMCE iframe — handled by fillGradeSequential
  feedbackHidden: null,
  fullCreditLink: null,
};

/** Canvas SpeedGrader feedback configuration. */
export const CANVAS_SPEEDGRADER_FEEDBACK: FeedbackConfig = {
  type: 'tinymce-iframe',
  requiresHiddenSync: false,
  htmlWrap: true,
};

/** Canvas SpeedGrader save configuration. */
export const CANVAS_SPEEDGRADER_SAVE: SaveConfig = {
  buttonText: 'Submit',
  fallbackText: 'Save',
};

/** Canvas SpeedGrader navigation configuration. */
export const CANVAS_SPEEDGRADER_NAV: NavigationConfig = {
  mode: 'sequential',
  nextButton: '[data-testid="next-student-button"]',
  prevButton: '[data-testid="previous-student-button"]',
  studentIndicator: '[data-testid="student-select-trigger"]',
  waitAfterNavMs: 2000,
  waitForSelector: '[data-testid="grade-input"]',
  submitPerStudent: true,
  submitButton: '[data-testid="submit-comment-button"]',
};

/** Canvas SpeedGrader site profile. */
export const CANVAS_SPEEDGRADER_PROFILE: SiteProfile = {
  id: 'canvas-speedgrader',
  name: 'Canvas SpeedGrader',
  isBuiltIn: true,
  urlPatterns: ['speed_grader', 'speedgrader'],
  selectors: CANVAS_SPEEDGRADER_SELECTORS,
  feedback: CANVAS_SPEEDGRADER_FEEDBACK,
  save: CANVAS_SPEEDGRADER_SAVE,
  navigation: CANVAS_SPEEDGRADER_NAV,
};

/** All built-in site profiles. */
export const BUILT_IN_PROFILES: SiteProfile[] = [
  DEFAULT_MYOPENMATH_PROFILE,
  CANVAS_SPEEDGRADER_PROFILE,
];

/**
 * Auto-detect the correct profile for the current page URL.
 * Returns the first profile whose urlPatterns match, or the MyOpenMath default.
 */
export async function detectProfile(profiles: SiteProfile[] = BUILT_IN_PROFILES): Promise<SiteProfile> {
  const { getEmbeddedUrl } = await import('./browser');
  let url = '';
  try {
    url = (await getEmbeddedUrl()) || '';
  } catch {
    // If we can't get the URL, fall back to default
  }
  const urlLower = url.toLowerCase();
  for (const profile of profiles) {
    if (profile.urlPatterns.some(p => urlLower.includes(p.toLowerCase()))) {
      return profile;
    }
  }
  return DEFAULT_MYOPENMATH_PROFILE;
}

// ============================================================================
// BatchGrader Class
// ============================================================================

/**
 * Stateful batch grading coordinator.
 *
 * Manages the lifecycle of a batch grading session: initialization (extracting
 * students and rubric from the page), tracking which students have been graded,
 * applying grades, saving progress, and navigating between students.
 *
 * The actual AI grading call is external — this class handles only the page
 * interaction and state management aspects.
 *
 * @example
 * ```ts
 * const grader = new BatchGrader();
 * await grader.start(profile);
 *
 * while (grader.isRunning) {
 *   const student = grader.getNextStudent();
 *   if (!student) break;
 *
 *   const { score, feedback } = await externalAIGrade(student, grader.rubric);
 *   await grader.applyGrade(student.index, score, feedback);
 * }
 *
 * console.log(grader.getProgress());
 * ```
 */
export class BatchGrader {
  /** All students extracted from the page */
  private _students: Student[] = [];

  /** Students that need grading (filtered from _students) */
  private _toGrade: Student[] = [];

  /** Index into _toGrade for the next student to process */
  private _currentIndex: number = 0;

  /** Extracted rubric data */
  private _rubric: Rubric | null = null;

  /** Whether a grading session is currently active */
  private _isRunning: boolean = false;

  /** Whether the session is paused */
  private _paused: boolean = false;

  /** Accumulated grading results */
  private _results: GradeResult[] = [];

  /** Accumulated errors */
  private _errors: Array<{ name: string; error: string }> = [];

  /** Names of skipped students */
  private _skipped: string[] = [];

  /** Students with no response (eligible for auto-zero). */
  private _noResponse: Student[] = [];

  /** Active site profile */
  private _profile: SiteProfile | null = null;

  /** Chronological log of all grading actions */
  private _log: BatchLogEntry[] = [];

  /** Version groups detected on the page */
  private _versionGroups: VersionGroup[] = [];

  /** Index of the version group currently being graded */
  private _currentVersionIndex: number = 0;

  // -- Public Accessors --

  /** Get the extracted rubric. */
  get rubric(): Rubric | null {
    return this._rubric;
  }

  /** Get all extracted students. */
  get students(): Student[] {
    return this._students;
  }

  /** Get the filtered list of students that need grading. */
  get studentsToGrade(): Student[] {
    return this._toGrade;
  }
  /** Students that submitted no response (filtered from _students). */
  get noResponseStudents(): Student[] {
    return this._noResponse;
  }

  /** Whether the grading session is running. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Whether the grading session is paused. */
  get isPaused(): boolean {
    return this._paused;
  }

  /** Get all detected version groups. */
  get versionGroups(): VersionGroup[] {
    return this._versionGroups;
  }

  /** Get the current version group index being graded. */
  get currentVersionIndex(): number {
    return this._currentVersionIndex;
  }

  /** Get the total number of detected versions. */
  get versionCount(): number {
    return this._versionGroups.length;
  }

  /** Whether multiple question versions were detected. */
  get hasMultipleVersions(): boolean {
    return this._versionGroups.length > 1;
  }

  /**
   * Get the filtered (to-grade) students for a specific version group.
   *
   * @param versionIndex - Zero-based version group index
   * @returns Students needing grading that belong to this version
   */
  getStudentsForVersion(versionIndex: number): Student[] {
    if (versionIndex >= this._versionGroups.length) return [];
    const versionStudentIndices = new Set(
      this._versionGroups[versionIndex].students.map(s => s.index),
    );
    return this._toGrade.filter(s => versionStudentIndices.has(s.index));
  }

  /**
   * Get a merged rubric for a specific version: shared structure + version-specific prompt/model.
   *
   * @param versionIndex - Zero-based version group index
   * @returns Rubric with version-specific essayPrompt and modelText, or null
   */
  getRubricForVersion(versionIndex: number): Rubric | null {
    if (!this._rubric) return null;
    const group = this._versionGroups[versionIndex];
    if (!group) return null;
    return {
      ...this._rubric,
      essayPrompt: group.essayPrompt,
      modelText: group.modelText,
    };
  }

  /**
   * Advance to the next version group.
   *
   * @returns true if there are more versions, false if all versions are done
   */
  advanceVersion(): boolean {
    if (this._currentVersionIndex < this._versionGroups.length - 1) {
      this._currentVersionIndex++;
      return true;
    }
    return false;
  }

  // -- Lifecycle Methods --

  /**
   * Initialize a batch grading session.
   *
   * Extracts students and rubric from the page using the provided profile's
   * selectors. Filters students to determine which need grading.
   *
   * @param profile - Site profile describing the grading page
   * @param resumeAfter - Student name to resume after (skip up to and including)
   */
  async start(profile: SiteProfile, resumeAfter?: string | null, forceRegrade = false): Promise<void> {
    this._profile = profile;
    this._isRunning = true;
    this._paused = false;
    this._results = [];
    this._errors = [];
    this._skipped = [];
    this._noResponse = [];
    this._log = [];
    this._currentIndex = 0;
    this._versionGroups = [];
    this._currentVersionIndex = 0;

    // Extract rubric
    try {
      this._rubric = await extractRubric(profile.selectors);
    } catch {
      this._rubric = null;
    }

    // Extract students
    this._students = await extractStudents(profile.selectors);

    // Detect question versions (batch mode only — sequential mode has no studentSection)
    if (profile.navigation.mode === 'batch' && profile.selectors.studentSection) {
      const fingerprints = await extractPromptFingerprints(profile.selectors);

      // Debug: log unique fingerprints to diagnose version splitting
      const uniqueFps = new Set(Object.values(fingerprints));
      console.log(`[BatchGrader] ${Object.keys(fingerprints).length} students, ${uniqueFps.size} unique fingerprints`);
      if (uniqueFps.size > 3) {
        // Likely a fingerprinting bug — log same-scenario students that got different fps
        const entries = Object.entries(fingerprints);
        console.log(`[BatchGrader]   student 0 FULL: "${entries[0]?.[1]}"`);
        console.log(`[BatchGrader]   student 1 FULL: "${entries[1]?.[1]}"`);
        // Find two students that SHOULD match (same first 60 chars) but don't
        for (let j = 2; j < entries.length; j++) {
          if (entries[j][1].substring(0, 60) === entries[1][1].substring(0, 60) && entries[j][1] !== entries[1][1]) {
            console.log(`[BatchGrader]   student ${j} FULL (same scenario, different fp): "${entries[j][1]}"`);
            break;
          }
        }
      }

      this._versionGroups = groupStudentsByVersion(this._students, fingerprints);

      // Extract version-specific prompt/model data from each version's representative student
      for (const group of this._versionGroups) {
        try {
          const data = await extractVersionPromptData(profile.selectors, group.representativeIndex);
          group.essayPrompt = data.essayPrompt;
          group.modelText = data.modelText;
        } catch {
          // Fallback: use the shared rubric's prompt data
          group.essayPrompt = this._rubric?.essayPrompt || '';
          group.modelText = this._rubric?.modelText || null;
        }
      }
    }

    // Filter to ungraded students
    let startIndex = 0;

    if (resumeAfter) {
      const resumeLower = resumeAfter.toLowerCase();
      const resumeLastName = resumeLower.split(',')[0].trim();

      for (let i = 0; i < this._students.length; i++) {
        const nameLower = this._students[i].name.toLowerCase();
        if (nameLower === resumeLower || nameLower.startsWith(resumeLastName)) {
          startIndex = i + 1;
          break;
        }
      }
      for (let i = 0; i < startIndex; i++) {
        this._skipped.push(this._students[i].name);
      }
    }

    this._toGrade = [];
    for (let i = startIndex; i < this._students.length; i++) {
      const student = this._students[i];
      if (!student.response.trim()) {
        this._noResponse.push(student);
        // No response — skip rather than waste a token on a blank submission
        this._skipped.push(student.name);
        this._log.push({
          studentName: student.name,
          studentIndex: student.index,
          score: null,
          feedback: 'No response submitted',
          timestamp: new Date().toISOString(),
          status: 'skipped',
        });
      } else if (!forceRegrade && student.hasFeedback) {
        this._skipped.push(student.name);
        this._log.push({
          studentName: student.name,
          studentIndex: student.index,
          score: null,
          feedback: 'Already has feedback',
          timestamp: new Date().toISOString(),
          status: 'skipped',
        });
      } else {
        const existingScore = parseFloat(student.currentScore);
        if (!forceRegrade && !isNaN(existingScore) && existingScore > 0) {
          this._skipped.push(student.name);
          this._log.push({
            studentName: student.name,
            studentIndex: student.index,
            score: existingScore,
            feedback: 'Already has score',
            timestamp: new Date().toISOString(),
            status: 'skipped',
          });
        } else {
          this._toGrade.push(student);
        }
      }
    }
  }

  /**
   * Get the next student that needs grading.
   *
   * @returns The next ungraded student, or null if all students are processed
   */
  getNextStudent(): Student | null {
    if (!this._isRunning || this._paused) return null;
    if (this._currentIndex >= this._toGrade.length) return null;
    return this._toGrade[this._currentIndex];
  }

  /**
   * Apply a score of 0 to all students with no response.
   * Called when the "Zero No Response" preset is active.
   */
  async applyZeroToNoResponseStudents(): Promise<void> {
    if (!this._profile) throw new Error('BatchGrader not started');
    for (const student of this._noResponse) {
      await fillGrade(student.index, 0, '', this._profile.selectors, this._profile.feedback);
    }
  }

  /**
    * Apply a grade to a student and advance to the next.
    *
    * Fills the score and feedback on the page for the specified student,
    * records the result, and advances the internal pointer.
    *
    * @param studentIndex - Zero-based index of the student on the page
    * @param score - Score to assign
    * @param feedback - Feedback text
    */
  async applyGrade(studentIndex: number, score: number, feedback: string): Promise<void> {
    if (!this._profile) throw new Error('BatchGrader not started');

    // Lookup by actual studentIndex — in batch/multi-version mode results arrive for
    // non-sequential indices (e.g. 4, 7, 9...) while _currentIndex is a sequential
    // counter, so _toGrade[_currentIndex] would give the wrong student and the name
    // lookup in fillGrade would scroll to and fill the wrong DOM row.
    const student = this._toGrade.find(s => s.index === studentIndex)
                 ?? this._toGrade[this._currentIndex];
    const studentName = student?.name || null;

    await fillGrade(
      studentIndex,
      score,
      feedback,
      this._profile.selectors,
      this._profile.feedback,
      studentName,
    );

    const displayName = studentName || `Student ${studentIndex}`;

    // Outlier correction: update in-place rather than pushing a duplicate entry.
    // applyGrade() is called for both initial grades and outlier adjustments, so
    // we must not double-count students that are already in _results.
    const existingIdx = this._results.findIndex(r => r.index === studentIndex);
    if (existingIdx >= 0) {
      this._results[existingIdx] = { name: displayName, index: studentIndex, score, feedback };
    } else {
      this._results.push({ name: displayName, index: studentIndex, score, feedback });
      this._currentIndex++;
    }

    // Mirror the same in-place logic for _log: outlier adjustments update the
    // existing entry rather than pushing a duplicate, so log.length === student count.
    // Primary dedup: match by studentIndex. Fallback: match by studentName (catches
    // cases where the outlier review's positional mapping produces a different index).
    let existingLogIdx = this._log.findLastIndex(e => e.studentIndex === studentIndex && e.status === 'success');
    if (existingLogIdx < 0 && displayName) {
      existingLogIdx = this._log.findLastIndex(e => e.studentName === displayName && e.status === 'success');
    }
    if (existingLogIdx >= 0) {
      this._log[existingLogIdx] = {
        ...this._log[existingLogIdx],
        studentIndex,
        score,
        feedback,
        timestamp: new Date().toISOString(),
      };
    } else {
      this._log.push({
        studentName: displayName,
        studentIndex,
        score,
        feedback,
        timestamp: new Date().toISOString(),
        status: 'success',
      });
    }
  }

  /**
    * Record an error for a student and advance to the next.
    *
    * @param studentName - Name of the student that errored
    * @param error - Error message
    */
  recordError(studentName: string, error: string): void {
    this._errors.push({ name: studentName, error });
    
    const student = this._toGrade.find(s => s.name === studentName)
                 ?? this._toGrade[this._currentIndex];
    this._log.push({
      studentName,
      studentIndex: student?.index ?? this._currentIndex,
      score: null,
      feedback: error,
      timestamp: new Date().toISOString(),
      status: 'error',
    });

    this._currentIndex++;
  }

  /**
   * Save progress by clicking the save button.
   */
  async save(): Promise<void> {
    if (!this._profile) return;
    await clickQuickSave(this._profile.save);
  }

  /** Pause the grading session. */
  pause(): void {
    this._paused = true;
  }

  /** Resume a paused grading session. */
  resume(): void {
    this._paused = false;
  }

  /** Stop the grading session. */
  stop(): void {
    this._isRunning = false;
    this._paused = false;
  }

  /**
   * Get the current progress of the batch grading session.
   *
   * @returns Progress information including counts and state
   */
  getProgress(): BatchProgress {
    return {
      totalStudents: this._students.length,
      gradedCount: this._results.length,
      skippedCount: this._skipped.length,
      errorCount: this._errors.length,
      currentIndex: this._currentIndex,
      isRunning: this._isRunning,
      isPaused: this._paused,
    };
  }

  /**
    * Get the final summary of the grading session.
    *
    * @returns Summary with graded, skipped, and error arrays
    */
  getSummary(): BatchSummary {
    return {
      graded: [...this._results],
      skipped: [...this._skipped],
      errors: [...this._errors],
    };
  }

  /**
    * Get the chronological log of all grading actions.
    *
    * @returns Array of log entries in chronological order
    */
  getLog(): BatchLogEntry[] {
    return [...this._log];
  }
}
