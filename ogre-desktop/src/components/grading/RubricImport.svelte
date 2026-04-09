<script lang="ts">
  /**
   * RubricImport - Import a rubric from a screenshot.
   * 
   * Flow:
   * 1. User clicks "Import from Screenshot"
   * 2. We capture the current webview
   * 3. Show ScreenshotOverlay for cropping
   * 4. Send cropped image to AI for parsing
   * 5. Show parsed rubric for confirmation/editing
   * 6. Save to library via rubric-api
   */
  import { captureWebviewScreenshot } from '../../lib/browser';
  import { parseRubricFromScreenshot } from '../../lib/discover';
  import { createRubric, type RubricCriterion } from '../../lib/rubric-api';
  import ScreenshotOverlay from '../ScreenshotOverlay.svelte';

  interface Props {
    /** Called when a rubric is successfully imported and saved. */
    onImport?: (rubricId: string) => void;
  }

  let { onImport }: Props = $props();

  // --- State ---
  let isCapturing = $state(false);
  let screenshotVisible = $state(false);
  let capturedScreen = $state(''); // Full screen capture
  
  let isParsing = $state(false);
  let parseError = $state('');
  
  // Staging area for the imported rubric
  let stagingRubric = $state<{
    name: string;
    criteria: RubricCriterion[];
    maxScore: number;
  } | null>(null);

  // --- Actions ---

  async function startCapture() {
    isCapturing = true;
    parseError = '';
    try {
      // 1. Capture the full webview
      capturedScreen = await captureWebviewScreenshot();
      // 2. Show the overlay
      screenshotVisible = true;
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'Failed to capture screen';
    } finally {
      isCapturing = false;
    }
  }

  async function handleCrop(croppedImage: string) {
    // 3. Hide overlay
    screenshotVisible = false;
    
    // 4. Parse with AI
    isParsing = true;
    stagingRubric = null;
    parseError = '';

    try {
      const result = await parseRubricFromScreenshot(croppedImage);
      
      stagingRubric = {
        name: result.suggestedName || 'Imported Rubric',
        criteria: result.criteria,
        maxScore: result.maxScore
      };
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'Failed to parse rubric';
    } finally {
      isParsing = false;
    }
  }

  function handleOverlayClose() {
    screenshotVisible = false;
  }

  // --- Editing ---

  function updateMaxScore() {
    if (!stagingRubric) return;
    stagingRubric.maxScore = stagingRubric.criteria.reduce((sum, c) => sum + (c.points || 0), 0);
  }

  function addCriterion() {
    if (!stagingRubric) return;
    stagingRubric.criteria = [
      ...stagingRubric.criteria,
      { criteria: 'New Criterion', description: '', points: 0 }
    ];
  }

  function removeCriterion(index: number) {
    if (!stagingRubric) return;
    stagingRubric.criteria = stagingRubric.criteria.filter((_, i) => i !== index);
    updateMaxScore();
  }

  // --- Saving ---

  let isSaving = $state(false);

  async function saveRubric() {
    if (!stagingRubric) return;
    isSaving = true;
    try {
      const saved = await createRubric({
        name: stagingRubric.name,
        description: 'Imported from screenshot',
        criteria: stagingRubric.criteria,
        maxScore: stagingRubric.maxScore,
        tags: ['imported']
      });
      
      // Reset state and notify parent
      stagingRubric = null;
      onImport?.(saved.id);
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'Failed to save rubric';
    } finally {
      isSaving = false;
    }
  }

  function cancelImport() {
    stagingRubric = null;
    parseError = '';
  }
</script>

