// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  classifyNodePriority,
  isSnapshotNode,
  isValidSnapshotResult,
  CRITICAL_ATTR_SIGNALS,
  LOW_PRIORITY_TAGS,
  HIGH_PRIORITY_TAGS,
  type NodePriority,
  type SnapshotNode,
  type SnapshotResult,
} from './dom-snapshot-types';

// ============================================================================
// classifyNodePriority
// ============================================================================

describe('classifyNodePriority', () => {
  it('returns low for script tag', () => {
    expect(classifyNodePriority('script', {}, false, 0)).toBe<NodePriority>('low');
  });

  it('returns low for svg tag', () => {
    expect(classifyNodePriority('svg', {}, true, 3)).toBe<NodePriority>('low');
  });

  it('returns low for style tag', () => {
    expect(classifyNodePriority('style', { class: 'foo' }, false, 0)).toBe<NodePriority>('low');
  });

  it('returns critical for element with data-lastchange attr', () => {
    expect(classifyNodePriority('div', { 'data-lastchange': '1234' }, false, 0)).toBe<NodePriority>('critical');
  });

  it('returns critical for element with data-score attr', () => {
    expect(classifyNodePriority('span', { 'data-score': '10' }, false, 0)).toBe<NodePriority>('critical');
  });

  it('returns critical for input type=number', () => {
    expect(classifyNodePriority('input', { type: 'number' }, false, 0)).toBe<NodePriority>('critical');
  });

  it('returns critical for input type=text', () => {
    expect(classifyNodePriority('input', { type: 'text' }, false, 0)).toBe<NodePriority>('critical');
  });

  it('returns critical for input with no type (defaults to text)', () => {
    expect(classifyNodePriority('input', {}, false, 0)).toBe<NodePriority>('critical');
  });

  it('returns critical for textarea', () => {
    expect(classifyNodePriority('textarea', {}, false, 0)).toBe<NodePriority>('critical');
  });

  it('does NOT return critical for input type=hidden', () => {
    const result = classifyNodePriority('input', { type: 'hidden' }, false, 0);
    expect(result).not.toBe<NodePriority>('critical');
  });

  it('returns high for form', () => {
    expect(classifyNodePriority('form', {}, false, 2)).toBe<NodePriority>('high');
  });

  it('returns high for table', () => {
    expect(classifyNodePriority('table', {}, false, 5)).toBe<NodePriority>('high');
  });

  it('returns high for button', () => {
    expect(classifyNodePriority('button', {}, true, 1)).toBe<NodePriority>('high');
  });

  it('returns medium for div with text', () => {
    expect(classifyNodePriority('div', {}, true, 0)).toBe<NodePriority>('medium');
  });

  it('returns medium for div with children', () => {
    expect(classifyNodePriority('div', {}, false, 3)).toBe<NodePriority>('medium');
  });

  it('returns low for empty span', () => {
    expect(classifyNodePriority('span', {}, false, 0)).toBe<NodePriority>('low');
  });

  it('returns low for empty div with no children', () => {
    expect(classifyNodePriority('div', {}, false, 0)).toBe<NodePriority>('low');
  });

  // Rule ordering: LOW_PRIORITY_TAGS wins over CRITICAL_ATTR_SIGNALS
  it('returns low for script even with a critical attr', () => {
    expect(classifyNodePriority('script', { 'data-lastchange': 'x' }, false, 0)).toBe<NodePriority>('low');
  });
});

// ============================================================================
// CRITICAL_ATTR_SIGNALS / LOW_PRIORITY_TAGS / HIGH_PRIORITY_TAGS
// ============================================================================

describe('exported sets', () => {
  it('CRITICAL_ATTR_SIGNALS includes data-lastchange', () => {
    expect(CRITICAL_ATTR_SIGNALS.has('data-lastchange')).toBe(true);
  });

  it('LOW_PRIORITY_TAGS includes script and svg', () => {
    expect(LOW_PRIORITY_TAGS.has('script')).toBe(true);
    expect(LOW_PRIORITY_TAGS.has('svg')).toBe(true);
  });

  it('HIGH_PRIORITY_TAGS includes form and input', () => {
    expect(HIGH_PRIORITY_TAGS.has('form')).toBe(true);
    expect(HIGH_PRIORITY_TAGS.has('input')).toBe(true);
  });
});

// ============================================================================
// isSnapshotNode
// ============================================================================

describe('isSnapshotNode', () => {
  const validNode: SnapshotNode = {
    tag: 'div',
    depth: 0,
    priority: 'medium',
    attrs: {},
  };

  it('accepts a valid SnapshotNode', () => {
    expect(isSnapshotNode(validNode)).toBe(true);
  });

  it('accepts node with optional fields', () => {
    const full: SnapshotNode = {
      tag: 'input',
      depth: 2,
      priority: 'critical',
      attrs: { type: 'number' },
      text: '10',
      selector: 'body > form > input',
      children: [],
      bbox: { x: 0, y: 0, width: 100, height: 30, visible: true },
    };
    expect(isSnapshotNode(full)).toBe(true);
  });

  it('rejects null', () => {
    expect(isSnapshotNode(null)).toBe(false);
  });

  it('rejects a string', () => {
    expect(isSnapshotNode('node')).toBe(false);
  });

  it('rejects object missing tag', () => {
    expect(isSnapshotNode({ depth: 0, priority: 'low', attrs: {} })).toBe(false);
  });

  it('rejects object with invalid priority', () => {
    expect(isSnapshotNode({ tag: 'div', depth: 0, priority: 'ultra', attrs: {} })).toBe(false);
  });

  it('rejects object with null attrs', () => {
    expect(isSnapshotNode({ tag: 'div', depth: 0, priority: 'low', attrs: null })).toBe(false);
  });
});

// ============================================================================
// isValidSnapshotResult
// ============================================================================

describe('isValidSnapshotResult', () => {
  const validResult: SnapshotResult = {
    nodes: [{ tag: 'div', depth: 0, priority: 'low', attrs: {} }],
    meta: {
      totalVisited: 1,
      nodesIncluded: 1,
      nodesDropped: 0,
      wasTruncated: false,
      charCount: 50,
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
    },
  };

  it('accepts a valid SnapshotResult', () => {
    expect(isValidSnapshotResult(validResult)).toBe(true);
  });

  it('accepts result with empty nodes array', () => {
    expect(isValidSnapshotResult({ nodes: [], meta: validResult.meta })).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidSnapshotResult(null)).toBe(false);
  });

  it('rejects missing nodes array', () => {
    expect(isValidSnapshotResult({ meta: validResult.meta })).toBe(false);
  });

  it('rejects missing meta', () => {
    expect(isValidSnapshotResult({ nodes: [] })).toBe(false);
  });

  it('rejects nodes array containing invalid node', () => {
    expect(isValidSnapshotResult({ nodes: [{ tag: 'div' }], meta: validResult.meta })).toBe(false);
  });
});
