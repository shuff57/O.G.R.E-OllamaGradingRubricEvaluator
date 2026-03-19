# Agent Training Feature — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub "Chat" mode on the Discover tab with a fully functional "Train" mode where the agent calibrates itself on any grading page through a multi-turn conversation, then saves learned corrections to SQLite so all future AI sessions inherit them automatically.

**Architecture:** Training happens in a new `TrainingSession` state machine (separate from the existing ephemeral `ChatDiscoveryState`). Each session has 5 phases: Perception → Dialogue → Test → Synthesize → Save. Corrections are stored in two new DB columns (`learned_corrections` on `skills`, `training_notes` on `skills`) and injected into every agent system prompt via the existing `buildSiteContextInjection()` pipeline.

**Tech Stack:** Svelte 5 (runes), TypeScript, SQLite (tauri-plugin-sql), Rust Tauri migrations, Tauri HTTP fetch, existing grading-server `/api/chat` endpoint.

**Expected commit count:** 12 commits (used by Final Verification Wave F4 agent)

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `ogre-desktop/src/lib/training-session.ts` | `TrainingSession` state type, phase enum, system prompt, `createTrainingSession()`, `advanceTraining()` orchestrator |
| `ogre-desktop/src/lib/training-synthesizer.ts` | `synthesizeTraining()` — converts conversation → `LearnedCorrection[]` + gotcha bullets via AI call |

### Modified files
| File | What changes |
|------|-------------|
| `ogre-desktop/src/lib/site-guide-types.ts` | Add `learned_corrections?: LearnedCorrection[]` to `SiteGuideJSON`; update `formatSiteGuideForAgent()` to render them |
| `ogre-desktop/src/lib/db.ts` | Add `learned_corrections TEXT` field to `Skill` interface; add `saveLearnedCorrections()` + `getLearnedCorrections()` helpers |
| `ogre-desktop/src-tauri/src/lib.rs` | Migration 12: `ALTER TABLE skills ADD COLUMN learned_corrections TEXT` |
| `ogre-desktop/src/lib/skills-api.ts` | Update `buildSiteContextInjection()` to append learned corrections block when present |
| `ogre-desktop/src/lib/discovery-intent.ts` | Rename `IntentMode 'chat'` → `'train'`; no other logic changes |
| `ogre-desktop/src/components/grading/DiscoveryModeSelector.svelte` | Line 17–21: `'chat'` → `'train'`, `💬 Chat` → `🧠 Train` |
| `ogre-desktop/src/components/grading/DiscoveryChat.svelte` | Full rebuild into `TrainingChat.svelte`-equivalent — shows phases, "Save Training" button, structured perception display |
| `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` | Wire `handleChatSubmit()` (line 219–226) to real training AI call; add post-discovery training prompt; rename all `chat` references to `train` |
| `ogre-desktop/src/components/grading/AgentChat.svelte` | Add "Train this page?" button when `maxSameAction` loop fires (type: `'done'` event with loop message) |

> **Constraint:** Server-side JS changes must be applied to BOTH `grading-server/` AND `ogre-desktop/src-tauri/binaries/server-bundle/`. No server-side changes are needed for this feature — training uses the existing `/api/chat` endpoint.

---

## Chunk 1: Data Layer

### Task 1: Add `LearnedCorrection` type + `learned_corrections` column to DB

**Files:**
- Modify: `ogre-desktop/src/lib/site-guide-types.ts`
- Modify: `ogre-desktop/src/lib/db.ts`
- Modify: `ogre-desktop/src-tauri/src/lib.rs`

- [ ] **Step 1.1: Define `LearnedCorrection` interface in `site-guide-types.ts`**

  Add after the existing `SiteGuideJSON` interface (after line 24):

  ```typescript
  /**
   * A single learned correction from an Agent Training session.
   * Stored as JSON array in the `learned_corrections` column on the skills table.
   */
  export interface LearnedCorrection {
    /** The browser action this corrects: "click", "type", "scroll", "navigate" */
    action: string;
    /** Human description of what the agent was trying to target */
    target: string;
    /** The confirmed working CSS selector */
    correct_selector: string;
    /** Optional: parent/ancestor scope hint (e.g. "scope to div[data-lastchange] row") */
    scope_hint?: string;
    /** Free-text notes from the training conversation */
    notes?: string;
    /** ISO 8601 datetime when this correction was saved */
    timestamp: string;
  }
  ```

- [ ] **Step 1.2: Add `learned_corrections` to `SiteGuideJSON`**

  In `site-guide-types.ts`, add to the `SiteGuideJSON` interface after `gotchas: string[]`:

  ```typescript
  /** Structured corrections learned during Agent Training sessions. Optional — not present on bundled profiles. */
  learned_corrections?: LearnedCorrection[];
  ```

