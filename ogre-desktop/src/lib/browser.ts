import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { generateAutoFillScript } from './autofill';

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
  return await invoke<string>('eval_webview_script', { script });
}

/**
 * Execute JavaScript and automatically parse JSON result.
 * Convenience wrapper around evalScript() that handles JSON parsing.
 * 
 * @param script - JavaScript expression to evaluate
 * @returns Promise resolving to the parsed JavaScript value
 * 
 * @example
 * // Extract student data as typed object
 * interface Student {
 *   id: string;
 *   name: string;
 *   score?: number;
 * }
 * 
 * const students = await evalScriptJSON<Student[]>(`
 *   [...document.querySelectorAll('.student-row')].map(row => ({
 *     id: row.dataset.studentId,
 *     name: row.querySelector('.name')?.textContent,
 *     score: parseFloat(row.querySelector('.score')?.value || '0')
 *   }))
 * `);
 */
export async function evalScriptJSON<T = any>(script: string): Promise<T> {
  const result = await evalScript(script);
  return JSON.parse(result);
}

/** Common grading site presets */
export const GRADING_SITE_PRESETS = [
  { name: 'MyOpenMath', url: 'https://www.myopenmath.com/' },
  { name: 'Canvas', url: 'https://canvas.instructure.com/' },
  { name: 'Blackboard', url: 'https://blackboard.com/' },
  { name: 'Moodle', url: 'https://moodle.org/' },
];