<div class="rubric-import">
  {#if !stagingRubric && !isParsing}
    <button 
      class="import-btn" 
      onclick={startCapture} 
      disabled={isCapturing}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      {isCapturing ? 'Capturing...' : 'Import from Screenshot'}
    </button>
  {/if}

  {#if isParsing}
    <div class="parsing-state">
      <div class="spinner"></div>
      <span>Analyzing screenshot with AI...</span>
    </div>
  {/if}

  {#if parseError}
    <div class="error-msg">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {parseError}
      <button class="retry-link" onclick={() => parseError = ''}>Dismiss</button>
    </div>
  {/if}

  {#if stagingRubric}
    <div class="editor-card">
      <div class="editor-header">
        <h4>Review Imported Rubric</h4>
        <span class="total-score">{stagingRubric.maxScore} pts</span>
      </div>

      <div class="field-group">
        <label for="rubric-name">Name</label>
        <input 
          id="rubric-name" 
          type="text" 
          bind:value={stagingRubric.name} 
          placeholder="Rubric Name"
        />
      </div>

      <div class="criteria-list">
        <div class="list-header">
          <span>Criteria</span>
          <span>Pts</span>
          <span></span>
        </div>
        
        {#each stagingRubric.criteria as criterion, i}
          <div class="criterion-row" class:allocation-row={criterion.rowType === 'allocation'}>
            <div class="criterion-inputs">
              <input 
                type="text" 
                class="crit-name"
                bind:value={criterion.criteria} 
                placeholder="Criterion Name" 
              />
              <input 
                type="text" 
                class="crit-desc"
                bind:value={criterion.description} 
                placeholder="Description" 
              />
            </div>
            {#if criterion.rowType !== 'allocation'}
              <input 
                type="number" 
                class="crit-points"
                bind:value={criterion.points} 
                oninput={updateMaxScore}
                min="0"
              />
            {:else}
              <span class="crit-points-readonly">{criterion.points}</span>
            {/if}
            {#if criterion.rowType !== 'allocation'}
              <button 
                class="remove-btn" 
                onclick={() => removeCriterion(i)}
                aria-label="Remove criterion"
              >
                &times;
              </button>
            {/if}
          </div>
        {/each}
        
        <button class="add-btn" onclick={addCriterion}>+ Add Criterion</button>
      </div>

      <div class="action-bar">
        <button class="cancel-btn" onclick={cancelImport} disabled={isSaving}>Cancel</button>
        <button class="save-btn" onclick={saveRubric} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save to Library'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Screenshot Overlay (Global) -->
  <ScreenshotOverlay
    bind:visible={screenshotVisible}
    capturedImage={capturedScreen}
    onCapture={handleCrop}
    onClose={handleOverlayClose}
  />
</div>

<style>
  .rubric-import {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .import-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: var(--color-bg-card-hover);
    border: 1px dashed var(--color-border);
    color: var(--color-text-primary);
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .import-btn:hover:not(:disabled) {
    background-color: var(--color-bg-card-active);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .import-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Parsing State */
  .parsing-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: var(--spacing-4);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-primary-dim);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Error Msg */
  .error-msg {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--spacing-2);
    background: var(--color-error-bg);
    color: var(--color-error);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
  }

  .retry-link {
    background: none;
    border: none;
    text-decoration: underline;
    color: inherit;
    cursor: pointer;
    margin-left: auto;
    font-size: 0.8rem;
  }

  /* Editor Card */
  .editor-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-1);
  }

  .editor-header h4 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  .total-score {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-group label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-group input {
    background: var(--color-bg-input);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
  }

  /* Criteria List */
  .criteria-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .list-header {
    display: grid;
    grid-template-columns: 1fr 50px 24px;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    padding: 0 4px;
  }

  .criterion-row {
    display: grid;
    grid-template-columns: 1fr 50px 24px;
    gap: 8px;
    align-items: start;
    background: var(--color-bg-subtle);
    padding: 8px;
    border-radius: var(--radius-sm);
  }

  .criterion-inputs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .criterion-inputs input {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--color-text-primary);
    width: 100%;
  }

  .criterion-inputs input:focus {
    outline: none;
    background: rgba(255,255,255,0.05);
  }

  .crit-name {
    font-weight: 500;
    font-size: 0.9rem;
  }

  .crit-desc {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .crit-points {
    background: var(--color-bg-input);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    width: 100%;
    padding: 4px;
    border-radius: var(--radius-sm);
    text-align: center;
    font-size: 0.9rem;
  }

  .crit-points-readonly {
    width: 100%;
    text-align: center;
    font-size: 0.9rem;
    color: var(--color-text-secondary);
    padding: 4px;
    display: block;
  }

  .allocation-row {
    background: var(--color-bg-card);
    border-left: 2px solid var(--color-primary-dim);
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: 0;
    font-size: 1.2rem;
    line-height: 1;
  }

  .remove-btn:hover {
    color: var(--color-error);
  }

  .add-btn {
    background: none;
    border: 1px dashed var(--color-border);
    color: var(--color-text-secondary);
    padding: 6px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    cursor: pointer;
    margin-top: 4px;
  }

  .add-btn:hover {
    background: var(--color-bg-subtle);
    color: var(--color-primary);
    border-color: var(--color-primary-dim);
  }

  /* Action Bar */
  .action-bar {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: var(--spacing-1);
    padding-top: var(--spacing-2);
    border-top: 1px solid var(--color-border);
  }

  .cancel-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 0.9rem;
  }

  .cancel-btn:hover {
    color: var(--color-text-primary);
  }

  .save-btn {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 6px 16px;
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .save-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .save-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
</style>
