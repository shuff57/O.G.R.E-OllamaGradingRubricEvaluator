<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ProviderSelector from '../components/grading/ProviderSelector.svelte';
  import RubricCard from '../components/grading/RubricCard.svelte';
  import AgentChat from '../components/grading/AgentChat.svelte';
  import BatchPanel from '../components/grading/batch/BatchPanel.svelte';
  import BatchResults from '../components/grading/batch/BatchResults.svelte';
  import OutlierReport from '../components/grading/batch/OutlierReport.svelte';
  import type { BatchStudentResult } from '../lib/grading-api';
  import DiscoveryPanel from '../components/grading/DiscoveryPanel.svelte';
  import { getSetting, setSetting } from '../lib/db';
  import type { SavedRubric } from '../lib/rubric-api';
  import type { Rubric, SiteProfile } from '../lib/batch-grader';
  import { DEFAULT_MYOPENMATH_PROFILE, BUILT_IN_PROFILES } from '../lib/batch-grader';
  import { ProfileStorageImpl } from '../lib/site-profiles';
  import { ICON_STRIP_WIDTH } from '../lib/constants';
  import { createDebouncedRefresh, refreshPageData } from '../lib/page-refresh';

  let batchPanelRef = $state<BatchPanel>();

  let {
    isCollapsed = $bindable(false),
    width = $bindable(400),
    pageLoadedUrl = '',
  }: {
    isCollapsed?: boolean;
    width?: number;
    pageLoadedUrl?: string;
  } = $props();

  let activeMode = $state('grader'); // 'grader' | 'agent' | 'discovery'
  let graderSubMode = $state('batch'); // 'single' | 'batch'
  let singleStudentName = $state('');
  let batchRunning = $state(false);
  let refreshKey = $state(0);
  let isRefreshing = $state(false);

  // Debounced handler for auto-detection: prevents rapid browser-page-loaded events from
  // triggering multiple refreshes in quick succession (300ms debounce)
  const debouncedPageRefresh = createDebouncedRefresh(() => {
    refreshKey++;
  }, 300);

  $effect(() => {
    if (!pageLoadedUrl) return; // ignore initial empty value
    debouncedPageRefresh(pageLoadedUrl);
  });

  // Shared state: provider/model selection flows from ProviderSelector → child components
  let activeProvider = $state('ollama-local');
  let activeModel = $state('');

  // Rubric state — lifted here so RubricCard and BatchPanel share it
  let selectedRubric = $state<SavedRubric | null>(null);
  let rubricText = $state('');
  let rubricMaxScore = $state('10');
  let extractedRubric = $state<Rubric | null>(null);
  let sourceRubricId = $state<string | null>(null);
  let batchPhase = $state<'idle' | 'extracting' | 'review' | 'grading' | 'done'>('idle');
  let outlierReport = $state<BatchStudentResult[]>([]);
  let isResweepInFlight = $state(false);
  let essayPrompt = $state('');
  let leniency = $state(50);
  let originalRubricText = $state('');
  let isRubricRewriting = $state(false);
  let weightsValid = $state(true);
  let weightMode = $state<'category' | 'criterion'>('category');

  // Anchor state — lifted for RubricCard in batch mode
  let anchorText = $state('');
  let anchorGenerating = $state(false);
  let batchGraderHasStudents = $state(false);
  let isBatchPaused = $state(false);
  let savedSessionStudent = $state<string | null>(null);
  let batchProfileWarning = $state('');

  let returnToBatch = $state(false);
  let preselectedProfileId = $state<string | null>(null);

  // ── Global site profile state ────────────────────────────────────────────
  let globalActiveProfile = $state<SiteProfile>(DEFAULT_MYOPENMATH_PROFILE);
  let globalAllProfiles = $state<SiteProfile[]>([...BUILT_IN_PROFILES]);
  let globalSelectedProfileId = $state('auto');
  let globalDetectedProfile = $state<SiteProfile | null>(null);
  let globalProfileWarning = $state('');

  let globalComputedProfile = $derived<SiteProfile>(
    globalSelectedProfileId === 'auto'
      ? (globalDetectedProfile ?? DEFAULT_MYOPENMATH_PROFILE)
      : globalAllProfiles.find(p => p.id === globalSelectedProfileId) ?? DEFAULT_MYOPENMATH_PROFILE
  );

  $effect(() => { globalActiveProfile = globalComputedProfile; });

  async function detectGlobalProfile(url: string) {
    if (!url) {
      globalDetectedProfile = null;
      globalProfileWarning = '';
      return;
    }
    try {
      const result = await refreshPageData(url);
      globalDetectedProfile = result.detectedProfile;
      globalProfileWarning = result.detectedProfile ? '' : '⚠ No profile found for this page.';
    } catch {
      globalDetectedProfile = null;
      globalProfileWarning = '';
    }
  }

  // Re-detect whenever the page URL changes (debounced via refreshKey)
  $effect(() => {
    const url = pageLoadedUrl;
    if (url) detectGlobalProfile(url);
  });

  /** Switch to Discover tab; return to batch mode when done. */
  function onRequestDiscovery(profileId?: string) {
    returnToBatch = true;
    preselectedProfileId = profileId ?? null;
    activeMode = 'discovery';
    if (isCollapsed) isCollapsed = false;
  }

  const MODES = [
    { id: 'grader', label: 'Grader', icon: '📝' },
    { id: 'agent', label: 'Agent', icon: '🤖' },
    { id: 'discovery', label: 'Discover', icon: '🔍' },
  ];

  function toggleCollapse() {
    if (isResizing) return; // Prevent collapse during active drag
    isCollapsed = !isCollapsed;
  }

  function handleManualRefresh() {
    isRefreshing = true;
    refreshKey++;
    setTimeout(() => { isRefreshing = false; }, 800);
  }

  function setMode(modeId: string) {
    if (batchRunning) return; // Prevent mode switching during batch grading
    activeMode = modeId;
    if (isCollapsed) isCollapsed = false; // Expand when clicking a mode icon while collapsed
  }



  // Keyboard shortcuts (Ctrl+B to toggle, Esc to collapse)
  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      if (event.key !== 'Escape') return;
    }

    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
        case 'B':
          event.preventDefault();
          toggleCollapse();
          break;
      }
    } else if (event.key === 'Escape') {
      if (!isCollapsed) {
        event.preventDefault();
        isCollapsed = true;
      }
    }
  }

  // Resize logic
  let isResizing = $state(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  
  // Non-reactive — intentionally plain let, NOT $state()
  let rafId: number | undefined;
  let pendingWidth: number = 0;

  function handleResizeStart(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = width;
    
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  function handleResizeKeydown(e: KeyboardEvent) {
    const RESIZE_INCREMENT = 20; // pixels to adjust per keypress
    
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const newWidth = Math.min(width + RESIZE_INCREMENT, window.innerWidth * 0.8);
      width = newWidth; // Browser.svelte will auto-save via debounced reactive statement
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const newWidth = Math.max(width - RESIZE_INCREMENT, 360);
      width = newWidth;
    } else if (e.key === 'Home') {
      e.preventDefault();
      width = 360; // minimum width
    } else if (e.key === 'End') {
      e.preventDefault();
      width = window.innerWidth * 0.8; // maximum width
    }
  }

  function handleResizeMove(e: MouseEvent) {
    if (!isResizing) return;
    
    // Calculate new width based on mouse position relative to right edge
    let newWidth = window.innerWidth - e.clientX;
    
    // Apply constraints
    const minWidth = 360;
    const maxWidth = window.innerWidth * 0.8;
    
    // Store pending width (non-reactive, no Svelte update yet)
    pendingWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
    
    // Schedule RAF update — only one pending at a time
    if (rafId === undefined) {
      rafId = requestAnimationFrame(() => {
        width = pendingWidth;
        rafId = undefined;
      });
    }
  }

  function handleResizeEnd() {
    isResizing = false;
    // Cancel any pending RAF and flush final width immediately
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
      width = pendingWidth; // Apply final position
    }
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);
    // Load all profiles (built-in + user-saved) for the global selector
    new ProfileStorageImpl().listProfiles().then(profiles => {
      globalAllProfiles = profiles;
    }).catch(() => {
      globalAllProfiles = [...BUILT_IN_PROFILES];
    });
    // Restore saved default leniency
    try {
      const saved = await getSetting('default_leniency');
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= 100) leniency = val;
      }
    } catch {}
  });

  // Persist leniency changes as the new default
  $effect(() => {
    const val = leniency;
    setSetting('default_leniency', String(val)).catch(() => {});
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (isResizing) {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
    }
  });
