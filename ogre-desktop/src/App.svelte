<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import History from './pages/History.svelte';
  import Logs from './pages/Logs.svelte';
  import Settings from './pages/Settings.svelte';
  import Rubrics from './pages/Rubrics.svelte';
  import Browser from './pages/Browser.svelte';
  import Skills from './pages/Skills.svelte';
  import SiteProfiles from './pages/SiteProfiles.svelte';
  import SetupWizard from './pages/SetupWizard.svelte';
  import UpdateModal from './components/UpdateModal.svelte';
  import { getSetting, insertGradingSession } from './lib/db';
  import { listenSessionComplete, listenProviderChanged } from './lib/server';
  import type { SessionCompletePayload } from './lib/server';
  import { updateActiveProvider } from './lib/db';
  import { checkForUpdates, type UpdateCheckResult } from './lib/updater';
  import { hideWebview, showWebview } from './lib/browser';
  import type { Update } from '@tauri-apps/plugin-updater';

  // Webview layout constants (must match CSS variables in app.css)
  const SIDEBAR_EXPANDED_WIDTH = 250;
  const SIDEBAR_COLLAPSED_WIDTH = 60;
  const SIDEBAR_TRANSITION_MS = 300;

  let currentPage = 'dashboard';
  let sidebarCollapsed = false;
  let setupComplete = false;
  let loading = true;

  // Update modal state
  let showUpdateModal = false;
  let updateVersion = '';
  let updateNotes = '';
  let pendingUpdate: Update | undefined = undefined;

  // Session-complete event: incremented each time a new session is recorded
  // Child components can react to this to refresh their data
  let sessionVersion = 0;
  let unlistenSession: (() => void) | undefined;
  let unlistenProviderChange: (() => void) | undefined;

  // Modal z-ordering: native webview renders ON TOP of all DOM elements,
  // so it must be hidden when modals appear to avoid covering them.
  $: if (showUpdateModal) {
    hideWebview().catch(() => {});
  } else if (currentPage === 'browser') {
    showWebview().catch(() => {});
    window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'));
  }

  onMount(async () => {
    try {
      const setting = await getSetting('setup_complete');
      setupComplete = setting === 'true';
    } catch (e) {
      setupComplete = false;
    } finally {
      loading = false;
    }

    // Listen for session-complete events from the sidecar
    // Persist to SQLite and trigger UI refresh
    unlistenSession = await listenSessionComplete(async (session: SessionCompletePayload) => {
      try {
        await insertGradingSession({
          provider_id: session.provider_id,
          model: session.model,
          student_count: session.student_count,
          mean_score: session.mean_score,
          min_score: session.min_score,
          max_score: session.max_score,
          median_score: session.median_score,
          max_possible_score: session.max_possible_score,
          page_url: session.page_url,
          question_id: session.question_id,
          custom_instructions: session.custom_instructions,
        });
      } catch (e) {
      }
      sessionVersion += 1;
    });

    // Listen for provider-changed events from extension write-back
    // Persist the active provider selection to SQLite
    unlistenProviderChange = await listenProviderChanged(async (data) => {
      try {
        await updateActiveProvider(data.provider_id, data.model);
      } catch (e) {
      }
    });

    // Listen for cross-component navigation events (e.g. RubricCard → Rubrics page)
    window.addEventListener('ogre:navigate', handleNavigateEvent as EventListener);

    // Check for updates after app loads (non-blocking)
    checkForUpdates().then((result: UpdateCheckResult) => {
      if (result.available && result.update) {
        updateVersion = result.version ?? '';
        updateNotes = result.notes ?? '';
        pendingUpdate = result.update;
        showUpdateModal = true;
      }
    });
  });

  onDestroy(() => {
    if (unlistenSession) unlistenSession();
    if (unlistenProviderChange) unlistenProviderChange();
    window.removeEventListener('ogre:navigate', handleNavigateEvent as EventListener);
  });

  /** Handle cross-component navigation via custom DOM events. */
  function handleNavigateEvent(e: CustomEvent<string>) {
    if (e.detail) navigate(e.detail);
  }

  function navigate(page: string) {
    currentPage = page;
    if (page === 'browser') {
      sidebarCollapsed = true;
      showWebview().catch(() => {});
      window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'));
    } else {
      sidebarCollapsed = false;
      // Hide webview immediately when leaving browser page (preserves session)
      hideWebview().catch(() => {});
    }
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;

    if (currentPage === 'browser') {
      window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'));
    }
  }

  function handleSetupComplete() {
    setupComplete = true;
    navigate('dashboard');
  }
