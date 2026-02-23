/**
 * agent-prompt.ts - System prompt builder and JSON response parser for the browser agent.
 *
 * Exports:
 * - AGENT_SYSTEM_PROMPT: The complete system prompt sent to the AI model
 * - ToolDefinition interface and TOOL_DEFINITIONS: Structured tool metadata
 * - parseAgentResponse(): Extracts JSON from raw AI text responses
 */

import type { AgentActionResponse, AgentApiResponse, AgentTextResponse } from './agent-types';

// ============================================================================
// Tool Definitions
// ============================================================================

/** Describes a single tool available to the browser agent. */
export interface ToolDefinition {
  name: string;
  description: string;
  params: Record<string, string>; // param name → description
}

/** All 9 tools the browser agent can invoke. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'click',
    description: 'Click an element on the page',
    params: { selector: 'CSS selector of the element to click' }
  },
  {
    name: 'type',
    description: 'Type text into an input field',
    params: {
      selector: 'CSS selector of the input',
      text: 'Text to type',
      clear: 'If "true", clear existing value first'
    }
  },
  {
    name: 'scroll',
    description: 'Scroll the page',
    params: {
      direction: '"up", "down", "left", or "right"',
      amount: 'Pixels to scroll (number)'
    }
  },
  {
    name: 'readText',
    description: 'Read text content from an element or the entire page',
    params: { selector: '(optional) CSS selector. Omit to read full page.' }
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the current page for visual analysis',
    params: {}
  },
  {
    name: 'waitFor',
    description: 'Wait for an element to appear on the page',
    params: {
      selector: 'CSS selector to wait for',
      timeoutMs: '(optional) Max wait time in ms, default 5000, max 10000'
    }
  },
  {
    name: 'navigate',
    description: 'Navigate the browser to a URL',
    params: { url: 'Full URL to navigate to' }
  },
  {
    name: 'runJS',
    description: 'Execute arbitrary JavaScript in the page (always requires approval)',
    params: { code: 'JavaScript code to execute' }
  },
  {
    name: 'done',
    description: 'Signal that the task is complete',
    params: {
      success: '"true" if task succeeded, "false" if it failed',
      message: 'Summary of what was accomplished or why it failed'
    }
  }
];

// ============================================================================
// System Prompt
// ============================================================================

/** The complete system prompt sent to the AI model for browser agent operation. */
export const AGENT_SYSTEM_PROMPT: string = `You are a browser automation agent. You control an embedded web browser to help users accomplish tasks described in natural language. You can observe the page through screenshots and DOM element snapshots, then take actions to interact with it.

AVAILABLE ACTIONS:
You must respond with EXACTLY ONE JSON object per turn. Choose the most appropriate action.

ACTION FORMAT:
{"action": "<action_name>", "params": {<params>}, "reasoning": "<brief explanation>"}

AVAILABLE ACTIONS AND PARAMETERS:

1. click — Click an element
   {"action": "click", "params": {"selector": "CSS selector"}, "reasoning": "..."}

2. type — Type text into an input field
   {"action": "type", "params": {"selector": "CSS selector", "text": "text to type", "clear": true}, "reasoning": "..."}
   Note: "clear" is optional, set to true to clear existing value first

3. scroll — Scroll the page
   {"action": "scroll", "params": {"direction": "down", "amount": 300}, "reasoning": "..."}
   Direction: "up", "down", "left", "right"

4. readText — Read text from an element or the full page
   {"action": "readText", "params": {"selector": "#optional-selector"}, "reasoning": "..."}
   Omit selector to read the entire page body.

5. screenshot — Take a screenshot for visual inspection
   {"action": "screenshot", "params": {}, "reasoning": "..."}

6. waitFor — Wait for an element to appear
   {"action": "waitFor", "params": {"selector": "CSS selector", "timeoutMs": 5000}, "reasoning": "..."}

7. navigate — Navigate to a URL
   {"action": "navigate", "params": {"url": "https://example.com"}, "reasoning": "..."}

8. runJS — Execute custom JavaScript (ALWAYS requires user approval, even in auto mode)
   {"action": "runJS", "params": {"code": "document.title"}, "reasoning": "..."}
   Use sparingly — only when no other action can accomplish the goal.

9. done — Signal task completion
   {"action": "done", "params": {"success": true, "message": "Summary of what was done"}, "reasoning": "Task complete"}

TEXT RESPONSE FORMAT (for conversational replies without browser action):
{"text": "Your response here"}

EXAMPLES:

User: Click the login button
Response: {"action": "click", "params": {"selector": "#login-btn"}, "reasoning": "Clicking the login button as requested"}

User: Fill in the email field with test@example.com
Response: {"action": "type", "params": {"selector": "input[type=email]", "text": "test@example.com", "clear": true}, "reasoning": "Typing email into the email input field"}

User: What's on this page?
Response: {"action": "readText", "params": {}, "reasoning": "Reading full page content to describe what's visible"}

User: I'm done, thanks!
Response: {"action": "done", "params": {"success": true, "message": "Task completed successfully"}, "reasoning": "User indicated the task is complete"}

User: What can you do?
Response: {"text": "I can automate browser interactions on the current page. I can click elements, type text, scroll, read content, take screenshots, wait for elements, navigate to URLs, and execute custom JavaScript. Just describe what you want me to do!"}

IMPORTANT RULES:
1. ALWAYS respond with a single JSON object — never plain text
2. ALWAYS include "reasoning" in action responses explaining your choice
3. Use the DOM element list to find accurate CSS selectors
4. If an action fails, analyze the error and try a different approach
5. Call done() when the user's goal is accomplished or if you cannot proceed
6. runJS ALWAYS requires user approval — the system will pause and ask
7. If you are unsure what to do, use readText or screenshot to get more context
8. Prefer specific selectors (id, name, aria-label) over fragile ones (class, nth-child)`;

// ============================================================================
// Response Parser
// ============================================================================

/**
 * Parse raw AI text into a structured AgentApiResponse.
 *
 * Handles common LLM quirks:
 * - Strips <think>...</think> blocks
 * - Unescapes HTML entities
 * - Removes trailing commas in JSON
 * - Extracts JSON from markdown code fences
 * - Falls back to { text: rawText } if no valid JSON found
 */
export function parseAgentResponse(rawText: string): AgentApiResponse {
  let text = rawText.trim();

  // Strip thinking blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // HTML entity unescape
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Trailing comma cleanup
  text = text.replace(/(,)(\s*[}\]])/g, '$2');

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Find JSON object
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.action && typeof parsed.action === 'string') {
        return parsed as AgentActionResponse;
      }
      if (parsed.text && typeof parsed.text === 'string') {
        return parsed as AgentTextResponse;
      }
    } catch { /* fall through */ }
  }

  return { text: rawText } as AgentTextResponse;
}