<script lang="ts">
  /**
   * BatchProfileSelector — Site profile selection, local model status,
   * session resume UI, and auto-extract rubric on page load.
   */
  import { onMount, onDestroy, untrack } from 'svelte';
  import {
    DEFAULT_MYOPENMATH_PROFILE,
    BUILT_IN_PROFILES,
    extractRubric,
    extractPageContent,
    isRubricSufficient,
  } from '../../../lib/batch-grader';
  import type { SiteProfile, Rubric } from '../../../lib/batch-grader';
  import { ProfileStorageImpl } from '../../../lib/site-profiles';
  import { getSetting } from '../../../lib/db';
  import { getEmbeddedUrl } from '../../../lib/browser';
  import { refreshPageData } from '../../../lib/page-refresh';
  import { formatRubricForDisplay } from './format';

  // ── Props ──────────────────────────────────────────────────────────────
  let {
    isBatchRunning = false,
    pageLoadedUrl = '',
    refreshKey = 0,
    preselectedProfileId = null as string | null,
    onRequestDiscovery = () => {},
    batchPhase = 'idle' as string,
    sourceRubricId = null as string | null,
    externalProfile = null as SiteProfile | null,
    // Bindable — exposed to shell
    activeProfile = $bindable<SiteProfile>(DEFAULT_MYOPENMATH_PROFILE),
    currentPageUrl = $bindable(''),
    savedSessionStudent = $bindable<string | null>(null),
    profileWarning = $bindable(''),
    localEmbedEnabled = $bindable(false),
    localModelLoaded = $bindable(true),
    // Rubric bindables — auto-extract writes these
    rubricText = $bindable(''),
    rubricMaxScore = $bindable('10'),
    extractedRubric = $bindable<Rubric | null>(null),
    essayPrompt = $bindable(''),
    // Resume
    resumeAfter = $bindable(''),
    // Callbacks for resume actions (shell forwards to Progress)
    onResumeSession = () => {},
    onStartFresh = () => {},
  } = $props();

  // ── Internal State ─────────────────────────────────────────────────────
  let selectedProfileId = $state('auto');
  let detectedProfile = $state<SiteProfile | null>(null);
  let allProfiles = $state<SiteProfile[]>([]);
  let embedPollAttempts = 0;
  const MAX_EMBED_POLL_ATTEMPTS = 30;
  let embedLoadFailed = $state(false);
  let embedStatusInterval: ReturnType<typeof setInterval> | null = null;

  // ── Derived ────────────────────────────────────────────────────────────
  let computedActiveProfile = $derived<SiteProfile>(
    externalProfile
      ? externalProfile
      : selectedProfileId === 'auto'
        ? (detectedProfile ?? DEFAULT_MYOPENMATH_PROFILE)
        : allProfiles.find(p => p.id === selectedProfileId) ?? DEFAULT_MYOPENMATH_PROFILE
  );

  let profileDescription = $derived(
    computedActiveProfile.navigation.mode === 'batch'
      ? `Profile: ${computedActiveProfile.name} (Batch — all students on page)`
      : `Profile: ${computedActiveProfile.name} (Sequential — one at a time)`
  );

  // Keep parent's activeProfile in sync with computed value
  $effect(() => { activeProfile = computedActiveProfile; });

  // ── Page Data Refresh ──────────────────────────────────────────────────
  export async function doRefreshPageData() {
    const url = pageLoadedUrl || currentPageUrl;
    const result = await refreshPageData(url);
    currentPageUrl = result.pageUrl;
    detectedProfile = result.detectedProfile;
    profileWarning = result.detectedProfile
      ? ''
      : '⚠ No profile found for this site. Using MyOpenMath default.';
    savedSessionStudent = result.savedSessionStudent;
  }

  // ── Auto-extract rubric on page load ───────────────────────────────────
  async function autoExtractRubric() {
    if (batchPhase !== 'idle') return;
    if (sourceRubricId !== null) return;

    try {
      const rubric = await extractRubric(computedActiveProfile.selectors);
      if (isRubricSufficient(rubric)) {
        extractedRubric = rubric;
        rubricText = formatRubricForDisplay(rubric);
        rubricMaxScore = rubric.maxScore || '10';
        essayPrompt = rubric.essayPrompt || '';
      } else {
        if (rubric.essayPrompt || rubric.rubricItems?.length || rubric.checklistItems?.length) {
          rubricText = formatRubricForDisplay(rubric);
          rubricMaxScore = rubric.maxScore || '10';
          essayPrompt = rubric.essayPrompt || '';
        }
        if (!rubricText) {
          const pageContent = await extractPageContent();
          if (pageContent.content) {
            essayPrompt = essayPrompt || pageContent.content;
            rubricText = pageContent.content;
          }
        }
      }
    } catch {
      try {
        const pageContent = await extractPageContent();
        if (pageContent.content) {
          essayPrompt = pageContent.content;
          rubricText = pageContent.content;
        }
      } catch {
        // Completely silent
      }
    }
  }

  // Effect: auto-extract when profile is detected
  $effect(() => {
    const profile = detectedProfile;
    const url = currentPageUrl;
    if (!profile || !url) return;
    if (batchPhase !== 'idle') return;
    if (sourceRubricId !== null) return;
    autoExtractRubric();
  });

  // ── Mount: load profiles, detect URL, check embed status ──────────────
  onMount(async () => {
    try {
      const storage = new ProfileStorageImpl();
      allProfiles = await storage.listProfiles();
    } catch {
      allProfiles = BUILT_IN_PROFILES;
    }

    try {
      currentPageUrl = (await getEmbeddedUrl()) || '';
    } catch {
      currentPageUrl = '';
    }

    // Check local embedding status
    const useLocal = await getSetting('use_local_embedding');
    if (useLocal === 'true') {
      localEmbedEnabled = true;
      try {
        const res = await fetch('http://localhost:3456/api/embed-status');
        if (res.ok) {
          const data = await res.json();
          localModelLoaded = data.modelLoaded;
        }
      } catch (e) {
        console.error('Failed to check embed status', e);
      }

      if (!localModelLoaded) {
        // Kick off background warm-up so the model loads while the user sets up grading
        fetch('http://localhost:3456/api/warm-embed', { method: 'POST' }).catch(() => {});

        embedStatusInterval = setInterval(async () => {
          embedPollAttempts++;
          if (embedPollAttempts >= MAX_EMBED_POLL_ATTEMPTS) {
            if (embedStatusInterval) clearInterval(embedStatusInterval);
            embedStatusInterval = null;
            embedLoadFailed = true;    // show failure warning (spinner hidden via template)
            localEmbedEnabled = false; // disable local embedding
            return;
          }
          try {
            const res = await fetch('http://localhost:3456/api/embed-status');
            if (res.ok) {
              const data = await res.json();
              if (data.modelLoaded) {
                localModelLoaded = true;
                if (embedStatusInterval) {
                  clearInterval(embedStatusInterval);
                  embedStatusInterval = null;
                }
              } else if (data.error) {
                // Server reports a definitive load failure — stop polling immediately
                if (embedStatusInterval) clearInterval(embedStatusInterval);
                embedStatusInterval = null;
                embedLoadFailed = true;    // show failure warning (spinner hidden via template)
                localEmbedEnabled = false; // disable local embedding
              }
            }
          } catch (e) {
            console.error('Polling embed status failed', e);
          }
        }, 2000);
      }
    }

    // Detect profile + check saved session
    await doRefreshPageData();

    // Pre-select profile if returning from discovery
    if (preselectedProfileId) {
      const found = allProfiles.find(p => p.id === preselectedProfileId);
      if (found) {
        selectedProfileId = preselectedProfileId;
      }
    }
  });

  onDestroy(() => {
    if (embedStatusInterval) clearInterval(embedStatusInterval);
  });
