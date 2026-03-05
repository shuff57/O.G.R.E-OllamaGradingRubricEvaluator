<script lang="ts">
  /**
   * BatchPanel - Batch grading controls, progress tracking, and configuration.
   *
   * Features:
   * - Site profile selection (MyOpenMath, Canvas SpeedGrader, auto-detect)
   * - Grading instructions with presets (Non-Zero Only, Lenient, Strict)
   * - Progress tracking with pause/resume/stop
   * Rubric state (rubricText, rubricMaxScore, extractedRubric, sourceRubricId,
   * batchPhase, essayPrompt) is owned by GradingPanel; RubricCard renders the UI.
   */
  import { onMount, onDestroy, untrack } from 'svelte';
  import {
    BatchGrader,
    DEFAULT_MYOPENMATH_PROFILE,
    CANVAS_SPEEDGRADER_PROFILE,
    BUILT_IN_PROFILES,
    detectProfile,
    extractRubric,
    extractPageContent,
    isRubricSufficient,
  } from '../../lib/batch-grader';
  import type { BatchProgress, Rubric, SiteProfile, VersionGroup } from '../../lib/batch-grader';
  import { ProfileStorageImpl } from '../../lib/site-profiles';
  import { startBatchGrading, generateAnchors, type AnchorResponse } from '../../lib/grading-api';
  import type {
    BatchGradingHandle,
    BatchChunkEvent,
    BatchOutlierEvent,
    BatchProgressEvent,
    BatchDoneEvent,
    BatchErrorEvent,
  } from '../../lib/grading-api';
  import type { SavedRubric } from '../../lib/rubric-api';
  import { getBatchSession, saveBatchSession, clearBatchSession } from '../../lib/db';
  import { getSetting } from '../../lib/db';
  import { getEmbeddedUrl } from '../../lib/browser';
  import type { BatchLogEntry } from '../../lib/batch-grader';
  import { refreshPageData, buildBatchResetState, stopActiveBatch } from '../../lib/page-refresh';
  import { textToCriteria } from '../../lib/rubric-utils';

  // Props
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
    // Rubric state — owned by GradingPanel, RubricCard renders the UI
    rubricText = $bindable(''),
    rubricMaxScore = $bindable('10'),
    extractedRubric = $bindable<Rubric | null>(null),
    sourceRubricId = $bindable<string | null>(null),
    batchPhase = $bindable<BatchPhase>('idle'),
    essayPrompt = $bindable(''),
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
    skipNoResponse: 'Students who did not submit a response will be skipped and receive no grade.',
    noFormulaPenalty: 'Do not deduct points for lack of explicit formula notation or symbolic notation of any kind. If a student demonstrates understanding of a concept through explanation alone — without writing out formulas or symbols — award full credit for that rubric item. Reward the concept, not the notation. Do NOT penalize brevity. A concise response that correctly addresses each rubric criterion deserves full marks. Only deduct when a rubric criterion is genuinely missing or wrong — not because the student could have written more.',
  };
  
  let customInstructions = $state('');
  let isReviewMode = $state(false);

  // ── Derived state for preset buttons ───────────────────────────────────
  let isNonZeroActive = $derived(customInstructions.includes(PRESETS.nonZero));
  let isLenientActive = $derived(customInstructions.includes(PRESETS.lenient));
  let isStrictActive = $derived(customInstructions.includes(PRESETS.strict));
  let isSkipNoResponseActive = $derived(customInstructions.includes(PRESETS.skipNoResponse));
  let isNoFormulaPenaltyActive = $derived(customInstructions.includes(PRESETS.noFormulaPenalty));

  function togglePreset(key: 'nonZero' | 'lenient' | 'strict' | 'skipNoResponse' | 'noFormulaPenalty') {
    const text = PRESETS[key];
    if (customInstructions.includes(text)) {
      customInstructions = customInstructions.replace(text, '').replace(/\n{3,}/g, '\n\n').trim();
    } else {
      customInstructions = customInstructions.trim()
        ? customInstructions.trim() + '\n\n' + text
        : text;
    }
  }

  // ── Review Gate ──────────────────────────────────────────────────────
  type ReviewData = {
    studentIndex: number;
    score: number;       // editable — bound to input
    autoScore: number;   // original AI score — read-only label
    feedback: string;    // editable — bound to textarea
    studentName: string;
    maxScore: number;
    chunkIndex: number;
    chunkTotal: number;
  };
  let pendingReview = $state<ReviewData | null>(null);
  let reviewResolve: ((decision: { action: 'approve' | 'skip'; score?: number; feedback?: string }) => void) | null = null;

  // ── Rubric Review ────────────────────────────────────────────────────
  // (rubricText, rubricMaxScore, extractedRubric, sourceRubricId, batchPhase, essayPrompt
  //  are $bindable props — owned by GradingPanel, RubricCard renders the UI.)

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
  let extractionCancelled = $state(false);

  // ── Local Model Status ──────────────────────────────────────────────
  let localModelLoaded = $state(true);
  let localEmbedEnabled = $state(false);
  let embedStatusInterval: ReturnType<typeof setInterval> | null = null;

  // ── Version Grouping ────────────────────────────────────────────────
  let currentVersionIndex = $state(0);
  let versionCount = $state(1);

  let progressPercent = $derived(
    batchProgress && batchProgress.totalStudents > 0
      ? (batchProgress.gradedCount + batchProgress.errorCount) / batchProgress.totalStudents * 100
      : 0
  );

  // ── Resume After ─────────────────────────────────────────────────────
  let resumeAfter = $state('');
  let forceRegrade = $state(false);
  let savedSessionStudent = $state<string | null>(null);
  let currentPageUrl = $state('');

  // ── Grading Timer ──────────────────────────────────────────────────
  let elapsedSeconds = $state(0);
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let batchTimerStart = 0;

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${s}s`;
  }

  let elapsedLabel = $derived(formatElapsed(elapsedSeconds));

  function startTimer(): void {
    batchTimerStart = Date.now();
    elapsedSeconds = 0;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - batchTimerStart) / 1000);
    }, 1000);
  }

  function stopTimer(): void {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    elapsedSeconds = 0;
  }

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

  // ── Auto-extract rubric on page load ────────────────────────────────
  async function autoExtractRubric() {
    // Guard: don't extract if batch is active or library rubric is selected
    if (batchPhase !== 'idle') return;
    if (sourceRubricId !== null) return;

    try {
      const rubric = await extractRubric(activeProfile.selectors);
      if (extractionCancelled) return;
      if (isRubricSufficient(rubric)) {
        extractedRubric = rubric;
        rubricText = formatRubricForDisplay(rubric);
        rubricMaxScore = rubric.maxScore || '10';
        essayPrompt = rubric.essayPrompt || '';
      } else {
        // Use any partial data the rubric extraction did find
        if (rubric.essayPrompt || rubric.rubricItems?.length || rubric.checklistItems?.length) {
          rubricText = formatRubricForDisplay(rubric);
          rubricMaxScore = rubric.maxScore || '10';
          essayPrompt = rubric.essayPrompt || '';
        }
        // Fall back to page content scan if rubricText is still empty
        if (!rubricText) {
          const pageContent = await extractPageContent();
          if (pageContent.content) {
            essayPrompt = essayPrompt || pageContent.content;
            rubricText = pageContent.content;
          }
        }
      }
    } catch {
      // Silent failure — try extractPageContent as fallback
      try {
        const pageContent = await extractPageContent();
        if (pageContent.content) {
          essayPrompt = pageContent.content;
          rubricText = pageContent.content;
        }
      } catch {
        // Completely silent — nothing to extract
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

    // Check local embedding status
    const useLocal = await getSetting('use_local_embedding');
    if (useLocal === 'true') {
      localEmbedEnabled = true;
      // Initial check
      try {
        const res = await fetch('http://localhost:3456/api/embed-status');
        if (res.ok) {
          const data = await res.json();
          localModelLoaded = data.modelLoaded;
        }
      } catch (e) {
        console.error('Failed to check embed status', e);
      }

      // Start polling if not loaded
      if (!localModelLoaded) {
        embedStatusInterval = setInterval(async () => {
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

  // ── Re-detect when page URL changes ───────────────────────────────
  $effect(() => {
    const url = pageLoadedUrl;
    if (!url) return; // ignore empty initial value
    // Use untrack() so batchPhase and isBatchRunning are NOT tracked as
    // dependencies of this effect. Without it, changing batchPhase to
    // 'extracting' (on batch start) would re-run the effect with the same
    // URL and immediately trigger the auto-stop.
    untrack(() => {
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
        currentVersionIndex = 0;
        versionCount = 1;
        stopTimer();
      }
      // Re-detect profile and session for new URL
      doRefreshPageData();
    });
  });

  // ── Manual refresh trigger ──────────────────────────────────────────
  $effect(() => {
    if (refreshKey > 0) {
      doRefreshPageData();
    }
  });

  // NOTE: loadLibraryRubric / clearLibraryRubric now live in RubricCard.

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
  /**
   * Format rubric for the review textarea.
   *
   * - If a grading checklist or rubric targets exist, hide the question/prompt
   *   (the prompt is already visible on the grading page itself).
   * - If multi-version, show all version prompts above the shared rubric.
   * - If NO checklist/rubric exists, show the prompt as fallback content.
   */
  function formatRubricForDisplay(rubric: Rubric, allVersions?: VersionGroup[]): string {
    const lines: string[] = [];
    const isMultiVersion = allVersions && allVersions.length > 1;

    if (isMultiVersion) {
      // Multi-version: show all version prompts above the shared rubric
      for (const group of allVersions) {
        lines.push(`--- Version ${group.versionNumber} Prompt ---`);
        lines.push(group.essayPrompt || '(no prompt)');
        lines.push('');
      }
    } else if (rubric.essayPrompt) {
      // Single version: show prompt normally
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


  // ── Phase 1: Extract ─────────────────────────────────────────────────
  async function handleExtract() {
    isAutoStopped = false;
    extractionCancelled = false;
    batchError = '';
    phaseMessage = '';
    batchPhase = 'extracting';
    batchLog = [];
    startTimer();

    try {
      batchGrader = new BatchGrader();
      await batchGrader.start(activeProfile, resumeAfter || null, forceRegrade);
      if (extractionCancelled) {
        batchGrader.stop();
        batchGrader = null;
        batchPhase = 'idle';
        stopTimer();
        return;
      }
      updateBatchState();

      // Read version info
      versionCount = batchGrader.versionCount;
      currentVersionIndex = 0;

      const rubric = batchGrader.rubric;

      if (versionCount > 1) {
        // Multi-version: use version 1's prompt data merged with shared rubric
        const v1Rubric = batchGrader.getRubricForVersion(0);
        if (v1Rubric) {
          extractedRubric = v1Rubric;
          rubricText = formatRubricForDisplay(v1Rubric, batchGrader.versionGroups);
          rubricMaxScore = v1Rubric.maxScore || '10';
          essayPrompt = v1Rubric.essayPrompt || '';
          if (sourceRubricId !== null) { sourceRubricId = null; }
        }
      } else if (rubric) {
        extractedRubric = rubric;
        rubricText = formatRubricForDisplay(rubric);
        rubricMaxScore = rubric.maxScore || '10';
        essayPrompt = rubric.essayPrompt || '';
        if (sourceRubricId !== null) { sourceRubricId = null; }
      } else {
        essayPrompt = '';
        if (sourceRubricId !== null) {
          phaseMessage = 'No rubric found on page. Using loaded library rubric.';
        } else {
          rubricText = '';
          rubricMaxScore = '10';
        }
      }

      if (batchGrader.studentsToGrade.length === 0) {
        phaseMessage = 'All students already graded or skipped';
      } else if (versionCount > 1) {
        const v1Students = batchGrader.getStudentsForVersion(0);
        phaseMessage = `Found ${batchGrader.studentsToGrade.length} students across ${versionCount} versions (v1: ${v1Students.length} students)`;
      } else {
        phaseMessage = `Found ${batchGrader.studentsToGrade.length} students to grade (${batchGrader.students.length} total)`;
      }

      batchPhase = 'review';
    } catch (err) {
      batchError = err instanceof Error ? err.message : String(err);
      stopTimer();
      batchPhase = 'idle';
      batchGrader = null;
    }
  }

  // ── Phase 2: Continue to grading after review ────────────────────────
  async function handleContinueGrading() {
    if (!batchGrader) return;

    isAutoStopped = false;
    batchError = '';

    // Scope students to the current version group (or all if single version)
    const studentsToGrade = versionCount > 1
      ? batchGrader.getStudentsForVersion(currentVersionIndex)
      : batchGrader.studentsToGrade;

    if (studentsToGrade.length === 0) {
      // Try advancing to next version
      if (versionCount > 1 && batchGrader.advanceVersion()) {
        currentVersionIndex = batchGrader.currentVersionIndex;
        updateVersionDisplay();
        handleContinueGrading();
        return;
      }
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

    // Build rubric: for multi-version, merge shared structure with version-specific prompt
    let rubric: Rubric | null;
    if (versionCount > 1) {
      rubric = batchGrader.getRubricForVersion(currentVersionIndex);
      // Apply any user edits to the shared structural fields
      if (rubric && extractedRubric) {
        rubric.checklistItems = extractedRubric.checklistItems;
        rubric.rubricItems = extractedRubric.rubricItems;
      }
    } else {
      rubric = extractedRubric ?? batchGrader.rubric;
    }
    if (!rubric) {
      batchError = 'No rubric available. Check that you are on a grading page.';
      return;
    }

    // Update max score from the review input
    rubric.maxScore = rubricMaxScore;

    // Start elapsed timer for grading phase
    startTimer();

    batchPhase = 'grading';
    isBatchRunning = true;
    isBatchPaused = false;
    isLogExpanded = true;

    if (versionCount > 1) {
      phaseMessage = `Version ${currentVersionIndex + 1}/${versionCount}: Sending ${studentsToGrade.length} students to AI...`;
    } else {
      phaseMessage = `Sending ${studentsToGrade.length} students to AI...`;
    }

    // Build combined instructions (preset texts are now included in customInstructions via toggle buttons)
    const instructionsParts = [];
    if (anchorText.trim()) instructionsParts.push(`SCORING CALIBRATION:\n${normalizeAnchorTextToVirtual10(anchorText.trim(), rubricMaxScore)}`);
    if (customInstructions.trim()) instructionsParts.push(customInstructions.trim());


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

  /**
   * Update the rubric display and phase message for the current version.
   */
  function updateVersionDisplay() {
    if (!batchGrader) return;
    const rubric = batchGrader.getRubricForVersion(currentVersionIndex);
    if (rubric) {
      extractedRubric = rubric;
      rubricText = formatRubricForDisplay(rubric, batchGrader.versionGroups);
      rubricMaxScore = rubric.maxScore || '10';
      essayPrompt = rubric.essayPrompt || '';
    }
    const vStudents = batchGrader.getStudentsForVersion(currentVersionIndex);
    phaseMessage = `Version ${currentVersionIndex + 1} of ${versionCount}: ${vStudents.length} students`;
  }


  // ── Apply result ─────────────────────────────────────────────────────
  async function applyResult(result: { studentIndex: number; score: number; feedback: string }, chunkIndex = 0, chunkTotal = 1): Promise<void> {
    if (!batchGrader) return;
    const student = batchGrader.studentsToGrade.find(s => s.index === result.studentIndex);
    const studentName = student?.name || `Student ${result.studentIndex}`;

    // Review gate: if review mode is on, wait for user decision before filling
    if (isReviewMode) {
      const maxScore = parseInt(rubricMaxScore) || 10;
      const decision = await requestStudentReview(result, studentName, maxScore, chunkIndex, chunkTotal);
      if (decision.action === 'skip') {
        updateBatchState();
        return;
      }
      // Use edited values from review, falling back to original AI values
      result = {
        ...result,
        score: decision.score ?? result.score,
        feedback: decision.feedback ?? result.feedback,
      };
    }

    currentStudentName = studentName;
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
    const total = pausedResultBuffer.length;
    let idx = 0;
    while (pausedResultBuffer.length > 0) {
      if (isBatchPaused) break;
      const result = pausedResultBuffer.shift()!;
      await applyResult(result, idx++, total);
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
    const results = data.results;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (isBatchPaused) {
        pausedResultBuffer.push(result);
      } else {
        await applyResult(result, i, results.length);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }

  async function handleSSEOutlier(data: BatchOutlierEvent) {
    if (isAutoStopped) return;
    if (!batchGrader) return;
    phaseMessage = `Applying ${data.adjustedResults.length} outlier adjustment(s)...`;
    const adjustedResults = data.adjustedResults;
    for (let i = 0; i < adjustedResults.length; i++) {
      const result = adjustedResults[i];
      if (isBatchPaused) {
        pausedResultBuffer.push(result);
      } else {
        await applyResult(result, i, adjustedResults.length);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  async function handleSSEDone(data: BatchDoneEvent) {
    if (isAutoStopped) return;

    if (pausedResultBuffer.length > 0 && !isBatchPaused) {
      await flushPausedBuffer();
    }

    // Save progress after this version/batch completes
    if (batchGrader) {
      try { await batchGrader.save(); } catch { /* non-fatal */ }
    }

    // Chain to next version if there are more
    if (versionCount > 1 && batchGrader?.advanceVersion()) {
      currentVersionIndex = batchGrader.currentVersionIndex;
      const vStudents = batchGrader.getStudentsForVersion(currentVersionIndex);
      phaseMessage = `Version ${currentVersionIndex} of ${versionCount} complete. Starting version ${currentVersionIndex + 1} (${vStudents.length} students)...`;
      updateVersionDisplay();

      // Regenerate AI anchors for the new version's rubric
      anchorGenerating = true;
      try {
        const currentProvider = untrack(() => provider);
        const currentModel = untrack(() => model);
        const versionRubric = batchGrader.getRubricForVersion(currentVersionIndex);

        if (currentProvider && currentModel && versionRubric) {
          const anchorResponses = await generateAnchors({
            provider: currentProvider,
            model: currentModel,
            rubric: {
              essayPrompt: versionRubric.essayPrompt,
              checklistItems: versionRubric.checklistItems,
              rubricItems: versionRubric.rubricItems,
              modelText: versionRubric.modelText,
              maxScore: '10', // always generate on virtual 10-pt scale
            },
          });

          if (anchorResponses && anchorResponses.length > 0) {
            anchorText = anchorResponses
              .map(a => {
                const rMax = parseFloat(rubricMaxScore) || 10;
                const displayScore = Math.round(a.score * rMax / 10 * 10) / 10;
                return `${a.label} (${displayScore}/${rMax}): ${a.response}`;
              })
              .join('\n\n');
          }
        } else {
          // Fallback to static anchors
          const anchors = untrack(() => scoringAnchors);
          anchorText = anchors
            .map(a => `${a.label} (${a.score}/${parseFloat(rubricMaxScore) || 10}): ${a.description}`)
            .join('\n');
        }
      } catch (err) {
        // Fallback to static anchors
        const anchors = untrack(() => scoringAnchors);
        anchorText = anchors
          .map(a => `${a.label} (${a.score}/${parseFloat(rubricMaxScore) || 10}): ${a.description}`)
          .join('\n');
      } finally {
        anchorGenerating = false;
      }

      batchHandle = null;
      // Brief pause then start next version
      await new Promise(r => setTimeout(r, 500));
      handleContinueGrading();
      return;
    }

    // All versions done (or single version)
    phaseMessage = `Complete — ${batchGrader?.studentsToGrade.length ?? data.metadata.totalStudents} students in ${data.metadata.elapsedSeconds}s`;
    if (batchGrader) batchGrader.stop();
    // Clear session on completion — no need to resume
    if (currentPageUrl) {
      try { await clearBatchSession(currentPageUrl); } catch { /* non-fatal */ }
    }
    savedSessionStudent = null;
    stopTimer();
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
    stopTimer();
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
    // Clean up any pending review
    if (reviewResolve) {
      reviewResolve({ action: 'skip' });
      pendingReview = null;
      reviewResolve = null;
    }
    if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
    if (batchGrader) batchGrader.stop();
    stopTimer();
    isBatchRunning = false;
    isBatchPaused = false;
    currentStudentName = '';
    phaseMessage = '';
    pausedResultBuffer = [];
    batchPhase = 'review';
    updateBatchState();
  }

  // ── Cancel (all phases) ────────────────────────────────────────────────
  function handleCancelBatch() {
    // Clean up any pending review
    if (reviewResolve) {
      reviewResolve({ action: 'skip' });
      pendingReview = null;
      reviewResolve = null;
    }
    if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
    if (batchGrader) { batchGrader.stop(); batchGrader = null; }
    stopTimer();
    isBatchRunning = false;
    isBatchPaused = false;
    currentStudentName = '';
    phaseMessage = '';
    pausedResultBuffer = [];
    batchError = '';
    extractionCancelled = true; // Signal extraction to abort
    currentVersionIndex = 0;
    versionCount = 1;
    // Phase-aware reset: extracting/review go to idle, grading goes to review
    if (batchPhase === 'grading') {
      batchPhase = 'review';
    } else {
      batchPhase = 'idle';
    }
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
    stopTimer();
    sourceRubricId = null;
    batchPhase = 'idle';
    batchProgress = null;
    batchLog = [];
    extractedRubric = null;
    rubricText = '';
    phaseMessage = '';
    batchError = '';
    batchGrader = null;
    pendingReview = null;
    reviewResolve = null;
    currentVersionIndex = 0;
    versionCount = 1;
  }

  // ── Review Gate Functions ────────────────────────────────────────────
  function requestStudentReview(
    result: { studentIndex: number; score: number; feedback: string },
    studentName: string,
    maxScore: number,
    index: number,
    total: number
  ): Promise<{ action: 'approve' | 'skip'; score?: number; feedback?: string }> {
    return new Promise((resolve) => {
      pendingReview = { ...result, autoScore: result.score, studentName, maxScore, chunkIndex: index, chunkTotal: total };
      reviewResolve = resolve;
    });
  }

  function handleApprove() {
    if (reviewResolve && pendingReview) {
      const editedScore = Math.max(0, Math.min(pendingReview.maxScore, Number(pendingReview.score) || 0));
      const editedFeedback = pendingReview.feedback;
      reviewResolve({ action: 'approve', score: editedScore, feedback: editedFeedback });
      pendingReview = null;
      reviewResolve = null;
    }
  }

  function handleSkip() {
    if (reviewResolve) {
      reviewResolve({ action: 'skip' });
      pendingReview = null;
      reviewResolve = null;
    }
  }

  // ── Scoring Anchors ─────────────────────────────────────────────────
  type AnchorItem = {
    label: string;
    score: number;
    description: string;
    colorClass: string;
  };

  // Converts anchor text from real-scale (e.g. /12) to virtual-10 scale before
  // injecting into the grading prompt. The server always grades on virtualMax=10
  // internally, so customInstructions anchors must match that scale.
  function normalizeAnchorTextToVirtual10(text: string, realMaxScore: string): string {
    const realMax = parseFloat(realMaxScore) || 10;
    if (Math.abs(realMax - 10) < 0.001) return text; // already virtual-10 scale
    // Match (score/max): patterns — the colon prevents matching scores inside response text
    return text.replace(/\((\d+\.?\d*)\/(\d+\.?\d*)\):/g, (_m, sStr, mStr) => {
      const s = parseFloat(sStr);
      const m = parseFloat(mStr);
      if (!isNaN(s) && !isNaN(m) && Math.abs(m - realMax) < 0.5) {
        const v10 = Math.round(s * 10 / realMax * 10) / 10;
        return `(${v10}/10):`;
      }
      return _m;
    });
  }

  function computeScoringAnchors(
    maxScore: number,
    checklistItems?: Array<{ category: string; items: string[] }>
  ): AnchorItem[] {
    // Round to 1 decimal place for small max scores (< 6) so anchors stay
    // proportionate rather than collapsing to the same integer value.
    const roundScore = (s: number) => maxScore < 6 ? Math.round(s * 10) / 10 : Math.round(s);
    const excellent    = roundScore(maxScore * 0.9);
    const adequate     = roundScore(maxScore * 0.65);
    const belowAverage = roundScore(maxScore * 0.5);
    const minimal      = roundScore(maxScore * 0.3);

    let excellentDesc    = 'Demonstrates comprehensive understanding with all key concepts addressed clearly.';
    let adequateDesc     = 'Shows solid grasp of main concepts with minor gaps or unclear explanations.';
    let belowAverageDesc = 'Shows partial understanding but missing key concepts or sufficient depth.';
    let minimalDesc      = 'Addresses some basic concepts but lacks depth or contains significant errors.';

    if (checklistItems && checklistItems.length > 0) {
      const categories = checklistItems.map(item => item.category).filter(Boolean);
      if (categories.length > 0) {
        excellentDesc    += ` Covers: ${categories.join(', ')}.`;
        adequateDesc     += ` Partially covers: ${categories.slice(0, 2).join(', ')}.`;
        belowAverageDesc += ` Weak coverage of: ${categories[0]}.`;
        minimalDesc      += ` Minimal coverage of: ${categories[0] || 'key concepts'}.`;
      }
    }

    return [
      { label: 'Excellent',     score: excellent,    description: excellentDesc,    colorClass: 'anchor-success' },
      { label: 'Adequate',      score: adequate,     description: adequateDesc,     colorClass: 'anchor-primary' },
      { label: 'Below Average', score: belowAverage, description: belowAverageDesc, colorClass: 'anchor-warning' },
      { label: 'Minimal',       score: minimal,      description: minimalDesc,      colorClass: 'anchor-error'   },
    ];
  }

  let scoringAnchors = $derived.by(() => {
    const parsed = textToCriteria(rubricText);
    const items: Array<{ category: string; items: string[] }> =
      parsed.length > 0
        ? parsed.map(c => ({ category: c.criteria, items: c.description ? [c.description] : [] }))
        : (extractedRubric?.checklistItems ?? []);
    return computeScoringAnchors(parseFloat(rubricMaxScore) || 10, items);
  });
  let anchorText = $state('');
  let anchorGenerating = $state(false);


  // Generate AI scoring anchors when entering review phase.
  $effect(() => {
    const phase = batchPhase; // track phase only
    if (phase === 'review') {
      // Clear text so placeholder shows while AI generates
      anchorText = '';
      anchorGenerating = true;

      // Use async IIFE to call the AI anchor generation API
      (async () => {
        try {
          const currentProvider = untrack(() => provider);
          const currentModel = untrack(() => model);
          const currentRubric = untrack(() => extractedRubric);
          const currentMaxScore = untrack(() => rubricMaxScore);

          // Guard: skip AI call if provider or model is empty
          if (!currentProvider || !currentModel) {
            return;
          }

          if (!currentRubric) {
            return;
          }

          // Call the AI anchor generation API
          const anchorResponses = await generateAnchors({
            provider: currentProvider,
            model: currentModel,
            rubric: {
              essayPrompt: currentRubric.essayPrompt,
              checklistItems: currentRubric.checklistItems,
              rubricItems: currentRubric.rubricItems,
              modelText: currentRubric.modelText,
              maxScore: '10', // always generate on virtual 10-pt scale
            },
          });

          // Format AI-generated anchors into textarea text
          if (anchorResponses && anchorResponses.length > 0) {
            anchorText = anchorResponses
              .map(a => {
                const displayScore = Math.round(a.score * (parseFloat(currentMaxScore) || 10) / 10 * 10) / 10;
                return `${a.label} (${displayScore}/${parseFloat(currentMaxScore) || 10}): ${a.response}`;
              })
              .join('\n\n');
          }
        } catch (err) {
          // Fallback: show static anchors if AI generation fails
          const anchors = untrack(() => scoringAnchors);
          const maxScore = untrack(() => rubricMaxScore);
          anchorText = anchors
            .map(a => `${a.label} (${a.score}/${maxScore}): ${a.description}`)
            .join('\n');
        } finally {
          anchorGenerating = false;

          // Auto-continue to grading in auto mode (if not in review mode)
          if (!untrack(() => isReviewMode)) {
            setTimeout(() => handleContinueGrading(), 0);
          }
        }
      })();
    }
  });

  onDestroy(() => {
    if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
    if (batchGrader) { batchGrader.stop(); batchGrader = null; }
    if (embedStatusInterval) clearInterval(embedStatusInterval);
    stopTimer();
  });
</script>

<section class="batch-panel">
  {#if localEmbedEnabled && !localModelLoaded}
    <div class="local-model-banner">
      <span class="spinner">⏳</span>
      Loading local embedding model... (first use only)
    </div>
  {/if}

  <!-- ── Site Profile Selection ──────────────────────────────────── -->
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

  <!-- ── Grading Instructions ────────────────────────────────────── -->
  <details class="section-details">
    <summary class="section-summary">
      <span>Grading Instructions</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </summary>
    <div class="section-content">
      <div class="preset-buttons">
        <button class="btn-preset" class:active={isNonZeroActive}
          onclick={() => togglePreset('nonZero')} disabled={isBatchRunning}>
          Non-Zero Only
        </button>
        <button class="btn-preset" class:active={isLenientActive}
          onclick={() => togglePreset('lenient')} disabled={isBatchRunning}>
          Lenient
        </button>
        <button class="btn-preset" class:active={isStrictActive}
          onclick={() => togglePreset('strict')} disabled={isBatchRunning}>
          Strict
        </button>
        <button class="btn-preset" class:active={isSkipNoResponseActive}
          onclick={() => togglePreset('skipNoResponse')} disabled={isBatchRunning}>
          Skip No Response
        </button>
        <button class="btn-preset" class:active={isNoFormulaPenaltyActive}
          onclick={() => togglePreset('noFormulaPenalty')} disabled={isBatchRunning}>
          No Formula Penalty
        </button>
      </div>
      <label class="toggle-switch-row" class:disabled={isBatchRunning}>
        <span class="toggle-switch-label">Regrade All</span>
        <span class="toggle-switch" class:on={forceRegrade}>
          <input type="checkbox" bind:checked={forceRegrade} disabled={isBatchRunning} />
          <span class="toggle-thumb"></span>
        </span>
      </label>
      <textarea
        class="instructions-textarea"
        rows="4"
        placeholder="Enter additional instructions for the AI grader here..."
        bind:value={customInstructions}
        disabled={isBatchRunning}
      ></textarea>
    </div>
  </details>



  {#if batchPhase === 'review'}
  <div class="anchors-card">
    <div class="anchors-header">
      <span class="anchors-title">Scoring Anchors</span>
      {#if anchorGenerating}
        <span class="anchors-generating">
          <span class="spinner" aria-hidden="true"></span>
          Generating examples...
        </span>
      {:else}
        <span class="anchors-hint">Edit to adjust how scores are calibrated before grading starts.</span>
      {/if}
    </div>

    <textarea
      class="instructions-textarea anchors-textarea"
      rows="5"
      placeholder={anchorGenerating ? 'Generating calibration examples from your rubric…' : ''}
      bind:value={anchorText}
      disabled={anchorGenerating}
    ></textarea>
  </div>
{/if}

  {#if batchPhase === 'review'}
  <div class="continue-grading-row">
    <button
      class="btn-primary small"
      onclick={handleContinueGrading}
      disabled={!batchGrader || batchGrader.studentsToGrade.length === 0}
    >▶ Continue Grading</button>
  </div>
  {/if}

  <!-- ── Fill Mode Toggle ────────────────────────────────────────── -->
  <div class="fill-mode-toggle" class:disabled={isBatchRunning}>
    <div class="toggle-track">
      <div class="toggle-slider" class:review={isReviewMode}></div>
      <button
        class="toggle-option"
        class:active={!isReviewMode}
        onclick={() => { if (!isBatchRunning) isReviewMode = false; }}
        disabled={isBatchRunning}
      >Auto</button>
      <button
        class="toggle-option"
        class:active={isReviewMode}
        onclick={() => { if (!isBatchRunning) isReviewMode = true; }}
        disabled={isBatchRunning}
      >Review</button>
    </div>
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
        <div class="status-left">
          <span class="label">Status:</span>
          <div class="status-value-group">
            {#if batchPhase === 'extracting'}
              <span class="spinner" aria-hidden="true"></span>
              <span class="value running">Extracting...</span>
            {:else if isBatchRunning && isBatchPaused}
              <span class="value paused">Paused</span>
            {:else if isBatchRunning}
              <span class="spinner" aria-hidden="true"></span>
              <span class="value running">Running</span>
            {:else if batchPhase === 'done'}
              <span class="value complete">Complete</span>
            {:else if batchPhase === 'review'}
              <span class="value ready">Review</span>
            {:else}
              <span class="value ready">Ready</span>
            {/if}
          </div>
        </div>
        {#if batchPhase === 'extracting' || (isBatchRunning && !isBatchPaused)}
          <span class="elapsed-timer">{elapsedLabel}</span>
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
      {#if versionCount > 1}
        <div class="version-indicator">
          <small class="version-badge">Version {currentVersionIndex + 1} of {versionCount}</small>
        </div>
      {/if}
      {#if currentStudentName}
        <div class="current-student">
          <small class="text-muted">Filling: {currentStudentName}</small>
        </div>
      {/if}

      {#if pendingReview}
        <div class="review-panel">
          <div class="review-header">
            <span class="review-title">👁 Review</span>
            <span class="review-counter">{pendingReview.chunkIndex + 1} of {pendingReview.chunkTotal}</span>
          </div>
          <div class="review-summary">
            <div class="review-student-row">
              <strong>{pendingReview.studentName}</strong>
              <small class="auto-score-label">Auto: {pendingReview.autoScore}/{pendingReview.maxScore}</small>
            </div>
            <div class="review-score-row">
              <label class="review-score-label" for="review-score-input">Score:</label>
              <input
                id="review-score-input"
                class="review-score-input"
                type="number"
                min="0"
                max={pendingReview.maxScore}
                step="0.5"
                bind:value={pendingReview.score}
              />
              <span class="review-score-max">/ {pendingReview.maxScore}</span>
            </div>
            <textarea
              class="review-feedback-edit"
              rows="4"
              bind:value={pendingReview.feedback}
            ></textarea>
          </div>
          <div class="review-actions">
            <button class="btn-primary" onclick={handleApprove}>✓ Approve</button>
            <button class="btn-secondary" onclick={handleSkip}>⏭ Skip</button>
          </div>
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
    <button class="btn-danger full-width" onclick={handleCancelBatch}>
      Cancel
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
      <button class="btn-secondary" onclick={handleCancelBatch}>
        Cancel
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


  /* ── Dropdown Row (shared by profile + rubric) ── */

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

  /* ── Regrade Toggle Switch ── */
  .toggle-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-1) 0;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch-row.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .toggle-switch-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .toggle-thumb {
    position: absolute;
    inset: 0;
    background: var(--color-border, #444);
    border-radius: 20px;
    transition: background 0.2s ease;
    cursor: pointer;
  }

  .toggle-thumb::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .toggle-switch.on .toggle-thumb {
    background: var(--color-primary, #6366f1);
  }

  .toggle-switch.on .toggle-thumb::after {
    transform: translateX(16px);
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
  .version-indicator { margin-top: var(--spacing-1); }
  .version-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--color-primary, #4a90d9);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
  }
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
  }

  .fill-mode-toggle.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .toggle-track {
    position: relative;
    display: flex;
    width: 100%;
    background: var(--color-bg-main, #1a1a2e);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius-md, 8px);
    padding: 3px;
  }

  .toggle-slider {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: calc(100% - 6px);
    background: var(--color-primary, #6366f1);
    border-radius: calc(var(--radius-md, 8px) - 2px);
    transition: transform 0.2s ease;
    z-index: 0;
  }

  .toggle-slider.review {
    transform: translateX(100%);
  }

  .toggle-option {
    position: relative;
    z-index: 1;
    flex: 1;
    background: none;
    border: none;
    padding: 6px 0;
    font-size: 0.85rem;
    font-weight: 600;
    font-family: var(--font-body);
    color: var(--color-text-secondary, #999);
    cursor: pointer;
    user-select: none;
    transition: color 0.2s ease;
    text-align: center;
  }

  .toggle-option.active {
    color: #fff;
  }

  .toggle-option:disabled {
    cursor: not-allowed;
  }

  /* ── Review Panel ── */
  .review-panel {
    padding: 12px;
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid var(--color-warning, #f59e0b);
    border-radius: 6px;
    margin-top: 8px;
  }
  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .review-title {
    font-weight: 600;
    font-size: 0.85em;
    color: var(--color-warning, #f59e0b);
  }
  .review-counter {
    font-size: 0.78em;
    color: var(--color-text-secondary);
  }
  .review-summary {
    margin-bottom: 10px;
  }
  .review-student-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .review-score {
    font-size: 1.05em;
    font-weight: 500;
  }
  .review-feedback {
    font-size: 0.82em;
    color: var(--color-text-secondary);
    max-height: 100px;
    overflow-y: auto;
    white-space: pre-wrap;
    line-height: 1.4;
  }
  .review-actions {
    display: flex;
    gap: var(--spacing-2, 8px);
  }
  .review-actions button {
    flex: 1;
  }

  /* ── Spinner + Timer ── */
  .status-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-value-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .elapsed-timer {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
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

  /* ── Continue Grading Row ── */
  .continue-grading-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-3, 12px);
    padding: var(--spacing-3, 12px);
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid var(--color-primary, #6366f1);
    border-radius: var(--radius-md, 6px);
    margin-top: 4px;
  }
  .continue-grading-row .btn-primary {
    flex-shrink: 0;
  }
  /* ── Scoring Anchors card ── */
  .anchors-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-main);
  }
  .anchors-header {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-2);
  }
  .anchors-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .anchors-hint {
    font-size: 0.78rem;
    color: var(--color-text-secondary);
  }
  .anchors-textarea {
    resize: vertical;
    min-height: 90px;
  }

  .anchors-generating {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    font-size: 0.78rem;
    color: var(--color-text-secondary);
  }
  .anchor-gen-error {
    font-size: 0.78rem;
    color: var(--color-error, #ef4444);
    margin: 0 0 var(--spacing-1) 0;
  }

  /* ── Review Panel Edit Controls ── */
  .auto-score-label {
    font-size: 0.78em;
    color: var(--color-text-secondary);
    font-weight: 400;
  }
  .review-score-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .review-score-label {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .review-score-input {
    width: 70px;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.9em;
    font-weight: 600;
  }
  .review-score-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
  .review-score-max {
    font-size: 0.85em;
    color: var(--color-text-secondary);
  }
  .review-feedback-edit {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.82em;
    resize: vertical;
    max-height: 150px;
    line-height: 1.4;
    box-sizing: border-box;
  }
  .review-feedback-edit:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }


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

</style>
