import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type BrowserStatus = 'closed' | 'open' | 'error';

/**
 * Open the browser window to a given URL.
 * If already open, navigates + focuses the existing window.
 */
export async function openBrowser(url: string): Promise<void> {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  await invoke('open_browser_window', { url: normalized });
}

/**
 * Navigate the existing browser window to a new URL.
 */
export async function navigateBrowser(url: string): Promise<void> {
  await invoke('navigate_browser', { url });
}

/**
 * Get the current URL of the browser window.
 */
export async function getBrowserUrl(): Promise<string> {
  return await invoke('get_browser_url');
}

/**
 * Close the browser window.
 */
export async function closeBrowser(): Promise<void> {
  await invoke('close_browser');
}

/**
 * Listen for browser status changes emitted from the Rust backend.
 */
export function listenBrowserStatus(callback: (status: BrowserStatus) => void) {
  return listen<string>('browser-status', (event) => {
    callback(event.payload as BrowserStatus);
  });
}

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

/** Common grading site presets */
export const GRADING_SITE_PRESETS = [
  { name: 'MyOpenMath', url: 'https://www.myopenmath.com/' },
  { name: 'Canvas', url: 'https://canvas.instructure.com/' },
  { name: 'Blackboard', url: 'https://blackboard.com/' },
  { name: 'Moodle', url: 'https://moodle.org/' },
];
