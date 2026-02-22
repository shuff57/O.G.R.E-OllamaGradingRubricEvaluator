/**
 * webview-layout.test.ts - TDD tests for Tauri webview bounds calculation
 *
 * Pure TypeScript utility for calculating webview bounds based on layout dimensions.
 * No DOM access, no Tauri imports — just math.
 */

import { describe, it, expect } from 'vitest';
import { calculateWebviewBounds, type WebviewBounds } from './webview-layout';

describe('webview-layout.ts — calculateWebviewBounds()', () => {
  // ── Test 1: Basic bounds with no panel (full width minus sidebar) ──
  it('Test 1: Basic bounds with no panel — width = windowWidth - sidebarWidth', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      windowWidth: 1280,
      windowHeight: 720,
    });

    expect(result).toEqual({
      x: 60,
      y: 50,
      width: 1220, // 1280 - 60
      height: 670, // 720 - 50
    });
  });

  // ── Test 2: Bounds with a panel (panelWidth reduces webview width) ──
  it('Test 2: With panel — width = windowWidth - sidebarWidth - panelWidth', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      panelWidth: 300,
      windowWidth: 1280,
      windowHeight: 720,
    });

    expect(result).toEqual({
      x: 60,
      y: 50,
      width: 920, // 1280 - 60 - 300
      height: 670, // 720 - 50
    });
  });

  // ── Test 3: Bounds with extraTopOffset (increases y, reduces height) ──
  it('Test 3: With extraTopOffset — y increases, height decreases', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      windowWidth: 1280,
      windowHeight: 720,
      extraTopOffset: 40, // e.g., presets panel height
    });

    expect(result).toEqual({
      x: 60,
      y: 90, // 50 + 40
      width: 1220, // 1280 - 60
      height: 630, // 720 - 90
    });
  });

  // ── Test 4: Zero-guard — when windowWidth < sidebarWidth, width returns 0 ──
  it('Test 4: Zero-guard — windowWidth < sidebarWidth → width = 0', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 100,
      navBarHeight: 50,
      windowWidth: 80, // Less than sidebar
      windowHeight: 720,
    });

    expect(result.width).toBe(0);
    expect(result.height).toBe(670); // 720 - 50
  });

  // ── Test 5: Zero-guard — when windowHeight < navBarHeight, height returns 0 ──
  it('Test 5: Zero-guard — windowHeight < navBarHeight → height = 0', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 100,
      windowWidth: 1280,
      windowHeight: 80, // Less than navBar
    });

    expect(result.height).toBe(0);
    expect(result.width).toBe(1220); // 1280 - 60
  });

  // ── Test 6: Large window sizes ──
  it('Test 6: Large window sizes — calculation works at scale', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 250,
      navBarHeight: 80,
      panelWidth: 400,
      windowWidth: 3840, // 4K width
      windowHeight: 2160, // 4K height
    });

    expect(result).toEqual({
      x: 250,
      y: 80,
      width: 3190, // 3840 - 250 - 400
      height: 2080, // 2160 - 80
    });
  });

  // ── Test 7: All parameters combined ──
  it('Test 7: All parameters combined — sidebar + panel + extraTopOffset', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      panelWidth: 300,
      windowWidth: 1280,
      windowHeight: 720,
      extraTopOffset: 40,
    });

    expect(result).toEqual({
      x: 60,
      y: 90, // 50 + 40
      width: 920, // 1280 - 60 - 300
      height: 630, // 720 - 90
    });
  });

  // ── Test 8: Zero panel width (optional parameter) ──
  it('Test 8: panelWidth = 0 (optional) — treated as no panel', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      panelWidth: 0,
      windowWidth: 1280,
      windowHeight: 720,
    });

    expect(result).toEqual({
      x: 60,
      y: 50,
      width: 1220, // 1280 - 60 - 0
      height: 670, // 720 - 50
    });
  });

  // ── Test 9: Zero extraTopOffset (optional parameter) ──
  it('Test 9: extraTopOffset = 0 (optional) — treated as no offset', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      windowWidth: 1280,
      windowHeight: 720,
      extraTopOffset: 0,
    });

    expect(result).toEqual({
      x: 60,
      y: 50, // 50 + 0
      width: 1220,
      height: 670, // 720 - 50
    });
  });

  // ── Test 10: Verify return type is WebviewBounds ──
  it('Test 10: Return type is WebviewBounds with all required properties', () => {
    const result = calculateWebviewBounds({
      sidebarWidth: 60,
      navBarHeight: 50,
      windowWidth: 1280,
      windowHeight: 720,
    });

    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');

    expect(typeof result.x).toBe('number');
    expect(typeof result.y).toBe('number');
    expect(typeof result.width).toBe('number');
    expect(typeof result.height).toBe('number');
  });
});
