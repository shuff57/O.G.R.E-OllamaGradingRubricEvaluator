/**
 * Rubric leniency rewriting — transforms rubric criteria text to be
 * easier (lenient) or harder (strict) to satisfy.
 *
 * Leniency scale: 0 = most lenient, 50 = original, 100 = most strict.
 *
 * Two strategies:
 * - Rule-based: deterministic text substitutions (fast, no API call)
 * - AI-powered: sends rubric to LLM for intelligent rewrite (slower, higher quality)
 */

import { ensureHandshakeToken } from './provider-sync';

const SERVER_BASE = 'http://localhost:3456';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await ensureHandshakeToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Rule-based substitutions ────────────────────────────────────────────

interface Substitution {
  pattern: RegExp;
  replacement: string;
}

/** Lenient: soften requirements (applied when leniency < 50) */
const LENIENT_SUBS: Substitution[] = [
  // High-impact: common rubric verbs softened
  { pattern: /\bAND\b/g, replacement: 'OR' },
  { pattern: /\bClearly states\b/gi, replacement: 'Mentions' },
  { pattern: /\bPrecisely (states|defines|describes)\b/gi, replacement: 'References' },
  { pattern: /\bexplicitly\b/gi, replacement: '' },
  { pattern: /\bcorrect formula\b/gi, replacement: 'relevant formula or concept' },
  { pattern: /\bCorrect formula\b/g, replacement: 'Relevant formula or concept' },
  { pattern: /\bcomprehensive\b/gi, replacement: 'adequate' },
  { pattern: /\ball key concepts\b/gi, replacement: 'most key concepts' },
  { pattern: /\bwith specific\b/gi, replacement: 'with some' },
  { pattern: /\brigorously\b/gi, replacement: '' },
  { pattern: /\bdemonstrates mastery\b/gi, replacement: 'shows familiarity' },
  { pattern: /\bFull \((\d+)\)/g, replacement: 'Full ($1)' }, // keep points, soften later
  { pattern: /\bexact\b/gi, replacement: 'approximate' },
  { pattern: /\bprecise\b/gi, replacement: 'reasonable' },
  { pattern: /\bmust include\b/gi, replacement: 'may include' },
  { pattern: /\brequires\b/gi, replacement: 'benefits from' },
  // Broader coverage: common rubric language
  { pattern: /\bidentifies\b/gi, replacement: 'recognizes' },
  { pattern: /\bIdentifies\b/g, replacement: 'Recognizes' },
  { pattern: /\bshows understanding\b/gi, replacement: 'shows awareness' },
  { pattern: /\bdemonstrates understanding\b/gi, replacement: 'shows awareness' },
  { pattern: /\baccurately\b/gi, replacement: 'generally' },
  { pattern: /\bcorrectly\b/gi, replacement: 'reasonably' },
  { pattern: /\bcorrect\b/gi, replacement: 'reasonable' },
  { pattern: /\bappropriate\b/gi, replacement: 'relevant' },
  { pattern: /\bcomplete\b/gi, replacement: 'partial' },
  { pattern: /\bthorough\b/gi, replacement: 'basic' },
  { pattern: /\bdetailed\b/gi, replacement: 'brief' },
  { pattern: /\ball\b/g, replacement: 'most' },
  { pattern: /\bAll\b/g, replacement: 'Most' },
  { pattern: /\bmust\b/gi, replacement: 'may' },
  { pattern: /\bshould\b/gi, replacement: 'could' },
];

