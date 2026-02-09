import handler from '../auth/google/refresh.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMocks({ method = 'POST', body = undefined } = {}) {
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

describe('POST /api/auth/google/refresh', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns 200 with new access token on valid refresh_token', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        access_token: 'ya29.new-token',
        expires_in: 3600,
      }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: '1//valid-refresh' } });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.access_token).toBe('ya29.new-token');
    expect(res.body.expires_in).toBe(3600);
  });

  it('does not return refresh_token in response (only access_token)', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        access_token: 'ya29.new-token',
        expires_in: 3600,
      }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: '1//valid-refresh' } });
    await handler(req, res);

    expect(res.body).not.toHaveProperty('refresh_token');
  });

  it('calls Google token endpoint with grant_type=refresh_token', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: 'rt' } });
    await handler(req, res);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.grant_type).toBe('refresh_token');
    expect(sentBody.refresh_token).toBe('rt');
  });

  it('returns 400 when refresh_token is missing', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('refresh_token');
  });

  it('returns 400 when body is empty/null', async () => {
    const { req, res } = createMocks({ method: 'POST', body: null });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when refresh_token is not a string', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: 999 } });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 204 with CORS headers on OPTIONS', async () => {
    const { req, res } = createMocks({ method: 'OPTIONS' });
    await handler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBeDefined();
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  it('returns 405 for GET method', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ success: false, error: 'Method not allowed' });
  });

  it('returns 400 when Google returns error', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ error: 'invalid_grant', error_description: 'Token has been revoked' }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: 'revoked-rt' } });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Token has been revoked');
  });

  it('returns 500 when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: 'valid-rt' } });
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('DNS resolution failed');
  });

  it('does not expose client_secret in response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { refresh_token: 'rt' } });
    await handler(req, res);

    const json = JSON.stringify(res.body);
    expect(json).not.toContain('client_secret');
  });
});
