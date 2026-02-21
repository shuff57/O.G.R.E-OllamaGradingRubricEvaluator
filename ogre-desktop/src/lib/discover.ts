/**
 * discover.ts — AI-powered page structure discovery for the desktop app
 *
 * Analyzes grading pages to discover CSS selectors for student sections,
 * score inputs, feedback areas, etc. Uses a screenshot + DOM snapshot
 * sent to the active AI provider as a vision request.
 *
 * Types, prompt templates, and runDiscovery() workflow.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { evalScript, evalScriptJSON, captureWebviewScreenshot, getEmbeddedUrl } from "./browser";
import { getHandshakeToken } from "./provider-sync";
import type { RubricCriterion } from "./rubric-api";

const SERVER_BASE = "http://localhost:3456";

// ── Discovery Request/Response Types ────────────────────────────────────────

/** Navigation mode for the grading page. */
export type NavigationMode = "batch" | "sequential";

/** Feedback editor type. */
export type FeedbackType =
  | "textarea"
  | "tinymce-inline"
  | "tinymce-iframe"
  | "contenteditable"
  | "unknown";

/** Navigation configuration for sequential mode. */
export interface NavigationConfig {
  mode: NavigationMode;
  nextButton?: string | null;
  prevButton?: string | null;
  studentIndicator?: string | null;
  submitButton?: string | null;
  waitForSelector?: string | null;
}

/** CSS selectors for page elements. */
export interface SelectorMap {
  /** Container for each student (batch mode only). */
  studentSection?: string | null;
  /** Element with student name. */
  studentName: string;
  /** Score input field. */
  scoreInput: string;
  /** Feedback area (textarea, contenteditable, or rich editor). */
  feedbackBox?: string | null;
  /** Hidden input synced with feedback (TinyMCE/CKEditor). */
  feedbackHidden?: string | null;
  /** Container for student work/response. */
  questionRegion?: string | null;
  /** Link/button for "full credit" shortcut. */
  fullCreditLink?: string | null;
}

/** Feedback configuration. */
export interface FeedbackConfig {
  type: FeedbackType;
  requiresHiddenSync: boolean;
  htmlWrap: boolean;
}

/** Save button configuration. */
export interface SaveConfig {
  buttonText: string;
  fallbackText?: string;
}

