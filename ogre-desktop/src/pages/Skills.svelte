<script lang="ts">
  import { onMount } from 'svelte';
  import SkillSearch from '../components/skills/SkillSearch.svelte';
  import SkillCreator from '../components/skills/SkillCreator.svelte';
  import SkillCard from '../components/skills/SkillCard.svelte';
  import { getSkills, saveSkill, deleteSkill, updateSkillActive, type Skill } from '../lib/db';
  import { parseSkillMarkdown } from '../lib/skill-parser';

  let currentView = $state<'my-skills' | 'find-skills' | 'create-skill'>('my-skills');
  let skillCreatorKey = $state(0);

  function goToCreateSkill() {
    skillCreatorKey++;
    currentView = 'create-skill';
  }

  let skills = $state<Skill[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  async function loadSkills() {
    loading = true;
    error = null;
    try {
      skills = await getSkills();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load skills';
    } finally {
      loading = false;
    }
  }

  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseSkillMarkdown(content);
        
        await saveSkill({
          name: parsed.name || file.name.replace(/\.md$/, ''),
          description: parsed.description || '',
          content: content,
          source: 'local',
          is_active: 1
        });

        await loadSkills();
        target.value = '';
      } catch (err) {
        alert(`Failed to import skill: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    reader.readAsText(file);
  }

  async function handleDelete(id: string) {
    try {
      await deleteSkill(id);
      skills = skills.filter(s => s.id !== id);
    } catch (err) {
      alert(`Failed to delete skill: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function handleToggle(id: string, isActive: number) {
    try {
      await updateSkillActive(id, isActive);
      const skill = skills.find(s => s.id === id);
      if (skill) {
        skill.is_active = isActive;
      }
    } catch (err) {
      alert(`Failed to update skill: ${err instanceof Error ? err.message : 'Unknown error'}`);
      await loadSkills();
    }
  }

  onMount(() => {
    loadSkills();
  });
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
        onclick={goToCreateSkill}
      >
        Create Skill
      </button>
    </div>
  </div>

  <div class="skills-content">
    {#if currentView === 'my-skills'}
      <div class="my-skills-view">
        <div class="actions-bar">
          <button class="btn-primary" onclick={() => fileInput.click()}>
            Import Skill (.md)
          </button>
          <input 
            type="file" 
            accept=".md" 
            bind:this={fileInput} 
            onchange={handleFileUpload} 
            style="display: none;"
          >
        </div>

        {#if loading}
          <div class="loading">Loading skills...</div>
        {:else if error}
          <div class="error">{error}</div>
        {:else if skills.length === 0}
          <div class="empty-state">
            <p>No skills yet — upload a .md file or find one in the marketplace.</p>
          </div>
        {:else}
          <div class="skills-grid">
            {#each skills as skill (skill.id)}
              <SkillCard 
                {skill} 
                onDelete={handleDelete} 
                onToggle={handleToggle} 
              />
            {/each}
          </div>
        {/if}
      </div>
    {:else if currentView === 'find-skills'}
      <SkillSearch />
    {:else if currentView === 'create-skill'}
      {#key skillCreatorKey}
        <SkillCreator />
      {/key}
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

  .my-skills-view {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .actions-bar {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .btn-primary:hover {
    background-color: var(--color-primary-hover);
  }

  .skills-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--spacing-md);
    padding-bottom: var(--spacing-xl);
  }

  .empty-state, .loading, .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-secondary);
    text-align: center;
  }

  .error {
    color: var(--color-error);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
  }
</style>