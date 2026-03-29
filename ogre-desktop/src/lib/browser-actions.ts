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
  getEmbeddedUrl,
} from './browser';
import { findFuzzyMatch, fuzzyMatchReason } from './agent-dom-fuzzy';
import { captureInteractiveDom } from './agent-dom';
import { pwClick, pwType, pwReadText, pwWaitFor, pwScroll, pwPressKey, pwWriteCodeMirror, pwCapturePopup } from './cdp-actions';
import { cdp } from './cdp-client';
import { runDiscovery } from './discover';
import { testProfile } from './profile-tester';
import { ProfileStorageImpl } from './site-profiles';
import type { SiteProfile } from './batch-grader';
import type { DiscoveryHints } from './discovery-intent';
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

/**
 * Inject a brief ripple dot into the WebView at the centre of the target element.
 * Shows the user exactly where the agent is clicking or typing.
 * Purely decorative — all errors are silently swallowed.
 */
async function showCursorDot(selector: string, color = '#3b82f6'): Promise<void> {
  try {
    const esc = escapeSelector(selector);
    const c = escapeSelector(color);
    await evalScript(`(function(){
  var el=document.querySelector('${esc}');
  if(!el)return;
  var r=el.getBoundingClientRect();
  var d=document.createElement('div');
  d.setAttribute('data-ogre-cursor','1');
  d.style.cssText=[
    'position:fixed',
    'left:'+(r.left+r.width/2)+'px',
    'top:'+(r.top+r.height/2)+'px',
    'width:22px','height:22px',
    'border-radius:50%',
    'background:${c}',
    'opacity:0.9',
    'border:2.5px solid rgba(255,255,255,0.9)',
    'transform:translate(-50%,-50%) scale(0)',
    'transition:transform 0.13s cubic-bezier(0.34,1.56,0.64,1),opacity 0.45s ease 0.18s',
    'pointer-events:none',
    'z-index:2147483647',
    'box-shadow:0 2px 10px rgba(0,0,0,0.22),0 0 0 5px ${c}33'
  ].join(';');
  document.body.appendChild(d);
  requestAnimationFrame(function(){
    d.style.transform='translate(-50%,-50%) scale(1)';
    setTimeout(function(){d.style.opacity='0';setTimeout(function(){if(d.parentNode)d.remove();},500);},380);
  });
})()`);
  } catch {
    /* decorative — never throw */
  }
}

// ============================================================================
// Action Implementations
// ============================================================================

/**
 * Click an element matching the CSS selector.
 */
async function clickAction(selector: string): Promise<ActionResult> {
  return pwClick(selector);
}

/**
 * Type text into an element matching the CSS selector.
 * Handles <input>, <textarea>, and contenteditable elements correctly.
 * Uses the element-appropriate native property setter for React/Angular compatibility.
 */
async function typeAction(
  selector: string,
  text: string,
  clear?: boolean,
): Promise<ActionResult> {
  return pwType(selector, text, clear);
}

/**
 * Triple-click an element to select all its text.
 * Useful for selecting text before overwriting, or activating fields that require a click.
 */
async function tripleClickAction(selector: string): Promise<ActionResult> {
  try {
    const escaped = escapeSelector(selector);
    const remoteResult = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('${escaped}')`,
      returnByValue: false,
    }) as { result: { objectId?: string } };

    const objectId = remoteResult.result?.objectId;
    if (!objectId) return { success: false, error: 'Element not found: ' + selector };

    await cdp.send('DOM.scrollIntoViewIfNeeded', { objectId });
    const boxResult = await cdp.send('DOM.getBoxModel', { objectId }) as {
      model: { content: number[] };
    };
    const content = boxResult.model.content;
    const x = (content[0] + content[4]) / 2;
    const y = (content[1] + content[5]) / 2;

    for (let clickCount = 1; clickCount <= 3; clickCount += 1) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount,
      });
    }

    const elementInfoResult = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        var el = document.querySelector('${escaped}');
        if (!el) return null;
        return {
          tagName: (el.tagName || '').toUpperCase(),
          isContentEditable: !!el.isContentEditable,
        };
      })()`,
      returnByValue: true,
    }) as {
      result?: { value?: { tagName?: string; isContentEditable?: boolean } | null };
    };

    const elementInfo = elementInfoResult.result?.value;
    if (elementInfo?.tagName === 'INPUT' || elementInfo?.tagName === 'TEXTAREA') {
      await cdp.send('Runtime.evaluate', {
        expression: `(function(){
          var el = document.querySelector('${escaped}');
          if (el && typeof el.select === 'function') el.select();
        })()`,
        returnByValue: false,
      });
    }

    if (elementInfo?.isContentEditable) {
      await cdp.send('Runtime.evaluate', {
        expression: `(function(){
          var el = document.querySelector('${escaped}');
          if (!el) return;
          var r = document.createRange();
          r.selectNodeContents(el);
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        })()`,
        returnByValue: false,
      });
    }

    return { success: true, data: { selected: true } };
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
  return pwScroll(direction, amount);
}

