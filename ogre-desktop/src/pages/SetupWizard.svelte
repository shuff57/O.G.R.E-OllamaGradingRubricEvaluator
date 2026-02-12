<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { saveProviderConfig, setSetting } from '../lib/db';

  const dispatch = createEventDispatcher();

  let currentStep = 1;
  let loading = false;
  let error = '';

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
      apiKey: '', // Not typically needed for local, but keeping field for consistency
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
      id: 'gemini', 
      name: 'Google Gemini', 
      enabled: false, 
      apiKey: '', 
      apiUrl: '', 
      model: '', 
      keyUrl: 'https://aistudio.google.com/apikey',
      placeholderKey: 'AIza...'
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
        if (['openai', 'anthropic', 'gemini'].includes(p.id) && !p.apiKey) {
          error = `${p.name} requires an API Key.`; return;
        }
      }
    }

    if (currentStep === 3) {
       // Validate Step 3
       // Model names are technically optional in some contexts (could default), 
       // but the prompt implies collecting them. Let's make them optional but encouraged?
       // The plan says "Text input for model name". Let's assume user might leave it blank to use defaults.
       // However, strictly adhering to "configure" might imply we want them.
       // Let's verify if empty is okay. Usually explicit is better.
       // For now, I'll allow empty and assume the backend/provider handles defaults or the user knows what they are doing.
       // Actually, let's just proceed.
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
                  
                  {#if provider.id !== 'ollama_local'}
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
                <input type="text" bind:value={provider.model} placeholder="e.g. gpt-4o, llama3, claude-3-sonnet">
                <span class="hint">Check your provider's documentation for exact model names.</span>
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
    color: #2c3e50;
    text-align: center;
  }

  .subtitle {
    text-align: center;
    color: #7f8c8d;
    margin: -0.5rem 0 0 0;
  }

  .description {
    text-align: center;
    line-height: 1.6;
    color: #34495e;
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

  .provider-card, .model-card {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 1rem;
    transition: border-color 0.2s;
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
    font-size: 0.9rem;
    color: #7f8c8d;
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
    font-size: 0.8rem;
    color: #95a5a6;
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

  .error-message {
    color: #e74c3c;
    text-align: center;
    font-weight: 500;
  }
</style>
