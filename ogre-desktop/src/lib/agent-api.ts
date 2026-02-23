/**
 * agent-api.ts - API client for the browser agent feature.
 *
 * Communicates with the local grading server's /api/agent endpoint.
 * Handles request/response formatting and parses various LLM output formats.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getHandshakeToken } from "./provider-sync";
import type {
  AgentApiRequest,
  AgentApiResponse,
  AgentActionResponse,
  AgentTextResponse,
} from "./agent-types";

const SERVER_BASE = "http://localhost:3456";

// ── Auth Helpers ──────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getHandshakeToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Agent API ─────────────────────────────────────────────────────────────

/**
 * Send a request to the agent API endpoint.
 *
 * @param request - Agent request with messages and optional DOM/screenshot
 * @returns Parsed agent response (action or text)
 * @throws Error if the server returns an error or is unreachable
 */
export async function sendAgentRequest(request: AgentApiRequest): Promise<AgentApiResponse> {
  const response = await tauriFetch(`${SERVER_BASE}/api/agent`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorMessage = `Agent request failed (HTTP ${response.status})`;
    try {
      const errorData = await response.json();
      errorMessage = (errorData as { error?: string }).error || errorMessage;
    } catch {
      /* Use status-based message */
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  
  // Handle response based on server format
  if (data.action && typeof data.action === 'string') {
    // Server returned an action response directly
    return data as AgentActionResponse;
  }
  
  if (data.text && typeof data.text === 'string') {
    // Server returned a text response
    return data as AgentTextResponse;
  }
  
  if (data.content && typeof data.content === 'string') {
    // Some models return 'content' field
    return parseAgentResponse(data.content);
  }
  
  // If it's a raw string, parse it
  if (typeof data === 'string') {
    return parseAgentResponse(data);
  }

  // Fallback: treat entire response as text
  return { text: JSON.stringify(data) } as AgentTextResponse;
}

/**
 * Parse an LLM response into an AgentApiResponse.
 *
 * Handles various output formats:
 * - Plain text → AgentTextResponse
 * - JSON object with action field → AgentActionResponse
 * - JSON object with text field → AgentTextResponse
 * - Markdown code fences containing JSON
 * - Model thinking blocks (<!-- /think) that should be stripped
 *
 * @param rawText - Raw response text from the LLM
 * @returns Parsed response object
 */
export function parseAgentResponse(rawText: string): AgentApiResponse {
  // Store original for fallback
  const originalText = rawText;
  
  // Step 1: Normalize whitespace and trim
  let text = rawText.trim();
  
  // Step 2: Strip thinking blocks (some models emit these)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  
  // Also handle HTML-style comment blocks
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  
  // Step 3: HTML entity unescape
  text = text.replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  
  // Step 4: Trailing comma cleanup
  text = text.replace(/,(\s*[}\]])/g, "$1");
  
  // Step 5: Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  
  // Also handle inline code (backticks)
  text = text.replace(/^`+|`+$/g, "");
  
  // Step 6: Try to find and parse JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      
      // Validate: is it an action response?
      if (parsed.action && typeof parsed.action === 'string') {
        // Build params object excluding the action field
        const { action, ...params } = parsed;
        return {
          action,
          params,
          reasoning: parsed.reasoning,
        } as AgentActionResponse;
      }
      
      // Is it a text response?
      if (parsed.text && typeof parsed.text === 'string') {
        return parsed as AgentTextResponse;
      }
    } catch {
      // JSON parse failed — fall through to text fallback
    }
  }
  
  // Step 7: Look for action keyword in the text
  const actionMatch = text.match(/^(click|type|scroll|readText|screenshot|waitFor|navigate|runJS|done)\s*\(/i);
  if (actionMatch) {
    // Try to extract action and params from text format like "click(#selector)"
    const action = actionMatch[1].toLowerCase();
    const paramsStr = text.slice(actionMatch[0].length).replace(/\)?\s*$/, "");
    
    try {
      // Attempt to parse params as JSON
      const params = JSON.parse(`{${paramsStr}}`);
      return { action, params } as AgentActionResponse;
    } catch {
      // Couldn't parse params, return as text
      return { text: originalText } as AgentTextResponse;
    }
  }
  
  // Fallback: treat entire response as plain text
  return { text: originalText } as AgentTextResponse;
}
