<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    getProviderConfigs, 
    saveProviderConfig, 
    deleteProviderConfig, 
    getOAuthToken,
  } from '../../lib/db';
  import type { ProviderConfig } from '../../lib/db';
  import { 
    startGitHubDeviceFlow, 
    startChatGPTDeviceFlow, 
    startClaudeOAuthFlow, 
    startGoogleDeviceFlow, 
    signOut, 
    fetchAvailableModels 
  } from '../../lib/oauth';
  import type { DeviceFlowResult } from '../../lib/oauth';
  import { pushProvidersToServer } from '../../lib/provider-sync';

  let providers: ProviderConfig[] = [];
  let editingProvider: string | null = null;
  let showAddForm = false;

  // New Provider State
  let newProviderId = '';
  let newProviderUrl = '';
  let newProviderKey = '';
  let newProviderModel = '';

  // OAuth / Auth Flow State
  let oauthStatus: Record<string, boolean> = {};
  let fetchedModels: Record<string, string[]> = {};
  let fetchingModels: Record<string, boolean> = {};
  let modelFetchErrors: Record<string, string> = {};
  let useApiKey: Record<string, boolean> = {}; // Track if user wants to use API key even if OAuth is available

  // Active authentication flows
  let deviceFlows: Record<string, DeviceFlowResult> = {};
  let authLoading: Record<string, boolean> = {};
  let authErrors: Record<string, string> = {};
  // Buffer for Anthropic copy-paste auth code
  let _anthropicPasteBuffer = '';

  // Available providers
  // Note: ollama-cloud and ollama-local were merged into single 'ollama' provider
  // Legacy providers with old IDs will still work but won't appear in add dropdown
  const PROVIDER_OPTIONS = [
    { id: 'ollama', name: 'Ollama', requiresUrl: true, requiresKey: false, defaultUrl: 'http://localhost:11434', canSignIn: false },
    { id: 'ollama-cloud', name: 'Ollama (Cloud GPU)', requiresUrl: true, requiresKey: true, defaultUrl: 'https://api.runpod.ai/v2/YOUR_ENDPOINT_ID', canSignIn: false },
    { id: 'openai', name: 'OpenAI', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
    { id: 'anthropic', name: 'Anthropic (Claude)', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
    { id: 'google-gemini', name: 'Google Gemini', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
    { id: 'github-models', name: 'GitHub Models', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
  ];

  onMount(async () => {
    await loadProviders();
    await checkOAuthStatus();
  });

  async function loadProviders() {
    providers = await getProviderConfigs();
  }

  function getProviderKey(id: string): "github" | "openai" | "anthropic" | "google" | "ollama" | null {
    if (id === 'github-models') return 'github';
    if (id === 'openai') return 'openai';
    if (id === 'anthropic') return 'anthropic';
    if (id === 'google-gemini') return 'google';
    if (id === 'ollama' || id === 'ollama-cloud') return 'ollama';
    return null;
  }

  async function checkOAuthStatus() {
    for (const opt of PROVIDER_OPTIONS) {
      if (opt.canSignIn) {
        const providerKey = getProviderKey(opt.id);
        if (!providerKey) continue;
        
        const token = await getOAuthToken(providerKey);
        if (token) {
        }
        oauthStatus[opt.id] = !!token;
        if (token) {
           // If we have a token, fetch models automatically
           fetchModels(opt.id);
        }
      }
    }
    oauthStatus = { ...oauthStatus }; // Trigger reactivity after all checks
  }

  async function startAuth(providerId: string) {
    authErrors[providerId] = '';
    authLoading[providerId] = true;
    authErrors = { ...authErrors }; // Trigger reactivity
    authLoading = { ...authLoading }; // Trigger reactivity
    
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
    } catch (error) {
      authErrors[providerId] = error instanceof Error ? error.message : String(error);
      authErrors = { ...authErrors }; // Trigger reactivity
    } finally {
      authLoading[providerId] = false;
      authLoading = { ...authLoading }; // Trigger reactivity
    }
  }

  async function handleDeviceFlow(providerId: string, flow: DeviceFlowResult) {
    deviceFlows[providerId] = flow;
    
    // Start polling in background
    try {
      const result = await flow.poll();
      if (result.success) {
        oauthStatus[providerId] = true;
        oauthStatus = { ...oauthStatus }; // Trigger reactivity
        fetchModels(providerId);
        pushProvidersToServer();
        // Clear flow state
        if (deviceFlows[providerId]) {
          delete deviceFlows[providerId];
          deviceFlows = { ...deviceFlows }; // Trigger reactivity
        }
      } else if (result.error !== 'Cancelled') {
        authErrors[providerId] = result.error || 'Authentication failed';
        authErrors = { ...authErrors }; // Trigger reactivity
      }
    } catch (error) {
      if (deviceFlows[providerId]) { // Only report if not cancelled
        authErrors[providerId] = error instanceof Error ? error.message : String(error);
      }
    } finally {
      // Cleanup if flow still exists
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
    authLoading = { ...authLoading }; // Trigger reactivity
    authErrors = { ...authErrors }; // Trigger reactivity
  }

  async function handleSignOut(providerId: string) {
    try {
      const providerKey = getProviderKey(providerId);
      if (providerKey) {
        await signOut(providerKey);
        oauthStatus[providerId] = false;
        oauthStatus = { ...oauthStatus }; // Trigger reactivity
        fetchedModels[providerId] = [];
        fetchedModels = { ...fetchedModels }; // Trigger reactivity
        pushProvidersToServer();
      }
    } catch (error) {
       oauthStatus[providerId] = false;
       oauthStatus = { ...oauthStatus }; // Trigger reactivity
    }
  }

  async function fetchModels(providerId: string) {
    // Skip model discovery for ollama-cloud (model is fixed)
    if (providerId === 'ollama-cloud') {
      return;
    }
    
    fetchingModels[providerId] = true;
    fetchingModels = { ...fetchingModels }; // Trigger reactivity
    modelFetchErrors[providerId] = '';
    modelFetchErrors = { ...modelFetchErrors }; // Trigger reactivity
    try {
      const providerKey = getProviderKey(providerId);
      if (!providerKey) throw new Error('Invalid provider for model fetching');
      
      const models = await fetchAvailableModels(providerKey);
      fetchedModels[providerId] = models;
      fetchedModels = { ...fetchedModels }; // Trigger reactivity
      
      // If editing this provider, update its model if empty
      const provider = providers.find(p => p.id === providerId);
      if (provider && !provider.model && models.length > 0) {
        provider.model = models[0];
        providers = [...providers]; // Trigger reactivity
      }
    } catch (error) {
      modelFetchErrors[providerId] = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error) || 'Unknown error');
      modelFetchErrors = { ...modelFetchErrors }; // Trigger reactivity
    } finally {
      fetchingModels[providerId] = false;
      fetchingModels = { ...fetchingModels }; // Trigger reactivity
    }
  }

  async function saveProvider(config: ProviderConfig) {
    await saveProviderConfig({
      id: config.id,
      api_url: config.api_url,
      api_key: config.api_key,
      model: config.model,
      is_active: config.is_active
    });
    await loadProviders();
    editingProvider = null;
    pushProvidersToServer();
  }

  async function deleteProvider(id: string) {
    if (!confirm(`Delete provider "${id}"? This cannot be undone.`)) return;
    await deleteProviderConfig(id);
    await loadProviders();
    pushProvidersToServer();
  }

  async function testConnection(provider: ProviderConfig) {
    const option = PROVIDER_OPTIONS.find(p => p.id === provider.id);
    
    // Basic validation
    if (option?.requiresKey && !provider.api_key && !oauthStatus[provider.id]) {
      alert('API Key is required for this provider (or sign in via OAuth)');
      return;
    }
    // Ollama special case: key only required for cloud endpoints
    if (provider.id === 'ollama' && !provider.api_key && provider.api_url && !provider.api_url.includes('localhost')) {
      const useCloudWithoutKey = confirm('You are using a cloud Ollama endpoint without an API key. This may fail. Continue anyway?');
      if (!useCloudWithoutKey) return;
    }
    if (option?.requiresUrl && !provider.api_url) {
      alert('API URL is required for this provider');
      return;
    }
    if (!provider.model) {
      alert('Model name is required');
      return;
    }
    
    // Success feedback
    alert(`Provider "${provider.id}" configuration looks valid!`);
  }

  function getAvailableProviders() {
    return PROVIDER_OPTIONS.filter(opt => !providers.find(p => p.id === opt.id));
  }

  function handleAddSelect() {
    const option = PROVIDER_OPTIONS.find(p => p.id === newProviderId);
    if (option) {
      newProviderUrl = option.defaultUrl;
      newProviderKey = '';
      // Set default model for ollama-cloud
      newProviderModel = newProviderId === 'ollama-cloud' ? 'qwen3.5-9B-stat-grader' : '';
    }
  }

  async function addNewProvider() {
    if (!newProviderId) return;
    
    await saveProviderConfig({
      id: newProviderId,
      api_url: newProviderUrl,
      api_key: newProviderKey,
      model: newProviderModel,
      is_active: 1
    });

    await loadProviders();
    showAddForm = false;
    resetAddForm();
  }

  function resetAddForm() {
    newProviderId = '';
    newProviderUrl = '';
    newProviderKey = '';
    newProviderModel = '';
  }
</script>

<!-- Provider Configuration Section -->
<section class="card mb-6">
  <h3>AI Provider Configuration</h3>
  <p class="mb-6">Manage connections to local or cloud-based AI providers.</p>
  
  {#if providers.length === 0 && !showAddForm}
    <div class="empty-state">
      <p>No providers configured yet.</p>
      <button class="primary" onclick={() => showAddForm = true}>Add Your First Provider</button>
    </div>
  {/if}

  <div class="providers-list">
    {#each providers as provider}
      {@const option = PROVIDER_OPTIONS.find(p => p.id === provider.id)}
      <div class="provider-item" class:editing={editingProvider === provider.id}>
        <div class="provider-header">
          <h4>{option?.name || provider.id}</h4>
          {#if editingProvider !== provider.id}
            <div class="actions">
              <button class="secondary small" onclick={() => testConnection(provider)}>Test</button>
              <button class="secondary small" onclick={() => editingProvider = provider.id}>Edit</button>
              <button class="danger small" onclick={() => deleteProvider(provider.id)}>Delete</button>
            </div>
          {/if}
        </div>

        {#if editingProvider === provider.id}
          <!-- Edit form -->
          <div class="edit-form">
            {#if option?.requiresUrl}
              <label>
                API URL
                <input type="text" bind:value={provider.api_url} placeholder="https://api.example.com" />
              </label>
              {#if provider.id === 'ollama'}
                <div class="url-presets">
                  <span class="preset-label">Quick presets:</span>
                  <button type="button" class="preset-btn" onclick={() => provider.api_url = 'http://localhost:11434'}>
                    Local (localhost:11434)
                  </button>
                  <button type="button" class="preset-btn" onclick={() => provider.api_url = 'https://ollama.com/api'}>
                    Cloud (ollama.com/api)
                  </button>
                </div>
              {/if}
            {/if}
            
             {#if option?.requiresKey}
               {#if option.canSignIn}
                  <div class="oauth-section">
                    {#if oauthStatus[provider.id] && !useApiKey[provider.id]}
                      <!-- SIGNED IN STATE -->
                      <div class="oauth-status success">
                         <span class="icon">✅</span> Signed in
                         <button class="ghost small" onclick={() => handleSignOut(provider.id)}>Sign out</button>
                      </div>
    {:else if deviceFlows[provider.id]}
      <!-- DEVICE FLOW ACTIVE -->
      <div class="device-flow-container">
        {#if deviceFlows[provider.id].submitCode}
          <!-- COPY-PASTE FLOW (Anthropic) -->
          <p class="instructions">1. Sign in at the page that just opened in your browser.</p>
          <p class="instructions">2. Copy the code shown on the page and paste it below:</p>
          <div class="paste-input-row">
            <input
              type="text"
              placeholder="Paste code here (e.g. abc123#xyz...)"
              oninput={(e) => { _anthropicPasteBuffer = (e.currentTarget as HTMLInputElement).value; }}
            />
            <button class="btn primary small" onclick={() => {
              if (_anthropicPasteBuffer) {
                deviceFlows[provider.id].submitCode?.(_anthropicPasteBuffer);
                _anthropicPasteBuffer = '';
              }
            }}>Submit</button>
          </div>
        {:else}
          <!-- STANDARD DEVICE-CODE FLOW (GitHub, OpenAI, Google) -->
          <p class="instructions">1. Go to: <a href={deviceFlows[provider.id].verificationUrl} target="_blank">{deviceFlows[provider.id].verificationUrl}</a></p>
          <p class="instructions">2. Enter code:</p>
          <div class="code-display">
             {deviceFlows[provider.id].userCode}
             <button class="ghost small" title="Copy" onclick={() => navigator.clipboard.writeText(deviceFlows[provider.id].userCode)}>📋</button>
          </div>
        {/if}
        <div class="polling-indicator">
           <span class="spinner">⏳</span> Waiting for authorization...
        </div>
        <button class="ghost small" onclick={() => cancelAuth(provider.id)}>Cancel</button>
      </div>
                    {:else}
                      <!-- NOT SIGNED IN / ACTIONS -->
                      <div class="oauth-actions">
                         {#if authErrors[provider.id]}
                           <div class="error-banner">{authErrors[provider.id]}</div>
                         {/if}

                         {#if !useApiKey[provider.id]}
                            <button class="btn oauth-btn" disabled={authLoading[provider.id]} onclick={() => startAuth(provider.id)}>
                              {#if authLoading[provider.id]}
                                Loading...
                              {:else}
                                Sign in with {option.name.split(' ')[0]}
                              {/if}
                            </button>
                            <div class="divider"><span>OR</span></div>
                         {/if}
                         
                         {#if useApiKey[provider.id]}
                            <label>
                               API Key (Optional)
                               <input type="password" bind:value={provider.api_key} placeholder="sk-..." />
                            </label>
                            <button class="link-btn" onclick={() => useApiKey[provider.id] = false}>
                              Use Sign In instead
                            </button>
                         {:else}
                            <button class="link-btn" onclick={() => useApiKey[provider.id] = true}>
                              Use API Key instead
                            </button>
                         {/if}
                      </div>
                    {/if}
                  </div>
               {:else}
                 <label>
                   {provider.id === 'ollama-cloud' ? 'RunPod API Key' : 'API Key'}
                   <input type="password" bind:value={provider.api_key} placeholder={provider.id === 'ollama-cloud' ? 'RunPod API Key (from Settings → API Keys)' : 'sk-...'} />
                 </label>
               {/if}
             {:else if provider.id === 'ollama'}
               <!-- Ollama optional API key -->
               <label>
                 API Key <span class="optional-badge">(Optional - only for cloud endpoints)</span>
                 <input type="password" bind:value={provider.api_key} placeholder="Leave empty for local" />
               </label>
             {/if}

            <label>
              Model
              {#if (option?.canSignIn && (oauthStatus[provider.id] || (useApiKey[provider.id] && provider.api_key))) || (provider.id === 'ollama' && provider.api_url)}
                  <div class="model-select-container">
                    {#if fetchingModels[provider.id]}
                        <div class="loading">Loading models...</div>
                    {:else if modelFetchErrors[provider.id]}
                        <div class="error">
                          Error: {modelFetchErrors[provider.id]}
                          <button class="secondary small" onclick={() => fetchModels(provider.id)}>Retry</button>
                        </div>
                        <input type="text" bind:value={provider.model} placeholder={provider.id === 'ollama' ? 'llama2:latest' : 'gpt-4o'} />
                    {:else if fetchedModels[provider.id]?.length > 0}
                        <div class="select-wrapper">
                            <select bind:value={provider.model}>
                                <option value="" disabled>Select a model</option>
                                {#each fetchedModels[provider.id] as modelId}
                                    <option value={modelId}>{modelId}</option>
                                {/each}
                            </select>
                            <button class="secondary" title="Refresh Models" onclick={() => fetchModels(provider.id)}>
                                🔄
                            </button>
                        </div>
                    {:else}
                        <input type="text" bind:value={provider.model} placeholder={provider.id === 'ollama' ? 'llama2:latest' : 'gpt-4o'} />
                        <button class="secondary small" onclick={() => fetchModels(provider.id)}>Fetch Models</button>
                    {/if}
                  </div>
              {:else}
                  <input type="text" bind:value={provider.model} placeholder={provider.id === 'ollama' ? 'llama2:latest' : 'gpt-4o'} />
              {/if}
            </label>
            
            <label class="checkbox-label">
              <input type="checkbox" checked={!!provider.is_active} 
                     onchange={(e) => provider.is_active = (e.currentTarget as HTMLInputElement).checked ? 1 : 0} />
              <span>Active</span>
            </label>

            <div class="form-actions">
              <button class="primary" onclick={() => saveProvider(provider)}>Save Changes</button>
              <button class="ghost" onclick={() => editingProvider = null}>Cancel</button>
            </div>
          </div>
        {:else}
          <!-- Display mode -->
          <div class="provider-info">
            {#if provider.api_url}
              <div class="info-row">
                <span class="label">API URL:</span>
                <span class="value">{provider.api_url}</span>
              </div>
            {/if}
            {#if provider.api_key}
              <div class="info-row">
                <span class="label">API Key:</span>
                <span class="value">{'*'.repeat(20)}</span>
              </div>
            {/if}
            {#if option?.canSignIn && oauthStatus[provider.id]}
               <div class="info-row">
                 <span class="label">Auth:</span>
                 <span class="value success">✅ Signed In</span>
               </div>
            {/if}
            <div class="info-row">
              <span class="label">Model:</span>
              <span class="value">{provider.model || 'Not set'}</span>
            </div>
            <div class="info-row">
              <span class="label">Status:</span>
              <span class="badge" class:active={provider.is_active}>
                {provider.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if !showAddForm && providers.length > 0}
    <button class="add-btn" onclick={() => showAddForm = true}>
      + Add Another Provider
    </button>
  {/if}

  {#if showAddForm}
    <div class="add-form provider-item editing">
      <h4>Add New Provider</h4>
      
      <div class="edit-form">
        <label>
          Provider Type
          <select bind:value={newProviderId} onchange={handleAddSelect}>
            <option value="" disabled selected>Select a provider...</option>
            {#each getAvailableProviders() as opt}
              <option value={opt.id}>{opt.name}</option>
            {/each}
          </select>
        </label>

        {#if newProviderId}
          {@const newOption = PROVIDER_OPTIONS.find(p => p.id === newProviderId)}
          {#if newOption?.requiresUrl}
            <label>
              API URL
              <input type="text" bind:value={newProviderUrl} placeholder="https://api.example.com" />
            </label>
            {#if newProviderId === 'ollama'}
              <div class="url-presets">
                <span class="preset-label">Quick presets:</span>
                <button type="button" class="preset-btn" onclick={() => newProviderUrl = 'http://localhost:11434'}>
                  Local (localhost:11434)
                </button>
                <button type="button" class="preset-btn" onclick={() => newProviderUrl = 'https://ollama.com/api'}>
                  Cloud (ollama.com/api)
                </button>
              </div>
            {/if}
          {/if}

           {#if newOption?.requiresKey}
              {#if newOption.canSignIn}
                 <!-- Simple view for add form, detailed view in edit -->
                 <p class="hint">You can sign in after saving.</p>
                 <label>
                   API Key (Optional if using Auth)
                   <input type="password" bind:value={newProviderKey} placeholder="sk-..." />
                 </label>
              {:else}
                 <label>
                   {newProviderId === 'ollama-cloud' ? 'RunPod API Key' : 'API Key'}
                   <input type="password" bind:value={newProviderKey} placeholder={newProviderId === 'ollama-cloud' ? 'RunPod API Key (from Settings → API Keys)' : 'sk-...'} />
                 </label>
              {/if}
           {:else if newProviderId === 'ollama'}
             <!-- Ollama optional API key -->
             <label>
               API Key <span class="optional-badge">(Optional - only for cloud endpoints)</span>
               <input type="password" bind:value={newProviderKey} placeholder="Leave empty for local" />
             </label>
           {/if}

          <label>
            Model
            <input type="text" bind:value={newProviderModel} placeholder={newProviderId === 'ollama' ? 'llama2:latest' : 'gpt-4o'} />
            <p class="hint">Save the provider first, then edit it to fetch available models.</p>
          </label>

          <div class="form-actions">
            <button class="primary" onclick={addNewProvider}>Add Provider</button>
            <button class="ghost" onclick={() => { showAddForm = false; resetAddForm(); }}>Cancel</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .empty-state {
    text-align: center;
    padding: var(--spacing-12);
    background: var(--color-bg-main);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border);
    color: var(--color-text-secondary);
  }

  .providers-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .provider-item {
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-4);
    transition: border-color var(--transition-fast);
  }
  
  .provider-item:hover, .provider-item.editing {
    border-color: var(--color-border-hover);
    box-shadow: var(--shadow-sm);
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }
  
  .provider-header h4 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
  }

  button.small {
    padding: 0.25rem 0.5rem;
    font-size: var(--font-size-xs);
  }

  .provider-info {
    display: grid;
    gap: var(--spacing-2);
  }

  .info-row {
    display: flex;
    gap: var(--spacing-4);
    align-items: center;
    font-size: var(--font-size-sm);
  }

  .info-row .label {
    font-weight: 500;
    color: var(--color-text-secondary);
    min-width: 80px;
  }

  .info-row .value {
    color: var(--color-text-primary);
    font-family: var(--font-family-mono);
  }

  .badge {
    padding: 0.125rem 0.625rem;
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    background: var(--color-bg-card-hover);
    color: var(--color-text-secondary);
    font-weight: 500;
    border: 1px solid var(--color-border);
  }

  .badge.active {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-success);
    border-color: rgba(16, 185, 129, 0.2);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    margin-top: var(--spacing-2);
  }

  .checkbox-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-2);
    cursor: pointer;
    margin-bottom: 0;
  }
  
  .checkbox-label input {
    width: auto;
    margin: 0;
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-4);
  }

  .add-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-4);
    background: transparent;
    border: 2px dashed var(--color-border);
    color: var(--color-text-muted);
    margin-top: var(--spacing-4);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .add-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(99, 102, 241, 0.05);
  }

  /* OAuth Specifics */
  .oauth-section {
    background: var(--color-bg-card-hover);
    padding: var(--spacing-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .oauth-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    color: var(--color-text-primary);
    font-weight: 500;
  }
  
  .oauth-status.success {
    color: var(--color-success);
  }

  .oauth-actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .oauth-btn {
    width: 100%;
    background-color: #24292e;
    color: white;
    border: none;
  }
  
  .oauth-btn:hover {
    background-color: #1b1f23;
  }

  .divider {
    display: flex;
    align-items: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
    margin: var(--spacing-2) 0;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--color-border);
  }

  .divider span {
    padding: 0 var(--spacing-2);
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--color-primary);
    text-decoration: underline;
    padding: 0;
    font-size: var(--font-size-xs);
    cursor: pointer;
    text-align: left;
  }
  
  .link-btn:hover {
    color: var(--color-primary-hover);
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin: 0 0 var(--spacing-2) 0;
  }

  .model-select-container {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .select-wrapper {
    display: flex;
    gap: var(--spacing-2);
  }

  .loading {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .error {
    color: var(--color-error);
    font-size: var(--font-size-sm);
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-error);
    padding: var(--spacing-2);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  /* Device Flow */
  .device-flow-container {
    background: var(--color-bg-main);
    padding: var(--spacing-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .code-display {
    background: #000;
    color: #fff;
    padding: var(--spacing-2);
    border-radius: var(--radius-sm);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-lg);
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-2);
  }

  .polling-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .spinner {
    animation: spin 2s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .url-presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    margin-top: var(--spacing-2);
    margin-bottom: var(--spacing-4);
    align-items: center;
  }

  .preset-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .preset-btn {
    font-size: var(--font-size-xs);
    padding: 0.125rem 0.5rem;
    background: var(--color-bg-card-hover);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .preset-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .paste-input-row {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
  }

  .paste-input-row input {
    flex: 1;
  }
</style>
