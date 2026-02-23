<script lang="ts">
  /**
   * SkillCreator - AI chatbot that guides educators through creating a custom grading skill.
   * Uses sendSolverMessage with a system prompt to conduct a two-phase interview,
   * then generates a skill in markdown format that can be saved to SQLite.
   */
  import { SKILL_CREATION_PROMPT } from "../../lib/skill-creation-prompt";
  import { sendSolverMessage } from "../../lib/grading-api";
  import { parseSkillMarkdown } from "../../lib/skill-parser";
  import { saveSkill } from "../../lib/db";

  interface ChatMessage {
    role: "user" | "assistant";
    content: string;
  }

  let messages: ChatMessage[] = $state([
    {
      role: "assistant",
      content:
        'I\'ll help you create a custom grading skill for O.G.R.E. Let\'s start with a few questions.\n\nWhat subject or course is this skill for? (e.g., "AP Calculus", "5th Grade Writing", "Intro to Python")',
    },
  ]);
  let inputValue = $state("");
  let isLoading = $state(false);
  let errorText = $state("");
  let lastAssistantHasMarkdown = $state(false);
  let saveSuccess = $state("");
  let chatContainer: HTMLElement | undefined = $state(undefined);

  /** Format conversation history into a single prompt string for the AI. */
  function buildContextualPrompt(newMessage: string): string {
    // If this is the first real user message, send it directly
    const prior = messages.filter(
      (m) => !(m.role === "assistant" && m === messages[0]),
    );
    if (prior.length === 0) return newMessage;

    // Build conversation transcript for context
    const transcript = prior
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
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

  /** Check if a message contains a markdown code block. */
  function hasMarkdownBlock(content: string): boolean {
    return content.includes("```markdown") || content.includes("```\n---\n");
  }

  /** Send a message to the AI skill creator. */
  async function handleSend() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    errorText = "";
    saveSuccess = "";
    inputValue = "";
    lastAssistantHasMarkdown = false;

    // Add user message
    messages = [...messages, { role: "user", content: text }];
    scrollToBottom();

    isLoading = true;

    let aiContent = "";

    try {
      const prompt = buildContextualPrompt(text);
      await sendSolverMessage(
        { message: prompt, systemPrompt: SKILL_CREATION_PROMPT },
        {
          onStatus: () => {
            // AI is thinking — already shown via isLoading
          },
          onMessage: (data) => {
            aiContent = data.content;
          },
          onDone: () => {
            if (aiContent) {
              messages = [
                ...messages,
                { role: "assistant", content: aiContent },
              ];
              scrollToBottom();
              if (hasMarkdownBlock(aiContent)) {
                lastAssistantHasMarkdown = true;
              }
            }
          },
          onError: (data) => {
            errorText = data.message || "Unknown error from AI provider";
          },
        },
      );

      // If onDone wasn't called but we have content, add it
      if (
        aiContent &&
        messages[messages.length - 1]?.content !== aiContent
      ) {
        messages = [
          ...messages,
          { role: "assistant", content: aiContent },
        ];
        scrollToBottom();
        if (hasMarkdownBlock(aiContent)) {
          lastAssistantHasMarkdown = true;
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to reach grading server";
      errorText = msg;
    } finally {
      isLoading = false;
      scrollToBottom();
    }
  }

  /** Extract markdown content from the last assistant message and save as a skill. */
  async function saveSkillFromChat() {
    const lastMsg = messages.findLast(
      (m) => m.role === "assistant" && (m.content.includes("```markdown") || m.content.includes("```")),
    );
    if (!lastMsg) return;

    // Extract content between ```markdown and ``` (or ``` and ```)
    const markdownMatch = lastMsg.content.match(
      /```(?:markdown)?\n([\s\S]+?)```/,
    );
    if (!markdownMatch) return;

    const extracted = markdownMatch[1];

    try {
      const parsed = parseSkillMarkdown(extracted);
      const name = parsed.name || "Untitled Skill";

      await saveSkill({
        name,
        description: parsed.description || "",
        content: extracted,
        source: "created",
        source_id: null,
        is_active: 0,
      });

      // Success message
      messages = [
        ...messages,
        {
          role: "assistant",
          content: `\u2713 Skill "${name}" saved! Find it in My Skills.`,
        },
      ];
      lastAssistantHasMarkdown = false;
      saveSuccess = name;
      scrollToBottom();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save skill";
      errorText = msg;
    }
  }

  /** Reset the conversation to start creating a new skill. */
  function resetChat() {
    messages = [
      {
        role: "assistant",
        content:
          "Let's create another skill! What subject or course is this for?",
      },
    ];
    lastAssistantHasMarkdown = false;
    saveSuccess = "";
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

<section class="skill-creator">
  <div class="chat-header">
    <span class="chat-title">Skill Creator</span>
    <div class="chat-actions">
      <button
        class="btn-ghost small"
        onclick={resetChat}
        disabled={isLoading}
        title="Start a new conversation"
      >
        New Conversation
      </button>
    </div>
  </div>

  <div class="chat-interface">
    <div class="chat-messages" bind:this={chatContainer}>
      {#each messages as msg}
        <div class="message {msg.role}">
          <div class="message-label">
            {msg.role === "user" ? "You" : "AI"}
          </div>
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

      {#if lastAssistantHasMarkdown}
        <div class="save-skill-bar">
          <button class="btn-save-skill" onclick={saveSkillFromChat}>
            Save Skill
          </button>
          <span class="save-hint"
            >Save this skill to My Skills</span
          >
        </div>
      {/if}
    </div>

    <div class="chat-input-area">
      <textarea
        placeholder="Describe your skill needs... (Enter to send, Shift+Enter for newline)"
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
  .skill-creator {
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

  /* Save Skill bar */
  .save-skill-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background-color: var(--color-success-bg);
    border: 1px solid var(--color-success);
    border-radius: var(--radius-md);
    align-self: flex-start;
  }

  .btn-save-skill {
    background-color: var(--color-success);
    color: #fff;
    border: none;
    padding: 6px 16px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .btn-save-skill:hover {
    opacity: 0.9;
  }

  .save-hint {
    font-size: 0.78rem;
    color: var(--color-text-secondary);
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
    0%,
    80%,
    100% {
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
