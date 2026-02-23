<script lang="ts">
  /**
   * AgentChat - Browser agent chat UI with review/auto modes.
   * Controls the browser agent loop with action proposals and approvals.
   */
  import { createAgentController } from '../../lib/agent-loop';
  import type { AgentEvent, AgentController } from '../../lib/agent-loop';
  import type { AgentMode, AgentState } from '../../lib/agent-types';
  import ProviderSelector from './ProviderSelector.svelte';

  // ============================================================================
  // Message Types
  // ============================================================================

  interface TextMessage {
    type: 'text';
    role: 'user' | 'assistant';
    content: string;
  }

  interface ActionMessage {
    type: 'action';
    action: string;
    params: Record<string, unknown>;
    reasoning: string;
    status: 'proposing' | 'executing' | 'done' | 'skipped';
    result?: { success: boolean; error?: string };
  }

  interface SystemMessage {
    type: 'system';
    content: string;
    variant: 'info' | 'error' | 'done';
  }

  type DisplayMessage = TextMessage | ActionMessage | SystemMessage;

  interface PendingAction {
    action: string;
    params: Record<string, unknown>;
    reasoning: string;
  }

  // ============================================================================
  // State (Svelte 5 runes)
  // ============================================================================

  let mode: AgentMode = $state('review');
  let agentState: AgentState = $state('idle');
  let activeProvider: string = $state('');
  let activeModel: string = $state('');
  let compactMode: boolean = $state(true);
  let messages: DisplayMessage[] = $state([
    { type: 'text', role: 'assistant', content: 'Hello! I can control the browser for you. Describe what you want me to do.' }
  ]);
  let inputValue: string = $state('');
  let errorText: string = $state('');
  let pendingAction: PendingAction | null = $state(null);
  let chatContainer: HTMLElement | undefined = $state(undefined);
  let controller: AgentController = $state(createAgentController());

  // ============================================================================
  // Helpers
  // ============================================================================

  /** Extract a short target label from action params for compact badge display. */
  function getBadgeTarget(action: string, params: Record<string, unknown>): string {
    if (typeof params.selector === 'string' && params.selector) return params.selector;
    if (typeof params.url === 'string' && params.url) {
      // Trim long URLs
      const url = params.url as string;
      return url.length > 40 ? url.slice(0, 37) + '…' : url;
    }
    if (typeof params.text === 'string' && params.text) {
      const t = params.text as string;
      return t.length > 30 ? t.slice(0, 27) + '…' : t;
    }
    return '';
  }

  /** Build the one-line compact badge label for an action message. */
  function getBadgeLabel(msg: ActionMessage): string {
    const target = getBadgeTarget(msg.action, msg.params);
    const base = target ? `[${msg.action}] ${target}` : `[${msg.action}]`;
    if (msg.status === 'done') {
      return msg.result?.success
        ? `${base} → ✓`
        : `${base} → ✗ ${msg.result?.error ?? 'failed'}`;
    }
    if (msg.status === 'executing') return `${base} → …`;
    if (msg.status === 'skipped') return `${base} → skipped`;
    // proposing
    return base;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /** Handle events from the agent loop. */
  function handleEvent(event: AgentEvent) {
    switch (event.type) {
      case 'thinking':
        agentState = 'thinking';
        break;

      case 'propose':
        agentState = 'proposing';
        messages = [...messages, {
          type: 'action',
          action: event.action,
          params: event.params,
          reasoning: event.reasoning,
          status: 'proposing',
        }];
        pendingAction = { action: event.action, params: event.params, reasoning: event.reasoning };
        // In auto mode (and not runJS), auto-approve after short render delay
        if (mode === 'auto' && event.action !== 'runJS') {
          setTimeout(() => { controller.approve(); }, 300);
        }
        break;

      case 'executing':
        agentState = 'executing';
        // Update the last action message to 'executing'
        messages = messages.map((m, i) =>
          i === messages.length - 1 && m.type === 'action'
            ? { ...m, status: 'executing' as const }
            : m
        );
        pendingAction = null;
        break;

      case 'result':
        // Update the last action message with the result
        messages = messages.map((m, i) =>
          i === messages.length - 1 && m.type === 'action'
            ? { ...m, status: 'done' as const, result: event.result }
            : m
        );
        break;

      case 'text':
        agentState = 'idle';
        messages = [...messages, { type: 'text', role: 'assistant', content: event.content }];
        break;

      case 'done':
        agentState = 'idle';
        messages = [...messages, { type: 'system', content: event.message, variant: 'done' }];
        pendingAction = null;
        break;

      case 'error':
        agentState = 'idle';
        errorText = event.message;
        pendingAction = null;
        break;
    }
  }

  /** Scroll chat to the bottom after new messages. */
  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    });
  }

  /** Send a message and start the agent loop. */
  async function handleSend() {
    const text = inputValue.trim();
    if (!text || agentState !== 'idle') return;

    inputValue = '';
    errorText = '';
    messages = [...messages, { type: 'text', role: 'user', content: text }];
    agentState = 'thinking';
    scrollToBottom();

    const gen = controller.start({ mode, initialMessage: text, provider: activeProvider, model: activeModel, compact: compactMode });

    for await (const event of gen) {
      handleEvent(event);
      scrollToBottom();
    }

    agentState = 'idle';
  }

  /** Approve the current proposed action. */
  function handleApprove() {
    controller.approve();
    // Update the last proposing action to executing state
    messages = messages.map((m, i) =>
      i === messages.length - 1 && m.type === 'action' && m.status === 'proposing'
        ? { ...m, status: 'executing' as const }
        : m
    );
    pendingAction = null;
  }

  /** Skip the current proposed action. */
  function handleSkip() {
    controller.skip();
    // Update the last proposing action to skipped state
    messages = messages.map((m, i) =>
      i === messages.length - 1 && m.type === 'action' && m.status === 'proposing'
        ? { ...m, status: 'skipped' as const }
        : m
    );
    pendingAction = null;
  }

  /** Stop the agent loop. */
  function handleStop() {
    controller.stop();
    agentState = 'idle';
    pendingAction = null;
  }

  /** Clear conversation and reset to initial state. */
  function handleClear() {
    controller.stop();
    messages = [{ type: 'text', role: 'assistant', content: 'Hello! I can control the browser for you. Describe what you want me to do.' }];
    inputValue = '';
    errorText = '';
    agentState = 'idle';
    pendingAction = null;
    controller = createAgentController(); // fresh controller
  }

  /** Handle Enter key (send) and Shift+Enter (newline). */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<section class="agent-chat">
  <ProviderSelector
    bind:provider={activeProvider}
    bind:model={activeModel}
    disabled={agentState !== 'idle'}
  />

  <div class="chat-header">
    <span class="chat-title">Agent</span>
    <div class="chat-actions">
      <!-- Mode toggle -->
      <div class="mode-toggle">
        <button
          class="mode-btn {mode === 'review' ? 'active' : ''}"
          onclick={() => mode = 'review'}
          disabled={agentState !== 'idle'}
        >
          Review
        </button>
        <button
          class="mode-btn {mode === 'auto' ? 'active' : ''}"
          onclick={() => mode = 'auto'}
          disabled={agentState !== 'idle'}
        >
          Auto
        </button>
      </div>
      <!-- Compact mode toggle -->
      <button
        class="mode-btn compact-toggle {compactMode ? 'active' : ''}"
        onclick={() => compactMode = !compactMode}
        title={compactMode ? 'Switch to verbose mode' : 'Switch to compact mode'}
      >
        {compactMode ? 'Compact' : 'Verbose'}
      </button>
      <button
        class="btn-ghost small danger"
        onclick={handleStop}
        disabled={agentState === 'idle'}
        title="Stop agent"
      >
        Stop
      </button>
      <button
        class="btn-ghost small danger"
        onclick={handleClear}
        disabled={agentState !== 'idle'}
        title="Clear conversation"
      >
        Clear
      </button>
    </div>
  </div>

  <div class="chat-interface">
    <div class="chat-messages" bind:this={chatContainer}>
      {#each messages as msg}
        {#if msg.type === 'text'}
          <div class="message {msg.role}">
            <div class="message-label">{msg.role === 'user' ? 'You' : 'Agent'}</div>
            <div class="message-content">{msg.content}</div>
          </div>
        {:else if msg.type === 'action'}
          {#if compactMode}
            <!-- Compact badge: single-line action status -->
            <div class="compact-badge {msg.status === 'done' ? (msg.result?.success ? 'badge-success' : 'badge-failure') : msg.status === 'executing' ? 'badge-executing' : msg.status === 'proposing' ? 'badge-proposing' : 'badge-skipped'}">
              <span class="badge-text">{getBadgeLabel(msg)}</span>
              {#if msg.status === 'proposing' && pendingAction}
                <div class="action-buttons">
                  <button class="btn-approve" onclick={handleApprove}>✓ Approve</button>
                  <button class="btn-skip" onclick={handleSkip}>✗ Skip</button>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Verbose mode: full action card -->
            <div class="message action {msg.status}">
              <div class="message-label">Action: {msg.action}</div>
              <div class="message-content">
                <div class="action-reasoning">{msg.reasoning}</div>
                {#if msg.status === 'proposing' && pendingAction}
                  <div class="action-buttons">
                    <button class="btn-approve" onclick={handleApprove}>✓ Approve</button>
                    <button class="btn-skip" onclick={handleSkip}>✗ Skip</button>
                  </div>
                {:else if msg.status === 'executing'}
                  <div class="action-status executing">Executing...</div>
                {:else if msg.status === 'done'}
                  <div class="action-status {msg.result?.success ? 'success' : 'failed'}">
                    {msg.result?.success ? '✓ Done' : '✗ Failed: ' + (msg.result?.error ?? '')}
                  </div>
                {:else if msg.status === 'skipped'}
                  <div class="action-status skipped">Skipped</div>
                {/if}
              </div>
            </div>
          {/if}
        {:else if msg.type === 'system'}
          <div class="message system {msg.variant}">
            <div class="message-content">{msg.content}</div>
          </div>
        {/if}
      {/each}

      {#if agentState === 'thinking' && !compactMode}
        <div class="message assistant loading">
          <div class="message-label">Agent</div>
          <div class="message-content">
            <span class="thinking-dots"><span></span><span></span><span></span></span>
          </div>
        </div>
      {/if}

      {#if errorText}
        <div class="message error-msg">
          <div class="message-content">{errorText}</div>
        </div>
      {/if}
    </div>

    <div class="chat-input-area">
      <textarea
        placeholder="Describe what you want the agent to do... (Enter to send)"
        rows="3"
        bind:value={inputValue}
        onkeydown={handleKeydown}
        disabled={agentState !== 'idle'}
      ></textarea>
      <button
        class="btn-primary small"
        onclick={handleSend}
        disabled={agentState !== 'idle' || !inputValue.trim()}
      >
        {agentState !== 'idle' ? 'Running...' : 'Send'}
      </button>
    </div>
  </div>
</section>

<style>
  .agent-chat {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    flex: 1;
    min-height: 0;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-1);
  }

  .chat-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .chat-actions {
    display: flex;
    gap: var(--spacing-1);
    align-items: center;
  }

  .btn-ghost {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-ghost:hover:not(:disabled) {
    background-color: var(--color-bg-card);
    color: var(--color-text-primary);
    border-color: var(--color-text-secondary);
  }

  .btn-ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-ghost.danger:hover:not(:disabled) {
    border-color: var(--color-error, #e74c3c);
    color: var(--color-error, #e74c3c);
  }

  .chat-interface {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-main);
    overflow: hidden;
  }

  .chat-messages {
    flex: 1;
    padding: var(--spacing-3);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    min-height: 0;
  }

  /* Message bubbles */
  .message {
    max-width: 85%;
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-md);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .message.user {
    align-self: flex-end;
    background-color: var(--color-primary, #3b82f6);
    color: #fff;
    border-bottom-right-radius: 4px;
  }

  .message.user .message-label {
    color: rgba(255, 255, 255, 0.7);
  }

  .message.assistant {
    align-self: flex-start;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-bottom-left-radius: 4px;
  }

  .message.error-msg {
    align-self: center;
    background-color: rgba(231, 76, 60, 0.1);
    border: 1px solid var(--color-error, #e74c3c);
    color: var(--color-error, #e74c3c);
    max-width: 95%;
    font-size: 0.85rem;
  }

  .message-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 2px;
    color: var(--color-text-secondary);
  }

  .message-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Thinking dots animation */
  .thinking-dots {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    height: 1.2em;
  }

  .thinking-dots span {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--color-text-secondary);
    animation: dot-bounce 1.2s ease-in-out infinite;
  }

  .thinking-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .thinking-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes dot-bounce {
    0%, 80%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Input area */
  .chat-input-area {
    padding: var(--spacing-2);
    border-top: 1px solid var(--color-border);
    background-color: var(--color-bg-sidebar);
    display: flex;
    gap: var(--spacing-2);
    flex-direction: column;
  }

  textarea {
    width: 100%;
    min-height: 60px;
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

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    align-self: flex-end;
    padding: 6px 16px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background-color: var(--color-primary, #3b82f6);
    color: #fff;
    transition: opacity 0.15s ease;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Mode toggle */
  .mode-toggle {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .mode-btn {
    padding: 3px 10px;
    font-size: 0.78rem;
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn.active {
    background: var(--color-primary, #3b82f6);
    color: #fff;
  }

  .mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Compact mode toggle button */
  .compact-toggle {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-size: 0.78rem;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .compact-toggle.active {
    background: var(--color-primary, #3b82f6);
    color: #fff;
    border-color: var(--color-primary, #3b82f6);
  }

  /* ── Compact action badges ── */
  .compact-badge {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--color-border);
    background-color: var(--color-bg-sidebar);
    font-size: 0.82rem;
    font-family: var(--font-mono, monospace);
    align-self: stretch;
  }

  .compact-badge .badge-text {
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .compact-badge.badge-proposing {
    border-left-color: #f59e0b;
  }

  .compact-badge.badge-executing {
    border-left-color: var(--color-primary, #3b82f6);
    opacity: 0.8;
  }

  .compact-badge.badge-success {
    border-left-color: #22c55e;
  }

  .compact-badge.badge-failure {
    border-left-color: var(--color-error, #e74c3c);
  }

  .compact-badge.badge-skipped {
    border-left-color: var(--color-text-secondary);
    opacity: 0.6;
  }

  /* Action messages (verbose mode) */
  .message.action {
    align-self: stretch;
    background-color: var(--color-bg-sidebar);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-primary, #3b82f6);
    max-width: 100%;
  }

  .message.action.proposing {
    border-left-color: #f59e0b; /* amber — awaiting approval */
  }

  .message.action.executing {
    border-left-color: var(--color-primary, #3b82f6);
  }

  .message.action.done {
    border-left-color: #22c55e; /* green — success */
  }

  .message.action.failed {
    border-left-color: var(--color-error, #e74c3c);
  }

  .message.action.skipped {
    border-left-color: var(--color-text-secondary);
    opacity: 0.6;
  }

  .action-reasoning {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-1);
    font-style: italic;
  }

  .action-buttons {
    display: flex;
    gap: var(--spacing-1);
    margin-top: var(--spacing-1);
  }

  .btn-approve {
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid #22c55e;
    background: transparent;
    color: #22c55e;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-approve:hover {
    background: rgba(34, 197, 94, 0.1);
  }

  .btn-skip {
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-error, #e74c3c);
    background: transparent;
    color: var(--color-error, #e74c3c);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-skip:hover {
    background: rgba(231, 76, 60, 0.1);
  }

  .action-status {
    font-size: 0.8rem;
    margin-top: 4px;
  }

  .action-status.executing {
    color: var(--color-primary, #3b82f6);
  }

  .action-status.success {
    color: #22c55e;
  }

  .action-status.failed {
    color: var(--color-error, #e74c3c);
  }

  .action-status.skipped {
    color: var(--color-text-secondary);
  }

  /* System messages */
  .message.system {
    align-self: center;
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
    max-width: 90%;
    padding: 6px 12px;
    border: 1px solid;
  }

  .message.system.done {
    background: rgba(34, 197, 94, 0.08);
    border-color: #22c55e;
    color: #22c55e;
  }

  .message.system.info {
    background: rgba(59, 130, 246, 0.08);
    border-color: var(--color-primary, #3b82f6);
    color: var(--color-primary, #3b82f6);
  }

  .message.system.error {
    background: rgba(231, 76, 60, 0.08);
    border-color: var(--color-error, #e74c3c);
    color: var(--color-error, #e74c3c);
  }
</style>
