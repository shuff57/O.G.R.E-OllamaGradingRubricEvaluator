<script lang="ts">
  /**
   * Automations: the desktop app's view of the n8n workflow that grades on a
   * schedule, and the button that runs it on demand.
   *
   * The one thing this page is careful about: the Run button is gated on the
   * LIVE workflow actually having a Webhook node, not merely on a URL being
   * saved. n8n's public API cannot execute a workflow (POST/PUT .../run -> 405,
   * GET -> 404), so a Webhook node is the only way to trigger one. Enabling the
   * button without that check produced a control that could only ever fail,
   * which reads as a broken app rather than an unwired feature.
   */
  import { onMount, onDestroy } from 'svelte';
  import { fetchAutomationStatus, triggerAutomation, type AutomationStatus } from '../lib/n8n';
  import { fetchStagedStatus, type StagedStatus } from '../lib/automations-server';

  // The staged count comes from a different server than the n8n status above,
  // and it is the more important number: n8n knows what RAN, the automations
  // server knows what it GRADED. A green "success" from n8n is exactly what
  // execution 376 reported while staging nothing useful.
  let staged: StagedStatus | null = null;

  let status: AutomationStatus | null = null;
  let loading = true;
  let running = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTries = 0;

  async function load() {
    try {
      status = await fetchAutomationStatus(10);
    } finally {
      loading = false;
    }
  }

  async function loadStaged() {
    staged = await fetchStagedStatus();
  }

  onMount(() => {
    load();
    loadStaged();
  });

  // n8n writes the execution row a moment after the webhook returns, so a single
  // read right after firing still shows the PREVIOUS run. Poll a few times, then
  // stop: this is a status display, not the grading path. A running workflow can
  // take a minute, so a handful of tries is deliberately not an unbounded wait.
  // n8n writes the execution row a moment after the webhook returns, and the
  // automations server writes the staged file a while after that, so a single
  // read right after firing still shows the PREVIOUS run AND the PREVIOUS staged
  // count. Both are polled, because the staged count is the number that actually
  // moves when a run grades something.
  //
  // Bounded, not an open-ended wait: a run takes a minute or so, and this is a
  // status display rather than the grading path.
  function startPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTries = 0;
    const tick = async () => {
      pollTries++;
      await refreshAll();
      if (pollTries < 12 && status?.canRun) pollTimer = setTimeout(tick, 5000);
    };
    pollTimer = setTimeout(tick, 4000);
  }

  async function refreshAll() {
    await Promise.all([load(), loadStaged()]);
  }

  onDestroy(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  async function run() {
    running = true;
    try {
      const r = await triggerAutomation();
      runMessage = r.executionId
        ? `Triggered — execution ${r.executionId}.`
        : 'Triggered. n8n has not published an execution id yet; the table fills in shortly.';
      startPolling();
    } catch (e) {
      runMessage = e instanceof Error ? e.message : String(e);
    } finally {
      running = false;
    }
  }

  let runMessage: string | null = null;

  $: wf = status?.workflow;
  $: canRun = !!status?.canRun;
  $: reason = !status
    ? null
    : !status.configured
      ? 'Not set up yet — add the n8n URL and API key in Settings → Automations.'
      : status.error
        ? null
        : !wf?.hasWebhookNode
          ? 'The n8n workflow has no Webhook node, so there is nothing to trigger. Add one feeding the same first node the schedule uses, then set the Webhook URL in Settings.'
          : !canRun
            ? 'Set the Webhook URL in Settings to enable triggering.'
            : null;
</script>

<div>
  <header class="mb-6">
    <h1>Automations</h1>
    <p class="text-muted">Scheduled grading runs, and running one now</p>
  </header>

  <!-- The headline number. n8n's own "success" is not the answer to "did it
       grade anything?" — execution 376 reported success while staging nothing,
       which is the entire reason this count exists. Shown first, before the
       run history, because it is the one that decides whether to go review. -->
  <section class="card mb-6 staged">
    <div class="row">
      <div>
        <h3>Waiting for review</h3>
        {#if staged?.error}
          <p class="msg warn">{staged.error}</p>
        {:else if staged}
          <p class="count">{staged.count}</p>
          <p class="text-muted">
            {staged.count === 1 ? 'question has' : 'questions have'} staged grades
            {#if staged.stagedAt}· last staged {staged.stagedAt}{/if}
          </p>
          {#if staged.keys.length}
            <ul class="keys">
              {#each staged.keys as k (k)}
                <li class="mono">{k}</li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    </div>
  </section>

  <section class="card mb-6">
    <div class="row">
      <div>
        <h3>{wf?.name ?? 'Workflow'}</h3>
        <p class="text-muted mono">{wf?.id}</p>
      </div>
      <div class="row-actions">
        <button onclick={refreshAll} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button class="primary" onclick={run} disabled={running || !canRun}>
          {running ? 'Triggering…' : 'Run now'}
        </button>
      </div>
    </div>

    {#if status?.error}
      <p class="msg err">{status.error}</p>
    {:else if status}
      <p class="msg ok">
        {status.workflow.active ? 'Active' : 'INACTIVE — not scheduled'}
        · webhook node {status.workflow.hasWebhookNode ? 'present' : 'missing'}
        · schedule node {status.workflow.hasScheduleNode ? 'present' : 'absent'}
      </p>
    {/if}

    {#if reason}
      <p class="msg warn">{reason}</p>
    {/if}
    {#if runMessage}
      <p class="msg">{runMessage}</p>
    {/if}
  </section>

  <section class="card">
    <h3>Recent runs</h3>
    {#if loading}
      <p class="text-muted">Loading…</p>
    {:else if !status?.executions.length}
      <p class="text-muted">No runs recorded yet.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Execution</th><th>Mode</th><th>Status</th><th>Started</th></tr>
        </thead>
        <tbody>
          {#each status.executions as e (e.id)}
            <tr>
              <td class="mono">{e.id}</td>
              <td>{e.mode ?? '—'}</td>
              <td>{e.status ?? '—'}</td>
              <td>{e.started ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1em;
    flex-wrap: wrap;
  }
  .row h3 {
    margin: 0 0 0.15em;
  }
  .row p {
    margin: 0;
  }
  .row-actions {
    display: flex;
    gap: 0.5em;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
  }
  .msg {
    margin: 0.75em 0 0;
    font-size: 0.92em;
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
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.5em;
  }
  th,
  td {
    text-align: left;
    padding: 0.4em 0.6em;
    border-bottom: 1px solid var(--border, #e5e5e5);
  }
  /* The count is the point of the page, so it gets the only large type here. */
  .staged h3 {
    margin: 0 0 0.1em;
  }
  .count {
    font-size: 2.6em;
    font-weight: 600;
    line-height: 1.1;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .keys {
    margin: 0.6em 0 0;
    padding-left: 1.2em;
    color: var(--text-muted, #888);
    font-size: 0.9em;
  }
</style>
