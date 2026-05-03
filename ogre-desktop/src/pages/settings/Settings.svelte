<script lang="ts">
  import ThemeSettings from './ThemeSettings.svelte';
  import ProviderSettings from './ProviderSettings.svelte';
  import CredentialSettings from './CredentialSettings.svelte';
  import EmbeddingSettings from './EmbeddingSettings.svelte';
  import ColumnSettings from './ColumnSettings.svelte';

  // Injected by Vite define() (declared in src/types/globals.d.ts)
  const appVersion = __APP_VERSION__;
</script>

<div>
  <header class="mb-6">
    <h1>Settings</h1>
    <p class="text-muted">Configure AI providers and application preferences</p>
  </header>

  <ThemeSettings />
  <ProviderSettings />
  <CredentialSettings />
  <EmbeddingSettings />
  <ColumnSettings />

  <section class="about">
    <h2>About</h2>
    <dl>
      <dt>Version</dt>
      <dd><code>{appVersion}</code></dd>
    </dl>
  </section>
</div>

<style>
  .about {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--color-border);
  }
  .about h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: var(--color-text-primary);
  }
  .about dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }
  .about dt {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }
  .about dd {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 0.9rem;
  }
  .about code {
    font-family: var(--font-mono);
  }
</style>
