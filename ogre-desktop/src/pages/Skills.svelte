<script lang="ts">
  import SkillSearch from '../components/skills/SkillSearch.svelte';
  let currentView = $state<'my-skills' | 'find-skills' | 'create-skill'>('my-skills');
</script>

<div class="skills-page">
  <div class="page-header">
    <h1>Skills</h1>
    <div class="toolbar">
      <button 
        class:active={currentView === 'my-skills'} 
        onclick={() => currentView = 'my-skills'}
      >
        My Skills
      </button>
      <button 
        class:active={currentView === 'find-skills'} 
        onclick={() => currentView = 'find-skills'}
      >
        Find Skills
      </button>
      <button 
        class:active={currentView === 'create-skill'} 
        onclick={() => currentView = 'create-skill'}
      >
        Create Skill
      </button>
    </div>
  </div>

  <div class="skills-content">
    {#if currentView === 'my-skills'}
      <div class="empty-state">
        <p>No skills yet — upload a .md file or find one in the marketplace.</p>
      </div>
    {:else if currentView === 'find-skills'}
      <SkillSearch />
    {:else if currentView === 'create-skill'}
      <div class="empty-state">
        <p>AI skill creator coming soon.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .skills-page {
    padding: var(--spacing-lg, 1.5rem);
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-lg, 1.5rem);
    flex-wrap: wrap;
    gap: var(--spacing-md, 1rem);
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .toolbar {
    display: flex;
    gap: var(--spacing-sm, 0.5rem);
    background-color: var(--color-bg-card, #fff);
    border-radius: var(--radius-md, 6px);
    padding: 0.25rem;
    border: 1px solid var(--color-border, #e0e0e0);
  }

  .toolbar button {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    transition: all 0.15s;
    white-space: nowrap;
  }

  .toolbar button:hover {
    background-color: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }

  .toolbar button.active {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    font-weight: 500;
  }

  .skills-content {
    flex: 1;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-secondary);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
