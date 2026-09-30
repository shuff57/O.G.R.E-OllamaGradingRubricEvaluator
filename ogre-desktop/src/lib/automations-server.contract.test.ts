import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Cross-repo contract test.
 *
 * The other tests in this file parse a hand-written mock — which is my own
 * memory of what the automations server returns, and therefore worthless as
 * evidence that the two halves agree. This one parses a REAL captured response
 * from GET /frq/automation on the automations server, so if that endpoint's
 * shape ever changes, this fails instead of the desktop app silently showing
 * the wrong number.
 *
 * The fixture is a verbatim server response. Re-capture it by running the
 * automations server and hitting the endpoint; do not hand-edit it, because a
 * hand-edited fixture is just another mock wearing a disguise.
 */
vi.mock('./db', () => ({
  getAutomationsBaseUrl: vi.fn(async () => 'http://automations.test:8477')
}));

import { fetchStagedStatus, countStaged } from './automations-server';

const FIXTURE = fileURLToPath(new URL('./fixtures/frq-automation-response.json', import.meta.url));
const real = JSON.parse(readFileSync(FIXTURE, 'utf8'));

const serve = (body: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }));

describe('automations-server contract (real captured response)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('the fixture is a genuine capture, not a hand-written mock', () => {
    // Self-consistency: the server derives count from the same key set it
    // returns, so these must agree. A hand-edited fixture usually breaks this.
    expect(Array.isArray(real.staged.keys)).toBe(true);
    expect(real.staged.count).toBe(real.staged.keys.length);
    expect(real.staged.stagedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(real).toHaveProperty('workflow');
    expect(Array.isArray(real.executions)).toBe(true);
  });

  it('parses the real response into the right count, timestamp and keys', async () => {
    vi.stubGlobal('fetch', serve(real));
    const s = await fetchStagedStatus();
    expect(s.error).toBeNull();
    expect(s.count).toBe(5);
    expect(s.stagedAt).toBe(real.staged.stagedAt);
    expect(s.keys).toEqual(real.staged.keys);
  });

  it('the count is distinguishable from both ways of getting it wrong', () => {
    // The two 376-shaped mistakes, PINNED so the assertions above have teeth:
    //   Object.keys(real)  -> the response's own top level (staged, workflow,
    //                         executions) = 3
    //   countStaged(real)  -> keys under the RESPONSE's .staged, which are
    //                         literally count, stagedAt, keys = 3
    // With 5 staged questions the correct answer is neither, so a regression to
    // either wrong method fails here instead of passing by coincidence.
    expect(Object.keys(real).length).toBe(3);
    expect(countStaged(real)).toBe(3);
    expect(Object.keys(real.staged).length).toBe(3);
    expect(real.staged.count).toBe(5);
    expect(real.staged.count).not.toBe(countStaged(real));
    expect(real.staged.count).not.toBe(Object.keys(real).length);
  });

  it('survives a real response whose workflow half reports an error', async () => {
    // The capture above was taken with n8n unconfigured, so it carries a real
    // workflow.error. The staged count must still be readable — the two halves
    // degrade independently.
    expect(real.workflow.error).toBeTruthy();
    vi.stubGlobal('fetch', serve(real));
    const s = await fetchStagedStatus();
    expect(s.count).toBe(5);
    expect(s.error).toBeNull();
  });
});
