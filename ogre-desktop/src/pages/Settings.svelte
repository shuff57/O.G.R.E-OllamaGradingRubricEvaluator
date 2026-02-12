<script lang="ts">
  import { onMount } from 'svelte';
  import { getProviderConfigs, saveProviderConfig, deleteProviderConfig, getSetting, setSetting, getOAuthToken } from '../lib/db';
  import type { ProviderConfig } from '../lib/db';
  import { 
    startGitHubDeviceFlow, 
    startChatGPTDeviceFlow, 
    startClaudeCodePasteFlow, 
    startGoogleDeviceFlow, 
    signOut, 
    fetchAvailableModels 
  } from '../lib/oauth';
  import type { DeviceFlowResult, CodePasteFlowResult } from '../lib/oauth';

  let providers: ProviderConfig[] = [];
  let editingProvider: string | null = null;
  let showAddForm = false;
  let visibleColumns: string[] = [];

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
  let claudeFlow: CodePasteFlowResult | null = null;
  let claudeCodeInput = '';
  let authLoading: Record<string, boolean> = {};
  let authErrors: Record<string, string> = {};

  // Available providers
  const PROVIDER_OPTIONS = [
    { id: 'ollama-cloud', name: 'Ollama Cloud', requiresUrl: true, requiresKey: true, defaultUrl: '', canSignIn: false },
    { id: 'ollama-local', name: 'Ollama Local', requiresUrl: true, requiresKey: false, defaultUrl: 'http://localhost:11434', canSignIn: false },
    { id: 'openai', name: 'OpenAI', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
    { id: 'anthropic', name: 'Anthropic (Claude)', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
    { id: 'google-gemini', name: 'Google Gemini', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
    { id: 'github-models', name: 'GitHub Models', requiresUrl: false, requiresKey: true, defaultUrl: '', canSignIn: true },
  ];

  // Available columns for history table
  const COLUMN_OPTIONS = [
    { id: 'timestamp', label: 'Timestamp' },
    { id: 'provider', label: 'Provider' },
    { id: 'model', label: 'Model' },
    { id: 'studentCount', label: 'Students' },
    { id: 'meanScore', label: 'Mean Score' },
    { id: 'minScore', label: 'Min Score' },
    { id: 'maxScore', label: 'Max Score' },
    { id: 'medianScore', label: 'Median Score' },
    { id: 'pageUrl', label: 'Page URL' },
  ];

  onMount(async () => {
    console.log('[Settings] onMount: Component mounted, starting initialization');
    await loadProviders();
    await loadColumnVisibility();
    
    await checkOAuthStatus();
  });

  async function loadProviders() {
    providers = await getProviderConfigs();
  }

  async function loadColumnVisibility() {
    const columnsJson = await getSetting('history_visible_columns');
    visibleColumns = columnsJson ? JSON.parse(columnsJson) : ['timestamp', 'provider', 'model', 'studentCount', 'meanScore', 'pageUrl'];
  }

  function getProviderKey(id: string): "github" | "openai" | "anthropic" | "google" | null {
    if (id === 'github-models') return 'github';
    if (id === 'openai') return 'openai';
    if (id === 'anthropic') return 'anthropic';
    if (id === 'google-gemini') return 'google';
    return null;
  }

  async function checkOAuthStatus() {
    console.log('[Settings] checkOAuthStatus: Starting OAuth status check');
    for (const opt of PROVIDER_OPTIONS) {
      if (opt.canSignIn) {
        const providerKey = getProviderKey(opt.id);
        console.log(`[Settings] Checking provider: ${opt.id}, mapped key: ${providerKey}`);
        if (!providerKey) continue;
        
        const token = await getOAuthToken(providerKey);
        console.log(`[Settings] getOAuthToken('${providerKey}') returned:`, token ? 'TOKEN FOUND' : 'NULL');
        if (token) {
          console.log(`[Settings] Token details - expires_at: ${token.expires_at}, created_at: ${token.created_at}`);
        }
        oauthStatus[opt.id] = !!token;
        if (token) {
           // If we have a token, fetch models automatically
           fetchModels(opt.id);
        }
      }
    }
    oauthStatus = { ...oauthStatus }; // Trigger reactivity after all checks
    console.log('[Settings] checkOAuthStatus: Complete. Status:', oauthStatus);
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
        const flow = await startClaudeCodePasteFlow();
        claudeFlow = flow;
        claudeCodeInput = '';
      }
    } catch (error) {
      console.error('Auth start failed:', error);
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
      console.log(`[Settings] Poll result for ${providerId}:`, result);
      if (result.success) {
        console.log(`[Settings] Setting oauthStatus[${providerId}] = true`);
        oauthStatus[providerId] = true;
        oauthStatus = { ...oauthStatus }; // Trigger reactivity
        console.log(`[Settings] oauthStatus after update:`, oauthStatus);
        fetchModels(providerId);
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
      console.error(`[Settings] Poll error for ${providerId}:`, error);
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

  async function submitClaudeCode() {
    if (!claudeFlow || !claudeCodeInput) return;
    
    authLoading['anthropic'] = true;
    authErrors['anthropic'] = '';
    authLoading = { ...authLoading }; // Trigger reactivity
    authErrors = { ...authErrors }; // Trigger reactivity
    
    try {
      const result = await claudeFlow.exchangeCode(claudeCodeInput);
      if (result.success) {
        oauthStatus['anthropic'] = true;
        oauthStatus = { ...oauthStatus }; // Trigger reactivity
        fetchModels('anthropic');
        claudeFlow = null;
        claudeCodeInput = '';
      } else {
        authErrors['anthropic'] = result.error || 'Code exchange failed';
        authErrors = { ...authErrors }; // Trigger reactivity
      }
    } catch (error) {
      authErrors['anthropic'] = error instanceof Error ? error.message : String(error);
      authErrors = { ...authErrors }; // Trigger reactivity
    } finally {
      authLoading['anthropic'] = false;
      authLoading = { ...authLoading }; // Trigger reactivity
    }
  }

  function cancelAuth(providerId: string) {
    if (providerId === 'anthropic' && claudeFlow) {
      claudeFlow.cancel();
      claudeFlow = null;
    } else if (deviceFlows[providerId]) {
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
      }
    } catch (error) {
       console.error('Sign out failed:', error);
       oauthStatus[providerId] = false;
       oauthStatus = { ...oauthStatus }; // Trigger reactivity
    }
  }

  async function fetchModels(providerId: string) {
    fetchingModels[providerId] = true;
    modelFetchErrors[providerId] = '';
    try {
      const providerKey = getProviderKey(providerId);
      if (!providerKey) throw new Error('Invalid provider for model fetching');
      
      const models = await fetchAvailableModels(providerKey);
      fetchedModels[providerId] = models;
      
      // If editing this provider, update its model if empty
      const provider = providers.find(p => p.id === providerId);
      if (provider && !provider.model && models.length > 0) {
        provider.model = models[0];
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      modelFetchErrors[providerId] = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      fetchingModels[providerId] = false;
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
  }

  async function deleteProvider(id: string) {
    if (!confirm(`Delete provider "${id}"? This cannot be undone.`)) return;
    await deleteProviderConfig(id);
    await loadProviders();
  }

  async function testConnection(provider: ProviderConfig) {
    const option = PROVIDER_OPTIONS.find(p => p.id === provider.id);
    
    // Basic validation
    if (option?.requiresKey && !provider.api_key && !oauthStatus[provider.id]) {
      alert('API Key is required for this provider (or sign in via OAuth)');
      return;
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

  async function toggleColumn(columnId: string) {
    if (visibleColumns.includes(columnId)) {
      visibleColumns = visibleColumns.filter(c => c !== columnId);
    } else {
      visibleColumns = [...visibleColumns, columnId];
    }
    
    await setSetting('history_visible_columns', JSON.stringify(visibleColumns));
  }

  function getAvailableProviders() {
    return PROVIDER_OPTIONS.filter(opt => !providers.find(p => p.id === opt.id));
  }

  function handleAddSelect() {
    const option = PROVIDER_OPTIONS.find(p => p.id === newProviderId);
    if (option) {
      newProviderUrl = option.defaultUrl;
      newProviderKey = '';
      newProviderModel = '';
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

<div class="settings-page">
  <header>
    <h2>Settings</h2>
  </header>

  <!-- Provider Configuration Section -->
  <section class="section">
    <h3>AI Provider Configuration</h3>
    
    {#if providers.length === 0 && !showAddForm}
      <p class="empty-state">No providers configured. Click "Add Provider" to get started.</p>
    {/if}

    {#each providers as provider}
      {@const option = PROVIDER_OPTIONS.find(p => p.id === provider.id)}
      <div class="provider-card">
        <div class="provider-header">
          <h4>{option?.name || provider.id}</h4>
          {#if editingProvider !== provider.id}
            <div class="actions">
              <button on:click={() => testConnection(provider)}>Test Connection</button>
              <button on:click={() => editingProvider = provider.id}>Edit</button>
              <button class="danger" on:click={() => deleteProvider(provider.id)}>Delete</button>
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
            {/if}
            
            {#if option?.requiresKey}
              {#if option.canSignIn}
                 <div class="oauth-section">
                   {#if oauthStatus[provider.id] && !useApiKey[provider.id]}
                     <!-- SIGNED IN STATE -->
                     <div class="oauth-status success">
                        <span class="icon">✅</span> Signed in
                        <button class="small" on:click={() => handleSignOut(provider.id)}>Sign out</button>
                     </div>
                   {:else if deviceFlows[provider.id]}
                     <!-- DEVICE FLOW ACTIVE -->
                     <div class="device-flow-container">
                       <p class="instructions">1. Go to: <a href={deviceFlows[provider.id].verificationUrl} target="_blank">{deviceFlows[provider.id].verificationUrl}</a></p>
                       <p class="instructions">2. Enter code:</p>
                       <div class="code-display">
                          {deviceFlows[provider.id].userCode}
                          <button class="icon-btn small" title="Copy" on:click={() => navigator.clipboard.writeText(deviceFlows[provider.id].userCode)}>📋</button>
                       </div>
                       <div class="polling-indicator">
                          <span class="spinner">⏳</span> Waiting for authorization...
                       </div>
                       <button class="cancel-btn" on:click={() => cancelAuth(provider.id)}>Cancel</button>
                     </div>
                   {:else if provider.id === 'anthropic' && claudeFlow}
                     <!-- CLAUDE CODE PASTE ACTIVE -->
                     <div class="device-flow-container">
                       <p class="instructions">Authentication page opened in browser.</p>
                       <p class="instructions">Please copy the code from Claude and paste it here:</p>
                       <div class="input-row">
                          <input type="text" bind:value={claudeCodeInput} placeholder="Paste code here (sk-ant-...)" />
                          <button class="primary small" disabled={!claudeCodeInput || authLoading['anthropic']} on:click={submitClaudeCode}>
                            {#if authLoading['anthropic']}...{:else}Submit Code{/if}
                          </button>
                       </div>
                       <button class="cancel-btn" on:click={() => cancelAuth(provider.id)}>Cancel</button>
                     </div>
                   {:else}
                     <!-- NOT SIGNED IN / ACTIONS -->
                     <div class="oauth-actions">
                        {#if authErrors[provider.id]}
                          <div class="error-banner">{authErrors[provider.id]}</div>
                        {/if}

                        {#if !useApiKey[provider.id]}
                           <button class="oauth-btn" disabled={authLoading[provider.id]} on:click={() => startAuth(provider.id)}>
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
                           <button class="link-btn" on:click={() => useApiKey[provider.id] = false}>
                             Use Sign In instead
                           </button>
                        {:else}
                           <button class="link-btn" on:click={() => useApiKey[provider.id] = true}>
                             Use API Key instead
                           </button>
                        {/if}
                     </div>
                   {/if}
                 </div>
              {:else}
                <label>
                  API Key
                  <input type="password" bind:value={provider.api_key} placeholder="sk-..." />
                </label>
              {/if}
            {/if}

            <label>
              Model
              {#if option?.canSignIn && (oauthStatus[provider.id] || (useApiKey[provider.id] && provider.api_key))}
                  <div class="model-select-container">
                    {#if fetchingModels[provider.id]}
                        <div class="loading">Loading models...</div>
                    {:else if modelFetchErrors[provider.id]}
                        <div class="error">
                          Error: {modelFetchErrors[provider.id]}
                          <button class="small" on:click={() => fetchModels(provider.id)}>Retry</button>
                        </div>
                        <input type="text" bind:value={provider.model} placeholder="gpt-4o" />
                    {:else if fetchedModels[provider.id]?.length > 0}
                        <div class="select-wrapper">
                            <select bind:value={provider.model}>
                                <option value="" disabled>Select a model</option>
                                {#each fetchedModels[provider.id] as modelId}
                                    <option value={modelId}>{modelId}</option>
                                {/each}
                            </select>
                            <button class="icon-btn" title="Refresh Models" on:click={() => fetchModels(provider.id)}>
                                🔄
                            </button>
                        </div>
                    {:else}
                        <input type="text" bind:value={provider.model} placeholder="gpt-4o" />
                        <button class="small" on:click={() => fetchModels(provider.id)}>Fetch Models</button>
                    {/if}
                  </div>
              {:else}
                  <input type="text" bind:value={provider.model} placeholder="gpt-4o" />
              {/if}
            </label>

            <label class="checkbox-label">
              <input type="checkbox" checked={!!provider.is_active} 
                     on:change={(e) => provider.is_active = e.currentTarget.checked ? 1 : 0} />
              Active
            </label>

            <div class="form-actions">
              <button class="primary" on:click={() => saveProvider(provider)}>Save</button>
              <button on:click={() => editingProvider = null}>Cancel</button>
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
              <span class="value badge" class:active={provider.is_active}>
                {provider.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    {#if !showAddForm}
      <button class="add-btn" on:click={() => showAddForm = true}>
        Add Provider
      </button>
    {/if}

    {#if showAddForm}
      <div class="add-form provider-card">
        <h4>Add New Provider</h4>
        
        <div class="edit-form">
          <label>
            Provider Type
            <select bind:value={newProviderId} on:change={handleAddSelect}>
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
                    API Key
                    <input type="password" bind:value={newProviderKey} placeholder="sk-..." />
                  </label>
               {/if}
            {/if}

            <label>
              Model
              <input type="text" bind:value={newProviderModel} placeholder="gpt-4o" />
            </label>

            <div class="form-actions">
              <button class="primary" on:click={addNewProvider}>Add Provider</button>
              <button on:click={() => { showAddForm = false; resetAddForm(); }}>Cancel</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <!-- Column Visibility Section -->
  <section class="section">
    <h3>History Table Columns</h3>
    <p>Choose which columns to display in the grading history table:</p>
    
    <div class="column-toggles">
      {#each COLUMN_OPTIONS as column}
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={visibleColumns.includes(column.id)}
            on:change={() => toggleColumn(column.id)}
          />
          {column.label}
        </label>
      {/each}
    </div>
  </section>
</div>

<style>
  .settings-page {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 2rem;
  }

  h2 {
    font-size: 2rem;
    color: #333;
    margin: 0;
  }

  .section {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  .section h3 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    color: #333;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 0.5rem;
  }

  .section p {
    color: #666;
    margin-bottom: 1rem;
  }

  .provider-card {
    background: #f9f9f9;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    transition: box-shadow 0.2s;
  }
  
  .provider-card:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .provider-header h4 {
    margin: 0;
    color: #333;
    font-size: 1.1rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .provider-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-row {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .info-row .label {
    font-weight: 600;
    color: #666;
    min-width: 100px;
  }

  .info-row .value {
    color: #333;
    font-family: 'Consolas', monospace;
  }

  .badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    background: #e0e0e0;
    color: #666;
    font-family: sans-serif;
    font-weight: 500;
  }

  .badge.active {
    background: #e6fffa;
    color: #00796b;
    border: 1px solid #b2dfdb;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: white;
    padding: 1rem;
    border-radius: 4px;
    border: 1px solid #eee;
  }

  .edit-form label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-weight: 500;
    color: #555;
    font-size: 0.9rem;
  }
  
  .edit-form label.checkbox-label {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .edit-form input[type="text"],
  .edit-form input[type="password"],
  .edit-form select {
    padding: 0.6rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    width: 100%;
    box-sizing: border-box;
  }
  
  .edit-form input:focus,
  .edit-form select:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0,122,204,0.1);
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  button:hover {
    background: #f5f5f5;
    border-color: #bbb;
  }

  button.primary {
    background: #007acc;
    color: white;
    border-color: #007acc;
  }

  button.primary:hover {
    background: #006bb3;
    border-color: #006bb3;
  }

  button.danger {
    background: white;
    color: #d32f2f;
    border-color: #d32f2f;
  }

  button.danger:hover {
    background: #ffebee;
  }

  .add-btn {
    display: block;
    width: 100%;
    padding: 1rem;
    background: #f8f9fa;
    border: 2px dashed #ddd;
    color: #666;
    margin-top: 1rem;
  }

  .add-btn:hover {
    border-color: #007acc;
    color: #007acc;
    background: #f0f7ff;
  }

  .column-toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.95rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
  }
  
  .checkbox-label:hover {
    background: #f5f5f5;
  }

  .checkbox-label input {
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  .empty-state {
    color: #999;
    font-style: italic;
    padding: 2rem;
    text-align: center;
    background: #f9f9f9;
    border-radius: 6px;
  }

  /* OAuth specific styles */
  .oauth-section {
    margin: 0.5rem 0;
    padding: 0.5rem;
    border: 1px solid #f0f0f0;
    border-radius: 4px;
    background: #fafafa;
  }

  .oauth-status {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-weight: 600;
  }

  .oauth-status.success {
    color: #00796b;
  }

  .oauth-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .oauth-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.75rem;
    background: #24292e;
    color: white;
    border: none;
    font-weight: 600;
  }

  .oauth-btn:hover {
    background: #1b1f23;
  }

  .divider {
    display: flex;
    align-items: center;
    text-align: center;
    color: #999;
    font-size: 0.8rem;
    margin: 0.5rem 0;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid #eee;
  }

  .divider span {
    padding: 0 0.5rem;
  }

  .link-btn {
    background: none;
    border: none;
    color: #007acc;
    text-decoration: underline;
    padding: 0;
    font-size: 0.85rem;
    text-align: left;
    width: auto;
  }

  .link-btn:hover {
    background: none;
    color: #005a9e;
  }

  .hint {
    font-size: 0.85rem;
    color: #888;
    margin: 0;
  }

  .model-select-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .select-wrapper {
    display: flex;
    gap: 0.5rem;
  }

  .icon-btn {
    padding: 0.6rem;
    width: auto;
    flex-shrink: 0;
  }

  .loading {
    color: #666;
    font-style: italic;
    font-size: 0.9rem;
  }

  .error {
    color: #d32f2f;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  button.small {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  .value.success {
    color: #00796b;
    font-weight: 600;
  }
  .oauth-btn:disabled {
    background: #555;
    cursor: wait;
  }
  
  .error-banner {
    color: #d32f2f;
    background: #ffebee;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.9rem;
    border: 1px solid #ffcdd2;
  }
  
  /* Device Flow UI */
  .device-flow-container {
    background: #fff;
    border: 1px solid #e0e0e0;
    padding: 1rem;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  
  .instructions {
    margin: 0;
    font-size: 0.95rem;
    color: #444;
  }
  
  .code-display {
    background: #24292e;
    color: #fff;
    padding: 0.75rem;
    border-radius: 4px;
    font-family: 'Consolas', monospace;
    font-size: 1.2rem;
    letter-spacing: 1px;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    position: relative;
  }
  
  .code-display .icon-btn {
    position: absolute;
    right: 0.5rem;
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    padding: 0.3rem;
  }
  
  .code-display .icon-btn:hover {
    background: rgba(255,255,255,0.2);
  }
  
  .polling-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #666;
    font-size: 0.9rem;
    font-style: italic;
  }
  
  .spinner {
    animation: spin 2s linear infinite;
    display: inline-block;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .cancel-btn {
    align-self: center;
    color: #666;
    text-decoration: underline;
    background: none;
    border: none;
    font-size: 0.9rem;
  }
  
  .input-row {
    display: flex;
    gap: 0.5rem;
  }
</style>
