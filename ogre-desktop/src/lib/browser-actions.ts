/**
 * browser-actions.ts - Browser action executor for the agent.
 *
 * Implements all 9 agent actions (click, type, scroll, readText, screenshot,
 * waitFor, navigate, runJS, done) as individual functions, plus a single
 * `executeAction` dispatcher. Every action catches all exceptions internally
 * and returns an ActionResult — never throws.
 */

import type { ActionParams, ActionResult } from './agent-types';
import { DANGEROUS_JS_PATTERNS } from './agent-types';
import {
  evalScript,
  evalScriptJSON,
  captureWebviewScreenshot,
  navigateEmbedded,
} from './browser';
import { findFuzzyMatch, fuzzyMatchReason } from './agent-dom-fuzzy';
import { captureInteractiveDom } from './agent-dom';
import { isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll } from './playwright-executor';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape a string for safe embedding inside a JS single-quoted string literal.
 */
function escapeSelector(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// ============================================================================
// Action Implementations
// ============================================================================

/**
 * Click an element matching the CSS selector.
 */
async function clickAction(selector: string): Promise<ActionResult> {
  try {
    const escaped = escapeSelector(selector);
    const result = await evalScriptJSON<ActionResult>(`
(function() {
  try {
    var el = document.querySelector('${escaped}');
    if (!el) return { success: false, error: 'Element not found: ' + '${escaped}' };
    el.click();
    return { success: true, data: { tagName: el.tagName, text: (el.textContent || '').trim().substring(0, 100) } };
  } catch(e) {
    return { success: false, error: e.message };
  }
})()
    `);
    return result;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Type text into an input element matching the CSS selector.
 * Uses native property setter for React/Angular compatibility.
 */
async function typeAction(
  selector: string,
  text: string,
  clear?: boolean,
): Promise<ActionResult> {
  try {
    const escaped = escapeSelector(selector);
    const safeText = escapeSelector(text);
    const clearFlag = clear ? 'true' : 'false';
    const result = await evalScriptJSON<ActionResult>(`
(function() {
  try {
    var el = document.querySelector('${escaped}');
    if (!el) return { success: false, error: 'Element not found: ' + '${escaped}' };
    if (${clearFlag}) {
      var clearSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (clearSetter && clearSetter.set) {
        clearSetter.set.call(el, '');
      } else {
        el.value = '';
      }
    }
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, '${safeText}');
    } else {
      el.value = '${safeText}';
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
})()
    `);
    return result;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Scroll the page in a given direction by the specified amount.
 */
async function scrollAction(
  direction: 'up' | 'down' | 'left' | 'right',
  amount: number,
): Promise<ActionResult> {
  try {
    var xVal = 0;
    var yVal = 0;
    switch (direction) {
      case 'up': yVal = -amount; break;
      case 'down': yVal = amount; break;
      case 'left': xVal = -amount; break;
      case 'right': xVal = amount; break;
    }
    const result = await evalScriptJSON<ActionResult>(`
(function() {
  try {
    window.scrollBy(${xVal}, ${yVal});
    return { success: true, data: { scrollX: window.scrollX, scrollY: window.scrollY } };
  } catch(e) {
    return { success: false, error: e.message };
  }
})()
    `);
    return result;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read text content from a specific element or the full page body.
 */
async function readTextAction(selector?: string): Promise<ActionResult> {
  try {
    if (selector) {
      const escaped = escapeSelector(selector);
      const result = await evalScriptJSON<ActionResult>(`
(function() {
  try {
    var el = document.querySelector('${escaped}');
    if (!el) return { success: false, error: 'Element not found: ' + '${escaped}' };
    return { success: true, data: (el.textContent || '') };
  } catch(e) {
    return { success: false, error: e.message };
  }
})()
      `);
      return result;
    } else {
      const result = await evalScriptJSON<ActionResult>(`
(function() {
  try {
    var text = (document.body.innerText || '').substring(0, 5000);
    return { success: true, data: text };
  } catch(e) {
    return { success: false, error: e.message };
  }
})()
      `);
      return result;
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Capture a screenshot of the embedded webview.
 */
async function screenshotAction(): Promise<ActionResult> {
  try {
    const dataUrl = await captureWebviewScreenshot();
    return { success: true, data: dataUrl };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Wait for an element matching the selector to appear in the DOM.
 * Polls every 200ms. Timeout is capped at 10000ms.
 */
async function waitForAction(
  selector: string,
  timeoutMs?: number,
): Promise<ActionResult> {
  try {
    const escaped = escapeSelector(selector);
    const limit = Math.min(timeoutMs ?? 5000, 10000);
    const result = await evalScriptJSON<ActionResult>(`
(function() {
  return new Promise(function(resolve) {
    var start = Date.now();
    var limit = ${limit};
    function check() {
      var el = document.querySelector('${escaped}');
      if (el) { resolve({ success: true }); return; }
      if (Date.now() - start >= limit) { resolve({ success: false, error: 'Timeout waiting for: ${escaped}' }); return; }
      setTimeout(check, 200);
    }
    check();
  });
})()
    `);
    return result;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Navigate the embedded browser to a URL.
 */
async function navigateAction(url: string): Promise<ActionResult> {
  try {
    await navigateEmbedded(url);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Execute arbitrary JavaScript in the webview, after checking for dangerous patterns.
 */
async function runJSAction(code: string): Promise<ActionResult> {
  try {
    for (const pattern of DANGEROUS_JS_PATTERNS) {
      if (code.includes(pattern)) {
        return { success: false, error: 'Blocked dangerous pattern: ' + pattern };
      }
    }
    const result = await evalScript(code);
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Signal the agent loop that the task is done. Pure no-op — just returns the status.
 */
function doneAction(success: boolean, message: string): ActionResult {
  return { success, data: { message } };
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Execute an agent action by dispatching to the appropriate handler.
 *
 * @param params - Discriminated union of action parameters
 * @returns ActionResult — always resolves, never throws
 */
export async function executeAction(params: ActionParams): Promise<ActionResult> {
  // ---- inner dispatch: CDP → evalScript, no retry ----
  async function dispatch(p: ActionParams): Promise<ActionResult> {
    // CDP path: use Playwright when connected
    if (isConnected()) {
      switch (p.action) {
        case 'click':
          return pwClick(p.selector);
        case 'type':
          return pwType(p.selector, p.text, p.clear);
        case 'readText':
          return pwReadText(p.selector);
        case 'waitFor':
          return pwWaitFor(p.selector, p.timeoutMs);
        case 'scroll':
          return pwScroll(p.direction, p.amount);
        // All other actions fall through to evalScript below
      }
    }

    // evalScript path
    switch (p.action) {
      case 'click':
        return clickAction(p.selector);
      case 'type':
        return typeAction(p.selector, p.text, p.clear);
      case 'scroll':
        return scrollAction(p.direction, p.amount);
      case 'readText':
        return readTextAction(p.selector);
      case 'screenshot':
        return screenshotAction();
      case 'waitFor':
        return waitForAction(p.selector, p.timeoutMs);
      case 'navigate':
        return navigateAction(p.url);
      case 'runJS':
        return runJSAction(p.code);
      case 'done':
        return doneAction(p.success, p.message);
      default:
        return { success: false, error: `Unknown action: ${(p as any).action}` };
    }
  }

  // Extract selector for potential fuzzy retry (only selector-based actions)
  let originalSelector: string | undefined;
  switch (params.action) {
    case 'click':
    case 'type':
    case 'waitFor':
      originalSelector = params.selector;
      break;
    case 'readText':
      originalSelector = params.selector;
      break;
  }

  const result = await dispatch(params);

  // ---- Fuzzy DOM retry: selector-based failures only, max 1 retry ----
  if (
    originalSelector &&
    !result.success &&
    result.error &&
    /not found|element not found/i.test(result.error)
  ) {
    try {
      const elements = await captureInteractiveDom();
      const match = findFuzzyMatch(originalSelector, elements);
      if (match) {
        const retryParams = { ...params, selector: match.selector } as ActionParams;
        const retryResult = await dispatch(retryParams);
        if (retryResult.success) {
          return {
            ...retryResult,
            data: {
              ...((retryResult.data as object) || {}),
              fuzzyMatch: fuzzyMatchReason(originalSelector, match, 0),
            },
          };
        }
        return retryResult;
      }
    } catch {
      // captureInteractiveDom failed — return original failure
    }
  }

  return result;
}