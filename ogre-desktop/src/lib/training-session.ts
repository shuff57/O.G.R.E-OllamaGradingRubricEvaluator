/**
 * training-session.ts — Agent Training session state machine.
 *
 * A TrainingSession walks through 4 user-visible phases:
 *   idle → perception → dialogue → test → synthesizing → saved
 *
 * The agent:
 *  1. Captures the live DOM and reports its understanding (perception)
 *  2. Engages in free-text Q&A with the user (dialogue)
 *  3. Proposes and executes a live test action with user approval (test)
 *  4. Conversation is synthesized into corrections and saved (synthesizing → saved)
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

// ── System Prompt ─────────────────────────────────────────────────────────

export const TRAINING_SYSTEM_PROMPT = `You are an Agent Training assistant for O.G.R.E., an AI-powered grading tool.

Your ONLY purpose is to help calibrate how the AI agent interacts with the current grading page.
This is NOT about workflow automation — it is about reliable DOM interaction:
which elements to click, how to find score inputs, how to target feedback fields.

## Your job in this conversation

1. PERCEPTION: Start by reporting what you observe on the page:
   - What type of grading page is this? (LMS name, grading tool)
   - How are student sections structured?
   - What selectors would you use for: score inputs, feedback fields, student name, save button
   - What are you uncertain about?
   Use this format:

   **Page type:** [description]
   **Student structure:** [description]
   **Proposed selectors:**
   - score_input: [selector]
   - feedback_box: [selector]
   - student_name: [selector]
   - save_button: [selector]
   **Uncertainties:** [list any]

2. DIALOGUE: After your perception report, ask the user if your understanding is correct.
   Accept corrections in plain English. If the user corrects a selector, confirm you understand.
   Keep responses short. Stay focused on DOM interactions only.

3. TEST: Once you have at least one confirmed insight, propose ONE test action:
   "I'd like to test: [action description]. May I proceed?"
   Wait for user confirmation before executing.

4. After testing, ask: "Shall I save these corrections?"

## Rules
- ONLY discuss page interaction (selectors, DOM structure, element targeting)
- Do NOT discuss grades, rubrics, scores, or grading logic
- Do NOT suggest workflow steps or what to do when grading
- Keep messages short and scannable
- If uncertain, say so — do not fabricate selectors`;

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