/** Discovery result from AI analysis. */
export interface DiscoveryResult {
  navigation: NavigationConfig;
  selectors: SelectorMap;
  feedback: FeedbackConfig;
  save: SaveConfig;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

/** Validation result for a single selector. */
export interface SelectorValidation {
  matchCount: number;
  sampleText: string;
  valid: boolean;
  skipped?: boolean;
}

/** Validation results for all selectors. */
export type ValidationResults = Record<string, SelectorValidation>;

/** Discovery request parameters. */
export interface DiscoveryRequest {
  /** Current page URL. */
  pageUrl: string;
  /** Screenshot data URL (base64 PNG). */
  screenshot: string;
  /** Simplified DOM tree snapshot. */
  domSnapshot: Array<{
    depth: number;
    tag: string;
    attrs?: Record<string, string>;
    text?: string;
    childCount?: number;
  }>;
}

/** Discovery progress event. */
export interface DiscoveryProgress {
  stage: "capturing" | "analyzing" | "validating" | "complete" | "error";
  message: string;
  progress?: number; // 0-100
  error?: string;
  /** Current attempt number (1-based, only set when retrying). */
  attempt?: number;
}

/** Complete discovery workflow result. */
export interface DiscoveryWorkflow {
  draft: DiscoveryResult;
  validation: ValidationResults;
  screenshot: string;
}

/** Maximum number of AI call attempts before giving up. */
export const DISCOVERY_MAX_ATTEMPTS = 3;

// ── Prompt Templates ────────────────────────────────────────────────────────

/**
 * System prompt for page structure discovery.
 * Instructs the AI to analyze grading pages and identify CSS selectors.
 */
export const DISCOVERY_SYSTEM_PROMPT = `You are a JSON-only responder. Your entire response must be a single valid JSON object. You are a web page structure analyzer for an automated grading tool. Your job is to examine grading and assignment pages, identify the key CSS selectors for student data elements, score inputs, and feedback areas, and return a structured JSON object that describes the page layout. The grading tool will use your analysis to automatically extract student information, fill in scores, provide feedback, and save results. Accuracy is critical because the grading tool will execute the selectors you provide against the actual page DOM. Incorrect or imprecise selectors will cause the tool to fail silently, miss students, or fill in wrong fields. Take time to examine every element carefully. When in doubt between multiple possible selectors for an element, choose the one that relies on the most stable attributes such as id patterns, name attributes, or data attributes rather than class names or positional relationships in the DOM.

You will receive:
1. A screenshot of the grading page showing the visual layout
2. A simplified DOM tree with tag names, attributes, and text snippets

FORBIDDEN — Your response must NOT contain any of the following:
- Markdown code fences or code block delimiters of any kind
- Explanatory text, commentary, or narration before or after the JSON object
- Inline comments or annotations within the JSON values
- Thinking blocks, chain-of-thought reasoning, or reasoning tags
- Placeholder values such as "..." or "selector here" instead of actual CSS selectors
- Any text outside the JSON object whatsoever
- Apologies, disclaimers, preambles, or conversational filler

Your response must start with the opening brace and end with the closing brace. Nothing else may appear before or after the JSON object.

STEP 1 — DETERMINE NAVIGATION MODE:

Analyze the page to determine if this is a BATCH or SEQUENTIAL grading page. Study both the screenshot and the DOM tree carefully before deciding.

BATCH indicators (multiple students visible at once):
- Repeating student rows or sections displayed on a single page
- Multiple score inputs visible simultaneously on the same screen
- A page-wide "Save" or "Quick Save" button that submits all grades at once
- All student names and their responses visible without any navigation controls
- A table or list layout where each row or section represents a different student
- Grade inputs arranged in a column or grid pattern

SEQUENTIAL indicators (one student at a time):
- Next/Previous student buttons for navigating between individual students
- A student name dropdown or indicator showing the current student being graded
- Only ONE score input visible at any given time
- "X of N" or student counter text displayed on the page (e.g., "Student 3 of 25")
- Student work shown in a dedicated preview pane or embedded iframe
- A per-student submit or save button that applies to just that one student
- Navigation arrows, tabs, or a student list sidebar for switching between students

STEP 2 — IDENTIFY SELECTORS:

Examine the DOM tree to find precise CSS selectors for each required element. Cross-reference with the screenshot to confirm visual placement and element purpose. Start by identifying the overall page structure from the screenshot: Is it a table layout, a card-based grid, or a vertical list? Then locate the corresponding container elements in the DOM tree. Pay special attention to id attributes, name attributes, data-* attributes, and aria-* attributes, as these provide the most reliable and stable selectors across page updates. CSS class names should only be used as a last resort when no semantic or data attributes are available for the target element.

FOR BATCH MODE — identify these CSS selectors:

REQUIRED selectors for batch mode:
- studentSection: The repeating container element for each student entry. This selector must match ALL student entries when used with document.querySelectorAll(). Look for table rows (tr elements), list items (li elements), or wrapper div elements that repeat for each student in the grade list. Ensure the selector does not accidentally match header rows, footer rows, or summary sections.
- studentName: Element containing the student's full name, RELATIVE to studentSection. This selector must work correctly when called as studentSection.querySelector(selector). Typically this is an anchor tag, a span, a paragraph, or a table cell within the student row.
- scoreInput: The score input field, RELATIVE to studentSection. Usually an input element with type text or number where the instructor enters the numeric score. Must work as studentSection.querySelector(selector).
- feedbackBox: Feedback input area, RELATIVE to studentSection. May be a standard textarea element, a contenteditable div, or a rich text editor container. Must work as studentSection.querySelector(selector).

OPTIONAL selectors for batch mode:
- feedbackHidden: Hidden input field that gets synced with the visible feedback editor. This is common in TinyMCE and CKEditor setups where the WYSIWYG editor writes its content to a hidden form field for submission.
- questionRegion: Container within each student section that holds the question prompt, the student's response content, or both.
- fullCreditLink: Link or button element that assigns full credit to the student with a single click action.

FOR SEQUENTIAL MODE — identify these CSS selectors (all are PAGE-LEVEL, not relative):

REQUIRED selectors for sequential mode:
- studentName: Element showing the current student's name on the page. Use a page-level selector that works with document.querySelector().
- scoreInput: The single score input field visible on the page. Use a page-level selector that works with document.querySelector().

OPTIONAL selectors for sequential mode:
- feedbackBox: Feedback input area if it is visible directly on the page. Set to null if the feedback editor is rendered inside an iframe.
- questionRegion: Container for the student work preview area. This is often rendered inside an iframe element.

NAVIGATION selectors (sequential mode only):
- nextButton: Button or link element to navigate forward to the next student.
- prevButton: Button or link element to navigate backward to the previous student.
- studentIndicator: Element that displays which student is currently being viewed. This may be the same element as studentName if the name also serves as the current-student indicator.
- submitButton: Per-student submit or save button, if it is different from the page-wide save button.
- waitForSelector: An element whose appearance in the DOM confirms that the next student's content has fully loaded after a navigation action. Choose an element that changes between students.

RULES FOR WRITING HIGH-QUALITY SELECTORS:
- All selectors MUST be valid CSS selector syntax compatible with document.querySelector() and document.querySelectorAll().
- Use attribute selectors when possible: [aria-label="Score"], [name="score"], [data-testid="student-row"], [type="text"], [role="textbox"]. Attribute-based selectors are more resilient to page redesigns than class names.
- Prefer stable selector strategies in this priority order: data-testid attributes, aria-label attributes, name attributes, id attributes with stable patterns, role attributes, type attributes. Avoid relying solely on CSS class names, which change frequently during site updates.
- For BATCH mode: the relative selectors (studentName, scoreInput, feedbackBox, feedbackHidden, questionRegion, fullCreditLink) must work when called as studentSection.querySelector(selector). Do not embed page-level context or parent element references in these relative selectors.
- For BATCH mode: studentSection must match ALL student entries when used with document.querySelectorAll(selector). Verify the selector is specific enough to exclude non-student elements like header rows, footer rows, and summary sections.
- For SEQUENTIAL mode: all selectors are page-level and should work directly with document.querySelector(selector).
- If the feedback area uses a rich text editor such as TinyMCE, CKEditor, or a similar WYSIWYG editor, identify BOTH the visible editor element AND any hidden form input that syncs with it. Set feedbackHidden to the hidden input selector.
- If the feedback editor is rendered inside an iframe (common in Canvas LMS, some Moodle installations, and other platforms), set feedbackBox to null and describe the iframe-based feedback configuration in the notes field.

COMMON GRADING PAGE PATTERNS:
Many learning management systems share common structural patterns that can guide your selector choices:
- MyOpenMath and IMathAS platforms typically use table-based layouts with id-prefixed rows (such as rows with id attributes starting with "graderow" or "gradebox") and name-prefixed input elements for scores and feedback fields.
- Canvas LMS often uses contenteditable divs or TinyMCE iframe editors for feedback entry, with data-component attributes on key interactive elements.
- Moodle frequently uses table-based grading layouts with name attributes on form inputs that follow a pattern incorporating the user id and grade item identifier.
- Blackboard and similar platforms may use framesets or deeply nested iframe structures that complicate direct selector identification.
When you recognize one of these platforms from the screenshot or DOM tree, leverage known attribute patterns. However, always verify your selectors against the actual DOM tree provided rather than relying solely on platform assumptions.

FEEDBACK TYPE DETECTION:

Examine how the feedback mechanism works on this page and set these fields accordingly:
- feedback.type: Must be exactly one of the following string values:
  - "textarea" — A standard HTML textarea element used for plain text feedback entry
  - "tinymce-inline" — A TinyMCE editor operating in inline contenteditable mode directly on the page
  - "tinymce-iframe" — A TinyMCE editor that renders its editable content inside an iframe element
  - "contenteditable" — A generic contenteditable div or other non-TinyMCE rich text editor
  - "unknown" — The feedback mechanism cannot be determined from the available page information
- feedback.requiresHiddenSync: Set to true if there is a hidden input field that must be programmatically updated whenever the visible feedback content changes. This is typical with TinyMCE and CKEditor configurations where the editor does not automatically sync to the form field.
- feedback.htmlWrap: Set to true if the feedback content should be wrapped in HTML paragraph tags (such as wrapping text in p elements) before being inserted into the editor.

SAVE BUTTON DETECTION:
When identifying the save button, look for submit-type buttons, input elements with type submit, or anchor tags styled as buttons near the top or bottom of the grading form. The button may be inside a form element or placed outside the form with a JavaScript click handler. Check both the visible text content and the value attribute to determine the correct label. If multiple save-style buttons exist on the page (such as one at the top and one at the bottom), prefer the one most prominently associated with saving all visible grades.
- save.buttonText: The exact visible text label on the primary save or submit button. Examples include "Quick Save", "Save All Grades", "Submit Grades", "Record Scores", or "Save".
- save.fallbackText: An alternative button text to search for if the primary save button cannot be found by its buttonText label. Provide a reasonable fallback based on other button labels you observe on the page.

CONFIDENCE ASSESSMENT:
Set the confidence field to exactly one of these three string values:
- "high" — All required selectors were clearly identified using strong attribute-based or semantic selectors. The page structure is unambiguous, well-organized, and follows standard patterns.
- "medium" — Most required selectors were identified but some relied on positional relationships, CSS class names, or less stable selector patterns. There is minor ambiguity in the page structure.
- "low" — Several required selectors are uncertain, the page structure is unusual or highly dynamic, or key elements could not be reliably identified from the available screenshot and DOM tree information.

NOTES FIELD:
Use the optional notes field to provide brief factual observations about the page structure. Useful information to include: the LMS platform name if you can identify it, the approximate number of students visible on the page, whether the page appears to use AJAX-based saving or a traditional form post, any elements that load dynamically after the initial page render, and any accessibility features or unusual DOM structures that might affect automated interaction. Also mention any selectors you were uncertain about or any iframe-based components that may require special handling. Keep notes concise, factual, and informative.

EXAMPLE RESPONSE:
The following is a concrete example showing the expected JSON structure for a typical MyOpenMath batch grading page. Do NOT copy this example verbatim. You must analyze the actual page provided to you and generate selectors that match the real DOM elements visible in the screenshot and DOM tree.

{
  "navigation": {
    "mode": "batch",
    "nextButton": null,
    "prevButton": null,
    "studentIndicator": null,
    "submitButton": null,
    "waitForSelector": null
  },
  "selectors": {
    "studentSection": "tr[id^='graderow']",
    "studentName": "td.student-name a",
    "scoreInput": "input[name^='score']",
    "feedbackBox": "textarea[name^='feedback']",
    "feedbackHidden": null,
    "questionRegion": "td.question-content",
    "fullCreditLink": "a.full-credit"
  },
  "feedback": {
    "type": "textarea",
    "requiresHiddenSync": false,
    "htmlWrap": false
  },
  "save": {
    "buttonText": "Quick Save",
    "fallbackText": "Save"
  },
  "confidence": "high",
  "notes": "Standard MyOpenMath batch grading page with student rows in a table. Each row contains the student name as a link, a score input field, and a feedback textarea. The Quick Save button at the top of the page saves all grades simultaneously."
}

Remember: respond with ONLY the JSON object. No other text.`;

/**
 * User prompt template for page structure discovery.
 * Provides the screenshot and DOM snapshot for analysis.
 *
 * @param pageUrl - Current page URL
 * @param domSnapshot - Simplified DOM tree
 * @returns Formatted user prompt
 */
export function DISCOVERY_USER_PROMPT_TEMPLATE(
  pageUrl: string,
  domSnapshot: Array<{
    depth: number;
    tag: string;
    attrs?: Record<string, string>;
    text?: string;
    childCount?: number;
  }>
): string {
  // Smart truncation: remove whole elements from end, not mid-string
  let snapshot = [...domSnapshot];
  let snapshotStr = JSON.stringify(snapshot);
  while (snapshotStr.length > 12000 && snapshot.length > 1) {
    snapshot = snapshot.slice(0, Math.floor(snapshot.length * 0.9));
    snapshotStr = JSON.stringify(snapshot);
  }
  const truncated = snapshot.length < domSnapshot.length;
  const truncationNote = truncated
    ? ` (truncated from ${domSnapshot.length} to ${snapshot.length} nodes to fit context limits)`
    : "";

  return `Analyze this grading page and identify its structure.

Page URL: ${pageUrl}

DOM SNAPSHOT (simplified tree, ${snapshot.length} nodes${truncationNote}):
${snapshotStr}

Look at the screenshot to understand the visual layout, and use the DOM snapshot to find precise CSS selectors. The goal is to find selectors that will let the tool automatically extract student names and responses, fill in scores and feedback, and click save.

**Important:** Respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;
}

// ── Helper Functions ────────────────────────────────────────────────────────

/**
 * Parse AI discovery response, handling JSON wrapped in code fences or thinking blocks.
 *
 * @param aiText - Raw AI response text
 * @returns Parsed discovery result
 * @throws Error if response cannot be parsed as JSON
 */
export function parseDiscoveryResponse(aiText: string): DiscoveryResult {
  let text = aiText.trim();

  // Strip <think>...</think> blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // HTML entity unescape (do early — before any parsing attempts)
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Trailing comma cleanup (do early — before direct parse attempt)
  text = text.replace(/,(\s*[}\]])/g, "$1");

  // Double-fenced markdown: handle ```json\n```json\n{...}\n```\n``` (strip outer fence first)
  const doubleFenceMatch = text.match(
    /```(?:json)?\s*```json\s*([\s\S]*?)\s*```\s*```/
  );
  if (doubleFenceMatch) {
    text = doubleFenceMatch[1].trim();
  }

  // Try to extract JSON from markdown code fences
  if (!doubleFenceMatch) {
    const fenceMatch =
      text.match(/```json\s*([\s\S]*?)\s*```/) ||
      text.match(/```\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }
  }

  // Multiple JSON objects: if multiple exist, take the LAST one containing "selectors"
  if (text.includes('"selectors"')) {
    const lastIdx = text.lastIndexOf('"selectors"');
    // Walk backwards from lastIdx to find the opening brace
    let braceDepth = 0;
    let startIdx = -1;
    for (let i = lastIdx; i >= 0; i--) {
      if (text[i] === "}") braceDepth++;
      if (text[i] === "{") {
        if (braceDepth === 0) {
          startIdx = i;
          break;
        }
        braceDepth--;
      }
    }
    if (startIdx >= 0) {
      // Walk forward from startIdx to find the matching closing brace
      let depth = 0;
      let endIdx = -1;
      for (let i = startIdx; i < text.length; i++) {
        if (text[i] === "{") depth++;
        if (text[i] === "}") {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
      if (endIdx > startIdx) {
        const candidate = text.substring(startIdx, endIdx + 1);
        try {
          return JSON.parse(candidate) as DiscoveryResult;
        } catch {
          /* continue — will try other methods */
        }
      }
    }
  }

  // Attempt direct parse
  try {
    return JSON.parse(text) as DiscoveryResult;
  } catch {
    /* continue */
  }

  // Explanatory prefix/suffix: extract first '{' to last '}' (more targeted extraction)
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(extracted) as DiscoveryResult;
    } catch {
      /* continue */
    }
  }

  // Try to find a JSON object with "selectors" key (regex fallback)
  const jsonMatch = text.match(/\{[\s\S]*"selectors"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as DiscoveryResult;
    } catch {
      /* continue */
    }
  }

  // Partial JSON recovery (last resort): if JSON is cut off, append missing closing braces
  if (firstBrace !== -1) {
    const partialText =
      lastBrace > firstBrace
        ? text.substring(firstBrace, lastBrace + 1)
        : text.substring(firstBrace);
    const openCount = (partialText.match(/\{/g) || []).length;
    const closeCount = (partialText.match(/\}/g) || []).length;
    const diff = openCount - closeCount;
    if (diff > 0 && diff <= 3) {
      const repaired = partialText + "}".repeat(diff);
      try {
        return JSON.parse(repaired) as DiscoveryResult;
      } catch {
        /* continue */
      }
    }
  }

  throw new Error("Could not parse AI discovery response as JSON");
}

