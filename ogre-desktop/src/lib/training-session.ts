/**
 * training-session.ts — State machine types and helpers for the Discover/Training session.
 *
 * Provides TrainingPhase, TrainingSession, createTrainingSession, canSaveTraining,
 * and isSaveSignal. System prompt assembly has moved to runtime-harness.ts
 * (buildHarness with mode: 'discover').
 *
 * A TrainingSession walks through 4 user-visible phases:
 *   idle → perception → dialogue → test → synthesizing → saved
 *
 * The session is ephemeral (not persisted) — corrections are saved to SQLite
 * at the end via appendLearnedCorrections().
 */

import type { ChatMessage } from './discovery-intent';
import type { LearnedCorrection } from './site-guide-types';

// ── Phase ────────────────────────────────────────────────────────────────

export type TrainingPhase =
  | 'idle'          // Not started
  | 'perception'    // Agent is analyzing the DOM
  | 'dialogue'      // Free-text Q&A loop
  | 'test'          // Agent proposes a live test action
  | 'synthesizing'  // AI call converting conversation → corrections
  | 'saved'         // Corrections written to DB
  | 'error';        // Something went wrong

// ── State ────────────────────────────────────────────────────────────────

export interface TrainingSession {
  phase: TrainingPhase;
  messages: ChatMessage[];
  /** Confirmed corrections ready to save (≥1 enables "Save Training" button) */
  pendingCorrections: LearnedCorrection[];
  /** If the agent proposed a test action, this holds the description */
  proposedTestAction: string | null;
  /** Any error message */
  error: string | null;
  /** The skill ID to save corrections to (resolved when session starts) */
  skillId: string | null;
  /** Human-readable site name for UI display */
  siteName: string | null;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createTrainingSession(): TrainingSession {
  return {
    phase: 'idle',
    messages: [],
    pendingCorrections: [],
    proposedTestAction: null,
    error: null,
    skillId: null,
    siteName: null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** True if the training session has at least one confirmed correction ready to save. */
export function canSaveTraining(session: TrainingSession): boolean {
  return session.pendingCorrections.length > 0 ||
    session.messages.some(m => m.role === 'assistant' && m.content.includes('**Proposed selectors:**'));
}

/** True if the user's message looks like "save" or "done". */
export function isSaveSignal(message: string): boolean {
  return /^\s*(save|done|finish|looks good|that'?s? good|perfect)\s*\.?\s*$/i.test(message.trim());
}
