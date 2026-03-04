/**
 * discovery-intent.ts - Three-mode discovery interaction model
 *
 * Defines types and parsing functions for the three ways a user can guide the
 * Discover tab toward finding grading selectors on an unknown page:
 *
 *  1. Form mode  — User fills in structured hints (URL, student count, etc.)
 *  2. Chat mode  — Conversational back-and-forth scoped to discovery
 *  3. Example mode — User clicks/selects 2-3 example elements to teach the AI
 *
 * Each mode produces a unified DiscoveryHints object consumed by the discovery
 * pipeline to augment AI prompts and narrow the search.
 */

// ============================================================================
// Intent Modes
// ============================================================================

/**
 * The three interaction modes available in the Discover tab.
 */
export type IntentMode = 'form' | 'chat' | 'example';

// ============================================================================
// Shared Hints Output
// ============================================================================

/**
 * Normalized hints produced by any intent mode.
 * Passed to the discovery pipeline to focus the AI's attention.
 */
export interface DiscoveryHints {
  /** Approximate number of student rows visible on the page */
  estimatedStudentCount?: number;
  /** Known CSS selectors provided by the user (may be partially correct) */
  knownSelectors?: Partial<Record<string, string>>;
  /** Free-form description of what the page contains */
  pageDescription?: string;
  /** Whether the user believes scores are entered in the page */
  hasScoreInputs?: boolean;
  /** Whether the user believes student names are visible */
  hasStudentNames?: boolean;
  /** Additional freeform context from user messages */
  extraContext?: string;
  /** Generalized selectors derived from example selections */
  generalizedSelectors?: GeneralizedSelector[];
  /** List of selector field names the user specifically wants discovered */
  requiredSelectors?: string[];
  /** Text to append to the AI discovery prompt for additional context */
  promptAddendum?: string;
  /** User's preferred navigation mode */
  navigationMode?: 'batch' | 'sequential';
}

// ============================================================================
// Form Mode
// ============================================================================

/**
 * Structured input collected by the guided form UI.
 */
export interface FormModeInput {
  /** How many students does the user expect to see? */
  estimatedStudentCount?: number;
  /** Does the page have visible student names? */
  hasStudentNames: boolean;
  /** Does the page have score entry inputs? */
  hasScoreInputs: boolean;
  /** Does the page have feedback / comment fields? */
  hasFeedbackFields: boolean;
  /** Any specific CSS selectors the user already knows */
  knownSelectors?: string;
  /** Free-form notes */
  notes?: string;
}

// ============================================================================
// Chat Mode
// ============================================================================

/**
 * A single message in the discovery chat.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/** Maximum number of user turns before forcing chat completion. */
export const MAX_CHAT_TURNS = 5;

/** State for a discovery chat session. Ephemeral — not persisted. */
export interface ChatDiscoveryState {
  messages: ChatMessage[];
  turnCount: number;
  isComplete: boolean;
  hints: DiscoveryHints;
}

/**
 * System prompt that scopes the chat conversation to discovery only.
 */
export const DISCOVERY_CHAT_SYSTEM_PROMPT =
  'You are a grading page discovery assistant. Your ONLY purpose is to help ' +
  'identify CSS selectors and page structure for a grading page.\n\n' +
  'Ask focused questions to understand:\n' +
  '1. What kind of page this is (LMS name, grading tool)\n' +
  '2. How many students are visible\n' +
  '3. What elements exist (score inputs, feedback areas, student names)\n' +
  '4. Any CSS selectors the user already knows\n\n' +
  'Keep responses short and focused. After gathering enough information, ' +
  'summarize what you\'ve learned.\n' +
  'Do NOT help with general questions — only grading page discovery.';

// ============================================================================
// Example Mode
// ============================================================================

/**
 * A single example element the user has selected by clicking on the page.
 */
