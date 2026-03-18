<script lang="ts">
  import type { TrainingSession } from '../../lib/training-session';
  import { canSaveTraining } from '../../lib/training-session';

  let {
    session = $bindable(),
    onSendMessage = () => Promise.resolve(),
    onSaveTraining = () => Promise.resolve(),
  } = $props<{
    session: TrainingSession;
    onSendMessage?: (text: string) => Promise<void>;
    onSaveTraining?: () => Promise<void>;
  }>();

  let inputText = $state('');
  let isSending = $state(false);

  const PHASE_LABELS: Record<string, string> = {
    idle:         'Ready',
    perception:   'Perceiving',
    dialogue:     'Dialogue',
    test:         'Testing',
    synthesizing: 'Synthesizing',
    saved:        'Saved ✓',
    error:        'Error',
  };

  const PHASE_ORDER = ['idle', 'perception', 'dialogue', 'test', 'synthesizing', 'saved'];

  function phaseIndex(p: string): number {
    const idx = PHASE_ORDER.indexOf(p);
    return idx === -1 ? 0 : idx;
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isSending) return;
    inputText = '';
    isSending = true;
    try {
      await onSendMessage(text);
    } finally {
      isSending = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="training-ui">
  <!-- Phase progress bar -->
  <div class="phase-bar">
    {#each PHASE_ORDER as p}
      {#if p !== 'error'}
        <div class="phase-step {p === session.phase ? 'active' : phaseIndex(p) < phaseIndex(session.phase) ? 'done' : ''}">
          {PHASE_LABELS[p] ?? p}
        </div>
      {/if}
    {/each}
  </div>

  {#if session.phase === 'error' && session.error}
    <div class="error-banner">⚠️ {session.error}</div>
  {/if}

  <!-- Message thread -->
  <div class="messages-list">
    {#if session.messages.length === 0}
      {#if session.phase === 'idle'}
        <p class="placeholder">
          🧠 <strong>Agent Training</strong> — calibrate how the AI interacts with this page.<br>
          Click <strong>Start Training</strong> to begin.
        </p>
      {:else}
        <p class="placeholder">Waiting for agent response…</p>
      {/if}
    {:else}
      {#each session.messages as msg}
        <div class="msg {msg.role}">
          <div class="msg-label">{msg.role === 'user' ? 'You' : 'Agent'}</div>
          <div class="msg-body">{msg.content}</div>
        </div>
      {/each}
    {/if}

    {#if session.phase === 'synthesizing'}
      <div class="msg assistant">
        <div class="msg-label">Agent</div>
        <div class="msg-body">
          <span class="thinking-dots"><span></span><span></span><span></span></span>
          Synthesizing corrections…
        </div>
      </div>
    {/if}

    {#if session.phase === 'saved'}
      <div class="saved-banner">
        ✅ Training saved! Future AI sessions on this page will inherit these corrections.
        {#if session.pendingCorrections.length > 0}
          <span class="correction-count">{session.pendingCorrections.length} correction{session.pendingCorrections.length !== 1 ? 's' : ''} stored.</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Input row — hidden when synthesizing or saved -->
  {#if session.phase !== 'synthesizing' && session.phase !== 'saved'}
    <div class="input-row">
      <textarea
        rows="2"
        placeholder={session.phase === 'idle' ? 'Press Start Training above, or type here to begin…' : 'Reply to the agent…'}
        bind:value={inputText}
        onkeydown={handleKeydown}
        disabled={isSending}
      ></textarea>
      <button class="btn-send" onclick={handleSend} disabled={!inputText.trim() || isSending}>
        {isSending ? '…' : '↑'}
      </button>
    </div>
  {/if}

  <!-- Save button -->
  {#if canSaveTraining(session) && session.phase !== 'synthesizing' && session.phase !== 'saved'}
    <button class="btn-save" onclick={onSaveTraining} disabled={session.phase === 'synthesizing'}>
      💾 Save Training
    </button>
  {/if}
</div>

<style>
  .training-ui {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  /* Phase bar */
  .phase-bar {
    display: flex;
    gap: 2px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
    padding: 3px;
    overflow: hidden;
  }

  .phase-step {
    flex: 1;
    text-align: center;
    font-size: 0.68rem;
    padding: 3px 2px;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .phase-step.done {
    opacity: 0.65;
    color: var(--color-text-secondary);
  }

  .phase-step.active {
    background: var(--color-primary);
    color: white;
    opacity: 1;
    font-weight: 600;
  }

  /* Messages */
  .messages-list {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--color-bg-secondary);
    padding: 8px;
    border-radius: var(--radius-sm);
    scroll-behavior: smooth;
  }

  .placeholder {
    color: var(--color-text-secondary);
    font-size: 0.82rem;
    margin: 0;
    font-style: italic;
    padding: 6px 4px;
    line-height: 1.5;
  }

  .msg {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 90%;
  }

  .msg.user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .msg.assistant {
    align-self: flex-start;
    align-items: flex-start;
  }

  .msg-label {
    font-size: 0.68rem;
    color: var(--color-text-secondary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .msg-body {
    padding: 6px 10px;
    border-radius: 12px;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.45;
  }

  .msg.user .msg-body {
    background: var(--color-primary);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .msg.assistant .msg-body {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-bottom-left-radius: 4px;
  }

  /* Thinking dots */
  .thinking-dots {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    margin-right: 6px;
  }

  .thinking-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    animation: blink 1.2s infinite;
  }

  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes blink {
    0%, 80%, 100% { opacity: 0.2; }
    40% { opacity: 1; }
  }

  /* Saved banner */
  .saved-banner {
    padding: 8px 10px;
    background: #dcfce7;
    border: 1px solid #86efac;
    border-radius: var(--radius-sm);
    color: #166534;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .correction-count {
    font-weight: 600;
    margin-left: 4px;
  }

  /* Error */
  .error-banner {
    padding: 6px 10px;
    background: #fee2e2;
    border: 1px solid #fca5a5;
    border-radius: var(--radius-sm);
    color: #991b1b;
    font-size: 0.82rem;
  }

  /* Input row */
  .input-row {
    display: flex;
    gap: 4px;
    align-items: flex-end;
  }

  .input-row textarea {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    resize: none;
    font-size: 0.85rem;
    font-family: inherit;
    background: var(--color-bg-main);
    color: var(--color-text-primary);
    line-height: 1.4;
  }

  .input-row textarea:disabled {
    opacity: 0.6;
  }

  .btn-send {
    padding: 8px 12px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    min-width: 36px;
  }

  .btn-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-send:not(:disabled):hover {
    opacity: 0.9;
  }

  /* Save button */
  .btn-save {
    width: 100%;
    padding: var(--spacing-2) var(--spacing-3);
    background: #16a34a;
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-save:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
