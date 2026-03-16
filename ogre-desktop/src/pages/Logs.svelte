<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { listenServerLogs } from '../lib/server';

const MAX_LINES = 1000;
let logs: Array<{time: string, message: string, isError: boolean}> = [];
let autoScroll = true;
let container: HTMLElement;
let unlistenLogs: (() => void) | null = null;

onMount(async () => {
  unlistenLogs = await listenServerLogs((line: string) => {
    const isError = line.includes('[stderr]');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    logs = [...logs, { time, message: line, isError }];
    
    // Ring buffer: keep only last 1000 lines
    if (logs.length > MAX_LINES) {
      logs = logs.slice(logs.length - MAX_LINES);
    }
    
    // Auto-scroll to bottom if enabled
    if (autoScroll && container) {
      setTimeout(() => {
        if (container) container.scrollTop = container.scrollHeight;
      }, 0);
    }
  });
});

onDestroy(() => {
  if (unlistenLogs) unlistenLogs();
});

function clearLogs() {
  logs = [];
}

function handleScroll() {
  if (!container) return;
  const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
  // Disable auto-scroll if user scrolled up
  if (!isAtBottom) {
    autoScroll = false;
  }
}
</script>

<div class="log-viewer">
  <header>
    <h2>Server Logs</h2>
    <div class="controls">
      <label>
        <input type="checkbox" bind:checked={autoScroll} />
        Auto-scroll
      </label>
      <button on:click={clearLogs}>Clear</button>
    </div>
  </header>

  <pre 
    class="log-container" 
    bind:this={container} 
    on:scroll={handleScroll}
  >{#each logs as log}
<span class:error={log.isError}>[{log.time}] {log.message}</span>
{/each}</pre>
</div>

<style>
  .log-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    box-sizing: border-box;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--color-text-primary);
  }

  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    font-size: 0.9rem;
    color: var(--color-text-secondary);
  }

  .log-container {
    flex: 1;
    overflow-y: auto;
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    padding: 1rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    line-height: 1.4;
    border-radius: var(--radius-md);
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    border: 1px solid var(--color-border);
  }

  .error {
    color: var(--color-error);
  }

  button {
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: var(--color-primary-text);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 500;
  }

  button:hover {
    background: var(--color-primary-hover);
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }

  input[type="checkbox"] {
    cursor: pointer;
  }
</style>