/**
 * Validate that a discovery result has required fields.
 *
 * @param result - Discovery result to validate
 * @returns true if valid, false otherwise
 */
export function isValidDiscoveryResult(result: unknown): result is DiscoveryResult {
  if (!result || typeof result !== "object") return false;

  const r = result as Record<string, unknown>;

  // Check required top-level fields
  if (!r.navigation || !r.selectors || !r.feedback || !r.save) return false;

  // Check navigation
  const nav = r.navigation as Record<string, unknown>;
  if (!["batch", "sequential"].includes(nav.mode as string)) return false;

  // Check selectors
  const sel = r.selectors as Record<string, unknown>;
  if (typeof sel.studentName !== "string" || !sel.studentName) return false;
  if (typeof sel.scoreInput !== "string" || !sel.scoreInput) return false;

  // Check feedback
  const fb = r.feedback as Record<string, unknown>;
  if (
    ![
      "textarea",
      "tinymce-inline",
      "tinymce-iframe",
      "contenteditable",
      "unknown",
    ].includes(fb.type as string)
  )
    return false;
  if (typeof fb.requiresHiddenSync !== "boolean") return false;
  if (typeof fb.htmlWrap !== "boolean") return false;

  // Check save
  const save = r.save as Record<string, unknown>;
  if (typeof save.buttonText !== "string" || !save.buttonText) return false;

  return true;
}

