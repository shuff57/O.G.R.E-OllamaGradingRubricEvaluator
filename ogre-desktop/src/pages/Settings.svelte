<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    getProviderConfigs, 
    saveProviderConfig, 
    deleteProviderConfig, 
    getSetting, 
    setSetting, 
    getOAuthToken,
    getSiteCredentials,
    saveSiteCredential,
    deleteSiteCredential
  } from '../lib/db';
  import type { ProviderConfig, SiteCredential } from '../lib/db';
  import { GRADING_SITE_PRESETS } from '../lib/browser';
  import { 
    startGitHubDeviceFlow, 
    startChatGPTDeviceFlow, 
    startClaudeOAuthFlow, 
    startGoogleDeviceFlow, 
    signOut, 
    fetchAvailableModels 
  } from '../lib/oauth';
  import type { DeviceFlowResult } from '../lib/oauth';
  import { pushProvidersToServer } from '../lib/provider-sync';


  let providers: ProviderConfig[] = [];
  let editingProvider: string | null = null;
  let showAddForm = false;
  let visibleColumns: string[] = [];

  // Site Credentials State
  let credentials: SiteCredential[] = [];
  let editingCredentialId: number | null = null;
  let showAddCredentialForm = false;
  let showPassword = false;
  let credentialForm = {
    site_name: '',
    url_pattern: '',
    username: '',
    password: '',
    notes: ''
  };

  // New Provider State
  let newProviderId = '';
  let newProviderUrl = '';
  let newProviderKey = '';
  let newProviderModel = '';

  // Theme State
  let currentTheme = 'dark';

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
    await loadTheme();
    
    await checkOAuthStatus();
    await loadCredentials();
  });

  async function loadCredentials() {
    credentials = await getSiteCredentials();
  }

  async function saveCredential() {
    if (!credentialForm.site_name || !credentialForm.url_pattern || !credentialForm.username || !credentialForm.password) {
      alert('Please fill in all required fields (Site Name, URL Pattern, Username, Password)');
      return;
    }

    try {
      await saveSiteCredential({
        id: editingCredentialId || undefined,
        site_name: credentialForm.site_name,
        url_pattern: credentialForm.url_pattern,
        username: credentialForm.username,
        password: credentialForm.password,
        notes: credentialForm.notes
      });
      
      await loadCredentials();
      resetCredentialForm();
    } catch (error) {
      console.error('Failed to save credential:', error);
      alert('Failed to save credential: ' + error);
    }
  }

  async function deleteCredential(id: number, name: string) {
    if (!confirm(`Delete credentials for "${name}"? This cannot be undone.`)) return;
    try {
      await deleteSiteCredential(id);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to delete credential:', error);
      alert('Failed to delete credential: ' + error);
    }
  }

  function editCredential(cred: SiteCredential) {
    editingCredentialId = cred.id;
    credentialForm = {
      site_name: cred.site_name,
      url_pattern: cred.url_pattern,
      username: cred.username,
      password: cred.password,
      notes: cred.notes || ''
    };
    showAddCredentialForm = true;
  }

  function resetCredentialForm() {
    editingCredentialId = null;
    credentialForm = {
      site_name: '',
      url_pattern: '',
      username: '',
      password: '',
      notes: ''
    };
    showAddCredentialForm = false;
    showPassword = false;
  }

  async function loadTheme() {
    const theme = await getSetting('theme');
    currentTheme = theme || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
  }

  async function setTheme(theme: string) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    await setSetting('theme', theme);
  }

  async function loadProviders() {
    providers = await getProviderConfigs();
  }

  async function loadColumnVisibility() {
    const columnsJson = await getSetting('history_visible_columns');
    visibleColumns = columnsJson ? JSON.parse(columnsJson) : ['timestamp', 'provider', 'model', 'studentCount', 'meanScore', 'pageUrl'];
  }

  function getProviderKey(id: string): "github" | "openai" | "anthropic" | "google" | "ollama" | null {
    if (id === 'github-models') return 'github';
    if (id === 'openai') return 'openai';
    if (id === 'anthropic') return 'anthropic';
    if (id === 'google-gemini') return 'google';
    if (id === 'ollama') return 'ollama';
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
        const flow = await startClaudeOAuthFlow();
        handleDeviceFlow(providerId, flow);
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
       console.error('Sign out failed:', error);
       oauthStatus[providerId] = false;
       oauthStatus = { ...oauthStatus }; // Trigger reactivity
    }
  }

  async function fetchModels(providerId: string) {
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
      console.error('Failed to fetch models:', error);
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

<div>
  <header class="mb-6">
    <h1>Settings</h1>
    <p class="text-muted">Configure AI providers and application preferences</p>
  </header>

  <!-- Appearance Section -->
  <section class="card mb-6">
    <h3>Appearance</h3>
    <p class="mb-6">Customize the look and feel of the application.</p>
    
    <div class="theme-selector">
      <button 
        class="theme-btn {currentTheme === 'dark' ? 'active' : ''}" 
        on:click={() => setTheme('dark')}
      >
        <span class="icon">🌙</span>
        <div class="theme-info">
          <span class="name">Dark Mode</span>
          <span class="desc">Technical & Precise</span>
        </div>
        {#if currentTheme === 'dark'}
          <span class="check">✓</span>
        {/if}
      </button>

      <button 
        class="theme-btn {currentTheme === 'light' ? 'active' : ''}" 
        on:click={() => setTheme('light')}
      >
        <span class="icon">☀️</span>
        <div class="theme-info">
          <span class="name">Light Mode</span>
          <span class="desc">Playful & Friendly</span>
        </div>
        {#if currentTheme === 'light'}
          <span class="check">✓</span>
        {/if}
      </button>
    </div>
  </section>

  <!-- Provider Configuration Section -->
  <section class="card mb-6">
    <h3>AI Provider Configuration</h3>
    <p class="mb-6">Manage connections to local or cloud-based AI providers.</p>
    
    {#if providers.length === 0 && !showAddForm}
      <div class="empty-state">
        <p>No providers configured yet.</p>
        <button class="primary" on:click={() => showAddForm = true}>Add Your First Provider</button>
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
                <button class="secondary small" on:click={() => testConnection(provider)}>Test</button>
                <button class="secondary small" on:click={() => editingProvider = provider.id}>Edit</button>
                <button class="danger small" on:click={() => deleteProvider(provider.id)}>Delete</button>
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
                    <button type="button" class="preset-btn" on:click={() => provider.api_url = 'http://localhost:11434'}>
                      Local (localhost:11434)
                    </button>
                    <button type="button" class="preset-btn" on:click={() => provider.api_url = 'https://ollama.com/api'}>
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
                          <button class="ghost small" on:click={() => handleSignOut(provider.id)}>Sign out</button>
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
               on:input={(e) => { _anthropicPasteBuffer = e.currentTarget.value; }}
             />
             <button class="btn primary small" on:click={() => {
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
              <button class="ghost small" title="Copy" on:click={() => navigator.clipboard.writeText(deviceFlows[provider.id].userCode)}>📋</button>
           </div>
         {/if}
         <div class="polling-indicator">
            <span class="spinner">⏳</span> Waiting for authorization...
         </div>
         <button class="ghost small" on:click={() => cancelAuth(provider.id)}>Cancel</button>
       </div>
                     {:else}
                       <!-- NOT SIGNED IN / ACTIONS -->
                       <div class="oauth-actions">
                          {#if authErrors[provider.id]}
                            <div class="error-banner">{authErrors[provider.id]}</div>
                          {/if}

                          {#if !useApiKey[provider.id]}
                             <button class="btn oauth-btn" disabled={authLoading[provider.id]} on:click={() => startAuth(provider.id)}>
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
                            <button class="secondary small" on:click={() => fetchModels(provider.id)}>Retry</button>
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
                              <button class="secondary" title="Refresh Models" on:click={() => fetchModels(provider.id)}>
                                  🔄
                              </button>
                          </div>
                      {:else}
                          <input type="text" bind:value={provider.model} placeholder={provider.id === 'ollama' ? 'llama2:latest' : 'gpt-4o'} />
                          <button class="secondary small" on:click={() => fetchModels(provider.id)}>Fetch Models</button>
                      {/if}
                    </div>
                {:else}
                    <input type="text" bind:value={provider.model} placeholder={provider.id === 'ollama' ? 'llama2:latest' : 'gpt-4o'} />
                {/if}
              </label>

              <label class="checkbox-label">
                <input type="checkbox" checked={!!provider.is_active} 
                       on:change={(e) => provider.is_active = e.currentTarget.checked ? 1 : 0} />
                <span>Active</span>
              </label>

              <div class="form-actions">
                <button class="primary" on:click={() => saveProvider(provider)}>Save Changes</button>
                <button class="ghost" on:click={() => editingProvider = null}>Cancel</button>
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
      <button class="add-btn" on:click={() => showAddForm = true}>
        + Add Another Provider
      </button>
    {/if}

    {#if showAddForm}
      <div class="add-form provider-item editing">
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
              {#if newProviderId === 'ollama'}
                <div class="url-presets">
                  <span class="preset-label">Quick presets:</span>
                  <button type="button" class="preset-btn" on:click={() => newProviderUrl = 'http://localhost:11434'}>
                    Local (localhost:11434)
                  </button>
                  <button type="button" class="preset-btn" on:click={() => newProviderUrl = 'https://ollama.com/api'}>
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
                    API Key
                    <input type="password" bind:value={newProviderKey} placeholder="sk-..." />
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
              <button class="primary" on:click={addNewProvider}>Add Provider</button>
              <button class="ghost" on:click={() => { showAddForm = false; resetAddForm(); }}>Cancel</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <!-- Site Credentials Section -->
  <section class="card mb-6">
    <div class="header-with-action">
      <h3>Site Credentials</h3>
      {#if !showAddCredentialForm}
        <button class="primary small" on:click={() => { resetCredentialForm(); showAddCredentialForm = true; }}>
          + Add Credential
        </button>
      {/if}
    </div>
    <p class="mb-6">Manage login credentials for grading sites. Credentials are stored locally and sent only to the matching site.</p>
    
    {#if showAddCredentialForm}
      <div class="add-form provider-item editing mb-4">
        <h4>{editingCredentialId ? 'Edit Credential' : 'Add New Credential'}</h4>
        
        <div class="edit-form">
          <label>
            Site Name
            <input type="text" bind:value={credentialForm.site_name} placeholder="e.g. MyOpenMath" />
          </label>

          <label>
            URL Pattern
            <input type="text" bind:value={credentialForm.url_pattern} placeholder="e.g. https://www.myopenmath.com/%" />
            <p class="hint">Use % as a wildcard. Example: https://canvas.instructure.com/% matches any Canvas page.</p>
            
            <div class="url-presets">
              <span class="preset-label">Presets:</span>
              {#each GRADING_SITE_PRESETS as preset}
                <button type="button" class="preset-btn" on:click={() => {
                  credentialForm.site_name = preset.name;
                  credentialForm.url_pattern = preset.url + '%';
                }}>
                  {preset.name}
                </button>
              {/each}
            </div>
          </label>

          <label>
            Username
            <input type="text" bind:value={credentialForm.username} placeholder="Username or Email" />
          </label>

          <label>
            Password
            <div class="password-input-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                bind:value={credentialForm.password} 
                placeholder="Password" 
              />
              <button class="toggle-password" type="button" on:click={() => showPassword = !showPassword}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          <label>
            Notes (Optional)
            <textarea bind:value={credentialForm.notes} rows="2" placeholder="Additional notes..."></textarea>
          </label>

          <div class="form-actions">
            <button class="primary" on:click={saveCredential}>Save Credential</button>
            <button class="ghost" on:click={resetCredentialForm}>Cancel</button>
          </div>
        </div>
      </div>
    {/if}

    {#if credentials.length === 0 && !showAddCredentialForm}
      <div class="empty-state">
        <p>No credentials saved yet.</p>
      </div>
    {:else if credentials.length > 0 && !showAddCredentialForm}
      <div class="providers-list">
        {#each credentials as cred}
          <div class="provider-item">
            <div class="provider-header">
              <h4>{cred.site_name}</h4>
              <div class="actions">
                <button class="secondary small" on:click={() => editCredential(cred)}>Edit</button>
                <button class="danger small" on:click={() => deleteCredential(cred.id, cred.site_name)}>Delete</button>
              </div>
            </div>
            
            <div class="provider-info">
              <div class="info-row">
                <span class="label">URL Pattern:</span>
                <span class="value">{cred.url_pattern}</span>
              </div>
              <div class="info-row">
                <span class="label">Username:</span>
                <span class="value">{cred.username}</span>
              </div>
              <div class="info-row">
                <span class="label">Password:</span>
                <span class="value">********</span>
              </div>
              {#if cred.notes}
                <div class="info-row">
                  <span class="label">Notes:</span>
                  <span class="value text-muted">{cred.notes}</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>



  <!-- Column Visibility Section -->
  <section class="card">
    <h3>History Table Columns</h3>
    <p class="mb-4">Choose which columns to display in the grading history table:</p>
    
    <div class="column-toggles">
      {#each COLUMN_OPTIONS as column}
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={visibleColumns.includes(column.id)}
            on:change={() => toggleColumn(column.id)}
          />
          <span>{column.label}</span>
        </label>
      {/each}
    </div>
  </section>
</div>

<style>
  /* Local overrides / specific components not in global app.css */

  .theme-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-4);
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    background: var(--color-bg-main);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    position: relative;
    overflow: hidden;
  }

  .theme-btn:hover {
    border-color: var(--color-border-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .theme-btn.active {
    border-color: var(--color-primary);
    background: var(--color-bg-card-hover);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .theme-btn .icon {
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: var(--color-bg-sidebar);
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
  }

  .theme-btn.active .icon {
    background: var(--color-primary-bg);
    border-color: var(--color-primary);
  }

  .theme-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .theme-info .name {
    font-weight: 700;
    color: var(--color-text-primary);
    font-size: 1rem;
  }

  .theme-info .desc {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .theme-btn .check {
    color: var(--color-primary);
    font-weight: bold;
    font-size: 1.2rem;
  }

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
  
  /* Remove margin bottom if it's the only child or we are in display mode with no other content below immediately */


  .actions {
    display: flex;
    gap: var(--spacing-2);
  }
  
  /* Small button override if not in global */
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
    background: rgba(16, 185, 129, 0.1); /* success with opacity */
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
    background: rgba(99, 102, 241, 0.05); /* primary with opacity */
  }

  .column-toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--spacing-2);
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
    background-color: #24292e; /* GitHub/Standard Dark */
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
    background: rgba(239, 68, 68, 0.1); /* error opacity */
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



  /* Site Credentials */
  .header-with-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
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

  .password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .password-input-wrapper input {
    padding-right: 40px;
  }

  .toggle-password {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    font-size: 1.2rem;
    opacity: 0.7;
  }

  .toggle-password:hover {
    opacity: 1;
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
