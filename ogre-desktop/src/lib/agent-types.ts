/**
 * agent-types.ts - Shared TypeScript types and constants for the browser agent feature.
 *
 * Contains all type definitions for the agent action system including:
 * - Action types and discriminated union for action parameters
 * - Agent message and state types
 * - Configuration interfaces
 * - API request/response types
 */

// ============================================================================
// Action Types
// ============================================================================

/** All possible agent actions. */
export type AgentAction =
  | 'click'
  | 'triple_click'
  | 'type'
  | 'scroll'
  | 'readText'
  | 'screenshot'
  | 'waitFor'
  | 'navigate'
  | 'runJS'
  | 'sleep'
  | 'pressKey'
  | 'writeCodeMirror'
  | 'capturePopup'
  | 'discover_page'
  | 'test_profile'
  | 'save_profile'
  | 'done';

/**
 * Discriminated union for action parameters.
 * Each action type has its own parameter shape.
 */
export type ActionParams =
  | { action: 'click'; selector: string }
  | { action: 'triple_click'; selector: string }
  | { action: 'type'; selector: string; text: string; clear?: boolean }
  | { action: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount: number }
  | { action: 'readText'; selector?: string }
  | { action: 'screenshot' }
  | { action: 'waitFor'; selector: string; timeoutMs?: number }
  | { action: 'navigate'; url: string }
  | { action: 'sleep'; ms: number }
  | { action: 'pressKey'; key: string }
  | { action: 'runJS'; code: string }
  | { action: 'writeCodeMirror'; selector: string; value: string }
  | { action: 'capturePopup'; timeoutMs?: number }
  | { action: 'discover_page'; hints?: import('./discovery-intent').DiscoveryHints }
  | { action: 'test_profile'; profileId: string; sampleCount?: number }
  | { action: 'save_profile'; profile: Partial<import('./batch-grader').SiteProfile>; name: string }
  | { action: 'done'; success: boolean; message: string };

// ============================================================================
// Result Types
// ============================================================================

/** Result from executing any agent action. */
export interface ActionResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

// ============================================================================
// Message Types
// ============================================================================

/** A message in the agent conversation. */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'action' | 'result' | 'system';
  content: string;
  action?: ActionParams;
  result?: ActionResult;
  screenshot?: string;
}

// ============================================================================
// Agent Modes and States
// ============================================================================

/** Agent operating modes. */
export type AgentMode = 'review' | 'auto';

/** Agent states for UI display. */
export type AgentState = 'idle' | 'thinking' | 'proposing' | 'executing' | 'done' | 'error';

// ============================================================================
// Configuration Types
// ============================================================================

/** Safety and execution configuration for the agent. */
export interface AgentConfig {
  /** Maximum number of actions to execute in a single session */
  maxSteps: number;
  /** Maximum time allowed for execution in milliseconds */
  maxTimeMs: number;
  /** Maximum consecutive same actions before stopping */
  maxSameAction: number;
  /** Maximum consecutive failed actions before stopping (catches alternating failure spirals) */
  maxConsecutiveFailures: number;
  /** Delay between actions in milliseconds */
  actionDelayMs: number;
}

/** Default agent configuration. */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxSteps: 30,
  maxTimeMs: 300000, // 5 minutes
  maxSameAction: 3,
  maxConsecutiveFailures: 5,
  actionDelayMs: 500
};
// ============================================================================
// DOM Element Types
// ============================================================================

/** A snapshotted interactive DOM element for agent decision-making. */
export interface InteractiveElement {
  /** Index in the element list */
  index: number;
  /** HTML tag name */
  tag: string;
  /** Input type (for input elements) */
  type?: string;
  /** Element ID */
  id?: string;
  /** Name attribute */
  name?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Visible text content */
  text: string;
  /** Input value */
  value?: string;
  /** Href attribute (for links) */
  href?: string;
  /** Whether the element is disabled */
  disabled: boolean;
  /** Whether the element is visible */
  visible: boolean;
  /** CSS selector for targeting this element */
  selector: string;
}

// ============================================================================
// API Types
// ============================================================================

/** Request to the agent API. */
export interface AgentApiRequest {
  messages: AgentMessage[];
  /** Optional DOM snapshot */
  dom?: string;
  /** Optional screenshot (base64) */
  screenshot?: string;
  /** Override active provider (e.g. 'ollama', 'openai') */
  provider?: string;
  /** Override active model */
  model?: string;
}

/** Response indicating an action to execute. */
export interface AgentActionResponse {
  action: AgentAction;
  params: Omit<ActionParams, 'action'>;
  reasoning?: string;
}

/** Response containing text output. */
export interface AgentTextResponse {
  text: string;
}

/** Union of all possible API response types. */
export type AgentApiResponse = AgentActionResponse | AgentTextResponse;

// ============================================================================
// Safety Constants
// ============================================================================

/** Dangerous JavaScript patterns that should be blocked from runJS action. */
export const DANGEROUS_JS_PATTERNS: string[] = [
  'eval(',
  'Function(',
  '__proto__',
  'import(',
  'fetch(',
  '__lookupGetter__',
  '__lookupSetter__',
  'constructor.constructor',
  'document.write',
  'document.writeln'
];
