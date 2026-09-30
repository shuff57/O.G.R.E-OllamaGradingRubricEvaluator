/**
 * Read path for the STAGED GRADE COUNT.
 *
 * This is the number the whole 376 story turns on. Execution 376 fired, ran
 * unattended, and reported as `success` — and nobody could tell whether it had
 * graded 29 students or graded nobody, because the app only ever showed
 * green/red. "Ran, staged 0" and "ran, staged 29" have to read differently.
 *
 * The count cannot be computed here. Staged grades live in the automations
 * server's data directory, not in this app's SQLite, so the only way to learn
 * it is to ask that server. It exposes exactly this at GET /frq/automation.
 *
 * The one bug worth naming, because it already happened once: the staged file
 * is shaped {staged: {key: {...}}, updatedAt}. Counting the TOP-LEVEL keys of
 * that object reports 2 for a healthy run and 0 for an empty one, which is
 * backwards from what you want to read. The count is the number of keys UNDER
 * `.staged`. `countStaged` below is the only place that arithmetic happens.
 */

import { getAutomationsBaseUrl } from './db';

export interface StagedStatus {
  /** Questions with staged grades waiting for review. */
  count: number;
  /** ISO timestamp of the last write to the staged file, or null. */
  stagedAt: string | null;
  /** The staged question keys, e.g. "course:assignment:question". */
  keys: string[];
  /** Set when the server could not be read. Never fatal. */
  error: string | null;
}

/**
 * The count of staged questions. Kept separate and exported so the rule is
 * testable on its own — this arithmetic is the thing that was got wrong.
 *
 * Accepts either the whole payload or just its `staged` member, and returns 0
 * rather than NaN for anything unexpected, because a malformed payload should
 * read as "nothing staged" on screen, never as a broken page.
 */
export function countStaged(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const staged = (payload as { staged?: unknown }).staged;
  if (!staged || typeof staged !== 'object') return 0;
  return Object.keys(staged as Record<string, unknown>).length;
}

/**
 * Ask the automations server how many grades are staged.
 *
 * Never throws: a server that is down, unreachable, or too old to have this
 * endpoint must leave the rest of the Automations page usable. The caller gets
 * an error string to show and a count of 0, which is honest — we do not know,
 * and 0 pending is the safe thing to display alongside "unknown".
 */
export async function fetchStagedStatus(): Promise<StagedStatus> {
  const base = (await getAutomationsBaseUrl()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/frq/automation`);
    if (res.status === 404) {
      return {
        count: 0,
        stagedAt: null,
        keys: [],
        error:
          'The automations server has no /frq/automation endpoint yet (HTTP 404). It is ' +
          'implemented but not deployed on that host — update the automations server, then refresh.'
      };
    }
    if (!res.ok) {
      return {
        count: 0,
        stagedAt: null,
        keys: [],
        error: `The automations server returned HTTP ${res.status}.`
      };
    }
    // Parsed separately from the request, so a non-JSON body is reported as what
    // it is — the wrong thing answered — rather than as "could not reach", which
    // sends you hunting a network problem that does not exist.
    let payload: { staged?: { count?: unknown; stagedAt?: unknown; keys?: unknown } };
    try {
      payload = JSON.parse(await res.text());
    } catch {
      return {
        count: 0,
        stagedAt: null,
        keys: [],
        error:
          'The automations server replied with something that is not JSON. Check that the '
          + 'Automations server URL points at the OGRE automations server.'
      };
    }
    const s = payload.staged ?? {};
    const keys = Array.isArray(s.keys) ? s.keys.filter((k): k is string => typeof k === 'string') : [];
    // Two DIFFERENT shapes meet here, and conflating them is a real bug worth
    // naming:
    //
    //   - The file on disk is {staged: {KEY: {...}}, updatedAt}. `countStaged`
    //     handles THAT, counting keys under .staged (the 376 fix).
    //   - This endpoint's RESPONSE is {staged: {count, stagedAt, keys}, ...},
    //     where .staged is a summary object whose keys are literally "count",
    //     "stagedAt" and "keys".
    //
    // So counting payload.staged here would report 3 for a perfectly healthy run.
    // The server already did that arithmetic correctly; prefer its number, and
    // derive from .keys (the same set of questions) only if it is missing.
    const count =
      typeof s.count === 'number' && Number.isFinite(s.count)
        ? s.count
        : keys.length || countStaged(payload);
    return {
      count,
      stagedAt: typeof s.stagedAt === 'string' ? s.stagedAt : null,
      keys,
      error: null
    };
  } catch (e) {
    return {
      count: 0,
      stagedAt: null,
      keys: [],
      error: `Could not reach the automations server at ${base} — ${
        e instanceof Error ? e.message : String(e)
      }`
    };
  }
}
