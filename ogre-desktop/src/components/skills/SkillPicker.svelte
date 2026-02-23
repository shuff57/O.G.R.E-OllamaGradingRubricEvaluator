<script lang="ts">
  import { getSkills, updateSkillActive } from '../../lib/db';
  import { getSkillInjectionSize } from '../../lib/skills-api';
  import type { Skill } from '../../lib/db';

  let skills = $state<Skill[]>([]);
  let isOpen = $state(false);
  let injectionSize = $state({ charCount: 0, skillCount: 0 });

  const CONTEXT_WARNING_THRESHOLD = 4000;

  $effect(() => {
    loadSkills();
  });

  async function loadSkills() {
    skills = await getSkills();
    injectionSize = await getSkillInjectionSize();
  }

  async function toggleSkill(skill: Skill) {
    const newActive = skill.is_active === 1 ? 0 : 1;
    await updateSkillActive(skill.id, newActive);
    await loadSkills();
  }

  function getSourceBadge(skill: Skill): string {
    if (skill.source) return 'marketplace';
    return 'custom';
  }
</script>

<div class="skill-picker">
  <button
    class="picker-toggle"
    onclick={() => isOpen = !isOpen}
    type="button"
  >
    <span class="picker-label">
      {injectionSize.skillCount > 0
        ? `${injectionSize.skillCount} skill${injectionSize.skillCount !== 1 ? 's' : ''} active`
        : 'No skills active'}
    </span>
    <span class="picker-chevron" class:open={isOpen}>▶</span>
  </button>

  {#if isOpen}
    <div class="picker-dropdown">
      {#if skills.length === 0}
        <div class="picker-empty">No skills installed. Add skills in Settings.</div>
      {:else}
        <ul class="skill-list">
          {#each skills as skill (skill.id)}
            <li class="skill-row">
              <label class="skill-check">
                <input
                  type="checkbox"
                  checked={skill.is_active === 1}
                  onchange={() => toggleSkill(skill)}
                />
                <span class="skill-name">{skill.name}</span>
                <span class="skill-badge badge-{getSourceBadge(skill)}">{getSourceBadge(skill)}</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}

      {#if injectionSize.charCount > CONTEXT_WARNING_THRESHOLD}
        <div class="context-warning">
          Active skills use {injectionSize.charCount.toLocaleString()} chars of context — consider deactivating some for better quality
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .skill-picker {
    position: relative;
  }

  .picker-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-2, 8px);
    padding: var(--spacing-1, 4px) var(--spacing-2, 8px);
    background: var(--color-bg-card, #1e1e2e);
    border: 1px solid var(--color-border, #333);
    border-radius: var(--radius-sm, 4px);
    color: var(--color-text-secondary, #999);
    font-size: 0.8rem;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }

  .picker-toggle:hover {
    border-color: var(--color-text-secondary, #666);
  }

  .picker-chevron {
    font-size: 0.6rem;
    transition: transform 0.15s ease;
  }

  .picker-chevron.open {
    transform: rotate(90deg);
  }

  .picker-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    min-width: 240px;
    margin-top: var(--spacing-1, 4px);
    background: var(--color-bg-card, #1e1e2e);
    border: 1px solid var(--color-border, #333);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.3));
    z-index: 50;
    padding: var(--spacing-2, 8px);
  }

  .picker-empty {
    font-size: 0.8rem;
    color: var(--color-text-secondary, #999);
    text-align: center;
    padding: var(--spacing-2, 8px);
  }

  .skill-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1, 4px);
  }

  .skill-row {
    border-radius: var(--radius-sm, 4px);
    transition: background-color 0.1s ease;
  }

  .skill-row:hover {
    background-color: var(--color-bg-main, #181825);
  }

  .skill-check {
    display: flex;
    align-items: center;
    gap: var(--spacing-2, 8px);
    padding: var(--spacing-1, 4px) var(--spacing-2, 8px);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .skill-check input[type='checkbox'] {
    accent-color: var(--color-primary, #3b82f6);
    cursor: pointer;
  }

  .skill-name {
    flex: 1;
    color: var(--color-text-primary, #e0e0e0);
  }

  .skill-badge {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 4px);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .badge-marketplace {
    background-color: var(--color-primary-bg, rgba(59, 130, 246, 0.15));
    color: var(--color-primary, #3b82f6);
  }

  .badge-custom {
    background-color: var(--color-success-bg, rgba(34, 197, 94, 0.15));
    color: var(--color-success, #22c55e);
  }

  .context-warning {
    margin-top: var(--spacing-2, 8px);
    padding: var(--spacing-2, 8px);
    font-size: 0.78rem;
    color: var(--color-warning, #f59e0b);
    background-color: var(--color-warning-bg, rgba(245, 158, 11, 0.1));
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--color-warning, #f59e0b);
  }
</style>