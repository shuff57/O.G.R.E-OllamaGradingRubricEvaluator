<script lang="ts">
  import ThemeSettings from './ThemeSettings.svelte';
  import ProviderSettings from './ProviderSettings.svelte';
  import CredentialSettings from './CredentialSettings.svelte';
  import EmbeddingSettings from './EmbeddingSettings.svelte';
  import ColumnSettings from './ColumnSettings.svelte';
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
</div>
