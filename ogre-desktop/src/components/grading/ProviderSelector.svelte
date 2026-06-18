<script lang="ts">
  /**
   * ProviderSelector - Compact inline provider + model dropdowns.
   * Fetches providers from the grading server; falls back to a
   * hardcoded list when the server is unreachable.
   */

  import {
    fetchProviders,
    fetchModels,
    setActiveProvider,
    isServerOffline,
    GradingApiError,
    type ProviderConfig,
  } from '../../lib/grading-api';

  interface Props {
    provider?: string;
    model?: string;
    disabled?: boolean;
    onProviderChange?: (provider: string) => void;
    onModelChange?: (model: string) => void;
  }

  let {
    provider = $bindable(''),
    model = $bindable(''),
    disabled = false,
    onProviderChange,
    onModelChange,
  }: Props = $props();

  // ── Reactive state ──────────────────────────────────────────────────

  /** Provider configs fetched from the server (or fallback). */
  let providers: ProviderConfig[] = $state([]);
  /** Model list for the currently selected provider. */
  let models: string[] = $state([]);
  /** True while fetching providers from server. */
  let loadingProviders = $state(true);
  /** True while fetching models for a provider. */
  let loadingModels = $state(false);
  /** True when the grading server is unreachable. */
  let serverOffline = $state(false);
  /** Human-readable error message (null = no error). */
  let error: string | null = $state(null);
  /** Labels of providers that need re-authentication. */
  let reauthProviders: string[] = $state([]);

  // ── Fallback for offline mode ─────────────────────────────────────

  const FALLBACK_PROVIDERS: ProviderConfig[] = [
    { id: 'ollama', api_url: 'http://localhost:11434', model: '', is_active: true },
    { id: 'openai', api_url: 'https://api.openai.com', model: '', is_active: false },
    { id: 'anthropic', api_url: 'https://api.anthropic.com', model: '', is_active: false },
    { id: 'google-gemini', api_url: '', model: '', is_active: false },
    { id: 'github-models', api_url: '', model: '', is_active: false },
  ];

  // ── Display helpers ───────────────────────────────────────────────

  const PROVIDER_LABELS: Record<string, string> = {
    'ollama': 'Ollama (Local)',
    'ollama-local': 'Ollama (Local)',
    'ollama-cloud': 'Ollama (Cloud)',
    'ogre-cloud': 'OGRE Cloud',
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'google-gemini': 'Google Gemini',
    'github-models': 'GitHub Models',
  };

  function labelFor(id: string): string {
    return PROVIDER_LABELS[id] ?? id;
  }

  // ── Lifecycle: fetch providers on mount ────────────────────────────

  $effect(() => {
    loadProviders();
  });

  // ── React to provider changes: fetch models ────────────────────────

  let prevProvider = '';
  $effect(() => {
    const p = provider;
    if (p && p !== prevProvider) {
      prevProvider = p;
      loadModelsForProvider(p);
    }
  });

  // ── Data fetching ─────────────────────────────────────────────────

  async function loadProviders() {
    loadingProviders = true;
    error = null;
    serverOffline = false;

    try {
      const list = await fetchProviders();
      // Detect providers needing re-auth
      reauthProviders = list.filter(p => p.needs_reauth).map(p => labelFor(p.id));
      // Filter them from the usable list
      providers = list.filter(p => !p.needs_reauth);
      serverOffline = false;
      const active = providers.find((p) => p.is_active) ?? providers[0];
      if (active) {
        provider = active.id;
        model = active.model || '';
      } else if (providers.length > 0 && !provider) {
        provider = providers[0].id;
      }
    } catch (err) {
      if (isServerOffline(err)) {
        serverOffline = true;
        providers = FALLBACK_PROVIDERS;
        if (!provider) provider = FALLBACK_PROVIDERS[0].id;
      } else if (err instanceof GradingApiError && err.code === 'AUTH_ERROR') {
        error = 'Authentication failed — check server connection';
        providers = FALLBACK_PROVIDERS;
      } else {
        error = err instanceof Error ? err.message : 'Unknown error';
        providers = FALLBACK_PROVIDERS;
      }
    } finally {
      loadingProviders = false;
    }
  }

  async function loadModelsForProvider(providerId: string) {
    loadingModels = true;
    models = [];

    // Keep current model if it was from the server config
    const serverProvider = providers.find((p) => p.id === providerId);
    const savedModel = serverProvider?.model ?? '';

    try {
      const list = await fetchModels(providerId);
      models = list;

      // Pre-select saved model if it's in the list, otherwise first model
      if (savedModel && list.includes(savedModel)) {
        model = savedModel;
      } else if (list.length > 0 && !model) {
        model = list[0];
      }
    } catch (err) {
      // Model fetch failure is non-fatal — user can still type a model name
      models = [];
      // Keep any previously-selected model
      if (savedModel) model = savedModel;
    } finally {
      loadingModels = false;
    }
  }

  // ── Event handlers ────────────────────────────────────────────────

  async function handleProviderChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    provider = value;
    model = ''; // clear model when switching providers
    onProviderChange?.(value);
  }

  async function handleModelChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    model = value;
    onModelChange?.(value);

    // Sync to server (fire-and-forget — don't block the UI)
    if (provider && value) {
      setActiveProvider(provider, value).catch((err) => {
      });
    }
  }
</script>

<section class="provider-selector">
  {#if serverOffline}
    <div class="status-badge offline">Server offline</div>
  {/if}
  {#if error}
    <div class="status-badge error">{error}</div>
  {/if}
  {#if reauthProviders.length > 0}
    <div class="status-badge reauth">
      {reauthProviders.join(', ')} sign-in expired — re-authenticate in Settings
    </div>
  {/if}

  <div class="selector-row">
    <select
      class="provider-select"
      value={provider}
      onchange={handleProviderChange}
      disabled={disabled || loadingProviders}
    >
      {#if loadingProviders}
        <option value="" disabled selected>Loading...</option>
      {:else}
        {#each providers as p}
          <option value={p.id}>{labelFor(p.id)}</option>
        {/each}
      {/if}
    </select>

    <select
      class="model-select"
      value={model}
      onchange={handleModelChange}
      disabled={disabled || loadingModels}
    >
      {#if loadingModels}
        <option value="" disabled selected>Loading models...</option>
      {:else if models.length === 0}
        <option value="" disabled selected>No models available</option>
      {:else}
        <option value="" disabled>Select model...</option>
        {#each models as m}
          <option value={m}>{m}</option>
        {/each}
      {/if}
    </select>
  </div>
</section>

<style>
  .provider-selector {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .selector-row {
    display: flex;
    gap: var(--spacing-2);
  }

  .provider-select,
  .model-select {
    flex: 1;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.85rem;
  }

  .provider-select:focus,
  .model-select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  .provider-select:disabled,
  .model-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: var(--radius-sm, 4px);
    width: fit-content;
  }

  .status-badge.offline {
    background: var(--color-warning-bg, #fef3cd);
    color: var(--color-warning-text, #856404);
    border: 1px solid var(--color-warning-border, #ffc107);
  }

  .status-badge.error {
    background: var(--color-error-bg, #f8d7da);
    color: var(--color-error-text, #721c24);
    border: 1px solid var(--color-error-border, #f5c6cb);
  }
  .status-badge.reauth {
    background: var(--color-warning-bg, #fef3cd);
    color: var(--color-warning-text, #856404);
    border: 1px solid var(--color-warning-border, #ffc107);
  }

</style>
