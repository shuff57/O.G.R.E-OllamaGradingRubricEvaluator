// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { SnapshotResult, SnapshotNode } from './dom-snapshot-types';
import {
  detectIframes,
  buildIframeCaptureScript,
  captureIframeSnapshot,
  type IframeInfo,
  type IframeNode,
  type CdpClient,
} from './iframe-capture';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal valid SnapshotResult for testing. */
function makeSnapshot(nodes: SnapshotNode[]): SnapshotResult {
  return {
    nodes,
    meta: {
      totalVisited: nodes.length,
      nodesIncluded: nodes.length,
      nodesDropped: 0,
      wasTruncated: false,
      charCount: JSON.stringify(nodes).length,
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
}

function makeNode(
  tag: string,
  overrides?: Partial<SnapshotNode>,
): SnapshotNode {
  return {
    tag,
    depth: 0,
    priority: 'medium',
    attrs: {},
    ...overrides,
  };
}

// ============================================================================
// detectIframes
// ============================================================================

describe('detectIframes', () => {
  it('returns [] for an empty snapshot', () => {
    const snap = makeSnapshot([]);
    expect(detectIframes(snap)).toEqual([]);
  });

  it('returns descriptors for iframe nodes', () => {
    const iframe1 = makeNode('iframe', {
      attrs: { src: 'https://a.com', id: 'f1' },
      selector: 'body > iframe#f1',
    });
    const iframe2 = makeNode('iframe', {
      attrs: { src: 'https://b.com' },
      selector: 'body > iframe:nth-child(2)',
    });
    const snap = makeSnapshot([iframe1, iframe2]);

    const result = detectIframes(snap);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      selector: 'body > iframe#f1',
      src: 'https://a.com',
      tag: 'iframe',
    });
    expect(result[1]).toEqual({
      selector: 'body > iframe:nth-child(2)',
      src: 'https://b.com',
      tag: 'iframe',
    });
  });

  it('ignores non-iframe nodes', () => {
    const div = makeNode('div', {
      children: [
        makeNode('iframe', {
          attrs: { src: 'https://c.com' },
          selector: 'div > iframe',
        }),
        makeNode('span'),
      ],
    });
    const snap = makeSnapshot([div, makeNode('p')]);

    const result = detectIframes(snap);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('iframe');
    expect(result[0].src).toBe('https://c.com');
  });
});

// ============================================================================
// buildIframeCaptureScript
// ============================================================================

describe('buildIframeCaptureScript', () => {
  it('returns a string', () => {
    const script = buildIframeCaptureScript();
    expect(typeof script).toBe('string');
  });

  it('has no import or require statements', () => {
    const script = buildIframeCaptureScript();
    expect(/\bimport\b|\brequire\b/.test(script)).toBe(false);
  });

  it('is an IIFE wrapping', () => {
    const script = buildIframeCaptureScript();
    expect(script.trimStart().startsWith('(function')).toBe(true);
  });

  it('embeds custom maxDepth and maxNodes', () => {
    const script = buildIframeCaptureScript({ maxDepth: 3, maxNodes: 100 });
    expect(script).toContain('maxDepth: 3');
    expect(script).toContain('maxNodes: 100');
  });
});

// ============================================================================
// captureIframeSnapshot
// ============================================================================

describe('captureIframeSnapshot', () => {
  it('returns metadata-only IframeNode for cross-origin iframes', async () => {
    const info: IframeInfo = {
      frameId: 'frame-1',
      src: 'https://evil.com/page',
      isSameOrigin: false,
      selector: 'iframe#ext',
    };

    const mockCdp: CdpClient = {
      send: vi.fn().mockResolvedValue({}),
    };

    const nodes = await captureIframeSnapshot(info, mockCdp);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].tag).toBe('iframe');
    expect(nodes[0].crossOrigin).toBe(true);
    expect(nodes[0].iframeSource).toBe('https://evil.com/page');
    expect(nodes[0].depth).toBe(0);
    expect(nodes[0].priority).toBe('medium');
    expect(nodes[0].attrs).toEqual({ src: 'https://evil.com/page' });

    // CDP should NOT have been called for cross-origin
    expect(mockCdp.send).not.toHaveBeenCalled();
  });

  it('calls cdpClient.send with Runtime.evaluate and contextId for same-origin', async () => {
    const info: IframeInfo = {
      frameId: 'frame-2',
      contextId: 42,
      src: 'https://same.com/embed',
      isSameOrigin: true,
      selector: 'iframe#inner',
    };

    const mockCdp: CdpClient = {
      send: vi.fn().mockResolvedValue({
        result: {
          value: JSON.stringify({
            nodes: [],
            meta: {
              totalVisited: 0,
              nodesIncluded: 0,
              nodesDropped: 0,
              wasTruncated: false,
              charCount: 2,
              capturedAt: new Date().toISOString(),
              options: {},
            },
          }),
        },
      }),
    };

    await captureIframeSnapshot(info, mockCdp);

    expect(mockCdp.send).toHaveBeenCalledOnce();
    expect(mockCdp.send).toHaveBeenCalledWith(
      'Runtime.evaluate',
      expect.objectContaining({
        contextId: 42,
        returnByValue: true,
        awaitPromise: true,
      }),
    );
  });

  it('stamps returned nodes with iframeSource and crossOrigin=false', async () => {
    const info: IframeInfo = {
      frameId: 'frame-3',
      contextId: 99,
      src: 'https://same.com/form',
      isSameOrigin: true,
      selector: 'iframe#form',
    };

    const fakeNodes: SnapshotNode[] = [
      { tag: 'div', depth: 0, priority: 'medium', attrs: { id: 'root' } },
      { tag: 'input', depth: 1, priority: 'critical', attrs: { type: 'text' } },
    ];

    const mockCdp: CdpClient = {
      send: vi.fn().mockResolvedValue({
        result: {
          value: JSON.stringify({
            nodes: fakeNodes,
            meta: {
              totalVisited: 2,
              nodesIncluded: 2,
              nodesDropped: 0,
              wasTruncated: false,
              charCount: 100,
              capturedAt: new Date().toISOString(),
              options: {},
            },
          }),
        },
      }),
    };

    const result = await captureIframeSnapshot(info, mockCdp);

    expect(result).toHaveLength(2);
    for (const node of result) {
      expect(node.iframeSource).toBe('https://same.com/form');
      expect(node.crossOrigin).toBe(false);
    }
    expect(result[0].tag).toBe('div');
    expect(result[1].tag).toBe('input');
  });
});

// ============================================================================
// IframeNode shape
// ============================================================================

describe('IframeNode shape', () => {
  it('has iframeSource and crossOrigin fields', async () => {
    const info: IframeInfo = {
      frameId: 'frame-x',
      src: 'https://x.com',
      isSameOrigin: false,
      selector: 'iframe',
    };

    const mockCdp: CdpClient = { send: vi.fn() };

    const [node] = await captureIframeSnapshot(info, mockCdp);

    // Structural checks — these fields MUST exist
    expect(node).toHaveProperty('iframeSource');
    expect(node).toHaveProperty('crossOrigin');

    // Also a valid SnapshotNode
    expect(node).toHaveProperty('tag');
    expect(node).toHaveProperty('depth');
    expect(node).toHaveProperty('priority');
    expect(node).toHaveProperty('attrs');
  });
});
