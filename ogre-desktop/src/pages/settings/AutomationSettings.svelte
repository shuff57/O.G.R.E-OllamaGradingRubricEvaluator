<script lang="ts">
  /**
   * n8n connection for the Automations page.
   *
   * The API key is a password field that stays masked once saved, and the saved
   * value is never echoed back into the DOM — a stored secret that renders into
   * a text input is a secret that ends up in a screenshot or a devtools
   * session. Leaving the field empty means "keep the stored key", so the user
   * never has to retype it to change the base URL.
   */
  import { onMount } from 'svelte';
  import {
    getN8nSettings,
    saveN8nSettings,
    clearN8nSettings,
    DEFAULT_N8N_WORKFLOW_ID
  } from '../../lib/db';
  import { fetchAutomationStatus, type AutomationStatus } from '../../lib/n8n';
  import {
    getAutomationsBaseUrl,
    setAutomationsBaseUrl,
    DEFAULT_AUTOMATIONS_BASE_URL
  } from '../../lib/db';
  import { fetchStagedStatus } from '../../lib/automations-server';

  let baseUrl = '';
  let apiKey = '';
  let workflowId = DEFAULT_N8N_WORKFLOW_ID;
  let webhookUrl = '';
  let storedKey = false;
  let testing = false;
  let saving = false;
  let message: { text: string; kind: 'ok' | 'warn' | 'err' } | null = null;
  let probe: AutomationStatus | null = null;

  // The automations server is a different app on a different host. It is the
  // only thing that can report the staged grade count, so it gets its own field
  // rather than being derived from the n8n URL.
  let automationsUrl = DEFAULT_AUTOMATIONS_BASE_URL;
  let stagedProbe: { count: number; stagedAt: string | null; error: string | null } | null = null;

  onMount(async () => {
    const s = await getN8nSettings();
    baseUrl = s.baseUrl;
    workflowId = s.workflowId || DEFAULT_N8N_WORKFLOW_ID;
    webhookUrl = s.webhookUrl;
    storedKey = !!s.apiKey;
    storedKey = !!s.apiKey;
    automationsUrl = await getAutomationsBaseUrl();
  });

  async function save() {
    if (!baseUrl.trim()) {
      message = { text: 'A base URL is required.', kind: 'err' };
      return;
    }
    saving = true;
    try {
      const current = await getN8nSettings();
      await saveN8nSettings({
        baseUrl,
        // Empty means "keep what is stored" so the key is not retyped or
        // exposed to confirm the rest of the form.
        apiKey: apiKey.trim() || current.apiKey,
        workflowId,
        webhookUrl
      });
      apiKey = '';
      storedKey = true;
      // Saved independently of the n8n fields: a reachable automations server is
      // useful even with no n8n configured, and vice versa.
      await setAutomationsBaseUrl(automationsUrl);
      message = { text: 'Saved.', kind: 'ok' };
      probe = null;
      stagedProbe = null;
    } catch (e) {
      message = { text: 'Could not save: ' + (e instanceof Error ? e.message : e), kind: 'err' };
    } finally {
      saving = false;
    }
  }

  async function test() {
    testing = true;
    message = null;
    try {
      // Test what is in the form, not what is stored, so an unsaved fix can be
      // checked before committing to it.
      if (apiKey.trim() || !storedKey) {
        await saveN8nSettings({
          baseUrl,
          apiKey: apiKey.trim() || (await getN8nSettings()).apiKey,
          workflowId,
          webhookUrl
        });
        apiKey = '';
        storedKey = true;
      }
      // Probe both halves. They are separate hosts and either can be down without
      // affecting the other, so neither failure hides the other's success.
      probe = await fetchAutomationStatus(5);
      await setAutomationsBaseUrl(automationsUrl);
      stagedProbe = await fetchStagedStatus();
      message = probe.error
        ? { text: probe.error, kind: 'err' }
        : {
            text: `Connected — "${probe.workflow.name ?? probe.workflow.id}" is ${probe.workflow.active ? 'active' : 'INACTIVE'}.`
              + (stagedProbe.error
                ? ` Staged count unavailable: ${stagedProbe.error}`
                : ` Staged: ${stagedProbe.count} question(s) waiting for review.`),
            kind: stagedProbe.error ? 'warn' : 'ok'
          };
    } catch (e) {
      message = { text: e instanceof Error ? e.message : String(e), kind: 'err' };
    } finally {
      testing = false;
    }
  }

  async function clear() {
    if (!confirm('Remove the stored n8n URL, API key and workflow id?')) return;
    await clearN8nSettings();
    baseUrl = '';
    apiKey = '';
    webhookUrl = '';
    workflowId = DEFAULT_N8N_WORKFLOW_ID;
    storedKey = false;
    probe = null;
    message = { text: 'Cleared.', kind: 'ok' };
  }