</script>

<div class="grading-panel" class:collapsed={isCollapsed} class:resizing={isResizing} style="width: {isCollapsed ? ICON_STRIP_WIDTH : width}px">
  <!-- Resize Handle -->
  {#if !isCollapsed}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div 
      class="resize-handle"
      role="separator" 
      aria-orientation="vertical"
      aria-label="Resize panel (use arrow keys, Home, or End; drag with mouse)"
      aria-valuenow={width}
      aria-valuemin={360}
      aria-valuemax={Math.floor(typeof window !== 'undefined' ? window.innerWidth * 0.8 : 800)}
      tabindex="0"
      onmousedown={handleResizeStart}
      onkeydown={handleResizeKeydown}
    ></div>
  {/if}

  <!-- Header -->
  <div class="panel-header">
    {#if !isCollapsed}
      <h2 class="panel-title">AI Grading</h2>
      <button 
        class="icon-btn toggle-btn refresh-btn" 
        class:spinning={isRefreshing}
        onclick={handleManualRefresh}
        title="Refresh page data"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
    {/if}
    <button class="icon-btn toggle-btn" onclick={toggleCollapse} title={isCollapsed ? "Expand Panel (Ctrl+B)" : "Collapse Panel (Ctrl+B / Esc)"}>
      {#if isCollapsed}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      {/if}
    </button>
  </div>

  <!-- Global Site Profile Row -->
  {#if !isCollapsed}
    <div class="global-profile-row">
      {#if globalComputedProfile}
        <span class="global-profile-label" title="Site Profile">🗂</span>
        <select
          class="global-profile-select"
          bind:value={globalSelectedProfileId}
          disabled={batchRunning}
        >
          <option value="auto">Auto-detect</option>
          {#each globalAllProfiles as profile (profile.id)}
            <option value={profile.id}>{profile.name}{profile.isBuiltIn ? ' ✦' : ''}</option>
          {/each}
        </select>
        {#if globalProfileWarning}
          <button
            class="btn-discover-global"
            onclick={() => onRequestDiscovery()}
            title={globalProfileWarning}
          >Discover</button>
        {:else}
          <span class="global-profile-name" title="Active profile: {globalComputedProfile.name}">
            {globalComputedProfile.name}
          </span>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Mode Tabs -->
  <div class="mode-tabs">
    {#each MODES as mode}
      <button 
        class="mode-tab" 
        class:active={activeMode === mode.id}
        class:disabled={batchRunning && activeMode !== mode.id}
        onclick={() => setMode(mode.id)}
        disabled={batchRunning && activeMode !== mode.id}
        title={batchRunning && activeMode !== mode.id ? 'Disabled during batch grading' : mode.label}
      >
        <span class="mode-icon">{mode.icon}</span>
        {#if !isCollapsed}
          <span class="mode-label">{mode.label}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if !isCollapsed}
    <div class="panel-content">
      {#if activeMode === 'grader'}
        <label class="single-mode-toggle" class:disabled={batchRunning}>
          <input
            type="checkbox"
            checked={graderSubMode === 'single'}
            onchange={(e) => { if (!batchRunning) graderSubMode = e.currentTarget.checked ? 'single' : 'batch'; }}
            disabled={batchRunning}
          />
          Single student mode
        </label>
        {#if graderSubMode === 'single'}
          <input
            type="text"
            class="student-name-input"
            placeholder="Student name"
            bind:value={singleStudentName}
            disabled={batchRunning || batchPhase !== 'idle'}
          />
        {/if}
        <ProviderSelector bind:provider={activeProvider} bind:model={activeModel} />
        <BatchPanel
          bind:this={batchPanelRef}
          provider={activeProvider}
          model={activeModel}
          bind:isBatchRunning={batchRunning}
          {pageLoadedUrl}
          {refreshKey}
          {selectedRubric}
          {onRequestDiscovery}
          externalProfile={globalActiveProfile}
          {leniency}
          isRubricRewriting={isRubricRewriting}
          {weightsValid}
          {weightMode}
          singleStudentName={graderSubMode === 'single' ? singleStudentName : ''}
          bind:originalRubricText
          bind:rubricText
          bind:rubricMaxScore
          bind:extractedRubric
          bind:sourceRubricId
          bind:batchPhase
          bind:essayPrompt
          bind:anchorText
          bind:anchorGenerating
          bind:batchGraderHasStudents
          bind:isBatchPaused
          bind:savedSessionStudent
          bind:profileWarning={batchProfileWarning}
          bind:outlierReport
          bind:isResweepInFlight
        />
        {#if batchPhase !== 'idle'}
          <RubricCard
            bind:selectedRubric
            bind:rubricText
            bind:rubricMaxScore
            bind:sourceRubricId
            bind:leniency
            bind:originalRubricText
            bind:isRewriting={isRubricRewriting}
            bind:weightsValid
            bind:weightMode
            {extractedRubric}
            fallbackText={essayPrompt}
            provider={activeProvider}
            model={activeModel}
            phase={batchPhase}
            showActions={true}
            showTable={true}
            bind:anchorText
            {anchorGenerating}
            {batchGraderHasStudents}
            onGenerateAnchors={() => batchPanelRef?.handleGenerateAnchors()}
          />
        {/if}
      {/if}
      {#if activeMode === 'agent'}
        <AgentChat {pageLoadedUrl} />
      {/if}
      {#if activeMode === 'discovery'}
        <ProviderSelector bind:provider={activeProvider} bind:model={activeModel} />
        <DiscoveryPanel
          provider={activeProvider}
          model={activeModel}
          returnToBatch={returnToBatch}
          pageLoadedUrl={pageLoadedUrl}
          refreshKey={refreshKey}
          onProfileSaved={() => {
            if (returnToBatch) {
              activeMode = 'grader';
              graderSubMode = 'batch';
              returnToBatch = false;
            }
          }}
        />
      {/if}
    </div>
    {#if activeMode === 'grader'}
      {#if batchPhase === 'done' && outlierReport.length > 0}
        <OutlierReport
          entries={outlierReport}
          maxScore={parseFloat(rubricMaxScore) || 10}
          onDismiss={() => { outlierReport = []; }}
          onAccept={(entry) => batchPanelRef?.acceptReviewEntry(entry)}
          onRevert={(entry) => batchPanelRef?.revertOutlier(entry)}
          onResweep={() => batchPanelRef?.handleResweep()}
          {isResweepInFlight}
        />
      {/if}
      <BatchResults
        {batchPhase}
        isBatchRunning={batchRunning}
        {isBatchPaused}
        {savedSessionStudent}
        profileWarning={batchProfileWarning}
        {batchGraderHasStudents}
        disableStart={graderSubMode === 'single' && !singleStudentName.trim()}
        disabledReason={graderSubMode === 'single' && !singleStudentName.trim() ? 'Enter a student name first' : ''}
        startLabel={graderSubMode === 'single' ? 'Grade Student' : 'Start Batch'}
        onExtract={() => batchPanelRef?.handleExtract()}
        onContinueGrading={() => batchPanelRef?.handleContinueGrading()}
        onPauseBatch={() => batchPanelRef?.handlePauseBatch()}
        onStopBatch={() => batchPanelRef?.handleStopBatch()}
        onCancelBatch={() => batchPanelRef?.handleCancelBatch()}
        onReset={() => batchPanelRef?.handleReset()}
        onRequestDiscovery={() => onRequestDiscovery()}
      />
    {/if}
  {/if}
</div>

<style>
  /*
   * Z-Index Hierarchy:
   * - .resize-handle: 100 (above panel content, scoped within GradingPanel)
   */
  .grading-panel {
    position: relative;
    height: 100%;
    background-color: var(--color-bg-sidebar);
    border-left: 1px solid var(--color-border);
    box-shadow: -4px 0 20px rgba(0,0,0,0.3);
    display: flex; flex-direction: column;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden; flex-shrink: 0;
  }
  .grading-panel.resizing {
    transition: none !important;
  }
  .panel-header {
    height: var(--header-height, 64px);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 var(--spacing-4);
    border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  }
  .panel-title {
    font-size: 1.1rem; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .toggle-btn {
    background: transparent; border: none;
    color: var(--color-text-secondary); cursor: pointer;
    padding: var(--spacing-2); border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
  }
  .toggle-btn:hover {
    background-color: var(--color-bg-card-hover); color: var(--color-text-primary);
  }
  .refresh-btn {
    margin-right: auto;
  }
  @keyframes spin-once {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .refresh-btn.spinning svg {
    animation: spin-once 0.8s ease-in-out;
  }
  .mode-tabs {
    display: grid; grid-template-columns: 1fr 1fr 1fr; padding: var(--spacing-2); gap: var(--spacing-1);
    background-color: var(--color-bg-sidebar);
    border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  }
  .grading-panel.collapsed .panel-header {
    justify-content: center;
    padding: 0 var(--spacing-1);
  }
  .grading-panel.collapsed .mode-tabs {
    grid-template-columns: 1fr; padding: var(--spacing-2) var(--spacing-1);
  }
  .mode-tab {
    display: flex; align-items: center; justify-content: center;
    gap: var(--spacing-2); padding: var(--spacing-2);
    background: transparent; border: none; border-radius: var(--radius-md);
    cursor: pointer; color: var(--color-text-secondary);
    font-size: 0.9rem; font-weight: 500; transition: all var(--transition-fast);
  }
  .grading-panel.collapsed .mode-tab { padding: var(--spacing-2); justify-content: center; }
  .grading-panel.collapsed .mode-icon { font-size: 1.2rem; }
  .mode-tab:hover:not(:disabled) { background-color: var(--color-bg-card-hover); color: var(--color-text-primary); }
  .mode-tab.active { background-color: var(--color-primary-bg); color: var(--color-primary); font-weight: 600; }
  .mode-tab.disabled { opacity: 0.4; cursor: not-allowed; }
  .mode-icon { font-size: 1.1rem; }
  .panel-content {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
    padding: var(--spacing-4); gap: var(--spacing-4);
  }
  
  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    width: 6px;
    height: 100%;
    cursor: ew-resize;
    z-index: 100;
    transition: background-color 0.2s;
  }
  
  .resize-handle:hover,
  .resize-handle:active {
    background-color: var(--color-primary-bg);
  }
  
  /* ── Single Student Mode Toggle ── */
  .single-mode-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
    user-select: none;
  }

  .single-mode-toggle.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .student-name-input {
    margin-top: 0.4rem;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--color-border, #ccc);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
    font-size: 0.9rem;
    font-family: var(--font-body);
    width: 100%;
    max-width: 260px;
  }

  .student-name-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  .global-profile-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: 6px var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-sidebar);
    flex-shrink: 0;
    min-height: 36px;
  }

  .global-profile-label {
    font-size: 0.85rem;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .global-profile-select {
    flex: 1;
    min-width: 0;
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-sm);
    padding: 2px var(--spacing-2);
    font-size: 0.8rem;
    font-family: var(--font-body);
  }

  .global-profile-select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .global-profile-name {
    font-size: 0.75rem;
    color: var(--color-success);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90px;
    flex-shrink: 0;
  }

  .btn-discover-global {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-warning);
    background: transparent;
    color: var(--color-warning);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .btn-discover-global:hover {
    background: var(--color-warning-bg);
  }
</style>
