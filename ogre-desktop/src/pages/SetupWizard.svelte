<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { saveProviderConfig, setSetting } from '../lib/db';
  import {
    fetchAvailableModels,
    startGitHubDeviceFlow,
    startChatGPTDeviceFlow,
    startClaudeOAuthFlow,
    startGoogleDeviceFlow
  } from '../lib/oauth';
  import type { DeviceFlowResult } from '../lib/oauth';
  import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

  const dispatch = createEventDispatcher();

  let currentStep = 1;
  let loading = false;
  let error = '';

  // OAuth State
  let fetchedModels: Record<string, Array<{id: string, name: string}>> = {};
  let fetchingModels: Record<string, boolean> = {};
  let modelFetchErrors: Record<string, string> = {};
  let oauthSignedIn: Record<string, boolean> = {};

  // Device flow state
  let deviceFlows: Record<string, DeviceFlowResult> = {};
  let authLoading: Record<string, boolean> = {};
  let authErrors: Record<string, string> = {};

  let providers = [
    {
      id: 'ollama',
      name: 'Ollama',
      enabled: false,
      apiKey: '',
      apiUrl: 'http://localhost:11434',
      model: '',
      keyUrl: '',
      placeholderKey: 'Optional (only for cloud)',
      placeholderUrl: 'http://localhost:11434 or https://your-cloud-instance.com'
    },
    {
      id: 'openai',
      name: 'OpenAI',
      enabled: false,
      apiKey: '',
      apiUrl: '',
      model: '',
      keyUrl: 'https://platform.openai.com/api-keys',
      placeholderKey: 'sk-...'
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      enabled: false,
      apiKey: '',
      apiUrl: '',
      model: '',
      keyUrl: 'https://console.anthropic.com/',
      placeholderKey: 'sk-ant-...',
      oauth: true,
      useApiKey: false
    },
    {
      id: 'google-gemini',
      name: 'Google Gemini',
      enabled: false,
      apiKey: '',
      apiUrl: '',
      model: '',
      keyUrl: 'https://aistudio.google.com/apikey',
      placeholderKey: 'AIza...',
      oauth: true,
      useApiKey: false
    },
    {
      id: 'github-models',
      name: 'GitHub Models',
      enabled: false,
      apiKey: '',
      apiUrl: '',
      model: '',
      keyUrl: 'https://github.com/settings/tokens',
      placeholderKey: 'ghp_...',
      oauth: true,
      useApiKey: false
    }
  ];

  let ollamaLocalDetected = false;

  async function detectOllamaLocal() {
    try {
      // Must set Origin header — Ollama rejects Tauri's default Origin (http://tauri.localhost)
      const response = await tauriFetch('http://localhost:11434/api/tags', {
        headers: { 'Origin': 'http://localhost:11434' }
      });
      if (response.ok) {
        ollamaLocalDetected = true;
        const ollamaProvider = providers.find(p => p.id === 'ollama');
        if (ollamaProvider) {
          ollamaProvider.enabled = true;
          ollamaProvider.apiUrl = 'http://localhost:11434';
          providers = providers; // trigger update
        }
      }
    } catch {
      ollamaLocalDetected = false;
    }
  }

  async function handleOAuthSignIn(providerId: string) {
    authErrors[providerId] = '';
    authLoading[providerId] = true;
    authErrors = { ...authErrors };
    authLoading = { ...authLoading };

    try {
      if (providerId === 'github-models') {
        const flow = await startGitHubDeviceFlow();
        handleDeviceFlow(providerId, flow);
      } else if (providerId === 'openai') {
        const flow = await startChatGPTDeviceFlow();
        handleDeviceFlow(providerId, flow);
      } else if (providerId === 'google-gemini') {
        const flow = await startGoogleDeviceFlow();
        handleDeviceFlow(providerId, flow);
      } else if (providerId === 'anthropic') {
        const flow = await startClaudeOAuthFlow();
        handleDeviceFlow(providerId, flow);
      }
    } catch (err: any) {
      authErrors[providerId] = err instanceof Error ? err.message : String(err);
      authErrors = { ...authErrors };
    } finally {
      authLoading[providerId] = false;
      authLoading = { ...authLoading };
    }
  }

  async function handleDeviceFlow(providerId: string, flow: DeviceFlowResult) {
    deviceFlows[providerId] = flow;
    deviceFlows = { ...deviceFlows };

    try {
      const result = await flow.poll();
      if (result.success) {
        oauthSignedIn[providerId] = true;
        oauthSignedIn = { ...oauthSignedIn };
        // Auto-fetch models after successful sign-in
        fetchModels(providerId);
        // Clear flow state
        delete deviceFlows[providerId];
        deviceFlows = { ...deviceFlows };
      } else if (result.error !== 'Cancelled') {
        authErrors[providerId] = result.error || 'Authentication failed';
        authErrors = { ...authErrors };
      }
    } catch (err: any) {
      if (deviceFlows[providerId]) {
        authErrors[providerId] = err instanceof Error ? err.message : String(err);
        authErrors = { ...authErrors };
      }
    } finally {
      if (deviceFlows[providerId]) {
        delete deviceFlows[providerId];
        deviceFlows = { ...deviceFlows };
      }
    }
  }


  function cancelAuth(providerId: string) {
    if (deviceFlows[providerId]) {
      deviceFlows[providerId].cancel();
      delete deviceFlows[providerId];
      deviceFlows = { ...deviceFlows };
    }
    authLoading[providerId] = false;
    authErrors[providerId] = '';
    authLoading = { ...authLoading };
    authErrors = { ...authErrors };
  }

  async function fetchModels(providerId: string) {
    fetchingModels[providerId] = true;
    fetchingModels = fetchingModels; // trigger update
    modelFetchErrors[providerId] = '';

    try {
      // For Ollama, fetch directly from the API
      if (providerId === 'ollama') {
        const provider = providers.find(p => p.id === providerId);
        if (!provider || !provider.apiUrl) {
          throw new Error('Ollama API URL not configured');
        }

        const baseUrl = provider.apiUrl.replace(/\/$/, '');
        const url = `${baseUrl}/api/tags`;
        const headers: Record<string, string> = {
          // Ollama rejects Tauri's default Origin header (http://tauri.localhost)
          'Origin': new URL(baseUrl).origin,
        };

        // Add Authorization header if API key is configured (for cloud)
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const response = await tauriFetch(url, { headers });
        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];

        fetchedModels[providerId] = models.map(m => ({ id: m, name: m }));
        fetchedModels = fetchedModels;

        // Auto-select first model if none selected
        if (!provider.model && models.length > 0) {
          provider.model = models[0];
          providers = providers;
        }
      } else {
        // For OAuth providers
        const providerKeyMap: Record<string, "github" | "openai" | "anthropic" | "google"> = {
          'github-models': 'github',
          'openai': 'openai',
          'anthropic': 'anthropic',
          'google-gemini': 'google',
        };
        const oauthProvider = providerKeyMap[providerId];
        if (!oauthProvider) throw new Error('Unknown provider');
        const models = await fetchAvailableModels(oauthProvider);
        fetchedModels[providerId] = models.map(m => ({ id: m, name: m }));
        fetchedModels = fetchedModels;

        const provider = providers.find(p => p.id === providerId);
        if (provider && !provider.model && models.length > 0) {
          provider.model = models[0];
          providers = providers;
        }
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch models.';
      // Friendly error for Ollama connection failures
      if (providerId === 'ollama' && (msg.includes('connect') || msg.includes('refused') || msg.includes('network') || msg.includes('fetch'))) {
        modelFetchErrors[providerId] = 'Could not connect to Ollama. Make sure Ollama is running.';
      } else {
        modelFetchErrors[providerId] = msg;
      }
      modelFetchErrors = modelFetchErrors;
    } finally {
      fetchingModels[providerId] = false;
      fetchingModels = fetchingModels;
    }
  }

  function toggleAuthMethod(provider: any) {
    provider.useApiKey = !provider.useApiKey;
    providers = providers;
  }

  function nextStep() {
    error = '';

    if (currentStep === 2) {
      // Validate Step 2
      const enabledProviders = providers.filter(p => p.enabled);
      if (enabledProviders.length === 0) {
        error = 'Please select at least one provider.';
        return;
      }

      for (const p of enabledProviders) {
        if (p.id === 'ollama') {
          if (!p.apiUrl) { error = 'Ollama requires an API URL.'; return; }
          // API key is optional - only needed for cloud instances
        }
        // OAuth providers validation
        // @ts-ignore
        if (p.oauth) {
           // @ts-ignore
           if (p.useApiKey) {
             if (!p.apiKey) { error = `${p.name} requires an API Key.`; return; }
           } else {
             if (!oauthSignedIn[p.id]) { error = `Please sign in to ${p.name} or use an API Key.`; return; }
           }
        } else if (['openai'].includes(p.id) && !p.apiKey) {
           error = `${p.name} requires an API Key.`; return;
        }
      }

      // Auto-fetch Ollama models when advancing to step 3
      const ollamaProvider = enabledProviders.find(p => p.id === 'ollama');
      if (ollamaProvider && !fetchedModels['ollama']?.length && !fetchingModels['ollama']) {
        fetchModels('ollama');
      }
    }

    if (currentStep === 3) {
       // Validate Step 3 if needed
    }

    if (currentStep < 4) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
      error = '';
    }
  }

  async function saveAndComplete() {
    loading = true;
    try {
      const enabledProviders = providers.filter(p => p.enabled);
      for (const provider of enabledProviders) {
        await saveProviderConfig({
          id: provider.id,
          api_url: provider.apiUrl,
          api_key: provider.apiKey,
          model: provider.model,
          is_active: 1
        });
      }

      await setSetting('setup_complete', 'true');
      dispatch('complete');
    } catch (err) {
      error = 'Failed to save configuration. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="wizard-container">
  <div class="wizard-card">
    <!-- Progress Indicator -->
    <div class="progress-bar">
      <div class="progress-step {currentStep >= 1 ? 'active' : ''}">1</div>
      <div class="line {currentStep >= 2 ? 'active' : ''}"></div>
      <div class="progress-step {currentStep >= 2 ? 'active' : ''}">2</div>
      <div class="line {currentStep >= 3 ? 'active' : ''}"></div>
      <div class="progress-step {currentStep >= 3 ? 'active' : ''}">3</div>
      <div class="line {currentStep >= 4 ? 'active' : ''}"></div>
      <div class="progress-step {currentStep >= 4 ? 'active' : ''}">4</div>
    </div>

    <!-- Step 1: Welcome -->
    {#if currentStep === 1}
      <div class="step-content">
        <h1>Welcome to O.G.R.E!</h1>
        <p class="subtitle">Let's configure your AI provider to get started.</p>
        <p class="description">
          O.G.R.E helps you grade student work using AI. You can connect to local models (Ollama) or cloud providers like OpenAI, Anthropic, or Gemini.
        </p>
        <div class="actions">
          <button class="btn-primary" on:click={nextStep}>Get Started</button>
        </div>
      </div>
    {/if}

    <!-- Step 2: Provider Selection -->
    {#if currentStep === 2}
      <div class="step-content">
        <h2>Select Providers</h2>
        <p class="subtitle">Enable and configure the AI providers you want to use.</p>
        
        <div class="providers-list">
          {#each providers as provider}
            <div class="provider-card {provider.enabled ? 'enabled' : ''}">
              <div class="card-header">
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={provider.enabled}>
                  <span class="provider-name">{provider.name}</span>
                </label>
                {#if provider.id === 'ollama_local'}
                  <button class="btn-sm" on:click={detectOllamaLocal}>
                    {#if ollamaLocalDetected}✅ Detected{:else}Auto-detect{/if}
                  </button>
                {/if}
              </div>

              {#if provider.enabled}
                <div class="card-body">
                  {#if provider.id === 'ollama'}
                    <div class="form-group">
                      <label for="ollama-url">API URL</label>
                      <input id="ollama-url" type="text" bind:value={provider.apiUrl} placeholder={provider.placeholderUrl}>
                    </div>
                    <div class="form-group">
                      <label for="ollama-key">API Key (Optional)</label>
                      <input id="ollama-key" type="password" bind:value={provider.apiKey} placeholder={provider.placeholderKey}>
                      <span class="hint">Only needed for cloud Ollama instances</span>
                    </div>
                  {:else if provider.oauth}
                    <!-- OAuth Provider UI — Sign-in is primary, API key is secondary -->
                    {#if provider.useApiKey}
                       <div class="form-group">
                        <label for="{provider.id}-key">API Key</label>
                        <input id="{provider.id}-key" type="password" bind:value={provider.apiKey} placeholder={provider.placeholderKey}>
                        <div class="flex-row">
                             {#if provider.keyUrl}
                               <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" class="help-link">Get API Key</a>
                             {/if}
                             <button class="link-btn" on:click={() => toggleAuthMethod(provider)}>Or sign in with {provider.name}</button>
                        </div>
                      </div>
                    {:else}
                       <div class="oauth-section">
                          {#if oauthSignedIn[provider.id]}
                             <div class="signed-in-badge">
                                <span>Signed in</span>
                             </div>
                             {#if fetchedModels[provider.id]?.length}
                                <span class="hint">{fetchedModels[provider.id].length} models available</span>
                             {/if}
                          {:else if deviceFlows[provider.id]}
                             <!-- Device flow active: show code + polling -->
                             <div class="device-flow-box">
                               <p class="instructions">1. A browser tab opened. Enter this code:</p>
                               <div class="code-display">
                                  {deviceFlows[provider.id].userCode}
                                  <button class="copy-btn" on:click={() => navigator.clipboard.writeText(deviceFlows[provider.id].userCode)}>Copy</button>
                               </div>
                               <p class="instructions">2. Authorize access in the browser, then wait...</p>
                               <div class="polling-indicator">
                                  <span class="spinner-icon">&#8987;</span> Waiting for authorization...
                               </div>
                               <button class="link-btn" on:click={() => cancelAuth(provider.id)}>Cancel</button>
                             </div>
                          {:else}
                             {#if authErrors[provider.id]}
                               <div class="error-message" style="margin-bottom: 0.5rem; text-align: left; font-size: 0.85rem;">{authErrors[provider.id]}</div>
                             {/if}
                             <button class="btn-oauth" on:click={() => handleOAuthSignIn(provider.id)} disabled={authLoading[provider.id]}>
                                {#if authLoading[provider.id]}Loading...{:else}Sign in with {provider.name}{/if}
                             </button>
                          {/if}
                           <button class="link-btn" on:click={() => toggleAuthMethod(provider)}>Or use API Key</button>
                        </div>
                     {/if}
                  {:else}
                    <!-- Standard API Key Provider (OpenAI) -->
                    <div class="form-group">
                      <label for="{provider.id}-key-standard">API Key</label>
                      <input id="{provider.id}-key-standard" type="password" bind:value={provider.apiKey} placeholder={provider.placeholderKey}>
                      {#if provider.keyUrl}
                        <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" class="help-link">Get API Key</a>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        <div class="actions">
          <button class="btn-secondary" on:click={prevStep}>Back</button>
          <button class="btn-primary" on:click={nextStep}>Next</button>
        </div>
      </div>
    {/if}

    <!-- Step 3: Model Configuration -->
    {#if currentStep === 3}
      <div class="step-content">
        <h2>Configure Models</h2>
        <p class="subtitle">Specify the model name for each enabled provider.</p>

        <div class="models-list">
          {#each providers.filter(p => p.enabled) as provider}
            <div class="model-card">
              <h3>{provider.name}</h3>
              <div class="form-group">
                <label for="{provider.id}-model">Model Name</label>
                
                {#if (provider.oauth && !provider.useApiKey && oauthSignedIn[provider.id]) || provider.id === 'ollama'}
                    <!-- Dropdown for OAuth or Ollama providers -->
                    {#if fetchingModels[provider.id]}
                        <div class="loading-models">Fetching models...</div>
                    {:else if fetchedModels[provider.id]?.length > 0}
                        <select id="{provider.id}-model" bind:value={provider.model} class="model-select">
                           <option value="" disabled>Select a model</option>
                           {#each fetchedModels[provider.id] as m}
                              <option value={m.id}>{m.name}</option>
                           {/each}
                        </select>
                        <div class="flex-row">
                          <button class="link-btn small" on:click={() => fetchModels(provider.id)}>Refresh Models</button>
                        </div>
                    {:else}
                         <div class="error-container">
                             {#if modelFetchErrors[provider.id]}
                               <span class="error-text">{modelFetchErrors[provider.id]}</span>
                             {/if}
                             <button class="btn-secondary small" on:click={() => fetchModels(provider.id)}>
                               {modelFetchErrors[provider.id] ? 'Retry' : 'Fetch Models'}
                             </button>
                             <input id="{provider.id}-model-manual" type="text" bind:value={provider.model} placeholder="Or enter model name manually">
                         </div>
                    {/if}
                {:else}
                   <!-- Text Input for other providers -->
                   <input id="{provider.id}-model-text" type="text" bind:value={provider.model} placeholder="e.g. gpt-4o, claude-3-sonnet">
                   <span class="hint">Check your provider's documentation for exact model names.</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="actions">
          <button class="btn-secondary" on:click={prevStep}>Back</button>
          <button class="btn-primary" on:click={nextStep}>Next</button>
        </div>
      </div>
    {/if}

    <!-- Step 4: Confirmation -->
    {#if currentStep === 4}
      <div class="step-content">
        <h2>Ready to Start?</h2>
        <p class="subtitle">Review your configuration.</p>

        <div class="summary-list">
          {#each providers.filter(p => p.enabled) as provider}
            <div class="summary-item">
              <span class="label">{provider.name}:</span>
              <span class="value">{provider.model || 'Default Model'}</span>
            </div>
          {/each}
        </div>

        <div class="actions">
          <button class="btn-secondary" on:click={prevStep}>Back</button>
          <button class="btn-primary" on:click={saveAndComplete} disabled={loading}>
            {#if loading}Saving...{:else}Save & Start{/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .wizard-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
    background-color: #f0f2f5;
  }

  .wizard-card {
    background: white;
    width: 100%;
    max-width: 600px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    overflow-y: auto;
  }

  /* Progress Bar */
  .progress-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding: 0 1rem;
  }

  .progress-step {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #e0e0e0;
    color: #777;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    z-index: 1;
  }

  .progress-step.active {
    background: #3498db;
    color: white;
  }

  .line {
    flex: 1;
    height: 2px;
    background: #e0e0e0;
    margin: 0 8px;
  }

  .line.active {
    background: #3498db;
  }

  /* Content */
  .step-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h1, h2 {
    margin: 0;
    color: #1a1a1a;
    text-align: center;
    font-size: 1.75rem;
  }

  .subtitle {
    text-align: center;
    color: #555;
    margin: -0.5rem 0 0 0;
    font-size: 1.05rem;
  }

  .description {
    text-align: center;
    line-height: 1.6;
    color: #333;
    font-size: 1rem;
  }

  /* Actions */
  .actions {
    display: flex;
    justify-content: space-between;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }

  .actions button {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-primary {
    background-color: #3498db;
    color: white;
    margin-left: auto; /* Push to right if alone */
  }

  .btn-primary:hover {
    background-color: #2980b9;
  }

  .btn-primary:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
  }

  .btn-secondary {
    background-color: #ecf0f1;
    color: #2c3e50;
    margin-right: auto;
  }

  .btn-secondary:hover {
    background-color: #bdc3c7;
  }

  /* Providers List */
  .providers-list, .models-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .provider-card,   .model-card {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 1rem;
    transition: border-color 0.2s;
  }
  
  .model-card h3 {
    margin: 0 0 0.75rem 0;
    color: #1a1a1a;
    font-size: 1.1rem;
  }

  .provider-card.enabled {
    border-color: #3498db;
    background-color: #fbfdff;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 500;
    font-size: 1.1rem;
    color: #1a1a1a;
  }
  
  .provider-name {
    color: #1a1a1a;
  }

  .checkbox-label input {
    margin-right: 0.75rem;
    width: 18px;
    height: 18px;
  }

  .card-body {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-group label {
    font-size: 0.95rem;
    color: #333;
    font-weight: 500;
  }

  .form-group input {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .help-link {
    font-size: 0.85rem;
    color: #3498db;
    text-decoration: none;
    align-self: flex-start;
  }

  .help-link:hover {
    text-decoration: underline;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    background: #ecf0f1;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    cursor: pointer;
  }

  .hint {
    font-size: 0.85rem;
    color: #666;
    font-style: italic;
  }

  .summary-list {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 6px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
  }

  .summary-item:last-child {
    border-bottom: none;
  }
  
  .summary-item .label {
    color: #333;
    font-weight: 500;
  }
  
  .summary-item .value {
    color: #1a1a1a;
    font-family: 'Consolas', monospace;
  }

  .error-message {
    color: #e74c3c;
    text-align: center;
    font-weight: 500;
  }

  /* OAuth Styles */
  .flex-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }

  .link-btn {
    background: none;
    border: none;
    color: #3498db;
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }
  
  .link-btn.small {
    font-size: 0.8rem;
    margin-top: 0.25rem;
  }

  .oauth-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 4px;
    border: 1px dashed #cbd5e0;
  }

  .btn-oauth {
    background-color: white;
    color: #333;
    border: 1px solid #ddd;
    padding: 0.6rem 1.2rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  .btn-oauth:hover {
    background-color: #fbfdff;
    border-color: #b0c4de;
    box-shadow: 0 2px 5px rgba(0,0,0,0.08);
  }

  .signed-in-badge {
    background-color: #d4edda;
    color: #155724;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .loading-models {
    color: #666;
    font-style: italic;
    padding: 0.5rem;
  }

  .model-select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    width: 100%;
    background-color: white;
  }

  .error-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .error-text {
    color: #e74c3c;
    font-size: 0.85rem;
  }

  /* Device Flow (Setup Wizard) */
  .device-flow-box {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f0f4f8;
    border-radius: 6px;
    border: 1px solid #d0d7de;
  }

  .device-flow-box .instructions {
    margin: 0;
    font-size: 0.9rem;
    color: #333;
  }

  .code-display {
    background: #1a1a2e;
    color: #e0e0e0;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-family: 'Consolas', monospace;
    font-size: 1.25rem;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    letter-spacing: 0.1em;
  }

  .copy-btn {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }

  .copy-btn:hover {
    background: #2980b9;
  }

  .polling-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #666;
    font-size: 0.85rem;
  }

  .spinner-icon {
    animation: spin 2s linear infinite;
    display: inline-block;
  }

</style>