- [ ] **Step 1.3: Update `formatSiteGuideForAgent()` to render corrections**

  Replace the existing `formatSiteGuideForAgent` function in `site-guide-types.ts`:

  ```typescript
  export function formatSiteGuideForAgent(guide: SiteGuideJSON): string {
    const json = JSON.stringify(guide);
    let output = `--- SITE GUIDE (JSON): ${guide.site} ---\n${json}\n--- END SITE GUIDE ---`;
    
    if (guide.learned_corrections && guide.learned_corrections.length > 0) {
      const correctionLines = guide.learned_corrections.map(c => {
        const scope = c.scope_hint ? ` (scope: ${c.scope_hint})` : '';
        const notes = c.notes ? ` — ${c.notes}` : '';
        return `• [${c.action}] ${c.target}: use selector \`${c.correct_selector}\`${scope}${notes}`;
      }).join('\n');
      output += `\n\n--- LEARNED CORRECTIONS: ${guide.site} ---\n${correctionLines}\n--- END LEARNED CORRECTIONS ---`;
    }
    
    return output;
  }
  ```

- [ ] **Step 1.4: Add `learned_corrections` field to `Skill` interface in `db.ts`**

  In `db.ts`, update the `Skill` interface (around line 68) to add the new column:

  ```typescript
  export interface Skill {
    id: string;
    name: string;
    description: string;
    content: string;
    source: string | null;
    source_id: string | null;
    is_active: number;
    url_pattern: string | null;
    learned_corrections: string | null;  // JSON-serialized LearnedCorrection[]
    created_at: string;
    updated_at: string;
  }
  ```

- [ ] **Step 1.5: Add `saveLearnedCorrections()` and `getLearnedCorrections()` to `db.ts`**

  Add after the `getSkillsWithUrlPattern()` function (after line 599):

  ```typescript
  /**
   * Append learned corrections to a skill's stored corrections array.
   * New corrections are merged with any existing ones (never overwrites).
   * 
   * @param skillId - The skill's UUID
   * @param newCorrections - Array of LearnedCorrection objects to append
   */
  export async function appendLearnedCorrections(
    skillId: string,
    newCorrections: import('./site-guide-types').LearnedCorrection[]
  ): Promise<void> {
    const database = await initDB();
    const rows = await database.select<{ learned_corrections: string | null }[]>(
      'SELECT learned_corrections FROM skills WHERE id = $1',
      [skillId]
    );
    if (rows.length === 0) return;
    
    const existing: import('./site-guide-types').LearnedCorrection[] = rows[0].learned_corrections
      ? JSON.parse(rows[0].learned_corrections)
      : [];
    const merged = [...existing, ...newCorrections];
    
    await database.execute(
      `UPDATE skills SET learned_corrections = $1, updated_at = datetime('now') WHERE id = $2`,
      [JSON.stringify(merged), skillId]
    );
  }

  /**
   * Get all learned corrections for a skill.
   * Returns empty array if none exist.
   */
  export async function getLearnedCorrections(
    skillId: string
  ): Promise<import('./site-guide-types').LearnedCorrection[]> {
    const database = await initDB();
    const rows = await database.select<{ learned_corrections: string | null }[]>(
      'SELECT learned_corrections FROM skills WHERE id = $1',
      [skillId]
    );
    if (rows.length === 0 || !rows[0].learned_corrections) return [];
    try {
      return JSON.parse(rows[0].learned_corrections);
    } catch {
      return [];
    }
  }
  ```

- [ ] **Step 1.6: Add DB Migration 12 in `lib.rs`**

  In `ogre-desktop/src-tauri/src/lib.rs`, add after the Migration 11 block (after line 1882, before the closing `];`):

  ```rust
  // Migration 12: add learned_corrections column to skills for Agent Training
  Migration {
      version: 12,
      description: "add_learned_corrections_to_skills",
      sql: "ALTER TABLE skills ADD COLUMN learned_corrections TEXT DEFAULT NULL;",
      kind: MigrationKind::Up,
  },
  ```

- [ ] **Step 1.7: Update `buildSiteContextInjection()` in `skills-api.ts` to include corrections**

  In `skills-api.ts`, update the inner `try` block inside `buildSiteContextInjection()` (around lines 226–230) to merge learned corrections into the guide before formatting:

  ```typescript
  try {
    const guide = convertProfileToJSON(best.content);
    if (!guide.site) guide.site = best.name;
    
    // Merge any stored learned corrections into the guide
    if (best.learned_corrections) {
      try {
        const corrections = JSON.parse(best.learned_corrections) as import('./site-guide-types').LearnedCorrection[];
        if (corrections.length > 0) {
          guide.learned_corrections = corrections;
        }
      } catch {
        // Ignore malformed corrections JSON
      }
    }
    
    return formatSiteGuideForAgent(guide);
  } catch (e) {
    console.warn('buildSiteContextInjection: JSON conversion failed, using raw content', e);
    return `--- SITE GUIDE: ${best.name} ---\n${best.content}\n--- END SITE GUIDE ---`;
  }
  ```

- [ ] **Step 1.8: Commit**

  ```bash
  git add ogre-desktop/src/lib/site-guide-types.ts \
          ogre-desktop/src/lib/db.ts \
          ogre-desktop/src-tauri/src/lib.rs \
          ogre-desktop/src/lib/skills-api.ts
  git commit -m "feat(training): add LearnedCorrection type, DB column, and injection pipeline"
  ```

---

## Chunk 2: Training Session State Machine

### Task 2: Create `training-session.ts` — state, phases, system prompt

**Files:**
- Create: `ogre-desktop/src/lib/training-session.ts`

- [ ] **Step 2.1: Write `training-session.ts`**

  ```typescript
  /**
   * training-session.ts — Agent Training session state machine.
   *
   * A TrainingSession walks through 4 user-visible phases:
   *   idle → perception → dialogue → test → synthesizing → saved
   *
   * The agent:
   *  1. Captures the live DOM and reports its understanding (perception)
   *  2. Engages in free-text Q&A with the user (dialogue)
   *  3. Proposes and executes a live test action with user approval (test)
   *  4. Conversation is synthesized into corrections and saved (synthesizing → saved)
   *
   * The session is ephemeral (not persisted) — corrections are saved to SQLite
   * at the end via appendLearnedCorrections().
   */

  import type { ChatMessage } from './discovery-intent';
  import type { LearnedCorrection } from './site-guide-types';

  // ── Phase ────────────────────────────────────────────────────────────────

  export type TrainingPhase =
    | 'idle'          // Not started
    | 'perception'    // Agent is analyzing the DOM
    | 'dialogue'      // Free-text Q&A loop
    | 'test'          // Agent proposes a live test action
    | 'synthesizing'  // AI call converting conversation → corrections
    | 'saved'         // Corrections written to DB
    | 'error';        // Something went wrong

  // ── State ────────────────────────────────────────────────────────────────

  export interface TrainingSession {
    phase: TrainingPhase;
    messages: ChatMessage[];
    /** Confirmed corrections ready to save (≥1 enables "Save Training" button) */
    pendingCorrections: LearnedCorrection[];
    /** If the agent proposed a test action, this holds the description */
    proposedTestAction: string | null;
    /** Any error message */
    error: string | null;
    /** The skill ID to save corrections to (resolved when session starts) */
    skillId: string | null;
    /** Human-readable site name for UI display */
    siteName: string | null;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  export function createTrainingSession(): TrainingSession {
    return {
      phase: 'idle',
      messages: [],
      pendingCorrections: [],
      proposedTestAction: null,
      error: null,
      skillId: null,
      siteName: null,
    };
  }

  // ── System Prompt ─────────────────────────────────────────────────────────

  export const TRAINING_SYSTEM_PROMPT = `You are an Agent Training assistant for O.G.R.E., an AI-powered grading tool.

Your ONLY purpose is to help calibrate how the AI agent interacts with the current grading page.
This is NOT about workflow automation — it is about reliable DOM interaction:
which elements to click, how to find score inputs, how to target feedback fields.

## Your job in this conversation

1. PERCEPTION: Start by reporting what you observe on the page:
   - What type of grading page is this? (LMS name, grading tool)
   - How are student sections structured?
   - What selectors would you use for: score inputs, feedback fields, student name, save button
   - What are you uncertain about?
   Use this format:

   **Page type:** [description]
   **Student structure:** [description]
   **Proposed selectors:**
   - score_input: [selector]
   - feedback_box: [selector]
   - student_name: [selector]
   - save_button: [selector]
   **Uncertainties:** [list any]

2. DIALOGUE: After your perception report, ask the user if your understanding is correct.
   Accept corrections in plain English. If the user corrects a selector, confirm you understand.
   Keep responses short. Stay focused on DOM interactions only.

3. TEST: Once you have at least one confirmed insight, propose ONE test action:
   "I'd like to test: [action description]. May I proceed?"
   Wait for user confirmation before executing.

4. After testing, ask: "Shall I save these corrections?"

## Rules
- ONLY discuss page interaction (selectors, DOM structure, element targeting)
- Do NOT discuss grades, rubrics, scores, or grading logic
- Do NOT suggest workflow steps or what to do when grading
- Keep messages short and scannable
- If uncertain, say so — do not fabricate selectors`;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** True if the training session has at least one confirmed correction ready to save. */
  export function canSaveTraining(session: TrainingSession): boolean {
    return session.pendingCorrections.length > 0 ||
      session.messages.some(m => m.role === 'assistant' && m.content.includes('**Proposed selectors:**'));
  }

  /** True if the user's message looks like "save" or "done". */
  export function isSaveSignal(message: string): boolean {
    return /^\s*(save|done|finish|looks good|that'?s? good|perfect)\s*\.?\s*$/i.test(message.trim());
  }
  ```

- [ ] **Step 2.2: Commit**

  ```bash
  git add ogre-desktop/src/lib/training-session.ts
  git commit -m "feat(training): add TrainingSession state machine and system prompt"
  ```

---

## Chunk 3: Training Synthesizer

### Task 3: Create `training-synthesizer.ts` — conversation → corrections via AI

**Files:**
- Create: `ogre-desktop/src/lib/training-synthesizer.ts`

- [ ] **Step 3.1: Write `training-synthesizer.ts`**

  ```typescript
  /**
   * training-synthesizer.ts — Converts a completed training conversation
   * into structured LearnedCorrection records and gotcha bullets.
   *
   * Makes one AI call to the grading-server /api/chat endpoint with a
   * synthesis-focused system prompt, then parses the JSON response.
   */

  import type { ChatMessage } from './discovery-intent';
  import type { LearnedCorrection } from './site-guide-types';

  const SYNTHESIS_SYSTEM_PROMPT = `You are a data extraction assistant.
  Given a conversation between a user and an AI about how to interact with a grading webpage,
  extract structured corrections.

  Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
  {
    "corrections": [
      {
        "action": "click|type|scroll|navigate",
        "target": "human description of the target element",
        "correct_selector": "the confirmed CSS selector",
        "scope_hint": "optional scope context e.g. scope to ancestor div",
        "notes": "optional free-text note",
        "timestamp": "ISO8601 datetime"
      }
    ],
    "gotchas": [
      "Natural language bullet describing a learned rule or warning"
    ]
  }

  If no clear corrections were confirmed in the conversation, return:
  {"corrections": [], "gotchas": []}

  Extract ONLY what was explicitly confirmed by the user — do not infer or fabricate.`;

  export interface SynthesisResult {
    corrections: LearnedCorrection[];
    gotchas: string[];
  }

  /**
   * Synthesize a training conversation into structured corrections.
   *
   * @param messages - The full training conversation
   * @param sendMessage - Callback to POST /api/chat (same as used elsewhere in DiscoveryPanel)
   * @returns Extracted corrections and gotcha bullets
   */
  export async function synthesizeTraining(
    messages: ChatMessage[],
    sendMessage: (messages: ChatMessage[]) => Promise<string>,
  ): Promise<SynthesisResult> {
    const summaryRequest: ChatMessage = {
      role: 'user',
      content: 'Please extract all confirmed corrections from our conversation as JSON now.',
      timestamp: new Date().toISOString(),
    };

    const fullMessages = [...messages, summaryRequest];

    let responseText: string;
    try {
      responseText = await sendMessage(fullMessages);
    } catch (e) {
      console.warn('synthesizeTraining: AI call failed', e);
      return { corrections: [], gotchas: [] };
    }

    // Strip markdown fences if model adds them
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as {
        corrections?: unknown[];
        gotchas?: unknown[];
      };

      const corrections = (Array.isArray(parsed.corrections) ? parsed.corrections : [])
        .filter((c): c is LearnedCorrection =>
          typeof c === 'object' && c !== null &&
          typeof (c as Record<string, unknown>).action === 'string' &&
          typeof (c as Record<string, unknown>).correct_selector === 'string'
        )
        .map(c => ({
          ...c,
          timestamp: c.timestamp || new Date().toISOString(),
        }));

      const gotchas = (Array.isArray(parsed.gotchas) ? parsed.gotchas : [])
        .filter((g): g is string => typeof g === 'string');

      return { corrections, gotchas };
    } catch {
      console.warn('synthesizeTraining: failed to parse AI response as JSON', cleaned);
      return { corrections: [], gotchas: [] };
    }
  }
  ```

- [ ] **Step 3.2: Commit**

  ```bash
  git add ogre-desktop/src/lib/training-synthesizer.ts
  git commit -m "feat(training): add training synthesizer (conversation → LearnedCorrection[])"
  ```

---

## Chunk 4: Rename `chat` → `train` in Intent Mode

### Task 4: Update `IntentMode`, `DiscoveryModeSelector.svelte`, and `DiscoveryPanel.svelte` references

**Files:**
- Modify: `ogre-desktop/src/lib/discovery-intent.ts` (line 22)
- Modify: `ogre-desktop/src/components/grading/DiscoveryModeSelector.svelte` (lines 17–21)
- Modify: `ogre-desktop/src/components/grading/DiscoveryPanel.svelte` (lines 91, 97, 219–226 and all `'chat'` references)

- [ ] **Step 4.1: Rename `'chat'` to `'train'` in `discovery-intent.ts`**

  Line 22 in `discovery-intent.ts`:
  ```typescript
  // Before:
  export type IntentMode = 'form' | 'chat' | 'example';
  // After:
  export type IntentMode = 'form' | 'train' | 'example';
  ```

  Also update `intentToDiscoveryHints()` switch case at line 493:
  ```typescript
  // Before:
  case 'chat':
    return parseChatIntent(payload as ChatMessage[]);
  // After:
  case 'train':
    return parseChatIntent(payload as ChatMessage[]);
  ```

- [ ] **Step 4.2: Update `DiscoveryModeSelector.svelte`**

  Lines 17–21 — change `'chat'` to `'train'` and `💬 Chat` to `🧠 Train`:
  ```svelte
  <button 
    class="mode-btn {mode === 'train' ? 'active' : ''}" 
    onclick={() => mode = 'train'}
  >
    🧠 Train
  </button>
  ```

- [ ] **Step 4.3: Update `DiscoveryPanel.svelte` — rename mode state references**

  Replace all occurrences of `'chat'` mode in the script block:
  - Line 91: `let mode = $state<IntentMode>('form');` — no change needed
  - Any `mode === 'chat'` checks in template → `mode === 'train'`
  - `handleChatSubmit` can be renamed to `handleTrainSubmit` in Task 5

- [ ] **Step 4.4: Commit**

  ```bash
  git add ogre-desktop/src/lib/discovery-intent.ts \
          ogre-desktop/src/components/grading/DiscoveryModeSelector.svelte \
          ogre-desktop/src/components/grading/DiscoveryPanel.svelte
  git commit -m "feat(training): rename IntentMode 'chat' to 'train', update mode selector label"
  ```

---

## Chunk 5: Rebuild `DiscoveryChat.svelte` into Training UI

### Task 5: Replace stub chat UI with full training conversation UI

**Files:**
- Modify: `ogre-desktop/src/components/grading/DiscoveryChat.svelte` (full rewrite, ~118 lines → ~200 lines)

The Training UI must:
- Show a phase indicator ("Perception · Dialogue · Test · Save")
- Show messages in a scrollable list (user right-aligned, assistant left-aligned — same as existing `.msg` styles)
- Show a structured perception card when the agent's first message includes `**Proposed selectors:**`
- Show a "Save Training" button when `canSaveTraining()` is true (appears below messages, above input)
- Show a loading spinner during perception phase
- Keep text input + Send button at bottom

- [ ] **Step 5.1: Rewrite `DiscoveryChat.svelte`**

  ```svelte
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
    let messagesEl: HTMLDivElement | undefined;

    const PHASES = ['perception', 'dialogue', 'test', 'saved'];

    const phaseIndex = $derived(PHASES.indexOf(session.phase));

    async function handleSend() {
      if (!inputText.trim() || isSending) return;
      const text = inputText;
      inputText = '';
      isSending = true;
      try {
        await onSendMessage(text);
      } finally {
        isSending = false;
      }
    }

    $effect(() => {
      // Scroll to bottom when messages change
      if (messagesEl && session.messages.length) {
        setTimeout(() => {
          if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
        }, 50);
      }
    });
  </script>

  <div class="training-ui">
    <!-- Phase indicator -->
    <div class="phase-bar">
      {#each ['Perception', 'Dialogue', 'Test', 'Save'] as label, i}
        <div class="phase-step {i <= phaseIndex ? 'active' : ''} {i === phaseIndex ? 'current' : ''}">
          <span class="phase-dot"></span>
          <span class="phase-label">{label}</span>
        </div>
        {#if i < 3}<div class="phase-line"></div>{/if}
      {/each}
    </div>

    <!-- Message list -->
    <div class="messages" bind:this={messagesEl}>
      {#if session.phase === 'idle'}
        <p class="placeholder">Click "Start Training" to begin calibrating the agent on this page.</p>
      {:else if session.phase === 'perception' && session.messages.length === 0}
        <div class="loading-row">
          <span class="spinner"></span>
          <span>Agent is analyzing the page...</span>
        </div>
      {/if}

      {#each session.messages as msg}
        <div class="msg {msg.role}">
          <div class="msg-content">{msg.content}</div>
        </div>
      {/each}

      {#if session.phase === 'synthesizing'}
        <div class="loading-row">
          <span class="spinner"></span>
          <span>Synthesizing corrections...</span>
        </div>
      {/if}

      {#if session.phase === 'saved'}
        <div class="saved-banner">
          ✅ Training saved! Future agent sessions on this page will use these corrections.
        </div>
      {/if}

      {#if session.phase === 'error' && session.error}
        <div class="error-banner">⚠️ {session.error}</div>
      {/if}
    </div>

    <!-- Save button (appears once there's something to save) -->
    {#if canSaveTraining(session) && session.phase === 'dialogue'}
      <button class="save-btn" onclick={onSaveTraining}>
        💾 Save Training
      </button>
    {/if}

    <!-- Input -->
    {#if session.phase !== 'saved' && session.phase !== 'synthesizing' && session.phase !== 'idle'}
      <div class="input-row">
        <input
          type="text"
          bind:value={inputText}
          disabled={isSending}
          placeholder={session.phase === 'perception' ? 'Waiting for agent...' : 'Reply to agent...'}
          onkeydown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button class="btn-sm" onclick={handleSend} disabled={isSending || !inputText.trim()}>
          {isSending ? '...' : 'Send'}
        </button>
      </div>
    {:else if session.phase === 'idle'}
      <button class="start-btn" onclick={() => onSendMessage('__start__')}>
        🚀 Start Training
      </button>
    {/if}
  </div>

  <style>
    .training-ui {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }

    .phase-bar {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 4px 0;
      font-size: 0.7rem;
    }

    .phase-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex: 0 0 auto;
      opacity: 0.4;
    }

    .phase-step.active { opacity: 0.7; }
    .phase-step.current { opacity: 1; }

    .phase-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-text-secondary);
    }

    .phase-step.current .phase-dot {
      background: var(--color-primary);
    }

    .phase-line {
      flex: 1;
      height: 1px;
      background: var(--color-border);
      margin: 0 2px;
      margin-bottom: 12px;
    }

    .phase-label {
      color: var(--color-text-secondary);
      white-space: nowrap;
    }

    .phase-step.current .phase-label {
      color: var(--color-text-primary);
      font-weight: 500;
    }

    .messages {
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--color-bg-secondary);
      padding: 8px;
      border-radius: var(--radius-sm);
    }

    .placeholder {
      color: var(--color-text-secondary);
      font-size: 0.85rem;
      margin: 0;
      font-style: italic;
      padding: 8px;
    }

    .loading-row {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--color-text-secondary);
      font-size: 0.85rem;
      padding: 4px;
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .msg {
      padding: 6px 10px;
      border-radius: 12px;
      font-size: 0.85rem;
      max-width: 90%;
      white-space: pre-wrap;
    }

    .msg.user {
      align-self: flex-end;
      background: var(--color-primary);
      color: white;
    }

    .msg.assistant {
      align-self: flex-start;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
    }

    .saved-banner {
      background: #d4edda;
      color: #155724;
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 0.85rem;
    }

    .error-banner {
      background: #f8d7da;
      color: #721c24;
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 0.85rem;
    }

    .save-btn {
      width: 100%;
      padding: 8px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .save-btn:hover { opacity: 0.9; }

    .start-btn {
      width: 100%;
      padding: 10px;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .start-btn:hover { background: var(--color-bg-card-hover); }

    .input-row {
      display: flex;
      gap: 4px;
    }

    .input-row input {
      flex: 1;
      padding: 6px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
    }

    .input-row input:disabled { opacity: 0.6; }

    .btn-sm {
      padding: 4px 12px;
      font-size: 0.85rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
    }

    .btn-sm:hover:not(:disabled) { background: var(--color-bg-card-hover); }
    .btn-sm:disabled { opacity: 0.5; cursor: default; }
  </style>
  ```

- [ ] **Step 5.2: Commit**

  ```bash
  git add ogre-desktop/src/components/grading/DiscoveryChat.svelte
  git commit -m "feat(training): rebuild DiscoveryChat into training conversation UI with phase indicator"
  ```

---

## Chunk 6: Wire Training into `DiscoveryPanel.svelte`

### Task 6: Replace stub `handleChatSubmit()` with real training AI loop

**Files:**
- Modify: `ogre-desktop/src/components/grading/DiscoveryPanel.svelte`

The panel is responsible for:
1. Initializing `TrainingSession` when mode switches to `'train'`
2. Resolving the active skill ID for the current URL (needed to save corrections)
3. Handling `onSendMessage` — making the actual `/api/chat` call with `TRAINING_SYSTEM_PROMPT`
4. Handling `onSaveTraining` — calling `synthesizeTraining()` then `appendLearnedCorrections()`
5. Post-discovery prompt: after a successful discovery run, show a banner: "Want to verify these selectors? → Train this page"
6. Rendering `<DiscoveryChat session={trainingSession} {onSendMessage} {onSaveTraining} />` when mode is `'train'`

- [ ] **Step 6.1: Add training imports and state to `DiscoveryPanel.svelte`**

  In the `<script>` block (after the existing imports), add:

  ```typescript
  import { createTrainingSession, TRAINING_SYSTEM_PROMPT, isSaveSignal, canSaveTraining, type TrainingSession } from '../../lib/training-session';
  import { synthesizeTraining } from '../../lib/training-synthesizer';
  import { appendLearnedCorrections } from '../../lib/db';
  import { getMatchingSkillsForUrl } from '../../lib/skills-api';
  import { selectBestProfile } from '../../lib/profile-precedence';
  ```

  Add training state alongside the existing mode state (after line 97):
  ```typescript
  let trainingSession = $state<TrainingSession>(createTrainingSession());
  let showPostDiscoveryTrainPrompt = $state(false);
  ```

- [ ] **Step 6.2: Replace `handleChatSubmit()` with `handleTrainMessage()` and `handleSaveTraining()`**

  Replace lines 219–226 in `DiscoveryPanel.svelte`:

  ```typescript
  // ── Training handlers ─────────────────────────────────────────────────

  /** Resolve the skill ID for the current URL to save corrections against. */
  async function resolveSkillForUrl(): Promise<{ id: string; name: string } | null> {
    try {
      const skills = await getMatchingSkillsForUrl(pageLoadedUrl || '');
      const best = selectBestProfile(skills);
      return best ? { id: best.id, name: best.name } : null;
    } catch {
      return null;
    }
  }

  /** Send the training chat endpoint (/api/chat with TRAINING_SYSTEM_PROMPT). */
  async function sendTrainingMessage(messages: import('../../lib/discovery-intent').ChatMessage[]): Promise<string> {
    const token = await getHandshakeToken();
    const response = await tauriFetch(`${SERVER_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-handshake-token': token },
      body: JSON.stringify({
        provider,
        model,
        systemPrompt: TRAINING_SYSTEM_PROMPT,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const data = getResponseData(response) as { message?: string };
    return data.message || '';
  }

  /** Handle user message send in Train mode. */
  async function handleTrainMessage(text: string) {
    if (text === '__start__') {
      // Kick off perception phase
      trainingSession = { ...trainingSession, phase: 'perception' };
      const skill = await resolveSkillForUrl();
      trainingSession = {
        ...trainingSession,
        skillId: skill?.id ?? null,
        siteName: skill?.name ?? null,
      };

      // Capture DOM summary for initial perception
      let domContext = '';
      try {
        const dom = await captureInteractiveDom();
        domContext = `\n\nPage DOM summary (top-level interactive elements):\n${JSON.stringify(dom).slice(0, 3000)}`;
      } catch { /* non-fatal */ }

      const initMessages: import('../../lib/discovery-intent').ChatMessage[] = [{
        role: 'user',
        content: `I need you to analyze this grading page and report your DOM understanding. Current URL: ${pageLoadedUrl}${domContext}`,
        timestamp: new Date().toISOString(),
      }];

      try {
        const agentResponse = await sendTrainingMessage(initMessages);
        trainingSession = {
          ...trainingSession,
          phase: 'dialogue',
          messages: [
            ...initMessages,
            { role: 'assistant', content: agentResponse, timestamp: new Date().toISOString() },
          ],
        };
      } catch (e) {
        trainingSession = { ...trainingSession, phase: 'error', error: String(e) };
      }
      return;
    }

    // Normal dialogue turn
    const userMsg: import('../../lib/discovery-intent').ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...trainingSession.messages, userMsg];
    trainingSession = { ...trainingSession, messages: updatedMessages };

    if (isSaveSignal(text)) {
      await handleSaveTraining();
      return;
    }

    try {
      const agentResponse = await sendTrainingMessage(updatedMessages);
      trainingSession = {
        ...trainingSession,
        messages: [
          ...updatedMessages,
          { role: 'assistant', content: agentResponse, timestamp: new Date().toISOString() },
        ],
      };
    } catch (e) {
      trainingSession = { ...trainingSession, phase: 'error', error: String(e) };
    }
  }

  /** Synthesize and save training corrections. */
  async function handleSaveTraining() {
    trainingSession = { ...trainingSession, phase: 'synthesizing' };
    try {
      const result = await synthesizeTraining(trainingSession.messages, sendTrainingMessage);

      if (trainingSession.skillId && result.corrections.length > 0) {
        await appendLearnedCorrections(trainingSession.skillId, result.corrections);
      }

      // Also update site profile markdown with gotcha bullets if we have a skill
      // (future enhancement — skip for now, corrections column is sufficient)

      trainingSession = {
        ...trainingSession,
        phase: 'saved',
        pendingCorrections: result.corrections,
      };
    } catch (e) {
      trainingSession = { ...trainingSession, phase: 'error', error: String(e) };
    }
  }
  ```

- [ ] **Step 6.3: Add post-discovery training prompt to `runDiscovery()` success path**

  In `DiscoveryPanel.svelte`, in the `handleRunDiscovery` function (around line 209 after `phase = 'review'`), add:

  ```typescript
  showPostDiscoveryTrainPrompt = true;
  ```

- [ ] **Step 6.4: Update `DiscoveryPanel.svelte` template to use train mode and new components**

  Find where `DiscoveryChat` is rendered in the template. Replace the existing `{#if mode === 'chat'}` block (or wherever chat mode renders) with:

  ```svelte
  {#if mode === 'train'}
    {#if showPostDiscoveryTrainPrompt && phase === 'review'}
      <div class="post-discovery-train-prompt">
        Discovery complete. Want to verify these selectors with the agent?
        <button onclick={() => { showPostDiscoveryTrainPrompt = false; mode = 'train'; trainingSession = createTrainingSession(); }}>
          🧠 Train this page
        </button>
        <button onclick={() => showPostDiscoveryTrainPrompt = false}>Dismiss</button>
      </div>
    {/if}
    <DiscoveryChat
      bind:session={trainingSession}
      onSendMessage={handleTrainMessage}
      onSaveTraining={handleSaveTraining}
    />
  {/if}
  ```

  Also remove the import of the old `ChatDiscoveryState` and `runChatDiscovery` if they're no longer used after this change.

- [ ] **Step 6.5: Commit**

  ```bash
  git add ogre-desktop/src/components/grading/DiscoveryPanel.svelte
  git commit -m "feat(training): wire training AI loop into DiscoveryPanel — perception, dialogue, save"
  ```

---

## Chunk 7: AgentChat "Train this page?" button

### Task 7: Show training entry point when agent hits loop limit

**Files:**
- Modify: `ogre-desktop/src/components/grading/AgentChat.svelte`

The agent-loop fires `{ type: 'done', message: 'Loop detected: ...' }` when `maxSameAction` fires. When AgentChat receives a `done` event whose message starts with `"Loop detected"`, show a "Train this page?" button that calls `onRequestDiscovery()` (which already exists as a prop on line 21 of `AgentChat.svelte`).

- [ ] **Step 7.1: Find the loop-detected display logic in `AgentChat.svelte`**

  Search for where `type: 'done'` system messages are rendered. Likely around the message list display logic. The `onRequestDiscovery` prop is already wired (line 21).

- [ ] **Step 7.2: Add "Train this page?" button to the loop-detected done message**

  In the template section that renders system messages, add a conditional button after loop-detected messages:

  ```svelte
  {#if msg.type === 'system' && msg.content?.startsWith('Loop detected')}
    <div class="train-prompt">
      <p>The agent seems stuck. Training can help it learn how to interact with this page.</p>
      <button class="btn-train" onclick={onRequestDiscovery}>
        🧠 Train this page?
      </button>
    </div>
  {/if}
  ```

  Add styles:
  ```svelte
  .train-prompt {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-size: 0.85rem;
  }
  .btn-train {
    margin-top: 6px;
    padding: 6px 12px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .btn-train:hover { opacity: 0.9; }
  ```

- [ ] **Step 7.3: Commit**

  ```bash
  git add ogre-desktop/src/components/grading/AgentChat.svelte
  git commit -m "feat(training): add 'Train this page?' button to AgentChat on loop-detected failure"
  ```

---

## Chunk 8: TypeScript cleanup + diagnostics pass

### Task 8: Run diagnostics, fix all type errors

**Files:** All modified files

- [ ] **Step 8.1: Check TypeScript in `site-guide-types.ts`**

  - `LearnedCorrection` is exported ✓
  - `SiteGuideJSON.learned_corrections` is optional (`?`) ✓
  - `formatSiteGuideForAgent` takes `SiteGuideJSON` — verify no type errors from new optional field

- [ ] **Step 8.2: Check TypeScript in `db.ts`**

  - `Skill.learned_corrections` added to interface
  - `appendLearnedCorrections` import of `LearnedCorrection` from `./site-guide-types` — verify path
  - `saveSkill()` UPDATE query does NOT include `learned_corrections` — it is a separate column updated only via `appendLearnedCorrections()`. Verify the existing `saveSkill` UPDATE at line 577 doesn't accidentally null it out.
  
  > **Important:** The existing `saveSkill` UPDATE at line 577 does NOT include `learned_corrections` in its SET clause — so it won't overwrite corrections on update. ✓

- [ ] **Step 8.3: Check TypeScript in `skills-api.ts`**

  - `Skill` import from `./db` now includes `learned_corrections` field — verify no usage breakage
  - `best.learned_corrections` is `string | null` — verify null check in `buildSiteContextInjection`

- [ ] **Step 8.4: Check TypeScript in `DiscoveryPanel.svelte`**

  - `handleTrainMessage` uses `import('../../lib/discovery-intent').ChatMessage` inline — verify this compiles
  - `trainingSession` state shape matches `TrainingSession` interface
  - `createTrainingSession()` called correctly

- [ ] **Step 8.5: Check TypeScript in `DiscoveryChat.svelte`**

  - Props match new signature: `session: TrainingSession`, `onSendMessage`, `onSaveTraining`
  - `canSaveTraining(session)` called correctly

- [ ] **Step 8.6: Commit**

  ```bash
  git add -A
  git commit -m "fix(training): resolve TypeScript type errors across training feature files"
  ```

---

## Chunk 9: Integration smoke test

### Task 9: Manual verification steps

The app cannot run automated tests for browser automation features. Verify manually:

- [ ] **Step 9.1: Build check**

  ```bash
  cd ogre-desktop && npm run build 2>&1 | tail -20
  ```
  Expected: Exit 0, no TypeScript errors.

- [ ] **Step 9.2: Verify DB migration**

  On app start, the `learned_corrections` column should exist after Migration 12 runs.
  To verify: open SQLite browser or add temporary debug log in `initDB()` to confirm `skills` table has the column.

- [ ] **Step 9.3: Verify Train tab appears**

  - Open app, go to Discover tab
  - Mode selector should show: `📝 Guided Form` | `🧠 Train` | `🎯 Teach by Example`
  - Clicking `🧠 Train` shows the training UI with "Start Training" button

- [ ] **Step 9.4: Verify training conversation flows**

  - Click "Start Training" → phase changes to Perception, agent reports DOM analysis
  - Reply to agent → dialogue phase continues
  - Type "save" or "done" → synthesizing phase, then saved banner
  - If a matching skill exists for the URL, corrections are written to DB

- [ ] **Step 9.5: Verify injection includes corrections on next session**

  - After saving, go to Agent tab
  - Start agent on the same URL
  - Check system prompt (via debug log or console) to confirm `--- LEARNED CORRECTIONS ---` block appears

- [ ] **Step 9.6: Commit if any last-minute fixes**

  ```bash
  git add -A && git commit -m "fix(training): post-integration smoke test fixes"
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have" (LearnedCorrection type, DB column, injection pipeline, Train mode label, training conversation, Save Training button, AgentChat button, post-discovery prompt): verify implementation exists in the changed files. For each "Must NOT Have" (no MOM-specific hardcoding, no overwrite of existing scores, no server-side JS changes): search codebase for forbidden patterns.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cd ogre-desktop && npm run build`. Review all changed files for: unused imports, `any` type casts, commented-out code, hardcoded MOM-specific assumptions. Confirm that `saveSkill()` UPDATE query does NOT touch `learned_corrections`. Confirm `appendLearnedCorrections` correctly merges (never overwrites) existing corrections.
  Output: `Build [pass/fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Full Build Verification** — `unspecified-high`
  Run full TypeScript build with `cd ogre-desktop && npm run build 2>&1`. Verify 0 TypeScript errors. Specifically verify `DiscoveryChat.svelte` compiles with new `TrainingSession` props, `DiscoveryPanel.svelte` compiles with new training imports, `db.ts` compiles with `appendLearnedCorrections`.
  Output: `Build [pass/fail] | TS Errors [N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read spec, read actual diff using `git diff HEAD~12..HEAD --name-only` (12 = total plan commits). Verify 1:1 — everything in plan was built, nothing beyond plan scope was built (especially: no grading logic changes, no server-side changes, no workflow automation additions). Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`
