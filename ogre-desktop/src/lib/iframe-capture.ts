/**
 * iframe-capture.ts — Detect and capture DOM snapshots from iframes via CDP.
 *
 * Uses CDP `Runtime.evaluate` with `contextId` to execute a DOM walker inside
 * same-origin iframes.  Cross-origin iframes get a metadata-only placeholder.
 *
 * Spike verdict: CDP contextId targeting WORKS in Tauri WebView2 for
 * same-origin iframes (see iframe-capture-spike.md).
 */

import type {
  SnapshotNode,
  SnapshotResult,
  NodePriority,
} from './dom-snapshot-types';

// ============================================================================
// Public Interfaces
// ============================================================================

/** Information about a single iframe discovered via CDP. */
export interface IframeInfo {
  /** CDP frame ID */
  frameId: string;
  /** CDP execution context ID (undefined for cross-origin) */
  contextId?: number;
  /** iframe src attribute */
  src: string;
  /** Whether DOM access is allowed */
  isSameOrigin: boolean;
  /** CSS selector to find this iframe in the parent page */
  selector: string;
}

/** A SnapshotNode enriched with iframe provenance metadata. */
export interface IframeNode extends SnapshotNode {
  /** The iframe's src URL */
  iframeSource: string;
  /** true if cross-origin (DOM not captured) */
  crossOrigin: boolean;
}

// ============================================================================
// detectIframes
// ============================================================================

/** Descriptor returned by detectIframes for each iframe found. */
interface IframeDescriptor {
  selector: string;
  src: string;
  tag: 'iframe';
}

/**
 * Pure function — walks the SnapshotResult node tree and returns a descriptor
 * for every `<iframe>` element found.
 */
export function detectIframes(
  snapshot: SnapshotResult,
): IframeDescriptor[] {
  const results: IframeDescriptor[] = [];

  function walk(node: SnapshotNode): void {
    if (node.tag === 'iframe') {
      results.push({
        selector: node.selector ?? (node.attrs['id']
          ? `iframe#${node.attrs['id']}`
          : 'iframe'),
        src: node.attrs['src'] ?? '',
        tag: 'iframe',
      });
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const root of snapshot.nodes) {
    walk(root);
  }

  return results;
}

// ============================================================================
// buildIframeCaptureScript
// ============================================================================

/**
 * Returns a self-contained browser JavaScript string (IIFE) that enumerates
 * iframes in the current document and reports basic info about each.
 *
 * The returned script contains NO `import` / `require` statements so it can
 * be safely evaluated via `Runtime.evaluate`.
 */
export function buildIframeCaptureScript(
  options?: { maxDepth?: number; maxNodes?: number },
): string {
  const maxDepth = options?.maxDepth ?? 8;
  const maxNodes = options?.maxNodes ?? 500;

  // The template literal below is the IIFE string.  We embed maxDepth /
  // maxNodes as literal numbers so no closures are needed at runtime.
  return `(function () {
  var results = [];
  var iframes = document.querySelectorAll('iframe');
  for (var i = 0; i < iframes.length; i++) {
    var el = iframes[i];
    var isSameOrigin = false;
    try {
      var doc = el.contentDocument;
      if (doc) { isSameOrigin = true; }
    } catch (_) { /* cross-origin */ }
    results.push({
      src: el.getAttribute('src') || '',
      id: el.getAttribute('id') || '',
      name: el.getAttribute('name') || '',
      isSameOrigin: isSameOrigin,
      maxDepth: ${maxDepth},
      maxNodes: ${maxNodes}
    });
  }
  return results;
})()`;
}

// ============================================================================
// captureIframeSnapshot
// ============================================================================

/** Minimal CDP client interface expected by captureIframeSnapshot. */
export interface CdpClient {
  send(method: string, params?: unknown): Promise<unknown>;
}

/**
 * Capture a DOM snapshot from an iframe via CDP.
 *
 * - **Same-origin** (`isSameOrigin === true`): executes a lightweight DOM
 *   walker in the iframe's execution context using `Runtime.evaluate` with
 *   the iframe's `contextId`.  Returns the resulting nodes as IframeNode[].
 *
 * - **Cross-origin** (`isSameOrigin === false`): returns a single
 *   metadata-only IframeNode placeholder (no DOM access attempted).
 */
export async function captureIframeSnapshot(
  iframeInfo: IframeInfo,
  cdpClient: CdpClient,
  options?: { maxDepth?: number },
): Promise<IframeNode[]> {
  // Cross-origin: return metadata placeholder
  if (!iframeInfo.isSameOrigin) {
    const placeholder: IframeNode = {
      tag: 'iframe',
      depth: 0,
      priority: 'medium' as NodePriority,
      attrs: { src: iframeInfo.src },
      iframeSource: iframeInfo.src,
      crossOrigin: true,
    };
    return [placeholder];
  }

  // Same-origin: run DOM walker in iframe context
  const maxDepth = options?.maxDepth ?? 8;

  const walkerScript = buildDomWalkerScript(maxDepth);

  const raw = await cdpClient.send('Runtime.evaluate', {
    expression: walkerScript,
    contextId: iframeInfo.contextId,
    returnByValue: true,
    awaitPromise: true,
  });

  const result = raw as {
    result: { value?: string };
    exceptionDetails?: { text: string };
  };

  if (result.exceptionDetails) {
    throw new Error(
      `Iframe capture error (${iframeInfo.src}): ${result.exceptionDetails.text}`,
    );
  }

  const parsed = JSON.parse(result.result.value ?? '{"nodes":[],"meta":{}}') as {
    nodes: SnapshotNode[];
    meta: unknown;
  };

  // Stamp each node with iframe metadata
  return parsed.nodes.map((node): IframeNode => ({
    ...node,
    iframeSource: iframeInfo.src,
    crossOrigin: false,
  }));
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Build a self-contained DOM walker script for execution inside an iframe
 * context.  Returns JSON string of `{ nodes, meta }`.
 */
function buildDomWalkerScript(maxDepth: number): string {
  return `(function () {
  var nodes = [];
  var visited = 0;

  function walk(el, depth) {
    if (depth > ${maxDepth} || !el) return;
    visited++;
    var tag = (el.tagName || '').toLowerCase();
    if (!tag) return;

    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      attrs[a.name] = (a.value || '').slice(0, 200);
    }

    var text = '';
    for (var j = 0; j < el.childNodes.length; j++) {
      if (el.childNodes[j].nodeType === 3) {
        text += el.childNodes[j].textContent || '';
      }
    }
    text = text.trim().slice(0, 150);

    var node = { tag: tag, depth: depth, priority: 'medium', attrs: attrs };
    if (text) node.text = text;
    nodes.push(node);

    var children = el.children;
    for (var k = 0; k < children.length; k++) {
      walk(children[k], depth + 1);
    }
  }

  walk(document.body, 0);

  var meta = {
    totalVisited: visited,
    nodesIncluded: nodes.length,
    nodesDropped: 0,
    wasTruncated: false,
    charCount: JSON.stringify(nodes).length,
    capturedAt: new Date().toISOString(),
    options: {}
  };

  return JSON.stringify({ nodes: nodes, meta: meta });
})()`;
}