</script>

<section class="card mb-6">
  <h3>Automations (n8n)</h3>
  <p class="hint">
    Lets this app run and watch the n8n workflow that grades on a schedule. The key is stored
    in this machine's database and never shown again after saving.
  </p>

  <div class="form-grid">
    <label>
      <span>Base URL</span>
      <input
        type="text"
        bind:value={baseUrl}
        placeholder="https://n8n.example.com"
        autocomplete="off"
      />
    </label>

    <label>
      <span>API key</span>
      <input
        type="password"
        bind:value={apiKey}
        placeholder={storedKey ? '•••••••• (saved — leave empty to keep)' : 'n8n_...'}
        autocomplete="off"
      />
    </label>

    <label>
      <span>Workflow ID</span>
      <input type="text" bind:value={workflowId} placeholder={DEFAULT_N8N_WORKFLOW_ID} />
    </label>

    <label>
      <span>Webhook URL <em>(needed to trigger a run)</em></span>
      <input
        type="text"
        bind:value={webhookUrl}
        placeholder="https://n8n.example.com/webhook/your-path"
      />
    </label>

    <label>
      <span>Automations server <em>(for the staged grade count)</em></span>
      <input
        type="text"
        bind:value={automationsUrl}
        placeholder={DEFAULT_AUTOMATIONS_BASE_URL}
      />
    </label>
  </div>

  <div class="actions">
    <button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    <button onclick={test} disabled={testing}>{testing ? 'Testing…' : 'Save & test'}</button>
    <button class="danger" onclick={clear}>Clear</button>
    {#if message}
      <span class="msg {message.kind}">{message.text}</span>
    {/if}
  </div>

  {#if probe && !probe.error}
    <dl class="probe">
      <dt>Workflow</dt>
      <dd>{probe.workflow.name ?? probe.workflow.id}</dd>
      <dt>Active</dt>
      <dd>{probe.workflow.active ? 'yes' : 'no'}</dd>
      <dt>Webhook node</dt>
      <dd>{probe.workflow.hasWebhookNode ? 'present — runs can be triggered' : 'MISSING — a run cannot be triggered'}</dd>
      <dt>Schedule node</dt>
      <dd>{probe.workflow.hasScheduleNode ? 'present' : 'absent'}</dd>
    </dl>
    {#if !probe.canRun}
      <p class="hint warn">
        {#if !probe.workflow.hasWebhookNode}
          n8n's public API cannot run a workflow, so a <strong>Webhook</strong> node has to exist in
          the workflow for this app to trigger one. Add it feeding the same first node the schedule
          uses, then set the Webhook URL above.
        {:else}
          Set the Webhook URL above to enable triggering.
        {/if}
      </p>
    {/if}
  {/if}

  <!-- The automations server is a separate host, so it gets its own result even
       when n8n is unreachable. Shown independently so one failure never hides
       the other's answer. -->
  {#if stagedProbe}
    <dl class="probe">
      <dt>Staged grades</dt>
      {#if stagedProbe.error}
        <dd class="err-text">{stagedProbe.error}</dd>
      {:else}
        <dd>
          {stagedProbe.count} question{stagedProbe.count === 1 ? '' : 's'} waiting for review
          {#if stagedProbe.stagedAt}<span class="text-muted"> · last staged {stagedProbe.stagedAt}</span>{/if}
        </dd>
      {/if}
    </dl>
  {/if}
</section>

<style>
  .hint {
    color: var(--text-muted, #888);
    font-size: 0.9em;
    margin: 0 0 0.75em;
  }
  /* The parentheticals live inside a form label's <span>, not inside .hint, so
     this was `.hint em` and matched nothing. Caught by the svelte compiler when
     the render harness compiled the component for the first time. */
  .form-grid label em {
    font-style: normal;
    opacity: 0.75;
  }
  .hint.warn {
    color: #b45309;
  }
  .form-grid {
    display: grid;
    gap: 0.75em;
  }
  .form-grid label {
    display: grid;
    gap: 0.25em;
  }
  .form-grid label > span {
    font-size: 0.85em;
    color: var(--text-muted, #888);
  }
  .actions {
    display: flex;
    gap: 0.5em;
    align-items: center;
    margin-top: 0.75em;
    flex-wrap: wrap;
  }
  .msg {
    font-size: 0.9em;
  }
  .msg.ok {
    color: #15803d;
  }
  .msg.warn {
    color: #b45309;
  }
  .msg.err {
    color: #b91c1c;
  }
  .probe {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25em 1em;
    margin: 0.9em 0 0;
    font-size: 0.9em;
  }
  .probe dt {
    color: var(--text-muted, #888);
  }
  .probe dd {
    margin: 0;
  }
  .err-text {
    color: #b91c1c;
  }
</style>
