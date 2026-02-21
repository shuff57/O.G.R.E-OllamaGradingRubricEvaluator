/**
 * page-refresh.ts - Extracted, testable refresh logic for live-refresh feature
 *
 * Pure TypeScript functions for detecting profile changes, checking saved sessions,
 * resetting batch state, and creating debounced refresh handlers.
 *
 * No Svelte imports, no Tauri event listeners, no UI rendering.
 */

import type { SiteProfile } from './batch-grader';
import type { BatchGradingHandle } from './grading-api';
import { ProfileStorageImpl } from './site-profiles';
import { getBatchSession } from './db';

// ============================================================================
// Type Definitions
// ============================================================================

/** Result of page refresh detection. */
export interface RefreshPageDataResult {
  /** Detected site profile for the URL, or null if no match */
  detectedProfile: SiteProfile | null;
  /** Last graded student name from saved session, or null if none */
  savedSessionStudent: string | null;
  /** The page URL that was checked */
  pageUrl: string;
}

/** Complete batch state reset object. */
export interface BatchResetState {
  batchPhase: 'idle';
  batchProgress: null;
  batchLog: never[];
  extractedRubric: null;
  rubricText: string;
  phaseMessage: string;
  batchError: string;
  batchGrader: null;
  batchHandle: null;
  isBatchRunning: false;
  isBatchPaused: false;
  currentStudentName: string;
  resumeAfter: string;
  sourceRubricId: null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect profile and check for saved session on a URL.
 *
 * Wraps each operation (profile detection, session lookup) in separate try/catch
 * for graceful fallback to null on any error.
 *
 * @param url - Page URL to check
 * @returns Profile detection + session check results
 */
export async function refreshPageData(url: string): Promise<RefreshPageDataResult> {
  let detectedProfile: SiteProfile | null = null;
  let savedSessionStudent: string | null = null;

  // Try to detect profile
  try {
    const storage = new ProfileStorageImpl();
    const profiles = await storage.findProfilesByUrl(url);
    detectedProfile = profiles.length > 0 ? profiles[0] : null;
  } catch {
    // Graceful fallback: no profile detected
    detectedProfile = null;
  }

  // Try to check for saved session
  try {
    const session = await getBatchSession(url);
    savedSessionStudent = session?.last_student_name ?? null;
  } catch {
    // Graceful fallback: no saved session
    savedSessionStudent = null;
  }

  return {
    detectedProfile,
    savedSessionStudent,
    pageUrl: url,
  };
}

/**
 * Build default batch state object for reset.
 *
 * Returns all batch state fields with their initial values.
 * Used when page changes or batch is manually stopped.
 *
 * @returns Complete batch reset state
 */
export function buildBatchResetState(): BatchResetState {
  return {
    batchPhase: 'idle',
    batchProgress: null,
    batchLog: [],
    extractedRubric: null,
    rubricText: '',
    phaseMessage: '',
    batchError: '',
    batchGrader: null,
    batchHandle: null,
    isBatchRunning: false,
    isBatchPaused: false,
    currentStudentName: '',
    resumeAfter: '',
    sourceRubricId: null,
  };
}

/**
 * Safely stop an active batch: cancel SSE handle, stop grader, clear buffer.
 *
 * Each operation is independent and safe to call even if the value is null.
 * The pausedResultBuffer is cleared in-place using splice(0).
 *
 * @param batchHandle - SSE handle from startBatchGrading, or null
 * @param batchGrader - BatchGrader instance, or null
 * @param pausedResultBuffer - Array of paused results to clear
 */
export function stopActiveBatch(
  batchHandle: BatchGradingHandle | null,
  batchGrader: { stop(): void } | null,
  pausedResultBuffer: unknown[]
): void {
  // Cancel SSE handle if active
  if (batchHandle) {
    batchHandle.cancel();
  }

  // Stop grader if active
  if (batchGrader) {
    batchGrader.stop();
  }

  // Clear paused result buffer in-place
  pausedResultBuffer.splice(0);
}

/**
 * Create a debounced version of a refresh handler.
 *
 * Cancels pending calls if the function is invoked again before the delay expires.
 * Default delay is 300ms.
 *
 * @param handler - Function to debounce (receives URL as parameter)
 * @param delayMs - Delay in milliseconds (default: 300)
 * @returns Debounced function
 */
export function createDebouncedRefresh(
  handler: (url: string) => void,
  delayMs: number = 300
): (url: string) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (url: string) => {
    // Cancel pending call if any
    if (timer !== null) {
      clearTimeout(timer);
    }

    // Schedule new call
    timer = setTimeout(() => {
      handler(url);
      timer = null;
    }, delayMs);
  };
}
