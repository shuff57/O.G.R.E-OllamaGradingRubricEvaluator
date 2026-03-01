<script lang="ts">
  import type { Skill } from '../../lib/db';
  import { renderSkillPreview } from '../../lib/skill-parser';

  let { skill, onDelete, onToggle } = $props<{
    skill: Skill;
    onDelete: (id: string) => void;
    onToggle: (id: string, isActive: number) => void;
  }>();

  let expanded = $state(false);

  function getSourceLabel(skill: Skill): string {
    if (skill.source === 'local') return 'Local';
    if (!skill.source || skill.source === 'created') return 'Created';
    return 'Marketplace';
  }

  function getSourceClass(skill: Skill): string {
    if (skill.source === 'local') return 'badge-local';
    if (!skill.source || skill.source === 'created') return 'badge-created';
    return 'badge-marketplace';
  }

  function handleDelete(e: Event) {
    e.stopPropagation();
    if (confirm('Delete this skill?')) {
      onDelete(skill.id);
    }
  }

  function handleToggle(e: Event) {
    e.stopPropagation();
    // Toggle between 1 and 0
    const newValue = skill.is_active === 1 ? 0 : 1;
    onToggle(skill.id, newValue);
  }

  function toggleExpanded() {
    expanded = !expanded;
  }
</script>

<div class="skill-card card" onclick={toggleExpanded} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && toggleExpanded()}>
  <div class="card-header">
    <div class="title-section">
      <h3>{skill.name}</h3>
      <span class="badge {getSourceClass(skill)}">{getSourceLabel(skill)}</span>
      {#if skill.url_pattern}
        <span class="badge badge-url" title="Auto-injects when browsing this site">🌐 {skill.url_pattern.length > 30 ? skill.url_pattern.slice(0, 30) + '…' : skill.url_pattern}</span>
      {/if}
    </div>
    <div class="actions">
      <label class="switch" onclick={(e) => e.stopPropagation()}>
        <input 
          type="checkbox" 
          checked={skill.is_active === 1} 
          onchange={handleToggle}
        >
        <span class="slider round"></span>
      </label>
      <button class="btn-icon delete-btn" onclick={handleDelete} aria-label="Delete skill">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  </div>

  <div class="card-body">
    <p class="description">{skill.description}</p>
    
    {#if expanded}
      <div class="preview" onclick={(e) => e.stopPropagation()}>
        <div class="preview-header">Preview</div>
        {#await renderSkillPreview(skill.content)}
          <div class="loading">Loading preview...</div>
        {:then html}
          <div class="markdown-content">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html html}
          </div>
        {:catch error}
          <div class="error">Error rendering preview: {error.message}</div>
        {/await}
      </div>
    {/if}
  </div>
</div>

<style>
  .skill-card {
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid var(--color-border);
  }

  .skill-card:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-2);
  }

  .title-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    flex: 1;
    min-width: 0; /* Enable truncation */
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .badge {
    align-self: flex-start;
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    border: 1px solid currentColor;
  }

  .badge-local {
    color: var(--color-secondary);
    background-color: rgba(210, 168, 255, 0.1);
  }

  .badge-created {
    color: var(--color-success);
    background-color: var(--color-success-bg);
  }

  .badge-marketplace {
    color: var(--color-primary);
    background-color: var(--color-primary-bg);
  }

  .badge-url {
    color: var(--color-secondary);
    background-color: rgba(210, 168, 255, 0.1);
    font-size: 0.65rem;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    flex-shrink: 0;
  }

  .description {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
  }

  .preview {
    margin-top: var(--spacing-4);
    padding-top: var(--spacing-4);
    border-top: 1px dashed var(--color-border);
    cursor: default;
  }

  .preview-header {
    font-size: 0.8rem;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-2);
    font-weight: 600;
  }

  .markdown-content {
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--color-text-primary);
  }

  /* Switch Toggle */
  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    transition: .3s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 2px;
    bottom: 2px;
    background-color: var(--color-text-muted);
    transition: .3s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: var(--color-success-bg);
    border-color: var(--color-success);
  }

  input:checked + .slider:before {
    transform: translateX(16px);
    background-color: var(--color-success);
  }

  .slider.round {
    border-radius: 20px;
  }

  .delete-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    transition: all 0.2s;
  }

  .delete-btn:hover {
    color: var(--color-error);
    background-color: var(--color-error-bg);
  }

  /* Markdown Content Styles */
  .markdown-content :global(h1), 
  .markdown-content :global(h2), 
  .markdown-content :global(h3) {
    margin-top: 1em;
    margin-bottom: 0.5em;
    font-size: 1.1em;
  }

  .markdown-content :global(p) {
    margin-bottom: 0.8em;
  }

  .markdown-content :global(ul), 
  .markdown-content :global(ol) {
    padding-left: 1.5em;
    margin-bottom: 0.8em;
  }

  .markdown-content :global(code) {
    background-color: var(--color-bg-main);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.85em;
  }

  .markdown-content :global(pre) {
    background-color: var(--color-bg-main);
    padding: 1em;
    border-radius: var(--radius-md);
    overflow-x: auto;
  }
</style>
