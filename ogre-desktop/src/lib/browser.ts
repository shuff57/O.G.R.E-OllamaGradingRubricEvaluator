import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { generateAutoFillScript } from './autofill';
import { isConnected, connectCDP, cdpScreenshot } from './cdp-actions';
import { cdp } from './cdp-client';

// --- Embedded Browser Functions ---

/**
 * Create the embedded browser webview.
 */
export async function createEmbeddedBrowser(url: string): Promise<void> {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  await invoke('create_embedded_browser', { url: normalized });
}

/**
 * Navigate the embedded browser to a new URL.
 */
export async function navigateEmbedded(url: string): Promise<void> {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  await invoke('navigate_embedded', { url: normalized });
}

/**
 * Go back in the embedded browser history.
 */
export async function goBack(): Promise<void> {
  await invoke('go_back');
}

/**
 * Go forward in the embedded browser history.
 */
export async function goForward(): Promise<void> {
  await invoke('go_forward');
}

/**
 * Reload the embedded browser page.
 */
export async function reloadBrowser(): Promise<void> {
  await invoke('reload_browser');
}

/**
 * Set the bounds of the embedded webview.
 */
export async function setWebviewBounds(x: number, y: number, width: number, height: number): Promise<void> {
  await invoke('set_webview_bounds', { x, y, width, height });
}

/**
 * Hide the embedded webview.
 */
export async function hideWebview(): Promise<void> {
  await invoke('hide_webview');
}

/**
 * Show the embedded webview.
 */
export async function showWebview(): Promise<void> {
  await invoke('show_webview');
}

/**
 * Get the current URL of the embedded browser.
 */
export async function getEmbeddedUrl(): Promise<string> {
  return await invoke('get_embedded_url');
}

/**
 * Destroy the embedded webview.
 */
export async function destroyWebview(): Promise<void> {
  await invoke('destroy_webview');
}

/**
 * Listen for URL changes in the embedded browser.
 */
