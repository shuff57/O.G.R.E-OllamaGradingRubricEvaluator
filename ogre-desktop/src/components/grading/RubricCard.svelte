<script lang="ts">
  /**
   * RubricCard - Unified rubric editor and library picker.
   *
   * Tiered rubricText population (when phase === 'idle'):
   *   Tier 1: Library rubric selected → criteriaToText(selectedRubric.criteria)
   *   Tier 2: Extraction ran         → extractedRubric present (text already set by BatchPanel)
   *   Tier 3: Nothing yet            → fallbackText (essayPrompt from page)
   *
   * showActions=true (batch mode): textarea is editable + Save/Update/Generate buttons visible.
   * showActions=false (single mode): textarea is read-only preview only.
   */
  import { onMount, onDestroy } from 'svelte';
  import { listRubrics, createRubric, updateRubric } from '../../lib/rubric-api';
  import type { SavedRubric } from '../../lib/rubric-api';
  import { criteriaToText, textToCriteria, validateWeights, isAllocationCriterion, getFullCreditPoints, equalizeWeights, autoFillWeights } from '../../lib/rubric-utils';
  import { generateRubricFromText } from '../../lib/discover';
  import { rewriteRubricAI, restoreCategoryWeights } from '../../lib/rubric-leniency';
  import type { Rubric } from '../../lib/batch-grader';

  type BatchPhase = 'idle' | 'extracting' | 'review' | 'grading' | 'done';

  interface Props {
    selectedRubric?: SavedRubric | null;
    rubricText?: string;
    rubricMaxScore?: string;
    extractedRubric?: Rubric | null;
    sourceRubricId?: string | null;
    fallbackText?: string;
    provider?: string;
    model?: string;
    phase?: BatchPhase;
    showActions?: boolean;
    /** Show rubric table, weight toggle, and leniency slider. Defaults to showActions. */
    showTable?: boolean;
    leniency?: number;
    originalRubricText?: string;
    isRewriting?: boolean;
    weightsValid?: boolean;
    weightMode?: 'category' | 'criterion';
    anchorGenerating?: boolean;
    anchorText?: string;
    batchGraderHasStudents?: boolean;
    onGenerateAnchors?: () => void;
  }

  let {
    selectedRubric = $bindable(null),
    rubricText = $bindable(''),
    rubricMaxScore = $bindable('10'),
    extractedRubric = null as Rubric | null,
    sourceRubricId = $bindable<string | null>(null),
    fallbackText = '',
    provider = '',
    model = '',
    phase = 'idle' as BatchPhase,
    showActions = true,
    showTable = showActions,
    leniency = $bindable(50),
    originalRubricText = $bindable(''),
    isRewriting = $bindable(false),
    weightsValid = $bindable(true),
    weightMode = $bindable<'category' | 'criterion'>('category'),
    anchorGenerating = false,
    anchorText = $bindable(''),
    batchGraderHasStudents = false,
    onGenerateAnchors = () => {},
  }: Props = $props();

  // ── Leniency rewrite state ────────────────────────────────────────
  // Hybrid: rule-based instant preview while dragging, AI refine on release.
  let rewriteError = $state('');
  let isDragging = $state(false);
  let aiRefineTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;

  // Track the last rewritten text so we can detect external changes (extraction)
  let lastRewrittenText = $state('');

  // Auto-rewrite when a new rubric arrives and leniency is not center (saved default).
  // originalRubricText is set explicitly by setExtractedRubricText() (extraction)
  // and the Tier 1 effect (library load) — NOT from user edits to the rubric card.
  // Skip during grading — BatchProgress handles version-advance rewrites directly.
  let prevOriginal = '';
  $effect(() => {
    const text = originalRubricText;
    if (!text || text === prevOriginal) return;
    prevOriginal = text;
    if (phase === 'grading' || phase === 'done') return;
    if (leniency !== 50) triggerAIRewrite();
  });

  // Revert to original when slider returns to center
  $effect(() => {
    const val = leniency;
    if (val === 50 && originalRubricText) {
      lastRewrittenText = originalRubricText;
      rubricText = originalRubricText;
      rewriteError = '';
    }
  });

  // AI rewrite on slider release (the only rewrite path)
  function triggerAIRewrite() {
    const val = leniency;
    if (val === 50 || !originalRubricText) return;

    if (aiRefineTimer) clearTimeout(aiRefineTimer);
    if (abortController) abortController.abort();

    aiRefineTimer = setTimeout(async () => {
      isRewriting = true;
      rewriteError = '';
      abortController = new AbortController();
      try {
        const result = await rewriteRubricAI(
          originalRubricText, val,
          { provider, model },
          abortController.signal,
        );
        if (leniency === val) {
          const fixed = restoreCategoryWeights(result, originalRubricText);
          lastRewrittenText = fixed;
          rubricText = fixed;
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        rewriteError = e instanceof Error ? e.message : 'AI rewrite failed';
      } finally {
        isRewriting = false;
      }
    }, 300);
  }

  function handleSliderInput() {
    isDragging = true;
    if (aiRefineTimer) clearTimeout(aiRefineTimer);
    if (abortController) abortController.abort();
  }

  function handleSliderRelease() {
    isDragging = false;
    triggerAIRewrite();
  }

  // ── Library state ──────────────────────────────────────────────────
  let rubrics = $state<SavedRubric[]>([]);
  let loading = $state(true);
  let error = $state('');

  // ── Save dialog ────────────────────────────────────────────────────
  let showSaveDialog = $state(false);
  let saveRubricName = $state('');
  let saveRubricTags = $state('');
  let saveStatus = $state('');

  // ── Generate state ─────────────────────────────────────────────────
  let isGenerating = $state(false);
  let generateError = $state('');

  let tableRows = $derived(textToCriteria(rubricText));

  let internalWeightsValid = $derived(
    tableRows.length === 0
      ? { valid: true, errors: [] as string[] }
      : validateWeights(tableRows, weightMode)
  );

  $effect(() => {
    weightsValid = internalWeightsValid.valid;
  });

  function updateTableRow(index: number, field: string, value: any) {
    const newRows = [...tableRows];
    newRows[index] = { ...newRows[index], [field]: value };
    rubricText = criteriaToText(newRows);
  }

  /** Update categoryWeight on ALL rows in the same category group */
  function updateCategoryWeight(index: number, value: number) {
    const newRows = [...tableRows];
    const cat = newRows[index].category;
    for (let i = 0; i < newRows.length; i++) {
      if (newRows[i].category === cat) {
        newRows[i] = { ...newRows[i], categoryWeight: value };
      }
    }
    rubricText = criteriaToText(newRows);
  }

  /** Apply equal weights across criteria or categories */
  function handleEqualize() {
    // Clear stale weights from the other mode before equalizing
    const cleared = tableRows.map(c => {
      if (weightMode === 'category') {
        const { criterionWeight, ...rest } = c;
        return criterionWeight !== undefined ? rest : c;
      } else {
        const { categoryWeight, ...rest } = c;
        return categoryWeight !== undefined ? rest : c;
      }
    });
    const filled = equalizeWeights(cleared, weightMode);
    rubricText = criteriaToText(filled);
  }

  /** Auto-fill weights when weightMode changes (only if current weights are all zero/undefined) */
  $effect(() => {
    const _mode = weightMode; // track mode changes
    if (tableRows.length === 0) return;
    const hasAnyWeight = _mode === 'category'
      ? tableRows.some(c => (c.categoryWeight ?? 0) !== 0)
      : tableRows.some(c => (c.criterionWeight ?? 0) !== 0);
    if (!hasAnyWeight) {
      // Clear stale weights from the other mode before auto-filling
      const cleared = tableRows.map(c => {
        if (_mode === 'category') {
          const { criterionWeight, ...rest } = c;
          return criterionWeight !== undefined ? rest : c;
        } else {
          const { categoryWeight, ...rest } = c;
          return categoryWeight !== undefined ? rest : c;
        }
      });
      const filled = autoFillWeights(cleared, _mode);
      rubricText = criteriaToText(filled);
    }
  });

  /** True if this row is the first in its category group */
  let isFirstInCategory = $derived.by(() => {
    const result: boolean[] = [];
    const seen = new Set<string>();
    for (const row of tableRows) {
      const cat = row.category ?? '';
      result.push(!seen.has(cat));
      seen.add(cat);
    }
    return result;
  });

  /** Rows to display — hides allocation rows (Full/Partial/Minimal/Missing) in category/criterion weight mode */
  let displayRows = $derived.by(() => {
    return tableRows.filter(r => !isAllocationCriterion(r.criteria));
  });

  /** Map from original tableRows index → displayRows index, and vice versa */
  let displayIndexMap = $derived.by(() => {
    const toDisplay = new Map<number, number>();
    const toOriginal = new Map<number, number>();
    // Always filter allocation rows when weights are active
    let di = 0;
    for (let oi = 0; oi < tableRows.length; oi++) {
      if (!isAllocationCriterion(tableRows[oi].criteria)) {
        toDisplay.set(oi, di);
        toOriginal.set(di, oi);
        di++;
      }
    }
    return { toDisplay, toOriginal };
  });

  /** Rowspan count per category group in displayRows (for category/criterion weight mode). Undefined when not first row. */
  let categoryRowCounts = $derived.by(() => {
    // Always compute category row counts
    const counts = new Map<string, number>();
    for (const row of displayRows) {
      const cat = row.category ?? '';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  });

  let isFirstInCategoryDisplay = $derived.by(() => {
    const result: boolean[] = [];
    const seen = new Set<string>();
    for (const row of displayRows) {
      const cat = row.category ?? '';
      result.push(!seen.has(cat));
      seen.add(cat);
    }
    return result;
  });

  /** Map from original tableRows index → full-credit points (from "Full" allocation row) */
  let fullCreditMap = $derived.by(() => {
    return getFullCreditPoints(tableRows);
  });

  function addTableRow() {
    const newRows = [...tableRows, { criteria: 'New Criterion', points: 0, description: '' }];
    rubricText = criteriaToText(newRows);
  }

  function removeTableRow(index: number) {
    const newRows = tableRows.filter((_, i) => i !== index);
    rubricText = criteriaToText(newRows);
  }

  // Whether the textarea looks like structured criteria (Name (Npts): Desc)
  let looksLikeCriteria = $derived(textToCriteria(rubricText).length > 0);

  // Show Generate button when we have text but it's not criteria yet
  let showGenerateBtn = $derived(
    showActions && !looksLikeCriteria && rubricText.trim().length > 0 && phase === 'idle'
  );

  // ── Tier 1/3 $effect ───────────────────────────────────────────────
  // Tier 1: library rubric selected → fill textarea with criteria text
  // Tier 3: no library rubric + no extractedRubric → fill with fallbackText
  $effect(() => {
    if (phase !== 'idle') return;
    if (selectedRubric) {
      sourceRubricId = selectedRubric.id;
      const text = criteriaToText(selectedRubric.criteria);
      originalRubricText = text;
      rubricText = text;
      rubricMaxScore = String(selectedRubric.maxScore);
    } else if (!extractedRubric && fallbackText && !rubricText) {
      // Only fill with fallback if textarea is currently empty (don't overwrite user edits)
      rubricText = fallbackText;
    }
  });

  onMount(async () => {
    await fetchRubrics();
    window.addEventListener('ogre:rubric-saved', fetchRubrics);
  });

  onDestroy(() => {
    window.removeEventListener('ogre:rubric-saved', fetchRubrics);
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

  function handleDropdownChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    if (id === '') {
      selectedRubric = null;
      sourceRubricId = null;
      // If extractedRubric present, its text is already in rubricText — leave it.
      // If no extracted rubric, clear toward Tier 3 fallback.
      if (!extractedRubric) {
        rubricText = fallbackText;
      }
    } else {
      const found = rubrics.find(r => r.id === id) ?? null;
      selectedRubric = found;
      // $effect handles rubricText/sourceRubricId update
    }
  }

  function handleManageLibrary() {
    window.dispatchEvent(new CustomEvent('ogre:navigate', { detail: 'rubrics' }));
  }

  // ── Save ───────────────────────────────────────────────────────────
  async function handleSaveRubric() {
    if (!saveRubricName.trim()) return;
    saveStatus = '';
    try {
      await createRubric({
        name: saveRubricName.trim(),
        description: '',
        maxScore: parseInt(rubricMaxScore) || 10,
        criteria: textToCriteria(rubricText),
        tags: saveRubricTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      saveStatus = 'Saved!';
      showSaveDialog = false;
      saveRubricName = '';
      saveRubricTags = '';
      window.dispatchEvent(new CustomEvent('ogre:rubric-saved'));
      setTimeout(() => { saveStatus = ''; }, 3000);
    } catch (err) {
      saveStatus = err instanceof Error ? err.message : 'Save failed';
    }
  }

  // ── Update ─────────────────────────────────────────────────────────
  async function handleUpdateRubric() {
    if (!sourceRubricId) return;
    const rubricName = selectedRubric?.name || 'this rubric';
    if (!confirm(`Update will overwrite '${rubricName}' in library. Continue?`)) return;
    saveStatus = '';
    try {
      await updateRubric(sourceRubricId, {
        criteria: textToCriteria(rubricText),
        maxScore: parseInt(rubricMaxScore) || 10,
      });
      saveStatus = 'Updated!';
      window.dispatchEvent(new CustomEvent('ogre:rubric-saved'));
      setTimeout(() => { saveStatus = ''; }, 3000);
    } catch (err) {
      saveStatus = err instanceof Error ? err.message : 'Update failed';
    }
  }

  // ── Generate Rubric ────────────────────────────────────────────────
  async function handleGenerateRubric() {
    if (!rubricText.trim()) return;
    isGenerating = true;
    generateError = '';
    try {
      const result = await generateRubricFromText(rubricText, parseInt(rubricMaxScore) || 10, {
        provider: provider || undefined,
        model: model || undefined,
      });
      rubricText = criteriaToText(result.criteria);
      if (result.maxScore) rubricMaxScore = String(result.maxScore);
    } catch (err) {
      generateError = err instanceof Error ? err.message : 'Generation failed';
    } finally {
      isGenerating = false;
    }
  }

  // Status hint text
  let statusHint = $derived(
    sourceRubricId
      ? `📚 Library: ${selectedRubric?.name ?? 'loaded'}`
      : extractedRubric
        ? '🔍 Extracted from page'
        : fallbackText && rubricText === fallbackText
          ? '📄 Question text from page (edit or generate rubric)'
          : ''
  );

  let isDisabled = $derived(phase === 'extracting' || phase === 'grading');
</script>

<details class="section-details">
  <summary class="section-summary">
    <span>Rubric</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
  </summary>
  <div class="section-content">
    {#if statusHint}
      <span class="status-hint">{statusHint}</span>
    {/if}

    <!-- Library Dropdown -->
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
      <div class="dropdown-row">
        <select
          class="rubric-select"
          value={selectedRubric?.id ?? ''}
          onchange={handleDropdownChange}
          disabled={isDisabled}
        >
          <option value="">None (use page rubric / manual)</option>
          {#each rubrics as rubric (rubric.id)}
            <option value={rubric.id}>
              {rubric.name} ({rubric.maxScore} pts)
            </option>
          {/each}
        </select>
        <button class="btn-secondary small manage-btn" onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleManageLibrary(); }}>Manage Rubrics</button>
      </div>
    {/if}
    {#if displayRows.length > 0 && showTable}
      <!-- Editable table view -->
      <div class="rubric-table-container">
        <table class="rubric-table">
          <thead>
            <tr>
              {#if weightMode === 'category'}
                <th>Weight %</th>
              {/if}
              <th>Category</th>
              <th>Criteria</th>
              {#if weightMode === 'criterion'}
                <th>Weight %</th>
              {/if}
              {#if (weightMode as string) === 'off'}
                <th>Pts</th>
              {/if}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each displayRows as row, di}
              {@const oi = displayIndexMap.toOriginal.get(di) ?? di}
              <tr class:category-first-row={isFirstInCategoryDisplay[di]}>
                {#if weightMode === 'category'}
                  {#if isFirstInCategoryDisplay[di]}
                    <td class="weight-cell" rowspan={categoryRowCounts.get(row.category ?? '') ?? 1}>
                      <input class="num-input weight-input" type="number" value={row.categoryWeight ?? ''} oninput={(e) => updateCategoryWeight(oi, parseFloat((e.target as HTMLInputElement).value) || 0)} disabled={isDisabled} placeholder="%" />
                    </td>
                  {/if}
                {:else if weightMode === 'criterion'}
                  <td><input class="num-input" type="number" value={row.criterionWeight ?? ''} oninput={(e) => updateTableRow(oi, 'criterionWeight', parseFloat((e.target as HTMLInputElement).value) || 0)} disabled={isDisabled} /></td>
                {/if}
                <td><input type="text" value={row.category ?? ''} oninput={(e) => updateTableRow(oi, 'category', (e.target as HTMLInputElement).value)} disabled={isDisabled} /></td>
                <td><input type="text" value={row.criteria} oninput={(e) => updateTableRow(oi, 'criteria', (e.target as HTMLInputElement).value)} disabled={isDisabled} /></td>
                {#if (weightMode as string) === 'off'}
                  <td><input class="num-input" type="number" value={row.points === 0 && fullCreditMap.has(oi) ? fullCreditMap.get(oi)! : row.points} oninput={(e) => updateTableRow(oi, 'points', parseFloat((e.target as HTMLInputElement).value) || 0)} disabled={isDisabled} /></td>
                {/if}
                <td><button class="error-text" onclick={() => removeTableRow(oi)} disabled={isDisabled} title="Remove row">&times;</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if !isDisabled}
          <button class="btn-secondary small add-row-btn" onclick={addTableRow}>+ Add Row</button>
        {/if}
      </div>
    {:else}
      <!-- Textarea fallback (no structured criteria yet, or read-only mode) -->
      <textarea
        class="rubric-textarea"
        rows={showTable ? 8 : 5}
        placeholder={showTable
          ? 'Rubric criteria will appear here. One per line: Name (10pts): Description\nOr paste question text and click Generate Rubric.'
          : 'No rubric loaded.'}
        bind:value={rubricText}
        disabled={isDisabled || !showTable}
        readonly={!showTable}
      ></textarea>
    {/if}

    {#if showTable}
      <!-- Weight mode toggle -->
      <div class="weight-mode-toggle">
        <span>Weights:</span>
        <select bind:value={weightMode} disabled={isDisabled}>
          <option value="category">By Category</option>
          <option value="criterion">By Criterion</option>
        </select>
        <button
          class="weight-action-btn"
          onclick={handleEqualize}
          disabled={isDisabled || tableRows.length === 0}
          title={`Distribute weights equally (${weightMode === 'category' ? new Set(tableRows.map(c => c.category ?? '')).size + ' categories' : tableRows.length + ' criteria'})`}
        >Equal</button>
        {#if weightMode}
          {#if internalWeightsValid.valid}
            <span class="weight-status valid">✓ {internalWeightsValid.sum}%</span>
          {:else}
            <span class="weight-status invalid">⚠ {internalWeightsValid.sum ?? '?'}% ≠ 100%</span>
          {/if}
        {/if}
      </div>
      {#if !internalWeightsValid.valid && internalWeightsValid.errors.length > 0}
        <div class="weight-errors">
          {#each internalWeightsValid.errors as err}
            <div>• {err}</div>
          {/each}
        </div>
      {/if}

      <!-- Leniency slider -->
      <div class="leniency-row">
        <div class="leniency-header">
          <span class="leniency-label">Rubric Leniency</span>
          {#if isRewriting}
            <span class="leniency-status rewriting">Rewriting...</span>
          {:else if leniency !== 50}
            <span class="leniency-status">{leniency < 50 ? `${50 - leniency}% more lenient` : `${leniency - 50}% more strict`}</span>
          {:else}
            <span class="leniency-status">Original</span>
          {/if}
        </div>
        <div class="leniency-slider-wrap">
          <input type="range" min="0" max="100" step="5"
            bind:value={leniency}
            oninput={handleSliderInput}
            onpointerup={handleSliderRelease}
            onkeyup={handleSliderRelease}
            disabled={isDisabled}
            class="leniency-slider" />
          <div class="leniency-labels">
            <span class="leniency-endpoint">Lenient</span>
            <span class="leniency-center">Original</span>
            <span class="leniency-endpoint">Strict</span>
          </div>
        </div>
        {#if isRewriting}
          <div class="leniency-refining">AI refining rubric...</div>
        {/if}
        {#if rewriteError}
          <div class="leniency-error">{rewriteError}</div>
        {/if}
      </div>
    {/if}

    {#if showActions}
      <!-- Max Score (auto-derived from rubric category totals, hidden input) -->
      <input type="hidden" bind:value={rubricMaxScore} />

      <!-- Action row -->
      <div class="rubric-actions">
        {#if sourceRubricId}
          <button class="btn-secondary small" onclick={handleUpdateRubric} disabled={isDisabled}>
            Update Library
          </button>
        {/if}
        <button class="btn-secondary small" onclick={() => { showSaveDialog = !showSaveDialog; }} disabled={isDisabled}>
          Save to Library
        </button>
        {#if showGenerateBtn}
          <button class="btn-primary small" onclick={handleGenerateRubric} disabled={isGenerating || isDisabled}>
            {isGenerating ? 'Generating…' : '✨ Generate Rubric'}
          </button>
        {/if}
        {#if saveStatus}
          <span class="save-status">{saveStatus}</span>
        {/if}
      </div>

      <!-- Save dialog -->
      {#if showSaveDialog}
        <div class="save-dialog">
          <input
            type="text"
            placeholder="Rubric name"
            bind:value={saveRubricName}
          />
          <input
            type="text"
            placeholder="Tags (comma-separated, optional)"
            bind:value={saveRubricTags}
          />
          <div class="save-dialog-actions">
            <button class="btn-primary small" onclick={handleSaveRubric} disabled={!saveRubricName.trim()}>
              Save
            </button>
            <button class="btn-secondary small" onclick={() => { showSaveDialog = false; }}>
              Cancel
            </button>
          </div>
        </div>
      {/if}

      {#if generateError}
        <div class="generate-error">
          <small>{generateError}</small>
          <button class="error-dismiss" onclick={() => { generateError = ''; }}>&times;</button>
        </div>
      {/if}
    {/if}

    <!-- Generate Anchors (review phase only) -->
    {#if phase === 'review' && showActions}
      {#if !anchorText.trim() && !anchorGenerating}
        <div class="review-step">
          <div class="step-hint">
            Review the rubric above and adjust leniency if desired, then generate scoring anchors.
          </div>
          <button
            class="btn-primary small"
            onclick={onGenerateAnchors}
            disabled={isRewriting || !weightsValid}
          >{isRewriting ? 'Rubric rewriting…' : 'Generate Anchors'}</button>
        </div>
      {:else}
        <div class="anchors-card">
          <div class="anchors-header">
            <span class="anchors-title">Scoring Anchors</span>
            {#if anchorGenerating}
              <span class="anchors-generating">
                <span class="spinner" aria-hidden="true"></span>
                Generating examples...
              </span>
            {:else}
              <span class="anchors-hint">Edit to adjust how scores are calibrated before grading starts.</span>
            {/if}
          </div>
          <textarea
            class="instructions-textarea anchors-textarea"
            rows="5"
            placeholder={anchorGenerating ? 'Generating calibration examples from your rubric…' : ''}
            bind:value={anchorText}
            disabled={anchorGenerating}
          ></textarea>
        </div>
        <button
          class="btn-secondary small"
          onclick={onGenerateAnchors}
          disabled={anchorGenerating || isRewriting}
        >Regenerate Anchors</button>
      {/if}
    {/if}

  </div>
</details>

<style>
  /* ── Collapsible section ── */
  .section-details {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: clip;
  }

  .section-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    background: var(--color-bg-main);
    user-select: none;
    list-style: none;
  }

  .section-summary::-webkit-details-marker {
    display: none;
  }

  .section-summary .chevron {
    transition: transform 0.2s ease;
    color: var(--color-text-secondary);
  }

  .section-details[open] .chevron {
    transform: rotate(180deg);
  }

  .status-hint {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    font-style: italic;
    margin-bottom: var(--spacing-1);
  }

  .section-content {
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
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

  .rubric-select:disabled {
    opacity: 0.6;
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

  /* Text-link buttons */
  .text-btn {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    font-family: var(--font-body);
    width: auto;
  }

  .text-btn:hover {
    text-decoration: underline;
  }

  .dropdown-row {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
  }

  .manage-btn {
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Textarea */
  .rubric-textarea {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.85rem;
    resize: vertical;
    box-sizing: border-box;
    line-height: 1.5;
  }

  .rubric-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  .rubric-textarea:disabled,
  .rubric-textarea[readonly] {
    opacity: 0.65;
    cursor: default;
  }

  /* Max score row */
  .max-score-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .max-score-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .max-score-input {
    width: 80px;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
  }

  .max-score-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  /* Action row */
  .rubric-actions {
    display: flex;
    gap: var(--spacing-2);
    flex-wrap: wrap;
    align-items: center;
  }

  /* Small button modifier */
  .btn-primary.small,
  .btn-secondary.small {
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.82rem;
  }

  .save-status {
    color: var(--color-success, #22c55e);
    font-size: 0.8rem;
  }

  /* Save dialog */
  .save-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-2);
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .save-dialog input {
    width: 100%;
    background-color: var(--color-bg-card, var(--color-bg-main));
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
    box-sizing: border-box;
  }

  .save-dialog input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .save-dialog-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  /* Generate error */
  .generate-error {
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

  .error-dismiss {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 4px;
    line-height: 1;
  }

  /* ── Leniency slider ── */
  .leniency-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
  }

  .leniency-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .leniency-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .leniency-status {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .leniency-status.rewriting {
    color: var(--color-primary);
  }

  .leniency-slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .leniency-slider {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(to right, #22c55e, var(--color-border) 45%, var(--color-border) 55%, #ef4444);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  .leniency-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: 2px solid var(--color-bg-main);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .leniency-slider:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .leniency-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.68rem;
    color: var(--color-text-secondary);
  }

  .leniency-endpoint {
    opacity: 0.8;
  }

  .leniency-center {
    opacity: 0.6;
  }

  .leniency-refining {
    font-size: 0.75rem;
    color: var(--color-primary);
    padding: 2px 0;
    animation: pulse-text 1.2s ease-in-out infinite;
  }

  @keyframes pulse-text {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  .leniency-error {
    font-size: 0.75rem;
    color: var(--color-error, #e55);
    padding: 2px 0;
  }

  .weight-mode-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: 0.85rem;
    padding: var(--spacing-2) 0;
  }
  .weight-mode-toggle select {
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
  }
  .weight-status.valid { color: var(--color-success, #22c55e); }
  .weight-status.invalid { color: var(--color-error, #e55); font-weight: bold; }
  .weight-action-btn {
    padding: 2px 8px;
    font-size: 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
    cursor: pointer;
  }
  .weight-action-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }
  .weight-action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .weight-errors {
    background: var(--color-error-bg, rgba(200,50,50,0.08));
    padding: var(--spacing-2);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-2);
    font-size: 0.8rem;
    color: var(--color-error, #e55);
  }
  .rubric-table-container {
    width: 100%;
    overflow-x: auto;
    margin-bottom: var(--spacing-2);
  }
  .rubric-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    table-layout: auto;
  }
  .rubric-table th, .rubric-table td {
    padding: 4px;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }
  .rubric-table input, .rubric-table textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    padding: 2px 4px;
    border-radius: 2px;
  }
  .rubric-table textarea {
    resize: vertical;
    min-height: 24px;
    vertical-align: middle;
  }
  .rubric-table input:focus, .rubric-table textarea:focus {
    border-color: var(--color-primary);
    background: var(--color-bg-main);
    outline: none;
  }
  .rubric-table .num-input {
    width: 50px;
    text-align: right;
  }
  .rubric-table .weight-cell {
    vertical-align: middle;
    text-align: center;
    border-right: 2px solid var(--color-border, #444);
  }
  .rubric-table .weight-input {
    width: 55px;
    text-align: center;
  }
  .rubric-table .category-first-row {
    border-top: 2px solid var(--color-border, #444);
  }
  .add-row-btn {
    margin-top: 4px;
    font-size: 0.8rem;
  }
  .error-text {
    color: var(--color-error, #e55);
    font-size: 1.2rem;
    font-weight: bold;
    padding: 0 4px;
  }

  /* ── Anchors (review phase in rubric card) ── */
  .review-step {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
  }
  .review-step .step-hint {
    font-size: 0.82rem;
    color: var(--color-text-secondary);
  }
  .anchors-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
  }
  .anchors-header {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-2);
  }
  .anchors-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .anchors-hint {
    font-size: 0.78rem;
    color: var(--color-text-secondary);
  }
  .anchors-generating {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    font-size: 0.78rem;
    color: var(--color-text-secondary);
  }
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.8;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .instructions-textarea {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.85rem;
    resize: vertical;
  }
  .instructions-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
  .instructions-textarea:disabled {
    opacity: 0.6;
  }
  .anchors-textarea {
    resize: vertical;
    min-height: 90px;
  }

</style>
