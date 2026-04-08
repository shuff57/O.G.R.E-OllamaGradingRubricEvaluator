<script lang="ts">
  /**
   * BatchInstructions — Regrade All toggle, fill-mode toggle (Auto/Review),
   * and scoring anchors display. Strictness presets moved to BatchWeights.
   */

  // ── Props ──────────────────────────────────────────────────────────────
  let {
    isBatchRunning = false,
    batchPhase = 'idle' as string,
    anchorGenerating = false,
    batchGraderHasStudents = false,
    leniency = 50,
    isRubricRewriting = false,
    weightsValid = true,
    // Bindable — exposed to shell
    forceRegrade = $bindable(false),
    zeroNoResponse = $bindable(true),
    isReviewMode = $bindable(false),
    anchorText = $bindable(''),
    // Callbacks
    onGenerateAnchors = () => {},
    onContinueGrading = () => {},
  } = $props();

  let anchorsReady = $derived(anchorText.trim().length > 0 && !anchorGenerating);
</script>

<!-- ── Grading Options ─────────────────────────────────────────────── -->
<details class="section-details">
  <summary class="section-summary">
    <span>Grading Options</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
  </summary>
  <div class="section-content">
    <label class="toggle-switch-row" class:disabled={isBatchRunning}>
      <span class="toggle-switch-label">Regrade All</span>
      <span class="toggle-switch" class:on={forceRegrade}>
        <input type="checkbox" bind:checked={forceRegrade} disabled={isBatchRunning} />
        <span class="toggle-thumb"></span>
      </span>
    </label>
    <label class="toggle-switch-row" class:disabled={isBatchRunning}>
      <span class="toggle-switch-label">Give 0 for No Response</span>
      <span class="toggle-switch" class:on={zeroNoResponse}>
        <input type="checkbox" bind:checked={zeroNoResponse} disabled={isBatchRunning} />
        <span class="toggle-thumb"></span>
      </span>
    </label>
  </div>
</details>

