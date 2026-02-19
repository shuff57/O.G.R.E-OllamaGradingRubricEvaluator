<script lang="ts">
  /**
   * DiscoveryPanel - UI for AI-powered page structure discovery.
   *
   * Features:
   * - One-click discovery of grading page selectors
   * - Real-time progress feedback
   * - Validation status display
   * - Interactive selector refinement via element picker
   * - Profile creation from discovered data
   */
  import {
    runDiscovery,
    type DiscoveryWorkflow,
    type DiscoveryResult,
    type ValidationResults,
    type SelectorMap
  } from '../../lib/discover';
  import {
    refineSelector,
    mergeSelectorSources,
  } from '../../lib/discovery-picker-integration';
  import type { ElementPickerResult } from '../../lib/element-picker';
  import { ProfileStorageImpl, type SiteProfile } from '../../lib/site-profiles';
  import { getEmbeddedUrl } from '../../lib/browser';
  
  // Props
  let {
    provider = '',
    model = '',
    onProfileSaved = () => {},
  } = $props<{
    provider?: string;
    model?: string;
    onProfileSaved?: (profile: SiteProfile) => void;
  }>();

  // ── State ─────────────────────────────────────────────────────────────
  type DiscoveryPhase = 'idle' | 'running' | 'review' | 'saving' | 'error';
  
  let phase = $state<DiscoveryPhase>('idle');
  let progressMessage = $state('');
  let progressPercent = $state(0);
  let error = $state('');
  
  let discoveryResult = $state<DiscoveryResult | null>(null);
  let validationResults = $state<ValidationResults | null>(null);
  let screenshot = $state('');
  
  // Save dialog state
  let showSaveDialog = $state(false);
  let profileName = $state('');
  let saveStatus = $state('');

  // ── Actions ───────────────────────────────────────────────────────────

  async function handleStartDiscovery() {
    phase = 'running';
    error = '';
    progressMessage = 'Starting discovery...';
    progressPercent = 0;
    discoveryResult = null;
    validationResults = null;

    try {
      const workflow = await runDiscovery({
        provider: provider || undefined,
        model: model || undefined,
        onProgress: (p) => {
          progressMessage = p.message;
          progressPercent = p.progress ?? 0;
          if (p.stage === 'error') {
            phase = 'error';
            error = p.error || 'Unknown error';
          }
        }
      });

      discoveryResult = workflow.draft;
      validationResults = workflow.validation;
      screenshot = workflow.screenshot;
      phase = 'review';
      
      // Auto-suggest name from page title if available (simplified)
      profileName = 'New Grading Profile'; 
    } catch (err) {
      phase = 'error';
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleRefine(key: keyof SelectorMap) {
    if (!discoveryResult) return;
    
    const currentSelector = discoveryResult.selectors[key] || '';
    
    try {
      // 1. Start picker
      const pickerResult = await refineSelector(currentSelector);
      
      // 2. Merge result
      const newSelector = mergeSelectorSources(currentSelector, pickerResult);
      
      // 3. Update state
      const updatedSelectors = { ...discoveryResult.selectors };
      (updatedSelectors as any)[key] = newSelector;
      
      discoveryResult = {
        ...discoveryResult,
        selectors: updatedSelectors,
        notes: (discoveryResult.notes || '') + `\n[Refined] ${key}: ${newSelector}`
      };
      
      // 4. Optimistically update validation status
      if (validationResults) {
        validationResults = {
          ...validationResults,
          [key]: {
            matchCount: 1, // Assume 1 match after picking
            sampleText: '(Refined by user)',
            valid: true
          }
        };
      }
    } catch (err) {
      // User cancelled or error - ignore
      console.log('Refinement cancelled or failed', err);
    }
  }

  async function handleSaveProfile() {
    if (!discoveryResult || !profileName.trim()) return;
    
    phase = 'saving';
    saveStatus = 'Saving...';
    
    try {
      const storage = new ProfileStorageImpl();
      
      // Map feedback type to strictly supported types
      let feedbackType = discoveryResult.feedback.type;
      if (feedbackType === 'unknown') {
        feedbackType = 'textarea'; // Default fallback
      }

      // Get current embedded URL for the pattern
      let currentUrl = '';
      try {
        currentUrl = await getEmbeddedUrl();
      } catch (e) {
        console.warn('Could not get embedded URL, using placeholder', e);
        currentUrl = 'example.com';
      }
      
      // Create simple hostname pattern or specific path if possible
      let urlPattern = currentUrl;
      try {
        const u = new URL(currentUrl);
        // Default to hostname + pathname for specificity, or just hostname
        // For grading apps, usually the path is important (e.g. gradeallq2.php)
        urlPattern = u.hostname + u.pathname; 
      } catch {}

      // Ensure valid SiteProfile structure
      const newProfile: SiteProfile = {
        id: crypto.randomUUID(),
        name: profileName.trim(),
        isBuiltIn: false,
        urlPatterns: [urlPattern], 
        selectors: {
          studentSection: discoveryResult.selectors.studentSection || null,
          studentName: discoveryResult.selectors.studentName,
          scoreInput: discoveryResult.selectors.scoreInput,
          feedbackBox: discoveryResult.selectors.feedbackBox || null,
          feedbackHidden: discoveryResult.selectors.feedbackHidden || null,
          questionRegion: discoveryResult.selectors.questionRegion || null,
          fullCreditLink: discoveryResult.selectors.fullCreditLink || null
        },
        navigation: discoveryResult.navigation,
        feedback: {
          ...discoveryResult.feedback,
          type: feedbackType as any // Cast safe because we handled 'unknown'
        },
        save: {
          ...discoveryResult.save,
          fallbackText: discoveryResult.save.fallbackText || 'Save'
        }
      };
      
      await storage.saveProfile(newProfile);
      
      saveStatus = 'Saved!';
      phase = 'idle';
      showSaveDialog = false;
      onProfileSaved(newProfile);
      
      // Reset after success
      setTimeout(() => {
        saveStatus = '';
        discoveryResult = null;
        validationResults = null;
      }, 2000);
      
    } catch (err) {
      phase = 'review'; // Go back to review on failure
      saveStatus = '';
      error = err instanceof Error ? err.message : String(err);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  function getStatusIcon(key: string): string {
    if (!validationResults) return '⚪';
    const val = validationResults[key];
    if (!val) return '⚪';
    if (val.skipped) return '⏭️';
    if (val.valid) return '✅';
    return '❌';
  }

  function getMatchText(key: string): string {
    if (!validationResults) return '';
    const val = validationResults[key];
    if (!val) return '';
    if (val.skipped) return 'Skipped';
    return `${val.matchCount} match${val.matchCount !== 1 ? 'es' : ''}`;
  }
</script>

<section class="discovery-panel">
  <!-- ── Header & Intro ── -->
  <div class="header">
    <h3>Discovery</h3>
    <p class="description">
      Automatically detect grading elements on this page using AI.
    </p>
  </div>

  <!-- ── Main Action ── -->
  {#if phase === 'idle' || phase === 'error'}
    <button class="btn-primary full-width" onclick={handleStartDiscovery}>
      Discover Selectors
    </button>
  {/if}

  <!-- ── Progress ── -->
  {#if phase === 'running'}
    <div class="progress-card">
      <div class="progress-bar">
        <div class="progress" style="width: {progressPercent}%"></div>
      </div>
      <p class="progress-message">{progressMessage}</p>
    </div>
  {/if}

  <!-- ── Results Review ── -->
  {#if (phase === 'review' || phase === 'saving') && discoveryResult}
    <div class="results-card">
      <div class="results-header">
        <h4>Results ({discoveryResult.confidence} confidence)</h4>
        <span class="badge">{discoveryResult.navigation.mode} mode</span>
      </div>

      <div class="selectors-list">
        {#each Object.entries(discoveryResult.selectors) as [key, value]}
          <div class="selector-row">
            <div class="selector-info">
              <span class="selector-key">{key}</span>
              <div class="selector-status">
                <span class="icon" title={getMatchText(key)}>{getStatusIcon(key)}</span>
                <code class="selector-value" title={value || '(null)'}>
                  {value || '(null)'}
                </code>
              </div>
            </div>
            <button 
              class="btn-icon" 
              onclick={() => handleRefine(key as keyof SelectorMap)}
              title="Refine with element picker"
            >
              🎯
            </button>
          </div>
        {/each}
      </div>

      <div class="actions-row">
        <button class="btn-secondary" onclick={() => { phase = 'idle'; }}>
          Discard
        </button>
        <button class="btn-primary" onclick={() => { showSaveDialog = true; }}>
          Save as Profile
        </button>
      </div>
    </div>
  {/if}

  <!-- ── Save Dialog ── -->
  {#if showSaveDialog}
    <div class="dialog-overlay">
      <div class="dialog">
        <h4>Save Profile</h4>
        <input 
          type="text" 
          placeholder="Profile Name" 
          bind:value={profileName} 
          class="dialog-input"
        />
        <div class="dialog-actions">
          <button class="btn-secondary" onclick={() => { showSaveDialog = false; }}>
            Cancel
          </button>
          <button 
            class="btn-primary" 
            onclick={handleSaveProfile}
            disabled={!profileName.trim() || phase === 'saving'}
          >
            {phase === 'saving' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Error Display ── -->
  {#if error}
    <div class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{error}</span>
    </div>
  {/if}

</section>

<style>
  .discovery-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    padding: var(--spacing-2);
  }

  .header h3 {
    margin: 0 0 var(--spacing-1) 0;
    font-size: 1rem;
    color: var(--color-text-primary);
  }

  .description {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  /* ── Buttons ── */
  .btn-primary, .btn-secondary {
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
    border: none;
  }
  
  .btn-primary:hover {
    background: var(--color-primary-dark);
  }
  
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover {
    background: var(--color-bg-secondary);
  }

  .full-width {
    width: 100%;
  }

  .btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--spacing-1);
    border-radius: var(--radius-sm);
    font-size: 1.1rem;
  }

  .btn-icon:hover {
    background: var(--color-bg-secondary);
  }

  /* ── Progress ── */
  .progress-card {
    background: var(--color-bg-card);
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .progress-bar {
    height: 6px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: var(--spacing-2);
  }

  .progress {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.3s ease;
  }

  .progress-message {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    text-align: center;
  }

  /* ── Results ── */
  .results-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .results-header h4 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  .badge {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .selectors-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    max-height: 300px;
    overflow-y: auto;
  }

  .selector-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2);
    background: var(--color-bg-main);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-light);
  }

  .selector-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    flex: 1;
  }

  .selector-key {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .selector-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
  }

  .selector-value {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions-row {
    display: flex;
    gap: var(--spacing-2);
    justify-content: flex-end;
    margin-top: var(--spacing-1);
  }

  /* ── Dialog ── */
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-card);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    box-shadow: var(--shadow-lg);
  }

  .dialog h4 {
    margin: 0;
    color: var(--color-text-primary);
  }

  .dialog-input {
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
  }

  /* ── Error ── */
  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2);
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-md);
    color: var(--color-error);
    font-size: 0.85rem;
  }
</style>
