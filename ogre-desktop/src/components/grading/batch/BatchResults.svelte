<script lang="ts">
  /**
   * BatchResults — Panel footer with phase-dependent action buttons.
   * Discover CTA, Start Batch, Cancel, Pause/Stop, New Batch, Start Grading.
   */

  // ── Props ──────────────────────────────────────────────────────────────
  let {
    batchPhase = 'idle' as string,
    isBatchRunning = false,
    isBatchPaused = false,
    savedSessionStudent = null as string | null,
    profileWarning = '',
    batchGraderHasStudents = false,
    // Callbacks
    onExtract = () => {},
    onContinueGrading = () => {},
    onPauseBatch = () => {},
    onStopBatch = () => {},
    onCancelBatch = () => {},
    onReset = () => {},
    onRequestDiscovery = () => {},
  } = $props();
</script>

<div class="panel-footer">
  {#if batchPhase === 'idle' && !savedSessionStudent}
    {#if profileWarning && !isBatchRunning}
      <div class="discover-cta-card">
        <div class="discover-cta-icon">🔍</div>
        <div class="discover-cta-content">
          <div class="discover-cta-title">No profile found for this page</div>
          <div class="discover-cta-desc">Use AI to discover the grading page structure and create a profile</div>
        </div>
        <button class="btn-primary full-width" onclick={() => onRequestDiscovery()}>
          Discover This Page
        </button>
        <button class="btn-link" onclick={onExtract}>
          Or use default profile anyway
        </button>
      </div>
    {:else}
      <button class="btn-primary full-width" onclick={onExtract}>
        Start Batch
      </button>
    {/if}
  {:else if batchPhase === 'extracting'}
    <button class="btn-danger full-width" onclick={onCancelBatch}>
      Cancel
    </button>
  {:else if batchPhase === 'grading' && isBatchRunning}
    <div class="batch-controls">
      <button class="btn-secondary" onclick={onPauseBatch}>
        {isBatchPaused ? 'Resume' : 'Pause'}
      </button>
      <button class="btn-danger" onclick={onStopBatch}>
        Stop
      </button>
    </div>
  {:else if batchPhase === 'done'}
    <button class="btn-secondary full-width" onclick={onReset}>
      New Batch
    </button>
  {:else if batchPhase === 'review'}
    <div class="batch-controls">
      <button class="btn-secondary" onclick={onCancelBatch}>
        Cancel
      </button>
      <button
        class="btn-primary"
        onclick={onContinueGrading}
        disabled={!batchGraderHasStudents}
      >
        Start Grading
      </button>
    </div>
  {/if}
</div>

<style>
  /* ── Footer / Controls ── */
  .panel-footer {
    padding-top: var(--spacing-2);
    flex-shrink: 0;
  }

  .batch-controls {
    display: flex;
    gap: var(--spacing-2);
    width: 100%;
  }

  .batch-controls button {
    flex: 1;
    padding: var(--spacing-3);
    justify-content: center;
  }

  .btn-primary.full-width {
    width: 100%;
    justify-content: center;
    padding: var(--spacing-3);
  }

  .btn-secondary.full-width {
    width: 100%;
    justify-content: center;
    padding: var(--spacing-3);
  }

  .btn-danger {
    background-color: var(--color-error, #ef4444);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .btn-danger:hover { opacity: 0.9; }

  .btn-danger.full-width {
    width: 100%;
    justify-content: center;
    padding: var(--spacing-3);
  }

  /* ── Discover CTA Card ── */
  .discover-cta-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .discover-cta-icon {
    font-size: 2rem;
  }

  .discover-cta-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .discover-cta-desc {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .btn-link:hover {
    color: var(--color-text-primary);
  }
</style>
