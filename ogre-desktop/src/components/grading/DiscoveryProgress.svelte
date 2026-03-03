<script lang="ts">
  /**
   * DiscoveryProgress — Progress bar and status message during AI discovery.
   * Pure display component, no events.
   */
  let {
    progressMessage = '',
    progressPercent = 0,
  } = $props<{
    progressMessage: string;
    progressPercent: number;
  }>();
</script>

<div class="progress-card">
  <div class="progress-bar">
    <div class="progress" style="width: {progressPercent}%"></div>
  </div>
  <p class="progress-message">{progressMessage}</p>
</div>

<style>
  .progress-card {
    background: var(--color-bg-card);
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .progress-bar {
    height: 6px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: var(--spacing-2);
  }

  .progress {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.3s ease;
  }

  .progress-message {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    text-align: center;
  }
</style>
