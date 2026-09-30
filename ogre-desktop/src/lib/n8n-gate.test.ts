import { describe, it, expect, beforeEach, vi } from 'vitest';

// Proves the Run gating reads the LIVE workflow, not a saved URL. Mocks db so
// the n8n client is exercised without a network or a stored secret.
vi.mock('./db', () => ({
  getN8nSettings: vi.fn(),
  DEFAULT_N8N_WORKFLOW_ID: 'icYXVP5hj0YldI5S'
}));

import { fetchAutomationStatus, triggerAutomation, N8nError } from './n8n';
import { getN8nSettings } from './db';

const mock = getN8nSettings as unknown as ReturnType<typeof vi.fn>;

const settings = (over: Record<string, string> = {}) => ({
  baseUrl: 'https://n8n.example.com',
  apiKey: 'n8n_fake',
  workflowId: 'wf1',
  webhookUrl: 'https://n8n.example.com/webhook/x',
  ...over
});

function fakeN8n(nodes: { type: string; disabled?: boolean }[], execs: unknown[] = []) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/api/v1/workflows/')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ name: 'WF', active: true, nodes }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: execs }) };
  });
}

describe('n8n automation', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('reports no webhook node when the workflow has none', async () => {
    mock.mockResolvedValue(settings());
    vi.stubGlobal('fetch', fakeN8n([{ type: 'n8n-nodes-base.scheduleTrigger' }]));
    const s = await fetchAutomationStatus();
    expect(s.workflow.hasWebhookNode).toBe(false);
    expect(s.canRun).toBe(false);          // saved URL must NOT enable it
    expect(s.workflow.hasScheduleNode).toBe(true);
  });

  it('enables run only when a webhook node exists AND a url is set', async () => {
    mock.mockResolvedValue(settings());
    vi.stubGlobal('fetch', fakeN8n([{ type: 'n8n-nodes-base.webhook' }, { type: 'n8n-nodes-base.scheduleTrigger' }]));
    expect((await fetchAutomationStatus()).canRun).toBe(true);

    mock.mockResolvedValue(settings({ webhookUrl: '' }));
    expect((await fetchAutomationStatus()).canRun).toBe(false);   // node but no url
  });

  it('counts the staged-shape executions and maps fields', async () => {
    mock.mockResolvedValue(settings());
    vi.stubGlobal('fetch', fakeN8n([{ type: 'n8n-nodes-base.webhook' }], [
      { id: 376, mode: 'trigger', status: 'success', startedAt: '2026-09-30T02:30:20.000Z' }
    ]));
    const s = await fetchAutomationStatus();
    expect(s.executions).toEqual([{ id: '376', mode: 'trigger', status: 'success', started: '2026-09-30T02:30:20.000Z' }]);
  });

  it('refuses to trigger when the live workflow has no webhook node', async () => {
    mock.mockResolvedValue(settings());
    vi.stubGlobal('fetch', fakeN8n([{ type: 'n8n-nodes-base.scheduleTrigger' }]));
    await expect(triggerAutomation()).rejects.toThrow(/no Webhook node/i);
  });

  it('refuses to trigger with no webhook url', async () => {
    mock.mockResolvedValue(settings({ webhookUrl: '' }));
    await expect(triggerAutomation()).rejects.toThrow(/No webhook URL/i);
  });

  it('never leaks the api key into an error message', async () => {
    mock.mockResolvedValue(settings());
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })));
    const s = await fetchAutomationStatus();
    expect(s.error).toMatch(/rejected the API key/i);
    expect(s.error).not.toContain('n8n_fake');
  });

  it('degrades to an error instead of throwing when n8n is unreachable', async () => {
    mock.mockResolvedValue(settings());
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed'); }));
    const s = await fetchAutomationStatus();
    expect(s.error).toMatch(/Could not reach n8n/i);
    expect(s.executions).toEqual([]);
  });

  it('is not configured when base url or key is missing', async () => {
    mock.mockResolvedValue(settings({ baseUrl: '' }));
    const s = await fetchAutomationStatus();
    expect(s.configured).toBe(false);
    expect(s.error).toMatch(/not configured/i);
  });

  it('throws a readable error when unconfigured', async () => {
    mock.mockResolvedValue(settings({ apiKey: '' }));
    await expect(triggerAutomation()).rejects.toBeInstanceOf(N8nError);
  });
});