export interface ExampleSelection {
  /** What kind of element did the user identify? */
  elementType: 'studentRow' | 'scoreinput' | 'studentName' | 'feedback' | 'saveButton' | 'other';
  /** The CSS selector captured at click time */
  capturedSelector: string;
  /** Visible text content at time of selection */
  text: string;
  /** Tag name */
  tag: string;
  /** Key attributes (id, class, name, type) */
  attrs: Record<string, string>;
}

/**
 * A generalized selector derived from one or more example selections
 * by stripping nth-child indices and normalizing class names.
 */
export interface GeneralizedSelector {
  /** What this selector targets */
  elementType: ExampleSelection['elementType'];
  /** The generalized CSS selector */
  selector: string;
  /** How many examples were used to derive this (confidence proxy) */
  exampleCount: number;
  /** Confidence score [0, 1] */
  confidence: number;
}

/** Result from running example-mode discovery. */
export interface ExampleDiscoveryResult {
  selections: ExampleSelection[];
  generalizedSelectors: GeneralizedSelector[];
  hints: DiscoveryHints;
}

// ============================================================================
// Internal Helpers — Selector Generalization
// ============================================================================

/**
 * Strip positional pseudo-classes (:nth-child, :nth-of-type, :first-child, etc.)
 * from a CSS selector to produce a broader match pattern.
 */
