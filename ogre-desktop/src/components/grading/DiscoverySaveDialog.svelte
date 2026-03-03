<script lang="ts">
  /**
   * DiscoverySaveDialog — Modal dialog for saving a discovered profile.
   */
  let {
    isOpen = false,
    profileName = $bindable(''),
    isSaving = false,
    onSave = () => {},
    onCancel = () => {},
  } = $props<{
    isOpen: boolean;
    profileName: string;
    isSaving: boolean;
    onSave?: () => void;
    onCancel?: () => void;
  }>();
</script>

{#if isOpen}
  <div class="dialog-overlay">
    <div class="dialog">
      <h4>Save Profile</h4>
      <input
        type="text"
        placeholder="Profile Name"
        bind:value={profileName}
        class="dialog-input"
      />
      <div class="dialog-actions">
        <button class="btn-secondary" onclick={onCancel}>
          Cancel
        </button>
        <button
          class="btn-primary"
          onclick={onSave}
          disabled={!profileName.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-card);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    box-shadow: var(--shadow-lg);
  }

  .dialog h4 {
    margin: 0;
    color: var(--color-text-primary);
  }

  .dialog-input {
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
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

  .btn-primary:disabled {
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
</style>
