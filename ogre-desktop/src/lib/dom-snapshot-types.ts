/**
 * dom-snapshot-types.ts - Type definitions for the smart DOM snapshot engine
 *
 * Defines the shape of nodes produced by the enhanced DOM walker, priority
 * scoring, snapshot options/metadata, and type guards used throughout the
 * discovery pipeline.
 */

// ============================================================================
// Priority Scoring
// ============================================================================

/**
 * Priority tier assigned to each captured node.
 * Used to decide which nodes survive when the snapshot is trimmed to the
 * 12K-char prompt budget.
 *
 *  'critical'  — Always kept; likely a grading widget (score input, response region)
 *  'high'      — Strong structural signal; kept unless budget is very tight
 *  'medium'    — Contextual; kept if budget allows
 *  'low'       — Decorative / layout noise; first to be dropped
 */
export type NodePriority = 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// Snapshot Node
// ============================================================================

/**
 * A single node captured by the DOM walker.
 * Plain JSON — no DOM references, safe to stringify and pass through CDP.
 */
export interface SnapshotNode {
  /** Tag name (lower-cased), e.g. 'div', 'input', 'span' */
  tag: string;
  /** Depth in the captured subtree (root = 0) */
  depth: number;
  /** Priority tier assigned by classifyNodePriority() */
  priority: NodePriority;
  /** Trimmed text content (≤ 150 chars by default) */
  text?: string;
  /** Key attributes (id, class, name, type, data-*, aria-*, role, …) */
  attrs: Record<string, string>;
  /** CSS selector path from capture root to this node */
  selector?: string;
  /** Child nodes (present when depth < maxDepth) */
  children?: SnapshotNode[];
  /** Bounding box — only present when captureBoundingBoxes is true */
  bbox?: BoundingBox;
}

// ============================================================================
// Bounding Box
// ============================================================================

/**
 * Viewport-relative bounding box in CSS pixels.
 * Populated only when SnapshotOptions.captureBoundingBoxes is true.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Whether the element is visible (non-zero dimensions and not display:none) */
  visible: boolean;
}

// ============================================================================
// Snapshot Options
// ============================================================================

/**
 * Options passed to the DOM walker when capturing a snapshot.
 */
export interface SnapshotOptions {
  /** Maximum node depth to capture (default: 8) */
  maxDepth?: number;
  /** Maximum number of nodes to include before trimming (default: 500) */
  maxNodes?: number;
  /** Maximum characters per text node (default: 150) */
  maxTextLength?: number;
  /** CSS selector for the root element (default: 'body') */
  rootSelector?: string;
  /** Whether to capture getBoundingClientRect data (default: false) */
  captureBoundingBoxes?: boolean;
  /** Whether to skip hidden elements (display:none, visibility:hidden) (default: true) */
  skipHidden?: boolean;
  /** Additional attribute names to capture beyond the defaults */
  extraAttrs?: string[];
  /** Target character budget for JSON output (used by adaptive trimming) */
  charBudget?: number;
}

// ============================================================================
// Snapshot Metadata
// ============================================================================

/**
 * Metadata attached to every SnapshotResult.
 * Useful for debugging, budgeting, and logging.
 */
export interface SnapshotMetadata {
  /** Total nodes visited (before any trimming) */
  totalVisited: number;
  /** Nodes included in the final output */
  nodesIncluded: number;
  /** Nodes dropped due to priority / budget trimming */
  nodesDropped: number;
  /** Whether the output was truncated to fit the char budget */
  wasTruncated: boolean;
  /** Final JSON character count of the nodes array */
  charCount: number;
  /** Capture timestamp (ISO 8601) */
  capturedAt: string;
  /** Options used for this capture */
  options: Required<SnapshotOptions>;
}

// ============================================================================
// Snapshot Result
// ============================================================================

/**
 * Full output of a DOM snapshot operation.
 */
export interface SnapshotResult {
  /** Root nodes of the captured subtree */
  nodes: SnapshotNode[];
  /** Metadata about the capture */
  meta: SnapshotMetadata;
}

// ============================================================================
// Priority Classifier
// ============================================================================

/**
 * Attribute names that signal a high-priority grading widget.
 * Kept outside classifyNodePriority so tests can inspect / extend.
 */
export const CRITICAL_ATTR_SIGNALS: ReadonlySet<string> = new Set([
  'data-lastchange',
  'data-student',
  'data-score',
  'data-response',
  'data-gradable',
]);

/** Tags that are nearly always low-priority decorative elements */
export const LOW_PRIORITY_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'noscript',
  'meta',
  'link',
  'head',
  'svg',
  'path',
  'g',
  'defs',
  'symbol',
]);

/** Tags that typically carry grading content */
export const HIGH_PRIORITY_TAGS: ReadonlySet<string> = new Set([
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'table',
  'tr',
  'td',
  'th',
]);

/**
 * Classify the priority of a DOM node based on its tag, attributes, text
 * content, and structural position.
 *
 * Rules (first match wins):
 *  1. LOW_PRIORITY_TAGS → 'low'
 *  2. Any key in CRITICAL_ATTR_SIGNALS present in attrs → 'critical'
 *  3. input[type=number|text] or textarea → 'critical' (likely score entry)
 *  4. HIGH_PRIORITY_TAGS → 'high'
 *  5. Has non-trivial text (> 5 chars) → 'medium'
 *  6. Has children → 'medium'
 *  7. Otherwise → 'low'
 *
 * @param tag         Lower-cased tag name
 * @param attrs       Key→value attribute map
 * @param hasText     Whether the node has non-whitespace text content
 * @param childCount  Number of direct children
 */
export function classifyNodePriority(
  tag: string,
  attrs: Record<string, string>,
  hasText: boolean,
  childCount: number
): NodePriority {
  // Rule 1: always low for decorative/meta tags
  if (LOW_PRIORITY_TAGS.has(tag)) return 'low';

  // Rule 2: explicit grading-data attribute
  for (const key of Object.keys(attrs)) {
    if (CRITICAL_ATTR_SIGNALS.has(key)) return 'critical';
  }

  // Rule 3: score/response input widgets
  if (tag === 'input') {
    const type = (attrs['type'] ?? '').toLowerCase();
    if (type === 'number' || type === 'text' || type === '') return 'critical';
  }
  if (tag === 'textarea') return 'critical';

  // Rule 4: structurally significant tags
  if (HIGH_PRIORITY_TAGS.has(tag)) return 'high';

  // Rule 5 & 6: has meaningful content or children
  if (hasText || childCount > 0) return 'medium';

  return 'low';
}

// ============================================================================
// Type Guards
// ============================================================================

/** Returns true if value is a valid SnapshotNode (minimal check). */
export function isSnapshotNode(value: unknown): value is SnapshotNode {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['tag'] === 'string' &&
    typeof v['depth'] === 'number' &&
    typeof v['priority'] === 'string' &&
    ['critical', 'high', 'medium', 'low'].includes(v['priority'] as string) &&
    typeof v['attrs'] === 'object' &&
    v['attrs'] !== null
  );
}

/** Returns true if value is a valid SnapshotResult. */
export function isValidSnapshotResult(value: unknown): value is SnapshotResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v['nodes']) &&
    v['nodes'].every(isSnapshotNode) &&
    typeof v['meta'] === 'object' &&
    v['meta'] !== null
  );
}
