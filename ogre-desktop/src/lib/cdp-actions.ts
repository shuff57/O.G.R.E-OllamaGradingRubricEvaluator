/**
 * cdp-actions.ts — CDP action implementations using the thin CDP client.
 *
 * Drop-in replacement for playwright-executor.ts that uses raw CDP protocol
 * via cdp-client.ts instead of playwright-core. Exports the exact same API
 * surface so browser-actions.ts can import from either module.
 *
 * Zero npm dependencies beyond ./cdp-client, ./agent-types, @tauri-apps/api/core.
 */

import { invoke } from './electron-bridge';
import { cdp, CDPClient, MAIN_APP_PATTERNS, type CDPTarget } from './cdp-client';
import type { ActionResult } from './agent-types';
import { DANGEROUS_JS_PATTERNS } from './agent-types';

// ============================================================================
// Helpers (module-private)
// ============================================================================

/** Cache CDP connection failures to avoid repeated 3s HTTP timeouts on Linux. */
let _cdpConnectFailed = false;

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
  // Return false immediately if a previous connection attempt failed (cache hit)
  if (_cdpConnectFailed) return false;

  try {
    let resolvedPort = port;
    if (resolvedPort === undefined || resolvedPort === null) {
      const tauriPort = await invoke<number | null>('get_cdp_port');
      if (tauriPort === null || tauriPort === undefined) {
        _cdpConnectFailed = true;
        return false;
      }
      resolvedPort = tauriPort;
    }

    // Discover the embedded browser target via Rust (bypasses CORS)
    const wsUrl = await invoke<string | null>('discover_cdp_target', { port: resolvedPort });
    if (!wsUrl) {
      _cdpConnectFailed = true;
      return false;
    }

    const connected = await cdp.connectToUrl(wsUrl);
    if (!connected) {
      _cdpConnectFailed = true;
    }
    return connected;
  } catch {
    _cdpConnectFailed = true;
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
 * Reset the CDP connection failure cache.
 * Used for testing or manual retry after a failed connection attempt.
 */
export function resetCdpCache(): void {
  _cdpConnectFailed = false;
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

    // Get box model for center coordinates, with JS-click fallback for hidden/animating elements
    let clickDone = false;
    try {
      const boxResult = await cdp.send('DOM.getBoxModel', { objectId }) as {
        model: { content: number[] };
      };
      const content = boxResult.model.content;
      const x = (content[0] + content[4]) / 2;
      const y = (content[1] + content[5]) / 2;

      // Click: mousePressed + mouseReleased
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button: 'left', clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
      });
      clickDone = true;
    } catch (layoutErr: unknown) {
      // Element has no layout object (e.g. dropdown item still animating) — fall back to JS click
      const msg = layoutErr instanceof Error ? layoutErr.message : String(layoutErr);
      if (!msg.toLowerCase().includes('layout object')) throw layoutErr;
    }

    // JS-click fallback: fires the click event directly, no layout coordinates needed
    if (!clickDone) {
      await cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: 'function() { this.click(); }',
        returnByValue: false,
      });
    }

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

/**
 * Press a keyboard key via CDP Input.dispatchKeyEvent (keyDown + keyUp).
 * Key names follow the W3C UI Events spec: 'Tab', 'Enter', 'Escape',
 * 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'.
 * Single printable chars (e.g. 'a', '1') also work.
 */
