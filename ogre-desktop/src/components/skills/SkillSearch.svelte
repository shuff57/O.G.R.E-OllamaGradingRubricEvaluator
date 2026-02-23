<script lang="ts">
  /**
   * SkillSearch — Marketplace search UI for finding and installing skills from skills.sh.
   * Uses Svelte 5 runes ($state, $effect) exclusively.
   */
  import {
    searchSkills,
    fetchTrendingSkills,
    fetchSkillContent,
    installSkill,
    type SkillSearchResult,
  } from '../../lib/skills-api';

  // ── State ──────────────────────────────────────────────────────────────

  let query = $state('');
  let results = $state<SkillSearchResult[]>([]);
  let loading = $state(false);
  let error = $state('');
  let selectedSkill = $state<SkillSearchResult | null>(null);
  let selectedContent = $state('');
  let contentLoading = $state(false);
  let installedIds = $state<Set<string>>(new Set());
  let installSuccess = $state('');

  // ── Debounced search via $effect ───────────────────────────────────────

  $effect(() => {
    const q = query.trim();

    if (!q) {
      // Load trending on empty query
      loading = true;
      error = '';
      fetchTrendingSkills()
        .then((skills) => {
          results = skills;
        })
        .catch(() => {
          error = 'Could not reach skills.sh. Check your internet connection.';
        })
        .finally(() => {
          loading = false;
        });
      return;
    }

    loading = true;
    error = '';

    const timer = setTimeout(() => {
      searchSkills(q)
        .then((skills) => {
          results = skills;
          if (skills.length === 0 && q) {
            error = `No skills found for "${q}".`;
          }
        })
        .catch(() => {
          error = 'Could not reach skills.sh. Check your internet connection.';
        })
        .finally(() => {
          loading = false;
        });
    }, 300);

    return () => clearTimeout(timer);
  });

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleSelect(skill: SkillSearchResult) {
    if (selectedSkill?.skillId === skill.skillId) {
      // Toggle off
      selectedSkill = null;
      selectedContent = '';
      return;
    }

    selectedSkill = skill;
    selectedContent = '';
    contentLoading = true;

    try {
      const content = await fetchSkillContent(skill.source, skill.skillId);
      selectedContent = content;
    } catch {
      selectedContent = '> Failed to load skill content.';
    } finally {
      contentLoading = false;
    }
  }

  async function handleInstall() {
    if (!selectedSkill || !selectedContent) return;

    try {
      const result = await installSkill({
        skillId: selectedSkill.skillId,
        name: selectedSkill.name,
        source: selectedSkill.source,
        description: selectedSkill.description ?? '',
        content: selectedContent,
      });

      installedIds = new Set([...installedIds, selectedSkill.skillId]);

      if (result.installed) {
        installSuccess = `"${selectedSkill.name}" installed successfully!`;
      } else {
        installSuccess = `"${selectedSkill.name}" was already installed.`;
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        installSuccess = '';
      }, 3000);
    } catch {
      error = 'Failed to install skill. Please try again.';
    }
  }

  function renderPreview(content: string): string {
    // Escape HTML entities for safe rendering in <pre>
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
</script>

<div class="skill-search">
  <!-- Search Input -->
  <div class="search-bar">
    <input
      type="text"
      placeholder="Search skills.sh marketplace…"
      bind:value={query}
    />
    {#if loading}
      <span class="search-spinner">⟳</span>
    {/if}
  </div>

  <!-- Success Message -->
  {#if installSuccess}
    <div class="success-banner">{installSuccess}</div>
  {/if}

  <!-- Error State -->
  {#if error && !loading}
    <div class="error-banner">{error}</div>
  {/if}

  <!-- Results List -->
  <div class="results-list">
    {#if !loading && results.length === 0 && !error}
      <div class="empty-state">
        <p>Type a query to search the skills.sh marketplace.</p>
      </div>
    {/if}

    {#each results as skill (skill.id)}
      <button
        class="skill-card"
        class:selected={selectedSkill?.skillId === skill.skillId}
        onclick={() => handleSelect(skill)}
      >
        <div class="skill-card-header">
          <span class="skill-name">{skill.name}</span>
          {#if installedIds.has(skill.skillId)}
            <span class="badge-installed">Installed ✓</span>
          {/if}
        </div>
        <div class="skill-meta">
          <span class="skill-source">{skill.source}</span>
          <span class="skill-installs">{skill.installs} installs</span>
        </div>
        {#if skill.description}
          <p class="skill-description">{skill.description}</p>
        {/if}
      </button>

      <!-- Expanded Preview -->
      {#if selectedSkill?.skillId === skill.skillId}
        <div class="skill-preview">
          {#if contentLoading}
            <div class="preview-loading">Loading content…</div>
          {:else}
            <div class="preview-actions">
              {#if installedIds.has(skill.skillId)}
                <span class="badge-installed">Already Installed ✓</span>
              {:else}
                <button
                  class="btn-install"
                  onclick={handleInstall}
                  disabled={!selectedContent}
                >
                  Install Skill
                </button>
              {/if}
            </div>
            <pre class="preview-content">{@html renderPreview(selectedContent)}</pre>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .skill-search {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4, 1rem);
    height: 100%;
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-bar input {
    width: 100%;
    padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
    padding-right: 2.5rem;
    border-radius: var(--radius-md, 4px);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-card);
    color: var(--color-text-primary);
    font-size: 0.95rem;
  }

  .search-bar input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-bg);
  }

  .search-spinner {
    position: absolute;
    right: var(--spacing-3, 0.75rem);
    animation: spin 1s linear infinite;
    color: var(--color-primary);
    font-size: 1.1rem;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .success-banner {
    padding: var(--spacing-3, 0.75rem);
    border-radius: var(--radius-md, 4px);
    background-color: var(--color-success-bg);
    color: var(--color-success);
    border: 1px solid var(--color-success);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .error-banner {
    padding: var(--spacing-3, 0.75rem);
    border-radius: var(--radius-md, 4px);
    background-color: var(--color-error-bg);
    color: var(--color-error);
    border: 1px solid var(--color-error);
    font-size: 0.875rem;
  }

  .results-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2, 0.5rem);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-8, 2rem);
    color: var(--color-text-secondary);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
  }

  .skill-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: left;
    padding: var(--spacing-4, 1rem);
    border-radius: var(--radius-md, 4px);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-card);
    cursor: pointer;
    transition: all var(--transition-fast, 100ms);
    width: 100%;
    gap: var(--spacing-2, 0.5rem);
  }

  .skill-card:hover {
    border-color: var(--color-border-hover);
    background-color: var(--color-bg-card-hover);
  }

  .skill-card.selected {
    border-color: var(--color-primary);
    background-color: var(--color-primary-bg);
  }

  .skill-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2, 0.5rem);
  }

  .skill-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  .badge-installed {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-full, 9999px);
    background-color: var(--color-success-bg);
    color: var(--color-success);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .skill-meta {
    display: flex;
    gap: var(--spacing-4, 1rem);
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .skill-source {
    font-family: var(--font-mono);
  }

  .skill-installs {
    color: var(--color-text-muted);
  }

  .skill-description {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .skill-preview {
    padding: var(--spacing-4, 1rem);
    border-radius: var(--radius-md, 4px);
    border: 1px solid var(--color-border);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    background-color: var(--color-bg-main);
  }

  .preview-loading {
    padding: var(--spacing-4, 1rem);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .preview-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-3, 0.75rem);
    margin-bottom: var(--spacing-4, 1rem);
  }

  .btn-install {
    padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
    border-radius: var(--radius-md, 4px);
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border: none;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color var(--transition-fast, 100ms);
  }

  .btn-install:hover {
    background-color: var(--color-primary-hover);
  }

  .btn-install:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preview-content {
    max-height: 400px;
    overflow-y: auto;
    padding: var(--spacing-4, 1rem);
    border-radius: var(--radius-md, 4px);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-card);
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
</style>
