<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listenServerStatus } from '../lib/server';
  import { getProviderConfigs, getGradingSessions } from '../lib/db';
  import { pushOnStartup } from '../lib/provider-sync';

  /** Incremented by App.svelte when a new grading session is recorded */
  export let sessionVersion = 0;
  
  let serverStatus = 'starting...';
  let providerStatus = 'checking...';
  let totalSessions = 0;
  let totalStudents = 0;
  let lastSessionDate = 'Never';

  // Poll server health every 5 seconds
  let healthInterval: number;
  let unlistenServer: () => void;

  async function loadStats() {
    const sessions = await getGradingSessions();
    totalSessions = sessions.length;
    totalStudents = sessions.reduce((sum, s) => sum + (s.student_count || 0), 0);
    if (sessions.length > 0) {
      lastSessionDate = new Date(sessions[0].created_at).toLocaleString();
    }
  }

  // Reactively reload stats when sessionVersion changes
  $: if (sessionVersion >= 0) {
    loadStats();
  }

  onMount(async () => {
    // Listen to server status events
    unlistenServer = await listenServerStatus((status) => {
      serverStatus = status;
      // When server becomes running (startup or restart), push provider config
      if (status === 'running') {
        pushOnStartup();
      }
    });

    // Poll health endpoint
    let hasPushedOnStartup = false;
    const checkServerHealth = async () => {
      try {
        const response = await fetch('http://localhost:3456/health');
        if (response.ok) {
          serverStatus = 'running';
          // Push provider config on first health success (covers case where
          // the server-status event fired before Dashboard mounted)
          if (!hasPushedOnStartup) {
            hasPushedOnStartup = true;
            pushOnStartup();
          }
        }
      } catch {
        serverStatus = 'stopped';
      }
    };
    checkServerHealth(); // Check immediately
    healthInterval = setInterval(checkServerHealth, 5000);

    // Check provider status
    const providers = await getProviderConfigs();
    const activeProvider = providers.find(p => p.is_active === 1);
    if (activeProvider) {
      providerStatus = `connected (${activeProvider.id})`;
    } else {
      providerStatus = 'not configured';
    }
  });

  onDestroy(() => {
    if (unlistenServer) unlistenServer();
    clearInterval(healthInterval);
  });
</script>

<div class="dashboard">
  <header>
    <h1>O.G.R.E Desktop</h1>
    <span class="version">v0.1.0</span>
  </header>

  <section class="health-indicators">
    <div class="indicator server" class:ok={serverStatus === 'running'} class:warn={serverStatus === 'starting...'}>
      <span class="status-dot"></span>
      <span>Server: {serverStatus}</span>
    </div>
    <div class="indicator provider" class:ok={providerStatus.startsWith('connected')} class:warn={providerStatus === 'checking...'}>
      <span class="status-dot"></span>
      <span>Provider: {providerStatus}</span>
    </div>
  </section>

  <section class="quick-stats">
    <h2>Quick Stats</h2>
    <div class="stats-grid">
      <div class="stat">
        <span class="label">Total Sessions</span>
        <span class="value">{totalSessions}</span>
      </div>
      <div class="stat">
        <span class="label">Total Students Graded</span>
        <span class="value">{totalStudents}</span>
      </div>
      <div class="stat">
        <span class="label">Last Session</span>
        <span class="value">{lastSessionDate}</span>
      </div>
    </div>
  </section>
</div>

<style>
  .dashboard {
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

  .version {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-family: monospace;
  }

  /* Health Indicators */
  .health-indicators {
    display: flex;
    gap: 2rem;
    margin-bottom: 3rem;
    background: var(--color-bg-card);
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }

  .indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-error);
    box-shadow: 0 0 0 2px var(--color-error-bg);
    transition: background-color 0.3s ease;
  }

  .indicator.ok .status-dot {
    background: var(--color-success);
    box-shadow: 0 0 0 2px var(--color-success-bg);
  }

  .indicator.warn .status-dot {
    background: var(--color-warning);
    box-shadow: 0 0 0 2px var(--color-warning-bg);
  }

  /* Quick Stats */
  .quick-stats h2 {
    color: var(--color-text-primary);
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .stat {
    background: var(--color-bg-card);
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat .label {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat .value {
    font-size: 2rem;
    font-weight: bold;
    color: var(--color-text-primary);
  }
</style>