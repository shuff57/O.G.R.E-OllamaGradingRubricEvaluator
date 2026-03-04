/**
 * extraction-config-discovery.ts - AI-driven ExtractionConfig auto-detection
 *
 * Provides:
 *  - EXTRACTION_CONFIG_SYSTEM_PROMPT  — separate system prompt for the
 *    ExtractionConfig discovery call (distinct from DISCOVERY_SYSTEM_PROMPT)
 *  - parseExtractionConfigResponse()  — parses the raw LLM response into an
 *    ExtractionConfig, stripping think blocks and code fences
 *  - isValidExtractionConfig()        — runtime type guard
 *
 * The ExtractionConfig discovery is intentionally a SEPARATE AI call from the
 * selector discovery call. This keeps the prompts focused and reduces hallucinations.
 */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { ExtractionConfig } from './site-profiles';
import { getHandshakeToken } from './provider-sync';
import { withRetry } from './ai-retry';
import { extractContentFromSSE } from './discover';

// ============================================================================
// System Prompt
// ============================================================================

/**
 * System prompt for the ExtractionConfig discovery AI call.
 *
 * Instructs the AI to analyse the DOM snapshot and determine the best
 * extraction method for both student responses and max scores.
 *
 * Must NOT be confused with DISCOVERY_SYSTEM_PROMPT in discover.ts.
 */
export const EXTRACTION_CONFIG_SYSTEM_PROMPT = `You are an expert at analysing web-based grading pages and determining how to extract student responses and maximum scores from them.

You will be given a JSON DOM snapshot of a grading page. Your task is to identify the best extraction strategy for:
1. **Student response** — the student's submitted answer (text, number, or embedded content)
2. **Maximum score** — the highest possible score for the question

## Response Format
Respond ONLY with valid JSON matching this exact structure — no explanations, no markdown, no code fences:

{
  "responseMethod": "childIndex" | "iframe" | "selector",
  "responsePath": "optional.path.for.childIndex.method",
  "iframeSelector": "CSS selector if iframe method",
  "responseSelector": "CSS selector if selector method",
  "maxScoreMethod": "parentTextRegex" | "inputLabel" | "selector",
  "maxScoreRegex": "regex pattern if parentTextRegex",
  "maxScorePattern": "label pattern if inputLabel",
  "maxScoreSelector": "CSS selector if selector method",
  "maxScoreDefault": "10"
}

## Rules
- responseMethod must be exactly one of: "childIndex", "iframe", "selector"
- maxScoreMethod must be exactly one of: "parentTextRegex", "inputLabel", "selector"
- maxScoreDefault must always be a string (e.g. "10"), never a number
- Only include fields relevant to the chosen methods — omit irrelevant optional fields
- If you cannot determine extraction strategy, respond with the safest defaults:
  {"responseMethod":"selector","responseSelector":"","maxScoreMethod":"parentTextRegex","maxScoreRegex":"/(\\d+\\.?\\d*)","maxScoreDefault":"10"}

## Method Guidance

### responseMethod
- "childIndex"  — use when the response is accessible via a known child element path
                   from a parent container (common on MyOpenMath)
- "iframe"      — use when the response lives inside an embedded iframe
- "selector"    — use when a direct CSS selector can target the response element

### maxScoreMethod
- "parentTextRegex" — use when the max score appears in surrounding text (e.g. "/ 10 pts")
- "inputLabel"      — use when a form label or aria-label contains the max score
- "selector"        — use when a specific element contains only the score value`;

// ============================================================================
// Valid Values (for guard + tests)
// ============================================================================

const VALID_RESPONSE_METHODS = new Set<ExtractionConfig['responseMethod']>([
  'childIndex',
  'iframe',
  'selector',
]);

const VALID_MAX_SCORE_METHODS = new Set<ExtractionConfig['maxScoreMethod']>([
  'parentTextRegex',
  'inputLabel',
  'selector',
]);

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Runtime type guard for ExtractionConfig.
 * Validates required fields and ensures enum values are correct.
 */
