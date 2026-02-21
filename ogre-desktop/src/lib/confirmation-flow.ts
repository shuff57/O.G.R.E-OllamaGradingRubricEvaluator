/**
 * Confirmation flow state machine for batch/sequential discovery.
 *
 * Walks the user through each required selector, letting them accept or refine.
 * Pure TypeScript — no DOM, no Svelte, no browser imports.
 */

import type { SelectorMap, ValidationResults, NavigationMode } from './discover';

// Re-export SelectorKey so tests can import it from here or from discover
export type SelectorKey = keyof SelectorMap;

// ── Public Types ────────────────────────────────────────────────────────────

/** Phase of the confirmation flow. */
export type ConfirmationPhase = 'pending' | 'confirming' | 'complete' | 'cancelled';

/** State for the current confirmation step. */
export interface ConfirmationStepState {
  /** Which selector field (e.g. 'studentName'). */
  key: SelectorKey;
  /** CSS selector string, or null if not detected. */
  selector: string | null;
  /** Number of DOM matches from validation. */
  matchCount: number;
  /** Sample text from validation. */
  sampleText: string;
  /** 0-based current step index. */
  stepIndex: number;
  /** Total steps in the flow. */
  totalSteps: number;
}

/** The confirmation flow object. */
export interface ConfirmationFlow {
  /** Accept current selector as-is and advance. */
  accept(): void;
  /** Replace current selector with newSelector and advance. */
  refine(newSelector: string): void;
  /** Cancel the entire flow. */
  cancel(): void;
  /** Go back to the previous step. */
  back(): void;
  /** Current step state, or null when complete/cancelled. */
  getState(): ConfirmationStepState | null;
  /** Map of selectors that have been confirmed so far. */
  getConfirmedSelectors(): Partial<SelectorMap>;
  /** Current phase of the flow. */
  readonly phase: ConfirmationPhase;
}

// ── Required Keys ───────────────────────────────────────────────────────────

const BATCH_REQUIRED: SelectorKey[] = ['studentSection', 'studentName', 'scoreInput'];
const SEQUENTIAL_REQUIRED: SelectorKey[] = ['studentName', 'scoreInput'];

/**
 * Returns the required selector keys for the given navigation mode.
 * feedbackBox and other optional selectors are never included.
 */
export function getRequiredSelectorKeys(mode: 'batch' | 'sequential'): SelectorKey[] {
  return mode === 'batch' ? [...BATCH_REQUIRED] : [...SEQUENTIAL_REQUIRED];
}

// ── Flow Factory ────────────────────────────────────────────────────────────

/**
 * Creates a new confirmation flow that walks through each required selector.
 *
 * Keys whose value in `selectors` is null are auto-skipped (they won't become
 * a confirmation step). After all steps are accepted/refined, phase becomes
 * `'complete'`.
 */
export function createConfirmationFlow(
  selectors: SelectorMap,
  validation: ValidationResults,
  mode: NavigationMode,
): ConfirmationFlow {
  // Build the step list: only required keys that have a non-null selector value
  const requiredKeys = getRequiredSelectorKeys(mode);
  const steps: SelectorKey[] = requiredKeys.filter((k) => selectors[k] != null);

  // Internal mutable state
  let phase: ConfirmationPhase = steps.length > 0 ? 'confirming' : 'complete';
  let currentIndex = 0;
  const confirmed: Partial<SelectorMap> = {};

  // ── Helpers ─────────────────────────────────────────────────────────────

  function isTerminal(): boolean {
    return phase === 'complete' || phase === 'cancelled';
  }

  function buildStepState(index: number): ConfirmationStepState {
    const key = steps[index];
    const selectorValue = (selectors[key] as string | null) ?? null;
    const val = validation[key];
    return {
      key,
      selector: selectorValue,
      matchCount: val?.matchCount ?? 0,
      sampleText: val?.sampleText ?? '',
      stepIndex: index,
      totalSteps: steps.length,
    };
  }

  function advance(): void {
    currentIndex++;
    if (currentIndex >= steps.length) {
      phase = 'complete';
    }
  }

  // ── Flow Object ─────────────────────────────────────────────────────────

  const flow: ConfirmationFlow = {
    get phase() {
      return phase;
    },

    accept() {
      if (isTerminal()) return;
      const key = steps[currentIndex];
      confirmed[key] = selectors[key] as string;
      advance();
    },

    refine(newSelector: string) {
      if (isTerminal()) return;
      const key = steps[currentIndex];
      confirmed[key] = newSelector;
      advance();
    },

    cancel() {
      if (isTerminal()) return;
      phase = 'cancelled';
    },

    back() {
      if (isTerminal()) return;
      if (currentIndex > 0) {
        currentIndex--;
        // Remove the previously confirmed value so it can be re-confirmed
        const key = steps[currentIndex];
        delete confirmed[key];
      }
    },

    getState() {
      if (isTerminal()) return null;
      return buildStepState(currentIndex);
    },

    getConfirmedSelectors() {
      return { ...confirmed };
    },
  };

  return flow;
}
