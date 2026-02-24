/**
 * Markdown extraction utilities using Turndown.
 * 
 * Provides both webview-injected conversion (for live grading pages)
 * and a pure Node.js conversion (for testing and offline use).
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { TURNDOWN_IIFE } from './turndown-bundle';
import { evalScriptJSON, injectScript } from './browser';

// ---------------------------------------------------------------------------
// Export 1: ensureTurndownLoaded — injects Turndown into the webview
// ---------------------------------------------------------------------------

// Module-level promise so the injection only happens once per session.
// If it fails, _injectionFailed is set and future calls return immediately.
let _loadedPromise: Promise<void> | null = null;
let _injectionFailed = false;

/**
 * Inject the pre-bundled Turndown + GFM IIFE into the embedded browser webview
 * and configure a reusable `window.__turndownService` instance.
 *
 * Safe to call multiple times — memoized after first call so the 31KB bundle
 * is only injected once per session. Uses injectScript (direct wv.eval) instead
 * of evalScript because the IIFE contains top-level var declarations which cannot
 * be wrapped in `return (...)` without a SyntaxError.
 */
export function ensureTurndownLoaded(): Promise<void> {
  if (_injectionFailed) {
    console.log('[batch] ensureTurndownLoaded: skipping (previously failed)');
    return Promise.resolve();
  }
  if (_loadedPromise !== null) {
    console.log('[batch] ensureTurndownLoaded: reusing cached promise');
    return _loadedPromise;
  }

  console.log('[batch] ensureTurndownLoaded: injecting Turndown IIFE...');
  // Combine IIFE + service setup into one atomic script so both run in the same
  // execution context. wv.eval() may return before the script completes, so a
  // split approach could race on TurndownService being defined.
  const serviceSetup =
    `;(function() {` +
    `\n  if (window.__turndownService) return;` +
    `\n  var service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });` +
    `\n  service.use(turndownPluginGfm.gfm);` +
    `\n  service.keep(['math', 'annotation']);` +
    `\n  service.addRule('mathClass', {` +
    `\n    filter: function(node) {` +
    `\n      return node.className && (` +
    `\n        node.className.indexOf('katex') !== -1 ||` +
    `\n        node.className.indexOf('MathJax') !== -1` +
    `\n      );` +
    `\n    },` +
    `\n    replacement: function(content, node) { return node.outerHTML; }` +
    `\n  });` +
    `\n  window.__turndownService = service;` +
    `\n})();`;
  _loadedPromise = injectScript(TURNDOWN_IIFE + serviceSetup).then(() => {
    console.log('[batch] ensureTurndownLoaded: injection complete');
  }).catch((err) => {
    _injectionFailed = true;
    _loadedPromise = null;
    console.warn('[batch] ensureTurndownLoaded: FAILED:', err);
  });
  return _loadedPromise;
}

// ---------------------------------------------------------------------------
// Export 2: htmlToMarkdown — convert a DOM element in the webview to markdown
// ---------------------------------------------------------------------------

/**
 * Select a DOM element in the embedded webview by CSS selector and convert
 * its innerHTML to Markdown using the injected Turndown service.
 *
 * Falls back to `el.textContent.trim()` if Turndown conversion fails.
 * Returns an empty string when the element is not found.
 *
 * @param selector - CSS selector for the target element
 * @returns Markdown string
 */
export async function htmlToMarkdown(selector: string): Promise<string> {
  await ensureTurndownLoaded();

  return evalScriptJSON<string>(`(function() {
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return JSON.stringify("");
    try {
      var md = window.__turndownService.turndown(el.innerHTML);
      return JSON.stringify(md);
    } catch (e) {
      return JSON.stringify(el.textContent ? el.textContent.trim() : "");
    }
  })()`);
}

// ---------------------------------------------------------------------------
// Export 3: htmlToMarkdownDirect — pure Node.js conversion (no webview)
// ---------------------------------------------------------------------------

/**
 * Convert an HTML string to Markdown in the Node.js (main process) context.
 *
 * This function does NOT use the webview — it creates its own TurndownService
 * instance. Useful for unit tests and offline processing.
 *
 * Math elements (`<math>`, `<annotation>`) and class-based math wrappers
 * (`.katex`, `.MathJax`) are preserved as raw HTML in the output.
 *
 * @param html - Raw HTML string to convert
 * @returns Markdown string, or empty string for falsy input
 */
export function htmlToMarkdownDirect(html: string): string {
  if (!html) return '';

  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  // GFM tables, strikethrough, task lists
  service.use(gfm);

  // Preserve MathML elements
  service.keep(['math', 'annotation']);

  // Preserve class-based math wrappers (KaTeX / MathJax)
  service.addRule('mathClass', {
    filter(node: HTMLElement) {
      return !!(
        node.className &&
        (node.className.indexOf('katex') !== -1 ||
          node.className.indexOf('MathJax') !== -1)
      );
    },
    replacement(_content: string, node: Node) {
      return (node as HTMLElement).outerHTML;
    },
  });

  return service.turndown(html);
}