<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { saveProviderConfig, setSetting } from '../lib/db';
  import { signInWithGoogle, signInWithGitHub, fetchAvailableModels } from '../lib/oauth';

  const dispatch = createEventDispatcher();

  let currentStep = 1;
  let loading = false;
  let error = '';

  // OAuth State
  let fetchedModels: Record<string, Array<{id: string, name: string}>> = {};
  let fetchingModels: Record<string, boolean> = {};
  let modelFetchErrors: Record<string, string> = {};
  let oauthSignedIn: Record<string, boolean> = {};

  let providers = [
    { 
      id: 'ollama_cloud', 
      name: 'Ollama Cloud', 
      enabled: false, 
      apiKey: '', 
      apiUrl: '', 
      model: '', 
      keyUrl: '',
      placeholderKey: 'Enter API Key',
      placeholderUrl: 'https://your-ollama-instance.com'
    },
    { 
      id: 'ollama_local', 
      name: 'Ollama Local', 
      enabled: false, 
      apiKey: '', 
      apiUrl: 'http://localhost:11434', 
      model: '', 
      keyUrl: '',
      placeholderUrl: 'http://localhost:11434'
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
      placeholderKey: 'sk-ant-...'
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
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        ollamaLocalDetected = true;
        const localProvider = providers.find(p => p.id === 'ollama_local');
        if (localProvider) {
          localProvider.enabled = true;
          localProvider.apiUrl = 'http://localhost:11434';
          providers = providers; // trigger update
        }
      }
    } catch {
      ollamaLocalDetected = false;
    }
  }

  async function handleOAuthSignIn(providerId: string) {
    loading = true;
    error = '';
    try {
      if (providerId === 'google-gemini') {
        await signInWithGoogle();
        oauthSignedIn['google-gemini'] = true;
      } else if (providerId === 'github-models') {
        await signInWithGitHub();
        oauthSignedIn['github-models'] = true;
      }
      
      // Auto fetch models after sign in
      await fetchModels(providerId);
    } catch (err: any) {
      error = err.message || 'Sign in failed';
      // Fallback to API key if sign in fails? User can just toggle manually.
    } finally {
      loading = false;
    }
  }

  async function fetchModels(providerId: string) {
    fetchingModels[providerId] = true;
    fetchingModels = fetchingModels; // trigger update
    modelFetchErrors[providerId] = '';
    
    try {
      const oauthProvider = providerId === 'google-gemini' ? 'google' : 'github';
      // @ts-ignore - fetchAvailableModels expects specific string literal type
      const models = await fetchAvailableModels(oauthProvider);
      fetchedModels[providerId] = models.map(m => ({ id: m, name: m }));
      fetchedModels = fetchedModels; // trigger update
    } catch (err: any) {
      console.error(err);
      modelFetchErrors[providerId] = 'Failed to fetch models.';
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
        if (p.id === 'ollama_cloud') {
          if (!p.apiUrl) { error = 'Ollama Cloud requires an API URL.'; return; }
          if (!p.apiKey) { error = 'Ollama Cloud requires an API Key.'; return; }
        }
        if (p.id === 'ollama_local' && !p.apiUrl) {
          error = 'Ollama Local requires an API URL.'; return;
        }
        // OAuth providers validation
        if ((p.id === 'google-gemini' || p.id === 'github-models')) {
           // If using API key, check it. If using OAuth, check if signed in.
           // @ts-ignore
           if (p.useApiKey) {
             if (!p.apiKey) { error = `${p.name} requires an API Key.`; return; }
           } else {
             if (!oauthSignedIn[p.id]) { error = `Please sign in to ${p.name} or use an API Key.`; return; }
           }
        } else if (['openai', 'anthropic'].includes(p.id) && !p.apiKey) {
           error = `${p.name} requires an API Key.`; return;
        }
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
      console.error(err);
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
                  {#if ['ollama_cloud', 'ollama_local'].includes(provider.id)}
                    <div class="form-group">
                      <label>API URL</label>
                      <input type="text" bind:value={provider.apiUrl} placeholder={provider.placeholderUrl}>
                    </div>
                  {/if}
                  
                  {#if provider.oauth}
                    <!-- OAuth Provider UI -->
                    {#if provider.useApiKey}
                       <div class="form-group">
                        <label>API Key</label>
                        <input type="password" bind:value={provider.apiKey} placeholder={provider.placeholderKey}>
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
                                <span>✅ Signed in</span>
                             </div>
                             {#if fetchedModels[provider.id]?.length}
                                <span class="hint">{fetchedModels[provider.id].length} models available</span>
                             {/if}
                          {:else}
                             <button class="btn-oauth" on:click={() => handleOAuthSignIn(provider.id)} disabled={loading}>
                                {#if loading}Signing in...{:else}Sign in with {provider.name}{/if}
                             </button>
                          {/if}
                          <button class="link-btn" on:click={() => toggleAuthMethod(provider)}>Or use API Key</button>
                       </div>
                    {/if}
                  {:else if provider.id !== 'ollama_local'}
                    <!-- Standard API Key Provider -->
                    <div class="form-group">
                      <label>API Key</label>
                      <input type="password" bind:value={provider.apiKey} placeholder={provider.placeholderKey}>
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
                <label>Model Name</label>
                
                {#if provider.oauth && !provider.useApiKey && oauthSignedIn[provider.id]}
                    <!-- OAuth Dropdown -->
                    {#if fetchingModels[provider.id]}
                        <div class="loading-models">Fetching models...</div>
                    {:else if fetchedModels[provider.id]?.length > 0}
                        <select bind:value={provider.model} class="model-select">
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
                             <span class="error-text">{modelFetchErrors[provider.id] || 'No models found.'}</span>
                             <input type="text" bind:value={provider.model} placeholder="Enter model ID manually">
                             <button class="link-btn small" on:click={() => fetchModels(provider.id)}>Retry Fetch</button>
                         </div>
                    {/if}
                {:else}
                   <!-- Text Input -->
                   <input type="text" bind:value={provider.model} placeholder="e.g. gpt-4o, llama3, claude-3-sonnet">
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
</style>
