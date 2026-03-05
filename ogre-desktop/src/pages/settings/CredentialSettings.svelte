<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    getSiteCredentials,
    saveSiteCredential,
    deleteSiteCredential
  } from '../../lib/db';
  import type { SiteCredential } from '../../lib/db';
  import { GRADING_SITE_PRESETS } from '../../lib/browser';

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

  onMount(async () => {
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
      alert('Failed to save credential: ' + error);
    }
  }

  async function deleteCredential(id: number, name: string) {
    if (!confirm(`Delete credentials for "${name}"? This cannot be undone.`)) return;
    try {
      await deleteSiteCredential(id);
      await loadCredentials();
    } catch (error) {
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
</script>

<!-- Site Credentials Section -->
<section class="card mb-6">
  <div class="header-with-action">
    <h3>Site Credentials</h3>
    {#if !showAddCredentialForm}
      <button class="primary small" onclick={() => { resetCredentialForm(); showAddCredentialForm = true; }}>
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
              <button type="button" class="preset-btn" onclick={() => {
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
            <button class="toggle-password" type="button" onclick={() => showPassword = !showPassword}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </label>

        <label>
          Notes (Optional)
          <textarea bind:value={credentialForm.notes} rows="2" placeholder="Additional notes..."></textarea>
        </label>

        <div class="form-actions">
          <button class="primary" onclick={saveCredential}>Save Credential</button>
          <button class="ghost" onclick={resetCredentialForm}>Cancel</button>
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
              <button class="secondary small" onclick={() => editCredential(cred)}>Edit</button>
              <button class="danger small" onclick={() => deleteCredential(cred.id, cred.site_name)}>Delete</button>
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

<style>
  .header-with-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
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

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    margin-top: var(--spacing-2);
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-4);
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin: 0 0 var(--spacing-2) 0;
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
</style>
