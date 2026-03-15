<script lang="ts">
  import { getSkillsWithUrlPattern } from '../../lib/db';
  import { findMatchingProfiles } from '../../lib/skills-api';
  import { selectBestProfile } from '../../lib/profile-precedence';
  import { updateSkillActive } from '../../lib/db';
  import type { Skill } from '../../lib/db';

  let { pageLoadedUrl = '' } = $props<{ pageLoadedUrl?: string }>();

  let bestProfile = $state<Skill | null>(null);
  let matchCount = $state(0);
  let loading = $state(true);

  $effect(() => {
    loadProfile(pageLoadedUrl);
  });

  async function loadProfile(url: string) {
    loading = true;
    try {
      const all = await getSkillsWithUrlPattern();
      const matches = findMatchingProfiles(url, all);
      matchCount = matches.length;
      bestProfile = selectBestProfile(matches);
    } catch {
      bestProfile = null;
      matchCount = 0;
    } finally {
      loading = false;
    }
  }

  async function toggleActive() {
    if (!bestProfile) return;
    const newActive = bestProfile.is_active === 1 ? 0 : 1;
    await updateSkillActive(bestProfile.id, newActive);
    // Reload to reflect new state
    await loadProfile(pageLoadedUrl);
  }
</script>

{#if !loading}
  <div class="guide-status">
    {#if bestProfile}
      <div class="guide-info">
        <span class="status-dot" class:active={bestProfile.is_active === 1} class:inactive={bestProfile.is_active === 0}>
          {bestProfile.is_active === 1 ? '🟢' : '🟡'}
        </span>
        <span class="guide-name">Site Guide: {bestProfile.name}</span>
        <span class="guide-state">{bestProfile.is_active === 1 ? 'Active' : 'Inactive'}</span>
         {#if matchCount > 1}
           <span class="multi-match">({matchCount} profiles match)</span>
         {/if}
        <button class="toggle-btn" onclick={toggleActive}>
          {bestProfile.is_active === 1 ? 'Disable' : 'Enable'}
        </button>
      </div>
    {:else}
      <div class="guide-empty">
        <span class="status-dot none">⚪</span>
        <span class="guide-name muted">No site guide for this page</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .guide-status {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 12px;
    font-size: 0.85rem;
  }

  .guide-info, .guide-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-secondary, #f5f5f5);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #e0e0e0);
  }

  .status-dot {
    font-size: 0.9em;
  }
  
  .status-dot.none {
    opacity: 0.5;
  }

  .guide-name {
    font-weight: 500;
    color: var(--text-primary, #333);
  }

  .guide-name.muted {
    color: var(--text-secondary, #666);
    font-weight: normal;
  }

  .guide-state {
    color: var(--text-secondary, #666);
  }

  .multi-match {
    color: var(--text-secondary, #666);
    font-style: italic;
    font-size: 0.9em;
  }

  .toggle-btn {
    background: transparent;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.85em;
    cursor: pointer;
    color: var(--text-primary, #333);
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    background: var(--bg-hover, #ebebeb);
  }

  /* Dark mode overrides if needed based on CSS variables */
  @media (prefers-color-scheme: dark) {
    .guide-info, .guide-empty {
      background: var(--bg-secondary, #2a2a2a);
      border-color: var(--border-color, #444);
    }
    .guide-name {
      color: var(--text-primary, #eaeaea);
    }
    .guide-name.muted, .guide-state, .multi-match {
      color: var(--text-secondary, #aaa);
    }
    .toggle-btn {
      color: var(--text-primary, #eaeaea);
      border-color: var(--border-color, #444);
    }
    .toggle-btn:hover {
      background: var(--bg-hover, #3a3a3a);
    }
  }
</style>
