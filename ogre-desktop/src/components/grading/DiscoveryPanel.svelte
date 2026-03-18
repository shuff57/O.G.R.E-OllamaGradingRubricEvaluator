<script lang="ts">
  /**
   * DiscoveryPanel — Orchestrator for AI-powered page structure discovery.
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
  import { getEmbeddedUrl, hideWebview, showWebview, getActiveTabId } from '../../lib/browser';

  import {
    type IntentMode,
    type FormModeInput,
    type ExampleSelection,
    createChatDiscoveryState,
    runChatDiscovery,
    intentToDiscoveryHints,
  } from '../../lib/discovery-intent';
  import { getSkillsWithUrlPattern } from '../../lib/db';
  import { findMatchingProfiles } from '../../lib/skills-api';
  import { selectBestProfile } from '../../lib/profile-precedence';
  import { convertProfileToJSON } from '../../lib/profile-json-converter';
  import {
    testProfile,
    type ProfileTestReport
  } from '../../lib/profile-tester';
  import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
  import { getHandshakeToken } from '../../lib/provider-sync';
  import { parseSkillMarkdown } from '../../lib/skill-parser';
  import { saveSkill } from '../../lib/db';
  import { captureInteractiveDom } from '../../lib/agent-dom';
  import type { ExtractionConfig } from '../../lib/site-profiles';
  import ExtractionConfigPanel from './ExtractionConfigPanel.svelte';

  import DiscoveryProgress from './DiscoveryProgress.svelte';
  import DiscoveryResults from './DiscoveryResults.svelte';
  import DiscoveryConfirmation from './DiscoveryConfirmation.svelte';
  import DiscoverySaveDialog from './DiscoverySaveDialog.svelte';
  import DiscoveryGuidePreview from './DiscoveryGuidePreview.svelte';
  import DiscoveryModeSelector from './DiscoveryModeSelector.svelte';
  import DiscoveryGuideStatus from './DiscoveryGuideStatus.svelte';
  import DiscoveryChat from './DiscoveryChat.svelte';
  import { highlightSelector, SELECTOR_LABELS } from '../../lib/discovery-ui';

  const SERVER_BASE = 'http://localhost:3456';

  type TauriResponseWithData = { data: unknown; status?: number };
  function getResponseData(response: unknown): unknown {
    return (response as TauriResponseWithData).data;
  }

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

  // Mode & Intent State
  let mode = $state<IntentMode>('form');
  let formInput = $state<FormModeInput>({
    hasStudentNames: true,
    hasScoreInputs: true,
    hasFeedbackFields: true
  });
  let chatState = $state(createChatDiscoveryState());
  let exampleSelections = $state<ExampleSelection[]>([]);

  // Test Results State
  let testReport = $state<ProfileTestReport | null>(null);
  let isTesting = $state(false);

  // Extraction Config State
  let extractionConfig = $state<ExtractionConfig | null>(null);

  let discoveryResult = $state<DiscoveryResult | null>(null);
  let validationResults = $state<ValidationResults | null>(null);
  let screenshot = $state('');

  // Save dialog state
  let showSaveDialog = $state(false);
  let profileName = $state('');
  let saveStatus = $state('');

  // Guide generation preview state
  let showGuidePreview = $state(false);
  let isGeneratingGuide = $state(false);
  let generatedGuideMarkdown = $state('');
  let isSavingGuide = $state(false);

  // Confirmation flow state
  let confirmationFlow = $state<ConfirmationFlow | null>(null);
  let isRefining = $state(false);

  // Stale-data warning state
  let staleWarning = $state(false);
  let lastDiscoveryUrl = $state('');

  // ── Effects ───────────────────────────────────────────────────────────

  $effect(() => {
    if (!pageLoadedUrl) return;
    if (lastDiscoveryUrl && pageLoadedUrl !== lastDiscoveryUrl) {
      staleWarning = true;
    }
  });

  $effect(() => {
    if (refreshKey > 0) staleWarning = false;
  });

  $effect(() => {
    if (staleWarning) {
      showGuidePreview = false;
      isGeneratingGuide = false;
      generatedGuideMarkdown = '';
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
    testReport = null;

    try {
      const intentHints = intentToDiscoveryHints(mode, mode === 'form' ? formInput : mode === 'train' ? chatState.messages : exampleSelections);

      // Check for existing knowledge profile to use as hints
      let knownSelectors: Record<string, string> | undefined;
      let pageDescription: string | undefined;
      try {
        const allWithPattern = await getSkillsWithUrlPattern();
        const matches = findMatchingProfiles(pageLoadedUrl || '', allWithPattern);
        const best = selectBestProfile(matches);
        if (best) {
          const guide = convertProfileToJSON(best.content);
          if (Object.keys(guide.selectors).length > 0) {
            knownSelectors = guide.selectors;
          }
          if (guide.site) {
            pageDescription = guide.site;
          }
        }
      } catch {
        // If lookup fails, discovery proceeds without hints
      }

      const hints = {
        ...intentHints,
        ...(knownSelectors ? { knownSelectors } : {}),
        ...(pageDescription ? { pageDescription } : {})
      };

      const workflow = await runDiscovery({
        provider: provider || undefined,
        model: model || undefined,
        hints,
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
      lastDiscoveryUrl = pageLoadedUrl;
      staleWarning = false;
      profileName = 'New Grading Profile';
    } catch (err) {
      phase = 'error';
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleChatSubmit() {
    try {
      const mockResponse = "I understand. I'll look for that structure.";
      chatState = await runChatDiscovery(chatState, chatState.messages[chatState.messages.length - 1].content, async () => mockResponse);
    } catch (e) {
      error = "Chat failed: " + e;
    }
  }

  async function runTest() {
    if (!discoveryResult) return;
    isTesting = true;
    try {
      const profile = discoveryResultToSiteProfile(discoveryResult, extractionConfig || undefined, { name: 'Test Profile', urlPatterns: [pageLoadedUrl] });
      testReport = await testProfile(profile, pageLoadedUrl);
    } catch (e) {
      error = "Test failed: " + String(e);
    } finally {
      isTesting = false;
    }
  }

  async function handleStartConfirmation() {
    if (!discoveryResult || !validationResults) return;
    confirmationFlow = createConfirmationFlow(discoveryResult.selectors, validationResults, discoveryResult.navigation.mode);
    phase = 'confirming';
    const state = confirmationFlow.getState();
    if (state?.selector) await highlightSelector(state.selector);
  }

  async function handleRefine(key: keyof SelectorMap) {
    if (!discoveryResult) return;
    const currentSelector = discoveryResult.selectors[key] || '';
    try {
      const pickerResult = await refineSelector(currentSelector);
      const newSelector = mergeSelectorSources(currentSelector, pickerResult);
      const updatedSelectors: SelectorMap = { ...discoveryResult.selectors, [key]: newSelector };
      discoveryResult = { ...discoveryResult, selectors: updatedSelectors, notes: (discoveryResult.notes || '') + `\n[Refined] ${key}: ${newSelector}` };
      if (validationResults) {
        validationResults = { ...validationResults, [key]: { matchCount: 1, sampleText: '(Refined by user)', valid: true } };
      }
    } catch (_err) { /* refine picker failed — keep existing selector */ }
  }

  async function handleConfirmAccept() {
    if (!confirmationFlow) return;
    confirmationFlow.accept();
    if (confirmationFlow.phase === 'complete') {
      await handleConfirmationComplete();
    } else {
      const state = confirmationFlow.getState();
      state?.selector ? await highlightSelector(state.selector) : await clearRefinementHighlights();
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
        nextState?.selector ? await highlightSelector(nextState.selector) : await clearRefinementHighlights();
      }
    } catch {} finally {
      isRefining = false;
    }
  }

  async function handleConfirmBack() {
    if (!confirmationFlow) return;
    confirmationFlow.back();
    const state = confirmationFlow.getState();
    if (state?.selector) await highlightSelector(state.selector);
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
    discoveryResult = { ...discoveryResult, selectors: { ...discoveryResult.selectors, ...confirmedSelectors } };
    await clearRefinementHighlights();
    confirmationFlow = null;
    if (returnToBatch) {
      profileName = 'Discovered Profile';
      await handleSaveProfile();
    } else {
      phase = 'review';
      showSaveDialog = true;
      hideWebview(getActiveTabId()).catch(() => {});
    }
  }

  async function handleSaveProfile() {
    if (!discoveryResult || !profileName.trim()) return;
    phase = 'saving';
    saveStatus = 'Saving...';
    try {
      const storage = new ProfileStorageImpl();
      let currentUrl = 'example.com';
      try { currentUrl = await getEmbeddedUrl(); } catch {}
      let urlPattern = currentUrl;
      try { const u = new URL(currentUrl); urlPattern = u.hostname + u.pathname; } catch {}

      const newProfile = discoveryResultToSiteProfile(discoveryResult, extractionConfig || undefined, {
        name: profileName.trim(),
        urlPatterns: [urlPattern],
      });
      await storage.saveProfile(newProfile);
      saveStatus = 'Saved!';
      phase = 'idle';
      showSaveDialog = false;
      showWebview(getActiveTabId()).catch(() => {});
      onProfileSaved(newProfile);
      setTimeout(() => {
        saveStatus = '';
        discoveryResult = null;
        validationResults = null;
      }, 2000);
    } catch (err) {
      phase = 'review';
      saveStatus = '';
      showSaveDialog = false;
      showWebview(getActiveTabId()).catch(() => {});
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleGenerateGuide() {
    showGuidePreview = true;
    isGeneratingGuide = true;
    hideWebview(getActiveTabId()).catch(() => {});
    generatedGuideMarkdown = '';

    try {
      const pageSnapshot = await captureInteractiveDom();
      const snapshotText = typeof pageSnapshot === 'string'
        ? pageSnapshot
        : JSON.stringify(pageSnapshot);

      const url = pageLoadedUrl || '';
      const existingSelectors = discoveryResult?.selectors || {};
      const token = getHandshakeToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await tauriFetch(`${SERVER_BASE}/api/generate-knowledge-profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pageSnapshot: snapshotText.substring(0, 8000),
          url,
          existingSelectors,
          provider,
          model,
        }),
      });

      const status = (response as TauriResponseWithData).status ?? 500;
      if (status < 200 || status >= 300) {
        throw new Error(`Generation failed: ${status}`);
      }

      const raw = getResponseData(response);
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw as { markdown?: string };
      generatedGuideMarkdown = data.markdown || '';
    } catch (e) {
      generatedGuideMarkdown = '';
      error = e instanceof Error ? e.message : 'Guide generation failed';
      showGuidePreview = false;
    } finally {
      isGeneratingGuide = false;
    }
  }

  async function handleSaveGuide() {
    if (!generatedGuideMarkdown) return;
    isSavingGuide = true;
    try {
      const parsed = parseSkillMarkdown(generatedGuideMarkdown);
      await saveSkill({
        name: parsed.name || `Site Guide — ${pageLoadedUrl || 'Unknown'}`,
        description: parsed.description || '',
        content: generatedGuideMarkdown,
        source: 'site-profile',
        source_id: pageLoadedUrl || null,
        is_active: 0,
        url_pattern: parsed.urlPatterns?.[0] || pageLoadedUrl || null,
      });
      showGuidePreview = false;
      generatedGuideMarkdown = '';
      showWebview(getActiveTabId()).catch(() => {});
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save guide';
    } finally {
      isSavingGuide = false;
    }
  }
</script>

<section class="discovery-panel">
  <DiscoveryGuideStatus {pageLoadedUrl} />

  <div class="header">
    <h3>Discovery</h3>
    <p class="description">Automatically detect grading elements on this page using AI.</p>
  </div>

  <DiscoveryModeSelector bind:mode />

  {#if phase === 'idle' || phase === 'error'}
    <div class="mode-content">
      {#if mode === 'form'}
        <div class="form-mode-inputs">
          <label class="checkbox"><input type="checkbox" bind:checked={formInput.hasStudentNames}> Student Names Visible</label>
          <label class="checkbox"><input type="checkbox" bind:checked={formInput.hasScoreInputs}> Score Inputs Present</label>
          <label class="checkbox"><input type="checkbox" bind:checked={formInput.hasFeedbackFields}> Feedback Fields Present</label>
          <div class="input-group">
            <label for="estimated-students">Estimated Students</label>
            <input id="estimated-students" type="number" bind:value={formInput.estimatedStudentCount} placeholder="e.g. 25">
          </div>
        </div>
      {:else if mode === 'train'}
        <DiscoveryChat bind:chatState onChatSubmit={handleChatSubmit} />
      {:else if mode === 'example'}
        <div class="example-mode-ui"><p>Click elements on the page to teach the AI (Coming Soon)</p></div>
      {/if}
    </div>
  {/if}

  {#if staleWarning}
    <div class="stale-warning">
      <small>⚠ Page has changed — discovery results and site guide may be outdated.</small>
      <button class="btn-link" onclick={() => { staleWarning = false; }}>Dismiss</button>
    </div>
  {/if}

  {#if phase === 'idle' || phase === 'error'}
    <button class="btn-primary full-width" onclick={handleStartDiscovery}>Discover Selectors</button>
  {/if}

  {#if phase === 'running'}
    <DiscoveryProgress {progressMessage} {progressPercent} />
  {/if}

  {#if (phase === 'review' || phase === 'saving') && discoveryResult}
    {#if discoveryResult}
      <div class="post-discovery-tools">
        {#if discoveryResult.heuristicMatch}
          <div class="engine-badge heuristic">⚡ Detected automatically: {discoveryResult.heuristicMatch.patternName}</div>
        {:else}
          <div class="engine-badge ai">
            🤖 Analyzed by AI
            {#if discoveryResult.snapshotMetadata}
              <span class="meta">({discoveryResult.snapshotMetadata.nodesIncluded}/{discoveryResult.snapshotMetadata.totalVisited} nodes)</span>
            {/if}
          </div>
        {/if}

        <div class="test-section">
          <button class="btn-secondary full-width" onclick={runTest} disabled={isTesting}>{isTesting ? 'Testing...' : 'Test Selectors'}</button>
          {#if testReport}
            <div class="test-report {testReport.passed ? 'pass' : 'fail'}">
              <div class="report-header">
                <strong>{testReport.passed ? '✅ Passed' : '❌ Failed'}</strong>
                <span>{testReport.selectorsFound}/{testReport.selectorResults.length} found</span>
              </div>
            </div>
          {/if}
        </div>

        <ExtractionConfigPanel config={extractionConfig} onOverride={(c) => extractionConfig = c} />
      </div>
    {/if}

    <DiscoveryResults
      {discoveryResult}
      {validationResults}
      {returnToBatch}
      onRefine={handleRefine}
      onConfirm={handleStartConfirmation}
      onSave={() => { showSaveDialog = true; hideWebview(getActiveTabId()).catch(() => {}); }}
      onDiscard={() => { phase = 'idle'; }}
    />

    <button
      class="btn-secondary full-width"
      onclick={handleGenerateGuide}
      disabled={!provider || !model || isGeneratingGuide || isSavingGuide}
      title={!provider || !model ? 'Configure AI provider first' : 'Generate a knowledge profile for this site'}
    >
      📖 Generate Site Guide
    </button>
  {/if}

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

  <DiscoverySaveDialog
    isOpen={showSaveDialog}
    bind:profileName
    isSaving={phase === 'saving'}
    onSave={handleSaveProfile}
    onCancel={() => { showSaveDialog = false; showWebview(getActiveTabId()).catch(() => {}); }}
  />

  <DiscoveryGuidePreview
    isOpen={showGuidePreview}
    isGenerating={isGeneratingGuide}
    generatedMarkdown={generatedGuideMarkdown}
    isSaving={isSavingGuide}
    onSave={handleSaveGuide}
    onDiscard={() => {
      showGuidePreview = false;
      generatedGuideMarkdown = '';
      showWebview(getActiveTabId()).catch(() => {});
    }}
  />

  {#if error}
    <div class="error-banner"><span class="error-icon">⚠️</span> <span class="error-text">{error}</span></div>
  {/if}
</section>

<style>
  .discovery-panel { display: flex; flex-direction: column; gap: var(--spacing-2); padding: var(--spacing-2); }
  .header h3 { margin: 0; font-size: 1rem; color: var(--color-text-primary); }
  .description { margin: 0; font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.3; }
  .mode-content { background: var(--color-bg-main); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-2); }
  .form-mode-inputs { display: flex; flex-direction: column; gap: var(--spacing-1); }
  .checkbox { display: flex; align-items: center; gap: var(--spacing-2); font-size: 0.85rem; color: var(--color-text-primary); white-space: nowrap; }
  .checkbox input[type="checkbox"] { width: auto; margin: 0; flex-shrink: 0; }
  .input-group { display: flex; flex-direction: column; gap: 2px; }
  .input-group label { font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 0; }
  .input-group input { padding: 5px 6px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
  .engine-badge { font-size: 0.85rem; padding: 4px 8px; border-radius: var(--radius-sm); margin-bottom: var(--spacing-2); display: flex; align-items: center; gap: 6px; }
  .engine-badge.heuristic { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
  .engine-badge.ai { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
  .meta { opacity: 0.7; font-size: 0.8em; }
  .test-section { margin: var(--spacing-3) 0; }
  .test-report { margin-top: var(--spacing-2); padding: 8px; border-radius: var(--radius-sm); font-size: 0.9rem; }
  .test-report.pass { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .test-report.fail { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .report-header { display: flex; justify-content: space-between; }
  .stale-warning { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; margin-bottom: 8px; color: #92400e; }
  .btn-link { background: transparent; border: none; color: #92400e; cursor: pointer; font-size: 0.85rem; text-decoration: underline; padding: 0; }
  .btn-primary { padding: var(--spacing-2) var(--spacing-3); border-radius: var(--radius-md); font-weight: 500; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; background: var(--color-primary); color: white; border: none; }
  .btn-primary:hover { background: var(--color-primary-dark); }
  .btn-secondary { padding: var(--spacing-2) var(--spacing-3); border-radius: var(--radius-md); font-weight: 500; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-primary); }
  .btn-secondary:hover { background: var(--color-bg-secondary); }
  .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .full-width { width: 100%; }
  .error-banner { display: flex; align-items: center; gap: var(--spacing-2); padding: var(--spacing-2); background: var(--color-error-bg); border: 1px solid var(--color-error-border); border-radius: var(--radius-md); color: var(--color-error); font-size: 0.85rem; }
</style>