// ── Discovery Workflow Options ──────────────────────────────────────────

/** Options for runDiscovery(). */
export interface DiscoveryOptions {
  /** Optional provider override (defaults to server's active provider). */
  provider?: string;
  /** Optional model override (defaults to provider's configured model). */
  model?: string;
  /** Progress callback — fires at each stage of the workflow. */
  onProgress?: (progress: DiscoveryProgress) => void;
  /** Maximum number of AI call attempts (defaults to DISCOVERY_MAX_ATTEMPTS). */
  maxAttempts?: number;
}

// ── DOM Snapshot Capture ────────────────────────────────────────────────

/**
 * DOM snapshot script executed inside the embedded webview.
 * Mirrors the Chrome extension's capturePageSnapshot logic:
 * walks the DOM tree, captures tag names, relevant attributes, and text.
 * Capped at 500 nodes / depth 8 to fit AI context limits.
 */
const DOM_SNAPSHOT_SCRIPT = `(function() {
  var SKIP_TAGS = new Set(['script','style','link','meta','noscript','svg','path','br','hr']);
  var CAPTURE_ATTRS = ['id','class','role','aria-label','name','type',
    'contenteditable','data-lastchange','data-testid','placeholder','for','action','method'];
  var MAX_NODES = 500;
  var MAX_TEXT = 150;
  var MAX_DEPTH = 8;
  var nodes = [];

  function walk(el, depth) {
    if (nodes.length >= MAX_NODES || depth > MAX_DEPTH) return;
    var tag = el.tagName && el.tagName.toLowerCase();
    if (!tag || SKIP_TAGS.has(tag)) return;

    var attrs = {};
    for (var i = 0; i < CAPTURE_ATTRS.length; i++) {
      var attr = CAPTURE_ATTRS[i];
      if (el.hasAttribute(attr)) {
        var val = el.getAttribute(attr);
        if (val && val.length > 100) val = val.substring(0, 100) + '...';
        attrs[attr] = val;
      }
    }

    var text = '';
    for (var j = 0; j < el.childNodes.length; j++) {
      var child = el.childNodes[j];
      if (child.nodeType === 3) {
        var t = child.textContent.trim();
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
      depth: depth,
      tag: tag,
      attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
      text: text || undefined,
      childCount: el.children.length || undefined
    });

    for (var k = 0; k < el.children.length; k++) {
      walk(el.children[k], depth + 1);
    }
  }

  walk(document.body, 0);
  return nodes;
})()`;

