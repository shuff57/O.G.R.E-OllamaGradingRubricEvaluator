<script lang="ts">
  /**
   * RubricCard - Rubric display/selection from library.
   * Fetches rubrics from the grading server and shows a dropdown to select.
   * Emits the full SavedRubric object so parents can pass rubric data downstream.
   */
  import { onMount } from 'svelte';
  import { listRubrics } from '../../lib/rubric-api';
  import type { SavedRubric } from '../../lib/rubric-api';

  interface Props {
    /** The currently selected rubric object (two-way bindable). */
    selectedRubric?: SavedRubric | null;
    /** Callback when the selected rubric changes. */
    onRubricChange?: (rubric: SavedRubric | null) => void;
  }

  let {
    selectedRubric = $bindable(null),
    onRubricChange,
  }: Props = $props();

  let rubrics = $state<SavedRubric[]>([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    await fetchRubrics();
  });

  async function fetchRubrics() {
    loading = true;
    error = '';
    try {
      rubrics = await listRubrics();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load rubrics';
      rubrics = [];
    } finally {
      loading = false;
    }
  }

  function handleChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    const rubric = rubrics.find(r => r.id === id) ?? null;
    selectedRubric = rubric;
    onRubricChange?.(rubric);
  }

  function handleManageLibrary() {
    // Navigate to the Rubrics page via a custom DOM event.
    // App.svelte listens for this to switch pages.
    window.dispatchEvent(new CustomEvent('ogre:navigate', { detail: 'rubrics' }));
  }
</script>

<section class="rubric-card">
  <div class="section-header">
    <h3>Rubric</h3>
    <button class="text-btn" onclick={handleManageLibrary}>Manage Library</button>
  </div>

  {#if loading}
    <div class="rubric-loading">
      <span class="dot-pulse"></span>
      <span class="loading-text">Loading rubrics...</span>
    </div>
  {:else if error}
    <div class="rubric-error">
      <span>{error}</span>
      <button class="text-btn" onclick={fetchRubrics}>Retry</button>
    </div>
  {:else if rubrics.length === 0}
    <div class="rubric-empty">
      <p>No rubrics in library.</p>
      <button class="text-btn" onclick={handleManageLibrary}>Create one</button>
    </div>
  {:else}
    <select
      class="rubric-select"
      value={selectedRubric?.id ?? ''}
      onchange={handleChange}
    >
      <option value="" disabled>Select a rubric...</option>
      {#each rubrics as rubric (rubric.id)}
        <option value={rubric.id}>
          {rubric.name} ({rubric.maxScore} pts)
        </option>
      {/each}
    </select>

    <!-- Selected rubric detail preview -->
    {#if selectedRubric}
      <div class="rubric-preview">
        <div class="preview-header">
          <span class="preview-name">{selectedRubric.name}</span>
          <span class="preview-score">{selectedRubric.maxScore} pts</span>
        </div>
        {#if selectedRubric.criteria.length > 0}
          <div class="criteria-chips">
            {#each selectedRubric.criteria.slice(0, 4) as c}
              <span class="criterion-chip">{c.criteria} ({c.points}pts)</span>
            {/each}
            {#if selectedRubric.criteria.length > 4}
              <span class="more-badge">+{selectedRubric.criteria.length - 4} more</span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .rubric-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .text-btn {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
  }

  .text-btn:hover {
    text-decoration: underline;
  }

  .rubric-select {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.9rem;
  }

  .rubric-select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  /* Loading state */
  .rubric-loading {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) 0;
  }

  .loading-text {
    font-size: 0.82rem;
    color: var(--color-text-secondary);
  }

  .dot-pulse {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--color-primary);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  /* Error state */
  .rubric-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    font-size: 0.82rem;
    color: var(--color-error, #e55);
    padding: var(--spacing-2);
    background: var(--color-error-bg, rgba(200,50,50,0.08));
    border-radius: var(--radius-md);
  }

  /* Empty state */
  .rubric-empty {
    text-align: center;
    padding: var(--spacing-3) var(--spacing-2);
    color: var(--color-text-secondary);
    font-size: 0.85rem;
  }

  .rubric-empty p {
    margin: 0 0 var(--spacing-2) 0;
  }

  /* Selected rubric preview */
  .rubric-preview {
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-2) var(--spacing-3);
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-2);
  }

  .preview-name {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .preview-score {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-primary);
    background: var(--color-primary-bg);
    padding: 1px 6px;
    border-radius: var(--radius-full, 999px);
  }

  .criteria-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-1);
    align-items: center;
  }

  .criterion-chip {
    background: var(--color-bg-card-hover, rgba(255,255,255,0.05));
    border: 1px solid var(--color-border);
    padding: 1px 6px;
    border-radius: var(--radius-md);
    font-size: 0.72rem;
    color: var(--color-text-secondary);
  }

  .more-badge {
    font-size: 0.72rem;
    color: var(--color-text-secondary);
    font-style: italic;
  }
</style>
