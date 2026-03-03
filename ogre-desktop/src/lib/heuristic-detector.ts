/**
 * heuristic-detector.ts — Structural heuristic detector (T10)
 *
 * Pure-function analysis of a SnapshotResult to detect grading page structure
 * WITHOUT any LMS-specific checks. Identifies batch vs sequential modes by
 * looking for repeating rows, navigation buttons, score inputs, and name
 * candidates.
 */

import type { SnapshotResult, SnapshotNode } from './dom-snapshot-types';

// ============================================================================
// Public types
// ============================================================================

export interface HeuristicDetection {
  mode: 'batch' | 'sequential';
  candidateSelectors: {
    studentSection?: string | null;
    studentName: string;
    scoreInput: string;
    feedbackBox?: string | null;
    feedbackHidden?: string | null;
    questionRegion?: string | null;
    fullCreditLink?: string | null;
  };
  confidence: number; // 0 to 1
  patternName: string; // human-readable pattern name
}

// ============================================================================
// Helpers
// ============================================================================

/** Regex for navigation button text (sequential mode signal). */
const NAV_BUTTON_RE = /prev|previous|next|◄|►|←|→|«|»|laquo|raquo/i;

/** Regex for save/submit button text. */
const SAVE_BUTTON_RE = /save|submit|record|quick save/i;

/**
 * Flatten all nodes in a SnapshotResult into a depth-first ordered array.
 * Walks all children arrays recursively.
 */
export function flattenSnapshot(snapshot: SnapshotResult): SnapshotNode[] {
  const result: SnapshotNode[] = [];
  function walk(nodes: SnapshotNode[]): void {
    for (const n of nodes) {
      result.push(n);
      if (n.children && n.children.length > 0) {
        walk(n.children);
      }
    }
  }
  walk(snapshot.nodes);
  return result;
}

/** Get a usable selector string for a node. Prefers existing selector, then constructs tag-based. */
function selectorFor(n: SnapshotNode): string {
  if (n.selector) return n.selector;
  const id = n.attrs['id'];
  if (id) return `#${id}`;
  const name = n.attrs['name'];
  if (name) return `${n.tag}[name="${name}"]`;
  const cls = n.attrs['class'];
  if (cls) return `${n.tag}.${cls.split(/\s+/)[0]}`;
  return n.tag;
}

/** Check whether a node is a score-type input (number/text input or textarea). */
function isScoreInput(n: SnapshotNode): boolean {
  if (n.tag === 'textarea') return true;
  if (n.tag === 'input') {
    const type = (n.attrs['type'] ?? '').toLowerCase();
    return type === 'number' || type === 'text' || type === '';
  }
  return false;
}

/** Check whether a node subtree contains at least one 'critical' node. */
function subtreeHasCritical(n: SnapshotNode): boolean {
  if (n.priority === 'critical') return true;
  if (n.children) {
    for (const child of n.children) {
      if (subtreeHasCritical(child)) return true;
    }
  }
  return false;
}

/** Check whether a node looks like a navigation button (sequential mode). */
function isNavButton(n: SnapshotNode): boolean {
  if (n.tag !== 'button' && n.tag !== 'a' && n.tag !== 'input') return false;
  const text = n.text ?? '';
  return NAV_BUTTON_RE.test(text);
}

/** Check whether a node looks like a save/submit button. */
function isSaveButton(n: SnapshotNode): boolean {
  if (n.tag !== 'button' && n.tag !== 'input' && n.tag !== 'a') return false;
  const text = n.text ?? '';
  const value = n.attrs['value'] ?? '';
  return SAVE_BUTTON_RE.test(text) || SAVE_BUTTON_RE.test(value);
}

/**
 * Find groups of 3+ siblings that share the same tag and each contain
 * a critical-priority node in their subtree. Returns the best group found.
 */
