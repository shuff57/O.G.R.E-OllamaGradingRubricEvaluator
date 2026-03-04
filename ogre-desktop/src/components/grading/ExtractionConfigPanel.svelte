<script lang="ts">
  import type { ExtractionConfig } from '../../lib/site-profiles';

  // Props
  let {
    config = null,
    onOverride = (config: ExtractionConfig) => {}
  } = $props<{
    config: ExtractionConfig | null;
    onOverride: (config: ExtractionConfig) => void;
  }>();

  // State
  let isEditing = $state(false);
  let editConfig = $state<ExtractionConfig>({
    responseMethod: 'selector',
    maxScoreMethod: 'selector',
    maxScoreDefault: '10'
  });

  // Init edit state when opening editor
  function startEditing() {
    if (config) {
      editConfig = { ...config };
    }
    isEditing = true;
  }

  function handleSave() {
    onOverride(editConfig);
    isEditing = false;
  }

  function handleCancel() {
    isEditing = false;
  }
</script>

<div class="extraction-config-panel">
  <header>
    <h4>Data Extraction Strategy</h4>
    {#if !isEditing && config}
      <button class="btn-sm btn-ghost" onclick={startEditing}>Override</button>
    {/if}
  </header>

  {#if !config && !isEditing}
    <div class="empty-state">
      <p>No extraction configuration detected.</p>
      <button class="btn-sm btn-primary" onclick={startEditing}>Configure Manually</button>
    </div>
  {:else if isEditing}
    <div class="edit-form">
      <!-- Response Method Section -->
      <div class="section">
        <h5>Student Response</h5>
        <div class="form-group">
          <label for="respMethod">Method</label>
          <select id="respMethod" bind:value={editConfig.responseMethod}>
            <option value="selector">CSS Selector</option>
            <option value="childIndex">Child Index Path</option>
            <option value="iframe">Iframe Selector</option>
          </select>
        </div>

        {#if editConfig.responseMethod === 'selector'}
          <div class="form-group">
            <label for="respSelector">CSS Selector</label>
            <input 
              id="respSelector" 
              type="text" 
              bind:value={editConfig.responseSelector} 
              placeholder=".student-answer"
            />
          </div>
        {:else if editConfig.responseMethod === 'childIndex'}
          <div class="form-group">
            <label for="respPath">Element Path</label>
            <input 
              id="respPath" 
              type="text" 
              bind:value={editConfig.responsePath} 
              placeholder="questionRegion.children[1]"
            />
            <small class="hint">e.g. questionRegion.children[1].children[0]</small>
          </div>
        {:else if editConfig.responseMethod === 'iframe'}
          <div class="form-group">
            <label for="iframeSel">Iframe Selector</label>
            <input 
              id="iframeSel" 
              type="text" 
              bind:value={editConfig.iframeSelector} 
              placeholder="#answer-frame"
            />
          </div>
        {/if}
      </div>

      <!-- Max Score Method Section -->
      <div class="section">
        <h5>Max Score</h5>
        <div class="form-group">
          <label for="scoreMethod">Method</label>
          <select id="scoreMethod" bind:value={editConfig.maxScoreMethod}>
            <option value="parentTextRegex">Parent Text Regex</option>
            <option value="inputLabel">Input Label Pattern</option>
            <option value="selector">CSS Selector</option>
          </select>
        </div>

        {#if editConfig.maxScoreMethod === 'parentTextRegex'}
          <div class="form-group">
            <label for="scoreRegex">Regex Pattern</label>
            <input 
              id="scoreRegex" 
              type="text" 
              bind:value={editConfig.maxScoreRegex} 
              placeholder="/(\d+) pts/"
            />
          </div>
        {:else if editConfig.maxScoreMethod === 'inputLabel'}
          <div class="form-group">
            <label for="scorePattern">Label Pattern</label>
            <input 
              id="scorePattern" 
              type="text" 
              bind:value={editConfig.maxScorePattern} 
              placeholder="Out of (\d+)"
            />
          </div>
        {:else if editConfig.maxScoreMethod === 'selector'}
          <div class="form-group">
            <label for="scoreSelector">CSS Selector</label>
            <input 
              id="scoreSelector" 
              type="text" 
              bind:value={editConfig.maxScoreSelector} 
              placeholder=".max-score"
            />
          </div>
        {/if}

        <div class="form-group">
          <label for="scoreDefault">Default Value</label>
          <input 
            id="scoreDefault" 
            type="text" 
            bind:value={editConfig.maxScoreDefault} 
            placeholder="10"
          />
        </div>
      </div>

      <div class="actions">
        <button class="btn-sm btn-primary" onclick={handleSave}>Save</button>
        <button class="btn-sm btn-ghost" onclick={handleCancel}>Cancel</button>
      </div>
    </div>
  {:else if config}
    <div class="config-display">
      <div class="config-row">
        <span class="label">Response:</span>
        <span class="value badge">{config.responseMethod}</span>
        <span class="detail">
          {#if config.responseMethod === 'selector'}
            {config.responseSelector || '(none)'}
          {:else if config.responseMethod === 'childIndex'}
            {config.responsePath || '(none)'}
          {:else if config.responseMethod === 'iframe'}
            {config.iframeSelector || '(none)'}
          {/if}
        </span>
      </div>

      <div class="config-row">
        <span class="label">Max Score:</span>
        <span class="value badge">{config.maxScoreMethod}</span>
        <span class="detail">
          {#if config.maxScoreMethod === 'parentTextRegex'}
            {config.maxScoreRegex || '(none)'}
          {:else if config.maxScoreMethod === 'inputLabel'}
            {config.maxScorePattern || '(none)'}
          {:else if config.maxScoreMethod === 'selector'}
            {config.maxScoreSelector || '(none)'}
          {/if}
        </span>
      </div>
      
      <div class="config-row">
        <span class="label">Default:</span>
        <span class="detail">{config.maxScoreDefault}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .extraction-config-panel {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
    margin-top: var(--spacing-3);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-2);
  }

  h4, h5 {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 0.95rem;
  }

  h5 {
    font-size: 0.85rem;
    margin-bottom: var(--spacing-2);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .empty-state {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  .config-display {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .config-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: 0.9rem;
  }

  .label {
    color: var(--color-text-secondary);
    min-width: 80px;
  }

  .badge {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: monospace;
  }

  .detail {
    color: var(--color-text-primary);
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Edit Form */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    background: var(--color-bg-card);
    padding: var(--spacing-3);
    border-radius: var(--radius-sm);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  input, select {
    padding: 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-main);
    color: var(--color-text-primary);
    font-size: 0.9rem;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
    margin-top: var(--spacing-2);
  }

  /* Buttons */
  .btn-sm {
    padding: 4px 12px;
    font-size: 0.85rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
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

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .btn-ghost:hover {
    background: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }
</style>
