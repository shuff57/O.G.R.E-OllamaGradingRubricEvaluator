<script lang="ts">
  /**
   * BatchProgress — Batch grading lifecycle engine: extraction, grading,
   * SSE event handling, timer, review gate, progress display, and batch log.
   *
   * Exports methods called by the shell on behalf of other sub-components.
   */
  import { onDestroy, untrack } from 'svelte';
  import { evalScript } from '../../../lib/browser';
  import {
    BatchGrader,
    extractRubric,
    isRubricSufficient,
  } from '../../../lib/batch-grader';
  import type { BatchProgress as BatchProgressType, Rubric, SiteProfile, VersionGroup } from '../../../lib/batch-grader';
  import type { BatchLogEntry } from '../../../lib/batch-grader';
  import { startBatchGrading, generateAnchors } from '../../../lib/grading-api';
  import type {
    BatchGradingHandle,
    BatchChunkEvent,
    BatchOutlierEvent,
    BatchProgressEvent,
    BatchDoneEvent,
    BatchErrorEvent,
    BatchHeartbeatEvent,
    BatchStudentResult,
  } from '../../../lib/grading-api';
  import { saveBatchSession, clearBatchSession } from '../../../lib/db';
  import { refreshPageData, buildBatchResetState, stopActiveBatch } from '../../../lib/page-refresh';
  import { textToCriteria } from '../../../lib/rubric-utils';
  import ResponseRenderer from '../../ResponseRenderer.svelte';
  import { formatRubricForDisplay, normalizeAnchorTextToVirtual10 } from './format';
  import { rewriteRubricAI, restoreCategoryWeights } from '../../../lib/rubric-leniency';

  // ── Props (read-only from shell) ───────────────────────────────────────
  let {
    provider = '',
    model = '',
    activeProfile = null as SiteProfile | null,
    forceRegrade = false,
    zeroNoResponse = false,
    isReviewMode = false,
    resumeAfter = '',
    currentPageUrl = '',
    pageLoadedUrl = '',
    leniency = 50,
    weightMode = 'category' as 'category' | 'criterion',
    // Bindable — batch lifecycle state exposed to shell
    originalRubricText = $bindable(''),
    isBatchRunning = $bindable(false),
    batchPhase = $bindable<'idle' | 'extracting' | 'review' | 'grading' | 'done'>('idle'),
    rubricText = $bindable(''),
    rubricMaxScore = $bindable('10'),
    extractedRubric = $bindable<Rubric | null>(null),
    sourceRubricId = $bindable<string | null>(null),
    essayPrompt = $bindable(''),
    savedSessionStudent = $bindable<string | null>(null),
    batchError = $bindable(''),
    anchorText = $bindable(''),
    anchorGenerating = $bindable(false),
    batchGraderHasStudents = $bindable(false),
    isBatchPaused = $bindable(false),
    outlierReport = $bindable<BatchStudentResult[]>([]),
  } = $props();

  // ── Internal State ─────────────────────────────────────────────────────
  let batchGrader = $state<BatchGrader | null>(null);
  let batchHandle = $state<BatchGradingHandle | null>(null);
  let batchProgress = $state<BatchProgressType | null>(null);
  let batchLog = $state<BatchLogEntry[]>([]);
  let isLogExpanded = $state(false);
  let logContainer: HTMLElement | undefined = $state(undefined);
  let currentStudentName = $state('');
  let phaseMessage = $state('');
  let pausedResultBuffer: Array<{ studentIndex: number; score: number; feedback: string }> = [];
  let isAutoStopped = false;
  let extractionCancelled = $state(false);
  let batchActive = false; // Suppresses URL auto-reset during batch operations

  // ── Version Grouping ───────────────────────────────────────────────────
  let currentVersionIndex = $state(0);
  let versionCount = $state(1);

  // ── Review Gate ────────────────────────────────────────────────────────
  type ReviewData = {
    studentIndex: number;
    score: number;
    autoScore: number;
    feedback: string;
    studentName: string;
    maxScore: number;
    chunkIndex: number;
    chunkTotal: number;
  };
  let pendingReview = $state<ReviewData | null>(null);
  let reviewResolve: ((decision: { action: 'approve' | 'skip'; score?: number; feedback?: string }) => void) | null = null;
  let reviewShowPreview = $state(false);

  // ── Grading Timer ──────────────────────────────────────────────────────
  let elapsedSeconds = $state(0);
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let batchTimerStart = 0;

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${s}s`;
  }

  let elapsedLabel = $derived(formatElapsed(elapsedSeconds));

  // ── Scroll-to-student on name click ───────────────────────────────────
  async function scrollToStudent(entry: BatchLogEntry) {
    const sel = activeProfile?.selectors;
    if (!sel?.studentSection) return;
    const secSel = sel.studentSection.replace(/'/g, "\\'");
    const nameSel = sel.studentName ? sel.studentName.replace(/'/g, "\\'") : '';
    const studentName = entry.studentName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const idx = entry.studentIndex;
    await evalScript(`(function(){
      var sections = document.querySelectorAll('${secSel}');
      var target = null;
      ${nameSel ? `for (var i = 0; i < sections.length; i++) {
        var n = sections[i].querySelector('${nameSel}');
        if (n && n.textContent.trim() === '${studentName}') { target = sections[i]; break; }
      }` : ''}
      if (!target && sections[${idx}]) target = sections[${idx}];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.outline = '2px solid #4f8ef7';
        setTimeout(function(){ target.style.outline = ''; }, 2000);
      }
    })()`);
  }

  let progressPercent = $derived(
    batchProgress && batchProgress.totalStudents > 0
      ? (batchProgress.gradedCount + batchProgress.errorCount) / batchProgress.totalStudents * 100
      : 0
  );

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

  // ── Scoring Anchors ────────────────────────────────────────────────────
  type AnchorItem = {
    label: string;
    score: number;
    description: string;
    colorClass: string;
  };

  function computeScoringAnchors(
    maxScore: number,
    checklistItems?: Array<{ category: string; items: string[] }>
  ): AnchorItem[] {
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

  // ── Helpers ────────────────────────────────────────────────────────────
  function updateBatchState() {
    if (!batchGrader) return;
    batchProgress = batchGrader.getProgress();
    batchLog = batchGrader.getLog();
    batchGraderHasStudents = batchGrader.studentsToGrade.length > 0;
    if (isLogExpanded) scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    });
  }

  // ── URL Change Auto-Reset ──────────────────────────────────────────────
  // Only resets batch state when the user navigates away (batchActive=false).
  // During active batch operations (extracting/review/grading), URL changes
  // from student navigation are expected and must NOT trigger a reset.
  $effect(() => {
    const url = pageLoadedUrl;
    if (!url) return;
    untrack(() => {
      if (batchActive) return; // Suppress during batch operations
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
        resumeAfter = '';
        currentVersionIndex = 0;
        versionCount = 1;
        stopTimer();
      }
    });
  });

  /**
   * Set rubricText from extraction. Leniency rewrite is handled by
   * the AI rewrite triggered when the teacher adjusts the slider.
   */
  function setExtractedRubricText(text: string) {
    originalRubricText = text;
    rubricText = text;
  }

  /**
   * Apply leniency rewrite to the current rubricText if leniency is not center.
   * Used during version-advance to ensure the new version's rubric gets rewritten
   * before anchors are generated and grading starts.
   */
  async function applyLeniencyRewrite(): Promise<void> {
    if (leniency === 50 || !rubricText) return;
    try {
      const raw = rubricText;
      const result = await rewriteRubricAI(
        raw, leniency,
        { provider: provider || undefined, model: model || undefined },
      );
      rubricText = restoreCategoryWeights(result, raw);
    } catch {
      // Non-fatal — continue with un-rewritten rubric rather than blocking grading
    }
  }

  // ── Build rubric object from current textarea text ──────────────────────
  // Parses the textarea into structured rubric data, extracting model text
  // (ideal answer) from the "--- Model Response ---" section. When leniency
  // is active, both rubric criteria AND model text will be the rewritten versions.
  function buildRubricFromText(): { essayPrompt: string; checklistItems: { category: string; items: string[]; categoryWeight?: number }[]; rubricItems: { category: string; items: string[] }[]; modelText: string | null; maxScore: string } {
    const base = extractedRubric;
    const text = rubricText;

    // Extract model text from textarea (may be leniency-rewritten)
    const modelText = extractModelTextFromText(text) ?? base?.modelText ?? null;

    // Helper: look up categoryWeight by category name from the scraped rubric's categoryWeights map.
    // This re-attaches weight data that cannot survive the textarea round-trip.
    const lookupCategoryWeight = (catName: string): number | undefined =>
      base?.categoryWeights?.[catName];

    // Try structured criteria format first (Name (Npts): Desc)
    const parsed = textToCriteria(text);
    if (parsed.length > 0) {
      // Group parsed criteria by category for checklistItems format.
      // When criteria come from the rewritten rubricText, these ARE the
      // grading criteria — don't also send raw rubricItems (which may
      // contain stale "Target:" text from the DOM extraction).
      const groupedChecklist: { category: string; items: string[]; categoryWeight?: number }[] = [];
      const seenCats = new Map<string, { items: string[]; categoryWeight?: number }>();
      for (const c of parsed) {
        const catName = c.category ?? c.criteria;
        const catWeight = c.categoryWeight ?? lookupCategoryWeight(catName);
        const itemText = c.description ? `${c.criteria}: ${c.description}` : c.criteria;
        if (seenCats.has(catName)) {
          seenCats.get(catName)!.items.push(itemText);
        } else {
          const entry = { items: [itemText], ...(catWeight !== undefined ? { categoryWeight: catWeight } : {}) };
          seenCats.set(catName, entry);
          groupedChecklist.push({ category: catName, ...entry });
        }
      }
      return {
        essayPrompt: base?.essayPrompt || '',
        checklistItems: groupedChecklist,
        rubricItems: [],
        modelText,
        maxScore: rubricMaxScore,
      };
    }

    // Try [Category] / - item format (from formatRubricForDisplay)
    const checklistItems: { category: string; items: string[]; categoryWeight?: number }[] = [];
    const rubricItems: { category: string; items: string[] }[] = [];
    let current: { category: string; items: string[]; categoryWeight?: number } | null = null;
    let inRubricTargets = false;
    let inModelSection = false;
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t === '--- Model Response ---') { inModelSection = true; continue; }
      if (t.startsWith('---') && inModelSection) { inModelSection = false; continue; }
      if (inModelSection) continue; // skip model text lines (already extracted)
      if (t === '--- Rubric Targets ---') { inRubricTargets = true; current = null; continue; }
      if (t === '--- Grading Checklist ---') { inRubricTargets = false; current = null; continue; }
      if (t.startsWith('[') && (t.endsWith(']') || t.match(/\]\s*$/))) {
        const cat = t.replace(/^\[/, '').replace(/\]\s*$/, '');
        const catWeight = lookupCategoryWeight(cat);
        current = { category: cat, items: [], ...(catWeight !== undefined ? { categoryWeight: catWeight } : {}) };
        if (inRubricTargets) rubricItems.push(current);
        else checklistItems.push(current);
      } else if (t.startsWith('-') && current) {
        current.items.push(t.slice(1).trim());
      }
    }

    if (checklistItems.length > 0 || rubricItems.length > 0) {
      return {
        essayPrompt: base?.essayPrompt || '',
        checklistItems: checklistItems.length > 0 ? checklistItems : (base?.checklistItems || []),
        rubricItems: rubricItems.length > 0 ? rubricItems : (base?.rubricItems || []),
        modelText,
        maxScore: rubricMaxScore,
      };
    }

    // Fallback to extractedRubric as-is
    return {
      essayPrompt: base?.essayPrompt || '',
      checklistItems: base?.checklistItems || [],
      rubricItems: base?.rubricItems || [],
      modelText,
      maxScore: rubricMaxScore,
    };
  }

  /** Extract model text from the "--- Model Response ---" section of textarea */
  function extractModelTextFromText(text: string): string | null {
    const marker = '--- Model Response ---';
    const idx = text.indexOf(marker);
    if (idx === -1) return null;
    const after = text.slice(idx + marker.length).trim();
    // Model text runs until the next "---" section header or end of text
    const nextSection = after.indexOf('\n---');
    const modelText = nextSection === -1 ? after : after.slice(0, nextSection).trim();
    return modelText || null;
  }

  // ── Generate AI scoring anchors (called explicitly by teacher) ─────────
  export async function handleGenerateAnchors() {
    anchorText = '';
    anchorGenerating = true;

    // maxScore comes from the page (what the question is actually worth).
    // Rubric category point totals are internal weights — the server scales
    // AI scores from virtual-10 down to the real maxScore automatically.
    const currentMaxScore = rubricMaxScore;

    try {
      const currentProvider = provider;
      const currentModel = model;
      const currentRubric = buildRubricFromText();

      if (!currentProvider || !currentModel) {
        batchError = 'No AI provider/model selected — configure one in Settings.';
        return;
      }
      if (!currentRubric.checklistItems.length && !currentRubric.rubricItems.length) {
        batchError = 'No rubric criteria found — extract or enter a rubric first.';
        return;
      }

      const currentLeniency = leniency;
      const anchorResponses = await generateAnchors({
        provider: currentProvider,
        model: currentModel,
        rubric: {
          essayPrompt: currentRubric.essayPrompt,
          checklistItems: currentRubric.checklistItems,
          rubricItems: currentRubric.rubricItems,
          modelText: currentRubric.modelText,
          maxScore: currentMaxScore,
        },
        leniency: currentLeniency,
      });

      if (anchorResponses && anchorResponses.length > 0) {
        anchorText = anchorResponses
          .map(a => `${a.label}: ${a.response}`)
          .join('\n\n');
      }
    } catch (err) {
      batchError = `Anchor generation failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      anchorGenerating = false;
    }
  }

  // Anchors are generated explicitly via handleGenerateAnchors() —
  // teacher always reviews the rubric first, then clicks "Generate Anchors".

  // ── Dismiss anchor spinner when leaving review phase ──────────────────
  $effect(() => {
    if (batchPhase !== 'review' && anchorGenerating) {
      anchorGenerating = false;
    }
  });

  // ── Phase 1: Extract ───────────────────────────────────────────────────
  export async function handleExtract() {
    isAutoStopped = false;
    extractionCancelled = false;
    batchActive = true; // Suppress URL auto-reset during batch
    batchError = '';
    phaseMessage = '';
    batchPhase = 'extracting';
    batchLog = [];
    outlierReport = [];
    startTimer();

    try {
      batchGrader = new BatchGrader();
      await batchGrader.start(activeProfile!, resumeAfter || null, forceRegrade);
      if (extractionCancelled) {
        batchActive = false;
        batchGrader.stop();
        batchGrader = null;
        batchPhase = 'idle';
        stopTimer();
        return;
      }
      updateBatchState();
      if (zeroNoResponse) {
        await batchGrader.applyZeroToNoResponseStudents();
      }

      versionCount = batchGrader.versionCount;
      currentVersionIndex = 0;

      const rubric = batchGrader.rubric;

      if (versionCount > 1) {
        const v1Rubric = batchGrader.getRubricForVersion(0);
        if (v1Rubric) {
          extractedRubric = v1Rubric;
          setExtractedRubricText(formatRubricForDisplay(v1Rubric, batchGrader.versionGroups));
          rubricMaxScore = v1Rubric.maxScore || '10';
          essayPrompt = v1Rubric.essayPrompt || '';
          if (sourceRubricId !== null) { sourceRubricId = null; }
        }
      } else if (rubric) {
        extractedRubric = rubric;
        setExtractedRubricText(formatRubricForDisplay(rubric));
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
      batchActive = false;
      batchError = err instanceof Error ? err.message : String(err);
      stopTimer();
      batchPhase = 'idle';
      batchGrader = null;
    }
  }

  // ── Phase 2: Continue to grading after review ──────────────────────────
  export async function handleContinueGrading() {
    if (!batchGrader) return;
    const grader = batchGrader;

    isAutoStopped = false;
    batchError = '';

    // When forceRegrade is checked, use all students (except no-response)
    // regardless of whether they were filtered during extraction
    const baseStudents = forceRegrade
      ? grader.students.filter(s => !grader.noResponseStudents.includes(s))
      : grader.studentsToGrade;
    const studentsToGrade = versionCount > 1
      ? baseStudents.filter(s => {
          const versionStudents = grader.getStudentsForVersion(currentVersionIndex);
          return versionStudents.some(vs => vs.index === s.index);
        })
      : baseStudents;

    if (studentsToGrade.length === 0) {
      if (versionCount > 1 && batchGrader.advanceVersion()) {
        currentVersionIndex = batchGrader.currentVersionIndex;
        updateVersionDisplay();
        await applyLeniencyRewrite();
        handleContinueGrading();
        return;
      }
      phaseMessage = 'No students to grade';
      batchPhase = 'done';
      batchGrader.stop();
      return;
    }

    // Build rubric from current textarea text (includes leniency rewrites)
    const currentRubric = buildRubricFromText();
    if (!currentRubric.checklistItems.length && !currentRubric.rubricItems.length && !rubricText.trim()) {
      batchError = 'No rubric text. Load a rubric from the library or type one manually.';
      return;
    }

    // Update extractedRubric so version logic and other consumers stay in sync
    if (extractedRubric) {
      if (currentRubric.checklistItems.length) extractedRubric.checklistItems = currentRubric.checklistItems;
      if (currentRubric.rubricItems.length) extractedRubric.rubricItems = currentRubric.rubricItems;
    }

    let rubric: Rubric | null;
    if (versionCount > 1) {
      rubric = batchGrader.getRubricForVersion(currentVersionIndex);
      if (rubric) {
        rubric.checklistItems = currentRubric.checklistItems;
        rubric.rubricItems = currentRubric.rubricItems;
      }
    } else {
      rubric = {
        essayPrompt: currentRubric.essayPrompt,
        checklistItems: currentRubric.checklistItems,
        rubricItems: currentRubric.rubricItems,
        modelText: currentRubric.modelText,
        maxScore: rubricMaxScore,
      };
    }
    if (!rubric) {
      batchError = 'No rubric available. Check that you are on a grading page.';
      return;
    }

    rubric.maxScore = rubricMaxScore;

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

    const instructionsParts: string[] = [];
    if (anchorText.trim()) instructionsParts.push(`SCORING CALIBRATION:\n${anchorText.trim()}`);

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
            ...(weightMode === 'category' ? (() => {
              const cws: Record<string, number> = {};
              const seen = new Set<string>();
              for (const row of textToCriteria(rubricText)) {
                const cat = row.category ?? '';
                if (!seen.has(cat) && row.categoryWeight !== undefined) {
                  seen.add(cat);
                  cws[cat] = row.categoryWeight;
                }
              }
              return Object.keys(cws).length > 0 ? { categoryWeights: cws } : {};
            })() : {}),
            ...(weightMode === 'criterion' ? (() => {
              const cws: Record<string, Record<string, number>> = {};
              for (const row of textToCriteria(rubricText)) {
                const cat = row.category ?? '';
                if (row.criterionWeight !== undefined && row.criterionWeight > 0) {
                  if (!cws[cat]) cws[cat] = {};
                  cws[cat][row.criteria] = row.criterionWeight;
                }
              }
              return Object.keys(cws).length > 0 ? { criterionWeights: cws } : {};
            })() : {}),
          },
          students: studentsToGrade.map(s => ({
            index: s.index,
            name: s.name,
            response: s.response,
            ...(s.prompt ? { prompt: s.prompt } : {}),
          })),
          customInstructions: instructionsParts.length > 0 ? instructionsParts.join('\n\n') : undefined,
          weightMode,
        },
        {
          onProgress: handleSSEProgress,
          onChunk: handleSSEChunk,
          onOutlier: handleSSEOutlier,
          onDone: handleSSEDone,
          onError: handleSSEError,
          onHeartbeat: (data) => {
            phaseMessage = `AI is thinking... (${data.elapsed}s elapsed)`;
          },
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

  function updateVersionDisplay() {
    if (!batchGrader) return;
    const rubric = batchGrader.getRubricForVersion(currentVersionIndex);
    if (rubric) {
      extractedRubric = rubric;
      setExtractedRubricText(formatRubricForDisplay(rubric, batchGrader.versionGroups));
      rubricMaxScore = rubric.maxScore || '10';
      essayPrompt = rubric.essayPrompt || '';
    }
    const vStudents = batchGrader.getStudentsForVersion(currentVersionIndex);
    phaseMessage = `Version ${currentVersionIndex + 1} of ${versionCount}: ${vStudents.length} students`;
  }

  // ── Apply result ───────────────────────────────────────────────────────
  async function applyResult(result: { studentIndex: number; score: number; feedback: string }, chunkIndex = 0, chunkTotal = 1): Promise<void> {
    if (!batchGrader) return;
    const student = batchGrader.studentsToGrade.find(s => s.index === result.studentIndex);
    const studentName = student?.name || `Student ${result.studentIndex}`;

    if (isReviewMode) {
      const maxScore = parseInt(rubricMaxScore) || 10;
      const decision = await requestStudentReview(result, studentName, maxScore, chunkIndex, chunkTotal);
      if (decision.action === 'skip') {
        updateBatchState();
        return;
      }
      result = {
        ...result,
        score: decision.score ?? result.score,
        feedback: decision.feedback ?? result.feedback,
      };
    }

    currentStudentName = studentName;
    try {
      await batchGrader.applyGrade(result.studentIndex, result.score, result.feedback);
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

  // ── SSE Event Handlers ─────────────────────────────────────────────────
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
    // Accumulate every adjusted entry so the end-of-run review panel can show
    // what was changed. Multi-version runs append across versions intentionally.
    outlierReport = [...outlierReport, ...adjustedResults];
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

    if (batchGrader) {
      try { await batchGrader.save(); } catch { /* non-fatal */ }
    }

    // Chain to next version if there are more
    if (versionCount > 1 && batchGrader?.advanceVersion()) {
      currentVersionIndex = batchGrader.currentVersionIndex;
      const vStudents = batchGrader.getStudentsForVersion(currentVersionIndex);
      phaseMessage = `Version ${currentVersionIndex} of ${versionCount} complete. Starting version ${currentVersionIndex + 1} (${vStudents.length} students)...`;
      updateVersionDisplay();

      // Apply leniency rewrite to new version's rubric before generating anchors
      await applyLeniencyRewrite();

      // Regenerate AI anchors for the new version's rubric
      anchorGenerating = true;
      try {
        const currentProvider = untrack(() => provider);
        const currentModel = untrack(() => model);
        const versionRubric = batchGrader.getRubricForVersion(currentVersionIndex);

        if (currentProvider && currentModel && versionRubric) {
          // Use rewritten rubricText criteria for anchors, not raw extraction
          const currentRubricForAnchors = buildRubricFromText();
          const anchorResponses = await generateAnchors({
            provider: currentProvider,
            model: currentModel,
            rubric: {
              essayPrompt: currentRubricForAnchors.essayPrompt || versionRubric.essayPrompt,
              checklistItems: currentRubricForAnchors.checklistItems,
              rubricItems: currentRubricForAnchors.rubricItems,
              modelText: currentRubricForAnchors.modelText ?? versionRubric.modelText,
              maxScore: '10',
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
          const anchors = untrack(() => scoringAnchors);
          anchorText = anchors
            .map(a => `${a.label} (${a.score}/${parseFloat(rubricMaxScore) || 10}): ${a.description}`)
            .join('\n');
        }
      } catch (err) {
        const anchors = untrack(() => scoringAnchors);
        anchorText = anchors
          .map(a => `${a.label} (${a.score}/${parseFloat(rubricMaxScore) || 10}): ${a.description}`)
          .join('\n');
      } finally {
        anchorGenerating = false;
      }

      batchHandle = null;
      await new Promise(r => setTimeout(r, 500));
      handleContinueGrading();
      return;
    }

    // All versions done (or single version)
    phaseMessage = `Complete — ${batchGrader?.studentsToGrade.length ?? data.metadata.totalStudents} students in ${data.metadata.elapsedSeconds}s`;
    if (batchGrader) batchGrader.stop();
    if (currentPageUrl) {
      try { await clearBatchSession(currentPageUrl); } catch { /* non-fatal */ }
    }
    savedSessionStudent = null;
    stopTimer();
    isBatchRunning = false;
    isBatchPaused = false;
    currentStudentName = '';
    batchHandle = null;
    batchActive = false;
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

  // ── Pause / Stop / Cancel Controls ─────────────────────────────────────
  export function handlePauseBatch() {
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

  export function handleStopBatch() {
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

  export function handleCancelBatch() {
    batchActive = false;
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
    extractionCancelled = true;
    currentVersionIndex = 0;
    versionCount = 1;
    if (batchPhase === 'grading') {
      batchPhase = 'review';
    } else {
      batchPhase = 'idle';
    }
    updateBatchState();
  }

  export function handleReset() {
    batchActive = false;
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
    batchGraderHasStudents = false;
    outlierReport = [];
  }

  export function handleResumeSession() {
    if (savedSessionStudent) {
      resumeAfter = savedSessionStudent;
      handleExtract();
    }
  }

  export async function handleStartFresh() {
    if (currentPageUrl) {
      try { await clearBatchSession(currentPageUrl); } catch { /* non-fatal */ }
    }
    savedSessionStudent = null;
    resumeAfter = '';
    handleExtract();
  }

  // ── Review Gate Functions ──────────────────────────────────────────────
  function requestStudentReview(
    result: { studentIndex: number; score: number; feedback: string },
    studentName: string,
    maxScore: number,
    index: number,
    total: number
  ): Promise<{ action: 'approve' | 'skip'; score?: number; feedback?: string }> {
    return new Promise((resolve) => {
      pendingReview = { ...result, autoScore: result.score, studentName, maxScore, chunkIndex: index, chunkTotal: total };
      reviewShowPreview = false;
      reviewResolve = resolve;
    });
  }

  export function handleApprove() {
    if (reviewResolve && pendingReview) {
      const editedScore = Math.max(0, Math.min(pendingReview.maxScore, Number(pendingReview.score) || 0));
      const editedFeedback = pendingReview.feedback;
      reviewResolve({ action: 'approve', score: editedScore, feedback: editedFeedback });
      pendingReview = null;
      reviewResolve = null;
    }
  }

  export function handleSkip() {
    if (reviewResolve) {
      reviewResolve({ action: 'skip' });
      pendingReview = null;
      reviewResolve = null;
    }
  }

  onDestroy(() => {
    if (batchHandle) { batchHandle.cancel(); batchHandle = null; }
    if (batchGrader) { batchGrader.stop(); batchGrader = null; }
    stopTimer();
  });
</script>

<!-- ── Status & Progress ───────────────────────────────────────────── -->
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
          <div class="review-feedback-tabs">
            <button
              class="tab-btn {reviewShowPreview ? '' : 'active'}"
              onclick={() => reviewShowPreview = false}
            >Edit</button>
            <button
              class="tab-btn {reviewShowPreview ? 'active' : ''}"
              onclick={() => reviewShowPreview = true}
            >Preview</button>
          </div>
          {#if reviewShowPreview}
            <div class="review-feedback-preview">
              <ResponseRenderer content={pendingReview.feedback} />
            </div>
          {:else}
            <textarea
              class="review-feedback-edit"
              rows="6"
              bind:value={pendingReview.feedback}
            ></textarea>
          {/if}
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
                  <button class="log-name clickable" onclick={() => scrollToStudent(entry)}>{entry.studentName}</button>
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

<style>
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

  .log-name.clickable {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-weight: 500;
    text-decoration: underline dotted;
    text-align: left;
  }

  .log-name.clickable:hover {
    color: var(--color-accent, #4f8ef7);
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
  .review-actions {
    display: flex;
    gap: var(--spacing-2, 8px);
  }
  .review-actions button {
    flex: 1;
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
  .review-feedback-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 4px;
  }
  .tab-btn {
    flex: 1;
    padding: 4px 8px;
    font-size: 0.75em;
    font-weight: 500;
    border: 1px solid var(--color-border);
    background: var(--color-bg-main);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .tab-btn:first-child {
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }
  .tab-btn:last-child {
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    border-left: none;
  }
  .tab-btn.active {
    background: var(--color-primary-bg, rgba(99, 102, 241, 0.12));
    color: var(--color-primary, #6366f1);
    border-color: var(--color-primary, #6366f1);
    font-weight: 600;
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
    max-height: 200px;
    line-height: 1.4;
    box-sizing: border-box;
  }
  .review-feedback-edit:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
  .review-feedback-preview {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-size: 0.82em;
    line-height: 1.5;
    max-height: 250px;
    overflow-y: auto;
    box-sizing: border-box;
  }
</style>
