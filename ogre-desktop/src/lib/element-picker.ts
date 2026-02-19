/**
 * element-picker.ts — Element picker for webview
 *
 * Provides types and injection script for element picking functionality.
 * The injected JavaScript creates an interactive overlay that allows users
 * to click on page elements and capture their selectors and metadata.
 *
 * Communication pattern:
 * - startElementPicker() injects ELEMENT_PICKER_INJECT_JS via evalScript
 * - Polls window._ogreElementPickerResult / window._ogreElementPickerCancelled
 * - stopElementPicker() calls window._ogreElementPickerCleanup() via evalScript
 */

import { evalScript, evalScriptJSON } from './browser';

/**
 * Result of element picking operation
 * Contains selector, element metadata, and position information
 */
export interface ElementPickerResult {
  /** CSS selector that uniquely identifies the element */
  selector: string;
  /** HTML tag name (lowercase) */
  tagName: string;
  /** Element ID if present */
  id?: string;
  /** CSS classes applied to element */
  classes?: string[];
  /** DOMRect with position and size information */
  rect: DOMRect;
}

/**
 * JavaScript code injected into webview to enable element picking
 * Creates an overlay with hover highlighting and click-to-select functionality
 */
export const ELEMENT_PICKER_INJECT_JS = `
(function() {
  // Prevent double-injection
  if (window._ogreElementPicker) return;
  window._ogreElementPicker = true;

  // --- Overlay (captures all mouse events) ---
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'z-index:2147483646', 'cursor:crosshair',
    'background:rgba(0,0,0,0.08)',
  ].join(';');

  // --- Highlight box (follows hovered element) ---
  const highlight = document.createElement('div');
  highlight.style.cssText = [
    'position:fixed', 'border:3px solid #58a6ff',
    'background:rgba(88,166,255,0.12)', 'pointer-events:none',
    'z-index:2147483647', 'border-radius:3px',
    'transition:all 0.08s ease-out',
  ].join(';');

  // --- Tooltip (shows CSS selector of hovered element) ---
  const tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position:fixed', 'background:#1a1a2e', 'color:#c9d1d9',
    'font:12px/1.4 "JetBrains Mono",monospace',
    'padding:5px 10px', 'border-radius:4px',
    'z-index:2147483647', 'pointer-events:none',
    'max-width:500px', 'overflow:hidden',
    'text-overflow:ellipsis', 'white-space:nowrap',
    'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
  ].join(';');

  // --- Instruction banner ---
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed', 'top:10px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1a1a2e', 'color:#58a6ff',
    'font:13px/1.4 "JetBrains Mono",sans-serif',
    'padding:8px 20px', 'border-radius:6px',
    'z-index:2147483647', 'pointer-events:none',
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'border:1px solid #30363d',
  ].join(';');
  banner.textContent = 'Click an element to select it. Press Escape to cancel.';

  document.body.appendChild(overlay);
  document.body.appendChild(highlight);
  document.body.appendChild(tooltip);
  document.body.appendChild(banner);

  let lastTarget = null;

  // --- Hover: highlight element under cursor ---
  overlay.addEventListener('mousemove', (e) => {
    // Temporarily disable overlay to find element beneath it
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = '';

    if (!el || el === overlay || el === highlight || el === tooltip || el === banner) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      lastTarget = null;
      return;
    }

    lastTarget = el;

    // Position highlight over the element
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';

    // Show selector in tooltip
    const selector = generateSelector(el);
    tooltip.textContent = selector;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 520) + 'px';
    tooltip.style.top = Math.max(e.clientY - 34, 4) + 'px';
  });

  // --- Click: capture element and send selector ---
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lastTarget) return;

    const selector = generateSelector(lastTarget);
    const rect = lastTarget.getBoundingClientRect();
    const id = lastTarget.id || undefined;
    const classes = lastTarget.className ? lastTarget.className.split(/\\s+/).filter(c => c) : undefined;

    cleanup();

    // Return result as JSON
    window._ogreElementPickerResult = {
      selector,
      tagName: lastTarget.tagName.toLowerCase(),
      id,
      classes,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right,
      },
    };
  });

  // --- Escape: cancel picker ---
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      window._ogreElementPickerCancelled = true;
    }
  };
  document.addEventListener('keydown', onEsc);

  // --- Cleanup ---
  function cleanup() {
    [overlay, highlight, tooltip, banner].forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    document.removeEventListener('keydown', onEsc);
    window._ogreElementPicker = false;
  }

  // Expose cleanup for external stop via stopElementPicker()
  window._ogreElementPickerCleanup = cleanup;

  // --- Selector Generation ---

  /**
   * Generate a CSS selector for an element. Prefers semantic attributes
   * over fragile class names, and builds the simplest possible selector.
   */
  function generateSelector(el) {
    // Strategy 1: Unique ID
    if (el.id && !el.id.match(/^\\d/) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '#' + CSS.escape(el.id);
    }

    var tag = el.tagName.toLowerCase();

    // Strategy 2: Semantic attributes (most robust)
    var semanticAttrs = ['aria-label', 'role', 'name', 'type', 'contenteditable', 'placeholder'];
    for (var i = 0; i < semanticAttrs.length; i++) {
      var attr = semanticAttrs[i];
      if (el.hasAttribute(attr)) {
        var val = el.getAttribute(attr);
        if (val && val.length < 60) {
          var sel = tag + '[' + attr + '="' + CSS.escape(val) + '"]';
          try { if (document.querySelectorAll(sel).length <= 100) return sel; } catch (e) {}
        }
      }
    }

    // Strategy 3: Data attributes
    for (var j = 0; j < el.attributes.length; j++) {
      var da = el.attributes[j];
      if (da.name.indexOf('data-') === 0) {
        var dv = da.value;
        if (dv && dv.length < 60) {
          var ds = tag + '[' + da.name + '="' + CSS.escape(dv) + '"]';
          try { if (document.querySelectorAll(ds).length <= 100) return ds; } catch (e) {}
        }
        var ds2 = tag + '[' + da.name + ']';
        try { if (document.querySelectorAll(ds2).length <= 100) return ds2; } catch (e) {}
      }
    }

    // Strategy 4: Meaningful class combinations
    if (el.classList && el.classList.length > 0) {
      var classes = [];
      for (var k = 0; k < el.classList.length; k++) {
        var c = el.classList[k];
        if (!c.match(/^[a-z]{1,2}\\d+/) && c.length > 1) classes.push(c);
      }
      if (classes.length > 0) {
        var cs = tag + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
        try { if (document.querySelectorAll(cs).length <= 100) return cs; } catch (e) {}
      }
    }

    // Strategy 5: Tag with parent context (one level up)
    var parent = el.parentElement;
    if (parent && parent !== document.body) {
      var parentSel = generateParentSelector(parent);
      if (parentSel) {
        var childSel = parentSel + ' > ' + tag;
        try { if (document.querySelectorAll(childSel).length <= 100) return childSel; } catch (e) {}
      }
    }

    // Fallback: just the tag
    return tag;
  }

  /**
   * Generate a simple selector for a parent element (one level, no recursion).
   */
  function generateParentSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    var tag = el.tagName.toLowerCase();
    var attrs = ['role', 'aria-label', 'name'];
    for (var i = 0; i < attrs.length; i++) {
      if (el.hasAttribute(attrs[i])) {
        var val = el.getAttribute(attrs[i]);
        if (val && val.length < 60) return tag + '[' + attrs[i] + '="' + CSS.escape(val) + '"]';
        return tag + '[' + attrs[i] + ']';
      }
    }
    if (el.classList && el.classList.length > 0) {
      var classes = [];
      for (var j = 0; j < el.classList.length; j++) {
        if (el.classList[j].length > 1) classes.push(el.classList[j]);
      }
      if (classes.length > 0) return tag + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
    }
    return tag;
  }
})();
`;

