<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { 
    createEmbeddedBrowser, 
    navigateEmbedded, 
    goBack, 
    goForward, 
    reloadBrowser,
    setWebviewBounds,
    getEmbeddedUrl,
    listenBrowserUrlChanged, 
    listenBrowserPageLoaded,
    injectAutofill,
    GRADING_SITE_PRESETS 
  } from '../lib/browser';
  import { getSetting, setSetting, getSiteCredentials } from '../lib/db';
  import { matchCredentialsToUrl } from '../lib/autofill';

  // State
  let urlInput = '';
  let isLoading = false;
  let showPresets = true;
  let browserCreated = false;
  let toastMessage = '';
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  
  // Saved URLs
  let savedUrls: { name: string; url: string }[] = [];
  let newSaveName = '';
  let showSaveForm = false;

  // Event Listeners
  let unlistenUrl: (() => void) | undefined;
  let unlistenLoaded: (() => void) | undefined;

  /** Show a transient toast notification */
  function showToast(message: string, durationMs = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage = message;
    toastTimer = setTimeout(() => { toastMessage = ''; }, durationMs);
  }

  /** Check credentials and inject auto-fill for the loaded URL */
  async function tryAutofill(url: string) {
    try {
      const credentials = await getSiteCredentials();
      const match = matchCredentialsToUrl(url, credentials);
      if (match) {
        await injectAutofill(match.username, match.password);
        showToast(`Auto-filled credentials for ${match.site_name}`);
      }
    } catch (e) {
      console.error('[Autofill] Failed:', e);
    }
  }

  /** Calculate and apply webview bounds accounting for sidebar state */
  function updateWebviewBounds() {
    if (!browserCreated) return;
    
    // Get actual sidebar width from DOM (handles both collapsed and expanded states)
    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
    
    // Get the nav-bar height from the DOM element
    const navBar = document.querySelector('.nav-bar');
    const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;
    
    // Calculate presets panel height if visible
    const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
    const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;
    
    const x = sidebarWidth;
    const y = navBarHeight + presetsPanelHeight;
    const width = window.innerWidth - sidebarWidth;
    const height = window.innerHeight - y;
    
    if (width > 0 && height > 0) {
      setWebviewBounds(x, y, width, height).catch((e) => {
        console.error('Failed to set webview bounds:', e);
      });
    }
  }

  // Recalculate webview bounds when presets panel visibility changes
  $: {
    showPresets;
    if (browserCreated) {
      tick().then(() => updateWebviewBounds());
    }
  }

  onMount(async () => {
    // Load saved URLs
    const saved = await getSetting('browser_saved_urls');
    if (saved) {
      try { savedUrls = JSON.parse(saved); } catch { savedUrls = []; }
    }

    // Set up listeners
    unlistenUrl = await listenBrowserUrlChanged((url) => {
      urlInput = url;
    });

    unlistenLoaded = await listenBrowserPageLoaded(async (url: string) => {
      isLoading = false;
      await tryAutofill(url);
    });

    // Check if webview already exists (persists across page switches)
    try {
      const currentUrl = await getEmbeddedUrl();
      if (currentUrl) {
        browserCreated = true;
        urlInput = currentUrl;
        showPresets = false;
        await tick();
        updateWebviewBounds();
      }
    } catch {
      // Webview doesn't exist yet — that's fine
    }
  });

  onDestroy(() => {
    if (unlistenUrl) unlistenUrl();
    if (unlistenLoaded) unlistenLoaded();
  });

  // Navigation Handlers
  async function handleNavigate() {
    if (!urlInput.trim()) return;
    isLoading = true;
    try {
      if (!browserCreated) {
        // First navigation: create the embedded webview
        await createEmbeddedBrowser(urlInput);
        browserCreated = true;
        showPresets = false;
        // Wait for DOM to update, then set accurate bounds
        await tick();
        updateWebviewBounds();
      } else {
        await navigateEmbedded(urlInput);
      }
    } catch (e) {
      console.error('Navigation failed:', e);
      isLoading = false;
    }
  }

  async function handleBack() {
    await goBack();
  }

  async function handleForward() {
    await goForward();
  }

  async function handleReload() {
    isLoading = true;
    await reloadBrowser();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleNavigate();
  }

  // Preset & Saved URL Handlers
  async function handleLoadUrl(url: string) {
    urlInput = url;
    await handleNavigate();
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
</script>

<div class="browser-container">
  <!-- Navigation Bar -->
  <div class="nav-bar">
    <div class="nav-controls">
      <button class="icon-btn" on:click={handleBack} title="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <button class="icon-btn" on:click={handleForward} title="Forward">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
      <button class="icon-btn" on:click={handleReload} title="Reload">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </button>
    </div>

    <div class="url-input-container">
      <input 
        type="text" 
        bind:value={urlInput} 
        on:keydown={handleKeydown}
        placeholder="Enter URL..." 
      />
      {#if isLoading}
        <div class="spinner"></div>
      {/if}
    </div>

    <button class="toggle-btn" on:click={() => showPresets = !showPresets} title="Toggle Presets">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
    </button>
  </div>

  <!-- Presets Panel (Collapsible) -->
  {#if showPresets}
    <div class="presets-panel">
      <div class="section">
        <h3>Quick Launch</h3>
        <div class="tags">
          {#each GRADING_SITE_PRESETS as preset}
            <button class="tag" on:click={() => handleLoadUrl(preset.url)}>
              {preset.name}
            </button>
          {/each}
        </div>
      </div>

      <div class="section">
        <h3>Saved</h3>
        <div class="tags">
          {#each savedUrls as saved, i}
            <div class="tag-group">
              <button class="tag saved" on:click={() => handleLoadUrl(saved.url)}>
                {saved.name}
              </button>
              <button class="tag-remove" on:click={() => handleRemoveSaved(i)}>&times;</button>
            </div>
          {/each}
          
          {#if !showSaveForm}
            <button class="tag add" on:click={() => showSaveForm = true}>+ Save Current</button>
          {:else}
            <div class="save-form">
              <input type="text" bind:value={newSaveName} placeholder="Name" />
              <button class="mini-btn primary" on:click={handleSaveUrl}>✓</button>
              <button class="mini-btn" on:click={() => showSaveForm = false}>✕</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Webview Area (native webview overlays this div) -->
  <div class="webview-area">
    {#if !browserCreated}
    <div class="placeholder-text">
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="14.83" y1="9.17" x2="18.36" y2="5.64"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg>
      <p>Embedded Browser Area</p>
      <p class="sub">Enter a URL above to get started</p>
    </div>
    {/if}
  </div>
</div>

<style>
  .browser-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-main);
    overflow: hidden;
  }

  .nav-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .nav-controls {
    display: flex;
    gap: 0.25rem;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    padding: 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .icon-btn:hover {
    background: var(--color-bg-hover);
  }

  .url-input-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    padding-right: 2rem;
    border: 1px solid var(--color-border);
    border-radius: 20px;
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.1);
  }

  .spinner {
    position: absolute;
    right: 0.75rem;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 4px;
  }

  .toggle-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  /* Presets Panel */
  .presets-panel {
    background: var(--color-bg-subtle);
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 1rem;
    display: flex;
    gap: 2rem;
    flex-shrink: 0;
  }

  .section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin: 0 0 0.5rem 0;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    padding: 0.25rem 0.6rem;
    border-radius: 12px;
    font-size: 0.85rem;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .tag:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .tag.saved {
    background: rgba(var(--color-primary-rgb), 0.05);
    border-color: rgba(var(--color-primary-rgb), 0.2);
  }

  .tag.add {
    border-style: dashed;
    color: var(--color-text-muted);
  }

  .tag-group {
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
  }

  .tag-group .tag {
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .tag-remove {
    background: transparent;
    border: none;
    border-left: 1px solid var(--color-border);
    color: var(--color-text-muted);
    padding: 0 0.4rem;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    display: flex;
    align-items: center;
    height: 100%;
  }

  .tag-remove:hover {
    background: var(--color-error-bg);
    color: var(--color-error);
  }

  .save-form {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .save-form input {
    width: 120px;
    padding: 0.2rem 0.5rem;
    font-size: 0.85rem;
    border-radius: 4px;
  }

  .mini-btn {
    border: none;
    border-radius: 4px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .mini-btn.primary {
    background: var(--color-primary);
    color: white;
  }

  /* Webview Area */
  .webview-area {
    flex: 1;
    background: var(--color-bg-app);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder-text {
    text-align: center;
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .placeholder-text svg {
    margin-bottom: 1rem;
    color: var(--color-text-subtle);
  }

  .placeholder-text p {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .placeholder-text .sub {
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
