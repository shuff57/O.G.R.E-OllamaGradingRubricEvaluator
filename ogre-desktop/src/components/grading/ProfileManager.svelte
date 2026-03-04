<script lang="ts">
  import { onMount } from 'svelte';
  import { ProfileStorageImpl, type SiteProfile, type SiteSelectors } from '../../lib/site-profiles';
  import { testProfile, type ProfileTestReport } from '../../lib/profile-tester';
  import { refineSelector, mergeSelectorSources } from '../../lib/discovery-picker-integration';

  let profiles = $state<SiteProfile[]>([]);
  let loading = $state(true);
  let error = $state('');
  let editing = $state<SiteProfile | null>(null);
  let isNew = $state(false);

  // Form fields
  let formName = $state('');
  let formUrlPatterns = $state('');
  let formSelectors = $state<SiteSelectors>({
    studentName: '',
    studentSection: '',
    questionRegion: '',
    scoreInput: '',
    feedbackBox: '',
    feedbackHidden: '',
    fullCreditLink: ''
  });
  let formSubmitButton = $state('');

  // Test state
  let testReport = $state<ProfileTestReport | null>(null);
  let isTesting = $state(false);

  // Re-discovery
  let { onRequestDiscovery = (url: string) => {} } = $props<{
    onRequestDiscovery?: (url: string) => void;
  }>();

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
    testReport = null;
  }

  function openEdit(profile: SiteProfile) {
    if (profile.isBuiltIn) return;
    editing = profile;
    isNew = false;
    formName = profile.name;
    formUrlPatterns = profile.urlPatterns.join('\n');
    formSelectors = { ...profile.selectors };
    formSubmitButton = profile.navigation?.submitButton || '';
    testReport = null;
  }

  function cancelForm() {
    editing = null;
    isNew = false;
    error = '';
    testReport = null;
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

  async function handlePickSelector(key: keyof SiteSelectors) {
    try {
      const current = formSelectors[key] || '';
      const result = await refineSelector(current);
      // Merge logic: if original was empty, take new. If both exist, maybe prefer picker?
      // mergeSelectorSources prefers picker if it's more specific.
      const merged = mergeSelectorSources(current, result);
      formSelectors = { ...formSelectors, [key]: merged };
    } catch (e) {
      // User cancelled
    }
  }

  async function handleTestProfile() {
    isTesting = true;
    testReport = null;
    try {
      // Create temp profile from form data
      const tempProfile: SiteProfile = {
        id: 'temp-test',
        name: formName,
        isBuiltIn: false,
        urlPatterns: [],
        selectors: formSelectors,
        // other fields irrelevant for selector testing
        feedback: { type: 'textarea', requiresHiddenSync: false, htmlWrap: false },
        save: { buttonText: 'Save', fallbackText: 'Submit' },
        navigation: { mode: 'batch' }
      };
      
      // We need current page URL. Assuming we are on the page we want to test.
      // Ideally we'd get it from browser.ts but testProfile takes a string.
      // We can pass empty string if testProfile handles it, or use a placeholder.
      // But testProfile actually uses evalScript so it runs ON the current page.
      // The pageUrl arg is mostly for reporting.
      testReport = await testProfile(tempProfile, 'current-page');
    } catch (e) {
      error = "Test failed: " + e;
    } finally {
      isTesting = false;
    }
  }

  function handleRediscover() {
    // We can't easily navigate to the URL here as we might be on a different page.
    // But we can signal the parent to switch to Discovery tab.
    // If we have a URL pattern, we could try to navigate? 
    // For now, let's just assume the user is on the right page and wants to re-run discovery.
    onRequestDiscovery(formUrlPatterns.split('\n')[0] || '');
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
      <div class="form-header">
        <h4>{isNew ? 'Create Profile' : 'Edit Profile'}</h4>
        <div class="form-tools">
           <button class="btn-sm btn-secondary" onclick={handleRediscover} title="Start fresh discovery">
             🔄 Re-discover
           </button>
           <button class="btn-sm btn-secondary" onclick={handleTestProfile} disabled={isTesting}>
             {isTesting ? 'Testing...' : '▶ Test'}
           </button>
        </div>
      </div>

      {#if testReport}
        <div class="test-report {testReport.passed ? 'pass' : 'fail'}">
          <strong>{testReport.passed ? '✅ Passed' : '❌ Failed'}</strong>
          <span>{testReport.selectorsFound}/{testReport.selectorResults.length} found</span>
        </div>
      {/if}
      
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
          {#each Object.keys(formSelectors) as key}
            {#if key !== 'feedbackHidden' && key !== 'fullCreditLink'} <!-- Show main ones or all? -->
              <div class="form-group selector-group">
                <label for={'s-'+key}>{key}</label> <!-- Should use friendly labels -->
                <div class="input-with-action">
                  <input id={'s-'+key} type="text" bind:value={formSelectors[key as keyof SiteSelectors]} placeholder={`.${key}`}>
                  <button class="btn-icon" onclick={() => handlePickSelector(key as keyof SiteSelectors)} title="Pick from page">🎯</button>
                </div>
              </div>
            {/if}
          {/each}
          <!-- Specific handling for submit button as it's separate -->
           <div class="form-group selector-group">
            <label for="sSubmit">Submit Button</label>
            <div class="input-with-action">
              <input id="sSubmit" type="text" bind:value={formSubmitButton} placeholder="button.submit">
              <!-- No picker for submit button yet in refineSelector? refineSelector takes any string -->
               <button class="btn-icon" onclick={async () => {
                 try {
                   const r = await refineSelector(formSubmitButton);
                   formSubmitButton = mergeSelectorSources(formSubmitButton, r);
                 } catch {}
               }} title="Pick from page">🎯</button>
            </div>
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
  .profile-manager { display: flex; flex-direction: column; gap: var(--spacing-4); }
  .header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; font-size: 1.1em; color: var(--color-text-primary); }
  h4 { margin: 0; color: var(--color-text-primary); }
  h5 { margin: 0 0 var(--spacing-2) 0; font-size: 0.9em; color: var(--color-text-primary); }
  .card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-4); }
  .form-card { border-color: var(--color-primary); }
  .form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-4); }
  .form-tools { display: flex; gap: 8px; }
  .form-group { margin-bottom: var(--spacing-3); }
  label { display: block; font-size: 0.85em; color: var(--color-text-secondary); margin-bottom: var(--spacing-1); }
  input, textarea { width: 100%; padding: var(--spacing-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-main); color: var(--color-text-primary); font-family: inherit; box-sizing: border-box; }
  input:focus, textarea:focus { outline: none; border-color: var(--color-primary); }
  .hint { color: var(--color-text-secondary); font-size: 0.8em; font-weight: normal; }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--spacing-3); }
  .selectors-section { margin-top: var(--spacing-4); padding-top: var(--spacing-4); border-top: 1px solid var(--color-border); }
  .form-actions { display: flex; gap: var(--spacing-2); margin-top: var(--spacing-4); justify-content: flex-end; }
  .profile-list { display: flex; flex-direction: column; gap: var(--spacing-2); }
  .profile-item { display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-3); }
  .profile-header { display: flex; align-items: center; gap: var(--spacing-2); margin-bottom: var(--spacing-1); }
  .profile-name { font-weight: 500; color: var(--color-text-primary); }
  .badge { font-size: 0.7em; padding: 2px 6px; border-radius: var(--radius-full); text-transform: uppercase; font-weight: 600; }
  .badge.builtin { background: var(--color-bg-card-hover); color: var(--color-text-secondary); border: 1px solid var(--color-border); }
  .url-patterns { display: flex; gap: var(--spacing-1); font-size: 0.8em; color: var(--color-text-secondary); }
  .url-tag { background: var(--color-bg-main); padding: 1px 6px; border-radius: var(--radius-sm); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-primary { background: var(--color-primary); color: white; border: none; padding: var(--spacing-2) var(--spacing-3); border-radius: var(--radius-md); cursor: pointer; font-size: 0.9em; }
  .btn-ghost { background: transparent; border: 1px solid transparent; color: var(--color-text-secondary); padding: var(--spacing-2) var(--spacing-3); border-radius: var(--radius-md); cursor: pointer; font-size: 0.9em; }
  .btn-ghost:hover { background: var(--color-bg-card-hover); color: var(--color-text-primary); }
  .btn-sm { padding: var(--spacing-1) var(--spacing-2); font-size: 0.8em; }
  .btn-secondary { background: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary); cursor: pointer; border-radius: var(--radius-sm); }
  .btn-secondary:hover { background: var(--color-bg-card-hover); }
  .text-danger { color: var(--color-error); }
  .text-danger:hover { background: var(--color-error-bg); }
  .error-banner { background: var(--color-error-bg); color: var(--color-error); padding: var(--spacing-2); border-radius: var(--radius-md); font-size: 0.9em; margin-bottom: var(--spacing-3); }
  .loading { text-align: center; color: var(--color-text-secondary); padding: var(--spacing-4); }
  
  .input-with-action { display: flex; gap: 4px; }
  .btn-icon { background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; padding: 0 8px; }
  .btn-icon:hover { background: var(--color-bg-card-hover); }
  
  .test-report { margin-bottom: var(--spacing-3); padding: 8px; border-radius: var(--radius-sm); font-size: 0.9rem; display: flex; justify-content: space-between; }
  .test-report.pass { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .test-report.fail { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
</style>
