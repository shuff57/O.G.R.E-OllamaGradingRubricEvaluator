<script lang="ts">
  import { onMount } from 'svelte';
  import { getProviderConfigs, saveProviderConfig, deleteProviderConfig, getSetting, setSetting, getOAuthToken } from '../lib/db';
  import type { ProviderConfig } from '../lib/db';
  import { signInWithGoogle, signInWithGitHub, fetchAvailableModels, signOut } from '../lib/oauth';

  let providers: ProviderConfig[] = [];
  let editingProvider: string | null = null;
  let showAddForm = false;
  let visibleColumns: string[] = [];

  // New Provider State
  let newProviderId = '';
  let newProviderUrl = '';
  let newProviderKey = '';
  let newProviderModel = '';

  // OAuth State
  let oauthStatus: Record<string, boolean> = {};
  let fetchedModels: Record<string, string[]> = {};
  let fetchingModels: Record<string, boolean> = {};
  let modelFetchErrors: Record<string, string> = {};
  let useApiKey: Record<string, boolean> = {}; // Track if user wants to use API key even if OAuth is available

  // Available providers
  const PROVIDER_OPTIONS = [
    { id: 'ollama-cloud', name: 'Ollama Cloud', requiresUrl: true, requiresKey: true, defaultUrl: '', oauth: false },
    { id: 'ollama-local', name: 'Ollama Local', requiresUrl: true, requiresKey: false, defaultUrl: 'http://localhost:11434', oauth: false },
    { id: 'openai', name: 'OpenAI', requiresUrl: false, requiresKey: true, defaultUrl: '', oauth: false },
    { id: 'anthropic', name: 'Anthropic (Claude)', requiresUrl: false, requiresKey: true, defaultUrl: '', oauth: false },
    { id: 'google-gemini', name: 'Google Gemini', requiresUrl: false, requiresKey: true, defaultUrl: '', oauth: true },
    { id: 'github-models', name: 'GitHub Models', requiresUrl: false, requiresKey: true, defaultUrl: '', oauth: true },
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

  async function checkOAuthStatus() {
    for (const opt of PROVIDER_OPTIONS) {
      if (opt.oauth) {
        const providerId = opt.id === 'google-gemini' ? 'google' : (opt.id === 'github-models' ? 'github' : opt.id);
        const token = await getOAuthToken(providerId);
        oauthStatus[opt.id] = !!token;
        if (token) {
           // If we have a token, fetch models automatically
           fetchModels(opt.id);
        }
      }
    }
  }

  async function handleOAuthSignIn(providerId: string) {
    try {
      if (providerId === 'google-gemini') {
        await signInWithGoogle();
        oauthStatus['google-gemini'] = true;
        fetchModels('google-gemini');
      } else if (providerId === 'github-models') {
        await signInWithGitHub();
        oauthStatus['github-models'] = true;
        fetchModels('github-models');
      }
    } catch (error) {
      console.error('Sign in failed:', error);
      alert('Sign in failed: ' + error);
    }
  }

  async function handleSignOut(providerId: string) {
    try {
      const oauthProvider = providerId === 'google-gemini' ? 'google' : 'github';
      await signOut(oauthProvider as 'google' | 'github');
      oauthStatus[providerId] = false;
      fetchedModels[providerId] = [];
    } catch (error) {
       console.error('Sign out failed:', error);
       // Still update UI to reflect "signed out" locally
       oauthStatus[providerId] = false;
    }
  }

  async function fetchModels(providerId: string) {
    fetchingModels[providerId] = true;
    modelFetchErrors[providerId] = '';
    try {
      const oauthProvider = providerId === 'google-gemini' ? 'google' : 'github';
      const models = await fetchAvailableModels(oauthProvider as 'google' | 'github');
      fetchedModels[providerId] = models;
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
              {#if option.oauth}
                 <div class="oauth-section">
                   {#if oauthStatus[provider.id] && !useApiKey[provider.id]}
                     <div class="oauth-status success">
                        <span class="icon">✅</span> Signed in via OAuth
                        <button class="small" on:click={() => handleSignOut(provider.id)}>Sign out</button>
                     </div>
                   {:else}
                     <div class="oauth-actions">
                        {#if !useApiKey[provider.id]}
                           <button class="oauth-btn" on:click={() => handleOAuthSignIn(provider.id)}>
                             Sign in with {option.name.includes('Google') ? 'Google' : 'GitHub'}
                           </button>
                           <div class="divider"><span>OR</span></div>
                        {/if}
                        
                        {#if useApiKey[provider.id]}
                           <label>
                              API Key
                              <input type="password" bind:value={provider.api_key} placeholder="sk-..." />
                           </label>
                           <button class="link-btn" on:click={() => useApiKey[provider.id] = false}>
                             Use OAuth instead
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
              {#if option?.oauth && oauthStatus[provider.id] && !useApiKey[provider.id]}
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
            {#if option?.oauth && oauthStatus[provider.id]}
               <div class="info-row">
                 <span class="label">Auth:</span>
                 <span class="value success">✅ OAuth Signed In</span>
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
               {#if newOption.oauth}
                  <!-- Simple view for add form, detailed view in edit -->
                  <p class="hint">You can sign in with OAuth after saving.</p>
                  <label>
                    API Key (Optional if using OAuth)
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
</style>