/** Polling interval in ms for checking picker result */
const POLL_INTERVAL_MS = 100;

/** Maximum time to wait for picker result before timeout */
const PICKER_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Start element picker in webview.
 * Injects the picker script and polls for user selection or cancellation.
 *
 * @returns Promise resolving to ElementPickerResult when element is picked
 * @throws Error if picker is cancelled (Escape key) or times out
 */
export async function startElementPicker(): Promise<ElementPickerResult> {
  // Inject the picker overlay into the webview
  await evalScript(ELEMENT_PICKER_INJECT_JS);

  // Poll for result or cancellation
  return new Promise<ElementPickerResult>((resolve, reject) => {
    const startTime = Date.now();

    const poll = async () => {
      try {
        const state = await evalScriptJSON<{
          result: Record<string, unknown> | null;
          cancelled: boolean;
        }>(`(function() {
          return {
            result: window._ogreElementPickerResult || null,
            cancelled: !!window._ogreElementPickerCancelled
          };
        })()`);

        if (state.cancelled) {
          await evalScript(`(function() {
            window._ogreElementPickerCancelled = false;
          })()`);
          reject(new Error('Element picker cancelled'));
          return;
        }

        if (state.result) {
          await evalScript(`(function() {
            window._ogreElementPickerResult = null;
          })()`);
          resolve(parsePickerResult(state.result));
          return;
        }

        if (Date.now() - startTime > PICKER_TIMEOUT_MS) {
          await stopElementPicker();
          reject(new Error('Element picker timed out'));
          return;
        }

        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        reject(err);
      }
    };

    poll();
  });
}

/**
 * Stop element picker and remove overlay from webview.
 * Calls the exposed cleanup function and resets all picker state.
 */
export async function stopElementPicker(): Promise<void> {
  await evalScript(`(function() {
    if (typeof window._ogreElementPickerCleanup === 'function') {
      window._ogreElementPickerCleanup();
    }
    window._ogreElementPickerResult = null;
    window._ogreElementPickerCancelled = null;
    window._ogreElementPickerCleanup = null;
    window._ogreElementPicker = false;
  })()`);
}

/**
 * Parse element picker result from webview evaluation.
 * Converts raw result object to typed ElementPickerResult.
 *
 * @param result - Raw result from webview evaluation
 * @returns Parsed ElementPickerResult
 * @throws Error if result is invalid (missing required fields)
 */
export function parsePickerResult(result: unknown): ElementPickerResult {
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid picker result: expected object');
  }

  const r = result as Record<string, unknown>;

  if (typeof r.selector !== 'string' || !r.selector) {
    throw new Error('Invalid picker result: missing selector');
  }

  if (typeof r.tagName !== 'string' || !r.tagName) {
    throw new Error('Invalid picker result: missing tagName');
  }

  if (!r.rect || typeof r.rect !== 'object') {
    throw new Error('Invalid picker result: missing rect');
  }

  return {
    selector: r.selector,
    tagName: r.tagName,
    id: typeof r.id === 'string' ? r.id : undefined,
    classes: Array.isArray(r.classes) ? r.classes : undefined,
    rect: r.rect as DOMRect,
  };
}
