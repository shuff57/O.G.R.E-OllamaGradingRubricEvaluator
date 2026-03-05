<script lang="ts">
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../../lib/db';

  let visibleColumns: string[] = [];

  // Available columns for history table
  const COLUMN_OPTIONS = [
    { id: 'timestamp', label: 'Timestamp' },
    { id: 'provider', label: 'Provider' },
    { id: 'model', label: 'Model' },
    { id: 'studentCount', label: 'Students' },
    { id: 'meanScore', label: 'Mean Score' },
    { id: 'minScore', label: 'Min Score' },
    { id: 'maxScore', label: 'Max Score' },
    { id: 'medianScore', label: 'Median Score' },
    { id: 'pageUrl', label: 'Page URL' },
  ];

  onMount(async () => {
    await loadColumnVisibility();
  });

  async function loadColumnVisibility() {
    const columnsJson = await getSetting('history_visible_columns');
    visibleColumns = columnsJson ? JSON.parse(columnsJson) : ['timestamp', 'provider', 'model', 'studentCount', 'meanScore', 'pageUrl'];
  }

  async function toggleColumn(columnId: string) {
    if (visibleColumns.includes(columnId)) {
      visibleColumns = visibleColumns.filter(c => c !== columnId);
    } else {
      visibleColumns = [...visibleColumns, columnId];
    }
    
    await setSetting('history_visible_columns', JSON.stringify(visibleColumns));
  }
</script>

<!-- Column Visibility Section -->
<section class="card">
  <h3>History Table Columns</h3>
  <p class="mb-4">Choose which columns to display in the grading history table:</p>
  
  <div class="column-toggles">
    {#each COLUMN_OPTIONS as column}
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={visibleColumns.includes(column.id)}
          onchange={() => toggleColumn(column.id)}
        />
        <span>{column.label}</span>
      </label>
    {/each}
  </div>
</section>

<style>
  .column-toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--spacing-2);
  }

  .checkbox-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-2);
    cursor: pointer;
    margin-bottom: 0;
  }
  
  .checkbox-label input {
    width: auto;
    margin: 0;
  }
</style>
