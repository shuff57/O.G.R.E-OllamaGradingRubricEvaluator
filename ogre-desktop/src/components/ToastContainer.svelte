<script lang="ts">
  import { toasts, dismissToast } from '../lib/toast-store';
</script>

{#if toasts.all.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts.all as toast (toast.id)}
      <div
        class="toast toast-{toast.variant}"
        role="alert"
      >
        <span class="toast-icon">
          {#if toast.variant === 'success'}✓
          {:else if toast.variant === 'error'}✕
          {:else if toast.variant === 'warning'}⚠
          {:else}ℹ
          {/if}
        </span>
        <span class="toast-message">{toast.message}</span>
        {#if toast.action}
          <button class="toast-action" onclick={toast.action.onClick}>
            {toast.action.label}
          </button>
        {/if}
        <button
          class="toast-dismiss"
          onclick={() => dismissToast(toast.id)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 10001; /* above ScreenshotOverlay's 10000 */
    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-family: var(--font-body);
    font-weight: 500;
    line-height: 1.4;
    box-shadow: var(--shadow-lg);
    animation: toast-in 0.25s ease-out;
    border: 1px solid transparent;
    color: var(--color-text-primary);
    background: var(--color-bg-card);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toast-success {
    border-color: var(--color-success);
    background: var(--color-success-bg);
  }

  .toast-error {
    border-color: var(--color-error);
    background: var(--color-error-bg);
  }

  .toast-warning {
    border-color: var(--color-warning);
    background: var(--color-warning-bg);
  }

  .toast-info {
    border-color: var(--color-border);
  }

  .toast-icon {
    flex-shrink: 0;
    font-weight: 700;
    font-size: 1rem;
    width: 1.25rem;
    text-align: center;
  }

  .toast-success .toast-icon { color: var(--color-success); }
  .toast-error .toast-icon { color: var(--color-error); }
  .toast-warning .toast-icon { color: var(--color-warning); }
  .toast-info .toast-icon { color: var(--color-primary); }

  .toast-message {
    flex: 1;
    min-width: 0;
  }

  .toast-action {
    flex-shrink: 0;
    background: none;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    color: inherit;
    transition: background var(--transition-fast);
  }

  .toast-action:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .toast-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    padding: 0;
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast);
  }

  .toast-dismiss:hover {
    color: var(--color-text-primary);
  }
</style>
