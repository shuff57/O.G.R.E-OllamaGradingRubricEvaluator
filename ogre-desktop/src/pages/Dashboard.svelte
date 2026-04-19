<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listenServerStatus } from '../lib/server';
  import { getProviderConfigs, getGradingSessions } from '../lib/db';
  import { pushOnStartup } from '../lib/provider-sync';

  // Injected by Vite define() from package.json at build time
  declare const __APP_VERSION__: string;
  const appVersion = __APP_VERSION__;

  /** Incremented by App.svelte when a new grading session is recorded */
  let { sessionVersion = 0, onnavigate = (_page: string) => {} }: {
    sessionVersion?: number;
    onnavigate?: (page: string) => void;
  } = $props();

  let serverStatus = $state('starting...');
  let providerStatus = $state('checking...');
  let totalSessions = $state(0);
  let totalStudents = $state(0);
  let lastSessionDate = $state('Never');

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
  $effect(() => {
    if (sessionVersion >= 0) {
      loadStats();
    }
  });

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
    <span class="version">v{appVersion}</span>
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

  <section class="quick-actions">
    <h2>Get Started</h2>
    <div class="actions-grid">
      <button class="action-card primary" onclick={() => onnavigate('browser')}>
        <span class="action-icon">🎓</span>
        <span class="action-title">Grade Now</span>
        <span class="action-desc">Open the grading browser and start evaluating student work</span>
      </button>
      <button class="action-card" onclick={() => onnavigate('history')}>
        <span class="action-icon">📊</span>
        <span class="action-title">View Grading History</span>
        <span class="action-desc">Review past sessions and scores</span>
      </button>
      <button class="action-card" onclick={() => onnavigate('settings')}>
        <span class="action-icon">⚙️</span>
        <span class="action-title">Configure Settings</span>
        <span class="action-desc">Set up your AI provider and preferences</span>
      </button>
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
    font-family: var(--font-body);
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
    font-family: var(--font-mono);
  }

  /* Health Indicators */
  .health-indicators {
    display: flex;
    gap: 2rem;
    margin-bottom: 2rem;
    background: var(--color-bg-card);
    padding: 1.5rem;
    border-radius: var(--radius-lg);
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

  /* Quick Actions */
  .quick-actions {
    margin-bottom: 2rem;
  }

  .quick-actions h2,
  .quick-stats h2 {
    color: var(--color-text-primary);
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .action-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  .action-card:hover {
    background: var(--color-bg-card-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    border-color: var(--color-primary);
  }

  .action-card.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .action-card.primary:hover {
    filter: brightness(1.1);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }

  .action-icon {
    font-size: 1.75rem;
    line-height: 1;
  }

  .action-title {
    font-size: 1rem;
    font-weight: 600;
    color: inherit;
  }

  .action-desc {
    font-size: 0.82rem;
    color: inherit;
    opacity: 0.75;
    line-height: 1.4;
  }

  /* Quick Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .stat {
    background: var(--color-bg-card);
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);
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
