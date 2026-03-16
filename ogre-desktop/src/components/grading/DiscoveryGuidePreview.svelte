<script lang="ts">
  /**
   * DiscoveryGuidePreview — Modal preview/save UI for generated site guides.
   */
  let {
    isOpen = false,
    isGenerating = false,
    generatedMarkdown = '',
    isSaving = false,
    onSave = () => {},
    onDiscard = () => {},
  } = $props<{
    isOpen?: boolean;
    isGenerating?: boolean;
    generatedMarkdown?: string;
    isSaving?: boolean;
    onSave?: () => void;
    onDiscard?: () => void;
  }>();
</script>

{#if isOpen}
  <div class="guide-preview-overlay">
    <div class="guide-preview-dialog">
      <div class="dialog-header">
        <h3>Generated Site Guide</h3>
      </div>

      {#if isGenerating}
        <div class="generating">
          <span class="spinner">⏳</span>
          <p>Generating knowledge profile...</p>
        </div>
      {:else if generatedMarkdown}
        <div class="preview-content">
          <pre class="markdown-preview">{generatedMarkdown}</pre>
        </div>
        <div class="dialog-actions">
          <button class="btn-primary" onclick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save as Site Guide'}
          </button>
          <button class="btn-ghost" onclick={onDiscard}>Discard</button>
        </div>
      {:else}
        <div class="error-state">
          <p>Generation failed. Please try again.</p>
          <button class="btn-ghost" onclick={onDiscard}>Close</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .guide-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
  }

  .guide-preview-dialog {
    background: var(--color-bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: min(860px, calc(100vw - 48px));
    max-height: calc(100vh - 72px);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
  }

  .dialog-header h3 {
    margin: 0;
    color: var(--color-text-primary);
  }

  .generating,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    padding: var(--spacing-4);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .spinner {
    font-size: 1.4rem;
  }

  .preview-content {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
    min-height: 220px;
    max-height: 56vh;
    overflow: auto;
  }

  .markdown-preview {
    margin: 0;
    padding: var(--spacing-3);
    color: var(--color-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
    font-size: 0.82rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
  }

  .btn-primary,
  .btn-ghost {
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

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .btn-ghost:hover {
    background: var(--color-bg-secondary);
  }
</style>
