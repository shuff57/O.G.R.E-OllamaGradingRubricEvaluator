import handler from '../health.js';

// Helper to create mock Vercel req/res
function createMocks({ method = 'GET', body = undefined } = {}) {
  const req = { method, body };
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    ended: false,
    headers,
    setHeader(key, value) { headers[key] = value; },
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    end() { res.ended = true; return res; },
  };
  return { req, res };
}

describe('GET /api/health', () => {
  it('returns 200 with status ok on GET', () => {
    const { req, res } = createMocks({ method: 'GET' });
    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.timestamp).toBe('number');
  });

  it('returns 204 with CORS headers on OPTIONS', () => {
    const { req, res } = createMocks({ method: 'OPTIONS' });
    handler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBeDefined();
    expect(res.headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  it('returns 405 for POST method', () => {
    const { req, res } = createMocks({ method: 'POST' });
    handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ success: false, error: 'Method not allowed' });
  });

  it('returns 405 for PUT method', () => {
    const { req, res } = createMocks({ method: 'PUT' });
    handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it('sets CORS headers on all responses', () => {
    const { req, res } = createMocks({ method: 'GET' });
    handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).toBeDefined();
    expect(res.headers['Access-Control-Allow-Methods']).toBeDefined();
    expect(res.headers['Access-Control-Allow-Headers']).toBeDefined();
  });

  it('does not expose secrets in response', () => {
    const { req, res } = createMocks({ method: 'GET' });
    handler(req, res);

    const json = JSON.stringify(res.body);
    expect(json).not.toContain('client_secret');
    expect(json).not.toContain('client_id');
  });
});
