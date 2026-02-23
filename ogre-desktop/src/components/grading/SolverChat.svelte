<script lang="ts">
  /**
   * SolverChat - Multi-turn chat UI for the Solver mode.
   * Sends messages to POST /api/chat (no rubric = solver mode) with SSE streaming.
   * Maintains conversation history client-side and formats it as context for the AI.
   */
  import { sendSolverMessage } from "../../lib/grading-api";
  import { buildSkillInjection } from "../../lib/skills-api";

  interface ChatMessage {
    role: "user" | "assistant";
    content: string;
  }

  let messages: ChatMessage[] = $state([
    { role: "assistant", content: "Hello! I can help you solve problems or answer questions. What are we working on?" },
  ]);
  let inputValue = $state("");
  let isLoading = $state(false);
  let errorText = $state("");
  let chatContainer: HTMLElement | undefined = $state(undefined);

  /** Format conversation history into a single prompt string for the AI. */
  function buildContextualPrompt(newMessage: string): string {
    // If this is the first real user message, send it directly
    const prior = messages.filter(m => !(m.role === "assistant" && m === messages[0]));
    if (prior.length === 0) return newMessage;

    // Build conversation transcript for context
    const transcript = prior
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    return `Previous conversation:\n${transcript}\n\nUser: ${newMessage}\n\nPlease continue the conversation naturally, taking into account everything discussed above.`;
  }

  /** Scroll chat to the bottom after new messages. */
  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    });
  }

  /** Send a message to the solver. */
  async function handleSend() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    errorText = "";
    inputValue = "";

    // Add user message
    messages = [...messages, { role: "user", content: text }];
    scrollToBottom();

    isLoading = true;

    // Placeholder for AI response
    let aiContent = "";

    try {
      const prompt = buildContextualPrompt(text);
      const skillInjection = await buildSkillInjection();
      await sendSolverMessage(
        { message: prompt, ...(skillInjection ? { systemPrompt: skillInjection } : {}) },
        {
          onStatus: () => {
            // AI is thinking — already shown via isLoading
          },
          onMessage: (data) => {
            aiContent = data.content;
          },
          onDone: () => {
            if (aiContent) {
              messages = [...messages, { role: "assistant", content: aiContent }];
              scrollToBottom();
            }
          },
          onError: (data) => {
            errorText = data.message || "Unknown error from AI provider";
          },
        },
      );

      // If onDone wasn't called but we have content, add it
      if (aiContent && messages[messages.length - 1]?.content !== aiContent) {
        messages = [...messages, { role: "assistant", content: aiContent }];
        scrollToBottom();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reach grading server";
      errorText = msg;
    } finally {
      isLoading = false;
      scrollToBottom();
    }
  }

  /** Send "Continue" to extend the conversation. */
  function handleContinue() {
    inputValue = "Please continue where you left off.";
    handleSend();
  }

  /** Clear conversation and reset to initial state. */
  function handleClear() {
    messages = [
      { role: "assistant", content: "Hello! I can help you solve problems or answer questions. What are we working on?" },
    ];
    inputValue = "";
    errorText = "";
    isLoading = false;
  }

  /** Handle Enter key (send) and Shift+Enter (newline). */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<section class="solver-chat">
  <div class="chat-header">
    <span class="chat-title">Solver Chat</span>
    <div class="chat-actions">
      <button
        class="btn-ghost small"
        onclick={handleContinue}
        disabled={isLoading || messages.length < 2}
        title="Continue the conversation"
      >
        Continue
      </button>
      <button
        class="btn-ghost small danger"
        onclick={handleClear}
        disabled={isLoading}
        title="Clear conversation"
      >
        Clear
      </button>
    </div>
  </div>

  <div class="chat-interface">
    <div class="chat-messages" bind:this={chatContainer}>
      {#each messages as msg}
        <div class="message {msg.role}">
          <div class="message-label">{msg.role === "user" ? "You" : "AI"}</div>
          <div class="message-content">{msg.content}</div>
        </div>
      {/each}

      {#if isLoading}
        <div class="message assistant loading">
          <div class="message-label">AI</div>
          <div class="message-content">
            <span class="thinking-dots">
              <span></span><span></span><span></span>
            </span>
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
        placeholder="Ask a question... (Enter to send, Shift+Enter for newline)"
        rows="3"
        bind:value={inputValue}
        onkeydown={handleKeydown}
        disabled={isLoading}
      ></textarea>
      <button
        class="btn-primary small"
        onclick={handleSend}
        disabled={isLoading || !inputValue.trim()}
      >
        {isLoading ? "Thinking..." : "Send"}
      </button>
    </div>
  </div>
</section>

<style>
  .solver-chat {
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
</style>
