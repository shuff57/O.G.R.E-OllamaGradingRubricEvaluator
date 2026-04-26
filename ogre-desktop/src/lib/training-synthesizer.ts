/**
 * training-synthesizer.ts — Converts a completed training conversation
 * into structured LearnedCorrection records and gotcha bullets.
 *
 * Makes one AI call to the grading-server /api/chat endpoint with a
 * synthesis-focused system prompt, then parses the JSON response.
 *
 * Note: /api/chat solver mode accepts a single `message` string. We flatten
 * the training conversation into a labeled transcript and pass it as the
 * body, with SYNTHESIS_SYSTEM_PROMPT as the system prompt. This keeps the
 * synthesis prompt independent of the Discover harness (which forces
 * conversational text and would block JSON output if we went through
 * sendTrainingMessage).
 */

import type { ChatMessage } from './discovery-intent';
import type { LearnedCorrection } from './site-guide-types';
import { getHandshakeToken } from './provider-sync';

const SERVER_BASE = 'http://localhost:3456';

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

Rules:
- Extract every CSS selector that was confirmed to match real elements (match counts > 0 from a live test) or confirmed by the user.
- Include one correction per selector: action ("click" for buttons, "type" for input/textarea/contenteditable, etc.), target (human name like "score input"), correct_selector (the exact CSS), notes (optional).
- If an interaction test report is in the conversation, treat every step marked with a checkmark/pass as a confirmed correction.
- If no clear corrections were confirmed, return {"corrections": [], "gotchas": []}.
- Do NOT infer or fabricate selectors.`;

export interface SynthesisResult {
  corrections: LearnedCorrection[];
  gotchas: string[];
}

export interface SynthesizeOptions {
  provider?: string;
  model?: string;
}

/**
 * Synthesize a training conversation into structured corrections by calling
 * /api/chat with the dedicated synthesis system prompt. Independent of the
 * Discover harness — this is a one-shot JSON-extraction call.
 */
export async function synthesizeTraining(
  messages: ChatMessage[],
  options: SynthesizeOptions = {},
): Promise<SynthesisResult> {
  const transcript = messages
    .map(m => {
      const role = m.role === 'user' ? 'USER' : 'ASSISTANT';
      return `[${role}]\n${m.content}`;
    })
    .join('\n\n');

  const messageBody =
    `Here is the training conversation to extract confirmed corrections from:\n\n` +
    `${transcript}\n\n` +
    `---\n\n` +
    `Now extract the confirmed corrections as JSON following the system prompt shape exactly. ` +
    `Return JSON only, no commentary.`;

  const token = getHandshakeToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let responseText: string;
  try {
    const response = await fetch(`${SERVER_BASE}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: messageBody,
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        ...(options.provider ? { provider: options.provider } : {}),
        ...(options.model ? { model: options.model } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Synthesis HTTP ${response.status}`);
    }

    // /api/chat solver mode streams SSE with events: status | message | done | error.
    const text = await response.text();
    let content = '';
    let serverError: string | null = null;
    for (const block of text.split('\n\n').filter(b => b.trim())) {
      let eventName: string | null = null;
      let dataLine: string | null = null;
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLine = line.slice(6);
      }
      if (!dataLine) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(dataLine); } catch { continue; }
      if (eventName === 'error') {
        serverError = (typeof parsed === 'object' && parsed !== null && 'message' in parsed)
          ? String((parsed as { message?: string }).message ?? 'Unknown server error')
          : JSON.stringify(parsed);
        break;
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const d = parsed as { content?: string };
        if (d.content) content += d.content;
      }
    }
    if (serverError) throw new Error(`Synthesis server error: ${serverError}`);
    responseText = content;
  } catch (e) {
    console.warn('synthesizeTraining: AI call failed', e);
    return { corrections: [], gotchas: [] };
  }

  // Strip markdown fences and any JSON envelope the model may have added.
  let cleaned = responseText.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  // Some models output {"text": "{...}"} — unwrap a single text-envelope layer.
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const maybeEnvelope = JSON.parse(cleaned) as { text?: unknown };
      if (maybeEnvelope && typeof maybeEnvelope.text === 'string') {
        cleaned = maybeEnvelope.text.trim();
        const innerFence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
        if (innerFence) cleaned = innerFence[1].trim();
      }
    } catch { /* not the envelope — fall through */ }
  }

  try {
    const parsed = JSON.parse(cleaned) as {
      corrections?: unknown[];
      gotchas?: unknown[];
    };

    const corrections = (Array.isArray(parsed.corrections) ? parsed.corrections : [])
      .filter((c): c is LearnedCorrection =>
        typeof c === 'object' && c !== null &&
        typeof (c as Record<string, unknown>).action === 'string' &&
        typeof (c as Record<string, unknown>).correct_selector === 'string',
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