/**
 * Capture a simplified DOM tree from the embedded webview.
 *
 * @returns Array of DOM nodes with tag, attrs, text, depth, and childCount.
 */
async function captureDomSnapshot(): Promise<DiscoveryRequest["domSnapshot"]> {
  const parsed = await evalScriptJSON<unknown>(DOM_SNAPSHOT_SCRIPT);
  if (!Array.isArray(parsed)) {
    throw new Error("DOM snapshot did not return an array");
  }
  return parsed;
}

// ── AI Call ─────────────────────────────────────────────────────────────

/**
 * Auth headers for grading server requests.
 */
function authHeaders(): Record<string, string> {
  const token = getHandshakeToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Send discovery prompt + screenshot to the grading server's /api/chat endpoint.
 *
 * The server supports vision requests when `images` array is provided.
 * Uses the same POST /api/chat endpoint as solver/grader but with
 * system prompt override and image attachment.
 *
 * @param systemPrompt - Discovery system prompt
 * @param userPrompt - User prompt with DOM snapshot
 * @param screenshot - Base64 data URL of the page screenshot
 * @param options - Optional provider/model overrides
 * @returns Raw AI response text
 */
async function callDiscoveryAI(
  systemPrompt: string,
  userPrompt: string,
  screenshot: string,
  options?: Pick<DiscoveryOptions, "provider" | "model">,
): Promise<string> {
  const body: Record<string, unknown> = {
    message: userPrompt,
    systemPrompt,
    images: [screenshot],
  };

  if (options?.provider) body.provider = options.provider;
  if (options?.model) body.model = options.model;

  const response = await tauriFetch(`${SERVER_BASE}/api/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMsg = `Discovery AI call failed (HTTP ${response.status})`;
    try {
      const errData = (await response.json()) as { error?: string };
      errorMsg = errData.error || errorMsg;
    } catch {
      // Use status-based message
    }
    throw new Error(errorMsg);
  }

  // The server may return SSE or JSON depending on mode.
  // For discovery, we send systemPrompt which triggers non-grader mode.
  // Read the full response — could be SSE stream or plain JSON.
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    // SSE mode: accumulate message content from events
    const text = await response.text();
    return extractContentFromSSE(text);
  }

  // JSON mode: extract content directly
  const data = (await response.json()) as { content?: string; message?: string };
  return data.content || data.message || "";
}

/**
 * Extract accumulated message content from SSE response text.
 * Parses `event: message` events and concatenates their content fields.
 */
function extractContentFromSSE(sseText: string): string {
  let content = "";
  const blocks = sseText.split(/\n\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let eventName = "";
    let dataStr = "";

    for (const line of trimmed.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
    }

    if (eventName === "message" && dataStr) {
      try {
        const parsed = JSON.parse(dataStr) as { content?: string };
        if (parsed.content) content += parsed.content;
      } catch {
        // Skip unparseable data
      }
    }
  }

  return content;
}

// ── Selector Validation ────────────────────────────────────────────────

/**
 * Build the validation script that runs inside the webview.
 * Tests each selector on the live page and returns match counts + sample text.
 *
 * Supports both batch mode (relative selectors within studentSection)
 * and sequential mode (all selectors at page level).
 */
function buildValidationScript(
  selectors: Record<string, string | null | undefined>,
  isSequential: boolean,
): string {
  // Serialize the selectors map and sequential flag into the script
  const selectorsJSON = JSON.stringify(selectors);

  return `(function() {
    var sel = ${selectorsJSON};
    var sequential = ${isSequential ? "true" : "false"};
    var validation = {};

    for (var key in sel) {
      if (!sel.hasOwnProperty(key)) continue;
      var cssSelector = sel[key];

      if (!cssSelector) {
        validation[key] = { matchCount: 0, sampleText: '', valid: false, skipped: true };
        continue;
      }

      try {
        if (sequential || key === 'studentSection' || key.indexOf('_nav') === 0) {
          var matches = document.querySelectorAll(cssSelector);
          var firstEl = matches[0];
          validation[key] = {
            matchCount: matches.length,
            sampleText: (firstEl && (firstEl.textContent || '').trim().substring(0, 80)) ||
                        (firstEl && firstEl.value && firstEl.value.substring(0, 80)) || '',
            valid: matches.length > 0
          };
        } else {
          var parent = sel.studentSection ? document.querySelector(sel.studentSection) : null;
          if (!parent) {
            validation[key] = { matchCount: 0, sampleText: '', valid: false };
            continue;
          }
          var match = parent.querySelector(cssSelector);
          var allMatches = parent.querySelectorAll(cssSelector);
          validation[key] = {
            matchCount: allMatches.length,
            sampleText: (match && (match.textContent || '').trim().substring(0, 80)) ||
                        (match && match.value && match.value.substring(0, 80)) || '',
            valid: !!match
          };
        }
      } catch (err) {
        validation[key] = { matchCount: 0, sampleText: '', valid: false };
      }
    }

    return validation;
  })()`;
}

/**
 * Validate discovered selectors by testing them on the live page.
 *
 * For sequential mode, also validates navigation selectors (nextButton, etc.)
 * merged in with a `_nav` prefix.
 *
 * @param draft - Discovery result from AI
 * @returns Validation results keyed by selector name
 */
async function validateSelectors(draft: DiscoveryResult): Promise<ValidationResults> {
  const isSequential = draft.navigation?.mode === "sequential";

  // Build combined selector map including navigation selectors
  const allSelectors: Record<string, string | null | undefined> = { ...draft.selectors };

  if (isSequential && draft.navigation) {
    if (draft.navigation.nextButton) allSelectors._navNext = draft.navigation.nextButton;
    if (draft.navigation.prevButton) allSelectors._navPrev = draft.navigation.prevButton;
    if (draft.navigation.submitButton) allSelectors._navSubmit = draft.navigation.submitButton;
    if (draft.navigation.waitForSelector) allSelectors._navWait = draft.navigation.waitForSelector;
    if (draft.navigation.studentIndicator) allSelectors._navIndicator = draft.navigation.studentIndicator;
  }

  const script = buildValidationScript(allSelectors, isSequential);
  const parsed = await evalScriptJSON<unknown>(script);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Selector validation returned invalid data");
  }

  return parsed as ValidationResults;
}

// ── Main Discovery Workflow ─────────────────────────────────────────────

/**
 * Run the full AI-powered page structure discovery workflow.
 *
 * 1. Captures DOM snapshot + screenshot from the embedded webview (in parallel)
 * 2. Sends both to the AI provider via POST /api/chat with vision
 * 3. Parses the AI response into a DiscoveryResult
 * 4. Validates each discovered selector on the live page
 * 5. Returns the draft result, validation, and screenshot
 *
 * Progress is reported via the optional onProgress callback at each stage.
 *
 * @param options - Provider/model overrides and progress callback
 * @returns Complete discovery workflow result
 * @throws Error if any stage fails (DOM capture, AI call, parse, validation)
 */
export async function runDiscovery(
  options: DiscoveryOptions = {},
): Promise<DiscoveryWorkflow> {
  const { onProgress } = options;

  try {
    // ── Stage 1: Capture DOM snapshot + screenshot in parallel ──────────
    onProgress?.({
      stage: "capturing",
      message: "Capturing page screenshot and DOM structure...",
      progress: 10,
    });

    const [screenshot, domSnapshot, pageUrl] = await Promise.all([
      captureWebviewScreenshot(),
      captureDomSnapshot(),
      getEmbeddedUrl(),
    ]);

    // ── Stages 2–3: AI call + parse (with retry) ─────────────────────────
    const userPrompt = DISCOVERY_USER_PROMPT_TEMPLATE(pageUrl, domSnapshot);
    const maxAttempts = options.maxAttempts ?? DISCOVERY_MAX_ATTEMPTS;
    const attemptErrors: string[] = [];
    let draft!: DiscoveryResult;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // ── Stage 2: Send to AI for analysis ────────────────────────────
        onProgress?.({
          stage: "analyzing",
          message:
            attempt === 1
              ? "Analyzing page structure with AI..."
              : `AI response invalid, retrying... (attempt ${attempt} of ${maxAttempts})`,
          progress: 30,
          attempt,
        });

        const aiResponseText = await callDiscoveryAI(
          DISCOVERY_SYSTEM_PROMPT,
          userPrompt,
          screenshot,
          options,
        );

        if (!aiResponseText.trim()) {
          throw new Error("AI returned empty response");
        }

        // ── Stage 3: Parse AI response ──────────────────────────────────
        onProgress?.({
          stage: "analyzing",
          message: "Parsing AI response...",
          progress: 60,
          attempt,
        });

        draft = parseDiscoveryResponse(aiResponseText);

        if (!isValidDiscoveryResult(draft)) {
          throw new Error(
            "AI response parsed but missing required fields (studentName, scoreInput, navigation.mode, feedback, or save)",
          );
        }

        // Success — break out of retry loop
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // HTTP errors: don't retry, propagate immediately
        if (message.includes("HTTP")) throw err;

        attemptErrors.push(`Attempt ${attempt}: ${message}`);

        // If last attempt, throw combined error
        if (attempt === maxAttempts) {
          throw new Error(
            `Discovery failed after ${maxAttempts} attempts:\n${attemptErrors.join("\n")}`,
          );
        }
      }
    }

    // ── Stage 4: Validate selectors on the live page ────────────────────
    onProgress?.({
      stage: "validating",
      message: "Validating discovered selectors on the page...",
      progress: 80,
    });

    const validation = await validateSelectors(draft);

    // ── Stage 5: Complete ───────────────────────────────────────────────
    onProgress?.({
      stage: "complete",
      message: "Discovery complete",
      progress: 100,
    });

    return { draft, validation, screenshot };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({
      stage: "error",
      message: `Discovery failed: ${message}`,
      error: message,
    });
    throw err;
  }
}

// ── Rubric Extraction from Screenshot ───────────────────────────────────

/**
 * Result of parsing a rubric from a screenshot.
 * Compatible with the SavedRubric format used by rubric-api.ts
 * but excludes server-generated fields (id, createdAt, updatedAt).
 */
export interface RubricExtractionResult {
  /** Extracted rubric criteria with names, descriptions, and point values. */
  criteria: RubricCriterion[];
  /** Total maximum score (sum of all criteria points). */
  maxScore: number;
  /** Suggested rubric name derived from the content (may be empty). */
  suggestedName: string;
}

/** Options for parseRubricFromScreenshot(). */
export interface RubricScreenshotOptions {
  /** Provider override (defaults to server's active provider). */
  provider?: string;
  /** Model override (defaults to provider's configured model). */
  model?: string;
}

/**
 * System prompt for extracting rubric criteria from a screenshot.
 *
 * Ported from prompts.js getRubricExtractionFromImagePrompt() with
 * enhancements: numeric points enforcement, question tagging, and
 * suggested name extraction.
 */
export const RUBRIC_EXTRACTION_PROMPT = `You are a data extraction assistant.
Extract grading rubric criteria from the provided image.

RULES:
- Extract EVERY criterion visible in the image.
- Points values MUST be numbers (integers or decimals), not strings.
- If points are shown as ranges (e.g., "0-5"), use the maximum value.
- If no point values are visible, estimate reasonable values that sum to 100.
- If the rubric covers multiple questions, tag each criterion with its question number.
- For single-question rubrics, omit the "question" field.
- If you can identify a title or assignment name, include it as "suggestedName".
- Keep descriptions concise but complete (1-2 sentences).

Return ONLY a valid JSON object with this structure:
{
  "suggestedName": "Assignment or Rubric Title (or empty string)",
  "rubric": [
    { "criteria": "Criteria Name", "description": "What this criterion evaluates", "points": 5 },
    { "criteria": "Another Criterion", "description": "Description here", "points": 10, "question": 2 }
  ]
}
Do not include markdown formatting, code fences, or explanations outside the JSON.`;

/**
 * Parse AI response text into structured rubric criteria.
 *
 * Handles common AI response quirks:
 * - JSON wrapped in markdown code fences
 * - <think>...</think> blocks (DeepSeek, etc.)
 * - String point values that should be numbers
 * - Missing or extra fields
 *
 * @param aiText - Raw AI response text
 * @returns Parsed rubric extraction result
 * @throws Error if the response cannot be parsed or contains no valid criteria
 */
export function parseRubricExtractionResponse(aiText: string): RubricExtractionResult {
  let text = aiText.trim();

  // Strip <think>...</think> blocks (common with reasoning models)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Try to extract JSON from markdown code fences
  const fenceMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Attempt direct JSON parse
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Try to find a JSON object with "rubric" key
    const jsonMatch = text.match(/\{[\s\S]*"rubric"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        /* fall through to error */
      }
    }
  }

  if (!parsed) {
    throw new Error("Could not parse AI rubric extraction response as JSON");
  }

  // Extract rubric array
  const rawRubric = parsed.rubric;
  if (!Array.isArray(rawRubric) || rawRubric.length === 0) {
    throw new Error("AI response contains no rubric criteria");
  }

  // Normalize each criterion
  const criteria: RubricCriterion[] = [];
  for (const item of rawRubric) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const criteriaName = String(raw.criteria || raw.name || "").trim();
    const description = String(raw.description || "").trim();
    let points = typeof raw.points === "number"
      ? raw.points
      : parseFloat(String(raw.points ?? "0"));

    // Clamp NaN to 0
    if (isNaN(points)) points = 0;

    // Skip items with no name
    if (!criteriaName) continue;

    const criterion: RubricCriterion = { criteria: criteriaName, description, points };

    // Add question number if present and valid
    const q = raw.question;
    if (typeof q === "number" && q > 0) {
      criterion.question = q;
    } else if (typeof q === "string") {
      const qNum = parseInt(q, 10);
      if (!isNaN(qNum) && qNum > 0) criterion.question = qNum;
    }

    criteria.push(criterion);
  }

  if (criteria.length === 0) {
    throw new Error("AI response contained rubric array but no valid criteria items");
  }

  const maxScore = criteria.reduce((sum, c) => sum + c.points, 0);
  const suggestedName = typeof parsed.suggestedName === "string"
    ? parsed.suggestedName.trim()
    : "";

  return { criteria, maxScore, suggestedName };
}

/**
 * Validate that a rubric extraction result has the expected shape.
 *
 * @param result - Value to validate
 * @returns true if result is a valid RubricExtractionResult
 */
export function isValidRubricExtractionResult(result: unknown): result is RubricExtractionResult {
  if (!result || typeof result !== "object") return false;

  const r = result as Record<string, unknown>;

  if (!Array.isArray(r.criteria) || r.criteria.length === 0) return false;
  if (typeof r.maxScore !== "number" || r.maxScore < 0) return false;

  for (const item of r.criteria as unknown[]) {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    if (typeof c.criteria !== "string" || !c.criteria) return false;
    if (typeof c.description !== "string") return false;
    if (typeof c.points !== "number" || isNaN(c.points)) return false;
  }

  return true;
}

/**
 * Extract structured rubric criteria from a screenshot image via AI.
 *
 * Sends the screenshot to the grading server's /api/chat endpoint with
 * a rubric extraction prompt. The AI analyzes the image and returns
 * structured criteria with names, descriptions, and point values.
 *
 * Returns data compatible with the SavedRubric format used by the
 * rubric library — the caller should present the result for user
 * confirmation before saving via rubric-api.ts.
 *
 * @param imageDataUrl - Screenshot as a base64 data URL (e.g., "data:image/png;base64,...")
 * @param options - Optional provider/model overrides
 * @returns Extracted rubric criteria, max score, and suggested name
 * @throws Error if the AI call fails or the response cannot be parsed
 *
 * @example
 * ```ts
 * const result = await parseRubricFromScreenshot(screenshotDataUrl);
 * // result.criteria: RubricCriterion[]
 * // result.maxScore: number
 * // result.suggestedName: string
 * // Present to user for confirmation, then call createRubric() to save
 * ```
 */
export async function parseRubricFromScreenshot(
  imageDataUrl: string,
  options?: RubricScreenshotOptions,
): Promise<RubricExtractionResult> {
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    throw new Error("Invalid image data URL: must start with 'data:image/'");
  }

  // Use the existing callDiscoveryAI which already handles:
  // - Sending images via POST /api/chat with systemPrompt + images array
  // - Parsing SSE or JSON responses
  // - Auth headers
  const aiText = await callDiscoveryAI(
    RUBRIC_EXTRACTION_PROMPT,
    "Extract the grading rubric from this screenshot image. Return structured JSON with all criteria, point values, and descriptions.",
    imageDataUrl,
    options,
  );

  if (!aiText.trim()) {
    throw new Error("AI returned empty response for rubric extraction");
  }

  return parseRubricExtractionResponse(aiText);
}
