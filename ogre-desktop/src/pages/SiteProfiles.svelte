<script lang="ts">
  import ProfileManager from '../components/grading/ProfileManager.svelte';
</script>

<div class="site-profiles-page">
  <ProfileManager />
</div>

<style>
  .site-profiles-page {
    padding: var(--spacing-4);
    height: 100%;
    overflow-y: auto;
  }
</style>
