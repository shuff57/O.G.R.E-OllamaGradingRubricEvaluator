/**
 * batch-grader.ts - Desktop batch grading engine
 *
 * Ports the Chrome extension's batch-grader.js to the Tauri desktop app.
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
  console.log('[batch] extractStudents: starting, waiting for Turndown...');
  await ensureTurndownLoaded();
  console.log('[batch] extractStudents: Turndown ready, querying student count...');
  if (!selectors.studentSection) {
    throw new Error('Failed to extract students. Check that the site profile selectors are correct.');
  }

  // Get total student count
  const count = await evalScriptJSON<number>(
    `document.querySelectorAll(${JSON.stringify(selectors.studentSection)}).length`
  );
  console.log('[batch] extractStudents: found', count, 'students, extracting one-by-one...');
  if (!count) {
    throw new Error('Failed to extract students. Check that the site profile selectors are correct.');
  }

  const students: Student[] = [];
  const selJson = JSON.stringify(selectors);

  for (let i = 0; i < count; i++) {
    const student = await evalScriptJSON<Student | null>(`(function() {
      var sel = ${selJson};
      var s = document.querySelectorAll(sel.studentSection)[${i}];
      if (!s) return null;

      // Jump to this student so the extraction is visible
      s.scrollIntoView({ block: 'start' });
      var region = sel.questionRegion ? s.querySelector(sel.questionRegion) : null;
      var responseDiv = (region && region.children[1] && region.children[1].children[1])
        ? region.children[1].children[1]
        : null;
      var fbBox = sel.feedbackBox ? s.querySelector(sel.feedbackBox) : null;
      return {
        index: ${i},
        name: (s.querySelector(sel.studentName) ? s.querySelector(sel.studentName).textContent.trim() : '') || ('Student ' + (${i} + 1)),
        currentScore: s.querySelector(sel.scoreInput) ? s.querySelector(sel.scoreInput).value : '',
        hasFeedback: (fbBox ? fbBox.textContent.trim().length : 0) > 0,
        response: responseDiv ? (function() { try { return window.__turndownService.turndown(responseDiv.innerHTML); } catch(e) { return responseDiv.textContent.trim(); } })() : ''
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
  console.log('[batch] extractRubric: starting, waiting for Turndown...');
  await ensureTurndownLoaded();
  console.log('[batch] extractRubric: Turndown ready, extracting rubric from student', studentIndex, '...');
  const result = await evalScriptJSON<Rubric | null>(`(function() {
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
      var part1Div = region.children[1];
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

      var part2Div = region.children[3];
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

      var promptPs = promptDiv ? promptDiv.querySelectorAll(':scope > p, :scope > div > p') : [];
      essayPrompt = Array.from(promptPs)
        .map(function(p) { try { return window.__turndownService.turndown(p.outerHTML); } catch(e) { return p.textContent.trim(); } })
        .join(' ')
        .substring(0, 500);

      // Fallback: if essayPrompt still short/empty, scan all <p> in region
      // excluding those inside <details> (which contain rubric/checklist items)
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
 * @param selectors - CSS selectors from the active site profile
 * @returns Record mapping student index to their normalized prompt fingerprint
 */
export async function extractPromptFingerprints(selectors: SiteSelectors): Promise<Record<number, string>> {
  const result = await evalScriptJSON<Record<number, string>>(`(function() {
    var sel = ${JSON.stringify(selectors)};
    if (!sel.studentSection) return {};
    var sections = document.querySelectorAll(sel.studentSection);
    var fingerprints = {};
    for (var i = 0; i < sections.length; i++) {
      var region = sel.questionRegion ? sections[i].querySelector(sel.questionRegion) : null;
      if (!region) { fingerprints[i] = ''; continue; }
      var part1Div = region.children[1];
      var promptDiv = part1Div ? part1Div.children[0] : null;
      var text = promptDiv ? promptDiv.textContent.replace(/\\s+/g, ' ').trim().substring(0, 500) : '';
      fingerprints[i] = text;
    }
    return fingerprints;
  })()`);
  return result || {};
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
    var sel = ${JSON.stringify(selectors)};
    if (!sel.studentSection) return null;
    var student = document.querySelectorAll(sel.studentSection)[${studentIndex}];
    if (!student) return null;

    var region = sel.questionRegion ? student.querySelector(sel.questionRegion) : null;
    if (!region) return { essayPrompt: '', modelText: null };

    var essayPrompt = '';
    var modelText = null;

    // Extract essay prompt from Part 1 promptDiv
    var part1Div = region.children[1];
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

    // Extract model text from Part 2 rubric details
    var part2Div = region.children[3];
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
export async function fillGrade(
  studentIndex: number,
  score: number | string,
  feedback: string,
  selectors: SiteSelectors,
  feedbackConfig: FeedbackConfig | null = null,
  studentName: string | null = null,
): Promise<void> {
  const fbConfig = feedbackConfig || { type: 'tinymce-inline' as const, requiresHiddenSync: true, htmlWrap: true };

  const result = await evalScriptJSON<FillResult>(`(function() {
    var sel = ${JSON.stringify(selectors)};
    var idx = ${JSON.stringify(studentIndex)};
    var expectedName = ${JSON.stringify(studentName || '')};
    var scoreVal = ${JSON.stringify(String(score))};
    var feedbackText = ${JSON.stringify(feedback)};
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
      var html = fbCfg.htmlWrap
        ? '<p>' + feedbackText.replace(/\\n/g, '</p><p>') + '</p>'
        : feedbackText;
      if (fbBox) {
        fbBox.innerHTML = html;
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (fbCfg.requiresHiddenSync && sel.feedbackHidden) {
        var hidden = student.querySelector(sel.feedbackHidden);
        if (hidden) hidden.value = html;
      }
    } else {
      if (fbBox) {
        fbBox.value = feedbackText;
        fbBox.dispatchEvent(new Event('input', { bubbles: true }));
        fbBox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Trigger MathJax to re-render any newly inserted LaTeX
    try { if (window.MathJax && window.MathJax.typeset) window.MathJax.typeset(); } catch(e) {}
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
      console.warn('[BatchGrader] Student name did not change after navigation — may be at last student');
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
    console.log('[batch] BatchGrader.start() called');
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
    console.log('[batch] start: extracting rubric...');
    try {
      this._rubric = await extractRubric(profile.selectors);
    } catch {
      this._rubric = null;
    }
    console.log('[batch] start: rubric extraction done, rubric =', !!this._rubric);

    // Extract students
    console.log('[batch] start: extracting students...');
    this._students = await extractStudents(profile.selectors);

    // Detect question versions (batch mode only — sequential mode has no studentSection)
    if (profile.navigation.mode === 'batch' && profile.selectors.studentSection) {
      console.log('[batch] start: detecting question versions...');
      const fingerprints = await extractPromptFingerprints(profile.selectors);
      this._versionGroups = groupStudentsByVersion(this._students, fingerprints);
      console.log('[batch] start: detected', this._versionGroups.length, 'version(s)');

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

    const student = this._toGrade[this._currentIndex];
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
    
    this._results.push({
      name: displayName,
      index: studentIndex,
      score,
      feedback,
    });

    this._log.push({
      studentName: displayName,
      studentIndex,
      score,
      feedback,
      timestamp: new Date().toISOString(),
      status: 'success',
    });

    this._currentIndex++;
  }

  /**
    * Record an error for a student and advance to the next.
    *
    * @param studentName - Name of the student that errored
    * @param error - Error message
    */
  recordError(studentName: string, error: string): void {
    this._errors.push({ name: studentName, error });
    
    const student = this._toGrade[this._currentIndex];
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
