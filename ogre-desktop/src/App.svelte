<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import History from './pages/History.svelte';
  import Logs from './pages/Logs.svelte';
  import Settings from './pages/settings/Settings.svelte';
  import Rubrics from './pages/Rubrics.svelte';
  import Browser from './pages/Browser.svelte';
  import Skills from './pages/Skills.svelte';
  import SiteProfiles from './pages/SiteProfiles.svelte';
  import SetupWizard from './pages/SetupWizard.svelte';
  import UpdateModal from './components/UpdateModal.svelte';
  import {
    CollapseIcon,
    DashboardIcon,
    HistoryIcon,
    LogsIcon,
    RubricsIcon,
    ProfilesIcon,
    BrowserIcon,
    SkillsIcon,
    SettingsIcon,
  } from './components/icons/index';
  import { getSetting, insertGradingSession } from './lib/db';
  import { listenSessionComplete, listenProviderChanged } from './lib/server';
  import type { SessionCompletePayload } from './lib/server';
  import { updateActiveProvider } from './lib/db';
  import { checkForUpdates, type UpdateCheckResult } from './lib/updater';
  import { hideWebview, showWebview, getActiveTabId } from './lib/browser';
  import { syncSiteProfiles } from './lib/skills-api';
  import type { Update } from '@tauri-apps/plugin-updater';

  // Webview layout constants (must match CSS variables in app.css)
  const SIDEBAR_EXPANDED_WIDTH = 250;
  const SIDEBAR_COLLAPSED_WIDTH = 60;
  const SIDEBAR_TRANSITION_MS = 300;

  let currentPage = $state('dashboard');
  let sidebarCollapsed = $state(false);
  let setupComplete = $state(false);
  let loading = $state(true);

  // Update modal state
  let showUpdateModal = $state(false);
  let updateVersion = $state('');
  let updateNotes = $state('');
  let pendingUpdate = $state<Update | undefined>(undefined);

  // Session-complete event: incremented each time a new session is recorded
  // Child components can react to this to refresh their data
  let sessionVersion = $state(0);
  let unlistenSession = $state<(() => void) | undefined>(undefined);
  let unlistenProviderChange = $state<(() => void) | undefined>(undefined);

  // Modal z-ordering: native webview renders ON TOP of all DOM elements,
  // so it must be hidden when modals appear to avoid covering them.
  $effect(() => {
    if (showUpdateModal) {
      hideWebview(getActiveTabId()).catch(() => {});
    } else if (currentPage === 'browser') {
      showWebview(getActiveTabId()).catch(() => {});
      window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'));
    }
  });

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

    // Listen for provider-changed events from the grading server
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

    // Sync bundled site profiles on app init (fire-and-forget)
    syncSiteProfiles().catch(() => {});
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
      // NOTE: showWebview() is intentionally NOT called here.
      // Browser.svelte calls showWebview() from onMount after setting correct bounds,
      // preventing a flash at the default Rust position (x=0, y=60).
      // The reactive block above handles re-showing after update modal closes.
      window.dispatchEvent(new CustomEvent('ogre:sidebar-changed'));
    } else {
      sidebarCollapsed = false;
      // Hide webview immediately when leaving browser page (preserves session)
      hideWebview(getActiveTabId()).catch(() => {});
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
        <button class="toggle-btn" onclick={toggleSidebar} aria-label="Toggle Sidebar">
          <CollapseIcon collapsed={sidebarCollapsed} />
        </button>
      </div>
      <nav>
        <!-- Dashboard – standalone -->
        <button class:active={currentPage === 'dashboard'} onclick={() => navigate('dashboard')} title="Dashboard">
          <span class="icon"><DashboardIcon /></span>
          <span class="label">Dashboard</span>
        </button>

        <!-- Primary group -->
        <div class="nav-group">
          <span class="nav-group-label">Primary</span>
          <button class:active={currentPage === 'browser'} onclick={() => navigate('browser')} title="Grade Now">
            <span class="icon"><BrowserIcon /></span>
            <span class="label">Grade Now</span>
          </button>
          <button class:active={currentPage === 'history'} onclick={() => navigate('history')} title="Grading History">
            <span class="icon"><HistoryIcon /></span>
            <span class="label">Grading History</span>
          </button>
          <button class:active={currentPage === 'rubrics'} onclick={() => navigate('rubrics')} title="Rubrics">
            <span class="icon"><RubricsIcon /></span>
            <span class="label">Rubrics</span>
          </button>
        </div>

        <!-- Tools group -->
        <div class="nav-group">
          <span class="nav-group-label">Tools</span>
          <button class:active={currentPage === 'skills'} onclick={() => navigate('skills')} title="AI Skills">
            <span class="icon"><SkillsIcon /></span>
            <span class="label">AI Skills</span>
          </button>
          <button class:active={currentPage === 'profiles'} onclick={() => navigate('profiles')} title="Site Templates">
            <span class="icon"><ProfilesIcon /></span>
            <span class="label">Site Templates</span>
          </button>
        </div>

        <!-- System group -->
        <div class="nav-group">
          <span class="nav-group-label">System</span>
          <button class:active={currentPage === 'logs'} onclick={() => navigate('logs')} title="Activity Log">
            <span class="icon"><LogsIcon /></span>
            <span class="label">Activity Log</span>
          </button>
          <button class:active={currentPage === 'settings'} onclick={() => navigate('settings')} title="Settings">
            <span class="icon"><SettingsIcon /></span>
            <span class="label">Settings</span>
          </button>
        </div>
      </nav>
    </aside>

    <main class="content">
      {#if currentPage === 'dashboard'}
        <Dashboard {sessionVersion} onnavigate={navigate} />
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
  .loading-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: var(--color-bg-main);
    color: var(--color-text-primary);
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
    overflow: hidden;
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
    gap: 0.25rem;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Nav group container */
  .nav-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  /* Section label above each group */
  .nav-group-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    padding: 0.25rem 1rem 0.1rem;
    white-space: nowrap;
    overflow: hidden;
    transition: opacity 0.2s;
  }

  .sidebar.collapsed .nav-group-label {
    opacity: 0;
    height: 0;
    padding: 0;
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
    width: 100%;
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
