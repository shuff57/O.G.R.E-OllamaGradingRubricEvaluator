import handler from '../auth/github/callback.js';

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

describe('POST /api/auth/github/callback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns 200 with token on valid code', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        access_token: 'gho_test-token',
        token_type: 'bearer',
      }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { code: 'gh-auth-code' } });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.access_token).toBe('gho_test-token');
    expect(res.body.token_type).toBe('bearer');
  });

  it('calls GitHub token endpoint with correct params', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ access_token: 'tok' }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { code: 'my-code' } });
    await handler(req, res);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(options.method).toBe('POST');
    expect(options.headers['Accept']).toBe('application/json');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.code).toBe('my-code');
  });

  it('returns 400 when code is missing', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('code');
  });

  it('returns 400 when body is empty/null', async () => {
    const { req, res } = createMocks({ method: 'POST', body: null });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when code is not a string', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { code: 42 } });
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

  it('returns 400 when GitHub returns error', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ error: 'bad_verification_code', error_description: 'The code is invalid' }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { code: 'bad-code' } });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('The code is invalid');
  });

  it('returns 500 when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const { req, res } = createMocks({ method: 'POST', body: { code: 'valid-code' } });
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Connection refused');
  });

  it('does not expose client_secret in response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ access_token: 'tok', token_type: 'bearer' }),
    });

    const { req, res } = createMocks({ method: 'POST', body: { code: 'code' } });
    await handler(req, res);

    const json = JSON.stringify(res.body);
    expect(json).not.toContain('client_secret');
  });
});
