/**
 * webview-lifecycle.test.ts - TDD tests for webview lifecycle utilities
 *
 * Pure TypeScript utilities for managing webview layout timing and lifecycle.
 * No DOM access, no Tauri imports — just pure TypeScript.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldTriggerSidebarAnimation,
  calculatePostAnimationDelay,
  createDestroyGuard,
  scheduleBoundsUpdateAfterAnimation,
} from './webview-lifecycle';

describe('webview-lifecycle.ts — shouldTriggerSidebarAnimation()', () => {
  // ── Test 1: browserCreated = true should return true ──
  it('Test 1: browserCreated = true → returns true (webview exists on mount)', () => {
    const result = shouldTriggerSidebarAnimation(true);
    expect(result).toBe(true);
  });

  // ── Test 2: browserCreated = false should return false ──
  it('Test 2: browserCreated = false → returns false (new webview being created)', () => {
    const result = shouldTriggerSidebarAnimation(false);
    expect(result).toBe(false);
  });
});

describe('webview-lifecycle.ts — calculatePostAnimationDelay()', () => {
  // ── Test 3: Just navigated (0ms elapsed) ──
  it('Test 3: elapsedSinceNavigate = 0 → returns full transition time (300)', () => {
    const result = calculatePostAnimationDelay(300, 0);
    expect(result).toBe(300);
  });

  // ── Test 4: Halfway through animation (150ms elapsed) ──
  it('Test 4: elapsedSinceNavigate = 150 → returns remaining time (150)', () => {
    const result = calculatePostAnimationDelay(300, 150);
    expect(result).toBe(150);
  });

  // ── Test 5: Animation already finished (400ms elapsed) ──
  it('Test 5: elapsedSinceNavigate > transition → returns 0 (already done)', () => {
    const result = calculatePostAnimationDelay(300, 400);
    expect(result).toBe(0);
  });
});

describe('webview-lifecycle.ts — createDestroyGuard()', () => {
  // ── Test 6: Initial state ──
  it('Test 6: Initial state → destroyed is false', () => {
    const guard = createDestroyGuard();
    expect(guard.destroyed).toBe(false);
  });

  // ── Test 7: After markDestroyed ──
  it('Test 7: After markDestroyed() → destroyed is true', () => {
    const guard = createDestroyGuard();
    guard.markDestroyed();
    expect(guard.destroyed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task 2: scheduleBoundsUpdateAfterAnimation tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('webview-lifecycle.ts — scheduleBoundsUpdateAfterAnimation()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 8: Returns a cleanup function ──
  it('Test 8: Calling function returns a cleanup function', () => {
    const guard = { destroyed: false };
    const updateFn = vi.fn();
    const cleanup = scheduleBoundsUpdateAfterAnimation({
      sidebarTransitionMs: 300,
      updateFn,
      guard,
    });
    expect(typeof cleanup).toBe('function');
  });

  // ── Test 9: After sidebarTransitionMs, updateFn is called ──
  it('Test 9: After sidebarTransitionMs elapses → updateFn is called', () => {
    const guard = { destroyed: false };
    const updateFn = vi.fn();
    scheduleBoundsUpdateAfterAnimation({
      sidebarTransitionMs: 300,
      updateFn,
      guard,
    });
    vi.advanceTimersByTime(300);
    expect(updateFn).toHaveBeenCalledTimes(1);
  });

  // ── Test 10: If guard.destroyed is true, updateFn NOT called ──
  it('Test 10: If guard.destroyed = true → updateFn NOT called', () => {
    const guard = { destroyed: true }; // Already destroyed
    const updateFn = vi.fn();
    scheduleBoundsUpdateAfterAnimation({
      sidebarTransitionMs: 300,
      updateFn,
      guard,
    });
    vi.advanceTimersByTime(300);
    expect(updateFn).not.toHaveBeenCalled();
  });

  // ── Test 11: Cleanup function prevents updateFn ──
  it('Test 11: Calling cleanup before timeout → updateFn NOT called', () => {
    const guard = { destroyed: false };
    const updateFn = vi.fn();
    const cleanup = scheduleBoundsUpdateAfterAnimation({
      sidebarTransitionMs: 300,
      updateFn,
      guard,
    });
    // Cancel before timeout
    cleanup();
    vi.advanceTimersByTime(300);
    expect(updateFn).not.toHaveBeenCalled();
  });

  // ── Test 12: sidebarTransitionMs = 0 calls immediately ──
  it('Test 12: sidebarTransitionMs = 0 → updateFn called immediately', () => {
    const guard = { destroyed: false };
    const updateFn = vi.fn();
    scheduleBoundsUpdateAfterAnimation({
      sidebarTransitionMs: 0,
      updateFn,
      guard,
    });
    // With 0ms, should call on next tick
    vi.advanceTimersByTime(0);
    expect(updateFn).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task 3: createDestroyGuard onDestroy tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('webview-lifecycle.ts — createDestroyGuard() onDestroy', () => {
  // ── Test 13: onDestroy calls all provided callbacks ──
  it('Test 13: onDestroy calls all provided callbacks', () => {
    const guard = createDestroyGuard();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    guard.onDestroy([cb1, cb2]);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  // ── Test 14: onDestroy sets destroyed to true ──
  it('Test 14: onDestroy sets destroyed to true', () => {
    const guard = createDestroyGuard();
    guard.onDestroy([]);
    expect(guard.destroyed).toBe(true);
  });

  // ── Test 15: onDestroy is idempotent ──
  it('Test 15: onDestroy is idempotent → safe to call multiple times', () => {
    const guard = createDestroyGuard();
    const cb = vi.fn();
    // Call multiple times
    guard.onDestroy([cb]);
    guard.onDestroy([cb]);
    guard.onDestroy([cb]);
    // Should only call once (first call sets destroyed=true, subsequent calls skip)
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ── Test 16: Empty callback array doesn't throw ──
  it('Test 16: Empty callback array → does not throw', () => {
    const guard = createDestroyGuard();
    expect(() => guard.onDestroy([])).not.toThrow();
  });
});