/** Lenient model-text subs: soften math notation and precision in ideal answers */
const LENIENT_MODEL_SUBS: Substitution[] = [
  // Soften exact step-by-step notation to conceptual descriptions
  { pattern: /\bTherefore\b/gi, replacement: 'So' },
  { pattern: /\bthus\b/gi, replacement: 'so' },
  { pattern: /\bwe can conclude\b/gi, replacement: 'it looks like' },
  { pattern: /\bdefinitely\b/gi, replacement: 'likely' },
  { pattern: /\bIS an outlier\b/g, replacement: 'is probably an outlier' },
  { pattern: /\bis an outlier\b/g, replacement: 'is probably an outlier' },
  { pattern: /\bexactly\b/gi, replacement: 'about' },
  { pattern: /\bprecisely\b/gi, replacement: 'roughly' },
  { pattern: /\bSince\b/g, replacement: 'Because' },
  { pattern: /\bdemonstrates\b/gi, replacement: 'shows' },
  { pattern: /\bdemonstrate\b/gi, replacement: 'show' },
  { pattern: /\bdemonstrating\b/gi, replacement: 'showing' },
];

/** Strict: tighten requirements (applied when leniency > 50) */
const STRICT_SUBS: Substitution[] = [
  { pattern: /\bOR\b/g, replacement: 'AND' },
  { pattern: /\bMentions\b/g, replacement: 'Precisely states' },
  { pattern: /\bmentions\b/g, replacement: 'precisely states' },
  { pattern: /\bexplains\b/gi, replacement: 'rigorously demonstrates' },
  { pattern: /\bExplains\b/g, replacement: 'Rigorously demonstrates' },
  { pattern: /\breferences\b/gi, replacement: 'explicitly cites with notation' },
  { pattern: /\bsome\b/gi, replacement: 'all' },
  { pattern: /\bshows understanding\b/gi, replacement: 'demonstrates mastery' },
  { pattern: /\bdiscusses\b/gi, replacement: 'formally analyzes' },
  { pattern: /\bDiscusses\b/g, replacement: 'Formally analyzes' },
  { pattern: /\bdescribes\b/gi, replacement: 'precisely defines' },
  { pattern: /\bDescribes\b/g, replacement: 'Precisely defines' },
  { pattern: /\baware(ness)?\b/gi, replacement: 'thorough understanding' },
  { pattern: /\bbasic\b/gi, replacement: 'detailed' },
  { pattern: /\bvague\b/gi, replacement: 'imprecise' },
];

/**
 * Rule-based rubric rewrite. Applies text substitutions proportional
 * to distance from center (50%). Deterministic and instant.
 *
 * Processes ALL lines including model text (ideal answer), only skipping
 * structural headers like "--- Grading Checklist ---" and "[Category]".
 * Model text lines get additional substitutions to soften math notation.
 */
export function rewriteRubricRuleBased(rubricText: string, leniency: number): string {
  if (leniency === 50) return rubricText;

  const intensity = Math.abs(leniency - 50) / 50; // 0..1
  const subs = leniency < 50 ? LENIENT_SUBS : STRICT_SUBS;
  const modelSubs = leniency < 50 ? LENIENT_MODEL_SUBS : [];

  // Determine how many substitutions to apply based on intensity
  const activeCount = Math.ceil(subs.length * intensity);
  const activeSubs = subs.slice(0, activeCount);
  const activeModelCount = Math.ceil(modelSubs.length * intensity);
  const activeModelSubs = modelSubs.slice(0, activeModelCount);

  let inModelSection = false;

  return rubricText.split('\n').map(line => {
    const trimmed = line.trimStart();

    // Track when we enter/leave the model response section
    if (trimmed.startsWith('--- Model Response ---')) {
      inModelSection = true;
      return line; // pass header through
    }
    if (trimmed.startsWith('---') && inModelSection) {
      inModelSection = false;
    }

    // Skip structural headers: "--- ... ---", "## Category [N%]", "[Category]", "[Category(N pts)]", empty lines
    if (trimmed.startsWith('---') ||
        trimmed.startsWith('## ') ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('[') && trimmed.match(/\]\s*$/)) ||
        !trimmed) {
      return line;
    }

    let result = line;

    // Apply standard rubric subs
    for (const sub of activeSubs) {
      result = result.replace(sub.pattern, sub.replacement);
    }

    // Apply model-text-specific subs in model response section
    if (inModelSection) {
      for (const sub of activeModelSubs) {
        result = result.replace(sub.pattern, sub.replacement);
      }
    }

    // Clean up double spaces from removed words (preserve leading indentation)
    const indent = result.match(/^(\s*)/)?.[1] ?? '';
    result = indent + result.trimStart().replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1');
    return result;
  }).join('\n');
}


