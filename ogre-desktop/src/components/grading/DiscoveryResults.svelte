<script lang="ts">
  /**
   * DiscoveryResults — Shows discovered selectors with pass/fail validation
   * icons and action buttons (Confirm, Save, Discard, Refine).
   */
  import type { DiscoveryResult, ValidationResults, SelectorMap } from '../../lib/discover';

  let {
    discoveryResult,
    validationResults = null,
    returnToBatch = false,
    onRefine = (_key: keyof SelectorMap) => {},
    onConfirm = () => {},
    onSave = () => {},
    onDiscard = () => {},
  } = $props<{
    discoveryResult: DiscoveryResult;
    validationResults: ValidationResults | null;
    returnToBatch: boolean;
    onRefine?: (key: keyof SelectorMap) => void;
    onConfirm?: () => void;
    onSave?: () => void;
    onDiscard?: () => void;
  }>();

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

<div class="results-card">
  <div class="results-header">
    <h4>Results ({discoveryResult.confidence} confidence)</h4>
    <span class="badge">{discoveryResult.navigation.mode} mode</span>
  </div>

  <div class="selectors-list">
    {#each Object.entries(discoveryResult.selectors) as [key, rawValue]}
      {@const value = rawValue as string | null}
      <div class="selector-row">
        <div class="selector-info">
          <span class="selector-key">{key}</span>
          <div class="selector-status">
            <span class="icon" title={getMatchText(key)}>{getStatusIcon(key)}</span>
            <code class="selector-value" title={String(value ?? '(null)')}>
              {value || '(null)'}
            </code>
          </div>
        </div>
        <button
          class="btn-icon"
          onclick={() => onRefine(key as keyof SelectorMap)}
          title="Refine with element picker"
        >
          🎯
        </button>
      </div>
    {/each}
  </div>

  <div class="actions-row">
    <button class="btn-secondary" onclick={onDiscard}>
      Discard
    </button>
    {#if returnToBatch}
      <button class="btn-primary" onclick={onConfirm}>
        Confirm Selectors
      </button>
    {:else}
      <button class="btn-primary" onclick={onSave}>
        Save as Profile
      </button>
    {/if}
  </div>
</div>

<style>
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

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover {
    background: var(--color-bg-secondary);
  }
</style>