export async function pwPressKey(key: string): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    // Map W3C key names → Windows Virtual Key codes (required by CDP)
    const KEY_MAP: Record<string, { code: string; keyCode: number }> = {
      'Tab':        { code: 'Tab',        keyCode: 9  },
      'Enter':      { code: 'Enter',       keyCode: 13 },
      'Escape':     { code: 'Escape',      keyCode: 27 },
      'Space':      { code: 'Space',       keyCode: 32 },
      'ArrowLeft':  { code: 'ArrowLeft',   keyCode: 37 },
      'ArrowUp':    { code: 'ArrowUp',     keyCode: 38 },
      'ArrowRight': { code: 'ArrowRight',  keyCode: 39 },
      'ArrowDown':  { code: 'ArrowDown',   keyCode: 40 },
      'Backspace':  { code: 'Backspace',   keyCode: 8  },
      'Delete':     { code: 'Delete',      keyCode: 46 },
    };

    const keyInfo = KEY_MAP[key] ?? { code: key, keyCode: 0 };

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: keyInfo.code,
      windowsVirtualKeyCode: keyInfo.keyCode,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: keyInfo.code,
      windowsVirtualKeyCode: keyInfo.keyCode,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Write content into a CodeMirror editor without the runJS approval gate.
 * Resolves the CodeMirror instance from the textarea ID, a .CodeMirror wrapper,
 * or the .CodeMirror div itself. Uses JSON.stringify to safely pass the value
 * regardless of its content (PHP code, math, backslashes, dollar signs, etc.).
 *
 * @param selector - CSS selector of the textarea (#control, #qtext) or container
 * @param value    - Full text to set; replaces all existing content
 */
export async function pwWriteCodeMirror(selector: string, value: string): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    const esc = escapeSelector(selector);
    const safeValue = JSON.stringify(value); // handles backslashes, newlines, $, backticks

    const expression = `(function(val) {
  try {
    var el = document.querySelector('${esc}');
    if (!el) return { success: false, error: 'Element not found: ${esc}' };
    var cm = el.CodeMirror
      || (el.querySelector && el.querySelector('.CodeMirror') && el.querySelector('.CodeMirror').CodeMirror)
      || (el.parentElement && el.parentElement.CodeMirror)
      || (el.classList && el.classList.contains('CodeMirror') && el.CodeMirror);
    if (!cm) return { success: false, error: 'No CodeMirror instance found on ${esc}. Is this a CodeMirror editor?' };
    cm.setValue(val);
    cm.refresh();
    return { success: true, data: { lines: cm.lineCount() } };
  } catch(e) { return { success: false, error: e.message }; }
})(${safeValue})`;

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    }) as { result: { value?: unknown } };

    return (evalResult.result?.value as ActionResult) ?? { success: false, error: 'No result from CodeMirror write' };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Capture a screenshot of a popup window that was just opened by the current page.
 * Polls the CDP target list for a new page target (max `timeoutMs`, default 8 s),
 * connects a temporary CDPClient to it, takes a screenshot, and disconnects.
 *
 * Returns the screenshot as a data URL (data:image/jpeg;base64,...).
 * Returns an error if no popup appears in time or if the popup is a native window
 * (e.g. opened outside WebView2) and is therefore not reachable via CDP.
 *
 * @param timeoutMs - Max milliseconds to wait for popup to appear (default 8000, max 15000)
 */
export async function pwCapturePopup(timeoutMs?: number): Promise<ActionResult> {
  try {
    if (!cdp.isConnected()) return { success: false, error: 'Not connected to CDP' };

    const port = await invoke<number | null>('get_cdp_port');
    if (port === null || port === undefined) return { success: false, error: 'CDP port unavailable' };

    // Snapshot known targets so we can detect the NEW popup target
    let beforeTargets: CDPTarget[] = [];
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json`);
      if (resp.ok) beforeTargets = (await resp.json()) as CDPTarget[];
    } catch { /* proceed — beforeTargets stays empty, we'll still detect new targets */ }
    const knownUrls = new Set(beforeTargets.map((t) => t.webSocketDebuggerUrl));

    // Poll for a new non-main-app page target
    const timeout = Math.min(timeoutMs ?? 8000, 15000);
    const start = Date.now();
    let popupTarget: CDPTarget | undefined;

    while (Date.now() - start < timeout) {
      await new Promise<void>((r) => setTimeout(r, 400));
      try {
        const afterResp = await fetch(`http://127.0.0.1:${port}/json`);
        if (!afterResp.ok) continue;
        const afterTargets = (await afterResp.json()) as CDPTarget[];
        popupTarget = afterTargets.find(
          (t) =>
            t.type === 'page' &&
            t.url !== 'about:blank' &&
            t.url !== '' &&
            !MAIN_APP_PATTERNS.some((p) => p.test(t.url)) &&
            !knownUrls.has(t.webSocketDebuggerUrl),
        );
        if (popupTarget) break;
      } catch { /* retry */ }
    }

    if (!popupTarget) {
      return {
        success: false,
        error: 'No popup window appeared within timeout. The preview may have opened in a native window outside WebView2 — try readText or navigate to the saved question instead.',
      };
    }

    // Connect a temporary client to the popup, screenshot, disconnect
    const popupClient = new CDPClient();
    const connected = await popupClient.connectToUrl(popupTarget.webSocketDebuggerUrl);
    if (!connected) {
      return { success: false, error: 'Found popup target but could not connect to it' };
    }

    try {
      // Brief pause for popup to finish rendering
      await new Promise<void>((r) => setTimeout(r, 600));
      const result = await popupClient.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 80,
      }) as { data: string };
      return { success: true, data: 'data:image/jpeg;base64,' + result.data };
    } finally {
      await popupClient.disconnect();
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}