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
    clearRefinementHighlights,
  } from '../../lib/discovery-picker-integration';
  import {
    createConfirmationFlow,
    getRequiredSelectorKeys,
    type ConfirmationFlow,
    type ConfirmationStepState,
  } from '../../lib/confirmation-flow';
  import type { ElementPickerResult } from '../../lib/element-picker';
  import { ProfileStorageImpl, type SiteProfile } from '../../lib/site-profiles';
  import { getEmbeddedUrl, evalScript } from '../../lib/browser';
  
  // Props
  let {
    provider = '',
    model = '',
    returnToBatch = false,
    onProfileSaved = () => {},
  } = $props<{
    provider?: string;
    model?: string;
    returnToBatch?: boolean;
    onProfileSaved?: (profile: SiteProfile) => void;
  }>();

  // ── State ─────────────────────────────────────────────────────────────
  type DiscoveryPhase = 'idle' | 'running' | 'review' | 'confirming' | 'saving' | 'error';
  
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

  // Confirmation flow state
  let confirmationFlow = $state<ConfirmationFlow | null>(null);
  let isRefining = $state(false);

  // Friendly labels for selector keys
  const SELECTOR_LABELS: Record<string, string> = {
    studentSection: 'Student Section',
    studentName: 'Student Name',
    scoreInput: 'Score Input',
    feedbackBox: 'Feedback Area',
    feedbackHidden: 'Feedback Hidden Input',
    questionRegion: 'Question Region',
    fullCreditLink: 'Full Credit Link',
  };

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

  async function handleStartConfirmation() {
    if (!discoveryResult || !validationResults) return;
    
    confirmationFlow = createConfirmationFlow(
      discoveryResult.selectors,
      validationResults,
      discoveryResult.navigation.mode
    );
    
    phase = 'confirming';
    
    // Highlight first step's matches
    const state = confirmationFlow.getState();
    if (state?.selector) {
      await highlightSelector(state.selector);
    }
  }

  async function highlightSelector(selector: string) {
    if (!selector) return;
    try {
      await evalScript(`(function(selector) {
        document.querySelectorAll('[data-ogre-refine-highlight]').forEach(function(el) {
          el.style.outline = el.dataset.ogreOriginalOutline || '';
          el.style.outlineOffset = el.dataset.ogreOriginalOutlineOffset || '';
          el.removeAttribute('data-ogre-refine-highlight');
          el.removeAttribute('data-ogre-original-outline');
          el.removeAttribute('data-ogre-original-outline-offset');
        });
        if (!selector) return;
        try {
          var matches = document.querySelectorAll(selector);
          for (var i = 0; i < matches.length; i++) {
            var el = matches[i];
            el.dataset.ogreOriginalOutline = el.style.outline || '';
            el.dataset.ogreOriginalOutlineOffset = el.style.outlineOffset || '';
            el.style.outline = '3px dashed #f59e0b';
            el.style.outlineOffset = '2px';
            el.setAttribute('data-ogre-refine-highlight', 'true');
          }
        } catch(e) {}
      })(${JSON.stringify(selector)})`);
    } catch {
      // Non-fatal — webview may not be ready
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

  async function handleConfirmAccept() {
    if (!confirmationFlow) return;
    confirmationFlow.accept();
    
    if (confirmationFlow.phase === 'complete') {
      await handleConfirmationComplete();
    } else {
      const state = confirmationFlow.getState();
      if (state?.selector) {
        await highlightSelector(state.selector);
      } else {
        await clearRefinementHighlights();
      }
    }
  }

  async function handleConfirmRefine() {
    if (!confirmationFlow || isRefining) return;
    const state = confirmationFlow.getState();
    if (!state) return;
    
    isRefining = true;
    try {
      const pickerResult = await refineSelector(state.selector || '');
      const newSelector = mergeSelectorSources(state.selector || '', pickerResult);
      confirmationFlow.refine(newSelector);
      
      if (confirmationFlow.phase === 'complete') {
        await handleConfirmationComplete();
      } else {
        const nextState = confirmationFlow.getState();
        if (nextState?.selector) {
          await highlightSelector(nextState.selector);
        } else {
          await clearRefinementHighlights();
        }
      }
    } catch {
      // Picker cancelled — stay on current step
    } finally {
      isRefining = false;
    }
  }

  async function handleConfirmBack() {
    if (!confirmationFlow) return;
    confirmationFlow.back();
    const state = confirmationFlow.getState();
    if (state?.selector) {
      await highlightSelector(state.selector);
    }
  }

  async function handleConfirmCancel() {
    if (!confirmationFlow) return;
    confirmationFlow.cancel();
    await clearRefinementHighlights();
    confirmationFlow = null;
    phase = 'review';
  }

  async function handleConfirmationComplete() {
    if (!confirmationFlow || !discoveryResult) return;
    
    const confirmedSelectors = confirmationFlow.getConfirmedSelectors();
    
    // Merge confirmed selectors back into discoveryResult
    discoveryResult = {
      ...discoveryResult,
      selectors: {
        ...discoveryResult.selectors,
        ...confirmedSelectors,
      }
    };
    
    await clearRefinementHighlights();
    confirmationFlow = null;
    
    if (returnToBatch) {
      // Auto-save with generated name
      profileName = 'Discovered Profile';
      await handleSaveProfile();
    } else {
      // Show save dialog as normal
      phase = 'review';
      showSaveDialog = true;
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
        {#if returnToBatch}
          <button class="btn-primary" onclick={handleStartConfirmation}>
            Confirm Selectors
          </button>
        {:else}
          <button class="btn-primary" onclick={() => { showSaveDialog = true; }}>
            Save as Profile
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── Confirmation Phase ── -->
  {#if phase === 'confirming' && confirmationFlow}
    {@const confirmState = confirmationFlow.getState()}
    {#if confirmState}
      <div class="confirmation-card">
        <div class="confirm-progress">
          <span class="confirm-step-label">Step {confirmState.stepIndex + 1} of {confirmState.totalSteps}</span>
          <div class="confirm-progress-bar">
            <div class="confirm-progress-fill" style="width: {((confirmState.stepIndex) / confirmState.totalSteps) * 100}%"></div>
          </div>
        </div>
        
        <div class="confirm-selector-info">
          <div class="confirm-selector-name">{SELECTOR_LABELS[confirmState.key] ?? confirmState.key}</div>
          {#if confirmState.selector}
            <code class="confirm-selector-value">{confirmState.selector}</code>
            <div class="confirm-match-info">
              <span class="confirm-match-count">{confirmState.matchCount} match{confirmState.matchCount !== 1 ? 'es' : ''}</span>
              {#if confirmState.sampleText}
                <span class="confirm-sample-text">"{confirmState.sampleText}"</span>
              {/if}
            </div>
          {:else}
            <div class="confirm-not-detected">Not detected — will be skipped</div>
          {/if}
        </div>
        
        <div class="confirm-actions">
          <button class="btn-secondary small" onclick={handleConfirmBack} disabled={confirmState.stepIndex === 0}>
            ← Back
          </button>
          <button class="btn-secondary small" onclick={handleConfirmCancel}>
            Cancel
          </button>
          <button class="btn-secondary small" onclick={handleConfirmRefine} disabled={isRefining}>
            {isRefining ? 'Picking...' : 'Refine'}
          </button>
          <button class="btn-primary small" onclick={handleConfirmAccept} disabled={isRefining}>
            Accept ✓
          </button>
        </div>
      </div>
    {/if}
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
  
  .btn-primary:disabled,
  .btn-secondary:disabled {
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

  /* ── Confirmation Phase ── */
  .confirmation-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    background: var(--color-bg-card);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
  }

  .confirm-progress {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .confirm-step-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .confirm-progress-bar {
    height: 4px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .confirm-progress-fill {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.3s ease;
  }

  .confirm-selector-info {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .confirm-selector-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .confirm-selector-value {
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    background: var(--color-bg-main);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    word-break: break-all;
  }

  .confirm-match-info {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .confirm-match-count {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-success, #22c55e);
    background: rgba(34, 197, 94, 0.1);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .confirm-sample-text {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .confirm-not-detected {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .confirm-actions {
    display: flex;
    gap: var(--spacing-2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .btn-primary.small, .btn-secondary.small {
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
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