function findRepeatingRows(
  allNodes: SnapshotNode[],
  snapshot: SnapshotResult,
): { rows: SnapshotNode[]; parent: SnapshotNode | null } | null {
  // Check children arrays of every node (including root-level)
  const candidates: Array<{ parent: SnapshotNode | null; rows: SnapshotNode[] }> = [];

  function checkChildren(parent: SnapshotNode | null, children: SnapshotNode[]): void {
    // Group children by tag
    const byTag = new Map<string, SnapshotNode[]>();
    for (const child of children) {
      const existing = byTag.get(child.tag) ?? [];
      existing.push(child);
      byTag.set(child.tag, existing);
    }

    for (const [, group] of byTag) {
      // Need 3+ siblings of the same tag, each with a critical subtree
      const withCritical = group.filter(subtreeHasCritical);
      if (withCritical.length >= 3) {
        candidates.push({ parent, rows: withCritical });
      }
    }

    // Recurse into children
    for (const child of children) {
      if (child.children && child.children.length > 0) {
        checkChildren(child, child.children);
      }
    }
  }

  checkChildren(null, snapshot.nodes);

  if (candidates.length === 0) return null;
  // Return the candidate with the most rows
  candidates.sort((a, b) => b.rows.length - a.rows.length);
  return candidates[0];
}

/**
 * Find a text node that appears to be a student name (sibling of an input node).
 * Returns the first matching text node.
 */
function findNameCandidate(allNodes: SnapshotNode[]): SnapshotNode | null {
  // Walk all nodes that have children; look for text siblings of input siblings
  function searchChildren(children: SnapshotNode[]): SnapshotNode | null {
    const hasInput = children.some(
      (c) => c.priority === 'critical' && isScoreInput(c),
    );
    const textNodes = children.filter(
      (c) => c.text && c.text.length > 1 && !isScoreInput(c) && c.tag !== 'button',
    );

    // Direct sibling match
    if (hasInput && textNodes.length > 0) return textNodes[0];

    // Recurse — check inside each child's children
    for (const child of children) {
      if (child.children && child.children.length > 0) {
        const found = searchChildren(child.children);
        if (found) return found;
      }
    }
    return null;
  }

  // Start from top-level nodes
  return null; // We'll use a different approach below
}

/**
 * Find name candidates by looking at nodes within repeating rows:
 * any text-bearing non-input node alongside a score input.
 */
function findNameInRows(rows: SnapshotNode[]): SnapshotNode | null {
  for (const row of rows) {
    if (!row.children) continue;
    const found = findNameInSubtree(row);
    if (found) return found;
  }
  return null;
}

function findNameInSubtree(parent: SnapshotNode): SnapshotNode | null {
  if (!parent.children) return null;

  // Check if this level has both a text node and a score input
  const scoreInputs = parent.children.filter(
    (c) => isScoreInput(c) || (c.children && flatChildren(c).some(isScoreInput)),
  );
  const textCandidates = parent.children.filter(
    (c) =>
      c.text &&
      c.text.length > 1 &&
      !isScoreInput(c) &&
      c.tag !== 'button' &&
      c.tag !== 'label',
  );

  if (scoreInputs.length > 0 && textCandidates.length > 0) {
    return textCandidates[0];
  }

  // Recurse
  for (const child of parent.children) {
    const found = findNameInSubtree(child);
    if (found) return found;
  }
  return null;
}

/** Get all descendants of a node (flat). */
function flatChildren(n: SnapshotNode): SnapshotNode[] {
  const result: SnapshotNode[] = [];
  function walk(node: SnapshotNode): void {
    if (node.children) {
      for (const c of node.children) {
        result.push(c);
        walk(c);
      }
    }
  }
  walk(n);
  return result;
}

/**
 * Find the first score input node in the flattened node list.
 */
function findScoreInput(allNodes: SnapshotNode[]): SnapshotNode | null {
  return allNodes.find((n) => isScoreInput(n) && n.priority === 'critical') ?? null;
}

/**
 * Find the first feedback textarea/input.
 */
function findFeedbackBox(allNodes: SnapshotNode[]): SnapshotNode | null {
  return (
    allNodes.find(
      (n) => n.tag === 'textarea' && !isScoreInput(n),
    ) ??
    allNodes.find((n) => n.tag === 'textarea') ??
    null
  );
}

// ============================================================================
// Main detection
// ============================================================================

