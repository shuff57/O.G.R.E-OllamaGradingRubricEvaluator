<script lang="ts">
  let {
    icon = '📭',
    title = 'Nothing here yet',
    description = '',
    actionLabel = '',
    onaction = () => {},
  }: {
    icon?: string;
    title?: string;
    description?: string;
    actionLabel?: string;
    onaction?: () => void;
  } = $props();
</script>

<div class="empty-state">
  <span class="empty-icon">{icon}</span>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {#if actionLabel}
    <button class="empty-action" onclick={onaction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    min-height: 240px;
    color: var(--color-text-secondary);
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.6;
  }

  .empty-title {
    font-size: 1.25rem;
    margin: 0 0 0.5rem 0;
    color: var(--color-text-primary);
  }

  .empty-desc {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
    margin: 0 0 1.5rem 0;
    max-width: 360px;
    line-height: 1.5;
  }

  .empty-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    border: 1px solid var(--color-primary);
    background: var(--color-primary-bg);
    color: var(--color-primary);
    font-family: var(--font-body);
    transition: all var(--transition-fast);
  }

  .empty-action:hover {
    background: var(--color-primary);
    color: var(--color-primary-text);
  }
</style>
