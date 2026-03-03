<script lang="ts">
  /**
   * DiscoveryConfirmation — Step-by-step confirmation flow for discovered selectors.
   * Shows current selector with accept/refine/back/cancel actions.
   */
  import type { ConfirmationFlow } from '../../lib/confirmation-flow';

  let {
    confirmationFlow,
    isRefining = false,
    selectorLabels = {} as Record<string, string>,
    onAccept = () => {},
    onRefine = () => {},
    onBack = () => {},
    onCancel = () => {},
  } = $props<{
    confirmationFlow: ConfirmationFlow;
    isRefining: boolean;
    selectorLabels: Record<string, string>;
    onAccept?: () => void;
    onRefine?: () => void;
    onBack?: () => void;
    onCancel?: () => void;
  }>();
</script>

{#if confirmationFlow}
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
      <div class="confirm-selector-name">{selectorLabels[confirmState.key] ?? confirmState.key}</div>
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
      <button class="btn-secondary small" onclick={onBack} disabled={confirmState.stepIndex === 0}>
        ← Back
      </button>
      <button class="btn-secondary small" onclick={onCancel}>
        Cancel
      </button>
      <button class="btn-secondary small" onclick={onRefine} disabled={isRefining}>
        {isRefining ? 'Picking...' : 'Refine'}
      </button>
      <button class="btn-primary small" onclick={onAccept} disabled={isRefining}>
        Accept ✓
      </button>
    </div>
  </div>
{/if}
{/if}

<style>
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

  .btn-primary.small, .btn-secondary.small {
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
  }
</style>
