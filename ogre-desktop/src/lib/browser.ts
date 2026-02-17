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

/** Common grading site presets */
export const GRADING_SITE_PRESETS = [
  { name: 'MyOpenMath', url: 'https://www.myopenmath.com/' },
  { name: 'Canvas', url: 'https://canvas.instructure.com/' },
  { name: 'Blackboard', url: 'https://blackboard.com/' },
  { name: 'Moodle', url: 'https://moodle.org/' },
];
