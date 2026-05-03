<script lang="ts">
  import type { BatchStudentResult } from '../../../lib/grading-api';

  let {
    entries = [] as BatchStudentResult[],
    maxScore = 10 as number,
    onDismiss = (() => {}) as () => void,
  } = $props();

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

{#if entries.length > 0}
  <section class="outlier-report" aria-label="Outlier corrections review">
    <header>
      <h3>
        Outlier Review
        <span class="count">{entries.length} adjustment{entries.length === 1 ? '' : 's'}</span>
      </h3>
      <button class="dismiss" onclick={onDismiss} aria-label="Dismiss outlier review">×</button>
    </header>
    <p class="hint">
      The grader flagged these scores as statistical outliers (≥2σ from the batch mean) and re-graded them.
      Review the corrections below.
    </p>
    <ul class="entries">
      {#each entries as entry (entry.studentIndex)}
        {@const dir = direction(entry.originalScore, entry.score)}
        <li class="entry" class:up={dir === 'up'} class:down={dir === 'down'}>
          <div class="row">
            <span class="name">{entry.name ?? `Student ${entry.studentIndex}`}</span>
            <span class="score-change">
              {#if entry.originalScore != null}
                <span class="orig">{entry.originalScore}</span>
                <span class="arrow">→</span>
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
          </div>
          {#if entry.feedback}
            <p class="reason">{firstSentence(entry.feedback)}</p>
          {/if}
        </li>
      {/each}
    </ul>
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
  .reason {
    margin: 6px 0 0 0;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
</style>