// ── AI-powered rewrite ──────────────────────────────────────────────────

/**
 * AI-powered rubric rewrite. Sends rubric to the grading server's /api/chat
 * endpoint in solver mode for intelligent rephrasing.
 */
export async function rewriteRubricAI(
  rubricText: string,
  leniency: number,
  options?: { provider?: string; model?: string },
  signal?: AbortSignal,
): Promise<string> {
  if (leniency === 50) return rubricText;

  const direction = leniency < 50 ? 'lenient' : 'strict';
  const pct = Math.abs(leniency - 50);
  const directionDesc = direction === 'lenient'
    ? `${pct}% more lenient — make criteria easier to satisfy, accept vaguer answers, less precise terminology, partial understanding counts as meeting the criterion`
    : `${pct}% more strict — make criteria harder to satisfy, require precise terminology, exact formulas, explicit conditions, thorough explanation`;

  const prompt = `Rewrite the following rubric criteria to be ${directionDesc}.

RULES:
- Keep ALL "## Category [N%]" header lines EXACTLY the same
- Keep ALL point values in "(Npts)" EXACTLY the same
- Keep the EXACT same formatting structure (headers, line breaks)
- Rewrite ONLY the criterion description text to be more ${direction}
- Return the COMPLETE rewritten rubric, not just changed parts
- Do NOT add explanations or commentary — return ONLY the rubric text

ORIGINAL RUBRIC:
${rubricText}

REWRITTEN RUBRIC:`;

  const response = await fetch(`${SERVER_BASE}/api/chat`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      message: prompt,
      ...(options?.provider ? { provider: options.provider } : {}),
      ...(options?.model ? { model: options.model } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Rewrite failed: HTTP ${response.status}`);
  }

  // Parse SSE response — collect all text chunks
  const text = await response.text();
  let result = '';
  for (const block of text.split('\n\n').filter(b => b.trim())) {
    for (const line of block.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) result += data.content;
          else if (data.token) result += data.token;
          else if (data.text) result += data.text;
          else if (typeof data === 'string') result += data;
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  // Validate: result should have similar structure to original
  // Count criteria lines — those matching "Name (Npts)" pattern, not headers or blanks
  const CRITERIA_LINE = /\(\d+(?:\.\d+)?\s*pts?\)/i;
  const origLines = rubricText.split('\n').filter(l => CRITERIA_LINE.test(l)).length;
  const resultLines = result.split('\n').filter(l => CRITERIA_LINE.test(l)).length;

  if (origLines > 0 && resultLines < origLines * 0.7) {
    throw new Error(`AI rewrite lost too many criteria (${resultLines} vs ${origLines} original)`);
  }

  return result.trim();
}

/**
 * Restore `## Category [N%]` weight annotations that an AI rewrite may have stripped.
 * Compares category headers in the rewritten text against the original and re-adds
 * missing `[N%]` suffixes.
 */
export function restoreCategoryWeights(rewritten: string, original: string): string {
  const HEADER_RE = /^##\s+(.+?)(?:\s*\[(\d+(?:\.\d+)?)%\])?\s*$/;
  const weights = new Map<string, number>();
  for (const line of original.split('\n')) {
    const m = HEADER_RE.exec(line.trim());
    if (m && m[2] !== undefined) {
      weights.set(m[1].trim().toLowerCase(), parseFloat(m[2]));
    }
  }
  if (weights.size === 0) return rewritten;

  return rewritten.split('\n').map(line => {
    const m = HEADER_RE.exec(line.trim());
    if (m) {
      const name = m[1].trim();
      const w = weights.get(name.toLowerCase());
      if (w !== undefined && m[2] === undefined) {
        return `## ${name} [${w}%]`;
      }
    }
    return line;
  }).join('\n');
}
