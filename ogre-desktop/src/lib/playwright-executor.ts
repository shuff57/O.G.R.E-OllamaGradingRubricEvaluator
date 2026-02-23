/**
 * playwright-executor.ts - Playwright CDP connection and selector-based action execution.
 *
 * Wraps playwright-core CDP connection to the embedded browser WebView2 and
 * provides 5 selector-based actions: click, type, readText, waitFor, scroll.
 *
 * Navigate, screenshot, runJS, and done actions remain on evalScript in browser-actions.ts.
 *
 * Uses dynamic import for playwright-core to avoid bundling issues.
 */

import type { Browser, Page } from 'playwright-core';
import type { ActionResult } from './agent-types';
import { DANGEROUS_JS_PATTERNS } from './agent-types';

// ============================================================================
// Module State
// ============================================================================

let browser: Browser | null = null;
let page: Page | null = null;

// ============================================================================
// CDP Target Filtering
// ============================================================================

/** URL patterns that identify the main Tauri app webview (not the embedded browser). */
const MAIN_APP_PATTERNS = [
  /^tauri:\/\/localhost/,
  /^https:\/\/tauri\.localhost/,
  /^http:\/\/localhost:(1420|5173)/, // Vite dev server
];

/** Shape of a CDP /json discovery target. */
interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

// ============================================================================
// Safety
// ============================================================================

/**
 * Check a code string for dangerous JS patterns.
 * Returns the blocked pattern name if found, or null if safe.
 */
function checkDangerousPatterns(code: string): string | null {
  for (const pattern of DANGEROUS_JS_PATTERNS) {
    if (code.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Safe wrapper for page.evaluate — serializes the function and checks
 * against DANGEROUS_JS_PATTERNS before execution.
 */
async function safeEvaluate<R>(
  fn: (arg: Record<string, number>) => R,
  arg: Record<string, number>,
): Promise<R>;
async function safeEvaluate<R>(fn: () => R): Promise<R>;
async function safeEvaluate<R>(
  fn: ((arg: any) => R) | (() => R),
  arg?: unknown,
): Promise<R> {
  if (!page) throw new Error('Not connected to CDP');

  const code = fn.toString();
  const blocked = checkDangerousPatterns(code);
  if (blocked) {
    throw new Error(`Blocked dangerous pattern in evaluate: ${blocked}`);
  }

  if (arg !== undefined) {
    return page.evaluate(fn as (arg: any) => R, arg);
  }
  return page.evaluate(fn as () => R);
}

// ============================================================================
// Connection Manager
// ============================================================================

/**
 * Connect to the WebView2 embedded browser via CDP.
 *
 * Fetches targets from the CDP discovery endpoint, filters to find the
 * embedded browser (not the main Tauri app, not about:blank), and connects
 * Playwright to that specific page.
 *
 * @param port - CDP debugging port (default 9222)
 * @returns true on success, false on failure (never throws)
 */
export async function connectCDP(port: number = 9222): Promise<boolean> {
  try {
    // Dynamic import to avoid bundling playwright-core
    const { chromium } = await import('playwright-core');

    // Fetch CDP targets — use 127.0.0.1 not localhost (IPv4 vs IPv6 gotcha)
    const resp = await fetch(`http://127.0.0.1:${port}/json`);
    if (!resp.ok) return false;

    const targets: CDPTarget[] = await resp.json();

    // Find the embedded browser target (not Tauri app, not blank)
    const embeddedTarget = targets.find(
      (t) =>
        t.type === 'page' &&
        t.url !== 'about:blank' &&
        t.url !== '' &&
        !MAIN_APP_PATTERNS.some((p) => p.test(t.url)),
    );

    if (!embeddedTarget) return false;

    // Connect to the CDP endpoint
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

    // Find the page matching our embedded target by URL
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url() === embeddedTarget.url) {
          page = p;
          return true;
        }
      }
    }

    // Fallback: find any page that isn't the main app or blank
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const url = p.url();
        if (
          url !== 'about:blank' &&
          url !== '' &&
          !MAIN_APP_PATTERNS.some((pat) => pat.test(url))
        ) {
          page = p;
          return true;
        }
      }
    }

    // No suitable page found — clean up
    await browser.close();
    browser = null;
    return false;
  } catch {
    browser = null;
    page = null;
    return false;
  }
}

/**
 * Disconnect from CDP and clean up resources.
 */
export async function disconnectCDP(): Promise<void> {
  try {
    if (browser) {
      await browser.close();
    }
  } catch {
    // Ignore disconnect errors
  } finally {
    browser = null;
    page = null;
  }
}

/**
 * Check if currently connected to a CDP target.
 */
export function isConnected(): boolean {
  return browser !== null && page !== null;
}

// ============================================================================
// Action Executors
// ============================================================================

/**
 * Click an element matching the CSS selector.
 */
export async function pwClick(selector: string): Promise<ActionResult> {
  try {
    if (!page) return { success: false, error: 'Not connected to CDP' };

    const locator = page.locator(selector);
    await locator.click();

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Type text into an input element matching the CSS selector.
 * When clear is true, clears the field first before filling.
 */
export async function pwType(
  selector: string,
  text: string,
  clear?: boolean,
): Promise<ActionResult> {
  try {
    if (!page) return { success: false, error: 'Not connected to CDP' };

    const locator = page.locator(selector);

    if (clear) {
      await locator.fill('');
    }
    await locator.fill(text);

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Read text content from a specific element or the full page body.
 */
export async function pwReadText(selector?: string): Promise<ActionResult> {
  try {
    if (!page) return { success: false, error: 'Not connected to CDP' };

    if (selector) {
      const locator = page.locator(selector);
      const text = await locator.textContent();
      return { success: true, data: text ?? '' };
    } else {
      // Read full page body text, capped at 5000 chars to match browser-actions behavior
      const text = await safeEvaluate(() => {
        return (document.body.innerText || '').substring(0, 5000);
      });
      return { success: true, data: text };
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Wait for an element matching the selector to appear in the DOM.
 * Timeout is capped at 10000ms to match browser-actions behavior.
 */
export async function pwWaitFor(
  selector: string,
  timeoutMs?: number,
): Promise<ActionResult> {
  try {
    if (!page) return { success: false, error: 'Not connected to CDP' };

    const timeout = Math.min(timeoutMs ?? 5000, 10000);
    const locator = page.locator(selector);
    await locator.waitFor({ state: 'attached', timeout });

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
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
    if (!page) return { success: false, error: 'Not connected to CDP' };

    let xVal = 0;
    let yVal = 0;
    switch (direction) {
      case 'up':
        yVal = -amount;
        break;
      case 'down':
        yVal = amount;
        break;
      case 'left':
        xVal = -amount;
        break;
      case 'right':
        xVal = amount;
        break;
      default:
        return { success: false, error: `Invalid scroll direction: ${direction}` };
    }

    const scrollPos = await safeEvaluate(
      ({ x, y }: { x: number; y: number }) => {
        window.scrollBy(x, y);
        return { scrollX: window.scrollX, scrollY: window.scrollY };
      },
      { x: xVal, y: yVal },
    );

    return { success: true, data: scrollPos };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}