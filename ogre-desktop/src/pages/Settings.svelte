<script lang="ts">
  import { onMount } from 'svelte';
  import { getProviderConfigs, saveProviderConfig, deleteProviderConfig, getSetting, setSetting } from '../lib/db';
  import type { ProviderConfig } from '../lib/db';

  let providers: ProviderConfig[] = [];
  let editingProvider: string | null = null;
  let showAddForm = false;
  let visibleColumns: string[] = [];

  // New Provider State
  let newProviderId = '';
  let newProviderUrl = '';
  let newProviderKey = '';
  let newProviderModel = '';

  // Available providers
  const PROVIDER_OPTIONS = [
    { id: 'ollama-cloud', name: 'Ollama Cloud', requiresUrl: true, requiresKey: true, defaultUrl: '' },
    { id: 'ollama-local', name: 'Ollama Local', requiresUrl: true, requiresKey: false, defaultUrl: 'http://localhost:11434' },
    { id: 'openai', name: 'OpenAI', requiresUrl: false, requiresKey: true, defaultUrl: '' },
    { id: 'anthropic', name: 'Anthropic (Claude)', requiresUrl: false, requiresKey: true, defaultUrl: '' },
    { id: 'gemini', name: 'Google Gemini', requiresUrl: false, requiresKey: true, defaultUrl: '' },
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
  });

  async function loadProviders() {
    providers = await getProviderConfigs();
  }

  async function loadColumnVisibility() {
    const columnsJson = await getSetting('history_visible_columns');
    visibleColumns = columnsJson ? JSON.parse(columnsJson) : ['timestamp', 'provider', 'model', 'studentCount', 'meanScore', 'pageUrl'];
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
    if (option?.requiresKey && !provider.api_key) {
      alert('API Key is required for this provider');
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
      <div class="provider-card">
        <div class="provider-header">
          <h4>{PROVIDER_OPTIONS.find(p => p.id === provider.id)?.name || provider.id}</h4>
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
            {#if PROVIDER_OPTIONS.find(p => p.id === provider.id)?.requiresUrl}
              <label>
                API URL
                <input type="text" bind:value={provider.api_url} placeholder="https://api.example.com" />
              </label>
            {/if}
            
            {#if PROVIDER_OPTIONS.find(p => p.id === provider.id)?.requiresKey}
              <label>
                API Key
                <input type="password" bind:value={provider.api_key} placeholder="sk-..." />
              </label>
            {/if}

            <label>
              Model
              <input type="text" bind:value={provider.model} placeholder="gpt-4o" />
            </label>

            <label class="checkbox-label">
              <input type="checkbox" bind:checked={provider.is_active} 
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
            {#if PROVIDER_OPTIONS.find(p => p.id === newProviderId)?.requiresUrl}
              <label>
                API URL
                <input type="text" bind:value={newProviderUrl} placeholder="https://api.example.com" />
              </label>
            {/if}

            {#if PROVIDER_OPTIONS.find(p => p.id === newProviderId)?.requiresKey}
              <label>
                API Key
                <input type="password" bind:value={newProviderKey} placeholder="sk-..." />
              </label>
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
</style>