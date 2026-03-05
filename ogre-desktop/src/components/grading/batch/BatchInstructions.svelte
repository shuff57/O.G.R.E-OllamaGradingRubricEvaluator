<script lang="ts">
  /**
   * BatchInstructions — Grading instructions textarea, preset toggles,
   * fill-mode toggle (Auto/Review), and scoring anchors display.
   */

  // ── Props ──────────────────────────────────────────────────────────────
  let {
    isBatchRunning = false,
    batchPhase = 'idle' as string,
    anchorGenerating = false,
    batchGraderHasStudents = false,
    // Bindable — exposed to shell
    customInstructions = $bindable(''),
    forceRegrade = $bindable(false),
    isReviewMode = $bindable(false),
    anchorText = $bindable(''),
    // Callbacks
    onContinueGrading = () => {},
  } = $props();

  // ── Presets ────────────────────────────────────────────────────────────
  const PRESETS = {
    nonZero: 'IMPORTANT: Only provide feedback for students who earn a non-zero score. If a student\'s score is 0, set feedback to an empty string "". Do NOT write feedback for zero-score students.',
    lenient: 'Grade very leniently. Give partial credit for any attempt that is vaguely correct.',
    strict: 'Grade strictly according to the rubric. Deduct points for minor errors.',
    skipNoResponse: 'Students who did not submit a response will be skipped and receive no grade.',
    noFormulaPenalty: 'Do not deduct points for lack of explicit formula notation or symbolic notation of any kind. If a student demonstrates understanding of a concept through explanation alone — without writing out formulas or symbols — award full credit for that rubric item. Reward the concept, not the notation. Do NOT penalize brevity. A concise response that correctly addresses each rubric criterion deserves full marks. Only deduct when a rubric criterion is genuinely missing or wrong — not because the student could have written more.',
  };

  // ── Derived preset active states ───────────────────────────────────────
  let isNonZeroActive = $derived(customInstructions.includes(PRESETS.nonZero));
  let isLenientActive = $derived(customInstructions.includes(PRESETS.lenient));
  let isStrictActive = $derived(customInstructions.includes(PRESETS.strict));
  let isSkipNoResponseActive = $derived(customInstructions.includes(PRESETS.skipNoResponse));
  let isNoFormulaPenaltyActive = $derived(customInstructions.includes(PRESETS.noFormulaPenalty));

  function togglePreset(key: 'nonZero' | 'lenient' | 'strict' | 'skipNoResponse' | 'noFormulaPenalty') {
    const text = PRESETS[key];
    if (customInstructions.includes(text)) {
      customInstructions = customInstructions.replace(text, '').replace(/\n{3,}/g, '\n\n').trim();
    } else {
      customInstructions = customInstructions.trim()
        ? customInstructions.trim() + '\n\n' + text
        : text;
    }
  }
</script>

<!-- ── Grading Instructions ────────────────────────────────────────── -->
<details class="section-details">
  <summary class="section-summary">
    <span>Grading Instructions</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
  </summary>
  <div class="section-content">
    <div class="preset-buttons">
      <button class="btn-preset" class:active={isNonZeroActive}
        onclick={() => togglePreset('nonZero')} disabled={isBatchRunning}>
        Non-Zero Only
      </button>
      <button class="btn-preset" class:active={isLenientActive}
        onclick={() => togglePreset('lenient')} disabled={isBatchRunning}>
        Lenient
      </button>
      <button class="btn-preset" class:active={isStrictActive}
        onclick={() => togglePreset('strict')} disabled={isBatchRunning}>
        Strict
      </button>
      <button class="btn-preset" class:active={isSkipNoResponseActive}
        onclick={() => togglePreset('skipNoResponse')} disabled={isBatchRunning}>
        Skip No Response
      </button>
      <button class="btn-preset" class:active={isNoFormulaPenaltyActive}
        onclick={() => togglePreset('noFormulaPenalty')} disabled={isBatchRunning}>
        No Formula Penalty
      </button>
    </div>
    <label class="toggle-switch-row" class:disabled={isBatchRunning}>
      <span class="toggle-switch-label">Regrade All</span>
      <span class="toggle-switch" class:on={forceRegrade}>
        <input type="checkbox" bind:checked={forceRegrade} disabled={isBatchRunning} />
        <span class="toggle-thumb"></span>
      </span>
    </label>
    <textarea
      class="instructions-textarea"
      rows="4"
      placeholder="Enter additional instructions for the AI grader here..."
      bind:value={customInstructions}
      disabled={isBatchRunning}
    ></textarea>
  </div>
</details>

<!-- ── Scoring Anchors (review phase) ──────────────────────────────── -->
{#if batchPhase === 'review'}
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

  <div class="continue-grading-row">
    <button
      class="btn-primary small"
      onclick={onContinueGrading}
      disabled={!batchGraderHasStudents}
    >▶ Continue Grading</button>
  </div>
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

  /* ── Preset Buttons ── */
  .preset-buttons {
    display: flex;
    gap: var(--spacing-2);
    flex-wrap: wrap;
  }

  .btn-preset {
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-preset:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-bg);
  }

  .btn-preset.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-bg);
    font-weight: 600;
  }

  .btn-preset:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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

  /* ── Instructions Textarea ── */
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
