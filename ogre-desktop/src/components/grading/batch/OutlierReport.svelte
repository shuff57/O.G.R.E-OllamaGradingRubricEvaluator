<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { BatchStudentResult } from '../../../lib/grading-api';

  let {
    entries = [] as BatchStudentResult[],
    maxScore = 10 as number,
    onDismiss = (() => {}) as () => void,
    onAccept = (async (_entry: BatchStudentResult) => {}) as (entry: BatchStudentResult) => void | Promise<void>,
    onRevert = (async (_entry: BatchStudentResult) => {}) as (entry: BatchStudentResult) => void | Promise<void>,
  } = $props();

  let errors = $state<Record<number, string>>({});
  let expanded = $state<Record<number, boolean>>({});
  let dismissed = $state<Record<number, boolean>>({});
  let busyIndex = $state<number | null>(null);

  let visible = $derived(entries.filter(e => !dismissed[e.studentIndex]));

  // Band display order — matches the `label` field stamped by the server's
  // pairwise sweep (see grading-server/grading.js buildPairwiseSweepPrompts).
  const BAND_ORDER = ['High', 'Upper-Mid', 'Lower-Mid', 'Low'];

  type BandGroup = { band: string; entries: BatchStudentResult[] };

  let grouped = $derived.by((): BandGroup[] => {
    const map = new Map<string, BatchStudentResult[]>();
    for (const e of visible) {
      const band = e.band ?? 'Other';
      if (!map.has(band)) map.set(band, []);
      map.get(band)!.push(e);
    }
    const result: BandGroup[] = [];
    // Known bands in display order first
    for (const band of BAND_ORDER) {
      if (map.has(band)) {
        result.push({ band, entries: map.get(band)! });
        map.delete(band);
      }
    }
    // Remaining (unknown bands or "Other") at the end
    for (const [band, bandEntries] of map) {
      result.push({ band, entries: bandEntries });
    }
    return result;
  });

  function toggleExpanded(idx: number) {
    expanded = { ...expanded, [idx]: !expanded[idx] };
  }

  function dismiss(idx: number) {
    dismissed = { ...dismissed, [idx]: true };
  }

  function clearError(idx: number) {
    if (errors[idx]) {
      const { [idx]: _, ...rest } = errors;
      errors = rest;
    }
  }

  async function accept(entry: BatchStudentResult) {
    if (busyIndex !== null) return;
    busyIndex = entry.studentIndex;
    clearError(entry.studentIndex);
    try {
      await onAccept(entry);
      dismiss(entry.studentIndex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors = { ...errors, [entry.studentIndex]: msg };
    } finally {
      busyIndex = null;
    }
  }

  async function revert(entry: BatchStudentResult) {
    if (busyIndex !== null) return;
    busyIndex = entry.studentIndex;
    clearError(entry.studentIndex);
    try {
      await onRevert(entry);
      dismiss(entry.studentIndex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors = { ...errors, [entry.studentIndex]: msg };
    } finally {
      busyIndex = null;
    }
  }

  function firstSentence(html: string): string {
    if (!html) return '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const m = text.match(/^.{0,180}?[.!?](?=\s|$)/);
    return m ? m[0] : text.slice(0, 180);
  }

  function formatDeviation(d: number | undefined): string {
    if (d == null || !isFinite(d)) return '';
    const sign = d > 0 ? '+' : '';
    return `${sign}${d.toFixed(1)}σ`;
  }

  function direction(orig: number | undefined, now: number): 'up' | 'down' | 'flat' {
    if (orig == null) return 'flat';
    if (now > orig) return 'up';
    if (now < orig) return 'down';
    return 'flat';
  }
</script>

{#if visible.length > 0}
  <section class="outlier-report" aria-label="Consistency review">
    <header>
      <h3>
        Consistency Review
        <span class="count">{visible.length} adjustment{visible.length === 1 ? '' : 's'}</span>
      </h3>
      <button class="dismiss" onclick={onDismiss} aria-label="Dismiss review">&#215;</button>
    </header>
    <p class="hint">
      The grader compared students within similar score bands and flagged these for review.
      Accept the new score+feedback, or revert to the original.
    </p>
    {#each grouped as group (group.band)}
      {#if grouped.length > 1}
        <div class="band-header">{group.band}</div>
      {/if}
      <ul class="entries">
        {#each group.entries as entry (entry.studentIndex)}
          {@const dir = direction(entry.originalScore, entry.score)}
          {@const isBusy = busyIndex === entry.studentIndex}
          <li
            class="entry"
            class:up={dir === 'up'}
            class:down={dir === 'down'}
            transition:slide={{ duration: 220 }}
          >
            <div class="row">
              <span class="name">{entry.name ?? `Student ${entry.studentIndex}`}</span>
              <span class="score-change">
                {#if entry.originalScore != null}
                  <span class="orig">{entry.originalScore}</span>
                  <span class="arrow">&rarr;</span>
                  <span class="now">{entry.score}</span>
                  <span class="max">/ {maxScore}</span>
                {:else}
                  <span class="now">{entry.score}</span>
                  <span class="max">/ {maxScore}</span>
                {/if}
              </span>
              {#if entry.deviation != null}
                <span class="deviation">{formatDeviation(entry.deviation)}</span>
              {/if}
              <span class="actions">
                <button
                  class="btn accept"
                  type="button"
                  onclick={() => accept(entry)}
                  disabled={isBusy}
                >Accept</button>
                <button
                  class="btn revert"
                  type="button"
                  onclick={() => revert(entry)}
                  disabled={isBusy}
                >{isBusy ? 'Working...' : 'Revert'}</button>
              </span>
            </div>
            {#if entry.feedback || entry.originalFeedback}
              {@const isOpen = !!expanded[entry.studentIndex]}
              <div class="diff-block">
                <button
                  class="compare-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  onclick={() => toggleExpanded(entry.studentIndex)}
                >
                  <span class="caret" class:open={isOpen}>&#9658;</span>
                  {isOpen ? 'Hide comparison' : 'Compare feedback'}
                </button>
                {#if !isOpen && entry.reason}
                  <p class="reason">{entry.reason}</p>
                {:else if !isOpen && entry.feedback}
                  <p class="reason">{firstSentence(entry.feedback)}</p>
                {/if}
                {#if isOpen}
                  <div class="diff-grid">
                    <div class="diff-pane original">
                      <div class="diff-head">
                        <span class="diff-label">Original</span>
                        {#if entry.originalScore != null}
                          <span class="diff-score">{entry.originalScore} / {maxScore}</span>
                        {/if}
                      </div>
                      <div class="diff-body">
                        {#if entry.originalFeedback}
                          {@html entry.originalFeedback}
                        {:else}
                          <em class="diff-empty">(no original feedback captured)</em>
                        {/if}
                      </div>
                    </div>
                    <div class="diff-pane regraded">
                      <div class="diff-head">
                        <span class="diff-label">Suggested</span>
                        <span class="diff-score">{entry.score} / {maxScore}</span>
                      </div>
                      <div class="diff-body">
                        {#if entry.feedback}
                          {@html entry.feedback}
                        {:else}
                          <em class="diff-empty">(no feedback)</em>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
            {#if errors[entry.studentIndex]}
              <p class="error" role="alert">{errors[entry.studentIndex]}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/each}
  </section>
{/if}

<style>
  .outlier-report {
    border: 1px solid var(--color-warning, #f59e0b);
    background: var(--color-warning-bg, rgba(245, 158, 11, 0.08));
    border-radius: var(--radius-md, 8px);
    padding: 12px 14px;
    margin: 12px 0;
    font-family: var(--font-body);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  h3 {
    font-size: 0.95rem;
    margin: 0;
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-weight: normal;
  }
  .dismiss {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .dismiss:hover {
    color: var(--color-text);
  }
  .hint {
    font-size: 0.78rem;
    color: var(--color-text-secondary);
    margin: 0 0 10px 0;
  }
  .band-header {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-secondary);
    margin: 10px 0 4px 0;
    padding: 0 2px;
    border-bottom: 1px solid var(--color-border);
  }
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .entry {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-text-subtle);
    border-radius: var(--radius-sm, 4px);
    padding: 8px 10px;
    transition: opacity 120ms ease, border-color 120ms ease;
  }
  .entry.up {
    border-left-color: var(--color-success, #22c55e);
  }
  .entry.down {
    border-left-color: var(--color-warning, #f59e0b);
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .name {
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .score-change {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
  }
  .orig {
    color: var(--color-text-secondary);
    text-decoration: line-through;
  }
  .arrow {
    color: var(--color-text-subtle);
  }
  .now {
    font-weight: 600;
    color: var(--color-text);
  }
  .max {
    color: var(--color-text-secondary);
  }
  .deviation {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--color-text-secondary);
    background: var(--color-bg-sidebar);
    padding: 1px 6px;
    border-radius: 10px;
  }
  .actions {
    margin-left: auto;
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .btn {
    font-size: 0.75rem;
    padding: 3px 10px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    font-family: var(--font-body);
  }
  .btn:hover:not(:disabled) {
    background: var(--color-bg-sidebar);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn.accept {
    border-color: var(--color-success, #22c55e);
    color: var(--color-success, #22c55e);
  }
  .btn.accept:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.08);
  }
  .btn.revert {
    border-color: var(--color-warning, #f59e0b);
    color: var(--color-warning, #f59e0b);
  }
  .btn.revert:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.08);
  }
  .reason {
    margin: 6px 0 0 0;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
  .diff-block {
    margin-top: 6px;
  }
  .compare-toggle {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 2px 0;
    font-family: var(--font-body);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .compare-toggle:hover {
    color: var(--color-text);
  }
  .caret {
    display: inline-block;
    transition: transform 120ms ease;
    font-size: 0.7rem;
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .diff-grid {
    margin-top: 6px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  @media (max-width: 720px) {
    .diff-grid {
      grid-template-columns: 1fr;
    }
  }
  .diff-pane {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg-sidebar);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .diff-pane.original {
    border-left: 2px solid var(--color-text-subtle);
  }
  .diff-pane.regraded {
    border-left: 2px solid var(--color-success, #22c55e);
  }
  .diff-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.7rem;
  }
  .diff-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-secondary);
  }
  .diff-score {
    font-family: var(--font-mono);
    color: var(--color-text);
  }
  .diff-body {
    padding: 6px 10px;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--color-text);
    max-height: 340px;
    overflow-y: auto;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .diff-body :global(p) {
    margin: 0 0 6px 0;
  }
  .diff-body :global(p:last-child) {
    margin-bottom: 0;
  }
  .diff-body :global(strong) {
    color: var(--color-text);
  }
  .diff-body :global(blockquote) {
    margin: 4px 0;
    padding: 2px 8px;
    border-left: 2px solid var(--color-text-subtle);
    color: var(--color-text-secondary);
    font-style: normal;
  }
  .diff-body :global(em) {
    color: var(--color-text-secondary);
  }
  .diff-empty {
    color: var(--color-text-subtle);
    font-size: 0.78rem;
  }
  .error {
    margin: 6px 0 0 0;
    font-size: 0.78rem;
    color: var(--color-error, #ef4444);
    background: rgba(239, 68, 68, 0.08);
    border-left: 2px solid var(--color-error, #ef4444);
    padding: 4px 8px;
    border-radius: var(--radius-sm, 4px);
  }
</style>
