/**
 * site-guide-types.ts - Structured JSON payload for AI agent site context injection.
 * 
 * Markdown profiles are stored as source-of-truth for humans.
 * This interface represents the computed JSON view injected into agent system prompts.
 */

export interface SiteGuideJSON {
  /** Human-readable site name (e.g. "MyOpenMath") */
  site: string;
  /** Base URL of the site (e.g. "https://www.myopenmath.com") */
  baseUrl: string;
  /** User's role on this site (e.g. "instructor") */
  role: string;
  /** URL patterns that identify this site (e.g. ["myopenmath.com"]) */
  urlPatterns: string[];
  /** CSS selectors for key elements. Keys are descriptive names, values are CSS selectors. */
  selectors: Record<string, string>;
  /** Navigation URLs. Keys are page names, values are URL patterns with {param} placeholders. */
  navigation: Record<string, string>;
  /** Step-by-step workflows for common tasks */
  workflows: Array<{ name: string; steps: string[] }>;
  /** Tips, warnings, and gotchas for AI agent */
  gotchas: string[];
  /** Structured corrections learned during Agent Training sessions. Optional — not present on bundled profiles. */
  learned_corrections?: LearnedCorrection[];
}

/**
 * A single learned correction from an Agent Training session.
 * Stored as JSON array in the `learned_corrections` column on the skills table.
 */
export interface LearnedCorrection {
  /** The browser action this corrects: "click", "type", "scroll", "navigate" */
  action: string;
  /** Human description of what the agent was trying to target */
  target: string;
  /** The confirmed working CSS selector */
  correct_selector: string;
  /** Optional: parent/ancestor scope hint */
  scope_hint?: string;
  /** Free-text notes from the training conversation */
  notes?: string;
  /** ISO 8601 datetime when this correction was saved */
  timestamp: string;
}

/**
 * Serialize a SiteGuideJSON to the delimited string format injected into agent prompts.
 * Format: "--- SITE GUIDE (JSON): {name} ---\n{json}\n--- END SITE GUIDE ---"
 */
export function formatSiteGuideForAgent(guide: SiteGuideJSON): string {
  const json = JSON.stringify(guide);
  let output = `--- SITE GUIDE (JSON): ${guide.site} ---\n${json}\n--- END SITE GUIDE ---`;

  if (guide.learned_corrections && guide.learned_corrections.length > 0) {
    const correctionLines = guide.learned_corrections.map(c => {
      const scope = c.scope_hint ? ` (scope: ${c.scope_hint})` : '';
      const notes = c.notes ? ` — ${c.notes}` : '';
      return `• [${c.action}] ${c.target}: use selector \`${c.correct_selector}\`${scope}${notes}`;
    }).join('\n');
    output += `\n\n--- LEARNED CORRECTIONS: ${guide.site} ---\n${correctionLines}\n--- END LEARNED CORRECTIONS ---`;
  }

  return output;
}

/**
 * Type guard — check if an unknown value is a valid SiteGuideJSON.
 */
export function isSiteGuideJSON(obj: unknown): obj is SiteGuideJSON {
  if (!obj || typeof obj !== 'object') return false;
  const g = obj as Record<string, unknown>;
  return (
    typeof g.site === 'string' &&
    typeof g.baseUrl === 'string' &&
    typeof g.role === 'string' &&
    Array.isArray(g.urlPatterns) &&
    typeof g.selectors === 'object' && g.selectors !== null &&
    typeof g.navigation === 'object' && g.navigation !== null &&
    Array.isArray(g.workflows) &&
    Array.isArray(g.gotchas)
  );
}
