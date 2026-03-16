<script lang="ts">
  import { onMount } from 'svelte';
  import { listRubrics, createRubric, updateRubric, deleteRubric } from '../lib/rubric-api';
  import type { SavedRubric, RubricCriterion } from '../lib/rubric-api';
  import RubricImport from '../components/grading/RubricImport.svelte';
  import { generateRubricFromText } from '../lib/discover';

  let rubrics: SavedRubric[] = [];
  let loading = true;
  let error = '';

  // Edit / Create state
  let editing: SavedRubric | null = null;
  let isNew = false;
  let showImport = false;

  // Form fields
  let formName = '';
  let formDescription = '';
  let formMaxScore = 10;
  let formTags = '';
  let formCriteria: RubricCriterion[] = [];

  let confirmDeleteId: string | null = null;

  // Generate from text state
  let generateText = '';
  let generating = false;
  let generateError = '';

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    error = '';
    try {
      rubrics = await listRubrics();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load rubrics. Is the grading server running?';
      rubrics = [];
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    editing = null;
    isNew = true;
    formName = '';
    formDescription = '';
    formMaxScore = 10;
    formTags = '';
    formCriteria = [{ criteria: '', description: '', points: 0 }];
    generateText = '';
    generateError = '';
  }

  function openEdit(rubric: SavedRubric) {
    editing = rubric;
    isNew = false;
    formName = rubric.name;
    formDescription = rubric.description || '';
    formMaxScore = rubric.maxScore;
    formTags = rubric.tags.join(', ');
    formCriteria = rubric.criteria.map(c => ({ ...c }));
    generateText = '';
    generateError = '';
  }

  function openDuplicate(rubric: SavedRubric) {
    editing = null;
    isNew = true;
    formName = rubric.name + ' (copy)';
    formDescription = rubric.description || '';
    formMaxScore = rubric.maxScore;
    formTags = rubric.tags.join(', ');
    formCriteria = rubric.criteria.map(c => ({ ...c }));
  }

  function cancelForm() {
    editing = null;
    isNew = false;
  }

  async function handleImportComplete(rubricId: string) {
    showImport = false;
    await loadData();
  }

  function addCriterionRow() {
    formCriteria = [...formCriteria, { criteria: '', description: '', points: 0 }];
  }

  function removeCriterionRow(index: number) {
    formCriteria = formCriteria.filter((_, i) => i !== index);
  }

  async function saveForm() {
    if (!formName.trim()) return;
    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
    const criteria = formCriteria.filter(c => c.criteria.trim());

    try {
      if (isNew) {
        await createRubric({
          name: formName.trim(),
          description: formDescription.trim(),
          maxScore: formMaxScore,
          tags,
          criteria,
        });
      } else if (editing) {
        await updateRubric(editing.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          maxScore: formMaxScore,
          tags,
          criteria,
        });
      }
      cancelForm();
      await loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save rubric';
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteRubric(confirmDeleteId);
      confirmDeleteId = null;
      await loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete rubric';
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  function totalPoints(criteria: RubricCriterion[]): number {
    return criteria.reduce((sum, c) => sum + (c.points || 0), 0);
  }

  async function handleGenerateRubric() {
    if (!generateText.trim() || generating) return;
    generating = true;
    generateError = '';
    try {
      const result = await generateRubricFromText(generateText.trim(), formMaxScore);
      if (result.criteria.length === 0) {
        generateError = "AI couldn't generate criteria from this text. Try adding more detail.";
        return;
      }
      formCriteria = result.criteria;
      formMaxScore = result.maxScore;
      if (!formName.trim() && result.suggestedName) {
        formName = result.suggestedName;
      }
    } catch (err) {
      generateError = err instanceof Error ? err.message : 'Failed to generate rubric';
    } finally {
      generating = false;
    }
  }
</script>

<div class="page-container">
  <header class="page-header">
    <div>
      <h1>Rubric Library</h1>
      <p class="text-muted">{rubrics.length} saved rubric{rubrics.length !== 1 ? 's' : ''}</p>
    </div>
    {#if !isNew && !editing && !showImport}
      <div style="display: flex; gap: var(--spacing-2);">
        <button class="btn-ghost" on:click={() => showImport = true}>Import from Screenshot</button>
        <button class="btn-primary" on:click={openCreate}>+ New Rubric</button>
      </div>
    {/if}
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  <!-- Import from Screenshot -->
  {#if showImport}
    <section class="card form-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-4);">
        <h3>Import Rubric from Screenshot</h3>
        <button class="btn-ghost btn-sm" on:click={() => showImport = false}>Cancel</button>
      </div>
      
      <RubricImport onImport={handleImportComplete} />
    </section>
  {/if}

  <!-- Create / Edit Form -->
  {#if isNew || editing}
    <section class="card form-card">
      <h3>{isNew ? 'Create Rubric' : 'Edit Rubric'}</h3>

      <div class="form-group">
        <label for="rubricName">Name</label>
        <input id="rubricName" type="text" bind:value={formName} placeholder="e.g. AP History Essay">
      </div>

      <div class="form-row">
        <div class="form-group flex-1">
          <label for="rubricMaxScore">Max Score</label>
          <input id="rubricMaxScore" type="number" bind:value={formMaxScore} min="1" max="1000" style="width: 100px;">
        </div>
        <div class="form-group flex-1">
          <label for="rubricTags">Tags <span class="text-muted">(comma-separated)</span></label>
          <input id="rubricTags" type="text" bind:value={formTags} placeholder="e.g. history, AP, essay">
        </div>
      </div>

      <div class="form-group">
        <label for="rubricDesc">Description <span class="text-muted">(optional)</span></label>
        <textarea id="rubricDesc" bind:value={formDescription} rows="2" placeholder="Brief description of when to use this rubric"></textarea>
      </div>

      <div class="form-group">
        <label for="generateText">Generate from Assignment Text <span class="text-muted">(optional)</span></label>
        <textarea id="generateText" bind:value={generateText} rows="4" placeholder="Paste the assignment questions or description here, then click Generate..."></textarea>
        {#if generateError}
          <div class="error-banner" style="margin-top: var(--spacing-2);">{generateError}</div>
        {/if}
        <button class="btn-ghost btn-sm" on:click={handleGenerateRubric} disabled={!generateText.trim() || generating} style="margin-top: var(--spacing-2);">
          {generating ? 'Generating...' : 'Generate Rubric'}
        </button>
      </div>

      <div class="form-group">
        <div class="label-row">
          <span class="form-label-text">Criteria</span>
          <span class="text-muted">({totalPoints(formCriteria)} pts total)</span>
        </div>
        <table class="criteria-table">
          <thead>
            <tr>
              <th>Criteria</th>
              <th>Description</th>
              <th style="width: 70px;">Points</th>
              <th style="width: 40px;"></th>
            </tr>
          </thead>
          <tbody>
            {#each formCriteria as row, i}
              <tr>
                <td><input type="text" bind:value={row.criteria} placeholder="Criteria name"></td>
                <td><input type="text" bind:value={row.description} placeholder="Grading description"></td>
                <td><input type="number" bind:value={row.points} min="0" max="1000" style="width: 60px;"></td>
                <td>
                  <button class="btn-icon-danger" on:click={() => removeCriterionRow(i)} title="Remove">
                    &times;
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <button class="btn-ghost btn-sm" on:click={addCriterionRow}>+ Add Row</button>
      </div>

      <div class="form-actions">
        <button class="btn-primary" on:click={saveForm} disabled={!formName.trim()}>
          {isNew ? 'Create' : 'Save Changes'}
        </button>
        <button class="btn-ghost" on:click={cancelForm}>Cancel</button>
      </div>
    </section>
  {/if}

  <!-- Rubric List -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading rubrics...</p>
    </div>
  {:else if rubrics.length === 0 && !isNew}
    <div class="empty-state">
      <h3>No rubrics saved yet</h3>
      <p class="text-muted">Create a rubric here to get started.</p>
      <button class="btn-primary" on:click={openCreate}>Create First Rubric</button>
    </div>
  {:else}
    <div class="rubric-list">
      {#each rubrics as rubric (rubric.id)}
        <div class="card rubric-card">
          <div class="rubric-header">
            <div class="rubric-info">
              <h4>{rubric.name}</h4>
              {#if rubric.description}
                <p class="text-muted rubric-desc">{rubric.description}</p>
              {/if}
            </div>
            <div class="rubric-meta">
              <span class="badge">{rubric.maxScore} pts</span>
              <span class="text-muted">{rubric.criteria.length} criteria</span>
            </div>
          </div>

          {#if rubric.tags.length > 0}
            <div class="tag-row">
              {#each rubric.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          {/if}

          <div class="criteria-preview">
            {#each rubric.criteria.slice(0, 3) as c}
              <div class="criterion-chip">{c.criteria} ({c.points}pts)</div>
            {/each}
            {#if rubric.criteria.length > 3}
              <span class="text-muted">+{rubric.criteria.length - 3} more</span>
            {/if}
          </div>

          <div class="rubric-footer">
            <span class="text-muted date">{formatDate(rubric.createdAt)}</span>
            <div class="rubric-actions">
              <button class="btn-ghost btn-sm" on:click={() => openEdit(rubric)}>Edit</button>
              <button class="btn-ghost btn-sm" on:click={() => openDuplicate(rubric)}>Duplicate</button>
              <button class="btn-ghost btn-sm btn-danger-text" on:click={() => confirmDeleteId = rubric.id}>Delete</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Delete confirmation -->
  {#if confirmDeleteId}
    <div class="modal-backdrop" on:click={() => confirmDeleteId = null} on:keydown={(e) => e.key === 'Escape' && (confirmDeleteId = null)} role="button" tabindex="-1">
      <div class="modal" on:click|stopPropagation on:keydown={(e) => e.key === 'Escape' && (confirmDeleteId = null)} role="dialog" tabindex="0">
        <h3>Delete Rubric?</h3>
        <p class="text-muted">This action cannot be undone.</p>
        <div class="form-actions">
          <button class="btn-danger" on:click={confirmDelete}>Delete</button>
          <button class="btn-ghost" on:click={() => confirmDeleteId = null}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .page-container {
    padding: var(--spacing-8);
    max-width: 900px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-6);
  }

  .page-header h1 {
    margin: 0 0 var(--spacing-1) 0;
    font-family: var(--font-display);
    color: var(--color-text-primary);
  }

  .text-muted {
    color: var(--color-text-secondary);
    font-size: 0.85em;
  }

  .error-banner {
    background: var(--color-error-bg);
    color: var(--color-error);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-md);
    padding: var(--spacing-3) var(--spacing-4);
    margin-bottom: var(--spacing-4);
  }

  .card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    margin-bottom: var(--spacing-4);
  }

  .form-card h3 {
    margin: 0 0 var(--spacing-4) 0;
    color: var(--color-text-primary);
  }

  .form-group {
    margin-bottom: var(--spacing-4);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--spacing-1);
    font-size: 0.85em;
    color: var(--color-text-secondary);
  }

  .form-row {
    display: flex;
    gap: var(--spacing-4);
  }

  .flex-1 {
    flex: 1;
  }

  input[type="text"],
  input[type="number"],
  textarea {
    width: 100%;
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: 0.9em;
    box-sizing: border-box;
  }

  input:focus, textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .criteria-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--spacing-2);
  }

  .criteria-table th {
    text-align: left;
    padding: var(--spacing-2);
    font-size: 0.8em;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .criteria-table td {
    padding: var(--spacing-1);
  }

  .criteria-table td input {
    width: 100%;
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85em;
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-4);
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-primary-text);
    border: none;
    padding: var(--spacing-2) var(--spacing-4);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-weight: 500;
    transition: background var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: none;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    transition: all var(--transition-fast);
  }

  .btn-ghost:hover {
    background: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }

  .btn-sm {
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.8em;
  }

  .btn-danger {
    background: var(--color-error);
    color: white;
    border: none;
    padding: var(--spacing-2) var(--spacing-4);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
  }

  .btn-danger:hover {
    opacity: 0.9;
  }

  .btn-danger-text {
    color: var(--color-error);
  }

  .btn-icon-danger {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 1.2em;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .btn-icon-danger:hover {
    color: var(--color-error);
    background: var(--color-error-bg);
  }

  /* Rubric list */
  .rubric-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .rubric-card {
    transition: border-color var(--transition-fast);
  }

  .rubric-card:hover {
    border-color: var(--color-border-hover);
  }

  .rubric-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-4);
  }

  .rubric-info h4 {
    margin: 0;
    color: var(--color-text-primary);
  }

  .rubric-desc {
    margin: var(--spacing-1) 0 0 0;
  }

  .rubric-meta {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
    white-space: nowrap;
  }

  .badge {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.8em;
    font-weight: 500;
  }

  .tag-row {
    display: flex;
    gap: var(--spacing-1);
    flex-wrap: wrap;
    margin-top: var(--spacing-2);
  }

  .tag {
    background: var(--color-bg-card-hover);
    color: var(--color-text-secondary);
    padding: 1px 8px;
    border-radius: var(--radius-full);
    font-size: 0.75em;
  }

  .criteria-preview {
    display: flex;
    gap: var(--spacing-2);
    flex-wrap: wrap;
    margin-top: var(--spacing-3);
    align-items: center;
  }

  .criterion-chip {
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    padding: 2px 8px;
    border-radius: var(--radius-md);
    font-size: 0.8em;
    color: var(--color-text-secondary);
  }

  .rubric-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--spacing-3);
    padding-top: var(--spacing-3);
    border-top: 1px solid var(--color-border);
  }

  .rubric-actions {
    display: flex;
    gap: var(--spacing-1);
  }

  .date {
    font-size: 0.8em;
  }

  /* Empty / Loading states */
  .empty-state, .loading-state {
    text-align: center;
    padding: var(--spacing-12) var(--spacing-4);
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    margin-bottom: var(--spacing-2);
    color: var(--color-text-primary);
  }

  .empty-state .btn-primary {
    margin-top: var(--spacing-4);
  }

  .spinner {
    border: 3px solid var(--color-border);
    border-top: 3px solid var(--color-primary);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    animation: spin 0.8s linear infinite;
    margin: 0 auto var(--spacing-3);
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Delete modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-6);
    max-width: 400px;
    width: 90%;
  }

  .modal h3 {
    margin: 0 0 var(--spacing-2) 0;
    color: var(--color-text-primary);
  }
</style>
