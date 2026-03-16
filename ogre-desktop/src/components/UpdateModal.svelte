<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Update } from '@tauri-apps/plugin-updater';
  import { installUpdate, type DownloadProgress } from '../lib/updater';

  export let isOpen = false;
  export let version = '';
  export let notes = '';
  export let update: Update | undefined = undefined;

  const dispatch = createEventDispatcher();

  let installing = false;
  let progress: DownloadProgress | null = null;
  let error = '';

  async function handleUpdate() {
    if (!update) return;
    installing = true;
    error = '';
    try {
      await installUpdate(update, (p) => {
        progress = p;
      });
      // relaunch() is called inside installUpdate — we won't reach here normally
    } catch (err: any) {
      error = err?.message ?? 'Update failed. Please try again later.';
      installing = false;
    }
  }

  function handleLater() {
    dispatch('close');
  }
</script>

{#if isOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Update available">
    <div class="modal">
      <h2>Update Available</h2>

      <p class="version-info">
        Version <strong>{version}</strong> is ready to install.
      </p>

      {#if notes}
        <div class="notes-container">
          <h3>Release Notes</h3>
          <div class="notes">{notes}</div>
        </div>
      {/if}

      {#if error}
        <p class="error">{error}</p>
      {/if}

      {#if installing}
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {progress?.percent ?? 0}%"></div>
          </div>
          <span class="progress-text">{progress?.percent ?? 0}%</span>
        </div>
      {/if}

      <div class="actions">
        <button
          class="btn-primary"
          on:click={handleUpdate}
          disabled={installing || !update}
        >
          {installing ? 'Downloading...' : 'Update Now'}
        </button>
        <button
          class="btn-secondary"
          on:click={handleLater}
          disabled={installing}
        >
          Later
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal {
    background: var(--color-bg-card);
    border-radius: 8px;
    padding: 2rem;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
    color: var(--color-text-primary);
  }

  .version-info {
    color: var(--color-text-secondary);
    margin: 0 0 1rem;
  }

  .notes-container h3 {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .notes {
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.75rem;
    max-height: 160px;
    overflow-y: auto;
    font-size: 0.9rem;
    white-space: pre-wrap;
    color: var(--color-text-primary);
    margin-bottom: 1rem;
  }

  .error {
    color: var(--color-error);
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }

  .progress-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--color-bg-main);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: var(--radius-md);
    transition: width 0.2s ease;
  }

  .progress-text {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    min-width: 3rem;
    text-align: right;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-text);
    border: none;
    padding: 0.6rem 1.25rem;
    border-radius: var(--radius-md);
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: none;
    border: 1px solid var(--color-border);
    padding: 0.6rem 1.25rem;
    border-radius: var(--radius-md);
    font-size: 0.95rem;
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: background 0.2s;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
