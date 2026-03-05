<script lang="ts">
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../../lib/db';

  let currentTheme = 'dark';

  onMount(async () => {
    await loadTheme();
  });

  async function loadTheme() {
    const theme = await getSetting('theme');
    currentTheme = theme || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
  }

  async function setTheme(theme: string) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    await setSetting('theme', theme);
  }
</script>

<!-- Appearance Section -->
<section class="card mb-6">
  <h3>Appearance</h3>
  <p class="mb-6">Customize the look and feel of the application.</p>
  
  <div class="theme-selector">
    <button 
      class="theme-btn {currentTheme === 'dark' ? 'active' : ''}" 
      onclick={() => setTheme('dark')}
    >
      <span class="icon">🌙</span>
      <div class="theme-info">
        <span class="name">Dark Mode</span>
        <span class="desc">Technical & Precise</span>
      </div>
      {#if currentTheme === 'dark'}
        <span class="check">✓</span>
      {/if}
    </button>

    <button 
      class="theme-btn {currentTheme === 'light' ? 'active' : ''}" 
      onclick={() => setTheme('light')}
    >
      <span class="icon">☀️</span>
      <div class="theme-info">
        <span class="name">Light Mode</span>
        <span class="desc">Playful & Friendly</span>
      </div>
      {#if currentTheme === 'light'}
        <span class="check">✓</span>
      {/if}
    </button>
  </div>
</section>

<style>
  .theme-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-4);
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    background: var(--color-bg-main);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    position: relative;
    overflow: hidden;
  }

  .theme-btn:hover {
    border-color: var(--color-border-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .theme-btn.active {
    border-color: var(--color-primary);
    background: var(--color-bg-card-hover);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .theme-btn .icon {
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: var(--color-bg-sidebar);
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
  }

  .theme-btn.active .icon {
    background: var(--color-primary-bg);
    border-color: var(--color-primary);
  }

  .theme-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .theme-info .name {
    font-weight: 700;
    color: var(--color-text-primary);
    font-size: 1rem;
  }

  .theme-info .desc {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .theme-btn .check {
    color: var(--color-primary);
    font-weight: bold;
    font-size: 1.2rem;
  }
</style>
