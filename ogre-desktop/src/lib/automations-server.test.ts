import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./db', () => ({
  getAutomationsBaseUrl: vi.fn(async () => 'http://automations.test:8477')
}));

import { countStaged, fetchStagedStatus } from './automations-server';

const json = (body: unknown, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }));

describe('countStaged', () => {
  // The 376 bug: the staged file is {staged: {key: {...}}, updatedAt}. Counting
  // the TOP-LEVEL keys gives 2 for a healthy run and 0 for an empty one, which
  // is backwards. This test is the guard against it coming back.
  it('counts keys UNDER .staged, not the top-level keys', () => {
    const payload = {
      staged: { 'a:b:c': { gradedCount: 29 }, 'd:e:f': { gradedCount: 4 } },
      updatedAt: '2026-09-30T02:30:59.000Z'
    };
    expect(Object.keys(payload).length).toBe(2); // the wrong answer
    expect(countStaged(payload)).toBe(2); // the right one, coincidentally equal here
  });

  it('is 0 for an empty staged map even though the file has 2 top-level keys', () => {
    expect(countStaged({ staged: {}, updatedAt: 'x' })).toBe(0);
  });

  it('separates count from updatedAt, which is not a staged question', () => {
    const withStaged = { staged: { one: {} }, updatedAt: 'x' };
    expect(countStaged(withStaged)).toBe(1);
  });

  it('returns 0 rather than NaN for junk', () => {
    for (const junk of [null, undefined, 0, 'string', 42, [], {}, { staged: null }, { staged: 'no' }]) {
      expect(countStaged(junk)).toBe(0);
    }
  });
});

describe('fetchStagedStatus', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('reports count, stagedAt and keys from a healthy server', async () => {
    vi.stubGlobal(
      'fetch',
      json({
        staged: { count: 2, stagedAt: '2026-09-30T02:30:59.000Z', keys: ['a:b:c', 'd:e:f'] },
        workflow: { configured: true },
        executions: []
      })
    );
    const s = await fetchStagedStatus();
    expect(s.error).toBeNull();
    expect(s.count).toBe(2);
    expect(s.stagedAt).toBe('2026-09-30T02:30:59.000Z');
    expect(s.keys).toEqual(['a:b:c', 'd:e:f']);
  });

  it('derives the count from .staged when the server omits its own count field', async () => {
    vi.stubGlobal('fetch', json({ staged: { one: {}, two: {} }, updatedAt: 'x' }));
    expect((await fetchStagedStatus()).count).toBe(2);
  });

  it('explains a 404 as an undeployed endpoint instead of showing a wrong count', async () => {
    vi.stubGlobal('fetch', json({ error: 'not found' }, 404));
    const s = await fetchStagedStatus();
    expect(s.count).toBe(0);
    expect(s.error).toMatch(/no \/frq\/automation endpoint/i);
    expect(s.error).toMatch(/not deployed/i);
  });

  it('reports other HTTP failures without throwing', async () => {
    vi.stubGlobal('fetch', json({ error: 'boom' }, 500));
    const s = await fetchStagedStatus();
    expect(s.error).toMatch(/HTTP 500/);
  });

  it('degrades to an error when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    const s = await fetchStagedStatus();
    expect(s.error).toMatch(/Could not reach the automations server/i);
    expect(s.count).toBe(0);
  });

  it('drops non-string keys rather than rendering objects', async () => {
    vi.stubGlobal('fetch', json({ staged: { keys: ['ok', 42, null, { a: 1 }] } }));
    expect((await fetchStagedStatus()).keys).toEqual(['ok']);
  });
});
