<script lang="ts">
  import type { IntentMode } from '../../lib/discovery-intent';

  let { mode = $bindable('form') } = $props<{
    mode: IntentMode;
  }>();
</script>

<div class="mode-selector">
  <button 
    class="mode-btn {mode === 'form' ? 'active' : ''}" 
    onclick={() => mode = 'form'}
  >
    📝 Guided Form
  </button>
  <button 
    class="mode-btn {mode === 'chat' ? 'active' : ''}" 
    onclick={() => mode = 'chat'}
  >
    💬 Chat
  </button>
  <button 
    class="mode-btn {mode === 'example' ? 'active' : ''}" 
    onclick={() => mode = 'example'}
  >
    🎯 Teach by Example
  </button>
</div>

<style>
  .mode-selector {
    display: flex;
    gap: 2px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    padding: 2px;
    margin-bottom: var(--spacing-2);
  }

  .mode-btn {
    flex: 1;
    padding: 6px 4px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.72rem;
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .mode-btn:hover {
    background: var(--color-bg-card-hover);
    opacity: 0.8;
  }

  .mode-btn.active {
    background: var(--color-bg-card);
    color: var(--color-text-primary);
    opacity: 1;
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
</style>
