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
    hideWebview,
    showWebview,
    destroyWebview,
    listenBrowserUrlChanged, 
    listenBrowserPageLoaded,
    listenBrowserStatus,
    injectAutofill,
    setActiveTabId,
    GRADING_SITE_PRESETS,
    type BrowserEventPayload,
  } from '../lib/browser';
  import { calculateWebviewBounds } from '../lib/webview-layout';
  import {
    shouldTriggerSidebarAnimation,
    scheduleBoundsUpdateAfterAnimation,
    createDestroyGuard,
  } from '../lib/webview-lifecycle';
  import { getSetting, setSetting, getSiteCredentials } from '../lib/db';
  import { matchCredentialsToUrl } from '../lib/autofill';
  import { ICON_STRIP_WIDTH } from '../lib/constants';
  import GradingPanel from './GradingPanel.svelte';

  // State
  let urlInput = '';
  let showPresets = true;
  let showGradingPanel = false;
  let gradingPanelCollapsed = false;
  let gradingPanelWidth = 400;
  let toastMessage = '';
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  
  // Saved URLs
  let savedUrls: { name: string; url: string }[] = [];
  let newSaveName = '';
  let showSaveForm = false;

  // Event Listeners
  let unlistenUrl: (() => void) | undefined;
  let unlistenLoaded: (() => void) | undefined;
  let unlistenStatus: (() => void) | undefined;
  let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
  let sidebarAnimationId: number | undefined;
  const guard = createDestroyGuard();
  let cancelScheduledBoundsUpdate: (() => void) | undefined;
  let drawerResizeTimeout: ReturnType<typeof setTimeout> | undefined;

  // ── Tab State ────────────────────────────────────────────────────────────
  interface Tab {
    id: string;
    url: string;
    title: string;
    isLoading: boolean;
    browserCreated: boolean;
  }
  let tabs: Tab[] = [];
  let activeTabId = '';
  let creatingTabId = '';

  // Derived from active tab
  $: currentTab = tabs.find(t => t.id === activeTabId);
  $: isLoading = currentTab?.isLoading ?? false;
  $: browserCreated = currentTab?.browserCreated ?? false;
  $: pageLoadedUrl = currentTab?.url ?? '';

  /** Show a transient toast notification */
  function showToast(message: string, durationMs = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage = message;
    toastTimer = setTimeout(() => { toastMessage = ''; }, durationMs);
  }

  /** Get a display title for a tab (hostname or 'New Tab') */
  function getTabDisplayTitle(tab: Tab): string {
    if (!tab.url) return 'New Tab';
    try {
      const normalized = tab.url.startsWith('http') ? tab.url : 'https://' + tab.url;
      return new URL(normalized).hostname || 'New Tab';
    } catch {
      return tab.url.slice(0, 20) || 'New Tab';
    }
  }

  /** Open a new tab, optionally navigating to a URL */
  async function openNewTab(url?: string) {
    const id = crypto.randomUUID();
    const newTab: Tab = { id, url: url ?? '', title: '', isLoading: false, browserCreated: false };
    tabs = [...tabs, newTab];
    await switchTab(id);
    if (url) {
      urlInput = url;
      await handleNavigate();
    }
  }

  /** Switch to an existing tab by ID */
  async function switchTab(id: string) {
    if (activeTabId && activeTabId !== id) {
      const prev = tabs.find(t => t.id === activeTabId);
      if (prev?.browserCreated) {
        await hideWebview(activeTabId).catch(() => {});
      }
    }
    activeTabId = id;
    setActiveTabId(id);
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      urlInput = tab.url;
    }
    if (tab?.browserCreated) {
      await showWebview(id).catch(() => {});
      await tick();
      updateWebviewBounds();
    }
  }

  /** Close a tab and destroy its webview */
  async function closeTab(id: string) {
    const tab = tabs.find(t => t.id === id);
    if (tab?.browserCreated) {
      await destroyWebview(id).catch(() => {});
    }
    tabs = tabs.filter(t => t.id !== id);
    if (activeTabId === id) {
      if (tabs.length > 0) {
        await switchTab(tabs[tabs.length - 1].id);
      } else {
        activeTabId = '';
        setActiveTabId('');
        urlInput = '';
      }
    }
  }

  /** Check credentials and inject auto-fill for the loaded URL */
  async function tryAutofill(tabId: string, url: string) {
    try {
      const credentials = await getSiteCredentials();
      const match = matchCredentialsToUrl(url, credentials);
      if (match) {
        await injectAutofill(tabId, match.username, match.password);
        showToast(`Auto-filled credentials for ${match.site_name}`);
      }
    } catch (e) {
    }
  }

  /** Calculate and apply webview bounds accounting for sidebar state */
  function updateWebviewBounds() {
    if (!browserCreated || !activeTabId) return;
    
    // Get actual sidebar width from DOM (handles both collapsed and expanded states)
    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
    
    // Get the nav-bar height from the DOM element
    const navBar = document.querySelector('.nav-bar');
    const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;

    // Calculate tab bar height
    const tabBarEl = document.querySelector('.tab-bar');
    const tabBarHeight = tabBarEl ? tabBarEl.getBoundingClientRect().height : 0;
    
    // Calculate presets panel height if visible
    const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
    const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;

    const drawerWidth = showGradingPanel
      ? (gradingPanelCollapsed ? ICON_STRIP_WIDTH : gradingPanelWidth)
      : 0;
    
    const bounds = calculateWebviewBounds({
      sidebarWidth,
      navBarHeight,
      panelWidth: drawerWidth,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      extraTopOffset: presetsPanelHeight + tabBarHeight,
    });
    
    if (bounds.width > 0 && bounds.height > 0) {
      setWebviewBounds(activeTabId, bounds.x, bounds.y, bounds.width, bounds.height).catch(() => {});
    }
  }

  // Recalculate webview bounds when presets panel or grading panel visibility changes
  $: {
    showPresets;
    showGradingPanel;
    gradingPanelCollapsed;
    gradingPanelWidth;
    if (browserCreated) {
      tick().then(() => updateWebviewBounds());
    }
  }

  // Save drawer state to storage when any property changes (debounced)
  $: {
    gradingPanelWidth;
    gradingPanelCollapsed;
    showGradingPanel;
    if (drawerResizeTimeout) clearTimeout(drawerResizeTimeout);
    drawerResizeTimeout = setTimeout(async () => {
      await setSetting('ogreDrawerState', JSON.stringify({
        open: showGradingPanel,
        width: gradingPanelWidth,
        collapsed: gradingPanelCollapsed
      }));
    }, 300);
  }

  /** Debounced window resize handler */
  function handleResize() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => updateWebviewBounds(), 100);
  }

  /** Animate webview bounds in sync with sidebar CSS transition via RAF */
  function handleSidebarChanged() {
    // Cancel any in-progress animation
    if (sidebarAnimationId) cancelAnimationFrame(sidebarAnimationId);

    const startTime = performance.now();
    const duration = 300; // Match sidebar CSS transition duration

    function animateFrame() {
      const elapsed = performance.now() - startTime;
      updateWebviewBounds();

      if (elapsed < duration) {
        sidebarAnimationId = requestAnimationFrame(animateFrame);
      } else {
        sidebarAnimationId = undefined;
      }
    }

    sidebarAnimationId = requestAnimationFrame(animateFrame);
  }

  onMount(async () => {
    // Load saved URLs
    const saved = await getSetting('browser_saved_urls');
    if (guard.destroyed) return;
    if (saved) {
      try { savedUrls = JSON.parse(saved); } catch { savedUrls = []; }
    }

    // Load saved drawer state
    const savedDrawerState = await getSetting('ogreDrawerState');
    if (guard.destroyed) return;
    if (savedDrawerState) {
      try {
        const state = JSON.parse(savedDrawerState);
        if (state.open !== undefined) showGradingPanel = state.open;
        if (state.width !== undefined) gradingPanelWidth = state.width;
        if (state.collapsed !== undefined) gradingPanelCollapsed = state.collapsed;
      } catch {
        showGradingPanel = false;
        gradingPanelWidth = 400;
      }
    } else {
      showGradingPanel = false;
      gradingPanelWidth = 400;
    }

    // Set up event listeners
    unlistenUrl = await listenBrowserUrlChanged(({ tabId, url }: BrowserEventPayload) => {
      tabs = tabs.map(t => t.id === tabId ? { ...t, url } : t);
      if (tabId === activeTabId) urlInput = url;
    });
    if (guard.destroyed) { unlistenUrl(); return; }

    unlistenLoaded = await listenBrowserPageLoaded(async ({ tabId, url }: BrowserEventPayload) => {
      tabs = tabs.map(t => t.id === tabId ? { ...t, isLoading: false, url } : t);
      if (tabId === activeTabId) urlInput = url;
      await tryAutofill(tabId, url);
    });
    if (guard.destroyed) { unlistenUrl(); unlistenLoaded(); return; }

    unlistenStatus = await listenBrowserStatus(async (status: string) => {
      if (status === 'embedded-open' && creatingTabId) {
        const tid = creatingTabId;
        creatingTabId = '';
        tabs = tabs.map(t => t.id === tid ? { ...t, browserCreated: true, isLoading: false } : t);
        if (tid === activeTabId) {
          showPresets = false;
          await tick();
          updateWebviewBounds();
          await showWebview(tid).catch(() => {});
        }
      } else if (status === 'error') {
        if (creatingTabId) {
          tabs = tabs.map(t => t.id === creatingTabId ? { ...t, isLoading: false } : t);
          creatingTabId = '';
        }
        showToast('Failed to create browser. Please try again.');
      }
    });
    if (guard.destroyed) { unlistenUrl(); unlistenLoaded(); unlistenStatus(); return; }

    // Handle window resize with debounce
    window.addEventListener('resize', handleResize);

    // Handle sidebar changes with RAF animation
    window.addEventListener('ogre:sidebar-changed', handleSidebarChanged);

    // Create the initial tab
    await openNewTab();
  });

  onDestroy(() => {
    // Destroy all tab webviews
    tabs.forEach(tab => {
      if (tab.browserCreated) {
        destroyWebview(tab.id).catch(() => {});
      }
    });

    guard.onDestroy([
      () => { if (unlistenUrl) unlistenUrl(); },
      () => { if (unlistenLoaded) unlistenLoaded(); },
      () => { if (unlistenStatus) unlistenStatus(); },
      () => { if (resizeTimeout) clearTimeout(resizeTimeout); },
      () => { if (drawerResizeTimeout) clearTimeout(drawerResizeTimeout); },
      () => { if (sidebarAnimationId) cancelAnimationFrame(sidebarAnimationId); },
      () => { if (cancelScheduledBoundsUpdate) cancelScheduledBoundsUpdate(); },
      () => { window.removeEventListener('resize', handleResize); },
      () => { window.removeEventListener('ogre:sidebar-changed', handleSidebarChanged); },
    ]);
  });

  // Navigation Handlers
  async function handleNavigate() {
    if (!urlInput.trim() || !activeTabId) return;
    const url = urlInput.trim();
    tabs = tabs.map(t => t.id === activeTabId ? { ...t, isLoading: true, url } : t);
    try {
      if (!currentTab?.browserCreated) {
        creatingTabId = activeTabId;
        await createEmbeddedBrowser(activeTabId, url);
        await tick();
        updateWebviewBounds();
      } else {
        await navigateEmbedded(activeTabId, url);
      }
    } catch (e) {
      tabs = tabs.map(t => t.id === activeTabId ? { ...t, isLoading: false } : t);
    }
  }

  async function handleBack() {
    if (activeTabId) await goBack(activeTabId);
  }

  async function handleForward() {
    if (activeTabId) await goForward(activeTabId);
  }

  async function handleReload() {
    if (!activeTabId) return;
    tabs = tabs.map(t => t.id === activeTabId ? { ...t, isLoading: true } : t);
    await reloadBrowser(activeTabId);
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

  function toggleDrawer() {
    showGradingPanel = !showGradingPanel;
    // Always start expanded when opening the drawer
    if (showGradingPanel) {
      gradingPanelCollapsed = false;
    }
    // State is persisted by the debounced reactive block
  }
</script>

<div class="browser-container">
  <!-- Tab Bar -->
  <div class="tab-bar">
    {#each tabs as tab (tab.id)}
      <div
        class="tab"
        class:active={tab.id === activeTabId}
        on:click={() => switchTab(tab.id)}
        on:keydown={(e) => e.key === 'Enter' && switchTab(tab.id)}
        role="tab"
        tabindex="0"
      >
        <span class="tab-title">{tab.title || getTabDisplayTitle(tab)}</span>
        {#if tabs.length > 1}
          <button class="tab-close" on:click|stopPropagation={() => closeTab(tab.id)}>×</button>
        {/if}
      </div>
    {/each}
    <button class="tab-new" on:click={() => openNewTab()}>+</button>
  </div>

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
    <button class="toggle-btn" on:click={toggleDrawer} title="Toggle Grading Panel" class:active={showGradingPanel}>
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
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

  <!-- Browser Content Area -->
  <div class="browser-content">
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

    {#if showGradingPanel}
      <GradingPanel 
        bind:isCollapsed={gradingPanelCollapsed} 
        bind:width={gradingPanelWidth}
        pageLoadedUrl={pageLoadedUrl}
      />
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

  .browser-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
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
    background-color: var(--color-bg-input);
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

  .toggle-btn.active {
    background: var(--color-bg-selected);
    color: var(--color-primary);
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

  /* Tab Bar */
  .tab-bar {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 0.25rem 0.5rem 0;
    background: var(--color-bg-main);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.75rem;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
    max-width: 160px;
    min-width: 80px;
    white-space: nowrap;
    overflow: hidden;
    transition: background 0.15s;
  }

  .tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    background: var(--color-bg-card);
    border-color: var(--color-border);
    color: var(--color-text-primary);
  }

  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0 2px;
    font-size: 1rem;
    line-height: 1;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .tab-close:hover {
    background: var(--color-error-bg);
    color: var(--color-error);
  }

  .tab-new {
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0.3rem 0.5rem;
    border-radius: 4px 4px 0 0;
    font-size: 1rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .tab-new:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
</style>
