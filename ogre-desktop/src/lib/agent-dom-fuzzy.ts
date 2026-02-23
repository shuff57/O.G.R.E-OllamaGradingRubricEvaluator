// ============================================================================
// Fuzzy DOM Matching — recovers from stale/broken selectors
// ============================================================================

import type { InteractiveElement } from './agent-types';

// ============================================================================
// Selector Parsing Helpers
// ============================================================================

/**
 * Extract readable text fragments from a CSS selector.
 * Looks for quoted strings, :has-text(), :text(), and content-like patterns.
 */
function extractTextFromSelector(selector: string): string | null {
  // Match :has-text("..."), :text("..."), or generic quoted strings in attr selectors
  const patterns = [
    /:has-text\(["']([^"']+)["']\)/i,
    /:text\(["']([^"']+)["']\)/i,
    /\[(?:title|alt|placeholder|value)=["']([^"']+)["']\]/i,
    /["']([^"']{2,})["']/,  // any quoted string ≥2 chars
  ];

  for (const pattern of patterns) {
    const match = selector.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Extract ID fragment from a selector (e.g. "#submit-btn" → "submit-btn").
 */
function extractId(selector: string): string | null {
  const match = selector.match(/#([\w-]+)/);
  return match?.[1] ?? null;
}

/**
 * Extract class fragments from a selector (e.g. ".btn.primary" → ["btn", "primary"]).
 */
function extractClasses(selector: string): string[] {
  const matches = selector.match(/\.([\w-]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1)); // strip leading dot
}

/**
 * Extract aria-label value from a selector.
 */
function extractAriaLabel(selector: string): string | null {
  const match = selector.match(/\[aria-label=["']([^"']+)["']\]/i);
  return match?.[1] ?? null;
}

/**
 * Extract the leading tag name from a selector (e.g. "button.primary" → "button").
 */
function extractTag(selector: string): string | null {
  const match = selector.match(/^([a-z][a-z0-9]*)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

// ============================================================================
// Matching Strategies (tried in order, first match wins)
// ============================================================================

/** Strategy 1: Text content match (case-insensitive). */
function matchByText(
  selector: string,
  elements: InteractiveElement[],
): InteractiveElement | null {
  const text = extractTextFromSelector(selector);
  if (!text) return null;

  const needle = text.toLowerCase();
  return (
    elements.find((el) => el.text?.toLowerCase().includes(needle)) ?? null
  );
}

/** Strategy 2: Partial ID or class substring match. */
function matchByIdOrClass(
  selector: string,
  elements: InteractiveElement[],
): InteractiveElement | null {
  const id = extractId(selector);
  if (id) {
    const byId = elements.find(
      (el) =>
        el.id?.includes(id) || el.selector?.includes(`#${id}`),
    );
    if (byId) return byId;
  }

  const classes = extractClasses(selector);
  for (const cls of classes) {
    const byClass = elements.find(
      (el) => el.selector?.includes(`.${cls}`),
    );
    if (byClass) return byClass;
  }

  return null;
}

/** Strategy 3: Aria-label match. */
function matchByAriaLabel(
  selector: string,
  elements: InteractiveElement[],
): InteractiveElement | null {
  const label = extractAriaLabel(selector);
  if (!label) return null;

  const needle = label.toLowerCase();
  return (
    elements.find((el) =>
      el.selector?.toLowerCase().includes(`aria-label`) &&
      el.selector?.toLowerCase().includes(needle),
    ) ?? null
  );
}

/** Strategy 4: Tag + position heuristic — first visible element of that tag type. */
function matchByTagPosition(
  selector: string,
  elements: InteractiveElement[],
): InteractiveElement | null {
  const tag = extractTag(selector);
  if (!tag) return null;

  return (
    elements.find((el) => el.tag === tag && el.visible) ?? null
  );
}

// Ordered strategy list
const strategies = [
  matchByText,
  matchByIdOrClass,
  matchByAriaLabel,
  matchByTagPosition,
] as const;

// Strategy names for human-readable reasons
const strategyNames = [
  'text-content',
  'partial-id-or-class',
  'aria-label',
  'tag-position-heuristic',
] as const;

// ============================================================================
// Public API
// ============================================================================

/**
 * Attempt to find a fuzzy match for a failed CSS selector among the current
 * interactive elements. Tries 4 strategies in order and returns the first hit.
 *
 * @returns The matched element, or `null` if all strategies fail.
 */
export function findFuzzyMatch(
  failedSelector: string,
  elements: InteractiveElement[],
): InteractiveElement | null {
  if (!failedSelector || !elements?.length) return null;

  for (const strategy of strategies) {
    const match = strategy(failedSelector, elements);
    if (match) return match;
  }

  return null;
}

/**
 * Generate a human-readable explanation of why a fuzzy match was chosen.
 *
 * @param failedSelector  The original selector that failed.
 * @param matchedElement  The element that was matched.
 * @param strategyIndex   0-based index of the strategy that matched (0–3).
 * @returns A short explanation string.
 */
export function fuzzyMatchReason(
  failedSelector: string,
  matchedElement: InteractiveElement,
  strategyIndex: number,
): string {
  const name =
    strategyIndex >= 0 && strategyIndex < strategyNames.length
      ? strategyNames[strategyIndex]
      : 'unknown';

  const elDesc = matchedElement.id
    ? `#${matchedElement.id}`
    : matchedElement.text
      ? `"${matchedElement.text.substring(0, 40)}"` 
      : `<${matchedElement.tag}>[${matchedElement.index}]`;

  return `Fuzzy matched via ${name}: selector "${failedSelector.substring(0, 60)}" → ${elDesc}`;
}