<!-- ── Review phase: rubric review → generate anchors → start grading ── -->
{#if batchPhase === 'review'}
  {#if !anchorsReady && !anchorGenerating}
    <!-- Step 1: Teacher reviews rubric (and adjusts leniency if desired) -->
    <div class="review-step">
      <div class="step-hint">
        Review the rubric above and adjust leniency if desired, then generate scoring anchors.
      </div>
      <button
        class="btn-primary small"
        onclick={onGenerateAnchors}
        disabled={!batchGraderHasStudents || isRubricRewriting || !weightsValid}
      >{isRubricRewriting ? 'Rubric rewriting…' : 'Generate Anchors'}</button>
    </div>
  {:else}
    <!-- Step 2: Anchors generated (or generating) — show them -->
    <div class="anchors-card">
      <div class="anchors-header">
        <span class="anchors-title">Scoring Anchors</span>
        {#if anchorGenerating}
          <span class="anchors-generating">
            <span class="spinner" aria-hidden="true"></span>
            Generating examples...
          </span>
        {:else}
          <span class="anchors-hint">Edit to adjust how scores are calibrated before grading starts.</span>
        {/if}
      </div>

      <textarea
        class="instructions-textarea anchors-textarea"
        rows="5"
        placeholder={anchorGenerating ? 'Generating calibration examples from your rubric…' : ''}
        bind:value={anchorText}
        disabled={anchorGenerating}
      ></textarea>
    </div>

    <!-- Step 3: Start grading -->
    <div class="continue-grading-row">
      <button
        class="btn-primary small"
        onclick={onContinueGrading}
        disabled={!batchGraderHasStudents || anchorGenerating || !weightsValid}
      >Start Grading</button>
      <button
        class="btn-secondary small"
        onclick={onGenerateAnchors}
        disabled={anchorGenerating || isRubricRewriting}
      >Regenerate Anchors</button>
    </div>
  {/if}
{/if}

<!-- ── Fill Mode Toggle ────────────────────────────────────────────── -->
<div class="fill-mode-toggle" class:disabled={isBatchRunning}>
  <div class="toggle-track">
    <div class="toggle-slider" class:review={isReviewMode}></div>
    <button
      class="toggle-option"
      class:active={!isReviewMode}
      onclick={() => { if (!isBatchRunning) isReviewMode = false; }}
      disabled={isBatchRunning}
    >Auto</button>
    <button
      class="toggle-option"
      class:active={isReviewMode}
      onclick={() => { if (!isBatchRunning) isReviewMode = true; }}
      disabled={isBatchRunning}
    >Review</button>
  </div>
</div>

<style>
  /* ── Collapsible Details Sections ── */
  .section-details {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .section-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    background: var(--color-bg-main);
    user-select: none;
    list-style: none;
  }

  .section-summary::-webkit-details-marker {
    display: none;
  }

  .section-summary .chevron {
    transition: transform 0.2s ease;
    color: var(--color-text-secondary);
  }

  .section-details[open] .chevron {
    transform: rotate(180deg);
  }

  .section-content {
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  /* ── Regrade Toggle Switch ── */
  .toggle-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-1) 0;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch-row.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .toggle-switch-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .toggle-thumb {
    position: absolute;
    inset: 0;
    background: var(--color-border, #444);
    border-radius: 20px;
    transition: background 0.2s ease;
    cursor: pointer;
  }

  .toggle-thumb::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .toggle-switch.on .toggle-thumb {
    background: var(--color-primary, #6366f1);
  }

  .toggle-switch.on .toggle-thumb::after {
    transform: translateX(16px);
  }

  /* ── Fill Mode Toggle ── */
  .fill-mode-toggle {
    display: flex;
  }

  .fill-mode-toggle.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .toggle-track {
    position: relative;
    display: flex;
    width: 100%;
    background: var(--color-bg-main, #1a1a2e);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius-md, 8px);
    padding: 3px;
  }

  .toggle-slider {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: calc(100% - 6px);
    background: var(--color-primary, #6366f1);
    border-radius: calc(var(--radius-md, 8px) - 2px);
    transition: transform 0.2s ease;
    z-index: 0;
  }

  .toggle-slider.review {
    transform: translateX(100%);
  }

  .toggle-option {
    position: relative;
    z-index: 1;
    flex: 1;
    background: none;
    border: none;
    padding: 6px 0;
    font-size: 0.85rem;
    font-weight: 600;
    font-family: var(--font-body);
    color: var(--color-text-secondary, #999);
    cursor: pointer;
    user-select: none;
    transition: color 0.2s ease;
    text-align: center;
  }

  .toggle-option.active {
    color: #fff;
  }

  .toggle-option:disabled {
    cursor: not-allowed;
  }

  /* ── Anchors Textarea ── */
  .instructions-textarea {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.85rem;
    resize: vertical;
  }

  .instructions-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  .instructions-textarea:disabled {
    opacity: 0.6;
  }

  /* ── Scoring Anchors card ── */
  .anchors-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
  }
  .anchors-header {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-2);
  }
  .anchors-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .anchors-hint {
    font-size: 0.78rem;
    color: var(--color-text-secondary);
  }
  .anchors-textarea {
    resize: vertical;
    min-height: 90px;
  }

  .anchors-generating {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    font-size: 0.78rem;
    color: var(--color-text-secondary);
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.8;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Review Step (pre-anchors) ── */
  .review-step {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
  }
  .step-hint {
    font-size: 0.82rem;
    color: var(--color-text-secondary);
  }

  /* ── Continue Grading Row ── */
  .continue-grading-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-3, 12px);
    padding: var(--spacing-3, 12px);
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid var(--color-primary, #6366f1);
    border-radius: var(--radius-md, 6px);
    margin-top: 4px;
  }
  .continue-grading-row .btn-primary {
    flex-shrink: 0;
  }
</style>
