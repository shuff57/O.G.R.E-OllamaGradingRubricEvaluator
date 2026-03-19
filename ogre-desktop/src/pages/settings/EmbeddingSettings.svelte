<script lang="ts">
  ;
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../../lib/db';
  import { getEmbeddingCount } from '../../lib/vector-store';
  import { getHandshakeToken } from '../../lib/provider-sync';

  let useLocalEmbedding = false;
  let embeddingCount = 0;
  let embedTest: { status: 'idle' | 'testing' | 'ok' | 'error'; message: string } = { status: 'idle', message: '' };

  onMount(async () => {
    await loadEmbeddingSettings();
  });

  async function loadEmbeddingSettings() {
    useLocalEmbedding = (await getSetting('use_local_embedding')) === 'true';
    embeddingCount = await getEmbeddingCount();
  }

  async function testLocalEmbedding() {
    embedTest = { status: 'testing', message: '' };
    const t0 = performance.now();
    try {
      const token = getHandshakeToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('http://localhost:3456/api/embed', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider: 'local', text: 'embedding test' }),
      });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        const data = await res.json();
        const dims = data.embedding?.length ?? 0;
        embedTest = { status: 'ok', message: `${dims} dims · ${ms}ms` };
      } else {
        const text = await res.text();
        embedTest = { status: 'error', message: `Server error ${res.status}: ${text.slice(0, 120)}` };
      }
    } catch (err) {
      embedTest = { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async function toggleLocalEmbedding(e: Event) {
    const checkbox = e.currentTarget as HTMLInputElement;
    useLocalEmbedding = checkbox.checked;
    await setSetting('use_local_embedding', String(useLocalEmbedding));
  }
</script>

<!-- Embedding Model Section -->
<section class="card mb-6">
  <h3>Embedding Model</h3>
  <p class="mb-4">Choose which model to use for finding similar graded responses.</p>
  
  <label class="checkbox-label">
    <input type="checkbox" checked={useLocalEmbedding} onchange={toggleLocalEmbedding} />
    <span>Use local embedding model (free, no API calls)</span>
  </label>
  <p class="hint mt-2">Uses all-MiniLM-L6-v2 running locally. First use takes ~10 seconds to load. Switching models requires re-embedding your history.</p>
  {#if useLocalEmbedding}
    <div class="embed-test-row">
      <button class="secondary small" disabled={embedTest.status === 'testing'} onclick={testLocalEmbedding}>
        {embedTest.status === 'testing' ? 'Testing...' : 'Test'}
      </button>
      {#if embedTest.status !== 'idle'}
        <span class="embed-test-result" class:ok={embedTest.status === 'ok'} class:error={embedTest.status === 'error'}>
          {#if embedTest.status === 'ok'}✅{:else}❌{/if}
          {embedTest.message}
        </span>
      {/if}
    </div>
  {/if}
  
  {#if useLocalEmbedding && embeddingCount > 0}
    <div class="warning-banner">
      ⚠️ You have stored embeddings from a different model. Run 'Re-embed History' in the History section to update them.
    </div>
  {/if}
</section>

<style>
  .checkbox-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-2);
    cursor: pointer;
    margin-bottom: 0;
  }
  
  .checkbox-label input {
    width: auto;
    margin: 0;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin: 0 0 var(--spacing-2) 0;
  }

  .embed-test-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    margin-top: var(--spacing-3);
  }

  .embed-test-result {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .embed-test-result.ok {
    color: var(--color-success);
  }

  .embed-test-result.error {
    color: var(--color-error);
  }

  .warning-banner {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    padding: var(--spacing-2);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    border: 1px solid rgba(245, 158, 11, 0.4);
    margin-top: var(--spacing-4);
  }

  button.small {
    padding: 0.25rem 0.5rem;
    font-size: var(--font-size-xs);
  }
</style>