</script>

{#if loading}
  <div class="loading-screen">
    <div class="spinner"></div>
    <p>Loading O.G.R.E...</p>
  </div>
{:else if !setupComplete}
  <SetupWizard on:complete={handleSetupComplete} />
{:else}
  <div class="app-container">
    <aside class="sidebar" class:collapsed={sidebarCollapsed}>
      <div class="sidebar-header">
        <div class="brand" class:hidden={sidebarCollapsed}>O.G.R.E</div>
        <button class="toggle-btn" on:click={toggleSidebar} aria-label="Toggle Sidebar">
          {#if sidebarCollapsed}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
          {/if}
        </button>
      </div>
      <nav>
        <button class:active={currentPage === 'dashboard'} on:click={() => navigate('dashboard')} title="Dashboard">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </span>
          <span class="label">Dashboard</span>
        </button>
        <button class:active={currentPage === 'history'} on:click={() => navigate('history')} title="History">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </span>
          <span class="label">History</span>
        </button>
        <button class:active={currentPage === 'logs'} on:click={() => navigate('logs')} title="Logs">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </span>
          <span class="label">Logs</span>
        </button>
        <button class:active={currentPage === 'rubrics'} on:click={() => navigate('rubrics')} title="Rubrics">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2 2 4-4"></path></svg>
          </span>
          <span class="label">Rubrics</span>
        </button>
        <button class:active={currentPage === 'profiles'} on:click={() => navigate('profiles')} title="Site Profiles">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </span>
          <span class="label">Site Profiles</span>
        </button>
        <button class:active={currentPage === 'browser'} on:click={() => navigate('browser')} title="Browser">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </span>
          <span class="label">Browser</span>
        </button>
        <button class:active={currentPage === 'skills'} on:click={() => navigate('skills')} title="Skills">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
          <span class="label">Skills</span>
        </button>
        <button class:active={currentPage === 'settings'} on:click={() => navigate('settings')} title="Settings">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </span>
          <span class="label">Settings</span>
        </button>
      </nav>
    </aside>

    <main class="content">
      {#if currentPage === 'dashboard'}
        <Dashboard {sessionVersion} />
      {:else if currentPage === 'history'}
        <History {sessionVersion} />
      {:else if currentPage === 'logs'}
        <Logs />
      {:else if currentPage === 'rubrics'}
        <Rubrics />
      {:else if currentPage === 'browser'}
        <Browser />
      {:else if currentPage === 'profiles'}
        <SiteProfiles />
      {:else if currentPage === 'skills'}
        <Skills />
      {:else if currentPage === 'settings'}
        <Settings />
      {/if}
    </main>
  </div>
{/if}

<UpdateModal
  isOpen={showUpdateModal}
  version={updateVersion}
  notes={updateNotes}
  update={pendingUpdate}
  on:close={() => { showUpdateModal = false; }}
/>

<style>
  /* Global styles for the app container */
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', sans-serif;
    background-color: #f5f5f5;
  }

  .loading-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: #2c3e50;
    color: white;
  }
  
  .spinner {
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 4px solid white;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .app-container {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .sidebar {
    width: var(--sidebar-width-expanded);
    background-color: var(--color-bg-sidebar);
    color: var(--color-text-primary);
    display: flex;
    flex-direction: column;
    padding: 1rem;
    box-shadow: 2px 0 5px rgba(0,0,0,0.1);
    transition: width var(--sidebar-transition);
  }

  .sidebar.collapsed {
    width: var(--sidebar-width-collapsed);
    padding: 1rem 0.5rem;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    height: 40px;
  }

  .brand {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    transition: opacity 0.2s, width 0.2s;
  }

  .brand.hidden {
    opacity: 0;
    width: 0;
    display: none;
  }
  
  .toggle-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
    margin-left: auto;
  }

  .toggle-btn:hover {
    background-color: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }
  
  .sidebar.collapsed .toggle-btn {
    margin: 0 auto;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  nav button {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    text-align: left;
    padding: 0.75rem 1rem;
    cursor: pointer;
    font-size: 1rem;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
  }
  
  .sidebar.collapsed nav button {
    padding: 0.75rem;
    justify-content: center;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .label {
    transition: opacity 0.2s;
  }
  
  .sidebar.collapsed .label {
    opacity: 0;
    width: 0;
    display: none;
  }

  nav button:hover {
    background-color: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }

  nav button.active {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    font-weight: 500;
  }


  .content {
    flex: 1;
    overflow-y: auto;
    background-color: var(--color-bg-main);
  }
</style>
