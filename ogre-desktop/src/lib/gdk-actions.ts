/**
 * gdk-actions.ts — GDK event injection for Linux embedded browser.
 *
 * Provides CDP-equivalent input simulation using native GDK events via Tauri.
 * Only functional on Linux with the embedded wry WebView.
 *
 * API surface mirrors cdp-actions.ts so browser-actions.ts can dispatch
 * to GDK as a middle tier: CDP (Windows) → GDK (Linux) → evalScript (fallback).
 */

import { invoke } from '@tauri-apps/api/core';
import type { ActionResult } from './agent-types';
import { evalScriptJSON } from './browser';

// ============================================================================
// Tab Management
// ============================================================================

let _activeTabId = 'default';

/** Set the active tab for GDK commands. Must match the tab_id in Rust state. */
export function setGdkActiveTab(tabId: string): void {
  _activeTabId = tabId;
}

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Returns true when running on Linux inside the Tauri app.
 * Returns false in tests (TAURI_ENV_PLATFORM is not set) or on non-Linux.
 */
export function isGdkAvailable(): boolean {
  // In the Tauri app, window.__TAURI_INTERNALS__ is defined.
  // We detect Linux via navigator.platform or Tauri's OS plugin.
  // For now, check if we're in Tauri at all AND not in test environment.
  if (typeof window === 'undefined') return false;
  const w = window as Window & { __TAURI_INTERNALS__?: unknown };
  if (!w.__TAURI_INTERNALS__) return false;
  // Check navigator.platform for Linux
  const nav = navigator as Navigator & { platform: string };
  return nav.platform.toLowerCase().includes('linux');
}

// ============================================================================
// Coordinate Resolution
// ============================================================================

interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve a CSS selector to the center coordinates of the first matching element.
 * Returns null if element not found.
 */
async function resolveElementCenter(
  selector: string
): Promise<{ x: number; y: number } | null> {
  const rect = await evalScriptJSON<ElementRect | null>(`
    (function() {
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
    })()
  `);
  return rect ? { x: rect.x, y: rect.y } : null;
}

// ============================================================================
// GDK Key Mapping
// ============================================================================

// GDK keyval constants for special keys (from gdk::keys::constants in Rust).
// These values come from the X11 keysym table (GDK uses X11 keysyms as keyvals).
const GDK_KEYVAL: Record<string, number> = {
  Enter:     0xff0d,  // GDK_Return
  Return:    0xff0d,
  Tab:       0xff09,  // GDK_Tab
  Escape:    0xff1b,  // GDK_Escape
  Backspace: 0xff08,  // GDK_BackSpace
  Delete:    0xffff,  // GDK_Delete
  ArrowUp:   0xff52,  // GDK_Up
  ArrowDown: 0xff54,  // GDK_Down
  ArrowLeft: 0xff51,  // GDK_Left
  ArrowRight:0xff53,  // GDK_Right
  Home:      0xff50,  // GDK_Home
  End:       0xff57,  // GDK_End
  PageUp:    0xff55,  // GDK_Page_Up
  PageDown:  0xff56,  // GDK_Page_Down
  Space:     0x0020,  // GDK_space
  ' ':       0x0020,
};

/**
 * Map a W3C key name to a GDK keyval (u32).
 * For single characters, use their Unicode codepoint (same as GDK for ASCII).
 */
function keyNameToGdkKeyval(key: string): number | null {
  if (key in GDK_KEYVAL) return GDK_KEYVAL[key];
  if (key.length === 1) return key.charCodeAt(0);
  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Click an element via GDK mouse event injection.
 *
 * 1. Resolves selector → bounding rect via evalScript
 * 2. Calculates center coordinates
 * 3. Invokes simulate_mouse_event Tauri command
 */
export async function gdkClick(selector: string): Promise<ActionResult> {
  try {
    const center = await resolveElementCenter(selector);
    if (!center) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    await invoke<void>('simulate_mouse_event', {
      tabId: _activeTabId,
      eventType: 'click',
      x: center.x,
      y: center.y,
      button: 1,
      modifiers: 0,
    });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Type text into an element via GDK key events.
 *
 * 1. Clicks element to focus (via gdkClick)
 * 2. Optionally clears existing value via evalScript
 * 3. Invokes simulate_text_input for the string
 */
export async function gdkType(
  selector: string,
  text: string,
  clear?: boolean
): Promise<ActionResult> {
  try {
    const clickResult = await gdkClick(selector);
    if (!clickResult.success) return clickResult;

    if (clear) {
      await evalScriptJSON<unknown>(`
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (el && 'value' in el) { el.value = ''; }
        })()
      `);
    }

    await invoke<void>('simulate_text_input', {
      tabId: _activeTabId,
      text,
    });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Press a special key via GDK key event.
 * Maps W3C key names (Enter, Tab, Escape, Arrow*, etc.) to GDK keyvals.
 */
export async function gdkPressKey(key: string): Promise<ActionResult> {
  try {
    const keyval = keyNameToGdkKeyval(key);
    if (keyval === null) {
      return { success: false, error: `Unknown key: ${key}` };
    }
    await invoke<void>('simulate_key_event', {
      tabId: _activeTabId,
      eventType: 'keypress',
      keyVal: keyval,
      modifiers: 0,
    });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Scroll via evalScript (scroll doesn't require isTrusted).
 * GDK method signature required for dispatcher compatibility.
 */
export async function gdkScroll(
  direction: string,
  amount: number
): Promise<ActionResult> {
  try {
    const script =
      direction === 'up' ? `window.scrollBy(0, -${amount * 100})` :
      direction === 'down' ? `window.scrollBy(0, ${amount * 100})` :
      direction === 'left' ? `window.scrollBy(-${amount * 100}, 0)` :
      direction === 'right' ? `window.scrollBy(${amount * 100}, 0)` :
      `window.scrollBy(0, ${amount * 100})`;
    await evalScriptJSON<unknown>(script);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
