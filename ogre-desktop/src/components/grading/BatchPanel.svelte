<script lang="ts">
  /**
   * BatchPanel - Batch grading controls, progress tracking, and configuration.
   *
   * Features:
   * - Site profile selection (MyOpenMath, Canvas SpeedGrader, auto-detect)
   * - Grading instructions with presets (Non-Zero Only, Lenient, Strict)
   * - Rubric review section (extract → review → grade flow)
   * - Progress tracking with pause/resume/stop
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    BatchGrader,
    DEFAULT_MYOPENMATH_PROFILE,
    CANVAS_SPEEDGRADER_PROFILE,
    BUILT_IN_PROFILES,
    detectProfile,
  } from '../../lib/batch-grader';
  import type { BatchProgress, Rubric, SiteProfile } from '../../lib/batch-grader';
  import { ProfileStorageImpl } from '../../lib/site-profiles';
  import { startBatchGrading } from '../../lib/grading-api';
  import type {
    BatchGradingHandle,
    BatchChunkEvent,
    BatchOutlierEvent,
    BatchProgressEvent,
    BatchDoneEvent,
    BatchErrorEvent,
  } from '../../lib/grading-api';
  import { createRubric, updateRubric } from '../../lib/rubric-api';
  import type { SavedRubric } from '../../lib/rubric-api';
  import { getBatchSession, saveBatchSession, clearBatchSession } from '../../lib/db';
  import { getEmbeddedUrl } from '../../lib/browser';
  import type { BatchLogEntry } from '../../lib/batch-grader';
  import { refreshPageData, buildBatchResetState, stopActiveBatch } from '../../lib/page-refresh';
  import { criteriaToText, textToCriteria } from '../../lib/rubric-utils';

  // Props
  let {
    provider = '',
    model = '',
    isBatchRunning = $bindable(false),
    onRequestDiscovery = () => {},
    preselectedProfileId = null as string | null,
    pageLoadedUrl = '',
    refreshKey = 0,
    selectedRubric = null as SavedRubric | null,
  } = $props();

  // ── Profile Selection ────────────────────────────────────────────────
  let selectedProfileId = $state('auto');
  let detectedProfile = $state<SiteProfile | null>(null);
  let allProfiles = $state<SiteProfile[]>([]);
  let profileWarning = $state('');
  let activeProfile = $derived<SiteProfile>(
    selectedProfileId === 'auto'
      ? (detectedProfile ?? DEFAULT_MYOPENMATH_PROFILE)
      : allProfiles.find(p => p.id === selectedProfileId) ?? DEFAULT_MYOPENMATH_PROFILE
  );
  let profileDescription = $derived(
    activeProfile.navigation.mode === 'batch'
      ? `Profile: ${activeProfile.name} (Batch — all students on page)`
      : `Profile: ${activeProfile.name} (Sequential — one at a time)`
  );

  // ── Grading Instructions ─────────────────────────────────────────────
  const PRESETS = {
    nonZero: 'IMPORTANT: Only provide feedback for students who earn a non-zero score. If a student\'s score is 0, set feedback to an empty string "". Do NOT write feedback for zero-score students.',
    lenient: 'Grade very leniently. Give partial credit for any attempt that is vaguely correct.',
    strict: 'Grade strictly according to the rubric. Deduct points for minor errors.',
  };
  
  let customInstructions = $state('');
  let isNonZeroOnly = $state(false);
  let isLenient = $state(false);
  let isStrict = $state(false);
  let isReviewMode = $state(false);

  // ── Rubric Review ────────────────────────────────────────────────────
  type BatchPhase = 'idle' | 'extracting' | 'review' | 'grading' | 'done';
  let batchPhase = $state<BatchPhase>('idle');
  let rubricText = $state('');
  let rubricMaxScore = $state('10');
  let extractedRubric = $state<Rubric | null>(null);
  let sourceRubricId = $state<string | null>(null);
  let saveRubricName = $state('');
  let saveRubricTags = $state('');
  let showSaveDialog = $state(false);
  let saveStatus = $state('');

  // ── Batch State ──────────────────────────────────────────────────────
  let batchGrader = $state<BatchGrader | null>(null);
  let batchHandle = $state<BatchGradingHandle | null>(null);
  let batchProgress = $state<BatchProgress | null>(null);
  let batchLog = $state<BatchLogEntry[]>([]);
  let isLogExpanded = $state(false);
  let logContainer: HTMLElement | undefined = $state(undefined);
  let isBatchPaused = $state(false);
  let batchError = $state('');
  let currentStudentName = $state('');
  let phaseMessage = $state('');
  let pausedResultBuffer: Array<{ studentIndex: number; score: number; feedback: string }> = [];
  let isAutoStopped = false; // plain let, not $state — no reactivity needed

  let progressPercent = $derived(
    batchProgress && batchProgress.totalStudents > 0
      ? (batchProgress.gradedCount + batchProgress.errorCount) / batchProgress.totalStudents * 100
      : 0
  );

  // ── Resume After ─────────────────────────────────────────────────────
  let resumeAfter = $state('');
  let savedSessionStudent = $state<string | null>(null);
  let currentPageUrl = $state('');

  // ── Reusable page data refresh ──────────────────────────────────────
  async function doRefreshPageData() {
    const url = pageLoadedUrl || currentPageUrl;
    const result = await refreshPageData(url);
    currentPageUrl = result.pageUrl;
    detectedProfile = result.detectedProfile;
    profileWarning = result.detectedProfile
      ? ''
      : '⚠ No profile found for this site. Using MyOpenMath default.';
    savedSessionStudent = result.savedSessionStudent;
  }

  // ── Auto-detect profile on mount + check for saved session ──────────
  onMount(async () => {
    // Load all profiles (built-in + custom)
    try {
      const storage = new ProfileStorageImpl();
      allProfiles = await storage.listProfiles();
    } catch {
      allProfiles = BUILT_IN_PROFILES;
    }

    // Get current URL for auto-detection
    try {
      currentPageUrl = (await getEmbeddedUrl()) || '';
    } catch {
      currentPageUrl = '';
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

  // ── Re-detect when page URL changes ───────────────────────────────
  $effect(() => {
    const url = pageLoadedUrl;
    if (!url) return; // ignore empty initial value

    // Auto-stop if batch is active
    if (batchPhase !== 'idle' || isBatchRunning) {
      isAutoStopped = true;
      stopActiveBatch(batchHandle, batchGrader, pausedResultBuffer);
      const reset = buildBatchResetState();
      batchPhase = reset.batchPhase;
      batchProgress = reset.batchProgress;
      batchLog = reset.batchLog;
      extractedRubric = reset.extractedRubric;
      rubricText = reset.rubricText;
      phaseMessage = reset.phaseMessage;
      batchError = reset.batchError;
      batchGrader = reset.batchGrader;
      batchHandle = reset.batchHandle;
      isBatchRunning = reset.isBatchRunning;
      isBatchPaused = reset.isBatchPaused;
      currentStudentName = reset.currentStudentName;
      resumeAfter = reset.resumeAfter;
    }

    // Re-detect profile and session for new URL
    doRefreshPageData();
  });

  // ── Manual refresh trigger ──────────────────────────────────────────
  $effect(() => {
    if (refreshKey > 0) {
      doRefreshPageData();
    }
  });

  // ── Sync with selected library rubric (when idle) ────────────────────
  $effect(() => {
    // Only apply if we are in idle phase (don't overwrite extraction results)
    if (batchPhase === 'idle') {
      if (selectedRubric) {
        loadLibraryRubric(selectedRubric);
      } else {
        clearLibraryRubric();
      }
    }
  });

  function updateBatchState() {
    if (!batchGrader) return;
    batchProgress = batchGrader.getProgress();
    batchLog = batchGrader.getLog();
    if (isLogExpanded) {
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    });
  }

  // ── Rubric formatting helper ─────────────────────────────────────────
  function formatRubricForDisplay(rubric: Rubric): string {
    const lines: string[] = [];
    if (rubric.essayPrompt) {
      lines.push('--- Question/Prompt ---');
      lines.push(rubric.essayPrompt);
      lines.push('');
    }
    if (rubric.checklistItems.length > 0) {
      lines.push('--- Grading Checklist ---');
      for (const item of rubric.checklistItems) {
        if (item.category) lines.push(`[${item.category}]`);
        for (const sub of item.items) lines.push(`  - ${sub}`);
      }
      lines.push('');
    }
    if (rubric.rubricItems.length > 0) {
      lines.push('--- Rubric Targets ---');
      for (const item of rubric.rubricItems) {
        if (item.category) lines.push(`[${item.category}]`);
        for (const sub of item.items) lines.push(`  - ${sub}`);
      }
      lines.push('');
    }
    if (rubric.modelText) {
      lines.push('--- Model Response ---');
      lines.push(rubric.modelText);
    }
    return lines.join('\n').trim() || '(No rubric data found on page)';
  }

  // ── Library rubric helpers ──────────────────────────────────────────
  function loadLibraryRubric(rubric: SavedRubric) {
    sourceRubricId = rubric.id;
    rubricText = criteriaToText(rubric.criteria);
    rubricMaxScore = String(rubric.maxScore);
    extractedRubric = {
      essayPrompt: '',
      checklistItems: rubric.criteria.map(c => ({
        category: c.criteria,
        items: c.description ? [c.description] : [],
      })),
      rubricItems: [],
      modelText: null,
      maxScore: String(rubric.maxScore),
    };
  }

  function clearLibraryRubric() {
    sourceRubricId = null;
    rubricText = '';
    extractedRubric = null;
  }

  // ── Phase 1: Extract ─────────────────────────────────────────────────
  async function handleExtract() {
    isAutoStopped = false;
    batchError = '';
    phaseMessage = '';
    batchPhase = 'extracting';
    batchLog = [];

    try {
      batchGrader = new BatchGrader();
      await batchGrader.start(activeProfile, resumeAfter || null);
      updateBatchState();

      const rubric = batchGrader.rubric;
      if (rubric) {
      extractedRubric = rubric;
        rubricText = formatRubricForDisplay(rubric);
        rubricMaxScore = rubric.maxScore || '10';
        if (sourceRubricId !== null) { sourceRubricId = null; }
      } else {
        if (sourceRubricId !== null) {
          phaseMessage = 'No rubric found on page. Using loaded library rubric.';
        } else {
          rubricText = '(Could not extract rubric from page)';
          rubricMaxScore = '10';
        }
      }

      if (batchGrader.studentsToGrade.length === 0) {
        phaseMessage = 'All students already graded or skipped';
      } else {
        phaseMessage = `Found ${batchGrader.studentsToGrade.length} students to grade (${batchGrader.students.length} total)`;
      }

      batchPhase = 'review';
    } catch (err) {
      batchError = err instanceof Error ? err.message : String(err);
      batchPhase = 'idle';
      batchGrader = null;
    }
  }

  // ── Phase 2: Continue to grading after review ────────────────────────
  async function handleContinueGrading() {
    if (!batchGrader) return;

    isAutoStopped = false;
    batchError = '';
    const studentsToGrade = batchGrader.studentsToGrade;

    if (studentsToGrade.length === 0) {
      phaseMessage = 'No students to grade';
      batchPhase = 'done';
      batchGrader.stop();
      return;
    }

    // Parse textarea content and apply to extractedRubric
    const parsedCriteria = textToCriteria(rubricText);
    if (parsedCriteria.length > 0) {
      const checklistItems = parsedCriteria.map(c => ({
        category: c.criteria,
        items: c.description ? [c.description] : [],
      }));
      if (extractedRubric) {
        extractedRubric.checklistItems = checklistItems;
      } else {
        extractedRubric = {
          essayPrompt: '',
          checklistItems,
          rubricItems: [],
          modelText: null,
          maxScore: rubricMaxScore,
        };
      }
    } else if (!rubricText.trim() && !extractedRubric) {
      batchError = 'No rubric text. Load a rubric from the library or type one manually.';
      return;
    }

    // Build rubric from (possibly edited) review text
    const rubric = extractedRubric ?? batchGrader.rubric;
    if (!rubric) {
      batchError = 'No rubric available. Check that you are on a grading page.';
      return;
    }

    // Update max score from the review input
    rubric.maxScore = rubricMaxScore;

    batchPhase = 'grading';
    isBatchRunning = true;
    isBatchPaused = false;
    isLogExpanded = true;
    phaseMessage = `Sending ${studentsToGrade.length} students to AI...`;

    // Build combined instructions
    const instructionsParts = [];
    if (customInstructions.trim()) instructionsParts.push(customInstructions.trim());
    if (isNonZeroOnly) instructionsParts.push(PRESETS.nonZero);
    if (isLenient) instructionsParts.push(PRESETS.lenient);
    if (isStrict) instructionsParts.push(PRESETS.strict);

    try {
      batchHandle = startBatchGrading(
        {
          provider: provider || undefined,
          model: model || undefined,
          rubric: {
            essayPrompt: rubric.essayPrompt,
            checklistItems: rubric.checklistItems,
            rubricItems: rubric.rubricItems,
            modelText: rubric.modelText,
            maxScore: rubric.maxScore,
          },
          students: studentsToGrade.map(s => ({
            index: s.index,
            name: s.name,
            response: s.response,
          })),
          customInstructions: instructionsParts.length > 0 ? instructionsParts.join('\n\n') : undefined,
        },
        {
          onProgress: handleSSEProgress,
          onChunk: handleSSEChunk,
          onOutlier: handleSSEOutlier,
          onDone: handleSSEDone,
          onError: handleSSEError,
        },
      );
    } catch (err) {
      batchError = err instanceof Error ? err.message : String(err);
      if (batchGrader) batchGrader.stop();
      isBatchRunning = false;
      batchPhase = 'review';
      updateBatchState();
    }
  }

  // ── Save rubric to library ───────────────────────────────────────────
  async function handleSaveRubric() {
    if (!saveRubricName.trim()) return;
    saveStatus = '';
    try {
      await createRubric({
        name: saveRubricName.trim(),
        description: '',
        maxScore: parseInt(rubricMaxScore) || 10,
        criteria: textToCriteria(rubricText),
        tags: saveRubricTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      saveStatus = 'Saved!';
      showSaveDialog = false;
      saveRubricName = '';
      saveRubricTags = '';
      window.dispatchEvent(new CustomEvent('ogre:rubric-saved'));
      setTimeout(() => { saveStatus = ''; }, 3000);
    } catch (err) {
      saveStatus = err instanceof Error ? err.message : 'Save failed';
    }
  }

  // ── Update existing rubric in library ───────────────────────────────
  async function handleUpdateRubric() {
    if (!sourceRubricId) return;
    const rubricName = selectedRubric?.name || 'this rubric';
    if (!confirm(`Update will overwrite '${rubricName}' in library. Continue?`)) return;
    saveStatus = '';
    try {
      await updateRubric(sourceRubricId, {
        criteria: textToCriteria(rubricText),
        maxScore: parseInt(rubricMaxScore) || 10,
      });
      saveStatus = 'Updated!';
      window.dispatchEvent(new CustomEvent('ogre:rubric-saved'));
      setTimeout(() => { saveStatus = ''; }, 3000);
    } catch (err) {
      saveStatus = err instanceof Error ? err.message : 'Update failed';
    }
  }

  // ── Apply result ─────────────────────────────────────────────────────
  async function applyResult(result: { studentIndex: number; score: number; feedback: string }): Promise<void> {
    if (!batchGrader) return;
    const student = batchGrader.studentsToGrade.find(s => s.index === result.studentIndex);
    currentStudentName = student?.name || `Student ${result.studentIndex}`;
    try {
      await batchGrader.applyGrade(result.studentIndex, result.score, result.feedback);
      // Persist resume point after each successful grade
      if (currentPageUrl && currentStudentName) {
        try { await saveBatchSession(currentPageUrl, currentStudentName); } catch { /* non-fatal */ }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      batchGrader.recordError(currentStudentName, msg);
    }
    updateBatchState();
  }

  async function flushPausedBuffer(): Promise<void> {
    while (pausedResultBuffer.length > 0) {
      if (isBatchPaused) break;
      const result = pausedResultBuffer.shift()!;
      await applyResult(result);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // ── SSE Event Handlers ───────────────────────────────────────────────
  function handleSSEProgress(data: BatchProgressEvent) {
    const phaseLabels: Record<string, string> = {
      'grading': `Grading chunk ${(data.chunkIndex ?? 0) + 1}/${data.totalChunks ?? '?'}...`,
      'calibration': 'Calibrating scoring anchors...',
      'grading-parallel': `Grading in parallel (chunk ${(data.chunkIndex ?? 0) + 1})...`,
      'consistency-sweep': 'Running consistency sweep...',
      'outlier-review': `Reviewing ${data.outlierCount ?? 0} outlier(s)...`,
    };
    phaseMessage = phaseLabels[data.phase] || `Phase: ${data.phase}`;
  }

  async function handleSSEChunk(data: BatchChunkEvent) {
    if (isAutoStopped) return;
    if (!batchGrader) return;
    for (const result of data.results) {
      if (isBatchPaused) {
        pausedResultBuffer.push(result);
      } else {
        await applyResult(result);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }

  async function handleSSEOutlier(data: BatchOutlierEvent) {
    if (isAutoStopped) return;
    if (!batchGrader) return;
    phaseMessage = `Applying ${data.adjustedResults.length} outlier adjustment(s)...`;
    for (const result of data.adjustedResults) {
      if (isBatchPaused) {
        pausedResultBuffer.push(result);
      } else {
        await applyResult(result);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  async function handleSSEDone(data: BatchDoneEvent) {
    if (isAutoStopped) return;
    phaseMessage = `Complete — ${data.metadata.totalStudents} students in ${data.metadata.elapsedSeconds}s`;
    if (pausedResultBuffer.length > 0 && !isBatchPaused) {
      await flushPausedBuffer();
    }
    if (batchGrader) {
      try { await batchGrader.save(); } catch { /* non-fatal */ }
      batchGrader.stop();
    }
    // Clear session on completion — no need to resume
    if (currentPageUrl) {
      try { await clearBatchSession(currentPageUrl); } catch { /* non-fatal */ }
    }
    savedSessionStudent = null;
    isBatchRunning = false;
    isBatchPaused = false;
    currentStudentName = '';
    batchHandle = null;
    batchPhase = 'done';
    updateBatchState();
  }

  function handleSSEError(data: BatchErrorEvent) {
    if (isAutoStopped) return;
    batchError = data.message;
    phaseMessage = '';
    if (batchGrader) batchGrader.stop();
    isBatchRunning = false;
    isBatchPaused = false;
    currentStudentName = '';
    batchHandle = null;
    batchPhase = 'review';
    updateBatchState();
  }

  // ── Pause / Stop Controls ────────────────────────────────────────────
  function handlePauseBatch() {
    if (!batchGrader) return;
    if (isBatchPaused) {
      batchGrader.resume();
      isBatchPaused = false;
      if (pausedResultBuffer.length > 0) flushPausedBuffer();
    } else {
      batchGrader.pause();
      isBatchPaused = true;
    }
    updateBatchState();
  }

  function handleStopBatch() {
    if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
    if (batchGrader) batchGrader.stop();
    isBatchRunning = false;
    isBatchPaused = false;
    currentStudentName = '';
    phaseMessage = '';
    pausedResultBuffer = [];
    batchPhase = 'review';
    updateBatchState();
  }

  function handleResumeSession() {
    if (savedSessionStudent) {
      resumeAfter = savedSessionStudent;
      handleExtract();
    }
  }

  async function handleStartFresh() {
    if (currentPageUrl) {
      try { await clearBatchSession(currentPageUrl); } catch { /* non-fatal */ }
    }
    savedSessionStudent = null;
    resumeAfter = '';
    handleExtract();
  }

  function handleReset() {
    sourceRubricId = null;
    batchPhase = 'idle';
    batchProgress = null;
    batchLog = [];
    extractedRubric = null;
    rubricText = '';
    phaseMessage = '';
    batchError = '';
    batchGrader = null;
  }

  onDestroy(() => {
    if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
    if (batchGrader) { batchGrader.stop(); batchGrader = null; }
  });
</script>

<section class="batch-panel">
  <!-- ── Site Profile Selection ──────────────────────────────────── -->
  <div class="section-card">
    <div class="section-header-row">
      <h3>Site Profile</h3>
      <button
        class="btn-link auto-discover-btn"
        onclick={() => onRequestDiscovery()}
        disabled={isBatchRunning}
      >🔍 Auto-Discover</button>
    </div>
    <div class="profile-bar">
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

  <!-- ── Grading Instructions ────────────────────────────────────── -->
  <details class="section-details">
    <summary class="section-summary">
      <span>Grading Instructions</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </summary>
    <div class="section-content">
      <div class="preset-checkboxes">
        <label class="preset-label">
          <input
            type="checkbox"
            bind:checked={isNonZeroOnly}
            disabled={isBatchRunning}
          />
          <span>Non-Zero Only</span>
        </label>
        <label class="preset-label">
          <input
            type="checkbox"
            bind:checked={isLenient}
            disabled={isBatchRunning}
          />
          <span>Lenient Grading</span>
        </label>
        <label class="preset-label">
          <input
            type="checkbox"
            bind:checked={isStrict}
            disabled={isBatchRunning}
          />
          <span>Strict</span>
        </label>
      </div>
      <textarea
        class="instructions-textarea"
        rows="4"
        placeholder="Enter additional instructions for the AI grader here..."
        bind:value={customInstructions}
        disabled={isBatchRunning}
      ></textarea>
    </div>
  </details>


  <!-- ── Rubric Review Content Snippet ───────────────────────────── -->
  {#snippet rubricContent()}
    <div class="section-content">
      <p class="review-hint">
        {#if sourceRubricId && selectedRubric}
          Rubric loaded from library: <strong>{selectedRubric.name}</strong>
        {:else if extractedRubric}
          Rubric extracted from page. Review and edit if needed.
        {:else}
          Type a rubric or click <strong>Start Batch</strong> to extract from page.
        {/if}
      </p>
      <textarea
        class="rubric-textarea"
        rows="8"
        placeholder="Rubric / grading criteria will appear here..."
        bind:value={rubricText}
        disabled={batchPhase === 'grading' || batchPhase === 'extracting'}
      ></textarea>
      <div class="max-score-row">
        <label for="batch-max-score" class="max-score-label">Max Score:</label>
        <input
          id="batch-max-score"
          type="number"
          class="max-score-input"
          bind:value={rubricMaxScore}
          min="0"
          disabled={batchPhase === 'grading' || batchPhase === 'extracting'}
        />
      </div>
      <div class="rubric-actions">
        <button
          class="btn-secondary small"
          onclick={() => { showSaveDialog = !showSaveDialog; }}
          disabled={batchPhase === 'grading' || batchPhase === 'extracting'}
        >Save to Library</button>
        {#if sourceRubricId}
          <button
            class="btn-secondary small"
            onclick={handleUpdateRubric}
            disabled={batchPhase === 'grading' || batchPhase === 'extracting'}
          >Update {selectedRubric?.name || 'Library Rubric'}</button>
        {/if}
        {#if batchPhase === 'review'}
          <button
            class="btn-primary small"
            onclick={handleContinueGrading}
            disabled={!batchGrader || batchGrader.studentsToGrade.length === 0}
          >Continue Grading</button>
        {/if}
      </div>
      {#if saveStatus}
        <small class="save-status">{saveStatus}</small>
      {/if}
      {#if showSaveDialog}
        <div class="save-dialog">
          <input
            type="text"
            placeholder="Rubric name (e.g., Math Quiz Ch5)"
            bind:value={saveRubricName}
          />
          <input
            type="text"
            placeholder="Tags (comma-separated, optional)"
            bind:value={saveRubricTags}
          />
          <div class="save-dialog-actions">
            <button class="btn-primary small" onclick={handleSaveRubric} disabled={!saveRubricName.trim()}>Save</button>
            <button class="btn-secondary small" onclick={() => { showSaveDialog = false; }}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>
  {/snippet}

  <!-- ── Rubric Review (Always Visible) ──────────────────────────── -->
  {#if batchPhase === 'idle' || batchPhase === 'extracting'}
    <div class="section-card">
      <div class="section-header-row">
        <h3>Rubric</h3>
      </div>
      {@render rubricContent()}
    </div>
  {:else if batchPhase === 'review' || batchPhase === 'grading' || batchPhase === 'done'}
    <details class="section-details" open>
      <summary class="section-summary">
        <span>Rubric Review</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </summary>
      {@render rubricContent()}
    </details>
   {/if}

  <!-- ── Fill Mode Toggle ────────────────────────────────────────── -->
  <div class="fill-mode-toggle">
    <label class="fill-mode-option">
      <input
        type="radio"
        name="fillMode"
        value="auto"
        checked={!isReviewMode}
        onchange={() => { isReviewMode = false; }}
        disabled={isBatchRunning}
      />
      <span>⚡ Auto</span>
    </label>
    <label class="fill-mode-option">
      <input
        type="radio"
        name="fillMode"
        value="review"
        checked={isReviewMode}
        onchange={() => { isReviewMode = true; }}
        disabled={isBatchRunning}
      />
      <span>👁 Review</span>
    </label>
  </div>

  <!-- ── Resume After ────────────────────────────────────────────── -->
  {#if batchPhase === 'idle'}
    {#if savedSessionStudent}
      <div class="resume-session-card">
        <div class="resume-session-info">
          <span class="resume-icon">&#8635;</span>
          <span class="resume-text">Previous session stopped at <strong>{savedSessionStudent}</strong></span>
        </div>
        <div class="resume-session-actions">
          <button class="btn-primary small" onclick={handleResumeSession}>
            Resume from {savedSessionStudent}
          </button>
          <button class="btn-secondary small" onclick={handleStartFresh}>
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

  <!-- ── Status & Progress ───────────────────────────────────────── -->
  {#if batchPhase !== 'idle'}
    <div class="batch-status card">
      <div class="status-row">
        <span class="label">Status:</span>
        {#if batchPhase === 'extracting'}
          <span class="value running">Extracting...</span>
        {:else if isBatchRunning && isBatchPaused}
          <span class="value paused">Paused</span>
        {:else if isBatchRunning}
          <span class="value running">Running</span>
        {:else if batchPhase === 'done'}
          <span class="value complete">Complete</span>
        {:else if batchPhase === 'review'}
          <span class="value ready">Review</span>
        {:else}
          <span class="value ready">Ready</span>
        {/if}
      </div>
      {#if batchPhase === 'grading' || batchPhase === 'done'}
        <div class="progress-bar">
          <div class="progress" style="width: {progressPercent}%"></div>
        </div>
        <div class="stats-row">
          <small>{batchProgress?.gradedCount ?? 0} / {batchProgress?.totalStudents ?? 0} Students</small>
          {#if batchProgress && batchProgress.skippedCount > 0}
            <small class="text-muted"> ({batchProgress.skippedCount} skipped)</small>
          {/if}
          {#if batchProgress && batchProgress.errorCount > 0}
            <small class="text-error"> ({batchProgress.errorCount} errors)</small>
          {/if}
        </div>
      {/if}
      {#if phaseMessage}
        <div class="phase-message">
          <small class="text-muted">{phaseMessage}</small>
        </div>
      {/if}
      {#if currentStudentName}
        <div class="current-student">
          <small class="text-muted">Filling: {currentStudentName}</small>
        </div>
      {/if}
    </div>

    <!-- ── Batch Log ────────────────────────────────────────────────── -->
    {#if batchLog.length > 0}
      <div class="batch-log-card">
        <button class="log-header" onclick={() => { isLogExpanded = !isLogExpanded; if(isLogExpanded) scrollToBottom(); }}>
          <span class="log-title">Batch Log ({batchLog.length})</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="chevron {isLogExpanded ? 'open' : ''}"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {#if isLogExpanded}
          <div class="log-container" bind:this={logContainer}>
            {#each batchLog as entry}
              <div class="log-entry {entry.status}">
                <div class="log-icon-col">
                  {#if entry.status === 'success'}
                    <span class="icon-success">✓</span>
                  {:else if entry.status === 'error'}
                    <span class="icon-error">✗</span>
                  {:else}
                    <span class="icon-skipped">⊘</span>
                  {/if}
                </div>
                <div class="log-details-col">
                  <div class="log-main-row">
                    <span class="log-name">{entry.studentName}</span>
                    {#if entry.score !== null}
                      <span class="log-score">{entry.score}</span>
                    {/if}
                  </div>
                  {#if entry.status === 'error'}
                    <div class="log-message error">{entry.feedback}</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  {#if batchError}
    <div class="batch-error">
      <small>{batchError}</small>
      <button class="error-dismiss" onclick={() => { batchError = ''; }}>&times;</button>
    </div>
  {/if}
</section>

<div class="panel-footer">
  {#if batchPhase === 'idle' && !savedSessionStudent}
    {#if profileWarning && !isBatchRunning}
      <div class="discover-cta-card">
        <div class="discover-cta-icon">🔍</div>
        <div class="discover-cta-content">
          <div class="discover-cta-title">No profile found for this page</div>
          <div class="discover-cta-desc">Use AI to discover the grading page structure and create a profile</div>
        </div>
        <button class="btn-primary full-width" onclick={() => onRequestDiscovery()}>
          Discover This Page
        </button>
        <button class="btn-link" onclick={handleExtract}>
          Or use default profile anyway
        </button>
      </div>
    {:else}
      <button class="btn-primary full-width" onclick={handleExtract}>
        Start Batch
      </button>
    {/if}
  {:else if batchPhase === 'extracting'}
    <button class="btn-primary full-width" disabled>
      Extracting...
    </button>
  {:else if batchPhase === 'grading' && isBatchRunning}
    <div class="batch-controls">
      <button class="btn-secondary" onclick={handlePauseBatch}>
        {isBatchPaused ? 'Resume' : 'Pause'}
      </button>
      <button class="btn-danger" onclick={handleStopBatch}>
        Stop
      </button>
    </div>
  {:else if batchPhase === 'done'}
    <button class="btn-secondary full-width" onclick={handleReset}>
      New Batch
    </button>
  {:else if batchPhase === 'review'}
    <div class="batch-controls">
      <button class="btn-secondary" onclick={handleReset}>
        Back
      </button>
      <button
        class="btn-primary"
        onclick={handleContinueGrading}
        disabled={!batchGrader || batchGrader.studentsToGrade.length === 0}
      >
        Start Grading
      </button>
    </div>
  {/if}
</div>

<style>
  .batch-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    flex: 1;
  }

  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* ── Section Card ── */
  .section-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .auto-discover-btn {
    font-size: 0.75rem;
    opacity: 0.7;
    padding: 0;
  }

  .auto-discover-btn:hover:not(:disabled) {
    opacity: 1;
  }

  .auto-discover-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .profile-bar {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
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

  /* ── Preset Buttons ── */
  .preset-buttons {
    display: flex;
    gap: var(--spacing-2);
    flex-wrap: wrap;
  }

  .btn-preset {
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-preset:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-bg);
  }

  .btn-preset.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-bg);
    font-weight: 600;
  }

  .btn-preset:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }


  /* ── Preset Checkboxes ── */
  .preset-checkboxes {
    display: flex;
    gap: var(--spacing-4);
    flex-wrap: wrap;
    padding-bottom: var(--spacing-2);
  }

  .preset-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: 0.85rem;
    color: var(--color-text-primary);
    cursor: pointer;
    user-select: none;
  }

  .preset-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--color-primary);
  }

  .instructions-textarea,
  .rubric-textarea {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.85rem;
    resize: vertical;
  }

  .instructions-textarea:focus,
  .rubric-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  .instructions-textarea:disabled,
  .rubric-textarea:disabled {
    opacity: 0.6;
  }

  /* ── Rubric Review ── */
  .review-hint {
    font-size: 0.82rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .max-score-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .max-score-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .max-score-input {
    width: 80px;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
  }

  .max-score-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .rubric-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .save-status {
    color: var(--color-success);
    font-size: 0.8rem;
  }

  .save-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-2);
    background: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .save-dialog input {
    width: 100%;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.85rem;
    box-sizing: border-box;
  }

  .save-dialog input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .save-dialog-actions {
    display: flex;
    gap: var(--spacing-2);
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

  /* ── Discover CTA Card ── */
  .discover-cta-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .discover-cta-icon {
    font-size: 2rem;
  }

  .discover-cta-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .discover-cta-desc {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .btn-link:hover {
    color: var(--color-text-primary);
  }

  /* ── Status & Progress ── */
  .batch-status {
    padding: var(--spacing-3);
    background-color: var(--color-bg-main);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--spacing-2);
    font-size: 0.9rem;
  }

  .value.ready { color: var(--color-success); font-weight: 600; }
  .value.running { color: var(--color-primary); font-weight: 600; }
  .value.paused { color: var(--color-warning, #f59e0b); font-weight: 600; }
  .value.complete { color: var(--color-success); font-weight: 600; }

  .phase-message { margin-top: var(--spacing-1); font-size: 0.8rem; }
  .current-student { margin-top: var(--spacing-1); font-style: italic; }

  .batch-error {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    color: var(--color-error, #ef4444);
    font-size: 0.85rem;
  }

  .error-dismiss {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0;
    opacity: 0.7;
    flex-shrink: 0;
    margin-left: auto;
  }

  .error-dismiss:hover { opacity: 1; }
  .text-error { color: var(--color-error, #ef4444); }

  .progress-bar {
    height: 6px;
    background-color: var(--color-border);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: var(--spacing-2);
  }

  .progress {
    height: 100%;
    background-color: var(--color-success);
    transition: width 0.3s ease;
  }

  .stats-row {
    text-align: right;
    color: var(--color-text-secondary);
  }

  /* ── Footer / Controls ── */
  .panel-footer {
    padding-top: var(--spacing-2);
    flex-shrink: 0;
  }

  .batch-controls {
    display: flex;
    gap: var(--spacing-2);
    width: 100%;
  }

  .batch-controls button {
    flex: 1;
    padding: var(--spacing-3);
    justify-content: center;
  }

  .btn-primary.full-width {
    width: 100%;
    justify-content: center;
    padding: var(--spacing-3);
  }

  .btn-secondary.full-width {
    width: 100%;
    justify-content: center;
    padding: var(--spacing-3);
  }

  .btn-primary.small,
  .btn-secondary.small {
    padding: var(--spacing-1) var(--spacing-3);
    font-size: 0.82rem;
  }

  .btn-danger {
    background-color: var(--color-error, #ef4444);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .btn-danger:hover { opacity: 0.9; }

  /* ── Batch Log ── */
  .batch-log-card {
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .log-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-2) var(--spacing-3);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .log-header:hover {
    color: var(--color-text-primary);
  }

  .log-header .chevron {
    transition: transform 0.2s ease;
  }
  .log-header .chevron.open {
    transform: rotate(180deg);
  }

  .log-container {
    max-height: 200px;
    overflow-y: auto;
    border-top: 1px solid var(--color-border);
    padding: var(--spacing-2);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .log-entry {
    display: flex;
    gap: var(--spacing-2);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
  }

  .log-entry:hover {
    background-color: var(--color-bg-hover);
  }

  .log-entry.error {
    background-color: rgba(239, 68, 68, 0.1);
  }

  .log-icon-col {
    flex-shrink: 0;
    width: 20px;
    display: flex;
    justify-content: center;
    font-weight: bold;
  }

  .icon-success { color: var(--color-success); }
  .icon-error { color: var(--color-error); }
  .icon-skipped { color: var(--color-text-muted); opacity: 0.5; }

  .log-details-col {
    flex: 1;
    min-width: 0;
  }

  .log-main-row {
    display: flex;
    justify-content: space-between;
  }

  .log-name {
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .log-score {
    font-weight: 600;
    color: var(--color-primary);
  }

  .log-message.error {
    color: var(--color-error);
    margin-top: 2px;
    font-size: 0.75rem;
  }

  /* ── Fill Mode Toggle ── */
  .fill-mode-toggle {
    display: flex;
    gap: var(--spacing-2, 8px);
    align-items: center;
  }

  .fill-mode-option {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--color-border, #444);
    cursor: pointer;
    font-size: 0.85em;
    user-select: none;
  }

  .fill-mode-option:has(input:checked) {
    background: var(--color-bg-alt, #1a1a2e);
    border-color: var(--color-primary, #6366f1);
  }

  .fill-mode-option input[type="radio"] {
    display: none;
  }
</style>