function stripPositionalPseudos(selector: string): string {
  return selector
    .replace(/:nth-child\([^)]*\)/g, '')
    .replace(/:nth-of-type\([^)]*\)/g, '')
    .replace(/:first-child/g, '')
    .replace(/:last-child/g, '')
    .replace(/:first-of-type/g, '')
    .replace(/:last-of-type/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Find a common attribute value across all examples, or undefined if values differ.
 */
function findCommonAttr(
  examples: ExampleSelection[],
  attr: string,
): string | undefined {
  if (examples.length === 0) return undefined;
  const first = examples[0].attrs[attr];
  if (first === undefined) return undefined;
  return examples.every((e) => e.attrs[attr] === first) ? first : undefined;
}

/**
 * Generalize CSS selectors from a group of ExampleSelections of the same type.
 *
 * For a single example: strips positional pseudo-classes.
 * For multiple examples: finds common tag + classes + attributes.
 */
function generalizeFromGroup(examples: ExampleSelection[]): string {
  if (examples.length === 0) return '';

  // Single example: strip positional specifics from captured selector
  if (examples.length === 1) {
    return stripPositionalPseudos(examples[0].capturedSelector);
  }

  // Multiple examples: find common tag
  const tags = examples.map((e) => e.tag);
  const commonTag = tags.every((t) => t === tags[0]) ? tags[0] : '';

  // Find common CSS classes from attrs
  const classSets = examples.map((e) => {
    const raw = e.attrs['class'] ?? '';
    return new Set(raw.split(/\s+/).filter(Boolean));
  });
  const commonClasses =
    classSets[0].size > 0
      ? [...classSets[0]].filter((cls) => classSets.every((s) => s.has(cls)))
      : [];

  // Find common type attribute (useful for input elements)
  const commonType = findCommonAttr(examples, 'type');

  // Build generalized selector
  let selector = commonTag;
  for (const cls of commonClasses) {
    selector += `.${cls}`;
  }
  if (commonType) {
    selector += `[type="${commonType}"]`;
  }

  // Fallback: strip positional from first captured selector
  if (!selector) {
    selector = stripPositionalPseudos(examples[0].capturedSelector);
  }

  return selector;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a FormModeInput into normalized DiscoveryHints.
 *
 * Converts structured form checkboxes (which fields to find: names, scores,
 * feedback, etc.) and optional text descriptions into a DiscoveryHints object
 * that augments the AI prompt.
 */
export function parseFormIntent(input: FormModeInput): DiscoveryHints {
  const hints: DiscoveryHints = {
    estimatedStudentCount: input.estimatedStudentCount,
    hasScoreInputs: input.hasScoreInputs,
    hasStudentNames: input.hasStudentNames,
  };

  // Build requiredSelectors from boolean flags
  const required: string[] = [];
  if (input.hasStudentNames) required.push('studentName');
  if (input.hasScoreInputs) required.push('scoreInput');
  if (input.hasFeedbackFields) required.push('feedbackBox');
  if (required.length > 0) {
    hints.requiredSelectors = required;
  }

  // Build a structured page description from boolean flags
  const descriptions: string[] = [];
  if (input.hasStudentNames) descriptions.push('Student names are visible on the page');
  if (input.hasScoreInputs) descriptions.push('Score input fields are present');
  if (input.hasFeedbackFields) descriptions.push('Feedback/comment fields are present');
  if (input.estimatedStudentCount) {
    descriptions.push(`Approximately ${input.estimatedStudentCount} students expected`);
  }
  if (descriptions.length > 0) {
    hints.pageDescription = descriptions.join('. ') + '.';
  }

  // Build promptAddendum for AI prompt augmentation
  const addendumParts: string[] = [];
  if (descriptions.length > 0) {
    addendumParts.push('User indicates: ' + descriptions.join('; ') + '.');
  }
  if (input.notes) {
    addendumParts.push('Additional notes: ' + input.notes);
  }
  if (addendumParts.length > 0) {
    hints.promptAddendum = addendumParts.join(' ');
  }

  if (input.notes) {
    hints.extraContext = input.notes;
  }

  if (input.knownSelectors?.trim()) {
    // Best-effort: user may paste a JSON blob or a single selector
    try {
      const parsed = JSON.parse(input.knownSelectors);
      if (typeof parsed === 'object' && parsed !== null) {
        hints.knownSelectors = parsed as Record<string, string>;
      }
    } catch {
      // Treat as a freeform note
      hints.extraContext = [hints.extraContext, input.knownSelectors].filter(Boolean).join('\n');
    }
  }

  return hints;
}

/**
 * Extract DiscoveryHints from the accumulated chat history.
 *
 * Scans user messages for structured facts (student count, page descriptions,
 * selector names) and compiles them into a DiscoveryHints object.
 * Assistant messages are ignored — only user-stated facts matter.
 */
export function parseChatIntent(messages: ChatMessage[]): DiscoveryHints {
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content);

  if (userMessages.length === 0) {
    return {};
  }

  const allText = userMessages.join('\n');
  const hints: DiscoveryHints = {};

  // Extract student count from natural language ("25 students", "about 30 students")
  const countMatch = allText.match(/(\d+)\s*students?/i);
  if (countMatch) {
    hints.estimatedStudentCount = parseInt(countMatch[1], 10);
  }

  // Detect score input mentions
  if (/score\s*(input|field|box|entr)|input.*?score|number\s+input/i.test(allText)) {
    hints.hasScoreInputs = true;
  }

  // Detect student name mentions
  if (/student\s*names?\s*(are|is|visible|shown|displayed)|names?\s*(column|field|visible)/i.test(allText)) {
    hints.hasStudentNames = true;
  }

  // Detect navigation mode preferences
  if (/one\s*(at\s*a\s*time|student|by\s*one)|sequential|paginated/i.test(allText)) {
    hints.navigationMode = 'sequential';
  } else if (/all\s*(students?|visible|at\s*once)|batch/i.test(allText)) {
    hints.navigationMode = 'batch';
  }

  // Build requiredSelectors from detected needs
  const required: string[] = [];
  if (hints.hasStudentNames) required.push('studentName');
  if (hints.hasScoreInputs) required.push('scoreInput');
  if (/feedback|comment/i.test(allText)) required.push('feedbackBox');
  if (required.length > 0) {
    hints.requiredSelectors = required;
  }

  // Preserve full user context as extraContext
  hints.extraContext = allText.trim() || undefined;

  return hints;
}

/**
 * Generalize a set of ExampleSelections into stable CSS selectors.
 *
 * Two or more selections of the same elementType are used to find the
 * common structural pattern (e.g. drop nth-child specificity).
 * Single selections have positional pseudo-classes stripped.
 */
export function parseExampleSelections(examples: ExampleSelection[]): GeneralizedSelector[] {
  // Group by elementType
  const byType = new Map<ExampleSelection['elementType'], ExampleSelection[]>();
  for (const ex of examples) {
    const group = byType.get(ex.elementType) ?? [];
    group.push(ex);
    byType.set(ex.elementType, group);
  }

  const results: GeneralizedSelector[] = [];
  for (const [elementType, group] of byType) {
    const selector = generalizeFromGroup(group);
    const confidence = Math.min(group.length / 3, 1);
    results.push({
      elementType,
      selector,
      exampleCount: group.length,
      confidence,
    });
  }

  return results;
}

// ============================================================================
// Orchestration Functions
// ============================================================================

/**
 * Create a fresh chat discovery state.
 */
export function createChatDiscoveryState(): ChatDiscoveryState {
  return { messages: [], turnCount: 0, isComplete: false, hints: {} };
}

/**
 * Run one turn of chat-based discovery.
 *
 * Adds the user message, increments turn count, and either:
 * - Forces completion if MAX_CHAT_TURNS is reached (no AI call), or
 * - Calls sendMessage to get the assistant response.
 *
 * Chat state is ephemeral — not persisted between sessions.
 *
 * @param state        Current chat state
 * @param userMessage  User's new message text
 * @param sendMessage  Callback to get AI response (maps to POST /api/chat)
 * @returns Updated chat state with new messages and extracted hints
 */
export async function runChatDiscovery(
  state: ChatDiscoveryState,
  userMessage: string,
  sendMessage: (messages: ChatMessage[]) => Promise<string>,
): Promise<ChatDiscoveryState> {
  if (state.isComplete) return state;

  const userMsg: ChatMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  const updatedMessages = [...state.messages, userMsg];
  const newTurnCount = state.turnCount + 1;

  // Force completion after max turns — no AI call
  if (newTurnCount >= MAX_CHAT_TURNS) {
    return {
      messages: updatedMessages,
      turnCount: newTurnCount,
      isComplete: true,
      hints: parseChatIntent(updatedMessages),
    };
  }

  // Get AI response
  const responseText = await sendMessage(updatedMessages);
  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: responseText,
    timestamp: new Date().toISOString(),
  };
  const finalMessages = [...updatedMessages, assistantMsg];

  return {
    messages: finalMessages,
    turnCount: newTurnCount,
    isComplete: false,
    hints: parseChatIntent(finalMessages),
  };
}

/**
 * Run example-mode discovery: generalize selections and produce hints.
 *
 * @param selections  User's clicked example elements
 * @returns Generalized selectors and unified hints
 */
export function runExampleDiscovery(selections: ExampleSelection[]): ExampleDiscoveryResult {
  const generalizedSelectors = parseExampleSelections(selections);
  return {
    selections,
    generalizedSelectors,
    hints: { generalizedSelectors },
  };
}

/**
 * Convert any intent mode's output into a unified DiscoveryHints object.
 *
 * @param mode    The active interaction mode
 * @param payload Mode-specific input data
 */
export function intentToDiscoveryHints(
  mode: IntentMode,
  payload: FormModeInput | ChatMessage[] | ExampleSelection[]
): DiscoveryHints {
  switch (mode) {
    case 'form':
      return parseFormIntent(payload as FormModeInput);

    case 'chat':
      return parseChatIntent(payload as ChatMessage[]);

    case 'example': {
      const selections = payload as ExampleSelection[];
      const generalizedSelectors = parseExampleSelections(selections);
      return { generalizedSelectors };
    }
  }
}
