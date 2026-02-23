/**
 * Markdown extraction utilities using Turndown.
 * 
 * Provides both webview-injected conversion (for live grading pages)
 * and a pure Node.js conversion (for testing and offline use).
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { TURNDOWN_IIFE } from './turndown-bundle';
import { evalScript, evalScriptJSON } from './browser';

// ---------------------------------------------------------------------------
// Export 1: ensureTurndownLoaded — injects Turndown into the webview
// ---------------------------------------------------------------------------

/**
 * Inject the pre-bundled Turndown + GFM IIFE into the embedded browser webview
 * and configure a reusable `window.__turndownService` instance.
 *
 * Safe to call multiple times — uses an idempotency guard so the service is
 * only created once per page load.
 */
export async function ensureTurndownLoaded(): Promise<void> {
  try {
    // Step 1: Inject the Turndown + GFM IIFE bundle into the webview.
    // After this, `TurndownService` and `turndownPluginGfm` are globals.
    await evalScript(TURNDOWN_IIFE);

    // Step 2: Create and configure the shared service instance (ES5!).
    await evalScript(`(function() {
      if (window.__turndownService) return;
      var service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
      service.use(turndownPluginGfm.gfm);
      service.keep(["math", "annotation"]);
      service.addRule("mathClass", {
        filter: function(node) {
          return node.className && (
            node.className.indexOf("katex") !== -1 ||
            node.className.indexOf("MathJax") !== -1
          );
        },
        replacement: function(content, node) {
          return node.outerHTML;
        }
      });
      window.__turndownService = service;
    })()`);
  } catch (err) {
    console.warn('[markdown-extract] Failed to inject Turndown into webview:', err);
  }
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