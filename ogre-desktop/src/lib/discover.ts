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
}

/** Complete discovery workflow result. */
export interface DiscoveryWorkflow {
  draft: DiscoveryResult;
  validation: ValidationResults;
  screenshot: string;
}

// ── Prompt Templates ────────────────────────────────────────────────────────

/**
 * System prompt for page structure discovery.
 * Instructs the AI to analyze grading pages and identify CSS selectors.
 */
export const DISCOVERY_SYSTEM_PROMPT = `You are a web page structure analyzer for an automated grading tool. Your job is to identify the key elements on a grading/assignment page so the tool can automatically extract student data, fill scores, and save.

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
  // Compact the DOM snapshot for the prompt (max 12000 chars)
  const snapshotStr = JSON.stringify(domSnapshot).substring(0, 12000);

  return `Analyze this grading page and identify its structure.

Page URL: ${pageUrl}

DOM SNAPSHOT (simplified tree, ${domSnapshot.length} nodes):
${snapshotStr}

Look at the screenshot to understand the visual layout, and use the DOM snapshot to find precise CSS selectors. The goal is to find selectors that will let the tool automatically extract student names and responses, fill in scores and feedback, and click save.`;
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

  // Try to extract JSON from markdown code fences
  const fenceMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Attempt direct parse
  try {
    return JSON.parse(text) as DiscoveryResult;
  } catch {
    /* continue */
  }

  // Try to find a JSON object with "selectors" key
  const jsonMatch = text.match(/\{[\s\S]*"selectors"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as DiscoveryResult;
    } catch {
      /* continue */
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
  return JSON.stringify(nodes);
})()`;

/**
 * Capture a simplified DOM tree from the embedded webview.
 *
 * @returns Array of DOM nodes with tag, attrs, text, depth, and childCount.
 */
async function captureDomSnapshot(): Promise<DiscoveryRequest["domSnapshot"]> {
  const raw = await evalScript(DOM_SNAPSHOT_SCRIPT);
  // evalScript returns the JSON string; parse it
  const parsed = JSON.parse(raw);
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

    return JSON.stringify(validation);
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
  const raw = await evalScript(script);
  const parsed = JSON.parse(raw);

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

    // ── Stage 2: Send to AI for analysis ────────────────────────────────
    onProgress?.({
      stage: "analyzing",
      message: "Analyzing page structure with AI...",
      progress: 30,
    });

    const userPrompt = DISCOVERY_USER_PROMPT_TEMPLATE(pageUrl, domSnapshot);
    const aiResponseText = await callDiscoveryAI(
      DISCOVERY_SYSTEM_PROMPT,
      userPrompt,
      screenshot,
      options,
    );

    if (!aiResponseText.trim()) {
      throw new Error("AI returned empty response");
    }

    // ── Stage 3: Parse AI response ──────────────────────────────────────
    onProgress?.({
      stage: "analyzing",
      message: "Parsing AI response...",
      progress: 60,
    });

    const draft = parseDiscoveryResponse(aiResponseText);

    if (!isValidDiscoveryResult(draft)) {
      throw new Error(
        "AI response parsed but missing required fields (studentName, scoreInput, navigation.mode, feedback, or save)",
      );
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
