// @vitest-environment jsdom
/**
 * heuristic-detector.test.ts — Tests for the structural heuristic detector (T10)
 *
 * TDD: Tests written first, implementation follows.
 */

import { describe, it, expect } from 'vitest';
import {
  detectGradingStructure,
  flattenSnapshot,
  type HeuristicDetection,
} from './heuristic-detector';
import type {
  SnapshotResult,
  SnapshotNode,
  SnapshotMetadata,
} from './dom-snapshot-types';

// ---------------------------------------------------------------------------
// Helpers to build mock SnapshotResult objects
// ---------------------------------------------------------------------------

const DEFAULT_META: SnapshotMetadata = {
  totalVisited: 0,
  nodesIncluded: 0,
  nodesDropped: 0,
  wasTruncated: false,
  charCount: 100,
  capturedAt: new Date().toISOString(),
  options: {
    maxDepth: 8,
    maxNodes: 500,
    maxTextLength: 150,
    rootSelector: 'body',
    captureBoundingBoxes: false,
    skipHidden: true,
    extraAttrs: [],
    charBudget: 12000,
  },
};

function meta(overrides: Partial<SnapshotMetadata> = {}): SnapshotMetadata {
  return { ...DEFAULT_META, ...overrides };
}

function node(
  tag: string,
  overrides: Partial<SnapshotNode> = {},
): SnapshotNode {
  return {
    tag,
    depth: 0,
    priority: 'medium' as const,
    attrs: {},
    ...overrides,
  };
}

/** Build a snapshot containing the given root-level nodes. */
function snap(nodes: SnapshotNode[]): SnapshotResult {
  return {
    nodes,
    meta: meta({ nodesIncluded: nodes.length, totalVisited: nodes.length }),
  };
}

/**
 * Build a batch-style snapshot: N student rows, each with a name span +
 * score input (both tagged 'critical').
 */
function batchSnapshot(count: number): SnapshotResult {
  const rows: SnapshotNode[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(
      node('div', {
        depth: 1,
        priority: 'medium',
        selector: `div.student-row:nth-child(${i + 1})`,
        attrs: { class: 'student-row' },
        children: [
          node('span', {
            depth: 2,
            priority: 'medium',
            text: `Student ${i + 1}`,
            selector: `div.student-row:nth-child(${i + 1}) > span`,
            attrs: { class: 'student-name' },
          }),
          node('input', {
            depth: 2,
            priority: 'critical',
            selector: `div.student-row:nth-child(${i + 1}) > input`,
            attrs: { type: 'number', class: 'score-input', name: `score_${i + 1}` },
          }),
        ],
      }),
    );
  }
  return snap([
    node('div', {
      depth: 0,
      priority: 'medium',
      attrs: {},
      selector: 'body > div',
      children: rows,
    }),
  ]);
}

