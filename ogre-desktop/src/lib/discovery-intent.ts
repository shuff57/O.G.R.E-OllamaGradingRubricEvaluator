/**
 * discovery-intent.ts - Three-mode discovery interaction model
 *
 * Defines types and parsing stubs for the three ways a user can guide the
 * Discover tab toward finding grading selectors on an unknown page:
 *
 *  1. Form mode  — User fills in structured hints (URL, student count, etc.)
 *  2. Chat mode  — Conversational back-and-forth scoped to discovery
 *  3. Example mode — User clicks/selects 2-3 example elements to teach the AI
 *
 * Parsing functions are stubs here; full implementations live in the
 * mode-specific components and are gated behind Wave 3 tasks.
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

// ============================================================================
// Parsing Function Stubs
// ============================================================================

/**
 * Parse a FormModeInput into normalized DiscoveryHints.
 *
 * @stub — Full implementation in Wave 3 (T16: DiscoveryFormMode.svelte)
 */
export function parseFormIntent(input: FormModeInput): DiscoveryHints {
  const hints: DiscoveryHints = {
    estimatedStudentCount: input.estimatedStudentCount,
    hasScoreInputs: input.hasScoreInputs,
    hasStudentNames: input.hasStudentNames,
  };

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
 * Scans the conversation for user-stated facts (student count, selector
 * names, descriptions) and compiles them into a DiscoveryHints object.
 *
 * @stub — Full NLP extraction in Wave 3 (T17: DiscoveryChatMode.svelte)
 */
export function parseChatIntent(messages: ChatMessage[]): DiscoveryHints {
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content);

  // Stub: concatenate all user messages as extraContext
  const extraContext = userMessages.join('\n').trim() || undefined;

  return { extraContext };
}

/**
 * Generalize a set of ExampleSelections into stable CSS selectors.
 *
 * Two or more selections of the same elementType are used to find the
 * common structural pattern (e.g. drop nth-child specificity).
 *
 * @stub — Full generalization in Wave 3 (T18: DiscoveryExampleMode.svelte)
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
    // Stub: use the first example's selector verbatim, confidence by count
    const confidence = Math.min(group.length / 3, 1);
    results.push({
      elementType,
      selector: group[0].capturedSelector,
      exampleCount: group.length,
      confidence,
    });
  }

  return results;
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
