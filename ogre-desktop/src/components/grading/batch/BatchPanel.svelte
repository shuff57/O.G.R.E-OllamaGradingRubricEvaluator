<script lang="ts">
  /**
   * BatchPanel — Shell that composes batch grading sub-components.
   *
   * Receives 13 props from GradingPanel (7 bindable) and distributes
   * state to BatchProfileSelector, BatchInstructions, BatchProgress,
   * and BatchResults. BatchProgress owns the grading lifecycle and
   * exposes methods called by the shell on behalf of other components.
   */
  import { untrack } from 'svelte';
  import BatchProfileSelector from './BatchProfileSelector.svelte';
  import BatchInstructions from './BatchInstructions.svelte';
  import BatchProgress from './BatchProgress.svelte';
  import BatchResults from './BatchResults.svelte';
  import type { SavedRubric } from '../../../lib/rubric-api';
  import type { Rubric, SiteProfile } from '../../../lib/batch-grader';
  import { DEFAULT_MYOPENMATH_PROFILE } from '../../../lib/batch-grader';

  // ── Props from GradingPanel (13 props, 7 bindable) ─────────────────────
  type BatchPhase = 'idle' | 'extracting' | 'review' | 'grading' | 'done';
  let {
    provider = '',
    model = '',
    isBatchRunning = $bindable(false),
    preselectedProfileId = null as string | null,
    pageLoadedUrl = '',
    refreshKey = 0,
    selectedRubric = null as SavedRubric | null,
    onRequestDiscovery = () => {},
    rubricText = $bindable(''),
    rubricMaxScore = $bindable('10'),
    extractedRubric = $bindable<Rubric | null>(null),
    sourceRubricId = $bindable<string | null>(null),
    batchPhase = $bindable<BatchPhase>('idle'),
    essayPrompt = $bindable(''),
    externalProfile = null as SiteProfile | null,
    leniency = 50,
    isRubricRewriting = false,
    originalRubricText = $bindable(''),
  } = $props();

  // ── Bridging state between sub-components ──────────────────────────────
  // ProfileSelector → shell → Progress
  let activeProfile = $state<SiteProfile>(DEFAULT_MYOPENMATH_PROFILE);

  // When GradingPanel provides a globally-selected profile, override local selection
  $effect(() => {
    if (externalProfile) activeProfile = externalProfile;
  });
  let currentPageUrl = $state('');
  let savedSessionStudent = $state<string | null>(null);
  let resumeAfter = $state('');
  let profileWarning = $state('');
  let localEmbedEnabled = $state(false);
  let localModelLoaded = $state(true);

  // Instructions → shell → Progress
  let forceRegrade = $state(false);
  let isReviewMode = $state(false);
  let anchorText = $state('');
  let anchorGenerating = $state(false);

  // Progress → shell → Results
  let isBatchPaused = $state(false);
  let batchError = $state('');
  let batchGraderHasStudents = $state(false);

  // Component reference for method forwarding
  let progressRef: BatchProgress;
  let profileRef: BatchProfileSelector;

  // ── URL change coordination ────────────────────────────────────────────
  // Shell coordinates: Progress resets first (via its own effect on pageLoadedUrl),
  // then ProfileSelector refreshes page data. The refreshKey effect also triggers
  // profile refresh.
  $effect(() => {
    if (refreshKey > 0) {
      untrack(() => { profileRef?.doRefreshPageData(); });
    }
  });
</script>

<section class="batch-panel">
  <BatchProfileSelector
    bind:this={profileRef}
    {isBatchRunning}
    {pageLoadedUrl}
    {refreshKey}
    {preselectedProfileId}
    {onRequestDiscovery}
    {batchPhase}
    {sourceRubricId}
    {externalProfile}
    bind:activeProfile
    bind:currentPageUrl
    bind:savedSessionStudent
    bind:resumeAfter
    bind:profileWarning
    bind:localEmbedEnabled
    bind:localModelLoaded
    bind:rubricText
    bind:rubricMaxScore
    bind:extractedRubric
    bind:essayPrompt
    onResumeSession={() => progressRef?.handleResumeSession()}
    onStartFresh={() => progressRef?.handleStartFresh()}
  />

  <BatchInstructions
    {isBatchRunning}
    {batchPhase}
    {anchorGenerating}
    {batchGraderHasStudents}
    {leniency}
    {isRubricRewriting}
    bind:forceRegrade
    bind:isReviewMode
    bind:anchorText
    onGenerateAnchors={() => progressRef?.handleGenerateAnchors()}
    onContinueGrading={() => progressRef?.handleContinueGrading()}
  />

  <BatchProgress
    bind:this={progressRef}
    {provider}
    {model}
    {activeProfile}
    {forceRegrade}
    {isReviewMode}
    {resumeAfter}
    {currentPageUrl}
    {pageLoadedUrl}
    {leniency}
    bind:originalRubricText
    bind:isBatchRunning
    bind:batchPhase
    bind:rubricText
    bind:rubricMaxScore
    bind:extractedRubric
    bind:sourceRubricId
    bind:essayPrompt
    bind:savedSessionStudent
    bind:batchError
    bind:anchorText
    bind:anchorGenerating
    bind:batchGraderHasStudents
  />
</section>

<BatchResults
  {batchPhase}
  {isBatchRunning}
  {isBatchPaused}
  {savedSessionStudent}
  {profileWarning}
  {batchGraderHasStudents}
  onExtract={() => progressRef?.handleExtract()}
  onContinueGrading={() => progressRef?.handleContinueGrading()}
  onPauseBatch={() => progressRef?.handlePauseBatch()}
  onStopBatch={() => progressRef?.handleStopBatch()}
  onCancelBatch={() => progressRef?.handleCancelBatch()}
  onReset={() => progressRef?.handleReset()}
  {onRequestDiscovery}
/>

<style>
  .batch-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    flex: 1;
  }
</style>
