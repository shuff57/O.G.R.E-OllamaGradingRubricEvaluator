<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import History from './pages/History.svelte';
  import Logs from './pages/Logs.svelte';
  import Settings from './pages/Settings.svelte';
  import SetupWizard from './pages/SetupWizard.svelte';
  import UpdateModal from './components/UpdateModal.svelte';
  import { getSetting, insertGradingSession } from './lib/db';
  import { listenSessionComplete, listenProviderChanged } from './lib/server';
  import type { SessionCompletePayload } from './lib/server';
  import { updateActiveProvider } from './lib/db';
  import { checkForUpdates, type UpdateCheckResult } from './lib/updater';
  import type { Update } from '@tauri-apps/plugin-updater';

  let currentPage = 'dashboard';
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

  onMount(async () => {
    try {
      const setting = await getSetting('setup_complete');
      setupComplete = setting === 'true';
    } catch (e) {
      console.error('Failed to load setup status', e);
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
        console.log(`Grading session recorded: ${session.student_count} students`);
      } catch (e) {
        console.error('Failed to persist grading session:', e);
      }
      sessionVersion += 1;
    });

    // Listen for provider-changed events from extension write-back
    // Persist the active provider selection to SQLite
    unlistenProviderChange = await listenProviderChanged(async (data) => {
      try {
        await updateActiveProvider(data.provider_id, data.model);
        console.log(`Active provider updated: ${data.provider_id} (${data.model})`);
      } catch (e) {
        console.error('Failed to update active provider', e);
      }
    });

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
  });

  function navigate(page: string) {
    currentPage = page;
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
    <aside class="sidebar">
      <div class="brand">O.G.R.E</div>
      <nav>
        <button class:active={currentPage === 'dashboard'} on:click={() => navigate('dashboard')}>Dashboard</button>
        <button class:active={currentPage === 'history'} on:click={() => navigate('history')}>History</button>
        <button class:active={currentPage === 'logs'} on:click={() => navigate('logs')}>Logs</button>
        <button class:active={currentPage === 'settings'} on:click={() => navigate('settings')}>Settings</button>
      </nav>
    </aside>

    <main class="content">
      {#if currentPage === 'dashboard'}
        <Dashboard {sessionVersion} />
      {:else if currentPage === 'history'}
        <History {sessionVersion} />
      {:else if currentPage === 'logs'}
        <Logs />
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
    width: 250px;
    background-color: var(--color-bg-sidebar);
    color: var(--color-text-primary);
    display: flex;
    flex-direction: column;
    padding: 1rem;
    box-shadow: 2px 0 5px rgba(0,0,0,0.1);
  }

  .brand {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 2rem;
    padding-left: 1rem;
    color: var(--color-text-primary);
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
