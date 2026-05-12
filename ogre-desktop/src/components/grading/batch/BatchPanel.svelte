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
  // BatchResults is rendered by GradingPanel (outside scrollable area)
  import type { SavedRubric } from '../../../lib/rubric-api';
  import type { Rubric, SiteProfile } from '../../../lib/batch-grader';
  import { DEFAULT_MYOPENMATH_PROFILE } from '../../../lib/batch-grader';
  import type { BatchStudentResult } from '../../../lib/grading-api';

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
    weightsValid = true,
    weightMode = 'category' as 'category' | 'criterion',
    singleStudentName = '',
    originalRubricText = $bindable(''),
    anchorText = $bindable(''),
    anchorGenerating = $bindable(false),
    batchGraderHasStudents = $bindable(false),
    isBatchPaused = $bindable(false),
    savedSessionStudent = $bindable<string | null>(null),
    profileWarning = $bindable(''),
    outlierReport = $bindable<BatchStudentResult[]>([]),
    isResweepInFlight = $bindable(false),
  } = $props();

  // ── Bridging state between sub-components ──────────────────────────────
  // ProfileSelector → shell → Progress
  let activeProfile = $state<SiteProfile>(DEFAULT_MYOPENMATH_PROFILE);

  // When GradingPanel provides a globally-selected profile, override local selection
  $effect(() => {
    if (externalProfile) activeProfile = externalProfile;
  });
  let currentPageUrl = $state('');
  let resumeAfter = $state('');
  let localEmbedEnabled = $state(false);
  let localModelLoaded = $state(true);
  let batchError = $state('');

  // Instructions
  let forceRegrade = $state(false);
  let zeroNoResponse = $state(true);
  let isReviewMode = $state(false);

  // Component reference for method forwarding
  let progressRef: BatchProgress;
  let profileRef: BatchProfileSelector;

  // Expose handlers to parent shell (called by GradingPanel on behalf of BatchResults / RubricCard)
  export function handleGenerateAnchors() {
    progressRef?.handleGenerateAnchors();
  }
  export function handleExtract() { progressRef?.handleExtract(); }
  export function handleContinueGrading() { progressRef?.handleContinueGrading(); }
  export function handlePauseBatch() { progressRef?.handlePauseBatch(); }
  export function handleStopBatch() { progressRef?.handleStopBatch(); }
  export function handleCancelBatch() { progressRef?.handleCancelBatch(); }
  export function handleReset() { progressRef?.handleReset(); }
  export function acceptReviewEntry(entry: BatchStudentResult) { return progressRef?.acceptReviewEntry(entry); }
  export function revertOutlier(entry: BatchStudentResult) { return progressRef?.revertOutlier(entry); }
  export function handleResweep() { return progressRef?.handleResweep(); }

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
    bind:forceRegrade
    bind:zeroNoResponse
    bind:isReviewMode
  />

  <BatchProgress
    bind:this={progressRef}
    {provider}
    {model}
    {activeProfile}
    {forceRegrade}
    {zeroNoResponse}
    {isReviewMode}
    {resumeAfter}
    {currentPageUrl}
    {pageLoadedUrl}
    {leniency}
    {weightMode}
    {singleStudentName}
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
    bind:isBatchPaused
    bind:outlierReport
    bind:isResweepInFlight
  />
</section>


<style>
  .batch-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    flex: 1;
  }
</style>
