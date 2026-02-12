<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import History from './pages/History.svelte';
  import Logs from './pages/Logs.svelte';
  import Settings from './pages/Settings.svelte';
  import SetupWizard from './pages/SetupWizard.svelte';
  import UpdateModal from './components/UpdateModal.svelte';
  import { getSetting } from './lib/db';
  import { listenSessionComplete } from './lib/server';
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
    // Rust side already persists to DB — this just triggers UI refresh
    unlistenSession = await listenSessionComplete(() => {
      sessionVersion += 1;
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
    background-color: #2c3e50;
    color: white;
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
    color: #ecf0f1;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  nav button {
    background: none;
    border: none;
    color: #bdc3c7;
    text-align: left;
    padding: 0.75rem 1rem;
    cursor: pointer;
    font-size: 1rem;
    border-radius: 4px;
    transition: all 0.2s;
  }

  nav button:hover {
    background-color: #34495e;
    color: white;
  }

  nav button.active {
    background-color: #3498db;
    color: white;
    font-weight: 500;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    background-color: white;
  }
</style>
