<script lang="ts">
  import { onMount } from 'svelte';
  import { ProfileStorageImpl, type SiteProfile, type SiteSelectors } from '../../lib/site-profiles';

  let profiles: SiteProfile[] = [];
  let loading = true;
  let error = '';
  let editing: SiteProfile | null = null;
  let isNew = false;

  // Form fields
  let formName = '';
  let formUrlPatterns = '';
  let formSelectors: SiteSelectors = {
    studentName: '',
    studentSection: '',
    questionRegion: '',
    scoreInput: '',
    feedbackBox: '',
    feedbackHidden: '',
    fullCreditLink: ''
  };
  let formSubmitButton = '';

  const storage = new ProfileStorageImpl();

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    error = '';
    try {
      profiles = await storage.listProfiles();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load profiles';
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    editing = null;
    isNew = true;
    formName = '';
    formUrlPatterns = '';
    formSelectors = {
      studentName: '',
      studentSection: '',
      questionRegion: '',
      scoreInput: '',
      feedbackBox: '',
      feedbackHidden: '',
      fullCreditLink: ''
    };
    formSubmitButton = '';
  }

  function openEdit(profile: SiteProfile) {
    if (profile.isBuiltIn) return;
    editing = profile;
    isNew = false;
    formName = profile.name;
    formUrlPatterns = profile.urlPatterns.join('\n');
    formSelectors = { ...profile.selectors };
    formSubmitButton = profile.navigation?.submitButton || '';
  }

  function cancelForm() {
    editing = null;
    isNew = false;
    error = '';
  }

  async function saveForm() {
    if (!formName.trim()) {
      error = 'Name is required';
      return;
    }

    const urlPatterns = formUrlPatterns
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (urlPatterns.length === 0) {
      error = 'At least one URL pattern is required';
      return;
    }

    try {
      const profile: SiteProfile = {
        id: isNew ? crypto.randomUUID() : editing!.id,
        name: formName.trim(),
        isBuiltIn: false,
        urlPatterns,
        selectors: { ...formSelectors },
        // Use default config for new profiles
        feedback: editing?.feedback || { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
        save: editing?.save || { buttonText: 'Save', fallbackText: 'Submit' },
        navigation: {
          ...(editing?.navigation || { mode: 'batch' }),
          submitButton: formSubmitButton.trim() || undefined
        }
      };

      await storage.saveProfile(profile);
      await loadData();
      cancelForm();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save profile';
    }
  }

  async function deleteProfile(id: string) {
    if (!confirm('Are you sure you want to delete this profile?')) return;
    try {
      await storage.deleteProfile(id);
      await loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete profile';
    }
  }
</script>

<div class="profile-manager">
  <header class="header">
    <h3>Site Profiles</h3>
    {#if !isNew && !editing}
      <button class="btn-primary" onclick={openCreate}>+ New Profile</button>
    {/if}
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if isNew || editing}
    <div class="card form-card">
      <h4>{isNew ? 'Create Profile' : 'Edit Profile'}</h4>
      
      <div class="form-group">
        <label for="pName">Name</label>
        <input id="pName" type="text" bind:value={formName} placeholder="e.g. Canvas Quizzes">
      </div>

      <div class="form-group">
        <label for="pUrls">URL Patterns <span class="hint">(one per line)</span></label>
        <textarea id="pUrls" bind:value={formUrlPatterns} rows="3" placeholder="canvas.instructure.com/courses/*/quizzes"></textarea>
      </div>

      <div class="selectors-section">
        <h5>CSS Selectors</h5>
        <p class="hint">Leave empty if not applicable.</p>
        
        <div class="form-grid">
          <div class="form-group">
            <label for="sName">Student Name</label>
            <input id="sName" type="text" bind:value={formSelectors.studentName} placeholder=".student-name">
          </div>
          <div class="form-group">
            <label for="sSection">Question Region</label>
            <input id="sSection" type="text" bind:value={formSelectors.questionRegion} placeholder="#questions">
          </div>
          <div class="form-group">
            <label for="sScore">Score Input</label>
            <input id="sScore" type="text" bind:value={formSelectors.scoreInput} placeholder="input.score">
          </div>
          <div class="form-group">
            <label for="sFeedback">Feedback Box</label>
            <input id="sFeedback" type="text" bind:value={formSelectors.feedbackBox} placeholder="textarea.comments">
          </div>
          <div class="form-group">
            <label for="sSubmit">Submit Button</label>
            <input id="sSubmit" type="text" bind:value={formSubmitButton} placeholder="button.submit">
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn-primary" onclick={saveForm}>Save</button>
        <button class="btn-ghost" onclick={cancelForm}>Cancel</button>
      </div>
    </div>
  {:else if loading}
    <div class="loading">Loading profiles...</div>
  {:else}
    <div class="profile-list">
      {#each profiles as profile (profile.id)}
        <div class="card profile-item">
          <div class="profile-info">
            <div class="profile-header">
              <span class="profile-name">{profile.name}</span>
              {#if profile.isBuiltIn}
                <span class="badge builtin">Built-in</span>
              {/if}
            </div>
            <div class="url-patterns">
              {#each profile.urlPatterns.slice(0, 2) as url}
                <span class="url-tag">{url}</span>
              {/each}
              {#if profile.urlPatterns.length > 2}
                <span class="url-more">+{profile.urlPatterns.length - 2} more</span>
              {/if}
            </div>
          </div>
          
          <div class="profile-actions">
            {#if !profile.isBuiltIn}
              <button class="btn-ghost btn-sm" onclick={() => openEdit(profile)}>Edit</button>
              <button class="btn-ghost btn-sm text-danger" onclick={() => deleteProfile(profile.id)}>Delete</button>
            {:else}
              <button class="btn-ghost btn-sm" disabled title="Built-in profiles cannot be modified">Locked</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .profile-manager {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 { margin: 0; font-size: 1.1em; color: var(--color-text-primary); }
  h4 { margin: 0 0 var(--spacing-4) 0; color: var(--color-text-primary); }
  h5 { margin: 0 0 var(--spacing-2) 0; font-size: 0.9em; color: var(--color-text-primary); }

  .card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-4);
  }

  .form-card {
    border-color: var(--color-primary);
  }

  .form-group { margin-bottom: var(--spacing-3); }
  
  label {
    display: block;
    font-size: 0.85em;
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-1);
  }

  input, textarea {
    width: 100%;
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
    font-family: inherit;
    box-sizing: border-box;
  }

  input:focus, textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .hint { color: var(--color-text-secondary); font-size: 0.8em; font-weight: normal; }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--spacing-3);
  }

  .selectors-section {
    margin-top: var(--spacing-4);
    padding-top: var(--spacing-4);
    border-top: 1px solid var(--color-border);
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-4);
    justify-content: flex-end;
  }

  .profile-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .profile-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-3);
  }

  .profile-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-1);
  }

  .profile-name { font-weight: 500; color: var(--color-text-primary); }

  .badge {
    font-size: 0.7em;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    font-weight: 600;
  }

  .badge.builtin {
    background: var(--color-bg-card-hover);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .url-patterns {
    display: flex;
    gap: var(--spacing-1);
    font-size: 0.8em;
    color: var(--color-text-secondary);
  }

  .url-tag {
    background: var(--color-bg-main);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9em;
  }

  .btn-ghost {
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-text-secondary);
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9em;
  }

  .btn-ghost:hover {
    background: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }

  .btn-sm { padding: var(--spacing-1) var(--spacing-2); font-size: 0.8em; }
  
  .text-danger { color: var(--color-error); }
  .text-danger:hover { background: var(--color-error-bg); }

  .error-banner {
    background: var(--color-error-bg);
    color: var(--color-error);
    padding: var(--spacing-2);
    border-radius: var(--radius-md);
    font-size: 0.9em;
  }

  .loading {
    text-align: center;
    color: var(--color-text-secondary);
    padding: var(--spacing-4);
  }
</style>