</script>

<!-- ── Local Model Banner ──────────────────────────────────────────── -->
{#if localEmbedEnabled && !localModelLoaded && !embedLoadFailed}
  <div class="local-model-banner">
    <span class="spinner">⏳</span>
    Loading local embedding model... (first use only)
  </div>
{:else if embedLoadFailed}
  <div class="local-model-banner local-model-banner--error">
    ⚠️ Local embedding model failed to load. Falling back to cloud embeddings.
  </div>
{/if}

<!-- ── Site Profile Selection ──────────────────────────────────────── -->
{#if !externalProfile}
<details class="section-details">
  <summary class="section-summary">
    <span>Site Profile</span>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
  </summary>
  <div class="section-content">
    <div class="dropdown-row">
      <select
        class="profile-select"
        bind:value={selectedProfileId}
        disabled={isBatchRunning}
      >
        <option value="auto">Auto-detect profile</option>
        {#each allProfiles as profile (profile.id)}
          <option value={profile.id}>
            {profile.name}
            {#if profile.isBuiltIn}
              (built-in)
            {/if}
          </option>
        {/each}
      </select>
      <button
        class="btn-secondary small new-profile-btn"
        onclick={() => onRequestDiscovery()}
        disabled={isBatchRunning}
      >New Profile</button>
    </div>
    {#if profileWarning}
      <div class="profile-warning">
        <small>{profileWarning}</small>
      </div>
    {/if}
    <div class="profile-description">
      <small class="text-muted">{profileDescription}</small>
    </div>
  </div>
</details>
{/if}

<!-- ── Resume After ────────────────────────────────────────────────── -->
{#if batchPhase === 'idle'}
  {#if savedSessionStudent}
    <div class="resume-session-card">
      <div class="resume-session-info">
        <span class="resume-icon">&#8635;</span>
        <span class="resume-text">Previous session stopped at <strong>{savedSessionStudent}</strong></span>
      </div>
      <div class="resume-session-actions">
        <button class="btn-primary small" onclick={() => onResumeSession()}>
          Resume from {savedSessionStudent}
        </button>
        <button class="btn-secondary small" onclick={() => onStartFresh()}>
          Start Fresh
        </button>
      </div>
    </div>
  {:else}
    <div class="resume-row">
      <label for="batch-resume-after" class="resume-label">Resume After:</label>
      <input
        id="batch-resume-after"
        type="text"
        class="resume-input"
        placeholder="Student Name (optional)"
        bind:value={resumeAfter}
      />
    </div>
  {/if}
{/if}

<style>
  /* ── Local Model Banner ── */
  .local-model-banner {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #f59e0b;
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-4);
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.8;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Collapsible Details Sections ── */
  .section-details {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .section-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    background: var(--color-bg-main);
    user-select: none;
    list-style: none;
  }

  .section-summary::-webkit-details-marker {
    display: none;
  }

  .section-summary .chevron {
    transition: transform 0.2s ease;
    color: var(--color-text-secondary);
  }

  .section-details[open] .chevron {
    transform: rotate(180deg);
  }

  .section-content {
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  /* ── Dropdown Row ── */
  .dropdown-row {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
  }

  .new-profile-btn {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .profile-select {
    flex: 1;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.85rem;
  }

  .profile-select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .profile-warning {
    padding: var(--spacing-1) var(--spacing-2);
    background: var(--color-warning-bg, rgba(255, 193, 7, 0.1));
    border-left: 3px solid var(--color-warning, #ffc107);
    border-radius: var(--radius-md);
    font-size: 0.8rem;
    color: var(--color-warning-text, #856404);
  }

  .profile-description {
    padding: var(--spacing-1) var(--spacing-2);
    background: var(--color-primary-bg);
    border-radius: var(--radius-md);
    font-size: 0.8rem;
  }

  /* ── Resume After ── */
  .resume-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .resume-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .resume-input {
    flex: 1;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
  }

  .resume-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  /* ── Resume Session Card ── */
  .resume-session-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-primary-bg);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
  }

  .resume-session-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: 0.85rem;
    color: var(--color-text-primary);
  }

  .resume-icon {
    font-size: 1.2rem;
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .resume-text strong {
    color: var(--color-primary);
  }

  .resume-session-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .resume-session-actions .btn-primary {
    flex: 1;
  }

  .resume-session-actions .btn-secondary {
    flex-shrink: 0;
  }
</style>
