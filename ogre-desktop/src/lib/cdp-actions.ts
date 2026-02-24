/**
 * cdp-actions.ts — CDP action implementations using the thin CDP client.
 *
 * Drop-in replacement for playwright-executor.ts that uses raw CDP protocol
 * via cdp-client.ts instead of playwright-core. Exports the exact same API
 * surface so browser-actions.ts can import from either module.
 *
 * Zero npm dependencies beyond ./cdp-client, ./agent-types, @tauri-apps/api/core.
 */

import { invoke } from '@tauri-apps/api/core';
import { cdp } from './cdp-client';
import type { ActionResult } from './agent-types';
import { DANGEROUS_JS_PATTERNS } from './agent-types';

// ============================================================================
// Helpers (module-private)
// ============================================================================

/**
 * Check a code string for dangerous JS patterns.
 * Returns the blocked pattern name if found, or null if safe.
 */
function checkDangerousPatterns(code: string): string | null {
  for (const pattern of DANGEROUS_JS_PATTERNS) {
    if (code.includes(pattern)) return pattern;
  }
  return null;
}

/**
 * Escape single quotes in a CSS selector for safe embedding in JS strings.
 */
function escapeSelector(selector: string): string {
  return selector.replace(/'/g, "\\'");
}

// ============================================================================
// Connection Manager
// ============================================================================

/**
 * Connect to the WebView2 embedded browser via CDP.
 *
 * If no port is given, calls the Tauri `get_cdp_port` command to discover it.
 * After connecting, enables Page domain events for navigation tracking.
 *
 * @param port - CDP debugging port (optional; auto-discovered via Tauri if omitted)
 * @returns true on success, false on failure (NEVER throws)
 */
export async function connectCDP(port?: number): Promise<boolean> {
  try {
    let resolvedPort = port;
    if (resolvedPort === undefined || resolvedPort === null) {
      const tauriPort = await invoke<number | null>('get_cdp_port');
      if (tauriPort === null || tauriPort === undefined) return false;
      resolvedPort = tauriPort;
    }

    // Discover the embedded browser target via Rust (bypasses CORS)
    const wsUrl = await invoke<string | null>('discover_cdp_target', { port: resolvedPort });
    if (!wsUrl) return false;

    return await cdp.connectToUrl(wsUrl);
  } catch {
    return false;
  }
}

/**
 * Disconnect from CDP and clean up resources.
 * Safe to call when not connected.
 */
export async function disconnectCDP(): Promise<void> {
  await cdp.disconnect();
}

/**
 * Check if currently connected to a CDP target.
 */
export function isConnected(): boolean {
  return cdp.isConnected();
}

// ============================================================================
// Action Executors
// ============================================================================

/**
 * Click an element matching the CSS selector.
 * Uses DOM.scrollIntoViewIfNeeded + DOM.getBoxModel + Input.dispatchMouseEvent.
 */
export async function pwClick(selector: string): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    const expression = `document.querySelector('${escapeSelector(selector)}')`;
    const blocked = checkDangerousPatterns(expression);
    if (blocked) return { success: false, error: `Blocked dangerous pattern: ${blocked}` };

    // Resolve element to remote object
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: false,
    }) as { result: { objectId?: string } };

    const objectId = evalResult.result?.objectId;
    if (!objectId) return { success: false, error: `Element not found: ${selector}` };

    // Scroll into view
    await cdp.send('DOM.scrollIntoViewIfNeeded', { objectId });

    // Get box model for center coordinates
    const boxResult = await cdp.send('DOM.getBoxModel', { objectId }) as {
      model: { content: number[] };
    };
    const content = boxResult.model.content;
    const x = (content[0] + content[4]) / 2;
    const y = (content[1] + content[5]) / 2;

    // Click: mousePressed + mouseReleased
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Type text into an input element matching the CSS selector.
 * When clear is true, clears the field first before typing.
 */
export async function pwType(
  selector: string,
  text: string,
  clear?: boolean,
): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    const escaped = escapeSelector(selector);

    // Focus the element
    const focusExpr = `document.querySelector('${escaped}')?.focus()`;
    const blocked = checkDangerousPatterns(focusExpr);
    if (blocked) return { success: false, error: `Blocked dangerous pattern: ${blocked}` };

    await cdp.send('Runtime.evaluate', { expression: focusExpr });

    // Clear if requested
    if (clear) {
      const clearExpr = `(function(){ var el = document.querySelector('${escaped}'); if(el){ el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); } })()`;
      const clearBlocked = checkDangerousPatterns(clearExpr);
      if (clearBlocked) return { success: false, error: `Blocked dangerous pattern: ${clearBlocked}` };

      await cdp.send('Runtime.evaluate', { expression: clearExpr });
    }

    // Insert text via Input domain
    await cdp.send('Input.insertText', { text });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read text content from a specific element or the full page body.
 */
export async function pwReadText(selector?: string): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    let expression: string;
    if (selector) {
      expression = `document.querySelector('${escapeSelector(selector)}')?.textContent ?? ''`;
    } else {
      expression = `(document.body.innerText || '').substring(0, 5000)`;
    }

    const blocked = checkDangerousPatterns(expression);
    if (blocked) return { success: false, error: `Blocked dangerous pattern: ${blocked}` };

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    }) as { result: { value?: unknown } };

    return { success: true, data: evalResult.result?.value ?? '' };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Wait for an element matching the selector to appear in the DOM.
 * Polls every 200ms. Timeout is capped at 10000ms.
 */
export async function pwWaitFor(
  selector: string,
  timeoutMs?: number,
): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    const timeout = Math.min(timeoutMs ?? 5000, 10000);
    const expression = `!!document.querySelector('${escapeSelector(selector)}')`;

    const blocked = checkDangerousPatterns(expression);
    if (blocked) return { success: false, error: `Blocked dangerous pattern: ${blocked}` };

    const start = Date.now();
    while (Date.now() - start < timeout) {
      const evalResult = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      }) as { result: { value?: boolean } };

      if (evalResult.result?.value === true) return { success: true };

      // Poll interval: 200ms
      await new Promise((r) => setTimeout(r, 200));
    }

    return { success: false, error: `Timeout waiting for ${selector}` };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Scroll the page in a given direction by the specified amount.
 */
export async function pwScroll(
  direction: string,
  amount: number,
): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    let x = 0;
    let y = 0;
    switch (direction) {
      case 'up':    y = -amount; break;
      case 'down':  y = amount;  break;
      case 'left':  x = -amount; break;
      case 'right': x = amount;  break;
      default:
        return { success: false, error: `Invalid scroll direction: ${direction}` };
    }

    const expression = `(function(){ window.scrollBy(${x}, ${y}); return { scrollX: window.scrollX, scrollY: window.scrollY }; })()`;

    const blocked = checkDangerousPatterns(expression);
    if (blocked) return { success: false, error: `Blocked dangerous pattern: ${blocked}` };

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    }) as { result: { value?: unknown } };

    return { success: true, data: evalResult.result?.value };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Capture a screenshot via CDP Page.captureScreenshot.
 * Returns a data URL (data:image/jpeg;base64,...).
 * @throws on failure — caller is responsible for error handling
 */
export async function cdpScreenshot(): Promise<string> {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 80,
  }) as { data: string };

  return 'data:image/jpeg;base64,' + result.data;
}