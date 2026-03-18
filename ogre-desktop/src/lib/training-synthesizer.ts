/**
 * training-synthesizer.ts — Converts a completed training conversation
 * into structured LearnedCorrection records and gotcha bullets.
 *
 * Makes one AI call to the grading-server /api/chat endpoint with a
 * synthesis-focused system prompt, then parses the JSON response.
 */

import type { ChatMessage } from './discovery-intent';
import type { LearnedCorrection } from './site-guide-types';

const SYNTHESIS_SYSTEM_PROMPT = `You are a data extraction assistant.
Given a conversation between a user and an AI about how to interact with a grading webpage,
extract structured corrections.

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "corrections": [
    {
      "action": "click|type|scroll|navigate",
      "target": "human description of the target element",
      "correct_selector": "the confirmed CSS selector",
      "scope_hint": "optional scope context e.g. scope to ancestor div",
      "notes": "optional free-text note",
      "timestamp": "ISO8601 datetime"
    }
  ],
  "gotchas": [
    "Natural language bullet describing a learned rule or warning"
  ]
}

If no clear corrections were confirmed in the conversation, return:
{"corrections": [], "gotchas": []}

Extract ONLY what was explicitly confirmed by the user — do not infer or fabricate.`;

export interface SynthesisResult {
  corrections: LearnedCorrection[];
  gotchas: string[];
}

/**
 * Synthesize a training conversation into structured corrections.
 *
 * @param messages - The full training conversation
 * @param sendMessage - Callback to POST /api/chat (same as used elsewhere in DiscoveryPanel)
 * @returns Extracted corrections and gotcha bullets
 */
export async function synthesizeTraining(
  messages: ChatMessage[],
  sendMessage: (messages: ChatMessage[]) => Promise<string>,
): Promise<SynthesisResult> {
  const summaryRequest: ChatMessage = {
    role: 'user',
    content: 'Please extract all confirmed corrections from our conversation as JSON now.',
    timestamp: new Date().toISOString(),
  };

  const fullMessages = [...messages, summaryRequest];

  let responseText: string;
  try {
    responseText = await sendMessage(fullMessages);
  } catch (e) {
    console.warn('synthesizeTraining: AI call failed', e);
    return { corrections: [], gotchas: [] };
  }

  // Strip markdown fences if model adds them
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      corrections?: unknown[];
      gotchas?: unknown[];
    };

    const corrections = (Array.isArray(parsed.corrections) ? parsed.corrections : [])
      .filter((c): c is LearnedCorrection =>
        typeof c === 'object' && c !== null &&
        typeof (c as Record<string, unknown>).action === 'string' &&
        typeof (c as Record<string, unknown>).correct_selector === 'string'
      )
      .map(c => ({
        ...c,
        timestamp: c.timestamp || new Date().toISOString(),
      }));

    const gotchas = (Array.isArray(parsed.gotchas) ? parsed.gotchas : [])
      .filter((g): g is string => typeof g === 'string');

    return { corrections, gotchas };
  } catch {
    console.warn('synthesizeTraining: failed to parse AI response as JSON', cleaned);
    return { corrections: [], gotchas: [] };
  }
}
