<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { openBrowser, closeBrowser, listenBrowserStatus, GRADING_SITE_PRESETS } from '../lib/browser';
  import type { BrowserStatus } from '../lib/browser';
  import { getSetting, setSetting } from '../lib/db';

  let urlInput = '';
  let browserStatus: BrowserStatus = 'closed';
  let savedUrls: { name: string; url: string }[] = [];
  let newSaveName = '';
  let showSaveForm = false;
  let errorMessage = '';
  let unlistenStatus: (() => void) | undefined;

  onMount(async () => {
    const saved = await getSetting('browser_saved_urls');
    if (saved) {
      try { savedUrls = JSON.parse(saved); } catch { savedUrls = []; }
    }

    unlistenStatus = await listenBrowserStatus((status) => {
      browserStatus = status;
    });
  });

  onDestroy(() => {
    if (unlistenStatus) unlistenStatus();
  });

  async function handleOpen() {
    if (!urlInput.trim()) return;
    errorMessage = '';
    try {
      await openBrowser(urlInput);
      browserStatus = 'open';
    } catch (e: any) {
      errorMessage = e?.message || String(e);
    }
  }

  async function handlePreset(url: string) {
    urlInput = url;
    await handleOpen();
  }

  async function handleSaveUrl() {
    if (!urlInput.trim() || !newSaveName.trim()) return;
    savedUrls = [...savedUrls, { name: newSaveName.trim(), url: urlInput.trim() }];
    await setSetting('browser_saved_urls', JSON.stringify(savedUrls));
    newSaveName = '';
    showSaveForm = false;
  }

  async function handleRemoveSaved(index: number) {
    savedUrls = savedUrls.filter((_, i) => i !== index);
    await setSetting('browser_saved_urls', JSON.stringify(savedUrls));
  }

  async function handleClose() {
    await closeBrowser();
    browserStatus = 'closed';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleOpen();
  }
</script>

<div class="browser-page">
  <header>
    <h1>Browser</h1>
    <span class="status-badge" class:open={browserStatus === 'open'}>
      {browserStatus === 'open' ? 'Window Open' : 'Window Closed'}
    </span>
  </header>

  <section class="url-bar-section">
    <div class="url-bar">
      <input
        type="text"
        bind:value={urlInput}
        placeholder="Enter URL (e.g. https://canvas.instructure.com)"
        on:keydown={handleKeydown}
      />
      <button class="btn primary" on:click={handleOpen}>
        {browserStatus === 'open' ? 'Navigate' : 'Open Browser'}
      </button>
      {#if browserStatus === 'open'}
        <button class="btn secondary" on:click={handleClose}>Close</button>
      {/if}
    </div>
    {#if errorMessage}
      <div class="error-msg">{errorMessage}</div>
    {/if}
  </section>

  <section class="presets">
    <h2>Quick Launch</h2>
    <div class="preset-grid">
      {#each GRADING_SITE_PRESETS as preset}
        <button class="preset-btn" on:click={() => handlePreset(preset.url)}>
          <span class="preset-name">{preset.name}</span>
          <span class="preset-url">{preset.url}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="saved-urls">
    <h2>Saved URLs</h2>
    {#if savedUrls.length === 0}
      <p class="empty-state">No saved URLs yet. Enter a URL above and save it for quick access.</p>
    {:else}
      <div class="saved-list">
        {#each savedUrls as saved, i}
          <div class="saved-item">
            <button class="saved-btn" on:click={() => handlePreset(saved.url)}>
              <span class="saved-name">{saved.name}</span>
              <span class="saved-url">{saved.url}</span>
            </button>
            <button class="remove-btn" on:click={() => handleRemoveSaved(i)} title="Remove">x</button>
          </div>
        {/each}
      </div>
    {/if}
    {#if urlInput.trim()}
      {#if !showSaveForm}
        <button class="btn save-current" on:click={() => { showSaveForm = true; }}>
          Save current URL
        </button>
      {:else}
        <div class="save-form">
          <input type="text" bind:value={newSaveName} placeholder="Name (e.g. My Canvas)" />
          <button class="btn primary" on:click={handleSaveUrl}>Save</button>
          <button class="btn secondary" on:click={() => { showSaveForm = false; }}>Cancel</button>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .browser-page {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid var(--color-border);
    padding-bottom: 1rem;
  }

  h1 {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 2rem;
  }

  h2 {
    color: var(--color-text-primary);
    margin-bottom: 1rem;
    font-size: 1.3rem;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 500;
    background: var(--color-error-bg, #fde8e8);
    color: var(--color-error, #c53030);
  }

  .status-badge.open {
    background: var(--color-success-bg, #e6ffed);
    color: var(--color-success, #2f855a);
  }

  /* URL Bar */
  .url-bar-section {
    margin-bottom: 2rem;
  }

  .url-bar {
    display: flex;
    gap: 0.5rem;
    background: var(--color-bg-card);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }

  .url-bar input {
    flex: 1;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 0.95rem;
    background: var(--color-bg-main);
    color: var(--color-text-primary);
  }

  .url-bar input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
  }

  .btn {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .btn.primary {
    background: var(--color-primary);
    color: var(--color-primary-text, #fff);
  }

  .btn.primary:hover {
    filter: brightness(1.1);
  }

  .btn.secondary {
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .btn.secondary:hover {
    background: var(--color-bg-card-hover);
  }

  .error-msg {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-error-bg, #fde8e8);
    color: var(--color-error, #c53030);
    border-radius: 6px;
    font-size: 0.85rem;
  }

  /* Presets */
  .presets {
    margin-bottom: 2rem;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .preset-btn {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .preset-name {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 1rem;
  }

  .preset-url {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-family: monospace;
  }

  /* Saved URLs */
  .saved-urls {
    margin-bottom: 2rem;
  }

  .empty-state {
    color: var(--color-text-muted);
    font-style: italic;
    padding: 1rem;
    background: var(--color-bg-card);
    border-radius: 8px;
    border: 1px dashed var(--color-border);
  }

  .saved-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .saved-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .saved-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .saved-btn:hover {
    border-color: var(--color-primary);
    background: var(--color-bg-card-hover);
  }

  .saved-name {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .saved-url {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    font-family: monospace;
  }

  .remove-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-card);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .remove-btn:hover {
    background: var(--color-error-bg, #fde8e8);
    color: var(--color-error, #c53030);
    border-color: var(--color-error, #c53030);
  }

  .save-current {
    margin-top: 0.5rem;
    background: none;
    color: var(--color-primary);
    border: 1px dashed var(--color-primary);
  }

  .save-current:hover {
    background: var(--color-bg-card);
  }

  .save-form {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    align-items: center;
  }

  .save-form input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--color-bg-main);
    color: var(--color-text-primary);
  }
</style>
