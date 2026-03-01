/**
 * webview-lifecycle.ts - Pure TypeScript utilities for webview layout timing and lifecycle management
 *
 * This module provides pure functions for managing the webview layout lifecycle,
 * including sidebar animation timing, post-animation delays, and component destroy guards.
 * No DOM access, no Tauri imports, no Svelte — just pure TypeScript.
 *
 * Used by:
 * - Browser.svelte — managing webview bounds on tab switch
 * - App.svelte — coordinating show/hide during navigation
 */

/**
 * Determines whether the sidebar animation tracking should be triggered on component mount.
 *
 * When returning to the Browser tab, the ogre:sidebar-changed event may be lost
 * because the event fires before the new Browser component registers its listener.
 * This function indicates whether we need to self-trigger the animation tracking.
 *
 * @param browserCreated - Whether the webview already exists (was not destroyed)
 * @returns true if sidebar animation should be triggered
 */
export function shouldTriggerSidebarAnimation(browserCreated: boolean): boolean {
  return browserCreated;
}

/**
 * Calculates the remaining delay needed to wait for a sidebar CSS animation to complete.
 *
 * @param sidebarTransitionMs - Duration of the sidebar CSS transition in ms (e.g., 300)
 * @param elapsedSinceNavigate - Milliseconds elapsed since navigation began
 * @returns Remaining delay in ms (0 if animation already finished)
 */
export function calculatePostAnimationDelay(
  sidebarTransitionMs: number,
  elapsedSinceNavigate: number
): number {
  return Math.max(0, sidebarTransitionMs - elapsedSinceNavigate);
}

/**
 * Creates a destroy guard for handling component destruction during async operations.
 *
 * When a user rapidly switches tabs, the Browser component may be destroyed
 * while an async onMount is still in flight. This guard prevents
 * post-destruction side effects from running.
 *
 * @returns Destroy guard with destroyed state, markDestroyed method, and onDestroy method
 */
export function createDestroyGuard(): {
  destroyed: boolean;
  markDestroyed: () => void;
  onDestroy: (callbacks: Array<() => void>) => void;
} {
  const guard = {
    destroyed: false,
    markDestroyed() {
      guard.destroyed = true;
    },
    onDestroy(callbacks: Array<() => void>) {
      if (guard.destroyed) return;
      guard.destroyed = true;
      for (const cb of callbacks) cb();
    },
  };
  return guard;
}

/**
 * Options for scheduling a bounds update after sidebar animation completes.
 */
export interface ScheduleBoundsUpdateOptions {
  /** Duration of the sidebar CSS transition in ms */
  sidebarTransitionMs: number;
  /** Function to call after the delay */
  updateFn: () => void;
  /** Destroy guard to check before calling updateFn */
  guard: { destroyed: boolean };
}

/**
 * Schedules a bounds update to run after the sidebar animation completes.
 *
 * Uses setTimeout (not RAF) because we need the FINAL position after animation,
 * not intermediate frames during animation.
 *
 * @param opts - Scheduling options
 * @returns Cleanup function to cancel the scheduled update
 */
export function scheduleBoundsUpdateAfterAnimation(
  opts: ScheduleBoundsUpdateOptions
): () => void {
  const { sidebarTransitionMs, updateFn, guard } = opts;
  const id = setTimeout(() => {
    if (!guard.destroyed) updateFn();
  }, sidebarTransitionMs);
  return () => clearTimeout(id);
}
