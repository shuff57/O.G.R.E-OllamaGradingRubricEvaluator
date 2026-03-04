import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';

/**
 * Profile endpoint tests.
 *
 * Because server.js doesn't export its Hono app, we replicate the
 * profile endpoint logic in a self-contained test app. This tests
 * the same handler code pattern used in production.
 */

function createTestApp() {
  const app = new Hono();
  /** @type {Map<string, object>} */
  const profileCache = new Map();

  app.post('/api/profiles/sync', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const key = body.id || body.name;
    if (!key || typeof key !== 'string') {
      return c.json({ error: 'Profile must have an id or name (string)' }, 400);
    }

    profileCache.set(key, body);
    return c.json({ ok: true });
  });

  app.get('/api/profiles', (c) => {
    return c.json({ profiles: Array.from(profileCache.values()) });
  });

  app.get('/api/profiles/match', (c) => {
    const url = c.req.query('url');
    if (!url) {
      return c.json({ error: 'Missing required query parameter: url' }, 400);
    }

    for (const profile of profileCache.values()) {
      const patterns = profile.urlPatterns;
      if (Array.isArray(patterns)) {
        for (const pattern of patterns) {
          if (typeof pattern === 'string' && url.includes(pattern)) {
            return c.json({ profile });
          }
        }
      }
    }

    return c.json({ profile: null });
  });

  return { app, profileCache };
}

// ── Test Data ───────────────────────────────────────────────────────────

const MYOPENMATH_PROFILE = {
  id: 'myopenmath',
  name: 'MyOpenMath',
  isBuiltIn: true,
  urlPatterns: ['gradeallq2.php', 'myopenmath.com'],
  selectors: {
    studentSection: 'div[data-lastchange]',
    studentName: 'b',
    scoreInput: 'input[aria-label="Score"]',
    feedbackBox: 'div.fbbox',
    feedbackHidden: null,
    questionRegion: null,
    fullCreditLink: null,
  },
  feedback: { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true },
  save: { buttonText: 'Quick Save', fallbackText: 'Save Changes' },
  navigation: { mode: 'batch' },
};

const CANVAS_PROFILE = {
  id: 'canvas-speedgrader',
  name: 'Canvas SpeedGrader',
  isBuiltIn: true,
  urlPatterns: ['speed_grader', 'speedgrader'],
  selectors: {
    studentSection: null,
    studentName: '[data-testid="student-select-trigger"]',
    scoreInput: '[data-testid="grade-input"]',
    feedbackBox: null,
    feedbackHidden: null,
    questionRegion: null,
    fullCreditLink: null,
  },
  feedback: { type: 'tinymce-iframe', requiresHiddenSync: false, htmlWrap: true },
  save: { buttonText: 'Submit', fallbackText: 'Save' },
  navigation: { mode: 'sequential' },
};

// ── POST /api/profiles/sync ─────────────────────────────────────────────

describe('POST /api/profiles/sync', () => {
  it('stores a profile by id and returns ok', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MYOPENMATH_PROFILE),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('falls back to name when id is missing', async () => {
    const { app, profileCache } = createTestApp();
    const profile = { name: 'Custom Profile', urlPatterns: ['example.com'] };
    const res = await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    expect(res.status).toBe(200);
    expect(profileCache.has('Custom Profile')).toBe(true);
  });

  it('returns 400 when profile has no id or name', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlPatterns: ['foo'] }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('id or name');
  });

  it('returns 400 for invalid JSON', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    expect(res.status).toBe(400);
  });

  it('overwrites existing profile with same id', async () => {
    const { app, profileCache } = createTestApp();

    // Sync original
    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MYOPENMATH_PROFILE),
    });

    // Sync updated version
    const updated = { ...MYOPENMATH_PROFILE, name: 'MyOpenMath v2' };
    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    expect(profileCache.size).toBe(1);
    expect(profileCache.get('myopenmath').name).toBe('MyOpenMath v2');
  });
});

// ── GET /api/profiles ───────────────────────────────────────────────────

describe('GET /api/profiles', () => {
  it('returns empty array when no profiles synced', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/profiles');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profiles).toEqual([]);
  });

  it('returns all synced profiles', async () => {
    const { app } = createTestApp();

    // Sync two profiles
    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MYOPENMATH_PROFILE),
    });
    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CANVAS_PROFILE),
    });

    const res = await app.request('/api/profiles');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profiles).toHaveLength(2);

    const ids = data.profiles.map((p) => p.id);
    expect(ids).toContain('myopenmath');
    expect(ids).toContain('canvas-speedgrader');
  });
});

// ── GET /api/profiles/match?url= ────────────────────────────────────────

describe('GET /api/profiles/match', () => {
  it('returns 400 when url param is missing', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/profiles/match');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('url');
  });

  it('returns null when no profiles match', async () => {
    const { app } = createTestApp();

    // Sync a profile
    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MYOPENMATH_PROFILE),
    });

    const res = await app.request('/api/profiles/match?url=https://canvas.com/courses/123');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile).toBeNull();
  });

  it('matches MyOpenMath profile by urlPattern substring', async () => {
    const { app } = createTestApp();

    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MYOPENMATH_PROFILE),
    });

    const res = await app.request(
      '/api/profiles/match?url=https://myopenmath.com/assess2/gradeallq2.php?cid=123'
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile).not.toBeNull();
    expect(data.profile.id).toBe('myopenmath');
  });

  it('matches Canvas profile by urlPattern substring', async () => {
    const { app } = createTestApp();

    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CANVAS_PROFILE),
    });

    const res = await app.request(
      '/api/profiles/match?url=https://school.instructure.com/courses/1/gradebook/speed_grader?id=5'
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile).not.toBeNull();
    expect(data.profile.id).toBe('canvas-speedgrader');
  });

  it('returns first matching profile when multiple match', async () => {
    const { app } = createTestApp();

    // Sync two profiles that could both match
    const broadProfile = {
      id: 'broad',
      name: 'Broad',
      urlPatterns: ['myopenmath'],
    };
    const specificProfile = {
      id: 'specific',
      name: 'Specific',
      urlPatterns: ['gradeallq2.php'],
    };

    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadProfile),
    });
    await app.request('/api/profiles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(specificProfile),
    });

    const res = await app.request(
      '/api/profiles/match?url=https://myopenmath.com/gradeallq2.php?cid=1'
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    // First match wins (Map iteration order = insertion order)
    expect(data.profile).not.toBeNull();
    expect(data.profile.id).toBe('broad');
  });

  it('returns null when cache is empty', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/profiles/match?url=https://example.com');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile).toBeNull();
  });
});