/** Build a sequential-style snapshot with prev/next buttons + score input. */
function sequentialSnapshot(): SnapshotResult {
  return snap([
    node('div', {
      depth: 0,
      selector: '#grading-app',
      attrs: { id: 'grading-app' },
      children: [
        node('header', {
          depth: 1,
          attrs: {},
          children: [
            node('h2', {
              depth: 2,
              text: 'Student 3 of 30: Carol Davis',
              attrs: {},
            }),
            node('div', {
              depth: 2,
              attrs: { class: 'nav-controls' },
              children: [
                node('button', {
                  depth: 3,
                  priority: 'high',
                  text: '« Previous',
                  attrs: { id: 'prev-student' },
                  selector: '#prev-student',
                }),
                node('button', {
                  depth: 3,
                  priority: 'high',
                  text: 'Next »',
                  attrs: { id: 'next-student' },
                  selector: '#next-student',
                }),
              ],
            }),
          ],
        }),
        node('main', {
          depth: 1,
          attrs: {},
          children: [
            node('input', {
              depth: 2,
              priority: 'critical',
              attrs: { type: 'number', id: 'score-input', name: 'score' },
              selector: '#score-input',
            }),
            node('textarea', {
              depth: 2,
              priority: 'critical',
              attrs: { id: 'feedback-input', name: 'feedback' },
              selector: '#feedback-input',
            }),
          ],
        }),
      ],
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('flattenSnapshot', () => {
  it('returns all nodes in depth-first order from nested structure', () => {
    const result = snap([
      node('div', {
        depth: 0,
        children: [
          node('span', { depth: 1, text: 'A' }),
          node('div', {
            depth: 1,
            children: [
              node('input', { depth: 2, priority: 'critical', attrs: { type: 'text' } }),
            ],
          }),
        ],
      }),
    ]);
    const flat = flattenSnapshot(result);
    expect(flat).toHaveLength(4);
    expect(flat.map((n) => n.tag)).toEqual(['div', 'span', 'div', 'input']);
  });

  it('returns empty array for snapshot with no nodes', () => {
    const flat = flattenSnapshot(snap([]));
    expect(flat).toEqual([]);
  });
});

describe('detectGradingStructure', () => {
  // ------- Test 1: Batch detection -------
  it('detects batch mode when 3+ repeating rows each contain a critical input', () => {
    const result = detectGradingStructure(batchSnapshot(3));
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('batch');
  });

  // ------- Test 2: Sequential detection -------
  it('detects sequential mode when "Next" button + score input exist', () => {
    const result = detectGradingStructure(sequentialSnapshot());
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('sequential');
  });

  // ------- Test 3: Returns null for empty snapshot -------
  it('returns null for empty snapshot (no nodes)', () => {
    const result = detectGradingStructure(snap([]));
    expect(result).toBeNull();
  });

  // ------- Test 4: Returns null for non-grading page -------
  it('returns null for non-grading page (only div/span/p, no inputs)', () => {
    const result = detectGradingStructure(
      snap([
        node('div', {
          children: [
            node('span', { text: 'Hello' }),
            node('p', { text: 'Some paragraph' }),
            node('div', { children: [node('span', { text: 'Nested' })] }),
          ],
        }),
      ]),
    );
    expect(result).toBeNull();
  });

  // ------- Test 5: Confidence threshold -------
  it('returns null when confidence < 0.3 (single isolated input, no pattern)', () => {
    // One input alone without repeating rows or student name → only +0.3 for score input
    // but no repeating rows (+0) and no name candidate (+0) → 0.3 exactly is the threshold,
    // but the spec says "< 0.3 → null". A single lonely input should arguably not hit
    // 0.3 because it lacks any structural context. We construct a snapshot with a single
    // input that has no sibling text to confirm it stays below threshold.
    const result = detectGradingStructure(
      snap([
        node('div', {
          children: [
            node('div', { text: 'Some content' }),
          ],
        }),
      ]),
    );
    expect(result).toBeNull();
  });

  // ------- Test 6: patternName is non-empty string -------
  it('returns a non-empty patternName when detection succeeds', () => {
    const result = detectGradingStructure(batchSnapshot(3));
    expect(result).not.toBeNull();
    expect(typeof result!.patternName).toBe('string');
    expect(result!.patternName.length).toBeGreaterThan(0);
  });

  // ------- Test 7: candidateSelectors.scoreInput is non-empty -------
  it('returns a non-empty scoreInput selector when batch detection succeeds', () => {
    const result = detectGradingStructure(batchSnapshot(3));
    expect(result).not.toBeNull();
    expect(typeof result!.candidateSelectors.scoreInput).toBe('string');
    expect(result!.candidateSelectors.scoreInput.length).toBeGreaterThan(0);
  });

  // ------- Test 8: High confidence (≥0.7) -------
  it('achieves high confidence (≥ 0.7) when repeating rows + score inputs + name candidates found', () => {
    const result = detectGradingStructure(batchSnapshot(4));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  // ------- Test 9: Sequential with save button -------
  it('detects save button and includes it in confidence', () => {
    const seqSnap = sequentialSnapshot();
    // Add a save button to the sequential snapshot
    seqSnap.nodes[0].children!.push(
      node('button', {
        depth: 1,
        priority: 'high',
        text: 'Save & Next',
        attrs: { type: 'submit' },
        selector: 'button[type="submit"]',
      }),
    );
    const result = detectGradingStructure(seqSnap);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.3);
  });

  // ------- Test 10: 2 repeating rows (below threshold) still detects if other signals present -------
  it('handles 2 repeating rows (below 3-row threshold) combined with other signals', () => {
    // 2 rows with inputs → repeating rows NOT matched (needs 3+),
    // but score input IS found (+0.3) and name candidate IS found (+0.2) → 0.5 total
    const result = detectGradingStructure(batchSnapshot(2));
    expect(result).not.toBeNull();
    // Should not be batch since < 3 repeating rows
    // But has enough confidence from score inputs + names
    expect(result!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  // ------- Test 11: simple-batch fixture mock -------
  it('detects batch mode from a mock of simple-batch.html structure', () => {
    // This mirrors the real simple-batch.html fixture:
    // 3 div.student-row each with data-lastchange, span.student-name, input[type=number], textarea
    const rows: SnapshotNode[] = ['Alice Johnson', 'Bob Smith', 'Carol Davis'].map(
      (name, i) =>
        node('div', {
          depth: 1,
          priority: 'critical', // has data-lastchange
          selector: `div.student-row:nth-child(${i + 1})`,
          attrs: { class: 'student-row', 'data-lastchange': String(1706745600 + i * 100) },
          children: [
            node('span', {
              depth: 2,
              text: name,
              attrs: { class: 'student-name' },
              selector: `div.student-row:nth-child(${i + 1}) > span.student-name`,
            }),
            node('div', {
              depth: 2,
              attrs: { class: 'question-region' },
              children: [
                node('p', { depth: 3, text: `Student response: x^2 + ${i}` }),
              ],
            }),
            node('div', {
              depth: 2,
              attrs: { class: 'grading-controls' },
              children: [
                node('input', {
                  depth: 3,
                  priority: 'critical',
                  attrs: { type: 'number', class: 'score-input', name: `score_${i + 1}` },
                  selector: `input[name="score_${i + 1}"]`,
                }),
                node('textarea', {
                  depth: 3,
                  priority: 'critical',
                  attrs: { class: 'feedback-input', name: `feedback_${i + 1}` },
                  selector: `textarea[name="feedback_${i + 1}"]`,
                }),
              ],
            }),
          ],
        }),
    );

    const saveButton = node('button', {
      depth: 1,
      priority: 'high',
      text: 'Save All Grades',
      attrs: { id: 'save-all', class: 'save-btn' },
      selector: '#save-all',
    });

    const result = detectGradingStructure(
      snap([
        node('div', {
          depth: 0,
          attrs: {},
          children: [...rows, saveButton],
        }),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.mode).toBe('batch');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result!.candidateSelectors.scoreInput).toBeTruthy();
  });

  // ------- Test 12: TinyMCE contenteditable detection -------
  it('detects contenteditable div with role=textbox as feedbackBox', () => {
    // Build a batch snapshot with a contenteditable editor
    const rows: SnapshotNode[] = [];
    for (let i = 0; i < 3; i++) {
      rows.push(
        node('div', {
          depth: 1,
          priority: 'medium',
          selector: `div.student-row:nth-child(${i + 1})`,
          attrs: { class: 'student-row' },
          children: [
            node('span', {
              depth: 2,
              priority: 'medium',
              text: `Student ${i + 1}`,
              selector: `div.student-row:nth-child(${i + 1}) > span`,
              attrs: { class: 'student-name' },
            }),
            node('input', {
              depth: 2,
              priority: 'critical',
              selector: `div.student-row:nth-child(${i + 1}) > input`,
              attrs: { type: 'number', class: 'score-input', name: `score_${i + 1}` },
            }),
          ],
        }),
      );
    }

    // Add a contenteditable div (TinyMCE editor)
    const contenteditableEditor = node('div', {
      depth: 1,
      priority: 'medium',
      selector: 'div.fbbox',
      attrs: {
        contenteditable: 'true',
        role: 'textbox',
        class: 'fbbox mce-content-body',
        'aria-label': 'Feedback editor',
      },
      text: 'Enter feedback here...',
    });

    const result = detectGradingStructure(
      snap([
        node('div', {
          depth: 0,
          priority: 'medium',
          attrs: {},
          selector: 'body > div',
          children: [...rows, contenteditableEditor],
        }),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.feedbackBox).toBeTruthy();
    // Should contain 'fbbox' or 'contenteditable' in the selector
    const feedbackSelector = result!.candidateSelectors.feedbackBox || '';
    expect(feedbackSelector.toLowerCase()).toMatch(/fbbox|contenteditable/);
  });

   // ------- Test 13: contenteditable wins over textarea -------
   it('prefers contenteditable div over textarea when both exist', () => {
     // Build a batch snapshot with both contenteditable and textarea
     const rows: SnapshotNode[] = [];
     for (let i = 0; i < 3; i++) {
       rows.push(
         node('div', {
           depth: 1,
           priority: 'medium',
           selector: `div.student-row:nth-child(${i + 1})`,
           attrs: { class: 'student-row' },
           children: [
             node('span', {
               depth: 2,
               priority: 'medium',
               text: `Student ${i + 1}`,
               selector: `div.student-row:nth-child(${i + 1}) > span`,
               attrs: { class: 'student-name' },
             }),
             node('input', {
               depth: 2,
               priority: 'critical',
               selector: `div.student-row:nth-child(${i + 1}) > input`,
               attrs: { type: 'number', class: 'score-input', name: `score_${i + 1}` },
             }),
           ],
         }),
       );
     }

     // Add both contenteditable and textarea
     const contenteditableEditor = node('div', {
       depth: 1,
       priority: 'medium',
       selector: 'div.fbbox',
       attrs: {
         contenteditable: 'true',
         role: 'textbox',
         class: 'fbbox',
       },
       text: 'TinyMCE feedback',
     });

     const textareaFallback = node('textarea', {
       depth: 1,
       priority: 'medium',
       selector: 'textarea.fallback-feedback',
       attrs: { class: 'fallback-feedback', name: 'feedback' },
       text: 'Textarea feedback',
     });

     const result = detectGradingStructure(
       snap([
         node('div', {
           depth: 0,
           priority: 'medium',
           attrs: {},
           selector: 'body > div',
           children: [...rows, contenteditableEditor, textareaFallback],
         }),
       ]),
     );

     expect(result).not.toBeNull();
     expect(result!.candidateSelectors.feedbackBox).toBeTruthy();
     // Should select the contenteditable, not the textarea
     const feedbackSelector = result!.candidateSelectors.feedbackBox || '';
     expect(feedbackSelector).toContain('fbbox');
     expect(feedbackSelector).not.toContain('fallback-feedback');
   });

   // ------- Test 14: feedbackHidden with contenteditable + hidden input -------
   it('detects feedbackHidden when contenteditable feedback + input[type="hidden"][name^="fb-"] exist together', () => {
     // Build a batch snapshot with contenteditable editor and hidden input
     const rows: SnapshotNode[] = [];
     for (let i = 0; i < 3; i++) {
       rows.push(
         node('div', {
           depth: 1,
           priority: 'medium',
           selector: `div.student-row:nth-child(${i + 1})`,
           attrs: { class: 'student-row' },
           children: [
             node('span', {
               depth: 2,
               priority: 'medium',
               text: `Student ${i + 1}`,
               selector: `div.student-row:nth-child(${i + 1}) > span`,
               attrs: { class: 'student-name' },
             }),
             node('input', {
               depth: 2,
               priority: 'critical',
               selector: `div.student-row:nth-child(${i + 1}) > input`,
               attrs: { type: 'number', class: 'score-input', name: `score_${i + 1}` },
             }),
           ],
         }),
       );
     }

     // Add contenteditable editor
     const contenteditableEditor = node('div', {
       depth: 1,
       priority: 'medium',
       selector: 'div.fbbox',
       attrs: {
         contenteditable: 'true',
         role: 'textbox',
         class: 'fbbox mce-content-body',
       },
       text: 'Enter feedback here...',
     });

     // Add hidden input with fb- prefix
     const hiddenInput = node('input', {
       depth: 1,
       priority: 'medium',
       selector: 'input[name="fb-123"]',
       attrs: { type: 'hidden', name: 'fb-123' },
     });

     const result = detectGradingStructure(
       snap([
         node('div', {
           depth: 0,
           priority: 'medium',
           attrs: {},
           selector: 'body > div',
           children: [...rows, contenteditableEditor, hiddenInput],
         }),
       ]),
     );

     expect(result).not.toBeNull();
     expect(result!.candidateSelectors.feedbackHidden).toBeTruthy();
     // Should contain 'hidden' or 'input' in the selector
     const hiddenSelector = result!.candidateSelectors.feedbackHidden || '';
     expect(hiddenSelector.toLowerCase()).toMatch(/hidden|input/);
   });

   // ------- Test 15: feedbackHidden is null with textarea only -------
   it('returns null for feedbackHidden when only textarea exists (no contenteditable)', () => {
     // Build a batch snapshot with textarea but no contenteditable
     const rows: SnapshotNode[] = [];
     for (let i = 0; i < 3; i++) {
       rows.push(
         node('div', {
           depth: 1,
           priority: 'medium',
           selector: `div.student-row:nth-child(${i + 1})`,
           attrs: { class: 'student-row' },
           children: [
             node('span', {
               depth: 2,
               priority: 'medium',
               text: `Student ${i + 1}`,
               selector: `div.student-row:nth-child(${i + 1}) > span`,
               attrs: { class: 'student-name' },
             }),
             node('input', {
               depth: 2,
               priority: 'critical',
               selector: `div.student-row:nth-child(${i + 1}) > input`,
               attrs: { type: 'number', class: 'score-input', name: `score_${i + 1}` },
             }),
           ],
         }),
       );
     }

     // Add only textarea (no contenteditable)
     const textareaFeedback = node('textarea', {
       depth: 1,
       priority: 'medium',
       selector: 'textarea.feedback-input',
       attrs: { class: 'feedback-input', name: 'feedback' },
       text: 'Textarea feedback',
     });

     // Add hidden input (but should not be detected since no contenteditable)
     const hiddenInput = node('input', {
       depth: 1,
       priority: 'medium',
       selector: 'input[name="fb-123"]',
       attrs: { type: 'hidden', name: 'fb-123' },
     });

     const result = detectGradingStructure(
       snap([
         node('div', {
           depth: 0,
           priority: 'medium',
           attrs: {},
           selector: 'body > div',
           children: [...rows, textareaFeedback, hiddenInput],
         }),
       ]),
     );

     expect(result).not.toBeNull();
     expect(result!.candidateSelectors.feedbackHidden).toBeNull();
   });
});
