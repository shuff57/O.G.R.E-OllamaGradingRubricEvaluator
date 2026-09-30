/**
 * n8n client for the Automations page.
 *
 * Talks to n8n's PUBLIC REST API (/api/v1/*) directly rather than proxying
 * through the automations web server, so the desktop app keeps working as the
 * main interface when that server is down.
 *
 * Two facts about n8n shape everything here, both verified rather than assumed:
 *
 * 1. The public API cannot EXECUTE a workflow. POST/PUT
 *    /api/v1/workflows/{id}/run -> 405, GET -> 404. So "Run" cannot mean "ask
 *    n8n to run it". It has to POST to a Webhook node that the workflow exposes.
 *    Until that node exists, `hasWebhookNode` is false and the caller must not
 *    pretend a run was triggered.
 * 2. Reading a workflow DOES return its node list. That is how we tell a real
 *    doorbell from a saved phone number: a URL in our settings proves nothing if
 *    the far end has no Webhook node to receive it.
 */

import { getN8nSettings, type N8nSettings } from './db';

export interface N8nExecution {
  id: string;
  mode: string | null;
  status: string | null;
  started: string | null;
}

export interface AutomationStatus {
  /** Settings are complete enough to attempt a call. */
  configured: boolean;
  workflow: {
    id: string;
    name: string | null;
    active: boolean | null;
    /** A live, enabled Webhook node exists — the only way Run can work. */
    hasWebhookNode: boolean;
    hasScheduleNode: boolean;
  };
  /** True only when BOTH a URL is set and the workflow has a node to receive it. */
  canRun: boolean;
  executions: N8nExecution[];
  /** Set when n8n could not be reached. Never contains the API key. */
  error: string | null;
}

/** Thrown for a call the user can act on (not configured, not reachable, 401). */
export class N8nError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'N8nError';
  }
}

function requireConfigured(s: N8nSettings): void {
  if (!s.baseUrl || !s.apiKey) {
    throw new N8nError(
      'n8n is not configured. Add the base URL and API key in Settings → Automations.',
      503
    );
  }
  if (!s.workflowId) {
    throw new N8nError('No workflow id set. Add one in Settings → Automations.', 503);
  }
}

async function n8nFetch<T>(
  path: string,
  s: N8nSettings,
  init: RequestInit = {}
): Promise<T> {
  const base = s.baseUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'X-N8N-API-KEY': s.apiKey,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {})
      }
    });
  } catch (e) {
    // A TLS failure is the common case on a self-hosted n8n behind a private
    // hostname; name it rather than surfacing a bare "fetch failed".
    const msg = e instanceof Error ? e.message : String(e);
    throw new N8nError(
      `Could not reach n8n at ${base} — ${msg}. A self-signed certificate is the usual cause; ` +
        'use an http:// or Tailscale address, or install the certificate.',
      0
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail =
      (data as { message?: string } | null)?.message ?? text.slice(0, 200) ?? '';
    if (res.status === 401 || res.status === 403) {
      throw new N8nError('n8n rejected the API key. Check it in Settings → Automations.', res.status);
    }
    throw new N8nError(`n8n ${path} → HTTP ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
  }
  return data as T;
}

interface RawWorkflow {
  name?: string;
  active?: boolean;
  nodes?: { type?: string; disabled?: boolean }[];
}

/**
 * Workflow state plus recent runs. Never throws for an unreachable n8n — the
 * page shows the error and keeps the rest of itself usable, because a dead n8n
 * should not blank out the screen.
 */
export async function fetchAutomationStatus(limit = 10): Promise<AutomationStatus> {
  const s = await getN8nSettings();
  const base: AutomationStatus = {
    configured: !!(s.baseUrl && s.apiKey && s.workflowId),
    workflow: {
      id: s.workflowId,
      name: null,
      active: null,
      hasWebhookNode: false,
      hasScheduleNode: false
    },
    canRun: false,
    executions: [],
    error: null
  };
  if (!base.configured) {
    base.error = 'Not configured yet — add the n8n base URL and API key in Settings → Automations.';
    return base;
  }

  try {
    const id = encodeURIComponent(s.workflowId);
    const [wf, ex] = await Promise.all([
      n8nFetch<RawWorkflow>(`/api/v1/workflows/${id}`, s),
      n8nFetch<{ data?: unknown[] }>(
        `/api/v1/executions?workflowId=${id}&limit=${limit}`,
        s
      )
    ]);
    base.workflow.name = wf.name ?? null;
    base.workflow.active = !!wf.active;
    base.workflow.hasWebhookNode = (wf.nodes ?? []).some(
      (n) => n?.type === 'n8n-nodes-base.webhook' && !n.disabled
    );
    base.workflow.hasScheduleNode = (wf.nodes ?? []).some(
      (n) => n?.type === 'n8n-nodes-base.scheduleTrigger' && !n.disabled
    );
    base.executions = (ex.data ?? []).map((row) => {
      const e = row as {
        id?: string | number;
        mode?: string;
        status?: string;
        startedAt?: string;
        started?: string;
      };
      return {
        id: String(e.id ?? ''),
        mode: e.mode ?? null,
        status: e.status ?? null,
        started: e.startedAt ?? e.started ?? null
      };
    });
    // Both halves, or the click can only fail: we need a URL to call AND a
    // Webhook node at the far end for the call to land on.
    base.canRun = !!s.webhookUrl && base.workflow.hasWebhookNode;
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }
  return base;
}

/**
 * Fire the workflow's webhook. Refuses when the workflow has no Webhook node,
 * because POSTing to a path nothing is listening on returns a 404 that reads
 * like a broken app rather than an unwired feature.
 */
export async function triggerAutomation(): Promise<{ executionId: string | null }> {
  const s = await getN8nSettings();
  requireConfigured(s);
  if (!s.webhookUrl) {
    throw new N8nError(
      'No webhook URL set. Add it in Settings → Automations — the public n8n API cannot run a ' +
        'workflow, so a Webhook node is the only way to trigger one.',
      501
    );
  }

  const status = await fetchAutomationStatus(1);
  if (!status.error && !status.workflow.hasWebhookNode) {
    throw new N8nError(
      `The n8n workflow "${status.workflow.name ?? s.workflowId}" has no Webhook node, so the ` +
        'webhook URL has nothing to answer it. Add a Webhook node feeding the same first node ' +
        'the schedule uses, then reload.',
      501
    );
  }

  const requestedAt = new Date().toISOString();
  let res: Response;
  try {
    res = await fetch(s.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'ogre-desktop', requestedAt })
    });
  } catch (e) {
    throw new N8nError(
      `Could not reach the webhook at ${s.webhookUrl} — ${e instanceof Error ? e.message : e}`,
      0
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new N8nError(
      `The webhook returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}. ` +
        'If this is 404, the path does not match the Webhook node in n8n.',
      res.status
    );
  }

  // Best-effort: a webhook answers immediately and the execution row is written
  // a moment later, so the id is often not there yet. That race is not a failure;
  // the page re-reads status and the table fills itself in.
  let executionId: string | null = null;
  try {
    const after = await fetchAutomationStatus(1);
    const newest = after.executions[0];
    if (newest && (!newest.started || newest.started >= requestedAt)) {
      executionId = newest.id;
    }
  } catch {
    /* id is best-effort */
  }
  return { executionId };
}
