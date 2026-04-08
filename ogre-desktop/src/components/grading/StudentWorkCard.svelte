<script lang="ts">
  /**
   * StudentWorkCard - Student work input, LaTeX math input, AI feedback display.
   * Contains the core grading workflow for individual student assessment.
   * Calls grading-api.gradeStudent() to get real AI feedback.
   */
  import { onMount, onDestroy } from 'svelte';
  import ResponseRenderer from '../ResponseRenderer.svelte';
  import MathField from '../MathField.svelte';
  import { extractSelectedText } from '../../lib/browser';
  import { gradeStudent, type GradeRubric, type GradeResponse } from '../../lib/grading-api';

  interface Props {
    onScreenshot?: () => void;
    /** Active provider ID (auto-selects on server if omitted) */
    provider?: string;
    /** Active model name (auto-selects on server if omitted) */
    model?: string;
    /** Rubric data for grading context */
    rubric?: GradeRubric;
    /** Captured screenshot images (data URLs). Managed by GradingPanel. */
    screenshots?: string[];
    /** Remove a screenshot by index. */
    onRemoveScreenshot?: (index: number) => void;
    /** True while a screenshot capture is in progress. */
    isCapturing?: boolean;
    /** Error message from a failed screenshot capture. */
    captureError?: string;
    /** Optional student name — shown in result heading and prepended to AI prompt. */
    studentName?: string;
  }

  let {
    onScreenshot,
    provider,
    model,
    rubric,
    screenshots = [],
    onRemoveScreenshot,
    isCapturing = false,
    captureError = '',
    studentName = '',
  }: Props = $props();

  // State
  let studentWork = $state('');
  let aiResponse = $state('');
  let isLoading = $state(false);
  let errorMessage = $state('');
  let lastGradeResult = $state<GradeResponse | null>(null);

  // LaTeX mode state
  let isLatexMode = $state(false);
  let feedbackLatex = $state('');

  // Highlight text status
  let highlightStatus = $state('');

  function toggleLatexMode() {
    isLatexMode = !isLatexMode;
  }

  /**
   * Format a GradeResponse into markdown for ResponseRenderer.
   */
  function formatGradeResponse(result: GradeResponse, maxScore: string): string {
    const lines: string[] = [];
    lines.push(`## Assessment Results`);
    lines.push('');
    lines.push(`**Score:** ${result.score} / ${maxScore}`);
    lines.push('');
    lines.push(`---`);
    lines.push('');
    lines.push(result.feedback);
    lines.push('');
    lines.push(`---`);
    lines.push(`*Graded by ${result.model} (${result.provider})*`);
    return lines.join('\n');
  }

  async function handleRunAssessment() {
    if (!studentWork.trim()) {
      errorMessage = 'Please enter or paste student work first.';
      setTimeout(() => { errorMessage = ''; }, 4000);
      return;
    }

    isLoading = true;
    aiResponse = '';
    errorMessage = '';
    lastGradeResult = null;

    try {
      const workWithName = studentName
        ? `Student: ${studentName}\n\n${studentWork.trim()}`
        : studentWork.trim();
      const result = await gradeStudent({
        studentWork: workWithName,
        rubric: rubric || { maxScore: '10' },
        provider: provider || undefined,
        model: model || undefined,
      });

      lastGradeResult = result;
      const maxScore = rubric?.maxScore || '10';
      aiResponse = formatGradeResponse(result, maxScore);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      errorMessage = message;
      // Auto-dismiss after 8 seconds
      setTimeout(() => { if (errorMessage === message) errorMessage = ''; }, 8000);
    } finally {
      isLoading = false;
    }
  }

  async function handleGetHighlightedText() {
    highlightStatus = '';
    try {
      const text = await extractSelectedText();
      if (text) {
        studentWork = text;
        highlightStatus = '';
      } else {
        highlightStatus = 'No text selected in the browser';
        setTimeout(() => { highlightStatus = ''; }, 3000);
      }
    } catch (err) {
      highlightStatus = 'Failed to extract text';
      setTimeout(() => { highlightStatus = ''; }, 3000);
    }
  }

  function handleScreenshotClick() {
    onScreenshot?.();
  }

  function dismissError() {
    errorMessage = '';
  }

  // Keyboard shortcut: Ctrl+Enter to run assessment
  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !isLoading) {
      event.preventDefault();
      handleRunAssessment();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<section class="student-work-card">
  <h3>Student Work</h3>
  <div class="input-group">
    <textarea placeholder="Paste student text here or use screenshot tool..." rows="6" bind:value={studentWork}></textarea>
    <div class="tool-actions">
      <button class="btn-secondary small" onclick={handleScreenshotClick} disabled={isCapturing}>
        {#if isCapturing}
          <span class="spinner-xs"></span>
          Capturing...
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Screenshot
        {/if}
      </button>
      <button class="btn-secondary small" onclick={handleGetHighlightedText}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Get Highlighted Text
      </button>
    </div>
    {#if captureError}
      <small class="capture-error">{captureError}</small>
    {/if}
    {#if highlightStatus}
      <small class="highlight-status">{highlightStatus}</small>
    {/if}

    <!-- Screenshot thumbnails -->
    {#if screenshots.length > 0}
      <div class="screenshot-gallery">
        {#each screenshots as src, i}
          <div class="screenshot-thumb">
            <img src={src} alt="Screenshot {i + 1}" />
            <button
              class="thumb-remove"
              onclick={() => onRemoveScreenshot?.(i)}
              aria-label="Remove screenshot {i + 1}"
            >&times;</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="divider"></div>

  <!-- LaTeX Math Input Section -->
  <div class="latex-section">
    <div class="section-header">
      <h3>Math Input</h3>
      <button class="btn-secondary small latex-toggle" onclick={toggleLatexMode}>
        {isLatexMode ? 'Plain Text' : 'LaTeX Math'}
      </button>
    </div>

    {#if isLatexMode}
      <div class="input-group">
        <MathField bind:value={feedbackLatex} />
        {#if feedbackLatex}
          <div class="latex-preview">
            <small class="preview-label">Preview</small>
            <ResponseRenderer content={`$$${feedbackLatex}$$`} />
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="divider"></div>

  <h3>AI Feedback</h3>
  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span class="error-text">{errorMessage}</span>
      <button class="error-dismiss" onclick={dismissError} aria-label="Dismiss error">&times;</button>
    </div>
  {/if}
  {#if aiResponse || isLoading}
    <div class="ai-response-container">
      {#if isLoading}
        <div class="loading-indicator">
          <span class="spinner-md"></span>
          <span class="loading-text">Analyzing student work...</span>
        </div>
      {:else}
        {#if studentName}
          <p class="student-name-label"><strong>{studentName}</strong></p>
        {/if}
        <ResponseRenderer content={aiResponse} />
      {/if}
    </div>
  {:else}
    <div class="ai-response-placeholder">
      <p class="text-muted">Run assessment to see feedback</p>
    </div>
  {/if}
</section>

<div class="panel-footer">
  <button class="btn-primary full-width" onclick={handleRunAssessment} disabled={isLoading} title="Run Assessment (Ctrl+Enter)">
    {#if isLoading}
      <span class="spinner-sm"></span>
      Grading...
    {:else}
      Run Assessment
    {/if}
  </button>
</div>

<style>
  .student-work-card {
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

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  textarea {
    width: 100%;
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2);
    font-family: var(--font-body);
    font-size: 0.9rem;
    resize: vertical;
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }

  .tool-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .btn-secondary.small {
    padding: var(--spacing-1) var(--spacing-3);
    font-size: 0.8rem;
  }

  .highlight-status {
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    padding: var(--spacing-1) 0;
  }

  .divider {
    height: 1px;
    background-color: var(--color-border);
    margin: var(--spacing-2) 0;
  }

  .latex-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .latex-toggle {
    font-size: 0.75rem;
    padding: var(--spacing-1) var(--spacing-2);
  }

  .latex-preview {
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
    position: relative;
  }

  .preview-label {
    position: absolute;
    top: var(--spacing-1);
    right: var(--spacing-2);
    color: var(--color-text-secondary);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background-color: color-mix(in srgb, var(--color-error, #ef4444) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-error, #ef4444) 30%, transparent);
    border-radius: var(--radius-md);
    color: var(--color-error, #ef4444);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .error-text {
    flex: 1;
    word-break: break-word;
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
  }

  .error-dismiss:hover {
    opacity: 1;
  }

  .ai-response-placeholder {
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-6);
    text-align: center;
    background-color: var(--color-bg-main);
    flex: 1;
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ai-response-container {
    background-color: var(--color-bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-4);
    min-height: 150px;
    overflow-y: auto;
    flex: 1;
  }

  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-3);
    min-height: 120px;
    color: var(--color-text-secondary);
  }

  .loading-text {
    font-size: 0.9rem;
    font-style: italic;
  }

  .panel-footer {
    padding-top: var(--spacing-2);
    flex-shrink: 0;
  }

  .btn-primary.full-width {
    width: 100%;
    justify-content: center;
    padding: var(--spacing-3);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinner-sm {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    margin-right: 0.5em;
  }

  .spinner-md {
    display: inline-block;
    width: 2em;
    height: 2em;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-xs {
    display: inline-block;
    width: 0.85em;
    height: 0.85em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    margin-right: 0.3em;
    vertical-align: middle;
  }

  .capture-error {
    color: var(--color-error, #ef4444);
    font-size: 0.8rem;
    padding: var(--spacing-1) 0;
  }

  /* ---- Screenshot thumbnail gallery ---- */
  .screenshot-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2, 8px);
    padding-top: var(--spacing-1, 4px);
  }

  .screenshot-thumb {
    position: relative;
    width: 72px;
    height: 54px;
    border-radius: var(--radius-sm, 4px);
    overflow: hidden;
    border: 1px solid var(--color-border, #333);
    flex-shrink: 0;
  }

  .screenshot-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-remove {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .screenshot-thumb:hover .thumb-remove {
    opacity: 1;
  }

  .student-name-label {
    margin: 0 0 0.4rem 0;
    font-size: 1rem;
    color: var(--color-text-primary);
  }
</style>