export async function listenBrowserUrlChanged(callback: (url: string) => void) {
  return listen<string>('browser-url-changed', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for page loaded events in the embedded browser.
 */
export async function listenBrowserPageLoaded(callback: (url: string) => void) {
  return listen<string>('browser-page-loaded', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for browser status events (creation success/failure).
 * Status values: "embedded-open" (success), "error" (failure)
 */
export async function listenBrowserStatus(callback: (status: string) => void) {
  return listen<string>('browser-status', (event) => {
    callback(event.payload);
  });
}

/**
 * Inject auto-fill credentials into the embedded browser.
 * Generates the autofill script from username/password and evaluates it in the webview.
 */
export async function injectAutofill(username: string, password: string): Promise<void> {
  const script = generateAutoFillScript(username, password);
  await invoke('inject_autofill', { script });
}

// --- Webview Script Evaluation (Wave 0.2 Spike) ---

/**
 * Execute JavaScript in the embedded browser webview and return the result.
 * 
 * Uses message passing under the hood. The script is wrapped and executed,
 * then the result is serialized and returned via IPC callback.
 * 
 * @param script - JavaScript expression to evaluate (must return a value)
 * @returns Promise resolving to the JSON-serialized result
 * 
 * @example
 * // Extract page title
 * const title = await evalScript(`document.title`);
 * 
 * @example
 * // Extract student name
 * const name = await evalScript(`
 *   document.querySelector('.student-name')?.textContent || 'Unknown'
 * `);
 * 
 * @example
 * // Extract all answers
 * const answers = await evalScript(`
 *   [...document.querySelectorAll('.answer')].map(el => el.value)
 * `);
 */
export async function evalScript(script: string): Promise<string> {
  // Ensure CDP is connected (auto-connects if needed)
  if (!cdp.isConnected()) {
    const ok = await connectCDP();
    if (!ok) throw new Error('Cannot evaluate script: CDP not connected');
  }

  // Use CDP Runtime.evaluate which works reliably on the embedded browser.
  // The old Tauri IPC callback mechanism does not work because external-URL
  // webviews do not have window.__TAURI_INTERNALS__.
  const result = await cdp.send('Runtime.evaluate', {
    expression: script,
    returnByValue: true,
    awaitPromise: true,
  }) as {
    result: { type: string; value?: unknown; description?: string };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };

  if (result.exceptionDetails) {
    const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Script error: ${desc}`);
  }

  // Runtime.evaluate returns { type, value } when returnByValue=true.
  // JSON.stringify the value to match the old evalScript contract (returns a string).
  const val = result.result.value;
  return val === undefined ? 'undefined' : JSON.stringify(val);
}

/**
 * Inject JavaScript into the embedded browser without needing a return value.
 *
 * Unlike evalScript(), this does NOT wrap the code in a return(...) expression,
 * so top-level var declarations become window globals — required for library
 * IIFEs like Turndown that define vars at module scope.
 *
 * @param script - JavaScript to inject (no return value expected)
 */
export async function injectScript(script: string): Promise<void> {
  await invoke<void>('inject_webview_script', { script });
}

/**
 * Execute JavaScript and automatically parse JSON result.
 * Convenience wrapper around evalScript() that handles JSON parsing.
 *
 * @param script - JavaScript expression to evaluate
 * @returns Promise resolving to the parsed JavaScript value
 */
export async function evalScriptJSON<T = any>(script: string): Promise<T> {
  // evalScript now returns JSON.stringify(value) via CDP.
  // For scripts that already return JSON strings (legacy pattern), we need
  // to handle double-stringify: the script returns a JSON string,
  // evalScript wraps it in JSON.stringify again, so we parse twice.
  const raw = await evalScript(script);
  const parsed = JSON.parse(raw);

  // If the script returned a string that is itself JSON (legacy pattern
  // where scripts do `return JSON.stringify({...})`), parse again.
  if (typeof parsed === 'string') {
    try { return JSON.parse(parsed); } catch { return parsed as T; }
  }
  return parsed;
}

// --- Text Extraction ---

/**
 * Extract the currently selected/highlighted text from the embedded browser.
 * Uses window.getSelection() in the webview context.
 * 
 * @returns Promise resolving to the selected text, or empty string if nothing selected
 * 
 * @example
 * const text = await extractSelectedText();
 * if (text) {
 *   studentWork = text;
 * }
 */
export async function extractSelectedText(): Promise<string> {
  return await evalScript(`(function() {
    const selection = window.getSelection();
    return selection ? selection.toString() : '';
  })()`);
}

/** Common grading site presets */
export const GRADING_SITE_PRESETS = [
  { name: 'MyOpenMath', url: 'https://www.myopenmath.com/' },
  { name: 'Canvas', url: 'https://canvas.instructure.com/' },
  { name: 'Blackboard', url: 'https://blackboard.com/' },
  { name: 'Moodle', url: 'https://moodle.org/' },
];

// --- Webview Screenshot Capture (V1 — webview-based via html2canvas) ---

/** CDN URL for html2canvas (loaded on-demand into the embedded webview). */
const HTML2CANVAS_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

/**
 * Ensure html2canvas is loaded in the embedded webview.
 * Injects the CDN script tag if the library isn't already present.
 * Cached after first load — subsequent calls are near-instant.
 *
 * @throws Error if CDN is unreachable or script fails to load
 */
async function ensureHtml2CanvasLoaded(): Promise<void> {
  const alreadyLoaded = await evalScriptJSON<boolean>(
    `typeof window.html2canvas === 'function'`
  );
  if (alreadyLoaded) return;

  await evalScriptJSON<string>(`
    new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = '${HTML2CANVAS_CDN}';
      s.onload = function() { resolve('loaded'); };
      s.onerror = function() { reject(new Error('Failed to load html2canvas from CDN. Check internet connection.')); };
      document.head.appendChild(s);
    })
  `);
}

/**
 * Capture the visible viewport of the embedded webview as a base64 JPEG.
 *
 * Loads html2canvas dynamically on first call (CDN).
 * The capture renders the current visible viewport — no scrolling content
 * is included beyond what the user can see.
 *
 * @returns Promise resolving to a data URL string (`data:image/jpeg;base64,...`)
 * @throws Error if the webview is not open, html2canvas fails to load, or capture errors
 *
 * @example
 * const screenshot = await captureWebviewScreenshot();
 * // screenshot is "data:image/jpeg;base64,/9j/4AAQ..."
 */
export async function captureWebviewScreenshot(): Promise<string> {
  // Try CDP screenshot first (native, no CDN dependency)
  if (isConnected()) {
    try {
      return await cdpScreenshot();
    } catch {
      // Fall through to html2canvas
    }
  }

  // Step 1: Load html2canvas (cached after first call)
  await ensureHtml2CanvasLoaded();

  // Step 2: Capture visible viewport and return as data URL
  const dataUrl = await evalScriptJSON<string>(`
    (async function() {
      var canvas = await window.html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight
      });
      return canvas.toDataURL('image/jpeg', 0.8);
    })()
  `);

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new Error('Screenshot capture returned invalid image data');
  }

  return dataUrl;
}

/**
 * Crop a base64-encoded image to a specific rectangular region.
 *
 * Runs in the Tauri main webview context (has access to Image/Canvas DOM APIs).
 * Coordinates are relative to the image's natural (full-resolution) dimensions.
 *
 * @param dataUrl - Source image as a data URL
 * @param x - Left edge of crop area (px)
 * @param y - Top edge of crop area (px)
 * @param width - Width of crop area (px)
 * @param height - Height of crop area (px)
 * @returns Cropped image as a data URL
 */
export function cropImageData(
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to create canvas 2d context'));
          return;
        }
        ctx.drawImage(
          img,
          Math.round(x), Math.round(y), Math.round(width), Math.round(height),
          0, 0, Math.round(width), Math.round(height),
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image crop failed'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = dataUrl;
  });
}

/**
 * Capture a specific rectangular area of the webview content.
 *
 * Captures the full visible viewport via html2canvas, then crops to the
 * requested region. Coordinates are in image-space pixels (matching the
 * webview's CSS pixel dimensions).
 *
 * @param x - Left offset in CSS pixels
 * @param y - Top offset in CSS pixels
 * @param width - Width of area in CSS pixels
 * @param height - Height of area in CSS pixels
 * @returns Promise resolving to a cropped data URL
 *
 * @example
 * // Capture a 400×300 region starting at (100, 50)
 * const cropped = await captureWebviewArea(100, 50, 400, 300);
 */
export async function captureWebviewArea(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string> {
  const fullScreenshot = await captureWebviewScreenshot();
  return cropImageData(fullScreenshot, x, y, width, height);
}
