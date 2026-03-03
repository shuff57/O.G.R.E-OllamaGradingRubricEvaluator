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

import type { ExtractionConfig } from './site-profiles';

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