/**
 * Read text content from a specific element or the full page body.
 */
async function readTextAction(selector?: string): Promise<ActionResult> {
  return pwReadText(selector);
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
  return pwWaitFor(selector, timeoutMs);
}

/**
 * Navigate the embedded browser to a URL and wait for the page to fully load.
 *
 * Registers a one-shot `Page.loadEventFired` listener BEFORE sending `Page.navigate`
 * to avoid a race condition where the load fires before we start listening.
 * Times out gracefully — never throws, never hangs.
 *
 * @param url - The URL to navigate to.
 * @param timeout - Max ms to wait for `Page.loadEventFired` (default 10 000ms).
 */
async function navigateAction(url: string, timeout = 10_000): Promise<ActionResult> {
  try {
    // Enable the Page domain so we receive Page.* events.
    await cdp.send('Page.enable');

    let loadResolve: () => void;
    const loadPromise = new Promise<void>((res) => { loadResolve = res; });

    const onLoad = () => { loadResolve(); };

    // Register the listener BEFORE navigating to avoid missing the event.
    cdp.on('Page.loadEventFired', onLoad);

    // Send navigation command; check immediately for hard navigation errors.
    let navResult: unknown;
    try {
      navResult = await cdp.send('Page.navigate', { url });
    } catch (err: unknown) {
      cdp.off('Page.loadEventFired', onLoad);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    // If the CDP response itself contained an errorText, fail immediately.
    const navResponse = navResult as Record<string, unknown> | undefined;
    if (navResponse?.errorText) {
      cdp.off('Page.loadEventFired', onLoad);
      return { success: false, error: String(navResponse.errorText) };
    }

    // Race the load event against the timeout.
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<'timeout'>((res) => {
      timeoutHandle = setTimeout(() => res('timeout'), timeout);
    });

    const winner = await Promise.race([loadPromise.then(() => 'loaded' as const), timeoutPromise]);

    // Always clean up — listener and timer.
    cdp.off('Page.loadEventFired', onLoad);
    clearTimeout(timeoutHandle);

    if (winner === 'timeout') {
      return { success: true, warning: `Page load timed out after ${timeout}ms` };
    }

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

/**
 * Sleep for the specified number of milliseconds.
 * Capped at 30000ms (30 seconds) to prevent accidental lockup.
 * Used after async AJAX operations (Aeries save, Kendo widget updates).
 */
async function sleepAction(ms: number): Promise<ActionResult> {
  const capped = Math.min(ms, 30000);
  await new Promise<void>((resolve) => setTimeout(resolve, capped));
  return { success: true, data: { sleptMs: capped } };
}

async function writeCodeMirrorAction(selector: string, value: string): Promise<ActionResult> {
  return pwWriteCodeMirror(selector, value);
}

/**
 * Dispatch a keyboard key press via CDP Input.dispatchKeyEvent.
 * Common keys: 'Tab', 'Enter', 'Escape', 'ArrowDown', 'ArrowUp'.
 */
async function pressKeyAction(key: string): Promise<ActionResult> {
  return pwPressKey(key);
}

/**
 * Scroll a named element into view by matching its visible text content.
 * More reliable than pixel-based scroll when targeting a specific student name,
 * heading, or label. Case-insensitive, matches the first leaf node whose
 * trimmed text contains the search string.
 */
async function scrollIntoViewAction(text: string): Promise<ActionResult> {
  try {
    const safeText = escapeSelector(text);
    const result = await evalScriptJSON<ActionResult>(`(function() {
  try {
    var needle = '${safeText}'.toLowerCase();
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    while (node) {
      var trimmed = node.textContent ? node.textContent.trim() : '';
      if (trimmed.toLowerCase().indexOf(needle) !== -1) {
        if (node.parentElement) {
          node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { success: true, data: { matched: trimmed.substring(0, 100) } };
        }
      }
      node = walker.nextNode();
    }
    return { success: false, error: 'No element found with text: ${safeText}' };
  } catch(e) {
    return { success: false, error: e.message };
  }
})()`);
    return result;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// Discovery & Profile Actions
// ============================================================================

/**
 * Run AI-powered page structure discovery on the current page.
 * Returns a DiscoveryResult with selectors, feedback config, etc.
 */
async function discoverPageAction(_hints?: DiscoveryHints): Promise<ActionResult> {
  try {
    const result = await runDiscovery({ /* hints are for future use */ });
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Test a saved site profile against the current page.
 * Loads the profile by ID, runs selector + extraction tests, returns a report.
 */
async function testProfileAction(profileId: string, _sampleCount?: number): Promise<ActionResult> {
  try {
    const storage = new ProfileStorageImpl();
    const profile = await storage.getProfile(profileId);
    if (!profile) {
      return { success: false, error: `Profile not found: ${profileId}` };
    }
    const pageUrl = await getEmbeddedUrl();
    const report = await testProfile(profile, pageUrl);
    return { success: true, data: report };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Validate and save a site profile.
 * Requires a non-empty name and at least one selector.
 */
async function saveProfileAction(
  partial: Partial<SiteProfile>,
  name: string,
): Promise<ActionResult> {
  try {
    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Profile name must not be empty' };
    }
    const selectors = partial.selectors;
    if (!selectors || Object.values(selectors).every((v) => !v)) {
      return { success: false, error: 'Profile must have at least one selector' };
    }
    const profileId = partial.id || `profile-${Date.now()}`;
    const profile: SiteProfile = {
      id: profileId,
      name: name.trim(),
      isBuiltIn: false,
      urlPatterns: partial.urlPatterns || [],
      selectors: selectors,
      feedback: partial.feedback || { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
      save: partial.save || { buttonText: 'Save', fallbackText: 'Submit' },
      navigation: partial.navigation || { mode: 'batch' },
    };
    const storage = new ProfileStorageImpl();
    await storage.saveProfile(profile);
    return { success: true, data: { profileId } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
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
  async function dispatch(p: ActionParams): Promise<ActionResult> {

    switch (p.action) {
      case 'click':
        return clickAction(p.selector);
      case 'triple_click':
        return tripleClickAction(p.selector);
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
      case 'sleep':
        return sleepAction(p.ms);
      case 'pressKey':
        return pressKeyAction(p.key);
      case 'writeCodeMirror':
        return writeCodeMirrorAction(p.selector, p.value);
      case 'capturePopup':
        return pwCapturePopup(p.timeoutMs);
      case 'scrollIntoView':
        return scrollIntoViewAction(p.text);
      case 'discover_page':
        return discoverPageAction(p.hints);
      case 'test_profile':
        return testProfileAction(p.profileId, p.sampleCount);
      case 'save_profile':
        return saveProfileAction(p.profile, p.name);
      case 'runJS':
        return runJSAction(p.code);
      case 'done':
        return doneAction(p.success, p.message);
      default:
        return { success: false, error: `Unknown action: ${params.action}` };
  }
  }

  // Extract selector for potential fuzzy retry (only selector-based actions)
  let originalSelector: string | undefined;
  switch (params.action) {
    case 'click':
    case 'triple_click':
    case 'type':
    case 'waitFor':
    case 'writeCodeMirror':
      originalSelector = params.selector;
      break;
    case 'readText':
      originalSelector = params.selector;
      break;
  }

  // Show cursor ripple for interactive actions (decorative, fire-and-forget)
  if (params.action === 'click' || params.action === 'triple_click') {
    void showCursorDot(params.selector);
  } else if (params.action === 'type') {
    void showCursorDot(params.selector, '#22c55e');
  } else if (params.action === 'pressKey') {
    void showCursorDot('*:focus', '#f59e0b');
  }

  const result = await dispatch(params);

  // ---- Fuzzy DOM retry: selector-based failures only, max 1 retry ----
  // Also catches SyntaxError from invalid pseudo-selectors like :has-text(), :contains(), :nth-match()
  if (
    originalSelector &&
    !result.success &&
    result.error &&
    /not found|element not found|not a valid selector|syntaxerror|failed to execute/i.test(result.error)
  ) {
    try {
      const elements = await captureInteractiveDom();
      const match = findFuzzyMatch(originalSelector, elements);
      if (match) {
        const { element: fuzzyElement, strategyIndex } = match;
        const retryParams = { ...params, selector: fuzzyElement.selector } as ActionParams;
        const retryResult = await dispatch(retryParams);
        if (retryResult.success) {
          return {
            ...retryResult,
            data: {
              ...((retryResult.data as object) || {}),
              fuzzyMatch: fuzzyMatchReason(originalSelector, fuzzyElement, strategyIndex),
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
