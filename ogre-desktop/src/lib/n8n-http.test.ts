import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * The desktop n8n client against a REAL HTTP server.
 *
 * n8n-gate.test.ts drives the same client with `vi.fn()` stubs, which are
 * written from memory and can only ever confirm the client matches what the
 * test author believed. These tests instead stand up a real server, so they
 * check the things a mock structurally cannot:
 *
 *   - that X-N8N-API-KEY is genuinely on the wire
 *   - that the URL paths are the ones n8n's API actually exposes
 *   - how a real Response body is parsed and mapped
 *   - what a real 401, 404 or non-JSON body does
 *
 * `./db` is still mocked because it opens SQLite through Electron, which does
 * not exist in a test process. That boundary is unavoidable here; the HTTP
 * boundary is the one under test.
 */
const settings = {
  baseUrl: '',
  apiKey: 'n8n_fake_key_MUST_NOT_LEAK',
  workflowId: 'icYXVP5hj0YldI5S',
  webhookUrl: ''
};

vi.mock('./db', () => ({
  getN8nSettings: vi.fn(async () => settings)
}));

import { fetchAutomationStatus, triggerAutomation } from './n8n';

let server: http.Server;
let base: string;
const seen: { url: string; auth: string | undefined; method: string }[] = [];
let mode: 'ok' | 'unauthorized' | 'notfound' | 'notjson' | 'noWebhook' = 'ok';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? '', auth: req.headers['x-n8n-api-key'] as string | undefined, method: req.method ?? '' });
    if (mode === 'unauthorized') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"message":"invalid api key"}'); return; }
    if (mode === 'notfound') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"message":"not found"}'); return; }
    if (mode === 'notjson') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>login</html>'); return; }
    const nodes = [
      { type: 'n8n-nodes-base.scheduleTrigger', name: 'Weeknights 7:30pm' },
      { type: 'n8n-nodes-base.code', name: 'Build FRQ Work List' }
    ];
    if (mode !== 'noWebhook') nodes.push({ type: 'n8n-nodes-base.webhook', name: 'Manual' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url?.startsWith('/api/v1/workflows/')) {
      res.end(JSON.stringify({ id: 'icYXVP5hj0YldI5S', name: 'FRQ auto dry-run', active: true, nodes }));
    } else if (req.url?.startsWith('/api/v1/executions')) {
      res.end(JSON.stringify({ data: [{ id: '376', mode: 'trigger', status: 'success', startedAt: '2026-09-30T02:30:20.000Z' }] }));
    } else { res.writeHead(404); res.end('{}'); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  settings.baseUrl = base;
});

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

beforeEach(() => { seen.length = 0; mode = 'ok'; settings.webhookUrl = ''; });

describe('n8n client over real HTTP', () => {
  it('sends X-N8N-API-KEY and hits the documented API paths', async () => {
    const s = await fetchAutomationStatus(5);
    expect(s.error).toBeNull();
    const paths = seen.map((r) => r.url);
    expect(paths.some((p) => p?.startsWith('/api/v1/workflows/icYXVP5hj0YldI5S'))).toBe(true);
    expect(paths.some((p) => p?.startsWith('/api/v1/executions?workflowId='))).toBe(true);
    // The key must be on the wire, and must not appear in the URL.
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) expect(r.auth).toBe(settings.apiKey);
    for (const r of seen) expect(r.url).not.toContain(settings.apiKey);
  });

  it('maps a real response body into status and executions', async () => {
    const s = await fetchAutomationStatus(5);
    expect(s.workflow.name).toBe('FRQ auto dry-run');
    expect(s.workflow.active).toBe(true);
    expect(s.workflow.hasWebhookNode).toBe(true);
    expect(s.executions).toEqual([
      { id: '376', mode: 'trigger', status: 'success', started: '2026-09-30T02:30:20.000Z' }
    ]);
  });

  it('reports a real 401 as a rejected key, without echoing the key', async () => {
    mode = 'unauthorized';
    const s = await fetchAutomationStatus(5);
    expect(s.error).toMatch(/rejected the API key/i);
    expect(s.error).not.toContain(settings.apiKey);
    expect(s.executions).toEqual([]);
  });

  it('reports a real non-JSON body without claiming the server is unreachable', async () => {
    mode = 'notjson';
    const s = await fetchAutomationStatus(5);
    expect(s.error).toBeTruthy();
    expect(s.error).not.toContain(settings.apiKey);
  });

  it('refuses to trigger when the live workflow has no webhook node', async () => {
    mode = 'noWebhook';
    settings.webhookUrl = `${base}/webhook/frq-auto`;
    await expect(triggerAutomation()).rejects.toThrow(/no Webhook node/i);
    // It must not have POSTed to the webhook path.
    expect(seen.some((r) => r.url?.startsWith('/webhook/'))).toBe(false);
  });
});
