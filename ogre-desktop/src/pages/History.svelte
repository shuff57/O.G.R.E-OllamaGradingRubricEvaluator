<script lang="ts">
  import { onMount } from "svelte";
  import { getGradingSessions, getSetting, getProviderConfigs, initDB } from "../lib/db";
  import type { GradingSession } from "../lib/db";
  import { open } from "@tauri-apps/plugin-shell";
  import { deleteEmbeddingsBySessionId } from "../lib/vector-store";
  import { getEmbeddingStats, getSessionEmbeddingCounts, type EmbeddingStats } from "../lib/embedding-stats";
  import { reEmbedAll } from "../lib/re-embed";

  /** Incremented by App.svelte when a new grading session is recorded */
  export let sessionVersion = 0;

  let sessions: GradingSession[] = [];
  let embeddingStats: EmbeddingStats | null = null;
  let sessionEmbeddingCounts = new Map<number, number>();
  let reEmbedRunning = false;
  let reEmbedDone = 0;
  let reEmbedTotal = 0;
  let reEmbedMessage: string | null = null;
  let visibleColumns: string[] = [];
  let sortColumn: string | null = "created_at";
  let sortAscending = false;
  let currentPage = 0;
  const pageSize = 25;

  $: totalPages = Math.ceil(sessions.length / pageSize);
  $: paginatedSessions = sessions.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  // Reactively reload when sessionVersion changes (new session recorded)
  $: if (sessionVersion >= 0) {
    loadData();
  }

  onMount(async () => {
    await loadData();

    const columnsJson = await getSetting("history_visible_columns");
    visibleColumns = columnsJson
      ? JSON.parse(columnsJson)
      : [
          "timestamp",
          "provider",
          "model",
          "studentCount",
          "meanScore",
          "pageUrl",
          "embeddings",
        ];
  });

  async function loadData() {
    sessions = await getGradingSessions();
    try {
      embeddingStats = await getEmbeddingStats();
      sessionEmbeddingCounts = await getSessionEmbeddingCounts();
    } catch { /* non-critical */ }
  }

  function sortBy(column: keyof GradingSession) {
    if (sortColumn === column) {
      sortAscending = !sortAscending;
    } else {
      sortColumn = column;
      sortAscending = true;
    }

    sessions = sessions.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];

      if (aVal === null) aVal = "";
      if (bVal === null) bVal = "";

      if (aVal < bVal) return sortAscending ? -1 : 1;
      if (aVal > bVal) return sortAscending ? 1 : -1;
      return 0;
    });
  }

  async function clearHistory() {
    if (
      !confirm(
        "Are you sure you want to delete all grading history? This cannot be undone."
      )
    ) {
      return;
    }

    // Delete all sessions (and embeddings)
    const db = await initDB();
    await db.execute("DELETE FROM response_embeddings");
    await db.execute("DELETE FROM grading_sessions");
    await loadData();
    currentPage = 0;
  }

  async function deleteSessionEmbeddings(sessionId: number) {
    if (!confirm("Delete all embeddings for this session? This removes its calibration data.")) return;
    await deleteEmbeddingsBySessionId(sessionId);
    embeddingStats = await getEmbeddingStats();
    sessionEmbeddingCounts = await getSessionEmbeddingCounts();
  }

  async function clearAllEmbeddings() {
    if (!confirm("Delete ALL embeddings? This removes all historical calibration data. Cannot be undone.")) return;
    const db = await initDB();
    await db.execute("DELETE FROM response_embeddings");
    embeddingStats = await getEmbeddingStats();
    sessionEmbeddingCounts = await getSessionEmbeddingCounts();
  }

  async function handleReEmbed() {
    if (reEmbedRunning) return;
    reEmbedRunning = true;
    reEmbedDone = 0;
    reEmbedTotal = 0;
    reEmbedMessage = null;

    try {
      // Determine current embedding provider
      const useLocal = await getSetting('use_local_embedding');
      let provider: string;
      let model: string;
      let apiKey: string | undefined;
      let apiUrl: string | undefined;

      if (useLocal === 'true') {
        provider = 'local';
        model = 'Xenova/all-MiniLM-L6-v2';
      } else {
        const configs = await getProviderConfigs();
        const active = configs.find(c => c.is_active === 1);
        if (!active) {
          reEmbedMessage = 'No active provider configured.';
          reEmbedRunning = false;
          return;
        }
        provider = active.id;
        model = active.model ?? '';
        apiKey = active.api_key ?? undefined;
        apiUrl = active.api_url ?? undefined;
      }

      const result = await reEmbedAll(
        provider,
        model,
        (done, total) => {
          reEmbedDone = done;
          reEmbedTotal = total;
        },
        apiKey,
        apiUrl,
      );

      reEmbedMessage = `Updated ${result.updated} embeddings to ${model}` +
        (result.failed > 0 ? ` (${result.failed} failed)` : '');
      await loadData();
    } catch (err) {
      reEmbedMessage = `Re-embed error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      reEmbedRunning = false;
    }
  }

  function openUrl(url: string | null) {
    if (url) {
      open(url);
    }
  }
</script>

<div class="history-page">
  <header>
    <div class="title-group">
      <h2>Grading History</h2>
      <span class="subtitle">{sessions.length} sessions recorded</span>
    </div>
    {#if sessions.length > 0}
      <button class="clear-btn" on:click={clearHistory}>Clear History</button>
    {/if}
  </header>

  {#if embeddingStats && embeddingStats.totalEmbeddings > 0}
    <div class="vector-db-card">
      <div class="vector-db-title">🧠 Vector Database</div>
      <div class="vector-db-stats">
        <span><strong>{embeddingStats.totalEmbeddings}</strong> embeddings</span>
        <span><strong>{embeddingStats.uniqueRubrics}</strong> unique rubrics</span>
        <span>~<strong>{embeddingStats.estimatedSizeKB}</strong> KB</span>
        {#if embeddingStats.embeddingModels.length > 0}
          <span class="model">{embeddingStats.embeddingModels.join(', ')}</span>
        {/if}
      </div>
      <button class="clear-btn" on:click={clearAllEmbeddings}>Clear All Embeddings</button>
    </div>
  {/if}

  {#if embeddingStats && embeddingStats.totalEmbeddings > 0}
    <div class="re-embed-card">
      <div class="re-embed-header">
        <span class="re-embed-title">Re-embed History</span>
        <button
          class="re-embed-btn"
          disabled={reEmbedRunning || embeddingStats.totalEmbeddings === 0}
          on:click={handleReEmbed}
        >
          {reEmbedRunning ? 'Re-embedding…' : 'Re-embed All'}
        </button>
      </div>
      {#if reEmbedRunning}
        <div class="re-embed-progress">
          <progress value={reEmbedDone} max={reEmbedTotal}></progress>
          <span class="re-embed-count">{reEmbedDone} / {reEmbedTotal}</span>
        </div>
      {/if}
      {#if reEmbedMessage}
        <div class="re-embed-result">{reEmbedMessage}</div>
      {/if}
    </div>
  {/if}

  {#if sessions.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📂</div>
      <h3>No grading sessions yet</h3>
      <p>Grade some students to see your history here!</p>
    </div>
  {:else}
    <div class="table-wrapper">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              {#if visibleColumns.includes("timestamp")}
                <th on:click={() => sortBy("created_at")}>
                  <div class="th-content">
                    Timestamp
                    {#if sortColumn === "created_at"}
                      <span class="sort-icon">{sortAscending ? "▲" : "▼"}</span>
                    {/if}
                  </div>
                </th>
              {/if}
              {#if visibleColumns.includes("provider")}
                <th on:click={() => sortBy("provider_id")}>
                  <div class="th-content">
                    Provider
                    {#if sortColumn === "provider_id"}
                      <span class="sort-icon">{sortAscending ? "▲" : "▼"}</span>
                    {/if}
                  </div>
                </th>
              {/if}
              {#if visibleColumns.includes("model")}
                <th on:click={() => sortBy("model")}>
                  <div class="th-content">
                    Model
                    {#if sortColumn === "model"}
                      <span class="sort-icon">{sortAscending ? "▲" : "▼"}</span>
                    {/if}
                  </div>
                </th>
              {/if}
              {#if visibleColumns.includes("studentCount")}
                <th on:click={() => sortBy("student_count")}>
                  <div class="th-content">
                    Students
                    {#if sortColumn === "student_count"}
                      <span class="sort-icon">{sortAscending ? "▲" : "▼"}</span>
                    {/if}
                  </div>
                </th>
              {/if}
              {#if visibleColumns.includes("meanScore")}
                <th on:click={() => sortBy("mean_score")}>
                  <div class="th-content">
                    Mean Score
                    {#if sortColumn === "mean_score"}
                      <span class="sort-icon">{sortAscending ? "▲" : "▼"}</span>
                    {/if}
                  </div>
                </th>
              {/if}
              {#if visibleColumns.includes("pageUrl")}
                <th>Page URL</th>
              {/if}
              {#if visibleColumns.includes("embeddings")}
                <th>Embeddings</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each paginatedSessions as session (session.id)}
              <tr>
                {#if visibleColumns.includes("timestamp")}
                  <td class="timestamp">
                    {new Date(session.created_at).toLocaleString()}
                  </td>
                {/if}
                {#if visibleColumns.includes("provider")}
                  <td>
                    <span class="badge provider">
                      {session.provider_id || "N/A"}
                    </span>
                  </td>
                {/if}
                {#if visibleColumns.includes("model")}
                  <td class="model">{session.model || "N/A"}</td>
                {/if}
                {#if visibleColumns.includes("studentCount")}
                  <td class="numeric">{session.student_count || 0}</td>
                {/if}
                {#if visibleColumns.includes("meanScore")}
                  <td class="numeric font-mono">
                    {session.mean_score?.toFixed(2) || "N/A"}
                  </td>
                {/if}
                {#if visibleColumns.includes("pageUrl")}
                  <td>
                    {#if session.page_url}
                      <button
                        class="link-btn"
                        on:click={() => openUrl(session.page_url)}
                        title={session.page_url}
                      >
                        Open ↗
                      </button>
                    {:else}
                      <span class="text-muted">N/A</span>
                    {/if}
                  </td>
                {/if}
                {#if visibleColumns.includes("embeddings")}
                  <td class="numeric">
                    {#if sessionEmbeddingCounts.get(session.id)}
                      <span class="badge embedded">✓ {sessionEmbeddingCounts.get(session.id)} vectors</span>
                      <button class="del-embed-btn" on:click={() => deleteSessionEmbeddings(session.id)}>✕</button>
                    {:else}
                      <span class="text-muted">—</span>
                    {/if}
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if totalPages > 1}
      <footer class="pagination">
        <button
          class="page-btn"
          disabled={currentPage === 0}
          on:click={() => currentPage--}
        >
          Previous
        </button>
        <span class="page-info">
          Page <strong>{currentPage + 1}</strong> of <strong>{totalPages}</strong>
        </span>
        <button
          class="page-btn"
          disabled={currentPage >= totalPages - 1}
          on:click={() => currentPage++}
        >
          Next
        </button>
      </footer>
    {/if}
  {/if}
</div>

<style>
  .history-page {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
    box-sizing: border-box;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid var(--border-color, #eee);
    padding-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-color, #333);
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--text-muted, #666);
    margin-top: 0.25rem;
    display: block;
  }

  .clear-btn {
    background: transparent;
    border: 1px solid var(--danger-color, #ef4444);
    color: var(--danger-color, #ef4444);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .clear-btn:hover {
    background: var(--danger-color, #ef4444);
    color: white;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    background: var(--bg-secondary, #f9fafb);
    border-radius: 12px;
    border: 1px dashed var(--border-color, #e5e7eb);
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text-color, #333);
  }

  .empty-state p {
    color: var(--text-muted, #666);
    margin: 0;
  }

  .table-wrapper {
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .table-container {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9375rem;
    text-align: left;
    background: var(--color-bg-card);
  }

  th {
    background: var(--bg-secondary, #f9fafb);
    padding: 0.75rem 1rem;
    font-weight: 600;
    color: var(--text-muted, #4b5563);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
    white-space: nowrap;
  }

  th:hover {
    background: var(--bg-hover, #f3f4f6);
    color: var(--text-color, #111);
  }

  .th-content {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .sort-icon {
    font-size: 0.7rem;
    opacity: 0.7;
  }

  td {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border-color, #f3f4f6);
    color: var(--text-color, #374151);
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background-color: var(--bg-highlight, #f9fafb);
  }

  /* Column specific styles */
  .timestamp {
    color: var(--text-muted, #666);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    background: var(--badge-bg, #e5e7eb);
    color: var(--badge-text, #374151);
  }

  .model {
    font-family: monospace;
    font-size: 0.85em;
    color: var(--primary-color, #2563eb);
  }

  .numeric {
    font-variant-numeric: tabular-nums;
  }

  .font-mono {
    font-family: monospace;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--primary-color, #2563eb);
    padding: 0;
    font-size: 0.875rem;
    cursor: pointer;
    text-decoration: none;
    font-weight: 500;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .text-muted {
    color: var(--color-text-muted);
    font-style: italic;
    font-size: 0.85em;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: auto;
    padding-top: 1rem;
  }

  .page-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--color-text-primary);
    transition: all 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--text-muted, #9ca3af);
    background: var(--bg-hover, #f9fafb);
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--bg-secondary, #f3f4f6);
  }

  .page-info {
    font-size: 0.875rem;
    color: var(--text-muted, #6b7280);
  }

  strong {
    color: var(--text-color, #111);
    font-weight: 600;
  }
  strong {
    color: var(--text-color, #111);
    font-weight: 600;
  }

  .vector-db-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #f0f9ff);
    border: 1px solid var(--border-color, #bae6fd);
    border-radius: 8px;
    font-size: 0.875rem;
    flex-wrap: wrap;
  }

  .vector-db-title {
    font-weight: 600;
    color: var(--text-color, #0369a1);
  }

  .vector-db-stats {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    color: var(--text-muted, #555);
    flex: 1;
  }

  .badge.embedded {
    background: #d1fae5;
    color: #065f46;
  }

  .del-embed-btn {
    background: none;
    border: none;
    color: var(--danger-color, #ef4444);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0 0.25rem;
    opacity: 0.6;
  }

  .del-embed-btn:hover {
    opacity: 1;
  }

  .re-embed-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #fffbeb);
    border: 1px solid var(--border-color, #fde68a);
    border-radius: 8px;
    font-size: 0.875rem;
  }

  .re-embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .re-embed-title {
    font-weight: 600;
    color: var(--text-color, #92400e);
  }

  .re-embed-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--primary-color, #2563eb);
    background: var(--primary-color, #2563eb);
    color: white;
    border-radius: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .re-embed-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .re-embed-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .re-embed-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .re-embed-progress progress {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    appearance: none;
  }

  .re-embed-progress progress::-webkit-progress-bar {
    background: var(--border-color, #e5e7eb);
    border-radius: 3px;
  }

  .re-embed-progress progress::-webkit-progress-value {
    background: var(--primary-color, #2563eb);
    border-radius: 3px;
  }

  .re-embed-count {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted, #6b7280);
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .re-embed-result {
    color: var(--text-color, #374151);
    font-size: 0.8125rem;
  }
</style>