export function isValidExtractionConfig(obj: unknown): obj is ExtractionConfig {
  if (typeof obj !== 'object' || obj === null) return false;

  const o = obj as Record<string, unknown>;

  // Required fields
  if (!VALID_RESPONSE_METHODS.has(o['responseMethod'] as ExtractionConfig['responseMethod'])) {
    return false;
  }
  if (!VALID_MAX_SCORE_METHODS.has(o['maxScoreMethod'] as ExtractionConfig['maxScoreMethod'])) {
    return false;
  }
  if (typeof o['maxScoreDefault'] !== 'string') return false;

  // Optional string fields — if present, must be strings
  const optionalStrings: (keyof ExtractionConfig)[] = [
    'responsePath',
    'iframeSelector',
    'responseSelector',
    'maxScoreRegex',
    'maxScorePattern',
    'maxScoreSelector',
  ];
  for (const key of optionalStrings) {
    if (key in o && o[key] !== undefined && typeof o[key] !== 'string') {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Response Parser
// ============================================================================

/**
 * Parse a raw LLM response string into an ExtractionConfig.
 *
 * Strips:
 *  - `<think>...</think>` blocks (chain-of-thought tokens from reasoning models)
 *  - ` ```json ... ``` ` fenced code blocks
 *  - ` ``` ` plain fenced blocks
 *
 * Returns null if:
 *  - No JSON object can be parsed
 *  - Parsed JSON fails isValidExtractionConfig()
 *
 * @param response Raw string from the LLM
 */
export function parseExtractionConfigResponse(response: string): ExtractionConfig | null {
  if (!response || typeof response !== 'string') return null;

  let cleaned = response.trim();

  // Strip think blocks (e.g. <think>...</think>)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip fenced code blocks (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // Extract first JSON object from the remaining text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!isValidExtractionConfig(parsed)) return null;

  return parsed;
}

// ============================================================================
// Discovery AI Call Types
// ============================================================================

/** Options for the extraction config discovery AI call. */
export interface ExtractionConfigDiscoveryOptions {
  /** AI provider override (e.g. 'openai', 'ollama-local'). */
  provider?: string;
  /** Model name override. */
  model?: string;
}

/** Function that evaluates a script string in the webview and returns the result. */
export type EvalScriptFn = (script: string) => Promise<unknown>;

/** Validation result from testing an ExtractionConfig against the live page. */
export interface ExtractionConfigValidationResult {
  /** Overall pass — true only when both response and maxScore validated. */
  valid: boolean;
  /** Whether the response extraction method found matching elements. */
  responseValid: boolean;
  /** Whether the max score extraction method found matching elements. */
  maxScoreValid: boolean;
  /** Human-readable detail about the response validation. */
  responseDetail: string;
  /** Human-readable detail about the max score validation. */
  maxScoreDetail: string;
  /** Sample text extracted by the max score method (if any). */
  maxScoreSample: string;
}

// ============================================================================
// Private Helpers (same logic as discover.ts — those are module-private there)
// ============================================================================

const SERVER_BASE = 'http://localhost:3456';

/**
 * Normalize provider IDs to the server's expected values.
 * The frontend uses 'ollama-local'/'ollama-cloud' but the server only
 * recognises 'ollama'.
 */
function normalizeProviderId(id: string): string {
  switch (id.toLowerCase()) {
    case 'ollama-local':
    case 'ollama-cloud':
      return 'ollama';
    default:
      return id;
  }
}

/** Auth headers for grading server requests (mirrors discover.ts). */
function authHeaders(): Record<string, string> {
  const token = getHandshakeToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ============================================================================
// Discovery AI Call
// ============================================================================

/**
 * Discover the ExtractionConfig for a grading page by sending the DOM
 * snapshot to the AI provider.
 *
 * Uses the same HTTP + auth + SSE infrastructure as `callDiscoveryAI()`
 * in discover.ts, but sends DOM only (no screenshot) and uses
 * EXTRACTION_CONFIG_SYSTEM_PROMPT instead of DISCOVERY_SYSTEM_PROMPT.
 *
 * @param domSnapshot - Stringified DOM snapshot of the grading page
 * @param options     - Optional provider/model overrides
 * @returns Parsed ExtractionConfig
 * @throws Error if the AI call fails, returns empty, or the response
 *         cannot be parsed into a valid ExtractionConfig
 */
export async function discoverExtractionConfig(
  domSnapshot: string,
  options?: ExtractionConfigDiscoveryOptions,
): Promise<ExtractionConfig> {
  // Build request body — DOM-only, no images array
  const body: Record<string, unknown> = {
    message: `Analyze this DOM snapshot and determine the extraction configuration:\n\n${domSnapshot}`,
    systemPrompt: EXTRACTION_CONFIG_SYSTEM_PROMPT,
  };

  if (options?.provider) body.provider = normalizeProviderId(options.provider);
  if (options?.model) body.model = options.model;

  const response = await withRetry(async () => {
    const res = await tauriFetch(`${SERVER_BASE}/api/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let errorMsg = `Extraction config AI call failed (HTTP ${res.status})`;
      try {
        const errData = (await res.json()) as { error?: string };
        errorMsg = errData.error || errorMsg;
      } catch {
        // Use status-based message
      }
      const err = new Error(errorMsg);
      (err as Error & { status: number }).status = res.status;
      throw err;
    }
    return res;
  });

  // Handle SSE or JSON response (same as callDiscoveryAI in discover.ts)
  const contentType = response.headers.get('content-type') || '';
  let aiResponseText: string;

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    aiResponseText = extractContentFromSSE(text);
  } else {
    const data = (await response.json()) as { content?: string; message?: string };
    aiResponseText = data.content || data.message || '';
  }

  if (!aiResponseText.trim()) {
    throw new Error('Extraction config AI returned empty response');
  }

  const config = parseExtractionConfigResponse(aiResponseText);
  if (!config) {
    throw new Error('Failed to parse extraction config from AI response');
  }

  return config;
}

// ============================================================================
// Extraction Config Validation
// ============================================================================

/**
 * Build the validation script that runs inside the webview.
 * Tests the ExtractionConfig's selectors and regex patterns against the
 * live DOM and returns a result object with validity flags and sample text.
 */
function buildExtractionConfigValidationScript(config: ExtractionConfig): string {
  const configJSON = JSON.stringify(config);

  return `(function() {
    var config = ${configJSON};
    var result = {
      responseValid: false,
      responseDetail: '',
      maxScoreValid: false,
      maxScoreDetail: '',
      maxScoreSample: ''
    };

    // ── Test response extraction ──
    try {
      if (config.responseMethod === 'selector' && config.responseSelector) {
        var el = document.querySelector(config.responseSelector);
        result.responseValid = !!el;
        result.responseDetail = el
          ? 'Found: ' + (el.textContent || '').trim().substring(0, 80)
          : 'Selector not found';
      } else if (config.responseMethod === 'iframe' && config.iframeSelector) {
        var iframe = document.querySelector(config.iframeSelector);
        result.responseValid = !!iframe && iframe.tagName === 'IFRAME';
        result.responseDetail = iframe ? 'Found iframe element' : 'Iframe selector not found';
      } else if (config.responseMethod === 'childIndex') {
        result.responseValid = !!config.responsePath;
        result.responseDetail = config.responsePath
          ? 'Path configured: ' + config.responsePath
          : 'No responsePath provided';
      } else {
        result.responseDetail = 'Unknown response method or missing selector';
      }
    } catch (e) {
      result.responseDetail = 'Error testing response: ' + e.message;
    }

    // ── Test max score extraction ──
    try {
      if (config.maxScoreMethod === 'parentTextRegex' && config.maxScoreRegex) {
        var bodyText = document.body.textContent || '';
        var regex = new RegExp(config.maxScoreRegex);
        var match = bodyText.match(regex);
        result.maxScoreValid = !!match;
        result.maxScoreSample = match ? match[0].substring(0, 40) : '';
        result.maxScoreDetail = match
          ? 'Regex matched: ' + match[0].substring(0, 40)
          : 'Regex did not match any text';
      } else if (config.maxScoreMethod === 'selector' && config.maxScoreSelector) {
        var scoreEl = document.querySelector(config.maxScoreSelector);
        result.maxScoreValid = !!scoreEl;
        result.maxScoreSample = scoreEl
          ? (scoreEl.textContent || '').trim().substring(0, 40)
          : '';
        result.maxScoreDetail = scoreEl
          ? 'Found: ' + result.maxScoreSample
          : 'Selector not found';
      } else if (config.maxScoreMethod === 'inputLabel' && config.maxScorePattern) {
        var labels = document.querySelectorAll('label');
        var found = false;
        var labelRegex = new RegExp(config.maxScorePattern);
        for (var i = 0; i < labels.length; i++) {
          var labelText = (labels[i].textContent || '').trim();
          if (labelRegex.test(labelText)) {
            found = true;
            result.maxScoreSample = labelText.substring(0, 40);
            break;
          }
        }
        result.maxScoreValid = found;
        result.maxScoreDetail = found
          ? 'Label matched: ' + result.maxScoreSample
          : 'No label matched pattern';
      } else {
        result.maxScoreDetail = 'Unknown max score method or missing pattern';
      }
    } catch (e) {
      result.maxScoreDetail = 'Error testing max score: ' + e.message;
    }

    return result;
  })()`;
}

/**
 * Validate an ExtractionConfig against the live page by executing a test
 * script in the webview.
 *
 * The script checks:
 *  - Response method: whether the configured selector/iframe/path exists
 *  - Max score method: whether the regex/selector/label pattern matches
 *
 * @param config       - ExtractionConfig to validate
 * @param evalScriptFn - Function that evaluates JS in the webview (e.g. evalScriptJSON)
 * @returns Validation result with per-field validity and sample text
 */
export async function validateExtractionConfig(
  config: ExtractionConfig,
  evalScriptFn: EvalScriptFn,
): Promise<ExtractionConfigValidationResult> {
  const script = buildExtractionConfigValidationScript(config);
  const raw = await evalScriptFn(script);

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      responseValid: false,
      maxScoreValid: false,
      responseDetail: 'Validation script returned invalid data',
      maxScoreDetail: 'Validation script returned invalid data',
      maxScoreSample: '',
    };
  }

  const r = raw as Record<string, unknown>;
  const responseValid = r['responseValid'] === true;
  const maxScoreValid = r['maxScoreValid'] === true;

  return {
    valid: responseValid && maxScoreValid,
    responseValid,
    maxScoreValid,
    responseDetail: typeof r['responseDetail'] === 'string' ? r['responseDetail'] : '',
    maxScoreDetail: typeof r['maxScoreDetail'] === 'string' ? r['maxScoreDetail'] : '',
    maxScoreSample: typeof r['maxScoreSample'] === 'string' ? r['maxScoreSample'] : '',
  };
}
