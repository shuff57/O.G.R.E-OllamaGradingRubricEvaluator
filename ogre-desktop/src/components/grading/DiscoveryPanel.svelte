<script lang="ts">
  /**
   * DiscoveryPanel — Orchestrator for AI-powered page structure discovery.
   *
   * Coordinates four focused sub-components:
   *   DiscoveryProgress     — progress bar during AI analysis
   *   DiscoveryResults      — selector list with validation icons
   *   DiscoveryConfirmation — step-by-step selector confirmation
   *   DiscoverySaveDialog   — modal for saving a profile
   *
   * All business logic (discovery, confirmation, save) lives here;
   * sub-components are purely presentational.
   */
  import {
    runDiscovery,
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
    type ConfirmationFlow,
  } from '../../lib/confirmation-flow';
  import { ProfileStorageImpl, type SiteProfile } from '../../lib/site-profiles';
  import { discoveryResultToSiteProfile } from '../../lib/type-mappers';
  import { getEmbeddedUrl, evalScript } from '../../lib/browser';

  import DiscoveryProgress from './DiscoveryProgress.svelte';
  import DiscoveryResults from './DiscoveryResults.svelte';
  import DiscoveryConfirmation from './DiscoveryConfirmation.svelte';
  import DiscoverySaveDialog from './DiscoverySaveDialog.svelte';

  // Props
  let {
    provider = '',
    model = '',
    returnToBatch = false,
    pageLoadedUrl = '',
    refreshKey = 0,
    onProfileSaved = () => {},
  } = $props<{
    provider?: string;
    model?: string;
    returnToBatch?: boolean;
    pageLoadedUrl?: string;
    refreshKey?: number;
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

  // Stale-data warning state
  let staleWarning = $state(false);
  let lastDiscoveryUrl = $state('');

  // Friendly labels for selector keys (passed to DiscoveryConfirmation)
  const SELECTOR_LABELS: Record<string, string> = {
    studentSection: 'Student Section',
    studentName: 'Student Name',
    scoreInput: 'Score Input',
    feedbackBox: 'Feedback Area',
    feedbackHidden: 'Feedback Hidden Input',
    questionRegion: 'Question Region',
    fullCreditLink: 'Full Credit Link',
  };

  // ── Effects ───────────────────────────────────────────────────────────

  $effect(() => {
    const url = pageLoadedUrl;
    if (!url) return;
    if (lastDiscoveryUrl && url !== lastDiscoveryUrl) {
      staleWarning = true;
    }
  });

  $effect(() => {
    if (refreshKey > 0) {
      staleWarning = false;
    }
  });

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

      // Update stale-data tracking
      lastDiscoveryUrl = pageLoadedUrl;
      staleWarning = false;

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

      // Get current embedded URL for the pattern
      let currentUrl = '';
      try {
        currentUrl = await getEmbeddedUrl();
      } catch (e) {
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

      const newProfile = discoveryResultToSiteProfile(discoveryResult, undefined, {
        name: profileName.trim(),
        urlPatterns: [urlPattern],
      });

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
</script>

<section class="discovery-panel">
  <!-- ── Header & Intro ── -->
  <div class="header">
    <h3>Discovery</h3>
    <p class="description">
      Automatically detect grading elements on this page using AI.
    </p>
  </div>

  <!-- Mode selector placeholder — will be wired in Wave 4 -->
  <div class="mode-selector-placeholder">
    <button class="mode-btn active" disabled>🔍 AI Discover</button>
    <button class="mode-btn" disabled>📝 Guided Form</button>
    <button class="mode-btn" disabled>💬 Chat</button>
    <button class="mode-btn" disabled>🎯 Teach by Example</button>
  </div>

  <!-- ── Stale Data Warning ── -->
  {#if staleWarning}
    <div class="stale-warning">
      <small>⚠ Page has changed — discovery results may be outdated.</small>
      <button class="btn-link" onclick={() => { staleWarning = false; }}>Dismiss</button>
    </div>
  {/if}

  <!-- ── Main Action ── -->
  {#if phase === 'idle' || phase === 'error'}
    <button class="btn-primary full-width" onclick={handleStartDiscovery}>
      Discover Selectors
    </button>
  {/if}

  <!-- ── Progress ── -->
  {#if phase === 'running'}
    <DiscoveryProgress {progressMessage} {progressPercent} />
  {/if}

  <!-- ── Results Review ── -->
  {#if (phase === 'review' || phase === 'saving') && discoveryResult}
    <DiscoveryResults
      {discoveryResult}
      {validationResults}
      {returnToBatch}
      onRefine={handleRefine}
      onConfirm={handleStartConfirmation}
      onSave={() => { showSaveDialog = true; }}
      onDiscard={() => { phase = 'idle'; }}
    />
  {/if}

  <!-- ── Confirmation Phase ── -->
  {#if phase === 'confirming' && confirmationFlow}
    <DiscoveryConfirmation
      {confirmationFlow}
      {isRefining}
      selectorLabels={SELECTOR_LABELS}
      onAccept={handleConfirmAccept}
      onRefine={handleConfirmRefine}
      onBack={handleConfirmBack}
      onCancel={handleConfirmCancel}
    />
  {/if}

  <!-- ── Save Dialog ── -->
  <DiscoverySaveDialog
    isOpen={showSaveDialog}
    bind:profileName
    isSaving={phase === 'saving'}
    onSave={handleSaveProfile}
    onCancel={() => { showSaveDialog = false; }}
  />

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

  /* ── Mode Selector Placeholder ── */
  .mode-selector-placeholder {
    display: flex;
    gap: 2px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    padding: 2px;
  }

  .mode-btn {
    flex: 1;
    padding: 6px 4px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.72rem;
    cursor: not-allowed;
    opacity: 0.6;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .mode-btn.active {
    background: var(--color-bg-card);
    color: var(--color-text-primary);
    opacity: 1;
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* ── Stale Warning ── */
  .stale-warning {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 4px;
    margin-bottom: 8px;
    color: #92400e;
  }

  .btn-link {
    background: transparent;
    border: none;
    color: #92400e;
    cursor: pointer;
    font-size: 0.85rem;
    text-decoration: underline;
    padding: 0;
  }

  .btn-link:hover {
    opacity: 0.8;
  }

  /* ── Buttons ── */
  .btn-primary {
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
    background: var(--color-primary);
    color: white;
    border: none;
  }

  .btn-primary:hover {
    background: var(--color-primary-dark);
  }

  .full-width {
    width: 100%;
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
