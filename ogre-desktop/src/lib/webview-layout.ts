/**
 * webview-layout.ts - Pure TypeScript utility for calculating Tauri webview bounds
 *
 * This module provides a pure function to calculate webview bounds based on layout dimensions.
 * No DOM access, no Tauri imports — just math.
 *
 * Used by:
 * - Browser.svelte (Task 7) — calculates bounds for the embedded webview
 * - SiteProfiles.svelte (Task 6) — calculates bounds for preview webview
 */

/**
 * Represents the bounds of a webview (position and size)
 */
export interface WebviewBounds {
  /** X coordinate (left edge) */
  x: number;
  /** Y coordinate (top edge) */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Parameters for calculating webview bounds
 */
export interface CalculateWebviewBoundsParams {
  /** Width of the sidebar in pixels */
  sidebarWidth: number;
  /** Height of the navigation bar in pixels */
  navBarHeight: number;
  /** Width of the right panel (optional, defaults to 0) */
  panelWidth?: number;
  /** Total window width in pixels */
  windowWidth: number;
  /** Total window height in pixels */
  windowHeight: number;
  /** Additional top offset (e.g., presets panel height, optional, defaults to 0) */
  extraTopOffset?: number;
}

/**
 * Calculate webview bounds based on layout dimensions
 *
 * Extracts the math logic from Browser.svelte:70-99, parameterizing the DOM-queried values.
 * The webview is positioned to the right of the sidebar, below the nav bar and any extra top elements,
 * and to the left of any right panel.
 *
 * @param params - Layout dimensions
 * @returns WebviewBounds with x, y, width, height
 *
 * @example
 * ```typescript
 * const bounds = calculateWebviewBounds({
 *   sidebarWidth: 60,
 *   navBarHeight: 50,
 *   panelWidth: 300,
 *   windowWidth: 1280,
 *   windowHeight: 720,
 *   extraTopOffset: 40,
 * });
 * // Returns: { x: 60, y: 90, width: 920, height: 630 }
 * ```
 */
export function calculateWebviewBounds(params: CalculateWebviewBoundsParams): WebviewBounds {
  const {
    sidebarWidth,
    navBarHeight,
    panelWidth = 0,
    windowWidth,
    windowHeight,
    extraTopOffset = 0,
  } = params;

  // Calculate position
  const x = sidebarWidth;
  const y = navBarHeight + extraTopOffset;

  // Calculate size with zero-guards to prevent negative dimensions
  const width = Math.max(0, windowWidth - sidebarWidth - panelWidth);
  const height = Math.max(0, windowHeight - y);

  return { x, y, width, height };
}
