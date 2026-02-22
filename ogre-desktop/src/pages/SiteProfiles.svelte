<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    createEmbeddedBrowser,
    navigateEmbedded,
    setWebviewBounds,
    getEmbeddedUrl,
    hideWebview,
    showWebview,
    listenBrowserUrlChanged,
    listenBrowserPageLoaded,
    listenBrowserStatus,
    injectAutofill
  } from '../lib/browser';
  import { getSiteCredentials } from '../lib/db';
  import { matchCredentialsToUrl } from '../lib/autofill';
  import { calculateWebviewBounds } from '../lib/webview-layout';
  import ProfileManager from '../components/grading/ProfileManager.svelte';
  import DiscoveryPanel from '../components/grading/DiscoveryPanel.svelte';
  import ProviderSelector from '../components/grading/ProviderSelector.svelte';
  import { createDebouncedRefresh } from '../lib/page-refresh';

  // State
  let urlInput = $state('');
  let pageLoadedUrl = $state('');
  let isLoading = $state(false);
  let browserCreated = $state(false);
  let activeProvider = $state('');
  let activeModel = $state('');
  let refreshKey = $state(0);
  const leftPanelWidth = 400;

  // Event listeners
  let unlistenUrl: (() => void) | undefined;
  let unlistenLoaded: (() => void) | undefined;
  let unlistenStatus: (() => void) | undefined;

  // Debounced refresh for discovery panel
  const scheduleRefresh = createDebouncedRefresh((_url: string) => {
    refreshKey++;
  }, 500);

  /** Calculate and apply webview bounds for split-view layout */
  function updateWebviewBounds() {
    if (!browserCreated) return;
    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
    const navBar = document.querySelector('.nav-bar');
    const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 0;
    const bounds = calculateWebviewBounds({
      sidebarWidth,
      navBarHeight,
      panelWidth: leftPanelWidth,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    });
    if (bounds.width > 0 && bounds.height > 0) {
      // Offset x by leftPanelWidth — the utility assumes a RIGHT panel,
      // but SiteProfiles has the panel on the LEFT side of the webview.
      setWebviewBounds(bounds.x + leftPanelWidth, bounds.y, bounds.width, bounds.height).catch(console.error);
    }
  }

  /** Check credentials and inject auto-fill for the loaded URL */
  async function tryAutofill(url: string) {
    try {
      const credentials = await getSiteCredentials();
      const match = matchCredentialsToUrl(url, credentials);
      if (match) {
        await injectAutofill(match.username, match.password);
      }
    } catch (e) {
      console.error('[Autofill] Failed:', e);
    }
  }

  /** Navigate the webview (create if needed) */
  async function handleNavigate() {
    if (!urlInput.trim()) return;
    isLoading = true;
    try {
      if (!browserCreated) {
        await createEmbeddedBrowser(urlInput.trim());
      } else {
        await navigateEmbedded(urlInput.trim());
      }
    } catch (e) {
      console.error('Navigation failed:', e);
      isLoading = false;
    }
  }

  onMount(async () => {
    // Set up event listeners
    unlistenUrl = await listenBrowserUrlChanged((url) => {
      urlInput = url;
    });

    unlistenLoaded = await listenBrowserPageLoaded(async (url: string) => {
      isLoading = false;
      pageLoadedUrl = url;
      urlInput = url;
      await tryAutofill(url);
      scheduleRefresh(url);
    });

    unlistenStatus = await listenBrowserStatus(async (status: string) => {
      if (status === 'embedded-open') {
        browserCreated = true;
        isLoading = false;
        updateWebviewBounds();
        await showWebview().catch(() => {});
      } else if (status === 'error') {
        browserCreated = false;
        isLoading = false;
      }
    });

    // Check if webview already exists (persists across page switches)
    try {
      const currentUrl = await getEmbeddedUrl();
      if (currentUrl) {
        browserCreated = true;
        urlInput = currentUrl;
        updateWebviewBounds();
      }
    } catch {
      // Webview doesn't exist yet — that's fine
    }

    // Handle window resize
    window.addEventListener('resize', updateWebviewBounds);

    // Handle sidebar expand/collapse
    window.addEventListener('ogre:sidebar-changed', updateWebviewBounds);

    // Delay initial bounds update to ensure DOM is measured
    setTimeout(() => updateWebviewBounds(), 100);

    // Show webview if it already exists
    if (browserCreated) {
      await showWebview().catch(() => {});
    }
  });

  onDestroy(() => {
    if (unlistenUrl) unlistenUrl();
    if (unlistenLoaded) unlistenLoaded();
    if (unlistenStatus) unlistenStatus();
    window.removeEventListener('resize', updateWebviewBounds);
    window.removeEventListener('ogre:sidebar-changed', updateWebviewBounds);
    // Hide webview when leaving — do NOT destroy it
    hideWebview().catch(() => {});
  });
</script>

<div class="site-profiles-page">
  <div class="left-panel">
    <!-- URL bar -->
    <form class="url-bar" onsubmit={(e) => { e.preventDefault(); handleNavigate(); }}>
      <input bind:value={urlInput} placeholder="Enter URL..." type="url" />
      <button type="submit" disabled={isLoading}>Go</button>
    </form>

    <!-- Provider selector for discovery -->
    <ProviderSelector bind:provider={activeProvider} bind:model={activeModel} />

    <!-- Profile management -->
    <ProfileManager />

    <!-- Discovery panel -->
    <DiscoveryPanel
      provider={activeProvider}
      model={activeModel}
      pageLoadedUrl={pageLoadedUrl}
      refreshKey={refreshKey}
      onProfileSaved={(profile) => { console.log('Profile saved:', profile.name); }}
    />
  </div>

  <div class="webview-area">
    {#if !browserCreated}
      <p>Loading browser...</p>
    {/if}
  </div>
</div>

<style>
  .site-profiles-page {
    display: flex;
    height: 100%;
    overflow: hidden;
  }
  .left-panel {
    width: 400px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
  }
  .webview-area {
    flex: 1;
    background: var(--color-bg-card);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }
  .url-bar {
    display: flex;
    gap: var(--spacing-2);
  }
  .url-bar input {
    flex: 1;
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
  }
  .url-bar button {
    padding: var(--spacing-2) var(--spacing-3);
  }
</style>