/**
 * Detect grading page structure from a DOM snapshot using structural heuristics.
 *
 * Pure function — no side effects, no DOM access, no LMS-specific logic.
 *
 * @param snapshot - The snapshot result to analyse
 * @returns Detection result, or null if confidence < 0.3
 */
export function detectGradingStructure(
  snapshot: SnapshotResult,
): HeuristicDetection | null {
  const allNodes = flattenSnapshot(snapshot);
  if (allNodes.length === 0) return null;

  // ---- Signal detection ----
  let confidence = 0;
  const patterns: string[] = [];

  // 1. Repeating rows with inputs (batch signal)
  const repeating = findRepeatingRows(allNodes, snapshot);
  let batchSignal = false;
  if (repeating) {
    confidence += 0.4;
    batchSignal = true;
    patterns.push('repeating-rows');
  }

  // 2. Score input found
  const scoreNode = findScoreInput(allNodes);
  if (scoreNode) {
    confidence += 0.3;
    patterns.push('score-input');
  }

  // 3. Student name candidate
  let nameNode: SnapshotNode | null = null;
  if (repeating) {
    nameNode = findNameInRows(repeating.rows);
  }
  if (!nameNode) {
    // Fallback: search all nodes for text siblings of inputs
    nameNode = findNameGlobal(allNodes, snapshot);
  }
  if (nameNode) {
    confidence += 0.2;
    patterns.push('name-candidate');
  }

  // 4. Save button
  const saveNode = allNodes.find(isSaveButton) ?? null;
  if (saveNode) {
    confidence += 0.1;
    patterns.push('save-button');
  }

  // 5. Navigation buttons (sequential signal)
  const navNodes = allNodes.filter(isNavButton);
  const hasNav = navNodes.length > 0;

  // ---- Threshold check ----
  if (confidence < 0.3) return null;

  // ---- Mode determination ----
  // Sequential mode: nav buttons present AND we have a score input AND NOT batch
  const mode: 'batch' | 'sequential' =
    hasNav && scoreNode && !batchSignal ? 'sequential' : 'batch';

  if (mode === 'sequential' && !patterns.includes('score-input')) {
    // Sequential without score input is unusual; already filtered by confidence
  }

  // ---- Build pattern name ----
  const patternName =
    mode === 'batch'
      ? `Batch grading (${patterns.join(', ')})`
      : `Sequential grading (${patterns.join(', ')})`;

  // ---- Find feedback box ----
  const feedbackNode = findFeedbackBox(allNodes);

  // ---- Build result ----
  return {
    mode,
    candidateSelectors: {
      studentSection: repeating ? selectorFor(repeating.rows[0]) : null,
      studentName: nameNode ? selectorFor(nameNode) : '',
      scoreInput: scoreNode ? selectorFor(scoreNode) : '',
      feedbackBox: feedbackNode ? selectorFor(feedbackNode) : null,
      feedbackHidden: null,
      questionRegion: null,
      fullCreditLink: null,
    },
    confidence: Math.min(confidence, 1),
    patternName,
  };
}

/**
 * Global search for a name candidate: find any text node that is a sibling
 * (at any level) of a score input.
 */
function findNameGlobal(
  allNodes: SnapshotNode[],
  snapshot: SnapshotResult,
): SnapshotNode | null {
  function search(children: SnapshotNode[]): SnapshotNode | null {
    // Flatten this level: check if any child is/has a score input
    const hasScore = children.some((c) => {
      if (isScoreInput(c) && c.priority === 'critical') return true;
      return flatChildren(c).some(
        (fc) => isScoreInput(fc) && fc.priority === 'critical',
      );
    });

    if (hasScore) {
      // Look for text-bearing siblings
      for (const c of children) {
        if (
          c.text &&
          c.text.length > 1 &&
          !isScoreInput(c) &&
          c.tag !== 'button' &&
          c.tag !== 'label'
        ) {
          return c;
        }
      }
    }

    // Recurse
    for (const c of children) {
      if (c.children && c.children.length > 0) {
        const found = search(c.children);
        if (found) return found;
      }
    }
    return null;
  }

  return search(snapshot.nodes);
}
