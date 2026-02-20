<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import ScreenshotOverlay from '../components/ScreenshotOverlay.svelte';
  import ProviderSelector from '../components/grading/ProviderSelector.svelte';
  import RubricCard from '../components/grading/RubricCard.svelte';
  import StudentWorkCard from '../components/grading/StudentWorkCard.svelte';
  import SolverChat from '../components/grading/SolverChat.svelte';
  import BatchPanel from '../components/grading/BatchPanel.svelte';
  import DiscoveryPanel from '../components/grading/DiscoveryPanel.svelte';
  import { captureWebviewScreenshot, hideWebview, showWebview } from '../lib/browser';
  import type { SavedRubric } from '../lib/rubric-api';
  import type { GradeRubric } from '../lib/grading-api';
  import { ICON_STRIP_WIDTH } from '../lib/constants';

  let {
    isCollapsed = $bindable(false),
    width = $bindable(400),
  }: {
    isCollapsed?: boolean;
    width?: number;
  } = $props();

  let activeMode = $state('grader'); // 'grader' | 'solver' | 'batch'
  let showScreenshotOverlay = $state(false);
  let batchRunning = $state(false);

  // Screenshot capture state
  let capturedImage = $state('');
  let isCapturing = $state(false);
  let captureError = $state('');
  let screenshots = $state<string[]>([]);

  // Shared state: provider/model selection flows from ProviderSelector → child components
  let activeProvider = $state('ollama-local');
  let activeModel = $state('');

  // Rubric state: flows from RubricCard → StudentWorkCard / BatchPanel
  let selectedRubric = $state<SavedRubric | null>(null);

  /** Convert a SavedRubric (library format) to GradeRubric (grading API format). */
  function toGradeRubric(saved: SavedRubric | null): GradeRubric | undefined {
    if (!saved) return undefined;
    return {
      maxScore: String(saved.maxScore),
      checklistItems: saved.criteria.map(c => ({
        category: c.criteria,
        points: c.points,
        items: c.description ? [c.description] : [],
      })),
    };
  }

  const MODES = [
    { id: 'grader', label: 'Grader', icon: '📝' },
    { id: 'solver', label: 'Solver', icon: '💡' },
    { id: 'batch', label: 'Batch', icon: '⚡' },
    { id: 'discovery', label: 'Discover', icon: '🔍' }
  ];

  function toggleCollapse() {
    if (isResizing) return; // Prevent collapse during active drag
    isCollapsed = !isCollapsed;
  }

  function setMode(modeId: string) {
    if (batchRunning) return; // Prevent mode switching during batch grading
    activeMode = modeId;
    if (isCollapsed) isCollapsed = false; // Expand when clicking a mode icon while collapsed
  }

  /**
   * Screenshot flow:
   *   1. Capture the webview content (while it's still visible)
   *   2. Hide the webview to reveal the selection overlay
   *   3. Show the overlay with the captured image
   *   4. User selects an area → onScreenshotCapture fires
   *   5. Re-show the webview
   */
  async function handleScreenshot() {
    if (isCapturing) return;
    isCapturing = true;
    captureError = '';

    // Save current drawer state so we can restore after capture
    const wasCollapsed = isCollapsed;

    try {
      // Hide drawer and floating button before capture for a clean screenshot
      isCollapsed = true;
      await tick(); // Wait for DOM to reflect hidden state

      capturedImage = await captureWebviewScreenshot();
      await hideWebview();
      showScreenshotOverlay = true;
    } catch (err) {
      captureError = err instanceof Error ? err.message : 'Screenshot capture failed';
      setTimeout(() => { if (captureError) captureError = ''; }, 5000);
    } finally {
      // Restore drawer and floating button visibility
      isCollapsed = wasCollapsed;
      isCapturing = false;
    }
  }

  function handleScreenshotCapture(imageData: string) {
    screenshots = [...screenshots, imageData];
    closeOverlay();
  }

  async function closeOverlay() {
    showScreenshotOverlay = false;
    capturedImage = '';
    try { await showWebview(); } catch { /* webview may already be visible */ }
  }

  function handleRemoveScreenshot(index: number) {
    screenshots = screenshots.filter((_, i) => i !== index);
  }

  // Keyboard shortcuts (Ctrl+B to toggle, Esc to collapse)
  // Note: Ctrl+Enter for assessment is handled by StudentWorkCard
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

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
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
    {/if}
    <button class="icon-btn toggle-btn" onclick={toggleCollapse} title={isCollapsed ? "Expand Panel (Ctrl+B)" : "Collapse Panel (Ctrl+B / Esc)"}>
      {#if isCollapsed}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      {/if}
    </button>
  </div>

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
      {#if activeMode === 'grader' || activeMode === 'batch' || activeMode === 'discovery'}
        <ProviderSelector bind:provider={activeProvider} bind:model={activeModel} />
      {/if}
      
      {#if activeMode === 'grader' || activeMode === 'batch'}
        <RubricCard bind:selectedRubric={selectedRubric} />
      {/if}

      {#if activeMode === 'grader'}
        <StudentWorkCard
          onScreenshot={handleScreenshot}
          provider={activeProvider}
          model={activeModel}
          rubric={toGradeRubric(selectedRubric)}
          {screenshots}
          onRemoveScreenshot={handleRemoveScreenshot}
          {isCapturing}
          {captureError}
        />
      {/if}
      {#if activeMode === 'solver'}
        <SolverChat />
      {/if}
      {#if activeMode === 'batch'}
        <BatchPanel
          provider={activeProvider}
          model={activeModel}
          bind:isBatchRunning={batchRunning}
        />
      {/if}

      {#if activeMode === 'discovery'}
        <DiscoveryPanel
          provider={activeProvider}
          model={activeModel}
          onProfileSaved={(profile) => {
            console.log('Saved profile:', profile);
            // Optional: Could switch to batch mode automatically here
            // setMode('batch');
          }}
        />
      {/if}
    </div>
  {/if}
</div>

<ScreenshotOverlay
  bind:visible={showScreenshotOverlay}
  {capturedImage}
  onCapture={handleScreenshotCapture}
  onClose={closeOverlay}
/>

<style>
  /*
   * Z-Index Hierarchy (cross-component layering):
   * - ScreenshotOverlay: 10000 (highest – fullscreen capture overlay, position: fixed)
   * - GradingPanel: in-flow flex child of .browser-content (no z-index needed)
   * - Webview: 0 (native OS window, positioned by Tauri bounds)
   *
   * Internal z-indexes (scoped within their parent stacking context):
   * - .resize-handle (GradingPanel): 100 (above panel content)
   */
  .grading-panel {
    position: relative;
    height: 100%;
    background-color: var(--color-bg-sidebar);
    border-left: 1px solid rgba(255,255,255,0.1);
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
  .mode-tabs {
    display: grid; grid-template-columns: 1fr 1fr; padding: var(--spacing-2); gap: var(--spacing-1);
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
    background-color: rgba(88, 166, 255, 0.3);
  }
</style>
